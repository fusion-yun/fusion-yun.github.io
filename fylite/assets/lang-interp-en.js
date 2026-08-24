// Message catalogue for the interpretive power-balance bar (en).
(function (root) {
  'use strict';
  root.FyI18n.register('en', {
  "nav.interp": "Interpretive power balance",

  "i.setup": "Geometry and grid",
  "i.setup_note": "★This bar <strong>solves no equation</strong>: it puts the imported profiles on this metric and runs the very same energy balance the time-dependent bar integrates <strong>backwards</strong>, for chi. ★The profiles come from <strong>the time-dependent bar's import</strong> (“reference profile CSV” in the import menu) — one document per page, read by both bars, so nobody ends up comparing against one table while calibrating against another. ★<strong>No extrapolation</strong>: when the table's radial span does not cover this metric the bar <strong>refuses</strong> rather than filling in the edge — inverting an invented profile gives an invented chi.",
  "i.gradfloor": "Gradient floor (fraction of the characteristic gradient)",
  "i.sources": "The sources holding that profile up",
  "i.vloop": "Loop voltage V<sub>loop</sub> [V] (0 = no Ohmic term)",
  "i.src_note": "★<strong>The chi you get back is only as good as the sources you give</strong> — that is the honest statement of every interpretive analysis, not a caveat peculiar to this one. ★Megawatts are megawatts: the Gaussian is normalised by its volume integral. ★The alphas and the radiation are computed from <strong>the imported profiles themselves</strong> (Bosch-Hale reactivity, ADAS cooling rates), not from any march's state. ★<strong>The Ohmic term uses a prescribed loop voltage</strong>: E<sub>∥</sub> = V<sub>loop</sub>/(2πR<sub>0</sub>) with the Spitzer conductivity of these profiles. It is not the time-dependent bar's lagged rate — there a psi is moving, here none is. V<sub>loop</sub> = 0 leaves the Ohmic term out.",

  "i.scope": "★<strong>This bar solves the inverse problem</strong>: given profiles n, T and a source density Q, the surface heat flux q follows from <em>∂/∂ρ(V′⟨|∇ρ|⟩q) = V′Q</em> and the effective diffusivity from <em>q = −⟨|∇ρ|²⟩ n χ ∂T/∂ρ</em>. The flux uses ⟨|∇ρ|⟩ (gm7) and the conduction law ⟨|∇ρ|²⟩ (gm3) — upstream's convention and <strong>not a typo</strong>, which is why a profile produced by a constant-χ₀ conduction solve inverts to χ₀/gm7.",
  "i.caveat": "★<strong>This is not a fit and not a prediction</strong>: nothing is minimised, and the answer is the algebraic inversion of that energy balance. ★<strong>Where the gradient is too flat there is no answer</strong>: below the gradient floor (a fraction of the characteristic gradient max|T|/span; upstream uses 1e-3) the points come back as <code>NaN</code> and appear as gaps — dividing there is dividing by noise, and filling it in would report the flattest part of the profile as its most anomalous. ★<strong>Both the near-axis region and the boundary are ill-conditioned, for different reasons.</strong> Measured by round trip against a profile made with a known chi0 (31-point grid; the quantity is chi·gm7 against chi0): <strong>near the axis</strong> V′ goes to zero and the flux is the ratio of two small numbers — rho/a = 0.03 is 50 % high, 0.07 is 6.8 %, 0.10 is 2.6 %, and by 0.15 it is under 1 %; <strong>at the boundary</strong> the last two nodes carry a one-sided difference — rho/a = 0.97 is 17 % low and the edge node 110 % high. Between them (0.15 ≤ rho/a ≤ 0.93) the round trip recovers chi0 to <strong>better than a per cent</strong>. ★So the end nodes are <strong>still plotted</strong> but do <strong>not</strong> enter the volume average, while the near-axis nodes do — the V′ weight already makes them almost irrelevant to it. Quietly dropping points is as bad as quietly keeping them, which is why the readings say how many entered it. ★<strong>One thermal ion species</strong>; χ is an <strong>effective</strong> diffusivity (neoclassical, turbulent and convective transport all inside it, inseparable); there is no pinch term (convection is folded into χ); no pedestal and no SOL. ★This bar and the time-dependent one are a <strong>pair</strong>: chi comes out here and goes in there. They share one balance equation, so agreement between them is the least one should expect.",

  "i.chi_cap": "Effective diffusivity χ (gaps = gradient below the floor, no answer)",
  "i.prof_cap": "The profiles being inverted (the imported ones)",
  "i.flux_cap": "Surface heat flux q (power balance)",
  "i.power_cap": "Cumulative power P(ρ) (volume integral of the source)",
  "i.result": "What came back",

  "i.row.chie": "⟨χ<sub>e</sub>⟩ (volume average, end nodes excluded)",
  "i.row.chii": "⟨χ<sub>i</sub>⟩ (volume average, end nodes excluded)",
  "i.row.chie_half": "χ<sub>e</sub>(ρ/a = 0.5)",
  "i.row.chii_half": "χ<sub>i</sub>(ρ/a = 0.5)",
  "i.row.valid": "Valid points / grid points",
  "i.row.used": "Points entering the average / grid points",
  "i.row.w": "Thermal energy W<sub>th</sub>",
  "i.row.taue": "τ<sub>E</sub> = W/(P<sub>in</sub>−P<sub>rad</sub>)",
  "i.row.paux": "Auxiliary heating P<sub>aux</sub>",
  "i.row.palpha": "Alpha heating",
  "i.row.prad": "Radiation (total)",
  "i.row.pohm": "Ohmic",
  "i.row.geo": "Geometry source",

  "i.ready": "Kernel ready — import a reference profile in the time-dependent bar first, then press this bar's key.",
  "i.running": "Inverting…",
  "i.done": "Done: {n}/{m} grid points have an answer · ⟨χ<sub>e</sub>⟩ = {chie} m²/s · ⟨χ<sub>i</sub>⟩ = {chii} m²/s · {ms} ms",
  "i.fail": "Failed: {why}",
  "i.none_yet": "Nothing inverted yet.",
  "i.verdict.some": "★{bad} points sit below the gradient floor and have <strong>no answer</strong> there (the gaps in the figure) — not zero, and not a large number.",
  "i.verdict.all": "★All {n} grid points are above the gradient floor.",

  "i.j.export_hint": "★Writes the whole inversion out: the <strong>surface metric (gm7 and gm3 included)</strong>, the profiles that were inverted, the chi that came back with its <strong>validity flags</strong>, and the sources and surface heat fluxes — all as fyo groups (equilibrium / core_profiles / core_transport / core_sources). A chi without its metric cannot be checked by anyone, including whoever feeds it to the time-dependent bar.",
  "i.j.import_hint": "Reads one of this bar's session files back: <strong>controls only</strong>, nothing is recomputed.",
  "i.j.imported": "Loaded “{name}”: {n} controls set. <strong>Nothing was recomputed</strong> — press the key to run.",
  "i.err.noref": "No reference profile yet: feed a CSV (columns rho / TE / TI / NE) through the import button on the time-dependent bar — that is the document this bar reads.",
  "i.err.nogm7": "This geometry does not provide ⟨|∇ρ|⟩, so the power balance has no flux term and this bar refuses.",
  "i.err.span": "The reference profile covers only ρ = {lo} to {hi} m while this metric reaches {need} m. <strong>No extrapolation</strong>: inverting a filled-in profile gives a filled-in chi. Use a table that covers it, or change the grid or the geometry to one it does cover.",
  });
})(typeof self !== 'undefined' ? self : this);
