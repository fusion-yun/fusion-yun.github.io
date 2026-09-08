// The EXPERIMENT-ANALYSIS scenario: one page, one worker, one run.
//
//   动理学平衡重构 reconstruction   由磁测量反推平衡，可叠压强剖面作约束
//
// ★ONE FILE PER SCENARIO, one section per part.  The parts were separate
// files while a part was a page; they are not pages any more — `scenario.js`
// gives the page a single worker, a single toolbar and a single run button,
// and these sections are what remains genuinely per-part: controls, figures,
// message handlers, file formats, redraw.
//
// Each section keeps its own IIFE.  That is not decoration: they were written
// as separate programs and every one of them has a `run`, a `draw`, an
// `inputs` and a `last`.  One shared scope would have merged those by name.
//
// The order of the sections is the ORDER THE PAGE RUNS THEM: `FyScenario`
// drives the parts in registration order, and registration happens as each
// section executes.


//: ★ONE PART, TWO BARS.  The part is declared at load — before the machines
//: arrive — because the framework collects the bars from it; the bodies below
//: still run only once a machine is in.  Registration order is RUN order, so
//: the profile bar comes first: fit the measured profile, then fit the
//: equilibrium to it.
var ANALYSIS = FyScenario.part('reconstruction', {
  lockWhileBusy: ['run', 'mcrun'] });

  //: ★★A BAR THAT PUBLISHES DOES NOT WAKE THE BAR THAT READS.  `S.publish`
  //: only writes the bus; nobody is told.  That was enough while every note
  //: about an upstream product was written during the READER's own run — but
  //: the "your upstream moved after you ran" notice is by definition drawn
  //: between two runs, and with no wake it was drawn only at times when it
  //: could not yet be true.  Measured before this was added: re-fitting the
  //: profile and waiting produced the same note, word for word, forever.
  //: One file, two bars, so the wake is a plain list rather than a change to
  //: the framework every other page shares.
  var PROFILE_WAKE = [];
  /** Call `fn` whenever the profile bar publishes a new fit. */
  function onProfilePublished(fn) { PROFILE_WAKE.push(fn); }
  function profilePublished() {
    PROFILE_WAKE.forEach(function (fn) { try { fn(); } catch (e) {} });
  }

  /**
   * `装置 #炮号 @时刻` for a figure corner, or the synthetic mark.
   *
   * ★★A FIGURE THAT DOES NOT SAY WHICH SHOT IT IS.  The filenames carried
   * device, shot and time from the moment they were written; the figures
   * carried none of the three, so a picture saved out of the page — or read
   * over someone's shoulder — was a curve with no provenance at all.  A twin
   * says 合成 instead of a shot number, because a synthetic run has no shot
   * and printing one would be a lie rather than an omission.
   */
  function stampOf(M, R, synthetic, at) {
    var dev = (M.name || M.id || 'device').toString().toUpperCase();
    if (synthetic) return dev + ' · ' + FyI18n.t('fig.stamp.synth');
    var shot = R && R.shot ? ' #' + R.shot : '';
    var t = (at !== undefined && at !== null) ? at
      : (R && R.time_s !== undefined && R.time_s !== null)
        ? (+R.time_s).toFixed(3).replace(/\.?0+$/, '') + ' s' : null;
    return dev + shot + (t ? ' @' + t : '');
  }

  /**
   * Put that stamp in the corner of every figure of one bar.
   *
   * ★TEXT, NOT PIXELS: not drawn into the canvas, so it is translated, it can
   * be selected and copied, and it stays sharp at any scale.
   *
   * ★★A CORNER OF THE FIGURE, NOT A PIECE OF THE CAPTION.  It began in the
   * caption, which reads better — and three figures came out blank, because a
   * caption is written by whoever owns it: `figcaption` elements carrying
   * `data-i18n` are re-rendered wholesale by the language sweep, and the ones
   * with ids are rewritten by their own note function.  Anything put inside
   * one is erased by the next writer.  The figure itself has no such owner.
   */
  function stampFigures(S, text) {
    S.findAll('figure').forEach(function (fig) {
      var row = fig.firstElementChild;
      if (!row || row.className !== 'figstamp-row') {
        row = document.createElement('div');
        row.className = 'figstamp-row';
        row.appendChild(document.createElement('span'));
        row.firstChild.className = 'figstamp';
        fig.insertBefore(row, fig.firstChild);
      }
      row.firstChild.textContent = text;
    });
  }

  /**
   * Say how this bar's stamp is built, and keep it in the reader's language.
   *
   * ★The stamp carries catalogue text (「合成孪生」 / 「导入的数据」), and a
   * language switch does not redraw a figure — so without this the badge stays
   * in whichever language the page was opened in, which is the one place on
   * the page where that would be invisible rather than obviously wrong.
   */
  function stampWith(S, build) {
    stampFigures(S, build());
    //: ★subscribed ONCE, not once per draw: this is called from `draw`, and a
    //: listener added on every redraw is a leak that also re-stamps N times.
    S.stampBuild = build;
    if (S.stampSubscribed) return;
    S.stampSubscribed = true;
    if (self.FyI18n && FyI18n.onChange)
      FyI18n.onChange(function () { stampFigures(S, S.stampBuild()); });
  }

  /**
   * Put the speaker's name on the page's single status line.
   *
   * ★★THREE BARS, ONE LINE, AND NO NAME ON IT (T-A13).  `scenario.js` says it
   * outright: "the page's status line only ever shows the newest message, and
   * on a scenario that runs three bars in a row that is the last one's".  Each
   * bar does have its own strip — but the strip is inside the bar, and a bar
   * can be folded, scrolled past, or simply not the one the reader is looking
   * at.  So the page line keeps its "newest message" rule and gains the one
   * thing that makes it readable: whose message it is.
   *
   * ★Wrapped here rather than in `scenario.js`: that file is the other two
   * scenarios' framework as well, and this is a decision about this page.
   * ★`setBusy` writes text and `report` writes markup — the framework draws
   * that distinction deliberately (a solve reports a sentence about numbers;
   * the file exchange reports catalogue prose with emphasis in it), so the
   * wrapper has to preserve it or half the messages arrive with their tags
   * showing.
   */
  function sayWho(S, titleKey) {
    var baseBusy = S.setBusy, baseReport = S.report;
    function stamp(text, asHtml) {
      if (text === undefined || text === null) return;
      var st = document.getElementById('analysis-status');
      if (!st) return;
      var who = document.createElement('span');
      who.className = 'who';
      who.textContent = FyI18n.t(titleKey) + ' ·';
      st.textContent = '';
      st.appendChild(who);
      if (asHtml) {
        var d = document.createElement('span');
        d.innerHTML = ' ' + text;
        st.appendChild(d);
      } else {
        st.appendChild(document.createTextNode(' ' + text));
      }
    }
    S.setBusy = function (on, text, cls) {
      baseBusy.call(S, on, text, cls); stamp(text, false);
    };
    S.report = function (msg, cls) {
      baseReport.call(S, msg, cls); stamp(msg, true);
    };
    return S;
  }

  /** Machine + shot + time, for a filename.  See the reconstruction bar. */
  function stemOf(M, R, synthetic) {
    var dev = (M.id || M.name || 'device').toString()
      .toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (synthetic) return dev + '_twin';
    var shot = R && R.shot ? String(R.shot) : 'noshot';
    var t = (!R || R.time_s === undefined || R.time_s === null) ? ''
      : '_' + (+R.time_s).toFixed(3).replace(/\.?0+$/, '') + 's';
    return dev + '_' + shot + t;
  }

// ==========================================================================
// 功能栏  profile — 剖面拟合（测量点 → p / n_e / T_e）
// ==========================================================================

// The front end the kinetic constraint never had.  Everything about WHAT a
// profile is fitted from lives here — the points, their sigmas, where they
// came from — and everything about HOW is the kernel's: shifted-Legendre
// basis, order chosen by GCV, one call.

FyScenario.whenDevices(function () {
  'use strict';

  var M = self.FYLITE_MACHINE, R = M.reference || {};
  var T = FyI18n.t;
  var last = null, source = 'file', points = null, imported = null;
  var barStem = function () { return stemOf(M, R, source === 'deck' ? false : false); };
  var barStamp = function () {
    return source === 'file'
      ? stampOf(M, R, false, null).split(' #')[0] + ' · ' + T('fig.stamp.import')
      : stampOf(M, R, false);
  };

  var S = ANALYSIS.bar('profile', {
    title: 'prof.title',
    sliders: { maxorder: 0, npts: 0, sigma: 3, pseed: 0 },
    on: { profile: onProfile, error: onError },
  });
  //: ★T-A13: the page's one status line says which bar is talking
  sayWho(S, 'prof.title');
  var $ = S.$, syncLabels = S.sync, setBusy = S.setBusy;

  function setSource(s) {
    source = s;
    $('tab-file').className = s === 'file' ? 'on' : '';
    $('tab-deck').className = s === 'deck' ? 'on' : '';
    $('deck-panel').hidden = s !== 'deck';
    $('src-note').innerHTML = s === 'file'
      ? T(imported ? 'prof.src.file' : 'prof.src.nofile',
          { name: imported && imported.name, n: imported && imported.x.length })
      : T(FyDevice.hasMeasurements(M) ? 'prof.src.deck' : 'prof.src.nodeck',
          { shot: R.shot, n: (R.pres || []).length });
    draw();
  }

  /** A gaussian stream, as the worker's — same shape, same reason. */
  function rng(seed) {
    var s0 = (seed | 0) || 1;
    return function () {
      s0 = (1103515245 * s0 + 12345) & 0x7fffffff;
      var u1 = (s0 + 1) / 2147483649;
      s0 = (1103515245 * s0 + 12345) & 0x7fffffff;
      var u2 = (s0 + 1) / 2147483649;
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };
  }

  /**
   * The points to fit.
   *
   * ★THE DECK TAB IS SYNTHETIC AND SAYS SO EVERYWHERE IT GOES.  It resamples
   * the delivered pressure profile the deck ships and adds the sigma the
   * reader set — which exercises the fit and shows what GCV does, and is NOT
   * a measurement.  The provenance travels into every file this bar writes,
   * because a resampled profile that came back as data would be this page
   * fitting its own assumption.
   */
  function buildPoints() {
    if (source === 'file') return imported;
    var pr = R.pres;
    if (!pr || !pr.length) return null;
    var n = +$('npts').value, rel = +$('sigma').value, g = rng(+$('pseed').value);
    var x = [], y = [], sg = [];
    for (var i = 0; i < n; i++) {
      var xi = i / (n - 1);
      var t = xi * (pr.length - 1), k = Math.min(pr.length - 2, Math.max(0, t | 0));
      var v = pr[k] + (t - k) * (pr[k + 1] - pr[k]);
      //: ★sigma zero is EQUAL WEIGHTS, not a tiny sigma.  The kernel reads
      //: `1/sigma` as the weight, so a floor of 1e-9 turns "no noise" into
      //: "believed to nine digits" and reports a chi^2/dof of 1e22 —
      //: arithmetically right, and a number nobody can use.
      var s = rel > 0 ? rel * Math.abs(v) : 1;
      if (!(s > 0)) s = 1;
      x.push(xi); y.push(v + (rel > 0 ? s * g() : 0)); sg.push(s);
    }
    return { x: x, y: y, sigma: sg, quantity: 'pressure',
             provenance: 'resampled-from-deck-delivered-pressure',
             name: T('prof.src.deck.name', { shot: R.shot }) };
  }

  function draw() {
    //: ★T-A10: every figure of this bar says which shot it is about.  The
    //: resampled tab reads the deck's own delivered profile at the reference
    //: time, so it carries the shot; imported points carry no shot at all and
    //: say so rather than borrowing one.
    stampWith(S, barStamp);
    var col = FyPlot.palette($('fit'));
    var p = points, series = [];
    if (p && p.x.length)
      series.push({ x: p.x, y: p.y, color: col.accent, kind: 'dots', radius: 3,
                    label: T('prof.ser.points') });
    if (last && last.curve)
      series.push({ x: Array.from(last.x), y: Array.from(last.curve),
                    color: col.lcfs, width: 2, label: T('prof.ser.fit') });
    if (!series.length) series.push({ x: [0, 1], y: [0, 0], color: col.grid });
    FyPlot.xy($('fit'), { series: series, xlabel: T('recon.axis.x'),
                          ylabel: quantityLabel(), zeroLine: true,
                          xmin: 0, xmax: 1 });
    var g = last && last.sweep;
    FyPlot.xy($('gcv'), {
      series: g && g.length
        ? [{ x: g.map(function (r) { return r.order; }),
             y: g.map(function (r) { return r.gcv; }),
             color: col.accent, kind: 'dots', radius: 4,
             label: T('prof.ser.gcv') }]
        : [{ x: [0, 1], y: [0, 0], color: col.grid }],
      xlabel: T('prof.axis.order'), ylabel: T('prof.axis.gcv') });
    drawTable();
  }

  function quantityLabel() {
    var q = $('quantity').value;
    return T('prof.axis.' + q);
  }

  function drawTable() {
    var body = $('scalars');
    if (!body) return;
    if (!last) { body.innerHTML = ''; $('note').innerHTML =
      T(points ? 'prof.ready' : 'prof.nopoints'); return; }
    var row = function (k, v) {
      return '<tr><td>' + k + '</td><td class="num">' + v + '</td></tr>';
    };
    var html = '';
    html += row(T('prof.row.order'), last.order);
    html += row(T('prof.row.npts'), last.n);
    html += row(T('prof.row.chi2'), last.chi2PerDof.toPrecision(4));
    html += row(T('prof.row.rss'), last.rss.toExponential(3));
    html += row(T('prof.row.axis'), last.curve[0].toPrecision(5));
    html += row(T('prof.row.edge'),
                last.curve[last.curve.length - 1].toPrecision(5));
    body.innerHTML = html;
    //: ★the sweep is reported as a SHAPE, not only as a winner: an order
    //: chosen over a flat GCV curve is a coin toss, and the reader is the
    //: one who has to know that
    var sw = last.sweep || [], spread = '—';
    if (sw.length > 1) {
      var lo = Math.min.apply(null, sw.map(function (r) { return r.gcv; }));
      var hi = Math.max.apply(null, sw.map(function (r) { return r.gcv; }));
      spread = lo > 0 ? (hi / lo).toPrecision(3) : '—';
    }
    $('note').innerHTML = T('prof.note', {
      order: last.order, spread: spread, ms: last.ms,
      prov: points && points.provenance ? points.provenance : '—' });
  }

  function onProfile(m) {
    last = m;
    draw();
    S.progress(1);
    setBusy(false, T('prof.done', { order: m.order,
                                    chi2: m.chi2PerDof.toPrecision(3),
                                    ms: m.ms }));
    //: ★PUBLISHED AS A BUILDER, so the equilibrium bar takes the profile as
    //: it stands when it runs rather than one that went stale two slider
    //: moves ago
    //: ★stamped with the moment it was FITTED, not the moment it is taken:
    //: the downstream bar has to be able to tell "the profile I used" from
    //: "the profile that is there now", and a timestamp made at take-time
    //: would always say now.
    var at = Date.now();
    S.publish(function () {
      return { quantity: m.quantity, x: Array.from(m.x),
               value: Array.from(m.curve), order: m.order,
               chi2PerDof: m.chi2PerDof, at: at,
               provenance: points && points.provenance
                 ? points.provenance : 'imported-points' };
    });
    //: ★and TELL the bar that reads that bus.  Publishing is silent; the
    //: equilibrium bar's "the profile moved under you" notice can only be
    //: drawn if something draws it.
    profilePublished();
  }

  function onError(m) {
    setBusy(false, T('prof.failed', { why: m.message }), 'err');
    S.progress(0);
  }

  function run() {
    if (S.isBusy()) return;
    points = buildPoints();
    if (!points || !points.x.length) {
      setBusy(false, T('prof.nopoints'), 'warn');
      draw();
      return;
    }
    setBusy(true, T('prof.running', { n: points.x.length }));
    S.progress(0.5);
    S.send({ cmd: 'profile_fit', x: points.x, y: points.y,
             sigma: points.sigma, maxOrder: +$('maxorder').value,
             quantity: $('quantity').value });
    return S.settle('profile');
  }

  var FORMATS = {
    points: {
      docPage: 'profile_points', docKey: 'fylite:points',
      label: T('prof.label.points'),
      filename: function () { return barStem() + '_profile_points.json'; },
      accept: '.json,application/json',
      exportHint: T('prof.export_hint'), importHint: T('prof.import_hint'),
      build: function () {
        if (!points) return { error: T('prof.nopoints') };
        var doc = FySession.envelope('profile_points', {}, S.kernel());
        doc['fylite:points'] = {
          'fylite:psi_norm': FySession.sig(points.x, 7),
          'fylite:value': FySession.sig(points.y, 7),
          'fylite:sigma': FySession.sig(points.sigma, 7),
          'fylite:quantity': points.quantity || $('quantity').value,
        };
        doc['fylite:provenance'] = points.provenance || 'imported-points';
        return JSON.stringify(doc, null, 1);
      },
      apply: function (text, name) {
        var doc = FySession.parse(text, { config: false });
        var p = doc['fylite:points'];
        if (!p || !p['fylite:value'] || !p['fylite:value'].length)
          throw new Error(T('prof.no_points'));
        var x = p['fylite:psi_norm'], y = p['fylite:value'];
        var sg = p['fylite:sigma'];
        if (!x || x.length !== y.length) throw new Error(T('prof.bad_points'));
        imported = { x: x.slice(), y: y.slice(),
                     //: ★no sigma means EQUAL weights, and it is said out
                     //: loud: inventing one per point would be inventing the
                     //: very thing the order selection is driven by
                     sigma: (sg && sg.length === y.length) ? sg.slice()
                       : y.map(function (v) { return Math.abs(v) || 1; }),
                     quantity: p['fylite:quantity'] || 'pressure',
                     provenance: doc['fylite:provenance'] || 'imported-points',
                     name: name, noSigma: !(sg && sg.length === y.length) };
        if (imported.quantity && $('quantity'))
          $('quantity').value = imported.quantity;
        setSource('file');
        return T('prof.imported', { name: name, n: y.length,
          sig: T(imported.noSigma ? 'prof.nosigma' : 'prof.withsigma') });
      },
    },
    profile: {
      //: what the RECONSTRUCTION bar reads — the same document it has always
      //: read, now with a producer on the same page
      docPage: 'profile', docKey: 'fylite:pressure', exportOnly: true,
      label: T('prof.label.profile'),
      filename: function () { return barStem() + '_profile_fit.json'; },
      accept: '.json,application/json',
      exportHint: T('prof.export_hint2'),
      build: function () {
        if (!last) return { error: T('prof.nofit') };
        var doc = FySession.envelope('profile', {}, S.kernel());
        doc['fylite:pressure'] = FySession.sig(last.curve, 7);
        doc['fylite:pressure_grid'] = 'uniform_psi_normalised';
        doc['fylite:quantity'] = last.quantity;
        doc['fylite:fit'] = {
          'fylite:order': last.order,
          'fylite:order_chosen_by': 'gcv',
          'fylite:chi2_per_dof': last.chi2PerDof,
          'fylite:points': last.n,
          'fylite:basis': 'shifted-legendre',
        };
        doc['fylite:provenance'] = points && points.provenance
          ? points.provenance : 'imported-points';
        return JSON.stringify(doc, null, 1);
      },
    },
  };
  S.formats(FORMATS);

  ['maxorder', 'npts', 'sigma', 'pseed'].forEach(function (k) {
    $(k).addEventListener('input', syncLabels);
  });
  $('tab-file').addEventListener('click', function () { setSource('file'); });
  $('tab-deck').addEventListener('click', function () { setSource('deck'); });
  $('quantity').addEventListener('change', draw);
  S.onRun(run);
  S.onRefresh(function () { setSource(source); });
  syncLabels();
  setSource(FyDevice.hasMeasurements(M) ? 'deck' : 'file');
});

// ==========================================================================
// 功能栏  reconstruction — 动理学平衡重构
// ==========================================================================

// Kinetic-equilibrium-reconstruction page controller.

