/* =========================================================================
   壹号栈 · Service Worker
   -------------------------------------------------------------------------
   目标：装到手机主屏后像 App 一样打开，断网也能看已经访问过的内容。

   策略：
     · 页面导航请求 → 先走网络（拿到最新版本），断网才用缓存
     · site-data.js（站点数据快照）→ 永远先走网络，换数据立刻生效
     · 静态资源（css / js / 图片）→ 先用缓存（快），后台顺手更新
     · 每次改版本号 VERSION，旧缓存会在 activate 时被清掉

   ⚠️ 发布新版本时，把 VERSION 和 index.html 里的 ?v= 一起改。
   ========================================================================= */
var VERSION = 'v169';
/* 缓存前缀跟着站名走（v134 起叫壹号栈）。CACHE_PREFIXES 里留着旧的 xingyu-，
   activate 时一起清 —— 不然改过名的老用户机器上会一直搁着几份旧站名的缓存。 */
var CACHE_PREFIX = 'yihaozhan-';
var CACHE = CACHE_PREFIX + VERSION;
var CACHE_PREFIXES = [CACHE_PREFIX, 'xingyu-'];

/* 断网兜底：至少这几个文件必须是可用的 */
var CORE = [
  './',
  './index.html',
  './assets/js/site-data.js',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

/* 站点根：虚拟主机在域名根（'/'），GitHub Pages 在子目录（'/xingyu/'）。
   两种部署位置都得认，写死成 '/' 会让 Pages 那边的注册失效。 */
var BASE = new URL('./', self.location.href).pathname;

/* 只管自己的路径。
   域名根下面还躺着别的站（daohang.html、qiantai.html、dianchipaodan.html、img/、baoju/ …），
   SW 的 scope 一旦是 '/' 就会把它们的请求也一起接走：静态资源走的是「缓存优先」，
   那些站的 JS/CSS 改了就永远看到旧版；断网时页面导航还会被兜底成星屿的首页。
   所以这里按白名单放行 —— 不认识的一律不拦截。 */
var OWN_DIRS = ['assets/', 'api/', 'data/'];

function own(path) {
  if (path === BASE || path === BASE + 'index.html') return true;
  if (path === BASE + 'feed.xml' || path === BASE + 'manifest.webmanifest') return true;
  for (var i = 0; i < OWN_DIRS.length; i++) {
    if (path.indexOf(BASE + OWN_DIRS[i]) === 0) return true;
  }
  return false;
}

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
        var old = CACHE_PREFIXES.some(function (pre) { return k.indexOf(pre) === 0; });
        if (old && k !== CACHE) return caches.delete(k);
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

  // 同域、但不是这个站的路径（daohang.html、img/ …）→ 完全不接管，原样交给网络
  if (!own(url.pathname)) return;

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
            '<h1>壹号栈暂时离线</h1><p>请连上网络后再试。</p>',
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
