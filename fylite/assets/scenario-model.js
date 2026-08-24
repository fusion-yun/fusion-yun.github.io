// The PHYSICS-MODELLING scenario: one page, one worker, one run, three 功能栏.
//
// The scenario is a discharge modelled three ways, in the order each feeds the
// next — and they are BARS of one page, not three demos sharing it:
//
//   0D 放电分析 zerod        定工况：解析地给出 Ip、环电压、聚变功率与 Q
//   1.5D 芯部输运 transport  固定几何下解稳态温度剖面
//   自洽平衡—输运 coupled    自由边界平衡与 1.5D 输运交替推进
//
// ★WHAT THE BARS BUY, and why this file is short about it: the strip over each
// bar (fold, switch, title, state), the run order, the bus between them and the
// folding of every panel are `scenario.js`'s — see its 功能栏 section.  What is
// left here is the physics of each bar and two declarations:
//
//   needs      1.5-D declares that it needs the 0-D bar.  The run order is the
//              TOPOLOGICAL order of that, not the order the sections are
//              written in, and a 1.5-D bar whose 0-D bar is switched off says
//              so in its strip instead of running on stale controls.
//   publish    the 0-D bar publishes its OPERATING POINT — the same deck the
//              export menu writes — and the 1.5-D bar takes it when the page
//              is run as a whole.  ★Only then: dragging a 1.5-D control means
//              "recompute with the values I can see", and taking upstream
//              numbers there would overwrite the control under the hand.
//
// ★The fourth demo this file used to carry — 局域线性稳定性 tglf — is
// WITHDRAWN with its markup, its catalogue and its gate.  It answered a
// different question on a different magnetic surface, and it was never a stage
// of this scenario: nothing here fed it and it fed nothing.  The kernel entry
// is untouched (`fylite.scenario.model.tglf`, and the turbulence closure this
// page's 1.5-D bar can switch on still runs through the same module).


// ==========================================================================
// THE PAGE.  Its bars register below, one per section.
// ==========================================================================

var MODEL = FyScenario.part('model', { lockWhileBusy: ['run'] });


// ==========================================================================
// STAGE  transport — 1.5D 芯部输运
// ==========================================================================

// 1.5D core transport, fixed geometry (FYL-DESIGN-07 排期 3b, S7-FR-TR-1..5).
//
// ★Two borrowed pieces, no third convention.  The flux-surface metric comes
// from the kernel's own `geo_do` (`geoSurface`), and the discretisation is the
// fytrans core transcribed in `transport.js` — each already tied to its native
// counterpart by its own gate.  This file only assembles them and draws.
//
// ★What this page is NOT, stated on the page itself: the geometry is FIXED.
// Nothing here feeds back into an equilibrium, so a temperature that changes
// the pressure does not change the surfaces it lives on.  That is the
// difference between this and `S7-FR-LOOP-1`, and it is a difference in the
// equation being solved, not in how well it is solved.

//: ★DECLARED HERE, RUN AFTER THE MACHINES ARRIVE.  The preset devices are
//: fetched documents now, so `self.FYLITE_MACHINE` is null while this file is
//: being evaluated — and this body reads the machine on its first line.  It is
//: the framework that knows when the machines are in, so it is the framework
//: that calls this.
FyScenario.whenDevices(function () {
  'use strict';

  var T = FyI18n.t;
  var last = null, fy = null;

  var S = MODEL.bar('transport', {
    title: 'nav.transport',
    sliders: { rmaj: 2, kappa: 2, delta: 2, q95: 1, chi0: 2, pinch: 2,
               power: 1, width: 2, edge: 2, n: 0, dpc: 2, nepeak: 2,
               amin: 2, bunit: 1, ne0: 1,
               'turb-nrad': 0, 'turb-nky': 0, 'turb-outer': 0 },
  });
  var $ = S.$, syncLabels = S.sync, setBusy = S.setBusy;

  //: ★★THE GRID IS IN METRES, and that is a correction rather than a
  //: preference.  This bar used to solve on rho = r/a while chi came in as
  //: m^2/s, i.e. an equation missing a factor a^2 — invisible while chi was
  //: a slider (it rescales the source-to-chi ratio) and WRONG the moment a
  //: physical closure supplies it, which the neoclassical and turbulent
  //: tiers do.  The label is the minor radius r [m]: `geo_surface` returns
  //: dV/dr and <|grad r|^2> for the surface it was asked about, so r is the
  //: label whose metrics these ARE.
  function rhoGrid() {
    var n = +$('n').value | 0, a = +$('amin').value;
    var x = new Float64Array(n);
    for (var i = 0; i < n; i++) x[i] = a * i / (n - 1);
    return x;
  }

  /** The same grid as a fraction of the minor radius, for prescriptions. */
  function rhoBar(x, i) { return x[x.length - 1] > 0 ? x[i] / x[x.length - 1] : 0; }

  /**
   * dV/dr on every grid point, from the kernel's own surface solver.
   *
   * ★One call per surface, and the axis is handled by EXTRAPOLATION rather
   * than by evaluating at r = 0: the surface degenerates there and `geo_do`
   * is not asked a question it cannot answer.  V' -> 0 linearly on axis, so
   * the first interval is where the transcription's half-cell rule does its
   * work — faking a value there would quietly change the axis boundary.
   */
  function metrics(x) {
    var q0 = 1.0, qa = +$('q95').value, a = +$('amin').value;
    var rmaj = +$('rmaj').value * a;
    var vp = new Float64Array(x.length), gr = new Float64Array(x.length);
    var shear = new Float64Array(x.length);
    for (var i = 1; i < x.length; i++) {
      var rb = rhoBar(x, i);
      //: a plain parabolic q(r) — this page prescribes the profile rather
      //: than solving current diffusion for it, and says so.  The 含时演化
      //: bar is where q is a RESULT.
      var q = q0 + (qa - q0) * rb * rb;
      var dq = 2 * (qa - q0) * rb;
      shear[i] = rb * dq / q;
      //: metres in, metres out: `geo_do` is scale-covariant, so a surface
      //: given in metres returns dV/dr in m^2 and a dimensionless <|grad
      //: r|^2>.  Handing it r/a is what made chi's own metre disappear.
      var g = fy.geoSurface({
        rmin: x[i], rmaj: rmaj, q: q, shear: shear[i],
        kappa: +$('kappa').value, sKappa: 0, delta: +$('delta').value,
        sDelta: 0, nTheta: 201 });
      vp[i] = g.volumePrime;
      gr[i] = g.fsaGradR2;
    }
    vp[0] = 0; gr[0] = gr.length > 1 ? gr[1] : 1;
    return { vprime: vp, gradR2: gr, qEdge: qa };
  }

  //: ★SI, because that is what the surface block means.  This page used to
  //: convert to the TGYRO port's CGS here — `CM_PER_M`, `G_PER_T`, a
  //: density unit of 1e13 and a deuteron in grams — and every page that
  //: filled the block had to know to do the same.  The conversion is behind
  //: the ABI now (`c_api.rs::surface_from_block`), once, for every entry
  //: that takes the layout.
  var EV_PER_KEV = 1e3;
  //: the `ne0` field is in 1e19 m^-3, and m^-3 is what the block takes
  var NE_UNIT = 1e19;
  //: deuterium mass, kg
  var MD = 3.3435837724e-27;

  /**
   * The physical surface at every grid point, for the neoclassical closure.
   *
   * ★What this page owns and what the kernel owns.  Everything NEO-side —
   * the ion temperature norm, the electron density norm, the deuterium mass
   * norm, `nu_1`, the gyro-Bohm de-normalisation — is the kernel's.  This
   * function supplies PHYSICAL quantities and one unit per point, and that
   * is the whole of its responsibility.
   *
   * ★★The density profile is PRESCRIBED, not solved: this page has one
   * channel and it is the temperature.  Saying so matters because a
   * neoclassical chi depends on density, so a reader could otherwise take
   * the density here for a result.
   */
  function neoBlocks(x, m) {
    var a = +$('amin').value, b = +$('bunit').value, ne0 = +$('ne0').value;
    //: ★the peaking is a CONTROL now.  It was 0.4, written twice, and a
    //: neoclassical chi depends on the density it was hard-coded into.
    var cpk = +$('nepeak').value;
    var n = x.length;
    var surf = new Float64Array(20 * n), ion = new Float64Array(6 * n);
    var chigb = new Float64Array(n);
    var rmaj = +$('rmaj').value * a, kap = +$('kappa').value,
        del = +$('delta').value, q0 = 1.0, qa = +$('q95').value;
    for (var k = 0; k < n; k++) {
      var r = Math.max(rhoBar(x, k), 1e-6);
      var q = q0 + (qa - q0) * r * r;
      var shear = r * (2 * (qa - q0) * r) / q;
      //: prescribed, and said to be so on the page
      var ne = ne0 * (1 - cpk * r * r) * NE_UNIT;
      var dlnnedr = (2 * cpk * r / Math.max(1 - cpk * r * r, 1e-6)) / a; // 1/m
      //: the temperature the block carries is the STARTING one; the kernel
      //: overwrites the first ion's from the iterate at every Picard step,
      //: and the other temperature stays at this profile — this bar solves
      //: ONE channel
      var te = tStart(x, k) * EV_PER_KEV;
      var o = 20 * k;
      surf[o] = a; surf[o + 1] = r * a; surf[o + 2] = rmaj;
      surf[o + 3] = 0; surf[o + 4] = 0; surf[o + 5] = 0;
      surf[o + 6] = q; surf[o + 7] = shear;
      surf[o + 8] = kap; surf[o + 9] = 0;
      surf[o + 10] = del; surf[o + 11] = 0;
      surf[o + 12] = 0; surf[o + 13] = 0;
      surf[o + 14] = b; surf[o + 15] = te; surf[o + 16] = ne;
      surf[o + 17] = dlnnedr; surf[o + 18] = dlnnedr; surf[o + 19] = 0;
      var i6 = 6 * k;
      ion[i6] = 1.0; ion[i6 + 1] = MD;
      ion[i6 + 2] = ne; ion[i6 + 3] = te;
      ion[i6 + 4] = dlnnedr; ion[i6 + 5] = dlnnedr;
      chigb[k] = chiGyroBohm(te, b, a);
    }
    return { surf: surf, ion: ion, nion: 1, signb: -1, signq: 1,
             rhoStar: 0.001, nTheta: 17, tToEv: EV_PER_KEV, chigb: chigb };
  }

  /**
   * The gyro-Bohm diffusivity rho_s^2 c_s / a, in m^2/s.
   *
   * ★The ONE unit this side supplies.  SI throughout, on the deuterium mass
   * — the same mass the kernel normalises to, which is why the two halves
   * compose instead of differing by a mass ratio nobody would notice.
   */
  function chiGyroBohm(teEv, bT, aM) {
    var MD = 3.3435837724e-27, QE = 1.602176634e-19;
    var cs = Math.sqrt(teEv * QE / MD);
    var rhos = MD * cs / (QE * bT);
    return rhos * rhos * cs / aM;
  }

  /** The starting profile, in keV — also what the passive channel is pinned to. */
  function tStart(x, k) {
    var rb = rhoBar(x, k);
    return +$('edge').value + 2 * (1 - rb * rb);
  }

  function solve() {
    var x = rhoGrid(), m = metrics(x);
    var chi0 = +$('chi0').value;
    var closure = +$('closure').value | 0;
    var stiff = closure === 1;
    var p0 = +$('power').value, w = +$('width').value;
    var src = new Float64Array(x.length);
    for (var i = 0; i < x.length; i++)
      src[i] = p0 * Math.exp(-Math.pow(rhoBar(x, i) / w, 2));
    var chiOf = stiff
      ? function (xx, y) {
          var d = new Float64Array(xx.length);
          for (var k = 0; k < xx.length; k++) {
            var k0 = Math.min(k, y.length - 2);
            var g = Math.abs((y[k0 + 1] - y[k0]) / (xx[k0 + 1] - xx[k0]));
            //: a critical-gradient-like stiffening, prescribed here rather
            //: than taken from a closure — the page says which it is
            d[k] = chi0 * (0.25 + 1.75 * g / (1 + g));
          }
          return d;
        }
      : function () { return chi0; };
    var t0 = (self.performance || Date).now();
    var y0 = new Float64Array(x.length);
    for (var j = 0; j < x.length; j++) y0[j] = tStart(x, j);
    var neo = closure === 2 ? neoBlocks(x, m) : null;
    //: the kernel's own solver (FYL-DESIGN-07 D-4).  The closure is chosen
    //: by index rather than passed as a function: a callback cannot cross the
    //: ABI, and splitting the Picard loop across it would put the stiff
    //: iteration back on this side — which is the arrangement D-4 exists to
    //: prevent, and which cost this page a 3e-2 discrepancy when the
    //: discretisation lived here.
    var r = fy.transportStep({
      x: x, yOld: y0,
      vprime: m.vprime,
      //: the flux weight carries <|grad r|^2>; the capacity does not.  They
      //: are different weights in the equation and defaulting both to V'
      //: would be a modelling choice made by omission.
      metric: (function () {
        var mm = new Float64Array(x.length);
        for (var q = 0; q < x.length; q++) mm[q] = m.vprime[q] * m.gradR2[q];
        return mm;
      })(),
      velocity: (function () {
        var vv = new Float64Array(x.length);
        vv.fill(+$('pinch').value);
        return vv;
      })(),
      source: src,
      model: closure, p0: chi0, p1: 0.25, p2: 1.75, neo: neo,
      //: ★Pereverzev-Corrigan, which the kernel has had all along and this
      //: page used to say was "not ported".  It is a control now: the stiff
      //: and turbulent tiers are where a Picard loop needs it, and a
      //: NEGATIVE coefficient is refused by the kernel rather than clamped.
      dPc: +$('dpc').value,
      dt: Infinity, theta: 1, edgeValue: +$('edge').value,
      tol: 1e-10, maxInner: 200,
    });
    //: chi is redrawn here from the SAME formula the kernel selected, purely
    //: for the plot — the solve did not use this array
    var chiArr;
    if (closure === 2) {
      //: ★the kernel does not hand the profile back, so it is recomputed
      //: here from the CONVERGED temperature purely for the plot.  At
      //: convergence the two agree by construction; mid-iteration they
      //: would not, and drawing a mid-iteration chi beside a converged T
      //: would be a picture of neither.
      //: the same floor the solve used, so the curve and the solve
      //: agree at the axis where the gradient vanishes
      chiArr = fy.neoChi(x, r.y, neo, chi0);
    } else {
      chiArr = chiOf(x, r.y);
      if (typeof chiArr === 'number') {
        var c2 = new Float64Array(x.length); c2.fill(chiArr); chiArr = c2;
      }
    }
    return { x: x, y: r.y, chi: chiArr, metrics: m, src: src,
             closure: closure, neo: neo,
             iterations: r.innerIterations, converged: r.converged,
             residual: r.residual, ms: Math.round((self.performance || Date).now() - t0) };
  }

  //: ★★The 1.5D page runs on the main thread ON PURPOSE — 41 points is
  //: microseconds and a worker round-trip would cost more than the solve.
  //: The turbulent tier is the one exception, and it is not an exception to
  //: the reasoning but an application of it: a TGLF closure is ~25 ms per
  //: (radius, wavenumber), so a run is SECONDS, and seconds on the main
  //: thread is a page that has stopped answering.  The worker is created
  //: the first time that tier is asked for and not before — the other three
  //: tiers must not pay a second wasm instantiation for a tier they never
  //: use.
  var turbWorker = null;

  //: ★the turbulence pass runs in a SECOND worker (the page's own), so the
  //: page's `settle` — which listens to the scenario worker — cannot see it
  //: end.  These are that promise: resolved where the pass reports, rejected
  //: where it fails, so the run chain waits for it like any other part.
  var turbWaiters = [];
  function turbSettle() {
    return new Promise(function (res, rej) { turbWaiters.push([res, rej]); });
  }
  function turbEnd(err) {
    turbWaiters.splice(0).forEach(function (w) { err ? w[1](err) : w[0](); });
  }

  function turbRun() {
    var x = rhoGrid(), m = metrics(x);
    var chi0 = +$('chi0').value;
    var p0 = +$('power').value, w = +$('width').value;
    var src = new Float64Array(x.length), y0 = new Float64Array(x.length);
    for (var i = 0; i < x.length; i++) {
      src[i] = p0 * Math.exp(-Math.pow(rhoBar(x, i) / w, 2));
      y0[i] = tStart(x, i);
    }
    var metric = new Float64Array(x.length);
    for (var q = 0; q < x.length; q++) metric[q] = m.vprime[q] * m.gradR2[q];
    var vel = new Float64Array(x.length); vel.fill(+$('pinch').value);
    var neo = neoBlocks(x, m);

    //: ★the radial SUBSET and the ky count are controls, because they are
    //: the two numbers that decide whether this tier is a wait or a walk
    //: away.  Cost is linear in their product; the page states the estimate
    //: before the run rather than after it.
    var nRad = +$('turb-nrad').value | 0, nKy = +$('turb-nky').value | 0;
    var radii = [];
    for (var j = 0; j < nRad; j++)
      radii.push(Math.round(1 + (x.length - 3) * (j / Math.max(1, nRad - 1))));
    var ky = [], lo = 0.05, hi = 0.8;
    for (var kk = 0; kk < nKy; kk++)
      ky.push(+(lo * Math.pow(hi / lo, kk / Math.max(1, nKy - 1))).toFixed(6));

    var t0 = (self.performance || Date).now();
    if (!turbWorker) {
      turbWorker = new Worker(self.FySite.url('assets/worker.js'));
      //: the stop button kills the scenario's worker; this one is the page's
      //: own and would otherwise keep running with nobody listening
      S.onAbort(function () {
        turbEnd(new Error('aborted'));
        if (turbWorker) { turbWorker.terminate(); turbWorker = null; }
      });
      turbWorker.onmessage = function (ev) {
        var d = ev.data;
        if (d.type === 'turb_pass')
          return setBusy(true, T('x.turb.pass', {
            it: d.it, t0: d.t0.toFixed(3), move: d.move.toExponential(1),
            lo: d.chiMin.toFixed(3), hi: d.chiMax.toFixed(3) }));
        if (d.type === 'error') {
          turbEnd(new Error(d.message));
          return setBusy(false, T('x.fail', { why: d.message }), 'err');
        }
        if (d.type !== 'transport_turb') return;
        last = { x: x, y: Float64Array.from(d.y),
                 chi: Float64Array.from(d.chi),
                 chiNeo: Float64Array.from(d.chiNeo),
                 chiTurb: Float64Array.from(d.chiTurb),
                 subX: d.subX, subChi: d.subChi,
                 metrics: m, src: src, closure: 3, neo: neo,
                 outer: d.outer, settled: d.settled,
                 iterations: d.iterations, converged: d.converged,
                 residual: d.residual,
                 ms: Math.round((self.performance || Date).now() - t0) };
        S.progress(1);
        draw();
        //: ★an outer loop that stopped at its cap SAYS so.  A profile that
        //: is wherever six passes reached, reported as done, is the silent
        //: truncation this arrangement exists to avoid.
        setBusy(false, d.settled
          ? T('x.turb.done', { it: d.outer, ms: last.ms,
                               t0: last.y[0].toFixed(3) })
          : T('x.turb.capped', { it: d.outer, ms: last.ms }));
        turbEnd();
      };
      turbWorker.onerror = function (e) {
        turbEnd(e);
        setBusy(false, T('x.fail', { why: String(e && e.message || e) }), 'err');
      };
    }
    setBusy(true, T('x.turb.running', { n: radii.length * ky.length }));
    S.progress(0.2);
    turbWorker.postMessage({
      cmd: 'transport_turb', neo: neo,
      spec: { x: x, y0: y0, vprime: m.vprime, metric: metric, velocity: vel,
              source: src, edge: +$('edge').value, chi0: chi0,
              dPc: +$('dpc').value,
              radii: radii, ky: ky, satRule: 1, width: 1.65,
              outer: +$('turb-outer').value | 0, relax: 0.5, tol: 1e-4 } });
    return turbSettle();
  }

  /**
   * A 0-D operating point onto this bar's controls.
   *
   * ★Only what the deck actually carries.  The boundary temperature is NOT in
   * it — the 0-D profile is prescribed to zero at the edge, so there is no
   * pedestal to hand over — and this bar's `edge` sets the scale of everything
   * it reports.  Leaving it alone and SAYING so beats filling it with a number
   * that would be read as coming from the screen.
   *
   * Two callers, one mapping: the import button (a deck from a file) and the
   * bus (the deck the 0-D bar just published).  They must not drift apart —
   * the second one exists precisely so that a reader does not have to save a
   * file to hand one bar's answer to the next.
   */
  /**
   * q at psi_N = 0.95, from the g-file's own q profile.
   *
   * `qpsi` is tabulated on a uniform psi_N grid of `nw` points — that is the
   * format's definition, not an assumption about the writer — so this is one
   * linear interpolation and not a re-solve.  ★Reading q95 off the profile the
   * equilibrium carries is the whole reason to take it from a g-file at all:
   * the cylindrical estimate this bar would otherwise use is what the deck was
   * built to replace.
   */
  function gfileQ95(g) {
    var q = g.qpsi;
    if (!q || q.length < 2) return NaN;
    var x = 0.95 * (q.length - 1), i = Math.floor(x), f = x - i;
    if (i >= q.length - 1) return Math.abs(q[q.length - 1]);
    return Math.abs(q[i] * (1 - f) + q[i + 1] * f);
  }

  function applyOperatingPoint(op) {
    var g = op['fylite:geometry'] || {};
    var a = +g['fylite:a'];
    if (!(a > 0)) throw new Error(T('x.op.no_geometry'));
    var set = {
      rmaj: +g['fylite:r0'] / a,
      kappa: +g['fylite:kappa'],
      delta: +g['fylite:delta'],
      amin: a,
      bunit: +op['fylite:b_tf'],
      ne0: +op['fylite:ne_central'] / 1e19,
    };
    if (op['fylite:q95'] != null) set.q95 = +op['fylite:q95'];
    var r = FySession.apply(set, S.scope);
    syncLabels();
    return r;
  }

  /**
   * ★WHERE THE UPSTREAM WENT.  The 0-D bar published its operating point on
   * this page's bus and this bar took it on every page run — until 2026-08-22,
   * when 0-D moved to the DESIGN scenario.  A bus is page-local (one worker,
   * one run button, one set of bars), so the handoff is now between two pages
   * and travels the way it always could: the 0-D bar exports the deck, this
   * bar imports it (`op` in the file exchange below).
   *
   * That is a real loss of convenience and it is written here rather than
   * quietly absorbed: passing a solved equilibrium — not merely seven scalars
   * — from `design` or `analysis` into this page is an open question, assessed
   * in `docs/reference/notes/equilibrium-handoff.md`.
   */

  function run() {
    if (S.isBusy()) return;
    if (!fy) return;
    if (+$('closure').value === 3) return turbRun();
    setBusy(true, T('x.solving'));
    S.progress(0.4);
    try { last = solve(); }
    catch (e) {
      setBusy(false, T('x.fail', { why: String(e && e.message || e) }), 'err');
      S.progress(0); return;
    }
    S.progress(1);
    draw();
    setBusy(false, last.converged
      ? T('x.done', { it: last.iterations, ms: last.ms,
                      t0: last.y[0].toFixed(3) })
      : T('x.nocon', { it: last.iterations, res: last.residual.toExponential(2) }));
  }

  function f(v, d) { return isFinite(v) ? v.toFixed(d) : '—'; }

  /**
   * WHICH temperature this tier solves.
   *
   * ★★A correction, not a cosmetic one.  Chang-Hinton gives an ION heat
   * flux, so the neoclassical tier's answer is T_i — the page's own scope
   * note has said so all along while the axis, the legend and the exported
   * key all said `t_e`.  A session file naming the wrong species is wrong
   * for everyone who reads it later, so the name follows the tier here and
   * in `build()` below, and the prescribed tiers (chi is given, so the
   * species does not change the equation) say「T」 without claiming either.
   */
  function channelKey() {
    var cl = +$('closure').value | 0;
    return cl === 2 || cl === 3 ? 'ti' : 't';
  }
  function channelLabel() {
    return T(channelKey() === 'ti' ? 'x.ser.ti' : 'x.ser.t');
  }

  function draw() {
    var col = FyPlot.palette($('prof'));
    if (!last) return;
    var xs = Array.from(last.x);
    FyPlot.xy($('prof'), { series: [
      { x: xs, y: Array.from(last.y), color: col.lcfs, kind: 'line', width: 2,
        label: channelLabel() }],
      xlabel: 'r [m]', ylabel: channelLabel() + ' [keV]', ymin: 0 });
    var chiSeries = [
      { x: xs, y: Array.from(last.chi), color: col.accent, kind: 'line',
        width: 2, label: T('x.ser.chi') },
      { x: xs, y: Array.from(last.src), color: col.alt, kind: 'line',
        width: 1.2, dash: [4, 3], label: T('x.ser.src') }];
    //: ★the two channels drawn apart, and the evaluated radii marked.  The
    //: total alone would let a reader take an interpolation between six
    //: points for a closure evaluated at every one of them.
    if (last.closure === 3 && last.chiNeo) {
      chiSeries.push({ x: xs, y: Array.from(last.chiNeo), color: col.lcfs,
                       kind: 'line', width: 1.2, dash: [2, 2],
                       label: T('x.ser.chineo') });
      chiSeries.push({ x: Array.from(last.subX), y: Array.from(last.subChi),
                       color: col.accent, kind: 'points',
                       label: T('x.ser.chiturb') });
    }
    FyPlot.xy($('chi'), { series: chiSeries, xlabel: 'r [m]', ymin: 0 });

    var rows = [
      [T('x.row.t0'), f(last.y[0], 3) + ' keV'],
      [T('x.row.ratio'), f(last.y[0] / last.y[last.y.length - 1], 2)],
      [T('x.row.it'), last.iterations + (last.converged ? '' : ' ★')],
      [T('x.row.res'), last.residual.toExponential(2)],
      [T('x.row.ms'), last.ms + ' ms'],
    ];
    if (last.closure === 3)
      rows.splice(3, 0, [T('x.row.outer'),
                         last.outer + (last.settled ? '' : ' ★')]);
    $('scalars').innerHTML = rows.map(function (r) {
      return '<tr><td>' + r[0] + '</td><td class="num">' + r[1] + '</td></tr>';
    }).join('');

    var mid = (last.x.length / 2) | 0;
    $('metrics').innerHTML = [
      ["V' (r/a=0.5) [m^2]", f(last.metrics.vprime[mid], 4)],
      ['<|grad r|^2> (0.5)', f(last.metrics.gradR2[mid], 4)],
      ["V' (r=a) [m^2]", f(last.metrics.vprime[last.x.length - 1], 4)],
      [T('x.row.qedge'), f(last.metrics.qEdge, 2)],
    ].map(function (r) {
      return '<tr><td>' + r[0] + '</td><td class="num">' + r[1] + '</td></tr>';
    }).join('');

    $('verdict').innerHTML = last.converged
      ? T('x.verdict.ok', { t0: f(last.y[0], 3), it: last.iterations })
      : T('x.verdict.no', { res: last.residual.toExponential(2) });
  }

  // --- file exchange -------------------------------------------------------

  var CONTROLS = ['rmaj', 'kappa', 'delta', 'q95', 'chi0', 'pinch', 'power',
                  'width', 'edge', 'n', 'closure',
                  //: the stabilisation and the prescribed density peaking
                  //: are both inputs to the answer, so both travel
                  'dpc', 'nepeak',
                  //: the turbulent tier's budget travels with the session:
                  //: the same controls at a different subset are a different
                  //: run, and a file that omitted them would not reproduce
                  'turb-nrad', 'turb-nky', 'turb-outer',
                  //: the physical scale travels with the session too — a
                  //: neoclassical run is not reproducible without it
                  'amin', 'bunit', 'ne0'];

  var FORMATS = {
    //: ★the coarse-screen -> refine edge (FYL-DESIGN-07 §5).  It runs one
    //: way on purpose: 0-D produces an operating point, 1.5D consumes it.
    //: An export back would be a profile solve pretending to be a
    //: scenario, and the 0-D page has no seat for it.
    op: {
      //: import-only: this page READS an operating point and never
      //: writes one, so it has no place in the export menu
      importOnly: true,
      docPage: 'zerod', docKey: 'fylite:operating_point',
      label: T('x.op.label'), filename: 'fylite_operating_point.json',
      accept: '.json,application/json',
      exportHint: T('x.op.export_hint'), importHint: T('x.op.import_hint'),
      build: function () { return { error: T('x.op.no_export') }; },
      apply: function (text, name) {
        var doc = FySession.parse(text);
        var op = doc['fylite:operating_point'];
        if (!op) throw new Error(T('x.op.not_op'));
        var r = applyOperatingPoint(op);
        var g = op['fylite:geometry'] || {};
        run();
        return T('x.op.imported', {
          name: name, t: (+op['fylite:time']).toFixed(2),
          n: r.applied.length,
          src: g['fylite:source'] === 'fylite:slice-equilibrium'
               ? T('x.op.from_equil') : T('x.op.from_unknown'),
          skipped: r.skipped.length
                   ? T('msg.skipped', { n: r.skipped.length }) : '' });
      },
    },
    //: ★A SOLVED EQUILIBRIUM, from either of the other two scenarios.
    //: `design` and `analysis` both write EQDSK; until now nothing on this
    //: page could read one, so「把反演出来的平衡拿去建模」meant retyping four
    //: numbers.  What is taken is what a g-file actually determines for this
    //: bar — the SHAPE (from the boundary it carries), q95 (from its own q
    //: profile) and the field — and what it does not carry is left alone and
    //: said so, exactly as the operating-point import does.
    //:
    //: ★It is still a MILLER FIT of that boundary: this bar builds its metric
    //: from R/a, kappa, delta.  Carrying the traced metric instead is the
    //: assessment in `docs/reference/notes/equilibrium-handoff.md` — the point
    //: of this entry is that the numbers now come from a solved boundary
    //: rather than from a shape somebody typed.
    gfile: {
      importOnly: true, text: true,
      docPage: 'gfile',
      label: T('x.g.label'), filename: 'g_fylite.00000',
      accept: '.00000,.geqdsk,g*,text/plain',
      exportHint: T('x.g.no_export'), importHint: T('x.g.import_hint'),
      build: function () { return { error: T('x.g.no_export') }; },
      apply: function (text, name) {
        var g = FyGeqdsk.parse(text);
        var sm = FyGeqdsk.boundaryShape(g);
        if (!sm || !(sm.a > 0)) throw new Error(T('x.g.nobnd'));
        var set = {
          rmaj: sm.r0 / sm.a,
          kappa: sm.kappa,
          delta: 0.5 * (sm.deltaU + sm.deltaL),
          amin: sm.a,
          //: ★B_centr, the same reading the operating-point deck hands over
          //: as `b_tf`: a g-file carries the vacuum field at `rcentr` and no
          //: B_unit, so the two import paths agree rather than each
          //: inventing a different one
          bunit: Math.abs(g.bcentr),
        };
        var q95 = gfileQ95(g);
        if (isFinite(q95) && q95 > 0) set.q95 = q95;
        var r = FySession.apply(set, S.scope);
        syncLabels();
        run();
        return T('x.g.imported', {
          name: name, n: r.applied.length,
          r0: sm.r0.toFixed(3), a: sm.a.toFixed(3), kappa: sm.kappa.toFixed(2),
          q95: isFinite(q95) ? q95.toFixed(2) : '—',
          skipped: r.skipped.length
                   ? T('msg.skipped', { n: r.skipped.length }) : '' });
      },
    },
    json: {
      docPage: 'transport',
    label: T('io.label.json'), filename: 'fylite_transport_session.json',
    accept: '.json,application/json',
    exportHint: T('x.j.export_hint'), importHint: T('x.j.import_hint'),
    build: function () {
      if (!last) return { error: T('x.none_yet') };
      var doc = FySession.envelope('transport', FySession.collect(CONTROLS, S.scope),
                                   fy ? { abi: fy.abi, sha256: fy.sha256,
                                          bytes: fy.bytes } : null);
      doc['fylite:profile'] = {
        //: ★A TYPED NODE, and a deliberately PRIVATE one.  The 含时演化 bar
        //: below writes its result as declared fyo groups because its
        //: quantities ARE the DD's (rho_tor, dvolume_drho_tor, gm2/gm3,
        //: core_profiles, summary).  This bar's are not: it solves on the
        //: MINOR RADIUS with `geo_surface`'s dV/dr and <|grad r|^2>, and
        //: writing those into `rho_tor` / `dvolume_drho_tor` would be a
        //: mislabel that reads as a different coordinate rather than as an
        //: error.  So the keys stay `fylite:`-prefixed, which is the honest
        //: spelling for a quantity the DD has no slot for.
        '@type': 'fylite:TransportProfile/1',
        //: the grid is METRES (the minor radius), which is the label the
        //: metric beside it belongs to
        'fylite:r_minor': FySession.sig(last.x),
        //: ★the key names the species the tier actually solved.  It was
        //: `t_e` for every tier, including the two whose answer is T_i.
        'fylite:channel': channelKey() === 'ti' ? 'fylite:t_i' : 'fylite:t',
        'fylite:temperature': FySession.sig(last.y),
        'fylite:chi': FySession.sig(last.chi),
        'fylite:source': FySession.sig(last.src),
        //: the metric travels with the answer.  Without it the profile
        //: cannot be re-solved by anyone else: two different V' give two
        //: different profiles from identical controls.
        'fylite:volume_prime': FySession.sig(last.metrics.vprime),
        'fylite:fsa_grad_r2': FySession.sig(last.metrics.gradR2),
        'fylite:inner_iterations': last.iterations,
        'fylite:residual': last.residual,
      };
      if (last.closure === 2)
        //: the gyro-Bohm unit is what makes the exported chi a number in
        //: m^2/s rather than a dimensionless one — it has to travel
        doc['fylite:profile']['fylite:chi_gyrobohm'] =
          FySession.sig(last.neo.chigb);
      return JSON.stringify(doc, null, 1);
    },
    apply: function (text, name) {
      var doc = FySession.parse(text);
      if (doc['fylite:page'] !== 'transport')
        throw new Error(T('msg.wrong_page', { page: doc['fylite:page'] }));
      var r = FySession.apply(doc['fylite:config'], S.scope);
      syncLabels();
      return T('x.j.imported', { name: name, n: r.applied.length,
        skipped: r.skipped.length ? T('msg.skipped', { n: r.skipped.length }) : '' });
    },
  },
  };
  var io = S.formats(FORMATS);

  // --- what another scenario left for this one ------------------------------
  //
  // ★The bus stops at the page, and the two ends of「0D 工况 → 1.5D 输运」are now
  // on different pages, so this is the same handoff by another carrier:
  // `design` or `analysis` leaves the document it would have exported, and this
  // bar OFFERS it.  What applies it is the format's own `apply` — the file path
  // and this path are ONE code path, so a document that arrives this way is
  // read exactly as the same file would be.
  //
  // ★Never applied without being asked.  A page that silently re-set its own
  // controls from what another tab did would be unexplainable at exactly the
  // moment it mattered.
  function offerHandoff() {
    var host = document.getElementById('model-handoff');
    if (!host) return;
    var rec = self.FyHandoff && FyHandoff.peek();
    var fmt = rec && (rec.kind === 'gfile' ? FORMATS.gfile : FORMATS.op);
    if (!fmt) { host.hidden = true; return; }
    host.hidden = false;
    host.innerHTML =
      T('handoff.waiting', {
        from: T('handoff.from.' + rec.from),
        what: T('handoff.kind.' + rec.kind),
        name: rec.name,
        ago: FyHandoff.ago(rec.when, T),
      })
      + ' <button type="button" class="link-btn" id="' + S.id('handoff-take')
      + '">' + T('handoff.take') + '</button>'
      + ' <button type="button" class="link-btn" id="' + S.id('handoff-drop')
      + '">' + T('handoff.dismiss') + '</button>';
    document.getElementById(S.id('handoff-take'))
      .addEventListener('click', function () {
        var msg;
        try { msg = fmt.apply(rec.text, rec.name); }
        catch (e) { setBusy(false, T('io.failed', { why: e.message }), 'err'); return; }
        FyHandoff.clear();
        host.hidden = true;
        //: ★the format's own message is CONCATENATED, not interpolated: the
        //: catalogue escapes every parameter (a filename must not be able to
        //: inject), and this one is catalogue prose that carries emphasis.
        S.report(T('handoff.taken', {
          from: T('handoff.from.' + rec.from),
          what: T('handoff.kind.' + rec.kind) }) + ' ' + msg);
      });
    document.getElementById(S.id('handoff-drop'))
      .addEventListener('click', function () {
        //: dismissing does NOT delete what the other page left: the reader
        //: said "not now", not "throw it away", and the document may not
        //: exist anywhere else yet
        host.hidden = true;
      });
  }

  function syncClosure() {
    var cl = +$('closure').value;
    //: ★both physics tiers need the physical scale: a neoclassical chi and
    //: a turbulent one are both dimensional, while the prescribed tiers
    //: state chi directly and do not
    var phys = cl === 2 || cl === 3;
    $('phys-panel').hidden = !phys;
    $('neo-scope').hidden = !phys;
    $('turb-panel').hidden = cl !== 3;
  }

  CONTROLS.forEach(function (id) {
    $(id).addEventListener('input', syncLabels);
    $(id).addEventListener('change', run);
  });
  $('closure').addEventListener('change', syncClosure);
  S.onRun(run);

  S.onRefresh(function () {
    if (last) draw();
  });
  syncClosure();
  syncLabels();
  offerHandoff();
  S.onRefresh(offerHandoff);
  S.refresh();

  //: the core kernel, on the page rather than in a worker: a steady solve on
  //: 41 points is microseconds, and a Worker round-trip would cost more than
  //: the arithmetic it carries
  self.FyLite.load(self.FySite.url('assets/fylite_rs.wasm')).then(function (inst) {
    fy = inst;
    setBusy(false, T('x.ready'));
  }).catch(function (e) {
    setBusy(false, T('x.fail', { why: String(e && e.message || e) }), 'err');
  });
});

