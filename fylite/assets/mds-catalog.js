// «按诊断选» — the EAST diagnostic catalogue, on the device-data page.
//
// ★WHAT THIS CLOSES.  Everything else on this page addresses a signal the way
// the SERVER does: a tree, and a path inside it.  That is the honest shape of
// mdsip and it is unusable as a starting point, because the tree is exactly
// the part a reader does not know and cannot derive — measured on #137985,
// `\PCRL01` is on `pcs_east`, `\POINT_F1` is on `east`, `\TE_CORETS` answers
// on both `analysis` and `ts_east`, and asking `east` for `\PCRL01` returns
// `%TREE-W-NNF`: not empty data, *absent*.  The site's own UDA client is
// pleasant to use for exactly one reason — somebody wrote that mapping down.
// `app/facts/device/east-signals.json` is that mapping (73 diagnostics, 376
// signals, harvested from the EAST Wiki); this panel is how it is read.
//
// ★★IT IS NOT IN A PUBLIC RELEASE.  The harvest is an operator's internal
// document and travels with their data (2026-09-02), so in a published copy of
// this page the fetch below 404s and the panel says so — see `mds.cat.absent`.
// Whoever holds the catalogue puts it back at that path and the panel returns.
//
// ★IT IS A SEPARATE FILE ON PURPOSE.  The page's own controller is about
// talking to the gateway; this is about a static document that happens to be
// about EAST.  A second machine would ship a second catalogue and no change
// here, and the page works with this file absent — the tree browser and the
// typed path are unaffected.
//
// ★WHAT IT WILL NOT DO IS PROMISE DATA.  The catalogue says a signal EXISTS on
// this machine, never that this shot recorded it: #137985 stored 21 of its 79
// magnetic probes.  So a row is offered, not vouched for, and the answer comes
// from the fetch — which reports its own failure — rather than from a filter
// applied here that would quietly shorten the instrument list.

