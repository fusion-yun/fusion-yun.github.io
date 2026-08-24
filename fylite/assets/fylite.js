// Thin JavaScript binding to the fylite Rust core compiled to WebAssembly.
//
// The .wasm shipped next to this file is the SAME cdylib the native
// package loads through ctypes: `c_api.rs` is the single export surface
// for both targets, so every call below is the C ABI documented there
// (ABI v14).  Nothing of the solver lives in JavaScript — this file only
// marshals f64 buffers into linear memory and reads the results back.
//
// Layout convention throughout: 2-D fields are row-major `[i * nz + j]`
// with i the R index, exactly as the Rust side expects.
//
// Published as a classic script (works via <script src> and
// importScripts) so the page and the worker share one copy.

(function (root) {
  'use strict';

  var T = root.FyI18n.t;

  // ★The ABI these bindings are written against.  This USED to be a
  // minimum, on the reasoning that the kernel only ever adds exports — and
  // that reasoning was wrong: v17 added two parameters to an EXISTING entry
  // (gs_inverse_solve's prescribed-current channel), the page kept calling
  // the old shape, and the reconstruction page failed with a type error
  // from deep inside the marshalling.  Signatures are frozen per version,
  // so a consumer can only pin the version it was written for; a newer
  // kernel has to be re-checked entry by entry and this constant moved.
  //
  // A removed export still surfaces as a missing function at the call site
  // rather than as a version number, so the name list below stays.
  var ABI_EXPECT = 111;

  var REQUIRED = [
    'fylite_rs_alloc', 'fylite_rs_free', 'fylite_rs_ping',
    'fylite_rs_dt_reactivity', 'fylite_rs_zerod_volume',
    'fylite_rs_zerod_evaluate', 'fylite_rs_zerod_predict',
    'fylite_rs_vertical_stiffness', 'fylite_rs_coupling_gradient',
    'fylite_rs_ideal_stiffness', 'fylite_rs_dispersion_root',
    'fylite_rs_mutual_matrix_self',
    'fylite_rs_ellipke', 'fylite_rs_mutual_filaments',
    //: ★the electromagnetic entries this page used to write out in JS
    //: instead of calling: the channel fold (`Wx` and the folded field)
    //: and the resistance formula.  They were exported all along.
    'fylite_rs_mutual_outer', 'fylite_rs_channel_weights',
    'fylite_rs_channel_fold', 'fylite_rs_channel_field',
    'fylite_rs_resistances', 'fylite_rs_element_probe_response',
    'fylite_rs_element_response', 'fylite_rs_gs_free_solve',
    //: T-D6′ — the free solve on a tabulated (delivered) p'/FF' shape
    'fylite_rs_gs_free_solve_tab',
    'fylite_rs_gs_inverse_solve', 'fylite_rs_boundary_flux',
    //: T-A5 — the inverse solve with the COIL CURRENTS FITTED.  Listed as
    //: required rather than probed for: a build without it would leave the
    //: reconstruction bar silently back on「coils exactly known」, which is
    //: the failure this entry exists to remove.
    'fylite_rs_gs_inverse_solve_coils',
    'fylite_rs_evolve_circuits', 'fylite_rs_geo_surface',
    'fylite_rs_bounded_lstsq', 'fylite_rs_transport_step',
    //: the NEO chain's two halves.  `neo_inputs` is the map that makes
    //: `neo_sauter` usable at all — without it a caller would have to
    //: rebuild the CGS normalisation itself, which is the one layer whose
    //: errors do not raise.  Listed together so a build carrying only one
    //: of them fails at load rather than at the first surface.
    'fylite_rs_neo_inputs', 'fylite_rs_neo_sauter',
    'fylite_rs_neo_chi',
    //: ★the interpretive direction, and the ADAS table that makes the
    //: radiation a total rather than a bremsstrahlung estimate.  Listed so
    //: a build without them fails at LOAD: a page that discovered a missing
    //: entry at the first inversion would already have drawn a figure.
    'fylite_rs_interpretive_channel', 'fylite_rs_zerod_waveform',
    'fylite_rs_ion_dilution', 'fylite_rs_quasi_neutral_ne',
    'fylite_rs_gs_fixed_solve',
    'fylite_rs_field_ion_sum',
    'fylite_rs_adas_id', 'fylite_rs_adas_cooling',
    'fylite_rs_adas_species_count', 'fylite_rs_adas_species_name',
    'fylite_rs_ridge_lstsq', 'fylite_rs_profile_fit', 'fylite_rs_li3',
    'fylite_rs_redl_bootstrap',
    'fylite_rs_chord_samples', 'fylite_rs_quadrature',
    'fylite_rs_probe_response',
    //: ★the diagnostic layer the analysis scenario reads its channels
    //: through: per-channel self-calibration from one slice and across
    //: slices, and the dispersion that says whether the set hangs together.
    //: They were in every shipped artifact and reachable from Python alone.
    'fylite_rs_selfcal_single', 'fylite_rs_selfcal_slices',
    'fylite_rs_factor_dispersion', 'fylite_rs_profile_shape_fit',
    //: ★the truncated-SVD solve, for the blocks whose geometry is
    //: degenerate on purpose (the vessel groups): the truncation IS the
    //: regularisation, and it reports what it kept
    'fylite_rs_svd_solve',
    'fylite_rs_trace_surface', 'fylite_rs_design_null',
    //: the operating domain, the flux account and the START —
    //: the design scenario's own criteria (ABI v103)
    'fylite_rs_zerod_limits', 'fylite_rs_zerod_flux_budget',
    'fylite_rs_zerod_stored_energy', 'fylite_rs_zerod_averages',
    'fylite_rs_strike_points', 'fylite_rs_start_currents',
    'fylite_rs_fill_filaments', 'fylite_rs_x_points',
    'fylite_rs_plasma_filaments', 'fylite_rs_vertical_plant',
    'fylite_rs_channel_matrices', 'fylite_rs_breakdown_design',
    'fylite_rs_wall_clearance', 'fylite_rs_feedforward_voltages',
    'fylite_rs_filament_flux',
    'fylite_rs_evolve_circuits',
    //: ★the neutral-beam chain (ABI v105, already in every shipped
    //: artifact and reachable from Python alone).  Listed so a build
    //: without them fails at LOAD rather than at the first beam: a
    //: page that discovered a missing entry mid-march would already
    //: have drawn a deposition profile.
    'fylite_rs_shell_table', 'fylite_rs_shell_area',
    'fylite_rs_shell_sum', 'fylite_rs_trapped_fraction_eps',
    'fylite_rs_interp',
    'fylite_rs_beam_deposit', 'fylite_rs_beam_slowing',
    'fylite_rs_beam_energy_partition', 'fylite_rs_beam_shielding',
    'fylite_rs_beam_current', 'fylite_rs_first_orbit_loss',
    //: ★the lower-hybrid chain (same ABI v105, same reason as the beam
    //: above).  `lh_deposit` is the whole per-launcher chain in ONE entry;
    //: the other four are the pieces a page reports BESIDE it —
    //: accessibility, the resonant layer, the CD weight and the damping
    //: shape — which is why they are bound rather than re-derived.
    //: ★`lh_resonance` and `lh_shape` are deliberately NOT here: the
    //: resonant surface and the damping layer they compute are already
    //: INSIDE `lh_deposit`, and a page that called them a second time to
    //: print the answer beside it would give one number two hosts.
    'fylite_rs_lh_deposit', 'fylite_rs_lh_accessibility',
    'fylite_rs_lh_efficiency',
    //: ★ADDED 2026-08-23 — the boxed fixed-boundary solve (T-M7) and the
    //: two metric entries that carry `<R^2>` (T-M8).  Listed so a build
    //: without them fails at LOAD: the refinement and the momentum channel
    //: both discover a missing entry mid-march otherwise, by which time the
    //: page has already drawn something.
    'fylite_rs_gs_fixed_box',
    //: ★T-M17 — the same solve under an I_p constraint; the refinement
    //: dies at LOAD rather than at the first coupled block without it
    'fylite_rs_gs_fixed_box_ip',
    'fylite_rs_fast_ion_pressure_split', 'fylite_rs_beam_torque',
    'fylite_rs_spitzer_eta_perp',
    'fylite_rs_geo_surface_r2', 'fylite_rs_equilibrium_ladder_r2',
    //: ★T-D18 / T-D7 (放电设计页) — the start design with a SET of field
    //: nulls, and the two pieces of wall geometry that turn 「间隙 = 某值」
    //: and 「打击点落在这段壁上」 into the isoflux rows it takes.  Listed
    //: here for the reason every name above is: a build without them must
    //: fail at LOAD, not at the first double-null design.
    'fylite_rs_start_currents_multi', 'fylite_rs_shape_gap_row',
    'fylite_rs_wall_snap',
    //: ★T-A9 (自举—欧姆—拟合电流的自洽闭环) — the three the closure needs:
    //: the flux-surface averages `<1/R>` / `<1/R^2>` / `<B^2>` that the
    //: metric ladder never carried, the exact `<j.B>` <-> `<j_phi>`
    //: conversion, and the neoclassical conductivity.  Required rather
    //: than probed for: a build missing any one of them would leave the
    //: reconstruction bar drawing a bootstrap current beside a fitted
    //: current in a DIFFERENT MEASURE, which is the failure the three
    //: exist to remove and which looks like a plot either way.
    'fylite_rs_surface_fsa', 'fylite_rs_jparb_jphi',
    'fylite_rs_sigma_neo',
    'memory',
  ];

  function Fy(instance, required) {
    this.e = instance.exports;
    this.abi = this.e.fylite_rs_abi_version();
    if (this.abi !== ABI_EXPECT) {
      throw new Error(T('abi.mismatch', { got: this.abi, want: ABI_EXPECT }));
    }
    var want = required || REQUIRED;
    var missing = want.filter(function (n) { return !(n in this.e); }, this);
    if (missing.length) {
      throw new Error(T('abi.missing', { names: missing.join(', ') }));
    }
  }

  // --- linear-memory helpers -------------------------------------------
  // Every alloc may grow the memory and DETACH existing views, so views
  // are never cached across an allocation.

  Fy.prototype.f64 = function () {
    return new Float64Array(this.e.memory.buffer);
  };

  Fy.prototype.alloc = function (n) {
    var p = this.e.fylite_rs_alloc(BigInt(n * 8));
    if (p === 0) throw new Error('fylite: wasm allocation of ' + n +
                                 ' f64 failed');
    return { ptr: p, n: n };
  };

  Fy.prototype.free = function (b) {
    if (b) this.e.fylite_rs_free(b.ptr, BigInt(b.n * 8));
  };

  // Allocate and fill from a JS array / TypedArray.
  Fy.prototype.put = function (arr) {
    var b = this.alloc(arr.length);
    this.f64().set(arr, b.ptr / 8);
    return b;
  };

  Fy.prototype.get = function (b) {
    return this.f64().slice(b.ptr / 8, b.ptr / 8 + b.n);
  };

  // Run `fn(scope)` with a scratch scope that frees everything after.
  Fy.prototype.scope = function (fn) {
    var self = this, live = [];
    var s = {
      put: function (arr) { var b = self.put(arr); live.push(b); return b; },
      /**
       * ★A positional block whose length is checked here, at the call, and
       * not left to the kernel to read past.
       *
       * The kernel takes these as raw pointers with the length baked into
       * the signature, so a JS array one entry short does not fault — the
       * kernel reads whatever follows the allocation.  That happened:
       * `tglf_linear` grew from 24 scalars to 25 (the 25th is `WD_ZERO`)
       * and this file kept sending 24, so the browser ran on the value of
       * an adjacent heap word.  It read as zero rather than as noise, which
       * is worse — the answer was wrong the same way every time, and the
       * only regime where the entry bites (p' != 0) was the one regime the
       * page never entered, because it pinned p' to zero.
       */
      fixed: function (name, arr, n) {
        if (!arr || arr.length !== n)
          throw new Error('FyLite: ' + name + ' must hold ' + n +
                          ' values, got ' + (arr ? arr.length : 'none'));
        var b = self.put(arr); live.push(b); return b;
      },
      zeros: function (n) {
        var b = self.alloc(n);
        self.f64().fill(0, b.ptr / 8, b.ptr / 8 + n);
        live.push(b);
        return b;
      },
      get: function (b) { return self.get(b); },
    };
    try {
      return fn(s);
    } finally {
      for (var i = live.length - 1; i >= 0; i--) self.free(live[i]);
    }
  };

  // --- the SCENARIO face ------------------------------------------------
  //
  // ★★One method for every entry, because the kernel has one symbol for
  // them: an entry is a NAME plus three declared blocks, so appending one
  // needs no new code here.  The flat wrappers below stay exactly as they
  // are — this is the altitude beside them, not instead of them.

  /**
   * Run one scenario entry by name.
   *
   * `FyLite.kernel().scenario('zerod', {ti_over_te: 0.9, ...},
   *                           {t: [...], ip: [...]}, {nt: 7, nr: 5})`
   *
   * Packing and unpacking are `FyFyo`'s, over the generated declaration —
   * so this method knows the ABI and nothing about which quantity sits
   * where, which is the only way the two hosts can stay in step.
   */
  Fy.prototype.scenario = function (entry, params, inputs, dims) {
    var F = root.FyFyo, N = root.FyNames;
    if (!F || !N) throw new Error('FyLite: assets/fyo-interface.js and ' +
                                  'assets/fyo.js must load before this');
    var idx = N.ENTRIES.indexOf(entry);
    if (idx < 0) {
      throw new Error('FyLite: no scenario entry "' + entry + '"; have ' +
                      N.ENTRIES.join(', '));
    }
    var order = F.dimsOf(entry);
    var missing = order.filter(function (d) { return !(d in (dims || {})); });
    if (missing.length) {
      throw new Error('FyLite: scenario ' + entry + ' needs dimensions ' +
                      missing.join(', '));
    }
    var lay = F.layout(entry, dims), self = this;
    var nOut = 0;
    for (var k in lay.out) nOut += lay.out[k][1];
    var p = F.pack(entry, 'params', params, dims);
    var i = F.pack(entry, 'input', inputs, dims);
    return this.scope(function (s) {
      var bp = s.put(p), bi = s.put(i), bo = s.zeros(nOut);
      //: the dimensions cross as u64, written through a BigUint64 view of
      //: the same linear memory the f64 blocks live in
      var bd = s.zeros(order.length);
      var du = new BigUint64Array(self.e.memory.buffer, bd.ptr,
                                  order.length);
      order.forEach(function (d, j) { du[j] = BigInt(dims[d] | 0); });
      var rc = self.e.fylite_rs_scenario(
        idx, bp.ptr, BigInt(p.length), bi.ptr, BigInt(i.length),
        bd.ptr, BigInt(order.length), bo.ptr, BigInt(nOut));
      if (rc !== 0) {
        throw new Error('FyLite: scenario ' + entry + ' returned ' + rc +
                        (rc === -23 ? ' (the entry refused the request — a ' +
                         'statement about the plasma, not the arithmetic)'
                         : ''));
      }
      return F.unpack(entry, s.get(bo), dims);
    });
  };

  // --- L1 kernels -------------------------------------------------------

  Fy.prototype.ping = function (x) { return this.e.fylite_rs_ping(x); };

  /** Complete elliptic integrals K(m), E(m) over an array of m. */
  Fy.prototype.ellipke = function (m) {
    var self = this;
    return this.scope(function (s) {
      var pm = s.put(m), pk = s.zeros(m.length), pe = s.zeros(m.length);
      var rc = self.e.fylite_rs_ellipke(pm.ptr, BigInt(m.length), pk.ptr,
                                        pe.ptr);
      if (rc !== 0) throw new Error('fylite_rs_ellipke rc=' + rc);
      return { k: s.get(pk), e: s.get(pe) };
    });
  };

  /** Elementwise filament-pair mutual inductance [H]; arrays are equal length. */
  Fy.prototype.mutualFilaments = function (r1, z1, r2, z2) {
    var self = this, n = r1.length;
    return this.scope(function (s) {
      var a = s.put(r1), b = s.put(z1), c = s.put(r2), d = s.put(z2),
          o = s.zeros(n);
      var rc = self.e.fylite_rs_mutual_filaments(a.ptr, b.ptr, c.ptr, d.ptr,
                                                 BigInt(n), o.ptr);
      if (rc !== 0) throw new Error('fylite_rs_mutual_filaments rc=' + rc);
      return s.get(o);
    });
  };

  /**
   * Per-element (psi, Br, Bz) response at scattered points, per unit
   * TOTAL element current [A].  `coils` is an array of
   * {r, z, w, h, a1, a2}; outputs are row-major (nelem, npts).
   */
  Fy.prototype.elementResponse = function (coils, pr, pz, nu, nv) {
    var self = this, n = coils.length, npts = pr.length, total = n * npts;
    var col = function (key) { return coils.map(function (c) { return c[key]; }); };
    return this.scope(function (s) {
      var r = s.put(col('r')), z = s.put(col('z')), w = s.put(col('w')),
          h = s.put(col('h')), a = s.put(col('a1')), a2 = s.put(col('a2')),
          qr = s.put(pr), qz = s.put(pz),
          psi = s.zeros(total), br = s.zeros(total), bz = s.zeros(total);
      var rc = self.e.fylite_rs_element_response(
        r.ptr, z.ptr, w.ptr, h.ptr, a.ptr, a2.ptr, BigInt(n),
        qr.ptr, qz.ptr, BigInt(npts), BigInt(nu), BigInt(nv),
        psi.ptr, br.ptr, bz.ptr);
      if (rc !== 0) throw new Error('fylite_rs_element_response rc=' + rc);
      return { psi: s.get(psi), br: s.get(br), bz: s.get(bz), n: n,
               npts: npts };
    });
  };

  // --- L3 equilibrium ---------------------------------------------------

  /**
   * Free-boundary Grad-Shafranov solve (full-flux Wb gauge, axis = max).
   *
   * opts: {r, z, psiExt, beta0, emp, enp, r0, ip, limR, limZ,
   *        signAxis=1, relax=0.3, maxIter=400, tol=1e-8, fbGain=0,
   *        zcAnchor=NaN, rcAnchor=NaN}
   */
  /** <sigma v> for D-T [m^3/s]; 0 outside the 0.2-100 keV parameterisation. */
  Fy.prototype.dtReactivity = function (tiKev) {
    return this.e.fylite_rs_dt_reactivity(tiKev);
  };

  /**
   * Ellipsoidal plasma volume [m^3].  Exposed on its own because it is a
   * GEOMETRY CONVENTION, not a result — FYL-DESIGN-05 O-4 wants it shown
   * beside the volume a solved boundary actually encloses.
   */
  Fy.prototype.zerodVolume = function (r0, a, kappa) {
    return this.e.fylite_rs_zerod_volume(r0, a, kappa);
  };

  /**
   * One pass over a prescribed discharge (FYL-DESIGN-05 L0).
   *
   * The waveforms arrive already built: deciding their shape is the page's
   * job, deciding what follows from them physically is the kernel's.
   */
  Fy.prototype.zerodEvaluate = function (o) {
    var self = this, nt = o.t.length, nr = o.rho.length;
    return this.scope(function (s) {
      var t = s.put(o.t), ip = s.put(o.ip), ne0 = s.put(o.ne0),
          te0 = s.put(o.te0), pin = s.put(o.pInj), rho = s.put(o.rho),
          par = s.put(o.par), os = s.zeros(4 * nt),
          op = s.zeros(3 * nt * nr), vol = s.zeros(1);
      var rc = self.e.fylite_rs_zerod_evaluate(
        t.ptr, ip.ptr, ne0.ptr, te0.ptr, pin.ptr, BigInt(nt),
        rho.ptr, BigInt(nr), par.ptr, os.ptr, op.ptr, vol.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_zerod_evaluate', rc);
      var a = s.get(os), b = s.get(op), m = nt * nr;
      return { vLoop: a.slice(0, nt), pFus: a.slice(nt, 2 * nt),
               pAlpha: a.slice(2 * nt, 3 * nt), q: a.slice(3 * nt, 4 * nt),
               ne: b.slice(0, m), te: b.slice(m, 2 * m),
               ti: b.slice(2 * m, 3 * m), volume: s.get(vol)[0] };
    });
  };

  /**
   * TIER B: march the energy balance with a confinement closure.
   *
   * ★A different kind of answer from `zerodEvaluate`: there W_th is the
   * integral of a profile the caller gave, here it is solved for.  Whatever
   * consumes this has to say so — see FYL-DESIGN-05 §3.
   */
  Fy.prototype.zerodPredict = function (o) {
    var self = this, nt = o.t.length, nr = o.rho.length;
    return this.scope(function (s) {
      var t = s.put(o.t), ip = s.put(o.ip), ne0 = s.put(o.ne0),
          pa = s.put(o.pAux), rho = s.put(o.rho), par = s.put(o.par),
          pred = s.put(o.pred), os = s.zeros(8 * nt), vol = s.zeros(1);
      var rc = self.e.fylite_rs_zerod_predict(
        t.ptr, ip.ptr, ne0.ptr, pa.ptr, BigInt(nt),
        rho.ptr, BigInt(nr), par.ptr, pred.ptr, os.ptr, vol.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_zerod_predict', rc);
      var a = s.get(os), n = nt;
      return { wTh: a.slice(0, n), tauE: a.slice(n, 2 * n),
               te0: a.slice(2 * n, 3 * n), pOhm: a.slice(3 * n, 4 * n),
               pAlpha: a.slice(4 * n, 5 * n), pHeat: a.slice(5 * n, 6 * n),
               pLH: a.slice(6 * n, 7 * n), balance: a.slice(7 * n, 8 * n),
               volume: s.get(vol)[0] };
    });
  };

  // --- L6: rigid n=0 vertical mode --------------------------------------
  //
  // The massless rigid-displacement model: a plasma displaced vertically
  // feels the external-field stiffness k, the passive structure answers
  // through the coupling gradient, and the growth rate solves
  // `k = gamma Ip^2 G^T (gamma M + R)^-1 G`.  All four pieces are separate
  // entries because the three REGIMES are read off them, not off gamma:
  // stable (k <= 0), resistive-wall (0 < k < k_ideal), ideal-unstable.

  /** k = Ip d2(psi_ext)/dZ2 [N/m]; k > 0 destabilising. */
  Fy.prototype.verticalStiffness = function (o) {
    var self = this, np_ = o.pr.length, nl = o.lr.length;
    return this.scope(function (s) {
      var pr = s.put(o.pr), pz = s.put(o.pz), pa = s.put(o.pa),
          lr = s.put(o.lr), lz = s.put(o.lz), lt = s.put(o.lt),
          cur = s.put(o.cur), out = s.zeros(1);
      var rc = self.e.fylite_rs_vertical_stiffness(
        pr.ptr, pz.ptr, pa.ptr, BigInt(np_), lr.ptr, lz.ptr, lt.ptr,
        cur.ptr, BigInt(nl), num(o.step, 1e-3), out.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_vertical_stiffness', rc);
      return s.get(out)[0];
    });
  };

  /** G_k = dM_pk/dZ_p — how the passive structure sees the plasma move. */
  Fy.prototype.couplingGradient = function (o) {
    var self = this, np_ = o.pr.length, nl = o.lr.length;
    return this.scope(function (s) {
      var pr = s.put(o.pr), pz = s.put(o.pz), pa = s.put(o.pa),
          lr = s.put(o.lr), lz = s.put(o.lz), lt = s.put(o.lt),
          out = s.zeros(nl);
      var rc = self.e.fylite_rs_coupling_gradient(
        pr.ptr, pz.ptr, pa.ptr, BigInt(np_), lr.ptr, lz.ptr, lt.ptr,
        BigInt(nl), out.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_coupling_gradient', rc);
      return s.get(out);
    });
  };

  /** k_ideal = Ip^2 G^T M^-1 G — the stiffness a perfect wall would give. */
  Fy.prototype.idealStiffness = function (g, m, ip) {
    var self = this, n = g.length;
    return this.scope(function (s) {
      var gg = s.put(g), mm = s.put(m), out = s.zeros(1);
      var rc = self.e.fylite_rs_ideal_stiffness(gg.ptr, mm.ptr, BigInt(n),
                                                ip, out.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_ideal_stiffness', rc);
      return s.get(out)[0];
    });
  };

  /**
   * Growth rate from the dispersion relation.  Returns `{gamma, rc}`:
   * rc 1 means "no root below gamma_max", which IS the answer — the mode
   * is ideal-unstable and gamma is not finite.
   */
  Fy.prototype.dispersionRoot = function (o) {
    var self = this, n = o.g.length;
    return this.scope(function (s) {
      var g = s.put(o.g), m = s.put(o.m), r = s.put(o.r), out = s.zeros(1);
      var rc = self.e.fylite_rs_dispersion_root(
        g.ptr, m.ptr, r.ptr, BigInt(n), o.ip, o.k, num(o.mass, 0),
        num(o.gammaMax, 1e6), out.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_dispersion_root', rc);
      return { gamma: s.get(out)[0], rc: rc };
    });
  };

  /**
   * `M[i, j]` between two filament SETS — the outer-product block, served
   * without materialising either broadcast.
   *
   * ★What `loopResponse` used to build by filling a grid-length array with
   * one loop's position, once per loop, and calling the ELEMENTWISE entry
   * on it.  Same numbers; 35 materialised copies of a constant fewer.
   */
  Fy.prototype.mutualOuter = function (ar, az, br, bz) {
    var self = this, na = ar.length, nb = br.length;
    return this.scope(function (s) {
      var a1 = s.put(ar), a2 = s.put(az), b1 = s.put(br), b2 = s.put(bz),
          out = s.zeros(na * nb);
      var rc = self.e.fylite_rs_mutual_outer(
        a1.ptr, a2.ptr, BigInt(na), b1.ptr, b2.ptr, BigInt(nb), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_mutual_outer', rc);
      return s.get(out);
    });
  };

  /**
   * The `(nch, nel)` channel map, densified from `[[element, weight], ...]`
   * per channel.
   *
   * ★★The INDEX DIRECTION is the entire content of this map, which is why
   * it has one host and not one per page: a transposed weight matrix does
   * not throw, it is a different machine.  `M.channels` is the sparse form
   * the device document carries; this is the dense one every kernel entry
   * that folds takes.
   */
  Fy.prototype.channelWeights = function (channels, nel) {
    var self = this, ch = [], el = [], wt = [];
    channels.forEach(function (combo, c) {
      combo.forEach(function (pair) {
        ch.push(c); el.push(pair[0]); wt.push(pair[1]);
      });
    });
    var nch = channels.length;
    return this.scope(function (s) {
      var c = s.put(ch), e = s.put(el), w = s.put(wt),
          out = s.zeros(nch * nel);
      var rc = self.e.fylite_rs_channel_weights(
        c.ptr, e.ptr, w.ptr, BigInt(ch.length), BigInt(nch), BigInt(nel),
        out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_channel_weights', rc);
      return s.get(out);
    });
  };

  /** Fold channel ampere-turns onto the elements they drive (`W^T x`). */
  Fy.prototype.channelFold = function (weights, nch, nel, chanAturns) {
    var self = this;
    return this.scope(function (s) {
      var w = s.put(weights), x = s.put(chanAturns), out = s.zeros(nel);
      var rc = self.e.fylite_rs_channel_fold(
        w.ptr, x.ptr, BigInt(nch), BigInt(nel), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_channel_fold', rc);
      return s.get(out);
    });
  };

  /**
   * Per-CHANNEL `(psi, Br, Bz)` at points — `(npts, nch)` each, row-major
   * over points.
   *
   * `weights` is the `(nel, nch)` WIRE format (the transpose of
   * `channelWeights`' map) — the one entry in the ABI that takes it that
   * way, so the transpose is done here, at the boundary, and named.
   */
  Fy.prototype.channelField = function (els, weights, nch, pr, pz, nu, nv) {
    var self = this, n = els.length, npts = pr.length, total = npts * nch;
    var col = function (f, d) {
      return els.map(function (e) {
        return e[f] === undefined ? d : e[f];
      });
    };
    return this.scope(function (s) {
      var r = s.put(col('r')), z = s.put(col('z')), w = s.put(col('w')),
          h = s.put(col('h')), a = s.put(col('a1', 0)), a2 = s.put(col('a2', 90)),
          wt = s.put(weights), qr = s.put(pr), qz = s.put(pz),
          psi = s.zeros(total), br = s.zeros(total), bz = s.zeros(total);
      var rc = self.e.fylite_rs_channel_field(
        r.ptr, z.ptr, w.ptr, h.ptr, a.ptr, a2.ptr, BigInt(n),
        wt.ptr, BigInt(nch), qr.ptr, qz.ptr, BigInt(npts),
        BigInt(nu || 3), BigInt(nv || 3), psi.ptr, br.ptr, bz.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_channel_field', rc);
      return { psi: s.get(psi), br: s.get(br), bz: s.get(bz),
               nch: nch, npts: npts };
    });
  };

  /**
   * What each magnetic probe READS from each element — `(nprobe, nel)` in
   * T per ampere-turn, row-major over probes, the probe's own orientation
   * already applied.
   *
   * ★★The projection `B_R cos(a) + B_Z sin(a)` is the KERNEL's.  A probe's
   * angle convention is physics — which way the sensor points decides the
   * SIGN of what it reads — and getting it wrong does not raise: a fit
   * converges on a plasma tilted to match.  Python converged its two copies
   * of this sentence already; this page was the third.
   */
  Fy.prototype.elementProbeResponse = function (els, pr, pz, ang, nu, nv) {
    var self = this, n = els.length, npts = pr.length;
    var col = function (f, d) {
      return els.map(function (e) {
        return e[f] === undefined ? d : e[f];
      });
    };
    return this.scope(function (s) {
      var r = s.put(col('r')), z = s.put(col('z')), w = s.put(col('w')),
          h = s.put(col('h')), a = s.put(col('a1', 0)), a2 = s.put(col('a2', 90)),
          qr = s.put(pr), qz = s.put(pz), an = s.put(ang),
          out = s.zeros(n * npts);
      var rc = self.e.fylite_rs_element_probe_response(
        r.ptr, z.ptr, w.ptr, h.ptr, a.ptr, a2.ptr, BigInt(n),
        qr.ptr, qz.ptr, an.ptr, BigInt(npts),
        BigInt(nu || 3), BigInt(nv || 3), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_element_probe_response', rc);
      return s.get(out);
    });
  };

  /**
   * Element resistances [Ohm]: `eta * 2 pi r / area`, x N^2 when wound.
   *
   * `eta` is per element in Ohm.m — a device deck quotes micro-Ohm.m, and
   * that conversion belongs where the deck is read.
   */
  Fy.prototype.resistances = function (r, area, eta, turns) {
    var self = this, n = r.length;
    return this.scope(function (s) {
      var rr = s.put(r), ar = s.put(area), et = s.put(eta),
          tn = turns ? s.put(turns) : null, out = s.zeros(n);
      var rc = self.e.fylite_rs_resistances(
        rr.ptr, ar.ptr, et.ptr, tn ? tn.ptr : 0, BigInt(n), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_resistances', rc);
      return s.get(out);
    });
  };

  /** Self-inductance matrix of a set of rectangular elements. */
  Fy.prototype.mutualMatrixSelf = function (els, nu, nv) {
    var self = this, n = els.length;
    return this.scope(function (s) {
      var r = s.put(els.map(function (e) { return e.r; })),
          z = s.put(els.map(function (e) { return e.z; })),
          w = s.put(els.map(function (e) { return e.w; })),
          h = s.put(els.map(function (e) { return e.h; })),
          a = s.put(els.map(function (e) { return e.a1 || 0; })),
          a2 = s.put(els.map(function (e) { return e.a2 === undefined ? 90 : e.a2; })),
          out = s.zeros(n * n);
      var rc = self.e.fylite_rs_mutual_matrix_self(
        r.ptr, z.ptr, w.ptr, h.ptr, a.ptr, a2.ptr, BigInt(n),
        BigInt(nu || 3), BigInt(nv || 3), out.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_mutual_matrix_self', rc);
      return s.get(out);
    });
  };

  /**
   * One linear TGLF solve.  Lives in the SEPARATE module — call it on an
   * instance from `FyLite.loadTglf()`, not on the core one.
   *
   * The port covers the electrostatic, collisionless configuration with
   * `vpar_model = 2` and `nbasis > 1`; every other branch returns an error
   * rather than a quietly reduced answer, so a negative code here means
   * "not this physics", not "the solve failed".
   */
  Fy.prototype.tglfLinear = function (o) {
    var self = this, ns = o.zs.length, nmodes = o.nmodes || 2;
    var zero = new Float64Array(ns);
    return this.scope(function (s) {
      var m18 = s.fixed('miller18', o.miller18, 18),
          s24 = s.fixed('scal25', o.scal25, 25),
          zs = s.put(o.zs), ma = s.put(o.mass), aa = s.put(o.as),
          ta = s.put(o.taus), ln = s.put(o.rlns), lt = s.put(o.rlts),
          //: parallel flow and its shear are SPECIES arrays like the rest.
          //: They arrived with the Linsker gradient family (ABI v30); a
          //: caller that omits them is choosing "no parallel flow", which
          //: the page must say out loud rather than leave to a default.
          vp = s.put(o.vpar || zero), vs = s.put(o.vparShear || zero),
          out = s.zeros(2 * nmodes);
      var rc = self.e.fylite_rs_tglf_linear(
        m18.ptr, s24.ptr, zs.ptr, ma.ptr, aa.ptr, ta.ptr, ln.ptr, lt.ptr,
        vp.ptr, vs.ptr,
        BigInt(ns), BigInt(o.nbasis || 4), BigInt(o.nxgrid || 16),
        BigInt(nmodes), out.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_tglf_linear', rc);
      var v = s.get(out), g = [], w = [];
      for (var k = 0; k < rc; k++) { g.push(v[2 * k]); w.push(v[2 * k + 1]); }
      return { gamma: g, freq: w, nmodes: rc };
    });
  };

  /**
   * The neoclassical diffusivity profile the closure runs on, at a given
   * temperature.
   *
   * ★A page draws the closure it solved with by ASKING for it, not by
   * rebuilding the chain on the drawing side.  This entry and `model = 2`
   * share one implementation, so the curve and the solve cannot disagree.
   */
  Fy.prototype.neoChi = function (x, y, neo, floor) {
    var self = this, n = x.length;
    return this.scope(function (s) {
      var xx = s.put(x), yy = s.put(y),
          sf = s.fixed('neo.surf', neo.surf, 20 * n),
          io = s.fixed('neo.ion', neo.ion, 6 * neo.nion * n),
          sc = s.fixed('neo.scal5',
                       [neo.signb, neo.signq, num(neo.rhoStar, 0.001),
                        num(neo.nTheta, 17), num(neo.tToEv, 1)], 5),
          gb = neo.chigb ? s.fixed('neo.chigb', neo.chigb, n) : null,
          out = s.zeros(n);
      var rc = self.e.fylite_rs_neo_chi(
        xx.ptr, yy.ptr, BigInt(n), sf.ptr, io.ptr, BigInt(neo.nion),
        sc.ptr, gb ? gb.ptr : 0, num(floor, 0), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_neo_chi', rc);
      return s.get(out);
    });
  };

  /**
   * Probe Green's rows: `B_R cos(a) + B_Z sin(a)` [T per amp of toroidal
   * current in each cell], one row per probe, same cell ordering as
   * `loopResponse`.
   *
   * ★This is what turns a probe from something the page PREDICTS into
   * something the fit is CONSTRAINED by.  The projection onto each probe's
   * own angle is the whole difference from a flux-loop row, and a wrong
   * angle convention does not raise — the fit converges on a plasma tilted
   * to match.
   */
  Fy.prototype.probeResponse = function (o) {
    var self = this, nr = o.gridR.length, nz = o.gridZ.length,
        np_ = o.probeR.length;
    return this.scope(function (s) {
      var gr = s.put(o.gridR), gz = s.put(o.gridZ),
          pr = s.put(o.probeR), pz = s.put(o.probeZ), an = s.put(o.angleRad),
          out = s.zeros(np_ * nr * nz);
      var rc = self.e.fylite_rs_probe_response(
        gr.ptr, BigInt(nr), gz.ptr, BigInt(nz),
        pr.ptr, pz.ptr, an.ptr, BigInt(np_), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_probe_response', rc);
      return s.get(out);
    });
  };

  /**
   * Sample a straight sight line: the cylindrical (R, Z) of each point and
   * the true path step.
   *
   * ★`origin3` / `dir3` are 3-D CARTESIAN, which is what keeps a tangential
   * chord different from its poloidal projection.  A horizontal POINT chord
   * is `[R0, 0, Z]` with direction `[-1, 0, 0]`; giving (R, Z) directly would
   * quietly make every chord poloidal.
   */
  Fy.prototype.chordSamples = function (o) {
    var self = this, n = o.n | 0;
    return this.scope(function (s) {
      var org = s.fixed('chord.o', o.origin3, 3),
          dir = s.fixed('chord.d', o.dir3, 3),
          rr = s.zeros(n), zz = s.zeros(n), ds = s.zeros(1);
      var rc = self.e.fylite_rs_chord_samples(
        org.ptr, dir.ptr, o.length, BigInt(n), rr.ptr, zz.ptr, ds.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_chord_samples', rc);
      return { r: s.get(rr), z: s.get(zz), ds: s.get(ds)[0] };
    });
  };

  /** `integral f ds` over uniform samples; rule 0 = Simpson, 1 = trapezoid. */
  Fy.prototype.quadrature = function (values, ds, rule) {
    var self = this;
    return this.scope(function (s) {
      var v = s.put(values), out = s.zeros(1);
      var rc = self.e.fylite_rs_quadrature(
        v.ptr, BigInt(values.length), ds, num(rule, 0) | 0, out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_quadrature', rc);
      return s.get(out)[0];
    });
  };

  /**
   * Redl-2021 bootstrap current on a ladder of surfaces, in AMPERES per m^2.
   *
   * ★This is the entry to reach for when the answer has to be a current and
   * not a ratio: `neoSauter` returns NEO's own normalised `jpar`, and the
   * factor between the two is the one layer whose errors do not raise.  Here
   * the kernel owns the normalisation — `j_bs` comes back as
   * `|<j.B>|/B0` [A/m^2] — and the caller owns only physical inputs.
   *
   * Every profile is per surface and the same length; `psiBar` is psi PER
   * RADIAN [Wb/rad], which is the gauge the coefficients are written in.
   */
  Fy.prototype.redlBootstrap = function (o) {
    var self = this, n = o.eps.length;
    return this.scope(function (s) {
      var cols = ['eps', 'q', 'ne', 'te', 'ti', 'ni', 'zeff', 'pTh',
                  'iPsi', 'psiBar'];
      var ptr = cols.map(function (k) {
        if (o[k].length !== n)
          throw new Error('FyLite.redlBootstrap: ' + k + ' has ' +
                          o[k].length + ' points, expected ' + n);
        return s.put(o[k]).ptr;
      });
      var out = s.zeros(8 * n);
      var rc = self.e.fylite_rs_redl_bootstrap(
        BigInt(n), ptr[0], ptr[1], ptr[2], ptr[3], ptr[4], ptr[5], ptr[6],
        ptr[7], ptr[8], ptr[9], o.rMaj, o.b0, num(o.zIon, 1),
        o.collisionless ? 1 : 0, out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_redl_bootstrap', rc);
      var v = s.get(out), col = function (j) {
        var a = new Float64Array(n);
        for (var k = 0; k < n; k++) a[k] = v[8 * k + j];
        return a;
      };
      return { jBs: col(0), l31: col(1), l32: col(2), l34: col(3),
               alpha: col(4), ft: col(5), nuEStar: col(6), nuIStar: col(7) };
    });
  };

  // --- T-A9: the parallel/toroidal current closure ------------------------
  //
  // ★★THE PAGE HELD TWO CURRENTS IT COULD NOT ADD.  `redlBootstrap` returns
  // `|<j.B>|/B0`; the fit returns `<j_phi>`.  Those are different quantities
  // on the same surface, so「自举 + 欧姆 = 拟合电流」was not an
  // approximation the page declined to make — it was arithmetic nobody had.
  // The three below are that arithmetic, and every one of them is a kernel
  // entry rather than a formula written here: a conversion with two hosts is
  // a conversion that can disagree with itself.

  /**
   * The flux-surface averages the conversion reads, on one traced surface.
   *
   * opts: {r0, z0, dr, dz, nr, nz, psi, poly, psiScale, fPsi}
   *
   * `poly` is the interleaved (r, z) outline `traceSurface` returned — the
   * SAME outline, handed back rather than re-traced, so the averages and
   * the shape cannot describe two surfaces.  `psiScale` multiplies `psi` to
   * get Wb per radian (`1/(2*Math.PI)` for a full-flux map).
   */
  Fy.prototype.surfaceFsa = function (o) {
    var self = this, src = o.poly, flat;
    //: `traceSurface` hands back an array of [r, z] PAIRS; a caller with a
    //: flat interleaved buffer is accepted too, because the kernel's own
    //: entry takes the flat form and both spellings are already in use on
    //: this page.
    if (src.length && src[0] && src[0].length === 2) {
      flat = new Float64Array(src.length * 2);
      for (var i = 0; i < src.length; i++) {
        flat[2 * i] = src[i][0]; flat[2 * i + 1] = src[i][1];
      }
    } else {
      flat = src;
    }
    var np_ = (flat.length / 2) | 0;
    return this.scope(function (s) {
      var psi = s.put(o.psi), poly = s.put(flat), out = s.zeros(6);
      var rc = self.e.fylite_rs_surface_fsa(
        o.r0, o.z0, o.dr, o.dz, BigInt(o.nr), BigInt(o.nz),
        psi.ptr, poly.ptr, BigInt(np_), o.psiScale, o.fPsi, out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_surface_fsa', rc);
      var v = s.get(out);
      return { rInv: v[0], rInv2: v[1], bPol2: v[2], bTor2: v[3],
               b2: v[4], dvdpsi: v[5] };
    });
  };

  /**
   * `<j.B>` <-> `<j_phi/R>/<1/R>` on a ladder (`fylite_rs_jparb_jphi`).
   *
   * opts: {b2, bTor2, fPsi, rInv, dpdpsi, jIn, toToroidal}
   *
   * ★`dpdpsi` is the DIAMAGNETIC term and it belongs to the TOTAL, not to
   * either channel: pass zeros when converting the bootstrap or the ohmic
   * part on its own, or the same pressure gradient is counted once per
   * curve and the parts stop summing to the whole.
   */
  Fy.prototype.jparbJphi = function (o) {
    var self = this, n = o.jIn.length;
    return this.scope(function (s) {
      var cols = ['b2', 'bTor2', 'fPsi', 'rInv', 'dpdpsi', 'jIn'];
      var ptr = cols.map(function (k) {
        if (o[k].length !== n)
          throw new Error('FyLite.jparbJphi: ' + k + ' has ' + o[k].length +
                          ' points, expected ' + n);
        return s.put(o[k]).ptr;
      });
      var out = s.zeros(2 * n);
      var rc = self.e.fylite_rs_jparb_jphi(
        BigInt(n), ptr[0], ptr[1], ptr[2], ptr[3], ptr[4], ptr[5],
        o.toToroidal ? 1 : 0, out.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_jparb_jphi', rc);
      var v = s.get(out), j = new Float64Array(n), rt = new Float64Array(n);
      for (var k = 0; k < n; k++) { j[k] = v[2 * k]; rt[k] = v[2 * k + 1]; }
      return { j: j, ratio: rt, converted: rc };
    });
  };

  /**
   * Neoclassical parallel conductivity on a ladder, SI [S/m].
   *
   * opts: {eps, q, ne, te, ti, ni, zeff, rMaj, zIon, vintage,
   *        collisionless} — the same per-surface block `redlBootstrap`
   * takes, so `j_bs` and `sigma_neo` are evaluated at ONE collisionality.
   * `vintage`: 0 = Sauter 1999, 1 = Redl 2021.
   */
  Fy.prototype.sigmaNeo = function (o) {
    var self = this, n = o.eps.length;
    return this.scope(function (s) {
      var cols = ['eps', 'q', 'ne', 'te', 'ti', 'ni', 'zeff'];
      var ptr = cols.map(function (k) {
        if (o[k].length !== n)
          throw new Error('FyLite.sigmaNeo: ' + k + ' has ' + o[k].length +
                          ' points, expected ' + n);
        return s.put(o[k]).ptr;
      });
      var out = s.zeros(5 * n);
      var rc = self.e.fylite_rs_sigma_neo(
        BigInt(n), ptr[0], ptr[1], ptr[2], ptr[3], ptr[4], ptr[5], ptr[6],
        o.rMaj, num(o.zIon, 1), o.vintage | 0, o.collisionless ? 1 : 0,
        out.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_sigma_neo', rc);
      var v = s.get(out), col = function (j) {
        var a = new Float64Array(n);
        for (var k = 0; k < n; k++) a[k] = v[5 * k + j];
        return a;
      };
      return { sigmaNeo: col(0), sigmaSpitzer: col(1), f33: col(2),
               ft: col(3), nuEStar: col(4), answered: rc };
    });
  };

  /**
   * Least squares by TRUNCATED SVD (`linalg::svd_solve`).
   *
   * ★The truncation IS the regularisation, and `kept` / `condition` come
   * back with the answer because an under-determined geometry has to be
   * visible: a solve that quietly inverted a singular value of 1e-14 would
   * return a beautiful reconstruction of the noise.  `rcond` keeps the
   * singular values above `rcond * s[0]`; `nSingular > 0` keeps exactly that
   * many instead.
   */
  Fy.prototype.svdSolve = function (a, b, m, n, rcond, nSingular) {
    var self = this;
    return this.scope(function (s) {
      var pa = s.fixed('svd.a', a, m * n), pb = s.fixed('svd.b', b, m),
          x = s.zeros(n), sv = s.zeros(n), info = s.zeros(2);
      var rc = self.e.fylite_rs_svd_solve(
        pa.ptr, pb.ptr, BigInt(m), BigInt(n), num(rcond, 1e-8),
        BigInt(nSingular || 0), x.ptr, sv.ptr, info.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_svd_solve', rc);
      var v = s.get(info);
      return { x: s.get(x), singular: s.get(sv), kept: v[0], condition: v[1] };
    });
  };

  /**
   * Per-channel calibration factors from ONE slice (`diagnostics::
   * factors_single`): `computed / measured`, against their own median.
   *
   * ★THE MEDIAN IS THE POINT.  It absorbs any global scale or unit offset,
   * so only channel-RELATIVE inconsistency can reject a channel — a rule
   * that rejected on the absolute ratio would reject the whole set the
   * moment someone changed a unit.
   *
   * `alive` is 1/0 per channel.  Returns the factors, the keep mask and the
   * median; a factor is NaN where the channel is dead, the measurement is
   * zero, or the computed value is not finite.
   */
  Fy.prototype.selfcalSingle = function (measured, computed, alive, tol) {
    var self = this, n = measured.length;
    return this.scope(function (s) {
      var m = s.put(measured), c = s.fixed('selfcal.computed', computed, n),
          a = s.fixed('selfcal.alive', alive, n), out = s.zeros(2 * n + 1);
      var rc = self.e.fylite_rs_selfcal_single(
        m.ptr, c.ptr, a.ptr, BigInt(n), num(tol, 0.2), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_selfcal_single', rc);
      var v = s.get(out);
      return { factors: v.slice(0, n), keep: v.slice(n, 2 * n),
               median: v[2 * n] };
    });
  };

  /**
   * Per-channel factor and slice-to-slice scatter over many slices
   * (`diagnostics::factors_over_slices`).  `ratio` is `(nSlice, nCh)`
   * row-major.
   */
  Fy.prototype.selfcalSlices = function (ratio, nSlice, nCh, alive) {
    var self = this;
    return this.scope(function (s) {
      var r = s.fixed('selfcal.ratio', ratio, nSlice * nCh),
          a = s.fixed('selfcal.alive', alive, nCh), out = s.zeros(3 * nCh);
      var rc = self.e.fylite_rs_selfcal_slices(
        r.ptr, BigInt(nSlice), BigInt(nCh), a.ptr, out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_selfcal_slices', rc);
      var v = s.get(out);
      return { factors: v.slice(0, nCh), scatter: v.slice(nCh, 2 * nCh),
               slices: v.slice(2 * nCh, 3 * nCh) };
    });
  };

  /** `max |f/median(f) - 1|` over the finite factors. */
  Fy.prototype.factorDispersion = function (factors) {
    var self = this, n = factors.length;
    return this.scope(function (s) {
      var f = s.put(factors), out = s.zeros(1);
      var rc = self.e.fylite_rs_factor_dispersion(f.ptr, BigInt(n), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_factor_dispersion', rc);
      return s.get(out)[0];
    });
  };

  /**
   * Fit `(1 - x^a)^b` to a normalised profile (`fitting::shape_fit`).
   *
   * ★Returns -2 rather than the nearest member when the iteration does not
   * settle: a shape outside the family must not come back as though it were
   * in it.
   */
  Fy.prototype.profileShapeFit = function (x, y) {
    var self = this, n = x.length;
    return this.scope(function (s) {
      var px = s.put(x), py = s.fixed('shapefit.y', y, n), out = s.zeros(3);
      var rc = self.e.fylite_rs_profile_shape_fit(
        px.ptr, py.ptr, BigInt(n), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_profile_shape_fit', rc);
      var v = s.get(out);
      return { a: v[0], b: v[1], maxResidual: v[2] };
    });
  };

  /**
   * Physical profiles + geometry → NEO's normalised inputs.
   *
   * ★★The normalisation is the whole risk and it is NOT this file's to
   * make: `T_norm` is the FIRST ION's temperature, `n_norm` the electrons'
   * density, the mass norm deuterium.  Get one wrong and every NEO output
   * is rescaled with nothing raised.  So the page hands over PHYSICAL
   * quantities — CGS, eV — and the kernel does the crossing.
   *
   * Returns the exact block `neoSauter` takes, plus the deck geometry the
   * kernel derived on the way (`geometry`, keyed by name — see
   * `neoGeo14` for why it is not handed back as a bare array).
   *
   * ★★THE OUTPUT BUFFER IS `6*ns + 18`, NOT `6*ns + 5`.  The kernel appends
   * the thirteen-slot geometry block after the five scalars, and it writes
   * it whether or not the caller wants it: `slice_out` builds its slice from
   * the pointer and the length the ENTRY declares, so a short buffer here is
   * not a truncated answer but thirteen doubles written past the end of a
   * wasm allocation.  Measured on this deck: the density channel took the
   * renderer down — worker gone, tab gone, no exception anywhere — because
   * the corrupted block was the allocator's own bookkeeping.  ★A binding
   * that under-allocates cannot be caught by comparing numbers; it is caught
   * by reading the entry's `# Safety` line, which is why the size is quoted
   * here beside the call.
   */
  Fy.prototype.neoInputs = function (o) {
    var self = this, nion = o.ions.length, ns = nion + 1;
    var col = function (key) {
      return Float64Array.from(o.ions, function (i) { return i[key]; });
    };
    return this.scope(function (s) {
      var g = s.fixed('surf20', o.surf20, 20),
          z = s.put(col('z')), m = s.put(col('mass')), n = s.put(col('ni')),
          t = s.put(col('ti')), dn = s.put(col('dlnnidr')),
          dt = s.put(col('dlntidr')), out = s.zeros(6 * ns + 18);
      var rc = self.e.fylite_rs_neo_inputs(
        g.ptr, o.signb, o.signq, num(o.w0, 0), num(o.w0p, 0),
        z.ptr, m.ptr, n.ptr, t.ptr, dn.ptr,
        dt.ptr, BigInt(nion), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_neo_inputs', rc);
      var v = s.get(out), pick = function (j) { return v.slice(j * ns, (j + 1) * ns); };
      return { z: pick(0), mass: pick(1), dens: pick(2), temp: pick(3),
               dlnndr: pick(4), dlntdr: pick(5),
               nu1: v[6 * ns], ipccw: v[6 * ns + 1], btccw: v[6 * ns + 2],
               omegaRot: v[6 * ns + 3], omegaRotDeriv: v[6 * ns + 4],
               geometry: deckGeometry(v, 6 * ns + 5) };
    });
  };

  //: ★★TWO ORDERS, ONE VOCABULARY.  `NEO_DECK_GEOMETRY` (what the entry
  //: returns) and `NEO_SAUTER_SLOTS` (what `neoSauter` reads) name the same
  //: thirteen quantities in DIFFERENT sequences — `Q` and `SHEAR` sit at 4
  //: and 5 in one and at 2 and 3 in the other, `ZMAG_OVER_A` moves from 2 to
  //: 5.  The kernel says so in `mapping.rs`, and says there that building
  //: one from the other by position produced fluxes 200x out with every
  //: number finite and plausible.  So the block crosses this boundary
  //: KEYED BY NAME and the permutation is written once, here.
  var NEO_DECK_GEOMETRY = [
    'rminOverA', 'rmajOverA', 'zmagOverA', 'sZmag', 'q', 'shear',
    'shift', 'kappa', 'sKappa', 'delta', 'sDelta', 'zeta', 'sZeta'];

  function deckGeometry(v, at) {
    var g = {};
    for (var i = 0; i < NEO_DECK_GEOMETRY.length; i++)
      g[NEO_DECK_GEOMETRY[i]] = v[at + i];
    return g;
  }

  /**
   * The 14-slot block `neoSauter` reads, from the geometry `neoInputs`
   * returned.  `nTheta` is a resolution knob rather than geometry and is
   * the caller's (upstream's own default is 17).
   */
  Fy.prototype.neoGeo14 = function (g, nTheta) {
    return Float64Array.of(
      g.rminOverA, g.rmajOverA, g.q, g.shear, g.shift,
      g.zmagOverA, g.sZmag, g.kappa, g.sKappa,
      g.delta, g.sDelta, g.zeta, g.sZeta, num(nTheta, 17));
  };

  /**
   * NEO's analytic models on one surface, selected by `vintage`:
   * 0 = Sauter 1999, 1 = Redl 2021 (both bootstrap currents),
   * 2 = Hinton-Hazeltine + Chang-Hinton, 4 = Hirshman-Sigmar per species,
   * 5 = Taguchi + Hinton-Rosenbluth.
   *
   * ★Vintage 2's fifth slot is `efluxi_ch` — the Chang-Hinton ion energy
   * flux, which is the neoclassical HEAT channel and therefore the one a
   * transport closure wants.  The Sauter vintages give a CURRENT, not a
   * diffusivity; reading one for the other is a category error the six
   * unlabelled slots would not stop.
   */
  Fy.prototype.neoSauter = function (o) {
    var self = this, ns = o.z.length;
    var nOut = o.vintage === 4 ? 2 * ns : 6;
    return this.scope(function (s) {
      var z = s.put(o.z), m = s.put(o.mass), d = s.put(o.dens),
          t = s.put(o.temp), dn = s.put(o.dlnndr), dt = s.put(o.dlntdr),
          g = s.fixed('geo14', o.geo14, 14), out = s.zeros(nOut);
      var rc = self.e.fylite_rs_neo_sauter(
        z.ptr, m.ptr, d.ptr, t.ptr, dn.ptr, dt.ptr, BigInt(ns), g.ptr,
        o.nu1, num(o.rhoStar, 0.001), num(o.epar0, 0), num(o.dphi0dr, 0),
        o.ipccw | 0, o.btccw | 0, o.vintage | 0, out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_neo_sauter', rc);
      var v = s.get(out);
      if (o.vintage === 2)
        return { pflux: v[0], efluxiHH: v[1], efluxe: v[2], jpar: v[3],
                 efluxiCH: v[4], vpolIon: v[5] };
      if (o.vintage === 4)
        return { pflux: v.slice(0, ns), eflux: v.slice(ns, 2 * ns) };
      return { jpar: v[0], jtor: v[1], kpar: v[2], uparB: v[3],
               ftrap: v[4], iDivPsip: v[5] };
    });
  };

  /**
   * The source's own ky spectrum for a `KYGRID_MODEL`, and the gyroradii it
   * is scaled by.  `rhoIon` is the reason this is bound: the flux chain
   * needs it and it is a property of the species set, not something a page
   * may invent.
   */
  Fy.prototype.tglfKygrid = function (o) {
    var self = this, ns = o.zs.length, maxN = o.maxN || 512;
    return this.scope(function (s) {
      var zs = s.put(o.zs), ma = s.put(o.mass), aa = s.put(o.as),
          ta = s.put(o.taus), out = s.zeros(2 * maxN + 2);
      var rc = self.e.fylite_rs_tglf_kygrid(
        zs.ptr, ma.ptr, aa.ptr, ta.ptr, BigInt(ns),
        num(o.model, 1), BigInt(o.nky || 12), num(o.kyIn, 0.3),
        num(o.kyFactor, 1), BigInt(maxN), out.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_tglf_kygrid', rc);
      var v = s.get(out), ky = [], dky = [];
      for (var i = 0; i < rc; i++) { ky.push(v[i]); dky.push(v[maxN + i]); }
      return { ky: ky, dky: dky, rhoIon: v[2 * maxN], rhoE: v[2 * maxN + 1] };
    });
  };

  /**
   * A ky spectrum through to TRANSPORT FLUXES — the whole ported chain:
   * a linear solve at each ky, the zonal-flow saturation, then
   * flux = intensity * quasilinear weight, integrated over the spectrum.
   *
   * ★This is what turns a growth rate into a transport coefficient, and it
   * has been sitting in the shipped `fylite_tglf.wasm` unbound.  The page
   * and `FYL-DESIGN-04` both still said "from gamma to chi needs a
   * quasi-saturation rule, and that step is not in the browser" — it is:
   * `SAT_RULE` 1 is ported, and `python/fylite/tglf.fluxes_rust` has been
   * calling this same entry all along.  That sentence is now corrected
   * where it appears.
   *
   * ★The saturation rule is a REQUIRED argument, not a default.  Rules 1,
   * 2 and 3 are different physics with different amplitudes; serving one
   * of them under another's name is the failure this port has already been
   * bitten by once (`WD_ZERO`).
   *
   * `out` is `3*ns + 2*nky`: particle, energy and exchange flux per
   * species, then gamma and omega per ky.
   */
  Fy.prototype.tglfFlux = function (o) {
    var self = this, ns = o.zs.length, nky = o.ky.length;
    var zero = new Float64Array(ns);
    if (!(o.satRule >= 1 && o.satRule <= 3))
      throw new Error('FyLite.tglfFlux: satRule must be 1, 2 or 3');
    return this.scope(function (s) {
      var m18 = s.fixed('miller18', o.miller18, 18),
          s30 = s.fixed('scal30', o.scal30, 30),
          g4 = s.fixed('geom4', o.geom4, 4),
          zs = s.put(o.zs), ma = s.put(o.mass), aa = s.put(o.as),
          ta = s.put(o.taus), ln = s.put(o.rlns), lt = s.put(o.rlts),
          vp = s.put(o.vpar || zero), vs = s.put(o.vparShear || zero),
          ky = s.put(o.ky), out = s.zeros(3 * ns + 2 * nky);
      var rc = self.e.fylite_rs_tglf_flux(
        m18.ptr, s30.ptr, g4.ptr, zs.ptr, ma.ptr, aa.ptr, ta.ptr,
        ln.ptr, lt.ptr, vp.ptr, vs.ptr, BigInt(ns),
        ky.ptr, BigInt(nky), BigInt(o.nbasis || 4),
        BigInt(o.nxgrid || 16), o.satRule, out.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_tglf_flux', rc);
      var v = s.get(out), i;
      var particle = [], energy = [], exchange = [], gamma = [], freq = [];
      for (i = 0; i < ns; i++) {
        particle.push(v[i]);
        energy.push(v[ns + i]);
        exchange.push(v[2 * ns + i]);
      }
      for (i = 0; i < nky; i++) {
        gamma.push(v[3 * ns + 2 * i]);
        freq.push(v[3 * ns + 2 * i + 1]);
      }
      return { particle: particle, energy: energy, exchange: exchange,
               gamma: gamma, freq: freq, satRule: o.satRule };
    });
  };

  /**
   * The unit normalisations a deck implies: r_unit, q_unit, b_unit, ft.
   * Derived rather than asked for, because they are not free — a page that
   * let you type them could be given a set no flux surface has.
   */
  Fy.prototype.tglfUnits = function (miller14, pPrime, qPrime, width, thTrap) {
    var self = this;
    return this.scope(function (s) {
      var m = s.put(miller14), out = s.zeros(4);
      var rc = self.e.fylite_rs_tglf_units(m.ptr, pPrime, qPrime, width,
                                           thTrap, out.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_tglf_units', rc);
      var v = s.get(out);
      return { rUnit: v[0], qUnit: v[1], bUnit: v[2], ft: v[3] };
    });
  };

  /**
   * Flux-surface averages of one local Miller/MXH surface — the GACODE
   * `geo_do` translation in `rust/fylite/src/geometry.rs`.
   *
   * ★Bound rather than reimplemented, and that is the whole point.  Every
   * flux-surface moment a transport layer needs (dV/dr, <|grad r|>,
   * <|grad r|^2>, <Bp^2>, <Bt^2>, the surface area, the volume) comes from
   * ONE definition with ONE weight (G_theta / B).  Hand-rolling a second set
   * in JavaScript would put two conventions in the repo that agree until the
   * day they do not.  The entry point was already in the shipped core
   * binary; nothing had bound it.
   *
   * Geometry is GACODE's, in units of the minor radius: `rmin` is the surface
   * label r/a and `rmaj` is R0/a.  `shape` carries the 22 extended (MXH)
   * harmonics in the source's order and may be omitted for a plain Miller
   * surface — they are a pure function argument here, not module state, so a
   * surface without harmonics cannot inherit the previous one's.
   *
   * `volume_prime` is dV/dr — the one weight `transport.step_theta` needs to
   * run; the gradient moments refine it rather than being required by it.
   */
  Fy.prototype.geoSurface = function (o) {
    var self = this;
    return this.scope(function (s) {
      var shape = s.put(o.shape && o.shape.length === 22
                        ? o.shape : new Float64Array(22));
      //: ★`_r2`, not `fylite_rs_geo_surface`: the same fourteen scalars in
      //: the same order plus `<R^2>` (T-M8).  The momentum channel's
      //: capacity is `V' n m <R^2>` and this ladder had no such column, so
      //: it was substituting `R_maj(rho)^2` — short by O((a/R)^2).  The two
      //: entries call the same `geometry::solve`; the older one keeps its
      //: frozen 14-slot buffer for the callers that hold it.
      var out = s.zeros(15);
      var rc = self.e.fylite_rs_geo_surface_r2(
        num(o.signb, 1), o.rmin, o.rmaj, num(o.drmaj, 0),
        num(o.zmag, 0), num(o.dzmag, 0), o.q, num(o.shear, 0),
        num(o.kappa, 1), num(o.sKappa, 0), num(o.delta, 0), num(o.sDelta, 0),
        num(o.zeta, 0), num(o.sZeta, 0), shape.ptr,
        BigInt(o.nTheta || 501), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_geo_surface_r2', rc);
      var v = s.get(out);
      return { f: v[0], ffprime: v[1], fsaBp2: v[2], fsaBt2: v[3],
               fsaGradR: v[4], fsaGradR2: v[5], gradR0: v[6], surf: v[7],
               volume: v[8], volumePrime: v[9], bt0: v[10], bp0: v[11],
               thetaScale: v[12], bl: v[13],
               //: `<R^2>` in the units `rmin`/`rmaj` went in as — m^2 when
               //: the caller passes metres, which every caller here does
               fsaR2: v[14] };
    });
  };

  /**
   * Box-constrained least squares, in the kernel.
   *
   * ★Bound rather than kept in JavaScript.  The transcription that used to
   * live in `worker.js` was missing the non-monotone safeguard, and isolated
   * points of the feasibility scan came back three orders of magnitude off
   * without anything erroring.  One host, one safeguard.
   */
  Fy.prototype.boundedLstsq = function (o) {
    var self = this, nrow = o.nrow, ncol = o.ncol;
    return this.scope(function (s) {
      var a = s.put(o.a), b = s.put(o.b), out = s.zeros(ncol);
      var lo = o.lo ? s.put(o.lo) : null, hi = o.hi ? s.put(o.hi) : null;
      var used = self.e.fylite_rs_bounded_lstsq(
        a.ptr, b.ptr, BigInt(nrow), BigInt(ncol),
        lo ? lo.ptr : 0, hi ? hi.ptr : 0,
        BigInt(o.nIter || 4000), num(o.tol, 1e-12), out.ptr);
      if (used < 0) throw new SolveError('fylite_rs_bounded_lstsq', used);
      return { x: s.get(out), iterations: used };
    });
  };

  /**
   * One 1.5D transport step (FYL-DESIGN-07 D-4).
   *
   * The closure is selected by `model` rather than passed as a function:
   * a callback cannot cross the ABI, and splitting the Picard loop across it
   * would put the stiff iteration back on this side.  `model` 0 = constant,
   * 1 = stiff, **2 = neoclassical (Chang-Hinton)**; anything else is refused
   * by the kernel.
   *
   * ★Model 2's contract, which nothing on this side can check: `yOld` is the
   * FIRST ION's temperature **in eV**, and `x` is **r/a**.  It takes `neo`:
   * `{surf, ion, nion, signb, signq, rhoStar, nTheta, chigb}` — the physical
   * surface at each point and the ions on it, in CGS with eV temperatures.
   * `chigb` is the ONE unit this side supplies (the gyro-Bohm diffusivity
   * per point); every NEO-side normalisation happens in the kernel, which is
   * the only place that knows those conventions.
   */
  Fy.prototype.transportStep = function (o) {
    var self = this, n = o.x.length;
    return this.scope(function (s) {
      var x = s.put(o.x), y = s.put(o.yOld), vp = s.put(o.vprime),
          v = s.put(o.velocity), src = s.put(o.source),
          cap = o.capacity ? s.put(o.capacity) : null,
          met = o.metric ? s.put(o.metric) : null,
          out = s.zeros(n), info = s.zeros(3);
      var ne = o.neo || null;
      var nsurf = ne ? s.fixed('neo.surf', ne.surf, 20 * n) : null,
          nion = ne ? s.fixed('neo.ion', ne.ion, 6 * ne.nion * n) : null,
          nsc = ne ? s.fixed('neo.scal5',
                             [ne.signb, ne.signq, num(ne.rhoStar, 0.001),
                              num(ne.nTheta, 17), num(ne.tToEv, 1)], 5) : null,
          ngb = ne && ne.chigb ? s.fixed('neo.chigb', ne.chigb, n) : null,
          //: model 3's given diffusivity — frozen through the loop because a
          //: turbulent closure costs too much to re-evaluate inside it
          cg = o.chiGiven ? s.fixed('chiGiven', o.chiGiven, n) : null;
      //: ★the MOVING capacity, `(3/2)V'_old n_old` — the weight the state
      //: arrived on when the caller re-traced its metric between steps.  The
      //: entry has taken it since the moving-metric pair landed and this
      //: wrapper did not pass it: every argument after it was therefore one
      //: slot out, which surfaces as "cannot convert a BigInt" from the
      //: marshalling rather than as a wrong number.  Null keeps the
      //: arithmetic every caller written before it had.
      var capOld = o.capacityOld ? s.put(o.capacityOld) : null;
      var rc = self.e.fylite_rs_transport_step(
        x.ptr, y.ptr, BigInt(n), vp.ptr, v.ptr, src.ptr,
        cap ? cap.ptr : 0, met ? met.ptr : 0, capOld ? capOld.ptr : 0,
        o.model | 0, o.p0, num(o.p1, 0), num(o.p2, 0),
        num(o.dt, Infinity), num(o.theta, 1),
        o.edgeValue === undefined || o.edgeValue === null ? NaN : o.edgeValue,
        num(o.relax, 1), num(o.relaxCoeff, 1), num(o.dPc, 0),
        num(o.tol, 1e-10), BigInt(o.maxInner || 200),
        nsurf ? nsurf.ptr : 0, nion ? nion.ptr : 0,
        BigInt(ne ? ne.nion : 0), nsc ? nsc.ptr : 0, ngb ? ngb.ptr : 0,
        cg ? cg.ptr : 0, out.ptr, info.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_transport_step', rc);
      var inf = s.get(info);
      return { y: s.get(out), innerIterations: inf[0] | 0,
               converged: inf[1] === 1, residual: inf[2] };
    });
  };

  /** Weighted ridge least squares — the kernel's (FYL-DESIGN-07 D-4). */
  Fy.prototype.ridgeLstsq = function (a, b, w, nrow, ncol, lambda) {
    var self = this;
    return this.scope(function (s) {
      var pa = s.put(a), pb = s.put(b), pw = s.put(w), pl = s.put(lambda),
          out = s.zeros(ncol);
      var rc = self.e.fylite_rs_ridge_lstsq(pa.ptr, pb.ptr, pw.ptr,
        BigInt(nrow), BigInt(ncol), pl.ptr, out.ptr);
      //: -2 is "not positive definite", which the caller must see as a
      //: refusal rather than as a solve that returned something
      if (rc !== 0) return null;
      return s.get(out);
    });
  };

  /** Profile fit with GCV order selection — the kernel's. */
  Fy.prototype.profileFit = function (x, y, sigma, maxOrder) {
    var self = this, n = x.length, m = maxOrder + 1;
    return this.scope(function (s) {
      var px = s.put(x), py = s.put(y), ps = s.put(sigma),
          co = s.zeros(m), sw = s.zeros(m), inf = s.zeros(3);
      var rc = self.e.fylite_rs_profile_fit(px.ptr, py.ptr, ps.ptr,
        BigInt(n), BigInt(maxOrder), co.ptr, sw.ptr, inf.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_profile_fit', rc);
      var i = s.get(inf), order = i[0] | 0;
      return { coef: s.get(co).slice(0, order + 1), order: order,
               gcvSweep: s.get(sw), rss: i[1], chi2PerDof: i[2] };
    });
  };

  /**
   * A MONOMIAL polynomial least-squares fit, `y(x) = sum_k c_k x^k`.
   *
   * ★Not `profileFit`: that one fits shifted Legendre with a GCV order
   * choice, which is the right basis for a measurement and the wrong one
   * for a caller that must hand monomial coefficients to
   * `gs_fixed_solve`.  The solve is the kernel's `ridge_lstsq`; what is
   * built here is the Vandermonde and nothing else.
   *
   * `lambda` is a per-coefficient ridge, tiny by default — the design
   * matrix of a degree-6 monomial fit on [0, 1] is ill-conditioned and a
   * fit that silently returned nonsense would be a pressure profile nobody
   * checked.  The RESIDUAL comes back so a caller can say so instead.
   */
  Fy.prototype.polyFit = function (x, y, degree, lambda) {
    var n = x.length, m = (degree | 0) + 1, i, k;
    var a = new Float64Array(n * m), w = new Float64Array(n);
    for (i = 0; i < n; i++) {
      var v = 1;
      for (k = 0; k < m; k++) { a[i * m + k] = v; v *= x[i]; }
      w[i] = 1;
    }
    var lam = new Float64Array(m);
    for (k = 0; k < m; k++) lam[k] = lambda === undefined ? 1e-10 : lambda;
    var coef = this.ridgeLstsq(a, y, w, n, m, lam);
    //: the residual of the fit that was actually made, at the points it was
    //: made on — reported rather than assumed small
    var rss = 0, tot = 0, mean = 0;
    for (i = 0; i < n; i++) mean += y[i];
    mean /= Math.max(1, n);
    for (i = 0; i < n; i++) {
      var f = 0, p = 1;
      for (k = 0; k < m; k++) { f += coef[k] * p; p *= x[i]; }
      rss += (y[i] - f) * (y[i] - f);
      tot += (y[i] - mean) * (y[i] - mean);
    }
    return { coef: Array.prototype.slice.call(coef), rss: rss,
             rms: Math.sqrt(rss / Math.max(1, n)),
             relative: tot > 0 ? Math.sqrt(rss / tot) : 0 };
  };

  /**
   * Even-odd point-in-polygon, the kernel's — the SAME rule the plasma mask
   * and the surface tracer use, so a caller deciding "is this node in the
   * vessel" gets the kernel's answer, boundary cases included.
   *
   * `o` = `{r, z, polyR, polyZ}` with `r`/`z` the query points.
   */
  Fy.prototype.insidePolygon = function (o) {
    var self = this, n = o.r.length;
    return this.scope(function (s) {
      var r = s.put(o.r), z = s.fixed('insidePolygon.z', o.z, n),
          pr = s.put(o.polyR),
          pz = s.fixed('insidePolygon.polyZ', o.polyZ, o.polyR.length),
          out = s.zeros(n);
      var rc = self.e.fylite_rs_inside_polygon(
        r.ptr, z.ptr, BigInt(n), pr.ptr, pz.ptr,
        BigInt(o.polyR.length), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_inside_polygon', rc);
      return s.get(out);
    });
  };

  /**
   * One Delta* solve on a rectangle: `Delta* psi = rhs`, Dirichlet values
   * taken from `psi`'s own border and the interior overwritten.
   *
   * ★This is the kernel's fast direct solve (Hockney) and nothing else —
   * no Picard, no axis, no normalisation.  It was bound because the
   * fixed-boundary refinement on this site used to run its Picard in the
   * worker; that loop is now `gsFixedBox` below and this entry has no
   * caller on the page.  It stays bound because it is the one piece of the
   * chain a reader can check ALONE: hand it a border and a source and the
   * field comes back, with no axis rule and no plasma mask in between —
   * which is exactly what `app/tests/validate-evolve.mjs` does natively to
   * the box the session file carries.
   *
   * `o` = `{r, z, psi, rhs}`; the solved field comes back.
   */
  Fy.prototype.deltaStarSolve = function (o) {
    var self = this, nr = o.r.length, nz = o.z.length, n = nr * nz;
    return this.scope(function (s) {
      var r = s.put(o.r), z = s.put(o.z),
          psi = s.fixed('deltastar.psi', o.psi, n),
          rhs = s.fixed('deltastar.rhs', o.rhs, n);
      var rc = self.e.fylite_rs_deltastar_solve(
        r.ptr, BigInt(nr), z.ptr, BigInt(nz), psi.ptr, rhs.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_deltastar_solve', rc);
      return s.get(psi);
    });
  };

  /**
   * A FIXED-boundary Grad-Shafranov solve with polynomial p' and FF'.
   *
   * `o` = `{r, z, psi, psiBoundary, pprime, ffprime, relax, maxIter, tol}`;
   * `psi` carries the Dirichlet border in and comes back solved.
   *
   * ★★What this is FOR here: the free-boundary solver takes a
   * two-parameter current family, so a coupled march could only hand its
   * pressure back through `(emp, enp)` — a shape outside that family simply
   * could not be represented, and the page had to report the residual and
   * live with it.  This entry takes p' and FF' as polynomials, so the
   * transport's own pressure gradient goes in to whatever degree the reader
   * asks for.
   *
   * ★★NOT what `scenario/model`'s refinement calls, and the reason is a
   * property of this entry rather than a preference: its Picard finds the
   * axis as the interior extremum FARTHEST FROM `psiBoundary` over the
   * whole rectangle, and its plasma is the threshold set `0 <= psibar < 1`.
   * Both rules are right on a machine-sized grid and wrong on a sub-grid
   * cut tightly around one plasma — the box's own outboard corner is
   * farther from psi_b than the axis is (measured on EAST: axis +0.774 Wb,
   * corner -0.916 Wb), so the search takes the corner and the "plasma" is
   * an annulus outside the separatrix.  A box wants `gsFixedBox` below,
   * which takes the axis and mask rules the FREE solver already uses.
   * This entry stays bound for the whole-grid case it is right for.
   *
   * ★And its gauge: it solves `Delta* psi = -mu0 R j_phi`, which is psi
   * PER RADIAN, while `gsFreeSolve` on this site produces total flux (Wb)
   * and solves `Delta* psi = -2 pi mu0 R j_phi`.  A caller handing this
   * entry a Wb field with derivatives taken against Wb is out by 4 pi^2,
   * not by 2 pi.
   */
  Fy.prototype.gsFixedSolve = function (o) {
    var self = this, nr = o.r.length, nz = o.z.length;
    return this.scope(function (s) {
      var r = s.put(o.r), z = s.put(o.z),
          psi = s.fixed('gsfix.psi', o.psi, nr * nz),
          pp = s.put(o.pprime), ffp = s.put(o.ffprime),
          out = s.zeros(5);
      var it = self.e.fylite_rs_gs_fixed_solve(
        r.ptr, BigInt(nr), z.ptr, BigInt(nz), psi.ptr,
        num(o.psiBoundary, 0), pp.ptr, BigInt(o.pprime.length),
        ffp.ptr, BigInt(o.ffprime.length), num(o.relax, 0.5),
        BigInt(o.maxIter || 200), num(o.tol, 1e-8), out.ptr);
      if (it < 0) throw new SolveError('fylite_rs_gs_fixed_solve', it);
      var v = s.get(out);
      return { psi: s.get(psi), psiAxis: v[0], axisR: v[1], axisZ: v[2],
               ip: v[3], residual: v[4], iterations: it };
    });
  };

  /**
   * The FIXED-boundary Picard on a SUB-BOX — the axis searched only where
   * the plasma already is, the plasma taken by CONNECTIVITY (T-M7).
   *
   * ★★What it replaces, and it is not a preference.  `gsFixedSolve` above
   * finds the axis as the interior extremum FARTHEST from `psiBoundary`
   * over the whole rectangle and calls the plasma the threshold set
   * `0 <= psibar < 1`.  Both rules are right on a machine-sized grid; on a
   * box cut tightly around one plasma the box's own outboard corner is
   * farther from psi_b than the axis is (measured on EAST: axis +0.774 Wb,
   * corner -0.916 Wb), so the search takes the corner and the source region
   * becomes an annulus OUTSIDE the separatrix — a solve that converges to a
   * different object.  The threshold also admits a diverted plasma's
   * private flux region.  This entry takes the free solver's own two rules
   * instead: an axis inside a dilation of the previous plasma ("the axis is
   * a continuous object; it does not teleport") and a flood fill from it.
   *
   * ★★ONE GAUGE, named by the caller.  `gauge` is how many radians of psi
   * one unit of the array holds — `2 * Math.PI` for this site's total flux
   * [Wb], `1` for psi per radian — and the equation solved is
   * `Delta* psi = -gauge mu0 R j_phi`.  The profiles are `dp/dpsibar` [Pa]
   * and `d(F^2/2)/dpsibar` [T^2 m^2], per NORMALISED flux: the kernel
   * divides by the span the ITERATE has, which is what keeps a refinement
   * from carrying a pressure computed against a span it did not reach and
   * what makes the current self-limiting.
   *
   * `o.source` is `{pprime, ffprime}` as monomial coefficients in psibar,
   * or `{x, pprime, ffprime}` for a table on `x`, either with optional
   * `ppScale` / `ffScale` applied to the EVALUATED value.
   *
   * `o` = `{r, z, dr, dz, psi, psiBoundary, signAxis, seedR, seedZ,
   *         limR, limZ, source, gauge, dilate, relax, maxIter, tol}`.
   * Returns `null` with `why` set on a refusal, because a plasma that left
   * the box is an ANSWER the caller has to report and not an exception.
   */
  Fy.prototype.gsFixedBox = function (o) {
    var self = this, nr = o.r.length, nz = o.z.length, n = nr * nz;
    var src = o.source, tab = src.x && src.x.length ? src.x : null;
    var nlim = o.limR ? o.limR.length : 0;
    //: ★T-M17: `ipTarget` (finite) routes through the CONSTRAINED entry —
    //: the FF' constant absorbs the difference between what the profiles
    //: want and the current the Dirichlet border was computed for.  The
    //: shift and the raw current come back so the caller can re-state the
    //: source it actually solved (add `ffShift` to FF''s constant term).
    var withIp = o.ipTarget !== undefined && o.ipTarget !== null
                 && isFinite(o.ipTarget);
    return this.scope(function (s) {
      var r = s.put(o.r), z = s.put(o.z),
          psi = s.fixed('gsbox.psi', o.psi, n),
          lr = nlim ? s.put(o.limR) : null,
          lz = nlim ? s.fixed('gsbox.limZ', o.limZ, nlim) : null,
          px = tab ? s.put(tab) : null,
          pp = s.put(src.pprime), ffp = s.put(src.ffprime),
          out = s.zeros(8);
      var head = [
        r.ptr, BigInt(nr), z.ptr, BigInt(nz), o.dr, o.dz, psi.ptr,
        num(o.psiBoundary, 0), num(o.signAxis, 1), o.seedR, o.seedZ,
        lr ? lr.ptr : 0, lz ? lz.ptr : 0, BigInt(nlim),
        px ? px.ptr : 0, BigInt(tab ? tab.length : 0),
        pp.ptr, BigInt(src.pprime.length), num(src.ppScale, 1),
        ffp.ptr, BigInt(src.ffprime.length), num(src.ffScale, 1),
        num(o.gauge, 1), BigInt(o.dilate === undefined ? 2 : o.dilate),
        num(o.relax, 0.5), BigInt(o.maxIter || 300), num(o.tol, 1e-9)];
      var it = withIp
        ? self.e.fylite_rs_gs_fixed_box_ip.apply(
            null, head.concat([o.ipTarget, out.ptr]))
        : self.e.fylite_rs_gs_fixed_box.apply(
            null, head.concat([out.ptr]));
      //: ★the four refusals travel as NAMES, not as a code: each one sends
      //: the reader somewhere different (the seed is the caller's, "grew"
      //: is the equilibrium's, an empty axis search is the source's), and a
      //: page that printed "-4" would be asking them to read this file.
      if (it < 0) {
        var why = { '-3': 'seed', '-4': 'grew', '-5': 'axis',
                    '-6': 'span' }[String(it)];
        if (!why) throw new SolveError('fylite_rs_gs_fixed_box', it);
        return { why: why };
      }
      var v = s.get(out);
      return { psi: s.get(psi), psiAxis: v[0], axisR: v[1], axisZ: v[2],
               ip: v[3], residual: v[4], span: v[5], iterations: it,
               ffShift: withIp ? v[6] : 0, ipRaw: withIp ? v[7] : v[3],
               why: null };
    });
  };

  /** Trace one flux surface from a psi map and integrate over it. */
  Fy.prototype.traceSurface = function (o) {
    var self = this, nt = o.nTheta || 181;
    return this.scope(function (s) {
      var psi = s.put(o.psi), lr = s.put(o.limR), lz = s.put(o.limZ),
          rz = s.zeros(2 * nt), inf = s.zeros(6);
      var rc = self.e.fylite_rs_trace_surface(
        o.r0, o.z0, o.dr, o.dz, BigInt(o.nr), BigInt(o.nz), psi.ptr,
        o.level, o.axisR, o.axisZ, lr.ptr, lz.ptr, BigInt(o.limR.length),
        BigInt(nt), rz.ptr, inf.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_trace_surface', rc);
      var v = s.get(rz), i = s.get(inf), poly = [];
      for (var k = 0; k < rc; k++) poly.push([v[2 * k], v[2 * k + 1]]);
      return { poly: poly, gq: i[1], perimeter: i[2], dlOverGrad: i[3],
               dVdPsi: i[4], volume: i[5] };
    });
  };

  /** Field-null design, rows and all — the kernel's. */
  Fy.prototype.designNull = function (o) {
    var self = this, nch = o.nch;
    return this.scope(function (s) {
      var br = s.put(o.br), bz = s.put(o.bz), psi = s.put(o.psi),
          xr = o.xRef ? s.put(o.xRef) : null,
          im = o.iMax ? s.put(o.iMax) : null,
          out = s.zeros(nch), fl = s.zeros(nch);
      var used = self.e.fylite_rs_design_null(
        br.ptr, bz.ptr, psi.ptr, BigInt(nch), BigInt(o.npts), o.bTol,
        o.fluxTarget === null || o.fluxTarget === undefined ? NaN : o.fluxTarget,
        o.weightNull, o.weightFlux, num(o.lambda, 1e-12),
        xr ? xr.ptr : 0, im ? im.ptr : 0, out.ptr, fl.ptr);
      //: ★-3 is NOT an error to raise here, and not a result to pass off as
      //: one either: the bounded solve ran out of iterations, and the last
      //: iterate IS in `out` — a point on a descent, not a minimum.  The
      //: caller gets it together with `converged: false` and has to say so;
      //: what it must not do is draw it as a design.  (At the old 4000-step
      //: cap a binding EAST design sat 4.3x above its converged objective,
      //: silently, on both hosts.)
      if (used < 0 && used !== -3)
        throw new SolveError('fylite_rs_design_null', used);
      var f = s.get(fl), bind = [], over = [];
      for (var c = 0; c < nch; c++) {
        if (f[c] === 1) bind.push(c);
        else if (f[c] === 2) over.push(c);
      }
      return { x: s.get(out), iterations: used < 0 ? null : used,
               converged: used >= 0, bind: bind, over: over };
    });
  };

  // --- L4/L7: the operating domain, the flux account, and the START -------
  //
  // ★★What these buy the pages, and why they were missing.  The design
  // scenario could report a shape to three decimals and a gain to four, and
  // could not say whether the point it had just drawn is one the machine can
  // run: no density limit, no beta, no q, no flux bill, and — for a machine
  // with no reference shot — no state to start its anneal from.  Every one
  // of them is in the kernel; none of them had a wire.

  /** Smallest boundary-to-wall distance: `{ gap, r, z }`. */
  Fy.prototype.wallClearance = function (o) {
    var self = this;
    return this.scope(function (s) {
      var br = s.put(o.bndR), bz = s.put(o.bndZ), wr = s.put(o.wallR),
          wz = s.put(o.wallZ), out = s.zeros(3);
      var rc = self.e.fylite_rs_wall_clearance(
        br.ptr, bz.ptr, BigInt(o.bndR.length), wr.ptr, wz.ptr,
        BigInt(o.wallR.length), out.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_wall_clearance', rc);
      var v = s.get(out);
      return { gap: v[0], r: v[1], z: v[2] };
    });
  };

  /**
   * The channel voltages that make a prescribed current trajectory happen,
   * and the passive currents it induces.
   *
   * The exact inverse of `evolveCircuits` — same implicit Euler, same
   * interval-end sample — so a design made here and checked there agrees
   * to solver precision rather than to a tolerance.
   */
  Fy.prototype.feedforwardVoltages = function (o) {
    var self = this, n = o.r.length, nch = o.nch, nt = o.t.length;
    return this.scope(function (s) {
      var m = s.put(o.m), r = s.put(o.r), t = s.put(o.t), x = s.put(o.x),
          ov = s.zeros(nt * nch), oy = s.zeros(nt * (n - nch));
      var rc = self.e.fylite_rs_feedforward_voltages(
        m.ptr, r.ptr, BigInt(n), BigInt(nch), t.ptr, BigInt(nt), x.ptr,
        ov.ptr, oy.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_feedforward_voltages', rc);
      return { v: s.get(ov), y: s.get(oy), nch: nch, nv: n - nch };
    });
  };

  /** Thermal stored energy [J] of prescribed profiles. */
  Fy.prototype.zerodStoredEnergy = function (o) {
    var self = this, n = o.rho.length;
    return this.scope(function (s) {
      var r = s.put(o.rho), ne = s.put(o.ne), te = s.put(o.te),
          ti = s.put(o.ti);
      var w = self.e.fylite_rs_zerod_stored_energy(
        r.ptr, ne.ptr, te.ptr, ti.ptr, BigInt(n), o.volume);
      if (!isFinite(w)) throw new SolveError('fylite_rs_zerod_stored_energy', -1);
      return w;
    });
  };

  /**
   * The two profile averages this layer distinguishes: `{ line, volume }`.
   *
   * Both come back together because which one is meant is exactly what
   * gets answered wrongly — the Greenwald ratio takes the LINE average.
   */
  Fy.prototype.zerodAverages = function (o) {
    var self = this, n = o.rho.length;
    return this.scope(function (s) {
      var r = s.put(o.rho), f = s.put(o.f), out = s.zeros(2);
      var rc = self.e.fylite_rs_zerod_averages(r.ptr, f.ptr, BigInt(n),
                                               out.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_zerod_averages', rc);
      var v = s.get(out);
      return { line: v[0], volume: v[1] };
    });
  };

  /**
   * The ohmic loop voltage and the two circuit terms behind it —
   * `{ vLoop, rp, lp }`.
   *
   * ★Bound here so the criteria pass can charge an ANALYSIS-tier discharge
   * its ohmic power without a second resistivity: `P_ohm = Ip^2 Rp`, and Rp
   * is the kernel's neoclassical-corrected Spitzer, not a copy of it.  The
   * tier-A trace reports V_loop, which is `Ip Rp + Lp dIp/dt` — the
   * inductive term makes V_loop x Ip the wrong ohmic power everywhere the
   * current is moving, which is exactly where an L-H margin is asked about.
   * `dipDt` may be left at 0 when only Rp is wanted; it does not enter it.
   */
  Fy.prototype.zerodLoopVoltage = function (o) {
    var self = this;
    return this.scope(function (s) {
      var out = s.zeros(3);
      var rc = self.e.fylite_rs_zerod_loop_voltage(
        o.ip, o.teAvg, o.r0, o.a, o.kappa, o.zeff, o.li,
        num(o.dipDt, 0), out.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_zerod_loop_voltage', rc);
      var v = s.get(out);
      return { vLoop: v[0], rp: v[1], lp: v[2] };
    });
  };

  /**
   * The operating point's dimensionless standing.
   *
   * `neBar` is the LINE-AVERAGED density: the Greenwald ratio is defined
   * against that one, and a central value handed here would read a peaked
   * profile as further from the limit than it is.
   */
  Fy.prototype.zerodLimits = function (o) {
    var self = this;
    return this.scope(function (s) {
      var out = s.zeros(9);
      var rc = self.e.fylite_rs_zerod_limits(
        o.ip, o.r0, o.a, o.kappa, o.bt, o.neBar, o.wTh, o.volume, out.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_zerod_limits', rc);
      var v = s.get(out);
      return { nGreenwald: v[0], fGreenwald: v[1], qCyl: v[2], pAvg: v[3],
               bPol: v[4], betaT: v[5], betaP: v[6], betaN: v[7],
               fTroyon: v[8] };
    });
  };

  /**
   * The poloidal-flux account of a pulse.
   *
   * `phiAvail` is the swing the machine can deliver [Wb]; 0 leaves
   * `tSustain` at -1, which the page must show as "not declared" rather
   * than as a duration.
   */
  Fy.prototype.zerodFluxBudget = function (o) {
    var self = this, n = o.t.length;
    return this.scope(function (s) {
      var t = s.put(o.t), v = s.put(o.vLoop), ip = s.put(o.ip),
          ph = s.put(o.phases), out = s.zeros(7);
      var rc = self.e.fylite_rs_zerod_flux_budget(
        t.ptr, v.ptr, ip.ptr, BigInt(n), ph.ptr, o.r0, o.a, o.li,
        num(o.cEjima, 0.45), num(o.phiAvail, 0), out.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_zerod_flux_budget', rc);
      var x = s.get(out);
      return { phiInd: x[0], phiResRamp: x[1], phiRamp: x[2],
               phiConsumed: x[3], vFlattop: x[4], lP: x[5],
               tSustain: x[6] < 0 ? null : x[6] };
    });
  };

  /**
   * Where the boundary surface meets the wall — `[[r, z], ...]`.
   *
   * The observable that says which TOPOLOGY you have: a diverted plasma
   * lands its legs somewhere the boundary itself never goes.
   */
  Fy.prototype.strikePoints = function (o) {
    var self = this, g = o.grid, maxN = num(o.maxN, 16);
    return this.scope(function (s) {
      var psi = s.put(o.psi), wr = s.put(o.wallR), wz = s.put(o.wallZ),
          out = s.zeros(2 * maxN);
      var n = self.e.fylite_rs_strike_points(
        g.r0, g.z0, g.dr, g.dz, BigInt(g.nr), BigInt(g.nz), psi.ptr,
        o.psiBnd, wr.ptr, wz.ptr, BigInt(o.wallR.length), BigInt(maxN),
        out.ptr);
      if (n < 0) throw new SolveError('fylite_rs_strike_points', n);
      var v = s.get(out), pts = [];
      for (var i = 0; i < n; i++) pts.push([v[2 * i], v[2 * i + 1]]);
      return pts;
    });
  };

  /** Fill a boundary with current filaments — the START's plasma model. */
  Fy.prototype.fillFilaments = function (o) {
    var self = this, nb = o.bndR.length, nring = num(o.nRing, 4);
    return this.scope(function (s) {
      var br = s.put(o.bndR), bz = s.put(o.bndZ),
          out = s.zeros(3 * nb * nring);
      var n = self.e.fylite_rs_fill_filaments(
        br.ptr, bz.ptr, BigInt(nb), o.ip, BigInt(nring),
        num(o.peaking, 1), out.ptr);
      if (n < 0) throw new SolveError('fylite_rs_fill_filaments', n);
      var v = s.get(out), r = [], z = [], a = [];
      for (var i = 0; i < n; i++) {
        r.push(v[3 * i]); z.push(v[3 * i + 1]); a.push(v[3 * i + 2]);
      }
      return { r: r, z: z, a: a };
    });
  };

  /**
   * The channel currents that make a requested boundary isoflux — the state
   * a shape anneal is entitled to start from.
   *
   * ★It is NOT an equilibrium: force balance is nowhere in it.  What comes
   * back with it (`psiRms`, `bX`) is what it achieved, so a caller can tell
   * a usable start from an impossible target without paying for eight
   * equilibrium solves to find out.
   */
  Fy.prototype.startCurrents = function (o) {
    var self = this, el = o.elements, nch = o.nch;
    //: ★T-D18: the nulls are a SET.  `xPoints` is the new spelling; the old
    //: `useX`/`xR`/`xZ` is read as the set of one it always was, so a caller
    //: that never asked for two gets the same rows in the same order — and,
    //: measured, the same numbers.
    var xs = o.xPoints ? o.xPoints.slice()
           : (o.useX ? [{ r: num(o.xR, 0), z: num(o.xZ, 0) }] : []);
    //: ★T-D7: extra isoflux rows at points the WALL chose — 「the boundary
    //: passes through here」.  A gap request and a strike-point request are
    //: both one of these; `gapRow` / `wallSnap` below make the point.
    var ct = o.control || [];
    //: a zero-length block is a zero-byte allocation, which this heap
    //: refuses — the kernel reads only the count it is given, so an empty
    //: set travels as one unread word
    var pad = function (v) { return v.length ? v : [0]; };
    return this.scope(function (s) {
      var r = s.put(el.r), z = s.put(el.z), w = s.put(el.w), h = s.put(el.h),
          a = s.put(el.a), a2 = s.put(el.a2), wt = s.put(o.weights),
          br = s.put(o.bndR), bz = s.put(o.bndZ),
          fr = s.put(o.filR), fz = s.put(o.filZ), fa = s.put(o.filA),
          xr = s.put(pad(xs.map(function (p) { return p.r; }))),
          xz = s.put(pad(xs.map(function (p) { return p.z; }))),
          cr = s.put(pad(ct.map(function (p) { return p.r; }))),
          cz = s.put(pad(ct.map(function (p) { return p.z; }))),
          cw = s.put(pad(ct.map(function (p) { return num(p.w, 1); }))),
          im = o.iMax ? s.put(o.iMax) : null,
          out = s.zeros(nch), fl = s.zeros(nch), st = s.zeros(4),
          xst = s.zeros(2 * xs.length + 2), cst = s.zeros(ct.length + 1);
      var rc = self.e.fylite_rs_start_currents_multi(
        r.ptr, z.ptr, w.ptr, h.ptr, a.ptr, a2.ptr, BigInt(el.r.length),
        wt.ptr, BigInt(nch), br.ptr, bz.ptr, BigInt(o.bndR.length),
        fr.ptr, fz.ptr, fa.ptr, BigInt(o.filR.length),
        xr.ptr, xz.ptr, BigInt(xs.length), num(o.xWeight, 1),
        cr.ptr, cz.ptr, cw.ptr, BigInt(ct.length),
        num(o.length, 1), num(o.lambda, 1e-3), im ? im.ptr : 0,
        BigInt(num(o.nu, 3)), BigInt(num(o.nv, 3)),
        out.ptr, fl.ptr, st.ptr, xst.ptr, cst.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_start_currents_multi', rc);
      var f = s.get(fl), bind = [], v = s.get(st),
          xv = s.get(xst), cv = s.get(cst), nulls = [], ctl = [];
      for (var c = 0; c < nch; c++) if (f[c] === 1) bind.push(c);
      for (var k = 0; k < xs.length; k++)
        nulls.push({ r: xs[k].r, z: xs[k].z, b: xv[2 * k],
                     dpsi: xv[2 * k + 1] });
      for (k = 0; k < ct.length; k++) ctl.push(cv[k]);
      return { x: s.get(out), psiRms: v[0], bX: v[1] < 0 ? null : v[1],
               psiXOffset: v[2], bind: bind, nulls: nulls, ctlDpsi: ctl };
    });
  };

  // --- T-D7: the wall geometry a shape-control row is made of -------------
  //
  // ★What real shape control targets is ROG / RIG, the upper and lower gaps,
  // and where the legs land.  Both become an isoflux row at a point the WALL
  // defines; these two entries are what turn a request into that point, and
  // the first of them also reports what a solved boundary achieved on the
  // same ray — one function for the target and its achievement, so a
  // 「目标 vs 实现」 row cannot end up comparing two pieces of geometry.

  /**
   * One gap row: `{ tWall, wallR, wallZ, ctlR, ctlZ, achieved }`.
   *
   * Pass `bndR`/`bndZ` to ask what a solved boundary achieves on this ray;
   * omit them (design time) and `achieved` comes back NaN rather than a
   * zero that would read like a hit.
   */
  Fy.prototype.gapRow = function (o) {
    var self = this, nb = o.bndR ? o.bndR.length : 0;
    return this.scope(function (s) {
      var br = s.put(nb ? o.bndR : [0]), bz = s.put(nb ? o.bndZ : [0]),
          wr = s.put(o.wallR), wz = s.put(o.wallZ), out = s.zeros(6);
      var rc = self.e.fylite_rs_shape_gap_row(
        br.ptr, bz.ptr, BigInt(nb), wr.ptr, wz.ptr, BigInt(o.wallR.length),
        o.r0, o.z0, o.dr, o.dz, num(o.gap, 0), out.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_shape_gap_row', rc);
      var v = s.get(out);
      return { tWall: v[0], wallR: v[1], wallZ: v[2], ctlR: v[3],
               ctlZ: v[4], achieved: v[5] };
    });
  };

  /** A requested strike point snapped to the wall: `{r, z, seg, dist}`. */
  Fy.prototype.wallSnap = function (o) {
    var self = this;
    return this.scope(function (s) {
      var wr = s.put(o.wallR), wz = s.put(o.wallZ), out = s.zeros(4);
      var rc = self.e.fylite_rs_wall_snap(
        wr.ptr, wz.ptr, BigInt(o.wallR.length), o.r, o.z, out.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_wall_snap', rc);
      var v = s.get(out);
      return { r: v[0], z: v[1], seg: v[2] | 0, dist: v[3] };
    });
  };

  /** The psi map's saddle points: `[{r, z, psin, grad}, ...]`. */
  Fy.prototype.xPoints = function (o) {
    var self = this, g = o.grid, maxN = num(o.maxN, 8);
    return this.scope(function (s) {
      var psi = s.put(o.psi), out = s.zeros(4 * maxN);
      var n = self.e.fylite_rs_x_points(
        g.r0, g.z0, g.dr, g.dz, BigInt(g.nr), BigInt(g.nz), psi.ptr,
        o.psiAxis, o.psiBnd, o.axisR, o.axisZ, num(o.psinWindow, 0.2),
        num(o.minAxisDist, 0.1), out.ptr, BigInt(maxN));
      if (n < 0) throw new SolveError('fylite_rs_x_points', n);
      var v = s.get(out), pts = [];
      for (var i = 0; i < n; i++)
        pts.push({ r: v[4 * i], z: v[4 * i + 1], psin: v[4 * i + 2],
                   grad: v[4 * i + 3] });
      return pts;
    });
  };

  /** The rigid plasma filament set of a solved equilibrium. */
  Fy.prototype.plasmaFilaments = function (o) {
    var self = this, g = o.grid, coarsen = num(o.coarsen, 2);
    var cap = Math.ceil(g.nr / coarsen) * Math.ceil(g.nz / coarsen);
    return this.scope(function (s) {
      var psi = s.put(o.psi), pp = s.put(o.pprime), ff = s.put(o.ffprim),
          br = s.put(o.bndR), bz = s.put(o.bndZ),
          orr = s.zeros(cap), oz = s.zeros(cap), oa = s.zeros(cap);
      var n = self.e.fylite_rs_plasma_filaments(
        g.r0, g.z0, g.dr, g.dz, BigInt(g.nr), BigInt(g.nz), psi.ptr,
        o.psiAxis, o.psiBnd, pp.ptr, BigInt(o.pprime.length), ff.ptr,
        BigInt(o.ffprim.length), br.ptr, bz.ptr, BigInt(o.bndR.length),
        o.ip, BigInt(coarsen), BigInt(cap), orr.ptr, oz.ptr, oa.ptr);
      if (n < 0) throw new SolveError('fylite_rs_plasma_filaments', n);
      return { r: s.get(orr).slice(0, n), z: s.get(oz).slice(0, n),
               a: s.get(oa).slice(0, n) };
    });
  };

  /**
   * The linearised vertical plant: the open-loop growth rate and the
   * regime boundary it is judged against.
   *
   * `gamma > 0` with `k < kIdeal` is the resistive-wall regime the passive
   * structure holds long enough to be controlled; `k >= kIdeal` is the
   * ideal instability no feedback reaches.
   */
  Fy.prototype.verticalPlant = function (o) {
    var self = this, n = o.r.length;
    return this.scope(function (s) {
      var m = s.put(o.m), r = s.put(o.r), g = s.put(o.g),
          ms = s.zeros(n * n), cxi = s.zeros(n), mode = s.zeros(n),
          info = s.zeros(2);
      var rc = self.e.fylite_rs_vertical_plant(
        m.ptr, r.ptr, g.ptr, BigInt(n), o.ip, o.k, ms.ptr, cxi.ptr,
        mode.ptr, info.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_vertical_plant', rc);
      var v = s.get(info);
      return { gamma: v[0], kIdeal: v[1], cXi: s.get(cxi),
               mode: s.get(mode) };
    });
  };

  /** Circuit matrices in ampere-turn channel space: M (n*n) and R (n). */
  Fy.prototype.channelMatrices = function (o) {
    var self = this, ne = o.coils.r.length, nv = o.vessel.r.length,
        nch = o.nch, n = nch + nv;
    return this.scope(function (s) {
      var c = o.coils, w = o.vessel;
      var cr = s.put(c.r), cz = s.put(c.z), cw = s.put(c.w), ch = s.put(c.h),
          ca = s.put(c.a), ca2 = s.put(c.a2),
          vr = s.put(w.r), vz = s.put(w.z), vw = s.put(w.w), vh = s.put(w.h),
          va = s.put(w.a), va2 = s.put(w.a2),
          wt = s.put(o.weights), ec = s.put(o.etaCoil),
          ev = s.put(o.etaVessel), mo = s.zeros(n * n), ro = s.zeros(n);
      var rc = self.e.fylite_rs_channel_matrices(
        cr.ptr, cz.ptr, cw.ptr, ch.ptr, ca.ptr, ca2.ptr, BigInt(ne),
        vr.ptr, vz.ptr, vw.ptr, vh.ptr, va.ptr, va2.ptr, BigInt(nv),
        wt.ptr, BigInt(nch), ec.ptr, ev.ptr, BigInt(num(o.nu, 3)),
        BigInt(num(o.nv, 3)), mo.ptr, ro.ptr);
      if (rc < 0) throw new SolveError('fylite_rs_channel_matrices', rc);
      return { m: s.get(mo), r: s.get(ro), n: n };
    });
  };

  /**
   * R0 / a / kappa / delta of a closed outline — the kernel's.
   *
   * ★Elongation has a history here: a boundary taken at the separatrix once
   * reported 1.79 against EFIT's 1.389.  A quantity with that history should
   * not have two implementations.
   */
  Fy.prototype.shapeMetrics = function (poly) {
    var self = this, n = poly.length;
    return this.scope(function (s) {
      var rz = new Float64Array(2 * n);
      for (var i = 0; i < n; i++) { rz[2 * i] = poly[i][0]; rz[2 * i + 1] = poly[i][1]; }
      var p = s.put(rz), out = s.zeros(6);
      var rc = self.e.fylite_rs_shape_metrics(p.ptr, BigInt(n), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_shape_metrics', rc);
      var v = s.get(out);
      //: ★z0 is the boundary's vertical CENTRE — not the magnetic axis
      //: height, which sits above it by the Shafranov shift.  A design
      //: comparing a requested Z0 against the axis reads a drift that is
      //: not there and misses one that is.
      return { r0: v[0], a: v[1], kappa: v[2], deltaU: v[3], deltaL: v[4],
               z0: v[5], delta: 0.5 * (v[3] + v[4]) };
    });
  };

  /**
   * Marching-squares contour, for DRAWING only — unordered segments
   * [r0, z0, r1, z1, ...].  Anything needing an ordered outline uses
   * `traceSurface`: a segment soup cannot be walked through a saddle.
   */
  Fy.prototype.contour = function (o) {
    var self = this, cap = o.maxSeg || 4 * o.nr * o.nz;
    return this.scope(function (s) {
      var f = s.put(o.f), out = s.zeros(4 * cap);
      var n = self.e.fylite_rs_contour(
        o.r0, o.z0, o.dr, o.dz, BigInt(o.nr), BigInt(o.nz),
        f.ptr, o.level, BigInt(cap), out.ptr);
      if (n < 0) throw new SolveError('fylite_rs_contour', n);
      return s.get(out).subarray(0, 4 * n);
    });
  };

  //: --- the "what a solved field implies" family (FYL-DESIGN-07 D-4) ------
  //: These used to live in physics.js.  They are physics bookkeeping, not
  //: marshalling, so they belong to the one host; what remains here is the
  //: buffer shuffling their C signatures need.

  /** The plasma mask over interior cells, as a Uint8-like Float64Array. */
  Fy.prototype.plasmaMask = function (o) {
    var self = this, n = o.nr * o.nz, ncell = (o.nr - 2) * (o.nz - 2);
    return this.scope(function (s) {
      var psi = s.put(o.psi), iv = s.put(o.inVessel), out = s.zeros(ncell);
      var rc = self.e.fylite_rs_plasma_mask(psi.ptr, BigInt(o.nr), BigInt(o.nz),
        iv.ptr, o.psiBnd, num(o.sign, 1), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_plasma_mask', rc);
      return s.get(out);
    });
  };

  /** p' / FF' / p implied by a converged solve, plus the recovered j_c. */
  Fy.prototype.analyticTruth = function (o) {
    var self = this, nx = o.nx || 201, ncell = (o.nr - 2) * (o.nz - 2);
    return this.scope(function (s) {
      var psi = s.put(o.psi), r = s.put(o.rOf), mk = s.put(o.mask),
          out = s.zeros(4 * nx), inf = s.zeros(2);
      var rc = self.e.fylite_rs_analytic_truth(
        psi.ptr, BigInt(o.nr), BigInt(o.nz), r.ptr, o.dr, o.dz, mk.ptr,
        o.psiAxis, o.psiBnd, o.ip, o.beta0, o.emp, o.enp, o.r0, BigInt(nx),
        out.ptr, inf.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_analytic_truth', rc);
      var v = s.get(out), i2 = s.get(inf);
      return { pprime: v.slice(0, nx), ffprime: v.slice(nx, 2 * nx),
               p: v.slice(2 * nx, 3 * nx), x: v.slice(3 * nx, 4 * nx),
               jc: i2[0], spanPr: i2[1] };
    });
  };

  /** The same three profiles, from a reconstruction's fitted coefficients. */
  Fy.prototype.fittedProfiles = function (o) {
    var self = this, nx = o.nx || 201;
    return this.scope(function (s) {
      var c = s.put(o.coefs), out = s.zeros(4 * nx), inf = s.zeros(1);
      var rc = self.e.fylite_rs_fitted_profiles(
        c.ptr, BigInt(o.npp), BigInt(o.nff), o.psiAxis, o.psiBnd,
        BigInt(nx), out.ptr, inf.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_fitted_profiles', rc);
      var v = s.get(out);
      return { pprime: v.slice(0, nx), ffprime: v.slice(nx, 2 * nx),
               p: v.slice(2 * nx, 3 * nx), x: v.slice(3 * nx, 4 * nx),
               spanPr: s.get(inf)[0] };
    });
  };

  /** Cell currents implied by fitted coefficients. */
  Fy.prototype.fittedCurrent = function (o) {
    var self = this, ncell = (o.nr - 2) * (o.nz - 2);
    return this.scope(function (s) {
      var psi = s.put(o.psi), r = s.put(o.rOf), c = s.put(o.coefs),
          mk = s.put(o.mask), out = s.zeros(ncell);
      var rc = self.e.fylite_rs_fitted_current(
        psi.ptr, BigInt(o.nr), BigInt(o.nz), r.ptr, o.dr, o.dz,
        o.psiAxis, o.psiBnd, c.ptr, BigInt(o.npp), BigInt(o.nff),
        mk.ptr, out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_fitted_current', rc);
      return s.get(out);
    });
  };

  /** Synthetic flux-loop readings from a cell-current vector. */
  Fy.prototype.loopModel = function (o) {
    var self = this;
    return this.scope(function (s) {
      var lm = s.put(o.loopsM), c = s.put(o.cur), out = s.zeros(o.nLoop);
      var rc = self.e.fylite_rs_loop_model(lm.ptr, BigInt(o.nLoop), c.ptr,
        BigInt(o.nr), BigInt(o.nz), num(o.measScale, 1), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_loop_model', rc);
      return s.get(out);
    });
  };

  /** F(psi) = R*B_phi from FF', integrated inward from the edge value. */
  Fy.prototype.fProfile = function (x, ffprime, spanPr, fEdge) {
    var self = this, n = x.length;
    return this.scope(function (s) {
      var xv = s.put(x), ff = s.put(ffprime), out = s.zeros(n);
      var rc = self.e.fylite_rs_f_profile(xv.ptr, ff.ptr, BigInt(n),
                                          spanPr, fEdge, out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_f_profile', rc);
      return s.get(out);
    });
  };

  /**
   * Volume enclosed by a closed (R, Z) outline [m^3].
   *
   * ★Fewer than three points is an ERROR here, not a zero: "no outline" and
   * "an outline enclosing nothing" are different questions and only the
   * second has a volume for an answer.
   */
  Fy.prototype.enclosedVolume = function (poly) {
    var self = this, n = poly.length;
    return this.scope(function (s) {
      var rz = new Float64Array(2 * n);
      for (var i = 0; i < n; i++) { rz[2 * i] = poly[i][0]; rz[2 * i + 1] = poly[i][1]; }
      var p = s.put(rz), out = s.zeros(1);
      var rc = self.e.fylite_rs_enclosed_volume(p.ptr, BigInt(n), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_enclosed_volume', rc);
      return s.get(out)[0];
    });
  };

  /**
   * Internal inductance li(3) from the psi map.
   *
   *   li3 = 2 integral(Bp^2 dV) / (mu0^2 Ip^2 R0),  Bp = |grad psi| / (2 pi R)
   *
   * ★The definition, the gauge (psi is FULL flux) and the "where is the
   * plasma" rule (the cells with 0 <= psi_N <= 1, no contouring) are all the
   * kernel's, stated at `surfaces::li3`.  It is quoted here and nowhere
   * re-derived: li(3) is one of the numbers a reconstruction is judged on,
   * and two callers' li(3) are only comparable while they mean the same
   * integral.
   */
  Fy.prototype.li3 = function (o) {
    var self = this;
    return this.scope(function (s) {
      var psi = s.put(o.psi), out = s.zeros(1);
      var rc = self.e.fylite_rs_li3(
        o.r0g, o.z0g, o.dr, o.dz, BigInt(o.nr), BigInt(o.nz), psi.ptr,
        o.psiAxis, o.psiBnd, o.ip, o.r0, out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_li3', rc);
      return s.get(out)[0];
    });
  };

  /**
   * q(x) on traced surfaces, with the q0 / q95 conventions the kernel states
   * (linear extrapolation to the axis; interpolation at x = 0.95).
   *
   * `f` is a PROFILE, not a callback — the ABI cannot carry one, and every
   * caller has a profile anyway.  q0 / q95 come back NaN when fewer than two
   * surfaces traced, which is a different thing from a q of zero.
   */
  Fy.prototype.qProfile = function (o) {
    var self = this, nq = o.nq || 20;
    return this.scope(function (s) {
      var psi = s.put(o.psi), lr = s.put(o.limR), lz = s.put(o.limZ),
          fx = s.put(o.fx), fv = s.put(o.fv),
          out = s.zeros(2 * nq), inf = s.zeros(3);
      var n = self.e.fylite_rs_q_profile(
        o.r0, o.z0, o.dr, o.dz, BigInt(o.nr), BigInt(o.nz), psi.ptr,
        o.psiAxis, o.psiBnd, o.axisR, o.axisZ,
        lr.ptr, lz.ptr, BigInt(o.limR.length),
        fx.ptr, fv.ptr, BigInt(o.fx.length),
        BigInt(nq), BigInt(o.nTheta || 121), num(o.xLo, 0.06),
        num(o.xHi, 0.95), out.ptr, inf.ptr);
      if (n < 0) throw new SolveError('fylite_rs_q_profile', n);
      var v = s.get(out), i3 = s.get(inf);
      return { x: v.slice(0, n), q: v.slice(nq, nq + n),
               q0: i3[1], q95: i3[2] };
    });
  };

  /** Evaluate a fitted profile at given points — the kernel owns the basis. */
  Fy.prototype.profileSample = function (coef, x) {
    var self = this, n = x.length;
    return this.scope(function (s) {
      var c = s.put(coef), xv = s.put(x), out = s.zeros(n);
      var rc = self.e.fylite_rs_profile_sample(
        c.ptr, BigInt(coef.length), xv.ptr, BigInt(n), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_profile_sample', rc);
      return s.get(out);
    });
  };

  /** The plasma mask, built by the kernel from the limiter itself. */
  Fy.prototype.plasmaMaskLim = function (o) {
    var self = this, ncell = (o.nr - 2) * (o.nz - 2);
    return this.scope(function (s) {
      var psi = s.put(o.psi), lr = s.put(o.limR), lz = s.put(o.limZ),
          out = s.zeros(ncell);
      var rc = self.e.fylite_rs_plasma_mask_lim(
        o.r0, o.z0, o.dr, o.dz, BigInt(o.nr), BigInt(o.nz), psi.ptr,
        lr.ptr, lz.ptr, BigInt(o.limR.length), o.psiBnd, num(o.sign, 1),
        out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_plasma_mask_lim', rc);
      return s.get(out);
    });
  };

  /**
   * The Miller-like parametric boundary, as an array of `[r, z]` pairs.
   *
   * ★Triangularity is PER HALF: `deltaU` on `0 < theta < pi`, `deltaL`
   * elsewhere.  A single averaged delta draws a boundary a diverted machine
   * does not have.
   */
  Fy.prototype.millerBoundary = function (p, n) {
    var self = this, m = n || 121;
    return this.scope(function (s) {
      var orr = s.zeros(m), ozz = s.zeros(m);
      var rc = self.e.fylite_rs_miller_boundary(
        p.r0, p.z0, p.a, p.kappa, p.deltaU, p.deltaL, BigInt(m),
        orr.ptr, ozz.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_miller_boundary', rc);
      var rr = s.get(orr), zz = s.get(ozz), out = [];
      for (var q = 0; q < m; q++) out.push([rr[q], zz[q]]);
      return out;
    });
  };

  /**
   * The analytic current shape at `n` points.  ★Vectorised deliberately:
   * the caller evaluates it once per grid node, and a scalar entry would
   * pay an ABI crossing per node.
   */
  Fy.prototype.analyticShape = function (o) {
    var self = this, n = o.r.length;
    return this.scope(function (s) {
      var r = s.put(o.r), x = s.put(o.x), out = s.zeros(n);
      var rc = self.e.fylite_rs_analytic_shape(
        o.beta0, o.emp, o.enp, o.r0, r.ptr, x.ptr, BigInt(n), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_analytic_shape', rc);
      return s.get(out);
    });
  };

  /**
   * Bilinear read of a grid field at `n` points.  ★Out of the grid is NaN,
   * not a clamped edge value — a clamp reads the boundary node for every
   * point beyond it, which looks like a field that flattens outside the
   * vessel rather than one that was never measured there.
   */
  Fy.prototype.sampleGrid = function (o) {
    var self = this, n = o.r.length;
    return this.scope(function (s) {
      var f = s.put(o.f), r = s.put(o.r), z = s.put(o.z), out = s.zeros(n);
      var rc = self.e.fylite_rs_sample_grid(
        o.r0, o.z0, o.dr, o.dz, BigInt(o.nr), BigInt(o.nz), f.ptr,
        r.ptr, z.ptr, BigInt(n), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_sample_grid', rc);
      return s.get(out);
    });
  };

  /** Poloidal field from a psi map at `n` points -> `{br, bz}` arrays. */
  Fy.prototype.bField = function (o) {
    var self = this, n = o.r.length;
    return this.scope(function (s) {
      var psi = s.put(o.psi), r = s.put(o.r), z = s.put(o.z),
          obr = s.zeros(n), obz = s.zeros(n);
      var rc = self.e.fylite_rs_b_field(
        o.r0, o.z0, o.dr, o.dz, BigInt(o.nr), BigInt(o.nz), psi.ptr,
        r.ptr, z.ptr, BigInt(n), obr.ptr, obz.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_b_field', rc);
      return { br: s.get(obr), bz: s.get(obz) };
    });
  };

  /**
   * The analytic current over the interior cells.  `mask` is what
   * `plasmaMaskLim` hands back — non-zero means set, and it stays f64 so
   * the two entries share one convention.
   */
  Fy.prototype.analyticCurrent = function (o) {
    var self = this, ncell = (o.nr - 2) * (o.nz - 2);
    return this.scope(function (s) {
      var psi = s.put(o.psi), rof = s.put(o.rOf), m = s.put(o.mask),
          out = s.zeros(ncell);
      var rc = self.e.fylite_rs_analytic_current(
        psi.ptr, BigInt(o.nr), BigInt(o.nz), rof.ptr, o.dr, o.dz, m.ptr,
        o.psiAxis, o.psiBnd, o.jc, o.beta0, o.emp, o.enp, o.r0, out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_analytic_current', rc);
      return s.get(out);
    });
  };

  /**
   * Fit every order up to `maxOrder`, let GCV choose, and hand back the WHOLE
   * sweep — the chosen order is a result, not a setting, and a criterion the
   * reader cannot see is a smoothing knob with better manners.
   *
   * ★This lived in `profit.js` until the file had nothing else in it.  It is
   * a shape for drawing, not arithmetic: the fit, the basis and the GCV are
   * all the kernel's (`profile_fit`, `profile_sample`).
   */
  Fy.prototype.profileFitSweep = function (x, y, sigma, maxOrder) {
    var r = this.profileFit(x, y, sigma, maxOrder), sweep = [];
    for (var n = 0; n <= maxOrder; n++) {
      if (!isFinite(r.gcvSweep[n])) break;
      sweep.push({ order: n, gcv: r.gcvSweep[n] });
    }
    return { best: { coef: r.coef, order: r.order, gcv: r.gcvSweep[r.order],
                     rss: r.rss, chi2PerDof: r.chi2PerDof, N: x.length },
             sweep: sweep };
  };

  /** One point of a fitted profile. */
  Fy.prototype.profileAt = function (coef, x) {
    return this.profileSample(coef, Float64Array.of(x))[0];
  };

  /** A fitted profile on `npts` evenly spaced points of [0, 1]. */
  Fy.prototype.profileCurve = function (coef, npts) {
    var x = new Float64Array(npts);
    for (var i = 0; i < npts; i++) x[i] = i / (npts - 1);
    return this.profileSample(coef, x);
  };

  /** Total psi on the grid from a cloud of current filaments. */
  Fy.prototype.filamentFlux = function (o) {
    var self = this, nf = o.r.length, nr = o.gridR.length,
        nz = o.gridZ.length;
    return this.scope(function (s) {
      var fr = s.put(o.r), fz = s.put(o.z), am = s.put(o.a),
          gr = s.put(o.gridR), gz = s.put(o.gridZ),
          out = s.zeros(nr * nz);
      var rc = self.e.fylite_rs_filament_flux(
        fr.ptr, fz.ptr, am.ptr, BigInt(nf), gr.ptr, BigInt(nr), gz.ptr,
        BigInt(nz), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_filament_flux', rc);
      return s.get(out);
    });
  };

  Fy.prototype.gsFreeSolve = function (o) {
    var self = this, nr = o.r.length, nz = o.z.length, nlim = o.limR.length;
    var total = nr * nz;
    return this.scope(function (s) {
      var r = s.put(o.r), z = s.put(o.z), pe = s.put(o.psiExt),
          lr = s.put(o.limR), lz = s.put(o.limZ),
          //: ★the warm start, and why a design needs one: a boundary
          //: design's coil field cancels the plasma's own flux variation
          //: over the requested boundary, so it has a MINIMUM where the
          //: plasma belongs — and iteration zero, which sees only the
          //: coils, then puts the axis out by the coils instead.
          pi = o.psiInit ? s.put(o.psiInit) : null,
          psi = s.zeros(total), out = s.zeros(12);
      var it = self.e.fylite_rs_gs_free_solve(
        r.ptr, BigInt(nr), z.ptr, BigInt(nz), pe.ptr,
        o.beta0, o.emp, o.enp, o.r0, o.ip, lr.ptr, lz.ptr, BigInt(nlim),
        num(o.signAxis, 1), num(o.relax, 0.3), BigInt(o.maxIter || 400),
        num(o.tol, 1e-8), num(o.fbGain, 0),
        o.zcAnchor === undefined ? NaN : o.zcAnchor,
        o.rcAnchor === undefined ? NaN : o.rcAnchor,
        pi ? pi.ptr : 0, psi.ptr, out.ptr);
      if (it < 0) throw new SolveError('fylite_rs_gs_free_solve', it);
      var v = s.get(out);
      //: ★v108 (T-M16): slot 11 is the KERNEL's verdict — 1 converged
      //: (residual within tol AND mask still), 2 settled (answer frozen,
      //: mask quantisation jitter floors the residual), 0 neither.
      return { psi: s.get(psi), iterations: it, psiAxis: v[0], psiBnd: v[1],
               axisR: v[2], axisZ: v[3], ip: v[4], residual: v[5],
               bndKind: v[6], xptR: v[7], xptZ: v[8], fbAmp: v[9],
               zc: v[10], converged: v[11] === 1, settled: v[11] === 2 };
    });
  };

  /**
   * The free solve on a TABULATED p'/FF' pair used as a shape (T-D6′).
   * The table is normalised to Ip every round, so its gauge — per-radian
   * vs full flux, overall sign, any constant factor — divides out; what
   * survives is the relative radial structure, including a sign reversal
   * (the delivered EAST #137985 profiles cross zero at psi_N ≈ 0.82,
   * which no analytic-family member can represent).
   * opts as gsFreeSolve, minus beta0/emp/enp/r0, plus {tabX, tabPp, tabFfp}.
   */
  Fy.prototype.gsFreeSolveTab = function (o) {
    var self = this, nr = o.r.length, nz = o.z.length, nlim = o.limR.length;
    var total = nr * nz, ntab = o.tabX.length;
    return this.scope(function (s) {
      var r = s.put(o.r), z = s.put(o.z), pe = s.put(o.psiExt),
          xt = s.put(o.tabX), pt = s.put(o.tabPp), ft = s.put(o.tabFfp),
          lr = s.put(o.limR), lz = s.put(o.limZ),
          pi = o.psiInit ? s.put(o.psiInit) : null,
          psi = s.zeros(total), out = s.zeros(14);
      var it = self.e.fylite_rs_gs_free_solve_tab(
        r.ptr, BigInt(nr), z.ptr, BigInt(nz), pe.ptr,
        xt.ptr, pt.ptr, ft.ptr, BigInt(ntab),
        o.ip, lr.ptr, lz.ptr, BigInt(nlim),
        num(o.signAxis, 1), num(o.relax, 0.3), BigInt(o.maxIter || 400),
        num(o.tol, 1e-8), num(o.fbGain, 0),
        o.zcAnchor === undefined ? NaN : o.zcAnchor,
        o.rcAnchor === undefined ? NaN : o.rcAnchor,
        pi ? pi.ptr : 0, psi.ptr, out.ptr);
      if (it < 0) throw new SolveError('fylite_rs_gs_free_solve_tab', it);
      var v = s.get(out);
      return { psi: s.get(psi), iterations: it, psiAxis: v[0], psiBnd: v[1],
               axisR: v[2], axisZ: v[3], ip: v[4], residual: v[5],
               bndKind: v[6], xptR: v[7], xptZ: v[8], fbAmp: v[9],
               zc: v[10], converged: v[11] === 1, settled: v[11] === 2,
               maskDelta: v[12], jc: v[13] };
    });
  };

  /**
   * Post-hoc physical boundary flux (bottleneck-connectivity rule).
   * opts: {r, z, psi, limR, limZ, signAxis=1}
   */
  Fy.prototype.boundaryFlux = function (o) {
    var self = this, nr = o.r.length, nz = o.z.length, nlim = o.limR.length;
    return this.scope(function (s) {
      var r = s.put(o.r), z = s.put(o.z), p = s.put(o.psi),
          lr = s.put(o.limR), lz = s.put(o.limZ), out = s.zeros(1);
      var rc = self.e.fylite_rs_boundary_flux(
        r.ptr, BigInt(nr), z.ptr, BigInt(nz), p.ptr, lr.ptr, lz.ptr,
        BigInt(nlim), num(o.signAxis, 1), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_boundary_flux', rc);
      return s.get(out)[0];
    });
  };

  // --- L4 reconstruction -------------------------------------------------

  /**
   * Equilibrium reconstruction: fit npp + nff polynomial p'/FF'
   * coefficients to flux-loop measurements (and optional pressure rows)
   * under the Ip equality constraint.
   *
   * opts: {r, z, psiExt, loopsM, meas, wts, measScale=1, npp, nff, ip,
   *        limR, limZ, xp=[], pmeas=[], wp=[], relax=0.3, maxIter=400,
   *        tol=1e-8, fbGain=0, zcAnchor=NaN, rcAnchor=NaN, warmup=60}
   *
   * `loopsM` is row-major (nloops, nr*nz): the full-flux response [Wb/A]
   * of each loop to a unit toroidal current at each grid node.
   */
  Fy.prototype.gsInverseSolve = function (o) {
    var self = this, nr = o.r.length, nz = o.z.length, nlim = o.limR.length;
    var total = nr * nz, nl = o.meas.length, np_ = (o.xp || []).length;
    var nc = o.npp + o.nff;
    return this.scope(function (s) {
      var r = s.put(o.r), z = s.put(o.z), pe = s.put(o.psiExt),
          lm = s.put(o.loopsM), me = s.put(o.meas), wt = s.put(o.wts),
          lr = s.put(o.limR), lz = s.put(o.limZ),
          xp = s.put(np_ ? o.xp : [0]), pm = s.put(np_ ? o.pmeas : [0]),
          wp = s.put(np_ ? o.wp : [0]),
          //: ABI v17 added a PRESCRIBED per-cell current channel; T-A9 is
          //: the first caller on this page to use it — the bootstrap
          //: current is KNOWN physics and the magnetics should not have to
          //: re-fit it.  With no `jPre` the kernel still reads one element,
          //: so it gets a real buffer and a zero length — not a null.
          njp = (o.jPre && o.jPre.length) ? o.jPre.length : 0,
          jpre = s.put(njp ? o.jPre : [0]),
          psi = s.zeros(total), cf = s.zeros(nc), out = s.zeros(12);
      var it = self.e.fylite_rs_gs_inverse_solve(
        r.ptr, BigInt(nr), z.ptr, BigInt(nz), pe.ptr,
        lm.ptr, me.ptr, wt.ptr, BigInt(nl), num(o.measScale, 1),
        BigInt(o.npp), BigInt(o.nff), o.ip,
        lr.ptr, lz.ptr, BigInt(nlim),
        xp.ptr, pm.ptr, wp.ptr, BigInt(np_),
        jpre.ptr, BigInt(njp),
        num(o.relax, 0.3), BigInt(o.maxIter || 400), num(o.tol, 1e-8),
        num(o.fbGain, 0),
        o.zcAnchor === undefined ? NaN : o.zcAnchor,
        o.rcAnchor === undefined ? NaN : o.rcAnchor,
        BigInt(o.warmup === undefined ? 60 : o.warmup),
        psi.ptr, cf.ptr, out.ptr);
      if (it < 0) throw new SolveError('fylite_rs_gs_inverse_solve', it);
      var v = s.get(out);
      return { psi: s.get(psi), coefs: s.get(cf), iterations: it,
               psiAxis: v[0], psiBnd: v[1], axisR: v[2], axisZ: v[3],
               ip: v[4], residual: v[5], bndKind: v[6], fbAmp: v[7] };
    });
  };

  // --- T-A5: the same solve with the coil currents FITTED ----------------
  //
  // ★★WHY THIS IS A SECOND METHOD AND NOT A FLAG ON THE ONE ABOVE.  The two
  // reach two different ABI entries — `fylite_rs_gs_inverse_solve` is
  // untouched and still returns exactly the numbers it always did — and the
  // difference between them is not a setting, it is which quantities are
  // unknown.  A caller that does not think about the coil sigma should get
  // the old solve, by name.
  //
  // opts: the whole of `gsInverseSolve`'s, plus
  //   coilPsi   (nch, nr*nz) full flux [Wb] per unit channel current
  //   coilRows  (nrows, nch) what each measurement row reads per unit
  //             channel current, IN THAT ROW'S OWN UNITS (no measScale)
  //   coilI0    (nch) the channel currents the caller believes
  //   coilSigma (nch) prior widths; <= 0 holds that channel exactly
  //   measSigma what a measurement weight of 1.0 stands for, in the rows'
  //             own units.  Decks here ship 0/1 loop MASKS, so passing 1.0
  //             asserts sigma_loop = 1 Wb/rad and the coils will not move.
  Fy.prototype.gsInverseSolveCoils = function (o) {
    var self = this, nr = o.r.length, nz = o.z.length, nlim = o.limR.length;
    var total = nr * nz, nl = o.meas.length, np_ = (o.xp || []).length;
    var nc = o.npp + o.nff, nch = (o.coilI0 || []).length;
    return this.scope(function (s) {
      var r = s.put(o.r), z = s.put(o.z), pe = s.put(o.psiExt),
          lm = s.put(o.loopsM), me = s.put(o.meas), wt = s.put(o.wts),
          lr = s.put(o.limR), lz = s.put(o.limZ),
          xp = s.put(np_ ? o.xp : [0]), pm = s.put(np_ ? o.pmeas : [0]),
          wp = s.put(np_ ? o.wp : [0]),
          //: T-A9: the same prescribed-current channel as above
          njp = (o.jPre && o.jPre.length) ? o.jPre.length : 0,
          jpre = s.put(njp ? o.jPre : [0]),
          //: ★a real buffer and a zero count, never a null — the same
          //: calling convention the pressure block uses on this entry
          cps = s.put(nch ? o.coilPsi : [0]),
          crw = s.put(nch ? o.coilRows : [0]),
          ci0 = s.put(nch ? o.coilI0 : [0]),
          csg = s.put(nch ? o.coilSigma : [0]),
          cot = s.zeros(nch || 1),
          psi = s.zeros(total), cf = s.zeros(nc), out = s.zeros(12);
      var it = self.e.fylite_rs_gs_inverse_solve_coils(
        r.ptr, BigInt(nr), z.ptr, BigInt(nz), pe.ptr,
        lm.ptr, me.ptr, wt.ptr, BigInt(nl), num(o.measScale, 1),
        BigInt(o.npp), BigInt(o.nff), o.ip,
        lr.ptr, lz.ptr, BigInt(nlim),
        xp.ptr, pm.ptr, wp.ptr, BigInt(np_),
        jpre.ptr, BigInt(njp),
        cps.ptr, crw.ptr, ci0.ptr, csg.ptr, BigInt(nch),
        num(o.measSigma, 1),
        num(o.relax, 0.3), BigInt(o.maxIter || 400), num(o.tol, 1e-8),
        num(o.fbGain, 0),
        o.zcAnchor === undefined ? NaN : o.zcAnchor,
        o.rcAnchor === undefined ? NaN : o.rcAnchor,
        BigInt(o.warmup === undefined ? 60 : o.warmup),
        psi.ptr, cf.ptr, cot.ptr, out.ptr);
      if (it < 0)
        throw new SolveError('fylite_rs_gs_inverse_solve_coils', it);
      var v = s.get(out), fit = s.get(cot);
      return { psi: s.get(psi), coefs: s.get(cf), iterations: it,
               psiAxis: v[0], psiBnd: v[1], axisR: v[2], axisZ: v[3],
               ip: v[4], residual: v[5], bndKind: v[6], fbAmp: v[7],
               coilPull: v[8], coilFitted: v[9],
               coilFit: nch ? fit.slice(0, nch) : new Float64Array(0) };
    });
  };

  // --- L5 circuits --------------------------------------------------------

  /**
   * Implicit-Euler circuit trajectory.  `m` is n*n row-major [H], `res`
   * the n resistances [Ohm], `t` the nt time points, `volts` (nt, n)
   * row-major [V], `i0` the n initial currents [A].  Returns the whole
   * (nt, n) trajectory.
   */
  Fy.prototype.evolveCircuits = function (m, res, t, volts, i0) {
    var self = this, n = res.length, nt = t.length;
    return this.scope(function (s) {
      var pm = s.put(m), pr = s.put(res), pt = s.put(t), pv = s.put(volts),
          pi = s.put(i0), po = s.zeros(nt * n);
      var rc = self.e.fylite_rs_evolve_circuits(
        pm.ptr, pr.ptr, BigInt(n), pt.ptr, BigInt(nt), pv.ptr, pi.ptr,
        po.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_evolve_circuits', rc);
      return s.get(po);
    });
  };

  // --- L5/L6: the core march and the closure it asks for -------------------
  //
  // ★★What these entries buy the browser, and why they were missing.  Until
  // now the front end reached ONE transport symbol — `transport_step`, a
  // single channel on a metric the caller made up — while the kernel has
  // carried the whole core march (T_e/T_i with their exchange, the density,
  // the poloidal flux), the ladder of metrics an equilibrium determines, and
  // every source term that makes the march an ENERGY BALANCE rather than a
  // temperature-shaped diffusion.  The page could therefore only ever show a
  // demo tier, and said so.  Nothing below is new physics: it is the wire.

  /**
   * One equilibrium's whole ladder — the transport metric AND the local
   * Miller shape, from ONE traced surface set.
   *
   * ★This is what makes「1.5D」 true rather than nominal: rho_tor [m], V'
   * [m^2], <|grad rho|^2>, gm2, q and F come from the field that was solved,
   * not from four scalars fitted to its boundary.  The two used to be
   * separate traces at different default levels; the kernel merged them, and
   * this wrapper hands both back off the one call.
   */
  Fy.prototype.equilibriumLadder = function (o) {
    var self = this, nlev = o.levels.length, nlim = o.limR.length;
    return this.scope(function (s) {
      var psin = s.put(o.psin), lr = s.put(o.limR), lz = s.put(o.limZ),
          lv = s.put(o.levels),
          qt = s.put(o.qTable || [0]), ft = s.put(o.fTable || [0]),
          om = s.zeros(10 * nlev), ok = s.zeros(14 * nlev),
          o2 = s.zeros(nlev);
      //: ★`_r2`: the same one traced surface set, with `<R^2>` [m^2] in its
      //: own buffer (T-M8).  It has to come off THIS call rather than a
      //: second pass — the ladder's whole point is that the metric and the
      //: shape describe the same surfaces, and a separate trace would bring
      //: its own acceptance test and its own idea of which levels exist.
      var kept = self.e.fylite_rs_equilibrium_ladder_r2(
        o.r0, o.z0, o.dr, o.dz, BigInt(o.nr), BigInt(o.nz), psin.ptr,
        o.axisR, o.axisZ, lr.ptr, lz.ptr, BigInt(nlim), lv.ptr, BigInt(nlev),
        qt.ptr, BigInt((o.qTable || [0]).length),
        ft.ptr, BigInt((o.fTable || [0]).length),
        o.dpsi, o.b0, o.aMinor, BigInt(o.nTheta || 121), om.ptr, ok.ptr,
        o2.ptr);
      if (kept < 0)
        throw new SolveError('fylite_rs_equilibrium_ladder_r2', kept);
      var m = s.get(om), k = s.get(ok), r2 = s.get(o2);
      var col = function (src, w, j) {
        var out = new Float64Array(kept);
        for (var i = 0; i < kept; i++) out[i] = src[w * i + j];
        return out;
      };
      return {
        kept: kept,
        psin: col(m, 10, 0), rho: col(m, 10, 1), volume: col(m, 10, 2),
        vprime: col(m, 10, 3), gm3: col(m, 10, 4), gm7: col(m, 10, 5),
        gm2: col(m, 10, 6), q: col(m, 10, 7), fpol: col(m, 10, 8),
        dvDpsin: col(m, 10, 9),
        //: `<R^2>` [m^2], one per kept level — the momentum capacity's
        //: weight, and the one column here that carries no `drho` factor
        fsaR2: r2.slice(0, kept),
        //: the Miller row, the same surfaces, in the order the neoclassical
        //: surface block wants them
        miller: {
          psin: col(k, 14, 0), rmin: col(k, 14, 1), rmaj: col(k, 14, 2),
          zmag: col(k, 14, 3), q: col(k, 14, 4), shear: col(k, 14, 5),
          shift: col(k, 14, 6), kappa: col(k, 14, 7), sKappa: col(k, 14, 8),
          delta: col(k, 14, 9), sDelta: col(k, 14, 10), zeta: col(k, 14, 11),
          sZeta: col(k, 14, 12), sZmag: col(k, 14, 13),
        },
      };
    });
  };

  /**
   * Collision rates over a profile: `nu_e`, `nu_i` per ion, the classical
   * exchange rate and the Coulomb logarithm they are built on.
   *
   * CGS with eV temperatures — `ne`/`ni` in cm^-3 — because that is what the
   * entry means, and converting on this side once beats every caller
   * carrying its own factor.  `ni`/`ti` are ion-major (`nion * n`).
   */
  Fy.prototype.collisionRates = function (o) {
    var self = this, n = o.te.length, ni_ = o.z.length;
    return this.scope(function (s) {
      var ne = s.put(o.neCgs), te = s.put(o.te),
          ni = s.fixed('coll.ni', o.niCgs, ni_ * n),
          ti = s.fixed('coll.ti', o.ti, ni_ * n),
          ms = s.fixed('coll.mass', o.mass, ni_),
          z = s.fixed('coll.z', o.z, ni_),
          th = s.fixed('coll.therm', o.therm ||
                       (function () { var a = []; for (var i = 0; i < ni_; i++) a.push(1); return a; })(), ni_),
          onue = s.zeros(n), onui = s.zeros(ni_ * n),
          oex = s.zeros(n), olog = s.zeros(n);
      var rc = self.e.fylite_rs_collision_rates(
        ne.ptr, te.ptr, BigInt(n), ni.ptr, ti.ptr, ms.ptr, z.ptr, th.ptr,
        BigInt(ni_), onue.ptr, onui.ptr, oex.ptr, olog.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_collision_rates', rc);
      return { nue: s.get(onue), nui: s.get(onui),
               exch: s.get(oex), loglam: s.get(olog) };
    });
  };

  /**
   * Classical electron-ion exchange power [erg/cm^3/s], positive INTO THE
   * IONS.  CGS in, CGS out: the SI conversion is one factor and it belongs
   * with the assembly that also converts the density going in.
   */
  Fy.prototype.exchangePower = function (nuExch, neCgs, te, ti) {
    var self = this, n = neCgs.length;
    return this.scope(function (s) {
      var a = s.put(nuExch), b = s.put(neCgs), c = s.put(te), d = s.put(ti),
          out = s.zeros(n);
      var rc = self.e.fylite_rs_exchange_power(
        a.ptr, b.ptr, c.ptr, d.ptr, BigInt(n), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_exchange_power', rc);
      return s.get(out);
    });
  };

  /**
   * Parallel Spitzer resistivity [Ohm m]; `te` in eV, arrays throughout.
   * ★Corrected at v111 (T-A18): now the parallel branch `0.51 eta_perp` —
   * through v110 the entry carried the NRL PERPENDICULAR coefficient and
   * the ohmic power was high by 1/0.51.
   */
  Fy.prototype.spitzerEta = function (te, zeff, lnlam) {
    var self = this, n = te.length;
    return this.scope(function (s) {
      var a = s.put(te), b = s.fixed('eta.zeff', zeff, n),
          c = s.fixed('eta.lnlam', lnlam, n), out = s.zeros(n);
      var rc = self.e.fylite_rs_spitzer_eta(
        a.ptr, b.ptr, c.ptr, BigInt(n), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_spitzer_eta', rc);
      return s.get(out);
    });
  };

  /**
   * PERPENDICULAR Spitzer resistivity — the NRL coefficient as printed,
   * the value `spitzerEta` returned through v110 (T-A18).  Exported so the
   * correction is a checkable relation (ratio == 0.51), not a renumbering.
   */
  Fy.prototype.spitzerEtaPerp = function (te, zeff, lnlam) {
    var self = this, n = te.length;
    return this.scope(function (s) {
      var a = s.put(te), b = s.fixed('eta.zeff', zeff, n),
          c = s.fixed('eta.lnlam', lnlam, n), out = s.zeros(n);
      var rc = self.e.fylite_rs_spitzer_eta_perp(
        a.ptr, b.ptr, c.ptr, BigInt(n), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_spitzer_eta_perp', rc);
      return s.get(out);
    });
  };

  /** Ohmic heating `eta j^2` [W/m^3]; `jPar` [A/m^2], `eta` [Ohm m]. */
  Fy.prototype.ohmicPower = function (eta, jPar) {
    var self = this, n = eta.length;
    return this.scope(function (s) {
      var a = s.put(eta), b = s.put(jPar), out = s.zeros(n);
      var rc = self.e.fylite_rs_ohmic_power(a.ptr, b.ptr, BigInt(n), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_ohmic_power', rc);
      return s.get(out);
    });
  };

  /**
   * D-T alpha heating and its electron / ion split [W/m^3].
   *
   * `ne` in m^-3 and `te` in eV — SI, as the entry takes them — while `ti`
   * crosses in keV, which is the entry's own spelling and not this
   * wrapper's choice.
   */
  Fy.prototype.alphaHeating = function (o) {
    var self = this, n = o.ne.length;
    return this.scope(function (s) {
      var ne = s.put(o.ne), te = s.put(o.teEv), ti = s.put(o.tiKev),
          out = s.zeros(4 * n);
      var rc = self.e.fylite_rs_alpha_heating(
        ne.ptr, te.ptr, ti.ptr, BigInt(n), num(o.dtFraction, 0.5),
        num(o.zeff, 1), num(o.zsum, 0.5), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_alpha_heating', rc);
      var v = s.get(out);
      return { total: v.slice(0, n), e: v.slice(n, 2 * n),
               i: v.slice(2 * n, 3 * n), eCrit: v.slice(3 * n, 4 * n) };
    });
  };

  /**
   * The main-ion density a given `Z_eff` implies, with one impurity —
   * `n_i = (Z_imp - Z_eff)/(Z_imp - 1) * n_e`.
   *
   * ★★It REFUSES rather than floors: a `Z_eff` that this impurity cannot
   * produce (above `Z_imp`, or below 1) has no main-ion density, and the
   * kernel answers -2 rather than clamping to something that would read as
   * a composition.  `null` comes back here for the same reason.
   */
  Fy.prototype.ionDilution = function (ne, zeff, zImp) {
    var self = this, n = ne.length;
    return this.scope(function (s) {
      var a = s.put(ne), out = s.zeros(n);
      var rc = self.e.fylite_rs_ion_dilution(
        a.ptr, BigInt(n), num(zeff, 1), num(zImp, 6), out.ptr);
      if (rc === -2) return null;
      if (rc !== 0) throw new SolveError('fylite_rs_ion_dilution', rc);
      return s.get(out);
    });
  };

  /**
   * The electron density quasi-neutrality gives: `n_e = sum_s Z_s n_s`.
   *
   * `ions` is `[{n, z}]`.  ★This is the closure the core march applies to
   * its own ion list, exposed so a caller can CHECK the composition it is
   * about to hand over rather than assume it.
   */
  Fy.prototype.quasiNeutralNe = function (ions) {
    var self = this, ns = ions.length, n = ions[0].n.length;
    var flat = new Float64Array(ns * n), zs = new Float64Array(ns);
    for (var j = 0; j < ns; j++) { flat.set(ions[j].n, j * n); zs[j] = +ions[j].z; }
    return this.scope(function (s) {
      var z = s.fixed('quasi.z', zs, ns),
          ni = s.fixed('quasi.ni', flat, ns * n), out = s.zeros(n);
      var rc = self.e.fylite_rs_quasi_neutral_ne(
        z.ptr, ni.ptr, BigInt(ns), BigInt(n), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_quasi_neutral_ne', rc);
      return s.get(out);
    });
  };

  /**
   * The field-ion sum `sum n_j Z_j^2/(n_e A_j)` at a given `Z_eff` — the
   * `zsum` that sets an alpha's critical energy.
   *
   * ★The page used to write this out for a 50:50 D-T mix, which is right
   * only for a plasma with nothing else in it.  With an impurity in the
   * quasi-neutrality it is not, and the kernel already knew how to say so.
   */
  Fy.prototype.fieldIonSum = function (o) {
    var self = this, n = o.zeff.length;
    return this.scope(function (s) {
      var z = s.put(o.zeff), out = s.zeros(n);
      var rc = self.e.fylite_rs_field_ion_sum(
        z.ptr, BigInt(n), num(o.mainMass, 2), num(o.mainCharge, 1),
        num(o.impCharge, 6), num(o.impMass, 12), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_field_ion_sum', rc);
      return s.get(out);
    });
  };

  /**
   * The discharge's shape in time — one trapezoid over the four phase
   * times `[t_breakdown, t_rampup_end, t_flattop_end, t_end]`.
   *
   * `o` = `{phases, t, flat, start, end, which}`; `which` defaults to 0
   * (the raw trapezoid).  ★It is the KERNEL's trapezoid rather than four
   * lines of JavaScript, and the entry's own comment says why: both hosts
   * had their own copy of this shape and of the phase test.
   */
  Fy.prototype.zerodWaveform = function (o) {
    var self = this, n = o.t.length;
    return this.scope(function (s) {
      var ph = s.fixed('waveform.phases', o.phases, 4),
          t = s.put(o.t), out = s.zeros(n);
      var rc = self.e.fylite_rs_zerod_waveform(
        ph.ptr, t.ptr, BigInt(n), (o.which || 0) >>> 0,
        num(o.flat, 1), num(o.start, 0), num(o.end, 0), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_zerod_waveform', rc);
      return s.get(out);
    });
  };

  /**
   * INTERPRETIVE inversion of one channel's power balance: measured
   * profiles and source densities in, experimental heat flux and effective
   * diffusivity out.
   *
   * `o` = `{rho, vprime, gm7, gm3, density, temperature, source, gradFloor}`.
   *
   * ★★This is the OTHER DIRECTION from every other transport entry in this
   * file, and it is the one a predictive study needs FIRST: a constant chi
   * is not a number anybody knows, and the way it is found is by asking
   * measured profiles what diffusivity their own power balance implies.
   *
   * ★`valid` is an ANSWER, not a status: below a gradient floor the
   * inversion is dividing by noise, and the kernel returns NaN there rather
   * than the large number that would read as a transport measurement.  A
   * caller that filled those in would be reporting the flattest part of the
   * profile as its most anomalous.
   */
  Fy.prototype.interpretiveChannel = function (o) {
    var self = this, n = o.rho.length;
    return this.scope(function (s) {
      var r = s.put(o.rho), vp = s.fixed('interp.vprime', o.vprime, n),
          g7 = s.fixed('interp.gm7', o.gm7, n),
          g3 = s.fixed('interp.gm3', o.gm3, n),
          d = s.fixed('interp.density', o.density, n),
          t = s.fixed('interp.temperature', o.temperature, n),
          q = s.fixed('interp.source', o.source, n),
          oq = s.zeros(n), op = s.zeros(n), oc = s.zeros(n), ov = s.zeros(n);
      var rc = self.e.fylite_rs_interpretive_channel(
        r.ptr, vp.ptr, g7.ptr, g3.ptr, d.ptr, t.ptr, q.ptr, BigInt(n),
        num(o.gradFloor, 1e-3), oq.ptr, op.ptr, oc.ptr, ov.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_interpretive_channel', rc);
      return { qPb: s.get(oq), power: s.get(op), chi: s.get(oc),
               valid: s.get(ov) };
    });
  };

  /**
   * The ADAS species the shipped table carries, in the kernel's own order.
   *
   * ★A page that offers a species menu must not hard-code the menu: the
   * table lives in the kernel, an unknown name radiates ZERO rather than
   * complaining, and a menu that drifted from the table would silently offer
   * a species whose line radiation is always zero.  So the list is ASKED
   * for, every load.
   */
  Fy.prototype.adasSpecies = function () {
    var self = this;
    var n = this.e.fylite_rs_adas_species_count();
    if (n < 0) throw new SolveError('fylite_rs_adas_species_count', n);
    return this.scope(function (s) {
      var cap = 16, buf = s.zeros(2), out = [];
      for (var i = 0; i < n; i++) {
        var got = self.e.fylite_rs_adas_species_name(
          BigInt(i), buf.ptr, BigInt(cap));
        if (got < 0) throw new SolveError('fylite_rs_adas_species_name', got);
        //: the view is taken AFTER the allocation, inside the loop: a wasm
        //: memory that grew would have detached an earlier one
        var b = new Uint8Array(self.e.memory.buffer, buf.ptr, got), str = '';
        for (var k = 0; k < got; k++) str += String.fromCharCode(b[k]);
        out.push(str);
      }
      return out;
    });
  };

  /**
   * The kernel's index for a species name, or -1 for one it does not carry.
   *
   * ★-1 is an ANSWER and callers must check it: downstream an unknown id
   * means no line radiation at all, so a typo would come back as a clean
   * plasma rather than as an error.
   */
  Fy.prototype.adasId = function (name) {
    var self = this, str = String(name || '');
    return this.scope(function (s) {
      var len = str.length;
      var buf = s.zeros(Math.max(1, Math.ceil(len / 8)));
      var b = new Uint8Array(self.e.memory.buffer, buf.ptr, Math.max(1, len));
      for (var k = 0; k < len; k++) b[k] = str.charCodeAt(k) & 0x7f;
      return self.e.fylite_rs_adas_id(buf.ptr, BigInt(len));
    });
  };

  /**
   * The ADAS cooling rate `Lz` [erg cm^3/s] of one species over a
   * temperature profile.  `teKev` in keV, a negative `id` gives zeros.
   */
  Fy.prototype.adasCooling = function (id, teKev) {
    var self = this, n = teKev.length;
    return this.scope(function (s) {
      var t = s.put(teKev), out = s.zeros(n);
      var rc = self.e.fylite_rs_adas_cooling(id | 0, t.ptr, BigInt(n), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_adas_cooling', rc);
      return s.get(out);
    });
  };

  /**
   * Bremsstrahlung, line radiation and their sum [erg/cm^3/s].
   *
   * `o` = `{te (eV), ne (cm^-3), ions: [{n: cm^-3 per point, z, id}]}` where
   * `id` is an `adasId()` result: negative means the ion contributes to the
   * bremsstrahlung and nothing to the line radiation.
   *
   * ★★The brem/line SPLIT is not physical — only the sum is the ADAS
   * value — and the kernel says so at its own entry.  Both columns come
   * back because a page that shows them separately is showing a
   * DECOMPOSITION of one number, which is what the caveat has to say.
   */
  Fy.prototype.radIon = function (o) {
    var self = this, n = o.te.length, ions = o.ions || [], ni_ = ions.length;
    if (!ni_) throw new Error('FyLite.radIon: no ion species given');
    var flat = new Float64Array(ni_ * n), zs = new Float64Array(ni_);
    for (var j = 0; j < ni_; j++) {
      var d = ions[j].n;
      if (!d || d.length !== n)
        throw new Error('FyLite.radIon: ion ' + j + ' must hold ' + n +
                        ' densities, got ' + (d ? d.length : 'none'));
      flat.set(d, j * n);
      zs[j] = +ions[j].z;
    }
    return this.scope(function (s) {
      var a = s.put(o.te), b = s.put(o.ne),
          c = s.fixed('rad.ni', flat, ni_ * n),
          d2 = s.fixed('rad.z', zs, ni_),
          //: the ids are i32; one f64 slot holds two of them, and the view
          //: is taken after the last allocation so it cannot be detached
          ids = s.zeros(ni_),
          ob = s.zeros(n), ol = s.zeros(n), ot = s.zeros(n);
      var iv = new Int32Array(self.e.memory.buffer, ids.ptr, ni_);
      for (var k = 0; k < ni_; k++) {
        var id = ions[k].id;
        iv[k] = (id === undefined || id === null) ? -1 : (id | 0);
      }
      var rc = self.e.fylite_rs_rad_ion(
        a.ptr, b.ptr, BigInt(n), c.ptr, d2.ptr, ids.ptr, BigInt(ni_),
        ob.ptr, ol.ptr, ot.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_rad_ion', rc);
      return { brem: s.get(ob), line: s.get(ol), total: s.get(ot) };
    });
  };

  /**
   * Bremsstrahlung [erg/cm^3/s] — `radIon` with no ADAS species named.
   *
   * ★What comes back is the BREMSSTRAHLUNG column, not the total:
   * `total` is the ADAS cooling curve's answer and it is ZERO when no
   * species is named, which is exactly this call.  Naming a species is
   * `radIon`'s job, and the page that does it says which one.
   */
  Fy.prototype.bremPower = function (te, neCgs, niCgs, z) {
    var n = te.length, ions = [];
    for (var j = 0; j < z.length; j++)
      ions.push({ n: niCgs.subarray ? niCgs.subarray(j * n, (j + 1) * n)
                                    : niCgs.slice(j * n, (j + 1) * n),
                  z: z[j], id: -1 });
    return this.radIon({ te: te, ne: neCgs, ions: ions }).brem;
  };

  /**
   * The innermost radius where `q = q_crit`, or null when there is none.
   *
   * ★Null is an ANSWER: a discharge that is not sawtoothing has no q = 1
   * surface, and the entry says so with its own code rather than with a
   * radius off the end of the grid.
   */
  Fy.prototype.qCrossing = function (rho, q, qCrit) {
    var self = this, n = rho.length;
    return this.scope(function (s) {
      var r = s.put(rho), qq = s.put(q), out = s.zeros(1);
      var rc = self.e.fylite_rs_q_crossing(
        r.ptr, qq.ptr, BigInt(n), num(qCrit, 1), out.ptr);
      if (rc === -5) return null;
      if (rc !== 0) throw new SolveError('fylite_rs_q_crossing', rc);
      return s.get(out)[0];
    });
  };

  /**
   * One sawtooth crash: the profiles flattened inside `rMix` conserving
   * `integral V' y drho`, and `psi` rebuilt there from `q = 1`.
   *
   * ★`rMix` has NO default here, and the kernel says why: reduced models
   * take it as `k r_1` with `k` between 1 and about 1.4 depending on whose
   * paper is followed, so a default would be a physics choice made silently
   * on every crash.  `profiles` is a list of arrays, mixed together and
   * returned in the same order.
   */
  Fy.prototype.sawtoothCrash = function (o) {
    var self = this, n = o.rho.length, np_ = o.profiles.length;
    return this.scope(function (s) {
      var flat = new Float64Array(np_ * n);
      for (var j = 0; j < np_; j++) {
        if (o.profiles[j].length !== n)
          throw new Error('FyLite.sawtoothCrash: profile ' + j + ' has ' +
                          o.profiles[j].length + ' points, expected ' + n);
        flat.set(o.profiles[j], j * n);
      }
      var rho = s.put(o.rho), vp = s.put(o.vprime), psi = s.put(o.psi),
          pr = s.put(flat), out = s.zeros(np_ * n + 2 * n + 2);
      var rc = self.e.fylite_rs_sawtooth_crash(
        rho.ptr, vp.ptr, psi.ptr, pr.ptr, BigInt(n), BigInt(np_),
        o.b0, o.rMix, out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_sawtooth_crash', rc);
      var v = s.get(out), mixed = [];
      for (var k = 0; k < np_; k++) mixed.push(v.slice(k * n, (k + 1) * n));
      return { profiles: mixed,
               psi: v.slice(np_ * n, np_ * n + n),
               q: v.slice(np_ * n + n, np_ * n + 2 * n),
               psiMoved: v[np_ * n + 2 * n],
               iMix: v[np_ * n + 2 * n + 1] | 0 };
    });
  };

  /**
   * The core march: every switched-on channel advanced together, as the
   * resumable machine the kernel exposes.
   *
   * `evaluate(state)` is called at each state the march reports and must
   * hand back the closure there — `{chiE, chiI, sExchange, dN, vN,
   * sigmaPar, jNi}`.  ★That protocol is the kernel's and not a convenience:
   * a closure cannot cross the ABI, so the march STOPS and asks rather than
   * calling back into the host.
   *
   * Units, all the kernel's: `rho` [m] (or any monotone label whose `vprime`
   * = dV/drho [m^2] and `gm3` = <|grad rho|^2> are metrics of the SAME
   * label), T in eV, densities m^-3, `qE`/`qI` [W/m^3], `sN` [m^-3 s^-1],
   * psi [Wb/rad].
   */
  /**
   * The derived half of `input.tglf` for one surface — the kernel's
   * `mapping::tglf_local`.
   *
   * ★★Bound for ONE number, and the reason is that the number is a
   * normalisation rather than a formula: `VEXB_SHEAR` is
   * `-sign_It * (-R w0') * r/(|q| R) * a/c_s`, four conventions deep (which
   * sign, which radius the derivative is against, which length it is
   * normalised by, and which sound speed).  A host that spells that out
   * again is a host that gets one of the four wrong; the kernel already has
   * it, together with the `c_s` its own `derived` block defines, so this
   * asks it.
   *
   * `o` = `{surf20, signb, signq, w0, w0p, iz, imass, ini, iti, idlnn,
   * idlnt, betaeScale, nuScale, rotation}`.  `w0` is [rad/s] and `w0p`
   * [rad/(s m)] against the surface's minor radius in metres.
   */
  Fy.prototype.tglfLocal = function (o) {
    var self = this, nion = o.iz.length, ns = nion + 1;
    return this.scope(function (s) {
      var g = s.fixed('tglfLocal.surf20', o.surf20, 20),
          iz = s.put(o.iz), im = s.fixed('tglfLocal.imass', o.imass, nion),
          ini = s.fixed('tglfLocal.ini', o.ini, nion),
          iti = s.fixed('tglfLocal.iti', o.iti, nion),
          idn = s.fixed('tglfLocal.idlnn', o.idlnn, nion),
          idt = s.fixed('tglfLocal.idlnt', o.idlnt, nion),
          out = s.zeros(27), osp = s.zeros(6 * ns);
      var rc = self.e.fylite_rs_tglf_local(
        g.ptr, o.signb, o.signq, num(o.w0, 0), num(o.w0p, 0),
        iz.ptr, im.ptr, ini.ptr, iti.ptr, idn.ptr, idt.ptr, BigInt(nion),
        num(o.betaeScale, 1), num(o.nuScale, 1), o.rotation ? 1 : 0,
        out.ptr, osp.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_tglf_local', rc);
      var v = s.get(out);
      return { signBt: v[0], signIt: v[1], debye: v[2], betae: v[3],
               xnue: v[4], qAbs: v[5], qPrime: v[6], pPrime: v[7],
               alphaSa: v[8], vexbShear: v[9], vparShear: v[10],
               vpar: v[11], geometry: v.slice(12, 27) };
    });
  };

  /**
   * The TOROIDAL MOMENTUM channel, one march — the kernel's
   * `transport::solve_momentum`.
   *
   * `o` = `{rho, omega, vprime, gm3, r2, dens, mass, chiPhi, torque, dt,
   * edge, maxOuter, tolSteady, dPc, tol, maxInner}`.  Everything is SI:
   * omega is [rad/s] and `torque` a torque DENSITY [J/m^3], which is the
   * one place this differs from the heat channels beyond the 3/2.
   *
   * ★It is a separate entry rather than a fourth channel of `coreMarch`
   * because that is how the kernel has it: `core_march` carries heat,
   * density and current, and the momentum channel stands beside them.  A
   * caller marching all four therefore operator-SPLITS, and must say so.
   *
   * ★★`chiPhi` is PRESCRIBED, and no closure in this package can produce
   * one: a momentum diffusivity is a TGLF output and the port does not
   * carry upstream's toroidal-stress weights (`assembly.solve_momentum`
   * says so, and `closure.momentum_chi_phi` refuses rather than returning
   * a zero).  The caller's own number — measured, scaled off chi_i, or from
   * another code — is the supported path.
   */
  Fy.prototype.solveMomentum = function (o) {
    var self = this, n = o.rho.length;
    return this.scope(function (s) {
      var rho = s.put(o.rho), w0 = s.fixed('momentum.omega', o.omega, n),
          vp = s.fixed('momentum.vprime', o.vprime, n),
          g3 = s.fixed('momentum.gm3', o.gm3, n),
          r2 = s.fixed('momentum.r2', o.r2, n),
          dn = s.fixed('momentum.dens', o.dens, n),
          cp = s.fixed('momentum.chiPhi', o.chiPhi, n),
          tq = s.fixed('momentum.torque', o.torque, n),
          out = s.zeros(n + 3);
      var rc = self.e.fylite_rs_solve_momentum(
        rho.ptr, w0.ptr, vp.ptr, g3.ptr, r2.ptr, dn.ptr, cp.ptr, tq.ptr,
        BigInt(n), o.mass, o.dt, o.edge, BigInt(o.maxOuter || 1),
        num(o.tolSteady, 1e-9), num(o.dPc, 0), num(o.tol, 1e-10),
        BigInt(o.maxInner || 60), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_solve_momentum', rc);
      var v = s.get(out);
      return { omega: v.slice(0, n), outerSteps: v[n] | 0,
               steady: v[n + 1] === 1, delta: v[n + 2] };
    });
  };

  Fy.prototype.coreMarch = function (o, evaluate, onStep) {
    var self = this, n = o.rho.length, ni_ = o.z.length;
    var nstate = Number(self.e.fylite_rs_core_march_state_len(
      BigInt(n), BigInt(ni_)));
    return this.scope(function (s) {
      var rho = s.put(o.rho), te = s.put(o.te), ti = s.put(o.ti),
          ni = s.fixed('march.ni', o.ni, ni_ * n),
          z = s.fixed('march.z', o.z, ni_),
          eni = s.fixed('march.edgeNi', o.edgeNi, ni_),
          psi = s.put(o.psi), vp = s.put(o.vprime), gm3 = s.put(o.gm3),
          gm2 = s.put(o.gm2), fpol = s.put(o.fpol),
          qe = s.put(o.qE), qi = s.put(o.qI),
          sn = s.fixed('march.sN', o.sN, ni_ * n),
          vpo = o.vprimeOld ? s.put(o.vprimeOld) : null,
          state = s.zeros(nstate);
      var rc = self.e.fylite_rs_core_march_init(
        rho.ptr, te.ptr, ti.ptr, ni.ptr, z.ptr, eni.ptr, psi.ptr,
        vp.ptr, gm3.ptr, gm2.ptr, fpol.ptr, qe.ptr, qi.ptr, sn.ptr,
        vpo ? vpo.ptr : 0, BigInt(n), BigInt(ni_),
        o.b0, num(o.b0Dot, 0), o.dt, num(o.dtTarget, 0), num(o.dtMin, 0),
        num(o.dtMax, 0), BigInt(o.maxOuter || 1), num(o.tolSteady, 1e-9),
        BigInt(o.nCoupling || 2), o.edgeTe, o.edgeTi, o.edgePsi,
        num(o.edgePsiRate, 0), num(o.dPc, 0), num(o.tol, 1e-10),
        BigInt(o.maxInner || 60),
        o.channels.heat ? 1 : 0, o.channels.density ? 1 : 0,
        o.channels.current ? 1 : 0, state.ptr, BigInt(nstate));
      if (rc !== 0) throw new SolveError('fylite_rs_core_march_init', rc);

      var ce = s.zeros(n), ci = s.zeros(n), sx = s.zeros(n),
          dn = s.zeros(ni_ * n), vn = s.zeros(ni_ * n),
          sg = s.zeros(n), jn = s.zeros(n),
          oTe = s.zeros(n), oTi = s.zeros(n), oNi = s.zeros(ni_ * n),
          oNe = s.zeros(n), oPsi = s.zeros(n),
          rTe = s.zeros(n), rTi = s.zeros(n), rNi = s.zeros(ni_ * n),
          rNe = s.zeros(n), rPsi = s.zeros(n), rQ = s.zeros(n),
          rSx = s.zeros(n), r6 = s.zeros(6);

      var setter = function (buf, arr, len) {
        if (!arr) return;
        if (arr.length !== len)
          throw new Error('FyLite: the closure returned ' + arr.length +
                          ' values where ' + len + ' were asked for');
        self.f64().set(arr, buf.ptr / 8);
      };
      //: the state the march reports, read back for the closure to be
      //: evaluated at — never the state the host last sent in
      var state0 = { rho: o.rho, te: s.get(oTe), ti: s.get(oTi),
                     ni: s.get(oNi), ne: s.get(oNe), psi: s.get(oPsi) };
      state0.te.set(o.te); state0.ti.set(o.ti);
      state0.ni.set(o.ni);
      state0.psi.set(o.psi);
      //: n_e is the quasi-neutrality closure, so the FIRST evaluation gets it
      //: from the ion mix rather than from an input that does not exist
      for (var k = 0; k < n; k++) {
        var acc = 0;
        for (var j = 0; j < ni_; j++) acc += o.z[j] * o.ni[j * n + k];
        state0.ne[k] = acc;
      }

      var result = function () {
        var rc2 = self.e.fylite_rs_core_march_result(
          state.ptr, BigInt(nstate), BigInt(n), BigInt(ni_), rTe.ptr,
          rTi.ptr, rNi.ptr, rNe.ptr, rPsi.ptr, rQ.ptr, rSx.ptr, r6.ptr);
        if (rc2 !== 0)
          throw new SolveError('fylite_rs_core_march_result', rc2);
        var v = s.get(r6);
        return { te: s.get(rTe), ti: s.get(rTi), ni: s.get(rNi),
                 ne: s.get(rNe), psi: s.get(rPsi), q: s.get(rQ),
                 sExchange: s.get(rSx), outerSteps: v[0] | 0,
                 steady: v[1] === 1, delta: v[2], psiRepaired: v[3],
                 dt: v[4], retries: v[5] | 0 };
      };

      var st = state0, seen = 0, guard = 0;
      for (;;) {
        var c = evaluate(st) || {};
        setter(ce, c.chiE, n); setter(ci, c.chiI, n);
        setter(sx, c.sExchange, n);
        setter(dn, c.dN, ni_ * n); setter(vn, c.vN, ni_ * n);
        setter(sg, c.sigmaPar, n); setter(jn, c.jNi, n);
        var req = self.e.fylite_rs_core_march_next(
          state.ptr, BigInt(nstate), ce.ptr, ci.ptr, sx.ptr, dn.ptr, vn.ptr,
          sg.ptr, jn.ptr, BigInt(n), BigInt(ni_),
          oTe.ptr, oTi.ptr, oNi.ptr, oNe.ptr, oPsi.ptr);
        if (req < 0) throw new SolveError('fylite_rs_core_march_next', req);
        st = { rho: o.rho, te: s.get(oTe), ti: s.get(oTi), ni: s.get(oNi),
               ne: s.get(oNe), psi: s.get(oPsi) };
        //: ★a step is REPORTED when the machine says it finished one, which
        //: is what the outer counter is for.  Counting the host's own calls
        //: would count coupling passes as time steps.
        if (onStep) {
          var r = result();
          if (r.outerSteps > seen) { seen = r.outerSteps; onStep(r); }
        }
        if (req === 0) break;
        //: the march is bounded by `maxOuter * nCoupling` calls; a machine
        //: that never says Done is a kernel bug, and looping forever in a
        //: worker is how it would present itself
        if (++guard > 64 * (o.maxOuter || 1) + 64)
          throw new Error('FyLite: the core march did not finish');
      }
      return result();
    });
  };

  // --- L7 neutral-beam deposition ------------------------------------------
  //
  // ★★THE WHOLE CHAIN IS THE KERNEL'S, and that is the point of binding it
  // rather than writing a beam model on this side.  Each of these entries
  // encodes a decision that a second host would make differently without
  // any test noticing: which nodes and weights sample the beam's finite
  // width, `pitch(R) = R_tan/R` exactly rather than by finite difference,
  // where the profile is read along the ray, the Stix critical energy's
  // field-ion sum, and — in `beam_current` — the fact that the bulk's
  // return current and the beam ions' own trapping are TWO suppressions
  // that entry applies together so a caller cannot apply one and believe
  // it applied the other.
  //
  // ★The one thing this side must get right is the ARRAY ORDER: `psin2d`
  // is R-major (`psin2d[i * nz + j]`, i over R), the same order
  // `gs_free_solve` writes psi in and the same order `shell_table` reads.

  /**
   * Shell volumes and mid-surface geometry on a psi_N EDGE grid — what a
   * deposition model bins into.  `o` = `{r0, z0, dr, dz, nr, nz, psin2d,
   * axisR, axisZ, limR, limZ, levels, nTheta}`.
   *
   * ★The tracing, the gap repair and the `V(0) = 0` convention are the
   * kernel's: a level that fails to trace leaves a gap, and which
   * quantities may be repaired across it is a statement about the
   * quantity, not a detail of a loop.
   */
  Fy.prototype.shellTable = function (o) {
    var self = this, nlev = o.levels.length, nlim = o.limR.length;
    return this.scope(function (s) {
      var p = s.fixed('shellTable.psin2d', o.psin2d, o.nr * o.nz),
          lr = s.put(o.limR), lz = s.put(o.limZ), lv = s.put(o.levels),
          out = s.zeros(4 * nlev);
      var rc = self.e.fylite_rs_shell_table(
        o.r0, o.z0, o.dr, o.dz, BigInt(o.nr), BigInt(o.nz), p.ptr,
        o.axisR, o.axisZ, lr.ptr, lz.ptr, BigInt(nlim), lv.ptr,
        BigInt(nlev), BigInt(o.nTheta || 181), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_shell_table', rc);
      var v = s.get(out);
      var vol = v.subarray(0, nlev), dvol = new Float64Array(nlev - 1);
      for (var k = 1; k < nlev; k++) dvol[k - 1] = vol[k] - vol[k - 1];
      return { volume: vol.slice(), dvolume: dvol,
               rminor: v.slice(nlev, 2 * nlev),
               rmajor: v.slice(2 * nlev, 3 * nlev),
               kappa: v.slice(3 * nlev) };
    });
  };

  /**
   * `dS = dV/(2 pi R)`, and — with `pDep`/`tauEff` — the fast-ion energy
   * density and pressure that share this ABI entry.
   *
   * ★★A surface of revolution has `dV = 2 pi R dS`, so a current density
   * integrates to a CURRENT with this weight and no other.  It looks like
   * bookkeeping and it is the difference between an ampere and an ampere
   * per metre.
   */
  Fy.prototype.shellArea = function (o) {
    var self = this, n = o.dvol.length;
    var both = !!(o.pDep && o.tauEff);
    return this.scope(function (s) {
      var dv = s.put(o.dvol), rj = s.fixed('shellArea.rmaj', o.rmaj, n),
          pd = both ? s.fixed('shellArea.pDep', o.pDep, n) : null,
          te = both ? s.fixed('shellArea.tauEff', o.tauEff, n) : null,
          out = s.zeros(both ? 3 * n : n);
      var rc = self.e.fylite_rs_shell_area(
        dv.ptr, rj.ptr, BigInt(n), pd ? pd.ptr : 0, te ? te.ptr : 0,
        out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_shell_area', rc);
      var v = s.get(out);
      if (!both) return { area: v };
      return { area: v.slice(0, n), wFast: v.slice(n, 2 * n),
               pFast: v.slice(2 * n) };
    });
  };

  /**
   * `sum v_i w_i` — a density over shell volumes, or a current density
   * over shell areas.  ★An ABI entry rather than a loop on this side
   * because P_abs, I_NBI and W_fast are closed by the SAME rule, and one
   * rule written three times is three rules.
   */
  Fy.prototype.shellSum = function (values, weights) {
    var self = this, n = values.length;
    return this.scope(function (s) {
      var v = s.put(values), w = s.fixed('shellSum.weights', weights, n),
          out = s.zeros(1);
      var rc = self.e.fylite_rs_shell_sum(v.ptr, w.ptr, BigInt(n), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_shell_sum', rc);
      return s.get(out)[0];
    });
  };

  /**
   * Fast-ion pressure SPLIT by the birth pitch (T-M12): the
   * pitch-preserving drag closure `p_par = 2 W xi^2`,
   * `p_perp = W (1 - xi^2)` with `W = pDep tauEff / 2`.
   * `p_par/2 + p_perp == W` and the trace third equals the isotropic
   * scalar, so the scalar channel is unchanged.
   */
  Fy.prototype.fastIonPressureSplit = function (o) {
    var self = this, n = o.pDep.length;
    return this.scope(function (s) {
      var pd = s.put(o.pDep),
          te = s.fixed('fastIonPressureSplit.tauEff', o.tauEff, n),
          xi = s.fixed('fastIonPressureSplit.pitch', o.pitch, n),
          out = s.zeros(3 * n);
      var rc = self.e.fylite_rs_fast_ion_pressure_split(
        pd.ptr, te.ptr, xi.ptr, BigInt(n), out.ptr);
      if (rc !== 0) {
        throw new SolveError('fylite_rs_fast_ion_pressure_split', rc);
      }
      var v = s.get(out);
      return { wFast: v.slice(0, n), pPar: v.slice(n, 2 * n),
               pPerp: v.slice(2 * n) };
    });
  };

  /**
   * Toroidal torque density of the beam's PROMPT momentum input (T-M12):
   * `tau_phi = pDep (2/v_b) xi R`, `v_b = sqrt(2 e E / m)` — per energy
   * component, the caller sums.  `energy` eV, `mass` amu; the sign is the
   * pitch's.
   */
  Fy.prototype.beamTorque = function (o) {
    var self = this, n = o.pDep.length;
    return this.scope(function (s) {
      var pd = s.put(o.pDep),
          xi = s.fixed('beamTorque.pitch', o.pitch, n),
          rj = s.fixed('beamTorque.rmaj', o.rmaj, n),
          out = s.zeros(n);
      var rc = self.e.fylite_rs_beam_torque(
        pd.ptr, xi.ptr, rj.ptr, BigInt(n), +o.energy, +o.mass, out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_beam_torque', rc);
      return s.get(out);
    });
  };

  /** Lin-Liu & Miller trapped fraction from the inverse aspect ratio. */
  Fy.prototype.trappedFractionEps = function (eps) {
    var self = this, n = eps.length;
    return this.scope(function (s) {
      var e = s.put(eps), out = s.zeros(n);
      var rc = self.e.fylite_rs_trapped_fraction_eps(e.ptr, BigInt(n),
                                                     out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_trapped_fraction_eps', rc);
      return s.get(out);
    });
  };

  /** Linear interpolation, the kernel's — same rule as every other host. */
  Fy.prototype.interp = function (x, xp, yp) {
    var self = this, n = x.length, m = xp.length;
    return this.scope(function (s) {
      var a = s.put(x), b = s.put(xp),
          c = s.fixed('interp.yp', yp, m), out = s.zeros(n);
      var rc = self.e.fylite_rs_interp(a.ptr, BigInt(n), b.ptr, c.ptr,
                                       BigInt(m), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_interp', rc);
      return s.get(out);
    });
  };

  //: the two model selectors, spelled where the call is rather than as bare
  //: integers at the call site
  var BEAM_STOPPING = { janev: 0, metis: 1 };
  var BEAM_IMPURITY_FORM = { exp: 0, metis: 1 };

  /**
   * ONE energy component of ONE beam over its finite cross-section: the
   * footprint's rays, their geometry, the profile evaluation at the ray's
   * own samples, the attenuation and the shell binning — one call.
   *
   * `o` = `{r0, z0, dr, dz, nr, nz, psin2d, tangencyRadius, zHeight,
   *          widthR, widthZ, direction, nWidthR, nWidthZ, nSamples,
   *          rStart, psinProf, ne, te, psinEdges, mass, energy,
   *          model, impurityForm, nHe, nImp, zImp, nImp2, zImp2}`
   *
   * Returns `{absorbed, pitchWeighted, shinethrough}` per shell.  ★
   * `sum(absorbed) + shinethrough` is 1 to round-off; that is the only
   * cheap check this model has, and the gate uses it.
   */
  Fy.prototype.beamDeposit = function (o) {
    var self = this, nprof = o.psinProf.length,
        nsh = o.psinEdges.length - 1;
    return this.scope(function (s) {
      var p = s.fixed('beamDeposit.psin2d', o.psin2d, o.nr * o.nz),
          pp = s.put(o.psinProf),
          ne = s.fixed('beamDeposit.ne', o.ne, nprof),
          te = s.fixed('beamDeposit.te', o.te, nprof),
          ed = s.put(o.psinEdges),
          out = s.zeros(2 * nsh), shine = s.zeros(1);
      var rc = self.e.fylite_rs_beam_deposit(
        o.r0, o.z0, o.dr, o.dz, BigInt(o.nr), BigInt(o.nz), p.ptr,
        o.tangencyRadius, o.zHeight, o.widthR, o.widthZ, o.direction,
        BigInt(o.nWidthR || 3), BigInt(o.nWidthZ || 3),
        BigInt(o.nSamples || 601), o.rStart,
        pp.ptr, ne.ptr, te.ptr, BigInt(nprof), ed.ptr, BigInt(nsh),
        o.mass, o.energy,
        BEAM_STOPPING[o.model || 'janev'],
        BEAM_IMPURITY_FORM[o.impurityForm || 'exp'],
        num(o.nHe, 0), num(o.nImp, 0), num(o.zImp, 6),
        num(o.nImp2, 0), num(o.zImp2, 74), out.ptr, shine.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_beam_deposit', rc);
      var v = s.get(out);
      return { absorbed: v.slice(0, nsh), pitchWeighted: v.slice(nsh),
               shinethrough: s.get(shine)[0] };
    });
  };

  /**
   * Stix slowing-down over a profile: `{eCrit, eGamma, tauS, lnLambda,
   * ionFraction, tauEff}`, the last two evaluated at `eBeam`.
   */
  Fy.prototype.beamSlowing = function (o) {
    var self = this, n = o.te.length;
    return this.scope(function (s) {
      var te = s.put(o.te), ne = s.fixed('beamSlowing.ne', o.ne, n),
          z = s.fixed('beamSlowing.zeff', o.zeff, n),
          zs = s.fixed('beamSlowing.zsum', o.zsum, n),
          out = s.zeros(6 * n);
      var rc = self.e.fylite_rs_beam_slowing(
        te.ptr, ne.ptr, z.ptr, zs.ptr, BigInt(n), o.mass, o.eBeam, out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_beam_slowing', rc);
      var v = s.get(out), k;
      var col = function (c) {
        var a = new Float64Array(n);
        for (k = 0; k < n; k++) a[k] = v[6 * k + c];
        return a;
      };
      return { eCrit: col(0), eGamma: col(1), tauS: col(2),
               lnLambda: col(3), ionFraction: col(4), tauEff: col(5) };
    });
  };

  /**
   * The beam's energy partition from a critical energy and a slowing time
   * already in hand: `{ionFraction, tauEff}`.
   */
  Fy.prototype.beamEnergyPartition = function (o) {
    var self = this, n = o.eCrit.length;
    return this.scope(function (s) {
      var ec = s.put(o.eCrit), ts = s.fixed('beamPartition.tauS', o.tauS, n),
          eb = s.fixed('beamPartition.eBeam', o.eBeam, n),
          out = s.zeros(2 * n);
      var rc = self.e.fylite_rs_beam_energy_partition(
        ec.ptr, ts.ptr, eb.ptr, BigInt(n), out.ptr);
      if (rc !== 0)
        throw new SolveError('fylite_rs_beam_energy_partition', rc);
      var v = s.get(out), a = new Float64Array(n), b = new Float64Array(n);
      for (var k = 0; k < n; k++) { a[k] = v[2 * k]; b[k] = v[2 * k + 1]; }
      return { ionFraction: a, tauEff: b };
    });
  };

  /**
   * Electron shielding of the beam-driven current: `{g, factor}`.
   *
   * ★TWO numbers, and they are not the same number: `g` is the shielding
   * function and `factor` is `1 - (Z_b/Z_eff) g` — the surviving fraction.
   * They are returned separately because a page that multiplied them into
   * the current and reported one number could not say which of the two it
   * had applied.
   */
  Fy.prototype.beamShielding = function (o) {
    var self = this, n = o.ft.length;
    return this.scope(function (s) {
      var ft = s.put(o.ft), z = s.fixed('beamShielding.zeff', o.zeff, n),
          out = s.zeros(2 * n);
      var rc = self.e.fylite_rs_beam_shielding(ft.ptr, z.ptr, BigInt(n),
                                               out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_beam_shielding', rc);
      var v = s.get(out), a = new Float64Array(n), b = new Float64Array(n);
      for (var k = 0; k < n; k++) { a[k] = v[2 * k]; b[k] = v[2 * k + 1]; }
      return { g: a, factor: b };
    });
  };

  /**
   * The beam-driven current density of one energy component [A/m^2].
   *
   * ★The bulk's return current (`shield`) and the beam ions' own trapping
   * are DIFFERENT suppressions and this entry applies BOTH — which is why
   * the shielding factor is reported beside the current rather than folded
   * into it on this side.
   */
  Fy.prototype.beamCurrent = function (o) {
    var self = this, n = o.pDep.length;
    return this.scope(function (s) {
      var pd = s.put(o.pDep), pt = s.fixed('beamCurrent.pitch', o.pitch, n),
          ec = s.fixed('beamCurrent.eCrit', o.eCrit, n),
          eg = s.fixed('beamCurrent.eGamma', o.eGamma, n),
          ts = s.fixed('beamCurrent.tauS', o.tauS, n),
          rm = s.fixed('beamCurrent.rmin', o.rmin, n),
          rj = s.fixed('beamCurrent.rmaj', o.rmaj, n),
          sh = s.fixed('beamCurrent.shield', o.shield, n),
          out = s.zeros(n);
      var rc = self.e.fylite_rs_beam_current(
        pd.ptr, pt.ptr, ec.ptr, eg.ptr, ts.ptr, rm.ptr, rj.ptr, sh.ptr,
        BigInt(n), o.energy, o.mass, num(o.multiplier, 1),
        BigInt(o.nStep || 101), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_beam_current', rc);
      return s.get(out);
    });
  };

  /**
   * The first-orbit-loss mask: 1 where a newly born ion is lost.
   *
   * ★Counter-injection only — a co-injected ion drifts INWARD, and the
   * same arithmetic applied to it would invent a loss that does not
   * happen.  The kernel returns all zeros for `counter = false`, and this
   * side does not second-guess that.
   */
  Fy.prototype.firstOrbitLoss = function (o) {
    var self = this, n = o.rmin.length;
    return this.scope(function (s) {
      var rm = s.put(o.rmin), rj = s.fixed('firstOrbit.rmaj', o.rmaj, n),
          q = s.fixed('firstOrbit.q', o.q, n), out = s.zeros(n);
      var rc = self.e.fylite_rs_first_orbit_loss(
        rm.ptr, rj.ptr, q.ptr, BigInt(n), o.aEdge, o.b0, o.r0, o.mass,
        o.charge, o.energy, o.counter ? 1 : 0, out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_first_orbit_loss', rc);
      return s.get(out);
    });
  };

  //: ★the CD-model selector, spelled where the call is.  The index IS the
  //: ABI code (`LH_EFFICIENCY_MODEL_NAMES`), so append, never reorder.
  var LH_CD_MODEL = { fisch: 0 };

  /**
   * ★★THE WHOLE LOWER-HYBRID CHAIN, one call: where each band end
   * resonates, the accessibility gate, the damping layer, the CD
   * weighting, the normalisation and the sigma envelope.
   *
   * `o` = `{psin, dvol, rmaj, ne, te, fPol, bands, powers, etaCd, r0, xi,
   *          widthFloor, cdModel}` — `bands` one EFFECTIVE `[n_lo, n_hi]`
   * per launcher (the up-shift already applied by the caller, which is
   * where that assumption is stated) and `powers` the absorbed watts.
   *
   * Returns `{jLh, sigmaJ, pDep, nAcc, iLau, resLo, resHi, iLh, neBar}`.
   * ★`resLo`/`resHi` come back NaN where a band end resonates nowhere in
   * this plasma: that is a RESULT (too cold for that n_parallel, so a
   * single-pass model deposits nothing there), not an error, and this side
   * passes it through rather than turning it into a zero.
   */
  Fy.prototype.lhDeposit = function (o) {
    var self = this, n = o.psin.length, nl = o.bands.length;
    var lo = new Float64Array(nl), hi = new Float64Array(nl);
    for (var k = 0; k < nl; k++) { lo[k] = o.bands[k][0]; hi[k] = o.bands[k][1]; }
    return this.scope(function (s) {
      var ps = s.put(o.psin),
          dv = s.fixed('lhDeposit.dvol', o.dvol, n),
          rm = s.fixed('lhDeposit.rmaj', o.rmaj, n),
          ne = s.fixed('lhDeposit.ne', o.ne, n),
          te = s.fixed('lhDeposit.te', o.te, n),
          fp = s.fixed('lhDeposit.fPol', o.fPol, n),
          bl = s.put(lo), bh = s.put(hi),
          pw = s.fixed('lhDeposit.powers', o.powers, nl),
          fields = s.zeros(4 * n), per = s.zeros(3 * nl), scal = s.zeros(2);
      var rc = self.e.fylite_rs_lh_deposit(
        ps.ptr, dv.ptr, rm.ptr, ne.ptr, te.ptr, fp.ptr, BigInt(n),
        bl.ptr, bh.ptr, pw.ptr, BigInt(nl),
        o.etaCd, o.r0, num(o.xi, 3), num(o.widthFloor, 0.05),
        LH_CD_MODEL[o.cdModel || 'fisch'],
        fields.ptr, per.ptr, scal.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_lh_deposit', rc);
      var v = s.get(fields), p = s.get(per), c = s.get(scal);
      return { jLh: v.slice(0, n), sigmaJ: v.slice(n, 2 * n),
               pDep: v.slice(2 * n, 3 * n), nAcc: v.slice(3 * n),
               iLau: p.slice(0, nl), resLo: p.slice(nl, 2 * nl),
               resHi: p.slice(2 * nl), iLh: c[0], neBar: c[1] };
    });
  };

  /**
   * The slow-wave accessibility limit per surface, and the Landau-resonant
   * temperature of one `n_parallel`: `{nAccessible, tResonant}`.
   *
   * ★TWO answers out of one entry and they are not the same question:
   * `nAccessible` says WHERE the wave can go, `tResonant` says where it
   * would damp if it got there.  A page multiplying them into one
   * "coupling" number could not say which of the two failed.
   */
  Fy.prototype.lhAccessibility = function (o) {
    var self = this, n = o.ne.length;
    return this.scope(function (s) {
      var ne = s.put(o.ne), b = s.fixed('lhAccessibility.bTot', o.bTot, n),
          out = s.zeros(2 * n);
      var rc = self.e.fylite_rs_lh_accessibility(
        ne.ptr, b.ptr, BigInt(n), o.nParallel, num(o.xi, 3), out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_lh_accessibility', rc);
      var v = s.get(out), a = new Float64Array(n);
      for (var k = 0; k < n; k++) a[k] = v[2 * k];
      return { nAccessible: a, tResonant: v[1] };
    });
  };

  /**
   * The LOCAL current-drive efficiency weight of a lower-hybrid wave —
   * Fisch-type `T_e/n_e`, the shape that redistributes a launcher's total
   * current across the resonant layer.
   *
   * ★It takes a model NAME because this is the one place in the LH chain
   * where a different CD model changes the answer.
   */
  Fy.prototype.lhEfficiency = function (o) {
    var self = this, n = o.ne.length;
    return this.scope(function (s) {
      var ne = s.put(o.ne), te = s.fixed('lhEfficiency.te', o.te, n),
          out = s.zeros(n);
      var rc = self.e.fylite_rs_lh_efficiency(
        ne.ptr, te.ptr, BigInt(n), LH_CD_MODEL[o.model || 'fisch'], out.ptr);
      if (rc !== 0) throw new SolveError('fylite_rs_lh_efficiency', rc);
      return s.get(out);
    });
  };

  // --- errors -------------------------------------------------------------

  function SolveError(fn, code) {
    this.name = 'SolveError';
    this.code = code;
    this.message = fn + ' failed: ' + explain(fn, code) + ' (code ' + code + ')';
  }
  SolveError.prototype = Object.create(Error.prototype);

  //: ★Error codes are PER ENTRY, not global.  `transport_step` numbers its
  //: own faults from `TransportError`, and -6 there means a singular matrix
  //: — while the shared table below reads -6 as an empty current mask.  A
  //: diverged transport solve was therefore reported as a coil problem:
  //: confident, specific and about the wrong subsystem.  Entries whose code
  //: space is their own get their own table, and the shared one is the
  //: fallback rather than the assumption.
  var PER_ENTRY = {
    fylite_rs_transport_step: {
      '-2': 'err.tr.theta', '-3': 'err.tr.euler', '-4': 'err.tr.pc',
      '-5': 'err.tr.grid', '-6': 'err.tr.singular', '-20': 'err.tr.neo',
    },
    fylite_rs_design_null: { '-3': 'err.dn.maxiter' },
  };

  function explain(fn, code) {
    var own = PER_ENTRY[fn];
    if (own && own[String(code)]) return T(own[String(code)]);
    switch (code) {
      case -1: return T('err.null_ptr');
      case -2: return T('err.bounds');
      case -4: return T('err.not_spd');
      case -5: return T('err.span');
      case -6: return T('err.mask');
      case -7: return T('err.limiter');
      default:
        if (code <= -100000) {
          var it = Math.floor((-code - 100000) / 100);
          return T('err.fit', { it: it });
        }
        return T('err.unknown');
    }
  }

  function num(v, dflt) { return v === undefined || v === null ? dflt : v; }

  // --- loader --------------------------------------------------------------

  /** Instantiate from raw bytes (ArrayBuffer / TypedArray). */
  function fromBytes(bytes, required) {
    return WebAssembly.instantiate(bytes, {}).then(function (m) {
      return new Fy(m.instance, required);
    });
  }

  /**
   * Fetch and instantiate.  Deliberately NOT instantiateStreaming: some
   * static hosts serve .wasm with the wrong Content-Type and streaming
   * then fails where the buffered path does not.
   */
  /**
   * Fetch and instantiate a kernel module.
   *
   * The kernel ships as MORE THAN ONE artifact: `fylite_rs.wasm` carries the
   * equilibrium / reconstruction / 0-D surface these pages call, and
   * `fylite_tglf.wasm` carries the gyro-Landau-fluid port, which they do
   * not.  Combining them meant every visitor downloaded roughly twice what
   * they use (measured: 223 KB + 326 KB against 496 KB combined), so the
   * second one is fetched only by whatever actually needs it.
   *
   * `opts.required` names the exports this caller depends on; absent, the
   * core set is checked.  ★Presence is the right question to ask: the ABI
   * version pins SIGNATURES, and two builds of the same version can carry
   * different subsets of the entries.
   */
  function load(url, opts) {
    var required = (opts && opts.required) || REQUIRED;
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('fetch ' + url + ': HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      // hash the bytes we are about to run.  "Which build produced this
      // result" is then answerable from an exported document alone, with no
      // identity service and no trust in the page's own version string.
      return digest(buf).then(function (sha) {
        return fromBytes(buf, required).then(function (fy) {
          fy.sha256 = sha;
          fy.bytes = buf.byteLength;
          return fy;
        });
      });
    });
  }

  /** SHA-256 of an ArrayBuffer as lowercase hex; null where unavailable. */
  function digest(buf) {
    var c = (typeof crypto !== 'undefined') && crypto.subtle;
    if (!c || !c.digest) return Promise.resolve(null);
    return c.digest('SHA-256', buf).then(function (h) {
      return Array.prototype.map.call(new Uint8Array(h), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    }).catch(function () { return null; });
  }

  //: what a TGLF module must carry.  The allocator travels with it: a
  //: separate module has its OWN linear memory, so buffers cannot be shared
  //: with the core one and have to be placed inside this instance.
  var REQUIRED_TGLF = [
    'fylite_rs_alloc', 'fylite_rs_free', 'fylite_rs_abi_version',
    'fylite_rs_tglf_linear', 'fylite_rs_tglf_units',
    //: the quasilinear flux chain.  It was in the artifact from the day the
    //: port landed and nothing asked for it, so its absence would never
    //: have been noticed — listing it here is what makes a build without it
    //: fail loudly instead of at the first closure evaluation.
    'fylite_rs_tglf_flux', 'memory',
  ];

  /**
   * Fetch the TGLF module.  Only `tglf.html` calls it, and only when the
   * visitor asks for a scan — which is the whole point of the split: the
   * other six pages never pay for these 323 KB.
   */
  function loadTglf(url) {
    return load(url || 'assets/fylite_tglf.wasm', { required: REQUIRED_TGLF });
  }

  /**
   * The ATOMIC NUMBER of each species the kernel's ADAS table carries.
   *
   * ★This is not physics and not a fit — it is the periodic table, and it
   * sits here because the kernel's cooling-rate table is keyed by NAME and
   * carries no Z: `rad_ion` takes `z` from its caller (the bremsstrahlung
   * half needs `Z^2 n_z`), and so does every dilution or Z_eff sum built
   * from a chosen species.
   *
   * ★It is CHECKED rather than trusted: the browser gate asserts that this
   * table covers exactly the species `adasSpecies()` reports, so a kernel
   * that gains or renames one cannot leave a silently unknown Z behind.
   */
  var ADAS_Z = {
    H: 1, D: 1, T: 1, He: 2, Li: 3, Be: 4, B: 5, C: 6, N: 7, O: 8, F: 9,
    Ne: 10, Al: 13, Si: 14, Ar: 18, Ca: 20, Fe: 26, Ni: 28, Kr: 36,
    Mo: 42, Xe: 54, W: 74,
  };

  /**
   * And the MASS NUMBER of each — the most abundant isotope, except for the
   * three hydrogenic entries the table names individually.
   *
   * ★Needed because the alpha's critical energy goes through the field-ion
   * sum `sum n_j Z_j^2/(n_e A_j)`, which is a sum over the composition and
   * not over its charges alone.  Checked against `ADAS_Z` by the same gate,
   * so the two tables cannot come apart.
   */
  var ADAS_A = {
    H: 1, D: 2, T: 3, He: 4, Li: 7, Be: 9, B: 11, C: 12, N: 14, O: 16,
    F: 19, Ne: 20, Al: 27, Si: 28, Ar: 40, Ca: 40, Fe: 56, Ni: 58, Kr: 84,
    Mo: 96, Xe: 131, W: 184,
  };

  root.FyLite = { load: load, fromBytes: fromBytes, ABI_EXPECT: ABI_EXPECT,
                  loadTglf: loadTglf, REQUIRED_TGLF: REQUIRED_TGLF,
                  ADAS_Z: ADAS_Z, ADAS_A: ADAS_A, SolveError: SolveError };

  // ==========================================================================
  // Grid-shaped adapters — formerly `physics.js` (FYL-DESIGN-07 D-4).
  //
  // ★What moved here is NOT physics: every function below either builds an
  // array, names arguments for a C entry, or reshapes what came back.  The
  // arithmetic left this layer entry by entry over ABI v32..v42, and when the
  // last loop went (the vessel test, v42) what remained was a file whose only
  // job was to say the same thing in grid vocabulary.  A file that only
  // forwards is a layer to keep in step, so it was folded into the layer it
  // was forwarding to.
  //
  // The `FyPhys` name survives because callers speak it and the SESSION FILES
  // and gates are written against those call shapes; renaming them would be a
  // second change wearing this one's clothes.
  // ==========================================================================

  'use strict';

  var MU0 = 4.0e-7 * Math.PI;

  // --- grid ---------------------------------------------------------------

  //: the kernel, once a consumer hands it over.  Null means the caller
  //: has not (the gates' headless paths), and the JS fallbacks stand in.
  var KERNEL = null;
  function useKernel(fy) { KERNEL = fy; }

  function makeGrid(box) {
    var nr = box.nr, nz = box.nz;
    var r = new Float64Array(nr), z = new Float64Array(nz);
    for (var i = 0; i < nr; i++)
      r[i] = box.rmin + (box.rmax - box.rmin) * i / (nr - 1);
    for (var j = 0; j < nz; j++)
      z[j] = box.zmin + (box.zmax - box.zmin) * j / (nz - 1);
    return { r: r, z: z, nr: nr, nz: nz,
             dr: r[1] - r[0], dz: z[1] - z[0] };
  }

  /** Bilinear sample of a row-major field; NaN outside the box. */
  /**
   * Bilinear read of a grid field — the KERNEL's (`surfaces::sample`).
   * Scalar or array, same rule as `bField`.
   *
   * ★The out-of-grid answer is NaN, and that convention is why this is one
   * host: a caller that clamped instead would read the boundary node for
   * every point beyond it.
   */
  function sample(grid, f, r, z) {
    if (!KERNEL)
      throw new Error('FyPhys.sample: no kernel — call FyPhys.useKernel()');
    var one = typeof r === 'number';
    var o = KERNEL.sampleGrid({
      r0: grid.r[0], z0: grid.z[0], dr: grid.dr, dz: grid.dz,
      nr: grid.nr, nz: grid.nz, f: f, r: one ? [r] : r, z: one ? [z] : z });
    return one ? o[0] : o;
  }

  /** (Br, Bz) from a psi field by central differences [T]. */
  /**
   * Poloidal field from a psi map — the KERNEL's (`surfaces::b_field`).
   *
   * ★Takes a scalar OR an array.  A scalar gives back numbers, an array
   * gives back arrays: the two loop call sites sweep a probe or chord list,
   * and paying an ABI crossing per point to remove a duplicate would be a
   * poor trade.  The central-difference step (half the smaller cell) is
   * part of the answer, which is why one host owns it.
   */
  function bField(grid, psi, r, z) {
    if (!KERNEL)
      throw new Error('FyPhys.bField: no kernel — call FyPhys.useKernel()');
    var one = typeof r === 'number';
    var rr = one ? [r] : r, zz = one ? [z] : z;
    var o = KERNEL.bField({
      r0: grid.r[0], z0: grid.z[0], dr: grid.dr, dz: grid.dz,
      nr: grid.nr, nz: grid.nz, psi: psi, r: rr, z: zz });
    return one ? { br: o.br[0], bz: o.bz[0] } : o;
  }

  // --- response matrices (wasm kernels) -----------------------------------

  /**
   * Per-coil psi/Br/Bz response over the whole grid, per unit total
   * element current.  Returns {psi, br, bz} each row-major (ncoil, nr*nz).
   */
  function gridNodes(grid) {
    var n = grid.nr * grid.nz;
    var pr = new Float64Array(n), pz = new Float64Array(n);
    for (var i = 0; i < grid.nr; i++)
      for (var j = 0; j < grid.nz; j++) {
        pr[i * grid.nz + j] = grid.r[i];
        pz[i * grid.nz + j] = grid.z[j];
      }
    return { pr: pr, pz: pz, n: n };
  }

  function coilGridResponse(fy, coils, grid, nu, nv) {
    var g = gridNodes(grid);
    return fy.elementResponse(coils, g.pr, g.pz, nu || 6, nv || 6);
  }

  /**
   * Per-CHANNEL psi on every grid node, `(nch, n_node)` — the table a page
   * builds once and contracts against a channel vector per solve.
   *
   * ★The response AND the channel fold are one kernel call; only the
   * transpose into the cache's own layout happens here.  The caller used to
   * fold in JS, which made the page a second host for a map whose index
   * direction is its whole content.
   */
  function gridChannelResponse(fy, coils, weightsT, nch, grid, nu, nv) {
    var g = gridNodes(grid);
    var f = fy.channelField(coils, weightsT, nch, g.pr, g.pz, nu || 4, nv || 4);
    var out = new Float64Array(nch * g.n);
    for (var p = 0; p < g.n; p++)
      for (var c = 0; c < nch; c++) out[c * g.n + p] = f.psi[p * nch + c];
    return out;
  }

  /** Per-coil response at scattered points. */
  function coilPointResponse(fy, coils, pr, pz, nu, nv) {
    return fy.elementResponse(coils, pr, pz, nu || 6, nv || 6);
  }

  /** psi_ext = sum_k I_k * G_k  (I in total amperes). */
  function combine(resp, currents, npts) {
    var out = new Float64Array(npts);
    for (var k = 0; k < currents.length; k++) {
      var ik = currents[k];
      if (ik === 0) continue;
      var off = k * npts;
      for (var p = 0; p < npts; p++) out[p] += ik * resp[off + p];
    }
    return out;
  }

  /**
   * Flux-loop response matrix, row-major (nloop, nr*nz): the full-flux
   * mutual [Wb/A] between each loop and a unit toroidal current at each
   * grid node.  Built one loop at a time through the wasm elliptic
   * kernel — the same `mutual_scalar` the solver's own border Green uses,
   * so the rows and the solved field share one gauge (meas_scale = 1).
   */
  function loopResponse(fy, grid, loops) {
    var g = gridNodes(grid), nl = loops.length;
    //: ★one outer-product call.  This used to loop over loops, filling a
    //: grid-length array with ONE loop's position each time to feed the
    //: elementwise entry — 35 materialised copies of a constant, to compute
    //: a block the kernel answers without materialising either side.
    var lr = new Float64Array(nl), lz = new Float64Array(nl);
    for (var d = 0; d < nl; d++) { lr[d] = loops[d][0]; lz[d] = loops[d][1]; }
    return fy.mutualOuter(lr, lz, g.pr, g.pz);
  }



  // --- plasma mask / analytic profile bookkeeping --------------------------

  /**
   * Flood-fill plasma mask over the interior cells, replicating the rule
   * the solvers use: limiter-interior nodes with s*psi above s*psi_bnd,
   * connected to the axis.  Returns a Uint8Array over (nr-2, nz-2).
   */
  function plasmaMask(grid, psi, psiAxis, psiBnd, limR, limZ, sign) {
    if (!KERNEL)
      throw new Error('FyPhys.plasmaMask: no kernel — call useKernel()');
    //: the vessel test used to run HERE, node by node — nr*nz*nlim polygon
    //: crossings in JavaScript.  The kernel takes the limiter now (v42), so
    //: what is left is naming the arguments.
    return KERNEL.plasmaMaskLim({
      r0: grid.r[0], z0: grid.z[0], dr: grid.dr, dz: grid.dz,
      nr: grid.nr, nz: grid.nz, psi: psi, limR: limR, limZ: limZ,
      psiBnd: psiBnd, sign: sign || 1 });
  }



  /** Analytic shape factor S(R, x) — the Rust AnalyticProfile. */
  /**
   * The analytic current shape — the KERNEL's (`surfaces::analytic_shape`).
   * Scalar or array, same rule as `bField`.
   */
  function analyticShape(prof, r, x) {
    if (!KERNEL)
      throw new Error('FyPhys.analyticShape: no kernel — call FyPhys.useKernel()');
    var one = typeof r === 'number';
    var o = KERNEL.analyticShape({
      beta0: prof.beta0, emp: prof.emp, enp: prof.enp, r0: prof.r0,
      r: one ? [r] : r, x: one ? [x] : x });
    return one ? o[0] : o;
  }

  /**
   * Recover the current scale j_c the free-boundary solve applied, then
   * the p'(x) / FF'(x) / p(x) it implies.  The solver normalizes
   * j_phi = j_c * S(R, x) to the requested Ip, so j_c follows from the
   * converged field, and the two terms of S separate exactly into the
   * pressure and the poloidal-current channel:
   *
   *   p'(x)  = j_c * beta0 / R0 * (1 - x^emp)^enp        [Pa / (Wb/rad)]
   *   FF'(x) = mu0 * j_c * (1 - beta0) * R0 * (...)
   *   p(x)   = span_pr * integral_x^1 p'(t) dt,  span_pr = (psi_a-psi_b)/2pi
   */
  function analyticTruth(grid, res, prof, limR, limZ, nx) {
    if (!KERNEL)
      throw new Error('FyPhys.analyticTruth: no kernel — call useKernel()');
    var mask = plasmaMask(grid, res.psi, res.psiAxis, res.psiBnd, limR, limZ, 1);
    var t = KERNEL.analyticTruth({
      psi: res.psi, nr: grid.nr, nz: grid.nz, rOf: grid.r,
      dr: grid.dr, dz: grid.dz, mask: mask,
      psiAxis: res.psiAxis, psiBnd: res.psiBnd, ip: res.ip,
      beta0: prof.beta0, emp: prof.emp, enp: prof.enp, r0: prof.r0,
      nx: nx || 201 });
    var m = t.x.length, p = t.p;
    t.mask = mask;
    //: the interpolator stays on this side: it is a convenience for the
    //: page, not part of what the field implies
    t.pAt = function (xq) {
      var u = xq * (m - 1), k = Math.min(m - 2, Math.max(0, u | 0));
      return p[k] + (u - k) * (p[k + 1] - p[k]);
    };
    return t;
  }


  /**
   * Evaluate the fitted polynomial channels of a reconstruction.
   * `coefs` is [p'_0..p'_{npp-1}, FF'_0..FF'_{nff-1}] in the reduced
   * (edge-zero) basis x^k - x^n used by the Rust fit.
   */
  function fittedProfiles(coefs, npp, nff, psiAxis, psiBnd, nx) {
    if (!KERNEL)
      throw new Error('FyPhys.fittedProfiles: no kernel — call useKernel()');
    return KERNEL.fittedProfiles({ coefs: coefs, npp: npp, nff: nff,
      psiAxis: psiAxis, psiBnd: psiBnd, nx: nx || 201 });
  }


  /**
   * The toroidal current the fitted coefficients imply, cell by cell over
   * the interior (nr-2, nz-2) — the same expression the Rust fit uses to
   * close its own loop, recomputed here so the page can forward-model the
   * flux loops and show how well the reconstruction fits its data.
   */
  function fittedCurrent(grid, psi, psiAxis, psiBnd, coefs, npp, nff, mask) {
    if (!KERNEL)
      throw new Error('FyPhys.fittedCurrent: no kernel — call useKernel()');
    return KERNEL.fittedCurrent({ psi: psi, nr: grid.nr, nz: grid.nz,
      rOf: grid.r, dr: grid.dr, dz: grid.dz, psiAxis: psiAxis,
      psiBnd: psiBnd, coefs: coefs, npp: npp, nff: nff, mask: mask });
  }


  /**
   * The current distribution a free-boundary solve settled on, rebuilt
   * from its converged field and the analytic profile it was given (the
   * ABI returns the field, not the current).  `truth` comes from
   * analyticTruth() and carries the mask and the normalization j_c.
   */
  /**
   * The analytic current over the interior cells — the KERNEL's
   * (`surfaces::analytic_current`).  ★This was an `nr*nz` double loop in
   * JavaScript, the same shape as the vessel test that left in v42.
   */
  function fittedCurrentAnalytic(grid, res, prof, truth) {
    if (!KERNEL)
      throw new Error('FyPhys.fittedCurrentAnalytic: no kernel — call FyPhys.useKernel()');
    return KERNEL.analyticCurrent({
      psi: res.psi, nr: grid.nr, nz: grid.nz, rOf: grid.r,
      dr: grid.dr, dz: grid.dz, mask: truth.mask,
      psiAxis: res.psiAxis, psiBnd: res.psiBnd, jc: truth.jc,
      beta0: prof.beta0, emp: prof.emp, enp: prof.enp, r0: prof.r0 });
  }

  /** Forward-model the flux loops from an interior cell-current vector. */
  function loopModel(loopsM, cur, grid, measScale) {
    if (!KERNEL)
      throw new Error('FyPhys.loopModel: no kernel — call useKernel()');
    var ng = grid.nr * grid.nz;
    return KERNEL.loopModel({ loopsM: loopsM, nLoop: loopsM.length / ng,
      cur: cur, nr: grid.nr, nz: grid.nz, measScale: measScale });
  }


  /** Total current of an interior cell-current vector [A]. */
  function totalCurrent(cur) {
    var s = 0;
    for (var i = 0; i < cur.length; i++) s += cur[i];
    return s;
  }

  // --- contours ------------------------------------------------------------

  /**
   * Marching-squares segments of one level.  Returns a flat array of
   * [r0, z0, r1, z1, ...] pairs; the plots draw segments directly, and
   * the shape metrics only need the point cloud, so no stitching.
   */




  /**
   * Pull rays that overshoot their angular neighbourhood back to it.
   * Compares each radius with the median of a 5-ray window (cyclic,
   * NaN-tolerant) and clips anything beyond `TOL` times that median.  Two
   * passes, so a leak two rays wide is caught as well; a genuinely wide
   * feature moves the median with it and survives untouched.
   */
  /**
   * The drawn / measured boundary is taken this far INSIDE the boundary
   * flux, as a fraction of the axis-to-boundary span.
   *
   * The separatrix itself is a bad surface to measure: at an X point it
   * has a corner where r(theta) from the axis is not a usable
   * parameterization, and a level set at exactly psi_bnd leaks through
   * any neck the tracer can resolve — and this tracer resolves necks far
   * below the 25 mm grid the field is defined on.  Measured on the
   * bundled synthetic case, the boundary trace grew a tongue reaching
   * z = -0.956 m while every interior surface stopped near -0.55 m; at
   * 0.2 % inside, the tongue was gone (neighbour-to-neighbour jump
   * 23.1 % -> 3.1 %).  A corner that vanishes under a 0.2 % change of
   * level is interpolation detail, not geometry — an X point that is
   * genuinely resolved survives, because the interior surfaces crowd
   * toward it and move with it.
   *
   * 0.5 % keeps a margin over the 0.2 % where the pathology closed, and
   * costs about 1 % in the reported elongation.
   */
  var BOUNDARY_INSET = 0.005;

  /** The boundary surface used for drawing and for the shape metrics. */
  /**
   * The plasma boundary, traced by the KERNEL (FYL-DESIGN-07 D-4).
   *
   * ★Repointed only after the two were shown to agree.  The JavaScript
   * tracer carried rules that were paid for twice (the psi-bar inset, the
   * five-point neck median, two passes) — the ledger has a section on it,
   * and a swap onto an implementation without them would have put kappa back
   * to 1.79 against EFIT's 1.389.  Measured on a solved EAST field at the
   * same level: 181 points both sides, and R0 / a / kappa / delta_u /
   * delta_l all agreeing to 0.00e+0.  Equivalence first, repoint second.
   */
  function boundarySurface(grid, psi, psiAxis, psiBnd, axisR, axisZ,
                           limR, limZ, ntheta) {
    var lev = psiAxis + (psiBnd - psiAxis) * (1 - BOUNDARY_INSET);
    //: ★no silent fallback.  A page that forgot `useKernel()` would other-
    //: wise run the JS tracer instead — a second implementation, chosen by
    //: accident, agreeing with the kernel right up until it does not.  That
    //: is the shape D-4 exists to remove, so the absence of a kernel is an
    //: error rather than a quieter answer (the same rule the kernel applies
    //: to Pereverzev-Corrigan and to TGLF's unported branches).
    if (!KERNEL)
      throw new Error('FyPhys.boundarySurface: no kernel — call useKernel()');
    return KERNEL.traceSurface({
      r0: grid.r[0], z0: grid.z[0], dr: grid.dr, dz: grid.dz,
      nr: grid.nr, nz: grid.nz, psi: psi, level: lev,
      axisR: axisR, axisZ: axisZ, limR: limR, limZ: limZ,
      nTheta: ntheta || 181 }).poly;
  }

  // --- flux-surface geometry ----------------------------------------------
  //
  // Gauge, once: psi is FULL flux [Wb] with the axis at the maximum, so the
  // per-radian flux is psi/2pi.  x = (psi - psi_a)/(psi_b - psi_a).



  /**
   * F(x) = R*B_tor on each normalized-flux point, from the fitted FF' and
   * the vacuum value at the edge.
   *
   *   FF' = F dF/dpsi_rad,  dpsi_rad/dx = (psi_b - psi_a)/2pi = -span_pr
   *   => F^2(x) = F_edge^2 + 2 * span_pr * integral_x^1 FF'(t) dt
   *
   * F_edge is the machine's vacuum R0*B0: the forward model never sees F
   * (only FF' enters j_phi), so the toroidal field has to come in from
   * outside, and the vacuum value at the boundary is the standard choice.
   */
  function fProfile(x, ffprime, spanPr, fEdge) {
    if (!KERNEL)
      throw new Error('FyPhys.fProfile: no kernel — call useKernel()');
    return KERNEL.fProfile(x, ffprime, spanPr, fEdge);
  }




  /** Enclosed volume of a traced surface [m^3]: 2pi * closed R dR dZ. */
  /**
   * Volume enclosed by a closed outline [m^3].
   *
   * ★Same arrangement as `shapeMetrics`: the KERNEL when one is attached,
   * the JavaScript only for a host that has none — today the page thread,
   * where `useKernel()` has never been called.  One choice per host, not two
   * paths that can both run; and the kernel path is the one under test
   * (`fylite_rs_enclosed_volume`, ABI v39, with its own C-boundary test).
   *
   * ★The two disagree about degenerate input ON PURPOSE.  The kernel REFUSES
   * fewer than three points, because "no outline" is not "an outline
   * enclosing nothing"; this wrapper answers 0 for them, because its callers
   * draw a running total and an exception mid-frame would be worse than a
   * zero that is visibly zero.  The difference is stated rather than
   * smoothed over — when the page thread gets a kernel, whoever removes the
   * branch below has to decide which behaviour the page wants.
   */
  function surfaceVolume(poly) {
    //: ★the degenerate case is answered HERE, not by the kernel, and that is
    //: the decision the old comment asked whoever removed this branch to
    //: make.  The kernel refuses fewer than three points on the grounds that
    //: "no outline" is not "an outline enclosing nothing"; this caller draws
    //: a running total, where an exception mid-frame is worse than a zero
    //: that is visibly zero.  Both readings stand — the page picks the one
    //: its callers can act on.
    if (!poly || poly.length < 3) return 0;
    if (!KERNEL)
      throw new Error('FyPhys.surfaceVolume: no kernel — call useKernel()');
    return KERNEL.enclosedVolume(poly);
  }


  /**
   * Safety-factor profile of a solved equilibrium.
   *
   * q is traced on `nq` surfaces spread over normalized flux; q0 is a
   * linear extrapolation to the axis from the innermost traced pair (the
   * surface degenerates there), and q95 is interpolated at x = 0.95.
   *
   * VALIDATED, and the validation is the only reason this ships: fed a
   * reference equilibrium's own psi map and its own F profile, this
   * reproduces that equilibrium's own q to <= 0.72 % on ten surfaces from
   * x = 0.1 to 0.95.  The first version had R^2 where surfaceIntegrals()
   * now has R and came out 40-45 % low; the oracle is what caught it.
   *
   * Deliberately NOT computed here: beta_p, l_i and the stored energy.
   * Their definitions are not universal, and on the same reference field
   * the plausible ones land 10-30 % apart from the reference's own
   * reported values — a spread this page has no way to adjudicate.
   */
  /**
   * li(3) for a solved equilibrium — the kernel's integral, on the kernel's
   * gauge, with the caller's Ip and R0.
   */
  function li3(grid, res, ip, r0) {
    if (!KERNEL)
      throw new Error('FyPhys.li3: no kernel — call useKernel()');
    return KERNEL.li3({
      r0g: grid.r[0], z0g: grid.z[0], dr: grid.dr, dz: grid.dz,
      nr: grid.nr, nz: grid.nz, psi: res.psi,
      psiAxis: res.psiAxis, psiBnd: res.psiBnd, ip: ip, r0: r0 });
  }

  function qProfile(grid, res, prof, limR, limZ, fEdge, opts) {
    if (!KERNEL)
      throw new Error('FyPhys.qProfile: no kernel — call useKernel()');
    opts = opts || {};
    //: F(psi) is built here because it is the CALLER's profile — fProfile
    //: integrates the caller's own FF' with the caller's own gauge — and then
    //: handed over as a profile.  The conventions that follow (q0 by
    //: extrapolation, q95 by interpolation, the R exponent) are the kernel's
    //: and are stated there, once, so two callers' q0 remain comparable.
    var spanPr = (res.psiAxis - res.psiBnd) / (2 * Math.PI);
    var fArr = fProfile(prof.x, prof.ffprime, spanPr, fEdge);
    var r = KERNEL.qProfile({
      r0: grid.r[0], z0: grid.z[0], dr: grid.dr, dz: grid.dz,
      nr: grid.nr, nz: grid.nz, psi: res.psi,
      psiAxis: res.psiAxis, psiBnd: res.psiBnd,
      axisR: res.axisR, axisZ: res.axisZ, limR: limR, limZ: limZ,
      fx: prof.x, fv: fArr,
      nq: opts.nq || 20, nTheta: opts.ntheta || 121,
      xLo: 0.06, xHi: 1 - BOUNDARY_INSET });
    return { x: r.x, q: r.q, f: fArr, q0: r.q0, q95: r.q95 };
  }


  /**
   * R0 / a / kappa / delta of a closed outline.
   *
   * ★Prefers the KERNEL and keeps the JS path only for callers that have no
   * kernel attached — which today means the page thread, where `useKernel()`
   * has never been called (the worker owns the instance).  This is NOT the
   * silent fallback that was removed elsewhere in this file: there the two
   * paths could BOTH run and disagree unnoticed; here the choice is made once
   * per host and the kernel path is exercised headlessly by
   * `tests/app/validate-geqdsk.mjs`, so the copy is under a gate rather than
   * merely present.
   *
   * When the page thread gets a kernel (cost measured in
   * `docs/reference/notes/app-provenance.md`: 0.06 ms, ~1 MB per page), the `else`
   * branch and everything under it goes.
   */
  function shapeMetrics(poly) {
    if (!poly || !poly.length) return null;
    if (!KERNEL)
      throw new Error('FyPhys.shapeMetrics: no kernel — call useKernel()');
    return KERNEL.shapeMetrics(poly);
  }




  /**
   * Parametric target boundary (Miller-like) — the KERNEL's
   * (`surfaces::miller_boundary`).
   *
   * ★★This parametrisation had THREE hosts: the kernel, the Python design
   * layer, and this hand-written copy.  The kernel's original was never
   * exported, and that is what produced the other two — this layer
   * delegates for every function that HAS an export and hand-writes the
   * ones that do not, so a missing export is not a neutral fact about the
   * kernel, it is a second host over here.
   */
  function millerBoundary(p, n) {
    if (!KERNEL)
      throw new Error('FyPhys.millerBoundary: no kernel — call FyPhys.useKernel()');
    return KERNEL.millerBoundary(p, n || 121);
  }

  // --- small dense linear algebra (12 unknowns) ----------------------------

  /** Solve the SPD system A x = b in place by Cholesky; null if not SPD. */
  // ★Both of these are the KERNEL's now (FYL-DESIGN-07 D-4).  They used to
  // be ~60 lines of Cholesky and normal-equations assembly here; the same
  // algorithm living in two places is what D-4 exists to stop, and the ridge
  // term in particular carries a lesson (a near-collinear basis squared its
  // condition number and put two answers 1e-3 apart) that should be written
  // down once.
  //
  // The kernel instance is supplied by the caller rather than held here:
  // this file is loaded on pages that never build one.

  function ridgeLstsq(a, b, w, nrow, ncol, lambda) {
    if (!KERNEL) throw new Error('FyPhys: no kernel — call FyPhys.useKernel()');
    return KERNEL.ridgeLstsq(a, b, w, nrow, ncol, lambda);
  }

  root.FyPhys = {
    MU0: MU0, useKernel: useKernel,
    makeGrid: makeGrid, sample: sample, bField: bField,
    coilGridResponse: coilGridResponse, coilPointResponse: coilPointResponse,
    gridChannelResponse: gridChannelResponse,
    combine: combine, loopResponse: loopResponse,
    plasmaMask: plasmaMask, analyticShape: analyticShape,
    fittedCurrent: fittedCurrent, fittedCurrentAnalytic: fittedCurrentAnalytic,
    loopModel: loopModel,
    totalCurrent: totalCurrent,
    analyticTruth: analyticTruth, fittedProfiles: fittedProfiles, boundarySurface: boundarySurface, fProfile: fProfile, surfaceVolume: surfaceVolume,
    qProfile: qProfile, li3: li3,
    BOUNDARY_INSET: BOUNDARY_INSET, shapeMetrics: shapeMetrics,
    millerBoundary: millerBoundary,
    ridgeLstsq: ridgeLstsq,
  };

})(typeof self !== 'undefined' ? self : globalThis);
