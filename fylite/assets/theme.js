// Light / dark switching, shared by every page.
//
// Three states, in the order the CSS resolves them: no choice stored (follow
// the operating system), an explicit "light", an explicit "dark".  The
// choice is written to <html data-theme> and remembered in localStorage.
//
// Loaded in <head>, BEFORE the body renders, so a stored dark choice is
// applied without a white flash.  The button itself is wired up on
// DOMContentLoaded, since it lives in the header.
//
// ★THE BUTTON CARRIES NO TEXT.  It used to read `☀ 浅色` / `☾ 深色` /
// `◐ 跟随系统`, which cost it a translation, a width that changed with the
// language, and two characters — `☾` and `◐` — whose glyphs are not shipped by
// every platform, so the mark itself was a font lottery.  It is an inline SVG
// now, drawn in `currentColor`, and what the three states MEAN is in the
// tooltip and the aria-label, which are still translated.
//
// ★AND THEREFORE THIS FILE NO LONGER NEEDS THE i18n RUNTIME.  It uses it when
// it is there (a scenario page switches language without reloading, and the
// tooltip has to follow), and falls back to the two strings below when it is
// not — which is what lets a static page carry this file alone, ~2 KB, instead
// of the 116 KB of catalogues it used to have to load to write one word on a
// button.

(function () {
  'use strict';

  var KEY = 'fylite-theme';
  var root = document.documentElement;

  // 16x16, `currentColor`, so the button inherits the header's colour and its
  // hover state without a second rule.
  var ICON = {
    system: '<svg viewBox="0 0 16 16" aria-hidden="true">'
          + '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>'
          + '<path fill="currentColor" d="M8 2a6 6 0 0 0 0 12z"/></svg>',
    light: '<svg viewBox="0 0 16 16" aria-hidden="true">'
         + '<circle cx="8" cy="8" r="3.2" fill="currentColor"/>'
         + '<g stroke="currentColor" stroke-width="1.5" stroke-linecap="round">'
         + '<path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4'
         + 'M11.5 11.5l1.4 1.4M12.9 3.1l-1.4 1.4M4.5 11.5l-1.4 1.4"/></g></svg>',
    dark: '<svg viewBox="0 0 16 16" aria-hidden="true">'
        + '<path fill="currentColor" d="M13.5 10.4A6 6 0 0 1 5.6 2.5a6 6 0 1 0 7.9 7.9z"/></svg>',
  };

  // Used only when there is no catalogue on the page — see the head comment.
  var FALLBACK = {
    zh: { system: '跟随系统', light: '浅色', dark: '深色',
          system_eff: '跟随系统（{eff}）', now: '当前：{what}，点击切换' },
    en: { system: 'System', light: 'Light', dark: 'Dark',
          system_eff: 'System ({eff})', now: 'Now: {what} — click to switch' },
  };

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

  function T(key, params) {
    if (self.FyI18n) return self.FyI18n.t(key, params);
    var tab = FALLBACK[/^zh/.test(root.lang || 'zh') ? 'zh' : 'en'];
    var s = tab[key.replace(/^theme\./, '')];
    if (s === undefined) return key;
    return params ? s.replace(/\{(\w+)\}/g, function (m, n) {
      return n in params ? params[n] : m;
    }) : s;
  }

  function label(btn) {
    var v = stored() || 'system';
    btn.innerHTML = ICON[v];
    //: what the button SHOWS is the state; what it does not show — the name of
    //: that state, and that following the system currently means dark — is the
    //: whole reason the tooltip is not decoration here
    var what = v === 'system'
      ? T('theme.system_eff', { eff: T('theme.' + effective()) })
      : T('theme.' + v);
    btn.title = T('theme.now', { what: what });
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
    if (self.FyI18n) self.FyI18n.onChange(function () { label(btn); });
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', install);
  else install();
})();
