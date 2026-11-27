#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""壹号栈 · 本地预览（兼一键发布）
========================================================================
先看一眼，再决定要不要上线。

    python3 tools/preview.py                       看现在的 content/site.json
    python3 tools/preview.py ~/Downloads/site.json  先把这份拷进去，再预览
    python3 tools/preview.py --port 8400           换端口（默认 8321，占了就自动往后找）
    python3 tools/preview.py --no-open             不自动开浏览器
    python3 tools/preview.py --no-publish          关掉「一键发布」通道，只看不推

默认做三件事：
    ① 校验 content/site.json，通过就烘成 assets/js/site-data.js
    ② 在本机起一个静态服务器（只听 127.0.0.1，外网连不进来）
    ③ 打开浏览器给你看

v174 起多一件（要你点头才做）：在预览地址上打开后台，点「🚀 确认内容，直接发布到线上」，
它替你收下后台草稿 → 烘 → 推 GitHub → 传国内镜像 → 逐项核对。
也就是说：不用再导出 site.json、不用再拖桌面图标，确认一下就到线上。
这条通道只认本机来的 POST（校验 Origin），外网连不上这个端口。

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


def looks_like_site(d):
    """结构说话：顶层有 nav / feed / posts 里至少两个数组，就是全站内容。"""
    if not isinstance(d, dict):
        return False
    marks = sum(1 for k in ('nav', 'feed', 'posts') if isinstance(d.get(k), list))
    return marks >= 2


# ------------------------------------------------------------------ 一键发布

PUB_LOCK = threading.Lock()      # 一次只跑一条，避免两份内容抢着写盘
JOBS = {}                        # id -> {state, ok, lines, summary, warn}
JOBS_LOCK = threading.Lock()
PUBLISH_ON = True

# 烘一次会改这几个文件。演练（--dry）结束时原样还回去，
# 不然「只是看看」也会把仓库弄脏、把线上内容换成测试草稿。
BAKED = [
    os.path.join(REPO, 'assets', 'js', 'site-data.js'),
    os.path.join(REPO, 'api', 'app.json'),
    os.path.join(REPO, 'api', 'app.json.gz'),
    os.path.join(REPO, 'feed.xml'),
]


def snapshot(paths):
    snap = {}
    for p in paths:
        try:
            snap[p] = open(p, 'rb').read() if os.path.exists(p) else None
        except Exception:                                   # noqa: BLE001
            snap[p] = None
    return snap


def restore(snap):
    for p, blob in snap.items():
        try:
            if blob is None:
                if os.path.exists(p):
                    os.remove(p)
            else:
                with open(p, 'wb') as fh:
                    fh.write(blob)
        except Exception:                                   # noqa: BLE001
            pass


# 内容与产物本来就在这次发布里，不算「顺手裹进来」
OWN_CHANGES = ('content/site.json', 'assets/js/site-data.js',
               'api/app.json', 'api/app.json.gz', 'feed.xml')


def dirty_extras():
    """工作区里还有哪些「跟这次发布无关」的改动 ——
    一键发布用的是 git 一起提交，不说一声就会把它们裹进同一条提交。"""
    try:
        out = subprocess.run(['git', '-c', 'core.quotepath=false', 'status', '--porcelain'],
                             cwd=REPO, stdout=subprocess.PIPE, text=True,
                             errors='replace').stdout
    except Exception:                                       # noqa: BLE001
        return []
    res = []
    for line in out.splitlines():
        p = line[3:].strip().strip('"')
        if p and p not in OWN_CHANGES:
            res.append(p)
    return res


def job_new():
    jid = 'p%d' % int(time.time() * 1000)
    with JOBS_LOCK:
        # 只留最近 5 个，别让这个进程越跑越沉
        if len(JOBS) >= 5:
            for k in sorted(JOBS)[:-4]:
                JOBS.pop(k, None)
        JOBS[jid] = {'id': jid, 'state': 'running', 'ok': None,
                     'lines': [], 'summary': '', 'warn': 0}
        return JOBS[jid]


def run_stream(cmd, emit, cwd=None):
    """跑一条命令，输出逐行喂给 emit（发布日志要能实时滚）。"""
    p = subprocess.Popen(cmd, cwd=cwd or REPO, stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, text=True,
                         errors='replace', bufsize=1)
    for line in p.stdout:
        emit(line.rstrip('\n'))
    p.stdout.close()
    p.wait()
    return p.returncode