// ==========================================================================
// 功能栏  evolve — 含时演化（芯部推进，可与平衡交替）
// ==========================================================================
//
// ★★WHAT THIS BAR IS, and what it replaces.  Until now this page's second
// bar was `coupled`: a free-boundary solve alternating with a STEADY
// single-channel temperature solve, feeding back one number — the pressure
// amplitude.  It is withdrawn, markup, worker command, catalogue and gate,
// because this bar answers the same question and four more:
//
//   TIME       the core march advances in dt with an optional adaptive
//              controller, and every step is reported as it lands.  The old
//              bar's「逐轮」 was a Picard fixed point, not a time axis.
//   CHANNELS   T_e and T_i with the collisional exchange between them, the
//              electron density, and the poloidal flux — i.e. q(rho) is a
//              RESULT here, where every other tier on this page prescribes
//              it.
//   BALANCE    the kernel's capacity is (3/2)V'n, sources cross in W/m^3,
//              and the heating sliders are in MEGAWATTS.  That is what makes
//              W_th, tau_E, beta_N and Q reportable at all; the 1.5-D bar
//              above cannot report them and does not pretend to.
//   CADENCE    the equilibrium is re-solved every K steps (K = 0 freezes the
//              geometry), the metric re-traced, and dV'/dt carried across
//              the join.  ★★The feedback is now a SHAPE feedback: the
//              solver's own profile factor (1 - psibar^emp)^enp IS
//              dp/dpsibar normalised, so it is fitted to the pressure
//              gradient the march produced, and beta_0 is moved by the ratio
//              of two beta_p — the transport one against the equilibrium's.
//              Both, and the fit residual, are reported per round.
//
// ★What is still PRESCRIBED is named on the page, one by one: chi_e/chi_i on
// the neoclassical tier (Chang-Hinton is an ion flux), the particle
// diffusivity and pinch (no particle closure in this build), the deposition
// shapes, and the composition (one thermal deuterium species; Z_eff enters
// the resistivity, the bremsstrahlung and the bootstrap and NOT
// quasi-neutrality).


// ==========================================================================
// THE REFERENCE PROFILES — imported once, read by more than one bar
// ==========================================================================
//
// ★★Hoisted out of the 含时演化 bar because it stopped being that bar's
// private business: the interpretive bar inverts the SAME measured profiles
// for the chi they imply, and a second import menu entry for one document
// would let a reader compare a march against one table while calibrating
// against another.  One import, one document, two consumers.

var MODEL_REF = null;

//: the catalogue, at file scope: the two helpers below are outside every
//: bar closure now, and each bar keeps its own `T` alias unchanged
var MODEL_T = FyI18n.t;

function modelParseReference(text, name) {
  var lines = String(text).split(/\r?\n/).filter(function (l) {
    return l.trim().length;
  });
  if (lines.length < 3) throw new Error(MODEL_T('e.r.short'));
  var hdr = lines[0].split(',').map(function (h) { return h.trim(); });
  var at = function (names) {
    for (var i = 0; i < hdr.length; i++)
      if (names.indexOf(hdr[i]) >= 0) return i;
    return -1;
  };
  //: the ASTRA table's own column names.  ★The first column has NO name
  //: (it is the row index), which is why the header is matched by name
  //: rather than by position.
  var iRho = at(['rho', 'rho_tor', 'RHO']), iX = at(['x', 'rho_n']),
      iTe = at(['TE', 'Te', 'te']), iTi = at(['TI', 'Ti', 'ti']),
      iNe = at(['NE', 'Ne', 'ne']), iQ = at(['q', 'Q', 'qpsi']);
  if (iTe < 0 || (iRho < 0 && iX < 0)) throw new Error(MODEL_T('e.r.cols'));
  var rho = [], te = [], ti = [], ne = [], q = [];
  for (var k = 1; k < lines.length; k++) {
    var c = lines[k].split(',');
    var r = iRho >= 0 ? +c[iRho] : NaN;
    if (!isFinite(r)) continue;
    rho.push(r);
    //: keV and 1e19 m^-3 are the table's units; eV and m^-3 are the
    //: page's.  One conversion, here, at the door.
    te.push(+c[iTe] * 1e3);
    ti.push(iTi >= 0 ? +c[iTi] * 1e3 : NaN);
    ne.push(iNe >= 0 ? +c[iNe] * 1e19 : NaN);
    q.push(iQ >= 0 ? Math.abs(+c[iQ]) : NaN);
  }
  if (rho.length < 3) throw new Error(MODEL_T('e.r.short'));
  return { name: name, rho: rho, te: te, ti: ti, ne: ne, q: q,
           xNorm: iRho < 0 };
}

/** The reference at the march's own radii, or null where it has none. */

