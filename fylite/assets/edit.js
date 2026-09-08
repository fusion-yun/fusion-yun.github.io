// Trying a shape: the plan is what a drag edits, and every try is a version
// (`FYL-DESIGN-18` U-15 · U-23, §八).
//
// ★There is no second geometry.  A page that kept the shape being dragged in
// its own variables would have two answers to「现在的边界是什么」— the one on
// the canvas and the one the plan would send — and they part company the first
// time a drag is abandoned.  So a drag writes the PLAN, the figure is drawn
// from the plan, and「回到 #1」is a plan, not an undo stack of pixels.
//
// ★Two kinds of handle, two different things written (U-15).  A SQUARE handle
// moves a parameter of the parametric boundary (`code/<cap>#kappa` and its
// four siblings) and writes a `sets_parameter`.  A ROUND waypoint moves one
// point of a free outline and writes a small document bound to the boundary
// port, carrying `fylite:edited_from` so the thing it was derived from is
// still named.  A page cannot tell those apart by looking at the canvas, which
// is exactly why they are two calls here.
//
// ★Refusal is drawn, not corrected (P-6).  A boundary that leaves the limiter,
// self-intersects or is not closed is reported with the reason; nothing here
// nudges a point back inside.  The gate at run time is the door's (E-7); this
// is the page saying so before the user presses anything.
//
// ★Tiers are a property of the EDIT, not of the control (D-9).  `tier()` is the
// one place that says which gesture may cost what: a drag is A, a release is B,
// and C belongs to a key.  A slider that could reach C is the defect that
// ruling exists to prevent, and `validate-edit.mjs` asserts it cannot.
(function (root) {
  'use strict';

  //: which gesture buys which cost.  ★C is absent on purpose: no gesture in
  //: this file returns it, and the gate reads that.
  var TIERS = {
    drag: 'A',      // while the pointer is down: analytic redraw, <= 50 ms/frame
    release: 'B',   // on release: one solve, ~1.2 s measured on 65x65
    key: 'C'        // a button, and only a button: annealing, scans
  };
  function tier(gesture) { return TIERS[gesture] || null; }

  // ------------------------------------------------------------------ //
  // geometry
  // ------------------------------------------------------------------ //

  /** A Miller-ish boundary — the tier-A preview of a parametric shape. */
  function miller(p, n) {
    n = n || 64;
    var out = { r: [], z: [] };
    for (var i = 0; i < n; i++) {
      var t = i / n * 2 * Math.PI;
      var d = t <= Math.PI ? (p.du === undefined ? p.delta || 0 : p.du)
                           : (p.dl === undefined ? p.delta || 0 : p.dl);
      out.r.push(p.r0 + p.a * Math.cos(t + Math.asin(d) * Math.sin(t)));
      out.z.push(p.z0 || 0 + p.a * p.kappa * Math.sin(t));
    }
    return out;
  }

  /** Where the five square handles sit for a parametric boundary (U-15). */
  function handles(p) {
    var z0 = p.z0 || 0;
    return [
      { name: 'r0', r: p.r0, z: z0, kind: '+' },
      { name: 'a', r: p.r0 + p.a, z: z0, kind: '+' },
      { name: 'kappa', r: p.r0, z: z0 + p.a * p.kappa, kind: '+' },
      { name: 'du', r: p.r0 - p.a * (p.du === undefined ? p.delta || 0 : p.du),
        z: z0 + p.a * p.kappa * 0.72, kind: '+' },
      { name: 'dl', r: p.r0 - p.a * (p.dl === undefined ? p.delta || 0 : p.dl),
        z: z0 - p.a * p.kappa * 0.72, kind: '+' }
    ];
  }

  /** The parameter value a handle at (r, z) means — the inverse of `handles`. */
  function fromHandle(name, r, z, p) {
    var z0 = p.z0 || 0;
    switch (name) {
      case 'r0': return r;
      case 'a': return Math.max(1e-3, r - p.r0);
      case 'kappa': return Math.max(1e-3, (z - z0) / p.a);
      case 'du': return (p.r0 - r) / p.a;
      case 'dl': return (p.r0 - r) / p.a;
      default: return null;
    }
  }

  /**
   * Monotone cubic (PCHIP) through knots — the profile editor's curve.
   *
   * ★Interpolation, not a fit.  A fitting basis (the shifted Legendre of the
   * analysis page) answers「哪条曲线最像这些点」; a profile being SHAPED has to
   * pass through the points the reader put down, and must not overshoot between
   * them into a negative temperature.  Those are two different questions and
   * this repository answers them in two different places.
   */
  function pchip(knots, xs) {
    var n = knots.length, h = [], d = [], i;
    for (i = 0; i < n - 1; i++) {
      h.push(knots[i + 1].x - knots[i].x);
      d.push((knots[i + 1].y - knots[i].y) / (knots[i + 1].x - knots[i].x));
    }
    var m = new Array(n);
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) m[i] = 0;                  // a local extremum stays one
      else {
        var w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
        m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
      }
    }
    return xs.map(function (x) {
      var k = 0;
      while (k < n - 2 && x > knots[k + 1].x) k++;
      var t = (x - knots[k].x) / h[k], t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * knots[k].y + (t3 - 2 * t2 + t) * h[k] * m[k]
           + (-2 * t3 + 3 * t2) * knots[k + 1].y + (t3 - t2) * h[k] * m[k + 1];
    });
  }

  function segsCross(a, b, c, d) {
    function cr(o, p, q) { return (p.r - o.r) * (q.z - o.z) - (p.z - o.z) * (q.r - o.r); }
    var d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }

  function inside(pt, poly) {
    var n = poly.r.length, hit = false;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      if (((poly.z[i] > pt.z) !== (poly.z[j] > pt.z))
          && pt.r < (poly.r[j] - poly.r[i]) * (pt.z - poly.z[i]) / (poly.z[j] - poly.z[i]) + poly.r[i])
        hit = !hit;
    }
    return hit;
  }

  /**
   * Is this outline drawable? `{ok, why}` — and `why` names what is wrong
   * rather than which point to move (P-6: refuse, do not correct).
   */
  function validateOutline(o, limiter) {
    var n = o.r.length;
    if (n < 4 || o.z.length !== n) return { ok: false, why: '轮廓点数不足或 r / z 不等长' };
    var pts = [];
    for (var i = 0; i < n; i++) pts.push({ r: o.r[i], z: o.z[i] });
    for (i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      for (var j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;               // adjacent to the closing edge
        if (segsCross(a, b, pts[j], pts[(j + 1) % n]))
          return { ok: false, why: '轮廓自交（第 ' + (i + 1) + ' 段与第 ' + (j + 1) + ' 段）——这不是一个简单多边形' };
      }
    }
    if (limiter && limiter.r && limiter.r.length > 2) {
      for (i = 0; i < n; i++) {
        if (!inside(pts[i], limiter))
          return { ok: false, why: '第 ' + (i + 1) + ' 个路点在限制器之外（R = ' + pts[i].r.toFixed(3) +
                                   ', Z = ' + pts[i].z.toFixed(3) + '）' };
      }
    }
    //: ★no limiter is NOT a pass: it is a different answer, and the page says
    //: which one it gave (`FYL-DESIGN-13` P-10 — degrade by naming what is
    //: missing).  A shape declared valid against a wall nobody supplied is the
    //: kind of clean bill of health that gets believed.
    return { ok: true, why: limiter ? '' : '未对限制器判定：这份装置文档没有限制器轮廓' };
  }

  // ------------------------------------------------------------------ //
  // the plan, in versions
  // ------------------------------------------------------------------ //

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function setParam(plan, iri, value) {
    var ps = plan.parameters = plan.parameters || [];
    for (var i = 0; i < ps.length; i++) {
      if (ps[i].sets_parameter === iri) { ps[i].literal_value = value; return plan; }
    }
    ps.push({ type: 'spo:ParameterSetting', sets_parameter: iri, literal_value: value });
    return plan;
  }

  function getParam(plan, iri) {
    var ps = (plan && plan.parameters) || [];
    for (var i = 0; i < ps.length; i++) if (ps[i].sets_parameter === iri) return ps[i].literal_value;
    return undefined;
  }

  function bindInput(plan, port, doc) {
    var bs = plan.inputs = plan.inputs || [];
    for (var i = 0; i < bs.length; i++) {
      if ((bs[i].binds_port || {}).port_name === port) { bs[i].bound_to = doc; return plan; }
    }
    bs.push({ type: 'spo:PortBinding',
              binds_port: { type: 'spo:Port', port_name: port, port_direction: 'input' },
              bound_to: doc });
    return plan;
  }

  /**
   * An editor over one plan.  Every mutation makes a VERSION; nothing is
   * changed in place, including the plan handed in.
   *
   *   var e = FyEdit.editor(plan, {code: 'discharge'});
   *   e.setHandle('kappa', 1.90);            // a square handle
   *   e.setOutline({r: [...], z: [...]}, 'g138569.04000#…/outline');
   *   e.setProfile('te', knots, rho);        // a profile's knots
   *   e.setChannel('magnetics', 3, {weight: 0});
   *   e.undo(); e.versions(); e.plan();
   */
  function editor(plan0, opts) {
    opts = opts || {};
    var code = opts.code || '[TBD]';
    var vs = [{ plan: clone(plan0 || { type: 'fyo:ScenarioSpecification' }), what: '初始', at: 0 }];
    var at = 0;

    function push(next, what) {
      //: a new branch discards the redo tail — a try made after going back is
      //: a different history, and keeping both would make「回到 #1」ambiguous
      vs = vs.slice(0, at + 1);
      vs.push({ plan: next, what: what, at: vs.length });
      at = vs.length - 1;
      return next;
    }
    function work() { return clone(vs[at].plan); }

    var api = {
      plan: function () { return clone(vs[at].plan); },
      versions: function () { return vs.map(function (v, i) { return { i: i, what: v.what, current: i === at }; }); },
      at: function () { return at; },
      undo: function () { if (at > 0) at--; return api.plan(); },
      redo: function () { if (at < vs.length - 1) at++; return api.plan(); },
      goto: function (i) { if (i >= 0 && i < vs.length) at = i; return api.plan(); },

      /** A square handle: one parameter of the parametric boundary (U-15). */
      setHandle: function (name, value) {
        var iri = 'code/' + code + '#' + name;
        return push(setParam(work(), iri, value), name + ' → ' + value);
      },
      get: function (name) { return getParam(vs[at].plan, 'code/' + code + '#' + name); },

      /** A round waypoint: the free outline, bound to the boundary port. */
      setOutline: function (outline, from) {
        var doc = { id: 'edited/boundary', type: 'fyo:equilibrium',
                    time_slice: { boundary: { outline: { r: outline.r.slice(), z: outline.z.slice() } } } };
        if (from) doc['fylite:edited_from'] = from;
        return push(bindInput(work(), 'boundary', doc), '轮廓 ' + outline.r.length + ' 点');
      },

      /** A profile's knots, as an array parameter on its declared grid. */
      setProfile: function (name, knots, grid) {
        var next = work();
        setParam(next, 'code/' + code + '#' + name, pchip(knots, grid));
        setParam(next, 'code/' + code + '#' + name + '_knots',
                 knots.map(function (k) { return [k.x, k.y]; }));
        return push(next, name + ' 剖面 ' + knots.length + ' 节点');
      },

      /**
       * A channel's weight or switch, on the hand-filled layer of a port
       * (U-23).  A channel the dossier disabled cannot be opened here: the
       * dossier says「这台机器上它坏了」and the page may only choose within
       * what the dossier allows (`FYL-DESIGN-12` G-9).
       */
      setChannel: function (port, i, change, dossier) {
        if (change.enabled === true && dossier && dossier.disabled
            && dossier.disabled.indexOf(i) >= 0)
          return { refused: '通道 ' + i + ' 由装置卷宗禁用，页面打不开它（-12 G-9）' };
        var next = work();
        var doc = null;
        (next.inputs || []).forEach(function (b) {
          if ((b.binds_port || {}).port_name === port && b.bound_to
              && b.bound_to.id === 'edited/' + port) doc = b.bound_to;
        });
        if (!doc) {
          doc = { id: 'edited/' + port, type: 'fylite:HandFilled/1',
                  'fylite:edited_from': port, 'fylite:weight': {}, 'fylite:enabled': {} };
          bindInput(next, port, doc);
        }
        if (change.weight !== undefined) doc['fylite:weight'][i] = change.weight;
        if (change.enabled !== undefined) doc['fylite:enabled'][i] = !!change.enabled;
        return push(next, port + ' 通道 ' + i);
      }
    };
    return api;
  }

  root.FyEdit = { editor: editor, miller: miller, handles: handles, fromHandle: fromHandle,
                  pchip: pchip, validateOutline: validateOutline, tier: tier, TIERS: TIERS,
                  setParam: setParam, getParam: getParam };
})(typeof self !== 'undefined' ? self : this);
