/* gen-app-json.js —— 把站点当前内容打包成一份 app.json，给安卓 App 拉取

   为什么要这一份：Android 原生 App 不能直接读 localStorage 或执行 JS，
   纯静态站又没有任何后端接口。所以把「导航分类 + 分享 + 文章 + 站点信息」
   烘成一个 JSON 放在仓库里，App 每次启动就拉它 —— 拉到即最新。

   用法：
     node tools/gen-app-json.js            # 写 api/app.json（内容没变就不写）
     node tools/gen-app-json.js --check    # 只对比，不写（改了没 都靠它）
     node tools/gen-app-json.js --force    # 内容没变也重写，只为刷 build 时间戳
     node tools/gen-app-json.js --plain    # 强制不启浏览器，直接读仓库里的 js/css

   两条取数路径：
     A 浏览器（默认先试）—— 启一个 headless Chrome 打开真实页面，
       用 XYStore 取数据 + 读 getComputedStyle 拿色板。和前台看到的一模一样，
       但要求本机有 Chrome、有 puppeteer、本地 8321 服务还起着。
     B 纯 Node（A 不成立时自动退回）—— 用 vm 把 site-data.js / config.js /
       bookmarks.js / feed-import.js / data.js 按 index.html 的顺序跑一遍，
       拿到同一个 window.XYStore；色板则解析 assets/css/style.css 里的 CSS 变量。
       不启浏览器、不用起服务，跑一次一百来毫秒，没有额外依赖。

   为什么默认还是先试 A：色板那一段 A 读的是「真实的计算样式」，
   后台换了色板/圆角/glow 之后不用改这个脚本。B 走的是「解析 CSS 文本」，
   规则一样但少一层浏览器裁决 —— 两边算出来的值必须一致，
   所以改完这个文件务必 `node tools/gen-app-json.js --check` 对一眼。

   为什么「内容没变就不写」：build/updatedAt 是分钟级时间戳，
   每跑一次都会变，而 app.json 是 300KB —— 见样就写的话，每提交一次
   都要带一个 300KB 的 diff，历史很快就胖得没法看。
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'api', 'app.json');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.XY_BASE || 'http://127.0.0.1:8321/index.html';
const SITE_URL = 'https://mackxin.github.io/xingyu/';
const checkOnly = process.argv.indexOf('--check') > -1;
const force = process.argv.indexOf('--force') > -1;
const forcePlain = process.argv.indexOf('--plain') > -1 || process.argv.indexOf('--no-browser') > -1;

/* 顺序照 index.html 里那串 <script>：bookmarks 要在 data 之前（data.js 用
   window.SITE_BOOKMARKS 组装 SITE_DATA），feed-import 同理。
   app.js / admin.js 不加载 —— 它们只干 DOM 的活，数据全在 XYStore 里。 */
const JS_FILES = [
  'assets/js/site-data.js',
  'assets/js/config.js',
  'assets/js/bookmarks.js',
  'assets/js/feed-import.js',
  'assets/js/data.js'
];

/* 站内链接（#/nav、#/idea 这种）在 App 里要拼成完整网址，否则点不开 */
/* 图片地址：data URL 原样，站内相对路径拼成线上绝对地址（App 没有「当前页面」可参照） */
function absAsset(u) {
  const s = String(u == null ? '' : u).trim();
  if (!s) return '';
  if (/^data:/i.test(s)) return s;
  if (/^https?:/i.test(s)) return s;
  return SITE_URL + s.replace(/^\.?\//, '');
}

function absUrl(u) {
  const s = String(u == null ? '' : u).trim();
  if (!s) return '';
  if (s.charAt(0) === '#') return SITE_URL + s;
  return s;
}

/* ---- 跟着 App 一起走的两份「说明书」，直接读仓库里的文件 ----
   data/changelog.json —— 每个版本改了什么（App 设置 → 版本更新）
   data/help.md        —— 使用手册（App 设置 → 使用手册）
   这两份不进站点配置：它们不该被后台的一次保存覆盖掉，
   改完文件重跑一遍本脚本就会同步到 App。 */
const DATA_DIR = path.join(ROOT, 'data');
function readChangelog() {
  try {
    const arr = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'changelog.json'), 'utf8'));
    if (!Array.isArray(arr)) return [];
    /* 新版本排前面；字段按 App 端要的样子裁一遍，别把写错的东西整包塞过去 */
    return arr.map(x => ({
      code: Number(x.code) || 0,
      version: String(x.version || ''),
      date: String(x.date || ''),
      items: Array.isArray(x.items) ? x.items.map(String).filter(Boolean) : []
    })).filter(x => x.version && x.items.length).sort((a, b) => b.code - a.code);
  } catch (e) {
    console.warn('· data/changelog.json 读不了，changelog 留空：' + e.message);
    return [];
  }
}
function readHelp() {
  try {
    return fs.readFileSync(path.join(DATA_DIR, 'help.md'), 'utf8');
  } catch (e) {
    console.warn('· data/help.md 读不了，help 留空：' + e.message);
    return '';
  }
}