function modelRefAt(rho, key) {
  if (!MODEL_REF || !MODEL_REF[key]) return null;
  var out = new Float64Array(rho.length), any = false;
  for (var i = 0; i < rho.length; i++) {
    var v = interpRef(MODEL_REF.rho, MODEL_REF[key], rho[i]);
    out[i] = v;
    if (isFinite(v)) any = true;
  }
  return any ? out : null;
}

function interpRef(xs, vs, at) {
  if (!xs.length) return NaN;
  if (at <= xs[0]) return vs[0];
  for (var i = 1; i < xs.length; i++)
    if (xs[i] >= at) {
      var w = (at - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return vs[i - 1] + w * (vs[i] - vs[i - 1]);
    }
  return vs[vs.length - 1];
}

/**
 * How far the march is from the reference, per channel.
 *
 * ★Reported as BOTH the peak and the r.m.s. relative difference, and over
 * the part of the radius the reference actually covers.  A single number
 * would hide which of「核心对上、边缘差」 and「处处差一点」 it is, and
 * those two say different things about the closure.
 */


FyScenario.whenDevices(function () {
  'use strict';

  var M = self.FYLITE_MACHINE;
  var T = FyI18n.t;
  var last = null, trace = [], rounds = [], gfile = null;
  //: ★what a CONTINUED march starts from, and when.  Kept on the page rather
  //: than in the worker: the worker is rebuilt whenever the machine changes,
  //: and a state that survived a device switch would be a plasma from another
  //: tokamak.
  var resumeState = null, resumeAt = 0, priorTrace = [];

  var S = MODEL.bar('evolve', {
    title: 'nav.evolve',
    sliders: { dt: 3, nsteps: 0, dttarget: 3, nlev: 0, edgepsin: 3,
               te0: 1, ti0: 1, peakt: 1, peakn: 1,
               edgete: 2, edgeti: 2, edgene: 1, vloop: 2,
               pe: 1, pi: 1, dep: 2, depw: 2, fuel: 1, icd: 0, zeff: 1,
               chiratio: 1, dchi: 2, pinch: 2, dpc: 2, ip: 0,
               couple: 0, relax: 2, sawmix: 2, dtfrac: 3,
               chi0: 2, ne0: 1, amin: 2, rmaj: 2, kappa: 2, delta: 2,
               q95: 1, bunit: 1,
               waveramp: 2, waveflat: 2, waveend: 2, wavestart: 2, waveend2: 2,
               turbevery: 0, turbnrad: 0, turbnky: 0, turbrelax: 2,
               degp: 0, degf: 0, torque: 1, prandtl: 2,
               //: the launchers' six, so the band the machine declared is
               //: READABLE and not only in effect (T-M15)
               lhpower1: 1, lhpower2: 1, lhnpar1lo: 2, lhnpar1hi: 2,
               lhnpar2lo: 2, lhnpar2hi: 2 },
    on: { ready: onReady, error: onError, evolve_geometry: onGeometry,
          evolve_step: onStep, evolve_couple: onCouple, evolve: onDone },
  });
  var $ = S.$, syncLabels = S.sync, setBusy = S.setBusy;

  //: ★★THE LAUNCHERS ARE THE MACHINE'S (T-M15).  `M.lhAntennas` is what
  //: `fyodev.js` read out of the device document's `lh_antennas.antenna`, and
  //: everything the two groups show comes from it: the antenna's NAME, the
  //: nameplate that bounds its power slider, and the launched n_∥ band its
  //: two n_∥ sliders start at.  The markup carries no value for any of them.
  //:
  //: ★Before this, the six numbers were HTML literals — and they were EAST's
  //: two systems SWAPPED (the slider labelled LH1 started at 1.80–2.23, which
  //: is the 4.6 GHz system's band, while EAST's own naming has LH1 = 2.45 GHz).
  //: A machine description in markup cannot be checked against anything; this
  //: one had been wrong for as long as it existed.
  //:
  //: ★A device switch RELOADS the page (`FyDevices.select` sets `?device=` and
  //: navigates), so this runs once per machine — there is no path where a
  //: launcher from the previous tokamak survives on screen.
  var LAUNCHERS = (M && M.lhAntennas) || [];

  /** One launcher, as the provenance line names it. */
  function launcherText(a) {
    return T('e.lh.one', { name: a.name,
                           freq: (a.frequency / 1e9).toFixed(2),
                           max: (a.maxPower / 1e6).toFixed(1),
                           lo: a.nParallel[0], hi: a.nParallel[1] });
  }

  /**
   * Put the machine's launchers into the controls.
   *
   * ★The n_∥ slider bounds are WIDENED to hold the declared band rather than
   * the band being clamped into them: clamping would show a number the
   * machine did not declare, which is the failure this whole item is about.
   */
  function applyLauncherDefaults() {
    for (var i = 0; i < 2; i++) {
      var a = LAUNCHERS[i], n = i + 1;
      var grp = $('lhgrp' + n);
      if (grp) grp.hidden = !a;
      if (!a) {
        //: ★★AND ITS POWER GOES TO ZERO.  A hidden group is still read by
        //: `spec()`, and a range input with no value sits at the MIDDLE of
        //: its bounds — so a machine with one antenna would have launched a
        //: second, invented system at 3 MW through a control nobody could
        //: see.  Zero is how this page says "not in this shot", and the
        //: worker drops a system with no absorbed power.
        var off = $('lhpower' + n);
        if (off) off.value = 0;
        continue;
      }
      var maxMW = a.maxPower / 1e6;
      var p = $('lhpower' + n);
      if (p) {
        p.max = maxMW;
        //: ★the page's own operating point, and the only thing here that is:
        //: the first system starts at 2 MW (or its nameplate, if smaller),
        //: every other at 0 — which is how this page says "not in this shot".
        p.value = i === 0 ? Math.min(2, maxMW) : 0;
      }
      var lo = $('lhnpar' + n + 'lo'), hi = $('lhnpar' + n + 'hi');
      if (lo) {
        lo.min = Math.min(+lo.min, a.nParallel[0]);
        lo.max = Math.max(+lo.max, a.nParallel[1]);
        lo.value = a.nParallel[0];
      }
      if (hi) {
        hi.min = Math.min(+hi.min, a.nParallel[0]);
        hi.max = Math.max(+hi.max, a.nParallel[1]);
        hi.value = a.nParallel[1];
      }
    }
  }

  /** The labels and the provenance line — redrawn on a language change. */
  function paintLaunchers() {
    for (var i = 0; i < 2; i++) {
      var a = LAUNCHERS[i], n = i + 1;
      if (!a) continue;
      var name = a.name, max = (a.maxPower / 1e6).toFixed(1) + ' MW';
      var pl = $('lh-p' + n + '-lab');
      //: the second and later systems carry the "0 = not in this shot" rider
      if (pl) pl.innerHTML = T(i === 0 ? 'e.lh.p' : 'e.lh.p0',
                               { name: name, max: max });
      var lo = $('lh-n' + n + 'lo-lab'), hi = $('lh-n' + n + 'hi-lab');
      if (lo) lo.innerHTML = T('e.lh.nlo', { name: name });
      if (hi) hi.innerHTML = T('e.lh.nhi', { name: name });
    }
    var src = $('lh-src');
    if (src) {
      src.innerHTML = LAUNCHERS.length
        ? T('e.lh.src', { device: (M && (M.name || M.id)) || '?',
                          list: LAUNCHERS.map(launcherText).join('; ') })
        : '';
      src.hidden = !LAUNCHERS.length;
    }
  }

  function on(id) { var e = $(id); return !!(e && e.checked); }

  function channels() {
    return { heat: on('ch-heat'), density: on('ch-density'),
             current: on('ch-current'), momentum: on('ch-momentum') };
  }

  function spec() {
    var a = +$('amin').value, geom = $('geometry').value;
    var tf = self.FyDevice.tf(M);
    var ch = channels();
    return {
      geometry: geom,
      //: ★T-M13 — the ladder's outer edge is a CONTROL now, not a constant
      //: baked two pages deep.  Capped strictly below 1: the separatrix is
      //: not a metric surface this ladder can stand on (dV/dpsi diverges
      //: there on a diverted equilibrium, and tracing psi_N = 1 exactly is
      //: tracing the X point), so the slider ends at 0.99 and the clamp
      //: holds even against an imported session that says otherwise.
      n: +$('nlev').value | 0,
      edgePsin: Math.min(0.99, Math.max(0.5, +$('edgepsin').value || 0.95)),
      //: the shape, only read by the Miller tier — the two ladder tiers take
      //: it from the field they were given
      a: a, r0: +$('rmaj').value * a, kappa: +$('kappa').value,
      delta: +$('delta').value, q95: +$('q95').value,
      b0: +$('bunit').value,
      chHeat: ch.heat, chDensity: ch.density, chCurrent: ch.current,
      //: ★the momentum channel and the two numbers it needs.  chi_phi is
      //: PRESCRIBED — a momentum diffusivity is a TGLF output and this port
      //: does not carry upstream's toroidal-stress weights — so what the
      //: reader sets is a Prandtl number against the ion heat channel, and
      //: the file carries it.  The torque rides the same deposition profile
      //: as the auxiliary power, because on this tier that power is a beam.
      chMomentum: ch.momentum, torque: +$('torque').value,
      prandtl: +$('prandtl').value,
      dt: +$('dt').value, nSteps: +$('nsteps').value | 0,
      dtTarget: +$('dttarget').value,
      //: ★the floor and the ceiling of the step-size controller.  The
      //: collisional exchange reaches the operator EXPLICITLY (the kernel
      //: puts it in the two source terms), so a dt of order the exchange
      //: time blows the heat pair up — measured here — and what saves the
      //: run is the controller's retry: the step is thrown away, dt halved,
      //: the same step retaken.  A floor 500x below the asked-for dt is what
      //: gives it room to do that.
      dtMin: +$('dt').value / 500, dtMax: +$('dt').value * 50,
      nCoupling: 2, tolSteady: 1e-9,
      //: ★how often a step is POSTED, not how often one is taken: the trace
      //: keeps every step either way.  A 400-step march posting every profile
      //: is 400 structured clones the reader cannot see anyway, so long runs
      //: draw about sixty times and short ones draw every step.
      report: Math.max(1, Math.round((+$('nsteps').value | 0) / 60)),
      //: eV and m^-3 across the wire, which is what the kernel takes
      te0: +$('te0').value * 1e3, ti0: +$('ti0').value * 1e3,
      ne0: +$('ne0').value * 1e19, edgeNe: +$('edgene').value * 1e19,
      edgeTe: +$('edgete').value * 1e3, edgeTi: +$('edgeti').value * 1e3,
      peakT: +$('peakt').value, peakN: +$('peakn').value,
      vLoop: +$('vloop').value, b0Dot: 0,
      closure: +$('closure').value | 0, chi0: +$('chi0').value,
      //: the turbulent tier's budget, and the cadence it is evaluated on
      turbEvery: +$('turbevery').value | 0,
      turbNrad: +$('turbnrad').value | 0, turbNky: +$('turbnky').value | 0,
      turbRelax: +$('turbrelax').value,
      chiRatio: +$('chiratio').value, dOverChi: +$('dchi').value,
      pinch: +$('pinch').value, dPc: +$('dpc').value,
      //: ★`k` has no default in the kernel and does not get one here: the
      //: mixing radius is `k r_1` with k between 1 and ~1.4 depending on
      //: whose reduced model is followed, so it is a control with its range
      //: on the slider rather than a number chosen out of sight.
      sawtooth: on('sawtooth'), sawMix: +$('sawmix').value,
      pE: +$('pe').value, pI: +$('pi').value,
      depCentre: +$('dep').value, depWidth: +$('depw').value,
      //: ★★THE BEAM (T-M2).  With it on, P_e / P_i, the deposition shape
      //: and I_CD are RESULTS — the electron/ion split is
      //: `ion_power_fraction(E_crit, E)` per shell and the driven current
      //: is `beam_current` — so the controls that used to set them are
      //: disabled on the page rather than quietly ignored in the worker.
      beam: on('beam'),
      beamPower: +$('beampower').value * 1e6,
      beamEnergy: +$('beamenergy').value * 1e3,
      beamRtan: +$('beamrtan').value, beamZ: +$('beamz').value,
      beamWidth: +$('beamwidth').value,
      beamDir: +$('beamdir').value, beamStopping: $('beamstop').value,
      beamF1: +$('beamf1').value, beamF2: +$('beamf2').value,
      beamF3: +$('beamf3').value,
      beamShells: +$('beamshells').value | 0,
      beamOrbit: on('beamorbit'),
      //: ★★THE WAVE (T-M10), beside the beam and never inside it.  With it
      //: on, I_CD is a RESULT (`lh_deposit`'s j_LH) and the slider that set
      //: it is disabled on the page.  ★The up-shift is a RANGE because the
      //: factor itself is poorly known and it dominates where the current
      //: lands — which is exactly why `sigma_j` has to widen with it.
      lh: on('lh'),
      //: ★the names are the MACHINE's (T-M15): a run on a device whose
      //: launcher is called LHX must not report it as LH1, on screen or in
      //: the exported file
      lhNames: LAUNCHERS.map(function (a) { return a.name; }),
      lhPower1: +$('lhpower1').value * 1e6,
      lhPower2: +$('lhpower2').value * 1e6,
      lhNpar1Lo: +$('lhnpar1lo').value, lhNpar1Hi: +$('lhnpar1hi').value,
      lhNpar2Lo: +$('lhnpar2lo').value, lhNpar2Hi: +$('lhnpar2hi').value,
      lhUpLo: +$('lhuplo').value, lhUpHi: +$('lhuphi').value,
      //: η_CD is a CALIBRATED coefficient in A W^-1 m^-2, of order 1e19 for
      //: EAST LHCD — the slider carries the mantissa and the unit is here
      lhEtaCd: +$('lhetacd').value * 1e19,
      lhXi: +$('lhxi').value, lhWidthFloor: +$('lhwidth').value,
      lhShells: +$('lhshells').value | 0,
      //: ★NOT controls: the kernel's own defaults for the footprint
      //: quadrature and the chord sampling, and deuterium.  They travel in
      //: the file so the oracle re-runs the same call, but a reader who has
      //: to choose a quadrature order before they can fire a beam is being
      //: asked the wrong question.
      beamSamples: 601, beamNWidth: 3, beamMass: 2,
      fuel: +$('fuel').value,
      fuelCentre: 1.0, fuelWidth: 0.25,
      alpha: on('alpha'), brem: on('brem'), ohmic: on('ohmic'),
      bootstrap: on('bootstrap'),
      iCd: +$('icd').value * 1e3, cdCentre: 0.4, cdWidth: 0.2,
      zeff: +$('zeff').value,
      //: ★the species by NAME, resolved against the kernel's table in the
      //: worker: an id guessed here would be an id nobody checked, and an
      //: unknown one radiates zero rather than complaining.  Empty means no
      //: impurity at all, which is the bremsstrahlung-only plasma this bar
      //: had before there was a way to say which species.
      impurity: $('species') ? $('species').value : '',
      cImp: +$('cimp').value / 100,
      //: ★the impurity in the quasi-neutrality: the main ion is then
      //: DILUTED and the fuel fraction is derived, not set
      quasi: on('quasi'),
      //: ★the fuel fraction is a CONTROL: the alpha power goes as f^2, and a
      //: reference case with n_DT/n_e = 0.75 (ITER's own dilution) against
      //: the pure-DT default is a factor 1.8 in P_alpha — measured against
      //: the 15 MA table before this became a knob.
      dtFraction: +$('dtfrac').value,
      ip: +$('ip').value * 1e3,
      couple: +$('couple').value | 0, relax: +$('relax').value,
      //: ★the free-boundary solver's iteration budget.  Its TOLERANCE is
      //: not a control (the refinement is held to the same number), so what
      //: this sets is only how long the solver may look — and the answer
      //: says whether that was enough rather than quietly getting worse.
      freeMaxIter: +$('freeiter').value | 0,
      //: ★the coupling's plasma source: the two-parameter family, or p'/FF'
      //: as polynomials fitted to what the march produced
      coupleFixed: on('couplefixed'),
      degP: +$('degp').value | 0, degF: +$('degf').value | 0,
      beta0: 0.55, emp: 1.0, enp: 1.0, r0Src: tf.r0,
      //: ★★START FROM THE REFERENCE, when the reader asks for it and there is
      //: one.  That is what turns a comparison into a REPRODUCTION test: the
      //: march begins on the published profiles, with the published density
      //: held, and what the deviation then measures is how far this model
      //: drifts from them — not how close a parametric guess happened to be.
      useRef: on('useref') && !!MODEL_REF,
      //: ★the actuators in time.  `wave` off makes every factor exactly 1,
      //: which is why switching it off reproduces the run you had.
      wave: on('wave'),
      waveRamp: +$('waveramp').value, waveFlat: +$('waveflat').value,
      waveEnd: +$('waveend').value,
      waveStart: +$('wavestart').value, waveEnd2: +$('waveend2').value,
      wavePower: on('wavepower'), waveVloop: on('wavevloop'),
      waveFuel: on('wavefuel'),
    };
  }

  /**
   * The g-file the reader imported, flattened to what the ladder needs.
   *
   * ★The app's own gauge (`psiFromGfile`: Wb, axis = max) rather than the
   * file's, so the worker's two ladder paths take the SAME numbers and the
   * `2 pi` appears once, where the ladder is built.
   */
  function gfilePayload() {
    if (!gfile) return null;
    var g = gfile, sm = FyGeqdsk.boundaryShape(g);
    if (!sm || !(sm.a > 0)) throw new Error(T('x.g.nobnd'));
    var lr = g.limitr ? g.rlim : g.rbbbs, lz = g.limitr ? g.zlim : g.zbbbs;
    return {
      psi: Array.from(FyGeqdsk.psiFromGfile(g)),
      psiAxis: -2 * Math.PI * g.simag, psiBnd: -2 * Math.PI * g.sibry,
      axisR: g.rmaxis, axisZ: g.zmaxis,
      r0: g.rleft, z0: g.zmid - g.zdim / 2,
      dr: g.rdim / (g.nw - 1), dz: g.zdim / (g.nh - 1),
      nr: g.nw, nz: g.nh,
      limR: Array.from(lr), limZ: Array.from(lz),
      //: `qpsi` and `fpol` are tabulated on a uniform psi_N grid — the
      //: format's definition, which is exactly the grid the ladder
      //: interpolates them on
      qTable: Array.from(g.qpsi), fTable: Array.from(g.fpol),
      b0: Math.abs(g.bcentr), a: sm.a, rmaj: sm.r0,
    };
  }

  function run() {
    if (S.isBusy()) return;
    var sp = spec();
    if (!(sp.chHeat || sp.chDensity || sp.chCurrent))
      return setBusy(false, T('e.err.nochannel'), 'warn');
    if (sp.chCurrent && sp.geometry === 'miller')
      return setBusy(false, T('e.err.nogm2'), 'warn');
    if (sp.geometry === 'device' && !FyDevice.hasReference(M))
      return setBusy(false, T('recon.noref'), 'warn');
    if (sp.geometry === 'gfile' && !gfile)
      return setBusy(false, T('e.err.nogfile'), 'warn');
    if (sp.couple > 0 && sp.geometry !== 'device')
      return setBusy(false, T('e.err.nocouple'), 'warn');
    //: ★the beam needs a psi map, and a run that asked for one on the
    //: analytic tier is refused here rather than falling back to the
    //: Gaussian it was switched on to replace
    if (sp.beam && sp.geometry === 'miller')
      return setBusy(false, T('e.err.beam_nofield'), 'warn');
    if (sp.beam && !(sp.beamF1 + sp.beamF2 + sp.beamF3 > 0))
      return setBusy(false, T('e.err.beam_fractions'), 'warn');
    //: ★the wave needs the same field the beam does, plus |F(psi)| — and it
    //: needs somebody to have switched a system on
    if (sp.lh && sp.geometry === 'miller')
      return setBusy(false, T('e.err.lh_nofield'), 'warn');
    if (sp.lh && !(sp.lhPower1 > 0 || sp.lhPower2 > 0))
      return setBusy(false, T('e.err.lh_nopower'), 'warn');
    if (sp.lh && (!(sp.lhUpLo > 0) || !(sp.lhUpHi >= sp.lhUpLo)))
      return setBusy(false, T('e.err.lh_upshift'), 'warn');
    if (sp.lh && ((sp.lhPower1 > 0 && !(sp.lhNpar1Hi >= sp.lhNpar1Lo))
                  || (sp.lhPower2 > 0 && !(sp.lhNpar2Hi >= sp.lhNpar2Lo))))
      return setBusy(false, T('e.err.lh_band'), 'warn');
    //: ★a continued march KEEPS the trace it is continuing: the figure is
    //: of a discharge, not of a segment, and a reader who pressed continue
    //: asked for one curve rather than two files.
    priorTrace = on('resume') ? trace.slice() : [];
    trace = []; rounds = []; last = null;
    setBusy(true, T('e.running', { n: sp.nSteps }));
    S.progress(0.02);
    draw();
    var msg = { cmd: 'evolve', spec: sp };
    //: ★★CONTINUING, rather than starting again.  A discharge is not one
    //: phase, and without this a flat-top could only be modelled by
    //: pretending it began from a parabola.  What is carried across is the
    //: STATE and only the state — every control is read afresh, which is
    //: the point of continuing at all.
    //:
    //: ★The clock continues with it: the waveform is a function of
    //: discharge time, and a second segment that restarted the clock would
    //: replay the ramp-up it was meant to follow.
    if (on('resume')) {
      if (!resumeState)
        return setBusy(false, T('e.err.noresume'), 'warn');
      msg.resume = resumeState;
      msg.tStart = resumeAt;
    }
    if (sp.geometry === 'device') msg.chan = Array.from(M.reference.aturns);
    if (sp.geometry === 'gfile') msg.gfile = gfilePayload();
    if (sp.useRef)
      msg.refProf = { rho: MODEL_REF.rho, te: MODEL_REF.te, ti: MODEL_REF.ti, ne: MODEL_REF.ne };
    S.send(msg);
    return S.settle('evolve');
  }

  // --- drawing -------------------------------------------------------------

  function f(v, d) { return isFinite(v) ? v.toFixed(d) : '—'; }
  function e2(v) { return isFinite(v) ? v.toExponential(2) : '—'; }
  //: a signed percentage, so a row that reads "+0.21 %" cannot be mistaken
  //: for one that reads "0.21 % low"
  function pct(v) {
    return isFinite(v) ? (v >= 0 ? '+' : '') + (100 * v).toFixed(2) + ' %'
                       : '—';
  }

  /**
   * ★★T-M11 — THE TWO QUADRATURES, AND WHERE THEIR DIFFERENCE COMES FROM.
   *
   * A shell-binned source reports `shell_sum(p_dep, dV)` over the WHOLE
   * plasma; the march integrates the same deposition over ITS OWN metric
   * ladder, which stops at `edgePsin`.  The two disagree, and the previous
   * batch deliberately printed both rather than normalising one onto the
   * other — a renormalisation turns a checkable disagreement into an
   * invisible choice.
   *
   * What this function does is not normalise it either: it SPLITS it, into
   * the half that no refinement removes (the power deposited outside the
   * ladder's outermost surface — measured by the worker on the kernel's own
   * traced volumes) and the half that does (the remap of a shell average
   * onto ladder nodes, plus the trapezoid on them).  Only the second is a
   * discretisation error, and saying which is which is the whole item.
   *
   * `rec` needs `{pAbsorbed, pOutsideLadder, ladderEdgePsin}`; `ladder` is
   * what the march itself integrated.  `split` is false when the worker
   * could not place the ladder's boundary inside the deposition shells, in
   * which case the two numbers still stand and only the decomposition is
   * withheld.
   */
  function quadSplit(rec, ladder) {
    var shell = rec.pAbsorbed, out = rec.pOutsideLadder;
    var ok = isFinite(out) && out !== null && isFinite(shell) && shell > 0
             && isFinite(ladder);
    var inside = ok ? shell - out : NaN;
    return {
      shell: shell, ladder: ladder, out: ok ? out : NaN,
      edge: rec.ladderEdgePsin,
      gap: shell > 0 ? (ladder - shell) / shell : NaN,
      outFrac: ok ? -out / shell : NaN,
      disc: ok && inside > 0 ? (ladder - inside) / inside : NaN,
      split: !!(ok && inside > 0),
    };
  }

  /**
   * What the free-boundary solves this march stood on have to say for
   * themselves.
   *
   * ★★ONE STRING FOR THE WHOLE LIST, and the worst entry decides its
   * shape.  A coupled march re-solves the equilibrium once per block, so
   * "the equilibrium converged" is not a single fact — and a summary that
   * reported only the last block would hide a march whose first three
   * geometries were never found.  When something did not meet the
   * tolerance, that entry's own residual and iteration count are the ones
   * printed: a reader chasing this needs the number that failed, not an
   * average over the ones that did not.
   */
  function freeText(list) {
    //: ★T-M16 — three verdicts, not two: `settled` (the answer froze on
    //: the mask-jitter floor) is a steady-state reading, reported as
    //: itself rather than folded into either success or failure.
    var bad = list.filter(function (r) {
      return !r.converged && !r.settled; });
    var nset = list.filter(function (r) { return r.settled; }).length;
    var pick = bad.length ? bad[0] : list[list.length - 1];
    //: ★a frozen-geometry run has exactly ONE solve, and "1 of 1 blocks"
    //: would be a count nobody asked for — so the single case gets its own
    //: sentence rather than a plural one with the numbers filled in
    var one = list.length === 1;
    var key = bad.length ? 'e.free.bad'
      : (nset ? 'e.free.settled' : 'e.free.ok');
    return T(key + (one ? '1' : ''), {
      it: pick.iterations, max: pick.maxIter,
      res: e2(pick.residual), tol: e2(pick.tol),
      nbad: bad.length, nset: nset, n: list.length, blk: pick.block });
  }

  function draw() {
    var col = FyPlot.palette($('prof'));
    var xs = last ? Array.from(last.rho) : [0, 1];
    if (!last) {
      FyPlot.xy($('prof'), { series: [{ x: xs, y: [0, 0], color: col.grid }],
                             xlabel: 'rho_tor [m]' });
      return;
    }
    //: ★the reference is DASHED and carries the file's name, so a reader
    //: never has to ask which curve is the answer and which is the thing it
    //: is measured against
    var refSeries = function (key, scale, label) {
      if (!MODEL_REF || !MODEL_REF[key]) return [];
      var y = [], x = [];
      for (var i = 0; i < MODEL_REF.rho.length; i++) {
        if (!isFinite(MODEL_REF[key][i])) continue;
        x.push(MODEL_REF.rho[i]); y.push(MODEL_REF[key][i] / scale);
      }
      return y.length ? [{ x: x, y: y, color: col.alt, kind: 'line',
                           width: 1.4, dash: [5, 3], label: label }] : [];
    };
    FyPlot.xy($('prof'), { series: [
      { x: xs, y: Array.from(last.te).map(function (v) { return v / 1e3; }),
        color: col.lcfs, kind: 'line', width: 2, label: 'T_e' },
      { x: xs, y: Array.from(last.ti).map(function (v) { return v / 1e3; }),
        color: col.accent, kind: 'line', width: 2, label: 'T_i' }]
      .concat(refSeries('te', 1e3, T('e.ser.ref_te')))
      .concat(refSeries('ti', 1e3, T('e.ser.ref_ti'))),
      xlabel: 'rho_tor [m]', ylabel: 'T [keV]', ymin: 0 });

    FyPlot.xy($('dens'), { series: [
      { x: xs, y: Array.from(last.ne).map(function (v) { return v / 1e19; }),
        color: col.lcfs, kind: 'line', width: 2, label: 'n_e' }]
      .concat(refSeries('ne', 1e19, T('e.ser.ref_ne'))),
      xlabel: 'rho_tor [m]', ylabel: 'n_e [1e19 m^-3]', ymin: 0 });

    if (last.q)
      //: ★drawn from the FIRST TRACED node outward.  At a prepended axis node
      //: the channel's own formula returns q(rho_1)/2 by construction, and a
      //: dip that is an artifact of the node reads on a plot exactly like a
      //: reversed-shear core.  The axis value in the table beside it is the
      //: extrapolation the kernel's `q_profile` states for the same quantity.
      FyPlot.xy($('q'), { series: [
        { x: xs.slice(1), y: Array.from(last.q).slice(1).map(Math.abs),
          color: col.lcfs, kind: 'line', width: 2, label: 'q' }]
        .concat(refSeries('q', 1, T('e.ser.ref_q'))),
        xlabel: 'rho_tor [m]', ylabel: 'q', ymin: 0 });

    if (last.chiE)
      FyPlot.xy($('chi'), { series: [
        { x: xs, y: Array.from(last.chiE), color: col.lcfs, kind: 'line',
          width: 2, label: 'chi_e' },
        { x: xs, y: Array.from(last.chiI), color: col.accent, kind: 'line',
          width: 2, label: 'chi_i' }],
        xlabel: 'rho_tor [m]', ylabel: 'chi [m^2/s]', ymin: 0 });

    //: ★the TIME axis, which is the whole point of this bar.  Three traces
    //: that answer different questions — is it settling (T(0)), is the
    //: energy balance closing (W), and is the discharge anywhere near a
    //: limit (beta_N).
    var ts = trace.map(function (r) { return r.t; });
    if (ts.length) {
      FyPlot.xy($('trace'), { series: [
        { x: ts, y: trace.map(function (r) { return r.te0 / 1e3; }),
          color: col.lcfs, kind: 'line', width: 2, label: 'T_e(0) [keV]' },
        { x: ts, y: trace.map(function (r) { return r.ti0 / 1e3; }),
          color: col.accent, kind: 'line', width: 2, label: 'T_i(0) [keV]' },
        { x: ts, y: trace.map(function (r) { return r.betaN; }),
          color: col.alt, kind: 'line', width: 1.4, dash: [4, 3],
          label: 'beta_N' }],
        xlabel: 't [s]', ymin: 0 });
      FyPlot.xy($('power'), { series: [
        { x: ts, y: trace.map(function (r) { return r.wTh / 1e6; }),
          color: col.lcfs, kind: 'line', width: 2, label: 'W_th [MJ]' },
        { x: ts, y: trace.map(function (r) { return r.pAlpha / 1e6; }),
          color: col.accent, kind: 'line', width: 1.6, label: 'P_alpha [MW]' },
        { x: ts, y: trace.map(function (r) { return r.pRad / 1e6; }),
          color: col.alt, kind: 'line', width: 1.4, dash: [4, 3],
          label: 'P_rad [MW]' },
        { x: ts, y: trace.map(function (r) { return r.pOhm / 1e6; }),
          color: col.flux, kind: 'line', width: 1.4, dash: [2, 2],
          label: 'P_ohm [MW]' }],
        xlabel: 't [s]', ymin: 0 });
    }

    //: what the march is standing on, in numbers beside the picture
    var geoRows = [];
    if (last) {
      geoRows.push([T('e.row.geo'), T('e.geom.' + (last.geoSource || 'miller'))]);
      if (last.rMajor) geoRows.push(['R_0', f(last.rMajor, 3) + ' m']);
      if (last.aMinor) geoRows.push(['a', f(last.aMinor, 3) + ' m']);
      if (last.b0) geoRows.push(['B_0', f(last.b0, 3) + ' T']);
      if (last.rho) geoRows.push([T('e.row.rhoedge'),
                                  f(last.rho[last.rho.length - 1], 3) + ' m']);
      geoRows.push([T('e.row.surfaces'), (last.rho ? last.rho.length : 0)]);
      var rr = trace.length ? trace[trace.length - 1] : null;
      if (rr) geoRows.push([T('e.row.volume'), f(rr.volume, 2) + ' m^3']);
      //: ★★AND WHETHER THE EQUILIBRIUM UNDER ALL OF IT WAS FOUND.  Every
      //: row above is read off a psi map; on the device tier that map is
      //: the output of an iteration that may or may not have reached its
      //: tolerance, and until this row existed the two cases printed the
      //: same numbers in the same font.
      var fl = last.freeSolves;
      if (fl && fl.length) geoRows.push([T('e.row.free'), freeText(fl)]);
    }
    if ($('geo'))
      $('geo').innerHTML = geoRows.map(function (q) {
        return '<tr><td>' + q[0] + '</td><td class="num">' + q[1] + '</td></tr>';
      }).join('');

    //: ★★THE BEAM, when one fired.  The deposition profile is the headline
    //: output of this model, so it gets a figure; the numbers beside it are
    //: kept APART on purpose — injected, absorbed, through the far wall,
    //: out on a first orbit, driven current, shielding factor — because
    //: rolling them into one "heating power" is exactly what the prescribed
    //: Gaussian did.
    var bfBox = document.getElementById('model-evolve-beamfig-box');
    var bNote = $('beam-note');
    var bm = last && last.beam;
    if (bfBox) bfBox.hidden = !bm;
    if (bm && $('beamfig')) {
      var bcol = FyPlot.palette($('beamfig'));
      FyPlot.xy($('beamfig'), {
        series: [
          { x: bm.psin, y: bm.pDep.map(function (v) { return v / 1e6; }),
            color: bcol.lcfs, label: 'p_dep [MW/m^3]' },
          { x: bm.psin, y: bm.pE.map(function (v) { return v / 1e6; }),
            color: bcol.accent, label: 'p_e' },
          { x: bm.psin, y: bm.pI.map(function (v) { return v / 1e6; }),
            color: bcol.muted, label: 'p_i' },
        ], xlabel: 'psi_N', ylabel: 'MW/m^3', legend: true });
    }
    if (bNote) {
      bNote.hidden = !bm;
      if (bm) {
        //: the mean shielding factor, volume-weighted over the shells the
        //: current actually lives on — a plain mean would be dominated by
        //: the shells with no beam in them
        var wsum = 0, ssum = 0;
        for (var bi = 0; bi < bm.psin.length; bi++) {
          var w = Math.abs(bm.jNbi[bi]) * bm.area[bi];
          wsum += w; ssum += w * bm.shielding[bi];
        }
        bNote.innerHTML = T('e.beam.done', {
          pinj: f(bm.pInjected / 1e6, 2), pabs: f(bm.pAbsorbed / 1e6, 2),
          shine: (100 * bm.shinethrough).toFixed(2),
          orbit: (100 * bm.orbitLossFraction).toFixed(2),
          inbi: f(bm.iNbi / 1e3, 2),
          shield: wsum > 0 ? f(ssum / wsum, 4) : '—',
          nc: bm.components.length, ns: bm.psin.length,
          cad: bm.cadence > 0
            ? T('e.beam.cadence.every', { n: bm.cadence })
            : T('e.beam.cadence.once') });
      }
    }

    //: ★★THE WAVE'S OWN FIGURE AND ITS OWN READING (T-M10), beside the
    //: beam's and never merged with it: p_dep is where the wave damps,
    //: j_LH is what it drives there, and the shaded band is sigma_j — the
    //: spread between the two ends of the launched band, i.e. the
    //: uncertainty in WHERE the current lands, which is the least certain
    //: thing about this source and the reason the model reports it at all.
    var lfBox = document.getElementById('model-evolve-lhfig-box');
    var lNote = $('lh-note');
    var lhr = last && last.lh;
    if (lfBox) lfBox.hidden = !lhr;
    if (lhr && $('lhfig')) {
      var lcol = FyPlot.palette($('lhfig'));
      FyPlot.xy($('lhfig'), {
        series: [
          { x: lhr.psin, kind: 'envelope',
            yLo: lhr.jLh.map(function (v, i) {
              return (v - lhr.sigmaJ[i]) / 1e6; }),
            yHi: lhr.jLh.map(function (v, i) {
              return (v + lhr.sigmaJ[i]) / 1e6; }),
            color: lcol.muted, label: 'j_LH ± sigma_j [MA/m^2]' },
          { x: lhr.psin, y: lhr.pDep.map(function (v) { return v / 1e6; }),
            color: lcol.lcfs, label: 'p_dep [MW/m^3]' },
          { x: lhr.psin, y: lhr.jLh.map(function (v) { return v / 1e6; }),
            color: lcol.accent, label: 'j_LH [MA/m^2]' },
        ], xlabel: 'psi_N', ylabel: 'MW/m^3 · MA/m^2', legend: true });
    }
    if (lNote) {
      lNote.hidden = !lhr;
      if (lhr) {
        //: the effective band, spanning every system that is on
        var bl = Infinity, bh = -Infinity, reach = 0, wsumL = 0, resTxt = [];
        lhr.launchers.forEach(function (L) {
          bl = Math.min(bl, L.bandEffective[0]);
          bh = Math.max(bh, L.bandEffective[1]);
          //: the accessible fraction weighted by the POWER each system
          //: launches — an unweighted mean over systems would let a system
          //: carrying no power vote
          reach += L.power * L.reachFraction; wsumL += L.power;
          resTxt.push(L.name + ' ' + (L.resLo === null && L.resHi === null
            ? T('e.lh.res_none')
            : T('e.lh.res_at', {
                lo: L.resLo === null ? '—' : f(L.resLo, 3),
                hi: L.resHi === null ? '—' : f(L.resHi, 3) })));
        });
        var bandTxt = f(bl, 2) + '–' + f(bh, 2);
        var cad = lhr.cadence > 0 ? T('e.beam.cadence.every', { n: lhr.cadence })
                                  : T('e.beam.cadence.once');
        lNote.innerHTML = lhr.deposited
          ? T('e.lh.done', {
              nl: lhr.launchers.length,
              plaunch: f(lhr.pLaunched / 1e6, 2),
              pdep: f(lhr.pDeposited / 1e6, 3),
              ilh: f(lhr.iLh / 1e3, 2),
              eta: f(lhr.inputs.etaCd / 1e19, 2),
              reach: wsumL > 0 ? f(reach / wsumL, 3) : '—',
              band: bandTxt, res: resTxt.join(' · '),
              ns: lhr.psin.length, cad: cad })
          //: ★"nothing resonated" is a RESULT and it says WHY: the resonant
          //: temperature of the band against the hottest surface there is.
          : T('e.lh.none', {
              nl: lhr.launchers.length,
              plaunch: f(lhr.pLaunched / 1e6, 2), band: bandTxt,
              tres: lhr.launchers.map(function (L) {
                return f(L.tResHi / 1e3, 2) + '–' + f(L.tResLo / 1e3, 2)
                       + ' keV'; }).join(' · '),
              temax: f(lhr.teMax / 1e3, 2) });
      }
    }

    //: ★the comparison in words, under the profiles it is about — peak and
    //: r.m.s. per channel, and a line saying which reference this is
    if ($('refnote')) {
      if (!MODEL_REF || !last) {
        $('refnote').innerHTML = T('e.ref_note');
      } else {
        var dev = function (key, mine, label) {
          var d = deviation(last.rho, mine, key);
          return d ? label + ' ' + (100 * d.peak).toFixed(1) + '% / ' +
                     (100 * d.rms).toFixed(1) + '%' : null;
        };
        var parts = [dev('te', last.te, 'T_e'), dev('ti', last.ti, 'T_i'),
                     dev('ne', last.ne, 'n_e'),
                     dev('q', last.q, 'q')].filter(Boolean);
        $('refnote').innerHTML = T('e.ref_against', { name: MODEL_REF.name }) +
          (parts.length ? ' ' + T('e.ref_dev', { list: parts.join(' · ') })
                        : '');
      }
    }

    var r = trace.length ? trace[trace.length - 1] : null;
    if (r) {
      var rows = [
        [T('e.row.t'), f(r.t, 3) + ' s'],
        ['T_e(0) / T_i(0)', f(r.te0 / 1e3, 3) + ' / ' + f(r.ti0 / 1e3, 3) + ' keV'],
        ['n_e(0)', f(r.ne0 / 1e19, 2) + ' e19 m^-3'],
        [T('e.row.w'), f(r.wTh / 1e6, 3) + ' MJ'],
        [T('e.row.dwdt'), f(r.dwdt / 1e6, 3) + ' MW'],
        [T('e.row.taue'), f(r.tauE, 3) + ' s'],
        ['beta_N / beta_p', f(r.betaN, 3) + ' / ' + f(r.betaP, 3)],
        [T('e.row.ng'), f(r.greenwald, 2)],
        ['q(0) / q95', f(r.q0, 2) + ' / ' + f(r.q95, 2)],
        [T('e.row.paux'), f(r.pAux / 1e6, 2) + ' MW'],
        [T('e.row.palpha'), f(r.pAlpha / 1e6, 2) + ' MW'],
        //: ★the radiated power with its LINE half beside it when a species
        //: is named.  The split is a decomposition of one ADAS number —
        //: only the sum is that number — so it is written as "total (line)"
        //: rather than as two independent rows.
        [T('e.row.prad'), f(r.pRad / 1e6, 2) + ' MW' +
          (r.pLine > 0 ? ' (' + T('e.row.pline') + ' ' +
                         f(r.pLine / 1e6, 2) + ')' : '')],
        [T('e.row.pohm'), f(r.pOhm / 1e6, 2) + ' MW'],
        ['Q', f(r.qFus, 2)],
        [T('e.row.dt'), e2(r.dt) + ' s'],
      ];
      //: ★the rotation, only when a rotation was SOLVED.  A row reading
      //: zero on a run with no momentum channel would say "it came out at
      //: rest", which is a different statement from "nobody asked".
      if (isFinite(r.omega0)) {
        rows.push([T('e.omega0'), f(r.omega0 / 1e3, 2)]);
        rows.push([T('e.mach'), f(r.mach, 3)]);
      }
      //: ★T-M12: the fast-ion stored energy beside the thermal one (it is
      //: NOT inside w_th — tau_E stays the thermal definition), and the
      //: beam's computed torque where the slider's number used to be.
      //: Both only when a beam supplied them.
      if (r.wFast != null && isFinite(r.wFast))
        rows.push([T('e.row.wfast'), f(r.wFast / 1e3, 1) + ' kJ']);
      if (r.torqueBeam != null && isFinite(r.torqueBeam))
        rows.push([T('e.row.torquenbi'), f(r.torqueBeam, 2) + ' N·m']);
      //: ★what the named impurity IMPLIES, next to what the run actually
      //: used.  Quasi-neutrality with one impurity gives Z_eff = 1 + c Z(Z-1)
      //: and n_i/n_e = 1 - Z c; this tier runs on the Z_eff CONTROL and an
      //: undiluted bulk ion, so the two are REPORTED for the reader to
      //: compare rather than folded in silently.
      //: ★how often the electron-ion exchange time had to shorten the step.
      //: A step longer than that time does not blow up — it decouples the
      //: heat pair silently — so the cap is reported rather than left to be
      //: inferred from a dt that is not the one that was asked for.
      if (last && last.dtCapped > 0)
        rows.push([T('e.row.dtcap'),
                   last.dtCapped + ' / ' + last.steps + ' · τ_x ' +
                   e2(last.tauExch) + ' s']);
      //: ★how many times the turbulent closure was actually evaluated. A
      //: cadence that never fired would be a neoclassical run wearing a
      //: turbulent label, and nothing else on the page would say so.
      if (last && last.turbEvals > 0)
        rows.push([T('e.row.turb'),
                   last.turbEvals + ' / ' + last.steps]);
      if (last && last.impurity) {
        var im = last.impurity;
        rows.push([T('e.row.imp'),
                   im.name + ' ' + (100 * im.c).toFixed(2) + '% · Z=' + im.z]);
        //: ★the same three numbers mean two different things, and the rows
        //: say which: APPLIED (the composition the march ran on) or IMPLIED
        //: (what the concentration beside it would mean, had anything used
        //: it).  One label for both would be the quiet half-truth this page
        //: keeps refusing to print.
        if (im.applied) {
          rows.push([T('e.row.imp_dil_on'), f(im.dilution, 3)]);
          rows.push([T('e.row.imp_f_on'), f(im.dtFraction, 3)]);
        } else {
          rows.push([T('e.row.imp_zeff'),
                     f(im.zEff, 2) + ' / ' + f(+$('zeff').value, 2)]);
          rows.push([T('e.row.imp_dil'), f(im.dilution, 3)]);
        }
      }
      //: ★★THE BEAM'S THREE POWERS, apart.  The shell quadrature and the
      //: ladder integral are the SAME integral over two discretisations of
      //: the same plasma, and the march ran on the ladder one — so both are
      //: printed and the gap between them is a row rather than a number a
      //: reader would have to notice was missing.
      if (last && last.beam) {
        var bmr = last.beam;
        rows.push([T('e.row.beam_shine'),
                   (100 * bmr.shinethrough).toFixed(2) + ' %']);
        rows.push([T('e.row.beam_i'), f(bmr.iNbi / 1e3, 2) + ' kA']);
        //: ★★T-M11: the ladder number is the BEAM's own ladder integral, not
        //: the total auxiliary power — with a wave on as well, the total
        //: would answer a different question from the one this row asks.
        var qd = quadSplit(bmr, r ? r.pAuxBeam : NaN);
        rows.push([T('e.row.beam_gap'),
                   f(bmr.pAbsorbed / 1e6, 3) + ' / ' +
                   f(qd.ladder / 1e6, 3) + ' MW · ' + pct(qd.gap)]);
        if (qd.split) {
          rows.push([T('e.row.beam_calibre', { edge: f(qd.edge, 2) }),
                     f(qd.out / 1e6, 4) + ' MW · ' + pct(qd.outFrac)]);
          rows.push([T('e.row.beam_disc'), pct(qd.disc)]);
        }
      }
      //: ★the wave's three numbers, each on its own row.  The accessible
      //: fraction and eta_CD are NEVER one number: one says whether the
      //: wave arrives at a surface, the other what it drives once it has,
      //: and a product of the two could not say which of them was small.
      if (last && last.lh) {
        var lr2 = last.lh;
        rows.push([T('e.row.lh_p'),
                   f(lr2.pLaunched / 1e6, 2) + ' / ' +
                   f(lr2.pDeposited / 1e6, 3) + ' MW']);
        rows.push([T('e.row.lh_i'), f(lr2.iLh / 1e3, 2) + ' kA']);
        var reach2 = 0, wl2 = 0;
        lr2.launchers.forEach(function (L) {
          reach2 += L.power * L.reachFraction; wl2 += L.power; });
        rows.push([T('e.row.lh_acc'),
                   wl2 > 0 ? f(reach2 / wl2, 3) : '—']);
        rows.push([T('e.row.lh_eta'),
                   f(lr2.inputs.etaCd / 1e19, 2) + ' e19 A/W/m^2']);
        var lq = quadSplit({ pAbsorbed: lr2.pDeposited,
                             pOutsideLadder: lr2.pOutsideLadder,
                             ladderEdgePsin: lr2.ladderEdgePsin },
                           r ? r.pAuxLh : NaN);
        rows.push([T('e.row.lh_gap'),
                   f(lr2.pDeposited / 1e6, 3) + ' / ' +
                   f(lq.ladder / 1e6, 3) + ' MW · ' + pct(lq.gap)]);
      }
      if (MODEL_REF && last) {
        var dte = deviation(last.rho, last.te, 'te');
        if (dte) rows.push([T('e.row.ref'),
                            (100 * dte.peak).toFixed(1) + '% / ' +
                            (100 * dte.rms).toFixed(1) + '%']);
      }
      if (last && last.crashes && last.crashes.length) {
        var lastCrash = last.crashes[last.crashes.length - 1];
        rows.push([T('e.row.saw'), last.crashes.length + ' · ' +
                   T('e.row.saw_at', { t: f(lastCrash.t, 4),
                                       r1: f(lastCrash.r1, 3),
                                       rm: f(lastCrash.rMix, 3) })]);
      }
      $('scalars').innerHTML = rows.map(function (q) {
        return '<tr><td>' + q[0] + '</td><td class="num">' + q[1] + '</td></tr>';
      }).join('');
    }
    //: ★★T-M11 IN WORDS, under the deposition figures it is about.  The two
    //: numbers are already two rows in the table; what this paragraph adds
    //: is which of them is this bar's CALIBRE and why the difference is not
    //: one thing.  It appears only when a beam ran: a paragraph about a
    //: quadrature nobody performed would be a claim about nothing.
    var qNote = $('quad-note');
    if (qNote) {
      var qb = last && last.beam;
      qNote.hidden = !qb;
      if (qb) {
        var qq = quadSplit(qb, r ? r.pAuxBeam : NaN);
        qNote.innerHTML = qq.split
          ? T('e.quad.note', {
              shell: f(qq.shell / 1e6, 3), ladder: f(qq.ladder / 1e6, 3),
              edge: f(qq.edge, 2), gap: pct(qq.gap),
              out: f(qq.out / 1e6, 4), outpct: pct(qq.outFrac),
              disc: pct(qq.disc) })
          : T('e.quad.na', { edge: f(qq.edge, 2) });
      }
    }

    //: ★★the refinement's own row, when it ran: the fit residuals, the
    //: current the FIXED solve produced against the one the free solve was
    //: asked for, and — first — the ZERO TEST.  The zero test is the row
    //: that says whether the machine works at all: the same loop re-run on
    //: the p'/FF' the free solve itself implies, compared with that field.
    //: A machine that cannot come back to the equilibrium it started from
    //: has nothing to say about a different pressure, and both gauges
    //: (total flux against per radian) stand or fall on that one number.
    var refNote = $('refine-note');
    if (refNote) {
      var lastR = rounds.length ? rounds[rounds.length - 1] : null;
      if (lastR && lastR.refined) {
        //: ★the zero test is a GATE upstream of this row: a refinement the
        //: page reports has already reproduced its own starting point, so
        //: what is left to say here is by how much
        var rr = lastR.refined, zt = rr.zero, ztxt = '';
        if (zt)
          ztxt = '<br>' + T('e.cfix.zero', {
            psi: e2(zt.psi), ip: f(zt.ip / 1e3, 1),
            ipref: f(zt.ipRef / 1e3, 1), iprel: (100 * zt.ipRel).toFixed(2),
            it: zt.iterations });
        refNote.hidden = false;
        refNote.innerHTML = T('e.cfix.done', {
          ip: f(rr.ip / 1e3, 1), target: f(rr.ipTarget / 1e3, 1),
          rel: (100 * Math.abs(rr.ip - rr.ipTarget)
                / Math.max(Math.abs(rr.ipTarget), 1e-30)).toFixed(1),
          resp: (100 * rr.resP).toFixed(2), resf: (100 * rr.resF).toFixed(2),
          degp: rr.degP, degf: rr.degF, it: rr.iterations }) + ztxt;
      } else if (lastR && lastR.refineWhy) {
        refNote.hidden = false;
        refNote.innerHTML = T('e.cfix.failed', { why: lastR.refineWhy });
      } else {
        refNote.hidden = true;
      }
    }
    $('rounds').innerHTML = rounds.map(function (q) {
      return '<tr><td>' + q.block + '</td><td class="num">' + f(q.beta0, 3) +
             '</td><td class="num">' + f(q.bpTarget, 3) + ' / ' +
             f(q.bpEq, 3) +
             //: ★the refined equilibrium's own beta_p, only when there IS
             //: one — an em dash here is "the family's answer stands", and
             //: printing the family's number twice would hide that
             (isFinite(q.bpFix) ? ' / ' + f(q.bpFix, 3) : ' / —') +
             '</td><td class="num">' +
             (q.fit ? f(q.fit.emp, 2) + ' / ' + f(q.fit.enp, 2) +
                      ' (' + e2(q.fit.rms) + ')' : '—') + '</td></tr>';
    }).join('');
  }

  // --- worker --------------------------------------------------------------

  /**
   * The ADAS species menu, as the KERNEL reports it.
   *
   * ★It is filled once, on ready, and the selection is preserved across the
   * fill so an imported session that named a species does not lose it to a
   * menu that had not been built yet.  A name the kernel does not carry is
   * left in the control and refused at run time — silently dropping it here
   * would turn a typo into a plasma with no impurity radiation.
   */
  function fillSpecies(names) {
    var sel = $('species');
    if (!sel || !names || !names.length) return;
    var want = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    names.forEach(function (nm) {
      var o = document.createElement('option');
      o.value = nm; o.textContent = nm;
      sel.appendChild(o);
    });
    if (want) sel.value = want;
    speciesReady = true;
  }
  var speciesReady = false;

  function onReady(m) {
    if (m && m.species) fillSpecies(m.species);
    setBusy(false, T('e.ready'));
  }

  function onStep(m) {
    //: the live trace is the WHOLE discharge on a continued march, so the
    //: figure does not jump back to t = 0 while it runs
    if (!trace.length && priorTrace.length) trace = priorTrace.slice();
    trace.push(m.reading);
    last = { rho: m.rho, psin: m.psin, te: m.te, ti: m.ti, ne: m.ne, q: m.q,
             chiE: m.chiE, chiI: m.chiI, jni: m.jni, geoSource: m.geoSource };
    S.progress(m.step / Math.max(1, m.nSteps));
    draw();
    setBusy(true, T('e.step', { it: m.step, n: m.nSteps,
                                t: m.reading.t.toFixed(3),
                                t0: (m.reading.te0 / 1e3).toFixed(2) }));
  }

  function onCouple(m) {
    rounds.push({ block: m.block, beta0: m.beta0, fit: m.fit,
                  bpTarget: m.bpTarget, bpEq: m.bpEq, bpFix: m.bpFix,
                  free: m.free || null,
                  refined: m.refined, refineWhy: m.refineWhy });
    draw();
    setBusy(true, T('e.couple_at', { blk: m.block, b: m.beta0.toFixed(3) }));
  }

  function onDone(m) {
    S.progress(1);
    //: ★the end state becomes the next segment's start, and the clock with
    //: it.  Kept only when the march actually produced profiles: an errored
    //: run must not leave a half-state for the next press to continue from.
    if (m.te && m.te.length) {
      resumeState = { te: Array.from(m.te), ti: Array.from(m.ti),
                      ne: Array.from(m.ne),
                      psi: m.psi ? Array.from(m.psi) : null };
      resumeAt = m.tEnd;
    }
    trace = priorTrace.concat(m.trace);
    last = { rho: m.rho, psin: m.psin, te: m.te, ti: m.ti, ne: m.ne, q: m.q,
             crashes: m.crashes || [],
             chiE: m.chiE, chiI: m.chiI, jni: m.jni, ohm: m.ohm,
             alpha: m.alpha, rad: m.rad, line: m.line, impurity: m.impurity,
             ni: m.ni, nz: m.nz,
             psi: m.psi, vprime: m.vprime,
             gm3: m.gm3, gm2: m.gm2, fpol: m.fpol, geoSource: m.geoSource,
             b0: m.b0, aMinor: m.aMinor, rMajor: m.rMajor,
             steps: m.steps, tEnd: m.tEnd, rounds: m.rounds, ms: m.ms,
             dtCapped: m.dtCapped | 0, tauExch: m.tauExch,
             turbEvals: m.turbEvals | 0, turbChi: m.turbChi,
             chiNeo: m.chiNeo, turbX: m.turbX, turbSub: m.turbSub,
             omega: m.omega || null, torque: m.torque || null,
             //: ★<R^2> (T-M8) and the R_maj^2 it replaced, both — the file
             //: carries the two so a reader can divide them rather than
             //: take "O((a/R)^2)" on this page's word
             r2: m.r2 || null, rmaj2: m.rmaj2 || null,
             prandtl: m.prandtl === undefined ? null : m.prandtl,
             //: ★the beam's whole record, inputs included, when a beam
             //: was what the auxiliary power was
             beam: m.beam || null,
             //: ★and the wave's, beside it — two records, because two
             //: sources that deposit in different places by different
             //: physics cannot share one
             lh: m.lh || null,
             //: ★every free-boundary solve this march stood on, in order,
             //: each with its own verdict — block 0 is the equilibrium the
             //: whole run is traced from, the rest are the alternation's
             freeSolves: m.freeSolves || null,
             freeUnconverged: m.freeUnconverged | 0,
             refinedField: m.refinedField || null };
    resumeNote();
    if (m.rounds && m.rounds.length > 1)
      rounds = m.rounds.slice(1).map(function (r, i) {
        return { block: i + 1, beta0: r.beta0, fit: r.fit,
                 bpTarget: r.bpTarget, bpEq: r.bpEq, free: r.free || null };
      });
    draw();
    var r = trace.length ? trace[trace.length - 1] : null;
    //: ★a march that stopped because it was told to is NOT a march that
    //: reached a steady state, and the two read the same on a plot.  The
    //: kernel reports which, and so does this line.
    var settled = m.rounds && m.rounds.length
      && m.rounds[m.rounds.length - 1].settled;
    //: ★★AND THE EQUILIBRIUM IT STOOD ON SAYS ITS PIECE FIRST.  A march
    //: whose free-boundary solve never reached its tolerance is a march on
    //: a psi map the solver did not find, and every profile, every q and
    //: every volume average printed beside it inherits that.  It goes
    //: BEFORE the steady/capped sentence because it is the larger claim:
    //: "settled" on a geometry that is not an equilibrium is settled onto
    //: nothing.
    var fbad = (m.freeSolves || []).filter(function (r) {
      return !r.converged && !r.settled; });
    var vparts = [];
    if (fbad.length)
      vparts.push(T('e.verdict.freebad', {
        nbad: fbad.length, n: (m.freeSolves || []).length,
        blk: fbad[0].block, it: fbad[0].iterations, max: fbad[0].maxIter,
        res: e2(fbad[0].residual), tol: e2(fbad[0].tol) }));
    vparts.push(settled
      ? T('e.verdict.steady', { t: f(m.tEnd, 3),
                                d: e2(m.rounds[m.rounds.length - 1].delta) })
      : T('e.verdict.capped', { n: m.steps, t: f(m.tEnd, 3) }));
    $('verdict').innerHTML = vparts.join(' ');
    setBusy(false, T('e.done', { n: m.steps, t: f(m.tEnd, 3),
                                 ms: m.ms,
                                 t0: r ? (r.te0 / 1e3).toFixed(2) : '—' }));
  }

  function onError(m) {
    S.progress(0);
    setBusy(false, T('e.fail', { why: m.message }), 'err');
  }

  //: the poloidal picture of whatever geometry the bar is on, as the worker
  //: traced it.  Kept whole so a redraw (theme, language, fold) does not
  //: need the worker again.
  var geom = null;
  function onGeometry(m) { geom = m; drawXsec(); }

  /**
   * The cross-section.
   *
   * ★★It is drawn from the SAME surfaces the metric came from, which is the
   * only reason it is worth drawing: a picture assembled from the shape
   * controls would agree with the metric on the analytic tier and disagree
   * with it on the two that matter.  The outlines cross the wire as flat
   * [r, z, ...] polylines and are handed to `FyPlot.poloidal` as segment
   * arrays — that entry keeps the aspect ratio true, which is the whole
   * point of showing elongation at all.
   */
  function drawXsec() {
    var c = $('xsec');
    if (!c) return;
    if (!geom || !geom.outlines || !geom.outlines.length) {
      var col0 = FyPlot.palette(c);
      FyPlot.xy(c, { series: [{ x: [0, 1], y: [0, 0], color: col0.grid }],
                     xlabel: 'R [m]' });
      return;
    }
    //: a MACHINE-shaped object built from what the geometry itself carries:
    //: an imported equilibrium brings its own wall, and drawing the current
    //: device's around it would put two machines in one picture
    var mach = {
      grid: geom.view,
      limiter: geom.limR ? { r: geom.limR, z: geom.limZ } : { r: [], z: [] },
      vessel: [], vesselOutline: [], coils: [],
    };
    var segs = function (flat) {
      //: `drawSegs` takes quadruples; an outline is a polyline, so it is
      //: expanded here rather than a second drawing path being added there
      var out = [];
      for (var i = 0; i + 3 < flat.length; i += 2)
        out.push(flat[i], flat[i + 1], flat[i + 2], flat[i + 3]);
      out.push(flat[flat.length - 2], flat[flat.length - 1], flat[0], flat[1]);
      return out;
    };
    FyPlot.poloidal(c, {
      machine: mach, view: geom.view,
      psi: true, nLevels: geom.outlines.length,
      psiAxis: 0, psiBnd: 1,
      fluxSegs: { inner: geom.outlines.map(segs), outer: [] },
      lcfs: geom.lcfs || null,
      axis: geom.axisR !== undefined ? [geom.axisR, geom.axisZ] : null,
    });
  }

  // --- a reference profile set, to be measured against ---------------------
  //
  // ★★What this is FOR.  A page that only ever shows its own answer cannot
  // be wrong in front of the reader; one that draws a published profile
  // beside it can.  The reference travels as the CSV a code wrote — no
  // conversion on the way in beyond units — and it is drawn DASHED, never
  // as a fit, never as a target the march was pushed toward.
  //
  // ★It is on rho_tor [m], the same label this bar marches on, so nothing is
  // re-gridded to make the two lie on top of each other.  A reference on a
  // different coordinate would need a mapping, and a mapping made here would
  // be the modelling choice this comparison exists to avoid.
  function deviation(rho, mine, key) {
    var r = modelRefAt(rho, key);
    if (!r || !mine) return null;
    var peak = 0, sum = 0, n = 0, scale = 0;
    for (var i = 0; i < rho.length; i++) {
      if (!isFinite(r[i]) || !isFinite(mine[i])) continue;
      scale = Math.max(scale, Math.abs(r[i]));
    }
    if (!(scale > 0)) return null;
    for (var k = 0; k < rho.length; k++) {
      if (!isFinite(r[k]) || !isFinite(mine[k])) continue;
      var d = Math.abs(mine[k] - r[k]) / scale;
      peak = Math.max(peak, d); sum += d * d; n += 1;
    }
    return n ? { peak: peak, rms: Math.sqrt(sum / n), n: n } : null;
  }

  // --- file exchange -------------------------------------------------------

  var CONTROLS = ['geometry', 'dt', 'nsteps', 'dttarget', 'nlev', 'edgepsin',
                  'te0', 'ti0',
                  'peakt', 'peakn', 'edgete', 'edgeti', 'edgene', 'vloop',
                  'pe', 'pi', 'dep', 'depw', 'fuel', 'icd', 'zeff', 'dtfrac',
                  //: the impurity is part of the answer: the same controls
                  //: with a different species radiate differently
                  'species', 'cimp', 'closure',
                  'chiratio', 'dchi', 'pinch', 'dpc', 'ip', 'couple', 'relax',
                  'sawmix', 'chi0', 'ne0', 'amin', 'rmaj', 'kappa', 'delta',
                  'q95', 'bunit',
                  //: the discharge's own shape in time: a run with a
                  //: waveform and one without are different runs
                  'waveramp', 'waveflat', 'waveend', 'wavestart', 'waveend2',
                  //: the turbulent tier's budget: the same controls at a
                  //: different subset are a different run
                  'turbevery', 'turbnrad', 'turbnky', 'turbrelax',
                  'degp', 'degf',
                  //: the momentum channel's two numbers: a run with a torque
                  //: and one without are different runs, and chi_phi is
                  //: prescribed so the Prandtl number IS part of the model
                  'torque', 'prandtl',
                  //: ★the free-boundary solver's iteration budget: a run
                  //: that was allowed 3000 iterations and one that was
                  //: allowed 20 are different runs, and the file has to be
                  //: able to say which one produced the answer in it
                  'freeiter',
                  //: ★the beam: every one of these changes where the
                  //: power lands, so every one is part of the run
                  'beampower', 'beamenergy', 'beamrtan', 'beamz',
                  'beamwidth', 'beamdir', 'beamstop', 'beamf1',
                  'beamf2', 'beamf3', 'beamshells',
                  //: ★the wave: the band, the up-shift and the calibration
                  //: coefficient each move where the current lands, so each
                  //: is part of the run the file has to be able to reproduce
                  'lhpower1', 'lhpower2', 'lhnpar1lo', 'lhnpar1hi',
                  'lhnpar2lo', 'lhnpar2hi', 'lhuplo', 'lhuphi',
                  'lhetacd', 'lhxi', 'lhwidth', 'lhshells'];
  var CHECKS = ['ch-heat', 'ch-density', 'ch-current', 'ch-momentum',
                'alpha', 'brem',
                'ohmic', 'bootstrap', 'sawtooth', 'useref',
                'wave', 'wavepower', 'wavevloop', 'wavefuel', 'quasi',
                'couplefixed', 'beam', 'beamorbit', 'lh'];
  //: ★one list for the file: `collect`/`apply` already know a checkbox from
  //: a range, so a switch does not need a second carrier of its own — and a
  //: switch left out of the session is a run that cannot be reproduced
  var SESSION = CONTROLS.concat(CHECKS);

  var FORMATS = {
    gfile: {
      importOnly: true, text: true,
      docPage: 'gfile',
      label: T('e.g.label'), filename: 'g_fylite.00000',
      accept: '.00000,.geqdsk,g*,text/plain',
      exportHint: T('x.g.no_export'), importHint: T('e.g.import_hint'),
      build: function () { return { error: T('x.g.no_export') }; },
      apply: function (text, name) {
        var g = FyGeqdsk.parse(text);
        var sm = FyGeqdsk.boundaryShape(g);
        if (!sm || !(sm.a > 0)) throw new Error(T('x.g.nobnd'));
        gfile = g;
        //: ★ONE imported equilibrium per page, like the reference profiles:
        //: the interpretive bar runs on the same metric this one marches on,
        //: and a second import entry for the same document would let a
        //: reader calibrate on one equilibrium and predict on another
        self.MODEL_GFILE = gfilePayload();
        //: ★the geometry SOURCE follows the import, because a reader who
        //: hands this bar an equilibrium means it to be used — and the
        //: control shows which one it is now on
        FySession.apply({ geometry: 'gfile' }, S.scope);
        syncLabels();
        return T('e.g.imported', { name: name, r0: sm.r0.toFixed(3),
                                   a: sm.a.toFixed(3),
                                   kappa: sm.kappa.toFixed(2),
                                   nw: g.nw, nh: g.nh });
      },
    },
    ref: {
      importOnly: true, text: true,
      docPage: 'reference',
      label: T('e.r.label'), filename: 'reference_profiles.csv',
      accept: '.csv,text/csv,text/plain',
      exportHint: T('e.r.no_export'), importHint: T('e.r.import_hint'),
      build: function () { return { error: T('e.r.no_export') }; },
      apply: function (text, name) {
        var r = modelParseReference(text, name);
        MODEL_REF = r;
        draw();
        return T('e.r.imported', {
          name: name, n: r.rho.length,
          lo: r.rho[0].toFixed(3), hi: r.rho[r.rho.length - 1].toFixed(3),
          te0: (r.te[0] / 1e3).toFixed(2) });
      },
    },
    //: ★★THE EDGE BACK OUT.  The reconstruction bar on the analysis page
    //: takes a pressure profile on a uniform psi_N grid as its KINETIC
    //: CONSTRAINT, and that is exactly what a march produces — so a
    //: prediction can be handed to a reconstruction and checked against
    //: the magnetics.  Same document the analysis page writes for itself:
    //: one format, one meaning, and the reader's own `apply` on the far
    //: side.
    pressure: {
      exportOnly: true,
      docPage: 'profile', docKey: 'fylite:pressure',
      label: T('e.p.label'),
      filename: 'fylite_model_pressure.json',
      accept: '.json,application/json',
      exportHint: T('e.p.export_hint'),
      build: function () { return buildPressure(); },
    },
    json: {
      docPage: 'evolve',
      label: T('io.label.json'), filename: 'fylite_evolve_session.json',
      accept: '.json,application/json',
      exportHint: T('e.j.export_hint'), importHint: T('e.j.import_hint'),
      apply: function (text, name) {
        var doc = FySession.parse(text);
        if (doc['fylite:page'] !== 'evolve')
          throw new Error(T('msg.wrong_page', { page: doc['fylite:page'] }));
        var r = FySession.apply(doc['fylite:config'], S.scope);
        syncLabels(); syncGeometry(); costNote();
        //: configuration only, and NOT re-run: a march costs seconds
        return T('e.j.imported', { name: name, n: r.applied.length });
      },
      build: function () {
        if (!last || !trace.length) return { error: T('e.none_yet') };
        var doc = FySession.envelope('evolve',
                                     FySession.collect(SESSION, S.scope),
                                     S.kernel());
        var F = self.FyFyo, sig = FySession.sig;
        var col = function (key) {
          return trace.map(function (r) {
            var v = r[key];
            return (typeof v === 'number' && isFinite(v)) ? +v.toPrecision(7)
                                                          : null;
          });
        };

        //: ★★THE RESULT IS fyo, NOT A PRIVATE BLOCK.  This used to be one
        //: `fylite:profile` object whose keys were spelled here and nowhere
        //: else: readable by this app and by nothing that already speaks
        //: IMAS.  It is four DECLARED documents now — the metric ladder as
        //: `equilibrium`, the state as `core_profiles`, the closure as
        //: `core_transport`, the sources as `core_sources` — plus the whole
        //: march as `summary`, written through `FyFyo.put` so this file
        //: names a SLOT and never where it goes
        //: (`rust/fylite/src/fyo.rs`).
        //:
        //: ★What stays `fylite:`-prefixed and private is what the DD has no
        //: home for: the sawtooth crashes, the coupling rounds, and the
        //: imported reference with the deviation measured against it.
        var eq = { '@type': F.type('LADDER') };
        F.put(eq, 'LADDER', 'rho', sig(last.rho));
        F.put(eq, 'LADDER', 'psin', sig(last.psin));
        F.put(eq, 'LADDER', 'vprime', sig(last.vprime));
        F.put(eq, 'LADDER', 'gm3', sig(last.gm3));
        if (last.gm2) F.put(eq, 'LADDER', 'gm2', sig(last.gm2));
        F.put(eq, 'LADDER', 'fpol', sig(last.fpol));
        F.put(eq, 'LADDER', 'q', sig(last.q));
        //: ★the scale the metric belongs to, in the EQUILIBRIUM slots that
        //: share this document's type: without B0 and the two radii the
        //: current channel cannot be re-run by anyone, and on the ladder
        //: tiers they are the DEVICE's rather than any control on this page
        F.put(eq, 'EQUILIBRIUM', 'b0', last.b0);
        F.put(eq, 'EQUILIBRIUM', 'r0', last.rMajor);
        F.put(eq, 'EQUILIBRIUM', 'psi_1d', sig(last.psi));
        eq['fylite:a_minor'] = last.aMinor;
        eq['fylite:geometry_source'] = 'fylite:' + last.geoSource;

        var cp = { '@type': F.type('CORE_PROFILES') };
        F.put(cp, 'CORE_PROFILES', 'psin', sig(last.psin));
        F.put(cp, 'CORE_PROFILES', 'te', sig(last.te));
        F.put(cp, 'CORE_PROFILES', 'ti', sig(last.ti));
        F.put(cp, 'CORE_PROFILES', 'ne', sig(last.ne));
        F.put(cp, 'CORE_PROFILES', 'zeff', +$('zeff').value);
        //: ★the MAIN ION's density, in its declared slot: with the impurity
        //: in the quasi-neutrality it is no longer n_e, and a file that
        //: carried only n_e could not say what the march's ion channel and
        //: its fusion rate actually ran on
        if (last.ni) F.put(cp, 'CORE_PROFILES', 'ni', sig(last.ni));
        //: ★★THE ROTATION, and it stays `fylite:`-prefixed on purpose: the
        //: fyo CORE_PROFILES table has no rotation slot, and writing omega
        //: into a slot the declaration does not have would be a document
        //: only this page can read.  The TORQUE DENSITY and the Prandtl
        //: number travel with it, because a rotation profile without the
        //: torque that produced it and the chi_phi it diffused with cannot
        //: be re-run by anyone — and chi_phi here is a MODELLING choice
        //: (Pr times the ion heat channel), not a closure.
        if (last.omega) {
          cp['fylite:omega_tor'] = sig(last.omega, 12);
          cp['fylite:omega_tor_units'] = 'rad.s^-1';
          cp['fylite:torque_density'] = sig(last.torque, 12);
          cp['fylite:torque_density_units'] = 'J.m^-3';
          cp['fylite:momentum_prandtl'] = last.prandtl;
          cp['fylite:omega_edge'] = 0;
          //: ★★<R^2> IS the kernel's column now (T-M8) — the flux-surface
          //: average the capacity `V' n m <R^2>` actually means, off the
          //: same traced surfaces (or the same `geo_surface` call) as the
          //: rest of the metric.  It travels because nothing else in the
          //: file determines it: an average is not recoverable from the
          //: columns beside it.
          cp['fylite:r2'] = sig(last.r2, 12);
          cp['fylite:r2_note'] = '<R^2>, flux-surface average (kernel)';
          //: ★and R_maj(rho)^2 beside it — what this channel ran on before
          //: T-M8.  Two columns a reader can divide is what turns
          //: "O((a/R)^2)" from a claim into a number they can check.
          cp['fylite:rmaj2'] = sig(last.rmaj2, 12);
          cp['fylite:rmaj2_note'] = 'R_maj(rho)^2 — the pre-T-M8 substitute';
        }
        //: ★the impurity is stated in the profiles it dilutes, and what it
        //: IMPLIES travels with it — this tier did not apply either number,
        //: and a file that carried only the concentration would let a reader
        //: assume it had
        if (last.impurity)
          cp['fylite:impurity'] = {
            'fylite:species': last.impurity.name,
            'fylite:z': last.impurity.z,
            'fylite:concentration': last.impurity.c,
            'fylite:z_eff': +last.impurity.zEff.toPrecision(7),
            'fylite:dilution': +last.impurity.dilution.toPrecision(7),
            //: ★★APPLIED or merely IMPLIED, in the file and not only on the
            //: page: the same three numbers mean the composition the march
            //: ran on in one case and an arithmetic aside in the other.
            'fylite:applied': !!last.impurity.applied,
            'fylite:n_z': last.nz ? sig(last.nz) : null,
            'fylite:dt_fraction': last.impurity.dtFraction === undefined
              ? null : +last.impurity.dtFraction.toPrecision(7),
          };

        var ct = { '@type': F.type('CORE_TRANSPORT') };
        F.put(ct, 'CORE_TRANSPORT', 'rho', sig(last.rho));
        F.put(ct, 'CORE_TRANSPORT', 'psin', sig(last.psin));
        F.put(ct, 'CORE_TRANSPORT', 'chi_e', sig(last.chiE));
        F.put(ct, 'CORE_TRANSPORT', 'chi_i', sig(last.chiI));
        //: ★★the turbulent tier's own record: the SPLIT (neoclassical and
        //: turbulent, which sum to the chi beside them), the radial subset
        //: TGLF was actually evaluated on, and HOW MANY TIMES.  A file with
        //: only the sum could not say whether the cadence ever fired, and a
        //: run whose cadence never fired is a neoclassical run wearing a
        //: turbulent label.
        if (last.turbEvals > 0)
          ct['fylite:turbulence'] = {
            'fylite:evaluations': last.turbEvals,
            'fylite:cadence_steps': +$('turbevery').value | 0,
            'fylite:radii': +$('turbnrad').value | 0,
            'fylite:ky_points': +$('turbnky').value | 0,
            'fylite:relaxation': +$('turbrelax').value,
            'fylite:chi_neoclassical': last.chiNeo ? sig(last.chiNeo) : null,
            'fylite:chi_turbulent': last.turbChi ? sig(last.turbChi) : null,
            'fylite:evaluated_at_rho': last.turbX ? sig(last.turbX) : null,
            'fylite:chi_at_those_radii': last.turbSub ? sig(last.turbSub) : null,
          };

        var cs = { '@type': F.type('CORE_SOURCES') };
        F.put(cs, 'CORE_SOURCES', 'psin', sig(last.psin));
        if (last.jni) F.put(cs, 'CORE_SOURCES', 'j_par', sig(last.jni));
        //: ★the source ROWS this page can honestly fill: the DD's
        //: `electrons/energy` is a power density and so are these, but they
        //: are the STATE-DEPENDENT terms only (alpha, radiation, ohmic) —
        //: the prescribed Gaussian is in the config, where it came from.
        if (last.alpha) F.put(cs, 'CORE_SOURCES', 'p_i', sig(last.alpha));
        if (last.rad) cs['fylite:p_radiation'] = sig(last.rad);
        if (last.line) cs['fylite:p_line'] = sig(last.line);
        if (last.ohm) cs['fylite:p_ohmic'] = sig(last.ohm);

        //: ★THE WHOLE MARCH, in the DD's own `summary` shape — one array
        //: per quantity over the time axis.  Whether a march settled, and
        //: how the stored energy got where it is, cannot be re-judged from
        //: an end state alone.  ★There is no `dt` row: it is
        //: `time[i] - time[i-1]` exactly, and a column a reader can derive
        //: is a column two hosts can disagree about.
        var sm = { '@type': F.type('SUMMARY') };
        [['time', 't'], ['te_axis', 'te0'], ['ti_axis', 'ti0'],
         ['ne_axis', 'ne0'], ['q_axis', 'q0'], ['q95', 'q95'],
         ['w_th', 'wTh'], ['dw_dt', 'dwdt'], ['tau_e', 'tauE'],
         ['beta_n', 'betaN'], ['beta_p', 'betaP'],
         ['greenwald', 'greenwald'], ['p_aux', 'pAux'],
         ['p_alpha', 'pAlpha'], ['p_rad', 'pRad'], ['p_line', 'pLine'],
         ['p_ohm', 'pOhm'], ['q_fusion', 'qFus'],
         ['steady_change', 'delta']].forEach(function (pair) {
          F.put(sm, 'SUMMARY', pair[0], col(pair[1]));
        });
        //: ★T-M12: the fast-ion branches' two summary rows, only when a
        //: beam produced them — fylite-namespaced because the DD has no
        //: such column.  `w_fast` is ∫(p_par/2 + p_perp)dV, NOT inside
        //: `w_th`; `torque_nbi` is the computed total that replaced the
        //: slider.
        if (last.beam) {
          sm['fylite:w_fast'] = col('wFast');
          sm['fylite:torque_nbi'] = col('torqueBeam');
        }

        doc['fylite:result'] = { equilibrium: eq, core_profiles: cp,
                                 core_transport: ct, core_sources: cs,
                                 summary: sm };

        //: ★the reference travels WITH the answer, and so does the
        //: comparison: a file that carried only the profile would let the
        //: same numbers be re-published without the thing they were
        //: measured against
        if (MODEL_REF) {
          var dv = function (key, mine) {
            var d = deviation(last.rho, mine, key);
            return d ? { 'fylite:peak': d.peak, 'fylite:rms': d.rms,
                         'fylite:points': d.n } : null;
          };
          doc['fylite:reference'] = {
            'fylite:source': MODEL_REF.name,
            'fylite:rho_tor': sig(MODEL_REF.rho),
            'fylite:t_e': sig(MODEL_REF.te),
            'fylite:t_i': sig(MODEL_REF.ti),
            'fylite:n_e': sig(MODEL_REF.ne),
            'fylite:q': sig(MODEL_REF.q),
            'fylite:deviation': {
              'fylite:t_e': dv('te', last.te), 'fylite:t_i': dv('ti', last.ti),
              'fylite:n_e': dv('ne', last.ne), 'fylite:q': dv('q', last.q),
            },
          };
        }
        doc['fylite:sawteeth'] = (last.crashes || []).map(function (r) {
          return { 'fylite:step': r.step, 'fylite:time': r.t,
                   'fylite:r_q1': r.r1, 'fylite:r_mix': r.rMix,
                   'fylite:psi_moved': r.psiMoved,
                   'fylite:refused': r.refused || null };
        });
        //: ★★THE LAST REFINEMENT'S SOLVED BOX, when there was one.  Every
        //: other number about the refinement in this file is a summary of
        //: it; this is the object itself — the Dirichlet border it was
        //: given, the interior it produced, and the p'/FF' (per radian)
        //: that produced it.  With those four a reader re-solves Delta* in
        //: whatever host they like and finds out whether the claim holds,
        //: which no residual printed beside an answer can tell them.
        if (last.refinedField) {
          var rf = last.refinedField;
          doc['fylite:refined_field'] = {
            '@type': 'fyo:equilibrium',
            //: ★12 significant digits, not this file's usual 7, and the
            //: reason is what the array is FOR: psi here is an offset-
            //: dominated field whose physics lives in differences of a
            //: fraction of a weber, and a re-solve of Delta* from a border
            //: rounded at 7 digits would be comparing against noise it
            //: introduced itself.
            'fylite:r': sig(rf.r, 12), 'fylite:z': sig(rf.z, 12),
            'fylite:psi': sig(rf.psi, 12),
            'fylite:psi_axis': rf.psiAxis, 'fylite:psi_boundary': rf.psiBnd,
            'fylite:axis_r': rf.axisR, 'fylite:axis_z': rf.axisZ,
            'fylite:limiter_r': sig(rf.limR), 'fylite:limiter_z': sig(rf.limZ),
            //: the SOURCE, as monomial coefficients in psibar — c[k] x^k,
            //: dp/dpsibar in Pa and d(F^2/2)/dpsibar in T^2 m^2
            'fylite:pprime_coef': rf.dpCoef,
            //: ★T-M17: the FF' constant the I_p constraint solved is
            //: already IN these coefficients — the file states the source
            //: the kernel actually ran, and the three numbers below say
            //: what the constraint did to get there
            'fylite:ffprime_coef': rf.dgCoef,
            'fylite:ip': rf.ip,
            'fylite:ip_target': rf.ipTarget === undefined ? null : rf.ipTarget,
            'fylite:ff_shift': rf.ffShift === undefined ? null : rf.ffShift,
            'fylite:ip_unconstrained': rf.ipRaw === undefined ? null : rf.ipRaw,
            //: ★the gauge, spelled out in the file rather than left to a
            //: habit: psi is TOTAL flux [Wb], psibar = (psi - psi_axis) /
            //: (psi_boundary - psi_axis), and the equation this field
            //: solves is
            //:   Delta* psi = -2 pi mu0 R (R p' + FF'/(mu0 R)),
            //:   p'  = (dp/dpsibar)      / [(psi_b - psi_a) / 2 pi],
            //:   FF' = (dF^2/2/dpsibar)  / [(psi_b - psi_a) / 2 pi],
            //: applied where psibar is in [0, 1) on the plasma connected to
            //: the axis, and zero elsewhere.
            'fylite:psi_gauge': 'total_flux_weber',
            'fylite:profile_gauge': 'per_psibar',
            'fylite:equation': 'deltastar_psi = -2*pi*mu0*R*jphi',
            //: ★T-M17: j_phi carries the kernel's declared edge control — a
            //: C¹ smoothstep to zero over the last `edge_taper` of psibar
            //: (`equilibrium::BOX_EDGE_TAPER`); a reader re-solving this
            //: field applies it or reconstructs a different equation
            'fylite:edge_taper': 0.05,
          };
        }
        //: ★★THE BEAM, and its INPUTS with it.  The closure criterion for
        //: this feature is that `fylite.kernel.beam_deposit` at the same
        //: parameters reproduces the profile below pointwise, and a file
        //: that carried only the profile could not be held to it.  So the
        //: psi_N map the chord was attenuated through, the chord itself,
        //: the n_e / T_e it was read against and the shell edges all
        //: travel — at 12 significant digits rather than this file's usual
        //: 7, because an oracle re-running the call on inputs rounded at 7
        //: would be comparing against noise it introduced itself.
        //:
        //: ★The three power accounts and the two current numbers stay
        //: SEPARATE fields: injected, absorbed, shine-through, orbit loss,
        //: driven current, shielding factor.  One "heating power" and one
        //: "current" would be exactly the collapse this item removed.
        if (last.beam) {
          var bm = last.beam, bin = bm.inputs;
          doc['fylite:beam'] = {
            'fylite:model': 'nbi',
            'fylite:source': 'fylite.kernel.beam_deposit',
            'fylite:psin': sig(bm.psin, 12),
            'fylite:psin_edges': sig(bm.edges, 12),
            'fylite:dvolume': sig(bm.dvolume, 12),
            'fylite:area': sig(bm.area, 12),
            'fylite:r_minor': sig(bm.rminor, 12),
            'fylite:r_major': sig(bm.rmajor, 12),
            'fylite:trapped_fraction': sig(bm.ft, 12),
            'fylite:epsilon': sig(bm.eps, 12),
            'fylite:z_eff': sig(bm.zeff, 12),
            'fylite:z_sum': sig(bm.zsum, 12),
            //: the shielding function and the surviving fraction, apart
            'fylite:shielding_g': sig(bm.shieldingG, 12),
            'fylite:shielding_factor': sig(bm.shielding, 12),
            'fylite:p_deposited': sig(bm.pDep, 12),
            'fylite:p_electron': sig(bm.pE, 12),
            'fylite:p_ion': sig(bm.pI, 12),
            'fylite:p_fast': sig(bm.pFast, 12),
            //: ★T-M12: the pitch-preserving split and the prompt torque,
            //: at the same 12 digits — the gate recomputes every one of
            //: them from the per-component records below (same retained
            //: fraction, same pitch, same R_major) at 1e-6, which is the
            //: closure criterion「与 beam_deposit 同一次调用出来的量一致」.
            'fylite:p_fast_par': sig(bm.pPar, 12),
            'fylite:p_fast_perp': sig(bm.pPerp, 12),
            'fylite:torque_nbi': sig(bm.torque, 12),
            'fylite:torque_nbi_total': bm.torqueTotal,
            'fylite:pitch': sig(bm.pitch, 12),
            'fylite:tau_eff': sig(bm.tauEff, 12),
            'fylite:j_nbi': sig(bm.jNbi, 12),
            'fylite:power_injected': bm.pInjected,
            'fylite:power_absorbed': bm.pAbsorbed,
            'fylite:shinethrough_fraction': bm.shinethrough,
            'fylite:orbit_loss_fraction': bm.orbitLossFraction,
            'fylite:i_nbi': bm.iNbi,
            'fylite:fast_energy': bm.fastEnergy,
            //: ★per energy COMPONENT, because that is the granularity
            //: `beam_deposit` is called at: one call per component, and the
            //: oracle has to be able to make the same calls
            'fylite:components': bm.components.map(function (c) {
              return { 'fylite:energy': c.energy, 'fylite:power': c.power,
                       'fylite:absorbed_fraction': sig(c.absorbed, 12),
                       //: what survived the first-orbit mask and became a
                       //: power density — the other array is what the
                       //: deposition entry returned
                       'fylite:retained_fraction': sig(c.retained, 12),
                       'fylite:orbit_mask': c.orbitMask
                         ? c.orbitMask.map(function (v) { return v !== 0; })
                         : null,
                       'fylite:pitch': sig(c.pitch, 12),
                       'fylite:shinethrough': c.shinethrough,
                       'fylite:orbit_loss': c.orbitLoss,
                       'fylite:absorbed_total': c.absorbedFraction,
                       'fylite:i_nbi': c.current };
            }),
            'fylite:re_evaluated_every': bm.cadence || null,
            'fylite:inputs': {
              'fylite:grid': bin.grid,
              'fylite:psin_2d': sig(bin.psin2d, 12),
              'fylite:psin_2d_order': 'r_major',
              'fylite:profile_psin': sig(bin.psinProf, 12),
              'fylite:profile_ne': sig(bin.ne, 12),
              'fylite:profile_te': sig(bin.te, 12),
              'fylite:r_start': bin.rStart,
              'fylite:tangency_radius': bin.tangencyRadius,
              'fylite:z_height': bin.zHeight,
              'fylite:width_r': bin.widthR, 'fylite:width_z': bin.widthZ,
              'fylite:direction': bin.direction,
              'fylite:n_width_r': bin.nWidthR,
              'fylite:n_width_z': bin.nWidthZ,
              'fylite:n_samples': bin.nSamples,
              'fylite:mass': bin.mass,
              'fylite:stopping_model': bin.stopping,
              'fylite:impurity_form': bin.impurityForm,
              'fylite:a_edge': bin.aEdge, 'fylite:b0': bin.b0,
              'fylite:r0': bin.r0Field,
              'fylite:orbit_losses': !!bin.orbit,
              'fylite:power': bin.power, 'fylite:energy': bin.energy,
              'fylite:power_fractions': bin.fractions,
            },
          };
        }
        //: ★★THE WAVE (T-M10), on the same terms as the beam: the profile
        //: AND everything `lh_deposit` was called with, at 12 significant
        //: digits, because the closure criterion for this feature is that
        //: `fylite.kernel.lh_deposit` at these parameters reproduces the
        //: deposition pointwise and a file carrying only the profile could
        //: not be held to it.
        //:
        //: ★Accessibility and efficiency are SEPARATE fields and are never
        //: multiplied: `n_accessible` is the per-surface limit the wave has
        //: to clear, `cd_weight` the local Fisch weight, `eta_cd` the
        //: supplied calibration coefficient, and `i_lh` the current that
        //: came out.  One "coupling factor" would hide which of them was
        //: small.
        if (last.lh) {
          var lw = last.lh;
          doc['fylite:lh'] = {
            'fylite:model': 'lh',
            'fylite:source': 'fylite.kernel.lh_deposit',
            'fylite:psin': sig(lw.psin, 12),
            'fylite:psin_edges': sig(lw.edges, 12),
            'fylite:dvolume': sig(lw.dvolume, 12),
            'fylite:area': sig(lw.area, 12),
            'fylite:r_major': sig(lw.rmajor, 12),
            'fylite:n_e': sig(lw.ne, 12), 'fylite:t_e': sig(lw.te, 12),
            'fylite:f_pol': sig(lw.fPol, 12),
            'fylite:n_accessible': sig(lw.nAcc, 12),
            'fylite:cd_weight': sig(lw.cdWeight, 12),
            'fylite:p_deposited_density': sig(lw.pDep, 12),
            'fylite:j_lh': sig(lw.jLh, 12),
            'fylite:sigma_j': sig(lw.sigmaJ, 12),
            'fylite:power_launched': lw.pLaunched,
            'fylite:power_deposited': lw.pDeposited,
            //: ★T-M11 again, for this source: how much of what the shells
            //: say was deposited lies beyond the ladder's outer surface
            'fylite:power_outside_ladder': lw.pOutsideLadder,
            'fylite:ladder_edge_psin': lw.ladderEdgePsin,
            'fylite:i_lh': lw.iLh, 'fylite:i_lh_shell_sum': lw.iLhShell,
            'fylite:n_e_bar': lw.neBar, 'fylite:t_e_max': lw.teMax,
            'fylite:deposited': !!lw.deposited,
            'fylite:launchers': lw.launchers.map(function (L) {
              return { 'fylite:name': L.name, 'fylite:power': L.power,
                       'fylite:n_parallel': L.band,
                       //: the LAUNCHED band and the EFFECTIVE one, apart:
                       //: the up-shift between them is an assumption and a
                       //: file that carried only the product would hide it
                       'fylite:n_parallel_effective': L.bandEffective,
                       'fylite:i_lh': L.iLh,
                       'fylite:resonance_psin_lo': L.resLo,
                       'fylite:resonance_psin_hi': L.resHi,
                       'fylite:t_resonant_lo': L.tResLo,
                       'fylite:t_resonant_hi': L.tResHi,
                       'fylite:accessible_volume_fraction': L.reachFraction };
            }),
            'fylite:re_evaluated_every': lw.cadence || null,
            'fylite:inputs': {
              'fylite:r0': lw.inputs.r0, 'fylite:eta_cd': lw.inputs.etaCd,
              'fylite:xi': lw.inputs.xi,
              'fylite:width_floor': lw.inputs.widthFloor,
              'fylite:cd_model': lw.inputs.cdModel,
              'fylite:upshift': lw.inputs.upshift,
              'fylite:n_shells': lw.inputs.nShells,
            },
          };
        }
        //: ★★T-M11: THE TWO QUADRATURES, IN THE FILE AND NOT NORMALISED.
        //: `shell` is `shell_sum(p_dep, dV)` over the whole plasma,
        //: `ladder` is what the march itself integrated on its own metric
        //: (which stops at `edge_psin`), and `outside_ladder` is the part of
        //: the first that lies where the second has no nodes.  A reader — or
        //: a gate — can then say which half of the gap is a different domain
        //: and which half is a different discretisation, without either of
        //: the two numbers having been adjusted onto the other.
        (function () {
          var lastRow = trace.length ? trace[trace.length - 1] : null;
          var q = {};
          if (last.beam)
            q['fylite:beam'] = {
              'fylite:shell_sum': last.beam.pAbsorbed,
              'fylite:ladder_integral': lastRow ? lastRow.pAuxBeam : null,
              'fylite:outside_ladder': last.beam.pOutsideLadder,
              'fylite:edge_psin': last.beam.ladderEdgePsin,
              //: ★T-M14: the nodal source that integral is the trapezoid
              //: of, so a reader (and the gate) can re-take the trapezoid
              //: with tools of their own and land on the same number
              'fylite:on_ladder': last.beam.onLadder
                ? sig(last.beam.onLadder, 12) : null };
          if (last.lh)
            q['fylite:lh'] = {
              'fylite:shell_sum': last.lh.pDeposited,
              'fylite:ladder_integral': lastRow ? lastRow.pAuxLh : null,
              'fylite:outside_ladder': last.lh.pOutsideLadder,
              'fylite:edge_psin': last.lh.ladderEdgePsin,
              'fylite:on_ladder': last.lh.onLadder
                ? sig(last.lh.onLadder, 12) : null };
          if (last.beam || last.lh) doc['fylite:quadrature'] = q;
        })();
        //: ★★EVERY FREE-BOUNDARY SOLVE THIS MARCH STOOD ON, with the
        //: verdict each one reached.  It is a list and not a flag because
        //: a coupled run solves one per block: a file that carried only
        //: "converged: true" would be true of the last block and silent
        //: about the three before it.  `tol` travels with them — a residual
        //: without the number it was compared against is not a verdict.
        doc['fylite:free_boundary'] = (last.freeSolves || []).map(function (r) {
          return { 'fylite:block': r.block,
                   'fylite:converged': !!r.converged,
                   //: T-M16 — the third verdict travels with the file
                   'fylite:settled': !!r.settled,
                   'fylite:residual': r.residual,
                   'fylite:tolerance': r.tol,
                   'fylite:iterations': r.iterations,
                   'fylite:max_iterations': r.maxIter };
        });
        doc['fylite:coupling'] = (last.rounds || []).map(function (r) {
          return { 'fylite:block': r.block, 'fylite:steps': r.steps,
                   'fylite:beta_0': r.beta0, 'fylite:settled': !!r.settled,
                   'fylite:psi_repaired': r.psiRepaired,
                   'fylite:beta_p_transport': r.bpTarget,
                   'fylite:beta_p_equilibrium': r.bpEq,
                   //: ★the refinement's own record travels with the run:
                   //: its beta_p, the current it solved, and its zero test.
                   //: A reader who has only the file must be able to see
                   //: whether the refinement ran, what it cost and whether
                   //: the machine that produced it can reproduce the
                   //: equilibrium it started from.
                   'fylite:beta_p_refined':
                     r.bpFix === undefined || !isFinite(r.bpFix) ? null : r.bpFix,
                   'fylite:refined': r.refined ? {
                     'fylite:ip': r.refined.ip,
                     'fylite:ip_target': r.refined.ipTarget,
                     'fylite:pprime_residual': r.refined.resP,
                     'fylite:ffprime_residual': r.refined.resF,
                     'fylite:iterations': r.refined.iterations,
                     'fylite:residual': r.refined.residual,
                     'fylite:zero_test': r.refined.zero
                       ? { 'fylite:psi_pointwise': r.refined.zero.psi,
                           'fylite:ip': r.refined.zero.ip,
                           'fylite:ip_free': r.refined.zero.ipRef,
                           'fylite:ip_relative': r.refined.zero.ipRel,
                           'fylite:iterations': r.refined.zero.iterations,
                           //: ★the field it was measured against: the free
                           //: solve's own convergence bounds this test, and
                           //: a reader with only the file must be able to
                           //: see that before blaming the refinement
                           'fylite:free_iterations': r.refined.zero.freeIterations,
                           'fylite:free_residual': r.refined.zero.freeResidual }
                       : null,
                   } : null,
                   'fylite:refine_why': r.refineWhy || null,
                   'fylite:emp': r.fit ? r.fit.emp : null,
                   'fylite:enp': r.fit ? r.fit.enp : null,
                   'fylite:shape_residual': r.fit ? r.fit.rms : null };
        });
        return JSON.stringify(doc, null, 1);
      },
    },
  };
  var io = S.formats(FORMATS);

  /**
   * The march's total pressure on a uniform psi_N grid — the document the
   * reconstruction bar reads as its kinetic constraint.
   *
   * ★★THE GRID DOES NOT REACH THE EDGE, and the file says so.  The metric
   * ladder is traced to `edgePsin` (a control since T-M13; default 0.95,
   * capped below 1), so the march has no
   * answer between there and the separatrix; the profile is written out to
   * 1.0 with the last SOLVED value HELD across that gap, which is a flat
   * top and not a pedestal.  Extrapolating a gradient into a region this
   * bar does not model would be inventing the one feature it is missing.
   * Both facts travel as fields, not only as prose here.
   */
  function buildPressure() {
    if (!last || !last.te) return { error: T('e.none_yet') };
    var n = last.rho.length, i;
    var p = new Float64Array(n);
    for (i = 0; i < n; i++)
      p[i] = (last.ne[i] * last.te[i] + last.ne[i] * last.ti[i]) * 1.602176634e-19;
    //: uniform psi_N over [0, 1] with the same number of points the march
    //: has, so nothing is invented by resolution either
    var out = new Float64Array(n), solved = last.psin[n - 1];
    for (i = 0; i < n; i++) {
      var x = i / (n - 1);
      out[i] = x >= solved ? p[n - 1] : evInterpAt(last.psin, p, x);
    }
    var doc = FySession.envelope('profile', {}, S.kernel());
    doc['fylite:pressure'] = FySession.sig(out, 7);
    doc['fylite:pressure_grid'] = 'uniform_psi_normalised';
    doc['fylite:quantity'] = 'pressure';
    //: ★this profile is a PREDICTION, not a measurement and not a
    //: reconstruction output — a file that forgot which it was could come
    //: back in as data
    doc['fylite:provenance'] = 'model-evolve-prediction';
    doc['fylite:psi_norm_solved'] = +solved.toPrecision(7);
    doc['fylite:beyond_solved'] = 'held';
    doc['fylite:geometry_source'] = 'fylite:' + last.geoSource;
    return JSON.stringify(doc, null, 1);
  }

  /** Linear read of `y(x)` at `at`, clamped at both ends. */
  function evInterpAt(x, y, at) {
    var n = x.length;
    if (at <= x[0]) return y[0];
    if (at >= x[n - 1]) return y[n - 1];
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (x[m] > at) hi = m; else lo = m; }
    var t = (at - x[lo]) / (x[hi] - x[lo]);
    return y[lo] + t * (y[hi] - y[lo]);
  }

  //: ★HANDING THE PREDICTION TO THE ANALYSIS SCENARIO, without a round trip
  //: through the file picker.  What travels is the SAME document the export
  //: menu writes, and the far side applies it with its own `apply` — so the
  //: two carriers are one code path, as they are in the other direction.
  (function handOver() {
    var el = document.getElementById('model-handover');
    if (!el) return;
    el.addEventListener('click', function () {
      var txt = buildPressure();
      if (typeof txt !== 'string')
        return S.report(T('handoff.nothing'), 'warn');
      var why = FyHandoff.put({ kind: 'profile', from: 'model', bar: 'evolve',
                                name: 'fylite_model_pressure.json',
                                text: txt });
      if (why) return S.report(T(why), 'warn');
      S.report(T('handoff.gave', { what: T('handoff.kind.profile') }));
    });
  })();

  // --- wiring --------------------------------------------------------------

  function syncGeometry() {
    var g = $('geometry').value;
    //: ★the current channel needs <|grad rho|^2/R^2>, which four scalars do
    //: not determine.  The control is DISABLED rather than silently ignored
    //: on Miller geometry, and the note says why.
    var cur = $('ch-current');
    if (cur) {
      cur.disabled = g === 'miller';
      if (cur.disabled) cur.checked = false;
    }
    //: ★the sawtooth needs the CURRENT channel: with q prescribed, the
    //: trigger would fire on a profile nothing in the march can move.
    //: Disabled rather than ignored, like the current channel on Miller.
    var saw = $('sawtooth');
    if (saw) {
      saw.disabled = !on('ch-current');
      if (saw.disabled) saw.checked = false;
    }
    //: ★★WHO STILL READS THE SHAPE SLIDERS.  Six of the shared controls
    //: (a, R/a, kappa, delta, q95, B0) define the geometry only on the
    //: analytic tier; once this bar is on a solved equilibrium or an
    //: imported g-file, the shape and the field come from that psi and the
    //: sliders say nothing about this bar's answer.  They are MARKED rather
    //: than disabled, because the 1.5-D bar above reads the same six at all
    //: times — disabling them would take another bar's input away.  The
    //: line says which bar still reads them, so the state is stated rather
    //: than left for the reader to infer from a figure that did not move.
    var shared = document.getElementById('model-shared');
    var snote = document.getElementById('model-shape-note');
    if (shared) shared.classList.toggle('shape-idle', g !== 'miller');
    if (snote) {
      snote.hidden = g === 'miller';
      if (!snote.hidden)
        snote.innerHTML = T('m.shape_idle', { src: T('e.geom.' + g) });
    }
    //: ★★WHAT THE QUASI-NEUTRALITY TAKES OVER.  With the impurity in the
    //: composition, its concentration and the fuel fraction are RESULTS of
    //: Z_eff and Z_imp — so the two controls that used to set them are
    //: disabled and the derived values are shown in their place.  A page
    //: that left them live would be offering three ways to state one
    //: composition, two of which the solver ignores.
    var q = $('quasi'), qn = $('quasi-note');
    var name = $('species') ? $('species').value : '';
    var zImp = name ? (self.FyLite.ADAS_Z || {})[name] : 0;
    if (q) {
      q.disabled = !name || !(zImp > 1) || on('ch-density');
      if (q.disabled) q.checked = false;
    }
    var qOn = on('quasi');
    ['cimp', 'dtfrac'].forEach(function (id) {
      var e = $(id);
      if (e) e.disabled = qOn;
    });
    if (qn) {
      qn.hidden = !q || (!qOn && !q.disabled);
      if (!qn.hidden) {
        if (qOn) {
          var ze = +$('zeff').value;
          var fD = (zImp - ze) / (zImp - 1);
          qn.innerHTML = fD > 0
            ? T('m.quasi.on', { name: name, z: zImp,
                                fd: fD.toFixed(3),
                                c: (100 * (1 - fD) / zImp).toFixed(3),
                                f: (fD / 2).toFixed(3) })
            : T('m.quasi.bad', { zeff: ze, z: zImp, name: name });
        } else {
          qn.innerHTML = on('ch-density') ? T('m.quasi.nodensity')
                                          : T('m.quasi.nospecies');
        }
      }
    }
    //: the turbulent budget is shown only on the tier that spends it
    var turb = $('turb');
    if (turb) turb.hidden = (+$('closure').value | 0) !== 3;
    //: ★the free-boundary budget, shown on the one tier that SOLVES one.
    //: A Miller shape and an imported g-file are given, not converged to,
    //: so an iteration cap beside them would be a control over nothing.
    var freeBox = $('freebox');
    if (freeBox) freeBox.hidden = g !== 'device';
    //: ★★THE BEAM NEEDS A psi_N MAP ON THE (R, Z) GRID: the solved
    //: equilibrium and the imported g-file have one, Miller does not.
    //: Disabled rather than ignored — and with it on, the four controls it
    //: REPLACES are disabled too, because a page offering a deposition
    //: centre beside a deposition model is offering two answers to one
    //: question and using only one of them.
    var beamBox = $('beam');
    var beamOk = g === 'device' || g === 'gfile';
    if (beamBox) {
      beamBox.disabled = !beamOk;
      if (beamBox.disabled) beamBox.checked = false;
    }
    var beamOn = on('beam');
    var beamPanel = $('beambox');
    if (beamPanel) beamPanel.hidden = !beamOn;
    //: ★T-M12: `torque` joins the list — with a beam, the momentum source
    //: is the beam's own prompt input (tau_phi = p_dep·2ξR/v_b, the
    //: kernel's), so the slider that used to set the total is a second
    //: answer to the same question.
    ['pe', 'pi', 'dep', 'depw', 'icd', 'torque'].forEach(function (id) {
      var e = $(id);
      if (e) e.disabled = beamOn;
    });
    var beamOff = $('beam-off');
    if (beamOff) {
      beamOff.hidden = beamOk && !beamOn;
      if (!beamOff.hidden)
        beamOff.innerHTML = beamOn ? T('e.beam.replaces')
                                   : T('e.beam.needs_psi');
    }
    //: ★★THE WAVE NEEDS THE SAME psi_N MAP AND ONE THING MORE — |F(psi)| per
    //: surface, because accessibility goes as |B| ~ F/R.  Both live on the
    //: two ladder tiers and neither on Miller, so the switch is DISABLED
    //: there rather than producing a deposition through a field nobody
    //: computed.  With it on, I_CD is a result and its slider goes with it.
    var lhBox = $('lh');
    //: ★AND on the machine having a launcher at all: with no declared band
    //: there is nothing to launch, and putting a default in its place is
    //: exactly what T-M15 removed.
    var lhOk = (g === 'device' || g === 'gfile') && LAUNCHERS.length > 0;
    if (lhBox) {
      lhBox.disabled = !lhOk;
      if (lhBox.disabled) lhBox.checked = false;
    }
    var lhOn = on('lh');
    var lhPanel = $('lhbox');
    if (lhPanel) lhPanel.hidden = !lhOn;
    //: ★the driven-current slider is disabled by EITHER model: the beam
    //: already did it above, and the wave does it here for the same reason
    if ($('icd')) $('icd').disabled = beamOn || lhOn;
    var lhOff = $('lh-off');
    if (lhOff) {
      lhOff.hidden = lhOk && !lhOn;
      if (!lhOff.hidden)
        lhOff.innerHTML = !LAUNCHERS.length ? T('e.lh.no_antenna')
                        : lhOn ? T('e.lh.replaces') : T('e.lh.needs_psi');
    }
    var cpl = $('couple');
    if (cpl) cpl.disabled = g !== 'device';
    if (cpl && cpl.disabled) cpl.value = 0;
    //: the fixed-boundary refinement is a refinement OF the alternation, so
    //: it is available exactly where the alternation is
    var cfx = $('couplefixed');
    if (cfx) {
      cfx.disabled = g !== 'device' || !(+$('couple').value > 0);
      if (cfx.disabled) cfx.checked = false;
    }
    var cfxPanel = $('cfix');
    if (cfxPanel) cfxPanel.hidden = !(cfx && cfx.checked);
    //: the momentum channel's two numbers, shown where they are spent
    var momPanel = $('mom');
    if (momPanel) momPanel.hidden = !on('ch-momentum');
    var note = $('couple-note');
    if (note)
      note.innerHTML = T(g === 'device' ? 'e.couple_note' : 'e.couple_note_off');
  }

  /** What a continued march would start from, said where the box is. */
  function resumeNote() {
    var host = $('resume-note');
    if (!host) return;
    var box = $('resume');
    if (box) box.disabled = !resumeState;
    host.innerHTML = resumeState
      ? T('e.resume.have', { t: resumeAt.toFixed(3),
                             n: resumeState.te.length,
                             te: (resumeState.te[0] / 1e3).toFixed(2) })
      : T('e.resume.none');
  }

  function costNote() {
    var host = document.getElementById('model-cost-note');
    if (!host) return;
    //: ★measured on the bundled EAST deck: a heat-only step on 31 surfaces
    //: is ~4 ms, a step with the neoclassical closure ~11 ms, and one
    //: free-boundary re-solve ~780 ms.  The reader sees the bill before
    //: paying it, which is what an offline-tier bar owes.
    var n = +$('nsteps').value | 0, k = +$('couple').value | 0;
    var cl = +$('closure').value | 0;
    var per = cl === 2 || cl === 3 ? 0.011 : 0.004;
    var eq = k > 0 ? Math.max(0, Math.ceil(n / k) - 1) * 0.78 : 0;
    //: ★the turbulent tier's own bill, measured on the same deck as the
    //: rest: about 21 ms per TGLF linear solve, times radii x ky, times how
    //: often the cadence fires.  A tier whose cost the reader discovers by
    //: waiting is a tier they will not use twice.
    var turb = 0;
    if (cl === 3) {
      var every = Math.max(1, +$('turbevery').value | 0);
      turb = Math.ceil(n / every) * (+$('turbnrad').value | 0)
             * (+$('turbnky').value | 0) * 0.021;
    }
    host.innerHTML = T('e.cost_note', { n: n,
                                        s: (n * per + eq + turb).toFixed(1),
                                        k: k > 0 ? k : '—' });
  }

  // --- the worked cases ----------------------------------------------------
  //
  // ★★A CASE IS A SESSION DOCUMENT, listed by `cases/catalogue.jsonld` and
  // applied through the same `FySession.apply` an imported file goes
  // through.  That is the whole design: what the menu offers and what
  // 「导出 → 会话文件」 writes are one format, so a reader can save a run and
  // hand it back as a case, and a case cannot drift into a shape only this
  // menu can read.
  //
  // ★A case carries INPUTS and never a result — it does not run the bar.
  // This one costs seconds; starting it because a menu changed is what an
  // offline-tier bar must not do.
  //
  // ★A catalogue that will not load is REPORTED and the menu stays empty:
  // the bar works without cases (that is how it worked before there were
  // any), and a page that cannot open because a data file is missing is a
  // worse failure than a menu with nothing in it.
  var cases = {};
  function loadCases() {
    var sel = $('case');
    if (!sel || typeof fetch !== 'function') return;
    var dir = (location.pathname.indexOf('/scenario/') >= 0 ? '../' : '')
              + 'cases/';
    fetch(dir + 'catalogue.jsonld')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (cat) {
        var want = ((cat && cat['fylite:cases']) || []).filter(function (e) {
          return e['fylite:bar'] === 'evolve';
        }).sort(function (a, b) {
          return (a['fylite:order'] | 0) - (b['fylite:order'] | 0);
        });
        return Promise.all(want.map(function (e) {
          return fetch(dir + e['fylite:document'])
            .then(function (r) {
              if (!r.ok) throw new Error('HTTP ' + r.status);
              return r.json();
            })
            .then(function (doc) {
              var id = e['fylite:case_id'];
              cases[id] = { entry: e, doc: doc };
              var o = document.createElement('option');
              o.value = id;
              o.textContent = caseName(doc);
              sel.appendChild(o);
            })
            .catch(function (err) {
              S.report(T('e.case.failed', { id: e['fylite:case_id'],
                                            why: err.message }), 'err');
            });
        }));
      })
      .catch(function (err) {
        S.report(T('e.case.nocat', { why: err.message }), 'err');
      });
  }

  function caseName(doc) {
    var c = doc['fylite:case'] || {};
    return (FyI18n.current() === 'en' ? c['fylite:name_en'] : c['fylite:name'])
           || c['fylite:name'] || doc['@id'];
  }

  /**
   * Apply one case: the controls, then everything that reads them.
   *
   * ★What a case may NOT do is change the machine.  It DECLARES which one
   * it was written for, and a mismatch is said out loud rather than acted
   * on — switching the device rebuilds the worker and throws away whatever
   * the reader had imported, which is not something a menu should do behind
   * their back.
   */
  function applyCase(id) {
    var rec = cases[id];
    if (!rec) return;
    var doc = rec.doc, c = doc['fylite:case'] || {};
    if (doc['fylite:page'] !== 'evolve')
      return S.report(T('msg.wrong_page', { page: doc['fylite:page'] }), 'err');
    var r = FySession.apply(doc['fylite:config'], S.scope);
    syncLabels(); syncGeometry(); costNote();
    var en = FyI18n.current() === 'en';
    var note = $('case-note');
    if (note) {
      var bits = [(en ? c['fylite:note_en'] : c['fylite:note'])
                  || c['fylite:note'] || ''];
      var needs = (en ? c['fylite:needs_en'] : c['fylite:needs'])
                  || c['fylite:needs'];
      if (needs && needs.length)
        bits.push(T('e.case.needs', {
          list: needs.map(function (n) { return '<li>' + n + '</li>'; })
                     .join('') }));
      var want = rec.entry['fylite:device'] || c['fylite:device'];
      var act = self.FyDevices ? FyDevices.active() : null;
      var have = act ? act.id : null;
      if (want && have && want !== have)
        bits.push(T('e.case.device', { want: want, have: have }));
      note.innerHTML = bits.filter(Boolean).join(' ');
      note.hidden = !note.innerHTML;
    }
    S.report(T('e.case.applied', { name: caseName(doc),
                                   n: r.applied.length }));
  }

  CONTROLS.forEach(function (id) {
    var e = $(id);
    if (!e) return;
    e.addEventListener('input', function () { syncLabels(); costNote(); });
    e.addEventListener('change', function () { syncGeometry(); costNote(); });
  });
  CHECKS.forEach(function (id) {
    var e = $(id);
    if (e) e.addEventListener('change', function () { syncGeometry(); costNote(); });
  });
  if ($('case'))
    $('case').addEventListener('change', function () {
      if (this.value) applyCase(this.value);
    });
  loadCases();
  S.onRun(run);
  S.onRefresh(function () { costNote(); draw(); drawXsec(); });
  //: ★before the first sync: the value beside a slider is painted from the
  //: slider, so the machine's numbers have to be in the controls first
  applyLauncherDefaults();
  paintLaunchers();
  if (self.FyI18n) FyI18n.onChange(paintLaunchers);
  syncGeometry();
  syncLabels();
  costNote();
  resumeNote();
  S.refresh();
  //: no automatic run: this bar costs seconds and starting it unasked is
  //: what an offline-tier bar must not do
});

