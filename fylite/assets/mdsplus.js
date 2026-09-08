// The device-data page: walk a live MDSplus tree, name a shot, draw signals.
//
// ★This page has NO kernel and NO worker.  Every other page in `app/` runs
// fylite in wasm and its controller is mostly about feeding a kernel; this one
// computes nothing.  What it does is ask a same-origin gateway
// (`fylite`, whose request face is `rust/fylite/src/bin/app/api.rs`)
// four questions and draw the answers, because
// FYL-DESIGN-06 §1 closed the only alternative: mdsip is raw TCP, a page has
// no socket, and wasm does not give it one.
//
// ★THE PAGE MUST DEGRADE HONESTLY.  Served as a static file — from the
// published site, from `file://` — there is no gateway and there is no data.
// That state is not an error banner: it is the page saying which process is
// missing and printing the command that starts it.  A tool that fails by
// showing an empty plot teaches the reader that the device has no data.
//
// ★AND IT MUST SAY WHAT THE CURVE IS.  What comes back is every Nth sample,
// strided on the server.  It is not a mean and not a min/max envelope, so a
// spike narrower than the stride is simply absent — and nothing on screen
// would reveal that.  Every caption therefore carries `n`, the stride and the
// drawn count, and the table repeats them.  This is the same rule the repo
// applies to a reconstruction it cannot certify: state the reading and state
// what it is not.
//
// ★THE STRIDE IS TWO-PASS AND WINDOW-RELATIVE.  The first pass over a
// selection asks for at most `INITIAL` points per trace — a whole EAST shot in
// a couple of seconds, which is what a reader wants before they know which
// signal they are actually after — and only then does a second pass refine
// each trace to the figure's own pixel width.  Drag across a figure and the
// same two passes run again inside that window: the point count barely
// changes, the STRIDE collapses, and the sampling rate of what is on screen
// follows the window instead of the shot.  Every caption keeps saying which
// samples these are.

