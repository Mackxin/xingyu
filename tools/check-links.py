#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
检查 bookmarks.js 里所有链接的死活。

用法：
    # 直连先跑一遍，失败的走本地代理再验一次（区分「真死」和「被墙」）
    python3 tools/check-links.py --proxy http://127.0.0.1:7897

    可选参数：
      --workers N     并发数（默认 24）
      --timeout N     单次超时秒数（默认 10）
      --out FILE      结果 JSON 存哪（默认 /tmp/linkcheck.json）
      --dead FILE     死链清单写到哪（默认 tools/dead-links.txt）

判定规则（宁可错杀少，也不误删）：
    2xx / 3xx            → ok
    404 / 410            → dead      （页面/资源已不存在）
    域名解析失败          → dead      （NXDOMAIN，域名没了）
    连接被拒 / 连接失败    → dead      （服务器没了；会用代理复验一次）
    401 / 403 / 405 / 429 / 451 → blocked（站点活着，只是不让脚本进）
    5xx / 超时 / SSL 错   → unstable  （可能是临时故障或被墙，不删）
"""
import argparse
import json
import os
import re
import socket
import ssl
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36')

DEAD_STATUS = {404, 410}
ALIVE_STATUS = {401, 403, 405, 406, 429, 451, 999}


def load_links(path):
    """取出所有 [{'cat','n','u'}]。

    两种源都认：
      · content/site.json（v169 起的唯一内容源，nav 段就是分类树）
      · assets/js/bookmarks.js（老的出厂数据，只在 site.json 不在时才用）
    """
    if path.endswith('.json'):
        d = json.load(open(path, encoding='utf-8'))
        cats = d.get('nav') or d.get('categories') or []
    else:
        src = open(path, encoding='utf-8').read()
        i = src.index('var categories = ')
        j = src.index(';\n  return', i)
        cats = json.loads(src[i + len('var categories = '):j])
    out = []
    for c in cats:
        for l in c.get('links') or []:
            u = l.get('u') or l.get('url') or ''
            if not u or u.startswith('#'):
                continue          # 站内跳转（#/xxx）不用外网探活
            out.append({'cat': c.get('name') or c.get('n') or '', 'n': l.get('n') or l.get('title') or '', 'u': u})
    return out


def _opener(proxy=None):
    """不校验证书（很多小站证书过期，不该判死），可按需挂代理。"""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    handlers = [urllib.request.HTTPSHandler(context=ctx)]
    if proxy:
        handlers.append(urllib.request.ProxyHandler({'http': proxy, 'https': proxy}))
    else:
        handlers.append(urllib.request.ProxyHandler({}))   # 显式不用环境变量里的代理
    return urllib.request.build_opener(*handlers)


def _once(url, timeout, proxy, method):
    """发一次请求，只取状态码就断开。返回 (code, None) 或 (None, 异常标记)。"""
    req = urllib.request.Request(url, method=method, headers={
        'User-Agent': UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'zh-CN,zh;q=0.9'})
    try:
        with _opener(proxy).open(req, timeout=timeout) as r:
            return r.status, None
    except urllib.error.HTTPError as e:          # 4xx/5xx 也算「有回应」
        return e.code, None
    except urllib.error.URLError as e:
        return None, e.reason
    except (socket.timeout, TimeoutError):
        return None, 'timeout'
    except ssl.SSLError:
        return None, 'ssl'
    except Exception as e:                        # noqa: BLE001
        return None, type(e).__name__


def probe(url, timeout, proxy=None):
    """返回 (判定, http 状态, 说明)"""
    code, err = _once(url, timeout, proxy, 'HEAD')
    # 不少站不支持 HEAD（400/403/405/501），退回 GET
    if code is not None and code in (400, 403, 405, 500, 501):
        code2, err2 = _once(url, timeout, proxy, 'GET')
        if code2 is not None:
            code, err = code2, None
        elif err2:
            err = err2
    if code is None:
        s = str(err)
        if isinstance(err, socket.gaierror) or 'Name or service not known' in s \
                or 'nodename nor servname' in s or 'getaddrinfo failed' in s:
            return ('dead', None, '域名解析失败')
        if isinstance(err, ConnectionRefusedError) or 'Connection refused' in s:
            return ('dead', None, '连接被拒')
        if err == 'timeout' or isinstance(err, socket.timeout):
            return ('unstable', None, '超时')
        if err == 'ssl' or isinstance(err, ssl.SSLError):
            return ('unstable', None, 'SSL 证书错误')
        if 'reset' in s.lower() or 'Remote end closed' in s:
            return ('unstable', None, '连接被重置')
        if 'TooManyRedirects' in s or 'redirect' in s.lower():
            return ('unstable', None, '重定向死循环')
        return ('unstable', None, s[:40])

    if code in DEAD_STATUS:
        return ('dead', code, 'HTTP %d' % code)
    if 200 <= code < 400 or code in ALIVE_STATUS:
        return ('ok', code, 'HTTP %d' % code)
    if code >= 500:
        return ('unstable', code, 'HTTP %d' % code)
    return ('blocked', code, 'HTTP %d' % code)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--file', default='content/site.json',
                    help='内容源：content/site.json（默认）或老的 assets/js/bookmarks.js')
    ap.add_argument('--workers', type=int, default=24)
    ap.add_argument('--timeout', type=float, default=10)
    ap.add_argument('--proxy', default='', help='失败后复验用的代理，如 http://127.0.0.1:7897')
    ap.add_argument('--out', default='/tmp/linkcheck.json')
    ap.add_argument('--dead', default='tools/dead-links.txt')
    args = ap.parse_args()

    links = load_links(args.file)
    if not links:
        print('没读到链接（%s）' % args.file)
        return 1
    print('共 %d 条链接，%d 并发，超时 %.0fs' % (len(links), args.workers, args.timeout))

    lock = threading.Lock()
    done = [0]
    t0 = time.time()

    def work(item):
        u = item['u']
        verdict, code, note = None, None, ''
        if not re.match(r'^https?://', u, re.I):
            # 站内相对路径（assets/tools/xxx.html 这种）：不打网络，直接看仓库里有没有
            local = os.path.join(ROOT, u.split('#')[0].split('?')[0].lstrip('/'))
            verdict, note = ('ok', '本地文件在') if os.path.isfile(local) else ('dead', '站内文件不存在')
        else:
            verdict, code, note = probe(u, args.timeout)
        # 直连不通的，走代理再验一次：能通说明只是被墙，不算死链
        via = ''
        if verdict in ('dead', 'unstable') and args.proxy and re.match(r'^https?://', u, re.I):
            v2, c2, n2 = probe(u, args.timeout, proxy=args.proxy)
            if v2 in ('ok', 'blocked'):
                verdict, code, note, via = v2, c2, n2, 'proxy'
            elif v2 == 'dead' and verdict != 'dead':
                verdict, code, note, via = 'dead', c2, n2, 'proxy'
        with lock:
            done[0] += 1
            if done[0] % 100 == 0:
                print('  … %d/%d  %.0fs' % (done[0], len(links), time.time() - t0), flush=True)
        return dict(item, verdict=verdict, code=code, note=note, via=via,
                    host=urlparse(u).netloc or '（站内）')

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        rows = list(ex.map(work, links))

    by = {}
    for r in rows:
        by.setdefault(r['verdict'], []).append(r)

    print('\n结果（%.1fs）：' % (time.time() - t0))
    for k in ['ok', 'blocked', 'unstable', 'dead']:
        print('  %-9s %d' % (k, len(by.get(k, []))))

    dead = by.get('dead', []) + by.get('unstable', [])
    # 只把「真死」的写进清单：dead 全留；unstable 里只留明确 5xx 或域名相关的
    dead = [r for r in dead if r['verdict'] == 'dead']
    dead.sort(key=lambda x: (x['cat'], x['n']))

    with open(args.dead, 'w', encoding='utf-8') as f:
        f.write('# 死链接清单（由 tools/check-links.py 生成，import-naver.py 会跳过这些网址）\n')
        f.write('# 共 %d 条\n' % len(dead))
        for r in dead:
            f.write('%s\t%s\t%s\t%s\n' % (r['u'], r['n'], r['cat'], r['note']))

    json.dump(rows, open(args.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('\n死链 %d 条 → %s' % (len(dead), args.dead))
    print('完整结果 → %s' % args.out)

    if dead:
        print('\n死链预览：')
        for r in dead[:40]:
            print('  [%s] %s | %s | %s' % (r['cat'], r['n'], r['u'], r['note']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
