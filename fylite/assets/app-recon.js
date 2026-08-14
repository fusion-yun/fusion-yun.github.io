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
        '已扣除 PF 线圈贡献（csilop − rsilfc·I），单位 Wb/rad；' +
        'I<sub>p</sub> = ' + (R.ip / 1e3).toFixed(1) + ' kA 取自 a 文件。' +
        '对照物是 EFIT 自己对同一时刻的重构结果。'
      : '先用自由边界正解生成一个"真值"平衡，再把它的等离子体电流通过与拟合完全相同的' +
        '响应行前向投影到 35 道磁通环上、加噪，作为合成测量。因为真值已知，' +
        '可以直接量出动理学约束买到了多少精度。';
    $('kin-note').innerHTML = s === 'real'
      ? '压强点取自同一炮 g 文件的 p(ψ̄) 剖面——即把 EFIT 的压强当作独立的动理学输入，' +
        '看它如何改变仅磁重构的解。'
      : '压强点取自真值剖面并按设定加噪。';
    drawAll();
  }

  // --- drawing --------------------------------------------------------------

  function residColor(i) {
    var col = FyPlot.palette($('cross'));
    if (!last || !last.wts || !last.wts[i]) return col.grid;
    var d = Math.abs(last.model[i] - last.meas[i]);
    var scale = last.measAmp || 1;
    var t = Math.min(1, d / (0.02 * scale));
    return 'rgb(' + Math.round(60 + 195 * t) + ',' +
           Math.round(150 - 100 * t) + ',' + Math.round(120 - 60 * t) + ')';
  }

  function drawAll() {
    var ref = null;
    if (last && last.truth) ref = last.truth.lcfs;
    else if (source === 'real') {
      ref = new Float64Array(R.boundaryR.length * 2);
      R.boundaryR.forEach(function (r, i) {
        ref[2 * i] = r; ref[2 * i + 1] = R.boundaryZ[i];
      });
    }
    FyPlot.poloidal($('cross'), {
      machine: M, grid: grid,
      psi: last && last.result.psi,
      psiAxis: last && last.result.psiAxis,
      psiBnd: last && last.result.psiBnd,
      nLevels: 12,
      lcfs: last && last.result.lcfs,
      reference: ref,
      axis: last && [last.result.axisR, last.result.axisZ],
      loops: M.loops, loopColor: residColor,
      caption: last ? (last.result.bndKind === 1 ? 'X 点边界' : '限制器边界') : '',
    });
    drawProfiles();
    drawLoops();
    drawTables();
  }

  function drawProfiles() {
    var col = FyPlot.palette($('pres'));
    var fit = last && last.profiles, tru = last && last.truthProfiles;
    function panel(id, key, ylabel, refSeries) {
      var s = [];
      if (fit) s.push({ x: fit.x, y: fit[key], color: col.lcfs, label: '重构' });
      if (tru) s.push({ x: tru.x, y: tru[key], color: col.alt, dash: [5, 3],
                        label: '真值' });
      if (refSeries) s.push(refSeries);
      if (!s.length) s.push({ x: [0, 1], y: [0, 0], color: col.grid });
      FyPlot.xy($(id), { series: s, xlabel: 'ψ̄', ylabel: ylabel,
                         zeroLine: true, xmin: 0, xmax: 1 });
    }
    var efitX = [], n = R.pres.length;
    for (var i = 0; i < n; i++) efitX.push(i / (n - 1));
    var showEfit = source === 'real';
    // EFIT's psi runs the other way (its axis is the minimum), so its
    // dp/dpsi and FF' carry the opposite sign from fylite's gauge.  p
    // itself is gauge-free.  Flip the derivatives so the curves are
    // comparable rather than mirror images.
    var efitPp = R.pprime.map(function (v) { return -v; });
    var efitFf = R.ffprim.map(function (v) { return -v; });
    panel('pres', 'p', 'p [Pa]', showEfit
      ? { x: efitX, y: R.pres, color: col.accent, dash: [2, 3], label: 'EFIT' } : null);
    panel('pp', 'pprime', "p′", showEfit
      ? { x: efitX, y: efitPp, color: col.accent, dash: [2, 3], label: 'EFIT' } : null);
    panel('ffp', 'ffprime', "FF′", showEfit
      ? { x: efitX, y: efitFf, color: col.accent, dash: [2, 3], label: 'EFIT' } : null);
    // kinetic constraint points, drawn on the pressure panel
    if (last && last.kineticX && last.kineticX.length) {
      var s = [{ x: fit.x, y: fit.p, color: col.lcfs, label: '重构' }];
      if (tru) s.push({ x: tru.x, y: tru.p, color: col.alt, dash: [5, 3], label: '真值' });
      if (showEfit) s.push({ x: efitX, y: R.pres, color: col.accent, dash: [2, 3],
                            label: 'EFIT' });
      s.push({ x: last.kineticX, y: last.kineticP, color: col.warn || '#b60',
               kind: 'dots', radius: 3.5, label: '约束点' });
      FyPlot.xy($('pres'), { series: s, xlabel: 'ψ̄', ylabel: 'p [Pa]',
                             zeroLine: true, xmin: 0, xmax: 1 });
    }
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
           '</td><td class="num">' + (b === undefined ? '—' : b) + '</td></tr>';
  }

  function drawTables() {
    if (!last) { $('scalars').innerHTML = ''; $('coefs').innerHTML = ''; return; }
    var r = last.result, t = last.truth;
    var span = (r.psiAxis - r.psiBnd) / (2 * Math.PI);
    var refAxisR, refAxisZ, refSpan, refR0, refA, refK;
    if (t) {
      refAxisR = t.axisR.toFixed(3); refAxisZ = t.axisZ.toFixed(3);
      refSpan = ((t.psiAxis - t.psiBnd) / (2 * Math.PI)).toFixed(4);
      refR0 = t.shape.r0.toFixed(3); refA = t.shape.a.toFixed(3);
      refK = t.shape.kappa.toFixed(3);
    } else {
      refAxisR = R.rmaxis.toFixed(3); refAxisZ = R.zmaxis.toFixed(3);
      refSpan = (-(R.simag - R.sibry)).toFixed(4);
    }
    var html = '';
    html += row('磁轴 R [m]', r.axisR.toFixed(3), refAxisR);
    html += row('磁轴 Z [m]', r.axisZ.toFixed(3), refAxisZ);
    html += row('磁通跨度 [Wb/rad]', span.toFixed(4), refSpan);
    html += row('R₀ [m]', r.shape.r0.toFixed(3), refR0);
    html += row('a [m]', r.shape.a.toFixed(3), refA);
    html += row('κ', r.shape.kappa.toFixed(3), refK);
    html += row('I<sub>p</sub> [kA]', (r.ip / 1e3).toFixed(1),
                (last.ipFitted / 1e3).toFixed(1));
    html += row('p(0) [Pa]', last.profiles.p[0].toFixed(0),
                t && last.truthProfiles ? last.truthProfiles.p[0].toFixed(0)
                  : (source === 'real' ? R.pres[0].toFixed(0) : undefined));
    html += row('加权 χ² / 通道数', last.chi2.toExponential(2) + ' / ' + last.nfit,
                source === 'real' ? R.chisq.toFixed(2) : undefined);
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
    $('fitnote').innerHTML = '第二列的 I<sub>p</sub> 是把拟合系数重新积分得到的' +
      '等离子体总电流，用来核对 I<sub>p</sub> 等式约束确实闭合。' +
      (source === 'real'
        ? 'χ² 的参照值是 EFIT 对同一炮报告的值，二者权重定义不同，仅供量级参考。'
        : '合成孪生下参照列取真值。');
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
