/* =========================================================================
   星屿 · 后台管理面板（路由 #/admin）
   纯前端实现：改动实时生效并写入 localStorage。
   想对所有访客永久生效 → 「备份」页导出 JSON/JS，粘回 index.html 或 data.js。
   ========================================================================= */
(function () {
  'use strict';

  var Store = window.XYStore;
  var MAX = Store.MAX_LINKS;
  var TABS = [
    { id: 'sites',    label: '站点数据', icon: '🗂', badge: 'adminTabSitesN' },
    { id: 'home',     label: '首页内容', icon: '🏠' },
    { id: 'links',    label: '自定义链接', icon: '🔗', badge: 'adminTabLinksN' },
    { id: 'site',     label: '站点信息', icon: '🌌' },
    { id: 'backup',   label: '备份',     icon: '💾' },
    { id: 'security', label: '口令',     icon: '🔐' }
  ];

  var tab = 'sites';
  var openCats = {};        // 展开的分类（按 id 记）
  var firstRun = true;
  var siteQuery = '';       // 站点数据搜索词
  var armed = null;         // 两步删除的“已待确认”状态

  /* ---------- 小工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }
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
    if (tab === 'links') return linksPanel();
    if (tab === 'site') return sitePanel();
    if (tab === 'backup') return backupPanel();
    if (tab === 'security') return securityPanel();
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
        '<h2>外观</h2>' +
        '<label class="admin-field"><span class="admin-field__label">默认主题<em>新访客进站时使用</em></span>' +
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
        '<label class="admin-switch"><input type="checkbox" data-site="showSearch"' + (c.showSearch ? ' checked' : '') + ' />' +
          '<span class="admin-switch__track"><span class="admin-switch__dot"></span></span>' +
          '<span class="admin-switch__text">顶栏显示搜索框</span></label>' +
        '<label class="admin-switch"><input type="checkbox" data-site="showIcons"' + (c.showIcons !== false ? ' checked' : '') + ' />' +
          '<span class="admin-switch__track"><span class="admin-switch__dot"></span></span>' +
          '<span class="admin-switch__text">站点卡片显示左侧图标</span></label>' +
        '<p class="admin-tip">「站点卡片左侧图标」<b>只对电脑端生效</b>：手机端卡片本来就只显示名称和简介（长按卡片可收藏 / 复制）。关掉后电脑端一行能看更多站点。</p>' +
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
        '<input data-stat-f="s" value="' + esc(t.s) + '" placeholder="说明文字（如 主题岛屿）" aria-label="说明文字" />' +
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

  function homePanel() {
    var h = Store.home();
    var stats = h.stats || [];
    var entries = h.entries || [];

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
        '<p>默认是一张内置的星轨插画。你可以<b>上传自己的照片</b>替换它，也可以填一个网络图片地址。</p>' +
        imgPicker({ scope: 'home', key: 'image', val: h.image, wide: true, fit: true, fitVal: h.imageFit,
                    none: '内置星轨插画' }) +
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
        '<p class="admin-tip">跳转地址支持站内 <code>#/nav</code>、<code>#/share</code>，也支持站外网址。' +
          '不通向站内的链接会自动在新标签页打开。</p>' +
      '</div>' +

      '<div class="admin-card">' +
        '<h2>今日精选</h2>' +
        '<p>首页最下面那条横向卡片，内容取自「分享」页的最新几条。</p>' +
        hfield('标题', 'featuredTitle', h.featuredTitle, '') +
        hfield('副标题', 'featuredDesc', h.featuredDesc, '') +
        '<label class="admin-field"><span class="admin-field__label">显示条数<em>3 – 12</em></span>' +
          '<input type="number" min="3" max="12" data-home="featuredCount" value="' + h.featuredCount + '" /></label>' +
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
  function backupPanel() {
    var d = counts();
    var lc = Store.allLinks().length;
    return '<div class="admin-card">' +
        '<h2>备份到文件</h2>' +
        '<p>把 <b>站点数据</b>（' + d.cats + ' 个分类 · ' + d.links + ' 个站点）和 <b>站点设置</b>' +
        (lc ? '（含 ' + lc + ' 个自定义链接）' : '') + ' 打包成一个文件下载。</p>' +
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
        '两个按钮都会先弹确认框，且<b>不影响收藏夹</b>。</p>' +
        '<div class="admin-actions">' +
          '<button class="btn btn--danger" type="button" id="bkResetCfg">恢复默认设置</button>' +
          '<button class="btn btn--danger" type="button" id="bkResetData">恢复默认数据</button>' +
        '</div>' +
      '</div>' +

      '<details class="admin-adv">' +
        '<summary>进阶：让改动对所有访客生效</summary>' +
        '<p>后台改动只保存在你这台浏览器里。想让所有访客都看到，需要把内容写进源码文件——' +
        '下面两个按钮会把内容复制到剪贴板，你粘到对应文件里就行。</p>' +
        '<div class="admin-actions">' +
          '<button class="btn btn--ghost" type="button" id="bkCopyData">复制站点数据</button>' +
          '<button class="btn btn--ghost" type="button" id="bkCopyCfg">复制站点设置</button>' +
        '</div>' +
        '<p class="admin-tip">站点数据 → <code>assets/js/data.js</code> 的 <code>categories</code>；' +
        '站点设置 → <code>index.html</code> 里 <code>config.js</code> 之前。</p>' +
      '</details>';
  }

  /* ---------- 备份数据打包 ---------- */
  function backupObject() {
    return {
      app: 'xingyu',
      version: 1,
      exportedAt: new Date().toISOString(),
      config: Store.get(),
      data: Store.dataAll()
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
      version: 2,
      exportedAt: new Date().toISOString(),
      config: Store.get(),
      data: Store.dataAll(),
      fav: (a.fav && a.fav.get) ? a.fav.get() : [],
      visits: (a.visits && a.visits.get) ? a.visits.get() : {}
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
        description: '星屿 XingYu · 自动备份',
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
        var v = el.value;
        var patch = {};
        if (key === 'rotator') patch.rotator = parseList(v);
        else if (key === 'featuredCount') patch.featuredCount = v;
        else patch[key] = (key === 'image') ? v.trim() : v;
        Store.setHome(patch);
        if (key === 'image') updatePreview(root, 'image', patch.image);
      }
      el.addEventListener('input', apply);
      el.addEventListener('change', apply);
    });

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

    /* ---------- 备份 ---------- */
    function syncAfterRestore(withData) {
      applyChrome();
      if (app().applyTheme) app().applyTheme(Store.get().themeDefault);
      if (withData) { openCats = {}; firstRun = true; }
      refreshBody(root);
    }

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
            toast('这个文件不是星屿的备份');
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

  /* 把图片读成 data URL；过大就等比缩到 1100px 以内再输出 */
  var IMG_MAX_PX = 1100;
  var IMG_MAX_CHARS = 900000;

  function shrinkImage(file, cb) {
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
        var scale = Math.min(1, IMG_MAX_PX / Math.max(w, h));
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

  function download(name, text) {
    try {
      var blob = new Blob([text], { type: 'application/json' });
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
