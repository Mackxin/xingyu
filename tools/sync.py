#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一条命令，把「content/site.json」推到全端。

全站内容就一个文件：content/site.json（导航 / 分享 / 文章 / 外观都在里面）。
后台「发布上线 → ⬇ 导出 site.json」产出的就是它；拖到桌面「壹号栈 · 拖文件上传」
也会自动拷进来并跑这条命令，所以平时不用手敲。

它做的事（按顺序）：
    构建 site-data.js（先校验，写错就停）→ 重烘 app.json / feed.xml / app.json.gz
    → 提交推送 → 把这次变了的文件传镜像 → purge jsDelivr → 核对三端

用法：
    python3 tools/sync.py                 # 常规：改了 content/ 或代码
    python3 tools/sync.py --all           # 改了代码，整站重传镜像（默认只传变了的）
    python3 tools/sync.py --no-ftp        # 只推 GitHub，不动镜像（出门在外用）
    python3 tools/sync.py --dry           # 只说要做什么，不动任何东西
    python3 tools/sync.py --msg "…"       # 自定义提交说明
"""

import gzip
import json
import os
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

# 这些是本机才用得上的东西，传上去只会占地方
SKIP_REL = {'README.md', '.gitignore', 'CNAME', 'web.config'}
SKIP_DIRS = ('tools/', 'docs/', 'content/', 'node_modules/', '__pycache/')


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
    # core.quotepath=false：中文文件名原样输出，不然隐私守卫会报到一串八进制码
    return sh(['git', '-c', 'core.quotepath=false', *args], quiet=kw.get('quiet', False))


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

    **必须用 `gzip.compress(raw, 9, mtime=0)`，不能用 `gzip.GzipFile(filename=...)`**：
    后者会多写一个 FNAME 头，同样内容压出来正好差 9 字节，跟 CI（rebake.yml 用的是
    gzip.compress）永远对不齐 —— 每次推送 CI 都会多一条「自动重烘」空提交。
    2026-11-25 实测：本机 gzip.compress 出来跟 CI 那份 sha256 完全一致。
    mtime=0：同样内容每次压出来字节完全一样，git 不会天天报「已修改」。
    """
    if not os.path.exists(APP_JSON):
        return False
    raw = open(APP_JSON, 'rb').read()
    old = open(APP_GZ, 'rb').read() if os.path.exists(APP_GZ) else b''
    data = gzip.compress(raw, 9, mtime=0)
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


# ---------------------------------------------------------------- 1 构建内容

def build_content(dry):
    """content/site.json → assets/js/site-data.js。

    全站内容就在那一个文件里（后台导出的那份）。构建器先校验，写错了（少个逗号）
    当场报第几行第几列并退出 —— 不会把一份坏数据推上线。
    """
    step(1, '构建内容（content/site.json → assets/js/site-data.js）')
    node = shutil.which('node')
    if not node:
        sys.exit('找不到 node，先装 Node.js（brew install node）')
    script = os.path.join(REPO, 'tools/build-content.js')
    if not os.path.exists(script):
        sys.exit('tools/build-content.js 不见了 —— 没有它就没法从 content/ 生成站点数据')

    before = read(SITE_DATA)
    if dry:
        good, out = sh([node, script, '--check'], quiet=True)
        if not good:
            bad('content/site.json 里有写得不对的地方：')
            for line in out.splitlines():
                print('      ' + line)
            sys.exit(1)
        info('（--dry：会重新构建 site-data.js）')
        return False

    good, out = sh([node, script], quiet=True)
    if not good:
        bad('content/site.json 里有写得不对的地方，先改好再同步：')
        for line in out.splitlines():
            print('      ' + line)
        sys.exit(1)

    after = read(SITE_DATA)
    changed = before != after
    for line in out.splitlines():
        line = line.strip()
        if line.startswith('✓'):
            ok(line[1:].strip())
        elif line.startswith('·'):
            info(line[1:].strip())
    if changed:
        ok('site-data.js 变了，这次要一起发出去')
    else:
        info('内容没变化，跟上次一致')
    return changed


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

# ---------------------------------------------------------------- 隐私守卫
# 这个仓库是公开的（GitHub 免费账号的 Pages 只能发布公开仓库），而
# `git add -A` 会把仓库目录里**任何**新东西一起推上去。所以提交前拦一道：
# 根目录冒出清单外的文件，或者任何地方出现文档 / 压缩包 / 证书这类
# 「多半是私人物品」的扩展名，默认停下来问一句，而不是默默公开。

