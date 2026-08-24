// The site: four scenarios, one page each, and the navigation between them.
//
// ★This file replaces `lines.js`, and the difference is not a rename.  The
// old model had four "lines" laid over ten method pages: a page could belong
// to several lines, each line rendered a requirement-coverage table and a
// chain-of-files table, and the rule was 「一页都不退，一页都不并」 — no page
// retired, no page merged.  That rule is WITHDRAWN.  A page is a scenario
// now: what it does is what its sections do, it can gain a stage or lose one,
// and nothing here traces requirement rows.
//
// What is left is the small part that was always load-bearing:
//
//   `url()`        where the site root is, seen from a page one directory down
//   `installNav()` one navigation, injected rather than copied into five files
//   `render()`     a scenario page's title and its own lead
//   `renderHome()` the landing page's cards
//
// ★A scenario has no STAGES either.  The four pages were briefly built as a
// sequence of numbered sections, each with its own toolbar, its own run
// button and its own worker; that layer is gone too.  A page is one tool: one
// worker, one run, one status line — `scenario.js` owns that, and the parts a
// page is assembled from are its business, not the site table's.
//
// ★The requirement tracing did not move somewhere else — it stopped.  A table
// that claimed which FR row each page covered had to be kept true by hand
// against a design document, and the gate that compared them was checking
// that two files agreed, not that the app worked.

