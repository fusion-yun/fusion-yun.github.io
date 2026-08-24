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
  // --- line 1 · discharge design -------------------------------------------
  'ln.design.title': 'Discharge design · fylite',
  'ln.design.h1': 'Discharge design',
  'ln.design.sub': 'Operating point · shape · coil currents and voltage waveforms',
  'ln.design.lead': 'This scenario answers: for a shot like this, <strong>which operating point, can the shape be solved for, and can the supplies deliver it</strong>. Four function bars answer those three questions in turn, and the flat-top current is the one control they share.',
  'ln.design.bound': '<strong>Every shape solved for here is static</strong> — what comes out is "for these targets a static solution <strong>exists</strong>", not "the machine can be run this way". The pulse-trajectory bar puts the time axis back for the <strong>circuits</strong> only; transport in the plasma itself, the time-domain response of a vertical displacement and feedback control are in none of the four bars.',

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
  'home.lines.h2': 'Three scenarios',
  'home.lines.lead': 'The demos are grouped by <strong>what they are for</strong> into three scenarios, in the order a machine is actually worked through: <strong>design to model to inference</strong>. One scenario is one page and one interface: one compute kernel, one toolbar; the page is a stack of <strong>function bars</strong>, and <strong>each bar has its own run key and its own fold</strong> — press the one you want; folding affects reading only. Bars are ordered by the dependencies they declare, and a bar whose upstream has not run yet says so in its strip.',
  'home.card.scenario.design.h': 'Discharge design →',
  'home.card.scenario.design.p': 'Which operating point, can the shape be solved for, and can the supplies deliver it. The 0-D bar fixes the point (I<sub>p</sub>, loop voltage, fusion power, Q); the shape bar solves the coil currents for a target cross-section and checks them forward; the pulse bar gives the per-channel current and voltage.',
  'home.card.scenario.model.h': 'Physics modelling / prediction →',
  'home.card.scenario.model.p': 'How the profiles of a shot come out: 1.5-D core transport at fixed geometry, and the self-consistent loop that feeds the pressure back into a free-boundary equilibrium.',
  'home.card.scenario.analysis.h': 'Experiment analysis / inversion →',
  'home.card.scenario.analysis.p': 'Recover the equilibrium from flux loops, magnetic probes, POINT and Thomson, with a pressure profile as the kinetic constraint and error bars from a sampled posterior.',
});
