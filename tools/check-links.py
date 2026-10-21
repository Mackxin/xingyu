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
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

import requests

UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36')

DEAD_STATUS = {404, 410}
ALIVE_STATUS = {401, 403, 405, 406, 429, 451, 999}


def load_links(path):
    """从 bookmarks.js 里把 [{n,u}] 抠出来，顺带记住它属于哪个分类"""
    src = open(path, encoding='utf-8').read()
    i = src.index('var categories = ')
    j = src.index(';\n  return', i)
    cats = json.loads(src[i + len('var categories = '):j])
    out = []
    for c in cats:
        for l in c['links']:
            out.append({'cat': c['name'], 'n': l['n'], 'u': l['u']})
    return out


def probe(url, timeout, proxy=None):
    """返回 (判定, http 状态, 说明)"""
    proxies = {'http': proxy, 'https': proxy} if proxy else None
    headers = {'User-Agent': UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'zh-CN,zh;q=0.9'}
    try:
        # 先 HEAD，很多站不支持就退回 GET（只读前 2KB 就断开）
        r = requests.head(url, timeout=timeout, allow_redirects=True,
                          headers=headers, proxies=proxies, verify=False)
        if r.status_code in (400, 403, 405, 500, 501):
            r = requests.get(url, timeout=timeout, allow_redirects=True, stream=True,
                             headers=headers, proxies=proxies, verify=False)
            code = r.status_code
            r.close()
        else:
            code = r.status_code
    except requests.exceptions.SSLError:
        return ('unstable', None, 'SSL 证书错误')
    except requests.exceptions.TooManyRedirects:
        return ('unstable', None, '重定向死循环')
    except requests.exceptions.Timeout:
        return ('unstable', None, '超时')
    except requests.exceptions.ConnectionError as e:
        msg = str(e)
        if 'Name or service not known' in msg or 'nodename nor servname' in msg or 'getaddrinfo failed' in msg:
            return ('dead', None, '域名解析失败')
        if 'Connection refused' in msg:
            return ('dead', None, '连接被拒')
        # 「被重置」在国内多半是墙，不是站点死了 —— 先算不稳定，等代理复验
        if 'Connection reset' in msg or 'RemoteDisconnected' in msg:
            return ('unstable', None, '连接被重置')
        return ('unstable', None, '连接失败')
    except Exception as e:                                    # noqa: BLE001
        return ('unstable', None, type(e).__name__)

    if code in DEAD_STATUS:
        return ('dead', code, 'HTTP %d' % code)
    if 200 <= code < 400 or code in ALIVE_STATUS:
        return ('ok', code, 'HTTP %d' % code)
    if code >= 500:
        return ('unstable', code, 'HTTP %d' % code)
    return ('blocked', code, 'HTTP %d' % code)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--file', default='assets/js/bookmarks.js')
    ap.add_argument('--workers', type=int, default=24)
    ap.add_argument('--timeout', type=float, default=10)
    ap.add_argument('--proxy', default='', help='失败后复验用的代理，如 http://127.0.0.1:7897')
    ap.add_argument('--out', default='/tmp/linkcheck.json')
    ap.add_argument('--dead', default='tools/dead-links.txt')
    args = ap.parse_args()

    requests.packages.urllib3.disable_warnings()
    links = load_links(args.file)
    print('共 %d 条链接，%d 并发，超时 %.0fs' % (len(links), args.workers, args.timeout))

    lock = threading.Lock()
    done = [0]
    t0 = time.time()

    def work(item):
        verdict, code, note = probe(item['u'], args.timeout)
        # 直连不通的，走代理再验一次：能通说明只是被墙，不算死链
        via = ''
        if verdict in ('dead', 'unstable') and args.proxy:
            v2, c2, n2 = probe(item['u'], args.timeout, proxy=args.proxy)
            if v2 in ('ok', 'blocked'):
                verdict, code, note, via = v2, c2, n2, 'proxy'
            elif v2 == 'dead' and verdict != 'dead':
                verdict, code, note, via = 'dead', c2, n2, 'proxy'
        with lock:
            done[0] += 1
            if done[0] % 100 == 0:
                print('  … %d/%d  %.0fs' % (done[0], len(links), time.time() - t0), flush=True)
        return dict(item, verdict=verdict, code=code, note=note, via=via, host=urlparse(item['u']).netloc)

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


if __name__ == '__main__':
    main()
