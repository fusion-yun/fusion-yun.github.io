// The fyo document face for the browser: one walker, over the DECLARED
// paths.
//
// ★★Why this file exists.  The pages wrote fyo documents by spelling their
// paths inline, and so did `python/fylite/fyo.py` — two independent
// spellings of one contract, with only the `fylite:` TERM list shared
// between them, and the browser copy of that list had no reader at all.
// The paths are declared once now (`rust/fylite/src/fyo.rs`) and generated
// into both hosts; this is the half that walks them here, so a page says
// WHICH SLOT it is writing and never where it goes.
//
// `FyNames` (assets/fyo-interface.js) is the generated table; this is the
// hand-written walker over it, and the two are deliberately separate files
// for the same reason `_abi.py` is not `kernel.py`.
(function (root) {
  'use strict';

  var N = root.FyNames;

  /** The declared slot, or a loud failure naming where slots come from. */
  function slot(table, key) {
    var t = N && N.TABLES[table];
    var s = t && t.slots[key];
    if (!s) {
      throw new Error(
        'fyo: no slot ' + table + '/' + key +
        ' — slots are declared in rust/fylite/src/fyo.rs and generated ' +
        'into assets/fyo-interface.js; add it there, not here');
    }
    return s;
  }

  /**
   * Walk a declared path to `[container, leaf]`.
   *
   * ★An AoS segment steps into index 0 — that is what
   * `time_slice/global_quantities/ip` MEANS.  It is declared beside the
   * paths rather than known by this walker, because a host that read
   * `time_slice` as a mapping would build a document that looks right and
   * that no DD reader can open.
   */
  function dig(node, path, create) {
    var segs = path.split('/');
    for (var i = 0; i < segs.length - 1; i++) {
      var seg = segs[i];
      var nxt = node && typeof node === 'object' ? node[seg] : undefined;
      if (N.AOS.indexOf(seg) >= 0) {
        if (!Array.isArray(nxt) || !nxt.length) {
          if (!create) return [null, segs[segs.length - 1]];
          nxt = [{}];
          node[seg] = nxt;
        }
        node = nxt[0];
        continue;
      }
      if (!nxt || typeof nxt !== 'object' || Array.isArray(nxt)) {
        if (!create) return [null, segs[segs.length - 1]];
        nxt = {};
        node[seg] = nxt;
      }
      node = nxt;
    }
    return [node, segs[segs.length - 1]];
  }

  /** One declared shape: `1`, a dimension, `a*b` or `a+1`. */
  function shapeSize(shape, dims) {
    function one(name) {
      name = name.trim();
      if (/^[0-9]+$/.test(name)) return parseInt(name, 10);
      if (!(name in dims)) {
        throw new Error('fyo: shape "' + shape + '" names dimension "' +
                        name + '", which this entry does not declare');
      }
      return dims[name] | 0;
    }
    if (shape.indexOf('*') >= 0) {
      var m = shape.split('*');
      return one(m[0]) * one(m[1]);
    }
    if (shape.indexOf('+') >= 0) {
      var a = shape.split('+');
      return one(a[0]) + one(a[1]);
    }
    return one(shape);
  }

  /** `{params, input, out}` -> `{key: [offset, length]}` for one entry. */
  function layout(entry, dims) {
    var spec = N.ENTRY_BLOCKS[entry];
    if (!spec) {
      throw new Error('fyo: no scenario entry "' + entry + '"; have ' +
                      N.ENTRIES.join(', '));
    }
    var out = {};
    ['params', 'input', 'out'].forEach(function (role) {
      var at = 0, rows = {};
      N.BLOCKS[spec[role]].forEach(function (row) {
        var n = shapeSize(row.shape, dims);
        rows[row.key] = [at, n];
        at += n;
      });
      out[role] = rows;
    });
    return out;
  }

  root.FyFyo = {
    /** The declared shape grammar, exposed because both hosts parse it. */
    shapeSize: shapeSize,

    /** The offsets of one entry's three blocks at these dimensions. */
    layout: layout,

    /** The dimension names one entry takes, positionally. */
    dimsOf: function (entry) {
      var spec = N.ENTRY_BLOCKS[entry];
      return spec ? spec.dims.slice() : null;
    },

    /**
     * Pack one named block flat.  ★A row the caller does not give is zero;
     * a row the block does not HAVE is a refusal, because a silently
     * ignored argument is how a caller ends up believing it asked for
     * something it did not.
     */
    pack: function (entry, role, given, dims) {
      var rows = layout(entry, dims)[role], total = 0, k;
      Object.keys(given || {}).forEach(function (key) {
        if (!(key in rows)) {
          throw new Error('fyo: ' + entry + ' ' + role + ' has no "' + key +
                          '"; it takes ' + Object.keys(rows).join(', '));
        }
      });
      for (k in rows) total += rows[k][1];
      var buf = new Float64Array(total);
      for (k in rows) {
        if (!given || !(k in given)) continue;
        var at = rows[k][0], n = rows[k][1];
        var v = given[k];
        if (typeof v === 'number') {
          buf.fill(v, at, at + n);
          continue;
        }
        //: ★a row that is PRESENT but undefined is named, not dereferenced:
        //: `v.length` on it throws「Cannot read properties of undefined」
        //: with no key in the message, and a caller assembling a
        //: twenty-row block is then told only that one of them is wrong.
        if (v == null) {
          throw new Error('fyo: ' + entry + ' ' + role + '/' + k +
                          ' is ' + v + ' — a declared row must be a number '
                          + 'or an array, and a caller that has none should '
                          + 'send zeros rather than nothing');
        }
        if (v.length !== n) {
          throw new Error('fyo: ' + entry + ' ' + role + '/' + k +
                          ' is declared ' + n + ' long and got ' + v.length);
        }
        buf.set(v, at);
      }
      return buf;
    },

    /** Split one entry's flat result into its named rows. */
    unpack: function (entry, flat, dims) {
      //: ★★A row comes back as a scalar because its DECLARATION says `"1"`,
      //: never because its length happened to be one.  This read `n === 1`,
      //: which made the SHAPE OF THE RESULT DEPEND ON THE DATA: an entry run
      //: at `nt = 1` handed its per-step traces back as bare numbers, and a
      //: caller reading `out.p_rad[0]` got `undefined` — which then travels
      //: as NaN through every arithmetic downstream and shows up, if at all,
      //: as a blank cell three layers away.  A declared shape is a contract;
      //: a contract that changes with the numbers is not one.
      //: ★The same defect was in Python's `kernel.scenario` and was fixed
      //: there first; this is the other host's half of it.
      var rows = layout(entry, dims).out, got = {};
      var shape = {}, blk = N.BLOCKS[N.ENTRY_BLOCKS[entry].out];
      for (var j = 0; j < blk.length; j++) shape[blk[j].key] = blk[j].shape;
      for (var k in rows) {
        var at = rows[k][0], n = rows[k][1];
        got[k] = String(shape[k]).trim() === '1'
          ? flat[at] : flat.slice(at, at + n);
      }
      return got;
    },

    /** The declared `{path, units, rank}` of one kernel slot. */
    slot: slot,

    /** The document path of one slot. */
    path: function (table, key) { return slot(table, key).path; },

    /** Read one declared slot, or `undefined`. */
    get: function (doc, table, key) {
      var at = dig(doc, slot(table, key).path, false);
      return at[0] ? at[0][at[1]] : undefined;
    },

    /**
     * Write one declared slot, making the path as it goes.  Returns the
     * document, so a writer reads as a list of slots.
     */
    put: function (doc, table, key, value) {
      var at = dig(doc, slot(table, key).path, true);
      at[0][at[1]] = value;
      return doc;
    },

    /** Every slot key of a table, in declaration order. */
    keys: function (table) {
      var t = N && N.TABLES[table];
      return t ? Object.keys(t.slots) : [];
    },

    /** The `@type` a table's documents carry. */
    type: function (table) {
      var t = N && N.TABLES[table];
      return t ? t.type : null;
    }
  };
})(typeof self !== 'undefined' ? self : this);