(function (root) {
  'use strict';

  var T = function (k, p) { return root.FyI18n.t(k, p); };
  var $ = function (id) { return document.getElementById(id); };

  /** At most this many traces at once: the figure column is the constraint,
   *  and each trace is one serial round trip to the server. */
  var MAX_PICK = 6;
  /** At most this many rows drawn from one level.  `\TOP.T1` on EAST #137985
   *  holds 2 812 members; rendering them all is a second of layout for a list
   *  nobody reads to the end.  The filter box is the way through, and the
   *  note says so rather than the list quietly stopping. */
  var MAX_ROWS = 400;
  /** ★The FIRST pass never asks for more than this, per trace.  A shot's worth
   *  of zero-order signals at 256 points each is ~8 KB and lands in seconds;
   *  the same selection at figure resolution is four times the wire and four
   *  times the wait for a picture that answers the same first question — which
   *  of these is the shot I meant.  The refine pass follows immediately. */
  var INITIAL = 256;
  /** A drag shorter than this is a click, not a window. */
  var DRAG_PX = 6;

  /**
   * ★THE ZERO-ORDER QUANTITIES, AND THE TREES THEY ACTUALLY LIVE IN.
   *
   * These are the signals a shot is looked at through before any other: the
   * current, the loop voltage, the stored energy, the line-averaged density,
   * and the three global equilibrium scalars beside them.  They are NOT in one
   * tree — `\PCRL01` is the PCS Rogowski, `\VP1` is a raw flux-loop channel on
   * the device tree, `\WMHD` is an EFIT result — so every entry carries its own
   * tree and none of them depends on what the browser on the left has open.
   *
   * ★They are EAST names, and the page says so rather than pretending they are
   * universal: a gateway pointed at another site is offered no defaults at all.
   * ★And `\PCRL01` is the Rogowski reading, not "the plasma current": this repo
   * measured it 1.9 % from the reconstructed `cpasma` on #137985 at the flat
   * top.  It is the right thing to LOOK at first and the wrong thing to fit to.
   */
  /**
   * ★The vacuum toroidal field.
   *
   * ★★2026-09-01, MEASURED: it is the TAG `\\BCENTR`, not the full path
   * `\\EFIT_EAST::TOP.RESULTS.GEQDSK:BCENTR` this page used to name.  On the
   * live server the full path answers **size 0, units "", `%TREE-E-NODATA`**
   * on every shot tried (#100000 #137984 #137985 #140000 #150000 #165704);
   * the tag answers **112 points, units `T`, `TIME_INSERTED`
   * 2024-04-19** (#137985: −2.43 T across the shot).
   *
   * ★The old spelling came with the argument that a full path was what had
   * been measured and "a shorter tag might resolve and might not".  The
   * argument was sound and the fact inside it was wrong — and the way that
   * showed was NOT a red gate: the field simply sat empty, and both hosts grew
   * a comment saying "BCENTR is NODATA on some shots (#137985 among them)".
   * ★★That comment recorded a false fact about the machine, in the voice of a
   * measurement.  What was actually true is that nothing here had ever read
   * this quantity.
   */
  var BCENTR = '\\BCENTR';

  /**
   * ★The TF COIL CURRENT, found on the live tree (2026-08-24, #165704).
   *
   * UDAClient's status line has an `It` and this repository could not say
   * which node it was — the field sat blank for exactly that reason.  Swept
   * live: `east` `\\TOP.T2` carries a TF family, and `TFP` is the one in
   * AMPERES that is flat across the shot at **10.7 kA** (`ITF05…ITF16` on
   * `\\TOP.T1` read ~0.02 A, so they are not the supply).  The other `T2`
   * members near it (`TFT`, `TFV`, `TFGT`, `TF101…`) answer VOLTS.
   */
  var TFCUR = '\\TOP.T2:TFP';

  var ZERO = [
    { key: 'ip',    tree: 'pcs_east',  node: '\\PCRL01', on: true },
    { key: 'vloop', tree: 'east',      node: '\\VP1',    on: true },
    { key: 'wmhd',  tree: 'efit_east', node: '\\WMHD',   on: true },
    { key: 'ne',    tree: 'pcs_east',  node: '\\DFSDEV', on: true },
    { key: 'betap', tree: 'efit_east', node: '\\BETAP' },
    { key: 'li',    tree: 'efit_east', node: '\\LI' },
    { key: 'q95',   tree: 'efit_east', node: '\\Q95' },
    { key: 'bt',    tree: 'efit_east', node: BCENTR },
    { key: 'it',    tree: 'east',      node: TFCUR },
  ];

  /**
   * ★THE STATUS LINE, AND WHY TWO OF ITS FIVE FIELDS ARE NOT WHAT UDAClient
   * SHOWS.
   *
   * UDAClient's status line reads `Shot / Ip / Pulse / It / date`.  Three of
   * those this repository can source and say where from; two it cannot:
   *
   *   `It` — the TF COIL CURRENT.  It sat blank until 2026-08-24 because no
   *   node for it was verified here; a page that quietly put a different
   *   current in that slot would be worse than one that leaves it out.  Swept
   *   on the live tree it is `east:\\TOP.T2:TFP` (amperes, 10.7 kA flat on
   *   #165704) — so the field now has a value AND the vacuum toroidal field
   *   stays beside it under its own name, because B_t is not I_t.
   *
   *   the DATE — `getnci(...,"TIME_INSERTED")` on a DATA node, read live on
   *   #165704: 2026-06-26 10:29:17 UTC, which MDSplus's own `date_time()`
   *   renders "26-JUN-2026 10:29:17.67".  ★It is when that node's RECORD WAS
   *   WRITTEN, not when the plasma was made, and the line says so — for a raw
   *   acquisition channel the two are minutes apart, for a re-analysed result
   *   they can be days.  ★`\\TOP` itself answers 0 (the root holds no
   *   record), so the question is asked of a node that carries data.
   *
   * ★Every field names the node it came from, and the derived ones name the
   * rule as well.  A status line whose numbers cannot be traced is five
   * numbers a reader has to take on faith.
   */
  var STATUS = [
    { key: 'shot', kind: 'page' },
    { key: 'ip', kind: 'peak', tree: 'pcs_east', node: '\\PCRL01' },
    { key: 'pulse', kind: 'pulse', tree: 'pcs_east', node: '\\PCRL01' },
    { key: 'it', kind: 'peak', tree: 'east', node: TFCUR },
    { key: 'bt', kind: 'peak', tree: 'efit_east', node: BCENTR },
    { key: 'date', kind: 'written' },
  ];

  /** Fraction of the peak |I_p| that counts as "the discharge is on".  ★It is
   *  a RULE OF THIS PAGE, not a measurement, so the line says so where it
   *  prints the number. */
  var ON_FRACTION = 0.1;

  /**
   * ★THE ONE ADDRESS THIS PAGE PRESETS, AND WHY IT IS ONLY ONE.
   *
   * `127.0.0.1:8000` is the near end of the ssh tunnel that reaches a site's
   * mdsip server from a workstation — the same string for everybody, and the
   * one FYL-DESIGN-06 §1 and the gateway's own usage text already name.
   *
   * ★★The SITE server used to be preset beside it.  It is gone (2026-09-02):
   * it is an address on an operator's internal network, and a published page
   * is not the place to write one down.  Nothing is lost for the reader who
   * has one — `renderServers` offers whatever the GATEWAY names first
   * (`fy --mdsip <addr>`), so an operator's own address arrives from
   * the host that is actually pointed at it, which is also the only place that
   * knows it is still right.
   *
   * These are SUGGESTIONS in the datalist, nothing more: the gateway decides
   * what it will connect to (loopback bind only).
   */
  var SERVERS = [
    { addr: '127.0.0.1:8000', label: 'mds.server.tunnel' },
  ];

  /** The point counts the select offers beside `auto`. */
  var RATES = [256, 1024, 4096, 16000];

  /** The column counts the figure grid offers beside `auto`, and the canvas
   *  height each of them draws at.  ★A figure gets SHORTER as the grid gets
   *  wider on purpose: six 210 px strips stacked are 1 260 px of scroll, and
   *  the whole point of the grid is that the six are read without scrolling.
   *  ★Below `NARROW` the CSS forces one column whatever is chosen — and this
   *  table has to agree with it, or the height would be a two-column height
   *  under a one-column layout. */
  /** At most this many OTHER shots overlaid on the current one.  Three is
   *  where a figure stops being a comparison and becomes a thicket: with six
   *  picks that is already 24 curves, and the legend is the limit long before
   *  the wire is. */
  var MAX_PIN = 3;
  var COLS = [1, 2, 3];
  var COL_H = { 1: 210, 2: 172, 3: 148 };
  var NARROW = 900;

  var state = {
    gw: null,            // /api/health, or null when there is no gateway
    server: null,        // the mdsip server the gateway is asked to use
    tree: null, shot: null,
    stack: [],           // the path from the root to the level on screen
    level: [],           // the level itself, as the gateway listed it
    picked: [],          // {tree, node}, in the order they were picked
    traces: {},          // key(pick, shot) -> what came back, or an error
    //: ★shots kept on screen BESIDES the current one.  Overlaying is opt-in
    //: and explicit: nothing is retained by accident, and what is retained is
    //: listed by number where the reader pinned it.
    pinned: [],
    win: null,           // {x0, x1, u} — the shared time window, or the shot
    rate: 'auto',
    cols: 'auto',        // figures per row, or 'auto' (see colsNow)
    busy: false,
    panning: false,      // a shift-drag is in progress (the readout stands down)
    //: ★the DATE field: `{node, iso}` for the node it was asked about, or
    //: null.  It is fetched once per shot from `/api/node`, never guessed.
    written: null,
    //: ★WHAT THE PAGE IS CURRENTLY ABOUT, as a number.  A fetch is six serial
    //: round trips; a reader who presses `上一炮` in the middle of one has
    //: changed the question, and an answer to the old one must not be written
    //: into the new one's figures.  Every request carries the generation it
    //: was issued under and drops itself if that has moved on.
    gen: 0,
    pending: false,      // a fetch asked for while one was in flight
  };

  /**
   * ★A TRACE IS KEYED BY (tree, node, SHOT).
   *
   * It used to be (tree, node), which was right while the page could only ever
   * be on one shot: overlaying two shots of the same signal made the second
   * one silently overwrite the first, and the figure would have shown one
   * curve while the legend claimed two.  `|` cannot appear in either a tree
   * name or a node path (`isTreeName` / `isNodePath`), so the three parts stay
   * separable — `shotOfKey` reads the last one back.
   */
  function key(p, shot) { return p.tree + '|' + p.node + '|' + shot; }
  function shotOfKey(k) { return Number(k.slice(k.lastIndexOf('|') + 1)); }
  /** The trace for one pick on one shot, or undefined. */
  function traceOf(p, shot) { return state.traces[key(p, shot)]; }
  /** Every shot on screen: the pinned ones, then the current one on top. */
  function shotsShown() {
    var out = state.pinned.slice();
    if (state.shot != null && out.indexOf(state.shot) < 0) out.push(state.shot);
    return out;
  }
  /** Drop every trace whose shot is not pinned — what a shot change keeps. */
  function dropUnpinned() {
    Object.keys(state.traces).forEach(function (k) {
      if (state.pinned.indexOf(shotOfKey(k)) < 0) delete state.traces[k];
    });
  }
  /** Which clock a trace is on: two traces share a window only if they agree.
   *  A node with no time base is on the sample-index axis, which is its own.
   *
   *  ★★THE NAME IS NORMALISED (lower-cased, trimmed) —— 2026-09-01, measured on
   *  the live tree: `east` writes its time units as **`"S"`** (`\VP1`,
   *  `\TOP.T2:TFP`) while `pcs_east` and `efit_east` write **`"s"`**
   *  (`\PCRL01`, `\DFSDEV`, `\WMHD`, `\BCENTR`).  Compared literally, the
   *  loop-voltage trace was on a clock of its own: it stayed out of every
   *  shared window, the drag never reached it, and its caption said so in a
   *  sentence that read like a property of the signal ("这一路的时钟是 S").
   *  Two spellings of the second are one clock.
   *
   *  ★It is only case and spacing that are normalised.  `ms` stays a different
   *  clock from `s` —— those really are different, and guessing a conversion
   *  here would put a factor of 1000 where nobody would look for it. */
  function unitKey(tr) {
    return tr.time ? ('t:' + String(tr.timeUnits || 's').trim().toLowerCase()) : 'i';
  }

  // ------------------------------------------------------------------
  // talking to the gateway
  // ------------------------------------------------------------------

  /**
   * ★Every request is SAME-ORIGIN and relative.  The gateway serves `app/`
   * itself, so the page never needs a cross-origin fetch and never needs CORS.
   * ★The gateway is one directory UP: this page is `pages/data.html` and
   * the request face is mounted at the root of what the gateway serves — the
   * same `../` `mds-source.js` prefixes on the analysis page.
   *
   * ★The `server` the page names is the MDSIP target, not the gateway: it says
   * which device server that one gateway should connect to, and the gateway
   * decides whether it will (loopback only — `gateway.mjs` preamble).  The page
   * cannot be pointed at somebody else's gateway by a query string, which is
   * the shape of hole a "gateway URL" box would open.
   */
  function api(path, params) {
    var q = new URLSearchParams(params || {});
    if (state.server && state.gw && state.server !== state.gw.mdsip) q.set('server', state.server);
    var s = q.toString();
    return fetch('../' + path + (s ? '?' + s : ''), { headers: { accept: 'application/json' } })
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(j && j.error || ('HTTP ' + r.status));
          return j;
        }, function () { throw new Error('HTTP ' + r.status); });
      });
  }

  function note(el, k, params, cls) {
    var e = $(el);
    if (!e) return;
    e.innerHTML = k ? T(k, params) : '';
    e.className = 'note' + (cls ? ' ' + cls : '');
  }

  // ------------------------------------------------------------------
  // the gateway probe
  // ------------------------------------------------------------------

  function probe() {
    note('mds-gw', 'mds.gw.checking');
    return api('api/health').then(function (h) {
      state.gw = h;
      state.server = h.mdsip;
      note('mds-gw', 'mds.gw.up', { server: h.mdsip, user: h.user });
      $('mds-gw-help').hidden = true;
      var sel = $('mds-tree');
      sel.innerHTML = '';
      (h.trees || []).forEach(function (name) {
        var o = document.createElement('option');
        o.value = name; o.textContent = name;
        sel.appendChild(o);
      });
      //: ★只在宿主真有一台时覆盖：宿主没预设服务器时，标记里那个隧道口地址
      //: （`127.0.0.1:8000`）正是读者最可能要的起点，用一个空串把它抹掉是把
      //: 「你来填」变成「从零打」。
      if (h.mdsip) $('mds-server').value = h.mdsip;
      renderServers();
      //: ★the box is greyed by what the GATEWAY says, not by what the page
      //: would prefer: off a loopback bind the set is closed there, and a box
      //: that let a reader type an address only to collect a 400 would be
      //: describing a permission the page does not have.
      $('mds-server').disabled = !!h.locked;
      $('mds-server-use').disabled = !!h.locked;
      note('mds-server-note', h.locked ? 'mds.server.locked' : 'mds.server.free',
           { list: (h.servers || []).join(', ') });
      enable(true);
      loadZero(true);
    }, function () {
      state.gw = null;
      note('mds-gw', 'mds.gw.down', null, 'warn');
      $('mds-gw-help').hidden = false;
      enable(false);
      $('mds-server').disabled = true;
      $('mds-server-use').disabled = true;
      note('mds-server-note', '');
      renderZero();
    });
  }

  /** The suggestion list: what the gateway named, then the EAST addresses —
   *  minus, when the gateway is locked, everything it would refuse anyway. */
  function renderServers() {
    var dl = $('mds-servers');
    dl.innerHTML = '';
    var gw = state.gw || {};
    var seen = {};
    var add = function (addr, label) {
      if (!addr || seen[addr]) return;
      if (gw.locked && (gw.servers || []).indexOf(addr) < 0) return;
      seen[addr] = 1;
      var o = document.createElement('option');
      o.value = addr;
      if (label) o.label = T(label);
      dl.appendChild(o);
    };
    (gw.servers || (gw.mdsip ? [gw.mdsip] : [])).forEach(function (a) { add(a, null); });
    SERVERS.forEach(function (x) { add(x.addr, x.label); });
  }

  function enable(on) {
    ['mds-open', 'mds-tree', 'mds-shot', 'mds-up', 'mds-filter', 'mds-fetch',
     'mds-node', 'mds-add', 'mds-rate', 'mds-cols', 'mds-win-all',
     'mds-prev', 'mds-next', 'mds-latest', 'mds-pin']
      .forEach(function (id) { if ($(id)) $(id).disabled = !on; });
  }

  /** Point the gateway at another mdsip server.  ★Nothing is re-fetched
   *  silently: a shot number means a different shot on a different device, and
   *  a page that redrew the same numbers under a new server name would be
   *  asserting they came from it. */
  function useServer() {
    var v = ($('mds-server').value || '').trim();
    if (!/^(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9][A-Za-z0-9._-]*)(:\d{1,5})?$/.test(v)) {
      note('mds-server-note', 'mds.server.bad', null, 'warn');
      return;
    }
    state.server = v;
    state.gen++;
    state.tree = null; state.shot = null;
    state.stack = []; state.level = [];
    state.traces = {}; state.win = null;
    $('mds-list').innerHTML = '';
    $('mds-crumb').textContent = '';
    note('mds-list-note', '');
    note('mds-open-note', '');
    note('mds-server-note', 'mds.server.set', { server: v });
    draw();
  }

  // ------------------------------------------------------------------
  // walking the tree
  // ------------------------------------------------------------------

  /** The shot the page is about: the box, checked, whether or not a tree was
   *  ever opened — the zero-order quantities do not need one. */
  function shotNow() {
    var raw = $('mds-shot').value.trim();
    if (!/^-?\d{1,9}$/.test(raw)) { note('mds-open-note', 'mds.shot.bad', null, 'warn'); return null; }
    state.shot = Number(raw);
    return state.shot;
  }

  /**
   * Put the page on another shot.
   *
   * ★EVERY CURVE IS DROPPED FIRST.  The same node on another shot is another
   * discharge, and a page that stepped the shot number while the old traces
   * stayed on screen would be captioning one shot's data with another shot's
   * number — the same rule the server box already follows, for the same
   * reason.  The tree listing goes too: a level is a property of a shot.
   */
  function applyShot(shot, why, params) {
    $('mds-shot').value = String(shot);
    if (shotNow() == null) return;
    invalidate();
    note('mds-shot-note', why, params);
    open();
  }

  /**
   * Drop everything that was about the previous shot.
   *
   * ★The traces AND the tree listing AND the time window, and the generation
   * with them.  Each of the three is a statement about one discharge: a curve
   * captioned with the new shot's number, a level listed from a shot that may
   * not even exist, a window in seconds of a different pulse.  Leaving any of
   * them on screen is the page asserting something it did not fetch.
   */
  function invalidate() {
    state.gen++;
    state.written = null;
    //: ★pinned shots SURVIVE a shot change — that is what pinning means.
    //: Everything else about the previous shot goes.
    dropUnpinned();
    state.win = null;
    state.stack = []; state.level = [];
    $('mds-list').innerHTML = '';
    $('mds-crumb').textContent = '';
    note('mds-list-note', '');
    renderWindow();
    draw();
  }

  /**
   * One shot back, or one forward.
   *
   * ★It does NOT hunt for the next shot that has data.  Shot numbers skip —
   * a site counter is not an arithmetic sequence — and a button that silently
   * walked forward until something opened would answer a question the reader
   * did not ask (how far did it go? past what?) and could walk to the end of
   * the counter looking.  So it moves exactly one, and an empty shot number is
   * REPORTED: the tree says it cannot be opened, every picked signal says it
   * has nothing there, and the box stays on that number so pressing again
   * steps past it.
   */
  function stepShot(d) {
    var cur = shotNow();
    if (cur == null) return;
    applyShot(cur + d, 'mds.shot.stepped', { from: cur, shot: cur + d });
  }

  /**
   * The shot the site is on — `current_shot(tree)`, asked of the server.
   *
   * ★The ONE control here that cannot be computed by the page.  Every other
   * button takes the number in the box and does arithmetic on it; this one
   * asks the plant what shot exists, because nothing on this side knows.
   * ★And it is per TREE: `current_shot` counts the tree it is asked about, so
   * the answer says which tree it came from rather than presenting a number as
   * "the" shot.
   */
  function latestShot() {
    var tree = $('mds-tree').value;
    if (!tree) { note('mds-shot-note', 'mds.latest.notree', null, 'warn'); return; }
    note('mds-shot-note', 'mds.latest.asking', { tree: tree });
    api('api/shot', { tree: tree }).then(function (r) {
      applyShot(r.shot, 'mds.latest.got', { tree: r.tree, shot: r.shot, expr: r.expr });
    }, function (e) {
      note('mds-shot-note', 'mds.latest.fail', { tree: tree, why: e.message }, 'warn');
    });
  }

  /**
   * Keep the shot on screen when the page moves to another one.
   *
   * ★PINNING FETCHES NOTHING.  What is pinned is what has already come back:
   * the comparison a reader wants is between the shot they just looked at and
   * the next one, and re-asking the server for a trace it already handed over
   * would be a round trip spent on a bookkeeping decision.
   */
  function pinShot() {
    if (state.shot == null) { note('mds-pin-note', 'mds.pin.noshot', null, 'warn'); return; }
    if (state.pinned.indexOf(state.shot) >= 0) {
      note('mds-pin-note', 'mds.pin.already', { shot: state.shot });
      return;
    }
    if (state.pinned.length >= MAX_PIN) {
      note('mds-pin-note', 'mds.pin.limit', { n: MAX_PIN }, 'warn');
      return;
    }
    state.pinned.push(state.shot);
    renderPins();
    draw();
  }

  /** Stop overlaying one shot.  Its traces go with it — a shot that is not on
   *  screen must not sit in memory pretending to be free to bring back: the
   *  window may have moved since, and what would come back is not what left. */
  function unpin(shot) {
    var i = state.pinned.indexOf(shot);
    if (i < 0) return;
    state.pinned.splice(i, 1);
    if (shot !== state.shot)
      Object.keys(state.traces).forEach(function (k) {
        if (shotOfKey(k) === shot) delete state.traces[k];
      });
    renderPins();
    draw();
  }

  function unpinAll() {
    state.pinned.slice().forEach(unpin);
    note('mds-pin-note', 'mds.pin.none');
  }

  function renderPins() {
    var host = $('mds-pins');
    if (!host) return;
    host.innerHTML = '';
    state.pinned.forEach(function (sh) {
      var b = document.createElement('button');
      b.className = 'ghost';
      b.innerHTML = '#' + sh + ' <span class="x">x</span>';
      b.title = T('mds.pin.drop', { shot: sh });
      b.addEventListener('click', function () { unpin(sh); });
      host.appendChild(b);
    });
    $('mds-unpin').disabled = !state.pinned.length;
    if (state.pinned.length)
      note('mds-pin-note', 'mds.pin.on', { shots: state.pinned.map(function (x) {
        return '#' + x; }).join(' '), cur: state.shot });
    else note('mds-pin-note', 'mds.pin.what');
  }

  function open() {
    var was = state.shot;
    if (shotNow() == null) return;
    //: ★TYPING A NUMBER AND PRESSING 打开 IS A SHOT CHANGE TOO.  Only the
    //: buttons went through `applyShot` at first, and the box did not: a
    //: reader who typed the shot they wanted got the previous shot's curves
    //: left under the new number, because nothing had cleared them.
    if (was != null && was !== state.shot) invalidate();
    state.tree = $('mds-tree').value;
    state.stack = [];
    note('mds-open-note', 'mds.opening', { tree: state.tree, shot: state.shot });
    walk('\\TOP', true).then(function (lvl) {
      if (lvl) note('mds-open-note', 'mds.opened',
                    { tree: state.tree, shot: state.shot, n: lvl.length });
      //: ★a progress line that never resolves is worse than an error.  Left
      //: as it was, a shot this tree never stored kept "正在打开 …" on screen
      //: while the reason sat in the browser's own note below it.
      else note('mds-open-note', 'mds.openfail',
                { tree: state.tree, shot: state.shot }, 'warn');
      //: opening a shot is the moment the zero-order quantities become
      //: answerable, so the figure column fills itself rather than waiting for
      //: a reader to press a button whose effect they cannot yet guess
      //: ★AND IT FETCHES EVEN WHEN THE TREE DID NOT OPEN.  Stepping onto a
      //: shot number this tree never stored is exactly when a reader needs the
      //: other trees to speak: the zero-order quantities carry their own trees,
      //: and each one saying what it has there is the answer.  Waiting on `lvl`
      //: would leave the page silent on the one case the button exists for.
      //: ★"already fetched" is asked ABOUT THIS SHOT.  With a pinned shot on
      //: screen the trace table is never empty, and the old test (any trace at
      //: all) made stepping onto a new shot fetch nothing at all while the
      //: pinned curves sat there looking like an answer.
      var have = state.picked.some(function (p) { return traceOf(p, state.shot); });
      if (state.picked.length && !have) fetchAll();
    });
  }

  /** List one level and show it.  `push` records it on the breadcrumb stack. */
  function walk(path, reset) {
    if (!state.tree) return Promise.resolve(null);
    note('mds-list-note', 'mds.loading', { path: path });
    return api('api/tree', { tree: state.tree, shot: state.shot, path: path })
      .then(function (r) {
        if (reset) state.stack = [path];
        else if (state.stack[state.stack.length - 1] !== path) state.stack.push(path);
        state.level = r.nodes || [];
        renderLevel();
        return state.level;
      }, function (e) {
        note('mds-list-note', 'mds.walkfail', { path: path, why: e.message }, 'warn');
        return null;
      });
  }

  function up() {
    if (state.stack.length < 2) return;
    state.stack.pop();
    var to = state.stack[state.stack.length - 1];
    state.stack.pop();
    walk(to);
  }

  /**
   * ★What is a leaf and what is a door is decided by USAGE, not by guessing.
   * A `TreeUSAGE_STRUCTURE` or `_SUBTREE` node holds other nodes; anything
   * else may hold data.  A node can be both — a signal with members under it —
   * so every row can be descended into and only data-ish rows can be picked.
   */
  function isBranch(n) { return /STRUCTURE|SUBTREE/i.test(n.usage || ''); }

  function renderLevel() {
    var host = $('mds-list');
    var f = ($('mds-filter').value || '').trim().toUpperCase();
    var rows = state.level.filter(function (n) {
      return !f || n.name.toUpperCase().indexOf(f) >= 0;
    });
    var shown = rows.slice(0, MAX_ROWS);

    var tb = document.createElement('table');
    var head = document.createElement('thead');
    head.innerHTML = '<tr><th></th><th>' + T('mds.col.name') + '</th><th>'
      + T('mds.col.usage') + '</th><th>' + T('mds.col.bytes') + '</th></tr>';
    tb.appendChild(head);
    var body = document.createElement('tbody');

    shown.forEach(function (n) {
      var p = { tree: state.tree, node: n.path };
      var tr = document.createElement('tr');
      tr.className = (n.length ? '' : 'empty ')
        + (indexOfPick(p) >= 0 ? 'on ' : '') + 'pick';

      var td0 = document.createElement('td');
      if (!isBranch(n)) {
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = indexOfPick(p) >= 0;
        cb.addEventListener('click', function (ev) { ev.stopPropagation(); toggle(p); });
        td0.appendChild(cb);
      }
      tr.appendChild(td0);

      var td1 = document.createElement('td');
      td1.className = 'name';
      td1.textContent = (isBranch(n) ? '▸ ' : '') + n.name;
      tr.appendChild(td1);

      var td2 = document.createElement('td');
      td2.textContent = String(n.usage || '').replace(/^TreeUSAGE_/, '');
      tr.appendChild(td2);

      var td3 = document.createElement('td');
      td3.className = 'bytes';
      td3.textContent = n.length ? String(n.length) : '—';
      tr.appendChild(td3);

      //: the NAME descends, the checkbox picks.  One click doing both would
      //: mean a reader who wanted the trace loses it by opening the node.
      td1.addEventListener('click', function () { walk(n.path); });
      body.appendChild(tr);
    });
    tb.appendChild(body);
    host.innerHTML = '';
    host.appendChild(tb);

    $('mds-crumb').textContent = state.stack[state.stack.length - 1] || '';
    if (!rows.length) note('mds-list-note', 'mds.empty');
    else if (rows.length > MAX_ROWS) note('mds-list-note', 'mds.big', { n: rows.length });
    else note('mds-list-note', 'mds.listed',
              { path: state.stack[state.stack.length - 1] || '', n: state.level.length,
                shown: shown.length });
  }

  // ------------------------------------------------------------------
  // the selection
  // ------------------------------------------------------------------

  /**
   * ★The same character rule as the client and the gateway, a third time.
   *
   * Not defence — the two behind it are the defence, and this one runs on the
   * reader's own machine where it protects nobody.  It is here so that a typo
   * is answered by the box the reader typed into rather than by a 400 from a
   * process they may not know exists.
   */
  function isNodePath(s) {
    return !!s && s.length <= 256 && /^[A-Za-z0-9_$\\.:-]+$/.test(s);
  }

  /** ★A PICK is (tree, node) — the shot is not part of its identity.  Picking
   *  a signal says "show me this channel"; which shots are on screen is the
   *  shot bar's business, and the same pick carries a trace per shot. */
  function indexOfPick(p) {
    for (var i = 0; i < state.picked.length; i++)
      if (state.picked[i].tree === p.tree && state.picked[i].node === p.node) return i;
    return -1;
  }

  function addTyped() {
    var v = ($('mds-node').value || '').trim();
    if (!isNodePath(v)) { note('mds-node-note', 'mds.direct.bad', null, 'warn'); return; }
    if (!state.tree) { note('mds-node-note', 'mds.direct.notree', null, 'warn'); return; }
    note('mds-node-note', '');
    $('mds-node').value = '';
    var p = { tree: state.tree, node: v };
    if (indexOfPick(p) < 0) toggle(p);
  }

  function toggle(p) {
    var i = indexOfPick(p);
    if (i >= 0) {
      shotsShown().forEach(function (sh) { delete state.traces[key(state.picked[i], sh)]; });
      state.picked.splice(i, 1);
    } else if (state.picked.length >= MAX_PICK) {
      note('mds-picked-note', 'mds.limit', { n: MAX_PICK }, 'warn');
      return;
    } else state.picked.push(p);
    renderPicked();
    renderLevel();
    renderZero();
    draw();
  }

  function renderPicked() {
    var ul = $('mds-picked');
    ul.innerHTML = '';
    state.picked.forEach(function (p, i) {
      var li = document.createElement('li');
      var sw = document.createElement('span');
      sw.className = 'mds-swatch';
      sw.style.background = colourFor(i);
      var code = document.createElement('code');
      code.textContent = p.tree + ':' + p.node;
      var b = document.createElement('button');
      b.className = 'ghost';
      b.textContent = T('mds.remove');
      b.addEventListener('click', function () { toggle(p); });
      li.appendChild(sw); li.appendChild(code); li.appendChild(b);
      ul.appendChild(li);
    });
    if (!state.picked.length) note('mds-picked-note', 'mds.picked.none');
    else note('mds-picked-note', '');
  }

  function colourFor(i) {
    var c = root.FyPlot.palette(document.body);
    return [c.accent, c.alt, c.lcfs, c.coil, c.flux, c.wall][i % 6];
  }

  // ------------------------------------------------------------------
  // the zero-order quantities
  // ------------------------------------------------------------------

  /** A quantity is offerable when the gateway itself offers the tree it lives
   *  in.  Nothing here probes the device: the chip is a name, and whether this
   *  shot stored anything under it is answered by fetching it and saying so. */
  function offered(z) {
    return !!state.gw && (state.gw.trees || []).indexOf(z.tree) >= 0;
  }

  function renderZero() {
    var host = $('mds-zero');
    host.innerHTML = '';
    ZERO.forEach(function (z) {
      var b = document.createElement('button');
      b.className = 'ghost' + (indexOfPick(z) >= 0 ? ' on' : '');
      b.disabled = !offered(z);
      b.innerHTML = T('mds.q.' + z.key)
        + '<span class="src">' + z.tree + ':' + z.node + '</span>';
      b.addEventListener('click', function () { toggle({ tree: z.tree, node: z.node }); });
      host.appendChild(b);
    });
    var missing = ZERO.filter(function (z) { return !offered(z); });
    if (!state.gw) note('mds-zero-note', '');
    else if (missing.length === ZERO.length)
      note('mds-zero-note', 'mds.zero.off',
           { trees: (state.gw.trees || []).join(', ') }, 'warn');
    else note('mds-zero-note', '');
  }

  /** The four that open a shot.  `quiet` is the boot path: it fills the
   *  selection but does not fetch, because no shot has been opened yet. */
  function loadZero(quiet) {
    ZERO.forEach(function (z) {
      if (!z.on || !offered(z)) return;
      if (indexOfPick(z) < 0 && state.picked.length < MAX_PICK)
        state.picked.push({ tree: z.tree, node: z.node });
    });
    renderPicked();
    renderZero();
    if (!quiet) fetchAll();
  }

  // ------------------------------------------------------------------
  // the status line
  // ------------------------------------------------------------------

  /** The trace a status field reads, on the current shot, or null. */
  function statusTrace(f) {
    if (!f.node) return null;
    var tr = traceOf({ tree: f.tree, node: f.node }, state.shot);
    return tr && !tr.error ? tr : null;
  }

  /** The sample of largest magnitude, which for a current or a field is the
   *  flat top.  ★Returned as the SAMPLE (value and time), not as a maximum of
   *  something smoothed: the caption already says these are every Nth sample
   *  and the status line must not imply it saw more. */
  function peakSample(tr) {
    var at = 0, best = -Infinity;
    for (var i = 0; i < tr.data.length; i++) {
      var v = Math.abs(tr.data[i]);
      if (isFinite(v) && v > best) { best = v; at = i; }
    }
    return { v: tr.data[at], t: tr.x ? tr.x[at] : at, abs: best };
  }

  /** How long |y| stayed above `ON_FRACTION` of its peak — the discharge, by
   *  this page's own rule. */
  function onSpan(tr) {
    var pk = peakSample(tr);
    if (!(pk.abs > 0) || !tr.x) return null;
    var lim = ON_FRACTION * pk.abs, t0 = null, t1 = null;
    for (var i = 0; i < tr.data.length; i++) {
      if (Math.abs(tr.data[i]) >= lim) { if (t0 === null) t0 = tr.x[i]; t1 = tr.x[i]; }
    }
    return t0 === null ? null : { t0: t0, t1: t1, dt: t1 - t0, lim: lim };
  }

  /**
   * Ask the gateway when one of this shot's records was written.
   *
   * ★ONE REQUEST PER SHOT, and only for a node this shot actually answered:
   * the tree root carries no record (it answers the VMS epoch, which would
   * print as 1858), and a node that failed has nothing to date.  The answer
   * is cached in `state.written` until the shot changes.
   */
  function loadWritten() {
    if (state.shot == null) return;
    var here = state.gen;
    var pick = null;
    state.picked.some(function (p) {
      var tr = traceOf(p, state.shot);
      if (tr && !tr.error) { pick = p; return true; }
      return false;
    });
    if (!pick) { state.written = null; return; }
    if (state.written && state.written.node === pick.node
        && state.written.shot === state.shot) return;
    api('api/node', { tree: pick.tree, shot: state.shot, node: pick.node })
      .then(function (r) {
        if (here !== state.gen) return;
        state.written = r.insertedIso
          ? { tree: pick.tree, node: pick.node, shot: state.shot, iso: r.insertedIso } : null;
        renderStatus();
      }, function () { /* the field simply stays empty and says why */ });
  }

  /**
   * Draw the status line.
   *
   * ★A FIELD IS IN EXACTLY ONE OF THREE STATES, and the reader can tell which
   * at a glance: it has a value (and then it names the node, and the rule if
   * the number was derived); it COULD have one but the trace is not on screen
   * (and then it offers the pick that would give it); or this repository has
   * not verified where it comes from (and then it stays blank and says so).
   * There is no fourth state where a plausible number appears from nowhere.
   */
  function renderStatus() {
    var host = $('mds-status');
    if (!host) return;
    host.innerHTML = '';
    STATUS.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'mds-st';
      var val = '—', from = '', cls = '';

      if (f.kind === 'page') {
        val = state.shot == null ? '—' : '#' + state.shot;
        from = state.shot == null ? T('mds.st.noshot')
                                  : T('mds.st.from.page', { tree: state.tree || $('mds-tree').value || '—' });
      } else if (f.kind === 'written') {
        var w = state.written;
        if (!w) {
          cls = ' missing';
          from = T('mds.st.nodate');
        } else {
          //: ★the DATE the page prints is the record's write time, to the
          //: minute: printing seconds would suggest this is the shot clock.
          val = w.iso.slice(0, 16).replace('T', ' ') + 'Z';
          from = T('mds.st.from.written', { node: w.tree + ':' + w.node });
        }
      } else {
        var tr = statusTrace(f);
        if (!tr) {
          cls = ' missing';
          from = T('mds.st.pick', { node: f.tree + ':' + f.node });
        } else if (f.kind === 'peak') {
          var pk = peakSample(tr);
          val = fmt(pk.v) + ' ' + (tr.units || '');
          from = T('mds.st.from.' + f.key,
                   { node: f.tree + ':' + f.node, t: fmt(pk.t), u: tr.timeUnits || 's' });
        } else if (f.kind === 'pulse') {
          var sp = onSpan(tr);
          if (!sp) { cls = ' missing'; from = T('mds.st.nopulse', { node: f.tree + ':' + f.node }); }
          else {
            val = fmt(sp.dt) + ' ' + (tr.timeUnits || 's');
            from = T('mds.st.from.pulse', { node: f.tree + ':' + f.node,
                                            pct: Math.round(ON_FRACTION * 100),
                                            t0: fmt(sp.t0), t1: fmt(sp.t1),
                                            u: tr.timeUnits || 's' });
          }
        }
      }

      row.className = 'mds-st' + cls;
      var k = document.createElement('span');
      k.className = 'k';
      k.innerHTML = T('mds.st.' + f.key);
      var v = document.createElement('span');
      v.className = 'v';
      v.textContent = val;
      var w = document.createElement('span');
      w.className = 'w';
      w.innerHTML = from;
      row.appendChild(k); row.appendChild(v); row.appendChild(w);
      //: the field that is missing only because its trace is not on screen
      //: offers the one click that fixes it — the reader should not have to
      //: work out which node the line meant.
      if (cls === ' missing' && f.node && indexOfPick({ tree: f.tree, node: f.node }) < 0) {
        var b = document.createElement('button');
        b.className = 'ghost';
        b.textContent = T('mds.st.add');
        b.addEventListener('click', function () {
          toggle({ tree: f.tree, node: f.node });
          fetchAll();
        });
        row.appendChild(b);
      }
      host.appendChild(row);
    });
  }

  // ------------------------------------------------------------------
  // fetching: the two passes, and the window they run inside
  // ------------------------------------------------------------------

  /** Points per trace the SECOND pass aims at.  `auto` is the figure's own
   *  width in CSS pixels: one sample per pixel column is the most a line plot
   *  can show, and anything beyond it is wire and wait spent on pixels that do
   *  not exist. */
  function target() {
    var max = (state.gw && state.gw.maxPoints) || 20000;
    if (state.rate !== 'auto') return Math.min(max, state.rate);
    var host = $('mds-figs');
    var cv = host.querySelector('canvas');
    var w = (cv && cv.clientWidth) || host.clientWidth || 700;
    return Math.max(64, Math.min(max, Math.round(w)));
  }

  /** ★WHICH WINDOW A REQUEST IS FOR, as one comparable string — `''` is the
   *  whole shot.  A trace remembers the tag it came back under, and that is
   *  what tells a trace already following the window from one still on the
   *  whole shot (T-S8): stride cannot say it, because two shots of different
   *  length have different strides for the same window. */
  function winTag() {
    return state.win ? state.win.u + ':' + state.win.x0 + ':' + state.win.x1 : '';
  }

  /**
   * Where in the node's samples the shared window falls, for one trace.
   *
   * ★The mapping is done from the trace ALREADY ON SCREEN: it is the only
   * thing that knows which sample index carries which time, because the page
   * never sees the samples in between.  `first + i * stride` is the index of
   * the i-th point the gateway returned, and the gateway echoes both.
   *
   * ★AND IT IS PER SHOT.  The window is in seconds and shared; the sample
   * indices it lands on are not — a pinned shot is a different discharge with
   * its own length and its own stride, so it is mapped through ITS OWN trace.
   * Mapping every shot through the current one's samples would ask the server
   * for the right seconds of the wrong pulse.
   */
  function planFor(p, shot) {
    if (!state.win) return { win: null };
    var tr = traceOf(p, shot);
    if (!tr || tr.error || !tr.x) return { win: null, why: 'nomap' };
    if (unitKey(tr) !== state.win.u) return { win: null, why: 'clock' };
    var x = tr.x, k0 = -1, k1 = -1;
    for (var i = 0; i < x.length; i++) {
      if (k0 < 0 && x[i] >= state.win.x0) k0 = i;
      if (x[i] <= state.win.x1) k1 = i;
    }
    if (k0 < 0 || k1 < k0) return { skip: true, why: 'outside' };
    //: one point of pad on each side, so the drawn curve reaches the edges of
    //: the window instead of stopping a stride short of them
    return { win: { first: Math.max(0, tr.first + (k0 - 1) * tr.stride),
                    last: tr.first + (k1 + 1) * tr.stride } };
  }

  /** One request for one node on one shot at one point count, under
   *  generation `gen`. */
  function pull(p, points, gen, shot) {
    var stale = function () { return gen !== state.gen; };
    //: ★the shot is PASSED IN, captured by the caller at call time and never
    //: read back when the answer lands.  A reply that arrives after the reader
    //: has moved on must not be filed under the shot they moved to — `gen`
    //: already drops those, and keying by the shot it was asked for means even
    //: a kept one cannot be misfiled.  ★It is a parameter and not `state.shot`
    //: because the pinned pass (T-S8) asks for a shot the page is not on.
    var plan = planFor(p, shot);
    //: which window this request is for, remembered on the answer below
    var tag = winTag();
    if (plan.skip) {
      var old = traceOf(p, shot);
      if (old) old.why = plan.why;
      draw();
      return Promise.resolve(null);
    }
    var q = { tree: p.tree, shot: shot, node: p.node, points: points };
    if (plan.win) { q.first = plan.win.first; q.last = plan.win.last; }
    return api('api/signal', q).then(function (s) {
      if (stale()) return null;
      s.x = s.time || s.data.map(function (_, i) { return s.first + i * s.stride; });
      s.why = plan.why || '';
      s.winTag = tag;
      state.traces[key(p, shot)] = s;
      draw();
      return s;
    }, function (e) {
      if (stale()) return null;
      state.traces[key(p, shot)] = { tree: p.tree, node: p.node, shot: shot, error: e.message };
      draw();
      return null;
    });
  }

  /** Walk a list of picks through one pass, one request at a time.
   *  ★SEQUENTIAL, not `Promise.all`: one mdsip socket carries one question at
   *  a time and the gateway serialises anyway, so firing six at once would
   *  only queue them behind a status line claiming all six were in flight.
   *  One at a time also means the first curve appears while the sixth is still
   *  coming. */
  function pass(list, points, msg, gen) {
    return list.reduce(function (chain, p) {
      return chain.then(function () {
        if (gen !== state.gen) return null;
        note('mds-fetch-note', msg, { node: p.tree + ':' + p.node });
        return pull(p, points, gen, state.shot);
      });
    }, Promise.resolve());
  }

  /**
   * ★THE PINNED SHOTS FOLLOW THE WINDOW TOO (T-S8).
   *
   * Until this existed, zooming refined only the shot the page was ON: the
   * pinned curve beside it stayed at the whole shot's stride, so one figure
   * carried two curves sampled differently and "zooming really does sharpen
   * it" was paid out to one of the two.  The captions did say so — but a
   * reader had to infer it from two stride numbers, and the whole reason this
   * page overlays shots is that the comparison should be like for like.
   *
   * ★ONE PASS, NOT TWO.  The current shot gets a coarse pass first because
   * its figures would otherwise be empty while the wire fills; a pinned shot
   * already HAS a curve on screen, so a coarse pass would only replace a good
   * curve with a worse one on the way to the same place.  So: one request per
   * (pinned shot × pick), straight at the figure's resolution, after the
   * current shot's two passes have landed.
   *
   * ★AND ONLY WHAT IS ALREADY ON SCREEN.  A pinned shot that never had this
   * node fetched stays absent: pinning KEEPS what came back, it does not go
   * and get more, and a window change is not the moment to change that.
   * ★A trace whose `winTag` already matches is skipped, so the pass costs
   * nothing when nothing moved, and clearing the window (`winTag` back to
   * `''`) puts the pinned curves back on the whole shot rather than leaving
   * them zoomed under a caption that says the whole shot is on screen.
   */
  function passPinned(want, gen) {
    var tag = winTag(), tgt = target();
    var jobs = [];
    state.pinned.forEach(function (sh) {
      if (sh === state.shot) return;
      want.forEach(function (p) {
        var t = traceOf(p, sh);
        if (!t || t.error) return;
        //: ★the window is not the only thing that can put the two shots on
        //: different strides: raising the sampling (or widening the figures)
        //: refines the current shot on the next fetch, and a pinned trace left
        //: behind would be the same defect one control over.  So the second
        //: half of this test is the REFINE PASS'S OWN rule, asked about a
        //: pinned trace — anything already at the figure's resolution has
        //: nothing to gain from a round trip, and is skipped.
        if (t.winTag === tag && !(t.stride > 1 && tgt > t.returned + 8)) return;
        jobs.push({ p: p, shot: sh });
      });
    });
    if (!jobs.length) return Promise.resolve(0);
    return jobs.reduce(function (chain, j) {
      return chain.then(function () {
        if (gen !== state.gen) return null;
        note('mds-fetch-note', 'mds.repinning',
             { node: j.p.tree + ':' + j.p.node, shot: j.shot });
        return pull(j.p, tgt, gen, j.shot);
      });
    }, Promise.resolve()).then(function () { return jobs.length; });
  }

  function fetchAll() {
    //: ★A FETCH IN FLIGHT IS SUPERSEDED, NOT DROPPED.  This used to be a bare
    //: `return`, and pressing `上一炮` during the six round trips of the
    //: previous shot left the new shot with no fetch at all — the page then
    //: sat showing the old shot's status line under the new shot's number.
    if (state.busy) { state.pending = true; return Promise.resolve(); }
    if (!state.picked.length) {
      note('mds-fetch-note', 'mds.picked.none', null, 'warn');
      return Promise.resolve();
    }
    if (shotNow() == null) return Promise.resolve();
    var want = state.picked.slice();
    var gen = state.gen;
    state.busy = true;
    $('mds-fetch').disabled = true;
    var coarse = Math.min(INITIAL, target());
    //: ★the chain is RETURNED: restoring a workspace walks several shots one
    //: after another, and "one after another" needs something to wait on.
    return pass(want, coarse, 'mds.fetching', gen)
      .then(function () {
        //: the refine pass only visits traces where a finer stride would
        //: actually put more samples on screen: an already-complete trace and
        //: a node shorter than the figure is wide are both done.
        var tgt = target();
        var more = want.filter(function (p) {
          var t = traceOf(p, state.shot);
          return t && !t.error && t.stride > 1 && tgt > t.returned + 8;
        });
        if (!more.length) return null;
        return pass(more, tgt, 'mds.refining', gen).then(function () { return more.length; });
      })
      //: the pinned shots follow, once, after the current one has landed
      .then(function (n) {
        return passPinned(want, gen).then(function (pins) { return { n: n, pins: pins }; });
      })
      .then(function (r) {
        var n = r.n, pins = r.pins;
        state.busy = false;
        $('mds-fetch').disabled = !state.gw;
        //: the question moved while this was in flight: whatever came back
        //: describes a shot the page is no longer on, and the run that
        //: superseded it writes its own status line.
        if (gen !== state.gen) return;
        if (state.pending) { state.pending = false; fetchAll(); return; }
        var got = want.filter(function (p) {
          var t = traceOf(p, state.shot);
          return t && !t.error;
        }).length;
        //: ★NOTHING CAME BACK is its own message, not "0 signals".  It is
        //: what stepping onto a shot number the site never wrote looks like
        //: from here, and the figures below each carry the server's own words
        //: for why — silence would read as a page that had not been pressed.
        if (!got) note('mds-fetch-note', 'mds.got.none',
                       { shot: state.shot, n: want.length }, 'warn');
        else if (n) note('mds-fetch-note', 'mds.got.refined', { n: got, refined: n, points: target() });
        else note('mds-fetch-note', 'mds.got', { n: got });
        //: ★and the round trips the pinned shots cost are SAID.  Nobody
        //: pressed anything to spend them; a page that spent them silently
        //: would be the same page that let the two strides differ silently,
        //: one level down.
        if (pins) {
          var el = $('mds-fetch-note');
          if (el) el.innerHTML += ' ' + T('mds.got.pinned',
            { pins: pins, shots: state.pinned.filter(function (x) { return x !== state.shot; })
                .map(function (x) { return '#' + x; }).join(' ') });
        }
        loadWritten();
      });
  }

  /** A drag on any figure sets the window for every trace on the same clock. */
  function setWindow(x0, x1, u) {
    if (!(x1 > x0)) return;
    state.win = { x0: x0, x1: x1, u: u };
    renderWindow();
    fetchAll();
  }

  function clearWindow() {
    if (!state.win) return;
    state.win = null;
    renderWindow();
    fetchAll();
  }

  function renderWindow() {
    if (!state.win) note('mds-win-note', 'mds.win.none');
    else note('mds-win-note', 'mds.win.on',
              { t0: fmt(state.win.x0), t1: fmt(state.win.x1),
                u: state.win.u === 'i' ? T('mds.axis.i') : state.win.u.slice(2) });
  }

  // ------------------------------------------------------------------
  // drawing
  // ------------------------------------------------------------------

  /**
   * How many figures go side by side.
   *
   * ★Below `NARROW` the answer is 1 whatever is selected, because the
   * stylesheet says so — and if this disagreed with it the figures would be
   * laid out in one column while being drawn at a two-column height.
   */
  function colsNow() {
    if (root.innerWidth && root.innerWidth <= NARROW) return 1;
    if (state.cols !== 'auto') return state.cols;
    //: `auto`: one or two traces get the full width — a lone curve read for the
    //: shape of its flat top is worth 700 px — and three or more pair up, so
    //: the six zero-order quantities land as 2 x 3.
    return state.picked.length >= 3 ? 2 : 1;
  }

  /** Set the grid, and the height that goes with it, BEFORE the canvases are
   *  appended: `FyPlot` reads the box it is given, and a canvas that lands at
   *  full width and is then narrowed by a later style write is drawn once at
   *  the wrong width. */
  function applyCols() {
    var c = colsNow();
    var host = $('mds-figs');
    host.style.setProperty('--mds-cols', String(c));
    host.style.setProperty('--mds-fig-h', COL_H[c] + 'px');
    return c;
  }

  /**
   * One figure per PICK, laid out in the grid `applyCols` sets — and every
   * shot on screen drawn into it.
   *
   * ★DIFFERENT SIGNALS ARE NOT OVERLAID.  They are picked by the reader from
   * whatever the tree holds — degrees beside amperes beside volts — and a
   * shared y axis would either flatten five of them to a line or need a second
   * axis nobody asked for.  Side by side, each keeps its own scale and its own
   * units in the caption; what the grid buys is that they are read TOGETHER,
   * which a stack turns into scrolling.
   *
   * ★THE SAME SIGNAL ON DIFFERENT SHOTS *IS* OVERLAID, and that is the one
   * comparison this page could not make before: same channel, same units, same
   * clock — the axes mean the same thing, so sharing them is honest.  The
   * current shot is solid, a pinned one dashed, and every curve says its own
   * shot number in the legend and in the caption.  A figure never carries two
   * shots without naming both.
   */
  function draw() {
    var host = $('mds-figs');
    host.innerHTML = '';
    var cols = applyCols();
    var shots = shotsShown();
    var drawn = 0;
    state.picked.forEach(function (p, i) {
      var got = shots.map(function (sh) { return { shot: sh, tr: traceOf(p, sh) }; })
        .filter(function (e) { return e.tr; });
      if (!got.length) return;
      var many = got.length > 1;

      var fig = document.createElement('figure');
      var cap = document.createElement('figcaption');
      var lines = [], series = [], ok = null;

      got.forEach(function (e) {
        var s = e.tr;
        //: one shot: the caption names the channel and the shot.  Several: the
        //: channel is named once at the top and each line is a shot.
        var who = many ? ('#' + e.shot) : (p.tree + ':' + p.node + ' #' + e.shot);
        if (s.error) { lines.push(T('mds.cap.fail', { node: who, why: s.error })); return; }
        var txt = T(s.decimated ? 'mds.cap.dec' : 'mds.cap.full',
                    { node: who, n: s.n, stride: s.stride, shown: s.returned });
        if (s.windowed)
          txt += ' ' + T('mds.cap.window', { first: s.first, last: s.last,
                                             t0: fmt(s.x[0]), t1: fmt(s.x[s.x.length - 1]),
                                             u: s.time ? (s.timeUnits || 's') : T('mds.axis.i') });
        if (s.why === 'clock') txt += ' ' + T('mds.win.skip', { u: s.timeUnits || 's' });
        if (s.why === 'outside') txt += ' ' + T('mds.win.outside');
        lines.push(txt);
        ok = ok || s;
        series.push({ x: s.x, y: s.data, color: colourFor(i), units: s.units || '',
                      //: same colour, different stroke: the channel is the
                      //: colour, the shot is the dash — and the legend says
                      //: which is which rather than leaving it to be guessed
                      dash: e.shot === state.shot ? null : [5, 3],
                      label: many ? (p.node + ' #' + e.shot) : p.node });
      });
      if (many) lines.unshift('<strong>' + p.tree + ':' + p.node + '</strong>');

      if (!series.length) {
        fig.className = 'dead';
        cap.innerHTML = lines.join('<br>');
        fig.appendChild(cap);
        host.appendChild(fig);
        return;
      }

      var cv = document.createElement('canvas');
      fig.appendChild(cv);
      cap.innerHTML = lines.join('<br>');
      fig.appendChild(cap);
      host.appendChild(fig);
      drawn++;

      root.FyPlot.xy(cv, {
        series: series,
        xlabel: ok.time ? T('mds.axis.t', { u: ok.timeUnits || 's' }) : T('mds.axis.i'),
        ylabel: ok.units || '',
      });
      wireZoom(cv, fig, ok);
      wireRead(cv, fig, series, ok);
      wireSave(fig, p, got);
    });
    if (!drawn && !host.children.length) note('mds-figs-note', 'mds.figs.none');
    //: the layout says what it is: a reader who chose `auto` should not have
    //: to count columns to know what it chose, and the narrow-screen fallback
    //: is a rule they cannot see happen on a wide one
    else note('mds-figs-note', 'mds.cols.now', { cols: cols, n: host.children.length });
    renderTable();
    renderStatus();
  }

  /**
   * ★Drag to choose a window, double-click to go back to the shot.
   *
   * The rectangle is a DIV over the canvas, not a second painter on it: the
   * plot module owns those pixels and re-rendering the trace on every mouse
   * move to show a selection would redraw a 4 000-point line at 60 Hz to move
   * one edge.  `canvas.fyxy` is what the plot leaves behind so that a page can
   * turn a pixel back into a time.
   */
  function wireZoom(cv, fig, s) {
    cv.addEventListener('dblclick', clearWindow);
    cv.addEventListener('mousedown', function (ev) {
      if (ev.button !== 0 || !cv.fyxy) return;
      var box = cv.getBoundingClientRect();
      var p0 = ev.clientX - box.left;
      var a = cv.fyxy.toData(p0, ev.clientY - box.top);
      if (!a.inside) return;
      ev.preventDefault();
      //: ★SHIFT-DRAG SLIDES THE WINDOW, and it is the same window and the same
      //: re-fetch a selection makes — sliding is not a second kind of zoom, it
      //: is the same interval at a different offset.  With no window there is
      //: nothing to slide (the whole shot has no outside), and the page says
      //: that rather than doing nothing.
      if (ev.shiftKey) return panFrom(cv, ev, a, s);
      var sel = document.createElement('div');
      sel.className = 'mds-sel';
      sel.style.height = cv.clientHeight + 'px';
      fig.appendChild(sel);
      var p1 = p0;
      var move = function (e) {
        p1 = Math.max(0, Math.min(box.width, e.clientX - box.left));
        sel.style.left = Math.min(p0, p1) + 'px';
        sel.style.width = Math.abs(p1 - p0) + 'px';
      };
      var done = function () {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', done);
        sel.remove();
        if (Math.abs(p1 - p0) < DRAG_PX) return;   // a click, not a window
        var b = cv.fyxy.toData(p1, ev.clientY - box.top);
        setWindow(Math.min(a.x, b.x), Math.max(a.x, b.x), unitKey(s));
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', done);
    });
  }

  /**
   * ★HOVER GIVES A READING, AND CHANGES NOTHING.
   *
   * UDAClient makes this a MODE — you declare `Point`, then you may read.  In
   * a browser the three things a reader wants from a figure (read a value,
   * zoom into a stretch, slide the window) are not mutually exclusive unless
   * somebody makes them so, so this page does not: hovering reads, dragging
   * selects, shift-dragging pans.  ★And hovering issues NO request: what it
   * shows is the sample already on screen, at the stride the caption names —
   * a readout that fetched would make moving the mouse a load on the site.
   */
  function wireRead(cv, fig, series, ok) {
    var out = document.createElement('div');
    out.className = 'mds-read';
    out.hidden = true;
    fig.appendChild(out);
    var xu = ok.time ? (ok.timeUnits || 's') : T('mds.axis.i');
    cv.addEventListener('mousemove', function (ev) {
      if (!cv.fyxy || state.panning) return;
      var box = cv.getBoundingClientRect();
      var at = cv.fyxy.toData(ev.clientX - box.left, ev.clientY - box.top);
      if (!at.inside) { out.hidden = true; return; }
      var parts = series.map(function (se) {
        var j = nearestIndex(se.x, at.x);
        //: ★the sample, not the cursor.  Reading back the y the mouse is at
        //: would report a number that is nowhere in the data; what is drawn is
        //: samples, so what is read is a sample — and the x it names is that
        //: sample's own x, which is how a reader sees the stride.
        return T('mds.read.one', { label: se.label, t: fmt(se.x[j]), xu: xu,
                                  y: fmt(se.y[j]), yu: se.units || '' });
      });
      out.hidden = false;
      out.innerHTML = parts.join(' · ');
    });
    cv.addEventListener('mouseleave', function () { out.hidden = true; });
  }

  /** Index of the sample nearest `v` in a monotonic array. */
  function nearestIndex(x, v) {
    var lo = 0, hi = x.length - 1;
    if (hi <= 0) return 0;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (x[mid] <= v) lo = mid; else hi = mid;
    }
    return Math.abs(x[lo] - v) <= Math.abs(x[hi] - v) ? lo : hi;
  }

  /**
   * ★ONE FIGURE, ONE PNG — and the file name carries the tree, the node and
   * the shot.
   *
   * A picture saved out of a browser loses everything the page said around it;
   * a file called `plot(3).png` is a curve nobody can attribute a week later.
   * The name is therefore the provenance that survives the download.
   * ★No `Copy to clipboard`: in a restricted context it fails SOMETIMES, and a
   * button that works most of the time is worse than one that is not there.
   */
  function wireSave(fig, p, got) {
    var b = document.createElement('button');
    b.className = 'ghost mds-png';
    b.textContent = T('mds.png');
    b.addEventListener('click', function () {
      var cv = fig.querySelector('canvas');
      if (!cv) return;
      var name = 'fylite_' + p.tree + '_' + p.node.replace(/[^A-Za-z0-9_]+/g, '') + '_'
        + got.map(function (e) { return e.shot; }).join('_') + '.png';
      if (cv.toBlob) cv.toBlob(function (blob) { saveBlob(name, blob); });
      else saveBlob(name, dataUrlToBlob(cv.toDataURL('image/png')));
    });
    fig.appendChild(b);
  }

  function dataUrlToBlob(url) {
    var bin = atob(url.split(',')[1]), n = bin.length, u8 = new Uint8Array(n);
    for (var i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: 'image/png' });
  }

  /**
   * Slide the shared window by however far the mouse travelled.
   *
   * ★ONE FETCH, at the end.  Re-fetching on every mouse move would put the
   * server behind the mouse — the same reason the selection rectangle is a DIV
   * and not a redraw.  While the drag is live the figure does not move; the
   * readout says where it will land.
   */
  function panFrom(cv, ev, a, s) {
    if (!state.win) { note('mds-win-note', 'mds.pan.nowin', null, 'warn'); return; }
    if (unitKey(s) !== state.win.u) { note('mds-win-note', 'mds.pan.clock', null, 'warn'); return; }
    var box = cv.getBoundingClientRect();
    var out = cv.parentNode.querySelector('.mds-read');
    state.panning = true;
    cv.style.cursor = 'grabbing';
    var dt = 0;
    var move = function (e) {
      var b = cv.fyxy.toData(Math.max(0, Math.min(box.width, e.clientX - box.left)),
                             ev.clientY - box.top);
      dt = a.x - b.x;
      if (out) {
        out.hidden = false;
        out.innerHTML = T('mds.pan.live', { t0: fmt(state.win.x0 + dt),
                                            t1: fmt(state.win.x1 + dt) });
      }
    };
    var done = function () {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', done);
      state.panning = false;
      cv.style.cursor = '';
      if (out) out.hidden = true;
      if (!dt) return;
      setWindow(state.win.x0 + dt, state.win.x1 + dt, state.win.u);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', done);
  }

  function renderTable() {
    var tb = $('mds-scalars');
    tb.innerHTML = '';
    var shots = shotsShown();
    state.picked.forEach(function (p) {
      shots.forEach(function (sh) {
        var s = traceOf(p, sh);
        if (!s || s.error) return;
        var lo = Infinity, hi = -Infinity;
        s.data.forEach(function (v) { if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } });
        var span = s.time && s.time.length
          ? fmt(s.time[0]) + ' … ' + fmt(s.time[s.time.length - 1]) + ' ' + (s.timeUnits || 's')
          : '—';
        var tr = document.createElement('tr');
        //: ★the shot is the FIRST column, not a heading above the table: with
        //: two shots on screen every other number in the row means nothing
        //: without it.
        ['#' + sh, p.tree, p.node, s.units || '—', s.n, s.stride, fmt(lo), fmt(hi), span]
          .forEach(function (v, k) {
            var td = document.createElement('td');
            td.textContent = String(v);
            if (k === 2) td.className = 'name';
            tr.appendChild(td);
          });
        tb.appendChild(tr);
      });
    });
  }

  function fmt(v) {
    if (!isFinite(v)) return '—';
    var a = Math.abs(v);
    if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(3);
    return String(Math.round(v * 1e4) / 1e4);
  }

  // ------------------------------------------------------------------
  // export
  // ------------------------------------------------------------------

  /**
   * ★The export carries its PROVENANCE, and the provenance includes the
   * stride AND the window.  A file of numbers whose caption stayed in the
   * browser is a file that will be read as the signal itself.
   */
  function exportJson() {
    var shots = shotsShown();
    var got = [];
    state.picked.forEach(function (p) {
      shots.forEach(function (sh) {
        var s = traceOf(p, sh);
        if (s && !s.error) got.push({ shot: sh, s: s });
      });
    });
    if (!got.length) { note('mds-fetch-note', 'mds.nothing', null, 'warn'); return; }
    var doc = {
      source: 'mdsplus',
      server: state.server,
      shot: state.shot,
      //: ★EVERY SIGNAL CARRIES ITS OWN SHOT, and the top-level `shot` is only
      //: which one the page was on when the file was written.  With two shots
      //: overlaid a single file-level shot number would label half the arrays
      //: with the wrong discharge — the one mistake this file format can make
      //: that nobody reading it later could detect.
      shots: shots,
      taken_by: 'fylite (fylite)',
      note: 'every `stride`-th sample of [first, last]; not a mean and not a min/max envelope',
      signals: got.map(function (e) {
        var s = e.s;
        return { tree: s.tree, node: s.node, shot: e.shot, units: s.units,
                 time_units: s.timeUnits, samples: s.n, first: s.first, last: s.last,
                 stride: s.stride, returned: s.returned, time: s.time, data: s.data };
      }),
    };
    save('fylite_mds_' + shots.join('_') + '.json', JSON.stringify(doc, null, 1));
    note('mds-fetch-note', 'mds.saved', { n: got.length });
  }

  /**
   * The WORKSPACE: what the page is set to, and not one sample of what it
   * fetched.
   *
   * ★NO DATA IN THIS FILE.  The page's own boundary line says it is not a data
   * repository — samples are not kept, every look goes back to the server —
   * and a workspace that carried arrays would be exactly the thing that line
   * denies: a copy of the shot with no provenance, ageing quietly on a disk.
   * What it carries is the six things a reader set: server, tree, shot,
   * picks, layout, window (plus the pinned shots, which are shot numbers, not
   * data).  Restoring it goes back to the server for everything else.
   */
  function exportWorkspace() {
    var doc = {
      '@type': 'fylite:MdsWorkspace/1',
      saved_by: 'app/pages/data.html (fylite)',
      note: 'controls only — no samples: this page is not a data repository',
      server: state.server,
      tree: $('mds-tree').value || state.tree,
      shot: state.shot,
      pinned: state.pinned.slice(),
      picked: state.picked.map(function (p) { return { tree: p.tree, node: p.node }; }),
      cols: state.cols,
      rate: state.rate,
      window: state.win ? { x0: state.win.x0, x1: state.win.x1, clock: state.win.u } : null,
    };
    save('fylite_mds_workspace_' + (state.shot == null ? 'none' : state.shot) + '.json',
         JSON.stringify(doc, null, 1));
    note('mds-ws-note', 'mds.ws.saved', { n: doc.picked.length });
  }

  /**
   * Put the page back the way a workspace file describes it, then go and get
   * the data again — pinned shots first, the current one last, in that order
   * so the current shot is the one the status line and the window are about.
   *
   * ★A FILE THAT IS NOT ONE IS REFUSED BY ITS `@type`, and every pick in it is
   * re-checked against the same character rule the box applies: a workspace is
   * a file from somewhere, and "somewhere" includes an editor.
   */
  function importWorkspace(text) {
    var doc;
    try { doc = JSON.parse(text); } catch (e) {
      note('mds-ws-note', 'mds.ws.bad', { why: e.message }, 'warn');
      return;
    }
    if (!doc || doc['@type'] !== 'fylite:MdsWorkspace/1') {
      note('mds-ws-note', 'mds.ws.nottype', { type: (doc && doc['@type']) || '—' }, 'warn');
      return;
    }
    var picks = (doc.picked || []).filter(function (p) {
      return p && isNodePath(p.node || '') && /^[A-Za-z0-9_]+$/.test(p.tree || '');
    }).slice(0, MAX_PICK);
    var dropped = (doc.picked || []).length - picks.length;

    state.gen++;
    state.traces = {};
    state.pinned = [];
    state.picked = picks;
    state.cols = doc.cols === 'auto' || doc.cols == null ? 'auto' : Number(doc.cols);
    state.rate = doc.rate === 'auto' || doc.rate == null ? 'auto' : Number(doc.rate);
    state.win = doc.window && isFinite(doc.window.x0) && isFinite(doc.window.x1)
      ? { x0: doc.window.x0, x1: doc.window.x1, u: doc.window.clock || 't:s' } : null;
    if (doc.server && !$('mds-server').disabled) {
      $('mds-server').value = doc.server;
      state.server = doc.server;
    }
    if (doc.tree) $('mds-tree').value = doc.tree;
    if (doc.shot != null) $('mds-shot').value = String(doc.shot);
    $('mds-cols').value = String(state.cols);
    $('mds-rate').value = String(state.rate);
    renderPicked(); renderZero(); renderPins(); renderWindow(); draw();

    var shots = (doc.pinned || []).filter(function (n) { return /^-?\d{1,9}$/.test(String(n)); })
      .slice(0, MAX_PIN).map(Number);
    note('mds-ws-note', 'mds.ws.loaded',
         { n: picks.length, dropped: dropped, shots: shots.length });
    //: ★the pinned shots are fetched FIRST and the current one LAST, so the
    //: page ends up on the shot the file says it was on — the order is the
    //: difference between restoring a comparison and restoring whichever shot
    //: happened to answer last.
    //: ★the shot to return to is the one the FILE names — `state.shot` still
    //: holds whatever the page was on when the file was dropped in, and using
    //: it would restore every other setting onto the wrong discharge.
    var here = shotNow();
    shots.reduce(function (chain, sh) {
      return chain.then(function () {
        state.shot = sh; $('mds-shot').value = String(sh);
        state.pinned.push(sh); renderPins();
        return fetchAll();
      });
    }, Promise.resolve()).then(function () {
      state.shot = here; $('mds-shot').value = String(here);
      renderPins();
      open();
    });
  }

  /** A local save.  `geqdsk.js` has one of these but this page loads no kernel
   *  and no g-file reader, and pulling in a 286-line module for six lines is
   *  the kind of dependency that stops being noticed. */
  function save(name, text) {
    saveBlob(name, new Blob([text], { type: 'application/json' }));
  }

  function saveBlob(name, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  // ------------------------------------------------------------------
  // boot
  // ------------------------------------------------------------------

  function renderRates() {
    var sel = $('mds-rate');
    var keep = state.rate;
    sel.innerHTML = '';
    var add = function (value, label) {
      var o = document.createElement('option');
      o.value = String(value); o.textContent = label;
      sel.appendChild(o);
    };
    add('auto', T('mds.rate.auto'));
    RATES.forEach(function (n) { add(n, T('mds.rate.n', { n: n })); });
    sel.value = String(keep);
  }

  function renderCols() {
    var sel = $('mds-cols');
    var keep = state.cols;
    sel.innerHTML = '';
    var add = function (value, label) {
      var o = document.createElement('option');
      o.value = String(value); o.textContent = label;
      sel.appendChild(o);
    };
    add('auto', T('mds.cols.auto'));
    COLS.forEach(function (n) { add(n, T('mds.cols.n', { n: n })); });
    sel.value = String(keep);
  }

  function retext() {
    ['mds-filter', 'mds-node', 'mds-server'].forEach(function (id) {
      $(id).placeholder = T($(id).getAttribute('data-i18n-ph'));
    });
    renderRates();
    renderCols();
    renderServers();
    renderPins();
    renderZero();
    renderWindow();
    if (state.level.length) renderLevel();
    renderPicked();
    draw();
  }

  function boot() {
    $('mds-open').addEventListener('click', open);
    $('mds-shot').addEventListener('keydown', function (e) { if (e.key === 'Enter') open(); });
    $('mds-server-use').addEventListener('click', useServer);
    $('mds-server').addEventListener('keydown', function (e) { if (e.key === 'Enter') useServer(); });
    $('mds-up').addEventListener('click', up);
    $('mds-filter').addEventListener('input', function () { if (state.level.length) renderLevel(); });
    $('mds-rate').addEventListener('change', function () {
      var v = $('mds-rate').value;
      state.rate = v === 'auto' ? 'auto' : Number(v);
    });
    //: ★changing the columns REDRAWS but does not re-fetch.  The figures get
    //: narrower, so the next fetch will ask for fewer points; asking again
    //: here would put a round trip per device onto a layout control.
    $('mds-cols').addEventListener('change', function () {
      var v = $('mds-cols').value;
      state.cols = v === 'auto' ? 'auto' : Number(v);
      draw();
    });
    $('mds-prev').addEventListener('click', function () { stepShot(-1); });
    $('mds-next').addEventListener('click', function () { stepShot(1); });
    $('mds-latest').addEventListener('click', latestShot);
    $('mds-pin').addEventListener('click', pinShot);
    $('mds-unpin').addEventListener('click', unpinAll);
    $('mds-ws-save').addEventListener('click', exportWorkspace);
    //: the file input is hidden behind a button of the page's own, so the
    //: control reads like every other control here rather than like a form
    $('mds-ws-load').addEventListener('click', function () { $('mds-ws-file').click(); });
    $('mds-ws-file').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { importWorkspace(String(rd.result)); };
      rd.readAsText(f);
      ev.target.value = '';
    });
    $('mds-fetch').addEventListener('click', fetchAll);
    $('mds-win-all').addEventListener('click', clearWindow);
    $('mds-clear').addEventListener('click', function () {
      state.picked = []; state.traces = {}; state.win = null; state.pinned = [];
      renderPicked(); renderLevel(); renderZero(); renderWindow(); renderPins(); draw();
    });
    $('mds-export').addEventListener('click', exportJson);
    $('mds-add').addEventListener('click', addTyped);
    $('mds-node').addEventListener('keydown', function (e) { if (e.key === 'Enter') addTyped(); });
    root.FyI18n.onChange(retext);
    retext();
    probe();
    //: ★redraw on resize: the canvases are sized in CSS and the plot module
    //: reads their pixel box, so a window change leaves every figure at the
    //: old width until something redraws it.  The STRIDE is not chased —
    //: re-fetching every trace on every drag of a window edge would put the
    //: server behind the mouse; the next fetch picks up the new width.
    root.addEventListener('resize', function () { if (state.picked.length) draw(); });
  }

  // ------------------------------------------------------------------
  // the one seam another file may drive this page through
  // ------------------------------------------------------------------
  //
  // ★Deliberately three functions wide.  `assets/mds-catalog.js` needs to add
  // a (tree, node) that the reader chose by DIAGNOSTIC rather than by path,
  // and it needs to know whether a shot is open; it has no business reaching
  // any further in.  Everything else stays inside this closure — a panel that
  // could reach `state` would be a second author of it.
  root.FyMds = {
    /** Add or remove one (tree, node).  Same call the tree browser makes. */
    select: function (p) { toggle({ tree: p.tree, node: p.node }); },
    /** The open shot, or null — nothing can be fetched before there is one. */
    shot: function () { return state.shot; },
    /** What is currently picked, as a copy. */
    picked: function () { return state.picked.map(function (p) {
      return { tree: p.tree, node: p.node }; }); },
  };

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof self !== 'undefined' ? self : globalThis);
