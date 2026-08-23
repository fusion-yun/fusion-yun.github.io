---
layout: default
title: FuYun —— 聚变集成建模与知识计算
description: FuYun：FyLite 在线演示与许可。
---

<p align="center"><img src="./figures/fuyun_logo.svg" alt="FuYun" width="520"></p>

> 「"神马"都是"浮云"」

**FuYun** 是一套面向聚变研究与工程的集成建模软件。它把装置描述、诊断测量、平衡与输运计算
放进同一套数据约定里，让一次放电从测量到剖面、从位形设计到校验能连起来跑完，
并且换个人、换台机器仍跑得出同样的结果。

- **一套数据约定，跨装置通用.** 装置几何、线圈与诊断布置、放电数据按 IMAS 数据字典组织；
  在 EAST 上写好的分析流程，换到另一台装置不必重写。
- **物理模块可替换.** 平衡、输运、源项等各自成块，可以只换掉其中一个再跑一遍作对照，
  不必改动整条链路。
- **算完能说清怎么来的.** 输入数据、代码版本与判定依据随结果一起留档，便于复算、
  横向对比，以及成文时交代清楚。

本站发布 FuYun 对外可直接引用的公开部分：在线演示与公开文档。

---

## 在线演示

[**FyLite 在线演示**](./fylite/) —— FyLite 用于**测试与展示聚变分析、建模、设计类应用的
基本功能集**；计算全部在浏览器内完成，无需安装，打开即用：

- [**放电设计**](./fylite/discharge.html) —— 给定目标截面形状与等离子体参数，反解所需的
  极向场线圈电流，再正算一遍自由边界 Grad–Shafranov 平衡，校验真正得到的位形。
- [**动理学平衡重构**](./fylite/reconstruction.html) —— 由极向磁通环/磁探针测量加压强约束
  反演 p′/FF′ 剖面；可跑 EAST 真实放电数据，也可跑真值已知的合成算例。

单次求解约一到两秒。页面支持 GEQDSK（g 文件）与 JSON 会话文件的导入导出。

---

## 许可

本站两类材料分别适用不同条款，以文件服务路径判定（完整文本见 [LICENSE](./LICENSE)）：

| 路径 | 材料 | 条款 |
| :--- | :--- | :--- |
| 站点其余部分 | 页面、散文、图形、样式 | [CC BY-ND 4.0](./LICENSE) |
| `/fylite/` | FyLite 二进制制品与装载脚本 | [二进制再分发许可](./fylite/LICENSE) |

---

## In brief (English)

**FuYun** is integrated-modelling software for fusion research and engineering. Machine
description, diagnostic measurements, equilibrium and transport all sit under one data
convention, so a discharge can be carried from measurement to profiles, and from shape design
to verification, in a single chain that someone else can run again and get the same answer.
Machine geometry, coil and diagnostic layout and discharge data follow the IMAS Data
Dictionary, so an analysis written for one device carries over to another; equilibrium,
transport and source models are separate blocks, so one can be swapped for a comparison run
without touching the rest; and inputs, code versions and acceptance criteria are recorded
alongside every result.

One part is published here. [**FyLite**](./fylite/) exercises and demonstrates the basic
capability set of fusion analysis, modelling and design applications — tokamak equilibrium
design and reconstruction, computed entirely in the browser with nothing to install.

Source repositories are not public; see [LICENSE](./LICENSE) for the per-path terms.

---

<p align="center"><small>Copyright © 2024–2026 中国科学院合肥物质科学研究院等离子体物理研究所（ASIPP）<br>
Institute of Plasma Physics, Chinese Academy of Sciences</small></p>
