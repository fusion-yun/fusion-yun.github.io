// Device descriptor helpers: what the pages may assume about a machine, and
// how the controls size themselves to it.
//
// The solver is already device-neutral — coil geometry, limiter and grid box
// all arrive as arguments, and the coil responses are computed at load time
// rather than read from a precomputed table.  What was NOT neutral was the
// user interface: slider bounds were written as EAST numbers in the HTML, so
// any other machine would have been off-scale before the first solve.
//
// So ranges are DERIVED from the limiter and the vacuum field here.  A
// descriptor may still pin any of them explicitly via `machine.ui`, which is
// what a device with an unusual operating space should do.

(function (root) {
  'use strict';

  var MU0 = 4.0e-7 * Math.PI;

  /** Bounding box of the limiter contour. */
  function bbox(m) {
    var r = m.limiter.r, z = m.limiter.z;
    return {
      rmin: Math.min.apply(null, r), rmax: Math.max.apply(null, r),
      zmin: Math.min.apply(null, z), zmax: Math.max.apply(null, z),
    };
  }

  /** Vacuum field reference: device-level, not shot-level. */
  function tf(m) {
    if (m.tf) return m.tf;
    var ref = m.reference || {};
    return { r0: ref.rcentr || 0.5 * (bbox(m).rmin + bbox(m).rmax),
             b0: ref.bcentr || 1.0 };
  }

  /**
   * Control ranges for this machine.
   *
   * Geometry comes straight off the limiter: the plasma centre cannot sit
   * against a wall, and the minor radius cannot exceed the vessel.  The
   * current range is bracketed by the cylindrical q95 estimate
   *
   *     Ip = 2 pi a^2 B0 (1 + kappa^2) / (2 mu0 R0 q95)
   *
   * at q95 = 10 and 2 — i.e. from "barely a plasma" to "about to disrupt",
   * which is the operating space a design page should let you explore and no
   * more.
   */
  function ranges(m) {
    var b = bbox(m);
    var rgeo = 0.5 * (b.rmin + b.rmax), amax = 0.5 * (b.rmax - b.rmin);
    var zhalf = 0.5 * (b.zmax - b.zmin);
    var t = tf(m);
    var b0 = Math.abs(t.b0 * t.r0 / rgeo);
    var ipAt = function (q95, a, kappa) {
      return 2 * Math.PI * a * a * b0 * (1 + kappa * kappa)
             / (2 * MU0 * rgeo * q95);
    };
    var aMin = r3(0.30 * amax), aMax = r3(0.85 * amax);
    var kMin = 1.0, kMax = 2.2;
    var out = {
      r0: { min: r3(b.rmin + 0.5 * amax), max: r3(b.rmax - 0.5 * amax),
            step: 0.005, value: r3(rgeo) },
      z0: { min: r3(-0.35 * zhalf), max: r3(0.35 * zhalf),
            step: 0.005, value: 0 },
      a: { min: aMin, max: aMax, step: 0.005, value: r3(0.66 * amax) },
      kappa: { min: kMin, max: kMax, step: 0.01, value: 1.65 },
      du: { min: -0.2, max: 0.7, step: 0.01, value: 0.4 },
      dl: { min: -0.2, max: 0.7, step: 0.01, value: 0.5 },
      // bracketed at the extremes the shape controls themselves allow, so
      // the current slider can always reach the plasma the shape sliders can
      ip: { min: sig2(ipAt(10, aMin, kMin) / 1e3),
            max: sig2(ipAt(2, aMax, kMax) / 1e3),
            step: 5, value: sig2(ipAt(5, 0.66 * amax, 1.65) / 1e3) },
      xr: { value: r3(rgeo - 0.55 * amax) },
      xz: { value: r3(b.zmin + 0.12 * (b.zmax - b.zmin)) },
    };
    // an explicit descriptor entry always wins
    Object.keys(m.ui || {}).forEach(function (k) {
      out[k] = Object.assign({}, out[k], m.ui[k]);
    });
    Object.keys(out).forEach(function (k) { snap(out[k]); });
    return out;
  }

  /**
   * Put a range on its own step grid.
   *
   * ★A range input snaps its value to `min + k*step`, so a derived `min`
   * that is not itself a multiple of `step` shifts EVERY value on the
   * control the moment it is assigned — a 400 kA default silently became
   * 401 kA, and the solve it fed moved with it.  Rounding the bounds
   * outward onto the grid keeps round numbers round.
   */
  function snap(r) {
    var st = r.step;
    if (!(st > 0)) return r;
    var dec = Math.max(0, Math.ceil(-Math.log10(st)) + 2);
    var fix = function (v) { return +(Math.round(v / st) * st).toFixed(dec); };
    if (r.min !== undefined) r.min = +(Math.floor(r.min / st) * st).toFixed(dec);
    if (r.max !== undefined) r.max = +(Math.ceil(r.max / st) * st).toFixed(dec);
    if (r.value !== undefined) r.value = fix(r.value);
    return r;
  }

  function r3(v) { return Math.round(v * 1000) / 1000; }
  function sig2(v) {
    if (!(v > 0)) return 0;
    var e = Math.pow(10, Math.floor(Math.log10(v)) - 1);
    return Math.round(v / e) * e;
  }

  /**
   * Push the ranges onto the live controls.  Existing values are re-clamped,
   * not overwritten, so a page that has already restored a session does not
   * lose it; controls absent from the page are skipped.
   */
  function applyRanges(m, opts) {
    //: `opts.scope` is the scenario's resolver — the ranges are keyed by the
    //: bare control name, which is now a prefix away from the element
    var host = (opts && opts.scope) || document;
    var rg = ranges(m), touched = [];
    Object.keys(rg).forEach(function (id) {
      var el = host.getElementById(id);
      if (!el) return;
      var r = rg[id];
      // ★Read the value BEFORE touching min/max.  Assigning `min` to a range
      // input makes the browser clamp `value` on the spot, so a value read
      // afterwards is never out of range and the derived default below could
      // never fire — the control would silently sit on the new boundary
      // instead of at a sensible starting point for this machine.
      var v = +el.value;
      var below = r.min !== undefined && v < +r.min;
      var above = r.max !== undefined && v > +r.max;
      if (r.min !== undefined) el.min = r.min;
      if (r.max !== undefined) el.max = r.max;
      if (r.step !== undefined) el.step = r.step;
      if ((opts && opts.setValues) || el.value === '' || below || above) {
        if (r.value !== undefined) el.value = r.value;
      }
      touched.push(id);
    });
    return { ranges: rg, touched: touched };
  }

  /**
   * The ENGINEERING LIMITS this machine declares — and, for each, whether it
   * declared one at all (T-D5).
   *
   * ★★NO DEFAULTS, EVER.  `FR-PULSE-004` wrote the rule for the OH swing —
   * "未声明时必须报『未知』，不得以缺省值代替" — and it is the same rule for
   * every other limit: a design judged against a number nobody supplied is a
   * design that looks feasible for a reason that does not exist.  So every
   * getter here returns `null` for "not declared", never 0 and never a
   * plausible-looking figure, and the pages have to render that null.
   *
   * The descriptor's slot, all of it optional:
   *
   *   "fylite:engineering_limits": {
   *     "provenance": "where these numbers are from",
   *     "oh_flux_swing_Wb": 12.0,
   *     "per_channel": [ { "i_max_kAturn": 700,
   *                        "v_max_V_per_turn": 40,
   *                        "f_max_kN": 1200 }, ... ]
   *   }
   *
   * ★None of the four bundled machines fills it yet.  EAST's own description
   * carries real supply data (`machine_desc/east/east_device.yaml`,
   * `power_supply`: 14.5 kA terminal current, per-coil 160–800 V, from TokSys
   * `pwrsys/EAST_PS_params.m`), but those are TERMINAL amperes and volts on
   * 14 conductor elements while this page speaks in kA-turns and volts per
   * turn on 12 CHANNELS, two of which are series pairs — the conversion is
   * real work with a real chance of being wrong, and a wrong limit on the
   * page is worse than an unknown one.
   */
  function limits(m) {
    var e = (m && m.limits) || {};
    var per = e.per_channel || null;
    var fin = function (v) {
      return typeof v === 'number' && isFinite(v) ? v : null;
    };
    return {
      declared: !!(m && m.limits),
      provenance: e.provenance || null,
      phiAvail: fin(e.oh_flux_swing_Wb),
      /** The caps on channel `c`; every field null when undeclared. */
      channel: function (c) {
        var r = per && per[c] ? per[c] : null;
        return { iMax: r ? fin(r.i_max_kAturn) : null,
                 vMax: r ? fin(r.v_max_V_per_turn) : null,
                 fMax: r ? fin(r.f_max_kN) : null };
      },
    };
  }

  /** Does this descriptor carry a reference discharge? */
  function hasReference(m) {
    var r = m.reference;
    return !!(r && r.aturns && r.aturns.length);
  }

  /** ... and one with measurements, which the reconstruction page needs. */
  function hasMeasurements(m) {
    var r = m.reference;
    return !!(r && r.loopMeas && r.loopMeas.length === (m.loops || []).length);
  }

  root.FyDevice = { bbox: bbox, tf: tf, limits: limits,
                    applyRanges: applyRanges, hasReference: hasReference,
                    hasMeasurements: hasMeasurements };
})(typeof self !== 'undefined' ? self : globalThis);
