/* =========================================================
   壹号栈 YIHAOZHAN · 应用逻辑
   无框架单页应用：hash 路由 + 模板渲染
   ========================================================= */
(function () {
  'use strict';

  var DATA = window.SITE_DATA || { categories: [], feed: [], entries: [], posts: [] };
  var CATS = DATA.categories, FEED = DATA.feed || [], ENTRIES = DATA.entries;
  var POSTS = DATA.posts || [];
  var MD = window.XYMarkdown || { render: escRaw, plain: escRaw, headings: function () { return []; },
    stats: function () { return { chars: 0, minutes: 1 }; }, fmtChars: function (n) { return n + ' 字'; } };
  function escRaw(s) { return String(s == null ? '' : s); }

  /* ---------- 小工具 ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* 链接要直接进 href：esc() 只挡尖括号，挡不住 javascript: / data: 这类协议。
     正常站点（http/https、站内 #/、相对路径）原样返回；带别的协议一律变 '#'，
     免得后台里手滑粘进来一个 javascript: 就把自己点出脚本。 */
  function hrefOf(u) {
    var s = String(u == null ? '' : u).trim();
    if (!s) return '#';
    if (s.charAt(0) === '#' || s.charAt(0) === '/' || s.charAt(0) === '.') return esc(s);
    if (/^(https?|mailto|tel):/i.test(s)) return esc(s);
    if (/^[a-z][a-z0-9+.\-]*:/i.test(s)) return '#';
    return esc(s);
  }
  /* 把命中的那段字高亮出来（不区分大小写，忽略空格差异已由 norm 处理，
     这里只按原串位置找，找不到就原样返回） */
  function textMarkHtml(text, q) {
    var src = String(text || '');
    var needle = String(q || '').trim();
    if (!needle) return esc(src);
    var i = src.toLowerCase().indexOf(needle.toLowerCase());
    if (i < 0) return esc(src);
    return esc(src.slice(0, i)) + '<mark>' + esc(src.slice(i, i + needle.length)) + '</mark>' + esc(src.slice(i + needle.length));
  }
  function hashHue(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h % 360;
  }
  function firstChar(s) {
    var m = String(s).replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
    return (m.charAt(0) || '★').toUpperCase();
  }
  function glyph(name, size) {
    var hue = hashHue(name);
    var c1 = 'hsl(' + hue + ',74%,58%)';
    var c2 = 'hsl(' + ((hue + 48) % 360) + ',68%,44%)';
    return '<span class="glyph glyph--' + (size || 'md') + '" style="background:linear-gradient(135deg,' + c1 + ',' + c2 + ')">' +
      esc(firstChar(name)) + '</span>';
  }
  /* 分类名前面的 emoji。单独包一层 span：后台「分类图标」一关就整片消失，
     也不会在名字前面留一个没人看得见的空格。 */
  function catIco(icon) {
    var s = String(icon == null ? '' : icon).trim();
    return s ? '<span class="cat-ico" aria-hidden="true">' + esc(s) + '</span>' : '';
  }
  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch (e) { return url; }
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }
  function debounce(fn, ms) {
    var t; return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); };
  }

  /* ---------- 拼音首字母（让中文站名也能用拼音打） ----------
     原理：拿汉字和 23 个「拼音锚点汉字」做 zh-CN 排序比较，落在哪个区间就取那个首字母。
     不引入任何字库，也不联网：知→z、哔→b、网→w、易→y。
     这样输入「zh」能命中「知乎」，「txsp」能命中「腾讯视频」。 */
  var PY_ANCHORS = [
    ['a', '阿'], ['b', '八'], ['c', '嚓'], ['d', '咑'], ['e', '妸'], ['f', '发'],
    ['g', '旮'], ['h', '哈'], ['j', '讥'], ['k', '咔'], ['l', '垃'], ['m', '妈'],
    ['n', '拿'], ['o', '噢'], ['p', '妑'], ['q', '七'], ['r', '呥'], ['s', '仨'],
    ['t', '他'], ['w', '屲'], ['x', '夕'], ['y', '丫'], ['z', '帀']
  ];
  var PY_CACHE = {};
  function pyOfChar(ch) {
    if (PY_CACHE.hasOwnProperty(ch)) return PY_CACHE[ch];
    var out = '';
    if (/[a-z0-9]/i.test(ch)) out = ch.toLowerCase();
    else if (/[\u4e00-\u9fa5]/.test(ch)) {
      for (var i = PY_ANCHORS.length - 1; i >= 0; i--) {
        if (ch.localeCompare(PY_ANCHORS[i][1], 'zh-CN') >= 0) { out = PY_ANCHORS[i][0]; break; }
      }
    }
    PY_CACHE[ch] = out;
    return out;
  }
  function pyInitials(str) {
    var src = String(str || ''), out = '';
    for (var i = 0; i < src.length; i++) out += pyOfChar(src.charAt(i));
    return out;
  }

  /* ---------- 最近访问 / 最常去 ---------- */
  var VISIT_KEY = 'xingyu.visit.v1';
  var VISIT_MAX = 300;
  var visits = loadVisits();
  function loadVisits() {
    try { return JSON.parse(localStorage.getItem(VISIT_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveVisits() {
    try { localStorage.setItem(VISIT_KEY, JSON.stringify(visits)); } catch (e) {}
  }
  /* 点一次站点就记一次：次数用来排「最常去」，时间戳用来排「最近」 */
  function recordVisit(it) {
    if (!it || !it.u || String(it.u).charAt(0) === '#') return;
    var v = visits[it.u] || { n: it.n, u: it.u, d: it.d || '', c: 0, t: 0 };
    v.n = it.n || v.n;
    v.d = it.d || v.d;
    v.c = (v.c || 0) + 1;
    v.t = Date.now();
    visits[it.u] = v;
    // 只留最近的 VISIT_MAX 条，防止 localStorage 无限膨胀
    var keys = Object.keys(visits);
    if (keys.length > VISIT_MAX) {
      keys.sort(function (a, b) { return (visits[a].t || 0) - (visits[b].t || 0); })
        .slice(0, keys.length - VISIT_MAX)
        .forEach(function (k) { delete visits[k]; });
    }
    saveVisits();
  }
  function visitList(kind, n) {
    var arr = Object.keys(visits).map(function (k) { return visits[k]; })
      .filter(function (v) { return v && v.u && v.n; });
    arr.sort(kind === 'top'
      ? function (a, b) { return (b.c || 0) - (a.c || 0) || (b.t || 0) - (a.t || 0); }
      : function (a, b) { return (b.t || 0) - (a.t || 0); });
    return arr.slice(0, n);
  }
  function clearVisits() {
    visits = {};
    saveVisits();
  }

  /* =========================================================
     v139 数据层：稍后读 / 失效标记 / 书签导出
     ---------------------------------------------------------
     三样都只存本机，跟收藏、访问记录一个待遇：
     后台「备份」会一起带走（见 admin.js 的 backupObject / cloudPayload）。
     ========================================================= */

  /* ---- 稍后读：{ u 网址, n 名字, d 简介, t 存的时间, r 读过了吗 } ---- */
  var LATER_KEY = 'xingyu.later.v1';
  var LATER_MAX = 300;
  var later = loadLater();
  function loadLater() {
    try {
      var arr = JSON.parse(localStorage.getItem(LATER_KEY));
      return Array.isArray(arr)
        ? arr.filter(function (x) { return x && typeof x.u === 'string' && x.u; })
        : [];
    } catch (e) { return []; }
  }
  function saveLater() {
    try {
      localStorage.setItem(LATER_KEY, JSON.stringify(later));
      /* 顶栏那枚未读角标跟着一起更新（加/标已读/移除都会走到这儿） */
      if (typeof updateLaterBadge === 'function') updateLaterBadge();
      return true;
    } catch (e) { return false; }
  }
  function isLater(u) {
    for (var i = 0; i < later.length; i++) if (later[i].u === u) return true;
    return false;
  }
  /* 存一条。已经在里面就原样留着（不重复加，也不重置「已读」状态） */
  function addLater(o) {
    if (!o || !o.u) return false;
    if (isLater(o.u)) return false;
    later.unshift({ u: String(o.u), n: String(o.n || hostOf(o.u)), d: String(o.d || ''), t: Date.now(), r: 0 });
    /* 超出上限就从最旧的那头删 —— 有上限才不会把 localStorage 撑爆 */
    if (later.length > LATER_MAX) later = later.slice(0, LATER_MAX);
    saveLater();
    return true;
  }
  function removeLater(u) {
    var n = later.length;
    later = later.filter(function (x) { return x.u !== u; });
    if (later.length !== n) { saveLater(); return true; }
    return false;
  }
  function markLater(u, read) {
    for (var i = 0; i < later.length; i++) {
      if (later[i].u !== u) continue;
      later[i].r = read ? 1 : 0;
      saveLater();
      return true;
    }
    return false;
  }
  function laterUnread() {
    return later.filter(function (x) { return !x.r; }).length;
  }
  /* 顶栏那颗时钟上的小角标：未读几条。0 条就整个不露 */
  function updateLaterBadge() {
    var b = document.getElementById('laterBtn');
    if (!b) return;
    var n = laterUnread();
    var tag = b.querySelector('.icon-btn__n');
    if (tag) {
      tag.textContent = n > 99 ? '99+' : String(n);
      tag.hidden = !n;
    }
    b.setAttribute('aria-label', n ? '稍后读，' + n + ' 条未读' : '稍后读');
    b.classList.toggle('has-new', n > 0);
  }

  /* ---- 失效标记：只存一串网址，卡片据此置灰 ---- */
  var DEAD_KEY = 'xingyu.dead.v1';
  var dead = loadDead();
  function loadDead() {
    try {
      var arr = JSON.parse(localStorage.getItem(DEAD_KEY));
      return Array.isArray(arr) ? arr.filter(function (x) { return typeof x === 'string' && x; }) : [];
    } catch (e) { return []; }
  }
  function saveDead() {
    try { localStorage.setItem(DEAD_KEY, JSON.stringify(dead)); } catch (e) {}
  }
  function isDead(u) { return dead.indexOf(u) > -1; }
  function setDead(u, on) {
    var has = isDead(u);
    if (on && !has) dead.push(String(u));
    else if (!on && has) dead = dead.filter(function (x) { return x !== u; });
    else return false;
    saveDead();
    return true;
  }

  /* ---- 收藏导出成浏览器书签（Netscape bookmark 格式）----
     Chrome / Edge / Safari / Firefox 都能直接导入这个文件。
     按分类分组，导进去之后在书签栏里也是一格一格的，不是一团乱麻。 */
  function bookmarksHtml() {
    var favs = state.fav.slice();
    if (!favs.length) return '';
    var byUrl = {};
    allLinks.forEach(function (l) { byUrl[l.u] = l; });
    var groups = [], gi = {};
    favs.forEach(function (u) {
      var l = byUrl[u] || { n: hostOf(u) || u, u: u, cat: '未分类' };
      var cat = l.cat || '未分类';
      if (!gi[cat]) { gi[cat] = { name: cat, items: [] }; groups.push(gi[cat]); }
      gi[cat].items.push(l);
    });
    var now = Math.floor(Date.now() / 1000);
    var body = groups.map(function (g) {
      return '    <DT><H3 ADD_DATE="' + now + '">' + esc(g.name) + '</H3>\n' +
        '    <DL><p>\n' +
        g.items.map(function (l) {
          return '        <DT><A HREF="' + esc(l.u) + '" ADD_DATE="' + now + '">' + esc(l.n) + '</A>';
        }).join('\n') + '\n' +
        '    </DL><p>';
    }).join('\n');
    return '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n' +
      '<!-- 由壹号栈导出 · ' + new Date().toISOString() + ' -->\n' +
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n' +
      '<TITLE>壹号栈收藏</TITLE>\n' +
      '<H1>壹号栈收藏</H1>\n' +
      '<DL><p>\n' +
      '    <DT><H3 ADD_DATE="' + now + '">壹号栈收藏</H3>\n' +
      '    <DL><p>\n' + body.replace(/^/gm, '    ') + '\n    </DL><p>\n' +
      '</DL><p>\n';
  }
  /* 触发一次浏览器下载。text 内容走 Blob，不占地址栏也不弹新窗口 */
  function downloadText(name, text, mime) {
    try {
      var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 1500);
      return true;
    } catch (e) { return false; }
  }
  function stampName(tag) {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return 'yihaozhan-' + tag + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.html';
  }
  function exportBookmarks() {
    if (!state.fav.length) { toast('还没有收藏任何站点，先右键（手机长按）收藏几个吧'); return; }
    if (!downloadText(stampName('bookmarks'), bookmarksHtml(), 'text/html')) {
      toast('导出失败，换台浏览器再试');
      return;
    }
    toast('📥 已导出 ' + state.fav.length + ' 个收藏，可在浏览器「导入书签」里打开');
  }

  /* ---------- 确认框 ----------
     前端这里自带一份（后台 admin.js 里那份只能在后台用，拿不到）；
     样式复用 style.css 里的 .confirm-mask / .confirm-box，所以长得和后台的确认框一样。
     破坏性操作（目前是「清空访问记录」）都要先过这一关。 */
  function closeConfirm() {
    var m = document.getElementById('xyConfirm');
    if (!m) return;
    if (m._esc) document.removeEventListener('keydown', m._esc);
    if (m._lock) document.body.classList.remove('no-scroll');   /* 只解锁自己加的那层 */
    if (m.parentNode) m.parentNode.removeChild(m);
  }
  function askConfirm(opts, onOk) {
    closeConfirm();
    var mask = document.createElement('div');
    mask.className = 'confirm-mask';
    mask.id = 'xyConfirm';
    mask.innerHTML =
      '<div class="confirm-box" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
        '<div class="confirm-box__icon">' + (opts.icon || '⚠️') + '</div>' +
        '<h3>' + esc(opts.title) + '</h3>' +
        '<p>' + (opts.desc || '') + '</p>' +
        '<div class="confirm-actions">' +
          '<button class="btn btn--ghost" type="button" data-confirm="no">' + esc(opts.cancel || '取消') + '</button>' +
          '<button class="btn btn--danger" type="button" data-confirm="yes">' + esc(opts.ok || '确认') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(mask);
    /* 弹框期间锁住页面滚动（手机端底部 tab 也会自动让位，见 body.no-scroll 那条） */
    mask._lock = !document.body.classList.contains('no-scroll');
    if (mask._lock) document.body.classList.add('no-scroll');
    mask.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-confirm]') : null;
      if (b) {
        var yes = b.getAttribute('data-confirm') === 'yes';
        closeConfirm();
        if (yes && onOk) onOk();
        return;
      }
      if (e.target === mask) closeConfirm();   /* 点遮罩空白处也算取消 */
    });
    mask._esc = function (e) { if (e.key === 'Escape') closeConfirm(); };
    document.addEventListener('keydown', mask._esc);
    setTimeout(function () {
      var c = mask.querySelector('[data-confirm="no"]');   /* 默认焦点落在「取消」上，误触不会删 */
      if (c) c.focus();
    }, 20);
  }

  /* ---------- 图标 ---------- */
  var I = {
    star: '<svg viewBox="0 0 24 24"><path d="M12 3.6l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9z"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5.5 14.5A2 2 0 013.5 12.5v-7A2 2 0 015.5 3.5h7a2 2 0 012 2"/></svg>',
    out:  '<svg viewBox="0 0 24 24"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v4.5A1.5 1.5 0 0117.5 20h-11A1.5 1.5 0 015 18.5v-11A1.5 1.5 0 016.5 6H11"/></svg>',
    arrow:'<svg viewBox="0 0 24 24"><path d="M5 12h13M13 6.5l5.5 5.5L13 17.5"/></svg>',
    shuffle:'<svg viewBox="0 0 24 24"><path d="M16 3.5l4 4-4 4"/><path d="M20 7.5h-3.5c-2 0-3.2 1-4.5 2.6-1.3 1.6-2.5 2.9-4.5 2.9H4"/><path d="M16 12.5l4 4-4 4"/><path d="M4 19.5h3.5c2 0 3.2-1 4.5-2.6"/></svg>',
    pointer:'<svg viewBox="0 0 24 24"><path d="M5 4l14 7-6 1.6L10.5 19z"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3.1 2"/></svg>',
    ban:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.4"/><path d="M6.1 6.1l11.8 11.8"/></svg>',
    leaf:  '<svg viewBox="0 0 24 24"><path d="M20 4.5C10 5 4.5 9 4.5 15.5c0 2 .7 3.5 2 4.5C8 14 12.5 10.5 18.5 9"/><path d="M4.5 20c2-.5 4-1 6-2"/></svg>',
    search:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><path d="M6 9.5l6 6 6-6"/></svg>'
  };

  /* ---------- 状态 ---------- */
  var ROUTES = ['home', 'nav', 'share', 'post'];         // 主导航 / 滑动切换顺序
  /* 全部可路由页面。idea / about / later / insight / tag 不占主导航（tag 是带参数的） */
  var ALL_ROUTES = ['home', 'nav', 'share', 'post', 'idea', 'about', 'later', 'insight', 'tag', 'admin'];

  /* 这两个 key 必须在 state 之前赋值：state 的初始化里会调用 loadFav()，
     var 只提升声明不提升值 —— 放在下面的话那一刻 FAV_KEY 还是 undefined，
     读的就是 localStorage.getItem("undefined")，永远是空数组。
     （曾经就踩过：收藏能写进去，一刷新全没了） */
  var FAV_KEY = 'xingyu.fav.v1';
  var THEME_KEY = 'xingyu.theme.v1';

  var state = {
    route: 'home',
    query: '',
    favOnly: false,
    feedTag: 'all',
    catFilter: '',      // 分类栏筛选词
    recentMode: 'recent', // recent | top —— 最近访问榜的排序方式
    onlyCats: [],       // 只看这几个分类（空 = 全部）；分类栏里勾出来的
    pickMode: false,    // 分类栏是否处于「勾选」模式
    postId: '',         // 正在阅读的文章 id（空 = 文章列表）
    postTag: 'all',     // 文章列表的标签筛选
    tagName: '',        // #/tag/<tag> 落在这个标签上（route==='tag' 时有效）
    adminTab: '',       // #/admin/<tab> 后台当前面板（空 = 用后台自己的默认值）
    ideaTag: 'all',     // 灵感随记的标签筛选
    ideaQ: '',          // 灵感随记的搜索词（paint() 会带上它）
    laterView: 'all',   // 稍后读的分组：all | unread | read
    fav: loadFav()
  };
  function loadFav() {
    try {
      var raw = localStorage.getItem(FAV_KEY);
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(function (x) { return typeof x === 'string' && x; }) : [];
    } catch (e) { return []; }
  }
  function saveFav() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(state.fav)); } catch (e) {}
  }
  function isFav(url) { return state.fav.indexOf(url) > -1; }

  /* 收藏变了：只更新菜单里那一项和顶部计数，不整页重渲。
     导航页一次铺两千多张卡，点一下收藏就重渲一遍太贵；更要紧的是重渲会把
     刚弹出来的右键菜单连卡片一起换掉，第二次点就落空了。 */
  function refreshFavUI(url) {
    var on = isFav(url);
    var nodes = document.querySelectorAll('[data-fav]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.getAttribute('data-fav') !== url) continue;
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (el.classList.contains('card-menu__i')) {
        if (on) el.classList.add('is-on'); else el.classList.remove('is-on');
        var lb = el.querySelector('span');
        if (lb) lb.textContent = on ? '取消收藏' : '收藏';
      }
    }
    var btn = document.getElementById('favToggle');
    if (btn) {
      var n = btn.querySelector('span');
      if (n) n.textContent = state.fav.length;
    }
  }

  function toggleFav(url) {
    var i = state.fav.indexOf(url);
    if (i > -1) { state.fav.splice(i, 1); toast('已取消收藏'); }
    else { state.fav.push(url); toast('已加入收藏 ⭐'); }
    saveFav();
    /* 正在「只看收藏」时列表要真的增删那一张卡，才值得重渲 */
    if (state.favOnly) softRender();
    else refreshFavUI(url);
  }

  var allLinks = [];
  var totalLinks = 0;
  function rebuildIndex() {
    allLinks = [];
    CATS.forEach(function (c) {
      c.links.forEach(function (l) {
        allLinks.push({
          n: l.n, u: l.u, d: l.d, cat: c.name, catId: c.id, icon: c.icon, pin: !!l.pin,
          py: pyInitials(l.n),
          /* 预拼好的可搜索串：站名 + 描述 + 分类名 + 网址。搜索时只做 indexOf，
             不用每次输入都重新拼两千多遍（顶栏搜索是边打字边搜的，这个很关键） */
          hay: norm(l.n + (l.d || '') + c.name + l.u)
        });
      });
    });
    totalLinks = allLinks.length;
  }
  rebuildIndex();
  /* 后台改过站点数据后调用：重新取分类 → 重建索引 */
  function refreshData() {
    CATS = (window.XYStore && window.XYStore.dataCategories()) || DATA.categories;
    rebuildIndex();
    PALETTE_INDEX = buildPaletteIndex();
  }
  /* 后台改过文章后调用 */
  function refreshPosts() {
    POSTS = (window.XYStore && window.XYStore.posts) ? window.XYStore.posts() : (DATA.posts || []);
    PALETTE_INDEX = buildPaletteIndex();
  }
  /* 后台改过分享条目后调用：取最新数据并按日期倒序（同一天保持你排的顺序） */
  function refreshFeed() {
    var list = (window.XYStore && window.XYStore.feed) ? window.XYStore.feed() : (DATA.feed || []);
    FEED = list.slice().sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
    PALETTE_INDEX = buildPaletteIndex();
  }
  /* 一条分享的钥匙：日期 + 标题。首页「今日精选」和后台选择器共用这把钥匙 */
  function feedKey(f) {
    if (window.XYStore && window.XYStore.feedKey) return window.XYStore.feedKey(f);
    f = f || {};
    return String(f.date || '') + '|' + String(f.title || '');
  }

  /* ---------- 索引 / 搜索 ---------- */
  /* 字母按顺序出现即算命中：gh → GitHub，mdn → MDN（只用于 2–5 位的短查询） */
  function isSubseq(q, s) {
    var i = 0, j = 0;
    while (i < q.length && j < s.length) { if (q.charAt(i) === s.charAt(j)) i++; j++; }
    return i === q.length;
  }
  function skeletonHit(q, l) {
    if (q.length < 2 || q.length > 5 || !/^[a-z0-9]+$/.test(q)) return false;
    return isSubseq(q, norm(l.n));
  }

  function matchLink(l, q) {
    if (!q) return true;
    var hay = l.hay || norm(l.n + (l.d || '') + l.cat + l.u);
    if (hay.indexOf(q) > -1) return true;
    // 纯字母 / 数字的查询：再按拼音首字母试一次（zh → 知乎，txsp → 腾讯视频）
    if (/^[a-z0-9]+$/.test(q) && !!l.py && l.py.indexOf(q) > -1) return true;
    return skeletonHit(q, l);
  }
  function searchLinks(q) {
    var n = norm(q);
    var hits = allLinks.filter(function (l) { return matchLink(l, n); });
    if (!n) return hits;
    // 排序：站名命中 > 拼音前缀 > 拼音包含 > 描述/网址命中
    // 否则搜「zh」时 Convertio 会因为网址里有 /zh/ 抢在「知乎」前面
    var score = function (l) {
      if (norm(l.n).indexOf(n) > -1) return 0;
      if (!/^[a-z0-9]+$/.test(n) || !l.py) return skeletonHit(n, l) ? 4 : 3;
      if (l.py.indexOf(n) === 0) return 1;
      if (l.py.indexOf(n) > -1) return 2;
      return skeletonHit(n, l) ? 4 : 3;
    };
    return hits.map(function (l) { return { l: l, s: score(l) }; })
      .sort(function (a, b) { return a.s - b.s; })
      .map(function (x) { return x.l; });
  }

  /* ---------- 渲染：首页 ---------- */
  /* 首页配置（后台可改）；没有 XYStore 时退回内置默认 */
  function homeCfg() {
    if (window.XYStore && window.XYStore.home) return window.XYStore.home();
    return {
      eyebrow: '探索 · 发现 · 记录', titleTop: '欢迎来到', titleMain: '壹号栈',
      descBefore: '一座悬浮在夜色里的',
      descAfter: '。把散落的网址、遇见的工具与闪过的念头，都收进同一间栈房——壹号为栈，随处可归。',
      rotator: ['数字花园', '灵感客栈', '资源航图', '私人书房'],
      cta1Text: '开始探索', cta1Url: '#/nav', cta2Text: '随机漫游',
      badge: '🛰️ 持续更新中', image: '', imageFit: 'cover',
      stats: [
        { auto: 'cats', n: '', s: '主题分类' }, { auto: 'links', n: '', s: '站点坐标' },
        { auto: 'feed', n: '', s: '分享条目' }, { auto: 'days', n: '', s: '成长天数' }
      ],
      entries: ENTRIES,
      featuredTitle: '今日精选', featuredDesc: '这一阵子遇见的好东西，随手记在这里。', featuredCount: 6
    };
  }

  /* 关于页的配置：没有 Store（理论上不会）时给个最小兜底，别让整页空白 */
  function aboutCfg() {
    if (window.XYStore && window.XYStore.about) return window.XYStore.about();
    return {
      eyebrow: 'About · 关于', title: '关于壹号栈',
      lede: '壹号为栈，随处可归的个人数字花园。',
      updated: '', md: '内容还没写。到后台「首页内容 → 关于这一页」补上就行。'
    };
  }

  /* 站外链接加 target=_blank；站内 #/ 原样 */
  function isInternal(u) { return String(u || '').charAt(0) === '#'; }

  /* 建站日期 → 从那天到今天的天数（含今天，按本地时区算整天） */
  function daysSinceStart() {
    var fallback = new Date(2024, 0, 1);
    var s = '';
    try { if (window.XYStore) s = window.XYStore.get().startDate || ''; } catch (e) {}
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
    var start = fallback;
    if (m) {
      var d = new Date(+m[1], +m[2] - 1, +m[3]);
      if (!isNaN(d.getTime())) start = d;
    }
    var now = new Date();
    var a = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    var b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return Math.max(1, Math.floor((b - a) / 86400000) + 1);
  }

  function renderHome() {
    var h = homeCfg();
    if (h.rotator && h.rotator.length) ROTATOR_WORDS = h.rotator.slice(0, 6);
    var days = daysSinceStart();
    var autoMap = { cats: CATS.length, links: totalLinks, feed: FEED.length, days: days, posts: postList().length };

    var statsHtml = (h.stats || []).map(function (t) {
      var raw = t.auto ? (autoMap[t.auto] || 0) : t.n;
      var num = /^\d+$/.test(String(raw == null ? '' : raw).trim()) ? parseInt(raw, 10) : null;
      return '<div class="stat"><b' +
        (num === null ? '' : ' data-count="' + num + '"') + '>' +
        esc(num === null ? (raw || '—') : 0) + '</b><span>' + esc(t.s) + '</span></div>';
    }).join('');

    var entriesHtml = (h.entries || []).map(function (e) {
      var ext = !isInternal(e.route);
      return '<a class="card card--hover bento__item' + (e.wide ? ' bento__item--wide' : '') + '" href="' + hrefOf(e.route) + '"' +
        (ext ? ' target="_blank" rel="noopener"' : '') + '>' +
        (e.spark ? '<span class="bento__spark"></span>' : '') +
        '<span class="bento__icon">' + esc(e.icon) + '</span>' +
        '<h3>' + esc(e.title) + '</h3>' +
        '<p>' + esc(e.desc) + '</p>' +
        '<span class="bento__go">进入 ' + I.arrow + '</span>' +
        '</a>';
    }).join('');

    /* 今日精选：后台勾了哪几条就显示哪几条（按「分享」页的顺序）；
       一条都没勾时，退回"自动取最新 featuredCount 条"。 */
    var picks = (h.featuredPicks || []);
    var featuredList;
    if (picks.length) {
      var byKey = {};
      FEED.forEach(function (f) { byKey[feedKey(f)] = f; });
      featuredList = picks.map(function (k) { return byKey[k]; }).filter(Boolean);
    } else {
      featuredList = FEED.slice(0, Math.max(1, h.featuredCount || 6));
    }

    var featuredHtml = featuredList.map(function (f) {
      var isHash = f.url.charAt(0) === '#';
      return '<a class="card card--hover feature-card" href="' + hrefOf(f.url) + '"' + (isHash ? '' : ' target="_blank" rel="noopener"') + '>' +
        '<span class="feature-card__top"><span class="glyph glyph--sm" style="background:linear-gradient(135deg,rgba(124,156,255,.35),rgba(180,124,255,.3))">' + esc(f.icon) + '</span>' +
        '<h4>' + esc(f.title) + '</h4></span>' +
        '<p>' + esc(f.desc) + '</p>' +
        '<span class="feature-card__meta">📅 ' + esc(f.date) + '</span>' +
        '</a>';
    }).join('');

    /* 勾选的条目全被删掉时会一条不剩：整块收起来，别留个空标题在那 */
    var featuredBlock = featuredHtml
      ? '<div class="featured">' +
          '<div class="section-head"><div><h2>' + esc(h.featuredTitle) + '</h2><p>' + esc(h.featuredDesc) + '</p></div>' +
            '<a class="pill pill--btn" href="#/share">查看全部 ' + I.arrow + '</a></div>' +
          '<div class="track">' + featuredHtml + '</div>' +
        '</div>'
      : '';

    var cta1Ext = !isInternal(h.cta1Url);

    /* 首页大图：形状三档 + 可选点击跳转。
       square 正方形（原来的 300px）｜ wide 长方形（铺满右栏，16:9）｜ auto 跟着图片原始比例走，不裁。
       后台没放图时一律按正方形（内置插画本来就是方的）。 */
    var pShape = (h.image && (h.imageShape === 'wide' || h.imageShape === 'auto')) ? h.imageShape : 'square';
    var pLink = String(h.imageLink || '').trim();
    var pCls = 'hero__portrait' + (h.image ? ' hero__portrait--img' : '') + ' hero__portrait--' + pShape +
               (pLink ? ' hero__portrait--link' : '');
    var portraitInner =
      '<div class="portrait-inner' + (h.image ? ' portrait-inner--img' : '') +
        (pShape === 'auto' ? ' portrait-inner--auto' : '') + '">' +
        (h.image
          ? '<img class="portrait-img" src="' + esc(h.image) + '" alt="" style="object-fit:' + (h.imageFit === 'contain' ? 'contain' : 'cover') + '" />'
          : portraitSvg()) +
      '</div>' +
      (h.badge ? '<span class="portrait-badge">' + esc(h.badge) + '</span>' : '');
    var portraitHtml = pLink
      ? '<a class="' + pCls + '" href="' + hrefOf(pLink) + '"' + (isInternal(pLink) ? '' : ' target="_blank" rel="noopener"') +
        ' aria-label="' + esc(h.titleMain || '首页大图') + '">' + portraitInner + '</a>'
      : '<div class="' + pCls + '">' + portraitInner + '</div>';

    /* 赞助：首页最下面那块小尾巴。
       收款码可以放好几张（支付宝 / 微信 / 云闪付…），每张能单独配名字和跳转；
       一张都没传就摆一个 ☕ 徽章顶着，不至于空一块。
       图 / 链接 / 开关都在后台「首页内容 → 赞助」里改。 */
    var sponsorBlock = '';
    if (h.sponsorOn) {
      var spLink = h.sponsorLink || '';
      var codes = (h.sponsorCodes || []).filter(function (c) { return c && c.src; });
      /* 老配置兼容：只有 sponsorImage 一张图的年代也能照常显示 */
      if (!codes.length && h.sponsorImage) codes = [{ src: h.sponsorImage, label: '', link: spLink }];
      var spMedia;
      if (codes.length) {
        spMedia = '<div class="sponsor__codes">' + codes.map(function (c) {
          var inner = '<img src="' + esc(c.src) + '" alt="' + esc(c.label || '赞助码') + '" loading="lazy" />' +
            (c.label ? '<span class="sponsor__code-label">' + esc(c.label) + '</span>' : '');
          return c.link
            ? '<a class="sponsor__code" href="' + hrefOf(c.link) + '"' +
                (isInternal(c.link) ? '' : ' target="_blank" rel="noopener"') +
                ' title="' + esc(c.label || '扫码支持') + '">' + inner + '</a>'
            : '<span class="sponsor__code" title="' + esc(c.label || '扫码支持') + '">' + inner + '</span>';
        }).join('') + '</div>';
      } else {
        spMedia = '<span class="sponsor__media sponsor__media--none" aria-hidden="true">☕</span>';
      }
      sponsorBlock =
        '<div class="sponsor">' +
          '<div class="sponsor__copy">' +
            '<span class="sponsor__kicker">Support · 赞助</span>' +
            '<h2>' + esc(h.sponsorTitle) + '</h2>' +
            '<p>' + esc(h.sponsorDesc) + '</p>' +
            '<div class="sponsor__foot">' +
              (h.sponsorNote ? '<span class="sponsor__note">' + esc(h.sponsorNote) + '</span>' : '') +
              (spLink ? '<a class="pill pill--btn" href="' + hrefOf(spLink) + '" target="_blank" rel="noopener">' +
                '去支持 ' + I.arrow + '</a>' : '') +
            '</div>' +
          '</div>' +
          spMedia +
        '</div>';
    }

    return '<section class="page">' +
      '<div class="hero">' +
        '<div class="hero__copy">' +
          '<span class="eyebrow">' + esc(h.eyebrow) + '</span>' +
          '<h1 class="hero__title">' +
            '<span class="line">' + esc(h.titleTop) + '</span>' +
            '<span class="line grad-text">' + esc(h.titleMain) + '</span>' +
          '</h1>' +
          '<p class="hero__desc">' + esc(h.descBefore) +
            '<span class="grad-text" style="font-weight:600">' + rotatorHtml() + '</span>' +
            esc(h.descAfter) + '</p>' +
          '<div class="hero__cta">' +
            '<a class="btn btn--primary" href="' + esc(toHref(h.cta1Url)) + '"' +
              (cta1Ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(h.cta1Text) + ' ' + I.arrow + '</a>' +
            '<button class="btn btn--ghost" id="heroRandom" type="button">' + I.shuffle + ' ' + esc(h.cta2Text) + '</button>' +
          '</div>' +
        '</div>' +
        portraitHtml +
      '</div>' +
      (statsHtml ? '<div class="stats">' + statsHtml + '</div>' : '') +
      (entriesHtml ? '<div class="bento">' + entriesHtml + '</div>' : '') +
      featuredBlock +
      sponsorBlock +
    '</section>';
  }

  var ROTATOR_WORDS = ['数字花园', '灵感客栈', '资源航图', '私人书房'];
  var rotatorIndex = 0;
  function rotatorHtml() {
    var w = ROTATOR_WORDS;
    return '<span class="hero__rotator" id="rotator"><span>' + esc(w[rotatorIndex % w.length]) + '</span></span>';
  }
  function startRotator() {
    var el = $('#rotator');
    if (!el) return;
    el.innerHTML = '<span>' + esc(ROTATOR_WORDS[rotatorIndex % ROTATOR_WORDS.length]) + '</span>';
  }
  setInterval(function () {
    var el = $('#rotator');
    if (!el) return;
    rotatorIndex = (rotatorIndex + 1) % ROTATOR_WORDS.length;
    el.innerHTML = '<span>' + esc(ROTATOR_WORDS[rotatorIndex]) + '</span>';
  }, 2800);

  function portraitSvg() {
    return '<svg viewBox="0 0 200 200" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="#7c9cff"/><stop offset=".55" stop-color="#b47cff"/><stop offset="1" stop-color="#4fe3d0"/>' +
        '</linearGradient>' +
        '<radialGradient id="pc" cx="50%" cy="45%" r="60%">' +
          '<stop offset="0" stop-color="#7c9cff" stop-opacity=".55"/><stop offset="1" stop-color="#b47cff" stop-opacity="0"/>' +
        '</radialGradient>' +
      '</defs>' +
      '<circle cx="100" cy="100" r="66" fill="url(#pc)"/>' +
      '<circle cx="100" cy="100" r="70" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1"/>' +
      '<ellipse cx="100" cy="100" rx="88" ry="30" fill="none" stroke="rgba(124,156,255,.5)" stroke-width="1.4" transform="rotate(-22 100 100)"/>' +
      '<ellipse cx="100" cy="100" rx="88" ry="30" fill="none" stroke="rgba(79,227,208,.38)" stroke-width="1.2" transform="rotate(28 100 100)"/>' +
      '<path d="M100 46l11 32 34 11-34 11-11 33-11-33-34-11 34-11z" fill="url(#pg)"/>' +
      '<circle cx="100" cy="100" r="6" fill="#fff" opacity=".92"/>' +
      '<circle cx="176" cy="70" r="4" fill="#b47cff"/>' +
      '<circle cx="26" cy="132" r="3.2" fill="#4fe3d0"/>' +
      '<circle cx="150" cy="168" r="2.6" fill="#7c9cff"/>' +
    '</svg>';
  }

  /* ---------- 渲染：导航 ---------- */
  /* 置顶的排在前面（稳定排序，其余保持原顺序） */
  function sortPinned(list) {
    return list.slice().sort(function (a, b) { return (b.pin ? 1 : 0) - (a.pin ? 1 : 0); });
  }

  /* 站内路由（#/xxx）不要 target="_blank"：那会把「万物归一 → 灵感随记」甩到新标签页去。
     外部链接照旧新开。 */
  function blankAttr(u) {
    return String(u == null ? '' : u).charAt(0) === '#' ? '' : ' target="_blank" rel="noopener"';
  }

  function linkCard(l) {
    /* v139：标过失效的站点整卡置灰 + 名字划一道，不再抢视线；
       不额外塞节点，免得手机上「卡片宽度=文字宽度」的规则被撑开 */
    var d = isDead(l.u);
    return '<a class="link-card' + (l.pin ? ' is-pinned' : '') + (d ? ' is-dead' : '') + '" href="' + hrefOf(l.u) + '"' + blankAttr(l.u) +
      ' data-n="' + esc(l.n) + '" data-u="' + esc(l.u) + '" data-d="' + esc(l.d || '') + '"' +
      (d ? ' title="已标记失效：' + esc(l.n) + '"' : '') + '>' +
      glyph(l.n, 'sm') +
      '<span class="link-card__body">' +
        '<span class="link-card__name"><span class="link-card__nmtxt">' + esc(l.n) + '</span>' +
          (l.pin ? '<i class="pin" aria-label="置顶" title="置顶">📌</i>' : '') + '</span>' +
        '<span class="link-card__desc">' + esc(l.d || hostOf(l.u)) + '</span>' +
      '</span>' +
      '</a>';
  }

  /* 最近访问 / 最常去 —— 有记录才出现 */
  function recentBlockHtml() {
    var list = visitList(state.recentMode === 'top' ? 'top' : 'recent', 10);
    if (!list.length) return '';
    var chips = list.map(function (v) {
      var badge = state.recentMode === 'top' && v.c > 1 ? '<i class="recent-chip__n">' + v.c + '</i>' : '';
      return '<a class="recent-chip" href="' + hrefOf(v.u) + '"' + blankAttr(v.u) +
        ' data-n="' + esc(v.n) + '" data-u="' + esc(v.u) + '" data-d="' + esc(v.d || '') + '"' +
        ' title="' + esc(v.n + (v.d ? ' · ' + v.d : '')) + '">' +
        '<span class="recent-chip__name">' + esc(v.n) + '</span>' + badge + '</a>';
    }).join('');
    var isTop = state.recentMode === 'top';
    return '<div class="recent">' +
        '<div class="recent__head">' +
          '<h2>' + (isTop ? '最常去' : '最近访问') + '</h2>' +
          '<span class="count">' + (isTop ? '按点击次数排' : '按最近的顺序排') + '</span>' +
          '<span class="recent__ops">' +
            '<button class="pill pill--btn" type="button" id="recentModeBtn">' +
              (isTop ? '↺ 看最近的' : '🔥 看最常去') + '</button>' +
            '<button class="recent__clear" type="button" id="recentClear" title="清空访问记录">清空</button>' +
          '</span>' +
        '</div>' +
        '<div class="recent__rail">' + chips + '</div>' +
      '</div>';
  }

  /* 一个分类块（标题 + 一排卡片）。抽出来是因为「只看几个分类」时
     要单独重绘正文，不想再走整页 renderNav */
  function catBlockHtml(c) {
    var sorted = sortPinned(c.links);
    var cards = sorted.map(function (l) { return linkCard({ n: l.n, u: l.u, d: l.d, pin: l.pin }); }).join('');
    /* 全部铺出来，不再折叠。视口外的分类块交给 CSS 的 content-visibility 跳过
       布局与绘制（见 .cat-block），所以要一口气放两万多张卡也不至于卡 */
    return '<div class="cat-block" id="cat-' + esc(c.id) + '" data-cat-block="' + esc(c.id) + '">' +
      '<div class="cat-block__head"><h2>' + catIco(c.icon) + esc(c.name) + '</h2>' +
        '<span class="count">' + c.links.length + ' 个站点 · ' + esc(c.desc) + '</span></div>' +
      '<div class="link-grid" data-grid="' + esc(c.id) + '">' + cards + '</div>' +
      '</div>';
  }

  function renderNav(recentHtml) {
    var q = state.query;
    var searching = !!norm(q) || state.favOnly;
    var results = searching
      ? sortPinned(searchLinks(q).filter(function (l) { return !state.favOnly || isFav(l.u); }))
      : [];

    /* 只看某几个分类：分类栏里勾出来的那几个，其余整块不渲染 */
    var only = state.onlyCats;
    var shownCats = only.length
      ? CATS.filter(function (c) { return only.indexOf(c.id) > -1; })
      : CATS;
    var shownLinks = 0;
    shownCats.forEach(function (c) { shownLinks += c.links.length; });

    var meta = searching
      ? '找到 <b>' + results.length + '</b> 个站点' + (norm(q) ? ' · “' + esc(q.trim()) + '”' : '')
      : only.length
        ? '只看 <b>' + only.length + '</b> 个分类 · <b>' + shownLinks + '</b> 个站点'
        : '共 <b>' + totalLinks + '</b> 个站点 · <b>' + CATS.length + '</b> 个分类';
    var head = navHead(meta);

    var body;
    if (searching) {
      body =
        '<div class="cat-block">' +
          '<div class="cat-block__head"><h2>' + (state.favOnly && !norm(q) ? '我的收藏' : '搜索结果') + '</h2>' +
            '<span class="count">' + results.length + ' 个站点</span></div>' +
          (results.length
            ? '<div class="link-grid">' + results.map(linkCard).join('') + '</div>'
            : (state.favOnly && !norm(q)
                ? emptyHtml('⭐', '还没有收藏任何站点',
                    '在任意站点卡片上点右键（手机上长按），选「收藏」，它就会住进这里。收藏存在这台浏览器里 —— 换设备、清缓存之前，到后台「备份」导一份带走就行。')
                : emptyHtml('🔍', '没有找到相关站点', '换个关键词试试，或清空搜索查看全部。'))) +
        '</div>';
      return '<section class="page">' + head +
        '<div class="nav-layout nav-layout--solo"><div class="nav-body">' + body + '</div></div></section>';
    }

    var chips = CATS.map(function (c) {
      // 供分类栏筛选使用：名字 + 图标 + 描述都能命中
      var hay = norm(c.name + c.icon + ' ' + (c.desc || ''));
      var picked = only.indexOf(c.id) > -1;
      return '<button class="cat-item' + (picked ? ' is-picked' : '') + '" type="button" ' +
        'data-cat="' + esc(c.id) + '" data-search="' + esc(hay) + '"' +
        (state.pickMode ? ' aria-pressed="' + picked + '"' : '') + '>' +
        '<span class="cat-item__name">' + catIco(c.icon) + esc(c.name) + '</span>' +
        '<span class="cat-item__count">' + c.links.length + '</span>' +
        '</button>';
    }).join('');

    var rail =
      '<aside class="cat-rail' + (state.pickMode ? ' is-pick' : '') + '" id="catRail">' +
        '<div class="cat-rail__head">' +
          '<p class="cat-rail__title">主题分类<span class="cat-rail__n">' + CATS.length + '</span></p>' +
          '<button class="cat-pick' + (state.pickMode ? ' is-on' : '') + '" type="button" ' +
            'id="catPickToggle" aria-pressed="' + state.pickMode + '" ' +
            'title="勾几个分类，只看它们">' +
            (state.pickMode ? (only.length ? '只看 ' + only.length + ' 类' : '勾选分类') : '只看') +
          '</button>' +
        '</div>' +
        '<div class="cat-rail__scrim" id="catRailScrim"></div>' +
        '<div class="cat-rail__sheet" id="catRailSheet">' +
          '<span class="cat-rail__bar"></span>' +
          '<div class="cat-rail__sheethead">' +
            '<b>选择分类</b>' +
            '<span class="cat-rail__n">' + CATS.length + '</span>' +
            '<button class="cat-rail__x" type="button" id="catRailClose" aria-label="关闭">' +
              '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
            '</button>' +
          '</div>' +
          (CATS.length >= 9
            ? '<div class="cat-filter">' + I.search +
                '<input id="catFilter" type="search" autocomplete="off" spellcheck="false" ' +
                  'placeholder="筛选分类" aria-label="筛选分类" value="' + esc(state.catFilter) + '">' +
              '</div>'
            : '') +
          '<div class="cat-rail__list" id="catRailList">' + chips +
            '<p class="cat-filter__empty" id="catFilterEmpty" hidden>没有匹配的分类</p>' +
          '</div>' +
        '</div>' +
      '</aside>';

    var blocks = shownCats.map(catBlockHtml).join('');

    /* 标题区（head）放进 .nav-layout 里，交给 CSS grid 摆到右侧内容栏顶端 ——
       这样它跟卡片的左边缘对齐，左边那列空出来的位置正好让分类栏顶上去。
       DOM 顺序保持 head → 分类栏 → 正文：读屏和手机端仍是「先标题后内容」。 */
    return '<section class="page">' +
      '<div class="nav-layout">' + head + rail +
        '<div class="nav-body">' + (recentHtml === undefined ? recentBlockHtml() : recentHtml) + blocks + '</div>' +
      '</div></section>';
  }

  /* 导航页是全站最重的一页（50 类 / 2078 张卡片），光拼字符串就要几十毫秒。
     左右划回来这种「状态没变」的重进没必要再算一遍 —— 用一条缓存接住。
     key 里放齐所有影响输出的东西：搜索词、只看收藏、分类筛选、收藏列表、
     置顶情况、最近访问那一块。任何一项变了 key 就变，自然失效，不用手动清。 */
  var navMemo = null;
  function navStateKey(recentHtml) {
    var pins = 0;
    for (var i = 0; i < CATS.length; i++) {
      var ls = CATS[i].links;
      for (var j = 0; j < ls.length; j++) if (ls[j].pin) pins++;
    }
    return [state.query, state.favOnly ? 1 : 0, state.catFilter, state.fav.join(','),
            state.pickMode ? 1 : 0, state.onlyCats.join(','),
            pins, recentHtml].join('\u0001');
  }
  function renderNavCached() {
    var recent = recentBlockHtml();                // 很小，先算出来，顺手塞进 key
    var key = navStateKey(recent);
    if (navMemo && navMemo.k === key) return navMemo.html;
    var html = renderNav(recent);
    navMemo = { k: key, html: html };
    return html;
  }
  /* 空闲时先把导航页备好：这样第一次左右划到导航页也是"秒出" */
  function warmNav() {
    if (navMemo) return;
    var run = function () { if (!navMemo) renderNavCached(); };
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 2500 });
    else setTimeout(run, 1200);
  }

  /* ---------- 只看某几个分类 ----------
     勾选时**不整页重绘**：手机端分类是底部弹层，重绘会把它关掉。
     这里只换正文（.nav-body）+ 改勾选态 + 更新顶部那行数字。 */
  function applyOnlyCats() {
    var only = state.onlyCats;
    var shown = only.length
      ? CATS.filter(function (c) { return only.indexOf(c.id) > -1; })
      : CATS;

    var body = $('.nav-body');
    if (body) body.innerHTML = recentBlockHtml() + shown.map(catBlockHtml).join('');

    $$('.cat-item').forEach(function (b) {
      var on = only.indexOf(b.getAttribute('data-cat')) > -1;
      b.classList.toggle('is-picked', on);
      if (state.pickMode) b.setAttribute('aria-pressed', on);
    });

    var pick = $('#catPickToggle');
    if (pick) pick.textContent = only.length ? '只看 ' + only.length + ' 类' : '勾选分类';

    var meta = $('.nav-meta');
    if (meta) {
      var n = 0;
      shown.forEach(function (c) { n += c.links.length; });
      meta.innerHTML = only.length
        ? '只看 <b>' + only.length + '</b> 个分类 · <b>' + n + '</b> 个站点'
        : '共 <b>' + totalLinks + '</b> 个站点 · <b>' + CATS.length + '</b> 个分类';
    }

    navMemo = null;    // 缓存作废，下次切回来按新状态重算
    setupSpy();        // 分类块换了一批，滚动联动的观察目标也要换
    if (meta) syncCatBtn(null);
  }

  function navHead(meta) {
    return '<div class="page-head page-head--nav">' +
      '<div class="page-head__main">' +
        '<span class="eyebrow">Navigation · 航图</span>' +
        '<h1>壹号栈导航</h1>' +
        '<p>攒了多年的老书签全收在这一页 —— 共 <b>' + CATS.length + '</b> 类、<b>' + totalLinks + '</b> 个坐标。' +
          '顶部搜索框随时筛，按 <kbd style="font-family:inherit;padding:1px 6px;border:1px solid var(--border);border-radius:6px;font-size:12px">⌘K</kbd> 一键盘点。' +
          /* 卡片上没有按钮了，收藏 / 复制靠右键（手机长按），这里提示一句，别让人找不着 */
          '<span class="hint-desk">在卡片上<b>点右键</b>可以收藏或复制链接。</span>' +
          '<span class="hint-touch">在卡片上<b>长按</b>可以收藏或复制链接。</span></p>' +
      '</div>' +
      '<div class="page-head__side">' +
        '<span class="nav-meta">' + (meta || '') + '</span>' +
        '<button class="pill pill--btn head-toggle" type="button" id="favToggle" aria-pressed="' + state.favOnly + '">' +
          I.star + ' 只看收藏 <span style="opacity:.85">' + state.fav.length + '</span></button>' +
        /* v139：只在「只看收藏」时露出来 —— 一键把收藏导成浏览器书签文件 */
        (state.favOnly && state.fav.length
          ? '<button class="pill pill--btn head-toggle" type="button" id="favExport" ' +
            'title="导出成 bookmarks.html，可在 Chrome / Edge / Safari 里导入">📥 导出书签</button>'
          : '') +
      '</div>' +
      '</div>';
  }

  function emptyHtml(emoji, title, desc) {
    return '<div class="empty"><span class="empty__emoji">' + emoji + '</span>' +
      '<h3>' + esc(title) + '</h3><p>' + esc(desc) + '</p></div>';
  }

  /* ---------- 渲染：分享 ---------- */
  var WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  function weekdayOf(dateStr) {
    var p = String(dateStr || '').split('-');
    if (p.length !== 3) return '';
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d.getTime()) ? '' : WEEKDAYS[d.getDay()];
  }

  /* v140：分享条目的链接有时候是空的，或者只写了个 '#'、一条相对路径 ——
     以前一律当链接渲染，点下去等于把页面滚回顶部（还带个 ↗ 图标骗人）。
     这里统一判一次：站内 #/xxx 算有效，http(s) 算有效，其余都不当链接。 */
  function feedUrlOk(u) {
    var s = String(u == null ? '' : u).trim();
    if (!s) return false;
    if (s.charAt(0) === '#') return s.length > 2;      // 光一个 '#' 是「没有链接」
    return /^https?:\/\//i.test(s);
  }

  function feedCardHtml(f) {
    var url = String(f.url == null ? '' : f.url);
    var ok = feedUrlOk(url);
    var isHash = ok && url.charAt(0) === '#';
    var inner =
      '<span class="feed-card__body">' +
        '<span class="feed-card__title">' + esc(f.title) + (ok && !isHash ? ' ' + I.out : '') + '</span>' +
        '<p class="feed-card__desc">' + esc(f.desc) + '</p>' +
        '<span class="feed-card__tags">' + (f.tags || []).map(function (t) {
          return '<span class="tag" data-tag="' + esc(t) + '">#' + esc(t) + '</span>';
        }).join('') + '</span>' +
      '</span>';
    /* 没有可用的链接就渲染成不可点的卡片（外观不变，只是不跳转） */
    if (!ok) return '<div class="feed-card feed-card--nolink">' + inner + '</div>';
    return '<a class="feed-card" href="' + hrefOf(url) + '"' + (isHash ? '' : ' target="_blank" rel="noopener"') + '>' +
      inner + '</a>';
  }

  /* 标签筛选栏（分享页 / 文章列表共用一套）
     宽屏是一条铺在标题下的横条；窄屏（≤960）收进顶栏「标签」按钮 + 底部面板。
     两个页面用各自的 data 属性（data-tag / data-post-tag），筛选状态互不干扰。 */
  function tagRailHtml(cfg) {
    var chipHtml = cfg.tags.map(function (t) {
      var label = t === 'all' ? '全部' : t;
      return '<button class="tag' + (cfg.current === t ? ' is-active' : '') +
        '" type="button" ' + cfg.attr + '="' + esc(t) + '">' + esc(label) + '</button>';
    }).join('');
    return '<div class="tag-rail" id="tagRail">' +
        '<div class="tag-rail__scrim" id="tagRailScrim"></div>' +
        '<div class="tag-rail__sheet" id="tagSheet">' +
          '<span class="tag-rail__bar"></span>' +
          '<div class="tag-rail__head">' +
            '<b>按标签筛选</b>' +
            '<span class="tag-rail__n">' + Math.max(0, cfg.tags.length - 1) + ' 个</span>' +
            '<button class="tag-rail__x" type="button" id="tagSheetClose" aria-label="关闭">' +
              '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
            '</button>' +
          '</div>' +
          '<div class="tag-bar" id="tagBar">' +
            '<span class="tag-bar__lead" aria-hidden="true">标签</span>' +
            '<div class="tag-bar__chips">' + chipHtml + '</div>' +
            cfg.stat +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* =========================================================
     v139：那年今日（分享页顶部一条）
     ---------------------------------------------------------
     按「月-日」把往年同一天的分享和灵感捞出来 —— 这东西平时想不起来翻，
     摆在今天这一页最上面才有人看。往年一条都没有就整块不渲染（不留空壳），
     今天自己写过的退而显示「就是今天」。
     ========================================================= */
  function otdExcerpt(s, n) {
    var t = String(s || '').replace(/[#>*`_\-|]/g, ' ').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  }
  function onThisDayHtml() {
    var now = new Date();
    var mmdd = p2(now.getMonth() + 1) + '-' + p2(now.getDate());
    var y = now.getFullYear();
    var hits = [];
    FEED.forEach(function (f) {
      var d = String(f.date || '');
      if (d.length < 10 || d.slice(5) !== mmdd) return;
      hits.push({ y: parseInt(d.slice(0, 4), 10) || 0, f: f });
    });
    loadIdeas().forEach(function (it) {
      if (!it.ts) return;
      var d = new Date(it.ts);
      if (p2(d.getMonth() + 1) + '-' + p2(d.getDate()) !== mmdd) return;
      hits.push({ y: d.getFullYear(), it: it });
    });
    if (!hits.length) return '';
    var past = hits.filter(function (h) { return h.y < y; });
    var isPast = past.length > 0;
    var use = (isPast ? past : hits).sort(function (a, b) { return b.y - a.y; }).slice(0, 3);
    var cards = use.map(function (h) {
      var yr = '<b class="otd-card__y">' + h.y + '</b>';
      if (h.f) {
        var ext = String(h.f.url || '').charAt(0) !== '#';
        return '<a class="otd-card" href="' + hrefOf(h.f.url) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' +
            yr + '<span class="otd-card__t">' + esc(h.f.icon || '') + ' ' + esc(h.f.title) + '</span>' +
            '<em class="otd-card__d">' + esc(otdExcerpt(h.f.desc, 64)) + '</em>' +
          '</a>';
      }
      var tg = (h.it.tags || [])[0];
      return '<a class="otd-card otd-card--idea" href="#/idea">' +
          yr + '<span class="otd-card__t">💡 ' + (tg ? '#' + esc(tg) : '那天记的一条') + '</span>' +
          '<em class="otd-card__d">' + esc(otdExcerpt(ideaBody(h.it.text), 64)) + '</em>' +
        '</a>';
    }).join('');
    return '<div class="otd">' +
        '<div class="otd__head">' +
          '<span class="otd__k">那年今日</span>' +
          '<span class="otd__d">' + (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日 · ' +
            (isPast ? use.length + ' 条往事' : '就是今天') + '</span>' +
        '</div>' +
        /* 几列由条数决定（--otd-n）：只有一条时它就铺满整条，
           不会右边空出一大片 —— 卡片宽度按等分算，不用横向滚动 */
        '<div class="otd__rail" style="--otd-n:' + use.length + '">' + cards + '</div>' +
      '</div>';
  }

  function renderShare() {
    var tags = ['all'];
    var dateSet = {};
    FEED.forEach(function (f) {
      (f.tags || []).forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); });
      if (f.date) dateSet[f.date] = 1;
    });

    var items = FEED.filter(function (f) {
      return state.feedTag === 'all' || (f.tags || []).indexOf(state.feedTag) > -1;
    });

    /* 筛选条右侧的实时计数：点了标签立刻知道筛出多少条。
       v139：选中了某个标签时，多一颗「↗ 标签页」—— 那是一个能直接发给别人的链接 */
    var statHtml = '<span class="tag-bar__stat">' +
        (state.feedTag === 'all'
          ? '共 <b>' + FEED.length + '</b> 条'
          : '<b>#' + esc(state.feedTag) + '</b> · <b>' + items.length + '</b> 条' +
            '<a class="tag-bar__link" href="#/tag/' + encodeURIComponent(state.feedTag) + '" title="打开这个标签的独立页面">↗ 标签页</a>') +
      '</span>';

    /* 宽屏直接铺在标题下；窄屏（≤960）变成顶栏「标签」按钮 + 底部面板 */
    var tagBar = tagRailHtml({
      attr: 'data-tag', current: state.feedTag, tags: tags, stat: statHtml
    });

    /* 标题右侧的概览数字，把整行撑满 */
    var statsHtml = '<div class="head-stats">' +
      '<div class="head-stat"><b>' + FEED.length + '</b><span>条分享</span></div>' +
      '<div class="head-stat"><b>' + Object.keys(dateSet).length + '</b><span>个记录日</span></div>' +
      '<div class="head-stat"><b>' + Math.max(0, tags.length - 1) + '</b><span>个标签</span></div>' +
      '</div>';

    /* 按日期分组：同一天的内容并排成一行 */
    var order = [], byDate = {};
    items.forEach(function (f) {
      if (!byDate[f.date]) { byDate[f.date] = []; order.push(f.date); }
      byDate[f.date].push(f);
    });

    var html = order.map(function (date) {
      var list = byDate[date];
      var day = weekdayOf(date);
      return '<div class="tl-group">' +
          '<div class="tl-date">' +
            '<span class="tl-date__day">' + esc(date) + '</span>' +
            (day ? '<span class="tl-date__week">' + esc(day) + '</span>' : '') +
            (list.length > 1 ? '<span class="tl-date__n">' + list.length + ' 条</span>' : '') +
          '</div>' +
          '<div class="tl-cards">' + list.map(feedCardHtml).join('') + '</div>' +
        '</div>';
    }).join('');

    /* v139：往年今天的条目（没有就不出现） */
    var otd = onThisDayHtml();

    return '<section class="page">' +
      '<div class="page-head page-head--share">' +
        '<div class="page-head__main">' +
          '<span class="eyebrow">Sharing · 屿光</span>' +
          '<h1>灵感分享</h1>' +
          '<p>每天一小条，记录正在遇见的工具、灵感与小发现。像刷动态一样，回看这一年的数字足迹。</p>' +
        '</div>' +
        '<div class="page-head__side">' + statsHtml + '</div>' +
      '</div>' +
      otd +
      tagBar +
      '<div class="timeline">' + (items.length ? html : emptyHtml('🪶', '这个标签下还没有内容', '换个标签看看吧。')) + '</div>' +
      '</section>';
  }

  /* =========================================================
     灵感随记（#/idea）
     ---------------------------------------------------------
     一条灵感 = 一段 Markdown 正文 + 从正文里抠出来的 #标签 + 时间。
     全存在本机 localStorage（跟收藏、最近访问一样，不上传服务器），
     换设备 / 清缓存之前用页面右上角「导出」带走一份 JSON。
     ========================================================= */
  var IDEA_KEY = 'xingyu.idea.v1';
  var IDEA_DRAFT_KEY = 'xingyu.idea.draft.v1';   // 打字打到一半切页也不丢
  var IDEA_TAG_RE = /#[\u4e00-\u9fa5A-Za-z0-9_]+/g;
  var IDEA_MAX_TAGS = 6;
  var IDEA_MAX_LEN = 20000;

  /* 从正文里抠出 #标签（中文 / 英文 / 数字 / 下划线都认），同一个词只留一次 */
  function ideaTagsOf(text) {
    var m = String(text || '').match(IDEA_TAG_RE) || [];
    var out = [];
    for (var i = 0; i < m.length; i++) {
      var v = m[i].slice(1);
      if (v && out.indexOf(v) < 0) out.push(v);
      if (out.length >= IDEA_MAX_TAGS) break;
    }
    return out;
  }
  /* 去掉 #标签 再交给 Markdown —— 不然行首的 #设计 会被当成标题 */
  function ideaBody(text) {
    return String(text || '').replace(IDEA_TAG_RE, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  }
  function loadIdeas() {
    var arr;
    try { arr = JSON.parse(localStorage.getItem(IDEA_KEY)); } catch (e) { arr = null; }
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (x) {
      return x && typeof x.text === 'string' && x.text.trim();
    }).map(function (x) {
      return {
        id: String(x.id || ''),
        text: String(x.text).slice(0, IDEA_MAX_LEN),
        tags: Array.isArray(x.tags) && x.tags.length ? x.tags.slice(0, IDEA_MAX_TAGS).map(String) : ideaTagsOf(x.text),
        ts: Number(x.ts) || Date.parse(x.ts) || Date.parse(x.date) || 0,
        date: String(x.date || ''),
        pinned: !!x.pinned
      };
    }).sort(function (a, b) {
      /* 置顶的浮到最前，其余仍按时间倒序（sort 是稳定排序，同一档里顺序不变） */
      return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.ts || 0) - (a.ts || 0);
    });
  }
  /* 搜一条：正文 / 标签 / 显示出来的时间都算，空格分开的多个词要全部命中 */
  function ideaMatch(it, q) {
    var s = String(q || '').trim().toLowerCase();
    if (!s) return true;
    var hay = (it.text + ' ' + (it.tags || []).join(' ') + ' ' + ideaTime(it)).toLowerCase();
    return s.split(/\s+/).every(function (w) { return hay.indexOf(w) > -1; });
  }
  /* 去掉标签、去掉空白之后的字数 —— 头部那个「字」就是它 */
  function ideaWords(list) {
    var n = 0;
    (list || []).forEach(function (it) {
      n += ideaBody(it.text).replace(/\s+/g, '').length;
    });
    return n;
  }
  function saveIdeas(list) {
    try {
      localStorage.setItem(IDEA_KEY, JSON.stringify(list));
      /* v139：灵感进了 ⌘K 索引，写完要重建一次，否则刚记的那条搜不到 */
      if (typeof buildPaletteIndex === 'function') PALETTE_INDEX = buildPaletteIndex();
      return true;
    }
    catch (e) { toast('存不下了 —— 浏览器空间满了，先导出再删几条'); return false; }
  }
  function ideaId() { return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  /* 时间写人话：今天只说时分，今年只说月日，更早才带年份 */
  function ideaTime(it) {
    var t = it.ts ? new Date(it.ts) : null;
    if (!t || isNaN(t.getTime())) return it.date || '';
    var now = new Date();
    var hm = p2(t.getHours()) + ':' + p2(t.getMinutes());
    if (t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth() && t.getDate() === now.getDate()) {
      return '今天 ' + hm;
    }
    if (t.getFullYear() === now.getFullYear()) return (t.getMonth() + 1) + '月' + t.getDate() + '日 ' + hm;
    return t.getFullYear() + '年' + (t.getMonth() + 1) + '月' + t.getDate() + '日';
  }
  /* v139：稍后读 / 足迹要的两种「短时间」写法 */
  function shortDate(ts) {
    var d = new Date(ts);
    if (!ts || isNaN(d.getTime())) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    var now = new Date();
    var md = p(d.getMonth() + 1) + '/' + p(d.getDate());
    return d.getFullYear() === now.getFullYear() ? md : d.getFullYear() + '/' + md;
  }
  function agoText(ts) {
    if (!ts) return '从没打开过';
    var d = Math.floor((Date.now() - ts) / 86400000);
    if (d <= 0) return '今天打开过';
    if (d < 30) return d + ' 天前';
    if (d < 365) return Math.floor(d / 30) + ' 个月前';
    return Math.floor(d / 365) + ' 年前';
  }
  function ideaTagStats(list) {
    var map = {}, order = [];
    list.forEach(function (it) {
      (it.tags || []).forEach(function (t) {
        if (!(t in map)) { map[t] = 0; order.push(t); }
        map[t]++;
      });
    });
    order.sort(function (a, b) { return map[b] - map[a] || String(a).localeCompare(String(b)); });
    return order.map(function (t) { return { name: t, n: map[t] }; });
  }
  function ideaFiltered(list, tag, q) {
    return list.filter(function (it) {
      if (tag && tag !== 'all' && (it.tags || []).indexOf(tag) < 0) return false;
      return ideaMatch(it, q);
    });
  }

  /* =========================================================
     把一条灵感画成一张图（卡片右上「存图」）
     ---------------------------------------------------------
     纯 Canvas 手绘，不引任何第三方库 —— 一是这站零依赖，
     二是分享到别处时排版不会被平台改得面目全非：图里就是
     卡片本来的样子（深浅两套主题各一套配色，跟着当前主题走）。

     写法是「量两遍」：先在一块 760×10 的临时画布上跑一遍布局，
     拿到总高度，再建真正尺寸的画布（2 倍图）重画一次。
     ========================================================= */
  var IMG_W = 760;          /* 逻辑宽度，导出时按 2 倍画，发出去不糊 */
  var IMG_PAD = 48;
  var IMG_SCALE = 2;
  var IMG_MAX_H = 5000;     /* 长文兜底：超了就截断（Chrome 的 canvas 上限是 16384px） */
  var IMG_FONT = '"PingFang SC","HarmonyOS Sans SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif';
  var IMG_MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

  function ideaImgPal() {
    var light = document.documentElement.getAttribute('data-theme') === 'light';
    if (light) {
      return {
        bg1: '#f4f7ff', bg2: '#e6ecfa',
        g1: 'rgba(124,156,255,.30)', g2: 'rgba(180,124,255,.20)', g3: 'rgba(79,227,208,.16)',
        a2: 'rgba(180,124,255,.55)',
        text: '#131c31', dim: '#41506d', mute: '#6b7791',
        rule: 'rgba(124,156,255,.45)',
        pillBg: 'rgba(124,156,255,.20)', pillText: '#3b4a83',
        quoteBar: 'rgba(124,156,255,.65)',
        codeBg: 'rgba(124,156,255,.14)', codeText: '#2f4a6b',
        edge: 'rgba(124,156,255,.22)'
      };
    }
    return {
      bg1: '#0a0d18', bg2: '#121729',
      g1: 'rgba(124,156,255,.34)', g2: 'rgba(180,124,255,.24)', g3: 'rgba(79,227,208,.14)',
      a2: 'rgba(180,124,255,.6)',
      text: '#eef1f8', dim: '#a7b0c4', mute: '#79839a',
      rule: 'rgba(124,156,255,.5)',
      pillBg: 'rgba(124,156,255,.16)', pillText: '#c6d4ff',
      quoteBar: 'rgba(143,167,255,.8)',
      codeBg: 'rgba(124,156,255,.10)', codeText: '#a9e8dc',
      edge: 'rgba(255,255,255,.10)'
    };
  }

  /* 一行文本切成「段」：把 **粗体** / `代码` / [文字](链接) / ~~删~~ / *斜* 拆开，
     图里粗体就是粗体，代码换个字色 —— 跟屏幕上看到的差不多 */
  function ideaImgSegs(text) {
    var segs = [], re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]*\]\([^)]*\)|~~[^~]+~~|\*[^*\n]+\*)/g, last = 0, m;
    function push(t, st) {
      if (!t) return;
      var o = { t: t };
      if (st) { if (st.bold) o.bold = 1; if (st.code) o.code = 1; }
      segs.push(o);
    }
    while ((m = re.exec(text))) {
      push(text.slice(last, m.index));
      var tok = m[0];
      if (tok.slice(0, 2) === '**') push(tok.slice(2, -2), { bold: 1 });
      else if (tok.charAt(0) === '`') push(tok.slice(1, -1), { code: 1 });
      else if (tok.charAt(0) === '[') push(tok.replace(/^\[([^\]]*)\][\s\S]*$/, '$1'));
      else push(tok.slice(2, -2));
      last = re.lastIndex;
    }
    push(text.slice(last));
    return segs.length ? segs : [{ t: text }];
  }

  /* 逐行拆块：标题 / 列表 / 勾选 / 引用 / 代码段 / 分隔线 / 空行 */
  function ideaImgBlocks(text) {
    var out = [], fence = false;
    String(text || '').replace(/\r\n?/g, '\n').split('\n').forEach(function (raw) {
      var line = raw.replace(/\s+$/, ''), m;
      if (/^\s*```/.test(line)) { fence = !fence; out.push({ k: 'gap' }); return; }
      if (fence) { out.push({ k: 'code', s: [{ t: line || ' ' }] }); return; }
      if (!line.trim()) {
        if (out.length && out[out.length - 1].k !== 'gap') out.push({ k: 'gap' });
        return;
      }
      if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
        out.push({ k: m[1].length <= 2 ? 'h1' : 'h2', s: ideaImgSegs(m[2]) });
        return;
      }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push({ k: 'rule' }); return; }
      if ((m = line.match(/^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/))) {
        out.push({ k: 'li', mark: m[1].toLowerCase() === 'x' ? '☑' : '☐', s: ideaImgSegs(m[2]) });
        return;
      }
      if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) { out.push({ k: 'li', mark: '•', s: ideaImgSegs(m[1]) }); return; }
      if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) { out.push({ k: 'li', mark: m[1] + '.', s: ideaImgSegs(m[2]) }); return; }
      if ((m = line.match(/^\s*>\s?(.*)$/))) { out.push({ k: 'quote', s: ideaImgSegs(m[1]) }); return; }
      out.push({ k: 'p', s: ideaImgSegs(line.trim()) });
    });
    while (out.length && out[out.length - 1].k === 'gap') out.pop();
    return out;
  }

  /* 切成折行的最小单位：一个汉字 / 一个西文词 / 一串空白。
     按字符硬切的话英文单词会被劈成两半，所以西文按「连续字母数字」整块走 */
  function ideaImgUnits(s) {
    return s.match(/[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]|[A-Za-z0-9_@#$%&+~=^|/\\.:;'"-]+|\s+|[\s\S]/g) || [];
  }

  /* 折行：返回 [{ runs:[{t,w,bold,code}], w }]，runs 里同款式的字会合并成一段 */
  function ideaImgWrap(ctx, segs, maxW, fontOf) {
    var lines = [], cur = { runs: [], w: 0 };
    function flush() { if (cur.w > 0 || cur.runs.length) lines.push(cur); cur = { runs: [], w: 0 }; }
    (segs || []).forEach(function (seg) {
      ctx.font = fontOf(seg);
      var units = ideaImgUnits(seg.t);
      for (var i = 0; i < units.length; i++) {
        var u = units[i];
        if (/^\s+$/.test(u) && cur.w === 0) continue;      /* 行首的空格不要 */
        ctx.font = fontOf(seg);
        var w = ctx.measureText(u).width;
        if (cur.w + w > maxW && cur.w > 0 && !/^\s+$/.test(u)) flush();
        var last = cur.runs[cur.runs.length - 1];
        if (last && !!last.bold === !!seg.bold && !!last.code === !!seg.code) {
          last.t += u; last.w += w;
        } else {
          cur.runs.push({ t: u, w: w, bold: !!seg.bold, code: !!seg.code });
        }
        cur.w += w;
      }
    });
    flush();
    if (!lines.length) lines.push({ runs: [], w: 0 });
    return lines;
  }

  function ideaRoundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* 底色：两层极光 + 一条很淡的描边，跟站里那层背景一个调 */
  function ideaImgBg(ctx, H) {
    var P = ideaImgPal();
    /* 底平涂，靠下面三层光晕出层次：斜向渐变在 canvas 里会被抖动成噪点，
       整张图白胖 100~300KB，而肉眼几乎看不出它跟平涂的区别。 */
    ctx.fillStyle = P.bg1;
    ctx.fillRect(0, 0, IMG_W, H);

    /* 只铺光晕自己的那块方框，别整张画布反复叠三层 —— 少一大截重绘，
       也不至于让整张图都被渐变的抖动噪点填满（PNG 压不小） */
    var glow = function (cx, cy, r, color) {
      var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, color);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      var x0 = Math.max(0, cx - r), y0 = Math.max(0, cy - r);
      var x1 = Math.min(IMG_W, cx + r), y1 = Math.min(H, cy + r);
      if (x1 > x0 && y1 > y0) ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    };
    glow(IMG_W * .92, -60, 420, P.g1);
    glow(-80, H * .55, 380, P.g2);
    glow(IMG_W * .75, H + 40, 320, P.g3);

    ctx.strokeStyle = P.edge;
    ctx.lineWidth = 2;
    ideaRoundRect(ctx, 1, 1, IMG_W - 2, H - 2, 35);
    ctx.stroke();
  }

  /* 画正文：返回总高度（第二次调用时就是真实高度） */
  function ideaImgPaint(ctx, it) {
    var P = ideaImgPal();
    var PAD = IMG_PAD, maxW = IMG_W - PAD * 2;
    var y = PAD, cut = false;

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    /* 顶部：左边「壹号栈 · 灵感随记」，右边时间（置顶带 📌） */
    ctx.font = '600 13px ' + IMG_FONT;
    ctx.fillStyle = P.mute;
    ctx.fillText('壹号栈 · 灵感随记', PAD, y + 12);
    ctx.font = '400 13px ' + IMG_FONT;
    ctx.textAlign = 'right';
    ctx.fillText((it.pinned ? '📌 ' : '') + ideaTime(it), IMG_W - PAD, y + 12);
    ctx.textAlign = 'left';
    y += 24;

    var lg = ctx.createLinearGradient(PAD, 0, IMG_W - PAD, 0);
    lg.addColorStop(0, P.rule);
    lg.addColorStop(.5, P.a2);
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(PAD, y, maxW, 2);
    y += 30;

    var fontOf = function (kind, seg) {
      var size = kind === 'h1' ? 26 : kind === 'h2' ? 22 : kind === 'quote' ? 18 : 19;
      if (seg && seg.code) return '400 ' + (size - 2) + 'px ' + IMG_MONO;
      return ((seg && seg.bold) ? '600 ' : '400 ') + size + 'px ' + IMG_FONT;
    };

    ideaImgBlocks(ideaBody(it.text) || it.text).forEach(function (b) {
      if (y > IMG_MAX_H - 260) { cut = true; return; }
      if (b.k === 'gap') { y += 14; return; }
      if (b.k === 'rule') {
        ctx.fillStyle = P.rule;
        ctx.fillRect(PAD, y + 8, maxW, 1);
        y += 22;
        return;
      }

      var kind = b.k, lh, indent = 0, color = P.text;
      if (kind === 'h1') { lh = 40; y += 12; }
      else if (kind === 'h2') { lh = 34; y += 10; }
      else if (kind === 'quote') { lh = 32; indent = 20; color = P.dim; }
      else if (kind === 'li') { lh = 34; indent = 26; }
      else if (kind === 'code') { lh = 28; indent = 14; }
      else { lh = 34; }

      var lines = ideaImgWrap(ctx, b.s, maxW - indent, function (seg) { return fontOf(kind, seg); });
      var base = lh - Math.round(lh * 0.30);

      lines.forEach(function (ln, li) {
        if (kind === 'code') {                       /* 代码行铺一条很淡的底 */
          ctx.fillStyle = P.codeBg;
          ctx.fillRect(PAD, y, maxW, lh);
        }
        if (kind === 'quote') {
          ctx.fillStyle = P.quoteBar;
          ctx.fillRect(PAD + 4, y + 5, 3, lh - 10);
          if (li === 0) { /* 只有第一行画竖线也不好看，所以每行都画 */ }
        }
        if (kind === 'li' && li === 0 && b.mark) {
          ctx.font = '400 19px ' + IMG_FONT;
          ctx.fillStyle = P.mute;
          ctx.fillText(b.mark, PAD + 2, y + base);
        }
        var x = PAD + indent;
        ln.runs.forEach(function (r) {
          ctx.font = fontOf(kind, r);
          ctx.fillStyle = r.code ? P.codeText : color;
          ctx.fillText(r.t, x, y + base);
          x += r.w;
        });
        y += lh;
      });
      y += (kind === 'h1' || kind === 'h2') ? 6 : 0;
    });

    if (cut) {
      ctx.font = '400 19px ' + IMG_FONT;
      ctx.fillStyle = P.mute;
      ctx.fillText('……（太长，剩下的留给自己看）', PAD, y + 20);
      y += 34;
    }

    /* 标签：玻璃底色的小胶囊，跟着主题 */
    var tags = it.tags || [];
    if (tags.length) {
      y += 12;
      ctx.font = '500 13px ' + IMG_FONT;
      var tx = PAD, ty = y, th = 30;
      tags.forEach(function (tg) {
        var label = '#' + tg;
        var tw = Math.round(ctx.measureText(label).width) + 22;
        if (tx + tw > PAD + maxW) { tx = PAD; ty += th + 8; }
        ctx.fillStyle = P.pillBg;
        ideaRoundRect(ctx, tx, ty, tw, th, th / 2);
        ctx.fill();
        ctx.fillStyle = P.pillText;
        ctx.fillText(label, tx + 11, ty + 20);
        tx += tw + 8;
      });
      y = ty + th;
    }

    /* 页脚：左边站名，右边域名（图被转走之后还能找到出处） */
    y += 26;
    ctx.font = '400 12px ' + IMG_FONT;
    ctx.fillStyle = P.mute;
    ctx.fillText('壹号栈 YIHAOZHAN', PAD, y + 11);
    var host = '';
    try { host = location.host + location.pathname.replace(/index\.html$/, '').replace(/\/$/, ''); } catch (e) {}
    if (host) {
      ctx.textAlign = 'right';
      ctx.fillText(host, IMG_W - PAD, y + 11);
      ctx.textAlign = 'left';
    }
    return Math.ceil(y + 11 + PAD);
  }

  /* 拼出整张图的 canvas（2 倍图） */
  function ideaImgCanvas(it) {
    var probe = document.createElement('canvas');
    probe.width = IMG_W;
    probe.height = 10;
    var pctx = probe.getContext('2d');
    var H = Math.max(240, ideaImgPaint(pctx, it));

    var cv = document.createElement('canvas');
    cv.width = IMG_W * IMG_SCALE;
    cv.height = H * IMG_SCALE;
    var ctx = cv.getContext('2d');
    ctx.scale(IMG_SCALE, IMG_SCALE);
    ctx.save();
    ideaRoundRect(ctx, 0, 0, IMG_W, H, 36);
    ctx.clip();                       /* 圆角之外留透明，贴到哪儿都像一张卡片 */

    /* 底色那层极光是「四分之一尺寸画好再放大」的：小图画渐变没那么重的抖动，
       放大时浏览器自己做插值，看着一样柔，PNG 却能小掉八成。
       文字必须在放大之后画，才不会被一起拉糊。 */
    var q = 0.25;
    var bcv = document.createElement('canvas');
    bcv.width = Math.max(1, Math.round(IMG_W * q));
    bcv.height = Math.max(1, Math.round(H * q));
    var bctx = bcv.getContext('2d');
    if (bctx.setTransform) bctx.setTransform(q, 0, 0, q, 0, 0);
    else { bctx.scale(q, q); }
    ideaImgBg(bctx, H);
    ctx.drawImage(bcv, 0, 0, IMG_W, H);

    ideaImgPaint(ctx, it);
    ctx.restore();
    return cv;
  }


  function ideaCardHtml(it) {
    var body = ideaBody(it.text);
    var html = body ? MD.render(body) : '';
    if (!html) html = '<p class="idea-card__raw">' + esc(it.text) + '</p>';
    var tags = (it.tags || []).map(function (t) {
      return '<button class="tag" type="button" data-idea-tag="' + esc(t) + '">#' + esc(t) + '</button>';
    }).join('');
    return '<article class="idea-card' + (it.pinned ? ' is-pinned' : '') + '" data-idea-card="' + esc(it.id) + '">' +
        /* v138：置顶不再挂 📌（它和右上角的「取消置顶」按钮抢位置，也重复），
           置顶态靠背景变亮 + 按钮变「取消置顶」表示 */
        '<div class="idea-card__body md">' + html + '</div>' +
        '<footer class="idea-card__foot">' +
          '<div class="idea-card__meta">' +
            '<span class="idea-card__date">' + esc(ideaTime(it)) + '</span>' +
            (tags ? '<span class="idea-card__tags">' + tags + '</span>' : '') +
          '</div>' +
          '<span class="idea-card__ops">' +
            '<button class="idea-mini' + (it.pinned ? ' is-on' : '') + '" type="button" data-idea-pin="' + esc(it.id) + '"' +
              ' aria-pressed="' + (it.pinned ? 'true' : 'false') + '"' +
              ' title="' + (it.pinned ? '取消置顶' : '置顶，让它排在前面') + '">' +
              (it.pinned ? '取消置顶' : '置顶') + '</button>' +
            '<button class="idea-mini" type="button" data-idea-img="' + esc(it.id) + '"' +
              ' title="把这张卡导出成一张图片">存图</button>' +
            '<button class="idea-mini" type="button" data-idea-edit="' + esc(it.id) + '">编辑</button>' +
            '<button class="idea-mini idea-mini--del" type="button" data-idea-del="' + esc(it.id) + '">删除</button>' +
          '</span>' +
        '</footer>' +
      '</article>';
  }
  /* 列表：标签筛选 + 搜索词一起生效；三种空状态分开说，别让人以为数据没了 */
  function ideaGridHtml(list, tag, q) {
    var show = ideaFiltered(list, tag, q);
    if (!list.length) {
      return emptyHtml('💡', '还没有记下什么', '随手写一句就好 —— 想法、链接、半句诗，都可以。');
    }
    if (!show.length) {
      if (q) return emptyHtml('🔍', '没搜到「' + esc(String(q).trim()) + '」', '换个词试试，或者点右边那个 × 清掉搜索。');
      return emptyHtml('🔍', '「#' + esc(tag) + '」下还是空的', '换个标签看看，或者先记一条带这个标签的。');
    }
    return show.map(ideaCardHtml).join('');
  }
  function ideaRailHtml(stats, list, cur) {
    var n = stats.length;
    var all = '<button class="tag' + (cur === 'all' ? ' is-active' : '') + '" type="button" data-idea-tag="all">' +
      '全部 <span class="idea-rail__n">' + list.length + '</span></button>';
    if (!n) return '<div class="idea-rail" id="ideaRail">' + all +
      '<span class="idea-rail__tip">写的时候带上 #标签，这里就会长出分类</span></div>';
    return '<div class="idea-rail" id="ideaRail">' + all +
      stats.map(function (s) {
        return '<button class="tag' + (cur === s.name ? ' is-active' : '') + '" type="button" data-idea-tag="' + esc(s.name) + '">' +
          '#' + esc(s.name) + ' <span class="idea-rail__n">' + s.n + '</span></button>';
      }).join('') +
      /* 改名 / 删标签都藏在最右边这颗小按钮里，不占视线 */
      '<button class="idea-rail__manage" type="button" data-idea-tagmanage="1" title="管理标签（改名 / 删除）">⚙ 标签</button>' +
      '</div>';
  }

  function renderIdea() {
    var list = loadIdeas();
    var stats = ideaTagStats(list);
    var cur = state.ideaTag || 'all';
    var q = state.ideaQ || '';
    if (cur !== 'all' && !stats.some(function (s) { return s.name === cur; })) { cur = 'all'; state.ideaTag = 'all'; }

    /* 本周：最近 7 天（含今天）记了几条 */
    var t0 = new Date(); t0.setHours(0, 0, 0, 0);
    t0 = t0.getTime() - 6 * 86400000;
    var week = list.filter(function (it) { return it.ts && it.ts >= t0; }).length;

    var statsHtml = '<div class="head-stats">' +
      '<div class="head-stat"><b>' + list.length + '</b><span>条灵感</span></div>' +
      '<div class="head-stat"><b>' + stats.length + '</b><span>个标签</span></div>' +
      '<div class="head-stat"><b>' + week + '</b><span>本周</span></div>' +
      '<div class="head-stat"><b>' + ideaWords(list) + '</b><span>字</span></div>' +
      '</div>';

    return '<section class="page page--idea">' +
      '<div class="page-head page-head--idea">' +
        '<div class="page-head__main">' +
          '<span class="eyebrow">Idea · 随记</span>' +
          '<h1>灵感随记</h1>' +
          '<p>想到什么就写一句。<b>#标签</b> 会自动归类，支持 Markdown —— 全都存在这台浏览器里，不上传。</p>' +
        '</div>' +
        '<div class="page-head__side">' + statsHtml +
          '<div class="idea-tools">' +
            '<button class="btn btn--ghost" type="button" id="ideaExport">导出 JSON</button>' +
            '<button class="btn btn--ghost" type="button" id="ideaMd">导出 .md</button>' +
            '<button class="btn btn--ghost" type="button" id="ideaImport">导入</button>' +
            '<button class="btn btn--ghost" type="button" id="ideaClear">清空</button>' +
            '<input type="file" id="ideaFile" accept=".json,application/json" hidden />' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="idea-box" id="ideaBox">' +
      '<div class="idea-composer">' +
        '<textarea id="ideaInput" rows="4" placeholder="想到什么就记一句…&#10;支持 Markdown，用 #标签 归类&#10;⌘ / Ctrl + Enter 保存"></textarea>' +
        '<div class="idea-composer__foot">' +
          '<span class="idea-tip">存在这台浏览器里 · 换设备或清缓存前记得「导出」</span>' +
          '<button class="btn btn--primary" type="button" id="ideaSave">记下来</button>' +
        '</div>' +
      '</div>' +
      /* v133：右栏（搜索 + 标签 + 卡片）包进一层，桌面两栏布局才好摆 ——
         左边写作面板、右边整列内容，flex 一人一列互不干扰。 */
      '<div class="idea-side">' +
        /* 这一条不在 paint() 的重绘范围内，否则一边打字一边被换掉 */
        '<div class="idea-bar">' +
          '<div class="idea-search' + (q ? ' has-val' : '') + '">' +
            '<svg class="idea-search__ico" viewBox="0 0 24 24" aria-hidden="true">' +
              '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4l4.1 4.1"/></svg>' +
            '<input id="ideaSearch" type="search" value="' + esc(q) + '" placeholder="搜正文 / 标签 / 日期" ' +
              'aria-label="搜索灵感" autocomplete="off" />' +
            '<button class="idea-search__clear" type="button" id="ideaSearchClear" aria-label="清掉搜索">×</button>' +
          '</div>' +
          '<button class="btn btn--ghost idea-bar__btn" type="button" id="ideaRandom" title="随手抽一条，重新遇见以前的想法">🎲 随机回顾</button>' +
        '</div>' +
        ideaRailHtml(stats, list, cur) +
        '<div class="idea-grid" id="ideaGrid">' + ideaGridHtml(list, cur, q) + '</div>' +
      '</div>' +
      '</section>';
  }

  /* v137：写作面板的高度按「屏幕上还剩多少地方」算。
     面板在文档里是从标题区下面开始的（1440×900 下约 349px），
     v133 只按 100vh 减顶栏算高度，面板底部会到 1113px —— 超出视口 213px，
     「记下来」按钮正好落在屏幕外，用户就看不见了。
     这里量出面板真实的文档起点（用 offsetTop 链，sticky 不会影响它），
     高度 = 视口高 − 起点 − 16，下限 320（再矮就没法写了，让它滚）。
     1000px 以下是单列，不需要这个值。 */
  function fitIdeaComposer() {
    var box = $('#ideaBox');
    if (!box) return;
    var comp = box.querySelector('.idea-composer');
    if (!comp) return;
    if (window.innerWidth < 1000) { comp.style.removeProperty('--idea-h'); return; }
    var y = 0, el = comp;
    while (el) { y += el.offsetTop || 0; el = el.offsetParent; }
    var h = Math.round(window.innerHeight - y - 16);
    h = Math.max(320, Math.min(h, window.innerHeight - 140));
    comp.style.setProperty('--idea-h', h + 'px');
  }

  /* 灵感页的事件：全部委托在 #ideaBox 上，筛选时只换列表和标签条，不整页重渲
     （整页重渲会把正在写的输入框清掉） */
  function bindIdea() {
    var box = $('#ideaBox');
    if (!box) return;
    var ta = $('#ideaInput');
    var grid = $('#ideaGrid');
    var rail = $('#ideaRail');

    /* 面板高度跟着屏幕走：进页面算一次、改窗口再算一次（监听只挂一次） */
    fitIdeaComposer();
    requestAnimationFrame(fitIdeaComposer);
    if (!window.__ideaFitBound) {
      window.__ideaFitBound = true;
      window.addEventListener('resize', fitIdeaComposer);
    }

    function syncDraft() {
      try { localStorage.setItem(IDEA_DRAFT_KEY, ta.value); } catch (e) {}
    }
    function clearDraft() {
      try { localStorage.removeItem(IDEA_DRAFT_KEY); } catch (e) {}
    }
    function paint() {
      var list = loadIdeas();
      var stats = ideaTagStats(list);
      var cur = state.ideaTag || 'all';
      var q = state.ideaQ || '';
      if (cur !== 'all' && !stats.some(function (s) { return s.name === cur; })) {
        cur = 'all'; state.ideaTag = 'all';
      }
      if (rail) {
        var tmp = document.createElement('div');
        tmp.innerHTML = ideaRailHtml(stats, list, cur);
        rail.replaceWith(tmp.firstElementChild);
        rail = $('#ideaRail');
      }
      if (grid) grid.innerHTML = ideaGridHtml(list, cur, q);
      /* 头部那四个数字也跟着变 */
      var statsEl = document.querySelector('.page-head--idea .head-stats');
      if (statsEl) {
        var t0 = new Date(); t0.setHours(0, 0, 0, 0);
        t0 = t0.getTime() - 6 * 86400000;
        var week = list.filter(function (it) { return it.ts && it.ts >= t0; }).length;
        var bs = statsEl.querySelectorAll('b');
        if (bs[0]) bs[0].textContent = list.length;
        if (bs[1]) bs[1].textContent = stats.length;
        if (bs[2]) bs[2].textContent = week;
        if (bs[3]) bs[3].textContent = ideaWords(list);
      }
    }
    function add() {
      var text = ta.value.trim();
      if (!text) { toast('写点什么再记下来'); ta.focus(); return; }
      var list = loadIdeas();
      if (!saveIdeas([{ id: ideaId(), text: text.slice(0, IDEA_MAX_LEN), tags: ideaTagsOf(text), ts: Date.now(), date: '', pinned: false }].concat(list))) return;
      ta.value = '';
      clearDraft();
      paint();
      toast('记下了 ✓');
      ta.focus();
    }

    /* 上次没写完的草稿先填回来 */
    if (ta) {
      try {
        var dft = localStorage.getItem(IDEA_DRAFT_KEY);
        if (dft && !ta.value) ta.value = dft;
      } catch (e) {}
      ta.addEventListener('input', debounce(syncDraft, 300));
      ta.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); add(); }
      });
    }
    var saveBtn = $('#ideaSave');
    if (saveBtn) saveBtn.addEventListener('click', add);

    /* 编辑：卡片正文就地换成输入框，不弹窗 */
    function startEdit(id) {
      var card = box.querySelector('[data-idea-card="' + id + '"]');
      if (!card || card.classList.contains('is-editing')) return;
      var it = null;
      loadIdeas().forEach(function (x) { if (x.id === id) it = x; });
      if (!it) return;
      var body = card.querySelector('.idea-card__body');
      if (!body) return;
      var bak = body.innerHTML;
      card.classList.add('is-editing');
      body.classList.remove('md');
      body.innerHTML =
        '<textarea class="idea-edit" rows="5">' + esc(it.text) + '</textarea>' +
        '<span class="idea-edit__ops">' +
          '<button class="btn btn--ghost btn--mini" type="button" data-idea-cancel="1">取消</button>' +
          '<button class="btn btn--primary btn--mini" type="button" data-idea-write="' + esc(id) + '">保存</button>' +
        '</span>';
      var inp = body.querySelector('textarea');
      inp.focus();
      try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {}
      inp.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      });
      function cancel() { card.classList.remove('is-editing'); body.classList.add('md'); body.innerHTML = bak; }
      function submit() {
        var v = inp.value.trim();
        if (!v) { toast('内容不能空着'); inp.focus(); return; }
        var list = loadIdeas();
        for (var i = 0; i < list.length; i++) {
          if (list[i].id !== id) continue;
          list[i].text = v.slice(0, IDEA_MAX_LEN);
          list[i].tags = ideaTagsOf(list[i].text);
          /* 时间不动：改了内容不等于「又想起一次」，不然卡片会突然跳到最前面 */
          break;
        }
        saveIdeas(list);
        paint();
        toast('改好了 ✓');
      }
      body.querySelector('[data-idea-cancel]').addEventListener('click', cancel);
      body.querySelector('[data-idea-write]').addEventListener('click', submit);
    }

    function askDelete(id) {
      var it = null;
      loadIdeas().forEach(function (x) { if (x.id === id) it = x; });
      if (!it) return;
      var plain = MD.plain(ideaBody(it.text) || it.text).replace(/\s+/g, ' ').trim();
      askConfirm({
        icon: '🗑',
        title: '删掉这条灵感？',
        desc: '「' + esc(plain.slice(0, 46)) + (plain.length > 46 ? '…' : '') + '」<br>删了可找不回来。',
        ok: '删掉'
      }, function () {
        saveIdeas(loadIdeas().filter(function (x) { return x.id !== id; }));
        paint();
        toast('删掉了');
      });
    }

    /* 置顶：只动这一条，别的不碰 */
    function togglePin(id) {
      var list = loadIdeas();
      var it = null;
      for (var i = 0; i < list.length; i++) if (list[i].id === id) { it = list[i]; break; }
      if (!it) return;
      it.pinned = !it.pinned;
      saveIdeas(list);
      paint();
      toast(it.pinned ? '已置顶 📌' : '取消置顶');
    }

    box.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var pn = t.closest('[data-idea-pin]');
      if (pn) { togglePin(pn.getAttribute('data-idea-pin')); return; }
      var im = t.closest('[data-idea-img]');
      if (im) { saveImage(im.getAttribute('data-idea-img')); return; }
      var ed = t.closest('[data-idea-edit]');
      if (ed) { startEdit(ed.getAttribute('data-idea-edit')); return; }
      var dl = t.closest('[data-idea-del]');
      if (dl) { askDelete(dl.getAttribute('data-idea-del')); return; }
      var mg = t.closest('[data-idea-tagmanage]');
      if (mg) { openTagPanel(); return; }
      var tg = t.closest('[data-idea-tag]');
      if (tg) {
        state.ideaTag = tg.getAttribute('data-idea-tag') || 'all';
        paint();
      }
    });

    /* 搜索：只换列表，不碰输入框（输入框不在 paint 的重绘范围里） */
    var sch = $('#ideaSearch');
    var schWrap = box.querySelector('.idea-search');
    if (sch) {
      sch.addEventListener('input', debounce(function () {
        state.ideaQ = sch.value;
        if (schWrap) schWrap.classList.toggle('has-val', !!sch.value);
        paint();
      }, 160));
      sch.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); sch.value = ''; state.ideaQ = ''; if (schWrap) schWrap.classList.remove('has-val'); paint(); }
      });
    }
    var schClr = $('#ideaSearchClear');
    if (schClr) schClr.addEventListener('click', function () {
      if (sch) { sch.value = ''; sch.focus(); }
      state.ideaQ = '';
      if (schWrap) schWrap.classList.remove('has-val');
      paint();
    });

    /* 随机回顾：在当前筛选结果里抽一条，滚过去闪一下 */
    var rndBtn = $('#ideaRandom');
    if (rndBtn) rndBtn.addEventListener('click', function () {
      var show = ideaFiltered(loadIdeas(), state.ideaTag, state.ideaQ);
      if (!show.length) { toast('这里没有可回顾的灵感'); return; }
      var pick = show[Math.floor(Math.random() * show.length)];
      var card = box.querySelector('[data-idea-card="' + pick.id + '"]');
      if (!card) { toast('没找到那张卡，刷新一下试试'); return; }
      try { card.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { card.scrollIntoView(); }
      card.classList.remove('is-flash');
      void card.offsetWidth;             /* 强制回流，连着点两次动画也能重播 */
      card.classList.add('is-flash');
      setTimeout(function () { card.classList.remove('is-flash'); }, 2000);
    });

    /* 标签管理：改名 / 删除，改的是一次性的批量操作，走确认框 */
    function openTagPanel() {
      var list = loadIdeas();
      var stats = ideaTagStats(list);
      if (!stats.length) { toast('还没有标签，写的时候带上 #话题 就行'); return; }
      closeTagPanel();
      var mask = document.createElement('div');
      mask.className = 'confirm-mask';
      mask.id = 'ideaTagMask';
      mask.innerHTML =
        '<div class="confirm-box idea-tagbox" role="dialog" aria-modal="true" aria-label="管理标签">' +
          '<div class="confirm-box__icon">🏷</div>' +
          '<h3>管理标签</h3>' +
          '<p>改名会应用到所有带这个标签的灵感；删标签只是把标签摘掉，正文不动。</p>' +
          '<div class="idea-taglist">' +
            stats.map(function (s) {
              return '<div class="idea-tagrow" data-tag="' + esc(s.name) + '">' +
                '<span class="idea-tagrow__n">#' + esc(s.name) + '</span>' +
                '<span class="idea-tagrow__c">' + s.n + ' 条</span>' +
                '<button class="idea-mini" type="button" data-tag-rename="' + esc(s.name) + '">改名</button>' +
                '<button class="idea-mini idea-mini--del" type="button" data-tag-drop="' + esc(s.name) + '">删除</button>' +
              '</div>';
            }).join('') +
          '</div>' +
          '<div class="confirm-actions"><button class="btn btn--ghost" type="button" data-confirm="no">关掉</button></div>' +
        '</div>';
      document.body.appendChild(mask);
      if (!document.body.classList.contains('no-scroll')) { mask._lock = true; document.body.classList.add('no-scroll'); }
      mask.addEventListener('click', function (e) {
        if (e.target === mask || (e.target.closest && e.target.closest('[data-confirm]'))) { closeTagPanel(); return; }
        var rn = e.target.closest && e.target.closest('[data-tag-rename]');
        if (rn) { startRename(rn.getAttribute('data-tag-rename')); return; }
        var dp = e.target.closest && e.target.closest('[data-tag-drop]');
        if (dp) { askDropTag(dp.getAttribute('data-tag-drop')); }
      });
      mask._esc = function (e) { if (e.key === 'Escape') closeTagPanel(); };
      document.addEventListener('keydown', mask._esc);

      function closeTagPanel() {
        var m = document.getElementById('ideaTagMask');
        if (!m) return;
        if (m._esc) document.removeEventListener('keydown', m._esc);
        if (m._lock) document.body.classList.remove('no-scroll');
        m.remove();
      }
      function startRename(name) {
        var row = mask.querySelector('.idea-tagrow[data-tag="' + name + '"]');
        if (!row || row.classList.contains('is-renaming')) return;
        var nEl = row.querySelector('.idea-tagrow__n');
        var bak = nEl.textContent;
        var cnt = row.querySelector('.idea-tagrow__c');
        row.classList.add('is-renaming');
        nEl.innerHTML = '<input class="idea-tagrow__input" type="text" value="' + esc(name) + '" maxlength="24" />';
        if (cnt) cnt.textContent = '';
        var inp = nEl.querySelector('input');
        inp.focus(); inp.select();
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); save(); }
          if (e.key === 'Escape') { e.preventDefault(); row.classList.remove('is-renaming'); nEl.textContent = bak; reCount(); }
        });
        inp.addEventListener('blur', function () { save(); });
        function reCount() {
          var s = null;
          ideaTagStats(loadIdeas()).forEach(function (x) { if (x.name === name) s = x; });
          if (cnt) cnt.textContent = s ? s.n + ' 条' : '';
        }
        function save() {
          var v = inp.value.trim().replace(/^#/, '');
          if (!v || v === name) { row.classList.remove('is-renaming'); nEl.textContent = bak; reCount(); return; }
          if (!/^[\u4e00-\u9fa5A-Za-z0-9_]+$/.test(v)) { toast('标签只能用中文、字母、数字、下划线'); inp.focus(); return; }
          var list = loadIdeas();
          list.forEach(function (it) {
            var i = (it.tags || []).indexOf(name);
            if (i < 0) return;
            it.tags.splice(i, 1);
            if (it.tags.indexOf(v) < 0) it.tags.push(v);   /* 改成已有的标签 = 合并 */
            it.tags = it.tags.slice(0, IDEA_MAX_TAGS);
          });
          saveIdeas(list);
          if (state.ideaTag === name) state.ideaTag = v;
          closeTagPanel();
          paint();
          toast('已改名为 #' + v);
        }
      }
      function askDropTag(name) {
        var n = ideaTagStats(loadIdeas()).filter(function (s) { return s.name === name; })[0];
        askConfirm({
          icon: '🏷',
          title: '删掉标签 #' + name + '？',
          desc: '会从 ' + (n ? n.n : 0) + ' 条灵感上摘掉这个标签，<b>正文和这条灵感本身都还在</b>。',
          ok: '摘掉标签'
        }, function () {
          var list = loadIdeas();
          list.forEach(function (it) {
            var i = (it.tags || []).indexOf(name);
            if (i > -1) it.tags.splice(i, 1);
          });
          saveIdeas(list);
          if (state.ideaTag === name) state.ideaTag = 'all';
          closeTagPanel();
          paint();
          toast('标签已摘掉');
        });
      }
    }

    /* 存图：把这条灵感画成 PNG 存下来（画布逻辑在上面的 ideaImgCanvas） */
    function saveImage(id) {
      var it = null;
      loadIdeas().forEach(function (x) { if (x.id === id) it = x; });
      if (!it) return;
      var cv;
      try { cv = ideaImgCanvas(it); }
      catch (e) { toast('这张图没画出来，刷新一下再试'); return; }
      var name = '灵感随记_' + ideaStamp() + '.png';
      if (!cv.toBlob) {                              /* 老浏览器兜底 */
        downloadBlob(name, null, cv.toDataURL('image/png'));
        toast('图片存好了 ✓');
        return;
      }
      cv.toBlob(function (blob) {
        if (!blob) { toast('图片生成失败，换个浏览器试试'); return; }
        downloadBlob(name, blob);
        toast('图片存好了 ✓ ' + Math.round(blob.size / 1024) + ' KB · ' + cv.width + '×' + cv.height);
      }, 'image/png');
    }

    /* 导出 / 导入 / 清空 */
    function ideaStamp() {
      var d = new Date();
      return d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '_' + p2(d.getHours()) + p2(d.getMinutes());
    }
    /* 下载：blob 直接给，老浏览器可以走 dataURL */
    function downloadBlob(name, blob, dataUrl) {
      var url = dataUrl || URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      if (!dataUrl) setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    }
    function download(name, text, mime) {
      downloadBlob(name, new Blob([text], { type: mime }));
    }
    function exportIdeas() {
      var list = loadIdeas();
      if (!list.length) { toast('还没有可以导出的灵感'); return; }
      /* 字段跟参考版「灵感随记」一致，两边能互相导入；pinned 是本站多出来的，那边会忽略掉 */
      var out = list.map(function (it) {
        return {
          text: it.text, tags: it.tags, ts: it.ts,
          date: it.date || ideaTime(it),
          pinned: it.pinned ? true : undefined
        };
      });
      download('灵感随记_' + ideaStamp() + '.json', JSON.stringify(out, null, 2), 'application/json');
      toast('导出 ' + list.length + ' 条');
    }
    /* 导出 Markdown：直接能贴进任何笔记软件，按标签/时间分小标题 */
    function exportMarkdown() {
      var list = loadIdeas();
      if (!list.length) { toast('还没有可以导出的灵感'); return; }
      var lines = ['# 灵感随记', '', '> 导出于 ' + new Date().toLocaleString('zh-CN') + '，共 ' + list.length + ' 条。', ''];
      list.forEach(function (it) {
        var stamp = ideaTime(it);
        var tg = (it.tags || []).map(function (t) { return '#' + t; }).join(' ');
        lines.push('## ' + stamp + (it.pinned ? ' · 📌' : ''));
        if (tg) lines.push('', '_' + tg + '_');
        lines.push('', it.text.trim(), '');
      });
      download('灵感随记_' + ideaStamp() + '.md', lines.join('\n'), 'text/markdown;charset=utf-8');
      toast('导出 Markdown，共 ' + list.length + ' 条');
    }
    var exp = $('#ideaExport'); if (exp) exp.addEventListener('click', exportIdeas);
    var mdBtn = $('#ideaMd'); if (mdBtn) mdBtn.addEventListener('click', exportMarkdown);
    var imp = $('#ideaImport');
    var file = $('#ideaFile');
    if (imp && file) {
      imp.addEventListener('click', function () { file.click(); });
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        file.value = '';
        if (!f) return;
        var r = new FileReader();
        r.onload = function () {
          var arr = null;
          try { arr = JSON.parse(String(r.result)); } catch (e) { arr = null; }
          if (!Array.isArray(arr)) { toast('这个文件不是灵感备份（要 JSON）'); return; }
          var list = loadIdeas();
          var seen = {};
          list.forEach(function (it) { seen[it.text.trim()] = 1; });
          var add = 0;
          arr.forEach(function (x) {
            var text = String((x && (x.text || x.content)) || '').trim();
            if (!text || seen[text]) return;
            seen[text] = 1;
            add++;
            list.push({
              id: ideaId(),
              text: text.slice(0, IDEA_MAX_LEN),
              tags: ideaTagsOf(text),
              ts: Number(x.ts) || Date.parse(x.date) || Date.now(),
              date: String(x.date || '')
            });
          });
          list.sort(function (a2, b2) { return (b2.ts || 0) - (a2.ts || 0); });
          saveIdeas(list);
          paint();
          toast(add ? ('导入 ' + add + ' 条' + (add < arr.length ? '（' + (arr.length - add) + ' 条重复，跳过）' : '')) : '都是已有的，没有新增');
        };
        r.readAsText(f);
      });
    }
    var clr = $('#ideaClear');
    if (clr) {
      clr.addEventListener('click', function () {
        var n = loadIdeas().length;
        if (!n) { toast('还没有数据可以清空'); return; }
        askConfirm({
          icon: '🧹',
          title: '清空全部 ' + n + ' 条灵感？',
          desc: '这一步不可恢复。要是拿不准，先点「导出」存一份 JSON 到电脑上。',
          ok: '全部清空'
        }, function () {
          saveIdeas([]);
          state.ideaTag = 'all';
          paint();
          toast('清空了');
        });
      });
    }
  }

  /* =========================================================
     文章（#/post 列表 · #/post/<id> 阅读）
     ========================================================= */
  function findPost(id) {
    for (var i = 0; i < POSTS.length; i++) if (POSTS[i] && POSTS[i].id === id) return POSTS[i];
    return null;
  }
  /* 置顶优先，其余按日期倒序；草稿只在后台可见 */
  function postList() {
    var list = POSTS.filter(function (p) { return p && !p.draft; });
    list.sort(function (a, b) {
      return (b.pin ? 1 : 0) - (a.pin ? 1 : 0) ||
        String(b.date || '').localeCompare(String(a.date || ''));
    });
    return list;
  }
  function postExcerpt(p) {
    if (p.excerpt) return p.excerpt;
    var t = MD.plain(p.body || '');
    return t.length > 92 ? t.slice(0, 92) + '…' : t;
  }
  function postTagsOf(list) {
    var tags = ['all'];
    list.forEach(function (p) {
      (p.tags || []).forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); });
    });
    return tags;
  }
  function postHref(p) { return '#/post/' + encodeURIComponent(p.id); }

  function postCardHtml(p) {
    var st = MD.stats(p.body || '');
    var d = String(p.date || '');
    var tags = (p.tags || []).map(function (t) {
      return '<span class="tag post-card__tag" data-post-tag="' + esc(t) + '">#' + esc(t) + '</span>';
    }).join('');
    return '<a class="post-card" href="' + postHref(p) + '">' +
        '<span class="post-card__date">' +
          '<b>' + esc(d.slice(5) || '—') + '</b>' +
          '<span>' + esc(d.slice(0, 4) || '') + '</span>' +
        '</span>' +
        '<span class="post-card__main">' +
          '<span class="post-card__title">' +
            (p.pin ? '<i class="post-card__pin" title="置顶">📌</i>' : '') +
            esc(p.title) +
          '</span>' +
          '<span class="post-card__desc">' + esc(postExcerpt(p)) + '</span>' +
          '<span class="post-card__meta">' + tags +
            '<em>' + esc(MD.fmtChars(st.chars)) + ' · 约 ' + st.minutes + ' 分钟</em>' +
          '</span>' +
        '</span>' +
        '<span class="post-card__go" aria-hidden="true">' + I.arrow + '</span>' +
      '</a>';
  }

  function renderPosts() {
    var all = postList();
    var tags = postTagsOf(all);
    var items = state.postTag === 'all' ? all
      : all.filter(function (p) { return (p.tags || []).indexOf(state.postTag) > -1; });

    if (state.postTag !== 'all' && tags.indexOf(state.postTag) < 0) state.postTag = 'all';

    var totalChars = 0;
    all.forEach(function (p) { totalChars += MD.stats(p.body || '').chars; });

    var statsHtml = '<div class="head-stats">' +
      '<div class="head-stat"><b>' + all.length + '</b><span>篇文章</span></div>' +
      '<div class="head-stat"><b>' + (totalChars >= 10000
        ? (totalChars / 10000).toFixed(1).replace(/\.0$/, '') : (totalChars / 1000).toFixed(1).replace(/\.0$/, '')) +
        '</b><span>' + (totalChars >= 10000 ? '万字' : '千字') + '</span></div>' +
      '<div class="head-stat"><b>' + Math.max(0, tags.length - 1) + '</b><span>个标签</span></div>' +
      '</div>';

    /* 标签筛选条：和分享页同一个组件（宽屏横条 / 窄屏收进顶栏），走 data-post-tag */
    var tagBar = '';
    if (tags.length > 1) {
      tagBar = tagRailHtml({
        attr: 'data-post-tag', current: state.postTag, tags: tags,
        stat: '<span class="tag-bar__stat">共 <b>' + items.length + '</b> 篇' +
          (state.postTag !== 'all'
            ? '<a class="tag-bar__link" href="#/tag/' + encodeURIComponent(state.postTag) + '">↗ 标签页</a>'
            : '') + '</span>'
      });
    }

    /* 按年份分组，翻旧文章时有个时间坐标 */
    var years = [], byYear = {};
    items.forEach(function (p) {
      var y = String(p.date || '').slice(0, 4) || '更早';
      if (!byYear[y]) { byYear[y] = []; years.push(y); }
      byYear[y].push(p);
    });

    var body = years.map(function (y) {
      return '<div class="post-group">' +
          '<div class="post-year"><b>' + esc(y) + '</b><span>' + byYear[y].length + ' 篇</span></div>' +
          '<div class="post-list">' + byYear[y].map(postCardHtml).join('') + '</div>' +
        '</div>';
    }).join('');

    return '<section class="page page--posts">' +
      '<div class="page-head page-head--share">' +
        '<div class="page-head__main">' +
          '<span class="eyebrow">Writing · 手记</span>' +
          '<h1>文章</h1>' +
          '<p>写得长一点的东西：随笔、折腾记录，以及那些值得慢慢想清楚的念头。</p>' +
        '</div>' +
        '<div class="page-head__side">' + statsHtml + '</div>' +
      '</div>' +
      tagBar +
      (items.length ? body : emptyHtml('📝', all.length ? '这个标签下还没有文章' : '还没有文章',
        all.length ? '换个标签，或者点下面的「全部」看看。' : '到后台「文章」页写第一篇，或直接导入 .md 文件。')) +
      '</section>';
  }

  function renderPost() {
    var p = findPost(state.postId);
    if (!p || p.draft) {
      return '<section class="page page--posts">' +
        '<a class="post-back" href="#/post">' + I.arrow + '<span>全部文章</span></a>' +
        emptyHtml('🌫', '这篇找不到了', '可能是删掉了，或者链接少了一个字符。') +
        '</section>';
    }
    var st = MD.stats(p.body || '');
    var html = MD.render(p.body || '');
    var heads = MD.headings(p.body || '').filter(function (h) { return h.level <= 3; });

    var copyUrl = '';
    try { copyUrl = location.origin + location.pathname + '#/post/' + encodeURIComponent(p.id); } catch (e) {}

    var tags = (p.tags || []).map(function (t) {
      return '<span class="tag post-card__tag" data-post-tag="' + esc(t) + '">#' + esc(t) + '</span>';
    }).join('');

    /* 上下篇：list 是「新的在前」，所以 idx+1 是更早的一篇 */
    var list = postList();
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === p.id) { idx = i; break; }
    var newer = idx > 0 ? list[idx - 1] : null;
    var older = idx > -1 && idx + 1 < list.length ? list[idx + 1] : null;
    var pn = (newer || older)
      ? '<div class="post-pn">' +
          (older ? '<a class="post-pn__item" href="' + postHref(older) + '">' +
            '<span class="post-pn__k">← 更早一篇</span><b>' + esc(older.title) + '</b></a>' : '<span></span>') +
          (newer ? '<a class="post-pn__item post-pn__item--next" href="' + postHref(newer) + '">' +
            '<span class="post-pn__k">更新一篇 →</span><b>' + esc(newer.title) + '</b></a>' : '<span></span>') +
        '</div>' +
        /* 换篇的方式不止点链接：正文上左右滑、键盘 ← → 都行。按设备各说一句，
           这也是给「能滑」这件事一个看得见的提示，否则没人会想到去划一下 */
        '<p class="post-swipe-hint">' +
          '<span class="hint-touch">在正文上<b>左右滑动</b>，也能换上一 / 下一篇文章</span>' +
          '<span class="hint-desk">按 <b>←</b> <b>→</b> 键（或触控板横向滑动）也能换上一 / 下一篇文章</span>' +
        '</p>'
      : '';

    var toc = (heads.length >= 3 && READ_CFG.toc !== false)
      ? '<aside class="post-toc" aria-label="本文目录">' +
          '<div class="post-toc__title">本文目录</div>' +
          '<nav>' + heads.map(function (h) {
            return '<a class="post-toc__item post-toc__item--l' + h.level + '" href="#' + h.id +
              '" data-anchor="' + h.id + '">' + esc(h.text) + '</a>';
          }).join('') + '</nav>' +
        '</aside>'
      : '';

    return '<section class="page page--post">' +
      '<a class="post-back" href="#/post">' + I.arrow + '<span>全部文章</span></a>' +
      '<div class="post-layout' + (toc ? ' has-toc' : '') + '">' +
        '<article class="post-article">' +
          '<header class="post-head">' +
            '<h1 class="post-title">' + esc(p.title) + '</h1>' +
            '<div class="post-meta">' +
              '<span class="post-meta__date">' + esc(p.date || '未标日期') + '</span>' +
              '<span class="post-meta__dot">·</span>' +
              '<span>' + esc(MD.fmtChars(st.chars)) + '</span>' +
              '<span class="post-meta__dot">·</span>' +
              '<span>约 ' + st.minutes + ' 分钟读完</span>' +
              (copyUrl ? '<button class="post-meta__copy" type="button" data-copy="' + esc(copyUrl) +
                '" title="复制这篇文章的链接">' + I.copy + '复制链接</button>' : '') +
            '</div>' +
            (tags ? '<div class="post-head__tags">' + tags + '</div>' : '') +
          '</header>' +
          '<div class="md">' + html + '</div>' +
          '<footer class="post-foot">' +
            pn +
            '<div class="post-foot__end"><span>✦</span> 写于 ' + esc(p.date || '某一天') + '</div>' +
            '<a class="btn btn--ghost post-foot__back" href="#/post">← 返回文章列表</a>' +
          '</footer>' +
        '</article>' +
        toc +
      '</div>' +
      '</section>';
  }

  /* ---------- 渲染：关于（#/about） ----------
     正文是 Markdown，和文章页共用一个渲染器与一套排版（`.post-article` / `.md`），
     所以「关于」读起来和一篇长文章一样 —— 标题、列表、引用、表格、代码都支持。
     内容默认写在 config.js 的 about 里，后台「首页内容 → 关于这一页」也能改。 */
  function renderAbout() {
    var a = aboutCfg();
    var st = MD.stats(a.md || '');
    var html = MD.render(a.md || '');
    var heads = MD.headings(a.md || '').filter(function (h) { return h.level <= 3; });

    var toc = heads.length >= 3
      ? '<aside class="post-toc" aria-label="本页目录">' +
          '<div class="post-toc__title">本页目录</div>' +
          '<nav>' + heads.map(function (h) {
            return '<a class="post-toc__item post-toc__item--l' + h.level + '" href="#' + h.id +
              '" data-anchor="' + h.id + '">' + esc(h.text) + '</a>';
          }).join('') + '</nav>' +
        '</aside>'
      : '';

    return '<section class="page page--post page--about">' +
      '<a class="post-back" href="#/home">' + I.arrow + '<span>回到首页</span></a>' +
      '<div class="post-layout' + (toc ? ' has-toc' : '') + '">' +
        '<article class="post-article">' +
          '<header class="post-head">' +
            '<span class="eyebrow">' + esc(a.eyebrow) + '</span>' +
            '<h1 class="post-title">' + esc(a.title) + '</h1>' +
            '<p class="about-lede">' + esc(a.lede) + '</p>' +
            '<div class="post-meta">' +
              (a.updated ? '<span class="post-meta__date">更新于 ' + esc(a.updated) + '</span>' +
                '<span class="post-meta__dot">·</span>' : '') +
              '<span>' + esc(MD.fmtChars(st.chars)) + '</span>' +
              '<span class="post-meta__dot">·</span>' +
              '<span>约 ' + st.minutes + ' 分钟读完</span>' +
            '</div>' +
          '</header>' +
          '<div class="md">' + html + '</div>' +
          '<footer class="post-foot">' +
            '<div class="about-actions">' +
              '<a class="btn btn--primary" href="#/nav">开始逛导航 ' + I.arrow + '</a>' +
              '<a class="btn btn--ghost" href="#/share">看看最近的分享</a>' +
              '<a class="btn btn--ghost" href="#/post">读点长文章</a>' +
            '</div>' +
            '<div class="post-foot__end"><span>✦</span> ' + esc(a.title) + ' · 一直在长</div>' +
          '</footer>' +
        '</article>' +
        toc +
      '</div>' +
      '</section>';
  }

  /* ---------- 渲染：路由 ---------- */
  /* 支持 #/home 这类单段路由，以及 #/post/<id> 这种带参数的详情页 */
  /* =========================================================
     v139：稍后读（#/later） / 足迹（#/insight） / 标签落地页（#/tag/xx）
     ---------------------------------------------------------
     三页都只读本机数据（访问记录、收藏、灵感、稍后读、失效标记），
     不联网、不上报 —— 跟站里其它地方一个原则。
     ========================================================= */

  /* ---------- 稍后读 ---------- */
  function laterItemHtml(x) {
    return '<article class="later-item' + (x.r ? ' is-read' : '') + '" data-later-u="' + esc(x.u) + '">' +
        '<a class="later-item__main" href="' + hrefOf(x.u) + '"' + blankAttr(x.u) + '>' +
          '<span class="later-item__name">' + esc(x.n) + '</span>' +
          '<span class="later-item__host">' + esc(x.d || hostOf(x.u)) + '</span>' +
        '</a>' +
        '<span class="later-item__time">' + esc(shortDate(x.t)) + '</span>' +
        '<span class="later-item__ops">' +
          '<button class="idea-mini' + (x.r ? ' is-on' : '') + '" type="button" data-later-read="1" ' +
            'aria-pressed="' + (x.r ? 'true' : 'false') + '">' + (x.r ? '未读' : '已读') + '</button>' +
          '<button class="idea-mini idea-mini--del" type="button" data-later-del="1">移除</button>' +
        '</span>' +
      '</article>';
  }
  function renderLater() {
    var view = state.laterView || 'all';
    var unread = laterUnread();
    var read = later.length - unread;
    var show = later.filter(function (x) {
      return view === 'all' || (view === 'unread' ? !x.r : !!x.r);
    });
    var list = show.length
      ? show.map(laterItemHtml).join('')
      : '<div class="empty later-empty"><span class="empty__emoji">' + (view === 'read' ? '📖' : '🕓') + '</span>' +
          '<h3>' + (later.length ? (view === 'read' ? '还没有读完的' : '未读的都读完了') : '还没有存过什么') + '</h3>' +
          '<p>' + (later.length
            ? '换个分组看看，或者去导航页再存几个进来。'
            : '在任意站点卡片上点右键（手机上长按），选「稍后看」，它就会排在这里。') + '</p></div>';

    return '<section class="page page--later">' +
      '<div class="page-head page-head--share">' +
        '<div class="page-head__main">' +
          '<span class="eyebrow">Read Later · 稍后读</span>' +
          '<h1>稍后读</h1>' +
          '<p>看见好链接先按住存下来，回头有空慢慢看。存在这台浏览器里，不上传 —— 换设备前记得在后台「备份」带走一份。</p>' +
        '</div>' +
        '<div class="page-head__side"><div class="head-stats">' +
          '<div class="head-stat"><b>' + unread + '</b><span>未读</span></div>' +
          '<div class="head-stat"><b>' + read + '</b><span>已读</span></div>' +
          '<div class="head-stat"><b>' + later.length + '</b><span>一共</span></div>' +
        '</div></div>' +
      '</div>' +
      '<div class="later-bar">' +
        '<div class="tag-bar__chips">' +
          '<button class="tag' + (view === 'all' ? ' is-active' : '') + '" type="button" data-later-view="all">' +
            '全部 <span class="idea-rail__n">' + later.length + '</span></button>' +
          '<button class="tag' + (view === 'unread' ? ' is-active' : '') + '" type="button" data-later-view="unread">' +
            '未读 <span class="idea-rail__n">' + unread + '</span></button>' +
          '<button class="tag' + (view === 'read' ? ' is-active' : '') + '" type="button" data-later-view="read">' +
            '已读 <span class="idea-rail__n">' + read + '</span></button>' +
        '</div>' +
        '<span class="tag-bar__stat">' +
          '<button class="pill pill--btn" type="button" id="laterClearRead"' + (read ? '' : ' disabled') + '>清掉已读</button>' +
        '</span>' +
      '</div>' +
      '<div class="later-list">' + list + '</div>' +
      '</section>';
  }
  function bindLater() {
    var root = $('#app');
    if (!root) return;
    $$('[data-later-view]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        state.laterView = b.getAttribute('data-later-view');
        softRender();
      });
    });
    $$('[data-later-read]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var row = b.closest('[data-later-u]');
        if (!row) return;
        var u = row.getAttribute('data-later-u');
        var cur = b.getAttribute('aria-pressed') === 'true';
        markLater(u, !cur);
        softRender();
      });
    });
    $$('[data-later-del]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var row = b.closest('[data-later-u]');
        if (!row) return;
        removeLater(row.getAttribute('data-later-u'));
        toast('已移除');
        softRender();
      });
    });
    var clr = $('#laterClearRead', root);
    if (clr) clr.addEventListener('click', function () {
      var n = later.filter(function (x) { return x.r; }).length;
      if (!n) return;
      askConfirm({
        title: '清掉已读的 ' + n + ' 条？',
        desc: '只会删掉已经标成「已读」的那几条，未读的不动。删了就找不回来了。',
        ok: '清掉'
      }, function () {
        later = later.filter(function (x) { return !x.r; });
        saveLater();
        toast('已清掉 ' + n + ' 条');
        softRender();
      });
    });
  }

  /* ---------- 足迹（#/insight）：常去 / 冷落 / 年度回顾 / 热力图 / 失效 ---------- */
  var HEAT_DAYS = 126;   /* 18 周 × 7 天，比 120 好排成整周 */
  function dayKey(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  /* 一天记了几条：灵感按 ts，分享按 date */
  function ideaDayMap(list) {
    var m = {};
    list.forEach(function (it) {
      if (!it.ts) return;
      var k = dayKey(new Date(it.ts));
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }
  function heatHtml(list) {
    var map = ideaDayMap(list);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    /* 从今天往回推 HEAT_DAYS 天，起点再往前挪到周日，格子才能按周成列 */
    var start = new Date(today.getTime() - (HEAT_DAYS - 1) * 86400000);
    start.setDate(start.getDate() - start.getDay());
    var cells = [], max = 1, d = new Date(start);
    while (d.getTime() <= today.getTime()) {
      var k = dayKey(d);
      var n = map[k] || 0;
      if (n > max) max = n;
      cells.push({ k: k, n: n, w: d.getDay() === 0 });
      d = new Date(d.getTime() + 86400000);
    }
    var cellsHtml = cells.map(function (c) {
      var lv = c.n === 0 ? 0 : c.n >= 4 ? 4 : c.n;
      return '<i class="heat__c heat__c--' + lv + '" title="' + esc(c.k + (c.n ? ' · ' + c.n + ' 条' : ' · 没记')) + '"></i>';
    }).join('');
    var total = cells.reduce(function (s, c) { return s + c.n; }, 0);
    var active = cells.filter(function (c) { return c.n > 0; }).length;
    return '<div class="heat">' +
        '<div class="heat__grid">' + cellsHtml + '</div>' +
        '<div class="heat__foot">' +
          '<span>近 ' + Math.round(HEAT_DAYS / 7) + ' 周记了 <b>' + total + '</b> 条 · 动手 <b>' + active + '</b> 天</span>' +
          '<span class="heat__legend">少<i class="heat__c heat__c--0"></i><i class="heat__c heat__c--1"></i>' +
            '<i class="heat__c heat__c--2"></i><i class="heat__c heat__c--3"></i><i class="heat__c heat__c--4"></i>多</span>' +
        '</div>' +
      '</div>';
  }
  function yearBarsHtml(list) {
    var y = new Date().getFullYear();
    var cnt = [];
    for (var i = 0; i < 12; i++) cnt.push(0);
    list.forEach(function (it) {
      if (!it.ts) return;
      var d = new Date(it.ts);
      if (d.getFullYear() === y) cnt[d.getMonth()]++;
    });
    var max = Math.max.apply(null, cnt.concat([1]));
    var nowM = new Date().getMonth();
    /* 高度直接写像素：百分比放在 flex 列里要跟标签抢空间，算出来会被压扁 */
    var bars = cnt.map(function (n, i) {
      var h = n ? Math.max(8, Math.round((n / max) * 74)) : 3;
      return '<span class="ybar' + (i === nowM ? ' is-now' : '') + '" title="' + (i + 1) + ' 月 · ' + n + ' 条">' +
          '<i style="height:' + h + 'px"></i>' +
          '<em>' + (i + 1) + '</em>' +
        '</span>';
    }).join('');
    return '<div class="ybars">' + bars + '</div>';
  }
  function renderInsight() {
    var ideas = loadIdeas();
    var top = visitList('top', 20);
    var totalOpens = Object.keys(visits).reduce(function (s, k) { return s + (visits[k].c || 0); }, 0);
    var y = new Date().getFullYear();
    var yStart = new Date(y, 0, 1).getTime();
    var yVisits = Object.keys(visits).filter(function (k) { return (visits[k].t || 0) >= yStart; }).length;
    var yIdeas = ideas.filter(function (it) { return it.ts && it.ts >= yStart; }).length;
    var yFeed = FEED.filter(function (f) { return String(f.date || '').indexOf(y + '-') === 0; }).length;

    /* 冷落收藏：收藏了但半年没打开过（或从来没打开过） */
    var half = Date.now() - 180 * 86400000;
    var byUrl = {};
    allLinks.forEach(function (l) { byUrl[l.u] = l; });
    var cold = state.fav.filter(function (u) {
      var v = visits[u];
      return !v || !v.t || v.t < half;
    }).map(function (u) {
      var l = byUrl[u];
      var v = visits[u];
      return { u: u, n: (l && l.n) || hostOf(u) || u, d: (l && l.d) || '', last: v && v.t ? v.t : 0 };
    }).sort(function (a, b) { return a.last - b.last; }).slice(0, 24);

    var topHtml = top.length ? top.map(function (v, i) {
      return '<a class="top-row" href="' + hrefOf(v.u) + '"' + blankAttr(v.u) + ' data-u="' + esc(v.u) + '">' +
          '<b class="top-row__i">' + (i + 1) + '</b>' +
          '<span class="top-row__n">' + esc(v.n) + '</span>' +
          '<span class="top-row__c">' + (v.c || 0) + ' 次</span>' +
        '</a>';
    }).join('') : emptyHtml('🔥', '还没有「常去」', '去导航页点开几个站点，这里就会按打开次数排出来。');

    var coldHtml = cold.length ? cold.map(function (x) {
      return '<a class="top-row top-row--cold" href="' + hrefOf(x.u) + '"' + blankAttr(x.u) + ' data-u="' + esc(x.u) + '">' +
          '<b class="top-row__i">·</b>' +
          '<span class="top-row__n">' + esc(x.n) + '</span>' +
          '<span class="top-row__c">' + esc(agoText(x.last)) + '</span>' +
        '</a>';
    }).join('') : emptyHtml('🌿', '没有冷落的收藏', '收藏里的站点半年内都点开过，挺勤快。');

    var deadList = dead.map(function (u) {
      var l = byUrl[u];
      return { u: u, n: (l && l.n) || hostOf(u) || u };
    });
    var deadHtml = deadList.length
      ? '<div class="dead-list">' + deadList.map(function (x) {
          return '<span class="dead-row">' +
              '<span class="dead-row__n">' + esc(x.n) + '</span>' +
              '<button class="idea-mini" type="button" data-dead-undo="' + esc(x.u) + '">恢复</button>' +
            '</span>';
        }).join('') + '</div>'
      : emptyHtml('✅', '没有标过失效的站点', '发现哪个站点打不开了，在卡片上右键（手机长按）选「标记失效」，它会从视线里淡下去。');

    return '<section class="page page--insight">' +
      '<div class="page-head page-head--share">' +
        '<div class="page-head__main">' +
          '<span class="eyebrow">Footprint · 足迹</span>' +
          '<h1>我的足迹</h1>' +
          '<p>这些数字全都来自这台浏览器：打开过哪些站、写过什么、哪天花的时间多。没有账号，也没有上报。</p>' +
        '</div>' +
        '<div class="page-head__side"><div class="head-stats">' +
          '<div class="head-stat"><b>' + totalOpens + '</b><span>次打开</span></div>' +
          '<div class="head-stat"><b>' + Object.keys(visits).length + '</b><span>个站点</span></div>' +
          '<div class="head-stat"><b>' + ideas.length + '</b><span>条灵感</span></div>' +
          '<div class="head-stat"><b>' + state.fav.length + '</b><span>个收藏</span></div>' +
        '</div></div>' +
      '</div>' +

      '<section class="insight-sec">' +
        '<div class="section-head"><div><h2>' + y + ' 年，到今天</h2>' +
          '<p>今年的数字还在长 —— 明年这会儿再看一次，会更有意思。</p></div>' +
          '<span class="pill">灵感按月</span></div>' +
        '<div class="year-grid">' +
          '<div class="year-cell"><b>' + yVisits + '</b><span>今年打开过的站点</span></div>' +
          '<div class="year-cell"><b>' + yIdeas + '</b><span>今年写的灵感</span></div>' +
          '<div class="year-cell"><b>' + yFeed + '</b><span>今年分享的条目</span></div>' +
          '<div class="year-cell"><b>' + daysSinceStart() + '</b><span>建站天数</span></div>' +
        '</div>' +
        yearBarsHtml(ideas) +
      '</section>' +

      '<section class="insight-sec">' +
        '<div class="section-head"><div><h2>哪天写得勤</h2>' +
          '<p>一格一天，颜色越深那天记的灵感越多。空的格子不算失败，只是那天在别处忙。</p></div></div>' +
        heatHtml(ideas) +
      '</section>' +

      '<section class="insight-sec">' +
        '<div class="section-head"><div><h2>最常去</h2><p>按这台浏览器里的打开次数排，点一下就过去。</p></div>' +
          '<span class="pill">前 ' + top.length + '</span></div>' +
        '<div class="top-list">' + topHtml + '</div>' +
      '</section>' +

      '<section class="insight-sec">' +
        '<div class="section-head"><div><h2>冷落的收藏</h2><p>收藏了却半年没打开过 —— 要么真忘了，要么当时只是手痒。</p></div></div>' +
        '<div class="top-list">' + coldHtml + '</div>' +
      '</section>' +

      '<section class="insight-sec">' +
        '<div class="section-head"><div><h2>标了失效的</h2><p>那些打不开的站，在这儿可以一键恢复。</p></div></div>' +
        deadHtml +
      '</section>' +
      '</section>';
  }
  function bindInsight() {
    var root = $('#app');
    if (!root) return;
    $$('[data-dead-undo]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var u = b.getAttribute('data-dead-undo');
        setDead(u, false);
        toast('已恢复显示');
        softRender();
      });
    });
  }

  /* ---------- 标签落地页（#/tag/设计） ---------- */
  function ideaCardLite(it) {
    var body = ideaBody(it.text);
    var html = body ? MD.render(body) : '';
    if (!html) html = '<p class="idea-card__raw">' + esc(it.text) + '</p>';
    return '<article class="idea-card idea-card--lite">' +
        '<div class="idea-card__body md">' + html + '</div>' +
        '<footer class="idea-card__foot"><div class="idea-card__meta">' +
          '<span class="idea-card__date">' + esc(ideaTime(it)) + '</span>' +
        '</div></footer>' +
      '</article>';
  }
  function renderTag() {
    var tag = String(state.tagName || '').trim();
    var feeds = FEED.filter(function (f) { return (f.tags || []).indexOf(tag) > -1; });
    var posts = postList().filter(function (p) { return (p.tags || []).indexOf(tag) > -1; });
    var ideas = loadIdeas().filter(function (it) { return (it.tags || []).indexOf(tag) > -1; });

    if (!tag) {
      return '<section class="page">' +
        emptyHtml('🏷', '没指定标签', '从分享页的标签栏点「↗ 标签页」，或者直接访问 #/tag/设计。') +
        '</section>';
    }
    var total = feeds.length + posts.length + ideas.length;
    var sec = function (title, n, body) {
      if (!n) return '';
      return '<section class="insight-sec">' +
          '<div class="section-head"><div><h2>' + esc(title) + '</h2></div><span class="pill">' + n + '</span></div>' +
          body + '</section>';
    };

    return '<section class="page page--tag">' +
      '<div class="page-head page-head--share">' +
        '<div class="page-head__main">' +
          '<span class="eyebrow">Tag · 标签</span>' +
          '<h1>#' + esc(tag) + '</h1>' +
          '<p>' + (total ? '这个标签下攒了 <b>' + total + '</b> 条东西 —— 分享、文章、还有你自己写的灵感。' +
            '链接可以直接发给别人，打开就是这一页。' : '这个标签下还什么都有。') + '</p>' +
        '</div>' +
        '<div class="page-head__side"><div class="head-stats">' +
          '<div class="head-stat"><b>' + feeds.length + '</b><span>条分享</span></div>' +
          '<div class="head-stat"><b>' + posts.length + '</b><span>篇文章</span></div>' +
          '<div class="head-stat"><b>' + ideas.length + '</b><span>条灵感</span></div>' +
        '</div></div>' +
      '</div>' +
      sec('分享', feeds.length, '<div class="tl-cards">' + feeds.map(feedCardHtml).join('') + '</div>') +
      sec('文章', posts.length, '<div class="post-list">' + posts.map(postCardHtml).join('') + '</div>') +
      sec('我的灵感', ideas.length, '<div class="idea-grid idea-grid--lite">' + ideas.map(ideaCardLite).join('') + '</div>') +
      (total ? '' : emptyHtml('🏷', '「#' + esc(tag) + '」下还是空的', '换个标签看看，或者先写一条带这个标签的灵感。')) +
      '</section>';
  }

  function parseHash() {
    var h = '';
    try { h = location.hash.replace(/^#\/?/, '').split('?')[0]; } catch (e) {}
    var m = /^post\/(.+)$/.exec(h);
    if (m) {
      var id = m[1];
      try { id = decodeURIComponent(id); } catch (e) {}
      return { route: 'post', postId: id, tagName: '', adminTab: '' };
    }
    /* #/tag/设计 —— 标签落地页，链接可以直接发给别人 */
    var tm = /^tag\/(.+)$/.exec(h);
    if (tm) {
      var tn = tm[1];
      try { tn = decodeURIComponent(tn); } catch (e2) {}
      return { route: 'tag', postId: '', tagName: tn, adminTab: '' };
    }
    /* #/admin/feed —— 后台每个面板都有自己的地址。
       这样刷新不会跳回第一个面板，前进/后退能当面板历史用，
       也能把「后台 · 分享」这一页直接发给别人。（v142） */
    var am = /^admin\/([a-z]+)$/.exec(h);
    if (am) {
      return { route: 'admin', postId: '', tagName: '', adminTab: am[1] };
    }
    return {
      route: ALL_ROUTES.indexOf(h) > -1 ? h : 'home',
      postId: '', tagName: '', adminTab: ''
    };
  }
  function scrollTop(smooth) {
    /* 注意：html 上有 scroll-behavior:smooth，behavior:'auto' 会跟着 CSS 走变成动画滚动，
       切页时就会和入场动画一起动、看着抖。这里明确用 'instant' 才是真·瞬间归位。 */
    try { window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'instant' }); }
    catch (e) { window.scrollTo(0, 0); }
  }
  /* 点击内链时直接切换；不依赖 hashchange（预览/iframe 中更可靠）
     dir 有值 = 滑动切页（播方向动画）；没值 = 点 tab（直接换，不播入场动画，
     否则每次点击都淡入+上移一下，看着就是"闪"） */
  function navigate(route, dir) {
    if (ALL_ROUTES.indexOf(route) < 0) route = 'home';
    if (state.route === route && !state.postId) { scrollTop(true); return; }
    state.route = route;
    state.postId = '';          // 回到列表页要清掉正在读的那篇
    state.tagName = '';         // 标签页的标签也一起清掉
    state.adminTab = '';        // 后台面板也一样（#/admin 不带面板名）
    try { history.pushState(null, '', '#/' + route); }
    catch (e) { try { location.hash = '#/' + route; } catch (e2) {} }
    render(dir ? { dir: dir } : { animate: false });
  }
  /* 打开一篇文章。dir 有值 = 从左右滑过来（播方向动画），没值 = 直接打开 */
  function openPost(id, dir) {
    var p = findPost(id);
    state.route = 'post';
    state.postId = (p && p.id) || id;
    try { history.pushState(null, '', '#/post/' + encodeURIComponent(state.postId)); }
    catch (e) { try { location.hash = '#/post/' + encodeURIComponent(state.postId); } catch (e2) {} }
    render(dir ? { dir: dir } : { animate: false });
  }
  /* 打开某个标签的落地页（#/tag/设计）。标签放在 state.tagName 里，
     和 postId 一个套路 —— 指到哪一页由它决定。 */
  function openTag(tag) {
    var t = String(tag == null ? '' : tag).trim();
    state.route = 'tag';
    state.postId = '';
    state.tagName = t;
    try { history.pushState(null, '', '#/tag/' + encodeURIComponent(t)); }
    catch (e) { try { location.hash = '#/tag/' + encodeURIComponent(t); } catch (e2) {} }
    render({ animate: false });
  }
  /* 下/上一篇的 id：delta=+1 是更早的一篇，-1 是更新的一篇（和 renderPost 里
     「更早一篇 / 更新一篇」用的是同一个 postList 顺序）。到头了返回空。 */
  function neighborPost(delta) {
    if (!state.postId) return '';
    var list = postList();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== state.postId) continue;
      var j = i + delta;
      return (j >= 0 && j < list.length) ? list[j].id : '';
    }
    return '';
  }
  /* 浏览器前进/后退 */
  function syncFromHash() {
    var nh = parseHash();
    if (nh.route !== state.route || nh.postId !== state.postId ||
        (nh.tagName || '') !== (state.tagName || '') ||
        (nh.adminTab || '') !== (state.adminTab || '')) {
      state.route = nh.route;
      state.postId = nh.postId;
      state.tagName = nh.tagName || '';
      state.adminTab = nh.adminTab || '';
      render({ animate: false });
    }
  }
  /* 按 id 渲染一篇文章。renderPost() 读的是 state.postId，这里临时借一下再还回去 ——
     同步执行，不留中间态。文章页左右滑动的"邻页"就是靠它提前画出来的。 */
  function postHtmlById(id) {
    var bak = state.postId;
    state.postId = id;
    var html = renderPost();
    state.postId = bak;
    return html;
  }
  /* 只算某个路由的页面 HTML：不碰 DOM、不跑副作用。
     左右滑动时用它先把"邻页"备好，手指慢慢划就能看到下一页的内容了。
     postId 显式传 null 表示"文章列表"（邻页不可能是正在读的那一篇）。 */
  function routeHtml(route, postId) {
    var pid = postId === undefined ? state.postId : postId;
    return route === 'admin'
         ? (window.XY_ADMIN ? window.XY_ADMIN.render() : renderHome())
         : route === 'nav' ? renderNavCached()
         : route === 'share' ? renderShare()
         : route === 'post' ? (pid ? postHtmlById(pid) : renderPosts())
         : route === 'idea' ? renderIdea()
         : route === 'later' ? renderLater()
         : route === 'insight' ? renderInsight()
         : route === 'tag' ? renderTag()
         : route === 'about' ? renderAbout()
         : renderHome();
  }
  function render(opts) {
    opts = opts || {};
    var animate = opts.animate !== false;      // 是否播放页面入场动画
    var resetScroll = opts.resetScroll !== false; // 是否回到顶部
    if (ALL_ROUTES.indexOf(state.route) < 0) state.route = 'home';
    // 供 CSS 用（比如只在导航页显示顶栏的分类按钮）
    document.documentElement.setAttribute('data-route', state.route);
    var app = $('#app');
    var html = routeHtml(state.route);
    app.innerHTML = html;
    // 顶栏「标签」按钮只在这页真的有标签栏时露面（分享页 / 文章列表；阅读页没有）
    document.documentElement.setAttribute('data-tagbar', app.querySelector('#tagRail') ? 'on' : 'off');
    // 原地更新（筛选、收藏、搜索）不重播入场动画，避免视觉抖动
    if (!animate) {
      var page = app.firstElementChild;
      if (page) page.style.animation = 'none';
    } else if (opts.dir === 'right' || opts.dir === 'left') {
      // 滑动切换：新页面从对应方向滑入，强化方向感
      var pg = app.firstElementChild;
      if (pg) pg.classList.add(opts.dir === 'right' ? 'page--from-right' : 'page--from-left');
    }
    bindRouteFx();
    updateNavActive();
    updateGlider();
    syncHeaderSearch();
    if (state.route === 'home') { startRotator(); animateCounters(); }
    if (state.route === 'nav') { bindNavPage(); }
    if (state.route === 'share' || state.route === 'post') { bindTagRail(); syncTagBtn(); }
    if (state.route === 'idea') { bindIdea(); }
    if (state.route === 'later') { bindLater(); }
    if (state.route === 'insight') { bindInsight(); }
    if (state.route === 'admin' && window.XY_ADMIN) window.XY_ADMIN.bind(app);
    if (resetScroll) scrollTop(false);
  }
  /* 原地更新：不跳顶、不重播动画 */
  function softRender() { render({ animate: false, resetScroll: false }); }

  function bindRouteFx() { /* 预留：页面级动效钩子 */ }

  /* ---------- 顶栏状态 ---------- */
  function updateNavActive() {
    $$('.nav__item').forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('data-route') === state.route);
    });
  }
  /* 滑块只动 transform：GPU 合成，不触发布局，切换页面时不会和入场动画抢帧 */
  var gliderLast = {};
  function updateGlider() {
    // 顶栏胶囊 + 手机端底部 tab 栏各有一个滑块，都跟着当前页面走
    [['#nav', '#navGlider'], ['#dockNav', '#dockGlider']].forEach(function (pair) {
      var nav = $(pair[0]), glider = $(pair[1]);
      if (!nav || !glider) return;
      // 这一条当前是 display:none（比如手机端的顶栏胶囊）就跳过，别写一堆 0
      if (!nav.getClientRects().length) return;
      var active = $('.nav__item.is-active', nav);
      if (!active) { glider.style.opacity = '0'; return; }
      var nr = nav.getBoundingClientRect(), ar = active.getBoundingClientRect();
      if (!nr.width || !ar.width) return;                 // 布局还没稳，这一帧不画
      var x = ar.left - nr.left - (nav.clientLeft || 0);
      var y = ar.top - nr.top - (nav.clientTop || 0);
      var sig = [x.toFixed(2), y.toFixed(2), ar.width.toFixed(2), ar.height.toFixed(2)].join('|');
      if (gliderLast[pair[0]] === sig) { glider.style.opacity = '1'; return; }  // 没变就不写，省一次重绘
      gliderLast[pair[0]] = sig;
      glider.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
      glider.style.top = y.toFixed(2) + 'px';
      glider.style.width = ar.width.toFixed(2) + 'px';
      glider.style.height = ar.height.toFixed(2) + 'px';
      glider.style.opacity = '1';
    });
  }

  /* ---------- 首页交互 ---------- */
  function animateCounters() {
    var els = $$('.stat b[data-count]');
    if (!els.length) return;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    els.forEach(function (el) {
      var target = parseInt(el.getAttribute('data-count'), 10) || 0;
      // 后台标签页 / 减少动态：直接落定终值，避免停在 0
      if (reduce || document.hidden) { el.textContent = target; return; }
      var startT = null, dur = 1100, done = false;
      function step(ts) {
        if (!startT) startT = ts;
        var p = Math.min(1, (ts - startT) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step); else done = true;
      }
      requestAnimationFrame(step);
      // 兜底：无论动画是否被节流，确保最终数值正确
      setTimeout(function () { if (!done) el.textContent = target; }, dur + 260);
    });
  }

  /* ---------- 导航页交互 ---------- */
  var spyObserver = null;
  function bindNavPage() {
    syncCatBtn(null);   // 进入导航页先归位，滚动后由下方 spy 联动
    var favBtn = $('#favToggle');
    if (favBtn) favBtn.addEventListener('click', function () { state.favOnly = !state.favOnly; softRender(); });

    // 「最近访问 / 最常去」切换 + 清空
    var modeBtn = $('#recentModeBtn');
    if (modeBtn) modeBtn.addEventListener('click', function () {
      state.recentMode = state.recentMode === 'top' ? 'recent' : 'top';
      softRender();
    });
    var clrBtn = $('#recentClear');
    if (clrBtn) clrBtn.addEventListener('click', function () {
      /* 清空是不可撤销的，先弹确认框问一句（以前点一下就没了） */
      askConfirm({
        icon: '🧹',
        title: '清空访问记录？',
        desc: '「最近访问 / 最常去」里记下的站点会全部清掉，<b>只清这台浏览器里的记录</b>；' +
              '收藏夹、站点数据和文章都不受影响。',
        ok: '清空记录',
        cancel: '算了'
      }, function () {
        clearVisits();
        toast('已清空访问记录');
        softRender();
      });
    });

    var railList = $('#catRailList');
    if (railList) {
      railList.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.cat-item') : null;
        if (!btn || btn.classList.contains('is-hidden')) return;
        var id = btn.getAttribute('data-cat');
        /* 勾选模式：点一下是"选中/取消"，不再跳转 */
        if (state.pickMode) {
          var i = state.onlyCats.indexOf(id);
          if (i > -1) state.onlyCats.splice(i, 1);
          else state.onlyCats.push(id);
          applyOnlyCats();
          return;
        }
        closeCatSheet();
        scrollToCat(id);
      });
    }

    /* 「只看」开关：开了之后分类项变成勾选框；关掉就恢复成全部分类 */
    var pickBtn = $('#catPickToggle');
    if (pickBtn) pickBtn.addEventListener('click', function () {
      var rail = $('#catRail');
      var wasSheet = !!(rail && rail.classList.contains('is-sheet'));
      state.pickMode = !state.pickMode;
      if (!state.pickMode) state.onlyCats = [];
      softRender();
      if (wasSheet) openCatSheet();   // 手机端是底部弹层，重绘后要重新弹开
      if (state.pickMode) toast('点分类勾选，只看选中的几个');
    });

    bindCatRail();

    setupSpy();
  }

  /* 顶栏「分类」按钮上显示当前所在分类 */
  function catById(id) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i];
    return null;
  }
  function syncCatBtn(catId) {
    var em = $('#headerCatEmoji'), nm = $('#headerCatName');
    if (!em || !nm) return;
    var c = catId ? catById(catId) : null;
    em.textContent = (c && c.icon) || '🗂';
    nm.textContent = c ? c.name : '全部分类';
  }

  /* ---------- 分享页 / 文章页：顶栏「标签」按钮 + 底部标签面板 ---------- */
  /* 两个页面各自记着自己的筛选状态，取哪个看当前路由 */
  function curTag() {
    return state.route === 'post' ? state.postTag : state.feedTag;
  }
  function syncTagBtn() {
    var nm = $('#headerTagName'), btn = $('#headerTag');
    if (!nm) return;
    var t = curTag();
    nm.textContent = t === 'all' ? '全部标签' : '#' + t;
    if (btn) {
      var rail = $('#tagRail');
      btn.setAttribute('aria-expanded', rail && rail.classList.contains('is-sheet') ? 'true' : 'false');
    }
  }
  function openTagSheet() {
    var rail = $('#tagRail');
    if (!rail) return;
    rail.classList.add('is-sheet');
    var btn = $('#headerTag');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    var sheet = $('#tagSheet');
    if (sheet) {
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
      sheet.setAttribute('aria-label', '选择标签');
    }
    // .page 入场动画的 transform 会让 fixed 弹层以页面为包含块，打开时先收掉
    var pg = document.querySelector('.page');
    if (pg) pg.style.animation = 'none';
    // 当前标签滚到面板里看得见的位置
    var bar = $('#tagBar');
    var cur = bar && bar.querySelector('.tag.is-active');
    if (bar && cur) bar.scrollTop = Math.max(0, cur.offsetTop - bar.offsetTop - 10);
  }
  function closeTagSheet() {
    var rail = $('#tagRail');
    if (!rail || !rail.classList.contains('is-sheet')) return false;
    rail.classList.remove('is-sheet');
    var btn = $('#headerTag');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    return true;
  }
  function bindTagRail() {
    var close = $('#tagSheetClose'), scrim = $('#tagRailScrim');
    if (close) close.addEventListener('click', function () { closeTagSheet(); });
    if (scrim) scrim.addEventListener('click', function () { closeTagSheet(); });
  }

  /* 打开分类选择面板（手机端底部弹层）；role/aria 只在真的当弹层用时挂上 */
  function openCatSheet() {
    var rail = $('#catRail');
    if (!rail) return;
    rail.classList.add('is-sheet');
    var btn = $('#headerCat');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    var sheet = $('#catRailSheet');
    if (sheet) {
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
      sheet.setAttribute('aria-label', '选择分类');
    }
    // .page 的入场动画带着 transform，会变成 fixed 弹层的包含块；打开时把这层动画收掉
    var pg = document.querySelector('.page');
    if (pg) pg.style.animation = 'none';
    // 把当前所在分类滚到面板里看得见的位置
    var list = $('#catRailList');
    var cur = list && list.querySelector('.cat-item.is-active');
    if (cur && list) list.scrollTop = Math.max(0, cur.offsetTop - list.offsetTop - 10);
  }

  /* 关掉分类选择面板 */
  function closeCatSheet() {
    var rail = $('#catRail');
    if (!rail || !rail.classList.contains('is-sheet')) return false;
    rail.classList.remove('is-sheet');
    var btn = $('#headerCat');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    var sheet = $('#catRailSheet');
    if (sheet) {
      sheet.removeAttribute('role');
      sheet.removeAttribute('aria-modal');
      sheet.removeAttribute('aria-label');
    }
    return true;
  }

  /* 滚到某个分类块 —— 分类栏、顶栏分类按钮、全站搜索结果里的「分类」项都走这里。
     落点交给 CSS 的 scroll-margin-top 留出顶栏高度；近处平滑滚过去，隔着好几屏直接跳，
     免得长距离平滑滚动一路重排、越滑越卡。
     （分类块用了 content-visibility:auto，视口外的块高度是估算值，所以必须让浏览器
      自己算位置 —— scrollIntoView 会先按需布局再定位，自己拼 scrollTo 会滚偏。） */
  function scrollToCat(id) {
    var block = $('#cat-' + id);
    if (!block) return;
    var near = Math.abs(block.getBoundingClientRect().top) < window.innerHeight * 1.5;
    block.scrollIntoView({ behavior: near ? 'smooth' : 'instant', block: 'start' });
    syncCatBtn(id);
    $$('.cat-item').forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-cat') === id); });
  }

  /* ---------- 链接卡片的小菜单：收藏 / 复制链接 ----------
     手机上按住卡片 480ms 弹出来（卡片上那两颗图标已经去掉了）；
     电脑上直接在卡片上右键弹出来 —— 卡面上不再挂常驻按钮。 */
  function closeCardMenu() {
    var m = $('#cardMenu');
    if (!m) return false;
    if (m._esc) document.removeEventListener('keydown', m._esc);
    m.remove();
    return true;
  }
  function openCardMenu(card, x, y, atCursor) {
    closeCardMenu();
    var url = card.getAttribute('href') || '';
    var fav = isFav(url);
    var lat = isLater(url);
    var dd = isDead(url);
    var el = document.createElement('div');
    el.className = 'card-menu';
    el.id = 'cardMenu';
    el.setAttribute('role', 'menu');
    el.innerHTML =
      '<button class="card-menu__i' + (fav ? ' is-on' : '') + '" type="button" role="menuitem" aria-pressed="' + (fav ? 'true' : 'false') + '" data-fav="' + esc(url) + '">' +
        I.star + '<span>' + (fav ? '取消收藏' : '收藏') + '</span></button>' +
      /* v139：稍后读 / 失效标记 */
      '<button class="card-menu__i' + (lat ? ' is-later' : '') + '" type="button" role="menuitem" aria-pressed="' + (lat ? 'true' : 'false') + '" data-later="' + esc(url) + '">' +
        I.clock + '<span>' + (lat ? '移出稍后读' : '稍后看') + '</span></button>' +
      '<button class="card-menu__i' + (dd ? ' is-dead' : '') + '" type="button" role="menuitem" aria-pressed="' + (dd ? 'true' : 'false') + '" data-dead="' + esc(url) + '">' +
        I.ban + '<span>' + (dd ? '恢复可用' : '标记失效') + '</span></button>' +
      '<button class="card-menu__i" type="button" role="menuitem" data-copy="' + esc(url) + '">' +
        I.copy + '<span>复制链接</span></button>';
    document.body.appendChild(el);
    var r = el.getBoundingClientRect();
    var left, top;
    if (atCursor) {
      /* 鼠标右键：菜单左上角就落在指针处，跟系统右键菜单一个习惯 */
      left = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - r.width - 8));
      top = Math.min(Math.max(8, y), Math.max(8, window.innerHeight - r.height - 8));
    } else {
      /* 手指长按：菜单浮在手指上方居中，免得被指头挡住 */
      left = Math.min(Math.max(8, x - r.width / 2), Math.max(8, window.innerWidth - r.width - 8));
      top = y - r.height - 14;
      if (top < 8) top = Math.min(y + 20, window.innerHeight - r.height - 8);
    }
    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(top) + 'px';
    el.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-fav],[data-copy],[data-later],[data-dead]') : null;
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      if (b.hasAttribute('data-fav')) {
        toggleFav(b.getAttribute('data-fav'));
      } else if (b.hasAttribute('data-later')) {
        var u = b.getAttribute('data-later');
        if (isLater(u)) {
          removeLater(u);
          toast('已移出稍后读');
        } else {
          addLater({ u: u, n: card.getAttribute('data-n'), d: card.getAttribute('data-d') });
          toast('🕓 已存进稍后读 · 点顶栏的时钟去看');
        }
        updateLaterBadge();
      } else if (b.hasAttribute('data-dead')) {
        var u2 = b.getAttribute('data-dead');
        var on = !isDead(u2);
        setDead(u2, on);
        /* 只改这一张卡，不整页重渲 —— 菜单还开着，重渲会把卡片换掉 */
        if (card && card.classList) {
          card.classList.toggle('is-dead', on);
          if (on) card.setAttribute('title', '已标记失效：' + (card.getAttribute('data-n') || ''));
          else card.removeAttribute('title');
        }
        toast(on ? '已标记失效，卡片会淡下去' : '已恢复显示');
      } else {
        copyUrl(b.getAttribute('data-copy'));
      }
      closeCardMenu();
    });
    /* 电脑上右键弹出来的菜单，按 Esc 能关（手机上也有用，无副作用） */
    el._esc = function (e2) { if (e2.key === 'Escape') closeCardMenu(); };
    document.addEventListener('keydown', el._esc);
  }
  /* 触摸端：按住 480ms 弹菜单；长按后抬手不要触发卡片跳转 */
  function bindLongPress() {
    var timer = null, fired = false, touched = false, sx = 0, sy = 0, card = null;
    var stop = function () { if (timer) { clearTimeout(timer); timer = null; } };
    document.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'touch') return;
      var c = e.target.closest ? e.target.closest('.link-card') : null;
      if (!c) return;
      card = c; touched = true; fired = false; sx = e.clientX; sy = e.clientY;
      stop();
      timer = setTimeout(function () {
        timer = null; fired = true;
        if (navigator.vibrate) { try { navigator.vibrate(12); } catch (err) {} }
        openCardMenu(card, sx, sy);
        // 兜底：有些浏览器长按后不补发 click，别让这个标记一直挂着吃掉下一次点击
        setTimeout(function () { fired = false; }, 1200);
      }, 480);
    }, { passive: true });
    document.addEventListener('pointermove', function (e) {
      if (timer && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) stop();
    }, { passive: true });
    var end = function () { stop(); touched = false; };
    document.addEventListener('pointerup', end, { passive: true });
    document.addEventListener('pointercancel', end, { passive: true });
    // 长按弹菜单后：吞掉随之而来的那次 click，别让卡片跳走（只针对刚长按的这张卡片）
    document.addEventListener('click', function (e) {
      if (!fired) return;
      fired = false;
      var t = e.target && e.target.closest ? e.target.closest('.link-card') : null;
      if (t && t === card) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    // 点别处关菜单；长按卡片时压掉系统菜单
    document.addEventListener('pointerdown', function (e) {
      var m = $('#cardMenu');
      if (!m) return;
      if (e.target.closest && e.target.closest('#cardMenu')) return;
      closeCardMenu();
    }, { passive: true });
    /* 右键（电脑端）：直接把同一个菜单弹在指针处。
       手指长按的那次 contextmenu 只负责压掉系统菜单 —— 菜单已经由上面的计时器弹过了，
       所以 touched / fired 为真时只 preventDefault、不再重复弹。 */
    document.addEventListener('contextmenu', function (e) {
      var c = e.target.closest ? e.target.closest('.link-card') : null;
      if (!c) return;
      e.preventDefault();
      if (touched || fired) return;
      openCardMenu(c, e.clientX, e.clientY, true);
    });
  }

  /* ---------- 分类栏自适应：一屏装下全部分类，不用滚动条 ----------
     左栏高度锁在一屏内（见 .cat-rail 的 max-height），但 50 个分类排两列要 1100+px，
     矮一点的屏幕上就被裁掉、还得在栏里滚（滚动条虽然是隐形的，但也看不全）。
     这里按「屏幕到底能用多高」反算：先少加列，行高压到 30～34px 之间；
     实在放不下再加到 3～4 列。最终行数×行高 + 间距一定 ≤ 可用高度，所以不出滚动条。
     只在左栏真正可见（>960px）时算；手机端那栏是底部面板，不参与。 */
  var RAIL_ROW_MAX = 34, RAIL_ROW_MIN = 26, RAIL_GAP = 4, RAIL_COLS_MAX = 4, RAIL_COL_W = 100;

  function fitCatRail() {
    var rail = $('#catRail'), list = $('#catRailList');
    if (!rail || !list) return;
    var layout = rail.closest ? rail.closest('.nav-layout') : null;
    if (window.innerWidth <= 960) {
      list.style.removeProperty('--rail-cols');
      list.style.removeProperty('--rail-row');
      if (layout) layout.style.removeProperty('--rail-w');
      return;
    }

    var items = $$('.cat-item:not(.is-hidden)', list).length;
    if (!items) return;

    /* 可用高度跟 CSS 里 .cat-rail 的 max-height 用同一个口径：视口 - 顶栏 - 44 */
    var header = $('#header');
    var avail = window.innerHeight - (header ? header.offsetHeight : 88) - 44;

    /* 扣掉本来就占在栏里的：标题一行 + 筛选框 */
    var head = $('.cat-rail__head', rail);
    if (head) avail -= head.offsetHeight;
    var filter = $('#catFilter');
    if (filter) {
      var box = filter.closest ? filter.closest('.cat-filter') : filter.parentNode;
      avail -= (box ? box.offsetHeight : 40) + 10;
    }

    /* 一列最少能放几行（行高按最挤的 26px 算）→ 不够就加列，最多 4 列 */
    var rowsFit = Math.max(1, Math.floor((avail + RAIL_GAP) / (RAIL_ROW_MIN + RAIL_GAP)));
    var cols = Math.max(2, Math.min(Math.ceil(items / rowsFit), RAIL_COLS_MAX));

    /* 用定下来的列数反算行高：在 26～34 之间取，让总高刚好塞满可用空间 */
    var rows = Math.ceil(items / cols);
    var rowH = Math.floor((avail - (rows - 1) * RAIL_GAP) / rows);
    rowH = Math.max(RAIL_ROW_MIN, Math.min(RAIL_ROW_MAX, rowH));

    list.style.setProperty('--rail-cols', cols);
    list.style.setProperty('--rail-row', rowH + 'px');

    /* 列一多，原来 300～410px 的栏宽就不够分，分类名会被省略号吃掉 → 按列数把栏放宽 */
    if (layout) {
      var base = Math.max(300, Math.min(window.innerWidth * 0.23, 410));
      var need = cols * RAIL_COL_W + (cols - 1) * 6 + 10;
      layout.style.setProperty('--rail-w', Math.round(Math.max(base, Math.min(need, window.innerWidth * 0.4))) + 'px');
    }
  }

  /* ---------- 分类栏：手机端底部选择面板 + 筛选（分类上百个也好找） ---------- */
  function bindCatRail() {
    var rail = $('#catRail'), list = $('#catRailList');
    if (!rail || !list) return;

    fitCatRail();
    var close = $('#catRailClose'), scrim = $('#catRailScrim');
    if (close) close.addEventListener('click', function () { closeCatSheet(); });
    if (scrim) scrim.addEventListener('click', function () { closeCatSheet(); });

    // 筛选：只筛分类胶囊，不动正文（正文搜索走顶栏搜索框）
    var input = $('#catFilter');
    if (!input) return;
    var chips = $$('.cat-item', list);
    var emptyEl = $('#catFilterEmpty');
    var run = function () {
      var q = norm(input.value);
      var hits = 0;
      chips.forEach(function (c) {
        var ok = !q || (c.getAttribute('data-search') || '').indexOf(q) > -1;
        c.classList.toggle('is-hidden', !ok);
        if (ok) hits++;
      });
      state.catFilter = input.value;
      if (emptyEl) emptyEl.hidden = !(q && !hits);
      fitCatRail();          /* 筛完只剩几个时，列数跟着收回来 */
    };
    run();
    input.addEventListener('input', run);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; run(); }
      if (e.key === 'Enter') {
        var first = list.querySelector('.cat-item:not(.is-hidden)');
        if (first) first.click();
      }
    });
  }
  /* ---------- 顶栏搜索（与导航页搜索合并） ---------- */
  function syncHeaderSearch() {
    var input = $('#headerSearch');
    if (!input) return;
    if (input.value !== state.query) input.value = state.query;
    var wrap = $('#headerSearchWrap');
    if (wrap) wrap.classList.toggle('has-value', !!state.query);
  }
  /* ---------- 顶栏搜索：搜全站（页面 / 分类 / 站点 / 分享 / 文章） ----------
     输入就在搜索框下面弹结果，不整页跳走；↑↓ 选、↵ 打开、Esc 收起。
     匹配逻辑与 ⌘K 命令面板共用 searchIndexHits()，两边结果永远一致。 */
  var hdr = { open: false, items: [], sel: 0 };
  function hdrClose() {
    var el = $('#hdrHits');
    hdr.open = false;
    hdr.items = [];
    if (el) { el.hidden = true; el.innerHTML = ''; }
  }
  function hdrMove(d) {
    if (!hdr.open || !hdr.items.length) return;
    hdr.sel = (hdr.sel + d + hdr.items.length) % hdr.items.length;
    $$('[data-idx]', $('#hdrHits')).forEach(function (el) {
      el.classList.toggle('is-sel', +el.getAttribute('data-idx') === hdr.sel);
    });
    var cur = $('.is-sel', $('#hdrHits'));
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }
  function hdrRender(q) {
    var el = $('#hdrHits');
    if (!el) return;
    var n = norm(q);
    if (!n) { hdrClose(); return; }

    /* 站点这一组直接用 searchLinks()：它跟导航页筛选是同一套匹配 + 排序
       （站名命中优先，其次拼音，最后描述/网址），所以下面"看全部 N 个"的数字
       跳过去之后分毫不差。其它几类走 PALETTE_INDEX。 */
    var siteHits = searchLinks(q);
    var others = PALETTE_INDEX.filter(function (it) {
      if (it.type === '站点') return false;
      if (it.hay.indexOf(n) > -1) return true;
      return /^[a-z0-9]+$/.test(n) && !!it.py && it.py.indexOf(n) > -1;
    });

    var byType = {};
    pickByGroup(others, 3).forEach(function (it) { (byType[it.type] = byType[it.type] || []).push(it); });
    byType['站点'] = siteHits.slice(0, 3).map(function (l) {
      return { type: '站点', name: l.n, sub: l.cat + ' · ' + (l.d || hostOf(l.u)), url: l.u, icon: l.icon, external: true };
    });
    /* 固定顺序：页面 → 分类 → 站点 → 分享 → 文章 */
    var items = [];
    ['页面', '分类', '站点', '分享', '文章'].forEach(function (t) {
      if (byType[t] && byType[t].length) items = items.concat(byType[t]);
    });

    var html = '';
    if (!items.length) {
      html = '<div class="hdr-hits__empty"><b>没找到「' + esc(q.trim()) + '」</b>' +
             '<span>换个词试试：站点名、分类名，或者文章的标题</span></div>';
    } else {
      var lastType = null;
      items.forEach(function (it, i) {
        if (it.type !== lastType) {
          lastType = it.type;
          html += '<div class="hdr-hits__group">' + esc(it.type) + '</div>';
        }
        var ext = !!it.external || it.url.charAt(0) !== '#';
        var mark = textMarkHtml(it.name, q);       // 命中的字高亮
        html += '<div class="hdr-hits__item" data-idx="' + i + '" role="option">' +
          '<span class="hdr-hits__ico">' + esc(it.icon || '•') + '</span>' +
          '<span class="hdr-hits__txt"><span class="hdr-hits__name">' + mark + '</span>' +
            '<span class="hdr-hits__sub">' + esc(it.sub || '') + '</span></span>' +
          '<span class="hdr-hits__go">' + (it.catId ? '查看' : ext ? '↗' : '跳转') + '</span>' +
          '</div>';
      });
    }

    /* 站点结果太多时给一条"去导航页看全部"，键盘也能选中（数字与跳转后一致） */
    if (siteHits.length > 3) {
      var label = '在导航页看全部 ' + siteHits.length + ' 个站点结果';
      items.push({ type: '动作', act: 'all', name: label });
      html += '<button class="hdr-hits__all" type="button" data-idx="' + (items.length - 1) + '">' +
              label + ' <span>↵</span></button>';
    }

    el.innerHTML = html;
    el.hidden = false;
    hdr.open = true;
    hdr.items = items;
    hdr.sel = 0;
    $$('[data-idx]', el).forEach(function (n) { n.classList.toggle('is-sel', +n.getAttribute('data-idx') === 0); });
  }
  function hdrActivate(idx) {
    if (!hdr.open) return;
    var it = hdr.items[idx];
    if (!it) return;
    if (it.act === 'all') {                        // 去导航页看全部站点结果
      hdrClose();
      if (state.route === 'nav') softRender(); else navigate('nav');
      return;
    }
    hdrClose();
    if (it.catId) {                                // 分类：跳到导航页并定位到那一块
      var wasNav = state.route === 'nav';
      state.query = '';                            // 别让搜索词把导航页筛成一片空白
      syncHeaderSearch();
      if (wasNav) softRender(); else navigate('nav');
      setTimeout(function () { scrollToCat(it.catId); }, wasNav ? 40 : 160);
      return;
    }
    var ext = !!it.external || it.url.charAt(0) !== '#';
    if (ext) recordVisit({ n: it.name, u: it.url, d: it.sub });
    go(it.url, ext);
  }

  function bindHeaderSearch() {
    var input = $('#headerSearch');
    if (!input) return;
    var wrap = $('#headerSearchWrap');
    var run = debounce(function () { softRender(); }, 200);

    input.addEventListener('input', function () {
      state.query = input.value;
      syncHeaderSearch();
      hdrRender(input.value);                     // 全站结果浮层，立刻出
      if (state.route === 'nav') run();           // 停手后再把导航页筛一遍
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        hdrClose();
        state.query = ''; input.value = ''; syncHeaderSearch();
        if (state.route === 'nav') softRender();
        return;
      }
      if (!hdr.open) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); hdrMove(e.key === 'ArrowDown' ? 1 : -1); }
      else if (e.key === 'Enter') { e.preventDefault(); hdrActivate(hdr.sel); }
    });
    /* 失焦后稍等一下再收：点结果项时是先 blur 再 click，立刻收就点空了 */
    input.addEventListener('blur', function () {
      setTimeout(function () {
        if (!hdr.open) return;
        if (wrap && wrap.contains(document.activeElement)) return;
        hdrClose();
      }, 160);
    });
    /* 框里还有关键词时再点回来（或按 / 聚焦），结果要重新弹出来 */
    input.addEventListener('focus', function () {
      if (norm(input.value)) hdrRender(input.value);
    });
    var clearBtn = $('#headerSearchClear');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      state.query = ''; input.value = ''; syncHeaderSearch(); hdrClose();
      if (state.route === 'nav') softRender();
      input.focus();
    });
    var hitsEl = $('#hdrHits');
    if (hitsEl) hitsEl.addEventListener('click', function (e) {
      var t = e.target.closest('[data-idx]');
      if (!t) return;
      hdrActivate(+t.getAttribute('data-idx'));
    });
  }
  function setupSpy() {
    if (spyObserver) spyObserver.disconnect();
    if (!('IntersectionObserver' in window)) return;
    var blocks = $$('[data-cat-block]');
    if (!blocks.length) return;
    spyObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var id = en.target.getAttribute('data-cat-block');
          $$('.cat-item').forEach(function (b) {
            b.classList.toggle('is-active', b.getAttribute('data-cat') === id);
          });
          syncCatBtn(id);   // 顶栏分类按钮跟着显示当前分类
        }
      });
    }, { rootMargin: '-160px 0px -70% 0px', threshold: 0 });
    blocks.forEach(function (b) { spyObserver.observe(b); });
  }

  /* ---------- 命令面板 ---------- */
  var palette = {
    open: false,
    items: [],
    sel: 0,
    bind: []
  };
  function buildPaletteIndex() {
    var list = [];
    var PAGE_INFO = {
      home: ['首页', '🌌'], nav: ['导航', '🧭'], share: ['分享', '✨'], post: ['文章', '✍️'],
      about: ['关于', '🌠'], idea: ['灵感随记', '💡'], later: ['稍后读', '🕓'], insight: ['我的足迹', '🌿']
    };
    /* about / idea / later / insight 不在主导航里（不参与左右滑动），
       但搜索 / 命令面板要能搜到 —— v139 起把后三个也放进来 */
    ['home', 'nav', 'share', 'post', 'idea', 'about', 'later', 'insight'].forEach(function (r) {
      var info = PAGE_INFO[r] || [r, '📄'];
      list.push({ type: '页面', name: info[0], sub: '#/' + r, url: '#/' + r, icon: info[1], isRoute: true });
    });
    CATS.forEach(function (c) {
      list.push({ type: '分类', name: c.name, sub: c.links.length + ' 个站点 · ' + c.desc, url: '#/nav', icon: c.icon, catId: c.id });
    });
    allLinks.forEach(function (l) {
      list.push({ type: '站点', name: l.n, sub: l.cat + ' · ' + (l.d || hostOf(l.u)), url: l.u, icon: l.icon, external: true });
    });
    FEED.forEach(function (f) {
      list.push({ type: '分享', name: f.title, sub: f.date + ' · ' + (f.tags || []).join(' '), url: f.url, icon: f.icon, external: f.url.charAt(0) !== '#' });
    });
    POSTS.filter(function (p) { return p && !p.draft; }).forEach(function (p) {
      var st = MD.stats(p.body || '');
      list.push({
        type: '文章', name: p.title,
        sub: (p.date || '') + ' · ' + (p.tags || []).join(' ') + ' · ' + MD.fmtChars(st.chars),
        url: '#/post/' + encodeURIComponent(p.id), icon: '📄', postId: p.id
      });
    });
    /* v139：标签也进索引 —— 输入「设计」能直接跳到标签落地页 */
    var tagN = {}, tagOrder = [];
    var addTag = function (arr) {
      (arr || []).forEach(function (t) {
        if (!t) return;
        if (!(t in tagN)) { tagN[t] = 0; tagOrder.push(t); }
        tagN[t]++;
      });
    };
    FEED.forEach(function (f) { addTag(f.tags); });
    POSTS.filter(function (p) { return p && !p.draft; }).forEach(function (p) { addTag(p.tags); });
    loadIdeas().forEach(function (it) { addTag(it.tags); });
    tagOrder.forEach(function (t) {
      list.push({
        type: '标签', name: '#' + t, sub: tagN[t] + ' 条内容 · 打开标签页',
        url: '#/tag/' + encodeURIComponent(t), icon: '🏷', tagName: t
      });
    });
    /* v139：灵感随记也进索引（以前 ⌘K 搜不到自己写的东西） */
    loadIdeas().forEach(function (it) {
      var txt = String(ideaBody(it.text) || '').replace(/\s+/g, ' ').trim();
      list.push({
        type: '灵感',
        name: txt.slice(0, 30) || '（空的一条）',
        sub: ideaTime(it) + ((it.tags || []).length ? ' · ' + it.tags.join(' ') : ''),
        url: '#/idea', icon: '💡', ideaId: it.id
      });
    });
    // 拼音索引：输入 zh / txsp 也能命中
    list.forEach(function (it) {
      it.py = pyInitials(it.name);
      it.hay = norm(it.name + it.sub + it.type);   // 预拼好，输入时只做 indexOf
    });
    return list;
  }
  var PALETTE_INDEX = buildPaletteIndex();

  /* 全站搜索的唯一匹配逻辑：命令面板（⌘K）和顶栏搜索框共用它，
     所以"搜得到什么"永远一致 —— 页面 / 分类 / 站点 / 分享 / 文章。
     中文按包含匹配；纯字母数字再比一遍拼音首字母（输入 txsp 能命中「腾讯视频」） */
  function searchIndexHits(q, cap) {
    var n = norm(q);
    if (!n) return [];
    var out = [];
    for (var i = 0; i < PALETTE_INDEX.length; i++) {
      var it = PALETTE_INDEX[i];
      var hit = it.hay.indexOf(n) > -1 ||
                (/^[a-z0-9]+$/.test(n) && !!it.py && it.py.indexOf(n) > -1);
      if (hit) {
        out.push(it);
        if (cap && out.length >= cap) break;
      }
    }
    return out;
  }
  /* 每组只取前几条，保证下拉里"每类都露个脸"，不至于全是站点把文章挤没 */
  function pickByGroup(hits, perGroup) {
    var out = [], cnt = {};
    hits.forEach(function (it) {
      var c = cnt[it.type] || 0;
      if (c >= perGroup) return;
      cnt[it.type] = c + 1;
      out.push(it);
    });
    return out;
  }

  function paletteOpen() {
    var el = $('#palette');
    if (!el) return;
    // 搜索面板总在最前：先收起底部选择面板，避免层级打架
    closeCatSheet();
    closeTagSheet();
    palette.open = true;
    el.hidden = false;
    document.body.classList.add('no-scroll');
    var input = $('#paletteInput');
    input.value = '';
    palette.sel = 0;
    paletteRender('');
    setTimeout(function () { input.focus(); }, 30);
  }
  function paletteClose() {
    var el = $('#palette');
    if (!el) return;
    palette.open = false;
    el.hidden = true;
    document.body.classList.remove('no-scroll');
  }

  /* ---------- 快捷键说明面板（全站快捷键的唯一出处） ---------- */
  var KEYS_HELP = [
    { k: ['⌘', 'K'], t: '全局搜索', d: '打开命令面板：搜站点、分类、分享、文章' },
    { k: ['/'], t: '全局搜索', d: '同上，少按一个键' },
    { k: ['1', '2', '3', '4'], t: '首页 / 导航 / 分享 / 文章', d: '直接跳到对应页面' },
    { k: ['←', '→'], t: '上一页 / 下一页', d: '在 首页 ⇄ 导航 ⇄ 分享 ⇄ 文章 之间切换' },
    { k: ['T'], t: '切换主题', d: '暗色 / 明亮来回切' },
    { k: ['R'], t: '随机漫游', d: '弹出「今日三站」：三个不同分类各抽一个' },
    { k: ['F'], t: '只看收藏', d: '跳到导航页，只看已收藏的站点' },
    { k: ['?'], t: '快捷键说明', d: '打开这张面板' },
    { k: ['Esc'], t: '关闭面板', d: '收起搜索 / 分类 / 快捷键面板' }
  ];
  function keysHelpOpen() { var el = $('#keys'); return !!(el && !el.hidden); }
  function renderKeysHelp() {
    var list = $('#keysList');
    if (!list) return;
    list.innerHTML = KEYS_HELP.map(function (r) {
      return '<div class="keys__row"><span class="keys__keys">' +
        r.k.map(function (x) { return '<kbd>' + esc(x) + '</kbd>'; }).join('') +
        '</span><span class="keys__txt"><b>' + esc(r.t) + '</b><span>' + esc(r.d) + '</span></span></div>';
    }).join('');
  }
  function openKeysHelp() {
    var el = $('#keys');
    if (!el || !el.hidden) return;
    renderKeysHelp();
    el.hidden = false;
    document.body.classList.add('no-scroll');
  }
  function closeKeysHelp() {
    var el = $('#keys');
    if (!el || el.hidden) return false;
    el.hidden = true;
    document.body.classList.remove('no-scroll');
    return true;
  }
  function paletteRender(q) {
    var hits = norm(q) ? searchIndexHits(q) : PALETTE_INDEX.slice(0, 12);
    palette.items = hits.slice(0, 40);
    if (palette.sel >= palette.items.length) palette.sel = 0;

    var list = $('#paletteList');
    if (!hits.length) {
      list.innerHTML = emptyHtml('🛰️', '没有找到匹配项', '试试「设计」「AI」「音乐」等关键词。');
      return;
    }
    var html = '', lastType = null, idx = -1;
    palette.items.forEach(function (it, i) {
      idx = i;
      if (it.type !== lastType) { lastType = it.type; html += '<div class="palette__group">' + esc(it.type) + '</div>'; }
      html += '<div class="palette__item' + (i === palette.sel ? ' is-sel' : '') + '" data-idx="' + i + '" data-url="' + esc(it.url) + '" data-external="' + (!!it.external || (it.url.charAt(0) !== '#')) + '">' +
        '<span class="glyph glyph--sm" style="background:linear-gradient(135deg,rgba(124,156,255,.4),rgba(180,124,255,.3))">' + esc(it.icon) + '</span>' +
        '<span class="palette__item__txt"><span class="palette__item__name">' + esc(it.name) + '</span>' +
          '<span class="palette__item__sub">' + esc(it.sub) + '</span></span>' +
        '<span class="palette__item__hint">' + (it.url.charAt(0) === '#' ? '跳转' : '↗') + '</span>' +
        '</div>';
    });
    list.innerHTML = html;
    paletteScrollSel();
  }
  function paletteScrollSel() {
    var el = $('.palette__item.is-sel', $('#paletteList'));
    if (el) el.scrollIntoView({ block: 'nearest' });
  }
  function paletteMove(d) {
    if (!palette.items.length) return;
    palette.sel = (palette.sel + d + palette.items.length) % palette.items.length;
    $$('.palette__item', $('#paletteList')).forEach(function (el, i) {
      el.classList.toggle('is-sel', i === palette.sel);
    });
    paletteScrollSel();
  }
  function paletteActivate() {
    var it = palette.items[palette.sel];
    if (!it) return;
    var ext = !!it.external || it.url.charAt(0) !== '#';
    if (ext) recordVisit({ n: it.name, u: it.url, d: it.sub });
    go(it.url, ext);
  }
  function go(url, external) {
    paletteClose();
    if (external) window.open(url, '_blank', 'noopener');
    else location.hash = url;
  }

  /* ---------- 主题 ---------- */
  function applyTheme(v, persist) {
    var t = v === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    if (persist) { try { localStorage.setItem(THEME_KEY, t); } catch (e) {} }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#eef1f8' : '#05060b');
  }
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (!saved) {
      var c = window.XYStore ? window.XYStore.get() : null;
      saved = (c && c.themeDefault) || 'dark';
    }
    applyTheme(saved, false);
  }
  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    var next = cur === 'light' ? 'dark' : 'light';
    applyTheme(next, true);
    toast(next === 'light' ? '☀️ 已切换到明亮模式' : '🌙 已切换到暗色模式');
  }

  /* ---------- 主题外观 / 阅读体验（后台「主题」页可改） ---------- */
  /* 预设色板：一组三色渐变（a1 主色、a2 、a3） */
  var ACCENT_PRESETS = {
    aurora: ['#7c9cff', '#b47cff', '#4fe3d0'],
    ocean:  ['#4fa8ff', '#38cfe0', '#7bf0c4'],
    sunset: ['#ff9364', '#ff6b93', '#ffc46b'],
    forest: ['#6fdfa4', '#3fc9a9', '#b8e05c'],
    grape:  ['#a78bfa', '#f472b6', '#6ea8ff'],
    sakura: ['#ff9ec4', '#ffb0d6', '#c9a7ff'],
    ink:    ['#9aa7bd', '#c3c9d6', '#7f8ea3']
  };
  var READ_CFG = { size: 16, line: 1.95, font: 'sans', width: 820, toc: true };

  function hexToHsl(hex) {
    var r = parseInt(hex.substr(1, 2), 16) / 255,
        g = parseInt(hex.substr(3, 2), 16) / 255,
        b = parseInt(hex.substr(5, 2), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2, h = 0, s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: h, s: s * 100, l: l * 100 };
  }
  function hslCss(h, s, l) {
    h = ((h % 360) + 360) % 360;
    return 'hsl(' + Math.round(h) + ',' + Math.round(Math.min(100, Math.max(0, s))) + '%,' +
      Math.round(Math.min(92, Math.max(8, l))) + '%)';
  }
  /* 一组三色：预设直接用，自定义就从主色推两个邻近色（色相 ±，明度略抬） */
  function accentTrio(t) {
    t = t || {};
    if (t.accent !== 'custom' && ACCENT_PRESETS[t.accent]) return ACCENT_PRESETS[t.accent].slice();
    var hex = /^#[0-9a-f]{6}$/i.test(String(t.accentColor || '')) ? t.accentColor : '#7c9cff';
    var c = hexToHsl(hex);
    return [hex, hslCss(c.h + 36, c.s + 4, c.l + 6), hslCss(c.h - 56, c.s + 2, c.l + 10)];
  }
  function mixCss(color, pct) {
    return 'color-mix(in srgb, ' + color + ' ' + pct + '%, transparent)';
  }

  /* 把后台设置写成 CSS 变量 / data-* 属性：改完全站立刻变，不用刷新 */
  function applyLook() {
    if (!window.XYStore) return;
    var c = window.XYStore.get();
    var t = c.theme || {};
    var r = c.read || {};
    var trio = accentTrio(t);
    var root = document.documentElement, st = root.style;

    st.setProperty('--a1', trio[0]);
    st.setProperty('--a2', trio[1]);
    st.setProperty('--a3', trio[2]);
    st.setProperty('--grad', 'linear-gradient(120deg, ' + trio[0] + ', ' + trio[1] + ' 52%, ' + trio[2] + ')');
    st.setProperty('--grad-soft', 'linear-gradient(120deg, ' + mixCss(trio[0], 26) + ', ' +
      mixCss(trio[1], 20) + ' 55%, ' + mixCss(trio[2], 18) + ')');
    st.setProperty('--glow', '0 0 0 1px ' + mixCss(trio[0], 25) + ', 0 18px 50px -20px ' + mixCss(trio[0], 45));

    root.setAttribute('data-glow', t.glow || 'normal');
    root.setAttribute('data-radius', t.radius || 'normal');

    /* 阅读排版 */
    READ_CFG = r;
    st.setProperty('--post-size', (r.size || 16) + 'px');
    st.setProperty('--post-line', String(r.line || 1.95));
    st.setProperty('--post-width', (r.width || 820) + 'px');
    root.setAttribute('data-readfont', r.font === 'serif' ? 'serif' : 'sans');
    root.setAttribute('data-toc', r.toc === false ? 'off' : 'on');
  }

  /* ---------- 后台配置 → 界面 ---------- */
  var LOGO_HTML = '';
  var FAVICON_HTML = '';
  function applyLogo(src) {
    var mark = $('.brand__mark');
    if (!mark) return;
    if (!LOGO_HTML) LOGO_HTML = mark.innerHTML;
    if (src) {
      mark.classList.add('brand__mark--img');
      mark.innerHTML = '<img src="' + esc(src) + '" alt="" />';
    } else {
      mark.classList.remove('brand__mark--img');
      if (LOGO_HTML) mark.innerHTML = LOGO_HTML;
    }
  }
  function applyFavicon(src) {
    var link = document.querySelector('link[rel="icon"]');
    if (!link) return;
    if (!FAVICON_HTML) FAVICON_HTML = link.getAttribute('href');
    link.setAttribute('href', src || FAVICON_HTML);
  }
  function applyBrand() {
    var c = window.XYStore ? window.XYStore.get() : null;
    if (!c) return;
    var set = function (sel, txt) { var el = $(sel); if (el) el.textContent = txt; };
    set('#brandName', c.siteName);
    set('#brandLatin', c.siteLatin);
    set('#footerName', c.siteName + ' ' + c.siteLatin);
    set('#footerTagline', c.tagline);
    document.title = c.siteName + ' ' + c.siteLatin + ' · ' + c.tagline;
    applyLogo(c.logoImage);
    applyFavicon(c.favicon);
  }
  function applyHeaderLinks() {
    var wrap = $('#headerLinks');
    if (!wrap || !window.XYStore) return;
    var links = window.XYStore.activeLinks();
    if (!links.length) { wrap.hidden = true; wrap.innerHTML = ''; return; }
    wrap.hidden = false;
    wrap.innerHTML = links.map(function (l) {
      var internal = l.url.charAt(0) === '#' || l.url.charAt(0) === '/';
      var ico = l.icon
        ? '<span class="hlink__icon">' + esc(l.icon) + '</span>'
        : '';
      return '<a class="hlink' + (l.icon ? '' : ' hlink--noicon') + '" href="' + esc(toHref(l.url)) + '"' +
        (internal ? '' : ' target="_blank" rel="noopener"') +
        ' title="' + esc(l.name) + '" aria-label="' + esc(l.name) + '">' +
        ico +
        '<span class="hlink__name">' + esc(l.name) + '</span></a>';
    }).join('');
  }
  /* 允许省略 https:// ；站内 #/route 与 mailto: 原样保留 */
  function toHref(u) {
    u = String(u || '').trim();
    if (/^(https?:|mailto:|tel:)/i.test(u) || u.charAt(0) === '#' || u.charAt(0) === '/') return u;
    return 'https://' + u;
  }
  function applyChrome() {
    if (!window.XYStore) return;
    var c = window.XYStore.get();
    applyBrand();
    applyHeaderLinks();
    var sw = $('#headerSearchWrap');
    if (sw) sw.hidden = !c.showSearch;
    /* 导航页三个显示开关：卡片图标 / 卡片介绍 / 分类前面的 emoji。
       走 <html data-*> + CSS 控制，后台一点开关整页立刻变，不用重渲染两万张卡。 */
    var root = document.documentElement;
    root.setAttribute('data-icons', c.showIcons ? 'on' : 'off');
    root.setAttribute('data-desc', c.showDesc ? 'on' : 'off');
    root.setAttribute('data-cat-icon', c.showCatIcon ? 'on' : 'off');
    // 卡片密度：compact | normal | comfy
    root.setAttribute('data-density', c.cardDensity || 'normal');
    // 主题配色 / 阅读排版（后台「主题」页）
    applyLook();
    updateLaterBadge();
  }

  /* ---------- Toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 1900);
  }

  /* ---------- 复制 / 随机 ---------- */
  function copyUrl(url) {
    var done = function () { toast('链接已复制 ✓'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(function () { fallbackCopy(url, done); });
    } else fallbackCopy(url, done);
  }
  function fallbackCopy(url, cb) {
    var ta = document.createElement('textarea');
    ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); cb(); } catch (e) { toast('复制失败，请手动复制'); }
    document.body.removeChild(ta);
  }
  /* =========================================================
     v139：随机漫游升级 —— 「今日三站」
     ---------------------------------------------------------
     原来是从全部站点里随机开一个（关掉之后一点印象都没有）。
     现在从**三个不同分类**里各抽一个，摆成一张小面板：
     想全开就全开，不想就挑一个。多开标签页会被浏览器拦，所以默认不自动开。
     ========================================================= */
  function randomPicks(n) {
    var byCat = {}, cats = [];
    allLinks.forEach(function (l) {
      if (!l || !l.u) return;
      var c = l.cat || '其它';
      if (!byCat[c]) { byCat[c] = []; cats.push(c); }
      byCat[c].push(l);
    });
    /* 洗牌分类再逐个抽 —— 直接洗全部站点会在同一个大分类里连抽三个 */
    for (var i = cats.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = cats[i]; cats[i] = cats[j]; cats[j] = t;
    }
    var out = [];
    for (var k = 0; k < cats.length && out.length < n; k++) {
      var arr = byCat[cats[k]];
      out.push(arr[Math.floor(Math.random() * arr.length)]);
    }
    return out;
  }
  function closeRandomSheet() {
    var el = $('#randomSheet');
    if (!el) return false;
    if (el._esc) document.removeEventListener('keydown', el._esc);
    if (el._lock) document.body.classList.remove('no-scroll');
    el.remove();
    return true;
  }
  function openRandomSheet() {
    closeRandomSheet();
    var picks = randomPicks(3);
    if (!picks.length) return;
    var el = document.createElement('div');
    el.className = 'rsheet';
    el.id = 'randomSheet';
    el.innerHTML =
      '<div class="rsheet__scrim" data-rsheet-close></div>' +
      '<div class="rsheet__panel" role="dialog" aria-modal="true" aria-label="随机漫游">' +
        '<div class="rsheet__head">' +
          '<b>🎲 今日三站</b>' +
          '<span>三个不同分类，各抽一个</span>' +
          '<button class="rsheet__x" type="button" data-rsheet-close aria-label="关闭">' +
            '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        '</div>' +
        '<div class="rsheet__list">' +
          picks.map(function (l) {
            return '<a class="rsheet__card" href="' + hrefOf(l.u) + '"' + blankAttr(l.u) + '>' +
                '<span class="rsheet__cat">' + esc(l.cat || '其它') + '</span>' +
                '<span class="rsheet__n">' + esc(l.n) + '</span>' +
                '<span class="rsheet__d">' + esc(l.d || hostOf(l.u)) + '</span>' +
              '</a>';
          }).join('') +
        '</div>' +
        '<div class="rsheet__foot">' +
          '<button class="btn btn--ghost" type="button" data-rsheet-again>🎲 换一批</button>' +
          '<button class="btn btn--ghost" type="button" data-rsheet-all>三个都开</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    el._lock = !document.body.classList.contains('no-scroll');
    if (el._lock) document.body.classList.add('no-scroll');
    el._picks = picks;
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-rsheet-close]')) { closeRandomSheet(); return; }
      if (e.target.closest('[data-rsheet-again]')) { openRandomSheet(); return; }
      if (e.target.closest('[data-rsheet-all]')) {
        var opened = 0;
        picks.forEach(function (l) {
          if (String(l.u).charAt(0) === '#') { location.hash = l.u; return; }
          try { if (window.open(l.u, '_blank', 'noopener')) opened++; } catch (err) {}
        });
        closeRandomSheet();
        toast(opened ? '🎲 开了 ' + opened + ' 个标签页' : '浏览器拦住了弹窗，点卡片一个个开吧');
        return;
      }
      /* 点了某一张卡：面板收起来，正常打开它 */
      if (e.target.closest('.rsheet__card')) setTimeout(closeRandomSheet, 60);
    });
    el._esc = function (e2) { if (e2.key === 'Escape') closeRandomSheet(); };
    document.addEventListener('keydown', el._esc);
  }
  function randomLink() { openRandomSheet(); }

  /* ---------- 滚动 / 光标 ---------- */
  var header, progress, cursorGlow;
  /* 把顶栏实际高度写进 --header-h，供吸顶元素（工具栏 / 分类栏 / 时间线日期）对齐 */
  function syncHeaderVar() {
    if (!header) return;
    var h = Math.round(header.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty('--header-h', h + 'px');
  }
  /* 窗口尺寸变化（含旋转）后重新量一次顶栏高度，保证吸顶元素对齐 */
  var onResize = debounce(function () { syncHeaderVar(); fitCatRail(); }, 140);
  function onScroll() {
    var y = window.scrollY || document.documentElement.scrollTop;
    if (header) header.classList.toggle('is-stuck', y > 12);
    syncHeaderVar();
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
  }
  function initCursorGlow() {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    var raf = null, mx = 0, my = 0;
    window.addEventListener('mousemove', function (e) {
      document.body.classList.add('has-pointer');
      mx = e.clientX; my = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(function () {
        cursorGlow.style.transform = 'translate(' + mx + 'px,' + my + 'px) translate(-50%,-50%)';
        raf = null;
      });
    });
  }

  /* ---------- 全局事件 ---------- */
  /* ---------- 双击顶栏空白处：一键到页面底部 ----------
     导航页三万多像素长，鼠标滚到底要滚半天；双击顶栏那条最省事。
     落在链接 / 按钮 / 输入框上就放行，让它们照常工作；
     已经到底了再双击一次回顶部（不然只能去点右下角那个按钮）。 */
  var bottomTimer = null;

  /* 到页面底部 / 已在底部就回顶部。双击和手机双击（两次点按）共用这一段 */
  function togglePageBottom() {
    if (bottomTimer) { clearInterval(bottomTimer); bottomTimer = null; }

    var vh = window.innerHeight;
    var max = Math.max(0, document.documentElement.scrollHeight - vh);
    if (max <= 40) return;                       // 这一页本来就不用滚

    /* 已经在最底下了 → 回顶部 */
    if (window.scrollY >= max - 40) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast('回到顶部 ↑');
      return;
    }

    /* 距离太远（好几屏）就直接跳，别让人等一段长长的滚动动画 */
    var far = max - window.scrollY;
    window.scrollTo({ top: max, behavior: far > vh * 3 ? 'instant' : 'smooth' });
    toast('已到页面底部 ↓');

    /* 导航页的分类块是 content-visibility:auto —— 视口外还没排版，
       一路跳下来页高会被撑大，所以要再补几下，直到真的到底 */
    var tries = 0;
    bottomTimer = setInterval(function () {
      var m = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (window.scrollY < m - 4) window.scrollTo({ top: m, behavior: 'instant' });
      if (++tries >= 4) { clearInterval(bottomTimer); bottomTimer = null; }
    }, 220);
  }

  /* 顶栏上「不是按钮 / 链接 / 输入框」的地方 = 空白处 */
  function onBlankChrome(t) {
    return !(t && t.closest && t.closest('a, button, input, label, textarea, select, [role="dialog"]'));
  }

  function bindHeaderDblClick() {
    var h = $('#header');
    if (!h) return;

    /* 电脑：双击空白处 */
    h.addEventListener('dblclick', function (e) {
      if (!onBlankChrome(e.target)) return;
      togglePageBottom();
    });

    /* 手机：触屏没有 dblclick，自己认「两次点按」—— 320ms 内、位置基本没动 */
    var lastTap = 0, lastX = 0, lastY = 0;
    h.addEventListener('touchend', function (e) {
      if (!onBlankChrome(e.target)) return;
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      var now = Date.now();
      var near = Math.abs(t.clientX - lastX) < 32 && Math.abs(t.clientY - lastY) < 32;
      if (lastTap && now - lastTap < 320 && near) {
        lastTap = 0;
        if (e.cancelable) e.preventDefault();    // 别让浏览器顺手把页面放大
        togglePageBottom();
      } else {
        lastTap = now; lastX = t.clientX; lastY = t.clientY;
      }
    }, { passive: false });
  }

  function bindGlobal() {
    window.addEventListener('hashchange', syncFromHash);
    window.addEventListener('popstate', syncFromHash);

    // 所有内部路由链接：直接切换，不依赖 hashchange
    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href^="#/"]') : null;
      if (!a) return;
      var href = a.getAttribute('href');
      // 文章详情：#/post/<id>
      var pm = /^#\/post\/(.+)$/.exec(href);
      if (pm) {
        e.preventDefault();
        var pid = pm[1];
        try { pid = decodeURIComponent(pid); } catch (e5) {}
        openPost(pid);
        return;
      }
      // 标签落地页：#/tag/<标签>
      var tgm = /^#\/tag\/(.+)$/.exec(href);
      if (tgm) {
        e.preventDefault();
        var tn = tgm[1];
        try { tn = decodeURIComponent(tn); } catch (e6) {}
        openTag(tn);
        return;
      }
      var route = href.replace(/^#\/?/, '');
      if (ALL_ROUTES.indexOf(route) < 0) return;
      e.preventDefault();
      navigate(route);
    });

    // 后台配置变化 → 立即应用到顶栏 / 页脚
    document.addEventListener('xy:config', function () { applyChrome(); });
    // 后台站点数据变化 → 重建索引（页面在下次渲染时自动使用新数据）
    document.addEventListener('xy:data', function () { refreshData(); });
    // 后台文章变化 → 刷新列表数据
    document.addEventListener('xy:posts', function () { refreshPosts(); });
    // 后台分享条目变化 → 刷新时间线数据
    document.addEventListener('xy:feed', function () { refreshFeed(); });

    // 入场动画一结束就把 animation 摘掉：万一浏览器把收尾的 transform 留在 .page 上，
    // 它会成为 position:fixed 后代的包含块（确认弹窗、表情挑选器、分类面板都会错位）
    document.addEventListener('animationend', function (e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains('page')) t.style.animation = 'none';
    });

    bindHeaderSearch();
    var themeBtn = $('#themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    /* v139：顶栏的时钟 = 稍后读入口（未读条数挂在角标上） */
    var laterBtn = $('#laterBtn');
    if (laterBtn) laterBtn.addEventListener('click', function () { navigate('later'); });
    var randomBtn = $('#randomBtn');
    if (randomBtn) randomBtn.addEventListener('click', randomLink);
    /* v139：页脚的「足迹」入口 */
    var footInsight = $('#footInsight');
    if (footInsight) footInsight.addEventListener('click', function () { navigate('insight'); });
    var adminBtn = $('#adminBtn');
    if (adminBtn) adminBtn.addEventListener('click', function () { navigate('admin'); });

    // 快捷键说明面板（页脚按钮 / 面板关闭 / 点遮罩）
    var keysBtn = $('#keysBtn');
    if (keysBtn) keysBtn.addEventListener('click', function () { openKeysHelp(); });
    var keysX = $('#keysClose');
    if (keysX) keysX.addEventListener('click', function () { closeKeysHelp(); });
    var keysScrim = document.querySelector('[data-keys-close]');
    if (keysScrim) keysScrim.addEventListener('click', function () { closeKeysHelp(); });

    // 顶栏「分类」按钮（导航页 / 窄屏）：开关底部选择面板
    var catBtn = $('#headerCat');
    if (catBtn) catBtn.addEventListener('click', function () {
      var rail = $('#catRail');
      if (rail && rail.classList.contains('is-sheet')) closeCatSheet(); else openCatSheet();
    });

    // 顶栏「标签」按钮（分享页 / 窄屏）：开关标签面板
    var tagBtn = $('#headerTag');
    if (tagBtn) tagBtn.addEventListener('click', function () {
      var rail = $('#tagRail');
      if (rail && rail.classList.contains('is-sheet')) closeTagSheet(); else openTagSheet();
    });
    // 手机端长按卡片 → 收藏 / 复制
    bindLongPress();
    // 双击顶栏空白处 → 到页面底部（已在底部则回顶部）
    bindHeaderDblClick();

    // 返回顶部：往下滚过一屏才浮出来
    var toTop = $('#toTop');
    if (toTop) {
      var syncToTop = function () {
        var on = window.scrollY > 520;
        if (toTop.classList.contains('is-on') !== on) toTop.classList.toggle('is-on', on);
      };
      toTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        toTop.blur();
      });
      window.addEventListener('scroll', syncToTop, { passive: true });
      window.addEventListener('resize', syncToTop, { passive: true });
      syncToTop();
    }

    var palette = $('#palette');
    if (palette) {
      palette.addEventListener('click', function (e) {
        if (e.target.closest('[data-palette-close]')) { paletteClose(); return; }
        var item = e.target.closest('.palette__item');
        if (item) {
          palette.sel = parseInt(item.getAttribute('data-idx'), 10) || 0;
          paletteActivate();
        }
      });
    }
    var pInput = $('#paletteInput');
    if (pInput) {
      pInput.addEventListener('input', function () { palette.sel = 0; paletteRender(pInput.value); });
      pInput.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); paletteMove(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); paletteMove(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); paletteActivate(); }
      });
    }

    document.addEventListener('keydown', function (e) {
      var meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') { e.preventDefault(); if (paletteOpenRef()) paletteClose(); else paletteOpen(); return; }
      if (e.key === 'Escape' && isPaletteOpen()) { paletteClose(); return; }
      if (e.key === 'Escape' && closeKeysHelp()) return;
      if (e.key === 'Escape' && closeCatSheet()) return;
      if (e.key === 'Escape' && closeTagSheet()) return;
      if (e.key === 'Escape' && closeCardMenu()) return;
      if (e.key === 'Escape' && closeRandomSheet()) return;
      if (meta || e.altKey) return;
      if (e.key === '/' && !isTyping(e.target) && !isPaletteOpen()) { e.preventDefault(); paletteOpen(); return; }
      handleShortcutKeys(e);
    });

    // 内容区交互（事件委托）
    var app = $('#app');
    app.addEventListener('click', function (e) {
      var fav = e.target.closest('[data-fav]');
      if (fav) { e.preventDefault(); e.stopPropagation(); toggleFav(fav.getAttribute('data-fav')); return; }
      var copy = e.target.closest('[data-copy]');
      if (copy) { e.preventDefault(); e.stopPropagation(); copyUrl(copy.getAttribute('data-copy')); return; }
      /* 文章标签筛选（用 data-post-tag，避免和分享页的 data-tag 打架） */
      var pt = e.target.closest('[data-post-tag]');
      if (pt) {
        e.preventDefault(); e.stopPropagation();
        state.postTag = pt.getAttribute('data-post-tag');
        if (state.postId) {
          /* 从阅读页点标签 → 回列表并带上筛选 */
          state.postId = '';
          state.route = 'post';
          try { history.pushState(null, '', '#/post'); } catch (e3) {}
          render();
        } else softRender();
        return;
      }
      /* 文章目录锚点：不能让它改 hash（会打乱路由），手动滚过去 */
      var anchor = e.target.closest('[data-anchor]');
      if (anchor) {
        e.preventDefault();
        var el = document.getElementById(anchor.getAttribute('data-anchor'));
        if (el) {
          var hh = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h'), 10) || 96;
          var top = el.getBoundingClientRect().top + window.pageYOffset - hh - 24;
          try { window.scrollTo({ top: top, behavior: 'smooth' }); }
          catch (e4) { window.scrollTo(0, top); }
        }
        return;
      }
      var tag = e.target.closest('[data-tag]');
      if (tag) {
        e.preventDefault(); e.stopPropagation();
        var fromCard = !!tag.closest('.feed-card');
        state.feedTag = tag.getAttribute('data-tag');
        softRender();
        // 从卡片里的标签点进来时，把筛选结果带回视野，避免内容在屏幕外悄悄变了
        if (fromCard) {
          // 窄屏时标签条收在底部面板里（看不见），直接滚到结果列表
          var sheetMode = window.matchMedia('(max-width:960px)').matches;
          var target = sheetMode ? document.querySelector('.timeline') : document.querySelector('.tag-bar');
          if (target) {
            try {
              window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - 120, behavior: 'smooth' });
            } catch (e2) {}
          }
        }
        return;
      }
      var rand = e.target.closest('#heroRandom');
      if (rand) { randomLink(); return; }
      /* v139：导航页「只看收藏」状态下的导出按钮 */
      if (e.target.closest('#favExport')) { exportBookmarks(); return; }
      // 点了站点卡片 / 最近记录 → 记一次访问（收藏、复制按钮已在上面 return 掉）
      var visitEl = e.target.closest('.link-card, .recent-chip');
      if (visitEl) {
        recordVisit({
          n: visitEl.getAttribute('data-n'),
          u: visitEl.getAttribute('data-u'),
          d: visitEl.getAttribute('data-d')
        });
      }
    });

    window.addEventListener('resize', debounce(function () { updateGlider(); syncHeaderVar(); }, 150));
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  function isPaletteOpen() { var el = $('#palette'); return el && !el.hidden; }
  function isInHScroll(el) {
    if (!el || el.nodeType !== 1) return false;
    while (el && el !== document.body) {
      var s = getComputedStyle(el);
      if ((s.overflowX === 'auto' || s.overflowX === 'scroll') &&
          el.scrollWidth - el.clientWidth > 4) return true;
      el = el.parentElement;
    }
    return false;
  }

  /* ---------- 左右滑动切换页面 / 切换文章 ---------- */
  function initSwipe() {
    /* 目标页统一写成 { route, postId }。
       - 在文章阅读页：换的是「上/下一篇文章」，同一个 route、换 postId
       - 别的列表页：按 ROUTES 换 tab */
    function stepTarget(delta) {
      if (state.route === 'post' && state.postId) {
        var nid = neighborPost(delta);
        return nid ? { route: 'post', postId: nid } : null;     // 到头了，不循环
      }
      if (ROUTES.indexOf(state.route) < 0) return null;         // 后台等页面不参与
      var i = ROUTES.indexOf(state.route) + delta;
      if (i < 0 || i >= ROUTES.length) return null;             // 不循环，首尾即止
      return { route: ROUTES[i], postId: '' };
    }
    function goTarget(t, dir) {
      if (!t) return;
      if (t.route === 'post' && t.postId) { openPost(t.postId, dir); return; }
      navigate(t.route, dir);
    }
    function step(delta, dir) { goTarget(stepTarget(delta), dir); }
    function pageEl() { var app = $('#app'); return app ? app.firstElementChild : null; }

    /* 1) 触屏滑动：双页跟手
       手指移动时，当前页和"隔壁那一页"一起跟着平移 —— 慢慢划就能提前看到下一页的内容，
       松手再决定是切页还是弹回去。之前只移动当前页，旁边是空的，所以像"拖走一张纸"。 */
    var EDGE = 26;            // 左右边缘这一条留给系统的手势（iOS/安卓的侧滑返回），不去抢
    var COMMIT = 56;          // 松手时超过这个位移就算切页
    var EASE = 'cubic-bezier(.22,.61,.36,1)';
    var drag = null;
    var moveTimer = null;     // 延后恢复毛玻璃的定时器（连续划动时不能被上一轮的定时器打断）

    /* 把邻页造出来，塞在 #app 里、绝对定位盖在内容区上，初始停在视口外侧。
       纵向位置要对齐"视口顶部"（而不是文档顶部）：页面已经滚到中间时划过来，
       看到的就是新页的开头，松手换页正好归零，视觉上才接得住。 */
    function makeGhost(t, delta) {
      var app = $('#app');
      if (!app) return null;
      var box = document.createElement('div');
      /* 邻页可能是「文章列表」，也可能是上/下一篇文章 —— 都由 stepTarget 给的 {route, postId} 决定 */
      box.innerHTML = routeHtml(t.route, t.postId);
      var g = box.firstElementChild;
      if (!g) return null;
      var pt = parseFloat(getComputedStyle(app).paddingTop) || 0;
      g.classList.add('is-ghost');
      g.setAttribute('aria-hidden', 'true');
      /* 纵向对到"这一页滚到顶时"的位置：页面已经滚到中间再划过来，看到的是新页的开头，
         松手换页正好归零，前后接得上。top 是相对 #app 的 padding box，所以加的是 scrollY。 */
      g.style.top = (window.scrollY + pt).toFixed(1) + 'px';
      var off = delta > 0 ? window.innerWidth : -window.innerWidth;
      g.style.transform = 'translate3d(' + off + 'px,0,0)';
      app.appendChild(g);                           // 追加在最后，#app 的第一个子元素仍是真页
      return { el: g, off: off };
    }
    function moveGhost(ghost, x) {
      if (ghost) ghost.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)';
    }

    document.body.addEventListener('touchstart', function (e) {
      drag = null;
      if (isPaletteOpen() || e.touches.length !== 1) return;
      var t = e.touches[0];
      var vw = window.innerWidth;
      if (t.clientX < EDGE || t.clientX > vw - EDGE) return;   // 边缘让给系统返回手势
      if (isInHScroll(e.target)) return;                       // 横向滚动容器内不接管
      var pg = pageEl();
      if (!pg) return;
      drag = { x: t.clientX, y: t.clientY, dx: 0, decided: false, horiz: false,
               pg: pg, ok: true, t0: Date.now(), vw: vw, ghost: null, target: null, delta: 0 };
    }, { passive: true });

    document.body.addEventListener('touchmove', function (e) {
      if (!drag || !drag.ok) return;
      var t = e.touches[0];
      var dx = t.clientX - drag.x, dy = t.clientY - drag.y;
      if (!drag.decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        drag.decided = true;
        drag.horiz = Math.abs(dx) > Math.abs(dy) * 1.15;       // 横向意图明显才接管
        if (!drag.horiz) { drag.ok = false; return; }
        drag.pg.classList.add('is-drag');                      // 关掉入场动画，直接跟手
        clearTimeout(moveTimer);                               // 上一轮"恢复毛玻璃"的定时器作废
        document.body.classList.add('is-page-move');            // 让顶栏/底部 tab 先关掉毛玻璃
        drag.delta = dx < 0 ? 1 : -1;
        drag.target = stepTarget(drag.delta);
        if (drag.target) {
          /* 造邻页要把两万多个节点塞进 DOM（导航页更是一整套卡片），这一下会占几十毫秒。
             排到下一帧再干：手指这一下先正常跟手，画面先动起来，构建的代价藏在后面。
             如果这期间已经松手（drag 归 null），就干脆不造了 —— 提交时没有邻页也能切 */
          var d0 = drag;
          requestAnimationFrame(function () {
            if (drag !== d0 || !d0.target) return;
            d0.ghost = makeGhost(d0.target, d0.delta);
            if (d0.ghost) moveGhost(d0.ghost, d0.dx + d0.ghost.off);
          });
        }
      }
      e.preventDefault();                                      // 拦下浏览器自己的横滑 / 回弹 / 返回
      var can = !!drag.target;
      var move = can ? dx : dx * 0.28;                          // 已经到头了，给个阻尼
      drag.dx = move;
      drag.pg.style.transform = 'translate3d(' + move.toFixed(1) + 'px,0,0)';
      if (drag.ghost) moveGhost(drag.ghost, move + drag.ghost.off);
    }, { passive: false });

    document.body.addEventListener('touchend', function () {
      if (!drag || !drag.ok) { drag = null; return; }
      var d = drag; drag = null;
      if (!d.decided || !d.horiz) { cleanup(d.pg, d.ghost); return; }
      var pg = d.pg, dx = d.dx, ghost = d.ghost;
      var dt = Math.max(1, Date.now() - d.t0);
      var fast = Math.abs(dx) / dt > 0.35;                       // 甩得够快也算切页
      var can = !!d.target;
      /* 两种算切页：拖过 COMMIT 那道线；或者甩得够快、且确实划出去了一小段（12px 以上）。
         后者是为了"轻甩一下就走"的手感，同时不会把误触（手指抖几像素）当成翻页 */
      var commit = can && (Math.abs(dx) > COMMIT || (fast && Math.abs(dx) > 12));
      var dur = 170;

      if (!commit) {                                            // 没过阈值：两页一起弹回原位
        pg.style.transition = 'transform ' + dur + 'ms ' + EASE;
        pg.style.transform = 'translate3d(0,0,0)';
        if (ghost) {
          ghost.el.style.transition = 'transform ' + dur + 'ms ' + EASE;
          moveGhost(ghost, ghost.off);
        }
        setTimeout(function () { cleanup(pg, ghost); }, dur + 30);
        return;
      }

      /* 提交：旧页顺着手指方向滑出去，邻页同时滑进来；
         等邻页正好走到位的那一帧再换路由 —— 换完之后新页面接在同一位置，看不出来被替换过 */
      var out = (dx < 0 ? -1 : 1) * Math.max(d.vw, 300);
      pg.style.transition = 'transform ' + dur + 'ms ' + EASE;
      pg.style.transform = 'translate3d(' + out + 'px,0,0)';
      if (ghost) {
        ghost.el.style.transition = 'transform ' + (dur - 20) + 'ms ' + EASE;
        moveGhost(ghost, 0);
      }
      var target = d.target;
      setTimeout(function () { goTarget(target); }, dur - 20);   // 不传 dir：动画已经播完了
      // 等这一轮彻底落定再恢复毛玻璃，中途恢复会逐帧重采样、白掉帧
      moveTimer = setTimeout(function () { document.body.classList.remove('is-page-move'); }, dur + 120);
    }, { passive: true });

    document.body.addEventListener('touchcancel', function () {
      if (!drag) return;
      var pg = drag.pg, ghost = drag.ghost; drag = null;
      if (pg) {
        pg.style.transform = 'translate3d(0,0,0)';
        if (ghost) moveGhost(ghost, ghost.off);
        setTimeout(function () { cleanup(pg, ghost); }, 220);
      }
    }, { passive: true });

    function cleanup(pg, ghost) {
      if (ghost && ghost.el && ghost.el.parentNode) ghost.el.parentNode.removeChild(ghost.el);
      if (!pg) return;
      pg.classList.remove('is-drag');
      /* 关键：显式关掉 animation。上一页可能还带着 page--from-right 这个类，
         一旦移除 is-drag，animation-name 从 none 变回去，入场动画会重播 —— 看着就是"闪一下" */
      pg.style.animation = 'none';
      pg.style.transition = '';
      pg.style.transform = '';
      pg.style.willChange = '';
      clearTimeout(moveTimer);
      document.body.classList.remove('is-page-move');
    }

    /* 2) 触控板 / 鼠标横向滑动 */
    var acc = 0, idle = null, lock = 0;
    window.addEventListener('wheel', function (e) {
      if (isPaletteOpen()) return;
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.15) return; // 竖向滚动：完全不干预
      if (isInHScroll(e.target)) return;
      e.preventDefault();                                          // 抑制浏览器自带的前进/后退滑动
      var now = Date.now();
      if (now < lock) return;
      acc += e.deltaX;
      clearTimeout(idle);
      idle = setTimeout(function () { acc = 0; }, 200);
      if (Math.abs(acc) > 90) {
        var d = acc > 0 ? 1 : -1;
        acc = 0; lock = now + 650;
        step(d, d > 0 ? 'right' : 'left');
      }
    }, { passive: false });
  }
  function paletteOpenRef() { return isPaletteOpen(); }
  function isTyping(el) {
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
  }

  /* 全站快捷键：跳页 / 切主题 / 随机 / 收藏 / 快捷键面板 */
  function handleShortcutKeys(e) {
    // 打字、下拉框里不拦；面板打开时让给面板
    if (isTyping(e.target) || isPaletteOpen() || keysHelpOpen()) return;
    if (e.key === '?') { e.preventDefault(); openKeysHelp(); return; }
    var idx = ['1', '2', '3', '4'].indexOf(e.key);
    if (idx > -1) { e.preventDefault(); navigate(ROUTES[idx]); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (isInHScroll(e.target)) return;              // 横向可滚的容器，方向键留给它
      var ar = e.key === 'ArrowRight' ? 1 : -1;
      /* 文章阅读页：←/→ 切上/下一篇，跟左右滑动一个意思。没有邻篇就不拦（留给正常滚动） */
      if (state.route === 'post' && state.postId) {
        var nid = neighborPost(ar);
        if (!nid) return;
        e.preventDefault();
        openPost(nid, ar > 0 ? 'right' : 'left');
        return;
      }
      var i = ROUTES.indexOf(state.route);
      if (i < 0) return;                              // 后台等页面不参与
      var j = i + ar;
      if (j < 0 || j >= ROUTES.length) return;
      e.preventDefault();
      navigate(ROUTES[j], ar);
      return;
    }
    var low = String(e.key || '').toLowerCase();
    if (low === 't') { e.preventDefault(); toggleTheme(); return; }
    if (low === 'r') { e.preventDefault(); randomLink(); return; }
    if (low === 'f') {
      e.preventDefault();
      if (state.route !== 'nav') navigate('nav');
      else { var fb = $('#favToggle'); if (fb) fb.click(); }
    }
  }

  /* ---------- 启动 ---------- */
  function init() {
    // SPA 自己管滚动位置：关掉浏览器的“刷新后恢复滚动”，
    // 否则刷新/前进后退时页面会停在中途，顶栏压住正文标题
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}
    initTheme();
    refreshData();
    refreshPosts();
    refreshFeed();
    applyChrome();
    header = $('#header'); progress = $('#scrollProgress'); cursorGlow = $('#cursorGlow');

    // 解析初始路由（不依赖 hashchange），并补齐 URL
    var h0 = parseHash();
    state.route = h0.route;
    state.postId = h0.postId;
    /* v142：初始 hash 里的「标签名 / 后台面板名」也得跟着恢复 ——
       以前只回了 route + postId，刷新 #/tag/设计 会落到一个空标签页，
       刷新 #/admin/feed 会退回第一个面板。 */
    state.tagName = h0.tagName || '';
    state.adminTab = h0.adminTab || '';
    var rawHash = '';
    try { rawHash = location.hash.replace(/^#\/?/, ''); } catch (e) {}
    if (rawHash === '') {
      state.route = 'home';
      try { history.replaceState(null, '', '#/home'); }
      catch (e) { try { location.hash = '#/home'; } catch (e2) {} }
    }

    bindGlobal();
    render();
    onScroll();
    initCursorGlow();
    initSwipe();
    var y = $('#year'); if (y) y.textContent = new Date().getFullYear();
    syncHeaderVar();
    if (header) header.addEventListener('transitionend', syncHeaderVar);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    setTimeout(function () { if (header) header.classList.add('is-stuck'); syncHeaderVar(); }, 400);
    warmNav();   // 空闲时把最重的导航页先备好，等会儿划过去就是秒出

    // 字体就绪后重新校准导航高亮位置
    updateGlider();
    window.addEventListener('load', function () { updateGlider(); });
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(function () { updateGlider(); });
    }

    /* PWA：注册 Service Worker —— 注册成功后可以「添加到主屏幕」并离线打开。
       file:// 直接双击打开时不支持 SW，会自动跳过，不影响其它功能。 */
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', function () {
        try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {}
      });
    }
  }

  /* ---------- 供后台面板（admin.js）调用 ---------- */
  window.XY_APP = {
    applyChrome: applyChrome,
    applyTheme: applyTheme,
    applyData: refreshData,
    applyPosts: refreshPosts,
    applyFeed: refreshFeed,
    applyLook: applyLook,
    accents: ACCENT_PRESETS,
    /* 给后台画「我的配色」小圆点用：一个主色 → 三色渐变 */
    trioFor: accentTrio,
    hostOf: hostOf,
    homeCfg: homeCfg,
    toast: toast,
    esc: esc,
    md: MD,
    rerender: function () { render({ animate: false, resetScroll: false }); },
    go: navigate,
    openPost: openPost,
    /* 云备份用：把「最近访问 / 收藏」也一起带走 */
    visits: {
      get: function () { return visits; },
      set: function (v) { visits = (v && typeof v === 'object') ? v : {}; saveVisits(); }
    },
    fav: {
      get: function () { return state.fav; },
      set: function (v) { state.fav = Array.isArray(v) ? v : []; saveFav(); }
    },
    /* v142：后台每个面板都有自己的地址 —— 读当前面板 / 切面板时同步地址栏。
       用 pushState 而不是 replaceState：这样浏览器后退键可以当「上一个面板」用。
       只改 hash、不触发重渲染（面板内容后台自己已经换好了）。 */
    adminTab: function () { return state.adminTab || ''; },
    setAdminTab: function (t, replace) {
      state.adminTab = t || '';
      var url = '#/admin' + (t ? '/' + t : '');
      try { history[replace ? 'replaceState' : 'pushState'](null, '', url); } catch (e) {}
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
