#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把「壹号讯息」时间线（http://yihaozhan.xyz/qiantai.html）搬进分享页。

⚠️ 2026-11-24：qiantai.html 已从服务器上删掉（旧站退场），这个脚本的线上数据源
   没了。716 条内容早已导进 assets/js/feed-import.js，站点本身不依赖它。
   只有在你还留着本地副本（备份在 ../xingyu-ftp-backup/root-before/qiantai.html）时
   才跑得动，且必须用 --src 指过去：
       python3 tools/import-qiantai.py --src ~/备份/qiantai.html
   想再增量导入，得先把那份 html 放回服务器，或者改写数据源。

产出 assets/js/feed-import.js，data.js 会把它拼在自带 feed 后面。
只读 + 只写这一个文件；拿不准就先 --dry 看一眼统计。

    python3 tools/import-qiantai.py --dry          # 只看统计，不落盘
    python3 tools/import-qiantai.py                # 下载 → 解析 → 写文件
    python3 tools/import-qiantai.py --src /tmp/qiantai.html   # 用本地已下载的副本

几条固定口径（和第一批导入保持一致）：
  · 置顶推荐 / 广告位 两组、以及 timeline-card-ad* 卡片一律跳过（那是推广位，不是分享）。
  · 同一条链接重复出现只留最近的一次（时间线上常把旧卡片顶上来重发）。
  · 正文里多个 <p> 用「 · 」连成一段 desc，和现有条目的写法一样。
  · 老条目已经有的 icon / tags 原样保留 —— 只给新出现的条目自动推断。
    否则每次重跑都会把 600 多条的标签洗一遍，diff 大得没法 review。
