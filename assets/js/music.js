/* =========================================================
   壹号栈 YIHAOZHAN · 本地音乐（#/music）
   ---------------------------------------------------------
   为什么单独一个文件：app.js 已经四千多行，播放器又要拖 IndexedDB、
   Media Session 一堆东西，塞进去只会让人不敢碰。挂 window.XYMusic，
   跟 admin.js 一个套路（那边是 window.XY_ADMIN）。

   数据放哪：
   · 歌的**音频本身**存 IndexedDB（localStorage 只有几 MB，一首 mp3 就撑爆）；
   · 播放位置 / 音量 / 循环模式 存 localStorage（小、要同步读）。
   全在本机，不上传、不联网 —— 跟站点其它「本机数据」一个规矩。
   ========================================================= */
window.XYMusic = (function () {
  'use strict';

  var DB_NAME = 'xingyu.music.v1';
  var STORE = 'tracks';
  var STATE_KEY = 'xingyu.music.state.v1';   // 只放轻的东西：音量 / 模式 / 上次那首

  /* ---------- 运行时状态 ---------- */
  var tracks = [];        // [{ id, name, size, type, dur }]  + blob（播放时才取/或随查随带）
  var blobs = {};         // id -> Blob（内存里留一份，省得每次播放都读一次库）
  var urls = {};          // id -> objectURL（同一首反复播不要每次都新建）
  var cur = -1;           // 当前曲目下标，-1 = 没选
  var mode = 'order';     // order 顺序 | one 单曲 | shuffle 随机
  var vol = 0.9;
  var seeking = false;
  var els = null;         // 缓存一下 DOM，绑一次就够
  var audio = null;
  var db = null;
  var fallback = false;   // IndexedDB 用不了（隐私模式）→ 只在内存里待着

  /* ---------- 小工具 ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtTime(sec) {
    if (!isFinite(sec) || sec <= 0) return '0:00';
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function fmtSize(bytes) {
    if (!bytes) return '0 MB';
    var mb = bytes / 1048576;
    return (mb < 1 ? (bytes / 1024).toFixed(0) + ' KB' : mb.toFixed(mb < 10 ? 1 : 0) + ' MB');
  }
  /* 文件名当歌名：去掉扩展名，把下划线换成空格（下载来的歌文件名常常是 歌手_歌名.m4a） */
  function titleOf(f) {
    var n = f.name || '未命名';
    n = n.replace(/\.[a-z0-9]{2,5}$/i, '');
    return n.replace(/[_]+/g, ' ').trim() || '未命名';
  }
  function newId() {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- IndexedDB ---------- */
  function openDB() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('no-idb')); return; }
      var r = window.indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error || new Error('idb-error')); };
    });
  }
  function tx(storeMode, fn) {
    return new Promise(function (res, rej) {
      if (!db) { rej(new Error('no-db')); return; }
      var t = db.transaction(STORE, storeMode);
      var s = t.objectStore(STORE);
      var out = fn(s);
      t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
      t.onerror = function () { rej(t.error); };
      t.onabort = function () { rej(t.error); };
    });
  }
  function dbAll() {
    return new Promise(function (res, rej) {
      if (!db) { res([]); return; }
      var t = db.transaction(STORE, 'readonly');
      var r = t.objectStore(STORE).getAll();
      r.onsuccess = function () { res(r.result || []); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function dbPut(rec) { return tx('readwrite', function (s) { s.put(rec); }); }
  function dbDel(id) { return tx('readwrite', function (s) { s.delete(id); }); }
  function dbClear() { return tx('readwrite', function (s) { s.clear(); }); }

  /* ---------- 播放器 ---------- */
  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = vol;
    audio.addEventListener('timeupdate', function () {
      if (seeking || !els) return;
      paintProgress(audio.currentTime, audio.duration);
    });
    audio.addEventListener('loadedmetadata', function () {
      if (els) paintProgress(audio.currentTime, audio.duration);
      /* 时长可能是这轮才读到的（DB 里存过 0），补写回去 */
      var t = tracks[cur];
      if (t && !t.dur && isFinite(audio.duration)) {
        t.dur = audio.duration;
        dbPut({ id: t.id, name: t.name, size: t.size, type: t.type, dur: t.dur, blob: blobs[t.id] });
        paintStats();
        paintList();
      }
    });
    audio.addEventListener('ended', function () {
      if (mode === 'one') { audio.currentTime = 0; audio.play(); }
      else next(true);
    });
    audio.addEventListener('play', function () { paintPlay(true); });
    audio.addEventListener('pause', function () { paintPlay(false); });
    return audio;
  }

  function urlOf(id) {
    if (urls[id]) return urls[id];
    var b = blobs[id];
    if (!b) return '';
    urls[id] = URL.createObjectURL(b);
    return urls[id];
  }

  function paintProgress(t, d) {
    if (!els) return;
    els.cur.textContent = fmtTime(t);
    els.dur.textContent = fmtTime(d);
    var p = d > 0 ? Math.min(1, t / d) : 0;
    els.fill.style.width = (p * 100) + '%';
    els.knob.style.left = (p * 100) + '%';
  }

  function paintPlay(on) {
    if (!els) return;
    els.play.innerHTML = on ? '<svg viewBox="0 0 24 24"><rect x="7" y="5" width="3.4" height="14" rx="1.2"/><rect x="13.6" y="5" width="3.4" height="14" rx="1.2"/></svg>'
                            : '<svg viewBox="0 0 24 24"><path d="M8 5.5v13c0 .8.9 1.3 1.6.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z"/></svg>';
    els.play.setAttribute('aria-label', on ? '暂停' : '播放');
    els.player.classList.toggle('is-playing', on);
  }

  function paintStats() {
    if (!els) return;
    var total = 0, dur = 0;
    tracks.forEach(function (t) { total += t.size || 0; dur += t.dur || 0; });
    els.count.textContent = String(tracks.length);
    els.size.textContent = total > 0 ? (total / 1048576).toFixed(total > 104857600 ? 0 : 1) : '0';
    els.total.textContent = dur >= 60 ? Math.round(dur / 60) + '′' : (dur > 0 ? '<1′' : '0′');
  }

  function paintCover() {
    if (!els) return;
    var t = tracks[cur];
    var ch = t ? (t.name.trim()[0] || '♪') : '♪';
    els.coverChar.textContent = ch;
    /* 每首换个色相：同一张渐变底，靠 hue-rotate 让列表滚过去时有变化，
       又不会花到抢正文的视线 */
    var h = 0;
    if (t) { for (var i = 0; i < t.id.length; i++) h = (h * 31 + t.id.charCodeAt(i)) % 90; }
    els.cover.style.setProperty('--mu-hue', h + 'deg');
    els.title.textContent = t ? t.name : '还没选歌';
    els.sub.textContent = t
      ? (fmtSize(t.size) + (t.dur ? ' · ' + fmtTime(t.dur) : ''))
      : '下面挑几首本机的歌，或者直接把文件拖进这一页';
    els.player.classList.toggle('is-empty', !t);
  }

  function paintList() {
    if (!els) return;
    if (!tracks.length) {
      els.list.innerHTML = '';
      els.empty.hidden = false;
      return;
    }
    els.empty.hidden = true;
    els.list.innerHTML = tracks.map(function (t, i) {
      return '<div class="mu-item' + (i === cur ? ' is-on' : '') + '" data-i="' + i + '" role="button" tabindex="0">' +
          '<span class="mu-item__idx">' + (i === cur ? '<svg viewBox="0 0 24 24"><path d="M8 5.5v13c0 .8.9 1.3 1.6.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z"/></svg>' : (i + 1)) + '</span>' +
          '<span class="mu-item__body">' +
            '<b>' + esc(t.name) + '</b>' +
            '<span>' + fmtSize(t.size) + (t.dur ? ' · ' + fmtTime(t.dur) : '') + '</span>' +
          '</span>' +
          '<button class="mu-item__del" type="button" data-del="' + t.id + '" title="从曲库移除" aria-label="移除 ' + esc(t.name) + '">✕</button>' +
        '</div>';
    }).join('');
  }

  function paintMode() {
    if (!els) return;
    var label = mode === 'one' ? '单曲' : mode === 'shuffle' ? '随机' : '顺序';
    var icon = mode === 'one' ? '🔂' : mode === 'shuffle' ? '🔀' : '🔁';
    els.mode.textContent = icon + ' ' + label;
    els.mode.title = '循环：' + label + '（点一下换一种）';
  }

  /* 播放第 i 首；autoplay=false 时只装载不播（恢复上次进度用） */
  function play(i, autoplay) {
    if (i < 0 || i >= tracks.length) return;
    var a = ensureAudio();
    if (i !== cur) {
      cur = i;
      var u = urlOf(tracks[i].id);
      if (!u) { toastOnce('这首歌的音频读不出来，可能被浏览器清掉了'); return; }
      a.src = u;
      a.currentTime = 0;
    }
    vol = clampVol(vol);
    a.volume = vol;
    paintCover();
    paintList();
    if (els) els.player.classList.add('has-track');
    if (autoplay !== false) {
      var p = a.play();
      if (p && p.catch) p.catch(function () { /* 自动播放被拦：等用户点播放键 */ });
    }
    setMediaSession();
    saveState();
  }

  function clampVol(v) {
    v = Number(v);
    if (!isFinite(v)) return 0.9;
    return Math.max(0, Math.min(1, v));
  }

  function next() {
    if (!tracks.length) return;
    if (mode === 'shuffle') {
      var r = cur;
      if (tracks.length > 1) while (r === cur) r = Math.floor(Math.random() * tracks.length);
      play(r);
      return;
    }
    play((cur + 1) % tracks.length);
  }
  function prev() {
    if (!tracks.length) return;
    /* 放过 3 秒以上：先回本曲开头，再上一首 —— 跟大部分播放器一个脾气 */
    if (audio && audio.currentTime > 3) { audio.currentTime = 0; return; }
    play((cur - 1 + tracks.length) % tracks.length);
  }

  function setMediaSession() {
    if (!('mediaSession' in navigator) || typeof window.MediaMetadata !== 'function') return;
    var t = tracks[cur];
    if (!t) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: t.name, artist: '当地音乐 · 壹号栈', album: '本机曲库'
      });
      navigator.mediaSession.setActionHandler('play', function () { audio && audio.play(); });
      navigator.mediaSession.setActionHandler('pause', function () { audio && audio.pause(); });
      navigator.mediaSession.setActionHandler('previoustrack', prev);
      navigator.mediaSession.setActionHandler('nexttrack', function () { next(); });
    } catch (e) { /* 老浏览器不认这些 action，忽略 */ }
  }

  /* ---------- 轻状态（音量 / 模式 / 上次那首） ---------- */
  function saveState() {
    try {
      var t = tracks[cur];
      localStorage.setItem(STATE_KEY, JSON.stringify({
        vol: vol, mode: mode,
        id: t ? t.id : '',
        at: audio ? Math.floor(audio.currentTime) : 0
      }));
    } catch (e) {}
  }
  function loadState() {
    try {
      var o = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
      if (o && isFinite(o.vol)) vol = clampVol(o.vol);
      if (o && (o.mode === 'one' || o.mode === 'shuffle' || o.mode === 'order')) mode = o.mode;
      return o || {};
    } catch (e) { return {}; }
  }

  /* ---------- 加歌 ---------- */
  function readDur(file) {
    return new Promise(function (res) {
      var a = document.createElement('audio');
      var u = URL.createObjectURL(file);
      var done = function (d) { URL.revokeObjectURL(u); res(isFinite(d) ? d : 0); };
      a.preload = 'metadata';
      a.onloadedmetadata = function () { done(a.duration); };
      a.onerror = function () { done(0); };
      a.src = u;
      setTimeout(function () { done(a.duration); }, 4000);  // 损坏的文件别把整批卡住
    });
  }

  function addFiles(files) {
    var picked = Array.prototype.slice.call(files || []).filter(function (f) {
      return /^audio\//.test(f.type) || /\.(mp3|m4a|aac|flac|wav|ogg|opus|wma|ape)$/i.test(f.name);
    });
    if (!picked.length) { toastOnce('这些文件里没有能放的音乐（要 mp3 / m4a / flac / wav 这类）'); return; }
    var added = 0;
    /* 一首一首来：读时长要创建 audio 元素，几十首一起开会把内存顶起来 */
    var i = 0;
    (function step() {
      if (i >= picked.length) {
        saveState();
        paintStats(); paintList(); paintCover();
        if (!tracks.length) return;
        if (cur < 0) { play(0, false); }    // 加完先停在第一首，不自动出声
        if (added) toastOnce('已加入 ' + added + ' 首' + (fallback ? '（这次关掉页面就没了）' : ''));
        return;
      }
      var f = picked[i++];
      readDur(f).then(function (d) {
        var rec = { id: newId(), name: titleOf(f), size: f.size, type: f.type, dur: d };
        blobs[rec.id] = f;
        tracks.push(rec);
        added++;
        paintStats(); paintList();
        if (fallback) { step(); return; }
        dbPut({ id: rec.id, name: rec.name, size: rec.size, type: rec.type, dur: rec.dur, blob: f })
          .catch(function () {})
          .then(step);
      });
    })();
  }

  function removeAt(i) {
    var t = tracks[i];
    if (!t) return;
    tracks.splice(i, 1);
    if (blobs[t.id]) delete blobs[t.id];
    if (urls[t.id]) { URL.revokeObjectURL(urls[t.id]); delete urls[t.id]; }
    if (!fallback) dbDel(t.id).catch(function () {});
    if (cur === i) {
      if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
      cur = tracks.length ? Math.min(i, tracks.length - 1) : -1;
      if (cur >= 0) play(cur, false); else { paintCover(); paintProgress(0, 0); paintPlay(false); }
    } else if (cur > i) {
      cur--;
    }
    paintStats(); paintList(); paintCover(); saveState();
  }

  /* ---------- 提示（跟站点 .toast 一套，复用） ---------- */
  var toastTimer = 0;
  function toastOnce(msg) {
    /* 复用站点那一条 #toast（位置、动效都跟全站一致），没有才自己补一个 */
    var box = document.getElementById('toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toast';
      box.className = 'toast';
      document.body.appendChild(box);
    }
    box.textContent = msg;
    box.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.classList.remove('is-on'); }, 2200);
  }

  /* ---------- 页面 HTML ---------- */
  function render() {
    var has = tracks.length > 0;
    return '<section class="page page--music">' +
      '<div class="page-head page-head--share">' +
        '<div class="page-head__main">' +
          '<span class="eyebrow">Music · 音栈</span>' +
          '<h1>本地音乐</h1>' +
          '<p>挑本机的歌来放，不联网、不上传。歌存在这个浏览器里（IndexedDB），下次打开还在 —— ' +
            '换设备或清缓存就没了，重要的歌记得留一份在网盘。<span class="hint-desk">也可以把文件直接拖进这一页。</span></p>' +
        '</div>' +
        '<div class="page-head__side"><div class="head-stats">' +
          '<div class="head-stat"><b id="muCount">' + tracks.length + '</b><span>首</span></div>' +
          '<div class="head-stat"><b id="muSize">0</b><span>MB</span></div>' +
          '<div class="head-stat"><b id="muTotal">0′</b><span>总时长</span></div>' +
        '</div></div>' +
      '</div>' +

      /* 播放器 */
      '<div class="mu-player' + (has ? '' : ' is-empty') + '" id="muPlayer">' +
        '<div class="mu-cover" id="muCover"><span id="muCoverChar">♪</span></div>' +
        '<div class="mu-main">' +
          '<div class="mu-title" id="muTitle">还没选歌</div>' +
          '<div class="mu-sub" id="muSub">下面挑几首本机的歌，或者直接把文件拖进来</div>' +
          '<div class="mu-bar">' +
            '<span class="mu-time" id="muCur">0:00</span>' +
            '<div class="mu-track" id="muTrack"><i id="muFill"></i><b id="muKnob"></b></div>' +
            '<span class="mu-time" id="muDur">0:00</span>' +
          '</div>' +
          '<div class="mu-ctrl">' +
            '<button class="mu-btn" type="button" id="muPrev" aria-label="上一首">' +
              '<svg viewBox="0 0 24 24"><path d="M7 5h2v14H7zM19 5.6v12.8c0 .8-.9 1.2-1.5.8l-8.2-6.4a1 1 0 0 1 0-1.6l8.2-6.4c.6-.4 1.5 0 1.5.8z"/></svg></button>' +
            '<button class="mu-play" type="button" id="muPlay" aria-label="播放">' +
              '<svg viewBox="0 0 24 24"><path d="M8 5.5v13c0 .8.9 1.3 1.6.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z"/></svg></button>' +
            '<button class="mu-btn" type="button" id="muNext" aria-label="下一首">' +
              '<svg viewBox="0 0 24 24"><path d="M15 5h2v14h-2zM5 5.6v12.8c0 .8.9 1.2 1.5.8l8.2-6.4a1 1 0 0 0 0-1.6L6.5 4.8C5.9 4.4 5 4.8 5 5.6z"/></svg></button>' +
            '<button class="mu-mode" type="button" id="muMode">🔁 顺序</button>' +
            '<label class="mu-vol" title="音量">' +
              '<svg viewBox="0 0 24 24"><path d="M4 9.5h3L12 5v14L7 14.5H4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>' +
              '<input type="range" id="muVol" min="0" max="100" step="1" aria-label="音量">' +
            '</label>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* 工具条 */
      '<div class="mu-tools">' +
        '<input id="muFile" type="file" accept="audio/*" multiple hidden>' +
        '<button class="btn btn--primary" type="button" id="muPick">＋ 选歌</button>' +
        '<button class="btn btn--ghost" type="button" id="muClear">清空曲库</button>' +
        '<span class="mu-hint">mp3 / m4a / flac / wav / ogg 都行，一次可以选好几首</span>' +
      '</div>' +

      '<div class="mu-list" id="muList"></div>' +
      '<div class="mu-empty" id="muEmpty"' + (has ? ' hidden' : '') + '>' +
        '<span class="mu-empty__ico">🎧</span>' +
        '<h3>曲库是空的</h3>' +
        '<p>点上面的「选歌」，挑手机或电脑里的音乐文件；桌面上也可以直接把文件拖进来。</p>' +
      '</div>' +
    '</section>';
  }

  /* ---------- 绑定 ---------- */
  function bind(root) {
    var app = root || document;
    els = {
      player: $('#muPlayer', app),
      cover: $('#muCover', app),
      coverChar: $('#muCoverChar', app),
      title: $('#muTitle', app),
      sub: $('#muSub', app),
      cur: $('#muCur', app),
      dur: $('#muDur', app),
      track: $('#muTrack', app),
      fill: $('#muFill', app),
      knob: $('#muKnob', app),
      play: $('#muPlay', app),
      list: $('#muList', app),
      empty: $('#muEmpty', app),
      count: $('#muCount', app),
      size: $('#muSize', app),
      total: $('#muTotal', app),
      mode: $('#muMode', app),
      vol: $('#muVol', app),
      file: $('#muFile', app)
    };
    if (!els.player) return;

    paintStats(); paintList(); paintCover(); paintMode(); paintPlay(audio ? !audio.paused : false);
    if (audio && isFinite(audio.duration)) paintProgress(audio.currentTime, audio.duration);

    els.play.addEventListener('click', function () {
      var a = ensureAudio();
      if (!tracks.length) { $('#muPick', app).click(); return; }
      if (cur < 0) { play(0); return; }
      if (a.paused) { a.play().catch(function () {}); } else { a.pause(); }
    });
    $('#muPrev', app).addEventListener('click', prev);
    $('#muNext', app).addEventListener('click', function () { next(); });
    els.mode.addEventListener('click', function () {
      mode = mode === 'order' ? 'one' : mode === 'one' ? 'shuffle' : 'order';
      paintMode(); saveState();
    });

    $('#muPick', app).addEventListener('click', function () { els.file.click(); });
    els.file.addEventListener('change', function () {
      addFiles(els.file.files);
      els.file.value = '';       // 同一批文件再选一次也要能触发
    });
    $('#muClear', app).addEventListener('click', function () {
      if (!tracks.length) { toastOnce('曲库已经是空的'); return; }
      /* 优先用站点那套确认框（长得一致）；没有就退回浏览器原生 confirm */
      if (window.XY_ASK) {
        window.XY_ASK({
          title: '清空曲库？',
          desc: '会把这 ' + tracks.length + ' 首从本机删掉，' +
                '原始音乐文件还在原来的文件夹里，不受影响。',
          ok: '全清掉',
          onOk: doClear
        });
        return;
      }
      if (!window.confirm('清空曲库里的 ' + tracks.length + ' 首？')) return;
      doClear();
    });

    function doClear() {
      tracks = []; blobs = {}; cur = -1;
      Object.keys(urls).forEach(function (k) { URL.revokeObjectURL(urls[k]); });
      urls = {};
      if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
      if (!fallback) dbClear().catch(function () {});
      paintStats(); paintList(); paintCover(); paintProgress(0, 0); paintPlay(false); saveState();
      toastOnce('曲库已清空');
    }

    /* 列表：点行播放，点 ✕ 移除 */
    els.list.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del) {
        e.stopPropagation();
        var id = del.getAttribute('data-del');
        var i = tracks.findIndex(function (t) { return t.id === id; });
        if (i > -1) removeAt(i);
        return;
      }
      var row = e.target.closest('[data-i]');
      if (!row) return;
      var idx = Number(row.getAttribute('data-i'));
      if (idx === cur) {
        var a = ensureAudio();
        if (a.paused) a.play().catch(function () {}); else a.pause();
      } else {
        play(idx);
      }
    });

    /* 进度条：按下就进入 seeking，松开才真正跳（拖的时候别被 timeupdate 拉回去） */
    var t = els.track;
    function ratioOf(ev) {
      var r = t.getBoundingClientRect();
      var x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      return Math.max(0, Math.min(1, x / r.width));
    }
    function seekTo(ev) {
      if (!audio || !isFinite(audio.duration)) return;
      var p = ratioOf(ev);
      paintProgress(p * audio.duration, audio.duration);
      audio.currentTime = p * audio.duration;
    }
    t.addEventListener('pointerdown', function (ev) {
      if (!tracks.length) return;
      seeking = true;
      t.setPointerCapture && t.setPointerCapture(ev.pointerId);
      seekTo(ev);
      saveState();
    });
    t.addEventListener('pointermove', function (ev) { if (seeking) seekTo(ev); });
    var endSeek = function () { seeking = false; saveState(); };
    t.addEventListener('pointerup', endSeek);
    t.addEventListener('pointercancel', endSeek);

    /* 音量 */
    els.vol.value = String(Math.round(vol * 100));
    els.vol.addEventListener('input', function () {
      vol = clampVol(Number(els.vol.value) / 100);
      ensureAudio().volume = vol;
      saveState();
    });

    /* 拖文件进来 */
    var page = $('.page--music', app) || app;
    ['dragenter', 'dragover'].forEach(function (n) {
      page.addEventListener(n, function (e) {
        if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') < 0) return;
        e.preventDefault();
        page.classList.add('is-drop');
      });
    });
    ['dragleave', 'drop'].forEach(function (n) {
      page.addEventListener(n, function (e) {
        e.preventDefault();
        page.classList.remove('is-drop');
        if (n === 'drop' && e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
      });
    });

    /* 进度条 / 音量条：横着拖是调它，不是切页 —— 掐住 touchstart 别冒泡到
       body 上那套「左右滑动切页」，否则一边调音量一边整页跟着晃 */
    [els.track, els.vol].forEach(function (n) {
      if (!n) return;
      ['touchstart', 'touchmove'].forEach(function (ev) {
        n.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true });
      });
    });

    /* 空格播放/暂停（在输入框里打字别抢）。重复 bind 前先摘掉旧的那份 */
    document.removeEventListener('keydown', onKey);
    document.addEventListener('keydown', onKey);
  }

  function onKey(e) {
    /* 用根节点上的 data-route 判断——app.js 每次渲染都会写它，不用额外暴露什么 */
    if (document.documentElement.getAttribute('data-route') !== 'music') return;
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      if (!tracks.length) return;
      var a = ensureAudio();
      if (a.paused) a.play().catch(function () {}); else a.pause();
    }
  }

  /* ---------- 进出页面 ---------- */
  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    var st = loadState();
    var restoreId = st.id || '';
    openDB().then(function (d) {
      db = d;
      return dbAll();
    }).then(function (rows) {
      rows.sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });
      tracks = rows.map(function (r) {
        if (r.blob) blobs[r.id] = r.blob;
        return { id: r.id, name: r.name, size: r.size, type: r.type, dur: r.dur || 0 };
      });
      afterLoad(restoreId);
    }).catch(function () {
      /* 隐私模式 / 老浏览器：退化成「这次会话里能放」，不拦着用户听歌 */
      fallback = true;
      tracks = [];
      afterLoad('');
    });
  }
  function afterLoad(restoreId) {
    if (restoreId) {
      var i = tracks.findIndex(function (t) { return t.id === restoreId; });
      if (i > -1) cur = i;
    }
    if (cur < 0 && tracks.length) cur = 0;
    paintStats(); paintList(); paintCover(); paintMode();
    if (els) {
      paintStats(); paintList(); paintCover(); paintMode();
      if (els.vol) els.vol.value = String(Math.round(vol * 100));
    }
    /* 恢复上次那首：只装不播（浏览器不许自动出声），位置也接上 */
    if (cur > -1) {
      var a = ensureAudio();
      a.volume = vol;
      var u = urlOf(tracks[cur].id);
      if (u) {
        a.src = u;
        var at = Number(loadState().at) || 0;
        if (at > 0) {
          a.addEventListener('loadedmetadata', function once() {
            a.removeEventListener('loadedmetadata', once);
            if (at < a.duration - 3) a.currentTime = at;
          });
        }
        setMediaSession();
      }
    }
  }

  /* 离开这一页：停声（但进度留着）。由 app.js 每次 render 时调，内部幂等 */
  function leave() {
    /* 先摘监听：哪怕这一页从没播过（audio 还是 null），键盘监听也得收掉 */
    document.removeEventListener('keydown', onKey);
    if (audio && !audio.paused) { saveState(); audio.pause(); }
    /* 下次再进来要重新 bind（DOM 被整页换掉了） */
    if (booted) els = null;
  }

  return {
    render: render,
    bind: function (root) { boot(); bind(root); },
    leave: leave,
    /* 给 ⌘K / 站内搜索用的一句话说明 */
    routes: function () { return ['music']; }
  };
})();
