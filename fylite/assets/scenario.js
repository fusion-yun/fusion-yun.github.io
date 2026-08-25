// A scenario page: ONE worker, one toolbar, one run button, several parts.
//
// ★This file used to hand every tool its own scenario — its own worker, its
// own wasm instance, its own toolbar, its own run button — and a page that
// carried four tools carried four of each.  That is withdrawn.  A page IS a
// scenario now: `design` designs a discharge, `model` models one, and each of
// them runs as ONE thing.
//
// ★The four pages carry ONE part each since the site was cut back to the four
// typical scenarios, so the multi-part machinery below — the run chain, the
// namespaced export menu, the `active()` disambiguation — is exercised by no
// page today.  It is kept because the modelling page's three STAGES are the
// same shape one level down (`scenario-model.js` runs them through its own
// chain), and because a page regaining a part must not have to re-derive it.
//
// So the plumbing splits in two:
//
//   the PAGE   the compute worker and the kernel handshake, the toolbar, the
//              busy latch, the status line and progress bar, the file
//              exchange, the device selector, and the run button — which
//              runs the page's parts in order, one press.
//   a PART     what stays genuinely per-tool: its controls, its figures, its
//              message handlers, its own file formats, its own redraw.
//
// A part asks for itself with `FyScenario.part('vstab', {...})` and gets
// back an object shaped like the old per-tool scenario, so a controller says
// `$('r0')`, `setBusy(...)`, `S.send(...)` exactly as before.  What it may no
// longer do is bind the run button, install the file exchange, install the
// device selector, or send `init`: there is one of each per page and the
// page owns them.
//
// ★ELEMENT IDS STAY ON THE PART.  Sixty ids collided across the tools that
// now share a document (`status`, `run`, `ip`, `beta0` …), so the markup
// carries `<part>-<id>` and every lookup goes through `$`.  The toolbar is
// the page's, and its ids carry the PAGE's prefix — which is why `$` falls
// back to the page: a controller writing `$('status')` reaches the one
// status line without knowing that the toolbar stopped being its own.