(function (root) {
  'use strict';

  var T = function (k, p) { return root.FyI18n.t(k, p); };

  // --- where the site root is, seen from THIS document ---------------------
  //
  // ★The scenario pages live in `scenario/`, one directory below the assets
  // they load, so a path written site-root-relative (`assets/worker.js`) does
  // not resolve from one of them.  ROOT is taken from THIS script's own URL,
  // not from `location`, so it is right whatever path the site is mounted at.
  // Outside a browser (a gate may run this file in a vm) it is empty.
  var ROOT = (function () {
    var s = typeof document !== 'undefined' && document.currentScript
          && document.currentScript.src;
    return s ? s.replace(/assets\/site\.js(\?.*)?$/, '') : '';
  })();

  function url(p) { return ROOT + p; }

  // --- the scenarios -------------------------------------------------------
  //
  // One entry per page.  `nav` and `card` are message keys; the page's own
  // parts are declared by the page, in the order it loads them.
  //: ★THREE, in the order a machine is actually worked on: design it, model
  //: what it would do, then infer from what it did.  The order here is the
  //: order of the navigation and of the entrance cards — there is no second
  //: list to keep in step.
  //:
  //: ★控制仿真 is WITHDRAWN (2026-08-22).  It carried one static criterion —
  //: the rigid n=0 vertical stability of an equilibrium against vessel eddies
  //: — and the closed loop, the delays and the power supplies it would need
  //: to be a control scenario were never built; the page said so itself.  A
  //: scenario that is one criterion is a criterion, not a scenario.  The
  //: kernel entry is untouched: `fylite.scenario.control` still runs it.
  var SCENARIOS = [
    { id: 'design', href: 'scenario/design.html', nav: 'nav.line.design',
      card: 'home.card.scenario.design' },
    { id: 'model', href: 'scenario/model.html', nav: 'nav.line.model',
      card: 'home.card.scenario.model' },
    { id: 'analysis', href: 'scenario/analysis.html', nav: 'nav.line.analysis',
      card: 'home.card.scenario.analysis' },
  ];

  // The pages that are not scenarios.  ★They have a table for the same reason
  //: the scenarios do: the footer band is emitted TWICE — injected here on a
  //: scenario page, written out by `tools/make-app-pages.mjs` on a static one —
  //: and two emitters reading one list is fine, while two hand-written copies
  //: is what put a different set of links in every footer.
  var PAGES = [
    { id: 'index', href: 'index.html', nav: 'nav.home' },
    { id: 'features', href: 'features.html', nav: 'nav.features' },
    { id: 'credits', href: 'credits.html', nav: 'nav.credits' },
  ];

  // ★A THIRD SHAPE: the tool pages.  Dynamic like a scenario — one file, i18n
  //: switched in place, `site.js` injecting its nav and footer — but NOT a
  //: scenario: it has no parts, no worker and no run button, because it does
  //: not compute anything.  `mdsplus` is the first: it reads a live MDSplus
  //: server through the gateway in `app/server/`, and what it shows is the
  //: device's own archive, not a result of ours.
  //:
  //: ★It is listed apart rather than pushed into `SCENARIOS` for one concrete
  //: reason: everything keyed off that table assumes a scenario's shape —
  //: `render()` looks up `ln.<id>.lead` and `ln.<id>.bound`, `renderHome()`
  //: gives it an entrance card, `validate-site.mjs` demands one
  //: `section.tool`, one toolbar host, one controller registering its parts.
  //: A page that computes nothing satisfies none of that, and faking it would
  //: mean writing an empty part just to pass a gate.
  //:
  //: ★And apart from PAGES for another: a tool page exists ONCE, so its links
  //: must not take the `.en.html` suffix `pageHref()` puts on a prose page.
  //:
  //: ★★A TOOL PAGE IS NOT IN THE HEADER.  The strip across the top is the
  //: three scenarios — the three things this site does — and a fourth entry
  //: beside them reads as a fourth thing to do, which `mdsplus.html` is not:
  //: it computes nothing, and without a gateway running it has no data to
  //: show either.  So this table still says the page EXISTS (it is what the
  //: footer QR, the site-shape gate and the file expectations are built from)
  //: and no longer says it is a destination.  ⇒ **the page is reached by its
  //: url**, `mdsplus.html`, and by whatever links to it in prose.  There is
  //: therefore no `nav:` key here; adding one back means putting the entry
  //: back into `installNav` as well.
  var TOOLS = [
    { id: 'mdsplus', href: 'mdsplus.html' },
  ];

  function tool(id) {
    for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].id === id) return TOOLS[i];
    return null;
  }

  // ★THE LANGUAGE IS IN THE PATH for the static pages and only there.  The
  // three prose pages are generated once per language (`index.html` /
  // `index.en.html`), so a link to one from a scenario page — which switches
  // language live, in place — has to pick the file that matches what the reader
  // is currently reading.  The scenario pages themselves are NOT suffixed:
  // there is one of each and it re-renders.
  function pageHref(href) {
    var lang = root.FyI18n.current();
    return lang === 'zh' ? href : href.replace(/\.html$/, '.' + lang + '.html');
  }

  function scenario(id) {
    for (var i = 0; i < SCENARIOS.length; i++)
      if (SCENARIOS[i].id === id) return SCENARIOS[i];
    return null;
  }

  var el = function (tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  };

  function a(href, key, cls) {
    var e = el('a', cls);
    e.href = url(href);
    e.setAttribute('data-i18n', key);
    return e;
  }

  /**
   * One nav for the whole site: home, then the four scenarios.
   *
   * Injected rather than written into each page because the per-page copies
   * are exactly what drifted.  The two toggle buttons stay in the markup —
   * pages address them by id — and the links go in front of them.
   */
  function installNav(pageId) {
    var nav = document.querySelector('header.top nav');
    if (!nav) return;
    Array.prototype.slice.call(nav.querySelectorAll('a')).forEach(function (x) {
      x.remove();
    });
    var first = nav.firstChild;
    //: ★NO "home" ENTRY.  The mark at the left of the same strip is a link to
    //: the entrance — that is what a logo in a header IS — and a second control
    //: saying the same thing two hand-widths away only asks the reader which
    //: of the two is the real one.
    var items = [];
    SCENARIOS.forEach(function (S) {
      items.push(a(S.href, S.nav, S.id === pageId ? 'on' : ''));
    });
    //: ★NO TOOL ENTRY EITHER — see the note on `TOOLS`.  The header is the
    //: three scenarios; the tool pages exist but are not destinations on it.
    items.forEach(function (x) { nav.insertBefore(x, first); });
    root.FyI18n.applyDom(nav);
  }

  /**
   * The footer band: the mark, the site's other prose pages, the language, the
   * copyright, and this page's own QR.
   *
   * ★Injected rather than written into each file.  It used to be copied by
   * hand into every page — six copies of the same six lines, including the six
   * lines of comment explaining them — and the copies had drifted into three
   * different link sets (the entrance offered two pages, a scenario page three)
   * for no reason anyone had decided.  The rule is one line long: every page
   * links to every OTHER prose page.
   */
  function installFoot(pageId) {
    var foot = document.querySelector('footer');
    if (!foot || foot.dataset.fyBuilt) return;
    foot.dataset.fyBuilt = '1';
    foot.textContent = '';

    var mark = el('a', 'mark');
    mark.href = url(pageHref('index.html'));
    mark.tabIndex = -1;
    mark.setAttribute('aria-hidden', 'true');
    var mi = el('img');
    mi.src = url('assets/fy_mark.svg');
    mi.alt = ''; mi.width = 24; mi.height = 24;
    mark.appendChild(mi);
    foot.appendChild(mark);

    PAGES.forEach(function (P) {
      if (P.id === pageId) return;
      var a_ = el('a');
      a_.href = url(pageHref(P.href));
      a_.setAttribute('data-i18n', P.nav);
      foot.appendChild(a_);
    });

    //: ★the language sits with the pages, not with the theme in the header:
    //: it is picked once and it changes WHICH text you are reading, which is
    //: what the links either side of it do too
    var lang = el('button', 'iconbtn');
    lang.id = 'lang-toggle';
    lang.type = 'button';
    foot.appendChild(lang);

    var copy = el('span', 'copy');
    copy.setAttribute('data-i18n', 'foot.copyright');
    foot.appendChild(copy);

    //: ★which build this is.  The ABI answers a LOADER's question — can these
    //: two halves talk — while a reader looking at a number on screen is
    //: asking which version they have; so the kernel's release and the front
    //: end's are both shown, with the ABI beside them because a mismatch
    //: between exactly those two halves is what it detects.  Values come from
    //: the GENERATED `assets/version.js`, so they cannot drift from the
    //: binary that was built; a page that did not load it shows NOTHING
    //: rather than a guess.  Rendered through `t()` with placeholders rather
    //: than `data-i18n`, because `applyDom` substitutes none — and re-rendered
    //: on language change, subscribed ONCE (the footer is built once).
    var V = root.FyVersion;
    if (V) {
      var ver = el('span', 'ver');
      var paint = function () {
        ver.textContent = root.FyI18n.t('foot.version',
          { kernel: V.kernel, abi: V.abi, app: V.app });
      };
      ver.title = 'kernel ' + V.kernel + ' · ABI ' + V.abi + ' · app ' + V.app;
      paint();
      root.FyI18n.onChange(paint);
      foot.appendChild(ver);
    }

    //: ★generated once by `tools/make-app-qr.py` and committed: the front end
    //: vendors no third-party JavaScript, and an encoder written here would be
    //: Reed-Solomon with no oracle to check it against.  A printed code cannot
    //: ask where it is being served from, so the payload is the PUBLISHED url.
    var here = scenario(pageId) || tool(pageId);
    var href = 'https://fusion-yun.github.io/fylite/'
             + (here ? here.href : pageHref(flatPage(pageId).href));
    var qr = el('a', 'qr');
    qr.href = href; qr.title = href;
    var qi = el('img');
    qi.src = url('assets/qr-' + pageId + '.svg');
    qi.alt = 'QR'; qi.width = 37; qi.height = 37;
    qr.appendChild(qi);
    foot.appendChild(qr);

    root.FyI18n.applyDom(foot);
    root.FyI18n.install('lang-toggle');
  }

  function flatPage(id) {
    for (var i = 0; i < PAGES.length; i++) if (PAGES[i].id === id) return PAGES[i];
    return PAGES[0];
  }

  /** Build a scenario page: its title, its nav, its own lead. */
  function render(pageId) {
    var S = scenario(pageId);
    if (!S) return;
    document.querySelectorAll('[data-line-h1]').forEach(function (e) {
      e.setAttribute('data-i18n', 'ln.' + S.id + '.h1');
    });
    document.querySelectorAll('[data-line-sub]').forEach(function (e) {
      e.setAttribute('data-i18n', 'ln.' + S.id + '.sub');
    });
    //: ★ONE BLOCK, two sentences.  What the scenario is and what it may not be
    //: taken for are the same statement read in two directions, and they were
    //: set as a paragraph and a boxed note with a gap between them — which
    //: reads as "the page, and then a warning somebody added".  They are one
    //: intro band now: the lead, and under it the boundary in the colour that
    //: says it is a limit.  ★The boundary is NOT optional prose; a scenario
    //: page states it (D-2), so it stays inside the same block rather than
    //: becoming something a reader can take as separate from the claim.
    var host = document.getElementById('line-doc');
    if (host) {
      var intro = el('div', 'intro');
      var lead = el('p', 'lead');
      lead.setAttribute('data-i18n', 'ln.' + S.id + '.lead');
      intro.appendChild(lead);
      var bound = el('p', 'bound');
      bound.setAttribute('data-i18n', 'ln.' + S.id + '.bound');
      intro.appendChild(bound);
      host.appendChild(intro);
    }
    installNav(S.id);
    installFoot(S.id);
    root.FyI18n.applyDom(document);
  }

  /**
   * The landing page's cards — one per scenario, from the same table the
   * navigation is built from, so the entrance cannot advertise a scenario
   * that has moved or drop one by forgetting a card.
   */
  function renderHome() {
    var host = document.getElementById('line-cards');
    if (host)
      SCENARIOS.forEach(function (S) {
        var c = el('a', 'card panel');
        c.href = url(S.href);
        var h = el('h3'), p = el('p');
        h.setAttribute('data-i18n', S.card + '.h');
        p.setAttribute('data-i18n', S.card + '.p');
        c.appendChild(h); c.appendChild(p);
        host.appendChild(c);
      });
    installNav('index');
    installFoot('index');
    root.FyI18n.applyDom(document);
  }

  //: ★when the language changes IN PLACE, the links to the static pages have to
  //: follow it — `features.html` and `features.en.html` are two files, and a
  //: reader who switched to English and then pressed 物理功能 would land back in
  //: Chinese.  The scenario links are untouched: there is one of each.
  function relink() {
    var foot = document.querySelector('footer');
    if (!foot) return;
    PAGES.forEach(function (P) {
      var want = url(pageHref(P.href));
      Array.prototype.slice.call(foot.querySelectorAll('a')).forEach(function (a_) {
        if (a_.getAttribute('data-i18n') === P.nav) a_.href = want;
      });
    });
    var mark = foot.querySelector('a.mark');
    if (mark) mark.href = url(pageHref('index.html'));
  }

  root.FySite = { SCENARIOS: SCENARIOS, PAGES: PAGES, TOOLS: TOOLS,
                  scenario: scenario, tool: tool,
                  url: url, pageHref: pageHref,
                  installNav: installNav, installFoot: installFoot,
                  render: render, renderHome: renderHome };

  // Every page that loads this file gets the shared nav; a scenario page also
  // gets its title and lead, and the landing page its cards.
  function boot() {
    var body = document.body;
    var page = body && body.getAttribute('data-page');
    if (!page) return;
    var id = page;
    if (scenario(id)) render(id);
    else if (id === 'index') renderHome();
    else { installNav(id); installFoot(id); }
    root.FyI18n.onChange(relink);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof self !== 'undefined' ? self : globalThis);