def publish_worker(job, data, msg, dry):
    """后台草稿 → 盘上 → 烘 → 推全端。失败不动线上；内容写错自动还原上一版。"""
    L = job['lines']

    def emit(s=''):
        L.append(s)
        if s:
            say('  │ ' + s)            # 终端里也跟着滚，关掉后台页也知道跑到哪了

    try:
        with PUB_LOCK:
            emit('壹号栈 · 后台一键发布' + ('（演练：不会推远端）' if dry else ''))
            emit('=' * 46)

            # 内容跟仓库里那份一模一样、又没别的改动 → 不用白跑一趟
            if not dry:
                same = False
                try:
                    with open(SITE, encoding='utf-8') as fh:
                        same = (json.dumps(json.load(fh), sort_keys=True, ensure_ascii=False)
                                == json.dumps(data, sort_keys=True, ensure_ascii=False))
                except Exception:                       # noqa: BLE001
                    same = False
                if same and not dirty_extras():
                    emit('· 收到的内容和仓库里那一份完全一样，也没别的改动。')
                    emit('  没有东西可发 —— 这一趟不用跑，线上本来就是这一版。')
                    job.update(state='done', ok=True, summary='没有改动，跳过')
                    return

            bak = None
            keep = None
            if dry:
                keep = snapshot([SITE] + BAKED)     # 演练：跑完原样还回去
            elif os.path.exists(SITE):
                bak = os.path.join(tempfile.gettempdir(),
                                   'xy-site-before-%d.json' % int(time.time()))
                shutil.copy2(SITE, bak)
            tmp = SITE + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as fh:
                json.dump(data, fh, ensure_ascii=False, indent=2)
                fh.write('\n')
            os.replace(tmp, SITE)
            emit('[1] 收下后台内容 → content/site.json')
            emit('    · ' + counts())
            if bak:
                emit('    · 上一版已备份 → %s' % bak)
            extra = [] if dry else dirty_extras()
            if extra:
                warn_n = len(extra)
                emit('    ⚠ 工作区还有 %d 个没提交的改动，这次会一起提交：' % warn_n)
                for p in extra[:6]:
                    emit('      · ' + p)
                if warn_n > 6:
                    emit('      · …还有 %d 个' % (warn_n - 6))

            emit('')
            emit('[2] 校验内容并烘产物')
            if run_stream(['node', 'tools/build-content.js'], emit) != 0:
                emit('')
                emit('✗ 内容有问题（上面写了在第几行第几列）。')
                if keep:
                    restore(keep)
                    emit('  仓库里的文件已还原 —— 线上一个字都没动，产物也没变。')
                elif bak:
                    shutil.copy2(bak, SITE)
                    emit('  已把 content/site.json 还原成上一版 —— 线上一个字都没动。')
                emit('  你改的东西还在浏览器草稿里，回去改好再发一次。')
                job.update(state='done', ok=False, summary='内容没通过校验')
                return

            if dry:
                restore(keep)
                emit('')
                emit('✓ 演练通过：内容没问题。仓库里的文件已还原成原样，')
                emit('  没有提交、没有推远端。真要发就点上面那个「🚀 确认内容，直接发布到线上」。')
                job.update(state='done', ok=True, summary='演练通过 · 没有推远端')
                return

            emit('')
            emit('[3] 同步全端（提交推送 → 国内镜像 → 逐项核对）')
            rc = run_stream([sys.executable, '-u', 'tools/sync.py', '--msg', msg], emit)

            text = '\n'.join(L)
            warn = text.count('✗')
            ok = rc == 0
            emit('')
            if ok and warn == 0:
                emit('✅ 全端已上线，逐项核对全过。')
                emit('   网页 ⌘⇧R 强刷一次；App 切后台再回来。')
                job.update(state='done', ok=True, summary='已上线，核对全过')
            elif ok:
                emit('⚠️  推上去了，但有 %d 处核对没通过（看上面带 ✗ 的行）。' % warn)
                emit('   多半是镜像个别文件没传上：双击桌面「壹号栈 · 拖文件上传」补跑一次。')
                job.update(state='done', ok=True, summary='已上线，%d 处待补' % warn,
                           warn=warn)
            else:
                emit('✗ 同步中断了（返回码 %d）。上面有原因。' % rc)
                emit('   推送失败多半是网络 —— 开代理后重发一次；')
                emit('   镜像失败可以双击桌面「壹号栈 · 拖文件上传」补跑。')
                job.update(state='done', ok=False, summary='同步没走完')
    except Exception as e:                                  # noqa: BLE001
        L.append('✗ 发布脚本自己出错了：%s' % e)
        job.update(state='done', ok=False, summary='发布脚本出错')
    finally:
        job['state'] = 'done'


