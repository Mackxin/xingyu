#!/usr/bin/env node
/* 把 tools/og-cover.html 截成 assets/og-cover.png（1200×630）。
   用法：先起本地服务（python3 -m http.server 8321），然后
     NODE_PATH=/tmp/xy2/node_modules node tools/shot-og.js */
'use strict';
const puppeteer = require('puppeteer-core');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.OG_BASE || 'http://127.0.0.1:8321';

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await p.goto(BASE + '/tools/og-cover.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 400)); // 等字体/渐变稳定
  await p.screenshot({ path: __dirname + '/../assets/og-cover.png' });
  await b.close();
  console.log('OK → assets/og-cover.png (1200×630)');
})().catch(e => { console.error(e); process.exit(1); });
