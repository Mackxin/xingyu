#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一次性迁移：把 assets/js/site-data.js 里的快照拆成 content/ 目录下的普通文件。

跑完就删也行 —— 内容从此以 content/ 为准，这个脚本只负责「搬一次家」。

    python3 tools/migrate-content.py          # 拆，存在就停下
    python3 tools/migrate-content.py --force  # 覆盖已有 content/

拆出来的东西：
    content/site.json      站点配置（原来 site-data.js 里的 window.XY_CONFIG）
    content/nav.json       导航分类与站点
    content/feed.json      分享流
    content/entries.json   首页快捷卡片
    content/posts/*.md     一篇文章一个文件（front-matter + 正文）
"""

import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, 'assets/js/site-data.js')
OUT = os.path.join(REPO, 'content')

# 旧页面 → 现在的位置。跟 app.js 里的 STALE_MAP 一致：
# 文件化的目的是「文件里写的 = 线上看到的」，所以搬的时候就顺手改掉，
# 别再让运行时去兜。
STALE = [
    (re.compile(r'/qiantai(\.html)?$', re.I), '#/share'),
    (re.compile(r'/system\.html$', re.I), '#/post/install-os'),
    (re.compile(r'/mac\.html$', re.I), '#/post/mac-software'),
    (re.compile(r'/jiaoben\.html$', re.I), '#/post/tampermonkey-scripts'),
    (re.compile(r'/yuchanqi\.html$', re.I), 'assets/tools/yuchanqi.html'),
    (re.compile(r'/dianchipaodan\.html$', re.I), 'assets/tools/dianchipaodan.html'),
    (re.compile(r'/chusheng\.html$', re.I), 'assets/tools/chusheng.html'),
    (re.compile(r'/suishouji(/index\.html)?$', re.I), '#/note'),
    (re.compile(r'/daohang\.html$', re.I), '#/nav'),
    (re.compile(r'/linggan\.html$', re.I), '#/idea'),
    (re.compile(r'/about\.html$', re.I), '#/about'),
]


def is_own(url):
    """只改我们自己这几台机器上的地址，别人家的 /about.html 不能动。"""
    m = re.match(r'^https?://([^/]+)(/.*)?$', url or '', re.I)
    if not m:
        return True
    host = m.group(1).lower()
    path = m.group(2) or '/'
    if host in ('yihaozhan.xyz', 'www.yihaozhan.xyz', '127.0.0.1', 'localhost'):
        return True
    return host == 'mackxin.github.io' and path.startswith('/xingyu/')


def fix_stale(url, counter):
    if not url or not is_own(url):
        return url
    for rx, new in STALE:
        if rx.search(url):
            counter[new] = counter.get(new, 0) + 1
            return new
    return url


def js_object(src, marker):
    """从 js 文件里抠出 window.<marker> = {...}; 那个对象。"""
    m = re.search(r'window\.' + marker + r'\s*=\s*(\{.*?\});\s*\n', src, re.S)
    if not m:
        sys.exit('✗ 在 site-data.js 里没找到 window.%s' % marker)
    return json.loads(m.group(1))


def one_line(obj):
    """一个对象压成一行：保留中文、保留空格分隔，方便一眼看一条。"""
    return json.dumps(obj, ensure_ascii=False)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def dump_nav(cats):
    out = ['[']
    for i, c in enumerate(cats):
        head = {k: c.get(k) for k in ('id', 'name', 'icon', 'desc') if c.get(k) not in (None, '')}
        out.append('  {')
        for k, v in head.items():
            out.append('    %s: %s,' % (json.dumps(k), json.dumps(v, ensure_ascii=False)))
        out.append('    "links": [')
        links = c.get('links') or []
        for j, l in enumerate(links):
            tail = ',' if j < len(links) - 1 else ''
            out.append('      ' + one_line(l) + tail)
        out.append('    ]')
        out.append('  }' + (',' if i < len(cats) - 1 else ''))
    out.append(']')
    return '\n'.join(out) + '\n'


def dump_list(items):
    rows = [one_line(x) for x in items]
    body = ',\n'.join('  ' + r for r in rows)
    return '[\n' + body + '\n]\n'


def front_matter_value(v):
    s = str(v).replace('\n', ' ').strip()
    return s


def dump_post(p):
    lines = ['---']
    lines.append('title: ' + front_matter_value(p.get('title', '')))
    if p.get('id'):
        lines.append('id: ' + p['id'])
    if p.get('date'):
        lines.append('date: ' + str(p['date']))
    tags = p.get('tags') or []
    if tags:
        lines.append('tags: [' + ', '.join(tags) + ']')
    if p.get('pin'):
        lines.append('pin: true')
    if p.get('draft'):
        lines.append('draft: true')
    if p.get('excerpt'):
        lines.append('excerpt: ' + front_matter_value(p['excerpt']))
    lines.append('---')
    lines.append('')
    body = p.get('body') or ''
    if isinstance(body, list):
        body = '\n'.join(body)
    return '\n'.join(lines) + '\n' + body.rstrip() + '\n'


def main():
    force = '--force' in sys.argv
    if os.path.exists(os.path.join(OUT, 'feed.json')) and not force:
        sys.exit('✗ content/ 已经有内容了。确实要覆盖就加 --force')

    src = open(SRC, encoding='utf-8').read()
    cfg = js_object(src, 'XY_CONFIG')
    data = js_object(src, 'SITE_DATA')

    fixed = {}
    for c in data.get('categories') or []:
        for l in c.get('links') or []:
            l['u'] = fix_stale(l.get('u'), fixed)
    for f in data.get('feed') or []:
        f['url'] = fix_stale(f.get('url'), fixed)

    write(os.path.join(OUT, 'site.json'), json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')
    write(os.path.join(OUT, 'nav.json'), dump_nav(data.get('categories') or []))
    write(os.path.join(OUT, 'feed.json'), dump_list(data.get('feed') or []))
    write(os.path.join(OUT, 'entries.json'), dump_list(data.get('entries') or []))

    posts = data.get('posts') or []
    for p in posts:
        name = (p.get('id') or 'post') + '.md'
        write(os.path.join(OUT, 'posts', name), dump_post(p))

    print('✓ content/ 已生成')
    print('    site.json      %d 个配置项' % len(cfg))
    print('    nav.json       %d 分类 / %d 条链接'
          % (len(data.get('categories') or []),
             sum(len(c.get('links') or []) for c in data.get('categories') or [])))
    print('    feed.json      %d 条分享' % len(data.get('feed') or []))
    print('    entries.json   %d 张首页卡片' % len(data.get('entries') or []))
    print('    posts/         %d 篇' % len(posts))
    if fixed:
        print('    · 顺手修正了 %d 条指向已删页面的旧地址：%s'
              % (sum(fixed.values()), '、'.join('%s×%d' % (k, v) for k, v in fixed.items())))


if __name__ == '__main__':
    main()