"""

import argparse
import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'js' / 'feed-import.js'
SRC_URL = 'http://yihaozhan.xyz/qiantai.html'

# 这些分组不是内容，是推广位
SKIP_DATES = {'置顶推荐', 'AD · 广告位'}

# 域名 → 图标。认不出来给 ✨（现有数据里 507/662 都是 ✨，说明本来就是兜底）
HOST_ICON = [
    ('github.com', '🐙'),
    ('chromewebstore.google.com', '🔍'),
    ('chrome.google.com', '🔍'),
    ('vercel.app', '▲'),
    ('vercel.com', '▲'),
    ('twitter.com', '🐦'),
    ('x.com', '🐦'),
    ('youtube.com', '📺'),
    ('bilibili.com', '📺'),
]

# (标签, 关键词…)。命中标题或描述即打标，最多两个，按这里的顺序取。
# 中文按子串匹配；纯英文关键词按整词匹配 —— 不这样的话 'ai' 会命中 detail，
# 'ui' 会命中 build，'歌' 会命中「谷歌搜索」（是的，第一版就这么翻过车）。
TAG_RULES = [
    ('AI', ['ai', 'gpt', 'llm', '大模型', '人工智能', 'chatgpt', 'claude', 'gemini', '提示词', 'prompt']),
    ('设计', ['设计', 'figma', '配色', 'ui', 'ux', '字体', '图标', '海报', '插画', 'svg', 'css', '动画']),
    ('开发', ['github', '开源', 'api', '代码', '编程', '开发', 'docker', 'linux', 'npm', 'sdk', '框架', '命令行', '脚本']),
    ('视频', ['视频', 'vlog', '剪辑', '字幕', '直播', 'b站', 'youtube', '播放器', '影视', '短剧']),
    ('写作', ['写作', '笔记', 'markdown', '博客', '文档', '编辑器', '排版']),
    ('阅读', ['阅读', '读书', '书籍', '小说', 'rss', '订阅', '杂志', '文库', '书库']),
    ('音乐', ['音乐', '歌曲', '歌手', '听歌', '音频', '播客', 'mp3', '乐器', '歌词', '专辑']),
    ('效率', ['效率', '待办', '任务', '日程', '番茄', '时间管理', '自动化', '快捷', '剪贴板']),
    ('教程', ['教程', '入门', '从零', '手把手', '课程', '教学']),
]


def has_word(hay, w):
    """中文词按子串，英文词按整词边界。"""
    if re.match(r'^[a-z0-9.+#-]+$', w):
        return re.search(r'(?<![a-z0-9])' + re.escape(w) + r'(?![a-z0-9])', hay) is not None
    return w in hay


class TimelineParser(HTMLParser):
    """只认四样东西：分组日期、卡片边界、标题链接、正文段落。

    时间线是先写完一整块再整段注释掉的模板，注释里也躺着旧卡片，
    所以这里只走 handle_starttag / handle_data，注释由解析器自己丢掉。
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.groups = []        # [{date, cards: [{title,url,parts}]}]
        self.group = None
        self.card = None
        self.depth = 0          # 卡片内部 div 的嵌套层数
        self.in_date = False
        self.in_body = False
        self.in_title_link = False
        self.skip_card = False  # 广告卡片
        self._buf = []

    # --- 标签 ---
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get('class') or ''
        if tag == 'article' and 'timeline-group' in cls:
            self.group = {'date': '', 'cards': []}
            self.groups.append(self.group)
            return
        if tag == 'span' and 'timeline-date' in cls:
            self.in_date = True
            self._buf = []
            return
        if tag == 'div':
            # 卡片本体 = class 恰好是 timeline-card，或 timeline-card + 修饰词（ad / ad-promo）。
            # 不能写成 startswith('timeline-card')：header / body / title 这些子元素
            # 也是这个前缀，会被误认成新卡片，把上半截提前提交、正文全丢。
            if cls == 'timeline-card' or cls.startswith('timeline-card '):
                self.card = {'title': '', 'url': '', 'parts': []}
                self.skip_card = 'timeline-card-ad' in cls
                self.depth = 1
                return
            if self.card is not None:
                self.depth += 1
                if 'timeline-card-body' in cls:
                    self.in_body = True
            return
        if tag == 'a' and 'timeline-title-link' in cls:
            self.in_title_link = True
            self._buf = []
            if self.card is not None:
                self.card['url'] = (a.get('href') or '').strip()
            return
        if tag == 'p' and self.in_body and self.card is not None:
            self._buf = []

    def handle_endtag(self, tag):
        if tag == 'span' and self.in_date:
            self.in_date = False
            if self.group is not None:
                self.group['date'] = ''.join(self._buf).strip()
            self._buf = []
            return
        if tag == 'a' and self.in_title_link:
            self.in_title_link = False
            if self.card is not None:
                self.card['title'] = ''.join(self._buf).strip()
            self._buf = []
            return
        if tag == 'p' and self.in_body and self.card is not None:
            txt = ''.join(self._buf).strip()
            if txt:
                self.card['parts'].append(txt)
            self._buf = []
            return
        if tag == 'div' and self.card is not None:
            if self.in_body:
                self.in_body = False
            self.depth -= 1
            if self.depth <= 0:
                self._flush_card()
        elif tag == 'article':
            if self.card is not None:
                self._flush_card()
            self.card = None
            self.depth = 0

    def _flush_card(self):
        c, self.card = self.card, None
        self.depth = 0
        self.in_body = False
        if not c or not c.get('url') or self.skip_card:
            return
        if self.group is not None:
            self.group['cards'].append(c)

    def handle_data(self, data):
        if self.in_date or self.in_title_link or (self.in_body and self.card is not None):
            self._buf.append(data)


BASE = 'http://yihaozhan.xyz/'


def norm_url(href):
    """把源站的 href 收敛成要写进数据的 url。

    · '#' / 空 → ''：站内占位链接（「最新消息」那种），没有可跳的地方。
    · './baoju/chusheng/index.html' → 补成源站绝对地址，相对路径放进 feed
      在别的页面里点会 404。
    """
    u = (href or '').strip()
    if not u or u == '#' or u.startswith('#'):
        return ''
    if u.startswith('//'):
        return 'http:' + u
    if u.startswith('./'):
        u = u[2:]
    if not u.startswith('http'):
        return BASE + u.lstrip('/')
    return u


def key_of(url, title):
    """去重用的键：URL 优先；没有 URL 的纯文字条目退回用标题。"""
    u = (url or '').rstrip('/')
    return u if u else '#' + (title or '')


