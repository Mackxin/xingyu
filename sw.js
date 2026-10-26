/* =========================================================================
   星屿 · Service Worker
   -------------------------------------------------------------------------
   目标：装到手机主屏后像 App 一样打开，断网也能看已经访问过的内容。

   策略：
     · 页面导航请求 → 先走网络（拿到最新版本），断网才用缓存
     · site-data.js（站点数据快照）→ 永远先走网络，换数据立刻生效
     · 静态资源（css / js / 图片）→ 先用缓存（快），后台顺手更新
     · 每次改版本号 VERSION，旧缓存会在 activate 时被清掉

   ⚠️ 发布新版本时，把 VERSION 和 index.html 里的 ?v= 一起改。
   ========================================================================= */
var VERSION = 'v127';
var CACHE = 'xingyu-' + VERSION;

/* 断网兜底：至少这几个文件必须是可用的 */
var CORE = [
  './',
  './index.html',
  './assets/js/site-data.js',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      // 逐个 add，某个文件 404 不至于让整个安装失败
      .then(function (c) {
        return Promise.all(CORE.map(function (u) {
          return c.add(u).catch(function () {});
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf('xingyu-') === 0 && k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  // 只管自己站内的资源；GitHub API 之类的外部请求一律放行
  if (url.origin !== self.location.origin) return;

  // 页面：网络优先，断网回落到缓存的 index.html
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (hit) {
          return hit || caches.match('./') || new Response(
            '<h1>星屿暂时离线</h1><p>请连上网络后再试。</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        });
      })
    );
    return;
  }

  // 站点数据快照：永远先问网络（后台刚导出的数据要立刻生效），断网才用缓存。
  // 它不带 ?v= 版本号，光靠「缓存优先」会被旧文件卡住，所以单独走这一条。
  if (url.pathname.indexOf('site-data.js') > -1) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || new Response('window.XY_SNAPSHOT_OFFLINE = 1;',
            { headers: { 'Content-Type': 'application/javascript; charset=utf-8' } });
        });
      })
    );
    return;
  }

  // 静态资源：先给缓存，再后台更新
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
