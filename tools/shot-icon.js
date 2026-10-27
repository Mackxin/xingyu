#!/usr/bin/env node
/* 把 tools/icon.html 截成 assets/icon-512.png / icon-192.png / icon-180.png。
   用法：先起本地服务（python3 -m http.server 8321），然后
     NODE_PATH=/tmp/xy2/node_modules node tools/shot-icon.js */
'use strict';
const puppeteer = require('puppeteer-core');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.ICON_BASE || 'http://127.0.0.1:8321';
const SIZES = [512, 192, 180];

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  for (const s of SIZES) {
    const p = await b.newPage();
    await p.setViewport({ width: s, height: s, deviceScaleFactor: 1 });
    await p.goto(BASE + '/tools/icon.html', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 300));
    await p.screenshot({ path: __dirname + '/../assets/icon-' + s + '.png' });
    console.log('OK → assets/icon-' + s + '.png');
    await p.close();
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
