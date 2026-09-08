// The workbench: views as tiles, and the layout written back into the
// presentation specification (`FYL-DESIGN-18` U-14 · U-16 · U-17, stage U0).
//
// ★The workbench edits a document, not a picture.  Moving a tile, resizing it,
// changing what a view shows or pinning a domain all end in the same place —
// the `spo:PresentationSpecification` this workbench was handed.  `spec()`
// gives it back, and that is what gets exported, what the report face draws,
// and what a case can carry as its own way of being looked at (U-12 ①).
//
// ★Two interaction states, and a mark that says which (U-17, as amended).
// Everything a gesture does is either TRANSIENT (zoom, cursor, hover — gone
// when the page closes, never in the spec, never in the report) or IN-SPEC
// (axes, series, layers, layout, a pinned domain).  A tile with transient
// changes carries「未钉住」in its header; pinning writes them into the spec and
// clears the mark.  The reason this is worth a mark rather than a rule the user
// must remember: without it, nobody can predict whether the report will show
// what they are looking at.
//
// ★Sharing is by COORDINATE FAMILY, not by「所有图」 (U-17).  Views whose
// abscissa is the same coordinate — every trace against `time`, say — share one
// domain and one cursor; a profile against `rho_tor_norm` is a different family
// and does not move when a time trace is zoomed.  Zooming rho and t together
// would be a single fact about two unrelated axes.
//
// ★Layout is an extension term (U-14).  `fylite:layout` is `{x, y, w, h}` on a
// 12-column grid.  A renderer that does not know the term — the Python one —
// lays the views out in the order they appear, so THE ORDER is the part of the
// arrangement that is semantic: moving a tile re-sorts `has_view` row-major, so
// the report reads in the same order the workbench does.
(function (root) {
  'use strict';

  var COLS = 12;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** The coordinate family a view belongs to: the leaf of its abscissa. */
  function familyOf(view) {
    if (view.view_kind === 'stem') return 'channel';
    var m = /abscissa\s+\S*#(\S+)/.exec(view.comment || '');
    if (m) return m[1].split('/').pop();
    if (view.view_kind === 'map') return 'rz';
    return view.view_kind === 'line_chart' ? 'unknown' : view.view_kind;
  }

  /** The layout a view declares, or null. */
  function layoutOf(view) {
    var l = view['fylite:layout'] || view.layout;
    return (l && typeof l === 'object' && l.w > 0 && l.h > 0) ? l : null;
  }

  /** A default arrangement: two tiles a row, in the spec's own order (P-26: the
   *  first view lands top-left, so the first screen carries an output). */
  function flow(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push({ x: (i % 2) * 6, y: Math.floor(i / 2) * 4, w: 6, h: 4 });
    return out;
  }

  /** A box inside the grid: 12 columns, at least 2 wide and 2 tall. */
  function fit(l) {
    var x = clamp(Math.round(l.x) || 0, 0, COLS - 2);
    var w = clamp(Math.round(l.w) || 2, 2, COLS - x);
    return { x: x, y: Math.max(0, Math.round(l.y) || 0), w: w, h: Math.max(2, Math.round(l.h) || 2) };
  }

  function rowMajor(a, b) {
    return (a.layout.y - b.layout.y) || (a.layout.x - b.layout.x);
  }

  function mount(host, opts) {
    opts = opts || {};
    var spec = JSON.parse(JSON.stringify(opts.spec || { has_panel: [] }));
    var record = opts.record;
    var code = opts.code;
    var views = [];
    (spec.has_panel || []).forEach(function (panel) {
      (panel.has_view || []).forEach(function (v) { views.push({ view: v, panel: panel }); });
    });
    var fallback = flow(views.length);
    views.forEach(function (t, i) {
      //: an imported spec is as untrusted as an imported session file
      //: (`session.js`'s rule): its layout is fitted to the grid, not obeyed
      t.layout = fit(layoutOf(t.view) || fallback[i]);
      t.family = familyOf(t.view);
      t.dirty = false;                  //: transient changes not yet pinned
      t.domain = null;                  //: the transient domain, if any
    });

    //: one transient domain and one cursor PER FAMILY (U-17)
    var shared = {};
    function fam(name) {
      if (!shared[name]) shared[name] = { domain: null, cursor: null };
      return shared[name];
    }

    host.classList.add('wb');
    host.innerHTML = '';
    var grid = el('div', 'wb-grid');
    host.appendChild(grid);

    // ------------------------------------------------------------------ //
    function draw(t) {
      t.body.innerHTML = '';
      var f = fam(t.family);
      var view = t.view;
      //: the transient domain is handed to the renderer WITHOUT touching the
      //: spec — that is the whole difference between the two states
      if (f.domain) {
        view = JSON.parse(JSON.stringify(view));
        view['fylite:domain'] = f.domain;
      }
      root.FyFig.renderView(t.body, view, ctx, { machine: opts.machine });
      var cv = t.body.querySelector('canvas');
      if (cv && cv.fyxy) bindZoom(t, cv);
      if (cv && f.cursor !== null && cv.fyxy) drawCursor(t, cv, f.cursor);
      mark(t);
    }

    function mark(t) {
      t.pinBtn.hidden = !t.dirty;
      t.flag.hidden = !t.dirty;
    }

    function drawCursor(t, cv, x) {
      //: the cursor is painted OVER the finished figure, so it costs no redraw
      //: of the data and disappears with the next `draw()`
      var g = cv.getContext('2d'), b = cv.fyxy;
      if (!(x >= b.xmin && x <= b.xmax)) return;
      var px = b.toPixel(x, b.ymin).px;
      g.save();
      g.strokeStyle = (getComputedStyle(cv).getPropertyValue('--lcfs') || '').trim() || '#d0342c';
      g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(px, b.box.t); g.lineTo(px, b.box.b); g.stroke();
      g.restore();
    }

    function bindZoom(t, cv) {
      var start = null;
      cv.addEventListener('pointerdown', function (e) {
        var r = cv.getBoundingClientRect();
        start = cv.fyxy.toData(e.clientX - r.left, e.clientY - r.top);
        cv.setPointerCapture(e.pointerId);
      });
      cv.addEventListener('pointerup', function (e) {
        if (!start) return;
        var r = cv.getBoundingClientRect();
        var end = cv.fyxy.toData(e.clientX - r.left, e.clientY - r.top);
        var lo = Math.min(start.x, end.x), hi = Math.max(start.x, end.x);
        start = null;
        //: a click is not a zoom: without a threshold every attempt to read a
        //: value collapses the axis to a point
        if (!(hi - lo > (cv.fyxy.xmax - cv.fyxy.xmin) * 0.02)) {
          api.setCursor(t.family, end.x);
          return;
        }
        api.zoom(t.family, [lo, hi]);
      });
      cv.addEventListener('dblclick', function () { api.zoom(t.family, null); });
    }

    function tileEl(t, i) {
      var d = el('div', 'wb-tile');
      d.setAttribute('data-view-kind', t.view.view_kind || '');
      d.setAttribute('data-family', t.family);
      var head = el('div', 'wb-head');
      var title = el('span', 'wb-title', root.FyCaseReport.lang(t.view.caption, code) || t.view.view_kind);
      var flag = el('span', 'wb-flag', '未钉住');
      var pin = el('button', 'wb-pin', '钉住');
      var grip = el('span', 'wb-grip');
      pin.type = 'button';
      pin.addEventListener('click', function () { api.pin(i); });
      head.appendChild(title); head.appendChild(flag); head.appendChild(pin);
      var body = el('div', 'wb-body');
      d.appendChild(head); d.appendChild(body); d.appendChild(grip);
      t.el = d; t.body = body; t.pinBtn = pin; t.flag = flag;
      place(t);
      dragMove(t, head, i);
      dragResize(t, grip, i);
      return d;
    }

    function place(t) {
      var l = t.layout;
      t.el.style.gridColumn = (l.x + 1) + ' / span ' + l.w;
      t.el.style.gridRow = (l.y + 1) + ' / span ' + l.h;
      t.el.setAttribute('data-layout', [l.x, l.y, l.w, l.h].join(','));
    }

    function cellSize() {
      var r = grid.getBoundingClientRect();
      return { w: r.width / COLS, h: 90 };
    }

    function dragMove(t, handle, i) {
      handle.addEventListener('pointerdown', function (e) {
        if (e.target.tagName === 'BUTTON') return;
        var c = cellSize(), x0 = e.clientX, y0 = e.clientY, l0 = t.layout;
        handle.setPointerCapture(e.pointerId);
        function move(ev) {
          var dx = Math.round((ev.clientX - x0) / c.w), dy = Math.round((ev.clientY - y0) / c.h);
          api.move(i, { x: l0.x + dx, y: l0.y + dy });
        }
        function up(ev) {
          handle.releasePointerCapture(ev.pointerId);
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', up);
        }
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
      });
    }

    function dragResize(t, grip, i) {
      grip.addEventListener('pointerdown', function (e) {
        var c = cellSize(), x0 = e.clientX, y0 = e.clientY, l0 = t.layout;
        grip.setPointerCapture(e.pointerId);
        e.stopPropagation();
        function move(ev) {
          var dw = Math.round((ev.clientX - x0) / c.w), dh = Math.round((ev.clientY - y0) / c.h);
          api.move(i, { w: l0.w + dw, h: l0.h + dh });
        }
        function up(ev) {
          grip.releasePointerCapture(ev.pointerId);
          grip.removeEventListener('pointermove', move);
          grip.removeEventListener('pointerup', up);
        }
        grip.addEventListener('pointermove', move);
        grip.addEventListener('pointerup', up);
      });
    }

    var ctx = record ? root.FyFig.context(record, code) : null;

    views.forEach(function (t, i) { grid.appendChild(tileEl(t, i)); });
    if (ctx) views.forEach(draw);

    // ------------------------------------------------------------------ //
    var api = {
      /** The edited spec: layout on every view, `has_view` in reading order. */
      spec: function () {
        views.forEach(function (t) { t.view['fylite:layout'] = { x: t.layout.x, y: t.layout.y, w: t.layout.w, h: t.layout.h }; });
        //: ★the ORDER is the part a renderer without the layout term still
        //: reads, so it has to agree with what the workbench shows (U-14)
        (spec.has_panel || []).forEach(function (panel) {
          var mine = views.filter(function (t) { return t.panel === panel; });
          mine.sort(rowMajor);
          panel.has_view = mine.map(function (t) { return t.view; });
        });
        return spec;
      },
      tiles: function () {
        return views.map(function (t) {
          return { kind: t.view.view_kind, family: t.family, layout: t.layout,
                   dirty: t.dirty, domain: fam(t.family).domain, cursor: fam(t.family).cursor };
        });
      },
      /** Move or resize one tile; the layout is in-spec, so no `dirty` mark. */
      move: function (i, box) {
        var t = views[i];
        ['x', 'y', 'w', 'h'].forEach(function (k) { if (box[k] !== undefined) t.layout[k] = box[k]; });
        //: ★THE CLAMP LIVES HERE, not in the drag handler.  It was in the
        //: handler alone, so a programmatic move — a preset layout, an imported
        //: spec, a caller doing the arithmetic itself — could put a tile at
        //: column 6 with a width of 12 and CSS would spill it off the grid
        //: silently. `validate-workbench.mjs` caught exactly that.
        t.layout = fit(t.layout);
        place(t);
        return t.layout;
      },
      /** A transient domain for a whole coordinate family (U-17). */
      zoom: function (family, dom) {
        var f = fam(family);
        f.domain = dom;
        views.forEach(function (t) {
          if (t.family !== family) return;
          t.dirty = !!dom;
          if (ctx) draw(t); else mark(t);
        });
      },
      /** A shared cursor for one family; transient, never in the spec. */
      setCursor: function (family, x) {
        var f = fam(family);
        f.cursor = x;
        views.forEach(function (t) { if (t.family === family && ctx) draw(t); });
      },
      /** Write the family's transient domain into the spec (U-17). */
      pin: function (i) {
        var t = views[i], f = fam(t.family);
        if (!f.domain) return null;
        views.forEach(function (x) {
          if (x.family !== t.family) return;
          x.view['fylite:domain'] = [f.domain[0], f.domain[1]];
          x.dirty = false;
          mark(x);
        });
        return f.domain;
      },
      /** Layer visibility of a map view — in-spec (U-16). */
      setLayer: function (i, layerId, on) {
        var v = views[i].view;
        (v.overlay_layer || []).forEach(function (ov) {
          if (typeof ov === 'object' && ov.id === layerId) ov['fylite:visible'] = !!on;
        });
        if (ctx) draw(views[i]);
      },
      redraw: function () { if (ctx) views.forEach(draw); },
      COLS: COLS
    };
    return api;
  }

  root.FyWorkbench = { mount: mount, familyOf: familyOf, layoutOf: layoutOf, COLS: COLS };
})(typeof self !== 'undefined' ? self : this);
