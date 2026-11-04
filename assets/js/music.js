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
  var tracks = [];        // [{ id, name, size, type, dur, artist, album, lrc, tagged }]
  var blobs = {};         // id -> Blob（内存里留一份，省得每次播放都读一次库）
  var urls = {};          // id -> objectURL（同一首反复播不要每次都新建）
  var covers = {};        // id -> 封面小图 Blob（解析出来顺手留一份）
  var coverUrls = {};     // id -> 封面的 objectURL
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

  /* =====================================================================
     标签解析（零依赖）：mp3 的 ID3v2 / flac 的 VORBIS_COMMENT+PICTURE /
     m4a 的 ilst。要的是三样东西：歌名歌手专辑、内嵌封面、内嵌歌词。
     只读文件头 1MB（有的编码器把 moov 放尾部，读不到再补读尾部），
     绝不整个读进来 —— 1000 多 MB 的曲库不能因为读个封面全塞内存。
     ===================================================================== */
  var HEAD_BYTES = 1024 * 1024;
  var TAIL_BYTES = 512 * 1024;

  function abOf(blob, start, len) { return blob.slice(start, start + len).arrayBuffer(); }
  function u8(buf) { return new Uint8Array(buf); }
  function ascii(b, i, n) {
    var s = '';
    for (var k = 0; k < n; k++) s += String.fromCharCode(b[i + k]);
    return s;
  }
  /* ID3 文本帧的编码字节：0= latin1/GBK 1= UTF-16+BOM 2= UTF-16BE 3= UTF-8 */
  function decodeTag(bytes, enc) {
    try {
      if (enc === 1) {
        if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
        if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
        return new TextDecoder('utf-16le').decode(bytes);
      }
      if (enc === 2) return new TextDecoder('utf-16be').decode(bytes);
      if (enc === 3) return new TextDecoder('utf-8').decode(bytes);
    } catch (e) { /* 往下走兜底 */ }
    /* enc 0 名义上是 latin1，但国内老 mp3 常常直接塞 GBK —— 先当 UTF-8 试，
       不合法再按 GBK 解，最后才退回 latin1 */
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e1) {}
    try { return new TextDecoder('gbk').decode(bytes); } catch (e2) {}
    try { return new TextDecoder('iso-8859-1').decode(bytes); } catch (e3) {}
    return '';
  }
  function clean(s) { return String(s == null ? '' : s).replace(/\u0000+$/g, '').replace(/^\u0000+/, '').trim(); }
  function syncsafe(b, i) {
    return ((b[i] & 0x7f) << 21) | ((b[i + 1] & 0x7f) << 14) | ((b[i + 2] & 0x7f) << 7) | (b[i + 3] & 0x7f);
  }
  /* 一段以 0 结尾的字符串占多少字节（UTF-16 是 2 字节一单位） */
  function strLen(b, pos, enc) {
    var p = pos;
    if (enc === 1 || enc === 2) {
      while (p + 1 < b.length && !(b[p] === 0 && b[p + 1] === 0)) p += 2;
      return p - pos + 2;
    }
    while (p < b.length && b[p] !== 0) p++;
    return p - pos + 1;
  }

  function parseID3(buf) {
    var b = u8(buf);
    if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return null;
    var ver = b[3], flags = b[5];
    var end = Math.min(b.length, 10 + syncsafe(b, 6));
    var pos = 10;
    if (flags & 0x40) {                       // 扩展头，跳过去
      if (ver === 3) pos += 4 + ((b[10] << 24) | (b[11] << 16) | (b[12] << 8) | b[13]);
      else pos += syncsafe(b, 10);
    }
    var out = {};
    while (pos + 10 <= end) {
      var id = ascii(b, pos, 4);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      var fsz = ver === 3
        ? ((b[pos + 4] << 24) | (b[pos + 5] << 16) | (b[pos + 6] << 8) | b[pos + 7])
        : syncsafe(b, pos + 4);
      if (fsz <= 0 || pos + 10 + fsz > end) break;
      var body = b.subarray(pos + 10, pos + 10 + fsz);
      try {
        if (id === 'TIT2') out.title = clean(decodeTag(body.subarray(1), body[0]));
        else if (id === 'TPE1') out.artist = clean(decodeTag(body.subarray(1), body[0]));
        else if (id === 'TALB') out.album = clean(decodeTag(body.subarray(1), body[0]));
        else if (id === 'USLT') {
          var pe = body[0], p2 = 4;                // 编码 + 语言(3)
          p2 += strLen(body, p2, pe);              // 跳过内容描述
          out.lyrics = clean(decodeTag(body.subarray(p2), pe));
        } else if (id === 'TXXX') {
          /* 不是标准的 USLT：ffmpeg 把歌词写成 TXXX（描述「USLT」或「LYRICS」），
             还有些工具描述干脆乱写 —— 所以再看一眼内容像不像 LRC */
          var te = body[0], tp = 1;
          var dl = strLen(body, tp, te);
          var desc = clean(decodeTag(body.subarray(tp, tp + dl), te)).toUpperCase();
          var val = clean(decodeTag(body.subarray(tp + dl), te));
          if (/LYRIC|USLT|UNSYNC/.test(desc) || /^\s*\[\d{1,3}:\d{1,2}/.test(val)) out.lyrics = val;
        } else if (id === 'APIC') {
          var e = body[0], p = 1, me = 1;
          while (me < body.length && body[me] !== 0) me++;
          var mime = decodeTag(body.subarray(p, me), 3) || 'image/jpeg';
          p = me + 1 + 1;                          // + 图片类型 1 字节
          p += strLen(body, p, e);                 // 跳过描述
          if (body.length > p + 16) {
            out.cover = new Blob([body.slice(p)], { type: mime.replace('image/jpg', 'image/jpeg') });
          }
        }
      } catch (e4) { /* 单帧坏了不影响别的帧 */ }
      pos += 10 + fsz;
    }
    return out;
  }

  function parseFLAC(buf) {
    var b = u8(buf), dv = new DataView(buf);
    if (b.length < 8 || b[0] !== 0x66 || b[1] !== 0x4C || b[2] !== 0x61 || b[3] !== 0x43) return null;
    var pos = 4, out = {};
    while (pos + 4 <= b.length) {
      var h = b[pos], last = h & 0x80, type = h & 0x7f;
      var len = (b[pos + 1] << 16) | (b[pos + 2] << 8) | b[pos + 3];
      var p = pos + 4;
      if (p + len > b.length) break;
      try {
        if (type === 4) {                       // VORBIS_COMMENT（小端）
          var q = p;
          var vlen = dv.getUint32(q, true); q += 4 + vlen;
          var n = dv.getUint32(q, true); q += 4;
          for (var i = 0; i < n && q + 4 <= p + len; i++) {
            var l = dv.getUint32(q, true); q += 4;
            if (q + l > p + len) break;
            var s = decodeTag(b.subarray(q, q + l), 3); q += l;
            var eq = s.indexOf('=');
            if (eq < 0) continue;
            var k = s.slice(0, eq).toUpperCase(), v = s.slice(eq + 1);
            if (k === 'TITLE') out.title = clean(v);
            else if (k === 'ARTIST') out.artist = clean(v);
            else if (k === 'ALBUM') out.album = clean(v);
            else if (k === 'LYRICS' || k === 'UNSYNCEDLYRICS') out.lyrics = clean(v);
          }
        } else if (type === 6) {                // PICTURE（大端）
          /* 开头 4 字节是图片类型（0 别的/3 封面…），跳过它才是 mime 长度 */
          var q2 = p + 4;
          var mimeLen = dv.getUint32(q2, false); q2 += 4;
          var mime = decodeTag(b.subarray(q2, q2 + mimeLen), 3) || 'image/jpeg'; q2 += mimeLen;
          var descLen = dv.getUint32(q2, false); q2 += 4 + descLen;
          q2 += 16;                             // 宽 / 高 / 色深 / 索引色数
          var dataLen = dv.getUint32(q2, false); q2 += 4;
          if (dataLen > 0 && q2 + dataLen <= b.length) {
            out.cover = new Blob([b.slice(q2, q2 + dataLen)], { type: mime });
          }
        }
      } catch (e1) { /* 坏块跳过 */ }
      pos = p + len;
      if (last) break;
    }
    return out;
  }

  /* m4a/mp4：不写完整的 atom 树，直接在缓冲里找 '©nam' / 'covr' 这类签名，
     后面紧跟的必须是 'data' 原子 —— 够用，而且不怕 moov 结构有差异 */
  function findMp4Atom(b, sig) {
    var dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    for (var i = 0; i + sig.length + 16 <= b.length; i++) {
      var ok = true;
      for (var j = 0; j < sig.length; j++) { if (b[i + j] !== sig[j]) { ok = false; break; } }
      if (!ok) continue;
      var off = i + sig.length;
      var sz = dv.getUint32(off, false);
      if (sz < 16 || off + sz > b.length) continue;
      if (b[off + 4] !== 0x64 || b[off + 5] !== 0x61 || b[off + 6] !== 0x74 || b[off + 7] !== 0x61) continue;
      return { type: dv.getUint32(off + 8, false), start: off + 16, len: sz - 16 };
    }
    return null;
  }
  function parseMP4(b) {
    var out = {}, a;
    a = findMp4Atom(b, [0xA9, 0x6E, 0x61, 0x6D]);          // ©nam
    if (a) out.title = clean(decodeTag(b.subarray(a.start, a.start + a.len), 3));
    a = findMp4Atom(b, [0xA9, 0x41, 0x52, 0x54]);          // ©ART
    if (a) out.artist = clean(decodeTag(b.subarray(a.start, a.start + a.len), 3));
    a = findMp4Atom(b, [0xA9, 0x61, 0x6C, 0x62]);          // ©alb
    if (a) out.album = clean(decodeTag(b.subarray(a.start, a.start + a.len), 3));
    a = findMp4Atom(b, [0xA9, 0x6C, 0x79, 0x72]);          // ©lyr
    if (a) out.lyrics = clean(decodeTag(b.subarray(a.start, a.start + a.len), 3));
    a = findMp4Atom(b, [0x63, 0x6F, 0x76, 0x72]);          // covr
    if (a && a.len > 200) {
      out.cover = new Blob([b.slice(a.start, a.start + a.len)],
        { type: a.type === 14 ? 'image/png' : 'image/jpeg' });
    }
    return out;
  }

  function mergeTags(a, b) {
    a = a || {}; b = b || {};
    return {
      title: a.title || b.title, artist: a.artist || b.artist, album: a.album || b.album,
      lyrics: a.lyrics || b.lyrics, cover: a.cover || b.cover
    };
  }

  /* 封面缩到 160px 再存：原图动辄 500KB，66 首就是几十 MB，不值当 */
  function shrinkCover(blob) {
    return new Promise(function (res) {
      if (!window.createImageBitmap) { res(blob); return; }
      createImageBitmap(blob).then(function (bmp) {
        var max = 160;
        var r = Math.min(max / bmp.width, max / bmp.height, 1);
        var w = Math.max(1, Math.round(bmp.width * r)), h = Math.max(1, Math.round(bmp.height * r));
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(bmp, 0, 0, w, h);
        if (bmp.close) bmp.close();
        c.toBlob(function (out) { res(out || blob); }, 'image/jpeg', 0.82);
      }).catch(function () { res(blob); });
    });
  }

  function readTags(file) {
    var headLen = Math.min(HEAD_BYTES, file.size);
    return abOf(file, 0, headLen).then(function (head) {
      var b = u8(head), tags = null;
      if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) tags = parseID3(head);
      else if (b[0] === 0x66 && b[1] === 0x4C && b[2] === 0x61 && b[3] === 0x43) tags = parseFLAC(head);
      else if (b.length > 12 && ascii(b, 4, 4) === 'ftyp') tags = parseMP4(b);
      /* 头和尾都要试：m4a 的 moov（含 ilst）有时在文件末尾 */
      var tailP = file.size > headLen
        ? abOf(file, Math.max(0, file.size - TAIL_BYTES), TAIL_BYTES).then(function (tail) {
            var t2 = null;
            try { t2 = parseMP4(u8(tail)); } catch (e) { t2 = null; }
            return t2;
          }).catch(function () { return null; })
        : Promise.resolve(null);
      return tailP.then(function (t2) {
        var all = mergeTags(tags, t2);
        if (!all.cover) return all;
        return shrinkCover(all.cover).then(function (small) { all.cover = small; return all; })
          .catch(function () { return all; });
      });
    }).catch(function () { return {}; });
  }

  /* ---------- LRC ---------- */
  /* [mm:ss.xx] 一行可以有好几个时间戳（副歌），拆成多条 */
  function parseLrc(text) {
    var out = [], re = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var times = [], m;
      re.lastIndex = 0;
      while ((m = re.exec(line))) {
        times.push((+m[1]) * 60 + (+m[2]) + (m[3] ? Number('0.' + m[3]) : 0));
      }
      var s = line.replace(/\[[^\]]*\]/g, '').trim();
      if (!times.length) { if (s) out.push({ t: null, s: s }); return; }
      times.forEach(function (t) { out.push({ t: t, s: s || '♪' }); });
    });
    return out;
  }
  /* 按文件名找歌：先去掉扩展名，再统一小写、去空格 */
  function baseKey(s) {
    return String(s || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/\s+/g, '').toLowerCase();
  }

  /* ---------- 播放器 ---------- */
  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = vol;
    audio.addEventListener('timeupdate', function () {
      if (seeking || !els) return;
      paintProgress(audio.currentTime, audio.duration);
      syncLyrics();                     // 歌词跟着走（没显示歌词时内部直接返回）
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
  function coverUrl(id) {
    if (coverUrls[id]) return coverUrls[id];
    var c = covers[id];
    if (!c) return '';
    coverUrls[id] = URL.createObjectURL(c);
    return coverUrls[id];
  }
  /* 没封面时的色相：同一首永远是同一个颜色 */
  function hueOf(t) {
    var h = 0;
    if (t) for (var i = 0; i < t.id.length; i++) h = (h * 31 + t.id.charCodeAt(i)) % 90;
    return h + 'deg';
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
    els.cover.style.setProperty('--mu-hue', hueOf(t));
    var cu = t ? coverUrl(t.id) : '';
    if (cu) {
      if (els.coverImg.getAttribute('src') !== cu) els.coverImg.setAttribute('src', cu);
      els.cover.classList.add('has-img');
    } else {
      els.cover.classList.remove('has-img');
      els.coverImg.removeAttribute('src');
    }
    els.title.textContent = t ? t.name : '还没选歌';
    els.sub.textContent = t
      ? ([t.artist, fmtSize(t.size), t.dur ? fmtTime(t.dur) : ''].filter(Boolean).join(' · '))
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
      var cu = coverUrl(t.id);
      var ch = esc((t.name || '♪').trim().charAt(0) || '♪');
      var sub = [t.artist, t.dur ? fmtTime(t.dur) : ''].filter(Boolean).join(' · ') || fmtSize(t.size);
      return '<div class="mu-item' + (i === cur ? ' is-on' : '') + '" data-i="' + i + '" role="button" tabindex="0">' +
          '<span class="mu-item__idx">' + (i === cur
            ? '<svg viewBox="0 0 24 24"><path d="M8 5.5v13c0 .8.9 1.3 1.6.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z"/></svg>'
            : (i + 1)) + '</span>' +
          '<span class="mu-item__thumb' + (cu ? ' has-img' : '') + '" style="--mu-hue:' + hueOf(t) + '">' +
            (cu ? '<img src="' + cu + '" alt="" loading="lazy">' : ch) +
          '</span>' +
          '<span class="mu-item__body">' +
            '<b>' + esc(t.name) + '</b>' +
            '<span>' + esc(sub) + (t.lrc ? ' · 词' : '') + '</span>' +
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

  /* ---------- 歌词 ---------- */
  var lyr = { lines: [], cur: -1 };
  function paintLyrics() {
    if (!els) return;
    var t = tracks[cur];
    var text = t && t.lrc ? t.lrc : '';
    lyr.lines = text ? parseLrc(text) : [];
    lyr.cur = -1;
    if (!text) {
      els.lyrics.innerHTML = '<div class="mu-lyr-empty">这首歌还没有歌词。' +
        '带歌词标签的音频会自动显示；也可以把同名的 .lrc 文件一起选进来。</div>';
    } else {
      els.lyrics.innerHTML = lyr.lines.map(function (l, i) {
        return '<div class="mu-lyr-line" data-l="' + i + '">' + esc(l.s) + '</div>';
      }).join('');
      els.lyrics.scrollTop = 0;
    }
    if (els.lyrBtn) {
      els.lyrBtn.hidden = !text;
      els.lyrBtn.classList.toggle('is-on', !els.lyrics.hidden);
      if (!text) els.lyrics.hidden = true;
    }
    syncLyrics(true);
  }
  /* 跟着播放位置高亮当前这句；只有时间轴（LRC）才滚动，纯文本就静静待着 */
  function syncLyrics(force) {
    if (!els || els.lyrics.hidden || !lyr.lines.length) return;
    var a = audio;
    var time = a ? a.currentTime : 0;
    var idx = -1;
    for (var i = 0; i < lyr.lines.length; i++) {
      var t = lyr.lines[i].t;
      if (t == null) continue;
      if (t <= time + 0.25) idx = i; else break;
    }
    if (!force && idx === lyr.cur) return;
    lyr.cur = idx;
    var nodes = els.lyrics.querySelectorAll('.mu-lyr-line');
    for (var k = 0; k < nodes.length; k++) nodes[k].classList.toggle('is-cur', k === idx);
    var hit = idx > -1 ? nodes[idx] : null;
    if (hit) {
      /* 只滚歌词框，别动整页 */
      var top = hit.offsetTop - els.lyrics.clientHeight / 2 + hit.offsetHeight / 2;
      els.lyrics.scrollTop = Math.max(0, top);
    }
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
    paintLyrics();
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

  var AUDIO_RE = /\.(mp3|m4a|aac|flac|wav|ogg|opus|wma|ape)$/i;
  function isAudio(f) { return /^audio\//.test(f.type || '') || AUDIO_RE.test(f.name || ''); }
  function isLrc(f) { return /\.lrc$/i.test(f.name || ''); }

  function addFiles(files) {
    var all = Array.prototype.slice.call(files || []);
    var picked = all.filter(isAudio);
    var lrcFiles = all.filter(function (f) { return !isAudio(f) && isLrc(f); });
    if (!picked.length) {
      if (lrcFiles.length) { attachLrc(lrcFiles); return; }
      toastOnce('这些文件里没有能放的音乐（要 mp3 / m4a / flac / wav 这类）');
      return;
    }
    var added = 0;
    var i = 0;
    /* 一首一首来：读时长要创建 audio 元素，几十首一起开会把内存顶起来 */
    (function step() {
      if (i >= picked.length) {
        saveState();
        paintStats(); paintList(); paintCover();
        if (lrcFiles.length) attachLrc(lrcFiles);     // 同一批里的 .lrc 顺手配上
        if (!tracks.length) return;
        if (cur < 0) { play(0, false); }    // 加完先停在第一首，不自动出声
        if (added) toastOnce('已加入 ' + added + ' 首' + (fallback ? '（这次关掉页面就没了）' : ''));
        return;
      }
      var f = picked[i++];
      Promise.all([readDur(f), readTags(f)]).then(function (r) {
        var dur = r[0], tags = r[1] || {};
        var rec = {
          id: newId(),
          name: clean(tags.title) || titleOf(f),
          fname: f.name || '',
          artist: clean(tags.artist) || '',
          album: clean(tags.album) || '',
          lrc: tags.lyrics || '',
          cover: tags.cover || null,
          tagged: true,
          size: f.size, type: f.type, dur: dur
        };
        blobs[rec.id] = f;
        if (rec.cover) covers[rec.id] = rec.cover;
        tracks.push(rec);
        added++;
        paintStats(); paintList();
        if (fallback) { step(); return; }
        dbPut({ id: rec.id, name: rec.name, fname: rec.fname, artist: rec.artist, album: rec.album,
                lrc: rec.lrc, cover: rec.cover, tagged: true,
                size: rec.size, type: rec.type, dur: rec.dur, blob: f })
          .catch(function () {})
          .then(step);
      });
    })();
  }

  /* .lrc：按文件名找歌（去扩展名、忽略空格大小写），配上就存库 */
  function attachLrc(files) {
    var list = Array.prototype.slice.call(files || []);
    var done = 0, miss = 0;
    var i = 0;
    (function next() {
      if (i >= list.length) {
        paintList();
        if (tracks[cur]) paintLyrics();
        if (done) toastOnce('配上 ' + done + ' 首歌词' + (miss ? '，' + miss + ' 个没找到同名歌曲' : ''));
        else toastOnce('没找到同名歌曲：歌词文件名要和歌名一致');
        return;
      }
      var f = list[i++];
      var key = baseKey(f.name);
      f.text().then(function (text) {
        var t = null;
        for (var k = 0; k < tracks.length; k++) {
          if (baseKey(tracks[k].fname || tracks[k].name) === key ||
              baseKey(tracks[k].name) === key) { t = tracks[k]; break; }
        }
        if (!t) { miss++; next(); return; }
        t.lrc = text;
        done++;
        if (!fallback) {
          dbPut({ id: t.id, name: t.name, fname: t.fname, artist: t.artist, album: t.album,
                  lrc: t.lrc, cover: covers[t.id] || null, tagged: !!t.tagged,
                  size: t.size, type: t.type, dur: t.dur, blob: blobs[t.id] })
            .catch(function () {}).then(next);
          return;
        }
        next();
      }).catch(function () { miss++; next(); });
    })();
  }

  function removeAt(i) {
    var t = tracks[i];
    if (!t) return;
    tracks.splice(i, 1);
    if (blobs[t.id]) delete blobs[t.id];
    if (covers[t.id]) delete covers[t.id];
    if (urls[t.id]) { URL.revokeObjectURL(urls[t.id]); delete urls[t.id]; }
    if (coverUrls[t.id]) { URL.revokeObjectURL(coverUrls[t.id]); delete coverUrls[t.id]; }
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
        '<div class="mu-cover" id="muCover">' +
          '<img id="muCoverImg" alt="">' +
          '<span id="muCoverChar">♪</span>' +
        '</div>' +
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
            '<button class="mu-mode" type="button" id="muLyr" hidden>词</button>' +
            '<label class="mu-vol" title="音量">' +
              '<svg viewBox="0 0 24 24"><path d="M4 9.5h3L12 5v14L7 14.5H4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>' +
              '<input type="range" id="muVol" min="0" max="100" step="1" aria-label="音量">' +
            '</label>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* 歌词（点「词」展开；LRC 有时间轴就跟着唱到哪句亮哪句） */
      '<div class="mu-lyrics" id="muLyrics" hidden></div>' +

      /* 工具条 */
      '<div class="mu-tools">' +
        '<input id="muFile" type="file" accept="audio/*,.lrc" multiple hidden>' +
        '<button class="btn btn--primary" type="button" id="muPick">＋ 选歌</button>' +
        '<button class="btn btn--ghost" type="button" id="muClear">清空曲库</button>' +
        '<span class="mu-hint">mp3 / m4a / flac / wav / ogg 都行，一次可以选好几首；同名的 .lrc 一起选进来就会显示歌词</span>' +
        '<span class="mu-hint" id="muEnrich" hidden></span>' +
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
      coverImg: $('#muCoverImg', app),
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
      file: $('#muFile', app),
      lyrics: $('#muLyrics', app),
      lyrBtn: $('#muLyr', app),
      enrich: $('#muEnrich', app)
    };
    if (!els.player) return;

    paintStats(); paintList(); paintCover(); paintMode(); paintLyrics();
    paintPlay(audio ? !audio.paused : false);
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

    /* 歌词：点「词」展开/收起；点某一句直接跳到那一句（有 LRC 时间轴才有用） */
    els.lyrBtn.addEventListener('click', function () {
      els.lyrics.hidden = !els.lyrics.hidden;
      els.lyrBtn.classList.toggle('is-on', !els.lyrics.hidden);
      if (!els.lyrics.hidden) syncLyrics(true);
    });
    els.lyrics.addEventListener('click', function (e) {
      var line = e.target.closest('[data-l]');
      if (!line || !audio) return;
      var i = Number(line.getAttribute('data-l'));
      var item = lyr.lines[i];
      if (!item || item.t == null) return;
      if (item.t < audio.duration) { seeking = true; audio.currentTime = item.t; seeking = false; }
      syncLyrics(true);
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
      tracks = []; blobs = {}; covers = {}; cur = -1;
      Object.keys(urls).forEach(function (k) { URL.revokeObjectURL(urls[k]); });
      Object.keys(coverUrls).forEach(function (k) { URL.revokeObjectURL(coverUrls[k]); });
      urls = {}; coverUrls = {};
      enrichQ = []; enrichTotal = enrichDone = 0; paintEnrich();
      if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
      if (!fallback) dbClear().catch(function () {});
      paintStats(); paintList(); paintCover(); paintProgress(0, 0); paintPlay(false);
      paintLyrics(); saveState();
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

  /* ---------- 老曲库补标签 ----------
     v149 之前入的库只有文件名和大小，没有封面和歌词。进页面后一台流水线
     一首首读（`tagged` 标记过的跳过），读到就回写库 + 只重画这一屏。 */
  var enrichQ = [], enrichBusy = false, enrichTotal = 0, enrichDone = 0;
  function paintEnrich() {
    if (!els || !els.enrich) return;
    if (!enrichTotal || enrichDone >= enrichTotal) { els.enrich.hidden = true; return; }
    els.enrich.hidden = false;
    els.enrich.textContent = '正在读取封面与歌词 ' + enrichDone + '/' + enrichTotal;
  }
  function enrichStart() {
    enrichQ = [];
    for (var i = 0; i < tracks.length; i++) if (!tracks[i].tagged) enrichQ.push(tracks[i].id);
    enrichTotal = enrichQ.length;
    enrichDone = 0;
    paintEnrich();
    if (enrichQ.length) toastOnce('正在读这 ' + enrichQ.length + ' 首的封面和歌词…');
    enrichNext();
  }
  function enrichNext() {
    if (enrichBusy) return;
    if (!enrichQ.length) { enrichDone = enrichTotal; paintEnrich(); return; }
    var id = enrichQ.shift();
    var t = null, i;
    for (i = 0; i < tracks.length; i++) if (tracks[i].id === id) { t = tracks[i]; break; }
    var src = blobs[id];
    if (!t || !src) { enrichDone++; paintEnrich(); enrichNext(); return; }
    enrichBusy = true;
    readTags(src).then(function (tags) {
      tags = tags || {};
      /* 老歌不改名字（用户可能就认文件名），只补歌手 / 封面 / 歌词 */
      t.artist = tags.artist || t.artist || '';
      t.album = tags.album || t.album || '';
      t.lrc = tags.lyrics || t.lrc || '';
      if (tags.cover) covers[t.id] = tags.cover;
      t.tagged = true;
      if (!fallback) {
        dbPut({ id: t.id, name: t.name, fname: t.fname || '', artist: t.artist, album: t.album,
                lrc: t.lrc, cover: covers[t.id] || null, tagged: true,
                size: t.size, type: t.type, dur: t.dur, blob: src }).catch(function () {});
      }
      enrichDone++;
      paintEnrich();
      paintList();
      if (tracks[cur] && tracks[cur].id === t.id) { paintCover(); paintLyrics(); }
      enrichBusy = false;
      /* 让出主线程一帧，界面上「正在读取 n/N」才走得动 */
      setTimeout(enrichNext, 0);
    }).catch(function () {
      t.tagged = true;
      enrichDone++; paintEnrich();
      enrichBusy = false;
      setTimeout(enrichNext, 0);
    });
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
        if (r.cover) covers[r.id] = r.cover;
        return {
          id: r.id, name: r.name, fname: r.fname || '',
          artist: r.artist || '', album: r.album || '',
          lrc: r.lrc || '', tagged: !!r.tagged,
          size: r.size, type: r.type, dur: r.dur || 0
        };
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
    paintStats(); paintList(); paintCover(); paintMode(); paintLyrics();
    if (els) {
      paintStats(); paintList(); paintCover(); paintMode(); paintLyrics();
      if (els.vol) els.vol.value = String(Math.round(vol * 100));
    }
    enrichStart();
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
    routes: function () { return ['music']; },
    /* 只给 .workbuddy/tests 里的自动化测试用（解析器 / 内存状态），页面代码不碰它 */
    _debug: { readTags: readTags, parseID3: parseID3, parseFLAC: parseFLAC, parseMP4: parseMP4,
      state: function () {
        return tracks.map(function (t) {
          return { name: t.name, id: t.id, cov: !!covers[t.id], url: !!coverUrls[t.id],
                   size: covers[t.id] && covers[t.id].size, tagged: t.tagged, lrc: !!t.lrc };
        });
      } }
  };
})();
