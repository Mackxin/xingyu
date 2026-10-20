/* =========================================================
   星屿 XINGYU · 应用逻辑
   无框架单页应用：hash 路由 + 模板渲染
   ========================================================= */
(function () {
  'use strict';

  var DATA = window.SITE_DATA || { categories: [], feed: [], entries: [] };
  var CATS = DATA.categories, FEED = DATA.feed, ENTRIES = DATA.entries;

  /* ---------- 小工具 ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

  /* ---------- 图标 ---------- */
  var I = {
    star: '<svg viewBox="0 0 24 24"><path d="M12 3.6l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9z"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5.5 14.5A2 2 0 013.5 12.5v-7A2 2 0 015.5 3.5h7a2 2 0 012 2"/></svg>',
    out:  '<svg viewBox="0 0 24 24"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v4.5A1.5 1.5 0 0117.5 20h-11A1.5 1.5 0 015 18.5v-11A1.5 1.5 0 016.5 6H11"/></svg>',
    arrow:'<svg viewBox="0 0 24 24"><path d="M5 12h13M13 6.5l5.5 5.5L13 17.5"/></svg>',
    shuffle:'<svg viewBox="0 0 24 24"><path d="M16 3.5l4 4-4 4"/><path d="M20 7.5h-3.5c-2 0-3.2 1-4.5 2.6-1.3 1.6-2.5 2.9-4.5 2.9H4"/><path d="M16 12.5l4 4-4 4"/><path d="M4 19.5h3.5c2 0 3.2-1 4.5-2.6"/></svg>',
    pointer:'<svg viewBox="0 0 24 24"><path d="M5 4l14 7-6 1.6L10.5 19z"/></svg>',
    search:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><path d="M6 9.5l6 6 6-6"/></svg>'
  };

  /* ---------- 状态 ---------- */
  var ROUTES = ['home', 'nav', 'share'];                 // 主导航 / 滑动切换顺序
  var ALL_ROUTES = ['home', 'nav', 'share', 'admin'];     // 全部可路由页面（admin 不占主导航）
  var state = {
    route: 'home',
    query: '',
    favOnly: false,
    feedTag: 'all',
    catFilter: '',      // 分类栏筛选词
    recentMode: 'recent', // recent | top —— 最近访问榜的排序方式
    fav: loadFav()
  };
  var FAV_KEY = 'xingyu.fav.v1';
  var THEME_KEY = 'xingyu.theme.v1';

  function loadFav() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch (e) { return []; }
  }
  function saveFav() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(state.fav)); } catch (e) {}
  }
  function isFav(url) { return state.fav.indexOf(url) > -1; }
  function toggleFav(url) {
    var i = state.fav.indexOf(url);
    if (i > -1) { state.fav.splice(i, 1); toast('已取消收藏'); }
    else { state.fav.push(url); toast('已加入收藏 ⭐'); }
    saveFav();
    softRender();
  }

  var allLinks = [];
  var totalLinks = 0;
  function rebuildIndex() {
    allLinks = [];
    CATS.forEach(function (c) {
      c.links.forEach(function (l) {
        allLinks.push({ n: l.n, u: l.u, d: l.d, cat: c.name, catId: c.id, icon: c.icon, pin: !!l.pin, py: pyInitials(l.n) });
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
    var hay = norm(l.n + l.d + l.cat + l.u);
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
      eyebrow: '探索 · 发现 · 记录', titleTop: '欢迎来到', titleMain: '星屿',
      descBefore: '一座悬浮在夜色里的',
      descAfter: '。把散落的网址、遇见的工具与闪过的念头，安放在同一片星空下——以星为图，以屿为家。',
      rotator: ['数字花园', '灵感岛屿', '资源航图', '私人书房'],
      cta1Text: '开始探索', cta1Url: '#/nav', cta2Text: '随机漫游',
      badge: '🛰️ 持续更新中', image: '', imageFit: 'cover',
      stats: [
        { auto: 'cats', n: '', s: '主题岛屿' }, { auto: 'links', n: '', s: '精选站点' },
        { auto: 'feed', n: '', s: '分享条目' }, { auto: 'days', n: '', s: '成长天数' }
      ],
      entries: ENTRIES,
      featuredTitle: '今日精选', featuredDesc: '这一阵子遇见的好东西，随手记在这里。', featuredCount: 6
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
    var autoMap = { cats: CATS.length, links: totalLinks, feed: FEED.length, days: days };

    var statsHtml = (h.stats || []).map(function (t) {
      var raw = t.auto ? (autoMap[t.auto] || 0) : t.n;
      var num = /^\d+$/.test(String(raw == null ? '' : raw).trim()) ? parseInt(raw, 10) : null;
      return '<div class="stat"><b' +
        (num === null ? '' : ' data-count="' + num + '"') + '>' +
        esc(num === null ? (raw || '—') : 0) + '</b><span>' + esc(t.s) + '</span></div>';
    }).join('');

    var entriesHtml = (h.entries || []).map(function (e) {
      var ext = !isInternal(e.route);
      return '<a class="card card--hover bento__item' + (e.wide ? ' bento__item--wide' : '') + '" href="' + esc(e.route) + '"' +
        (ext ? ' target="_blank" rel="noopener"' : '') + '>' +
        (e.spark ? '<span class="bento__spark"></span>' : '') +
        '<span class="bento__icon">' + esc(e.icon) + '</span>' +
        '<h3>' + esc(e.title) + '</h3>' +
        '<p>' + esc(e.desc) + '</p>' +
        '<span class="bento__go">进入 ' + I.arrow + '</span>' +
        '</a>';
    }).join('');

    var featuredHtml = FEED.slice(0, Math.max(1, h.featuredCount || 6)).map(function (f) {
      var isHash = f.url.charAt(0) === '#';
      return '<a class="card card--hover feature-card" href="' + esc(f.url) + '"' + (isHash ? '' : ' target="_blank" rel="noopener"') + '>' +
        '<span class="feature-card__top"><span class="glyph glyph--sm" style="background:linear-gradient(135deg,rgba(124,156,255,.35),rgba(180,124,255,.3))">' + esc(f.icon) + '</span>' +
        '<h4>' + esc(f.title) + '</h4></span>' +
        '<p>' + esc(f.desc) + '</p>' +
        '<span class="feature-card__meta">📅 ' + esc(f.date) + '</span>' +
        '</a>';
    }).join('');

    var cta1Ext = !isInternal(h.cta1Url);

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
        '<div class="hero__portrait' + (h.image ? ' hero__portrait--img' : '') + '">' +
          '<div class="portrait-inner' + (h.image ? ' portrait-inner--img' : '') + '">' +
            (h.image
              ? '<img class="portrait-img" src="' + esc(h.image) + '" alt="" style="object-fit:' + (h.imageFit === 'contain' ? 'contain' : 'cover') + '" />'
              : portraitSvg()) +
          '</div>' +
          (h.badge ? '<span class="portrait-badge">' + esc(h.badge) + '</span>' : '') +
        '</div>' +
      '</div>' +
      (statsHtml ? '<div class="stats">' + statsHtml + '</div>' : '') +
      (entriesHtml ? '<div class="bento">' + entriesHtml + '</div>' : '') +
      '<div class="featured">' +
        '<div class="section-head"><div><h2>' + esc(h.featuredTitle) + '</h2><p>' + esc(h.featuredDesc) + '</p></div>' +
          '<a class="pill pill--btn" href="#/share">查看全部 ' + I.arrow + '</a></div>' +
        '<div class="track">' + featuredHtml + '</div>' +
      '</div>' +
    '</section>';
  }

  var ROTATOR_WORDS = ['数字花园', '灵感岛屿', '资源航图', '私人书房'];
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

  function linkCard(l) {
    var fav = isFav(l.u);
    return '<a class="link-card' + (l.pin ? ' is-pinned' : '') + '" href="' + esc(l.u) + '" target="_blank" rel="noopener"' +
      ' data-n="' + esc(l.n) + '" data-u="' + esc(l.u) + '" data-d="' + esc(l.d || '') + '">' +
      glyph(l.n, 'sm') +
      '<span class="link-card__body">' +
        '<span class="link-card__name">' + esc(l.n) + (l.pin ? '<i class="pin" aria-label="置顶" title="置顶">📌</i>' : '') + '</span>' +
        '<span class="link-card__desc">' + esc(l.d || hostOf(l.u)) + '</span>' +
      '</span>' +
      '<span class="link-card__act">' +
        '<button class="mini-btn" type="button" data-fav="' + esc(l.u) + '" aria-pressed="' + fav + '" title="收藏">' + I.star + '</button>' +
        '<button class="mini-btn" type="button" data-copy="' + esc(l.u) + '" title="复制链接">' + I.copy + '</button>' +
      '</span>' +
      '</a>';
  }

  /* 最近访问 / 最常去 —— 有记录才出现 */
  function recentBlockHtml() {
    var list = visitList(state.recentMode === 'top' ? 'top' : 'recent', 10);
    if (!list.length) return '';
    var chips = list.map(function (v) {
      var badge = state.recentMode === 'top' && v.c > 1 ? '<i class="recent-chip__n">' + v.c + '</i>' : '';
      return '<a class="recent-chip" href="' + esc(v.u) + '" target="_blank" rel="noopener"' +
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

  function renderNav() {
    var q = state.query;
    var searching = !!norm(q) || state.favOnly;
    var results = searching
      ? sortPinned(searchLinks(q).filter(function (l) { return !state.favOnly || isFav(l.u); }))
      : [];

    var meta = searching
      ? '找到 <b>' + results.length + '</b> 个站点' + (norm(q) ? ' · “' + esc(q.trim()) + '”' : '')
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
            : emptyHtml('🔍', '没有找到相关站点', '换个关键词试试，或清空搜索查看全部。')) +
        '</div>';
      return '<section class="page">' + head +
        '<div class="nav-layout nav-layout--solo"><div class="nav-body">' + body + '</div></div></section>';
    }

    var chips = CATS.map(function (c) {
      // 供分类栏筛选使用：名字 + 图标 + 描述都能命中
      var hay = norm(c.name + c.icon + ' ' + (c.desc || ''));
      return '<button class="cat-item" type="button" data-cat="' + esc(c.id) + '" data-search="' + esc(hay) + '">' +
        '<span class="cat-item__name">' + esc(c.icon) + ' ' + esc(c.name) + '</span>' +
        '<span class="cat-item__count">' + c.links.length + '</span>' +
        '</button>';
    }).join('');

    var rail =
      '<aside class="cat-rail" id="catRail">' +
        '<div class="cat-rail__head">' +
          '<p class="cat-rail__title">主题分类<span class="cat-rail__n">' + CATS.length + '</span></p>' +
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

    var blocks = CATS.map(function (c) {
      return '<div class="cat-block" id="cat-' + esc(c.id) + '" data-cat-block="' + esc(c.id) + '">' +
        '<div class="cat-block__head"><h2>' + esc(c.icon) + ' ' + esc(c.name) + '</h2>' +
          '<span class="count">' + c.links.length + ' 个站点 · ' + esc(c.desc) + '</span></div>' +
        '<div class="link-grid">' + sortPinned(c.links).map(function (l) {
          return linkCard({ n: l.n, u: l.u, d: l.d, pin: l.pin });
        }).join('') + '</div>' +
        '</div>';
    }).join('');

    return '<section class="page">' + head +
      '<div class="nav-layout">' + rail +
        '<div class="nav-body">' + recentBlockHtml() + blocks + '</div>' +
      '</div></section>';
  }

  function navHead(meta) {
    return '<div class="page-head page-head--nav">' +
      '<div class="page-head__main">' +
        '<span class="eyebrow">Navigation · 航图</span>' +
        '<h1>星屿导航</h1>' +
        '<p>十二座主题岛屿，收拢网页世界里的精选坐标。直接在顶部搜索框输入关键词即时筛选，点星标收藏常用站点，' +
          '或按 <kbd style="font-family:inherit;padding:1px 6px;border:1px solid var(--border);border-radius:6px;font-size:12px">⌘K</kbd> 全局跳转。</p>' +
      '</div>' +
      '<div class="page-head__side">' +
        '<span class="nav-meta">' + (meta || '') + '</span>' +
        '<button class="pill pill--btn head-toggle" type="button" id="favToggle" aria-pressed="' + state.favOnly + '">' +
          I.star + ' 只看收藏 <span style="opacity:.65">' + state.fav.length + '</span></button>' +
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

  function feedCardHtml(f) {
    var isHash = f.url.charAt(0) === '#';
    return '<a class="feed-card" href="' + esc(f.url) + '"' + (isHash ? '' : ' target="_blank" rel="noopener"') + '>' +
      '<span class="feed-card__icon">' + esc(f.icon) + '</span>' +
      '<span>' +
        '<span class="feed-card__title">' + esc(f.title) + ' ' + (isHash ? '' : I.out) + '</span>' +
        '<p class="feed-card__desc">' + esc(f.desc) + '</p>' +
        '<span class="feed-card__tags">' + (f.tags || []).map(function (t) {
          return '<span class="tag" data-tag="' + esc(t) + '">#' + esc(t) + '</span>';
        }).join('') + '</span>' +
      '</span>' +
      '</a>';
  }

  function renderShare() {
    var tags = ['all'];
    var dateSet = {};
    FEED.forEach(function (f) {
      (f.tags || []).forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); });
      if (f.date) dateSet[f.date] = 1;
    });

    var chipHtml = tags.map(function (t) {
      var label = t === 'all' ? '全部' : t;
      return '<button class="tag' + (state.feedTag === t ? ' is-active' : '') + '" type="button" data-tag="' + esc(t) + '">' + esc(label) + '</button>';
    }).join('');

    /* 宽屏直接铺在标题下；窄屏（≤960）变成顶栏「标签」按钮 + 底部面板 */
    var tagBar = '<div class="tag-rail" id="tagRail">' +
        '<div class="tag-rail__scrim" id="tagRailScrim"></div>' +
        '<div class="tag-rail__sheet" id="tagSheet">' +
          '<span class="tag-rail__bar"></span>' +
          '<div class="tag-rail__head">' +
            '<b>按标签筛选</b>' +
            '<span class="tag-rail__n">' + Math.max(0, tags.length - 1) + ' 个</span>' +
            '<button class="tag-rail__x" type="button" id="tagSheetClose" aria-label="关闭">' +
              '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
            '</button>' +
          '</div>' +
          '<div class="tag-bar" id="tagBar">' + chipHtml + '</div>' +
        '</div>' +
      '</div>';

    var items = FEED.filter(function (f) {
      return state.feedTag === 'all' || (f.tags || []).indexOf(state.feedTag) > -1;
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

    return '<section class="page">' +
      '<div class="page-head page-head--share">' +
        '<div class="page-head__main">' +
          '<span class="eyebrow">Sharing · 屿光</span>' +
          '<h1>灵感分享</h1>' +
          '<p>每天一小条，记录正在遇见的工具、灵感与小发现。像刷动态一样，回看这一年的数字足迹。</p>' +
        '</div>' +
        '<div class="page-head__side">' + statsHtml + '</div>' +
      '</div>' +
      tagBar +
      '<div class="timeline">' + (items.length ? html : emptyHtml('🪶', '这个标签下还没有内容', '换个标签看看吧。')) + '</div>' +
      '</section>';
  }

  /* ---------- 路由 ---------- */
  function parseRoute() {
    var h = '';
    try { h = location.hash.replace(/^#\/?/, '').split('?')[0]; } catch (e) {}
    return ALL_ROUTES.indexOf(h) > -1 ? h : 'home';
  }
  function scrollTop(smooth) {
    try { window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' }); }
    catch (e) { window.scrollTo(0, 0); }
  }
  /* 点击内链时直接切换；不依赖 hashchange（预览/iframe 中更可靠） */
  function navigate(route, dir) {
    if (ALL_ROUTES.indexOf(route) < 0) route = 'home';
    if (state.route === route) { scrollTop(true); return; }
    state.route = route;
    try { history.pushState(null, '', '#/' + route); }
    catch (e) { try { location.hash = '#/' + route; } catch (e2) {} }
    render({ dir: dir });
  }
  /* 浏览器前进/后退 */
  function syncFromHash() {
    var r = parseRoute();
    if (r !== state.route) { state.route = r; render(); }
  }
  function render(opts) {
    opts = opts || {};
    var animate = opts.animate !== false;      // 是否播放页面入场动画
    var resetScroll = opts.resetScroll !== false; // 是否回到顶部
    if (ALL_ROUTES.indexOf(state.route) < 0) state.route = 'home';
    // 供 CSS 用（比如只在导航页显示顶栏的分类按钮）
    document.documentElement.setAttribute('data-route', state.route);
    var app = $('#app');
    var html = state.route === 'admin'
             ? (window.XY_ADMIN ? window.XY_ADMIN.render() : renderHome())
             : state.route === 'nav' ? renderNav()
             : state.route === 'share' ? renderShare()
             : renderHome();
    app.innerHTML = html;
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
    if (state.route === 'share') { bindTagRail(); syncTagBtn(); }
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
  function updateGlider() {
    // 顶栏胶囊 + 手机端底部 tab 栏各有一个滑块，都跟着当前页面走
    [['#nav', '#navGlider'], ['#dockNav', '#dockGlider']].forEach(function (pair) {
      var nav = $(pair[0]), glider = $(pair[1]);
      if (!nav || !glider) return;
      var active = $('.nav__item.is-active', nav);
      if (!active) { glider.style.width = '0px'; glider.style.opacity = '0'; return; }
      var nr = nav.getBoundingClientRect(), ar = active.getBoundingClientRect();
      var bl = nav.clientLeft || 0, bt = nav.clientTop || 0;
      glider.style.left = (ar.left - nr.left - bl) + 'px';
      glider.style.top = (ar.top - nr.top - bt) + 'px';
      glider.style.width = ar.width + 'px';
      glider.style.height = ar.height + 'px';
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
      clearVisits();
      toast('已清空访问记录');
      softRender();
    });

    var railList = $('#catRailList');
    if (railList) {
      railList.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.cat-item') : null;
        if (!btn || btn.classList.contains('is-hidden')) return;
        var id = btn.getAttribute('data-cat');
        var block = $('#cat-' + id);
        closeCatSheet();
        if (block) {
          var hh = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h'), 10) || 96;
          var top = block.getBoundingClientRect().top + window.scrollY - (hh + 20);
          window.scrollTo({ top: top, behavior: 'smooth' });
          syncCatBtn(id);
        }
      });
    }
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

  /* ---------- 分享页：顶栏「标签」按钮 + 底部标签面板 ---------- */
  function syncTagBtn() {
    var nm = $('#headerTagName'), btn = $('#headerTag');
    if (!nm) return;
    nm.textContent = state.feedTag === 'all' ? '全部标签' : '#' + state.feedTag;
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

  /* ---------- 手机端长按链接卡片：收藏 / 复制（卡片上的图标已隐藏） ---------- */
  function closeCardMenu() {
    var m = $('#cardMenu');
    if (!m) return false;
    m.remove();
    return true;
  }
  function openCardMenu(card, x, y) {
    closeCardMenu();
    var url = card.getAttribute('href') || '';
    var fav = isFav(url);
    var el = document.createElement('div');
    el.className = 'card-menu';
    el.id = 'cardMenu';
    el.setAttribute('role', 'menu');
    el.innerHTML =
      '<button class="card-menu__i' + (fav ? ' is-on' : '') + '" type="button" role="menuitem" data-fav="' + esc(url) + '">' +
        I.star + '<span>' + (fav ? '取消收藏' : '收藏') + '</span></button>' +
      '<button class="card-menu__i" type="button" role="menuitem" data-copy="' + esc(url) + '">' +
        I.copy + '<span>复制链接</span></button>';
    document.body.appendChild(el);
    var r = el.getBoundingClientRect();
    var left = Math.min(Math.max(8, x - r.width / 2), Math.max(8, window.innerWidth - r.width - 8));
    var top = y - r.height - 14;
    if (top < 8) top = Math.min(y + 20, window.innerHeight - r.height - 8);
    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(top) + 'px';
    el.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-fav],[data-copy]') : null;
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      if (b.hasAttribute('data-fav')) toggleFav(b.getAttribute('data-fav'));
      else copyUrl(b.getAttribute('data-copy'));
      closeCardMenu();
    });
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
    document.addEventListener('contextmenu', function (e) {
      // 只在手指长按卡片时压掉系统菜单；桌面右键照常
      if (!touched && !fired) return;
      if (e.target.closest && e.target.closest('.link-card')) e.preventDefault();
    });
  }

  /* ---------- 分类栏：手机端底部选择面板 + 筛选（分类上百个也好找） ---------- */
  function bindCatRail() {
    var rail = $('#catRail'), list = $('#catRailList');
    if (!rail || !list) return;

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
  function bindHeaderSearch() {
    var input = $('#headerSearch');
    if (!input) return;
    var run = debounce(function () { softRender(); }, 130);

    input.addEventListener('input', function () {
      state.query = input.value;
      syncHeaderSearch();
      if (state.route === 'nav') run();
      else navigate('nav');           // 其它页面输入时自动跳到导航页看结果
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { state.query = ''; syncHeaderSearch(); if (state.route === 'nav') softRender(); }
    });
    var clearBtn = $('#headerSearchClear');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      state.query = ''; input.value = ''; syncHeaderSearch();
      if (state.route === 'nav') softRender();
      input.focus();
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
    ROUTES.forEach(function (r) {
      var label = r === 'home' ? '首页' : r === 'nav' ? '导航' : '分享';
      list.push({ type: '页面', name: label, sub: '#/' + r, url: '#/' + r, icon: r === 'home' ? '🌌' : r === 'nav' ? '🧭' : '✨', isRoute: true });
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
    // 拼音索引：输入 zh / txsp 也能命中
    list.forEach(function (it) { it.py = pyInitials(it.name); });
    return list;
  }
  var PALETTE_INDEX = buildPaletteIndex();

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
    { k: ['⌘', 'K'], t: '全局搜索', d: '打开命令面板：搜站点、分类、分享' },
    { k: ['/'], t: '全局搜索', d: '同上，少按一个键' },
    { k: ['1', '2', '3'], t: '首页 / 导航 / 分享', d: '直接跳到对应页面' },
    { k: ['←', '→'], t: '上一页 / 下一页', d: '在 首页 ⇄ 导航 ⇄ 分享 之间切换' },
    { k: ['T'], t: '切换主题', d: '暗色 / 明亮来回切' },
    { k: ['R'], t: '随机漫游', d: '从全部站点里随机开一个' },
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
    var n = norm(q);
    var hits = n
      ? PALETTE_INDEX.filter(function (it) {
          if (norm(it.name + it.sub + it.type).indexOf(n) > -1) return true;
          return /^[a-z0-9]+$/.test(n) && !!it.py && it.py.indexOf(n) > -1;
        })
      : PALETTE_INDEX.slice(0, 12);
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
    // 链接卡片左侧图标（后台可关，只影响电脑端）
    document.documentElement.setAttribute('data-icons', c.showIcons === false ? 'off' : 'on');
    // 卡片密度：compact | normal | comfy
    document.documentElement.setAttribute('data-density', c.cardDensity || 'normal');
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
  function randomLink() {
    if (!allLinks.length) return;
    var l = allLinks[Math.floor(Math.random() * allLinks.length)];
    toast('🎲 随机前往：' + l.n);
    setTimeout(function () { window.open(l.u, '_blank', 'noopener'); }, 380);
  }

  /* ---------- 滚动 / 光标 ---------- */
  var header, progress, cursorGlow;
  /* 把顶栏实际高度写进 --header-h，供吸顶元素（工具栏 / 分类栏 / 时间线日期）对齐 */
  function syncHeaderVar() {
    if (!header) return;
    var h = Math.round(header.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty('--header-h', h + 'px');
  }
  /* 窗口尺寸变化（含旋转）后重新量一次顶栏高度，保证吸顶元素对齐 */
  var onResize = debounce(function () { syncHeaderVar(); }, 140);
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
  function bindGlobal() {
    window.addEventListener('hashchange', syncFromHash);
    window.addEventListener('popstate', syncFromHash);

    // 所有内部路由链接：直接切换，不依赖 hashchange
    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href^="#/"]') : null;
      if (!a) return;
      var route = a.getAttribute('href').replace(/^#\/?/, '');
      if (ALL_ROUTES.indexOf(route) < 0) return;
      e.preventDefault();
      navigate(route);
    });

    // 后台配置变化 → 立即应用到顶栏 / 页脚
    document.addEventListener('xy:config', function () { applyChrome(); });
    // 后台站点数据变化 → 重建索引（页面在下次渲染时自动使用新数据）
    document.addEventListener('xy:data', function () { refreshData(); });

    // 入场动画一结束就把 animation 摘掉：万一浏览器把收尾的 transform 留在 .page 上，
    // 它会成为 position:fixed 后代的包含块（确认弹窗、表情挑选器、分类面板都会错位）
    document.addEventListener('animationend', function (e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains('page')) t.style.animation = 'none';
    });

    bindHeaderSearch();
    var themeBtn = $('#themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    var randomBtn = $('#randomBtn');
    if (randomBtn) randomBtn.addEventListener('click', randomLink);
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

  /* ---------- 左右滑动切换页面 ---------- */
  function initSwipe() {
    function step(delta, dir) {
      if (ROUTES.indexOf(state.route) < 0) return;   // 后台等页面不参与滑动
      var i = ROUTES.indexOf(state.route) + delta;
      if (i < 0 || i >= ROUTES.length) return;   // 不循环，首尾即止
      navigate(ROUTES[i], dir);
    }

    /* 1) 触屏滑动（手机 / 触控屏） */
    var sx = 0, sy = 0, tracking = false, decided = false, horiz = false;
    document.body.addEventListener('touchstart', function (e) {
      if (isPaletteOpen() || e.touches.length !== 1) { tracking = false; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      tracking = true; decided = false; horiz = false;
    }, { passive: true });

    document.body.addEventListener('touchmove', function (e) {
      if (!tracking) return;
      var dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
      if (!decided) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        decided = true;
        horiz = Math.abs(dx) > Math.abs(dy) * 1.3;        // 横向意图明显才接管
        if (horiz && isInHScroll(e.target)) tracking = false; // 横向滚动容器内不拦截
      }
    }, { passive: true });

    document.body.addEventListener('touchend', function (e) {
      if (!tracking || !horiz) { tracking = false; return; }
      tracking = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
      step(dx < 0 ? 1 : -1, dx < 0 ? 'right' : 'left');
    }, { passive: true });

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
    var idx = ['1', '2', '3'].indexOf(e.key);
    if (idx > -1) { e.preventDefault(); navigate(ROUTES[idx]); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (isInHScroll(e.target)) return;              // 横向可滚的容器，方向键留给它
      var i = ROUTES.indexOf(state.route);
      if (i < 0) return;                              // 后台等页面不参与
      var j = i + (e.key === 'ArrowRight' ? 1 : -1);
      if (j < 0 || j >= ROUTES.length) return;
      e.preventDefault();
      navigate(ROUTES[j], e.key === 'ArrowRight' ? 1 : -1);
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
    applyChrome();
    header = $('#header'); progress = $('#scrollProgress'); cursorGlow = $('#cursorGlow');

    // 解析初始路由（不依赖 hashchange），并补齐 URL
    state.route = parseRoute();
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
    hostOf: hostOf,
    homeCfg: homeCfg,
    toast: toast,
    esc: esc,
    rerender: function () { render({ animate: false, resetScroll: false }); },
    go: navigate,
    /* 云备份用：把「最近访问 / 收藏」也一起带走 */
    visits: {
      get: function () { return visits; },
      set: function (v) { visits = (v && typeof v === 'object') ? v : {}; saveVisits(); }
    },
    fav: {
      get: function () { return state.fav; },
      set: function (v) { state.fav = Array.isArray(v) ? v : []; saveFav(); }
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
