// 「直接从 MDSplus 读」 — the reconstruction bar's live data source.
//
// ★WHAT THIS CLOSES.  The analysis page could reconstruct exactly two things:
// the one discharge bundled with the EAST deck (#137985 @ 4.0 s) and a
// synthetic twin.  Every other shot had to be fetched by hand, reduced by a
// Python tool and imported as a file.  This reads one shot's magnetics off the
// institute's MDSplus server and hands them to the bar, so the page can fit an
// equilibrium to a discharge that ran this morning.
//
// ★IT IS EAST-ONLY, AND IT SAYS SO RATHER THAN VANISHING.  `\EFIT_EAST::TOP…`
// is one machine's tree; there is no generic version of it to write.  On any
// other device the panel is still drawn and still explains itself — it is just
// disabled, with the reason in the note.  A control that disappears teaches
// the reader nothing; a control that is greyed out with a sentence teaches
// them which machine this is for.
//
// ★IT IS A SEPARATE FILE for the same reason `mds-catalog.js` is: it needs a
// gateway process (a browser cannot open a socket — FYL-DESIGN-06 §1), and the
// page must keep working with neither the gateway nor this file present.
//
// ★★AND IT NEVER PRETENDS THE NUMBERS ARE THE SHIPPED ONES.  What comes back
// is EFIT's own input record at the stored slice NEAREST the time asked for —
// not the est2 reduction the bundled reference discharge used, and not at
// exactly the requested instant.  The panel prints the slice it actually got,
// how many probe channels were absent, and how many passed the live-channel
// gate, every time.  Measured on #137985: the shipped deck (est2 at 4.000 s)
// and this record (EFIT's slice at 4.041 s) differ by 2.3 % on the loops and
// 5.4 % on one coil — a 41 ms offset on a ramp, which is a fact about the two
// sources and not an error in either.

