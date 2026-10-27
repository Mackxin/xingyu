/* =========================================================
   壹号栈 YIHAOZHAN · 数据层
   所有内容集中在此，方便自行增删。
   link: { n 名称, u 链接, d 描述 }
   feed: { date 日期, icon 图标, title 标题, url 链接, desc 描述, tags 标签[] }
   post: { id 标识, title 标题, date 日期, tags 标签[], excerpt 摘要,
           body Markdown 正文, pin 置顶, draft 草稿 }
   ========================================================= */

/* assets/js/site-data.js 是后台「发布到虚拟主机」导出的快照。
   它一旦有内容，就等于「这些数据我说了算」—— 下面是源码里的默认内容，
   只用来做兜底，不再覆盖它。 */
window.SITE_DATA = window.SITE_DATA || (function () {

  /* ---------------- 导航分类 ----------------
     站点数据全在 assets/js/bookmarks.js（由 tools/import-naver.py 从「壹号导航」
     抽取的 50 个分类 / 2242 条链接）。data.js 只负责把两边接起来。
     想加自己的分类，直接 push 到这个数组里就行，或者写在下面「自己补的分类」。 */
  var categories = (window.SITE_BOOKMARKS && window.SITE_BOOKMARKS.categories) || [];

  /* ---------------- 自己补的分类（可选） ----------------
     bookmarks.js 里没有的站可以写在这儿，会自动接在最后。
     一个分类长这样：{ id: "mine", name: "我的", icon: "⭐", desc: "一句话说明",
                      links: [{ n: "站点名", u: "https://…", d: "描述" }] }
  var myCats = [
  ];
  categories = categories.concat(myCats); */


  /* ---------------- 分享流（时间线） ---------------- */
  var feed = [
    {
      date: '2026-10-17', icon: '🧭',
      title: '壹号栈导航 · 新版上线',
      url: '#/nav',
      desc: '把散落在浏览器书签栏里的网址重新收拢成 50 个主题分类，支持拼音与关键词即时搜索、收藏置顶，以及 ⌘K 一键盘点所有站点。',
      tags: ['本站', '导航']
    },
    {
      date: '2026-10-17', icon: '🎨',
      title: '暗色玻璃拟态设计规范',
      url: 'https://glassmorphism.com',
      desc: '一层柔和的极光渐变，叠上半透明玻璃卡片与 1px 高光描边，就是这套界面的全部秘密。核心只有三件事：模糊、透明度、克制的发光。',
      tags: ['设计', 'CSS']
    },
    {
      date: '2026-10-16', icon: '⚡',
      title: '纯前端单页路由的极简写法',
      url: 'https://developer.mozilla.org/zh-CN/docs/Web/API/Window/hashchange',
      desc: '不引入任何框架，用 hashchange 事件配合模块化的 render 函数，就能让一个 html 文件拥有流畅的多页面体验，刷新还能停在原地。',
      tags: ['前端', '技巧']
    },
    {
      date: '2026-10-15', icon: '🖼️',
      title: '用色彩指纹代替加载图标',
      url: '#/nav',
      desc: '担心外链图标拖慢首屏？把站点名做一次哈希映射到固定色相，生成渐变字母徽标——零请求、不闪烁、永远在线，视觉上也更统一。',
      tags: ['设计', '性能']
    },
    {
      date: '2026-10-14', icon: '⌘',
      title: '命令面板：让键盘成为第一入口',
      url: 'https://cmdk.paco.me',
      desc: '⌘K 唤起全局搜索后，可以跨页面、跨分类、跨站点直接跳转。一次输入，四条通路——页面、分类、站内收藏与分享条目全部命中。',
      tags: ['交互', '效率']
    },
    {
      date: '2026-10-13', icon: '🌊',
      title: 'Claude',
      url: 'https://claude.ai',
      desc: '长文档理解依旧是它最稳的能力，格式复杂的合同、论文丢进去，能给出条理清晰的结构化摘要，写作时的语气也拿捏得住。',
      tags: ['AI', '工具']
    },
    {
      date: '2026-10-11', icon: '🎧',
      title: '小宇宙播客',
      url: 'https://www.xiaoyuzhoufm.com',
      desc: '中文播客里少见的「干净」体验：没有过度推荐，评论区气质友好，通勤路上挑一档聊技术或聊生活的节目，时间会过得很快。',
      tags: ['播客', '生活']
    },
    {
      date: '2026-10-09', icon: '🧩',
      title: 'Excalidraw',
      url: 'https://excalidraw.com',
      desc: '手绘风格的无限白板，画架构图、梳理思路都不必登录。最舒服的是它刻意"画不直"的线条，反而让人更愿意动笔。',
      tags: ['工具', '绘图']
    },
    {
      date: '2026-10-07', icon: '📚',
      title: 'Project Gutenberg',
      url: 'https://www.gutenberg.org',
      desc: '七万余本版权过期的经典著作，纯文本即可下载。想安静读完一本英文原著，这里是几乎不会消失的入口。',
      tags: ['阅读', '资源']
    },
    {
      date: '2026-10-05', icon: '🌀',
      title: 'Radio Garden',
      url: 'https://radio.garden',
      desc: '拖动地球仪上的绿点，就能实时收听那个城市此刻在播的电台。换个坐标，像换一个世界的背景音。',
      tags: ['音乐', '有趣']
    },
    {
      date: '2026-10-02', icon: '🔭',
      title: '今日热榜',
      url: 'https://tophub.today',
      desc: '把各大平台的热搜榜单聚合到一页，临时想看看"今天大家在聊什么"的时候很好用，省去反复切换 App 的功夫。',
      tags: ['资讯', '聚合']
    },
    {
      date: '2026-09-30', icon: '🧠',
      title: 'Anki',
      url: 'https://apps.ankiweb.net',
      desc: '间隔重复的经典实现。把要背的东西做成卡片，系统会在你"快忘但还没忘"的时刻推给你——长期记忆这件事，它确实认真。',
      tags: ['学习', '工具']
    },
    {
      date: '2026-09-28', icon: '🌿',
      title: '关于「专注」的一点记录',
      url: '#/share',
      desc: '关掉通知、清空桌面、只留一个待办，效率反而更高。工具越多不代表越自由，把入口收窄，注意力才会重新聚拢。',
      tags: ['随笔', '思考']
    },
    {
      date: '2026-09-25', icon: '🚀',
      title: 'IT Tools',
      url: 'https://it-tools.tech',
      desc: '开发者常用小工具的合集站点：格式化、编码转换、哈希计算、时间戳互转……完全本地运行，用完即走。',
      tags: ['开发', '工具']
    }
  ];

  /* 从「壹号讯息」时间线导入的那批条目另放一个文件（assets/js/feed-import.js），
     这里拼在后面；不想要了就把 index.html 里引入它的那行 <script> 删掉 */
  if (window.XY_FEED_IMPORT && window.XY_FEED_IMPORT.length) {
    feed = feed.concat(window.XY_FEED_IMPORT);
  }

  /* ---------------- 首页快捷入口 ---------------- */
  var entries = [
    { route: '#/nav',   icon: '🧭', title: '壹号栈导航',   desc: '攒了多年的书签全收在这一页，随时一键盘点。', wide: false, spark: true },
    { route: '#/share', icon: '✨', title: '灵感分享',   desc: '像刷动态一样，回看这一年里遇见的工具、灵感与好内容。', wide: false, spark: false },
    { route: '#/post',  icon: '✍️', title: '手记文章',   desc: '写得长一点的东西都在这里：随笔、折腾记录与一点思考。', wide: false, spark: false },
    { route: '#/about', icon: '🌌', title: '关于壹号栈',   desc: '壹号为栈，随处可归的个人数字花园，慢慢生长。', wide: false, spark: false }
  ];

  /* ---------------- 文章（Markdown 原文） ----------------
     id    : 唯一标识，出现在网址 #/post/<id> 里，改标题不用动它
     date  : 写作 / 发布日，YYYY-MM-DD，列表按它倒序分组
     tags  : 归类标签，列表页上方可以直接按它筛选
     pin   : true 会钉在列表最前面
     draft : true 只在后台可见，前台不展示
     body  : Markdown 正文（支持标题 / 列表 / 引用 / 代码块 / 表格 / 图片 / 链接）
     下面两篇是示例，后台「文章」页里可以随时改掉或删掉。 */
  var posts = [
    {
      id: 'hello-xingyu',
      title: '从这里开始写第一篇',
      date: '2026-10-20',
      tags: ['随笔', '建站'],
      pin: true,
      excerpt: '文章页怎么用、Markdown 支持哪些写法，都写在这一篇里。',
      body: [
        '把想法写下来这件事，最难的从来不是「写得好不好」，而是**先写出来**。',
        '',
        '所以这里不做什么编辑器工具栏，你直接写 Markdown 就好——写惯了 `.md` 文件的人，切过来几乎没有成本。',
        '',
        '## 怎么把文章放进来',
        '',
        '两种方式，点开后台「文章」页就能看到：',
        '',
        '1. **直接写**：点「＋ 新建文章」，填标题、日期、标签，正文里粘 Markdown，保存即可。',
        '2. **导入 .md**：点「📥 导入 .md 文件」，一次可以选好几篇，文件名会变成标题（首行有 `# 标题` 则优先用首行）。',
        '',
        '> 小提示：导入时会自动按文件里的标题、正文生成文章，标签留空，之后再补就行。',
        '',
        '## 支持的写法',
        '',
        '| 想要的效果 | 写法 |',
        '| :--- | :--- |',
        '| 标题 | `## 二级标题` |',
        '| 粗体 / 斜体 | `**粗体**` / `*斜体*` |',
        '| 行内代码 | 反引号包起来 |',
        '| 代码块 | 三个反引号 + 语言名 |',
        '| 列表 | `-` 或 `1.`，缩进就是下一层 |',
        '| 引用 | `> 一段话` |',
        '',
        '代码块长这样：',
        '',
        '```js',
        'const posts = XYStore.posts();',
        'console.log(posts.length + " 篇文章");',
        '```',
        '',
        '## 最后',
        '',
        '文章只存在你这台浏览器里（和后台其它数据一样）。想让所有访客都看到，' +
        '到「备份」页导出，或者把内容写进 `assets/js/data.js` 的 `posts` 里。',
        '',
        '写下去，比写好更重要。'
      ].join('\n')
    },
    {
      id: 'how-xingyu-built',
      title: '壹号栈是怎么搭起来的',
      date: '2026-10-12',
      tags: ['建站', '技术'],
      excerpt: '一个不打包、不依赖、不联网也能打开的静态站点，是怎么组织的。',
      body: [
        '壹号栈是一块**纯静态**的地方：没有构建步骤、没有依赖包、没有后端。双击 `index.html` 就能跑，' +
        '扔进任何静态托管也都能跑。',
        '',
        '## 三层结构',
        '',
        '- `data.js` —— 内容：分类、站点、分享、文章',
        '- `config.js` —— 配置：站名、主题、开关，读写 localStorage',
        '- `app.js` / `admin.js` —— 渲染与后台，只负责把数据变成页面',
        '',
        '这样拆的好处很直接：**想改内容，只动 data.js**，不用碰任何渲染逻辑。',
        '',
        '## 为什么不用框架',
        '',
        '需求其实很小：几个页面、一堆链接、一点搜索。用框架要多一层构建、一个 `node_modules`、' +
        '还要担心版本升级——对一个只有自己维护的站点来说，这些成本换不到相应的收益。',
        '',
        '> 能用一行 HTML 解决的问题，不要用一层工具链去解决。',
        '',
        '## 搜索是怎么做的',
        '',
        '拼音首字母没有引字库：拿 23 个「锚点汉字」，用 `localeCompare` 和锚点比大小，' +
        '就能反推出这个字的声母落在哪个区间。',
        '',
        '```js',
        "var py = zh.localeCompare(anchor, 'zh-CN') > 0 ? 'x' : 'a';",
        '```',
        '',
        '够用，而且是零字节的依赖。'
      ].join('\n')
    },
    {
      id: 'mac-software',
      title: 'Mac 软件推荐',
      date: '2026-04-24',
      tags: ['Mac', '软件'],
      excerpt: '换 Mac 之后一晚上装齐的常用软件清单：11 个日常工具、两段能救命的终端命令，还有几个值得慢慢看的推荐。',
      body: [
        '国补弄了一台 Mac Mini，开始正经用 Mac 了。从开机到把常用软件装齐，断断续续折腾了一晚上。',
        '',
        '这一页就是当时的清单——软件、命令、装机记录都留在这儿。以后再重装系统，不用回头去翻聊天记录和浏览器历史。',
        '',
        '## 壹 · Mac 软件下载',
        '',
        '*精选日常使用必备工具*',
        '',
        '- **[📦 MacWK](https://macwk.com)** — 免费、高质量的 Mac 软件下载平台，涵盖系统工具、设计软件、编程环境等。',
        '  `系统工具` `设计软件` `编程环境`',
        '',
        '- **[🖱️ Scroll Reverser](https://pilotmoon.com/scrollreverser/)** — 分别设置鼠标和触控板的滚动方向，解决 Mac 上鼠标滚动方向不适的问题。',
        '  `免费` `触控板` `鼠标`',
        '',
        '- **[📁 MacZip](https://maczip.cn)** — 专为 macOS 设计的压缩软件，支持 20+ 格式，永久免费。',
        '  `压缩` `加密` `20+ 格式`',
        '',
        '- **[🖥️ Mac Mouse Fix](https://macmousefix.com)** — 模拟触控板手势，在 Mac 上提供好用的鼠标增强功能。',
        '  `手势` `滚动` `鼠标增强`',
        '',
        '- **[🪟 DockMinimize](https://ivean.com/dockminimize/)** — 在 macOS 上实现类似 Windows 系统的单击隐藏和显示窗口功能。',
        '  `窗口预览` `显示隐藏`',
        '',
        '- **[🌅 AltTab](https://alt-tab.app/)** — 切换到任意窗口。',
        '  `后台切换`',
        '',
        '- **[🛣️ Keka](https://www.keka.io/zh-cn/)** — macOS 系统压缩文件管理器，官网免费下载。',
        '  `压缩` `免费`',
        '',
        '- **[✨ Melodic Stamp](https://github.com/Cement-Labs/MelodicStampPrototype)** — 一款为 macOS 设计的美丽、简单且优雅的本地音乐播放器，具有元数据编辑功能。通过直观而优雅的界面，您可以轻松浏览和播放各种音频格式。',
        '  `音乐播放器` `mac系统`',
        '',
        '- **[🛣️ Pearcleaner](https://github.com/alienator88/Pearcleaner)** — 一款开源的 mac 应用清理工具，灵感来源于 Freemacsoft 的 AppCleaner 和 Sun Knudsen 的隐私指南。',
        '  `应用卸载` `系统清理`',
        '',
        '- **[🛣️ FineTune](https://github.com/ronitsingh10/FineTune)** — 独立控制每个应用的音量，将较轻的应用音量提升至 4 倍，将音频路由到不同的扬声器，并使用均衡器和耳机校正来塑造您的声音。驻留在您的菜单栏。免费且开源。',
        '  `音量控制` `单独调节`',
        '',
        '- **[🛣️ LaunchNext](https://closex.org/cn/launchnext/)** — macOS26+最强的免费开源 Launchpad 替代方案。可切换渲染引擎、查看缓存状态，享受丝滑的 120FPS 动画体验。',
        '  `启动台` `快速查看`',
        '',
        '## 贰 · 装机记录',
        '',
        '*新 Mac 装机实用工具与配置*',
        '',
        '- **[💻 新 Macbook Pro 装机记录](https://www.rustc.cloud/mac-install)** — 日常 Mac 软件推荐，记录装机过程中的实用工具和配置经验。涵盖开发工具、实用系统设置、插件以及新手常见问题解答。',
        '  `装机` `配置` `开发工具`',
        '',
        '## 叁 · 更多推荐',
        '',
        '*录屏、格式转换、自救指南*',
        '',
        '- **[🎥 QuickRecorder](https://lihaoyun6.github.io/quickrecorder/)** — 开源轻量高性能 macOS 录屏工具，支持全屏 / 区域 / 窗口 / App 录制，双屏支持，文件小于 10MB，零隐私数据收集。',
        '',
        '- **[📸 图片转换 PDF 专家](https://apps.apple.com/cn/app/solid-image-converter/id6737818163)** — 完全免费无广告无离线，支持 60+ 图片格式转 PDF，内置 OCR 可编辑 PDF，纯离线运行。',
        '  `图片转 PDF` `OCR` `60+ 格式`',
        '',
        '- **[🍎 苹果生态玄学自救指北](https://xream.notion.site/6fed380cf1d147c6a047bce452a8f2af)** — 苹果生态实用故障排查与技巧指南，慢慢看，总有能用上的一条。',
        '',
        '- **[🎁 小张的分享中心](https://qnswkjn28n.feishu.cn/wiki/T8uJwQH4YiIy7BkHyQpczpyDnug)** — 让大家用上好用的工具，创作出优秀的作品。目前面向全体 Mac 用户。',
        '',
        '## 肆 · 终端命令',
        '',
        '*macOS 系统常用终端指令*',
        '',
        '### 🔓 允许未知来源 — macOS 10.13',
        '',
        '开启后可安装任意来源的应用。在终端中粘贴执行，输入密码后回车。',
        '',
        '```bash',
        '# 启用',
        'sudo spctl --master-disable',
        '# 恢复',
        'sudo spctl --master-enable',
        '```',
        '',
        '### 🔓 移除隔离属性 — macOS 10.15',
        '',
        '移除已下载应用的隔离标志。将应用拖入终端替换路径，回车执行。',
        '',
        '```bash',
        'sudo xattr -r -d com.apple.quarantine [拖入应用]',
        '# 例',
        'sudo xattr -r -d com.apple.quarantine /Applications/qq.app/',
        '```',
        '',
        '- **[🍺 Homebrew 安装](https://gitee.com/cunkai/HomebrewCN/raw/master/Homebrew.sh)** — macOS 必备包管理器，一键脚本快速安装。',
        '',
        '- **[🗑️ Homebrew 卸载](https://gitee.com/cunkai/HomebrewCN/raw/master/HomebrewUninstall.sh)** — 需要时一键移除 Homebrew。',
        '',
        '## 伍 · 系统工具',
        '',
        '*磁盘恢复等实用软件*',
        '',
        '- **[💿 Disk Drill](https://www.cleverfiles.com/cn/data-recovery-software.html)** — 磁盘数据恢复软件，帮助找回误删文件。',
        '  `数据恢复` `磁盘工具`',
        '',
        '## 陆 · 收费软件',
        '',
        '*随意整理哦*',
        '',
        '- **[✨ Wins 3](https://wins.cool/zh)** — 告别传统窗口切换，带来更多✨效率提升。1 天免费试用，一次购买 / 永久授权。',
        '',
        '---',
        '',
        '> 这些是 2026 年 4 月的状态，软件更新换代快，链接要是失效了，就只当个名字线索去搜。'
      ].join('\n')
    },
    {
      id: 'install-os',
      title: '从零开始安装系统',
      date: '2026-04-19',
      tags: ['系统', '教程'],
      excerpt: '小白重装系统的完整路径：U 盘制作、镜像下载、激活通道、视频补课，按顺序走一遍就行。',
      body: [
        '给一台旧电脑重装系统的全过程记录：U 盘怎么做、镜像去哪儿下、激活用什么、装完看哪个视频补课。',
        '',
        '小白视角的流水账，按顺序走一遍基本不会卡住。装在别的机器上也一样，只是驱动要多留神。',
        '',
        '## 壹 · U 盘制作工具',
        '',
        '*任选其一即可制作启动 U 盘*',
        '',
        '- **[💾 RUFUS](https://rufus.ie/)** — 轻量级 USB 启动盘制作工具，支持 Windows/Linux/UEFI 引导，适用于 BIOS 刷写与低级工具场景。',
        '',
        '- **[🔧 VENTOY](https://www.ventoy.net/)** — 开源可启动 U 盘方案，多 ISO 直拷无需反复格式化，支持 WIM/IMG/VHD/EFI 等多种格式引导。',
        '',
        '## 贰 · 系统下载',
        '',
        '*正版 / 纯净系统镜像资源汇总*',
        '',
        '- **[🪟 Windows 11 正版官网](https://www.microsoft.com/software-download/windows11)** — 微软官方渠道下载，纯净无篡改，配置自动匹配，完整性可验证。',
        '',
        '- **[🌐 WinNew](https://winnew.cn/)** — 简洁的在线 Windows 下载工具，无广告干扰，界面清晰易用。',
        '',
        '- **[📦 HelloWindows](https://hellowindows.cn/)** — 官方原版系统镜像仓库，涵盖 XP 至 Win11，仅收录最新版，未修改可信赖。',
        '',
        '- **[🎯 极简系统](https://www.sysmini.com/)** — 提供多操作系统下载，链接选项丰富，按需选择适合你的版本。',
        '',
        '- **[🚀 又要重装](https://yyczxt.com/)** — 精选优化版 Windows 系统包，精简轻量，适合老旧设备或极速体验。',
        '',
        '- **[🗂️ MSDN 系统下载](https://msdn.itellyou.cn/)** — 综合系统下载站点，含 MSDN 原版、修复工具及 TWM000 等资源。',
        '  `MSDN-山己几子木` `修系统` `TWM000`',
        '',
        '## 叁 · 系统激活',
        '',
        '*Windows / Office 一键激活工具*',
        '',
        '- **🔑 一键激活 Windows / Office** — 基于 KMS 脚本生成的激活通道，操作便捷，支持多款系统与办公套件。',
        '  **[激活通道 ①](https://kms.cx/)** · **[激活通道 ②](https://www.moerats.com/kms/)**',
        '',
        '## 肆 · 一些杂货',
        '',
        '*PE 导航与学习资源*',
        '',
        '- **🧰 KUERPE 全系列导航** — 集成 KMS 脚本学习通道与最全驱动 PE，方便进行系统维护与故障排查。',
        '  **[学习通道](http://bbs.wuyou.net/forum.php?mod=viewthread&tid=434320&extra=page%3D1)** · **[最全驱动 PE](http://bbs.wuyou.net/forum.php?mod=viewthread&tid=441315)**',
        '',
        '## 伍 · 视频教程',
        '',
        '*全网最好的装机教程，没有之一*',
        '',
        '- **[🎬 学习装机](https://www.bilibili.com/video/BV1BG4y137mG/)** — 从零开始学习电脑组装与系统安装，步骤详细适合新手。',
        '',
        '- **[📹 系统重装视频教程](https://www.bilibili.com/video/BV17WZ4YsEiX/)** — 手把手演示系统重装全流程，避开常见坑点。',
        '',
        '- **[🔧 2025 全球电脑故障解决指南](https://zhuangit.ababtools.com/videos)** — 涵盖常见硬件 / 系统故障排查与修复方案，全面实用。',
        '',
        '---',
        '',
        '> 系统镜像和激活工具都属于灰色地带，只记录当时用过的，不保证长期可用。装系统前先备份数据，这条永远排第一。'
      ].join('\n')
    }
  ];

  return { categories: categories, feed: feed, entries: entries, posts: posts };
})();
