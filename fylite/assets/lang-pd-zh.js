// 放电设计页 (`pulse_design`) 页面级词条（zh）。
//
// 这一份只装三个模式共用的东西：这一炮的控件、加热与限值、模式开关本身。
// 每个模式自己的词条仍在它自己的目录里（`lang-zerod-*` / `lang-design-*` /
// `lang-breakdown-*` / `lang-pulse-*` / `lang-sim-*`）——合并的是页面，不是
// 三份各自说话的措辞。
self.FyI18n.register('zh', {
  'pd.shot': '这一炮（三个模式共用）',
  'pd.ip': '平顶电流 I<sub>p</sub> [kA]',
  'pd.r0': '大半径 R<sub>0</sub> [m]',
  'pd.a': '平顶小半径 a [m]',
  'pd.kappa': '拉长比 κ',
  'pd.du': '上三角度 δ<sub>u</sub>',
  'pd.dl': '下三角度 δ<sub>l</sub>',
  'pd.t_bd': '击穿 [s]',
  'pd.t_ru': '斜坡结束 [s]',
  'pd.t_ft': '平顶结束 [s]',
  'pd.t_end': '放电结束 [s]',
  'pd.a0': '起始小半径比 a₀/a',
  'pd.a1': '收尾小半径比 a₁/a',
  'pd.shot.note': '★<strong>一个量一个控件</strong>：位形、电流与相位在这一页上'
    + '各只出现一次，三个模式读的是它同一份。合并之前相位时刻在「0-D 工况」与'
    + '「PF 波形设计」两条栏里各有一组输入框，两处填得不一样时页面不会说——而'
    + '两条栏报的是<strong>同一条放电</strong>。★相位与梯形由内核的'
    + ' <code>zerod_waveform</code> 单源给出，页面不写第二遍；'
    + '<strong>下降沿有自己的自变量</strong>（a₁/a），它不是上升沿取负。'
    + '★这两块住在功能栏<strong>之外</strong>：栏一折就把自己的面板收起来，'
    + '共用控件若住在里面，折起一条栏会连另外两个模式的输入一起看不见。',
  'pd.drive': '等离子体 · 加热 · 限值（三个模式共用）',
  'pd.ne': '中心密度 n<sub>e0</sub> [10<sup>19</sup> m<sup>−3</sup>]',
  'pd.te': '中心温度 T<sub>e0</sub> [keV]',
  'pd.paux': '辅助加热 P<sub>aux</sub> [MW]',
  'pd.t_on': '加热开 [s]',
  'pd.t_off': '加热关 [s]',
  'pd.hfac': 'H 因子',
  'pd.phiavail': '可用磁通摆幅 [Wb]（0 = 未声明）',
  'pd.z0': '磁轴高度 Z<sub>0</sub> [m]',
  'pd.icap': '通道电流上限 [kA·匝]（0 = 未声明）',
  'pd.vcap': '通道电压上限 [V/匝]（0 = 未声明）',
  'pd.drive.note': '★<strong>同一个滑块，两种语义</strong>：设计模式里改的是'
    + '整条波形（全程重算），仿真模式里改的是<strong>从现在起</strong>的驱动'
    + '——过去不重算。★两个「未声明」不是缺省值：限值缺表时页面写明'
    + '「上限是你给的一个统一值」，磁通摆幅未声明时可维持时长报'
    + '<strong>未知</strong>，而不是拿一个好看的数顶替。',
  'pd.mode': '模式',
  'pd.mode.configure': '配置 configure',
  'pd.mode.design': '设计 design',
  'pd.mode.simulate': '仿真 simulate',
  'pd.mode.note.configure': '<strong>时间轴：没有。</strong>一个时刻，一个解'
    + '——0-D 工况、持住这条边界的线圈电流、击穿场零，各有各的判据。'
    + '改一个控件就重解这一刻，没有「之后」可言。',
  'pd.mode.note.design': '<strong>时间轴：整条已存在</strong>，播放头在其中来回读。'
    + '解过的片打点，其余是插值——面板逐片说明它是哪一种，而不是让一条光滑的'
    + '曲线替两者作答。',
  'pd.mode.note.simulate': '<strong>时间轴：只有过去</strong>，右缘是现在，'
    + '右边留白是尚未算出的部分。滑块改的是未来；不操作则演化到定态，'
    + '而能维持多久由磁通预算说，不由这一页承诺。',
});
