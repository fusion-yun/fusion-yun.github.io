// The v2 page shell — one strip, four pages (`FYL-DESIGN-11` V-11 / V-12,
// `FYL-DESIGN-10` P-25 / P-26 / P-27).
//
// ★THIS FILE MOVES NODES; IT DOES NOT BUILD CONTROLS.
//
// Every control on the strip already exists on the page and already has a
// controller bound to it: the device select and the import/export pair come
// from `scenario.js buildToolbar()`, the mdsip source box from the data page's
// own markup, the exit button from the page.  Re-creating any of them here
// would mean two implementations of one control, and the second one would be
// the one that goes stale.  So this file waits for them to exist and then
// relocates them — ids, listeners and controllers travel with the node.
//
// What it therefore does, in order of how load-bearing it is:
//
//   adoptWork()    move the page's toolbar into row 2 of the strip, splitting
//                  it into ④ input · ⑤ state · ⑥ exit and welding the
//                  progress bar to the strip's bottom edge
//   watchBars()    name the bar that is running, in ⑤ — the run KEY stays in
//                  that bar (V-11), so this is the only place the key and its
//                  progress are visible at the same time
//   hoistModes()   pin the mode keys directly under the strip (D-23)
//   sideColumn()   put the page-shared panels beside the bars, not above them
//   foldLead()     collapse the intro to one line
//   emptyState()   give the data page a shape to look at before it has data
//
// ★Nothing here runs on the four original pages: the entry point requires
// `document.body[data-fy-shell="v2"]`, which only `pages/page_*.html` carry.

