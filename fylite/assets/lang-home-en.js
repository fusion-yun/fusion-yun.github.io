// English catalogue for the landing page only.

self.FyI18n.register('en', {
  'home.desc': 'Three interactive tokamak-modelling demos, one typical scenario per page: '
             + 'machine design, physics modelling, experiment analysis. Open and use — every '
             + 'computation runs in the browser, with no server behind it.',
  'home.title': 'fylite online demos',
  'home.h1': 'fylite online demos',
  'home.sub': 'Tokamak integrated modelling, solved in the browser',
  'home.lead': 'Three interactive tokamak modelling scenarios, ordered as a device is actually worked through: <strong>design</strong> a discharge, <strong>model</strong> the evolution of its profiles, and <strong>infer</strong> its configuration back from measurements. Every computation runs locally in the browser — nothing to install, no server involved. Most controls answer while being dragged (milliseconds for 0-D, one to two seconds for equilibria); only the self-consistent equilibrium–transport bar of the modelling scenario belongs to the <strong>offline tier</strong> (seconds) and must be started explicitly.',


  'home.alpha': '<strong>This is an alpha release.</strong> Capabilities and numerical '
             + 'conventions are still moving: interfaces, pages and result formats may change '
             + 'without a migration path. What each capability is judged by, and where its '
             + 'limits are, is on <a href="features.en.html">capabilities and limits</a>.',
  'home.scope.li5': 'The 0-D layer performs no transport solve: the analysis tier prescribes its profiles and the prediction tier closes only a zero-dimensional energy balance. <strong>Neither is a 1-D transport prediction.</strong>',


  'home.scope.h2': 'Scope and disclaimer',
  'home.scope.li1': 'This distribution embeds the configuration and computational domain of a single device (the ITER machine description, <strong>without a reference discharge</strong>). Any other device is an <strong>input</strong>, imported through the device control in the toolbar.',
  'home.scope.li2': 'The reconstruction model carries no vessel-eddy degrees of freedom, and the profile parameters of the forward solve are not the like-named parameters of established reconstruction codes. Differences of a few per cent against published results arise from these simplifications rather than from solver accuracy.',
  'home.scope.li3': 'Configurations obtained from the free-boundary solve are usually classified as limiter-bounded; an X-point constraint changes the field structure and does not force the boundary to be reclassified as diverted.',
  'home.scope.li4': '<strong>This site is a capability demonstration, not an engineering design tool.</strong> The configurations and profiles obtained here must not be used as a design basis for any device.',


  'home.run.h2': 'Execution and data',
  'home.run.p': 'All computation is executed in the visitor own browser. No data is submitted to any server: the parameters set and the results obtained never leave the machine, and are discarded when the page is closed. A single compute kernel (WebAssembly) is downloaded on the first visit; every solve thereafter is local.',
  'home.two.h2': 'fylite and FyTok: one contract, two implementations',
  'home.two.p1': 'fylite is not a standalone program but the <strong>light implementation</strong> of the <strong>fyo semantic contract</strong>. The same contract has a heavy implementation — <a href="https://github.com/fusion-yun/fytok">FyTok</a>, a full integrated-modelling framework in Python. The contract sits on the semantics of the IMAS Data Dictionary (DD v4) and addresses physical quantities by semantic path, so the two speak the same language.',
  'home.two.col.lite': 'fylite (the light end — this site)',
  'home.two.col.tok': 'FyTok (the heavy end)',
  'home.two.row.what': 'What it is',
  'home.two.lite.what': 'A self-contained equilibrium–transport–turbulence kernel: Grad-Shafranov forward and inverse, the 1.5-D core transport step, neoclassical (NEO) and gyro-Landau-fluid (TGLF) models, 0-D integration, magnetic reconstruction',
  'home.two.tok.what': 'A full integrated modelling and analysis framework: plugins, workflow scheduling, heterogeneous execution, provenance, and interoperation with existing codes',
  'home.two.row.how': 'How it is assembled',
  'home.two.lite.how': 'No plugin machinery — the physics is <strong>built in</strong>; a Rust kernel with a thin Python assembly layer; numpy is the only dependency',
  'home.two.tok.how': 'Equilibrium / transport / sources register as <strong>plugins</strong>: native implementations, wrapped external codes and NN surrogates are interchangeable',
  'home.two.row.where': 'Where it runs',
  'home.two.lite.where': 'One machine — or <strong>the browser itself</strong>: the same kernel compiled to WebAssembly, nothing to install, nothing leaves your computer',
  'home.two.tok.where': 'HPC clusters and the cloud',
  'home.two.row.cost': 'One run',
  'home.two.lite.cost': 'Sub-second (a free-boundary forward solve is about 0.05 s) — answers while you drag the slider',
  'home.two.tok.cost': 'Ten minutes to hours',
  'home.two.p2': '★<strong>The light end doubles as the heavy end\'s minimal functional verification.</strong> The two are <strong>coded independently</strong> against the same contract, so comparing them is a <strong>cross-check between implementations</strong> rather than a code confirming itself. Below that, each module is held to gold fixtures from its upstream reference (NEO end-to-end at the 10<sup>−10</sup> level, TGLF-NN 51 fields within 0.5%), and above it the chain is compared against EAST shots, ITER scenarios and codes such as METIS and FUSE.',
  'home.two.p3': 'The two ends form a loop: the light end gets a capability working, the heavy end produces the high-accuracy reference solution, that solution calibrates reduced and surrogate models, and those go back into the light end as fast models.',

});
