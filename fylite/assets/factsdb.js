// facts —— 装置信息，**从中间层 wasm 里读**，不再 fetch 一份 JSON。
//
// ★★2026-09-05 用户裁定：**页面也走中间层 wasm，撤掉 `facts.jsonld`**。
// 在此之前同一批装置字节在一个制品里装两遍：一遍是页面 fetch 的 JSON（站点上是
// 文件，可执行文件里是 `assets.rs` 的 `include_bytes!`），一遍编进 Rust 给命令行。
// 两份字节、两条通路，而**没有任何东西保证它们描述同一批机器**——目录说有七台、
// 文件只有六台，这种事不会有任何东西红，只会让读者点下去得到一句「装置数据坏了」。
// 今天只剩一份 `facts.rs`：`libfylite_runtime.so` 与 `fylite_runtime.wasm` 各编进
// 它，命令行与页面读的是同一批字节。
//
// ★这份 wasm 与 `fylite_rs.wasm` / `fylite_kernel_ext.wasm` **不是一回事**：那两份
// 是物理核（私有仓），这一份是中间层（本仓 `rust/fylite_runtime/`）。它零导入
// （`FYL-DESIGN-16` H-5），所以实例化不需要任何宿主函数。
//
// ★★取的是 **`fylite_web.wasm`（0.51 MB），不是 `fylite_runtime.wasm`（2.14 MB）**
// （2026-09-05）。两者同一份源码、同一段装置门代码，差别只在还导出了什么——wasm 上
// 每个导出都是链接的根，所以带全套 C 导出的那一份把 JSON / YAML / g-file / 文档树 /
// IDS 结构表全留着，而页面从中间层只读装置信息。小的那一份**进得了 service worker 的
// 预缓存**，于是断网时站点仍然列得出机器；2.14 MB 那一份按裁定不进预缓存，实测断网
// 之后装置面板一台也没有。
//
// ★★**惰性**：只有真要读装置时才取这份 wasm。装置面板不是首屏必需的东西——首页
// 不列机器。★但它**进预缓存**（0.43 MB，`tools/make-sw.mjs`）：惰性说的是「什么时候
// 取」，预缓存说的是「离线时取不取得到」，两件事。
//
// 取字符串的写法与库里其余导出一致：`cap = 0` 先问长度，再给足缓冲问第二次。
// 输入串也要落进库的线性内存（wasm 上宿主与库不共享地址空间），所以有 alloc/free。

