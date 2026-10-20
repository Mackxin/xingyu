/* =========================================================
   星屿 XINGYU · 数据层
   所有内容集中在此，方便自行增删。
   link: { n 名称, u 链接, d 描述 }
   feed: { date 日期, icon 图标, title 标题, url 链接, desc 描述, tags 标签[] }
   ========================================================= */
window.SITE_DATA = (function () {

  /* ---------------- 精选导航站点 ---------------- */
  var categories = [
    {
      id: 'ai', name: 'AI 智能', icon: '🤖',
      desc: '对话、生成与创作',
      links: [
        { n: 'ChatGPT',        u: 'https://chat.openai.com',        d: 'OpenAI 对话助手' },
        { n: 'Claude',         u: 'https://claude.ai',              d: '长文理解与写作' },
        { n: 'Gemini',         u: 'https://gemini.google.com',      d: 'Google 多模态模型' },
        { n: 'DeepSeek',       u: 'https://chat.deepseek.com',      d: '国产推理与代码' },
        { n: 'Kimi',           u: 'https://kimi.moonshot.cn',       d: '超长上下文阅读' },
        { n: '通义千问',        u: 'https://tongyi.aliyun.com',      d: '阿里大模型助手' },
        { n: 'Perplexity',     u: 'https://www.perplexity.ai',      d: '带引用的 AI 搜索' },
        { n: 'Midjourney',     u: 'https://www.midjourney.com',     d: '图像生成标杆' },
        { n: '即梦 Dreamina',   u: 'https://jimeng.jianying.com',    d: '字节图像视频生成' },
        { n: 'Suno',           u: 'https://suno.com',               d: '一句话生成歌曲' },
        { n: 'Suno / Udio 试听', u: 'https://udio.com',             d: 'AI 音乐另一选择' },
        { n: 'Hugging Face',   u: 'https://huggingface.co',         d: '模型与数据集社区' }
      ]
    },
    {
      id: 'dev', name: '开发编程', icon: '💻',
      desc: '写码、部署与协作',
      links: [
        { n: 'GitHub',         u: 'https://github.com',             d: '全球最大的代码托管' },
        { n: 'MDN',            u: 'https://developer.mozilla.org',  d: 'Web 开发权威文档' },
        { n: 'Stack Overflow', u: 'https://stackoverflow.com',      d: '开发问答' },
        { n: 'npm',            u: 'https://www.npmjs.com',          d: 'JavaScript 包仓库' },
        { n: 'Vercel',         u: 'https://vercel.com',             d: '前端一键部署' },
        { n: 'Cloudflare',     u: 'https://dash.cloudflare.com',    d: 'CDN · Workers · DNS' },
        { n: 'Docker Hub',     u: 'https://hub.docker.com',         d: '容器镜像仓库' },
        { n: '掘金',           u: 'https://juejin.cn',              d: '中文开发者社区' },
        { n: 'V2EX',           u: 'https://www.v2ex.com',           d: '创意工作者社区' },
        { n: 'Can I use',      u: 'https://caniuse.com',            d: '浏览器兼容性查询' },
        { n: 'Regex101',       u: 'https://regex101.com',           d: '正则在线调试' },
        { n: 'Carbon',         u: 'https://carbon.now.sh',          d: '代码片段美化截图' }
      ]
    },
    {
      id: 'design', name: '设计灵感', icon: '🎨',
      desc: '配色、排版与素材',
      links: [
        { n: 'Figma',          u: 'https://www.figma.com',          d: '协作式界面设计' },
        { n: 'Dribbble',       u: 'https://dribbble.com',           d: '设计作品瀑布流' },
        { n: 'Behance',        u: 'https://www.behance.net',        d: '创意作品集平台' },
        { n: 'Canva',          u: 'https://www.canva.cn',           d: '在线海报与排版' },
        { n: '稿定设计',        u: 'https://www.gaoding.com',        d: '电商与新媒体设计' },
        { n: 'Coolors',        u: 'https://coolors.co',             d: '配色方案生成器' },
        { n: 'Color Hunt',     u: 'https://colorhunt.co',           d: '精选四色配色' },
        { n: 'Iconify',        u: 'https://icon-sets.iconify.design',d: '海量开源图标集' },
        { n: 'Google Fonts',   u: 'https://fonts.google.com',       d: '免费字体库' },
        { n: 'Framer',         u: 'https://www.framer.com',         d: '交互动效与原型' },
        { n: 'MasterGo',       u: 'https://mastergo.com',           d: '国产协设工具' },
        { n: 'Collect UI',     u: 'https://collectui.com',          d: '每日 UI 灵感' }
      ]
    },
    {
      id: 'tool', name: '效率工具', icon: '🧰',
      desc: '随手可用的小工具',
      links: [
        { n: 'TinyPNG',        u: 'https://tinypng.com',            d: '图片无损压缩' },
        { n: 'Squoosh',        u: 'https://squoosh.app',            d: '浏览器内图片压缩' },
        { n: 'Convertio',      u: 'https://convertio.co/zh/',       d: '万能格式转换' },
        { n: '草料二维码',      u: 'https://cli.im',                d: '二维码生成与管理' },
        { n: 'JSON 格式化',     u: 'https://www.json.cn',            d: 'JSON 解析校验' },
        { n: 'Excalidraw',     u: 'https://excalidraw.com',         d: '手绘风白板' },
        { n: 'Notion',         u: 'https://www.notion.so',          d: '一体化笔记与协作' },
        { n: '飞书',           u: 'https://www.feishu.cn',          d: '文档 · 表格 · 会议' },
        { n: 'Obsidian',       u: 'https://obsidian.md',            d: '本地优先知识库' },
        { n: 'ProcessOn',      u: 'https://www.processon.com',      d: '思维导图与流程图' },
        { n: 'IT Tools',       u: 'https://it-tools.tech',          d: '开发者工具合集' },
        { n: 'draw.io',        u: 'https://app.diagrams.net',       d: '免费在线绘图' }
      ]
    },
    {
      id: 'learn', name: '学习成长', icon: '📚',
      desc: '课程、题库与百科',
      links: [
        { n: '哔哩哔哩',        u: 'https://www.bilibili.com',       d: '知识区与公开课' },
        { n: '知乎',           u: 'https://www.zhihu.com',          d: '问答与深度长文' },
        { n: '中国大学MOOC',    u: 'https://www.icourse163.org',     d: '高校在线课程' },
        { n: 'Coursera',       u: 'https://www.coursera.org',       d: '全球名校课程' },
        { n: '可汗学院',        u: 'https://zh.khanacademy.org',     d: '免费系统学习' },
        { n: '菜鸟教程',        u: 'https://www.runoob.com',         d: '入门到进阶教程' },
        { n: 'LeetCode',       u: 'https://leetcode.cn',            d: '算法刷题' },
        { n: '维基百科',        u: 'https://zh.wikipedia.org',       d: '自由的百科全书' },
        { n: 'Wolfram Alpha',  u: 'https://www.wolframalpha.com',   d: '计算知识引擎' },
        { n: '术语在线',        u: 'https://www.termonline.cn',      d: '规范术语查询' },
        { n: 'Anki',           u: 'https://apps.ankiweb.net',       d: '间隔重复记忆' },
        { n: '阮一峰周刊',      u: 'https://www.ruanyifeng.com/blog',d: '科技爱好者周刊' }
      ]
    },
    {
      id: 'media', name: '影音娱乐', icon: '🎬',
      desc: '影视、音乐与综艺',
      links: [
        { n: '哔哩哔哩',        u: 'https://www.bilibili.com',       d: '弹幕视频社区' },
        { n: '网易云音乐',      u: 'https://music.163.com',          d: '歌单与乐评' },
        { n: 'QQ 音乐',        u: 'https://y.qq.com',               d: '正版曲库' },
        { n: 'Spotify',        u: 'https://open.spotify.com',       d: '全球流媒体音乐' },
        { n: 'YouTube',        u: 'https://www.youtube.com',        d: '全球视频平台' },
        { n: '腾讯视频',        u: 'https://v.qq.com',               d: '影视剧集' },
        { n: '豆瓣',           u: 'https://www.douban.com',         d: '评分与影评' },
        { n: 'IMDb',           u: 'https://www.imdb.com',           d: '全球影视数据库' },
        { n: 'Radio Garden',   u: 'https://radio.garden',           d: '全球电台地球' },
        { n: '小宇宙播客',      u: 'https://www.xiaoyuzhoufm.com',   d: '中文播客平台' }
      ]
    },
    {
      id: 'read', name: '阅读书籍', icon: '📖',
      desc: '读书、找书与电子书',
      links: [
        { n: '微信读书',        u: 'https://weread.qq.com',          d: '社交化阅读' },
        { n: '豆瓣读书',        u: 'https://book.douban.com',        d: '图书评价与榜单' },
        { n: '国家数字图书馆',  u: 'http://www.nlc.cn',              d: '海量馆藏资源' },
        { n: '鸠摩搜书',        u: 'https://www.jiumodiary.com',     d: '电子书聚合搜索' },
        { n: 'Z-Library',      u: 'https://z-lib.io',               d: '大型电子书库' },
        { n: 'Project Gutenberg', u: 'https://www.gutenberg.org',   d: '七万本公版书' },
        { n: '书格',           u: 'https://new.shuge.org',          d: '古籍善本数字图书馆' },
        { n: 'Wikipedia Books', u: 'https://zh.wikisource.org',     d: '维基文库' },
        { n: '标准电子书',      u: 'https://standardebooks.org',     d: '精校公版电子书' }
      ]
    },
    {
      id: 'news', name: '资讯前沿', icon: '📡',
      desc: '科技、行业与热榜',
      links: [
        { n: '少数派',          u: 'https://sspai.com',              d: '高效工作与数字生活' },
        { n: '36氪',           u: 'https://36kr.com',               d: '商业科技创投' },
        { n: '虎嗅',           u: 'https://www.huxiu.com',          d: '商业深度分析' },
        { n: '爱范儿',          u: 'https://www.ifanr.com',          d: '科技生活方式' },
        { n: 'IT 之家',        u: 'https://www.ithome.com',         d: '数码快讯' },
        { n: 'Hacker News',    u: 'https://news.ycombinator.com',   d: '极客新闻聚合' },
        { n: 'Solidot 奇客',    u: 'https://www.solidot.org',        d: '科技资讯中文站' },
        { n: '今日热榜',        u: 'https://tophub.today',           d: '全平台热榜聚合' },
        { n: 'V2EX 热门',      u: 'https://www.v2ex.com/?tab=hot',  d: '社区热议' },
        { n: 'The Verge',      u: 'https://www.theverge.com',       d: '国际科技媒体' }
      ]
    },
    {
      id: 'life', name: '生活服务', icon: '🏙️',
      desc: '出行、政务与便民',
      links: [
        { n: '高德地图',        u: 'https://www.amap.com',           d: '导航与路况' },
        { n: '12306',          u: 'https://www.12306.cn',           d: '铁路售票官方' },
        { n: '大众点评',        u: 'https://www.dianping.com',       d: '吃喝玩乐指南' },
        { n: '国家医保服务平台', u: 'https://fuwu.nhsa.gov.cn',      d: '医保查询办理' },
        { n: '中国天气网',      u: 'http://www.weather.com.cn',      d: '权威天气预报' },
        { n: '快递 100',       u: 'https://www.kuaidi100.com',      d: '全网快递查询' },
        { n: '个人所得税',      u: 'https://etax.chinatax.gov.cn',   d: '个税申报' },
        { n: '国家企业信用公示', u: 'http://www.gsxt.gov.cn',        d: '企业信息核验' },
        { n: '中国教育考试网',  u: 'http://www.neea.edu.cn',         d: '考试报名与成绩' },
        { n: '12315 平台',     u: 'https://www.12315.cn',           d: '消费投诉举报' }
      ]
    },
    {
      id: 'shop', name: '购物消费', icon: '🛒',
      desc: '电商、比价与二手',
      links: [
        { n: '京东',           u: 'https://www.jd.com',             d: '自营与物流' },
        { n: '淘宝',           u: 'https://www.taobao.com',         d: '全民电商' },
        { n: '天猫',           u: 'https://www.tmall.com',          d: '品牌旗舰' },
        { n: '拼多多',          u: 'https://www.pinduoduo.com',      d: '拼团低价' },
        { n: '1688',           u: 'https://www.1688.com',           d: '源头批发' },
        { n: 'Apple 官网',     u: 'https://www.apple.com.cn',       d: '官方商城' },
        { n: '什么值得买',      u: 'https://www.smzdm.com',          d: '优惠与种草' },
        { n: '闲鱼',           u: 'https://2.taobao.com',           d: '二手交易' },
        { n: '慢慢买比价',      u: 'https://www.manmanbuy.com',      d: '历史价格查询' },
        { n: '小米有品',        u: 'https://www.xiaomiyoupin.com',   d: '精品生活电商' }
      ]
    },
    {
      id: 'image', name: '图片素材', icon: '🖼️',
      desc: '免费图库与壁纸',
      links: [
        { n: 'Unsplash',       u: 'https://unsplash.com',           d: '免费高质摄影' },
        { n: 'Pexels',         u: 'https://www.pexels.com/zh-cn/',  d: '免费图片视频' },
        { n: 'Pixabay',        u: 'https://pixabay.com',            d: '百万免费素材' },
        { n: 'Wallhaven',      u: 'https://wallhaven.cc',           d: '高质量壁纸' },
        { n: '极简壁纸',        u: 'https://bz.zzzmh.cn',            d: '国产壁纸站' },
        { n: 'unDraw',         u: 'https://undraw.co',              d: '可换色插画' },
        { n: 'Storyset',       u: 'https://storyset.com',           d: '免费故事插画' },
        { n: 'Mixkit',         u: 'https://mixkit.co',              d: '免费视频配乐模板' },
        { n: 'Alphacoders',    u: 'https://wall.alphacoders.com',   d: '超清壁纸库' }
      ]
    },
    {
      id: 'social', name: '社交社区', icon: '💬',
      desc: '圈子、论坛与分享',
      links: [
        { n: '微博',           u: 'https://weibo.com',              d: '实时热点广场' },
        { n: '小红书',          u: 'https://www.xiaohongshu.com',    d: '生活方式社区' },
        { n: 'Reddit',         u: 'https://www.reddit.com',         d: '全球兴趣社区' },
        { n: 'X (Twitter)',    u: 'https://x.com',                  d: '实时信息流' },
        { n: 'Instagram',      u: 'https://www.instagram.com',      d: '视觉社交' },
        { n: 'Telegram',       u: 'https://telegram.org',           d: '加密即时通讯' },
        { n: 'Discord',        u: 'https://discord.com',            d: '语音兴趣社群' },
        { n: '即刻',           u: 'https://web.okjike.com',         d: '年轻人兴趣社区' },
        { n: 'Product Hunt',   u: 'https://www.producthunt.com',    d: '每日新产品' },
        { n: '少数派社区',      u: 'https://sspai.com/community',    d: '效率爱好者' }
      ]
    }
  ];

  /* ---------------- 分享流（时间线） ---------------- */
  var feed = [
    {
      date: '2026-10-17', icon: '🧭',
      title: '星屿导航 · 新版上线',
      url: '#/nav',
      desc: '把散落在浏览器书签栏里的网址重新收拢成 12 个主题岛屿，支持拼音与关键词即时搜索、收藏置顶，以及 ⌘K 一键盘点所有站点。',
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

  /* ---------------- 首页快捷入口 ---------------- */
  var entries = [
    { route: '#/nav',   icon: '🧭', title: '星屿导航',   desc: '十二座主题岛屿，收拢全网精选站点，随时一键盘点。', wide: false, spark: true },
    { route: '#/share', icon: '✨', title: '灵感分享',   desc: '像刷动态一样，回看这一年里遇见的工具、灵感与好内容。', wide: false, spark: false },
    { route: '#/home',  icon: '🌌', title: '关于星屿',   desc: '一座以星为图、以屿为家的个人数字花园，慢慢生长。', wide: false, spark: false }
  ];

  return { categories: categories, feed: feed, entries: entries };
})();
