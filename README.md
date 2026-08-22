# 成语故事 · Chinese Idiom Storybook

面向儿童的中文成语有声绘本。打开即可阅读和收听，不要求账号。

这个仓库最初来自一次 App Builder 导出，但产品本身已经具备完整的绘本阅读闭环。当前工作方向是逐步移除 Builder 模板遗留，把它收敛成一个可持续维护的轻量 Web/PWA 项目。

## 当前能力

- 成语故事书架
- 每本故事的封面、分页面插图、旁白音频
- 播放中的文字跟读高亮
- 自动翻页与手势翻页
- 背景音乐开关
- 本机阅读进度、完成状态与星级
- 成语释义与儿童友好的“小道理”总结
- 移动端安全区和触控体验

## 产品边界

当前产品默认是 **local-first**：

```text
Story manifest
    ↓
Image + narration audio
    ↓
Story reader
    ↓
Local progress/settings
```

儿童阅读故事不依赖登录、云数据库或服务端账号体系。账号/同步能力只有在未来出现明确的家长跨设备需求时才考虑重新引入。

## 开发

要求 Node.js 20+。

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

默认开发地址为 `http://localhost:8080`。

## 内容结构

故事元数据位于：

```text
src/data/stories.ts
```

每一页由以下内容组成：

```text
story id
page id
page kind: cover | story | moral
text
image
narration audio
```

静态内容位于：

```text
public/stories/<story-id>/...
public/audio/<story-id>/...
```

CI 会检查故事清单引用的图片和音频是否真实存在，避免出现“代码能构建，但线上缺页/缺音频”的假通过。

## Repository normalization

仓库正在从原始 Builder workspace 收敛为正常产品仓库。原则是：

- 不让 Better Auth / PostgreSQL / PGlite 等未使用基础设施进入默认产品主链；
- 不提交 Vercel 构建输出、临时 artifacts、截图目录或本地 Builder 状态；
- 保留真正服务于绘本体验的图片、音频、字体和 PWA 资产；
- 每次改动必须通过 typecheck、tests、build 和内容资产完整性检查。

历史提交中的大体积生成物不会因为从当前分支删除就自动缩小 Git 历史；如未来需要显著降低 clone 体积，应单独执行经过审计的历史重写，而不是把历史清理和产品开发混在一起。

## 内容与资产来源

项目中的故事文本、图片、音频和字体在正式对外扩大发布前，应逐项补齐来源、授权或生成 provenance。仓库不会把“文件存在”当成“版权状态已确认”。
