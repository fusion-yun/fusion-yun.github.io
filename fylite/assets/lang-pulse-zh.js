// Chinese catalogue for the PULSE-DESIGN scenario (FYL-DESIGN-09 设计模式).
//
// The page's own words: one pulse script, four views on one time axis.  The
// sentences that matter are the ones about WHAT A NUMBER IS — 目标 or 实现,
// 已解片 or 插值片 — because that is the distinction the page exists to keep.

self.FyI18n.register('zh', {
  'nav.pulse': '脉冲设计（整条脉冲）',
  'p.phases': '相位与 I<sub>p</sub>',
  'p.rate': '斜坡率：上升 {up} MA/s · 下降 {down} MA/s。相位边界由内核的梯形单源给出（同一个形状不写第二遍）。',

  'p.shape': 'LCFS 位形轨迹',
  'p.shape.note': '★<strong>下降沿不是上升沿取负</strong>：它有自己的收缩比 a₁/a，因为等离子体交回限制器的节奏与它长大的节奏本来就不是一回事。κ 与 δ 随尺寸一起到位——一个刚起来的小柱子不是被拉长的。',

  'p.heat': '辅助加热与剖面（0-D）',

  'p.solver': '波点与校验',
  'p.npts': '波点数',
  'p.nverify': '正解校验的波点数',
  'p.solver.note': '波点是<strong>设计发生的时刻</strong>，走廊上的 121 个点只是画面。校验的那几片才真解了平衡——它们在下表里，每片约一秒。',

  'p.corridor': '0-D 时序走廊',
  'p.caveat': '这一页把一炮放在<strong>同一条时间轴</strong>上：0-D 标量在走廊里滚动，平衡与剖面只显示播放头所在的那一片，PF 波形与它共用同一条轴。★<strong>0-D 档的密度与温度是你给的</strong>，所以这里的 Q 不是预测；它回答的是「这个工况自洽不自洽」，不是「这台机器能做到多少」。',
  'p.cap.ip': 'I<sub>p</sub>（相位带：上升 / 平顶 / 下降；竖线是播放头）',
  'p.cap.vloop': '环电压 V<sub>loop</sub>',
  'p.cap.heat': '功率：辅助加热与聚变功率',
  'p.cap.q': '增益 Q（= P<sub>fus</sub> / P<sub>aux</sub>）',

  'p.slice': '当前时间片',
  'p.slice.at': '播放头 t = {t} s',
  'p.slice.cap': 't = {t} s 的截面',
  'p.slice.solved': '★<strong>已解片</strong>：t = {t} s 的自由边界正解真做过——<strong>小半径偏差 {err}</strong>，边界类别 {kind}。红线是那次求解报出的位形（按形状度量重建），虚线是目标。',
  'p.kind.unreported': '未报（校验解不带剖面块）',
  'p.slice.interp': '★<strong>插值片（未解）</strong>：t = {t} s 没有解过平衡，图上只有<strong>目标</strong>位形。最近的已解片在 t = {near} s；要多解几片，把「正解校验的波点数」调大。',
  'p.slice.nosolve': '★<strong>插值片（未解）</strong>：t = {t} s 没有解过平衡，本次运行也没有任何校验片——图上是目标位形，不是得到的位形。',
  'p.leg.target': '目标 LCFS',
  'p.leg.got': '实现 LCFS（校验解）',
  'p.cap.ne': '密度剖面 n<sub>e</sub>（该片）',
  'p.cap.t': '温度剖面 T<sub>e</sub> / T<sub>i</sub>（该片）',

  'p.pf': 'PF 通道波形',
  'p.cap.i': '逐通道电流 [kA·匝]',
  'p.cap.v': '逐通道每匝电压 [V/匝]',
  'p.pf.note': '电压是与本仓电路积分器<strong>完全互逆</strong>的隐式欧拉反推，不是另一套离散。★这一栏是<strong>前馈</strong>：平顶上真实的线圈电流由形状反馈决定，会随 β<sub>p</sub>、l<sub>i</sub> 变——那一档在「交互仿真」场景里。',

  'p.table': '逐通道用量与判定',
  'p.col.ch': '通道',
  'p.col.imax': '|I|<sub>max</sub> [kA·匝]',
  'p.col.vmax': '|V|<sub>max</sub> [V/匝]',
  'p.col.cap': '所声明的限值',
  'p.col.mark': '判定',
  'p.cap.none': '未声明',
  'p.mark.ok': '在限内',
  'p.mark.over': '★越限',
  'p.mark.undeclared': '限值未声明',
  'p.limits.none': '★<strong>装置描述里没有每路电源的电压上限</strong>，所以这一列空着：没有限值就没有判定，页面不拿一个缺省值冒充机器数据。要判，就在左边填一个你自己的统一值。',
  'p.limits.yours': '★上限 {v} V/匝 是<strong>你给的一个统一值</strong>，不是装置数据——越限逐通道报出，设计不会被悄悄裁剪。',

  'p.verify': '正解校验（已解片）',
  'p.col.t': 't [s]',
  'p.col.target': '目标位形 (R₀, a, κ)',
  'p.col.shape': '实现位形 (R₀, a, κ)',
  'p.col.kind': '边界',
  'p.col.err': '小半径偏差',
  'p.verify.note': '★<strong>「实际得到」与「所要求」分列</strong>：左边是这一片要求的位形，右边是拿设计出来的电流做自由边界正解真得到的位形。两者差多少，就是这条轨迹在这一片上的诚实程度。',

  'p.ph.up': '上升',
  'p.ph.flat': '平顶',
  'p.ph.down': '下降',
  'p.axis.t': 't [s]',
  'p.ready': '内核就绪——按「运行」设计整条脉冲。',
  'p.no_kernel': '页面内核还没到（wasm 仍在下载），稍等一下再运行。',
  'p.running': '0-D 全程积分中…',
  'p.designing': '逐波点设计中（{n} 个波点）…',
  'p.done': '{n} 个波点的轨迹已设计，校验片已解。',
  'p.done.over': '轨迹已设计，★{n} 路通道超出所声明的限值——逐通道见下表，设计未被裁剪。',
});
