#!/bin/zsh
# 双击运行 —— 改完 content/site.json（全站内容就这一个文件）之后，双击这个文件。
# 想先看效果、还不想上线？双击「本地预览.command」，它只在本机开个页面，不碰远端。
# 它会把：校验+构建 content/site.json → 重烘 app.json/feed.xml → 推 GitHub 和国内镜像，
# 最后核对三端版本号。具体做了什么看终端里的输出，或者看 tools/sync.py 开头。
#
# 想带参数跑（比如只推 GitHub 不碰镜像），在这个文件上右键 → 打开方式 → 终端，
# 或者直接在终端里：python3 tools/sync.py --no-ftp

cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

clear
python3 tools/sync.py "$@"
code=$?

echo
if [ $code -ne 0 ]; then
  echo "—— 有一步没成功，上面红字（✗）就是原因。按回车关闭 ——"
else
  echo "—— 按回车关闭 ——"
fi
read -r
exit $code
