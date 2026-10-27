/* =========================================================================
   壹号栈 · 后台管理面板（路由 #/admin）
   纯前端实现：改动实时生效并写入 localStorage。
   想对所有访客永久生效 → 「备份」页导出 JSON/JS，粘回 index.html 或 data.js。
   ========================================================================= */
(function () {
  'use strict';

  var Store = window.XYStore;
  var MD = window.XYMarkdown || null;
  var MAX = Store.MAX_LINKS;
  var TABS = [
    { id: 'sites',    label: '站点数据', icon: '🗂', badge: 'adminTabSitesN' },
    { id: 'feed',     label: '分享',     icon: '📰', badge: 'adminTabFeedN' },
    { id: 'posts',    label: '文章',     icon: '✍️', badge: 'adminTabPostsN' },
    { id: 'home',     label: '首页内容', icon: '🏠' },
    { id: 'look',     label: '主题',     icon: '🎨' },
    { id: 'links',    label: '自定义链接', icon: '🔗', badge: 'adminTabLinksN' },
    { id: 'site',     label: '站点信息', icon: '🌌' },
    { id: 'backup',   label: '备份',     icon: '💾' },
    { id: 'security', label: '口令',     icon: '🔐' },
    { id: 'guide',    label: '手册 / 参数', icon: '📖' }
  ];

  var tab = 'sites';
  var openCats = {};        // 展开的分类（按 id 记）
  var firstRun = true;
  var siteQuery = '';       // 站点数据搜索词
  var postQuery = '';       // 文章搜索词
  var editing = null;       // 正在编辑的文章：{ id, isNew }
  var savedId = '';         // 刚保存完的文章，列表里高亮一下
  var feedQuery = '';       // 分享搜索词
  var feedEditing = null;   // 正在编辑的分享：{ idx, isNew }
  var armed = null;         // 两步删除的“已待确认”状态
  var presetRenaming = '';  // 正在改名的配色预设 id（空 = 没在改名）

  /* ---------- 小工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }
  function debounce(fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }
  function app() { return window.XY_APP || {}; }
  function toast(m) { if (app().toast) app().toast(m); }
  function applyChrome() { if (app().applyChrome) app().applyChrome(); }

  function armKey(kind, ci, li) { return kind + ':' + ci + ':' + li; }
  function armedNow(kind, ci, li) {
    return !!(armed && armed.k === armKey(kind, ci, li) && (Date.now() - armed.t) < 4000);
  }
  function arm(kind, ci, li) { armed = { k: armKey(kind, ci, li), t: Date.now() }; }

  /* ---------- 数据读写 ---------- */
  function cats() { return Store.dataAll(); }
  function mutate(fn) {
    var list = cats();
    fn(list);
    Store.setData(list);   // 触发 xy:data → 前台重建索引
    return list;
  }
  function counts(list) {
    list = list || cats();
    var n = 0;
    list.forEach(function (c) { n += (c.links || []).length; });
    return { cats: list.length, links: n };
  }
  function newCatId() {
    return 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }

  /* ======================= 渲染 ======================= */
  function render() {
    if (!Store.isUnlocked()) return lockHtml();
    if (firstRun) {
      firstRun = false;
      var list = cats();
      if (list.length) openCats[list[0].id] = true;
    }
    return '<div class="page page--admin">' +
      '<div class="admin-shell">' +
        sideHtml() +
        '<div class="admin-main">' +
          '<div class="page-head">' +
            '<span class="eyebrow">Admin · 后台</span>' +
            '<h1>后台管理</h1>' +
            '<p>这里的改动<b>实时生效</b>，保存在本机浏览器。想让所有访客都看到，请到「备份」页导出。</p>' +
          '</div>' +
          '<div class="admin-body" id="adminBody">' + panelHtml() + '</div>' +
        '</div>' +
      '</div>' +
      '</div>';
  }

  /* 左侧导航栏 */
  function sideHtml() {
    return '<aside class="admin-side">' +
      '<div class="admin-side__title"><b>管理台</b><em>Admin</em></div>' +
      '<nav class="admin-nav" role="tablist">' +
        TABS.map(function (t) {
          var badge = t.badge
            ? '<span class="admin-tab__n" id="' + t.badge + '">' + badgeText(t.badge) + '</span>'
            : '';
          return '<button class="admin-tab' + (t.id === tab ? ' is-active' : '') + '" type="button" role="tab"' +
            ' data-tab="' + t.id + '" title="' + esc(t.label) + '">' +
            '<span class="admin-tab__ico" aria-hidden="true">' + t.icon + '</span>' +
            '<span class="admin-tab__label">' + esc(t.label) + '</span>' + badge +
            '</button>';
        }).join('') +
      '</nav>' +
      '<div class="admin-side__foot">' +
        '<button class="admin-lockbtn" type="button" id="adminLock">退出登录</button>' +
      '</div>' +
      '</aside>';
  }

  function badgeText(id) {
    if (id === 'adminTabSitesN') return String(counts().links);
    if (id === 'adminTabLinksN') return Store.allLinks().length + '/' + MAX;
    if (id === 'adminTabPostsN') return String(Store.postsAll().length);
    if (id === 'adminTabFeedN') return String(Store.feedAll().length);
    return '';
  }
  /* 保持侧栏角标与数据同步 */
  function syncSide(root) {
    var a = root.querySelector('#adminTabSitesN');
    if (a) {
      var d = counts();
      a.textContent = d.links;
      a.title = d.cats + ' 个分类 · ' + d.links + ' 个站点';
    }
    var b = root.querySelector('#adminTabLinksN');
    if (b) b.textContent = Store.allLinks().length + '/' + MAX;
    var c = root.querySelector('#adminTabPostsN');
    if (c) c.textContent = Store.postsAll().length;
    var f = root.querySelector('#adminTabFeedN');
    if (f) f.textContent = Store.feedAll().length;
  }

  function lockHtml() {
    return '<div class="page page--admin">' +
      '<div class="admin-lock">' +
        '<span class="admin-lock__icon">🔒</span>' +
        '<h1>后台管理</h1>' +
        '<p>请输入访问口令。默认口令是 <code>xingyu</code>，进入后可在「口令」里修改。</p>' +
        '<form class="admin-lock__form" id="adminLogin" autocomplete="off">' +
          '<input type="password" id="adminPass" placeholder="访问口令" aria-label="访问口令" />' +
          '<button class="btn btn--primary" type="submit">进入后台</button>' +
        '</form>' +
        '<p class="admin-lock__err" id="adminErr" hidden></p>' +
        '<a class="admin-lock__back" href="#/home">← 返回首页</a>' +
      '</div>' +
      '</div>';
  }

  function panelHtml() {
    if (tab === 'home') return homePanel();
    if (tab === 'look') return lookPanel();
    if (tab === 'feed') return feedPanel();
    if (tab === 'posts') return postsPanel();
    if (tab === 'links') return linksPanel();
    if (tab === 'site') return sitePanel();
    if (tab === 'backup') return backupPanel();
    if (tab === 'security') return securityPanel();
    if (tab === 'guide') return guidePanel();
    return sitesPanel();
  }

  /* ======================= 站点数据 ======================= */
  function sitesPanel() {
    var d = counts();
    return '<div class="admin-card">' +
        '<div class="admin-card__head">' +
          '<div><h2>站点数据</h2><p>「导航」页的全部分类与站点，也是全站搜索的数据源。改完立刻生效。</p></div>' +
          '<span class="admin-count" id="adminSiteCount">' + d.cats + ' 个分类 · ' + d.links + ' 个站点</span>' +
        '</div>' +
        '<div class="admin-toolbar">' +
          '<div class="admin-search">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>' +
            '<input type="search" id="adminSiteSearch" placeholder="搜索站点名 / 网址 / 描述 / 分类…" value="' + esc(siteQuery) + '" autocomplete="off" aria-label="搜索站点数据" />' +
          '</div>' +
          '<button class="btn btn--primary" type="button" id="adminAddCat">＋ 新增分类</button>' +
          '<button class="btn btn--ghost" type="button" id="adminImportBm">📥 导入书签</button>' +
          '<button class="btn btn--ghost" type="button" id="adminExpandAll">展开全部</button>' +
          '<button class="btn btn--ghost" type="button" id="adminCollapseAll">收起全部</button>' +
          '<button class="btn btn--danger" type="button" id="adminResetData"' + (Store.dataIsCustom() ? '' : ' disabled') + '>恢复默认数据</button>' +
        '</div>' +
        '<input type="file" id="bmFile" accept=".html,.htm,text/html" hidden />' +
        '<p class="admin-tip">数据来自 <code>assets/js/data.js</code>；在这里改动会覆盖它（只影响本机）。点「恢复默认数据」即可还原。展开分类后会<b>独占一整行</b>，站点很多时列表内部滚动，不会把页面撑长。</p>' +
      '</div>' +
      '<div class="admin-cats" id="adminCats" data-drag-box="cat" data-drag-grid="1">' + catsListHtml() + '</div>';
  }

  /* 拖拽把手（六点握把）。放在每行最左侧，按住即可拖动排序 */
  var GRIP = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
    '<circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/>' +
    '<circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/>' +
    '<circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';

  function grip() {
    return '<button class="drag-handle" type="button" data-drag ' +
      'title="按住不放拖动排序（键盘：聚焦本把手后按 ↑ / ↓）" aria-label="拖动排序">' + GRIP + '</button>';
  }

  function catsListHtml() {
    var list = cats();
    var q = norm(siteQuery);
    var html = '';
    var shown = 0;

    list.forEach(function (c, ci) {
      var links = c.links || [];
      var pairs = links.map(function (l, li) { return { l: l, li: li }; });
      var catHit = !q || norm(c.name + c.desc + c.icon).indexOf(q) > -1;
      if (q && !catHit) {
        pairs = pairs.filter(function (p) { return norm(p.l.n + p.l.u + p.l.d).indexOf(q) > -1; });
        if (!pairs.length) return;
      }
      shown++;
      html += catCardHtml(c, ci, pairs, catHit, links.length);
    });

    if (!shown) {
      html = '<p class="admin-empty">' +
        (q ? '没有匹配的分类或站点。' : '还没有任何分类，点上面「新增分类」开始。') + '</p>';
    }
    return html;
  }

  function catCardHtml(c, ci, pairs, catHit, total) {
    var open = !!siteQuery || !!openCats[c.id];
    var body = '';
    if (open) {
      body = pairs.map(function (p) { return aLinkHtml(p.l, p.li); }).join('') +
        '<button class="alink__add" type="button" data-cat-op="addlink" data-ci="' + ci + '">＋ 添加站点</button>';
    }
    return '<section class="acat' + (open ? ' is-open' : '') + '" data-ci="' + ci + '" data-cid="' + esc(c.id) + '"' +
        ' data-drag-item="' + ci + '">' +
        '<header class="acat__head">' +
          grip() +
          '<button class="acat__toggle" type="button" data-cat-op="toggle" data-ci="' + ci + '" aria-label="展开或收起">' +
            '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>' +
          '</button>' +
          '<input class="acat__icon" data-cat-f="icon" value="' + esc(c.icon) + '" maxlength="4" aria-label="分类图标" />' +
          '<input class="acat__name" data-cat-f="name" value="' + esc(c.name) + '" aria-label="分类名称" />' +
          '<input class="acat__desc" data-cat-f="desc" value="' + esc(c.desc) + '" placeholder="分类描述" aria-label="分类描述" />' +
          '<span class="acat__count" title="分类下的站点数">' + (siteQuery && !catHit ? pairs.length + ' / ' + total : total) + '</span>' +
          '<span class="admin-link__ops">' +
            '<button type="button" data-cat-op="del" data-ci="' + ci + '" class="is-danger' + (armedNow('cat', ci, -1) ? ' is-armed' : '') + '" title="删除">' +
              (armedNow('cat', ci, -1) ? '确认' : '✕') + '</button>' +
          '</span>' +
        '</header>' +
        (open ? '<div class="acat__body" data-drag-box="link">' + body + '</div>' : '') +
      '</section>';
  }

  function aLinkHtml(l, li) {
    return '<div class="alink" data-li="' + li + '" data-drag-item="' + li + '">' +
        grip() +
        '<span class="alink__idx">' + (li + 1) + '</span>' +
        '<input data-link-f="n" value="' + esc(l.n) + '" placeholder="站点名称" aria-label="站点名称" />' +
        '<input data-link-f="u" value="' + esc(l.u) + '" placeholder="https://…" spellcheck="false" aria-label="站点链接" />' +
        '<input data-link-f="d" value="' + esc(l.d) + '" placeholder="一句话描述" aria-label="站点描述" />' +
        '<span class="admin-link__ops">' +
          '<button type="button" data-link-op="pin" data-li="' + li + '"' +
            ' class="alink__pin' + (l.pin ? ' is-on' : '') + '"' +
            ' aria-pressed="' + (!!l.pin) + '" title="置顶（排在分类最前面）" aria-label="置顶">📌</button>' +
          '<button type="button" data-link-op="del" data-li="' + li + '" class="is-danger" title="删除">✕</button>' +
        '</span>' +
      '</div>';
  }

  /* ======================= 浏览器书签导入 ======================= */
  /* Chrome / Edge / Firefox / Safari 导出的都是 Netscape Bookmark 格式的 HTML，
     纯前端用 DOMParser 就能拆成一棵 DL/DT 树，不需要任何后端。 */

  var BM_ROOT_NAMES = ['书签栏', '书签工具栏', '其他书签', '收藏夹', '收藏夹栏', '其他收藏',
                       'Bookmarks bar', 'Bookmarks Toolbar', 'Other bookmarks', 'Bookmarks Menu'];

  /* 一个链接归到哪个分类：找它所在 DL 的「文件夹名」，找不到就往上找一层 */
  function bmFolderOf(a) {
    var dl = a.closest ? a.closest('dl') : null;
    var guard = 0;
    while (dl && guard++ < 20) {
      var h = null, p = dl.parentElement;
      if (p && p.tagName === 'DT') h = p.querySelector('h3');
      if (!h) {
        var s = dl.previousElementSibling;
        while (s && !h) {
          if (s.tagName === 'DT') h = s.querySelector('h3');
          else if (s.tagName === 'H3') h = s;
          s = s.previousElementSibling;
        }
      }
      var name = h ? String(h.textContent || '').trim() : '';
      if (name) return name;
      dl = p && p.closest ? p.closest('dl') : null;
    }
    return '';
  }

  function bmKey(u) { return String(u || '').trim().replace(/\/+$/, '').toLowerCase(); }

  /* 解析书签 HTML → { groups: [{name, links:[{n,u,d}]}], total, skipped } */
  function parseBookmarks(html) {
    var doc;
    try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (e) { return null; }
    if (!doc) return null;

    var existing = {};
    cats().forEach(function (c) {
      (c.links || []).forEach(function (l) { if (l.u) existing[bmKey(l.u)] = true; });
    });

    var seen = {}, groups = {}, order = [], total = 0, skipped = 0;

    Array.prototype.forEach.call(doc.querySelectorAll('a[href]'), function (a) {
      var u = String(a.getAttribute('href') || '').trim();
      if (!u) { skipped++; return; }
      // 跳过脚本伪协议 / 站内锚点 / 空地址
      if (/^(javascript:|data:|place:|about:)/i.test(u) || u.charAt(0) === '#' || !/^[a-z]+:/i.test(u)) { skipped++; return; }
      var k = bmKey(u);
      if (existing[k] || seen[k]) { skipped++; return; }
      seen[k] = true;

      var name = String(a.textContent || '').trim().slice(0, 20) || hostOfJs(u);
      var folder = bmFolderOf(a);
      if (!folder || BM_ROOT_NAMES.indexOf(folder) > -1) folder = '未分类';
      folder = folder.slice(0, 16);

      if (!groups[folder]) { groups[folder] = []; order.push(folder); }
      groups[folder].push({ n: name, u: u, d: '' });
      total++;
    });

    if (!total) return { groups: [], total: 0, skipped: skipped };
    return {
      groups: order.map(function (name) { return { name: name, links: groups[name] }; }),
      total: total,
      skipped: skipped
    };
  }

  function hostOfJs(u) {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return '未命名'; }
  }

  function bindBookmarkImport(root, body) {
    var btn = body.querySelector('#adminImportBm');
    var file = body.querySelector('#bmFile');
    if (!btn || !file) return;

    btn.addEventListener('click', function () { file.click(); });

    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var res = null;
        try { res = parseBookmarks(String(reader.result || '')); } catch (e) { res = null; }
        if (!res) { toast('这个文件读不出来，请确认是浏览器导出的书签 HTML'); return; }
        if (!res.total) {
          askConfirm({
            icon: '📭',
            title: '没有可以导入的站点',
            desc: '文件里' + (res.skipped ? '的 ' + res.skipped + ' 个链接都是重复或无效的' : '没找到任何书签链接') + '。<br>' +
                  '请确认导出的是<b>书签 HTML 文件</b>（Chrome：书签管理器 → ⋮ → 导出书签）。',
            ok: '知道了', cancel: '关闭', safe: true
          }, function () {});
          return;
        }
        var catCount = res.groups.length;
        var sample = res.groups.slice(0, 6).map(function (g) {
          return '<b>' + esc(g.name) + '</b>（' + g.links.length + '）';
        }).join('、') + (catCount > 6 ? ' 等 ' + catCount + ' 个分类' : '');

        askConfirm({
          icon: '📥',
          title: '导入 ' + res.total + ' 个站点？',
          desc: '会把书签按文件夹分成 <b>' + catCount + ' 个分类</b>，追加到现有站点后面（<b>不会覆盖</b>你现在的内容）。<br>' +
                sample + '。' +
                (res.skipped ? '<br>已自动跳过 <b>' + res.skipped + '</b> 个重复 / 无效链接。' : '') +
                '<br><span style="color:var(--text-mute)">同名分类会自动合并；导入后可以随时拖动排序或删除。</span>',
          ok: '确认导入',
          safe: true
        }, function () {
          var addedCats = 0;
          mutate(function (list) {
            res.groups.forEach(function (g) {
              var hit = null;
              for (var i = 0; i < list.length; i++) if (list[i].name === g.name) { hit = list[i]; break; }
              if (hit) {
                hit.links = (hit.links || []).concat(g.links);
              } else {
                list.push({ id: newCatId(), name: g.name, icon: '📁', desc: '从浏览器书签导入', links: g.links });
                addedCats++;
              }
            });
          });
          siteQuery = '';
          var s = root.querySelector('#adminSiteSearch'); if (s) s.value = '';
          refreshBody(root);
          toast('已导入 ' + res.total + ' 个站点' + (addedCats ? '，新增 ' + addedCats + ' 个分类' : ''));
        });
      };
      reader.onerror = function () { toast('读取文件失败'); };
      reader.readAsText(f, 'utf-8');
      file.value = '';
    });
  }

  /* ======================= 自定义链接 ======================= */
  /* 顶栏链接的一段 HTML（与前台 app.js 的渲染保持一致） */
  function hlinkHtml(l) {
    var ico = l.icon ? '<span class="hlink__icon">' + esc(l.icon) + '</span>' : '';
    return '<span class="hlink hlink--preview' + (l.icon ? '' : ' hlink--noicon') + '">' +
      ico + '<span class="hlink__name">' + esc(l.name) + '</span></span>';
  }

  function linksPanel() {
    var links = Store.allLinks();
    var rows = links.map(function (l, i) {
      return '<div class="admin-link" data-i="' + i + '" data-drag-item="' + i + '">' +
        grip() +
        '<span class="admin-link__idx">' + (i + 1) + '</span>' +
        '<span class="alink-icon">' +
          '<input class="admin-link__icon" data-f="icon" value="' + esc(l.icon) + '" maxlength="4" placeholder="—" aria-label="图标（可留空）" />' +
          '<button class="alink-icon__pick" type="button" data-op="emoji" title="挑选一个 emoji 图标" aria-label="挑选图标">🙂</button>' +
        '</span>' +
        '<input class="admin-link__name" data-f="name" value="' + esc(l.name) + '" placeholder="名称，如 GitHub" maxlength="20" aria-label="名称" />' +
        '<input class="admin-link__url" data-f="url" value="' + esc(l.url) + '" placeholder="https://example.com" spellcheck="false" aria-label="链接" />' +
        '<span class="admin-link__ops">' +
          '<button type="button" data-op="del" class="is-danger" title="删除" aria-label="删除">✕</button>' +
        '</span>' +
        '</div>';
    }).join('');

    var previewItems = Store.activeLinks().map(hlinkHtml).join('');

    return '<div class="admin-card">' +
        '<div class="admin-card__head">' +
          '<div><h2>自定义链接</h2><p>最多 ' + MAX + ' 个，显示在顶栏搜索框右侧，全站常驻、点击直达。</p></div>' +
          '<span class="admin-count' + (links.length >= MAX ? ' is-full' : '') + '">' + links.length + ' / ' + MAX + '</span>' +
        '</div>' +
        (links.length ? '<div class="admin-links" data-drag-box="clink">' + rows + '</div>'
                      : '<p class="admin-empty">还没有添加任何链接。</p>') +
        '<div class="admin-card__foot">' +
          '<button class="btn btn--primary" type="button" id="adminAdd"' + (links.length >= MAX ? ' disabled' : '') + '>＋ 添加链接</button>' +
          (links.length >= MAX ? '<span class="admin-tip">已达上限，删掉一个才能再加。</span>' : '') +
        '</div>' +
        '<p class="admin-tip">' +
          '<b>图标</b>：填一个 <b>emoji</b> 就行（如 🐙 📚 🎧 ✨ 🚀），点右边的 <b>🙂</b> 可以挑；' +
          'macOS 也可以按 <code>⌃⌘Space</code> 调出系统表情面板。' +
          '<b>留空则只显示文字名称</b>，不会出现占位图标。' +
        '</p>' +
      '</div>' +
      '<div class="admin-card">' +
        '<h2>顶栏效果预览</h2>' +
        '<div class="admin-preview" id="adminPreview">' + previewItems + '</div>' +
        '<p class="admin-tip">名称与链接都填好就会出现（链接可省略 <code>https://</code>，也支持站内 <code>#/nav</code> 与 <code>mailto:</code>）。</p>' +
      '</div>';
  }

  /* ======================= 文章 ======================= */
  function todayStr() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function newPostId() {
    return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }
  function mdStats(body) {
    return MD ? MD.stats(body || '') : { chars: String(body || '').length, minutes: 1 };
  }
  function fmtChars(n) { return MD ? MD.fmtChars(n) : n + ' 字'; }

  /* 列表顺序和前台一致：置顶优先，再按日期倒序（草稿也列出来，方便接着写） */
  function postsSorted() {
    var list = Store.postsAll();
    list.sort(function (a, b) {
      return (b.pin ? 1 : 0) - (a.pin ? 1 : 0) ||
        String(b.date || '').localeCompare(String(a.date || ''));
    });
    return list;
  }
  function findPostById(id) {
    var list = Store.postsAll();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function postRowHtml(p) {
    var st = mdStats(p.body);
    var isEditing = !!(editing && !editing.isNew && editing.id === p.id);
    var isSaved = !!(savedId && savedId === p.id);
    var tags = (p.tags || []).map(function (t) { return '#' + t; }).join(' ');
    return '<div class="post-admin-row' + (isEditing ? ' is-editing' : '') + (isSaved ? ' is-saved' : '') +
        '" data-pid="' + esc(p.id) + '">' +
        '<div class="post-admin-row__main">' +
          '<div class="post-admin-row__title">' +
            (p.pin ? '<i title="已置顶">📌</i>' : '') +
            '<span>' + esc(p.title) + '</span>' +
            (p.draft ? '<span class="post-admin-row__badge post-admin-row__badge--draft">草稿</span>' : '') +
          '</div>' +
          '<div class="post-admin-row__meta">' + esc(p.date || '未标日期') +
            (tags ? ' · ' + esc(tags) : '') +
            ' · ' + esc(fmtChars(st.chars)) + '</div>' +
        '</div>' +
        '<div class="post-admin-row__ops">' +
          '<button type="button" data-post-op="edit">编辑</button>' +
          '<button type="button" data-post-op="pin" class="' + (p.pin ? 'is-on' : '') +
            '" title="置顶到列表最前">📌</button>' +
          (!p.draft ? '<button type="button" data-post-op="view">查看</button>' : '') +
          '<button type="button" data-post-op="del" class="is-danger">删除</button>' +
        '</div>' +
      '</div>';
  }

  function postListHtml() {
    var list = postsSorted();
    var q = norm(postQuery);
    var hits = q ? list.filter(function (p) {
      return norm(p.title + (p.tags || []).join('') + (p.body || '').slice(0, 4000)).indexOf(q) > -1;
    }) : list;
    if (!list.length) {
      return '<p class="admin-empty">还没有文章。点上面的「新建文章」，或者直接导入你写好的 .md 文件。</p>';
    }
    if (!hits.length) return '<p class="admin-empty">没有匹配「' + esc(postQuery) + '」的文章。</p>';
    return '<div class="post-admin-list">' + hits.map(postRowHtml).join('') + '</div>';
  }

  /* ======================= Markdown 快捷输入 ======================= */
  /* 行内样式：前后各包一段标记，再点一次就脱掉 */
  var MD_INLINE = {
    bold:   { mark: '**', ph: '粗体' },
    italic: { mark: '*',  ph: '斜体' },
    strike: { mark: '~~', ph: '删除线' },
    code:   { mark: '`',  ph: '代码' }
  };
  /* 行级样式：给整行加/去前缀；strip 是「同类前缀」的正则，换标题级别时先剥掉旧的 */
  var MD_LINE = {
    h1:    { prefix: '# ',     strip: /^\s{0,3}#{1,6}\s+/ },
    h2:    { prefix: '## ',    strip: /^\s{0,3}#{1,6}\s+/ },
    h3:    { prefix: '### ',   strip: /^\s{0,3}#{1,6}\s+/ },
    quote: { prefix: '> ',     strip: /^\s{0,3}>\s?/ },
    ul:    { prefix: '- ',     strip: /^\s*([-*+]|\d+[.)])\s+/ },
    ol:    { prefix: '1. ',    strip: /^\s*([-*+]|\d+[.)])\s+/ },
    task:  { prefix: '- [ ] ', strip: /^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s*)?/ }
  };

  /* 图标用内联 SVG：彩色 emoji 塞进单色工具条里会跳出来，还和字号不搭 */
  var MD_ICONS = {
    link: '<svg viewBox="0 0 24 24"><path d="M10 13.5a4.5 4.5 0 0 0 6.4 0l2.1-2.1a4.5 4.5 0 0 0-6.4-6.4l-1.1 1.1"/><path d="M14 10.5a4.5 4.5 0 0 0-6.4 0l-2.1 2.1a4.5 4.5 0 0 0 6.4 6.4l1.1-1.1"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M20.5 16.5l-4.8-4.8-6.7 6.7"/></svg>',
    table: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M9.5 10v9"/></svg>',
    codeblock: '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M10 9.5L7.5 12l2.5 2.5M14 9.5L16.5 12 14 14.5"/></svg>',
    hr: '<svg viewBox="0 0 24 24"><path d="M4 12h16"/><path d="M8 6.5h8M8 17.5h8" opacity=".35"/></svg>'
  };

  /* [key, 文字标签, 说明, 快捷键提示] —— 有 MD_ICONS 的用图标，否则用文字标签 */
  var MD_TOOLBAR = [
    [['h1', 'H1', '一级标题', '⌥⌘1'], ['h2', 'H2', '二级标题', '⌥⌘2'], ['h3', 'H3', '三级标题', '⌥⌘3']],
    [['bold', 'B', '加粗', '⌘B'], ['italic', 'I', '斜体', '⌘I'], ['strike', 'S', '删除线'], ['code', '‹›', '行内代码', '⌘E']],
    [['ul', '•', '无序列表'], ['ol', '1.', '有序列表'], ['task', '☐', '待办清单'], ['quote', '❝', '引用']],
    [['link', '', '链接', '⌘K'], ['image', '', '图片'], ['table', '', '表格'], ['codeblock', '', '代码块'], ['hr', '', '分割线']]
  ];

  function mdToolbarHtml() {
    var mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');
    var groups = MD_TOOLBAR.map(function (g) {
      return '<span class="md-tools__group">' + g.map(function (b) {
        var label = MD_ICONS[b[0]] || b[1];
        var tip = b[2] + (b[3] ? ' · ' + (mac ? b[3] : b[3].replace(/⌘/g, 'Ctrl+').replace(/⌥/g, 'Alt+')) : '');
        return '<button class="md-tools__btn" type="button" data-md="' + b[0] + '"' +
          ' title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' + label + '</button>';
      }).join('') + '</span>';
    }).join('');
    return '<div class="md-tools" id="mdTools">' + groups +
        '<button class="md-tools__btn md-tools__help" type="button" id="mdHelpBtn" title="快捷输入说明" aria-label="快捷输入说明">?</button>' +
      '</div>';
  }

  /* 把新文本塞回去。优先用 execCommand，这样 ⌘Z 还能正常撤销；不行再退回直接赋值 */
  function mdReplace(ta, start, end, text, selStart, selEnd) {
    var v0 = ta.value;
    ta.focus();
    try { ta.setSelectionRange(start, end); } catch (e) {}
    var ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok) {
      ta.value = v0.slice(0, start) + text + v0.slice(end);
    }
    var s = selStart == null ? start + text.length : selStart;
    var e = selEnd == null ? s : selEnd;
    try { ta.setSelectionRange(s, e); } catch (err) {}
    try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (err) {}
  }

  /* 光标所在的行块（从行首到行尾） */
  function mdLineRange(ta) {
    var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    var ls = v.lastIndexOf('\n', s - 1) + 1;
    var le = v.indexOf('\n', e);
    if (le < 0) le = v.length;
    return { s: ls, e: le, text: v.slice(ls, le) };
  }

  function mdToggleInline(ta, kind) {
    var m = MD_INLINE[kind];
    if (!m) return;
    var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    var sel = v.slice(s, e);
    var ml = m.mark.length;
    /* 选中的内容本身带着标记 → 脱掉 */
    if (sel.length > ml * 2 && sel.slice(0, ml) === m.mark && sel.slice(-ml) === m.mark) {
      mdReplace(ta, s, e, sel.slice(ml, sel.length - ml), s, e - ml * 2);
      return;
    }
    /* 光标正好在两段标记中间 → 脱掉 */
    if (!sel && s >= ml && v.slice(s - ml, s) === m.mark && v.slice(e, e + ml) === m.mark) {
      mdReplace(ta, s - ml, e + ml, '', s - ml);
      return;
    }
    var body = sel || m.ph;
    mdReplace(ta, s, e, m.mark + body + m.mark, s + ml, s + ml + body.length);
  }

  function mdToggleLine(ta, kind) {
    var cfg = MD_LINE[kind];
    if (!cfg) return;
    var r = mdLineRange(ta);
    var lines = r.text.split('\n');
    var caret = ta.selectionStart;
    var caretLine = r.text.slice(0, caret - r.s).split('\n').length - 1;
    var picks = lines.filter(function (l) { return l.trim(); });
    /* 所有非空行都已经带这个前缀 → 这次是「取消」 */
    var hasAll = picks.length > 0 && picks.every(function (l) {
      return l.replace(/^[ \t]+/, '').indexOf(cfg.prefix) === 0;
    });

    var meta = lines.map(function (l) {
      var ind = /^[ \t]*/.exec(l)[0];
      var rest = l.slice(ind.length);
      var st = rest.match(cfg.strip);
      return {
        blank: !l.trim(),
        ind: ind,
        body: st ? rest.slice(st[0].length) : rest,
        oldStart: ind.length + (st ? st[0].length : 0),
        newStart: ind.length + (hasAll ? 0 : cfg.prefix.length)
      };
    });

    var out = meta.map(function (m, i) {
      if (m.blank) {
        /* 空行通常不动；但整块只有这一行、或光标正停在这行时，还是得给它加上，否则点了像没反应 */
        return (!hasAll && (lines.length === 1 || i === caretLine)) ? cfg.prefix : '';
      }
      return m.ind + (hasAll ? '' : cfg.prefix) + m.body;
    });
    if (kind === 'ol' && !hasAll) {
      var n = 1;
      out = out.map(function (l) {
        return l ? l.replace(/^([ \t]*)1\. /, function (x, ind) { return ind + (n++) + '. '; }) : l;
      });
    }

    var text = out.join('\n');
    if (lines.length > 1) { mdReplace(ta, r.s, r.e, text, r.s, r.s + text.length); return; }

    /* 单行：光标落在「原来选区末尾」映射后的位置。
       注意选区时 selectionStart 是左边那头，得用 selectionEnd 才算原来的光标 */
    var m0 = meta[0];
    var off = ta.selectionEnd - r.s;
    var newOff = off <= m0.oldStart ? m0.newStart : m0.newStart + (off - m0.oldStart);
    newOff = Math.max(0, Math.min(out[0].length, newOff));
    mdReplace(ta, r.s, r.e, text, r.s + newOff);
  }

  function mdLink(ta) {
    var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    var sel = v.slice(s, e) || '链接文字';
    var text = '[' + sel + '](https://)';
    mdReplace(ta, s, e, text, s + sel.length + 3, s + sel.length + 11);
  }

  function mdImage(ta) {
    var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    var sel = v.slice(s, e) || '图片说明';
    var ph = '图片地址';
    var text = '![' + sel + '](' + ph + ')';
    mdReplace(ta, s, e, text, s + sel.length + 4, s + sel.length + 4 + ph.length);
  }

  function mdTable(ta) {
    var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    var tpl = '| 列 1 | 列 2 |\n| --- | --- |\n|  |  |';
    var pre = s > 0 && v.charAt(s - 1) !== '\n' ? '\n' : '';
    mdReplace(ta, s, e, pre + tpl, s + pre.length + 2, s + pre.length + 5);
  }

  function mdCodeBlock(ta) {
    var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    var sel = v.slice(s, e);
    var pre = s > 0 && v.charAt(s - 1) !== '\n' ? '\n' : '';
    var post = e < v.length && v.charAt(e) !== '\n' ? '\n' : '';
    var text = pre + '```\n' + sel + '\n```' + post;
    var caret = s + pre.length + 4;   /* 落在围栏里的第一行 */
    if (sel) mdReplace(ta, s, e, text, s + pre.length + 4, s + pre.length + 4 + sel.length);
    else mdReplace(ta, s, e, text, caret);
  }

  function mdHr(ta) {
    var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    var pre = s > 0 && v.charAt(s - 1) !== '\n' ? '\n\n' : '';
    mdReplace(ta, s, e, pre + '---\n\n');
  }

  /* 列表里回车 → 自动续写下一个标记；空条目再回车 → 退出列表 */
  function mdContinueList(ta) {
    if (ta.selectionStart !== ta.selectionEnd) return false;
    var s = ta.selectionStart;
    var ls = ta.value.lastIndexOf('\n', s - 1) + 1;
    var line = ta.value.slice(ls, s);
    var m = /^([ \t]*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/.exec(line);
    if (!m) return false;
    var rest = line.slice(m[0].length);
    if (!rest.trim()) { mdReplace(ta, ls, s, '', ls); return true; }
    var next;
    if (/^\d/.test(m[2])) next = m[1] + (parseInt(m[2], 10) + 1) + m[2].slice(-1) + ' ';
    else next = m[1] + m[2] + ' ';
    if (m[3]) next += '[ ] ';
    mdReplace(ta, s, s, '\n' + next);
    return true;
  }

  /* Tab / ⇧Tab：多行整块缩进，单行就在光标处插两格（有选中就整行缩进，别把选中的字删了） */
  function mdIndent(ta, back) {
    var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    var ls = v.lastIndexOf('\n', s - 1) + 1;
    var nextNl = v.indexOf('\n', e);
    var le = nextNl < 0 ? v.length : nextNl;
    var block = v.slice(ls, le);
    var multiSel = e > s;   /* 多行选中，或者同一行里选了一段 */

    /* 只有「光标没选中任何东西 + 往前缩」才是纯插空格 */
    if (block.indexOf('\n') < 0 && s === e && !back) { mdReplace(ta, s, e, '  '); return; }

    var lines = block.split('\n');
    var out = lines.map(function (l) {
      if (back) return l.replace(/^( {1,2}|\t)/, '');
      return '  ' + l;
    });
    var text = out.join('\n');
    if (text === block) return;      /* 反缩进时没东西可去，就别动 */

    var caretLine = v.slice(ls, s).split('\n').length - 1;
    var delta = out[caretLine].length - lines[caretLine].length;
    var clamp = function (n) { return Math.max(ls, Math.min(ls + text.length, n)); };
    if (multiSel) mdReplace(ta, ls, le, text, clamp(s + delta), clamp(e + delta));
    else mdReplace(ta, ls, le, text, clamp(s + delta));
  }

  /* 一个入口：工具条按钮 / 快捷键都走这里 */
  function mdApply(ta, kind) {
    if (!ta) return;
    if (MD_INLINE[kind]) return mdToggleInline(ta, kind);
    if (MD_LINE[kind]) return mdToggleLine(ta, kind);
    if (kind === 'link') return mdLink(ta);
    if (kind === 'image') return mdImage(ta);
    if (kind === 'table') return mdTable(ta);
    if (kind === 'codeblock') return mdCodeBlock(ta);
    if (kind === 'hr') return mdHr(ta);
  }

  function mdHelpHtml() {
    var mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');
    var mod = mac ? '⌘' : 'Ctrl+';
    var alt = mac ? '⌥' : 'Alt+';
    var rows = [
      [mod + 'B / ' + mod + 'I', '加粗 / 斜体（选中文字再按也行）'],
      [mod + 'E / ' + mod + 'K', '行内代码 / 链接'],
      [alt + mod + '1 2 3', '一 / 二 / 三级标题'],
      ['Tab / ⇧Tab', '缩进两格 / 反缩进（Esc 离开正文框）'],
      ['Enter', '在列表里回车自动续写；空条目再回车就结束列表'],
      [mod + 'S', '保存'],
      [mod + '↵', '折起 / 展开预览']
    ];
    return '<div class="md-help" id="mdHelpBox" hidden>' +
        '<div class="md-help__head"><b>正文快捷输入</b>' +
          '<button type="button" class="md-help__x" data-md-help="close" aria-label="关闭">×</button></div>' +
        '<dl class="md-help__list">' + rows.map(function (r) {
          return '<dt><kbd>' + r[0] + '</kbd></dt><dd>' + r[1] + '</dd>';
        }).join('') + '</dl>' +
        '<p class="md-help__tip">工具条上的按钮也能用：选中文字再点，就是给这段文字套格式。</p>' +
      '</div>';
  }

  /* 绑定：工具条、快捷键、帮助浮层 */
  function bindMarkdown(root, body, ta) {
    var tools = body.querySelector('#mdTools');
    if (!tools || !ta) return;

    /* 按下时别把焦点从输入框抢走，否则选区就丢了 */
    tools.addEventListener('mousedown', function (e) {
      if (e.target.closest('button')) e.preventDefault();
    });
    tools.addEventListener('click', function (e) {
      var b = e.target.closest('[data-md]');
      if (b) { mdApply(ta, b.getAttribute('data-md')); return; }
      if (e.target.closest('#mdHelpBtn')) {
        var box = body.querySelector('#mdHelpBox');
        if (box) box.hidden = !box.hidden;
      }
    });

    var helpBox = body.querySelector('#mdHelpBox');
    if (helpBox) helpBox.addEventListener('click', function (e) {
      if (e.target.closest('[data-md-help="close"]')) helpBox.hidden = true;
    });

    ta.addEventListener('keydown', function (e) {
      var mod = e.metaKey || e.ctrlKey;

      if (mod && !e.altKey && !e.shiftKey) {
        var k = (e.key || '').toLowerCase();
        if (k === 'b') { e.preventDefault(); mdToggleInline(ta, 'bold'); return; }
        if (k === 'i') { e.preventDefault(); mdToggleInline(ta, 'italic'); return; }
        if (k === 'e') { e.preventDefault(); mdToggleInline(ta, 'code'); return; }
        if (k === 'k') { e.preventDefault(); mdLink(ta); return; }
        if (k === 's') { e.preventDefault(); saveEditor(root, body); return; }
        if (e.key === 'Enter') { e.preventDefault(); var pv = body.querySelector('#postPreview'); if (pv) pv.click(); return; }
      }
      /* ⌥⌘1/2/3：标题（⌘1 会被浏览器抢去切标签，所以加个 ⌥） */
      if (mod && e.altKey && /^[123]$/.test(e.key || '')) {
        e.preventDefault();
        mdToggleLine(ta, 'h' + e.key);
        return;
      }
      if (e.key === 'Tab') { e.preventDefault(); mdIndent(ta, e.shiftKey); return; }
      if (e.key === 'Enter' && !e.shiftKey && !mod && !e.altKey) {
        if (mdContinueList(ta)) e.preventDefault();
        return;
      }
      if (e.key === 'Escape') { ta.blur(); }
    });

    /* 点别处收起说明。挂 document 上只注册一次：adminBody 会反复重绘，挂在它上面会越积越多 */
    if (!bindMarkdown._docBound) {
      bindMarkdown._docBound = true;
      document.addEventListener('click', function (e) {
        var box = document.querySelector('#mdHelpBox');
        if (!box || box.hidden) return;
        if (e.target && e.target.closest &&
            (e.target.closest('#mdHelpBox') || e.target.closest('#mdHelpBtn'))) return;
        box.hidden = true;
      });
    }
  }

  function postEditorHtml() {
    var isNew = !editing || editing.isNew;
    var p = isNew
      ? { id: '', title: '', date: todayStr(), tags: [], excerpt: '', body: '', pin: false, draft: false }
      : findPostById(editing.id);
    if (!p) { editing = null; return ''; }
    var st = mdStats(p.body);
    return '<div class="admin-card">' +
        '<div class="admin-card__head">' +
          '<div><h2>' + (isNew ? '新建文章' : '编辑文章') + '</h2>' +
            '<p>正文用 <b>Markdown</b> 写就行；标签用逗号分隔，前台可以按标签筛选。</p></div>' +
          '<span class="admin-count" id="postEditorCount">' + esc(fmtChars(st.chars)) + '</span>' +
        '</div>' +
        '<div class="post-editor">' +
          '<label class="admin-field"><span class="admin-field__label">标题</span>' +
            '<input type="text" data-pf="title" value="' + esc(p.title) + '" ' +
              'placeholder="给这篇文章起个名字" maxlength="120" /></label>' +
          '<div class="post-editor__grid">' +
            '<div class="admin-field post-editor__main">' +
              '<span class="admin-field__label">正文<em>Markdown · 支持快捷输入</em></span>' +
              mdToolbarHtml() +
              mdHelpHtml() +
              '<textarea id="postBody" data-pf="body" spellcheck="false" ' +
                'placeholder="## 从一个小标题开始写&#10;&#10;正文……">' + esc(p.body) + '</textarea>' +
            '</div>' +
            '<div>' +
              '<label class="admin-field"><span class="admin-field__label">日期</span>' +
                '<input type="date" data-pf="date" value="' + esc(p.date) + '" /></label>' +
              '<label class="admin-field"><span class="admin-field__label">标签<em>逗号分隔</em></span>' +
                '<input type="text" data-pf="tags" value="' + esc((p.tags || []).join(', ')) +
                  '" placeholder="随笔, 建站" /></label>' +
              '<label class="admin-field"><span class="admin-field__label">摘要<em>留空则取正文开头</em></span>' +
                '<textarea data-pf="excerpt" rows="3" placeholder="一句话说清这篇写了什么">' + esc(p.excerpt || '') + '</textarea></label>' +
              '<label class="admin-switch"><input type="checkbox" data-pf="pin"' + (p.pin ? ' checked' : '') + ' />' +
                '<span class="admin-switch__track"><span class="admin-switch__dot"></span></span>' +
                '<span class="admin-switch__text">置顶这篇</span></label>' +
              '<label class="admin-switch"><input type="checkbox" data-pf="draft"' + (p.draft ? ' checked' : '') + ' />' +
                '<span class="admin-switch__track"><span class="admin-switch__dot"></span></span>' +
                '<span class="admin-switch__text">存为草稿（前台不显示）</span></label>' +
            '</div>' +
          '</div>' +
          '<div class="post-editor__bar">' +
            '<button class="btn btn--primary" type="button" id="postSave">💾 保存</button>' +
            '<button class="btn btn--ghost" type="button" id="postPreview">👁 预览</button>' +
            '<button class="btn btn--ghost" type="button" id="postCancel">取消</button>' +
            '<span class="post-editor__count" id="postCount">' + esc(fmtChars(st.chars)) + ' · 约 ' + st.minutes + ' 分钟</span>' +
          '</div>' +
          '<div class="post-editor__preview" id="postPreviewBox" hidden></div>' +
        '</div>' +
      '</div>';
  }

  function postsPanel() {
    var list = postsSorted();
    var drafts = list.filter(function (p) { return p.draft; }).length;
    return (editing ? postEditorHtml() : '') +
      '<div class="admin-card">' +
        '<div class="admin-card__head">' +
          '<div><h2>文章</h2>' +
            '<p>前台「文章」页的内容。写完立刻能在 <code>#/post</code> 看到（草稿除外）。</p></div>' +
          '<span class="admin-count">' + list.length + ' 篇' + (drafts ? ' · ' + drafts + ' 草稿' : '') + '</span>' +
        '</div>' +
        '<div class="admin-toolbar">' +
          '<button class="btn btn--primary" type="button" id="postNew">＋ 新建文章</button>' +
          '<button class="btn btn--ghost" type="button" id="postImport">📥 导入 .md 文件</button>' +
          '<div class="admin-search">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>' +
            '<input type="search" id="postSearch" placeholder="搜标题 / 标签 / 正文…" value="' + esc(postQuery) + '" autocomplete="off" aria-label="搜索文章" />' +
          '</div>' +
          '<input type="file" id="postFile" accept=".md,.markdown,.txt,text/markdown" multiple hidden />' +
        '</div>' +
        '<div id="postListBox">' + postListHtml() + '</div>' +
        '<p class="admin-tip">' +
          '<b>导入 .md</b>：可以一次选多篇。标题优先取文件里的 <code># 标题</code>（或 front-matter 的 <code>title</code>），' +
          '否则用文件名；日期取文件修改时间，也可以用 front-matter 的 <code>date</code>；' +
          '<code>tags</code> 支持 <code>[随笔, 建站]</code> 这种写法。' +
        '</p>' +
        '<p class="admin-tip">文章和别的后台数据一样只存在<b>这台浏览器</b>里。想让所有访客都看到，' +
          '到「备份」页导出，或者把内容写进 <code>assets/js/data.js</code> 的 <code>posts</code>。</p>' +
      '</div>';
  }

  /* ---- 编辑器读写 ---- */
  function collectEditor(body) {
    var g = function (k) {
      var el = body.querySelector('[data-pf="' + k + '"]');
      return el ? el.value : '';
    };
    var ck = function (k) {
      var el = body.querySelector('[data-pf="' + k + '"]');
      return !!(el && el.checked);
    };
    var tags = g('tags').split(/[,，、;；\s]+/)
      .map(function (t) { return t.trim().replace(/^#/, ''); })
      .filter(Boolean);
    return {
      title: g('title').trim() || '未命名文章',
      date: g('date') || todayStr(),
      tags: tags.filter(function (t, i, a) { return a.indexOf(t) === i; }).slice(0, 8),
      excerpt: g('excerpt').trim(),
      body: g('body'),
      pin: ck('pin'),
      draft: ck('draft')
    };
  }

  function saveEditor(root, body) {
    if (!editing) return;
    var data = collectEditor(body);
    if (!data.body.trim() && !data.title.trim()) { toast('标题和正文都还空着'); return; }
    var list = Store.postsAll();
    var key;
    if (editing.isNew) {
      key = newPostId();
      data.id = key;
      list.unshift(data);
    } else {
      key = editing.id;
      var idx = -1;
      for (var i = 0; i < list.length; i++) if (list[i].id === key) { idx = i; break; }
      if (idx < 0) { list.unshift(Object.assign({ id: key }, data)); }
      else list[idx] = Object.assign({}, list[idx], data, { id: key });
    }
    if (Store.setPosts(list) === false) {
      toast('浏览器存不下了（localStorage 满了），先导出备份再删点旧文章');
      return;
    }
    /* 存完就退出编辑器，回到列表（不然会以为没保存上） */
    editing = null;
    savedId = key;
    toast(data.draft ? '已存草稿 ✦ 前台暂时看不到' : '已保存 ✦ 前台马上能看到');
    refreshBody(root);
    var row = root.querySelector('.post-admin-row.is-saved');
    if (row) {
      try { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    }
  }

  /* ---- 导入 .md ---- */
  /* 简单 front-matter：--- 之间的 title / date / tags / excerpt */
  function parseFrontMatter(text) {
    var m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (!m) return { meta: {}, body: text };
    var meta = {};
    m[1].split(/\r?\n/).forEach(function (line) {
      var kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line.trim());
      if (!kv) return;
      var k = kv[1].toLowerCase();
      var v = kv[2].trim().replace(/^["']|["']$/g, '');
      if (k === 'tags' || k === 'tag') {
        meta.tags = v.replace(/^\[|\]$/g, '').split(/[,，、]/)
          .map(function (s) { return s.trim().replace(/^["'#]|["']$/g, ''); })
          .filter(Boolean);
      } else meta[k] = v;
    });
    return { meta: meta, body: text.slice(m[0].length) };
  }

  /* 文件名 → 标题 + 日期：2026-09-01-我的文章.md → 「我的文章」+ 2026-09-01 */
  function infoFromFileName(name) {
    var base = String(name || '').replace(/\.(md|markdown|txt)$/i, '').trim();
    var out = { title: '', date: '' };
    var md = /^(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})[-_. ]*(.+)$/.exec(base);
    if (md) {
      function p2(n) { return (n.length < 2 ? '0' : '') + n; }
      var mm = +md[2], dd = +md[3];
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) out.date = md[1] + '-' + p2(md[2]) + '-' + p2(md[3]);
      base = md[4];
    }
    base = base.replace(/^\d+[.\-_ ]+/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    out.title = base;
    return out;
  }

  function importMdFiles(root, files) {
    var arr = Array.prototype.slice.call(files || []);
    if (!arr.length) return;
    var out = [];
    var pending = arr.length;
    arr.forEach(function (f) {
      var fr = new FileReader();
      fr.onerror = function () { done(); };
      fr.onload = function () {
        var raw = String(fr.result || '');
        var fm = parseFrontMatter(raw);
        var body = fm.body.replace(/^\s+/, '');
        var fileInfo = infoFromFileName(f.name);
        var title = fm.meta.title || '';
        if (!title) {
          var h1 = /^#[ \t]+(.+?)[ \t]*$/m.exec(body);
          title = h1 ? h1[1].trim() : (fileInfo.title || '未命名文章');
        }
        var d = fm.meta.date ? String(fm.meta.date).slice(0, 10) : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          if (fileInfo.date) d = fileInfo.date;
          else {
            var lm = f.lastModified ? new Date(f.lastModified) : new Date();
            function p2(n) { return (n < 10 ? '0' : '') + n; }
            d = lm.getFullYear() + '-' + p2(lm.getMonth() + 1) + '-' + p2(lm.getDate());
          }
        }
        out.push({
          id: newPostId(),
          title: title.slice(0, 120),
          date: d,
          tags: Array.isArray(fm.meta.tags) ? fm.meta.tags : [],
          excerpt: fm.meta.excerpt || '',
          body: body,
          pin: false,
          draft: false
        });
        done();
      };
      fr.readAsText(f);
    });

    function done() {
      pending--;
      if (pending > 0) return;
      if (!out.length) { toast('没读到内容，换个文件试试'); return; }
      var list = Store.postsAll();
      out.forEach(function (p) { list.unshift(p); });
      if (Store.setPosts(list) === false) {
        toast('浏览器存不下了，先清理一些旧文章再导入');
        return;
      }
      toast('已导入 ' + out.length + ' 篇' + (out.length === 1 ? '，可以接着改' : ''));
      if (out.length === 1) editing = { id: out[0].id, isNew: false };
      refreshBody(root);
    }
  }

  /* 只重绘文章列表（搜索时用，不动编辑器里正在写的内容） */
  function refreshPostList(root) {
    var box = root.querySelector('#postListBox');
    if (box) box.innerHTML = postListHtml();
    syncSide(root);
  }

  function bindPosts(root, body) {
    var newBtn = body.querySelector('#postNew');
    if (newBtn) newBtn.addEventListener('click', function () {
      editing = { id: '', isNew: true };
      savedId = '';
      postQuery = '';
      refreshBody(root);
      var t = root.querySelector('[data-pf="title"]');
      if (t) t.focus();
    });

    var impBtn = body.querySelector('#postImport');
    var impFile = body.querySelector('#postFile');
    if (impBtn && impFile) {
      impBtn.addEventListener('click', function () { impFile.click(); });
      impFile.addEventListener('change', function () {
        importMdFiles(root, impFile.files);
        impFile.value = '';
      });
    }

    var search = body.querySelector('#postSearch');
    if (search) search.addEventListener('input', function () {
      postQuery = search.value;
      refreshPostList(root);
    });

    /* 列表里的行内操作 */
    var listBox = body.querySelector('#postListBox');
    if (listBox) listBox.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-post-op]');
      if (!btn) return;
      var row = btn.closest('.post-admin-row');
      var pid = row && row.getAttribute('data-pid');
      var op = btn.getAttribute('data-post-op');
      if (!pid) return;

      if (op === 'edit') {
        editing = { id: pid, isNew: false };
        savedId = '';
        refreshBody(root);
        var ta = root.querySelector('#postBody');
        if (ta) { try { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e1) {} }
        return;
      }
      if (op === 'view') {
        var a = app();
        if (a.openPost) a.openPost(pid);
        return;
      }
      if (op === 'pin') {
        var on = false;
        Store.setPosts(Store.postsAll().map(function (p) {
          if (p.id !== pid) return p;
          p.pin = !p.pin;
          on = p.pin;
          return p;
        }));
        toast(on ? '已置顶' : '已取消置顶');
        refreshBody(root);
        return;
      }
      if (op === 'del') {
        if (!armedNow('post', pid, -1)) {
          arm('post', pid, -1);
          toast('再点一次确认删除');
          btn.classList.add('is-danger');
          btn.textContent = '确认删除？';
          return;
        }
        armed = null;
        Store.setPosts(Store.postsAll().filter(function (p) { return p.id !== pid; }));
        if (editing && editing.id === pid) editing = null;
        toast('已删除');
        refreshBody(root);
      }
    });

    /* 编辑器 */
    var saveBtn = body.querySelector('#postSave');
    if (!saveBtn) return;
    var bodyEl = body.querySelector('#postBody');
    var countEl = body.querySelector('#postCount');
    var pvBtn = body.querySelector('#postPreview');
    var pvBox = body.querySelector('#postPreviewBox');
    bindMarkdown(root, body, bodyEl);

    function syncCount() {
      if (!bodyEl || !countEl) return;
      var st = mdStats(bodyEl.value);
      countEl.textContent = fmtChars(st.chars) + ' · 约 ' + st.minutes + ' 分钟';
    }
    if (bodyEl) {
      bodyEl.addEventListener('input', debounce(function () {
        syncCount();
        if (pvBox && !pvBox.hidden) pvBox.innerHTML = '<div class="md">' + (MD ? MD.render(bodyEl.value) : '') + '</div>';
      }, 220));
    }

    saveBtn.addEventListener('click', function () { saveEditor(root, body); });

    var cancelBtn = body.querySelector('#postCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function () {
      editing = null;
      refreshBody(root);
    });

    if (pvBtn && pvBox) pvBtn.addEventListener('click', function () {
      if (!pvBox.hidden) { pvBox.hidden = true; pvBtn.textContent = '👁 预览'; return; }
      pvBox.innerHTML = '<div class="md">' + (MD && bodyEl ? MD.render(bodyEl.value) : '') + '</div>';
      pvBox.hidden = false;
      pvBtn.textContent = '👁 收起预览';
      try { pvBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e2) {}
    });
  }

  /* ======================= 分享条目 ======================= */
  /* 列表按 Store 里排好的顺序（日期倒序），下标即真实下标，改完回写不会错位。
     v129 起：**全部都列出来**（以前只铺前 60 条，后面 600 多条被藏起来要去搜），
     一行最多三列（一列一行太占地方），点「编辑」**就在这一行原地展开**，
     不跳到别处、也不弹窗，改完/取消就自己收回去。 */
  function feedCellHtml(f, i) {
    var isNew = i < 0;
    var editing = !!(feedEditing && (isNew ? feedEditing.isNew : (!feedEditing.isNew && feedEditing.idx === i)));
    if (editing) {
      return '<div class="post-admin-row is-editing is-open" data-fidx="' + i + '">' +
          feedFormHtml(f, isNew) +
        '</div>';
    }
    var tags = (f.tags || []).map(function (t) { return '#' + t; }).join(' ');
    var inner = String(f.url || '').charAt(0) === '#';
    return '<div class="post-admin-row" data-fidx="' + i + '">' +
        '<div class="post-admin-row__main">' +
          '<div class="post-admin-row__title">' +
            '<i>' + esc(f.icon || '✨') + '</i>' +
            '<span>' + esc(f.title) + '</span>' +
            (inner ? '<span class="post-admin-row__badge">站内</span>' : '') +
          '</div>' +
          '<div class="post-admin-row__meta">' + esc(f.date || '未标日期') +
            (tags ? ' · ' + esc(tags) : '') +
            (f.desc ? ' · ' + esc(f.desc.slice(0, 42)) + (f.desc.length > 42 ? '…' : '') : '') +
          '</div>' +
        '</div>' +
        '<div class="post-admin-row__ops">' +
          '<button type="button" data-feed-op="edit">编辑</button>' +
          '<button type="button" data-feed-op="view">查看</button>' +
          '<button type="button" data-feed-op="del" class="is-danger">删除</button>' +
        '</div>' +
      '</div>';
  }

  function feedListHtml() {
    var list = Store.feedAll();
    var q = norm(feedQuery);
    /* 保留原数组下标：编辑靠它定位，不能因为筛选就错位 */
    var hits = [];
    list.forEach(function (f, i) {
      if (q) {
        var hay = norm(f.title + f.desc + f.url + (f.tags || []).join(''));
        if (hay.indexOf(q) < 0) return;
      }
      hits.push({ f: f, i: i });
    });
    var cells = (feedEditing && feedEditing.isNew) ? feedCellHtml(null, -1) : '';
    cells += hits.map(function (x) { return feedCellHtml(x.f, x.i); }).join('');
    if (!cells) {
      return list.length
        ? '<p class="admin-empty">没有匹配「' + esc(feedQuery) + '」的分享。</p>'
        : '<p class="admin-empty">还没有分享条目。点上面的「＋ 新增分享」，或者到「备份」页恢复默认数据。</p>';
    }
    return '<div class="feed-admin-list">' + cells + '</div>';
  }

  /* 预览用的是一张真卡片（和前台同一套 .feed-card 样式，只是换成 div 防止误点跳走） */
  function feedPreviewHtml(f) {
    var inner = String(f.url || '').charAt(0) === '#';
    var tags = (f.tags || []).map(function (t) {
      return '<span class="tag">#' + esc(t) + '</span>';
    }).join('');
    return '<div class="feed-card">' +
        '<span class="feed-card__body">' +
          '<span class="feed-card__title">' + esc(f.title || '标题会显示在这里') +
            (inner || !f.url ? '' : ' ↗') + '</span>' +
          '<p class="feed-card__desc">' + esc(f.desc || '描述会显示在这里，写一两句就够了。') + '</p>' +
          '<span class="feed-card__tags">' + tags + '</span>' +
        '</span>' +
      '</div>';
  }

  /* 编辑表单：原来是一张独立的卡片（点了「编辑」要跑到页面顶上去），
     v129 起就长在那一行里面 —— 就地展开、就地收起。 */
  function feedFormHtml(f, isNew) {
    if (!f) f = { date: todayStr(), icon: '✨', title: '', url: '', desc: '', tags: [] };
    return '<div class="feed-form">' +
        '<div class="feed-form__head">' +
          '<b>' + (isNew ? '＋ 新增分享' : '✎ 正在编辑') + '</b>' +
          (isNew ? '' : '<span class="feed-form__name">' + esc(f.title || '未命名') + '</span>') +
          '<span class="feed-form__date">' + esc(f.date || '') + '</span>' +
        '</div>' +
        '<div class="post-editor">' +
          '<div class="post-editor__grid">' +
            '<div>' +
              '<label class="admin-field"><span class="admin-field__label">标题</span>' +
                '<input type="text" data-ff="title" value="' + esc(f.title) + '" ' +
                  'placeholder="这条分享讲什么，一句话" maxlength="120" /></label>' +
              '<label class="admin-field"><span class="admin-field__label">链接<em>站内页面写 #/nav 这种</em></span>' +
                '<input type="text" data-ff="url" value="' + esc(f.url) + '" spellcheck="false" ' +
                  'placeholder="https://example.com 或 #/nav" /></label>' +
              '<label class="admin-field"><span class="admin-field__label">描述<em>一两句话</em></span>' +
                '<textarea data-ff="desc" rows="4" placeholder="它是什么、好在哪，随手写两句">' + esc(f.desc) + '</textarea></label>' +
            '</div>' +
            '<div>' +
              '<label class="admin-field"><span class="admin-field__label">日期</span>' +
                '<input type="date" data-ff="date" value="' + esc(f.date) + '" /></label>' +
              '<label class="admin-field"><span class="admin-field__label">图标<em>卡片上不显示了，用在今日精选和搜索结果里</em></span>' +
                '<span class="alink-icon">' +
                  '<input data-ff="icon" value="' + esc(f.icon) + '" maxlength="4" placeholder="✨" aria-label="图标" />' +
                  '<button class="alink-icon__pick" type="button" id="feedEmoji" title="挑一个 emoji" aria-label="挑选图标">🙂</button>' +
                '</span></label>' +
              '<label class="admin-field"><span class="admin-field__label">标签<em>逗号分隔</em></span>' +
                '<input type="text" data-ff="tags" value="' + esc((f.tags || []).join(', ')) +
                  '" placeholder="工具, 设计" /></label>' +
            '</div>' +
          '</div>' +
          '<div class="post-editor__bar">' +
            '<button class="btn btn--primary" type="button" id="feedSave">💾 保存</button>' +
            '<button class="btn btn--ghost" type="button" id="feedCancel">取消</button>' +
            '<span class="post-editor__count">前台卡片效果 ↓</span>' +
          '</div>' +
          '<div class="post-editor__preview feed-preview" id="feedPreview">' + feedPreviewHtml(f) + '</div>' +
        '</div>' +
      '</div>';
  }

  function feedPanel() {
    var list = Store.feedAll();
    var days = {};
    list.forEach(function (f) { if (f.date) days[f.date] = 1; });
    return '<div class="admin-card">' +
        '<div class="admin-card__head">' +
          '<div><h2>分享</h2>' +
            '<p>前台「分享」页的时间线内容，按日期倒序分组显示，改完立刻生效。' +
              '这里的条目<b>全部列出来</b>，点「编辑」就在那一行原地展开。</p></div>' +
          '<span class="admin-count">' + list.length + ' 条 · ' + Object.keys(days).length + ' 个记录日</span>' +
        '</div>' +
        '<div class="admin-toolbar">' +
          '<button class="btn btn--primary" type="button" id="feedNew">＋ 新增分享</button>' +
          '<div class="admin-search">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>' +
            '<input type="search" id="feedSearch" placeholder="搜标题 / 描述 / 标签 / 链接…" value="' + esc(feedQuery) + '" autocomplete="off" aria-label="搜索分享" />' +
          '</div>' +
        '</div>' +
        '<div id="feedListBox">' + feedListHtml() + '</div>' +
        '<p class="admin-tip">' +
          '<b>链接</b>可以填站外网址，也可以填站内页面（<code>#/nav</code>、<code>#/post</code>、<code>#/post/文章id</code>）；' +
          '站内链接不会新开窗口。<b>标签</b>用逗号分隔，会变成分享页顶部的筛选胶囊。' +
        '</p>' +
        '<p class="admin-tip">分享条目和别的后台数据一样只存在<b>这台浏览器</b>里。想让所有访客都看到，' +
          '到「备份」页导出，或者把内容写进 <code>assets/js/data.js</code> 的 <code>feed</code>。</p>' +
      '</div>';
  }

  function collectFeedForm(body) {
    var g = function (k) {
      var el = body.querySelector('[data-ff="' + k + '"]');
      return el ? el.value : '';
    };
    var tags = g('tags').split(/[,，、;；\s]+/)
      .map(function (t) { return t.trim().replace(/^#/, ''); })
      .filter(Boolean);
    return {
      date: g('date') || todayStr(),
      icon: g('icon').trim().slice(0, 4) || '✨',
      title: g('title').trim(),
      url: g('url').trim(),
      desc: g('desc').trim(),
      tags: tags.filter(function (t, i, a) { return a.indexOf(t) === i; }).slice(0, 6)
    };
  }

  function saveFeed(root, body) {
    var data = collectFeedForm(body);
    if (!data.title) { toast('先写个标题吧'); return; }
    if (!data.url) { toast('还差一个链接（站内可以写 #/nav）'); return; }
    var list = Store.feedAll();
    if (feedEditing && !feedEditing.isNew && list[feedEditing.idx]) list[feedEditing.idx] = data;
    else list.unshift(data);
    if (Store.setFeed(list) === false) {
      toast('浏览器存不下了（localStorage 满了），先导出备份再删点旧内容');
      return;
    }
    feedEditing = null;
    toast('已保存 ✦ 前台「分享」页马上能看到');
    refreshBody(root);
  }

  function refreshFeedList(root) {
    var box = root.querySelector('#feedListBox');
    if (box) box.innerHTML = feedListHtml();
    syncSide(root);
  }

  function bindFeed(root, body) {
    /* 打开（或关闭）某一行的编辑器：重绘之后把那一格滚到眼前、光标落到标题上。
       不这么做的话，点到下面几百条里的某一条时，一重绘人就不知道编辑框在哪了。 */
    function focusEditor() {
      var cell = root.querySelector('.feed-admin-list .post-admin-row.is-open');
      if (cell) {
        try { cell.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        catch (e) { try { cell.scrollIntoView(); } catch (e2) {} }
      }
      var t = root.querySelector('[data-ff="title"]');
      if (t) { try { t.focus({ preventScroll: true }); } catch (e3) { t.focus(); } }
    }

    var newBtn = body.querySelector('#feedNew');
    if (newBtn) newBtn.addEventListener('click', function () {
      feedEditing = { idx: -1, isNew: true };
      feedQuery = '';
      refreshBody(root);
      focusEditor();
    });

    var search = body.querySelector('#feedSearch');
    if (search) search.addEventListener('input', function () {
      feedQuery = search.value;
      refreshFeedList(root);
    });

    var listBox = body.querySelector('#feedListBox');
    if (listBox) listBox.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-feed-op]');
      if (!btn) return;
      var row = btn.closest('[data-fidx]');
      var idx = row ? +row.getAttribute('data-fidx') : -1;
      var op = btn.getAttribute('data-feed-op');
      if (idx < 0) return;

      if (op === 'edit') {
        feedEditing = { idx: idx, isNew: false };
        refreshBody(root);
        focusEditor();
        return;
      }
      if (op === 'view') {
        if (app().go) app().go('share');
        return;
      }
      if (op === 'del') {
        if (!armedNow('feed', idx, -1)) {
          arm('feed', idx, -1);
          toast('再点一次确认删除');
          btn.textContent = '确认删除？';
          return;
        }
        armed = null;
        var list = Store.feedAll();
        list.splice(idx, 1);
        Store.setFeed(list);
        if (feedEditing && feedEditing.idx === idx) feedEditing = null;
        toast('已删除');
        refreshBody(root);
      }
    });

    var saveBtn = body.querySelector('#feedSave');
    if (!saveBtn) return;
    var pvBox = body.querySelector('#feedPreview');
    var iconInput = body.querySelector('[data-ff="icon"]');
    var pickBtn = body.querySelector('#feedEmoji');

    /* 边打字边更新预览 */
    var repaint = debounce(function () {
      if (pvBox) pvBox.innerHTML = feedPreviewHtml(collectFeedForm(body));
    }, 180);
    body.querySelectorAll('[data-ff]').forEach(function (el) {
      el.addEventListener('input', repaint);
      el.addEventListener('change', repaint);
    });

    if (pickBtn && iconInput) pickBtn.addEventListener('click', function () {
      openEmoji(pickBtn, function (em) {
        iconInput.value = em;
        repaint();
      });
    });

    saveBtn.addEventListener('click', function () { saveFeed(root, body); });

    var cancelBtn = body.querySelector('#feedCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function () {
      feedEditing = null;
      refreshBody(root);
    });
  }

  /* ======================= 主题 & 阅读 ======================= */
  var ACCENT_LABELS = {
    aurora: '极光', ocean: '海洋', sunset: '落日', forest: '森林',
    grape: '葡萄', sakura: '樱粉', ink: '墨灰'
  };
  var READ_LINES = [[1.6, '紧凑 · 1.6'], [1.75, '标准 · 1.75'], [1.95, '舒展 · 1.95'], [2.1, '宽松 · 2.1']];
  var READ_WIDTHS = [[680, '窄 · 680'], [760, '偏窄 · 760'], [820, '标准 · 820'], [900, '偏宽 · 900'], [980, '宽 · 980']];

  /* 当前配色叫什么：预设色板 → 名字；自定义 → 命中「我的配色」就显示那套的名字 */
  function accentDisplayName(t) {
    t = t || {};
    if (t.accent !== 'custom') return ACCENT_LABELS[t.accent] || t.accent || '自定义';
    var list = Store.presets();
    for (var i = 0; i < list.length; i++) if (list[i].color === t.accentColor) return list[i].name;
    return '自定义';
  }
  /* 一个主色 → 三色渐变（借前台那套色相推算，保证小圆点和真实配色一致） */
  function presetTrio(color) {
    var fn = app().trioFor;
    if (typeof fn === 'function') {
      try { return fn({ accent: 'custom', accentColor: color }); } catch (e) {}
    }
    return [color, color, color];
  }

  function lookPanel() {
    var c = Store.get();
    var t = c.theme, r = c.read;
    var accents = app().accents || {};
    var ids = (Store.ACCENTS || Object.keys(ACCENT_LABELS)).filter(function (id) { return id !== 'custom'; });

    var swatches = ids.map(function (id) {
      var trio = accents[id] || ['#7c9cff', '#b47cff', '#4fe3d0'];
      return '<button class="look-swatch' + (t.accent === id ? ' is-active' : '') + '" type="button"' +
          ' data-accent="' + id + '" title="' + esc(ACCENT_LABELS[id] || id) + '">' +
          '<span class="look-swatch__dot" style="background:linear-gradient(135deg,' + trio.join(',') + ')"></span>' +
          '<span class="look-swatch__name">' + esc(ACCENT_LABELS[id] || id) + '</span>' +
        '</button>';
    }).join('');

    /* 我的配色：自己存过的几套，点一下就切回去 */
    var presets = Store.presets();
    var isCustom = t.accent === 'custom';
    var curColor = String(t.accentColor || '').toLowerCase();

    var presetHtml = presets.map(function (p) {
      var trio = presetTrio(p.color);
      var on = isCustom && p.color === curColor;
      if (presetRenaming === p.id) {
        return '<div class="look-preset is-editing">' +
            '<span class="look-preset__dot" style="background:linear-gradient(135deg,' + trio.join(',') + ')"></span>' +
            '<input class="look-preset__input" type="text" maxlength="12" value="' + esc(p.name) + '"' +
              ' data-ren-input="' + esc(p.id) + '" aria-label="配色名称" />' +
          '</div>';
      }
      return '<div class="look-preset' + (on ? ' is-active' : '') + '" data-preset="' + esc(p.id) + '">' +
          '<button class="look-preset__main" type="button" data-apply="' + esc(p.id) + '"' +
            ' title="切到「' + esc(p.name) + '」 ' + esc(p.color) + '">' +
            '<span class="look-preset__dot" style="background:linear-gradient(135deg,' + trio.join(',') + ')"></span>' +
            '<span class="look-preset__name">' + esc(p.name) + '</span>' +
            '<code>' + esc(p.color) + '</code>' +
          '</button>' +
          '<button class="look-preset__act" type="button" data-ren="' + esc(p.id) + '" title="改名" aria-label="改名">✎</button>' +
          '<button class="look-preset__act look-preset__act--del" type="button" data-del="' + esc(p.id) + '" title="删除" aria-label="删除">×</button>' +
        '</div>';
    }).join('');

    var full = presets.length >= (Store.MAX_PRESETS || 8);

    var presetBox = '<div class="look-sub">' +
        '<b>我的配色</b><em>' +
          (presets.length ? '点一下就切回去 · ✎ 改名 · × 删除（最多 ' + (Store.MAX_PRESETS || 8) + ' 套）'
                          : '调好上面的颜色，点「＋ 存为配色」就会存在这里')
        + '</em></div>' +
      (presets.length
        ? '<div class="look-presets" id="lookPresets">' + presetHtml + '</div>'
        : '<div class="look-presets is-empty" id="lookPresets"><p class="look-empty">还没有存过配色。</p></div>');

    var sizeOpts = [14, 15, 16, 17, 18, 20];

    return '<div class="admin-card">' +
        '<div class="admin-card__head">' +
          '<div><h2>配色主题</h2>' +
            '<p>换一组强调色，全站的渐变、按钮、高光、背景极光会一起变，改完立刻生效。</p></div>' +
          '<span class="admin-count" id="lookAccentName">' + esc(accentDisplayName(t)) + '</span>' +
        '</div>' +
        '<div class="look-swatches" id="lookSwatches">' + swatches + '</div>' +
        '<div class="look-color' + (isCustom ? ' is-active' : '') + '">' +
          '<input type="color" data-theme-f="accentColor" value="' + esc(t.accentColor) + '" aria-label="自定义主色" />' +
          '<div class="look-color__txt"><b>自定义主色</b>' +
            '<em>点左边的色块挑，或右边直接敲色值</em></div>' +
          '<div class="look-color__side">' +
            /* 直接敲色值：支持 #ff1d55 / ff1d55 / #f15，回车或失焦生效 */
            '<label class="look-hex" title="直接输入色值，比如 #ff1d55（也可以只敲 ff1d55 或 #f15）">' +
              '<span aria-hidden="true">HEX</span>' +
              '<input id="lookHexInput" type="text" inputmode="text" autocomplete="off" spellcheck="false"' +
                ' maxlength="7" placeholder="#ff1d55" aria-label="直接输入色值"' +
                ' value="' + esc(t.accentColor) + '" />' +
            '</label>' +
            '<button class="btn btn--ghost look-save" type="button" id="lookSavePreset"' +
              (full ? ' disabled title="已经存满 ' + (Store.MAX_PRESETS || 8) + ' 套了，先删一套再存"'
                    : ' title="把这个颜色存进「我的配色」"') +
              '>＋ 存为配色</button>' +
          '</div>' +
        '</div>' +
        presetBox +
        '<div class="admin-grid2">' +
          '<label class="admin-field"><span class="admin-field__label">背景极光<em>页面上那几团光晕</em></span>' +
            '<select data-theme-f="glow">' +
              '<option value="strong"' + (t.glow === 'strong' ? ' selected' : '') + '>强 · 气氛更足</option>' +
              '<option value="normal"' + (t.glow === 'normal' ? ' selected' : '') + '>标准</option>' +
              '<option value="off"' + (t.glow === 'off' ? ' selected' : '') + '>关掉 · 更干净</option>' +
            '</select></label>' +
          '<label class="admin-field"><span class="admin-field__label">圆角<em>卡片、按钮、输入框</em></span>' +
            '<select data-theme-f="radius">' +
              '<option value="small"' + (t.radius === 'small' ? ' selected' : '') + '>小 · 干练</option>' +
              '<option value="normal"' + (t.radius === 'normal' ? ' selected' : '') + '>标准</option>' +
              '<option value="large"' + (t.radius === 'large' ? ' selected' : '') + '>大 · 圆润</option>' +
            '</select></label>' +
        '</div>' +
        '<div class="admin-grid2">' +
          '<label class="admin-field"><span class="admin-field__label">默认主题<em>新访客进站时用哪个</em></span>' +
            '<select data-site="themeDefault">' +
              '<option value="dark"' + (c.themeDefault === 'dark' ? ' selected' : '') + '>暗色</option>' +
              '<option value="light"' + (c.themeDefault === 'light' ? ' selected' : '') + '>明亮</option>' +
            '</select></label>' +
          '<label class="admin-field"><span class="admin-field__label">卡片密度<em>导航页一行放几个站点</em></span>' +
            '<select data-site="cardDensity">' +
              '<option value="compact"' + (c.cardDensity === 'compact' ? ' selected' : '') + '>紧凑 · 一屏装最多</option>' +
              '<option value="normal"' + (c.cardDensity !== 'compact' && c.cardDensity !== 'comfy' ? ' selected' : '') + '>标准</option>' +
              '<option value="comfy"' + (c.cardDensity === 'comfy' ? ' selected' : '') + '>宽松 · 描述更舒展</option>' +
            '</select></label>' +
        '</div>' +
        '<div class="admin-actions"><button class="btn btn--ghost" type="button" id="lookResetTheme">↺ 恢复默认外观</button></div>' +
      '</div>' +

      '<div class="admin-card">' +
        '<div class="admin-card__head">' +
          '<div><h2>阅读体验</h2>' +
            '<p>只影响文章正文（<code>#/post/…</code>）。字号、行高、字体、宽度都可以按你写的东西来调。</p></div>' +
          '<span class="admin-count" id="lookReadBadge">' + r.size + 'px · ' + (r.font === 'serif' ? '衬线' : '无衬线') + '</span>' +
        '</div>' +
        '<label class="admin-field"><span class="admin-field__label">正文字号<em>手机上会自动小半号</em>' +
          '<b class="look-num" id="lookSizeOut">' + r.size + ' px</b></span>' +
          '<input type="range" data-read-f="size" min="14" max="20" step="1" value="' + r.size + '" />' +
          '<span class="look-scale">' + sizeOpts.map(function (n) { return '<i>' + n + '</i>'; }).join('') + '</span>' +
        '</label>' +
        '<div class="admin-grid2">' +
          '<label class="admin-field"><span class="admin-field__label">行高<em>正文行与行的距离</em></span>' +
            '<select data-read-f="line">' + READ_LINES.map(function (p) {
              return '<option value="' + p[0] + '"' + (Math.abs(+r.line - p[0]) < 0.01 ? ' selected' : '') + '>' + p[1] + '</option>';
            }).join('') + '</select></label>' +
          '<label class="admin-field"><span class="admin-field__label">字体</span>' +
            '<select data-read-f="font">' +
              '<option value="sans"' + (r.font !== 'serif' ? ' selected' : '') + '>系统无衬线 · 清晰</option>' +
              '<option value="serif"' + (r.font === 'serif' ? ' selected' : '') + '>衬线 · 更像纸书</option>' +
            '</select></label>' +
        '</div>' +
        '<div class="admin-grid2">' +
          '<label class="admin-field"><span class="admin-field__label">正文宽度<em>一行的长短</em></span>' +
            '<select data-read-f="width">' + READ_WIDTHS.map(function (p) {
              return '<option value="' + p[0] + '"' + (+r.width === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
            }).join('') + '</select></label>' +
          '<div class="admin-field"><span class="admin-field__label">右侧目录<em>宽屏才显示</em></span>' +
            '<label class="admin-switch"><input type="checkbox" data-read-f="toc"' + (r.toc !== false ? ' checked' : '') + ' />' +
              '<span class="admin-switch__track"><span class="admin-switch__dot"></span></span>' +
              '<span class="admin-switch__text">显示本文目录（标题 ≥3 个时）</span></label></div>' +
        '</div>' +
        '<div class="look-preview">' +
          '<div class="look-paper">' +
            '<span class="look-paper__eyebrow">阅读效果预览</span>' +
            '<h3>壹号栈是怎么搭起来的</h3>' +
            '<p>这是一段示例正文。字号、行高、字体和宽度都会立刻反映在这里——上面调一下，下面马上变，不用保存也不用刷新。</p>' +
            '<p>写长文的时候，<b>行高</b>比字号更影响读起来累不累：中文大概 1.8–2.0 最舒服；<b>正文宽度</b>太宽眼睛要来回扫，太窄又频繁换行。</p>' +
            '<p><span class="tag">#随笔</span> <span class="tag">#建站</span></p>' +
          '</div>' +
        '</div>' +
        '<div class="admin-actions"><button class="btn btn--ghost" type="button" id="lookResetRead">↺ 恢复默认阅读设置</button></div>' +
      '</div>';
  }

  function bindLook(root, body) {
    /* 面板右上角那两个小标签跟着设置实时变，不用整块重绘 */
    function paintAccentName() {
      var el = body.querySelector('#lookAccentName');
      if (!el) return;
      el.textContent = accentDisplayName(Store.theme());
    }
    function paintReadBadge() {
      var el = body.querySelector('#lookReadBadge');
      if (!el) return;
      var r = Store.read();
      el.textContent = r.size + 'px · ' + (r.font === 'serif' ? '衬线' : '无衬线');
    }
    /* 选中的颜色如果正好是存过的某套，把那一套高亮起来 */
    function paintPresetActive(color) {
      var hit = Store.presetByColor(color);
      body.querySelectorAll('.look-preset').forEach(function (x) { x.classList.remove('is-active'); });
      if (!hit) return;
      var chip = body.querySelector('.look-preset[data-preset="' + hit.id + '"]');
      if (chip) chip.classList.add('is-active');
    }

    var sw = body.querySelector('#lookSwatches');
    if (sw) sw.addEventListener('click', function (e) {
      var b = e.target.closest('[data-accent]');
      if (!b) return;
      var id = b.getAttribute('data-accent');
      /* 顺手把「自定义主色」同步成这个色板的主色：
         这样紧接着点「存为配色」，存下的就是你眼下看到的颜色，不会存成上一次的旧色 */
      var main = (app().accents || {})[id];
      main = (main && main[0]) || Store.theme().accentColor;
      Store.setTheme({ accent: id, accentColor: main });
      toast('已切到「' + (ACCENT_LABELS[id] || id) + '」配色');
      refreshBody(root);
    });

    /* 改主色：色块点击和手敲色值走同一条路，两边互相同步 */
    var colorIn = body.querySelector('[data-theme-f="accentColor"]');
    var hexIn = body.querySelector('#lookHexInput');
    var hexBox = hexIn ? hexIn.closest('.look-hex') : null;

    /* 手敲的色值收拾成 #rrggbb：吃掉空格和多余 #，三位简写自动补全 */
    function normalHex(raw) {
      var s = String(raw == null ? '' : raw).trim().toLowerCase().replace(/[\s#]/g, '');
      if (/^[0-9a-f]{3}$/.test(s)) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
      return /^[0-9a-f]{6}$/.test(s) ? '#' + s : '';
    }
    /* 敲错了给个红字提示，不弹窗打断 */
    function markHex(bad) {
      if (hexBox) hexBox.classList.toggle('is-bad', !!bad);
    }
    function paintAccent(color, keepTyped) {
      color = normalHex(color);
      if (!color) return;                 // 半截色值不往配置里写，避免把主色冲成默认值
      Store.setTheme({ accent: 'custom', accentColor: color });
      if (colorIn && colorIn.value !== color) colorIn.value = color;
      if (hexIn && !keepTyped && hexIn.value.toLowerCase() !== color) hexIn.value = color;
      body.querySelectorAll('.look-swatch').forEach(function (x) { x.classList.remove('is-active'); });
      var row = colorIn ? colorIn.closest('.look-color') : body.querySelector('.look-color');
      if (row) row.classList.add('is-active');
      paintPresetActive(color);
      paintAccentName();
    }

    if (colorIn) {
      var onColor = debounce(function () {
        markHex(false);
        paintAccent(colorIn.value);
      }, 140);
      colorIn.addEventListener('input', onColor);
    }

    if (hexIn) {
      /* 敲满 6 位就跟着变，不用等回车。色值在调用时就定住，
         否则延迟期间又敲了半截，会拿半截值去写配置 */
      var liveHex = debounce(function (v) {
        paintAccent(v, true);
      }, 200);

      hexIn.addEventListener('input', function () {
        /* 只留下 # 和十六进制字符，别的一律挡掉（粘贴进来的也一起清） */
        var raw = hexIn.value.replace(/[^#0-9a-fA-F]/g, '');
        if (raw !== hexIn.value) hexIn.value = raw;
        var hex = normalHex(raw);
        /* 只敲 1~3 位不算敲错（三位是合法的简写），4~5 位才提示 */
        markHex(!hex && raw.replace(/#/g, '').length > 3);
        /* 只有敲满 6 位才实时生效：三位简写留到回车/失焦再应用，
           不然打 #ff1d55 的半路上会先闪一下 #ff1155 */
        if (hex && raw.replace(/#/g, '').length === 6) liveHex(hex);
      });

      hexIn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var hex = normalHex(hexIn.value);
          if (!hex) { markHex(true); toast('色值要 6 位十六进制，比如 #ff1d55'); return; }
          markHex(false);
          paintAccent(hex);
          toast('主色已换成 ' + hex);
          return;
        }
        /* 框里已经是完整的 7 位、又没选中任何东西时，直接敲新字符会顶掉旧的整段
           （不然 maxlength 会把它默默吞掉，看着像"打不进去"） */
        var printable = e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey;
        if (printable && hexIn.value.length >= 7 && hexIn.selectionStart === hexIn.selectionEnd) {
          hexIn.select();
        }
      });

      /* 失焦收尾：敲对了就应用并规整成 #rrggbb，没敲对就退回当前色 */
      hexIn.addEventListener('blur', function () {
        var hex = normalHex(hexIn.value);
        markHex(false);
        if (hex) paintAccent(hex);
        else hexIn.value = Store.theme().accentColor;
      });

      /* 点整块也能focus到输入框（HEX 标签那点地方别白占） */
      if (hexBox) hexBox.addEventListener('click', function (e) {
        if (e.target !== hexIn) hexIn.focus();
      });

      /* 一聚焦就全选：框里本来就有 7 位的旧色值，不选中的话新敲的字符会被 maxlength 挡掉 */
      hexIn.addEventListener('focus', function () { hexIn.select(); });
    }

    /* ---------- 我的配色 ---------- */
    var sv = body.querySelector('#lookSavePreset');
    if (sv) sv.addEventListener('click', function () {
      var hex = Store.theme().accentColor;
      var res = Store.addPreset('', hex);
      if (!res.ok) {
        if (res.code === 'dup') toast('这个颜色已经存过了：「' + res.preset.name + '」');
        else if (res.code === 'full') toast('最多存 ' + (Store.MAX_PRESETS || 8) + ' 套，先删一套再存');
        else toast('这个颜色存不了，换一个试试');
        return;
      }
      presetRenaming = '';
      toast('已存为「' + res.preset.name + '」 ' + res.preset.color);
      refreshBody(root);
    });

    var pbox = body.querySelector('#lookPresets');
    if (pbox) pbox.addEventListener('click', function (e) {
      /* 切到某一套 */
      var ap = e.target.closest('[data-apply]');
      if (ap) {
        var id = ap.getAttribute('data-apply');
        var after = Store.applyPreset(id);
        var one = Store.presetById(id);
        if (after && one) toast('已切到「' + one.name + '」 ' + one.color);
        refreshBody(root);
        return;
      }
      /* 改名：把名字变成一个输入框 */
      var rn = e.target.closest('[data-ren]');
      if (rn) {
        presetRenaming = rn.getAttribute('data-ren');
        refreshBody(root);
        return;
      }
      /* 删除（走确认框，删的只是这套配色，当前页面不会变色） */
      var dl = e.target.closest('[data-del]');
      if (dl) {
        var pid = dl.getAttribute('data-del');
        var p = Store.presetById(pid);
        if (!p) return;
        askConfirm({
          icon: '🗑️',
          title: '删掉「' + p.name + '」？',
          desc: '只是把这套颜色从「我的配色」里移走，<b>当前页面的颜色不会变</b>。',
          ok: '删除'
        }, function () {
          Store.removePreset(pid);
          if (presetRenaming === pid) presetRenaming = '';
          toast('已删除「' + p.name + '」');
          refreshBody(root);
        });
        return;
      }
    });

    /* 改名输入框：回车 / 失焦保存，Esc 放弃 */
    var ren = body.querySelector('[data-ren-input]');
    if (ren) {
      var renId = ren.getAttribute('data-ren-input');
      var done = false;
      function commitRename(keep) {
        if (done) return;
        done = true;
        var v = ren.value;
        presetRenaming = '';
        if (keep) Store.renamePreset(renId, v);
        refreshBody(root);
      }
      ren.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); commitRename(true); }
        else if (e.key === 'Escape') { e.preventDefault(); commitRename(false); }
      });
      ren.addEventListener('blur', function () { commitRename(true); });
      setTimeout(function () { try { ren.focus(); ren.select(); } catch (e) {} }, 20);
    }

    body.querySelectorAll('select[data-theme-f]').forEach(function (el) {
      el.addEventListener('change', function () {
        var patch = {};
        patch[el.getAttribute('data-theme-f')] = el.value;
        Store.setTheme(patch);
      });
    });

    var sizeEl = body.querySelector('[data-read-f="size"]');
    var sizeOut = body.querySelector('#lookSizeOut');
    if (sizeEl) {
      var onSize = debounce(function () {
        Store.setRead({ size: +sizeEl.value });
        if (sizeOut) sizeOut.textContent = sizeEl.value + ' px';
        paintReadBadge();
      }, 120);
      sizeEl.addEventListener('input', onSize);
    }

    body.querySelectorAll('select[data-read-f]').forEach(function (el) {
      el.addEventListener('change', function () {
        var key = el.getAttribute('data-read-f');
        var patch = {};
        patch[key] = (key === 'line' || key === 'width') ? parseFloat(el.value) : el.value;
        Store.setRead(patch);
        paintReadBadge();
      });
    });

    var tocEl = body.querySelector('input[data-read-f="toc"]');
    if (tocEl) tocEl.addEventListener('change', function () {
      Store.setRead({ toc: tocEl.checked });
    });

    var rt = body.querySelector('#lookResetTheme');
    if (rt) rt.addEventListener('click', function () {
      /* 只把「当前用的外观」回默认；「我的配色」是存货，不跟着清掉 */
      var d = Store.DEFAULTS.theme;
      Store.setTheme({ accent: d.accent, accentColor: d.accentColor, glow: d.glow, radius: d.radius });
      Store.set({ themeDefault: Store.DEFAULTS.themeDefault, cardDensity: Store.DEFAULTS.cardDensity });
      presetRenaming = '';
      toast(Store.presets().length ? '已恢复默认外观（我的配色还留着）' : '已恢复默认外观');
      refreshBody(root);
    });

    var rr = body.querySelector('#lookResetRead');
    if (rr) rr.addEventListener('click', function () {
      Store.setRead(Store.DEFAULTS.read);
      toast('已恢复默认阅读设置');
      refreshBody(root);
    });
  }

  /* ======================= 站点信息 ======================= */
  function sitePanel() {
    var c = Store.get();
    return '<div class="admin-card">' +
        '<h2>站点信息</h2>' +
        field('站点名称', 'siteName', c.siteName, '显示在顶栏 Logo 与页脚') +
        field('拉丁名', 'siteLatin', c.siteLatin, 'Logo 下方的小字') +
        field('标语', 'tagline', c.tagline, '页脚与页面描述') +
        '<label class="admin-field"><span class="admin-field__label">建站日期<em>首页「成长天数」从这天开始数</em></span>' +
          '<input type="date" data-site="startDate" value="' + esc(c.startDate) + '" /></label>' +
      '</div>' +
      '<div class="admin-card">' +
        '<h2>顶栏 Logo</h2>' +
        '<p>默认是那颗内置的渐变色星星。想换成自己的图标就上传一张，' +
        '<b>建议用正方形、背景透明或深色的 PNG</b>，显示效果最好。</p>' +
        imgPicker({ scope: 'site', key: 'logoImage', val: c.logoImage,
                    none: '内置星形图标' }) +
      '</div>' +
      '<div class="admin-card">' +
        '<h2>浏览器标签图标 Favicon</h2>' +
        '<p>显示在浏览器标签页、书签栏和收藏夹里。<b>建议用 64×64 的方形图标</b>（PNG / SVG / ICO 都行）。</p>' +
        imgPicker({ scope: 'site', key: 'favicon', val: c.favicon,
                    none: '内置图标' }) +
        '<p class="admin-tip">换了之后如果标签页没变，是浏览器在缓存，关掉标签页重新打开就好。</p>' +
      '</div>' +
      '<div class="admin-card">' +
        '<h2>显示项</h2>' +
        '<label class="admin-switch"><input type="checkbox" data-site="showSearch"' + (c.showSearch ? ' checked' : '') + ' />' +
          '<span class="admin-switch__track"><span class="admin-switch__dot"></span></span>' +
          '<span class="admin-switch__text">顶栏显示搜索框</span></label>' +
        '<p class="admin-sub">导航页的卡片长什么样（三项默认都关，只留名字最清爽）</p>' +
        '<label class="admin-switch"><input type="checkbox" data-site="showIcons"' + (c.showIcons ? ' checked' : '') + ' />' +
          '<span class="admin-switch__track"><span class="admin-switch__dot"></span></span>' +
          '<span class="admin-switch__text">卡片显示图标<em>名字左边那个彩色方块</em></span></label>' +
        '<label class="admin-switch"><input type="checkbox" data-site="showDesc"' + (c.showDesc ? ' checked' : '') + ' />' +
          '<span class="admin-switch__track"><span class="admin-switch__dot"></span></span>' +
          '<span class="admin-switch__text">卡片显示介绍<em>名字下面那行域名</em></span></label>' +
        '<label class="admin-switch"><input type="checkbox" data-site="showCatIcon"' + (c.showCatIcon ? ' checked' : '') + ' />' +
          '<span class="admin-switch__track"><span class="admin-switch__dot"></span></span>' +
          '<span class="admin-switch__text">分类显示图标<em>🎨 设计天才 前面那个 emoji</em></span></label>' +
        '<p class="admin-tip">这三项<b>默认全关</b>，导航页只有名字，一行能看更多站点。' +
        '开了「图标」在电脑端会多出一个彩色方块（手机端卡片是上下结构，本来就只放名称和介绍）；' +
        '「介绍」是后台里每个站点填的简介，没填就显示域名；' +
        '<b>手机端也照这个开关走</b>，关掉之后窄屏上同样只有名字。</p>' +
      '</div>';
  }

  function field(label, key, val, hint) {
    return '<label class="admin-field"><span class="admin-field__label">' + esc(label) +
      (hint ? '<em>' + esc(hint) + '</em>' : '') + '</span>' +
      '<input type="text" data-site="' + key + '" value="' + esc(val) + '" /></label>';
  }

  /* ======================= 首页内容 ======================= */
  var AUTO_LABELS = [
    ['cats',  '自动：分类数量'],
    ['links', '自动：站点数量'],
    ['feed',  '自动：分享条数'],
    ['posts', '自动：文章篇数'],
    ['days',  '自动：成长天数']
  ];

  function cloneObj(o) { return JSON.parse(JSON.stringify(o)); }

  function parseList(s) {
    return String(s || '').split(/[，,、\s]+/).map(function (x) { return x.trim(); })
      .filter(Boolean).slice(0, 6);
  }

  function hfield(label, key, val, hint) {
    return '<label class="admin-field"><span class="admin-field__label">' + esc(label) +
      (hint ? '<em>' + esc(hint) + '</em>' : '') + '</span>' +
      '<input type="text" data-home="' + key + '" value="' + esc(val) + '" /></label>';
  }
  /* 关于页那几个字段：同一套样式，只是 data- 前缀换成 about */
  function afield(label, key, val, hint) {
    return '<label class="admin-field"><span class="admin-field__label">' + esc(label) +
      (hint ? '<em>' + esc(hint) + '</em>' : '') + '</span>' +
      '<input type="text" data-about="' + key + '" value="' + esc(val) + '" /></label>';
  }

  function imgPreviewInner(val, noneText) {
    if (val) return '<img src="' + esc(val) + '" alt="" />';
    return '<span class="img-preview__none">' + esc(noneText) + '</span>';
  }

  /* 通用的图片选择器：上传 / 填网址 / 用回默认 */
  function imgPicker(o) {
    var val = o.val || '';
    var has = !!val;
    var isData = has && val.indexOf('data:') === 0;
    var scopeAttr = 'data-' + o.scope + '="' + o.key + '"';
    return '<div class="img-picker' + (o.wide ? ' img-picker--wide' : '') + '">' +
        '<div class="img-preview' + (o.wide ? ' img-preview--wide' : '') + '"' +
          ' data-img-preview="' + o.key + '" data-img-none="' + esc(o.none) + '">' +
          imgPreviewInner(val, o.none) +
        '</div>' +
        '<div class="img-body">' +
          '<div class="admin-actions">' +
            '<button class="btn btn--primary" type="button" data-img-pick="' + o.key + '" data-img-scope="' + o.scope + '">📁 上传图片</button>' +
            '<button class="btn btn--ghost" type="button" data-img-clear="' + o.key + '" data-img-scope="' + o.scope + '"' +
              (has ? '' : ' disabled') + '>↺ 用回默认</button>' +
          '</div>' +
          '<label class="admin-field"><span class="admin-field__label">或者填图片网址<em>' +
            (isData ? '当前用的是上传的图片，这里可以留空' : '网络图片地址，填完立刻生效') + '</em></span>' +
            '<input type="text" ' + scopeAttr + ' value="' + (isData ? '' : esc(val)) + '" placeholder="https://…" /></label>' +
          (o.fit ? '<label class="admin-field"><span class="admin-field__label">填充方式</span>' +
            '<select data-' + o.scope + '="' + o.key + 'Fit">' +
              '<option value="cover"' + (o.fitVal === 'cover' ? ' selected' : '') + '>铺满（裁掉多余部分）</option>' +
              '<option value="contain"' + (o.fitVal === 'contain' ? ' selected' : '') + '>完整显示（留白）</option>' +
            '</select></label>' : '') +
          '<input type="file" accept="image/*" hidden data-img-file="' + o.key + '" data-img-scope="' + o.scope + '" />' +
        '</div>' +
      '</div>';
  }

  function statRow(t, i) {
    var auto = t.auto || '';
    return '<div class="srow" data-si="' + i + '" data-drag-item="' + i + '">' +
        grip() +
        '<select data-stat-f="auto" aria-label="数值来源">' +
          '<option value=""' + (auto ? '' : ' selected') + '>我自己填数字</option>' +
          AUTO_LABELS.map(function (a) {
            return '<option value="' + a[0] + '"' + (auto === a[0] ? ' selected' : '') + '>' + a[1] + '</option>';
          }).join('') +
        '</select>' +
        '<input data-stat-f="n" value="' + esc(t.n) + '" placeholder="数字"' + (auto ? ' disabled' : '') + ' aria-label="数字" />' +
        '<input data-stat-f="s" value="' + esc(t.s) + '" placeholder="说明文字（如 主题分类）" aria-label="说明文字" />' +
        '<span class="admin-link__ops">' +
          '<button type="button" data-stat-op="del" data-si="' + i + '" class="is-danger" title="删除">✕</button>' +
        '</span>' +
      '</div>';
  }

  function entryRow(e, i) {
    return '<div class="erow" data-ei="' + i + '" data-drag-item="' + i + '">' +
        grip() +
        '<input data-entry-f="icon" value="' + esc(e.icon) + '" maxlength="4" placeholder="🌌" aria-label="图标" />' +
        '<input data-entry-f="title" value="' + esc(e.title) + '" placeholder="卡片标题" aria-label="标题" />' +
        '<input data-entry-f="desc" value="' + esc(e.desc) + '" placeholder="一句话描述" aria-label="描述" />' +
        '<input data-entry-f="route" value="' + esc(e.route) + '" placeholder="#/nav 或 https://…" spellcheck="false" aria-label="跳转地址" />' +
        '<label class="erow__spark" title="在卡片角落加一点星光">' +
          '<input type="checkbox" data-entry-f="spark"' + (e.spark ? ' checked' : '') + ' />星光</label>' +
        '<span class="admin-link__ops">' +
          '<button type="button" data-entry-op="del" data-ei="' + i + '" class="is-danger" title="删除">✕</button>' +
        '</span>' +
      '</div>';
  }

  /* 一张收款码：左边预览，右边「名字 / 跳转 / 图片网址」三行。
     图片可以上传（压到 480px）也可以直接填网址；上传过的行，网址框故意留空。 */
  function codeRow(c, i) {
    c = c || {};
    var has = !!c.src;
    var isData = has && c.src.indexOf('data:') === 0;
    return '<div class="coderow" data-ci="' + i + '">' +
        '<div class="coderow__prev" data-code-preview="' + i + '">' +
          (has ? '<img src="' + esc(c.src) + '" alt="" />' : '<span>未放图</span>') +
        '</div>' +
        '<div class="coderow__body">' +
          '<div class="coderow__line">' +
            '<input type="text" data-code-f="label" value="' + esc(c.label) + '" maxlength="12"' +
              ' placeholder="名字：支付宝 / 微信 / 云闪付" aria-label="收款码名称" />' +
            '<button class="btn btn--ghost btn--mini" type="button" data-code-pick="' + i + '">📁 上传</button>' +
            '<button class="btn btn--ghost btn--mini" type="button" data-code-clear="' + i + '"' +
              (has ? '' : ' disabled') + '>↺ 清除</button>' +
            '<button class="coderow__del" type="button" data-code-del="' + i + '" title="删掉这张">✕</button>' +
          '</div>' +
          '<input type="text" data-code-f="link" value="' + esc(c.link) + '" spellcheck="false"' +
            ' placeholder="点击跳转（可选）：https://… 或 #/nav" aria-label="点击跳转地址" />' +
          '<input type="text" data-code-f="src" value="' + (isData ? '' : esc(c.src)) + '" spellcheck="false"' +
            ' placeholder="' + (isData ? '当前用的是上传的图片' : '或者填图片网址 https://…') + '" aria-label="图片网址" />' +
          '<input type="file" accept="image/*" hidden data-code-file="' + i + '" />' +
        '</div>' +
      '</div>';
  }

  /* 「今日精选」勾选列表：把「分享」里的条目全摆出来，勾上哪条首页就显示哪条。
     v129 起不再只铺前 80 行 —— 后台列表就该是数据的全部，藏起来反而像丢了内容。
     一行就是四个 span，比分享列表还轻，六百多行一次铺开没压力。 */
  var picksQuery = '';

  function picksRowsHtml(h) {
    var list = Store.feedAll();
    var picked = h.featuredPicks || [];
    var full = picked.length >= Store.MAX_FEATURED_PICKS;
    var q = norm(picksQuery);
    var hits = q ? list.filter(function (f) {
      return norm(f.title + ' ' + f.desc + ' ' + (f.tags || []).join('')).indexOf(q) > -1;
    }) : list;
    var rows = hits.map(function (f) {
      var key = Store.feedKey(f);
      var on = picked.indexOf(key) > -1;
      return '<label class="pick-row' + (on ? ' is-on' : '') + '">' +
          '<input type="checkbox" data-pick="' + esc(key) + '"' + (on ? ' checked' : '') +
            ((!on && full) ? ' disabled' : '') + ' />' +
          '<i class="pick-row__icon">' + esc(f.icon || '✨') + '</i>' +
          '<span class="pick-row__title">' + esc(f.title) + '</span>' +
          '<span class="pick-row__date">' + esc(f.date || '—') + '</span>' +
        '</label>';
    }).join('');
    if (!rows) {
      return '<p class="admin-empty">没有匹配「' + esc(picksQuery) + '」的条目。</p>';
    }
    return rows;
  }

  function picksListHtml(h) {
    var list = Store.feedAll();
    if (!list.length) {
      return '<p class="admin-empty">「分享」页还没有内容，先去加几条再回来挑。</p>';
    }
    var picked = h.featuredPicks || [];
    return '<div class="admin-search pick-search">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>' +
        '<input type="search" id="picksSearch" placeholder="搜标题 / 描述 / 标签…（共 ' + list.length + ' 条）"' +
          ' value="' + esc(picksQuery) + '" autocomplete="off" aria-label="搜索分享条目" />' +
      '</div>' +
      '<div class="pick-list" id="adminPicks">' + picksRowsHtml(h) + '</div>' +
      '<div class="admin-actions">' +
        '<button class="btn btn--ghost" type="button" id="adminPicksClear"' +
          (picked.length ? '' : ' disabled') + '>全不选（回到自动）</button>' +
        '<span class="admin-tip" style="margin-top:0">已勾 ' + picked.length + ' / ' +
          Store.MAX_FEATURED_PICKS + ' 条</span>' +
      '</div>';
  }

  function homePanel() {
    var h = Store.home();
    var a = Store.about();
    var stats = h.stats || [];
    var entries = h.entries || [];
    /* 收款码列表。老配置只有一张 sponsorImage 时，把它当成第一张显示出来，
       这样他第一次进这个面板就能直接改名 / 补链接，而不是看到一片空白。 */
    var codes = (h.sponsorCodes || []).slice();
    if (!codes.length && h.sponsorImage) {
      codes = [{ src: h.sponsorImage, label: '', link: h.sponsorLink || '' }];
    }

    return '<div class="admin-card">' +
        '<h2>首屏文字</h2>' +
        '<p>首页最上面那一屏。左边是文字，右边是图片。<b>改完切回首页即可看到</b>。</p>' +
        hfield('小标签', 'eyebrow', h.eyebrow, '主标题上方那行小字') +
        hfield('主标题第一行', 'titleTop', h.titleTop, '') +
        hfield('主标题第二行', 'titleMain', h.titleMain, '会用渐变色高亮') +
        hfield('描述前半句', 'descBefore', h.descBefore, '会接在「轮换词」前面') +
        hfield('描述后半句', 'descAfter', h.descAfter, '会接在「轮换词」后面') +
        '<label class="admin-field"><span class="admin-field__label">轮换词' +
          '<em>中间那个一直变换的词，用逗号分隔，最多 6 个</em></span>' +
          '<input type="text" data-home="rotator" value="' + esc((h.rotator || []).join('，')) + '" /></label>' +
      '</div>' +

      '<div class="admin-card">' +
        '<h2>首屏图片</h2>' +
        '<p>默认是一张内置的星轨插画。你可以<b>上传自己的照片</b>替换它，也可以填一个网络图片地址；' +
          '图片是长方形还是正方形、点了要不要跳转，都在下面设。</p>' +
        imgPicker({ scope: 'home', key: 'image', val: h.image, wide: true, fit: true, fitVal: h.imageFit,
                    none: '内置星轨插画' }) +
        '<label class="admin-field"><span class="admin-field__label">大图形状' +
          '<em>图片本身是长方形就选长方形 / 跟随原图，方图就选正方形</em></span>' +
          '<select data-home="imageShape">' +
            '<option value="square"' + (h.imageShape === 'square' ? ' selected' : '') + '>正方形（300px 见方）</option>' +
            '<option value="wide"' + (h.imageShape === 'wide' ? ' selected' : '') + '>长方形（铺满右栏，16:9）</option>' +
            '<option value="auto"' + (h.imageShape === 'auto' ? ' selected' : '') + '>跟随图片原始比例（完全不裁切）</option>' +
          '</select></label>' +
        hfield('点击跳转', 'imageLink', h.imageLink,
          '可选：点这张图跳到哪（站内写 #/nav，站外写完整网址）；留空 = 图不可点') +
        '<p class="admin-tip">上传的图片会自动压缩到 1100px 以内再保存，不会拖慢打开速度。' +
          '想换回插画，点「↺ 用回默认」。</p>' +
      '</div>' +

      '<div class="admin-card">' +
        '<h2>首屏按钮</h2>' +
        '<p>主按钮点进去开始逛；次按钮固定是「随机漫游」，点一下随机打开一个站点。</p>' +
        hfield('主按钮文字', 'cta1Text', h.cta1Text, '') +
        hfield('主按钮链接', 'cta1Url', h.cta1Url, '站内写 #/nav，站外写 https://…') +
        hfield('次按钮文字', 'cta2Text', h.cta2Text, '') +
        hfield('图片上的小徽章', 'badge', h.badge, '图片下方那颗胶囊，留空则不显示') +
      '</div>' +

      '<div class="admin-card">' +
        '<div class="admin-card__head">' +
          '<div><h2>数字统计</h2><p>首页那排大数字。选「自动」就会跟着数据实时变化，也可以自己填一个数字。</p></div>' +
          '<span class="admin-count">' + stats.length + ' / ' + Store.MAX_STATS + '</span>' +
        '</div>' +
        (stats.length ? '<div class="arows" id="adminStats" data-drag-box="stat">' +
          stats.map(function (t, i) { return statRow(t, i); }).join('') + '</div>'
          : '<p class="admin-empty">还没有统计项。</p>') +
        '<div class="admin-card__foot">' +
          '<button class="btn btn--ghost" type="button" id="adminAddStat"' +
            (stats.length >= Store.MAX_STATS ? ' disabled' : '') + '>＋ 添加一项</button>' +
        '</div>' +
      '</div>' +

      '<div class="admin-card">' +
        '<div class="admin-card__head">' +
          '<div><h2>快捷入口卡片</h2><p>首页中间那三张卡片。可以改文字、换图标、加一张或删一张。</p></div>' +
          '<span class="admin-count">' + entries.length + ' / ' + Store.MAX_ENTRIES + '</span>' +
        '</div>' +
        (entries.length ? '<div class="arows" id="adminEntries" data-drag-box="entry">' +
          entries.map(function (e, i) { return entryRow(e, i); }).join('') + '</div>'
          : '<p class="admin-empty">还没有卡片。</p>') +
        '<div class="admin-card__foot">' +
          '<button class="btn btn--ghost" type="button" id="adminAddEntry"' +
            (entries.length >= Store.MAX_ENTRIES ? ' disabled' : '') + '>＋ 添加卡片</button>' +
        '</div>' +
        '<p class="admin-tip">跳转地址支持站内 <code>#/nav</code>、<code>#/share</code>、<code>#/about</code>，也支持站外网址。' +
          '不通向站内的链接会自动在新标签页打开。</p>' +
      '</div>' +

      '<div class="admin-card">' +
        '<div class="admin-card__head">' +
          '<div><h2>今日精选</h2>' +
            '<p>首页最下面那条横向卡片。勾哪几条，首页就显示哪几条；一条都不勾 = 自动取「分享」里最新的几条。</p></div>' +
          '<span class="admin-count" id="picksCount">' +
            (h.featuredPicks.length ? h.featuredPicks.length + ' 条指定' : '自动') + '</span>' +
        '</div>' +
        hfield('标题', 'featuredTitle', h.featuredTitle, '') +
        hfield('副标题', 'featuredDesc', h.featuredDesc, '') +
        '<label class="admin-field"><span class="admin-field__label">自动时的条数<em>3 – 12，只在下面一条都没勾时生效</em></span>' +
          '<input type="number" min="3" max="12" data-home="featuredCount" value="' + h.featuredCount + '" /></label>' +
        '<div class="admin-sub">显示哪几条<em>顺序跟「分享」页一致，新的在前；删掉的条目会自动从首页消失</em></div>' +
        picksListHtml(h) +
      '</div>' +

      '<div class="admin-card">' +
        '<div class="admin-card__head">' +
          '<div><h2>关于这一页</h2>' +
            '<p>首页「关于壹号栈」那张卡片点进去就是它（<code>#/about</code>）。正文用 <b>Markdown</b>，' +
            '写法和「文章」页完全一样。</p></div>' +
          '<span class="admin-count">' + (a.md ? a.md.replace(/\s+/g, '').length + ' 字' : '内容为空') + '</span>' +
        '</div>' +
        afield('小标签', 'eyebrow', a.eyebrow, '标题上面那行小字') +
        afield('大标题', 'title', a.title, '') +
        '<label class="admin-field"><span class="admin-field__label">导语<em>标题下面那段稍大一点的介绍，一两句话</em></span>' +
          '<textarea rows="3" data-about="lede">' + esc(a.lede) + '</textarea></label>' +
        '<label class="admin-field"><span class="admin-field__label">更新日期<em>页面上显示「更新于 …」，格式 2026-10-24</em></span>' +
          '<input type="date" data-about="updated" value="' + esc(a.updated) + '" /></label>' +
        '<label class="admin-field"><span class="admin-field__label">正文' +
          '<em>Markdown：## 小标题、- 列表、&gt; 引用、| 表格 |、**粗体**</em></span>' +
          '<textarea class="admin-md" rows="16" spellcheck="false" data-about="md">' + esc(a.md) + '</textarea></label>' +
        '<div class="admin-actions">' +
          '<a class="btn btn--ghost" href="#/about" target="_blank" rel="noopener">↗ 打开这一页看看</a>' +
          '<button class="btn btn--ghost" type="button" id="adminAboutReset">↺ 恢复默认正文</button>' +
        '</div>' +
        '<p class="admin-tip">改完直接生效（本机）。要让所有访客看到，记得回「备份 → 发布到虚拟主机」重新导一次 ' +
          '<code>site-data.js</code>。</p>' +
      '</div>' +

      '<div class="admin-card">' +
        '<div class="admin-card__head">' +
          '<div><h2>赞助</h2>' +
            '<p>首页最下面那块小卡片。收款码可以放<b>好几张</b>（支付宝 / 微信 / 云闪付…），' +
            '一张一张排开；填了链接还会多一个「去支持」按钮。</p></div>' +
          '<span class="admin-count" id="spBadge">' + (h.sponsorOn ? '首页显示中' : '已隐藏') + '</span>' +
        '</div>' +
        '<label class="sn-check" style="margin-top:0">' +
          '<input type="checkbox" data-home="sponsorOn"' + (h.sponsorOn ? ' checked' : '') + ' />' +
          '<span>在首页显示赞助卡片（关掉就整块不出现）</span>' +
        '</label>' +
        hfield('标题', 'sponsorTitle', h.sponsorTitle, '') +
        '<label class="admin-field"><span class="admin-field__label">说明文字<em>最多 200 字，两句就够</em></span>' +
          '<textarea rows="3" data-home="sponsorDesc">' + esc(h.sponsorDesc) + '</textarea></label>' +
        hfield('小字备注', 'sponsorNote', h.sponsorNote, '图下面那行小字；留空就不显示') +
        hfield('链接', 'sponsorLink', h.sponsorLink, '可选：点「去支持」跳这里，留空就只显示图') +
        '<div class="admin-sub">收款码<em>最多 ' + Store.MAX_SPONSOR_CODES +
          ' 张，支付宝 / 微信 / 云闪付各放一张；每张都能单独配名字和跳转地址</em></div>' +
        (codes.length
          ? '<div class="coderows" id="adminCodes">' + codes.map(codeRow).join('') + '</div>'
          : '<p class="admin-empty">还没有收款码。</p>') +
        '<div class="admin-actions">' +
          '<button class="btn btn--ghost" type="button" id="adminAddCode"' +
            (codes.length >= Store.MAX_SPONSOR_CODES ? ' disabled' : '') + '>＋ 添加收款码</button>' +
        '</div>' +
        '<p class="admin-tip">建议放<b>收款码截图</b>（正方形最好看，上传会自动压到 480px 以内）。' +
          '名字留空就只显示图；跳转地址留空那张就不可点。一张都不放会显示一个 ☕。</p>' +
      '</div>' +

      '<div class="admin-card">' +
        '<h2>恢复首页默认</h2>' +
        '<p>上面所有改动都会回到最初的文案与排版（不影响站点数据、分享内容）。</p>' +
        '<div class="admin-actions">' +
          '<button class="btn btn--danger" type="button" id="adminResetHome">恢复首页默认内容</button>' +
        '</div>' +
      '</div>';
  }

  /* ======================= 备份 ======================= */
  /* ======================= 发布到虚拟主机 ======================= */
  /* 后台改的东西只躺在你这台浏览器的 localStorage 里。要让**所有访客**看到，
     就得把它「烤」成一个静态文件。这里烤的就是这一个：

       assets/js/site-data.js
         ├─ window.XY_PASS    口令校验值（只有你自己设过口令时才有）
         ├─ window.XY_CONFIG  站点设置 / 主题 / 首页文案 / 自定义链接 …
         └─ window.SITE_DATA  分类 · 站点 · 分享 · 文章

     它在 index.html 里排所有脚本的第一个，后面的 config.js / data.js
     看见「已经有了」就只做兜底。所以覆盖这一个文件，整站内容就整体换掉，
     不用再碰 index.html / data.js / config.js —— 对虚拟主机上传来说最省事。 */
  var SNAP_KEY = 'xingyu.export.v1';
  /* 导出时要不要把内嵌图片拆成独立文件（勾了就得自己把图片一起传上去） */
  var splitImgs = false;

  function nowText() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function snapRecord() {
    try { return JSON.parse(localStorage.getItem(SNAP_KEY)) || null; } catch (e) { return null; }
  }
  function snapSave(rec) {
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(rec)); } catch (e) {}
  }

  /* 便宜好用的字符串签名：内容一动，签名必变，用来判断「有没有没导出的改动」 */
  function snapSig(s) {
    var h = 5381, i = s.length;
    while (i) h = (h * 33 ^ s.charCodeAt(--i)) >>> 0;
    return h.toString(36) + '-' + s.length;
  }

  /* 把对象写成一行合法的 JS 字面量 */
  function jsLit(v) {
    return JSON.stringify(v)
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')
      .replace(/<\//g, '<\\/');
  }

  /* ---------- 内嵌图片：base64 → 真实文件 ----------
     后台上传的 Logo / Favicon / 首页大图都是塞在配置里的 data URL，
     一导出就是几百 KB 的文本。拆成独立文件后 site-data.js 能小一大圈，
     浏览器也省掉一次 base64 解码。 */
  var IMG_SLOTS = [
    { key: 'logoImage', file: 'logo',    label: '顶栏 Logo' },
    { key: 'favicon',   file: 'favicon', label: '浏览器标签图标' },
    { key: 'home',      file: 'home',    label: '首页大图', inHome: true }
  ];
  var IMG_EXT = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
    'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg'
  };

  function staticImageFiles(cfg) {
    var out = [];
    (cfg ? IMG_SLOTS : []).forEach(function (slot) {
      var v = slot.inHome
        ? String((cfg.home || {}).image || '')
        : String(cfg[slot.key] || '');
      var m = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(v);
      if (!m) return;
      var mime = m[1].toLowerCase();
      var b64 = m[2];
      var ext = IMG_EXT[mime] || 'png';
      out.push({
        slot: slot, mime: mime, ext: ext, b64: b64,
        name: slot.file + '.' + ext,
        rel: 'assets/img/' + slot.file + '.' + ext,
        bytes: Math.round(b64.length * 3 / 4)
      });
    });
    return out;
  }

  /* 把 base64 直接写成文件下载（不经过 data URL，避免大图被浏览器截断） */
  function saveImageFile(im) {
    try {
      var bin = atob(im.b64), n = bin.length;
      var buf = new Uint8Array(n);
      for (var i = 0; i < n; i++) buf[i] = bin.charCodeAt(i);
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: im.mime }));
      a.download = im.name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
      return true;
    } catch (e) {
      toast('图片「' + im.slot.label + '」导出失败，可以在「首页内容 / 站点信息」里重新传一次');
      return false;
    }
  }

  /* splitImg = true：配置里的 data URL 换成相对路径 */
  function staticJs(splitImg) {
    var cfg = Store.get();
    var data = Store.dataAll();
    var feed = Store.feedAll();
    var posts = Store.postsAll();
    var entries = (window.SITE_DATA && window.SITE_DATA.entries) || [];
    var pass = Store.isDefaultPasscode() ? '' : Store.passHash();

    if (splitImg) {
      staticImageFiles(cfg).forEach(function (im) {
        if (im.slot.inHome) {
          var home = {};
          Object.keys(cfg.home || {}).forEach(function (k) { home[k] = cfg.home[k]; });
          home.image = im.rel;
          cfg.home = home;
        } else {
          cfg[im.slot.key] = im.rel;
        }
      });
    }

    var out = [];
    out.push('/* 壹号栈 · 站点数据快照');
    out.push('   由后台「备份 → 发布到虚拟主机」导出，导出于 ' + nowText());
    out.push('   上传位置：assets/js/site-data.js（覆盖同名文件即可，index.html 已经引入它）');
    out.push('   想回到源码里的默认内容：把这个文件清空，只留注释。 */');
    if (pass) out.push('window.XY_PASS = ' + jsLit(pass) + ';');
    out.push('window.XY_CONFIG = ' + jsLit(cfg) + ';');
    out.push('window.SITE_DATA = ' + jsLit({
      categories: data,
      feed: feed,
      entries: entries,
      posts: posts
    }) + ';');
    return out.join('\n') + '\n';
  }

  /* ---------- 导出前体检 ----------
     把「传上去会出洋相」的地方先挑出来：空链接、没名字、网址少 http、文章没正文… */
  function healthIssues(data, feed, posts) {
    var out = [];
    var push = function (lv, t, d) { out.push({ lv: lv, t: t, d: d }); };

    (data || []).forEach(function (c) {
      var links = c.links || [];
      var cname = c.name || '未命名分类';
      if (!links.length) push('warn', '空分类', '「' + cname + '」里一个站点都没有');
      links.forEach(function (l) {
        var n = String(l.n == null ? '' : l.n).trim();
        var u = String(l.u == null ? '' : l.u).trim();
        if (!n) push('err', '站点没名字', '分类「' + cname + '」里有个站点没填名字');
        if (!u) { push('err', '空链接', '「' + (n || '未命名') + '」没有网址'); return; }
        if (u.charAt(0) === '#' || u.charAt(0) === '/') return;
        if (!/^https?:\/\//i.test(u)) {
          push('warn', '网址不规范', '「' + (n || u) + '」是 ' + u.slice(0, 48) + '，前面少了 https://');
        } else if (/\s/.test(u)) {
          push('warn', '网址里有空格', '「' + (n || u) + '」：' + u.slice(0, 48));
        }
      });
    });

    var today = new Date(); today.setHours(0, 0, 0, 0);
    (feed || []).forEach(function (f) {
      var title = String(f.title || '').trim();
      /* 保存时会把空标题填成「未命名分享」，所以这两种都算没填 */
      if (!title || title === '未命名分享') {
        push('err', '分享没标题', (f.date || '（无日期）') + ' 有一条分享还是'
          + (title ? '默认的「未命名分享」' : '空的'));
      }
      if (!f.date) push('warn', '分享没日期', '「' + (title || '未命名') + '」没有日期，排不进时间线');
      else {
        var d = new Date(String(f.date) + 'T00:00:00');
        if (!isNaN(d.getTime()) && d > today) {
          push('warn', '分享日期在未来', '「' + title + '」写的是 ' + f.date);
        }
      }
      var u = String(f.url || '');
      if (u && !/^(https?:\/\/|#|\/|\.|mailto:|tel:)/i.test(u)) {
        push('warn', '分享链接怪', '「' + (title || '未命名') + '」的链接是 ' + u.slice(0, 40));
      }
    });

    (posts || []).forEach(function (p) {
      var title = String(p.title || '').trim();
      if (!title || title === '未命名文章') {
        push('err', '文章没标题', 'id = ' + (p.id || '（空）') +
          (title ? '，标题还是默认的「未命名文章」' : ''));
      }
      if (!p.date) push('warn', '文章没日期', '「' + (title || '未命名') + '」');
      if (!p.draft && !String(p.body || '').trim()) {
        push('warn', '文章没正文', '「' + (title || '未命名') + '」是空的，但没标草稿，会出现在列表里');
      }
    });

    return out;
  }

  /* ---------- RSS：把 tools/gen-feed.js 的逻辑搬到前台 ----------
     以前改完分享得开终端跑 node 脚本，现在导出时顺手就能下载。 */
  function xmlEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function siteBase() {
    try {
      if (/^https?:$/.test(location.protocol)) {
        return location.origin + location.pathname.replace(/[^/]*$/, '');
      }
    } catch (e) {}
    return 'https://mackxin.github.io/xingyu/';
  }
  function absUrl(u, base) {
    u = String(u || '').trim();
    if (!u) return base;
    if (/^https?:\/\//i.test(u)) return u;
    if (u.charAt(0) === '#') return base + u;
    return base + u.replace(/^\.?\//, '');
  }
  function rfc822(dateStr) {
    var p = String(dateStr || '').split('-');
    if (p.length !== 3) return '';
    var d = new Date(+p[0], +p[1] - 1, +p[2], 9, 0, 0);
    return isNaN(d.getTime()) ? '' : d.toUTCString();
  }
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
  function buildFeedXml() {
    var LIMIT = 20;
    var cfg = Store.get();
    var base = siteBase();
    var feed = Store.feedAll().filter(function (f) {
      return f && f.title && rfc822(f.date);
    }).map(function (f) {
      return { date: f.date, title: f.title, url: f.url, desc: f.desc || '', tags: f.tags || [], isPost: false };
    });
    var posts = Store.postsAll().filter(function (p) {
      return p && p.title && !p.draft && rfc822(p.date);
    }).map(function (p) {
      var desc = p.excerpt || mdPlain(p.body);
      if (desc.length > 160) desc = desc.slice(0, 160) + '…';
      return { date: p.date, title: p.title, url: '#/post/' + encodeURIComponent(p.id), desc: desc, tags: p.tags || [], isPost: true };
    });
    var merged = feed.concat(posts);
    merged.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    merged = merged.slice(0, LIMIT);

    var items = merged.map(function (f) {
      var tags = (f.tags || []).map(function (t) { return '    <category>' + xmlEsc(t) + '</category>'; }).join('\n');
      var link = absUrl(f.url, base);
      return [
        '  <item>',
        '    <title>' + xmlEsc((f.isPost ? '📝 ' : '') + f.title) + '</title>',
        '    <link>' + xmlEsc(link) + '</link>',
        '    <guid isPermaLink="true">' + xmlEsc(link) + '</guid>',
        '    <pubDate>' + rfc822(f.date) + '</pubDate>',
        '    <description>' + xmlEsc(f.desc || '') + '</description>',
        tags,
        '  </item>'
      ].filter(Boolean).join('\n');
    }).join('\n');

    var out = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
      '  <channel>',
      '    <title>' + xmlEsc((cfg.siteName || '壹号栈') + ' · 灵感与文章') + '</title>',
      '    <link>' + xmlEsc(base) + '</link>',
      '    <description>' + xmlEsc((cfg.tagline || '壹号为栈，随处可归') +
        ' —— 每天一小条，记录遇见的工具、灵感与小发现，也写点长一点的文章。') + '</description>',
      '    <language>zh-cn</language>',
      '    <lastBuildDate>' + new Date().toUTCString() + '</lastBuildDate>',
      '    <generator>' + xmlEsc((cfg.siteLatin || 'YIHAOZHAN') + ' gen-feed') + '</generator>',
      '    <atom:link href="' + xmlEsc(base + 'feed.xml') + '" rel="self" type="application/rss+xml" />',
      items,
      '  </channel>',
      '</rss>',
      ''
    ].filter(Boolean).join('\n');
    return { text: out, count: merged.length, base: base };
  }

  function staticStat() {
    var cfg = Store.get();
    var text = staticJs(splitImgs);
    var rec = snapRecord();
    var sig = snapSig(text);
    var d = counts();
    var bytes;
    try { bytes = new Blob([text]).size; } catch (e) { bytes = text.length * 2; }
    var imgs = staticImageFiles(cfg);
    var imgBytes = 0;
    imgs.forEach(function (im) { imgBytes += im.bytes; });
    return {
      sig: sig,
      bytes: bytes,
      imgBytes: imgBytes,
      imgs: imgs,
      never: !rec,
      dirty: !rec || rec.sig !== sig,
      at: (rec && rec.at) || '',
      pass: !Store.isDefaultPasscode(),
      issues: healthIssues(Store.dataAll(), Store.feedAll(), Store.postsAll())
        .sort(function (a, b) { return (a.lv === 'err' ? 0 : 1) - (b.lv === 'err' ? 0 : 1); }),
      summary: d.cats + ' 个分类 · ' + d.links + ' 个站点 · ' +
        Store.feedAll().length + ' 条分享 · ' + Store.postsAll().length + ' 篇文章 · 文件约 ' +
        Math.max(1, Math.round(bytes / 1024)) + ' KB' +
        (splitImgs && imgs.length ? '（图片另存 ' + imgs.length + ' 个文件，' + fmtBytes(imgBytes) + '）' : '')
    };
  }

  function healthHtml(issues) {
    if (!issues.length) {
      return '<p class="admin-tip sn-ok">✅ 体检通过：站点、分享、文章都没查出问题，可以放心导。</p>';
    }
    var errs = issues.filter(function (i) { return i.lv === 'err'; }).length;
    var warns = issues.length - errs;
    var head = '<p class="admin-tip sn-warn">🔍 体检发现 <b>' + issues.length + '</b> 处问题' +
      (errs ? '（<b>' + errs + ' 处会先拦住导出</b>' + (warns ? '，' + warns + ' 处可以忽略' : '') + '）'
            : '（都不影响使用，看到就顺手改改）') + '：</p>';
    var rows = issues.slice(0, 8).map(function (i) {
      return '<li class="sn-issue sn-issue--' + i.lv + '"><b>' + esc(i.t) + '</b>　' + esc(i.d) + '</li>';
    }).join('');
    var more = issues.length > 8
      ? '<li class="sn-issue sn-issue--more">…… 还有 ' + (issues.length - 8) + ' 处，改完再点一次导出会重新检查</li>'
      : '';
    return head + '<ul class="sn-issues">' + rows + more + '</ul>';
  }

  /* 只有「err」级别的才算真错误：空链接、站点没名字、文章没标题 —— 这些传上去访客直接看到空缺 */
  function snapErrs() {
    return healthIssues(Store.dataAll(), Store.feedAll(), Store.postsAll())
      .filter(function (i) { return i.lv === 'err'; });
  }

  /* 导出闸门：标红的错误先拦一下。
     不是死拦 —— 有些错你心里有数就是要导，所以留了「仍然导出」的出口，
     但必须自己明确点一次，避免手滑把半成品推上线。 */
  function snapGate(cb) {
    var errs = snapErrs();
    if (!errs.length) { cb(); return; }
    var top = errs.slice(0, 4).map(function (i) {
      return '· <b>' + esc(i.t) + '</b>　' + esc(i.d);
    }).join('<br>');
    askConfirm({
      title: '还有 ' + errs.length + ' 处错误没改',
      desc: '导出去访客会直接看到这些空缺：<br>' + top +
        (errs.length > 4 ? '<br>…还有 ' + (errs.length - 4) + ' 处' : '') +
        '<br><br>建议先回去改完再导。真要现在导，也不是不行。',
      ok: '知道，仍然导出',
      cancel: '回去改',
      safe: true,
      icon: '🔍'
    }, cb);
  }

  /* ---------- 核对线上版本 ----------
     在虚拟主机的后台里打开这一页时，assets/js/site-data.js 就是线上那一份，
     同源直接 fetch 得到，不需要跨域。读文件头那行「导出于 …」比一比就知道传没传。 */
  function localPreview() {
    try {
      var h = location.hostname;
      return location.protocol === 'file:' || h === 'localhost' ||
             h === '127.0.0.1' || h === '0.0.0.0' || h === '';
    } catch (e) { return false; }
  }

  function liveCheck(cb) {
    if (typeof fetch !== 'function') { cb('这个浏览器不支持 fetch'); return; }
    if (location.protocol === 'file:') { cb('文件是本机双击打开的，没有线上地址'); return; }
    fetch('assets/js/site-data.js?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (txt) {
      var m = /导出于\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/.exec(txt);
      var bytes;
      try { bytes = new Blob([txt]).size; } catch (e) { bytes = txt.length * 2; }
      /* 「空文件」要认真正的赋值语句 —— 出厂那个空文件里，注释也写着
         window.XY_CONFIG / window.SITE_DATA，光搜单词会误判成"有内容" */
      cb(null, { at: m ? m[1] : '', bytes: bytes, empty: !/window\.SITE_DATA\s*=/.test(txt) });
    }).catch(function (e) {
      cb((e && e.message) || '网络错误');
    });
  }

  function staticCard() {
    var s = staticStat();
    var errN = s.issues.filter(function (i) { return i.lv === 'err'; }).length;
    var imgRow = '';
    if (s.imgs.length) {
      var names = s.imgs.map(function (im) { return im.name; }).join('、');
      imgRow =
        '<label class="sn-check">' +
          '<input type="checkbox" id="snSplitImg"' + (splitImgs ? ' checked' : '') + ' />' +
          '<span>把 ' + s.imgs.length + ' 张内嵌图片拆成独立文件（' + esc(fmtBytes(s.imgBytes)) + '）' +
            '，<code>site-data.js</code> 会小很多</span>' +
        '</label>' +
        '<p class="admin-tip">拆出来的文件：<code>' + esc(names) + '</code>，' +
          '需要放到网站的 <code>assets/img/</code> 目录里（点下载时会一起给你）。' +
          '不勾也能用，只是 <code>site-data.js</code> 会大一大截。</p>';
    }

    return '<div class="admin-card">' +
        '<div class="admin-card__head">' +
          '<div><h2>发布到虚拟主机</h2>' +
            '<p>把后台现在的内容打包成一个 <code>site-data.js</code>，' +
            '传到你虚拟主机的 <code>assets/js/</code> 里，访客看到的就是这个版本。</p></div>' +
          '<span class="admin-count ' + (s.never ? '' : s.dirty ? 'is-dirty' : 'is-ok') + '">' +
            (s.never ? '还没导出过' : s.dirty ? '有改动没导出' : '已是最新') + '</span>' +
        '</div>' +
        '<p class="admin-tip">' + esc(s.summary) + '</p>' +
        healthHtml(s.issues) +
        imgRow +
        '<div class="admin-actions">' +
          '<button class="btn btn--primary' + (errN ? ' is-blocked' : '') + '" type="button" id="snDownload"' +
            (errN ? ' data-errs="' + errN + '"' : '') + '>⬇ 下载 site-data.js</button>' +
          '<button class="btn btn--ghost" type="button" id="snFeed">⬇ 下载 feed.xml</button>' +
          '<button class="btn btn--ghost' + (errN ? ' is-blocked' : '') + '" type="button" id="snCopy">复制内容</button>' +
          '<button class="btn btn--ghost" type="button" id="snLive">🔍 核对线上版本</button>' +
        '</div>' +
        '<p class="admin-tip" id="snLiveOut" hidden></p>' +
        '<ol class="guide-steps">' +
          '<li>点上面的按钮，文件会存进「下载」文件夹。</li>' +
          '<li>用 FTP 或主机商的文件管理器，把它传到网站的 <code>assets/js/</code> 目录，' +
            '<b>覆盖</b>同名的 site-data.js。</li>' +
          '<li>浏览器按 <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd> 强刷一次，就能看到新内容。</li>' +
          '<li>传完点一下「🔍 核对线上版本」—— 它会去读线上那个文件，告诉你到底传上去了没有。</li>' +
        '</ol>' +
        '<p class="admin-tip"><code>feed.xml</code> 是 RSS 订阅源，改了分享 / 文章才需要重新传；' +
          '传完记得也放到网站根目录。不订阅就不用管它。</p>' +
        '<p class="admin-tip">当前 <code>index.html</code> 已经引入了这个文件，所以以后<b>只换它一个</b>就够了，' +
          'index.html、data.js、config.js 都不用动。它排在所有脚本最前面，' +
          '后面的 data.js / config.js 看到「已经有了」就只做兜底。</p>' +
        (s.pass
          ? '<p class="admin-tip">⚠️ 你设过自定义访问口令，导出的文件里会带上它的<b>校验值</b>' +
            '（不是明文），这样线上也认同一个口令。这个文件相当于你的钥匙，别传到公开的地方。</p>'
          : '<p class="admin-tip">你还没设过自己的访问口令，所以线上仍然用默认口令 ' +
            '<code>xingyu</code>。想换成自己的：先去「口令」页设一个，再回来导一次。</p>') +
        (s.at ? '<p class="admin-tip">上次导出：' + esc(s.at) + '</p>' : '') +
      '</div>';
  }

  /* ======================= 版本历史（误删找回） ======================= */
  /* 每次改动**之前**，把那一版的原始 JSON 记一笔。
     恢复就是把这个字符串塞回原来的 localStorage key —— 不用理解里面的结构。
     json === null 表示「改之前还是默认值」，恢复时把 key 删掉即可。

     容量：localStorage 一般只有 5MB，站点数据一份就 300KB+，
     所以给了总预算，超了从最旧的开始丢，绝不把站点的存储撑爆。 */
  var HIST_KEY = 'xingyu.hist.v1';
  var HIST_MAX = 14;
  var HIST_BUDGET = 1600 * 1024;
  var HIST_PIN_MAX = 5;
  var HIST_KINDS = {
    data:   { store: 'xingyu.data.v1',   name: '站点数据' },
    feed:   { store: 'xingyu.feed.v1',   name: '分享' },
    posts:  { store: 'xingyu.posts.v1',  name: '文章' },
    config: { store: 'xingyu.config.v1', name: '站点设置' },
    /* 手动快照：一条装下上面四样，恢复时一起回去。没有 store，因为它不对应单个 key */
    all:    { name: '整站快照' }
  };
  var HIST_LIVE = ['data', 'feed', 'posts', 'config'];

  function histAll() {
    try {
      var v = JSON.parse(localStorage.getItem(HIST_KEY));
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function histWrite(list) {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(list)); return true; }
    catch (e) {
      /* 写不进去（多半满了）：把现有的扔掉再试一次，还不行就放弃，别影响主流程 */
      try { localStorage.removeItem(HIST_KEY); } catch (e2) {}
      return false;
    }
  }
  function histTrim(list) {
    var total = 0;
    list.forEach(function (r) { total += r.bytes || 0; });
    /* 先丢自动记录（从最旧往上），手动快照尽量留着 —— 那是人特意按下的锚点，
       被「刚好改了两个字」挤掉就太冤了 */
    for (var i = list.length - 1; i >= 0; i--) {
      if (list.length <= HIST_MAX && total <= HIST_BUDGET) break;
      if (list[i].pin) continue;
      total -= list[i].bytes || 0;
      list.splice(i, 1);
    }
    /* 还是超：从最旧的手动快照开始丢，但至少留一份 */
    while (list.length > HIST_MAX || total > HIST_BUDGET) {
      var pins = list.filter(function (r) { return r.pin; });
      if (pins.length <= 1) break;
      var pi = list.indexOf(pins[pins.length - 1]);
      total -= list[pi].bytes || 0;
      list.splice(pi, 1);
    }
    /* 兜底：只剩快照还超预算，那就按时间丢，总比把浏览器存储撑爆好 */
    while (list.length && (list.length > HIST_MAX || total > HIST_BUDGET)) {
      var gone = list.pop();
      total -= gone.bytes || 0;
    }
    return list;
  }
  function histPush(kind) {
    var meta = HIST_KINDS[kind];
    if (!meta) return;
    var raw = null;
    try { raw = localStorage.getItem(meta.store); } catch (e) {}
    var now = Date.now();
    var list = histAll();
    var top = list[0];
    if (top && top.kind === kind) {
      if (top.json === raw) return;                  // 内容没变，不记
      if (now - (top.t || 0) < 4000) list.shift();   // 连续敲字合成一条
    }
    list.unshift({ t: now, kind: kind, json: raw, bytes: raw ? raw.length * 2 : 0 });
    histWrite(histTrim(list));
  }
  /* 手动打一个快照：把「现在这一版」整个存下来，起个名字方便以后认。
     跟自动记录的区别有两点 —— ① 它记的是现在，不是改之前；② 自动记录挤不掉它。 */
  function histSnapshot(name) {
    var obj = {}, bytes = 0, canRead = false;
    HIST_LIVE.forEach(function (k) {
      var raw = null;
      try { raw = localStorage.getItem(HIST_KINDS[k].store); canRead = true; } catch (e) {}
      obj[k] = raw;
      bytes += raw ? raw.length * 2 : 0;
    });
    if (!canRead) return false;

    var list = histAll();
    list.unshift({
      t: Date.now(), kind: 'all', json: obj, bytes: bytes, pin: true,
      name: String(name == null ? '' : name).trim().slice(0, 24)
    });
    /* 手动快照只留最近几份，更早的自己让位（绝不牵连自动记录之外的东西） */
    var pins = list.filter(function (r) { return r.pin; });
    if (pins.length > HIST_PIN_MAX) {
      for (var i = pins.length - 1; i >= HIST_PIN_MAX; i--) {
        var idx = list.indexOf(pins[i]);
        if (idx > -1) list.splice(idx, 1);
      }
    }
    return histWrite(histTrim(list));
  }

  function histRestore(idx) {
    var rec = histAll()[idx];
    if (!rec) return '';
    if (rec.kind !== 'all' && !HIST_KINDS[rec.kind]) return '';
    var kinds = rec.kind === 'all' ? HIST_LIVE : [rec.kind];

    /* 先把「现在」记一笔：恢复本身也可能手滑，这样还能再退回来 */
    kinds.forEach(function (k) { try { histPush(k); } catch (e) {} });

    try {
      if (rec.kind === 'all') {
        var obj = rec.json || {};
        HIST_LIVE.forEach(function (k) {
          var v = obj[k];
          if (v == null) localStorage.removeItem(HIST_KINDS[k].store);
          else localStorage.setItem(HIST_KINDS[k].store, v);
        });
      } else if (rec.json == null) {
        localStorage.removeItem(HIST_KINDS[rec.kind].store);
      } else {
        localStorage.setItem(HIST_KINDS[rec.kind].store, rec.json);
      }
    } catch (e) { return ''; }
    return rec.kind;
  }
  function histTime(ts) {
    var d = new Date(ts || 0);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* 把 Store 的四个写入口包一层：先记旧值，再真正写 */
  (function wrapHistory() {
    if (Store.__histWrapped) return;
    Store.__histWrapped = true;
    ['setData', 'setFeed', 'setPosts', 'save'].forEach(function (k) {
      var kind = { setData: 'data', setFeed: 'feed', setPosts: 'posts', save: 'config' }[k];
      var orig = Store[k];
      if (typeof orig !== 'function') return;
      Store[k] = function () {
        try { histPush(kind); } catch (e) {}
        return orig.apply(Store, arguments);
      };
    });
  })();

  function histCard() {
    var list = histAll();
    var total = 0, pins = 0;
    list.forEach(function (r) { total += r.bytes || 0; if (r.pin) pins++; });
    var rows = list.slice(0, 10).map(function (r, i) {
      var meta = HIST_KINDS[r.kind] || { name: r.kind };
      var what = r.kind === 'all'
        ? '整站快照'
        : meta.name + (r.json == null ? '（改之前是默认）' : '');
      return '<div class="hist-row' + (r.pin ? ' is-pin' : '') + '">' +
        '<span class="hist-row__when">' + esc(histTime(r.t)) + '</span>' +
        '<span class="hist-row__what">' +
          (r.pin ? '<span class="hist-pin">📌</span>' : '') +
          (r.name ? '<b>' + esc(r.name) + '</b> · ' : '') + esc(what) + '</span>' +
        '<span class="hist-row__size">' + (r.bytes ? esc(fmtBytes(r.bytes)) : '—') + '</span>' +
        '<button class="btn btn--ghost" type="button" data-hist="' + i + '">恢复</button>' +
        '<button class="hist-del" type="button" data-hdel="' + i + '" title="只删掉这一份记录" aria-label="删除这份记录">×</button>' +
        '</div>';
    }).join('');

    return '<div class="admin-card__head">' +
        '<div><h2>版本历史</h2>' +
          '<p>每次改动<b>之前</b>自动留一份旧版本。改错了、删多了，回到这里点「恢复」就行。</p></div>' +
        '<span class="admin-count">' + list.length + ' 份 · ' + esc(fmtBytes(total)) + '</span>' +
      '</div>' +

      /* 手动快照：给「改大动作之前」钉一个锚点 */
      '<div class="hist-snap">' +
        '<input type="text" id="histName" maxlength="24" autocomplete="off" spellcheck="false" ' +
          'placeholder="给这一版起个名字（可留空）" />' +
        '<button class="btn btn--ghost" type="button" id="histPin">📌 记下当前这一版</button>' +
      '</div>' +
      '<p class="admin-tip">手动快照会把<b>站点数据 + 分享 + 文章 + 设置</b>一起存下来，' +
        '恢复时一起回去；自动记录挤不掉它（最多留 ' + HIST_PIN_MAX + ' 份，' +
        (pins ? '已用 ' + pins + ' 份' : '还没用过') + '）。</p>' +

      (list.length
        ? '<div class="hist-list">' + rows + '</div>' +
          (list.length > 10
            ? '<p class="admin-tip">只列最近 10 份；总共最多留 ' + HIST_MAX + ' 份（或者 ' +
              esc(fmtBytes(HIST_BUDGET)) + '），再早的会自动丢掉。</p>'
            : '')
        : '<p class="hist-empty">还没有记录。等你在「站点数据 / 分享 / 文章 / 站点设置」里改点什么，' +
          '这里就会出现第一份；想主动钉一个锚点，就在上面起个名字点一下。</p>') +
      (list.length
        ? '<div class="admin-actions" style="margin-top:12px">' +
            '<button class="btn btn--danger" type="button" id="histClear">清空版本历史</button>' +
          '</div>'
        : '');
  }

  function backupPanel() {
    var d = counts();
    var lc = Store.allLinks().length;
    var pc = Store.postsAll().length;
    var fc = Store.feedAll().length;
    var prc = Store.presets().length;
    return staticCard() +
      '<div class="admin-card">' +
        '<h2>备份到文件</h2>' +
        '<p>把 <b>站点数据</b>（' + d.cats + ' 个分类 · ' + d.links + ' 个站点）、' +
        '<b>分享</b>（' + fc + ' 条）、<b>文章</b>（' + pc + ' 篇）和 <b>站点设置</b>' +
        (lc ? '（含 ' + lc + ' 个自定义链接' + (prc ? '、' + prc + ' 套我的配色' : '') + '）'
            : (prc ? '（含 ' + prc + ' 套我的配色）' : '')) + ' 打包成一个文件下载。</p>' +
        '<div class="admin-actions">' +
          '<button class="btn btn--primary" type="button" id="bkDownload">⬇ 下载备份文件</button>' +
        '</div>' +
        '<p class="admin-tip">文件会保存到你的「下载」文件夹，随时可以拿回来恢复。</p>' +
      '</div>' +

      '<div class="admin-card">' +
        '<h2>从文件恢复</h2>' +
        '<p>选择之前下载的备份文件，覆盖当前的站点数据与设置。恢复前会先让你确认。</p>' +
        '<div class="admin-actions">' +
          '<button class="btn btn--ghost" type="button" id="bkChoose">📂 选择备份文件</button>' +
          '<span class="admin-file" id="bkFileName">还没有选择文件</span>' +
        '</div>' +
        '<input type="file" id="bkFile" accept=".json,application/json" hidden />' +
      '</div>' +

      /* 版本历史：改动前自动留底，误删能回退 */
      '<div class="admin-card" id="histCard">' + histCard() + '</div>' +

      '<div class="admin-card">' +
        '<div class="admin-card__head">' +
          '<div><h2>云备份 · GitHub Gist</h2>' +
            '<p>存进你自己 GitHub 账号下的一个<b>私有 Gist</b>，换电脑、换浏览器都能一键拿回来。</p></div>' +
          '<span class="admin-count" id="gistBadge">未连接</span>' +
        '</div>' +
        '<label class="admin-field"><span class="admin-field__label">GitHub Token<em>需要 gist 权限（classic token 勾 gist 即可）</em></span>' +
          '<input type="password" id="gistToken" placeholder="ghp_… 或 github_pat_…" autocomplete="off" spellcheck="false" />' +
        '</label>' +
        '<div class="admin-actions">' +
          '<button class="btn btn--primary" type="button" id="gistUp">⬆ 上传到云端</button>' +
          '<button class="btn btn--ghost" type="button" id="gistDown">⬇ 从云端恢复</button>' +
          '<button class="btn btn--ghost" type="button" id="gistForget">断开</button>' +
        '</div>' +
        '<p class="admin-tip" id="gistStatus">还没连过。第一次点「上传到云端」会自动新建一个私有 Gist；之后再传会更新同一个。</p>' +
        '<p class="admin-tip"><b>关于 Token 安全：</b>Token 只存在你这台浏览器的 localStorage 里，' +
          '只会发往 <code>api.github.com</code>，不会经过任何第三方服务器。公用电脑上用完记得点「断开」。</p>' +
      '</div>' +

      '<div class="admin-card admin-card--danger">' +
        '<h2>恢复默认</h2>' +
        '<p>清掉本机保存的后台改动，回到 <code>data.js</code> / <code>config.js</code> 里的出厂状态。' +
        '按钮都会先弹确认框，且<b>不影响收藏夹</b>。</p>' +
        '<div class="admin-actions">' +
          '<button class="btn btn--danger" type="button" id="bkResetCfg">恢复默认设置</button>' +
          '<button class="btn btn--danger" type="button" id="bkResetData">恢复默认数据</button>' +
          '<button class="btn btn--danger" type="button" id="bkResetFeed">恢复默认分享</button>' +
          '<button class="btn btn--danger" type="button" id="bkResetPosts">恢复默认文章</button>' +
        '</div>' +
      '</div>' +

      '<details class="admin-adv">' +
        '<summary>进阶：不要打包文件，手动写进源码</summary>' +
        '<p>平常不用看这里 —— 上面的「发布到虚拟主机」已经能一次搞定。' +
        '只有在你想把内容直接写死进源码时才用：下面两个按钮会把内容复制到剪贴板，你粘到对应文件里就行。</p>' +
        '<div class="admin-actions">' +
          '<button class="btn btn--ghost" type="button" id="bkCopyData">复制站点数据</button>' +
          '<button class="btn btn--ghost" type="button" id="bkCopyCfg">复制站点设置</button>' +
        '</div>' +
        '<p class="admin-tip">站点数据 → <code>assets/js/data.js</code> 的 <code>categories</code>；' +
        '站点设置 → <code>index.html</code> 里 <code>config.js</code> 之前。</p>' +
      '</details>';
  }

  /* ---------- 备份数据打包 ---------- */
  /* 灵感随记（#/idea）的正文只存在本机，前台自己管自己的 key；
     备份 / 云同步这边直接读写同一个 key，换设备时不会把它落下。 */
  var IDEA_STORE = 'xingyu.idea.v1';
  function ideasAll() {
    try { var v = JSON.parse(localStorage.getItem(IDEA_STORE)); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function setIdeas(list) {
    try { localStorage.setItem(IDEA_STORE, JSON.stringify(Array.isArray(list) ? list : [])); return true; }
    catch (e) { return false; }
  }

  function backupObject() {
    return {
      app: 'xingyu',
      version: 5,
      exportedAt: new Date().toISOString(),
      config: Store.get(),
      data: Store.dataAll(),
      feed: Store.feedAll(),
      posts: Store.postsAll(),
      ideas: ideasAll()      /* v123 起：灵感随记也一起带走（老备份里没有这个字段，恢复时跳过） */
    };
  }

  /* 描述一份备份的内容，用于确认框；不是备份则返回 null */
  function describeBackup(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj)) {
      var n = 0;
      obj.forEach(function (c) { n += ((c && c.links) || []).length; });
      return obj.length + ' 个分类 · ' + n + ' 个站点';
    }
    var parts = [];
    if (Array.isArray(obj.data)) {
      var m = 0;
      obj.data.forEach(function (c) { m += ((c && c.links) || []).length; });
      parts.push(obj.data.length + ' 个分类 · ' + m + ' 个站点');
    }
    if (Array.isArray(obj.feed)) parts.push(obj.feed.length + ' 条分享');
    if (Array.isArray(obj.posts)) parts.push(obj.posts.length + ' 篇文章');
    if (Array.isArray(obj.ideas)) parts.push(obj.ideas.length + ' 条灵感');
    if (obj.config && typeof obj.config === 'object') {
      var cn = (obj.config.customLinks || []).length;
      parts.push('站点设置' + (cn ? '（含 ' + cn + ' 个自定义链接）' : ''));
    }
    return parts.length ? parts.join('，') : null;
  }

  function applyBackup(obj) {
    if (Array.isArray(obj)) { Store.setData(obj); return; }
    if (obj.config && typeof obj.config === 'object') Store.save(obj.config);
    if (Array.isArray(obj.data)) Store.setData(obj.data);
    if (Array.isArray(obj.feed)) Store.setFeed(obj.feed);
    if (Array.isArray(obj.posts)) Store.setPosts(obj.posts);
    if (Array.isArray(obj.ideas)) setIdeas(obj.ideas);
  }

  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  /* ======================= 云备份：GitHub Gist ======================= */
  var GIST_KEY = 'xingyu.gist.v1';
  var GIST_FILE = 'xingyu-backup.json';

  function gistCfg() {
    try { return JSON.parse(localStorage.getItem(GIST_KEY)) || {}; } catch (e) { return {}; }
  }
  function gistSaveCfg(o) {
    try { localStorage.setItem(GIST_KEY, JSON.stringify(o || {})); } catch (e) {}
  }
  function gistApi(path, token, opts) {
    opts = opts || {};
    return fetch('https://api.github.com' + path, {
      method: opts.method || 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.text().then(function (txt) {
        var j = null;
        try { j = JSON.parse(txt); } catch (e) {}
        if (!r.ok) {
          var msg = (j && j.message) || ('HTTP ' + r.status);
          if (r.status === 401) msg = 'Token 不对或已过期';
          else if (r.status === 403) msg = 'Token 没有 gist 权限';
          else if (r.status === 404) msg = '找不到这个 Gist（可能被删了）';
          throw new Error(msg);
        }
        return j;
      });
    });
  }

  /* 云端包：站点数据 + 设置 + 收藏 + 最近访问 */
  function cloudPayload() {
    var a = app();
    return {
      app: 'xingyu',
      version: 5,
      exportedAt: new Date().toISOString(),
      config: Store.get(),
      data: Store.dataAll(),
      feed: Store.feedAll(),
      posts: Store.postsAll(),
      fav: (a.fav && a.fav.get) ? a.fav.get() : [],
      visits: (a.visits && a.visits.get) ? a.visits.get() : {},
      ideas: ideasAll()
    };
  }

  function gistForget(root) {
    gistSaveCfg({});
    var t = root.querySelector('#gistToken'); if (t) t.value = '';
    gistPaint(root);
    toast('已断开云端连接');
  }

  function gistPaint(root) {
    var c = gistCfg();
    var badge = root.querySelector('#gistBadge');
    var st = root.querySelector('#gistStatus');
    var tok = root.querySelector('#gistToken');
    if (tok && c.token && !tok.value) tok.value = c.token;
    if (badge) {
      badge.textContent = c.id ? '已连接' : '未连接';
      badge.classList.toggle('is-full', !!c.id);
    }
    if (st) {
      if (c.id) {
        st.innerHTML = '已连接 Gist <code>' + esc(String(c.id).slice(0, 10)) + '…</code>' +
          (c.at ? ' · 上次同步 ' + esc(c.at) : '') +
          ' · <a href="https://gist.github.com/' + esc(c.id) + '" target="_blank" rel="noopener" style="text-decoration:underline">在 GitHub 打开</a>';
        st.style.color = '';
      }
    }
  }

  function bindGist(root, body) {
    var upBtn = body.querySelector('#gistUp');
    if (!upBtn) return;
    var tokEl = body.querySelector('#gistToken');
    var downBtn = body.querySelector('#gistDown');
    var forgetBtn = body.querySelector('#gistForget');
    gistPaint(root);

    function token() {
      var t = tokEl ? String(tokEl.value || '').trim() : '';
      if (!t) {
        var saved = gistCfg().token;
        if (saved) return saved;
        toast('先填一个 GitHub Token');
        return '';
      }
      return t;
    }
    function setStatus(html, isErr) {
      var st = root.querySelector('#gistStatus');
      if (!st) return;
      st.innerHTML = html;
      st.style.color = isErr ? 'var(--text-danger, #e2675c)' : '';
    }

    upBtn.addEventListener('click', function () {
      var t = token();
      if (!t) return;
      var id = gistCfg().id;
      var payload = cloudPayload();
      var body2 = {
        description: '壹号栈 Yihaozhan · 自动备份',
        public: false,
        files: {}
      };
      body2.files[GIST_FILE] = { content: JSON.stringify(payload, null, 2) };
      upBtn.disabled = true;
      setStatus('正在上传…');
      gistApi(id ? '/gists/' + id : '/gists', t, { method: id ? 'PATCH' : 'POST', body: body2 })
        .then(function (j) {
          gistSaveCfg({ token: t, id: j.id, at: new Date().toLocaleString('zh-CN') });
          gistPaint(root);
          setStatus('已上传 ✓ ' + new Date().toLocaleTimeString('zh-CN'));
          toast('☁️ 已备份到 Gist');
        })
        .catch(function (e) {
          setStatus('上传失败：' + esc(e.message), true);
          toast('上传失败：' + e.message);
        })
        .then(function () { upBtn.disabled = false; });
    });

    if (downBtn) downBtn.addEventListener('click', function () {
      var t = token();
      if (!t) return;
      var id = gistCfg().id;
      if (!id) { toast('还没有云端备份，先点「上传到云端」'); return; }
      downBtn.disabled = true;
      setStatus('正在读取…');
      gistApi('/gists/' + id, t)
        .then(function (j) {
          var f = j.files && j.files[GIST_FILE];
          if (!f) throw new Error('这个 Gist 里没有备份文件');
          if (f.truncated && f.raw_url) {
            return fetch(f.raw_url).then(function (r) { return r.text(); });
          }
          return f.content;
        })
        .then(function (txt) {
          var obj = null;
          try { obj = JSON.parse(txt); } catch (e) {}
          var info = describeBackup(obj);
          if (!info) throw new Error('备份内容无法识别');
          var extra = [];
          if (obj.fav) extra.push((obj.fav.length || 0) + ' 个收藏');
          if (obj.visits) extra.push(Object.keys(obj.visits).length + ' 条访问记录');
          downBtn.disabled = false;
          setStatus('云端有一份备份');
          askConfirm({
            icon: '☁️',
            title: '用云端备份覆盖本机？',
            desc: '云端这份包含 ' + info + (extra.length ? '，' + extra.join('、') : '') + '。<br>' +
                  '恢复后本机当前的内容会被覆盖，<b>无法撤销</b>。',
            ok: '确认恢复'
          }, function () {
            applyBackup(obj);
            if (obj.fav && app().fav && app().fav.set) app().fav.set(obj.fav);
            if (obj.visits && app().visits && app().visits.set) app().visits.set(obj.visits);
            toast('云端备份已恢复 ✦');
            syncAfterRestore(true);
          });
        })
        .catch(function (e) {
          downBtn.disabled = false;
          setStatus('读取失败：' + esc(e.message), true);
          toast('读取失败：' + e.message);
        });
    });

    if (forgetBtn) forgetBtn.addEventListener('click', function () {
      askConfirm({
        icon: '🔌',
        title: '断开云端连接？',
        desc: '只是清掉本机保存的 Token 和 Gist 编号，<b>云端那份备份还在</b>，下次重新填 Token 就能继续用。',
        ok: '断开', cancel: '算了', safe: true
      }, function () { gistForget(root); });
    });
  }

  /* ======================= 口令 ======================= */
  function securityPanel() {
    return '<div class="admin-card">' +
        '<h2>修改访问口令</h2>' +
        '<p>' + (Store.isDefaultPasscode()
            ? '当前使用的是<b>默认口令 <code>xingyu</code></b>，建议改掉。'
            : '当前使用的是你自定义的口令。') + '</p>' +
        '<label class="admin-field"><span class="admin-field__label">新口令</span>' +
          '<input type="password" id="adminNewPass" placeholder="至少 3 位" autocomplete="new-password" /></label>' +
        '<label class="admin-field"><span class="admin-field__label">确认新口令</span>' +
          '<input type="password" id="adminNewPass2" placeholder="再输一次" autocomplete="new-password" /></label>' +
        '<div class="admin-actions"><button class="btn btn--primary" type="button" id="adminSavePass">保存口令</button></div>' +
        '<p class="admin-tip">注意：这是纯前端门禁，只防误入与防手滑，<b>不是真正的安全机制</b>——数据都在浏览器里。</p>' +
      '</div>';
  }

  /* ======================= 使用手册 / 技术参数 ======================= */
  function fmtBytes(n) {
    if (!n) return '0 KB';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }
  /* localStorage 里本站占了多少（按 UTF-16 估算，只是给个量级） */
  function storageStat() {
    var bytes = 0, n = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i) || '';
        if (k.indexOf('xingyu.') !== 0) continue;
        bytes += (k.length + String(localStorage.getItem(k) || '').length) * 2;
        n++;
      }
    } catch (e) {}
    return { n: n, bytes: bytes };
  }
  /* 缓存版本号从 <script src="app.js?v=..."> 上取，跟 sw.js 的 VERSION 是同一个 */
  function cacheVer() {
    try {
      var s = document.querySelector('script[src*="app.js?v="]');
      var m = s && /[?&]v=([\w.]+)/.exec(s.getAttribute('src') || '');
      return m ? 'v' + m[1] : '—';
    } catch (e) { return '—'; }
  }
  function bootMs() {
    try {
      var n = performance.getEntriesByType('navigation')[0];
      return n && n.domContentLoadedEventEnd ? Math.round(n.domContentLoadedEventEnd) + ' ms' : '—';
    } catch (e) { return '—'; }
  }
  function kv(k, v) {
    return '<div class="guide-kv"><b>' + k + '</b><span>' + v + '</span></div>';
  }
  function gRow(a, b) {
    return '<div class="guide-row"><b>' + a + '</b><span>' + b + '</span></div>';
  }

  function guidePanel() {
    var d = counts();
    var fed = Store.feedAll().length;
    var pos = Store.postsAll().length;
    var lnk = Store.allLinks().length;
    var ss = storageStat();
    var ver = cacheVer();

    /* ---------- 使用手册 ---------- */
    var pagesRows = [
      ['🏝 首页', '站点门面：标语、统计、几个入口卡、今日精选横轨，最下面一块赞助'],
      ['🧭 导航', '全部分类 + 站点卡片，' + d.links + ' 个站点；顶栏可搜、可只看收藏、可随机漫游'],
      ['📰 分享', '按日期分组的时间线，' + fed + ' 条；点标签筛选，点卡片直接开原链接'],
      ['✍️ 文章', '列表 + 阅读页（右侧目录、上一篇/下一篇、代码高亮）'],
      ['🌌 关于', '自己的介绍页 <code>#/about</code>：名字来由、栈里有什么、怎么逛、关于我；正文是 Markdown'],
      ['🔐 后台', '就是这里：改完立刻生效，但只存在本机浏览器']
    ].map(function (r) { return gRow(r[0], r[1]); }).join('');

    var keysRows = [
      ['<code>⌘K</code> / <code>Ctrl+K</code> / <code>/</code>', '呼出全站搜索面板，跨页面 / 分类 / 站点 / 分享 / 文章一起搜'],
      ['<code>1</code> <code>2</code> <code>3</code> <code>4</code>', '直达 首页 / 导航 / 分享 / 文章'],
      ['<code>←</code> <code>→</code>', '上一页 / 下一页'],
      ['<code>T</code>', '切明暗主题'],
      ['<code>R</code>', '随机漫游一个站点'],
      ['<code>F</code>', '导航页「只看收藏」'],
      ['<code>?</code>', '弹出快捷键说明'],
      ['<code>Esc</code>', '关掉任何打开的面板']
    ].map(function (r) { return gRow(r[0], r[1]); }).join('');

    var adminRows = [
      ['🗂 站点数据', '增删分类与站点、拖拽排序、改图标与描述。这是「导航」页和全站搜索的数据源'],
      ['📰 分享', '发一条分享（日期 / 图标 / 标题 / 链接 / 标签 / 描述），列表里可搜索、可编辑'],
      ['✍️ 文章', '写文章、导入 <code>.md</code>、存草稿、预览正文'],
      ['🏠 首页内容', '改标语、统计数字、入口卡、今日精选（勾哪几条显示哪几条，最多 12 条）、关于页正文、赞助卡片（开关 + 文案 + 收款码图片）'],
      ['🎨 主题', '7 套配色 + 自己敲 <code>#ff1d55</code> 这类色值 + 「我的配色」存多套；还有极光强度、圆角、默认主题、卡片密度、正文字号行高'],
      ['🔗 自定义链接', '顶栏/页脚那种自己加的链接，最多 ' + MAX + ' 个'],
      ['🌌 站点信息', '站名、标语、建站日期、Logo、Favicon、分享卡片图'],
      ['💾 备份', '「发布到虚拟主机」导出前先体检（标红的错误会先拦一下）、再下载 <code>site-data.js</code> / <code>feed.xml</code>，传完能核对线上版本；还有版本历史（改动前自动留底 + 手动打快照，误删能回退）、整站打包成 JSON、导入回来、恢复默认'],
      ['🔐 口令', '改访问口令。注意这是纯前端门禁，只防误入，不是真安全'],
      ['📖 手册 / 参数', '就是这一页']
    ].map(function (r) { return gRow(r[0], r[1]); }).join('');

    var usageCard = '<div class="admin-card" id="guideUsage">' +
        '<div class="admin-card__head guide-head">' +
          '<div><h2>使用手册</h2><p>五分钟摸清这个站怎么用、后台每个面板管什么。</p></div>' +
          '<button class="btn btn--ghost" type="button" data-guide-copy>⧉ 复制这份手册</button>' +
        '</div>' +

        '<div class="admin-sub"><b>前台四个页面</b><em>顶栏 tab / 快捷键 / 手机左右滑都能切</em></div>' +
        '<div class="guide-list">' + pagesRows + '</div>' +

        '<div class="admin-sub"><b>快捷键</b><em>输入框里打字时不会误触发</em></div>' +
        '<div class="guide-list">' + keysRows + '</div>' +

        '<div class="admin-sub"><b>手机上</b><em>窄屏自动换一套交互</em></div>' +
        '<div class="guide-list">' +
          gRow('左右滑', '切页面，隔壁页会跟着滑进来，松手按位移 / 速度决定去留') +
          gRow('双击顶栏空白', '一下到底，再双击回顶部（长页面很省事）') +
          gRow('长按卡片', '弹出收藏 / 复制链接 / 打开') +
          gRow('底部 tab 栏', '导航胶囊移到屏幕底部，单手拇指够得着') +
          gRow('🏷 顶栏按钮', '窄屏时标签 / 分类收成按钮，点开是底部面板') +
          gRow('分类栏「只看」', '勾几个分类就只显示它们（面板里勾不会把面板关掉）') +
        '</div>' +

        '<div class="admin-sub"><b>后台每个面板管什么</b><em>左侧那一列从上到下</em></div>' +
        '<div class="guide-list">' + adminRows + '</div>' +

        '<div class="admin-sub"><b>五个最常见的操作</b><em>照着点就行</em></div>' +
        '<ol class="guide-steps">' +
          '<li><b>加一个站点</b>：站点数据 → 展开分类 → 「＋ 添加站点」→ 填名字和网址 → 回车保存</li>' +
          '<li><b>发一条分享</b>：分享 → 「＋ 新建」→ 日期默认今天，填标题和链接，标签用逗号隔开</li>' +
          '<li><b>写一篇文章</b>：文章 → 「＋ 新建」→ 支持 Markdown，右边能实时预览 → 保存</li>' +
          '<li><b>换个配色</b>：主题 → 点色板，或在 <code>HEX</code> 框里敲 <code>#ff1d55</code> → 回车，全站立刻变</li>' +
          '<li><b>给别人看</b>：这里改的都只在你本机。想让所有访客看到，去「备份 → 发布到虚拟主机」下载 <code>site-data.js</code>，' +
            '传到网站的 <code>assets/js/</code> 覆盖同名文件就行</li>' +
        '</ol>' +

        '<div class="admin-sub"><b>三件要注意的事</b><em>不然容易白折腾</em></div>' +
        '<div class="guide-list">' +
          gRow('改动只在本机', '后台所有设置存在浏览器 <code>localStorage</code> 里。换设备、清缓存、换浏览器都不会跟过去') +
          gRow('发布 ≠ 同步设置', '发布上线的是代码，你在后台改的内容仍然只在这台机器上。要让它上线，走「备份 → 发布到虚拟主机」那一份 <code>site-data.js</code>') +
          gRow('口令不是安全', '纯前端门禁，只挡误入。真正的私密内容别放在这个站里') +
        '</div>' +
      '</div>';

    /* ---------- 技术参数 ---------- */
    var liveGrid = [
      kv('缓存版本', ver + '（与 <code>sw.js</code> 的 VERSION 同步）'),
      kv('分类 / 站点', d.cats + ' 类 · ' + d.links + ' 个'),
      kv('分享条目', fed + ' 条（内置 + 导入）'),
      kv('文章', pos + ' 篇'),
      kv('自定义链接', lnk + ' / ' + MAX),
      kv('本机存储', ss.n
        ? fmtBytes(ss.bytes) + '（' + ss.n + ' 个 key）'
        : '还没有本机改动（都用 <code>data.js</code> 里的默认值）'),
      kv('首屏 DOM 就绪', bootMs()),
      kv('运行模式', /^https?:$/.test(location.protocol) ? '静态托管' : '本地文件')
    ].join('');

    var stackGrid = [
      kv('形态', '零依赖单页应用（SPA），<b>没有构建步骤</b>，文件写完就是成品'),
      kv('语言', '原生 JavaScript（ES5 语法 + 少量 ES6 API），不用任何框架 / 打包器'),
      kv('路由', 'hash 路由 <code>#/route</code> + <code>history.pushState</code>，监听 <code>hashchange</code> / <code>popstate</code>'),
      kv('渲染', '手写模板字符串拼 HTML，一次性 <code>innerHTML</code>；长列表用 <code>content-visibility</code> 跳过屏外渲染'),
      kv('样式', '原生 CSS + CSS 变量双主题；无边框、无阴影、无框架 UI 库'),
      kv('图标', '内联 SVG / emoji，零图片请求（Logo 与分享图除外）'),
      kv('离线', 'Service Worker 预缓存整站，Cache-first，版本号变了才换新缓存'),
      kv('搜索', '自己建索引：页面 / 分类 / 站点 / 分享 / 文章，纯内存匹配，无后端'),
      kv('数据来源', '<code>assets/js/data.js</code>（内置）+ <code>assets/js/feed-import.js</code>（导入的那批分享）；后台导出后由 <code>assets/js/site-data.js</code> 整体接管'),
      kv('后端', '无。所有数据在浏览器本地，没有账号、没有服务端'),
      kv('第三方', '没有任何 CDN / 统计 / 广告脚本')
    ].join('');

    var filesRows = [
      ['<code>index.html</code>', '唯一入口：骨架、顶栏、搜索面板、脚本引入（<code>?v=</code> 就是缓存版本）'],
      ['<code>assets/css/style.css</code>', '全部样式：设计变量在顶部 <code>:root</code>，之后是各页面与后台'],
      ['<code>assets/js/config.js</code>', '配置层 + <code>XYStore</code>：默认值、规范化、localStorage 读写'],
      ['<code>assets/js/data.js</code>', '内置的分类 / 站点 / 分享 / 文章数据'],
      ['<code>assets/js/feed-import.js</code>', '导入的那批分享，单独一个文件，不想要就删掉 index.html 里那行 script'],
      ['<code>assets/js/app.js</code>', '路由、渲染、搜索、手势、主题、文章阅读'],
      ['<code>assets/js/admin.js</code>', '这一整套后台面板'],
      ['<code>assets/js/md.js</code>', 'Markdown 渲染 + 代码高亮'],
      ['<code>assets/js/bookmarks.js</code>', '收藏夹的原始数据（50 个分类 / 2000+ 链接）'],
      ['<code>assets/js/site-data.js</code>', '空文件。后台「发布到虚拟主机」导出的快照就覆盖它 —— 有内容时，整站数据以它为准'],
      ['<code>sw.js</code>', 'Service Worker；<code>VERSION</code> 要和 index.html 的 <code>?v=</code> 一起改'],
      ['<code>tools/gen-feed.js</code>', '生成 RSS <code>feed.xml</code> 的小脚本（可选）']
    ].map(function (r) { return gRow(r[0], r[1]); }).join('');

    var storeGrid = [
      kv('<code>xingyu.config.v1</code>', '整站设置：站名、首页文案、主题配色、阅读排版、显示项、口令'),
      kv('<code>xingyu.data.v1</code>', '分类与站点（「导航」页的数据）'),
      kv('<code>xingyu.feed.v1</code>', '分享条目；没改过就用 <code>data.js</code> 里的'),
      kv('<code>xingyu.posts.v1</code>', '文章；没写过就用 <code>data.js</code> 里的'),
      kv('<code>xingyu.fav.v1</code>', '收藏夹（星标过的站点网址）；和最近访问一起会进「云备份」'),
      kv('<code>xingyu.idea.v1</code>', '灵感随记的条目（正文 / 标签 / 时间）；会跟着「下载备份」和「云备份」一起走'),
      kv('<code>xingyu.idea.draft.v1</code>', '灵感随记里还没提交的草稿，切页不丢，保存后自动清掉'),
      kv('<code>xingyu.recent.v1</code>', '最近访问'),
      kv('<code>xingyu.export.v1</code>', '上次「发布到虚拟主机」导出的时间与签名，用来判断有没有没导出的改动'),
      kv('<code>xingyu.hist.v1</code>', '版本历史：改动前的旧版本 + 手动快照，最多 14 份 / 1.6 MB。手动快照不会被自动记录挤掉，最多留 5 份')
    ].join('');

    var deployGrid = [
      kv('GitHub Pages', '<code>mackxin.github.io/xingyu</code>'),
      kv('WorkBuddy Sites', '<code>xingyu-44428.app.workbuddy.host</code>'),
      kv('虚拟主机', '后台「备份 → 发布到虚拟主机」导出 <code>site-data.js</code>，覆盖 <code>assets/js/</code> 里的同名文件即可'),
      kv('发布方式', '改代码 → 提版本号（index.html 的 <code>?v=</code> 与 <code>sw.js</code> 的 <code>VERSION</code>）→ 推送'),
      kv('缓存坑', 'Pages 构建完成后 CDN 还会吐一阵旧 HTML，硬刷一次就好')
    ].join('');

    var techCard = '<div class="admin-card" id="guideTech">' +
        '<div class="admin-card__head guide-head">' +
          '<div><h2>技术参数</h2><p>这个站现在到底是怎么搭的、数据在哪、多少东西。左边数字是实时读出来的。</p></div>' +
          '<button class="btn btn--ghost" type="button" data-guide-copy>⧉ 复制这份参数</button>' +
        '</div>' +

        '<div class="admin-sub"><b>实时数据</b><em>每次打开这一页重新读</em></div>' +
        '<div class="guide-grid">' + liveGrid + '</div>' +

        '<div class="admin-sub"><b>技术栈</b><em>没有后端，也没有依赖</em></div>' +
        '<div class="guide-grid">' + stackGrid + '</div>' +

        '<div class="admin-sub"><b>文件结构</b><em>根目录下的东西</em></div>' +
        '<div class="guide-list">' + filesRows + '</div>' +

        '<div class="admin-sub"><b>数据存在哪</b><em>浏览器 localStorage，按 key 分开</em></div>' +
        '<div class="guide-list">' + storeGrid + '</div>' +

        '<div class="admin-sub"><b>部署</b><em>同一个代码库，两个地方同时在跑</em></div>' +
        '<div class="guide-list">' + deployGrid + '</div>' +
      '</div>';

    return usageCard + techCard;
  }

  function bindGuide(body) {
    /* 老办法：临时 textarea + execCommand。剪贴板 API 不可用、
       或者被浏览器以「文档没焦点 / 没权限」拒掉时兜底 */
    function legacyCopy(txt) {
      try {
        var ta = document.createElement('textarea');
        ta.value = txt;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, txt.length);
        var okc = document.execCommand('copy');
        document.body.removeChild(ta);
        return okc;
      } catch (e) { return false; }
    }

    body.querySelectorAll('[data-guide-copy]').forEach(function (b) {
      b.addEventListener('click', function () {
        var card = b.closest('.admin-card');
        var txt = (card ? card.innerText : '').trim();
        if (!txt) return;
        var done = function () { toast('已复制到剪贴板'); };
        var fail = function () { toast('复制失败，手动选中复制吧'); };

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(done, function () {
            if (legacyCopy(txt)) done(); else fail();
          });
          return;
        }
        if (legacyCopy(txt)) done(); else fail();
      });
    });
  }

  /* ======================= 绑定 ======================= */
  function bind(root) {
    bindDragOnce();
    if (!Store.isUnlocked()) return bindLock(root);
    var lockBtn = root.querySelector('#adminLock');
    if (lockBtn) lockBtn.addEventListener('click', function () {
      Store.lock();
      toast('已退出后台');
      if (app().rerender) app().rerender();
    });
    root.querySelectorAll('.admin-tab').forEach(function (b) {
      b.addEventListener('click', function () {
        closeEmoji();
        tab = b.getAttribute('data-tab');
        siteQuery = '';
        postQuery = '';
        feedQuery = '';
        editing = null;
        feedEditing = null;
        savedId = '';
        armed = null;
        root.querySelectorAll('.admin-tab').forEach(function (x) {
          x.classList.toggle('is-active', x === b);
        });
        refreshBody(root);
      });
    });
    bindBody(root);
  }

  function bindLock(root) {
    var form = root.querySelector('#adminLogin');
    var input = root.querySelector('#adminPass');
    var err = root.querySelector('#adminErr');
    if (input) input.focus();
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (Store.unlock(input.value)) {
        toast('欢迎回来 ✦');
        if (app().rerender) app().rerender();
      } else {
        err.hidden = false;
        err.textContent = '口令不对，再试一次。';
        input.value = '';
        input.focus();
        form.classList.remove('is-shake');
        void form.offsetWidth;
        form.classList.add('is-shake');
      }
    });
  }

  /* 只重绘面板正文，避免整页重渲染丢焦点 */
  function refreshBody(root) {
    closeEmoji();
    var body = root.querySelector('#adminBody');
    if (!body) return;
    body.innerHTML = panelHtml();
    bindBody(root);
    syncSide(root);
  }

  /* 只重绘分类列表（增删改/搜索/拖动时用，不动搜索框） */
  function refreshCats(root) {
    var box = root.querySelector('#adminCats');
    if (!box) return;
    // 记住每个分类内部的滚动位置与页面滚动，重绘后恢复：
    // 长列表里拖动 / 编辑时不会突然跳回顶部
    var scrolls = {};
    Array.prototype.forEach.call(box.querySelectorAll('.acat__body'), function (b) {
      var sec = b.closest('.acat');
      if (sec && b.scrollTop) scrolls[sec.getAttribute('data-cid')] = b.scrollTop;
    });
    var winY = window.pageYOffset;
    box.innerHTML = catsListHtml();
    Array.prototype.forEach.call(box.querySelectorAll('.acat__body'), function (b) {
      var sec = b.closest('.acat');
      if (!sec) return;
      var v = scrolls[sec.getAttribute('data-cid')];
      if (v) b.scrollTop = v;
    });
    if (window.pageYOffset !== winY) window.scrollTo(0, winY);
    updateCounts(root);
  }

  /* 只更新计数文字（打字时用，不重绘、不丢焦点） */
  function updateCounts(root) {
    var cnt = root.querySelector('#adminSiteCount');
    if (cnt) {
      var d = counts();
      cnt.textContent = d.cats + ' 个分类 · ' + d.links + ' 个站点';
    }
    syncSide(root);
  }

  function refreshPreview(body) {
    var box = body.querySelector('#adminPreview');
    if (!box) return;
    box.innerHTML = Store.activeLinks().map(function (l) {
      return '<span class="hlink hlink--preview"><span class="hlink__icon">' + esc(l.icon) + '</span><span class="hlink__name">' + esc(l.name) + '</span></span>';
    }).join('');
  }

  function bindBody(root) {
    var body = root.querySelector('#adminBody');
    if (!body) return;

    bindPosts(root, body);
    bindFeed(root, body);
    bindLook(root, body);
    bindGuide(body);

    /* ---------- 站点数据 ---------- */
    var catsWrap = body.querySelector('#adminCats');
    if (catsWrap) {
      catsWrap.addEventListener('input', function (e) {
        var el = e.target;
        var cf = el.getAttribute('data-cat-f');
        var lf = el.getAttribute('data-link-f');
        if (!cf && !lf) return;
        var ci = +el.closest('.acat').getAttribute('data-ci');
        mutate(function (list) {
          if (cf) list[ci][cf] = el.value;
          else {
            var li = +el.closest('.alink').getAttribute('data-li');
            list[ci].links[li][lf] = el.value;
          }
        });
        updateCounts(root);
      });

      /* 分类级操作：展开/收起、删除、加站点（排序改成拖动握把） */
      catsWrap.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-cat-op]');
        if (!btn || !catsWrap.contains(btn)) return;
        var section = btn.closest('.acat');
        if (!section) return;
        var ci = +section.getAttribute('data-ci');
        var cid = section.getAttribute('data-cid');
        var op = btn.getAttribute('data-cat-op');

        if (op === 'toggle') {
          openCats[cid] = !openCats[cid];
          refreshCats(root);
        } else if (op === 'addlink') {
          mutate(function (list) { list[ci].links.push({ n: '', u: '', d: '' }); });
          openCats[cid] = true;
          refreshCats(root);
          focusLast(root, ci, 'n');
        } else if (op === 'del') {
          if (!armedNow('cat', ci, -1)) {
            arm('cat', ci, -1); refreshCats(root); toast('再点一次确认删除分类');
            return;
          }
          armed = null;
          mutate(function (list) { list.splice(ci, 1); });
          delete openCats[cid];
          refreshCats(root);
          toast('已删除分类');
        }
      });

      /* 站点级操作：删除 */
      catsWrap.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-link-op]');
        if (!btn || !catsWrap.contains(btn)) return;
        var ci = +btn.closest('.acat').getAttribute('data-ci');
        var li = +btn.getAttribute('data-li');
        var op = btn.getAttribute('data-link-op');
        if (op === 'pin') {
          var nowOn = false;
          mutate(function (list) {
            var it = list[ci].links[li];
            it.pin = !it.pin;
            if (!it.pin) delete it.pin;
            nowOn = !!it.pin;
          });
          refreshCats(root);
          toast(nowOn ? '已置顶，会排在分类最前面' : '已取消置顶');
          return;
        }
        if (op !== 'del') return;
        mutate(function (list) { list[ci].links.splice(li, 1); });
        refreshCats(root);
        toast('已删除站点');
      });
    }

    var sInput = body.querySelector('#adminSiteSearch');
    if (sInput) sInput.addEventListener('input', function () {
      siteQuery = sInput.value;
      refreshCats(root);
    });

    var addCat = body.querySelector('#adminAddCat');
    if (addCat) addCat.addEventListener('click', function () {
      var id = newCatId();
      mutate(function (list) { list.push({ id: id, name: '新分类', icon: '📁', desc: '', links: [] }); });
      openCats[id] = true;
      siteQuery = '';
      var s = root.querySelector('#adminSiteSearch'); if (s) s.value = '';
      refreshCats(root);
      var sec = root.querySelector('.acat[data-cid="' + id + '"]');
      if (sec) {
        var nm = sec.querySelector('[data-cat-f="name"]');
        nm.focus(); nm.select();
        sec.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });

    var expAll = body.querySelector('#adminExpandAll');
    if (expAll) expAll.addEventListener('click', function () {
      cats().forEach(function (c) { openCats[c.id] = true; });
      refreshCats(root);
    });    var colAll = body.querySelector('#adminCollapseAll');
    if (colAll) colAll.addEventListener('click', function () {
      openCats = {};
      refreshCats(root);
    });

    bindBookmarkImport(root, body);

    var resetData = body.querySelector('#adminResetData');
    if (resetData) resetData.addEventListener('click', function () {
      askConfirm({
        title: '恢复默认数据？',
        desc: '你在后台对<b>分类与站点</b>的所有修改都会被丢弃，回到 <code>data.js</code> 里的出厂内容。<br>这个操作<b>无法撤销</b>，建议先下载一份备份。',
        ok: '确认恢复'
      }, resetDataNow);
    });
    function resetDataNow() {
      Store.resetData();
      openCats = {}; firstRun = true;
      toast('已恢复默认站点数据');
      refreshBody(root);
    }

    /* ---------- 自定义链接 ---------- */
    var linksWrap = body.querySelector('.admin-links');
    if (linksWrap) {
      linksWrap.addEventListener('input', function (e) {
        var input = e.target.closest('[data-f]');
        if (!input) return;
        var i = +input.closest('.admin-link').getAttribute('data-i');
        var patch = {};
        patch[input.getAttribute('data-f')] = input.value;
        Store.updateLink(i, patch);
        applyChrome();
        refreshPreview(body);
      });
      linksWrap.addEventListener('click', function (e) {
        var op = e.target.closest('[data-op]');
        if (!op) return;
        var i = +op.closest('.admin-link').getAttribute('data-i');
        var kind = op.getAttribute('data-op');

        if (kind === 'emoji') {
          var row = op.closest('.admin-link');
          var input = row.querySelector('[data-f="icon"]');
          openEmoji(op, function (emoji) {
            input.value = emoji;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          });
          return;
        }
        if (kind !== 'del') return;
        Store.removeLink(i);
        toast('已删除');
        applyChrome();
        refreshBody(root);
      });
    }
    var addBtn = body.querySelector('#adminAdd');
    if (addBtn) addBtn.addEventListener('click', function () {
      if (Store.addLink({ icon: '', name: '', url: '' })) {
        applyChrome();
        refreshBody(root);
        var rows = root.querySelectorAll('.admin-link');
        var last = rows[rows.length - 1];
        if (last) last.querySelector('.admin-link__name').focus();
      } else {
        toast('最多只能添加 ' + MAX + ' 个');
      }
    });

    /* ---------- 站点信息 ---------- */
    body.querySelectorAll('[data-site]').forEach(function (el) {
      var key = el.getAttribute('data-site');
      var evt = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(evt, function () {
        var patch = {};
        patch[key] = el.type === 'checkbox' ? el.checked : el.value;
        Store.set(patch);
        if (key === 'themeDefault' && app().applyTheme) app().applyTheme(el.value, true);
        applyChrome();
      });
    });
    /* Logo / Favicon 填网址时同步预览 */
    body.querySelectorAll('[data-img-preview]').forEach(function (box) {
      var key = box.getAttribute('data-img-preview');
      var el = body.querySelector('[data-home="' + key + '"], [data-site="' + key + '"]');
      if (!el) return;
      el.addEventListener('input', function () { updatePreview(root, key, el.value.trim()); });
    });

    /* ---------- 首页内容 ---------- */
    body.querySelectorAll('[data-home]').forEach(function (el) {
      var key = el.getAttribute('data-home');
      function apply() {
        /* 复选框（赞助开关）存 true/false，别的都存字符串 */
        var v = el.type === 'checkbox' ? el.checked : el.value;
        var patch = {};
        if (key === 'rotator') patch.rotator = parseList(v);
        else if (key === 'featuredCount') patch.featuredCount = v;
        else patch[key] = (key === 'image' || key === 'sponsorImage' || key === 'imageLink') ? String(v).trim() : v;
        Store.setHome(patch);
        if (key === 'image') updatePreview(root, 'image', patch.image);
        if (key === 'sponsorImage') updatePreview(root, 'sponsorImage', patch.sponsorImage);
        if (key === 'sponsorOn') {
          var badge = root.querySelector('#spBadge');
          if (badge) badge.textContent = el.checked ? '首页显示中' : '已隐藏';
        }
      }
      el.addEventListener('input', apply);
      el.addEventListener('change', apply);
    });

    /* ---------- 关于页（#/about） ---------- */
    body.querySelectorAll('[data-about]').forEach(function (el) {
      var key = el.getAttribute('data-about');
      el.addEventListener('input', function () {
        var patch = {};
        patch[key] = el.value;
        Store.setAbout(patch);
      });
      el.addEventListener('change', function () {
        var patch = {};
        patch[key] = el.value;
        Store.setAbout(patch);
      });
    });
    var aboutReset = body.querySelector('#adminAboutReset');
    if (aboutReset) aboutReset.addEventListener('click', function () {
      askConfirm({
        title: '恢复关于页默认正文？',
        desc: '你改过的标题、导语和正文都会换回最初写好的那一版。<br>这一步不影响首页其他内容。',
        ok: '确认恢复'
      }, function () {
        Store.resetAbout();
        toast('关于页已恢复默认 ✦');
        refreshBody(root);
      });
    });

    /* 今日精选：勾上哪条，首页就显示哪条（勾的顺序不管，页面上统一按分享页顺序排） */
    var picksBox = body.querySelector('#adminPicks');
    if (picksBox) {
      var syncPicks = function () {
        var picked = Store.home().featuredPicks || [];
        var full = picked.length >= Store.MAX_FEATURED_PICKS;
        var cnt = root.querySelector('#picksCount');
        if (cnt) cnt.textContent = picked.length ? picked.length + ' 条指定' : '自动';
        var clear = root.querySelector('#adminPicksClear');
        if (clear) clear.disabled = !picked.length;
        var tip = picksBox.parentNode.querySelector('.admin-actions .admin-tip');
        if (tip) tip.textContent = '已勾 ' + picked.length + ' / ' + Store.MAX_FEATURED_PICKS + ' 条';
        picksBox.querySelectorAll('[data-pick]').forEach(function (cb) {
          var on = cb.checked;
          cb.closest('.pick-row').classList.toggle('is-on', on);
          cb.disabled = !on && full;
        });
      };
      picksBox.addEventListener('change', function (e) {
        var cb = e.target.closest('[data-pick]');
        if (!cb) return;
        var key = cb.getAttribute('data-pick');
        var cur = (Store.home().featuredPicks || []).slice();
        var i = cur.indexOf(key);
        if (cb.checked && i < 0) {
          if (cur.length >= Store.MAX_FEATURED_PICKS) {
            cb.checked = false;
            toast('最多指定 ' + Store.MAX_FEATURED_PICKS + ' 条');
            return;
          }
          cur.push(key);
        } else if (!cb.checked && i > -1) {
          cur.splice(i, 1);
        }
        Store.setHome({ featuredPicks: cur });
        syncPicks();
      });
      var picksSearch = root.querySelector('#picksSearch');
      if (picksSearch) picksSearch.addEventListener('input', function () {
        picksQuery = picksSearch.value;
        picksBox.innerHTML = picksRowsHtml(Store.home());
      });

      var picksClear = root.querySelector('#adminPicksClear');
      if (picksClear) picksClear.addEventListener('click', function () {
        Store.setHome({ featuredPicks: [] });
        picksBox.querySelectorAll('[data-pick]').forEach(function (cb) { cb.checked = false; });
        syncPicks();
        toast('已回到自动：首页取最新的几条');
      });
    }

    var statsWrap = body.querySelector('#adminStats');
    if (statsWrap) {
      statsWrap.addEventListener('input', function (e) {
        var el = e.target, f = el.getAttribute('data-stat-f');
        if (!f || f === 'auto') return;
        var i = +el.closest('.srow').getAttribute('data-si');
        var list = Store.home().stats;
        if (!list[i]) return;
        list[i][f] = el.value;
        Store.setHome({ stats: list });
      });
      statsWrap.addEventListener('change', function (e) {
        var el = e.target;
        if (el.getAttribute('data-stat-f') !== 'auto') return;
        var i = +el.closest('.srow').getAttribute('data-si');
        var list = Store.home().stats;
        if (!list[i]) return;
        list[i].auto = el.value;
        if (el.value) list[i].n = '';
        Store.setHome({ stats: list });
        refreshBody(root);
      });
      statsWrap.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-stat-op]');
        if (!btn || btn.getAttribute('data-stat-op') !== 'del') return;
        var i = +btn.getAttribute('data-si');
        var list = Store.home().stats;
        list.splice(i, 1);
        Store.setHome({ stats: list });
        refreshBody(root);
      });
    }
    var addStat = body.querySelector('#adminAddStat');
    if (addStat) addStat.addEventListener('click', function () {
      var list = Store.home().stats;
      if (list.length >= Store.MAX_STATS) { toast('最多 ' + Store.MAX_STATS + ' 项'); return; }
      list.push({ auto: '', n: '0', s: '' });
      Store.setHome({ stats: list });
      refreshBody(root);
    });

    var entriesWrap = body.querySelector('#adminEntries');
    if (entriesWrap) {
      entriesWrap.addEventListener('input', function (e) {
        var el = e.target, f = el.getAttribute('data-entry-f');
        if (!f || f === 'spark') return;
        var i = +el.closest('.erow').getAttribute('data-ei');
        var list = Store.home().entries;
        if (!list[i]) return;
        list[i][f] = el.value;
        Store.setHome({ entries: list });
      });
      entriesWrap.addEventListener('change', function (e) {
        var el = e.target;
        if (el.getAttribute('data-entry-f') !== 'spark') return;
        var i = +el.closest('.erow').getAttribute('data-ei');
        var list = Store.home().entries;
        if (!list[i]) return;
        list[i].spark = el.checked;
        Store.setHome({ entries: list });
        refreshBody(root);
      });
      entriesWrap.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-entry-op]');
        if (!btn || btn.getAttribute('data-entry-op') !== 'del') return;
        var i = +btn.getAttribute('data-ei');
        var list = Store.home().entries;
        list.splice(i, 1);
        Store.setHome({ entries: list });
        refreshBody(root);
      });
    }
    var addEntry = body.querySelector('#adminAddEntry');
    if (addEntry) addEntry.addEventListener('click', function () {
      var list = Store.home().entries;
      if (list.length >= Store.MAX_ENTRIES) { toast('最多 ' + Store.MAX_ENTRIES + ' 张'); return; }
      list.push({ icon: '✨', title: '', desc: '', route: '#/home', spark: false });
      Store.setHome({ entries: list });
      refreshBody(root);
    });

    var resetHome = body.querySelector('#adminResetHome');
    if (resetHome) resetHome.addEventListener('click', function () {
      askConfirm({
        title: '恢复首页默认内容？',
        desc: '首页的<b>文案、图片、统计与卡片</b>都会回到出厂状态。<br>站点数据与分享内容不受影响。',
        ok: '确认恢复'
      }, function () {
        Store.setHome(cloneObj(Store.DEFAULTS.home));
        toast('已恢复首页默认内容');
        applyChrome();
        refreshBody(root);
      });
    });

    /* ---------- 图片上传 ---------- */
    body.querySelectorAll('[data-img-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = body.querySelector('[data-img-file="' + btn.getAttribute('data-img-pick') + '"]');
        if (input) input.click();
      });
    });
    body.querySelectorAll('[data-img-file]').forEach(function (input) {
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        if (!f) return;
        var key = input.getAttribute('data-img-file');
        var scope = input.getAttribute('data-img-scope');
        if (f.size > 12 * 1024 * 1024) { toast('图片超过 12MB，换一张小一点的吧'); input.value = ''; return; }
        shrinkImage(f, function (dataUrl, big) {
          if (dataUrl) saveImg(root, scope, key, dataUrl, big);
        });
        input.value = '';
      });
    });
    body.querySelectorAll('[data-img-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        saveImg(root, btn.getAttribute('data-img-scope'), btn.getAttribute('data-img-clear'), '');
      });
    });

    /* ---------- 赞助收款码：多张，每张单独认名字 / 图片 / 跳转 ---------- */
    function writeCodes(list) {
      /* 顺手把老的单图字段清空：它已经搬进列表第一行了，留着只会跟列表打架 */
      Store.setHome({ sponsorCodes: list, sponsorImage: '' });
    }
    function setCode(i, patch) {
      var list = (Store.home().sponsorCodes || []).slice();
      var cur = list[i] || {};
      var next = { src: cur.src || '', label: cur.label || '', link: cur.link || '' };
      Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
      list[i] = next;
      writeCodes(list);
    }
    body.querySelectorAll('[data-code-f]').forEach(function (el) {
      var row = el.parentNode.parentNode;
      while (row && !row.getAttribute('data-ci')) row = row.parentNode;
      if (!row) return;
      var i = parseInt(row.getAttribute('data-ci'), 10);
      var f = el.getAttribute('data-code-f');
      function apply() {
        var v = String(el.value == null ? '' : el.value).trim();
        var patch = {};
        patch[f] = v;
        setCode(i, patch);
        if (f === 'src') codePreview(root, i, v);
      }
      el.addEventListener('input', apply);
      el.addEventListener('change', apply);
    });
    body.querySelectorAll('[data-code-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = body.querySelector('[data-code-file="' + btn.getAttribute('data-code-pick') + '"]');
        if (input) input.click();
      });
    });
    body.querySelectorAll('[data-code-file]').forEach(function (input) {
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        if (!f) return;
        var i = parseInt(input.getAttribute('data-code-file'), 10);
        if (f.size > 6 * 1024 * 1024) { toast('图片超过 6MB，换一张小一点的吧'); input.value = ''; return; }
        shrinkImage(f, function (dataUrl) {
          if (!dataUrl) return;
          setCode(i, { src: dataUrl });
          applyChrome();
          refreshBody(root);
          toast('收款码已更新 ✦');
        }, 480);
        input.value = '';
      });
    });
    body.querySelectorAll('[data-code-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.getAttribute('data-code-clear'), 10);
        setCode(i, { src: '' });
        refreshBody(root);
        toast('已清掉这张图');
      });
    });
    body.querySelectorAll('[data-code-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.getAttribute('data-code-del'), 10);
        var list = (Store.home().sponsorCodes || []).slice();
        askConfirm({
          title: '删掉这张收款码？',
          desc: '只会从首页那块掉下来，别的地方不受影响。',
          ok: '删掉'
        }, function () {
          list.splice(i, 1);
          writeCodes(list);
          applyChrome();
          refreshBody(root);
          toast('已删掉');
        });
      });
    });
    var addCode = body.querySelector('#adminAddCode');
    if (addCode) addCode.addEventListener('click', function () {
      var list = (Store.home().sponsorCodes || []).slice();
      if (list.length >= Store.MAX_SPONSOR_CODES) { toast('最多 ' + Store.MAX_SPONSOR_CODES + ' 张'); return; }
      list.push({ src: '', label: '', link: '' });
      writeCodes(list);
      refreshBody(root);
    });

    /* ---------- 备份 ---------- */
    function syncAfterRestore(withData) {
      applyChrome();
      if (app().applyTheme) app().applyTheme(Store.get().themeDefault);
      if (app().applyPosts) app().applyPosts();
      if (app().applyFeed) app().applyFeed();
      if (withData) { openCats = {}; firstRun = true; }
      refreshBody(root);
    }

    /* 发布到虚拟主机：下载 site-data.js（体检有标红错误时先拦一道） */
    var snDownload = body.querySelector('#snDownload');
    if (snDownload) snDownload.addEventListener('click', function () {
      snapGate(function () {
        var text = staticJs(splitImgs);
        download('site-data.js', text, 'application/javascript');
        snapSave({ at: nowText(), sig: snapSig(text) });

        /* 勾了「拆图片」就把图片文件也一起给出去，隔 400ms 一个，
           免得浏览器把连续下载当成弹窗拦掉 */
        var imgs = splitImgs ? staticImageFiles(Store.get()) : [];
        imgs.forEach(function (im, i) {
          setTimeout(function () { saveImageFile(im); }, 400 * (i + 1));
        });

        toast(imgs.length
          ? 'site-data.js + ' + imgs.length + ' 张图片已下载，图片放 assets/img/ ⬆'
          : 'site-data.js 已下载，传到 assets/js/ 覆盖同名文件 ⬆');
        refreshBody(root);
      });
    });

    /* 拆图片开关：勾上后重新算一遍体积 */
    var snSplit = body.querySelector('#snSplitImg');
    if (snSplit) snSplit.addEventListener('change', function () {
      splitImgs = !!snSplit.checked;
      refreshBody(root);
    });

    /* 顺手生成 RSS */
    var snFeed = body.querySelector('#snFeed');
    if (snFeed) snFeed.addEventListener('click', function () {
      var r = buildFeedXml();
      download('feed.xml', r.text, 'application/rss+xml');
      toast('feed.xml 已下载 · ' + r.count + ' 条（传到网站根目录）');
    });

    /* 核对线上版本：读线上那份 site-data.js 的导出时间 */
    var snLive = body.querySelector('#snLive');
    var snLiveOut = body.querySelector('#snLiveOut');
    if (snLive) snLive.addEventListener('click', function () {
      if (!snLiveOut) return;
      snLiveOut.hidden = false;
      snLiveOut.textContent = '正在读取线上文件…';
      liveCheck(function (err, info) {
        if (err) {
          snLiveOut.textContent = '读不到线上的 site-data.js（' + err + '）。' +
            '多半是还没传上去，或者网页和这个文件不在同一个站点下。';
          return;
        }
        var mine = (snapRecord() || {}).at || '';
        var head = localPreview()
          ? '这是本机预览地址，结果只代表本地文件；上线后到虚拟主机的后台再点一次更准。'
          : '';
        var msg;
        if (info.empty) {
          msg = '线上那份还是<b>出厂的空文件</b>（' + fmtBytes(info.bytes) + '）—— ' +
            'site-data.js 还没传上去，访客现在看到的是 data.js 里的默认内容。';
        } else if (!info.at) {
          msg = '线上文件读到了（' + fmtBytes(info.bytes) + '），但没认出导出时间，可能被改过。';
        } else if (mine && info.at === mine) {
          msg = '✅ 线上就是你导出的这一份（' + info.at + '，' + fmtBytes(info.bytes) + '），传成功了。';
        } else if (mine) {
          msg = '线上是 <b>' + esc(info.at) + '</b>（' + fmtBytes(info.bytes) + '），' +
            '你本机上次导出是 <b>' + esc(mine) + '</b> —— 对不上，多半还没传上去，或者传完没刷新。';
        } else {
          msg = '线上是 <b>' + esc(info.at) + '</b>，你本机还没导出过，所以这份是别处传的。';
        }
        snLiveOut.innerHTML = (head ? head + '<br>' : '') + msg;
      });
    });

    var snCopy = body.querySelector('#snCopy');
    if (snCopy) snCopy.addEventListener('click', function () {
      snapGate(function () {
        var text = staticJs(splitImgs);
        copyText(text);
        snapSave({ at: nowText(), sig: snapSig(text) });
      });
    });

    /* 手动打一个快照：起名 → 钉住当前这一版 */
    var histPin = body.querySelector('#histPin');
    var histName = body.querySelector('#histName');
    if (histPin) histPin.addEventListener('click', function () {
      var name = histName ? histName.value.trim() : '';
      if (!histSnapshot(name)) {
        toast('存不下 —— 浏览器存储快满了，先清一点历史再试');
        return;
      }
      toast(name ? '已记下「' + name + '」✦' : '已记下当前这一版 ✦');
      refreshBody(root);
    });
    if (histName && histPin) {
      histName.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); histPin.click(); }
      });
    }

    /* 只删掉历史里的某一条 */
    body.querySelectorAll('[data-hdel]').forEach(function (b) {
      b.addEventListener('click', function () {
        var list = histAll();
        var i = +b.getAttribute('data-hdel');
        if (!list[i]) { refreshBody(root); return; }
        list.splice(i, 1);
        histWrite(list);
        toast('删掉一份历史记录');
        refreshBody(root);
      });
    });

    /* 版本历史：恢复 / 清空 */
    body.querySelectorAll('[data-hist]').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.getAttribute('data-hist');
        var rec = histAll()[i];
        if (!rec) { toast('这一版已经不在了'); refreshBody(root); return; }
        var meta = HIST_KINDS[rec.kind] || { name: rec.kind };
        var isAll = rec.kind === 'all';
        askConfirm({
          title: isAll ? '回到「' + (rec.name || '整站快照') + '」？'
                       : '恢复到这一版「' + meta.name + '」？',
          desc: (isAll ? '这份快照记于 ' + histTime(rec.t) + '。'
                       : '时间是 ' + histTime(rec.t) + ' 之前的那一版。') + '<br>' +
                (isAll ? '站点数据、分享、文章、设置会一起回到这一版。' : '当前内容会被覆盖成它。') +
                '这次恢复之前的模样也会记进历史，反悔还能再恢复回来。',
          ok: '确认恢复'
        }, function () {
          if (!histRestore(i)) { toast('恢复失败，这一版可能已经被挤掉了'); return; }
          toast('已恢复到 ' + histTime(rec.t) + ' 那一版 ✦');
          syncAfterRestore(true);
        });
      });
    });
    var histClear = body.querySelector('#histClear');
    if (histClear) histClear.addEventListener('click', function () {
      askConfirm({
        title: '清空版本历史？',
        desc: '留存的旧版本会全部删掉，之后就没法回退了。<br>站点数据、分享、文章、设置本身不受影响。',
        ok: '确认清空'
      }, function () {
        try { localStorage.removeItem(HIST_KEY); } catch (e) {}
        toast('版本历史已清空');
        refreshBody(root);
      });
    });

    /* 下载一个包含全部内容的备份文件 */
    var bkDownload = body.querySelector('#bkDownload');
    if (bkDownload) bkDownload.addEventListener('click', function () {
      download('xingyu-backup-' + stamp() + '.json', JSON.stringify(backupObject(), null, 2));
      toast('备份文件已下载 ⬇');
    });

    /* 从文件恢复 */
    var bkChoose = body.querySelector('#bkChoose');
    var bkFile = body.querySelector('#bkFile');
    var bkName = body.querySelector('#bkFileName');
    if (bkChoose && bkFile) {
      bkChoose.addEventListener('click', function () { bkFile.click(); });
      bkFile.addEventListener('change', function () {
        var f = bkFile.files && bkFile.files[0];
        if (!f) return;
        if (bkName) bkName.textContent = f.name;
        var reader = new FileReader();
        reader.onload = function () {
          var obj = null;
          try { obj = JSON.parse(reader.result); } catch (e) { obj = null; }
          var info = describeBackup(obj);
          if (!info) {
            toast('这个文件不是壹号栈的备份');
            if (bkName) bkName.textContent = f.name + '（无法识别）';
            bkFile.value = '';
            return;
          }
          askConfirm({
            title: '恢复这份备份？',
            desc: '文件 <b>' + esc(f.name) + '</b> 包含 ' + info +
                  '。<br>当前后台里的内容会被覆盖，这个操作无法撤销。',
            ok: '确认恢复'
          }, function () {
            applyBackup(obj);
            toast('备份已恢复 ✦');
            syncAfterRestore(true);
          });
          bkFile.value = '';
        };
        reader.onerror = function () { toast('文件读取失败'); bkFile.value = ''; };
        reader.readAsText(f);
      });
    }

    bindGist(root, body);

    /* 恢复默认（都先确认） */
    var bkResetCfg = body.querySelector('#bkResetCfg');
    if (bkResetCfg) bkResetCfg.addEventListener('click', function () {
      askConfirm({
        title: '恢复默认设置？',
        desc: '站名、标语、主题、自定义链接等都会被重置为出厂内容。<br>这个操作无法撤销。',
        ok: '确认恢复'
      }, function () {
        Store.reset();
        toast('已恢复默认设置');
        syncAfterRestore(false);
      });
    });
    var bkResetData = body.querySelector('#bkResetData');
    if (bkResetData) bkResetData.addEventListener('click', function () {
      askConfirm({
        title: '恢复默认数据？',
        desc: '所有<b>分类与站点</b>都会回到 <code>data.js</code> 里的出厂内容，你在后台做的改动会丢失。<br>这个操作<b>无法撤销</b>，建议先下载一份备份。',
        ok: '确认恢复'
      }, function () {
        Store.resetData();
        toast('已恢复默认站点数据');
        syncAfterRestore(true);
      });
    });

    var bkResetFeed = body.querySelector('#bkResetFeed');
    if (bkResetFeed) bkResetFeed.addEventListener('click', function () {
      askConfirm({
        title: '恢复默认分享？',
        desc: '所有<b>分享条目</b>都会回到 <code>data.js</code> 里的出厂内容，你在后台加的会丢失。<br>这个操作<b>无法撤销</b>，建议先下载一份备份。',
        ok: '确认恢复'
      }, function () {
        Store.resetFeed();
        feedEditing = null;
        feedQuery = '';
        toast('已恢复默认分享');
        syncAfterRestore(true);
      });
    });

    var bkResetPosts = body.querySelector('#bkResetPosts');
    if (bkResetPosts) bkResetPosts.addEventListener('click', function () {
      askConfirm({
        title: '恢复默认文章？',
        desc: '所有<b>文章</b>都会回到 <code>data.js</code> 里的出厂内容，你写的那些会丢失。<br>这个操作<b>无法撤销</b>，建议先下载一份备份。',
        ok: '确认恢复'
      }, function () {
        Store.resetPosts();
        editing = null;
        postQuery = '';
        toast('已恢复默认文章');
        syncAfterRestore(true);
      });
    });

    /* 进阶：复制到剪贴板 */
    var cpData = body.querySelector('#bkCopyData');
    if (cpData) cpData.addEventListener('click', function () {
      copyText(Store.exportDataJSON(), root);
    });
    var cpCfg = body.querySelector('#bkCopyCfg');
    if (cpCfg) cpCfg.addEventListener('click', function () {
      copyText(Store.exportJSON(), root);
    });

    /* ---------- 口令 ---------- */
    var passBtn = body.querySelector('#adminSavePass');
    if (passBtn) passBtn.addEventListener('click', function () {
      var a = body.querySelector('#adminNewPass'), b = body.querySelector('#adminNewPass2');
      if (!a.value || a.value.length < 3) { toast('口令至少 3 位'); a.focus(); return; }
      if (a.value !== b.value) { toast('两次输入不一致'); b.focus(); return; }
      Store.setPasscode(a.value);
      a.value = ''; b.value = '';
      toast('口令已更新 ✦');
      refreshBody(root);
    });
  }

  /* ---------- 图标挑选器 ---------- */
  var EMOJI = [
    '😀','🎨','📚','📝','💡','🔥','✨','🚀','🎧','🎬','📷','🖼',
    '🎮','🧩','🧪','💻','🖥','⌨️','📱','🔧','🧭','🗺','📍','🏠',
    '🎓','💼','📈','📊','💰','🛒','🏷','🎁','❤️','⭐','🌈','⚡',
    '🌙','🍀','🌸','🐙','🤖','🐦','🦊','🐳','☁️','🔒','🔑','📮',
    '📌','🔖','🗂','📁','🎯','🧠','👀','🎵','📖','✏️','🖋','🕹',
    '🏆','🍜','☕','🧊'
  ];

  function closeEmoji() {
    var p = document.getElementById('emojiPop');
    if (!p) return;
    if (p._outside) document.removeEventListener('mousedown', p._outside);
    document.removeEventListener('keydown', p._esc);
    p.remove();
  }

  function openEmoji(anchor, onPick) {
    closeEmoji();
    var pop = document.createElement('div');
    pop.className = 'emoji-pop';
    pop.id = 'emojiPop';
    pop.innerHTML =
      '<div class="emoji-pop__title">挑一个图标（可留空）</div>' +
      '<div class="emoji-pop__grid">' +
        EMOJI.map(function (e) { return '<button type="button" data-emoji="' + e + '">' + e + '</button>'; }).join('') +
      '</div>' +
      '<button class="emoji-pop__clear" type="button" data-emoji="">✕ 不用图标，只显示文字</button>';
    document.body.appendChild(pop);

    var r = anchor.getBoundingClientRect();
    var w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.min(Math.max(10, r.left - 20), window.innerWidth - w - 10) + 'px';
    var top = r.bottom + 8;
    if (top + h > window.innerHeight - 10) top = Math.max(10, r.top - h - 8);
    pop.style.top = top + 'px';

    pop.addEventListener('click', function (e) {
      var b = e.target.closest('[data-emoji]');
      if (!b) return;
      onPick(b.getAttribute('data-emoji'));
      closeEmoji();
    });
    pop._outside = function (e) {
      if (!pop.contains(e.target) && e.target !== anchor) closeEmoji();
    };
    pop._esc = function (e) { if (e.key === 'Escape') closeEmoji(); };
    setTimeout(function () {
      document.addEventListener('mousedown', pop._outside);
      document.addEventListener('keydown', pop._esc);
    }, 0);
  }

  /* ---------- 确认框 ---------- */
  function closeConfirm() {
    var m = document.getElementById('confirmMask');
    if (!m) return;
    if (m._esc) document.removeEventListener('keydown', m._esc);
    m.remove();
  }

  function askConfirm(opts, onOk) {
    closeConfirm();
    var mask = document.createElement('div');
    mask.className = 'confirm-mask';
    mask.id = 'confirmMask';
    mask.innerHTML =
      '<div class="confirm-box" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
        '<div class="confirm-box__icon">' + (opts.icon || '⚠️') + '</div>' +
        '<h3>' + esc(opts.title) + '</h3>' +
        '<p>' + (opts.desc || '') + '</p>' +
        '<div class="confirm-actions">' +
          '<button class="btn btn--ghost" type="button" data-confirm="no">' + esc(opts.cancel || '取消') + '</button>' +
          '<button class="btn ' + (opts.safe ? 'btn--primary' : 'btn--danger') + '" type="button" data-confirm="yes">' + esc(opts.ok || '确认') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(mask);
    mask.addEventListener('click', function (e) {
      var b = e.target.closest('[data-confirm]');
      if (b) {
        var yes = b.getAttribute('data-confirm') === 'yes';
        closeConfirm();
        if (yes && onOk) onOk();
        return;
      }
      if (e.target === mask) closeConfirm();
    });
    mask._esc = function (e) { if (e.key === 'Escape') closeConfirm(); };
    document.addEventListener('keydown', mask._esc);
    setTimeout(function () {
      var y = mask.querySelector('[data-confirm="no"]');
      if (y) y.focus();
    }, 20);
  }

  /* ---------- 绑定小工具 ---------- */
  /* 保存图片（上传 / 网址 / 清空） */
  function saveImg(root, scope, key, val, big) {
    var patch = {};
    patch[key] = val;
    if (scope === 'home') Store.setHome(patch); else Store.set(patch);
    if (val && Store.saveFailed) {
      toast('这张图太大了，浏览器存不下，换张小一点的');
    } else if (!val) {
      toast('已恢复默认');
    } else if (big) {
      toast('已换上（图片略大，建议先压缩）');
    } else {
      toast('图片已更新 ✦');
    }
    applyChrome();
    refreshBody(root);
  }

  /* 更新图片预览 */
  function updatePreview(root, key, val) {
    var box = root.querySelector('[data-img-preview="' + key + '"]');
    if (!box) return;
    if (val) {
      box.innerHTML = '<img src="' + esc(val) + '" alt="" />';
    } else {
      box.innerHTML = '<span class="img-preview__none">' +
        esc(box.getAttribute('data-img-none') || '默认') + '</span>';
    }
  }

  /* 收款码那一行的小预览 */
  function codePreview(root, i, src) {
    var box = root.querySelector('[data-code-preview="' + i + '"]');
    if (!box) return;
    box.innerHTML = src ? '<img src="' + esc(src) + '" alt="" />' : '<span>未放图</span>';
  }

  /* 把图片读成 data URL；过大就等比缩到 1100px 以内再输出 */
  var IMG_MAX_PX = 1100;
  var IMG_MAX_CHARS = 900000;

  function shrinkImage(file, cb, maxPx) {
    /* maxPx：这一张最多缩到多少像素。收款码只需显示 130px 左右，传 480 就够，
       六张加起来也不会把 localStorage 撑爆；大图 / Logo 走默认的 1100。 */
    var cap = maxPx || IMG_MAX_PX;
    var fr = new FileReader();
    fr.onerror = function () { toast('图片读取失败'); cb(null); };
    fr.onload = function () {
      var raw = String(fr.result || '');
      // SVG 通常很小，缩放反而会画不出来，直接用
      if (/svg/i.test(file.type) || raw.length <= IMG_MAX_CHARS) {
        cb(raw, raw.length > IMG_MAX_CHARS);
        return;
      }
      var img = new Image();
      img.onerror = function () { cb(raw, raw.length > IMG_MAX_CHARS); };
      img.onload = function () {
        var w = img.naturalWidth || img.width || 0;
        var h = img.naturalHeight || img.height || 0;
        if (!w || !h) { cb(raw, raw.length > IMG_MAX_CHARS); return; }
        var scale = Math.min(1, cap / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        var out = '';
        try {
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          var png = /image\/png/i.test(file.type);
          out = cv.toDataURL(png ? 'image/png' : 'image/jpeg', 0.86);
          if (png && out.length > IMG_MAX_CHARS) out = cv.toDataURL('image/jpeg', 0.88);
        } catch (e) { out = ''; }
        if (!out || out.length > raw.length) out = raw;
        cb(out, out.length > IMG_MAX_CHARS);
      };
      img.src = raw;
    };
    fr.readAsDataURL(file);
  }

  /* ======================= 拖拽排序 ======================= */
  /* 用手势（Pointer Events）代替 ↑↓ 按钮：按住每行左侧的握把拖动即可换位置。
     鼠标 / 触屏 / 触控笔走同一套逻辑；拖动中直接搬 DOM（所见即所得），
     松手时把 DOM 顺序写回数据再重绘。握把聚焦后也能用 ↑ ↓ 微调。 */
  var DND = null;
  var dragReady = false;
  var autoTimer = null, autoEl = null, autoDir = 0;

  function appRoot() { return document.getElementById('app'); }

  function dragEls(box) {
    return Array.prototype.filter.call(box.children, function (el) {
      return el.nodeType === 1 && el.hasAttribute && el.hasAttribute('data-drag-item');
    });
  }

  /* 按拖动后的顺序重排数组（order 是原来索引的一个排列） */
  function applyPerm(arr, order) {
    var next = order.map(function (i) { return arr[i]; });
    arr.length = 0;
    for (var k = 0; k < next.length; k++) arr.push(next[k]);
  }

  /* 把正在拖的元素插到指针所在的位置 */
  function placeItem(box, dragged, x, y, grid) {
    var items = dragEls(box).filter(function (el) { return el !== dragged; });
    if (!items.length) return;
    var r, i;

    if (grid) {
      /* 多列网格：先找离指针最近的一格，再按指针落在它的前半 / 后半决定前插还是后插 */
      var best = 0, bestD = Infinity;
      for (i = 0; i < items.length; i++) {
        r = items[i].getBoundingClientRect();
        var dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
        var d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      }
      var t = items[best];
      r = t.getBoundingClientRect();
      var inBand = y >= r.top && y <= r.bottom;
      var before = inBand ? (x < r.left + r.width / 2) : (y < r.top);
      box.insertBefore(dragged, before ? t : (items[best + 1] || t.nextSibling));
      return;
    }

    /* 单列：越过中线就往下插 */
    for (i = 0; i < items.length; i++) {
      r = items[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) { box.insertBefore(dragged, items[i]); return; }
    }
    var last = items[items.length - 1];
    box.insertBefore(dragged, last.nextSibling);
  }

  function onPointerDown(e) {
    if (e.button && e.button !== 0) return;
    var t = e.target;
    if (!t || !t.closest) return;
    var handle = t.closest('[data-drag]');
    if (!handle) return;
    var row = t.closest('[data-drag-item]');
    if (!row) return;
    var box = row.parentElement;
    if (!box || !box.getAttribute('data-drag-box')) return;
    DND = {
      row: row, box: box, handle: handle, pid: e.pointerId,
      kind: box.getAttribute('data-drag-box'),
      grid: box.getAttribute('data-drag-grid') === '1',
      x0: e.clientX, y0: e.clientY, active: false
    };
    /* 阻止拖拽时选中文字 / 触发浏览器原生拖图 */
    e.preventDefault();
    /* preventDefault 会挡掉聚焦，这里手动补上，键盘微调才好用 */
    if (handle.focus) handle.focus();
    try { if (handle.setPointerCapture) handle.setPointerCapture(e.pointerId); } catch (er) {}
  }

  function onPointerMove(e) {
    var d = DND;
    if (!d || e.pointerId !== d.pid) return;
    if (!d.active) {
      /* 超过 4px 才算拖动，单纯点一下不算 */
      if (Math.abs(e.clientX - d.x0) < 4 && Math.abs(e.clientY - d.y0) < 4) return;
      d.active = true;
      document.body.classList.add('is-dragging-row');
      if (d.row) d.row.classList.add('is-dragging');
    }
    e.preventDefault();
    if (!d.box.isConnected) { finishDrag(false); return; }
    /* 指针跑出这一块太多就不动顺序，避免乱跳 */
    var b = d.box.getBoundingClientRect();
    if (e.clientX >= b.left - 70 && e.clientX <= b.right + 70 &&
        e.clientY >= b.top - 70 && e.clientY <= b.bottom + 70) {
      placeItem(d.box, d.row, e.clientX, e.clientY, d.grid);
    }
    autoScrollStep(d, e.clientY);
  }

  function onPointerUp(e) {
    var d = DND;
    if (!d || (e.pointerId != null && e.pointerId !== d.pid)) return;
    finishDrag(true);
  }

  function onPointerCancel(e) {
    if (!DND || (e.pointerId != null && e.pointerId !== DND.pid)) return;
    finishDrag(false);
  }

  /* 收尾。commit=true：把顺序写回数据；false（取消 / 元素已失效）：按数据重画还原 */
  function finishDrag(commit) {
    var d = DND;
    if (!d) return;
    DND = null;
    stopAutoScroll();
    document.body.classList.remove('is-dragging-row');
    if (d.row) d.row.classList.remove('is-dragging');
    try { if (d.handle && d.handle.releasePointerCapture) d.handle.releasePointerCapture(d.pid); } catch (er) {}
    if (!d.active) return;
    if (!commit || !d.box.isConnected) { rerenderKind(d.kind); return; }
    commitOrder(d.kind, d.box);
  }

  /* --- 拖到上 / 下边缘时自动滚动，长列表也能拖到看不见的地方 --- */
  function scrollHost(box) {
    var n = box;
    while (n && n.nodeType === 1) {
      var st = null;
      try { st = getComputedStyle(n); } catch (er) { st = null; }
      if (st && /(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 4) return n;
      if (n === document.body) break;
      n = n.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function autoScrollStep(d, y) {
    var el = scrollHost(d.box);
    if (!el) { stopAutoScroll(); return; }
    var top = 0, bottom = 0;
    if (el === document.scrollingElement || el === document.documentElement || el === document.body) {
      top = 0; bottom = window.innerHeight || 0;
    } else {
      var r = el.getBoundingClientRect();
      top = r.top; bottom = r.bottom;
    }
    var edge = 56, dir = 0;
    if (y < top + edge) dir = -1;
    else if (y > bottom - edge) dir = 1;
    if (!dir) { stopAutoScroll(); return; }
    if (autoEl === el && autoDir === dir) return;
    stopAutoScroll();
    autoEl = el; autoDir = dir;
    autoTimer = setInterval(function () {
      if (autoEl) autoEl.scrollTop += autoDir * 16;
    }, 16);
  }

  function stopAutoScroll() {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = null; autoEl = null; autoDir = 0;
  }

  function rerenderKind(kind) {
    var root = appRoot();
    if (!root) return;
    if (kind === 'cat' || kind === 'link') refreshCats(root);
    else refreshBody(root);
  }

  /* 把拖动后的 DOM 顺序写回数据 */
  function commitOrder(kind, box) {
    var order = dragEls(box).map(function (el) { return +el.getAttribute('data-drag-item'); });
    var changed = order.some(function (v, i) { return v !== i; });
    if (!changed || order.length < 2) { rerenderKind(kind); return; }

    var sec = box.closest('.acat');
    var ci = sec ? +sec.getAttribute('data-ci') : -1;

    if (kind === 'cat') {
      mutate(function (list) { applyPerm(list, order); });
    } else if (kind === 'link') {
      if (ci < 0) return;
      mutate(function (list) { if (list[ci]) applyPerm(list[ci].links, order); });
    } else if (kind === 'clink') {
      var all = Store.allLinks();
      Store.set({ customLinks: order.map(function (i) { return all[i]; }) });
      if (app().applyChrome) app().applyChrome();
    } else if (kind === 'stat') {
      var s = Store.home().stats;
      Store.setHome({ stats: order.map(function (i) { return s[i]; }) });
    } else if (kind === 'entry') {
      var en = Store.home().entries;
      Store.setHome({ entries: order.map(function (i) { return en[i]; }) });
    }
    rerenderKind(kind);
  }

  /* 键盘替代方案：把手聚焦后按 ↑ ↓（网格里 ← → 也行） */
  function onDragKey(e) {
    var k = e.key;
    if (k !== 'ArrowUp' && k !== 'ArrowDown' && k !== 'ArrowLeft' && k !== 'ArrowRight') return;
    var t = e.target;
    if (!t || !t.closest || !t.closest('[data-drag]')) return;
    var row = t.closest('[data-drag-item]');
    if (!row) return;
    var box = row.parentElement;
    if (!box || !box.getAttribute('data-drag-box')) return;

    var items = dragEls(box);
    var idx = items.indexOf(row);
    var to = idx + ((k === 'ArrowUp' || k === 'ArrowLeft') ? -1 : 1);
    if (idx < 0 || to < 0 || to >= items.length) return;
    e.preventDefault();

    var kind = box.getAttribute('data-drag-box');
    var sec = box.closest('.acat');
    var ci = sec ? +sec.getAttribute('data-ci') : -1;
    var order = items.map(function (_, i) { return i; });
    var tmp = order[idx]; order[idx] = order[to]; order[to] = tmp;

    if (kind === 'cat') {
      mutate(function (list) { applyPerm(list, order); });
    } else if (kind === 'link') {
      if (ci < 0) return;
      mutate(function (list) { if (list[ci]) applyPerm(list[ci].links, order); });
    } else if (kind === 'clink') {
      var all = Store.allLinks();
      Store.set({ customLinks: order.map(function (i) { return all[i]; }) });
      if (app().applyChrome) app().applyChrome();
    } else if (kind === 'stat') {
      var s = Store.home().stats;
      Store.setHome({ stats: order.map(function (i) { return s[i]; }) });
    } else if (kind === 'entry') {
      var en = Store.home().entries;
      Store.setHome({ entries: order.map(function (i) { return en[i]; }) });
    }
    rerenderKind(kind);

    /* 重绘后把焦点还到同一格，可以连着按 */
    var h = handleAt(kind, ci, to);
    if (h) h.focus();
  }

  function handleAt(kind, ci, index) {
    var root = appRoot();
    if (!root) return null;
    var box = kind === 'link'
      ? root.querySelector('.acat[data-ci="' + ci + '"] [data-drag-box="link"]')
      : root.querySelector('[data-drag-box="' + kind + '"]');
    if (!box) return null;
    /* 只在直接子元素里找，别摸到分类卡片里嵌套的站点行 */
    var el = dragEls(box).filter(function (x) {
      return +x.getAttribute('data-drag-item') === index;
    })[0];
    return el ? el.querySelector('.drag-handle') : null;
  }

  function bindDragOnce() {
    if (dragReady) return;
    dragReady = true;
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
    document.addEventListener('keydown', onDragKey);
    window.addEventListener('blur', function () { if (DND && DND.active) finishDrag(false); });
  }

  function focusLast(root, ci, field) {
    var sec = root.querySelector('.acat[data-ci="' + ci + '"]');
    if (!sec) return;
    var rows = sec.querySelectorAll('.alink');
    var row = rows[rows.length - 1];
    if (!row) return;
    var el = row.querySelector('[data-link-f="' + field + '"]');
    if (el) el.focus();
  }

  function copyText(text, root) {
    function ok() { toast('已复制到剪贴板 ✦'); }
    function fail() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var done = false;
      try { done = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      toast(done ? '已复制到剪贴板 ✦' : '复制失败，请手动全选复制');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, fail);
    } else fail();
  }

  function download(name, text, mime) {
    try {
      var blob = new Blob([text], { type: mime || 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    } catch (e) { toast('下载失败，请用「复制」'); }
  }

  window.XY_ADMIN = {
    render: render,
    bind: bind,
    setTab: function (t) { tab = t; }
  };
})();
