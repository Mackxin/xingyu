#!/usr/bin/env python3
"""把站点同步到国内虚拟主机（香港 Freehost / IIS）。

为什么需要它：GitHub Pages 在国内又慢又抖，App 和网页端都该有个国内出口。
这个脚本把整站（或只把 api/）推到虚拟主机的 /wwwroot（域名根），让
`http://yihaozhan.xyz/` 成为一条不依赖 GitHub 的路。
（2026-11-24 之前是放在 /wwwroot/xingyu 子目录，那份已删除。）

用法：
    python3 tools/deploy-ftp.py            # 全量同步
    python3 tools/deploy-ftp.py --only api # 只传 api/（改完内容发 app.json 时用）
    python3 tools/deploy-ftp.py --dry      # 只列清单，不连服务器
    python3 tools/deploy-ftp.py --root /wwwroot   # 换落点：整站推到域名根目录

凭据放在 ~/.xy-ftp（**绝不进仓库**，这个仓是公开的）：
    host=103.115.56.106
    user=你的 FTP 账号
    pass=你的 FTP 密码
    root=/wwwroot

或者写成一个 JSON：
    {"host": "...", "user": "...", "pass": "...", "root": "/wwwroot"}

坑（都是踩过的）：
  * 服务器欢迎语是 GBK，ftplib 得设 encoding='gbk'，否则一登录就 UnicodeDecodeError。
  * IIS 默认没有 .apk 的 MIME 映射，直接传上去是 404.3 —— 站点根必须有
    web.config 把 .apk/.json/.md 映射上（本脚本会顺手保证它在）。
"""

import ftplib
import gzip
import json
import os
import sys
import time

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONF = os.path.expanduser('~/.xy-ftp')

# 这些是开发期的东西，传上去只会占空间、还可能被人翻到
SKIP_DIRS = {'.git', '.workbuddy', '.githooks', '.github', 'tools', 'docs',
             'node_modules', '__pycache__'}
SKIP_FILES = {'README.md', '.gitignore', 'CNAME', 'web.config'}   # web.config 单独处理（见 main 末尾）
SKIP_PREFIX = ('.',)          # 隐藏文件 + macOS 的 ._xxx 资源分叉

# IIS 不认这几个后缀，不映射就是 404.3
WEB_CONFIG = """<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <staticContent>
      <remove fileExtension=".apk" />
      <mimeMap fileExtension=".apk" mimeType="application/vnd.android.package-archive" />
      <remove fileExtension=".json" />
      <mimeMap fileExtension=".json" mimeType="application/json" />
      <remove fileExtension=".md" />
      <mimeMap fileExtension=".md" mimeType="text/markdown; charset=utf-8" />
      <remove fileExtension=".gz" />
      <mimeMap fileExtension=".gz" mimeType="application/gzip" />
    </staticContent>
  </system.webServer>
</configuration>
"""


def load_conf():
    if not os.path.exists(CONF):
        sys.exit(f'缺少 {CONF}，先建一个（host / user / pass / root 四行）')
    raw = open(CONF, encoding='utf-8').read().strip()
    if raw.startswith('{'):
        return json.loads(raw)
    conf = {}
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        k, _, v = line.partition('=')
        conf[k.strip()] = v.strip()
    for k in ('host', 'user', 'pass'):
        if not conf.get(k):
            sys.exit(f'{CONF} 里少了 {k}')
    conf.setdefault('root', '/wwwroot')
    return conf


def bake_gzip():
    """在 api/app.json 旁边再烤一份 api/app.json.gz。

    为什么：这台虚拟主机（IIS 共享版）不让开 gzip 压缩，489 KB 原样传，
    实测比 GitHub Pages（压到 163 KB）慢 3~5 倍。文件本身压不动，那就自己压一份放旁边 ——
    App 端（Repo.bodyText）看到 gzip 魔数会自己解；老版本 APK 根本不会请求这个文件名，零影响。

    mtime=0：同样内容每次压出来字节完全一样，git 不会天天报「已修改」。
    """
    src = os.path.join(REPO, 'api', 'app.json')
    if not os.path.exists(src):
        return
    dst = src + '.gz'
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
        return
    raw = open(src, 'rb').read()
    with open(dst, 'wb') as out:
        with gzip.GzipFile(filename='app.json', mode='wb', fileobj=out,
                           compresslevel=9, mtime=0) as gz:
            gz.write(raw)
    print(f'· app.json.gz 已生成：{len(raw) / 1024:.0f} KB → {os.path.getsize(dst) / 1024:.0f} KB')


def collect(base):
    out = []
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        rel = os.path.relpath(dirpath, base)
        rel = '' if rel == '.' else rel
        for f in sorted(filenames):
            # .command 是本机双击用的入口，传上去只会占地方
            if f in SKIP_FILES or f.startswith(SKIP_PREFIX) or f.endswith(('.pyc', '.command')):
                continue
            out.append((os.path.join(dirpath, f), rel, f))
    return out


