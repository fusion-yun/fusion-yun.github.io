// 内核 —— **在桌面宿主里走本进程的 `/api/kernel`**，不实例化 wasm。
//
// ★★2026-09-05 用户裁定：「webui 中 fylite_rs / fylite_kernel_ext wasm 功能由 api
// 端提供，只静态网页走 wasm」。在此之前，`fy app` 这一个可执行文件里同一批物理
// 装了两遍：内嵌页面取的两份 `.wasm`（1.46 MB），以及同一个进程里那份原生内核。
// 两条算力路、两份字节，**没有任何东西保证它们算的是同一件事**——而这正是同一天
// 早些时候在装置信息上收敛掉的那种重复。
//
// 今天桌面宿主里只有一条：页面把它本来要交给 wasm 的那次调用**原样**交给
// `/api/kernel`。静态站点没有 `/api/*`，那里仍然实例化 wasm——那是它唯一的算法。
//
// ## 它怎么可能是「同一次调用」
//
// 因为交出去的就是同一批参数。`fylite.js` 里那 140 处调用点不改一个字：它们照旧
// `alloc` 一块、把数组写进去、按 C ABI 传指针与长度。变的只是**指针指向哪里**——
// 这里给它一块自己的 `WebAssembly.Memory`（同样的 `.buffer`、同样的增长语义，
// 于是 `f64()` 那类视图助手一行都不用改），调用时按生成的参数种类表
// （`assets/kernel-abi.js`，与服务端那份出自内核 `c_api.rs` 的同一次生成）把
// 入缓冲的字节送过去、把出缓冲的结果写回来。
//
// ## 为什么是同步 XHR
//
// ★★因为被替换的那个东西是同步的。wasm 的导出是同步函数，`fylite.js` 的每一处
// 调用点都写成 `var rc = e.fylite_rs_xxx(...)`，而把它们改成异步是把那 4 700 行
// （以及 worker 里 5 000 行的编排）整个翻一遍——那不是「换一条取数路」，那是重写。
// 同步 XHR 在 Worker 里是完全支持的（页面主线程上被标为不推荐，但可用），而这一条
// 请求走的是**回环地址上的本进程**：没有网络、没有 DNS、没有 TLS。
//
// ★代价照记：每次内核调用一个回环往返。实测这套 ABI 是**粗粒度**的——一次
// q 剖面计算只有 1 次真正的物理调用（其余 8 次是 alloc/free，而那两个本来就在本地
// 做，见下）。迭代型入口（`*_next`）会按迭代次数发请求，那是这条路最贵的一种。
//
// ## 分配在本地做
//
// `fylite_rs_alloc` / `_free` **不桥**（服务端那张表按名拒绝它们）：分配是调用方
// 这一侧的事——内核进程里的一个地址送回浏览器毫无意义，而让远端去 `free` 一个
// 本地指针是当场的未定义行为。这里自己实现一个块分配器，每块记着它多长，于是
// 传指针时能精确知道该送多少字节回去。
//
// ★依赖 `fylite.js` 的内存纪律：每个缓冲是自己的一次 `alloc`，调用点传的都是块首
// 指针，没有任何一处做指针算术（实测 289 处 `.ptr` 使用，0 处偏移）。这条纪律要是
// 破了，这里会**报错**而不是猜——见 `blockOf()`。

