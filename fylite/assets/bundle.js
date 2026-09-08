// The document set: one exchange unit for export, import and moving elsewhere
// (`FYL-DESIGN-18` U-18 · U-19, stage U0).
//
// ★One unit, not a menu of formats.  What leaves the page is a plan, the input
// documents its ports are bound to, the record (with `fylite:state`, so it is
// also a checkpoint — U-10), the presentation specification the workbench
// edited, and an `environment.json` naming the kernel that produced the
// numbers (K-7).  Missing pieces are not an error: with only a plan you get an
// input page, with a plan and a record you get figures and a report (U-18).
//
// ★Classification is by content, never by file name (`appio.js`'s rule, and the
// same reason): a set that came from another host, another language or a user's
// own renaming still has to be readable, and `@type` is what says what a
// document is.  A file this module cannot classify is KEPT and listed, not
// dropped — the caller says「有一份我不认识的文档」rather than silently losing it.
//
// ★A store-only zip, written here, because the alternative is a dependency.
// The whole app has no build step and no third-party runtime; 70 lines of
// deflate-free zip is cheaper than a library, and every zip reader in the world
// reads stored entries.  `validate-bundle.mjs` hands what this writes to
// Python's `zipfile` — self-consistency between this writer and this reader
// would prove nothing about whether it is a zip.
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ //
  // a store-only zip
  // ------------------------------------------------------------------ //
  var CRC = (function () {
    var t = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = -1;
    for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }

  function utf8(str) {
    if (root.TextEncoder) return new root.TextEncoder().encode(str);
    var s = unescape(encodeURIComponent(str)), out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function fromUtf8(bytes) {
    if (root.TextDecoder) return new root.TextDecoder().decode(bytes);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return decodeURIComponent(escape(s));
  }

  function W() { this.parts = []; this.len = 0; }
  W.prototype.u8 = function (a) { this.parts.push(a); this.len += a.length; return this; };
  W.prototype.u16 = function (v) { return this.u8(new Uint8Array([v & 255, (v >>> 8) & 255])); };
  W.prototype.u32 = function (v) {
    return this.u8(new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]));
  };
  W.prototype.done = function () {
    var out = new Uint8Array(this.len), at = 0;
    for (var i = 0; i < this.parts.length; i++) { out.set(this.parts[i], at); at += this.parts[i].length; }
    return out;
  };

  /** `{name: text}` -> a store-only zip. */
  function zip(files) {
    var names = Object.keys(files), w = new W(), central = [], offsets = [];
    names.forEach(function (name) {
      var nb = utf8(name), body = utf8(files[name]), c = crc32(body);
      offsets.push(w.len);
      //: ★no timestamps.  A zip carrying「现在几点」is a different file every
      //: time it is written, and the round-trip gate compares bytes; the
      //: document's own `created` is where a time belongs.
      w.u32(0x04034b50).u16(20).u16(0x0800).u16(0).u16(0).u16(0)
       .u32(c).u32(body.length).u32(body.length).u16(nb.length).u16(0)
       .u8(nb).u8(body);
      central.push({ name: nb, crc: c, size: body.length });
    });
    var start = w.len;
    central.forEach(function (e, i) {
      w.u32(0x02014b50).u16(20).u16(20).u16(0x0800).u16(0).u16(0).u16(0)
       .u32(e.crc).u32(e.size).u32(e.size).u16(e.name.length)
       .u16(0).u16(0).u16(0).u16(0).u32(0).u32(offsets[i]).u8(e.name);
    });
    var size = w.len - start;
    w.u32(0x06054b50).u16(0).u16(0).u16(central.length).u16(central.length)
     .u32(size).u32(start).u16(0);
    return w.done();
  }

  /** A store-only zip -> `{name: text}`.  Deflated entries are named, not guessed. */
  function unzip(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var i = bytes.length - 22;
    while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--;
    if (i < 0) throw new Error('这不是一个 zip（找不到目录结尾）');
    var n = dv.getUint16(i + 10, true), at = dv.getUint32(i + 16, true), out = {};
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(at, true) !== 0x02014b50) throw new Error('zip 目录损坏');
      var method = dv.getUint16(at + 10, true);
      var nlen = dv.getUint16(at + 28, true), elen = dv.getUint16(at + 30, true),
          clen = dv.getUint16(at + 32, true), off = dv.getUint32(at + 42, true);
      var name = fromUtf8(bytes.subarray(at + 46, at + 46 + nlen));
      if (method !== 0) throw new Error('条目「' + name + '」是压缩的，本读者只认存储法');
      var lnlen = dv.getUint16(off + 26, true), lelen = dv.getUint16(off + 28, true);
      var size = dv.getUint32(off + 18, true);
      var body = bytes.subarray(off + 30 + lnlen + lelen, off + 30 + lnlen + lelen + size);
      out[name] = fromUtf8(body);
      at += 46 + nlen + elen + clen;
    }
    return out;
  }

  // ------------------------------------------------------------------ //
  // the document set
  // ------------------------------------------------------------------ //

  var TYPE_OF = {
    'fyo:ScenarioSpecification': 'plan',
    'spo:ComputationRecord': 'record',
    'spo:PresentationSpecification': 'presentation'
  };

  function typeOf(doc) {
    var t = doc && (doc.type || doc['@type']);
    if (Array.isArray(t)) { for (var i = 0; i < t.length; i++) if (TYPE_OF[t[i]]) return TYPE_OF[t[i]]; return null; }
    return TYPE_OF[t] || null;
  }

  function json(doc) { return JSON.stringify(doc, null, 1) + '\n'; }

  /**
   * Build the set.  Every field is optional; what is absent is simply absent
   * (U-18: a set with only a plan opens an input page).
   *
   *   FyBundle.build({plan, record, presentation, inputs: {magnetics: doc},
   *                   environment: {kernel_sha256, abi, app_version},
   *                   report: '# …', figures: {'fig-01.svg': '<svg…'}})
   */
  function build(parts) {
    var files = {};
    if (parts.plan) files['plan.jsonld'] = json(parts.plan);
    if (parts.record) files['record.jsonld'] = json(parts.record);
    if (parts.presentation) files['presentation.jsonld'] = json(parts.presentation);
    Object.keys(parts.inputs || {}).forEach(function (k) {
      files['inputs/' + k + '.jsonld'] = json(parts.inputs[k]);
    });
    //: ★the kernel identity travels with the numbers (K-7).  When the record
    //: already carries it, this file is that same value written where a human
    //: opening the zip will see it — never a second, differing, answer.
    var env = parts.environment
      || (parts.record && (parts.record.environment || null));
    if (env) files['environment.json'] = json(env);
    if (parts.report) files['report.md'] = parts.report;
    Object.keys(parts.figures || {}).forEach(function (k) {
      files['figures/' + k] = parts.figures[k];
    });
    return zip(files);
  }

  /** Read a set: classify by content, keep what is unrecognised (U-18). */
  function read(bytes) {
    var files = unzip(bytes);
    var out = { plan: null, record: null, presentation: null, inputs: {},
                environment: null, report: null, figures: {}, unknown: [] };
    Object.keys(files).sort().forEach(function (name) {
      var text = files[name];
      if (/^figures\//.test(name)) { out.figures[name.replace(/^figures\//, '')] = text; return; }
      if (/\.md$/.test(name)) { out.report = text; return; }
      var doc;
      try { doc = JSON.parse(text); } catch (e) { out.unknown.push(name); return; }
      var kind = typeOf(doc);
      if (kind) {
        //: ★first one wins and the second is LISTED — two plans in one set is
        //: a fact about the set, and picking one silently is how a reader ends
        //: up looking at the other one's numbers
        if (out[kind]) out.unknown.push(name + '（第二份 ' + kind + '）');
        else out[kind] = doc;
        return;
      }
      if (/^inputs\//.test(name)) {
        out.inputs[name.replace(/^inputs\//, '').replace(/\.jsonld$/, '')] = doc;
        return;
      }
      if (/environment\.json$/.test(name)) { out.environment = doc; return; }
      out.unknown.push(name);
    });
    return out;
  }

  /** What a set can drive, said in one place (U-18: missing is not an error). */
  function capabilities(set) {
    return {
      inputPage: !!set.plan,
      figures: !!(set.record && (set.presentation || root.FyCaseReport)),
      report: !!set.record,
      resume: !!(set.record && (set.record['fylite:state'] || set.record.state)),
      rerun: !!(set.plan && Object.keys(set.inputs || {}).length >= 0)
    };
  }

  root.FyBundle = { build: build, read: read, zip: zip, unzip: unzip,
                    crc32: crc32, typeOf: typeOf, capabilities: capabilities };
})(typeof self !== 'undefined' ? self : this);
