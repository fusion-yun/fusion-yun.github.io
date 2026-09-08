// Device description as an fyo/JSON-LD document, both directions.
//
// The group names follow IMAS DD (`pf_active.coil[].element[].geometry.
// rectangle`, `wall.description_2d[].limiter.unit[].outline`, `magnetics.
// flux_loop[].position[]`), which is what makes the file readable by anything
// else in the ecosystem rather than only by this page.  fydata's own ITER
// A-Box is in the same shape, so a descriptor exported here and one converted
// from fydata line up field for field.
//
// Two things have no faithful DD spelling and are therefore explicitly
// namespaced rather than smuggled into a DD field:
//
//   fylite:channel_map   which coil elements a PCS channel drives, and with
//                        what weight.  DD's pf_active.circuit encodes supply
//                        nodes, which is a different statement; misusing it
//                        would be worse than admitting the extension.
//   fylite:grid          the computational box.  It is a property of the
//                        calculation, not of the machine.
//
// An imported document is UNTRUSTED input: every array is length- and
// finiteness-checked here, because a bad descriptor does not fail loudly in
// the solver — it produces a plausible-looking wrong equilibrium.

(function (root) {
  'use strict';

  //: ★★文档类型名**取自生成的契约表**（`fyo-interface.js` 的 `TABLES.DEVICE.type`，
  //: 由内核 `fyo.rs` 的 `@fyo-table` 生成，Python 与 Rust 读的是同一份）。
  //: 2026-09-05 实测：这里从前写死 `fylite:DeviceDescription/1`，而**每一份发布出去的
  //: 装置文档写的是 `fyo:DeviceDescription`**——于是页面读任何一台机器都当场抛
  //: 「不是装置描述文档」。三种制品全带着这个毛病，构建全绿：没有任何东西把这个手写
  //: 常量与那张生成表比过。写死一个契约里的名字，就是给它开了一条会漂移的第二真源。
  var TYPE = (root.FyNames && root.FyNames.TABLES && root.FyNames.TABLES.DEVICE
              && root.FyNames.TABLES.DEVICE.type) || 'fyo:DeviceDescription';
  //: 旧拼法：2026-09-05 之前**本文件自己写出去的**文档带的是它。读得进，是因为读者
  //: 手上可能正有一份那样的文件；写出去的一律是上面那个。
  var TYPE_LEGACY = 'fylite:DeviceDescription/1';
  var CONTEXT = {
    fylite: 'urn:fylite:',
    imas: 'https://imas.iter.org/dd/4#',
  };

  function fail(key, detail) {
    throw new Error(root.FyI18n.t(key, detail));
  }

  function num(v, what) {
    var x = +v;
    if (!isFinite(x)) fail('dev.bad_number', { what: what });
    return x;
  }

  function numArray(a, what, minLen) {
    if (!Array.isArray(a) || a.length < (minLen || 1))
      fail('dev.bad_array', { what: what, n: minLen || 1 });
    return a.map(function (v) { return num(v, what); });
  }

  // --- descriptor -> document -------------------------------------------

  function toFyo(m) {
    var coils = m.coils.map(function (c) {
      var el = {
        geometry: {
          geometry_type: 'rectangle',
          rectangle: { r: c.r, z: c.z, width: c.w, height: c.h },
        },
        turns_with_sign: c.turns,
      };
      //: ★the two tilts go out as they came in (`fromFyo` reads them): a
      //: document that dropped them would read back as untilted rectangles
      if (c.a1 !== undefined) el['fylite:a1'] = c.a1;
      if (c.a2 !== undefined) el['fylite:a2'] = c.a2;
      return { name: c.name, element: [el] };
    });
    var limiterUnit = { outline: { r: m.limiter.r, z: m.limiter.z } };
    var vesselUnits = [];
    (m.vesselOutline || []).forEach(function (v) {
      vesselUnits.push({ outline: { r: v.r, z: v.z } });
    });
    (m.vessel || []).forEach(function (v) {
      var u = {
        element: [{ geometry: { geometry_type: 'rectangle',
                                rectangle: { r: v.r, z: v.z,
                                             width: v.w, height: v.h } } }],
        //: the EAST deck tilts its vessel elements; a1/a2 have no DD
        //: rectangle spelling, so they ride along namespaced
        'fylite:a1': v.a1, 'fylite:a2': v.a2,
      };
      //: ★per-element resistivity, when the machine has one.  A wall built
      //: of two metals — stainless shells and copper plates 43x less
      //: resistive — has no single value, and the copper is what decides the
      //: vertical growth rate.
      if (v.eta !== undefined) u['fylite:resistivity_uohm_m'] = v.eta;
      if (v.group) u['fylite:group'] = v.group;
      vesselUnits.push(u);
    });
    var doc = {
      '@context': CONTEXT,
      '@type': TYPE,
      'fylite:device_id': m.id,
      name: m.name,
      tf: root.FyDevice.tf(m),
      pf_active: { coil: coils },
      'fylite:channel_map': m.channels,
      wall: { description_2d: [{ limiter: { unit: [limiterUnit] },
                                 vessel: { unit: vesselUnits } }] },
      magnetics: {
        flux_loop: m.loops.map(function (p, i) {
          return { name: (m.loopNames && m.loopNames[i]) || ('FL' + (i + 1)),
                   position: [{ r: p[0], z: p[1] }] };
        }),
      },
      'fylite:grid': m.grid,
    };
    //: ★probes ride BOTH ways or not at all.  The DD spells the position and
    //: the poloidal angle; the angle in DEGREES, the effective length and the
    //: operational weight have no DD spelling and travel namespaced, as a1/a2
    //: do.  A document that dropped them on export would quietly turn a
    //: machine with 79 probes into one with none the first time it was
    //: round-tripped through this page.
    if (m.probes && m.probes.length)
      doc.magnetics.b_field_pol_probe = m.probes.map(function (p, i) {
        return {
          name: p.name || ('MP' + (i + 1)),
          position: [{ r: p.r, z: p.z }],
          poloidal_angle: p.angle * Math.PI / 180,
          'fylite:angle_deg': p.angle,
          'fylite:length': p.length,
          'fylite:weight': p.weight,
          'fylite:bit_error': p.bitError,
        };
      });
    if (m.point) doc['fylite:point'] = m.point;
    if (m.ui) doc['fylite:ui'] = m.ui;
    //: wall resistivity is DEVICE data — the vertical-stability page reads it
    //: and refuses to invent one, so a descriptor that carries it must not
    //: lose it on the way through a document.  There is no DD spelling for a
    //: single vessel resistivity, so it rides namespaced, as a1/a2 do.
    if (m.vessel_resistivity_uohm_m !== undefined)
      doc['fylite:vessel_resistivity_uohm_m'] = m.vessel_resistivity_uohm_m;
    //: a reference discharge is a measurement set, not part of the machine —
    //: it travels only when there is one to travel
    if (m.reference) doc['fylite:reference_discharge'] = m.reference;
    //: ★exported as they came in — a device round-tripped through this page
    //: must not come back with its shot's time series quietly dropped
    if (m.slices && m.slices.length) doc['fylite:slices'] = m.slices;
    //: ★ENGINEERING LIMITS, likewise: what a supply can hold is device data,
    //: and a round trip that dropped it would turn a declared limit into an
    //: undeclared one — which the pages then report as 未知, i.e. the
    //: document would have silently unlearned something true.
    if (m.limits) doc['fylite:engineering_limits'] = m.limits;
    //: ★★LOWER-HYBRID LAUNCHERS are device data too (T-M15): a nameplate
    //: maximum and the n_∥ band an antenna can launch are properties of the
    //: machine, while the injected and reflected powers of one shot are not.
    //: They ride here so the pages can stop carrying EAST's two systems as
    //: HTML literals — and they ride BOTH ways for the reason the probes do:
    //: a document that dropped them on export would turn a machine with two
    //: launchers into one with none the first time it was round-tripped.
    //: `frequency` is the DD's own field; the other two have no DD spelling
    //: for what the HARDWARE can do (the DD's `n_parallel_peak` is a per-shot
    //: signal) and are namespaced.
    if (m.lhAntennas && m.lhAntennas.length)
      doc.lh_antennas = { antenna: m.lhAntennas.map(function (a, i) {
        return { name: a.name || ('LH' + (i + 1)),
                 frequency: a.frequency,
                 'fylite:max_power': a.maxPower,
                 'fylite:n_parallel': a.nParallel.slice() };
      }) };
    return doc;
  }

  // --- document -> descriptor -------------------------------------------

  function rectOf(el, what) {
    var g = (el && el.geometry) || {};
    var r = g.rectangle || (g.outline ? null : g);
    if (!r || r.width === undefined)
      fail('dev.not_rectangle', { what: what });
    return { r: num(r.r, what), z: num(r.z, what),
             w: num(r.width, what), h: num(r.height, what) };
  }

  function outlineOf(u, what) {
    var o = u && u.outline;
    if (!o) fail('dev.no_outline', { what: what });
    var r = numArray(o.r, what, 3), z = numArray(o.z, what, 3);
    if (r.length !== z.length)
      fail('dev.length_mismatch', { what: what, a: r.length, b: z.length });
    //: ★drop points that repeat the one before them.  BEST's blanket lists
    //: (4.85, 0.0) twice — a zero-length segment, which is invisible in a
    //: drawing and a degenerate case for everything that asks a polygon a
    //: question (which side is inside, do these two edges cross).  The
    //: wrap-around pair is left alone: a contour that names its closing point
    //: explicitly, as EAST's does, keeps saying so.
    var rr = [r[0]], zz = [z[0]];
    for (var i = 1; i < r.length; i++) {
      if (r[i] === r[i - 1] && z[i] === z[i - 1]) continue;
      rr.push(r[i]); zz.push(z[i]);
    }
    return { r: rr, z: zz };
  }

  /**
   * Several limiter units are ONE contour cut into pieces — and the pieces are
   * not stored end to end.
   *
   * ★This used to be `concat`, in written order.  ITER's wall is a first-wall
   * unit and a divertor unit, and the divertor is stored running the OTHER
   * WAY: appending it as written jumps 2.38 m from the first wall's end to the
   * divertor's start, draws a chord straight across the divertor, and comes
   * back — the tangle under the X point.  BEST is four pieces (blanket, inner
   * divertor, dome, outer divertor) with the same problem.
   *
   * ★★AND IT IS NOT ONLY A DRAWING BUG.  The limiter polygon is what
   * `plasmaMask` tests points against, so a contour that crosses itself puts
   * part of the divertor volume outside the plasma and part of the outside in.
   *
   * The pieces are chained by their ENDPOINTS: start from the longest, and
   * repeatedly take whichever unused piece has an endpoint nearest the free
   * end, reversing that piece when it is its far end that matches.  Gaps are
   * expected — a real wall has ports and gaps, and ITER's pieces are 0.17 and
   * 0.22 m apart — so this is nearest-endpoint chaining, not exact matching.
   * One unit is returned untouched, which is every other machine here.
   */
  function stitchOutline(parts) {
    if (parts.length === 1) return parts[0];
    var left = parts.slice();
    //: the longest piece decides the direction the rest are chained in
    left.sort(function (a, b) { return b.r.length - a.r.length; });
    var out = { r: left[0].r.slice(), z: left[0].z.slice() };
    left.shift();
    var d2 = function (r1, z1, r2, z2) {
      var dr = r1 - r2, dz = z1 - z2;
      return dr * dr + dz * dz;
    };
    while (left.length) {
      var er = out.r[out.r.length - 1], ez = out.z[out.z.length - 1];
      var best = 0, flip = false, bestD = Infinity;
      for (var i = 0; i < left.length; i++) {
        var p = left[i];
        var dHead = d2(er, ez, p.r[0], p.z[0]);
        var dTail = d2(er, ez, p.r[p.r.length - 1], p.z[p.z.length - 1]);
        if (dHead < bestD) { bestD = dHead; best = i; flip = false; }
        if (dTail < bestD) { bestD = dTail; best = i; flip = true; }
      }
      var take = left.splice(best, 1)[0];
      var rr = flip ? take.r.slice().reverse() : take.r;
      var zz = flip ? take.z.slice().reverse() : take.z;
      out.r = out.r.concat(rr);
      out.z = out.z.concat(zz);
    }
    return out;
  }

  function fromFyo(doc) {
    if (!doc || (doc['@type'] !== TYPE && doc['@type'] !== TYPE_LEGACY))
      fail('dev.not_device', { got: (doc && doc['@type']) || '@type',
                               want: TYPE });
    var pf = doc.pf_active || {};
    if (!Array.isArray(pf.coil) || !pf.coil.length) fail('dev.no_coils');
    var coils = pf.coil.map(function (c, i) {
      var els = Array.isArray(c.element) ? c.element : [c.element];
      var what = c.name || ('coil ' + i);
      var g = rectOf(els[0], what);
      return { name: String(c.name || ('C' + (i + 1))),
               r: g.r, z: g.z, w: g.w, h: g.h,
               //: a2 = 90 is the upright-rectangle convention the kernel's
               //: element_filaments() expects.  a2 = 0 collapses the coil
               //: onto a line — the trap the EAST deck sets.
               a1: els[0]['fylite:a1'] !== undefined ? +els[0]['fylite:a1'] : 0,
               a2: els[0]['fylite:a2'] !== undefined ? +els[0]['fylite:a2'] : 90,
               turns: num(els[0].turns_with_sign, what) };
    });

    var d2 = ((doc.wall || {}).description_2d || [])[0] || {};
    var limUnits = ((d2.limiter || {}).unit) || [];
    if (!limUnits.length) fail('dev.no_limiter');
    var limiter = stitchOutline(limUnits.map(function (u) {
      return outlineOf(u, 'limiter');
    }));

    var vessel = [], vesselOutline = [];
    (((d2.vessel || {}).unit) || []).forEach(function (u, i) {
      if (u.outline) { vesselOutline.push(outlineOf(u, 'vessel ' + i)); return; }
      //: ★★The DD's THIRD spelling of a vessel unit, and the one this reader
      //: could not open: `annular`, an inner and an outer outline bounding a
      //: shell.  ITER's and CFETR's vacuum vessels are described that way,
      //: so importing either of them produced a machine with NO vessel — and
      //: a page whose whole subject is the vessel (vertical stability) would
      //: have drawn nothing and blamed the deck.  Both outlines are kept:
      //: the shell is the region between them, and dropping one turns a
      //: double wall into a line.
      if (u.annular) {
        ['outline_inner', 'outline_outer'].forEach(function (side) {
          var o = u.annular[side];
          if (!o) return;
          var pts = o.points;
          if (Array.isArray(pts)) {
            vesselOutline.push({
              r: numArray(pts.map(function (q) { return q[0]; }), 'vessel ' + i, 3),
              z: numArray(pts.map(function (q) { return q[1]; }), 'vessel ' + i, 3),
            });
          } else if (o.r) {
            vesselOutline.push(outlineOf({ outline: o }, 'vessel ' + i));
          }
        });
        return;
      }
      var els = Array.isArray(u.element) ? u.element : [u.element];
      var g = rectOf(els[0], 'vessel ' + i);
      var el = { r: g.r, z: g.z, w: g.w, h: g.h,
                 a1: +(u['fylite:a1'] || 0),
                 a2: u['fylite:a2'] === undefined ? 90 : +u['fylite:a2'] };
      if (u['fylite:resistivity_uohm_m'] !== undefined)
        el.eta = num(u['fylite:resistivity_uohm_m'], 'vessel ' + i + ' eta');
      if (u['fylite:group']) el.group = String(u['fylite:group']);
      vessel.push(el);
    });

    var bp = ((doc.magnetics || {}).b_field_pol_probe) || [];
    var probes = bp.map(function (p, i) {
      var pos = (p.position || [])[0] || {};
      //: the angle is what makes a probe a probe: without it every reading is
      //: B_r, which is a smooth wrong answer rather than a failure
      var deg = p['fylite:angle_deg'];
      if (deg === undefined)
        deg = (p.poloidal_angle || 0) * 180 / Math.PI;
      return { name: String(p.name || ('MP' + (i + 1))),
               r: num(pos.r, 'probe ' + i), z: num(pos.z, 'probe ' + i),
               angle: +deg,
               length: +(p['fylite:length'] || 0),
               weight: +(p['fylite:weight'] || 0),
               bitError: +(p['fylite:bit_error'] || 0) };
    });

    var fl = ((doc.magnetics || {}).flux_loop) || [];
    var loops = fl.map(function (l, i) {
      var p = (l.position || [])[0] || {};
      return [num(p.r, 'flux loop ' + i), num(p.z, 'flux loop ' + i)];
    });

    var g = doc['fylite:grid'];
    if (!g) fail('dev.no_grid');
    ['nr', 'nz', 'rmin', 'rmax', 'zmin', 'zmax'].forEach(function (k) {
      num(g[k], 'fylite:grid.' + k);
    });
    if (!(g.rmin < g.rmax && g.zmin < g.zmax)) fail('dev.grid_inverted');
    if (!(g.nr >= 17 && g.nz >= 17 && g.nr <= 257 && g.nz <= 257))
      fail('dev.grid_size', { nr: g.nr, nz: g.nz });

    var chans = doc['fylite:channel_map'];
    if (!Array.isArray(chans) || !chans.length)
      //: no channel map means one supply per coil, which is the common case
      chans = coils.map(function (_, i) { return [[i, 1]]; });
    chans.forEach(function (ch, i) {
      if (!Array.isArray(ch) || !ch.length) fail('dev.bad_channel', { i: i });
      ch.forEach(function (t) {
        if (!Array.isArray(t) || !(t[0] >= 0 && t[0] < coils.length))
          fail('dev.channel_range', { i: i, n: coils.length });
      });
    });

    var tf = doc.tf || {};
    var m = {
      id: String(doc['fylite:device_id'] || 'imported'),
      name: String(doc.name || doc['fylite:device_id'] || 'imported'),
      grid: { nr: g.nr | 0, nz: g.nz | 0, rmin: +g.rmin, rmax: +g.rmax,
              zmin: +g.zmin, zmax: +g.zmax },
      tf: { r0: num(tf.r0, 'tf.r0'), b0: num(tf.b0, 'tf.b0') },
      coils: coils, channels: chans, loops: loops,
      limiter: limiter, vessel: vessel, vesselOutline: vesselOutline,
    };
    if (probes.length) m.probes = probes;
    //: the sight lines travel as given — origin and theta, not endpoints
    if (doc['fylite:point']) m.point = doc['fylite:point'];
    if (doc['fylite:ui']) m.ui = doc['fylite:ui'];
    if (doc['fylite:vessel_resistivity_uohm_m'] !== undefined)
      m.vessel_resistivity_uohm_m =
        num(doc['fylite:vessel_resistivity_uohm_m'], 'vessel resistivity');
    if (doc['fylite:reference_discharge'])
      m.reference = doc['fylite:reference_discharge'];
    //: ★TIME SLICES ARE THE MACHINE'S DOCUMENT TOO, and they arrive whole:
    //: a slice carries its own coil currents, its own Ip and its own channel
    //: readings, because a "time series" that reused one slice's coils would
    //: be a series of one equilibrium redrawn.
    if (Array.isArray(doc['fylite:slices']) && doc['fylite:slices'].length)
      m.slices = doc['fylite:slices'];
    //: ★★ENGINEERING LIMITS (T-D5).  What the OH can swing, what each supply
    //: can hold in amperes and in volts, what each coil can take in force.
    //: Every field is OPTIONAL and NONE of them has a default: a machine
    //: that does not declare a limit has an UNKNOWN limit, and the pages
    //: must say so rather than judging a design against a number nobody
    //: supplied (`FR-PULSE-004`, which said it for the flux swing and is the
    //: rule for all of them).  What is NOT optional is that a declared value
    //: be a number — a limit spelled wrong must fail here rather than become
    //: a silent absence.
    var lim = doc['fylite:engineering_limits'];
    if (lim) {
      var out = {};
      if (lim.provenance) out.provenance = String(lim.provenance);
      if (lim.oh_flux_swing_Wb !== undefined)
        out.oh_flux_swing_Wb = num(lim.oh_flux_swing_Wb, 'oh_flux_swing_Wb');
      if (lim.per_channel !== undefined) {
        if (!Array.isArray(lim.per_channel)) fail('dev.limits_shape');
        out.per_channel = lim.per_channel.map(function (r, i) {
          var q = {};
          if (!r) return q;
          ['i_max_kAturn', 'v_max_V_per_turn', 'f_max_kN'].forEach(function (k) {
            if (r[k] !== undefined) q[k] = num(r[k], 'limits[' + i + '].' + k);
          });
          return q;
        });
      }
      m.limits = out;
    }
    //: ★LH launchers (T-M15).  Optional — most machines here declare none —
    //: but once an antenna IS declared every field of it is required: a
    //: launcher with a missing band would fall back to whatever the page
    //: happens to have in its markup, which is exactly the silent default
    //: this section exists to remove.
    var lh = (doc.lh_antennas || {}).antenna;
    if (Array.isArray(lh) && lh.length)
      m.lhAntennas = lh.map(function (a, i) {
        var what = 'lh_antennas.antenna[' + i + ']';
        var band = numArray(a['fylite:n_parallel'], what + '.n_parallel', 2);
        if (band.length !== 2)
          fail('dev.bad_array', { what: what + '.n_parallel', n: 2 });
        if (!(band[1] >= band[0]))
          fail('dev.bad_array', { what: what + '.n_parallel', n: 2 });
        return { name: String(a.name || ('LH' + (i + 1))),
                 frequency: num(a.frequency, what + '.frequency'),
                 maxPower: num(a['fylite:max_power'], what + '.max_power'),
                 nParallel: band };
      });
    if (fl.length && fl[0].name)
      m.loopNames = fl.map(function (l, i) { return l.name || ('FL' + (i + 1)); });

    // The limiter has to sit inside the grid: outside it there is nowhere to
    // put a plasma, and the kernel's only complaint would be an empty mask.
    var rr = m.limiter.r, zz = m.limiter.z;
    for (var i = 0; i < rr.length; i++)
      if (rr[i] < m.grid.rmin || rr[i] > m.grid.rmax ||
          zz[i] < m.grid.zmin || zz[i] > m.grid.zmax)
        fail('dev.limiter_outside', { i: i });
    return m;
  }

  root.FyoDevice = { toFyo: toFyo, fromFyo: fromFyo, TYPE: TYPE };
})(typeof self !== 'undefined' ? self : globalThis);
