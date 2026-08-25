// The MACHINE-DESIGN scenario: one page, one worker, one run, two 功能栏.
//
//   0D 放电分析 zerod      定工况：解析地给出 Ip、环电压、聚变功率与 Q
//   位形与线圈电流 discharge   由目标截面反解 PF 通道电流，再正算一遍校验
//
// ★WHY THESE TWO SHARE A PAGE.  Designing a discharge is answering two
// questions about the same shot: what operating point do I want, and can this
// machine's coils hold the shape that carries it.  The 0-D bar answers the
// first analytically, the design bar answers the second with a solve, and the
// flat-top current is ONE CONTROL read by both — a shared control, not a
// product on the bus, which is why neither bar declares that it `needs` the
// other.  (The 0-D bar arrived here from the modelling page on 2026-08-22,
// where it had been the first of three stages.)
//
// ★WHAT THE 功能栏 BUY, and why this file is short about it: the strip over
// each bar (fold, switch, title, state), the run order, the bus and the
// folding of every panel are `scenario.js`'s — see its 功能栏 section.
//
// ★击穿场零 breakdown is RECONNECTED (T-D14, asked for by name): the step a
// discharge starts with — pure vacuum, one bounded least-squares, no
// Grad-Shafranov — now rides as this page's last bar, needs-free because
// nothing another bar produces can feed a pre-plasma solve.  Its twin demo
// 场零可行域 feasible stays withdrawn: it is a scan OVER the breakdown
// problem, and the question it answers has no caller on this page yet.


// ==========================================================================
// THE PAGE.  Its bars register below, one per section.
// ==========================================================================
//
// ★The part is still called `discharge` — the id every element on the design
// bar carries — while the page is `design`.  Renaming it would rename sixty
// ids for nothing: what the framework cares about is that the page has ONE
// part and that its bars are declared.
var DESIGN = FyScenario.part('discharge', { lockWhileBusy: ['run'] });

/**
 * The MARK beside a criterion: the published or physical thing that number
 * is being read against, coloured when the reading is a verdict.
 *
 * ★Module scope, because both bars answer the same question about their own
 * criteria and each had written its own copy of these three lines — under
 * two different names, which is how a repository ends up with two spellings
 * of "in the band" that can drift apart in wording.
 */
function critMark(key, cls) {
  return '<span class="' + (cls || '') + '">' + FyI18n.t(key) + '</span>';
}

// ==========================================================================
// 功能栏  zerod — 0D 放电分析
// ==========================================================================

// Zero-D discharge-analysis page controller (FYL-DESIGN-05 P1).
//
// The split the design asks for is visible in this file: everything that
// decides WHAT A RAMP LOOKS LIKE lives here — phase boundaries, trapezoidal
// waveforms, heating windows, the time grid.  Everything that decides what
// FOLLOWS FROM THEM physically is in the kernel, reached in one call per
// evaluation.  Nothing in this file contains a physical constant.
//
// The page carries no poloidal cross-section and no psi field, which is why
// FyScenario was written without assuming either.

//: ★DECLARED HERE, RUN AFTER THE MACHINES ARRIVE.  The preset devices are
//: fetched documents now, so `self.FYLITE_MACHINE` is null while this file is
//: being evaluated — and this body reads the machine on its first line.  It is
//: the framework that knows when the machines are in, so it is the framework
//: that calls this.
// ★★ONE READY SIGNAL FOR THE PAGE, shared by the bars that need it.
//
// The worker's `ready` is claimed by ONE bar (`zerod`'s `on.ready`) — that is
// how the bus works, and it is right: the handshake is the PAGE's news, not
// four bars' news.  But an INITIAL CASE has to wait for it on any bar that
// solves, and a bar that does not claim `ready` had no way to know.  Measured:
// 击穿场零's case applied before the wasm landed and its re-run threw
// 「wasm 尚未就绪」 into the console on every first visit.
var FyDesignReady = (function () {
  var fire;
  var promise = new Promise(function (res) { fire = res; });
  return { promise: promise, fire: function () { fire(); } };
})();

