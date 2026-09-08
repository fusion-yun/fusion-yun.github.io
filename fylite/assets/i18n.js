// Localisation runtime.
//
// The hard part here was never translation, it was the SHAPE of the text.
// The pages used to build sentences by concatenation:
//
//     '共 ' + n + ' 道磁通环，' + '已扣除线圈贡献。'
//
// with the split points chosen by Chinese grammar, so the fragments cannot
// be reordered into another language.  Every such site is now one whole
// sentence with {placeholders}, which is what makes a catalogue possible at
// all.  Adding a language is now only a matter of adding a catalogue.
//
// Markup in a message is intentional and allowed (labels carry <sub>), so
// values are assigned as innerHTML.  Catalogue strings are ours; parameter
// values are escaped before substitution so a filename cannot inject.

(function (root) {
  'use strict';

  var KEY = 'fylite-lang';
  var cats = {};
  var lang = null;
  var listeners = [];

  function register(code, table) {
    cats[code] = Object.assign(cats[code] || {}, table);
  }

  function available() { return Object.keys(cats); }

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  /** `?lang=` on the URL, else the stored choice, else the browser's preference, else zh. */
  function initial() {
    //: ★`lang` is a LAUNCH PARAMETER — one of the four `hosts.app.params`
    //: in `python/fylite/_cli.json`, the file every host's command line is
    //: built from; `fylite app --lang en` writes it here.  It is remembered
    //: like a switch click would be, so the next page keeps the choice.
    var q = null;
    try {
      q = new URLSearchParams(root.location.search).get('lang');
    } catch (e) { /* no location, e.g. inside a worker */ }
    if (q && cats[q]) {
      try { localStorage.setItem(KEY, q); } catch (e) { /* private mode */ }
      return q;
    }
    var s = stored();
    if (s && cats[s]) return s;
    var nav = (root.navigator && root.navigator.languages) || [];
    for (var i = 0; i < nav.length; i++) {
      var c = String(nav[i]).toLowerCase().split('-')[0];
      if (cats[c]) return c;
    }
    return cats.zh ? 'zh' : available()[0];
  }

  // The catalogues are separate <script> files, so at the moment i18n.js
  // itself finishes running there is nothing registered yet and the language
  // cannot be resolved.  Resolve it on first use instead — that way no
  // ordering rule has to hold between this file and the catalogues.
  function ensure() { if (lang === null) start(); }

  function esc(v) {
    return String(v).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }

  /**
   * Look a key up in the active catalogue and fill {placeholders}.
   * A missing key returns the key itself — visible, not silent: a blank
   * label looks like a layout bug and gets diagnosed as one.
   */
  function t(key, params) {
    ensure();
    var tab = cats[lang] || {};
    var s = tab[key];
    if (s === undefined) s = (cats.zh || {})[key];
    if (s === undefined) return key;
    if (!params) return s;
    return s.replace(/\{(\w+)\}/g, function (m, name) {
      return name in params ? esc(params[name]) : m;
    });
  }

  /** Apply the catalogue to everything marked up in the document. */
  function applyDom(scope) {
    ensure();
    var root_ = scope || document;
    root_.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n'));
    });
    root_.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.title = stripTags(t(el.getAttribute('data-i18n-title')));
    });
    //: ★★AND THE ACCESSIBLE NAME, separately from the tooltip.  A control whose
    //: content is an icon has no text to be named by, and `title` is only the
    //: LAST fallback in the accessible-name computation — some assistive
    //: technology is configured never to reach it.  The header's page links
    //: became icons on 2026-09-01 and would otherwise be announced as 「link」.
    //: Kept as its own attribute rather than mirrored from `data-i18n-title`
    //: so that a control which wants a longer tooltip than its name can still
    //: have one.
    root_.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label',
                      stripTags(t(el.getAttribute('data-i18n-aria'))));
    });
    var ttl = document.querySelector('title[data-i18n]');
    if (ttl) document.title = stripTags(ttl.innerHTML);
  }

  function stripTags(s) { return String(s).replace(/<[^>]*>/g, ''); }

  function use(code) {
    if (!cats[code]) return;
    lang = code;
    try { localStorage.setItem(KEY, code); } catch (e) { /* private mode */ }
    if (typeof document === 'undefined') {
      listeners.forEach(function (fn) { fn(code); });
      return;
    }
    document.documentElement.lang = code === 'zh' ? 'zh-CN' : code;
    applyDom();
    listeners.forEach(function (fn) { fn(code); });
  }

  /** Called after every language change — pages redraw their dynamic text. */
  function onChange(fn) { listeners.push(fn); }

  // The NAME of each language, written in that language — used for the
  // tooltip and the aria-label of the switch, never for a label on it.
  var LABEL = { zh: '中文', en: 'English' };

  // ★WHERE THE FLAGS ARE, seen from THIS document.  A scenario page sits one
  // directory below `assets/`, so a path written site-root-relative does not
  // resolve from it.  Taken from this script's own URL, the same way
  // `site.js` finds the site root, so it is right whatever path the site is
  // mounted at and needs no ordering rule between the two files.
  var ROOT = (function () {
    var s = typeof document !== 'undefined' && document.currentScript
          && document.currentScript.src;
    return s ? s.replace(/i18n\.js(\?.*)?$/, '') : 'assets/';
  })();

  function flag(code) {
    return '<img class="flag" src="' + ROOT + 'flag-' + code + '.svg" alt="" '
         + 'width="24" height="16">';
  }

  /**
   * Wire a <select> or a cycling button as the language control.
   *
   * ★Idempotent.  A scenario-line page hosts several tool controllers and
   * each of them installs the toggle; without the latch the button would
   * advance the language once per controller on a single click, which on a
   * two-language site looks like the toggle doing nothing at all.
   */
  function install(id) {
    ensure();
    var el = document.getElementById(id);
    if (!el || el.dataset.fyLangInstalled) return;
    el.dataset.fyLangInstalled = '1';
    if (el.tagName === 'SELECT') {
      el.innerHTML = available().map(function (c) {
        return '<option value="' + c + '">' + (LABEL[c] || c) + '</option>';
      }).join('');
      el.value = lang;
      el.addEventListener('change', function () { use(el.value); });
    } else {
      //: ★THE FLAG SHOWS THE LANGUAGE YOU ARE READING — the control's STATE, the
      //: same thing the theme button shows.  It therefore does not, by itself,
      //: say what pressing it would give you; on a two-language site a flag is
      //: as easily read as "this is Chinese" as "press for Chinese", and that
      //: ambiguity is real either way round.  It is answered in words instead:
      //: the tooltip and the aria-label are an ACTION — `切换到 English` — and
      //: they are written in the language of the page, because that is the one
      //: the reader in front of it can read.
      //: ★And the NAME, not the country: a flag is a country, this control is
      //: about a language, and the accessible name is where that distinction
      //: has to survive.
      var next = function () {
        var all = available();
        return all[(all.indexOf(lang) + 1) % all.length];
      };
      var relabel = function () {
        var to = next();
        el.innerHTML = flag(lang);
        el.title = t('lang.switch', { to: LABEL[to] || to });
        el.setAttribute('aria-label', el.title);
        el.removeAttribute('lang');
      };
      relabel();
      el.addEventListener('click', function () { use(next()); relabel(); });
      onChange(relabel);
    }
  }

  // No document inside a Worker: the language still resolves, the DOM part
  // simply does not apply.
  function start() {
    lang = initial();
    if (typeof document !== 'undefined')
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
  }

  root.FyI18n = { register: register, t: t, use: use, start: start,
                  install: install, onChange: onChange, applyDom: applyDom,
                  available: available,
                  current: function () { ensure(); return lang; } };
  // One sweep as soon as there is a document to sweep — for every language,
  // not only the non-default one: the landing page carries its prose in the
  // catalogue alone, so skipping the zh sweep would leave it blank.
  function sweepOnce() { ensure(); applyDom(); }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', sweepOnce);
    else sweepOnce();
  }
})(typeof self !== 'undefined' ? self : globalThis);
