#!/usr/bin/env node
/**
 * 把安卓 App 的 release 包装进站点，供 App 内自更新拉取。
 *
 * 为什么走站点同域，不用 GitHub Release 的直链：
 *   Release 的二进制落在 objects.githubusercontent.com，国内经常连不上；
 *   而 api/app.json 本来就是同一个域（mackxin.github.io），能拉到内容就一定拉得到安装包。
 *
 * 用法（在星屿站点仓库根目录）：
 *   node tools/publish-app.js                    # 打包 + 复制 + 写版本号
 *   node tools/publish-app.js --apk <路径>        # 用现成的 apk，不重新打包
 *   node tools/publish-app.js --notes "..."      # 更新说明
 *
 * 之后照常 git push，GitHub Pages 生效后 App 就能检查到新版。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP_REPO = '/Volumes/1T宝盘/workbuddy/yihaozhan-app';
const OUT_APK = path.join(ROOT, 'api', 'app.apk');
const OUT_JSON = path.join(ROOT, 'api', 'app-version.json');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/* 版本号唯一的真相在 App 仓库的 build.gradle.kts 里，别在这儿再维护一份 */
function readGradle() {
  const f = path.join(APP_REPO, 'app', 'build.gradle.kts');
  const src = fs.readFileSync(f, 'utf8');
  const code = /versionCode\s*=\s*(\d+)/.exec(src);
  const name = /versionName\s*=\s*"([^"]+)"/.exec(src);
  if (!code || !name) throw new Error('读不到 versionCode / versionName：' + f);
  return { versionCode: Number(code[1]), versionName: name[1] };
}

function build() {
  console.log('→ 正在构建 release 包…');
  execFileSync(
    './gradlew',
    [':app:assembleRelease', '--offline', '-q'],
    {
      cwd: APP_REPO,
      stdio: 'inherit',
      env: { ...process.env, JAVA_HOME: '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home' }
    }
  );
  return path.join(APP_REPO, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
}

function main() {
  const { versionCode, versionName } = readGradle();
  const apk = arg('apk', null) || build();

  if (!fs.existsSync(apk)) throw new Error('找不到 apk：' + apk);
  fs.mkdirSync(path.dirname(OUT_APK), { recursive: true });
  fs.copyFileSync(apk, OUT_APK);

  const size = fs.statSync(OUT_APK).size;
  const notes = arg('notes', '');

  /* 字段说明：App 侧只认 versionCode（比大小最可靠）；url/size 给下载进度用 */
  const info = {
    versionCode,
    versionName,
    size,
    notes,
    updated: new Date().toISOString().slice(0, 10)
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(info, null, 2) + '\n');

  console.log('');
  console.log('✔ api/app.apk          ' + (size / 1048576).toFixed(2) + ' MB');
  console.log('✔ api/app-version.json v' + versionName + '（versionCode ' + versionCode + '）');
  if (!notes) console.log('  ⚠️ 没写更新说明（--notes "..."），App 里会是空的');
  console.log('');
  console.log('下一步：git add api/app.apk api/app-version.json && git commit && git push');
}

main();
