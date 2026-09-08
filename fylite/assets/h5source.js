// HDF5 as a source layer: bytes in, one fyo document out (`FYL-DESIGN-18`
// U-25, §五).
//
// ★Why a source layer and not a format the middle layer reads.  The middle
// layer's HDF5 face links `libhdf5`, a C library, and that face is native-only
// by ruling (`FYL-DESIGN-14` L-9): measured here, `hdf5-metno-sys` does not even
// compile for `wasm32-unknown-unknown` — `libc::FILE`, `off_t`, `ssize_t` do not
// exist on a target with no libc.  So the browser cannot reach HDF5 the way the
// native host does, and the choice is between shipping a second HDF5
// implementation and letting one that already exists hand us a document.  This
// file takes the second: h5wasm turns the file into a fyo document, and from
// there it is an ordinary source in the stack (`sources.js`), indistinguishable
// from a fetched one.  The C library stays inside its own Emscripten module and
// never touches ours, which keeps `fylite_runtime.wasm` at zero imports (H-5).
//
// ★★LAZY, AND THAT IS LOAD-BEARING.  h5wasm is ~4.2 MB — larger than this
// repository's three kernel modules put together (~1.56 MB) — because the HDF5
// C library rides inside it as base64.  It is loaded by a dynamic `import()` on
// the first actual call, is excluded from the precache (`tools/make-sw.mjs`),
// and is therefore paid for by a reader who opens an HDF5 file and by nobody
// else.  A static `<script>` here would put those megabytes on every visit to
// every page for a capability most readers never use.
//
// ★What it reads, and what it refuses.  The **fyo layout** this repository
// writes: arrays are datasets, scalars and strings are attributes on the
// enclosing group, and the root carries `@id` / `@type`.  The **IMAS layout**
// (`master.h5` in a directory, tensorised structure arrays, transposed data
// axes — `FYL-DESIGN-14` L-5 / L-6) is REFUSED BY NAME rather than half-read:
// getting it wrong yields a document that looks right and is transposed.
//
// ★Licence.  h5wasm is NIST-developed software vendored verbatim under
// `assets/vendor/h5wasm/` with its notice intact; NIST is acknowledged as the
// source in `docs/ACKNOWLEDGEMENTS.md` and on the credits page, which is an
// obligation of that notice rather than a courtesy.
(function (root) {
  'use strict';

  var MOD = null;                       //: the loaded module, once
  var pending = null;                   //: the in-flight load, so N calls load once
  var seq = 0;
  //: 本进程读不读文件：`null` = 还没探，`false` = 没有这条路，`true` = 有。
  var apiFace = null;

  function base() {
    //: resolve beside THIS script, like `site.js` and `host.js` do, so the
    //: path is right whether the page sits at the site root or under `pages/`
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/assets\/h5source\.js(\?.*)?$/, 'assets/') : 'assets/';
  }
  var ASSETS = base();

  function loopback() {
    try {
      var h = location.hostname;
      return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]';
    } catch (e) { return false; }
  }

  /**
   * 这个宿主能替页面读文件吗？答 `true` / `false`，只探一次。
   *
   * ★★2026-09-05 用户裁定：*hdf5 走 fy app 的文件端点，静态站点保留 h5wasm*。
   * 桌面查看器本来就链着 libhdf5——让内嵌页面再下载 4.1 MB 的第二实现，与装置信息、
   * 算力那两次收敛掉的是同一种重复。静态站点没有 `/api/*`，那里 h5wasm 是唯一的读法，
   * 所以它留着（也仍然惰性、仍然不进预缓存）。
   * ★探的是**请求面答不答**并且它自报带着 hdf5 那一面（`/api/health` 的 `file` 格），
   * 不看主机名——与 `factsdb.js` / `kernelapi.js` 同一条纪律。
   */
  function face() {
    if (apiFace !== null) return Promise.resolve(apiFace);
    if (typeof fetch !== 'function' || !loopback()) { apiFace = false; return Promise.resolve(false); }
    return fetch(ASSETS.replace(/assets\/$/, '') + 'api/health',
                 { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { apiFace = !!(j && j.file); return apiFace; })
      .catch(function () { apiFace = false; return false; });
  }

  /** 把字节交给本进程读，答一份 fyo 文档。 */
  function readByProcess(u8, name) {
    var url = ASSETS.replace(/assets\/$/, '') + 'api/read?name='
            + encodeURIComponent(name || 'upload.h5');
    return fetch(url, { method: 'POST', body: u8 }).then(function (r) {
      return r.text().then(function (t) {
        var j;
        try { j = JSON.parse(t); } catch (e) { throw new Error('/api/read: ' + t.slice(0, 200)); }
        //: ★端点的拒绝是**一句话**，原样转给读者：它与页面那侧的拒绝逐字同源
        //: （不是 HDF5 · IMAS 布局半读不得），所以两条路给读者的话是一样的。
        if (!r.ok || (j && j.error)) throw new Error((j && j.error) || ('HTTP ' + r.status));
        return j;
      });
    });
  }

  /** Load h5wasm — once, on demand. */
  function load() {
    if (MOD) return Promise.resolve(MOD);
    if (pending) return pending;
    pending = import(ASSETS + 'vendor/h5wasm/hdf5_hl.js')
      .then(function (m) { return m.ready.then(function () { MOD = m; return m; }); })
      .catch(function (e) {
        pending = null;
        //: ★a load failure is a NAMED refusal, not a silent absence.  Offline
        //: and never opened before is the common case, and the reader has to be
        //: told that rather than shown an empty result (P-10).
        throw new Error('HDF5 读取器载入失败（约 4 MB，按需下载；离线且从未下载过时会到这一步）：'
                        + (e && e.message ? e.message : e));
      });
    return pending;
  }

  function plain(v) {
    if (typeof v === 'bigint') return Number(v);
    if (v && ArrayBuffer.isView(v)) {
      var out = new Array(v.length);
      for (var i = 0; i < v.length; i++) out[i] = typeof v[i] === 'bigint' ? Number(v[i]) : v[i];
      return out;
    }
    if (Array.isArray(v)) return v.map(plain);
    return v;
  }

  /** One HDF5 group -> one plain object: attrs are scalars, datasets are arrays. */
  function walk(h5, group) {
    var out = {}, attrs = group.attrs || {}, k;
    for (k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var a = attrs[k];
      out[k] = plain(a && a.value !== undefined ? a.value : a);
    }
    group.keys().forEach(function (name) {
      var it = group.get(name);
      if (it instanceof h5.Group) out[name] = walk(h5, it);
      else if (it && it.value !== undefined) out[name] = plain(it.value);
    });
    return out;
  }

  /**
   * Read one HDF5 file into a fyo document.
   *
   *   FyH5.read(arrayBuffer).then(function (doc) { ... })
   *
   * Rejects — by name — when the load fails, when the file is not HDF5, or when
   * it is the IMAS layout this reader does not claim to handle.
   */
  function read(bytes, opts) {
    opts = opts || {};
    var u8x = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return face().then(function (viaProcess) {
      if (!viaProcess) return readHere(u8x, opts);
      return readByProcess(u8x, opts.name || (opts.id || 'upload') + '.h5')
        .then(function (doc) {
          if (opts.id) doc['@id'] = doc['@id'] || opts.id;
          return doc;
        });
    });
  }

  /** 在页面里读（h5wasm）——静态站点唯一的读法。 */
  function readHere(bytes, opts) {
    opts = opts || {};
    return load().then(function (h5) {
      var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      //: HDF5's own signature, checked before handing it over: h5wasm's failure
      //: on a non-HDF5 file is an Emscripten abort, which is not a sentence
      //: anybody can act on
      var SIG = [0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a];
      var ok = u8.length > 8;
      for (var i = 0; ok && i < 8; i++) ok = u8[i] === SIG[i];
      if (!ok) throw new Error('按名拒绝：这不是一个 HDF5 文件（签名不符）');

      var path = '/fy-' + (++seq) + '.h5';
      h5.FS.writeFile(path, u8);
      var f = null;
      try {
        f = new h5.File(path, 'r');
        //: the IMAS layout arrives as a DIRECTORY with `master.h5` (L-2); a
        //: single file carrying `ids_properties` at the root without an
        //: `@type` is the shape we would half-read, so it is refused by name
        var names = f.keys();
        var attrs = f.attrs || {};
        if (!attrs['@type'] && names.indexOf('ids_properties') >= 0)
          throw new Error('按名拒绝：这看着是 IMAS 布局（结构数组张量化 · 数据轴转置，'
                          + 'FYL-DESIGN-14 L-5 / L-6）——本读者只读本仓写的 fyo 布局，'
                          + '半读一份会给出一份看着对、其实转置了的文档');
        var doc = walk(h5, f);
        if (opts.id) doc['@id'] = doc['@id'] || opts.id;
        return doc;
      } finally {
        try { if (f) f.close(); } catch (e) { /* closing a file that failed to open */ }
        try { h5.FS.unlink(path); } catch (e) { /* it may never have been written */ }
      }
    });
  }

  /** A source-stack layer (`sources.js`) made from an HDF5 file. */
  function layer(bytes, name, opts) {
    return read(bytes, opts).then(function (doc) {
      return { kind: 'file', file: name, doc: doc, on: true,
               label: (opts && opts.label) || ('HDF5 文件 ' + name) };
    });
  }

  root.FyH5 = {
    read: read, layer: layer,
    //: ★两条路各自可问：闸子要能分别验，读者的「这一份是谁读的」也答得出。
    readHere: readHere, readByProcess: readByProcess, face: face,
    /** Has the 4 MB module been loaded in this page yet? */
    loaded: function () { return !!MOD; },
    /** For a page that wants to warm it deliberately (a click, never on load). */
    preload: load
  };
})(typeof self !== 'undefined' ? self : this);
