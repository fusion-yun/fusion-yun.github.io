// The form generator: every parameter control on a function page is drawn
// from the page's control vocabulary (`assets/vocab-<page>.js`), never written
// by hand (`FYL-DESIGN-18` U-1 / U-2, stage U0).
//
// ★What it does.  The page carries MOUNTS — `<div data-form="amin"></div>`
// where a `.ctl` block used to be, `<span data-form="ch-heat"></span>` where a
// checkbox label used to be.  At load, each mount is replaced by the control
// the vocabulary entry of that name describes, with the SAME markup the page
// carried before (`.ctl` › `label` › `span[data-i18n]` + `span.val#<readout>`
// › `input[type=range]`), the same ids and the same i18n keys.  Nothing
// downstream changes: `scenario.js` finds `#model-amin` and `#model-v-amin`
// exactly as before, `i18n.js` translates the same keys, `session.js` collects
// the same ids.  The one thing that changed is where the truth lives — the
// vocabulary — and the gate (`tests/validate-form.mjs`) holds page and
// vocabulary to each other in both directions.
//
// ★What it does NOT do, on purpose (stage U0 of FYL-DESIGN-18 §十三).  It does
// not choose the control from a `type` field the kernel declared (there is no
// control vocabulary in the kernel's code table yet — G-1), it does not draw
// the number twin beside a slider, and it does not decide grouping (U-3): the
// panels, headings, notes and folded boxes stay in the page.  It maps `kind`
// to markup, one kind one shape, which is the half of U-2 a page can do alone.
//
// ★Synchronous, on purpose.  This script is loaded WITHOUT `defer`, after the
// page body and before `scenario.js`, so the controls exist by the time the
// controllers look for them.  A deferred generator would race the controllers
// that read control values at registration.
(function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  function attrs(o) {
    var out = '';
    Object.keys(o || {}).forEach(function (k) {
      out += ' ' + k + (o[k] === '' ? '' : '="' + esc(o[k]) + '"');
    });
    return out;
  }
  function num(v) { return v === undefined || v === null ? undefined : String(v); }

  /** The label of a range / checkbox: a translated span, or a controller-filled one. */
  function labelSpan(p) {
    if (p.label_id) return '<span id="' + esc(p.label_id) + '"></span>';
    return '<span data-i18n="' + esc(p.i18n) + '">' + (p.label || '') + '</span>';
  }

  /** One control, as markup.  One `kind`, one shape (U-2). */
  function render(p) {
    var a;
    switch (p.kind) {
      case 'range':
        a = { type: 'range', id: p.id, min: num(p.min), max: num(p.max), step: num(p.step) };
        if (p.value !== undefined) a.value = num(p.value);
        return '<div class="ctl"' + attrs(p.attrs) + '><label>' + labelSpan(p) +
               ' <span class="val" id="' + esc(p.readout) + '"></span></label>\n' +
               '        <input' + attrs(a) + '></div>';
      case 'select':
        return '<div class="ctl"' + attrs(p.attrs) + '><label for="' + esc(p.id) +
               '" data-i18n="' + esc(p.i18n) + '">' + (p.label || '') + '</label>\n' +
               '        <select id="' + esc(p.id) + '">\n' +
               (p.choices || []).map(function (c) {
                 return '          <option value="' + esc(c.value) + '" data-i18n="' + esc(c.i18n) + '"></option>';
               }).join('\n') + '\n        </select></div>';
      case 'checkbox':
        a = { type: 'checkbox', id: p.id };
        if (p.checked) a.checked = '';
        var lab = '<label' + (p.label_class ? ' class="' + esc(p.label_class) + '"' : '') + '><input' +
                  attrs(a) + '> ' + labelSpan(p) + '</label>';
        return p.wrap === 'ctl' ? '<div class="ctl">' + lab + '</div>' : lab;
      default:
        throw new Error('form.js: unknown control kind ' + p.kind + ' for ' + p.id);
    }
  }

  /** Replace every `[data-form]` mount under `root` by its control. */
  function mount(root, vocab) {
    var byName = {};
    (vocab.params || []).forEach(function (p) { byName[p.name] = p; });
    var mounts = root.querySelectorAll('[data-form]');
    var n = 0;
    Array.prototype.forEach.call(mounts, function (el) {
      var p = byName[el.getAttribute('data-form')];
      if (!p) {
        //: ★a mount with no entry is left in place and MARKED — the gate greps
        //: for it; silently dropping it would hide a control from everyone
        el.setAttribute('data-form-missing', '');
        return;
      }
      var tpl = document.createElement('template');
      tpl.innerHTML = render(p);
      el.parentNode.replaceChild(tpl.content, el);
      n++;
    });
    return n;
  }

  var page = document.body && document.body.getAttribute('data-page');
  var vocab = page && window.FyVocab && window.FyVocab[page];
  var mounted = vocab ? mount(document, vocab) : 0;

  window.FyForm = { render: render, mount: mount, mounted: mounted, vocab: vocab || null };
})();
