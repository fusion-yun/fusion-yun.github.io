// The case-report page's controller: get documents in, hand them to
// `casereport.js`, keep the page in the reader's language.
//
// Three doors, one renderer: files picked or dropped (a record, and any of
// its plan / presentation / dataset files beside it), or a URL (`?src=…` on
// the page, or typed into the box).  Documents are told apart by their
// `type`, never by file name: a record is an `spo:ComputationRecord`, a plan a
// `fyo:ScenarioSpecification`, a spec an `spo:PresentationSpecification`, and
// anything else carrying arrays is a dataset attached to the port whose
// `bound_to.id` (or `bound_concretization.storage_uri`) names it.
(function (root) {
  'use strict';

  var R = root.FyCaseReport, I = root.FyI18n;
  var host, status, exportBtn, state = { plan: null, record: null, spec: null, hasSpec: false };

  function t(k, p) { return I.t(k, p); }
  function say(key, params) { status.innerHTML = t(key, params); }

  function sortDocs(docs) {
    var out = { plan: null, record: null, spec: null, datasets: [] };
    docs.forEach(function (d) {
      var doc = d.doc, ty = doc && (doc.type || doc['@type']);
      if (ty === 'spo:ComputationRecord') out.record = doc;
      else if (ty === 'fyo:ScenarioSpecification') out.plan = doc;
      else if (ty === 'spo:PresentationSpecification') out.spec = doc;
      else if (doc && R.hasArrays(doc)) out.datasets.push({ name: d.name, doc: doc });
    });
    return out;
  }

  function attach(record, datasets) {
    (record.inputs || []).forEach(function (b) {
      var bt = b.bound_to, conc = b.bound_concretization || {};
      if (bt && typeof bt === 'object' && R.hasArrays(bt)) return;
      var id = bt && (bt.id || bt['@id']);
      datasets.forEach(function (d) {
        var did = d.doc.id || d.doc['@id'];
        if ((id && did === id) || (conc.storage_uri && d.name && conc.storage_uri.split('/').pop() === d.name)) {
          if (!d.doc.comment && bt && bt.comment) d.doc.comment = bt.comment;
          if (!d.doc.id && did) d.doc.id = did;
          b.bound_to = d.doc;
        }
      });
    });
  }

  function render() {
    if (!state.record) return;
    var r = R.renderInto(host, { plan: state.plan, record: state.record, spec: state.spec, lang: I.current ? I.current() : 'zh' });
    var nfig = r.figures.filter(function (f) { return f.svg; }).length;
    var nref = r.figures.filter(function (f) { return f.refused; }).length;
    say('report.status.loaded', { rid: state.record.id || '', nfig: nfig, nref: nref,
                                  how: state.hasSpec ? t('rep.spec.given') : t('rep.spec.derived') });
    exportBtn.disabled = false;
  }

  function take(docs) {
    var s = sortDocs(docs);
    if (!s.record) { say('report.status.norecord'); return; }
    attach(s.record, s.datasets);
    state.record = s.record; state.plan = s.plan; state.spec = s.spec; state.hasSpec = !!s.spec;
    render();
  }

  function readFiles(files) {
    var list = Array.prototype.slice.call(files), pending = list.length, docs = [];
    if (!pending) return;
    list.forEach(function (f) {
      var rd = new FileReader();
      rd.onload = function () {
        try { docs.push({ name: f.name, doc: JSON.parse(rd.result) }); }
        catch (e) { say('report.status.err', { why: f.name + ': ' + e.message }); }
        if (--pending === 0) take(docs);
      };
      rd.readAsText(f);
    });
  }

  function fetchAll(src) {
    var base = src.replace(/[^/]*$/, '');
    say('report.status.none');
    fetch(src).then(function (r) { if (!r.ok) throw new Error(r.status + ' ' + src); return r.json(); })
      .then(function (record) {
        //: the plan, the spec and the file-bound datasets live beside the record when
        //: `fylite case run` / `fylite cases --report` wrote it; each is optional
        var wants = ['plan.jsonld', 'presentation.jsonld'];
        (record.inputs || []).forEach(function (b) {
          var c = b.bound_concretization || {};
          if (c.storage_uri && /\.jsonld$/.test(c.storage_uri) && !(b.bound_to && R.hasArrays(b.bound_to))) wants.push(c.storage_uri);
        });
        return Promise.all(wants.map(function (w) {
          return fetch(base + w).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
            .then(function (doc) { return doc ? { name: w.split('/').pop(), doc: doc } : null; });
        })).then(function (extra) {
          take([{ name: 'record.jsonld', doc: record }].concat(extra.filter(Boolean)));
        });
      })
      .catch(function (e) { say('report.status.err', { why: e.message }); });
  }

  function download(name, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/ld+json' }));
    a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function init() {
    host = document.getElementById('report-host');
    status = document.getElementById('report-status');
    exportBtn = document.getElementById('report-export-spec');
    host.setAttribute('data-empty', t('report.status.none'));
    document.getElementById('report-files').addEventListener('change', function (e) { readFiles(e.target.files); });
    var drop = document.getElementById('report-drop');
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { readFiles(e.dataTransfer.files); });
    document.getElementById('report-fetch').addEventListener('click', function () {
      var src = document.getElementById('report-src').value.trim();
      if (src) fetchAll(src);
    });
    exportBtn.addEventListener('click', function () {
      if (R.lastSpec) download('presentation.jsonld', JSON.stringify(R.lastSpec, null, 1) + '\n');
    });
    if (I.onChange) I.onChange(function () { host.setAttribute('data-empty', t('report.status.none')); render(); });
    var src = new URLSearchParams(location.search).get('src');
    if (src) { document.getElementById('report-src').value = src; fetchAll(src); }
  }

  root.FyReportPage = { take: take, render: render, state: state };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(self);
