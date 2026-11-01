/* gen-app-json.js —— 把站点当前内容打包成一份 app.json，给安卓 App 拉取

   为什么要这一份：Android 原生 App 不能直接读 localStorage 或执行 JS，
   纯静态站又没有任何后端接口。所以把「导航分类 + 分享 + 文章 + 站点信息」
   烘成一个 JSON 放在仓库里，App 每次启动就拉它 —— 拉到即最新。

   用法（本地 8321 服务要先起着）：
     node tools/gen-app-json.js            # 写 api/app.json（内容没变就不写）
     node tools/gen-app-json.js --check    # 只对比，不写（改了没 都靠它）
     node tools/gen-app-json.js --force    # 内容没变也重写，只为刷 build 时间戳

   为什么「内容没变就不写」：build/updatedAt 是分钟级时间戳，
   每跑一次都会变，而 app.json 是 300KB —— 见样就写的话，每提交一次
   都要带一个 300KB 的 diff，历史很快就胖得没法看。

   数据来源是浏览器里真实的 XYStore（和前台看到的一模一样），
   所以后台里改过、并「发布到虚拟主机」的内容也会被带进来 —— 前提是
   那些数据已经进了 assets/js/data.js 或 site-data.js。
*/
const fs = require('fs');
const path = require('path');
const puppeteer = require('/tmp/xy2/node_modules/puppeteer-core');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'api', 'app.json');
const BASE = process.env.XY_BASE || 'http://127.0.0.1:8321/index.html';
const SITE_URL = 'https://mackxin.github.io/xingyu/';
const checkOnly = process.argv.indexOf('--check') > -1;
const force = process.argv.indexOf('--force') > -1;

/* 站内链接（#/nav、#/idea 这种）在 App 里要拼成完整网址，否则点不开 */
function absUrl(u) {
  const s = String(u == null ? '' : u).trim();
  if (!s) return '';
  if (s.charAt(0) === '#') return SITE_URL + s;
  return s;
}

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.goto(BASE + '#/home', { waitUntil: 'networkidle2', timeout: 60000 });
  await p.waitForFunction('!!window.XYStore', { timeout: 20000 });
  await new Promise(r => setTimeout(r, 800));

  const raw = await p.evaluate(() => {
    const S = window.XYStore;
    const cfg = S.get() || {};
    const home = S.home() || {};
    const about = S.about() || {};
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
    const th = S.theme() || {};
    return {
      siteName: cfg.siteName || '',
      slogan: home.badge || cfg.slogan || '',
      desc: home.descAfter ? (home.descBefore || '') + home.descAfter : (cfg.desc || ''),
      since: cfg.since || '',
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
        light: cssPal('light'),
        dark: cssPal('dark')
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
        sponsorLink: String(home.sponsorLink || '')
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
        var src = (cfg.customLinks || []).filter(function (l) { return l && l.name && l.url; });
        var list = src.map(function (l) { return { icon: l.icon || '', name: l.name, url: l.url }; });
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
      cats: S.dataCategories() || [],
      feed: S.feedAll() || [],
      posts: S.postsAll() || []
    };
  });
  await b.close();

  const cats = raw.cats.map(c => ({
    id: String(c.id || ''),
    name: String(c.name || ''),
    icon: String(c.icon || ''),
    desc: String(c.desc || ''),
    links: (c.links || []).map(l => ({
      name: String(l.n || l.name || ''),
      url: absUrl(l.u || l.url),
      icon: String(l.icon || ''),
      desc: String(l.d || l.desc || '')
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
    /* 顶栏各块显隐（品牌默认关，跟站点 DEFAULTS 一致） */
    top: raw.top || { brand: false, links: true, search: true, filter: true, saved: true, theme: true },
    /* 导航页显示开关：卡片三项默认全关（只留名字），分类站点数默认开 */
    nav: raw.nav || { icons: false, desc: false, catIcon: false, count: true },
    /* 外观：深浅两套色 + 极光强度 + 圆角 */
    theme: raw.theme || null,
    /* 首页 / 关于要用的文案块 */
    home: raw.home || null,
    about: raw.about || null,
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
