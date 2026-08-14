// Worker that owns the fylite wasm instance.
//
// Every Grad-Shafranov solve is a single blocking call into the binary, so
// it runs here rather than on the UI thread.  The expensive setup — the
// per-coil grid response and the flux-loop response matrix — is built once
// on init and reused by every later command.

importScripts('machine.js', 'fylite.js', 'physics.js');

var M = self.FYLITE_MACHINE, P = self.FyPhys;
var fy = null, grid = null, coilG = null, loopsM = null;
var NG = 0, NEL = 0, NCH = 0;

function post(msg, transfer) { self.postMessage(msg, transfer || []); }

// --- channel <-> element ---------------------------------------------------

function elementCurrents(chan) {
  var el = new Float64Array(NEL);
  M.channels.forEach(function (combo, c) {
    combo.forEach(function (pair) { el[pair[0]] += pair[1] * chan[c]; });
  });
  return el;
}

/** Collapse a per-element response block (nel, npts) to per channel. */
function toChannels(resp, npts) {
  var out = new Float64Array(NCH * npts);
  M.channels.forEach(function (combo, c) {
    combo.forEach(function (pair) {
      var off = pair[0] * npts, w = pair[1], to = c * npts;
      for (var i = 0; i < npts; i++) out[to + i] += w * resp[off + i];
    });
  });
  return out;
}

function psiExtOf(chan) {
  return P.combine(coilG.psiCh, chan, NG);
}

// --- init ------------------------------------------------------------------

function init() {
  var t0 = Date.now();
  return self.FyLite.load('fylite_rs.wasm').then(function (inst) {
    fy = inst;
    grid = P.makeGrid(M.grid);
    NG = grid.nr * grid.nz;
    NEL = M.coils.length;
    NCH = M.channels.length;
    var tG = Date.now();
    var r = P.coilGridResponse(fy, M.coils, grid, 4, 4);
    coilG = { psiCh: toChannels(r.psi, NG) };
    var tL = Date.now();
    loopsM = P.loopResponse(fy, grid, M.loops);
    post({ type: 'ready', abi: fy.abi,
           timing: { load: tG - t0, coils: tL - tG, loops: Date.now() - tL },
           // dr/dz travel too: FyPhys.sample() divides by them, and without
           // them every page-side field lookup silently returns NaN
           grid: { r: grid.r, z: grid.z, nr: grid.nr, nz: grid.nz,
                   dr: grid.dr, dz: grid.dz } });
  }).catch(function (e) {
    post({ type: 'error', where: 'init', message: String(e && e.message || e) });
  });
}

// --- forward solve ---------------------------------------------------------

function freeSolve(chan, prof, ip, opts) {
  opts = opts || {};
  return fy.gsFreeSolve({
    r: grid.r, z: grid.z, psiExt: psiExtOf(chan),
    beta0: prof.beta0, emp: prof.emp, enp: prof.enp, r0: prof.r0, ip: ip,
    limR: M.limiter.r, limZ: M.limiter.z, signAxis: 1,
    relax: opts.relax || 0.3, maxIter: opts.maxIter || 600,
    tol: opts.tol || 1e-9, fbGain: opts.fbGain === undefined ? 8.0 : opts.fbGain,
  });
}

/**
 * Everything the plots need from a solved field.  With `prof` given, the
 * analytic p'/FF' the solve actually ran on are recovered too: the solver
 * normalizes j_phi = j_c * S(R, x) to Ip, so j_c follows from the converged
 * field, and the two terms of S separate exactly into the pressure and the
 * poloidal-current channel.
 */
