// Chinese catalogue for the landing page only.  Kept separate so the two
// tool pages do not download a page of prose they never show.

self.FyI18n.register('zh', {
  // ★三个场景，不是四个。原 <meta description> 里还写着「四个交互演示……装置设计、
  // 控制仿真、物理建模、实验分析」，控制仿真已于 2026-08-22 撤下，而 <meta> 是手写的
  // 死字符串、没人扫得到。收进词条正是为了让它跟着这里一起改。
  'home.desc': '托卡马克建模的三个交互演示，一个典型场景一页：装置设计、物理建模、实验分析。'
             + '打开即用，计算全部在浏览器内完成，不依赖服务端。',
  'home.title': 'fylite 在线演示',
  'home.h1': 'fylite 在线演示',
  'home.sub': '托卡马克集成建模，浏览器内即时求解',
  'home.lead': '三个可交互的托卡马克建模场景，按一台装置被完整过一遍的次序排列：<strong>设计</strong>一炮放电、<strong>建模</strong>其剖面演化、由测量<strong>反演</strong>其位形。全部计算在本机浏览器内完成，无需安装、无需服务端；多数控件即拖即得（零维毫秒量级，平衡类一至二秒），仅建模场景的自洽平衡—输运一栏属<strong>离线档</strong>（秒量级），须显式启动。',


  //: ★阶段是**状态**不是名字，故与站名分开说一次：页脚每页都带，这一行是入口页
  //: 上说给第一次来的人听的那一遍。
  'home.alpha': '<strong>本站为 alpha 版。</strong>功能与数值口径仍在变动，接口、页面与结果格式'
             + '都可能在没有迁移路径的情况下改变；每一项能力的验证依据与已知边界见'
             + '<a href="features.html">物理功能与边界</a>。',
  'home.scope.li5': '零维层不含输运求解：分析档剖面为规定剖面，预测档仅闭合零维能量平衡；二者<strong>均非</strong>一维输运预测。',


  'home.scope.h2': '适用范围与免责',
  'home.scope.li1': '本发行版仅内置一台装置的位形与固定计算区域（ITER 装置描述，<strong>不含参考放电</strong>）；其余装置为<strong>输入</strong>，经工具条的装置控件导入。',
  'home.scope.li2': '重构模型不含真空室涡流等自由度；正解所用剖面参数与既有重构程序的同名参数并非同一量。与既有结果数个百分点的差异主要源于上述模型简化，而非求解精度。',
  'home.scope.li3': '自由边界解所得位形通常判定为限制器边界；X 点约束改变的是磁场结构，并不强制将边界改判为偏滤器位形。',
  'home.scope.li4': '<strong>本站为能力演示，非工程设计工具。</strong>此处给出的位形与剖面不得作为任何装置的设计依据。',


  'home.run.h2': '运行方式与数据',
  'home.run.p': '全部计算在访问者本机的浏览器内执行。页面不向任何服务器提交数据：所设参数与所得结果均不离开本机，关闭页面即消失。首次访问需下载一份计算内核（WebAssembly），其后每次求解均为本地执行。',
  'home.two.h2': 'fylite 与 FyTok：一份契约的两级实现',
  'home.two.p1': 'fylite 不是一个独立的程序，而是<strong>本体层 fyo 语义契约</strong>的<strong>轻型实现</strong>。同一份契约还有一个重型实现——<a href="https://github.com/fusion-yun/fytok">FyTok</a>，Python 写的完整集成建模框架。契约以 IMAS 数据字典（DD v4）语义为底，物理量按语义路径寻址，因此两边说的是同一套话。',
  'home.two.col.lite': 'fylite（轻型端，就是这里）',
  'home.two.col.tok': 'FyTok（重型端）',
  'home.two.row.what': '是什么',
  'home.two.lite.what': '自足的平衡—输运—湍流内核：Grad-Shafranov 正解与反解、1.5D 芯部输运、新经典（NEO）与回旋朗道流体（TGLF）、0D 集成、磁测量重构',
  'home.two.tok.what': '完整的集成建模与分析框架：插件机制、工作流调度、异构执行、可追溯，兼容新旧代码',
  'home.two.row.how': '怎么装',
  'home.two.lite.how': '无插件机制，物理项<strong>内建</strong>；Rust 内核 + 一层 Python 装配；依赖只有 numpy',
  'home.two.tok.how': '平衡 / 输运 / 源项等按<strong>插件</strong>注册，原生实现、外部程序封装与 NN 代理可无缝互换',
  'home.two.row.where': '在哪跑',
  'home.two.lite.where': '单机，或<strong>直接在浏览器里</strong>——同一份内核编译成 WebAssembly，免安装，数据不出本机',
  'home.two.tok.where': '超算 / 云计算',
  'home.two.row.cost': '一次多久',
  'home.two.lite.cost': '亚秒级（单次自由边界正解约 0.05 s），拖着滑块就出结果',
  'home.two.tok.cost': '十分钟到数小时',
  'home.two.p2': '★<strong>轻型端同时是重型端的最小功能验证</strong>：两级实现<strong>独立编码</strong>、各自去答同一份契约，因此两边对拍属于<strong>实现间的交叉检验</strong>，而不是自己证自己。模块级则各自对上游参考实现的金标夹具（NEO 端到端 10<sup>−10</sup> 量级、TGLF-NN 51 字段 ≤0.5%），装置级再对 EAST 实炮与 ITER 情景、并与 METIS、FUSE 等程序分级对拍。',
  'home.two.p3': '能力演进是个闭环：轻量端先跑通功能 → 重型端给出高精度参考解 → 由它标定降阶与代理模型 → 再回灌轻量端的快速模型。',

});
