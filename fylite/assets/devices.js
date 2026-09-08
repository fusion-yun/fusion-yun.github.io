// Which machine the page is running, and how it gets swapped.
//
// The solver was already device-neutral — coil geometry, limiter and grid box
// are arguments, and the coil responses are computed at load rather than read
// from a precomputed table.  What was missing was only a way to say WHICH
// machine, so this file is a registry, a resolution rule and a place to keep
// imported descriptors.
//
// PRESET devices are fyo/JSON-LD documents under `app/facts/device/`, listed by
// `app/facts/device/catalogue.jsonld`.  ★2026-09-04 `app/facts/device/` -> `app/facts/device/`:
// `app/facts` is a symlink to the repository's `facts/` corpus, so the page fetches
// the same bytes the build publishes, under one name everywhere.  Imported ones live in localStorage and are
// merged in here, which is what lets an imported machine survive a reload.
// The worker gets the resolved descriptor in its `init` message and never
// reads a global — a Worker cannot see localStorage, so an imported device
// would otherwise be invisible to exactly the half of the app that does the
// arithmetic.
//
// ★★**A preset is a DOCUMENT, not a script.**  ITER used to arrive as
// `assets/dev-iter.js`, a JS file that pushed a descriptor onto a global.
// That made the one machine this build ships the only machine in the app
// that was not an fyo document — it could not be diffed against
// `machine_desc/iter/`, could not be re-imported, and went through a
// different reader than every other machine.  It is `facts/device/iter.jsonld`
// now, parsed by the same `FyoDevice.fromFyo` an imported file goes through,
// so there is one reader and one shape.
//
// ★And a preset is a REDISTRIBUTION: `app/` is published.  Which machines
// may be presets is therefore a licence question, answered per machine in
// the catalogue — in the data, where a reader can check the source — rather
// than by which files happen to sit in the directory.
//
// ★★The catalogue is FETCHED, so the registry starts empty and fills in.
// That is why `load()` exists and why `boot()` waits for it: the page cannot
// send the worker an `init` for a machine it has not read yet.  It costs
// nothing new — the pages already fetch their `.wasm`, so they already need
// to be served rather than opened from `file://`.

