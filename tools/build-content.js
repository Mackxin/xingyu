#!/usr/bin/env node
/* =========================================================================
   壹号栈 · 内容构建器
   -------------------------------------------------------------------------
   content/ 里的普通文件  →  assets/js/site-data.js（站点运行时读的那份）

   改内容只改 content/，然后跑这个：
       node tools/build-content.js            构建 + 校验
       node tools/build-content.js --check    只校验，不写文件
       node tools/build-content.js --quiet    只报错

   产出格式跟以前「后台导出的快照」一模一样，所以网页、App、后台一行都不用改。
   写错了（少个逗号、日期不成形）这里当场报文件名和行号，并且**不写盘**——
   线上不会因为一次手滑变成白页。
   ========================================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const CONTENT = path.join(REPO, 'content');
const OUT = path.join(REPO, 'assets/js/site-data.js');

const quiet = process.argv.includes('--quiet');
const checkOnly = process.argv.includes('--check');

const problems = [];   /* 阻断：不修好就不生成 */
const warns = [];      /* 提醒：老数据里本来就有，照搬不拦 */
function fail(where, msg) {
  problems.push(where + '：' + msg);
}
function warn(where, msg) {
  warns.push(where + '：' + msg);
}

/* ---------------------------------------------------------------- 读 JSON */

/* JSON.parse 的报错只给 position，换算成「第几行第几列」才找得到 */
function lineOf(text, pos) {
  const before = text.slice(0, pos);
  const line = before.split('\n').length;
  const col = pos - before.lastIndexOf('\n');
  return line + ' 行 ' + col + ' 列';
}

function readJSON(name, required) {
  const file = path.join(CONTENT, name);
  if (!fs.existsSync(file)) {
    if (required) fail(name, '文件不见了');
    return null;
  }
  const text = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(text);
  } catch (e) {
    const m = /position (\d+)/.exec(e.message);
    fail(name, m ? '第 ' + lineOf(text, Number(m[1])) + ' 附近写错了（' + e.message + '）'
                 : e.message);
    return null;
  }
}

/* ------------------------------------------------------------ 读 front-matter */

function parseFrontMatter(text, name) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) {
    fail(name, '开头要有 --- 包住的那几行（title / date / tags）');
    return null;
  }
  const meta = {};
  const lines = m[1].split(/\r?\n/);
  let listKey = null;
  lines.forEach(function (raw, i) {
    const line = raw.trim();
    if (!line || line.charAt(0) === '#') { listKey = null; return; }
    /* YAML 的列表写法：
         tags:
           - 工具
           - 前端
       这种也认，省得被逼着写 [工具, 前端] */
    if (listKey && /^-\s+/.test(line)) {
      meta[listKey].push(unquote(line.replace(/^-\s+/, '')));
      return;
    }
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) { fail(name, '第 ' + (i + 2) + ' 行看不懂：「' + line + '」'); return; }
    const key = kv[1];
    const val = kv[2].trim();
    if (!val) { listKey = key; meta[key] = []; return; }
    listKey = null;
    if (/^\[.*\]$/.test(val)) {
      meta[key] = val.slice(1, -1).split(',').map(function (s) { return unquote(s.trim()); })
        .filter(Boolean);
    } else if (val === 'true' || val === 'false') {
      meta[key] = val === 'true';
    } else {
      meta[key] = unquote(val);
    }
  });
  return { meta: meta, body: text.slice(m[0].length).replace(/^\s+/, '') };
}