function summarize(res, prof) {
  var poly = P.boundarySurface(grid, res.psi, res.psiAxis, res.psiBnd,
                               res.axisR, res.axisZ, M.limiter.r,
                               M.limiter.z, 181);
  var sm = P.shapeMetrics(poly);
  var flat = new Float64Array(poly.length * 2);
  poly.forEach(function (p, i) { flat[2 * i] = p[0]; flat[2 * i + 1] = p[1]; });
  var prof2 = null;
  if (prof) {
    var t = P.analyticTruth(grid, res, prof, M.limiter.r, M.limiter.z, 201);
    prof2 = { x: t.x, pprime: t.pprime, ffprime: t.ffprime, p: t.p, jc: t.jc };
  }
  return {
    profiles: prof2,
    psi: res.psi, psiAxis: res.psiAxis, psiBnd: res.psiBnd,
    axisR: res.axisR, axisZ: res.axisZ, ip: res.ip, residual: res.residual,
    iterations: res.iterations, bndKind: res.bndKind,
    xptR: res.xptR, xptZ: res.xptZ, fbAmp: res.fbAmp,
    lcfs: flat, shape: sm,
  };
}

// --- discharge design ------------------------------------------------------
//
// Iso-flux least squares on the PF channels, annealed: each pass fits the
// coil-current CHANGE that would flatten psi over the target boundary
// (and null the field at the requested X point), applies it under-relaxed,
// and re-solves.  The regularization is annealed from stiff to loose so
// the first passes stay near the starting scenario and the later ones can
// reach the target; the plasma's own response to the current change is
// what the re-solve supplies.

function designRun(msg) {
  var target = msg.target, prof = msg.prof, ip = msg.ip;
  var chan = Float64Array.from(msg.chan);
  var bnd = P.millerBoundary(target, msg.nPoints || 24);
  var useX = msg.xWeight > 0 && msg.xpoint;
  var ptsR = new Float64Array(bnd.length + (useX ? 1 : 0));
  var ptsZ = new Float64Array(ptsR.length);
  bnd.forEach(function (p, i) { ptsR[i] = p[0]; ptsZ[i] = p[1]; });
  if (useX) { ptsR[bnd.length] = msg.xpoint.r; ptsZ[bnd.length] = msg.xpoint.z; }
  var NP = ptsR.length, NB = bnd.length;
  var er = P.coilPointResponse(fy, M.coils, ptsR, ptsZ, 4, 4);
  var gPsi = toChannels(er.psi, NP), gBr = toChannels(er.br, NP),
      gBz = toChannels(er.bz, NP);

  var g2 = 0;
  for (var j = 1; j < NB; j++)
    for (var k = 0; k < NCH; k++) {
      var v = gPsi[k * NP + j] - gPsi[k * NP];
      g2 += v * v;
    }
  var GS = Math.sqrt(g2 / ((NB - 1) * NCH));
  var L = 2 * Math.PI * target.r0 * target.a;   // Tesla row -> Weber row

  function step(res, cur, alpha) {
    var nrow = (NB - 1) + (useX ? 2 : 0);
    var a = new Float64Array(nrow * NCH), b = new Float64Array(nrow),
        w = new Float64Array(nrow);
    var psi0 = P.sample(grid, res.psi, ptsR[0], ptsZ[0]);
    for (var j = 1; j < NB; j++) {
      for (var k = 0; k < NCH; k++)
        a[(j - 1) * NCH + k] = gPsi[k * NP + j] - gPsi[k * NP];
      b[j - 1] = -(P.sample(grid, res.psi, ptsR[j], ptsZ[j]) - psi0);
      w[j - 1] = 1;
    }
    if (useX) {
      var bf = P.bField(grid, res.psi, msg.xpoint.r, msg.xpoint.z);
      for (k = 0; k < NCH; k++) {
        a[(NB - 1) * NCH + k] = gBr[k * NP + NP - 1] * L;
        a[NB * NCH + k] = gBz[k * NP + NP - 1] * L;
      }
      b[NB - 1] = -bf.br * L; b[NB] = -bf.bz * L;
      w[NB - 1] = msg.xWeight; w[NB] = msg.xWeight;
    }
    var lam = new Float64Array(NCH).fill(alpha * GS);
    var d = P.ridgeLstsq(a, b, w, nrow, NCH, lam);
    if (!d) return null;
    var out = new Float64Array(NCH);
    for (k = 0; k < NCH; k++) out[k] = cur[k] + msg.gamma * d[k];
    return out;
  }

  function shapeError(sm) {
    if (!sm) return Infinity;
    return Math.sqrt((Math.pow((sm.r0 - target.r0) / target.a, 2)
                    + Math.pow((sm.a - target.a) / target.a, 2)
                    + Math.pow((sm.kappa - target.kappa) / target.kappa, 2)
                    + Math.pow(sm.deltaU - target.deltaU, 2)
                    + Math.pow(sm.deltaL - target.deltaL, 2)) / 5);
  }

  var res;
  try { res = freeSolve(chan, prof, ip, msg.solve); }
  catch (e) { post({ type: 'error', where: 'design', message: e.message }); return; }
  var best = { chan: chan, sum: summarize(res, prof), pass: 0, res: res };
  var history = [{ pass: 0, alpha: null, err: shapeError(best.sum.shape),
                   shape: best.sum.shape }];
  best.err = history[0].err;
  post({ type: 'progress', phase: 'design', pass: 0, total: msg.schedule.length,
         err: best.err });

  for (var p = 0; p < msg.schedule.length; p++) {
    var nxt = step(res, chan, msg.schedule[p]);
    if (!nxt) break;
    var r2;
    try { r2 = freeSolve(nxt, prof, ip, msg.solve); }
    catch (e) {
      history.push({ pass: p + 1, alpha: msg.schedule[p], err: null,
                     error: e.message });
      break;
    }
    chan = nxt; res = r2;
    var sum = summarize(res, prof), err = shapeError(sum.shape);
    history.push({ pass: p + 1, alpha: msg.schedule[p], err: err,
                   shape: sum.shape, residual: res.residual });
    // The anneal keeps travelling from the LAST pass, not from the best
    // one.  Rolling back a regression was tried and measurably hurts: the
    // good basin usually lies past a worse intermediate state, and
    // reverting cuts the run short (a 0.45 -> 0.50: 0.048 at pass 7 while
    // travelling, 0.162 at pass 1 when reverting; same for du 0.65 and
    // dl 0.00).  A run that cannot improve at all ends at pass 0 and says
    // so — that is a reporting matter, not a reason to hobble the search.
    if (err < best.err)
      best = { chan: chan, sum: sum, err: err, pass: p + 1, res: res };
    post({ type: 'progress', phase: 'design', pass: p + 1,
           total: msg.schedule.length, err: err });
  }
  post({ type: 'design', chan: best.chan, result: best.sum, pass: best.pass,
         history: history, targetBoundary: flatten(bnd) },
       [best.sum.psi.buffer, best.sum.lcfs.buffer]);
}

