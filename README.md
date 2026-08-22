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

## 架构

```text
src/data/stories.ts
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
npm run build
npm run dev
```

默认开发地址为 `http://localhost:8080`，构建产物位于 `dist/`。

涉及路由、阅读器 UI、媒体加载、响应式布局或静态部署行为时，再运行产品级浏览器回归：

```bash
npx playwright install chromium
npm run test:e2e
```

E2E 会在桌面与移动 Chromium 上验证真实书架链接、故事深链、封面/旁白资源、浏览器错误以及基础横向溢出。Playwright 只属于开发与 CI，不进入产品运行时。

## 静态部署

可部署到任何能够托管静态文件的服务。因为 `/story/$id` 是客户端路由，生产环境必须把未知页面请求回退到 `index.html`，否则直接打开故事深链会得到 404。

PWA 元数据位于 `public/manifest.webmanifest`，不依赖服务端动态注入。

## 内容结构

故事元数据位于：

```text
src/data/stories.ts
```

每一页由 story id、page id、page kind、正文、图片和旁白音频组成。静态内容位于：

```text
public/stories/<story-id>/...
public/audio/<story-id>/...
```

CI 使用 TypeScript AST 读取真实 `page()` 调用，并检查每页图片/音频存在且非空，同时检查 story/page ID 与 cover/moral 结构，避免出现“代码能构建，但线上缺页/缺音频”的假通过。

## 工程边界

- 不让 Better Auth / PostgreSQL / PGlite / TanStack Start / Nitro 等未使用基础设施进入默认主链；
- 不提交 Vercel 构建输出、临时 artifacts、截图目录或本地 Builder 状态；
- 保留真正服务于绘本体验的图片、音频和字体；
- import inventory、typecheck、tests、build、dependency audit 都属于交付 gate；
- 路由/阅读器/媒体/响应式/部署改动还必须通过产品级浏览器 E2E；
- 大体积历史生成物若要清理，单独做经过审计的 Git history rewrite，不和产品开发混在一起。

## 内容与资产来源

项目中的故事文本、图片、音频和字体在正式扩大公开发布前，应逐项补齐来源、授权或生成 provenance。仓库不会把“文件存在”当成“版权状态已确认”。
