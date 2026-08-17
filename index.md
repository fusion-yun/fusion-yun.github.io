---
layout: default
title: FuYun —— 聚变集成建模与知识计算
description: FuYun：本体命名空间 spo / fyo、FyLite 在线演示、许可。
---

<p align="center"><img src="./figures/fuyun_logo.svg" alt="FuYun" width="520"></p>

> 「"神马"都是"浮云"」

**FuYun** 是一套面向聚变科学与工程的集成建模与知识计算软件：以本体承载语义、
以插件化物理内核承载计算、以可溯源的工作流承载研究过程。本站发布 FuYun
对外可引用的制品——本体命名空间、在线演示，以及公开文档。

- **本体优先.** 数据的含义由语言中立的 T-Box（LinkML → OWL / SHACL / JSON-LD）规定，
  而非由某个程序的内部结构隐含。
- **装置即数据.** 装置几何、诊断布置与放电语料以 A-Box 实例承载，可被任何 RDF 工具消费。
- **可溯源.** 从测量、重构、输运求解到场景编排，每一步的输入、版本与判据可追溯。

---

## 在线演示

[**FyLite 在线演示**](./fylite/) —— FyLite 用于**测试与展示聚变分析、建模、设计类应用的
基本功能集**；计算全部在浏览器内完成，无需安装，打开即用：

- [**放电设计**](./fylite/discharge.html) —— 给定目标截面形状与等离子体参数，反解所需的
  极向场线圈电流，再正算一遍自由边界 Grad–Shafranov 平衡，校验真正得到的位形。
- [**动理学平衡重构**](./fylite/reconstruction.html) —— 由极向磁通环/磁探针测量加压强约束
  反演 p′/FF′ 剖面；可跑 EAST 真实放电数据，也可跑真值已知的合成算例。

单次求解约一到两秒。页面支持 GEQDSK（g 文件）与 fyo 语义 JSON 会话的导入导出。

---

## 本体命名空间

语言中立的 LinkML T-Box，编译为 **OWL / SHACL / JSON-LD** 发布；任何 RDF 工具可直接消费，
无需 Python 或 LinkML。两个命名空间以本站为权威主机，前缀 IRI **含尾斜杠**，
CURIE 以字符串拼接展开。

两个命名空间当前均为 **`v0.draft` —— 非稳定命名空间**：术语可在无弃用期的情况下变更；
首个正式发布将另铸 `v1` 段。

| 本体 | 范围 | 命名空间 | 制品 |
| :--- | :--- | :--- | :--- |
| **SpO** | 上层本体：BFO-3D 核 + 4D 时空扩展、量—域—场—信号、时间 AoS/SoA 对偶、几何、受控词表、溯源 | `spo: https://fusion-yun.github.io/spo/v0.draft/` | [浏览](./spo/v0.draft/) · [`context.jsonld`](./spo/v0.draft/context.jsonld) · [OWL](./spo/v0.draft/spo.owl.ttl) · [SHACL](./spo/v0.draft/spo.shacl.ttl) · [LinkML 源](./spo/v0.draft/schema/) |
| **FyO** | 聚变域本体：装置层手工核心（Machine / Coil / Plasma / Diagnostic 等）+ IMAS DD 4.1.1 的语义提升层（82 IDS），接地于 SpO/BFO | `fyo: https://fusion-yun.github.io/fyo/v0.draft/` | [浏览](./fyo/v0.draft/) · [`context.jsonld`](./fyo/v0.draft/context.jsonld) · [OWL](./fyo/v0.draft/fyo.owl.ttl) · [SHACL](./fyo/v0.draft/fyo.shacl.ttl) · [LinkML 源](./fyo/v0.draft/schema/) |

FyO `imports: [spo]`。引用方式（远程 `@context`）：

```json
{ "@context": "https://fusion-yun.github.io/fyo/v0.draft/context.jsonld" }
```

以 `imports:` / `@context` / `owl:imports` / `@type` 引用本体**不构成**演绎作品，
不受 NoDerivatives 条款限制。

---

## 许可

本站三类材料分别适用不同条款，以文件服务路径判定（完整文本见 [LICENSE](./LICENSE)）：

| 路径 | 材料 | 条款 |
| :--- | :--- | :--- |
| 站点其余部分 | 页面、散文、图形、样式 | [CC BY-ND 4.0](./LICENSE) |
| `/spo/` `/fyo/` | 本体制品（LinkML 源、清单、编译 OWL / SHACL / JSON-LD）| [CC BY-ND 4.0](./spo/LICENSE) |
| `/fylite/` | FyLite 二进制制品与装载脚本 | [二进制再分发许可](./fylite/LICENSE) |

---

## In brief (English)

**FuYun** is a suite of software for integrated modelling and knowledge computing in fusion
science and engineering. This site publishes its two language-neutral ontology namespaces —
[**spo**](./spo/v0.draft/), the upper ontology (BFO-grounded), and [**fyo**](./fyo/v0.draft/),
the fusion-domain ontology (apparatus core plus a semantic lift of IMAS DD 4.1.1) — as OWL,
SHACL and JSON-LD, resolvable directly from their prefix IRIs. Both are **`v0.draft`, not stable
namespaces**. It also hosts [**FyLite**](./fylite/), which exercises and demonstrates the basic
capability set of fusion analysis, modelling and design applications — tokamak equilibrium design
and reconstruction, computed entirely in the browser with nothing to install.
Source repositories are not public; see [LICENSE](./LICENSE) for the per-path terms.

---

<p align="center"><small>Copyright © 2024–2026 中国科学院合肥物质科学研究院等离子体物理研究所（ASIPP）<br>
Institute of Plasma Physics, Chinese Academy of Sciences</small></p>
