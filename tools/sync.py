#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一条命令，把「后台改的内容」推到全端。

为什么要它 —— 一次内容更新原本要手动走五步，漏一步就有一端还是旧的：
    1. 后台「备份 → 下载 site-data.js」
    2. 把文件挪进仓库 assets/js/site-data.js
    3. node tools/gen-app-json.js（重烘给 App 的 api/app.json）
    4. git commit + push（GitHub Pages）
    5. python3 tools/deploy-ftp.py --only api + purge jsDelivr（国内镜像）
第 5 步最容易漏：App 的数据源是「有镜像就只问镜像」，镜像上那份 app.json
旧了，App 就一直读旧的，不会自动退回 Pages。

用法：
    python3 tools/sync.py                 # 常规：自动找「下载」里最新的 site-data.js
    python3 tools/sync.py 路径/site-data.js  # 文件不在下载目录时
    python3 tools/sync.py --all           # 改了代码，整站重传镜像（默认只传变了的）
    python3 tools/sync.py --no-ftp        # 只推 GitHub，不动镜像（出门在外用）
    python3 tools/sync.py --dry           # 只说要做什么，不动任何东西

它做的事（按顺序）：
    收内容 → 重烘 app.json / feed.xml / app.json.gz → 提交推送
    → 把这次变了的文件传镜像 → purge jsDelivr → 核对三端 build 号
