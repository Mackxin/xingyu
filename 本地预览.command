#!/bin/zsh
# ============================================================
#  壹号栈 · 本地预览
#
#  用法一：双击它 —— 看 content/site.json 现在的样子
#  用法二：把后台导出的 site.json 拖到图标上 —— 先换进去再预览
#
#  它只做三件事：
#    ① 校验 content/site.json，通过就烘成 assets/js/site-data.js
#    ② 在本机起个静态服务器（只听 127.0.0.1，外网进不来）
#    ③ 打开浏览器给你看
#
#  完全不碰远端：不提交、不推送、不传镜像、不清缓存。
#  看完满意，再双击「壹号栈 · 一键同步」推上线。
#
#  为什么覆盖了文件还看不到：站点运行时只读 assets/js/site-data.js，
#  不经过「烘」这一步，覆盖 site.json 等于换了菜谱没下锅。
# ============================================================

REPO="/Volumes/1T宝盘/workbuddy/星屿"

if [ ! -d "$REPO" ]; then
  echo "找不到仓库：$REPO"
  echo "多半是移动硬盘没插上。插好再双击一次。"
  echo
  printf "按回车关闭…"
  read -r
  exit 1
fi

cd "$REPO" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

clear
python3 tools/preview.py "$@"
code=$?

echo
printf "按回车关闭这个窗口…"
read -r
exit $code
