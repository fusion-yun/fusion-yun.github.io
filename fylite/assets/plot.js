// Minimal canvas plotting for the fylite web apps: a poloidal
// cross-section view and a generic XY line plot.  No external libraries —
// the pages are served as plain static files.

(function (root) {
  'use strict';

  function css(el, name) {
    return getComputedStyle(el).getPropertyValue(name).trim();
  }

  /** Device-pixel-ratio aware canvas setup; returns the 2-D context. */
  function prepare(canvas) {
    var dpr = self.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width)),
        h = Math.max(1, Math.round(rect.height));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function palette(el) {
    return {
      fg: css(el, '--fg') || '#222',
      muted: css(el, '--muted') || '#888',
      grid: css(el, '--grid') || '#ddd',
      wall: css(el, '--wall') || '#666',
      coil: css(el, '--coil') || '#b07',
      flux: css(el, '--flux') || '#89a',
      lcfs: css(el, '--lcfs') || '#c33',
      alt: css(el, '--alt') || '#2a7',
      accent: css(el, '--accent') || '#06c',
      bg: css(el, '--panel') || '#fff',
    };
  }

  // --- poloidal cross-section ----------------------------------------------

  /**
   * opts: {machine, grid, psi, psiAxis, psiBnd, lcfs, target, reference,
   *        axis, xpoint, loops, loopColor, nLevels, caption}
   */
  function poloidal(canvas, o) {
    var p = prepare(canvas), ctx = p.ctx, col = palette(canvas);
    var M = o.machine;
    var pad = { l: 42, r: 12, t: 10, b: 30 };
    var view = o.view || M.grid;
    var rmin = view.rmin, rmax = view.rmax,
        zmin = view.zmin, zmax = view.zmax;
    var aw = p.w - pad.l - pad.r, ah = p.h - pad.t - pad.b;
    // keep the aspect ratio true — a tokamak cross-section that is not
    // isometric misreads elongation, the quantity these pages are about
    var s = Math.min(aw / (rmax - rmin), ah / (zmax - zmin));
    var ox = pad.l + (aw - s * (rmax - rmin)) / 2,
        oy = pad.t + (ah - s * (zmax - zmin)) / 2;
    var X = function (r) { return ox + (r - rmin) * s; };
    var Y = function (z) { return oy + (zmax - z) * s; };

    ctx.fillStyle = col.bg;
    ctx.fillRect(0, 0, p.w, p.h);

    // frame + ticks
    ctx.strokeStyle = col.grid; ctx.lineWidth = 1;
    ctx.strokeRect(X(rmin), Y(zmax), s * (rmax - rmin), s * (zmax - zmin));
    if (view !== M.grid) {
      // the computational box, when it is not the whole picture
      ctx.setLineDash([2, 4]);
      ctx.strokeRect(X(M.grid.rmin), Y(M.grid.zmax),
                     s * (M.grid.rmax - M.grid.rmin),
                     s * (M.grid.zmax - M.grid.zmin));
      ctx.setLineDash([]);
    }
    ctx.fillStyle = col.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var rstep = (rmax - rmin) > 2.2 ? 0.5 : 0.4,
        zstep = (zmax - zmin) > 3.2 ? 1.0 : 0.5;
    for (var r = Math.ceil(rmin / rstep) * rstep; r <= rmax; r += rstep) {
      ctx.fillText(r.toFixed(1), X(r), Y(zmin) + 5);
      ctx.beginPath(); ctx.moveTo(X(r), Y(zmin)); ctx.lineTo(X(r), Y(zmin) - 4);
      ctx.stroke();
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var z = Math.ceil(zmin / zstep) * zstep; z <= zmax; z += zstep) {
      ctx.fillText(z.toFixed(1), X(rmin) - 6, Y(z));
      ctx.beginPath(); ctx.moveTo(X(rmin), Y(z)); ctx.lineTo(X(rmin) + 4, Y(z));
      ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('R [m]', (X(rmin) + X(rmax)) / 2, p.h - 14);

    // normalized-flux fill, painted first so everything else sits on top
    if (o.fill) fillNormalizedFlux(ctx, o, X, Y, rmin, rmax, zmin, zmax, col);

    // vessel elements
    if (M.vessel) {
      ctx.fillStyle = col.wall;
      ctx.globalAlpha = 0.45;
      M.vessel.forEach(function (v) {
        ctx.fillRect(X(v.r - v.w / 2), Y(v.z + v.h / 2),
                     Math.max(1.5, s * v.w), Math.max(1.5, s * v.h));
      });
      ctx.globalAlpha = 1;
    }
    // PF coils (only those inside the drawn box get a label)
    ctx.strokeStyle = col.coil; ctx.lineWidth = 1.2;
    ctx.fillStyle = col.coil;
    M.coils.forEach(function (c, k2) {
      var x0 = X(c.r - c.w / 2), y0 = Y(c.z + c.h / 2);
      if (x0 + s * c.w < X(rmin) || x0 > X(rmax)) return;
      ctx.globalAlpha = 0.25;
      ctx.fillRect(x0, y0, s * c.w, s * c.h);
      ctx.globalAlpha = 1;
      ctx.strokeRect(x0, y0, s * c.w, s * c.h);
      if (!o.coilLabel) return;
      var txt = o.coilLabel(k2);
      if (!txt) return;
      var mid = 0.5 * (rmin + rmax), outward = c.r < mid ? -1 : 1;
      ctx.font = '10px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = outward < 0 ? 'right' : 'left';
      var lx = outward < 0 ? x0 - 4 : x0 + s * c.w + 4;
      var ly = Y(c.z), tw = ctx.measureText(txt).width;
      // a chip behind the text: the inboard labels share their column with
      // the Z tick labels, and unbacked text there is unreadable
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = col.bg;
      ctx.fillRect(outward < 0 ? lx - tw - 2 : lx - 2, ly - 6, tw + 4, 12);
      ctx.globalAlpha = 1;
      ctx.fillStyle = col.coil;
      ctx.fillText(txt, lx, ly);
    });

    // flux contours
    if (o.psi && o.nLevels) {
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = col.flux;
      var a = o.psiAxis, b = o.psiBnd;
      for (var k = 1; k <= o.nLevels; k++) {
        var lev = a + (b - a) * k / (o.nLevels + 1);
        drawSegs(ctx, FyPhys.contour(o.grid, o.psi, lev), X, Y);
      }
      // a few surfaces outside the boundary, dashed
      ctx.setLineDash([2, 3]);
      for (k = 1; k <= 4; k++) {
        drawSegs(ctx, FyPhys.contour(o.grid, o.psi, b - (a - b) * k * 0.25), X, Y);
      }
      ctx.setLineDash([]);
    }

    // limiter
    ctx.strokeStyle = col.wall; ctx.lineWidth = 1.6;
    ctx.beginPath();
    M.limiter.r.forEach(function (rr, i) {
      var fn = i ? 'lineTo' : 'moveTo';
      ctx[fn](X(rr), Y(M.limiter.z[i]));
    });
    ctx.closePath(); ctx.stroke();

    // reference / target outlines
    if (o.reference) {
      ctx.strokeStyle = col.alt; ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 3]);
      polyline(ctx, o.reference, X, Y, true);
      ctx.setLineDash([]);
    }
    if (o.target) {
      ctx.strokeStyle = col.accent; ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 4]);
      polyline(ctx, o.target, X, Y, true);
      ctx.setLineDash([]);
    }
    // last closed flux surface
    if (o.lcfs && o.lcfs.length) {
      ctx.strokeStyle = col.lcfs; ctx.lineWidth = 2;
      polyline(ctx, o.lcfs, X, Y, true);
    }
    // flux loops, drawn as squares: filled = fitted, hollow = weight zero
    if (o.loops) {
      ctx.lineWidth = 1.2;
      o.loops.forEach(function (l, i) {
        var s2 = 3, cx = X(l[0]), cy = Y(l[1]);
        var c = o.loopColor ? o.loopColor(i) : col.muted;
        var used = o.loopUsed ? o.loopUsed(i) : true;
        if (used) { ctx.fillStyle = c; ctx.fillRect(cx - s2, cy - s2, 2 * s2, 2 * s2); }
        else { ctx.strokeStyle = c; ctx.strokeRect(cx - s2, cy - s2, 2 * s2, 2 * s2); }
      });
    }
    // axis + X point
    if (o.axis) marker(ctx, X(o.axis[0]), Y(o.axis[1]), col.fg, '+');
    if (o.xpoint && isFinite(o.xpoint[0]))
      marker(ctx, X(o.xpoint[0]), Y(o.xpoint[1]), col.lcfs, 'x');

    if (o.caption) {
      ctx.fillStyle = col.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(o.caption, X(rmin) + 6, Y(zmax) + 6);
    }
    // draggable handles, drawn last so they sit above everything
    if (o.handles) o.handles.forEach(function (h) {
      drawHandle(ctx, X(h.r), Y(h.z), h.kind, h.color || col.accent, col);
    });

    if (o.legend && o.legend.length) {
      // anchoring to the view corner collides with the outer coils' current
      // labels in the wide device view, so callers may anchor it elsewhere
      var la = o.legendAnchor;
      drawLegend(ctx, o.legend, la ? X(la.r) : X(rmax), la ? Y(la.z) : Y(zmax),
                 col);
    }

    // the page needs to turn pointer positions back into (R, Z) — publish
    // the transform rather than have callers re-derive the letterboxing
    canvas.__fyView = {
      X: X, Y: Y,
      rOf: function (px) { return rmin + (px - ox) / s; },
      zOf: function (py) { return zmax - (py - oy) / s; },
      rmin: rmin, rmax: rmax, zmin: zmin, zmax: zmax, scale: s,
    };
  }

  /** A grab handle: ring plus glyph, sized to be an obvious pointer target. */
  function drawHandle(ctx, x, y, kind, color, col) {
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, 2 * Math.PI);
    ctx.fillStyle = col.bg; ctx.globalAlpha = 0.75; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke();
    marker(ctx, x, y, color, kind === 'x' ? 'x' : '+');
  }

  /** Small legend box anchored to the top-right of the plot frame. */
  function drawLegend(ctx, items, right, top, col) {
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    var wLab = 0;
    items.forEach(function (it) {
      wLab = Math.max(wLab, ctx.measureText(it.label).width);
    });
    var pad = 6, sw = 20, bw = pad * 2 + sw + 6 + wLab, bh = items.length * 15 + 8;
    var bx = right - bw - 6, by = top + 6;
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = col.bg;
    ctx.fillRect(bx, by, bw, bh);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col.grid; ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
    var y = by + 11;
    items.forEach(function (it) {
      var x = bx + pad;
      ctx.strokeStyle = it.color; ctx.fillStyle = it.color;
      ctx.lineWidth = it.width || 2;
      if (it.kind === 'square') {
        if (it.hollow) ctx.strokeRect(x + sw / 2 - 3, y - 3, 6, 6);
        else ctx.fillRect(x + sw / 2 - 3, y - 3, 6, 6);
      } else if (it.kind === 'plus' || it.kind === 'x') {
        marker(ctx, x + sw / 2, y, it.color, it.kind === 'plus' ? '+' : 'x');
      } else {
        ctx.setLineDash(it.dash || []);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sw, y); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = col.fg;
      ctx.fillText(it.label, x + sw + 6, y);
      y += 15;
    });
  }

  /**
   * Perceptually ordered colormap for normalized flux, sampled from the
   * viridis control points.  t = 0 at the axis, 1 at the boundary.
   */
  var VIRIDIS = [
    [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142],
    [38, 130, 142], [31, 158, 137], [53, 183, 121], [109, 205, 89],
    [180, 222, 44], [253, 231, 37],
  ];
  function colormap(t) {
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var u = t * (VIRIDIS.length - 1), i = Math.min(VIRIDIS.length - 2, u | 0);
    var f = u - i, a = VIRIDIS[i], b = VIRIDIS[i + 1];
    return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]),
            a[2] + f * (b[2] - a[2])];
  }

  /**
   * Paint normalized flux over the vessel interior.  `o.fill` carries
   * {psi, psiAxis, psiBnd, max} — `max` is how far past the boundary to
   * keep painting (1 = stop at the boundary).  Rendered per screen pixel
   * through an ImageData, which is both simpler and sharper than banding
   * it into filled contours.
   */
  function fillNormalizedFlux(ctx, o, X, Y, rmin, rmax, zmin, zmax, col) {
    var f = o.fill, grid = o.grid;
    if (!f.psi || !grid) return;
    var x0 = Math.floor(X(rmin)), x1 = Math.ceil(X(rmax));
    var y0 = Math.floor(Y(zmax)), y1 = Math.ceil(Y(zmin));
    var w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    var img = ctx.createImageData(w, h), d = img.data;
    var span = f.psiBnd - f.psiAxis, top = f.max === undefined ? 1 : f.max;
    var lr = o.machine.limiter.r, lz = o.machine.limiter.z;
    for (var py = 0; py < h; py++) {
      var z = zmax - (py + 0.5) * (zmax - zmin) / h;
      for (var px = 0; px < w; px++) {
        var r = rmin + (px + 0.5) * (rmax - rmin) / w;
        var k = 4 * (py * w + px);
        if (!FyPhys.insidePolygon(r, z, lr, lz)) continue;
        var v = FyPhys.sample(grid, f.psi, r, z);
        if (!isFinite(v)) continue;
        var t = (v - f.psiAxis) / span;
        if (t < 0 || t > top) continue;
        var c = colormap(t / top);
        d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2];
        d[k + 3] = 205;
      }
    }
    ctx.putImageData(img, x0, y0);
  }

  /** Vertical colour scale for the normalized-flux fill. */
  function colorbar(canvas, o) {
    var p = prepare(canvas), ctx = p.ctx, col = palette(canvas);
    ctx.fillStyle = col.bg; ctx.fillRect(0, 0, p.w, p.h);
    var barW = 16, top = 12, bot = p.h - 18, x = 6;
    for (var y = top; y < bot; y++) {
      var t = 1 - (y - top) / (bot - top);      // 0 at the BOTTOM = axis
      var c = colormap(t);
      ctx.fillStyle = 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
      ctx.fillRect(x, y, barW, 1);
    }
    ctx.strokeStyle = col.grid; ctx.lineWidth = 1;
    ctx.strokeRect(x, top, barW, bot - top);
    ctx.fillStyle = col.muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (var k = 0; k <= 5; k++) {
      var v = k / 5, yy = bot - v * (bot - top);
      ctx.fillText(v.toFixed(1), x + barW + 4, yy);
    }
    ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
    ctx.fillText('ψ̄', x, top - 2);
    void o;
  }

  function drawSegs(ctx, segs, X, Y) {
    ctx.beginPath();
    for (var i = 0; i < segs.length; i += 4) {
      ctx.moveTo(X(segs[i]), Y(segs[i + 1]));
      ctx.lineTo(X(segs[i + 2]), Y(segs[i + 3]));
    }
    ctx.stroke();
  }

  function polyline(ctx, flat, X, Y, close) {
    if (!flat.length) return;
    ctx.beginPath();
    for (var i = 0; i < flat.length; i += 2) {
      var fn = i ? 'lineTo' : 'moveTo';
      ctx[fn](X(flat[i]), Y(flat[i + 1]));
    }
    if (close) ctx.closePath();
    ctx.stroke();
  }

  function marker(ctx, x, y, color, kind) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (kind === '+') {
      ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y);
      ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5);
    } else {
      ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4);
      ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4);
    }
    ctx.stroke();
  }

  // --- XY line plot ---------------------------------------------------------

  /**
   * opts: {series: [{x, y, color, dash, label, kind:'line'|'dots'|'bars'}],
   *        xlabel, ylabel, ymin, ymax, xmin, xmax, zeroLine}
   */
  function xy(canvas, o) {
    var p = prepare(canvas), ctx = p.ctx, col = palette(canvas);
    var pad = { l: 54, r: 10, t: 12, b: 30 };
    var xmin = o.xmin, xmax = o.xmax, ymin = o.ymin, ymax = o.ymax;
    o.series.forEach(function (s) {
      for (var i = 0; i < s.x.length; i++) {
        if (!isFinite(s.x[i]) || !isFinite(s.y[i])) continue;
        if (xmin === undefined || s.x[i] < xmin) xmin = s.x[i];
        if (xmax === undefined || s.x[i] > xmax) xmax = s.x[i];
        if (ymin === undefined || s.y[i] < ymin) ymin = s.y[i];
        if (ymax === undefined || s.y[i] > ymax) ymax = s.y[i];
      }
    });
    if (!(xmax > xmin)) { xmin -= 1; xmax += 1; }
    if (!(ymax > ymin)) { ymin -= 1; ymax += 1; }
    var m = 0.06 * (ymax - ymin);
    ymin -= m; ymax += m;
    var X = function (v) { return pad.l + (v - xmin) / (xmax - xmin) * (p.w - pad.l - pad.r); };
    var Y = function (v) { return p.h - pad.b - (v - ymin) / (ymax - ymin) * (p.h - pad.t - pad.b); };

    ctx.fillStyle = col.bg; ctx.fillRect(0, 0, p.w, p.h);
    ctx.strokeStyle = col.grid; ctx.lineWidth = 1;
    ctx.strokeRect(pad.l, pad.t, p.w - pad.l - pad.r, p.h - pad.t - pad.b);
    ctx.fillStyle = col.muted; ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (var k = 0; k <= 4; k++) {
      var xv = xmin + (xmax - xmin) * k / 4;
      ctx.fillText(fmt(xv), X(xv), p.h - pad.b + 5);
      if (k && k < 4) {
        ctx.beginPath(); ctx.moveTo(X(xv), pad.t); ctx.lineTo(X(xv), p.h - pad.b);
        ctx.globalAlpha = 0.4; ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (k = 0; k <= 4; k++) {
      var yv = ymin + (ymax - ymin) * k / 4;
      ctx.fillText(fmt(yv), pad.l - 6, Y(yv));
      if (k && k < 4) {
        ctx.beginPath(); ctx.moveTo(pad.l, Y(yv)); ctx.lineTo(p.w - pad.r, Y(yv));
        ctx.globalAlpha = 0.4; ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
    if (o.zeroLine && ymin < 0 && ymax > 0) {
      ctx.strokeStyle = col.muted; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(p.w - pad.r, Y(0));
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (o.xlabel) {
      ctx.fillStyle = col.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(o.xlabel, (pad.l + p.w - pad.r) / 2, p.h - 2);
    }
    if (o.ylabel) {
      ctx.save(); ctx.translate(11, (pad.t + p.h - pad.b) / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(o.ylabel, 0, 0); ctx.restore();
    }

    o.series.forEach(function (s) {
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
      ctx.lineWidth = s.width || 1.8;
      ctx.setLineDash(s.dash || []);
      if (s.kind === 'dots') {
        for (var i = 0; i < s.x.length; i++) {
          if (!isFinite(s.y[i])) continue;
          ctx.beginPath();
          ctx.arc(X(s.x[i]), Y(s.y[i]), s.radius || 3, 0, 2 * Math.PI);
          ctx.fill();
        }
      } else if (s.kind === 'bars') {
        var bw = Math.max(2, (p.w - pad.l - pad.r) / (s.x.length * 1.7));
        for (i = 0; i < s.x.length; i++) {
          if (!isFinite(s.y[i])) continue;
          var y0 = Y(Math.max(0, Math.min(ymax, 0))), y1 = Y(s.y[i]);
          ctx.fillRect(X(s.x[i]) - bw / 2, Math.min(y0, y1), bw, Math.abs(y1 - y0));
        }
      } else {
        ctx.beginPath();
        var started = false;
        for (i = 0; i < s.x.length; i++) {
          if (!isFinite(s.y[i])) { started = false; continue; }
          if (!started) { ctx.moveTo(X(s.x[i]), Y(s.y[i])); started = true; }
          else ctx.lineTo(X(s.x[i]), Y(s.y[i]));
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    });

    // legend
    var labels = o.series.filter(function (s) { return s.label; });
    if (labels.length) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = '11px system-ui, sans-serif';
      var bw = 0;
      labels.forEach(function (s) {
        bw = Math.max(bw, ctx.measureText(s.label).width);
      });
      var bx = p.w - pad.r - 34 - bw, by = pad.t + 3;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = col.bg;
      ctx.fillRect(bx - 5, by, bw + 38, labels.length * 15 + 8);
      ctx.globalAlpha = 1;
      var y = pad.t + 10;
      labels.forEach(function (s) {
        ctx.strokeStyle = s.color; ctx.lineWidth = 2.4;
        ctx.setLineDash(s.dash || []);
        ctx.beginPath();
        ctx.moveTo(bx, y); ctx.lineTo(bx + 22, y);
        ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = col.fg;
        ctx.fillText(s.label, bx + 28, y);
        y += 15;
      });
    }
  }

  function fmt(v) {
    var a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 1e4 || a < 1e-3) return v.toExponential(1);
    if (a >= 100) return v.toFixed(0);
    if (a >= 10) return v.toFixed(1);
    if (a >= 1) return v.toFixed(2);
    return v.toFixed(3);
  }

  /** A view box that encloses the whole machine, not just the grid. */
  function deviceView(M, margin) {
    var m = margin === undefined ? 0.1 : margin;
    var b = { rmin: M.grid.rmin, rmax: M.grid.rmax,
              zmin: M.grid.zmin, zmax: M.grid.zmax };
    M.coils.forEach(function (c) {
      b.rmin = Math.min(b.rmin, c.r - c.w / 2);
      b.rmax = Math.max(b.rmax, c.r + c.w / 2);
      b.zmin = Math.min(b.zmin, c.z - c.h / 2);
      b.zmax = Math.max(b.zmax, c.z + c.h / 2);
    });
    return { rmin: Math.max(0.02, b.rmin - m), rmax: b.rmax + m,
             zmin: b.zmin - m, zmax: b.zmax + m };
  }

  root.FyPlot = { poloidal: poloidal, xy: xy, palette: palette,
                  prepare: prepare, deviceView: deviceView,
                  colorbar: colorbar, colormap: colormap };
})(typeof self !== 'undefined' ? self : globalThis);