"""

import glob
import gzip
import io
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE_DATA = os.path.join(REPO, 'assets/js/site-data.js')
APP_JSON = os.path.join(REPO, 'api/app.json')
APP_GZ = APP_JSON + '.gz'

# 镜像地址读 ~/.xy-ftp 里的 url=，跟 FTP 凭据放一处：
# 换主机 / 换域名只改那一个文件，不用来这里改代码。
# 那个文件不在（换机器、CI）时回落到默认值。
XY_FTP_CONF = os.path.expanduser('~/.xy-ftp')


def _conf_value(key):
    try:
        for line in open(XY_FTP_CONF, encoding='utf-8'):
            line = line.strip()
            if line.startswith(key + '='):
                return line.split('=', 1)[1].strip()
    except Exception:
        pass
    return ''


MIRROR = (_conf_value('url') or 'http://yihaozhan.xyz').rstrip('/')
PAGES = 'https://mackxin.github.io/xingyu'

# 「导出于 2026-11-20 23:40」—— 后台导出时写在文件头那行
STAMP_RE = re.compile(r'导出于\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})')
# 有内容才算快照：出厂那个空模板的注释里也写着 window.SITE_DATA，
# 只搜单词会把空文件误当成新版本
BODY_RE = re.compile(r'window\.(SITE_DATA|XY_CONFIG)\s*=')

# 这些是本机才用得上的东西，传上去只会占地方
SKIP_REL = {'README.md', '.gitignore', 'CNAME', 'web.config'}
SKIP_DIRS = ('tools/', 'docs/', 'node_modules/', '__pycache/')


# ---------------------------------------------------------------- 小工具

def step(n, text):
    print(f'\n[{n}] {text}')


def info(text):
    print(f'    · {text}')


def bad(text):
    print(f'    ✗ {text}')


def ok(text):
    print(f'    ✓ {text}')


def sh(cmd, cwd=REPO, env=None, quiet=False):
    """跑一条命令，返回 (成功?, 输出)。输出永远合并 stderr —— git 的进度提示走 stderr。"""
    p = subprocess.run(cmd, cwd=cwd, env=env, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, text=True, errors='replace')
    out = (p.stdout or '').strip()
    if not quiet and out:
        for line in out.splitlines():
            print('      ' + line)
    return p.returncode == 0, out


def git(*args, **kw):
    return sh(['git', *args], quiet=kw.get('quiet', False))


def stamp_of(path):
    try:
        with open(path, encoding='utf-8', errors='replace') as fh:
            m = STAMP_RE.search(fh.read())
        return m.group(1) if m else ''
    except OSError:
        return ''


def read(path):
    try:
        with open(path, encoding='utf-8', errors='replace') as fh:
            return fh.read()
    except OSError:
        return ''


def shippable(rel):
    """这个文件要不要传镜像（跟 deploy-ftp.py 的 SKIP_* 保持一致）"""
    if not rel or rel.startswith('.'):
        return False
    if rel in SKIP_REL or rel.endswith(('.pyc', '.command')):
        return False
    if any(rel.startswith(d) for d in SKIP_DIRS):
        return False
    if os.path.basename(rel).startswith('.'):
        return False
    return True


def bake_gzip():
    """把 api/app.json 压成 api/app.json.gz（镜像主机不让开压缩，自己压一份给它）。

    写法必须跟 deploy-ftp.py 里那份一模一样（含 filename 头字段），否则两边
    交替跑会互相「改」一次，白白多出几百 KB 的 diff。
    mtime=0：同样内容每次压出来字节完全一样，git 不会天天报「已修改」。
    """
    if not os.path.exists(APP_JSON):
        return False
    raw = open(APP_JSON, 'rb').read()
    old = open(APP_GZ, 'rb').read() if os.path.exists(APP_GZ) else b''
    buf = io.BytesIO()
    with gzip.GzipFile(filename='app.json', mode='wb', fileobj=buf,
                       compresslevel=9, mtime=0) as gz:
        gz.write(raw)
    data = buf.getvalue()
    if data == old:
        return False
    with open(APP_GZ, 'wb') as fh:
        fh.write(data)
    info(f'app.json.gz：{len(raw) / 1024:.0f} KB → {len(data) / 1024:.0f} KB')
    return True


def fetch_json(url, timeout=25):
    req = urllib.request.Request(url, headers={'User-Agent': 'xingyu-sync'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    if data[:2] == b'\x1f\x8b':          # 镜像那份是自带 gz
        data = gzip.decompress(data)
    return json.loads(data.decode('utf-8'))


# ---------------------------------------------------------------- 1 收内容

def find_export(explicit):
    """找到后台导出的 site-data.js：显式路径 > 下载目录里最新的一个。"""
    if explicit:
        cands = [explicit]
    else:
        cands = []
        for pat in ('~/Downloads/site-data*.js', '~/Desktop/site-data*.js',
                    '~/下载/site-data*.js', '~/桌面/site-data*.js'):
            cands += glob.glob(os.path.expanduser(pat))
    cands = [c for c in cands if os.path.isfile(c)]
    good = []
    for c in cands:
        txt = read(c)
        if BODY_RE.search(txt):
            good.append((os.path.getmtime(c), c, txt))
    good.sort(key=lambda t: t[0], reverse=True)
    if explicit and not good:
        sys.exit(f'这个文件里没有 window.SITE_DATA（是出厂的空模板？）：{explicit}')
    return good[0] if good else None


def take_content(explicit, dry):
    step(1, '收内容')
    snap = find_export(explicit)
    if not snap:
        info('没找到新的 site-data.js —— 跳过，本次只同步代码/产物')
        info('（想更新内容：后台「备份 → 发布上线」点「⬇ 导出 site-data.js」，然后重跑这条命令）')
        return False

    _, path, txt = snap
    new_stamp = stamp_of(path)
    old_txt = read(SITE_DATA)
    old_stamp = stamp_of(SITE_DATA)

    if BODY_RE.search(old_txt) and txt.strip() == old_txt.strip():
        ok(f'仓库里已经是这一版（导出于 {new_stamp or "未知"}），不用重复导')
        return False

    info(f'来源：{path}')
    info(f'导出于：{new_stamp or "文件头没写时间"}'
         + (f'  →  仓库里原来那份导出于 {old_stamp}' if old_stamp else '  →  仓库里原来没有内容'))
    sz = len(txt.encode('utf-8'))
    info(f'体积：{sz / 1024:.0f} KB')
    if sz > 6 * 1024 * 1024:
        bad('超过 6 MB，可能是把图片内嵌进去了 —— 导出时勾上「拆成独立文件」再试')
        sys.exit(1)

    if dry:
        info('（--dry：不写入）')
        return True
    with open(SITE_DATA, 'w', encoding='utf-8') as fh:
        fh.write(txt)
    ok('已写入 assets/js/site-data.js')
    return True


# ---------------------------------------------------------------- 2 重烘

def rebake(dry):
    step(2, '重烘 App 的数据与订阅源')
    node = shutil.which('node')
    if not node:
        sys.exit('找不到 node，先装 Node.js（brew install node）')

    targets = [
        ([node, 'tools/gen-app-json.js', '--plain'],
         'api/app.json（App 拉的那份）'),
        ([node, 'tools/gen-feed.js'],
         'feed.xml（RSS 订阅源）'),
    ]
    for cmd, label in targets:
        if not os.path.exists(os.path.join(REPO, cmd[1])):
            info(f'跳过 {label}（脚本不在）')
            continue
        if dry:
            info(f'（--dry：会跑 {os.path.basename(cmd[1])} 重写 {label}）')
            continue
        info(f'→ {label}')
        good, out = sh(cmd, quiet=True)
        if not good:
            bad(f'{os.path.basename(cmd[1])} 跑失败了：')
            for line in out.splitlines()[-6:]:
                print('      ' + line)
            sys.exit(1)

    # 重烘后核对 app.json 真的读到了新内容
    if not dry and os.path.exists(APP_JSON):
        try:
            d = json.load(open(APP_JSON, encoding='utf-8'))
            st = d.get('stats') if isinstance(d.get('stats'), dict) else {}

            def count(key):
                v = st.get(key)
                if isinstance(v, int):
                    return v
                v = d.get(key)
                return len(v) if isinstance(v, list) else 0

            parts = [f'{count(k)} {label}' for k, label in
                     (('cats', '分类'), ('links', '站点'), ('feed', '分享'), ('posts', '文章'))]
            ok(f'build {d.get("build", "?")}　' + ' · '.join(parts))
        except Exception as e:
            bad(f'app.json 读不出来：{e}')
            sys.exit(1)

    if not dry:
        if not bake_gzip():
            info('app.json.gz 没变')


# ---------------------------------------------------------------- 3 提交推送

def commit_push(content_changed, dry, custom_msg=''):
    step(3, '提交并推送到 GitHub')
    stamp = stamp_of(SITE_DATA)
    build = ''
    if os.path.exists(APP_JSON):
        try:
            build = str(json.load(open(APP_JSON, encoding='utf-8')).get('build', ''))
        except Exception:
            pass

    before = ''
    good, out = git('rev-parse', 'HEAD', quiet=True)
    if good:
        before = out.strip()

    if dry:
        info('（--dry：只列计划）')
        git('status', '--porcelain')
        return before, []

    git('add', '-A')
    good, out = git('status', '--porcelain', quiet=True)
    changed_status = [l for l in out.splitlines() if l.strip()]

    if changed_status:
        files = [l[3:].strip() for l in changed_status if len(l) > 3]
        # 这几个是脚本自己烘出来的，不算「人工改动」
        baked = ('api/app.json', 'api/app.json.gz', 'feed.xml', 'assets/js/site-data.js')
        hand = [f for f in files if f not in baked]

        if custom_msg:
            msg = custom_msg
        elif content_changed:
            msg = (f'内容同步：site-data.js 导出于 {stamp or "未知时间"}'
                   f'；重烘 api/app.json（build {build}）与 feed.xml')
        elif hand:
            head = '、'.join(hand[:3]) + (f' 等 {len(hand)} 个文件' if len(hand) > 3 else '')
            msg = f'全端同步：{head}；重烘 api/app.json（build {build}）'
        else:
            msg = f'重烘产物：api/app.json（build {build}）/ feed.xml / app.json.gz 跟上最新改动'
        info(f'提交 {len(changed_status)} 个文件')
        good, _ = git('commit', '-m', msg, quiet=True)
        if not good:
            bad('git commit 失败（看上面输出）')
            sys.exit(1)
        ok(msg)
    else:
        info('工作区干净，没有新改动要提交')

    # 推送：直连失败就清掉代理再试一次（沙箱里挂着代理常报 HTTP2 framing / 502）
    info('→ git push')
    good, out = push_once(os.environ.copy())
    if not good:
        info('直连失败，清掉代理环境变量再试一次')
        env = {k: v for k, v in os.environ.items() if 'proxy' not in k.lower()}
        good, out2 = push_once(env)
        if not good:
            bad('推送还是失败。仓库里已经提交好了，回头网络好了再 push 一次不会丢东西。')
            for line in (out2 or out).splitlines()[-6:]:
                print('      ' + line)
            return before, []

    ok('已推送，GitHub Pages 开始重建（一般 20 秒 ~ 4 分钟）')

    changed = []
    base = mirror_base() or before
    if base:
        good, out = git('diff', '--name-only', base, 'HEAD', quiet=True)
        if good:
            changed = [l.strip() for l in out.splitlines() if l.strip()]
    return before, changed


def push_once(env):
    p = subprocess.run(['git', 'push'], cwd=REPO, env=env, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, text=True, errors='replace')
    return p.returncode == 0, (p.stdout or '').strip()


# 上次「镜像传成功后」的 HEAD。没有它就只能拿「这次运行前」的 HEAD 当基准 ——
# 那样一旦你事先自己 commit 过（很正常：想先存个锚点），那些文件在 git diff
# 里就看不见了，结果 GitHub 新了、镜像还是旧的（2026-11-24 撞过）。
MIRROR_BASE = os.path.join(REPO, '.git', 'xy-mirror-base')


def mirror_base():
    if not os.path.exists(MIRROR_BASE):
        return ''
    sha = read(MIRROR_BASE).strip()
    if not sha:
        return ''
    good, _ = git('cat-file', '-e', sha + '^{commit}', quiet=True)
    return sha if good else ''


def mark_mirror_base():
    good, out = git('rev-parse', 'HEAD', quiet=True)
    if not good:
        return
    try:
        with open(MIRROR_BASE, 'w', encoding='utf-8') as fh:
            fh.write(out.strip() + '\n')
    except OSError:
        pass


# ---------------------------------------------------------------- 4 镜像

def push_mirror(changed, force_all, dry):
    step(4, '同步到国内虚拟主机（%s/）' % MIRROR)
    ship = [f for f in changed if shippable(f)]
    full = force_all or len(ship) > 14

    if dry:
        if full:
            info('（--dry：会整站全量传）')
        elif ship:
            info(f'（--dry：会传 {len(ship)} 个：{", ".join(ship)}）')
        else:
            info('（--dry：没有要传的）')
        return

    if full:
        info('全量传（改了代码 / 文件多的那一次，慢一点但最干净）')
        cmd = [sys.executable, 'tools/deploy-ftp.py']
    elif ship:
        info(f'只传这次变了的 {len(ship)} 个文件')
        for f in ship:
            print(f'      + {f}')
        cmd = [sys.executable, 'tools/deploy-ftp.py', '--files', ','.join(ship)]
    else:
        info('镜像那边没有要更新的文件')
        return

    good, out = sh(cmd)
    if not good:
        bad('传镜像失败。GitHub 那边已经是新的了，镜像还是旧的 —— 网络好了重跑一次即可。')
        return
    ok('镜像已更新')
    mark_mirror_base()


# ---------------------------------------------------------------- 5 收尾

def purge(changed, dry):
    step(5, '让 jsDelivr 的兜底源立刻失效')
    need = [f for f in changed if f in ('api/app.json', 'api/app.json.gz')]
    if not need:
        info('这次没动 api/app.json，不用 purge')
        return
    url = 'https://purge.jsdelivr.net/gh/Mackxin/xingyu@main/api/app.json'
    if dry:
        info(f'（--dry：会请求 {url}）')
        return
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'xingyu-sync'})
        with urllib.request.urlopen(req, timeout=25) as r:
            r.read()
        ok('已 purge')
    except Exception as e:
        bad(f'purge 没成功（不影响 GitHub 和镜像，只是 App 的 jsDelivr 兜底源会晚一点生效）：{e}')


def verify(dry):
    step(6, '核对三端到底同步了没')
    local = ''
    try:
        local = str(json.load(open(APP_JSON, encoding='utf-8')).get('build', ''))
    except Exception:
        pass
    if not local:
        info('本地没有 app.json，跳过核对')
        return
    info(f'本地 build {local}')

    if dry:
        info('（--dry：不联网）')
        return

    rows = []
    for name, url in (('镜像', MIRROR + '/api/app.json'),
                      ('Pages', PAGES + '/api/app.json')):
        try:
            b = str(fetch_json(url).get('build', ''))
            rows.append((name, b, b == local))
        except Exception as e:
            rows.append((name, f'读不到（{type(e).__name__}）', None))
        time.sleep(0.3)

    for name, b, same in rows:
        if same is True:
            ok(f'{name}　build {b}　已是最新')
        elif same is False:
            bad(f'{name}　build {b}　还是旧的')
        else:
            bad(f'{name}　{b}')

    if any(s is False for _, _, s in rows) and rows:
        print('\n    Pages 刚提交完还在重建，等 1~2 分钟重跑 `python3 tools/sync.py --no-ftp` 再看一眼；')
        print('    镜像若还是旧的，说明第 4 步没成功。')


# ---------------------------------------------------------------- main

def main():
    rest = list(sys.argv[1:])
    custom_msg = ''
    if '--msg' in rest:
        i = rest.index('--msg')
        custom_msg = rest[i + 1] if i + 1 < len(rest) else ''
        del rest[i:i + 2]

    dry = '--dry' in rest
    force_all = '--all' in rest or '--code' in rest
    no_ftp = '--no-ftp' in rest
    explicit = next((a for a in rest if not a.startswith('-')), None)

    print('壹号栈 · 全端同步')
    print('=' * 46)
    if dry:
        print('（--dry 演练模式：不写文件、不提交、不上传）')

    if not os.path.isdir(os.path.join(REPO, '.git')):
        sys.exit('这个目录不是 git 仓库')

    content_changed = take_content(explicit, dry)
    rebake(dry)
    before, changed = commit_push(content_changed, dry, custom_msg)

    if no_ftp:
        step(4, '跳过镜像（--no-ftp）')
    else:
        push_mirror(changed, force_all, dry)

    purge(changed, dry)
    verify(dry)

    print('\n' + '=' * 46)
    print('做完。手机 / App 上看到旧内容的话：')
    print('  · 网页：下拉刷新或强刷一次（Ctrl/⌘ + Shift + R）')
    print('  · App：切到后台再回来，或在首页下拉刷新')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        sys.exit('\n已中断')