def parse(html):
    p = TimelineParser()
    p.feed(html)
    rows = []
    for g in p.groups:
        d = g['date']
        if not d or d in SKIP_DATES or not re.match(r'^\d{4}-\d{2}-\d{2}$', d):
            continue
        for c in g['cards']:
            if not c['title']:
                continue
            rows.append({
                'date': d,
                'title': c['title'],
                'url': norm_url(c['url']),
                'desc': ' · '.join(c['parts']),
            })
    return rows


def guess_icon(url):
    host = re.sub(r'^https?://', '', url).split('/')[0].lower().replace('www.', '')
    for h, ic in HOST_ICON:
        if host == h or host.endswith('.' + h):
            return ic
    return '✨'


def guess_tags(title, desc):
    hay = (title + ' ' + desc).lower()
    out = []
    for tag, words in TAG_RULES:
        for w in words:
            if has_word(hay, w):
                out.append(tag)
                break
        if len(out) >= 2:
            break
    return out


def load_old(path):
    """把现有 feed-import.js 读成 {key: 完整条目}，用来保住老条目的元数据。

    key 必须和 key_of() 同口径（URL 去尾斜杠），否则带 / 结尾的老链接会全部
    被当成新条目、标签和图标重洗一遍 —— 第一次跑就栽在这。
    """
    if not path.exists():
        return {}
    src = path.read_text(encoding='utf-8')
    old = {}
    for blk in re.split(r"\n\s{4}\{ date: '", src)[1:]:
        blk = "{ date: '" + blk

        def grab(name, quoted=True):
            pat = r"%s: '((?:[^'\\]|\\.)*)'" % name if quoted else r"%s: (\[[^\]]*\])" % name
            m = re.search(pat, blk, re.S)
            return m.group(1) if m else ''

        def unesc(s):
            return s.replace("\\'", "'").replace('\\\\', '\\')

        tags = [unesc(t) for t in re.findall(r"'((?:[^'\\]|\\.)*)'", grab('tags', False))]
        url = unesc(grab('url'))
        title = unesc(grab('title'))
        old[key_of(url, title)] = {
            'date': unesc(grab('date')),
            'title': title,
            'url': url,
            'desc': unesc(grab('desc')),
            'icon': unesc(grab('icon')),
            'tags': tags,
        }
    return old


def js_str(s):
    """单引号字符串；反斜杠和撇号先转义，换行压成空格（数据里不该有换行）。"""
    s = ' '.join(str(s).split())
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"


def render(rows):
    """块内换行、块间逗号。每个条目跨两三行，最后一行的 } 后面别自带逗号，
    统一由 join 补 —— 两边都加就成了 ',,' 或漏逗号，两种都直接语法错。
    """
    blocks = []
    for r in rows:
        tags = ', '.join(js_str(t) for t in r['tags'])
        parts = ["    { date: %s, icon: %s, title: %s," % (js_str(r['date']), js_str(r['icon']), js_str(r['title']))]
        if r['desc']:
            parts.append("      url: %s, tags: [%s]," % (js_str(r['url']), tags))
            parts.append("      desc: %s }" % js_str(r['desc']))
        else:
            parts.append("      url: %s, tags: [%s] }" % (js_str(r['url']), tags))
        blocks.append('\n'.join(parts))
    return ',\n'.join(blocks)


HEADER = """/* =========================================================================
   壹号栈 · 从「壹号讯息」导入的分享条目
   -------------------------------------------------------------------------
   来源：{src} （壹号讯息的「时光轨迹」时间线）
   共 {n} 条，日期跨度 {lo} ~ {hi}。
   同一条链接重复出现时只留最近的一次。

   字段和 data.js 里的 feed 完全一样：
     date 日期 · icon 图标 · title 标题 · url 链接 · desc 描述 · tags 标签[]

   图标是按域名自动挑的（GitHub 🐙 / 扩展商店 🔍 …），认不出来用 ✨。
   标签是按标题和描述里的关键词自动归的（AI / 设计 / 开发 / 效率 / 视频 / 写作 /
   阅读 / 音乐 / 教程），最多两个；想改直接在后台「分享」里编辑就行。

   这个文件由 tools/import-qiantai.py 生成，别手工改 —— 重跑一次就覆盖了。
   不想要这批数据：把 index.html 里引入 feed-import.js 的那行 <script> 删掉即可，
   data.js 和后台自己的内容都不受影响。
   ========================================================================= */

window.XY_FEED_IMPORT = [

"""