(function (root) {
  'use strict';

  var LS_ACTIVE = 'fylite-device';
  var LS_IMPORTED = 'fylite-devices';
  var LS_NOTICE = 'fylite-device-notice';

  //: ★Resolved from THIS script's own URL, not from the page's: the pages
  //: sit at two depths (`app/index.html` and `app/pages/*.html`) and a
  //: path relative to the document would have to be right for both.
  var HERE = (function () {
    try {
      var me = document.currentScript && document.currentScript.src;
      if (me) return me.replace(/[^/]*$/, '') + '../facts/device/';
    } catch (e) { /* no document, e.g. a worker or a test host */ }
    return '../facts/device/';
  })();

  //: preset id -> descriptor, filled by load()
  var presets = {};
  //: the catalogue entry per preset, so a page can say where a machine
  //: came from without a second list
  var catalogue = {};

  function builtins() { return presets; }

  /**
   * Read the catalogue and every document it lists — **from the middle-layer
   * wasm**, not over the network.
   *
   * ★★2026-09-05 用户裁定：**页面也走中间层 wasm，撤掉 `facts.jsonld`**。
   * 此前这里是 1 + N 次 fetch（目录一次，逐台一次），取的是与命令行那张编进二进制
   * 的表**平行的另一份字节**——同一批 432 KB 在一个制品里装两遍，且没有任何东西
   * 保证两份描述同一批机器。今天两边读的是同一份 `facts.rs`。
   *
   * ★★A preset that fails to parse is REPORTED and skipped, never
   * substituted: a page that silently ran on a different machine than the
   * one it names would put a wrong provenance under every figure.  With no
   * facts in the build at all (a page served without the runtime wasm, an
   * offline copy) the app still works — it simply has no preset, and every
   * machine arrives by import, which is the path a user's own tokamak takes
   * anyway.
   *
   * Resolves to `{loaded: [id], failed: [{id, why}]}` and never rejects:
   * the caller is a page boot, and a boot that can be stopped by a missing
   * data file is a page that cannot be opened at all.
   */
  function load(base) {
    var out = { loaded: [], failed: [] };
    //: the ids in the order the catalogue declares them, kept so the merge
    //: below can restore that order
    var order = [];
    if (!root.FyFactsDb) return Promise.resolve(out);
    return root.FyFactsDb.doc('device', 'catalogue')
      .then(function (cat) {
        if (!cat) throw new Error('this build carries no device catalogue');
        var want = (cat && cat['fylite:devices']) || [];
        want.forEach(function (e) {
          if (e && e['fylite:device_id']) order.push(e['fylite:device_id']);
        });
        return Promise.all(want.map(function (e) {
          var id = e['fylite:device_id'];
          if (!id) {
            out.failed.push({ id: '?', why: 'catalogue entry names no device' });
            return null;
          }
          return root.FyFactsDb.doc('device', id)
            .then(function (doc) {
              //: ★「这一版不带它」与「它坏了」分开说：前者是目录与制品不同步，
              //: 后者是文档本身有问题。读者拿到的句子不一样。
              if (!doc) throw new Error('the catalogue lists it, this build does not carry it');
              //: ★the SAME reader an imported file goes through.  A preset
              //: that took a shortcut past the validation would be the one
              //: machine nobody checked.
              var m = root.FyoDevice.fromFyo(doc);
              m.id = id;
              presets[id] = m;
              catalogue[id] = e;
              out.loaded.push(id);
            })
            .catch(function (err) {
              out.failed.push({ id: id, why: err.message });
            });
        }));
      })
      .catch(function (err) {
        out.failed.push({ id: 'catalogue', why: err.message });
      })
      .then(function () {
        //: ★CATALOGUE ORDER, not fetch-completion order.  `presets` was
        //: filled as each document arrived, so `list()[0]` — the machine a
        //: visit with no `?device=` and no stored choice lands on — was
        //: whichever fetch happened to win.  A page whose default tokamak
        //: varies between loads makes every measurement taken on it
        //: irreproducible, and it is how a machine with no magnetics came
        //: to be the default on some loads and not others.
        var ordered = {}, ocat = {};
        order.forEach(function (id) {
          if (presets[id]) { ordered[id] = presets[id]; ocat[id] = catalogue[id]; }
        });
        Object.keys(presets).forEach(function (id) {
          if (!ordered[id]) { ordered[id] = presets[id]; ocat[id] = catalogue[id]; }
        });
        presets = ordered;
        catalogue = ocat;
        //: FYLITE_MACHINE is what the pages and the worker read; it is only
        //: answerable once the presets are in
        root.FYLITE_MACHINE = active();
        return out;
      });
  }

  /** Where a preset came from, for a page that wants to say so. */
  function provenance(id) { return catalogue[id] || null; }

  function readStore() {
    try { return JSON.parse(localStorage.getItem(LS_IMPORTED) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function writeStore(obj) {
    try { localStorage.setItem(LS_IMPORTED, JSON.stringify(obj)); return true; }
    catch (e) { return false; }   // private mode, or quota
  }

  var imported = null;
  /** Imported descriptors, parsed once and cached. */
  function importedMap() {
    if (imported) return imported;
    imported = {};
    var raw = readStore();
    Object.keys(raw).forEach(function (id) {
      // A stored document is re-validated on every load rather than trusted:
      // it may have been written by an older build, or edited by hand.
      try { imported[id] = root.FyoDevice.fromFyo(raw[id]); }
      catch (e) { /* drop the unreadable one, keep the rest usable */ }
    });
    return imported;
  }

  function all() {
    var out = {};
    var b = builtins();
    Object.keys(b).forEach(function (id) { out[id] = b[id]; });
    var im = importedMap();
    //: ★★A PRESET WINS.  `importFyo` already refuses to take a preset's id —
    //: an imported EAST that disagreed with the shipped one would make every
    //: provenance claim on the page false — but that rule lived only in the
    //: import path, and localStorage can be written around it (a gate seeds
    //: it directly, and so can a visitor's console).  The merge is where the
    //: rule has to hold, because this is the function every reader asks.
    Object.keys(im).forEach(function (id) {
      if (!b[id]) out[id] = im[id];
    });
    return out;
  }

  /** [{id, name, builtin}] in a stable order: built-ins first, as declared. */
  function list() {
    var b = builtins(), im = importedMap(), out = [];
    Object.keys(b).forEach(function (id) {
      out.push({ id: id, name: b[id].name || id, builtin: true });
    });
    Object.keys(im).forEach(function (id) {
      if (!b[id]) out.push({ id: id, name: im[id].name || id, builtin: false });
    });
    return out;
  }

  function stored() {
    try { return localStorage.getItem(LS_ACTIVE); } catch (e) { return null; }
  }

  /** URL wins over the stored choice, so a link can pin a machine. */
  function activeId() {
    var q = null;
    try {
      q = new URLSearchParams(root.location.search).get('device');
    } catch (e) { /* no location, e.g. inside a worker */ }
    var have = all();
    if (q && have[q]) return q;
    var s = stored();
    if (s && have[s]) return s;
    return list().length ? list()[0].id : null;
  }

  function active() { return all()[activeId()] || null; }

  /**
   * Switch machine.  Every response matrix, every control range and every
   * figure depends on the device, so this reloads rather than trying to
   * mutate a live page into a different tokamak — a half-swapped page that
   * still shows the previous machine's numbers would be worse than a blink.
   */
  function select(id, notice) {
    if (!all()[id]) return false;
    try { localStorage.setItem(LS_ACTIVE, id); } catch (e) { /* private mode */ }
    //: the reload throws away the status line, so a message that explains
    //: WHY the page just reloaded has to survive the trip
    try {
      if (notice) sessionStorage.setItem(LS_NOTICE, notice);
    } catch (e) { /* ignore */ }
    var u = new URL(root.location.href);
    u.searchParams.set('device', id);
    root.location.href = u.toString();
    return true;
  }

  /**
   * Take an fyo device document, keep it, and switch to it.  Validation
   * happens in FyoDevice.fromFyo and is allowed to throw — the caller reports
   * it.  A descriptor is only stored once it has parsed.
   */
  function importFyo(text) {
    var doc = JSON.parse(text);
    var m = root.FyoDevice.fromFyo(doc);
    var id = m.id;
    //: never shadow a built-in: an imported EAST that disagreed with the
    //: bundled one would make every provenance claim on the page false
    if (builtins()[id]) id = m.id = uniqueId(id + '-imported');
    doc['fylite:device_id'] = id;
    var store = readStore();
    store[id] = doc;
    var kept = writeStore(store);
    importedMap()[id] = m;
    return { id: id, name: m.name, machine: m, persisted: kept };
  }

  /**
   * Take SEVERAL fyo device documents, keep every one that parses, and
   * switch to none of them.
   *
   * ★★Why "and switch to none".  :func:`importFyo` is followed by
   * :func:`select`, which RELOADS — every response matrix, control range and
   * figure belongs to a machine, so a page half-way between two tokamaks is
   * still showing the previous one's numbers.  That is right for one file
   * and wrong for four: each import would reload before the next could
   * start, and only the last machine would survive as the active one.  So
   * this stores them all and leaves the caller to switch ONCE.
   *
   * ★A file that does not parse is REPORTED, not dropped.  An import that
   * quietly takes three of four documents leaves a reader believing they
   * have a machine they do not have.
   *
   * `files` is `[{name, text, error?}]`, the shape `FyGeqdsk.openTexts`
   * hands back.  Returns `{added: [{id, name, coils, loops}],
   * failed: [{name, why}], persisted}`.
   */
  function importMany(files) {
    var added = [], failed = [], persisted = true;
    var store = readStore();
    (files || []).forEach(function (f) {
      if (!f || f.error) {
        failed.push({ name: (f && f.name) || '?',
                      why: String((f && f.error) || 'unreadable') });
        return;
      }
      var doc, m;
      try {
        doc = JSON.parse(f.text);
        m = root.FyoDevice.fromFyo(doc);
      } catch (e) {
        failed.push({ name: f.name, why: e.message });
        return;
      }
      var id = m.id;
      //: never shadow a built-in, for the reason importFyo gives: an
      //: imported EAST that disagreed with the bundled one would make every
      //: provenance claim on the page false
      if (builtins()[id] || store[id]) id = m.id = uniqueId(id + '-imported');
      doc['fylite:device_id'] = id;
      store[id] = doc;
      importedMap()[id] = m;
      added.push({ id: id, name: m.name, coils: m.coils.length,
                   loops: m.loops.length });
    });
    if (added.length) persisted = writeStore(store);
    return { added: added, failed: failed, persisted: persisted };
  }

  /**
   * Forget an imported machine.
   *
   * ★A built-in cannot be removed: it is part of the build, and a page that
   * let a visitor delete it would have no machine to fall back to and no way
   * to get it back short of clearing site data.
   *
   * ★★Removing the ACTIVE machine is the case that has to be got right.  The
   * page is running on it — its response matrices are in the worker — so the
   * removal is followed by a switch to whatever is left, which reloads.  The
   * caller does that; this only reports which machine to go to, because a
   * store mutation that also navigates is a function that cannot be tested.
   */
  function remove(id) {
    if (!id || builtins()[id]) return null;
    var store = readStore();
    if (!(id in store)) return null;
    delete store[id];
    writeStore(store);
    if (imported) delete imported[id];
    var rest = list();
    return { removed: id, next: rest.length ? rest[0].id : null,
             wasActive: activeId() === id };
  }

  function uniqueId(base) {
    var have = all(), id = base, n = 2;
    while (have[id]) id = base + '-' + (n++);
    return id;
  }

  /** Read and clear the message left behind by the reload that select() did. */
  function takeNotice() {
    try {
      var n = sessionStorage.getItem(LS_NOTICE);
      if (n) sessionStorage.removeItem(LS_NOTICE);
      return n;
    } catch (e) { return null; }
  }

  /**
   * Fill a <select> with the known machines and switch on change.  Imported
   * ones are marked, because a visitor should be able to tell at a glance
   * whether the numbers on the page came with the build or came from a file
   * they supplied.
   */
  function installSelector(elId, opts) {
    var el = document.getElementById(elId);
    if (!el) return;
    var T = function (k, d) { return root.FyI18n ? root.FyI18n.t(k, d) : k; };
    var cur = activeId();
    el.innerHTML = list().map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === cur ? ' selected' : '') +
             '>' + d.name + (d.builtin ? '' : ' *') + '</option>';
    }).join('');
    el.addEventListener('change', function () { select(el.value); });

    //: ★The two controls beside the list, when the page authored them.  They
    //: are OPTIONAL so a page with a fixed machine can leave them out, and
    //: they are BUTTONS rather than entries in the <select>: a list of
    //: machines with two verbs mixed into it reads as two more machines.
    var o = opts || {};
    var add = o.addBtn && document.getElementById(o.addBtn);
    var del = o.removeBtn && document.getElementById(o.removeBtn);
    var say = o.report || function () {};

    if (add) add.addEventListener('click', function () {
      root.FyGeqdsk.openTexts(function (files) {
        var r = importMany(files);
        var msg = r.added.length
          ? T('dev.imported_n', {
              n: r.added.length,
              names: r.added.map(function (a) { return a.name; }).join('、'),
            }) + (r.persisted ? '' : T('dev.not_persisted'))
          : '';
        if (r.failed.length) {
          var why = r.failed.map(function (f) {
            return f.name + '：' + f.why;
          }).join(' · ');
          msg = (msg ? msg + ' ' : '') + T('dev.import_failed_n', {
            n: r.failed.length, why: why });
        }
        //: ★switch ONCE, to the first machine that arrived — that is the
        //: whole reason this path exists instead of N calls to importFyo.
        //: With nothing added there is nothing to switch to, so the page
        //: stays where it is and says why.
        if (r.added.length) select(r.added[0].id, msg);
        else say(msg, 'err');
      }, '.json,application/json');
    });

    if (del) {
      var paintDel = function () {
        var a = activeId(), b = builtins();
        del.disabled = !a || !!b[a];
        del.title = del.disabled ? T('dev.remove_builtin') : T('dev.remove_hint');
      };
      paintDel();
      if (root.FyI18n) root.FyI18n.onChange(paintDel);
      del.addEventListener('click', function () {
        var id = activeId();
        var name = (all()[id] || {}).name || id;
        if (!root.confirm(T('dev.remove_confirm', { name: name }))) return;
        var r = remove(id);
        if (!r) { say(T('dev.remove_builtin'), 'err'); return; }
        if (r.next) select(r.next, T('dev.removed', { name: name }));
        else say(T('dev.removed', { name: name }));
      });
    }
    return el;
  }

  root.FyDevices = { installSelector: installSelector, select: select,
                     active: active, importFyo: importFyo,
                     importMany: importMany, remove: remove, list: list,
                     load: load, provenance: provenance,
                     takeNotice: takeNotice };

  //: ★The pages and the worker both read FYLITE_MACHINE, and it means "the
  //: machine this page is running".  It is answered here from whatever is
  //: already known — the imported machines, which are synchronous — and
  //: again at the end of `load()`, once the presets have arrived.  A page
  //: that read it before then would get an imported machine, or null, and
  //: send the worker an `init` for the wrong tokamak.
  root.FYLITE_MACHINE = active();
})(typeof self !== 'undefined' ? self : globalThis);