/* ===================================================================
   拼装：两条路径都吐同一份 { cfg, light, dark, cats, feed, posts }，
   这里统一按 App 要的样子裁一遍 —— 以前这段逻辑住在 page.evaluate 里，
   换到纯 Node 就得抄两遍，抄着抄着两边就长得不一样了。
   =================================================================== */
function buildRaw(src) {
  const cfg = src.cfg || {};
  const home = cfg.home || {};
  const about = cfg.about || {};
  const th = cfg.theme || {};
  return {
    siteName: cfg.siteName || '',
    /* 副标题用配置里的「标语 tagline」。以前这里读的是 home.badge
       （那是首屏大图上的小徽章，语义完全不同），App 首页会显示成
       「🛰️ 持续更新中」这种跟标语没关系的东西。 */
    slogan: cfg.tagline || '',
    desc: home.descAfter ? (home.descBefore || '') + home.descAfter : (cfg.desc || ''),
    /* 建站日期在配置里叫 startDate，没有 cfg.since 这个 key ——
       以前读 cfg.since 恒空，App 首页那行「建站于…」永远是空的。 */
    since: cfg.startDate || '',
    /* 导航页显示开关（后台「站点信息 → 显示项」）：
       卡片左侧彩色图标 / 名字下面那行介绍 / 分类名前的 emoji / 分类名后的站点数 */
    nav: {
      icons: cfg.showIcons === true,
      desc: cfg.showDesc === true,
      catIcon: cfg.showCatIcon === true,
      count: cfg.showCatCount !== false
    },
    /* 外观：色板 / 极光强度 / 圆角 + 深浅两套实色 */
    theme: {
      accent: String(th.accent || 'aurora'),
      accentColor: String(th.accentColor || ''),
      glow: String(th.glow || 'normal'),
      radius: String(th.radius || 'normal'),
      light: src.light,
      dark: src.dark
    },
    /* 首页要用的几块：今日精选 / 赞助 / 建站日期 */
    home: {
      startDate: String(cfg.startDate || ''),
      featuredTitle: String(home.featuredTitle || '今日精选'),
      featuredDesc: String(home.featuredDesc || ''),
      featuredCount: Math.max(1, Math.min(12, Number(home.featuredCount) || 6)),
      featuredPicks: Array.isArray(home.featuredPicks) ? home.featuredPicks.map(String) : [],
      sponsorOn: home.sponsorOn !== false,
      sponsorTitle: String(home.sponsorTitle || ''),
      sponsorDesc: String(home.sponsorDesc || ''),
      sponsorNote: String(home.sponsorNote || ''),
      sponsorLink: String(home.sponsorLink || ''),
      /* 收款码：后台能放好几张（支付宝 / 微信 / 云闪付），这里只带前 3 张。
         src 一栏可能是后台上传的 data URL —— 单张超过 150KB 就跳过，
         否则 app.json 会被两张码撑到 1MB，App 每次冷启动都要多下一会儿。 */
      sponsorCodes: (Array.isArray(home.sponsorCodes) ? home.sponsorCodes : [])
        .filter(c => c && c.src)
        .slice(0, 3)
        .map(c => ({
          src: absAsset(c.src),
          label: String(c.label || ''),
          link: String(c.link || '')
        }))
        .filter(c => c.src && c.src.length <= 150000)
    },
    /* 阅读偏好（后台「阅读体验」）：App 拿它当默认值，用户在自己手机上改过就听用户的 */
    read: {
      size: Math.max(14, Math.min(20, Number((cfg.read || {}).size) || 16)),
      line: Math.max(1.6, Math.min(2.2, Number((cfg.read || {}).line) || 1.95)),
      font: String((cfg.read || {}).font || 'sans') === 'serif' ? 'serif' : 'sans',
      toc: (cfg.read || {}).toc !== false
    },
    /* 关于这一页：正文是 Markdown，App 用自己那个渲染器画 */
    about: {
      title: String(about.title || ''),
      lede: String(about.lede || ''),
      updated: String(about.updated || ''),
      md: Array.isArray(about.md) ? about.md.join('\n') : String(about.md || '')
    },
    /* 顶栏那几颗自定义入口（后台「自定义链接」，最多 5 个）——
       App 顶栏跟网页端显示同一组，加一条两边一起有。
       「足迹」（#/insight）是内置页，跟网页端一样自动插在「灵感随记」后面，
       不用去后台手动再加一条；自己配过就手动那条为准。 */
    links: (function () {
      var src2 = (cfg.customLinks || []).filter(function (l) { return l && l.name && l.url; });
      var list = src2.map(function (l) { return { icon: l.icon || '', name: l.name, url: l.url }; });
      var hasFoot = list.some(function (l) { return String(l.url || '').indexOf('#/insight') > -1; });
      if (!hasFoot) {
        var at = -1;
        list.forEach(function (l, i) { if (at < 0 && String(l.url || '').indexOf('#/idea') > -1) at = i; });
        var foot = { icon: '👣', name: '足迹', url: '#/insight' };
        if (at > -1) list.splice(at + 1, 0, foot); else list.push(foot);
      }
      return list;
    })(),
    /* 顶栏各块的显隐（后台「站点信息 → 顶栏显示」）——
       App 顶栏照这几个 boolean 决定画不画那一块。老配置没有这些 key，
       一律当 true（跟 DEFAULTS 一致），不能因为缺字段就全给藏了 */
    top: {
      brand: cfg.showTopBrand === true,
      links: cfg.showTopLinks !== false,
      search: cfg.showSearch !== false,
      filter: cfg.showTopFilter !== false,
      saved: cfg.showTopSaved !== false,
      theme: cfg.showTopTheme !== false
    },
    cats: src.cats || [],
    feed: src.feed || [],
    posts: src.posts || []
  };
}

