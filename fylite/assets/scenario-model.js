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
// is untouched — the TGLF port runs in the extension binary and the turbulence
// closure this page's 1.5-D bar can switch on still reaches it.  ★What went
// with the demo, on 2026-09-07, is the DECK FACE on the Python side
// (`fylite.scenario.model.tglf`): a deck is an external serialisation format,
// the kernel does not parse one, so that face could not sink into a door and
// was retired rather than kept as a second way in.  The door is
// `code/turbulence`.


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

  function solve() {
    var x = rhoGrid();
    var chi0 = +$('chi0').value;
    var closure = +$('closure').value | 0;
    var t0 = (self.performance || Date).now();
    //: ★★the bar is `case.rs::transport_case` (FYL-DESIGN-16 K-3, 2026-09-05):
    //: the Miller metric from these controls, the Gaussian source, the start
    //: profile, the closure by name — constant · stiff · neoclassical (whose
    //: per-surface blocks the kernel builds from the same seven numbers) —
    //: one steady solve.  What stays here is the grid (bound, so the page's
    //: own `a·i/(n-1)` spacing is the one solved on) and the reading back.
    //: ★第二十五刀: the turbulent run beside this (`turbRun`) sank the same
    //: way — its blocks and metric are the two doors' now.
    var settings = { closure: String(closure), chi0: chi0, p1: 0.25, p2: 1.75,
                     power: +$('power').value, width: +$('width').value,
                     edge: +$('edge').value, pinch: +$('pinch').value, dpc: +$('dpc').value,
                     theta: 1, tol: 1e-10, max_inner: 200,
                     amin: +$('amin').value, rmaj: +$('rmaj').value,
                     kappa: +$('kappa').value, delta: +$('delta').value, q95: +$('q95').value };
    if (closure === 2) {
      settings.bunit = +$('bunit').value;
      settings.ne0 = +$('ne0').value;
      settings.nepeak = +$('nepeak').value;
    }
    var rec = fy.complete('code/transport', {
      settings: settings, inputs: { transport: { 'fylite:rho': Array.from(x) } } });
    var flat = function (node) {
      var out = [];
      (function walk(v) { if (Array.isArray(v)) v.forEach(walk); else out.push(v); })(node.data);
      return Float64Array.from(out);
    };
    var lad = rec.fields.equilibrium.time_slice.profiles_1d;
    var m = { vprime: flat(lad.dvolume_drho_tor), gradR2: flat(lad.gm3), qEdge: +$('q95').value };
    return { x: x, y: flat(rec.fields.y),
             chi: flat(rec.fields.core_transport.model['0'].profiles_1d.electrons.energy.d),
             metrics: m, src: flat(rec.fields.source),
             closure: closure, neo: null,
             chiGb: rec.fields.chi_gb ? flat(rec.fields.chi_gb) : null,
             iterations: rec.facts.inner_iterations.value,
             converged: rec.facts.converged.value !== 0,
             residual: rec.facts.residual.value,
             ms: Math.round((self.performance || Date).now() - t0) };
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
  //: 模块先行那条消息的 promise，见 `turbWorker` 创建处。
  var turbWasm = null;

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
    var x = rhoGrid();
    //: ★第二十五刀: the bar's scalars go as they are; the surface blocks, the
    //: metric, the source and the start profile are the kernel's (both doors
    //: build them from the same prescription the transport solve uses)
    var nRad = +$('turb-nrad').value | 0, nKy = +$('turb-nky').value | 0;
    var bar = { n: x.length, amin: +$('amin').value, rmaj: +$('rmaj').value, kappa: +$('kappa').value,
                delta: +$('delta').value, q95: +$('q95').value, bunit: +$('bunit').value,
                ne0: +$('ne0').value, nepeak: +$('nepeak').value, chi0: +$('chi0').value,
                power: +$('power').value, width: +$('width').value, edge: +$('edge').value,
                pinch: +$('pinch').value, dpc: +$('dpc').value, nrad: nRad, nky: nKy,
                outer: +$('turb-outer').value | 0, relax: 0.5, tol: 1e-4 };
    var t0 = (self.performance || Date).now();
    if (!turbWorker) {
      turbWorker = new Worker(self.FySite.url('assets/worker.js'));
      //: ★★这一页有**第二个** worker，于是同一份 `fylite_rs.wasm` 曾被取第三遍
      //: （实测首屏 7.43 MB，5.0 MB 是同一个模块的三份）。把页面已经编译好的那一份
      //: 交给它——`transport_turb` 在它到达之后才发（下面那句排在 `then` 里）。
      turbWasm = (self.FyLite && self.FyLite.moduleFor)
        ? self.FyLite.moduleFor(self.FySite.url('assets/fylite_rs.wasm')).then(function (rec) {
            if (turbWorker) turbWorker.postMessage({ cmd: 'wasm', url: 'fylite_rs.wasm',
                                                     module: rec.module, sha256: rec.sha256,
                                                     bytes: rec.bytes });
          })['catch'](function () { /* 它自己取，只是多一次下载 */ })
        : Promise.resolve();
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
                 metrics: { vprime: Float64Array.from(d.vprime), gradR2: Float64Array.from(d.gradR2),
                            qEdge: bar.q95 },
                 src: Float64Array.from(d.source), closure: 3, neo: null,
                 chiGb: Float64Array.from(d.chiGb),
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
    setBusy(true, T('x.turb.running', { n: nRad * nKy }));
    S.progress(0.2);
    //: ★等模块那条消息发完再发命令：命令一到，worker 就 attach 了。
    (turbWasm || Promise.resolve()).then(function () {
      if (turbWorker) turbWorker.postMessage({ cmd: 'transport_turb', bar: bar });
    });
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
   * in `docs/note/equilibrium-handoff.md`.
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
    //: assessment in `docs/note/equilibrium-handoff.md` — the point
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
      if (last.chiGb)
        //: the gyro-Bohm unit is what makes the exported chi a number in
        //: m^2/s rather than a dimensionless one — it has to travel
        doc['fylite:profile']['fylite:chi_gyrobohm'] =
          FySession.sig(last.chiGb);
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
  self.FyLite.attach(self.FySite.url('assets/fylite_rs.wasm')).then(function (inst) {
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
               //: T-C13 — the matcher's four.  The tolerance carries three
               //: decimals because its grid is 0.002 and a label rounding
               //: 0.002 to「0.00」 would be a control the reader cannot read.
               fmiter: 0, fmtol: 3, fmdx: 2, fmdxmax: 1, fmrhomin: 2,
               //: T-C14 的两个：轮数是整数，外环判据的格点是 0.005
               fmouter: 0, fmotol: 3, fmorlx: 2,
               //: T-C20 的三个：两个输运数与杂质加料速率
               dchiz: 2, pinchz: 2, zfuel: 2,
               //: T-C16 的两个增益
               ipkp: 1, ipki: 2,
               degp: 0, degf: 0, torque: 1, prandtl: 2,
               //: the launchers' six, so the band the machine declared is
               //: READABLE and not only in effect (T-M15)
               lhpower1: 1, lhpower2: 1, lhnpar1lo: 2, lhnpar1hi: 2,
               lhnpar2lo: 2, lhnpar2hi: 2 },
    on: { ready: onReady, error: onError, evolve_geometry: onGeometry,
          evolve_step: onStep, evolve_couple: onCouple, evolve: onDone,
          //: T-C13 — the matcher's iteration boundaries, so a solve whose
          //:每一轮 costs a full TGLF sweep says where it is rather than
          //: looking hung
          evolve_match: onMatch,
          //: T-C14 — and one line per OUTER round, for the same reason: a
          //: run that wraps eight full matches must say which of the eight
          //: it is in, or the only honest reading of the state line is
          //: 「不知道还要多久」.
          evolve_round: onRound },
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
      //: ★T-M4 — with the pedestal model on, the edge temperature is the
      //: EPED1-NN pedestal top and the two sliders above are disabled on
      //: the page rather than quietly ignored in the worker
      pedestal: on('pedestal'),
      peakT: +$('peakt').value, peakN: +$('peakn').value,
      vLoop: +$('vloop').value, b0Dot: 0,
      closure: +$('closure').value | 0, chi0: +$('chi0').value,
      //: the turbulent tier's budget, and the cadence it is evaluated on
      turbEvery: +$('turbevery').value | 0,
      turbNrad: +$('turbnrad').value | 0, turbNky: +$('turbnky').value | 0,
      turbRelax: +$('turbrelax').value,
      //: ★★T-C13 — the flux matcher's own four.  `fmTol` is a RELATIVE flux
      //: difference here and is squared in the worker, where the kernel's
      //: `(f-g)^2` residual is; the match radii are not among them because
      //: they are `turbNrad` — matching where the closure was never
      //: evaluated would be matching an interpolation.
      fmIter: +$('fmiter').value | 0, fmTol: +$('fmtol').value,
      fmDx: +$('fmdx').value, fmDxMax: +$('fmdxmax').value,
      //: ★the inner boundary of the matched region — measured, not chosen:
      //: matching from the node next to the axis DIVERGED on the ITER case
      //: (a/L_Ti driven to −3.6, i.e. a hollow profile), while the outer
      //: three radii were already matched to 0.4 %
      fmRhoMin: +$('fmrhomin').value,
      //: ★★T-C14 —— 外环。`fmOuter = 1` 就是「只匹配，不交替」，即 T-C13 落地
      //: 时的行为；大于 1 时每一轮在匹配之后再走稳态电流 → 锯齿 → 平衡，
      //: 收敛判据用的是上游那一条的原样（压强与电流剖面的相对变化）。
      fmOuter: Math.max(1, +$('fmouter').value | 0),
      //: ★T-C20：第二种离子自己的输运与源。缺省与主离子相同（源缺省 0），
      //: 所以打开第二种离子本身不改变任何东西。
      dOverChiZ: +$('dchiz').value, pinchZ: +$('pinchz').value,
      fuelZ: +$('zfuel').value,
      fmOTol: +$('fmotol').value,
      //: ★外环的欠松弛因子，作用在稳态电流那一步的 q 与 ψ 上。1 = 不阻尼。
      fmORelax: +$('fmorlx').value,
      //: ★★T-C16 —— I_p 反馈。误差是**相对**的（回路自己在第一步上标定），
      //: 因为从 ψ 读出的 I_p 在梯子上系统性低约 3 %，而那 3 % 不随分辨率收敛：
      //: 闭在绝对值上的回路会稳稳驱到一个差 3 % 的 I_p 上。
      ipCtl: on('ipctl'), ipKp: +$('ipkp').value, ipKi: +$('ipki').value,
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
      waveFuel: on('wavefuel'), waveIp: on('waveip'),
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
      //: ★the outline itself rides along (2026-09-05): the kernel's g-file
      //: tier measures the minor radius from it with the SAME shape metric,
      //: rather than trusting a number the page measured
      bndR: Array.from(g.rbbbs), bndZ: Array.from(g.zbbbs),
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
    //: ★T-C13 — said here as well as in the worker, and that is on purpose:
    //: the controls above are disabled on this tier, but an IMPORTED session
    //: can carry any of them, and a refusal the reader meets after the wire
    //: rather than before it reads like a crash.
    if (sp.closure === 4) {
      if (!sp.chHeat) return setBusy(false, T('e.err.fm_needheat'), 'warn');
      if (sp.chDensity || sp.chCurrent || sp.chMomentum)
        return setBusy(false, T('e.err.fm_channels'), 'warn');
      if (sp.wave || on('resume'))
        return setBusy(false, T('e.err.fm_notime'), 'warn');
      if (sp.couple > 0) return setBusy(false, T('e.err.fm_couple'), 'warn');
    }
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

  //: ★★`isFinite(null)` is TRUE — `Number(null)` is 0 — so a guard written
  //: as `isFinite(v) ? v.toFixed(...)` lets null straight through and then
  //: dereferences it.  Both of these read「不是数就画破折号」and neither did
  //: for the one value that most often is not a number: a reading the march
  //: declined to state.  Caught when a march that states no exchange time
  //: took the whole page down with it.
  function f(v, d) {
    return (v !== null && isFinite(v)) ? v.toFixed(d) : '—';
  }
  function e2(v) {
    return (v !== null && isFinite(v)) ? v.toExponential(2) : '—';
  }
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
      //: ★T-M4: the boundary the step actually ran under, when the
      //: pedestal model set it — the solved top, the pressure and width
      //: it came from, and the extrapolation distance when the machine
      //: sat outside EPED1-NN's training box (0 stays silent).
      if (r.pedTPed != null && isFinite(r.pedTPed)) {
        rows.push([T('e.row.tped'),
                   f(r.pedTPed / 1e3, 3) + ' keV' +
                   (r.pedPPed ? ' · ' + f(r.pedPPed / 1e3, 1) + ' kPa · Δψ '
                     + f(r.pedWidth, 3) : '')]);
        if (r.pedExtrap > 0)
          rows.push([T('e.row.tped_extrap'),
                     f(100 * r.pedExtrap, 1) + ' %']);
      }
      //: ★★T-C16 的反馈量：ψ 剖面**实际携带**的等离子体电流，与滑杆上请求的
      //: 那个并排报出。★两个数一起报是有意的：这支式子在梯子上系统性低约 3 %
      //: （梯子自己的求积精度，实测不随分辨率也不随边界位置收敛），所以**能拿去
      //: 当反馈的是比值，不是绝对值**——把比值写在旁边，读者与将来那条回路都
      //: 照着比值走。解析几何上没有 gm2，这一行整条不出现。
      //: ★T-C14：外环走了几轮、收没收敛、最后一轮的两个变化量。
      if (last && last.stationary) {
        var so2 = last.stationary, lastR = (so2.rounds || []).slice(-1)[0];
        rows.push([T('e.row.stationary'),
                   (so2.rounds || []).length + ' / ' + so2.maxRounds + ' 轮 · '
                   + (so2.converged ? '收敛' : '未收敛')
                   + (lastR ? '（Δp ' + f(100 * lastR.dPressure, 2) + ' % · Δq '
                       + (isFinite(lastR.dQ) ? f(100 * lastR.dQ, 2) + ' %' : '—')
                       + '）' : '')]);
      }
      //: ★T-C16：回路在做什么——它落到的电压、它按住的相对误差，以及它在
      //: 第一步上取的标定比。标定**报出来而不是折进去**。
      if (r.ipCtl) {
        rows.push([T('e.row.ipctl'),
                   f(r.ipCtl.vLoop, 3) + ' V / ' + f(100 * r.ipCtl.err, 2)
                   + ' %（标定比 ' + f(r.ipCtl.ratio0, 3) + '）']);
      }
      if (r.ipPsi != null && isFinite(r.ipPsi)) {
        var ipAsk = +$('ip').value * 1e3;
        rows.push([T('e.row.ip_psi'),
                   f(r.ipPsi / 1e3, 1) + ' kA / ' + f(ipAsk / 1e3, 1) + ' kA'
                   + (ipAsk > 0 ? '（比 ' + f(r.ipPsi / ipAsk, 3) + '）' : '')]);
      }
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
    //: ★★T-C13 — the match's own two tables, drawn only when this run WAS a
    //: match.  〔上〕the residual per iteration: 「收敛了」 is a claim about
    //: a sequence, and a single final number cannot support it.  〔下〕both
    //: fluxes against both targets at every match radius: a max residual
    //: that passed hides which radius was carrying it, and the flux columns
    //: are what makes the residual column re-derivable rather than believed.
    var fmOut = $('fm-out');
    if (fmOut) {
      var fmr = last && last.fluxMatch;
      fmOut.hidden = !fmr;
      //: the time-trace panel goes the other way: this tier has no time
      //: axis, and two figures drawn from a single point would be a plot of
      //: nothing
      var tbox = $('traces-box');
      if (tbox) tbox.hidden = !!fmr;
      if (fmr) {
        $('fm-hist').innerHTML = (fmr.history || []).map(function (h) {
          return '<tr><td>' + h.iteration + '</td><td class="num">' +
                 (100 * h.worst).toFixed(3) + ' %</td><td class="num">' +
                 (isFinite(h.tPed) && h.tPed !== null
                    ? (h.tPed / 1e3).toFixed(3) : '—') + '</td></tr>';
        }).join('');
        $('fm-radii').innerHTML = (fmr.rhoN || []).map(function (x, i) {
          return '<tr><td>' + f(x, 3) + '</td><td class="num">' +
                 f(fmr.alte[i], 2) + ' · ' + f(fmr.alti[i], 2) +
                 '</td><td class="num">' +
                 f(fmr.fluxE[i] / 1e3, 1) + ' / ' + f(fmr.targetE[i] / 1e3, 1) +
                 ' (' + (100 * fmr.relE[i]).toFixed(2) + ' %)' +
                 '</td><td class="num">' +
                 f(fmr.fluxI[i] / 1e3, 1) + ' / ' + f(fmr.targetI[i] / 1e3, 1) +
                 ' (' + (100 * fmr.relI[i]).toFixed(2) + ' %)' +
                 '</td></tr>';
        }).join('');
        var fv = $('fm-verdict');
        if (fv)
          fv.innerHTML = T('e.fm.summary', {
            m: fmr.nRadii, ch: fmr.channels, ev: fmr.evaluations,
            dx: f(fmr.dx, 2), dxmax: f(fmr.dxMax, 1),
            ref: e2(fmr.weightRef / 1e3), floor: e2(fmr.weightFloor / 1e3),
            rhomin: f(fmr.rhoMin, 2) })
            + (fmr.burnFrozen
                 ? ' ' + T('e.fm.burn', { d: (100 * fmr.burnCheck).toFixed(2) })
                 : '');
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

  //: ★T-C13 — one line per Newton iteration while it runs.  The residual is
  //: already a relative flux difference when it gets here (the worker takes
  //: the square root of the kernel's `(f-g)^2`), so what the reader watches
  //: is「模型通量与目标差百分之几」 and not a number in W^2/m^4.
  function onMatch(m) {
    //: ★with an outer loop the progress bar is TWO nested counts, and
    //: showing only the inner one would run 0 -> 1 eight times over.  The
    //: round is the coarse hand, the iteration the fine one.
    var many = m.rounds > 1;
    var frac = Math.min(0.98, m.iteration / Math.max(1, m.iterations));
    S.progress(many ? Math.min(0.98, ((m.round - 1) + frac) / m.rounds)
                    : frac);
    var arg = { it: m.iteration, n: m.iterations,
                res: (100 * m.worst).toFixed(2),
                tol: (100 * m.tol).toFixed(2),
                r: m.round, R: m.rounds };
    setBusy(true, T(many ? 'e.fm.at_r' : 'e.fm.at', arg));
  }

  //: ★T-C14 — a round has ENDED and here is what it changed.  The two
  //: numbers are the loop's own convergence test (the relative change of
  //: the pressure and of q between rounds), so a reader watching this line
  //: sees the alternation settle — or sees it not settle, which is the
  //: case the criterion exists for.  ★The first round prints 「—」 for both:
  //: it has no previous round to differ from, and printing a number there
  //: would invite reading it as convergence.
  function onRound(m) {
    S.progress(Math.min(0.99, m.round / Math.max(1, m.rounds)));
    var pc = function (v) {
      return isFinite(v) ? (100 * v).toFixed(2) + ' %' : '—';
    };
    setBusy(true, T('e.fm.round_at',
                    { r: m.round, R: m.rounds,
                      dp: pc(m.dPressure), dq: pc(m.dQ) }));
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
             ipCtlLog: m.ipCtlLog || null, ipCtlRatio0: m.ipCtlRatio0,
             //: ★★T-C20：闭包实际用的 Z_eff 与它是不是解出来的
             zeffProfile: m.zeffProfile || null, zeffSolved: !!m.zeffSolved,
             stationary: m.stationary || null,
             //: T-C14〔五〕：稳态电流那一步的入参与出参，进会话文件
             steady: m.steady || null,
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
             //: ★T-M4: the pedestal record — inputs and all eighteen
             //: outputs — when the model set the boundary
             pedestal: m.pedestal || null,
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
             //: ★T-C13 — the match's whole record, when this run was one
             fluxMatch: m.fluxMatch || null,
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
    //: ★★T-C13 — the flux-match tier has no time axis, so「跑满 N 步」 and
    //: 「到达稳态」 are both the wrong sentence: what it reached, or failed
    //: to reach, is a TOLERANCE on a residual, and the verdict says which of
    //: the two and by how much.  ★A match that did not converge is reported
    //: AS a failure — the state line goes red — because the whole point of
    //: this tier is that the bar could otherwise only run a prescribed chi,
    //: and quietly presenting an unconverged answer would put it back there.
    //: ★★T-C14 — AND WHEN THERE IS AN OUTER LOOP, IT SPEAKS BEFORE THE
    //: MATCH, for the same reason the free boundary speaks before both: a
    //: converged match inside a loop that never settled is a converged
    //: answer to the LAST round's question, not to the loop's.  Without
    //: this line the reader of an eight-round run was handed a verdict
    //: about one match and no way to tell which round it came from.
    var so = m.stationary || null;
    if (so) {
      var soLast = (so.rounds || []).slice(-1)[0] || null;
      var soArg = { n: (so.rounds || []).length, max: so.maxRounds,
                    tol: (100 * so.tolerance).toFixed(2),
                    dp: soLast && isFinite(soLast.dPressure)
                      ? (100 * soLast.dPressure).toFixed(2) + ' %' : '—',
                    dq: soLast && isFinite(soLast.dQ)
                      ? (100 * soLast.dQ).toFixed(2) + ' %' : '—',
                    neq: so.equilibriumRounds,
                    why: outerWhyText(so) };
      vparts.push(T(so.converged ? 'e.fm.outer.ok' : 'e.fm.outer.bad', soArg));
    }
    var fm = m.fluxMatch || null;
    if (fm) {
      vparts.push(fm.converged
        ? T('e.fm.verdict.ok', { it: fm.iterations,
                                 res: (100 * fm.worst).toFixed(2),
                                 tol: (100 * fm.tol).toFixed(2),
                                 ev: fm.evaluations })
        : T('e.fm.verdict.bad', { it: fm.iterations,
                                  res: (100 * fm.worst).toFixed(2),
                                  tol: (100 * fm.tol).toFixed(2),
                                  where: worstRadius(fm) }));
      $('verdict').innerHTML = vparts.join(' ');
      //: ★the state line answers「这次跑成了没有」, and with an outer loop
      //: the answer is the LOOP's, not the last match's: a run whose eighth
      //: round matched beautifully and whose pressure still moved 24 % between
      //: rounds did not reach a self-consistent stationary state.  ★Both
      //: numbers stay on the line, because「哪一层没收」 is the first thing
      //: the reader needs.
      var okAll = fm.converged && (!so || so.converged);
      setBusy(false,
              so
                ? T(okAll ? 'e.fm.outer_done' : 'e.fm.outer_failed',
                    { n: (so.rounds || []).length, max: so.maxRounds,
                      it: fm.iterations, ms: m.ms,
                      dp: (so.rounds || []).length
                        && isFinite((so.rounds).slice(-1)[0].dPressure)
                        ? (100 * (so.rounds).slice(-1)[0].dPressure).toFixed(2)
                          + ' %' : '—',
                      res: (100 * fm.worst).toFixed(2),
                      tol: (100 * fm.tol).toFixed(2),
                      t0: r ? (r.te0 / 1e3).toFixed(2) : '—' })
                : (fm.converged
                    ? T('e.fm.done', { it: fm.iterations, ms: m.ms,
                                       t0: r ? (r.te0 / 1e3).toFixed(2) : '—' })
                    : T('e.fm.failed', { it: fm.iterations,
                                         res: (100 * fm.worst).toFixed(2),
                                         tol: (100 * fm.tol).toFixed(2) })),
              okAll ? undefined : 'err');
      return;
    }
    vparts.push(settled
      ? T('e.verdict.steady', { t: f(m.tEnd, 3),
                                d: e2(m.rounds[m.rounds.length - 1].delta) })
      : T('e.verdict.capped', { n: m.steps, t: f(m.tEnd, 3) }));
    $('verdict').innerHTML = vparts.join(' ');
    setBusy(false, T('e.done', { n: m.steps, t: f(m.tEnd, 3),
                                 ms: m.ms,
                                 t0: r ? (r.te0 / 1e3).toFixed(2) : '—' }));
  }

  /**
   * ★WHY the outer loop stopped, in the reader's words rather than the
   * worker's tag.  `why` is empty when the loop simply ran out of rounds —
   * and that is a DIFFERENT statement from「里层解不动了」, which is why the
   * two are not collapsed into one sentence.
   */
  function outerWhyText(so) {
    if (!so.why) return T('e.fm.why.rounds');
    if (so.why === 'match') return T('e.fm.why.match');
    if (so.why === 'current') return T('e.fm.why.current');
    //: anything else is the equilibrium half's own failure string, which is
    //: already a sentence — passed through rather than re-worded
    return so.why;
  }

  /**
   * Which match radius carries the worst residual, and in which channel.
   *
   * ★A max residual that failed says only「有一个地方没匹配上」, and the
   * three things a reader would then do — move the radii, drop a channel,
   * widen the probe — are three different answers depending on WHICH place
   * it was.  So the verdict names it.
   */
  function worstRadius(fm) {
    var best = -1, bw = -1, ch = '';
    (fm.relE || []).forEach(function (v, i) {
      if (Math.abs(v) > bw) { bw = Math.abs(v); best = i; ch = 'e'; }
    });
    (fm.relI || []).forEach(function (v, i) {
      if (Math.abs(v) > bw) { bw = Math.abs(v); best = i; ch = 'i'; }
    });
    if (best < 0) return '—';
    return T(ch === 'e' ? 'e.fm.where.e' : 'e.fm.where.i',
             { rho: f(fm.rhoN[best], 3), res: (100 * bw).toFixed(2) });
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
                  //: ★T-C13 — the matcher's four.  Each one changes the
                  //: ANSWER and not only the cost: the tolerance is what
                  //: 「收敛」 means, the probe step is the finite difference
                  //: the Jacobian is built from, and the clamp decides
                  //: whether a Newton step may leap out of the region where
                  //: the turbulent model has an unstable mode at all.
                  'fmiter', 'fmtol', 'fmdx', 'fmdxmax', 'fmrhomin',
                  //: T-C14：外环的两个。一轮与五轮是**两次不同的运行**，
                  //: 所以它们和其余控件一样进会话文件
                  'fmouter', 'fmotol', 'fmorlx',
                  //: T-C20：杂质输运与杂质加料。冻住的杂质与会动的杂质是
                  //: 两次不同的运行
                  'dchiz', 'pinchz', 'zfuel',
                  //: T-C16：开关与两个增益。开着与关着是两次不同的运行
                  'ipctl', 'ipkp', 'ipki',
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
                'wave', 'wavepower', 'wavevloop', 'wavefuel', 'waveip', 'quasi',
                'couplefixed', 'beam', 'beamorbit', 'lh',
                //: T-M4 — a run whose edge was solved and one whose edge
                //: was a slider are different runs
                'pedestal'];
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
            //: ★★T-C20：成分在演化时 Z_eff 是**结果**，而且是逐面的——两种
            //: 离子扩散得不一样，一条平的 Z_eff 就是在报告没人解过的成分。
            //: `solved` 分开写，因为「滑杆那个数铺平」与「解出来的剖面」是
            //: 两句话，而它们的数组长得一模一样。
            'fylite:z_eff_solved': !!last.zeffSolved,
            'fylite:z_eff_profile': last.zeffProfile
              ? sig(last.zeffProfile, 12) : null,
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
        //: T-M4 — the boundary each step ran under, when the model set it
        if (last.pedestal) sm['fylite:t_ped'] = col('pedTPed');

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
        //: ★T-M4: the pedestal record — the ten EPED inputs and the full
        //: eighteen-output answer at 12 significant digits, so the gate's
        //: oracle can re-call `kernel.eped1nn` at exactly these numbers,
        //: plus which solution was APPLIED (index 0, dmagGH/sol0 — the
        //: standard EPED1 prediction) and the T_ped the march's edge took.
        if (last.pedestal) {
          var pd = last.pedestal;
          doc['fylite:pedestal'] = {
            'fylite:model': 'eped1nn',
            'fylite:source':
              'Snyder PoP 16 056118 (2009); Meneghini NF 57 086034 (2017);'
              + ' EPEDNN.jl (Apache-2.0)',
            'fylite:inputs': {
              'fylite:a': sig([pd.inputs.a], 12)[0],
              'fylite:beta_n': sig([pd.inputs.betan], 12)[0],
              'fylite:b_t': sig([pd.inputs.bt], 12)[0],
              'fylite:delta': sig([pd.inputs.delta], 12)[0],
              'fylite:ip_ma': sig([pd.inputs.ip], 12)[0],
              'fylite:kappa': sig([pd.inputs.kappa], 12)[0],
              'fylite:mass': pd.inputs.mass,
              'fylite:neped_1e19': sig([pd.inputs.neped], 12)[0],
              'fylite:r_major': sig([pd.inputs.r], 12)[0],
              'fylite:zeff_ped': sig([pd.inputs.zeffped], 12)[0],
            },
            'fylite:p_ped': sig(pd.pPedAll, 12),
            'fylite:width': sig(pd.widthAll, 12),
            'fylite:applied': {
              'fylite:solution': 'dmagGH/sol0',
              'fylite:p_ped': sig([pd.pPed], 12)[0],
              'fylite:width': sig([pd.width], 12)[0],
              'fylite:t_ped': sig([pd.tPed], 12)[0],
            },
            'fylite:extrapolation': pd.extrapolation,
            'fylite:worst_input': pd.worstInput,
          };
        }
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
            //: ★`shinethrough`, not `shinethrough_fraction`.  This block
            //: wrote the second spelling while the per-component block six
            //: lines down wrote the first, and `fyo.py`'s beam globals wrote
            //: the first too — one quantity, two names, and a reader of
            //: either document looking for the other simply found nothing.
            'fylite:shinethrough': bm.shinethrough,
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
        //: ★★T-C14: the stationary outer loop's own record — every round's
        //: two convergence numbers, the axis q it reached, the current the
        //: steady solve produced beside the one that was asked for, and
        //: whether a sawtooth fired.  ★`equilibrium_rounds: 0` is written
        //: out rather than omitted: the geometry did NOT take part, and a
        //: reader must not have to infer that from a missing key.
        if (last.stationary) {
          var so = last.stationary;
          doc['fylite:stationary'] = {
            'fylite:converged': so.converged,
            'fylite:why': so.why || null,
            'fylite:tolerance': so.tolerance,
            'fylite:max_rounds': so.maxRounds,
            'fylite:equilibrium_rounds': so.equilibriumRounds,
            'fylite:equilibrium_why': so.equilibriumWhy,
            'fylite:rounds': (so.rounds || []).map(function (r) {
              return { 'fylite:round': r.round,
                       'fylite:d_pressure': r.dPressure,
                       'fylite:d_q': isFinite(r.dQ) ? r.dQ : null,
                       'fylite:q_axis': r.q0,
                       'fylite:i_p': r.ip,
                       'fylite:i_p_requested': r.ipRequested,
                       //: ★步 4 解出来的环电压与它有没有被读者的量程截断
                       'fylite:v_loop': r.vLoop === undefined ? null : r.vLoop,
                       'fylite:v_loop_clamped': !!r.vLoopClamped,
                       'fylite:match_iterations': r.matchIterations,
                       'fylite:match_worst': r.matchWorst,
                       //: ★步 6 的账；跳过时写理由而不是省掉这个键
                       'fylite:equilibrium': r.equilibrium
                         ? { 'fylite:a_before': r.equilibrium.aOld,
                             'fylite:a_after': r.equilibrium.aNew,
                             'fylite:beta0': r.equilibrium.beta0,
                             'fylite:beta_p_target': r.equilibrium.bpTarget,
                             'fylite:beta_p_equilibrium': r.equilibrium.bpEq,
                             //: ★★哪一个电流：这一步解的是**梯子携带的**那个，
                             //: 不是滑杆上的（两者不同就是极限环）
                             'fylite:i_p_used': r.equilibrium.ipUsed }
                         : null,
                       'fylite:equilibrium_skipped':
                         r.equilibriumSkipped || null,
                       'fylite:sawtooth': r.sawtooth
                         ? { 'fylite:r_1': r.sawtooth.r1,
                             'fylite:r_mix': r.sawtooth.rMix,
                             'fylite:refused': r.sawtooth.refused || null }
                         : null };
            }),
          };
          //: ★★T-C14〔五〕 — AND THE STEADY-CURRENT STEP'S OWN INPUTS, on
          //: the same terms as the beam's and the wave's: everything
          //: `solve_core(dt = inf, channels = {current})` was handed, at 12
          //: significant digits, so the assembly layer can redo the SAME
          //: solve and the two hosts can be held against each other.  A file
          //: carrying only the answer could not be held to〔五〕 at all.
          //: ★The two coefficients are the closure's OWN last pass; the
          //: other host is asked to solve with THOSE, not to recompute
          //: them, because「同一个解」 and「同一条闭包」 are two different
          //: claims and this block makes the first one.
          if (last.steady) {
            var sc = last.steady;
            doc['fylite:stationary']['fylite:steady_current'] = {
              'fylite:source': 'fylite.scenario.model.stationary.steady_current',
              'fylite:rho_tor': sig(sc.rho, 12),
              'fylite:vprime': sig(sc.vprime, 12),
              'fylite:gm3': sig(sc.gm3, 12),
              'fylite:gm2': sig(sc.gm2, 12),
              'fylite:f_pol': sig(sc.fpol, 12),
              'fylite:b0': sc.b0,
              'fylite:t_e': sig(sc.te, 12), 'fylite:t_i': sig(sc.ti, 12),
              'fylite:n_i': sig(sc.ni, 12),
              'fylite:z': Array.from(sc.z),
              'fylite:edge_n_i': Array.from(sc.edgeNi),
              'fylite:psi_in': sig(sc.psiIn, 12),
              'fylite:edge_psi': sc.edgePsi,
              'fylite:edge_psi_rate': sc.edgePsiRate,
              //: ★步长本身也进文件：这一支马**不是** `dt = inf`（那一档欧姆项
              //: 恒为零），另一宿主要拿同一个步长才谈得上同一个解
              'fylite:dt': sc.dt,
              //: ★null rather than a block of zeros when the closure never
              //: produced one — the two are different statements
              'fylite:sigma_par': sc.sigmaPar ? sig(sc.sigmaPar, 12) : null,
              'fylite:j_ni': sc.jNi ? sig(sc.jNi, 12) : null,
              'fylite:tol_steady': sc.tolSteady,
              'fylite:n_coupling': sc.nCoupling,
              //: ★★这一条是**冻结系数的伴随解**：推进档每一趟耦合都会重跑闭包，
              //: 所以上面记的 σ/j_ni 是它**最后一趟**的值，另一宿主拿它们去解会
              //: 落在一个皮卡步之外（实测 ψ 差 1.3 %、I_p 差 0.94 %）。那不是两个
              //: 求解器不一致，是**两个问题**——所以文件里给的是另一宿主真正被问到
              //: 的那个问题的答案。★运行自己用的那一条并排放着，两者的距离就是
              //: 「内层的耦合收敛了没有」。
              'fylite:psi_out': sig(sc.psiOut, 12),
              'fylite:psi_out_frozen': !!sc.frozen,
              'fylite:psi_out_run': sc.psiOutRun ? sig(sc.psiOutRun, 12) : null,
              'fylite:psi_out_frozen_gap': sc.frozenGap,
              'fylite:q': sc.q ? sig(sc.q, 12) : null,
            };
          }
        }
        //: ★★T-C16: THE I_p THE psi PROFILE CARRIES — with the three rows
        //: it was computed from, so the claim is re-derivable rather than
        //: asserted.  `I = V' gm2 (dpsi/drho) / (2 pi mu0)`; the ratio to
        //: the requested I_p is the number a feedback loop may use (the
        //: absolute one reads ~3 % low on this ladder's own quadrature and
        //: that gap does not close with resolution).
        //: ★Absent whole when the metric has no `gm2` — the analytic tier
        //: cannot state it, and a block of nulls would read as「算了但是零」.
        (function () {
          var lastRow = trace.length ? trace[trace.length - 1] : null;
          if (!lastRow || lastRow.ipPsi == null || !isFinite(lastRow.ipPsi)
              || !last.gm2) return;
          var ask = +$('ip').value * 1e3;
          doc['fylite:ip_from_psi'] = {
            'fylite:i_p': lastRow.ipPsi,
            'fylite:i_p_requested': ask,
            'fylite:ratio': ask > 0 ? lastRow.ipPsi / ask : null,
            'fylite:formula': "V' * gm2 * dpsi/drho / (4 pi^2 mu0)  "
              + "(this host's psi is TOTAL flux; the per-radian form is "
              + "/(2 pi mu0))",
            //: ★the three rows and psi, at the same 12 significant digits
            //: the rest of this file uses — a gate re-takes the derivative
            //: with its own tools and must land on the same number
            'fylite:rho_tor': sig(last.rho, 12),
            'fylite:vprime': sig(last.vprime, 12),
            'fylite:gm2': sig(last.gm2, 12),
            'fylite:psi': sig(last.psi || [], 12),
            //: ★T-C16 的回路：开着时把标定比、增益与逐步记录一起写进来。
            //: 关着时是 null——一段填了零的记录会读成「回路跑了但没动」。
            'fylite:ip_control': last.ipCtlLog && last.ipCtlLog.length
              ? { 'fylite:calibration_ratio': last.ipCtlRatio0,
                  'fylite:kp': +$('ipkp').value, 'fylite:ki': +$('ipki').value,
                  'fylite:steps': last.ipCtlLog.map(function (e) {
                    return { 'fylite:t': e.t, 'fylite:i_p': e.ip,
                             'fylite:target': e.want,
                             'fylite:relative_error': e.err,
                             'fylite:v_loop': e.vLoop };
                  }) }
              : null,
          };
        }());
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
        //: ★★T-C13 — THE MATCH, WHOLE, when this run was one.  Everything
        //: needed to re-derive the verdict from the file alone: which radii
        //: were matched, the `a/L_T` solved for at each, BOTH fluxes against
        //: BOTH targets in W/m^2, the per-iteration residual history, and
        //: the yardstick that made those residuals dimensionless.  ★A
        //: residual column without the weight that scaled it is a number
        //: nobody can check, which is why `weight_ref` and `weight_floor`
        //: travel beside it.
        if (last.fluxMatch) {
          var fmr = last.fluxMatch;
          doc['fylite:flux_match'] = {
            'fylite:converged': !!fmr.converged,
            'fylite:iterations': fmr.iterations,
            'fylite:max_iterations': +$('fmiter').value | 0,
            'fylite:flux_evaluations': fmr.evaluations,
            'fylite:worst_relative': fmr.worst,
            'fylite:tolerance_relative': fmr.tol,
            'fylite:channels': fmr.channels,
            'fylite:probe_dx': fmr.dx, 'fylite:step_clamp': fmr.dxMax,
            'fylite:weight_ref': fmr.weightRef,
            'fylite:weight_floor': fmr.weightFloor,
            'fylite:inner_boundary_rho_norm': fmr.rhoMin,
            //: ★T-C13 — the Picard split in the burn, and what it cost: the
            //: same residual re-taken at the matched point with the alpha
            //: power LIVE instead of frozen.  A split nobody quantified is
            //: indistinguishable from a modelling error, so the number
            //: travels with the answer.
            'fylite:burn_frozen': !!fmr.burnFrozen,
            'fylite:burn_self_consistency': fmr.burnCheck,
            'fylite:radii': (fmr.rhoN || []).map(function (x, i) {
              return { 'fylite:rho_tor_norm': x,
                       'fylite:rho_tor': fmr.radii[i],
                       'fylite:psi_norm': fmr.psin[i],
                       'fylite:a_over_lt_e': fmr.alte[i],
                       'fylite:a_over_lt_i': fmr.alti[i],
                       'fylite:q_e_model': fmr.fluxE[i],
                       'fylite:q_e_target': fmr.targetE[i],
                       'fylite:q_i_model': fmr.fluxI[i],
                       'fylite:q_i_target': fmr.targetI[i],
                       'fylite:residual_e': fmr.relE[i],
                       'fylite:residual_i': fmr.relI[i] };
            }),
            'fylite:history': (fmr.history || []).map(function (h) {
              return { 'fylite:iteration': h.iteration,
                       'fylite:worst_relative': h.worst,
                       'fylite:t_ped': h.tPed };
            }),
          };
        }
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

  //: ★★2026-09-01 撤下「交给反演场景」那个按钮，连同它的接线。剖面**没有变得
  //: 到不了反演页**：导出菜单里的 `profile` 与反演栏导入的是同一份文档、走同一个
  //: `apply`，撤掉的只是那一次点击。★接线一并删而不是留着空跑——`if (!el) return`
  //: 那种守着一个不存在的按钮的代码，是改坏了也没人会红的那一类。

  // --- wiring --------------------------------------------------------------

  function syncGeometry() {
    var g = $('geometry').value;
    //: ★★T-C13 — the flux-match tier answers a question with no time in it,
    //: so everything that is ABOUT time is disabled on it, in the same
    //: places the other tiers' own conditions live rather than in a block of
    //: its own: the density and current channels would each need their own
    //: matched channel and their own model flux (and this build has no
    //: particle closure — D/chi is a prescribed ratio), the momentum channel
    //: is advanced beside a march there is none of, the waveform and the
    //: continuation are functions of a clock, and the sawtooth is an event
    //: between two steps.  ★Every one of them is refused AGAIN in the
    //: worker: the page's job is to say so before the press, not instead of
    //: it.
    var fmOn = (+$('closure').value | 0) === 4;
    ['ch-density', 'ch-momentum', 'wave'].forEach(function (id) {
      var e = $(id);
      if (!e) return;
      e.disabled = fmOn;
      if (fmOn) e.checked = false;
    });
    //: ★the current channel needs <|grad rho|^2/R^2>, which four scalars do
    //: not determine.  The control is DISABLED rather than silently ignored
    //: on Miller geometry, and the note says why.
    var cur = $('ch-current');
    if (cur) {
      cur.disabled = g === 'miller' || fmOn;
      if (cur.disabled) cur.checked = false;
    }
    //: ★the sawtooth needs the CURRENT channel: with q prescribed, the
    //: trigger would fire on a profile nothing in the march can move.
    //: Disabled rather than ignored, like the current channel on Miller.
    //: ★★T-C14: **on the flux-match tier that stopped being true.** With the
    //: outer loop running (`fmouter > 1`) each round solves the steady psi
    //: and hands the crash a q profile it can actually rebuild — so the
    //: switch is live there, and only there, on this tier.  Measured: q(0)
    //: fell 0.788 → 0.683 over two rounds with nothing allowed to crash it.
    var saw = $('sawtooth');
    if (saw) {
      var fmOuterOn = fmOn && (+$('fmouter').value | 0) > 1;
      saw.disabled = fmOn ? !fmOuterOn : !on('ch-current');
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
    //: ★★★T-C20 — THE PARTICLE CHANNEL NO LONGER LOCKS THIS BOX.  It used
    //: to, and the reason given was「n_e 在演化而 Z_eff 被钉死，那是两套成分，
    //: 而这一版没有杂质输运」——which was a statement about the WIRING wearing
    //: a physics statement's clothes.  The kernel's density channel has
    //: always been per-ion; what was missing was a closure that filled the
    //: second species' D/v and a source that filled its block, and both
    //: exist now.  ★With both ions evolving the reason itself dissolves:
    //: `n_e = sum_s Z_s n_s` is quasi-neutrality's answer and **Z_eff is a
    //: RESULT**, so there are no longer two compositions to decide between.
    if (q) {
      q.disabled = !name || !(zImp > 1);
      if (q.disabled) q.checked = false;
    }
    var qOn = on('quasi');
    ['cimp', 'dtfrac'].forEach(function (id) {
      var e = $(id);
      if (e) e.disabled = qOn;
    });
    //: ★★AND Z_eff STOPS BEING AN INPUT when the composition is being solved
    //: for — it sets the STARTING mix and nothing after that.  It stays live
    //: (that starting mix is still the reader's) and the note beside the box
    //: says which of the two jobs it is doing, because a slider whose meaning
    //: changed under the reader is worse than one that is disabled.
    var zSolved = qOn && on('ch-density');
    //: T-C20：杂质自己的输运与源只有在它真的是一条道时才有意义
    ['dchiz', 'pinchz', 'zfuel'].forEach(function (id) {
      var e = $(id);
      if (e) e.disabled = !zSolved;
    });
    if (qn) {
      qn.hidden = !q || (!qOn && !q.disabled);
      if (!qn.hidden) {
        if (qOn) {
          var ze = +$('zeff').value;
          var fD = (zImp - ze) / (zImp - 1);
          qn.innerHTML = fD > 0
            ? T(zSolved ? 'm.quasi.solved' : 'm.quasi.on',
                { name: name, z: zImp,
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
    //: ★★T-M4: with the PEDESTAL MODEL on, the edge temperature is the
    //: EPED1-NN pedestal top (p_ped/(2 n_e,ped k), T_e = T_i — EPED's own
    //: convention) and the two sliders that used to set it are disabled
    //: rather than quietly ignored.  A run holding published reference
    //: profiles keeps the reference's edge — the worker states that rule.
    var pedOn = on('pedestal');
    ['edgete', 'edgeti'].forEach(function (id) {
      var e = $(id);
      if (e) e.disabled = pedOn;
    });
    var pedNote = $('pedestal-note');
    if (pedNote) {
      pedNote.hidden = !pedOn;
      if (pedOn) pedNote.innerHTML = T('e.ped.note');
    }
    //: the turbulent budget is shown only on the tiers that spend it — and
    //: the flux-match tier spends MORE of it than the marching one, because
    //: every Newton probe is a full TGLF sweep.  ★Its two march-only rows
    //: (the cadence and the under-relaxation) are withdrawn there rather
    //: than shown and ignored: the matcher has no steps to count and no
    //: previous chi to relax towards.
    var clNow = +$('closure').value | 0;
    var turb = $('turb');
    if (turb) turb.hidden = clNow !== 3 && clNow !== 4;
    ['turbmarch', 'turbmarch2'].forEach(function (id) {
      var e = $(id);
      if (e) e.hidden = clNow !== 3;
    });
    var fmBox = $('fmbox');
    if (fmBox) fmBox.hidden = clNow !== 4;
    //: ★★T-C13 — WHAT THE FLUX-MATCH TIER TAKES OVER.  The three controls
    //: below are the TIME AXIS, and this tier has none: it is a root find
    //: for the steady state, not a march to it.  Disabled rather than
    //: quietly ignored, exactly like the beam's four above.
    ['dt', 'nsteps', 'dttarget'].forEach(function (id) {
      var e = $(id);
      if (e) e.disabled = fmOn;
    });
    //: the heat channel is the one thing this tier requires, so it is
    //: forced on here rather than left for the run to refuse
    if (fmOn && $('ch-heat')) $('ch-heat').checked = true;
    var fmNote = $('fm-off');
    if (fmNote) {
      fmNote.hidden = !fmOn;
      if (fmOn) fmNote.innerHTML = T('e.fm.replaces');
    }
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
    //: ★and the alternation itself: iterating the EQUILIBRIUM around a flux
    //: match is the stationary outer loop, which is its own item and not
    //: this one — so it is disabled here rather than half-built
    if (cpl) cpl.disabled = g !== 'device' || fmOn;
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
    //: ★T-C13: and never on the flux-match tier — continuing is a statement
    //: about a clock, and a root find for the steady state has none
    if (box) {
      box.disabled = !resumeState || (+$('closure').value | 0) === 4;
      if (box.disabled) box.checked = false;
    }
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
    //: ★★T-C13 — the matcher's bill is a DIFFERENT arithmetic, so it gets a
    //: different sentence rather than a step count that means nothing here.
    //: One Newton iteration costs `n_evolve + 2` flux evaluations (two
    //: Jacobian probes, the trial and, when the backoff bites, one more) and
    //: each of those is a full TGLF sweep over the match radii — which is
    //: why the cost is quoted per ITERATION and not per step.
    if (cl === 4) {
      var it = +$('fmiter').value | 0;
      var sweep = (+$('turbnrad').value | 0) * (+$('turbnky').value | 0)
                  * 0.021;
      //: ★外环把这个代价乘上轮数：每一轮都是一次完整的匹配（外加一次
      //: 稳态电流与一次自由边界解，两者都比一遍 TGLF 便宜得多），所以报的
      //: 是「轮数 × 一次匹配」而不是一次匹配。
      var outer = Math.max(1, +$('fmouter').value | 0);
      host.innerHTML = T('e.fm.cost_note', {
        it: it, m: +$('turbnrad').value | 0, outer: outer,
        per: sweep.toFixed(1), s: (outer * it * 4 * sweep).toFixed(0) });
      return;
    }
    host.innerHTML = T('e.cost_note', { n: n,
                                        s: (n * per + eq + turb).toFixed(1),
                                        k: k > 0 ? k : '—' });
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
