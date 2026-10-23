/* =========================================================
   星屿 XINGYU · 数据层
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
      title: '星屿导航 · 新版上线',
      url: '#/nav',
      desc: '把散落在浏览器书签栏里的网址重新收拢成 50 个主题岛屿，支持拼音与关键词即时搜索、收藏置顶，以及 ⌘K 一键盘点所有站点。',
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
    { route: '#/nav',   icon: '🧭', title: '星屿导航',   desc: '攒了多年的书签全收在这一页，随时一键盘点。', wide: false, spark: true },
    { route: '#/share', icon: '✨', title: '灵感分享',   desc: '像刷动态一样，回看这一年里遇见的工具、灵感与好内容。', wide: false, spark: false },
    { route: '#/post',  icon: '✍️', title: '手记文章',   desc: '写得长一点的东西都在这里：随笔、折腾记录与一点思考。', wide: false, spark: false },
    { route: '#/home',  icon: '🌌', title: '关于星屿',   desc: '一座以星为图、以屿为家的个人数字花园，慢慢生长。', wide: false, spark: false }
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
      title: '星屿是怎么搭起来的',
      date: '2026-10-12',
      tags: ['建站', '技术'],
      excerpt: '一个不打包、不依赖、不联网也能打开的静态站点，是怎么组织的。',
      body: [
        '星屿是一块**纯静态**的地方：没有构建步骤、没有依赖包、没有后端。双击 `index.html` 就能跑，' +
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
    }
  ];

  return { categories: categories, feed: feed, entries: entries, posts: posts };
})();