/* ===================================================================
   路径 A：真实浏览器
   =================================================================== */
async function fromBrowser() {
  /* puppeteer 藏在 /tmp 里装过的那份 —— 本机不装到项目里，省 node_modules */
  const puppeteer = require('/tmp/xy2/node_modules/puppeteer-core');
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const p = await b.newPage();
    await p.goto(BASE + '#/home', { waitUntil: 'networkidle2', timeout: 60000 });
    await p.waitForFunction('!!window.XYStore', { timeout: 20000 });
    await new Promise(r => setTimeout(r, 800));
    return await p.evaluate(() => {
      const S = window.XYStore;
      /* 外观：**读真实的计算样式**，不是抄 DEFAULTS。
         后台换色板 / 调圆角 / 换 glow 之后，CSS 变量才是最终事实，
         App 照这份值还原就和网页一模一样；哪天真加了新色板也不用改这条管线。 */
      function cssPal(theme) {
        const root = document.documentElement;
        const keep = root.getAttribute('data-theme');
        if (theme) root.setAttribute('data-theme', theme);
        else root.removeAttribute('data-theme');
        const cs = getComputedStyle(root);
        const v = (n) => String(cs.getPropertyValue(n) || '').trim();
        const out = {
          bg: v('--bg'), bgSoft: v('--bg-soft'),
          glass: v('--glass'), glass2: v('--glass-2'), glassHi: v('--glass-hi'),
          text: v('--text'), dim: v('--text-dim'), mute: v('--text-mute'),
          a1: v('--a1'), a2: v('--a2'), a3: v('--a3'),
          inkA1: v('--ink-a1'), inkA2: v('--ink-a2'), inkA3: v('--ink-a3'),
          star: v('--star'),
          rSm: v('--r-sm'), rMd: v('--r'), rLg: v('--r-lg'), rXl: v('--r-xl')
        };
        if (keep) root.setAttribute('data-theme', keep);
        else root.removeAttribute('data-theme');
        return out;
      }
      return {
        cfg: S.get() || {},
        light: cssPal('light'),
        dark: cssPal('dark'),
        cats: S.dataCategories() || [],
        feed: S.feedAll() || [],
        posts: S.postsAll() || []
      };
    });
  } finally {
    /* launch 成功但页面挂了也要把 Chrome 关掉，不然会攒一堆残留进程 */
    try { await b.close(); } catch (e) {}
  }
}