(function (root) {
  'use strict';

  var T = function (k, p) { return root.FyI18n.t(k, p); };
  var $ = function (id) { return document.getElementById(id); };

  /** Rows drawn at once.  A category can hold ~60 diagnostics' worth of
   *  signals; the search box is the way through and the note says so. */
  var MAX_ROWS = 200;

  var state = { doc: null, cat: '', q: '', open: {} };

  // ------------------------------------------------------------------
  // the panel, injected rather than written into the page
  // ------------------------------------------------------------------
  //
  // ★Injected because this file is optional.  Markup in `pages/data.html` for a
  // panel whose script may not be loaded is markup that renders as an empty
  // box — the page would look broken in exactly the configuration where it is
  // merely reduced.

  function mount() {
    var host = document.getElementById('mds-catalog-host');
    if (!host) return null;
    host.innerHTML =
      '<div class="panel">' +
      '<h2 data-i18n="mds.cat">按诊断选</h2>' +
      '<p class="note" data-i18n="mds.cat.what"></p>' +
      '<div class="mds-row">' +
      '<div class="ctl"><label for="mds-cat-class" data-i18n="mds.cat.class">类别</label>' +
      '<select id="mds-cat-class"></select></div>' +
      '<div class="ctl" style="flex:1 1 140px">' +
      '<label for="mds-cat-q" data-i18n="mds.cat.find">找</label>' +
      '<input type="text" id="mds-cat-q"></div>' +
      '</div>' +
      '<div id="mds-cat-list"></div>' +
      '<p class="note" id="mds-cat-note"></p>' +
      '</div>';
    return host;
  }

  function load() {
    if (state.doc) return Promise.resolve(state.doc);
    // Same-origin and relative, like every other request this page makes.
    return fetch('facts/device/east-signals.json', { headers: { accept: 'application/json' } })
      .then(function (r) {
        // ★404 与「读失败」是两件事，说成一件是这一栏最容易骗人的地方。
        // 目录采自 EAST 内网 Wiki，2026-09-02 随实验数据一起移出公开分发；
        // 于是**没有它才是缺省状态**，而不是出了故障。持有那份文件的人把它放
        // 回 `facts/device/east-signals.json`，这一栏自己就回来了。
        if (r.status === 404) { var e = new Error('absent'); e.absent = true; throw e; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) { state.doc = d; return d; });
  }

  // ------------------------------------------------------------------
  // rendering
  // ------------------------------------------------------------------

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function matches(d, q) {
    if (!q) return true;
    var hay = [d.title, d.description, d.location, d.category].join(' ').toUpperCase();
    if (hay.indexOf(q) >= 0) return true;
    for (var i = 0; i < d.signals.length; i++) {
      var s = d.signals[i];
      if ((s.node + ' ' + (s.desc || '')).toUpperCase().indexOf(q) >= 0) return true;
    }
    return false;
  }

  /** Signals of `d` that match the query — so a search for POINT_F does not
   *  open a diagnostic and then show all 22 of its channels. */
  function rowsOf(d, q) {
    if (!q) return d.signals;
    var hit = d.signals.filter(function (s) {
      return (s.node + ' ' + (s.desc || '')).toUpperCase().indexOf(q) >= 0;
    });
    return hit.length ? hit : d.signals;
  }

  function render() {
    var host = $('mds-cat-list');
    if (!host || !state.doc) return;
    var q = state.q.trim().toUpperCase();
    var list = state.doc.diagnostics.filter(function (d) {
      return (!state.cat || d.category === state.cat) && matches(d, q);
    });

    host.innerHTML = '';
    var shown = 0, clipped = false;
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      var box = el('div', 'mds-cat-diag');

      var head = el('button', 'mds-cat-head');
      head.type = 'button';
      var openNow = !!state.open[d.title] || (!!q && list.length <= 4);
      head.innerHTML = '<span class="tw">' + (openNow ? '▾' : '▸') + '</span> '
        + esc(d.title)
        + ' <span class="n">' + d.signals.length + '</span>';
      (function (title) {
        head.addEventListener('click', function () {
          state.open[title] = !state.open[title];
          render();
        });
      })(d.title);
      box.appendChild(head);

      // ★The two lines under the title are the two the site's own client shows
      // and the tree browser cannot: where the instrument IS, and what it
      // measures.  A node path answers neither.
      var meta = [];
      if (d.location) meta.push(T('mds.cat.at', { where: d.location }));
      var rate = d.specifications && (d.specifications['Sampling Rate']
                 || d.specifications['Sample Rate'] || d.specifications['Time Resolution']);
      if (rate) meta.push(T('mds.cat.rate', { rate: rate }));
      if (meta.length) box.appendChild(el('p', 'note mds-cat-meta', meta.join(' · ')));
      if (openNow && d.description && d.description !== d.title)
        box.appendChild(el('p', 'note mds-cat-desc', d.description));

      if (openNow) {
        var tb = el('table', 'mds-cat-sig');
        var body = el('tbody');
        var rows = rowsOf(d, q);
        for (var k = 0; k < rows.length; k++) {
          if (shown >= MAX_ROWS) { clipped = true; break; }
          body.appendChild(sigRow(rows[k]));
          shown++;
        }
        tb.appendChild(body);
        box.appendChild(tb);
        if (rows.length < d.signals.length)
          box.appendChild(el('p', 'note', T('mds.cat.filtered',
            { n: rows.length, all: d.signals.length })));
        //: ★the compressed name pattern is shown as PROSE, never as rows: the
        //: upstream marks it an approximate grouping, and turning "PF1P, …,
        //: PF12P" into twelve clickable nodes would manufacture names nobody
        //: harvested.
        if (d.signal_pattern)
          box.appendChild(el('p', 'note mds-cat-pattern',
            T('mds.cat.pattern', { pat: d.signal_pattern })));
      }
      host.appendChild(box);
      if (clipped) break;
    }

    if (!list.length) note('mds.cat.none');
    else if (clipped) note('mds.cat.clip', { n: MAX_ROWS });
    else note('mds.cat.count', { d: list.length, s: state.doc.diagnostics.length });
  }

  function sigRow(s) {
    var tr = el('tr');
    var td0 = el('td', 'pick');
    if (s.tree) {
      var b = el('button', 'ghost', T('mds.cat.add'));
      b.addEventListener('click', function () {
        if (!api()) return;
        if (!api().shot()) { note('mds.cat.noshot', null, 'warn'); return; }
        api().select({ tree: s.tree, node: s.node });
        note('mds.cat.added', { tree: s.tree, node: s.node });
      });
      td0.appendChild(b);
    } else {
      //: ★NOT hidden.  A private-DAQ diagnostic is part of this machine; a
      //: catalogue that dropped it would be answering "EAST has no such
      //: instrument", which is false and unfalsifiable from the page.
      td0.appendChild(el('span', 'note', '—'));
    }
    tr.appendChild(td0);

    // ★The node name and what it measures share ONE cell, stacked.  In a
    // 400 px control column a five-column row breaks `\POINT_F1` across two
    // lines mid-token, and a node path that wraps is a node path a reader
    // cannot check against what they typed elsewhere.
    var td1 = el('td', 'name');
    td1.appendChild(el('span', 'node', s.node));
    var sub = s.desc || s.unfetchable;
    if (sub) td1.appendChild(el('span', 'sub', sub));
    tr.appendChild(td1);
    tr.appendChild(el('td', 'tree', s.tree || T('mds.cat.notree')));
    tr.appendChild(el('td', 'unit', s.unit || '—'));
    if (!s.tree) tr.className = 'off';
    return tr;
  }

  function esc(v) {
    return String(v).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }

  function note(key, params, cls) {
    var e = $('mds-cat-note');
    if (!e) return;
    e.innerHTML = key ? T(key, params) : '';
    e.className = 'note' + (cls ? ' ' + cls : '');
  }

  /** The page's own selection, if this file was loaded next to it. */
  function api() { return root.FyMds || null; }

  // ------------------------------------------------------------------
  // boot
  // ------------------------------------------------------------------

  function fill() {
    var sel = $('mds-cat-class');
    if (!sel || !state.doc) return;
    sel.innerHTML = '';
    var all = document.createElement('option');
    all.value = ''; all.textContent = T('mds.cat.all');
    sel.appendChild(all);
    state.doc.categories.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
  }

  function boot() {
    if (!mount()) return;
    root.FyI18n.applyDom(document.getElementById('mds-catalog-host'));
    note('mds.cat.loading');
    load().then(function () {
      fill();
      $('mds-cat-class').addEventListener('change', function () {
        state.cat = this.value; render();
      });
      $('mds-cat-q').addEventListener('input', function () {
        state.q = this.value; render();
      });
      $('mds-cat-q').placeholder = T('mds.cat.find.ph');
      render();
      root.FyI18n.onChange(function () {
        fill();
        $('mds-cat-class').value = state.cat;
        $('mds-cat-q').placeholder = T('mds.cat.find.ph');
        root.FyI18n.applyDom(document.getElementById('mds-catalog-host'));
        render();
      });
    }, function (e) {
      // ★A catalogue that will not load is a REDUCED page, not a broken one:
      // the tree browser and the typed path still work, and saying which is
      // which is the difference between a reader retrying and a reader
      // concluding the server is down.
      // ★★And "not shipped" is not a failure at all — a reader who is told
      // the fetch failed will retry it forever.
      if (e && e.absent) note('mds.cat.absent');
      else note('mds.cat.failed', { why: e.message }, 'warn');
    });
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof self !== 'undefined' ? self : globalThis);