(function (root) {
  'use strict';

  //: 本进程的请求面在哪里。页面从自己的脚本 URL 反推，与 `factsdb.js` 同一条。
  //:
  //: ★★**Worker 里也要算对**（2026-09-05 真浏览器实测修）。worker 里没有
  //: `document`，而这里从前就此返回空串——空串的意思是「相对当前脚本」，于是
  //: 探测发到 `app/assets/api/health`（worker 脚本住在 `assets/`），404。
  //: 后果不是一句报错：worker 会据此判定「这个宿主没有请求面」而退回实例化内核
  //: wasm，**而桌面版的可执行文件里已经没有那份 wasm 了**（同日裁定），于是
  //: 页面上什么也算不出来。worker 里 `self.location.href` 就是 worker 脚本自己的
  //: URL，站点根是它的上一级。
  var ROOT = (function () {
    try {
      var me = document.currentScript && document.currentScript.src;
      if (me) return me.replace(/assets\/kernelapi\.js(\?.*)?$/, '');
    } catch (e) { /* worker / test host */ }
    try {
      //: worker：`assets/worker.js` -> 站点根
      var here = String(self.location.href);
      if (/assets\/[^/]*$/.test(here)) return here.replace(/assets\/[^/]*$/, '');
    } catch (e) { /* 没有 location 的宿主 */ }
    return '';
  })();

  //: 探过一次就记住：`null` = 还没探，`false` = 这个宿主没有这条路，对象 = 有。
  var face = null;

  function loopback() {
    try {
      var h = location.hostname;
      return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]';
    } catch (e) { return false; }
  }

  /**
   * 这个宿主自带算力吗？答 `{abi, sha256, version, symbols}` 或 `null`。
   *
   * ★探的是**这条路答不答**，主机名只作反向过滤（查看器绑的是回环地址，所以发布
   * 出去的站点一个多余请求也不发）。与 `factsdb.js` 探 `/api/facts` 同一条纪律。
   */
  function probe(base) {
    if (face !== null) return Promise.resolve(face || null);
    if (typeof fetch !== 'function' || !loopback()) { face = false; return Promise.resolve(null); }
    return fetch((base || ROOT) + 'api/health', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var k = j && j.kernel;
        face = (k && k.linked) ? k : false;
        return face || null;
      })
      .catch(function () { face = false; return null; });
  }

  // --- 本地线性内存与块分配器 ------------------------------------------------

  var PAGE = 65536;

  function Heap() {
    //: 16 页 = 1 MiB 起步，按需长。与 wasm 那侧同样的语义：增长会让已有视图失效，
    //: 而 `fylite.js` 的助手本来就每次现取视图（它抬头写着为什么）。
    this.mem = new WebAssembly.Memory({ initial: 16 });
    this.top = 16;          //: 0 留给空指针
    this.blocks = {};       //: ptr -> 字节数
    this.freed = [];        //: [{ptr, n}]，先按大小复用，简单够用
  }

  Heap.prototype.grow = function (need) {
    var have = this.mem.buffer.byteLength;
    if (need <= have) return;
    this.mem.grow(Math.ceil((need - have) / PAGE));
  };

  Heap.prototype.alloc = function (n) {
    n = Number(n);
    if (!(n >= 0)) return 0;
    //: 8 字节对齐：这些块里放的是 f64（以及借同一块地方写的字节串）。
    var want = Math.max(8, (n + 7) & ~7);
    for (var i = 0; i < this.freed.length; i++) {
      if (this.freed[i].n >= want) {
        var b = this.freed.splice(i, 1)[0];
        this.blocks[b.ptr] = n;
        return b.ptr;
      }
    }
    var p = this.top;
    this.top += want;
    this.grow(this.top);
    this.blocks[p] = n;
    return p;
  };

  Heap.prototype.free = function (p, n) {
    p = Number(p);
    if (!p || !(p in this.blocks)) return;
    var want = Math.max(8, (Number(n) + 7) & ~7);
    delete this.blocks[p];
    this.freed.push({ ptr: p, n: want });
  };

  /** 这个指针那一块有多长（字节）。★不是块首就抛——见模块抬头。 */
  Heap.prototype.blockOf = function (p) {
    p = Number(p);
    if (p in this.blocks) return this.blocks[p];
    throw new Error('FyKernelApi: 指针 ' + p + ' 不是一次 alloc 的块首。' +
                    '这条路要求每个缓冲各自分配、调用点只传块首（fylite.js 的内存' +
                    '纪律）——出现指针算术就得先改这里，不能猜长度。');
  };

  // --- 一次调用 --------------------------------------------------------------

  var WIDTH = { in_f64: 8, out_f64: 8, in_u64: 8, out_u64: 8, in_i32: 4, in_u8: 1, out_u8: 1 };

  function readSlot(heap, ptr, kind) {
    var n = heap.blockOf(ptr), w = WIDTH[kind], m = Math.floor(n / w), out = new Array(m), i;
    var buf = heap.mem.buffer;
    if (kind === 'in_f64') {
      var f = new Float64Array(buf, ptr, m);
      for (i = 0; i < m; i++) out[i] = f[i];
    } else if (kind === 'in_u64') {
      var b = new BigUint64Array(buf, ptr, m);
      for (i = 0; i < m; i++) out[i] = Number(b[i]);
    } else if (kind === 'in_i32') {
      var s = new Int32Array(buf, ptr, m);
      for (i = 0; i < m; i++) out[i] = s[i];
    } else {
      var u = new Uint8Array(buf, ptr, m);
      for (i = 0; i < m; i++) out[i] = u[i];
    }
    return out;
  }

  function writeSlot(heap, ptr, kind, values) {
    var buf = heap.mem.buffer, i;
    if (kind === 'out_f64') {
      var f = new Float64Array(buf, ptr, values.length);
      for (i = 0; i < values.length; i++) f[i] = values[i];
    } else if (kind === 'out_u64') {
      var b = new BigUint64Array(buf, ptr, values.length);
      for (i = 0; i < values.length; i++) b[i] = BigInt(Math.round(values[i]));
    } else {
      var u = new Uint8Array(buf, ptr, values.length);
      for (i = 0; i < values.length; i++) u[i] = values[i] & 0xff;
    }
  }

  /**
   * 同步 POST 一次调用。★用 XHR 而不是 `fetch`：`fetch` 没有同步形态，
   * 而这里必须同步（理由在模块抬头）。
   */
  function post(url, body) {
    var x = new XMLHttpRequest();
    x.open('POST', url, false);
    x.setRequestHeader('content-type', 'application/json');
    x.send(body);
    if (x.status !== 200) {
      var why = x.responseText;
      try { why = JSON.parse(x.responseText).error || why; } catch (e) { /* 原样 */ }
      throw new Error('/api/kernel: HTTP ' + x.status + ' — ' + why);
    }
    return JSON.parse(x.responseText);
  }

  /**
   * 一份「导出面」，形状与 wasm 实例的 `exports` 一样。
   *
   * `fylite.js` 的 `Fy` 只要这些：`memory`、`fylite_rs_alloc` / `_free`、
   * `fylite_rs_abi_version`，以及它调到的那些符号。这里逐个按生成表造出来。
   */
  function exportsFor(info, base) {
    if (!root.FyKernelAbi) {
      throw new Error('FyKernelApi: assets/kernel-abi.js（内核仓生成）必须先加载');
    }
    var url = (base || ROOT) + 'api/kernel';
    var heap = new Heap();
    var e = {
      memory: heap.mem,
      //: 分配在本地——远端那张表按名拒绝这两个（见模块抬头）。
      fylite_rs_alloc: function (n) { return heap.alloc(Number(n)); },
      fylite_rs_free: function (p, n) { heap.free(p, Number(n)); },
      fylite_rs_abi_version: function () { return info.abi; },
    };
    Object.keys(root.FyKernelAbi).forEach(function (name) {
      if (name in e) return;                    //: 上面三个不覆盖
      var sig = root.FyKernelAbi[name];
      e[name] = function () {
        var args = [], outs = [], i, k, v;
        for (i = 0; i < sig.a.length; i++) {
          k = sig.a[i];
          v = arguments[i];
          if (k.indexOf('in_') === 0) {
            args.push({ 'in': readSlot(heap, v, k) });
          } else if (k.indexOf('out_') === 0) {
            var n = Math.floor(heap.blockOf(v) / WIDTH[k]);
            outs.push({ ptr: Number(v), kind: k });
            args.push({ out: n });
          } else {
            //: u64 / i64 在 wasm 的 JS 绑定里是 BigInt，JSON 里是数。
            args.push(typeof v === 'bigint' ? Number(v) : v);
          }
        }
        var ans = post(url, JSON.stringify({ fn: name, args: args }));
        var got = ans.out || [];
        for (i = 0; i < outs.length; i++) {
          if (got[i]) writeSlot(heap, outs[i].ptr, outs[i].kind, got[i]);
        }
        //: 返回值还成 wasm 会给的那种类型（见 `kernel-abi.js` 的 `r`）。
        return (sig.r === 'u64' || sig.r === 'i64') ? BigInt(Math.round(ans.rc)) : ans.rc;
      };
    });
    return e;
  }

  /**
   * The DOCUMENT door: `complete('code/vstab', plan)` -> Promise<record>.
   *
   * ★FYL-DESIGN-16 H-2 / P2: beside the per-call bridge (`exportsFor`, one flat export
   * per request) the page's other way to the kernel is ONE endpoint, `POST /api/case`
   * — a plan tree in, a record tree out.  The plan's layout is the kernel's
   * (`settings/*` scalars, `inputs/<fyo path…>` documents); the record comes back as
   * the kernel lays it out (`code` · `entry` · `dims` · `facts` · `fields` · `notes`).
   *
   * A refusal is an ANSWER: the promise rejects with an Error carrying `.code` (the
   * kernel's negative code) and `.refusal` (the tree).  ★On the static site there is
   * no `/api/*` and the middle layer is not in the page yet (W-1), so this rejects
   * with a sentence that says so rather than pretending — the wasm's flat exports are
   * still there for what the pages do today.
   */
  function complete(code, plan, base) {
    if (typeof fetch !== 'function' || !loopback()) {
      return Promise.reject(new Error(
        'the document door (/api/case) needs the desktop host (`fy`); the static site ' +
        'has no middle layer in the page yet (FYL-DESIGN-16 W-1)'));
    }
    return fetch((base || ROOT) + 'api/case', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ code: String(code), plan: plan || {} })
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try { j = JSON.parse(t); } catch (e) { /* not JSON: report the text */ }
        if (r.status !== 200) {
          throw new Error('/api/case: HTTP ' + r.status + ' — ' + ((j && j.error) || t));
        }
        if (j && j.refusal) {
          var err = new Error('the kernel refused (' + j.refusal.code + '): ' + j.refusal.message);
          err.code = j.refusal.code;
          err.refusal = j.refusal;
          throw err;
        }
        return j.record;
      });
    });
  }


  // --- 树门：扁平树的编解码，以及 wasm 上的 `fylite_rs_fyo_tree` -------------------
  //
  // ★FYL-DESIGN-16 W-1（2026-09-05）。静态站点没有 `/api/*`，页面要走文档门就得在
  // wasm 上敲 `fylite_rs_fyo_tree`——四段缓冲进、四段缓冲出（`tree.rs` 抬头；
  // TREE_FORMAT 由 `fyo-interface.js` 生成）。这里是那四段的 JS 编解码，与内核仓
  // `tests/oracles/tree.py` 逐字节同形（`app/tests/validate-fyo-tree.mjs` 对着它编出
  // 的夹具比）。★数在 JS 里没有 int / float 之分：`number` 一律编成 F64，`bigint`
  // 才是 Int；数组一律 F64Array（`BigInt64Array` 才是 I64Array）。内核的 settings
  // 收任一数值种类，所以这不改变任何一个 code 的读法。
  //
  // 解出来的记录是**普通 JS 值**（对象 · 数组 · 数 · 串；多维数组按形状嵌套），
  // 与 `/api/case` 答回的 JSON 一个形状——于是 `completeSync` 在两条路上给的是
  // 同一种东西，调用方不必知道算力从哪来。

  var T_NONE = 0xFFFFFFFF;
  var K_NULL = 0, K_BOOL = 1, K_INT = 2, K_F64 = 3, K_STR = 4,
      K_F64S = 5, K_I64S = 6, K_STRS = 7, K_LIST = 8, K_MAP = 9;
  var utf8 = { enc: new TextEncoder(), dec: new TextDecoder('utf-8') };

  function isTable(v) {
    //: a rectangular numeric table (nested arrays / typed arrays) -> [shape, flat]
    if (v instanceof Float64Array || v instanceof Float32Array
        || v instanceof Int32Array || v instanceof Uint32Array
        || v instanceof Int16Array || v instanceof Uint16Array || v instanceof Uint8Array) {
      return [[v.length], Array.prototype.slice.call(v)];
    }
    if (!Array.isArray(v) || v.length === 0) return null;
    if (v.every(function (x) { return typeof x === 'number'; })) return [[v.length], v.slice()];
    if (!v.every(function (x) { return Array.isArray(x) || ArrayBuffer.isView(x); })) return null;
    var first = isTable(v[0]);
    if (!first) return null;
    var flat = [], i, t;
    for (i = 0; i < v.length; i++) {
      t = isTable(v[i]);
      if (!t || t[0].join(',') !== first[0].join(',')) return null;
      flat = flat.concat(t[1]);
    }
    return [[v.length].concat(first[0]), flat];
  }

  function encodeTree(rootValue) {
    var nodes = [], names = [], f64s = [], ints = [];
    function name(s) {
      var b = utf8.enc.encode(String(s)), off = names.length, i;
      for (i = 0; i < b.length; i++) names.push(b[i]);
      return [off, b.length];
    }
    function shape(sh) {
      var off = ints.length, i;
      ints.push(BigInt(sh.length));
      for (i = 0; i < sh.length; i++) ints.push(BigInt(sh[i]));
      return off;
    }
    function write(key, v) {
      var nm = key === null ? [0, 0] : name(key);
      var rec = [K_NULL, nm[0], nm[1], T_NONE, T_NONE, 0, 0, T_NONE];
      var children = [], t, i, pairs;
      if (v === null || v === undefined) {
        /* Null */
      } else if (typeof v === 'boolean') {
        rec[0] = K_BOOL; rec[5] = ints.length; rec[6] = 1; ints.push(v ? 1n : 0n);
      } else if (typeof v === 'bigint') {
        rec[0] = K_INT; rec[5] = ints.length; rec[6] = 1; ints.push(v);
      } else if (typeof v === 'number') {
        rec[0] = K_F64; rec[5] = f64s.length; rec[6] = 1; f64s.push(v);
      } else if (typeof v === 'string') {
        rec[0] = K_STR; t = name(v); rec[5] = t[0]; rec[6] = t[1];
      } else if (v instanceof BigInt64Array) {
        rec[0] = K_I64S; rec[7] = shape([v.length]); rec[5] = ints.length; rec[6] = v.length;
        for (i = 0; i < v.length; i++) ints.push(v[i]);
      } else if (Array.isArray(v) && v.length && v.every(function (x) { return typeof x === 'string'; })) {
        rec[0] = K_STRS; rec[7] = shape([v.length]);
        pairs = v.map(name);
        rec[5] = ints.length; rec[6] = v.length;
        for (i = 0; i < pairs.length; i++) { ints.push(BigInt(pairs[i][0])); ints.push(BigInt(pairs[i][1])); }
      } else if ((t = isTable(v)) !== null) {
        rec[0] = K_F64S; rec[7] = shape(t[0]); rec[5] = f64s.length; rec[6] = t[1].length;
        for (i = 0; i < t[1].length; i++) f64s.push(Number(t[1][i]));
      } else if (Array.isArray(v)) {
        rec[0] = K_LIST;
        for (i = 0; i < v.length; i++) children.push([null, v[i]]);
      } else if (typeof v === 'object') {
        rec[0] = K_MAP;
        Object.keys(v).forEach(function (k) { children.push([k, v[k]]); });
      } else {
        throw new Error('FyKernelApi.tree: cannot encode a ' + typeof v + ' at ' + key);
      }
      var idx = nodes.length;
      nodes.push(rec);
      var prev = null, ci;
      for (i = 0; i < children.length; i++) {
        ci = write(children[i][0], children[i][1]);
        if (prev === null) nodes[idx][3] = ci; else nodes[prev][4] = ci;
        prev = ci;
      }
      return idx;
    }
    write(null, rootValue);
    var flat = new Uint32Array(nodes.length * 8), i, j;
    for (i = 0; i < nodes.length; i++) for (j = 0; j < 8; j++) flat[i * 8 + j] = nodes[i][j] >>> 0;
    return { nodes: flat, names: Uint8Array.from(names), f64s: Float64Array.from(f64s),
             ints: BigInt64Array.from(ints) };
  }

  function decodeTree(b) {
    var nodes = b.nodes, names = b.names, f64s = b.f64s, ints = b.ints;
    function text(off, ln) { return utf8.dec.decode(names.subarray(off, off + ln)); }
    function shapeOf(i) {
      var so = nodes[i * 8 + 7];
      if (so === T_NONE) return [];
      var nd = Number(ints[so]), sh = [], k;
      for (k = 0; k < nd; k++) sh.push(Number(ints[so + 1 + k]));
      return sh;
    }
    function nest(flat, sh) {
      if (sh.length <= 1) return flat;
      var step = flat.length / sh[0], out = [], k;
      for (k = 0; k < sh[0]; k++) out.push(nest(flat.slice(k * step, (k + 1) * step), sh.slice(1)));
      return out;
    }
    function val(i) {
      var k = nodes[i * 8], po = nodes[i * 8 + 5], pl = nodes[i * 8 + 6], c, out, j;
      switch (k) {
        case K_NULL: return null;
        case K_BOOL: return ints[po] !== 0n;
        case K_INT: return Number(ints[po]);
        case K_F64: return f64s[po];
        case K_STR: return text(po, pl);
        case K_F64S: return nest(Array.prototype.slice.call(f64s.subarray(po, po + pl)), shapeOf(i));
        case K_I64S:
          out = [];
          for (j = 0; j < pl; j++) out.push(Number(ints[po + j]));
          return nest(out, shapeOf(i));
        case K_STRS:
          out = [];
          for (j = 0; j < pl; j++) out.push(text(Number(ints[po + 2 * j]), Number(ints[po + 2 * j + 1])));
          return out;
        case K_LIST:
          out = [];
          for (c = nodes[i * 8 + 3]; c !== T_NONE; c = nodes[c * 8 + 4]) out.push(val(c));
          return out;
        default:
          out = {};
          for (c = nodes[i * 8 + 3]; c !== T_NONE; c = nodes[c * 8 + 4]) {
            out[text(nodes[c * 8 + 1], nodes[c * 8 + 2])] = val(c);
          }
          return out;
      }
    }
    return nodes.length ? val(0) : null;
  }

  function refusalError(refusal) {
    var err = new Error('the kernel refused (' + refusal.code + '): ' + refusal.message);
    err.code = refusal.code;
    err.refusal = refusal;
    return err;
  }

  /**
   * The document door, SYNCHRONOUS, on a kernel handle: `fy.e` is either a wasm
   * instance's exports (the static site) or the `/api/kernel` bridge from
   * `exportsFor` (the desktop host, `fy.via === 'api'`).  On the bridge the
   * structure door is not bridged by name, so the plan goes to `/api/case`
   * over the same synchronous XHR the bridge uses; on wasm the four buffers
   * are written into linear memory and `fylite_rs_fyo_tree` is called.
   *
   * Returns the record as plain JS; a refusal THROWS an Error carrying `.code`
   * and `.refusal`, as `FyKernelApi.complete` does.
   */
  function completeSync(fy, code, plan, base) {
    var e = fy && fy.e;
    if (!e) throw new Error('FyKernelApi.completeSync: no kernel handle');
    //: ★第十八刀: the extension module has a door of its own (`fylite_ext_fyo_tree`,
    //: the turbulent closure) — the same four segments, under its own name
    var door = typeof e.fylite_rs_fyo_tree === 'function' ? e.fylite_rs_fyo_tree
             : (typeof e.fylite_ext_fyo_tree === 'function' ? e.fylite_ext_fyo_tree : null);
    if (fy.via === 'api' || !door) {
      if (!door && fy.via !== 'api') {
        throw new Error('this kernel has no fylite_rs_fyo_tree — rebuild it (ABI >= 126)');
      }
      var x = new XMLHttpRequest();
      x.open('POST', (base || ROOT) + 'api/case', false);
      x.setRequestHeader('content-type', 'application/json');
      x.send(JSON.stringify({ code: String(code), plan: plan || {} }));
      var j = null;
      try { j = JSON.parse(x.responseText); } catch (err) { /* not JSON */ }
      if (x.status !== 200) throw new Error('/api/case: HTTP ' + x.status + ' — ' + ((j && j.error) || x.responseText));
      if (j && j.refusal) throw refusalError(j.refusal);
      return j.record;
    }
    var b = encodeTree(plan || {});
    var codeB = utf8.enc.encode(String(code));
    var mem = e.memory;
    function alloc(n) {
      var p = e.fylite_rs_alloc(BigInt(Math.max(8, n)));
      if (!p) throw new Error('FyKernelApi.completeSync: wasm allocation of ' + n + ' bytes failed');
      return Number(p);
    }
    var pCode = alloc(codeB.length), pNodes = alloc(b.nodes.byteLength), pNames = alloc(b.names.byteLength),
        pF64 = alloc(b.f64s.byteLength), pInts = alloc(b.ints.byteLength), pOut = alloc(64);
    //: views are taken AFTER every alloc: growth invalidates them
    new Uint8Array(mem.buffer).set(codeB, pCode);
    new Uint32Array(mem.buffer, pNodes, b.nodes.length).set(b.nodes);
    new Uint8Array(mem.buffer).set(b.names, pNames);
    new Float64Array(mem.buffer, pF64, b.f64s.length).set(b.f64s);
    new BigInt64Array(mem.buffer, pInts, b.ints.length).set(b.ints);
    new Uint8Array(mem.buffer, pOut, 64).fill(0);
    var rc = door(
      pCode, BigInt(codeB.length),
      pNodes, BigInt(b.nodes.length / 8), pNames, BigInt(b.names.length),
      pF64, BigInt(b.f64s.length), pInts, BigInt(b.ints.length),
      pOut, pOut + 8, pOut + 16, pOut + 24, pOut + 32, pOut + 40, pOut + 48, pOut + 56);
    var dv = new DataView(mem.buffer);
    var oNodes = dv.getUint32(pOut, true), nn = Number(dv.getBigUint64(pOut + 8, true)),
        oNames = dv.getUint32(pOut + 16, true), ml = Number(dv.getBigUint64(pOut + 24, true)),
        oF64 = dv.getUint32(pOut + 32, true), nf = Number(dv.getBigUint64(pOut + 40, true)),
        oInts = dv.getUint32(pOut + 48, true), ni = Number(dv.getBigUint64(pOut + 56, true));
    var out = {
      nodes: nn ? new Uint32Array(mem.buffer, oNodes, nn * 8).slice() : new Uint32Array(0),
      names: ml ? new Uint8Array(mem.buffer, oNames, ml).slice() : new Uint8Array(0),
      f64s: nf ? new Float64Array(mem.buffer, oF64, nf).slice() : new Float64Array(0),
      ints: ni ? new BigInt64Array(mem.buffer, oInts, ni).slice() : new BigInt64Array(0),
    };
    if (nn) e.fylite_rs_free(oNodes, BigInt(nn * 32));
    if (ml) e.fylite_rs_free(oNames, BigInt(ml));
    if (nf) e.fylite_rs_free(oF64, BigInt(nf * 8));
    if (ni) e.fylite_rs_free(oInts, BigInt(ni * 8));
    e.fylite_rs_free(pCode, BigInt(Math.max(8, codeB.length)));
    e.fylite_rs_free(pNodes, BigInt(Math.max(8, b.nodes.byteLength)));
    e.fylite_rs_free(pNames, BigInt(Math.max(8, b.names.byteLength)));
    e.fylite_rs_free(pF64, BigInt(Math.max(8, b.f64s.byteLength)));
    e.fylite_rs_free(pInts, BigInt(Math.max(8, b.ints.byteLength)));
    e.fylite_rs_free(pOut, 64n);
    var tree = decodeTree(out);
    if (rc < 0) {
      throw refusalError((tree && tree.refusal) || { code: rc, message: 'fylite_rs_fyo_tree returned ' + rc });
    }
    return tree;
  }

  root.FyKernelApi = { probe: probe, exportsFor: exportsFor, Heap: Heap, complete: complete,
                       completeSync: completeSync,
                       tree: { encode: encodeTree, decode: decodeTree, NONE: T_NONE } };
}(typeof self !== 'undefined' ? self : this));
