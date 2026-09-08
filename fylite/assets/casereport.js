// The case-report face in the browser: plan + record -> the same presentation
// the Python renderer derives, drawn as SVG in the DOM.
//
// ONE RULE, TWO HOSTS.  `python/fylite/engine/casereport.py` is the
// reference: it derives an `spo:PresentationSpecification` from a record by
// the principles of FYL-REPORT-06 §13 (P1 no number is copied, P2 the
// abscissa is the quantity's own coordinate, the poloidal section binds a
// flux layer or is refused by name) and renders MyST + SVG.  This file is a
// port of the same rules — same walk over the dataset, same coordinate
// search, same grouping, same captions — so that the spec this page derives
// from a record is the spec Python wrote beside its report.
// `app/tests/validate-report.mjs` holds the two together.
//
// No number crosses into the spec; the page draws from the record and only
// from the record.  A supplied spec (`presentation.jsonld`) is drawn as given.
(function (root) {
  'use strict';

  var GRID_COORDS = ['grid/rho_tor_norm', 'grid/rho_tor', 'grid/psi', 'grid/rho_pol_norm'];
  var COORD_LEAVES = { time: 1, rho_tor: 1, rho_tor_norm: 1, psi: 1, dim1: 1, dim2: 1, rho_pol_norm: 1 };
  var LAYER_PREFIXES = ['time_slice/boundary/outline/', 'fylite:limiter/', 'time_slice/profiles_2d/'];
  var PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2'];
  var STATE_ZH = { succeeded: '成功', failed: '失败', rejected: '拒绝', running: '运行中',
                   submitted: '已提交', validating: '校验中', cancelled: '已取消' };

  function lang(v, code) {
    if (v && typeof v === 'object') return v[code] || v.zh || v.en || '';
    return v == null ? '' : String(v);
  }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function isLayer(p) { return LAYER_PREFIXES.some(function (x) { return p.indexOf(x) === 0; }); }
  function leafOf(p) { var i = p.lastIndexOf('/'); return i < 0 ? p : p.slice(i + 1); }
  function container(p) { var i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); }

  function hasArrays(doc) {
    for (var k in doc) {
      if (k.charAt(0) === '@' || k === 'id' || k === 'type' || k === 'comment') continue;
      var v = doc[k];
      if (Array.isArray(v) && v.length && typeof v[0] === 'number') return true;
      if (v && typeof v === 'object' && !Array.isArray(v) && hasArrays(v)) return true;
      if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' && hasArrays(v[0])) return true;
    }
    return false;
  }

  function unitsFromComment(doc) {
    var out = {}, lines = doc.comment || [];
    if (typeof lines === 'string') lines = [lines];
    lines.forEach(function (line) {
      if (typeof line !== 'string' || line.indexOf(' [') < 0) return;
      var i = line.indexOf(' [');
      var path = line.slice(0, i).trim(), rest = line.slice(i + 2);
      out[path] = rest.split(']')[0];
    });
    return out;
  }

  function walk(node, prefix, out) {
    if (Array.isArray(node)) {
      if (node.length && node[0] && typeof node[0] === 'object' && !Array.isArray(node[0])) {
        walk(node[0], prefix, out);            // an array of structures: index 0
      } else if (node.length && Array.isArray(node[0])) {
        out.push([prefix, node, 2]);
      } else if (node.length && node.every(function (x) { return typeof x === 'number' || x === null; })) {
        out.push([prefix, node, 1]);
      }
    } else if (node && typeof node === 'object') {
      Object.keys(node).forEach(function (k) {
        if (k.charAt(0) === '@' || k === 'id' || k === 'type' || k === 'comment') return;
        walk(node[k], prefix ? prefix + '/' + k : k, out);
      });
    } else if (typeof node === 'number') {
      out.push([prefix, node, 0]);
    }
  }

  /** Every numeric leaf of one dataset: {path, data, ndim, units, n}. */
  function quantities(doc) {
    var units = unitsFromComment(doc), leaves = [], out = [];
    walk(doc, '', leaves);
    leaves.forEach(function (l) {
      var path = l[0], data = l[1], ndim = l[2];
      var n = ndim === 1 ? data.length : ndim === 2 ? data.length : 1;
      out.push({ path: path, data: data, ndim: ndim, units: units[path] || '', n: n });
    });
    return out;
  }

  /** The coordinate a 1-D quantity is drawn against (P2), or null. */
  function coordinateOf(q, qs, eqQs) {
    if (q.ndim !== 1 || q.n < 2) return null;
    if (COORD_LEAVES[leafOf(q.path)]) return null;
    var byPath = {};
    qs.forEach(function (x) { if (x.ndim === 1) byPath[x.path] = x; });
    var anc = [], cont = container(q.path);
    for (;;) { anc.push(cont); if (!cont) break; cont = container(cont); }
    for (var a = 0; a < anc.length; a++) {
      for (var g = 0; g < GRID_COORDS.length; g++) {
        var c = byPath[anc[a] ? anc[a] + '/' + GRID_COORDS[g] : GRID_COORDS[g]];
        if (c && c.n === q.n) return c;
      }
      var cands = [anc[a] + '/rho_tor', anc[a] + '/psi'];
      for (var k = 0; k < cands.length; k++) {
        var cc = byPath[cands[k]];
        if (cc && cc.n === q.n && cc !== q) return cc;
      }
    }
    var t = byPath.time;
    if (t && t.n === q.n && t !== q) return t;
    for (var e = 0; e < (eqQs || []).length; e++) {
      var x = eqQs[e];
      if (/profiles_1d\/rho_tor$/.test(x.path) && x.n === q.n) return x;
    }
    return null;
  }

  function datasets(record) {
    var out = [];
    (record.inputs || []).forEach(function (b) {
      var bp = b.binds_port || {}, bt = b.bound_to;
      if (bp.port_direction === 'output' && bt && typeof bt === 'object' && hasArrays(bt)) out.push([bp.port_name || '', bt]);
    });
    return out;
  }

  var SKIP = { profiles_1d: 1, time_slice: 1, global_quantities: 1, value: 1, model: 1, '0': 1, local: 1 };
  function label(path) {
    var kept = path.split('/').filter(function (x) { return !SKIP[x]; });
    return kept.length ? kept.join('/') : path;
  }

  /** The spec this page would draw for the record (Python's `derive_presentation`, ported). */
  function derive(plan, record) {
    var rid = record.id || 'run', sets = datasets(record);
    var eqQs = null;
    sets.forEach(function (s) { if (!eqQs && s[1].type === 'fyo:equilibrium') eqQs = quantities(s[1]); });
    var profiles = [], traces = [], readouts = [], tabled = [], section = null;
    sets.forEach(function (s) {
      var port = s[0], doc = s[1], did = doc.id || port, qs = quantities(doc);
      var groups = [], order = {};
      qs.forEach(function (q) {
        if (q.ndim === 0 || (q.ndim === 1 && q.n === 1 && !COORD_LEAVES[leafOf(q.path)])) {
          readouts.push({ type: 'spo:Series', binds_quantity: did + '#' + q.path, series_role: 'computed',
                          display_label: { zh: port + '·' + label(q.path), en: port + '·' + label(q.path) } });
          return;
        }
        if (q.ndim !== 1) return;
        var c = coordinateOf(q, qs, eqQs);
        if (!c) {
          if (!COORD_LEAVES[leafOf(q.path)] && !isLayer(q.path)) tabled.push(did + '#' + q.path);
          return;
        }
        var key = c.path + ' ' + q.units;
        if (!(key in order)) { order[key] = groups.length; groups.push({ c: c, units: q.units, items: [] }); }
        groups[order[key]].items.push(q);
      });
      groups.forEach(function (g) {
        var cname = leafOf(g.c.path), isTrace = cname === 'time';
        var labels = g.items.map(function (q) { return label(q.path); }).join(', ');
        var view = {
          type: 'spo:View', view_kind: 'line_chart',
          caption: { zh: port + '：' + labels + '（' + (g.units || '1') + '）对 ' + cname + '（' + (g.c.units || '1') + '）',
                     en: port + ': ' + labels + ' [' + (g.units || '1') + '] against ' + cname + ' [' + (g.c.units || '1') + ']' },
          has_series: g.items.map(function (q) {
            return { type: 'spo:Series', binds_quantity: did + '#' + q.path, series_role: 'computed',
                     mark_kind: 'line', line_style: 'solid', display_label: { zh: label(q.path), en: label(q.path) } };
          }),
          comment: 'abscissa ' + did + '#' + g.c.path,
        };
        (isTrace ? traces : profiles).push(view);
      });
      if (doc.type === 'fyo:equilibrium' && !section) {
        var paths = {};
        qs.forEach(function (q) { paths[q.path] = 1; });
        if (paths['time_slice/boundary/outline/r'] && paths['time_slice/boundary/outline/z']) {
          var psi = !!paths['time_slice/profiles_2d/psi'];
          section = { type: 'fyo:PoloidalSectionView', view_kind: 'map',
                      caption: { zh: '极向截面：边界轮廓、磁轴' + (psi ? '、ψ 等值线' : ''),
                                 en: 'Poloidal section: boundary outline, magnetic axis' + (psi ? ', psi contours' : '') },
                      has_coordinate_system: 'spo:CylindricalRZ', flux_layer: did };
        }
      }
    });
    var panels = [];
    if (readouts.length) {
      panels.push({ type: 'spo:Panel', panel_kind: 'readings', title: { zh: '读数', en: 'Readings' },
                    has_view: [{ type: 'spo:View', view_kind: 'scalar_readout',
                                 caption: { zh: '记录中的标量', en: 'Scalars of the record' }, has_series: readouts }] });
    }
    var results = profiles.concat(traces).concat(section ? [section] : []);
    if (results.length) {
      panels.push({ type: 'spo:Panel', panel_kind: 'results', title: { zh: '结果', en: 'Results' }, has_view: results });
    }
    var caveat = ['derived by fylite.engine.casereport (FYL-REPORT-06 §13 P1–P4): no number is copied here, every series binds a quantity of the record by path'];
    if (tabled.length) caveat.push('tabled, not drawn (no coordinate declared): ' + tabled.join(', '));
    if (!section) caveat.push('fyo:PoloidalSectionView refused by name: no equilibrium dataset carries a boundary outline');
    return { '@context': ['context.jsonld', { '@base': '../' }], id: rid + '/presentation',
             type: 'spo:PresentationSpecification',
             title: { zh: '按规则推出的呈现规格', en: 'Presentation derived by rule' },
             presents: [plan && plan.id, rid].filter(Boolean), has_panel: panels, caveat: caveat };
  }

  // ------------------------------------------------------------------ SVG
  function niceStep(span, spanPx, minPx) {
    if (!(span > 0) || !(spanPx > 0)) return 1;
    var want = span * minPx / spanPx, pw = Math.pow(10, Math.floor(Math.log10(want))), m = want / pw;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * pw;
  }
  function fmt(v) {
    if (v === 0) return '0';
    var a = Math.abs(v);
    return (a >= 1e-3 && a < 1e5) ? String(+v.toPrecision(6)) : v.toExponential(2);
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function finite(xs) { return xs.filter(isNum); }

  /** series: [{label, x, y, color?, dashed?}] -> an SVG string (Python's `svg_line_chart`). */
  function svgLineChart(series, opt) {
    var width = opt.width || 560, height = opt.height || 320, title = opt.title || '';
    var padL = 62, padR = 16, padT = title ? 28 : 12, padB = 44;
    var w = width - padL - padR, h = height - padT - padB;
    var xs = finite([].concat.apply([], series.map(function (s) { return s.x; })));
    var ys = finite([].concat.apply([], series.map(function (s) { return s.y; })));
    var head = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" font-family="system-ui, sans-serif" font-size="11" fill="currentColor">';
    var o = [head];
    if (!xs.length || !ys.length) {
      return head + '<text x="' + width / 2 + '" y="' + height / 2 + '" text-anchor="middle" font-size="13">no finite samples</text></svg>';
    }
    var xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
    var ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys);
    if (xmax === xmin) xmax = xmin + 1;
    if (ymax === ymin) { var d0 = (Math.abs(ymin) || 1) * 0.5; ymax = ymin + d0; ymin = ymin - d0; }
    var yr = ymax - ymin; ymin -= 0.04 * yr; ymax += 0.04 * yr;
    var sx = function (v) { return padL + (v - xmin) / (xmax - xmin) * w; };
    var sy = function (v) { return padT + h - (v - ymin) / (ymax - ymin) * h; };
    if (title) o.push('<text x="' + padL + '" y="16" font-size="12" font-weight="600">' + esc(title) + '</text>');
    o.push('<rect x="' + padL + '" y="' + padT + '" width="' + w + '" height="' + h + '" fill="none" stroke="currentColor" stroke-opacity="0.35"/>');
    var stx = niceStep(xmax - xmin, w, 60), v;
    for (v = Math.ceil(xmin / stx) * stx; v <= xmax + 1e-12 * stx; v += stx) {
      var X = sx(v).toFixed(1);
      o.push('<line x1="' + X + '" y1="' + padT + '" x2="' + X + '" y2="' + (padT + h) + '" stroke="currentColor" stroke-opacity="0.12"/>');
      o.push('<text x="' + X + '" y="' + (padT + h + 14) + '" text-anchor="middle">' + esc(fmt(v)) + '</text>');
    }
    var sty = niceStep(ymax - ymin, h, 34);
    for (v = Math.ceil(ymin / sty) * sty; v <= ymax + 1e-12 * sty; v += sty) {
      var Y = sy(v);
      o.push('<line x1="' + padL + '" y1="' + Y.toFixed(1) + '" x2="' + (padL + w) + '" y2="' + Y.toFixed(1) + '" stroke="currentColor" stroke-opacity="0.12"/>');
      o.push('<text x="' + (padL - 6) + '" y="' + (Y + 3.5).toFixed(1) + '" text-anchor="end">' + esc(fmt(v)) + '</text>');
    }
    o.push('<text x="' + (padL + w / 2).toFixed(1) + '" y="' + (height - 8) + '" text-anchor="middle" font-size="12">' + esc(opt.xlabel || '') + '</text>');
    o.push('<text transform="translate(14,' + (padT + h / 2).toFixed(1) + ') rotate(-90)" text-anchor="middle" font-size="12">' + esc(opt.ylabel || '') + '</text>');
    series.forEach(function (s, i) {
      var col = s.color || PALETTE[i % PALETTE.length], pts = [];
      for (var k = 0; k < Math.min(s.x.length, s.y.length); k++) {
        if (isNum(s.x[k]) && isNum(s.y[k])) pts.push(sx(s.x[k]).toFixed(1) + ',' + sy(s.y[k]).toFixed(1));
      }
      if (!pts.length) return;
      o.push('<path d="M' + pts.join(' L') + '" fill="none" stroke="' + col + '" stroke-width="1.6"' + (s.dashed ? ' stroke-dasharray="6 4"' : '') + '/>');
    });
    var lx = padL + w - 10, ly = padT + 8;
    series.forEach(function (s, i) {
      var col = s.color || PALETTE[i % PALETTE.length], yy = ly + 14 * i + 6;
      o.push('<line x1="' + (lx - 22) + '" y1="' + yy + '" x2="' + (lx - 6) + '" y2="' + yy + '" stroke="' + col + '" stroke-width="2"/>');
      o.push('<text x="' + (lx - 26) + '" y="' + (yy + 3.5) + '" text-anchor="end">' + esc(s.label || '') + '</text>');
    });
    o.push('</svg>');
    return o.join('\n');
  }

  function contourSegments(z, x, y, level) {
    var segs = [], ny = z.length, nx = ny ? z[0].length : 0;
    if (x.length !== nx || y.length !== ny) return segs;
    function interp(p1, v1, p2, v2) { var t = v2 === v1 ? 0.5 : (level - v1) / (v2 - v1); return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])]; }
    for (var j = 0; j < ny - 1; j++) for (var i = 0; i < nx - 1; i++) {
      var v = [z[j][i], z[j][i + 1], z[j + 1][i + 1], z[j + 1][i]];
      if (!v.every(isNum)) continue;
      var p = [[x[i], y[j]], [x[i + 1], y[j]], [x[i + 1], y[j + 1]], [x[i], y[j + 1]]], pts = [];
      for (var k = 0; k < 4; k++) {
        var a = v[k], b = v[(k + 1) % 4];
        if ((a < level) !== (b < level)) pts.push(interp(p[k], a, p[(k + 1) % 4], b));
      }
      if (pts.length === 2) segs.push([pts[0], pts[1]]);
      else if (pts.length === 4) { segs.push([pts[0], pts[1]]); segs.push([pts[2], pts[3]]); }
    }
    return segs;
  }

  /** An isometric (R, Z) section: outline, axis, limiter, optional psi contours (Python's `svg_poloidal`). */
  function svgPoloidal(boundary, opt) {
    opt = opt || {};
    var br = boundary[0], bz = boundary[1], lim = opt.limiter, psi = opt.psi, axis = opt.axis;
    var rs = finite(br).concat(lim ? finite(lim[0]) : []), zs = finite(bz).concat(lim ? finite(lim[1]) : []);
    if (!rs.length || !zs.length) return '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';
    var rmin = Math.min.apply(null, rs), rmax = Math.max.apply(null, rs), zmin = Math.min.apply(null, zs), zmax = Math.max.apply(null, zs);
    var m = 0.06 * Math.max(rmax - rmin, zmax - zmin) || 0.1;
    rmin -= m; rmax += m; zmin -= m; zmax += m;
    var height = opt.height || 380, title = opt.title || '', pad = 40;
    var ph = height - 2 * pad - (title ? 18 : 0), scale = ph / (zmax - zmin), pw = (rmax - rmin) * scale;
    var width = Math.floor(pw + 2 * pad + 20), top = pad + (title ? 18 : 0);
    var sx = function (r) { return pad + (r - rmin) * scale; }, sy = function (z) { return top + ph - (z - zmin) * scale; };
    var o = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" font-family="system-ui, sans-serif" font-size="11" fill="currentColor">'];
    if (title) o.push('<text x="' + pad + '" y="16" font-size="12" font-weight="600">' + esc(title) + '</text>');
    o.push('<rect x="' + pad + '" y="' + top + '" width="' + pw.toFixed(1) + '" height="' + ph.toFixed(1) + '" fill="none" stroke="currentColor" stroke-opacity="0.35"/>');
    var st = niceStep(rmax - rmin, pw, 60), v;
    for (v = Math.ceil(rmin / st) * st; v <= rmax; v += st) o.push('<text x="' + sx(v).toFixed(1) + '" y="' + (top + ph + 14) + '" text-anchor="middle">' + esc(fmt(v)) + '</text>');
    st = niceStep(zmax - zmin, ph, 40);
    for (v = Math.ceil(zmin / st) * st; v <= zmax; v += st) o.push('<text x="' + (pad - 6) + '" y="' + (sy(v) + 3.5).toFixed(1) + '" text-anchor="end">' + esc(fmt(v)) + '</text>');
    o.push('<text x="' + (pad + pw / 2).toFixed(1) + '" y="' + (height - 6) + '" text-anchor="middle" font-size="12">R [m]</text>');
    o.push('<text transform="translate(12,' + (top + ph / 2).toFixed(1) + ') rotate(-90)" text-anchor="middle" font-size="12">Z [m]</text>');
    if (psi) {
      var flat = finite([].concat.apply([], psi[0]));
      if (flat.length) {
        var lo = Math.min.apply(null, flat), hi = Math.max.apply(null, flat), n = opt.levels || 8;
        for (var k = 1; k <= n; k++) {
          var lev = lo + (hi - lo) * k / (n + 1);
          var d = contourSegments(psi[0], psi[1], psi[2], lev).map(function (s) {
            return 'M' + sx(s[0][0]).toFixed(1) + ',' + sy(s[0][1]).toFixed(1) + ' L' + sx(s[1][0]).toFixed(1) + ',' + sy(s[1][1]).toFixed(1);
          }).join(' ');
          if (d) o.push('<path d="' + d + '" fill="none" stroke="#7c8ea6" stroke-width="0.9"/>');
        }
      }
    }
    function poly(rr, zz, close, stroke, wdt) {
      var pts = [];
      for (var i = 0; i < Math.min(rr.length, zz.length); i++) if (isNum(rr[i]) && isNum(zz[i])) pts.push(sx(rr[i]).toFixed(1) + ',' + sy(zz[i]).toFixed(1));
      if (pts.length) o.push('<path d="M' + pts.join(' L') + (close ? ' Z' : '') + '" fill="none" stroke="' + stroke + '" stroke-width="' + wdt + '"/>');
    }
    if (lim) poly(lim[0], lim[1], false, '#666', 1.6);
    poly(br, bz, true, '#dc2626', 1.8);
    if (axis && isNum(axis[0]) && isNum(axis[1])) o.push('<circle cx="' + sx(axis[0]).toFixed(1) + '" cy="' + sy(axis[1]).toFixed(1) + '" r="3.5" fill="#dc2626"/>');
    o.push('</svg>');
    return o.join('\n');
  }

  // ------------------------------------------------------------ resolving
  function index(record) {
    var out = {};
    datasets(record).forEach(function (s) {
      var m = {};
      quantities(s[1]).forEach(function (q) { m[q.path] = q; });
      out[s[1].id || s[0]] = m;
    });
    return out;
  }
  function resolve(ref, idx) {
    var i = ref.indexOf('#');
    return (idx[ref.slice(0, i)] || {})[ref.slice(i + 1)] || null;
  }

  /** Every view of the spec -> {kind, caption, svg?, rows?, refused?} (Python's `render_figures`). */
  function figures(record, spec, code) {
    var idx = index(record), out = [];
    var eqKey = Object.keys(idx).filter(function (k) { return /\/equilibrium$/.test(k); })[0];
    var eqQs = eqKey ? Object.keys(idx[eqKey]).map(function (p) { return idx[eqKey][p]; }) : null;
    (spec.has_panel || []).forEach(function (panel) {
      (panel.has_view || []).forEach(function (view) {
        var kind = view.view_kind, cap = lang(view.caption, code);
        if (kind === 'line_chart') {
          var series = [], coord = null;
          (view.has_series || []).forEach(function (s) {
            var q = resolve(s.binds_quantity, idx);
            if (!q || q.ndim !== 1) return;
            var did = s.binds_quantity.slice(0, s.binds_quantity.indexOf('#'));
            var qs = Object.keys(idx[did]).map(function (p) { return idx[did][p]; });
            var c = coordinateOf(q, qs, eqQs);
            if (!c) return;
            coord = coord || c;
            series.push({ label: lang(s.display_label, code) || label(q.path), x: c.data, y: q.data,
                          dashed: s.line_style === 'dashed', units: q.units });
          });
          if (!series.length || !coord) { out.push({ kind: kind, caption: cap, refused: 'no series of this view resolves to a 1-D quantity with a coordinate' }); return; }
          out.push({ kind: kind, caption: cap, svg: svgLineChart(series, { xlabel: leafOf(coord.path) + ' [' + (coord.units || '1') + ']', ylabel: '[' + (series[0].units || '1') + ']' }) });
        } else if (kind === 'map' || view.type === 'fyo:PoloidalSectionView') {
          var qs2 = idx[view.flux_layer] || {};
          var br = qs2['time_slice/boundary/outline/r'], bz = qs2['time_slice/boundary/outline/z'];
          if (!br || !bz) { out.push({ kind: 'map', caption: cap, refused: 'flux layer ' + view.flux_layer + ' carries no boundary outline' }); return; }
          var ar = qs2['time_slice/global_quantities/magnetic_axis/r'], az = qs2['time_slice/global_quantities/magnetic_axis/z'], axis = null;
          if (ar && az) axis = [ar.ndim === 1 ? ar.data[0] : ar.data, az.ndim === 1 ? az.data[0] : az.data];
          var lr = qs2['fylite:limiter/r'], lz = qs2['fylite:limiter/z'];
          var p2 = qs2['time_slice/profiles_2d/psi'], gx = qs2['time_slice/profiles_2d/grid/dim1'], gy = qs2['time_slice/profiles_2d/grid/dim2'];
          out.push({ kind: 'map', caption: cap, svg: svgPoloidal([br.data, bz.data], {
            axis: axis, limiter: lr && lz ? [lr.data, lz.data] : null,
            psi: p2 && gx && gy && p2.ndim === 2 ? [p2.data, gx.data, gy.data] : null }) });
        } else if (kind === 'scalar_readout') {
          var rows = [];
          (view.has_series || []).forEach(function (s) {
            var q = resolve(s.binds_quantity, idx);
            if (q && (q.ndim === 0 || (q.ndim === 1 && q.n === 1))) rows.push([lang(s.display_label, code) || q.path, q.ndim === 1 ? q.data[0] : q.data, q.units]);
          });
          out.push({ kind: kind, caption: cap, rows: rows });
        } else if (kind === 'verdict') {
          out.push({ kind: kind, caption: cap, refused: 'a plain case record carries no comparison record' });
        } else {
          out.push({ kind: kind, caption: cap, refused: 'view kind ' + kind + ' is not rendered by this host' });
        }
      });
    });
    return out;
  }

  // -------------------------------------------------------------- the DOM
  //: ★`html:` is for THIS FILE's own strings (the i18n catalogue, and SVG this
  //: module generated); anything that came out of a document uses `text:`.
  //: `renderInto` below is the boundary where that rule is applied.
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'html') e.innerHTML = attrs[k]; else e.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }
  function table(caption, head, rows, id) {
    var t = el('table', { class: 'report-table' });
    if (id) t.id = id;
    t.appendChild(el('caption', { text: caption }));
    var tr = el('tr'); head.forEach(function (h) { tr.appendChild(el('th', { text: h })); });
    t.appendChild(el('thead', null, [tr]));
    var tb = el('tbody');
    rows.forEach(function (r) { var row = el('tr'); r.forEach(function (c, i) { row.appendChild(el(i === 0 ? 'th' : 'td', { text: c })); }); tb.appendChild(row); });
    t.appendChild(tb);
    return t;
  }
  function T(key, params) { return root.FyI18n && root.FyI18n.t ? root.FyI18n.t(key, params) : key; }

  /**
   * Render {plan, record, spec?, lang} into `host` (emptied first).  Returns the
   * spec actually drawn (derived when none was supplied) and the figure list.
   */
  function renderInto(host, args) {
    var plan = args.plan || null, record = args.record, code = args.lang || 'zh';
    var spec = args.spec || derive(plan, record);
    var figs = figures(record, spec, code);
    host.innerHTML = '';
    var rid = record.id || 'run', title = lang(plan && plan.title || record.title, code) || rid;
    var state = record.run_state || '', xc = record.executed_code || {};
    host.appendChild(el('h2', { text: title }));
    var dev = plan && plan.about_discharge && plan.about_discharge.performed_on ? lang(plan.about_discharge.performed_on.title, code) : '';
    host.appendChild(el('p', { class: 'note', html:
      T('rep.summary', { plan: esc((plan && plan.id) || (record.realizes || {}).id || '—'), dev: dev ? '（' + esc(dev) + '）' : '',
                         code: esc(xc.id || '—') + ' ' + esc(xc.version || ''), rid: esc(rid),
                         state: esc((code === 'zh' ? STATE_ZH[state] : state) || state) + ' (' + esc(state) + ')',
                         npar: (record.parameters || []).length, nout: datasets(record).length,
                         spec: esc(spec.id || ''), derived: args.spec ? T('rep.spec.given') : T('rep.spec.derived') }) }));
    //: ★★THE DOCUMENT DOES NOT WRITE THE PAGE.  A plan's `note` is prose from a
    //: file the reader opened — a file picker, a drop, or `?src=<url>`, which a
    //: link can choose for them.  It went in as `html:` so the corpus's own
    //: `<strong>` / `<sub>` markup would render; that made every opened document
    //: able to run script in this page's origin.  The corpus's typography is not
    //: worth that, so the note is TEXT.
    var note = plan ? lang(plan.note, code) : '';
    if (note) host.appendChild(el('p', { class: 'note', text: note }));
    // 方法
    host.appendChild(el('h3', { text: T('rep.h.method') }));
    host.appendChild(table(T('rep.tbl.parameters'), [T('rep.col.parameter'), T('rep.col.value')],
      (record.parameters || []).map(function (p) { var k = String(p.sets_parameter || ''); return [k.slice(k.lastIndexOf('#') + 1), JSON.stringify(p.literal_value)]; }), 'rep-parameters'));
    host.appendChild(table(T('rep.tbl.ports'), [T('rep.col.port'), T('rep.col.direction'), T('rep.col.binding')],
      (record.inputs || []).map(function (b) {
        var bp = b.binds_port || {}, bt = b.bound_to, conc = b.bound_concretization || {};
        var how = bt && typeof bt === 'object' && hasArrays(bt) ? 'inline dataset ' + (bt.id || '')
                : b.bound_endpoint ? 'endpoint ' + ((b.bound_endpoint || {}).endpoint_uri || '')
                : conc.storage_uri ? 'file ' + conc.storage_uri : 'open';
        return [bp.port_name || '', bp.port_direction || '', how];
      }), 'rep-ports'));
    // 结果
    host.appendChild(el('h3', { text: T('rep.h.results') }));
    var figIndex = 0;
    figs.forEach(function (f) {
      if (f.kind === 'scalar_readout') {
        host.appendChild(table(f.caption, [T('rep.col.quantity'), T('rep.col.value'), T('rep.col.units')],
          f.rows.map(function (r) { return [r[0], isNum(r[1]) ? fmt(r[1]) : String(r[1]), r[2] || '1']; }), 'rep-readings'));
      } else if (f.svg) {
        figIndex += 1;
        var fig = el('figure', { class: 'report-fig', 'data-kind': f.kind });
        fig.innerHTML = f.svg;
        fig.appendChild(el('figcaption', { text: T('rep.fig', { n: figIndex }) + f.caption }));
        host.appendChild(fig);
      } else if (f.refused) {
        host.appendChild(el('p', { class: 'note report-refused', text: T('rep.refused', { caption: f.caption, why: f.refused }) }));
      }
    });
    (spec.caveat || []).forEach(function (c) { if (c.indexOf('tabled') === 0) host.appendChild(el('p', { class: 'note', text: c })); });
    (record.comment || []).forEach(function (c) { host.appendChild(el('p', { class: 'note', text: T('rep.kernel_note') + c })); });
    // 验收 / 复现性
    host.appendChild(el('h3', { text: T('rep.h.acceptance') }));
    host.appendChild(el('p', { class: 'note', html: T('rep.acceptance', { state: esc(state) }) }));
    host.appendChild(el('h3', { text: T('rep.h.provenance') }));
    var prov = [];
    ((record.realizes || {}).concretized_as || []).forEach(function (c) { prov.push([T('rep.prov.plan'), c.storage_uri || '', c.checksum || '—']); });
    (xc.concretized_as || []).forEach(function (c) { prov.push([T('rep.prov.code') + ' ' + (xc.version || ''), String(c.storage_uri || '').split('/').pop(), c.checksum || '—']); });
    (record.inputs || []).forEach(function (b) { var c = b.bound_concretization || {}; if (c.checksum) prov.push([T('rep.prov.output') + ' ' + ((b.binds_port || {}).port_name || ''), c.storage_uri || '', c.checksum]); });
    host.appendChild(table(T('rep.tbl.provenance'), [T('rep.col.item'), T('rep.col.storage'), T('rep.col.checksum')], prov, 'rep-provenance'));
    root.FyCaseReport.lastSpec = spec;
    root.FyCaseReport.lastFigures = figs;
    return { spec: spec, figures: figs };
  }

  //: ★`index` / `resolve` are exported for `fig.js`, which draws the SAME spec
  //: onto the function pages' canvases.  Two resolvers would be two answers to
  //: 「这条序列绑的是哪个量」 and the page and the report would drift apart —
  //: the one thing the presentation spec exists to prevent (U-12).
  root.FyCaseReport = { derive: derive, quantities: quantities, coordinateOf: coordinateOf, figures: figures,
                        index: index, resolve: resolve, datasets: datasets, label: label, lang: lang,
                        svgLineChart: svgLineChart, svgPoloidal: svgPoloidal, renderInto: renderInto,
                        hasArrays: hasArrays, lastSpec: null, lastFigures: null };
})(typeof self !== 'undefined' ? self : this);
