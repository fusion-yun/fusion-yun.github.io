// English catalogue for the credits page only — copyright, provenance,
// acknowledgements, references.  Kept separate so the demo pages do not
// download a page of prose they never show.
//
// ★The authority is the repository's own LICENSE / NOTICE / ACKNOWLEDGEMENTS;
// this page is their reader-facing summary and links back to all four.  A
// claim here that the NOTICE does not make is a bug, not a wording choice.

self.FyI18n.register('en', {
  'cr.desc': 'Copyright, licence (Apache-2.0), the upstream provenance of every white-box port, '
           + 'the sources of the comparison data, acknowledgements and references.',
  'cr.title': 'Copyright and credits · fylite',
  'cr.h1': 'Copyright and credits',
  'cr.sub': 'Licence · provenance · acknowledgements · references',
  'cr.lead': 'This page states three things: the <strong>copyright and licence</strong> of this project, the <strong>provenance</strong> of each physics module, and the work that is owed acknowledgement. The per-file attribution of record is the repository NOTICE; this page is its readable summary, and every statement made here should be traceable to <code>NOTICE</code> or <code>ACKNOWLEDGEMENTS.md</code>.',

  'cr.license.h2': 'Copyright and licence',
  'cr.license.p': 'fylite is developed at the Institute of Plasma Physics, Chinese Academy of Sciences (ASIPP) and released under the <strong>Apache License 2.0</strong>. Use, modification and redistribution are permitted, commercial use included, provided the copyright notice and <code>NOTICE</code> are retained and the changes made are stated.',
  'cr.license.files': '★This page — the browser demos under <code>app/</code> — and the <code>.wasm</code> kernels it loads are under the same licence: the kernels are compiled from this repository\'s Rust sources, and each artifact\'s sha256 and provenance are recorded in the repository documentation, so they can be checked byte for byte.',


  'cr.parent.h2': 'The parent project: FyTok',
  'cr.parent.p': 'fylite is the <strong>lightweight edition</strong> of <a href="https://github.com/fusion-yun/fytok">FyTok</a>, its <strong>parent project</strong> (also <strong>Apache-2.0</strong>, Institute of Plasma Physics, Chinese Academy of Sciences): a full tokamak integrated-modelling framework in Python, with plugins, workflow scheduling, heterogeneous execution and provenance, aimed at HPC and the cloud. Both implement the <strong>fyo semantic contract</strong>; fylite takes the light end — the key solvers rewritten in Rust and run in the browser through WebAssembly with nothing to install — and <strong>doubles as FyTok\'s minimal functional verification</strong>: the two are coded independently against the same contract, so comparing them is a <strong>cross-check</strong> rather than a code confirming itself. The core-transport channel grammar is taken from FyTok\'s <code>fytrans</code> (see the table below), which is also the bit-for-bit anchor of the transport step.',

  'cr.port.h2': 'Ports and provenance',
  'cr.port.lead': 'The modules below are <strong>white-box translations</strong> of upstream code, not independent reimplementations from the literature. The distinction is a licence obligation and is therefore stated in the body of this page rather than in a footnote.',
  'cr.port.col.up': 'Upstream',
  'cr.port.col.who': 'Authors / institution',
  'cr.port.col.lic': 'Licence',
  'cr.port.col.what': 'What fylite took',
  'cr.port.who.gacode': 'General Atomics and the GACODE contributors',
  'cr.port.who.fytok': 'Institute of Plasma Physics, CAS (fylite\'s parent project)',
  'cr.port.lic.vianeo': 'via NEO',
  'cr.port.geo': 'local flux-surface geometry (Miller-class shape and metric)',
  'cr.port.neo': 'analytic neoclassical models and the drift-kinetic solve',
  'cr.port.tglf': 'the gyro-Landau-fluid model, FLR fit tables, trapped-closure tables',
  'cr.port.tgyro': 'NEO / TGLF input maps, sources and radiation, volume integrals, the input.gacode reader',
  'cr.port.nclass': 'neoclassical coefficients as carried by NEO',
  'cr.port.metis': 'the fast neutral-beam model: chord attenuation, Janev stopping cross-sections, Stix critical energy and beam-driven current',
  'cr.port.fytrans': 'the channel declaration grammar, kept identical so a declaration round-trips between the parent project and this one; the 1.5-D transport core is anchored bit-for-bit against it',
  'cr.port.changes': '<strong>Statement of changes</strong> (Apache-2.0 §4b): the ports are translations, not copies — module state becomes explicit arguments, LAPACK / UMFPACK become in-tree dense and sparse routines, upstream <code>STOP</code> becomes an error code, and the result is re-entrant. Several points <strong>deliberately differ</strong> from upstream behaviour, mostly where the upstream silently overrides its own inputs; each is marked at its use site in the source.',
  'cr.port.rev': 'Two GACODE revisions coexist, deliberately: GEO / NEO / TGYRO derive from <code>5efddfdf1</code> and TGLF from <code>6357db306</code>, matching the two libraries the ports were checked against. UMFPACK was <strong>not</strong> translated — the sparse LU here is written from scratch.',

  'cr.data.h2': 'Data, oracles and cross-code anchors',
  'cr.data.li1': '<strong>GACODE regression decks and recorded outputs</strong> (the GA standard case, TGYRO treg01, libgeo/libneo/libtglf recordings) — the gold fixtures of the ports (General Atomics, Apache-2.0).',
  'cr.data.li2': '<strong>EAST discharge data and the operational EFIT workflow</strong> — the EAST team at ASIPP; per-channel diagnostic geometry reaches fylite through fydata. None of it ships with the demos.',
  'cr.data.li3': '<strong>The ITER device description and the IMAS Data Dictionary</strong> — ITER Organization, reaching fylite through fyo and fydata; the ITER configuration built into the demos comes from there.',
  'cr.data.li4': '<strong>Cross-code anchors</strong>: 0-D against METIS (CEA/IRFM), ITER scenarios against FUSE, electromagnetics and vertical stability against TokSys (General Atomics). None of those codes is redistributed here.',

  'cr.thanks.h2': 'Acknowledgements',
  'cr.thanks.lead': 'This project rests on physics, code and data that others made public. The debts are acknowledged item by item:',
  'cr.thanks.gacode': '<strong>General Atomics and the GACODE contributors</strong> (J. Candy, E. Belli, G. M. Staebler and colleagues) — upstream of the neoclassical, turbulence and flux-surface-geometry lines; <strong>W. A. Houlberg</strong> (NCLASS, as carried by NEO).',
  'cr.thanks.metis': '<strong>CEA/IRFM and the METIS authors</strong> (J. F. Artaud et al.) — source of the fast neutral-beam model and of the 0-D conventions, and the reference for the 0-D comparison.',
  'cr.thanks.toksys': '<strong>The authors of TokSys</strong> (General Atomics) — cross-code anchor for the electromagnetics and vertical stability.',
  'cr.thanks.east': '<strong>The EAST team at ASIPP</strong> — discharge data, the operational EFIT workflow and per-channel diagnostic geometry.',
  'cr.thanks.kefit': '<strong>G. Q. Li, Q. L. Ren, J. P. Qian, L. L. Lao et al.</strong> — for porting EFIT to EAST and building its kinetic reconstruction (KEFIT), the upstream reference baseline of the reconstruction line here.',
  'cr.thanks.sxr': '<strong>Youwen Sun</strong> — the HT-7 soft-X-ray tomography work (camera-geometry parameterisation and the chord-Green / weighted pseudo-inverse method skeleton).',
  'cr.thanks.corpus': '<strong>Ting Lan</strong> — for curating the EAST experimental data corpus; its per-channel diagnostic geometry reaches this project through fydata.',
  'cr.thanks.pcs': '<strong>Yao Huang and the EAST PCS group</strong> — the plasma-control-system interface note (magnetic-probe geometry and the equilibrium↔PCS variables).',
  'cr.thanks.pc': '<strong>Private communications</strong>: Tianyang Xia (edge and integration), Yemin Hu (equilibrium), Xiaotao Xiao (transport).',
  'cr.thanks.iter': '<strong>The ITER Organization</strong> — the IMAS Data Dictionary and the ITER machine description, reaching this project through fyo and fydata; the ITER configuration built into the demos comes from there.',
  'cr.thanks.papers': '<strong>The authors of the works listed in the following section</strong> — every formula used here names its source; none originates in this project.',
  'cr.thanks.p3': '★If you find work of yours used here and not named, please open an issue — the omission is an error, not a choice.',

  'cr.built.h2': 'How this code was built',
  'cr.built.p': 'The physics modules of fylite were constructed from the public literature and open-source code listed above, <strong>with AI assistance</strong> (Anthropic Claude). Correctness is not claimed from authorship: it is established module by module against <strong>gold fixtures</strong> from the upstream implementations, with the tolerance and its error budget stated. fylite additionally exposes its own interfaces to AI hosts (MCP / JSON-RPC); that is a product feature and a separate matter from how it was written.',

  'cr.refs.h2': 'References',
  'cr.refs.lead': 'Every method used on this site is published method. ★This section previously sat on the entrance page and now lives here: provenance and acknowledgement are one subject and should not be maintained in two places.',
  'cr.refs.eq': 'Equilibrium and reconstruction',
  'cr.refs.gs': 'The equilibrium itself is the Grad–Shafranov equation (Grad and Rubin 1958; Shafranov 1966).',
  'cr.refs.lao': 'Fitting p′/FF′ polynomials to magnetic measurements and alternating with the equilibrium under the plasma-current constraint is the reconstruction framework of Lao et al.:',
  'cr.refs.jardin': 'Free-boundary solving and the stabilisation of the vertical position:',
  'cr.refs.hockney': 'The fast direct solve on a regular grid:',
  'cr.refs.wesson': 'Definitions of the safety factor, the shape quantities and the general tokamak background:',
  'cr.refs.tr': 'Transport and turbulence',
  'cr.refs.sauter': 'Analytic neoclassical conductivity and bootstrap current:',
  'cr.refs.redl': 'The bootstrap recalibration, <strong>kept apart</strong> from the line above — the two readings differ by several per cent:',
  'cr.refs.ch': 'Analytic neoclassical variants and the trapped fraction:',
  'cr.refs.staebler': 'The gyro-Landau-fluid quasilinear transport model (TGLF):',
  'cr.refs.belli': 'Direct solution of the drift-kinetic equation (NEO):',
  'cr.refs.zerod': '0-D modelling, sources and atomic data',
  'cr.refs.ipb': 'Energy-confinement scalings:',
  'cr.refs.bosch': 'D-T reactivity:',
  'cr.refs.martin': 'The L–H threshold power:',
  'cr.refs.artaud': 'The reference code for 0-D integrated modelling, and the source of the fast neutral-beam model:',
  'cr.refs.putterich': 'Impurity radiation cooling curves:',
  'cr.refs.janev': 'Beam stopping and charge-exchange cross-sections:',

  'cr.full.h2': 'The full texts',
  'cr.full.p': 'This page is a summary. The binding, per-file statements are in the repository:',
  'cr.full.license': 'the full Apache License 2.0',
  'cr.full.notice': 'per-file provenance, the statement of changes, and what is not included',
  'cr.full.ack': 'the readable acknowledgement list: upstream code, transcribed formulae, data and fixtures, and what was deliberately not taken',
  'cr.full.contrib': 'maintainers and copyright',
  'cr.full.issue': 'Repository: <a href="https://github.com/fusion-yun/fylite">github.com/fusion-yun/fylite</a>',
});
