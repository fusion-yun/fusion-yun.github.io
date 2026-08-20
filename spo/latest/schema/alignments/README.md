# schema/alignments — 中立映射登记 (Neutral Alignment Registry)

映射制品所在目录——规范依据是《SpO 领域本体规范》§4.4.3 (d)「与同侪中层制品的关系：映射，不导入」。

- **不是 LinkML 模块**：这里的文件**不**进入 spo 的签名，也**不**被任何 schema
  `imports`。把对方术语引入签名会违反上游中立纪律（`SP-ONT-SPEC-01` §4.4.7.1）。
- **手工策展**：每行由人裁定并逐条核验；`dist/` 的任何映射序列化都由编译从这里生成，
  **禁止**反向手改。
- **逐行钉版**：`subject_source` / `object_source` 必须写明被映射双方的确切版本。
  CCO 套件成员在 2021 与 2024 两个时点之间已变动，不钉版的引用无意义。
- **只映射实质重叠处**：缺口处没有可作映射主词的术语，走 `SP-ONT-SPEC-01` §4.4.3 的
  下游指引；双方各自锚到同一 BFO 术语处不另立映射行（套件不冗余）。

| 文件 | 内容 |
| :--- | :--- |
| `alignments-manifest.yaml` | 元数据头：被映射制品、钉住版本、谓词允许集、策展准则 |
| `spo-to-cco.sssom.tsv` | spo → Common Core Ontologies 的映射（SSSOM 风格核心列） |

机器检查：`scripts/check_conformance.py` 的 **C7**（主词解析 · 谓词允许集 · 钉版非空）。
