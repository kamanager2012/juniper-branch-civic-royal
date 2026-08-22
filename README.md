# 成语故事 · Chinese Idiom Storybook

面向儿童的中文成语有声绘本。打开即可阅读和收听，不要求账号。

仓库最初来自 App Builder 导出，现在已经收敛为一个 **local-first、静态部署的 Web/PWA 绘本**。绘本阅读、旁白、翻页和进度都在浏览器侧完成，不需要应用服务器。

## 当前能力

- 成语故事书架
- 每本故事的封面、分页面插图、旁白音频
- 播放中的文字跟读高亮
- 自动翻页与手势翻页
- 背景音乐开关
- 本机阅读进度、完成状态与星级
- 成语释义与儿童友好的“小道理”总结
- 移动端安全区和触控体验
- 标准静态 Web App Manifest
- 产品自有离线 app shell；已访问故事图片可在断网后继续显示
- canonical 内容模型、资产完整性报告和旁白 provenance 状态

## 架构

```text
src/data/stories.ts
        ↓
scripts/story-model.mjs
   ↙         ↓          ↘
content gate  report   narration plan/generator
        ↓
public/stories + public/audio
        ↓
Vite + React + TanStack Router
        ↓
Story reader
        ↓
Local progress/settings
```

默认主链不包含登录、数据库、SSR、API server 或第三方 Builder runtime。只有未来出现明确的跨设备账号/同步需求时，才重新评估服务端能力。

## 开发

要求 Node.js 20.19+。

```bash
npm ci
npm run deps:inventory
npm run typecheck
npm test
npm run content:check
npm run build
npm run dev
```

默认开发地址为 `http://localhost:8080`，构建产物位于 `dist/`。

涉及路由、阅读器 UI、媒体加载、响应式布局、PWA/offline 或静态部署行为时，再运行产品级浏览器回归：

```bash
npx playwright install chromium
npm run test:e2e
```

E2E 会在桌面与移动 Chromium 上验证真实书架链接、故事深链、封面/旁白资源、阅读状态持久化、离线 shell、浏览器错误以及基础横向溢出。Playwright 只属于开发与 CI，不进入产品运行时。

## 静态部署

可部署到任何能够托管静态文件的服务。因为 `/story/$id` 是客户端路由，生产环境必须把未知页面请求回退到 `index.html`，否则直接打开故事深链会得到 404。

PWA 元数据位于 `public/manifest.webmanifest`，离线 shell 位于 `public/sw.js`，都不依赖服务端动态注入。

### 离线边界

当前离线能力刻意保持克制：

- 安装后的 app shell 与构建静态资源会缓存；
- 在线访问过的故事图片会按需进入运行时缓存；
- 断网后仍可打开首页和已经访问过、图片已缓存的故事页面；
- `/audio/*` 与 HTTP Range 请求不会自动缓存，因此当前不承诺断网旁白播放。

音频体积较大，而且浏览器可能使用分段 Range 请求。未来如果要提供“整本下载后离线听”，应单独设计下载、容量、更新和清理机制，而不是偷偷把所有 MP3 塞进 service-worker cache。

## 内容模型与生产链

唯一 canonical 内容源是：

```text
src/data/stories.ts
```

所有内容工具统一通过：

```text
scripts/story-model.mjs
```

解析同一份 story/page/text 事实，不再允许生成器、迁移脚本或测试自己复制故事正文。

静态内容位于：

```text
public/stories/<story-id>/...
public/audio/<story-id>/...
```

常用内容命令：

```bash
# 严格检查 manifest、图片/MP3 签名、缺失资产和 orphan 资产
npm run content:check

# 输出确定性的机器可读报告：故事/页数、字节数、SHA-256、问题与警告
npm run content:report

# 查看每个旁白相对当前正文的 current/stale/unverified/missing 状态
npm run narration:plan
```

`content/narration-state.json` 只记录通过当前 pipeline 生成或验证过的旁白。历史 MP3 如果没有匹配的 text/audio SHA-256 记录，只能标记为 `unverified`，不能因为文件存在就宣称“与当前正文一致”。

### 旁白生成

旁白生成器不会内置另一份故事正文，也不会默认批量调用付费接口：

```bash
# 只看计划，不产生请求
npm run narration:generate -- --story shou-zhu --voice <VOICE_ID> --dry-run

# 明确指定单个故事与 voice 后生成
XAI_API_KEY=... npm run narration:generate -- --story shou-zhu --voice <VOICE_ID>
```

批量全量生成必须显式使用 `--all`。Voice 必须通过 `--voice` 或 `XAI_TTS_VOICE_ID` 指定，生成器会先从 xAI voice API 校验该 voice 是否当前可用。API key 只从环境变量读取。

旧的 `expand-stories.py`、`generate-narration.py`、`generate-narration-2.py` 已退出 active tree；它们的历史仍保存在 Git 中，但不再构成内容真源。

## 工程边界

- 不让 Better Auth / PostgreSQL / PGlite / TanStack Start / Nitro 等未使用基础设施进入默认主链；
- 不提交 Vercel 构建输出、临时 artifacts、截图目录或本地 Builder 状态；
- 保留真正服务于绘本体验的图片、音频和字体；
- import inventory、typecheck、tests、content gate、build、dependency audit 都属于交付 gate；
- 路由/阅读器/媒体/响应式/PWA/部署改动还必须通过产品级浏览器 E2E；
- service-worker cache 只能清理本项目自己的 `chengyu-storybook-*` key；
- 大体积历史生成物若要清理，单独做经过审计的 Git history rewrite，不和产品开发混在一起。

## 内容与资产来源

项目中的故事文本、图片、音频和字体在正式扩大公开发布前，应逐项补齐来源、授权或生成 provenance。仓库不会把“文件存在”当成“版权状态已确认”。
