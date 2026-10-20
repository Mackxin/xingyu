/* =========================================================================
   星屿 · 配置存储（后台管理的数据层）
   -------------------------------------------------------------------------
   读取优先级（后者覆盖前者）：
     1. DEFAULTS                       —— 本文件里的默认值
     2. window.XY_CONFIG               —— 写死在 index.html 里的配置（对所有访客生效）
     3. localStorage['xingyu.config.v1'] —— 在后台里改的配置（仅本机生效）

   想让自己在后台改的内容对**所有访客**永久生效：
     后台 →「数据」→ 导出 JSON → 复制 → 粘到 index.html 的
     <script>window.XY_CONFIG = { ... };</script>（必须放在 config.js 之前）
   ========================================================================= */
(function () {
  'use strict';

  var CFG_KEY = 'xingyu.config.v1';
  var DATA_KEY = 'xingyu.data.v1';
  var PASS_KEY = 'xingyu.pass.v1';
  var OPEN_KEY = 'xingyu.unlocked.v1';

  var MAX_LINKS = 5;

  var DEFAULTS = {
    siteName: '星屿',
    siteLatin: 'XINGYU',
    tagline: '以星为图，以屿为家',
    themeDefault: 'dark',      // dark | light
    showSearch: true,          // 顶栏是否显示搜索框
    showIcons: true,           // 站点卡片左侧图标（后台可关；只影响电脑端，手机端本来就不显示）
    cardDensity: 'normal',     // compact | normal | comfy —— 导航页卡片密度
    logoImage: '',             // 顶栏 Logo 图片（data URL 或网址）；空 = 内置星形 SVG
    favicon: '',               // 浏览器标签图标；空 = 内置 SVG
    startDate: '2024-01-01',   // 建站日期（YYYY-MM-DD）—— 首页「成长天数」从这里算
    customLinks: [],           // { icon, name, url } —— 最多 MAX_LINKS 个

    /* ---------- 首页文案与内容 ---------- */
    home: {
      eyebrow: '探索 · 发现 · 记录',
      titleTop: '欢迎来到',
      titleMain: '星屿',
      descBefore: '一座悬浮在夜色里的',
      descAfter: '。把散落的网址、遇见的工具与闪过的念头，安放在同一片星空下——以星为图，以屿为家。',
      rotator: ['数字花园', '灵感岛屿', '资源航图', '私人书房'],
      cta1Text: '开始探索',
      cta1Url: '#/nav',
      cta2Text: '随机漫游',
      badge: '🛰️ 持续更新中',
      image: '',               // 首页右侧大图；空 = 内置插画
      imageFit: 'cover',       // cover | contain
      stats: [
        { auto: 'cats',  n: '', s: '主题岛屿' },
        { auto: 'links', n: '', s: '精选站点' },
        { auto: 'feed',  n: '', s: '分享条目' },
        { auto: 'days',  n: '', s: '成长天数' }
      ],
      entries: [],             // 首页快捷卡片；空 = 用 data.js 的 entries
      featuredTitle: '今日精选',
      featuredDesc: '这一阵子遇见的好东西，随手记在这里。',
      featuredCount: 6
    }
  };

  var DEFAULT_PASS = 'xingyu';

  var AUTO_KEYS = ['cats', 'links', 'feed', 'days'];
  var MAX_STATS = 6;
  var MAX_ENTRIES = 8;
  var MAX_IMG_CHARS = 2200000;   // 图片 data URL 上限（约 1.6MB 二进制）

  /* ---------- 小工具 ---------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function str(v, def, max) {
    var s = v == null ? '' : String(v);
    if (!s) s = def == null ? '' : String(def);
    return s.slice(0, max || 200);
  }
  function intIn(v, min, max, def) {
    var n = parseInt(v, 10);
    if (!isFinite(n)) n = def;
    return Math.min(max, Math.max(min, n));
  }
  /* 图片地址：允许 data: / http(s) / 相对路径；超长截断保护 */
  function imgStr(v) {
    var s = String(v == null ? '' : v).trim();
    if (s.length > MAX_IMG_CHARS) return '';
    return s;
  }

  /* 建站日期：必须是 YYYY-MM-DD，且真实存在的日期；否则回落默认 */
  function normDate(v, def) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v == null ? '' : v).trim());
    if (!m) return def;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return def;
    return m[1] + '-' + m[2] + '-' + m[3];
  }

  function normStats(list, def) {
    if (!Array.isArray(list) || !list.length) list = def;
    return list.slice(0, MAX_STATS).map(function (it) {
      it = it || {};
      var auto = AUTO_KEYS.indexOf(it.auto) > -1 ? it.auto : '';
      return {
        auto: auto,
        n: auto ? '' : String(it.n == null ? '' : it.n).slice(0, 12),
        s: str(it.s, '', 16)
      };
    });
  }

  function normEntries(list) {
    var src = (Array.isArray(list) && list.length) ? list
            : ((window.SITE_DATA && window.SITE_DATA.entries) || []);
    return src.slice(0, MAX_ENTRIES).map(function (e) {
      e = e || {};
      return {
        icon: str(e.icon, '', 4),
        title: str(e.title, '', 20),
        desc: str(e.desc, '', 80),
        route: str(e.route, '#/home', 300),
        spark: !!e.spark,
        wide: !!e.wide
      };
    });
  }

  /* 首页配置：逐字段合并，保证老配置 / 局部配置也能用 */
  function normHome(src) {
    src = (src && typeof src === 'object') ? src : {};
    var d = DEFAULTS.home;
    var rot = Array.isArray(src.rotator) && src.rotator.length ? src.rotator : d.rotator;
    return {
      eyebrow: str(src.eyebrow, d.eyebrow, 40),
      titleTop: str(src.titleTop, d.titleTop, 24),
      titleMain: str(src.titleMain, d.titleMain, 24),
      descBefore: str(src.descBefore, d.descBefore, 80),
      descAfter: str(src.descAfter, d.descAfter, 220),
      rotator: rot.slice(0, 6).map(function (w) { return str(w, '', 16); }).filter(Boolean).length
        ? rot.slice(0, 6).map(function (w) { return str(w, '', 16); }).filter(Boolean)
        : d.rotator.slice(),
      cta1Text: str(src.cta1Text, d.cta1Text, 16),
      cta1Url: str(src.cta1Url, d.cta1Url, 300),
      cta2Text: str(src.cta2Text, d.cta2Text, 16),
      badge: src.badge == null ? d.badge : String(src.badge).slice(0, 40),
      image: imgStr(src.image),
      imageFit: src.imageFit === 'contain' ? 'contain' : 'cover',
      stats: normStats(src.stats, d.stats),
      entries: normEntries(src.entries),
      featuredTitle: str(src.featuredTitle, d.featuredTitle, 24),
      featuredDesc: str(src.featuredDesc, d.featuredDesc, 80),
      featuredCount: intIn(src.featuredCount, 3, 12, d.featuredCount)
    };
  }

  function hash(s) {
    var h = 5381, i = (s || '').length;
    while (i) h = (h * 33) ^ s.charCodeAt(--i);
    return (h >>> 0).toString(36);
  }

  function pick(target, src) {
    if (src && typeof src === 'object') {
      var home = target.home;
      Object.keys(target).forEach(function (k) {
        if (k === 'home') return;
        if (src[k] !== undefined && src[k] !== null) target[k] = src[k];
      });
      target.home = normHome(src.home === undefined ? home : src.home);
    } else {
      target.home = normHome(target.home);
    }
    target.startDate = normDate(target.startDate, DEFAULTS.startDate);
    target.cardDensity = ['compact', 'normal', 'comfy'].indexOf(target.cardDensity) > -1
      ? target.cardDensity : DEFAULTS.cardDensity;
    if (!Array.isArray(target.customLinks)) target.customLinks = [];
    target.customLinks = target.customLinks.slice(0, MAX_LINKS).map(normLink);
    return target;
  }

  function normLink(l) {
    l = l || {};
    var url = String(l.url || '').trim();
    return {
      icon: String(l.icon == null ? '' : l.icon).slice(0, 4),
      name: String(l.name || '').slice(0, 20),
      url: url
    };
  }

  function readLS() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY)) || null; } catch (e) { return null; }
  }

  /* ---------- 对外 API ---------- */
  var Store = {
    MAX_LINKS: MAX_LINKS,
    MAX_STATS: MAX_STATS,
    MAX_ENTRIES: MAX_ENTRIES,
    MAX_IMG_CHARS: MAX_IMG_CHARS,
    AUTO_KEYS: AUTO_KEYS,
    DEFAULT_PASS: DEFAULT_PASS,
    DEFAULTS: clone(DEFAULTS),
    saveFailed: false,

    /* 当前完整配置 */
    get: function () {
      var out = pick(clone(DEFAULTS), window.XY_CONFIG);
      return pick(out, readLS());
    },

    /* 局部更新并保存 */
    set: function (patch) {
      var cfg = Store.get();
      Object.keys(patch || {}).forEach(function (k) { cfg[k] = patch[k]; });
      Store.save(cfg);
      return cfg;
    },

    /* 首页配置 */
    home: function () { return Store.get().home; },
    setHome: function (patch) {
      var cfg = Store.get();
      Object.keys(patch || {}).forEach(function (k) { cfg.home[k] = patch[k]; });
      cfg.home = normHome(cfg.home);
      Store.save(cfg);
      return cfg.home;
    },

    save: function (cfg) {
      cfg = pick(clone(DEFAULTS), cfg);
      Store.saveFailed = false;
      try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }
      catch (e) { Store.saveFailed = true; }
      document.dispatchEvent(new CustomEvent('xy:config', { detail: cfg }));
      return cfg;
    },

    reset: function () {
      try { localStorage.removeItem(CFG_KEY); } catch (e) {}
      document.dispatchEvent(new CustomEvent('xy:config', { detail: Store.get() }));
      return Store.get();
    },

    /* ---------- 自定义链接（最多 5 个） ---------- */
    allLinks: function () { return Store.get().customLinks; },

    /* 只返回可用的（有名称 + 链接，且链接不含空格） */
    activeLinks: function () {
      return Store.get().customLinks.filter(function (l) {
        return !!l.name && !!l.url && !/\s/.test(l.url);
      });
    },

    addLink: function (link) {
      var cfg = Store.get();
      if (cfg.customLinks.length >= MAX_LINKS) return false;
      cfg.customLinks.push(normLink(link));
      Store.save(cfg);
      return true;
    },

    updateLink: function (i, patch) {
      var cfg = Store.get();
      if (!cfg.customLinks[i]) return false;
      cfg.customLinks[i] = normLink(Object.assign({}, cfg.customLinks[i], patch));
      Store.save(cfg);
      return true;
    },

    removeLink: function (i) {
      var cfg = Store.get();
      cfg.customLinks.splice(i, 1);
      Store.save(cfg);
    },

    moveLink: function (i, delta) {
      var cfg = Store.get();
      var j = i + delta;
      if (j < 0 || j >= cfg.customLinks.length) return;
      var t = cfg.customLinks[i];
      cfg.customLinks[i] = cfg.customLinks[j];
      cfg.customLinks[j] = t;
      Store.save(cfg);
    },

    /* ---------- 导入 / 导出 ---------- */
    exportJSON: function () {
      return JSON.stringify(Store.get(), null, 2);
    },

    importJSON: function (str) {
      var v;
      try { v = JSON.parse(str); } catch (e) { return false; }
      if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
      Store.save(pick(clone(DEFAULTS), v));
      return true;
    },

    /* ---------- 站点数据（分类 / 站点 —— 导航页与全站搜索的数据源） ---------- */
    /* 后台用：始终返回独立副本 */
    dataAll: function () {
      var raw = null;
      try { raw = localStorage.getItem(DATA_KEY); } catch (e) {}
      if (raw) {
        try { var v = JSON.parse(raw); if (Array.isArray(v)) return clone(v); } catch (e) {}
      }
      return clone((window.SITE_DATA && window.SITE_DATA.categories) || []);
    },
    /* 前台只读：没有本地覆盖时直接返回原数组引用，零开销 */
    dataCategories: function () {
      var raw = null;
      try { raw = localStorage.getItem(DATA_KEY); } catch (e) {}
      if (raw) {
        try { var v = JSON.parse(raw); if (Array.isArray(v)) return v; } catch (e) {}
      }
      return (window.SITE_DATA && window.SITE_DATA.categories) || [];
    },
    dataIsCustom: function () {
      try { return !!localStorage.getItem(DATA_KEY); } catch (e) { return false; }
    },
    setData: function (cats) {
      try { localStorage.setItem(DATA_KEY, JSON.stringify(cats)); } catch (e) {}
      document.dispatchEvent(new CustomEvent('xy:data', { detail: cats }));
      return cats;
    },
    resetData: function () {
      try { localStorage.removeItem(DATA_KEY); } catch (e) {}
      document.dispatchEvent(new CustomEvent('xy:data', {}));
    },
    exportDataJSON: function () { return JSON.stringify(Store.dataAll(), null, 2); },
    importDataJSON: function (str) {
      var v;
      try { v = JSON.parse(str); } catch (e) { return false; }
      if (!Array.isArray(v)) return false;
      Store.setData(v);
      return true;
    },

    /* ---------- 口令 ---------- */
    passHash: function () {
      var h = null;
      try { h = localStorage.getItem(PASS_KEY); } catch (e) {}
      return h || hash(DEFAULT_PASS);
    },
    setPasscode: function (p) {
      p = String(p || '').trim();
      if (p.length < 3) return false;
      try { localStorage.setItem(PASS_KEY, hash(p)); } catch (e) {}
      return true;
    },
    isDefaultPasscode: function () {
      var h = null;
      try { h = localStorage.getItem(PASS_KEY); } catch (e) {}
      return !h;
    },
    unlock: function (p) {
      if (hash(String(p || '').trim()) !== Store.passHash()) return false;
      try { sessionStorage.setItem(OPEN_KEY, '1'); } catch (e) {}
      return true;
    },
    isUnlocked: function () {
      try { return sessionStorage.getItem(OPEN_KEY) === '1'; } catch (e) { return false; }
    },
    lock: function () {
      try { sessionStorage.removeItem(OPEN_KEY); } catch (e) {}
    }
  };

  window.XYStore = Store;
})();
