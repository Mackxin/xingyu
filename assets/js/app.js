/* =========================================================
   星屿 XINGYU · 应用逻辑
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
    search:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><path d="M6 9.5l6 6 6-6"/></svg>'
  };

  /* ---------- 状态 ---------- */
  var ROUTES = ['home', 'nav', 'share', 'post'];         // 主导航 / 滑动切换顺序
  var ALL_ROUTES = ['home', 'nav', 'share', 'post', 'about', 'admin'];  // 全部可路由页面（about/admin 不占主导航）

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
      eyebrow: '探索 · 发现 · 记录', titleTop: '欢迎来到', titleMain: '星屿',
      descBefore: '一座悬浮在夜色里的',
      descAfter: '。把散落的网址、遇见的工具与闪过的念头，安放在同一片星空下——以星为图，以屿为家。',
      rotator: ['数字花园', '灵感岛屿', '资源航图', '私人书房'],
      cta1Text: '开始探索', cta1Url: '#/nav', cta2Text: '随机漫游',
      badge: '🛰️ 持续更新中', image: '', imageFit: 'cover',
      stats: [
        { auto: 'cats', n: '', s: '主题岛屿' }, { auto: 'links', n: '', s: '站点坐标' },
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
      eyebrow: 'About · 关于', title: '关于星屿',
      lede: '一座以星为图、以屿为家的个人数字花园。',
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
    return '<a class="link-card' + (l.pin ? ' is-pinned' : '') + '" href="' + hrefOf(l.u) + '" target="_blank" rel="noopener"' +
      ' data-n="' + esc(l.n) + '" data-u="' + esc(l.u) + '" data-d="' + esc(l.d || '') + '">' +
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
      return '<a class="recent-chip" href="' + hrefOf(v.u) + '" target="_blank" rel="noopener"' +
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
        '<h1>星屿导航</h1>' +
        '<p>攒了多年的老书签全收在这一页 —— 共 <b>' + CATS.length + '</b> 类、<b>' + totalLinks + '</b> 个坐标。' +
          '顶部搜索框随时筛，按 <kbd style="font-family:inherit;padding:1px 6px;border:1px solid var(--border);border-radius:6px;font-size:12px">⌘K</kbd> 一键盘点。' +
          /* 卡片上没有按钮了，收藏 / 复制靠右键（手机长按），这里提示一句，别让人找不着 */
          '<span class="hint-desk">在卡片上<b>点右键</b>可以收藏或复制链接。</span>' +
          '<span class="hint-touch">在卡片上<b>长按</b>可以收藏或复制链接。</span></p>' +
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
    return '<a class="feed-card" href="' + hrefOf(f.url) + '"' + (isHash ? '' : ' target="_blank" rel="noopener"') + '>' +
      '<span class="feed-card__icon">' + esc(f.icon) + '</span>' +
      /* v120：这层包裹给个类名，窄屏靠 display:contents 把它拆掉，
         好让标题钻到图标右边、说明和标签仍占整宽（原来图标独占一行）。 */
      '<span class="feed-card__body">' +
        '<span class="feed-card__title">' + esc(f.title) + ' ' + (isHash ? '' : I.out) + '</span>' +
        '<p class="feed-card__desc">' + esc(f.desc) + '</p>' +
        '<span class="feed-card__tags">' + (f.tags || []).map(function (t) {
          return '<span class="tag" data-tag="' + esc(t) + '">#' + esc(t) + '</span>';
        }).join('') + '</span>' +
      '</span>' +
      '</a>';
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

    /* 筛选条右侧的实时计数：点了标签立刻知道筛出多少条 */
    var statHtml = '<span class="tag-bar__stat">' +
        (state.feedTag === 'all'
          ? '共 <b>' + FEED.length + '</b> 条'
          : '<b>#' + esc(state.feedTag) + '</b> · <b>' + items.length + '</b> 条') +
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
        stat: '<span class="tag-bar__stat">共 <b>' + items.length + '</b> 篇</span>'
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
        '</div>'
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
  function parseHash() {
    var h = '';
    try { h = location.hash.replace(/^#\/?/, '').split('?')[0]; } catch (e) {}
    var m = /^post\/(.+)$/.exec(h);
    if (m) {
      var id = m[1];
      try { id = decodeURIComponent(id); } catch (e) {}
      return { route: 'post', postId: id };
    }
    return { route: ALL_ROUTES.indexOf(h) > -1 ? h : 'home', postId: '' };
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
    try { history.pushState(null, '', '#/' + route); }
    catch (e) { try { location.hash = '#/' + route; } catch (e2) {} }
    render(dir ? { dir: dir } : { animate: false });
  }
  /* 打开一篇文章（详情页不参与左右滑动） */
  function openPost(id) {
    var p = findPost(id);
    state.route = 'post';
    state.postId = (p && p.id) || id;
    try { history.pushState(null, '', '#/post/' + encodeURIComponent(state.postId)); }
    catch (e) { try { location.hash = '#/post/' + encodeURIComponent(state.postId); } catch (e2) {} }
    render({ animate: false });
  }
  /* 浏览器前进/后退 */
  function syncFromHash() {
    var nh = parseHash();
    if (nh.route !== state.route || nh.postId !== state.postId) {
      state.route = nh.route;
      state.postId = nh.postId;
      render({ animate: false });
    }
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
         : route === 'post' ? (pid ? renderPost() : renderPosts())
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
    var el = document.createElement('div');
    el.className = 'card-menu';
    el.id = 'cardMenu';
    el.setAttribute('role', 'menu');
    el.innerHTML =
      '<button class="card-menu__i' + (fav ? ' is-on' : '') + '" type="button" role="menuitem" aria-pressed="' + (fav ? 'true' : 'false') + '" data-fav="' + esc(url) + '">' +
        I.star + '<span>' + (fav ? '取消收藏' : '收藏') + '</span></button>' +
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
      var b = e.target.closest ? e.target.closest('[data-fav],[data-copy]') : null;
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      if (b.hasAttribute('data-fav')) toggleFav(b.getAttribute('data-fav'));
      else copyUrl(b.getAttribute('data-copy'));
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
      about: ['关于', '🌠']
    };
    /* about 不在主导航里（不参与左右滑动），但搜索 / 命令面板要能搜到 */
    ROUTES.concat(['about']).forEach(function (r) {
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
    function stepTarget(delta) {
      if (ROUTES.indexOf(state.route) < 0) return null;        // 后台等页面不参与
      if (state.route === 'post' && state.postId) return null; // 阅读页不参与，免得不小心划走
      var i = ROUTES.indexOf(state.route) + delta;
      if (i < 0 || i >= ROUTES.length) return null;            // 不循环，首尾即止
      return ROUTES[i];
    }
    function step(delta, dir) {
      var route = stepTarget(delta);
      if (route) navigate(route, dir);
    }
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
    function makeGhost(route, delta) {
      var app = $('#app');
      if (!app) return null;
      var box = document.createElement('div');
      box.innerHTML = routeHtml(route, null);       // 邻页只可能是"文章列表"，不会是某篇文章
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
      setTimeout(function () { navigate(target); }, dur - 20);   // 不传 dir：动画已经播完了
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
      if (state.route === 'post' && state.postId) return;  // 阅读页让给正常滚动
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
    refreshPosts();
    refreshFeed();
    applyChrome();
    header = $('#header'); progress = $('#scrollProgress'); cursorGlow = $('#cursorGlow');

    // 解析初始路由（不依赖 hashchange），并补齐 URL
    var h0 = parseHash();
    state.route = h0.route;
    state.postId = h0.postId;
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
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