FOOTER = '\n];\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='', help='本地 qiantai.html 副本，不给就联网下载')
    ap.add_argument('--url', default=SRC_URL)
    ap.add_argument('--dry', action='store_true', help='只打印统计，不写文件')
    ap.add_argument('--drop-gone', action='store_true',
                    help='源站删掉的条目也跟着删（默认保留，归档不丢东西）')
    ap.add_argument('--retag-empty', action='store_true',
                    help='顺手给老条目里标签为空的补上推断标签（默认不动）')
    args = ap.parse_args()

    if args.src:
        html = Path(args.src).read_text(encoding='utf-8', errors='replace')
    else:
        print('下载 %s …' % args.url)
        req = urllib.request.Request(args.url, headers={'User-Agent': 'Mozilla/5.0'})
        html = urllib.request.urlopen(req, timeout=40).read().decode('utf-8', 'replace')
    print('源文件 %d 字节' % len(html))

    rows = parse(html)
    print('解析出 %d 条（已跳过推广位）' % len(rows))

    # 同一 URL 只留最近的一次；后出现的日期更大时覆盖前面的
    merged = {}
    for r in rows:
        k = key_of(r['url'], r['title'])
        if k not in merged or r['date'] > merged[k]['date']:
            merged[k] = r
    rows = sorted(merged.values(), key=lambda r: (r['date'], r['url']), reverse=True)
    print('去掉重复链接后 %d 条' % len(rows))

    old = load_old(OUT)
    new_keys = {key_of(r['url'], r['title']) for r in rows}
    added = [r for r in rows if key_of(r['url'], r['title']) not in old]
    gone = [k for k in old if k not in new_keys]

    for r in rows:
        hit = old.get(key_of(r['url'], r['title']))
        if hit:
            # 老条目：icon / tags 原样带过来，空的就是空的。
            # 别在「搬数据」时顺手把 600 多条的分类重洗一遍 —— 想补空标签用 --retag-empty
            r['icon'] = hit['icon'] or guess_icon(r['url'])
            r['tags'] = guess_tags(r['title'], r['desc']) if (args.retag_empty and not hit['tags']) else hit['tags']
        else:
            r['icon'] = guess_icon(r['url'])
            r['tags'] = guess_tags(r['title'], r['desc'])

    # 源站删掉的条目：默认保留（分享页是归档，删了不可逆），要清就加 --drop-gone
    kept_gone = []
    if not args.drop_gone:
        titles_now = {r['title'] for r in rows}
        for k in gone:
            it = old[k]
            # 同一个标题已经在新的 rows 里 = 只是链接补全了，不是真消失，别留两份
            if it.get('title') and it['title'] not in titles_now:
                kept_gone.append(dict(it))
        rows = sorted(rows + kept_gone, key=lambda r: (r['date'], r['url']), reverse=True)

    lo, hi = rows[-1]['date'], rows[0]['date']
    print('日期跨度 %s ~ %s，%d 个记录日' % (lo, hi, len({r['date'] for r in rows})))
    print('新增 %d 条，源站已消失 %d 条' % (len(added), len(gone)))
    for r in added[:40]:
        print('  + %s  %s  <%s>' % (r['date'], r['title'], r['url']))
    if len(added) > 40:
        print('  … 另外 %d 条' % (len(added) - 40))
    for u in gone[:10]:
        print('  - %s' % u)

    if args.dry:
        print('\n--dry：没有写文件')
        return

    body = render(rows)
    # 头注释永远写线上地址 —— 文件会进仓库、进镜像，写本机 /tmp 路径没意义
    text = HEADER.format(src=args.url, n=len(rows), lo=lo, hi=hi) + body + FOOTER
    OUT.write_text(text, encoding='utf-8')
    print('\n已写 %s（%d 字节）' % (OUT.relative_to(ROOT), len(text.encode('utf-8'))))


if __name__ == '__main__':
    sys.exit(main())
