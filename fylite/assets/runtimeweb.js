// 中间层在浏览器里的那一份 —— **载入它、跟它说话**，只此两件事。
//
// ★★2026-09-05 落地 `FYL-DESIGN-16` H-4 的第一块。此前这段载入与字符串编解码住在
// `factsdb.js` 里，因为装置信息是第一个消费者；今天 g-file 的读法也搬了进来
// （`geqdsk.js` 不再自带解析器），于是它有了第二个消费者——一段被两处用的代码留在
// 其中一处的文件里，下一个读者要靠记忆知道该去哪儿找。
//
// 这份文件只管**怎么到达中间层**：
//
//   FyRuntimeWeb.load()             取回并实例化那份 wasm（记住，重复调用只取一次）
//   FyRuntimeWeb.instance()         已经实例化好的导出面，或 null（同步问）
//   FyRuntimeWeb.callText(fn, s)    一次「字符串进、字符串出」的调用
//
// **各面自己的语义在各自的文件里**：装置在 `factsdb.js`，g-file 在 `geqdsk.js`。
// 这里不知道 facts 是什么，也不知道 g-file 是什么。
//
// ★两段式取串（`cap = 0` 先问长度，再给足缓冲问第二次）与输入串落进库的线性内存
// （wasm 上宿主与库不共享地址空间，所以要 alloc/free）是这一层的全部机械活。
// `u64` / `i64` 在 JS 里是 BigInt，指针是普通 Number——两种混在一起，所以转换函数
// 在这里，不散在每个调用点。

