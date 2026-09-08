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
  //: ★★**这里不再有解析器**（2026-09-05 落地 `FYL-DESIGN-16` H-4 的第一块）。
  //: 本仓曾有**三份** g-file 读法：原生一份、wasm 一份、这里的 JS 一份（286 行里
  //: 有 45 行是它）。三份读同一种文件，而 g-file 的坑——`D`/`E` 指数、可选的边界与
  //: 限制器尾巴、短文件——每一份都要各踩一次；`-16` 抬头把这一份点名为「第三份」。
  //: 今天它撤了，页面问中间层，而中间层与 `fy data`、与 python 对拍的是同一段代码。
  //:
  //: 两个宿主，两条到达方式，**同一个产出者**（`GFile::to_node`）：
  //:   · 桌面查看器 —— `POST /api/read?shape=gfile`（本进程原生读）
  //:   · 静态站点 —— 中间层 wasm 的 `fylite_runtime_gfile_json`
  //: 键名与从前逐字相同（`g.nw` / `g.pres` / `g.psirz` / `g.rbbbs`…），所以四处调用点
  //: 一个字未改；实测同一份 g-file 两条路与旧 JS 读法 26 个键、逐值相同。
  //:
  //: ★**保持同步**。`parse` 的调用点在 `appio.js` 的「逐个候选格式试着读，读不动就
  //: 抛」那个循环里——把它改成异步就要改那段控制流，而那段有成文的事故史（几种文本
  //: 格式互相抢一个文件）。所以：桌面走同步 XHR（回环、本进程，与 `kernelapi.js`
  //: 同一条纪律），站点走**已经实例化好的**那份 wasm（装置面板在启动时已经载入它，
  //: 见下面的预热）。两者都还没有，就抛一句说得清的话。
  var apiFace = null;   //: null 还没探 · false 没有这条路 · true 有

  function faceSync() {
    if (apiFace !== null) return apiFace;
    try {
      var h = location.hostname;
      if (!(h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]')) {
        apiFace = false;
        return apiFace;
      }
      var x = new XMLHttpRequest();
      x.open('GET', root.FyRuntimeWeb.root() + 'api/health', false);
      x.send();
      apiFace = x.status === 200 && !!JSON.parse(x.responseText).file;
    } catch (e) { apiFace = false; }
    return apiFace;
  }

  function parseByProcess(text) {
    var x = new XMLHttpRequest();
    x.open('POST', root.FyRuntimeWeb.root() + 'api/read?name=import.geqdsk&shape=gfile', false);
    x.send(text);
    var j = JSON.parse(x.responseText);
    if (x.status !== 200 || j.error) throw new Error(j.error || ('HTTP ' + x.status));
    return j;
  }

  function parseByWasm(text) {
    var t = root.FyRuntimeWeb.callText('fylite_runtime_gfile_json', text);
    //: ★`-2` 是「读不动」，正文就是那句话；`callText` 在这种情形下答的是那个负数，
    //: 所以再问一次拿正文不值得——中间层把话写进了同一个缓冲，而它已经被当成状态码
    //: 读走了。这里给一句同源的话：调用方只需要知道这份文件不是 g-file。
    if (typeof t !== 'string') throw new Error(T('gfile.no_dims'));
    return JSON.parse(t);
  }

  /**
   * 读一份 g-file，答一个与从前逐字相同的对象。
   *
   * ★同步（理由见上）。抛出的是一句读得懂的话：调用方（`appio.js` 的候选循环）
   * 拿「抛了」当作「这份文件不是这个格式」，所以抛什么话都不能是 `undefined`。
   */
  function parse(text) {
    if (!root.FyRuntimeWeb) throw new Error('geqdsk: 缺 assets/runtimeweb.js');
    if (faceSync()) return parseByProcess(text);
    if (root.FyRuntimeWeb.instance()) return parseByWasm(text);
    throw new Error(T('gfile.not_ready'));
  }

  //: ★★**预热，但只在真要用它的宿主上**（2026-09-05 实测改）。站点上装置面板启动时
  //: 就会载入同一份 wasm，所以这一句通常什么也不用做；它在的理由是那些**不列装置**
  //: 的页面——读者在那里打开一份 g-file 时，实例得已经在。
  //: ★桌面宿主**不预热**：那里走 `/api/read`，把 0.51 MB 取回来一次也不用是白花的
  //: （实测第一版就是这样：桌面宿主上既 GET 了那份 wasm，又 POST 了端点）。所以先
  //: **异步**探一次请求面，探到就不取；顺带把 `apiFace` 定下来，于是后面那次同步探
  //: 通常也省了。
  try {
    if (root.FyRuntimeWeb && typeof fetch === 'function') {
      fetch(root.FyRuntimeWeb.root() + 'api/health', { headers: { accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          apiFace = !!(j && j.file);
          if (!apiFace) root.FyRuntimeWeb.load().catch(function () { /* 站点没带它 */ });
        })
        .catch(function () {
          apiFace = false;
          root.FyRuntimeWeb.load().catch(function () { /* 站点没带它 */ });
        });
    }
  } catch (e) { /* 没有 fetch 的宿主 */ }

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
