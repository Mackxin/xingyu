/* =========================================================================
   壹号栈 · 配置存储（后台管理的数据层）
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
  var POSTS_KEY = 'xingyu.posts.v1';
  var FEED_KEY = 'xingyu.feed.v1';
  var PASS_KEY = 'xingyu.pass.v1';
  var OPEN_KEY = 'xingyu.unlocked.v1';

  var MAX_LINKS = 5;

  /* 配置版本号：只用来判断「这份本地配置是按哪一版默认值存的」，
     升级默认值时做一次性迁移（见 Store.get）。改默认值才需要 +1。 */
  var CFG_VER = 3;

  var DEFAULTS = {
    siteName: '壹号栈',
    siteLatin: 'YIHAOZHAN',
    tagline: '壹号为栈，随处可归',
    themeDefault: 'dark',      // dark | light
    showSearch: true,          // 顶栏是否显示搜索框
    /* ---- 导航页的三个显示开关（后台「站点信息 → 显示项」）。
       默认全关：卡片只留名字，一行能看更多站点，最清爽。 ---- */
    showIcons: false,          // 卡片左侧那个彩色方块图标
    showDesc: false,           // 卡片名称下面那行介绍 / 域名
    showCatIcon: false,        // 分类名前面的 emoji（🎨 设计天才 这种）
    cardDensity: 'normal',     // compact | normal | comfy —— 导航页卡片密度
    logoImage: '',             // 顶栏 Logo 图片（data URL 或网址）；空 = 内置「栈」字 SVG
    favicon: '',               // 浏览器标签图标；空 = 内置 SVG
    startDate: '2024-01-01',   // 建站日期（YYYY-MM-DD）—— 首页「成长天数」从这里算
    /* { icon, name, url } —— 最多 MAX_LINKS 个。默认放一条「灵感随记」，
       它就在本站里（#/idea），顶栏点一下就到 */
    customLinks: [{ icon: '✨', name: '灵感随记', url: '#/idea' }],

    /* ---------- 主题外观（后台「主题」页） ---------- */
    theme: {
      accent: 'aurora',        // 预设色板 id；'custom' = 用下面的 accentColor
      accentColor: '#7c9cff',  // 自定义主色（只在 accent==='custom' 时生效）
      glow: 'normal',          // strong | normal | off —— 背景极光强度
      radius: 'normal',        // small | normal | large —— 圆角大小
      presets: []              // [{ id, name, color }] —— 自己存的配色，最多 MAX_PRESETS 套
    },

    /* ---------- 阅读体验（文章页） ---------- */
    read: {
      size: 16,                // 正文字号 px（14–20）
      line: 1.95,              // 行高（1.6–2.2）
      font: 'sans',            // sans | serif
      width: 820,              // 正文最大宽度 px（640–1080）
      toc: true                // 宽屏右侧目录
    },

    /* ---------- 首页文案与内容 ---------- */
    home: {
      eyebrow: '探索 · 发现 · 记录',
      titleTop: '欢迎来到',
      titleMain: '壹号栈',
      descBefore: '一座悬浮在夜色里的',
      descAfter: '。把散落的网址、遇见的工具与闪过的念头，都收进同一间栈房——壹号为栈，随处可归。',
      rotator: ['数字花园', '灵感客栈', '资源航图', '私人书房'],
      cta1Text: '开始探索',
      cta1Url: '#/nav',
      cta2Text: '随机漫游',
      badge: '🛰️ 持续更新中',
      image: '',               // 首页右侧大图；空 = 内置插画
      imageFit: 'cover',       // cover | contain
      imageShape: 'square',    // square 正方形 | wide 长方形 | auto 跟随图片原比例
      imageLink: '',           // 点大图跳到哪；留空 = 图不可点
      stats: [
        { auto: 'cats',  n: '', s: '主题分类' },
        { auto: 'links', n: '', s: '站点坐标' },
        { auto: 'feed',  n: '', s: '分享条目' },
        { auto: 'days',  n: '', s: '成长天数' }
      ],
      entries: [],             // 首页快捷卡片；空 = 用 data.js 的 entries
      featuredTitle: '今日精选',
      featuredDesc: '这一阵子遇见的好东西，随手记在这里。',
      featuredCount: 6,
      /* 今日精选指定哪几条（存 feedKey：日期|标题）。
         空数组 = 自动取「分享」里最新的 featuredCount 条；
         有值 = 只显示这几条，条数由勾选数量决定。 */
      featuredPicks: [],

      /* ---------- 赞助（首页最下面那块小的） ----------
         想藏起来把 sponsorOn 改成 false（后台「首页内容 → 赞助」也有开关）。
         赞助图一般是收款码截图；不放图就显示一个 ☕ 徽章，也不难看。 */
      sponsorOn: true,
      sponsorTitle: '喜欢这里？请我喝杯咖啡',
      sponsorDesc: '这个站是一个人搭的，没有广告，也没有赞助商 banner。如果这里的东西帮到过你，可以随意打赏一杯咖啡的钱；不方便也完全没关系——常来坐坐就很好。',
      sponsorNote: '微信 / 支付宝扫码 · 随意就好',
      sponsorImage: '',        // 收款码 / 赞助图（data URL 或网址）；空 = 只显示文字
      /* 收款码可以放好几张（支付宝 / 微信 / 云闪付…），每张单独配名字和跳转链接。
         一条 = { src: 图片, label: 名字, link: 点击去哪 }；src 为空的那条直接忽略。
         这个数组有内容时优先用它；为了兼容老配置，空数组 + sponsorImage 有图时
         会退化成一张（见 app.js 的渲染）。 */
      sponsorCodes: [],
      sponsorLink: ''          // 可选：点一下跳到你的赞赏页
    },

    /* ---------- 关于页（#/about） ----------
       正文是 Markdown，用和文章页同一套渲染器，所以标题 / 列表 / 引用 / 表格都能写。
       想改内容：后台「首页内容 → 关于这一页」，或者直接改下面这段。 */
    about: {
      eyebrow: 'About · 关于',
      title: '关于壹号栈',
      lede: '一个普通人开的一间小栈：收着链接、想法和一点点文字。没有广告，没有推荐算法，也没有人催更——门开着，随时来坐。',
      updated: '2026-10-27',
      md: [
        '我大概攒了十年的书签。',
        '',
        '最早的收藏夹里横七竖八躺着几百个链接，标题还是网页自带的「XXX - 首页」，过半年再打开，连自己当初为什么要存它都想不起来。后来换浏览器、换电脑、换手机，书签跟着搬来搬去，越搬越乱，最后干脆谁也不看——**存了等于没存**。',
        '',
        '开这间栈，是想把这件事收拾一下：让收藏重新变成一件可以回头翻的事。',
        '',
        '## 名字的来由',
        '',
        '「栈」是个老词：客栈供人歇脚，货栈替人存货，栈桥让人从岸上走到水里去。三个意思这里都沾一点——它既是存东西的地方，也是想歇一会儿时能坐下的地方。',
        '',
        '我攒的那些链接，说到底就是一堆行李——散在各台设备、各个浏览器里，谁也认不得谁，搬一次丢一半。总要有个地方先替你收着，想起来了再回来取。这间栈房管的就是这件事：**存得下，也找得回**。',
        '',
        '那为什么是「壹号」？因为它是第一间。先把自己散落的东西收拢好，才谈得上招待别人；以后也许有贰号、叁号，也许就这一间，开很久。',
        '',
        '所以这里叫壹号栈：**壹号为栈，随处可归。**',
        '',
        '## 栈里有什么',
        '',
        '五块地方，各有各的用处：',
        '',
        '- **导航** —— 攒了这些年的书签按主题归好类，一页装完。想找什么直接搜站点名，连拼音首字母都认（输 `txsp` 能搜到「腾讯视频」）。',
        '- **分享** —— 像刷动态一样的时间线，记的是这段时间遇见的工具、读到的文章、突然想通的一点小事。都是短条目，看完就能走。',
        '- **灵感随记** —— 想到一句就写一句的地方。正文里打 `#标签` 会自动归类，写完可以导出成图片或 JSON。它只存在你自己的浏览器里，别人看不见。',
        '- **文章** —— 写得长一点的东西：折腾记录、读书笔记，以及那些需要慢慢想清楚的念头。',
        '- **关于** —— 就是这一页。',
        '',
        '## 怎么逛更顺手',
        '',
        '| 想干的事 | 怎么做 |',
        '| --- | --- |',
        '| 快速跳到某个页面 | `⌘K` / `Ctrl + K` 打开命令面板 |',
        '| 找站点 | 顶栏搜索框：中文、英文、拼音首字母都认 |',
        '| 只看某几类 | 导航页分类栏右上角「只看」，勾几个就只留那几个 |',
        '| 随手收藏 | 鼠标移到站点卡片上，点那颗小星星 |',
        '| 想随手记点什么 | 进「灵感随记」直接写，正文里打 `#标签` 会自动归类 |',
        '| 不知道看什么 | 首页的「随机漫游」，随机开一个站点 |',
        '',
        '手机上一样能用：分类和标签会收进底部弹层，点顶栏的按钮就能展开。',
        '',
        '## 关于我',
        '',
        '白天是普通上班族，晚上喜欢折腾点小东西。',
        '',
        '这里的技术栈朴素到有点复古：**没有框架、没有构建、没有一个第三方依赖**，就是 HTML + CSS + 原生 JS，丢在虚拟主机上就能跑。写得慢一点，但每一行都看得懂，也改得动。',
        '',
        '如果说这间栈有什么主张，大概是这几句：',
        '',
        '> 工具越少，越自由。',
        '>',
        '> 收藏不是囤积，是为了有一天真的会打开它。',
        '>',
        '> 记录的意义不在于好看，在于半年后你还能认出当时的自己。',
        '',
        '## 想聊两句',
        '',
        '- 看到错链、想推荐好站点，或者只是想说句话，都欢迎。',
        '- 这个站没有广告、没有统计脚本，也不追踪你。它只是我开的一间栈，门常开着，进来坐坐就好。',
        '',
        '---',
        '',
        '*门常开，慢慢添置。*'
      ].join('\n')
    }
  };

  var DEFAULT_PASS = 'xingyu';

  var AUTO_KEYS = ['cats', 'links', 'feed', 'days', 'posts'];
  var MAX_STATS = 6;
  var MAX_ENTRIES = 8;
  var MAX_SPONSOR_CODES = 6;        // 首页赞助最多几张收款码（支付宝 / 微信 / 云闪付…）
  var MAX_FEATURED_PICKS = 12;      // 「今日精选」最多指定几条，和 featuredCount 上限一致
  var MAX_IMG_CHARS = 2200000;   // 图片 data URL 上限（约 1.6MB 二进制）
  var ACCENTS = ['aurora', 'ocean', 'sunset', 'forest', 'grape', 'sakura', 'ink', 'custom'];
  var MAX_PRESETS = 8;             // 自己存的配色（「我的配色 A/B/C…」）最多几套

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

  /* 赞助收款码：一个数组，每条 { src, label, link }。
     src 走 imgStr 白名单（data: / http(s) / 相对路径都行），超长直接丢掉；
     名字 12 字、链接 300 字封顶；最多 MAX_SPONSOR_CODES 条。
     只留 src 有内容的那几条 —— 后台点了「＋ 添加」还没传图时不会冒出个空框。 */
  function normCodes(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, MAX_SPONSOR_CODES).map(function (c) {
      c = c || {};
      return {
        src: imgStr(c.src),
        label: str(c.label, '', 12),
        link: str(c.link, '', 300)
      };
    });
  }

  /* 「今日精选」指定了哪几条：存的是 feedKey（日期|标题），去重、最多 12 条 */
  function normPicks(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    list.forEach(function (k) {
      var s = String(k == null ? '' : k).slice(0, 200);
      if (s && out.indexOf(s) < 0 && out.length < MAX_FEATURED_PICKS) out.push(s);
    });
    return out;
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
      imageShape: ['square', 'wide', 'auto'].indexOf(src.imageShape) >= 0 ? src.imageShape : d.imageShape,
      imageLink: str(src.imageLink, d.imageLink, 300),
      stats: normStats(src.stats, d.stats),
      entries: normEntries(src.entries),
      featuredTitle: str(src.featuredTitle, d.featuredTitle, 24),
      featuredDesc: str(src.featuredDesc, d.featuredDesc, 80),
      featuredCount: intIn(src.featuredCount, 3, 12, d.featuredCount),
      featuredPicks: normPicks(src.featuredPicks),
      /* 赞助：文案都有字数和协议保护，图片走 imgStr 白名单 */
      sponsorOn: src.sponsorOn === undefined ? d.sponsorOn : !!src.sponsorOn,
      sponsorTitle: str(src.sponsorTitle, d.sponsorTitle, 30),
      sponsorDesc: str(src.sponsorDesc, d.sponsorDesc, 200),
      sponsorNote: str(src.sponsorNote, d.sponsorNote, 60),
      sponsorImage: imgStr(src.sponsorImage),
      sponsorCodes: normCodes(src.sponsorCodes),
      sponsorLink: str(src.sponsorLink, d.sponsorLink, 300)
    };
  }

  /* 关于页：正文是 Markdown，长度给得比一般字段宽得多 */
  var MAX_ABOUT_MD = 20000;
  function normAbout(src) {
    src = (src && typeof src === 'object') ? src : {};
    var d = DEFAULTS.about;
    return {
      eyebrow: str(src.eyebrow, d.eyebrow, 40),
      title: str(src.title, d.title, 30),
      lede: str(src.lede, d.lede, 240),
      updated: normDate(src.updated, d.updated),
      md: String(src.md == null ? d.md : src.md).slice(0, MAX_ABOUT_MD)
        || d.md
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
    target.theme = normTheme(src && src.theme !== undefined ? src.theme : target.theme);
    target.read = normRead(src && src.read !== undefined ? src.read : target.read);
    target.about = normAbout(src && src.about !== undefined ? src.about : target.about);
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

  /* 一篇文章：标题、日期、标签、摘要、Markdown 正文 */
  function normPost(p, i) {
    p = p || {};
    var title = String(p.title == null ? '' : p.title).slice(0, 120).trim();
    var tags = Array.isArray(p.tags) ? p.tags : [];
    tags = tags.map(function (t) { return String(t == null ? '' : t).trim().slice(0, 20); })
      .filter(Boolean).filter(function (t, k, a) { return a.indexOf(t) === k; }).slice(0, 8);
    var id = String(p.id || '').replace(/[^\w-]/g, '');
    if (!id) id = 'p' + hash(title + i + String(Date.now()));
    return {
      id: id.slice(0, 60),
      title: title || '未命名文章',
      date: normDate(p.date, '') || '',
      tags: tags,
      excerpt: String(p.excerpt == null ? '' : p.excerpt).slice(0, 300),
      body: String(p.body == null ? '' : p.body).slice(0, 400000),
      pin: !!p.pin,
      draft: !!p.draft
    };
  }

  /* 一条分享：日期、图标、标题、链接、描述、标签 */
  function normFeed(f) {
    f = f || {};
    var tags = Array.isArray(f.tags) ? f.tags : [];
    tags = tags.map(function (t) { return String(t == null ? '' : t).trim().slice(0, 16); })
      .filter(Boolean).filter(function (t, k, a) { return a.indexOf(t) === k; }).slice(0, 6);
    var url = String(f.url == null ? '' : f.url).trim().slice(0, 500);
    /* 链接会直接进 href：javascript: / data: 这类协议一律清掉 */
    if (/^(javascript|data|vbscript|file):/i.test(url)) url = '';
    return {
      date: normDate(f.date, '') || '',
      icon: String(f.icon == null ? '' : f.icon).slice(0, 4).trim() || '✨',
      title: String(f.title == null ? '' : f.title).slice(0, 120).trim() || '未命名分享',
      url: url,
      desc: String(f.desc == null ? '' : f.desc).slice(0, 800),
      tags: tags
    };
  }

  /* 自己存的配色：「我的配色 A/B/C…」，每套就是名字 + 一个主色 */
  /* 自动起名：挑第一个还没用过的字母，删掉 A 再存也不会撞成两个 C */
  function nextPresetName(list) {
    var used = {};
    (list || []).forEach(function (p) { if (p && p.name) used[p.name] = 1; });
    for (var i = 0; i < MAX_PRESETS; i++) {
      var n = '配色 ' + String.fromCharCode(65 + i);
      if (!used[n]) return n;
    }
    return '配色 ' + ((list || []).length + 1);
  }

  function normPresets(list) {
    if (!Array.isArray(list)) return [];
    var out = [], seenColor = {}, seenId = {};
    list.forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      var color = String(p.color == null ? '' : p.color).trim().toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(color)) return;   // 颜色非法直接丢掉
      if (seenColor[color]) return;                // 同一个颜色只留一套
      var id = String(p.id == null ? '' : p.id).replace(/[^a-z0-9_-]/gi, '').slice(0, 28);
      if (!id || seenId[id]) id = 'c' + color.substr(1) + '-' + out.length;
      seenColor[color] = 1;
      seenId[id] = 1;
      var name = String(p.name == null ? '' : p.name).replace(/[\r\n\t]/g, ' ').trim().slice(0, 12);
      out.push({ id: id, name: name || ('配色 ' + String.fromCharCode(65 + out.length)), color: color });
    });
    return out.slice(0, MAX_PRESETS);
  }

  /* 主题外观：色板 / 自定义主色 / 背景光晕 / 圆角 / 自己的配色 */
  function normTheme(src) {
    src = (src && typeof src === 'object') ? src : {};
    var d = DEFAULTS.theme;
    var hex = String(src.accentColor == null ? '' : src.accentColor).trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(hex)) hex = d.accentColor;
    return {
      accent: ACCENTS.indexOf(src.accent) > -1 ? src.accent : d.accent,
      accentColor: hex,
      glow: ['strong', 'normal', 'off'].indexOf(src.glow) > -1 ? src.glow : d.glow,
      radius: ['small', 'normal', 'large'].indexOf(src.radius) > -1 ? src.radius : d.radius,
      presets: normPresets(src.presets)
    };
  }

  /* 阅读体验：字号 / 行高 / 字体 / 正文宽度 / 目录 */
  function normRead(src) {
    src = (src && typeof src === 'object') ? src : {};
    var d = DEFAULTS.read;
    var line = parseFloat(src.line);
    if (!isFinite(line)) line = d.line;
    return {
      size: intIn(src.size, 14, 20, d.size),
      line: Math.min(2.2, Math.max(1.6, line)),
      font: src.font === 'serif' ? 'serif' : 'sans',
      width: intIn(src.width, 640, 1080, d.width),
      toc: src.toc === undefined ? d.toc : !!src.toc
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
    MAX_SPONSOR_CODES: MAX_SPONSOR_CODES,
    MAX_FEATURED_PICKS: MAX_FEATURED_PICKS,
    MAX_IMG_CHARS: MAX_IMG_CHARS,
    AUTO_KEYS: AUTO_KEYS,
    ACCENTS: ACCENTS,
    DEFAULT_PASS: DEFAULT_PASS,
    DEFAULTS: clone(DEFAULTS),
    saveFailed: false,

    /* 当前完整配置 */
    get: function () {
      var out = pick(clone(DEFAULTS), window.XY_CONFIG);
      var ls = readLS();
      if (ls) {
        /* v1 → v2 迁移：卡片图标 / 介绍从「默认显示」改成「默认隐藏」。
           老版本只要你在后台存过任何一项设置，save() 就会把当时的默认值
           （showIcons:true）一起固化进 localStorage —— 那不是你选出来的。
           所以没带 _ver 的老配置一律丢掉 showIcons，让新的默认值生效；
           升级之后你手动开的开关带 _ver 存着，不会被再重置。 */
        if (!ls._ver) delete ls.showIcons;
        /* v2 → v3：本站新增「灵感随记」（#/idea），默认把它放进顶栏自定义链接。
           以前只要在后台存过任何一项设置，customLinks 就会被固化成当时的值（多半是空数组），
           默认值再怎么改也进不来 —— 所以这里补一条。只补这一条，你自己加的一条不动；
           要是你已经手动加过 #/idea，就不重复加。 */
        if (!ls._ver || Number(ls._ver) < 3) {
          var cl = Array.isArray(ls.customLinks) ? ls.customLinks : [];
          var hasIdea = cl.some(function (l) { return l && String(l.url || '').indexOf('#/idea') > -1; });
          if (!hasIdea && cl.length < MAX_LINKS) {
            ls.customLinks = [{ icon: '✨', name: '灵感随记', url: '#/idea' }].concat(cl);
          }
        }
        out = pick(out, ls);
      }
      return out;
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

    /* 关于页（#/about） */
    about: function () { return Store.get().about; },
    setAbout: function (patch) {
      var cfg = Store.get();
      var next = {};
      Object.keys(cfg.about || {}).forEach(function (k) { next[k] = cfg.about[k]; });
      Object.keys(patch || {}).forEach(function (k) { next[k] = patch[k]; });
      cfg.about = normAbout(next);
      Store.save(cfg);
      return cfg.about;
    },
    resetAbout: function () {
      var cfg = Store.get();
      cfg.about = normAbout(DEFAULTS.about);
      Store.save(cfg);
      return cfg.about;
    },

    /* 主题外观：只传要改的字段，其余保持原样 */
    setTheme: function (patch) {
      var cfg = Store.get();
      var next = {};
      Object.keys(cfg.theme || {}).forEach(function (k) { next[k] = cfg.theme[k]; });
      Object.keys(patch || {}).forEach(function (k) { next[k] = patch[k]; });
      cfg.theme = normTheme(next);
      Store.save(cfg);
      return cfg.theme;
    },
    theme: function () { return Store.get().theme; },

    /* ---------- 我的配色（自己存的几套主色） ---------- */
    MAX_PRESETS: MAX_PRESETS,
    presets: function () { return (Store.theme().presets || []).slice(); },
    presetById: function (id) {
      var list = Store.presets();
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    },
    /* 按颜色找：调色盘选了已存过的颜色时，界面上要能高亮那一套 */
    presetByColor: function (color) {
      var hex = String(color == null ? '' : color).trim().toLowerCase();
      var list = Store.presets();
      for (var i = 0; i < list.length; i++) if (list[i].color === hex) return list[i];
      return null;
    },
    /* 存一套。颜色重复 / 超过上限就拒绝，交给界面提示 */
    addPreset: function (name, color) {
      var hex = String(color == null ? '' : color).trim().toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(hex)) return { ok: false, code: 'bad' };
      if (Store.presetByColor(hex)) return { ok: false, code: 'dup', preset: Store.presetByColor(hex) };
      var list = Store.presets();
      if (list.length >= MAX_PRESETS) return { ok: false, code: 'full' };
      var preset = {
        id: 'c' + hex.substr(1) + '-' + Date.now().toString(36),
        name: String(name == null ? '' : name).trim().slice(0, 12) || nextPresetName(list),
        color: hex
      };
      list.push(preset);
      Store.setTheme({ presets: list });
      return { ok: true, preset: Store.presetByColor(hex) || preset };
    },
    renamePreset: function (id, name) {
      var list = Store.presets(), hit = null;
      for (var i = 0; i < list.length; i++) if (list[i].id === id) { hit = list[i]; break; }
      if (!hit) return null;
      var n = String(name == null ? '' : name).replace(/[\r\n\t]/g, ' ').trim().slice(0, 12);
      if (n) hit.name = n;                 // 清空就当没改，不会变成无名配色
      Store.setTheme({ presets: list });
      return Store.presetById(id);
    },
    removePreset: function (id) {
      var list = Store.presets().filter(function (p) { return p.id !== id; });
      Store.setTheme({ presets: list });
      return list;
    },
    /* 应用一套：切到 custom + 那个主色（另外两色由前台按色相推） */
    applyPreset: function (id) {
      var p = Store.presetById(id);
      if (!p) return null;
      return Store.setTheme({ accent: 'custom', accentColor: p.color });
    },

    /* 阅读体验：只传要改的字段，其余保持原样 */
    setRead: function (patch) {
      var cfg = Store.get();
      var next = {};
      Object.keys(cfg.read || {}).forEach(function (k) { next[k] = cfg.read[k]; });
      Object.keys(patch || {}).forEach(function (k) { next[k] = patch[k]; });
      cfg.read = normRead(next);
      Store.save(cfg);
      return cfg.read;
    },
    read: function () { return Store.get().read; },

    save: function (cfg) {
      cfg = pick(clone(DEFAULTS), cfg);
      cfg._ver = CFG_VER;          /* 盖上版本戳，下次 get() 就知道不用再迁移 */
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

    /* ---------- 文章（Markdown） ---------- */
    /* 后台用：始终返回独立副本 */
    postsAll: function () {
      var raw = null;
      try { raw = localStorage.getItem(POSTS_KEY); } catch (e) {}
      if (raw) {
        try { var v = JSON.parse(raw); if (Array.isArray(v)) return clone(v); } catch (e) {}
      }
      return clone((window.SITE_DATA && window.SITE_DATA.posts) || []);
    },
    /* 前台只读：没有本地覆盖时直接返回原数组引用，零开销 */
    posts: function () {
      var raw = null;
      try { raw = localStorage.getItem(POSTS_KEY); } catch (e) {}
      if (raw) {
        try { var v = JSON.parse(raw); if (Array.isArray(v)) return v; } catch (e) {}
      }
      return (window.SITE_DATA && window.SITE_DATA.posts) || [];
    },
    postsIsCustom: function () {
      try { return !!localStorage.getItem(POSTS_KEY); } catch (e) { return false; }
    },
    setPosts: function (list) {
      var arr = (Array.isArray(list) ? list : []).map(normPost);
      try { localStorage.setItem(POSTS_KEY, JSON.stringify(arr)); }
      catch (e) {
        /* 多半是 localStorage 满了（浏览器一般 5MB） */
        Store.saveFailed = true;
        return false;
      }
      Store.saveFailed = false;
      document.dispatchEvent(new CustomEvent('xy:posts', { detail: arr }));
      return arr;
    },
    resetPosts: function () {
      try { localStorage.removeItem(POSTS_KEY); } catch (e) {}
      document.dispatchEvent(new CustomEvent('xy:posts', { detail: Store.posts() }));
    },
    exportPostsJSON: function () { return JSON.stringify(Store.postsAll(), null, 2); },
    importPostsJSON: function (str) {
      var v;
      try { v = JSON.parse(str); } catch (e) { return false; }
      if (!Array.isArray(v)) return false;
      return Store.setPosts(v) !== false;
    },

    /* ---------- 分享条目（#/share 时间线） ---------- */
    /* 一条分享的稳定标识：日期 + 标题。没有 id 字段，就用它当钥匙 ——
       「今日精选」靠它记住"选了哪几条"，所以改了标题/日期就等于换了一条。 */
    feedKey: function (f) {
      f = f || {};
      return String(f.date == null ? '' : f.date) + '|' + String(f.title == null ? '' : f.title);
    },

    /* 后台用：始终返回独立副本（已按日期倒序，和前台分组顺序一致） */
    feedAll: function () {
      var raw = null;
      try { raw = localStorage.getItem(FEED_KEY); } catch (e) {}
      if (raw) {
        try { var v = JSON.parse(raw); if (Array.isArray(v)) return clone(v); } catch (e) {}
      }
      return clone((window.SITE_DATA && window.SITE_DATA.feed) || []);
    },
    /* 前台只读：没有本地覆盖时直接返回原数组引用，零开销 */
    feed: function () {
      var raw = null;
      try { raw = localStorage.getItem(FEED_KEY); } catch (e) {}
      if (raw) {
        try { var v = JSON.parse(raw); if (Array.isArray(v)) return v; } catch (e) {}
      }
      return (window.SITE_DATA && window.SITE_DATA.feed) || [];
    },
    feedIsCustom: function () {
      try { return !!localStorage.getItem(FEED_KEY); } catch (e) { return false; }
    },
    setFeed: function (list) {
      var arr = (Array.isArray(list) ? list : []).map(normFeed);
      /* 存的时候就排好：日期倒序、同一天保持你排的顺序（Array.sort 是稳定排序） */
      arr.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
      try { localStorage.setItem(FEED_KEY, JSON.stringify(arr)); }
      catch (e) {
        Store.saveFailed = true;
        return false;
      }
      Store.saveFailed = false;
      document.dispatchEvent(new CustomEvent('xy:feed', { detail: arr }));
      return arr;
    },
    resetFeed: function () {
      try { localStorage.removeItem(FEED_KEY); } catch (e) {}
      document.dispatchEvent(new CustomEvent('xy:feed', { detail: Store.feed() }));
    },
    exportFeedJSON: function () { return JSON.stringify(Store.feedAll(), null, 2); },
    importFeedJSON: function (str) {
      var v;
      try { v = JSON.parse(str); } catch (e) { return false; }
      if (!Array.isArray(v)) return false;
      return Store.setFeed(v) !== false;
    },

    /* ---------- 口令 ---------- */
    /* 优先级：本机设的 > site-data.js 里带来的（后台导出时打包）> 默认口令。
       在后台改 passwords 只影响本机；想让线上也用同一个口令，
       靠「备份 → 发布到虚拟主机」把 window.XY_PASS 一起带出去。 */
    passHash: function () {
      var h = null;
      try { h = localStorage.getItem(PASS_KEY); } catch (e) {}
      if (h) return h;
      if (window.XY_PASS) return String(window.XY_PASS);
      return hash(DEFAULT_PASS);
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
      if (h) return false;
      if (window.XY_PASS && String(window.XY_PASS) !== hash(DEFAULT_PASS)) return false;
      return true;
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