(function (root) {
  'use strict';

  var REQUIRED = ['fylite_runtime_alloc', 'fylite_runtime_free', 'memory'];

  var inst = null;      //: 实例，取回来之后一直用
  var pending = null;   //: 正在取的那次，免得并发触发两次下载

  //: 站点根。页面从本脚本的 URL 反推；worker 里没有 `document`，用 worker 自己的
  //: URL（`assets/xxx.js` 的上一级）——两处的理由与 `kernelapi.js` 抬头那段相同。
  var ROOT = (function () {
    try {
      var me = document.currentScript && document.currentScript.src;
      if (me) return me.replace(/assets\/runtimeweb\.js(\?.*)?$/, '');
    } catch (e) { /* worker / test host */ }
    try {
      var here = String(self.location.href);
      if (/assets\/[^/]*$/.test(here)) return here.replace(/assets\/[^/]*$/, '');
    } catch (e) { /* 没有 location 的宿主 */ }
    return '';
  })();

  function u64(n) { return BigInt(n); }
  function num(n) { return typeof n === 'bigint' ? Number(n) : n; }
  function bytes(e) { return new Uint8Array(e.memory.buffer); }

  function versioned(url) {
    //: 与 `fylite.js` 的 `versioned()` 同一条规矩：磁盘上的真文件带版本
    //: （`tools/soname.sh`），页面写不带版本的名字，这里补上。
    var v = root.FyRuntimeVersion;
    if (!v || !/\.wasm$/.test(url)) return url;
    return url + '.' + v;
  }

  /**
   * 取回并实例化中间层的 wasm。解析为导出面。
   *
   * ★★取的是 `fylite_web.wasm`（0.51 MB）：中间层按**导出面**切出来的浏览器那一份
   * ——装置那扇门加 g-file 那扇门，而不是全套 C 导出的 2.14 MB（那一份今天没有读者，
   * `FYL-DESIGN-16` H-8 的清单里记着）。同一份源码，`abi_gfile` 一个 feature 之差。
   *
   * ★不用 `instantiateStreaming`：有些静态主机把 `.wasm` 的 Content-Type 发错，
   * 流式编译当场失败，而缓冲这条路照走。
   */
  function load(url) {
    if (inst) return Promise.resolve(inst);
    if (pending) return pending;
    var u = versioned(url ? url : ROOT + 'assets/fylite_web.wasm');
    pending = fetch(u)
      .then(function (r) {
        if (!r.ok) throw new Error('fetch ' + u + ': HTTP ' + r.status);
        return r.arrayBuffer();
      })
      .then(function (buf) { return WebAssembly.instantiate(buf, {}); })
      .then(function (res) {
        var e = res.instance.exports;
        var missing = REQUIRED.filter(function (k) { return !e[k]; });
        if (missing.length) throw new Error(u + ': 缺少导出 ' + missing.join(', '));
        inst = e;
        pending = null;
        return e;
      })
      .catch(function (err) { pending = null; throw err; });
    return pending;
  }

  /** 已经实例化好的导出面，或 `null`。**同步**问 —— 调用点要它是同步的。 */
  function instance() { return inst; }

  /**
   * 用手上的字节实例化（不 fetch）。给**没有网络路径的宿主**用：node 里的闸子
   * 从磁盘读那份 wasm，浏览器里没人调这一条。
   *
   * ★存在的理由是闸子要能在没有服务器的情况下验同一份产物；不是一个后门：
   * 它做的事与 `load()` 的后半段逐字相同，只是字节从别处来。
   */
  function useBytes(buf) {
    return WebAssembly.instantiate(buf, {}).then(function (res) {
      var e = res.instance.exports;
      var missing = REQUIRED.filter(function (k) { return !e[k]; });
      if (missing.length) throw new Error('useBytes: 缺少导出 ' + missing.join(', '));
      inst = e;
      return e;
    });
  }

  /** Copy a JS string into the module's memory; returns `[ptr, len]`. */
  function push(e, s) {
    var b = new TextEncoder().encode(s);
    if (!b.length) return [0, 0];
    var p = num(e.fylite_runtime_alloc(u64(b.length)));
    if (!p) throw new Error('fylite_runtime_alloc failed');
    bytes(e).set(b, p);
    return [p, b.length];
  }

  /**
   * 两段式取串：先问长度，再给足缓冲问第二次。
   *
   * ★`ask` 答的是它**要**的长度，所以缓冲小了不是静默截断，是一个比缓冲大的数。
   */
  function pull(e, ask) {
    var n = num(ask(0, u64(0)));
    if (n < 0) return n;                 //: 状态码原样交给调用方
    if (n === 0) return '';
    var p = num(e.fylite_runtime_alloc(u64(n)));
    if (!p) throw new Error('fylite_runtime_alloc failed');
    try {
      var got = num(ask(p, u64(n)));
      if (got < 0) return got;
      return new TextDecoder().decode(bytes(e).subarray(p, p + Math.min(got, n)));
    } finally {
      e.fylite_runtime_free(p, u64(n));
    }
  }

  function withStr(e, s, fn) {
    var a = push(e, s);
    try { return fn(a[0], a[1]); }
    finally { if (a[1]) e.fylite_runtime_free(a[0], u64(a[1])); }
  }

  /**
   * 一次「字符串进、字符串出」的调用，**同步**（实例必须已经在）。
   *
   * 答复是字符串，或一个负的状态码（由调用方按它自己那扇门的约定解释）。
   * 实例还没到就抛——调用点据此说一句读得懂的话，而不是拿 `undefined` 往下走。
   */
  function callText(fn, text) {
    var e = inst;
    if (!e) throw new Error('FyRuntimeWeb: 中间层还没就绪（先 await load()）');
    if (!e[fn]) throw new Error('FyRuntimeWeb: 这一版没有导出 ' + fn);
    return withStr(e, text, function (p, n) {
      return pull(e, function (o, c) { return e[fn](p, u64(n), o, c); });
    });
  }

  root.FyRuntimeWeb = { load: load, instance: instance, callText: callText,
                        useBytes: useBytes,
                        root: function () { return ROOT; },
                        u64: u64, num: num, pull: pull, withStr: withStr };
}(typeof self !== 'undefined' ? self : this));