FyScenario.whenDevices(function () {
  'use strict';

  var M = self.FYLITE_MACHINE;
  var T = FyI18n.t;
  //: The time grid has to RESOLVE THE SHORTEST PHASE, not the pulse.  With
  //: a fixed 120 points a 100 s discharge puts ONE point inside a 1 s
  //: ramp-up — and the ramp is exactly where V_loop is dominated by
  //: L_p dI_p/dt, so the term that matters there is the one that vanishes.
  //: Measured: t_end 10 s -> 11 points in the ramp, 40 s -> 2, 100 s -> 1.
  var NT_MIN = 120, NT_MAX = 1200, PTS_PER_PHASE = 20;
  var NT = NT_MIN, NR = 41;
  var last = null, equil = null;   // equil = {volume, shape} for the shown slice
  //: 'a' = analysis (W_th is the integral of your profile), 'b' = prediction
  //: (W_th is solved from a confinement scaling).  A separate command, not a
  //: flag, so tier-B numbers cannot arrive where tier A was asked for.
  var tier = 'a';
  var predicted = null;
  var LAW_NAMES = ['IPB98(y,2)', 'ITER89-P'];
  //: solved equilibria, keyed by slice.  Cached because revisiting a slice
  //: must be free — but NEVER precomputed: 120 slices x 621 ms is 75 s, and
  //: C-1 of the design exists precisely to forbid that.
  var eqCache = new Map();
  var eqPending = null;
  //: the equilibrium's profile knob is not the 0-D profile knob; fixed here
  //: and stated on the page rather than silently mapped
  var EQ_BETA0 = 0.55;
  //: below this fraction of flat-top current there is no plasma to solve for
  //: — the same 5 % guard the native panel uses
  var EQ_MIN_FRAC = 0.05;
  //: ★the internal inductance the flux account is charged against.  A 0-D
  //: layer has no current-diffusion solve, so there is no l_i to read —
  //: this is a stated ASSUMPTION, fixed and shown, rather than a number
  //: quietly picked per machine.  The design bar's solved equilibrium
  //: reports its own l_i(3) beside it, which is where the two can be
  //: compared.
  var EQ_LI = 0.9;

  var S = DESIGN.bar('zerod', {
    title: 'nav.zerod',
    sliders: { ip: 0, ne: 1, te: 1, tite: 2, pn: 1, pt: 1, zeff: 1, dtf: 2,
               kappa: 2, pnbi: 1, pfscale: 2, hfac: 2, meff: 2, w0: 1,
               uqn: 0, uqsne: 2, uqste: 2, uqsip: 2, uqseed: 0 },
    on: {
      ready: onReady, error: onError, zerod: onZerod, solve: onSolve,
      zerodb: onZerodB, zerodmc: onMonteCarlo, zerodflux: onZerodFlux },
  });
  var $ = S.$, syncLabels = S.sync, setBusy = S.setBusy;

  // --- the orchestration half: phases and waveforms ------------------------

  function phases() {
    return { t_breakdown: 0.0,
             t_rampup_end: +$('t_rampup_end').value,
             t_flattop_end: +$('t_flattop_end').value,
             t_end: +$('t_end').value };
  }

  /** Which phase a time belongs to. */
  function phaseOf(ph, t) {
    if (t < ph.t_rampup_end) return t > ph.t_breakdown ? 'rampup' : 'breakdown';
    return t < ph.t_flattop_end ? 'flattop' : 'rampdown';
  }

  /** Trapezoid on the phase structure — the same rule the Python side uses. */
  function waveform(ph, t, flat, start, end) {
    if (t <= ph.t_breakdown) return start;
    if (t < ph.t_rampup_end) {
      var f = (t - ph.t_breakdown) /
              Math.max(ph.t_rampup_end - ph.t_breakdown, 1e-9);
      return start + f * (flat - start);
    }
    if (t <= ph.t_flattop_end) return flat;
    var g = (t - ph.t_flattop_end) /
            Math.max(ph.t_end - ph.t_flattop_end, 1e-9);
    return flat + Math.min(g, 1.0) * (end - flat);
  }

  function linspace(a, b, n) {
    var v = new Float64Array(n);
    for (var i = 0; i < n; i++) v[i] = a + (b - a) * i / (n - 1);
    return v;
  }

  /** Shortest phase [s] — what the grid has to resolve. */
  function shortestPhase(ph) {
    var d = [ph.t_rampup_end - ph.t_breakdown,
             ph.t_flattop_end - ph.t_rampup_end,
             ph.t_end - ph.t_flattop_end].filter(function (x) { return x > 0; });
    return d.length ? Math.min.apply(null, d) : 0;
  }

  /**
   * How many points this discharge needs.
   *
   * Uniform, just more of them — a non-uniform grid would buy the same
   * resolution and cost the cross-check against the native path, which
   * compares trace against trace.  0-D costs milliseconds, so paying with
   * points is the cheap side of that trade.
   */
  function gridSize(ph) {
    var span = ph.t_end - ph.t_breakdown, short = shortestPhase(ph);
    if (!(span > 0) || !(short > 0)) return NT_MIN;
    var want = Math.ceil(PTS_PER_PHASE * span / short) + 1;
    return Math.max(NT_MIN, Math.min(NT_MAX, want));
  }

  /** Everything the kernel call needs, built from the controls. */
  function inputs() {
    var ph = phases();
    NT = gridSize(ph);
    //: the slider spans whatever grid this discharge got
    var sl = $('slice');
    var frac = +sl.value / Math.max(1, +sl.max);
    sl.max = NT - 1;
    sl.value = Math.round(frac * (NT - 1));
    var t = linspace(ph.t_breakdown, ph.t_end, NT);
    var ipFlat = +$('ip').value * 1e3;
    var neFlat = +$('ne').value * 1e19;
    var teFlat = +$('te').value;
    var pAux = +$('pnbi').value * 1e6;
    var tOn = +$('t_on').value, tOff = +$('t_off').value;
    var ip = new Float64Array(NT), ne0 = new Float64Array(NT),
        te0 = new Float64Array(NT), pInj = new Float64Array(NT);
    for (var i = 0; i < NT; i++) {
      ip[i] = waveform(ph, t[i], ipFlat, 0, 0);
      ne0[i] = waveform(ph, t[i], neFlat, 0.02 * neFlat, 0.02 * neFlat);
      te0[i] = waveform(ph, t[i], teFlat, 0.01 * teFlat, 0.01 * teFlat);
      pInj[i] = (t[i] >= tOn && t[i] <= tOff) ? pAux : 0;
    }
    return {
      t: t, ip: ip, ne0: ne0, te0: te0, pInj: pInj, nt: NT,
      rho: linspace(0, 1, NR), phases: ph,
      //: points inside the shortest phase, for the warning below
      inShortest: Math.floor(shortestPhase(ph) * (NT - 1) /
                             Math.max(ph.t_end - ph.t_breakdown, 1e-9)),
      par: new Float64Array([
        +$('tite').value, +$('pn').value, +$('pt').value, 0.05,
        +$('r0').value, +$('a').value, +$('kappa').value,
        +$('zeff').value, 0.9, +$('dtf').value]),
    };
  }

  // --- drawing -------------------------------------------------------------

  var PHASE_KEYS = { breakdown: 'z.ph.breakdown', rampup: 'z.ph.rampup',
                     flattop: 'z.ph.flattop', rampdown: 'z.ph.rampdown' };

  function bands(ph, col) {
    return [
      { x0: ph.t_breakdown, x1: ph.t_rampup_end, color: col.alt,
        label: T('z.ph.rampup') },
      { x0: ph.t_rampup_end, x1: ph.t_flattop_end, color: col.lcfs,
        label: T('z.ph.flattop') },
      { x0: ph.t_flattop_end, x1: ph.t_end, color: col.muted,
        label: T('z.ph.rampdown') },
    ];
  }

  function sliceIndex() {
    return Math.max(0, Math.min(NT - 1, +$('slice').value | 0));
  }

  function drawTraces() {
    if (!last) return;
    var d = last.in, r = last.out;
    var col = FyPlot.palette($('tr-ip'));
    var tk = Array.from(d.t);
    var mark = d.t[sliceIndex()];
    var bd = bands(d.phases, col);
    var common = { xlabel: T('z.axis.t'), bands: bd, marker: mark,
                   xmin: d.phases.t_breakdown, xmax: d.phases.t_end };

    FyPlot.xy($('tr-ip'), Object.assign({
      series: [
        { x: tk, y: Array.from(d.ip, function (v) { return v / 1e3; }),
          color: col.lcfs, kind: 'line', width: 2, label: T('z.ser.ip') },
        { x: tk, y: Array.from(d.pInj, function (v) { return v / 1e6; }),
          color: col.accent, kind: 'line', dash: [5, 3],
          label: T('z.ser.paux') },
      ], ylabel: T('z.axis.ip'), ymin: 0 }, common));

    FyPlot.xy($('tr-vloop'), Object.assign({
      series: [{ x: tk, y: Array.from(r.vLoop), color: col.lcfs,
                 kind: 'line', width: 2 }],
      ylabel: T('z.axis.vloop'), zeroLine: true }, common));

    FyPlot.xy($('tr-pfus'), Object.assign({
      series: [
        { x: tk, y: Array.from(r.pFus, function (v) { return v / 1e6; }),
          color: col.lcfs, kind: 'line', width: 2, label: T('z.ser.pfus') },
        { x: tk, y: Array.from(r.pAlpha, function (v) { return v / 1e6; }),
          color: col.accent, kind: 'line', label: T('z.ser.palpha') },
      ], ylabel: T('z.axis.p'), ymin: 0 }, common));

    //: Q is NaN wherever nothing is injected; the plotter already skips
    //: non-finite points, so the trace simply stops rather than dropping to
    //: zero — which would read as "measured, and poor"
    FyPlot.xy($('tr-q'), Object.assign({
      series: [{ x: tk, y: Array.from(r.q), color: col.lcfs, kind: 'line',
                 width: 2 }],
      ylabel: T('z.axis.q'), ymin: 0 }, common));
  }

  function drawProfiles() {
    if (!last) return;
    var d = last.in, r = last.out, k = sliceIndex();
    var col = FyPlot.palette($('pr-ne'));
    var rho = Array.from(d.rho);
    var o = k * NR;
    var slice = function (arr) {
      return Array.from(arr.slice(o, o + NR));
    };
    FyPlot.xy($('pr-ne'), {
      series: [{ x: rho, y: slice(r.ne).map(function (v) { return v / 1e19; }),
                 color: col.lcfs, kind: 'line', width: 2 }],
      xlabel: T('z.axis.rho'), ylabel: T('z.axis.ne'), xmin: 0, xmax: 1,
      ymin: 0 });
    FyPlot.xy($('pr-t'), {
      series: [
        { x: rho, y: slice(r.te), color: col.lcfs, kind: 'line', width: 2,
          label: T('z.ser.te') },
        { x: rho, y: slice(r.ti), color: col.accent, kind: 'line',
          dash: [5, 3], label: T('z.ser.ti') },
      ], xlabel: T('z.axis.rho'), ylabel: T('z.axis.te'), xmin: 0, xmax: 1,
      ymin: 0 });
  }

  function f(v, d) { return isFinite(v) ? v.toFixed(d) : '—'; }

  /**
   * The available OH flux swing — the machine's, or the one typed here.
   *
   * ★T-D5 / FR-PULSE-004.  The swing is DEVICE data: it is what the central
   * solenoid can deliver, not a property of the shot being designed.  The
   * descriptor may declare it; the control on this panel stands in when it
   * does not; and when neither does, the answer is 0, which the account
   * renders as 「未声明摆幅」 and NOT as a duration.  There is no default and
   * there must never be one — a sustainable flat-top computed from a swing
   * nobody supplied is a number that reads like an answer.
   */
  function phiAvail() {
    var typed = +$('phiavail').value;
    if (typed > 0) return typed;
    var dev = FyDevice.limits(M).phiAvail;
    return dev !== null && dev > 0 ? dev : 0;
  }

  /** Where the swing in the account came from, for the panel to say. */
  function phiSource() {
    if (+$('phiavail').value > 0) return 'page';
    var dev = FyDevice.limits(M).phiAvail;
    return dev !== null && dev > 0 ? 'dev' : null;
  }

  // --- the operating domain, and the flux account -------------------------
  //
  // ★These are the CRITERIA a point is judged by, and they arrive with the
  // run rather than being computed here: the page has no business owning a
  // second spelling of the Greenwald density or of a beta convention.  What
  // this code does is choose what to show and say what it is being compared
  // against — including, where there is nothing to compare against, saying
  // that.

  /**
   * How far the shape on the sliders is from the shape this shot's
   * equilibrium actually found, as a fraction of the ellipsoidal volume.
   *
   * ★The SAME quantity the 体积口径 panel calls 「形状差」 — read from the
   * same two shapes, not recomputed from a second convention.  Null when no
   * slice has been solved: there is then nothing to be different from, and
   * saying "0 %" would be a claim rather than an absence.
   */
  function shapeDelta() {
    var eq = eqCache.get(sliceIndex());
    if (!last || !eq || !eq.shape) return null;
    var sh = eq.shape;
    var ve = last.out.volume;
    if (!(ve > 0)) return null;
    return (2 * Math.PI * Math.PI * sh.r0 * sh.a * sh.a * sh.kappa - ve) / ve;
  }

  //: ★Above this the operating-domain block is judging a different plasma
  //: from the one this page's own equilibrium found.  Not a physical
  //: threshold: beta_t and the Greenwald fraction are LINEAR in the volume
  //: and in a^2, so a 10 % shape error is a 10 % error in every verdict on
  //: the block — and the published values they are read against (Troyon
  //: 2.8, the Greenwald coefficient) are themselves quoted to two figures.
  //: A criterion whose error exceeds the precision of the reference it is
  //: read against is not a criterion.
  var GEO_WARN = 0.10;

  function drawLimits() {
    var body = $('limits'), fx = $('flux');
    if (!last || !last.limits) {
      body.innerHTML = ''; fx.innerHTML = '';
      $('limits-geo').hidden = true;
      drawQ95Note(0, null);
      return;
    }
    var L = last.limits, k = sliceIndex();
    var eq = eqCache.get(k);
    var q95 = eq && eq.q ? q95Of(eq.q) : null;
    //: ★T-D1.  Every row below except q95 was computed by the kernel from the
    //: geometry THIS PAGE'S SLIDERS carry — and the page's own equilibrium
    //: says that geometry is 44 % off the shape the machine actually makes.
    //: The rows are not recomputed here: a second spelling of the Greenwald
    //: density on the page thread is exactly what the worker exists to
    //: prevent.  What they get is a column saying which geometry each one
    //: stands on, and the block gets a banner when the two have parted.
    var dS = shapeDelta();
    var gSlider = dS === null ? T('z.geo.slider')
                              : T('z.geo.slider_d', { d: pct(dS) });
    var rows = [
      //: the line average of the prescribed profile: no geometry enters it
      [T('z.lim.nbar'), f(L.neBar[k] / 1e19, 2), '', T('z.geo.prof')],
      [T('z.lim.ngw'), f(L.nGw[k] / 1e19, 2), '', gSlider],
      [T('z.lim.fgw'), f(L.fGw[k], 3),
       critMark(L.fGw[k] > 1 ? 'z.mark.gw_over' : 'z.mark.gw_ok',
            L.fGw[k] > 1 ? 'bad' : 'good'), gSlider],
      [T('z.lim.qcyl'), f(L.qCyl[k], 2),
       critMark(L.qCyl[k] > 2 ? 'z.mark.q_ok' : 'z.mark.q_low',
            L.qCyl[k] > 2 ? 'good' : 'bad'), gSlider],
      //: ★the equilibrium's OWN q95 when a slice has been solved, and
      //: nothing when it has not.  A cylindrical estimate shown in a row
      //: labelled q95 would be the wrong number under the right name.
      [T('z.lim.q95'), q95 === null || !isFinite(q95) ? '—' : f(q95, 2),
       critMark(q95 === null ? 'z.mark.none' : 'z.mark.slice'),
       q95 === null ? '—' : T('z.geo.solved')],
      [T('z.lim.wth'), f(L.wTh[k] / 1e6, 3), critMark('z.mark.tier_a'),
       gSlider],
      [T('z.lim.betat'), f(L.betaT[k] * 100, 3), '', gSlider],
      [T('z.lim.betap'), f(L.betaP[k], 3), '', gSlider],
      [T('z.lim.betan'), f(L.betaN[k], 3), '', gSlider],
      [T('z.lim.troyon'), f(L.fTroyon[k], 3),
       critMark(L.fTroyon[k] > 1 ? 'z.mark.troyon_over' : 'z.mark.troyon_ok',
            L.fTroyon[k] > 1 ? 'bad' : 'good'), gSlider],
    ];
    //: ★T-D9: THE L-H MARGIN IS IN THE ANALYSIS TIER TOO.  「这炮进不进得了
    //: H 模」 is the question a shot is scheduled on, and it used to be
    //: reachable only from the prediction tab — the default tab carried
    //: Greenwald, q_cyl and Troyon and no P_LH at all.  The threshold is the
    //: kernel's Martin scaling either way (FR-PULSE-003: an EMPIRICAL
    //: scaling, marked as one, never as a limit this layer computes).  What
    //: differs between the tiers is the power that has to cross it, so the
    //: row says which one it used.
    var plh = L.pLH ? L.pLH[k] : null;
    var tierB = tier === 'b' && predicted && predicted.pHeat;
    var ph = tierB ? predicted.pHeat[k]
                   : (L.pHeat ? L.pHeat[k] : null);
    if (plh !== null && isFinite(plh)) {
      rows.push([T('z.lim.plh'), f(plh / 1e6, 2),
                 critMark('z.mark.scaling'), gSlider]);
      //: an UPPER bound on the margin: this layer has no radiated power to
      //: subtract from P_heat, and the row's own label says so
      rows.push([T('z.lim.flh'),
                 ph !== null && plh > 0 ? f(ph / plh, 2) : '—',
                 critMark(plh > 0 && ph > plh ? 'z.mark.lh_over'
                                              : 'z.mark.lh_under',
                          plh > 0 && ph > plh ? 'good' : '') +
                 (tierB ? badge() : ' ' + critMark('z.mark.pheat_a')),
                 gSlider]);
    }
    body.innerHTML = rows.map(function (r) {
      return '<tr><td>' + r[0] + '</td><td class="num">' + r[1] +
             '</td><td>' + r[2] + '</td><td class="geo">' + r[3] +
             '</td></tr>';
    }).join('');
    drawGeoBanner(dS, eq);
    drawQ95Note(k, eq);

    var B = L.flux;
    var sustain = B.tSustain === null || B.tSustain === undefined
      ? '<span class="note">' + T('z.flux.undeclared') + '</span>'
      : (B.tSustain === 0
         ? '<span class="bad">' + T('z.flux.spent') + '</span>'
         : f(B.tSustain, 1));
    var src = phiSource();
    var rowsF = [
      [T('z.flux.avail_used'),
       src === null ? '<span class="note">' + T('z.flux.undeclared') +
                      '</span>'
                    : f(phiAvail(), 2) + ' <span class="note">' +
                      T(src === 'dev' ? 'z.flux.avail_dev'
                                      : 'z.flux.avail_page',
                        { who: M.name }) + '</span>'],
      [T('z.flux.li_used', { li: EQ_LI.toFixed(2) }), EQ_LI.toFixed(2)],
      [T('z.flux.lp'), f(B.lP * 1e6, 3)],
      [T('z.flux.ind'), f(B.phiInd, 3)],
      [T('z.flux.res'), f(B.phiResRamp, 3)],
      [T('z.flux.ramp'), '<strong>' + f(B.phiRamp, 3) + '</strong>'],
      [T('z.flux.consumed'), f(B.phiConsumed, 3)],
      [T('z.flux.vflat'), f(B.vFlattop, 3)],
      [T('z.flux.sustain'), sustain],
    ];
    //: ★T-D10: the OTHER l_i on this page, and what the account would say if
    //: it used it.  See `fluxAt` — the assumption above stays exactly where
    //: it is, and these rows sit beside it rather than replacing it.
    var li3 = solvedLi();
    if (li3 !== null) {
      rowsF.push([T('z.flux.li_solved'),
                  '<strong>' + f(li3, 3) + '</strong>' +
                  ' <span class="note">' +
                  T('z.flux.li_gap', { d: pct((li3 - EQ_LI) / EQ_LI) }) +
                  '</span>']);
      if (fluxAlt && Math.abs(fluxAlt.li - li3) < 1e-9) {
        var A = fluxAlt.b;
        rowsF.push([T('z.flux.ind_alt'), f(A.phiInd, 3) +
                    ' <span class="note">' +
                    T('z.flux.alt_gap', { d: pct((A.phiInd - B.phiInd) /
                                                 Math.max(B.phiInd, 1e-9)) }) +
                    '</span>']);
        rowsF.push([T('z.flux.ramp_alt'), f(A.phiRamp, 3)]);
      } else {
        rowsF.push([T('z.flux.ind_alt'), T('z.flux.alt_pending')]);
      }
    }
    fx.innerHTML = rowsF.map(function (r) {
      return '<tr><td>' + r[0] + '</td><td class="num">' + r[1] +
             '</td></tr>';
    }).join('');
    fluxAt(li3);
  }

  /** The l_i(3) the design bar solved, or null before it has solved one. */
  function solvedLi() {
    var D = S.take('discharge');
    var v = D && D.criteria ? D.criteria.li3 : null;
    return v !== null && v !== undefined && isFinite(v) ? v : null;
  }

  //: the second account, keyed by the l_i it was computed at
  var fluxAlt = null, fluxAltAsked = null;

  /**
   * Ask the kernel for the same account at the solved l_i.
   *
   * ★A SECOND ANSWER, NOT A REPLACEMENT.  Silently swapping 0.9 for 1.491
   * would make a zero-dimensional ledger look like it had solved the current
   * diffusion it does not model — the assumption is the honest part of that
   * panel and it stays on screen.  What the reader gains is the size of what
   * the assumption is worth: measured on EAST, l_i 0.9 → 1.491 moves the
   * inductive flux by a third of a weber.
   *
   * Recomputed in the worker, because the flux account has one host.
   */
  function fluxAt(li3) {
    if (!last || li3 === null) return;
    if (fluxAlt && Math.abs(fluxAlt.li - li3) < 1e-9) return;
    if (fluxAltAsked !== null && Math.abs(fluxAltAsked - li3) < 1e-9) return;
    fluxAltAsked = li3;
    S.send({ cmd: 'zerodflux', t: Array.from(last.in.t),
             vLoop: Array.from(last.out.vLoop),
             ip: Array.from(last.in.ip),
             phases: [0, +$('t_rampup_end').value,
                      +$('t_flattop_end').value, +$('t_end').value],
             r0: +$('r0').value, a: +$('a').value, li: li3,
             phiAvail: phiAvail() });
  }

  function onZerodFlux(m) {
    fluxAlt = { li: m.li, b: m.result };
    drawLimits();
  }

  //: ★Two q95 this far apart are not the same quantity measured twice.
  //: 20 % because that is where the DIFFERENCE stops being explicable by the
  //: cylindrical estimate's own error: q_cyl assumes a straight circular
  //: column with an elongation correction, and against solved equilibria it
  //: runs ~10 % out (measured on EAST: 4.58 against 4.214).  Anything twice
  //: that is a different plasma, not a different formula.
  var Q95_SPREAD = 0.20;

  /**
   * The q95 values this page is carrying, and what each one stands on.
   *
   * ★T-D2(b).  Three of them, and nothing on the page said why they differ:
   * measured on EAST, q_cyl 4.58, the design bar's solved equilibrium 4.214
   * and this bar's slice 2.38 — the last one nearly a factor of two from the
   * other two, because it is solved at the slice's own current from the
   * reference coil set and comes out a limiter plasma half the size.
   */
  function drawQ95Note(k, eq) {
    var el = $('q95-note');
    if (!el) return;
    var L = last && last.limits;
    var bnd = function (kind) {
      return T(kind === 1 ? 'design.bnd.xpoint' : 'design.bnd.limiter');
    };
    var items = [];
    if (L && isFinite(L.qCyl[k]))
      items.push({ v: L.qCyl[k], who: T('z.q95.src.qcyl'),
                   geo: T('z.q95.geo.slider', {
                     r0: f(+$('r0').value, 3), a: f(+$('a').value, 3),
                     k: f(+$('kappa').value, 3) }),
                   bnd: T('z.q95.bnd.none') });
    var sq = eq && eq.q ? q95Of(eq.q) : null;
    if (sq !== null && isFinite(sq))
      items.push({ v: sq, who: T('z.q95.src.slice'),
                   geo: T('z.q95.geo.solved', {
                     r0: f(eq.shape.r0, 3), a: f(eq.shape.a, 3),
                     k: f(eq.shape.kappa, 3) }),
                   bnd: bnd(eq.bndKind) });
    //: ★the OTHER bar's, taken through the bus rather than reached for in
    //: the DOM: the design bar publishes what it solved, and a page that
    //: reads a neighbour's table cells is a page whose panels cannot move
    var D = S.take('discharge');
    if (D && D.criteria && D.criteria.q95 !== null
        && isFinite(D.criteria.q95))
      items.push({ v: D.criteria.q95, who: T('z.q95.src.design'),
                   geo: T('z.q95.geo.solved', {
                     r0: f(D.shape.r0, 3), a: f(D.shape.a, 3),
                     k: f(D.shape.kappa, 3) }),
                   bnd: bnd(D.bndKind) });
    if (items.length < 2) { el.innerHTML = ''; el.hidden = true; return; }
    var vals = items.map(function (x) { return x.v; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var spread = lo > 0 ? hi / lo - 1 : Infinity;
    var head = T(spread > Q95_SPREAD ? 'z.q95.h' : 'z.q95.ok', {
      n: items.length, d: (100 * spread).toFixed(0) + ' %',
      tol: (100 * Q95_SPREAD).toFixed(0) + ' %' });
    el.hidden = false;
    el.className = 'note' + (spread > Q95_SPREAD ? ' verdict warn' : '');
    el.innerHTML = head + (spread > Q95_SPREAD
      ? '<br>' + items.map(function (x) {
          return '<strong>' + f(x.v, 3) + '</strong> · ' + x.who + ' · ' +
                 x.geo + ' · ' + x.bnd;
        }).join('<br>')
      : '');
  }

  /** The warning strip over the criteria block, when the two shapes part. */
  function drawGeoBanner(dS, eq) {
    var el = $('limits-geo');
    if (dS === null || Math.abs(dS) <= GEO_WARN) { el.hidden = true; return; }
    var sh = eq.shape;
    el.hidden = false;
    el.innerHTML = T('z.geo.banner', {
      r0: f(+$('r0').value, 3), a: f(+$('a').value, 3),
      k: f(+$('kappa').value, 3),
      sr0: f(sh.r0, 3), sa: f(sh.a, 3), sk: f(sh.kappa, 3),
      d: pct(dS), tol: (100 * GEO_WARN).toFixed(0) + ' %' });
  }

  function drawTables() {
    if (!last) { $('scalars').innerHTML = ''; return; }
    var d = last.in, r = last.out, k = sliceIndex();
    var ph = phaseOf(d.phases, d.t[k]);
    var rows = [
      [T('z.row.time'), f(d.t[k], 2) + ' / ' + T(PHASE_KEYS[ph])],
      [T('z.row.ip'), f(d.ip[k] / 1e3, 1)],
      [T('z.row.vloop'), f(r.vLoop[k], 3)],
      [T('z.row.pfus'), f(r.pFus[k] / 1e6, 4)],
      [T('z.row.palpha'), f(r.pAlpha[k] / 1e6, 4)],
      [T('z.row.paux'), f(d.pInj[k] / 1e6, 2)],
      [T('z.row.q'), isFinite(r.q[k]) ? f(r.q[k], 4) : '—'],
      [T('z.row.ne0'), f(d.ne0[k] / 1e19, 2)],
      [T('z.row.te0'), f(d.te0[k], 2)],
    ];
    if (tier === 'b' && predicted) {
      var r2 = predicted;
      //: every one of these is a scaling law's output, not a measurement and
      //: not the user's input — and nothing in the number says so
      rows.push([T('z.row.w') + badge(), f(r2.wTh[k] / 1e6, 3)],
                [T('z.row.tau') + badge(),
                 r2.tauE[k] > 0 ? f(r2.tauE[k], 3) : '—'],
                [T('z.row.te0b') + badge(), f(r2.te0[k], 2)],
                [T('z.row.pohm') + badge(), f(r2.pOhm[k] / 1e6, 3)],
                [T('z.row.plh') + badge(), f(r2.pLH[k] / 1e6, 2)]);
    }
    $('scalars').innerHTML = rows.map(function (x) {
      return '<tr><td>' + x[0] + '</td><td class="num">' + x[1] + '</td></tr>';
    }).join('');
    $('slice-label').innerHTML = T('z.slice_at', {
      t: f(d.t[k], 2), phase: FyI18n.t(PHASE_KEYS[ph]) });
    drawVolumes();
  }

  function pct(x) {
    return (x >= 0 ? '+' : '') + (100 * x).toFixed(1) + ' %';
  }

  /**
   * O-4: the volume conventions, side by side — and DECOMPOSED.
   *
   * The first measurement of this comparison came out at -45 %, and taking
   * that at face value would have been wrong: most of it was not a
   * convention error at all but the fact that the sliders described a
   * bigger plasma (a = 0.45, kappa = 1.65) than the reference discharge
   * actually has (a = 0.38, kappa = 1.37).  Reporting one number would have
   * blamed the formula for the user's own choice.  So the table separates:
   *
   *   shape   — your sliders against the shape the solve produced;
   *   convention — the ellipsoidal formula EVALUATED AT THE SOLVED SHAPE
   *                against the volume that boundary really encloses.
   *
   * Only the second is a statement about the 0-D layer.
   */
  function drawVolumes() {
    //: the comparison belongs to the slice on screen, not to a fixed instant
    var eq = eqCache.get(sliceIndex());
    equil = eq && eq.shape ? { volume: eq.volume, shape: eq.shape } : null;
    var ve = last ? last.out.volume : null;
    var rows = [[T('z.vol.ellipsoid'), ve === null ? '—' : f(ve, 3) + ' m³']];
    if (equil) {
      var sh = equil.shape;
      var veSolved = 2 * Math.PI * Math.PI * sh.r0 * sh.a * sh.a * sh.kappa;
      rows.push([T('z.vol.solved_shape'),
                 'R₀ ' + f(sh.r0, 3) + ' · a ' + f(sh.a, 3) +
                 ' · κ ' + f(sh.kappa, 3)]);
      rows.push([T('z.vol.ellipsoid_solved'), f(veSolved, 3) + ' m³']);
      rows.push([T('z.vol.equil'), f(equil.volume, 3) + ' m³']);
      rows.push(['<strong>' + T('z.vol.d_convention') + '</strong>',
                 '<strong>' + pct((equil.volume - veSolved) / veSolved) +
                 '</strong>']);
      //: ★one definition of 「形状差」, read by the criteria block too — the
      //: banner over the operating domain and this row must never be able to
      //: quote two different numbers for the same disagreement
      rows.push([T('z.vol.d_shape'), pct(shapeDelta())]);
    } else {
      rows.push([T('z.vol.equil'), T('z.vol.pending')]);
    }
    $('volumes').innerHTML = rows.map(function (x) {
      return '<tr><td>' + x[0] + '</td><td class="num">' + x[1] + '</td></tr>';
    }).join('');
  }

  /** Fraction of the flat-top current at a slice. */
  function ipFraction(k) {
    var flat = +$('ip').value * 1e3;
    return flat > 0 ? last.in.ip[k] / flat : 0;
  }

  function drawCross() {
    var k = sliceIndex();
    var eq = eqCache.get(k);
    var col = FyPlot.palette($('cross'));
    S.cross(eq, {
      legend: true,
      //: no key until there is something to key: an empty frame with a
      //: legend claims to be showing what it is not
      legendItems: eq ? [
        { label: T('z.leg.lcfs'), color: col.lcfs, kind: 'line', width: 2 },
        { label: T('z.leg.axis'), color: col.fg, kind: 'plus' }] : [],
    });
    if (!eq) $('cross-legend').innerHTML = '';
    var cap = $('cross-cap');
    //: `eq` can outlive `last` — a cached slice survives until the next
    //: evaluation clears it, and an import nulls `last` first.  Reading
    //: last.in off the back of a truthy eq threw exactly there.
    if (eq && last) {
      var d = last.in;
      cap.innerHTML = T('z.cross_cap', {
        t: f(d.t[k], 2), phase: T(PHASE_KEYS[phaseOf(d.phases, d.t[k])]),
        frac: (100 * ipFraction(k)).toFixed(0) + ' %' });
    } else if (!FyDevice.hasReference(M)) {
      cap.innerHTML = T('z.cross_noref');
    } else if (!$('eqauto').checked) {
      cap.innerHTML = T('z.cross_off');
    } else if (last && ipFraction(k) <= EQ_MIN_FRAC) {
      cap.innerHTML = T('z.cross_none', {
        pct: (100 * ipFraction(k)).toFixed(1) + ' %' });
    } else {
      cap.innerHTML = '';
    }
  }

  function lawName() { return LAW_NAMES[+$('tau_law').value] || '?'; }

  /** The mark every tier-B number carries.  Design §3, non-negotiable. */
  function badge() {
    return ' <span class="tierb-badge">' +
           T('z.badge', { law: lawName() }) + '</span>';
  }

  function drawTierB() {
    $('tierb-figs').hidden = tier !== 'b';
    if (tier !== 'b' || !predicted || !last) return;
    var d = last.in, r = predicted;
    var col = FyPlot.palette($('tr-w'));
    var tk = Array.from(d.t);
    var common = { xlabel: T('z.axis.t'), bands: bands(d.phases, col),
                   marker: d.t[sliceIndex()],
                   xmin: d.phases.t_breakdown, xmax: d.phases.t_end };
    $('tierb-banner').innerHTML = T('z.tierb_banner', {
      law: lawName(), h: (+$('hfac').value).toFixed(2) });

    FyPlot.xy($('tr-w'), Object.assign({
      series: [{ x: tk, y: Array.from(r.wTh, function (v) { return v / 1e6; }),
                 color: col.lcfs, kind: 'line', width: 2 }],
      ylabel: T('z.axis.w'), ymin: 0 }, common));
    //: tau is 0 where the scaling is undefined; 0 would read as "instant
    //: loss", so those points are dropped rather than drawn
    FyPlot.xy($('tr-tau'), Object.assign({
      series: [{ x: tk, y: Array.from(r.tauE, function (v) {
                   return v > 0 ? v : NaN; }),
                 color: col.lcfs, kind: 'line', width: 2 }],
      ylabel: T('z.axis.tau'), ymin: 0 }, common));
    FyPlot.xy($('tr-heat'), Object.assign({
      series: [
        { x: tk, y: Array.from(r.pHeat, function (v) { return v / 1e6; }),
          color: col.lcfs, kind: 'line', width: 2, label: T('z.ser.pheat') },
        { x: tk, y: Array.from(r.pOhm, function (v) { return v / 1e6; }),
          color: col.muted, kind: 'line', label: T('z.ser.pohm') },
        { x: tk, y: Array.from(r.pAlpha, function (v) { return v / 1e6; }),
          color: col.accent, kind: 'line', label: T('z.ser.palpha') },
        { x: tk, y: Array.from(r.pLH, function (v) { return v / 1e6; }),
          color: col.alt, kind: 'line', dash: [5, 3], label: T('z.ser.plh') },
      ], ylabel: T('z.axis.p'), ymin: 0 }, common));
    FyPlot.xy($('tr-bal'), Object.assign({
      series: [{ x: tk, y: Array.from(r.balance), color: col.lcfs,
                 kind: 'line' }],
      ylabel: T('z.axis.bal'), zeroLine: true }, common));
  }

  function drawAll() {
    drawTraces(); drawProfiles(); drawCross(); drawTierB(); drawTables();
    drawLimits();
  }

  // --- worker --------------------------------------------------------------

  function onReady(m) {
    //: ★the marker stays 未运行.  The kernel handshake is the PAGE's news,
    //: not this bar's result — reported through the same slot, because the
    //: reader is looking there, but it must not make a bar that has never
    //: been asked for anything read 已完成.
    setBusy(false, T('status.kernel_ready', { coils: m.timing.coils }),
            '', 'idle');
    //: ★the kernel being ready is not a request to compute.  Every page
    //: now waits for its own button — loading a page and pressing it are
    //: two different acts, and only the second one asks for work.
    //: ★and the page-level signal every bar's initial case waits on
    FyDesignReady.fire();
  }

  function onError(m) {
    //: ★NAME THE COMMAND THAT FAILED.  This handler claims the worker's
    //: `error` type for the whole page — a bar that is not running gets it
    //: when no bar is — so an `init` that could not allocate its coil
    //: response matrix was reported here as 「求值失败」, an evaluation
    //: nobody had asked for.  The worker already sends `where`; it is the
    //: first thing a reader needs and it was being dropped.
    setBusy(false, T('z.fail', { where: m.where || 'zerod',
                                 why: m.message }), 'err');
    S.progress(0);
  }

  function onZerodB(m) {
    predicted = m.result;
    S.progress(1);
    drawAll();
    setBusy(false, T('z.doneb', { nt: m.nt, ms: m.ms, law: lawName(),
                                  h: (+$('hfac').value).toFixed(2) }));
    if (rerun) run();
  }

  function onZerod(m) {
    last = { in: pending, out: m.result, limits: m.limits };
    pending = null;
    //: every solved slice belonged to the PREVIOUS configuration
    eqCache.clear();
    //: and so did the account recomputed at the design bar's l_i
    fluxAlt = null; fluxAltAsked = null;
    S.progress(1);
    drawAll();
    //: say so when even the cap cannot resolve the shortest phase, rather
    //: than reporting an inductive term nobody can trust
    if (last.in.inShortest < 8) {
      //: ★the latch has to be RELEASED here too.  This branch used to write
      //: the status line and return, leaving `busy` true: the 0-D bar's key
      //: — and every other bar's — stayed disabled for the rest of the
      //: session, so a coarse grid was not a warning, it was a dead page.
      //: The strip gets the short verdict, the status line the explanation,
      //: the same split the design bar uses; the state is 已完成, because a
      //: coarse grid is a caveat on a result, not the absence of one.
      setBusy(false, T('z.state_coarse', { n: last.in.inShortest }),
              'warn', 'done');
      $('status').innerHTML = T('z.coarse', {
        n: last.in.inShortest, nt: m.nt });
      $('status').className = 'status warn';
    } else {
      setBusy(false, T('z.done', { nt: m.nt, nr: m.nr, ms: m.ms }));
    }
    if (rerun) { run(); return; }
    if (tier === 'b') runPredict();
    else solveSlice();
    runMonteCarlo();
  }

  /**
   * An equilibrium came back for whichever slice we asked about.
   *
   * P2's whole rule lives in the pairing of this with `solveSlice`: solve
   * ONE slice, the one the scrubbing stopped on.  Precomputing the trace
   * would be 120 x 621 ms.
   */
  function onSolve(m) {
    var k = eqPending;
    eqPending = null;
    var poly = [];
    for (var i = 0; i + 1 < m.result.lcfs.length; i += 2)
      poly.push([m.result.lcfs[i], m.result.lcfs[i + 1]]);
    var sh = FyPhys.shapeMetrics(poly);
    var eq = { psi: m.result.psi, psiAxis: m.result.psiAxis,
               psiBnd: m.result.psiBnd, lcfs: m.result.lcfs,
               axisR: m.result.axisR, axisZ: m.result.axisZ,
               //: the contours travel with the solve now, and this hand-built
               //: cache entry was dropping them — `plot.js` treats levels
               //: without segments as a wiring error and throws, so the slice
               //: died on its first draw rather than showing a bare picture
               fluxSegs: m.result.fluxSegs,
               //: ★the SOLVED q profile, kept because it is the only honest
               //: source of q95 for anything downstream.  A cylindrical
               //: estimate from Ip and the shape would be available without
               //: solving at all — which is exactly why it would be the
               //: wrong number to hand on from a page that DID solve.
               q: m.result.q, surfaces: m.result.surfaces,
               //: ★kept for the q95 comparison: two q95 that differ by a
               //: factor of two usually differ because one boundary is a
               //: limiter contact and the other an X point, and the number
               //: alone cannot say that
               bndKind: m.result.bndKind,
               chan: m.chan, shape: sh,
               volume: FyPhys.surfaceVolume(poly) };
    eqCache.set(k, eq);
    if (rerun) { run(); return; }
    drawCross();
    drawVolumes();
    //: ★T-D2(a) and T-D1 both live on this line.  The slice equilibrium used
    //: to reach the volume panel and stop there, so the criteria block kept
    //: showing 「q95 — 未解」 while the status line beside it read 「5.05 s 的
    //: 平衡已解」 — the same bar contradicting itself at the same instant —
    //: and the geometry the criteria stand on had nothing to be compared
    //: against.  One redraw answers both.
    drawLimits();
    var veSolved = 2 * Math.PI * Math.PI * sh.r0 * sh.a * sh.a * sh.kappa;
    setBusy(false, T('z.slice_solved', {
      t: f(last.in.t[k], 2), ms: m.ms === undefined ? '—' : m.ms,
      v: f(eq.volume, 3),
      d: pct((eq.volume - veSolved) / veSolved) }));
  }

  /**
   * Solve the slice we have stopped on, if there is anything to solve.
   *
   * Coil currents scale with the instantaneous current fraction — the same
   * rule the native panel uses, and the only one available without a
   * feedforward design for every instant.
   */
  function solveSlice() {
    if (!last || !$('eqauto').checked) { drawCross(); return; }
    if (!FyDevice.hasReference(M)) { drawCross(); return; }
    var k = sliceIndex();
    if (eqCache.has(k) || S.isBusy()) { drawCross(); drawVolumes(); return; }
    var frac = ipFraction(k) * (+$('pfscale').value);
    if (ipFraction(k) <= EQ_MIN_FRAC) { drawCross(); return; }
    eqPending = k;
    setBusy(true, T('z.solving_slice', { t: f(last.in.t[k], 2) }));
    S.send({ cmd: 'solve',
             //: ★asked for here and nowhere else: they exist to be handed
             //: on to the local-stability page, whose deck needs the shape
             //: of an INTERIOR surface, not the boundary's
             surfaces: 12,
             chan: Array.from(M.reference.aturns, function (v) {
               return v * frac; }),
             prof: { beta0: EQ_BETA0, emp: 1.0, enp: 1.0,
                     r0: FyDevice.tf(M).r0 },
             ip: last.in.ip[k] });
  }

  var pending = null;
  var uqStats = null;

  /** Deterministic normal deviates — a seeded sweep must be repeatable. */
  function gaussian(seed) {
    var s = seed >>> 0;
    var uni = function () {
      s = (1103515245 * s + 12345) & 0x7fffffff;
      return (s + 0.5) / 0x80000000;
    };
    return function () {
      var u = Math.max(uni(), 1e-12), v = uni();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
  }

  /**
   * Build the perturbed samples HERE, not in the kernel.
   *
   * Deciding what a perturbed waveform looks like is the same kind of
   * decision as deciding what a ramp looks like (FYL-DESIGN-05 §4), so it
   * stays on this side; only the physics of each sample crosses.
   */
  function runMonteCarlo() {
    if (!last || !$('uqon').checked) {
      uqStats = null; $('uq-panel').hidden = true; drawTables(); return;
    }
    var n = +$('uqn').value | 0;
    var d = last.in, nt = d.t.length;
    var g = gaussian(+$('uqseed').value * 7919 + 13);
    var sne = +$('uqsne').value, ste = +$('uqste').value,
        sip = +$('uqsip').value;
    var ip = new Float64Array(n * nt), ne0 = new Float64Array(n * nt),
        te0 = new Float64Array(n * nt), pin = new Float64Array(n * nt),
        par = new Float64Array(n * 10);
    for (var s2 = 0; s2 < n; s2++) {
      //: one factor per sample, applied to the whole waveform: the
      //: uncertainty is in the SCENARIO, not in each time point
      //: independently — sampling per point would average itself away
      var fne = Math.max(0.05, 1 + sne * g());
      var fte = Math.max(0.05, 1 + ste * g());
      var fip = Math.max(0.05, 1 + sip * g());
      var off = s2 * nt;
      for (var i = 0; i < nt; i++) {
        ip[off + i] = d.ip[i] * fip;
        ne0[off + i] = d.ne0[i] * fne;
        te0[off + i] = d.te0[i] * fte;
        pin[off + i] = d.pInj[i];
      }
      par.set(d.par, s2 * 10);
    }
    setBusy(true, T('u.running', { n: n }));
    S.send({ cmd: 'zerodmc', nSample: n, nt: nt, slice: sliceIndex(),
             t: Array.from(d.t), ip: ip, ne0: ne0, te0: te0, pInj: pin,
             rho: Array.from(d.rho), par: par });
  }

  var UQ_ROWS = [['pFus', 'u.row.pfus', 1e6, 4], ['q', 'u.row.q', 1, 4],
                 ['vLoop', 'u.row.vloop', 1, 3],
                 ['pAlpha', 'u.row.palpha', 1e6, 4]];

  function onMonteCarlo(m) {
    uqStats = m.stats;
    $('uq-panel').hidden = false;
    $('uq-table').innerHTML = UQ_ROWS.map(function (r) {
      var st = uqStats[r[0]];
      if (!st || !st.n) return '';
      var lo = st.p05 / r[2], hi = st.p95 / r[2], mid = st.p50 / r[2];
      var rel = Math.abs(mid) > 0 ? (hi - lo) / Math.abs(mid) : NaN;
      return '<tr><td>' + T(r[1]) +
        (st.dropped ? ' <span class="note">' +
                      T('u.dropped', { n: st.dropped }) + '</span>' : '') +
        '</td><td class="num">' + f(mid, r[3]) +
        '</td><td class="num">' + f(lo, r[3]) + ' – ' + f(hi, r[3]) +
        '</td><td class="num">' + (isFinite(rel) ? (100 * rel).toFixed(1) + ' %'
                                                 : '—') + '</td></tr>';
    }).join('');
    S.progress(1);
    setBusy(false, T('u.done', { n: m.n, ms: m.ms,
                                 per: (m.ms / m.n).toFixed(2) }));
  }

  /**
   * Tier B, sent as its OWN command.
   *
   * It always follows a tier-A pass, because the prescribed density is an
   * input to the closure: the scaling wants a line-averaged density, and
   * K-3 needs the density profile to put the solved energy back onto a
   * temperature amplitude.  Only the temperature stops being yours.
   */
  function runPredict() {
    if (!last) return;
    var d = last.in;
    S.progress(0.6);
    S.send({ cmd: 'zerodb', t: Array.from(d.t), ip: Array.from(d.ip),
             ne0: Array.from(d.ne0), pAux: Array.from(d.pInj),
             rho: Array.from(d.rho), par: Array.from(d.par),
             pred: [+$('tau_law').value, +$('hfac').value, +$('meff').value,
                    Math.abs(FyDevice.tf(M).b0), +$('w0').value * 1e6] });
  }

  function setTier(t) {
    tier = t;
    $('tab-a').className = t === 'a' ? 'on' : '';
    $('tab-b').className = t === 'b' ? 'on' : '';
    $('tierb-controls').hidden = t !== 'b';
    $('tier-note').innerHTML = T(t === 'b' ? 'z.tier.note.b' : 'z.tier.note.a');
    if (t === 'b') { if (last) runPredict(); }
    else { predicted = null; drawAll(); }
  }

  //: A run asked for while one is in flight must not be DROPPED.  The
  //: equilibrium solve holds the latch for ~600 ms, and anything the user
  //: changes in that window would otherwise be silently ignored — the page
  //: would sit there showing a result for a configuration that is no longer
  //: on screen.  Remember it instead and re-run on completion.
  var rerun = false;

  function run() {
    if (S.isBusy()) { rerun = true; return; }
    rerun = false;
    pending = inputs();
    setBusy(true, '');
    S.progress(0.4);
    S.send({ cmd: 'zerod', t: Array.from(pending.t),
             ip: Array.from(pending.ip), ne0: Array.from(pending.ne0),
             te0: Array.from(pending.te0), pInj: Array.from(pending.pInj),
             rho: Array.from(pending.rho), par: Array.from(pending.par),
             //: ★the criteria travel with the run: what makes an instant
             //: RUNNABLE is part of the answer, not a second question, and
             //: the geometry is sent as the page's own so the criteria
             //: cannot be computed against a different plasma than the
             //: traces were
             geom: { r0: +$('r0').value, a: +$('a').value,
                     kappa: +$('kappa').value },
             phases: [0, +$('t_rampup_end').value,
                      +$('t_flattop_end').value, +$('t_end').value],
             li: EQ_LI, phiAvail: phiAvail() });
    //: the run chain waits for the 0-D answer itself.  ★What it does NOT
    //: wait for is the work that answer sets off — the slice equilibrium, the
    //: prediction tier, the Monte-Carlo sweep — because those refine a result
    //: the reader already has, and a chain that waited for them would hold
    //: the rest of the page behind a sampling loop.
    return S.settle('zerod');
  }

  /**
   * The operating point at the slice being shown — the coarse screen's
   * answer, in the form the 1.5D page can refine.
   *
   * ★★What travels is the SOLVED geometry, not this page's inputs.  R0, a,
   * kappa and delta come from `shape_metrics` on the boundary the
   * equilibrium found, and q95 from that equilibrium's own q profile.  The
   * 0-D page's own R0/a/kappa are an ellipse it ASSUMED in order to get a
   * volume; handing those on would pass a guess downstream wearing the
   * clothes of a result.  This is why the deck is only available once a
   * slice has actually been solved.
   *
   * ★What does NOT travel is a boundary temperature.  The 0-D profile is
   * prescribed as peaked-to-zero, so it has no pedestal to offer, and
   * inventing one would put a number the reader would take for a
   * measurement into the one control that sets the 1.5D answer's scale.
   * The importing page says which controls it set and which it left.
   */
  function operatingPoint() {
    var k = sliceIndex();
    var eq = eqCache.get(k);
    if (!last) return null;
    if (!eq) return { error: T('z.op.no_slice') };
    var sh = eq.shape;
    if (!sh || !(sh.a > 0)) return { error: T('z.op.no_shape') };
    var doc = FySession.envelope('zerod', FySession.collect(CONTROLS, S.scope),
                                 S.kernel());
    doc['fylite:operating_point'] = {
      //: the mark that says where this came from, the way the pressure
      //: profile edge already does — a deck re-imported into the page that
      //: made it must not read as an independent measurement
      'fylite:provenance': 'fylite:zerod-slice',
      'fylite:time': +last.in.t[k].toPrecision(7),
      'fylite:slice_index': k,
      'fylite:plasma_current': +last.in.ip[k].toPrecision(7),
      //: from the equilibrium, and said so
      'fylite:geometry': {
        'fylite:r0': +sh.r0.toPrecision(7), 'fylite:a': +sh.a.toPrecision(7),
        'fylite:kappa': +sh.kappa.toPrecision(7),
        'fylite:delta': +sh.delta.toPrecision(7),
        'fylite:delta_upper': +sh.deltaU.toPrecision(7),
        'fylite:delta_lower': +sh.deltaL.toPrecision(7),
        'fylite:source': 'fylite:slice-equilibrium',
      },
      'fylite:q95': eq.q ? +q95Of(eq.q).toPrecision(7) : null,
      //: ★the interior surfaces, so a local-stability deck can be built at a
      //: radius rather than at the boundary.  q comes from this same
      //: equilibrium's q profile; the gradients are ANALYTIC from this
      //: page's own prescribed profiles — n = n0(1-rho^2)^e_n gives
      //: a/L_n = 2 e_n rho/(1-rho^2), exactly, and the same for T.
      //: ★★The label is this page's rho, read as r/a, and the surface's
      //: r/a is the traced GEOMETRIC one.  They are the same label only
      //: because this page prescribes on r/a; that is stated here rather
      //: than left for the consumer to assume.
      'fylite:surfaces': (eq.surfaces || []).map(function (sf) {
        var ra = sf.a / sh.a;
        var g = 1 - ra * ra;
        var f = g > 1e-6 ? 2 * ra / g : 0;
        return {
          'fylite:r_over_a': +ra.toPrecision(7),
          'fylite:rmaj_over_a': +(sf.r0 / sh.a).toPrecision(7),
          'fylite:kappa': +sf.kappa.toPrecision(7),
          'fylite:delta': +sf.delta.toPrecision(7),
          'fylite:q': eq.q ? +interpQ(eq.q, sf.x).toPrecision(7) : null,
          'fylite:a_over_ln': +(f * +$('pn').value).toPrecision(7),
          'fylite:a_over_lt': +(f * +$('pt').value).toPrecision(7),
        };
      }),
      'fylite:density_peaking': +$('pn').value,
      'fylite:temperature_peaking': +$('pt').value,
      'fylite:b_tf': +$('dtf').value,
      'fylite:ne_central': +last.in.ne0[k].toPrecision(7),
      'fylite:te_central': +last.in.te0[k].toPrecision(7),
      'fylite:ti_over_te': +$('tite').value,
      'fylite:z_eff': +$('zeff').value,
    };
    return JSON.stringify(doc, null, 1);
  }

  /** q at an arbitrary psi-bar, on the equilibrium's own grid. */
  function interpQ(q, at) {
    var x = q.x, v = q.q;
    if (!x || !x.length) return NaN;
    if (at <= x[0]) return v[0];
    for (var i = 1; i < x.length; i++)
      if (x[i] >= at) {
        var w = (at - x[i - 1]) / (x[i] - x[i - 1]);
        return v[i - 1] + w * (v[i] - v[i - 1]);
      }
    return v[v.length - 1];
  }

  /** q at psi-bar = 0.95, interpolated on the slice equilibrium's own grid. */
  function q95Of(q) {
    var x = q.x, v = q.q;
    if (!x || !v || !x.length) return NaN;
    for (var i = 1; i < x.length; i++) {
      if (x[i] >= 0.95) {
        var w = (0.95 - x[i - 1]) / (x[i] - x[i - 1]);
        return v[i - 1] + w * (v[i] - v[i - 1]);
      }
    }
    return v[v.length - 1];
  }

  // --- file exchange -------------------------------------------------------

  //: every control the page owns — the session round-trips configuration,
  //: and FySession.apply() re-clamps each value to its own control on import
  var CONTROLS = ['t_rampup_end', 't_flattop_end', 't_end', 'ip', 'ne', 'te',
                  'tite', 'pn', 'pt', 'zeff', 'dtf', 'r0', 'a', 'kappa',
                  'pnbi', 't_on', 't_off', 'tau_law', 'hfac', 'meff', 'w0',
                  'phiavail'];

  function jsonDoc() {
    var doc = FySession.envelope('zerod', FySession.collect(CONTROLS, S.scope),
                                 S.kernel());
    if (last) {
      var k = sliceIndex();
      doc['fylite:result'] = {
        'fylite:time': FySession.sig(last.in.t),
        'fylite:ip': FySession.sig(last.in.ip),
        'fylite:p_injected': FySession.sig(last.in.pInj),
        'fylite:v_loop': FySession.sig(last.out.vLoop),
        'fylite:p_fusion': FySession.sig(last.out.pFus),
        'fylite:p_alpha': FySession.sig(last.out.pAlpha),
        'fylite:q_fusion': Array.from(last.out.q, function (v) {
          //: JSON has no NaN; null says "undefined here", 0 would lie
          return isFinite(v) ? v : null;
        }),
        'fylite:volume_ellipsoid': last.out.volume,
        'fylite:volume_equilibrium': equil ? equil.volume : null,
        'fylite:equilibrium_shape': equil ? equil.shape : null,
        'fylite:slice_index': k,
      };
    }
    //: The file has to record WHICH TIER produced what.  Exporting a
    //: prediction-tier session that looked like an analysis one would
    //: reproduce, in a document meant to outlive the page, exactly the
    //: confusion the badges exist to prevent.
    doc['fylite:tier'] = tier === 'b' ? 'prediction' : 'analysis';
    if (tier === 'b' && predicted) {
      doc['fylite:closure'] = {
        'fylite:tau_e_scaling': lawName(),
        'fylite:h_factor': +$('hfac').value,
        'fylite:m_eff': +$('meff').value,
        'fylite:b_toroidal': Math.abs(FyDevice.tf(M).b0),
        //: named for what it is: not a measurement, not the user's input
        'fylite:provenance': 'solved-from-scaling',
      };
      doc['fylite:result'] = doc['fylite:result'] || {};
      var r = predicted;
      doc['fylite:result']['fylite:w_thermal'] = FySession.sig(r.wTh);
      doc['fylite:result']['fylite:tau_energy'] = FySession.sig(r.tauE);
      doc['fylite:result']['fylite:te0_solved'] = FySession.sig(r.te0);
      doc['fylite:result']['fylite:p_ohmic'] = FySession.sig(r.pOhm);
      doc['fylite:result']['fylite:p_alpha_solved'] = FySession.sig(r.pAlpha);
      doc['fylite:result']['fylite:p_heat'] = FySession.sig(r.pHeat);
      doc['fylite:result']['fylite:p_lh_threshold'] = FySession.sig(r.pLH);
      doc['fylite:result']['fylite:budget_residual'] = FySession.sig(r.balance);
    }
    return doc;
  }

  /**
   * ★What this bar hands downstream, published as a BUILDER rather than as a
   * value: the deck is whatever the slice on screen says right now, and a
   * value published once would go stale the moment the slice moved.  It
   * returns null before anything has been solved and `{error}` when the slice
   * carries no equilibrium — the taker checks, exactly as the file import
   * does, because a downstream bar must not run on a deck that does not exist.
   */
  S.publish(operatingPoint);

  /**
   * The same deck, packed for the handoff slot.
   *
   * ★Exposed on the page rather than through the bus, because the consumer is
   * the PAGE's toolbar button (and, one page away, the modelling scenario) —
   * not a bar beside this one.  It returns null exactly when the export would
   * have refused: no run yet, or a slice with no solved equilibrium.
   */
  self.FyZerodDeck = function () {
    var doc = operatingPoint();
    if (!doc || doc.error) return null;
    return { kind: 'op', from: 'design', bar: 'zerod',
             name: 'fylite_operating_point.json',
             text: JSON.stringify(doc, null, 1) };
  };

  var io = S.formats({
    op: {
      //: export-only: this part WRITES an operating point and never reads one
      exportOnly: true,
      docPage: 'zerod', docKey: 'fylite:operating_point',
      label: T('z.op.label'), filename: 'fylite_operating_point.json',
      accept: '.json,application/json',
      exportHint: T('z.op.export_hint'),
      importHint: T('z.op.import_hint'),
      build: operatingPoint,
      apply: function () { throw new Error(T('z.op.no_import')); },
    },
    json: {
      docPage: 'zerod',
      label: T('io.label.json'), filename: 'fylite_zerod_session.json',
      accept: '.json,application/json',
      exportHint: T('z.j.export_hint'),
      importHint: T('z.j.import_hint'),
      build: function () {
        if (!last) return { error: T('z.g.none') };
        return JSON.stringify(jsonDoc(), null, 1);
      },
      apply: function (text, name) {
        var doc = FySession.parse(text);
        if (doc['fylite:page'] !== 'zerod')
          throw new Error(T('msg.wrong_page', { page: doc['fylite:page'] }));
        var r = FySession.apply(doc['fylite:config'], S.scope);
        syncLabels();
        //: restore the tier too — a session exported from the prediction
        //: tier that reopened in the analysis one would silently answer a
        //: different question
        last = null;
        predicted = null;
        //: every solved slice belonged to the configuration being replaced
        eqCache.clear();
        setTier(doc['fylite:tier'] === 'prediction' ? 'b' : 'a');
        //: 不自动开算——导入说的是「算什么」，不是「现在就算」
                  return T('z.j.imported', {
          name: name, n: r.applied.length,
          skipped: r.skipped.length
                   ? T('msg.skipped', { n: r.skipped.length }) : '' });
      },
    },
    device: FyIO.deviceFormat(M),
  });
  //: the file buttons lock with the run buttons while a solve is in flight

  // --- events --------------------------------------------------------------

  ['ip', 'ne', 'te', 'tite', 'pn', 'pt', 'zeff', 'dtf', 'kappa', 'pnbi']
    .forEach(function (id) {
      $(id).addEventListener('input', function () { syncLabels(); });
      $(id).addEventListener('change', run);
    });
  ['t_rampup_end', 't_flattop_end', 't_end', 't_on', 't_off', 'r0', 'a',
   //: the available swing is an INPUT to the flux account, and the account
   //: is computed where the account's formula lives — so changing it
   //: re-runs rather than being folded into a second copy of the sum here
   'phiavail']
    .forEach(function (id) { $(id).addEventListener('change', run); });
  //: scrubbing the slice must not re-evaluate — it only re-reads a result
  //: that is already in hand
  $('slice').addEventListener('input', function () {
    drawTraces(); drawProfiles(); drawCross(); drawTables(); drawLimits();
  });
  //: `change` is the release, which is exactly "the slice you stopped on"
  $('slice').addEventListener('change', function () {
    solveSlice(); runMonteCarlo();
  });
  ['uqon', 'uqn', 'uqsne', 'uqste', 'uqsip', 'uqseed'].forEach(function (id) {
    $(id).addEventListener('change', runMonteCarlo);
  });
  $('eqauto').addEventListener('change', solveSlice);
  $('pfscale').addEventListener('change', function () {
    eqCache.clear(); solveSlice();
  });
  S.onRun(run);

  // --- the worked cases ----------------------------------------------------
  //
  // ★The machinery is `scenario.js`'s (`S.cases`).  ★The INITIAL case waits
  // for this page's worker: `FyDevice.applyRanges` below writes the machine's
  // own numbers into these controls at init, and a case applied before that
  // would be overwritten by the machine it was written for.
  S.cases({ when: FyDesignReady.promise,
            after: function () { syncLabels(); } });

  $('tab-a').addEventListener('click', function () { setTier('a'); });
  $('tab-b').addEventListener('click', function () { setTier('b'); });
  ['tau_law', 'hfac', 'meff', 'w0'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      if (tier === 'b') runPredict();
    });
  });

  S.onRefresh(function () {
    //: the note quotes the fixed beta0, so it is filled from the constant
    S.find('[data-i18n="z.eq_note"]').innerHTML =
      T('z.eq_note', { b: EQ_BETA0 });
    $('tier-note').innerHTML =
      T(tier === 'b' ? 'z.tier.note.b' : 'z.tier.note.a');
    drawAll();
  });

  //: the markup's defaults belong to no machine — take the device's own
  FyDevice.applyRanges(M, { setValues: true, scope: S.scope });

  syncLabels();

  setTier('a');
  S.refresh();
});