(function (root) {
  'use strict';

  var D = root.document;
  if (!D) return;

  function $(id) { return D.getElementById(id); }
  function el(tag, cls) {
    var e = D.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  function T(k, p) {
    return root.FyI18n ? root.FyI18n.t(k, p) : k;
  }

  /**
   * Wait for one element to exist, then hand it over — once.
   *
   * ★Load order is not knowable here.  `shell.js` is a plain script in the
   * head; the toolbar is built by a controller that may run before or after
   * it, and on the data page some of the strip's contents are static markup
   * that is already there.  An observer answers all three cases with one
   * mechanism, and disconnects itself so a page that never grows the element
   * costs one observer and no polling.
   */
  function when(sel, fn) {
    var found = D.querySelector(sel);
    if (found) { fn(found); return; }
    var mo = new MutationObserver(function () {
      var e = D.querySelector(sel);
      if (!e) return;
      mo.disconnect();
      fn(e);
    });
    mo.observe(D.documentElement, { childList: true, subtree: true });
  }

  // --- the strip's own height, published to CSS ----------------------------
  //
  // ★The mode strip sticks BELOW this one, and it can only do that if it
  // knows how tall this one is.  Measured rather than declared: the row
  // heights depend on the controls the page put in them, and a hard-coded
  // 84 px would be wrong on the first page that wraps.
  function measure() {
    var h = D.querySelector('header.shell');
    if (!h) return;
    D.documentElement.style.setProperty('--shell-h', h.offsetHeight + 'px');
  }

  // --- ④⑤⑥ : the page's own toolbar, relocated ---------------------------
  function adoptWork(pageId) {
    var r2 = D.querySelector('.shell-r2');
    if (!r2) return;
    var slotIn = r2.querySelector('.shell-in');
    var slotState = r2.querySelector('.shell-state');
    var slotExit = r2.querySelector('.shell-exit');
    var prog = D.querySelector('.shell-prog');

    //: the three scenario pages: `scenario.js` builds `.panel.toolbar`
    when('main .panel.toolbar', function (tb) {
      //: ★the exit button first, while it is still identifiable.  It is the
      //: only button in the row that leaves the page, and `buildToolbar`
      //: appends it after import/export — so it is taken by id, not position.
      var exit = $(pageId + '-handoff') || $(pageId + '-handover');
      if (exit) slotExit.appendChild(exit);

      var bar = tb.querySelector('.bar');
      if (bar && prog) prog.appendChild(bar);

      var status = $(pageId + '-status');
      if (status) slotState.appendChild(status);
      //: the device-note line is a second status the toolbar carries; it stays
      //: with the state slot rather than being dropped
      var note = $(pageId + '-dev-note');
      if (note) slotState.appendChild(note);
      //: ★whatever note the page authored into its toolbar host is a SECOND
      //: status line (the modelling page's step-cost estimate is one).  It
      //: reports, so it belongs in ⑤ — left in ④ it wrapped and made the row
      //: 76 px tall.  Truncated by CSS, with the full text on `title`.
      Array.prototype.forEach.call(tb.querySelectorAll('p.note'), function (n) {
        n.title = n.textContent.trim();
        slotState.appendChild(n);
      });

      //: ★the WRAPPER moves too, and that is deliberate.  Emptying it and
      //: dropping it looked tidier and cost 63 px of strip height: the
      //: toolbar's own rules are scoped `.panel.toolbar .dev-ctl { … }`, and
      //: `.ctl label` is `display: block`, so a device select outside that
      //: scope stacks its label above itself.  Kept, and made `display:
      //: contents`, the existing rules still apply and the row is one line.
      slotIn.appendChild(tb);
      measure();
    });

    //: the data page has no scenario toolbar: its source box IS slot ④ and
    //: its gateway line IS slot ⑤ (P-25 — "pick a source" and "pick a
    //: machine" are the same slot; only this page's source is a server)
    if (pageId === 'data') {
      when('#mds-server', function (input) {
        var ctl = input.closest('.ctl') || input;
        slotIn.appendChild(ctl);
        var use = $('mds-server-use');
        if (use) slotIn.appendChild(use);
        var gw = $('mds-gw');
        if (gw) slotState.appendChild(gw);
        measure();
      });
    }
  }

  // --- ⑤ : which bar is running -------------------------------------------
  //
  // ★Read, never written.  `scenario.js` already puts one of five words and a
  // `data-state` on every bar's strip; this watches those and says WHICH bar
  // the page-level state belongs to.  Deriving it instead of being told keeps
  // the controllers unchanged — and it reads exactly the attribute the gates
  // read, so the two cannot disagree about what "running" means.
  var RANK = { busy: 5, fail: 4, miss: 3, done: 2, idle: 1 };
  //: ★the same map `scenario.js` uses — `idle` is `bar.idle`, not `bar.st.idle`.
  //: Two copies of a key table is how one of them ends up printing a key.
  var STATE_KEY = { done: 'bar.st.done', miss: 'bar.st.miss', fail: 'bar.st.fail',
                    busy: 'bar.st.busy', idle: 'bar.idle', blocked: 'shell.blocked' };

  function watchBars() {
    var slot = D.querySelector('.shell-state');
    if (!slot) return;
    var dot = el('span', 'shell-dot');
    dot.setAttribute('data-state', 'idle');
    var name = el('span', 'shell-bar');
    name.hidden = true;
    slot.insertBefore(name, slot.firstChild);
    slot.insertBefore(dot, slot.firstChild);

    //: ★Write only on a real change, and observe `main` rather than the whole
    //: document.  A `MutationObserver` fires for `setAttribute` even when the
    //: value is unchanged, so a painter that writes unconditionally into the
    //: subtree it is watching never stops — measured: the first version of
    //: this function hung the page before `DOMContentLoaded` could finish.
    function put(e, attr, v) {
      if (e.getAttribute(attr) !== v) e.setAttribute(attr, v);
    }
    function paint() {
      var best = null, bestRank = 0;
      Array.prototype.forEach.call(
        D.querySelectorAll('.funcbar'), function (f) {
          var st = f.querySelector('.funcbar-state');
          if (!st || !st.dataset.state) return;
          var r = RANK[st.dataset.state] || 0;
          if (r > bestRank) { bestRank = r; best = f; }
        });
      put(dot, 'data-state', best
        ? best.querySelector('.funcbar-state').dataset.state : 'idle');
      var title = best && best.querySelector('.funcbar-title');
      //: name the bar for every state except 'nothing has been asked of it'
      //: — ★unless the page's own status line already opens with that name.
      //: The analysis page does, and the strip then read
      //: 「Equilibrium reconstruction  Equilibrium reconstruction · …」.
      var st = $(D.body.getAttribute('data-page') + '-status');
      var said = st ? st.textContent.trim() : '';
      var t = title ? title.textContent.trim() : '';
      if (title && bestRank >= 2 && t && said.indexOf(t) !== 0) {
        if (name.textContent !== t) name.textContent = t;
        if (name.hidden) name.hidden = false;
      } else if (!name.hidden) {
        name.hidden = true;
      }
      //: ★the words, not only the dot.  A reader in greyscale, on a projector
      //: or with a colour-vision difference gets the same sentence (P-27).
      dot.title = (name.hidden ? '' : name.textContent + ' · ')
                + T(STATE_KEY[dot.getAttribute('data-state')] || STATE_KEY.idle);
    }

    var main = D.querySelector('main');
    if (main) {
      new MutationObserver(paint).observe(main, {
        subtree: true, attributes: true, attributeFilter: ['data-state'],
        childList: true,
      });
    }
    paint();
  }

  //: the data page reports the gateway, which is not a bar: its state slot is
  //: blocked until something answers, and "blocked" is a word as well as a hue
  function watchGateway() {
    var slot = D.querySelector('.shell-state');
    var gw = $('mds-gw');
    if (!slot || !gw) return;
    var dot = el('span', 'shell-dot');
    slot.insertBefore(dot, slot.firstChild);
    function paint() {
      var t = (gw.textContent || '').trim();
      var v = !t ? 'idle'
        : /未连|no gateway|not connect|无网关/i.test(t) ? 'blocked' : 'done';
      if (dot.getAttribute('data-state') !== v) dot.setAttribute('data-state', v);
      if (dot.title !== t) dot.title = t;
    }
    new MutationObserver(paint).observe(gw,
      { childList: true, characterData: true, subtree: true });
    paint();
  }

  // --- the mode keys, pinned under the strip (D-23) ------------------------
  function hoistModes(pageId) {
    var modes = $(pageId + '-modes');
    var main = D.querySelector('main');
    if (!modes || !main) return;
    modes.classList.remove('panel', 'page-shared');
    modes.classList.add('shell-modes');
    main.insertBefore(modes, main.firstChild);
    measure();
  }

  // --- the shared controls beside the bars, not above them ------------------
  function sideColumn() {
    var main = D.querySelector('main');
    if (!main) return;
    var shared = Array.prototype.slice.call(
      main.querySelectorAll(':scope > .page-shared, :scope > * > .page-shared'));
    if (!shared.length) return;
    var body = el('div', 'shell-body');
    var side = el('div', 'shell-side');
    var rest = el('div', 'shell-main');
    //: insert the grid where the FIRST shared panel was, so everything above
    //: it (the mode strip, the lead) keeps its place
    shared[0].parentNode.insertBefore(body, shared[0]);
    body.appendChild(side);
    body.appendChild(rest);
    shared.forEach(function (p) { side.appendChild(p); });
    //: everything after the grid becomes its right-hand column
    while (body.nextSibling) rest.appendChild(body.nextSibling);
  }

  // --- the intro, one line by default (P-26) --------------------------------
  function foldLead(pageId) {
    //: ★`#line-doc` is the SCENARIO pages' host — `site.js render()` fills it.
    //: The data page is a tool page: `render()` never runs for it and its
    //: intro is static markup in `main > .doc.intro-host`.  Taking only the
    //: first left that page with a 340 px wall of prose above the fold, which
    //: is the one thing P-26 is about.
    var host = $('line-doc') || D.querySelector('main > .doc.intro-host');
    if (!host) return;
    var KEY = 'fylite:lead:' + pageId;
    when(host.id ? '#' + host.id + ' .intro' : 'main > .doc.intro-host > *',
         function () {
      if (host.dataset.shellLead) return;
      host.dataset.shellLead = '1';
      host.classList.add('shell-lead');
      //: a static intro has no `.intro` wrapper of its own; give it one so the
      //: fold has a single child to clamp
      if (!host.querySelector(':scope > .intro')) {
        var wrap = el('div', 'intro');
        while (host.firstChild) wrap.appendChild(host.firstChild);
        host.appendChild(wrap);
      }
      var btn = el('button');
      btn.type = 'button';
      var open = false;
      try { open = root.localStorage.getItem(KEY) === 'open'; } catch (e) { /* private */ }
      function paint() {
        host.classList.toggle('folded', !open);
        btn.textContent = T(open ? 'shell.lead.less' : 'shell.lead.more');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      btn.addEventListener('click', function () {
        open = !open;
        try { root.localStorage.setItem(KEY, open ? 'open' : 'shut'); } catch (e) { /* private */ }
        paint();
        root.dispatchEvent(new Event('resize'));
      });
      host.appendChild(btn);
      paint();
      if (root.FyI18n && root.FyI18n.onChange) root.FyI18n.onChange(paint);
    });
  }

  // --- the data page's empty state: a shape, not a blank --------------------
  //
  // ★`FYL-DESIGN-13` P-10 / G-19.  Before anything has been fetched this page
  // has no output at all — and a white rectangle is indistinguishable from a
  // page that is broken.  What goes here has axes, a title, and the name of
  // the step that is missing; it is removed the moment a real figure lands.
  function emptyState(pageId) {
    //: the data page names its figure host; a scenario page's outputs live in
    //: whichever bar is open, so the placeholder goes at the top of the bars
    var host = D.querySelector('#mds-figs')
            || D.querySelector('.shell-main') || D.querySelector('main');
    if (!host) return;
    var isData = pageId === 'data';
    var box = el('div', 'panel shell-empty');
    box.id = 'shell-empty';
    box.innerHTML =
      '<svg viewBox="0 0 640 210" role="img" aria-hidden="true">'
      + '<rect x="52" y="14" width="562" height="150" fill="none" '
      + 'stroke="var(--grid)"/>'
      + '<line x1="52" y1="89" x2="614" y2="89" stroke="var(--grid)" '
      + 'stroke-dasharray="3 4"/>'
      + '<line x1="333" y1="14" x2="333" y2="164" stroke="var(--grid)" '
      + 'stroke-dasharray="3 4"/>'
      + '<text x="333" y="190" text-anchor="middle" font-size="13" '
      + 'fill="var(--muted)">t [s]</text>'
      + '<text x="20" y="94" text-anchor="middle" font-size="13" '
      + 'fill="var(--muted)" transform="rotate(-90 20 94)">signal</text>'
      + '</svg>'
      + '<p><span class="k" id="shell-empty-k"></span> '
      + '<span id="shell-empty-w"></span></p>';
    if (isData) host.parentNode.insertBefore(box, host);
    else host.insertBefore(box, host.firstChild);

    function paint() {
      var step;
      if (!isData) {
        //: ★name the bar whose run key would fill this box.  "Press run" with
        //: no subject is useless on a page carrying six of them.
        //: ★VISIBLE and unfolded.  The pulse-design page carries six bars in
        //: three modes and hides two modes' worth of them; the first version
        //: took the first unfolded bar in DOM order and told the reader to
        //: press a key that was not on screen.
        var open = null;
        Array.prototype.some.call(
          D.querySelectorAll('.funcbar:not(.folded)'), function (f) {
            if (!f.offsetParent) return false;
            open = f.querySelector('.funcbar-title');
            return !!open;
          });
        step = open ? T('shell.empty.run', { bar: open.textContent.trim() })
                    : T('shell.empty.runany');
        var k0 = $('shell-empty-k'), w0 = $('shell-empty-w');
        var t0 = T('shell.empty.noresult');
        if (k0 && k0.textContent !== t0) k0.textContent = t0;
        if (w0 && w0.textContent !== step) w0.textContent = step;
        return;
      }
      var gw = ($('mds-gw') || {}).textContent || '';
      var picked = D.querySelectorAll('#mds-picked li, #mds-picked .pick').length;
      step = (!gw || /未连|no gateway|not connect/i.test(gw))
        ? 'shell.empty.gateway'
        : (picked ? 'shell.empty.fetch' : 'shell.empty.pick');
      var k = $('shell-empty-k'), w = $('shell-empty-w');
      var kt = T('shell.empty.title'), wt = T(step);
      if (k && k.textContent !== kt) k.textContent = kt;
      if (w && w.textContent !== wt) w.textContent = wt;
    }
    //: ★Hidden when there is a result, not destroyed — and the observer stays
    //: connected.  The first version removed it and disconnected: at mount the
    //: bar's figure panels are still unfolded (`scenario.js` folds the empty
    //: ones a tick later), so a 108 px canvas existed for one frame, the box
    //: decided it was unwanted and left — and the page then sat with folded
    //: panels, no figure and no placeholder either.  A latch that fires once,
    //: on a state that is still settling, is a latch that fires on noise.
    var pending = false;
    function sweep() {
      if (pending) return;
      pending = true;
      root.requestAnimationFrame(function () {
        pending = false;
        var live = Array.prototype.some.call(
          (isData ? host : D).querySelectorAll('canvas'),
          function (c) { return c.getBoundingClientRect().height > 40; });
        if (box.hidden !== live) box.hidden = live;
        if (!live) paint();
      });
    }
    //: watch only what it reads — the figure host and the gateway line.
    //: Watching `body` here writes into what it watches (see `watchBars`).
    var mo = new MutationObserver(sweep);
    var watch = isData ? host : (D.querySelector('.shell-main') || D.body);
    mo.observe(watch, { childList: true, subtree: true, attributes: true,
                        attributeFilter: ['class', 'style', 'hidden'] });
    var gwEl = $('mds-gw');
    if (gwEl) mo.observe(gwEl, { childList: true, subtree: true, characterData: true });
    if (root.FyI18n && root.FyI18n.onChange) root.FyI18n.onChange(paint);
    sweep();
    //: one more after the controllers have settled their folds
    root.setTimeout(sweep, 1200);
  }

  // --- entry ----------------------------------------------------------------
  function mount() {
    var body = D.body;
    if (!body || body.getAttribute('data-fy-shell') !== 'v2') return;
    var pageId = body.getAttribute('data-page');
    if (!pageId) return;
    measure();
    adoptWork(pageId);
    if (pageId === 'data') watchGateway(); else watchBars();
    hoistModes(pageId);
    sideColumn();
    foldLead(pageId);
    emptyState(pageId);
    root.addEventListener('resize', measure);
    //: the strip's height changes when the language does — Chinese and English
    //: page names are not the same width, and a wrapped row moves the sticky
    //: offset the mode strip is pinned to
    if (root.FyI18n && root.FyI18n.onChange) root.FyI18n.onChange(measure);
  }

  root.FyShell = { mount: mount, measure: measure };

  if (D.readyState === 'loading')
    D.addEventListener('DOMContentLoaded', mount);
  else mount();
})(typeof self !== 'undefined' ? self : globalThis);
