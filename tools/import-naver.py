#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从「壹号导航」naver.html 抽取全部书签，生成 assets/js/bookmarks.js。

用法：
    python3 tools/import-naver.py /path/to/naver.html

规则：
  · 只认 <section id="section-N"> 里的 .category-title 与 .category-link
  · 站内相对链接（qiantai.html / suishouji/index.html …）补成 http://yihaozhan.xyz/…
  · 分类内按 URL 去重（同一类里重复出现的只留第一条）
  · 跨分类不去重：一个站同时属于「搜索」和「常用」是正常的
  · 不写描述（d 字段），前台会自动显示域名
  · 分类 id 统一加 bk- 前缀，避免和 data.js 里那 12 个精选分类撞车
"""

import html
import json
import re
import sys
from pathlib import Path

SITE = 'http://yihaozhan.xyz/'

# 分类名 → (id 后缀, emoji)。顺序保持 naver.html 里的原顺序
META = {
    '万物归一': ('mine', '🌠'),
    '搜索标签': ('search', '🔍'),
    '小白常用': ('basics', '🧩'),
    '论坛平台': ('forum', '💬'),
    '国家服务': ('gov', '🏛️'),
    '次元壁垒': ('acg', '🌸'),
    '知识学习': ('study', '📚'),
    '书籍阅读': ('book', '📖'),
    '软件资源': ('software', '💿'),
    '大海之外': ('beyond', '🌊'),
    '商城购物': ('shop', '🛒'),
    '资源搜索': ('resources', '🧲'),
    '微信社交': ('wechat', '💚'),
    '健康养生': ('health', '🍵'),
    '工具合集': ('tools', '🧰'),
    '音乐天才': ('music', '🎵'),
    '设计天才': ('design', '🎨'),
    '游戏学习': ('game', '🎮'),
    '文件分享': ('file', '📁'),
    '科技资讯': ('tech', '📡'),
    '浏览插件': ('extension', '🧩'),
    '视频下载': ('download', '⬇️'),
    '图片素材': ('image', '🖼️'),
    '图片工具': ('imgtool', '🪄'),
    '苹果管理': ('apple', '🍎'),
    '安卓开源': ('android', '🤖'),
    '视频影院': ('video', '🎬'),
    '在线杂乱': ('misc', '🗃️'),
    '生成神器': ('generate', '✨'),
    '新奇有趣': ('fun', '🎈'),
    '导航网站': ('navsite', '🧭'),
    'PDF相关': ('pdf', '📄'),
    '主机服务': ('host', '🖥️'),
    '偶尔用用': ('seldom', '🌙'),
    '文库相关': ('doclib', '🗂️'),
    '办公学习': ('office', '📊'),
    '运营学习': ('operation', '📈'),
    '营销工具': ('marketing', '📣'),
    '数据平台': ('data', '📉'),
    '开源社区': ('opensource', '🐙'),
    '艺术展馆': ('art', '🖼️'),
    '电商梦想': ('ecommerce', '🏪'),
    '装修天才': ('decorate', '🔨'),
    '儿童教育': ('kids', '🧸'),
    '图标图库': ('icon', '🔷'),
    '美术文献': ('artdoc', '📜'),
    '剪辑汇总': ('cut', '✂️'),
    '剪辑资料': ('cutres', '🎞️'),
    'AI赋能': ('ai', '🤖'),
    'MAC': ('mac', '💻'),
}


def norm(u: str) -> str:
    """去重用的归一化：忽略协议、www、末尾斜杠、大小写"""
    u = u.strip().lower()
    u = re.sub(r'^https?://', '', u)
    u = re.sub(r'^www\.', '', u)
    return u.rstrip('/')


def load_dead(path: Path) -> set:
    """读死链清单（tools/check-links.py 生成），返回归一化后的网址集合"""
    if not path.exists():
        return set()
    dead = set()
    for line in path.read_text(encoding='utf-8').split('\n'):
        if not line.strip() or line.startswith('#'):
            continue
        url = line.split('\t')[0].strip()
        if url:
            dead.add(norm(url))
    return dead


def clean_text(s: str) -> str:
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s)
    return re.sub(r'\s+', ' ', s).strip()


def main(src_path: str) -> None:
    src = Path(src_path).read_text(encoding='utf-8')
    start = src.index('<div id="category-container">')
    body = src[start:]

    pos = [m.start() for m in re.finditer(r'<section id="section-(\d+)"', body)]
    if not pos:
        raise SystemExit('没找到任何 <section>，页面结构变了？')

    dead = load_dead(Path(__file__).resolve().parent / 'dead-links.txt')
    out = []
    used_ids = set()
    total_in = 0
    skipped_dead = 0
    for i, p in enumerate(pos):
        seg = body[p: pos[i + 1] if i + 1 < len(pos) else len(body)]
        mt = re.search(r'<h2 class="category-title">(.*?)</h2>', seg, re.S)
        name = clean_text(mt.group(1)) if mt else '(未命名)'
        suffix, icon = META.get(name, ('sec%d' % (i + 1), '🔗'))
        cid = 'bk-' + suffix
        while cid in used_ids:                      # 万一两个分类重名
            cid += 'x'
        used_ids.add(cid)

        links, seen = [], set()
        for href, text in re.findall(
                r'<a[^>]*href="([^"]*)"[^>]*class="category-link"[^>]*>(.*?)</a>', seg, re.S):
            href = html.unescape(href).strip()
            total_in += 1
            if not href or href.startswith(('#', 'javascript:', 'mailto:')):
                continue
            url = href if re.match(r'^https?://', href, re.I) else SITE + href.lstrip('/')
            k = norm(url)
            if k in dead:                            # 探测下来打不开的，直接不入库
                skipped_dead += 1
                continue
            if k in seen:
                continue
            seen.add(k)
            links.append({'n': clean_text(text) or url, 'u': url})

        if not links:
            continue
        # 分类描述：取前两个站名，读一眼就知道这类装了什么（长了会被省略号截掉）
        desc = ' · '.join(x['n'] for x in links[:2]) + ('…' if len(links) > 2 else '')
        out.append({'id': cid, 'name': name, 'icon': icon, 'desc': desc, 'links': links})

    js = [
        '/* =========================================================',
        '   星屿 XINGYU · 书签数据（自动生成，别手改）',
        '',
        '   来源：壹号导航 naver.html（%d 个分类 / %d 条链接）' % (len(out), sum(len(c['links']) for c in out)),
        '   重新生成：python3 tools/import-naver.py /path/to/naver.html',
        '   想改内容请去后台「导航」页，或者直接改这个文件。',
        '   ========================================================= */',
        'window.SITE_BOOKMARKS = (function () {',
        '  var categories = ' + json.dumps(out, ensure_ascii=False, indent=0)
        .replace('\n', '\n  ') + ';',
        '  return { categories: categories };',
        '})();',
        '',
    ]
    dst = Path(__file__).resolve().parent.parent / 'assets/js/bookmarks.js'
    dst.write_text('\n'.join(js), encoding='utf-8')

    n_links = sum(len(c['links']) for c in out)
    print('分类 %d 个，链接 %d 条（原始 %d，跳过死链 %d，类内去重掉 %d）'
          % (len(out), n_links, total_in, skipped_dead, total_in - skipped_dead - n_links))
    print('写出：%s（%.0f KB）' % (dst, dst.stat().st_size / 1024))
    for c in out:
        print('  %-6s %-8s %3d' % (c['id'], c['name'], len(c['links'])))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'naver.html')