function flatten(poly) {
  var f = new Float64Array(poly.length * 2);
  poly.forEach(function (p, i) { f[2 * i] = p[0]; f[2 * i + 1] = p[1]; });
  return f;
}

// --- reconstruction --------------------------------------------------------

var TWO_PI = 2 * Math.PI, MEAS_SCALE = 1 / (2 * Math.PI);

/** Vacuum R0*B0 of the machine: q needs a toroidal field, and the forward
 *  model never sees one (only FF' enters j_phi). */
var F_EDGE = M.reference.bcentr * M.reference.rcentr;

/**
 * <j_phi>(x): the fitted cell currents binned onto normalized flux and
 * divided by the bin's cross-sectional area, i.e. the flux-surface-averaged
 * toroidal current density [A/m^2].
 */
function currentProfile(grid, res, cur, nbin) {
  nbin = nbin || 24;
  var nz = grid.nz, mi = grid.nr - 2, mj = nz - 2;
  var da = grid.dr * grid.dz, span = res.psiBnd - res.psiAxis;
  var sum = new Float64Array(nbin), area = new Float64Array(nbin);
  for (var i = 0; i < mi; i++)
    for (var j = 0; j < mj; j++) {
      var c = cur[i * mj + j];
      if (c === 0) continue;
      var x = (res.psi[(i + 1) * nz + (j + 1)] - res.psiAxis) / span;
      x = x < 0 ? 0 : (x > 1 ? 0.999999 : x);
      var b = Math.min(nbin - 1, (x * nbin) | 0);
      sum[b] += c; area[b] += da;
    }
  var xs = new Float64Array(nbin), js = new Float64Array(nbin);
  for (var b2 = 0; b2 < nbin; b2++) {
    xs[b2] = (b2 + 0.5) / nbin;
    js[b2] = area[b2] > 0 ? sum[b2] / area[b2] : NaN;
  }
  return { x: xs, j: js };
}

