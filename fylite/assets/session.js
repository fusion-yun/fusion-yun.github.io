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
    fyo: 'https://fusion-yun.github.io/fyo/latest/',
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
      //: ★a namespaced key is not a control and never was: the pages write
      //: their own `fylite:...` entries into the same block (which source,
      //: an imported profile, the Ip that came with it) and read them
      //: themselves.  Counting those as "skipped" told every reader of a
      //: round-tripped file that three of its settings had been dropped.
      if (id.indexOf(':') >= 0) return;
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

  /** Round to `d` significant digits — psi carries no information past ~7. */
  /**
   * An array at `d` significant digits, with what is not a number written
   * as `null`.
   *
   * ★★NOT ZERO.  This helper writes every numeric array this app exports,
   * and a non-finite entry used to come out as an exact `0` — a slice that
   * failed to solve, a q(0) that could not be formed, a channel with no
   * reading, all indistinguishable in the file from a measurement that
   * happened to be zero.  `null` is valid JSON and is the honest spelling;
   * a reader that wants zeros can still choose them, which is not something
   * the other direction allows.
   */
  function sig(a, d) {
    return Array.prototype.map.call(a, function (v) {
      return isFinite(v) ? +v.toPrecision(d || 7) : null;
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
      //: ★WHICH build wrote this file.  `fylite:kernel` is the handshake —
      //: the ABI, and the wasm's own sha256, i.e. the exact binary that
      //: answered.  These two are the RELEASE either half belongs to, which
      //: is what a reader holding the file a year later can act on: a sha256
      //: identifies a build but does not tell you where it sits in a history.
      //: Both come from the GENERATED `assets/version.js`; a page that did
      //: not load it writes null rather than a guess.
      'fylite:kernel_version': (root.FyVersion || {}).kernel || null,
      'fylite:app_version': (root.FyVersion || {}).app || null,
      'fylite:kernel': kernel || null,
      'fylite:config': config,
    };
  }

  /**
   * The equilibrium half of a result, in IMAS DD v4 group shape so it lines
   * up with fydata's A-Box rather than inventing a private layout.
   */
  function equilibrium(grid, r, profiles, q) {
    //: ★★Every path below is DECLARED (`rust/fylite/src/fyo.rs`, generated
    //: into `assets/fyo-interface.js` and `python/fylite/_fyo_interface.py`).
    //: This function used to spell them inline while `fyo.py` spelled its
    //: own — which is how `psi_norm` came to be written bare here and
    //: prefixed there, inside documents both typed `fyo:equilibrium`: no
    //: error, just a section the other host could not find.  A page names
    //: the SLOT now and never where it goes.
    var F = root.FyFyo;
    var doc = { '@type': F.type('EQUILIBRIUM') };
    F.put(doc, 'EQUILIBRIUM', 'ip', r.ip);
    F.put(doc, 'EQUILIBRIUM', 'psi_axis', r.psiAxis);
    F.put(doc, 'EQUILIBRIUM', 'psi_boundary', r.psiBnd);
    F.put(doc, 'EQUILIBRIUM', 'axis_r', r.axisR);
    F.put(doc, 'EQUILIBRIUM', 'axis_z', r.axisZ);
    F.put(doc, 'EQUILIBRIUM', 'grid_r',
          sig(gridAxis(grid.rmin, grid.rmax, grid.nr), 9));
    F.put(doc, 'EQUILIBRIUM', 'grid_z',
          sig(gridAxis(grid.zmin, grid.zmax, grid.nz), 9));
    //: ★★TWELVE DIGITS FOR THE MAP, seven for everything else.  The psi map
    //: is the one array downstream DIFFERENTIATES: `B_R = -(dpsi/dz)/(2 pi r)`
    //: over a half-cell step, which amplifies the file's own rounding by
    //: `psi / dz` — on this deck 0.5 / 0.044, so seven digits in psi become
    //: a part in 1e5 in B.  Measured: the probe check against a native
    //: recomputation sat at exactly 1.0e-5 and the bootstrap at 5.5e-6, both
    //: of them the file's resolution rather than any disagreement about the
    //: physics.  Digits are cheap; a tolerance loosened to cover them is not.
    F.put(doc, 'EQUILIBRIUM', 'psi_2d', sig(r.psi, 12));
    var slice = doc.time_slice[0];
    slice.profiles_2d[0].grid_type = { name: 'rectangular', index: 1 };
    if (r.lcfs && r.lcfs.length) {
      var ro = [], zo = [];
      for (var i = 0; i + 1 < r.lcfs.length; i += 2) {
        ro.push(+r.lcfs[i].toPrecision(7));
        zo.push(+r.lcfs[i + 1].toPrecision(7));
      }
      F.put(doc, 'EQUILIBRIUM', 'boundary_r', ro);
      F.put(doc, 'EQUILIBRIUM', 'boundary_z', zo);
    }
    if (profiles) {
      F.put(doc, 'LADDER', 'psin', sig(profiles.x, 7));
      F.put(doc, 'EQUILIBRIUM', 'pressure', sig(profiles.p, 7));
      F.put(doc, 'EQUILIBRIUM', 'dpressure_dpsi', sig(profiles.pprime, 7));
      F.put(doc, 'EQUILIBRIUM', 'f_df_dpsi', sig(profiles.ffprime, 7));
      if (q) {
        F.put(doc, 'EQUILIBRIUM', 'f', sig(q.f, 7));
        F.put(doc, 'EQUILIBRIUM', 'q_1d', sig(q.q, 7));
        //: ★this one has no slot: it is the q profile's OWN psi_N grid,
        //: which the DD has no place for and no other host writes — a
        //: private extension, and it stays spelled here rather than being
        //: promoted into a shared table it has no second writer for
        slice.profiles_1d[root.FyNames.q('q_psi_norm')] = sig(q.x, 7);
      }
    }
    return doc;
  }

  function gridAxis(lo, hi, n) {
    var a = new Array(n);
    for (var i = 0; i < n; i++) a[i] = lo + (hi - lo) * i / (n - 1);
    return a;
  }

  /** PF channel currents in IMAS pf_active shape. */
  function pfActive(machine, chan) {
    return {
      '@type': self.FyFyo.type('PF_ACTIVE'),
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
      '@type': self.FyFyo.type('MAGNETICS'),
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
  /**
   * Read one of this app's documents.
   *
   * ★★`fylite:config` IS NOT PART OF EVERY DOCUMENT.  It is the page's
   * control state, and a SESSION file is meaningless without it — but a data
   * document (measured points, chord readings, a profile, a time series) is a
   * measurement someone else may have written, and demanding a block of this
   * app's slider values from it turns "here are my Thomson points" into
   * `导入失败：文档里没有 fylite:config`.  So the requirement belongs to the
   * caller that needs it: `parse(text)` still enforces it, and the data
   * formats say `parse(text, { config: false })`.
   */
  function parse(text, opts) {
    var d = JSON.parse(text);
    if (!d || d['@type'] !== TYPE) {
      var got = d && d['@type'] ? d['@type'] : '@type';
      throw new Error(FyI18n.t('sess.not_ours', { got: got, want: TYPE }));
    }
    if (!(opts && opts.config === false) && !d['fylite:config'])
      throw new Error(FyI18n.t('sess.no_config'));
    return d;
  }

  root.FySession = {
    TYPE: TYPE, collect: collect, apply: apply, envelope: envelope,
    equilibrium: equilibrium, pfActive: pfActive, magnetics: magnetics,
    parse: parse, sig: sig,
  };
})(typeof self !== 'undefined' ? self : globalThis);