//: ★DECLARED HERE, RUN AFTER THE MACHINES ARRIVE.  The preset devices are
//: fetched documents now, so `self.FYLITE_MACHINE` is null while this file is
//: being evaluated — and this body reads the machine on its first line.  It is
//: the framework that knows when the machines are in, so it is the framework
//: that calls this.
FyScenario.whenDevices(function () {
  'use strict';

  var M = self.FYLITE_MACHINE, R = M.reference || {};
  var T = FyI18n.t;
  //: ★The deck's own flux-loop fit weights, taken BEFORE anything can replace
  //: the reference discharge.  They are the machine's (`fitweight.dat`), not
  //: the shot's, so a live slice from another shot must keep them — and it
  //: cannot read them back out of `R` afterwards, because taking a live slice
  //: empties `R` first.  See `FyRecon.useMeasurements`.
  var DECK_LOOP_W = (R.loopWeights || []).slice();
  //: reconstruction needs a vacuum field, and the vacuum field needs a coil
  //: set.  A device described without a reference discharge simply does not
  //: have one — the page says so rather than fitting against zeros.
  var HAS_REF = self.FyDevice.hasReference(M);
  var COILS = HAS_REF ? R.aturns : new Array(M.channels.length).fill(0);
  var last = null, source = 'real', posterior = null;
  //: ★★TWO CHANNEL BASES, AND THEY MUST NOT BE MIXED.  This deck now carries
  //: both: `loopMeas` is the DELIVERED reconstruction's own channel values
  //: (another code's answer, coils already removed) while `probeMeas`,
  //: `loopMeasTotal` and the POINT block are RAW est2 readings.  Fitting the
  //: delivered loops together with raw probes asks one solution to satisfy
  //: two different statements about the same shot — measured here: the solve
  //: fails outright.  So the reader picks a basis and the page fits inside it.
  var basis = 'delivered';
  //: which slice is on screen, when it is not the deck's reference one
  var sliceOn = null;
  //: ★★WHICH LIVE SLICE IS LOADED, AND WHO WANTS TO KNOW HOW IT WENT (T-A21).
  //: A shot read off the tree is fitted slice by slice and the slices do NOT
  //: all converge — measured on #165704: 2.083 s fits, 3.933 s and 5.968 s do
  //: not.  That is a fact about the discharge, so it belongs on the picker
  //: beside the slice it is about; the bar owns the verdict and the source
  //: panel owns the picker, and this is the seam between them.  Only a LIVE
  //: slice is reported: a run on the bundled shot or on the twin is not a
  //: statement about any stored slice.
  var liveAt = null, outcomeFns = [];
  function emitOutcome(ok, extra) {
    if (!liveAt || !R['fylite:live']) return;
    var ev = { shot: liveAt.shot, index: liveAt.index, time: liveAt.time,
               ok: !!ok };
    Object.keys(extra || {}).forEach(function (k) { ev[k] = extra[k]; });
    outcomeFns.forEach(function (fn) {
      try { fn(ev); } catch (e) { /* a listener must not break the run */ }
    });
  }
  //: ★which Ip the request that is in flight ASKED for, stamped where the
  //: message is built.  The answer says which one it GOT (`onRecon`), and the
  //: session file writes that one — see `jsonDoc`.
  var ipAsked = null;
  //: ★★A RUN YOU CANNOT COMPARE IS A RUN YOU HAVE TO REMEMBER.  Every question
  //: on this page is really "what did that change" — the mask, the weight, the
  //: basis, the slice — and the answer used to live in the reader's short-term
  //: memory between two presses of the run key.  A pinned run stays on the
  //: figures and in the table until it is let go.
  var pinned = null;
  //: the last run's failure, until a run succeeds — see `drawVerdict`
  var failed = null;
  //: ★THE READER'S OWN LAYER over the deck's weights: `null` means "as the
  //: deck says", and a channel is only ever switched OFF here — a table that
  //: could switch a deck-disowned channel back on would be overruling a
  //: calibration decision with a checkbox.
  var loopOff = {}, probeOff = {}, chanTab = 'loop', chanSort = 'wresid';
  //: ★★★THE READER'S OWN LAYER, in two parts (2026-08-31, ruling: preset =
  //: deck AND the shot's live gate, with the disagreement visible).
  //:
  //: `*Sig` is a per-channel sigma MULTIPLIER — the fit reads `w ∝ 1/σ`, so
  //: 2.0 says "I trust this channel half as much".  Absent = 1.0 = as the
  //: deck says; it multiplies the machine's weight rather than replacing it,
  //: which is the same rule the worker's `loopScale` was written for.
  //:
  //: `*On` FORCES a deck-disowned channel back in.  It used to be
  //: impossible on purpose — "a table that could switch a deck-disowned
  //: channel back on would be overruling a calibration decision with a
  //: checkbox" — and that argument is about VISIBILITY, not about the act:
  //: measured on #137985, the deck fits 21 of 79 probes while the shot's own
  //: live gate passes 37, and 17 of those are channels this machine's EFIT
  //: simply never fits.  Hiding them makes the disagreement invisible;
  //: showing them, marked, makes it a decision someone made.
  var loopSig = {}, probeSig = {}, loopOn = {}, probeOn = {};
  var importedPressure = null, importedIp = null, refCase = null;
  //: ★★THE DELIVERED RECONSTRUCTION AS CURVES, not as six scalars.  It was
  //: already in the third column of the table; what a reader actually does
  //: on a shot day is look at where the two q profiles part company, and
  //: that picture did not exist.  The deck carries its own (EAST ships the
  //: converted g-file's 1-D profiles and boundary); an imported g-file
  //: replaces it, because a reader who hands one over means that one.
  var deckRef = (R.delivered && R.delivered.q) ? R.delivered : null;
  var refCurves = deckRef;

  /** The deck's delivered reconstruction as the table's third column. */
  function deckRefCase() {
    if (!deckRef) return null;
    var q = deckRef.q, x = deckRef.psi_norm;
    var qAt = function (v) {
      for (var i = 1; i < x.length; i++)
        if (x[i] >= v) return q[i - 1] + (v - x[i - 1]) / (x[i] - x[i - 1]) *
                               (q[i] - q[i - 1]);
      return q[q.length - 1];
    };
    return { name: T('recon.col.deckref'), fromDeck: true,
             q0: q[0], q95: qAt(0.95), ip: Math.abs(deckRef.ip || 0),
             axisR: deckRef.axis ? deckRef.axis.r : NaN,
             axisZ: deckRef.axis ? deckRef.axis.z : NaN,
             p0: deckRef.pressure ? deckRef.pressure[0] : NaN,
             //: ★no li(3): it is an integral over the psi MAP and the deck
             //: carries the delivered profiles, not the map.  A number
             //: computed from the fit's own map and put in the reference
             //: column would be the fit comparing itself with itself.
             li3: NaN };
  }
  var importedDensity = null;
  var refProbes = (R.probeMeas && R.probeMeas.length === (M.probes || []).length)
    ? R.probeMeas.slice() : [];
  var refProbeSource = refProbes.length ? 'deck' : null;
  //: the point diagnostics' MEASURED side.  The device document carries
  //: where the eleven chords look, never what they read — so these stay
  //: empty until a file arrives, and the twin makes its own.
  //: ★SEEDED FROM THE DECK when the deck has readings.  EAST's document now
  //: carries the raw est2 reduction of its 79 probes and 11 POINT chords at
  //: the reference time, so both channels are fittable on arrival — no file
  //: to find first.  A machine without them stays empty and says so.
  var deckPoint = (R.point && R.point.n_e_line19) ? R.point : null;
  var refPoint = deckPoint
    ? { nel: R.point.n_e_line19.map(function (v) { return v * 1e19; }),
        bpolar: R.point.bpolar.slice(),
        weightNel: R.point.weight_nel.slice(),
        weightPol: R.point.weight_pol.slice(),
        source: 'deck' }
    : { nel: null, faraday: null };
  //: non-thermal pressure profiles, only ever from a file — the page will
  //: parametrise a fast-ion SHAPE, and never a rotation one (it has no
  //: channel for omega or the mass density)
  var importedFast = null, importedRot = null;
  //: the deck's delivered reconstruction is the reference column until a
  //: reader hands over one of their own
  refCase = deckRefCase();
  var SLIDERS = ['ip', 'beta0', 'emp', 'enp', 'noise', 'seed', 'kpts', 'kw',
                 'knoise', 'warmup', 'maxit', 'mcn', 'ne0', 'nepk', 'zeff',
                 'probew', 'outk', 'mcloops', 'mccoils',
                 //: T-A5 — the two sigmas the coil fit needs
                 'coilsig', 'loopsig',
                 'farw', 'farit', 'pointnoise', 'caltol',
                 'vridge', 'vit', 'vinject', 'vminsurv',
                 'tite', 'pfast', 'pfastpk',
                 //: T-A9 — the outer loop's two knobs
                 'closit', 'clostol'];

  var S = ANALYSIS.bar('reconstruction', {
    title: 'recon.bar',
    sliders: { ip: 0, beta0: 2, emp: 2, enp: 2, noise: 3, seed: 0, kpts: 0,
               kw: 3, knoise: 3, warmup: 0, maxit: 0, mcn: 0,
               ne0: 1, nepk: 2, zeff: 1, probew: 2, outk: 1,
               mcloops: 3, mccoils: 3, coilsig: 3, loopsig: 3,
               farw: 2, farit: 0, pointnoise: 3,
               caltol: 2, vridge: 3, vit: 0, vinject: 1, vminsurv: 2,
               tite: 2, pfast: 2, pfastpk: 1,
               closit: 0, clostol: 3 },
    on: {
      ready: onReady, error: onError, recon: onRecon, recon_mc: onPosterior },
  });
  //: ★T-A13: the page's one status line says which bar is talking
  sayWho(S, 'recon.bar');
  var $ = S.$, syncLabels = S.sync, setBusy = S.setBusy;
  function grid() { return S.kernel() ? S.kernel().grid : null; }

  /** Which channel values this fit is being given, said in one line. */
  function drawBasis() {
    var el = $('basis-note'), ctl = $('basis-ctl');
    if (ctl) ctl.style.display = source === 'twin' ? 'none' : '';
    if (!el) return;
    if (source === 'twin') { el.innerHTML = ''; return; }
    var prov = R['fylite:channel_provenance'] || {};
    var ipc = ipConstraint();
    el.innerHTML = T(basis === 'raw' ? 'recon.basis.raw' : 'recon.basis.delivered',
                     { loops: M.loops.length,
                       probes: (R.probeMeas || []).length,
                       chords: R.point ? R.point.n_e_line19.length : 0,
                       prov: prov.loopMeas || '' })
      //: ★Ip is a channel of this basis too, so it is named in the same
      //: breath as the loops rather than left to be guessed
      + ' ' + T('recon.basis.ip.' + ipc.source,
                { ip: (ipc.value / 1e3).toFixed(1) });
  }

  function setSource(s) {
    source = s;
    $('tab-real').className = s === 'real' ? 'on' : '';
    $('tab-twin').className = s === 'twin' ? 'on' : '';
    $('twin-panel').hidden = s !== 'twin';
    //: ★A LIVE SLICE IS NOT THE BUNDLED ONE, and the sentence that describes
    //: the bundled one says its coil share has been subtracted — which is
    //: false of anything read off the tree, because a delivered reconstruction
    //: is what does that subtracting and an arbitrary shot has none.  Two
    //: sentences, chosen by where the numbers came from.
    $('src-note').innerHTML = s === 'real'
      ? T(R['fylite:live'] ? 'recon.src.live' : 'recon.src.real',
          { device: M.name, shot: R.shot,
            time: (+R.time_s).toFixed(3).replace(/\.?0+$/, ''),
            n: M.loops.length, ip: (R.ip / 1e3).toFixed(1) })
      : T('recon.src.twin', { n: M.loops.length });
    drawKineticSource();
    //: scoped to this tool's own section — several tools share the page
    var showRef = s === 'twin' || !!refCase;
    S.findAll('.ref-col').forEach(function (el) {
      el.style.display = showRef ? '' : 'none';
    });
    var th = $('th-ref');
    if (th) th.setAttribute('data-i18n',
                            s === 'twin' ? 'recon.col.truth' : 'recon.col.ref');
    if (th) FyI18n.applyDom(th.parentNode);
    drawBasis();
    drawAll();
  }

  /**
   * Where the pressure rows come from, said on every draw.
   *
   * ★It moves: an imported file, the profile bar's latest fit, the deck's
   * delivered profile, or the twin's own truth — and which of the four it is
   * decides what the fit MEANS.  A note written once at load would go stale
   * the first time the other bar ran.
   */
  function drawKineticSource() {
    var el = $('kin-note');
    if (!el || importedPressure) return;   // the import writes its own note
    var cur = S.take('profile');
    var fp = fittedPressure();
    //: ★★AN UPSTREAM THAT MOVED AFTER YOU RAN.  The profile bar can be
    //: re-fitted at any time, and the equilibrium on screen was made with
    //: whichever profile existed when its run started.  Saying so is the
    //: difference between a stale number and a wrong one.
    var stale = !!(last && cur && cur.at && last.profileAt &&
                   cur.at > last.profileAt);
    el.innerHTML = (fp ? T('recon.kin.frombar', { n: fp.length })
      : source === 'real' ? T('recon.kin.real') : T('recon.kin.twin'))
      + (stale ? ' ' + T('recon.kin.stale') : '');
  }

  //: ★the wake this note needs: the profile bar publishing is the only event
  //: that can make the line above become true, and it happens while this bar
  //: is doing nothing at all.
  onProfilePublished(drawKineticSource);

  // --- drawing --------------------------------------------------------------

  /**
   * The POINT sight lines, as segments in the machine's own coordinates.
   *
   * ★The deck gives each chord a first point and a tilt; the far end is the
   * same 2.2 m the forward model integrates along, so what is drawn is the
   * line the integral is taken over — not a decoration placed near it.
   * ★A chord the reduction gated out is drawn faint and dashed: it is still
   * a beam, it is just not evidence.
   */
  /** `{r, z}` as the flat [r0,z0,r1,z1,…] the cross-section draws. */
  function flatOutline(b) {
    var out = new Float64Array(2 * b.r.length);
    for (var i = 0; i < b.r.length; i++) { out[2 * i] = b.r[i]; out[2 * i + 1] = b.z[i]; }
    return out;
  }

  /**
   * The stem every file this scenario writes is named after.
   *
   * ★★A FIXED FILENAME IS A COLLISION.  `g_fylite_recon.00000` and
   * `fylite_magnetics.json` were the same two names for every shot, every
   * time slice and every setting — save two runs into one directory and the
   * browser appends `(1)`, which is the only record of which is which.  The
   * stem carries the machine, the shot and the time because those are what
   * a reader has to tell apart; the twin says it is a twin, because a
   * synthetic run filed under a shot number is worse than an unnamed one.
   */
  function fileStem() { return stemOf(M, R, source === 'twin'); }

  function chordLines() {
    var pt = M.point;
    if (!pt || !pt.interferometer) return null;
    var w = refPoint.weightNel, g = M.grid;
    return pt.interferometer.map(function (c, i) {
      var fp = c.first_point || {}, th = c['fylite:theta'] || 0;
      var L = 2.2, dr = -Math.cos(th), dz = Math.sin(th);
      //: ★clipped to the COMPUTATIONAL BOX, because that is where the
      //: integral has values: the sight line continues to the far wall, but
      //: everything the page says about it stops at the grid edge.  Drawing
      //: the untruncated line would put the eye somewhere the numbers do not
      //: come from.
      var t0 = 0, t1 = L;
      if (dr !== 0) {
        var a = (g.rmax - fp.r) / dr, b = (g.rmin - fp.r) / dr;
        t0 = Math.max(t0, Math.min(a, b));
        t1 = Math.min(t1, Math.max(a, b));
      }
      if (t1 < t0) t1 = t0;
      return { r0: fp.r + t0 * dr, z0: fp.z + t0 * dz,
               r1: fp.r + t1 * dr, z1: fp.z + t1 * dz,
               weight: w ? w[i] : 1 };
    });
  }

  function residColor(i) {
    var col = FyPlot.palette($('cross'));
    if (!last || !last.wts || !last.wts[i]) return col.muted;
    var d = Math.abs(last.model[i] - last.meas[i]);
    var t = Math.min(1, d / (0.02 * (last.measAmp || 1)));
    return 'rgb(' + Math.round(60 + 195 * t) + ',' +
           Math.round(150 - 100 * t) + ',' + Math.round(120 - 60 * t) + ')';
  }
  function loopUsed(i) { return !last || !last.wts ? true : !!last.wts[i]; }

  function drawAll() {
    //: ★T-A10: `装置 #炮号 @时刻` on every figure, and the twin says 合成
    //: instead of a shot number — a synthetic run has no shot, and printing
    //: one would be a lie rather than an omission.  The picked slice's own
    //: moment wins over the deck's reference time, because that is the
    //: moment on screen.
    stampWith(S, function () {
      //: ★T-A17: the stamp describes the ANSWER on screen — a picked slice
      //: brings its own provenance, so a synthetic pick says 合成 even when
      //: the bar's tab is 实测, and a deck pick keeps its shot number even
      //: when the tab is 孪生.
      var synth = sliceOn ? !!sliceOn.synthetic : source === 'twin';
      return stampOf(M, R, synth, sliceOn ? sliceOn.label : null);
    });
    var col = FyPlot.palette($('cross'));
    var legend = [
      { label: T('recon.leg.lcfs'), color: col.lcfs, kind: 'line', width: 2 },
      { label: T('recon.leg.axis'), color: col.fg, kind: 'plus' },
      { label: T('recon.leg.chord'), color: col.accent, kind: 'line', width: 1.5 },
      { label: T('recon.leg.loop'), color: col.muted, kind: 'square' },
      { label: T('recon.leg.unused'), color: col.muted, kind: 'square', hollow: true },
    ];
    //: ★ONE dashed outline, and the legend says which of the two it is: a
    //: twin's truth and somebody else's reconstruction do not carry the same
    //: authority, and on this frame they look identical.
    if (last && last.truth)
      legend.splice(1, 0, { label: T('recon.leg.truth'), color: col.alt, kind: 'line',
                            dash: [5, 3], width: 2 });
    else if (refCurves && refCurves.boundary)
      legend.splice(1, 0, { label: T('recon.leg.delivered'), color: col.alt,
                            kind: 'line', dash: [5, 3], width: 2 });
    S.cross(last && last.result, {
      //: ★on a real shot the dashed outline is the DELIVERED boundary; on a
      //: twin it is the twin's own truth.  Never both — two dashed curves of
      //: different standing on one frame is a picture nobody can read.
      reference: last && last.truth ? last.truth.lcfs
        : (refCurves && refCurves.boundary ? flatOutline(refCurves.boundary)
                                           : null),
      loops: M.loops, loopColor: residColor, loopUsed: loopUsed,
      chords: chordLines(), chordColor: col.chord || col.accent,
      legend: true, legendItems: legend,
    });
    drawProfiles();
    drawBootstrap();
    drawProbes();
    drawPoint();
    drawLoops();
    drawTables();
    drawKineticSource();
    drawVerdict();
    drawPinNote();
    drawPointNote();
    drawProbeFitNote();
    drawCoilFitNote();
    drawVesselNote();
    drawDecompNote();
    drawChannels();
    drawPosterior();
  }

  function drawProfiles() {
    var col = FyPlot.palette($('pres'));
    var fit = last && last.profiles, tru = last && last.truthProfiles;
    function panel(id, xs, ys, txs, tys, ylabel, xmax, band, rx, ry, px, py) {
      var s = [];
      //: the band goes in FIRST so that a reader who stops at the legend
      //: reads "+-1 sigma" as belonging to the curve under it
      if (band && band.band)
        s.push({ x: band.x, yLo: band.band.lo, yHi: band.band.hi,
                 kind: 'envelope', color: col.lcfs, label: T('recon.ser.band') });
      if (ys) s.push({ x: xs, y: ys, color: col.lcfs, label: T('recon.ser.recon') });
      if (tys) s.push({ x: txs, y: tys, color: col.alt, dash: [5, 3],
                        label: T('recon.ser.truth') });
      if (ry && ry.length) s.push({ x: rx, y: ry, color: col.muted,
                                    dash: [2, 3], width: 1.6,
                                    label: T('recon.ser.delivered') });
      if (px && py) s.push({ x: px, y: py, color: col.accent, dash: [6, 2],
                             width: 1.4, label: T('recon.ser.pinned') });
      if (!s.length) s.push({ x: [0, 1], y: [0, 0], color: col.grid });
      FyPlot.xy($(id), { series: s, xlabel: T('recon.axis.x'), ylabel: ylabel,
                         zeroLine: true, xmin: 0, xmax: xmax || 1 });
    }
    //: the reference goes in as a THIRD series, in its own dash, never in
    //: the truth's colour: a delivered reconstruction is not a truth and the
    //: legend must not let it be read as one
    var ref = refCurves;
    var q = last && last.q, tq = last && last.truthQ;
    var pin = pinned;
    panel('qprof', q && q.x, q && q.q, tq && tq.x, tq && tq.q, T('recon.axis.q'),
          null, posterior && posterior.qBand,
          ref && ref.psi_norm, ref && ref.q,
          pin && pin.q && pin.q.x, pin && pin.q && pin.q.q);
    var j = last && last.jphi, tj = last && last.truthJphi;
    panel('jphi', j && j.x, j && j.j, tj && tj.x, tj && tj.j, T('recon.axis.j'),
          null, null, null, null,
          pin && pin.jphi && pin.jphi.x, pin && pin.jphi && pin.jphi.j);
    panel('pp', fit && fit.x, fit && fit.pprime, tru && tru.x,
          tru && tru.pprime, T('recon.axis.pp'), null, null,
          ref && ref.psi_norm, ref && ref.dpressure_dpsi,
          pin && pin.profiles && pin.profiles.x,
          pin && pin.profiles && pin.profiles.pprime);
    panel('ffp', fit && fit.x, fit && fit.ffprime, tru && tru.x,
          tru && tru.ffprime, T('recon.axis.ffp'), null, null,
          ref && ref.psi_norm, ref && ref.f_df_dpsi,
          pin && pin.profiles && pin.profiles.x,
          pin && pin.profiles && pin.profiles.ffprime);

    // pressure panel also carries the kinetic constraint points
    var sp = [];
    if (ref && ref.pressure && ref.pressure.length)
      sp.push({ x: ref.psi_norm, y: ref.pressure, color: col.muted,
                dash: [2, 3], width: 1.6, label: T('recon.ser.delivered') });
    if (pin && pin.profiles)
      sp.push({ x: pin.profiles.x, y: pin.profiles.p, color: col.accent,
                dash: [6, 2], width: 1.4, label: T('recon.ser.pinned') });
    if (posterior && posterior.pBand)
      sp.push({ x: posterior.pBand.x, yLo: posterior.pBand.band.lo,
                yHi: posterior.pBand.band.hi, kind: 'envelope',
                color: col.lcfs, label: T('recon.ser.band') });
    if (fit) sp.push({ x: fit.x, y: fit.p, color: col.lcfs, label: T('recon.ser.recon') });
    if (tru) sp.push({ x: tru.x, y: tru.p, color: col.alt, dash: [5, 3],
                       label: T('recon.ser.truth') });
    if (last && last.kineticX && last.kineticX.length)
      sp.push({ x: last.kineticX, y: last.kineticP, color: col.warn || '#b60',
                kind: 'dots', radius: 3.5, label: T('recon.ser.points') });
    if (!sp.length) sp.push({ x: [0, 1], y: [0, 0], color: col.grid });
    FyPlot.xy($('pres'), { series: sp, xlabel: T('recon.axis.x'), ylabel: T('recon.axis.p'),
                           zeroLine: true, xmin: 0, xmax: 1 });
  }

  // --- the bootstrap panels -------------------------------------------------

  /**
   * The closure's own report card.
   *
   * ★Every row is a number the reader can check somewhere else: the
   * identity residual against the algebra, the three currents against
   * their sum, the ladder's Ip against the fit's own.  A panel that
   * printed only the bootstrap fraction would be asking to be believed.
   */
  function drawClosure(cl, bs) {
    var body = $('closure-body'), cap = $('closure-cap');
    if (!body) return;
    if (!cl) {
      body.innerHTML = '';
      if (cap) cap.innerHTML = (bs && bs.closure && bs.closure.error)
        ? T('recon.closure.failed', { why: bs.closure.error })
        : T('recon.closure.nofit');
      return;
    }
    var loop = last && last.closureLoop;
    var pct = function (v) { return (100 * v).toFixed(2) + ' %'; };
    var kA = function (v) { return (v / 1e3).toFixed(2) + ' kA'; };
    var rows = [
      [T('recon.closure.row.fbs'), pct(cl.fBs)],
      [T('recon.closure.row.ibs'), kA(cl.iBs)],
      [T('recon.closure.row.iohm'), kA(cl.iOhm)],
      [T('recon.closure.row.idia'), kA(cl.iDia)],
      [T('recon.closure.row.iladder'), kA(cl.iTot)],
      [T('recon.closure.row.ifit'), kA(cl.ipFitted)],
      [T('recon.closure.row.quad'),
       pct(Math.abs(cl.iTot - cl.ipFitted) / Math.abs(cl.ipFitted))],
      [T('recon.closure.row.identity'), cl.identity.toExponential(2)],
      [T('recon.closure.row.sigma'),
       cl.vintage === 0 ? 'Sauter 1999' : 'Redl 2021'],
      [T('recon.closure.row.f33'),
       Math.min.apply(null, Array.from(cl.f33)).toFixed(3) + ' … ' +
       Math.max.apply(null, Array.from(cl.f33)).toFixed(3)],
    ];
    if (loop) {
      rows.push([T('recon.closure.row.rounds'),
                 loop.error ? T('recon.closure.looperr', { why: loop.error })
                            : String(loop.rounds) + ' · ' +
                              T('recon.closure.stop.' + loop.stop)]);
      if (isFinite(loop.spread))
        rows.push([T('recon.closure.row.spread'), pct(loop.spread)]);
      if (loop.history && loop.history.length)
        rows.push([T('recon.closure.row.hist'),
                   Array.from(loop.history, function (v) {
                     return (100 * v).toFixed(2);
                   }).join(' → ') + ' %']);
    }
    body.innerHTML = rows.map(function (r) {
      return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>';
    }).join('');
    if (cap) cap.innerHTML = T('recon.closure.cap', {
      unit: cl.unit,
      vloop: isFinite(cl.vLoop[0]) ? cl.vLoop[0].toFixed(2) : '—',
    });
  }

  function drawBootstrap() {
    var col = FyPlot.palette($('jbs'));
    var bs = last && last.bootstrap;
    var empty = [{ x: [0, 1], y: [0, 0], color: col.grid }];

    FyPlot.xy($('jbs'), {
      series: bs && bs.jBs
        ? [{ x: bs.x, y: bs.jBs, color: col.lcfs, label: T('recon.ser.jbs') }]
        : empty,
      xlabel: T('recon.axis.x'), ylabel: T('recon.axis.jbs'),
      zeroLine: true, xmin: 0, xmax: 1 });

    //: the two vintages share NEO's normalised units, so they are drawn
    //: together and against nothing else
    FyPlot.xy($('neo'), {
      series: bs && bs.vintages
        ? [{ x: bs.x, y: bs.vintages.sauter1999, color: col.alt, dash: [5, 3],
             label: T('recon.ser.sauter99') },
           { x: bs.x, y: bs.vintages.redl2021, color: col.lcfs,
             label: T('recon.ser.redl21') }]
        : empty,
      xlabel: T('recon.axis.x'), ylabel: T('recon.axis.jpar'),
      zeroLine: true, xmin: 0, xmax: 1 });

    FyPlot.xy($('nete'), {
      series: bs
        ? [{ x: bs.x, y: Array.from(bs.ne, function (v) { return v / 1e19; }),
             color: col.accent, label: T('recon.ser.ne') },
           { x: bs.x, y: Array.from(bs.te, function (v) { return v / 1e3; }),
             color: col.warn || '#b60', label: T('recon.ser.te') }]
        : empty,
      xlabel: T('recon.axis.x'), ylabel: T('recon.axis.nete'),
      zeroLine: true, xmin: 0, xmax: 1 });

    // --- T-A9: the three addable curves, and sigma_neo ---------------------
    //
    // ★★They are drawn on ONE axis because they are now one quantity:
    // `<j.B>/B0` in A/m^2.  The fitted current arrives as `<j_phi>` and is
    // converted by the kernel; the bootstrap is already in this measure;
    // the ohmic curve is what is left.  Before this the page held two of
    // the three and could not put them on one axis at all — the note that
    // used to stand in the worker said so in as many words.
    var cl = bs && bs.closure && !bs.closure.error ? bs.closure : null;
    FyPlot.xy($('jsplit'), {
      series: cl
        ? [{ x: cl.x, y: Array.from(cl.jTot, function (v) { return v / 1e6; }),
             color: col.lcfs, label: T('recon.ser.jtot') },
           { x: cl.x, y: Array.from(cl.jOhm, function (v) { return v / 1e6; }),
             color: col.accent, label: T('recon.ser.johm') },
           { x: cl.x, y: Array.from(cl.jBs, function (v) { return v / 1e6; }),
             color: col.alt, dash: [5, 3], label: T('recon.ser.jbs2') }]
        : empty,
      xlabel: T('recon.axis.x'), ylabel: T('recon.axis.jsplit'),
      zeroLine: true, xmin: 0, xmax: 1 });

    //: σ_neo beside the Spitzer it corrects, so the TRAPPING is what the
    //: reader sees rather than a curve that could be either
    FyPlot.xy($('signeo'), {
      series: cl
        ? [{ x: cl.x,
             y: Array.from(cl.sigmaSpitzer, function (v) { return v / 1e6; }),
             color: col.alt, dash: [5, 3], label: T('recon.ser.sigsp') },
           { x: cl.x,
             y: Array.from(cl.sigmaNeo, function (v) { return v / 1e6; }),
             color: col.lcfs, label: T('recon.ser.signeo') }]
        : empty,
      xlabel: T('recon.axis.x'), ylabel: T('recon.axis.sigma'),
      zeroLine: true, xmin: 0, xmax: 1 });

    drawClosure(cl, bs);

    var note = $('ne-note');
    if (!note) return;
    if (!$('neon').checked) { note.innerHTML = T('recon.ne.off'); return; }
    if (!bs) { note.innerHTML = T('recon.ne.nofit'); return; }
    if (bs.error) { note.innerHTML = T('recon.ne.failed', { why: bs.error }); return; }
    //: the two channels have their own provenance and must say so
    //: separately — an imported n_e with a derived T_e is a different claim
    //: from a file that carried both
    note.innerHTML = T('recon.ne.note', {
      ne: T(bs.source === 'imported' ? 'recon.ne.src.file'
                                     : 'recon.ne.src.shape'),
      te: T(bs.teSource === 'imported' ? 'recon.ne.te.file'
                                       : 'recon.ne.te.derived'),
      zeff: bs.zeff.toFixed(1),
      tite: (bs.tiOverTe === undefined ? 1 : bs.tiOverTe).toFixed(2),
      ft: bs.ft ? bs.ft[Math.floor(bs.ft.length / 2)].toFixed(2) : '—',
    }) + (bs.vintages ? '' : ' ' + T('recon.ne.novintage'));
  }

  // --- the probe channel ----------------------------------------------------
  //
  // ★What the panel shows is what the page HAS: the reconstruction's own
  // prediction at each probe, and the deck's weight mask beside it.  A
  // measured series would need probe readings for this shot, which the device
  // document does not carry — so the caption says which of the two is on
  // screen rather than letting a single line be read as agreement.
  function drawProbes() {
    var col = FyPlot.palette($('probes'));
    var pr = last && last.probes;
    var cap = $('probes-cap');
    if (!pr || !M.probes) {
      FyPlot.xy($('probes'), { series: [{ x: [0, 1], y: [0, 0], color: col.grid }],
                               xlabel: T('recon.axis.probeno') });
      if (cap) cap.innerHTML = T(M.probes ? 'recon.probes_cap.none'
                                          : 'recon.probes_cap.nogeom');
      return;
    }
    //: ★prefer the Green's-row prediction over the sampled one.  Both are
    //: this equilibrium's answer at the probe, but the rows are exact
    //: filament integrals while the sampled field is a finite difference of
    //: the psi map — and a probe sits at the wall, where the map is coarsest.
    //: Measured apart on this shot: 1.0 % at the worst channel.
    var pb = pr.viaRows && pr.viaRows.length ? pr.viaRows : pr.b;
    var xw = [], yw = [], xu = [], yu = [];
    for (var i = 0; i < pb.length; i++) {
      var w = M.probes[i] && M.probes[i].weight;
      (w ? xw : xu).push(i + 1);
      (w ? yw : yu).push(pb[i]);
    }
    var series = [];
    if (yu.length) series.push({ x: xu, y: yu, color: col.muted, kind: 'dots',
                                 radius: 2.5, label: T('recon.ser.probe_off') });
    if (yw.length) series.push({ x: xw, y: yw, color: col.lcfs, kind: 'dots',
                                 radius: 3.5, label: T('recon.ser.probe_on') });
    if (refProbes.length)
      series.push({ x: refProbes.map(function (_, k) { return k + 1; }),
                    y: refProbes, color: col.alt, kind: 'dots', radius: 2.5,
                    label: T('recon.ser.probe_ref') });
    FyPlot.xy($('probes'), { series: series, xlabel: T('recon.axis.probeno'),
                             ylabel: T('recon.axis.probeb'), zeroLine: true });
    var fnote = $('probefit-note');
    if (fnote) {
      //: the note answers the one question the checkbox raises: fitted with
      //: WHAT.  Probe geometry alone cannot constrain anything.
      if (!refProbes.length) fnote.innerHTML = T('recon.probefit.noref');
      else if (!last.fitRows || !last.fitRows.probes)
        fnote.innerHTML = T('recon.probefit.off', { n: refProbes.length });
      else fnote.innerHTML = T('recon.probefit.on_note', {
        loops: last.fitRows.loops,
        probes: M.probes.filter(function (p) { return p.weight; }).length,
        all: last.fitRows.probes });
    }
    if (cap) cap.innerHTML = T('recon.probes_cap', {
      n: pb.length, w: yw.length,
      how: T(pr.viaRows && pr.viaRows.length ? 'recon.probes.how_rows'
                                             : 'recon.probes.how_field'),
      ref: refProbes.length ? T('recon.probes_cap.ref', { n: refProbes.length })
                            : T('recon.probes_cap.noref') });
  }

  // --- POINT: the two chord channels ---------------------------------------

  function drawPoint() {
    var col = FyPlot.palette($('point'));
    var pt = last && last.point;
    var cap = $('point-cap');
    var empty = [{ x: [0, 1], y: [0, 0], color: col.grid }];
    if (!pt || pt.needsDensity || pt.error) {
      FyPlot.xy($('point'), { series: empty, xlabel: T('recon.axis.chordno') });
      if (cap) cap.innerHTML = !pt ? T('recon.point_cap.none')
        : pt.error ? T('recon.point_cap.failed', { why: pt.error })
        : T('recon.point_cap.needsne');
      return;
    }
    var x = [];
    for (var i = 0; i < pt.nel19.length; i++) x.push(i + 1);
    //: two channels on one frame, and they are NOT the same quantity: the
    //: line density is drawn against the left scale in 1e19 m^-2, the Faraday
    //: angle scaled onto it and named in the legend, because a chord's two
    //: readings are read together or not at all
    var amp = 0, aamp = 0, k;
    for (k = 0; k < x.length; k++) {
      amp = Math.max(amp, Math.abs(pt.nel19[k]));
      aamp = Math.max(aamp, Math.abs(pt.angleDeg[k]));
    }
    var sc = aamp > 0 ? amp / aamp : 1;
    var series = [
      { x: x, y: Array.from(pt.nel19), color: col.accent, kind: 'dots',
        radius: 4, label: T('recon.ser.nel') },
      { x: x, y: Array.from(pt.angleDeg, function (v) { return v * sc; }),
        color: col.lcfs, kind: 'dots', radius: 3,
        label: T('recon.ser.faraday', { s: sc.toPrecision(3) }) },
    ];
    //: ★the MEASURED chords go in as lines under the modelled dots, on the
    //: same two scales, so the comparison is the picture rather than a
    //: number in the caption.  They are only ever drawn when they exist:
    //: this deck ships chord geometry and no chord readings.
    var pmeas = last && last.pointMeas;
    if (pmeas && pmeas.nel)
      series.push({ x: x, y: Array.prototype.map.call(pmeas.nel,
                      function (v) { return v / 1e19; }),
                    color: col.accent, kind: 'line', width: 1.5,
                    label: T('recon.ser.nel.meas') });
    if (pmeas && pmeas.faraday)
      series.push({ x: x, y: Array.prototype.map.call(pmeas.faraday,
                      function (v) { return v * sc; }),
                    color: col.lcfs, kind: 'line', width: 1.5, dash: [4, 3],
                    label: T('recon.ser.faraday.meas') });
    FyPlot.xy($('point'), {
      series: series,
      xlabel: T('recon.axis.chordno'), ylabel: T('recon.axis.nel'),
      zeroLine: true });
    if (cap) cap.innerHTML = T('recon.point_cap', {
      n: x.length,
      len: (pt.chordLength[Math.floor(x.length / 2)] || 0).toFixed(2),
      src: T(pt.source === 'imported' ? 'recon.ne.src.file'
                                      : 'recon.ne.src.shape') });
  }

  function drawLoops() {
    var col = FyPlot.palette($('loops'));
    if (!last) {
      FyPlot.xy($('loops'), { series: [{ x: [0, 1], y: [0, 0], color: col.grid }],
                              xlabel: T('recon.axis.loopno') });
      return;
    }
    var x = [];
    for (var i = 0; i < last.meas.length; i++) x.push(i + 1);
    FyPlot.xy($('loops'), {
      series: [
        { x: x, y: Array.from(last.meas), color: col.accent, kind: 'dots',
          radius: 3.5, label: T('recon.ser.meas') },
        { x: x, y: Array.from(last.model), color: col.lcfs, kind: 'line',
          width: 1.5, label: T('recon.ser.model') },
      ],
      xlabel: T('recon.axis.loopno'), ylabel: T('recon.axis.loopflux'),
    });
  }

  // --- the channel table ----------------------------------------------------
  //
  // ★WHAT THIS PANEL IS FOR.  "Switch off those three loops and fit again"
  // is the first thing anyone does with a real shot, and until now the mask
  // existed in the worker (`msg.loopMask`) with nothing able to send it —
  // the reader could see a red marker on the cross-section and do nothing
  // about it.
  //
  // Three columns decide whether a channel is an outlier and they are not
  // interchangeable: `Δ` is what the instrument and the fit disagree by, in
  // the channel's own unit; `wΔ` is what the SOLVER saw, because a row's
  // pull is its weight times its residual; the weight is the deck's.  The
  // cut is made on `wΔ` — a large residual on a channel the deck already
  // trusts little is not what dragged the fit.

  /** The rows of the active tab: `{name, r, z, meas, model, w, off}`. */
  function chanRows(which) {
    var out = [], i;
    if ((which || chanTab) === 'probe') {
      if (!M.probes || !M.probes.length || !last || !last.probes) return out;
      for (i = 0; i < M.probes.length; i++) {
        var p = M.probes[i];
        out.push({ i: i, name: p.name || ('MP' + (i + 1)), r: p.r, z: p.z,
                   meas: refProbes.length ? refProbes[i] : NaN,
                   model: last.probes.b[i],
                   //: the deck's operational weight, which is 0 or 1 here
                   w: p.weight ? 1 : 0, deckOff: !p.weight,
                   sig: probeSig[i] === undefined ? 1 : probeSig[i],
                   forcedOn: !p.weight && !!probeOn[i],
                   //: ★`off` means NOT IN THE FIT, deck verdict and reader
                   //: layer already folded together — so every downstream
                   //: filter is `!r.off` and none of them has to remember the
                   //: rule a second time.
                   off: p.weight ? !!probeOff[i] : !probeOn[i] });
      }
      return out;
    }
    for (i = 0; i < M.loops.length; i++) {
      out.push({ i: i, name: (M.loopNames && M.loopNames[i]) || ('FL' + (i + 1)),
                 r: M.loops[i][0], z: M.loops[i][1],
                 meas: last ? last.meas[i] : NaN,
                 model: last ? last.model[i] : NaN,
                 w: last ? last.wts[i] : NaN,
                 deckOff: !!(HAS_REF && M.reference.loopWeights &&
                             !M.reference.loopWeights[i]),
                 sig: loopSig[i] === undefined ? 1 : loopSig[i],
                 forcedOn: !!(HAS_REF && M.reference.loopWeights &&
                              !M.reference.loopWeights[i] && loopOn[i]),
                 off: (HAS_REF && M.reference.loopWeights &&
                       !M.reference.loopWeights[i])
                   ? !loopOn[i] : !!loopOff[i] });
    }
    return out;
  }

  /** The rows of one block, whichever tab happens to be showing. */
  function chanRowsFor(which) { return chanRows(which); }

  /** `wΔ` for every row that took part, and its RMS. */
  function weightedResiduals(rows, which) {
    var w = [], rms = 0, n = 0;
    var probe = (which || chanTab) === 'probe';
    rows.forEach(function (r) {
      var d = (r.model - r.meas);
      var v = isFinite(d) ? (probe ? d : d * (r.w || 0)) : NaN;
      w.push(v);
      if (isFinite(v) && !r.off) { rms += v * v; n += 1; }
    });
    return { w: w, rms: n ? Math.sqrt(rms / n) : NaN, n: n };
  }

  function fmtSig(v, d) {
    return isFinite(v) ? v.toExponential(d === undefined ? 2 : d) : '—';
  }

  function drawChannels() {
    var body = $('chan-body'), cap = $('chan-cap');
    if (!body) return;
    $('chan-tab-loop').className = chanTab === 'loop' ? 'on' : '';
    $('chan-tab-probe').className = chanTab === 'probe' ? 'on' : '';
    var rows = chanRows();
    var wr = weightedResiduals(rows);
    rows.forEach(function (r, k) { r.wresid = wr.w[k]; });
    //: ★the calibration column is the kernel's factor divided by the set's
    //: own MEDIAN — the number the keep rule is written on.  Printing the
    //: raw factor would make a channel look wrong whenever a unit changed.
    var cal = last && last.selfcal &&
              last.selfcal[chanTab === 'probe' ? 'probes' : 'loops'];
    if (cal && cal.factors && !cal.error)
      rows.forEach(function (r) {
        var f = cal.factors[r.i];
        r.cal = (isFinite(f) && cal.median) ? f / cal.median : NaN;
        r.calReject = isFinite(f) && !cal.keep[r.i] && !r.off;
      });
    var k = +$('outk').value;
    var order = rows.slice();
    var by = {
      name: function (a, b) { return a.i - b.i; },
      meas: function (a, b) { return Math.abs(b.meas) - Math.abs(a.meas); },
      resid: function (a, b) {
        return Math.abs(b.model - b.meas) - Math.abs(a.model - a.meas); },
      wresid: function (a, b) {
        return (Math.abs(b.wresid) || 0) - (Math.abs(a.wresid) || 0); },
    };
    order.sort(by[chanSort] || by.name);
    body.innerHTML = order.map(function (r) {
      var flag = isFinite(r.wresid) && isFinite(wr.rms) && wr.rms > 0 &&
                 Math.abs(r.wresid) > k * wr.rms && !r.off;
      var d = r.model - r.meas;
      return '<tr class="' + (r.off ? 'off' : '') + '">' +
        //: ★the box is enabled even for a deck-disowned channel — ticking it
        //: is how a reader forces one back in, and the `*` beside the name
        //: stays whether it is in or out, because what it marks is the
        //: DECK's verdict, not the current state.
        '<td><input type="checkbox" data-chan="' + r.i + '"' +
        (r.off ? '' : ' checked') + '></td>' +
        '<td class="name">' + r.name + (r.deckOff ? ' *' : '') +
        (r.forcedOn ? ' <span class="flag">↑</span>' : '') + '</td>' +
        '<td class="num">' + r.r.toFixed(3) + ', ' + r.z.toFixed(3) + '</td>' +
        '<td class="num">' + fmtSig(r.meas, 3) + '</td>' +
        '<td class="num">' + fmtSig(r.model, 3) + '</td>' +
        '<td class="num">' + fmtSig(d) + '</td>' +
        '<td class="num' + (flag ? ' flag' : '') + '">' + fmtSig(r.wresid) +
        (flag ? ' !' : '') + '</td>' +
        '<td class="num">' + (isFinite(r.w) ? (+r.w).toPrecision(3) : '—') +
        '</td>' +
        //: ★★the reader's sigma multiplier, editable in place.  `step` is
        //: coarse on purpose: this is a statement about how much a channel is
        //: trusted, and three decimals of it would be a false precision.
        '<td class="num"><input type="number" class="sigbox" min="0.1" max="99"' +
        ' step="0.1" data-sig="' + r.i + '" value="' +
        (+r.sig).toFixed(1) + '"></td>' +
        '<td class="num' + (r.calReject ? ' flag' : '') + '">' +
        (isFinite(r.cal) ? r.cal.toFixed(3) + (r.calReject ? ' !' : '') : '—') +
        '</td></tr>';
    }).join('');
    var used = rows.filter(function (r) { return !r.off; }).length;
    var flagged = rows.filter(function (r) {
      return isFinite(r.wresid) && wr.rms > 0 &&
             Math.abs(r.wresid) > k * wr.rms && !r.off; }).length;
    cap.innerHTML = T(chanTab === 'probe' ? 'recon.chan.cap.probe'
                                          : 'recon.chan.cap.loop',
                      { used: used, all: rows.length,
                        rms: fmtSig(wr.rms), k: k.toFixed(1), flagged: flagged });
    //: ★THREE COUNTS, because they answer three different questions: how
    //: many the reader switched off, how many the deck never used, and how
    //: many rows the fit was actually given.  One number in place of the
    //: three reads as a contradiction the moment they differ — and on this
    //: deck they always do (5 loops carry weight zero).
    var deckOff = rows.filter(function (r) { return r.deckOff; }).length;
    if (cal && !cal.error && isFinite(cal.median))
      cap.innerHTML += ' ' + T('recon.chan.cal', {
        med: cal.median.toPrecision(4),
        disp: (100 * cal.dispersion).toFixed(1),
        tol: (100 * cal.tol).toFixed(0),
        bad: rows.filter(function (r) { return r.calReject; }).length });
    else if (cal && cal.error)
      cap.innerHTML += ' ' + T('recon.chan.cal.failed', { why: cal.error });
    //: ★the tolerance shown is the one the KERNEL was asked with, not the
    //: one the slider is on: moving the slider does not recolour a column,
    //: it changes the question — and a page that recoloured it here would be
    //: applying a rule of its own beside the kernel's
    if (cal && !cal.error && Math.abs(cal.tol - +$('caltol').value) > 1e-9)
      cap.innerHTML += ' ' + T('recon.chan.cal.stale',
                               { tol: (100 * +$('caltol').value).toFixed(0) });
    $('chan-note').innerHTML = T('recon.chan.note', {
      what: T(chanTab === 'probe' ? 'recon.chan.kind.probe'
                                  : 'recon.chan.kind.loop'),
      off: Object.keys(chanTab === 'probe' ? probeOff : loopOff).length,
      deck: deckOff, used: used, all: rows.length,
      dof: last && last.ndof !== undefined ? last.ndof : '—' });
    //: ★★the reader's own layer, said separately from the deck's counts:
    //: how many channels carry a sigma that is not 1.0, and how many the
    //: deck disowns and this reader put back.  A forced-on channel that
    //: went unmentioned would be the exact thing the old prohibition was
    //: protecting against.
    var nSig = rows.filter(function (r) { return r.sig !== 1; }).length;
    var nOn = rows.filter(function (r) { return r.forcedOn; }).length;
    var extra = T('recon.chan.sig.note');
    if (nOn) extra += ' ' + T('recon.chan.forced', { n: nOn });
    if (nSig) extra += ' ' + T('recon.chan.sigged', { n: nSig });
    $('chan-note').innerHTML += ' ' + extra;
  }

  /** Switch off every channel the kernel's calibration rule rejects. */
  function cutByCalibration() {
    var cal = last && last.selfcal &&
              last.selfcal[chanTab === 'probe' ? 'probes' : 'loops'];
    if (!cal || cal.error || !cal.factors) {
      S.report(T('recon.chan.nofit'), 'warn');
      return;
    }
    var t = chanTab === 'probe' ? probeOff : loopOff, n = 0;
    chanRows().forEach(function (r) {
      if (r.off) return;
      if (isFinite(cal.factors[r.i]) && !cal.keep[r.i]) { t[r.i] = true; n += 1; }
    });
    drawChannels();
    S.report(T('recon.chan.cal.cut', { n: n, tol: (100 * cal.tol).toFixed(0) }));
  }

  /** Switch off every channel the current cut flags, and say how many. */
  function cutOutliers() {
    var rows = chanRows(), wr = weightedResiduals(rows), k = +$('outk').value;
    if (!(wr.rms > 0)) { S.report(T('recon.chan.nofit'), 'warn'); return; }
    var n = 0;
    rows.forEach(function (r, j) {
      if (r.off) return;
      if (Math.abs(wr.w[j]) > k * wr.rms) {
        (chanTab === 'probe' ? probeOff : loopOff)[r.i] = true;
        n += 1;
      }
    });
    remember();
    drawChannels();
    S.report(T('recon.chan.cut.done', { n: n, k: k.toFixed(1) }));
  }

  function setAllChannels(off) {
    var probe = chanTab === 'probe';
    var t = probe ? probeOff : loopOff, on = probe ? probeOn : loopOn;
    var sig = probe ? probeSig : loopSig;
    Object.keys(t).forEach(function (key) { delete t[key]; });
    //: ★「回到卷宗」(off === null) also drops the reader's sigmas and every
    //: forced-on channel: it is the one control that means "forget what I
    //: said", and a sigma left behind would make it a half-truth.
    if (off === null) {
      Object.keys(on).forEach(function (key) { delete on[key]; });
      Object.keys(sig).forEach(function (key) { delete sig[key]; });
    } else if (off) {
      chanRows().forEach(function (r) { if (!r.deckOff) t[r.i] = true; });
      Object.keys(on).forEach(function (key) { delete on[key]; });
    }
    remember();
    drawChannels();
  }

  // --- presets --------------------------------------------------------------
  //
  // ★★FORTY KNOBS, AND FIVE OF THEM MATTER FOR THE QUESTION YOU ASKED.  The
  // control column carries every switch this scenario has, and for any one
  // job most of them should be left alone — but the page never said which
  // five.  A preset is not a shortcut past understanding: each one states
  // what it ASSUMES, and the note says so in the same breath as applying it.
  //
  // ★They are deliberately NOT saved as "the good settings": the fit corner
  // recorded in `machine_desc/README.md` is the reconstruction bar's own
  // default, and these move away from it on purpose, each towards one
  // question.

  var PRESETS = {
    mag: { note: 'recon.preset.note.mag',
           set: { kin: false, neon: false, probefit: false, pointfit: false,
                  farfit: false, vesselfit: false },
           slide: {} },
    kin: { note: 'recon.preset.note.kin',
           set: { kin: true, neon: true, probefit: false, pointfit: true,
                  farfit: false, vesselfit: false },
           slide: { kw: 0.2, kpts: 9 } },
    //: ★probes OFF even here, and the note says why: on this deck the raw
    //: probe readings and the delivered (loops-only) reconstruction disagree
    //: by 58 % RMS, so a preset that switched them on would be shipping a
    //: fit that cannot converge as though it were the recommended setting.
    ramp: { note: 'recon.preset.note.ramp', basis: 'raw',
            set: { kin: false, neon: false, probefit: false, pointfit: false,
                   farfit: false, vesselfit: true },
            slide: { vridge: 0.05, vit: 2 } },
    //: ★★★THE LIVE-SHOT FLOW, and it is the one the reader who came here with
    //: a shot number wants: a server, a shot, a slice, the error bars, run.
    //: Everything it switches OFF is switched off for a MEASURED reason, not
    //: for tidiness — see the note.
    live: { note: 'recon.preset.note.live', basis: 'raw',
            set: { kin: false, neon: false, probefit: false, pointfit: false,
                   farfit: false, vesselfit: false, coilfit: true },
            //: ★★the posterior needs a source of variation or it is the same
            //: fit N times — and this one is not invented: the loop sigma is
            //: the INSTRUMENT's own, from the device document's per-loop
            //: `bit_error` (median 9.06e-4 Wb/rad against a maximum reading
            //: of 0.53), i.e. 0.0017, rounded to the slider's step.  Every
            //: other preset leaves it at zero and the posterior then says
            //: which switch is missing; this one is the flow where a reader
            //: asked for error bars, so it arrives able to draw them.
            slide: { mcloops: 0.002 } },
    twin: { note: 'recon.preset.note.twin',
            set: { kin: true, neon: true, probefit: true, pointfit: true,
                   farfit: true, vesselfit: false },
            slide: { noise: 0.005, farw: 0.25, farit: 2 } },
  };

  // --- 必设 / 进阶 -----------------------------------------------------------
  //
  // ★★FORTY KNOBS AND FIVE OF THEM MATTER — the presets said which five, and
  // the column still showed all forty (T-A11).  So each panel is now split:
  // the switch that decides WHETHER a block of physics is in the fit stays in
  // the open, and the numbers that shape it — the weight, the noise, the ridge,
  // the iteration counts — fold into 「进阶」 underneath it.
  //
  // ★★★A FOLDED CONTROL IS STILL A CONTROL.  `<details>` hides its children
  // without removing them: the ids do not move, the values still travel into
  // the message and into the session file, and a gate reaches them with
  // `getElementById` exactly as before (`app/tests/README.md`, 「折叠不影响
  // 可及性」).  This is a change to what the reader is shown FIRST, and to
  // nothing else.
  //
  // ★Which ones open is not a fixed list but a rule: an advanced group belongs
  // to the switch above it, and it opens when that switch is on.  That gives
  // the presets their behaviour for free — 「纯磁反演」 turns six switches off
  // and six groups fold away — and it keeps saying something sensible when the
  // reader has moved away from every preset, which a fixed per-preset list
  // would not.
  var ADV_GATE = { kinetic: 'kin', density: 'neon', vessel: 'vesselfit',
                   point: 'pointfit', probe: 'probefit',
                   coilfit: 'coilfit' };

  /**
   * Open the advanced groups this question uses, close the rest.
   *
   * `force` is what a preset does — it states a whole question, so it may
   * close a group as well as open one.  A reader ticking one switch only ever
   * OPENS: closing the group they were just working in, because they turned
   * something else off, would be the page arguing with them.
   */
  function syncAdvanced(force) {
    Object.keys(ADV_GATE).forEach(function (key) {
      var d = $('adv-' + key), box = $(ADV_GATE[key]);
      if (!d || !box) return;
      if (box.checked) d.open = true;
      else if (force) d.open = false;
    });
  }

  function applyPreset(name) {
    var p = PRESETS[name];
    if (!p) return;
    Object.keys(p.set).forEach(function (id) {
      var el = $(id);
      if (el) { el.checked = p.set[id]; }
    });
    Object.keys(p.slide).forEach(function (id) {
      var el = $(id);
      if (el) el.value = p.slide[id];
    });
    //: ★a preset that turns the probes on must also say which channel basis
    //: it means: raw probes against delivered loops is the mix that does not
    //: solve at all
    if ($('basis')) {
      basis = p.basis || 'delivered';
      $('basis').value = basis;
    }
    if (name === 'twin') setSource('twin');
    else if (FyDevice.hasMeasurements(M)) setSource('real');
    //: ★a preset states the whole question, so it may fold a group away as
    //: well as open one
    syncAdvanced(true);
    syncLabels();
    drawAll();
    $('preset-note').innerHTML = T(p.note);
    //: ★the preset does not run.  It sets a question; pressing the key is
    //: still the reader's decision, and a page that computed on a preset
    //: click would make four solves out of four clicks of curiosity.
    remember();
    S.report(T('recon.preset.applied', { what: T('recon.preset.' + name) }));
  }

  /** The mask the worker is sent: one entry per channel, deck order. */
  function maskOf(off, n, invert) {
    var a = new Array(n);
    for (var i = 0; i < n; i++) a[i] = (off[i] ? 1 : 0) ^ (invert ? 0 : 1);
    return a;
  }

  /**
   * The reader's sigma multipliers, as WEIGHT factors.
   *
   * ★The inversion happens here and is said here: the table's column is a
   * sigma (bigger = trusted less) and the fit reads a weight (bigger =
   * trusted more).  Doing it in the worker would leave the column's meaning
   * two files away from the arithmetic that implements it.
   */
  function scaleOf(sig, n) {
    var a = new Array(n);
    for (var i = 0; i < n; i++) {
      var v = sig[i];
      a[i] = (isFinite(v) && v > 0) ? 1 / v : 1;
    }
    return a;
  }

  /**
   * The pressure profile the `profile` bar fitted, if it fitted one.
   *
   * ★Only PRESSURE: the kinetic rows are pressure rows, and handing them a
   * density because that is what the other bar happened to fit last would
   * be a unit error the solver cannot see.
   */
  var profileUsedAt = null;

  //: ★NO SIDE EFFECT.  This used to stamp `profileUsedAt` as it read, and it
  //: is called from every DRAW as well as from the message builder — so the
  //: record of "which profile this fit used" was quietly advanced to the
  //: current one by the very redraw whose job is to notice that they differ.
  function fittedPressure() {
    var p = S.take('profile');
    if (!p || p.quantity !== 'pressure' || !p.value || !p.value.length)
      return null;
    return p.value;
  }

  /** Restore a mask from a session file, ignoring one of the wrong length. */
  function applyMask(off, arr) {
    Object.keys(off).forEach(function (k) { delete off[k]; });
    if (!Array.isArray(arr)) return;
    for (var i = 0; i < arr.length; i++) if (!arr[i]) off[i] = true;
  }

  function rmsResidual() {
    var s = 0, n = 0;
    for (var i = 0; i < last.meas.length; i++) {
      if (!last.wts[i]) continue;
      var d = last.model[i] - last.meas[i];
      s += d * d; n += 1;
    }
    return n ? Math.sqrt(s / n) : NaN;
  }

  function row(name, a, b, c) {
    var show = source === 'twin' || !!refCase;
    var cell = function (v) {
      return (v === undefined || v === null || v !== v) ? '—' : v;
    };
    //: ★the pinned column appears and disappears with the pin — including its
    //: header, or an unpinned table would carry a heading over nothing
    return '<tr><td>' + name + '</td><td class="num">' + a +
           '</td><td class="num ref-col"' +
           (show ? '' : ' style="display:none"') + '>' + cell(b) + '</td>' +
           (pinned ? '<td class="num pin-col">' + cell(c) + '</td>' : '') +
           '</tr>';
  }

  /** Freeze the run on screen as the thing everything else is read against. */
  function pinCurrent() {
    if (!last) { S.report(T('recon.pin.none'), 'warn'); return; }
    pinned = {
      label: (sliceOn ? sliceOn.label + ' · ' : '') +
             T(source === 'twin' ? 'recon.tab.twin' : 'recon.tab.real') +
             (basis === 'raw' ? ' · ' + T('recon.basis.raw.short') : ''),
      q: last.q, profiles: last.profiles, jphi: last.jphi,
      result: last.result, chi2: last.chi2, ndof: last.ndof, li3: last.li3,
      ipFitted: last.ipFitted, nfit: last.nfit,
      kinetic: last.kineticX ? last.kineticX.length : 0,
    };
    drawAll();
    S.report(T('recon.pin.done', { what: pinned.label }));
  }

  function unpin() { pinned = null; drawAll(); }

  /** The pinned run, named, or an invitation to pin one. */
  function drawPinNote() {
    var el = $('pin-note');
    if (!el) return;
    el.innerHTML = pinned ? T('recon.pin.note', { what: pinned.label })
                          : T('recon.pin.idle');
  }

  /**
   * One line: can this fit be trusted, and by what.
   *
   * ★★THE FOUR JUDGEMENTS LIVED IN FOUR PANELS.  χ²/dof was in the scalar
   * table, the outlier count in a figure caption, the vessel's
   * identifiability in its own note and the posterior width in a second
   * table — so the question every reader actually asks ("is this good?")
   * had to be assembled by hand from four places, and mostly was not.
   * ★It states what CONSTRAINED the fit as well as how well it fitted: a
   * χ²/dof of 1 on magnetics alone and the same number with pressure, POINT
   * and probe rows in are not the same claim.
   */
  function drawVerdict() {
    var el = $('verdict');
    if (!el) return;
    if (failed) {
      el.innerHTML = T(failed.label ? 'recon.verdict.failed.slice'
                                    : 'recon.verdict.failed',
                       { t: failed.label, why: failed.why });
      return;
    }
    if (!last) { el.innerHTML = T('recon.verdict.none'); return; }
    var rows = chanRowsFor('loop');
    var wr = weightedResiduals(rows, 'loop');
    var k = +$('outk').value;
    var flagged = rows.filter(function (r, i) {
      return isFinite(wr.w[i]) && wr.rms > 0 &&
             Math.abs(wr.w[i]) > k * wr.rms && !r.off; }).length;
    var fr = last.fitRows || {};
    var used = [];
    used.push(T('recon.verdict.src.loops', { n: last.nfit }));
    if (fr.probes) used.push(T('recon.verdict.src.probes', { n: fr.probes }));
    if (last.kineticX && last.kineticX.length)
      used.push(T('recon.verdict.src.kinetic', { n: last.kineticX.length }));
    if (fr.faraday) used.push(T('recon.verdict.src.faraday', { n: fr.faraday }));
    var q95sig = posterior && posterior.stats && posterior.stats.q95
      ? posterior.stats.q95.sigma.toFixed(3) : null;
    var v = last.vessel;
    var when = sliceOn
      ? T(sliceOn.synthetic ? 'recon.verdict.slice_twin'
                            : 'recon.verdict.slice', { t: sliceOn.label })
      : '';
    el.innerHTML = when + T('recon.verdict', {
      chi2: last.ndof ? (last.chi2 / last.ndof).toExponential(2) : '—',
      dof: last.ndof || '—',
      used: used.join(' + '),
      flagged: flagged, k: k.toFixed(1),
      band: q95sig ? T('recon.verdict.band', { s: q95sig })
                   : T('recon.verdict.noband'),
      vessel: !v ? '' : (v.current
        ? T('recon.verdict.vessel.on', {
            s: isFinite(v.survive) ? (100 * v.survive).toFixed(1) : '—' })
        : T('recon.verdict.vessel.blind')),
    });
  }

  /** What the pressure rows carried, and what the bootstrap was driven by. */
  function drawDecompNote() {
    var el = $('pdecomp-note');
    if (!el) return;
    var bits = [];
    var r = +$('tite').value, f = +$('pfast').value;
    bits.push(T('recon.pdecomp.tite', { r: r.toFixed(2) }));
    if (importedFast) bits.push(T('recon.pdecomp.fast.file',
                                  { n: importedFast.length }));
    else if (f > 0) bits.push(T('recon.pdecomp.fast.shape',
                                { f: (100 * f).toFixed(0),
                                  a: (+$('pfastpk').value).toFixed(1) }));
    else bits.push(T('recon.pdecomp.fast.none'));
    bits.push(T(importedRot ? 'recon.pdecomp.rot.file'
                            : 'recon.pdecomp.rot.none'));
    if (last && last.kineticP && last.kineticP.length && last.pThermalRows)
      bits.push(T('recon.pdecomp.rows', {
        tot: last.kineticP[0].toFixed(0),
        th: last.pThermalRows[0].toFixed(0) }));
    el.innerHTML = bits.join(' ');
  }

  /** The vessel groups this run fitted, and — on a twin — what it recovered. */
  function drawVesselNote() {
    var el = $('vessel-note');
    if (!el) return;
    var nEl = (M.vessel || []).length;
    if (!nEl) { el.innerHTML = T('recon.vessel.none'); return; }
    var v = last && last.vessel;
    if (v && !v.current) {
      //: ★"these channels cannot see the vessel" is an ANSWER, and it is not
      //: the same statement as "the vessel carried no current".  The page
      //: says which one it is, and how much of the vessel's own signature
      //: survived being projected out of the plasma's reach.
      var why = String(v.error || 'not-identifiable');
      //: an error the catalogue does not name is shown AS ITSELF rather
      //: than as the nearest sentence that exists
      var known = T('recon.vessel.why.' + why.split(':')[0]);
      el.innerHTML = T('recon.vessel.blind', {
        n: nEl,
        why: known.indexOf('recon.vessel.why') === 0 ? why : known,
        survive: isFinite(v.survive) ? (100 * v.survive).toFixed(2) : '—',
        rows: v.rows ? (v.rows.loops + ' + ' + v.rows.probes) : '—' });
      return;
    }
    if (!v) {
      el.innerHTML = T($('vesselfit').checked ? 'recon.vessel.idle'
                                              : 'recon.vessel.off',
                       { n: nEl });
      return;
    }
    var rows = v.names.map(function (nm, i) {
      var a = v.current[i] / 1e3;
      var t = v.truth ? v.truth[i] / 1e3 : null;
      return nm + ' ' + a.toFixed(2) + ' kA' +
        (t === null ? '' : ' (' + T('recon.vessel.truth') + ' ' +
                            t.toFixed(2) + ')');
    });
    var msg = T('recon.vessel.fitted', { n: nEl, list: rows.join('、'),
                                         survive: isFinite(v.survive)
                                           ? (100 * v.survive).toFixed(1) : '—',
                                         rows: v.rows
                                           ? (v.rows.loops + ' + ' + v.rows.probes) : '—',
                                         kept: v.kept, ng: v.names.length,
                                         cond: v.condition.toExponential(1),
                                         rcond: v.rcond });
    if (v.truth) {
      var num = 0, den = 0;
      for (var i = 0; i < v.truth.length; i++) {
        num += (v.current[i] - v.truth[i]) * (v.current[i] - v.truth[i]);
        den += v.truth[i] * v.truth[i];
      }
      msg += ' ' + T('recon.vessel.recovered',
                     { rel: den > 0 ? (100 * Math.sqrt(num / den)).toFixed(1)
                                    : '—' });
    }
    el.innerHTML = msg;
  }

  /**
   * How far the probe readings are from this solution — before anyone asks
   * the fit to satisfy them.
   *
   * ★★A DISAGREEMENT IS A MEASUREMENT TOO.  On #137985 the raw probes and
   * the delivered reconstruction (which was fitted on flux loops alone —
   * `probes 0/79 weighted`) differ by 58 % RMS of the peak field, and the
   * repository's own fidelity note records why: what is missing is
   * per-channel calibration, not geometry.  Feeding them to the fit anyway
   * does not produce a worse equilibrium, it produces NO equilibrium
   * (`磁通跨度退化`).  So the number goes on the panel where the switch is,
   * and the switch stays available for the twin and for a deck whose probes
   * are calibrated.
   */
  function drawProbeFitNote() {
    var el = $('probefit-note');
    if (!el) return;
    if (!refProbes.length) { el.innerHTML = T('recon.probefit.none'); return; }
    var rows = chanRowsFor('probe'), s2 = 0, n = 0, amp = 0;
    rows.forEach(function (r) {
      if (r.deckOff || !isFinite(r.meas) || !isFinite(r.model)) return;
      s2 += (r.model - r.meas) * (r.model - r.meas); n += 1;
      amp = Math.max(amp, Math.abs(r.model));
    });
    el.innerHTML = n && amp > 0
      ? T('recon.probefit.gap', { n: n, rms: Math.sqrt(s2 / n).toExponential(2),
                                  pct: (100 * Math.sqrt(s2 / n) / amp).toFixed(0),
                                  src: T('recon.probefit.src.'
                                         + (refProbeSource || 'file')) })
      : T('recon.probefit.have', { n: refProbes.length });
  }

  /**
   * The coil fit's own line: what the two sigmas currently mean, and — after
   * a run that used them — how far the fit actually moved the currents.
   *
   * ★The excursion is read off the ANSWER (`last.coilFit`), never
   * recomputed from the controls: the sliders say what was ASKED, and「how
   * far did it go」 is the one number only the solve knows.  The same
   * distinction the batch queue's provenance columns are built on.
   */
  function drawCoilFitNote() {
    var el = $('coilfit-note');
    if (!el) return;
    var txt = T('recon.coilfit.note',
                { c: (+$('coilsig').value).toFixed(3),
                  l: (+$('loopsig').value).toFixed(3) });
    var cf = last && last.coilFit;
    if (cf)
      txt += ' ' + T('recon.coilfit.done',
                     { n: cf.fitted, pull: (+cf.pull).toPrecision(3),
                       cap: +cf.cap });
    el.innerHTML = txt;
  }

  /** What the two chord channels did this run: fitted density, Faraday rows. */
  function drawPointNote() {
    var el = $('point-note');
    if (!el) return;
    var bits = [];
    var have = !!(refPoint.nel || refPoint.faraday);
    var pmeas = last && last.pointMeas;
    bits.push(T(pmeas && pmeas.synthetic ? 'recon.point.src.twin'
                : refPoint.source === 'deck' ? 'recon.point.src.deck'
                : have ? 'recon.point.src.file' : 'recon.point.src.none',
                { n: (refPoint.nel || []).length,
                  drop: deckPoint ? (deckPoint.fringe_dropped || []).length : 0 }));
    var df = last && last.densityFit;
    if (df)
      bits.push(T(df.atEdge ? 'recon.point.dfit.edge' : 'recon.point.dfit', {
        ne0: (df.ne0 / 1e19).toFixed(2), a: df.peaking.toFixed(2),
        n: df.used, rms: (Math.sqrt(df.chi2 / df.used) * 100).toFixed(1) }));
    var fr = last && last.fitRows;
    if (fr && fr.faraday)
      bits.push(T('recon.point.far.on', {
        n: fr.faraday, it: fr.faradayIterations,
        w: fr.faradayWeight.toExponential(2) }));
    else if (fr && fr.faradayError)
      bits.push(T('recon.point.far.failed', { why: fr.faradayError }));
    else if ($('farfit').checked)
      bits.push(T('recon.point.far.idle'));
    if (last && last.faraday) {
      var d = 0, m = last.faraday.measDeg, mo = last.faraday.modelDeg, c = 0;
      for (var i = 0; i < m.length; i++) {
        if (!isFinite(m[i])) continue;
        d += (mo[i] - m[i]) * (mo[i] - m[i]); c += 1;
      }
      if (c) bits.push(T('recon.point.far.resid',
                         { rms: Math.sqrt(d / c).toFixed(3), n: c }));
      //: ★the rows against the field, the probes' own check: if these two
      //: disagree the constraint is not measuring what its label says
      if (isFinite(last.faraday.rowsVsFieldRel))
        bits.push(T('recon.point.far.rows',
                    { rel: (100 * last.faraday.rowsVsFieldRel).toFixed(2) }));
    }
    el.innerHTML = bits.join(' ');
  }

  function drawTables() {
    var th = $('th-pin');
    if (th) th.style.display = pinned ? '' : 'none';
    if (!last) { $('scalars').innerHTML = ''; $('coefs').innerHTML = ''; return; }
    var r = last.result, t = last.truth, tq = last.truthQ, q = last.q;
    //: `t` is the twin's truth, `refCase` an imported delivered equilibrium;
    //: only one of the two can be on screen, and which one the header says
    var R2 = source === 'twin' ? null : refCase;
    var span = function (o) { return ((o.psiAxis - o.psiBnd) / (2 * Math.PI)).toFixed(4); };
    var f2 = function (v, d) { return isFinite(v) ? v.toFixed(d) : '—'; };
    var P = pinned;
    var pv = function (fn) { return P ? fn(P) : null; };
    var html = '';
    html += row(T('recon.row.axisr'), f2(r.axisR, 3),
                t ? f2(t.axisR, 3) : R2 && f2(R2.axisR, 3),
                pv(function (p) { return f2(p.result.axisR, 3); }));
    html += row(T('recon.row.axisz'), f2(r.axisZ, 3),
                t ? f2(t.axisZ, 3) : R2 && f2(R2.axisZ, 3),
                pv(function (p) { return f2(p.result.axisZ, 3); }));
    html += row(T('recon.row.span'), span(r), t && span(t));
    html += row(T('recon.row.r0'), f2(r.shape.r0, 3), t && f2(t.shape.r0, 3));
    html += row(T('recon.row.a'), f2(r.shape.a, 3), t && f2(t.shape.a, 3));
    html += row(T('recon.row.kappa'), f2(r.shape.kappa, 3), t && f2(t.shape.kappa, 3));
    html += row(T('recon.row.q0'), f2(q && q.q0, 3),
                tq ? f2(tq.q0, 3) : R2 && f2(R2.q0, 3),
                pv(function (p) { return f2(p.q && p.q.q0, 3); }));
    html += row(T('recon.row.q95'), f2(q && q.q95, 3),
                tq ? f2(tq.q95, 3) : R2 && f2(R2.q95, 3),
                pv(function (p) { return f2(p.q && p.q.q95, 3); }));
    //: ★THE SAME QUANTITY IN THE SAME ROW.  The pinned cell used to print
    //: `ipFitted` — the current forward-modelled from the fitted coefficients
    //: — beside a reconstruction cell printing `result.ip`, the current the
    //: solve was constrained to.  On this shot they differ by 0.8 kA, so the
    //: comparison the pin exists for was reading a difference between two
    //: definitions as a difference between two runs.
    html += row(T('recon.row.ip'), f2(r.ip / 1e3, 1),
                t ? f2(t.ip / 1e3, 1) : R2 && f2(R2.ip / 1e3, 1),
                pv(function (p) { return f2(p.result.ip / 1e3, 1); }));
    html += row(T('recon.row.p0'), f2(last.profiles.p[0], 0),
                last.truthProfiles ? f2(last.truthProfiles.p[0], 0)
                                   : R2 && f2(R2.p0, 0));
    html += row(T('recon.row.li3'), f2(last.li3, 3), R2 && f2(R2.li3, 3),
                pv(function (p) { return f2(p.li3, 3); }));
    html += row(T('recon.row.chi2'), last.chi2.toExponential(2) + ' / ' + last.nfit);
    //: ★χ²/dof, not χ² alone: the row count moves every time a channel is
    //: switched off, and a χ² that dropped because it is scored over fewer
    //: rows is not a fit that got better
    if (last.ndof)
      html += row(T('recon.row.chi2dof'),
                  (last.chi2 / last.ndof).toExponential(2) + ' (dof ' +
                  last.ndof + ')');
    html += row(T('recon.row.rms'), rmsResidual().toExponential(2));
    html += row(T('recon.row.iter'), r.iterations + ' / ' + r.residual.toExponential(2));
    html += row(T('recon.row.bndkind'),
                T(r.bndKind === 1 ? 'recon.bnd.xpoint' : 'recon.bnd.limiter'));
    $('scalars').innerHTML = html;

    var npp = +$('npp').value;
    $('coefs').innerHTML = Array.from(r.coefs, function (c, i) {
      var lbl = i < npp ? "p′ c" + i : "FF′ c" + (i - npp);
      return '<tr><td>' + lbl + '</td><td class="num">' + c.toExponential(3) +
             '</td></tr>';
    }).join('');
    $('fitnote').innerHTML = T('recon.fitnote');
  }

  // --- an imported equilibrium as the column to be judged against -----------
  //
  // ★A delivered reconstruction (someone else's g-file) is a REFERENCE, not a
  // truth: it was produced by another code, on another basis, from a wider
  // set of channels than this page fits.  So it goes in the third column
  // beside the fit rather than replacing anything, and every number in it is
  // read from the file itself — except li(3), which is recomputed here with
  // the SAME kernel integral the fit is scored by.  Comparing this page's
  // li(3) against an a-file's `ali` would be comparing two definitions.
  /**
   * An imported g-file's 1-D profiles and boundary, in the deck's shape.
   *
   * ★The SIGN of the two derivative profiles is the g-file's, not this
   * page's: `pprime_gfile = -p'_app` (the parser's own header records why,
   * and `validate-geqdsk.mjs` checks it against a real file).  Drawing the
   * file's numbers unflipped would put the reference curve upside down and
   * every reader would conclude the fit had the sign wrong.
   */
  function curvesFromGfile(g) {
    var n = (g.qpsi || []).length;
    if (!n) return null;
    var x = new Array(n);
    for (var i = 0; i < n; i++) x[i] = i / (n - 1);
    var flip = function (a) {
      return a && a.length ? Array.prototype.map.call(a, function (v) {
        return -v; }) : null;
    };
    var out = { psi_norm: x, q: Array.prototype.slice.call(g.qpsi),
                pressure: g.pres ? Array.prototype.slice.call(g.pres) : null,
                dpressure_dpsi: flip(g.pprime), f_df_dpsi: flip(g.ffprim),
                ip: Math.abs(g.current || 0),
                axis: { r: g.rmaxis, z: g.zmaxis } };
    if (g.rbbbs && g.rbbbs.length)
      out.boundary = { r: Array.prototype.slice.call(g.rbbbs),
                       z: Array.prototype.slice.call(g.zbbbs) };
    return out;
  }

  function referenceFromGfile(g, name) {
    var q = g.qpsi && g.qpsi.length ? g.qpsi : null;
    function qAt(x) {
      if (!q) return NaN;
      var t = x * (q.length - 1), k = Math.min(q.length - 2, Math.max(0, t | 0));
      return q[k] + (t - k) * (q[k + 1] - q[k]);
    }
    var ref = {
      name: name,
      q0: q ? q[0] : NaN,
      q95: qAt(0.95),
      ip: Math.abs(g.current),
      axisR: g.rmaxis, axisZ: g.zmaxis,
      p0: g.pres && g.pres.length ? g.pres[0] : NaN,
      li3: NaN,
    };
    try {
      var gr = FyPhys.makeGrid({
        nr: g.nw, nz: g.nh,
        rmin: g.rleft, rmax: g.rleft + g.rdim,
        zmin: g.zmid - g.zdim / 2, zmax: g.zmid + g.zdim / 2 });
      ref.li3 = FyPhys.li3(gr, {
        psi: FyGeqdsk.psiFromGfile(g),
        psiAxis: -2 * Math.PI * g.simag, psiBnd: -2 * Math.PI * g.sibry,
      }, ref.ip, g.rcentr);
    } catch (e) {
      //: no kernel on this page thread, or a deck the kernel refuses: the
      //: column simply has no li(3) rather than a number from a second
      //: implementation
      ref.li3 = NaN;
    }
    return ref;
  }

  // --- posterior ------------------------------------------------------------
  //
  // ★The spread is over ONE thing — the kinetic constraint's own sigma, the
  // `压强测量噪声` slider — with the magnetics held exactly as measured.  The
  // reference figure this reproduces says the same in its title ("MC over
  // pressure+thomson_ne sigma"); the app has the pressure half of that and
  // not the Thomson half, because the device document carries a pressure
  // profile and no n_e measurement.  A band drawn from one input and read as
  // covering all of them is the failure mode here, so the note under the
  // table names what is varied and what is not.

  function fmtPost(st, scale, dec) {
    if (!st) return '—';
    var k = scale || 1;
    return (st.mean * k).toFixed(dec) + ' ± ' + (st.sigma * k).toFixed(dec);
  }
  function fmtPct(st, scale, dec) {
    if (!st) return '—';
    var k = scale || 1;
    return (st.p16 * k).toFixed(dec) + ' / ' + (st.p50 * k).toFixed(dec) +
           ' / ' + (st.p84 * k).toFixed(dec);
  }

  /**
   * The sources the reader has switched on, spelled for the status line.
   *
   * ★A SOURCE AT ZERO IS STILL A SOURCE.  The switch says which inputs the
   * ensemble is drawn over; the slider says how much.  Setting the pressure
   * sigma to zero and running is a CONTROL — every member must then be the
   * same fit and the spread exactly zero, which is the only way to show that
   * the spread is caused by what it claims.  Refusing that run would remove
   * the check rather than protect it; what is refused is an ensemble with no
   * source SELECTED at all.
   */
  function mcSourcesOn() {
    var out = [];
    if ($('kin').checked && $('mc-pres').checked)
      out.push(T('recon.mc.name.pres', { s: (+$('knoise').value * 100).toFixed(1) }));
    if (+$('mcloops').value > 0)
      out.push(T('recon.mc.name.loops', { s: (+$('mcloops').value * 100).toFixed(1) }));
    if (+$('mccoils').value > 0)
      out.push(T('recon.mc.name.coils', { s: (+$('mccoils').value * 100).toFixed(1) }));
    if ($('mc-basis').checked) out.push(T('recon.mc.name.basis'));
    return out;
  }

  /**
   * The sources the ENSEMBLE was actually drawn over, from the worker's list.
   *
   * ★Same names, read off `posterior.varied` instead of off the switches —
   * see the note in `drawPosterior`.  The tokens are the worker's
   * (`mcSources`), so a source added there and not here shows as its own
   * token rather than silently vanishing from the sentence.
   */
  var MC_NAME = { kinetic_pressure_sigma: 'recon.mc.name.pres',
                  flux_loop_sigma: 'recon.mc.name.loops',
                  coil_current_sigma: 'recon.mc.name.coils',
                  basis_order: 'recon.mc.name.basis' };
  function variedNames(list) {
    return (list || []).map(function (v) {
      if (!MC_NAME[v.source]) return v.source;
      return T(MC_NAME[v.source],
               { s: isFinite(v.relative) ? (100 * v.relative).toFixed(1) : '—' });
    });
  }

  function drawPosterior() {
    if (!posterior) { $('posterior').innerHTML = ''; $('mc-gap').innerHTML = ''; return; }
    var st = posterior.stats;
    var rows = [
      [T('recon.row.q0'), st.q0, 1, 3],
      [T('recon.row.q95'), st.q95, 1, 3],
      [T('recon.row.ip'), st.ip, 1e-3, 1],
      [T('recon.row.p0'), st.p0, 1, 0],
      [T('recon.row.li3'), st.li3, 1, 3],
      [T('recon.row.chi2w'), st.chi2, 1, 6],
      [T('recon.row.axisr'), st.axisR, 1, 4],
      [T('recon.row.axisz'), st.axisZ, 1, 4],
    ];
    $('posterior').innerHTML = rows.map(function (r) {
      return '<tr><td>' + r[0] + '</td><td class="num">' +
             fmtPost(r[1], r[2], r[3]) + '</td><td class="num">' +
             fmtPct(r[1], r[2], r[3]) + '</td></tr>';
    }).join('');
    $('mc-gap').innerHTML = T('recon.mc.gap', {
      n: posterior.nOk, want: posterior.n,
      //: ★NAMED FROM THE ANSWER (`posterior.varied`), not from the switches.
      //: The switches are the request, and a slice can take a source away
      //: after it is made — a magnetics-only instant has no pressure to
      //: perturb however firmly 「压强约束 σ」 is ticked.  The worker refuses
      //: an ensemble with nothing left, so an empty list cannot reach here;
      //: what can is a SHORTER list than the switches show.
      what: variedNames(posterior.varied).join('、') || T('recon.mc.name.none'),
      seed: posterior.seed,
    }) + (posterior.at ? ' ' + T('recon.mc.at', { t: posterior.at }) : '')
      + (posterior.failed.length
      ? ' ' + T('recon.mc.failed', { k: posterior.failed.length,
                                     why: posterior.failed[0].why })
      : '');
  }

  function runPosterior() {
    if (S.isBusy() || !grid()) return;
    //: ★a posterior with NOTHING varied is not an error bar, it is the same
    //: fit N times.  Say which switch is missing rather than returning a
    //: column of zeros that reads as "this quantity is certain".
    var srcs = mcSourcesOn();
    if (!srcs.length) {
      setBusy(false, T('recon.mc.nosource'), 'warn');
      return;
    }
    posterior = null;
    drawProfiles();
    drawPosterior();
    setBusy(true, T('recon.mc.running', { n: +$('mcn').value }));
    S.progress(0);
    var m = reconMessage();
    m.cmd = 'recon_mc';
    m.members = +$('mcn').value;
    //: ★★THE BAND BELONGS TO THE FIT ON SCREEN (T-A16).  This message was
    //: built without the slice, so pressing 跑后验 after picking an instant
    //: drew error bars for the REFERENCE fit under figures showing the picked
    //: one — measured on #137985: picked t = 2.5 s (magnetics only, 401.54 kA)
    //: and sampled t = 4 s (delivered pressure, 393.46 kA).  Naming the slice
    //: is all it takes, because `recon_mc` resolves it through the same
    //: `atSlice` the single fit does.
    if (sliceOn) m.slice = sliceOn.slice;
    //: the pressure source has its own switch: unchecking it must leave the
    //: fit's own constraint alone and only stop the RE-DRAWING
    if (!$('mc-pres').checked) m.kinetic = Object.assign({}, m.kinetic,
                                                         { noise: 0 });
    S.send(m);
  }

  function onPosterior(m) {
    posterior = m;
    //: which instant these error bars are about, stamped like the fit's own
    posterior.at = sliceOn ? sliceOn.label : null;
    drawProfiles();
    drawPosterior();
    S.progress(1);
    setBusy(false, T('recon.mc.done', {
      n: m.nOk, want: m.n, ms: m.ms,
      q95: m.stats.q95 ? m.stats.q95.mean.toFixed(3) : '—',
      sq95: m.stats.q95 ? m.stats.q95.sigma.toFixed(3) : '—' }),
      m.nOk < m.n ? 'warn' : '');
  }

  // --- worker ---------------------------------------------------------------

  function onReady(m) {
    setBusy(false, T('status.kernel_ready2', { coils: m.timing.coils,
                                               loops: m.timing.loops }));
    drawAll();
    //: no compute on load; the button asks
    if (!HAS_REF) noReferenceNotice();
  }

  function onError(m) {
    setBusy(false, T('recon.fail', { where: m.where || '', why: m.message }),
            'err');
    S.progress(0);
    //: ★★A RUN THAT FAILED MUST NOT LEAVE THE PREVIOUS ANSWER STANDING AS
    //: THIS ONE.  `last` is untouched by a failure — correctly, the figures
    //: are still a real fit — but the verdict is the one line that claims to
    //: be about the run you just asked for.  Measured on this deck: picking
    //: each of the nine slices in turn, eight of them do not converge, and
    //: the verdict went on reading "t = 2 s (the slice picked on the time
    //: series)" with the 2 s numbers under every one of them.  The status
    //: line said so all along; the verdict did not.
    failed = { label: sliceOn ? sliceOn.label : null, why: m.message };
    emitOutcome(false, { why: m.message });
    drawVerdict();
  }

  function onRecon(m) {
    last = m;
    failed = null;
    //: which upstream answer this run was made with — see `drawKineticSource`
    last.profileAt = profileUsedAt;
    //: ★★WHAT THIS FIT WAS, STAMPED ON THE FIT (T-A15).  `m.ipConstraint` is
    //: the current the worker actually imposed and `m.channelBasis` the basis
    //: it actually fitted in; these two lines add the third thing only the
    //: page knows — WHICH INSTANT was asked about, and hence where that
    //: current came from.  All three are read off the ANSWER: a failed run
    //: leaves `last` untouched, so a file exported after one still describes
    //: the fit whose numbers are on the figures.
    last.sliceAt = sliceOn
      ? { time: sliceOn.slice.time, label: sliceOn.label,
          synthetic: !!sliceOn.synthetic } : null;
    last.ipSource = (sliceOn && sliceOn.ownIp) ? 'slice' : ipAsked;
    var amp = 0;
    for (var i = 0; i < m.meas.length; i++) amp = Math.max(amp, Math.abs(m.meas[i]));
    last.measAmp = amp;
    drawAll();
    S.progress(1);
    //: ★T-A17: the status line owns the provenance of what it reports — a
    //: picked synthetic slice is named as synthetic, in the same sentence
    //: as the numbers, not two panels away.
    setBusy(false, (sliceOn
        ? T(sliceOn.synthetic ? 'recon.slice.tag_twin' : 'recon.slice.tag',
            { t: sliceOn.label })
        : '') + T('recon.done', { iter: m.result.iterations,
            res: m.result.residual.toExponential(2),
            chi2: m.chi2.toExponential(2) }));
    emitOutcome(true, { residual: m.result.residual, chi2: m.chi2,
                        iterations: m.result.iterations });
  }

  /**
   * The Ip the fit is CONSTRAINED to, and where it came from.
   *
   * ★★ONE BASIS AT A TIME — AND Ip IS A CHANNEL TOO.  The basis switch moved
   * the 35 flux loops between the delivered reconstruction's channel values
   * and the raw est2 total flux, and left the Ip equality constraint on the
   * delivered a-file number in both cases.  That is exactly the mixture the
   * basis note forbids two lines further up: on this shot the two differ by
   * 1.9 % (delivered 393.46 kA vs Rogowski `pcrl01` 400.94 kA), so the raw
   * basis was asking one solution to satisfy raw loops and a delivered
   * current.  The deck already carries both numbers; the page now takes the
   * one that belongs to the basis it is fitting in, and writes down which.
   */
  function ipConstraint() {
    if (importedIp) return { value: importedIp, source: 'imported' };
    if (basis === 'raw' && R.ipMeasured)
      return { value: R.ipMeasured, source: 'raw' };
    return { value: (R.ip || 0), source: 'delivered' };
  }

  /** Everything the worker needs for a fit — one member or a whole ensemble. */
  function reconMessage() {
    //: ★stamped HERE, where the profile is actually taken for a run — see
    //: `fittedPressure`, which no longer stamps as it reads
    var pbar = S.take('profile');
    profileUsedAt = (pbar && pbar.at) || null;
    //: ★stamped HERE for the same reason: which of the deck's two currents
    //: this request is asking for.  A picked slice overrides it with its own
    //: (`runSlice`), and only the reply knows which of the two won.
    ipAsked = ipConstraint().source;
    return {
      cmd: 'recon', source: source,
      chan: Array.from(COILS),
      ip: +$('ip').value * 1e3,
      prof: { beta0: +$('beta0').value, emp: +$('emp').value,
              enp: +$('enp').value, r0: FyDevice.tf(M).r0 },
      noise: +$('noise').value, seed: +$('seed').value,
      npp: +$('npp').value, nff: +$('nff').value,
      //: the reader's channel table, deck order, one entry per loop
      loopMask: maskOf(loopOff, M.loops.length),
      //: ★★the reader's own layer, as the worker has always been able to take
      //: it: a SCALE on the deck's weight, not a replacement.  `w ∝ 1/σ`, so
      //: the multiplier goes in inverted — said here once rather than in the
      //: worker, where the column's name would no longer be visible.
      loopScale: scaleOf(loopSig, M.loops.length),
      //: ★and the deck-disowned channels this reader asked for anyway
      loopForce: maskOf(loopOn, M.loops.length, true),
      //: raw basis: hand over the TOTAL flux and let the worker remove the
      //: coils' share with the response it fits against
      loopMeasTotal: (basis === 'raw' && R.loopMeasTotal) ? R.loopMeasTotal : null,
      selfcalTol: +$('caltol').value,
      warmup: +$('warmup').value,
      solve: { maxIter: +$('maxit').value, relax: 0.3 },
      //: ★same basis as the loops — see `ipConstraint`
      ipOverride: ipConstraint().value,
      //: ★the posterior's sources ride on EVERY message, not only on the
      //: ensemble one: `recon_mc` is `recon` with a member count, and a
      //: block that existed on one of the two would be a second place for
      //: the run and its error bars to disagree about what was asked
      mc: { loops: +$('mcloops').value, coils: +$('mccoils').value,
            basis: $('mc-basis').checked },
      kinetic: { on: $('kin').checked, points: +$('kpts').value,
                 weight: +$('kw').value, noise: +$('knoise').value,
                 //: ★the profile bar's own answer, taken at the moment this
                 //: message is built.  An imported file still wins: a reader
                 //: who handed over a profile did not ask for it to be
                 //: replaced by a fit made on this page.
                 pressure: importedPressure || fittedPressure() },
      //: probes become CONSTRAINTS only when readings have been imported —
      //: the device document carries where they are, never what they read
      //: ★the twin makes its own probe readings, so the switch means what it
      //: says there; on a real shot it still needs a file, because the deck
      //: carries where the probes are and never what they read
      probeFit: { on: $('probefit').checked &&
                      (source === 'twin' ||
                       (refProbes.length > 0 &&
                        (basis === 'raw' || refProbeSource !== 'deck'))),
                  //: the shot's own per-probe validity flags — see the
                  //: worker's three-mask note.  ★★It is keyed on HAVING them,
                  //: not on where the readings came from: it used to require
                  //: `refProbeSource === 'deck'`, which meant a LIVE slice
                  //: (whose flags are its own live-channel gate) passed none
                  //: and the gate silently stopped applying.  What must hold
                  //: is the raw basis — a delivered channel value has already
                  //: had a reduction's verdict applied to it.
                  shotWeights: basis === 'raw' ? (R.probeWeights || null) : null,
                  weight: +$('probew').value,
                  mask: M.probes ? maskOf(probeOff, M.probes.length) : null,
                  scale: M.probes ? scaleOf(probeSig, M.probes.length) : null,
                  force: M.probes ? maskOf(probeOn, M.probes.length, true) : null,
                  meas: refProbes.length ? refProbes : null },
      //: ★★T-A5 — the coil currents as OBSERVATIONS.  Two sigmas, both
      //: relative, and BOTH are required: the second is the one that is easy
      //: to forget, because every deck's flux-loop weights are a 0/1 mask
      //: rather than 1/sigma, and against that the prior wins outright and
      //: the fit never moves the coils.  See `recon.coilfit.note`.
      coilFit: { on: $('coilfit').checked,
                 sigma: +$('coilsig').value,
                 loopSigma: +$('loopsig').value },
      //: ★the equilibrium sees the TOTAL pressure and the bootstrap the
      //: thermal one; this block is what tells the two apart
      pressure: { tite: +$('tite').value,
                  fastFraction: +$('pfast').value,
                  fastPeaking: +$('pfastpk').value,
                  fast: importedFast, rot: importedRot },
      //: n_e is a SEPARATE channel from the pressure: the bootstrap needs the
      //: density and the temperature apart, and the fit's p is their product
      density: { on: $('neon').checked, ne0: +$('ne0').value * 1e19,
                 peaking: +$('nepk').value, zeff: +$('zeff').value,
                 profile: importedDensity && importedDensity.ne,
                 temperature: importedDensity && importedDensity.te,
                 //: ★an imported profile WINS over a fit to the chords: a
                 //: measured profile is not something eleven line integrals
                 //: get to overrule
                 fitChords: $('pointfit').checked &&
                            !(importedDensity && importedDensity.ne) },
      //: what the chords READ — the deck's own reduction, an imported file,
      //: or the twin's synthetic set
      pointMeas: (refPoint.nel || refPoint.faraday || refPoint.bpolar)
        ? { nel: refPoint.nel, faraday: refPoint.faraday,
            bpolar: refPoint.bpolar, weightNel: refPoint.weightNel,
            weightPol: refPoint.weightPol } : null,
      pointNoise: +$('pointnoise').value,
      faraday: { on: $('farfit').checked, weight: +$('farw').value,
                 outer: +$('farit').value },
      vessel: { on: $('vesselfit').checked, rcond: +$('vridge').value,
                outer: +$('vit').value,
                //: kA on the page, amps in the message — one conversion, at
                //: the boundary the reader's number crosses
                minSurvive: +$('vminsurv').value,
                twinInject: +$('vinject').value * 1e3 },
      //: ★★T-A9 — the self-consistent outer loop.  It rides on the SAME
      //: message as everything else so the series bar and the posterior
      //: ask the same question this bar does; with `on` false the worker
      //: does not enter it and the fit is bit-for-bit the one it was.
      closure: { on: $('closure').checked, iters: +$('closit').value,
                 tol: +$('clostol').value },
      //: which σ_neo coefficients — Sauter 1999 or Redl 2021.  The two do
      //: not agree (measured against the drift-kinetic solve: 2021 within
      //: 0.3 %, 1999 low by 2.2 - 6.7 % at f_t = 0.57), so the page names
      //: which one produced the number rather than picking silently.
      sigmaVintage: +$('sigvint').value,
    };
  }

  /**
   * Fit ONE slice of the deck's time series, and say which one is on screen.
   *
   * ★The slice replaces the measurements and the coil currents, not the
   * settings: everything the reader set — the basis, the masks, the weights —
   * still applies, because the question they asked has not changed, only the
   * moment it is asked about.
   *
   * ★★AND IT NAMES THE SLICE RATHER THAN RE-SPELLING IT.  This function used
   * to copy the slice's loops, weights, coils and Ip onto the request by
   * hand — a second, shorter copy of the worker's `seriesSlice`, missing the
   * slice's own `ip`, its own `prof`, and the rule that a slice with no
   * pressure of its own is fitted on magnetics alone.  The two copies
   * therefore gave OPPOSITE verdicts on the same (shot, instant): measured on
   * #137985, t = 2.5 s came back solved from the series loop and 「法方程
   * 奇异」 from this one, while t = 2.0 s did the reverse.  The rule lives in
   * one place now (`worker.js`, `seriesSlice`); this hands over the slice.
   */
  function runSlice(sl, label, opts) {
    if (S.isBusy() || !grid() || !sl) return;
    //: ★`ownIp` is what makes the session file able to say WHERE its constraint
    //: came from: a slice that carries a current of its own replaces the
    //: page's basis current (`seriesSlice`), and one that does not leaves it
    //: standing.  Recorded from the slice itself, not guessed from the tab.
    //: ★★T-A17 — and the SOURCE travels with the slice the same way.  A
    //: picked slice belongs to whatever produced it: a drive point off a
    //: synthetic sweep is a twin solve whether or not this bar's tab says
    //: 实测, and a deck slice is a measurement whether or not the tab says
    //: 孪生.  Before this, a pick off a twin sweep ran under the bar's own
    //: source — the drive point's `ip` was ignored (the real path reads
    //: `ipOverride`), the twin slice has no readings, so the fit quietly
    //: re-solved the REFERENCE instant under the picked label.  `opts.source`
    //: is the series bar's own provenance for this slice; absent, the bar's
    //: tab stands, which is what every non-pick caller means.
    var src = (opts && opts.source) || source;
    sliceOn = { slice: sl, label: label,
                ownIp: sl.ipOverride !== undefined || sl.ip !== undefined,
                synthetic: src === 'twin' };
    posterior = null;
    setBusy(true, T(sliceOn.synthetic ? 'recon.slice.solving_twin'
                                      : 'recon.slice.solving', { t: label }));
    S.progress(0.4);
    var m = reconMessage();
    m.source = src;
    m.slice = sl;
    S.send(m);
    return S.settle('recon');
  }

  function run() {
    if (S.isBusy() || !grid()) return;
    //: a plain run is the reference slice again — the cursor is not sticky,
    //: or the page would quietly keep answering about a moment the reader
    //: stopped asking about
    sliceOn = null;
    //: a posterior belongs to the inputs it was drawn from; re-fitting with
    //: anything changed makes the band a picture of the previous question
    posterior = null;
    drawPosterior();
    setBusy(true, T('recon.solving'));
    S.progress(0.4);
    S.send(reconMessage());
    //: the page's run chain waits on this: the work is in the worker,
    //: so the part is not finished when this function returns
    return S.settle('recon');
  }

  /** Say why nothing can be reconstructed on a device without a shot. */
  function noReferenceNotice() {
    //: ★say the condition, do not poke the key: the run key lives in the
    //: bar's strip now, and reaching for the page's used to throw here
    S.blockRun('recon.noref');
    $('status').innerHTML = T('recon.noref');
    $('status').className = 'status warn';
  }

  // --- file exchange ----------------------------------------------------------

  var CONTROLS = ['ip', 'beta0', 'emp', 'enp', 'noise', 'seed',
                  'kin', 'kpts', 'kw', 'knoise', 'npp', 'nff',
                  'warmup', 'maxit', 'mcn',
                  'neon', 'ne0', 'nepk', 'zeff',
                  'probefit', 'probew',
                  'coilfit', 'coilsig', 'loopsig',
                  'outk', 'mcloops', 'mccoils', 'mc-pres', 'mc-basis',
                  'pointfit', 'farfit', 'farw', 'farit', 'pointnoise',
                  'caltol', 'vesselfit', 'vridge', 'vit', 'vinject',
                  'vminsurv', 'tite', 'pfast', 'pfastpk', 'basis',
                  //: T-A9 — the closure switch, its two knobs and the
                  //: conductivity vintage.  In the session file for the
                  //: same reason every switch above is: a run that cannot
                  //: be replayed from its own file is a run nobody can
                  //: check.
                  'closure', 'closit', 'clostol', 'sigvint'];

  function jsonDoc() {
    var cfg = FySession.collect(CONTROLS, S.scope);
    cfg['fylite:source'] = source;
    cfg['fylite:channel_basis'] = basis;
    //: ★the Ip equality constraint travels with the basis, and the file says
    //: which of the deck's two currents it was — a session that replayed the
    //: loops but not the current would re-fit a different question
    //:
    //: ★★AND IT IS READ OFF THE ANSWER, NOT OFF THE QUESTION (T-A15).  This
    //: used to write `ipConstraint()` — the page's reference/basis current —
    //: while a picked slice is constrained to THAT SLICE'S OWN current.
    //: Measured on #137985: the file said 393.46 kA under fits actually
    //: constrained to 223–401 kA, one number for nine different questions.
    //: The batch queue's summary already takes it off the worker's reply
    //: (`recon` carries `ipConstraint` on success AND on failure, for exactly
    //: this reason); the session file now does the same, and `fylite:ip_source`
    //: says `slice` when the slice supplied it.  With no fit yet there is no
    //: answer to read, so the question is written — and the absent
    //: `fylite:result` block below is what says which of the two this is.
    if (source === 'real') {
      var ipc = ipConstraint();
      var fit = (last && isFinite(last.ipConstraint)) ? last : null;
      cfg['fylite:ip_constraint'] = fit ? fit.ipConstraint : ipc.value;
      cfg['fylite:ip_source'] = fit ? (fit.ipSource || ipc.source) : ipc.source;
    }
    if (last) {
      //: ★the basis the fit was made in, as the WORKER reports it — the select
      //: above is the reader's request and a slice's own readings can settle
      //: it differently (a deck slice ships total flux, so it is fitted in the
      //: raw basis whatever the select says).  Both are written: one is the
      //: question, one is the answer.
      cfg['fylite:channel_basis_fitted'] = last.channelBasis || null;
      //: which instant the result block below belongs to, when it is not the
      //: deck's reference one — and WHOSE instant it was (T-A17): a slice
      //: picked off a synthetic sweep says so here, or a re-run of the file
      //: would launder a twin solve into a measurement
      if (last.sliceAt) {
        cfg['fylite:slice_time'] = last.sliceAt.time;
        if (last.sliceAt.synthetic) cfg['fylite:slice_synthetic'] = true;
      }
    }
    //: ★the mask is part of the QUESTION, not of the answer: a session file
    //: that replayed the sliders but not the switched-off channels would
    //: re-fit a different set of measurements under the same name
    cfg['fylite:loop_mask'] = maskOf(loopOff, M.loops.length);
    if (M.probes && M.probes.length)
      cfg['fylite:probe_mask'] = maskOf(probeOff, M.probes.length);
    cfg['fylite:outlier_k'] = +$('outk').value;
    if (importedPressure) {
      cfg['fylite:imported_pressure'] = FySession.sig(importedPressure, 7);
      cfg['fylite:imported_ip'] = importedIp;
    }
    var doc = FySession.envelope('reconstruction', cfg, S.kernel());
    if (last) {
      var r = last.result;
      doc['fylite:result'] = {
        equilibrium: FySession.equilibrium(M.grid, r, last.profiles, last.q),
        magnetics: FySession.magnetics(M, last.meas, last.model, last.wts),
        pf_active: FySession.pfActive(M, COILS),
        'fylite:coefficients': Array.from(r.coefs),
        'fylite:shape': r.shape,
        'fylite:boundary_kind': r.bndKind === 1 ? 'x_point' : 'limiter',
        'fylite:chi2': last.chi2,
        'fylite:n_fitted': last.nfit,
        //: li(3) divided by an Ip nobody recorded cannot be re-derived, and
        //: the fitted current is NOT the constrained one it was solved with
        'fylite:li3': last.li3,
        'fylite:ip_fitted': last.ipFitted,
        'fylite:iterations': r.iterations,
        'fylite:residual': r.residual,
      };
      if (last.vessel && last.vessel.current)
        doc['fylite:result']['fylite:vessel_currents'] = {
          'fylite:groups': last.vessel.names,
          'fylite:current': Array.from(last.vessel.current),
          'fylite:units': 'A (total per group)',
          'fylite:distribution': last.vessel.model,
          'fylite:svd_rcond': last.vessel.rcond,
          'fylite:svd_modes_kept': last.vessel.kept,
          'fylite:svd_condition': last.vessel.condition,
          'fylite:svd_singular': last.vessel.singular,
          'fylite:truth': last.vessel.truth
            ? Array.from(last.vessel.truth) : null,
        };
      //: ★a REFUSAL travels with its cause (T-A6).  The page learned this
      //: lesson already (the assembled block above says why); the FILE
      //: still recorded a refusal as an absent block, which a reader
      //: cannot tell from「涡流拟合没开」.  No `fylite:current` key is
      //: the refusal — never a zero.
      else if (last.vessel)
        doc['fylite:result']['fylite:vessel_currents'] = {
          'fylite:groups': last.vessel.names,
          'fylite:error': last.vessel.error || 'not-identifiable',
          'fylite:svd_modes_kept': last.vessel.kept,
          'fylite:survive': last.vessel.survive,
          'fylite:truth': last.vessel.truth
            ? Array.from(last.vessel.truth) : null,
        };
      if (last.kineticX && last.kineticX.length)
        doc['fylite:result']['fylite:kinetic_points'] = {
          //: ★prefixed -- the same term is written `fylite:psi_norm` at the
          //: bootstrap block below and by every Python writer
          'fylite:psi_norm': FySession.sig(last.kineticX, 7),
          pressure: FySession.sig(last.kineticP, 7),
        };
      //: the posterior travels with the fit it belongs to, members and all:
      //: a sigma in a file with no record of what was varied, over how many
      //: members, at which seed, cannot be checked by anyone downstream
      if (posterior)
        doc['fylite:result']['fylite:posterior'] = {
          'fylite:members': posterior.n,
          'fylite:members_ok': posterior.nOk,
          'fylite:seed': posterior.seed,
          //: ★A LIST, and each entry says what it is relative to.  The old
          //: single string was true when the pressure was the only source;
          //: the moment a second one existed it would have been a file that
          //: names one input and covers three.
          'fylite:varied': posterior.varied || [],
          'fylite:sigma_relative': posterior.sigmaP,
          'fylite:statistics': posterior.stats,
          'fylite:member_values': posterior.members,
        };
      if (last.truth)
        doc['fylite:result']['fylite:truth'] =
          FySession.equilibrium(M.grid, last.truth, last.truthProfiles,
                                last.truthQ);
    }
    return doc;
  }

  //: ★HANDING THE RECONSTRUCTION TO THE MODELLING SCENARIO, without a round
  //: trip through the file picker.  What travels is the SAME g-file the export
  //: menu writes — one format, one meaning — and the file path stays for
  //: everything the browser cannot carry (another machine, an archive, a
  //: colleague).
  //: ★★2026-09-01：「建模场景交来的预测剖面」那一格撤下。给的那一端（建模页的
  //: 「交给反演场景」）同批撤掉，而这一格**只认 `kind === 'profile'`**，没有第二个
  //: 来源——留着就是一个永远收不到东西的控件。预测剖面照旧从导入按钮进来，走的是
  //: 同一个 `FORMATS.profile.apply`。

  function handOver() {
    var el = document.getElementById('analysis-handoff');
    if (!el) return;
    el.addEventListener('click', function () {
      var g = FORMATS.gfile.build();
      if (typeof g !== 'string')
        return S.report(T('handoff.nothing'), 'warn');
      var why = FyHandoff.put({ kind: 'gfile', from: 'analysis',
                                bar: 'reconstruction',
                                name: FORMATS.gfile.filename, text: g });
      if (why) return S.report(T(why), 'warn');
      S.report(T('handoff.gave', { what: T('handoff.kind.gfile') }));
    });
  }

  var FORMATS = {
      gfile: {
        text: true,
        label: T('io.label.gfile'),
        filename: function () {
          //: the g-file's own convention is `g<shot>.<ms>`; the machine goes
          //: in front because two machines can carry the same shot number
          var t = R.time_s === undefined ? 0 : Math.round(R.time_s * 1000);
          return source === 'twin' ? 'g_' + fileStem() + '.00000'
            : 'g' + (R.shot || 0) + '.' + String(t).padStart(5, '0');
        },
        accept: '.00000,.geqdsk,g*,text/plain',
        exportHint: T('recon.g.export_hint'),
        importHint: T('recon.g.import_hint'),
        build: function () {
          if (!last) return { error: T('recon.g.none') };
          var args = FyIO.gfileArgs(M, last.result, last.profiles, last.q,
            'fylite recon ' + (source === 'real' ? '#' + R.shot : 'twin'));
          return FyGeqdsk.format(args);
        },
        apply: function (text, name) {
          var g = FyGeqdsk.parse(text);
          if (!g.pres || !g.pres.length)
            throw new Error(T('recon.g.nopres'));
          importedPressure = g.pres.slice();
          importedIp = Math.abs(g.current) || null;
          //: the same file answers two different questions — what to fit
          //: (its pressure) and what to be judged against (its own solved
          //: equilibrium).  Both are taken; neither is inferred from the
          //: other.
          refCase = referenceFromGfile(g, name);
          //: ★an imported g-file replaces the DECK's delivered curves as
          //: well as its scalars: a reader who hands one over means that one
          refCurves = curvesFromGfile(g);
          if (source !== 'real') setSource('real');
          $('kin').checked = true;
          $('kin-note').innerHTML =
            T('recon.kin.imported', { name: name, n: g.pres.length,
                                      ip: (importedIp / 1e3).toFixed(1) }) +
            ' <button type="button" class="link-btn" id="' +
            S.id('kin-reset') + '">' +
            T('recon.kin.reset') + '</button>';
          $('kin-reset').addEventListener('click', function () {
            importedPressure = null; importedIp = null;
            refCase = deckRefCase(); refCurves = deckRef;
            setSource('real');
            run();
          });
          //: 不自动开算——导入说的是「算什么」，不是「现在就算」
                    return T('recon.g.imported', { name: name });
        },
      },
      json: {
        docPage: 'reconstruction',
        label: T('io.label.json'),
        filename: function () { return fileStem() + '_recon_session.json'; },
        accept: '.json,application/json',
        exportHint: T('recon.j.export_hint'),
        importHint: T('recon.j.import_hint'),
        build: function () { return JSON.stringify(jsonDoc(), null, 1); },
        apply: function (text, name) {
          var doc = FySession.parse(text);
          if (doc['fylite:page'] !== 'reconstruction')
            throw new Error(T('msg.wrong_page', { page: doc['fylite:page'] }));
          var cfg = doc['fylite:config'];
          var r = FySession.apply(cfg, S.scope);
          importedPressure = cfg['fylite:imported_pressure'] || null;
          importedIp = cfg['fylite:imported_ip'] || null;
          applyMask(loopOff, cfg['fylite:loop_mask']);
          applyMask(probeOff, cfg['fylite:probe_mask']);
          basis = cfg['fylite:channel_basis'] === 'raw' ? 'raw' : 'delivered';
          if ($('basis')) $('basis').value = basis;
          setSource(cfg['fylite:source'] === 'twin' ? 'twin' : 'real');
          syncLabels();
          // NOT setBusy(true) before run(): run() opens with `if (busy)
          // return`, so marking busy first silently swallows the run
          //: 不自动开算——导入说的是「算什么」，不是「现在就算」
                    return T('recon.j.imported', { name: name, n: r.applied.length,
            skipped: r.skipped.length
                     ? T('msg.skipped', { n: r.skipped.length }) : '' });
        },
      },
      //: the profile-fitting page's output, taken straight in as the
      //: kinetic constraint — that page exists to be this page's front end
      profile: {
        docPage: 'profile', docKey: 'fylite:pressure',
        label: T('recon.label.profile'),
        filename: function () { return fileStem() + '_pressure.json'; },
        accept: '.json,application/json',
        exportHint: T('recon.pr.export_hint'),
        importHint: T('recon.pr.import_hint'),
        build: function () {
          if (!last) return { error: T('recon.g.none') };
          var doc = FySession.envelope('profile', {}, S.kernel());
          doc['fylite:pressure'] = FySession.sig(last.profiles.p);
          doc['fylite:pressure_grid'] = 'uniform_psi_normalised';
          //: this profile is a RECONSTRUCTION OUTPUT, not a measurement —
          //: a file that forgot which it was could come back in as data
          doc['fylite:provenance'] = 'reconstruction-output';
          return JSON.stringify(doc, null, 1);
        },
        apply: function (text, name) {
          var doc = FySession.parse(text, { config: false });
          var pr = doc['fylite:pressure'];
          if (!pr || !pr.length) throw new Error(T('recon.pr.no_pressure'));
          importedPressure = pr.slice();
          if (source !== 'real') setSource('real');
          $('kin').checked = true;
          //: a profile that was FITTED says which order and who chose it; one
          //: that was measured and handed over says neither, and printing
          //: "— 阶，由 GCV 选" for it describes a fit that never happened
          var fit = doc['fylite:fit'];
          $('kin-note').innerHTML = (fit ? T('recon.pr.note', {
            name: name, n: pr.length,
            order: fit['fylite:order'] === undefined ? '—'
                                                     : fit['fylite:order'],
            by: T(fit['fylite:order_chosen_by'] === 'user'
                  ? 'recon.pr.by_user' : 'recon.pr.by_gcv') })
            : T('recon.pr.note_raw', {
                name: name, n: pr.length,
                prov: doc['fylite:provenance'] || '—' })) +
            ' <button type="button" class="link-btn" id="' +
            S.id('kin-reset') + '">' +
            T('recon.kin.reset') + '</button>';
          $('kin-reset').addEventListener('click', function () {
            importedPressure = null; importedIp = null;
            setSource('real'); run();
          });
          //: 不自动开算——导入说的是「算什么」，不是「现在就算」
                    return T('recon.pr.imported', { name: name });
        },
      },
      kinetic: {
        docPage: 'kinetic', docKey: 'fylite:density',
        label: T('recon.label.kinetic'),
        filename: function () { return fileStem() + '_kinetic.json'; },
        accept: '.json,application/json',
        exportHint: T('recon.kin.export_hint'),
        importHint: T('recon.kin.import_hint'),
        build: function () {
          if (!last || !last.bootstrap || last.bootstrap.error)
            return { error: T('recon.ne.nofit') };
          var bs = last.bootstrap;
          var doc = FySession.envelope('kinetic', {}, S.kernel());
          doc['fylite:psi_norm'] = FySession.sig(bs.x);
          doc['fylite:density'] = FySession.sig(bs.ne);
          doc['fylite:temperature'] = FySession.sig(bs.te);
          doc['fylite:z_eff'] = bs.zeff;
          //: an EXPORT of what this page used, which for a parametrised
          //: shape is not a measurement — re-importing it must not be able
          //: to launder an assumption into data
          doc['fylite:provenance'] = bs.source === 'imported'
            ? 'imported-kinetic-profiles'
            : (last.densityFit ? 'density-fitted-to-interferometer'
                               : 'page-parametrised-density') +
              '; temperature ' + bs.teSource;
          //: ★a density that was FITTED says so, and says to what: the same
          //: two numbers with different provenance are a measurement and an
          //: assumption, and only the file can still tell them apart
          if (last.densityFit)
            doc['fylite:density_fit'] = {
              'fylite:source': 'interferometer_chords',
              'fylite:n_e0': last.densityFit.ne0,
              'fylite:peaking': last.densityFit.peaking,
              'fylite:peaking_step': last.densityFit.step,
              'fylite:chords_used': last.densityFit.used,
              'fylite:residual_rms_relative':
                Math.sqrt(last.densityFit.chi2 / last.densityFit.used),
              'fylite:family': 'n_e0 (1 - psi_norm)^peaking',
              'fylite:at_scan_edge': !!last.densityFit.atEdge,
            };
          doc['fylite:bootstrap'] = {
            'fylite:j_bs': FySession.sig(bs.jBs),
            'fylite:units': 'A/m^2 (|<j.B>|/B0)',
            'fylite:model': 'redl-2021',
            'fylite:trapped_fraction': FySession.sig(bs.ft),
            //: ★the inputs are here to be RE-RUN, and the answer they feed
            //: is a ratio of logarithmic derivatives — seven digits in them
            //: is a part in 1e-6 out.  Twelve, for the same reason the psi
            //: map carries twelve.
            'fylite:inputs': {
              eps: FySession.sig(bs.inputs.eps, 12),
              q: FySession.sig(bs.inputs.q, 12),
              ne: FySession.sig(bs.ne, 12), te: FySession.sig(bs.te, 12),
              ti: FySession.sig(bs.inputs.ti, 12), ni: FySession.sig(bs.inputs.ni, 12),
              zeff: FySession.sig(bs.inputs.zeff, 12),
              p_th: FySession.sig(bs.inputs.pTh, 12),
              i_psi: FySession.sig(bs.inputs.iPsi, 12),
              psi_bar: FySession.sig(bs.inputs.psiBar, 12),
              r_maj: bs.inputs.rMaj, b0: bs.inputs.b0,
            },
          };
          if (bs.vintages) doc['fylite:neo_vintages'] = {
            'fylite:units': 'NEO normalised <j.B>',
            'fylite:sauter_1999': FySession.sig(bs.vintages.sauter1999),
            'fylite:redl_2021': FySession.sig(bs.vintages.redl2021),
          };
          //: ★T-A9 — the三条可加的曲线 and everything they were built
          //: from.  Twelve digits on the geometry for the same reason the
          //: bootstrap inputs carry twelve: this block exists to be
          //: RE-RUN from a file, and the conversion it states is an
          //: identity — checking it at seven digits would be checking the
          //: file's rounding.
          var cl = bs.closure;
          if (cl && !cl.error) doc['fylite:current_closure'] = {
            'fylite:units': cl.unit,
            'fylite:sigma_model': cl.vintage === 0 ? 'sauter-1999'
                                                   : 'redl-2021',
            'fylite:j_total': FySession.sig(cl.jTot, 12),
            'fylite:j_bootstrap': FySession.sig(cl.jBs, 12),
            'fylite:j_ohmic': FySession.sig(cl.jOhm, 12),
            'fylite:j_total_toroidal': FySession.sig(cl.jTotTor, 12),
            'fylite:j_bootstrap_toroidal': FySession.sig(cl.jBsTor, 12),
            'fylite:j_ohmic_toroidal': FySession.sig(cl.jOhmTor, 12),
            'fylite:sigma_neo': FySession.sig(cl.sigmaNeo, 12),
            'fylite:sigma_spitzer': FySession.sig(cl.sigmaSpitzer, 12),
            'fylite:f33': FySession.sig(cl.f33, 12),
            'fylite:loop_voltage': FySession.sig(cl.vLoop, 12),
            'fylite:surface': {
              b2: FySession.sig(cl.b2, 12),
              b_tor2: FySession.sig(cl.bTor2, 12),
              f_psi: FySession.sig(cl.fPsi, 12),
              r_inv: FySession.sig(cl.rInv, 12),
              r_inv2: FySession.sig(cl.rInv2, 12),
              dv_dpsi: FySession.sig(cl.dvdpsi, 12),
              dp_dpsi: FySession.sig(cl.dpdpsi, 12),
              //: FF′ beside p′, because the two together are what the
              //: parallel and the toroidal current are BOTH built from —
              //: a file with only one of them cannot re-derive either
              ffprime: FySession.sig(cl.ffprime, 12),
              psi_bar: FySession.sig(cl.psiPr, 12),
              ratio: FySession.sig(cl.ratio, 12),
              b0: cl.b0,
            },
            'fylite:currents': {
              'fylite:i_bootstrap': cl.iBs, 'fylite:i_ohmic': cl.iOhm,
              'fylite:i_diamagnetic': cl.iDia, 'fylite:i_ladder': cl.iTot,
              //: ★T-A19's refinement witness: the same quadrature on
              //: every other surface — the gap to the fit must WIDEN on
              //: the coarser ladder, or the end treatment is a fluke
              'fylite:i_ladder_coarse': cl.iTotCoarse,
              'fylite:i_fitted': cl.ipFitted,
              'fylite:bootstrap_fraction': cl.fBs,
            },
            //: the identity the conversion asserts, measured on THIS fit
            'fylite:identity_residual': cl.identity,
          };
          if (cl && cl.error) doc['fylite:current_closure'] =
            { 'fylite:error': cl.error };
          if (last.closureLoop)
            doc['fylite:closure_loop'] = last.closureLoop;
          return JSON.stringify(doc, null, 1);
        },
        apply: function (text, name) {
          var doc = FySession.parse(text, { config: false });
          var ne = doc['fylite:density'];
          if (!ne || !ne.length) throw new Error(T('recon.ne.no_density'));
          importedDensity = { ne: ne.slice(),
                              te: (doc['fylite:temperature'] || []).slice() };
          if (!importedDensity.te.length) importedDensity.te = null;
          $('neon').checked = true;
          if (doc['fylite:z_eff']) {
            $('zeff').value = doc['fylite:z_eff'];
            syncLabels();
          }
          drawBootstrap();
          return T('recon.ne.file_imported', {
            name: name, n: ne.length,
            te: T(importedDensity.te ? 'recon.ne.with_te' : 'recon.ne.no_te') });
        },
      },

      magnetics: {
        docPage: 'magnetics', docKey: 'fylite:probe_b',
        label: T('recon.label.magnetics'),
        filename: function () { return fileStem() + '_magnetics.json'; },
        accept: '.json,application/json',
        exportHint: T('recon.mag.export_hint'),
        importHint: T('recon.mag.import_hint'),
        build: function () {
          if (!last) return { error: T('recon.g.none') };
          var doc = FySession.envelope('magnetics', {}, S.kernel());
          doc['fylite:probe_b'] = last.probes
            ? FySession.sig(last.probes.b) : [];
          doc['fylite:flux_loop'] = FySession.sig(last.model);
          doc['fylite:units'] = { probe_b: 'T', flux_loop: 'Wb/rad',
                                  point_nel: 'm^-2', point_bpolar: '1e19 m^-2 T',
                                  point_faraday: 'deg' };
          //: the chord channels ride with the point channels: they are the
          //: same kind of thing (one number per diagnostic channel) and a
          //: reader checking one against an instrument wants the other
          if (last.probes && last.probes.viaRows)
            doc['fylite:probe_via_rows'] = FySession.sig(last.probes.viaRows || []);
          if (last.probes && last.probes.rowsVsFieldRel !== undefined)
            doc['fylite:probe_rows_vs_field'] = last.probes.rowsVsFieldRel;
          if (last.point && last.point.nel)
            doc['fylite:point'] = {
              name: last.point.name,
              z: last.point.z,
              'fylite:n_e_line': FySession.sig(last.point.nel),
              'fylite:bpolar': FySession.sig(last.point.bpolar),
              'fylite:faraday_deg': FySession.sig(last.point.angleDeg),
              'fylite:chord_length_inside': FySession.sig(last.point.chordLength),
              //: the density the integral was taken through, as a SPEC —
              //: `n_e0 (1 - x^2)^alpha`, or the imported profile it used
              'fylite:density_spec': last.point.spec,
            };
          if (last.faraday)
            doc['fylite:faraday_constraint'] = {
              'fylite:rows': last.fitRows.faraday,
              'fylite:outer_iterations': last.fitRows.faradayIterations,
              'fylite:row_weight': last.fitRows.faradayWeight,
              'fylite:target': FySession.sig(last.faraday.target, 7),
              'fylite:coil_share': FySession.sig(last.faraday.coil, 7),
              'fylite:model_via_rows': last.faraday.viaRows
                ? FySession.sig(last.faraday.viaRows, 7) : null,
              'fylite:rows_vs_field_relative': last.faraday.rowsVsFieldRel,
              'fylite:units': 'integral n_e B_R ds [T m^-2]',
              'fylite:measured_deg': FySession.sig(last.faraday.measDeg, 7),
              'fylite:measurement_provenance': last.faraday.synthetic
                ? 'synthesised-from-twin-truth' : 'imported',
            };
          //: what THIS page computed, which is a prediction — re-importing it
          //: as a reference would compare a run with itself
          doc['fylite:provenance'] = 'fylite app reconstruction (predicted)';
          return JSON.stringify(doc, null, 1);
        },
        apply: function (text, name) {
          var doc = FySession.parse(text, { config: false });
          //: ★the point block is read whether or not the probes are there:
          //: one file carries every channel this page can be given, and a
          //: reader who has chords but no probe readings must not be told
          //: the file is unusable
          var pt = doc['fylite:point'];
          if (pt) {
            refPoint.nel = pt['fylite:n_e_line']
              ? pt['fylite:n_e_line'].slice() : null;
            refPoint.faraday = pt['fylite:faraday_deg']
              ? pt['fylite:faraday_deg'].slice() : null;
            drawPointNote();
          }
          var pb = doc['fylite:probe_b'];
          if (!pb || !pb.length) {
            if (pt) return T('recon.mag.point_only', {
              name: name,
              n: (refPoint.nel || refPoint.faraday || []).length,
              prov: doc['fylite:provenance'] || '—' });
            throw new Error(T('recon.mag.no_probes'));
          }
          if (M.probes && pb.length !== M.probes.length)
            throw new Error(T('recon.mag.count', { got: pb.length,
                                                   want: M.probes.length }));
          refProbes = pb.slice();
          drawProbes();
          return T('recon.mag.imported', { name: name, n: pb.length,
                                           prov: doc['fylite:provenance'] || '—' });
        },
      },

      device: FyIO.deviceFormat(M),
  };
  // --- remembering the desk ---------------------------------------------
  //
  // ★★A RELOAD USED TO COST EVERYTHING.  Not the results — those are a run
  // away — but the QUESTION: which channels were switched off, which basis
  // was being fitted, what the pressure weight was.  A session file could
  // save it, and a session file is what you write when you are finished, not
  // what you want after a stray refresh.  So the controls, the masks and the
  // basis ride in `localStorage`, per machine.
  //
  // ★What is NOT remembered: imported files.  A browser cannot re-open a
  // file it was handed, and a page that restored the SETTINGS of an import
  // without its data would claim a constraint it does not have.  So an
  // import is forgotten and the note says the channel is back to the deck's.
  var MEM_KEY = 'fylite:analysis:' + (M.id || M.name || 'device');

  function remember() {
    try {
      var st = { cfg: FySession.collect(CONTROLS, S.scope),
                 source: source, basis: basis,
                 loopOff: Object.keys(loopOff),
                 probeOff: Object.keys(probeOff),
                 //: ★the reader's own layer travels with the rest of it: a
                 //: sigma typed into the table is a judgement about a
                 //: channel, and losing it on a reload would make the column
                 //: a scratchpad rather than a setting.
                 loopOn: Object.keys(loopOn), probeOn: Object.keys(probeOn),
                 loopSig: loopSig, probeSig: probeSig };
      self.localStorage.setItem(MEM_KEY, JSON.stringify(st));
    } catch (e) { /* private window, quota, disabled — not worth a word */ }
  }

  function recall() {
    var raw;
    try { raw = self.localStorage.getItem(MEM_KEY); } catch (e) { return false; }
    if (!raw) return false;
    var st;
    try { st = JSON.parse(raw); } catch (e) { return false; }
    if (!st || !st.cfg) return false;
    FySession.apply(st.cfg, S.scope);
    basis = st.basis === 'raw' ? 'raw' : 'delivered';
    if ($('basis')) $('basis').value = basis;
    applyMask(loopOff, maskFromKeys(st.loopOff, M.loops.length));
    applyMask(probeOff, maskFromKeys(st.probeOff, (M.probes || []).length));
    keysInto(loopOn, st.loopOn);
    keysInto(probeOn, st.probeOn);
    sigInto(loopSig, st.loopSig);
    sigInto(probeSig, st.probeSig);
    return st;
  }

  /** `['3','7']` back into a set of forced-on indices. */
  function keysInto(tab, keys) {
    Object.keys(tab).forEach(function (k) { delete tab[k]; });
    if (Array.isArray(keys)) keys.forEach(function (k) { tab[+k] = true; });
  }

  /** The stored sigma map, taking only positive finite numbers. */
  function sigInto(tab, obj) {
    Object.keys(tab).forEach(function (k) { delete tab[k]; });
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(function (k) {
      var v = +obj[k];
      if (isFinite(v) && v > 0 && v !== 1) tab[+k] = v;
    });
  }

  /** `['3','7']` back into the 1/0 array `applyMask` reads. */
  function maskFromKeys(keys, n) {
    if (!Array.isArray(keys)) return null;
    var a = new Array(n);
    for (var i = 0; i < n; i++) a[i] = 1;
    keys.forEach(function (k) { if (+k < n) a[+k] = 0; });
    return a;
  }

  var io = S.formats(FORMATS);
  //: ★published as a BUILDER: the series bar runs this scenario's own
  //: request slice by slice, and a request captured once would be the
  //: settings as they were when the page loaded
  S.publish(function () {
    //: ★★THE REQUEST AND THE ACTION, IN SEPARATE FIELDS.  The series bar runs
    //: this scenario's own settings over many times; a reader who then points
    //: at one of those times is asking for THIS bar on that slice, so the way
    //: to ask travels beside the request rather than a second code path
    //: fitting a slice its own way.  ★They are separate FIELDS because the
    //: request is posted to a worker: a function hung on it fails structured
    //: cloning (`DataCloneError`), and it fails at the post — which stopped
    //: the series bar before its first slice.
    return { request: reconMessage(), runSlice: runSlice };
  });
  handOver();
  //: the file buttons locked with the run button before this layer
  //: existed; keep them locked while a solve is in flight

  // --- events ---------------------------------------------------------------

  SLIDERS.forEach(function (k) {
    $(k).addEventListener('input', function () { syncLabels(); remember(); });
  });
  //: every switch and every list, not only the sliders: the cheapest way to
  //: get this wrong is to remember two thirds of a desk
  CONTROLS.forEach(function (k) {
    var el = $(k);
    if (el && el.type !== 'range') el.addEventListener('change', remember);
  });
  $('basis').addEventListener('change', function () {
    basis = $('basis').value;
    //: a change of basis invalidates the fit on screen: it was made against
    //: other numbers
    drawBasis();
    S.report(T('recon.basis.changed'), 'warn');
  });
  $('tab-real').addEventListener('click', function () { setSource('real'); });
  $('tab-twin').addEventListener('click', function () { setSource('twin'); });
  $('chan-tab-loop').addEventListener('click', function () {
    chanTab = 'loop'; drawChannels(); });
  $('chan-tab-probe').addEventListener('click', function () {
    chanTab = 'probe'; drawChannels(); });
  $('chan-all').addEventListener('click', function () { setAllChannels(false); });
  $('chan-none').addEventListener('click', function () { setAllChannels(true); });
  //: ★「回到卷宗」和「全用」不是同一件事：前者是「忘掉我说过的一切」
  //: （含 σ× 与强制打开），后者只是把关掉的道打开。
  $('chan-deck').addEventListener('click', function () { setAllChannels(null); });
  $('chan-cut').addEventListener('click', cutOutliers);
  $('chan-cal').addEventListener('click', cutByCalibration);
  $('pin').addEventListener('click', pinCurrent);
  $('unpin').addEventListener('click', unpin);
  ['live', 'mag', 'kin', 'ramp', 'twin'].forEach(function (k) {
    $('preset-' + k).addEventListener('click', function () { applyPreset(k); });
  });
  $('caltol').addEventListener('input', function () {
    syncLabels();
    //: the tolerance is the KERNEL's rule, so a new value means a new answer
    //: from it — the column cannot be recoloured without re-asking
    drawChannels();
  });
  $('vesselfit').addEventListener('change', drawVesselNote);
  //: ★T-A11: ticking a switch opens the numbers that shape it — never closes
  //: them, see `syncAdvanced`
  Object.keys(ADV_GATE).forEach(function (key) {
    var box = $(ADV_GATE[key]);
    if (box) box.addEventListener('change', function () { syncAdvanced(false); });
  });
  //: and the state the page opens in is the state its switches are in
  syncAdvanced(true);
  ['tite', 'pfast', 'pfastpk'].forEach(function (k) {
    $(k).addEventListener('input', drawDecompNote);
  });
  ['pointfit', 'farfit'].forEach(function (k) {
    $(k).addEventListener('change', drawPointNote);
  });
  $('outk').addEventListener('input', drawChannels);
  ['name', 'meas', 'resid', 'w'].forEach(function (k) {
    var el = $('sort-' + k);
    if (el) el.addEventListener('click', function () {
      chanSort = k === 'w' ? 'wresid' : k;
      drawChannels();
    });
  });
  //: ★ONE listener for the whole table rather than one per row: the body is
  //: rebuilt on every draw, and per-row listeners would be re-attached 35 or
  //: 79 times a fit — and leak the ones on the rows that were replaced
  $('chan-body').addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var probe = chanTab === 'probe';
    var sigIdx = t.getAttribute('data-sig');
    if (sigIdx !== null && sigIdx !== undefined) {
      //: ★a sigma is a positive number and nothing else.  An empty box or a
      //: nonsense value goes back to 1.0 — "as the deck says" — rather than
      //: to zero, which would silently drop the channel.
      var v = parseFloat(t.value);
      var tab = probe ? probeSig : loopSig;
      if (!isFinite(v) || v <= 0) { v = 1; t.value = '1.0'; }
      if (v === 1) delete tab[+sigIdx]; else tab[+sigIdx] = v;
      remember();
      drawChannels();
      return;
    }
    var idx = t.getAttribute('data-chan');
    if (idx === null || idx === undefined) return;
    var i = +idx;
    var rows = chanRows(), row = null, j;
    for (j = 0; j < rows.length; j++) if (rows[j].i === i) { row = rows[j]; break; }
    //: ★★a DECK-DISOWNED channel is switched by the FORCE-ON map, not by the
    //: off map: the two mean different things, and folding them would make
    //: "the deck says no and I said yes" indistinguishable from "the deck
    //: said nothing and I said no".
    if (row && row.deckOff) {
      var on = probe ? probeOn : loopOn;
      if (t.checked) on[i] = true; else delete on[i];
    } else {
      var off = probe ? probeOff : loopOff;
      if (t.checked) delete off[i]; else off[i] = true;
    }
    remember();
    drawChannels();
  });
  S.onRun(run);
  $('mcrun').addEventListener('click', runPosterior);
  // Resize, theme change and language change all land here: canvas text is
  // outside FyI18n's DOM sweep, and so is prose that names the device.
  S.onRefresh(function () {
    $('loops-cap').innerHTML = T('recon.loops_cap', { n: M.loops.length });
    setSource(source);   // re-renders the notes, then redraws everything
  });

  //: the markup's defaults belong to no machine — take the device's own
  FyDevice.applyRanges(M, { setValues: true, scope: S.scope });
  //: ★AFTER the ranges, before the first draw: `applyRanges` sets values, so
  //: recalling first would have the machine's defaults overwrite the desk
  var recalled = recall();
  syncLabels();
  if (!FyDevice.hasMeasurements(M)) {
    // no bundled shot for this machine: the synthetic twin is all there is
    $('tab-real').disabled = true;
    $('tab-real').title = T('recon.tab.real.title');
    setSource('twin');
  } else {
    setSource(recalled && recalled.source === 'twin' ? 'twin' : 'real');
  }
  // ------------------------------------------------------------------
  // the one seam a live data source may drive this bar through
  // ------------------------------------------------------------------
  //
  // ★`assets/mds-source.js` reads one shot's magnetics straight off the
  // institute's MDSplus server and hands them here.  It is a SEPARATE file
  // because it is EAST-shaped (the `efit_east` tree is one machine's) and
  // because it needs a gateway process; this bar must keep working with
  // neither.  Three functions wide, for the same reason the device-data page's
  // seam is: the source needs to know how many channels this deck has and to
  // hand over a slice — nothing else.
  //
  // ★★AND IT REPLACES THE REFERENCE DISCHARGE IN PLACE.  `R` is captured by
  // every function in this closure, so a new object would be read by none of
  // them; the keys are swapped inside the object the bar already holds.  What
  // is DROPPED matters as much as what is set: `delivered`, `pres` and the
  // POINT block belong to the shipped shot and would be a lie about any other,
  // so they go, and the 参考 column goes with them.
  self.FyRecon = {
    device: function () { return { id: M.id, name: M.name,
                                   loops: (M.loops || []).length,
                                   probes: (M.probes || []).length }; },
    /**
     * Be told how the fit on the CURRENT live slice went (T-A21).
     *
     * ★The event is `{shot, index, time, ok}` plus `residual`/`chi2`/
     * `iterations` when it converged and `why` when it did not — the same
     * words the status line used, because a picker that paraphrased the
     * verdict would be a second opinion about the same run.
     */
    onOutcome: function (fn) { if (typeof fn === 'function') outcomeFns.push(fn); },
    /** Take a live magnetic slice. `m` is the gateway's /api/measurements. */
    useMeasurements: function (m) {
      var nP = (M.probes || []).length, nL = (M.loops || []).length;
      if (!m || !m.loops || m.loops.length < nL)
        throw new Error(T('mdssrc.err.loops', { got: m && m.loops ? m.loops.length : 0, want: nL }));

      //: ★76 channels on the wire, 79 in the deck.  The absent ones are
      //: padded with zero and weighted ZERO — never with a neighbour's value
      //: and never dropped from the vector, which would shift every channel
      //: after them onto the wrong geometry.
      var probes = new Array(nP), pw = new Array(nP);
      var gmin = (m.probe_gate && m.probe_gate.min_tesla) || 0.02;
      var gmax = (m.probe_gate && m.probe_gate.max_tesla) || 1.0;
      for (var i = 0; i < nP; i++) {
        var v = i < m.probes.length ? m.probes[i] : 0;
        probes[i] = isFinite(v) ? v : 0;
        var a = Math.abs(probes[i]);
        pw[i] = (i < m.probes.length && a > gmin && a < gmax) ? 1 : 0;
      }

      Object.keys(R).forEach(function (k) { delete R[k]; });
      R.shot = m.shot;
      R.time_s = m.time_s;
      liveAt = { shot: m.shot, index: m.slice_index, time: m.time_s };
      R.aturns = m.aturns.slice();
      R.ip = m.ip;
      R.ipMeasured = m.ip;
      //: ★SILOPT is the TOTAL flux the loops saw, coils included — the same
      //: basis as the shipped deck's `loopMeasTotal`, NOT its `loopMeas`
      //: (which has the coil share removed by a delivered reconstruction that
      //: does not exist for an arbitrary shot).  So the raw basis is the only
      //: one on offer, and it is forced rather than merely defaulted.
      R.loopMeasTotal = m.loops.slice(0, nL);
      //: the deck's weights, captured at load: they say which loops this
      //: MACHINE fits, which no shot changes
      R.loopWeights = DECK_LOOP_W.length === nL ? DECK_LOOP_W.slice()
                                                : new Array(nL).fill(1);
      R.probeMeas = probes;
      R.probeWeights = pw;
      //: ★★★AND THE PAGE'S OWN COPY, which is the whole point of setting the
      //: first one.  `refProbes` is captured at module load and was replaced
      //: only by a FILE import — so a live slice updated `R.probeMeas` and
      //: nothing read it: with 磁探针参与拟合 ticked after a live read, the
      //: probe rows carried the DECK's readings (#137985 @ 4.000 s) while the
      //: loops carried the picked slice.  Measured before this line existed:
      //: at t = 2.493 s the deck's probe 4 reads 0.000 and the slice's reads
      //: 1.781e-1, and the fit was given the 0.000.
      refProbes = probes.slice();
      refProbeSource = 'live';
      if (m.bcentr !== null && m.bcentr !== undefined) R.bcentr = m.bcentr;
      //: ★the flag the source note reads: these numbers came off the tree,
      //: not out of the deck, and the two cannot be described by one sentence
      R['fylite:live'] = true;
      R['fylite:channel_provenance'] = {
        loopMeas: T('mdssrc.prov', { tree: m.tree, shot: m.shot,
                                     t: (+m.time_s).toFixed(3) }),
      };

      //: ★★COIL-FITTING GOES ON, and it is not a preference.  A raw-total
      //: slice is fitted by SUBTRACTING what the coils contribute at each
      //: loop, so the coil currents are part of the measurement rather than
      //: exact numbers standing outside it.  Measured on #137985: with the
      //: coils held exact the fit diverges at outer iteration 89 (singular
      //: normal equations); with them fitted it converges — residual 1.10e-5,
      //: weighted χ² = 2.61e-3.  So the switch is set here and the note says
      //: it was, rather than leaving the reader a failure to diagnose.
      if ($('coilfit')) {
        $('coilfit').checked = true;
        var advCoil = $('adv-coilfit');
        if (advCoil) advCoil.open = true;
      }
      basis = 'raw';
      if ($('basis')) {
        $('basis').value = 'raw';
        var delivered = $('basis').querySelector('option[value="delivered"]');
        if (delivered) delivered.disabled = true;
      }
      refCase = null;
      Object.keys(loopOff).forEach(function (k) { delete loopOff[k]; });
      Object.keys(probeOff).forEach(function (k) { delete probeOff[k]; });
      last = null;
      $('tab-real').disabled = false;
      setSource('real');
      syncLabels();
      drawAll();
      return { loops: nL, probes: m.probes.length, padded: nP - m.probes.length,
               live: pw.filter(Boolean).length, coilfit: !!($('coilfit') && $('coilfit').checked) };
    },
  };

  if (recalled) S.report(T('recon.recalled'));
  S.refresh();
  if (!HAS_REF) noReferenceNotice();
  // The device notice gets its own line rather than the status line: the
  // kernel handshake lands milliseconds later and would wipe it out before
  // anyone read why the page had just reloaded.
});