/** Deterministic normal deviates, so a given seed reproduces a run. */
function rng(seed) {
  var s = seed >>> 0 || 1;
  return function () {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    var u = (s >>> 8) / 16777216;
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    var v = (s >>> 8) / 16777216;
    return Math.sqrt(-2 * Math.log(u + 1e-12)) * Math.cos(2 * Math.PI * v);
  };
}

function reconRun(msg) {
  var chan = Float64Array.from(msg.chan);
  var psiExt = psiExtOf(chan);
  var out = { type: 'recon', source: msg.source };
  var meas, wts, ip, truth = null, truthProf = null, truthRes = null,
      truthCur = null;

  if (msg.source === 'twin') {
    // 1. truth: a forward free-boundary solve
    var t;
    try { t = freeSolve(chan, msg.prof, msg.ip, msg.solve); }
    catch (e) { post({ type: 'error', where: 'truth', message: e.message }); return; }
    truthRes = t;
    truth = summarize(t);
    // 2. the current distribution the solver actually built, and the
    //    profiles it implies (recovered from the converged field)
    truthProf = P.analyticTruth(grid, t, msg.prof, M.limiter.r, M.limiter.z, 201);
    var cur = P.fittedCurrentAnalytic(grid, t, msg.prof, truthProf);
    truthCur = cur;
    // 3. synthetic loop readings through the SAME rows the fit uses
    meas = P.loopModel(loopsM, cur, grid, MEAS_SCALE);
    var amp = 0;
    for (var d = 0; d < meas.length; d++) amp = Math.max(amp, Math.abs(meas[d]));
    var sigma = msg.noise * amp, gauss = rng(msg.seed || 12345);
    out.clean = Float64Array.from(meas);
    if (sigma > 0) for (d = 0; d < meas.length; d++) meas[d] += sigma * gauss();
    wts = new Float64Array(meas.length).fill(sigma > 0 ? 1 / sigma : 1);
    ip = msg.ip;
    out.sigma = sigma;
  } else {
    meas = Float64Array.from(M.reference.loopMeas);
    wts = Float64Array.from(M.reference.loopWeights);
    ip = M.reference.ip;
    out.sigma = 0;
  }
  // channel mask from the UI (drop loops the user switched off)
  if (msg.loopMask) for (var i = 0; i < wts.length; i++)
    if (!msg.loopMask[i]) wts[i] = 0;

  // --- kinetic rows -------------------------------------------------------
  var xp = [], pmeas = [], wp = [];
  if (msg.kinetic && msg.kinetic.on) {
    var n = msg.kinetic.points, pref = null;
    if (msg.source === 'twin') pref = function (x) { return truthProf.pAt(x); };
    else {
      var pr = M.reference.pres, m = pr.length;
      pref = function (x) {
        var t2 = x * (m - 1), k = Math.min(m - 2, Math.max(0, t2 | 0));
        return pr[k] + (t2 - k) * (pr[k + 1] - pr[k]);
      };
    }
    var p0 = pref(0), gk = rng((msg.seed || 12345) + 7);
    // Put the pressure rows on the magnetics' footing before applying the
    // user's relative weight: a row's pull on the fit is w * |b|, so match
    // the TYPICAL weighted magnetic row.  Without the loop-weight factor
    // the pressure channel is silently inert whenever the loops are
    // weighted by 1/sigma (weights of ~1e3 against a raw ratio of ~1e-6).
    var sw = 0, nw = 0, sb = 0;
    for (d = 0; d < meas.length; d++) {
      if (!wts[d]) continue;
      sw += wts[d]; nw += 1; sb += meas[d] * meas[d];
    }
    var wBar = nw ? sw / nw : 1, bBar = nw ? Math.sqrt(sb / nw) : 1;
    var w0 = msg.kinetic.weight * wBar * bBar / Math.max(p0, 1e-9);
    out.kineticWeight = w0;
    for (var q = 1; q <= n; q++) {
      var x = q / (n + 1), pv = pref(x);
      xp.push(x);
      pmeas.push(pv * (1 + (msg.kinetic.noise || 0) * gk()));
      wp.push(w0);
    }
    out.kineticX = Float64Array.from(xp);
    out.kineticP = Float64Array.from(pmeas);
  }

  var res;
  try {
    res = fy.gsInverseSolve({
      r: grid.r, z: grid.z, psiExt: psiExt, loopsM: loopsM, meas: meas,
      wts: wts, measScale: MEAS_SCALE, npp: msg.npp, nff: msg.nff, ip: ip,
      limR: M.limiter.r, limZ: M.limiter.z,
      xp: xp, pmeas: pmeas, wp: wp,
      relax: msg.solve && msg.solve.relax || 0.3,
      maxIter: msg.solve && msg.solve.maxIter || 800,
      tol: 1e-9, fbGain: 8.0, warmup: msg.warmup === undefined ? 40 : msg.warmup,
    });
  } catch (e) {
    post({ type: 'error', where: 'recon', message: e.message }); return;
  }

  // fit quality: forward-model the loops from the fitted coefficients
  var mask = P.plasmaMask(grid, res.psi, res.psiAxis, res.psiBnd,
                          M.limiter.r, M.limiter.z, 1);
  var fitCur = P.fittedCurrent(grid, res.psi, res.psiAxis, res.psiBnd,
                               res.coefs, msg.npp, msg.nff, mask);
  var model = P.loopModel(loopsM, fitCur, grid, MEAS_SCALE);
  var chi2 = 0, nfit = 0;
  for (d = 0; d < meas.length; d++) {
    if (!wts[d]) continue;
    var r_ = wts[d] * (model[d] - meas[d]);
    chi2 += r_ * r_; nfit += 1;
  }

  out.result = summarize(res);
  out.result.coefs = res.coefs;
  out.meas = meas;
  out.wts = wts;
  out.model = model;
  out.chi2 = chi2;
  out.nfit = nfit;
  out.ipFitted = P.totalCurrent(fitCur);
  out.profiles = P.fittedProfiles(res.coefs, msg.npp, msg.nff,
                                  res.psiAxis, res.psiBnd, 201);
  out.q = P.qProfile(grid, res, out.profiles, M.limiter.r, M.limiter.z,
                     F_EDGE, { nq: 20, ntheta: 121 });
  out.jphi = currentProfile(grid, res, fitCur);
  if (truth) {
    out.truth = truth;
    out.truthProfiles = { x: truthProf.x, pprime: truthProf.pprime,
                          ffprime: truthProf.ffprime, p: truthProf.p };
    out.truthQ = P.qProfile(grid, truthRes, out.truthProfiles, M.limiter.r,
                            M.limiter.z, F_EDGE, { nq: 20, ntheta: 121 });
    out.truthJphi = currentProfile(grid, truthRes, truthCur);
  }
  post(out);
}

// --- dispatch --------------------------------------------------------------

self.onmessage = function (ev) {
  var msg = ev.data;
  try {
    if (msg.cmd === 'init') return init();
    if (!fy) return post({ type: 'error', message: 'wasm 尚未就绪' });
    if (msg.cmd === 'solve') {
      var res = freeSolve(Float64Array.from(msg.chan), msg.prof, msg.ip,
                          msg.solve);
      return post({ type: 'solve', result: summarize(res, msg.prof),
                    chan: Float64Array.from(msg.chan) });
    }
    if (msg.cmd === 'design') return designRun(msg);
    if (msg.cmd === 'recon') return reconRun(msg);
  } catch (e) {
    post({ type: 'error', where: msg.cmd, message: String(e && e.message || e) });
  }
};
