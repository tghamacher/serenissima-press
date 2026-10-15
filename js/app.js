// Wires the controls to the converter and the layout.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const C = window.SPConvert, L = window.SPLayout;

  const PAGES = { letter: ['US Letter', 8.5, 11], legal: ['US Legal', 8.5, 14], tabloid: ['Tabloid 11×17', 11, 17], a4: ['A4', 8.27, 11.69], a3: ['A3', 11.69, 16.54] };
  const state = { doc: null, info: null, format: 'partbook', page: { partbook: 'letter', choirbook: 'tabloid' }, initialSrc: '', parts: [] };

  // ---- fixed option lists
  for (const [k, [name]] of Object.entries(PAGES)) $('page').append(new Option(name, k));
  $('staffSize').append(new Option('Fit to page', '0'));
  for (const s of [32, 40, 48, 56, 64, 72, 80]) $('staffSize').append(new Option(`${s} px`, s));
  $('staffSize').append(new Option('Custom…', 'custom'));
  // a custom size, in px, between the box's limits; 0 (fit to page) if empty
  function staffSize() {
    if ($('staffSize').value !== 'custom') return +$('staffSize').value;
    const n = +$('staffCustom').value, box = $('staffCustom');
    return n > 0 ? Math.min(+box.max, Math.max(+box.min, n)) : 0;
  }
  $('mens').append(new Option('From time signature', ''));
  for (const [k, v] of Object.entries(C.MENS)) $('mens').append(new Option(v, k));
  const iv = { 0: 'none', 1: 'up a semitone', 2: 'up a tone', 3: 'up a minor 3rd', 4: 'up a major 3rd', 5: 'up a 4th', 7: 'up a 5th', '-1': 'down a semitone', '-2': 'down a tone', '-3': 'down a minor 3rd', '-4': 'down a major 3rd', '-5': 'down a 4th', '-7': 'down a 5th' };
  for (const n of [5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -7]) $('transpose').append(new Option(iv[n], n));
  $('transpose').value = '0';

  // ---- status
  function status(errors, warnings) {
    const box = $('status'); box.innerHTML = '';
    if (errors) { const d = document.createElement('div'); d.className = 'sp-notice err'; d.textContent = errors; box.append(d); }
    if (warnings && warnings.length) {
      const d = document.createElement('div'); d.className = 'sp-notice';
      const b = document.createElement('strong'); b.textContent = `${warnings.length} thing${warnings.length > 1 ? 's' : ''} to check`; d.append(b);
      const ul = document.createElement('ul'); warnings.forEach(w => { const li = document.createElement('li'); li.textContent = w; ul.append(li); }); d.append(ul);
      box.append(d);
    }
  }

  // ---- loading a score
  async function loadFile(file) {
    try {
      const buf = await file.arrayBuffer();
      const isZip = new Uint8Array(buf, 0, 2).join() === '80,75';   // "PK"
      const xml = isZip ? await window.SPZip.readMxl(buf) : new TextDecoder().decode(buf);
      loadXml(xml, file.name);
    } catch (e) { status(e.message); }
  }
  function loadXml(xml, name) {
    try {
      state.doc = C.parseScore(xml);
      state.info = C.inspect(state.doc);
    } catch (e) { status(e.message); return; }
    $('fileName').textContent = name;
    const i = state.info;
    $('title').value = i.title || name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    $('composer').value = i.composer;
    $('reduction').value = String(i.reduction);
    let side = 0;
    state.parts = i.parts.map(p => ({ index: p.index, name: p.name, include: !p.keyboard, label: p.label, clef: '', side: p.keyboard ? 'verso' : (side++ % 2 ? 'recto' : 'verso') }));
    buildPartsTable();
    $('settings').hidden = false; $('empty').hidden = true;
    typeset();
  }

  function buildPartsTable() {
    const tb = $('parts'); tb.innerHTML = '';
    for (const p of state.parts) {
      const tr = document.createElement('tr');
      const inc = document.createElement('input'); inc.type = 'checkbox'; inc.checked = p.include; inc.title = `Include ${p.name}`; inc.setAttribute('aria-label', `Include ${p.name}`);
      inc.onchange = () => { p.include = inc.checked; typeset(); };
      const lab = document.createElement('input'); lab.type = 'text'; lab.value = p.label; lab.setAttribute('aria-label', `Label for ${p.name}`);
      lab.oninput = () => { p.label = lab.value; typeset(); };
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = p.name; nm.title = p.name;
      const clef = document.createElement('select'); clef.setAttribute('aria-label', `Clef for ${p.name}`);
      clef.append(new Option('Automatic', ''), new Option('Best fit for range', 'auto'));
      for (const [k, v] of Object.entries(C.CLEF_NAMES)) clef.append(new Option(v, k));
      clef.value = p.clef; clef.onchange = () => { p.clef = clef.value; typeset(); };
      const side = document.createElement('select'); side.className = 'sideSel'; side.setAttribute('aria-label', `Choirbook page for ${p.name}`);
      side.append(new Option('Left', 'verso'), new Option('Right', 'recto')); side.value = p.side;
      side.onchange = () => { p.side = side.value; typeset(); };
      const cells = [[inc], [lab, nm], [clef], [side]];
      cells.forEach((els, n) => { const td = document.createElement('td'); if (n === 3) td.className = 'sideCol'; td.append(...els); tr.append(td); });
      tb.append(tr);
    }
    showSideColumn();
  }
  function showSideColumn() {
    const on = state.format === 'choirbook';
    document.querySelectorAll('.sideCol').forEach(e => e.style.display = on ? '' : 'none');
    $('sideHint').hidden = !on;
    // a choirbook opens with one large initial; each partbook opens with its own
    $('otherInitials').hidden = !on;
    $('initialFor').textContent = on ? 'First voice (top left)' : 'Each voice';
  }

  // ---- typesetting (debounced)
  let timer = null, running = Promise.resolve();
  function typeset() { clearTimeout(timer); timer = setTimeout(() => { running = running.then(run); }, 250); }
  async function run() {
    if (!state.doc) return;
    const sel = state.parts.filter(p => p.include);
    if (!sel.length) { status('Select at least one voice.'); $('book').innerHTML = ''; return; }
    let res;
    try {
      res = C.convert(state.doc, {
        reduction: +$('reduction').value, transpose: +$('transpose').value, mensuration: $('mens').value, repeats: $('repeats').value,
        ficta: $('ficta').checked, barlines: $('barlines').checked, ij: $('ij').checked, brackets: false,
        parts: sel.map(p => ({ index: p.index, clef: p.clef, label: p.label }))
      });
    } catch (e) { status(e.message); return; }
    const verso = [], recto = [];
    sel.forEach((p, i) => (p.side === 'recto' ? recto : verso).push(i));
    const pg = k => [PAGES[k][1], PAGES[k][2]];
    const scale = $('scale'); scale.style.transform = 'none'; scale.style.height = ''; scale.style.width = '';
    $('book').classList.add('sp-busy');
    const out = await L.render($('book'), { title: $('title').value, composer: $('composer').value, parts: res.parts }, {
      format: state.format, staffSize: staffSize(),
      initials: {
        first: { style: $('initial').value, lines: +$('initialLines').value },
        other: { style: $('initial2').value, lines: +$('initialLines2').value },
        src: state.initialSrc, red: $('rubric').checked
      },
      partbookPage: pg(state.page.partbook), choirbookPage: pg(state.page.choirbook), verso, recto
    });
    $('book').classList.remove('sp-busy');
    setPageRule(out.pageSize);
    state.staffUsed = out.staffSize;
    fitPreview();
    status(null, res.warnings.concat(out.warnings));
    document.title = `${$('title').value || 'Serenissima Press'} – ${state.format}`;
  }
  function setPageRule([w, h]) {
    let s = $('pageRule'); if (!s) { s = document.createElement('style'); s.id = 'pageRule'; document.head.append(s); }
    s.textContent = `@page { size: ${w}in ${h}in; margin: 0; }`;
  }
  // shrink the preview to the pane width (after layout, so measurements stay exact)
  function fitPreview() {
    const scale = $('scale'), book = $('book');
    scale.style.transform = 'none'; scale.style.height = ''; scale.style.width = '';
    const pane = scale.parentElement, cs = getComputedStyle(pane);
    const avail = pane.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2, w = book.scrollWidth;
    const k = Math.min(1, avail / w);
    if (k < 1) { scale.style.transform = `scale(${k})`; scale.style.width = w + 'px'; scale.style.height = book.scrollHeight * k + 'px'; }
  }
  window.addEventListener('resize', () => { if (state.doc) fitPreview(); });

  // ---- controls
  $('file').onchange = e => { if (e.target.files[0]) loadFile(e.target.files[0]); };
  const drop = $('drop');
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
  $('sample').onclick = async () => {
    try { const r = await fetch('examples/sample.musicxml'); if (!r.ok) throw new Error(); loadXml(await r.text(), 'sample.musicxml'); }
    catch { status('Could not load the sample.'); }
  };
  document.querySelectorAll('[data-format]').forEach(b => b.onclick = () => {
    state.format = b.dataset.format;
    document.querySelectorAll('[data-format]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('page').value = state.page[state.format];
    showSideColumn(); typeset();
  });
  $('page').value = state.page.partbook;
  $('page').onchange = () => { state.page[state.format] = $('page').value; typeset(); };
  for (const id of ['title', 'composer']) $(id).oninput = typeset;
  // "Custom…" opens a box starting at the size last used, so it is easy to nudge
  $('staffSize').onchange = () => {
    const box = $('staffCustom'), on = $('staffSize').value === 'custom';
    box.hidden = !on;
    if (on) { if (!box.value) box.value = Math.round(state.staffUsed || 48); box.focus(); box.select(); }
    typeset();
  };
  $('staffCustom').oninput = typeset;
  for (const id of ['reduction', 'mens', 'repeats', 'transpose', 'ficta', 'barlines', 'ij', 'initialLines', 'initial2', 'initialLines2', 'rubric']) $(id).onchange = typeset;
  $('initial').onchange = () => { if ($('initial').value === 'image' && !state.initialSrc) $('initialFile').click(); typeset(); };
  $('initialFile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => { state.initialSrc = r.result; typeset(); }; r.readAsDataURL(f);
  };
  $('print').onclick = () => window.print();

  // links like ?score=examples/sample.musicxml&format=choirbook open a score directly
  const q = new URLSearchParams(location.search);
  if (q.get('format') === 'choirbook') document.querySelector('[data-format=choirbook]').click();
  if (q.get('score')) (async () => {
    try {
      const r = await fetch(q.get('score')); if (!r.ok) throw new Error(`Could not load ${q.get('score')} (${r.status}).`);
      const buf = await r.arrayBuffer(), name = q.get('score').split('/').pop();
      await loadFile(new File([buf], name));
    } catch (e) { status(e.message); }
  })();
})();