// ==========================================================================
// 功能栏  series — 时间序列（逐时片重构）
// ==========================================================================

// The time axis.  This bar is registered LAST because it is the scenario's
// outermost loop: it runs the reconstruction slice by slice and draws what
// moved.  Everything about WHICH slices lives here; every slice is a full
// reconstruction in the worker, with no interpolation between them.

FyScenario.whenDevices(function () {
  'use strict';

  var M = self.FYLITE_MACHINE, R = M.reference || {};
  var T = FyI18n.t;
  var last = null, source = 'deck', imported = null;
  var serStem = function () { return stemOf(M, R, source === 'twin'); };

  var S = ANALYSIS.bar('series', {
    title: 'ser.title',
    sliders: { nslice: 0, t0: 1, t1: 1, ip0: 0, ip1: 0, b0: 2, b1: 2 },
    on: { recon_series: onSeries, error: onError },
  });
  //: ★T-A13: the page's one status line says which bar is talking
  sayWho(S, 'ser.title');
  var $ = S.$, syncLabels = S.sync, setBusy = S.setBusy;

  function setSource(s) {
    source = s;
    ['deck', 'twin', 'file'].forEach(function (k) {
      $('tab-' + k).className = s === k ? 'on' : '';
    });
    $('twin-panel').hidden = s !== 'twin';
    $('src-note').innerHTML = s === 'deck'
      ? (T(FyDevice.hasMeasurements(M) ? 'ser.src.deck' : 'ser.src.nodeck',
           { shot: R.shot, t: (R.time_s || 0).toFixed(1),
             n: deckSlices().length })
         + (M.slices && M.slices.length > 1 ? ' ' + T('ser.deck.caveat') : ''))
      : s === 'twin' ? T('ser.src.twin')
      //: ★an imported file says which of the two it is, because the answer
      //: changes what the traces MEAN — see `isSynthetic`
      : T(imported ? (imported.synthetic ? 'ser.src.file_twin' : 'ser.src.file')
                   : 'ser.src.nofile',
          { name: imported && imported.name,
            n: imported && imported.slices.length });
    draw();
  }

  /**
   * The slices the device document ships.
   *
   * ★EAST ships ONE, and that is a fact about the deck rather than about the
   * page: a document may carry `fylite:slices`, and this reads them when it
   * does.  A one-slice "series" is drawn as one point and said to be one
   * point — not extended into a line.
   */
  function deckSlices() {
    if (M.slices && M.slices.length)
      //: ★each slice whole: its own coil currents, its own Ip, its own
      //: channels.  `time` is what this bar plots against; the rest is
      //: handed to the worker as the slice's own request block.
      return M.slices.map(function (s2) {
        //: ★the pressure travels only with the slice it was measured at —
        //: the deck's delivered profile belongs to the reference time and to
        //: no other.  Every other slice is magnetics-only and says so.
        var atRef = R.time_s !== undefined &&
                    Math.abs(s2.time_s - R.time_s) < 1e-6;
        return { time: s2.time_s, loopMeasTotal: s2.loopMeasTotal,
                 loopWeights: s2.loopWeights,
                 //: ★WHICH COIL CURRENTS, and it is not obvious.  A slice
                 //: carries the shot's own Rogowski measurement; the deck
                 //: carries the delivered reconstruction's FITTED coil
                 //: currents at the reference time.  The solver treats the
                 //: coil currents as exactly known, and on this shot the raw
                 //: measurement is not good enough for that — see the note
                 //: under this panel for the measured comparison.
                 chan: $('coilsrc').value === 'deck' ? R.aturns : s2.aturns,
                 ipOverride: s2.ip, probeMeas: s2.probeMeas,
                 probeWeights: s2.probeWeights, point: s2.point,
                 pressure: atRef ? R.pres : null };
      });
    if (!FyDevice.hasMeasurements(M)) return [];
    return [{ time: R.time_s || 0, loopMeas: R.loopMeas,
              loopWeights: R.loopWeights, ipOverride: R.ip, chan: R.aturns }];
  }

  /** A synthetic ramp: the twin solved at each slice's own operating point. */
  function twinSlices() {
    var n = +$('nslice').value, t0 = +$('t0').value, t1 = +$('t1').value;
    var i0 = +$('ip0').value * 1e3, i1 = +$('ip1').value * 1e3;
    var b0 = +$('b0').value, b1 = +$('b1').value, out = [];
    for (var k = 0; k < n; k++) {
      var f = n > 1 ? k / (n - 1) : 0;
      out.push({ time: t0 + f * (t1 - t0), ip: i0 + f * (i1 - i0),
                 prof: { beta0: b0 + f * (b1 - b0) } });
    }
    return out;
  }

  function slices() {
    if (source === 'twin') return twinSlices();
    if (source === 'file') return imported ? imported.slices : [];
    return deckSlices();
  }

  /**
   * Is what is loaded a synthetic sweep rather than a discharge?
   *
   * ★An imported file can be either, and the file says which (T-A14).  This
   * is asked in three places — what to tell the worker, what to stamp on the
   * figures, what to hand the batch queue as provenance — and all three must
   * get the same answer or a simulation acquires a shot number somewhere.
   */
  function isSynthetic() {
    return source === 'twin' ||
           (source === 'file' && !!(imported && imported.synthetic));
  }

  // --- drawing --------------------------------------------------------------

  function trace(id, series, ylabel, cap) {
    var col = FyPlot.palette($(id));
    if (!series.length) series = [{ x: [0, 1], y: [0, 0], color: col.grid }];
    FyPlot.xy($(id), { series: series, xlabel: T('ser.axis.t'),
                       ylabel: ylabel, zeroLine: true });
  }

  function draw() {
    var L = last;
    var t = L ? Array.from(L.time) : null;
    //: ★T-A10: a time series' 「@时刻」 is a SPAN, and it is the span actually
    //: computed rather than the one the sliders ask for — the two differ the
    //: moment a slice fails.
    var span = (t && t.length)
      ? (+t[0]).toFixed(3).replace(/\.?0+$/, '') + '–' +
        (+t[t.length - 1]).toFixed(3).replace(/\.?0+$/, '') + ' s' : null;
    stampWith(S, function () {
      return source === 'twin' ? stampOf(M, R, true)
        : source === 'file'
          //: ★an imported SWEEP is stamped 合成 like a locally run one: what
          //: the traces are does not depend on which door they came in by
          ? (isSynthetic() ? stampOf(M, R, true)
                           : stampOf(M, R, false, null).split(' #')[0]) +
            ' · ' + T('fig.stamp.import')
          : stampOf(M, R, false, span);
    });
    var col = FyPlot.palette($('ip'));
    //: ★a single slice is drawn as a POINT.  A line through one sample is a
    //: statement about the times between samples, and there are none.
    var kind = t && t.length === 1 ? 'dots' : 'line';
    var mk = function (y, color, label) {
      return { x: t, y: Array.from(y), color: color, label: label,
               kind: kind, radius: 5, width: 2 };
    };
    trace('ip', L ? [mk(L.ipFitted.map(function (v) { return v / 1e3; }),
                       col.lcfs, T('ser.ser.ip'))] : [], T('ser.axis.ip'));
    trace('q', L ? [mk(L.q95, col.lcfs, 'q95'),
                    mk(L.q0, col.alt, 'q0')] : [], 'q');
    trace('li', L ? [mk(L.li3, col.lcfs, 'li(3)')] : [], 'li(3)');
    trace('axis', L ? [mk(L.axisR, col.lcfs, 'R_axis'),
                       mk(L.axisZ, col.alt, 'Z_axis')] : [], T('ser.axis.m'));
    trace('shape', L ? [mk(L.kappa, col.lcfs, 'κ'),
                        mk(L.a, col.alt, 'a [m]')] : [], T('ser.axis.shape'));
    trace('chi2', L ? [mk(L.chi2, col.lcfs, T('recon.row.chi2'))] : [],
          T('ser.axis.chi2'));
    drawCal();
  }

  function drawCal() {
    var body = $('caltable');
    if (!body) return;
    var sc = last && last.selfcal;
    if (!sc) {
      body.innerHTML = '';
      $('note').innerHTML = last
        ? T(last.selfcalError ? 'ser.cal.failed' : 'ser.cal.none',
            { why: last.selfcalError })
        : T('ser.idle');
      return;
    }
    var rows = [];
    for (var i = 0; i < sc.factors.length; i++)
      rows.push({ i: i, name: (M.loopNames && M.loopNames[i]) || ('FL' + (i + 1)),
                  f: sc.factors[i], s: sc.scatter[i], n: sc.slices[i] });
    //: worst first: the reason to read this table is to find the channel
    //: that does not hold still
    rows.sort(function (a, b) {
      return (isFinite(b.s) ? b.s : -1) - (isFinite(a.s) ? a.s : -1); });
    body.innerHTML = rows.map(function (r) {
      return '<tr><td class="name">' + r.name + '</td><td class="num">' +
        (isFinite(r.f) ? r.f.toFixed(4) : '—') + '</td><td class="num">' +
        (isFinite(r.s) ? (100 * r.s).toFixed(2) + ' %' : '—') +
        '</td><td class="num">' + r.n + '</td></tr>';
    }).join('');
    var worst = rows[0];
    $('note').innerHTML = T('ser.note', {
      n: last.time.length, ms: last.ms,
      failed: last.failed.length,
      worst: worst ? worst.name : '—',
      scatter: worst && isFinite(worst.s) ? (100 * worst.s).toFixed(2) : '—',
      what: T(last.synthetic ? 'ser.prov.twin'
              : source === 'file' ? 'ser.prov.file' : 'ser.prov.deck') });
  }

  /**
   * Point at a moment, see it.
   *
   * ★★A TIME TRACE YOU CAN ONLY LOOK AT IS HALF A FIGURE.  Six panels of
   * scalars answer "what moved"; the next question is always "show me that
   * one", and until now the only way to ask it was to change the settings
   * and re-run the whole batch.  The click maps back through the plot's own
   * inverse (`canvas.fyxy`), picks the NEAREST computed slice — not the
   * pixel's time, which is between samples — and hands it to the
   * reconstruction bar, whose settings are unchanged.
   */
  function pickAt(canvas, ev) {
    if (!last || !last.time || !last.time.length) return;
    var map = canvas.fyxy;
    if (!map || !map.toData) return;
    var box = canvas.getBoundingClientRect();
    var d = map.toData(ev.clientX - box.left, ev.clientY - box.top);
    if (!d.inside) return;
    var k = 0, best = Infinity;
    for (var i = 0; i < last.time.length; i++) {
      var dt = Math.abs(last.time[i] - d.x);
      if (dt < best) { best = dt; k = i; }
    }
    var sl = slices()[k];
    if (!sl) return;
    var req = S.take('reconstruction');
    if (!req || typeof req.runSlice !== 'function') {
      S.report(T('ser.pick.norecon'), 'warn');
      return;
    }
    var label = (+last.time[k]).toFixed(3).replace(/\.?0+$/, '') + ' s';
    S.report(T('ser.pick.sent', { t: label }));
    //: ★T-A17 — the source rides WITH the slice: a drive point off a twin
    //: sweep must be re-solved as the twin, not re-fitted as a measurement
    //: under the reconstruction bar's own tab.
    var src = isSynthetic() ? 'twin' : 'real';
    //: ★★A SLICE THAT DOES NOT SOLVE IS AN ANSWER, NOT A CRASH.  `runSlice`
    //: hands back the reconstruction bar's settle promise, and this dropped
    //: it — so every pick of a slice that fails to converge (four of this
    //: deck's nine do, magnetics-only) surfaced as an unhandled rejection in
    //: the console while the bar's own status line reported the failure
    //: perfectly well.  The bar has already said it; this only stops the
    //: promise escaping.
    var p = req.runSlice(sl, label, { source: src });
    if (p && typeof p.catch === 'function') p.catch(function () {});
  }

  function onSeries(m) {
    last = m;
    draw();
    S.progress(1);
    setBusy(false, T('ser.done', { n: m.time.length, ms: m.ms,
                                   failed: m.failed.length }),
            m.failed.length ? 'warn' : '');
  }

  function onError(m) {
    setBusy(false, T('ser.failed', { why: m.message }), 'err');
    S.progress(0);
  }

  function run() {
    if (S.isBusy()) return;
    var sl = slices();
    if (!sl.length) {
      setBusy(false, T('ser.no_slices'), 'warn');
      return;
    }
    setBusy(true, T('ser.running', { n: sl.length }));
    S.progress(0);
    //: ★the request is the RECONSTRUCTION bar's own, with a slice list on
    //: top: a series fitted under different settings from the single fit
    //: beside it would be two different analyses on one page.
    //: ★the request is the RECONSTRUCTION bar's own, taken off the page bus
    //: at the moment this runs: a series fitted under different settings
    //: from the single fit beside it would be two analyses on one page.
    var got = S.take('reconstruction');
    var m = got && got.request;
    if (!m) { setBusy(false, T('ser.no_request'), 'warn'); return; }
    m.cmd = 'recon_series';
    //: ★an imported SWEEP is still a sweep — see `isSynthetic`
    m.source = isSynthetic() ? 'twin' : 'real';
    m.slices = sl;
    S.send(m);
    return S.settle('recon_series');
  }

  var FORMATS = {
    series: {
      docPage: 'timeseries', docKey: 'fylite:slices',
      label: T('ser.label'),
      filename: function () { return serStem() + '_series.json'; },
      accept: '.json,application/json',
      exportHint: T('ser.export_hint'), importHint: T('ser.import_hint'),
      build: function () {
        if (!last) return { error: T('ser.nofit') };
        var doc = FySession.envelope('timeseries', {}, S.kernel());
        doc['fylite:time'] = FySession.sig(last.time, 7);
        doc['fylite:scalars'] = {};
        //: ★T-A5 — `coilPull` rides with the other per-slice scalars: how
        //: far the coil fit moved each slice's currents, in units of the σ
        //: it was given.  NaN on a slice whose coils were not fitted, which
        //: is a statement and not a hole.
        ['ipFitted', 'q0', 'q95', 'li3', 'axisR', 'axisZ', 'span', 'chi2',
         'p0', 'kappa', 'a', 'r0', 'coilPull'].forEach(function (k) {
          doc['fylite:scalars']['fylite:' + k] = FySession.sig(last[k], 7);
        });
        if (last.selfcal)
          doc['fylite:channel_calibration'] = {
            'fylite:factor': FySession.sig(last.selfcal.factors, 7),
            'fylite:scatter': FySession.sig(last.selfcal.scatter, 7),
            'fylite:slices_used': Array.from(last.selfcal.slices),
            'fylite:names': M.loopNames || null,
            'fylite:model': 'median of computed/measured across slices',
          };
        //: ★the slices that did NOT solve, named rather than left as a
        //: shorter answer: a trace with holes in it is a different statement
        //: from a trace that stops early
        if (last.failed && last.failed.length)
          doc['fylite:failed_slices'] = last.failed.map(function (f) {
            return { 'fylite:index': f.slice, 'fylite:time': last.time[f.slice],
                     'fylite:why': f.why };
          });
        //: ★what these traces ARE: a swept twin is not a discharge, and a
        //: file that forgot which it was could come back in as data
        doc['fylite:provenance'] = last.synthetic
          ? 'synthetic-twin-sweep' : 'reconstructed-from-slices';
        //: ★★THE READINGS TRAVEL WITH THE TIMES, AND THAT IS THE DECISION
        //: (T-A14).  This used to write `time` and `ip` and stop, while
        //: `apply` twenty lines down refuses a slice that carries no
        //: flux-loop readings (`ser.no_readings`) — so a series file exported
        //: by this page could not be read back by this page, and a queue
        //: could not be assembled across SHOTS because a shot's instants can
        //: only arrive in a file.
        //:
        //: Of the two ways to close that, only one is honest.  Relaxing
        //: `apply` to take a list of times would make every imported slice
        //: fall back on the reconstruction bar's own measurements — N
        //: identical fits under N different labels, a file that round-trips
        //: by dropping exactly what distinguishes its rows.  A slice IS its
        //: readings, so the readings are written: the loops (in the basis
        //: they were measured in), their weights, the coil currents THIS run
        //: used, the probes, the chords, and the delivered pressure of the
        //: one instant that has one.
        //:
        //: ★AT FULL PRECISION, unlike the traces above.  Those are answers
        //: and are rounded to 7 significant digits like every other array
        //: this app exports; these are the file's DATA, and re-running them
        //: has to be the same computation rather than a nearby one.
        //:
        //: ★A TWIN SWEEP HAS NO READINGS AT ALL — its slices are drive points
        //: (I_p, β₀) that the worker solves forward before fitting.  Those
        //: are written as drive points and the file already says
        //: `synthetic-twin-sweep`; `apply` reads that word and brings them
        //: back as a sweep, never as measurements.
        doc['fylite:slices'] = slices().map(function (s2) {
          var e = { 'fylite:time': s2.time };
          var ip = s2.ip === undefined ? s2.ipOverride : s2.ip;
          if (ip !== undefined && ip !== null) e['fylite:ip'] = ip;
          if (s2.prof) e['fylite:prof'] = s2.prof;
          //: ★WHICH BASIS THE READINGS ARE IN is part of the reading: total
          //: flux still has the coils' share in it and the delivered channel
          //: values do not.  Two keys rather than one flag, so a file cannot
          //: carry numbers under a basis it does not name.
          if (s2.loopMeasTotal)
            e['fylite:flux_loop_total'] = Array.from(s2.loopMeasTotal);
          if (s2.loopMeas) e['fylite:flux_loop'] = Array.from(s2.loopMeas);
          if (s2.loopWeights) e['fylite:weight'] = Array.from(s2.loopWeights);
          if (s2.chan) e['fylite:coil_current'] = Array.from(s2.chan);
          if (s2.probeMeas) e['fylite:probe_b'] = Array.from(s2.probeMeas);
          if (s2.probeWeights)
            e['fylite:probe_weight'] = Array.from(s2.probeWeights);
          if (s2.point) e['fylite:point'] = s2.point;
          if (s2.pressure) e['fylite:pressure'] = Array.from(s2.pressure);
          return e;
        });
        doc['fylite:slice_units'] = {
          time: 's', ip: 'A', flux_loop: 'Wb/rad', flux_loop_total: 'Wb/rad',
          coil_current: 'A-turn', probe_b: 'T', pressure: 'Pa',
        };
        return JSON.stringify(doc, null, 1);
      },
      apply: function (text, name) {
        var doc = FySession.parse(text, { config: false });
        var sl = doc['fylite:slices'];
        if (!Array.isArray(sl) || !sl.length)
          throw new Error(T('ser.no_slices_file'));
        //: ★WHAT THE FILE SAYS IT IS decides how its slices are read.  A
        //: sweep of the synthetic twin has drive points and no measurements;
        //: taking those in as measurements would launder a simulation into
        //: data, which is the one thing the provenance line exists to stop.
        var twin = doc['fylite:provenance'] === 'synthetic-twin-sweep';
        var nLoop = M.loops.length;
        var nProbe = (M.probes && M.probes.length) || 0;
        var arr = function (a) { return Array.isArray(a) ? a.slice() : null; };
        var wide = function (a, want, key) {
          if (a && a.length !== want)
            throw new Error(T(key, { got: a.length, want: want }));
          return a;
        };
        var out = [];
        for (var i = 0; i < sl.length; i++) {
          var e = sl[i];
          var flT = wide(arr(e['fylite:flux_loop_total']), nLoop,
                         'ser.bad_channels');
          var fl = wide(arr(e['fylite:flux_loop'] || e.flux_loop), nLoop,
                        'ser.bad_channels');
          var pb = wide(arr(e['fylite:probe_b']), nProbe, 'ser.bad_probes');
          out.push({ time: +e['fylite:time'],
                     //: ★each field back into the one it came out of — the
                     //: two loop bases stay apart, and the coil currents come
                     //: back as the slice's own rather than being inherited
                     //: from whatever the reconstruction bar is holding
                     loopMeasTotal: flT, loopMeas: fl,
                     loopWeights: arr(e['fylite:weight']),
                     chan: arr(e['fylite:coil_current']),
                     probeMeas: pb,
                     probeWeights: arr(e['fylite:probe_weight']),
                     point: e['fylite:point'] || null,
                     pressure: arr(e['fylite:pressure']),
                     prof: e['fylite:prof'] || undefined,
                     ip: twin && e['fylite:ip'] !== undefined
                       ? +e['fylite:ip'] : undefined,
                     ipOverride: twin ? undefined
                       : (e['fylite:ip'] === undefined ? null
                          : +e['fylite:ip']) });
        }
        var has = function (e2) { return !!(e2.loopMeas || e2.loopMeasTotal); };
        if (!twin) {
          //: a series file with no readings is a list of times, and this page
          //: cannot reconstruct a time
          if (!out.some(has)) throw new Error(T('ser.no_readings'));
          //: ★AND NOT A PARTIAL ONE EITHER.  A slice with no readings of its
          //: own does not fall back on nothing — it falls back on the
          //: reconstruction bar's measurements (`seriesSlice` only overrides
          //: what the slice brings), i.e. it would be re-fitted as the
          //: reference instant under another instant's label.  So it is
          //: refused, and the refusal names which slice.
          for (var k = 0; k < out.length; k++)
            if (!has(out[k]))
              throw new Error(T('ser.slice_no_readings',
                                { i: k + 1, t: out[k].time }));
        }
        imported = { name: name, slices: out, synthetic: twin };
        setSource('file');
        return T(twin ? 'ser.imported_twin' : 'ser.imported',
                 { name: name, n: out.length });
      },
    },
  };
  S.formats(FORMATS);

  //: ★published as a BUILDER, like the reconstruction bar's request: what the
  //: batch queue takes is「现在选中的这份时间片清单」, and a list captured at
  //: registration would be the deck's — whichever tab the reader is on.
  //: ★The SHOT travels with it, and only when there is one: a twin sweep has
  //: no shot, and a queue row carrying a real shot number over a synthetic
  //: fit is the one provenance error worse than a blank.
  S.publish(function () {
    return { slices: slices(), source: source,
             shot: source === 'deck' && FyDevice.hasMeasurements(M)
               ? (R.shot || null) : null,
             synthetic: isSynthetic(),
             name: source === 'file' ? (imported && imported.name) : null };
  });

  ['nslice', 't0', 't1', 'ip0', 'ip1', 'b0', 'b1'].forEach(function (k) {
    $(k).addEventListener('input', syncLabels);
  });
  ['deck', 'twin', 'file'].forEach(function (k) {
    $('tab-' + k).addEventListener('click', function () { setSource(k); });
  });
  //: ★when the reconstruction bar's coil fit is on, the raw currents are no
  //: longer an equality input but the CENTRE OF A PRIOR — a different
  //: statement, so a different note.  The two notes are never both shown:
  //: which one is true is decided by a switch on another bar, which is
  //: exactly why the note is redrawn rather than written into the markup.
  function coilSrcNote() {
    var v = $('coilsrc').value;
    return T(v === 'slice' && $('coilfit') && $('coilfit').checked
             ? 'ser.coilsrc.slice.fit' : 'ser.coilsrc.' + v);
  }
  //: the coil-source note answers a question the OTHER bar's switch decides,
  //: so it is redrawn from both
  if ($('coilfit'))
    $('coilfit').addEventListener('change', function () {
      if ($('coil-note')) $('coil-note').innerHTML = coilSrcNote();
    });
  $('coilsrc').addEventListener('change', function () {
    $('coil-note').innerHTML = coilSrcNote();
  });
  //: every trace is clickable, because the reader points at whichever panel
  //: showed them the thing they want to look at
  ['ip', 'q', 'li', 'axis', 'shape', 'chi2'].forEach(function (k) {
    var c = $(k);
    if (!c) return;
    c.style.cursor = 'pointer';
    c.addEventListener('click', function (ev) { pickAt(c, ev); });
  });
  S.onRun(run);
  S.onRefresh(function () { setSource(source); });
  syncLabels();
  $('coil-note').innerHTML = coilSrcNote();
  setSource(FyDevice.hasMeasurements(M) ? 'deck' : 'twin');
});

