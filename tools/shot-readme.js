#!/usr/bin/env node
/**
 * 重拍 README「界面预览」里的网页截图（电脑端 + 手机端）。
 *
 * 用法：
 *   python3 -m http.server 8321 &            # 先起本地服务
 *   NODE_PATH=/tmp/xy2/node_modules node tools/shot-readme.js
 *
 * 想只截某一张：node tools/shot-readme.js 01-home 06-mobile
 *
 * 为什么写死深色：站点默认主题是 dark（config.js 的 themeDefault），
 * README 上的观感要和「打开就是这样」一致；浅色版留给后台那几张。
 */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:8321';
const OUT = path.resolve(__dirname, '../docs/screenshots');

/* 电脑端：1440×900，DPR 2 —— 2 倍图在 Retina 屏和 GitHub 上都清楚，再大就白占体积 */
const DESKTOP = { width: 1440, height: 900, dpr: 2 };
/* 手机端：iPhone 14 的逻辑尺寸。DPR 3 出图 1170×2532，GitHub 里显示 260px 宽足够细 */
const MOBILE = { width: 390, height: 844, dpr: 3 };

/* name: [视口, 路由, 额外等待毫秒, 往下滚多少像素(可选)] */
const SHOTS = {
  '01-home': [DESKTOP, '#/', 1200],
  '02-nav': [DESKTOP, '#/nav', 1200],
  '03-share': [DESKTOP, '#/share', 1000],
  '04-post': [DESKTOP, '#/post/hello-xingyu', 1400],
  /* 05 要先进后台（口令 xingyu），单独走下面那段流程 */
  '05-admin-theme': [DESKTOP, '#/admin', 0],
  '06-mobile': [MOBILE, '#/', 1200],
  '13-mobile-nav': [MOBILE, '#/nav', 1200],
  '14-mobile-post': [MOBILE, '#/post/hello-xingyu', 1400],
  /* 09 是「全部摊开也不卡」的佐证：往下滚一屏，拍到连续几个分类 + 标签云 */
  '09-nav-fold': [DESKTOP, '#/nav', 1200, 880]
};

const only = process.argv.slice(2);

(async () => {
  const b = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--force-color-profile=srgb', '--font-render-hinting=none']
  });

  for (const name of Object.keys(SHOTS)) {
    if (only.length && !only.includes(name)) continue;
    const [vp, route, wait, scrollY] = SHOTS[name];
    const p = await b.newPage();
    await p.setViewport({
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.dpr,
      isMobile: vp === MOBILE,
      hasTouch: vp === MOBILE
    });
    /* 站点默认深色，但显式声明一次，免得哪天默认值改了截图跟着变浅 */
    await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await p.goto(BASE + '/' + route, { waitUntil: 'networkidle0' });

    if (name === '05-admin-theme') {
      /* 后台要先过口令闸（默认 xingyu），再切到「主题」那一页 */
      await p.waitForSelector('#adminPass', { timeout: 8000 });
      await p.type('#adminPass', 'xingyu');
      await p.click('#adminLogin button[type="submit"]');
      await p.waitForSelector('.admin-tab[data-tab="look"]', { timeout: 8000 });
      await p.click('.admin-tab[data-tab="look"]');
      await new Promise(r => setTimeout(r, 1000));
    }

    /* 主题变量、字体、极光背景都要一帧才稳定；首页还有个数字滚动 */
    if (wait) await new Promise(r => setTimeout(r, wait));
    if (scrollY) {
      await p.evaluate(y => window.scrollTo(0, y), scrollY);
      await new Promise(r => setTimeout(r, 800));
    }
    const file = path.join(OUT, name + '.jpg');
    await p.screenshot({ path: file, type: 'jpeg', quality: 82 });
    const st = require('fs').statSync(file);
    console.log(`✔ ${name}.jpg  ${vp.width}×${vp.height}@${vp.dpr}x  ${(st.size / 1024).toFixed(0)} KB`);
    await p.close();
  }

  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
