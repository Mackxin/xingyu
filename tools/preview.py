#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""壹号栈 · 本地预览
========================================================================
先看一眼，再决定要不要上线。

    python3 tools/preview.py                       看现在的 content/site.json
    python3 tools/preview.py ~/Downloads/site.json  先把这份拷进去，再预览
    python3 tools/preview.py --port 8400           换端口（默认 8321，占了就自动往后找）
    python3 tools/preview.py --no-open             不自动开浏览器

它只做三件事：
    ① 校验 content/site.json，通过就烘成 assets/js/site-data.js
    ② 在本机起一个静态服务器（只听 127.0.0.1，外网连不进来）
    ③ 打开浏览器给你看

它完全不碰远端 —— 不 commit、不 push、不传镜像、不清缓存。
看完满意，再双击桌面「壹号栈 · 一键同步」推上去。

为什么非要烘一下才能看：站点是纯静态的，运行时只读
assets/js/site-data.js 那一份 window.SITE_DATA，从来不读 site.json。
覆盖了源文件却不烘，等于换了菜谱没下锅。
========================================================================
"""

import argparse
import functools
import http.server
import json
import mimetypes
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(REPO, 'content', 'site.json')
PRODUCT = os.path.join(REPO, 'assets', 'js', 'site-data.js')
PORT_START = 8321


def say(msg=''):
    print(msg, flush=True)


def rule(ch='─', n=56):
    say(ch * n)


# ------------------------------------------------------------------ 内容文件

def is_site_content(path):
    """是不是后台导出的那份「全站内容」。
    跟 upload-files.py 同一条判据：结构说话，不看文件名 ——
    site.json / site(1).json / 下载夹里拖来的都认。"""
    if not path.lower().endswith('.json') or not os.path.isfile(path):
        return False
    try:
        with open(path, encoding='utf-8') as fh:
            d = json.load(fh)
    except Exception:                                  # noqa: BLE001
        return False
    if not isinstance(d, dict):
        return False
    marks = sum(1 for k in ('nav', 'feed', 'posts') if isinstance(d.get(k), list))
    return marks >= 2


def counts(path=SITE):
    """报一下这份内容里到底有多少东西，让人一眼确认是不是自己刚改的那版。"""
    try:
        with open(path, encoding='utf-8') as fh:
            d = json.load(fh)
    except Exception:                                  # noqa: BLE001
        return '（读不出来）'
    nav = d.get('nav') or []
    links = sum(len(c.get('links') or []) for c in nav if isinstance(c, dict))
    return '%d 分类 · %d 链接 · %d 分享 · %d 文章' % (
        len(nav), links, len(d.get('feed') or []), len(d.get('posts') or []))


def take_file(src):
    """把外面那份 json 换进 content/site.json（旧的先备份，后悔能拿回来）。"""
    target = SITE
    if os.path.abspath(src) == os.path.abspath(target):
        say('· 拖进来的就是 content/site.json 本身，不用拷')
        return
    if os.path.exists(target):
        bak = os.path.join(tempfile.gettempdir(),
                           'xy-site-before-%d.json' % int(time.time()))
        shutil.copy2(target, bak)
        say('· 旧的 content/site.json 已备份 → %s' % bak)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    shutil.copy2(src, target)
    say('✓ 已换进 content/site.json：%s' % counts())


def bake():
    """校验 + 烘产物。写错了它会当场报第几行第几列并且一个字都不写盘。"""
    say()
    rule()
    say('[1/3] 校验内容并烘产物')
    rule()
    r = subprocess.run(['node', 'tools/build-content.js'], cwd=REPO)
    if r.returncode != 0:
        say()
        say('✗ 内容有问题，上面写了在第几行第几列。')
        say('  产物没有更新、远端也没有动过 —— 改好再试一次。')
        return False
    say()
    say('✓ 产物已烘好：assets/js/site-data.js（%s）' % time.strftime('%H:%M:%S'))
    return True


# ------------------------------------------------------------------ 本地服务

def free_port(start):
    """从 start 往后找一个没人用的端口。占了就换，不用你去关别的东西。"""
    for p in range(start, start + 30):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(('127.0.0.1', p))
            except OSError:
                continue
            return p
    raise SystemExit('8321 往后 30 个端口都被占了，用 --port 指定一个空着的吧。')


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """正常请求不刷屏，只在出错时说一句。一律 no-store ——
    本地预览最怕的就是「改了没变」，所以干脆不让浏览器缓存任何东西。"""

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        code = args[1] if len(args) > 1 else ''
        if str(code).startswith(('4', '5')):
            say('  · 取不到 %s（%s）' % (args[0] if args else fmt, code))


def serve(port):
    handler = functools.partial(QuietHandler, directory=REPO)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


# ------------------------------------------------------------------ 主流程

def main():
    ap = argparse.ArgumentParser(add_help=True, description='本地看一眼，不推远端')
    ap.add_argument('file', nargs='?', help='要预览的 site.json（不给就看 content/site.json）')
    ap.add_argument('--port', type=int, default=PORT_START, help='起始端口，默认 8321')
    ap.add_argument('--no-open', action='store_true', help='不自动打开浏览器')
    args = ap.parse_args()

    os.chdir(REPO)
    say()
    rule('═')
    say('壹号栈 · 本地预览    （只看，不上线）')
    rule('═')

    if args.file:
        src = os.path.abspath(os.path.expanduser(args.file))
        if not is_site_content(src):
            say()
            say('✗ %s 看着不像是后台导出的全站内容。' % src)
            say('  它顶层应该有 nav / feed / posts 里的至少两个。')
            say('  后台「发布上线 → ⬇ 导出 site.json」拿到的才是这一份。')
            return 2
        say()
        say('[0/3] 先用你拖进来的文件')
        take_file(src)

    if not os.path.exists(SITE):
        say()
        say('✗ 找不到 content/site.json —— 仓库不全？')
        return 2

    say('· 现在要预览的内容：%s' % counts())

    if not bake():
        return 1

    # mimetypes 补几个 macOS 上默认认不出的，免得预览里报 MIME 错
    for ext, mt in (('.webmanifest', 'application/manifest+json'),
                    ('.json', 'application/json'),
                    ('.js', 'text/javascript'),
                    ('.md', 'text/markdown')):
        mimetypes.add_type(mt, ext)

    port = free_port(args.port)
    say()
    rule()
    say('[2/3] 起本地服务（只听本机，外网进不来）')
    rule()
    srv = serve(port)
    url = 'http://127.0.0.1:%d/' % port
    time.sleep(0.25)
    say('✓ %s' % url)

    say()
    rule()
    say('[3/3] 打开浏览器')
    rule()
    if args.no_open:
        say('· 自己去浏览器打开上面的地址')
    else:
        subprocess.run(['open', url], check=False)
        say('✓ 已经开了一个浏览器窗口（没弹出来就手动打开上面的地址）')

    say()
    rule('═')
    say('这个窗口先别关 —— 关了预览就停了。')
    say()
    say('看完满意   → 双击桌面「壹号栈 · 一键同步」，推 GitHub 和国内镜像')
    say('看完要改   → 改 content/site.json（或把新的 json 拖到预览图标上），')
    say('             回到这个窗口按 r 回车重新烘一次，浏览器按 ⌘R 刷新')
    say()
    say('按回车 / q 回车 / Ctrl+C 结束预览')
    rule('═')
    say()

    try:
        if sys.stdin.isatty():
            for line in sys.stdin:
                cmd = line.strip().lower()
                if cmd == 'r':
                    say('· 重新烘…')
                    if bake():
                        say('✓ 好了，浏览器按 ⌘R 刷新就能看到')
                    else:
                        say('· 产物没变，浏览器里还是上一版')
                    say()
                    say('（r 再烘一次 · 回车结束）')
                else:
                    break
        else:
            while True:
                time.sleep(3600)
    except KeyboardInterrupt:
        say()
    finally:
        srv.shutdown()
        say('预览已停。内容还是本地草稿 —— 远端没动过。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
