---
layout: default
title: "神马"都是"浮云"
---

![FuYun](./images/FuYun.png)


## 目标

- 面向科学工程的知识管理和计算环境
- 构建可计算的知识图谱
- 构建基于本体的模拟和建模
- 构建科学装置的数字孪生


## 在线演示

[**fylite 在线演示**](./fylite/) —— fylite 的 Rust 平衡内核编译为 WebAssembly，
在浏览器里直接跑，无服务端计算：

- [放电设计](./fylite/discharge.html)：给定目标位形反解 PF 线圈电流，再做自由边界
  Grad–Shafranov 求解校验。
- [动理学平衡重构](./fylite/reconstruction.html)：由极向磁通环测量加压强约束拟合
  p′/FF′ 剖面；可直接跑 EAST 真实炮数据。


## 子系统:

- **SpDM**:  a data integration tool designed to organize scientific data. http://fusion-yun.github.io/spdm/
   - Install: `pip install spdm`

- **FyTok**: Tokamak integrated modeling and analysis toolkit. http://fusion-yun.github.io/fytok/
   - Install: `pip install fytok`

- **fylite**: 自足的托卡马克平衡求解与重构包（Rust 内核 + Python 前端）。
   - 在线演示: [fusion-yun.github.io/fylite/](./fylite/)