def main():
    dry = '--dry' in sys.argv
    only = None
    if '--only' in sys.argv:
        only = sys.argv[sys.argv.index('--only') + 1].strip('/')

    # --files a/b.js,c/d.json —— 只传点名的几个（相对仓库根）。
    # sync.py 用它做增量：内容改动只涉及 site-data.js + api 那几个，
    # 没必要每次把 1.58 MB 的 app.apk 也推一遍。
    pick = None
    if '--files' in sys.argv:
        raw = sys.argv[sys.argv.index('--files') + 1]
        pick = [x.strip().replace('\\', '/').lstrip('/') for x in raw.split(',') if x.strip()]
        if only:
            sys.exit('--files 和 --only 别一起用')

    conf = load_conf()
    # --root /wwwroot —— 临时换个落点，不改 ~/.xy-ftp 里的默认值。
    # 2026-11-24 起整站也从域名根目录提供（http://yihaozhan.xyz/），用它推那一份。
    if '--root' in sys.argv:
        root = sys.argv[sys.argv.index('--root') + 1].rstrip('/')
    else:
        root = conf['root'].rstrip('/')
    base = os.path.join(REPO, only) if only else REPO

    bake_gzip()
    if pick:
        files = []
        for rel in pick:
            p = os.path.join(REPO, rel)
            if not os.path.isfile(p):
                print(f'! 本地没有，跳过：{rel}')
                continue
            d, n = os.path.split(rel)
            files.append((p, d, n))
        if not files:
            sys.exit('--files 里没有一个能传的文件')
    else:
        files = collect(base)
    total = sum(os.path.getsize(p) for p, _, _ in files)
    print(f'本地：{base}')
    print(f'远端：{root}{"/" + only if only else ""}')
    print(f'待传 {len(files)} 个文件 / {total / 1048576:.2f} MB\n')

    if dry:
        for p, rel, name in files:
            print(f'  {(rel + "/" if rel else "") + name:44} {os.path.getsize(p) / 1024:8.0f} KB')
        print('\n（--dry 只看不传）')
        return

    # 这台共享主机连着传几个文件必挂：425 Cannot open data connection、
    # Broken pipe、或者干脆超时 —— 是它在限流数据口。
    # 实测「登录 → 传一个 → 退出」几乎每次都能成，所以宁可慢一点：一个文件一条连接，
    # 失败就退避重试。27 个文件全量也就一分多钟。
    RETRY = 6

    def connect():
        f = ftplib.FTP()
        f.encoding = 'gbk'            # 这台服务器的欢迎语是 GBK，别用默认 utf-8
        f.connect(conf['host'], int(conf.get('port', 21)), timeout=30)
        f.login(conf['user'], conf['pass'])
        f.set_pasv(True)
        return f

    made = set()

    def ensure_on(f, path):
        cur = ''
        for part in [p for p in path.split('/') if p]:
            cur += '/' + part
            if cur in made:
                continue
            try:
                f.mkd(cur)
            except ftplib.error_perm:
                pass                  # 已存在
            made.add(cur)

    def put(local, rdir, name):
        """传一个文件：单开连接 + 退避重试。返回 None 表示成功，否则是最后一次的异常。"""
        last = None
        for attempt in range(1, RETRY + 1):
            f = None
            try:
                f = connect()
                made.clear()          # 新会话，目录得重新认一遍
                ensure_on(f, rdir)
                with open(local, 'rb') as fh:
                    f.storbinary(f'STOR {rdir}/{name}', fh, blocksize=4096)
                try:
                    f.quit()
                except Exception:
                    pass
                return None
            except Exception as e:
                last = e
                try:
                    f.close()
                except Exception:
                    pass
                if attempt < RETRY:
                    wait = 4 * attempt
                    print(f'      … 第 {attempt} 次失败（{e}），{wait}s 后重试')
                    time.sleep(wait)
        return last

    # 文件之间留口气：连着传它会直接 425。环境变量可调，默认 3 秒。
    GAP = float(os.environ.get('XY_FTP_GAP', '3'))

    ok = 0
    t0 = time.time()
    pending = list(files)

    # 传失败会被服务器直接删掉（不是「保持原样」），所以失败的那几个必须补上 ——
    # 2026-11-24 一批 3 个连续 425，config.js / site-data.js 当场变 404。
    # 这里自动补一轮：歇 6 秒再试，还不行才真的报失败。
    for rnd in range(2):
        if not pending:
            break
        if rnd:
            print(f'\n补一轮：还有 {len(pending)} 个没上去，歇 6s 再来')
            time.sleep(6)
        still = []
        for local, rel, name in pending:
            rdir = root + ('/' + only if only else '') + ('/' + rel if rel else '')
            label = ((rel + "/") if rel else "") + name
            err = put(local, rdir, name)
            if err is None:
                ok += 1
                print(f'[{ok:>2}/{len(files)}] ✓ {label}')
            else:
                still.append((local, rel, name))
                print(f'[--/{len(files)}] ✗ {label}  {err}')
            time.sleep(GAP)
        pending = still

    fail = len(pending)

    # IIS 少了这份 web.config，api/app.apk 就是 404.3
    if not only and not pick:
        conf_file = os.path.join(REPO, 'web.config')
        if not os.path.exists(conf_file):
            with open(conf_file, 'w', encoding='utf-8') as fh:
                fh.write(WEB_CONFIG)
        err = put(conf_file, root, 'web.config')
        print('✓ web.config（.apk / .json / .md 的 MIME 映射）' if err is None else f'✗ web.config  {err}')

    print(f'\n完成：成功 {ok} / 失败 {fail}，用时 {time.time() - t0:.1f}s')
    if fail:
        print('没上去的：' + ', '.join((rel + '/' if rel else '') + n for _, rel, n in pending))
    print(f'访问：{conf.get("url", root)}')


main()
