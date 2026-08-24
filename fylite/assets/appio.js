// Shared file exchange: one format selector, two verbs, both pages.
//
// Before this existed each page carried its own ~160-line copy of the same
// save / open / parse / report dance, and the two copies had already begun
// to drift.  What is genuinely per-page is only WHAT goes into a file and
// WHAT an imported file should do — those stay in the page, as callbacks.
//
// Deliberately makes no assumption about a poloidal field: a scenario with
// nothing but scalars registers formats whose `build` returns scalars.

(function (root) {
  'use strict';

  var T = root.FyI18n.t;

  /**
   * Everything a g-file needs, assembled from the standard solution shape
   * both equilibrium scenarios produce.  Returns null when the pieces are
   * not there yet, so the caller can say so rather than write a file of
   * zeros.
   */
  function gfileArgs(machine, sol, profiles, q, caseName) {
    if (!sol || !profiles) return null;
    var nw = machine.grid.nr, bnd = [];
    if (sol.lcfs)
      for (var i = 0; i + 1 < sol.lcfs.length; i += 2)
        bnd.push([sol.lcfs[i], sol.lcfs[i + 1]]);
    return {
      grid: machine.grid, psi: sol.psi,
      psiAxis: sol.psiAxis, psiBnd: sol.psiBnd,
      axisR: sol.axisR, axisZ: sol.axisZ, ip: sol.ip,
      rcentr: root.FyDevice.tf(machine).r0,
      bcentr: root.FyDevice.tf(machine).b0,
      fpol: q ? Array.prototype.slice.call(q.f) : [],
      pres: Array.prototype.slice.call(profiles.p),
      pprime: Array.prototype.slice.call(profiles.pprime),
      ffprime: Array.prototype.slice.call(profiles.ffprime),
      qpsi: q ? root.FyGeqdsk.qOnUniform(q.x, q.q, nw)
              : new Array(nw).fill(0),
      boundary: bnd, limiter: machine.limiter,
      caseName: caseName || 'fylite',
    };
  }

  /**
   * The device description itself as a file — identical on every page, so it
   * is built here rather than declared twice.
   *
   * Importing one switches to it, which reloads: every response matrix,
   * control range and figure belongs to a machine, and a page half-way
   * between two tokamaks would still be showing the previous one's numbers.
   */
  function deviceFormat(machine) {
    return {
      label: T('io.label.device'),
      filename: function () { return 'fylite_device_' + machine.id + '.json'; },
      accept: '.json,application/json',
      exportHint: T('dev.export_hint'),
      importHint: T('dev.import_hint'),
      build: function () {
        return JSON.stringify(root.FyoDevice.toFyo(machine), null, 1);
      },
      apply: function (text) {
        var r = root.FyDevices.importFyo(text);
        var msg = T('dev.imported', { name: r.name,
                                      coils: r.machine.coils.length,
                                      loops: r.machine.loops.length })
                + (r.persisted ? '' : T('dev.not_persisted'));
        root.FyDevices.select(r.id, msg);
        return msg;
      },
    };
  }

  /**
   * Wire a format selector and an import/export pair.
   *
   * opts = {page, scope, report(msg, cls), formats, els?}
   * formats[name] = {label, filename, accept, exportHint, importHint,
   *                  build() -> text | {error}, apply(text, name) -> msg,
   *                  docPage?, docKey?, text?}
   *
   * ★IMPORT DOES NOT ASK WHAT THE FILE IS.  A reader who has just been handed
   * a file by someone else is the worst-placed person to name its format, and
   * picking the wrong entry in a menu produced a parse error about a document
   * the file never claimed to be.  Every document this app writes says what it
   * is in its own first lines, so the file is read and then recognised:
   *
   *   `text: true`      not JSON at all (the g-file)
   *   `docPage: 'x'`    a session document whose `fylite:page` is `x`
   *   `docKey: 'k'`     ...and which carries `k`, for the two documents that
   *                     share a page name and differ by payload
   *
   * The selector that remains is for EXPORT, where the question is real: only
   * the writer knows which of several shapes is wanted.
   *
   * `scope` is the scenario's element resolver: several tools share one
   * document now, and all of them call their format selector `iofmt` —
   * which is why the three element ids are a DEFAULT here rather than a
   * required argument every caller was spelling identically.
   */
  var ELS = { fmt: 'iofmt', importBtn: 'ioimport', exportBtn: 'ioexport' };

  function install(opts) {
    var host = opts.scope || document;
    var els = opts.els || ELS;
    var $ = function (id) { return host.getElementById(id); };
    var report = opts.report || function () {};
    //: the menu's items need the tool's own id prefix, and the export button
    //: already carries it — deriving it here keeps every page's install()
    //: call exactly as it was
    var scopeId = function (name) {
      var btn = $(els.exportBtn);
      if (!btn || !btn.id) return name;
      return btn.id.slice(0, btn.id.length - els.exportBtn.length) + name;
    };

    /**
     * The formats that can actually be written, in declaration order.
     *
     * ★`importOnly` is not the same as "has no build": the import-only ones
     * carry a build that returns an error, so that a caller reaching for it
     * gets a sentence instead of silence.  Offering that in a MENU would be
     * offering an action that cannot succeed.
     */
    function writable() {
      return Object.keys(opts.formats).filter(function (k) {
        var f = opts.formats[k];
        return !f.importOnly && typeof f.build === 'function';
      });
    }

    /** Every extension any format here can read, so the picker offers them all. */
    function acceptAll() {
      var seen = {}, out = [];
      Object.keys(opts.formats).forEach(function (k) {
        String(opts.formats[k].accept || '').split(',').forEach(function (a) {
          a = a.trim();
          if (a && !seen[a]) { seen[a] = 1; out.push(a); }
        });
      });
      return out.join(',');
    }

    /**
     * Which format this text is, or null.
     *
     * ★Recognition is by what the document SAYS, never by its extension: the
     * pages write four different fyo documents that are all `.json`, and a
     * name is the one part of a file anybody can change.
     */
    function sniff(text) {
      var doc = null;
      try { doc = JSON.parse(text); } catch (e) { doc = null; }
      //: ★a format that cannot be READ is not a candidate.  The 0-D part
      //: writes an operating point and refuses to read one back; before the
      //: parts shared an import button it was never asked, and the first time
      //: it was, it answered for the two parts that can actually take one.
      var names = Object.keys(opts.formats).filter(function (k) {
        return !opts.formats[k].exportOnly;
      });
      var i, f, out = [];
      if (doc === null || typeof doc !== 'object') {
        //: ★EVERY text format, not the first one.  The rule this function
        //: states two comments down — "every part that can read this file
        //: reads it" — held for the JSON documents and not here, because a
        //: plain-text file returned early.  With two bars able to read a
        //: g-file (one fits it to Miller scalars, the other traces the
        //: metric ladder on it) the first-past-the-post version left the
        //: second configured for the previous question, silently.
        for (i = 0; i < names.length; i++)
          if (opts.formats[names[i]].text) out.push(names[i]);
        return out;
      }
      if (root.FyoDevice && doc['@type'] === root.FyoDevice.TYPE)
        for (i = 0; i < names.length; i++)
          if (names[i] === 'device') return [names[i]];
      var page = doc['fylite:page'];
      //: a payload-qualified match first: two documents can share a page name
      //: and be told apart only by what they carry
      for (i = 0; i < names.length; i++) {
        f = opts.formats[names[i]];
        if (f.docPage === page && f.docKey && doc[f.docKey] !== undefined)
          out.push(names[i]);
      }
      if (out.length) return out;
      for (i = 0; i < names.length; i++) {
        f = opts.formats[names[i]];
        if (f.docPage === page && !f.docKey) out.push(names[i]);
      }
      return out;
    }

    function hint() {
      var w = writable();
      var btn = $(els.exportBtn);
      //: with one writable format the button IS that format and says so;
      //: with several it says that it will ask
      if (btn) btn.title = w.length === 1
        ? (opts.formats[w[0]].exportHint || '')
        : T('io.export.pick');
      //: the import button never belonged to a selector, and now nothing
      //: does: its tooltip says what recognition means
      if ($(els.importBtn)) $(els.importBtn).title = T('io.import.auto');
      var menu = $(els.fmt);
      if (menu) menu.hidden = true;
    }

    /**
     * The export menu.
     *
     * ★A menu that appears WHEN ASKED, not a control that sits in the
     * toolbar being ignored.  The question it asks is real — only the writer
     * knows which of several shapes is wanted — but it is a question about
     * one press, not a mode the page has to be left in.  With a single
     * writable format there is no question and no menu.
     */
    function closeMenu() {
      var m = $(els.fmt);
      if (m) m.hidden = true;
    }

    function openMenu() {
      var m = $(els.fmt);
      if (!m) return;
      if (!m.childNodes.length) {
        writable().forEach(function (k) {
          var b = document.createElement('button');
          b.type = 'button';
          //: a stable id per format: the gates press these, and a menu whose
          //: items can only be found by their label is a menu that breaks on
          //: the next translation
          b.id = scopeId(els.fmt + '-' + k);
          b.className = 'io-menu-item';
          b.textContent = opts.formats[k].label || k;
          b.title = opts.formats[k].exportHint || '';
          b.addEventListener('click', function () { closeMenu(); write(k); });
          m.appendChild(b);
        });
      }
      m.hidden = !m.hidden;
    }

    function write(key) {
      var f = opts.formats[key];
      var built;
      try { built = f.build(); }
      catch (e) { report(T('io.export_failed', { why: e.message }), 'err'); return; }
      if (!built || built.error) {
        report(built && built.error || T('io.nothing'), 'warn');
        return;
      }
      root.FyGeqdsk.saveText(
        typeof f.filename === 'function' ? f.filename() : f.filename, built);
      report(T('io.saved', { what: f.label || key }));
    }

    function doExport() {
      var w = writable();
      if (!w.length) { report(T('io.nothing'), 'warn'); return; }
      if (w.length === 1) return write(w[0]);
      openMenu();
    }

    /**
     * One import control for everything, including machines.
     *
     * ★There used to be TWO: this button, and a `+` beside the machine list.
     * They did the same thing to the same files — the `+` existed only because
     * it could take SEVERAL device documents at once, where this one took a
     * file and reloaded (four machines meant four reloads, three of them
     * discarded).  A second button is a poor price for that, so the ability
     * moved here: the picker accepts several files, and several files are
     * taken to be machines, which is the only kind of import for which
     * "several at once" means anything.  One file behaves exactly as before.
     */
    function doImport() {
      root.FyGeqdsk.openTexts(function (files) {
        if (files && files.length > 1) return importMachines(files);
        var one = files && files[0];
        if (!one) return;
        applyOne(one.text, one.name, one.error);
      }, acceptAll());
    }

    /** Several files at once: machines, imported together and switched once. */
    function importMachines(files) {
      var D = root.FyDevices;
      if (!D || typeof D.importMany !== 'function')
        return report(T('io.multi_unsupported'), 'err');
      var r = D.importMany(files);
      var msg = r.added.length
        ? T('dev.imported_n', {
            n: r.added.length,
            names: r.added.map(function (a) { return a.name; }).join('、'),
          }) + (r.persisted ? '' : T('dev.not_persisted'))
        : '';
      if (r.failed.length) {
        var why = r.failed.map(function (f) { return f.name + '：' + f.why; }).join(' · ');
        msg = (msg ? msg + ' ' : '') + T('dev.import_failed_n', {
          n: r.failed.length, why: why });
      }
      //: switch ONCE, to the first machine that arrived — the whole reason
      //: this path exists.  With nothing added there is nothing to switch to.
      if (r.added.length) D.select(r.added[0].id, msg);
      else report(msg, 'err');
    }

    function applyOne(text, name, err) {
      (function (text, name, err) {
        if (err || text === null) {
          report(T('io.read_failed', { why: (err && err.message) || name }), 'err');
          return;
        }
        //: ★EVERY part that can read this file reads it.  One page is one
        //: scenario now, and an operating point produced by its 0-D part is
        //: the input of BOTH the transport part and the local-stability part
        //: — handing it to whichever happened to register first would leave
        //: the other configured for the previous question.
        var keys = sniff(text);
        if (!keys.length) {
          //: name what the file claimed and what this page can read, so the
          //: answer to "why not" is on screen rather than in a guess
          var claimed = '';
          try {
            var d = JSON.parse(text);
            claimed = d && (d['fylite:page'] || d['@type']) || '';
          } catch (e2) { claimed = T('io.sniff.plain'); }
          report(T('io.sniff.unknown', {
            name: name, claimed: claimed || '—',
            can: Object.keys(opts.formats).map(function (k) {
              return opts.formats[k].label || k;
            }).join('、'),
          }), 'err');
          return;
        }
        var what = [], msgs = [], refused = null;
        for (var k = 0; k < keys.length; k++) {
          var f = opts.formats[keys[k]], msg;
          try { msg = f.apply(text, name); }
          catch (e) {
            //: ★★A REFUSAL IS NOT A FAILURE WHEN THERE ARE SEVERAL
            //: CANDIDATES.  Recognition by content can only narrow a plain
            //: text file down to "one of the formats that read text" — a
            //: g-file and a reference profile table are both text, and the
            //: one that is not this file THROWS while parsing it.  Reporting
            //: that throw stopped the loop, so the format the file actually
            //: belonged to never saw it: measured, with an EQDSK and an
            //: ASTRA table imported one after the other, each landing in the
            //: other's parser.  With one candidate a throw is still the
            //: answer — nothing else could have read it.
            if (keys.length > 1) { refused = refused || e; continue; }
            report(T('io.import_failed', { why: e.message }), 'err');
            return;
          }
          what.push(f.label || keys[k]);
          if (msg) msgs.push(msg);
        }
        if (!what.length) {
          report(T('io.import_failed', {
            why: (refused && refused.message) || T('io.sniff.done') }), 'err');
          return;
        }
        //: say what it was taken to be: an import that silently did something
        //: other than the reader expected is the failure this replaces
        report(T('io.sniff.as', { what: what.join('、'),
                                  msg: msgs.join(' · ') || T('io.sniff.done') }));
      })(text, name, err);
    }

    $(els.exportBtn).addEventListener('click', doExport);
    $(els.importBtn).addEventListener('click', doImport);
    //: any press elsewhere puts the menu away — a menu that survives the next
    //: click is a menu the reader has to dismiss deliberately
    document.addEventListener('click', function (ev) {
      var m = $(els.fmt);
      if (!m || m.hidden) return;
      if (ev.target === $(els.exportBtn) || m.contains(ev.target)) return;
      closeMenu();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closeMenu();
    });
    hint();
    return { hint: hint, buttons: [els.importBtn, els.exportBtn] };
  }

  root.FyIO = { install: install, gfileArgs: gfileArgs,
                deviceFormat: deviceFormat };
})(typeof self !== 'undefined' ? self : globalThis);
