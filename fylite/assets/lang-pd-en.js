// Page-level catalogue for the pulse-design page (`pulse_design`), en.
//
// Only what the three modes SHARE lives here: this shot's controls, the
// heating and the declared limits, and the mode switch itself.  Each mode
// keeps its own catalogue — the merge was of the page, not of the wording.
self.FyI18n.register('en', {
  'pd.shot': 'This shot (shared by all three modes)',
  'pd.ip': 'Flat-top current I<sub>p</sub> [kA]',
  'pd.r0': 'Major radius R<sub>0</sub> [m]',
  'pd.a': 'Flat-top minor radius a [m]',
  'pd.kappa': 'Elongation κ',
  'pd.du': 'Upper triangularity δ<sub>u</sub>',
  'pd.dl': 'Lower triangularity δ<sub>l</sub>',
  'pd.t_bd': 'Breakdown [s]',
  'pd.t_ru': 'End of ramp-up [s]',
  'pd.t_ft': 'End of flat top [s]',
  'pd.t_end': 'End of discharge [s]',
  'pd.a0': 'Start minor-radius ratio a₀/a',
  'pd.a1': 'Ramp-down minor-radius ratio a₁/a',
  'pd.shot.note': '★<strong>One quantity, one control.</strong> Shape, current '
    + 'and phases appear once on this page and all three modes read that one '
    + 'copy. Before the merge the phase times had a set of input boxes on the '
    + '0-D bar and another on the PF-waveform bar; fill them in differently and '
    + 'the page said nothing — while both bars were reporting the '
    + '<strong>same discharge</strong>. ★Phases and the trapezoid come from the '
    + "kernel's own <code>zerod_waveform</code>; the page does not write a "
    + 'second copy, and the <strong>ramp-down has its own variable</strong> '
    + '(a₁/a) rather than being the ramp-up negated. ★Both panels live '
    + '<strong>outside</strong> the function bars: a folded bar takes its own '
    + 'panels with it, and a shared control living inside one would take the '
    + "other two modes' inputs with it.",
  'pd.drive': 'Plasma · heating · declared limits (shared by all three modes)',
  'pd.ne': 'Central density n<sub>e0</sub> [10<sup>19</sup> m<sup>−3</sup>]',
  'pd.te': 'Central temperature T<sub>e0</sub> [keV]',
  'pd.paux': 'Auxiliary heating P<sub>aux</sub> [MW]',
  'pd.t_on': 'Heating on [s]',
  'pd.t_off': 'Heating off [s]',
  'pd.hfac': 'H factor',
  'pd.phiavail': 'Available flux swing [Wb] (0 = not declared)',
  'pd.z0': 'Magnetic-axis height Z<sub>0</sub> [m]',
  'pd.icap': 'Per-channel current limit [kA·turn] (0 = not declared)',
  'pd.vcap': 'Per-channel voltage limit [V/turn] (0 = not declared)',
  'pd.drive.note': '★<strong>One slider, two meanings.</strong> In design mode '
    + 'it changes the whole waveform (everything is recomputed); in simulation '
    + 'mode it changes the drive <strong>from now on</strong> — the past is not '
    + 'recomputed. ★Neither "not declared" is a default: with no limit table '
    + 'the page says the cap is a single number you supplied, and with no '
    + 'declared flux swing the sustainable time is reported as '
    + '<strong>unknown</strong> rather than as a presentable number.',
  'pd.mode': 'Mode',
  'pd.mode.configure': 'Configure',
  'pd.mode.design': 'Design',
  'pd.mode.simulate': 'Simulate',
  'pd.mode.note.configure': '<strong>Time axis: none.</strong> One instant, one '
    + 'solve — the operating point, the coil currents that hold this boundary, '
    + 'the breakdown null, each with its own criteria. Change a control and '
    + 'this instant is solved again; there is no "after".',
  'pd.mode.note.design': '<strong>Time axis: the whole pulse already exists</strong> '
    + 'and the play-head reads it. Solved slices are ticked, the rest are '
    + 'interpolated — and each panel says which it is showing rather than '
    + 'letting one smooth curve answer for both.',
  'pd.mode.note.simulate': '<strong>Time axis: the past only.</strong> The right '
    + 'edge is now and the blank to its right has not been computed yet. A '
    + 'slider edits the future; leave it alone and the state evolves to a '
    + 'steady one — how long it can be held is what the flux budget says, not '
    + 'something this page promises.',
});