// ==========================================================================
// 功能栏  batch — 批处理 / 多炮队列（T-A12）
// ==========================================================================

// The outermost loop of all.  The series bar runs ONE shot's instants; this
// runs a LIST of (shot, instant) pairs — several shots, several sources — and
// answers with one table.
//
// ★★WHAT MAKES A QUEUE DIFFERENT FROM A LOOP: NOBODY IS WATCHING.  A single
// fit is read by the person who asked for it, and the verdict line is under
// their eyes.  N fits run unattended produce a table, and a table is exactly
// where 「求解器返回了」 becomes indistinguishable from 「解出来了」 — that is
// the failure this page was audited for on 2026-08-23, when a 3.6 cm filament
// carrying 215 MA was counted as a solved reconstruction.  So three rules
// hold here and each of them is asserted by the gate:
//
//   1. EVERY ROW SAYS WHICH OF THE THREE IT IS — 已收敛 / 未解出 / 未运行 —
//      and a rejected row carries the reason rather than a plausible number.
//      The criteria are NOT re-spelled: `notAPlasma` in the worker is the one
//      that judges (the Ip equality actually held; the boundary is a plasma
//      against the machine's own half-width), and a rejection arrives here
//      exactly as a solver failure does.
//   2. EVERY ROW CARRIES ITS PROVENANCE — which shot, which instant, which
//      channel basis — because a summary table of eleven numbers with one
//      shot number in a heading is a table nobody can check.  A synthetic
//      twin has NO shot and says so; printing a real one there would be a
//      lie rather than an omission.
//   3. A STOPPED QUEUE SAYS IT WAS STOPPED.  The previous answer is dropped
//      the moment the run begins, and the entries the interruption never
//      reached read 未运行 — not the numbers they had last time.
//
// ★The queue runs the RECONSTRUCTION bar's own request, frozen at the moment
// the run starts: a table whose rows were fitted under settings that moved
// half way down it is not a comparison of anything.  Each entry is that
// request with one slice named on it — the same `msg.slice` the single fit
// and the series loop use, so a converged row here and a single run of the
// same (shot, instant) are the same computation, not two that agree.

