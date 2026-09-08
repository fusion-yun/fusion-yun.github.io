// A run as a sequence of door calls: step budget, measured progress,
// cancellation by budget, checkpoints (`FYL-DESIGN-18` U-8 · U-9, stage U0).
//
// ★What changes.  Today a multi-step march is one long `postMessage` and the
// page learns how far it got from `{type:'progress'}` messages the worker
// sends about itself.  `FYL-DESIGN-16` took the callbacks off the door on
// purpose (〔回调：撤回〕), so progress cannot come back from inside a call:
// it has to be COUNTED by the caller.  This module is that caller.  It asks
// for a few steps at a time, times what came back, and picks the next chunk
// from the measurement — so the progress bar moves because steps finished,
// not because something reported a number about itself.
//
// ★Cancellation is arithmetic, not termination (U-9).  `cancel()` sets the
// remaining budget to zero; the march stops when the chunk in flight returns,
// and the record of the steps that DID run is the result.  `worker.terminate()`
// stays available to the host for the one case this cannot cover — a chunk that
// never returns — and that case is reported by its own name (`hard`), because
// 「我按了取消」and「它卡死了我拔了电源」are two different things to have to
// explain to a reader afterwards.
//
// ★The stepper is injected.  `march()` knows nothing about workers, wasm or
// fyo; it is given `step(from, count, state)` returning a promise of
// `{record, state, steps}`.  That is what makes the equivalence claim testable
// without a kernel: with a deterministic stepper, N steps in one call and
// k + (N − k) steps across a checkpoint must produce the same state, which is
// the criterion `FYL-DESIGN-18` §十三 names for the checkpoint gate.
(function (root) {
  'use strict';

  var DEFAULTS = {
    //: ★the chunk is chosen so ONE call is an interactive-tier call
    //: (NR-ENV-002 / DE-LOG-04): the page stays answerable between chunks, and
    //: a cancel lands within one chunk rather than at the end of the march.
    msTarget: 200,
    //: the first chunk, before anything has been measured.  Small on purpose:
    //: the cost of a step is not knowable in advance and the first measurement
    //: is what every later chunk is sized from.
    firstChunk: 1,
    maxChunk: 200,
    //: how often a record is handed to the checkpoint store (U-10)
    checkpointEvery: 10
  };

  function now() {
    return (root.performance && root.performance.now) ? root.performance.now() : Date.now();
  }

  /**
   * March `budget` steps in chunks, reporting progress and checkpoints.
   *
   *   var m = FyRun.march({
   *     budget: 60,
   *     step: function (from, count, state) { ... -> Promise },
   *     onProgress: function (p) { ... },      // {done, budget, frac, msPerStep, etaMs}
   *     onCheckpoint: function (record, done) { ... },
   *   });
   *   m.cancel();                              // stops after the chunk in flight
   *   m.promise.then(function (r) { ... });    // {done, budget, cancelled, record, state}
   *
   * The promise REJECTS only when the stepper rejects: a cancelled march is a
   * completed promise carrying `cancelled: true` and everything that did run.
   * A cancel that arrived as a rejection would make every caller write a catch
   * block that has to tell「取消」apart from「出错」by inspecting the error.
   */
  function march(opts) {
    var o = {};
    Object.keys(DEFAULTS).forEach(function (k) { o[k] = DEFAULTS[k]; });
    Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
    if (typeof o.step !== 'function') throw new Error('FyRun.march: step() is required');
    if (!(o.budget > 0)) throw new Error('FyRun.march: budget must be positive');

    var done = 0, remaining = o.budget, cancelled = false, hard = false;
    var state = o.state === undefined ? null : o.state;
    //: ★WHERE THE STEPS START, and why it is not always zero.  A resumed march
    //: runs steps 24..60, not 1..37: the state it was handed already contains
    //: the first 23, and a stepper asked for「从 0 起的 37 步」computes the
    //: wrong ones while looking perfectly healthy.  The default reads the step
    //: index out of the state (S-2 keeps it there), so a caller that resumes
    //: does not have to do the bookkeeping — `validate-checkpoint.mjs` caught
    //: this on its first run, as a failure of the equivalence criterion.
    var from = o.from !== undefined ? o.from
             : (state && typeof state.step === 'number' ? state.step : 0);
    var record = o.record === undefined ? null : o.record;
    var msPerStep = null, sinceCheckpoint = 0;

    function chunkSize() {
      var n = msPerStep === null ? o.firstChunk
            : Math.round(o.msTarget / Math.max(msPerStep, 1e-6));
      n = Math.max(1, Math.min(n, o.maxChunk, remaining));
      //: ★A CHUNK MAY NOT STEP OVER A CHECKPOINT BOUNDARY.  Without this the
      //: interval is advisory: a cheap step makes the chunk larger than the
      //: interval, the boundary is passed inside one call, and a march that
      //: asked for a checkpoint every ten steps takes none at all — which is
      //: discovered only when something interrupts it and everything is gone.
      //: Measured: a 30-step march with `checkpointEvery: 10` and an instant
      //: stepper saved ZERO checkpoints before this clamp.
      if (o.onCheckpoint && o.checkpointEvery > 0)
        n = Math.min(n, Math.max(1, o.checkpointEvery - sinceCheckpoint));
      return n;
    }

    function report() {
      if (!o.onProgress) return;
      o.onProgress({
        done: done, budget: o.budget, frac: done / o.budget,
        //: the index of the last step that ran, across a resume — what a
        //: reader means by「第 23 步」when the march started at 23
        step: from + done,
        msPerStep: msPerStep,
        //: ★REPORTED, NOT PROMISED (`FYL-DESIGN-13`'s wording, same reason):
        //: it is the measured cost of the steps that ran times the steps that
        //: have not, and it is null until something has been measured.
        etaMs: msPerStep === null ? null : Math.round(msPerStep * remaining)
      });
    }

    var promise = new Promise(function (resolve, reject) {
      function loop() {
        if (cancelled || remaining <= 0) {
          resolve({ done: done, budget: o.budget, from: from, step: from + done,
                    cancelled: cancelled, hard: hard, record: record, state: state });
          return;
        }
        var n = chunkSize(), t0 = now();
        var p;
        try {
          p = o.step(from + done, n, state);
        } catch (e) { reject(e); return; }
        Promise.resolve(p).then(function (r) {
          var ran = (r && r.steps) || n;
          var dt = now() - t0;
          //: measure per step, and smooth over the run: one slow chunk (a
          //: garbage collection, a tab that lost focus) must not resize every
          //: chunk after it
          var m = dt / Math.max(ran, 1);
          msPerStep = msPerStep === null ? m : msPerStep * 0.6 + m * 0.4;
          done += ran; remaining -= ran; sinceCheckpoint += ran;
          if (r && r.state !== undefined) state = r.state;
          if (r && r.record !== undefined) record = r.record;
          report();
          if (o.onCheckpoint && sinceCheckpoint >= o.checkpointEvery && remaining > 0) {
            sinceCheckpoint = 0;
            try { o.onCheckpoint(record, done, state); } catch (e) { /* a store that
              refuses must not kill the march: the march is the work, the
              checkpoint is insurance (P-10 degrade honestly) */ }
          }
          loop();
        }, reject);
      }
      report();
      loop();
    });

    return {
      promise: promise,
      /** U-9: the remaining budget goes to zero; the chunk in flight finishes. */
      cancel: function (isHard) {
        cancelled = true; hard = !!isHard; remaining = 0;
      },
      state: function () {
        return { done: done, budget: o.budget, remaining: remaining,
                 cancelled: cancelled, msPerStep: msPerStep };
      }
    };
  }

  root.FyRun = { march: march, DEFAULTS: DEFAULTS };
})(typeof self !== 'undefined' ? self : this);
