// GEQDSK (EFIT g-file) reader / writer.
//
// The g-file is the lingua franca for tokamak equilibria: plain text, five
// numbers per line in `%16.9E`, no dependencies.  That is why this page
// speaks it rather than a binary container.
//
// GAUGE — the one thing that makes or breaks a g-file exchange.  This app
// carries psi as FULL flux [Wb] with the axis at the MAXIMUM; the g-file
// carries poloidal flux per radian with the axis at the minimum:
//
//     psirz  = -psi_full / (2 pi)          simag = -psi_axis / (2 pi)
//     sibry  = -psi_bnd  / (2 pi)
//
// and because d/dpsi_gfile = -d/dpsi_rad, the derivative profiles flip too:
//
//     pprime_gfile = -p'_app            ffprim_gfile = -FF'_app
//
// Every one of these was verified against a real g-file rather than assumed
// (see tests/app/validate-geqdsk.mjs).
//
// Array order: the g-file writes ((psirz(i,j), i=1,nw), j=1,nh) — R fastest.
// This app stores fields row-major as [i * nz + j] with i the R index.

(function (root) {
  'use strict';

  var T = root.FyI18n.t;

  var TWO_PI = 2 * Math.PI;

  // --- reading ------------------------------------------------------------

  /**
   * Parse a g-file.  Returns the same field names fylite's own
   * `geqdsk.read_geqdsk` returns, so the two can be compared directly.
   * Numbers are scanned by pattern rather than by fixed columns: vintages
   * differ on whether a full-width negative eats its separating space.
   */
  function parse(text) {
    var nl = text.indexOf('\n');
    if (nl < 0) throw new Error(T('gfile.one_line'));
    var header = text.slice(0, nl).replace(/\r$/, '');
    var htok = header.trim().split(/\s+/);
    var nw = parseInt(htok[htok.length - 2], 10);
    var nh = parseInt(htok[htok.length - 1], 10);
    if (!(nw > 0 && nh > 0))
      throw new Error(T('gfile.no_dims'));

    var body = text.slice(nl + 1);
    var re = /[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eEdD][-+]?\d+)?/g;
    var nums = [], m;
    while ((m = re.exec(body)) !== null)
      nums.push(parseFloat(m[0].replace(/[dD]/, 'e')));

    var k = 0;
    var take = function (n) {
      if (k + n > nums.length)
        throw new Error(T('gfile.short', { want: n, left: nums.length - k }));
      return nums.slice(k, k += n);
    };
    var a = take(5), b = take(5), c = take(5), d = take(5);
    var g = {
      header: header, nw: nw, nh: nh,
      rdim: a[0], zdim: a[1], rcentr: a[2], rleft: a[3], zmid: a[4],
      rmaxis: b[0], zmaxis: b[1], simag: b[2], sibry: b[3], bcentr: b[4],
      current: c[0],
      fpol: take(nw), pres: take(nw), ffprim: take(nw), pprime: take(nw),
      psirz: take(nw * nh), qpsi: take(nw),
    };
    void d;
    // boundary + limiter are optional; a truncated tail is not fatal
    try {
      var nb = Math.round(nums[k++]), nl2 = Math.round(nums[k++]);
      var bd = take(2 * nb), lm = take(2 * nl2);
      g.nbbbs = nb; g.limitr = nl2;
      g.rbbbs = bd.filter(function (_, i) { return i % 2 === 0; });
      g.zbbbs = bd.filter(function (_, i) { return i % 2 === 1; });
      g.rlim = lm.filter(function (_, i) { return i % 2 === 0; });
      g.zlim = lm.filter(function (_, i) { return i % 2 === 1; });
    } catch (e) {
      g.nbbbs = 0; g.limitr = 0;
      g.rbbbs = []; g.zbbbs = []; g.rlim = []; g.zlim = [];
    }
    return g;
  }

  /** The app's psi field [Wb, axis = max] from a parsed g-file. */
  function psiFromGfile(g) {
    var out = new Float64Array(g.nw * g.nh);
    for (var j = 0; j < g.nh; j++)
      for (var i = 0; i < g.nw; i++)
        out[i * g.nh + j] = -TWO_PI * g.psirz[j * g.nw + i];
    return out;
  }

  // --- writing ------------------------------------------------------------

  /** EFIT's `%16.9E`, including the FORTRAN-style leading blank. */
  function f16(v) {
    if (!isFinite(v)) v = 0;
    var s = v.toExponential(9).toUpperCase();
    // JS gives E+0 / E+00; FORTRAN writes at least two exponent digits
    s = s.replace(/E([-+])(\d)$/, 'E$10$2');
    if (v >= 0) s = ' ' + s;
    return s.length >= 16 ? s : new Array(17 - s.length).join(' ') + s;
  }

  function block(arr) {
    var out = '';
    for (var i = 0; i < arr.length; i++) {
      out += f16(arr[i]);
      if (i % 5 === 4) out += '\n';
    }
    if (arr.length % 5 !== 0) out += '\n';
    return out;
  }

  /**
   * Serialize an equilibrium to GEQDSK.  `o` takes the app's own gauge and
   * does the flipping here, in one place:
   *
   *   {grid{nr,nz,rmin,rmax,zmin,zmax}, psi, psiAxis, psiBnd, axisR, axisZ,
   *    ip, rcentr, bcentr, fpol, pres, pprime, ffprime, qpsi,
   *    boundary:[[r,z]...], limiter:{r,z}, caseName}
   *
   * `fpol`/`pres`/`pprime`/`ffprime`/`qpsi` arrive on a uniform normalized
   * flux grid of any length and are resampled to nw points here.
   */
  function format(o) {
    var nw = o.grid.nr, nh = o.grid.nz;
    var rdim = o.grid.rmax - o.grid.rmin, zdim = o.grid.zmax - o.grid.zmin;
    var rleft = o.grid.rmin, zmid = 0.5 * (o.grid.zmin + o.grid.zmax);
    var simag = -o.psiAxis / TWO_PI, sibry = -o.psiBnd / TWO_PI;

    var rs = function (src) { return resample(src, nw); };
    var fpol = rs(o.fpol), pres = rs(o.pres);
    var ffp = rs(o.ffprime).map(function (v) { return -v; });
    var ppr = rs(o.pprime).map(function (v) { return -v; });
    var q = rs(o.qpsi);

    var psirz = new Float64Array(nw * nh);
    for (var j = 0; j < nh; j++)
      for (var i = 0; i < nw; i++)
        psirz[j * nw + i] = -o.psi[i * nh + j] / TWO_PI;

    var bnd = o.boundary || [];
    var lim = o.limiter || { r: [], z: [] };
    var head = (o.caseName || 'fylite app') + '   0' +
               String(nw).padStart(4) + String(nh).padStart(4);

    var out = head + '\n';
    out += block([rdim, zdim, o.rcentr, rleft, zmid]);
    out += block([o.axisR, o.axisZ, simag, sibry, o.bcentr]);
    out += block([o.ip, simag, 0, o.axisR, 0]);
    out += block([o.axisZ, 0, sibry, 0, 0]);
    out += block(fpol) + block(pres) + block(ffp) + block(ppr);
    out += block(Array.from(psirz)) + block(q);
    out += String(bnd.length).padStart(5) + String(lim.r.length).padStart(5) + '\n';
    var flat = [];
    bnd.forEach(function (p) { flat.push(p[0], p[1]); });
    out += block(flat);
    flat = [];
    lim.r.forEach(function (r, i) { flat.push(r, lim.z[i]); });
    out += block(flat);
    return out;
  }

  /** Linear resample of a uniform-grid profile onto `n` uniform points. */
  function resample(src, n) {
    if (!src || !src.length) return new Array(n).fill(0);
    var m = src.length, out = new Array(n);
    for (var i = 0; i < n; i++) {
      var t = (i / (n - 1)) * (m - 1);
      var k = Math.min(m - 2, Math.max(0, Math.floor(t)));
      out[i] = src[k] + (t - k) * (src[k + 1] - src[k]);
    }
    return out;
  }

  /**
   * Sample a q(x) curve defined on an arbitrary x range onto `n` uniform
   * points over [0, 1], extrapolating linearly beyond its ends — the traced
   * q stops short of both the axis (the surface degenerates) and the
   * boundary (the separatrix is singular).
   */
  function qOnUniform(x, q, n) {
    var out = new Array(n);
    if (!x || x.length < 2) return out.fill(0);
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1), k = 0;
      while (k < x.length - 2 && x[k + 1] < t) k++;
      var x0 = x[k], x1 = x[k + 1];
      out[i] = q[k] + (q[k + 1] - q[k]) * (t - x0) / (x1 - x0);
    }
    return out;
  }

  /** Shape metrics of a g-file's own boundary, for import as a target. */
  function boundaryShape(g) {
    if (!g.nbbbs) return null;
    var poly = g.rbbbs.map(function (r, i) { return [r, g.zbbbs[i]]; });
    return root.FyPhys ? root.FyPhys.shapeMetrics(poly) : null;
  }

  // --- browser file plumbing (shared by both pages) -----------------------

  /** Hand the visitor a text file.  Nothing leaves the machine. */
  function saveText(name, text) {
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /** Prompt for a local file and hand back its text. */
  function openText(cb, accept) {
    var inp = document.createElement('input');
    inp.type = 'file';
    if (accept) inp.accept = accept;
    inp.style.display = 'none';
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { cb(String(rd.result), f.name); };
      rd.onerror = function () { cb(null, f.name, rd.error); };
      rd.readAsText(f);
    });
    document.body.appendChild(inp);
    inp.click();
  }

  /**
   * Prompt for SEVERAL local files and hand back all of them at once.
   *
   * ★★Why this is separate from :func:`openText` rather than a flag on it.
   * The two have different callback shapes — one file's text, or every
   * file's outcome — and a boolean that silently changes what a callback
   * receives is how a caller ends up reading `result[0]` as a character.
   *
   * ★And why it exists at all: importing a machine RELOADS the page (a
   * half-swapped page is still showing the previous tokamak's numbers), so
   * one-file-at-a-time meant one reload per machine and only the last one
   * left selected.  A reader with four decks could not simply load them.
   *
   * `cb([{name, text, error}])` — a file that could not be read comes back
   * named, with its error, rather than being dropped: an import that
   * silently takes three of four files is worse than one that fails.
   */
  function openTexts(cb, accept) {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = true;
    if (accept) inp.accept = accept;
    inp.style.display = 'none';
    inp.addEventListener('change', function () {
      var files = Array.prototype.slice.call(inp.files || []);
      inp.remove();
      if (!files.length) return;
      var out = new Array(files.length), left = files.length;
      files.forEach(function (f, i) {
        var rd = new FileReader();
        rd.onload = function () {
          out[i] = { name: f.name, text: String(rd.result) };
          if (--left === 0) cb(out);
        };
        rd.onerror = function () {
          out[i] = { name: f.name, error: rd.error };
          if (--left === 0) cb(out);
        };
        rd.readAsText(f);
      });
    });
    document.body.appendChild(inp);
    inp.click();
  }

  root.FyGeqdsk = { parse: parse, format: format,
                    saveText: saveText, openText: openText,
                    openTexts: openTexts,
                    psiFromGfile: psiFromGfile,
                    qOnUniform: qOnUniform, boundaryShape: boundaryShape };
})(typeof self !== 'undefined' ? self : globalThis);