function unquote(s) {
  if (/^".*"$/.test(s)) return s.slice(1, -1).replace(/\\"/g, '"');
  if (/^'.*'$/.test(s)) return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

/* ------------------------------------------------------------------ 校验 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkDate(where, d) {
  if (!d) { fail(where, '缺少 date（格式 2026-11-26）'); return false; }
  if (!DATE_RE.test(String(d))) { fail(where, 'date 要写成 2026-11-26 这样，现在是「' + d + '」'); return false; }
  return true;
}

function main() {
  /* ---------- 配置 ---------- */
  const site = readJSON('site.json', true) || {};

  /* ---------- 导航 ---------- */
  const nav = readJSON('nav.json', true) || [];
  if (!Array.isArray(nav)) fail('nav.json', '最外层要是一个数组 [ … ]');
  const catIds = new Set();
  let linkCount = 0;
  nav.forEach(function (c, i) {
    const where = 'nav.json 第 ' + (i + 1) + ' 个分类';
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
  const feed = readJSON('feed.json', true) || [];
  if (!Array.isArray(feed)) fail('feed.json', '最外层要是一个数组 [ … ]');
  const feedKeys = new Set();
  feed.forEach(function (f, i) {
    const where = 'feed.json 第 ' + (i + 1) + ' 条';
    if (!f || typeof f !== 'object') { fail(where, '不是一个对象'); return; }
    if (!f.title) fail(where, '缺少 title');
    else if (!f.url) warn(where, '「' + f.title + '」没有 url（纯文字分享，能显示但点不动）');
    checkDate(where, f.date);
    const k = String(f.date || '') + '|' + String(f.title || '');
    if (feedKeys.has(k)) {
      /* 不算错：同一天写了两条同名分享是允许的。只是「今日精选」按
         「日期|标题」认条，会分不清是哪一条 —— 提醒一句就好 */
      warn(where, '跟前面某条同日期同标题，首页「今日精选」会分不清是哪条');
    }
    feedKeys.add(k);
    if (f.tags && !Array.isArray(f.tags)) fail(where, 'tags 要写成 ["工具", "前端"]');
  });
  /* 日期新的排前面，同一天保持你写的顺序 */
  feed.sort(function (a, b) {
    return String((b && b.date) || '').localeCompare(String((a && a.date) || ''));
  });

  /* ---------- 首页卡片 ---------- */
  const entries = readJSON('entries.json', false) || [];
  if (entries.length && !Array.isArray(entries)) fail('entries.json', '最外层要是数组');

  /* ---------- 文章 ---------- */
  const posts = [];
  const postDir = path.join(CONTENT, 'posts');
  if (fs.existsSync(postDir)) {
    const files = fs.readdirSync(postDir).filter(function (f) {
      return /\.md$/i.test(f) && f.charAt(0) !== '.';
    }).sort();                        /* 名字排序保证每次构建顺序一致 */
    const seen = new Set();
    files.forEach(function (f) {
      const name = 'posts/' + f;
      const parsed = parseFrontMatter(fs.readFileSync(path.join(postDir, f), 'utf8'), name);
      if (!parsed) return;
      const meta = parsed.meta;
      const p = {
        id: meta.id || f.replace(/\.md$/i, ''),
        title: meta.title || '',
        date: meta.date || '',
        tags: Array.isArray(meta.tags) ? meta.tags : [],
        pin: !!meta.pin,
        excerpt: meta.excerpt || '',
        body: parsed.body.replace(/\s+$/, '')
      };
      if (!p.title) fail(name, '缺少 title（文章标题）');
      checkDate(name, p.date);
      if (seen.has(p.id)) fail(name, 'id「' + p.id + '」跟别的文章重复了');
      seen.add(p.id);
      if (!p.body) fail(name, '正文是空的');
      if (!p.excerpt) {
        /* 没写摘要就用正文第一段，别让列表页空着 */
        const first = p.body.split(/\n\s*\n/).filter(Boolean)[0] || '';
        p.excerpt = first.replace(/[#>*`\-\[\]]/g, '').trim().slice(0, 90);
      }
      if (!p.pin) delete p.pin;
      posts.push(p);
    });
    /* 日期新的在前；同一天按 id 排，保证产物稳定 */
    posts.sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date)) || a.id.localeCompare(b.id);
    });
  }

  /* 校验没过就停，一个字都不写 */
  if (problems.length) {
    console.error('\n✗ content/ 里有 ' + problems.length + ' 处写得不对：\n');
    problems.forEach(function (p) { console.error('  · ' + p); });
    console.error('\n改好了再跑一次。这次没有生成任何文件，线上还是上一版。\n');
    process.exit(1);
  }
  if (warns.length && !quiet) {
    console.log('· 有 ' + warns.length + ' 条提醒（不影响发布）：');
    warns.slice(0, 8).forEach(function (w) { console.log('    · ' + w); });
    if (warns.length > 8) console.log('    · …还有 ' + (warns.length - 8) + ' 条');
  }

  const payload = { categories: nav, feed: feed, entries: entries, posts: posts };
  const js =
    '/* 壹号栈 · 站点数据（自动生成，别手改）\n' +
    '   来源：仓库里的 content/ 目录。改内容去改那边的文件，然后跑：\n' +
    '       node tools/build-content.js\n' +
    '   或者双击桌面「壹号栈 · 一键同步」，它会自己先跑这一步。\n' +
    '   这个文件是产物：手改会在下次构建时被覆盖。 */\n' +
    'window.XY_CONFIG = ' + JSON.stringify(site) + ';\n' +
    'window.SITE_DATA = ' + JSON.stringify(payload) + ';\n';

  if (checkOnly) {
    console.log('✓ content/ 没问题：' + nav.length + ' 分类 / ' + linkCount + ' 条链接 / ' +
      feed.length + ' 条分享 / ' + posts.length + ' 篇文章（--check，没写文件）');
    return;
  }

  const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (old === js) {
    if (!quiet) console.log('✓ content/ 没变化，site-data.js 不用重写');
    return;
  }
  fs.writeFileSync(OUT, js);
  if (!quiet) {
    console.log('✓ site-data.js 已重写（' + (js.length / 1024).toFixed(0) + ' KB）');
    console.log('    ' + nav.length + ' 分类 / ' + linkCount + ' 条链接 / ' +
      feed.length + ' 条分享 / ' + posts.length + ' 篇文章 / ' + entries.length + ' 张首页卡片');
  }
}

main();
