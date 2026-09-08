// Chinese catalogue for the physics-modelling page's own chrome: the shared
// controls and the note that explains its 功能栏.  The two bars keep their own
// catalogues (`lang-transport-*`, `lang-evolve-*`) — what is here belongs to
// the page rather than to any one bar.  The bars' own titles come from
// `nav.<bar>` in the shared catalogue, because the export menu labels its
// files with the same names.
self.FyI18n.register('zh', {
  'm.shared': '这台机器（两条栏共读）',
  'm.quasi.on': '★<strong>成分已由 Z<sub>eff</sub> 与 {name}（Z = {z}）定死</strong>：主离子稀释 n<sub>i</sub>/n<sub>e</sub> = {fd}，杂质浓度 n<sub>z</sub>/n<sub>e</sub> = {c}%，燃料占比 f = {f}（n<sub>D</sub> = n<sub>T</sub> = n<sub>i</sub>/2）。下面那两个控件<strong>已禁用</strong>——一套成分有三个说法、而求解器只听其中一个，那不叫可配置。',
  'm.quasi.solved': '★★<strong>成分在演化，Z<sub>eff</sub> 是结果</strong>（T-C20）：两种离子各自是一条密度道，n<sub>e</sub> = Σ Z<sub>s</sub>n<sub>s</sub> 由准中性给出，逐面的 Z<sub>eff</sub> 由解出来的成分算出、并写进会话文件。★上面那个 Z<sub>eff</sub> 滑杆此时只定<strong>起始</strong>成分（稀释 n<sub>i</sub>/n<sub>e</sub> = {fd}，杂质浓度 {c}%，起始燃料占比 f = {f}），此后不再钉住任何东西。★杂质自己的 D<sub>z</sub>/χ<sub>e</sub>、箍缩与加料速率因此可用——两种离子输运得一样时，有两条道与有一条道没有区别。',
  'm.quasi.bad': '★Z<sub>eff</sub> = {zeff} 用 {name}（Z = {z}）配不出来（主离子密度会变成负的）。把 Z<sub>eff</sub> 调到 1 与 {z} 之间，或换个物种。',
  'm.quasi.nodensity': '★粒子道开着时不可用：n<sub>e</sub> 在演化而 Z<sub>eff</sub> 被钉死是两套成分，这一版没有杂质输运来裁决。',
  'm.quasi.nospecies': '★先点一个 Z > 1 的杂质物种，这一档才有意义。',
  'm.shape_idle': '★含时演化栏现在从<strong>{src}</strong>取几何：上面六个形状控件（a、R/a、κ、δ、边界 q、B<sub>0</sub>）<strong>不参与</strong>它的答案，形状与场都来自那张 ψ。它们仍是 <strong>1.5D 芯部输运栏</strong>的输入（那一栏读 g 文件时也是把文件降解成这六个数写回来），所以是<strong>标灰不是禁用</strong>——禁用会连另一条栏的输入一起关掉。',
  'm.shared.note': '★<strong>同一个量只有一个控件</strong>：装置尺寸（a、R/a、κ、δ、边界 q、B<sub>0</sub>）与 n<sub>e</sub>(0)、χ₀ 由两条栏共读，所以放在功能栏<strong>之外</strong>——栏一折会把自己的面板收起，共用控件若住在里面就会连着另一条栏的输入一起看不见。★这一组只在<strong>解析几何（Miller）</strong>那一档定几何：含时演化栏一旦把几何来源换成解出来的平衡或导入的 g 文件，形状与场就来自那张 ψ，这几个滑块只剩 n<sub>e</sub>(0)/χ₀ 还有话语权。（0D 放电分析那一栏在<strong>设计场景</strong>。）',
  'm.stages.note': '★这一页有两条<strong>功能栏</strong>：<strong>1.5D 芯部输运</strong>（固定几何、单通道、定态——拖控件即重算的交互档）与<strong>含时演化</strong>（多通道随时间推进，几何可选冻结或与平衡交替——按键才跑的离线档）。<strong>每条栏自己有一个计算键</strong>；标题条左端的折叠钮把整条栏收成一行，只关显示、不关计算。★两条栏回答的<strong>不是同一个问题</strong>：上面那条问「给定这套度规与这个 χ，剖面长什么样」，报不出储能与约束时间；下面那条解的是带 (3/2)V′n 热容、源以 W/m³ 计的能量平衡，因此 W<sub>th</sub>、τ<sub>E</sub>、β<sub>N</sub>、Q 才有意义。★<strong>工况来自设计场景的 0D 栏</strong>：在那边按「交给建模场景」，这里按「取用」；或者导出/导入工况文件。两条栏都能直接读一张<strong>平衡 g 文件</strong>（设计页解出的、反演页重构的都行）——1.5D 栏把它降解成 Miller 四个数，含时演化栏则在那张 ψ 上<strong>追出逐面度规</strong>。',
});