// ==========================================================================
// 功能栏  discharge — 位形与线圈电流
//
// ★The bar id, the part name and the forty-odd `discharge-*` element ids
// stay as they are.  The PAGE is now called 放电设计, which is what the id
// `discharge` used to name; renaming the bar in the markup to match its new
// display name would touch every id, every gate and the CSS for a string no
// reader ever sees.  Display name and internal id are allowed to differ —
// this comment is the place that says so.
// ==========================================================================

// Discharge-design page controller.
//
// The page owns the UI; every solve happens in worker.js, which owns the
// wasm instance.  Design runs are a sequence of solves, so the worker
// streams progress messages back between passes.

//: ★DECLARED HERE, RUN AFTER THE MACHINES ARRIVE.  The preset devices are
//: fetched documents now, so `self.FYLITE_MACHINE` is null while this file is
//: being evaluated — and this body reads the machine on its first line.  It is
//: the framework that knows when the machines are in, so it is the framework
//: that calls this.
FyScenario.whenDevices(function () {
  'use strict';

  var M = self.FYLITE_MACHINE, P = self.FyPhys;
  var T = FyI18n.t;
  var state = null, referenceLcfs = null, lastHistory = null;
  //: ★what the LAST run of this bar achieved against what it was asked
  //: for — the fact the pulse bar downstream has to know and could not
  //: ask for.  `reached` is null before anything has run.
  var outcome = null;

  //: the O point is two numeric fields plus a drag handle, not sliders
  var OPOINT = ['r0', 'z0'];
  var SLIDERS = ['a', 'kappa', 'du', 'dl', 'ip', 'beta0', 'emp',
                 'enp', 'gamma', 'passes'];

  var S = DESIGN.bar('discharge', {
    title: 'nav.discharge',
    sliders: { a: 3, kappa: 2, du: 2, dl: 2, ip: 0, beta0: 2,
               emp: 2, enp: 2, gamma: 2, passes: 0 },
    lockWhileBusy: ['run', 'solve', 'reset'],
    on: {
      ready: onReady, error: onError, progress: onProgress,
      solve: onSolve, design: onDesign, start: onStart },
  });
  var $ = S.$, syncLabels = S.sync, setBusy = S.setBusy;
  function grid() { return S.kernel() ? S.kernel().grid : null; }

  function readTarget() {
    return { r0: +$('r0').value, a: +$('a').value, kappa: +$('kappa').value,
             deltaU: +$('du').value, deltaL: +$('dl').value, z0: +$('z0').value };
  }
  //: ★T-D6′ — the delivered tier exists only where the machine brought a
  //: reference reconstruction with its profiles; everywhere else the
  //: select is pinned to the analytic family.
  function deliveredProf() {
    var R = M.reference, dl = R && R.delivered;
    return (dl && dl.psi_norm && dl.dpressure_dpsi && dl.f_df_dpsi)
      ? dl : null;
  }
  function readProf() {
    var el = $('profsrc'), dl = deliveredProf();
    if (el && el.value === 'delivered' && dl)
      return { tab: { x: Float64Array.from(dl.psi_norm),
                      pprime: Float64Array.from(dl.dpressure_dpsi),
                      ffprime: Float64Array.from(dl.f_df_dpsi) },
               source: 'delivered' };
    return { beta0: +$('beta0').value, emp: +$('emp').value,
             enp: +$('enp').value, r0: FyDevice.tf(M).r0 };
  }
  //: the family sliders mean nothing under the delivered tier, and a
  //: control that silently does nothing is worse than a disabled one
  function syncProfControls() {
    var el = $('profsrc');
    if (!el) return;
    var dl = deliveredProf();
    var opt = el.querySelector('option[value="delivered"]');
    if (opt) {
      opt.disabled = !dl;
      if (!dl) {
        opt.title = T('design.profsrc.no_ref');
        if (el.value === 'delivered') el.value = 'analytic';
      }
    }
    var tabbed = el.value === 'delivered' && !!dl;
    ['beta0', 'emp', 'enp'].forEach(function (id) {
      var c = $(id);
      if (c) c.disabled = tabbed;
    });
  }
  function readIp() { return +$('ip').value * 1e3; }
  if ($('profsrc')) {
    $('profsrc').addEventListener('change', syncProfControls);
    syncProfControls();
  }

  // --- coil current table ---------------------------------------------------

  var coilInputs = [], coilMarks = [];
  function buildCoilTable() {
    var tb = $('coils');
    tb.innerHTML = '';
    M.channels.forEach(function (combo, c) {
      var el = M.coils[combo[0][0]];
      var tr = document.createElement('tr');
      var td1 = document.createElement('td');
      td1.textContent = el.name + (combo.length > 1 ? '+' : '');
      var td2 = document.createElement('td');
      var inp = document.createElement('input');
      inp.type = 'number'; inp.step = '10';
      // typing a current repaints the figure at once: the coil fill IS the
      // current, so leaving it stale until the next solve would show a
      // colour that no longer matches the number next to it.  Programmatic
      // `.value =` fires no input event, so setCurrents() cannot loop here.
      inp.addEventListener('input', draw);
      td2.appendChild(inp);
      coilInputs.push(inp);
      //: ★the limit is REPORTED, never silently applied: a design that asks
      //: for more than the supplies can hold has to say so, not come back
      //: quietly clipped and look feasible
      var td3 = document.createElement('td');
      td3.className = 'num';
      coilMarks.push(td3);
      tr.append(td1, td2, td3);
      tb.appendChild(tr);
    });
  }
  //: the authoritative coil set.  The table shows it rounded to 0.1 kA, so
  //: reading the set back from the inputs would quantize it by up to 50 A on
  //: every run — enough to make a converged design drift for no reason.
  var currentChan = null;
  function setCurrents(chan) {
    currentChan = Float64Array.from(chan);
    coilInputs.forEach(function (inp, i) {
      inp.value = (currentChan[i] / 1e3).toFixed(1);
    });
    markCurrents();
  }

  /** Say, per channel, whether it is inside the bound that was declared. */
  function markCurrents() {
    var cap = currentCap();
    coilMarks.forEach(function (td, i) {
      if (!cap) { td.innerHTML = ''; return; }
      var over = Math.abs(currentChan[i]) > cap[i];
      td.innerHTML = '<span class="' + (over ? 'bad' : 'good') + '">' +
        T(over ? 'design.over' : 'design.within') + '</span>';
    });
  }
  /** Edits in the table override the stored set for that channel only. */
  function readCurrents() {
    var out = Float64Array.from(currentChan || coilInputs.map(function () { return 0; }));
    coilInputs.forEach(function (inp, i) {
      var typed = +inp.value * 1e3;
      if (Math.abs(typed - out[i]) > 50) out[i] = typed;
    });
    return out;
  }

  // --- drawing --------------------------------------------------------------

  function draw() {
    var t = readTarget();
    var tgt = P.millerBoundary(t, 121);
    var flat = new Float64Array(tgt.length * 2);
    tgt.forEach(function (p, i) { flat[2 * i] = p[0]; flat[2 * i + 1] = p[1]; });
    var handles = [{ r: t.r0, z: t.z0, kind: '+', key: 'o' }];
    //: ★T-D18: one draggable × per requested null, so 双零 is two marks on
    //: the section and not one mark over a design that solved two
    if ($('usex').checked) {
      handles.push({ r: +$('xr').value, z: +$('xz').value, kind: 'x',
                     key: 'x' });
      if (classSides().length > 1)
        handles.push({ r: +$('xr2').value, z: +$('xz2').value, kind: 'x',
                       key: 'x2' });
    }
    lastHandles = handles;
    S.cross(state, {
      //: this page can switch to the whole-device frame, so the view is its
      //: own choice rather than the component's cached one
      view: $('wide').checked ? FyPlot.deviceView(M) : null,
      coilLabel: coilLabel, coilFill: coilFill, handles: handles,
      target: flat,
      reference: $('showref').checked ? referenceLcfs : null,
      xpoint: state && state.bndKind === 1 ? [state.xptR, state.xptZ] : null,
    });
    // the key lives outside the figure: in the wide device view there is no
    // spot inside the frame that does not cover a coil-current label
    $('cross-legend').innerHTML = FyPlot.legendHTML(legendItems());
    drawCurrentScale();
    drawShapeTable(t);
    drawScalars();
    drawCriteria();
    drawCtlNote();
    drawProfiles();
  }

  /** p' and FF' of the analytic profile the solve ran on. */
  function drawProfiles() {
    var col = FyPlot.palette($('pprime'));
    var pr = state && state.profiles;
    function panel(id, key, ylabel) {
      var s = pr ? [{ x: pr.x, y: pr[key], color: col.lcfs }]
                 : [{ x: [0, 1], y: [0, 0], color: col.grid }];
      FyPlot.xy($(id), { series: s, xlabel: 'ψ̄', ylabel: ylabel,
                         zeroLine: true, xmin: 0, xmax: 1 });
    }
    panel('pprime', 'pprime', "p′ [Pa/(Wb/rad)]");
    panel('ffprime', 'ffprime', "FF′");
  }

  //: ★The tolerance is PER DIMENSION.  One absolute 0.03 across the table
  //: judged metres and pure numbers by the same yardstick: on a 6 m machine
  //: 3 cm on R0 is tighter than any anneal will reach, while 0.03 on delta
  //: is loose enough to pass a shape nobody asked for.  Lengths are judged
  //: against the minor radius, which is the length this problem has.
  var SHAPE_TOL_REL = 0.03, SHAPE_TOL_ABS = 0.03;

  /** The tolerance a row is judged against, in that row's own units. */
  function shapeTol(isLength, a) {
    return isLength ? SHAPE_TOL_REL * a : SHAPE_TOL_ABS;
  }

  /**
   * The normalised shape error, in the SAME form the worker's anneal
   * minimises — so the number in the status line and the deviations in this
   * table cannot tell different stories.
   */
  function shapeErrorOf(sm, t) {
    if (!sm) return null;
    return Math.sqrt((Math.pow((sm.r0 - t.r0) / t.a, 2)
                    + Math.pow((sm.z0 - t.z0) / t.a, 2)
                    + Math.pow((sm.a - t.a) / t.a, 2)
                    + Math.pow((sm.kappa - t.kappa) / t.kappa, 2)
                    + Math.pow(sm.deltaU - t.deltaU, 2)
                    + Math.pow(sm.deltaL - t.deltaL, 2)) / 6);
  }

  //: ★Z0 is a CONTROL of this bar and was missing from the comparison:
  //: the achieved axis height sat in the scalar table with nothing to
  //: compare it to, and a solve whose axis had drifted 0.9 m off the
  //: requested midplane showed five green-ish rows and no red one.
  function shapeRows(t) {
    return [['R₀ [m]', t.r0, state && state.shape.r0, 3, true],
            ['Z₀ [m]', t.z0, state && state.shape.z0, 3, true],
            ['a [m]', t.a, state && state.shape.a, 3, true],
            ['κ', t.kappa, state && state.shape.kappa, 3, false],
            [T('design.row.du'), t.deltaU,
             state && state.shape.deltaU, 3, false],
            [T('design.row.dl'), t.deltaL,
             state && state.shape.deltaL, 3, false]]
      //: ★T-D7: the rows real shape control targets, judged by the same
      //: per-dimension tolerance as everything else in this table.  A design
      //: asked for a gap and handed another has not reached what it was
      //: asked for, and 「达到目标」 says so.
      .concat(controlShapeRows());
  }

  /**
   * Is every row of 「目标 vs 实现」 inside its own tolerance?
   *
   * ★The same per-dimension test the table paints with, asked once instead
   * of read off six coloured cells.  It is what a FORWARD solve can be
   * judged by — a design run has the anneal's own error and is judged by
   * that, and the two agree because both tolerances are `shapeTol`'s.
   */
  function shapeRowsWithin() {
    if (!state || !state.shape) return null;
    var t = readTarget();
    return shapeRows(t).every(function (r) {
      var got = r[2];
      return got !== null && got !== undefined
             && Math.abs(got - r[1]) <= shapeTol(r[4], t.a);
    });
  }

  function drawShapeTable(t) {
    var rows = shapeRows(t);
    $('shape').innerHTML = rows.map(function (r) {
      var got = r[2], d = got === null || got === undefined ? null : got - r[1];
      var tol = shapeTol(r[4], t.a);
      var cls = d === null ? '' : (Math.abs(d) <= tol ? 'good' : 'bad');
      return '<tr><td>' + r[0] + '</td><td class="num">' + r[1].toFixed(r[3]) +
        '</td><td class="num">' + (got == null ? '—' : got.toFixed(r[3])) +
        '</td><td class="num ' + cls + '">' +
        (d === null ? '—' : (d >= 0 ? '+' : '') + d.toFixed(r[3])) + '</td></tr>';
    }).join('');
  }

  // --- T-D6: THE BOUNDARY CLASS IS AN INPUT --------------------------------
  //
  // ★Until now this page could set δu/δl and, separately, tick a field-null
  // constraint at two numbers — and it could READ 「限制器 / 偏滤器」 off the
  // answer.  What it could not do was ASK for a class.  The two halves of a
  // single null (a shape, and a null on that shape's own flux surface) were
  // two unrelated controls, and nothing on the page said they belonged
  // together or judged whether the class that came back was the one wanted.
  //
  // So the class is now the control, and it owns the X-point row:
  //
  //   限制器  no field null is asked for at all — the X row is off and the
  //           checkbox is disabled.  ★THIS IS TODAY'S PAGE, unchanged: the
  //           message the worker gets carries `xWeight = 0`, exactly as it
  //           did when the box was simply unticked, so a reader who never
  //           touches this control gets the answer they got yesterday.
  //   下/上单零  one null, on the boundary's own flux surface.  Where it goes
  //           is the DEVICE's business first: a descriptor that declares a
  //           seed (`fylite:ui` xr/xz) keeps it, because a number the machine
  //           file states is not this page's to invent.  Only a machine that
  //           declares none falls back to the target's own corner,
  //           (R₀ − δ·a, Z₀ ∓ κ·a) — the point the requested shape already
  //           puts there.
  //   双零    ★T-D18: SELECTABLE.  It used to be offered and disabled,
  //           naming `fylite_rs_start_currents` — whose signature took
  //           exactly one null (`xR`, `xZ`, `useX`) — as the reason.  The
  //           kernel entry the start design goes through now takes a SET
  //           (`fylite_rs_start_currents_multi`), and the anneal takes the
  //           same set, so 双零 asks for two nulls: one above the requested
  //           axis and one below, each with its own three rows, and each
  //           with its own pair of fields on the page.  A divertor with two
  //           X points lands FOUR legs, and the strike criterion says so.
  //
  // ★AND THE CLASS IS THEN JUDGED.  Asking for a divertor and being handed a
  // limiter is a design that did not reach what it was asked for, and it now
  // says so — in the criteria table, on the strike-point block, and in the
  // bar's own verdict.  Asking for 限制器 is NOT the mirror of that: this
  // page has no way to require a limiter of a linear isoflux design, it can
  // only decline to ask for a null, so that row reports 未要求 rather than a
  // verdict it did not earn.
  //: ★T-D18: a class asks for a SET of nulls, listed by the side of the
  //: requested axis each one sits on.  It was one signed number because the
  //: kernel took one null; it is a list because the kernel takes a list.
  var CLASS_X = { lsn: [-1], usn: [1], dn: [-1, 1] };

  /** The class the reader asked for. */
  function boundaryClass() {
    var e = $('class');
    return e ? e.value : 'limiter';
  }
  /** The sides the asked-for class puts its nulls on. */
  function classSides() { return CLASS_X[boundaryClass()] || []; }
  /** Does the asked-for class require a field null? */
  function wantsX() { return classSides().length > 0; }

  /**
   * The field nulls this page is asking for, in the order the class lists
   * them: the first pair of fields, then — under 双零 — the second.
   */
  function xNulls() {
    var sides = classSides();
    if (!sides.length) return [];
    var out = [{ r: +$('xr').value, z: +$('xz').value }];
    if (sides.length > 1)
      out.push({ r: +$('xr2').value, z: +$('xz2').value });
    return out;
  }

  /** How many of the requested nulls sit above / below the requested axis. */
  function nullSplit() {
    var z0 = +$('z0').value, above = 0, below = 0;
    xNulls().forEach(function (p) {
      if (p.z > z0) above++; else if (p.z < z0) below++;
    });
    return { above: above, below: below, n: above + below };
  }

  /**
   * Where this machine's single null goes, the first time the class asks for
   * one: the descriptor's declared seed if there is one, otherwise the
   * target's own corner.  `sign` is −1 for a lower null, +1 for an upper.
   */
  function xSeed(sign) {
    var ui = (M.ui || {});
    if (ui.xr && ui.xz && isFinite(+ui.xr.value) && isFinite(+ui.xz.value))
      return { r: +ui.xr.value, z: sign * Math.abs(+ui.xz.value) };
    var t = readTarget();
    return { r: t.r0 - (sign < 0 ? t.deltaL : t.deltaU) * t.a,
             z: t.z0 + sign * t.kappa * t.a };
  }

  /**
   * Put the X-point row where the class says, and take the checkbox out of
   * the reader's hands: with a class control on the page the box is no
   * longer an independent question, it is the class's own state.
   */
  function applyClass(seed) {
    var sides = classSides();
    var box = $('usex');
    box.checked = sides.length > 0;
    box.disabled = true;
    //: ★T-D18: the second pair of fields exists only when a second null is
    //: being asked for.  Two X-point rows on screen over a design that
    //: solved one would be the same lie the disabled menu item avoided.
    var row2 = $('x2row');
    if (row2) row2.hidden = sides.length < 2;
    if (sides.length && seed) {
      var p = xSeed(sides[0]);
      setNum('xr', p.r);
      setNum('xz', p.z);
      if (sides.length > 1) {
        var q = xSeed(sides[1]);
        setNum('xr2', q.r);
        setNum('xz2', q.z);
      }
    }
  }

  /** What the solved field gave: 'diverted' or 'limiter'. */
  function classGot() {
    if (!state) return null;
    return state.bndKind === 1 ? 'diverted' : 'limiter';
  }

  /**
   * Was the class that was ASKED FOR the class that came back?
   * `null` when nothing was asked (限制器) or nothing has been solved.
   */
  function classMet() {
    if (!wantsX() || !state) return null;
    return classGot() === 'diverted';
  }

  /**
   * Are the nulls where the class says they are?  Under 双零 that is one
   * above the requested axis and one below — two nulls dragged onto the
   * same side are two nulls, and are not a double null.
   */
  function nullsAsAsked() {
    var sides = classSides(), sp = nullSplit();
    if (!sides.length) return null;
    var wantAbove = sides.filter(function (v) { return v > 0; }).length;
    return sp.above === wantAbove && sp.below === sides.length - wantAbove;
  }

  /**
   * How many strike points a divertor of this class must land.
   *
   * ★T-D18: TWO PER NULL.  A single null sends two legs out of itself; a
   * double null has an X point above and below and therefore four.  The
   * number used to be the constant 2 because one null was all that could be
   * asked for.
   */
  function legsWanted() { return 2 * classSides().length; }


  // --- T-D7: GAPS AND STRIKE POINTS BECOME TARGETS -------------------------
  //
  // ★What this page could do with a gap: print it.  「最小壁间隙 0.062 m」 sat
  // in the criteria table as a reading, and the one thing a shape-control
  // engineer actually asks for — ROG / RIG, the upper and lower gaps, and
  // where the legs land — could not be written as a row of the inverse
  // solve.  Same for the strike points: reported since T-D6, targetable by
  // nothing.
  //
  // Both are now rows, and they are the SAME row: an isoflux row at a point
  // the WALL defines.
  //
  //   间隙   a ray out of the requested axis (outward / inward / up / down —
  //          the operational definition ROG and RIG already use), and a
  //          distance measured back from where that ray meets the wall.  The
  //          control point does not move while the solve runs, which is what
  //          lets one response block serve every pass of the anneal.
  //   打击点  a point ON the wall (the kernel snaps the request to the wall
  //          segment and says which one and by how much it moved), asked to
  //          be on the boundary's own flux surface.
  //
  // ★They go into BOTH sides of the inverse solve — the linear start
  // (`fylite_rs_start_currents_multi`) and the anneal — because a target the
  // start reaches and the anneal then walks away from is not a target.
  var CTL_DIRS = { out: [1, 0], in: [-1, 0], up: [0, 1], down: [0, -1] };
  var ctlRows = [];

  /** What one row is called, in the reader's language. */
  function ctlLabel(row) {
    return row.kind === 'strike'
      ? T('design.ctl.strike_at', { r: (+row.r).toFixed(2),
                                    z: (+row.z).toFixed(2) })
      : T('design.ctl.gap_on', { dir: T('design.ctl.dir.' + row.dir) });
  }

  /**
   * The rows as the worker takes them: a gap is a ray out of the REQUESTED
   * axis, so it moves with R₀ / Z₀ rather than being frozen at the moment
   * the row was added.
   */
  function ctlMessage() {
    var t = readTarget();
    return ctlRows.map(function (row) {
      if (row.kind === 'strike')
        return { kind: 'strike', r: +row.r, z: +row.z, w: +row.w,
                 label: ctlLabel(row) };
      var d = CTL_DIRS[row.dir] || CTL_DIRS.out;
      return { kind: 'gap', r0: t.r0, z0: t.z0, dr: d[0], dz: d[1],
               value: +row.value, w: +row.w, label: ctlLabel(row) };
    });
  }

  /** A new row, seeded where the reader can see what it does. */
  function seedCtl(kind) {
    if (kind === 'strike') {
      var w = M.limiter, k = 0;
      //: the lowest wall vertex — where a lower divertor leg lands on every
      //: machine that has one, and a place the reader will recognise
      for (var i = 1; i < w.z.length; i++) if (w.z[i] < w.z[k]) k = i;
      return { kind: 'strike', r: +w.r[k].toFixed(3), z: +w.z[k].toFixed(3),
               w: 1 };
    }
    //: the gap this machine currently has on that ray, rounded — a row that
    //: arrives asking for what is already there changes nothing until the
    //: reader moves it, which is the honest default for a new constraint
    var got = state && state.criteria && state.criteria.gap
      ? state.criteria.gap.gap : 0.08;
    return { kind: 'gap', dir: 'out', value: +(+got).toFixed(3), w: 1 };
  }

  function drawCtlRows() {
    var host = $('ctlrows');
    if (!host) return;
    if (!ctlRows.length) {
      host.innerHTML = '<p class="note">' + T('design.ctl.none') + '</p>';
    } else {
      host.innerHTML = ctlRows.map(function (row, i) {
        var id = 'discharge-ctl' + i + '-';
        var fld = function (k, lab, step, val) {
          return '<label><span>' + lab + '</span><input type="number" ' +
            'class="kfcell" step="' + step + '" id="' + id + k +
            '" data-ctl="' + i + '" data-ctlk="' + k + '" value="' +
            val + '"></label>';
        };
        var body = row.kind === 'strike'
          ? fld('pr', 'R [m]', '0.01', (+row.r).toFixed(3)) +
            fld('pz', 'Z [m]', '0.01', (+row.z).toFixed(3))
          : '<label><span>' + T('design.ctl.dir') + '</span>' +
            '<select class="kfcell" id="' + id + 'dir" data-ctl="' + i +
            '" data-ctlk="dir">' +
            ['out', 'in', 'up', 'down'].map(function (d) {
              return '<option value="' + d + '"' +
                (row.dir === d ? ' selected' : '') + '>' +
                T('design.ctl.dir.' + d) + '</option>';
            }).join('') + '</select></label>' +
            fld('val', T('design.ctl.value'), '0.005',
                (+row.value).toFixed(3));
        return '<div class="kfitem"><div class="kfhead">' +
          '<strong>' + T('design.ctl.kind.' + row.kind) + '</strong>' +
          '<button type="button" class="ghost kfdel" data-ctldel="' + i +
          '">' + T('pulse.key.del') + '</button></div>' +
          '<div class="kffields">' + body +
          fld('wt', T('design.ctl.weight'), '0.5', (+row.w).toFixed(1)) +
          '</div></div>';
      }).join('');
      var bind = function (e) {
        e.addEventListener('input', function () {
          var row = ctlRows[+e.dataset.ctl];
          if (!row) return;
          var k = e.dataset.ctlk;
          if (k === 'dir') row.dir = e.value;
          else if (k === 'pr') row.r = +e.value;
          else if (k === 'pz') row.z = +e.value;
          else if (k === 'wt') row.w = +e.value;
          else row.value = +e.value;
          drawCtlNote();
          draw();
        });
        e.addEventListener('change', function () {
          var row = ctlRows[+e.dataset.ctl];
          if (row && e.dataset.ctlk === 'dir') { row.dir = e.value; draw(); }
        });
      };
      Array.prototype.forEach.call(
        host.querySelectorAll('.kfcell'), bind);
      Array.prototype.forEach.call(
        host.querySelectorAll('button.kfdel'), function (b) {
          b.addEventListener('click', function () {
            ctlRows.splice(+b.dataset.ctldel, 1);
            drawCtlRows();
            draw();
          });
        });
    }
    drawCtlNote();
  }

  /**
   * How many rows are in play, and — after a solve — how many of them the
   * wall could answer at all.  ★A row whose ray misses the wall is REPORTED,
   * not dropped: the same rule the limits column keeps.
   */
  function drawCtlNote() {
    var e = $('ctl-note');
    if (!e) return;
    var got = (state && state.criteria && state.criteria.control) || [];
    var bad = got.filter(function (c) { return !c.ok; }).length;
    e.innerHTML = !ctlRows.length ? ''
      : (bad ? T('design.ctl.unusable', { n: bad, m: ctlRows.length })
             : T('design.ctl.count', { n: ctlRows.length }));
  }

  /**
   * The control rows as 「目标 vs 实现」 rows.
   *
   * ★Read the target off the page and the achievement off the ANSWER: the
   * gap is measured by the same kernel call on the same ray that named it,
   * and a strike row is judged by how far the nearest landing is from the
   * wall point it asked for — zero when the leg went where it was sent.
   */
  function controlShapeRows() {
    var got = (state && state.criteria && state.criteria.control) || [];
    return ctlRows.map(function (row, i) {
      var g = got[i] && got[i].ok ? got[i] : null;
      return [ctlLabel(row), row.kind === 'strike' ? 0 : +row.value,
              g && isFinite(g.got) ? g.got : null, 3, true];
    });
  }

  // --- the configuration criteria ------------------------------------------
  //
  // ★What a design is JUDGED by, as opposed to what it was asked for.  The
  // numbers arrive with the solve (the worker owns every one of them); this
  // code decides what to show and, for each row, what published or physical
  // thing it is being read against.  A row with nothing to read it against
  // says so rather than being dressed in a verdict.

  //: |I_fb| this large says the equilibrium is being held up by the virtual
  //: vertical feedback rather than by the coils that were designed.  Not a
  //: physical threshold — a reporting one, and stated as such.
  var FB_WARN = 0.3;
  //: a boundary closer than this to the wall is not a clearance any more
  var GAP_WARN = 0.03;

  function drawCriteria() {
    var body = $('criteria'), sb = $('strike');
    if (!state || !state.criteria) {
      body.innerHTML = ''; sb.innerHTML = ''; return;
    }
    var c = state.criteria;
    var num = function (v, n) { return v === null || v === undefined
      || !isFinite(v) ? '—' : v.toFixed(n); };
    //: ★T-D6: the class that was ASKED FOR, above the class that came back.
    //: The two used to be one row reading only the second — a page that can
    //: report a topology but cannot be held to one.
    var met = classMet();
    var rows = [
      [T('design.row.class'), T('design.class.' + boundaryClass()),
       met === null ? critMark('design.mark.class_free')
         : critMark(met ? 'design.mark.class_ok' : 'design.mark.class_miss',
                    met ? 'good' : 'bad')],
      //: ★T-D18: the field-null ROWS this design carries, split by the side
      //: of the requested axis they sit on.  「双零」 is a claim about where
      //: the nulls are, not about how many numbers were typed, so the row
      //: that judges it counts sides.
      [T('design.row.nulls'), nullSplit().above + ' / ' + nullSplit().below,
       !wantsX() ? critMark('design.mark.class_free')
         : critMark(nullsAsAsked() ? 'design.mark.nulls_ok'
                                   : 'design.mark.nulls_miss',
                    nullsAsAsked() ? 'good' : 'bad')],
      [T('design.row.bndkind'),
       T(state.bndKind === 1 ? 'design.bnd.xpoint' : 'design.bnd.limiter'),
       critMark(state.bndKind === 1 ? 'design.mark.diverted'
                                 : 'design.mark.limited')],
      //: ★T-D6: the strike points are a CRITERION now.  A single null lands
      //: two legs on the wall; a design that claims one and lands none has
      //: not made a divertor, whatever the shape table says.
      [T('design.row.legs'), String(c.strike.length),
       !wantsX() ? critMark('design.mark.class_free')
         : critMark(c.strike.length >= legsWanted()
                      ? 'design.mark.legs_ok' : 'design.mark.legs_miss',
                    c.strike.length >= legsWanted() ? 'good' : 'bad')],
      [T('design.row.q95'), num(c.q95, 3),
       c.q95 === null ? critMark('design.mark.none')
         : critMark(c.q95 > 2 ? 'design.mark.q_ok' : 'design.mark.q_low',
                 c.q95 > 2 ? 'good' : 'bad')],
      [T('design.row.q0'), num(c.q0, 3), ''],
      [T('design.row.li3'), num(c.li3, 3), ''],
      [T('design.row.fbratio'), num(c.fbRatio, 3),
       c.fbRatio === null ? critMark('design.mark.none')
         : critMark(c.fbRatio > FB_WARN ? 'design.mark.fb_warn'
                                     : 'design.mark.fb_ok',
                 c.fbRatio > FB_WARN ? 'bad' : 'good')],
      [T('design.row.gap'), c.gap ? num(c.gap.gap, 3) : '—',
       !c.gap ? critMark('design.mark.none')
         : critMark(c.gap.gap < GAP_WARN ? 'design.mark.gap_warn'
                                      : 'design.mark.gap_ok',
                 c.gap.gap < GAP_WARN ? 'bad' : 'good')],
      [T('design.row.nx'), String(c.xpts.length), ''],
    ];
    //: ★the n = 0 vertical mode, when the machine description carries the
    //: passive structure it needs.  Elongation is the control this bar
    //: offers most freely and vertical instability is what it buys, so a
    //: design that cannot say the cost is only half an answer.
    if (c.vertical) {
      var V = c.vertical;
      rows.push([T('design.row.gamma'), num(V.gamma, 1),
                 critMark(V.gamma > 0 ? 'design.mark.unstable'
                                   : 'design.mark.stable',
                       V.gamma > 0 ? '' : 'good')]);
      rows.push([T('design.row.kratio'), num(V.ratio, 3),
                 V.ratio === null ? critMark('design.mark.none')
                   : critMark(V.ratio >= 1 ? 'design.mark.ideal'
                                        : 'design.mark.rwm',
                           V.ratio >= 1 ? 'bad' : 'good')]);
    } else {
      rows.push([T('design.row.gamma'), '—', critMark('design.mark.novessel')]);
    }
    body.innerHTML = rows.map(function (r) {
      return '<tr><td>' + r[0] + '</td><td class="num">' + r[1] +
             '</td><td>' + r[2] + '</td></tr>';
    }).join('');
    sb.innerHTML = c.strike.length
      ? c.strike.map(function (p, i) {
          return '<tr><td>' + (i + 1) + '</td><td class="num">' +
                 p[0].toFixed(3) + ', ' + p[1].toFixed(3) + '</td></tr>';
        }).join('')
      : '<tr><td colspan="2" class="note">' + T('design.mark.none') +
        '</td></tr>';
    //: ★T-D6: what the declared class asked of these points, said here
    //: rather than left for the reader to count
    var v = $('strike-verdict');
    if (v) {
      var m2 = classMet();
      v.className = 'note' + (m2 === false || (wantsX()
        && c.strike.length < legsWanted()) ? ' verdict bad' : '');
      v.innerHTML = wantsX()
        ? T(m2 && c.strike.length >= legsWanted()
              ? 'design.legs.ok' : 'design.legs.miss',
            { cls: T('design.class.' + boundaryClass()),
              want: legsWanted(), got: c.strike.length,
              got_cls: T(state.bndKind === 1 ? 'design.bnd.xpoint'
                                             : 'design.bnd.limiter') })
        : T('design.legs.free');
    }
  }


  function drawScalars() {
    if (!state) { $('scalars').innerHTML = ''; return; }
    var rows = [
      [T('design.row.axis'), state.axisR.toFixed(3) + ', ' + state.axisZ.toFixed(3)],
      [T('design.row.psi'), state.psiAxis.toFixed(3) + ' / ' + state.psiBnd.toFixed(3)],
      [T('design.row.span'), ((state.psiAxis - state.psiBnd) / (2 * Math.PI)).toFixed(4)],
      [T('design.row.ip'), (state.ip / 1e3).toFixed(1)],
      [T('design.row.bndkind'),
       T(state.bndKind === 1 ? 'design.bnd.xpoint' : 'design.bnd.limiter')],
      [T('design.row.fb'), (state.fbAmp / 1e3).toFixed(1)],
      [T('design.row.iter'), state.iterations + ' / ' + state.residual.toExponential(2)],
    ];
    $('scalars').innerHTML = rows.map(function (r) {
      return '<tr><td>' + r[0] + '</td><td class="num">' + r[1] + '</td></tr>';
    }).join('');
  }

  function drawHistory(history) {
    var x = [], y = [];
    history.forEach(function (h) {
      if (h.err == null || !isFinite(h.err)) return;
      x.push(h.pass); y.push(h.err);
    });
    FyPlot.xy($('hist'), {
      series: [{ x: x, y: y, color: FyPlot.palette($('hist')).accent,
                 kind: 'line' },
               { x: x, y: y, color: FyPlot.palette($('hist')).accent,
                 kind: 'dots', radius: 3 }],
      xlabel: T('design.hist.x'), ylabel: T('design.hist.y'), ymin: 0,
    });
  }

  function drawCurrents(before, after) {
    var col = FyPlot.palette($('curr'));
    var x = [];
    for (var i = 0; i < after.length; i++) x.push(i + 1);
    var s = [{ x: x, y: Array.from(after, function (v) { return v / 1e3; }),
               color: col.accent, kind: 'bars', label: T('design.curr.after') }];
    if (before) s.unshift({ x: x, y: Array.from(before, function (v) { return v / 1e3; }),
                            color: col.muted, kind: 'bars', label: T('design.curr.before') });
    FyPlot.xy($('curr'), { series: s, xlabel: T('design.curr.x'), ylabel: T('design.curr.y'),
                           zeroLine: true });
  }

  function legendItems() {
    var col = FyPlot.palette($('cross'));
    var items = [
      { label: T('design.leg.lcfs'), color: col.lcfs, kind: 'line', width: 2 },
      { label: T('design.leg.target'), color: col.accent, kind: 'line', dash: [4, 4] },
    ];
    if ($('showref').checked && referenceLcfs)
      items.push({ label: T('design.leg.ref'), color: col.alt, kind: 'line',
                   dash: [5, 3] });
    items.push(

      { label: T('design.leg.axis'), color: col.fg, kind: 'plus' },
      { label: T('design.leg.opoint'), color: col.accent, kind: 'plus' });
    if ($('usex').checked)
      items.push({ label: T('design.leg.xpoint'), color: col.accent, kind: 'x' });
    return items;
  }

  /**
   * Per-element label: the current of the PCS channel that drives it.
   * Elements ganged onto one channel therefore repeat its value, which is
   * what the hardware does.
   */
  var elemChannel = null;
  function channelOf(k) {
    if (!elemChannel) {
      elemChannel = new Array(M.coils.length).fill(-1);
      M.channels.forEach(function (combo, c) {
        combo.forEach(function (pair) { elemChannel[pair[0]] = c; });
      });
    }
    return elemChannel[k];
  }

  /** The element's name, drawn centred on it. */
  function coilLabel(k) { return M.coils[k].name; }

  /** Current of the element, i.e. of the channel that drives it [kA-turns]. */
  function coilCurrent(k) {
    var c = channelOf(k);
    return c < 0 || !coilInputs[c] ? 0 : +coilInputs[c].value;
  }

  function maxAbsCurrent() {
    var m = 0;
    for (var k = 0; k < M.coils.length; k++)
      m = Math.max(m, Math.abs(coilCurrent(k)));
    return m > 0 ? m : 1;
  }

  /**
   * Fill for an element: hue from the sign, opacity from |I| relative to
   * the largest current in the set.  The figure carries sign and relative
   * magnitude only — the numbers stay in the table below.
   */
  function coilFill(k) {
    var col = FyPlot.palette($('cross'));
    var v = coilCurrent(k), t = Math.abs(v) / maxAbsCurrent();
    return { color: v < 0 ? col.accent : col.lcfs,
             alpha: 0.12 + 0.88 * Math.min(1, t) };
  }

  function drawCurrentScale() {
    var col = FyPlot.palette($('cross'));
    FyPlot.currentScale($('cscale'), {
      posColor: col.lcfs, negColor: col.accent,
      max: maxAbsCurrent().toFixed(0), unit: T('design.scale.unit'),
    });
  }

  // --- dragging the target O point and the X point on the cross-section -----

  var lastHandles = [], dragging = null;
  var cross = $('cross');

  function pointerRZ(ev) {
    var v = cross.__fyView;
    if (!v) return null;
    var b = cross.getBoundingClientRect();
    return { r: v.rOf(ev.clientX - b.left), z: v.zOf(ev.clientY - b.top),
             view: v };
  }

  /** Which handle is under the pointer, within a ~12 px grab radius. */
  function hitHandle(ev) {
    var v = cross.__fyView;
    if (!v) return null;
    var b = cross.getBoundingClientRect();
    var px = ev.clientX - b.left, py = ev.clientY - b.top, best = null, bd = 12;
    lastHandles.forEach(function (h) {
      var d = Math.hypot(v.X(h.r) - px, v.Y(h.z) - py);
      if (d < bd) { bd = d; best = h; }
    });
    return best;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** Write a value into a numeric field, honouring its own min/max. */
  function setNum(id, v) {
    var el = $(id);
    var lo = el.min === '' ? -Infinity : +el.min;
    var hi = el.max === '' ? Infinity : +el.max;
    el.value = clamp(v, lo, hi).toFixed(3);
  }

  function applyDrag(ev) {
    var pos = pointerRZ(ev);
    if (!pos) return;
    if (dragging.key === 'o') {
      // this handle IS the O-point control: it carries both coordinates
      setNum('r0', pos.r); setNum('z0', pos.z);
    } else if (dragging.key === 'x2') {
      setNum('xr2', pos.r); setNum('xz2', pos.z);
    } else {
      setNum('xr', pos.r); setNum('xz', pos.z);
    }
    draw();
  }

  cross.addEventListener('pointerdown', function (ev) {
    var h = hitHandle(ev);
    if (!h) return;
    dragging = h;
    cross.setPointerCapture(ev.pointerId);
    ev.preventDefault();
    applyDrag(ev);
  });
  cross.addEventListener('pointermove', function (ev) {
    if (dragging) { applyDrag(ev); return; }
    cross.style.cursor = hitHandle(ev) ? 'move' : '';
  });
  ['pointerup', 'pointercancel'].forEach(function (t) {
    cross.addEventListener(t, function (ev) {
      if (!dragging) return;
      dragging = null;
      try { cross.releasePointerCapture(ev.pointerId); } catch (e) { /* gone */ }
    });
  });

  // --- worker plumbing ------------------------------------------------------

  var beforeCurrents = null;

  function onReady(m) {
    //: ★the kernel being ready is not a request to compute.  This page used
    //: to solve the reference discharge on load; now it waits for the button
    //: like every other page — loading and asking are two different acts.
    //: ★the marker stays 未运行.  The kernel handshake is the PAGE's news,
    //: not this bar's result — reported through the same slot, because the
    //: reader is looking there, but it must not make a bar that has never
    //: been asked for anything read 已完成.
    setBusy(false, T('status.kernel_ready', { coils: m.timing.coils }),
            '', 'idle');
  }

  function onError(m) {
    setBusy(false, T('design.fail', { why: m.message }), 'err');
  }

  function onProgress(m) {
    S.progress(m.pass / m.total);
    $('status').textContent = T('design.anneal_step', {
      pass: m.pass, total: m.total,
      err: isFinite(m.err) ? m.err.toFixed(4) : '—' });
  }

  function onSolve(m) {
    state = m.result;
    //: only a real shot gives a reference boundary.  Keeping the first
    //: solve of a machine WITHOUT one would draw the zero-current result
    //: and label it "reference discharge", which is simply false.
    if (!referenceLcfs && FyDevice.hasReference(M)) referenceLcfs = m.result.lcfs;
    setCurrents(m.chan);
    draw();
    //: a FORWARD solve was not aimed at the target, so what it achieved
    //: against it is read off the deviation table rather than off an anneal
    //: that did not run
    //: ★T-D6: a design that was asked for a divertor and handed a limiter has
    //: not reached what it was asked for, whatever the shape rows say.  This
    //: can only fire when a null WAS asked for — 限制器 leaves every line
    //: below exactly as it was.
    var cmiss = classMet() === false;
    outcome = { from: 'solve', reached: shapeRowsWithin() && !cmiss,
                err: null, tol: null, classMet: classMet() };
    //: ★T-M16 — the verdict word is the KERNEL's three-way answer, not a
    //: caller-side residual comparison: 达标 / 稳态（掩膜量化抖动地板）/
    //: 用尽轮数.  A settled answer is a steady-state READING and says so.
    var verdict = m.result.converged ? T('design.verdict.converged')
      : m.result.settled
        ? T('design.verdict.settled',
            { md: m.result.maskDelta === undefined || !isFinite(m.result.maskDelta)
                ? '?' : m.result.maskDelta })
        : T('design.verdict.capped');
    setBusy(false, T('design.solved', { verdict: verdict,
            iter: m.result.iterations,
            res: m.result.residual.toExponential(2) })
            + (cmiss ? T('design.class_tail', {
                cls: T('design.class.' + boundaryClass()) }) : ''),
            cmiss ? 'warn' : '', cmiss ? 'miss' : undefined);
    S.progress(0);
    handed();
  }

  function onDesign(m) {
    state = m.result;
    setCurrents(m.chan);
    draw();
    lastHistory = m.history;
    drawHistory(m.history);
    drawCurrents(beforeCurrents, m.chan);
    var failed = m.history.filter(function (h) { return h.error; });
    var err = m.history.filter(function (h) { return h.pass === m.pass; })[0].err;
    var tail = failed.length
      ? T('design.diverged', { pass: failed[0].pass }) : '';
    S.progress(1);
    //: ★T-D6, as in `onSolve`: the class that was asked for is part of what
    //:「达到目标」 means.  `classMet()` is `null` under 限制器, so this term
    //: cannot change a single limiter design.
    var cmiss = classMet() === false;
    if (cmiss) tail += T('design.class_tail', {
      cls: T('design.class.' + boundaryClass()) });
    outcome = { from: 'design', err: err, tol: shapeErrorTol(),
                classMet: classMet(),
                reached: m.pass !== 0 && err <= shapeErrorTol() && !cmiss };
    if (m.pass === 0) {
      // saying only "pass 0" reads like success; the figure is then
      // the STARTING configuration and looks like it never redrew
      //: ★the strip gets a SHORT verdict, the status line the explanation.
      //: An empty strip reads "not run", which is what this bar said after a
      //: run that finished and missed — the one wording a design tool must
      //: not use for a result it did produce.
      setBusy(false, T('design.state_none', { err: err.toFixed(4) }), 'warn');
      $('status').innerHTML = T('design.done_none', {
        n: m.history.length - 1, err: err.toFixed(4), tail: tail });
    } else if (err > shapeErrorTol()) {
      //: ★"finished" is not "reached".  This bar used to report a design
      //: that missed its target by half a metre in the same words it uses
      //: for one that landed on it — measured across the bundled devices,
      //: three of four ended 0.36-0.77 m out under a status line reading
      //: "inverse solve finished".  The gate is the same normalised error
      //: the anneal minimises, against the same per-dimension tolerance
      //: the deviation table marks with.
      setBusy(false, T('design.state_far', { err: err.toFixed(4) }), 'warn');
      $('status').innerHTML = T('design.done_far', {
        pass: m.pass, err: err.toFixed(4),
        tol: shapeErrorTol().toFixed(4), tail: tail });
    } else if (cmiss) {
      //: the shape landed and the topology did not — a distinct outcome from
      //: both 「达到」 and 「差得远」, and it gets its own marker
      setBusy(false, T('design.state_class'), 'warn', 'miss');
      $('status').innerHTML = T('design.done', { pass: m.pass, tail: tail,
              err: err.toFixed(4) });
    } else {
      setBusy(false, T('design.done', { pass: m.pass, tail: tail,
              err: err.toFixed(4) }));
    }
    handed();
  }

  /**
   * ★WHAT THIS BAR HANDS DOWNSTREAM (T-D4 / T-D2).
   *
   * Published as a BUILDER, like every other product on these pages: it is
   * read at the moment it is taken, so a control moved after the solve
   * cannot quietly change what a downstream bar believes was solved.  And
   * it carries the SOLVED boundary, not the target controls — the pulse bar
   * used to read the controls, so it designed a power supply for a shape
   * this machine had just failed to make (measured: not running this bar at
   * all and pressing the pulse key gave bit-identical currents and volts).
   */
  function product() {
    if (!state || !state.shape) return null;
    var sh = state.shape;
    return {
      shape: { r0: sh.r0, z0: sh.z0, a: sh.a, kappa: sh.kappa,
               deltaU: sh.deltaU, deltaL: sh.deltaL },
      target: readTarget(),
      ip: state.ip, prof: readProf(),
      xpoint: $('usex').checked
        ? { r: +$('xr').value, z: +$('xz').value } : null,
      //: ★T-D18 / T-D7: what was ASKED of the topology and of the wall
      //: travels with the answer, so a downstream bar quoting this
      //: configuration quotes the whole request
      xpoints: xNulls(), control: ctlMessage(),
      nulls: nullSplit(), legsWanted: legsWanted(), start: lastStart,
      criteria: state.criteria, bndKind: state.bndKind,
      //: ★T-D6: what was ASKED of the topology travels with the answer —
      //: the pulse bar sizes supplies for this configuration and inherits
      //: its verdict (T-D4)
      boundaryClass: boundaryClass(), classMet: classMet(),
      strike: state.criteria ? state.criteria.strike.length : null,
      chan: Array.from(readCurrents()),
      reached: outcome ? outcome.reached : null,
      err: outcome ? outcome.err : null,
      tol: outcome ? outcome.tol : null,
      from: outcome ? outcome.from : null,
    };
  }
  S.publish(product);

  /**
   * ★A solve on THIS bar changes what two other bars may say.
   *
   * The 0-D bar's q95 comparison and the pulse bar's 「待…」 badge both read
   * this bar's product, and neither of them is running when it arrives.  The
   * page's own repaint is the hook that already exists for "something the
   * other panels quote has changed"; nothing here knows who is listening.
   */
  function handed() { S.refresh(); }

  /**
   * The shape error a design has to be inside to count as having reached
   * its target.
   *
   * Derived from the SAME per-dimension tolerances the deviation table
   * marks with, rather than being a second number: a run whose every row is
   * marked good and whose status line says it failed would be telling the
   * reader two things at once.  Each of the five terms is at its own
   * tolerance, so the RMS of the normalised terms is that value.
   */
  function shapeErrorTol() {
    var kap = Math.max(+$('kappa').value, 1e-6);
    var k = SHAPE_TOL_ABS / kap;      // the kappa term is normalised by kappa
    return Math.sqrt((3 * SHAPE_TOL_REL * SHAPE_TOL_REL + k * k
                      + 2 * SHAPE_TOL_ABS * SHAPE_TOL_ABS) / 6);
  }

  function resetToReference() {
    var start = FyDevice.hasReference(M)
      ? M.reference.aturns : new Array(M.channels.length).fill(0);
    setBusy(true, FyDevice.hasReference(M)
      ? T('design.solving_ref', { device: M.name, shot: M.reference.shot })
      : T('design.solving_zero'));
    referenceLcfs = null;
    setCurrents(start);
    S.send({ cmd: 'solve', chan: Array.from(start),
                         prof: readProf(), ip: readIp(),
                         control: ctlMessage() });
  }

  // --- file exchange ----------------------------------------------------------

  //: ★T-D6 adds `class` and keeps `usex`/`xr`/`xz`: the file format is a
  //: contract with sessions already on disk, and those carry the checkbox.
  //: A file written before this control existed has no `class` key, and the
  //: import below derives one from `usex` rather than leaving the page in a
  //: state the file never described.
  var CONTROLS = ['class', 'r0', 'z0', 'a', 'kappa', 'du', 'dl',
                  'usex', 'xr', 'xz', 'xr2', 'xz2',
                  'ip', 'profsrc', 'beta0', 'emp', 'enp', 'gamma', 'passes',
                  'startmode', 'icap', 'wide', 'showref'];

  function stamp() {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  function jsonDoc() {
    var cfg = FySession.collect(CONTROLS, S.scope);
    cfg['fylite:pf_channel_current'] = Array.from(readCurrents());
    //: ★T-D7: the shape-control rows are控件 state like the (时刻, 位形)
    //: rows of the pulse bar, and travel the same way — written AS TYPED,
    //: not through `FySession.sig`, so a row that asks for 0.0625 m comes
    //: back asking for 0.0625 m
    cfg['fylite:shape_control'] = ctlRows.map(function (r) {
      return r.kind === 'strike'
        ? { kind: 'strike', r: +r.r, z: +r.z, w: +r.w }
        : { kind: 'gap', dir: r.dir, value: +r.value, w: +r.w };
    });
    var doc = FySession.envelope('discharge', cfg, S.kernel());
    if (state) {
      doc['fylite:result'] = {
        equilibrium: FySession.equilibrium(M.grid, state, state.profiles,
                                           state.q),
        pf_active: FySession.pfActive(M, readCurrents()),
        'fylite:shape': state.shape,
        'fylite:boundary_kind': state.bndKind === 1 ? 'x_point' : 'limiter',
        'fylite:feedback_current': state.fbAmp,
        'fylite:iterations': state.iterations,
        'fylite:residual': state.residual,
      };
      if (lastHistory) doc['fylite:result']['fylite:anneal_history'] = lastHistory;
    }
    return doc;
  }

  //: ★HANDING THE RESULT TO THE NEXT SCENARIO, without a round trip through
  //: the file picker.  What travels is the SAME document the export menu
  //: writes — the g-file if a design has been solved, otherwise the 0-D bar's
  //: operating point — so there is one format, one meaning, and the file path
  //: stays available for everything the browser cannot carry.
  //:
  //: The button belongs to the PAGE (it is in the toolbar), so it is bound
  //: here once and asks each bar in turn what it has.
  function handOver() {
    var el = document.getElementById('design-handoff');
    if (!el) return;
    el.addEventListener('click', function () {
      var g = FORMATS.gfile.build();
      var rec = null;
      if (typeof g === 'string')
        rec = { kind: 'gfile', from: 'design', bar: 'discharge',
                name: FORMATS.gfile.filename, text: g };
      else if (self.FyZerodDeck) rec = self.FyZerodDeck();
      if (!rec) return S.report(T('handoff.nothing'), 'warn');
      var why = FyHandoff.put(rec);
      if (why) return S.report(T(why), 'warn');
      S.report(T('handoff.gave', { what: T('handoff.kind.' + rec.kind) }));
    });
  }

  var FORMATS = {
    gfile: {
      text: true,
      label: T('io.label.gfile'), filename: 'g_fylite_design.00000',
      accept: '.00000,.geqdsk,g*,text/plain',
      exportHint: T('design.g.export_hint'),
      importHint: T('design.g.import_hint'),
      build: function () {
        var args = FyIO.gfileArgs(M, state, state && state.profiles,
                                  state && state.q,
                                  'fylite design ' + stamp());
        if (!args) return { error: T('design.g.none') };
        return FyGeqdsk.format(args);
      },
      apply: function (text, name) {
        var g = FyGeqdsk.parse(text);
        var sm = FyGeqdsk.boundaryShape(g);
        if (!sm) throw new Error(T('design.g.nobnd'));
        setNum('r0', sm.r0);
        setNum('z0', 0.5 * (sm.zmin + sm.zmax));
        setRange('a', sm.a);
        setRange('kappa', sm.kappa);
        setRange('du', sm.deltaU);
        setRange('dl', sm.deltaL);
        setRange('ip', Math.abs(g.current) / 1e3);
        syncLabels();
        draw();
        return T('design.g.imported', {
          name: name, r0: sm.r0.toFixed(3), a: sm.a.toFixed(3),
          kappa: sm.kappa.toFixed(2),
          ip: (Math.abs(g.current) / 1e3).toFixed(1) });
      },
    },
    json: {
      docPage: 'discharge',
      label: T('io.label.json'), filename: 'fylite_design_session.json',
      accept: '.json,application/json',
      exportHint: T('design.j.export_hint'),
      importHint: T('design.j.import_hint'),
      build: function () { return JSON.stringify(jsonDoc(), null, 1); },
      apply: function (text, name) {
        var doc = FySession.parse(text);
        if (doc['fylite:page'] !== 'discharge')
          throw new Error(T('msg.wrong_page', { page: doc['fylite:page'] }));
        var cfg = doc['fylite:config'];
        var r = FySession.apply(cfg, S.scope);
        var pf = cfg['fylite:pf_channel_current'];
        if (pf && pf.length === M.channels.length) setCurrents(pf);
        //: ★T-D6: a session written before the class control existed says
        //: what it asked for in the old vocabulary — a ticked box and a Z.
        //: Read it in that vocabulary rather than leaving the class at
        //: whatever the page happened to show.
        if (cfg['class'] === undefined)
          $('class').value = !cfg.usex ? 'limiter'
            : (+cfg.xz < (+cfg.z0 || 0) ? 'lsn' : 'usn');
        applyClass(false);
        //: ★T-D7, and the pulse bar's rule for its own rows: a file that
        //: carries no rows section is not a file asking for no rows — the
        //: rows on the page are left alone.  A file that carries the section
        //: replaces them, empty list included.
        if (Array.isArray(cfg['fylite:shape_control'])) {
          ctlRows = cfg['fylite:shape_control'].map(function (r) {
            return r.kind === 'strike'
              ? { kind: 'strike', r: +r.r, z: +r.z,
                  w: r.w === undefined ? 1 : +r.w }
              : { kind: 'gap', dir: r.dir || 'out', value: +r.value,
                  w: r.w === undefined ? 1 : +r.w };
          });
          drawCtlRows();
        }
        syncLabels();
        // the stored result is NOT adopted: it came from one kernel build,
        // and re-solving here is both cheap and honest
        state = null;
        draw();
        //: ★`setBusy` FIRST, and not for the spinner: two bars on this page
        //: claim the worker's `solve` reply, and the dispatcher hands it to
        //: whichever bar is active — with none active it goes to the first
        //: claimant, which is the 0-D bar, whose `last` is null on a page
        //: where only this bar has run.  Measured: importing a design session
        //: threw `Cannot read properties of null (reading 'in')` and the
        //: re-solve this import promises never happened.
        setBusy(true, T('design.solving'));
        S.send({ cmd: 'solve', chan: Array.from(readCurrents()),
                             prof: readProf(), ip: readIp(),
                             control: ctlMessage() });
        return T('design.j.imported', {
          name: name, n: r.applied.length,
          skipped: r.skipped.length
                   ? T('msg.skipped', { n: r.skipped.length }) : '' });
      },
    },
    device: FyIO.deviceFormat(M),
  };
  var io = S.formats(FORMATS);
  handOver();
  //: the file buttons were locked with the run buttons before this
  //: layer existed; keep them locked while a solve is in flight

  /** Write into a range input, clamped to its own bounds. */
  function setRange(id, v) {
    var el = $(id);
    el.value = clamp(v, +el.min, +el.max);
  }

  // --- events ---------------------------------------------------------------

  SLIDERS.forEach(function (k) {
    $(k).addEventListener('input', function () { syncLabels(); draw(); });
  });

  function run() {
    if (S.isBusy()) return;
    var n = +$('passes').value;
    // stiff -> loose: the first passes stay near the starting scenario,
    // the last ones are free enough to reach the target
    var sched = [];
    for (var i = 0; i < n; i++)
      sched.push(0.10 * Math.pow(0.005 / 0.10, i / Math.max(1, n - 1)));
    annealSchedule = sched;
    //: ★the anneal is a LOCAL method, so what it starts from is part of the
    //: run rather than a separate button.  With no reference discharge the
    //: only state this page could offer was zero current — which is not a
    //: machine state with a plasma in it, and the three bundled devices
    //: without a reference shot ended 0.36-0.77 m from their targets while
    //: reporting the same "finished" a converged run reports.
    if (startMode() === 'start'
        || (startMode() === 'auto' && !FyDevice.hasReference(M))) {
      pendingAnneal = true;
      sendStart();
      return S.settle('design');
    }
    sendDesign(readCurrents());
    return S.settle('design');
  }

  /** Which state this bar's anneal is to begin from. */
  function startMode() { return $('startmode').value; }

  /** The per-channel current bound, in ampere-turns, or null. */
  function currentCap() {
    var v = +$('icap').value * 1e3;
    if (!(v > 0)) return null;
    return new Array(M.channels.length).fill(v);
  }

  var annealSchedule = null, pendingAnneal = false, lastStart = null;

  function sendStart() {
    setBusy(true, T('design.starting'));
    $('progress').style.width = '0';
    S.send({
      cmd: 'start', target: readTarget(), ip: readIp(), nPoints: 24,
      xWeight: $('usex').checked ? 1.0 : 0,
      //: ★T-D18: the nulls travel as a SET.  `xpoint` stays beside it for
      //: the one reader that still takes a single null — the pulse bar's
      //: waypoints — so nothing downstream has to learn a second spelling
      //: to keep doing what it did.
      xpoint: { r: +$('xr').value, z: +$('xz').value },
      xpoints: xNulls(), control: ctlMessage(),
      iMax: currentCap(), nRing: 4, peaking: 1, lambda: 1e-3,
    });
  }

  function sendDesign(chan, warm) {
    beforeCurrents = Float64Array.from(chan);
    setBusy(true, T('design.annealing'));
    $('progress').style.width = '0';
    S.send({
      cmd: 'design', chan: Array.from(beforeCurrents),
      target: readTarget(), prof: readProf(), ip: readIp(),
      schedule: annealSchedule, gamma: +$('gamma').value, nPoints: 24,
      //: ★says this anneal begins at a DESIGNED state, which is what
      //: entitles its first solve to the design's own field and to the
      //: anchors that keep the column there while it settles
      warm: !!warm,
      xWeight: $('usex').checked ? 1.0 : 0,
      xpoint: { r: +$('xr').value, z: +$('xz').value },
      xpoints: xNulls(), control: ctlMessage(),
      solve: { maxIter: 600, relax: 0.3 },
    });
  }

  /**
   * A start came back.  It is NOT a result: no equilibrium has been solved,
   * so nothing is drawn from it except the coil currents themselves — what
   * it reports is how well the request could be met at all, which is worth
   * seeing before an anneal is paid for.
   */
  function onStart(m) {
    setCurrents(m.chan);
    //: ★T-D18 / T-D7: what the START achieved PER NULL and PER control row.
    //: A double null that held one and abandoned the other, or a gap row the
    //: linear design never got near, is visible here — before an anneal is
    //: paid for, which is the whole reason this command reports at all.
    lastStart = { nulls: m.nulls || [], ctlDpsi: m.ctlDpsi || [],
                  ctlRows: m.ctlRows || [], psiRms: m.psiRms };
    draw();
    var msg = T('design.started', {
      rms: m.psiRms.toExponential(2), n: m.bind.length,
      x: m.bX === null || m.bX === undefined ? ''
         : T('design.started_x', { b: m.bX.toExponential(2) }) });
    if (pendingAnneal) {
      pendingAnneal = false;
      $('status').innerHTML = msg;
      sendDesign(m.chan, true);
      return;
    }
    setBusy(false, '');
    $('status').innerHTML = msg;
    S.progress(0);
  }
  // --- the worked cases ----------------------------------------------------
  //
  // ★This bar does NOT re-run on a case: one inverse solve is eight annealing
  // passes of free-boundary solving (measured 10–15 s on ITER), which is what
  // 「算例只设定，不开算」 is for.
  //
  // ★★ITS CONTROLS ARE NAMED `discharge-*`, and that is not a naming slip:
  // `discharge` is this page's PART id, and a part's prefix is its own id
  // (`scenario.js`, `addPart`: `pp = partId + '-'`).  So the resolver's chain
  // — bar `design-discharge-<id>`, then part `discharge-<id>`, then page
  // `design-<id>` — reaches them, and a case writes them like any other.
  // ★This was briefly written up as a defect (T-C10) because a GATE resolved
  // ids without the middle step.  The gate was wrong, not the page.
  S.cases({ when: FyDesignReady.promise, after: function () { syncLabels(); } });

  S.onRun(run);
  //: ★the footnote names the machine, so this page asks for its own key; the
  //: page shows one footnote and the last part to ask wins

  $('icap').addEventListener('change', markCurrents);
  $('solve').addEventListener('click', function () {
    if (S.isBusy()) return;
    setBusy(true, T('design.solving'));
    S.send({ cmd: 'solve', chan: Array.from(readCurrents()),
                         prof: readProf(), ip: readIp(),
                         control: ctlMessage() });
  });
  $('reset').addEventListener('click', function () { if (!S.isBusy()) resetToReference(); });
  ['wide', 'showref'].forEach(function (id) {
    $(id).addEventListener('change', draw);
  });
  OPOINT.concat(['usex', 'xr', 'xz', 'xr2', 'xz2']).forEach(function (id) {
    $(id).addEventListener('input', draw);
    $(id).addEventListener('change', draw);
  });

  // Resize, theme change and language change all mean the same thing here:
  // the canvases have to be drawn again, and the text that names the device
  // sits outside the DOM sweep FyI18n does on its own.
  S.onRefresh(function () {
    draw();
    //: the shape-control rows carry translated labels and a translated
    //: direction menu, and they are built by this file rather than swept by
    //: `FyI18n` — so a language change has to rebuild them
    drawCtlRows();
    if (lastHistory) drawHistory(lastHistory);
    if (state) drawCurrents(beforeCurrents, readCurrents());
  });

  //: ★T-D7: the rows are added, edited and deleted like the pulse bar's
  //: (时刻, 位形) rows, and for the same reason — a constraint set is a list,
  //: and a list is not a slider.
  ['gap', 'strike'].forEach(function (k) {
    var b = $('ctladd-' + k);
    if (!b) return;
    b.addEventListener('click', function () {
      ctlRows.push(seedCtl(k));
      drawCtlRows();
      draw();
    });
  });
  drawCtlRows();

  //: ★T-D6: the class owns the X-point row, so picking one places the null
  //: and redraws.  `applyClass(true)` re-seeds; the reader can still move
  //: the X afterwards (by hand or by dragging the × on the section), and
  //: switching class is the only thing that puts it back.
  $('class').addEventListener('change', function () {
    applyClass(true);
    syncLabels();
    draw();
  });

  buildCoilTable();
  // control bounds come from the machine, not from the markup
  //: the markup's defaults belong to no machine — take the device's own
  FyDevice.applyRanges(M, { setValues: true, scope: S.scope });
  //: the checkbox is the class's state from here on — never the reader's
  applyClass(false);
  if (!FyDevice.hasReference(M)) {
    $('showref').checked = false;
    $('showref').disabled = true;
    S.disable('reset');
  }
  syncLabels();
  setCurrents(FyDevice.hasReference(M) ? M.reference.aturns
              : new Array(M.channels.length).fill(0));
  S.refresh();
  // The device notice gets its own line rather than the status line: the
  // kernel handshake lands milliseconds later and would wipe it out before
  // anyone read why the page had just reloaded.
});

// ==========================================================================
// 功能栏  pulse — 脉冲轨迹（前馈）
// ==========================================================================
//
// ★WHAT THIS BAR IS FOR, and what it deliberately is not.  The two bars
// above answer static questions: what operating point, and can the coils
// hold one shape.  A machine is not run at a point, it is run through a
// pulse — and the question a control engineer actually has is what each
// supply must deliver, in amperes and in volts, from breakdown to the end
// of the ramp-down.  That question was unanswerable on this page: the
// per-slice cross-section scaled the reference coil currents by Ip(t),
// which is the only rule available without a feed-forward design, and said
// so in a code comment nobody reading the page could see.
//
// The chain is three links, and each is the kernel's:
//
//   waypoint -> coil currents   linear isoflux design (`start_currents`)
//   currents -> voltages        the exact inverse of the circuit integrator
//   currents -> configuration   a free-boundary solve, at the waypoints
//                               asked for, reporting what was OBTAINED
//
// The third link is the one that keeps the first honest, and it is opt-in
// with its cost stated, because it is the only link that costs seconds.
FyScenario.whenDevices(function () {
  'use strict';

  var M = self.FYLITE_MACHINE;
  var T = FyI18n.t;
  var last = null;
  //: what the design bar handed over for the run being shown — kept so the
  //: verdict below can say whose 位形 this trajectory was designed for
  var src = null;

  var S = DESIGN.bar('pulse', {
    title: 'nav.pulse',
    folded: true,
    //: ★T-D4: THIS BAR HAS AN UPSTREAM, and until now it did not say so.
    //: It read the design bar's target CONTROLS — measured: not running the
    //: design bar at all and pressing this key gave bit-identical currents
    //: and volts — so the supplies were sized for a shape the machine had
    //: just failed to make (位形误差 0.0479 against a tolerance of 0.0284).
    //: The catalogue has carried the sentence saying what to do first since
    //: this bar was written; nothing referenced it, because nothing declared
    //: the dependency it describes.
    needs: ['discharge'],
    needsNote: 'pulse.needs',
    sliders: { npts: 0, a0: 2, nverify: 0 },
    on: { error: onError, progress: onProgress, pulse: onPulse },
  });
  var $ = S.$, syncLabels = S.sync, setBusy = S.setBusy;

  /** The phase boundaries this bar walks. */
  function phases() {
    return { t_breakdown: +$('tbd').value,
             t_rampup_end: +$('tramp').value,
             t_flattop_end: +$('tflat').value,
             t_end: +$('tend').value };
  }

  // --- T-D15: THE WAYPOINT GRID IS REFINED BY PHASE -------------------------
  //
  // ★Measured before this change, on EAST with the controls at their
  // defaults: 21 waypoints spread evenly over 0–10 s land every 0.5 s, which
  // puts exactly ONE of them inside the 1 s ramp — while 15 sit on the flat
  // top, where the design does not move at all.  The ramp is the segment with
  // the largest dI/dt, and the per-channel voltage this bar exists to report
  // is a difference quotient ACROSS consecutive waypoints: the one place the
  // answer is large was the one place it was resolved by a single sample.
  // It is also why T-D8's stratification could not populate all four strata
  // at default settings — 「击穿后」 borrows the earliest waypoint that has a
  // plasma, and with one ramp point there is nothing left for 「斜坡」.
  //
  // So the grid EQUIDISTRIBUTES ARC LENGTH of the trajectory in the
  // normalised (t/T, f) plane, where f is the phase fraction the shape and
  // the current are interpolated on — 0 → 1 across the ramp, flat at 1, then
  // 1 → 0 on the way down.  A phase in which the design does not move earns
  // points for its duration alone; a phase that traverses the whole swing
  // earns them for the swing as well.  Every live phase gets at least
  // `MIN_PER_PHASE`: a phase resolved by fewer than three points has no
  // interior difference in it at all.
  //
  // The single waypoint at breakdown stays exactly one.  It carries Ip = 0 by
  // construction — there is no plasma to design for there — and it is the
  // state the circuit integrator starts from; a second point at zero current
  // resolves nothing.
  var MIN_PER_PHASE = 3;

  /**
   * The three live phases, and which of their ends they own.
   *
   * ★The phase boundaries are grid points, because they are the corners of
   * the trapezoid and a difference quotient taken across a corner is neither
   * of the two slopes it joins.  The flat top owns both of its ends; the ramp
   * therefore owns neither, and the ramp-down owns only `t_end`.  So the
   * counts `allocate` hands out are exactly what `phaseIndex` then assigns —
   * nothing lands in a phase it was not allocated to.
   */
  function segments(ph) {
    return [
      { a: ph.t_breakdown, b: ph.t_rampup_end, df: 1, mode: 'open' },
      { a: ph.t_rampup_end, b: ph.t_flattop_end, df: 0, mode: 'closed' },
      { a: ph.t_flattop_end, b: ph.t_end, df: 1, mode: 'upper' },
    ].filter(function (s) { return s.b - s.a > 1e-9; });
  }

  /**
   * How many waypoints each live phase gets out of `budget` of them.
   *
   * The floor is applied first and never taken back; the remainder is settled
   * one point at a time, to wherever it buys the most arc length — which is
   * what rounding the raw shares cannot do exactly.
   */
  function allocate(ph, budget) {
    var segs = segments(ph);
    if (!segs.length) return { segs: segs, m: [] };
    var span = Math.max(ph.t_end - ph.t_breakdown, 1e-9);
    var floor = Math.min(MIN_PER_PHASE, Math.floor(budget / segs.length));
    var w = segs.map(function (s) {
      var dt = (s.b - s.a) / span;
      return Math.sqrt(dt * dt + s.df * s.df);
    });
    var W = w.reduce(function (p, q) { return p + q; }, 0);
    var m = w.map(function (wi) {
      return Math.max(floor, Math.round(budget * wi / W));
    });
    var sum = function () {
      return m.reduce(function (p, q) { return p + q; }, 0);
    };
    var guard = 0, i;
    while (sum() > budget && guard++ < 1000) {
      //: take from whichever phase is the most finely resolved per unit of
      //: arc length, and never below the floor
      var j = -1, dense = -Infinity;
      for (i = 0; i < m.length; i++) {
        if (m[i] <= floor) continue;
        if (m[i] / w[i] > dense) { dense = m[i] / w[i]; j = i; }
      }
      if (j < 0) break;
      m[j]--;
    }
    while (sum() < budget && guard++ < 1000) {
      var k = 0, gain = -Infinity;
      for (i = 0; i < m.length; i++)
        if (w[i] / (m[i] + 1) > gain) { gain = w[i] / (m[i] + 1); k = i; }
      m[k]++;
    }
    return { segs: segs, m: m };
  }

  /**
   * The waypoint times: one at breakdown, then each live phase on its own
   * refinement.
   *
   * `extra` are the instants the reader pinned a target at (T-D13).  They are
   * INSERTED rather than snapped onto: a shape asked for at an instant has to
   * be asked for at that instant and not at the nearest gridpoint to it.
   */
  function gridTimes(ph, n, extra) {
    var al = allocate(ph, Math.max(3, n - 1));
    var t = [ph.t_breakdown];
    al.segs.forEach(function (s, i) {
      var m = al.m[i], q;
      if (m <= 0) return;
      if (s.mode === 'closed') {
        if (m === 1) { t.push(s.a); return; }
        for (q = 0; q < m; q++) t.push(s.a + (s.b - s.a) * q / (m - 1));
      } else if (s.mode === 'upper') {
        for (q = 1; q <= m; q++) t.push(s.a + (s.b - s.a) * q / m);
      } else {
        for (q = 1; q <= m; q++) t.push(s.a + (s.b - s.a) * q / (m + 1));
      }
    });
    //: a flat top of zero length still has a corner, and it is the only
    //: instant at which the flat-top target is the target
    if (!(ph.t_flattop_end - ph.t_rampup_end > 1e-9)) t.push(ph.t_rampup_end);
    (extra || []).forEach(function (x) { t.push(x); });
    t.sort(function (x, y) { return x - y; });
    var out = [];
    t.forEach(function (x) {
      if (!isFinite(x)) return;
      if (x < ph.t_breakdown - 1e-9 || x > ph.t_end + 1e-9) return;
      if (out.length && Math.abs(x - out[out.length - 1]) < 1e-9) return;
      out.push(x);
    });
    return out;
  }

  /** How many waypoints each of the four phases holds. */
  function gridSplit(ph, ts) {
    var c = [0, 0, 0, 0];
    ts.forEach(function (x) { c[phaseIndex(ph, x)]++; });
    return c;
  }

  /**
   * The configuration asked for at time `t`.
   *
   * ★The shape is interpolated by PHASE, not by a straight line in time:
   * a discharge grows from a small cross-section into its flat-top shape
   * while the current ramps, holds, and retraces.  The flat-top target is
   * the design bar's own — one target, read where it is set, rather than a
   * second copy of six controls on this bar.
   */
  function targetAt(ph, t, flat, a0frac) {
    var f = 0;
    if (t <= ph.t_breakdown) f = 0;
    else if (t < ph.t_rampup_end)
      f = (t - ph.t_breakdown) /
          Math.max(ph.t_rampup_end - ph.t_breakdown, 1e-9);
    else if (t <= ph.t_flattop_end) f = 1;
    else f = 1 - (t - ph.t_flattop_end) /
                 Math.max(ph.t_end - ph.t_flattop_end, 1e-9);
    f = Math.min(Math.max(f, 0), 1);
    var s = a0frac + (1 - a0frac) * f;
    return { r0: flat.r0, z0: flat.z0, a: flat.a * s,
             kappa: 1 + (flat.kappa - 1) * f,
             deltaU: flat.deltaU * f, deltaL: flat.deltaL * f, frac: f };
  }

  /** The plasma-current waveform — the same trapezoid rule the 0-D bar uses. */
  function ipAt(ph, t, flat) {
    if (t <= ph.t_breakdown) return 0;
    if (t < ph.t_rampup_end)
      return flat * (t - ph.t_breakdown) /
             Math.max(ph.t_rampup_end - ph.t_breakdown, 1e-9);
    if (t <= ph.t_flattop_end) return flat;
    return flat * Math.max(0, 1 - (t - ph.t_flattop_end) /
                              Math.max(ph.t_end - ph.t_flattop_end, 1e-9));
  }

  // --- T-D13: TARGET SHAPES AT SEVERAL INSTANTS -----------------------------
  //
  // ★There was one target shape — the flat top — and this bar scaled it by
  // phase.  Real pulse design does not work that way: the shape is specified
  // at a handful of key instants (a small circular plasma once it is
  // established, the diverted shape at the start of the flat top, whatever
  // the retrace is meant to go through) and the trajectory is what joins
  // them.  T-D15 gives the time grid; this gives the targets ON that grid.
  //
  // The rows are PINNED CORRECTIONS on top of the phase-scaled flat top, not
  // a replacement for it.  Three properties follow, and all three are the
  // reason it is written this way:
  //
  //   * with no rows the shape is `targetAt` and nothing else — today's
  //     answer, bit for bit, which is what a reader who has one target must
  //     keep getting;
  //   * at a row's instant the shape is EXACTLY that row, because the
  //     correction there is exactly the difference;
  //   * between rows the ramp/flat/retrace structure still carries the
  //     shape, so pinning two instants does not oblige the reader to specify
  //     the other nineteen.
  //
  // A row's instant is also inserted into the waypoint grid, so an instant
  // that was asked for is an instant that was designed for.
  var KEYF = [
    { k: 'r0', step: 0.01, d: 3, lab: 'R<sub>0</sub>' },
    { k: 'z0', step: 0.005, d: 3, lab: 'Z<sub>0</sub>' },
    { k: 'a', step: 0.01, d: 3, lab: 'a' },
    { k: 'kappa', step: 0.01, d: 3, lab: 'κ' },
    { k: 'du', step: 0.01, d: 3, lab: 'δ<sub>u</sub>' },
    { k: 'dl', step: 0.01, d: 3, lab: 'δ<sub>l</sub>' },
  ];
  //: the reader's rows, at FULL precision until a cell is edited: a row
  //: seeded from the base and left alone must be a correction of exactly
  //: zero, or「加一行什么都不改」would be false in the fifth digit
  var keys = [];

  /** The flat-top shape this bar designs toward, solved if there is one. */
  function flatShape() {
    var p = S.take('discharge');
    if (p && p.shape) return p.shape;
    //: only before anything has been solved, and only to seed a row the
    //: reader is about to edit — the RUN always takes the solved one
    return { r0: +$('r0').value, a: +$('a').value, z0: +$('z0').value || 0,
             kappa: +$('kappa').value, deltaU: +$('du').value,
             deltaL: +$('dl').value };
  }

  /** The rows that are usable, sorted; plus how many were not. */
  function keyframes(ph) {
    var out = [], dropped = 0;
    keys.forEach(function (k) {
      if (!isFinite(k.t) || k.t <= ph.t_breakdown + 1e-9
          || k.t > ph.t_end + 1e-9) { dropped++; return; }
      if (!(isFinite(k.a) && k.a > 0) || !(isFinite(k.kappa) && k.kappa > 0)
          || !isFinite(k.r0) || !isFinite(k.z0)
          || !isFinite(k.du) || !isFinite(k.dl)) { dropped++; return; }
      out.push(k);
    });
    out.sort(function (x, y) { return x.t - y.t; });
    var uniq = [];
    out.forEach(function (k) {
      if (uniq.length && Math.abs(k.t - uniq[uniq.length - 1].t) < 1e-9) {
        dropped++; return;
      }
      uniq.push(k);
    });
    return { rows: uniq, dropped: dropped };
  }

  var FIELDS = ['r0', 'z0', 'a', 'kappa', 'deltaU', 'deltaL'];

  /**
   * The shape asked for at `t`: the phase-scaled flat top, plus the hat-
   * interpolated correction the reader's rows pin at their own instants.
   */
  function shaperFor(ph, flat, a0, rows) {
    var base = function (t) { return targetAt(ph, t, flat, a0); };
    if (!rows.length) return base;
    var zero = { r0: 0, z0: 0, a: 0, kappa: 0, deltaU: 0, deltaL: 0 };
    var nodes = [{ t: ph.t_breakdown, d: zero }];
    rows.forEach(function (k) {
      var b = base(k.t);
      nodes.push({ t: k.t, d: { r0: k.r0 - b.r0, z0: k.z0 - b.z0,
                                a: k.a - b.a, kappa: k.kappa - b.kappa,
                                deltaU: k.du - b.deltaU,
                                deltaL: k.dl - b.deltaL } });
    });
    nodes.push({ t: ph.t_end, d: zero });
    return function (t) {
      var b = base(t), i;
      for (i = 1; i < nodes.length; i++) if (t <= nodes[i].t + 1e-12) break;
      i = Math.min(i, nodes.length - 1);
      var lo = nodes[i - 1], hi = nodes[i];
      var f = hi.t - lo.t > 1e-12
        ? Math.min(Math.max((t - lo.t) / (hi.t - lo.t), 0), 1) : 1;
      var out = { frac: b.frac };
      FIELDS.forEach(function (n) {
        out[n] = b[n] + lo.d[n] + f * (hi.d[n] - lo.d[n]);
      });
      return out;
    };
  }

  function run() {
    var ph = phases(), n = +$('npts').value;
    //: ★T-D16: the import's sentence compares the file against the
    //: configuration the page held AT THAT MOMENT.  A run may be standing on
    //: another one, so the sentence goes rather than becoming a claim about
    //: a comparison nobody made again.
    sayImported('');
    //: ★THE FLAT-TOP SHAPE IS THE ONE THAT WAS SOLVED, not the one that was
    //: asked for.  `needs` guarantees there is one; taking it here rather
    //: than reading the controls is what makes this bar's answer about the
    //: machine instead of about the sliders.
    src = S.take('discharge');
    if (!src) {
      setBusy(false, T('pulse.needs'), 'warn', 'idle');
      return;
    }
    var flat = src.shape;
    var ipFlat = src.ip;
    var a0 = +$('a0').value;
    var kf = keyframes(ph);
    var ts = gridTimes(ph, n, kf.rows.map(function (k) { return k.t; }));
    var shapeAt = shaperFor(ph, flat, a0, kf.rows);
    var wps = [], atKey = {};
    ts.forEach(function (t, i) {
      //: ★T-D18: the whole SET of nulls the configuration bar asked for
      //: travels to every waypoint, so a double-null flat top is designed
      //: as a double null all the way along rather than as a single one
      wps.push({ t: t, target: shapeAt(t), ip: ipAt(ph, t, ipFlat),
                 xpoint: src.xpoint, xpoints: src.xpoints || null });
      if (kf.rows.some(function (k) { return Math.abs(k.t - t) < 1e-9; }))
        atKey[i] = true;
    });
    lastGrid = { ph: ph, t: ts, split: gridSplit(ph, ts), atKey: atKey };
    var nv = +$('nverify').value;
    var verify = verifyIndices(wps, ph, nv, atKey);
    setBusy(true, T('pulse.running', { n: ts.length }));
    $('progress').style.width = '0';
    S.send({
      cmd: 'pulse', waypoints: wps, nPoints: 24,
      xWeight: src.xpoint ? 1.0 : 0,
      iMax: capOf(), verify: verify, prof: src.prof,
      solve: { maxIter: 600, relax: 0.3 },
      etaVessel: M.vessel_resistivity_uohm_m
        ? M.vessel_resistivity_uohm_m * 1e-6 : undefined,
    });
    return S.settle('pulse');
  }

  //: the grid the run being shown was built on — the tables label the phase
  //: and the pinned instants from it, and it is what this bar publishes
  var lastGrid = null;

  /**
   * What this bar produces.  Nothing on this page consumes it yet; it is
   * published because the trajectory — the instants, the target at each of
   * them, and which of them were verified — is the answer, and a gate that
   * had to read it off a rendered table would be reading the page's prose.
   */
  S.publish(function () {
    if (!last || !lastGrid) return null;
    return {
      t: lastGrid.t.slice(),
      phases: lastGrid.ph,
      split: lastGrid.split.slice(),
      phase: lastGrid.t.map(function (x) {
        return phaseIndex(lastGrid.ph, x); }),
      pinned: lastGrid.t.map(function (x, i) { return !!lastGrid.atKey[i]; }),
      checks: last.checks.map(function (c) {
        return { t: c.t, stratum: vStratum[c.k] === undefined
                   ? phaseIndex(lastGrid.ph, c.t) : vStratum[c.k],
                 target: c.target || null,
                 shape: c.shape || null, error: c.error || null };
      }),
      nch: last.nch,
      //: ★T-D16: the per-channel demand at FULL precision.  The table beside
      //: it rounds to a tenth of a kA·turn, and a round trip that claims to
      //: reproduce a trajectory EXACTLY has to be checkable at more digits
      //: than the display carries — otherwise 「逐位相同」 is a statement
      //: about the formatter.
      demand: demand(),
    };
  });

  /** |I|max and |V|max per channel, unrounded. */
  function demand() {
    var out = [], c, k;
    for (c = 0; c < last.nch; c++) {
      var im = 0, vm = 0;
      for (k = 0; k < last.t.length; k++) {
        im = Math.max(im, Math.abs(last.x[k * last.nch + c]));
        vm = Math.max(vm, Math.abs(last.v[k * last.nch + c]));
      }
      out.push({ i: im, v: vm });
    }
    return out;
  }

  /**
   * WHICH WAYPOINTS TO VERIFY — one per phase before any phase gets two.
   *
   * ★T-D8.  They used to be spaced evenly on [0, T], and on the default
   * pulse that put both of them inside the flat-top: t = 2.50 and 7.50 s
   * with the flat-top running 1.0–8.0 s, two waypoints whose configuration
   * was IDENTICAL.  The forward solve is the only thing on this bar that
   * says what was actually obtained, and it was spending its whole budget
   * confirming the easiest instant of the pulse twice.  The hard ones —
   * just after breakdown, mid-ramp, the retrace — were never verified at
   * all.
   *
   * So the waypoints are STRATIFIED by the phase structure this bar already
   * walks, and the picks go round the strata before any stratum gets a
   * second.  The breakdown stratum is the one exception worth naming: the
   * breakdown instant carries Ip = 0 by construction and there is no
   * equilibrium there to solve, so its representative is the EARLIEST
   * waypoint that has a plasma — which is the instant the shape is smallest
   * and the coils are furthest from their flat-top set.
   */
  //: ★THE FOUR STRATA, in the order the pulse walks them.  「击穿后」 is not
  //: `z.ph.breakdown`: the breakdown instant itself carries Ip = 0 by
  //: construction, there is no equilibrium there to solve, and its stand-in
  //: is the EARLIEST waypoint that has a plasma — the instant the shape is
  //: smallest and the coils are furthest from their flat-top set, which is
  //: the moment this verification was least covering and most needed at.
  var VPHASE_KEYS = ['pulse.ph.postbd', 'z.ph.rampup', 'z.ph.flattop',
                     'z.ph.rampdown'];

  /** Which phase interval a time falls in, as an index into VPHASE_KEYS. */
  function phaseIndex(ph, t) {
    if (t <= ph.t_breakdown) return 0;
    if (t < ph.t_rampup_end) return 1;
    if (t <= ph.t_flattop_end) return 2;
    return 3;
  }

  //: which stratum each verified waypoint was drawn from, so the table can
  //: label 「击穿后」 as what it is rather than as the ramp it sits in
  var vStratum = {};

  function verifyIndices(wps, ph, nv, atKey) {
    vStratum = {};
    atKey = atKey || {};
    if (!(nv > 0)) return [];
    var strata = [[], [], [], []];
    wps.forEach(function (w, k) {
      //: nothing to solve where there is no plasma
      if (!(w.ip > 0)) return;
      strata[phaseIndex(ph, w.t)].push(k);
    });
    if (!strata[0].length && strata[1].length)
      strata[0] = [strata[1].shift()];
    var live = [];
    strata.forEach(function (g, j) { if (g.length) live.push({ j: j, g: g }); });
    if (!live.length) return [];
    //: ★round robin, SKIPPING what is already exhausted: one point in every
    //: phase before any phase gets a second, and a phase with fewer
    //: waypoints than turns hands the rest back rather than verifying the
    //: same instant twice
    var want = live.map(function () { return 0; });
    var left = nv, guard = 0;
    while (left > 0 && guard++ < 4 * nv + 8) {
      var moved = false;
      for (var j = 0; j < live.length && left > 0; j++) {
        if (want[j] >= live[j].g.length) continue;
        want[j]++; left--; moved = true;
      }
      if (!moved) break;                //: every stratum is full
    }
    var out = [];
    live.forEach(function (L, j) {
      var m = want[j];
      //: ★T-D13: an instant the reader PINNED a target at is the instant
      //: they most want the obtained shape for, so it goes first within its
      //: stratum; the rest are spread evenly over what is left.  With no
      //: pinned instants `pin` is empty, `rest` is the whole stratum and the
      //: formula below is the one T-D8 established, unchanged.
      var pin = L.g.filter(function (k) { return atKey[k]; });
      var rest = L.g.filter(function (k) { return !atKey[k]; });
      var mr = Math.max(0, m - Math.min(pin.length, m));
      for (var q = 0; q < m; q++) {
        var k;
        if (q < pin.length) k = pin[q];
        else if (rest.length)
          k = rest[Math.min(Math.floor((q - pin.length + 0.5) * rest.length / mr),
                            rest.length - 1)];
        else k = L.g[Math.min(q, L.g.length - 1)];
        vStratum[k] = L.j;
        out.push(k);
      }
    });
    return out.filter(function (v, i, a) { return a.indexOf(v) === i; })
              .sort(function (x, y) { return x - y; });
  }

  /** The design bar's channel-current bound, read where it is set. */
  function capOf() {
    var v = +$('icap').value * 1e3;
    return v > 0 ? new Array(M.channels.length).fill(v) : null;
  }

  function onError(m) {
    setBusy(false, T('design.fail', { why: m.message }), 'err');
  }

  function onProgress(m) {
    S.progress(m.pass / m.total);
  }

  function onPulse(m) {
    last = m;
    S.progress(1);
    draw();
    var vmax = 0, over = 0, cap = +$('vcap').value;
    for (var k = 0; k < m.t.length; k++)
      for (var c = 0; c < m.nch; c++)
        vmax = Math.max(vmax, Math.abs(m.v[k * m.nch + c]));
    if (cap > 0) {
      for (c = 0; c < m.nch; c++) {
        var mx = 0;
        for (k = 0; k < m.t.length; k++)
          mx = Math.max(mx, Math.abs(m.v[k * m.nch + c]));
        if (mx > cap) over++;
      }
    }
    //: ★T-D4: the trajectory inherits the verdict of the 位形 it was designed
    //: for.  A power supply sized for a shape this machine failed to make is
    //: not a finished answer, however cleanly the circuit inverse converged.
    var missed = !!(src && src.reached === false);
    //: both caveats ride in the sentence's own tail slot, so the line ends
    //: once rather than ending and then continuing
    var tail = (over ? T('pulse.done_over', { k: over }) : '') +
               (missed ? T('pulse.done_missed') : '');
    setBusy(false, T('pulse.done', {
      n: m.t.length, nv: m.nv, v: vmax.toFixed(1), over: tail }),
      over || missed ? 'warn' : '',
      //: ★a trajectory that asks a supply for more than the supply was
      //: DECLARED to give has not met what it was asked for — 已完成 over a
      //: line reading 「3 路通道超出所声明的限值」 would be the marker
      //: contradicting the sentence beside it.
      over || missed ? 'miss' : 'done');
  }

  /** Whose 位形 this trajectory was designed for, and how it did. */
  function drawSource() {
    var el = $('source');
    if (!el) return;
    if (!last || !src) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    var sh = src.shape;
    var how = src.err !== null && src.err !== undefined
      ? T('pulse.how.anneal', { err: src.err.toFixed(4),
                                tol: src.tol.toFixed(4) })
      : T('pulse.how.rows');
    var key = src.reached === true ? 'pulse.src.reached'
            : (src.reached === false ? 'pulse.src.missed'
                                     : 'pulse.src.unknown');
    el.className = 'note' + (src.reached === false ? ' verdict bad' : '');
    el.innerHTML = T(key, {
      r0: sh.r0.toFixed(3), a: sh.a.toFixed(3), k: sh.kappa.toFixed(3),
      du: sh.deltaU.toFixed(3), dl: sh.deltaL.toFixed(3),
      ip: (src.ip / 1e3).toFixed(1), how: how });
  }

  // --- drawing --------------------------------------------------------------

  function seriesOf(flat, nch, scale) {
    var col = FyPlot.palette($('icur'));
    var out = [];
    for (var c = 0; c < nch; c++) {
      var y = [];
      for (var k = 0; k < last.t.length; k++) y.push(flat[k * nch + c] * scale);
      out.push({ x: last.t, y: y, color: FyPlot.seriesColor(col, c),
                 kind: 'line' });
    }
    return out;
  }

  function draw() {
    if (!last) return;
    FyPlot.xy($('icur'), { series: seriesOf(last.x, last.nch, 1e-3),
                           xlabel: 't [s]', ylabel: 'kA·turn',
                           zeroLine: true });
    FyPlot.xy($('volt'), { series: seriesOf(last.v, last.nch, 1),
                           xlabel: 't [s]', ylabel: 'V/turn',
                           zeroLine: true });
    if (last.nv > 0) {
      FyPlot.xy($('passive'), { series: seriesOf(last.y, last.nv, 1e-3),
                                xlabel: 't [s]', ylabel: 'kA',
                                zeroLine: true });
    } else {
      //: ★an EMPTY plot, and the sentence that says why, in the caption
      //: rather than inside the frame: a figure with no curve and no
      //: explanation reads as a run that failed
      FyPlot.xy($('passive'), { series: [], xlabel: 't [s]', ylabel: 'kA' });
      var cap = $('passive').parentNode.querySelector('figcaption');
      if (cap) cap.innerHTML = T('pulse.novessel');
    }
    var col = FyPlot.palette($('resid'));
    FyPlot.xy($('resid'), {
      series: [{ x: last.t, y: last.designs.map(function (d) { return d.psiRms; }),
                 color: col.accent, kind: 'line' }],
      xlabel: 't [s]', ylabel: 'Wb', ymin: 0 });
    drawChannels();
    drawChecks();
    drawSource();
  }

  /**
   * ★T-D5: WHERE A LIMIT COMES FROM, AND WHAT HAPPENS WHEN THERE IS NONE.
   *
   * Three sources, in this order, and the table says which one it used:
   * the machine's own declaration (`fylite:engineering_limits`, per channel),
   * then the global figure typed into this page, then NOTHING — and nothing
   * is reported as 未知, not as a blank cell and never as a default.  That is
   * `FR-PULSE-004`'s rule for the flux swing, applied where it belongs: a
   * channel judged 「在限内」 against a limit nobody supplied is the one
   * answer this page must not give.
   */
  function capsFor(c) {
    var L = FyDevice.limits(M).channel(c);
    var gi = +$('icap').value, gv = +$('vcap').value;
    return {
      iMax: L.iMax !== null ? L.iMax : (gi > 0 ? gi : null),
      vMax: L.vMax !== null ? L.vMax : (gv > 0 ? gv : null),
      fMax: L.fMax,
      iFrom: L.iMax !== null ? 'dev' : (gi > 0 ? 'page' : null),
      vFrom: L.vMax !== null ? 'dev' : (gv > 0 ? 'page' : null),
    };
  }

  function drawChannels() {
    var rows = [];
    for (var c = 0; c < last.nch; c++) {
      var im = 0, vm = 0;
      for (var k = 0; k < last.t.length; k++) {
        im = Math.max(im, Math.abs(last.x[k * last.nch + c]));
        vm = Math.max(vm, Math.abs(last.v[k * last.nch + c]));
      }
      var L = capsFor(c);
      var unknown = T('pulse.cap.unknown');
      var declared = [
        L.iMax === null ? unknown : L.iMax.toFixed(0) + ' kA·' + T('pulse.turn'),
        L.vMax === null ? unknown : L.vMax.toFixed(0) + ' V/' + T('pulse.turn'),
        L.fMax === null ? unknown : L.fMax.toFixed(0) + ' kN',
      ].join(' · ');
      var overI = L.iMax !== null && im / 1e3 > L.iMax;
      var overV = L.vMax !== null && vm > L.vMax;
      var known = L.iMax !== null || L.vMax !== null;
      //: ★a channel with no declared limit is 未知, not 在限内.  The force
      //: column is 未知 on every machine today for a second reason as well:
      //: this page does not compute coil forces, so even a declared f_max
      //: would have nothing to be read against — and the cell says so rather
      //: than pretending the design cleared it.
      var m = known
        ? '<span class="' + (overI || overV ? 'bad' : 'good') + '">' +
          T(overI || overV ? 'design.over' : 'design.within') + '</span>'
        : '<span class="note">' + unknown + '</span>';
      var el = M.coils[M.channels[c][0][0]];
      rows.push('<tr><td>' + el.name + '</td><td class="num">' +
                (im / 1e3).toFixed(1) + '</td><td class="num">' +
                vm.toFixed(1) + '</td><td class="geo">' + declared +
                '</td><td>' + m + '</td></tr>');
    }
    $('channels').innerHTML = rows.join('');
    var src = FyDevice.limits(M);
    var note = $('limits-src');
    if (note) {
      note.innerHTML = src.declared
        ? T('pulse.cap.from_device', {
            who: M.name,
            prov: src.provenance || T('pulse.cap.noprov') })
        : T('pulse.cap.none', { who: M.name });
    }
  }

  function drawChecks() {
    var body = $('checks');
    if (!last.checks.length) {
      body.innerHTML = '<tr><td colspan="6" class="note">—</td></tr>';
      return;
    }
    //: ★the phase each verified instant belongs to, so the reader can see
    //: at a glance that the budget was not spent twice on the flat-top
    var ph = phases();
    body.innerHTML = last.checks.map(function (c) {
      //: the stratum it was DRAWN FROM, which for the first solvable
      //: waypoint is 「击穿后」 and not the ramp it happens to lie in
      var si = c.k !== undefined && vStratum[c.k] !== undefined
        ? vStratum[c.k] : phaseIndex(ph, c.t);
      var pk = '<td>' + T(VPHASE_KEYS[si]) + '</td>';
      //: ★T-D13: an instant the reader pinned a target at is marked, so the
      //: reader can tell 「你要的这一刻」 from 「这一层的代表」
      var pin = !!(lastGrid && c.k !== undefined && lastGrid.atKey[c.k]);
      var tc = '<td class="num">' + (pin ? '★' : '') + c.t.toFixed(2) + '</td>';
      //: ★T-D13: EACH INSTANT AGAINST ITS OWN TARGET.  There used to be one
      //: target on this page and the column would have repeated it; with
      //: several the comparison is only meaningful per row.
      var g = c.target;
      var tg = '<td class="num">' + (g
        ? g.r0.toFixed(3) + ', ' + g.a.toFixed(3) + ', ' +
          g.kappa.toFixed(3) + ', ' +
          ((g.deltaU + g.deltaL) / 2).toFixed(3)
        : '—') + '</td>';
      if (c.error)
        return '<tr>' + tc + pk + tg + '<td colspan="3">' +
               c.error + '</td></tr>';
      var s = c.shape;
      return '<tr>' + tc + pk + tg +
        '<td class="num">' + s.r0.toFixed(3) + ', ' + s.a.toFixed(3) + ', ' +
        s.kappa.toFixed(3) + ', ' + s.delta.toFixed(3) + '</td>' +
        '<td>' + T(c.bndKind === 1 ? 'design.bnd.xpoint'
                                   : 'design.bnd.limiter') + '</td>' +
        '<td class="num">' + (c.criteria && c.criteria.gap
          ? c.criteria.gap.gap.toFixed(3) : '—') + '</td></tr>';
    }).join('');
  }

  // --- the reader's own rows, and what the grid will look like --------------

  /** Where a new row goes: the middle of whichever phase has none yet. */
  function freeInstant(ph, rows) {
    var used = rows.map(function (k) { return k.t; });
    var free = function (t) {
      return t > ph.t_breakdown + 1e-9 && t <= ph.t_end + 1e-9
        && !used.some(function (u) { return Math.abs(u - t) < 1e-6; });
    };
    var mid = [0.5 * (ph.t_breakdown + ph.t_rampup_end),
               0.5 * (ph.t_rampup_end + ph.t_flattop_end),
               0.5 * (ph.t_flattop_end + ph.t_end)];
    for (var i = 0; i < mid.length; i++) if (free(mid[i])) return mid[i];
    //: every phase already carries one — halve the widest remaining gap
    var edges = [ph.t_breakdown].concat(used.slice()).concat([ph.t_end])
      .sort(function (x, y) { return x - y; });
    var best = 0.5 * (ph.t_breakdown + ph.t_end), wide = -1;
    for (i = 1; i < edges.length; i++)
      if (edges[i] - edges[i - 1] > wide) {
        wide = edges[i] - edges[i - 1];
        best = 0.5 * (edges[i] + edges[i - 1]);
      }
    return best;
  }

  /** A row seeded from the shape the trajectory would have had there. */
  function seedRow() {
    var ph = phases();
    var t = freeInstant(ph, keyframes(ph).rows);
    var b = targetAt(ph, t, flatShape(), +$('a0').value);
    return { t: t, r0: b.r0, z0: b.z0, a: b.a, kappa: b.kappa,
             du: b.deltaU, dl: b.deltaL };
  }

  /**
   * One block per instant, not one wide table row.
   *
   * ★Seven number fields do not fit across a control column that is 286 px
   * wide; a table of them scrolls sideways, and the first thing to scroll out
   * of sight is the key that deletes the row.  So the instant is the heading
   * and the six shape fields sit under it, three to a line.
   */
  function drawKeys() {
    var host = $('keys');
    if (!host) return;
    if (!keys.length) {
      host.innerHTML = '<p class="note">' + T('pulse.key.none') + '</p>';
    } else {
      host.innerHTML = keys.map(function (k, i) {
        //: ★the ids must not end in `-a`, `-r0`, `-du` … : the page-level
        //: geometry is ONE control (T-D3) and its gate counts every input
        //: whose id ends in one of those names.  A per-instant target is not
        //: a second copy of the shared geometry and must not be counted as
        //: one — hence the `f` in front of every field name.
        var cell = function (f) {
          return '<label><span>' + f.lab + '</span>' +
                 '<input type="number" class="kfcell" step="' + f.step +
                 '" id="design-pulse-kf' + i + '-f' + f.k +
                 '" data-kf="' + i + '" data-kfk="' + f.k +
                 '" value="' + (+k[f.k]).toFixed(f.d) + '"></label>';
        };
        return '<div class="kfitem"><div class="kfhead">' +
          '<label><span>t [s]</span><input type="number" class="kfcell" ' +
          'step="0.1" id="design-pulse-kf' + i + '-ft" data-kf="' + i +
          '" data-kfk="t" value="' + (+k.t).toFixed(2) + '"></label>' +
          '<button type="button" class="ghost kfdel" data-kfdel="' + i +
          '">' + T('pulse.key.del') + '</button></div>' +
          '<div class="kffields">' + KEYF.map(cell).join('') +
          '</div></div>';
      }).join('');
      Array.prototype.forEach.call(
        host.querySelectorAll('input.kfcell'), function (e) {
          e.addEventListener('input', function () {
            var row = keys[+e.dataset.kf];
            if (!row) return;
            row[e.dataset.kfk] = +e.value;
            drawKeysNote(); drawGrid();
          });
        });
      Array.prototype.forEach.call(
        host.querySelectorAll('button.kfdel'), function (b) {
          b.addEventListener('click', function () {
            keys.splice(+b.dataset.kfdel, 1);
            drawKeys(); drawGrid();
          });
        });
    }
    drawKeysNote();
  }

  /**
   * How many rows are in use, and how many are not.
   *
   * ★Rows outside (击穿, 结束] or carrying a number that is not a shape are
   * DROPPED AND SAID SO — the same rule the limits column keeps: a row this
   * bar cannot use must not be silently clipped into one it can.
   */
  function drawKeysNote() {
    var note = $('keys-note');
    if (!note) return;
    var kf = keyframes(phases());
    note.innerHTML = kf.dropped
      ? T('pulse.key.dropped', { n: kf.dropped, m: kf.rows.length })
      : T('pulse.key.count', { n: kf.rows.length });
  }

  /**
   * What the grid will look like at the current settings.
   *
   * ★T-D15: this is a claim the reader can check against the 相位 column of
   * the verification table below, and the number the whole item is about —
   * before the change it read 「斜坡 1」 on every default pulse.
   */
  function drawGrid() {
    var e = $('gridsplit');
    if (!e) return;
    var ph = phases();
    var ts = gridTimes(ph, +$('npts').value,
                       keyframes(ph).rows.map(function (k) { return k.t; }));
    var c = gridSplit(ph, ts);
    e.innerHTML = T('pulse.gridsplit', { n: ts.length, bd: c[0], up: c[1],
                                         fl: c[2], dn: c[3] });
  }

  // --- T-D16: THIS BAR'S OWN SESSION FILE -----------------------------------
  //
  // ★The (时刻, 位形) rows above are control state, and this bar had no
  // session format of its own: they could not be saved and could not be
  // handed to anybody.  So could nothing else on this bar — the two bars
  // beside it have written session files since they were built, and the
  // shape of a pulse is exactly the kind of input that is meant to travel.
  //
  // WHAT THE FILE CARRIES: inputs, and only inputs.  `app/cases/` is why that
  // is worth saying twice — 「一个算例就是一份会话文档」, so what this bar
  // writes has to be, in form, the document a shipped case is:
  // `fylite:AppSession/1`, `fylite:page` naming the BAR (the file format is a
  // contract with the gates and with files already on disk, so the key names
  // the part the way `zerod` and `discharge` do, and the ids inside
  // `fylite:config` stay bare), one `fylite:config` block, and no
  // `fylite:result`.  A reader who saves their own run gets a case.
  //
  // WHAT IT CANNOT CARRY, and says so rather than quietly applying a subset:
  // the flat-top 位形 this trajectory is designed toward is NOT this bar's
  // input to give.  It is what the 位形 bar SOLVED (T-D4) — reading the
  // target controls instead is the very bug that item removed — and a file
  // that carried it would be handing back a solved boundary that nothing on
  // the receiving page had recomputed.  So the configuration this file was
  // written against is recorded as PROVENANCE and never applied, and the
  // import states whether the configuration standing on the page is that
  // one, a different one, or not there yet.  A wrong number is worse than a
  // declared unknown.
  //
  // PRECISION.  The rows go out VERBATIM, not through `FySession.sig`.
  // T-D13's whole property is that a row seeded from the trajectory is a
  // correction of exactly zero; seven significant digits would make it a
  // correction of about 1e-8 — small, and not zero.  A control value that
  // does not come back as itself is a different run, which is the lattice
  // rule `validate-cases.mjs` states for cases and holds here for the same
  // reason.
  var PCONTROLS = ['tbd', 'tramp', 'tflat', 'tend', 'npts', 'a0',
                   'nverify', 'vcap'];
  var KEYCOLS = ['t', 'r0', 'z0', 'a', 'kappa', 'du', 'dl'];
  var SHAPEC = ['r0', 'z0', 'a', 'kappa', 'deltaU', 'deltaL'];

  /** The reader's rows as the file carries them: every field, full precision. */
  function keysDoc() {
    return keys.map(function (k) {
      var o = {};
      KEYCOLS.forEach(function (c) { o[c] = +k[c]; });
      return o;
    });
  }

  /**
   * The rows a file carries.
   *
   * ★Coerced but NOT filtered: a row this bar cannot use is reported as
   * unused by the panel note above (T-D13's rule), and dropping it here
   * instead would delete an input the reader typed without saying so.
   */
  function readKeys(rows) {
    if (!Array.isArray(rows)) return null;
    return rows.map(function (row) {
      var o = {};
      KEYCOLS.forEach(function (c) { o[c] = +(row && row[c]); });
      return o;
    });
  }

  /** The solved configuration this bar designs toward, or null. */
  function designedFor() {
    var p = S.take('discharge');
    if (!p || !p.shape) return null;
    var s = p.shape;
    var o = { 'fylite:shape': {}, 'fylite:ip': p.ip,
              'fylite:x_point': p.xpoint
                ? { r: p.xpoint.r, z: p.xpoint.z } : null,
              'fylite:reached': p.reached === undefined ? null : p.reached };
    SHAPEC.forEach(function (c) { o['fylite:shape'][c] = s[c]; });
    return o;
  }

  function jsonDoc() {
    var cfg = FySession.collect(PCONTROLS, S.scope);
    cfg['fylite:target_keys'] = keysDoc();
    var doc = FySession.envelope('pulse', cfg, S.kernel());
    //: ★PROVENANCE, NOT A RESULT — recorded so an import can say what it is
    //: standing on, never applied.  `null` when nothing has been solved:
    //: a zeroed shape here would be a configuration nobody designed for.
    doc['fylite:designed_for'] = designedFor();
    return doc;
  }

  var shapeStr = function (s) {
    return SHAPEC.map(function (c) { return (+s[c]).toFixed(3); }).join(', ');
  };

  /**
   * What the file was designed against, against what the page holds now.
   *
   * ★Three outcomes and all three are said out loud.  The one that matters is
   * the middle one: the trajectory this file reproduces is the one THIS page
   * solves, so a reader importing it onto a different configuration has to be
   * told that the numbers they get are not the numbers the sender got.
   */
  function compareSource(want) {
    var have = designedFor();
    if (!have) return { key: 'pulse.j.src.unsolved', v: {} };
    var hs = have['fylite:shape'];
    if (!want || !want['fylite:shape'])
      return { key: 'pulse.j.src.filenone', v: { page: shapeStr(hs) } };
    var ws = want['fylite:shape'];
    var near = function (a, b) {
      return isFinite(a) && isFinite(b)
        && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
    };
    var same = SHAPEC.every(function (c) { return near(+ws[c], hs[c]); })
      && near(+want['fylite:ip'], have['fylite:ip']);
    return same
      ? { key: 'pulse.j.src.same', v: { page: shapeStr(hs) } }
      : { key: 'pulse.j.src.diff',
          v: { file: shapeStr(ws), page: shapeStr(hs),
               fip: (+want['fylite:ip'] / 1e3).toFixed(1),
               pip: (have['fylite:ip'] / 1e3).toFixed(1) } };
  }

  /** The sentence an import leaves on the panel, until the next run. */
  function sayImported(html) {
    var e = $('imported');
    if (!e) return;
    e.innerHTML = html || '';
    e.hidden = !html;
  }

  S.formats({
    json: {
      docPage: 'pulse',
      label: T('io.label.json'), filename: 'fylite_pulse_session.json',
      accept: '.json,application/json',
      exportHint: T('pulse.j.export_hint'),
      importHint: T('pulse.j.import_hint'),
      //: ★always writable: this file is inputs, and the inputs are there
      //: before anything has run.  The two bars beside it refuse to write
      //: without a result because their documents carry one.
      build: function () { return JSON.stringify(jsonDoc(), null, 1); },
      apply: function (text, name) {
        var doc = FySession.parse(text);
        if (doc['fylite:page'] !== 'pulse')
          throw new Error(T('msg.wrong_page', { page: doc['fylite:page'] }));
        var cfg = doc['fylite:config'];
        var r = FySession.apply(cfg, S.scope);
        var rows = readKeys(cfg['fylite:target_keys']);
        //: ★a file with no rows section is not a file asking for no rows.
        //: Every document this bar writes carries the section, empty list and
        //: all; one without it says nothing about the rows, so the rows are
        //: left alone AND that is reported.
        if (rows) keys = rows;
        syncLabels();
        drawKeys();
        drawGrid();
        var cmp = compareSource(doc['fylite:designed_for']);
        var kf = keyframes(phases());
        //: ★the two sentences are CONCATENATED, not nested: `FyI18n.t`
        //: escapes what it substitutes (so a filename cannot inject markup),
        //: and a translated string carrying <strong> put through a
        //: placeholder would reach the reader as its own tags.
        sayImported(T('pulse.j.note', {
          name: name, n: r.applied.length, k: kf.rows.length,
          rows: rows ? T('pulse.j.rows', { n: rows.length })
                     : T('pulse.j.norows') })
          + ' ' + T(cmp.key, cmp.v));
        //: 不自动开算——导入说的是「算什么」，不是「现在就算」
        return T('pulse.j.imported', {
          name: name, n: r.applied.length, k: kf.rows.length,
          skipped: r.skipped.length
                   ? T('msg.skipped', { n: r.skipped.length }) : '' });
      },
    },
  });

  // --- events ---------------------------------------------------------------

  ['npts', 'a0', 'nverify'].forEach(function (id) {
    $(id).addEventListener('input', function () { syncLabels(); drawGrid(); });
  });
  ['tbd', 'tramp', 'tflat', 'tend'].forEach(function (id) {
    $(id).addEventListener('change', function () { drawGrid(); });
  });
  ['vcap'].forEach(function (id) {
    $(id).addEventListener('change', function () { if (last) draw(); });
  });
  $('keyadd').addEventListener('click', function () {
    keys.push(seedRow());
    drawKeys(); drawGrid();
  });
  // --- the worked cases ----------------------------------------------------
  //
  // ★This bar does NOT re-run on a case: one trajectory is 21 waypoints of
  // free-boundary solving (measured 7.7 s on ITER), and spending that because
  // a menu changed is what 「算例只设定，不开算」 is for.  Its upstream has to
  // have run anyway.
  S.cases({ when: FyDesignReady.promise, after: function () { syncLabels(); } });

  S.onRun(run);
  S.onRefresh(function () { syncLabels(); drawKeys(); drawGrid(); });
  syncLabels();
  drawKeys();
  drawGrid();
});

// ==========================================================================
// 功能栏  breakdown — 击穿场零
// ==========================================================================

// Breakdown / field-null design (FYL-DESIGN-04 §6.5 候选一), reconnected as
// a bar of this page (T-D14) after the 2026-08-22 restructure withdrew it.
//
// The pre-plasma phase, and the cheapest capability in the chain: it is
// PURELY VACUUM.  There is no Grad-Shafranov solve anywhere on this bar —
// the field is linear in the coil currents, so "design a null" is one small
// least-squares problem, not an outer loop around a solver.  That is also
// why the bar declares no `needs`: nothing the other bars produce can feed
// a solve that runs before any plasma exists.
//
// Ported from `python/fylite/breakdown.py`, conventions included: the disc
// sampling, the tolerance-normalised row scaling and the null statistics
// are the same ones, so the two can be cross-checked rather than merely
// compared.
//
// ★The channel response is taken at subdivision 3x3 because that is what
// the native path uses.  The worker's equilibrium entries call the same
// kernel at 4x4; mixing them would leave two "responses" that differ in
// the third digit and nothing pointing at why.

FyScenario.whenDevices(function () {
  'use strict';

  var M = self.FYLITE_MACHINE;
  var T = FyI18n.t;
  var NU = 3, NV = 3;          // element subdivision — matches breakdown.py
  var N_RING = 4, N_THETA = 16;
  var last = null;

  var S = DESIGN.bar('breakdown', {
    title: 'nav.breakdown',
    folded: true,
    sliders: { radius: 2, btol: 1, flux: 2, wnull: 2, wflux: 2, imax: 0 },
    on: { error: onError, breakdown: onResult },
  });
  var $ = S.$, syncLabels = S.sync, setBusy = S.setBusy;

  function inputs() {
    return {
      //: ★the DOM controls are `nullr`/`nullz`, NOT `r0`/`z0`: on this page
      //: `r0` is the shared major radius, and the gate's "one control per
      //: shared quantity" rule (rightly) rejects a second element answering
      //: to that name.  The message fields keep the kernel's spelling.
      r0: +$('nullr').value, z0: +$('nullz').value,
      radius: +$('radius').value,
      bTol: +$('btol').value * 1e-3,          // control is in mT
      nRing: N_RING, nTheta: N_THETA,
      fluxTarget: $('usefluxTarget').checked ? +$('flux').value : null,
      weightNull: +$('wnull').value,
      weightFlux: +$('wflux').value,
      lam: 1e-12,
      //: bias toward the machine's own reference currents when it has
      //: any — a null near a known state is easier to trust than one
      //: picked out of the null space at random
      xRef: FyDevice.hasReference(M) && $('usexref').checked
            ? Array.from(M.reference.aturns) : null,
      iMax: $('uselimits').checked ? limitVector() : null,
      nu: NU, nv: NV,
    };
  }

  // --- per-channel limits ----------------------------------------------------
  //
  // ★The numbers here are YOURS, not the machine's.  Real supply ratings
  // would come from the device descriptor, and neither descriptor in this
  // app carries a set that has been cross-checked: the turn counts two
  // upstream sources give for the PF7/PF9-type elements disagree, and a
  // limit derived from the wrong turn count attaches silently to the wrong
  // channel — the design would come back "blocked by PF3" while the coil
  // actually saturating is another one.  So the bar asks for the limits
  // instead of inventing them, and says so (`b.lim_source`).
  var perCh = null;          // absolute limits [A-turn], null = follow slider

  function channelName(k) {
    return (M.coils[(M.channels[k][0] || [])[0]] || {}).name || ('CH' + (k + 1));
  }

  function limitVector() {
    var n = M.channels.length, uni = +$('imax').value * 1e3;
    var v = new Array(n);
    for (var k = 0; k < n; k++)
      v[k] = (perCh && isFinite(perCh[k])) ? perCh[k] : uni;
    return v;
  }

  /** Drop every per-channel override back onto the uniform slider value. */
  function resetLimits() { perCh = null; }

  function run() {
    if (S.isBusy()) return;
    setBusy(true, T('b.solving'));
    S.progress(0.5);
    S.send({ cmd: 'breakdown', spec: inputs() });
    //: the promise is what the page's run chain waits on: this bar posted a
    //: message, so it is not finished when this function returns
    return S.settle('breakdown');
  }

  // --- drawing -------------------------------------------------------------

  function f(v, d) { return isFinite(v) ? v.toFixed(d) : '—'; }

  function drawAll() {
    var col = FyPlot.palette($('cross'));
    var d = last;
    buildElFill();
    //: contours of |B_pol| rather than of psi — on this bar the null IS
    //: the subject, and it shows as the bullseye the contours close on
    //: ★NOT the equilibrium component's cross-section: what this contours
    //: is |B_pol| from the coils, not a psi map, and its levels are capped
    //: near the criterion rather than at the field's own maximum
    FyPlot.poloidal($('cross'), {
      machine: M, grid: S.kernel() ? S.kernel().grid : null,
      psi: d && d.bpolGrid, psiAxis: 0,
      psiBnd: d && Math.min(d.bpolScale, 10 * d.spec.bTol),
      nLevels: d ? 14 : 0, fluxSegs: d && d.fluxSegs,
      coilFill: d ? coilFill : null,
      circle: d ? { r: d.spec.r0, z: d.spec.z0, radius: d.spec.radius } : null,
    });
    $('cross-legend').innerHTML = FyPlot.legendHTML([
      { label: T('b.leg.disc'), color: col.accent, kind: 'line', dash: [4, 4] },
    ]);
    drawProfile();
    drawTables();
  }

  //: ★per-ELEMENT fill from per-CHANNEL currents: the cross-section draws
  //: the 14 conductor rectangles and asks for a fill per RECTANGLE, while
  //: the answer is 12 channel currents (two are series pairs).  Indexing
  //: `aturns` by the element number handed the last two rectangles
  //: `undefined` — the channel map is what says which element carries which
  //: channel's current.
  var elFill = null;
  function coilFill(k) { return elFill ? (elFill[k] || 0) : 0; }
  function buildElFill() {
    if (!last) { elFill = null; return; }
    var mA = 1;
    for (var c = 0; c < last.aturns.length; c++)
      mA = Math.max(mA, Math.abs(last.aturns[c]));
    elFill = new Array(M.coils.length).fill(0);
    M.channels.forEach(function (ch, c2) {
      ch.forEach(function (ew) { elFill[ew[0]] = last.aturns[c2] / mA; });
    });
  }

  function drawProfile() {
    var col = FyPlot.palette($('bprof'));
    if (!last) {
      FyPlot.xy($('bprof'), { series: [{ x: [0, 1], y: [0, 0],
                                         color: col.grid }] });
      return;
    }
    //: |B_pol| along the sampled rings, ordered outward — the shape that
    //: says whether the null is a point or a region
    var x = [], y = [];
    for (var i = 0; i < last.discR.length; i++) {
      x.push(Math.hypot(last.discR[i] - last.spec.r0,
                        last.discZ[i] - last.spec.z0));
      y.push(last.bpol[i] * 1e3);
    }
    var order = x.map(function (v, i) { return i; })
                 .sort(function (a, b) { return x[a] - x[b]; });
    FyPlot.xy($('bprof'), {
      series: [{ x: order.map(function (i) { return x[i]; }),
                 y: order.map(function (i) { return y[i]; }),
                 color: col.lcfs, kind: 'dots', radius: 2.5 }],
      xlabel: T('b.axis.rad'), ylabel: T('b.axis.b'), ymin: 0,
      //: the tolerance drawn as a line: "below this" is the whole criterion
      bands: [{ x0: 0, x1: last.spec.radius,
                color: col.muted, label: T('b.band.disc') }],
      hline: last.spec.bTol * 1e3,
    });
  }

  function drawTables() {
    if (!last) { $('scalars').innerHTML = ''; $('coils').innerHTML = '';
                 return; }
    var d = last;
    var ok = d.bMax <= d.spec.bTol;
    var rows = [
      [T('b.row.bmax'), f(d.bMax * 1e3, 3) + ' mT'],
      [T('b.row.brms'), f(d.bRms * 1e3, 3) + ' mT'],
      [T('b.row.bcentre'), f(d.bCentre * 1e3, 3) + ' mT'],
      [T('b.row.tol'), f(d.spec.bTol * 1e3, 2) + ' mT'],
      [T('b.row.ok'), ok ? T('b.ok.yes') : T('b.ok.no')],
      [T('b.row.flux'), f(d.flux, 4) + ' Wb'],
    ];
    if (d.spec.fluxTarget !== null)
      rows.push([T('b.row.flux_err'), f(d.flux - d.spec.fluxTarget, 4) + ' Wb']);
    var bind = d.bind || [];
    rows.push([T('b.row.bind'), bind.length
               ? bind.map(channelName).join(', ') : T('b.none')]);
    if (d.over.length)
      rows.push([T('b.row.over'), d.over.map(channelName).join(', ')]);
    $('scalars').innerHTML = rows.map(function (x) {
      return '<tr><td>' + x[0] + '</td><td class="num">' + x[1] + '</td></tr>';
    }).join('');

    var lim = d.limits || null;
    $('coils').innerHTML = Array.from(d.aturns, function (v, k) {
      var at = lim && bind.indexOf(k) >= 0;
      return '<tr' + (at ? ' class="bind"' : '') + '><td>' + channelName(k) +
             '</td><td class="num">' + (v / 1e3).toFixed(1) + '</td>' +
             '<td class="num">' + (lim ? '<input class="lim" type="number" ' +
               'step="10" min="0" data-ch="' + k + '" value="' +
               (lim[k] / 1e3).toFixed(0) + '">' : '—') + '</td>' +
             '<td class="num">' + (at ? T('b.at_bound') : '') + '</td></tr>';
    }).join('');

    //: ★a run that did not converge is answered before anything else.  What
    //: the solver handed back is a point on a descent; naming which channel
    //: "blocked" it would be reading an optimum out of a number that is not
    //: one — and the figure beside it would look exactly like a design.
    if (d.converged === false) {
      $('verdict').innerHTML = T('b.verdict.nocon');
      return;
    }
    //: the verdict names WHO stopped it.  S10-FR-LIM-2 writes "locatable" as
    //: a MUST for a reason: a bare "infeasible" leaves the reader no move
    //: except to give up.
    $('verdict').innerHTML = !lim
      ? T('b.verdict.nolimit', { b: f(d.bMax * 1e3, 3),
                                 tol: f(d.spec.bTol * 1e3, 2) })
      : (ok ? (bind.length
               ? T('b.verdict.ok_bind', { b: f(d.bMax * 1e3, 3),
                                          who: bind.map(channelName).join('、') })
               : T('b.verdict.ok', { b: f(d.bMax * 1e3, 3) }))
            : (bind.length
               ? T('b.verdict.blocked', { b: f(d.bMax * 1e3, 3),
                                          tol: f(d.spec.bTol * 1e3, 2),
                                          who: bind.map(channelName).join('、') })
               : T('b.verdict.short', { b: f(d.bMax * 1e3, 3),
                                        tol: f(d.spec.bTol * 1e3, 2) })));
  }

  /** Edits to one channel's limit; the slider keeps meaning "all the rest". */
  function onLimitEdit(e) {
    var el = e.target;
    if (!el.classList || !el.classList.contains('lim')) return;
    var k = +el.dataset.ch, v = +el.value * 1e3;
    if (!isFinite(v) || v <= 0) return;
    if (!perCh) perCh = limitVector();
    perCh[k] = v;
    run();
  }

  // --- worker --------------------------------------------------------------

  function onError(m) {
    setBusy(false, T('b.fail', { why: m.message }), 'err');
    S.progress(0);
  }

  function onResult(m) {
    last = m.result;
    last.spec = m.spec;
    S.progress(1);
    drawAll();
    //: ★"minimise |B|" with nothing else asked is solved by switching every
    //: coil off.  That IS the optimum, and reporting it as a good null
    //: without saying so would be the bar's own trivial answer dressed as
    //: a design.
    var biggest = 0;
    for (var i = 0; i < last.aturns.length; i++)
      biggest = Math.max(biggest, Math.abs(last.aturns[i]));
    if (biggest < 1e3) {
      setBusy(false, T('b.degenerate'), 'warn');
      return;
    }
    if (last.converged === false) {
      setBusy(false, T('err.dn.maxiter'), 'warn');
      return;
    }
    var ok = last.bMax <= last.spec.bTol;
    setBusy(false, T(ok ? 'b.done_ok' : 'b.done_miss', {
      b: f(last.bMax * 1e3, 3), tol: f(last.spec.bTol * 1e3, 2),
      ms: m.ms, n: m.result.iterations }), ok ? '' : 'warn');
  }

  // --- file exchange -------------------------------------------------------

  var CONTROLS = ['nullr', 'nullz', 'radius', 'btol', 'flux', 'wnull', 'wflux',
                  'imax', 'usefluxTarget', 'uselimits', 'usexref'];

  S.formats({
    json: {
      docPage: 'breakdown',
      label: T('io.label.json'), filename: 'fylite_breakdown_session.json',
      accept: '.json,application/json',
      exportHint: T('b.j.export_hint'),
      importHint: T('b.j.import_hint'),
      build: function () {
        if (!last) return { error: T('b.none_yet') };
        var doc = FySession.envelope('breakdown',
                                     FySession.collect(CONTROLS, S.scope),
                                     S.kernel());
        doc['fylite:result'] = {
          'fylite:pf_channel_current': FySession.sig(last.aturns),
          //: the limits that were actually in force, and who ended up on
          //: them — without both, the exported design cannot be re-judged
          'fylite:pf_channel_limit': last.limits
            ? FySession.sig(last.limits) : null,
          'fylite:channels_at_bound': (last.bind || []).slice(),
          'fylite:b_pol_max': last.bMax,
          'fylite:b_pol_rms': last.bRms,
          'fylite:b_pol_centre': last.bCentre,
          'fylite:flux_at_null': last.flux,
          'fylite:null_ok': last.bMax <= last.spec.bTol,
        };
        return JSON.stringify(doc, null, 1);
      },
      apply: function (text, name) {
        var doc = FySession.parse(text);
        if (doc['fylite:page'] !== 'breakdown')
          throw new Error(T('msg.wrong_page', { page: doc['fylite:page'] }));
        var r = FySession.apply(doc['fylite:config'], S.scope);
        syncLabels();
        return T('b.j.imported', {
          name: name, n: r.applied.length,
          skipped: r.skipped.length
                   ? T('msg.skipped', { n: r.skipped.length }) : '' });
      },
    },
    device: FyIO.deviceFormat(M),
  });

  // --- events --------------------------------------------------------------

  ['radius', 'btol', 'flux', 'wnull', 'wflux', 'imax'].forEach(function (id) {
    $(id).addEventListener('input', syncLabels);
    $(id).addEventListener('change', run);
  });
  ['nullr', 'nullz'].forEach(function (id) {
    $(id).addEventListener('change', run);
  });
  ['usefluxTarget', 'uselimits', 'usexref'].forEach(function (id) {
    $(id).addEventListener('change', run);
  });
  S.onRun(run);

  // --- the worked cases ----------------------------------------------------
  //
  // ★★THIS BAR RE-RUNS after a case, like the 1.5-D bar and unlike 含时演化:
  // its own `nullr`/`nullz` handlers already run it on `change`, and the solve
  // is milliseconds.  A case that set the null and left the figure on the
  // previous one would show a state the bar never otherwise shows.
  S.cases({ when: FyDesignReady.promise,
            after: function () { syncLabels(); run(); } });

  //: delegated, because the rows are rebuilt on every solve
  $('coils').addEventListener('change', onLimitEdit);
  $('limreset').addEventListener('click', function () { resetLimits(); run(); });
  //: moving the uniform slider means "all of them", so it drops the overrides
  $('imax').addEventListener('change', resetLimits);

  //: the last answer, for the gates and for anyone debugging a handoff —
  //: a value, not a builder: what was SOLVED, not what the sliders now say
  S.publish(function () { return last; });

  S.onRefresh(function () {
    drawAll();
  });

  FyDevice.applyRanges(M, { setValues: true, scope: S.scope });
  //: seed the null from the machine's own box rather than at (1.85, 0):
  //: mid-radius, slightly above the midplane — where these nulls actually
  //: sit on most machines
  var b = FyDevice.bbox(M);
  $('nullr').value = (0.5 * (b.rmin + b.rmax)).toFixed(3);
  $('nullz').value = (b.zmin + 0.55 * (b.zmax - b.zmin)).toFixed(3);
  if (!FyDevice.hasReference(M)) {
    $('usexref').checked = false;
    $('usexref').disabled = true;
  }
  syncLabels();

  S.refresh();
});
