# fusion-yun.github.io

![FuYun](docs/assets/brand/banner.svg)

**FuYun 的发布站点** —— <https://fusion-yun.github.io/>

> 「"神马"都是"浮云"」

本仓即站点本身：GitHub Pages 组织站点，Jekyll 构建，推送 `main` 由
[`.github/workflows/jekyll-gh-pages.yml`](.github/workflows/jekyll-gh-pages.yml) 部署。
站点承担两件事：

1. **FuYun 的入口与导览** —— 首页 [`index.md`](index.md)：构成、状态与对外公开面。
2. **fylite 在线演示的托管** —— `/fylite/`，WebAssembly 内核在浏览器内计算。

> **`/spo/` 与 `/fyo/` 已于 2026-08-23 撤下**（上游材料权利未清，待复核）。两棵树连同
> 站点许可通告的 Part B 一并移除；前缀 IRI `https://fusion-yun.github.io/spo/…` 与
> `…/fyo/…` 目前不解析。`SP-ADR-103` D-1 / D-2（本站为本体命名空间权威主机）因此暂时
> 失效，复核结论出来前不要恢复发布。spo / fyo 仓的 `core.hooksPath` 自动发布钩子已停用。

## 目录

| 路径 | 内容 | 真源 |
| :--- | :--- | :--- |
| `index.md` | 首页（Jekyll 渲染）| 本仓 |
| `_config.yml` | 站点标识：标题、描述、语言、主题（`jekyll-theme-primer`）| 本仓 |
| `_includes/head-custom.html` | 主题头部注入：favicon 指向 `docs/assets/brand/icon.svg` 与 `favicon.png`；首页插图（`figure` / `figcaption`）的图框与图注体例 | 本仓 |
| `figures/` | 站点图形与首页插图，见下表 | 本仓 + fydoc |
| `LICENSE` | 站点分路径许可通告（Part A/C；Part B 已撤）| 本仓 |
| `fylite/` | fylite 在线演示：首页 / 功能 / 版权各中英两份 + `pages/` 下五条场景页（放电设计 · 物理建模 · 实验分析 · 装置数据 · 算例报告，各另有一份 `page_*` 外壳）+ `guide/` 用户指南；另有 `assets/`、`cases/`（可导入的实例会话）、`LICENSE`、`NOTICE` | 公开仓 [`fusion-yun/fylite`](https://github.com/fusion-yun/fylite) 的 `app/` |

## 首页插图

首页六张插图**照搬 NFEC2026 张贴报告**（fydoc `publication/03-nfec2026-poster-fytok/`，
文档号 FYD-PAPER-03），本仓存的是发布副本，**真源在 fydoc**；改图去改那边，再重新拷过来。

| 文件 | 内容 | 真源 |
| :--- | :--- | :--- |
| `fig_fyo_dd.svg` | 图 1　IMAS DD v4 ↔ fyo 对照 | 海报 `make_figs.py ddfyo` |
| `fig_architecture.svg` | 图 2　fyo 语义契约与两级实现 | 海报 `make_figs.py fig1` |
| `fig_east_recon.png` | 图 3　EAST #137985 动理学平衡重构（实算）| 海报 `figures/g137985_recon.png` |
| `fig_iter_time_dep.png` | 图 4　ITER 15 MA 时序演化 t = 205 s（实算）| 海报 `figures/iter_time_dep_t205.png` |
| `fig_roadmap.svg` | 图 5　能力演进闭环 | 海报 `make_figs.py roadmap` |
| `fig_fylite_modeling.png` | 图 6　fylite 建模页「含时演化」栏实截 | 海报 `figures/fig_app_15d.png`（整页实截裁切）|

- **SVG 三张原样拷贝**：matplotlib 缺省 `svg.fonttype='path'`，文字已转轮廓，浏览器端不依赖
  字体是否安装，缩放不失真。
- **PNG 三张为网页派生件**：按页面宽度缩放（1500–1800 px 宽）后 `-dither None -colors 200`
  转调色板 PNG，三张合计 3.0 MB → 0.73 MB；正文里都套 `<a>` 指向同一文件，点击看原图。
  重做时别改文件名，`index.md` 按名引用。
- **口径**：图 3 出自 Fortran 移植验证线，**该线代码不对外分发、对外的是结果与记录答案**，
  首页照此措辞，不写产出方仓名、不列它调用了哪些库；图 3 的数字是给定约束集下的后验、
  非装置真值，图 4 是代码间一致性检验、非实验验证——这几句删不得。
- **`fuyun_architecture_legacy.png`** 是早期架构图，页面已不再引用（图 2 取代之），留作存档。

## 同步来的目录不要手工编辑

`fylite/` 是**发布产物**，在本仓的修改会在下次发布时被覆盖。改内容请改真源仓，再重新发布：

- **`fylite/`** —— 由公开仓 [`fusion-yun/fylite`](https://github.com/fusion-yun/fylite)
  的 `tools/publish-site.sh` 同步：它在本机构建**公开版**站点、跑闸子、把这个目录整个
  换掉，然后**停下**——add / commit / push 由人来按。演示页分发的求解器是
  `assets/fylite_rs.wasm` 等 WebAssembly 制品（Rust 内核的编译产物，内核源码在私有仓
  `fusion-yun/fylite_kernel`）；`assets/*.js` 只做数据编排、绘图与 ABI 调用，求解全部
  在二进制内。
- ★**为什么不是一条 GitHub Action**：wasm 不在公开仓里（`.gitignore`），它们由私有内核
  仓的构建装进 `app/assets/`。一台只检出公开仓的托管 runner 构建不出站点，而要让它能，
  就得把私有源码交给它——为发一个公开页面扩大私有源码的暴露面，方向反了。所以发布跑在
  两个检出都已经在的那台机器上。（2026-09-02 分仓时旧的 `publish-app.yml` 留在了老仓，
  此后一段时间**没有任何发布路径**；这条脚本是补回来的那一条。）
- ★**上游 `app/` 的两个子目录不发布**：`app/tests/`（闸子脚本，内含对照数字与私有仓
  路径）与 `app/server/`（已退役）。这与站点 `LICENSE` Part C 说的「编译二进制制品与随其
  分发的装载脚本」是同一条界，且现在由 `build-site.sh` 自己的自检拦着，不再靠工作流记得。
  ★因此 `pages/data.html`（原 `mdsplus.html`）在站点上**取不到数**——它要一个能开套接字
  的网关进程；页面自己会说这句话，那不是故障。
- ★**`fylite/LICENSE` 与 `fylite/NOTICE` 现在由构建装入**（2026-09-08），不再是本仓自留、
  发布时要保住的两份文件——**上一版的规矩正好相反，别照着旧文字办**。理由是 Apache-2.0
  §4(d)：署名义务附着在**分发件**上，而这个目录就是一次分发（它带着 GACODE 白盒移植的
  编译产物）。`LICENSE` 取上游仓的 Apache-2.0 全文，`NOTICE` 由构建自内核检出借入；
  两者缺一，`build-site.sh` 红着退出。★旧的 `fylite/LICENSE`（「Binary Redistribution
  License · source not published」）与上游今天的 Apache-2.0 互相矛盾，下次同步会被替换。
- ★**算例**（`cases/`）是给页面「导入」按钮的实例会话文档，真源在上游 `app/cases/`。
  公开版按每份算例自报的 `fylite:device` 过滤：装置语料不带的机器（EAST），它的算例也
  不发，目录条目一并撤掉。**别在本仓手工改它们**：下次同步会按上游重新装。
- ★**URL 换过一次**（2026-09-08 起）：三条场景页从 `scenario/design·model·analysis.html`
  变成 `pages/pulse_design·model·analysis.html`，工具页 `mdsplus.html` 变成
  `pages/data.html`，另新增 `pages/report.html`。站内只链 `./fylite/`（入口不变），但
  外部深链会断。

## 本地预览

```bash
gem install bundler jekyll     # 或使用 github-pages gem 以对齐线上版本
jekyll serve                   # http://127.0.0.1:4000/
```

`fylite/` 无 front matter，Jekyll 原样拷贝，不经 Liquid 处理。

## 标识

当前资源位于 `docs/assets/brand/`：仓首页使用 `banner.svg`，页面使用 `logo.svg`，favicon 使用方形 `icon.svg` 与 `favicon.png`。独立图标采用托卡马克 D 形极向小截面、嵌套闭合磁面与相连节点，不含字符，表达面向磁约束聚变大科学工程的知识系统、数据平台与智能平台。配色为蓝 `#1F6FEB`、橙 `#EA580C`、灰 `#6E7681`；SVG 字形转为路径，不依赖浏览器字体。

## 许可

站点材料分两部分，按服务路径判定，完整文本见 [`LICENSE`](LICENSE)（`/fylite/` 树内另有一份
随制品携带的同款通告）：站点自身为 **CC BY-ND 4.0**；`/fylite/` 下的二进制制品适用
**二进制再分发许可**（可免费逐字节再分发，源码不公开）。

Copyright © 2024–2026 YU Zhi（于治），ASIPP。
