// Handing a result from one scenario to the next, without a round trip
// through the file system.
//
// ★WHAT THIS IS NOT.  It is not a second file format and not a second way of
// saying anything: what it stores is EXACTLY the document the export menu
// would have written — the same bytes, under a key instead of in a folder.
// The file path stays and stays first: it is the reproducible one, it is what
// the gates drive, and it is the only one that survives a cleared browser.
//
// ★WHY IT EXISTS AT ALL.  The bus in `scenario.js` carries a bar's product to
// the bars beside it, and stops at the page — one worker, one run button, one
// set of bars.  Since the 0-D bar moved to the design scenario, the two ends
// of 「0D 工况 → 1.5D 输运」 are on different pages, and the only path left was
// "export a file, find it in the file picker, import it".  This is that same
// handoff, one click each way.
//
// ★WHAT IT DELIBERATELY DOES NOT DO:
//
//   no auto-apply    the receiving page OFFERS what is waiting and applies it
//                    when the reader says so.  A page that silently rewrote
//                    its controls from something another tab did would be
//                    unexplainable at exactly the moment it mattered.
//   no history       one slot.  A queue of handoffs is a workspace, and a
//                    workspace is a different product.
//   no cross-device  `localStorage` is this browser, this origin.  Anything
//                    that has to travel further travels as a file.
//
// ★EVERY read and write is wrapped: a private window, a browser told to block
// site data, and a thumbnailer all THROW here rather than returning nothing,
// and none of them is a reason for the page to stop working — the reader is
// simply told to use the file path instead.

(function (root) {
  'use strict';

  var KEY = 'fylite:handoff';
  //: ★a ceiling, and it is not arbitrary: `localStorage` gives an origin about
  //: 5 MB, a 129x129 g-file is ~1 MB of text and a 257x257 one about 4.  A
  //: document that does not fit is not truncated — the writer is told to use
  //: the file, which has no such limit.
  var MAX = 3 * 1024 * 1024;

  function store() {
    try { return root.localStorage; } catch (e) { return null; }
  }

  /**
   * Leave a document for the next scenario.
   *
   * `rec` = {kind, from, bar, name, text}; the timestamp is added here so a
   * receiver can say how old it is.  Returns null on success, or a message
   * key explaining why the reader should use the export button instead.
   */
  function put(rec) {
    var ls = store();
    if (!ls) return 'handoff.no_store';
    if (!rec || !rec.text) return 'handoff.nothing';
    if (rec.text.length > MAX) return 'handoff.too_big';
    var doc = { kind: rec.kind, from: rec.from, bar: rec.bar,
                name: rec.name, when: Date.now(), text: rec.text };
    try { ls.setItem(KEY, JSON.stringify(doc)); }
    catch (e) { return 'handoff.no_store'; }
    return null;
  }

  /** What is waiting, or null.  Does not consume it. */
  function peek() {
    var ls = store();
    if (!ls) return null;
    var raw;
    try { raw = ls.getItem(KEY); } catch (e) { return null; }
    if (!raw) return null;
    try {
      var doc = JSON.parse(raw);
      return doc && doc.text ? doc : null;
    } catch (e) { return null; }
  }

  /** Forget it — after it has been applied, or when the reader dismisses it. */
  function clear() {
    var ls = store();
    if (!ls) return;
    try { ls.removeItem(KEY); } catch (e) { /* nothing to forget, then */ }
  }

  /** "3 分钟前" — how stale what is waiting is, in the page's language. */
  function ago(when, t) {
    var s = Math.max(0, (Date.now() - when) / 1000);
    if (s < 90) return t('handoff.ago.now');
    if (s < 5400) return t('handoff.ago.min', { n: Math.round(s / 60) });
    if (s < 172800) return t('handoff.ago.hour', { n: Math.round(s / 3600) });
    return t('handoff.ago.day', { n: Math.round(s / 86400) });
  }

  root.FyHandoff = { put: put, peek: peek, clear: clear, ago: ago, KEY: KEY };
})(typeof self !== 'undefined' ? self : globalThis);
