// Chinese prose for the four scenario pages and the landing page.
//
// One catalogue for all five rather than one per page: what is left after the
// lines model was withdrawn is small — each scenario's title, subtitle, lead
// and the boundary it has to state — and four files of six keys would be four
// places to forget.
//
// ★What is NOT here any more: the requirement-coverage table, the
// chain-of-files table, the verdict glyphs and the reason codes.  Those
// belonged to the model in which a page was a row in a design document; the
// prose that traced them is gone with it, not moved.
self.FyI18n.register('zh', {
  // --- 放电设计 -----------------------------------------------------
  'ln.design.title': '放电设计 · fylite',
  'ln.design.h1': '放电设计',
  'ln.design.sub': '工况 · 位形 · 线圈电流与电压波形',
  'ln.design.lead': '这个场景回答的是：想要这样一炮放电，<strong>要哪个工况、位形解不解得出、电源出不出得起</strong>。四条功能栏依次答这三问，平顶电流是它们共读的同一个控件。',
  'ln.design.bound': '<strong>这里解出来的每一个位形都是静态的</strong>——它说的是「这组目标<strong>存在</strong>一个静态解」，不是「这台机器能这么运行」。脉冲轨迹那一栏只把时间加回给了<strong>电路</strong>；等离子体自身的输运、垂直位移的时域响应与反馈控制，四条栏都不含。',

  // --- 控制仿真 -----------------------------------------------------

  // --- 物理建模 -----------------------------------------------------
  'ln.model.title': '物理建模 · fylite',
  'ln.model.h1': '物理建模 / 预测',
  'ln.model.sub': '1.5D 输运 · 含时演化（两条功能栏，各有计算键）',
  'ln.model.lead': '这个场景把一炮的<strong>剖面</strong>算出来：一条栏在固定几何上定态求解、拖控件即重算，另一条把热、粒子与电流三道<strong>随时间一起推进</strong>（几何可冻结，也可与自由边界平衡交替）。',
  'ln.model.bound': '链条会让人把端到端的结果当成比它任何一环都更权威的东西，所以这几句要一直留着：0D 的 Q <strong>不是预测</strong>（分析档里密度与温度是你给的）；1.5D 那一栏的<strong>几何是固定的</strong>，它报不出储能与约束时间；含时那一栏<strong>没有台基模型</strong>，边界是你给的一个数。',

  // --- 实验分析 -----------------------------------------------------
  'ln.analysis.title': '实验分析 / 反演 · fylite',
  'ln.analysis.h1': '实验分析 / 反演',
  'ln.analysis.sub': '由测量恢复位型 · 正向算子 · 不确定度',
  'ln.analysis.lead': '这个场景把「由测量恢复位型」当作一个统一的正向—推断问题：磁通环与磁探针、POINT 干涉与法拉第、Thomson 密度一起进拟合，压强剖面作动理学约束，误差棒由后验采样给出。',
  'ln.analysis.bound': '<strong>磁测量单独约束不住内部剖面</strong>——很不一样的剖面能给出几乎一样好的磁场拟合，把解定下来的是动理学约束，这正是「动理学重构」的分别所在。误差棒只度量<strong>压强 σ 这一个来源</strong>；诊断几何、装置描述与模型本身的不确定度都不在其中。',

  // --- landing page: the four lines ---------------------------------------
  'home.lines.h2': '三个场景',
  'home.lines.lead': '演示按<strong>用途</strong>分成三个场景，顺序就是一台机器被过一遍的顺序：<strong>设计 → 建模 → 反演</strong>。一个场景一页，也是一个界面：一个计算内核、一条工具条；页面由若干<strong>功能栏</strong>组成，<strong>每条栏有自己的计算键与折叠钮</strong>——按哪条算哪条，折叠只收显示。栏与栏之间按声明的依赖排序，上游还没算过时下游会在标题条上说明。',
  'home.card.scenario.design.h': '放电设计 →',
  'home.card.scenario.design.p': '要哪个工况、位形解不解得出、电源出不出得起。0D 放电分析定工况（I<sub>p</sub>、环电压、聚变功率与 Q），位形与线圈电流反解并正算校验，脉冲轨迹给出逐通道电流与电压。',
  'home.card.scenario.model.h': '物理建模 / 预测 →',
  'home.card.scenario.model.p': '一炮的剖面怎么演化：固定几何的 1.5D 芯部输运，以及把压强回灌给自由边界平衡的自洽外环。',
  'home.card.scenario.analysis.h': '实验分析 / 反演 →',
  'home.card.scenario.analysis.p': '由磁通环、磁探针、POINT 与 Thomson 反推平衡状态，压强剖面作动理学约束，误差棒由后验采样给出。',
});