// ==========================================================================
// BAR  interp — 功率平衡反演（interpretive）
// ==========================================================================
//
// ★★THE OTHER DIRECTION, and the one a predictive study needs first.  The
// two bars above prescribe a diffusivity and solve for a profile; this one
// takes profiles that already exist and asks what diffusivity their own
// power balance requires.  That is where a number like「χ₀ = 0.6」comes
// from — without it the constant tier is a knob with no provenance, and the
// page had no way to produce one.
//
// ★It is a THIRD BAR rather than a mode of either other one because it
// answers a different question.  A page that let a prediction and a
// measurement share one set of figures would invite exactly the confusion
// this bar exists to prevent.

FyScenario.whenDevices(function () {
  'use strict';

  var T = FyI18n.t;
  var last = null;

  var S = MODEL.bar('interp', {
    title: 'nav.interp',
    sliders: { nlev: 0, edgepsin: 3, gradfloor: 4, ip: 0, pe: 1, pi: 1, dep: 2, depw: 2,
               vloop: 2, cimp: 2, zeff: 1, dtfrac: 3,
               amin: 2, rmaj: 2, kappa: 2, delta: 2, q95: 1, bunit: 1 },
    on: { ready: onReady, error: onError, interp: onDone },
  });
  var $ = S.$, syncLabels = S.sync, setBusy = S.setBusy;
  var M = self.FYLITE_MACHINE;

  function on(id) { var e = $(id); return !!(e && e.checked); }

  function spec() {
    var a = +$('amin').value;
    var tf = self.FyDevice.tf(M);
    return {
      geometry: $('geometry').value,
      //: ★T-M13 — same control, same cap; see the evolve bar's spec()
      n: +$('nlev').value | 0,
      edgePsin: Math.min(0.99, Math.max(0.5, +$('edgepsin').value || 0.95)),
      a: a, r0: +$('rmaj').value * a, kappa: +$('kappa').value,
      delta: +$('delta').value, q95: +$('q95').value,
      b0: +$('bunit').value,
      ip: +$('ip').value * 1e3, r0Src: tf.r0,
      gradFloor: +$('gradfloor').value,
      pE: +$('pe').value, pI: +$('pi').value,
      depCentre: +$('dep').value, depWidth: +$('depw').value,
      vLoop: +$('vloop').value,
      alpha: on('alpha'), brem: on('brem'),
      impurity: $('species') ? $('species').value : '',
      cImp: +$('cimp').value / 100,
      zeff: +$('zeff').value, dtFraction: +$('dtfrac').value,
    };
  }

  function run() {
    if (S.isBusy()) return;
    if (!MODEL_REF)
      return setBusy(false, T('i.err.noref'), 'warn');
    var sp = spec();
    var msg = { cmd: 'interp', spec: sp,
                profiles: { rho: MODEL_REF.rho, te: MODEL_REF.te,
                            ti: MODEL_REF.ti, ne: MODEL_REF.ne } };
    if (sp.geometry === 'gfile') {
      //: ★the g-file is the OTHER bar's import, like the profiles are: one
      //: document per page, and this bar reads rather than re-imports
      var g = self.MODEL_GFILE;
      if (!g) return setBusy(false, T('e.err.nogfile'), 'warn');
      msg.gfile = g;
    }
    if (sp.geometry === 'device') {
      if (!FyDevice.hasReference(M))
        return setBusy(false, T('recon.noref'), 'warn');
      msg.chan = Array.from(M.reference.aturns);
    }
    setBusy(true, T('i.running'));
    S.progress(0.3);
    S.send(msg);
    return S.settle('interp');
  }

  function onReady(m) {
    if (m && m.species && $('species')) {
      var sel = $('species'), want = sel.value;
      while (sel.options.length > 1) sel.remove(1);
      m.species.forEach(function (nm) {
        var o = document.createElement('option');
        o.value = nm; o.textContent = nm;
        sel.appendChild(o);
      });
      if (want) sel.value = want;
    }
    setBusy(false, T('i.ready'));
    refState();
  }

  function onError(m) { S.progress(0); setBusy(false, T('i.fail', { why: m.message }), 'err'); }

  function onDone(m) {
    S.progress(1);
    last = m;
    draw();
    setBusy(false, T('i.done', {
      n: m.avgE.n, m: m.rho.length,
      chie: f(m.avgE.chi, 3), chii: f(m.avgI.chi, 3), ms: m.ms }));
  }

  function f(v, d) {
    return (v === null || v === undefined || !isFinite(v)) ? '—' : (+v).toFixed(d === undefined ? 3 : d);
  }
  function e2(v) {
    return (v === null || v === undefined || !isFinite(v)) ? '—' : (+v).toExponential(2);
  }

  /** What this bar is waiting for, said where the reader is looking. */
  function refState() {
    var host = $('refstate');
    if (!host) return;
    host.innerHTML = MODEL_REF
      ? T('e.ref_against', { name: MODEL_REF.name })
      : T('i.err.noref');
  }

  //: ★a gap is a GAP.  The invalid points come back as NaN and are plotted
  //: as breaks rather than joined across — a line drawn through them would
  //: be a diffusivity nobody computed.
  function masked(x, y, valid) {
    var out = [];
    for (var i = 0; i < x.length; i++)
      out.push(valid[i] && isFinite(y[i]) ? y[i] : NaN);
    return out;
  }

  function draw() {
    if (!last) return;
    var col = FyPlot.palette($('chi'));
    var x = Array.prototype.slice.call(last.rho);
    FyPlot.xy($('chi'), {
      series: [
        { x: x, y: masked(x, last.chiE, last.validE), color: col.lcfs,
          label: 'chi_e' },
        { x: x, y: masked(x, last.chiI, last.validI), color: col.accent,
          label: 'chi_i' },
      ], xlabel: 'rho_tor [m]', ylabel: 'chi [m^2/s]', legend: true });
    FyPlot.xy($('prof'), {
      series: [
        { x: x, y: Array.prototype.map.call(last.te, function (v) { return v / 1e3; }),
          color: col.lcfs, label: 'T_e [keV]' },
        { x: x, y: Array.prototype.map.call(last.ti, function (v) { return v / 1e3; }),
          color: col.accent, label: 'T_i [keV]' },
        { x: x, y: Array.prototype.map.call(last.ne, function (v) { return v / 1e19; }),
          color: col.muted, label: 'n_e [1e19]' },
      ], xlabel: 'rho_tor [m]', legend: true });
    FyPlot.xy($('flux'), {
      series: [
        { x: x, y: Array.prototype.slice.call(last.qE), color: col.lcfs, label: 'q_e' },
        { x: x, y: Array.prototype.slice.call(last.qI), color: col.accent, label: 'q_i' },
      ], xlabel: 'rho_tor [m]', ylabel: 'q [W/m^2]', legend: true });
    FyPlot.xy($('power'), {
      series: [
        { x: x, y: Array.prototype.map.call(last.powerE, function (v) { return v / 1e6; }),
          color: col.lcfs, label: 'P_e [MW]' },
        { x: x, y: Array.prototype.map.call(last.powerI, function (v) { return v / 1e6; }),
          color: col.accent, label: 'P_i [MW]' },
      ], xlabel: 'rho_tor [m]', ylabel: 'P [MW]', legend: true });

    var d = last.diag;
    var rows = [
      [T('i.row.chie'), f(last.avgE.chi, 3) + ' m^2/s'],
      [T('i.row.chii'), f(last.avgI.chi, 3) + ' m^2/s'],
      [T('i.row.chie_half'), f(last.chiEHalf, 3) + ' m^2/s'],
      [T('i.row.chii_half'), f(last.chiIHalf, 3) + ' m^2/s'],
      [T('i.row.valid'), last.avgE.n + ' / ' + last.rho.length],
      [T('i.row.used'), last.avgE.used + ' / ' + last.rho.length],
      [T('i.row.w'), f(last.wTh / 1e6, 3) + ' MJ'],
      [T('i.row.taue'), f(last.tauE, 3) + ' s'],
      [T('i.row.paux'), f(d.pAux / 1e6, 2) + ' MW'],
      [T('i.row.palpha'), f(d.pAlpha / 1e6, 2) + ' MW'],
      [T('i.row.prad'), f(d.pRad / 1e6, 2) + ' MW'],
      [T('i.row.pohm'), f(d.pOhm / 1e6, 2) + ' MW'],
      [T('i.row.geo'), T('e.geom.' + last.geoSource)],
    ];
    //: ★the metric this inversion ran on came out of an ITERATION on the
    //: device tier, and a chi read off a psi map the solver never found is
    //: a chi of nothing.  Absent on the two tiers that are given a field
    //: rather than converging to one.
    if (last.free)
      rows.push([T('e.row.free'),
                 T(last.free.converged ? 'e.free.ok1'
                   : last.free.settled ? 'e.free.settled1' : 'e.free.bad1', {
                   it: last.free.iterations, max: last.free.maxIter,
                   res: e2(last.free.residual),
                   tol: e2(last.free.tol) })]);
    $('scalars').innerHTML = rows.map(function (q) {
      return '<tr><td>' + q[0] + '</td><td class="num">' + q[1] + '</td></tr>';
    }).join('');
    var bad = last.rho.length - last.avgE.n;
    $('verdict').innerHTML = bad > 0
      ? T('i.verdict.some', { bad: bad })
      : T('i.verdict.all', { n: last.rho.length });
  }

  var CONTROLS = ['geometry', 'nlev', 'edgepsin', 'gradfloor', 'ip', 'pe', 'pi', 'dep',
                 'depw', 'vloop', 'species', 'cimp', 'zeff', 'dtfrac',
                 'amin', 'rmaj', 'kappa', 'delta', 'q95', 'bunit'];
  var CHECKS = ['alpha', 'brem'];

  var FORMATS = {
    json: {
      docPage: 'interp',
      label: T('io.label.json'), filename: 'fylite_interp_session.json',
      accept: '.json,application/json',
      exportHint: T('i.j.export_hint'), importHint: T('i.j.import_hint'),
      apply: function (text, name) {
        var doc = FySession.parse(text);
        if (doc['fylite:page'] !== 'interp')
          throw new Error(T('msg.wrong_page', { page: doc['fylite:page'] }));
        var r = FySession.apply(doc['fylite:config'], S.scope);
        syncLabels();
        //: configuration only, and NOT re-run — like every other bar here
        return T('i.j.imported', { name: name, n: r.applied.length });
      },
      build: function () {
        if (!last) return { error: T('i.none_yet') };
        var doc = FySession.envelope('interp',
                                     FySession.collect(CONTROLS.concat(CHECKS),
                                                       S.scope),
                                     S.kernel());
        var F = self.FyFyo, sig = FySession.sig;
        //: ★★the METRIC travels, and `gm7` with it.  The inversion's whole
        //: content is the pair (gm7 for the flux, gm3 for the conduction
        //: law), so a file that carried the chi without them could not be
        //: checked against anything — including against the march that the
        //: chi is meant to feed.
        var eq = { '@type': F.type('LADDER') };
        F.put(eq, 'LADDER', 'rho', sig(last.rho));
        F.put(eq, 'LADDER', 'psin', sig(last.psin));
        F.put(eq, 'LADDER', 'vprime', sig(last.vprime));
        F.put(eq, 'LADDER', 'gm3', sig(last.gm3));
        F.put(eq, 'LADDER', 'gm7', sig(last.gm7));
        F.put(eq, 'EQUILIBRIUM', 'b0', last.b0);
        F.put(eq, 'EQUILIBRIUM', 'r0', last.rMajor);
        eq['fylite:a_minor'] = last.aMinor;
        eq['fylite:geometry_source'] = 'fylite:' + last.geoSource;

        var cp = { '@type': F.type('CORE_PROFILES') };
        F.put(cp, 'CORE_PROFILES', 'psin', sig(last.psin));
        F.put(cp, 'CORE_PROFILES', 'te', sig(last.te));
        F.put(cp, 'CORE_PROFILES', 'ti', sig(last.ti));
        F.put(cp, 'CORE_PROFILES', 'ne', sig(last.ne));
        F.put(cp, 'CORE_PROFILES', 'zeff', +$('zeff').value);
        cp['fylite:source'] = MODEL_REF ? MODEL_REF.name : null;

        var ct = { '@type': F.type('CORE_TRANSPORT') };
        F.put(ct, 'CORE_TRANSPORT', 'rho', sig(last.rho));
        F.put(ct, 'CORE_TRANSPORT', 'psin', sig(last.psin));
        F.put(ct, 'CORE_TRANSPORT', 'chi_e', sig(last.chiE));
        F.put(ct, 'CORE_TRANSPORT', 'chi_i', sig(last.chiI));
        //: ★the validity flags travel WITH the chi.  A NaN in a file is
        //: read back as a null and could be mistaken for a gap in the
        //: writing; these say it was a refusal.
        ct['fylite:valid_e'] = Array.prototype.map.call(last.validE, function (v) { return !!v; });
        ct['fylite:valid_i'] = Array.prototype.map.call(last.validI, function (v) { return !!v; });
        ct['fylite:gradient_floor'] = +$('gradfloor').value;

        var cs = { '@type': F.type('CORE_SOURCES') };
        F.put(cs, 'CORE_SOURCES', 'psin', sig(last.psin));
        F.put(cs, 'CORE_SOURCES', 'p_e', sig(last.srcE));
        F.put(cs, 'CORE_SOURCES', 'p_i', sig(last.srcI));
        cs['fylite:heat_flux_e'] = sig(last.qE);
        cs['fylite:heat_flux_i'] = sig(last.qI);

        doc['fylite:result'] = { equilibrium: eq, core_profiles: cp,
                                 core_transport: ct, core_sources: cs };
        doc['fylite:result']['fylite:global'] = {
          'fylite:chi_e_average': last.avgE.chi,
          'fylite:chi_i_average': last.avgI.chi,
          'fylite:valid_points': last.avgE.n,
          'fylite:w_thermal': last.wTh,
          'fylite:tau_e': last.tauE,
          'fylite:p_auxiliary': last.diag.pAux,
          'fylite:p_alpha': last.diag.pAlpha,
          'fylite:p_radiation': last.diag.pRad,
          'fylite:p_ohmic': last.diag.pOhm,
        };
        return JSON.stringify(doc, null, 1);
      },
    },
  };
  S.formats(FORMATS);

  ['nlev', 'gradfloor', 'ip', 'pe', 'pi', 'dep', 'depw', 'vloop', 'cimp',
   'zeff', 'dtfrac'].forEach(function (id) {
    var e = $(id);
    if (e) e.addEventListener('input', syncLabels);
  });
  S.onRun(run);
  S.onRefresh(function () { refState(); draw(); });
  syncLabels();
  refState();
  S.refresh();
  //: no automatic run: this bar needs an imported document, and starting on
  //: whatever happens to be there is how a reader gets a chi for a table
  //: they did not mean to invert
});
