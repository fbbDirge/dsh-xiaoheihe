# 发帖、定时发布与搜图调研

核对日期：2026-10-29。只检查代码，没有上传图片或发布真实帖子。新增核对了两个 MCP 项目的图文 / 文章发布实现及其调度能力。

## 已有能力

| 项目 | 发布新帖 | 图片上传 | 定时发布新帖 | 关键词搜图 |
| --- | --- | --- | --- | --- |
| 当前 dsh-xhh（0.11.0） | 已实现文字帖生成和发布，待真实账号验收 | 未实现，只有平台图片读取代理 | 已实现独立人格及单次 / 每天 / 每周持久化调度 | 未实现 |
| dsh-bili-scroll | 当前移除了上传视频、发动态和专栏工具 | 没有可复用的小黑盒上传实现 | 有浏览任务调度，没有新帖发布调度 | 搜视频和读取视频画面，不是图片搜索 |
| dsh-xiaoheihe / WenfuRainbow/heybox | 未发现新帖发布入口 | 读取帖子图片，不是上传 | 未发现 | 未发现 |
| heibox-comment-bot / xhhRobot | 评论或回复，不是新帖 | 未发现所需的新帖图片上传流程 | 自动评论或回复，不是定时发帖 | 未发现 |
| xiaoheihe-cli | 有文章、图文、视频发布代码及草稿模式 | 有本地图片检查和 COS 上传流程 | 未发现发布时刻配置或持久化发帖队列 | 搜索类型为帖子、用户、游戏、社区，没有图片搜索 |
| insect-rippler/xiaoheihe_mcp | 有纯 HTTP 图文和文章发布 | 有本地图片 COS 上传 | 发布字段 schedule_ts 固定为 0，未发现调度队列 | 未发现 |
| wsmxd/XiaoheiheMcpServer | 有浏览器操作创作中心的图文、文章和视频发布 | 通过网页文件选择器上传 | 未发现发帖调度器 | 未发现 |

这里的“有”指存在源码实现，不代表本插件已接入，也不代表此次使用真实账号验收通过。

## 可参考的发布协议

