fusion-yun.github.io
=====================

## 描述

- FuYun 系统的介绍网页
- 采用 github jekyll 格式

## 目录

- `index.md` — 首页（Jekyll 渲染）
- `fylite/` — fylite 在线演示。纯静态页面，Jekyll 原样拷贝（无 front matter，
  不经 Liquid 处理）：
  - `index.html` 说明与出处、`discharge.html` 放电设计、
    `reconstruction.html` 动理学平衡重构
  - `assets/fylite_rs.wasm` — fylite Rust 内核的 WebAssembly 构建，**仅二进制，
    不含源码**；`assets/*.js` 只做数据编排、绘图与 ABI 调用，求解全部在二进制内。

**这个目录不要手工编辑。** 它的唯一真源是私有仓 `fusion-yun/fylite` 的 `app/`，
由该仓的 `.github/workflows/publish-app.yml` 同步过来（手动触发，
写权限 deploy key）。要改内容请改那边再重新发布；直接在此处修改会在下次同步时被覆盖。