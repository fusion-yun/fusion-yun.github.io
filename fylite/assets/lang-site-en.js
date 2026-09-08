// English prose for the four scenario pages and the landing page.
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
self.FyI18n.register('en', {
  // --- pulse design (the whole pulse; FYL-DESIGN-09 design mode) -----------

  // --- interactive simulation (FYL-DESIGN-09 simulation mode) --------------

  // --- line 1 · discharge design -------------------------------------------

  // --- line 2 · control simulation ----------------------------------------

  // --- line 3 · physics modelling -----------------------------------------
  'ln.model.title': 'Physics modelling · fylite',
  'ln.model.h1': 'Physics modelling / prediction',
  'ln.model.sub': '1.5-D transport · time-dependent evolution (two bars, each with its own run key)',
  'ln.model.lead': 'This scenario works out the <strong>profiles</strong> of a shot: one bar solves a steady state on a fixed geometry and recomputes as you drag, the other marches the heat, particle and current channels <strong>forward in time together</strong> (geometry either frozen or alternating with the free-boundary equilibrium).',
  'ln.model.bound': 'A chain invites the reader to treat the end-to-end result as more authoritative than any of its links, so these sentences stay: the 0-D Q <strong>is not a prediction</strong> (in the analysis tier the density and temperature are yours); the 1.5-D bar\'s <strong>geometry is fixed</strong> and it cannot report a stored energy or a confinement time; the time-dependent bar has <strong>no pedestal model</strong> — the edge is a number you set.',

  // --- line 4 · experiment analysis ---------------------------------------
  'ln.analysis.title': 'Experiment analysis / inversion · fylite',
  'ln.analysis.h1': 'Experiment analysis / inversion',
  'ln.analysis.sub': 'Configuration from measurements · forward operators · uncertainty',
  'ln.analysis.lead': 'This scenario treats "recover the configuration from measurements" as one forward-and-inference problem: flux loops and magnetic probes, POINT interferometry and Faraday rotation, and Thomson density all enter the fit; a pressure profile acts as the kinetic constraint; the error bars come from a sampled posterior.',
  'ln.analysis.bound': '<strong>Magnetics alone do not constrain the internal profiles</strong> — very different profiles fit the field almost equally well, and it is the kinetic constraint that pins the solution down, which is what the "kinetic" in kinetic reconstruction means. The error bars measure <strong>one source only</strong>, the pressure sigma: diagnostic geometry, the device description and the model itself are not in them.',

  // --- landing page: the four lines ---------------------------------------
  'home.lines.h2': 'Four pages',
  'home.lines.lead': 'The demo is <strong>four pages</strong>. The first three are grouped by <strong>what they are for</strong>, in the order a machine is actually worked through: <strong>design to model to inference</strong>. One scenario is one page and one interface: one compute kernel, one toolbar; the page is a stack of <strong>function bars</strong>, and <strong>each bar has its own run key and its own fold</strong> — press the one you want; folding affects reading only. Bars are ordered by the dependencies they declare, and a bar whose upstream has not run yet says so in its strip. \u2605The fourth page, <strong>device data</strong>, is not a scenario and <strong>computes nothing</strong>: no kernel, no run key — it brings you what the machine itself recorded, and it is therefore the one of the four that needs an mdsip server it can reach.',
  // --- pulse design (one page, three modes; FYL-DESIGN-09 D-18..D-21) ---
  'ln.pulse_design.title': 'Pulse design · fylite',
  'ln.pulse_design.h1': 'Pulse design',
  'ln.pulse_design.sub': 'One script · three readings of time: configure · design · simulate',
  'ln.pulse_design.lead': 'This scenario answers <strong>"how should this shot be run, and what happens if it is"</strong>. One script; what the three modes change is <strong>what the time axis means</strong>. <strong>Configure</strong> has no axis — one instant, one solve (the operating point, the coils that hold this boundary, the breakdown null). In <strong>design</strong> the whole pulse already exists and a play-head reads it, giving per-channel current and voltage waveforms. In <strong>simulate</strong> only the past exists, the right-hand edge is now, and a slider edits the future. This shot\u2019s shape, current, phases and heating each have <strong>exactly one control</strong> on the page, read by all three modes.',
  'ln.pulse_design.bound': '★<strong>Which slice was solved and which was not, the page must say</strong>: only the instants you asked to verify get a free-boundary solve; the rest draw the <strong>target</strong> boundary, not the one that would be achieved. ★<strong>A static solution is not "the machine can run this"</strong>: configure mode says a static solution <strong>exists</strong> for this set of targets. ★<strong>A simulation produces a run record, not a design</strong>, and <strong>real time is not promised</strong> — the equilibrium is truly solved every N steps and between them the boundary on screen is the last solved one. ★No mode contains controller gains, delays or noise; the flat-top PF currents are the <strong>steady solution</strong> of the shape-feedback loop.',

  'home.card.scenario.pulse_design.h': 'Pulse design →',
  'home.card.scenario.pulse_design.p': 'One script, three readings of time: configure (one instant, one solve — operating point, inverse shape solve, breakdown), design (the whole pulse → per-channel current and voltage waveforms, a play-head, solved slices told apart from interpolated ones) and simulate (close the switch and the discharge starts; surfaces and profiles evolve, a slider edits the future).',
  'home.card.scenario.model.h': 'Physics modelling / prediction →',
  'home.card.scenario.model.p': 'How the profiles of a shot come out: 1.5-D core transport at fixed geometry, and the self-consistent loop that feeds the pressure back into a free-boundary equilibrium.',
  'home.card.scenario.analysis.h': 'Experiment analysis / inversion →',
  'home.card.scenario.analysis.p': 'Recover the equilibrium from flux loops, magnetic probes, POINT and Thomson, with a pressure profile as the kinetic constraint and error bars from a sampled posterior.',
  'home.card.tool.data.h': 'Device data →',
  'home.card.tool.data.p': 'Look straight at the machine\u2019s own archive: browse an MDSplus tree, name a shot, pull the signals you pick. \u2605This page <strong>computes nothing</strong> — what it shows is what the device recorded, not a result of ours — and it therefore needs an mdsip server it can reach: open it in the single-file viewer (<code>fy --mdsip host:port</code>), or fill one in on the page.',
  'home.card.tool.report.h': 'Case report →',
  'home.card.tool.report.p': 'Render the record of one case (a fyo plan + an spo record with its outputs inline on the ports) as a report: parameters, ports, readings, line charts against each quantity\u2019s own coordinate, and the poloidal section when a boundary outline is on the record. \u2605This page <strong>computes nothing</strong> — what is drawn is decided by a presentation specification; without one it derives the same spec <code>fylite cases --report</code> writes beside its report.',
  // --- the v2 page shell (assets/shell.js) --------------------------------
  'shell.lead.more': 'more ▾',
  'shell.lead.less': 'less ▴',
  'shell.blocked': 'blocked',
  'shell.empty.title': 'No traces yet.',
  'shell.empty.gateway': 'This page needs a process that can open a socket — point it at an mdsip server first.',
  'shell.empty.pick': 'Pick a few signals in the tree on the left, then press Fetch.',
  'shell.empty.fetch': 'Signals selected — press Fetch to bring them over.',
  'shell.empty.noresult': 'This bar has no result yet.',
  'shell.empty.run': 'Press the run key that belongs to “{bar}”.',
  'shell.empty.runany': 'Open a function bar and press its own run key.',
});
