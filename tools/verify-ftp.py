#!/usr/bin/env python3
"""逐个核对远端文件与本地是否一致（只读，不改任何东西）。

为什么需要：这台 FTP 传失败时会把文件删掉，脚本的 ✗ 又容易被日志刷过去；
而且 IIS 前面还挂着一层 CDN，FTP 上的 SIZE 对了不等于浏览器拿到的就是新的。
所以直接走 HTTP（浏览器真实走的那条路）比大小，比什么日志都可靠。

用法：
    python3 tools/verify-ftp.py                      # 核对 /xingyu/（默认镜像）
    python3 tools/verify-ftp.py --base http://yihaozhan.xyz/
"""
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


if __name__ == '__main__':
    base = 'http://yihaozhan.xyz/xingyu/'
    if '--base' in sys.argv:
        base = sys.argv[sys.argv.index('--base') + 1].rstrip('/') + '/'

    files = collect(REPO)
    print(f'核对 {len(files)} 个文件  →  {base}\n')
    bad = []
    for rel, local in files:
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
