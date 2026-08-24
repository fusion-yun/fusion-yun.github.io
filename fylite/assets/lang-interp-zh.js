// 「功率平衡反演」功能栏的词条（zh）。
(function (root) {
  'use strict';
  root.FyI18n.register('zh', {
  "nav.interp": "功率平衡反演（interpretive）",

  "i.setup": "几何与网格",
  "i.setup_note": "★这一栏<strong>不解任何方程</strong>：它把导入的剖面放到这套度规上，用「含时演化」栏那条一模一样的能量平衡<strong>反过来</strong>解出 χ。★剖面从<strong>「含时演化」栏的导入</strong>来（导入菜单里的「参考剖面 CSV」）——一页一份文档，两条栏共读，免得一边对标着一张表、另一边标定着另一张。★<strong>不外推</strong>：表的半径范围盖不住这套度规时，这一栏<strong>拒绝</strong>而不是把边缘补齐——在编出来的剖面上反演，反出来的是编出来的 χ。",
  "i.gradfloor": "梯度地板（特征梯度的份额）",
  "i.sources": "维持这条剖面的源",
  "i.vloop": "环电压 V<sub>loop</sub> [V]（0 = 不计欧姆）",
  "i.src_note": "★<strong>反出来的 χ 只和你给的源一样可靠</strong>——这是所有 interpretive 分析的老实话，不是这一栏的特例。★兆瓦就是兆瓦：高斯沉积按体积分归一。★α 与辐射按<strong>导入的剖面自身</strong>算（Bosch-Hale 反应率、ADAS 冷却率），不是按某次推进的状态。★<strong>欧姆项走规定的环电压</strong>：E<sub>∥</sub> = V<sub>loop</sub>/(2πR<sub>0</sub>)，σ 取这条剖面的 Spitzer 值。这不是含时栏里那个滞后一步的速率——那里有 ψ 在动，这里没有。V<sub>loop</sub> = 0 就是不把欧姆计进去。",

  "i.scope": "★<strong>这一栏解的是反问题</strong>：给定剖面 n、T 与源密度 Q，由 <em>∂/∂ρ(V′⟨|∇ρ|⟩q) = V′Q</em> 定出逐面热流 q，再由 <em>q = −⟨|∇ρ|²⟩ n χ ∂T/∂ρ</em> 定出有效扩散率 χ。通量用 ⟨|∇ρ|⟩（gm7）、传导律用 ⟨|∇ρ|²⟩（gm3），这是上游的约定<strong>不是笔误</strong>——所以一条由常数 χ₀ 传导解出来的剖面，反演回来是 χ₀/gm7。",
  "i.caveat": "★<strong>这不是拟合，也不是预测</strong>：没有任何量被极小化，答案是那条能量平衡的代数反解。★<strong>梯度太平的地方没有答案</strong>：低于梯度地板（特征梯度 max|T|/跨度 的一个份额，上游取 1e-3）的点回来的是 <code>NaN</code>，图上就是断口——在那里做除法是在除噪声，填上去等于把剖面最平的一段报成最反常的一段。★<strong>近轴与边界都不可靠，理由不同</strong>。拿已知 χ₀ 造的剖面做往返实测（31 点网格，量的是 χ·gm7 对 χ₀ 的相对差）：<strong>近轴</strong>——V′ → 0，通量是两个小量之比，ρ/a = 0.03 高 50 %、0.07 高 6.8 %、0.10 高 2.6 %，到 0.15 已在 1 % 以内；<strong>边界</strong>——最后两个节点是单侧差分，ρ/a = 0.97 低 17 %、边界节点高 110 %。中间那一段（0.15 ≤ ρ/a ≤ 0.93）把 χ₀ 找回到<strong>百分之一以内</strong>。★所以：两端节点<strong>照画不误</strong>，但<strong>不进体积平均</strong>；近轴那几个进平均，可 V′ 权重本来就把它们压到近乎无关。悄悄丢点和悄悄留着一样坏，所以读数里写明进平均的是几个点。★<strong>单一热离子</strong>、χ 是<strong>有效</strong>扩散率（新经典＋湍流＋对流全在里面，分不开）、没有箍缩项（把对流算进 χ 里了）、没有台基与 SOL。★这一栏与「含时演化」栏是<strong>一对</strong>：这里反出 χ，那里拿它去预测；两边用的是同一条平衡式，所以对得上才是应该的。",

  "i.chi_cap": "有效扩散率 χ（断口 = 梯度低于地板，无解）",
  "i.prof_cap": "用来反演的剖面（导入的那份）",
  "i.flux_cap": "逐面热流 q（功率平衡）",
  "i.power_cap": "累积功率 P(ρ)（源的体积分）",
  "i.result": "反出来的数",

  "i.row.chie": "⟨χ<sub>e</sub>⟩（体积平均，去两端节点）",
  "i.row.chii": "⟨χ<sub>i</sub>⟩（体积平均，去两端节点）",
  "i.row.chie_half": "χ<sub>e</sub>(ρ/a = 0.5)",
  "i.row.chii_half": "χ<sub>i</sub>(ρ/a = 0.5)",
  "i.row.valid": "有效点 / 网格点",
  "i.row.used": "进平均的点 / 网格点",
  "i.row.w": "热储能 W<sub>th</sub>",
  "i.row.taue": "τ<sub>E</sub> = W/(P<sub>in</sub>−P<sub>rad</sub>)",
  "i.row.paux": "外加热 P<sub>aux</sub>",
  "i.row.palpha": "α 加热",
  "i.row.prad": "辐射（总）",
  "i.row.pohm": "欧姆",
  "i.row.geo": "几何来源",

  "i.ready": "内核就绪——先在「含时演化」栏导入一份参考剖面，再按这一栏的计算键。",
  "i.running": "反演中……",
  "i.done": "完成：{n}/{m} 个网格点有解 · ⟨χ<sub>e</sub>⟩ = {chie} m²/s · ⟨χ<sub>i</sub>⟩ = {chii} m²/s · {ms} ms",
  "i.fail": "失败：{why}",
  "i.none_yet": "还没有反演过。",
  "i.verdict.some": "★有 {bad} 个点低于梯度地板，那里<strong>没有答案</strong>（图上是断口）——不是零，也不是很大的数。",
  "i.verdict.all": "★全部 {n} 个网格点都在梯度地板之上。",

  "i.j.export_hint": "★把这次反演整份写出来：<strong>逐面度规（含 gm7 与 gm3）</strong>、被反演的剖面、反出来的 χ 与它的<strong>有效标记</strong>、以及源与逐面热流——全部按 fyo 组写（equilibrium / core_profiles / core_transport / core_sources）。没有度规的 χ 谁也核不了，包括拿去喂含时演化栏的那个人。",
  "i.j.import_hint": "读回一份本栏的会话文件：<strong>只恢复控件</strong>，不重算。",
  "i.j.imported": "已载入「{name}」：{n} 个控件被设定。<strong>没有重算</strong>——按计算键才跑。",
  "i.err.noref": "还没有参考剖面：在「含时演化」栏用导入按钮喂一份 CSV（列名含 rho / TE / TI / NE），这一栏读的就是那一份。",
  "i.err.nogm7": "这套几何没给出 ⟨|∇ρ|⟩：功率平衡的通量项定不出来，所以这一栏拒绝。",
  "i.err.span": "参考剖面只覆盖 ρ = {lo} 到 {hi} m，而这套度规要到 {need} m。<strong>不外推</strong>：在补出来的剖面上反演，反出来的是补出来的 χ。换一份表，或把网格点数/几何换成它盖得住的。",
  });
})(typeof self !== 'undefined' ? self : this);