ROOT_OK = {
    'index.html', 'sw.js', 'feed.xml', 'manifest.webmanifest', 'web.config',
    'README.md', '.gitignore', '同步到线上.command',
}
PRIVATE_EXT = (
    '.pdf', '.zip', '.rar', '.7z', '.tar',
    '.xls', '.xlsx', '.numbers', '.csv',
    '.doc', '.docx', '.pages', '.key',
    '.psd', '.ai', '.sketch', '.fig', '.indd',
    '.mov', '.mp4', '.m4a',
    '.db', '.sqlite', '.sqlite3', '.pem', '.p12', '.mobileprovision',
)


def guard_private(files):
    """这批要提交的文件里，有没有「看着像私人物品、不该公开」的。"""
    if os.environ.get('XY_ALLOW_EXTRA') == '1':
        return
    risky = []
    for f in files:
        low = f.lower()
        if low.endswith(PRIVATE_EXT):
            risky.append((f, '这种文件多半是私人物品'))
        elif '/' not in f and f not in ROOT_OK and not low.endswith('.command'):
            risky.append((f, '根目录多了一个清单外的文件'))
    if not risky:
        return
    bad('这个仓库是【公开】的 —— 下面这些推进去，谁都能看到：')
    for f, why in risky:
        print(f'      · {f}      （{why}）')
    print('      真要传：重跑时加 XY_ALLOW_EXTRA=1 放行一次。')
    print('      不该传：挪出仓库目录，或写进 .gitignore；已暂存的用 git reset 取消。')
    sys.exit(1)


def commit_push(content_changed, dry, custom_msg=''):
    step(3, '提交并推送到 GitHub')
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
        guard_private(files)
        # 这几个是脚本自己烘出来的，不算「人工改动」
        baked = ('api/app.json', 'api/app.json.gz', 'feed.xml', 'assets/js/site-data.js')
        hand = [f for f in files if f not in baked]

        if custom_msg:
            msg = custom_msg
        elif content_changed:
            msg = f'内容同步（content/）：重烘 site-data.js、api/app.json（build {build}）与 feed.xml'
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


def verify_mirror(dry, no_ftp):
    """逐个文件真发一次请求核对镜像，不信 FTP 的「✓ 传好了」。

    为什么非要这一步：`STOR` 返回成功只代表字节传到了磁盘上，不代表 web 服务器肯给。
    这台主机（IIS 10）缺 MIME 映射时文件好端端躺着、HTTP 却是 404.3；
    `api/` 整个目录还会莫名消失。2026-11-27 就是这样「同步全部成功」，
    而 api/app.apk、manifest.webmanifest、data/help.md 在线上 404 了好几天没人发现。
    """
    step(7, '镜像逐文件实访（真发请求，不信 FTP 的成功回执）')
    if dry:
        info('（--dry：不联网）')
        return
    if no_ftp:
        info('（--no-ftp：没动镜像，跳过）')
        return
    r = subprocess.run([sys.executable, 'tools/verify-ftp.py'],
                       cwd=REPO, capture_output=True, text=True)
    lines = [l for l in (r.stdout or '').strip().splitlines() if l.strip()]
    for line in lines[-14:]:
        print('   ' + line)
    if r.returncode != 0:
        print('\n   ⚠ 镜像有文件访问不到 —— 上面那行 `--files ...` 拿去补传，再跑一次核对：')
        print('     python3 tools/verify-ftp.py')
    elif r.stderr.strip():
        info(r.stderr.strip()[-300:])


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
    if explicit:
        sys.exit(f'内容现在只有一个文件 content/site.json，不用再传文件了。\n'
                 f'  后台「导出 site.json」拖到桌面「壹号栈 · 拖文件上传」会自动走这条；\n'
                 f'  手动的话：覆盖 content/site.json 后重跑 python3 tools/sync.py\n'
                 f'  （刚才多传的参数：{explicit}）')

    if not os.path.isdir(os.path.join(REPO, '.git')):
        sys.exit('这个目录不是 git 仓库')

    content_changed = build_content(dry)
    rebake(dry)
    before, changed = commit_push(content_changed, dry, custom_msg)

    if no_ftp:
        step(4, '跳过镜像（--no-ftp）')
    else:
        push_mirror(changed, force_all, dry)

    purge(changed, dry)
    verify(dry)
    verify_mirror(dry, no_ftp)

    print('\n' + '=' * 46)
    print('做完。手机 / App 上看到旧内容的话：')
    print('  · 网页：下拉刷新或强刷一次（Ctrl/⌘ + Shift + R）')
    print('  · App：切到后台再回来，或在首页下拉刷新')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        sys.exit('\n已中断')
