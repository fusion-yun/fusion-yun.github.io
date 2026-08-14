// Kinetic-equilibrium-reconstruction page controller.

(function () {
  'use strict';

  var M = self.FYLITE_MACHINE, R = M.reference;
  var worker = new Worker('assets/worker.js');
  var grid = null, last = null, source = 'real', busy = false;

  var $ = function (id) { return document.getElementById(id); };
  var SLIDERS = ['ip', 'beta0', 'emp', 'enp', 'noise', 'seed', 'kpts', 'kw',
                 'knoise', 'warmup', 'maxit'];
  var DIGITS = { ip: 0, beta0: 2, emp: 2, enp: 2, noise: 3, seed: 0, kpts: 0,
                 kw: 3, knoise: 3, warmup: 0, maxit: 0 };

  function syncLabels() {
    SLIDERS.forEach(function (k) {
      var el = $('v-' + k);
      if (el) el.textContent = (+$(k).value).toFixed(DIGITS[k]);
    });
  }

  function setSource(s) {
    source = s;
    $('tab-real').className = s === 'real' ? 'on' : '';
    $('tab-twin').className = s === 'twin' ? 'on' : '';
    $('twin-panel').hidden = s !== 'twin';
    $('src-note').innerHTML = s === 'real'
      ? 'EAST #' + R.shot + ' @ ' + R.time_s.toFixed(1) + ' s 的 35 道极向磁通环读数，' +
        '已扣除 PF 线圈贡献，单位 Wb/rad；I<sub>p</sub> = ' +
        (R.ip / 1e3).toFixed(1) + ' kA 随该炮给出。真值未知，所有输出都是本次拟合' +
        '自身的结果。'
      : '先用自由边界正解生成一个"真值"平衡，再把它的等离子体电流通过与拟合完全相同的' +
        '响应行前向投影到 35 道磁通环上、加噪，作为合成测量。因为真值已知，' +
        '可以直接量出动理学约束买到了多少精度。';
    $('kin-note').innerHTML = s === 'real'
      ? '压强点取自该炮随数据给出的压强剖面，当作独立于磁测量的动理学输入。'
      : '压强点取自真值剖面并按设定加噪。';
    document.querySelectorAll('.ref-col').forEach(function (el) {
      el.style.display = s === 'twin' ? '' : 'none';
    });
    drawAll();
  }

  // --- drawing --------------------------------------------------------------

  function residColor(i) {
    var col = FyPlot.palette($('cross'));
    if (!last || !last.wts || !last.wts[i]) return col.muted;
    var d = Math.abs(last.model[i] - last.meas[i]);
    var t = Math.min(1, d / (0.02 * (last.measAmp || 1)));
    return 'rgb(' + Math.round(60 + 195 * t) + ',' +
           Math.round(150 - 100 * t) + ',' + Math.round(120 - 60 * t) + ')';
  }
  function loopUsed(i) { return !last || !last.wts ? true : !!last.wts[i]; }

  function drawAll() {
    var col = FyPlot.palette($('cross'));
    var legend = [
      { label: '等离子体边界', color: col.lcfs, kind: 'line', width: 2 },
      { label: '磁轴', color: col.fg, kind: 'plus' },
      { label: '磁通环', color: col.muted, kind: 'square' },
      { label: '未参与拟合', color: col.muted, kind: 'square', hollow: true },
    ];
    if (last && last.truth)
      legend.splice(1, 0, { label: '真值边界', color: col.alt, kind: 'line',
                            dash: [5, 3], width: 2 });
    FyPlot.poloidal($('cross'), {
      machine: M, grid: grid,
      psi: last && last.result.psi,
      psiAxis: last && last.result.psiAxis,
      psiBnd: last && last.result.psiBnd,
      fill: last ? { psi: last.result.psi, psiAxis: last.result.psiAxis,
                     psiBnd: last.result.psiBnd, max: 1 } : null,
      nLevels: 12,
      lcfs: last && last.result.lcfs,
      reference: last && last.truth ? last.truth.lcfs : null,
      axis: last && [last.result.axisR, last.result.axisZ],
      loops: M.loops, loopColor: residColor, loopUsed: loopUsed,
      legend: legend,
      caption: last ? (last.result.bndKind === 1 ? 'X 点边界' : '限制器边界') : '',
    });
    if ($('cbar')) FyPlot.colorbar($('cbar'), {});
    drawProfiles();
    drawLoops();
    drawTables();
  }

  function drawProfiles() {
    var col = FyPlot.palette($('pres'));
    var fit = last && last.profiles, tru = last && last.truthProfiles;
    function panel(id, xs, ys, txs, tys, ylabel, xmax) {
      var s = [];
      if (ys) s.push({ x: xs, y: ys, color: col.lcfs, label: '重构' });
      if (tys) s.push({ x: txs, y: tys, color: col.alt, dash: [5, 3],
                        label: '真值' });
      if (!s.length) s.push({ x: [0, 1], y: [0, 0], color: col.grid });
      FyPlot.xy($(id), { series: s, xlabel: 'ψ̄', ylabel: ylabel,
                         zeroLine: true, xmin: 0, xmax: xmax || 1 });
    }
    var q = last && last.q, tq = last && last.truthQ;
    panel('qprof', q && q.x, q && q.q, tq && tq.x, tq && tq.q, 'q');
    var j = last && last.jphi, tj = last && last.truthJphi;
    panel('jphi', j && j.x, j && j.j, tj && tj.x, tj && tj.j, '⟨j_φ⟩ [A/m²]');
    panel('pp', fit && fit.x, fit && fit.pprime, tru && tru.x,
          tru && tru.pprime, "p′");
    panel('ffp', fit && fit.x, fit && fit.ffprime, tru && tru.x,
          tru && tru.ffprime, "FF′");

    // pressure panel also carries the kinetic constraint points
    var sp = [];
    if (fit) sp.push({ x: fit.x, y: fit.p, color: col.lcfs, label: '重构' });
    if (tru) sp.push({ x: tru.x, y: tru.p, color: col.alt, dash: [5, 3],
                       label: '真值' });
    if (last && last.kineticX && last.kineticX.length)
      sp.push({ x: last.kineticX, y: last.kineticP, color: col.warn || '#b60',
                kind: 'dots', radius: 3.5, label: '约束点' });
    if (!sp.length) sp.push({ x: [0, 1], y: [0, 0], color: col.grid });
    FyPlot.xy($('pres'), { series: sp, xlabel: 'ψ̄', ylabel: 'p [Pa]',
                           zeroLine: true, xmin: 0, xmax: 1 });
  }

  function drawLoops() {
    var col = FyPlot.palette($('loops'));
    if (!last) {
      FyPlot.xy($('loops'), { series: [{ x: [0, 1], y: [0, 0], color: col.grid }],
                              xlabel: '磁通环编号' });
      return;
    }
    var x = [];
    for (var i = 0; i < last.meas.length; i++) x.push(i + 1);
    FyPlot.xy($('loops'), {
      series: [
        { x: x, y: Array.from(last.meas), color: col.accent, kind: 'dots',
          radius: 3.5, label: '测量' },
        { x: x, y: Array.from(last.model), color: col.lcfs, kind: 'line',
          width: 1.5, label: '模型' },
      ],
      xlabel: '磁通环编号', ylabel: 'ψ_plasma [Wb/rad]',
    });
  }

  function rmsResidual() {
    var s = 0, n = 0;
    for (var i = 0; i < last.meas.length; i++) {
      if (!last.wts[i]) continue;
      var d = last.model[i] - last.meas[i];
      s += d * d; n += 1;
    }
    return n ? Math.sqrt(s / n) : NaN;
  }

  function row(name, a, b) {
    return '<tr><td>' + name + '</td><td class="num">' + a +
           '</td><td class="num ref-col"' +
           (source === 'twin' ? '' : ' style="display:none"') + '>' +
           (b === undefined || b === null ? '—' : b) + '</td></tr>';
  }

  function drawTables() {
    if (!last) { $('scalars').innerHTML = ''; $('coefs').innerHTML = ''; return; }
    var r = last.result, t = last.truth, tq = last.truthQ, q = last.q;
    var span = function (o) { return ((o.psiAxis - o.psiBnd) / (2 * Math.PI)).toFixed(4); };
    var f2 = function (v, d) { return isFinite(v) ? v.toFixed(d) : '—'; };
    var html = '';
    html += row('磁轴 R [m]', f2(r.axisR, 3), t && f2(t.axisR, 3));
    html += row('磁轴 Z [m]', f2(r.axisZ, 3), t && f2(t.axisZ, 3));
    html += row('磁通跨度 [Wb/rad]', span(r), t && span(t));
    html += row('R₀ [m]', f2(r.shape.r0, 3), t && f2(t.shape.r0, 3));
    html += row('a [m]', f2(r.shape.a, 3), t && f2(t.shape.a, 3));
    html += row('κ', f2(r.shape.kappa, 3), t && f2(t.shape.kappa, 3));
    html += row('q<sub>0</sub>', f2(q && q.q0, 3), tq && f2(tq.q0, 3));
    html += row('q<sub>95</sub>', f2(q && q.q95, 3), tq && f2(tq.q95, 3));
    html += row('I<sub>p</sub> [kA]', f2(r.ip / 1e3, 1),
                t && f2(t.ip / 1e3, 1));
    html += row('p(0) [Pa]', f2(last.profiles.p[0], 0),
                last.truthProfiles && f2(last.truthProfiles.p[0], 0));
    html += row('加权 χ² / 通道数', last.chi2.toExponential(2) + ' / ' + last.nfit);
    html += row('磁通环残差 RMS [Wb/rad]', rmsResidual().toExponential(2));
    html += row('外迭代 / 残差', r.iterations + ' / ' + r.residual.toExponential(2));
    html += row('边界类型', r.bndKind === 1 ? 'X 点' : '限制器');
    $('scalars').innerHTML = html;

    var npp = +$('npp').value;
    $('coefs').innerHTML = Array.from(r.coefs, function (c, i) {
      var lbl = i < npp ? "p′ c" + i : "FF′ c" + (i - npp);
      return '<tr><td>' + lbl + '</td><td class="num">' + c.toExponential(3) +
             '</td></tr>';
    }).join('');
    $('fitnote').innerHTML = 'q 由拟合的 FF′ 定出 F=R·B<sub>φ</sub> 后逐面环积分得到，' +
      '边缘取装置的真空 R₀B₀；q<sub>0</sub> 是向磁轴的线性外推（磁面本身在那里退化）。';
  }

  // --- worker ---------------------------------------------------------------

  function setBusy(on, text) {
    busy = on;
    $('run').disabled = on;
    if (text !== undefined) $('status').textContent = text;
    $('status').className = 'status';
  }

  worker.onmessage = function (ev) {
    var m = ev.data;
    if (m.type === 'ready') {
      grid = m.grid;
      setBusy(false, '计算内核就绪（线圈响应矩阵 ' + m.timing.coils +
              ' ms，磁通环响应矩阵 ' + m.timing.loops + ' ms）。');
      drawAll();
      run();
      return;
    }
    if (m.type === 'error') {
      setBusy(false);
      $('status').textContent = '重构失败（' + (m.where || '') + '）：' + m.message;
      $('status').className = 'status err';
      $('progress').style.width = '0';
      return;
    }
    if (m.type === 'recon') {
      last = m;
      var amp = 0;
      for (var i = 0; i < m.meas.length; i++) amp = Math.max(amp, Math.abs(m.meas[i]));
      last.measAmp = amp;
      drawAll();
      $('progress').style.width = '100%';
      setBusy(false, '重构完成：' + m.result.iterations + ' 次外迭代，残差 ' +
              m.result.residual.toExponential(2) + '，加权 χ² = ' +
              m.chi2.toExponential(2));
    }
  };

  function run() {
    if (busy || !grid) return;
    setBusy(true, '重构求解中（可能需要一两秒）…');
    $('progress').style.width = '40%';
    worker.postMessage({
      cmd: 'recon', source: source,
      chan: Array.from(R.aturns),
      ip: +$('ip').value * 1e3,
      prof: { beta0: +$('beta0').value, emp: +$('emp').value,
              enp: +$('enp').value, r0: R.rcentr },
      noise: +$('noise').value, seed: +$('seed').value,
      npp: +$('npp').value, nff: +$('nff').value,
      warmup: +$('warmup').value,
      solve: { maxIter: +$('maxit').value, relax: 0.3 },
      kinetic: { on: $('kin').checked, points: +$('kpts').value,
                 weight: +$('kw').value, noise: +$('knoise').value },
    });
  }

  // --- events ---------------------------------------------------------------

  SLIDERS.forEach(function (k) {
    $(k).addEventListener('input', syncLabels);
  });
  $('tab-real').addEventListener('click', function () { setSource('real'); });
  $('tab-twin').addEventListener('click', function () { setSource('twin'); });
  $('run').addEventListener('click', run);
  window.addEventListener('resize', drawAll);

  syncLabels();
  setSource('real');
  worker.postMessage({ cmd: 'init' });
})();