(function (root) {
  'use strict';

  var T = function (k, p) { return root.FyI18n.t(k, p); };
  var $ = function (id) { return document.getElementById(id); };

  //: ★`tried` is keyed by SHOT and slice index, and it is not cleared when
  //: the reader moves to another shot and back: "which slices of #165704 fit"
  //: is a fact about that discharge, and a reader comparing two shots should
  //: not lose the first one's verdicts by looking at the second.
  var state = { gw: null, busy: false, last: null,
                times: [], at: -1, shot: null, tried: {}, hover: -1 };

  function key(shot, i) { return String(shot) + '@' + i; }

  function mount() {
    var host = document.getElementById('reconstruction-mds-host');
    if (!host) return null;
    host.innerHTML =
      '<div data-part="reconstruction" class="panel">' +
      '<h2 data-i18n="mdssrc">直接从 MDSplus 读</h2>' +
      '<p class="note" data-i18n="mdssrc.what"></p>' +
      //: ★★服务器地址：画出来，宿主锁住时禁用并写明原因。规则不是这一页新
      //: 立的——它就是 `pages/data.html` 那一条：网关绑回环时开放、非回环时只
      //: 认启动时点名的那几台；单文件查看器一律锁（它从不接受 `server=`）。
      //: 一个消失的控件什么也没教给读者，而「为什么不能改」正是读者要知道的。
      '<div class="mds-row">' +
      '<div class="ctl" style="flex:1 1 190px">' +
      '<label for="reconstruction-mds-server" data-i18n="mdssrc.server">mdsip 服务器</label>' +
      //: ★预填隧道口地址：站点自己的 mdsip 地址在装置内网上，不写进公开页面
      //: （2026-09-02）；这一格本来就是**锁着的**，真值由宿主启动时给
      //: （`fy --mdsip <地址>`），这里只是让读者看见它长什么样。
      '<input type="text" id="reconstruction-mds-server" size="18"' +
      ' value="127.0.0.1:8000" disabled></div>' +
      '</div>' +
      '<p class="note" id="reconstruction-mds-server-note"></p>' +
      '<div class="mds-row">' +
      '<div class="ctl"><label for="reconstruction-mds-shot" data-i18n="mdssrc.shot">炮号</label>' +
      '<input type="text" id="reconstruction-mds-shot" inputmode="numeric" size="9"></div>' +
      '<div class="ctl"><label for="reconstruction-mds-time" data-i18n="mdssrc.time">时刻 [s]</label>' +
      '<input type="text" id="reconstruction-mds-time" inputmode="decimal" size="6" value="4.0"></div>' +
      '<button id="reconstruction-mds-read" class="ghost" data-i18n="mdssrc.read">读取</button>' +
      '</div>' +
      '<p class="note" id="reconstruction-mds-note"></p>' +
      //: ★★THE SHOT'S OWN SLICE TABLE (T-A21).  The endpoint already answers
      //: with `times` — every instant this shot has a stored record at — and
      //: without drawing it the reader's only way to try another slice is to
      //: retype a number and press the button again.  It is a CONTROL, so it
      //: is a strip rather than a figure: click a mark, read that slice.
      '<canvas id="reconstruction-mds-slices" class="strip" hidden></canvas>' +
      '<p class="note" id="reconstruction-mds-slices-note" hidden></p>' +
      '<p class="note" id="reconstruction-mds-hover" hidden></p>' +
      '</div>';
    return host;
  }

  function note(key, params, cls) {
    var e = $('reconstruction-mds-note');
    if (!e) return;
    e.innerHTML = key ? T(key, params) : '';
    e.className = 'note' + (cls ? ' ' + cls : '');
  }

  // --- the stored-slice picker (T-A21) -------------------------------------
  //
  // ★What it draws is the SHOT's own table of stored instants, one mark each,
  // and what it colours is this session's verdicts on them: converged, failed,
  // or not tried.  Measured on #165704 — 2.083 s converges, 3.933 s and
  // 5.968 s do not, on data that is complete in all three — so "which part of
  // this discharge can be reconstructed" is a real question about the shot,
  // and the answer belongs beside the slices rather than in the reader's head.

  /** Device-pixel-ratio aware setup; returns {ctx, w, h} or null. */
  function surface(cv) {
    var rect = cv.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
    var dpr = root.devicePixelRatio || 1;
    if (cv.width !== w * dpr || cv.height !== h * dpr) {
      cv.width = w * dpr; cv.height = h * dpr;
    }
    var ctx = cv.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  var PAD = 10;
  /** x of slice `i`, and the inverse. */
  function xOf(i, w) {
    var n = state.times.length;
    return n < 2 ? w / 2 : PAD + (w - 2 * PAD) * (i / (n - 1));
  }
  function nearest(x, w) {
    var n = state.times.length;
    if (!n) return -1;
    if (n < 2) return 0;
    var f = (x - PAD) / (w - 2 * PAD);
    return Math.max(0, Math.min(n - 1, Math.round(f * (n - 1))));
  }

  function verdict(i) { return state.tried[key(state.shot, i)] || null; }

  function drawSlices() {
    var cv = $('reconstruction-mds-slices');
    if (!cv) return;
    var n = state.times.length;
    cv.hidden = !n;
    var sum = $('reconstruction-mds-slices-note');
    if (sum) sum.hidden = !n;
    if (!n) { if ($('reconstruction-mds-hover')) $('reconstruction-mds-hover').hidden = true; return; }
    var s = surface(cv);
    if (!s) return;
    var P = (root.FyPlot && root.FyPlot.palette) ? root.FyPlot.palette(cv)
          : { fg: '#222', muted: '#888', grid: '#ddd', alt: '#2a7',
              lcfs: '#c33', accent: '#06c' };
    var base = s.h - 16, top = 10;
    //: the axis, and a label at each end — a strip with no numbers on it is
    //: a picture of a shot rather than a table of instants
    s.ctx.strokeStyle = P.grid;
    s.ctx.lineWidth = 1;
    s.ctx.beginPath();
    s.ctx.moveTo(PAD, base + 0.5); s.ctx.lineTo(s.w - PAD, base + 0.5);
    s.ctx.stroke();
    s.ctx.fillStyle = P.muted;
    s.ctx.font = '11px system-ui, sans-serif';
    s.ctx.textBaseline = 'top';
    s.ctx.textAlign = 'left';
    s.ctx.fillText((+state.times[0]).toFixed(2) + ' s', PAD, base + 3);
    s.ctx.textAlign = 'right';
    s.ctx.fillText((+state.times[n - 1]).toFixed(2) + ' s', s.w - PAD, base + 3);
    //: every stored slice, then the tried ones over them, then the one that
    //: is loaded — drawn in that order so a verdict is never hidden by a tick
    for (var i = 0; i < n; i++) {
      var x = xOf(i, s.w) + 0.5;
      s.ctx.strokeStyle = P.grid;
      s.ctx.beginPath(); s.ctx.moveTo(x, base - 6); s.ctx.lineTo(x, base); s.ctx.stroke();
    }
    for (i = 0; i < n; i++) {
      var v = verdict(i);
      if (!v) continue;
      s.ctx.strokeStyle = v.ok ? P.alt : P.lcfs;
      s.ctx.lineWidth = 2;
      s.ctx.beginPath();
      s.ctx.moveTo(xOf(i, s.w) + 0.5, top); s.ctx.lineTo(xOf(i, s.w) + 0.5, base);
      s.ctx.stroke();
    }
    if (state.at >= 0 && state.at < n) {
      s.ctx.strokeStyle = P.accent;
      s.ctx.lineWidth = 2;
      s.ctx.beginPath();
      s.ctx.moveTo(xOf(state.at, s.w) + 0.5, top - 4);
      s.ctx.lineTo(xOf(state.at, s.w) + 0.5, base);
      s.ctx.stroke();
      s.ctx.fillStyle = P.accent;
      s.ctx.beginPath();
      s.ctx.arc(xOf(state.at, s.w) + 0.5, top - 4, 3, 0, 2 * Math.PI);
      s.ctx.fill();
    }
    if (sum) {
      var okN = 0, badN = 0;
      Object.keys(state.tried).forEach(function (k) {
        if (k.indexOf(String(state.shot) + '@') !== 0) return;
        if (state.tried[k].ok) okN += 1; else badN += 1;
      });
      sum.innerHTML = T('mdssrc.slices', { n: n, shot: state.shot,
                                           ok: okN, bad: badN });
    }
  }

  /** The line under the strip: what is at the mark the pointer is on. */
  function hoverAt(i) {
    var e = $('reconstruction-mds-hover');
    if (!e) return;
    if (i < 0 || i >= state.times.length) { e.hidden = true; return; }
    var v = verdict(i);
    e.hidden = false;
    e.innerHTML = T(v ? (v.ok ? 'mdssrc.slice.ok' : 'mdssrc.slice.bad')
                      : 'mdssrc.slice.untried',
                    { i: i, t: (+state.times[i]).toFixed(3),
                      res: v && v.residual !== undefined
                           ? (+v.residual).toExponential(2) : '—',
                      chi2: v && v.chi2 !== undefined
                            ? (+v.chi2).toExponential(2) : '—',
                      why: (v && v.why) || '' });
  }

  function pickAtX(clientX) {
    var cv = $('reconstruction-mds-slices');
    if (!cv || !state.times.length) return -1;
    var r = cv.getBoundingClientRect();
    return nearest(clientX - r.left, r.width);
  }

  function enable(on) {
    ['reconstruction-mds-shot', 'reconstruction-mds-time', 'reconstruction-mds-read']
      .forEach(function (id) { if ($(id)) $(id).disabled = !on; });
  }

  /**
   * The gateway is one directory up: this page is `pages/analysis.html` and
   * the gateway serves the whole of `app/`.  Relative and same-origin, like
   * every other request the site makes — there is no box to type a gateway
   * address into, which is the shape of hole that would be.
   */
  function api(path, params) {
    var q = new URLSearchParams(params || {}).toString();
    return fetch('../' + path + (q ? '?' + q : ''), { headers: { accept: 'application/json' } })
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(j && j.error || ('HTTP ' + r.status));
          return j;
        }, function () { throw new Error('HTTP ' + r.status); });
      });
  }

  function read(atTime) {
    if (state.busy) return;
    if (atTime !== undefined && $('reconstruction-mds-time'))
      $('reconstruction-mds-time').value = (+atTime).toFixed(3);
    var api_ = root.FyRecon;
    if (!api_) { note('mdssrc.nobar', null, 'warn'); return; }
    var shot = ($('reconstruction-mds-shot').value || '').trim();
    var time = ($('reconstruction-mds-time').value || '').trim();
    if (!/^\d{1,9}$/.test(shot)) { note('mdssrc.badshot', null, 'warn'); return; }
    if (!/^-?\d{1,5}(\.\d{1,6})?$/.test(time)) { note('mdssrc.badtime', null, 'warn'); return; }

    state.busy = true;
    enable(false);
    note('mdssrc.reading', { shot: shot, t: time });
    //: ★only when the host said it would accept one — otherwise the
    //: parameter is refused before a socket is opened and the reader gets a
    //: 400 for having typed in a box this page drew.
    var q = { shot: shot, time: time };
    var box = $('reconstruction-mds-server');
    //: ★宿主开着这一格时就把它送过去——包括宿主启动时**根本没给**服务器的
    //: 情形，那正是读者填这一格的理由。相同则不送，省得答复里的出处看起来
    //: 像是页面挑的。
    if (box && !box.disabled && box.value.trim() && state.gw && !state.gw.locked
        && box.value.trim() !== state.gw.mdsip) q.server = box.value.trim();
    if (box && !box.disabled && !box.value.trim() && state.gw && !state.gw.mdsip) {
      note('mdssrc.server.need', null, 'warn');
      state.busy = false; enable(true);
      return;
    }
    api('api/measurements', q).then(function (m) {
      var got;
      try { got = api_.useMeasurements(m); }
      catch (e) { note('mdssrc.refused', { why: e.message }, 'warn'); return; }
      state.last = m;
      //: ★the shot's own table of stored instants, kept for the picker.  A
      //: NEW shot resets which slice is current but NOT the verdicts: those
      //: are keyed by shot, so coming back to one shows what was already
      //: learned about it.
      state.times = Array.isArray(m.times) ? m.times.slice() : [];
      state.shot = m.shot;
      state.at = m.slice_index;
      drawSlices();
      //: ★Everything the reader needs in order to distrust this correctly, in
      //: one sentence: which slice they actually got (not the one they asked
      //: for), how many probe channels the tree simply does not have, and how
      //: many of the ones it does have are alive by the gate.
      note('mdssrc.got', {
        shot: m.shot, want: (+m.time_requested).toFixed(3),
        t: (+m.time_s).toFixed(3), i: m.slice_index, n: m.slices,
        loops: got.loops, probes: got.probes, padded: got.padded,
        live: got.live, ip: (m.ip / 1e3).toFixed(1),
        btor: m.bcentr === null ? T('mdssrc.btor.deck') : (+m.bcentr).toFixed(3),
      });
    }, function (e) {
      note('mdssrc.failed', { why: e.message }, 'warn');
    }).then(function () { state.busy = false; enable(true); });
  }

  function boot() {
    if (!mount()) return;
    root.FyI18n.applyDom(document.getElementById('reconstruction-mds-host'));
    $('reconstruction-mds-read').addEventListener('click', function () { read(); });
    var strip = $('reconstruction-mds-slices');
    if (strip) {
      //: ★one click = one slice.  The reader's alternative was to retype a
      //: number, which is the whole of T-A21.
      strip.addEventListener('click', function (e) {
        var i = pickAtX(e.clientX);
        if (i >= 0) read(state.times[i]);
      });
      strip.addEventListener('mousemove', function (e) {
        var i = pickAtX(e.clientX);
        if (i !== state.hover) { state.hover = i; hoverAt(i); }
      });
      strip.addEventListener('mouseleave', function () {
        state.hover = -1; hoverAt(-1);
      });
      //: ★★DRAG, and it SNAPS.  A slider is what a reader reaches for on a
      //: time axis, and this one can be dragged — but only onto the instants
      //: the server actually stored.  A continuous slider would say the
      //: record can be asked for any time between them, and it cannot:
      //: `/api/measurements` answers with the NEAREST stored slice and says
      //: so, and 112 of them across ten seconds is not a curve.
      //: ★It reads on release rather than on every move: one drag across the
      //: strip would otherwise be a hundred reads through a tunnel.
      var dragging = false;
      strip.addEventListener('pointerdown', function (e) {
        dragging = true;
        strip.setPointerCapture && strip.setPointerCapture(e.pointerId);
        var i = pickAtX(e.clientX);
        if (i !== state.hover) { state.hover = i; hoverAt(i); }
      });
      strip.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var i = pickAtX(e.clientX);
        if (i !== state.hover) { state.hover = i; hoverAt(i); }
      });
      strip.addEventListener('pointerup', function (e) {
        if (!dragging) return;
        dragging = false;
        var i = pickAtX(e.clientX);
        if (i >= 0) read(state.times[i]);
      });
      //: ★★and the KEYBOARD, because a strip that only answers to a mouse is
      //: a control half the readers cannot use.  Arrow keys step one stored
      //: slice; Home/End go to the ends.  Stepping MOVES the cursor and
      //: reading is Enter — so holding an arrow does not fire a read per
      //: slice down a tunnel.
      strip.tabIndex = 0;
      strip.addEventListener('keydown', function (e) {
        var n = state.times.length;
        if (!n) return;
        var at = state.hover >= 0 ? state.hover
               : (state.at >= 0 ? state.at : 0);
        var to = at;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') to = at - 1;
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') to = at + 1;
        else if (e.key === 'Home') to = 0;
        else if (e.key === 'End') to = n - 1;
        else if (e.key === 'Enter' || e.key === ' ') {
          if (at >= 0 && at < n) { e.preventDefault(); read(state.times[at]); }
          return;
        } else return;
        e.preventDefault();
        to = Math.max(0, Math.min(n - 1, to));
        if (to !== state.hover) { state.hover = to; hoverAt(to); }
      });
      //: the strip is sized in CSS, so it has to be redrawn when the box
      //: changes width — otherwise the marks stay where they were laid out
      root.addEventListener('resize', drawSlices);
    }
    //: ★★the verdicts come from the bar that owns them (T-A21): converged
    //: with its residual, or failed with the reason the kernel gave.
    if (root.FyRecon && root.FyRecon.onOutcome)
      root.FyRecon.onOutcome(function (ev) {
        if (!ev || ev.shot === undefined) return;
        state.tried[key(ev.shot, ev.index)] = {
          ok: !!ev.ok, why: ev.why, residual: ev.residual, chi2: ev.chi2,
          iterations: ev.iterations, time: ev.time };
        drawSlices();
        if (state.hover >= 0) hoverAt(state.hover);
      });
    $('reconstruction-mds-shot').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') read();
    });
    root.FyI18n.onChange(function () {
      root.FyI18n.applyDom(document.getElementById('reconstruction-mds-host'));
      drawSlices();
      if (state.hover >= 0) hoverAt(state.hover);
    });

    var dev = root.FyRecon && root.FyRecon.device();
    //: ★The machine is fixed for the life of the page — switching devices
    //: reloads it (`devices.js` `select()`), so this is decided once and
    //: cannot go stale.
    if (!dev || dev.id !== 'east') {
      enable(false);
      note('mdssrc.notEast', { device: (dev && dev.name) || '—' }, 'warn');
      return;
    }
    if (dev.shot) $('reconstruction-mds-shot').value = dev.shot;
    enable(false);
    note('mdssrc.probing');
    api('api/health').then(function (h) {
      state.gw = h;
      enable(true);
      showServer(h);
      note('mdssrc.ready', { server: h.mdsip });
    }, function () {
      //: ★A missing gateway is a REDUCED page, not a broken one: the bundled
      //: discharge and the synthetic twin are untouched.  Saying which is
      //: which is the difference between a reader starting a process and a
      //: reader concluding the server is down.
      enable(false);
      note('mdssrc.nogateway', null, 'warn');
    });
  }

  /**
   * The server box, filled from what the HOST says about itself.
   *
   * ★It is `h.locked` that decides, not this page's preference: off a
   * loopback bind the gateway closes the set there, and the single-file
   * viewer never accepts `server=` at all.  A box that let a reader type an
   * address only to collect a 400 would be describing a permission the page
   * does not have — the same rule `pages/data.html` already follows.
   */
  function showServer(h) {
    var box = $('reconstruction-mds-server');
    if (!box) return;
    //: 同 `pages/data.html`：宿主有就照宿主的，没有就留标记里的起点
    if (h && h.mdsip) box.value = h.mdsip;
    //: ★只由宿主的 `locked` 决定，不再要求它已经有一台：宿主开着这一格而
    //: 自己没配服务器，是「你来填」，不是「不能用」。
    box.disabled = !h || !!h.locked;
    var el = $('reconstruction-mds-server-note');
    if (!el) return;
    if (!h || !h.mdsip) {
      el.innerHTML = T(h && !h.locked ? 'mdssrc.server.need'
                                      : 'mdssrc.server.none');
      return;
    }
    el.innerHTML = h.locked
      ? T('mdssrc.server.locked', { list: (h.servers || [h.mdsip]).join(', ') })
      : T('mdssrc.server.free');
  }

  //: ★Queued on the machines, not on the document.  `FyRecon` is created
  //: inside the reconstruction bar's own `whenDevices` callback, which runs
  //: only once the device documents have arrived; a `DOMContentLoaded` boot
  //: would look for a seam that does not exist yet.  This file is loaded
  //: AFTER `scenario-analysis.js`, and callbacks run in registration order,
  //: so the bar has registered by the time this runs.
  root.FyScenario.whenDevices(boot);
})(typeof self !== 'undefined' ? self : globalThis);
