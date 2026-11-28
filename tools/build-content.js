#!/usr/bin/env node
/* =========================================================================
   壹号栈 · 内容构建器
   -------------------------------------------------------------------------
   content/site.json（一个文件，全站内容）  →  assets/js/site-data.js

   为什么要这一步：站点是纯静态的，读的是 <script> 里那份 window.SITE_DATA；
   把 JSON 变成这一份，网页 / App / 后台都不用改运行时代码。

   用法：
       node tools/build-content.js            构建 + 校验
       node tools/build-content.js --check    只校验，不写文件
       node tools/build-content.js --quiet    只报错

   写错了（少个逗号、日期不成形）当场报**第几行第几列**，并且不写盘 ——
   线上不会因为一次手滑变成白页。
   ========================================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'content/site.json');
const CONTENT = path.join(REPO, 'content');
const OUT = path.join(REPO, 'assets/js/site-data.js');

const quiet = process.argv.includes('--quiet');
const checkOnly = process.argv.includes('--check');

const problems = [];   /* 阻断：不修好就不生成 */
const warns = [];      /* 提醒：老数据里本来就有，照搬不拦 */
function fail(where, msg) { problems.push(where + '：' + msg); }
function warn(where, msg) { warns.push(where + '：' + msg); }

/* ---------------------------------------------------------------- 读文件 */

/* JSON.parse 的报错只给 position，换算成「第几行第几列」才找得到 */
function lineOf(text, pos) {
  const before = text.slice(0, pos);
  const line = before.split('\n').length;
  const col = pos - before.lastIndexOf('\n');
  return line + ' 行 ' + col + ' 列';
}

function readSource() {
  if (!fs.existsSync(SRC)) {
    /* 老结构还在的话，给一句能照做的提示，而不是「文件不见了」。
       v169 之前的 content/ 是 nav.json / feed.json / posts/*.md 一堆文件，
       那些文件现在已经没人读了 —— 唯一的内容源是 site.json。 */
    if (fs.existsSync(path.join(CONTENT, 'nav.json'))) {
      fail('content/site.json', '不见了，只剩 v168 那批老文件（nav.json 等），它们已经没人读了。'
        + '去后台「发布上线 → ⬇ 导出 site.json」重新导一份放进来。');
    } else {
      fail('content/site.json', '不见了 —— 后台「发布上线 → ⬇ 导出 site.json」导一份放进来');
    }
    return null;
  }
  const text = fs.readFileSync(SRC, 'utf8');
  try {
    return JSON.parse(text);
  } catch (e) {
    const m = /position (\d+)/.exec(e.message);
    fail('content/site.json', m
      ? '第 ' + lineOf(text, Number(m[1])) + ' 附近写错了（' + e.message + '）'
      : e.message);
    return null;
  }
}

