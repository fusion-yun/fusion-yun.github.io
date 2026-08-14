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

  // Minimum ABI carrying every entry point below.  The version is bumped
  // on ANY export-signature change, including purely additive ones, so a
  // NEWER binary is accepted — what would break these pages is an older
  // one, or a removed export, and the latter surfaces as a missing
  // function at the call site rather than as a version number.
  var ABI_MIN = 14;

  var REQUIRED = [
    'fylite_rs_alloc', 'fylite_rs_free', 'fylite_rs_ping',
    'fylite_rs_ellipke', 'fylite_rs_mutual_filaments',
    'fylite_rs_element_response', 'fylite_rs_gs_free_solve',
    'fylite_rs_gs_inverse_solve', 'fylite_rs_boundary_flux',
    'fylite_rs_evolve_circuits', 'memory',
  ];

  function Fy(instance) {
    this.e = instance.exports;
    this.abi = this.e.fylite_rs_abi_version();
    if (this.abi < ABI_MIN) {
      throw new Error('fylite wasm ABI v' + this.abi + ' 过旧，本页需要 v' +
                      ABI_MIN + ' 及以上');
    }
    var missing = REQUIRED.filter(function (n) { return !(n in this.e); }, this);
    if (missing.length) {
      throw new Error('fylite wasm 缺少导出：' + missing.join(', '));
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
  Fy.prototype.gsFreeSolve = function (o) {
    var self = this, nr = o.r.length, nz = o.z.length, nlim = o.limR.length;
    var total = nr * nz;
    return this.scope(function (s) {
      var r = s.put(o.r), z = s.put(o.z), pe = s.put(o.psiExt),
          lr = s.put(o.limR), lz = s.put(o.limZ),
          psi = s.zeros(total), out = s.zeros(12);
      var it = self.e.fylite_rs_gs_free_solve(
        r.ptr, BigInt(nr), z.ptr, BigInt(nz), pe.ptr,
        o.beta0, o.emp, o.enp, o.r0, o.ip, lr.ptr, lz.ptr, BigInt(nlim),
        num(o.signAxis, 1), num(o.relax, 0.3), BigInt(o.maxIter || 400),
        num(o.tol, 1e-8), num(o.fbGain, 0),
        o.zcAnchor === undefined ? NaN : o.zcAnchor,
        o.rcAnchor === undefined ? NaN : o.rcAnchor,
        psi.ptr, out.ptr);
      if (it < 0) throw new SolveError('fylite_rs_gs_free_solve', it);
      var v = s.get(out);
      return { psi: s.get(psi), iterations: it, psiAxis: v[0], psiBnd: v[1],
               axisR: v[2], axisZ: v[3], ip: v[4], residual: v[5],
               bndKind: v[6], xptR: v[7], xptZ: v[8], fbAmp: v[9],
               zc: v[10] };
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
          psi = s.zeros(total), cf = s.zeros(nc), out = s.zeros(12);
      var it = self.e.fylite_rs_gs_inverse_solve(
        r.ptr, BigInt(nr), z.ptr, BigInt(nz), pe.ptr,
        lm.ptr, me.ptr, wt.ptr, BigInt(nl), num(o.measScale, 1),
        BigInt(o.npp), BigInt(o.nff), o.ip,
        lr.ptr, lz.ptr, BigInt(nlim),
        xp.ptr, pm.ptr, wp.ptr, BigInt(np_),
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

  // --- errors -------------------------------------------------------------

  function SolveError(fn, code) {
    this.name = 'SolveError';
    this.code = code;
    this.message = fn + ' failed: ' + explain(code) + ' (code ' + code + ')';
  }
  SolveError.prototype = Object.create(Error.prototype);

  function explain(code) {
    switch (code) {
      case -1: return '空指针或缓冲区长度不符';
      case -2: return '参数越界（网格过小或尺寸溢出）';
      case -4: return '电路矩阵非正定';
      case -5: return '磁通跨度退化（等离子体未成形）';
      case -6: return '电流掩膜为空';
      case -7: return '限制器未包含任何网格节点';
      default:
        if (code <= -100000) {
          var it = Math.floor((-code - 100000) / 100);
          return '第 ' + it + ' 次外迭代拟合发散（法方程奇异）';
        }
        return '未知错误';
    }
  }

  function num(v, dflt) { return v === undefined || v === null ? dflt : v; }

  // --- loader --------------------------------------------------------------

  /** Instantiate from raw bytes (ArrayBuffer / TypedArray). */
  function fromBytes(bytes) {
    return WebAssembly.instantiate(bytes, {}).then(function (m) {
      return new Fy(m.instance);
    });
  }

  /**
   * Fetch and instantiate.  Deliberately NOT instantiateStreaming: some
   * static hosts serve .wasm with the wrong Content-Type and streaming
   * then fails where the buffered path does not.
   */
  function load(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('fetch ' + url + ': HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(fromBytes);
  }

  root.FyLite = { load: load, fromBytes: fromBytes, ABI_MIN: ABI_MIN,
                  SolveError: SolveError };
})(typeof self !== 'undefined' ? self : globalThis);
