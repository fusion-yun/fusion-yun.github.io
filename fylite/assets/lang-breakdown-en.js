// English catalogue for the breakdown / field-null bar only.
//
// ★Reconnected (T-D14): the verdict / per-channel-limit family
// (`b.verdict.*`, `b.col.*`, `b.lim*`, `b.row.bind`, `b.at_bound`,
// `err.dn.maxiter`) never left the MAIN catalogue — only this file was
// dropped with the old page — so those keys stay where they are and this
// file carries the rest, exactly as before.

self.FyI18n.register('en', {
  'nav.breakdown': 'Breakdown null',

  'b.target': 'Null position and criterion',
  'b.radius': 'Criterion radius [m]',
  'b.btol': '|B<sub>pol</sub>| tolerance [mT]',
  'b.crit_note': 'The criterion is the standard one: |B<sub>pol</sub>| below a few mT everywhere on a disc of a few tens of centimetres around the null — Townsend avalanche needs the connection length long enough, and in practice that is written this way. ★The threshold is a <strong>parameter, not a constant</strong>: it depends on the machine and the fill gas, so it is yours to set.',

  'b.flux': 'Flux budget',
  'b.useflux': 'Require a poloidal flux at the null',
  'b.fluxt': 'Target flux [Wb]',
  'b.flux_note': 'The null decides whether breakdown happens at all; the flux budget decides how far the current can be driven afterwards. Both are linear in the coil currents, so the second is just one more equality row in the same least-squares.',

  'b.tradeoff': 'Trade-off and limits',
  'b.wnull': 'Null weight',
  'b.wflux': 'Flux weight',
  'b.uselimits': 'Apply a current limit',
  'b.imax': 'Limit [kA·turns]',
  'b.usexref': 'Bias toward the reference discharge',
  'b.limit_note': '★<strong>The rows carry different units and each family must be normalised by its own tolerance</strong>: the null rows are in tesla (~1e-3), the flux row in weber (~1e-1). Left raw, the flux term swamps the null and the “design” comes back as a uniform field rather than a null. Normalised, a residual of 1 means “at tolerance” in either, and the two weights express a real trade-off instead of a unit accident.<br>★The device descriptor carries <strong>no</strong> per-supply current limit, so this is a single figure you supply, not machine data.',

  'b.caveat': '<strong>Nothing in this stage solves Grad–Shafranov.</strong> Breakdown is the phase before a plasma exists; the field is linear in the coil currents, so “design a null” is one small least-squares problem rather than an outer loop around a solver — which is why it is the cheapest capability in the chain.',

  'b.result': 'Design result',
  'b.coils': 'PF channel currents and limits [kA·turns]',
  'b.row.bmax': 'max |B<sub>pol</sub>| on the disc',
  'b.row.brms': 'RMS |B<sub>pol</sub>| on the disc',
  'b.row.bcentre': '|B<sub>pol</sub>| at the centre',
  'b.row.tol': 'Tolerance',
  'b.row.ok': 'Criterion met',
  'b.row.flux': 'Flux at the null',
  'b.row.flux_err': 'Flux error',
  'b.row.over': 'Channels over the limit',
  'b.ok.yes': 'yes',
  'b.ok.no': 'no',
  'b.none': 'none',

  'b.leg.disc': 'Criterion disc',
  'b.band.disc': 'Inside the radius',
  'b.axis.rad': 'Distance from the null [m]',
  'b.axis.b': '|B_pol| [mT]',
  'b.cross_cap': 'Poloidal cross-section. Light lines are contours of |B<sub>pol</sub>| — the null is the bullseye they close on; the dashed circle is the criterion disc; rectangles are PF coils, shaded by channel current.',
  'b.prof_cap': '|B<sub>pol</sub>| at the sampled points against distance from the null. The dashed line is the tolerance — the criterion is simply “below it”. Spread at one radius means the field is not the same in every direction there, which is what “is the null a region or a point” looks like.',

  'b.solving': 'Solving for the null…',
  'b.done_ok': 'Criterion met: max |B_pol| on the disc is {b} mT, at or below the {tol} mT tolerance ({n} iterations, {ms} ms).',
  'b.done_miss': 'Criterion not met: max |B_pol| on the disc is {b} mT against a {tol} mT tolerance. Loosen the tolerance, shrink the radius, or raise the current limit. ({n} iterations, {ms} ms)',
  'b.degenerate': '★This problem as posed is degenerate: asking only for a null, with no flux requirement and no bias toward a reference, is solved exactly by <strong>switching every coil off</strong> — and that is what came back, zero current and zero field. Tick the flux target or the reference bias to make the question non-trivial.',
  'b.fail': 'Design failed: {why}',
  'b.none_yet': 'Nothing to export yet.',
  'b.j.export_hint': 'Export this null design as an fyo-semantic JSON session',
  'b.j.import_hint': 'Import a JSON session exported from this stage (configuration only; it is re-solved)',
  'b.j.imported': 'Imported {name} ({n} settings{skipped}); re-solving…',
});
