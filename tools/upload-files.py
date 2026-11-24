#!/usr/bin/env python3
"""把本地文件传到国内镜像的对应位置，传完逐个核对（HTTP 比大小，不信 FTP 的回话）。

为什么单独有这个：`deploy-ftp.py` 要么全量、要么得自己写对相对路径。
平时最常见的场景是「我就想补传一个文件」—— 比如 `xysync` 跑到第 4 步挂了
某几个文件，或者你手改了一张图。这个脚本负责把「你手里的文件」翻译成
「远端该放在哪」，然后排队一个个传，传完自己验证。

用法：
    python3 tools/upload-files.py 文件 [文件…]     # 直接点名
    python3 tools/upload-files.py --pick           # 弹窗选（双击图标走这条）
    python3 tools/upload-files.py --dry 文件        # 只看会传到哪，不真传

路径怎么定（依次判断）：
    ① 文件在仓库目录里      → 按它相对仓库根的位置传（最准）
    ② 文件名在已知清单里    → 按清单映射（例如下载夹里的 site-data.js）
    ③ 都对不上             → 拒绝上传，并告诉你该怎么放
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONF = os.path.expanduser('~/.xy-ftp')
DEPLOY = os.path.join(REPO, 'tools', 'deploy-ftp.py')

# 不在仓库里的文件 → 远端位置。只收「位置没有歧义」的那几个。
KNOWN = {
    'site-data.js': 'assets/js/site-data.js',
    'config.js': 'assets/js/config.js',
    'data.js': 'assets/js/data.js',
    'app.js': 'assets/js/app.js',
    'music.js': 'assets/js/music.js',
    'todo.js': 'assets/js/todo.js',
    'note.js': 'assets/js/note.js',
    'feed-import.js': 'assets/js/feed-import.js',
    'bookmarks.js': 'assets/js/bookmarks.js',
    'style.css': 'assets/css/style.css',
    'index.html': 'index.html',
    'sw.js': 'sw.js',
    'feed.xml': 'feed.xml',
    'manifest.webmanifest': 'manifest.webmanifest',
    'app.json': 'api/app.json',
    'app.json.gz': 'api/app.json.gz',
    'app-version.json': 'api/app-version.json',
    'app.apk': 'api/app.apk',
}

# deploy-ftp.py 本来就不传这些，指到它们只会白跑一趟
# （web.config 是例外：它在服务器上真有用，--files 能正常传，所以不拦）
NEVER = ('README.md', '.gitignore', 'CNAME')

# 这些目录是仓库自己的东西（脚本、文档、CI、记忆），服务器上不该有副本
NEVER_DIRS = ('tools/', 'docs/', '.github/', '.workbuddy/', '.git/')

# api/app.json 每次重烘都换 build 时间戳，只比内容
JSON_LOOSE = ('api/app.json', 'api/app-version.json')


def say(msg=''):
    print(msg, flush=True)


def read_conf():
    d = {}
    try:
        for line in open(CONF, encoding='utf-8'):
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                d[k.strip()] = v.strip()
    except OSError:
        pass
    return d


def ensure_cred():
    """第一次用（或换了主机）时问一遍，存进 ~/.xy-ftp（权限 600）。"""
    c = read_conf()
    if c.get('host') and c.get('user') and c.get('pass'):
        return c
    say('还没找到 FTP 凭据 —— 输入一次，之后会存在 ~/.xy-ftp（只有你能读）。')
    say()
    host = c.get('host') or input('FTP 地址（如 ftp.example.com）：').strip()
    user = c.get('user') or input('FTP 账号：').strip()
    import getpass
    pw = getpass.getpass('FTP 密码（输入时不显示）：').strip()
    root = c.get('root') or input('网站根目录（回车默认 /wwwroot）：').strip() or '/wwwroot'
    url = c.get('url') or input('站点网址（回车默认 http://%s/）：' % host).strip() or ('http://%s/' % host)
    lines = ['host=%s' % host, 'user=%s' % user, 'pass=%s' % pw,
             'root=%s' % root, 'url=%s' % url]
    fd = os.open(CONF, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines) + '\n')
    say('已保存 → %s（权限 600）' % CONF)
    say()
    return read_conf()


def resolve(path):
    """本地路径 → (仓库相对路径, 绝对路径)；对不上返回 (None, 原因)。"""
    p = os.path.abspath(os.path.expanduser(path))
    if not os.path.exists(p):
        return None, '文件不存在'
    if os.path.isdir(p):
        return None, '这是个文件夹，请直接拖里面的文件'

    name = os.path.basename(p)
    if name in NEVER:
        return None, '这个文件本来就不上传（部署时故意跳过）'

    rel = os.path.relpath(p, REPO)
    if not rel.startswith('..'):
        rel = rel.replace(os.sep, '/')
        if rel.startswith(NEVER_DIRS):
            return None, '这是仓库自己的文件（脚本/文档），服务器上不该有它'
        return rel, None

    if name in KNOWN:
        return KNOWN[name], None
    return None, '不在仓库里，也不知道该放哪'


def url_for(rel):
    base = read_conf().get('url') or 'http://yihaozhan.xyz/'
    return base.rstrip('/') + '/' + rel


def head_size(url):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    req = urllib.request.Request(url + '?t=%d' % int(time.time()), method='HEAD')
    req.add_header('Cache-Control', 'no-cache')
    try:
        with opener.open(req, timeout=25) as r:
            return r.status, int(r.headers.get('Content-Length') or -1)
    except urllib.error.HTTPError as e:
        return e.code, -1
    except Exception as e:
        return None, str(e)[:40]


def verify(rel, local):
    """传完核对：走 HTTP（浏览器真实路径），比大小；app.json 比内容。"""
    url = url_for(rel)
    if rel in JSON_LOOSE:
        try:
            a = json.loads(open(local, 'rb').read().decode('utf-8'))
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            req = urllib.request.Request(url + '?t=%d' % int(time.time()))
            req.add_header('Cache-Control', 'no-cache')
            with opener.open(req, timeout=45) as r:
                b = json.loads(r.read().decode('utf-8'))
            a.pop('build', None)
            b.pop('build', None)
            return (True, '内容一致') if a == b else (False, '内容不一致')
        except Exception as e:
            return False, '核对失败：%s' % str(e)[:40]

    code, size = head_size(url)
    if code != 200:
        return False, 'HTTP %s（多半是传失败了，服务器把文件删了）' % code
    want = os.path.getsize(local)
    if size == want:
        return True, '%s B' % size
    return False, '大小不对：远端 %s B / 本地 %s B' % (size, want)


def pick_files():
    """弹系统文件选择框（可以多选）。双击图标又没拖东西时走这条。"""
    script = ('set fs to choose file with prompt "选择要上传到镜像的文件" '
              'with multiple selections allowed\n'
              'set out to ""\n'
              'repeat with f in fs\n'
              'set out to out & POSIX path of f & linefeed\n'
              'end repeat\n'
              'return out')
    try:
        r = subprocess.run(['osascript', '-e', script], capture_output=True,
                           text=True, timeout=300)
    except Exception as e:
        return [], '打不开选择框：%s' % e
    if r.returncode != 0:
        return [], '没有选择文件'
    return [x.strip() for x in r.stdout.splitlines() if x.strip()], None


def main():
    args = [a for a in sys.argv[1:]]
    dry = '--dry' in args
    args = [a for a in args if not a.startswith('--')]

    say('━' * 52)
    say('壹号栈 · 上传到镜像')
    say('━' * 52)
    say()

    if not args:
        say('没带文件路径 → 弹窗让你选…')
        args, err = pick_files()
        if err or not args:
            say('取消：%s' % (err or '没有选文件'))
            return 1
        say()

    ensure_cred()

    # 先把每个文件的去向算清楚，有问题的一次性说完，别传到一半才报错
    plan, bad = [], []
    for a in args:
        rel, why = resolve(a)
        if rel is None:
            bad.append((a, why))
        else:
            plan.append((os.path.abspath(os.path.expanduser(a)), rel))

    if bad:
        say('下面这些没法传：')
        for a, why in bad:
            say('  ✗ %s' % os.path.basename(a))
            say('      %s' % why)
        say()
        if not plan:
            say('提示：仓库里的文件可以直接拖；下载夹里的 site-data.js 也认。')
            return 1

    say('要传 %d 个：' % len(plan))
    for local, rel in plan:
        say('  %-34s → %s  (%.0f KB)' % (os.path.basename(local), rel,
                                         os.path.getsize(local) / 1024))
    say()

    if dry:
        say('（--dry 只看不传）')
        return 0

    ok, failed = [], []
    for i, (local, rel) in enumerate(plan, 1):
        say('[%d/%d] %s' % (i, len(plan), rel))
        r = subprocess.run([sys.executable, DEPLOY, '--files', rel],
                           cwd=REPO, capture_output=True, text=True, errors='replace')
        out = (r.stdout or '') + (r.stderr or '')
        if r.returncode != 0 or '✗' in out:
            failed.append((rel, 'FTP 那一步失败'))
            for line in out.strip().splitlines()[-3:]:
                say('    ' + line.strip())
            continue
        good, why = verify(rel, local)
        if good:
            ok.append(rel)
            say('    ✓ 已核对（%s）' % why)
        else:
            failed.append((rel, why))
            say('    ✗ %s' % why)
        if i < len(plan):
            time.sleep(2)          # 连着传会被 425 限流

    say()
    say('─' * 52)
    say('成功 %d / 失败 %d' % (len(ok), len(failed)))
    for rel, why in failed:
        say('  ✗ %s    %s' % (rel, why))
    if failed:
        say()
        say('补传建议：把失败的那个再拖一次（一个文件成功率最高）；')
        say('还是不行就跑 python3 tools/verify-ftp.py 看整体有没有缺口。')
    else:
        say('镜像已经是新内容了。')
    return 0 if not failed else 2


if __name__ == '__main__':
    sys.exit(main())
