/* =========================================================
   壹号栈 YIHAOZHAN · 待办清单（#/todo）
   ---------------------------------------------------------
   为什么单独一个文件：跟 music.js / note.js 一个规矩 —— 站点自带页各自
   成模块，挂 window.XYTodo，app.js 只负责在 routeHtml 里喊一声 render()。

   数据：localStorage['xingyu.todo.v1']，一份 JSON。
   字段刻意用短名（t / due / pri / at / dt）—— 存的是本机数据，
   条目多的时候体积差一倍；导出时再展开成可读的 JSON。

   视觉上的「特色」：每条待办都挂在一根渐变竖线上（像一串待归位的事），
   圆点就是勾选框，完成时圆点填满、连线跟着往下走。
   ========================================================= */
window.XYTodo = (function () {
  'use strict';

  var KEY = 'xingyu.todo.v1';
  var MAX_DONE_SHOW = 30;      // 已完成最多显示这么多条，再多就折叠成一句

  /* 优先级：0 普通 / 1 重要 / 2 紧急。颜色只用在**小圆点**上 ——
     文字一律走 --text-dim，浅色主题下不用为对比度再调一档。 */
  var PRI = {
    0: { label: '', color: '' },
    1: { label: '重要', color: 'var(--a2)' },
    2: { label: '紧急', color: 'var(--star)' }
  };

  /* ---------- 运行时状态（不进 localStorage） ---------- */
  var filter = 'all';     // all | today | open | done
  var draftPri = 0;
  var draftDue = '';      // '' = 不设；'today' / 'tomorrow' 是按钮的语义，落库时才换成日期
  var rootEl = null;
  var listEl = null;
  var editingId = '';     // 正在改标题的那条

  /* ---------- 小工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function q(s, r) { return (r || document).querySelector(s); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return ymd(new Date()); }
  function shift(days) {
    var d = new Date();
    d.setHours(12, 0, 0, 0);          // 中午起步，躲开夏令时/跨零点那些边角
    d.setDate(d.getDate() + days);
    return ymd(d);
  }
  function newId() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  /* '2026-11-22' → 相差几天（今天 0，昨天 -1，明天 1） */
  function dayDiff(s) {
    if (!s) return null;
    var p = String(s).split('-');
    if (p.length !== 3) return null;
    var a = new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0).getTime();
    var b = new Date();
    b.setHours(12, 0, 0, 0);
    return Math.round((a - b.getTime()) / 86400000);
  }
  function dueLabel(s) {
    var n = dayDiff(s);
    if (n === null) return '';
    if (n === 0) return '今天';
    if (n === 1) return '明天';
    if (n === -1) return '逾期 1 天';
    if (n > 1 && n <= 6) return n + ' 天后';
    if (n < -1) return '逾期 ' + (-n) + ' 天';
    return s.slice(5);
  }

  /* ---------- 读写 ---------- */
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    if (!raw) return [];
    try {
      var d = JSON.parse(raw);
      var arr = Array.isArray(d) ? d : (d && d.items) || [];
      return arr.filter(function (it) { return it && typeof it.t === 'string'; })
        .map(function (it) {
          return {
            id: String(it.id || newId()),
            t: String(it.t || '').slice(0, 200),
            done: !!it.done,
            due: String(it.due || '').slice(0, 10),
            pri: it.pri === 2 ? 2 : (it.pri === 1 ? 1 : 0),
            at: +it.at || Date.now(),
            dt: +it.dt || 0
          };
        });
    } catch (e) { return []; }
  }
  function save(items) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, items: items })); } catch (e) {}
  }

  /* ---------- 统计 ---------- */
  function stats(items) {
    var t = today();
    var open = items.filter(function (it) { return !it.done; });
    var doneToday = items.filter(function (it) { return it.done && it.dt && ymd(new Date(it.dt)) === t; });
    /* 「今日」= 今天到期的那些（做完的也算进来，否则环永远 100%）。
       逾期的不算 —— 它们有自己的分组，混进来会让「今天 3」和列表里的 2 条对不上。 */
    var todayAll = items.filter(function (it) { return it.due === t; });
    var todayDone = todayAll.filter(function (it) { return it.done; }).length;
    /* 本周完成（周一起算） */
    var d = new Date();
    var wd = (d.getDay() + 6) % 7;                          // 周一=0
    var monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - wd).getTime();
    var weekDone = items.filter(function (it) { return it.done && it.dt >= monday; }).length;
    return {
      open: open.length, total: items.length,
      todayAll: todayAll.length, todayDone: todayDone,
      weekDone: weekDone, doneToday: doneToday.length
    };
  }

  /* ---------- 分组 ---------- */
  function groups(items) {
    var t = today();
    var over = [], todayG = [], later = [], some = [], done = [];
    items.forEach(function (it) {
      if (it.done) { done.push(it); return; }
      if (!it.due) { some.push(it); return; }
      if (it.due < t) over.push(it);
      else if (it.due === t) todayG.push(it);
      else later.push(it);
    });
    /* 未完成的组内排序：优先级高的在前，同优先级按到期日近的在前（没日期的垫后），
       最后按加入时间（新的在上，像一张往下叠的栈） */
    var cmp = function (a, b) {
      if (a.pri !== b.pri) return b.pri - a.pri;
      var ad = a.due || '9999-99-99', bd = b.due || '9999-99-99';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return b.at - a.at;
    };
    [over, todayG, later, some].forEach(function (g) { g.sort(cmp); });
    done.sort(function (a, b) { return (b.dt || 0) - (a.dt || 0); });
    return {
      over: over, today: todayG, later: later, some: some, done: done
    };
  }

  /* ---------- 渲染：环形进度 ---------- */
  function ringHtml(st) {
    var R = 34, C = 2 * Math.PI * R;
    var total = st.todayAll;
    var pct = total ? Math.round(st.todayDone / total * 100) : 0;
    var dash = total ? (C * st.todayDone / total) : 0;
    return '<div class="td-ring' + (total ? '' : ' is-empty') + '">' +
      '<svg viewBox="0 0 84 84" aria-hidden="true">' +
        '<defs><linearGradient id="tdRingGrad" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0%" stop-color="var(--a1)"/>' +
          '<stop offset="55%" stop-color="var(--a2)"/>' +
          '<stop offset="100%" stop-color="var(--a3)"/>' +
        '</linearGradient></defs>' +
        '<circle class="td-ring__track" cx="42" cy="42" r="' + R + '"/>' +
        '<circle class="td-ring__bar" cx="42" cy="42" r="' + R + '" ' +
          'stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C - dash).toFixed(1) + '"/>' +
      '</svg>' +
      '<div class="td-ring__mid">' +
        '<b>' + (total ? pct + '<i>%</i>' : '—') + '</b>' +
        '<span>' + (total ? '<i>' + st.todayDone + ' / ' + total + '</i><em>今日</em>' : '今天空着') + '</span>' +
      '</div>' +
    '</div>';
  }

  /* ---------- 渲染：一条 ---------- */
  function itemHtml(it) {
    var n = dayDiff(it.due);
    var overdue = !it.done && n !== null && n < 0;
    var pri = PRI[it.pri] || PRI[0];
    var meta = '';
    if (it.due) meta += '<span class="td-due' + (overdue ? ' is-over' : '') + '">' + esc(dueLabel(it.due)) + '</span>';
    if (pri.label) {
      meta += '<span class="td-pri" style="--pri:' + pri.color + '">' + pri.label + '</span>';
    }
    if (it.done && it.dt) {
      /* 别写成「今天 · 11 月 22 日完成」—— 前面已经有日期了，重复一遍很啰嗦 */
      var d = new Date(it.dt);
      var n2 = dayDiff(ymd(d));
      var when = n2 === 0 ? '今天' : (n2 === -1 ? '昨天' : (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日');
      meta += '<span class="td-ago">' + when + '完成</span>';
    }
    return '<li class="td-item' + (it.done ? ' is-done' : '') + (overdue ? ' is-over' : '') + '" data-id="' + esc(it.id) + '">' +
      '<button class="td-dot" type="button" data-act="toggle" ' +
        'aria-pressed="' + (it.done ? 'true' : 'false') + '" ' +
        'title="' + (it.done ? '标记未完成' : '标记完成') + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' +
      '</button>' +
      '<div class="td-main">' +
        (editingId === it.id
          ? '<input class="td-edit" type="text" value="' + esc(it.t) + '" maxlength="200" ' +
              'aria-label="修改标题" />'
          : '<p class="td-title" data-act="edit" title="双击修改">' + esc(it.t) + '</p>') +
        (meta ? '<div class="td-meta">' + meta + '</div>' : '') +
      '</div>' +
      '<button class="td-del" type="button" data-act="del" aria-label="删除这条" title="删除">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
      '</button>' +
    '</li>';
  }

  function groupHtml(title, arr, hint) {
    if (!arr.length) return '';
    var show = arr;
    var more = '';
    if (title === '已完成' && arr.length > MAX_DONE_SHOW) {
      show = arr.slice(0, MAX_DONE_SHOW);
      more = '<p class="td-more">还有 ' + (arr.length - MAX_DONE_SHOW) + ' 条更早完成的，已折叠</p>';
    }
    return '<section class="td-group">' +
      '<h2 class="td-group__h"><span>' + title + '</span><i>' + arr.length + '</i>' +
        (hint ? '<em>' + hint + '</em>' : '') + '</h2>' +
      '<ul class="td-items">' + show.map(itemHtml).join('') + '</ul>' + more +
    '</section>';
  }

  /* ---------- 渲染：列表 ---------- */
  function listHtml(items) {
    var g = groups(items);
    var out = '';
    if (filter === 'today') {
      out = groupHtml('已逾期', g.over, '先处理这些') + groupHtml('今天', g.today, '');
      if (!g.over.length && !g.today.length) out = emptyHtml('今天没有到期的事', '给某件事点个日期，它就会出现在这里');
      return out;
    }
    if (filter === 'open') {
      out = groupHtml('已逾期', g.over, '') + groupHtml('今天', g.today, '') +
            groupHtml('以后', g.later, '') + groupHtml('未安排', g.some, '');
      if (!out) out = emptyHtml('没有待办', '全都做完了 —— 或者还没开始写');
      return out;
    }
    if (filter === 'done') {
      out = groupHtml('已完成', g.done, '');
      if (!out) out = emptyHtml('还没有完成的', '勾掉第一件试试');
      return out;
    }
    out = groupHtml('已逾期', g.over, '别让它们一直挂着') + groupHtml('今天', g.today, '') +
          groupHtml('以后', g.later, '') + groupHtml('未安排', g.some, '') +
          groupHtml('已完成', g.done, '');
    if (!items.length) {
      out = emptyHtml('清单还是空的', '在上面写一件小事 —— 回车就记下');
    }
    return out;
  }

  function emptyHtml(title, sub) {
    return '<div class="td-empty">' +
      '<svg viewBox="0 0 120 72" aria-hidden="true">' +
        '<path d="M18 52h84" /><path d="M26 52V30a6 6 0 0 1 6-6h56a6 6 0 0 1 6 6v22" />' +
        '<path d="M42 24V14h36v10" /><path d="M52 40h16" />' +
      '</svg>' +
      '<b>' + esc(title) + '</b>' +
      '<p>' + esc(sub) + '</p>' +
    '</div>';
  }

  /* ---------- 渲染：整页 ---------- */
  function render() {
    var items = load();
    var st = stats(items);
    var pills = [
      { k: 'all', n: '全部', c: st.open },
      { k: 'today', n: '今天', c: st.todayAll - st.todayDone },
      { k: 'open', n: '未完成', c: st.open },
      { k: 'done', n: '已完成', c: items.length - st.open }
    ];
    var pillHtml = pills.map(function (p) {
      return '<button class="td-pill' + (filter === p.k ? ' is-on' : '') + '" type="button" data-filter="' + p.k + '">' +
        p.n + (p.c ? '<i>' + p.c + '</i>' : '') + '</button>';
    }).join('');

    var priHtml = [0, 1, 2].map(function (k) {
      var p = PRI[k];
      return '<button class="td-opt td-opt--pri' + (draftPri === k ? ' is-on' : '') + '" type="button" ' +
        'data-pri="' + k + '"' + (p.color ? ' style="--pri:' + p.color + '"' : '') + '>' +
        (k === 0 ? '普通' : p.label) + '</button>';
    }).join('');

    return '<section class="page page--todo">' +
      '<div class="page-head page-head--todo">' +
        '<div class="page-head__main">' +
          '<span class="eyebrow">Todo · 待办</span>' +
          '<h1>待办清单</h1>' +
          '<p>散着的事，一件件归位。<b>今天</b>只挑要紧的几件做完就够 —— ' +
            '全部存在这台浏览器里，不上传、不同步。</p>' +
          '<div class="td-tools">' +
            '<button class="btn btn--ghost" type="button" id="tdExport">导出 JSON</button>' +
            '<button class="btn btn--ghost" type="button" id="tdImport">导入</button>' +
            '<button class="btn btn--ghost" type="button" id="tdClearDone">清空已完成</button>' +
            '<input type="file" id="tdFile" accept=".json,application/json" hidden />' +
          '</div>' +
        '</div>' +
        '<div class="page-head__side td-head__side">' +
          ringHtml(st) +
          '<div class="head-stats td-head__stats">' +
            '<div class="head-stat"><b>' + st.open + '</b><span>待办</span></div>' +
            '<div class="head-stat"><b>' + st.weekDone + '</b><span>本周完成</span></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* 加一条 */
      '<div class="td-add" id="tdAdd">' +
        '<div class="td-add__row">' +
          '<input class="td-input" id="tdInput" type="text" maxlength="200" autocomplete="off" ' +
            'spellcheck="false" placeholder="加一件事，回车就记下…" aria-label="新的待办" />' +
          '<button class="btn btn--primary td-add__btn" type="button" id="tdAddBtn">记下</button>' +
        '</div>' +
        '<div class="td-add__opts">' +
          '<div class="td-opts" id="tdPri">' + priHtml + '</div>' +
          '<div class="td-opts" id="tdDue">' +
            '<button class="td-opt" type="button" data-due="">不设日期</button>' +
            '<button class="td-opt" type="button" data-due="today">今天</button>' +
            '<button class="td-opt" type="button" data-due="tomorrow">明天</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="td-bar">' + pillHtml + '</div>' +
      '<div class="td-list" id="tdList">' + listHtml(items) + '</div>' +
    '</section>';
  }

  /* 只重画列表 + 环形 + 计数：整页重画会把输入框内容和滚动位置一起弄丢 */
  function paint() {
    if (!rootEl) return;
    var items = load();
    var st = stats(items);
    listEl = q('#tdList', rootEl);
    if (listEl) listEl.innerHTML = listHtml(items);

    var side = q('.td-head__side', rootEl);
    if (side) {
      var ring = q('.td-ring', side);
      if (ring) ring.outerHTML = ringHtml(st);
      var bs = q('.td-head__stats', side);
      if (bs) {
        bs.innerHTML = '<div class="head-stat"><b>' + st.open + '</b><span>待办</span></div>' +
                       '<div class="head-stat"><b>' + st.weekDone + '</b><span>本周完成</span></div>';
      }
    }
    /* 筛选条上的数字 */
    var bar = q('.td-bar', rootEl);
    if (bar) {
      var counts = { all: st.open, today: st.todayAll - st.todayDone, open: st.open, done: items.length - st.open };
      Array.prototype.forEach.call(bar.querySelectorAll('[data-filter]'), function (b) {
        var k = b.getAttribute('data-filter');
        var n = counts[k] || 0;
        b.classList.toggle('is-on', k === filter);
        b.innerHTML = ({ all: '全部', today: '今天', open: '未完成', done: '已完成' })[k] +
          (n ? '<i>' + n + '</i>' : '');
      });
    }
  }

  /* ---------- 动作 ---------- */
  function addItem() {
    var input = q('#tdInput', rootEl);
    if (!input) return;
    var t = String(input.value || '').replace(/\s+/g, ' ').trim();
    if (!t) { input.focus(); return; }
    var items = load();
    var due = '';
    if (draftDue === 'today') due = today();
    else if (draftDue === 'tomorrow') due = shift(1);
    items.unshift({
      id: newId(), t: t.slice(0, 200), done: false,
      due: due, pri: draftPri, at: Date.now(), dt: 0
    });
    save(items);
    input.value = '';
    /* 加完不改优先级/日期 —— 连着记三件事时不用每件都重选 */
    paint();
    input.focus();
  }

  function toggle(id) {
    if (editingId === id) editingId = '';
    var items = load();
    var hit = false;
    items = items.map(function (it) {
      if (it.id !== id) return it;
      hit = true;
      var done = !it.done;
      return { id: it.id, t: it.t, done: done, due: it.due, pri: it.pri, at: it.at,
               dt: done ? Date.now() : 0 };
    });
    if (hit) { save(items); paint(); }
  }

  function remove(id) {
    if (editingId === id) editingId = '';
    save(load().filter(function (it) { return it.id !== id; }));
    paint();
  }

  function startEdit(id) {
    editingId = id;
    paint();
    var el = q('.td-edit', rootEl);
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }

  function commitEdit(value) {
    var id = editingId;
    if (!id) return;
    editingId = '';
    var v = String(value || '').replace(/\s+/g, ' ').trim();
    if (!v) { paint(); return; }        // 空着就当没改，别把人写的东西弄丢
    save(load().map(function (it) {
      return it.id === id ? { id: it.id, t: v.slice(0, 200), done: it.done, due: it.due,
                              pri: it.pri, at: it.at, dt: it.dt } : it;
    }));
    paint();
  }

  function exportJson() {
    var items = load().map(function (it) {
      return { id: it.id, text: it.t, done: it.done, due: it.due,
               priority: ['普通', '重要', '紧急'][it.pri] || '普通',
               createdAt: new Date(it.at).toISOString(),
               doneAt: it.dt ? new Date(it.dt).toISOString() : null };
    });
    var blob = new Blob([JSON.stringify({ app: 'yihaozhan-todo', v: 1,
      exportedAt: new Date().toISOString(), items: items }, null, 2)],
      { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'todo-' + today() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function importJson(file) {
    if (!file) return;
    var fr = new FileReader();
    fr.onload = function () {
      var got = [];
      try {
        var d = JSON.parse(String(fr.result || '{}'));
        var arr = Array.isArray(d) ? d : (d.items || []);
        got = arr.map(function (it) {
          var t = String(it.t || it.text || '').trim();
          if (!t) return null;
          var pri = it.pri;
          if (pri == null && it.priority) pri = ({ '重要': 1, '紧急': 2 })[it.priority] || 0;
          return {
            id: String(it.id || newId()), t: t.slice(0, 200),
            done: !!it.done, due: String(it.due || '').slice(0, 10),
            pri: pri === 2 ? 2 : (pri === 1 ? 1 : 0),
            at: +it.at || (it.createdAt ? Date.parse(it.createdAt) : Date.now()) || Date.now(),
            dt: +it.dt || (it.doneAt ? Date.parse(it.doneAt) : 0) || 0
          };
        }).filter(Boolean);
      } catch (e) { got = []; }
      if (!got.length) { alert('这个文件里没有能识别出来的待办'); return; }
      /* 合并而不是覆盖：导入多半是「从别的设备搬过来」，覆盖会把手上的删掉 */
      var items = load();
      var have = {};
      items.forEach(function (it) { have[it.id] = 1; });
      var add = 0;
      got.forEach(function (it) { if (!have[it.id]) { items.push(it); add++; } });
      save(items);
      paint();
      alert('导入 ' + add + ' 条' + (add < got.length ? '（' + (got.length - add) + ' 条已存在，跳过）' : ''));
    };
    fr.readAsText(file, 'utf-8');
  }

  /* ---------- 绑定 ---------- */
  function bind(root) {
    rootEl = root || document;
    listEl = q('#tdList', rootEl);
    if (!rootEl || !listEl) return;

    /* 列表用事件委托：paint() 会整块换掉 innerHTML，绑在子节点上的监听跟着丢 */
    listEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;
      var li = btn.closest('.td-item');
      if (!li) return;
      var id = li.getAttribute('data-id');
      var act = btn.getAttribute('data-act');
      if (act === 'toggle') { e.preventDefault(); toggle(id); }
      else if (act === 'del') { e.preventDefault(); remove(id); }
    });
    listEl.addEventListener('dblclick', function (e) {
      var t = e.target.closest ? e.target.closest('.td-title') : null;
      if (!t) return;
      var li = t.closest('.td-item');
      if (li) startEdit(li.getAttribute('data-id'));
    });
    /* 编辑框：回车保存、Esc 放弃、失焦保存 */
    listEl.addEventListener('keydown', function (e) {
      if (!e.target.classList || !e.target.classList.contains('td-edit')) return;
      if (e.key === 'Enter') { e.preventDefault(); commitEdit(e.target.value); }
      else if (e.key === 'Escape') { e.preventDefault(); editingId = ''; paint(); }
    });
    listEl.addEventListener('focusout', function (e) {
      if (e.target.classList && e.target.classList.contains('td-edit')) commitEdit(e.target.value);
    });

    var input = q('#tdInput', rootEl);
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); addItem(); }
      });
    }
    var addBtn = q('#tdAddBtn', rootEl);
    if (addBtn) addBtn.addEventListener('click', addItem);

    var priBox = q('#tdPri', rootEl);
    if (priBox) {
      priBox.addEventListener('click', function (e) {
        var b = e.target.closest('[data-pri]');
        if (!b) return;
        draftPri = +b.getAttribute('data-pri') || 0;
        Array.prototype.forEach.call(priBox.children, function (x) {
          x.classList.toggle('is-on', +x.getAttribute('data-pri') === draftPri);
        });
      });
    }
    var dueBox = q('#tdDue', rootEl);
    if (dueBox) {
      dueBox.addEventListener('click', function (e) {
        var b = e.target.closest('[data-due]');
        if (!b) return;
        draftDue = b.getAttribute('data-due') || '';
        Array.prototype.forEach.call(dueBox.children, function (x) {
          x.classList.toggle('is-on', (x.getAttribute('data-due') || '') === draftDue);
        });
      });
    }

    var bar = q('.td-bar', rootEl);
    if (bar) {
      bar.addEventListener('click', function (e) {
        var b = e.target.closest('[data-filter]');
        if (!b) return;
        filter = b.getAttribute('data-filter') || 'all';
        paint();
      });
    }

    var ex = q('#tdExport', rootEl);
    if (ex) ex.addEventListener('click', exportJson);
    var im = q('#tdImport', rootEl);
    var file = q('#tdFile', rootEl);
    if (im && file) {
      im.addEventListener('click', function () { file.click(); });
      file.addEventListener('change', function () {
        if (file.files && file.files[0]) importJson(file.files[0]);
        file.value = '';
      });
    }
    var cd = q('#tdClearDone', rootEl);
    if (cd) {
      cd.addEventListener('click', function () {
        var items = load();
        var n = items.filter(function (it) { return it.done; }).length;
        if (!n) { alert('还没有已完成的待办'); return; }
        if (!confirm('删掉 ' + n + ' 条已完成的待办？删了就找不回来了。')) return;
        save(items.filter(function (it) { return !it.done; }));
        paint();
      });
    }

    /* 首次进来把光标放到输入框，直接就能写（手机端不自动聚焦，免得一进来就弹键盘） */
    if (window.matchMedia && window.matchMedia('(min-width: 721px)').matches && input) input.focus();
  }

  function leave() {
    rootEl = null;
    listEl = null;
    editingId = '';
  }

  return {
    render: render,
    bind: function (root) { bind(root); },
    leave: leave,
    routes: function () { return ['todo']; },
    /* 自动化测试用：不开页面也能验证排序 / 统计 */
    _debug: { stats: stats, groups: groups, load: load, save: save }
  };
})();
