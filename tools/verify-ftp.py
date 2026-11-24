#!/usr/bin/env python3
"""逐个核对远端文件与本地是否一致（只读，不改任何东西）。

为什么需要：这台 FTP 传失败时会把文件删掉，脚本的 ✗ 又容易被日志刷过去；
而且 IIS 前面还挂着一层 CDN，FTP 上的 SIZE 对了不等于浏览器拿到的就是新的。
所以直接走 HTTP（浏览器真实走的那条路）比大小，比什么日志都可靠。

用法：
    python3 tools/verify-ftp.py                      # 核对域名根（默认镜像）
"""
import json
import os
import sys
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 跟 deploy-ftp.py 的跳过规则保持一致，否则会去核对根本没传的文件
SKIP_DIRS = {'.git', '.workbuddy', '.githooks', '.github', 'tools', 'docs',
             'node_modules', '__pycache__'}
SKIP_FILES = {'README.md', '.gitignore', 'CNAME', 'web.config'}
SKIP_SUFFIX = ('.pyc', '.command')   # .command 是本机双击入口，deploy 不传


def collect(base):
    out = []
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith('.')]
        for name in files:
            if name in SKIP_FILES or name.startswith('.') or name.endswith(SKIP_SUFFIX):
                continue
            p = os.path.join(root, name)
            out.append((os.path.relpath(p, base).replace(os.sep, '/'), os.path.getsize(p)))
    return sorted(out)


def head(url):
    req = urllib.request.Request(url, method='HEAD')
    req.add_header('Cache-Control', 'no-cache')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=25) as r:
            return r.status, int(r.headers.get('Content-Length') or -1)
    except urllib.error.HTTPError as e:
        return e.code, -1
    except Exception as e:
        return None, str(e)[:40]


def check_app_json(local, url):
    """api/app.json 只比内容、不比字节。

    它每次重烘都会把 build 换成当前时间（`202611242202`），数据一个字没动也会变 ——
    纯比大小/字节只会天天报「不一致」，把这条校验弄成噪音就没意义了。
    """
    try:
        a = json.loads(open(local, 'rb').read().decode('utf-8'))
    except Exception as e:
        return False, f'本地读不出：{e}'
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        req = urllib.request.Request(url)
        req.add_header('Cache-Control', 'no-cache')
        with opener.open(req, timeout=45) as r:
            b = json.loads(r.read().decode('utf-8'))
    except Exception as e:
        return False, f'远端读不出：{str(e)[:40]}'

    ba, bb = a.pop('build', None), b.pop('build', None)
    if a == b:
        return True, f'内容一致（build {ba} vs {bb}）'
    return False, f'内容不同（build {ba} vs {bb}）'


if __name__ == '__main__':
    # 镜像域名跟 FTP 凭据一起放在 ~/.xy-ftp（url= 那行）：
    # 换主机 / 换域名只改那一个文件，这里不用动。
    base_url = ''
    try:
        for _line in open(os.path.expanduser('~/.xy-ftp'), encoding='utf-8'):
            _line = _line.strip()
            if _line.startswith('url='):
                base_url = _line.split('=', 1)[1].strip()
                break
    except Exception:
        pass
    base = (base_url or 'http://yihaozhan.xyz/')
    if '--base' in sys.argv:
        base = sys.argv[sys.argv.index('--base') + 1]
    base = base.rstrip('/') + '/'

    files = collect(REPO)
    print(f'核对 {len(files)} 个文件  →  {base}\n')
    bad = []
    for rel, local in files:
        if rel == 'api/app.json':
            same, note = check_app_json(os.path.join(REPO, rel), base + rel)
            print(f'  {"✓" if same else "✗"} {rel:38} {note}')
            if not same:
                bad.append((rel, note))
            continue
        code, remote = head(base + rel)
        same = code == 200 and remote == local
        if same:
            print(f'  ✓ {rel:38} {local / 1024:8.0f} KB')
        else:
            if code != 200:
                tag = f'HTTP {code}'
            elif remote == -1:
                tag = '无 Content-Length'
            else:
                tag = f'{remote}B ≠ 本地 {local}B'
            print(f'  ✗ {rel:38} {tag}')
            bad.append((rel, tag))

    print(f'\n一致 {len(files) - len(bad)} / 不一致 {len(bad)}')
    if bad:
        print('\n不一致清单（可以直接拿去补传）：')
        print('--files ' + ','.join(r for r, _ in bad))
        sys.exit(1)
