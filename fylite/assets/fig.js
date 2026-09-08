// Figures drawn from the presentation specification (`FYL-DESIGN-18` U-12 ·
// U-16 · U-17 · U-21 · U-22, stage U0).
//
// ★What this is for.  Until now a function page drew its figures by calling
// `FyPlot` with arrays the controller had assembled: the picture existed only
// as pixels, so it could not be exported, could not be re-drawn by the report
// face, and could not be edited by anything but the code that drew it.  The
// report page already had the other half — a `spo:PresentationSpecification`
// whose views bind quantities of a record BY PATH, and a renderer for it
// (`casereport.js`).  This file gives the function pages the same renderer
// against the same specification, so that ONE document decides what both faces
// draw.
//
// ★One resolver, not two.  Which quantity a series binds, and which coordinate
// a 1-D quantity is drawn against, are answered by `casereport.js`
// (`FyCaseReport.index` / `resolve` / `coordinateOf`) — the port of Python's
// `casereport.py`, held to it by `tests/validate-report.mjs`.  This file adds
// no rule of its own about what a quantity IS; it decides only how a view is
// PAINTED, on a canvas rather than into SVG.
//
// ★Refusal is a rendering outcome (`FYL-DESIGN-10` P-6 · `-13` P-10).  A view
// whose quantity is not in the record is not skipped and not drawn empty: the
// figure is replaced by a sentence naming what is missing.  The caller gets the
// same list back, so a page can say「八个视图画了六个」rather than quietly
// showing six.
//
// ★What is NOT here (stage U0).  Interaction — box zoom, the shared cursor,
// pinning a domain (U-17) — belongs to the workbench and is not in this file;
// what is here is the pinned domain being HONOURED (`fylite:domain`) and layer
// visibility (`fylite:visible`), i.e. the parts of those rulings that live in
// the document rather than in a gesture.
(function (root) {
  'use strict';

  var R = root.FyCaseReport, P = root.FyPlot;

  //: series_role -> how it is marked.  ★Colour is never the only channel
  //: (`FYL-DESIGN-11` V-8 / `-10` P-27): each role differs in mark or dash as
  //: well, so the four are separable in greyscale and to a reader who cannot
  //: split those hues.
  var ROLE = {
    computed:  { kind: 'line',  width: 2 },
    measured:  { kind: 'dots',  radius: 3 },
    reference: { kind: 'line',  width: 1.6, dash: [5, 3] },
    baseline:  { kind: 'line',  width: 1.4, dash: [2, 3] },
    posterior: { kind: 'envelope' }
  };
  //: `mark_kind` of the spec -> the plotter's own word.  A view that names its
  //: mark wins over the role's default; an unknown word is refused rather than
  //: guessed, because guessing draws a residual as a polyline (U-21).
  var MARK = { line: 'line', dots: 'dots', points: 'dots', stem: 'stems',
               stems: 'stems', bars: 'bars', band: 'envelope' };

  function lang(v, code) { return R.lang(v, code || 'zh'); }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /** A view that cannot be drawn says so, by name, where the figure would be. */
  function refusal(why) {
    var p = el('p', 'caveat', why);
    p.setAttribute('data-fig-refused', '');
    return p;
  }

  /** The abscissa of a line view: the one `derive` declared, else the rule's. */
  function abscissaOf(view, q, c) {
    var m = /abscissa\s+(\S+)/.exec(view.comment || '');
    if (m) {
      var d = R.resolve(m[1], c.idx);
      if (d) return d;
    }
    return R.coordinateOf(q, c.all, c.eq);
  }

  /** `[lo, hi]` if the view pins its domain (U-17), else null. */
  function domainOf(view) {
    var d = view['fylite:domain'] || view.domain;
    return (Array.isArray(d) && d.length === 2 && isNum(d[0]) && isNum(d[1])) ? d : null;
  }

  function visible(o) {
    var v = o && (o['fylite:visible'] !== undefined ? o['fylite:visible'] : o.visible);
    return v === undefined || !!v;
  }

  // --------------------------------------------------------------------- //
  // the five view kinds
  // --------------------------------------------------------------------- //

  /** A line chart, and — with `stems` marks — the residual view of U-21. */
  function lineView(host, view, c, opts) {
    var series = [], refused = [], xlabel = '', ylabel = '', stems = false;
    (view.has_series || []).forEach(function (s, i) {
      var q = R.resolve(s.binds_quantity, c.idx);
      if (!q) { refused.push(s.binds_quantity); return; }
      var mark = s.mark_kind ? MARK[s.mark_kind] : (ROLE[s.series_role] || ROLE.computed).kind;
      if (!mark) { refused.push(s.binds_quantity + '（未知的 mark_kind ' + s.mark_kind + '）'); return; }
      var role = ROLE[s.series_role] || ROLE.computed;
      var x, coord = null;
      if (view.view_kind === 'stem' || mark === 'stems') {
        //: ★a stem's abscissa is the channel index and nothing else: the
        //: quantity is per-channel, so there is no coordinate to look up and
        //: none may be invented (U-21)
        stems = true;
        x = q.data.map(function (_, k) { return k + 1; });
        xlabel = xlabel || '通道';
      } else {
        coord = abscissaOf(view, q, c);
        if (!coord) { refused.push(s.binds_quantity + '（无坐标，按 P2 只入表不作图）'); return; }
        x = coord.data;
        xlabel = xlabel || (coord.path.split('/').pop() + (coord.units ? ' [' + coord.units + ']' : ''));
      }
      ylabel = ylabel || (q.units || '');
      series.push({
        x: x, y: q.data,
        kind: view.view_kind === 'stem' ? 'stems' : mark,
        color: P.seriesColor(host, i),
        dash: s.line_style === 'dashed' ? [5, 3] : role.dash,
        width: role.width, radius: role.radius,
        label: lang(s.display_label, c.code) || R.label(q.path)
      });
    });
    if (!series.length) return refusal('按名拒绝：' + (refused.join('；') || '这个视图没有可解析的序列'));
    var cv = el('canvas');
    cv.className = 'short';
    host.appendChild(cv);
    var dom = domainOf(view);
    P.xy(cv, {
      series: series, xlabel: xlabel, ylabel: ylabel,
      zeroLine: stems,
      xmin: dom ? dom[0] : undefined, xmax: dom ? dom[1] : undefined
    });
    if (refused.length) host.appendChild(refusal('另有 ' + refused.length + ' 条按名拒绝：' + refused.join('；')));
    return null;
  }

  /** The poloidal section: layers of the spec, each switchable (U-16). */
  function mapView(host, view, c, opts) {
    var fx = c.idx[view.flux_layer] || null;
    if (!fx) return refusal('按名拒绝：呈现规格的 flux_layer「' + view.flux_layer + '」不在记录里');
    var r = fx['time_slice/boundary/outline/r'], z = fx['time_slice/boundary/outline/z'];
    if (!r || !z) return refusal('按名拒绝：' + view.flux_layer + ' 没有边界轮廓（fyo:PoloidalSectionView 的前提）');
    var flat = [], i;
    for (i = 0; i < r.data.length; i++) flat.push(r.data[i], z.data[i]);
    //: the view box comes from the data when no machine is loaded — a section
    //: still has to be isometric, and `FyPlot.poloidal` needs a box to be
    //: isometric IN
    var machine = opts && opts.machine;
    if (!machine) {
      var pad = 0.15;
      var rr = r.data.filter(isNum), zz = z.data.filter(isNum);
      var r0 = Math.min.apply(null, rr), r1 = Math.max.apply(null, rr);
      var z0 = Math.min.apply(null, zz), z1 = Math.max.apply(null, zz);
      machine = { grid: { rmin: r0 - pad, rmax: r1 + pad, zmin: z0 - pad, zmax: z1 + pad },
                  vessel: [], coils: [] };
    }
    var o = { machine: machine, lcfs: flat };
    var lim = fx['fylite:limiter/r'], limz = fx['fylite:limiter/z'];
    if (lim && limz && visible({ visible: !(view.structure_layer === false) })) {
      var w = [];
      for (i = 0; i < lim.data.length; i++) w.push(lim.data[i], limz.data[i]);
      o.vesselOverride = [w];
    }
    var ar = fx['time_slice/global_quantities/magnetic_axis/r'],
        az = fx['time_slice/global_quantities/magnetic_axis/z'];
    if (ar && az) o.axis = [ar.data, az.data];
    (view.overlay_layer || []).forEach(function (ov) {
      if (!visible(ov)) return;
      var id = typeof ov === 'string' ? ov : ov.id;
      var ds = c.idx[id];
      if (!ds) return;
      var rr2 = ds['time_slice/boundary/outline/r'], zz2 = ds['time_slice/boundary/outline/z'];
      if (!rr2 || !zz2) return;
      var ref = [];
      for (i = 0; i < rr2.data.length; i++) ref.push(rr2.data[i], zz2.data[i]);
      o.reference = ref;                                  // the compared shape
    });
    var cv = el('canvas');
    cv.className = 'xsec';
    host.appendChild(cv);
    P.poloidal(cv, o);
    return null;
  }

  /** A table view (U-21): one column per series, one row per index. */
  function tableView(host, view, c) {
    var cols = [], refused = [];
    (view.has_series || []).forEach(function (s) {
      var q = R.resolve(s.binds_quantity, c.idx);
      if (!q) { refused.push(s.binds_quantity); return; }
      cols.push({ label: lang(s.display_label, c.code) || R.label(q.path), q: q });
    });
    if (!cols.length) return refusal('按名拒绝：' + (refused.join('；') || '这个表没有可解析的列'));
    var n = 0;
    cols.forEach(function (col) { n = Math.max(n, col.q.ndim === 0 ? 1 : col.q.data.length); });
    var t = el('table'), head = el('tr');
    head.appendChild(el('th', null, '#'));
    cols.forEach(function (col) { head.appendChild(el('th', null, col.label + (col.q.units ? ' [' + col.q.units + ']' : ''))); });
    var thead = el('thead'); thead.appendChild(head); t.appendChild(thead);
    var body = el('tbody');
    for (var i = 0; i < n; i++) {
      var tr = el('tr');
      tr.appendChild(el('td', null, String(i + 1)));
      cols.forEach(function (col) {
        var v = col.q.ndim === 0 ? col.q.data : col.q.data[i];
        tr.appendChild(el('td', null, isNum(v) ? Number(v.toPrecision(6)) + '' : '—'));
      });
      body.appendChild(tr);
    }
    t.appendChild(body);
    host.appendChild(t);
    if (refused.length) host.appendChild(refusal('另有 ' + refused.length + ' 列按名拒绝：' + refused.join('；')));
    return null;
  }

  /** Scalars of the record, as a readings table. */
  function readoutView(host, view, c) {
    var rows = [], refused = [];
    (view.has_series || []).forEach(function (s) {
      var q = R.resolve(s.binds_quantity, c.idx);
      if (!q) { refused.push(s.binds_quantity); return; }
      var v = q.ndim === 0 ? q.data : (q.data.length === 1 ? q.data[0] : null);
      rows.push([lang(s.display_label, c.code) || R.label(q.path),
                 isNum(v) ? Number(v.toPrecision(6)) + (q.units ? ' ' + q.units : '') : '—']);
    });
    if (!rows.length) return refusal('按名拒绝：' + (refused.join('；') || '这个读数块没有可解析的量'));
    var t = el('table'), body = el('tbody');
    rows.forEach(function (r2) {
      var tr = el('tr');
      tr.appendChild(el('td', null, r2[0]));
      tr.appendChild(el('td', null, r2[1]));
      body.appendChild(tr);
    });
    t.appendChild(body);
    host.appendChild(t);
    return null;
  }

  var KINDS = { line_chart: lineView, stem: lineView, map: mapView,
                table: tableView, scalar_readout: readoutView };

  // --------------------------------------------------------------------- //
  // the faces
  // --------------------------------------------------------------------- //

  /** One view into `host`. Returns null when drawn, or the reason it was not. */
  function renderView(host, view, c, opts) {
    var fn = KINDS[view.view_kind], out;
    //: ★an unknown kind is a REFUSAL, and it has to be counted as one.  Written
    //: as `return host.appendChild(refusal(…)) && null` this line drew the
    //: sentence and reported the view as drawn — the caller then said「画了 1
    //: 个」about a figure that does not exist, which is the failure mode P-6
    //: exists to stop.  `validate-fig.mjs` caught it on its first run.
    if (!fn) out = refusal('按名拒绝：未知的 view_kind「' + view.view_kind + '」');
    else {
      try {
        out = fn(host, view, c, opts || {});
      } catch (e) {
        out = refusal('绘制失败：' + (e && e.message ? e.message : e));
      }
    }
    if (!out) return null;
    host.appendChild(out);
    return out.textContent;
  }

  /**
   * Every panel of a spec into `host`, one `<figure>` per view.
   *
   * Returns `{drawn, refused: [{caption, why}]}` — a page reports what it did
   * not draw rather than showing a shorter list of figures (P-6).
   */
  function renderSpec(host, spec, record, opts) {
    opts = opts || {};
    var c = context(record, opts.code);
    var out = { drawn: 0, refused: [] };
    host.innerHTML = '';
    (spec.has_panel || []).forEach(function (panel) {
      var sec = el('div', 'panel');
      var title = lang(panel.title, c.code);
      if (title) sec.appendChild(el('h2', null, title));
      (panel.has_view || []).forEach(function (view) {
        var fig = el('figure');
        fig.setAttribute('data-view-kind', view.view_kind || '');
        var why = renderView(fig, view, c, opts);
        var cap = lang(view.caption, c.code);
        if (cap) fig.appendChild(el('figcaption', null, cap));
        sec.appendChild(fig);
        if (why) out.refused.push({ caption: cap, why: why });
        else out.drawn++;
      });
      host.appendChild(sec);
    });
    return out;
  }

  /** The resolution context of one record: index, all quantities, equilibrium. */
  function context(record, code) {
    var idx = R.index(record);
    var all = [], eq = null;
    Object.keys(idx).forEach(function (k) {
      var qs = Object.keys(idx[k]).map(function (p) { return idx[k][p]; });
      all = all.concat(qs);
      if (/\/equilibrium$/.test(k) || /equilibrium$/.test(k)) eq = qs;
    });
    return { idx: idx, all: all, eq: eq, record: record,
             code: code || (root.FyI18n && root.FyI18n.current && root.FyI18n.current()) || 'zh' };
  }

  root.FyFig = { renderSpec: renderSpec, renderView: renderView, context: context,
                 ROLE: ROLE, MARK: MARK, KINDS: Object.keys(KINDS),
                 //: the spec a record would get by rule — ONE derivation, the
                 //: report face's (U-12 ③)
                 derive: function (plan, record) { return R.derive(plan, record); } };
})(typeof self !== 'undefined' ? self : this);
