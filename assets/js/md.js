/* =========================================================================
   星屿 XINGYU · 极简 Markdown 渲染器
   -------------------------------------------------------------------------
   为什么自己写：整个站是「零依赖纯静态」，引一个 marked.js 就要多一个
   几十 KB 的外部文件，还要担心 CDN 挂了。这里的实现只覆盖写文章真正会
   用到的语法，约 300 行，看得懂也改得动。

   支持：
     # 标题（一到六级，页面内自动降一级）   **粗体**  *斜体*  ~~删除线~~
     `行内代码`   ``` 代码块（带语言标记）    [链接](url)  ![图片](src)
     - 无序列表 / 1. 有序列表（支持缩进嵌套、- [ ] 任务清单）
     > 引用      --- 分隔线      | 表格 |（支持 :---: 对齐）
     裸网址自动变链接

   安全：先转义 HTML，再拼标签；javascript: / data: 等危险协议一律拦掉。
   对外：window.XYMarkdown = { render, plain, headings, stats, esc }
   ========================================================================= */
window.XYMarkdown = (function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 链接白名单：http(s) / mailto / tel / 站内 #/ 与绝对路径 / 相对路径。
     其它带协议的（javascript:、data:、vbscript:…）直接丢掉。 */
  function safeUrl(u) {
    u = String(u == null ? '' : u).trim();
    if (!u) return '';
    if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
    if (u.charAt(0) === '#' || u.charAt(0) === '/' || u.charAt(0) === '.') return u;
    if (/^[a-z][a-z0-9+.\-]*:/i.test(u)) return '';
    return u;
  }
  function safeImg(u) {
    u = String(u == null ? '' : u).trim();
    if (/^data:image\//i.test(u)) return u;
    return safeUrl(u);
  }

  /* ---------- 行内 ---------- */
  /* 先把 `代码`、图片、链接换成占位符，避免里面的 * 和 _ 被当成强调符号，
     也避免已经生成的 HTML 标签在后面的转义里被二次转义。 */
  function emph(s) {
    return s
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^\w])__([^_]+)__(?!\w)/g, '$1<strong>$2</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  }

  function inline(raw) {
    var s = String(raw == null ? '' : raw);
    var marks = [];

    function mark(html) { marks.push(html); return '\u0000' + (marks.length - 1) + '\u0001'; }

    /* 1) 行内代码 */
    s = s.replace(/`([^`]+)`/g, function (m, code) {
      return mark('<code>' + esc(code) + '</code>');
    });
    /* 2) 图片 */
    s = s.replace(/!\[([^\]]*)\]\(\s*([^()\s]*(?:\([^()]*\))?[^()\s]*)(?:\s+"[^"]*")?\s*\)/g,
      function (m, alt, src) {
        var u = safeImg(src);
        if (!u) return mark(emph(esc(alt)));
        return mark('<img src="' + esc(u) + '" alt="' + esc(alt) + '" loading="lazy" />');
      });
    /* 3) 链接 */
    s = s.replace(/\[([^\]]+)\]\(\s*([^()\s]*(?:\([^()]*\))?[^()\s]*)(?:\s+"[^"]*")?\s*\)/g,
      function (m, txt, href) {
        var u = safeUrl(href);
        if (!u) return mark(emph(esc(txt)));
        var out = /^https?:/i.test(u);
        return mark('<a href="' + esc(u) + '"' +
          (out ? ' target="_blank" rel="noopener"' : '') + '>' + emph(esc(txt)) + '</a>');
      });

    /* 4) 剩下的纯文本才转义 + 强调 */
    s = emph(esc(s));

    /* 5) <https://…> 尖括号写法 + 裸网址自动变链接 */
    s = s.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, function (m, u) {
      return '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>';
    });
    s = s.replace(/(^|[\s(（])(https?:\/\/[^\s<)）]+)/g, function (m, pre, u) {
      return pre + '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>';
    });

    /* 7) 把占位符换回来（可能嵌套，多跑几轮） */
    for (var k = 0; k < 3 && s.indexOf('\u0000') > -1; k++) {
      s = s.replace(/\u0000(\d+)\u0001/g, function (m, n) { return marks[+n] || ''; });
    }
    return s;
  }

  /* ---------- 块级 ---------- */
  var HEAD_TAG = { 1: 'h2', 2: 'h3', 3: 'h4', 4: 'h5', 5: 'h6', 6: 'h6' };

  function isBlockStart(line) {
    return /^\s*(```|~~~)/.test(line) ||
      /^\s{0,3}#{1,6}\s+/.test(line) ||
      /^\s{0,3}>/.test(line) ||
      /^\s*([-*+]|\d+[.)])\s+/.test(line) ||
      /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line);
  }

  function splitRow(line) {
    var t = String(line).trim().replace(/^\|/, '').replace(/\|$/, '');
    var cells = [], buf = '', esc2 = false;
    for (var i = 0; i < t.length; i++) {
      var c = t.charAt(i);
      if (esc2) { buf += c; esc2 = false; continue; }
      if (c === '\\') { esc2 = true; continue; }
      if (c === '|') { cells.push(buf.trim()); buf = ''; continue; }
      buf += c;
    }
    cells.push(buf.trim());
    return cells;
  }

  function tableBlock(lines, i, out) {
    var head = splitRow(lines[i]);
    var align = splitRow(lines[i + 1]).map(function (c) {
      var l = c.charAt(0) === ':', r = c.charAt(c.length - 1) === ':';
      return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
    });
    var rows = [], j = i + 2;
    while (j < lines.length && lines[j].indexOf('|') > -1 && !/^\s*$/.test(lines[j])) {
      rows.push(splitRow(lines[j]));
      j++;
    }
    function cell(tag, txt, k) {
      var a = align[k] ? ' style="text-align:' + align[k] + '"' : '';
      return '<' + tag + a + '>' + inline(txt) + '</' + tag + '>';
    }
    var html = '<div class="md-table"><table><thead><tr>' +
      head.map(function (c, k) { return cell('th', c, k); }).join('') +
      '</tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr>' + head.map(function (c, k) { return cell('td', r[k] == null ? '' : r[k], k); }).join('') + '</tr>';
      }).join('') +
      '</tbody></table></div>';
    out.push(html);
    return j;
  }

  /* 列表：按缩进递归，支持两层以上嵌套与任务清单 */
  function listBlock(lines, start, out) {
    var items = [], i = start;
    while (i < lines.length) {
      var m = /^([ \t]*)([-*+]|\d+[.)])[ \t]+(.*)$/.exec(lines[i]);
      if (m) {
        items.push({
          indent: m[1].replace(/\t/g, '    ').length,
          ordered: /\d/.test(m[2]),
          text: m[3],
          more: []
        });
        i++;
      } else if (items.length && /^[ \t]+\S/.test(lines[i])) {
        /* 列表项的续行（缩进的普通文字）算同一项 */
        items[items.length - 1].more.push(lines[i].trim());
        i++;
      } else break;
    }
    if (!items.length) return start + 1;

    function walk(pos, indent) {
      var tag = items[pos].ordered ? 'ol' : 'ul';
      var html = '<' + tag + '>';
      var k = pos;
      while (k < items.length && items[k].indent >= indent) {
        var it = items[k];
        var body = it.text;
        var task = /^\[([ xX])\]\s+([\s\S]*)$/.exec(body);
        var inner;
        if (task) {
          inner = '<span class="md-task' + (task[1].toLowerCase() === 'x' ? ' is-done' : '') + '">' +
            '<span class="md-task__box" aria-hidden="true"></span>' +
            '<span class="md-task__txt">' + inline(task[2]) + '</span></span>';
        } else {
          inner = inline(body);
        }
        if (it.more && it.more.length) {
          inner += it.more.map(function (x) { return '<span class="md-li__more">' + inline(x) + '</span>'; }).join('');
        }
        html += '<li>' + inner;
        if (k + 1 < items.length && items[k + 1].indent > indent) {
          var sub = walk(k + 1, items[k + 1].indent);
          html += sub.html + '</li>';
          k = sub.next;      // sub 已经把后续项吃掉了，这里不能再 k++
          continue;
        }
        html += '</li>';
        k++;
      }
      return { html: html + '</' + tag + '>', next: k };
    }
    var res = walk(0, items[0].indent);
    out.push(res.html);
    return i;   // 这里必须回到「行号」，不能是 items 的下标，否则游标会往回跳
  }

  function render(src) {
    var text = String(src == null ? '' : src).replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
    var lines = text.split('\n');
    var out = [];
    var i = 0, hIdx = 0;

    while (i < lines.length) {
      var line = lines[i];

      if (/^\s*$/.test(line)) { i++; continue; }

      /* 代码块 */
      var fence = /^\s*(```+|~~~+)\s*([A-Za-z0-9+#._-]*)\s*$/.exec(line);
      if (fence) {
        var mark = fence[1].charAt(0);
        var min = fence[1].length;
        var lang = fence[2] || '';
        var buf = [];
        i++;
        while (i < lines.length) {
          var close = new RegExp('^\\s*' + (mark === '`' ? '`' : '~') + '{' + min + ',}\\s*$');
          if (close.test(lines[i])) { i++; break; }
          buf.push(lines[i]);
          i++;
        }
        out.push('<pre class="md-code" data-lang="' + esc(lang) + '"><code>' +
          esc(buf.join('\n')) + '</code></pre>');
        continue;
      }

      /* 标题 */
      var head = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (head) {
        hIdx++;
        var lv = head[1].length;
        var tag = HEAD_TAG[lv] || 'h6';
        out.push('<' + tag + ' id="h' + hIdx + '" class="md-h md-h' + lv + '">' +
          inline(head[2]) + '</' + tag + '>');
        i++;
        continue;
      }

      /* 分隔线 */
      if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr/>'); i++; continue; }

      /* 引用：剥一层 > 后递归渲染 */
      if (/^\s{0,3}>/.test(line)) {
        var q = [];
        while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
          q.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
          i++;
        }
        out.push('<blockquote class="md-quote">' + render(q.join('\n')) + '</blockquote>');
        continue;
      }

      /* 表格 */
      if (line.indexOf('|') > -1 && i + 1 < lines.length &&
          /^\s*\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/.test(lines[i + 1]) && lines[i + 1].indexOf('-') > -1) {
        i = tableBlock(lines, i, out);
        continue;
      }

      /* 列表 */
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        i = listBlock(lines, i, out);
        continue;
      }

      /* 段落：连续非空、且不是别的块开头 */
      var para = [line];
      i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      out.push('<p>' + para.map(inline).join('<br/>') + '</p>');
    }

    return out.join('\n');
  }

  /* ---------- 派生信息 ---------- */
  function plain(src) {
    var s = String(src == null ? '' : src);
    s = s.replace(/```[\s\S]*?```/g, ' ').replace(/~~~[\s\S]*?~~~/g, ' ');
    s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
    s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    /* 表格：先去掉分隔行，再把竖线换成空格 */
    s = s.replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, ' ');
    s = s.replace(/\|/g, ' ');
    s = s.replace(/^[ \t]*([-*_])[ \t]*\1[ \t]*\1[ \t]*$/gm, ' ');
    /* 任务清单的方框 */
    s = s.replace(/^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]+/gm, '');
    s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');
    s = s.replace(/^\s{0,3}>\s?/gm, '');
    s = s.replace(/^\s*([-*+]|\d+[.)])\s+/gm, '');
    s = s.replace(/`/g, '').replace(/[*_~]/g, '');
    s = s.replace(/<[^>]+>/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  function headings(src) {
    var lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
    var out = [], idx = 0, inCode = false;
    lines.forEach(function (line) {
      if (/^\s*(```|~~~)/.test(line)) { inCode = !inCode; return; }
      if (inCode) return;
      var m = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (m) {
        idx++;
        out.push({ level: m[1].length, text: plain(m[2]), id: 'h' + idx });
      }
    });
    return out;
  }

  /* 字数与阅读时间：中文按 350 字/分钟估，最少 1 分钟 */
  function stats(src) {
    var chars = plain(src).replace(/\s/g, '').length;
    return { chars: chars, minutes: Math.max(1, Math.round(chars / 350)) };
  }

  function fmtChars(n) {
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + ' 万字';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + ' 千字';
    return n + ' 字';
  }

  return { render: render, plain: plain, headings: headings, stats: stats, fmtChars: fmtChars, esc: esc };
})();
