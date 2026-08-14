// Light / dark switching, shared by all three pages.
//
// Three states, in the order the CSS resolves them: no choice stored (follow
// the operating system), an explicit "light", an explicit "dark".  The
// choice is written to <html data-theme> and remembered in localStorage.
//
// Loaded in <head>, BEFORE the body renders, so a stored dark choice is
// applied without a white flash.  The button itself is wired up on
// DOMContentLoaded, since it lives in the header.

(function () {
  'use strict';

  var KEY = 'fylite-theme';
  var root = document.documentElement;

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function store(v) {
    try {
      if (v) localStorage.setItem(KEY, v);
      else localStorage.removeItem(KEY);
    } catch (e) { /* private mode: the choice just does not persist */ }
  }

  function apply(v) {
    if (v) root.setAttribute('data-theme', v);
    else root.removeAttribute('data-theme');
  }

  apply(stored());

  /** What the page is actually showing right now. */
  function effective() {
    var v = root.getAttribute('data-theme');
    if (v) return v;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  var LABEL = { light: '☀ 浅色', dark: '☾ 深色', system: '◐ 跟随系统' };

  function label(btn) {
    var v = stored() || 'system';
    btn.textContent = LABEL[v];
    btn.title = '当前：' + (v === 'system' ? '跟随系统（' + effective() + '）'
                                           : LABEL[v]) + '，点击切换';
    btn.setAttribute('aria-label', btn.title);
  }

  function repaint() {
    // the canvases read their colours from CSS custom properties at draw
    // time, so a theme change has to trigger a redraw; every page already
    // redraws on resize
    window.dispatchEvent(new Event('resize'));
  }

  function install() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    label(btn);
    btn.addEventListener('click', function () {
      // a plain three-state cycle: system -> light -> dark -> system.
      // Deriving the next state from what is currently SHOWING instead
      // collapses to two states whenever the system is already dark, so
      // the button's behaviour would depend on the visitor's OS setting.
      var cur = stored();
      var next = !cur ? 'light' : (cur === 'light' ? 'dark' : null);
      store(next);
      apply(next);
      label(btn);
      repaint();
    });
    // following the system means tracking it live
    var mq = matchMedia('(prefers-color-scheme: dark)');
    var onSys = function () { if (!stored()) { label(btn); repaint(); } };
    if (mq.addEventListener) mq.addEventListener('change', onSys);
    else if (mq.addListener) mq.addListener(onSys);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', install);
  else install();
})();
