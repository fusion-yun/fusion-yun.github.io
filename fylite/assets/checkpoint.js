// The checkpoint store: a checkpoint IS a record (`FYL-DESIGN-18` U-10 · U-11 ·
// U-19, stage U0).
//
// ★No checkpoint format.  What is stored is the `spo:ComputationRecord` the
// door handed back, with its `fylite:state` subtree, byte for byte — the same
// document the export menu writes and the same one `fy run --resume` or
// another browser reads back (U-18 / U-19).  So there is nothing to convert
// when a run moves elsewhere, and nothing that can drift from the record it is
// supposed to be a copy of.  The row in the index carries only what a LIST
// needs (name, step, kernel, when, size); every one of those values is read
// out of the record, never supplied beside it.
//
// ★A checkpoint carries the identity of the kernel that wrote it (U-11 · S-6 ·
// K-7).  Resuming under a different kernel is refused by name; an explicit
// override is allowed and is WRITTEN INTO the record's `environment` when used,
// because a number produced half by one kernel and half by another is a fact
// about the run that the run has to carry.
//
// ★IndexedDB, and honest failure.  A private window, blocked site data or a
// thumbnailer make the store unavailable; `available()` says so and every call
// rejects with a sentence rather than throwing something the page swallows.
// The march does not depend on it (`run.js` keeps going when the store
// refuses) — losing insurance is not losing the work.
(function (root) {
  'use strict';

  var DB = 'fylite', STORE = 'checkpoints', VERSION = 1;
  var idb = root.indexedDB || root.mozIndexedDB || root.webkitIndexedDB || null;

  function unavailable(why) {
    return Promise.reject(new Error('断点仓不可用：' + why));
  }

  function open() {
    if (!idb) return unavailable('这个浏览器上下文没有 IndexedDB');
    return new Promise(function (resolve, reject) {
      var req;
      try { req = idb.open(DB, VERSION); } catch (e) { reject(new Error('断点仓不可用：' + e.message)); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'key' });
          os.createIndex('name', 'name', { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(new Error('断点仓不可用：' + (req.error && req.error.message))); };
      req.onblocked = function () { reject(new Error('断点仓不可用：另一个标签页锁着它')); };
    });
  }

  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode), os = t.objectStore(STORE), out;
        try { out = fn(os); } catch (e) { reject(e); return; }
        t.oncomplete = function () { db.close(); resolve(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { db.close(); reject(t.error || new Error('断点仓事务失败')); };
        t.onabort = function () { db.close(); reject(t.error || new Error('断点仓事务中止')); };
      });
    });
  }

  // --------------------------------------------------------------------- //
  // what a record says about itself
  // --------------------------------------------------------------------- //

  /** The identity of the kernel that produced a record (K-7). */
  function identity(record) {
    var env = (record && (record.environment || record['spo:environment'])) || {};
    return { sha256: env.kernel_sha256 || env.sha256 || null,
             abi: env.abi === undefined ? null : env.abi,
             app: env.app_version || null };
  }

  /** How far a record's own state got, when it says (S-2 / U-8). */
  function stepOf(record) {
    var st = record && (record['fylite:state'] || record.state);
    if (st && typeof st === 'object') {
      for (var k in st) if (k === 'step' || k === 'done' || k === 'nstep') return st[k];
    }
    return null;
  }

  /**
   * May this record be resumed under `kernel`? (U-11)
   *
   * Returns `{ok, why}`.  `ok` false is not an error — it is the answer, and
   * the sentence is what the page shows beside a greyed-out 「恢复」.
   */
  function resumable(record, kernel) {
    var id = identity(record);
    if (!record || record.type !== 'spo:ComputationRecord')
      return { ok: false, why: '这不是一份记录（type 不是 spo:ComputationRecord）' };
    if (!(record['fylite:state'] || record.state))
      return { ok: false, why: '这份记录没有 fylite:state —— 单步 code 的记录无中间态可续' };
    if (!kernel || !kernel.sha256) return { ok: false, why: '当前内核还没报出身份，等它就绪' };
    if (!id.sha256) return { ok: false, why: '这份记录没有记下写它的内核身份（K-7），不能判断能不能续' };
    if (id.sha256 !== kernel.sha256)
      return { ok: false, why: '内核已变：' + String(id.sha256).slice(0, 8) + '… → ' +
                              String(kernel.sha256).slice(0, 8) + '…（S-6：内核拒绝不是自己写的状态）' };
    if (id.abi !== null && kernel.abi !== undefined && id.abi !== kernel.abi)
      return { ok: false, why: 'ABI 号不同：' + id.abi + ' → ' + kernel.abi };
    return { ok: true, why: '' };
  }

  /**
   * The record to hand back to the door when resuming, with the drift, if any,
   * recorded in it (U-11: an override is explained in the record, not in a
   * checkbox nobody exports).
   */
  function forResume(record, kernel, override) {
    var v = resumable(record, kernel);
    if (v.ok) return record;
    if (!override) throw new Error(v.why);
    var out = JSON.parse(JSON.stringify(record));
    out.environment = out.environment || {};
    out.environment.kernel_drift_allowed = true;
    out.environment.kernel_sha256_written_by = identity(record).sha256;
    out.environment.kernel_sha256 = kernel.sha256;
    out.caveat = (out.caveat || []).concat([
      '断点在另一个内核上续跑，由使用者显式允许：' + v.why]);
    return out;
  }

  // --------------------------------------------------------------------- //
  // the store
  // --------------------------------------------------------------------- //

  /** Store one record. `name` is the case / bar it belongs to. */
  function put(name, record, extra) {
    var text = JSON.stringify(record);
    var row = {
      key: (extra && extra.key) || (name + '@' + (stepOf(record) === null ? Date.now() : stepOf(record))),
      name: name,
      step: stepOf(record),
      budget: (extra && extra.budget) === undefined ? null : extra.budget,
      kernel: identity(record).sha256,
      abi: identity(record).abi,
      when: Date.now(),
      bytes: text.length,
      //: ★the record itself, as TEXT.  Structured-clone would store an object
      //: that is equal but not identical — key order changes, and a reader
      //: comparing an export against a checkpoint would see two files that
      //: differ in bytes and agree in meaning.  U-18 wants the same bytes.
      record: text
    };
    return tx('readwrite', function (os) { os.put(row); return row.key; });
  }

  /** The rows, newest first — enough to draw the list, without the records. */
  function list() {
    return tx('readonly', function (os) {
      var out = { result: [] };
      os.openCursor().onsuccess = function (e) {
        var c = e.target.result;
        if (!c) return;
        var r = c.value;
        out.result.push({ key: r.key, name: r.name, step: r.step, budget: r.budget,
                          kernel: r.kernel, abi: r.abi, when: r.when, bytes: r.bytes });
        c.continue();
      };
      return out;
    }).then(function (rows) {
      return rows.sort(function (a, b) { return b.when - a.when; });
    });
  }

  /** The record, parsed. `text()` gives the same bytes that were stored. */
  function get(key) { return text(key).then(function (t) { return t === null ? null : JSON.parse(t); }); }

  function text(key) {
    return tx('readonly', function (os) { return os.get(key); })
      .then(function (row) { return row ? row.record : null; });
  }

  function remove(key) { return tx('readwrite', function (os) { os.delete(key); return key; }); }

  function clear() { return tx('readwrite', function (os) { os.clear(); return true; }); }

  root.FyCheckpoint = {
    available: function () { return !!idb; },
    put: put, list: list, get: get, text: text, remove: remove, clear: clear,
    identity: identity, stepOf: stepOf, resumable: resumable, forResume: forResume,
    DB: DB, STORE: STORE
  };
})(typeof self !== 'undefined' ? self : this);
