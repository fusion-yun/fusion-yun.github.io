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



  // --- 放电设计（一页三模式，FYL-DESIGN-09 D-18..D-21）------------------
  'ln.pulse_design.title': '放电设计 · fylite',
  'ln.pulse_design.h1': '放电设计',
  'ln.pulse_design.sub': '一份脚本 · 三种时间观：配置 · 设计 · 仿真',
  'ln.pulse_design.lead': '这个场景回答<strong>「这一炮该怎么打，以及照这么打会发生什么」</strong>。同一份脚本，三个模式换的是<strong>时间轴的含义</strong>：<strong>配置</strong>没有时间轴——一个时刻一个解（工况、持住这条边界的线圈电流、击穿场零）；<strong>设计</strong>里整条脉冲已经存在，播放头在其中来回读，给出逐通道电流与电压波形；<strong>仿真</strong>里只有过去，右缘就是现在，滑块改的是未来。「这一炮」的位形、电流、相位与加热在页面上<strong>各只有一个控件</strong>，三个模式读同一份。',
  'ln.pulse_design.bound': '★<strong>哪一片解过、哪一片没解，页面必须说</strong>：整条轨迹里只有你要求校验的那几片真做了自由边界正解，其余画的是<strong>目标</strong>位形，不是得到的位形。★<strong>静态解不等于能这么运行</strong>：配置模式说的是「这组目标<strong>存在</strong>一个静态解」。★<strong>仿真的产物是一次运行记录，不是一份设计</strong>，且<strong>不承诺实时</strong>——平衡每 N 步才真解一次，其间画面上的边界是上一次真解的那一条。★三个模式都<strong>不含控制器</strong>的增益、时滞与噪声；平顶上的 PF 电流是形状反馈回路的<strong>稳态解</strong>。',

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
  'home.lines.h2': '四个页面',
  'home.lines.lead': '演示是<strong>四个页面</strong>。前三个按<strong>用途</strong>分场景，顺序就是一台机器被过一遍的顺序：<strong>设计 → 建模 → 反演</strong>。一个场景一页，也是一个界面：一个计算内核、一条工具条；页面由若干<strong>功能栏</strong>组成，<strong>每条栏有自己的计算键与折叠钮</strong>——按哪条算哪条，折叠只收显示。栏与栏之间按声明的依赖排序，上游还没算过时下游会在标题条上说明。★第四个页面<strong>装置数据</strong>不是场景，也<strong>什么都不算</strong>：它没有计算内核、没有计算键，把装置自己存下来的数取到你面前——因此它是四个里唯一需要一台够得着的 mdsip 服务器的。',
  'home.card.scenario.pulse_design.h': '放电设计 →',
  'home.card.scenario.pulse_design.p': '一份脚本，三种时间观：配置（一个时刻一个解：工况、位形反解、击穿）· 设计（整条脉冲 → 逐通道电流与电压波形，播放头选片，已解片与插值片分得清）· 仿真（合开关起放电，磁面与剖面随时间演化，滑块改的是未来）。',
  'home.card.scenario.model.h': '物理建模 / 预测 →',
  'home.card.scenario.model.p': '一炮的剖面怎么演化：固定几何的 1.5D 芯部输运，以及把压强回灌给自由边界平衡的自洽外环。',
  'home.card.scenario.analysis.h': '实验分析 / 反演 →',
  'home.card.scenario.analysis.p': '由磁通环、磁探针、POINT 与 Thomson 反推平衡状态，压强剖面作动理学约束，误差棒由后验采样给出。',
  'home.card.tool.data.h': '装置数据 →',
  'home.card.tool.data.p': '直接看装置自己的档案：浏览 MDSplus 树、指定炮号、取回选定信号。★这一页<strong>不算任何东西</strong>——它显示的是装置存下来的数，不是本站算出来的结果；也因此它需要一台够得着的 mdsip 服务器：用单文件查看器打开（<code>fy --mdsip 主机:端口</code>），或在页面上填一台。',
  'home.card.tool.report.h': '算例报告 →',
  'home.card.tool.report.p': '把一次算例的记录（fyo 计划 + spo 记录，产出内联在端口上）渲染成一份报告：参数表、端口表、读数、按量自身坐标画的折线图、带边界轮廓时的极向截面。★这一页<strong>不算任何东西</strong>——画什么由一份呈现规格说了算，没带规格就按规则推一份，与 <code>fylite cases --report</code> 写在报告旁的那份相同。',
  // --- the v2 page shell (assets/shell.js) --------------------------------
  'shell.lead.more': '展开说明 ▾',
  'shell.lead.less': '收起说明 ▴',
  'shell.blocked': '受阻',
  'shell.empty.title': '还没有曲线。',
  'shell.empty.gateway': '这一页需要一个能开套接字的进程 —— 先给它一台 mdsip 服务器。',
  'shell.empty.pick': '左边的树里选几路信号，再按「取回」。',
  'shell.empty.fetch': '已选好信号 —— 按「取回」把它们取下来。',
  'shell.empty.noresult': '这一栏还没有结果。',
  'shell.empty.run': '按「{bar}」那一栏自己的计算键。',
  'shell.empty.runany': '展开一条功能栏，按它自己的计算键。',
});
