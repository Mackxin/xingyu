---
title: Mac 软件推荐
id: mac-software
date: 2026-04-24
tags: [Mac, 软件]
excerpt: 换 Mac 之后一晚上装齐的常用软件清单：11 个日常工具、两段能救命的终端命令，还有几个值得慢慢看的推荐。
---

国补弄了一台 Mac Mini，开始正经用 Mac 了。从开机到把常用软件装齐，断断续续折腾了一晚上。

这一页就是当时的清单——软件、命令、装机记录都留在这儿。以后再重装系统，不用回头去翻聊天记录和浏览器历史。

## 壹 · Mac 软件下载

*精选日常使用必备工具*

- **[📦 MacWK](https://macwk.com)** — 免费、高质量的 Mac 软件下载平台，涵盖系统工具、设计软件、编程环境等。
  `系统工具` `设计软件` `编程环境`

- **[🖱️ Scroll Reverser](https://pilotmoon.com/scrollreverser/)** — 分别设置鼠标和触控板的滚动方向，解决 Mac 上鼠标滚动方向不适的问题。
  `免费` `触控板` `鼠标`

- **[📁 MacZip](https://maczip.cn)** — 专为 macOS 设计的压缩软件，支持 20+ 格式，永久免费。
  `压缩` `加密` `20+ 格式`

- **[🖥️ Mac Mouse Fix](https://macmousefix.com)** — 模拟触控板手势，在 Mac 上提供好用的鼠标增强功能。
  `手势` `滚动` `鼠标增强`

- **[🪟 DockMinimize](https://ivean.com/dockminimize/)** — 在 macOS 上实现类似 Windows 系统的单击隐藏和显示窗口功能。
  `窗口预览` `显示隐藏`

- **[🌅 AltTab](https://alt-tab.app/)** — 切换到任意窗口。
  `后台切换`

- **[🛣️ Keka](https://www.keka.io/zh-cn/)** — macOS 系统压缩文件管理器，官网免费下载。
  `压缩` `免费`

- **[✨ Melodic Stamp](https://github.com/Cement-Labs/MelodicStampPrototype)** — 一款为 macOS 设计的美丽、简单且优雅的本地音乐播放器，具有元数据编辑功能。通过直观而优雅的界面，您可以轻松浏览和播放各种音频格式。
  `音乐播放器` `mac系统`

- **[🛣️ Pearcleaner](https://github.com/alienator88/Pearcleaner)** — 一款开源的 mac 应用清理工具，灵感来源于 Freemacsoft 的 AppCleaner 和 Sun Knudsen 的隐私指南。
  `应用卸载` `系统清理`

- **[🛣️ FineTune](https://github.com/ronitsingh10/FineTune)** — 独立控制每个应用的音量，将较轻的应用音量提升至 4 倍，将音频路由到不同的扬声器，并使用均衡器和耳机校正来塑造您的声音。驻留在您的菜单栏。免费且开源。
  `音量控制` `单独调节`

- **[🛣️ LaunchNext](https://closex.org/cn/launchnext/)** — macOS26+最强的免费开源 Launchpad 替代方案。可切换渲染引擎、查看缓存状态，享受丝滑的 120FPS 动画体验。
  `启动台` `快速查看`

## 贰 · 装机记录

*新 Mac 装机实用工具与配置*

- **[💻 新 Macbook Pro 装机记录](https://www.rustc.cloud/mac-install)** — 日常 Mac 软件推荐，记录装机过程中的实用工具和配置经验。涵盖开发工具、实用系统设置、插件以及新手常见问题解答。
  `装机` `配置` `开发工具`

## 叁 · 更多推荐

*录屏、格式转换、自救指南*

- **[🎥 QuickRecorder](https://lihaoyun6.github.io/quickrecorder/)** — 开源轻量高性能 macOS 录屏工具，支持全屏 / 区域 / 窗口 / App 录制，双屏支持，文件小于 10MB，零隐私数据收集。

- **[📸 图片转换 PDF 专家](https://apps.apple.com/cn/app/solid-image-converter/id6737818163)** — 完全免费无广告无离线，支持 60+ 图片格式转 PDF，内置 OCR 可编辑 PDF，纯离线运行。
  `图片转 PDF` `OCR` `60+ 格式`

- **[🍎 苹果生态玄学自救指北](https://xream.notion.site/6fed380cf1d147c6a047bce452a8f2af)** — 苹果生态实用故障排查与技巧指南，慢慢看，总有能用上的一条。

- **[🎁 小张的分享中心](https://qnswkjn28n.feishu.cn/wiki/T8uJwQH4YiIy7BkHyQpczpyDnug)** — 让大家用上好用的工具，创作出优秀的作品。目前面向全体 Mac 用户。

## 肆 · 终端命令

*macOS 系统常用终端指令*

### 🔓 允许未知来源 — macOS 10.13

开启后可安装任意来源的应用。在终端中粘贴执行，输入密码后回车。

```bash
# 启用
sudo spctl --master-disable
# 恢复
sudo spctl --master-enable
```

### 🔓 移除隔离属性 — macOS 10.15

移除已下载应用的隔离标志。将应用拖入终端替换路径，回车执行。

```bash
sudo xattr -r -d com.apple.quarantine [拖入应用]
# 例
sudo xattr -r -d com.apple.quarantine /Applications/qq.app/
```

- **[🍺 Homebrew 安装](https://gitee.com/cunkai/HomebrewCN/raw/master/Homebrew.sh)** — macOS 必备包管理器，一键脚本快速安装。

- **[🗑️ Homebrew 卸载](https://gitee.com/cunkai/HomebrewCN/raw/master/HomebrewUninstall.sh)** — 需要时一键移除 Homebrew。

## 伍 · 系统工具

*磁盘恢复等实用软件*

- **[💿 Disk Drill](https://www.cleverfiles.com/cn/data-recovery-software.html)** — 磁盘数据恢复软件，帮助找回误删文件。
  `数据恢复` `磁盘工具`

## 陆 · 收费软件

*随意整理哦*

- **[✨ Wins 3](https://wins.cool/zh)** — 告别传统窗口切换，带来更多✨效率提升。1 天免费试用，一次购买 / 永久授权。

---

> 这些是 2026 年 4 月的状态，软件更新换代快，链接要是失效了，就只当个名字线索去搜。