/* ------------------------------------------------------------------ 校验 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkDate(where, d) {
  if (!d) { fail(where, '缺少 date（格式 2026-11-26）'); return false; }
  if (!DATE_RE.test(String(d))) { fail(where, 'date 要写成 2026-11-26 这样，现在是「' + d + '」'); return false; }
  return true;
}

function main() {
  const root = readSource();
  if (!root) { report(); return; }

  /* ---------- 外观 / 站点信息 ---------- */
  const site = (root.site && typeof root.site === 'object') ? root.site : {};
  if (!root.site) fail('content/site.json', '缺少 site 这一段（站名、主题、首页文案都在里面）');

  /* ---------- 导航 ---------- */
  const nav = Array.isArray(root.nav) ? root.nav : [];
  if (!Array.isArray(root.nav)) fail('nav', '要是数组 [ … ]（分类列表）');
  const catIds = new Set();
  let linkCount = 0;
  nav.forEach(function (c, i) {
    const where = 'nav 第 ' + (i + 1) + ' 个分类';
    if (!c || typeof c !== 'object') { fail(where, '不是一个对象'); return; }
    if (!c.name) fail(where, '缺少 name（分类名）');
    if (!c.id) c.id = 'cat-' + i;
    if (catIds.has(c.id)) fail(where, 'id「' + c.id + '」跟前面重复了');
    catIds.add(c.id);
    if (!Array.isArray(c.links)) { fail(where, 'links 要是数组'); return; }
    c.links.forEach(function (l, j) {
      const w = where + ' 第 ' + (j + 1) + ' 条';
      if (!l || !l.n) fail(w, '缺少 n（站点名）');
      else if (!l.u) fail(w, '「' + l.n + '」缺少 u（链接）');
      linkCount++;
      /* 顺手去掉空字段，产物更小 */
      Object.keys(l).forEach(function (k) {
        if (l[k] === '' || l[k] == null) delete l[k];
      });
    });
  });

  /* ---------- 分享 ---------- */
  const feed = Array.isArray(root.feed) ? root.feed : [];
  if (!Array.isArray(root.feed)) fail('feed', '要是数组 [ … ]（分享条目）');
  const feedKeys = new Set();
  feed.forEach(function (f, i) {
    const where = 'feed 第 ' + (i + 1) + ' 条';
    if (!f || typeof f !== 'object') { fail(where, '不是一个对象'); return; }
    if (!f.title) fail(where, '缺少 title');
    else if (!f.url) warn(where, '「' + f.title + '」没有 url（纯文字分享，能显示但点不动）');
    checkDate(where, f.date);
    const k = String(f.date || '') + '|' + String(f.title || '');
    if (feedKeys.has(k)) {
      /* 不算错：同一天写两条同名分享是允许的。只是「今日精选」按
         「日期|标题」认条，会分不清是哪一条 —— 提醒一句就好 */
      warn(where, '跟前面某条同日期同标题，首页「今日精选」会分不清是哪条');
    }
    feedKeys.add(k);
    if (f.tags && !Array.isArray(f.tags)) fail(where, 'tags 要写成 ["工具", "前端"]');
  });
  /* 日期新的排前面，同一天保持你排的顺序 */
  feed.sort(function (a, b) {
    return String((b && b.date) || '').localeCompare(String((a && a.date) || ''));
  });

  /* ---------- 首页卡片 ----------
     前台真正读的是 site.home.entries（window.XY_CONFIG.home.entries），
     顶层 entries 只是老格式的备份。两份写得不一样时，过去是静默各写各的 ——
     结果就是「后台改了卡片、页面上没变」，或者点了卡片不跳。这里点出来。 */
  const entries = Array.isArray(root.entries) ? root.entries : [];
  if (root.entries && !Array.isArray(root.entries)) fail('entries', '要是数组');
  const homeEntries = (root.site && root.site.home && Array.isArray(root.site.home.entries))
    ? root.site.home.entries : null;
  if (homeEntries && JSON.stringify(homeEntries) !== JSON.stringify(entries)) {
    console.log('· 首页卡片有两份，写得不一样：');
    console.log('    顶层 entries                 ' + entries.length + ' 张  ← 产物里这份前台不用');
    console.log('    site.home.entries            ' + homeEntries.length + ' 张  ← 前台读这份，后台「首页内容」改的也是它');
    console.log('  要不要对齐自己决定，但记住：看页面效果永远以 site.home.entries 为准。');
  }
  /* 卡片链接写成 #/home 就是首页自己 —— 点了原地不动，看着像「打不开」。
     2026-11-27 真实踩过：「关于壹号栈」那张这么写，用户点了以为坏了。 */
  (homeEntries || entries).forEach(function (e) {
    if (!e || typeof e !== 'object') return;
    if (String(e.route || '') === '#/home') {
      console.log('· 首页卡片「' + (e.title || '(没名字)') + '」的链接写成了 #/home（就是首页自己），点了不会跳走。');
      console.log('    想去关于页就写 #/about，想去导航页写 #/nav。');
    }
  });

  /* ---------- 文章 ---------- */
  const posts = Array.isArray(root.posts) ? root.posts : [];
  if (root.posts && !Array.isArray(root.posts)) fail('posts', '要是数组（一篇文章一个对象）');
  const seen = new Set();
  posts.forEach(function (p, i) {
    const where = 'posts 第 ' + (i + 1) + ' 篇' + (p && p.title ? '「' + p.title + '」' : '');
    if (!p || typeof p !== 'object') { fail(where, '不是一个对象'); return; }
    if (!p.id) p.id = 'post-' + i;
    if (!p.title) fail(where, '缺少 title（文章标题）');
    checkDate(where, p.date);
    if (seen.has(p.id)) fail(where, 'id「' + p.id + '」跟别的文章重复了');
    seen.add(p.id);
    if (!Array.isArray(p.tags)) p.tags = p.tags ? [String(p.tags)] : [];
    p.body = String(p.body == null ? '' : p.body).replace(/\s+$/, '');
    if (!p.body) fail(where, '正文是空的');
    if (!p.excerpt) {
      /* 没写摘要就用正文第一段，别让列表页空着 */
      const first = p.body.split(/\n\s*\n/).filter(Boolean)[0] || '';
      p.excerpt = first.replace(/[#>*`\-\[\]]/g, '').trim().slice(0, 90);
    }
    if (!p.pin) delete p.pin;
  });
  /* 日期新的在前；同一天按 id 排，保证产物逐字节稳定 */
  posts.sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date)) || String(a.id).localeCompare(String(b.id));
  });

  if (problems.length) { report(); return; }
  if (warns.length && !quiet) {
    console.log('· 有 ' + warns.length + ' 条提醒（不影响发布）：');
    warns.slice(0, 8).forEach(function (w) { console.log('    · ' + w); });
    if (warns.length > 8) console.log('    · …还有 ' + (warns.length - 8) + ' 条');
  }

  const payload = { categories: nav, feed: feed, entries: entries, posts: posts };
  const js =
    '/* 壹号栈 · 站点数据（自动生成，别手改）\n' +
    '   来源：content/site.json —— 那是全站内容的唯一源文件。\n' +
    '   改内容：后台「发布上线 → ⬇ 导出 site.json」覆盖它，或者直接手改，然后跑\n' +
    '       node tools/build-content.js\n' +
    '   或者双击桌面「壹号栈 · 一键同步」，它会自己先跑这一步。\n' +
    '   这个文件是产物：手改会在下次构建时被覆盖。 */\n' +
    'window.XY_CONFIG = ' + JSON.stringify(site) + ';\n' +
    'window.SITE_DATA = ' + JSON.stringify(payload) + ';\n';

  if (checkOnly) {
    console.log('✓ content/site.json 没问题：' + nav.length + ' 分类 / ' + linkCount + ' 条链接 / ' +
      feed.length + ' 条分享 / ' + posts.length + ' 篇文章（--check，没写文件）');
    return;
  }

  const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (old === js) {
    if (!quiet) console.log('✓ 内容没变化，site-data.js 不用重写');
    return;
  }
  fs.writeFileSync(OUT, js);
  if (!quiet) {
    console.log('✓ site-data.js 已重写（' + (js.length / 1024).toFixed(0) + ' KB）');
    console.log('    ' + nav.length + ' 分类 / ' + linkCount + ' 条链接 / ' +
      feed.length + ' 条分享 / ' + posts.length + ' 篇文章 / ' + entries.length + ' 张首页卡片');
  }
}

function report() {
  console.error('\n✗ content/site.json 里有 ' + problems.length + ' 处写得不对：\n');
  problems.forEach(function (p) { console.error('  · ' + p); });
  console.error('\n改好了再跑一次。这次没有生成任何文件，线上还是上一版。\n');
  process.exit(1);
}

main();
