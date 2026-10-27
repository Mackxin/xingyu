#!/usr/bin/env node
/* =========================================================================
   壹号栈 · 生成 RSS 订阅源
   -------------------------------------------------------------------------
   用法：
     node tools/gen-feed.js                       # 用默认线上地址
     node tools/gen-feed.js https://xingyu.xyz/   # 指定站点地址

   做的事情：读 assets/js/data.js 里的 feed（分享条目），按日期倒序取最新 20 条，
   生成根目录的 feed.xml。纯静态站点没有后端，所以订阅源需要「改完内容后重新生成」。

   ⚠️ 新增/修改分享后记得再跑一次，否则订阅里看不到新内容。
   ========================================================================= */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var BASE = (process.argv[2] || 'https://mackxin.github.io/xingyu/').replace(/\/?$/, '/');
var LIMIT = 20;

/* ---------- 读数据：把两个前端文件丢进沙箱跑一遍 ---------- */
function loadData() {
  var sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  /* feed-import.js 要在 data.js 之前：data.js 会读 window.XY_FEED_IMPORT 拼进 feed */
  ['assets/js/feed-import.js', 'assets/js/data.js', 'assets/js/config.js'].forEach(function (rel) {
    var abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;      // 没导入过就没有这个文件，跳过
    var code = fs.readFileSync(abs, 'utf8');
    vm.runInContext(code, sandbox, { filename: rel });
  });
  var w = sandbox.window;
  return {
    data: w.SITE_DATA || { feed: [] },
    cfg: (w.XYStore && w.XYStore.DEFAULTS) || {}
  };
}

/* ---------- 小工具 ---------- */
function xml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function abs(u) {
  u = String(u || '').trim();
  if (!u) return BASE;
  if (/^https?:/i.test(u)) return u;
  if (u.charAt(0) === '#') return BASE + u;
  return BASE + u.replace(/^\.?\//, '');
}
function rfc822(dateStr) {
  var p = String(dateStr || '').split('-');
  if (p.length !== 3) return '';
  var d = new Date(+p[0], +p[1] - 1, +p[2], 9, 0, 0);
  if (isNaN(d.getTime())) return '';
  return d.toUTCString();
}

/* ---------- 生成 ---------- */
var loaded = loadData();
var feed = (loaded.data.feed || []).slice();
var posts = (loaded.data.posts || []).slice();

feed = feed.filter(function (f) { return f && f.title && rfc822(f.date); });
feed.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
feed = feed.slice(0, LIMIT);

/* 文章也算「更新」：带摘要的放进来，正文里没摘就截一段纯文本 */
function mdPlain(s) {
  return String(s || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
posts = posts.filter(function (p) { return p && p.title && !p.draft && rfc822(p.date); })
  .map(function (p) {
    var desc = p.excerpt || mdPlain(p.body);
    if (desc.length > 160) desc = desc.slice(0, 160) + '…';
    return {
      date: p.date,
      title: p.title,
      url: '#/post/' + encodeURIComponent(p.id),
      desc: desc,
      tags: p.tags || [],
      isPost: true
    };
  });

var merged = feed.map(function (f) {
  return { date: f.date, title: f.title, url: f.url, desc: f.desc || '', tags: f.tags || [], isPost: false };
}).concat(posts);
merged.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
merged = merged.slice(0, LIMIT);

var siteName = loaded.cfg.siteName || '壹号栈';
var latin = loaded.cfg.siteLatin || 'YIHAOZHAN';
var tagline = loaded.cfg.tagline || '以星为图，以屿为家';

var items = merged.map(function (f) {
  var tags = (f.tags || []).map(function (t) { return '    <category>' + xml(t) + '</category>'; }).join('\n');
  var link = abs(f.url);
  return [
    '  <item>',
    '    <title>' + xml((f.isPost ? '📝 ' : '') + f.title) + '</title>',
    '    <link>' + xml(link) + '</link>',
    '    <guid isPermaLink="true">' + xml(link) + '</guid>',
    '    <pubDate>' + rfc822(f.date) + '</pubDate>',
    '    <description>' + xml(f.desc || '') + '</description>',
    tags,
    '  </item>'
  ].filter(Boolean).join('\n');
}).join('\n');

var now = new Date().toUTCString();
var out = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
  '  <channel>',
  '    <title>' + xml(siteName + ' · 灵感与文章') + '</title>',
  '    <link>' + xml(BASE) + '</link>',
  '    <description>' + xml(tagline + ' —— 每天一小条，记录遇见的工具、灵感与小发现，也写点长一点的文章。') + '</description>',
  '    <language>zh-cn</language>',
  '    <lastBuildDate>' + now + '</lastBuildDate>',
  '    <generator>' + xml(latin + ' gen-feed') + '</generator>',
  '    <atom:link href="' + xml(BASE + 'feed.xml') + '" rel="self" type="application/rss+xml" />',
  items,
  '  </channel>',
  '</rss>',
  ''
].filter(Boolean).join('\n');

var dest = path.join(ROOT, 'feed.xml');
fs.writeFileSync(dest, out, 'utf8');

console.log('✓ feed.xml 已生成');
console.log('  站点：' + BASE);
console.log("  条目：" + merged.length + ' 条（按日期倒序，最多 ' + LIMIT + ' 条）');
console.log('  体积：' + (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1) + ' KB');
if (merged.length) console.log("  最新：" + merged[0].date + " · " + merged[0].title);
