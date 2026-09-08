// The source stack: one input port, several sources, composed once by the
// middle layer (`FYL-DESIGN-18` U-5 · U-6 · U-7, §五).
//
// ★The page orders and switches; it does not merge.  Merging is one
// implementation in the middle layer (`FYL-DESIGN-14` D-3 / L-1), and a second
// one here would be the third copy of「怎么合并两份文档」in this repository.
// So what this file produces is an ASSEMBLY DOCUMENT (`fylite:Assembly/1`) —
// aliases, an ordered `merge`, an optional `select` — and what it consumes is
// the document that came back.
//
// ★★THE STACK IS TOP-WINS; `merge` IS LAST-WINS.  The contract is stated by the
// middle layer itself, in the module header of
// `rust/fylite_runtime/src/assembly.rs`: 「`merge` 里的源逐个读进来合并（后者覆盖
// 前者，叶子级）」.  The stack in §五 is drawn the other way round — the first row
// is the one that wins — so `assembly()` writes `merge` in REVERSE stack order.
// Writing it in stack order would invert every priority silently: the numbers
// still assemble, the table still renders, and the answer comes from the source
// the reader ranked last.
//
// ★Where that is checked, and where it is NOT.  `validate-sources.mjs` asserts
// the ORDER this file writes against that stated contract.  It does not execute
// the merge, because the browser has no way to: `fylite_runtime` compiles to
// wasm but exports nothing — `c_api` and `assembly` are both behind the `mdsip`
// feature the wasm tier switches off (G-15), so `FYL-DESIGN-16` H-4 / phase W-1
// has not landed.  Until it does, this file writes a document that nothing in
// the browser can run, and says so rather than borrowing another host's answer:
// **Python is not in the front end's path** (user ruling, 2026-09-04).
//
// ★Per-quantity provenance is DERIVED here, and says so (U-6, G-14).  The
// middle layer records which sources were merged (`fylite:assembly.merged`) but
// not which leaf came from which — so a provenance table read straight off the
// assembled document cannot exist yet.  What the page can do honestly is report
// what each source it HOLDS offers, and apply the merge rule to say who won and
// who was shadowed.  Every row is marked with where the answer came from:
// `recorded` when the middle layer said it, `derived` when the page worked it
// out, and a source whose document the page does not hold (an mdsbind source)
// is listed as `opaque` rather than guessed at.
(function (root) {
  'use strict';

  //: the kinds of layer §五's table admits, and how each is addressed
  var KINDS = {
    fetch: { uri: function (l) { return 'file:' + l.file; }, holds: true },
    file: { uri: function (l) { return 'file:' + l.file; }, holds: true },
    device: { uri: function (l) { return 'file:' + l.file; }, holds: true },
    record: { uri: function (l) { return 'file:' + l.file; }, holds: true },
    hand: { uri: function (l) { return 'file:' + l.file; }, holds: true },
    //: an MDSplus binding is read by the middle layer at assembly time; the
    //: page never holds its content, and must not pretend to
    mdsbind: { uri: function (l) { return 'mdsbind:' + l.file + (l.query || ''); }, holds: false }
  };

  function alias(l, i) { return l.alias || (l.kind + '_' + i); }

  /** Every numeric-or-scalar leaf path of a document, as a set. */
  function leaves(node, prefix, out) {
    out = out || {};
    if (node === null || node === undefined) return out;
    if (Array.isArray(node)) {
      if (node.length && node[0] && typeof node[0] === 'object' && !Array.isArray(node[0])) {
        //: a structure array: index by the element's `name` when it has one,
        //: because that is what the middle layer aligns on (L-12) — indexing by
        //: position here would report a leaf as shadowed when the two sources
        //: merely list their channels in a different order
        node.forEach(function (el, i) {
          var key = (el && el.name) || String(i);
          leaves(el, prefix + '[' + key + ']', out);
        });
      } else out[prefix] = true;
      return out;
    }
    if (typeof node === 'object') {
      Object.keys(node).forEach(function (k) {
        if (k.charAt(0) === '@' || k === 'id' || k === 'type') return;
        leaves(node[k], prefix ? prefix + '/' + k : k, out);
      });
      return out;
    }
    out[prefix] = true;
    return out;
  }

  /**
   * A stack for one port.
   *
   *   var s = FySources.stack('magnetics', [
   *     {kind: 'fetch',  file: 'meas.json', doc: measDoc, label: 'MDSplus 取数文档'},
   *     {kind: 'device', file: 'east.json', doc: deviceDoc, label: '装置卷宗'},
   *     {kind: 'hand',   file: 'weights.json', doc: handDoc, on: false}
   *   ]);
   *   s.assembly();      // -> the fylite:Assembly/1 document
   *   s.provenance();    // -> one row per leaf: who won, who was shadowed
   */
  function stack(port, layers) {
    var ls = (layers || []).map(function (l, i) {
      var c = {};
      Object.keys(l).forEach(function (k) { c[k] = l[k]; });
      if (c.on === undefined) c.on = true;
      c.alias = alias(c, i);
      return c;
    });

    var api = {
      port: function () { return port; },
      layers: function () { return ls.map(function (l) { return l; }); },
      /** Move a layer up (towards winning) or down. */
      move: function (i, d) {
        var j = i + d;
        if (i < 0 || i >= ls.length || j < 0 || j >= ls.length) return false;
        var t = ls[i]; ls[i] = ls[j]; ls[j] = t;
        return true;
      },
      toggle: function (i, on) {
        if (i < 0 || i >= ls.length) return false;
        ls[i].on = on === undefined ? !ls[i].on : !!on;
        return true;
      },

      /**
       * The assembly document (U-5).  `merge` is the ENABLED layers in
       * REVERSE stack order, because the middle layer's last entry wins and
       * this stack's first row wins.
       */
      assembly: function (opts) {
        opts = opts || {};
        var on = ls.filter(function (l) { return l.on; });
        var src = {};
        on.forEach(function (l) {
          var k = KINDS[l.kind];
          if (!k) throw new Error('sources.js: unknown layer kind ' + l.kind);
          src[l.alias] = k.uri(l);
        });
        var doc = { '@type': 'fylite:Assembly/1', '$source': src,
                    merge: on.map(function (l) { return l.alias; }).reverse() };
        if (opts.params) doc.params = opts.params;
        if (opts.select) doc.select = opts.select;
        //: what the page believes it asked for, kept beside the request so a
        //: reader of the exported document can see the stack that produced it
        doc['fylite:stack'] = ls.map(function (l) {
          return { alias: l.alias, kind: l.kind, on: !!l.on, label: l.label || null };
        });
        return doc;
      },

      /**
       * One row per leaf: which layer won it, which layers were shadowed, and
       * which layers could not be inspected from here (U-6 · U-7).
       */
      provenance: function (assembled) {
        var seen = {}, rows = [], opaque = [];
        ls.forEach(function (l) {
          if (!l.on) return;
          if (!KINDS[l.kind].holds || !l.doc) { opaque.push(l.alias); return; }
          var ks = leaves(l.doc, '');
          Object.keys(ks).forEach(function (path) {
            (seen[path] = seen[path] || []).push(l.alias);
          });
        });
        Object.keys(seen).sort().forEach(function (path) {
          rows.push({ path: path, from: seen[path][0],
                      shadowed: seen[path].slice(1),
                      //: ★the page WORKED THIS OUT; it did not read it.  The
                      //: middle layer records only which sources were merged
                      //: (G-14), so saying「recorded」here would be a claim
                      //: about a provenance nobody wrote down.
                      basis: 'derived' });
        });
        var rec = assembled && (assembled['fylite:assembly'] || null);
        return { rows: rows, opaque: opaque,
                 recorded: rec ? { merged: rec.merged || null, shot: rec.shot } : null,
                 note: opaque.length
                   ? '有 ' + opaque.length + ' 个源的内容页面拿不到（' + opaque.join('、') +
                     '），它们给出的量不在下表里——不是没给，是这里看不见'
                   : '' };
      }
    };
    return api;
  }

  /**
   * A record's output port, as a source layer (U-5 的第五行).
   *
   * ★This is the ruling that folds four things into one: the two hand-off
   * mechanisms of `-10` P-4, the named artifact of P-21, `handoff.js`'s single
   * slot, and `-12` G-2's silently stale reader.  A downstream bar binds the
   * upstream's RECORD; when the upstream runs again the generation moves and
   * this layer is marked stale — visible, and updated only when the reader
   * says so (P-23's discipline, applied to hand-off).
   */
  function fromRecord(record, portName, opts) {
    opts = opts || {};
    var doc = null;
    (record.inputs || []).forEach(function (b) {
      var bp = b.binds_port || {};
      if (bp.port_direction === 'output' && bp.port_name === portName) doc = b.bound_to;
    });
    if (!doc) return null;
    return { kind: 'record', file: opts.file || (record.id + '.jsonld'), doc: doc,
             label: opts.label || ('上游记录 ' + record.id),
             generation: record.id, on: true };
  }

  /** Is a record layer still the upstream's current answer? */
  function stale(layer, currentRecordId) {
    if (!layer || layer.kind !== 'record') return false;
    return !!currentRecordId && layer.generation !== currentRecordId;
  }

  root.FySources = { stack: stack, fromRecord: fromRecord, stale: stale,
                     leaves: leaves, KINDS: KINDS };
})(typeof self !== 'undefined' ? self : this);
