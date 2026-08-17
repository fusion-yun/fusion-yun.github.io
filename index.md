---
layout: default
title: FuYun —— 聚变集成建模与知识计算
description: FuYun：本体命名空间 spo / fyo、fylite 在线演示、构成与许可。
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

[**fylite 在线演示**](./fylite/) —— fylite 的 Rust 平衡内核编译为 WebAssembly，
在浏览器内直接运行，**无服务端计算**，打开即用：

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

## 构成

FuYun 分两层：通用的 **Sp 平台层**（数据 / 计算 / 治理三内核）与其上的 **Fy 聚变域层**。

**Sp 平台层**

| 成员 | 角色 |
| :--- | :--- |
| **sp** | 平台主仓：平台层规范文档与工程约定核 |
| **SpData** | 数据内核与契约著作：L0 数据抽象层（统一命名空间下的多后端数据访问）|
| **SpModel** | 计算 / 建模内核：`spo` 的规范原生执行引擎；SpO 语义属主 |
| **SpHarness** | 治理—控制内核：受控写入、审计、沙箱、配额、致动联锁 |

**Fy 聚变域层**

| 成员 | 角色 |
| :--- | :--- |
| **FyTok** | 托卡马克集成建模与分析主仓：IMAS DD 对齐的 IDS 模型层、插件化求解器与场景回路编排；FyO 属主 |
| **fyeq** | 平衡求解器族：解析闭合 / 数值定边界 G-S / PF 线圈自由边界（含 X 点与偏滤位形）/ 动理学平衡重构 |
| **fytrans** | 输运物理包：1.5D 芯部输运（粒子 / 热 / 电流扩散）与湍流—新经典输运模型族、源项与剖面 |
| **fydata** | 装置描述 A-Box 数据包：装置清单、壁与线圈几何、磁测量与诊断布置（如 EAST）|
| **fylite** | 自足的平衡求解与重构包（Rust 内核 + Python 前端，零 sp / fy 依赖）；本站演示由其编译产出 |
| **fywork** | 工作流与基准算例：端到端复现、跨码对拍与判据 |
| **fydoc** | 文档与调研综述 |

 

---

## 许可

本站三类材料分别适用不同条款，以文件服务路径判定（完整文本见 [LICENSE](./LICENSE)）：

| 路径 | 材料 | 条款 |
| :--- | :--- | :--- |
| 站点其余部分 | 页面、散文、图形、样式 | [CC BY-ND 4.0](./LICENSE) |
| `/spo/` `/fyo/` | 本体制品（LinkML 源、清单、编译 OWL / SHACL / JSON-LD）| [CC BY-ND 4.0](./spo/LICENSE) |
| `/fylite/` | fylite 二进制制品（WebAssembly 模块与装载脚本）| [二进制再分发许可](./fylite/LICENSE) |

Copyright © 2024–2026 YU Zhi（于治），中国科学院合肥物质科学研究院等离子体物理研究所（ASIPP）。


---

## In brief (English)

**FuYun** is a suite of software for integrated modelling and knowledge computing in fusion
science and engineering. This site publishes its two language-neutral ontology namespaces —
[**spo**](./spo/v0.draft/), the upper ontology (BFO-grounded), and [**fyo**](./fyo/v0.draft/),
the fusion-domain ontology (apparatus core plus a semantic lift of IMAS DD 4.1.1) — as OWL,
SHACL and JSON-LD, resolvable directly from their prefix IRIs. Both are **`v0.draft`, not stable
namespaces**. It also hosts [**fylite**](./fylite/), a browser-side tokamak equilibrium
design-and-reconstruction demo whose Rust kernel runs as WebAssembly with no server-side compute.
Source repositories are not public; see [LICENSE](./LICENSE) for the per-path terms.
