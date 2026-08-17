fusion-yun.github.io
====================

<p align="center"><img src="figures/fuyun_logo.svg" alt="FuYun" width="440"></p>

**FuYun 的发布站点** —— <https://fusion-yun.github.io/>

> 「"神马"都是"浮云"」

本仓即站点本身：GitHub Pages 组织站点，Jekyll 构建，推送 `main` 由
[`.github/workflows/jekyll-gh-pages.yml`](.github/workflows/jekyll-gh-pages.yml) 部署。
站点承担三件事：

1. **FuYun 的入口与导览** —— 首页 [`index.md`](index.md)：构成、状态与对外公开面。
2. **本体命名空间的权威主机** —— `/spo/` 与 `/fyo/` 是 SpO / FyO 声明的前缀 IRI 的真解析位置
   （平台裁决 `SP-ADR-103` D-1 / D-2）。
3. **fylite 在线演示的托管** —— `/fylite/`，WebAssembly 内核在浏览器内计算。

## 目录

| 路径 | 内容 | 真源 |
| :--- | :--- | :--- |
| `index.md` | 首页（Jekyll 渲染）| 本仓 |
| `_config.yml` | 站点标识：标题、描述、语言、主题（`jekyll-theme-primer`）| 本仓 |
| `_includes/head-custom.html` | 主题头部注入：favicon 指向 `figures/fuyun_mark.svg` | 本仓 |
| `figures/` | 站点图形：`fuyun_logo.svg` 横幅标识、`fuyun_mark.svg` 方形标记（favicon / 头像）、`fuyun_architecture_legacy.png` 早期架构图（存档，页面已不再引用）| 本仓 |
| `LICENSE` | 站点分路径许可通告（Part A/B/C）| 本仓 |
| `fylite/` | fylite 在线演示（`index.html` 说明与出处、`discharge.html` 放电设计、`reconstruction.html` 动理学平衡重构、`assets/`）| 私有仓 `fusion-yun/fylite` 的 `app/` |
| `spo/v0.draft/` | SpO 命名空间：`context.jsonld` · `spo.owl.ttl` · `spo.shacl.ttl` · `index.html` · `schema/` LinkML 源镜像 | SpModel 仓（SpO 语义属主）|
| `fyo/v0.draft/` | FyO 命名空间：`context.jsonld` · `fyo.owl.ttl` · `fyo.shacl.ttl` · `index.html` · `schema/` + `imas/v4/` 提升层 | FyTok 仓（FyO 属主）|

## 同步来的目录不要手工编辑

`fylite/`、`spo/`、`fyo/` 三棵树都是**发布产物**，在本仓的修改会在下次发布时被覆盖。
改内容请改各自真源仓，再重新发布：

- **`fylite/`** —— 由私有仓 `fusion-yun/fylite` 的 `.github/workflows/publish-app.yml`
  同步（手动触发，写权限 deploy key）。演示页只分发**二进制**：
  `assets/fylite_rs.wasm` 是 Rust 内核的 WebAssembly 构建，**不含源码**；
  `assets/*.js` 只做数据编排、绘图与 ABI 调用，求解全部在二进制内。
- **`spo/` `fyo/`** —— 源码分别居 SpModel 与 FyTok（`SP-ADR-103` D-3：发布不构成再归属），
  当前以手工发布运行。

### 发布这两棵本体树时的硬约束

- **文件禁止以 `---` 起始.** 站点以 Jekyll 构建（首页需要渲染，不能用全局 `.nojekyll` 关闭），
  `---` 开头会被当作 front matter 解析并使制品内容失真。LinkML / Turtle / JSON-LD 制品发布前
  **必须**断言此条（`SP-ADR-103` D-2）。
- **URL 逐字节稳定.** `/spo/v0.draft/` 与 `/fyo/v0.draft/` 已是对外铸造的命名空间；
  路径改名等同于作废外部引用。若将来把某个本体拆为独立仓（`fusion-yun/spo` / `fusion-yun/fyo`
  的项目站点服务同一 URL），**必须**在同一批次内删除本仓同名目录，使同一时刻只有一个来源
  服务该路径（`SP-ADR-103` D-4）。
- **发布面边界.** IMAS DD 的机械镜像层不进入 FyO 命名空间；`/fyo/v0.draft/imas/v4/` 下发布的
  是接地于 SpO/BFO 的**语义提升层**（`SP-ADR-103` D-6）。
- **静态托管行为**（GitHub Pages 实测）：`.ttl` → `text/turtle; charset=utf-8`，
  `.jsonld` → `application/ld+json`，无尾斜杠的目录请求 301 至带尾斜杠形式，
  响应带 `access-control-allow-origin: *` —— 满足 JSON-LD 远程 `@context` 的媒体类型要求。

## 本地预览

```bash
gem install bundler jekyll     # 或使用 github-pages gem 以对齐线上版本
jekyll serve                   # http://127.0.0.1:4000/
```

`fylite/`、`spo/`、`fyo/` 无 front matter，Jekyll 原样拷贝，不经 Liquid 处理。

## 标识

`figures/fuyun_logo.svg` 与 `figures/fuyun_mark.svg` 只用矢量图元与系统字体，**不依赖外部资源**，
可任意缩放；页面引用保持 SVG 形态，不转位图。构成与 FyTok 仓的 `docs/figures/fytok_logo.svg`
同族，便于并置：

- **配色**：`#FF8C00` 等离子体橙 + `#003366` 深蓝；副题 `#42526E`，卡片描边 `#e1e4e8`。
- **词标**：`Fuyun` —— 橙色斜体落在 `F` 与 `y` 两个字符上，二者连读即 `Fy`；其余字符深蓝正体。
- **标记**：即词标中被高亮的两个字符 `Fy`，同一张卡片、同一套配色，用作 favicon 与头像。
- **底色**：两份**全透明**，只画圆角描边的卡片轮廓与文字，可直接压在任意底色上；
  因此**禁止**再给卡片 `rect` 加 `fill`（深色底下另配浅色变体，不要往这两份里塞底色）。
- **横幅**：1280×640（2:1）透明画布，内嵌 240×100 卡片（圆角、描边），词标居上、
  分隔线下为字距展开的英文副题；副题以 `textLength` 钉定宽度，使不同字体环境下的
  溢出行为一致。

改动标识时两个文件一起改。另注：FyTok 仓那份 `fytok_logo.svg` 里 `fill="url(#bg)"` 引用了
文件中并不存在的渐变，渲染器按"无填充"处理——那份的底色实际上也从未画出来过。

## 许可

站点材料分三部分，按服务路径判定，完整文本见 [`LICENSE`](LICENSE)（各树内另有一份随制品
携带的同款通告）：站点自身与本体制品为 **CC BY-ND 4.0**；`/fylite/` 下的二进制制品适用
**二进制再分发许可**（可免费逐字节再分发，源码不公开）。

Copyright © 2024–2026 YU Zhi（于治），ASIPP。
