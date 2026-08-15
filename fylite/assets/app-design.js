// Discharge-design page controller.
//
// The page owns the UI; every solve happens in worker.js, which owns the
// wasm instance.  Design runs are a sequence of solves, so the worker
// streams progress messages back between passes.

(function () {
  'use strict';

  var M = self.FYLITE_MACHINE, P = self.FyPhys;
  var worker = new Worker('assets/worker.js');
  var grid = null, state = null, referenceLcfs = null;
  var busy = false;

  var $ = function (id) { return document.getElementById(id); };
  var SLIDERS = ['a', 'kappa', 'du', 'dl', 'ip', 'beta0', 'emp',
                 'enp', 'gamma', 'passes'];
  var DIGITS = { a: 3, kappa: 2, du: 2, dl: 2, ip: 0, beta0: 2,
                 emp: 2, enp: 2, gamma: 2, passes: 0 };
  //: the O point is two numeric fields plus a drag handle, not sliders
  var OPOINT = ['r0', 'z0'];

  function readTarget() {
    return { r0: +$('r0').value, a: +$('a').value, kappa: +$('kappa').value,
             deltaU: +$('du').value, deltaL: +$('dl').value, z0: +$('z0').value };
  }
  function readProf() {
    return { beta0: +$('beta0').value, emp: +$('emp').value,
             enp: +$('enp').value, r0: M.reference.rcentr };
  }
  function readIp() { return +$('ip').value * 1e3; }

  function syncLabels() {
    SLIDERS.forEach(function (k) {
      var el = $('v-' + k);
      if (el) el.textContent = (+$(k).value).toFixed(DIGITS[k]);
    });
  }

  // --- coil current table ---------------------------------------------------

  var coilInputs = [];
  function buildCoilTable() {
    var tb = $('coils');
    tb.innerHTML = '';
    M.channels.forEach(function (combo, c) {
      var el = M.coils[combo[0][0]];
      var tr = document.createElement('tr');
      var td1 = document.createElement('td');
      td1.textContent = el.name + (combo.length > 1 ? '+' : '');
      var td2 = document.createElement('td');
      var inp = document.createElement('input');
      inp.type = 'number'; inp.step = '10';
      // typing a current repaints the figure at once: the coil fill IS the
      // current, so leaving it stale until the next solve would show a
      // colour that no longer matches the number next to it.  Programmatic
      // `.value =` fires no input event, so setCurrents() cannot loop here.
      inp.addEventListener('input', draw);
      td2.appendChild(inp);
      coilInputs.push(inp);
      tr.append(td1, td2);
      tb.appendChild(tr);
    });
  }
  //: the authoritative coil set.  The table shows it rounded to 0.1 kA, so
  //: reading the set back from the inputs would quantize it by up to 50 A on
  //: every run — enough to make a converged design drift for no reason.
  var currentChan = null;
  function setCurrents(chan) {
    currentChan = Float64Array.from(chan);
    coilInputs.forEach(function (inp, i) {
      inp.value = (currentChan[i] / 1e3).toFixed(1);
    });
  }
  /** Edits in the table override the stored set for that channel only. */
  function readCurrents() {
    var out = Float64Array.from(currentChan || coilInputs.map(function () { return 0; }));
    coilInputs.forEach(function (inp, i) {
      var typed = +inp.value * 1e3;
      if (Math.abs(typed - out[i]) > 50) out[i] = typed;
    });
    return out;
  }

  // --- drawing --------------------------------------------------------------

  function draw() {
    var t = readTarget();
    var tgt = P.millerBoundary(t, 121);
    var flat = new Float64Array(tgt.length * 2);
    tgt.forEach(function (p, i) { flat[2 * i] = p[0]; flat[2 * i + 1] = p[1]; });
    var handles = [{ r: t.r0, z: t.z0, kind: '+', key: 'o' }];
    if ($('usex').checked)
      handles.push({ r: +$('xr').value, z: +$('xz').value, kind: 'x', key: 'x' });
    lastHandles = handles;
    FyPlot.poloidal($('cross'), {
      machine: M, grid: grid,
      view: $('wide').checked ? FyPlot.deviceView(M) : null,
      coilLabel: coilLabel, coilFill: coilFill, handles: handles,

      psi: state && state.psi, psiAxis: state && state.psiAxis,
      psiBnd: state && state.psiBnd, nLevels: 12,
      lcfs: state && state.lcfs,
      target: flat,
      reference: $('showref').checked ? referenceLcfs : null,
      axis: state && [state.axisR, state.axisZ],
      xpoint: state && state.bndKind === 1 ? [state.xptR, state.xptZ] : null,
    });
    // the key lives outside the figure: in the wide device view there is no
    // spot inside the frame that does not cover a coil-current label
    $('cross-legend').innerHTML = FyPlot.legendHTML(legendItems());
    drawCurrentScale();
    drawShapeTable(t);
    drawScalars();
    drawProfiles();
  }

  /** p' and FF' of the analytic profile the solve ran on. */
  function drawProfiles() {
    var col = FyPlot.palette($('pprime'));
    var pr = state && state.profiles;
    function panel(id, key, ylabel) {
      var s = pr ? [{ x: pr.x, y: pr[key], color: col.lcfs }]
                 : [{ x: [0, 1], y: [0, 0], color: col.grid }];
      FyPlot.xy($(id), { series: s, xlabel: 'ψ̄', ylabel: ylabel,
                         zeroLine: true, xmin: 0, xmax: 1 });
    }
    panel('pprime', 'pprime', "p′ [Pa/(Wb/rad)]");
    panel('ffprime', 'ffprime', "FF′");
  }

  function drawShapeTable(t) {
    var rows = [['R₀ [m]', t.r0, state && state.shape.r0, 3],
                ['a [m]', t.a, state && state.shape.a, 3],
                ['κ', t.kappa, state && state.shape.kappa, 3],
                ['δ 上', t.deltaU, state && state.shape.deltaU, 3],
                ['δ 下', t.deltaL, state && state.shape.deltaL, 3]];
    $('shape').innerHTML = rows.map(function (r) {
      var got = r[2], d = got === null || got === undefined ? null : got - r[1];
      var cls = d === null ? '' : (Math.abs(d) < 0.03 ? 'good' : '');
      return '<tr><td>' + r[0] + '</td><td class="num">' + r[1].toFixed(r[3]) +
        '</td><td class="num">' + (got == null ? '—' : got.toFixed(r[3])) +
        '</td><td class="num ' + cls + '">' +
        (d === null ? '—' : (d >= 0 ? '+' : '') + d.toFixed(r[3])) + '</td></tr>';
    }).join('');
  }

  function drawScalars() {
    if (!state) { $('scalars').innerHTML = ''; return; }
    var rows = [
      ['磁轴 (R, Z) [m]', state.axisR.toFixed(3) + ', ' + state.axisZ.toFixed(3)],
      ['ψ 轴 / ψ 边界 [Wb]', state.psiAxis.toFixed(3) + ' / ' + state.psiBnd.toFixed(3)],
      ['极向磁通跨度 [Wb/rad]', ((state.psiAxis - state.psiBnd) / (2 * Math.PI)).toFixed(4)],
      ['I<sub>p</sub> [kA]', (state.ip / 1e3).toFixed(1)],
      ['边界类型', state.bndKind === 1 ? 'X 点 (偏滤器)' : '限制器'],
      ['虚拟垂直反馈电流 [kA]', (state.fbAmp / 1e3).toFixed(1)],
      ['Picard 迭代 / 残差', state.iterations + ' / ' + state.residual.toExponential(2)],
    ];
    $('scalars').innerHTML = rows.map(function (r) {
      return '<tr><td>' + r[0] + '</td><td class="num">' + r[1] + '</td></tr>';
    }).join('');
  }

  function drawHistory(history) {
    var x = [], y = [];
    history.forEach(function (h) {
      if (h.err == null || !isFinite(h.err)) return;
      x.push(h.pass); y.push(h.err);
    });
    FyPlot.xy($('hist'), {
      series: [{ x: x, y: y, color: FyPlot.palette($('hist')).accent,
                 kind: 'line' },
               { x: x, y: y, color: FyPlot.palette($('hist')).accent,
                 kind: 'dots', radius: 3 }],
      xlabel: '退火趟数', ylabel: '位形误差', ymin: 0,
    });
  }

  function drawCurrents(before, after) {
    var col = FyPlot.palette($('curr'));
    var x = [];
    for (var i = 0; i < after.length; i++) x.push(i + 1);
    var s = [{ x: x, y: Array.from(after, function (v) { return v / 1e3; }),
               color: col.accent, kind: 'bars', label: '设计后' }];
    if (before) s.unshift({ x: x, y: Array.from(before, function (v) { return v / 1e3; }),
                            color: col.muted, kind: 'bars', label: '设计前' });
    FyPlot.xy($('curr'), { series: s, xlabel: 'PF 通道', ylabel: 'kA·匝',
                           zeroLine: true });
  }

  function legendItems() {
    var col = FyPlot.palette($('cross'));
    var items = [
      { label: '等离子体边界', color: col.lcfs, kind: 'line', width: 2 },
      { label: '目标边界', color: col.accent, kind: 'line', dash: [4, 4] },
    ];
    if ($('showref').checked && referenceLcfs)
      items.push({ label: '参考放电', color: col.alt, kind: 'line',
                   dash: [5, 3] });
    items.push(

      { label: '磁轴（实际）', color: col.fg, kind: 'plus' },
      { label: 'O 点（拖动改 R₀/Z₀）', color: col.accent, kind: 'plus' });
    if ($('usex').checked)
      items.push({ label: 'X 点（可拖动）', color: col.accent, kind: 'x' });
    return items;
  }

  /**
   * Per-element label: the current of the PCS channel that drives it.
   * Elements ganged onto one channel therefore repeat its value, which is
   * what the hardware does.
   */
  var elemChannel = null;
  function channelOf(k) {
    if (!elemChannel) {
      elemChannel = new Array(M.coils.length).fill(-1);
      M.channels.forEach(function (combo, c) {
        combo.forEach(function (pair) { elemChannel[pair[0]] = c; });
      });
    }
    return elemChannel[k];
  }

  /** The element's name, drawn centred on it. */
  function coilLabel(k) { return M.coils[k].name; }

  /** Current of the element, i.e. of the channel that drives it [kA-turns]. */
  function coilCurrent(k) {
    var c = channelOf(k);
    return c < 0 || !coilInputs[c] ? 0 : +coilInputs[c].value;
  }

  function maxAbsCurrent() {
    var m = 0;
    for (var k = 0; k < M.coils.length; k++)
      m = Math.max(m, Math.abs(coilCurrent(k)));
    return m > 0 ? m : 1;
  }

  /**
   * Fill for an element: hue from the sign, opacity from |I| relative to
   * the largest current in the set.  The figure carries sign and relative
   * magnitude only — the numbers stay in the table below.
   */
  function coilFill(k) {
    var col = FyPlot.palette($('cross'));
    var v = coilCurrent(k), t = Math.abs(v) / maxAbsCurrent();
    return { color: v < 0 ? col.accent : col.lcfs,
             alpha: 0.12 + 0.88 * Math.min(1, t) };
  }

  function drawCurrentScale() {
    var col = FyPlot.palette($('cross'));
    FyPlot.currentScale($('cscale'), {
      posColor: col.lcfs, negColor: col.accent,
      max: maxAbsCurrent().toFixed(0), unit: 'PF 通道电流 [kA·匝]',
    });
  }

  // --- dragging the target O point and the X point on the cross-section -----

  var lastHandles = [], dragging = null;
  var cross = $('cross');

  function pointerRZ(ev) {
    var v = cross.__fyView;
    if (!v) return null;
    var b = cross.getBoundingClientRect();
    return { r: v.rOf(ev.clientX - b.left), z: v.zOf(ev.clientY - b.top),
             view: v };
  }

  /** Which handle is under the pointer, within a ~12 px grab radius. */
  function hitHandle(ev) {
    var v = cross.__fyView;
    if (!v) return null;
    var b = cross.getBoundingClientRect();
    var px = ev.clientX - b.left, py = ev.clientY - b.top, best = null, bd = 12;
    lastHandles.forEach(function (h) {
      var d = Math.hypot(v.X(h.r) - px, v.Y(h.z) - py);
      if (d < bd) { bd = d; best = h; }
    });
    return best;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** Write a value into a numeric field, honouring its own min/max. */
  function setNum(id, v) {
    var el = $(id);
    var lo = el.min === '' ? -Infinity : +el.min;
    var hi = el.max === '' ? Infinity : +el.max;
    el.value = clamp(v, lo, hi).toFixed(3);
  }

  function applyDrag(ev) {
    var pos = pointerRZ(ev);
    if (!pos) return;
    if (dragging.key === 'o') {
      // this handle IS the O-point control: it carries both coordinates
      setNum('r0', pos.r); setNum('z0', pos.z);
    } else {
      setNum('xr', pos.r); setNum('xz', pos.z);
    }
    draw();
  }

  cross.addEventListener('pointerdown', function (ev) {
    var h = hitHandle(ev);
    if (!h) return;
    dragging = h;
    cross.setPointerCapture(ev.pointerId);
    ev.preventDefault();
    applyDrag(ev);
  });
  cross.addEventListener('pointermove', function (ev) {
    if (dragging) { applyDrag(ev); return; }
    cross.style.cursor = hitHandle(ev) ? 'move' : '';
  });
  ['pointerup', 'pointercancel'].forEach(function (t) {
    cross.addEventListener(t, function (ev) {
      if (!dragging) return;
      dragging = null;
      try { cross.releasePointerCapture(ev.pointerId); } catch (e) { /* gone */ }
    });
  });

  // --- worker plumbing ------------------------------------------------------

  function setBusy(on, text) {
    busy = on;
    ['run', 'solve', 'reset', 'gimport', 'gexport'].forEach(function (id) {
      $(id).disabled = on;
    });
    if (text !== undefined) $('status').textContent = text;
    $('status').className = 'status';
  }

  var beforeCurrents = null;

  worker.onmessage = function (ev) {
    var m = ev.data;
    if (m.type === 'ready') {
      grid = m.grid;
      setBusy(false, '计算内核就绪（线圈响应矩阵 ' + m.timing.coils +
              ' ms）。正在求解参考放电…');
      resetToReference();
      return;
    }
    if (m.type === 'error') {
      setBusy(false);
      $('status').textContent = '求解失败：' + m.message;
      $('status').className = 'status err';
      return;
    }
    if (m.type === 'progress') {
      $('progress').style.width = (100 * m.pass / m.total) + '%';
      $('status').textContent = '反解迭代 ' + m.pass + ' / ' + m.total +
        '，位形误差 ' + (isFinite(m.err) ? m.err.toFixed(4) : '—');
      return;
    }
    if (m.type === 'solve') {
      state = m.result;
      if (!referenceLcfs) referenceLcfs = m.result.lcfs;
      setCurrents(m.chan);
      draw();
      setBusy(false, '自由边界求解完成：' + m.result.iterations + ' 次迭代，残差 ' +
              m.result.residual.toExponential(2));
      $('progress').style.width = '0';
      return;
    }
    if (m.type === 'design') {
      state = m.result;
      setCurrents(m.chan);
      draw();
      drawHistory(m.history);
      drawCurrents(beforeCurrents, m.chan);
      var failed = m.history.filter(function (h) { return h.error; });
      var err = m.history.filter(function (h) { return h.pass === m.pass; })[0].err;
      var tail = failed.length
        ? '；第 ' + failed[0].pass + ' 趟求解发散，已停止退火' : '';
      $('progress').style.width = '100%';
      if (m.pass === 0) {
        // saying only "取第 0 趟" reads like success; the figure is then
        // the STARTING configuration and looks like it never redrew
        setBusy(false, '');
        $('status').innerHTML = '反解结束：' + (m.history.length - 1) +
          ' 趟退火都不优于起点，图示与线圈电流仍是<strong>起点位形</strong>' +
          '（位形误差 ' + err.toFixed(4) + '）。可放宽目标，或调大迭代步长 γ。' + tail;
        $('status').className = 'status warn';
      } else {
        setBusy(false, '反解完成：取第 ' + m.pass + ' 趟结果（位形误差 ' +
                err.toFixed(4) + '）' + tail);
      }
      return;
    }
  };

  function resetToReference() {
    setBusy(true, '正在求解参考放电 EAST #' + M.reference.shot + ' …');
    referenceLcfs = null;
    setCurrents(M.reference.aturns);
    worker.postMessage({ cmd: 'solve', chan: Array.from(M.reference.aturns),
                         prof: readProf(), ip: readIp() });
  }

  // --- g-file exchange --------------------------------------------------------

  /** The current solution as an EFIT g-file. */
  function exportGfile() {
    if (!state || !state.profiles) {
      $('status').textContent = '还没有可导出的解，请先「正解」或「反解」。';
      $('status').className = 'status warn';
      return;
    }
    var pr = state.profiles, q = state.q;
    var nw = M.grid.nr;
    var txt = FyGeqdsk.format({
      grid: M.grid, psi: state.psi,
      psiAxis: state.psiAxis, psiBnd: state.psiBnd,
      axisR: state.axisR, axisZ: state.axisZ, ip: state.ip,
      rcentr: M.reference.rcentr, bcentr: M.reference.bcentr,
      fpol: q ? Array.from(q.f) : [],
      pres: Array.from(pr.p),
      pprime: Array.from(pr.pprime), ffprime: Array.from(pr.ffprime),
      qpsi: q ? FyGeqdsk.qOnUniform(q.x, q.q, nw) : new Array(nw).fill(0),
      boundary: pairs(state.lcfs),
      limiter: M.limiter,
      caseName: 'fylite design ' + stamp(),
    });
    FyGeqdsk.saveText('g_fylite_design.00000', txt);
    setBusy(false, '已导出 g 文件（' + nw + '×' + M.grid.nz + '，本地保存，未上传）。');
  }

  function pairs(flat) {
    var out = [];
    for (var i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
    return out;
  }
  function stamp() {
    var d = new Date();
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }

  /**
   * Take a g-file's own boundary as the design TARGET, plus its Ip.  The
   * field itself is not adopted: this page solves for coil currents, and
   * an imported psi map would have no coil set behind it.
   */
  function importGfile() {
    FyGeqdsk.openText(function (text, name, err) {
      if (err || text === null) {
        $('status').textContent = '读取失败：' + (err && err.message || name);
        $('status').className = 'status err';
        return;
      }
      var g, sm;
      try {
        g = FyGeqdsk.parse(text);
        sm = FyGeqdsk.boundaryShape(g);
        if (!sm) throw new Error('该 g 文件没有边界点（nbbbs = 0）');
      } catch (e) {
        $('status').textContent = '解析失败：' + e.message;
        $('status').className = 'status err';
        return;
      }
      setNum('r0', sm.r0);
      setNum('z0', 0.5 * (sm.zmin + sm.zmax));
      setRange('a', sm.a);
      setRange('kappa', sm.kappa);
      setRange('du', sm.deltaU);
      setRange('dl', sm.deltaL);
      setRange('ip', Math.abs(g.current) / 1e3);
      syncLabels();
      draw();
      setBusy(false, '已从 ' + name + ' 取目标位形：R₀=' + sm.r0.toFixed(3) +
              ' a=' + sm.a.toFixed(3) + ' κ=' + sm.kappa.toFixed(2) +
              ' δ=' + sm.deltaU.toFixed(2) + '/' + sm.deltaL.toFixed(2) +
              '，I_p=' + (Math.abs(g.current) / 1e3).toFixed(1) +
              ' kA。点「反解」求线圈电流。');
    }, '.00000,.geqdsk,g*,text/plain');
  }

  /** Write into a range input, clamped to its own bounds. */
  function setRange(id, v) {
    var el = $(id);
    el.value = clamp(v, +el.min, +el.max);
  }

  // --- events ---------------------------------------------------------------

  SLIDERS.forEach(function (k) {
    $(k).addEventListener('input', function () { syncLabels(); draw(); });
  });

  $('run').addEventListener('click', function () {
    if (busy) return;
    var n = +$('passes').value;
    // stiff -> loose: the first passes stay near the starting scenario,
    // the last ones are free enough to reach the target
    var sched = [];
    for (var i = 0; i < n; i++)
      sched.push(0.10 * Math.pow(0.005 / 0.10, i / Math.max(1, n - 1)));
    beforeCurrents = readCurrents();
    setBusy(true, '反解迭代中…');
    $('progress').style.width = '0';
    worker.postMessage({
      cmd: 'design', chan: Array.from(beforeCurrents),
      target: readTarget(), prof: readProf(), ip: readIp(),
      schedule: sched, gamma: +$('gamma').value, nPoints: 24,
      xWeight: $('usex').checked ? 1.0 : 0,
      xpoint: { r: +$('xr').value, z: +$('xz').value },
      solve: { maxIter: 600, relax: 0.3 },
    });
  });

  $('solve').addEventListener('click', function () {
    if (busy) return;
    setBusy(true, '自由边界求解中…');
    worker.postMessage({ cmd: 'solve', chan: Array.from(readCurrents()),
                         prof: readProf(), ip: readIp() });
  });
  $('reset').addEventListener('click', function () { if (!busy) resetToReference(); });
  $('gexport').addEventListener('click', exportGfile);
  $('gimport').addEventListener('click', importGfile);
  ['wide', 'showref'].forEach(function (id) {
    $(id).addEventListener('change', draw);
  });
  OPOINT.concat(['usex', 'xr', 'xz']).forEach(function (id) {
    $(id).addEventListener('input', draw);
    $(id).addEventListener('change', draw);
  });

  window.addEventListener('resize', function () {
    draw();
    if (state) drawCurrents(beforeCurrents, readCurrents());
  });

  buildCoilTable();
  syncLabels();
  setCurrents(M.reference.aturns);
  draw();
  worker.postMessage({ cmd: 'init' });
})();
