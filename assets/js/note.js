/* =========================================================
   壹号栈 YIHAOZHAN · 随手记（#/note）
   ---------------------------------------------------------
   为什么用 iframe 而不是照着 app.js 的套路重写：

   随手记本体是个完整的 Markdown 便签应用 —— 编辑器分屏、预览、标签
   筛选、回收站、多选批量、统计热力图、GitHub Gist 同步、语音输入……
   逻辑约 70 KB，还全是 `document.getElementById` 的写法。硬塞进 app.js
   要么污染全局（它有一堆 `toast` / `notes` / `el` 这种通用名），要么得
   整个重写成模块，风险远大于收益。

   所以：**本体留在 assets/note/index.html 自己一个文件**，这里只负责
   在 #/note 里挂一个铺满的 iframe，并把它的配色已经改成站点那套
   （assets/note/index.html 里的变量块就是站点变量，改配色去那里改）。

   好处：
   · 功能一个不少（含语音、同步这些重家伙），升级它不用碰站点代码；
   · 作用域天然隔离，不会和 app.js 抢全局变量；
   · 电脑 / 手机 / App 三端加载的是同一个文件，样子和手感天然一致。

   注意：iframe 里是独立文档，站点的深浅色**不会自动传进去**。
   下面 bind() 会把当前主题写进 iframe 的 <html data-theme="...">，
   站点切主题时也会跟着变（见 syncTheme）。
   ========================================================= */
window.XYNote = (function () {
  'use strict';

  var SRC = 'assets/note/index.html';
  var frame = null;
  var rootEl = null;
  var themeHandler = null;

  function q(s, r) { return (r || document).querySelector(s); }

  /* 站点当前是深还是浅。站点把主题写在 <html data-theme> 上 */
  function siteTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    return t === 'light' ? 'light' : 'dark';
  }

  function render() {
    return '<div class="note-page">' +
      '<iframe class="note-page__frame" src="' + SRC + '" title="随手记" ' +
      'allow="clipboard-read; clipboard-write" loading="eager"></iframe>' +
      '</div>';
  }

  /**
   * 撑满可视区。
   *
   * iframe 不像普通元素能靠内容撑高，必须给死高度。这里不写 magic number
   * （顶栏高度会随「紧凑/标准」和屏宽变），而是量一下容器顶端在视口里的位置，
   * 用「视口高 - 那段」算出来。
   *
   * 手机上的底栏是**浮在内容上面**的（position:fixed），不扣掉它，
   * iframe 最底下那排按钮就被压在底栏下面点不到了。
   */
  function fit() {
    if (!rootEl) return;
    var wrap = q('.note-page', rootEl);
    if (!wrap) return;
    var top = wrap.getBoundingClientRect().top;
    var dockH = 0;
    var dock = document.querySelector('.dock');
    if (dock) {
      var r = dock.getBoundingClientRect();
      var cs = window.getComputedStyle(dock);
      /* 只认「确实贴在视口底部」的那一份，桌面端它是 display:none */
      if (cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 0) {
        dockH = Math.max(0, Math.round(window.innerHeight - r.top));
      }
    }
    /* 底下留 6px，别让 iframe 的边缘贴着窗口边 */
    var h = window.innerHeight - Math.max(0, top) - dockH - 6;
    wrap.style.height = Math.max(320, h) + 'px';
  }

  /* 把站点的深浅色同步进 iframe（独立文档收不到外层 CSS） */
  function syncTheme() {
    try {
      var doc = frame && frame.contentDocument;
      if (!doc || !doc.documentElement) return;
      var want = siteTheme();
      if (doc.documentElement.getAttribute('data-theme') !== want) {
        doc.documentElement.setAttribute('data-theme', want);
        /* 它自己的主题按钮也切过 localStorage，顺手对齐一下，
           免得下次独立打开时是另一个配色 */
        try { localStorage.setItem('xingyu.note.theme.v1', want); } catch (e) {}
      }
    } catch (e) { /* 跨域或还没加载完，忽略 */ }
  }

  function bind(root) {
    rootEl = root || document;
    frame = q('.note-page__frame', rootEl);
    fit();
    if (frame) {
      frame.addEventListener('load', function () { syncTheme(); fit(); });
      setTimeout(syncTheme, 60);
    }
    /* 站点切主题 → 里面跟着切 */
    if (!themeHandler) {
      themeHandler = function () { syncTheme(); };
      document.addEventListener('xy:theme', themeHandler);
      /* 有的地方直接改 <html data-theme>，没有派事件，兜一层 */
      try {
        new MutationObserver(themeHandler).observe(document.documentElement, {
          attributes: true, attributeFilter: ['data-theme']
        });
      } catch (e) {}
    }
  }

  function leave() {
    /* DOM 会被整页换掉，引用跟着失效；监听器挂在 window 上不收会越积越多 */
    frame = null;
    rootEl = null;
  }

  return {
    render: render,
    bind: function (root) { bind(root); },
    leave: leave,
    routes: function () { return ['note']; },
    /* 窗口尺寸变了要重算高度（旋转屏幕 / 拖动窗口） */
    fit: fit
  };
})();