[xiaoheihe-cli service.py](https://github.com/AaronZ345/xiaoheihe-cli/blob/954fb4753fb1a879572239f2a54b520a91dc814d/xhh_operator/service.py) 的 write_post / _submit_post：

- 提交到 `/bbs/app/api/link/post`，携带 title、text、post_type、link_tag、draft、view_limit、original、words_count 等字段。
- text 为内容块 JSON，图片块包含 type=img、url、width、height；还支持社区和话题选择。
- draft=1 保存草稿，draft=0 发布；该参考还使用 workshop_params，需要核对签名参数，不能只复制字段到现有评论接口。
- 发布后读取返回帖子核对标题、正文和图片；接受请求不等于公开可见。

[media.py](https://github.com/AaronZ345/xiaoheihe-cli/blob/954fb4753fb1a879572239f2a54b520a91dc814d/xhh_operator/media.py) 的上传流程：

1. 验证本地图片格式、大小及宽高。
2. `/bbs/app/api/qcloud/cos/upload/info/v2` 获取对象 key、bucket 和 region。
3. `/bbs/app/api/qcloud/cos/upload/token/v2` 获取临时上传凭据。
4. 使用 COS 签名 PUT 上传文件；不向存储服务发送小黑盒登录 Cookie。
5. `/bbs/app/api/qcloud/cos/upload/callback/v2` 确认上传并取得 preview_urls。
6. 把图片 URL 和宽高加入帖子内容块再提交。

参考的上传结果不明时停止而不重传，适合沿用现有插件的持久化发送意图与去重策略。

## 新增参考与复用建议

### 纯 HTTP：insect-rippler/xiaoheihe_mcp

核对版本：`d8935f9e8640c78bc3154fa9d6f277cb245a06c1`，MIT 许可证。

- [publish.ts](https://github.com/insect-rippler/xiaoheihe_mcp/blob/d8935f9e8640c78bc3154fa9d6f277cb245a06c1/src/services/publish.ts)：`publishImageText` 发布图文，`link_tag=27`；`publishArticle` 发布文章，`link_tag=11`。图文正文使用 text / img 内容块，文章使用 HTML 内容块。
- 社区可直接传 topic ID，也可通过编辑器社区搜索接口按名称精确匹配；无匹配时返回错误，避免发布到名称相近的其他社区。
- [upload.ts](https://github.com/insect-rippler/xiaoheihe_mcp/blob/d8935f9e8640c78bc3154fa9d6f277cb245a06c1/src/services/upload.ts)：实现上传信息、临时凭据、COS PUT、回调四个步骤；适合参考其 Node 实现。
- [xhh.ts](https://github.com/insect-rippler/xiaoheihe_mcp/blob/d8935f9e8640c78bc3154fa9d6f277cb245a06c1/src/client/xhh.ts)：发帖调用 `/bbs/app/api/link/post`，使用 webVersion=3.0；评论另行启用 Workshop。这与 xiaoheihe-cli 对发帖额外使用 workshop_params 的做法存在差异，需要联调确认当前有效的域名和签名组合。
- 两种发布表单的 `schedule_ts` 都写为 `0`，没有提供发布时间参数或持久化任务。仅凭此字段不能确认服务端支持预约发布，插件仍应自行实现定时队列。

不能直接照搬的细节：图片尺寸函数只读取 PNG 宽高，其他格式固定回退为 600×400；应改成实际解码并验证格式和大小。发布函数在传输层接受 status=ok 后直接返回 ok=true，帖子 ID 可以为空，也没有读取核验；应区分“请求被接受”“取得帖子 ID”“读取核验通过”。dryRun 会跳过上传，但会查询社区，不是完全离线的图片 / 发布验收。

该项目明确不带人格或 Agent 循环，不能承担本插件的内容生成和调度。自动生成帖子时，应复用本插件已有的人格配置和模型提供方，再把生成结果保存成内容快照交给发帖队列。

### 浏览器方式：wsmxd/XiaoheiheMcpServer

核对版本：`bba82d06c0cab704cd1ecf82503b32b95ea1e0ab`，MIT 许可证。

- [PublishService.cs](https://github.com/wsmxd/XiaoheiheMcpServer/blob/bba82d06c0cab704cd1ecf82503b32b95ea1e0ab/src/XiaoheiheMcpServer.Shared/Services/PublishService.cs)：通过浏览器进入 `/creator/editor/draft/image_text` 或视频编辑页，填写内容并选择本地文件上传。
- [ArticlePublishService.cs](https://github.com/wsmxd/XiaoheiheMcpServer/blob/bba82d06c0cab704cd1ecf82503b32b95ea1e0ab/src/XiaoheiheMcpServer.Shared/Services/ArticlePublishService.cs)：操作文章编辑器、插入图片、选择社区和话题，再尝试点击发布；未点击成功时会提示手动检查。其成功提示不足以代替帖子 ID 和发布后读取核验。
- 核对源码未发现发帖调度器；需要浏览器运行环境，网页选择器变化也会影响发布流程。

建议优先采用纯 HTTP 方式，参考 xiaoheihe_mcp 的 Node 上传实现和 xiaoheihe-cli 的草稿 / 读取核验流程。浏览器方式可用于协议不可用时的备选方案。实际复用 MIT 源码时应保留对应版权及许可证声明；不需要整套引入 MCP 或 C# 服务。

## 建议的插件入口

新增顶部「发帖」菜单，保留现有设置页入口，不使用侧栏。

- 编辑：标题、正文、社区、话题、本地图片与图片顺序；可保存本地草稿、预览和明确发布。
- 配图：默认关键词可填写“大肥鱼”，关键词可改；搜索后展示缩略图及来源，选择图片加入草稿。本地图片上传作为独立入口。
- 搜图来源：需要新增图片搜索提供方，不能把现有平台图片代理当成搜索接口。可配置提供方端点和密钥；尚未配置时提示配置或使用本地图片，不伪造搜索结果。
- 自动配图：作为独立开关，允许指定关键词、图片数量及已选择的来源；定时前准备并缓存图片，避免发布时临时搜不到或换成另一张图片。
- 图片上传：由宿主读取选中的图片并上传到小黑盒存储，不直接把第三方原图链接当作上传完成。限制格式、实际解码尺寸、大小及下载地址；第三方搜图及下载请求不携带小黑盒 Cookie。

“大肥鱼”暂作为用户可修改的关键词，不假定它指真实鱼、表情包或某个角色。搜索结果是否符合需求需要在图片预览中判断。

## 发帖时间与浏览时间分开

- 「浏览」继续配置浏览检查间隔，「运行时段」继续限制浏览及评论互动。
- 「发帖」单独设置立即发布、指定日期时间、每天或每周的时间点，以及发布时区；使用持久化任务，不随网页关闭丢失。
- 默认按指定发布时刻处理，不隐式继承浏览的峰谷设置。若需要时段限制，显式提供「发帖也受运行时段限制」开关，并展示具体延后规则。
- 显示下一次计划发布时间；若禁止当前时段，计算并展示调整后的时间，不把“检查时间”当作“发布时间”。
- 每个任务记录 job ID、绑定账号、计划时间、内容快照、图片、状态和帖子 ID；到期前保存发送意图。结果不明时停止，不自动重复发布。
- 重启后过期任务默认标记为错过，避免集中补发；界面允许用户重新安排。周期任务按日期和时间槽去重。
- 发帖记录独立于浏览档案；不修改旧评论和帖子，不读写 B 站插件目录。

## 开发顺序与验收

1. 本地草稿、图片选择和预览。
2. 图片上传、平台草稿保存及读取核对。
3. 发布新帖、帖子 ID 回执和读取核对。
4. 持久化单次 / 周期发布计划，验证时区、重启、过期与结果不明不重发。
5. 图片搜索提供方、候选图片选择与可选自动配图。

模拟测试必须覆盖上传中断、发布超时、停止任务、切换账号和进程重启，真实上传和公开发布另行联调。不能用已有评论测试宣称发帖链路已通过。

## 其他参考版本

- [dsh-bili-scroll README](https://github.com/c1overzz/dsh-bili-scroll/blob/5be5f6d57c47c7e79ad9bc4ce39457b68a160dfa/README.md)：当前任务工具范围明确排除上传视频和发动态。
- [dsh-xiaoheihe](https://github.com/plasta2steel/dsh-xiaoheihe/tree/32bc17d707397af48368db759548806763bca6aa)。
- [WenfuRainbow/heybox](https://github.com/WenfuRainbow/heybox/tree/afbe8a5f0629aafcd7e17d1c56eeec84ff4dd1bf)。
- [heibox-comment-bot](https://github.com/2646617098/heibox-comment-bot)、[xhhRobot](https://github.com/SomeOvO/xhhRobot)：交叉检查其评论 / 回复定位。


## 2026-11-04 自动排版核对

直接查看[官方文章编辑器](https://www.xiaoheihe.cn/creator/editor/draft/article)的操作提示和 Markdown 帮助，确认粗体、一二级标题、引用、有序 / 无序列表。未点击发布。文章 HTML 内容块及 `link_tag=11` 对照上面的 publish.ts 实现；本插件 0.13.13 接入其格式，未复制外部实现。平台实际渲染仍需实际帖子验收，不把本地预览或模拟响应视为公开可见证明。


## 2026-11-04 梗鲸自动配图

[档案馆](https://aigengtu.com/archive)提供台词检索和使用场景；[站点镜像仓库](https://github.com/the-beating-light-of-the-nail/deepseek-chan-meme-pack)公开说明 `gallery-index.json` 及 `img.aigengtu.com` 原图来源。实读目录为 `gallery → 分类 → images`，以 `alt`、`story.zh`、`original` 为主要字段；标题与描述可能存在误差，因此选图可跳过，不将目录描述视为视觉核验。

上传流程按小黑盒接口获取对象信息及临时凭据，参照[腾讯 COS 签名协议](https://cloud.tencent.com/document/product/436/7778)进行 PUT，调用回调后生成文章 img 或图文 img 内容块。服务器真实上传 #060 成功，未调用公开发帖接口；没有下载全站图片。此图库适合玩梗和情绪表达，不应替代游戏实拍、新闻证据或攻略截图。

### 0.13.15 文章图片标记修正

用户提供「列表有图、手机正文无图」截图；只读帖子接口返回的 HTML 中仅有普通 `img src/width/height`，另有平台追加的 img 缩略图块。不能把追加的缩略图作为正文图片可见的证据。

核对[官方编辑器发布模块](https://static.max-c.com/static/heybox/webapp/@heybox-spa/website/app/cpt-editor-publish.vue_vue_type_style_index_0_lang-Di5nH1Gi.js)：图片节点 toDOM 输出 p 内的 img，使用 `data-type="image"`、`data-original`、`data-width`、`data-height` 和 `data-description`。核对[官方阅读器模块](https://static.max-c.com/static/heybox/webapp/@heybox-spa/website/app/index-DndGLVEK.js)：图片解析规则选择 `img[data-original]`，普通 src 不满足选择器。新版独立实现相同标记，无需复制官方代码。

REA 静态分析 Evidence：`ev_5c7a8f32775c068ce552f36098466fcb0b5461130dc780c7f01d5a466da3c861`；仅覆盖当前阅读器 bundle，动态依赖图不完整，不代表手机 App 运行轨迹。另在隔离 DOM 中运行该 bundle 的图片节点解析器（字符范围 903835–904907），旧帖 HTML 识别 0 张，新提交 HTML 识别 1 张，地址与 1184×880 尺寸一致。没有执行整个网站 bundle，没有发布或编辑公开帖子。此验证支持格式修复，不能代替手机端实际发布后的显示验收。

### 2026-11-05 避免标题卡片

核对[官方编辑器状态与发布模块](https://static.max-c.com/static/heybox/webapp/@heybox-spa/website/app/index-C9YqRDOT.js)：图文为 `link_tag=27`，文章为 `11`，预览将 `use_concept_type` 仅用于 image_text。所检查的发布字段未发现独立禁止标题图片的参数，不据此声称平台没有其他接口。REA 静态 Evidence：`ev_8cf12d0a3204fd5567e0f16ec26d24abe044ae324934f35d9cf892df5203b0bf`，仅此 bundle，依赖覆盖不完整，未执行网站代码。

0.13.16 的开关通过已支持的文章模式避开图文卡片展示；纯文本安全转义后包装为 HTML，不启动额外模型或生成图片。保留真实配图；关闭则遵循原排版方式，不强制生成卡片。用户截图没有帖子 ID，无法确认截图的生成路径；没有做公开发布试验，也不声称控制平台全部列表、分享页缩略图。
