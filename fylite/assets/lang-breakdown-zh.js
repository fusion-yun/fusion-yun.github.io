// Chinese catalogue for the breakdown / field-null bar only.
//
// ★Reconnected (T-D14): the verdict / per-channel-limit family
// (`b.verdict.*`, `b.col.*`, `b.lim*`, `b.row.bind`, `b.at_bound`,
// `err.dn.maxiter`) never left the MAIN catalogue — only this file was
// dropped with the old page — so those keys stay where they are and this
// file carries the rest, exactly as before.

self.FyI18n.register('zh', {
  'nav.breakdown': '击穿场零',

  'b.target': '场零位置与判据',
  'b.radius': '判据半径 [m]',
  'b.btol': '|B<sub>pol</sub>| 容差 [mT]',
  'b.crit_note': '判据是标准那一套：在场零周围一块半径若干厘米的圆盘上，|B<sub>pol</sub>| 处处低于几个 mT——雪崩要的是足够长的连接长度，实践中就写成这个形式。★阈值是<strong>参数不是常数</strong>：它随装置与充气而变，所以留给你设。',

  'b.flux': '磁通预算',
  'b.useflux': '要求场零处的极向磁通',
  'b.fluxt': '目标磁通 [Wb]',
  'b.flux_note': '场零解决的是「能不能起弧」，磁通预算解决的是「起弧之后能把电流推多高」。两者都线性于线圈电流，所以后者只是最小二乘里多一行等式。',

  'b.tradeoff': '权衡与约束',
  'b.wnull': '场零权重',
  'b.wflux': '磁通权重',
  'b.uselimits': '加电流上限',
  'b.imax': '上限 [kA·匝]',
  'b.usexref': '偏向参考放电的电流',
  'b.limit_note': '★<strong>行的量纲不同，必须各按自己的容差归一</strong>：场零行是特斯拉（~1e-3），磁通行是韦伯（~1e-1）。不归一的话磁通项会压倒场零，「设计」出来的是一个均匀场而不是一个零。归一之后残差为 1 就是「刚好在容差上」，两个权重才表达真正的权衡而不是单位事故。<br>★装置描述符里<strong>没有</strong>每路电源的电流上限，所以上限是你给的一个统一值，不是机器数据。',

  'b.caveat': '<strong>这一段完全不解 Grad–Shafranov。</strong>击穿是等离子体存在之前的阶段，场只由线圈电流线性决定，所以「设计一个场零」是一个小的最小二乘问题，不是套在求解器外面的迭代——这也是它是整条链里最便宜的能力的原因。',

  'b.result': '设计结果',
  'b.coils': 'PF 通道电流与上限 [kA·匝]',
  'b.row.bmax': '圆盘上 |B<sub>pol</sub>| 最大',
  'b.row.brms': '圆盘上 |B<sub>pol</sub>| RMS',
  'b.row.bcentre': '中心 |B<sub>pol</sub>|',
  'b.row.tol': '容差',
  'b.row.ok': '是否达判据',
  'b.row.flux': '场零处磁通',
  'b.row.flux_err': '磁通偏差',
  'b.row.over': '越上限的通道',
  'b.ok.yes': '是',
  'b.ok.no': '否',
  'b.none': '无',

  'b.leg.disc': '判据圆盘',
  'b.band.disc': '判据半径内',
  'b.axis.rad': '离场零的距离 [m]',
  'b.axis.b': '|B_pol| [mT]',
  'b.cross_cap': '极向截面：细线是 |B<sub>pol</sub>| 的等值线——场零就是它们收拢成的那个靶心；虚线圆是判据圆盘；矩形是 PF 线圈，填色表示该路电流。',
  'b.prof_cap': '采样点上的 |B<sub>pol</sub>| 对离场零距离。虚线是容差：判据就是这条线以下。点子散开表示同一半径上各方向并不一样——那正是「场零是一个区域还是一个点」的样子。',

  'b.solving': '正在解场零…',
  'b.done_ok': '场零达判据：圆盘上 |B_pol| 最大 {b} mT ≤ 容差 {tol} mT（{n} 次迭代，{ms} ms）。',
  'b.done_miss': '未达判据：圆盘上 |B_pol| 最大 {b} mT，超过容差 {tol} mT。放宽容差、缩小判据半径，或松开电流上限。（{n} 次迭代，{ms} ms）',
  'b.degenerate': '★这个提法是退化的：只要求「场零」而不要求磁通、也不偏向任何参考电流时，<strong>把所有线圈关掉</strong>就是最优解——解出来的确实全是零电流、零场。请勾选磁通目标或参考电流偏置，问题才有非平凡的答案。',
  'b.fail': '设计失败：{why}',
  'b.none_yet': '还没有可导出的结果。',
  'b.j.export_hint': '把当前场零设计导出为 fyo 语义的 JSON 会话',
  'b.j.import_hint': '导入这一段导出的 JSON 会话（只采纳配置并按它重算）',
  'b.j.imported': '已导入 {name}（{n} 项配置{skipped}），正在按该配置重解…',
});