(function (root) {
  'use strict';

  var pages = {};

  // --- the page -------------------------------------------------------------

  function makePage(pageId) {
    var pre = pageId + '-';
    var $p = function (id) { return document.getElementById(pre + id); };
    var parts = [];              // registration order == run order
    var busy = false, chaining = false, chainStop = false;
    var locked = [];             // {part, id}
    var dead = {};               // resolved element id -> true
    var P = { id: pageId, parts: parts };

    // --- the terminal marker --------------------------------------------------
    //
    // ★A bar used to report only its own sentence — 「5.05 s 的平衡已解…」,
    // 「★未达目标…」, 「轨迹已设计…」 — and each bar's author chose the wording.
    // A reader can tell those apart; a reader SCANNING three strips, and any
    // machine at all, cannot: the script that measured this page waited 200 s
    // for a run that had finished, because "finished" was spelled three ways
    // and none of them was a state.  So every strip now opens with ONE of four
    // words, and the sentence follows it.  The same word is on the element as
    // `data-state`, which is what a gate reads: a gate that greps the prose is
    // a gate that breaks the next time the prose is improved.
    //
    //   done   已完成      the run finished and met what it was asked for
    //   miss   未达目标    it finished and did NOT — a result, not an error
    //   fail   失败        it could not produce a result at all
    //   busy   运行中      in flight
    //   idle   未运行      nothing has been asked of it yet
    var STATE_KEY = { done: 'bar.st.done', miss: 'bar.st.miss',
                      fail: 'bar.st.fail', busy: 'bar.st.busy',
                      idle: 'bar.idle' };

    /**
     * The state a call to `setBusy` is reporting.
     *
     * An explicit fourth argument always wins — 「超出所声明的限值」 is a
     * finished trajectory that misses, and no class can say that.  Without
     * one it is derived from the class the caller already passes, which is
     * how every bar that has not been touched keeps reporting correctly.
     */
    function stateOf(on, cls, state) {
      if (state) return state;
      if (on) return 'busy';
      return cls === 'err' ? 'fail' : (cls === 'warn' ? 'miss' : 'done');
    }

    /** Paint one bar's strip: the marker, then the message. */
    function paintState(b, html, cls, state) {
      if (!b || !b.stateEl) return;
      if (html !== undefined) b.stateText = html || '';
      b.state = state;
      b.stateEl.dataset.state = state;
      //: innerHTML, because the messages are catalogue text and half of them
      //: carry emphasis the status line already renders; `title` so the strip
      //: may truncate without losing the sentence
      b.stateEl.innerHTML = '<b class="state-mark">' +
        root.FyI18n.t(STATE_KEY[state] || STATE_KEY.done) + '</b>' +
        (b.stateText ? ' ' + b.stateText : '');
      b.stateEl.title = b.stateEl.textContent;
      if (cls !== undefined)
        b.stateEl.className = 'funcbar-state' + (cls ? ' ' + cls : '');
    }

    // --- busy latch ---------------------------------------------------------

    function setBusy(on, text, cls, state) {
      busy = on;
      locked.forEach(function (L) {
        var e = L.$(L.id);
        if (e) e.disabled = on || chaining || !!dead[e.id];
      });
      paintRun();
      //: the keys live in the bars now, so the latch has to reach them: the
      //: one that is running becomes stop, the rest go dark until it is done
      bars.forEach(paintBarRun);
      //: the bar's strip says what THAT bar last did, so a folded bar is
      //: still readable: the page's status line only ever shows the newest
      //: message, and on a scenario that runs three bars in a row that is
      //: the last one's
      var b = activeBar || (bars.length === 1 ? bars[0] : null);
      var sk = stateOf(on, cls, state);
      if (b && b.stateEl && text !== undefined) paintState(b, text, cls, sk);
      var st = $p('status');
      if (st) {
        if (text !== undefined) st.dataset.state = sk;
        if (text !== undefined) {
          //: once a real message has been written the element must stop being
          //: a translation target — otherwise the language sweep (which can
          //: land AFTER a fast page has reported) puts the placeholder back
          st.removeAttribute('data-i18n');
          st.textContent = text;
        }
        st.className = cls ? 'status ' + cls : 'status';
      }
    }
    /**
     * Write the status line, MARKUP AND ALL.
     *
     * ★Two writers, one line, and the difference is deliberate: `setBusy`
     * writes `textContent`, because what a solve reports is a sentence about
     * numbers; this one writes `innerHTML`, because what the file exchange,
     * the device control and a handoff report is catalogue prose that carries
     * emphasis.  A message with markup sent through `setBusy` arrives with its
     * tags showing, which is how this one came to be exported to the bars.
     */
    function report(msg, cls) {
      var st = $p('status');
      if (!st) return;
      st.removeAttribute('data-i18n');
      st.innerHTML = msg;
      st.className = cls ? 'status ' + cls : 'status';
      var b = activeBar || (bars.length === 1 ? bars[0] : null);
      //: ★the marker is NOT re-derived here.  What `report` carries is the
      //: file exchange and the handoff — 「已交给建模场景」 is not an outcome
      //: of a run, and letting it write 已完成 over a bar that never ran
      //: would make the marker mean two different things.
      if (b && b.stateEl) paintState(b, msg, cls, b.state || 'idle');
    }

    function progress(frac) {
      var e = $p('progress');
      if (e) e.style.width = (frac === null ? 0 : frac * 100) + '%';
    }

    // --- the toolbar, built once for the page --------------------------------
    //
    // ★Every tool's toolbar was the SAME twelve lines with a different id
    // prefix, and a page carried one per tool: three run buttons, three status
    // lines, three device selectors offering the same three machines.  There
    // is one now, and it belongs to the page.
    //
    // The page asks for it with an empty host inside its section:
    //
    //   <div class="toolbar-host" data-status="p.ready"></div>
    //
    // `data-status` is the line shown before the kernel answers; a page with
    // no machine to choose says `data-device="no"`.
    function buildToolbar() {
      var sec = document.getElementById('tool-' + pageId);
      var host = sec && sec.querySelector('.toolbar-host');
      if (!host || host.dataset.built) return;
      host.dataset.built = '1';
      //: ★whatever the page authored INSIDE the host is kept: a second verb
      //: (design also solves) or a note that belongs in the toolbar row would
      //: otherwise be deleted by the thing meant to save it repetition.
      //: Buttons join the button row, anything else follows the status line.
      var extra = [];
      while (host.firstChild) extra.push(host.removeChild(host.firstChild));
      var id = function (x) { return pre + x; };
      var statusKey = host.getAttribute('data-status') || 'status.loading';
      var dev = host.getAttribute('data-device') !== 'no';
      host.className = 'panel toolbar';
      host.innerHTML =
        //: ★The device control is a list and ONE verb: forget this machine.
        //: Adding one is what the Import button does — it used to be here as
        //: a `+` as well, for the single reason that this path could take
        //: several files at once; that ability moved into Import (see
        //: `appio.js`), and two buttons doing one thing became one.
        (dev ? '<div class="ctl dev-ctl">'
             + '<label for="' + id('device') + '" data-i18n="dev.label"></label>'
             + '<select id="' + id('device') + '"></select>'
             + '<button id="' + id('dev-del') + '" class="ghost dev-btn" '
             + 'data-i18n-title="dev.remove_hint">\u00d7</button>'
             + '</div>' : '')
        + '<div class="buttons">'
        //: ★no run key here any more — it moved into every bar's own strip
        //: (see FUNCTION BARS).  The toolbar keeps what the PAGE has one of:
        //: the device, the file exchange, the progress bar, the status line.
        + '<button id="' + id('ioimport') + '" class="ghost" data-i18n="io.import"></button>'
        + '<button id="' + id('ioexport') + '" class="ghost" data-i18n="io.export"></button>'
        + '<div id="' + id('iofmt') + '" class="io-menu" hidden></div>'
        + '</div>'
        + '<div class="bar"><div id="' + id('progress') + '"></div></div>'
        + '<div class="status" id="' + id('status') + '" data-i18n="' + statusKey + '"></div>'
        + '<div class="status" id="' + id('dev-note') + '" hidden></div>';
      var row = host.querySelector('.buttons');
      extra.forEach(function (node) {
        if (node.nodeType !== 1) return;              // stray whitespace
        if (node.tagName === 'BUTTON') row.appendChild(node);
        else host.appendChild(node);
      });
      root.FyI18n.applyDom(host);
    }

    // --- the run button, which is also the stop button ------------------------
    //
    // ★One control, two verbs, because there is only ever one thing to do with
    // it: while nothing is running the only useful action is to start, and
    // while something is running the only useful action is to stop.  Two
    // buttons would mean one of them is dead at any moment, and a dead button
    // beside a live one reads as "not available yet".
    var ICON_RUN = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
                 + '<path d="M4.5 2.6 13 8l-8.5 5.4z"/></svg>';
    var ICON_STOP = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
                  + '<rect x="3.5" y="3.5" width="9" height="9" rx="1.2"/></svg>';

    function paintRun() {
      var e = $p('run');
      if (!e) return;
      var on = busy || chaining;
      e.classList.add('icon-btn');
      e.classList.toggle('stop', on);
      //: the label is the ACTION, not the state: a screen reader announcing
      //: "computing" gives no way to know that pressing it stops the run
      var key = on ? 'io.abort' : 'io.run';
      e.innerHTML = on ? ICON_STOP : ICON_RUN;
      e.title = root.FyI18n.t(key + '.title');
      e.setAttribute('aria-label', root.FyI18n.t(key));
      //: a run button that is `disabled` while busy cannot stop anything
      if (on) e.disabled = false;
    }

    /**
     * One press runs the page: every part that declares a `run`, in the order
     * the parts registered, each one waited for before the next begins.
     *
     * ★A part's `run` returns a promise — `S.settle(type)` is the usual one —
     * because the work happens in the worker and a part that posted a message
     * is not finished when its function returns.  A part that returns nothing
     * is taken to be done: the ones with no compute backend are synchronous.
     */
    function runAll() {
      if (chaining) return;
      var seq = parts.filter(function (p) { return typeof p.spec.run === 'function'; });
      if (!seq.length) return;
      if (seq.length === 1) { seq[0].spec.run(); return; }
      chaining = true; chainStop = false;
      paintRun();
      var i = 0;
      /**
       * ★Wait for the LATCH, not only for the promise.
       *
       * A part can go on working after the answer the chain waited for: the
       * 0-D part, given its waveform, then solves the slice equilibrium and
       * runs its Monte-Carlo sweep, and each of those takes the busy latch
       * again.  Every controller's run opens with `if (S.isBusy()) return` —
       * so the next part in the chain was called, found the page busy with
       * the previous part's afterwork, and returned SILENTLY.  On EAST that
       * looked exactly like a page whose run button does nothing for three
       * of its four parts.
       */
      function whenIdle(fn, waited) {
        if (chainStop) return;
        if (!busy || (waited || 0) > 60000) return fn();
        root.setTimeout(function () { whenIdle(fn, (waited || 0) + 60); }, 60);
      }
      function next() {
        if (chainStop || i >= seq.length) {
          chaining = false;
          paintRun();
          setBusy(false);
          return;
        }
        var p = seq[i++];
        whenIdle(function () { step(p); });
      }

      function step(p) {
        var r;
        try { r = p.spec.run(); }
        catch (e) {
          //: ★a part that throws still has to give the page back: the latch
          //: it took is the reader's only run button, and a page left latched
          //: on a raised error is a page that cannot be used again without a
          //: reload.  The error is re-raised — the console is where it says
          //: what actually broke — after the button is released.
          chaining = false;
          setBusy(false, root.FyI18n.t('io.failed', { why: e.message }), 'err');
          paintRun();
          throw e;
        }
        Promise.resolve(r).then(next, function () {
          //: a part that failed has already said so in the status line; the
          //: chain stops there rather than running the next part on inputs
          //: the failed one was supposed to produce
          chaining = false; paintRun(); setBusy(false);
        });
      }
      next();
    }

    // --- compute backend ------------------------------------------------------

    var worker = null, kernel = null, initMsg = null, aborted = false;
    var aborters = [], waiting = [];

    function dispatch(m) {
      //: a type claimed by ONE part goes to that part; a type several parts
      //: claim (`error`, `progress`) goes to whichever part is running, which
      //: is the only one that can say what it means
      var owners = parts.filter(function (p) { return p.on[m.type]; });
      if (owners.length > 1) {
        var act = active();
        owners = owners.filter(function (p) { return p === act; });
        if (!owners.length) return;
      }
      owners.forEach(function (p) { p.on[m.type](m); });
    }

    function active() {
      for (var i = 0; i < parts.length; i++) if (parts[i].running) return parts[i];
      return null;
    }

    function buildWorker() {
      //: the url is site-root-relative (`assets/worker.js`); a scenario page
      //: sits one directory below that, so it is resolved through FySite
      worker = new Worker(root.FySite.url('assets/worker.js'));
      worker.onmessage = function (ev) {
        var m = ev.data;
        // the kernel handshake is the same on every page, so it is answered
        // here; a part that wants to react registers 'ready' as well
        if (m.type === 'ready')
          kernel = { abi: m.abi, sha256: m.sha256, bytes: m.bytes,
                     timing: m.timing, grid: m.grid };
        if (m.type === 'ready') parts.forEach(function (p) {
          if (p.on.ready) p.on.ready(m);
        });
        else dispatch(m);
        settleWaiters(m);
        //: ★the page's `ready` handler writes its kernel-ready line, and on a
        //: rebuild that line would erase the only notice that anything was
        //: stopped.  So the abort has the last word, after the handler.
        if (m.type === 'ready' && aborted) {
          aborted = false;
          setBusy(false, root.FyI18n.t('io.aborted.done'), 'warn');
        }
      };
    }

    function settleWaiters(m) {
      var still = [];
      waiting.forEach(function (w) {
        if (w.types.indexOf(m.type) >= 0) w.resolve(m);
        else if (m.type === 'error') w.reject(new Error(m.message || 'error'));
        else still.push(w);
      });
      waiting = still;
    }

    /**
     * Send a command to the backend.  Every message carries the page's
     * language: a worker has no localStorage, so error text raised inside it
     * would otherwise come back in whatever the worker guessed.
     */
    function send(msg) {
      if (!worker) return false;
      msg.lang = root.FyI18n.current();
      //: ★the init message is REMEMBERED, because stopping a run means killing
      //: the worker, and a killed worker has to be told the machine again
      if (msg.cmd === 'init') initMsg = msg;
      worker.postMessage(msg);
      return true;
    }

    /**
     * Stop whatever is running.
     *
     * ★There is no polite way.  A solve is one blocking call inside the worker
     * — it cannot check a flag mid-iteration — so the worker is TERMINATED and
     * a fresh one built in its place.  That is why init is replayed: the wasm
     * instance and every response matrix died with it, and the cost of
     * rebuilding them (about 100 ms on this deck) is the price of being able
     * to stop at all.
     */
    function abort() {
      if (!worker || !(busy || chaining)) return false;
      aborted = true;
      chainStop = true;
      //: a part that runs a second worker of its own (the turbulence pass)
      //: registers it here; nothing else knows it exists
      aborters.forEach(function (fn) { try { fn(); } catch (e) { /* stopping */ } });
      waiting.forEach(function (w) { w.reject(new Error('aborted')); });
      waiting = [];
      worker.terminate();
      kernel = null;
      parts.forEach(function (p) { p.running = false; });
      buildWorker();
      progress(0);
      chaining = false;
      setBusy(false, root.FyI18n.t('io.aborted'), 'warn');
      if (initMsg) send(initMsg);
      return true;
    }

    // --- redraw ---------------------------------------------------------------
    //
    // Three different events, one meaning: a resize, a language change and a
    // theme change all mean "draw it again".  The third arrives as a synthetic
    // resize — `theme.js` dispatches one when the palette flips, because the
    // canvases read their colours from CSS custom properties at draw time and
    // would otherwise keep the previous theme's until something else moved.
    var refreshers = [];
    function refresh() { refreshers.forEach(function (fn) { fn(); }); }

    // --- the shared poloidal cross-section ------------------------------------
    //
    // ★The VIEW BOX is computed once and kept: `FyPlot.deviceView` walks every
    // coil to find the frame, and the machine does not change between frames.
    // It changes when the DEVICE does, and a device change reloads the page.
    var crossView = null;

    function cross($, eq, opts) {
      var e = $((opts && opts.canvas) || 'cross');
      if (!e) return null;
      opts = opts || {};
      if (!crossView && opts.fitDevice && root.FYLITE_MACHINE)
        crossView = root.FyPlot.deviceView(root.FYLITE_MACHINE, opts.margin);
      var o = {
        machine: root.FYLITE_MACHINE,
        grid: kernel ? kernel.grid : null,
        psi: eq && eq.psi,
        psiAxis: eq && eq.psiAxis,
        psiBnd: eq && eq.psiBnd,
        fluxSegs: eq && eq.fluxSegs,
        lcfs: eq && eq.lcfs,
        axis: eq && [eq.axisR, eq.axisZ],
        nLevels: eq ? (opts.nLevels === undefined ? 12 : opts.nLevels) : 0,
      };
      if (crossView) o.view = crossView;
      Object.keys(opts).forEach(function (k) {
        if (k === 'canvas' || k === 'legend' || k === 'fitDevice' ||
            k === 'margin') return;
        o[k] = opts[k];
      });
      root.FyPlot.poloidal(e, o);
      if (opts.legend) {
        var lg = $(typeof opts.legend === 'string' ? opts.legend : 'cross-legend');
        if (lg && opts.legendItems)
          lg.innerHTML = root.FyPlot.legendHTML(opts.legendItems);
      }
      return e;
    }

    // --- registering a part ---------------------------------------------------

    function addPart(partId, spec) {
      buildToolbar();
      if (!worker) buildWorker();
      var pp = partId + '-';
      //: ★the fallback to the page is what lets a controller keep saying
      //: `$('status')` and `$('run')`: those moved to the page's toolbar, and
      //: nothing else about the controller had to know
      var $ = function (id) {
        return document.getElementById(pp + id) || $p(id);
      };
      var p = { id: partId, spec: spec, on: spec.on || {}, running: false, $: $ };
      parts.push(p);

      var sliders = spec.sliders || {};
      function sync() {
        Object.keys(sliders).forEach(function (k) {
          var e = $('v-' + k), src = $(k);
          if (e && src) e.textContent = (+src.value).toFixed(sliders[k]);
        });
      }
      (spec.lockWhileBusy || []).forEach(function (id) {
        if (id !== 'run') locked.push({ $: $, id: id });
      });
      if (spec.refresh) refreshers.push(spec.refresh);

      var api = {
        $: $,
        id: function (id) {
          var e = $(id);
          return e ? e.id : pp + id;
        },
        scope: { getElementById: $ },
        page: partId,
        sync: sync,
        setBusy: function (on, text, cls, state) {
          p.running = on;
          setBusy(on, text, cls, state);
        },
        isBusy: function () { return busy; },
        lock: function (ids) {
          ids.forEach(function (id) { if (id !== 'run') locked.push({ $: $, id: id }); });
        },
        disable: function (id) {
          var e = $(id);
          if (e) { dead[e.id] = true; e.disabled = true; }
        },
        progress: progress,
        /** The status line, for messages that carry markup — see `report`. */
        report: report,
        send: send,
        abort: abort,
        /**
         * A promise for the answer to what was just sent: it settles on the
         * first message of one of `types`, and rejects on `error` or on the
         * run being stopped.  This is how a part tells the page's run chain
         * that its step is over.
         */
        settle: function (types) {
          if (typeof types === 'string') types = [types];
          return new Promise(function (resolve, reject) {
            waiting.push({ types: types, resolve: resolve, reject: reject });
          });
        },
        cross: function (eq, opts) { return cross($, eq, opts); },
        /**
         * This part's own panels, as a query scope.
         *
         * ★A part is no longer a BLOCK of the page: the scenario is one
         * interface, one control column and one figure column, and a part's
         * panels sit among the others carrying `data-part`.  So "my own
         * markup" is a set of groups rather than a single element, and a
         * selector is matched against each group and inside it.
         */
        findAll: function (sel) {
          var out = [];
          var groups = document.querySelectorAll('[data-part="' + partId + '"]');
          Array.prototype.forEach.call(groups, function (g) {
            if (g.matches && g.matches(sel)) out.push(g);
            Array.prototype.push.apply(out, g.querySelectorAll(sel));
          });
          return out;
        },
        find: function (sel) { return api.findAll(sel)[0] || null; },
        /**
         * What this part does when the page is run, and what it can read and
         * write.  Both are declared LATE — where the controller used to bind
         * its own button and install its own file exchange — because that is
         * where the functions they name are in scope.  The page collects them
         * from every part before it wires the one run button and the one
         * export menu.
         */
        onRun: function (fn) { spec.run = fn; },
        /**
         * Say that this part/bar cannot run right now, and why.
         *
         * ★A controller must not reach for the run key itself: the key is the
         * page's chrome, it has moved once already (toolbar → bar strip), and
         * `$('run').disabled = true` in a controller threw the moment it
         * moved — at load, so everything after that line in the file stopped
         * running too. Saying the CONDITION leaves the chrome free to move.
         */
        blockRun: function (why) { spec.blocked = why || true; repaintBars(); },
        allowRun: function () { spec.blocked = null; repaintBars(); },
        /**
         * Declare a 功能栏 of this scenario — see the FUNCTION BARS section
         * below for what a bar owns and what it must not.
         */
        bar: function (barId, barSpec) { return addBar(api, p, barId, barSpec); },
        formats: function (fs) { spec.formats = fs; return { hint: function () {
          if (P.io) P.io.hint();
        } }; },
        onAbort: function (fn) { aborters.push(fn); },
        onRefresh: function (fn) { refreshers.push(fn); },
        refresh: refresh,
        kernel: function () { return kernel; },
        io: function () { return P.io; },
      };
      p.api = api;
      return api;
    }

    // --- what the page owns, wired once every part has registered -------------

    function finalize() {
      if (P.done || !parts.length) return;
      P.done = true;
      var M = root.FYLITE_MACHINE;

      // one file exchange for the page: the union of what its parts can read
      // and write.  ★Keys are namespaced by part — two parts both call their
      // session file `json` — and the labels say which part's file they are,
      // because a menu offering three entries all reading 「会话文件」 asks a
      // question the reader cannot answer.
      var formats = {}, several = parts.length > 1;
      parts.forEach(function (p) {
        var fs = p.spec.formats || {};
        Object.keys(fs).forEach(function (k) {
          var f = fs[k];
          if (k === 'device') { if (!formats.device) formats.device = f; return; }
          var key = several ? p.id + '-' + k : k;
          if (several) {
            //: a part with no name of its own is named by its id rather than
            //: by the key that was missing
            var name = root.FyI18n.t('nav.' + p.id);
            if (!name || name === 'nav.' + p.id) name = p.id;
            f = Object.create(f);
            f.label = (fs[k].label || k) + ' · ' + name;
          }
          formats[key] = f;
        });
      });
      var io = root.FyIO.install({
        scope: { getElementById: $p },
        report: report,
        formats: formats,
      });
      P.io = io;
      io.buttons.forEach(function (id) { locked.push({ $: $p, id: id }); });

      //: the bars, their strips and their folds — before the run button is
      //: wired, because what the button runs is the bars when there are any
      implicitBars();
      bars.forEach(buildBarHead);
      foldablePanels();
      bars.forEach(paintBar);
      root.FyI18n.onChange(function () { bars.forEach(paintBar); });

      if ($p('run')) {
        //: ★capture phase, so a click while busy never reaches the run itself
        $p('run').addEventListener('click', function (ev) {
          if (!(busy || chaining)) return;
          ev.stopPropagation();
          ev.preventDefault();
          abort();
        }, true);
        $p('run').addEventListener('click', bars.length ? runBars : runAll);
      }
      paintRun();
      root.FyI18n.onChange(paintRun);
      root.addEventListener('resize', refresh);
      root.FyI18n.onChange(refresh);
      refreshers.push(function () { io.hint(); });
      //: ★NO PER-PAGE FOOTNOTE.  Every scenario page used to end with the same
      //: sentence — that the computation happens in this browser and nothing is
      //: uploaded.  Repeated under every page it reads as boilerplate, which is
      //: the one thing a privacy statement must not read as; it is made ONCE,
      //: on the entrance ("运行方式与数据") and on the capability page, and a
      //: page that wants to say something of its own about its device still
      //: has the device notice line for it.
      var foot = $p('foot-note') || document.getElementById('foot-note');
      if (foot) foot.remove();

      if ($p('device')) root.FyDevices.installSelector(pre + 'device', {
        removeBtn: pre + 'dev-del',
        report: report,
      });
      var notice = root.FyDevices.takeNotice();
      var note = $p('dev-note');
      if (notice && note) { note.innerHTML = notice; note.hidden = false; }
      root.FyI18n.install('lang-toggle');
      refresh();
      //: after the catalogue sweep and the controllers' first draw: the
      //: notes are empty in the markup and their length is only knowable
      //: once both have filled them
      foldableNotes();
      bars.forEach(paintBar);
      if (M) send({ cmd: 'init', machine: M });
    }


    // --- 功能栏 FUNCTION BARS --------------------------------------------------
    //
    // A scenario is several BARS.  A bar is one function of the page — the 0-D
    // pass, the 1.5-D pass, the self-consistent loop — and it owns what is
    // genuinely its own: a fold, its panels, its RUN KEY, its product.  What it
    // does NOT own is what a page has one of: the worker, the toolbar, the
    // status line, the file exchange.
    //
    // ★A bar used to carry a switch as well, back when the page had the only
    // run key and the switch said whether that key should include this bar.
    // The key moved into every strip; the switch then answered a question
    // nobody was asked, and is gone.
    //
    // Three properties are the point, and each of them is a rule:
    //
    //   FOLD      a bar collapses to its title strip and remembers that it is
    //             folded.  Reading a page with four bars open is not the same
    //             task as reading the one bar you came for.
    //   SHARE     a bar PUBLISHES its product on the page's bus and a
    //             downstream bar TAKES it.  ★Only on a page run: pressing the
    //             run button means "run this scenario", and the upstream answer
    //             is then the downstream input.  Dragging one bar's own control
    //             means "recompute this bar with the values I can see" — taking
    //             upstream values there would overwrite the controls under the
    //             reader's hand.
    //   ORDER     a bar declares what it `needs`, and the run order is the
    //             TOPOLOGICAL order of those declarations, not the order the
    //             sections happen to be written in.  A bar whose upstream has
    //             not run yet says so in its strip instead of running on
    //             whatever its controls happened to hold.
    //
    // A part that registers no bar of its own gets an implicit one named after
    // it: the three single-function scenarios then get the same strip, the same
    // fold and the same chrome without their controllers knowing bars exist.

    var bars = [], barsById = {}, bus = {}, activeBar = null;

    /** Topological order of `needs`, stable in registration order. */
    function barOrder() {
      var out = [], seen = {}, mark = {};
      function visit(b) {
        if (seen[b.id]) return;
        //: a cycle is a declaration bug, not a runtime condition: break it
        //: where it is found and keep the registration order for the rest
        if (mark[b.id]) return;
        mark[b.id] = true;
        (b.spec.needs || []).forEach(function (n) {
          if (barsById[n]) visit(barsById[n]);
        });
        seen[b.id] = true;
        out.push(b);
      }
      bars.forEach(visit);
      return out;
    }

    /**
     * The upstream bars of `b` that have nothing to hand it yet.
     *
     * ★"Not yet run" is the whole condition now.  It used to also mean
     * "switched off", back when a bar carried a switch; with a run key in
     * every strip the reader simply presses the downstream bar first, and
     * that is the case worth naming in the strip.
     */
    function missingUpstream(b) {
      return (b.spec.needs || []).filter(function (n) {
        var u = barsById[n];
        if (!u) return false;              //: not a bar of this page
        return !barProduced(u);
      });
    }

    /**
     * Has this bar something to hand downstream?  Publishing is the mechanism
     * (`api.publish`), but a bar that computes without publishing is still a
     * bar that has run — so either counts, and neither is guessed from the
     * busy latch, which says only that SOMETHING is running.
     */
    function barProduced(b) {
      if (b.ran === true) return true;
      var v = bus[b.id];
      //: ★A BUILDER IS NOT A PRODUCT.  Most bars publish a function so that
      //: what a taker gets is current rather than a snapshot from the last
      //: run — and a function is never null, so a bar that published one at
      //: registration counted as having produced before it had run at all.
      //: Nothing noticed while no bar declared `needs`; the pulse bar does
      //: now, and its key would have been live from page load.  The builder
      //: is asked instead, and only while `ran` is false, so this costs one
      //: cheap call per repaint and nothing at all once the bar has run.
      if (typeof v === 'function') {
        try { v = v(); } catch (e) { v = null; }
      }
      return v != null;
    }

    /** May this bar be run right now: upstream ready, nothing blocking it. */
    function barReady(b) {
      return typeof b.spec.run === 'function' && !b.spec.blocked
             && !missingUpstream(b).length;
    }

    //: bars may be asked to repaint before any of them is built (a controller
    //: can block its run while the kernel is still handshaking)
    function repaintBars() { bars.forEach(paintBar); }

    function barTitle(b) {
      var key = b.spec.title || ('nav.' + b.id);
      var t = root.FyI18n.t(key);
      return t === key ? b.id : t;
    }

    function paintBar(b) {
      if (b.section) b.section.classList.toggle('folded', !!b.folded);
      if (b.foldBtn) {
        b.foldBtn.setAttribute('aria-expanded', b.folded ? 'false' : 'true');
        b.foldBtn.title = root.FyI18n.t(b.folded ? 'bar.unfold' : 'bar.fold');
      }
      if (b.needEl) {
        var miss = missingUpstream(b);
        b.needEl.hidden = !miss.length;
        if (miss.length) {
          b.needEl.textContent = root.FyI18n.t('bar.waiting', {
            who: miss.map(function (n) { return barTitle(barsById[n]); }).join('、') });
          //: ★the badge has room for a name, not for a reason.  A bar may
          //: declare `needsNote` — the sentence saying what the reader has to
          //: do first — and it rides as the badge's and the disabled run
          //: key's title, which is where a reader who does not know the page
          //: goes looking.
          if (b.spec.needsNote)
            b.needEl.title = root.FyI18n.t(b.spec.needsNote);
        }
      }
      if (b.resEl) {
        var folded = resultPanels(b).filter(function (p) { return p._folded; });
        b.resEl.hidden = !folded.length;
        if (folded.length)
          b.resEl.textContent = root.FyI18n.t('bar.results', {
            n: folded.length });
      }
      //: a bar that has never reported carries the marker all the same —
      //: 未运行 is one of the four states, not the absence of one
      if (b.stateEl && !b.stateText) paintState(b, '', undefined, 'idle');
      else if (b.stateEl) paintState(b, undefined, undefined, b.state || 'idle');
      paintBarRun(b);
    }

    /**
     * The bar's run key: start when it may start, stop while IT is running,
     * disabled while another bar has the worker — one kernel per page, so two
     * bars running at once is not a thing the reader can ask for.
     */
    function paintBarRun(b) {
      var e = b.runBtn;
      if (!e) return;
      var mine = (busy || chaining) && activeBar === b;
      var key = mine ? 'io.abort' : 'io.run';
      e.classList.toggle('stop', mine);
      e.innerHTML = mine ? ICON_STOP : ICON_RUN;
      var blocked = !mine && missingUpstream(b).length && b.spec.needsNote;
      e.title = blocked ? root.FyI18n.t(b.spec.needsNote)
                        : root.FyI18n.t(key + '.title');
      e.setAttribute('aria-label', root.FyI18n.t(key));
      //: a key that is `disabled` while running cannot stop anything
      e.disabled = mine ? false : ((busy || chaining) || !barReady(b));
    }

    function foldKey(id) { return 'fylite:fold:' + pageId + ':' + id; }

    function remember(id, folded) {
      //: a private browsing window, a browser that blocks site data, a
      //: thumbnailer — every one of them throws here rather than returning
      //: nothing, and none of them is a reason for the page not to work
      try { root.localStorage.setItem(foldKey(id), folded ? '1' : '0'); }
      catch (e) { /* the fold is then per-visit, which is not a failure */ }
    }
    function recall(id) {
      try { return root.localStorage.getItem(foldKey(id)); }
      catch (e) { return null; }
    }

    /**
     * The strip at the top of a bar: fold, title, what it is waiting for, what
     * it last did, and the key that runs it.  Injected rather than written into the
     * markup — six pages of hand-copied chrome is what the toolbar taught.
     */
    function buildBarHead(b) {
      var sec = document.querySelector('[data-bar="' + b.id + '"]');
      if (!sec) return;
      b.section = sec;
      //: ★`funcbar`, not `bar`: the toolbar's progress element is already
      //: `.bar`, and a rule written for one would have painted the other
      sec.classList.add('funcbar');
      var head = document.createElement('div');
      head.className = 'funcbar-head';

      var fold = document.createElement('button');
      fold.type = 'button';
      fold.className = 'funcbar-fold';
      fold.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true">'
                     + '<path d="M4 6l4 4 4-4"/></svg>';
      fold.addEventListener('click', function () {
        b.folded = !b.folded;
        remember(b.id, b.folded);
        paintBar(b);
        //: an unfolded canvas has been sized 0 while it was hidden, so what
        //: comes back has to be drawn again rather than shown again
        if (!b.folded) refresh();
      });
      b.foldBtn = fold;

      var title = document.createElement('h2');
      title.className = 'funcbar-title';
      title.setAttribute('data-i18n', b.spec.title || ('nav.' + b.id));

      head.appendChild(fold);
      //: ★NO SWITCH.  A bar used to carry a checkbox saying whether the page's
      //: one run key should include it; since every bar has a run key of its
      //: own, that checkbox answered a question nobody was being asked — you
      //: run a bar by running it.  What is left is the fold, which is about
      //: reading, and the run key, which is about computing.
      head.appendChild(title);

      var need = document.createElement('span');
      need.className = 'funcbar-need';
      need.hidden = true;
      head.appendChild(need);
      b.needEl = need;

      //: ★what is folded away below, and why — a bar whose result panels are
      //: collapsed has to say that they exist, or the fold reads as a page
      //: that is missing half of itself
      var res = document.createElement('span');
      res.className = 'funcbar-results';
      res.hidden = true;
      head.appendChild(res);
      b.resEl = res;

      var state = document.createElement('span');
      state.className = 'funcbar-state';
      head.appendChild(state);
      b.stateEl = state;

      //: A bar's own actions ride in its strip, next to its run key: they were
      //: in the page toolbar, which is the place for what the PAGE has one of
      //: — a control that only means something for one bar (「正解」 solves
      //: THIS bar's equilibrium) read there as if it belonged to the page.
      //: Declared in the markup inside the section, adopted here.
      Array.prototype.forEach.call(
        sec.querySelectorAll('[data-bar-action]'), function (el) {
          el.classList.add('funcbar-action');
          head.appendChild(el);
        });

      //: ★The run key belongs to the BAR, at the right end of its own strip:
      //: one bar, one thing to run, and the control that runs it is in the
      //: strip that says whether it may run at all.  A page-level key could
      //: only ever mean "run them all", and a reader who wants the 1.5-D pass
      //: re-run on the equilibrium already in hand had to run the equilibrium
      //: again to get it.  `id` stays `<page>-<bar>-run` so a gate can drive
      //: one stage by name.
      if (typeof b.spec.run === 'function') {
        var runb = document.createElement('button');
        runb.type = 'button';
        runb.id = b.pre + 'run';
        runb.className = 'icon-btn funcbar-run';
        //: capture phase, so a click while this bar is running never reaches
        //: the run itself — the same two-verb key as the toolbar's was
        runb.addEventListener('click', function (ev) {
          if (!(busy || chaining)) return;
          ev.stopPropagation();
          ev.preventDefault();
          abort();
        }, true);
        runb.addEventListener('click', function () { runBar(b); });
        head.appendChild(runb);
        b.runBtn = runb;
      }

      sec.insertBefore(head, sec.firstChild);
      root.FyI18n.applyDom(head);

      var saved = recall(b.id);
      b.folded = saved === null ? !!b.spec.folded : saved === '1';
      paintBar(b);
    }

    /**
     * Every panel folds too, one level down: a bar is several panels and a
     * reader who wants the figure does not want the twenty sliders above it.
     * The title comes from the panel's own heading; a panel that is only a
     * figure is named by its caption, because a fold control with no name is
     * a control nobody presses twice.
     */
    function foldablePanels() {
      var n = 0;
      Array.prototype.forEach.call(
        document.querySelectorAll('.funcbar .panel'), function (p) {
          if (p.dataset.foldable) return;
          p.dataset.foldable = '1';
          var key = p.id || (p.closest('[data-bar]').dataset.bar + '#' + (n++));
          var h = null;
          for (var i = 0; i < p.children.length; i++)
            if (p.children[i].tagName === 'H2') { h = p.children[i]; break; }
          var head = h;
          if (!head) {
            head = document.createElement('div');
            head.className = 'panel-title';
            //: ★A panel with no heading of its own is named by what it HOLDS,
            //: and the order matters.  Headings INSIDE it are the panel's own
            //: words and come first; one figure lends its caption; several
            //: may not — borrowing the first one puts「安全因子 q(ψ)…」over a
            //: panel that also carries the pressure and the current density,
            //: a title that is wrong about two thirds of what is under it.
            //:
            //: Re-derived on a language change, because the words it borrows
            //: are translated and this copy of them is not.
            var name = function () {
              var subs = p.querySelectorAll('h2, h3');
              if (subs.length) {
                var t = Array.prototype.map.call(subs, function (x) {
                  return x.textContent.trim();
                }).filter(Boolean).join(' · ');
                if (t) return t.slice(0, 48);
              }
              var figs = p.querySelectorAll('figure');
              if (figs.length === 1) {
                var cap = p.querySelector('figcaption, .caveat, .scope');
                if (cap && cap.textContent.trim())
                  return cap.textContent.trim().slice(0, 48);
              }
              return figs.length > 1
                ? root.FyI18n.t('bar.figures', { n: figs.length })
                : root.FyI18n.t('bar.figure');
            };
            var paintName = function () {
              //: the fold button lives in this element; only the text moves
              head.firstChild.nodeValue = name();
            };
            head.appendChild(document.createTextNode(name()));
            root.FyI18n.onChange(paintName);
            p.insertBefore(head, p.firstChild);
          }
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'panel-fold';
          btn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true">'
                        + '<path d="M4 6l4 4 4-4"/></svg>';
          var paint = function () {
            p.classList.toggle('folded', !!p._folded);
            btn.setAttribute('aria-expanded', p._folded ? 'false' : 'true');
            btn.title = root.FyI18n.t(p._folded ? 'bar.unfold' : 'bar.fold');
          };
          btn.addEventListener('click', function () {
            p._folded = !p._folded;
            remember('panel:' + key, p._folded);
            paint();
            if (!p._folded) refresh();
          });
          head.appendChild(btn);
          head.classList.add('foldable');
          //: ★T-D11: A PANEL WITH NOTHING IN IT YET STARTS FOLDED.  Measured
          //: on the design page at 1440 x 900: three bars open came to 6366
          //: px, and of the 1981 px the shape bar occupies before it has run,
          //: some 900 px are tables reading 「—」 in every cell and plots with
          //: nothing but axes.  A panel that has never held a result is not
          //: information, it is a placeholder the size of half a screen.  The
          //: markup says which panels those are (`data-result`); they open by
          //: themselves the moment their bar produces something, and a reader
          //: who has folded or unfolded one by hand keeps their choice.
          p._foldKey = key;
          p._paint = paint;
          var saved = recall('panel:' + key);
          p._folded = saved === null ? p.hasAttribute('data-result')
                                     : saved === '1';
          paint();
        });
    }

    /**
     * LONG EXPLANATIONS FOLD (T-D11).
     *
     * ★The prose on these pages is the point of them — every note says why a
     * number means what it means, and none of it is filler.  What is wrong is
     * the POSITION: the solver panel's ten-line 「退火是局域方法…」 sat
     * permanently open above the four controls it explains, longer than they
     * are, so the control a reader came for was below the fold and the
     * explanation they had already read was above it.  Clamped to three lines
     * with a key that opens it, and the choice is remembered.
     *
     * Only notes the CATALOGUE fills (`data-i18n`) are touched: a note a
     * controller writes is a live report, its length changes with the answer,
     * and clamping a verdict would hide the verdict.  The text stays in the
     * document either way — this is a height, not a removal — so anything
     * reading it still reads all of it.
     */
    //: ★in HALF-WIDTH UNITS, not characters: the same sentence is about
    //: twice as many characters in English as in Chinese, and a threshold in
    //: characters would clamp one language and not the other.  260 is about
    //: five wrapped lines in the narrow control column, which is where a
    //: note starts being longer than the controls it explains.
    var NOTE_LONG = 260;
    function noteWeight(t) {
      var w = 0;
      for (var i = 0; i < t.length; i++) w += t.charCodeAt(i) > 0x2e80 ? 2 : 1;
      return w;
    }
    function foldableNotes() {
      Array.prototype.forEach.call(
        document.querySelectorAll('.tool .note[data-i18n]'), function (n) {
          if (n.dataset.clamp) return;
          if (noteWeight((n.textContent || '').trim()) < NOTE_LONG) return;
          var key = 'note:' + n.getAttribute('data-i18n');
          n.dataset.clamp = '1';
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'note-more';
          var paint = function () {
            btn.textContent = root.FyI18n.t(
              n.classList.contains('clamped') ? 'bar.note.more'
                                              : 'bar.note.less');
          };
          btn.addEventListener('click', function () {
            n.classList.toggle('clamped');
            remember(key, n.classList.contains('clamped'));
            paint();
          });
          n.classList.toggle('clamped', recall(key) !== '0');
          n.parentNode.insertBefore(btn, n.nextSibling);
          root.FyI18n.onChange(paint);
          paint();
        });
    }

    /** How many result panels this bar has, and how many are still folded. */
    function resultPanels(b) {
      if (!b || !b.section) return [];
      return Array.prototype.slice.call(
        b.section.querySelectorAll('.panel[data-result]'));
    }

    /**
     * Open this bar's result panels, now that it has results.
     *
     * A panel the reader has folded or unfolded by hand is left alone: their
     * choice is in `localStorage`, and overriding it every run would make the
     * fold control useless on exactly the panels it matters for.
     */
    function revealResults(b) {
      var any = false;
      resultPanels(b).forEach(function (p) {
        if (!p._paint || recall('panel:' + p._foldKey) !== null) return;
        if (!p._folded) return;
        p._folded = false;
        p._paint();
        any = true;
      });
      if (any) refresh();
    }

    /**
     * One press runs ONE bar — the bar whose strip carries the key.
     *
     * `{chain: true}` is deliberate: pressing a bar's run key means "run this
     * stage", and a stage runs on what its upstream produced, not on whatever
     * its own controls happen to hold (that second meaning belongs to dragging
     * one of its sliders, and the SHARE rule above says why the two must not
     * be the same act).  The key is only enabled once that upstream is there.
     */
    function runBar(b) {
      if (busy || chaining || !barReady(b)) return;
      activeBar = b;
      bars.forEach(paintBarRun);
      var r;
      try { r = b.spec.run({ chain: true }); }
      catch (e) {
        setBusy(false, root.FyI18n.t('io.failed', { why: e.message }), 'err');
        bars.forEach(paintBar);
        throw e;
      }
      return Promise.resolve(r).then(function () {
        b.ran = true;
        //: every bar repaints, not just this one: what just finished is what
        //: unlocks the bars downstream of it
        bars.forEach(paintBar);
      }, function () {
        bars.forEach(paintBar);
      });
    }

    /**
     * One press runs the scenario: every bar that has a run, in
     * TOPOLOGICAL order, each one waited for before the next begins.
     */
    function runBars() {
      if (chaining) return;
      var seq = barOrder().filter(function (b) {
        return typeof b.spec.run === 'function';
      });
      if (!seq.length) {
        setBusy(false, root.FyI18n.t('bar.none'), 'warn');
        return;
      }
      if (seq.length === 1) return seq[0].spec.run({ chain: true });
      chaining = true;
      paintRun();
      var i = 0;
      return new Promise(function (done) {
        function step() {
          if (!chaining || i >= seq.length) {
            chaining = false; paintRun(); setBusy(false); return done();
          }
          var b = seq[i++];
          whenIdleBar(function () {
            var r;
            try { r = b.spec.run({ chain: true }); }
            catch (e) {
              chaining = false; paintRun();
              setBusy(false, root.FyI18n.t('io.failed', { why: e.message }), 'err');
              done();
              throw e;
            }
            //: a bar that failed has already said so in its own strip; the
            //: chain stops there rather than running the next bar on inputs
            //: the failed one was supposed to produce
            Promise.resolve(r).then(function () { b.ran = true; step(); },
              function () {
                chaining = false; paintRun(); done();
              });
          });
        }
        step();
      });
    }

    /**
     * ★Wait for the LATCH, not only for the promise: a bar can go on working
     * after the answer the chain waited for (the 0-D bar then solves its slice
     * equilibrium and runs its sweep), and every controller's run opens with
     * `if (S.isBusy()) return` — so the next bar would be called, find the page
     * busy, and return SILENTLY.
     */
    function whenIdleBar(fn, waited) {
      if (!busy || (waited || 0) > 60000) return fn();
      root.setTimeout(function () { whenIdleBar(fn, (waited || 0) + 60); }, 60);
    }

    /**
     * Register a bar of this page, and hand back the part-shaped API its
     * controller was written against — `$('chi0')`, `setBusy(…)`, `S.send(…)`
     * all mean what they meant.  Two rules make that true:
     *
     *   ELEMENTS   `$` tries the bar's own prefix (`model-transport-kappa`)
     *              and falls back to the page's (`model-chi0`).  A quantity
     *              two bars share is therefore ONE control, set once for the
     *              scenario, and only a name two bars would BOTH have wanted
     *              is spelled out with the bar in it.
     *   MESSAGES   `on` claims a worker message type for this bar; a type two
     *              bars claim goes to the one that is running, except `ready`
     *              — the kernel handshake belongs to all of them.
     */
    /**
     * The worked cases a bar offers from a menu.
     *
     * ★★A CASE IS A SESSION DOCUMENT, listed by `cases/catalogue.jsonld` and
     * applied through the same `FySession.apply` an imported file goes
     * through.  That is the whole design: what the menu offers and what
     * 「导出 → 会话文件」 writes are one format, so a reader can save a run and
     * hand it back as a case, and a case cannot drift into a shape only this
     * menu can read.
     *
     * ★★THIS USED TO BE THE 含时演化 BAR'S PRIVATE CODE, with the bar it
     * served written into it as the string `'evolve'`.  Ten bars, one of
     * which could be handed a worked starting point — and the other nine
     * could not, because the machinery was in the wrong file.  It is here
     * now and takes the bar from the bar; the catalogue's `fylite:bar` was
     * always in the documents waiting for a reader that honoured it.
     *
     * ★A case carries INPUTS and never a result — it does not run the bar.
     * ★A catalogue that will not load is REPORTED and the menu stays empty:
     * a bar works without cases (that is how every one of them worked before
     * there were any), and a page that cannot open because a data file is
     * missing is a worse failure than a menu with nothing in it.
     *
     *   S.cases({ after: function () { ... }, when: readyPromise })
     *
     * `after` runs once the controls are written, for whatever the bar has
     * to re-derive from them (labels, cost notes, a redrawn cross-section).
     *
     * ★`when` is a promise for THIS BAR BEING READY, and only the INITIAL
     * case waits on it.  It is not ceremony: a menu built from a file that
     * arrives in milliseconds can be applied before the bar's own async
     * setup has landed, and a control that is not there yet is a control a
     * case cannot write.  It was real — the ADAS species menu is filled from
     * the worker's `ready` message, so 「Be」 applied before that message
     * became the empty selection, and the ITER case quietly ran with no
     * impurity radiation (T_e(0) 24.14 keV instead of 22.53).  A case the
     * READER picks needs no such wait: by then everything has arrived.
     */
    function installCases(api, barId, opts) {
      var T = root.FyI18n.t;
      var sel = api.$('case');
      var cases = {};
      var initialId = null;
      if (!sel || typeof fetch !== 'function') return { cases: cases };

      function caseName(doc) {
        var c = doc['fylite:case'] || {};
        return (root.FyI18n.current() === 'en' ? c['fylite:name_en']
                                               : c['fylite:name'])
               || c['fylite:name'] || doc['@id'];
      }

      /**
       * Apply one case: the controls, then whatever reads them.
       *
       * ★What a case may NOT do is change the machine.  It DECLARES which
       * one it was written for, and a mismatch is said out loud rather than
       * acted on — switching the device rebuilds the worker and throws away
       * whatever the reader had imported, which is not something a menu
       * should do behind their back.
       */
      function applyCase(id, quiet) {
        var rec = cases[id];
        if (!rec) return;
        var doc = rec.doc, c = doc['fylite:case'] || {};
        if (doc['fylite:page'] !== barId)
          return api.report(T('case.wrong_bar', { bar: doc['fylite:page'],
                                                  here: barId }), 'err');
        var r = root.FySession.apply(doc['fylite:config'], api.scope);
        api.sync();
        if (opts.after) opts.after();
        var en = root.FyI18n.current() === 'en';
        var note = api.$('case-note');
        if (note) {
          var bits = [(en ? c['fylite:note_en'] : c['fylite:note'])
                      || c['fylite:note'] || ''];
          var needs = (en ? c['fylite:needs_en'] : c['fylite:needs'])
                      || c['fylite:needs'];
          if (needs && needs.length)
            bits.push(T('case.needs', {
              list: needs.map(function (n) { return '<li>' + n + '</li>'; })
                         .join('') }));
          var want = rec.entry['fylite:device'] || c['fylite:device'];
          var act = root.FyDevices ? root.FyDevices.active() : null;
          var have = act ? act.id : null;
          if (want && have && want !== have)
            bits.push(T('case.device', { want: want, have: have }));
          note.innerHTML = bits.filter(Boolean).join(' ');
          note.hidden = !note.innerHTML;
        }
        api.report(T(quiet ? 'case.initial' : 'case.applied',
                     { name: caseName(doc), n: r.applied.length }));
      }

      //: ★THE INITIAL CASE is the catalogue's `fylite:initial`, applied ONCE
      //: — on a first visit, when this bar has no trace of the reader in
      //: `localStorage`.  It is NOT the factory settings: the 「缺省」 case is
      //: still the one step back to those, and it is still in the menu.
      //: ★NEVER over a session the reader already has: a menu may be pressed,
      //: a starting point may not be imposed on work in progress.
      var seenKey = 'fylite:seen:' + pageId + ':' + barId;
      function firstVisit() {
        try {
          if (root.localStorage.getItem(seenKey)) return false;
          root.localStorage.setItem(seenKey, '1');
          return true;
        } catch (e) {
          //: a private window, a browser that blocks site data, a thumbnailer
          //: — every one throws here, and none of them is a reason to impose
          //: a starting point on every load
          return false;
        }
      }

      var dir = (location.pathname.indexOf('/scenario/') >= 0 ? '../' : '')
                + 'cases/';
      fetch(dir + 'catalogue.jsonld')
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (cat) {
          var want = ((cat && cat['fylite:cases']) || []).filter(function (e) {
            return e['fylite:bar'] === barId;
          }).sort(function (a, b) {
            return (a['fylite:order'] | 0) - (b['fylite:order'] | 0);
          });
          return Promise.all(want.map(function (e) {
            return fetch(dir + e['fylite:document'])
              .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
              })
              .then(function (doc) {
                var id = e['fylite:case_id'];
                cases[id] = { entry: e, doc: doc };
                if (e['fylite:initial']) initialId = id;
                var o = document.createElement('option');
                o.value = id;
                o.textContent = caseName(doc);
                sel.appendChild(o);
              })
              .catch(function (err) {
                api.report(T('case.failed', { id: e['fylite:case_id'],
                                              why: err.message }), 'err');
              });
          }));
        })
        .then(function () {
          if (!(initialId && firstVisit())) return null;
          //: ★wait for the bar, then apply — see `when` above
          return Promise.resolve(opts.when).then(function () {
            sel.value = initialId;
            applyCase(initialId, true);
          });
        })
        .catch(function (err) {
          api.report(T('case.nocat', { why: err.message }), 'err');
        });

      sel.addEventListener('change', function () {
        if (this.value) applyCase(this.value);
      });
      return { cases: cases, apply: applyCase };
    }

    function addBar(part, p, barId, spec) {
      spec = spec || {};
      var bpre = pre + barId + '-';
      var b = { id: barId, spec: spec, folded: false, stateText: '', pre: bpre };
      bars.push(b);
      barsById[barId] = b;

      var $ = function (id) {
        return document.getElementById(bpre + id) || part.$(id);
      };
      var sliders = spec.sliders || {};
      function sync() {
        Object.keys(sliders).forEach(function (k) {
          var e = $('v-' + k), src = $(k);
          if (e && src) e.textContent = (+src.value).toFixed(sliders[k]);
        });
      }
      Object.keys(spec.on || {}).forEach(function (t) {
        claimBar(p, t, b, spec.on[t]);
      });

      var api = Object.create(part);
      api.$ = $;
      api.id = function (id) { var e = $(id); return e ? e.id : bpre + id; };
      api.scope = { getElementById: $ };
      api.page = barId;
      api.bar = barId;
      api.sync = sync;
      /** The worked cases this bar offers — see `installCases`. */
      api.cases = function (o) { return installCases(api, barId, o || {}); };
      //: ★`state` is the fourth argument and the only one a bar has to think
      //: about: without it the marker is derived from the class, which is
      //: right for every bar that reports 「失败」 with `err` and 「未达」 with
      //: `warn`.  A bar that finishes with a caveat — a trajectory over a
      //: declared limit — says which of the four it means.
      api.setBusy = function (on, text, cls, state) {
        activeBar = on ? b : (activeBar === b ? null : activeBar);
        var sk = stateOf(on, cls, state);
        if (text !== undefined) paintState(b, text, cls, sk);
        part.setBusy(on, text, cls, state);
        //: ★a result is what opens the panels that hold results.  Not a
        //: failure: there is nothing in them to show, and unfolding half a
        //: screen of 「—」 is the state this was written to remove.
        if (text !== undefined && (sk === 'done' || sk === 'miss'))
          revealResults(b);
        if (text !== undefined) paintBar(b);
      };
      api.onRun = function (fn) { spec.run = fn; };
      api.blockRun = function (why) { spec.blocked = why || true; repaintBars(); };
      api.allowRun = function () { spec.blocked = null; repaintBars(); };
      /** What this bar produces, for the bars that declared they need it. */
      api.publish = function (value) { bus[barId] = value; };
      /**
       * The product of an upstream bar, or null if it has none yet.
       *
       * ★A bar may publish a BUILDER instead of a value, and most should: a
       * value published once goes stale the moment a control moves, while a
       * builder is asked at the moment it is taken.  It is called here so a
       * taker never has to know which of the two it got.
       */
      api.take = function (id) {
        var v = bus[id];
        return (typeof v === 'function' ? v() : v) || null;
      };
      api.findAll = function (sel) {
        var out = [];
        Array.prototype.forEach.call(
          document.querySelectorAll('[data-bar="' + barId + '"]'), function (g) {
            if (g.matches && g.matches(sel)) out.push(g);
            Array.prototype.push.apply(out, g.querySelectorAll(sel));
          });
        return out;
      };
      api.find = function (sel) { return api.findAll(sel)[0] || null; };
      /**
       * This bar's own file formats.  ★The key keeps the bar's name
       * (`zerod-json`), so the menu item's id — `model-iofmt-zerod-json` — is
       * the one the gates press and the label says whose file it is: three
       * entries all reading 「会话文件」 ask a question the reader cannot
       * answer.  The file format itself is untouched, `fylite:page` included.
       */
      api.formats = function (fs) {
        //: ★ACCUMULATED, not replaced: the export menu is the union of every
        //: bar's formats, and each bar declares its own late, where the
        //: functions it names are in scope
        p.bag = p.bag || {};
        Object.keys(fs).forEach(function (k) {
          var f = fs[k];
          if (k === 'device') { if (!p.bag.device) p.bag.device = f; return; }
          var named = Object.create(f);
          if (bars.length > 1) named.label = (f.label || k) + ' · ' + barTitle(b);
          p.bag[barId + '-' + k] = named;
        });
        return part.formats(p.bag);
      };
      return api;
    }

    var barClaims = {};
    /**
     * A worker message type, claimed for one bar.
     *
     * The PART owns the message map (`dispatch` reads it), so the bars share
     * one entry per type: `ready` is the kernel handshake and goes to every
     * bar that asked for it; anything else two bars claim — `error` — goes to
     * the bar that is running, because it is the only one that can say what
     * the message means.
     */
    function claimBar(p, type, b, fn) {
      if (!barClaims[type]) {
        barClaims[type] = [];
        p.on[type] = function (m) {
          var l = barClaims[type];
          if (l.length === 1) return l[0].fn(m);
          if (type === 'ready') return l.forEach(function (c) { c.fn(m); });
          var own = l.filter(function (c) { return c.b === activeBar; });
          (own.length ? own : [l[0]]).forEach(function (c) { c.fn(m); });
        };
      }
      barClaims[type].push({ b: b, fn: fn });
    }

    /**
     * A scenario whose controller never mentions bars still has one: the
     * three single-function pages get the strip, the fold and the state line
     * without a line of their own.  Its run is the part's run.
     */
    function implicitBars() {
      if (bars.length) return;
      parts.forEach(function (p) {
        if (!document.querySelector('[data-bar="' + p.id + '"]')) return;
        var b = { id: p.id, spec: p.spec, folded: false, stateText: '', pre: pre + p.id + '-' };
        bars.push(b);
        barsById[p.id] = b;
      });
    }

    //: ★the bars and the bus, reachable from outside the closure.  Not an
    //: API for the controllers — they get the facade — but the gates have to
    //: be able to ask what a bar published without saving a file, and so does
    //: anyone debugging a handoff that did not happen.
    P.bars = bars;
    P.bus = bus;
    //: the whole-page chain, kept reachable although no control presses it:
    //: the bars carry the keys now, but a gate that wants the scenario run
    //: end to end should not have to click its way down the topological order
    P.runBars = runBars;
    P.runAll = runAll;
    P.addPart = addPart;
    P.finalize = finalize;
    return P;
  }

  // --- registration ----------------------------------------------------------

  /**
   * Register a part of THIS page.  The page is the one the document names
   * (`<body data-page="design">`), so a part does not carry the name of the
   * scenario it happens to sit in and can be moved between pages by moving
   * its markup and its script tag.
   */
  function part(partId, spec) {
    var pageId = (document.body && document.body.getAttribute('data-page')) || partId;
    if (!pages[pageId]) pages[pageId] = makePage(pageId);
    return pages[pageId].addPart(partId, spec);
  }

  /**
   * ★Wiring the page waits for every part, and the parts are separate script
   * files: the toolbar's export menu is the union of their formats, and the
   * run button is the sequence of their runs, so neither can be built while
   * one of them is still loading.  Every part script is deferred, so
   * `DOMContentLoaded` is exactly the moment they have all run.
   */
  function boot() {
    Object.keys(pages).forEach(function (k) { pages[k].finalize(); });
  }

  /**
   * The machines, fetched once per page.
   *
   * ★The preset devices are fyo/JSON-LD documents fetched from `app/devices/`
   * (they were a script that pushed a global), so `FYLITE_MACHINE` is null
   * until they arrive — and a controller that reads it while its own file is
   * being evaluated reads that null.  That is not a bug in the controller:
   * a machine is runtime state, and the moment a page's scripts run is not a
   * moment at which it is known.  So a controller declares its whole body
   * here instead, and gets it after.
   *
   * ★MEMOISED: `FyDevices.load()` re-fetches the catalogue and every document
   * on each call, and a page has several controllers plus this file's own
   * boot.  One page, one round of fetches.
   *
   * ★It never rejects: `FyDevices.load` reports what it could not read and
   * resolves anyway, because a page that a missing data file can stop is a
   * page that cannot be opened.
   */
  var devicesReady = null;
  function whenDevices(fn) {
    var D = root.FyDevices;
    if (!D || typeof D.load !== 'function') { fn(); return; }
    if (!devicesReady) devicesReady = D.load();
    devicesReady.then(fn, fn);
  }

  /**
   * ★★And the page waits for the machines as well as for the parts.
   *
   * Finalising before the presets arrive would build the machine list without
   * them, resolve `FYLITE_MACHINE` to null or to an imported machine, and send
   * the worker an `init` for a tokamak the visitor did not choose.  The
   * controllers' bodies are queued on the same promise BEFORE this one — their
   * files are evaluated while the document is still parsing — so every part
   * and bar has registered by the time this runs.
   */
  function bootWithDevices() { whenDevices(boot); }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', bootWithDevices);
    else setTimeout(bootWithDevices, 0);
  }

  root.FyScenario = { part: part, boot: boot, pages: pages,
                      whenDevices: whenDevices };
})(typeof self !== 'undefined' ? self : globalThis);