FyScenario.whenDevices(function () {
  'use strict';

  //: ★no `R` here, deliberately: a queue is not about one reference discharge.
  //: Which shot a row belongs to travels with the ENTRY, from whichever
  //: source it was added from.
  var M = self.FYLITE_MACHINE;
  var T = FyI18n.t;
  //: the list the reader built, and the answer to the last run of it
  var queue = [], last = null;
  //: set by the page's abort BEFORE the waiters are rejected, which is the
  //: only way this loop can tell 「读者按了停」 from 「这一片没解出来」
  var stopped = false, inflight = null;

  var S = ANALYSIS.bar('batch', {
    title: 'bat.title',
    //: ★CLAIMED, and that is the point: while this bar is the active one the
    //: queue's answers must NOT reach the single-fit bar's handlers, or every
    //: entry would repaint its figures and — worse — its `setBusy(false)`
    //: would drop the page latch this loop is holding.
    on: { recon: onEntry, error: onEntryError },
  });
  sayWho(S, 'bat.title');
  var $ = S.$, setBusy = S.setBusy;

  //: ★the whole message, not just its text.  `S.settle` rejects with an
  //: `Error`, which carries the sentence and nothing else — and what a
  //: summary row needs from a failure is the provenance beside it: which
  //: current this entry was constrained to, which basis it was fitted in.
  //: The worker reports both on the failure post; these keep them.
  function onEntry(m) { if (inflight) inflight.answer = m; }
  function onEntryError(m) { if (inflight) inflight.error = m; }

  // --- the queue ------------------------------------------------------------

  /** `#137985` / 「合成」 / a file's name — never a shot number for a twin. */
  function shotLabel(e) {
    if (e.synthetic) return T('bat.shot.synth');
    if (e.shot) return '#' + e.shot;
    return e.name || T('bat.shot.none');
  }

  function timeLabel(t) {
    return (+t).toFixed(3).replace(/\.?0+$/, '');
  }

  /**
   * Append whatever the 时间序列 bar currently has selected.
   *
   * ★TAKEN FROM THAT BAR RATHER THAN BUILT AGAIN HERE.  Which slices a deck
   * carries, what a twin sweep is, how an imported series is read — all three
   * are that bar's, already written and already gated.  A second spelling of
   * them is a second thing to keep true.
   */
  function addFromSeries() {
    var got = S.take('series');
    if (!got || !got.slices || !got.slices.length) {
      S.report(T('bat.add.none'), 'warn');
      return;
    }
    got.slices.forEach(function (sl) {
      queue.push({ slice: sl, time: sl.time,
                   shot: got.shot || null, synthetic: !!got.synthetic,
                   name: got.name || null, source: got.source });
    });
    drawQueue();
    S.report(T('bat.added', { n: got.slices.length,
                              what: T('bat.src.' + got.source),
                              who: shotLabel({ shot: got.shot,
                                               synthetic: got.synthetic,
                                               name: got.name }) }));
  }

  function drawQueue() {
    var body = $('queue');
    body.innerHTML = queue.map(function (e, i) {
      return '<tr><td class="num">' + (i + 1) + '</td>' +
        '<td>' + shotLabel(e) + '</td>' +
        '<td class="num">' + timeLabel(e.time) + '</td>' +
        '<td>' + T('bat.src.' + e.source) + '</td>' +
        '<td><button type="button" class="rowdrop" data-drop="' + i +
        '" title="' + T('bat.drop') + '">×</button></td></tr>';
    }).join('');
    //: ★how many, and from how many shots: a queue is worth having because it
    //: crosses shots, so the count that matters is the second one
    var shots = {};
    queue.forEach(function (e) { shots[shotLabel(e)] = 1; });
    $('queue-note').innerHTML = queue.length
      ? T('bat.queue.note', { n: queue.length,
                              shots: Object.keys(shots).length,
                              //: ★' · ', not '、': this list is rendered in
                              //: both languages and a Chinese enumeration
                              //: comma between "#137985" and "synthetic"
                              //: reads as a typo in English
                              names: Object.keys(shots).join(' · ') })
      : T('bat.queue.empty');
  }

  // --- one entry ------------------------------------------------------------

  /**
   * ★NEITHER THE BASIS NOR THE CONSTRAINT IS DERIVED HERE.
   *
   * Both are properties of the RESOLVED request — the bar's settings with the
   * entry's slice on top, which is `seriesSlice`'s business and lives in the
   * worker — so the worker reports them, on the answer and on the failure
   * alike, and this only reads them.  Derived here instead, for one revision,
   * they were read off the message as SENT: the nine deck slices came out
   * labelled 交付通道值 while they had in fact been fitted on their own total
   * flux, and every rejected row quoted the deck's reference current instead
   * of the current that entry was constrained to.
   */
  function rowOf(e, ans, err) {
    var got = ans || err || {};
    var r = { shot: e.synthetic ? null : (e.shot || null),
              shotLabel: shotLabel(e), time: e.time,
              source: e.source, synthetic: !!e.synthetic,
              basis: got.channelBasis || null,
              ipConstraint: isFinite(got.ip) ? got.ip
                : (ans && isFinite(ans.ipConstraint) ? ans.ipConstraint : null),
              state: ans ? 'ok' : 'reject',
              why: ans ? null : ((err && err.message) || T('bat.why.unknown')),
              ipFitted: null, q0: null, q95: null, li3: null, a: null,
              kappa: null, axisR: null, axisZ: null, chi2: null,
              iterations: null, residual: null };
    if (!ans) return r;
    r.ipConstraint = isFinite(ans.ipConstraint) ? ans.ipConstraint : null;
    r.ipFitted = ans.ipFitted;
    r.q0 = ans.q ? ans.q.q0 : null;
    r.q95 = ans.q ? ans.q.q95 : null;
    r.li3 = ans.li3;
    r.chi2 = ans.chi2;
    r.a = ans.result.shape ? ans.result.shape.a : null;
    r.kappa = ans.result.shape ? ans.result.shape.kappa : null;
    r.axisR = ans.result.axisR;
    r.axisZ = ans.result.axisZ;
    r.iterations = ans.result.iterations;
    r.residual = ans.result.residual;
    return r;
  }

  /** A row for an entry the queue never reached. */
  function pendingRow(e) {
    return { shot: e.synthetic ? null : (e.shot || null),
             shotLabel: shotLabel(e), time: e.time, source: e.source,
             synthetic: !!e.synthetic, basis: null, ipConstraint: null,
             state: 'pending', why: null,
             ipFitted: null, q0: null, q95: null, li3: null, a: null,
             kappa: null, axisR: null, axisZ: null, chi2: null,
             iterations: null, residual: null };
  }

  // --- the run --------------------------------------------------------------

  function run() {
    if (S.isBusy()) return;
    if (!queue.length) { setBusy(false, T('bat.empty'), 'warn'); return; }
    var got = S.take('reconstruction');
    var base = got && got.request;
    if (!base) { setBusy(false, T('bat.norecon'), 'warn'); return; }
    //: ★A SNAPSHOT, of both halves.  The queue may be edited and the
    //: reconstruction bar's controls may be dragged while this runs; what the
    //: table reports has to be one question asked N times.
    var entries = queue.slice();
    //: ★★THE PREVIOUS ANSWER GOES NOW, not when the new one is ready.  A
    //: queue stopped after two of eleven entries must not leave the last
    //: complete table standing as if it were this run's — that is the exact
    //: shape of 「页面报了它没做的事」 this bar exists to avoid.
    last = { rows: entries.map(pendingRow), entries: entries, base: base,
             queued: entries.length, ran: 0, interrupted: false,
             t0: Date.now(), ms: null };
    stopped = false;
    draw();
    S.progress(0);
    return step(0);
  }

  function step(i) {
    if (stopped || i >= last.entries.length) return finish();
    var e = last.entries[i];
    setBusy(true, T('bat.running', { i: i + 1, n: last.entries.length,
                                     who: shotLabel(e),
                                     t: timeLabel(e.time) }));
    //: the bar's own request with ONE slice named on it — see `runSlice`:
    //: what a slice does to a request is the worker's `seriesSlice` and is
    //: written down once
    var m = Object.assign({}, last.base);
    m.slice = e.slice;
    //: ★AND WHICH KIND OF DATA THIS ENTRY IS.  A twin entry fitted as a real
    //: measurement is not a twin at all: `reconInputs` only forward-solves
    //: the truth on the twin branch, so the swept I_p and β₀ would be read by
    //: nobody.  Measured before this line existed: two twin entries a factor
    //: of two apart in I_p came back with the same fitted current to seven
    //: digits — the same deck fit, twice.
    m.source = e.synthetic ? 'twin' : 'real';
    inflight = { entry: e, request: m, answer: null, error: null };
    S.send(m);
    return S.settle('recon').then(land, land);

    function land(x) {
      var f = inflight;
      inflight = null;
      //: ★STOPPED IS NOT REJECTED.  The abort rejects every waiter, and an
      //: entry the reader interrupted did not fail — it did not run.  It
      //: keeps its 未运行 row.
      if (stopped) return finish();
      var ans = (f && f.answer) || (x && x.type === 'recon' ? x : null);
      var err = (f && f.error) || (!ans && x ? { message: x.message } : null);
      last.rows[i] = rowOf(e, ans, err);
      last.ran = i + 1;
      S.progress((i + 1) / last.entries.length);
      draw();
      return step(i + 1);
    }
  }

  function finish() {
    last.ms = Date.now() - last.t0;
    last.interrupted = last.ran < last.queued;
    var k = counts();
    draw();
    S.progress(last.interrupted ? last.ran / last.queued : 1);
    setBusy(false, last.interrupted
      ? T('bat.interrupted', { ran: last.ran, n: last.queued,
                               ok: k.ok, bad: k.reject })
      : T('bat.done', { n: last.queued, ok: k.ok, bad: k.reject,
                        ms: last.ms }),
      last.interrupted ? 'warn' : (k.reject ? 'warn' : ''));
  }

  function counts() {
    var c = { ok: 0, reject: 0, pending: 0 };
    if (last) last.rows.forEach(function (r) { c[r.state] += 1; });
    return c;
  }

  // --- the table ------------------------------------------------------------

  var NUM = [['ipConstraint', 1e3, 1], ['ipFitted', 1e3, 1],
             ['q95', 1, 3], ['li3', 1, 4], ['a', 1, 4], ['chi2', 1, null]];

  function cell(r, k, scale, dec) {
    var v = r[k];
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var x = v / scale;
    return dec === null ? x.toExponential(2) : x.toFixed(dec);
  }

  function draw() {
    var body = $('rows');
    if (!body) return;
    if (!last) {
      body.innerHTML = '';
      $('note').innerHTML = T('bat.idle');
      $('note').className = 'note verdict';
      return;
    }
    body.innerHTML = last.rows.map(function (r, i) {
      var mark = r.state === 'ok' ? 'good' : (r.state === 'reject' ? 'bad' : '');
      return '<tr' + (r.state === 'pending' ? ' class="off"' : '') + '>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td>' + r.shotLabel + '</td>' +
        '<td class="num">' + timeLabel(r.time) + '</td>' +
        '<td>' + (r.basis ? T('bat.basis.' + r.basis) : '—') + '</td>' +
        '<td class="state ' + mark + '">' + T('bat.state.' + r.state) + '</td>' +
        NUM.map(function (c) {
          return '<td class="num">' + cell(r, c[0], c[1], c[2]) + '</td>';
        }).join('') +
        '<td class="why">' + (r.why ? r.why : '') + '</td></tr>';
    }).join('');
    var k = counts();
    $('note').innerHTML = last.interrupted
      ? T('bat.note.interrupted', { ran: last.ran, n: last.queued,
                                    ok: k.ok, bad: k.reject,
                                    left: k.pending })
      : (last.ran < last.queued
         ? T('bat.note.running', { ran: last.ran, n: last.queued })
         : T('bat.note', { n: last.queued, ok: k.ok, bad: k.reject,
                           ms: last.ms }));
    $('note').className = 'note verdict' +
      (last.interrupted ? ' warn' : (k.reject ? ' warn' : ''));
  }

  // --- file exchange --------------------------------------------------------

  function stem() {
    return (M.id || M.name || 'device').toString()
      .toLowerCase().replace(/[^a-z0-9]+/g, '') + '_batch';
  }

  /** The summary table as rows of plain values — ONE builder, two renderings,
   *  so the file and the spreadsheet cannot disagree with each other. */
  function summaryRows() {
    return last.rows.map(function (r, i) {
      return { 'fylite:index': i,
               'fylite:shot': r.shot,
               'fylite:shot_label': r.shotLabel,
               'fylite:synthetic': r.synthetic,
               'fylite:time': +(+r.time).toPrecision(9),
               'fylite:source': r.source,
               'fylite:channel_basis': r.basis || null,
               'fylite:converged': r.state === 'ok',
               'fylite:state': r.state,
               'fylite:why': r.why,
               'fylite:ip_constraint': num(r.ipConstraint),
               'fylite:ipFitted': num(r.ipFitted),
               'fylite:q0': num(r.q0), 'fylite:q95': num(r.q95),
               'fylite:li3': num(r.li3), 'fylite:a': num(r.a),
               'fylite:kappa': num(r.kappa),
               'fylite:axisR': num(r.axisR), 'fylite:axisZ': num(r.axisZ),
               'fylite:chi2': num(r.chi2),
               'fylite:iterations': r.iterations,
               'fylite:residual': num(r.residual) };
    });
  }

  /** 7 significant digits, `null` for anything that is not a number — the
   *  same rule `FySession.sig` applies to every array this app writes. */
  function num(v) {
    return (v === null || v === undefined || !isFinite(v))
      ? null : +(+v).toPrecision(7);
  }

  //: ★the CSV header is ASCII and untranslated ON PURPOSE: it is a column
  //: name a spreadsheet and a script read, not a label a reader reads, and a
  //: file whose columns change name with the page's language is a file no
  //: script can open twice.
  var CSV = ['index', 'shot', 'time_s', 'source', 'channel_basis',
             'converged', 'state', 'ip_constraint_A', 'ip_fitted_A',
             'q0', 'q95', 'li3', 'a_m', 'kappa', 'chi2', 'why'];

  function csvCell(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  var FORMATS = {
    summary: {
      docPage: 'batch', docKey: 'fylite:rows',
      exportOnly: true,
      label: T('bat.label'),
      filename: function () { return stem() + '.json'; },
      accept: '.json,application/json',
      exportHint: T('bat.export_hint'),
      build: function () {
        if (!last) return { error: T('bat.nofit') };
        var k = counts();
        var doc = FySession.envelope('batch', {}, S.kernel());
        //: ★what this run WAS, before any number: how many were queued, how
        //: many actually ran, and whether it was stopped.  A file that
        //: carried only the rows would let an interrupted queue be read as a
        //: complete one that happened to be short.
        doc['fylite:queued'] = last.queued;
        doc['fylite:ran'] = last.ran;
        doc['fylite:interrupted'] = !!last.interrupted;
        doc['fylite:converged'] = k.ok;
        doc['fylite:rejected'] = k.reject;
        doc['fylite:not_run'] = k.pending;
        doc['fylite:ms'] = last.ms;
        doc['fylite:provenance'] = 'batch-queue-of-reconstructions';
        //: the settings every row was fitted under, once — they are frozen
        //: for the whole run, so a copy per row would be eleven chances to
        //: disagree
        doc['fylite:channel_basis_note'] = 'per row: fylite:channel_basis';
        doc['fylite:rows'] = summaryRows();
        return JSON.stringify(doc, null, 1);
      },
    },
    table: {
      //: ★no `accept`: nothing on this page can READ a csv, and an extension
      //: offered by the import picker is a promise the page cannot keep
      exportOnly: true,
      label: T('bat.csv.label'),
      filename: function () { return stem() + '.csv'; },
      exportHint: T('bat.csv.export_hint'),
      build: function () {
        if (!last) return { error: T('bat.nofit') };
        var rows = summaryRows();
        var out = [CSV.join(',')];
        rows.forEach(function (r) {
          out.push([r['fylite:index'], r['fylite:shot_label'],
                    r['fylite:time'], r['fylite:source'],
                    r['fylite:channel_basis'], r['fylite:converged'],
                    r['fylite:state'], r['fylite:ip_constraint'],
                    r['fylite:ipFitted'], r['fylite:q0'], r['fylite:q95'],
                    r['fylite:li3'], r['fylite:a'], r['fylite:kappa'],
                    r['fylite:chi2'], r['fylite:why']].map(csvCell).join(','));
        });
        return out.join('\n') + '\n';
      },
    },
  };
  S.formats(FORMATS);

  // --- events ---------------------------------------------------------------

  $('add').addEventListener('click', addFromSeries);
  $('clear').addEventListener('click', function () {
    queue.length = 0;
    drawQueue();
    S.report(T('bat.cleared'));
  });
  //: ONE listener for the whole list rather than one per row: the body is
  //: rebuilt on every change
  $('queue').addEventListener('click', function (ev) {
    var t = ev.target, k = t && t.getAttribute && t.getAttribute('data-drop');
    if (k === null || k === undefined) return;
    queue.splice(+k, 1);
    drawQueue();
  });
  //: ★the page's stop terminates the worker and rejects every waiter; this is
  //: how the loop learns it was a STOP and not a slice that failed
  S.onAbort(function () { stopped = true; });
  S.onRun(run);
  S.onRefresh(function () { drawQueue(); draw(); });
  $('add-note').innerHTML = T('bat.add.what');
  drawQueue();
  draw();
});