/* ===================================================================
   路径 B：纯 Node —— 不启浏览器，直接读仓库里的 js / css
   =================================================================== */

/* 一个「什么都受得住」的 DOM 桩：站点脚本在加载时会摸 document / localStorage，
   这里给个黑洞，取什么都是个空壳，调什么都不会炸。 */
function fakeDom() {
  const noop = function () {};
  const el = () => new Proxy(function () {}, {
    get(t, k) {
      if (k === 'style') return { setProperty: noop, removeProperty: noop };
      if (k === 'classList') return { add: noop, remove: noop, toggle: noop, contains: () => false };
      if (k === 'getAttribute') return () => null;
      if (k === 'setAttribute' || k === 'removeAttribute' || k === 'appendChild') return noop;
      if (k === 'querySelector') return () => null;
      if (k === 'querySelectorAll') return () => [];
      if (k === 'innerHTML' || k === 'textContent') return '';
      if (k === 'dataset') return {};
      if (k === 'children') return [];
      if (k === Symbol.toPrimitive) return () => '';
      return el();
    },
    apply() { return el(); }
  });
  const mem = Object.create(null);
  const storage = {
    getItem: k => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: k => { delete mem[k]; },
    clear: () => { for (const k in mem) delete mem[k]; }
  };
  return {
    console,
    localStorage: storage,
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop, clear: noop },
    document: {
      documentElement: { style: { setProperty: noop }, setAttribute: noop, getAttribute: () => null, removeAttribute: noop },
      head: { appendChild: noop },
      body: { appendChild: noop, classList: { add: noop, remove: noop } },
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: noop,
      removeEventListener: noop,
      createElement: el,
      dispatchEvent: noop
    },
    navigator: { userAgent: 'node' },
    location: { href: 'http://127.0.0.1/', hash: '', search: '', pathname: '/' },
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: noop, cancelAnimationFrame: noop
  };
}

function readStoreInNode() {
  const sandbox = fakeDom();
  /* window / self / globalThis 都指向同一个对象：这些脚本是当浏览器写的，
     有的用 window.XXX、有的直接 XXX =，别名一给就都能跑 */
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.top = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const rel of JS_FILES) {
    const file = path.join(ROOT, rel);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: rel });
  }
  const S = sandbox.XYStore;
  if (!S) throw new Error('跑完那几个 js 也没拿到 window.XYStore');
  return {
    cfg: S.get() || {},
    /* dataCategories 而不是 dataAll：前者就是「前台看到的那份」，跟浏览器路径一致 */
    cats: S.dataCategories() || [],
    feed: S.feedAll() || [],
    posts: S.postsAll() || []
  };
}

/* ---------- 色板：解析 style.css 里的 CSS 变量 ----------
   浏览器那边是 getComputedStyle 裁决出来的；这边就把 :root /
   html[data-theme="light"] / html[data-radius="…"] 三种块里的变量叠一遍。
   叠的顺序跟层叠一样：:root → 主题块 → 圆角块。 */
function cssVarBlocks() {
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'style.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');   /* 先去掉注释：里面也带 ; : 和 { */
  const out = { root: {}, light: {}, radiusSmall: {}, radiusLarge: {} };
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = rule.exec(css))) {
    const sel = m[1].trim().replace(/\s+/g, ' ').toLowerCase();
    let bucket = null;
    if (sel === ':root') bucket = out.root;
    else if (sel === 'html[data-theme="light"]') bucket = out.light;
    else if (sel === 'html[data-radius="small"]') bucket = out.radiusSmall;
    else if (sel === 'html[data-radius="large"]') bucket = out.radiusLarge;
    if (!bucket) continue;
    const decl = /(--[a-z0-9-]+)\s*:\s*([^;]+)/g;
    let d;
    while ((d = decl.exec(m[2]))) bucket[d[1].trim()] = d[2].trim();
  }
  return out;
}

/* 预设色板住在 app.js 里（applyLook 用）。这里把它抠出来，不重复抄一份 ——
   哪天加一个色板，两边自动都有。 */
function accentPresets() {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'app.js'), 'utf8');
    const block = /var ACCENT_PRESETS\s*=\s*\{([\s\S]*?)\};/.exec(src);
    if (!block) return {};
    const out = {};
    const one = /(\w+)\s*:\s*\[\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\]/g;
    let x;
    while ((x = one.exec(block[1]))) out[x[1]] = [x[2], x[3], x[4]];
    return out;
  } catch (e) {
    return {};
  }
}