def do_publish(payload):
    """开一条发布任务，立刻返回单号；前端轮询日志。"""
    if not PUBLISH_ON:
        return {'error': '这次启动时关掉了一键发布（--no-publish），关掉预览重开就行'}, 403
    dry = bool(payload.get('dry'))
    data = payload.get('site')
    if not isinstance(data, dict):
        data = payload
    if not looks_like_site(data):
        return {'error': '这份内容不像全站内容（顶层要有 nav / feed / posts 里至少两个）'}, 400
    if PUB_LOCK.locked():
        return {'error': '上一次发布还在跑，等它滚完再点'}, 409
    msg = str(payload.get('msg') or '').strip() or '后台一键发布：内容更新'
    job = job_new()
    threading.Thread(target=publish_worker, args=(job, data, msg, dry),
                     daemon=True).start()
    return {'id': job['id'], 'dry': dry}, 200


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

    # ---------------- 发布接口（只有本机页面能调） ----------------

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _origin_ok(self):
        """只认本机预览页发来的请求。Origin 对不上就拒 ——
        防的是「你逛着别的网页，它偷偷往这儿 POST 一份内容」。"""
        origin = (self.headers.get('Origin') or '').rstrip('/')
        if not origin:
            return True                     # curl 之类的本机命令行没有 Origin，放行
        port = self.server.server_address[1]
        return origin in ('http://127.0.0.1:%d' % port, 'http://localhost:%d' % port)

    def do_POST(self):
        path = self.path.split('?')[0]
        if path != '/__publish':
            self._json({'error': '这个地址只收 /__publish'}, 404)
            return
        if not self._origin_ok():
            self._json({'error': '只接受本机预览页面的请求'}, 403)
            return
        try:
            n = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            n = 0
        if n <= 0 or n > 40 * 1024 * 1024:
            self._json({'error': '内容为空或太大'}, 400)
            return
        try:
            payload = json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception as e:                              # noqa: BLE001
            self._json({'error': '读不懂这份 JSON：%s' % e}, 400)
            return
        if not isinstance(payload, dict):
            self._json({'error': '内容格式不对'}, 400)
            return
        out, code = do_publish(payload)
        self._json(out, code)

    def do_GET(self):
        if self.path.split('?')[0] == '/__publish':
            self._publish_progress()
            return
        super().do_GET()

    def _publish_progress(self):
        """?id=p123&from=0 → 从第 0 行往后给。前端每 600ms 来拉一次。"""
        from urllib.parse import parse_qs, urlparse
        q = parse_qs(urlparse(self.path).query)
        jid = (q.get('id') or [''])[0]
        try:
            start = max(0, int((q.get('from') or ['0'])[0]))
        except ValueError:
            start = 0
        with JOBS_LOCK:
            job = JOBS.get(jid)
            if not job:
                self._json({'error': '没有这条发布记录（预览可能被重启过）'}, 404)
                return
            lines = job['lines']
            self._json({
                'id': job['id'],
                'state': job['state'],
                'ok': job['ok'],
                'summary': job.get('summary') or '',
                'warn': job.get('warn') or 0,
                'from': len(lines),
                'lines': lines[start:],
            })


def serve(port):
    handler = functools.partial(QuietHandler, directory=REPO)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


# ------------------------------------------------------------------ 主流程

def main():
    global PUBLISH_ON
    ap = argparse.ArgumentParser(add_help=True, description='本地看一眼，满意了也能一键推到线上')
    ap.add_argument('file', nargs='?', help='要预览的 site.json（不给就看 content/site.json）')
    ap.add_argument('--port', type=int, default=PORT_START, help='起始端口，默认 8321')
    ap.add_argument('--no-open', action='store_true', help='不自动打开浏览器')
    ap.add_argument('--no-publish', action='store_true',
                    help='关掉「一键发布」，这次只看不推')
    args = ap.parse_args()
    PUBLISH_ON = not args.no_publish

    os.chdir(REPO)
    say()
    rule('═')
    say('壹号栈 · 本地预览    （先看，满意了在后台点一下就上线）')
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
    say('这个窗口先别关 —— 关了预览就停了（一键发布也归它管）。')
    say()
    say('改完满意   → 在这个地址上打开后台 #/admin，点「🚀 确认内容，直接发布到线上」')
    say('             它会自己烘、自己推 GitHub、自己传镜像、自己核对，日志就在按钮下面滚')
    say('             （不想用这个：双击桌面「壹号栈 · 一键同步」推 GitHub + 镜像，老办法）')
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
