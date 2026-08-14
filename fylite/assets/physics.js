// Physics helpers around the fylite wasm core.
//
// Everything numerically heavy (Green's functions, the Grad-Shafranov
// solves, the reconstruction fit) is done by the wasm binary.  What lives
// here is the bookkeeping the C ABI leaves to the caller: building the
// grid, assembling response matrices from the kernel calls, sampling the
// solved field, tracing contours for the plots, and the small (12-unknown)
// coil-current least squares of the shape-design loop.
//
// Conventions match the Rust side: psi is FULL flux [Wb] with the axis at
// the maximum, fields are row-major [i * nz + j] with i the R index, and
// coil currents are TOTAL element currents [A] (per-turn current x turns).

(function (root) {
  'use strict';

  var MU0 = 4.0e-7 * Math.PI;

  // --- grid ---------------------------------------------------------------

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
  function sample(grid, f, r, z) {
    var i = (r - grid.r[0]) / grid.dr, j = (z - grid.z[0]) / grid.dz;
    var i0 = Math.floor(i), j0 = Math.floor(j);
    if (i0 < 0 || j0 < 0 || i0 >= grid.nr - 1 || j0 >= grid.nz - 1) return NaN;
    var u = i - i0, v = j - j0, nz = grid.nz;
    return (1 - u) * (1 - v) * f[i0 * nz + j0]
         + u * (1 - v) * f[(i0 + 1) * nz + j0]
         + (1 - u) * v * f[i0 * nz + j0 + 1]
         + u * v * f[(i0 + 1) * nz + j0 + 1];
  }

  /** (Br, Bz) from a psi field by central differences [T]. */
  function bField(grid, psi, r, z) {
    var h = 0.5 * Math.min(grid.dr, grid.dz);
    var dpr = (sample(grid, psi, r + h, z) - sample(grid, psi, r - h, z))
              / (2 * h);
    var dpz = (sample(grid, psi, r, z + h) - sample(grid, psi, r, z - h))
              / (2 * h);
    return { br: -dpz / (2 * Math.PI * r), bz: dpr / (2 * Math.PI * r) };
  }

  /** Even-odd polygon test — the same rule the Rust mask uses. */
  function insidePolygon(r, z, pr, pz) {
    var inside = false, n = pr.length, j = n - 1;
    for (var i = 0; i < n; i++) {
      if ((pz[i] > z) !== (pz[j] > z)) {
        var xc = (pr[j] - pr[i]) * (z - pz[i]) / (pz[j] - pz[i]) + pr[i];
        if (r < xc) inside = !inside;
      }
      j = i;
    }
    return inside;
  }

  // --- response matrices (wasm kernels) -----------------------------------

  /**
   * Per-coil psi/Br/Bz response over the whole grid, per unit total
   * element current.  Returns {psi, br, bz} each row-major (ncoil, nr*nz).
   */
  function coilGridResponse(fy, coils, grid, nu, nv) {
    var n = grid.nr * grid.nz;
    var pr = new Float64Array(n), pz = new Float64Array(n);
    for (var i = 0; i < grid.nr; i++)
      for (var j = 0; j < grid.nz; j++) {
        pr[i * grid.nz + j] = grid.r[i];
        pz[i * grid.nz + j] = grid.z[j];
      }
    return fy.elementResponse(coils, pr, pz, nu || 6, nv || 6);
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
    var n = grid.nr * grid.nz, nl = loops.length;
    var out = new Float64Array(nl * n);
    var gr = new Float64Array(n), gz = new Float64Array(n);
    for (var i = 0; i < grid.nr; i++)
      for (var j = 0; j < grid.nz; j++) {
        gr[i * grid.nz + j] = grid.r[i];
        gz[i * grid.nz + j] = grid.z[j];
      }
    var lr = new Float64Array(n), lz = new Float64Array(n);
    for (var d = 0; d < nl; d++) {
      lr.fill(loops[d][0]);
      lz.fill(loops[d][1]);
      out.set(fy.mutualFilaments(lr, lz, gr, gz), d * n);
    }
    return out;
  }

  /**
   * psi/Br/Bz at scattered points from a set of toroidal current
   * filaments, per the same kernel (used for the plasma term of the first
   * shape-design pass, before a field exists to sample).
   */
  function filamentResponse(fy, fr, fz, pr, pz) {
    var npts = pr.length, nf = fr.length, h = 1e-4;
    var psi = new Float64Array(npts), br = new Float64Array(npts),
        bz = new Float64Array(npts);
    var a = new Float64Array(nf), b = new Float64Array(nf);
    for (var i = 0; i < npts; i++) {
      var r = pr[i], z = pz[i];
      var m = function (rr, zz) {
        a.fill(rr); b.fill(zz);
        var v = fy.mutualFilaments(a, b, fr, fz), s = 0;
        for (var q = 0; q < nf; q++) s += v[q];
        return s;
      };
      psi[i] = m(r, z);
      bz[i] = (m(r + h, z) - m(r - h, z)) / (2 * h) / (2 * Math.PI * r);
      br[i] = -(m(r, z + h) - m(r, z - h)) / (2 * h) / (2 * Math.PI * r);
    }
    return { psi: psi, br: br, bz: bz };
  }

  // --- plasma mask / analytic profile bookkeeping --------------------------

  /**
   * Flood-fill plasma mask over the interior cells, replicating the rule
   * the solvers use: limiter-interior nodes with s*psi above s*psi_bnd,
   * connected to the axis.  Returns a Uint8Array over (nr-2, nz-2).
   */
  function plasmaMask(grid, psi, psiAxis, psiBnd, limR, limZ, sign) {
    var nr = grid.nr, nz = grid.nz, mi = nr - 2, mj = nz - 2, s = sign || 1;
    var inVessel = new Uint8Array(nr * nz);
    for (var i = 0; i < nr; i++)
      for (var j = 0; j < nz; j++)
        inVessel[i * nz + j] = insidePolygon(grid.r[i], grid.z[j], limR, limZ)
                               ? 1 : 0;
    // axis node = extremum of s*psi over vessel-interior nodes
    var ax = -1, best = -Infinity;
    for (i = 1; i < nr - 1; i++)
      for (j = 1; j < nz - 1; j++) {
        if (!inVessel[i * nz + j]) continue;
        var v = s * psi[i * nz + j];
        if (v > best) { best = v; ax = i * nz + j; }
      }
    var mask = new Uint8Array(mi * mj);
    if (ax < 0) return mask;
    var stack = [[(ax / nz | 0) - 1, (ax % nz) - 1]];
    while (stack.length) {
      var c = stack.pop(), ci = c[0], cj = c[1];
      if (ci < 0 || cj < 0 || ci >= mi || cj >= mj) continue;
      if (mask[ci * mj + cj]) continue;
      if (!inVessel[(ci + 1) * nz + (cj + 1)]) continue;
      if (s * psi[(ci + 1) * nz + (cj + 1)] <= s * psiBnd) continue;
      mask[ci * mj + cj] = 1;
      stack.push([ci - 1, cj], [ci, cj - 1], [ci + 1, cj], [ci, cj + 1]);
    }
    return mask;
  }

  /** Analytic shape factor S(R, x) — the Rust AnalyticProfile. */
  function analyticShape(prof, r, x) {
    var base = 1.0 - Math.pow(x, prof.emp);
    if (base <= 0) return 0;
    return (prof.beta0 * r / prof.r0 + (1 - prof.beta0) * prof.r0 / r)
           * Math.pow(base, prof.enp);
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
    var mask = plasmaMask(grid, res.psi, res.psiAxis, res.psiBnd, limR, limZ,
                          1);
    var nz = grid.nz, mi = grid.nr - 2, mj = nz - 2;
    var da = grid.dr * grid.dz, span = res.psiBnd - res.psiAxis, total = 0;
    for (var i = 0; i < mi; i++) {
      var r = grid.r[i + 1];
      for (var j = 0; j < mj; j++) {
        if (!mask[i * mj + j]) continue;
        var x = (res.psi[(i + 1) * nz + (j + 1)] - res.psiAxis) / span;
        x = x < 0 ? 0 : (x > 1 ? 1 : x);
        total += analyticShape(prof, r, x) * da;
      }
    }
    var jc = total === 0 ? 0 : res.ip / total;
    var spanPr = (res.psiAxis - res.psiBnd) / (2 * Math.PI);
    var ppScale = jc * prof.beta0 / prof.r0;
    var ffScale = MU0 * jc * (1 - prof.beta0) * prof.r0;
    var shape = function (x) {
      var b = 1 - Math.pow(x, prof.emp);
      return b <= 0 ? 0 : Math.pow(b, prof.enp);
    };
    // p(x) by the trapezoid rule on a fine grid, integrated from the edge
    var m = nx || 201, xs = new Float64Array(m), pp = new Float64Array(m),
        ffp = new Float64Array(m), p = new Float64Array(m);
    for (var q = 0; q < m; q++) {
      xs[q] = q / (m - 1);
      pp[q] = ppScale * shape(xs[q]);
      ffp[q] = ffScale * shape(xs[q]);
    }
    var acc = 0, h = 1 / (m - 1);
    p[m - 1] = 0;
    for (q = m - 2; q >= 0; q--) {
      acc += 0.5 * (pp[q] + pp[q + 1]) * h;
      p[q] = spanPr * acc;
    }
    return { jc: jc, spanPr: spanPr, x: xs, pprime: pp, ffprime: ffp,
             p: p, mask: mask,
             pAt: function (xq) {
               var t = xq * (m - 1), k = Math.min(m - 2, Math.max(0, t | 0));
               return p[k] + (t - k) * (p[k + 1] - p[k]);
             } };
  }

  /**
   * Evaluate the fitted polynomial channels of a reconstruction.
   * `coefs` is [p'_0..p'_{npp-1}, FF'_0..FF'_{nff-1}] in the reduced
   * (edge-zero) basis x^k - x^n used by the Rust fit.
   */
  function fittedProfiles(coefs, npp, nff, psiAxis, psiBnd, nx) {
    var m = nx || 201, xs = new Float64Array(m), pp = new Float64Array(m),
        ffp = new Float64Array(m), p = new Float64Array(m);
    for (var q = 0; q < m; q++) {
      var x = q / (m - 1), sp = 0, sf = 0, xk = 1;
      xs[q] = x;
      for (var k = 0; k < Math.max(npp, nff); k++) {
        if (k < npp) sp += coefs[k] * (xk - Math.pow(x, npp));
        if (k < nff) sf += coefs[npp + k] * (xk - Math.pow(x, nff));
        xk *= x;
      }
      pp[q] = sp; ffp[q] = sf;
    }
    var spanPr = (psiAxis - psiBnd) / (2 * Math.PI);
    var acc = 0, h = 1 / (m - 1);
    p[m - 1] = 0;
    for (q = m - 2; q >= 0; q--) {
      acc += 0.5 * (pp[q] + pp[q + 1]) * h;
      p[q] = spanPr * acc;
    }
    return { x: xs, pprime: pp, ffprime: ffp, p: p, spanPr: spanPr };
  }

  /**
   * The toroidal current the fitted coefficients imply, cell by cell over
   * the interior (nr-2, nz-2) — the same expression the Rust fit uses to
   * close its own loop, recomputed here so the page can forward-model the
   * flux loops and show how well the reconstruction fits its data.
   */
  function fittedCurrent(grid, psi, psiAxis, psiBnd, coefs, npp, nff, mask) {
    var nz = grid.nz, mi = grid.nr - 2, mj = nz - 2;
    var da = grid.dr * grid.dz, span = psiBnd - psiAxis;
    var cur = new Float64Array(mi * mj);
    for (var i = 0; i < mi; i++) {
      var r = grid.r[i + 1];
      for (var j = 0; j < mj; j++) {
        if (!mask[i * mj + j]) continue;
        var x = (psi[(i + 1) * nz + (j + 1)] - psiAxis) / span;
        x = x < 0 ? 0 : (x > 1 ? 1 : x);
        var xtp = Math.pow(x, npp), xtf = Math.pow(x, nff), xk = 1, jphi = 0;
        for (var k = 0; k < Math.max(npp, nff); k++) {
          if (k < npp) jphi += coefs[k] * r * (xk - xtp);
          if (k < nff) jphi += coefs[npp + k] * (xk - xtf) / (MU0 * r);
          xk *= x;
        }
        cur[i * mj + j] = jphi * da;
      }
    }
    return cur;
  }

  /**
   * The current distribution a free-boundary solve settled on, rebuilt
   * from its converged field and the analytic profile it was given (the
   * ABI returns the field, not the current).  `truth` comes from
   * analyticTruth() and carries the mask and the normalization j_c.
   */
  function fittedCurrentAnalytic(grid, res, prof, truth) {
    var nz = grid.nz, mi = grid.nr - 2, mj = nz - 2;
    var da = grid.dr * grid.dz, span = res.psiBnd - res.psiAxis;
    var cur = new Float64Array(mi * mj);
    for (var i = 0; i < mi; i++) {
      var r = grid.r[i + 1];
      for (var j = 0; j < mj; j++) {
        if (!truth.mask[i * mj + j]) continue;
        var x = (res.psi[(i + 1) * nz + (j + 1)] - res.psiAxis) / span;
        x = x < 0 ? 0 : (x > 1 ? 1 : x);
        cur[i * mj + j] = truth.jc * analyticShape(prof, r, x) * da;
      }
    }
    return cur;
  }

  /** Forward-model the flux loops from an interior cell-current vector. */
  function loopModel(loopsM, cur, grid, measScale) {
    var nz = grid.nz, mi = grid.nr - 2, mj = nz - 2, ng = grid.nr * nz;
    var nl = loopsM.length / ng, out = new Float64Array(nl);
    for (var d = 0; d < nl; d++) {
      var off = d * ng, s = 0;
      for (var i = 0; i < mi; i++)
        for (var j = 0; j < mj; j++)
          s += loopsM[off + (i + 1) * nz + (j + 1)] * cur[i * mj + j];
      out[d] = s * measScale;
    }
    return out;
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
  function contour(grid, f, level) {
    var nr = grid.nr, nz = grid.nz, segs = [];
    var ip = function (va, vb, a, b) { return a + (b - a) * (level - va) / (vb - va); };
    for (var i = 0; i < nr - 1; i++) {
      for (var j = 0; j < nz - 1; j++) {
        var v0 = f[i * nz + j], v1 = f[(i + 1) * nz + j],
            v2 = f[(i + 1) * nz + j + 1], v3 = f[i * nz + j + 1];
        var idx = (v0 > level ? 1 : 0) | (v1 > level ? 2 : 0)
                | (v2 > level ? 4 : 0) | (v3 > level ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        var r0 = grid.r[i], r1 = grid.r[i + 1],
            z0 = grid.z[j], z1 = grid.z[j + 1];
        var pts = [];
        if ((idx & 1) !== ((idx >> 1) & 1)) pts.push([ip(v0, v1, r0, r1), z0]);
        if (((idx >> 1) & 1) !== ((idx >> 2) & 1)) pts.push([r1, ip(v1, v2, z0, z1)]);
        if (((idx >> 2) & 1) !== ((idx >> 3) & 1)) pts.push([ip(v3, v2, r0, r1), z1]);
        if (((idx >> 3) & 1) !== (idx & 1)) pts.push([r0, ip(v0, v3, z0, z1)]);
        for (var q = 0; q + 1 < pts.length; q += 2)
          segs.push(pts[q][0], pts[q][1], pts[q + 1][0], pts[q + 1][1]);
      }
    }
    return segs;
  }

  /**
   * Closed last-closed-flux-surface polygon: the level set of psi_bnd
   * traced around the axis by ray casting, which gives an ORDERED
   * outline (the marching-squares soup does not) and is what the shape
   * metrics and the design target want.
   *
   * X-POINT GUARD.  A ray aimed straight at a saddle keeps s*psi above
   * s*psi_bnd all the way to the X point, so it reports a radius far
   * beyond where its neighbours stop: r(theta) measured from the axis is
   * simply not a usable parameterization of a separatrix corner, and a
   * single ray threading the neck comes back as a needle in the outline.
   * Measured on the bundled shot: one ray out of 181 (theta = -109 deg)
   * returned r = 0.986 m against neighbours at 0.745 / 0.748, dragging
   * z_min to -0.948 m and kappa to 1.79 — an artefact, not a shape.
   *
   * The excursion is rejected on a resolution argument, not a taste one:
   * psi lives on a 25 mm grid, while this tracer steps 6 mm and then
   * bisects 40 times, so any channel it can follow but its neighbours
   * cannot is bilinear-interpolation detail below the resolution of the
   * field itself.  A neck that IS resolved widens over several rays, its
   * neighbours grow with it, and the relative test below leaves it alone.
   */
  function lcfs(grid, psi, psiAxis, psiBnd, axisR, axisZ, limR, limZ, ntheta) {
    var n = ntheta || 181;
    var rmax = Math.max(grid.r[grid.nr - 1] - axisR, axisR - grid.r[0]);
    var zmax = Math.max(grid.z[grid.nz - 1] - axisZ, axisZ - grid.z[0]);
    var span = Math.hypot(rmax, zmax);
    var rad = new Float64Array(n), cs = new Float64Array(n),
        sn = new Float64Array(n);
    for (var q = 0; q < n; q++) {
      var th = 2 * Math.PI * q / n, cr = Math.cos(th), cz = Math.sin(th);
      cs[q] = cr; sn[q] = cz;
      var lo = 0, hi = 0, step = 0.25 * Math.min(grid.dr, grid.dz), found = false;
      for (var t = step; t <= span; t += step) {
        var v = sample(grid, psi, axisR + cr * t, axisZ + cz * t);
        if (!isFinite(v) || v <= psiBnd
            || !insidePolygon(axisR + cr * t, axisZ + cz * t, limR, limZ)) {
          lo = t - step; hi = t; found = true; break;
        }
      }
      if (!found) { rad[q] = NaN; continue; }
      for (var k = 0; k < 40; k++) {
        var mid = 0.5 * (lo + hi), rr = axisR + cr * mid, zz = axisZ + cz * mid;
        var vv = sample(grid, psi, rr, zz);
        if (isFinite(vv) && vv > psiBnd && insidePolygon(rr, zz, limR, limZ))
          lo = mid;
        else hi = mid;
      }
      rad[q] = lo;
    }
    clipNeckExcursions(rad, n);
    var out = [];
    for (q = 0; q < n; q++)
      if (isFinite(rad[q]))
        out.push([axisR + cs[q] * rad[q], axisZ + sn[q] * rad[q]]);
    return out;
  }

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
  function boundarySurface(grid, psi, psiAxis, psiBnd, axisR, axisZ,
                           limR, limZ, ntheta) {
    var lev = psiAxis + (psiBnd - psiAxis) * (1 - BOUNDARY_INSET);
    return lcfs(grid, psi, psiAxis, lev, axisR, axisZ, limR, limZ, ntheta);
  }

  var NECK_TOL = 1.25;
  function clipNeckExcursions(rad, n) {
    if (n < 7) return;
    for (var pass = 0; pass < 2; pass++) {
      var src = rad.slice(), changed = false;
      for (var i = 0; i < n; i++) {
        if (!isFinite(src[i])) continue;
        var win = [];
        for (var d = -2; d <= 2; d++) {
          if (d === 0) continue;
          var v = src[(i + d + n) % n];
          if (isFinite(v)) win.push(v);
        }
        if (win.length < 3) continue;
        win.sort(function (a, b) { return a - b; });
        var med = win[win.length >> 1];
        if (src[i] > NECK_TOL * med) { rad[i] = med; changed = true; }
      }
      if (!changed) break;
    }
  }

  // --- flux-surface geometry ----------------------------------------------
  //
  // Gauge, once: psi is FULL flux [Wb] with the axis at the maximum, so the
  // per-radian flux is psi/2pi.  x = (psi - psi_a)/(psi_b - psi_a).

  /** |grad psi| at a point, by central differences [Wb/m]. */
  function gradPsiMag(grid, psi, r, z) {
    var h = 0.5 * Math.min(grid.dr, grid.dz);
    var dr = (sample(grid, psi, r + h, z) - sample(grid, psi, r - h, z)) / (2 * h);
    var dz = (sample(grid, psi, r, z + h) - sample(grid, psi, r, z - h)) / (2 * h);
    return Math.hypot(dr, dz);
  }

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
    var m = x.length, f = new Float64Array(m), acc = 0;
    f[m - 1] = Math.abs(fEdge);
    for (var i = m - 2; i >= 0; i--) {
      acc += 0.5 * (ffprime[i] + ffprime[i + 1]) * (x[i + 1] - x[i]);
      var f2 = fEdge * fEdge + 2 * spanPr * acc;
      f[i] = f2 > 0 ? Math.sqrt(f2) : 0;
    }
    return f;
  }

  /**
   * Safety factor on a traced surface.  Derived rather than quoted, because
   * the quoted forms differ by powers of R depending on how the flux label
   * is normalized:
   *
   *   between two surfaces, dn = dpsi_rad / |grad psi_rad|, so
   *   dPhi_tor = closed B_phi dl dn = dpsi_rad * closed (F/R) dl/|grad psi_rad|
   *   q = dPhi_tor / dPsi_pol,  Psi_pol = 2 pi psi_rad
   *     = (1/2pi) closed F dl / (R |grad psi_rad|)
   *     = F * closed dl / (R |grad psi_full|)          [psi_full = 2 pi psi_rad]
   *
   * Cylindrical check, which is what pinned the exponent: a circular surface
   * has |grad psi_rad| = R B_p and closed dl = 2 pi a, giving q = a F/(R^2 B_p)
   * = a B_phi/(R B_p) — the textbook value.  Writing R^2 in the integrand
   * instead lands on a F/(R^3 B_p) and comes out ~1.8x low on EAST; that WAS
   * the first version here, and the g-file oracle below caught it.
   *
   * Also returns the surface's poloidal circumference.  Null for a surface
   * too small to trace.
   */
  function surfaceIntegrals(grid, psi, poly) {
    if (!poly || poly.length < 8) return null;
    var gq = 0, per = 0;
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      var dl = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!(dl > 0)) continue;
      var rm = 0.5 * (a[0] + b[0]), zm = 0.5 * (a[1] + b[1]);
      var g = gradPsiMag(grid, psi, rm, zm);
      per += dl;
      if (g > 0) gq += dl / (rm * g);
    }
    return { gq: gq, perimeter: per };
  }

  /** Enclosed volume of a traced surface [m^3]: 2pi * closed R dR dZ. */
  function surfaceVolume(poly) {
    if (!poly || poly.length < 3) return 0;
    var s = 0;
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      s += (b[1] - a[1]) * (a[0] * a[0] + a[0] * b[0] + b[0] * b[0]) / 6;
    }
    return Math.abs(2 * Math.PI * s);
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
  function qProfile(grid, res, prof, limR, limZ, fEdge, opts) {
    opts = opts || {};
    var nq = opts.nq || 20, nth = opts.ntheta || 121;
    var spanPr = (res.psiAxis - res.psiBnd) / (2 * Math.PI);
    var m = prof.x.length;
    var fArr = fProfile(prof.x, prof.ffprime, spanPr, fEdge);
    var interp = function (arr, xq) {
      var t = xq * (m - 1), k = Math.min(m - 2, Math.max(0, t | 0));
      return arr[k] + (t - k) * (arr[k + 1] - arr[k]);
    };
    var xs = [], qs = [];
    var xLo = 0.06, xHi = 1 - BOUNDARY_INSET;
    for (var k = 0; k < nq; k++) {
      var x = xLo + (xHi - xLo) * k / (nq - 1);
      var lev = res.psiAxis + (res.psiBnd - res.psiAxis) * x;
      var poly = lcfs(grid, res.psi, res.psiAxis, lev, res.axisR, res.axisZ,
                      limR, limZ, nth);
      var si = surfaceIntegrals(grid, res.psi, poly);
      if (!si || !(si.gq > 0)) continue;
      xs.push(x);
      qs.push(interp(fArr, x) * si.gq);
    }
    var q0 = NaN, q95 = NaN;
    if (xs.length >= 2) {
      q0 = qs[0] + (qs[1] - qs[0]) * (0 - xs[0]) / (xs[1] - xs[0]);
      for (var i = 0; i + 1 < xs.length; i++) {
        if (xs[i] <= 0.95 && xs[i + 1] >= 0.95) {
          q95 = qs[i] + (qs[i + 1] - qs[i]) * (0.95 - xs[i])
                / (xs[i + 1] - xs[i]);
          break;
        }
      }
      if (!isFinite(q95)) q95 = qs[qs.length - 1];
    }
    return { x: Float64Array.from(xs), q: Float64Array.from(qs),
             f: fArr, q0: q0, q95: q95 };
  }

  /** R0 / a / kappa / delta of a closed outline. */
  function shapeMetrics(poly) {
    if (!poly.length) return null;
    var rmin = Infinity, rmax = -Infinity, zmin = Infinity, zmax = -Infinity,
        rzmax = 0, rzmin = 0;
    for (var i = 0; i < poly.length; i++) {
      var r = poly[i][0], z = poly[i][1];
      if (r < rmin) rmin = r;
      if (r > rmax) rmax = r;
      if (z > zmax) { zmax = z; rzmax = r; }
      if (z < zmin) { zmin = z; rzmin = r; }
    }
    var r0 = 0.5 * (rmin + rmax), a = 0.5 * (rmax - rmin);
    return { r0: r0, a: a, kappa: 0.5 * (zmax - zmin) / a,
             deltaU: (r0 - rzmax) / a, deltaL: (r0 - rzmin) / a,
             delta: 0.5 * ((r0 - rzmax) + (r0 - rzmin)) / a,
             rmin: rmin, rmax: rmax, zmin: zmin, zmax: zmax };
  }

  /** Parametric target boundary (Miller-like) for the design page. */
  function millerBoundary(p, n) {
    var m = n || 121, out = [];
    for (var q = 0; q < m; q++) {
      var th = 2 * Math.PI * q / m;
      var d = th > 0 && th < Math.PI ? p.deltaU : p.deltaL;
      out.push([p.r0 + p.a * Math.cos(th + Math.asin(d) * Math.sin(th)),
                p.z0 + p.a * p.kappa * Math.sin(th)]);
    }
    return out;
  }

  // --- small dense linear algebra (12 unknowns) ----------------------------

  /** Solve the SPD system A x = b in place by Cholesky; null if not SPD. */
  function cholSolve(a, b, n) {
    var l = a.slice();
    for (var i = 0; i < n; i++) {
      for (var j = 0; j <= i; j++) {
        var s = l[i * n + j];
        for (var k = 0; k < j; k++) s -= l[i * n + k] * l[j * n + k];
        if (i === j) {
          if (s <= 0) return null;
          l[i * n + i] = Math.sqrt(s);
        } else {
          l[i * n + j] = s / l[j * n + j];
        }
      }
    }
    var y = new Float64Array(n);
    for (i = 0; i < n; i++) {
      s = b[i];
      for (k = 0; k < i; k++) s -= l[i * n + k] * y[k];
      y[i] = s / l[i * n + i];
    }
    var x = new Float64Array(n);
    for (i = n - 1; i >= 0; i--) {
      s = y[i];
      for (k = i + 1; k < n; k++) s -= l[k * n + i] * x[k];
      x[i] = s / l[i * n + i];
    }
    return x;
  }

  /** min ||W(Ax - b)||^2 + sum_k lambda_k x_k^2, A row-major (nrow, ncol). */
  function ridgeLstsq(a, b, w, nrow, ncol, lambda) {
    var n = new Float64Array(ncol * ncol), rhs = new Float64Array(ncol);
    for (var r = 0; r < nrow; r++) {
      var w2 = w[r] * w[r];
      if (!w2) continue;
      for (var i = 0; i < ncol; i++) {
        var ai = a[r * ncol + i];
        if (!ai) continue;
        rhs[i] += w2 * ai * b[r];
        for (var j = 0; j <= i; j++)
          n[i * ncol + j] += w2 * ai * a[r * ncol + j];
      }
    }
    for (i = 0; i < ncol; i++) {
      for (j = 0; j < i; j++) n[j * ncol + i] = n[i * ncol + j];
      n[i * ncol + i] += lambda[i] * lambda[i];
    }
    return cholSolve(n, rhs, ncol);
  }

  root.FyPhys = {
    MU0: MU0,
    makeGrid: makeGrid, sample: sample, bField: bField,
    insidePolygon: insidePolygon,
    coilGridResponse: coilGridResponse, coilPointResponse: coilPointResponse,
    combine: combine, loopResponse: loopResponse,
    filamentResponse: filamentResponse,
    plasmaMask: plasmaMask, analyticShape: analyticShape,
    fittedCurrent: fittedCurrent, fittedCurrentAnalytic: fittedCurrentAnalytic,
    loopModel: loopModel,
    totalCurrent: totalCurrent,
    analyticTruth: analyticTruth, fittedProfiles: fittedProfiles,
    contour: contour, lcfs: lcfs, boundarySurface: boundarySurface,
    gradPsiMag: gradPsiMag, fProfile: fProfile,
    surfaceIntegrals: surfaceIntegrals, surfaceVolume: surfaceVolume,
    qProfile: qProfile,
    BOUNDARY_INSET: BOUNDARY_INSET, shapeMetrics: shapeMetrics,
    millerBoundary: millerBoundary,
    cholSolve: cholSolve, ridgeLstsq: ridgeLstsq,
  };
})(typeof self !== 'undefined' ? self : globalThis);