/* 下面三个小函数是 app.js 里 hexToHsl / hslCss / accentTrio 的照抄 ——
   自定义主色时要推另外两个邻近色，算法必须跟网页一致，否则 App 的渐变
   和网页会差一个色相。 */
function hexToHsl(hex) {
  const r = parseInt(hex.substr(1, 2), 16) / 255;
  const g = parseInt(hex.substr(3, 2), 16) / 255;
  const b = parseInt(hex.substr(5, 2), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
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
function accentTrio(th) {
  const presets = accentPresets();
  if (th.accent !== 'custom' && presets[th.accent]) return presets[th.accent].slice();
  const hex = /^#[0-9a-f]{6}$/i.test(String(th.accentColor || '')) ? th.accentColor : '#7c9cff';
  const c = hexToHsl(hex);
  return [hex, hslCss(c.h + 36, c.s + 4, c.l + 6), hslCss(c.h - 56, c.s + 2, c.l + 10)];
}

function paletteFromCss(th) {
  const b = cssVarBlocks();
  const radius = String(th.radius || 'normal');
  const rad = radius === 'small' ? b.radiusSmall : radius === 'large' ? b.radiusLarge : {};
  const trio = accentTrio(th);
  const pick = (vars) => {
    const v = (n) => String(vars[n] || '').trim();
    return {
      bg: v('--bg'), bgSoft: v('--bg-soft'),
      glass: v('--glass'), glass2: v('--glass-2'), glassHi: v('--glass-hi'),
      text: v('--text'), dim: v('--text-dim'), mute: v('--text-mute'),
      /* --a1..3 是 app.js 写在 documentElement.style 上的内联值，优先级最高，
         所以浅色块里没有它们也照样生效 —— 这里直接用推出来的 trio */
      a1: trio[0], a2: trio[1], a3: trio[2],
      /* --ink-aN 是「文字用的强调色」，浅色主题有单独一档压深的值，
         而且不跟色板走（CSS 里是写死的）—— 照 CSS 抄才对得上浏览器 */
      inkA1: v('--ink-a1'), inkA2: v('--ink-a2'), inkA3: v('--ink-a3'),
      star: v('--star'),
      rSm: v('--r-sm'), rMd: v('--r'), rLg: v('--r-lg'), rXl: v('--r-xl')
    };
  };
  return {
    dark: pick(Object.assign({}, b.root, rad)),
    light: pick(Object.assign({}, b.root, b.light, rad))
  };
}

function fromPlain() {
  const got = readStoreInNode();
  const pal = paletteFromCss(got.cfg.theme || {});
  return { cfg: got.cfg, light: pal.light, dark: pal.dark, cats: got.cats, feed: got.feed, posts: got.posts };
}

/* =================================================================== */
(async () => {
  let src = null;
  if (!forcePlain) {
    try {
      src = await fromBrowser();
      console.log('· 取数路径：浏览器（色板走 getComputedStyle）');
    } catch (e) {
      console.warn('· 浏览器用不了（' + String(e.message).split('\n')[0] + '）');
      console.warn('  退回纯 Node：读仓库里的 js/css —— 结果等价，只是色板按 CSS 文本算');
    }
  }
  if (!src) {
    src = fromPlain();
    console.log('· 取数路径：纯 Node（不启浏览器）');
  }

  const raw = buildRaw(src);

  const cats = raw.cats.map(c => ({
    id: String(c.id || ''),
    name: String(c.name || ''),
    icon: String(c.icon || ''),
    desc: String(c.desc || ''),
    links: (c.links || []).map(l => ({
      name: String(l.n || l.name || ''),
      url: absUrl(l.u || l.url),
      icon: String(l.icon || ''),
      desc: String(l.d || l.desc || ''),
      /* 后台可以给单个站点设置顶（网页端 sortPinned 用），App 也要能跟着置顶。
         只在 true 时带上这个 key —— 两千多个站点每个写一遍 "pin":false
         会让 app.json 白胖 27KB，App 那边缺字段就是 false，不用写出来。 */
      ...(l.pin === true ? { pin: true } : {})
    })).filter(l => l.name && l.url)
  }));

  const feed = raw.feed.map(f => ({
    id: 'f-' + String(f.date || '') + '-' + String(f.title || '').slice(0, 24),
    date: String(f.date || ''),
    icon: String(f.icon || ''),
    title: String(f.title || ''),
    url: absUrl(f.url),
    desc: String(f.desc || ''),
    tags: Array.isArray(f.tags) ? f.tags.map(String) : []
  }));

  /* 草稿只在后台可见 —— 在这里就滤掉，App 拿到的就是「读者能看到的那些」。
     pin 照抄站点（置顶优先排序在 App 里做，跟网页端 postList() 一个规则） */
  const posts = (raw.posts || [])
    .filter(x => x && !x.draft)
    .map(x => ({
      id: String(x.id || ''),
      title: String(x.title || ''),
      date: String(x.date || ''),
      tags: Array.isArray(x.tags) ? x.tags.map(String) : [],
      excerpt: String(x.excerpt || ''),
      body: String(x.body || ''),
      pin: x.pin === true
    }));

  const now = new Date();  const stamp = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');

  const payload = {
    schema: 1,
    build: stamp,
    updatedAt: now.toISOString(),
    site: {
      name: raw.siteName || '壹号栈',
      slogan: raw.slogan || '',
      desc: raw.desc || '',
      since: raw.since || '',
      url: SITE_URL
    },
    stats: {
      cats: cats.length,
      links: cats.reduce((n, c) => n + c.links.length, 0),
      feed: feed.length,
      posts: posts.length
    },
    /* 顶栏自定义入口：站内路由保留 `#/xxx` 原样（App 里要跳原生页），
       站外链接补成完整网址 */
    links: (raw.links || []).map(l => ({
      icon: String(l.icon || ''),
      name: String(l.name || ''),
      url: /^#|^\//.test(String(l.url || '')) ? String(l.url) : absUrl(l.url)
    })).filter(l => l.name && l.url),
    /* 顶栏各块显隐（品牌默认开，跟站点 DEFAULTS 一致 —— 关掉的话 App 顶栏
       连回顶入口都没有，所以兜底必须是 true） */
    top: raw.top || { brand: true, links: true, search: true, filter: true, saved: true, theme: true },
    /* 导航页显示开关：卡片三项默认全关（只留名字），分类站点数默认开 */
    nav: raw.nav || { icons: false, desc: false, catIcon: false, count: true },
    /* 外观：深浅两套色 + 极光强度 + 圆角 */
    theme: raw.theme || null,
    /* 首页 / 关于要用的文案块 */
    home: raw.home || null,
    about: raw.about || null,
    /* 阅读偏好（后台「阅读体验」）：App 拿它当默认值，用户在自己手机上改过就听用户的 */
    read: raw.read || null,
    /* 设置页里的两份说明书：版本更新说明 + 使用手册 */
    changelog: readChangelog(),
    help: readHelp(),
    cats,
    feed,
    posts
  };

  const json = JSON.stringify(payload);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  /* 指纹：把两个「每次都会变」的时间戳抹掉，剩下的才是真内容 */
  const fingerprint = (o) => JSON.stringify(Object.assign({}, o, { build: '', updatedAt: '' }));

  if (checkOnly) {
    let old = '';
    try { old = fs.readFileSync(OUT, 'utf8'); } catch (e) {}
    const same = old && JSON.stringify(JSON.parse(old).stats) === JSON.stringify(payload.stats);
    console.log('现有 app.json：' + (old ? (JSON.parse(old).build + ' / ' + JSON.stringify(JSON.parse(old).stats)) : '（还没有）'));
    console.log('本次生成  ：' + stamp + ' / ' + JSON.stringify(payload.stats));
    console.log(same ? '统计数一样 —— 大概率只是时间戳变，可以不提交' : '内容有变化 —— 需要重新生成');
    process.exit(0);
  }

  let old = null;
  try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}

  if (!force && old && fingerprint(old) === fingerprint(payload)) {
    console.log('· 内容没变，跳过写入（要刷时间戳用 --force）');
    console.log('   现有 build ' + old.build + ' · ' + JSON.stringify(old.stats));
    return;
  }

  fs.writeFileSync(OUT, json);
  console.log('✅ 写入 ' + path.relative(ROOT, OUT));
  console.log('   ' + (json.length / 1024).toFixed(1) + ' KB · build ' + stamp);
  console.log('   ' + JSON.stringify(payload.stats));
})();