(function (root) {
  'use strict';

  //: ★★载入与字符串编解码**不在这里了**（2026-09-05）：它们搬进 `runtimeweb.js`，
  //: 因为 g-file 的读法也开始用同一份 wasm（`geqdsk.js`，H-4 第一块）——一段被两处
  //: 用的代码留在其中一处的文件里，下一个读者要靠记忆知道去哪儿找。这里只剩装置
  //: 那扇门自己的语义：探哪条路、怎么问、答复怎么读。
  var W = root.FyRuntimeWeb;

  //: 探过一次就记住：`null` = 还没探，`false` = 没有这条路，函数 = 有。
  var apiFace = null;
  var ROOT = W ? W.root() : '';

  function loopback() {
    try {
      var h = location.hostname;
      return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]';
    } catch (e) { return false; }
  }

  /** `/api/facts?…` if this host answers it, else `null` — probed once. */
  function api(query) {
    if (apiFace === false) return Promise.resolve(null);
    if (typeof fetch !== 'function' || !loopback()) { apiFace = false; return Promise.resolve(null); }
    return fetch(ROOT + 'api/facts?' + query, { headers: { accept: 'application/json' } })
      .then(function (r) {
        //: ★400 与 404 不是一回事：前者是「这条路在，你问错了」（一台不在这一版里的
        //: 机器），后者是「这个宿主没有这条路」。只有后者才该退回 wasm——把前者也退
        //: 回去，会让一个明确的「不带这台」变成一次静默的第二次查询。
        if (r.status === 404) { apiFace = false; return null; }
        apiFace = true;
        if (r.status === 400) return { missing: true };
        if (!r.ok) throw new Error('api/facts: HTTP ' + r.status);
        return r.text();
      })
      .catch(function () { apiFace = false; return null; });
  }

  function versioned(url) {
    //: 与 `fylite.js` 的 `versioned()` 同一条规矩：磁盘上的真文件带版本
    //: （`tools/soname.sh`），页面写不带版本的名字，这里补上。
    var v = root.FyRuntimeVersion;
    if (!v || !/\.wasm$/.test(url)) return url;
    return url + '.' + v;
  }

  /**
   * Fetch and instantiate the middle layer.  Resolves to the exports.
   *
   * ★★**站点根，不是页面所在目录**（2026-09-05 实测修）。这里从前写的是相对名
   * `assets/fylite_runtime.wasm`，而它是相对**当前页面**解析的：首页
   * （`/index.html`）碰巧对，`/pages/pulse_design.html` 上就变成
   * `/pages/assets/fylite_runtime.wasm.0.0.1` —— 404。后果不是一句报错：装置一台
   * 也读不进，`FYLITE_MACHINE` 是 `null`，页面在第一次画图时以
   * `Cannot read properties of null (reading 'limiter')` 死掉。**四个功能页全中**，
   * 而站点构建、node 闸子（它们自己 stub 掉 `fetch`）全绿——只有真浏览器看得见。
   * `ROOT` 是从本脚本自己的 URL 反推的站点根（上面那段），`/api/*` 一直用的就是它。
   */
  function load(url) {
    if (inst) return Promise.resolve(inst);
    if (pending) return pending;
    var u = versioned(url ? url : ROOT + 'assets/fylite_facts.wasm');
    pending = fetch(u)
      .then(function (r) {
        if (!r.ok) throw new Error('fetch ' + u + ': HTTP ' + r.status);
        return r.arrayBuffer();
      })
      //: ★不用 instantiateStreaming：有些静态主机把 .wasm 的 Content-Type 发错，
      //: 流式编译当场失败，而缓冲这条路照走（与 `fylite.js` 同一条注记）。
      .then(function (buf) { return WebAssembly.instantiate(buf, {}); })
      .then(function (res) {
        var e = res.instance.exports;
        var missing = REQUIRED.filter(function (k) { return !e[k]; });
        if (missing.length)
          throw new Error(u + ': 缺少导出 ' + missing.join(', '));
        inst = e;
        pending = null;
        return e;
      })
      .catch(function (err) { pending = null; throw err; });
    return pending;
  }

  function bytes(e) { return new Uint8Array(e.memory.buffer); }

  //: ★★长度与返回码在 C ABI 上是 `u64` / `i64`，wasm 里就是 `i64`，而 JS 那边
  //: **只能是 BigInt**——传 Number 会当场 `TypeError: Cannot convert 6 to a BigInt`。
  //: 指针是 `*const u8`，在 wasm32 上是 `i32`，仍是普通 Number。两种一起出现，所以
  //: 这两个转换函数就在这里，而不是散在每个调用点：散着写，漏掉一处的表现是一句
  //: 与 facts 毫无关系的类型错。
  function u64(n) { return BigInt(n); }
  function num(n) { return typeof n === 'bigint' ? Number(n) : n; }

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
   * The two-call read: ask for the length, then ask again with a buffer.
   *
   * ★`ask` returns the length it WANTED, so a short buffer is not silent
   * truncation — it is a number bigger than the buffer, and we grow.
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

  /** Every id in a domain, `catalogue` included.  Resolves to an array. */
  function ids(domain) {
    return api('domain=' + encodeURIComponent(domain)).then(function (t) {
      if (t && !t.missing) return (JSON.parse(t).ids) || [];
      if (t && t.missing) return [];
      return idsFromWasm(domain);
    });
  }

  function idsFromWasm(domain) {
    return W.load().then(function () {
      var t = W.callText('fylite_runtime_facts_ids', domain);
      if (typeof t !== 'string') throw new Error('facts_ids(' + domain + ') -> ' + t);
      return t ? t.split('\n') : [];
    });
  }

  /**
   * One entry's document, parsed.  `null` when this build does not carry it.
   *
   * ★「这一版不带它」与「它坏了」是两回事，所以缺条目回 `null` 而不是抛：调用方
   * 拿它对读者说前一句，抛出来的才是后一句。
   */
  function doc(domain, ident) {
    return api('domain=' + encodeURIComponent(domain) + '&id=' + encodeURIComponent(ident))
      .then(function (t) {
        if (t && t.missing) return null;      //: 这条路在，而这一版不带它
        if (typeof t === 'string') return JSON.parse(t);
        return docFromWasm(domain, ident);
      });
  }

  function docFromWasm(domain, ident) {
    return W.load().then(function (e) {
      //: ★这一扇门要两个字符串，`callText` 只递一个——所以这里自己摆两段缓冲，
      //: 用的仍是 `runtimeweb.js` 的那套助手（一处实现）。
      return W.withStr(e, domain, function (dp, dn) {
        return W.withStr(e, ident, function (ip, inn) {
          var t = W.pull(e, function (o, c) {
            return e.fylite_runtime_facts_doc(dp, W.u64(dn), ip, W.u64(inn), o, c);
          });
          if (t === -2) return null;
          if (typeof t !== 'string') throw new Error('facts_doc(' + domain + '/' + ident + ') -> ' + t);
          return JSON.parse(t);
        });
      });
    });
  }

  /** How many entries this build carries (catalogues excluded). */
  function count() {
    return ids('device').then(function (a) {
      return a.filter(function (n) { return n !== 'catalogue'; }).length;
    });
  }

    //: ★`load` 转手给中间层的载入器：调用方（`devices.js` 的 boot）不必知道那份
  //: wasm 是谁在管。
  root.FyFactsDb = { load: function (u) { return W.load(u); },
                     ids: ids, doc: doc, count: count };
})(typeof self !== 'undefined' ? self : this);
