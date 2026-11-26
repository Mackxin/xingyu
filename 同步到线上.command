#!/bin/zsh
# 双击运行 —— 改完 content/ 里的文件（feed.json / posts/*.md / nav.json）之后，双击这个文件。
# 它会把：校验+构建 content/ → 重烘 app.json/feed.xml → 推 GitHub 和国内镜像，
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
