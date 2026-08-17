---
layout: default
title: FuYun —— 聚变集成建模与知识计算
description: FuYun：本体命名空间 spo / fyo、FyLite 在线演示、许可。
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

本站发布 FuYun 对外可直接引用的公开部分：在线演示、数据语义的命名空间定义，以及公开文档。

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

这两份是机器可读的词表，规定数据里每个字段"是什么"——装置、线圈、诊断、平衡量、时间轴各自
如何标注，使不同来源的数据可以对齐、可以校验。用不上语义工具的读者可跳过本节，不影响使用演示。

词表以语言中立的 LinkML 编写，编译为 **OWL / SHACL / JSON-LD** 发布，任何 RDF 工具可直接
消费，无需 Python 或 LinkML。两个命名空间以本站为权威主机，前缀 IRI **含尾斜杠**，
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
