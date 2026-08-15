// Session documents: the page's inputs (and optionally its outputs) as one
// self-describing fyo / JSON-LD file.
//
// WHAT THIS IS NOT.  It is not a governed DataArtifact manifest.  Those
// require `owner`, `tenancy_scope`, `signature` — identity a browser page
// cannot produce and must not fake.  This is a plain self-describing
// document; wrapping it as an artifact is fylite's job, where an owner
// exists.
//
// GAUGE.  Fields are written in the app's OWN convention and the convention
// is stated in the document (`fylite:psi_convention`), rather than converted
// on the way out.  A silent second conversion is how a sign error gets
// shipped; the reader converts once, in Python, where it is tested.
//
//   psi        FULL poloidal flux [Wb], axis at the MAXIMUM
//   p', FF'    derivatives with respect to psi/2pi (per radian)
//   currents   TOTAL element/channel current [A.turns]

(function (root) {
  'use strict';

  var TYPE = 'fylite:AppSession/1';

  var CONTEXT = {
    fyo: 'https://fusion-yun.github.io/fytok/fyo/',
    fylite: 'urn:fylite:',
  };

  /** Read a set of form controls into a plain object. */
  function collect(ids, doc) {
    var out = {};
    ids.forEach(function (id) {
      var el = (doc || document).getElementById(id);
      if (!el) return;
      out[id] = el.type === 'checkbox' ? el.checked
              : (el.tagName === 'SELECT' ? el.value : +el.value);
    });
    return out;
  }

  /**
   * Write values back into form controls, CLAMPED to each control's own
   * bounds.  An imported file is untrusted input: a hand-edited number must
   * not be able to push the solver outside the range the UI allows.
   */
  function apply(values, doc) {
    var applied = [], skipped = [];
    Object.keys(values || {}).forEach(function (id) {
      var el = (doc || document).getElementById(id);
      if (!el) { skipped.push(id); return; }
      var v = values[id];
      if (el.type === 'checkbox') { el.checked = !!v; }
      else if (el.tagName === 'SELECT') { el.value = String(v); }
      else {
        var n = +v;
        if (!isFinite(n)) { skipped.push(id); return; }
        if (el.min !== '') n = Math.max(n, +el.min);
        if (el.max !== '') n = Math.min(n, +el.max);
        el.value = n;
      }
      applied.push(id);
    });
    return { applied: applied, skipped: skipped };
  }

  function num(a) { return Array.prototype.map.call(a, function (v) { return +v; }); }

  /** Round to `d` significant digits — psi carries no information past ~7. */
  function sig(a, d) {
    return Array.prototype.map.call(a, function (v) {
      return isFinite(v) ? +v.toPrecision(d || 7) : 0;
    });
  }

  /** The document skeleton, shared by both pages. */
  function envelope(page, config, kernel) {
    return {
      '@context': JSON.parse(JSON.stringify(CONTEXT)),
      '@id': 'fylite:app/session/' + new Date().toISOString(),
      '@type': TYPE,
      'fylite:page': page,
      'fylite:created': new Date().toISOString(),
      'fylite:psi_convention': 'full_flux_Wb_axis_max',
      'fylite:coil_current_units': 'A.turns',
      'fylite:kernel': kernel || null,
      'fylite:config': config,
    };
  }

  /**
   * The equilibrium half of a result, in IMAS DD v4 group shape so it lines
   * up with fydata's A-Box rather than inventing a private layout.
   */
  function equilibrium(grid, r, profiles, q) {
    var slice = {
      global_quantities: {
        ip: r.ip,
        psi_axis: r.psiAxis,
        psi_boundary: r.psiBnd,
        magnetic_axis: { r: r.axisR, z: r.axisZ },
      },
      profiles_2d: [{
        grid_type: { name: 'rectangular', index: 1 },
        grid: {
          dim1: sig(gridAxis(grid.rmin, grid.rmax, grid.nr), 9),
          dim2: sig(gridAxis(grid.zmin, grid.zmax, grid.nz), 9),
        },
        psi: sig(r.psi, 7),
      }],
    };
    if (r.lcfs && r.lcfs.length) {
      var ro = [], zo = [];
      for (var i = 0; i + 1 < r.lcfs.length; i += 2) {
        ro.push(+r.lcfs[i].toPrecision(7));
        zo.push(+r.lcfs[i + 1].toPrecision(7));
      }
      slice.boundary = { outline: { r: ro, z: zo } };
    }
    if (profiles) {
      slice.profiles_1d = {
        psi_norm: sig(profiles.x, 7),
        pressure: sig(profiles.p, 7),
        dpressure_dpsi: sig(profiles.pprime, 7),
        f_df_dpsi: sig(profiles.ffprime, 7),
      };
      if (q) {
        slice.profiles_1d.f = sig(q.f, 7);
        slice.profiles_1d['fylite:q_psi_norm'] = sig(q.x, 7);
        slice.profiles_1d.q = sig(q.q, 7);
      }
    }
    return { '@type': 'fyo:equilibrium', time_slice: [slice] };
  }

  function gridAxis(lo, hi, n) {
    var a = new Array(n);
    for (var i = 0; i < n; i++) a[i] = lo + (hi - lo) * i / (n - 1);
    return a;
  }

  /** PF channel currents in IMAS pf_active shape. */
  function pfActive(machine, chan) {
    return {
      '@type': 'fyo:pf_active',
      coil: machine.channels.map(function (combo, c) {
        return {
          name: machine.coils[combo[0][0]].name,
          'fylite:elements': combo.map(function (p) { return p[0]; }),
          current: { data: +chan[c] },
        };
      }),
    };
  }

  /** Flux-loop measurements and the fit's forward model, in magnetics shape. */
  function magnetics(machine, meas, model, wts) {
    return {
      '@type': 'fyo:magnetics',
      'fylite:flux_units': 'Wb/rad',
      flux_loop: machine.loops.map(function (l, i) {
        return {
          position: [{ r: l[0], z: l[1] }],
          flux: { data: +meas[i].toPrecision(9) },
          'fylite:reconstructed': +model[i].toPrecision(9),
          'fylite:weight': +wts[i],
        };
      }),
    };
  }

  /** Reject anything that is not one of our documents, loudly. */
  function parse(text) {
    var d = JSON.parse(text);
    if (!d || d['@type'] !== TYPE) {
      var got = d && d['@type'] ? d['@type'] : '(无 @type)';
      throw new Error('不是本页的会话文档：@type = ' + got +
                      '，需要 ' + TYPE);
    }
    if (!d['fylite:config']) throw new Error('文档里没有 fylite:config');
    return d;
  }

  root.FySession = {
    TYPE: TYPE, collect: collect, apply: apply, envelope: envelope,
    equilibrium: equilibrium, pfActive: pfActive, magnetics: magnetics,
    parse: parse, sig: sig, num: num,
  };
})(typeof self !== 'undefined' ? self : globalThis);
