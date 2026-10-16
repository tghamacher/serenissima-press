// Wires the controls to the converter and the layout.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const C = window.SPConvert, L = window.SPLayout;

  // page sizes in inches [name, width, height], portrait; grouped in the menu. The period sizes are those
  // of 16th-century partbooks: Venetian quartos (Gardano, Scotto) and the Parisian octavo chanson books of
  // Le Roy & Ballard, both usually oblong (landscape).
  const PAGES = {
    octavo: ['Octavo, about 11 × 17 cm', 4.33, 6.69, 'Period partbooks'], quarto: ['Quarto, about 16 × 22 cm', 6.3, 8.66, 'Period partbooks'],
    half: ['Half Letter, 5.5 × 8.5 in', 5.5, 8.5, 'Small'], a5: ['A5', 5.83, 8.27, 'Small'],
    letter: ['US Letter', 8.5, 11, 'Standard'], legal: ['US Legal', 8.5, 14, 'Standard'], a4: ['A4', 8.27, 11.69, 'Standard'],
    tabloid: ['Tabloid 11×17', 11, 17, 'Large'], a3: ['A3', 11.69, 16.54, 'Large']
  };
  // pieces: [{ file, doc, info, title, composer, reduction, mens, transpose, parts: [{index, name, include, label, clef, side}],
  //   secs: {step: {name, mode}}, sections (as last converted) }]; cur: the piece whose settings are shown
  const state = { format: 'partbook', page: { partbook: 'letter', choirbook: 'tabloid' }, orient: { partbook: 'portrait', choirbook: 'portrait' }, initialSrc: '', pieces: [], cur: 0, secKey: '' };
  const piece = () => state.pieces[state.cur];

  // ---- margins, in inches: [top, bottom, inside, outside], for each format. "Book" follows the
  // proportions of printed books: narrowest at the binding, then the head, the outside, and the deepest foot.
  const MARGINS = { narrow: [0.4, 0.4, 0.4, 0.4], normal: [0.6, 0.6, 0.6, 0.6], wide: [1, 1, 1, 1], book: [0.7, 1.3, 0.5, 1] };
  const MIDS = ['mTop', 'mBottom', 'mInside', 'mOutside'];
  state.margins = { partbook: { preset: 'normal', custom: MARGINS.normal.slice() }, choirbook: { preset: 'normal', custom: MARGINS.normal.slice() } };
  const metric = () => ['a4', 'a3', 'a5', 'quarto', 'octavo'].includes(state.page[state.format]);
  function margins() {
    const m = state.margins[state.format], a = m.preset === 'custom' ? m.custom : MARGINS[m.preset];
    return { top: a[0], bottom: a[1], inside: a[2], outside: a[3] };
  }
  // shown in the page size's own unit: millimetres for A4 and A3, inches otherwise
  function showMargins() {
    const m = state.margins[state.format], k = metric() ? 25.4 : 1, unit = metric() ? 'mm' : 'in';
    const fmt = v => metric() ? String(Math.round(v * k)) : String(+v.toFixed(2));
    for (const opt of $('margins').options) {
      const a = MARGINS[opt.value]; if (!a) continue;
      const base = { narrow: 'Narrow', normal: 'Normal', wide: 'Wide', book: 'Book: narrow inside, deep foot' }[opt.value];
      opt.text = opt.value === 'book' ? base : `${base} (${fmt(a[0])} ${unit})`;
    }
    $('margins').value = m.preset;
    $('marginBox').hidden = m.preset !== 'custom';
    MIDS.forEach((id, i) => { $(id).value = fmt(m.custom[i]); $(id).step = metric() ? '1' : '0.05'; });
    $('mUnit').textContent = unit;
    const a = margins();
    $('marginHint').textContent = (m.preset === 'book' ? `Top ${fmt(a.top)}, bottom ${fmt(a.bottom)}, inside ${fmt(a.inside)}, outside ${fmt(a.outside)} ${unit}. ` : '') +
      (state.format === 'choirbook' ? 'Inside is the fold between the two pages of an opening.' : 'Inside is the edge at the binding, on the left of right-hand pages and the right of left-hand ones.');
  }

  // ---- fixed option lists
  for (const [k, [name, , , group]] of Object.entries(PAGES)) {
    let g = [...$('page').children].find(x => x.label === group);
    if (!g) { g = document.createElement('optgroup'); g.label = group; $('page').append(g); }
    g.append(new Option(name, k));
  }
  $('staffSize').append(new Option('Automatic', '0'));
  for (const s of [32, 40, 48, 56, 64, 72, 80]) $('staffSize').append(new Option(`${s} px`, s));
  $('staffSize').append(new Option('Custom…', 'custom'));
  // a custom size, in px, between the box's limits; 0 (automatic) if empty
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
  function status(errors, warnings, notes) {
    const box = $('status'); box.innerHTML = '';
    if (errors) { const d = document.createElement('div'); d.className = 'sp-notice err'; d.textContent = errors; box.append(d); }
    for (const n of notes || []) { const d = document.createElement('div'); d.className = 'sp-notice info'; d.textContent = n; box.append(d); }
    if (warnings && warnings.length) {
      const d = document.createElement('div'); d.className = 'sp-notice';
      const b = document.createElement('strong'); b.textContent = `${warnings.length} thing${warnings.length > 1 ? 's' : ''} to check`; d.append(b);
      const ul = document.createElement('ul'); warnings.forEach(w => { const li = document.createElement('li'); li.textContent = w; ul.append(li); }); d.append(ul);
      box.append(d);
    }
    if (state.pieces.length) {
      const p = document.createElement('p'); p.className = 'sp-report';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sp-link'; b.textContent = 'Report a problem with this score';
      b.onclick = () => window.open(reportUrl(warnings), '_blank', 'noopener');
      p.append(b, ' (opens the feedback form with your settings filled in)'); box.append(p);
    }
  }
  // the feedback form (no account needed), with the version and the settings in use filled in, to
  // save asking for them; its "Version and settings" question is entry.321599493
  const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSdOzA7OsIG92L_Q-5JG_uj7DHMB-S9Wzs99goDaJxpbmdZs0g/viewform';
  const formUrl = settings => `${FORM}?${new URLSearchParams({ usp: 'pp_url', 'entry.321599493': settings })}`;
  $('feedback').href = formUrl(`Version ${$('version').dataset.version}`);
  function reportUrl(warnings) {
    const sel = id => { const e = $(id); return e.options ? e.options[e.selectedIndex].text : e.value; };
    const on = ids => ids.filter(id => $(id).checked).join(', ') || 'none';
    const lines = [
      `Version: ${$('version').dataset.version}`,
      `Format: ${state.format}, ${sel('page')} ${state.orient[state.format]}, staff ${sel('staffSize')}${state.staffUsed ? ` (${Math.round(state.staffUsed)} px)` : ''}, numbering ${sel('numbering')}, margins ${Object.values(margins()).join('/')} in`,
      `Clefs: ${sel('clefs')}; repeats: ${sel('repeats')}; options: ${on(['ledgers', 'ficta', 'barlines', 'brackets', 'titlePage', 'index', 'labelFirst', 'labelRest', 'ruleEmpty'])}`,
      ...state.pieces.map(pc => `Piece: ${pc.file} — note values ${pc.reduction}, mensuration ${pc.mens || 'auto'}, transpose ${pc.transpose}; voices: ${pc.parts.filter(p => p.include).map(p => `${p.label} ${p.clef || 'auto'}${state.format === 'choirbook' ? ' ' + p.side : ''}`).join(', ')}${Object.values(pc.secs).some(s => s.mode && s.mode !== 'run') ? '; sections: ' + Object.entries(pc.secs).filter(([, s]) => s.mode && s.mode !== 'run').map(([k, s]) => `${k}:${s.mode}`).join(' ') : ''}`),
      `Browser: ${navigator.userAgent}`
    ];
    if (warnings && warnings.length) lines.push('', 'Warnings shown:', ...warnings.slice(0, 12).map(w => `- ${w}`), ...(warnings.length > 12 ? [`- … and ${warnings.length - 12} more`] : []));
    return formUrl(lines.join('\n'));
  }

  // ---- loading scores: each file is a piece, added to the book
  async function loadFiles(files) {
    for (const file of files) {
      try {
        const buf = await file.arrayBuffer();
        const isZip = new Uint8Array(buf, 0, 2).join() === '80,75';   // "PK"
        const xml = isZip ? await window.SPZip.readMxl(buf) : new TextDecoder().decode(buf);
        addPiece(xml, file.name);
      } catch (e) { status(`${file.name}: ${e.message}`); return; }
    }
    showPieces(); showPiece(); typeset();
  }
  function addPiece(xml, file) {
    const doc = C.parseScore(xml), info = C.inspect(doc);
    let side = 0;
    const pc = {
      file, doc, info, title: info.title || file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), composer: info.composer,
      reduction: info.reduction, mens: '', transpose: 0, secs: {}, sections: [],
      parts: info.parts.map(p => ({ index: p.index, name: p.name, include: !p.keyboard, label: p.label, clef: '', side: p.keyboard ? 'verso' : (side++ % 2 ? 'recto' : 'verso') }))
    };
    // the book takes its title from its first piece, until you change it
    if (!state.pieces.length) { $('title').value = pc.title; $('composer').value = pc.composer; }
    state.pieces.push(pc); state.cur = state.pieces.length - 1;
  }

  // the list of pieces, in book order
  function showPieces() {
    const ol = $('pieces'); ol.innerHTML = '';
    const n = state.pieces.length;
    state.pieces.forEach((pc, i) => {
      const li = document.createElement('li'); if (i === state.cur && n > 1) li.className = 'cur';
      const pick = document.createElement('button'); pick.type = 'button'; pick.className = 'pick';
      pick.textContent = n > 1 ? `${i + 1}. ${pc.title}` : pc.title; const sm = document.createElement('small'); sm.textContent = pc.file; pick.append(sm);
      pick.title = 'Show the settings for this piece'; pick.onclick = () => { state.cur = i; showPieces(); showPiece(); };
      const btn = (txt, label, fn, off) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'mv'; b.textContent = txt; b.title = label; b.setAttribute('aria-label', `${label}: ${pc.title}`); b.disabled = off; b.onclick = fn; return b; };
      const move = d => () => { const [x] = state.pieces.splice(i, 1); state.pieces.splice(i + d, 0, x); state.cur = i + d; showPieces(); showPiece(); typeset(); };
      li.append(pick);
      if (n > 1) li.append(btn('↑', 'Move up', move(-1), i === 0), btn('↓', 'Move down', move(1), i === n - 1));
      li.append(btn('×', 'Remove', () => {
        state.pieces.splice(i, 1); state.cur = Math.min(state.cur, state.pieces.length - 1);
        if (!state.pieces.length) { $('settings').hidden = true; $('empty').hidden = false; $('book').innerHTML = ''; status(); }
        showPieces(); if (state.pieces.length) { showPiece(); typeset(); }
      }, false));
      ol.append(li);
    });
    $('dropTitle').textContent = n ? 'Add another piece' : 'Choose MusicXML files';
    $('sampleHint').hidden = n > 0;
    $('settings').hidden = !n; $('empty').hidden = n > 0;
    // with several pieces, each has its own title and settings, and the book can have an index
    $('pieceSelRow').hidden = $('pieceNames').hidden = n < 2; $('manyPieces').hidden = n < 2;
    $('pieceHeading').textContent = n > 1 ? 'Pieces: voices and sections' : 'Voices and sections';
    const sel = $('pieceSel'); sel.innerHTML = '';
    state.pieces.forEach((pc, i) => sel.append(new Option(`${i + 1}. ${pc.title}`, i)));
    sel.value = state.cur;
  }
  // the settings of the piece shown
  function showPiece() {
    const pc = piece(); if (!pc) return;
    $('pieceSel').value = state.cur;
    $('pieceTitle').value = pc.title; $('pieceComposer').value = pc.composer;
    $('reduction').value = String(pc.reduction); $('mens').value = pc.mens; $('transpose').value = String(pc.transpose);
    buildPartsTable(); state.secKey = '';
    showSections();
  }

  function buildPartsTable() {
    const tb = $('parts'); tb.innerHTML = '';
    for (const p of piece().parts) {
      const tr = document.createElement('tr');
      const inc = document.createElement('input'); inc.type = 'checkbox'; inc.checked = p.include; inc.title = `Include ${p.name}`; inc.setAttribute('aria-label', `Include ${p.name}`);
      inc.onchange = () => { p.include = inc.checked; typeset(); };
      const lab = document.createElement('input'); lab.type = 'text'; lab.value = p.label; lab.setAttribute('aria-label', `Label for ${p.name}`);
      lab.title = 'In partbooks, voices with the same label go in the same book';
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
    showFormat();
  }
  // what changes with the format: the page column, the initials, how pages are numbered, sections
  function showFormat() {
    const cb = state.format === 'choirbook';
    document.querySelectorAll('.sideCol').forEach(e => e.style.display = cb ? '' : 'none');
    $('sideHint').hidden = !cb;
    $('initialFor').textContent = cb ? 'First voice (top left)' : 'Each voice';
    $('initial2For').textContent = cb ? 'Other voices and sections' : 'Sections';
    // as in the sources: printed partbooks are numbered by page, choirbooks by leaf (on the right-hand page)
    $('numberingLabel').textContent = cb ? 'Folio numbers' : 'Page numbers';
    $('numberingHint').textContent = cb ? 'Choirbooks are numbered by leaf: one number on each right-hand page.' : 'Printed partbooks are numbered by page, in the outer corner; Roman numerals were common until about 1550.';
    $('pieceStartRow').hidden = cb;
    $('secWhere').textContent = cb ? 'Opening' : 'Page';
    $('secHint').textContent = cb
      ? 'The music runs on from opening to opening, turning only at a bar every voice has reached. A section can start a new line, with its initials and name, or a new opening.'
      : 'The music runs on. A section can start a new line, with its initial and name, or a new page. A voice silent through such a section gets “tacet”.';
    state.secKey = '';
  }

  // ---- typesetting (debounced)
  let timer = null, running = Promise.resolve();
  function typeset() { clearTimeout(timer); timer = setTimeout(() => { running = running.then(run); }, 250); }
  async function run() {
    if (!state.pieces.length) return;
    const many = state.pieces.length > 1, warnings = [], notes = [], pieces = [];
    for (const pc of state.pieces) {
      const sel = pc.parts.filter(p => p.include);
      if (!sel.length) { warnings.push(`${pc.title}: no voices selected, so it is left out.`); pc.sections = []; continue; }
      let res;
      try {
        res = C.convert(pc.doc, {
          reduction: +pc.reduction, transpose: +pc.transpose, mensuration: pc.mens, repeats: $('repeats').value,
          ficta: $('ficta').checked, barlines: $('barlines').checked, ij: false, brackets: $('brackets').checked,   // "ij" waits for more testing
          clefs: $('clefs').value, ledgers: $('ledgers').checked,
          parts: sel.map(p => ({ index: p.index, clef: p.clef, label: p.label }))
        });
      } catch (e) { status(`${pc.title}: ${e.message}`); return; }
      const tag = m => many ? `${pc.title}: ${m}` : m;
      warnings.push(...res.warnings.map(tag)); notes.push(...res.notes.map(tag));
      // the sections as found, with the user's names and where each starts (runs on unless chosen)
      pc.sections = res.sections.map(s => ({ ...s, mode: 'run', ...pc.secs[s.step] }));
      res.parts.forEach((p, i) => p.side = sel[i].side);
      // with one piece, its title is the book's
      pieces.push({ title: many ? pc.title : $('title').value, composer: many ? pc.composer : $('composer').value, parts: res.parts, sections: pc.sections, at: pc });
    }
    // [width, height] in inches, turned for landscape
    const pg = f => { const [, w, h] = PAGES[state.page[f]]; return state.orient[f] === 'landscape' ? [h, w] : [w, h]; };
    const scale = $('scale'); scale.style.transform = 'none'; scale.style.height = ''; scale.style.width = '';
    $('book').classList.add('sp-busy');
    let out;
    try {
      out = await L.render($('book'), { title: $('title').value, composer: $('composer').value, imprint: $('imprint').value, pieces }, {
        format: state.format, staffSize: staffSize(),
        initials: {
          first: { style: $('initial').value, lines: +$('initialLines').value },
          other: { style: $('initial2').value, lines: +$('initialLines2').value },
          src: state.initialSrc, red: $('rubric').checked
        },
        partbookPage: pg('partbook'), choirbookPage: pg('choirbook'),
        numbering: $('numbering').value, titlePage: $('titlePage').checked, index: $('index').checked, pieceStart: $('pieceStart').value,
        labels: { first: $('labelFirst').checked, rest: $('labelRest').checked }, margins: margins(), ruleEmpty: $('ruleEmpty').checked
      });
    } catch (e) { $('book').classList.remove('sp-busy'); status(e.message); return; }
    $('book').classList.remove('sp-busy');
    setPageRule(out.pageSize);
    state.staffUsed = out.staffSize;
    // where each section starts, for the list of sections
    state.pieces.forEach(pc => pc.where = new Map());
    for (const [pi, step, at] of out.where) pieces[pi].at.where.set(step, at);
    showSections();
    fitPreview();
    status(null, warnings.concat(out.warnings), notes);
    document.title = `${$('title').value || 'Serenissima Press'} – ${state.format}`;
  }
  // the sections of the piece shown: rebuilt only when they change, so typing a name keeps its focus
  function showSections() {
    const pc = piece(), box = $('sectionsBox'), tb = $('sections');
    const sections = pc ? pc.sections : [];
    box.hidden = !sections.length;
    if (box.hidden) return;
    const cb = state.format === 'choirbook';
    const key = state.cur + '|' + state.format + '|' + sections.map(s => s.step).join();
    if (key !== state.secKey) {
      state.secKey = key; tb.innerHTML = '';
      sections.forEach((s, n) => {
        const tr = document.createElement('tr'); tr.dataset.step = s.step; if (s.movement) tr.className = 'mv';
        const mine = () => (pc.secs[s.step] = pc.secs[s.step] || {});
        let start;
        if (!n) { start = document.createElement('span'); start.className = 'nm'; start.textContent = 'Start'; }
        else {
          start = document.createElement('select'); start.setAttribute('aria-label', `Where ${s.name || 'this section'} starts`);
          start.append(new Option('Runs on', 'run'), new Option('New line', 'line'), new Option(cb ? 'New opening' : 'New page', 'page'));
          start.value = s.mode || 'run';
          start.onchange = () => { mine().mode = start.value; typeset(); };
        }
        const nm = document.createElement('input'); nm.type = 'text'; nm.value = s.name; nm.setAttribute('aria-label', `Name of the section at bar ${s.mno}`);
        nm.title = s.auto ? 'Not named in the edition: taken from its first words' : 'As named in the edition';
        nm.oninput = () => { mine().name = nm.value; typeset(); };
        const cells = [[start], [nm], [`m. ${s.mno}`], ['']];
        cells.forEach(els => { const td = document.createElement('td'); td.append(...els); tr.append(td); });
        tb.append(tr);
      });
    }
    for (const tr of tb.rows) { const w = pc.where && pc.where.get(+tr.dataset.step); tr.cells[3].textContent = w ? String(w) : '–'; }
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
  window.addEventListener('resize', () => { if (state.pieces.length) fitPreview(); });

  // ---- controls
  $('file').onchange = e => { if (e.target.files.length) loadFiles([...e.target.files]); e.target.value = ''; };
  const drop = $('drop');
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { if (e.dataTransfer.files.length) loadFiles([...e.dataTransfer.files]); });
  $('sample').onclick = async () => {
    try { const r = await fetch('examples/o-quam-gloriosum.mxl'); if (!r.ok) throw new Error(); await loadFiles([new File([await r.arrayBuffer()], 'o-quam-gloriosum.mxl')]); }
    catch { status('Could not load the sample.'); }
  };
  document.querySelectorAll('[data-format]').forEach(b => b.onclick = () => {
    state.format = b.dataset.format;
    document.querySelectorAll('[data-format]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('page').value = state.page[state.format];
    $('orient').value = state.orient[state.format];
    showFormat(); showMargins(); showPageHint(); showSections(); typeset();
  });
  $('page').value = state.page.partbook;
  $('page').onchange = () => { state.page[state.format] = $('page').value; showMargins(); showPageHint(); typeset(); };
  $('margins').onchange = () => {
    const m = state.margins[state.format], v = $('margins').value;
    // custom starts from the margins in use
    if (v === 'custom' && m.preset !== 'custom') m.custom = MARGINS[m.preset].slice();
    m.preset = v; showMargins(); typeset();
  };
  MIDS.forEach((id, i) => $(id).oninput = () => {
    const n = parseFloat($(id).value);
    if (n >= 0) { state.margins[state.format].custom[i] = metric() ? n / 25.4 : n; typeset(); }
  });
  $('orient').onchange = () => { state.orient[state.format] = $('orient').value; showPageHint(); typeset(); };
  // the period sizes were usually oblong
  function showPageHint() { $('pageHint').hidden = !(['quarto', 'octavo'].includes(state.page[state.format]) && state.orient[state.format] === 'portrait'); }
  for (const id of ['title', 'composer', 'imprint']) $(id).oninput = typeset;
  $('titlePage').onchange = () => { $('imprintRow').hidden = !$('titlePage').checked; typeset(); };
  // the piece shown: its own settings
  $('pieceSel').onchange = () => { state.cur = +$('pieceSel').value; showPieces(); showPiece(); };
  $('pieceTitle').oninput = () => { piece().title = $('pieceTitle').value; showPieces(); typeset(); };
  $('pieceComposer').oninput = () => { piece().composer = $('pieceComposer').value; typeset(); };
  $('reduction').onchange = () => { piece().reduction = +$('reduction').value; typeset(); };
  $('mens').onchange = () => { piece().mens = $('mens').value; typeset(); };
  $('transpose').onchange = () => { piece().transpose = +$('transpose').value; typeset(); };
  // "Custom…" opens a box starting at the size last used, so it is easy to nudge
  $('staffSize').onchange = () => {
    const box = $('staffCustom'), on = $('staffSize').value === 'custom';
    box.hidden = !on;
    if (on) { if (!box.value) box.value = Math.round(state.staffUsed || 48); box.focus(); box.select(); }
    typeset();
  };
  $('staffCustom').oninput = typeset;
  for (const id of ['repeats', 'ficta', 'barlines', 'brackets', 'clefs', 'ledgers', 'numbering', 'index', 'pieceStart', 'labelFirst', 'labelRest', 'ruleEmpty', 'initialLines', 'initial2', 'initialLines2', 'rubric']) $(id).onchange = typeset;
  $('initial').onchange = () => { if ($('initial').value === 'image' && !state.initialSrc) $('initialFile').click(); typeset(); };
  $('initialFile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => { state.initialSrc = r.result; typeset(); }; r.readAsDataURL(f);
  };
  $('print').onclick = () => window.print();
  showFormat(); showMargins();

  // the editor's theme (the pages stay paper): light, dark or the system's, remembered in this browser
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } } };
  $('theme').value = store.get('sp-theme') || 'system';
  $('theme').onchange = () => {
    const t = $('theme').value;
    if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    store.set('sp-theme', t);
  };
  // which groups of settings are open, remembered too
  let open = {}; try { open = JSON.parse(store.get('sp-open') || '{}'); } catch (e) { }
  document.querySelectorAll('.sp-group').forEach(d => {
    if (open[d.dataset.group] !== undefined) d.open = open[d.dataset.group];
    d.addEventListener('toggle', () => { open[d.dataset.group] = d.open; store.set('sp-open', JSON.stringify(open)); });
  });

  // links like ?score=examples/o-quam-gloriosum.mxl&format=choirbook open a score directly (several: score=a.mxl&score=b.mxl)
  const q = new URLSearchParams(location.search);
  if (q.get('format') === 'choirbook') document.querySelector('[data-format=choirbook]').click();
  if (q.get('score')) (async () => {
    try {
      const files = [];
      for (const s of q.getAll('score')) {
        const r = await fetch(s); if (!r.ok) throw new Error(`Could not load ${s} (${r.status}).`);
        files.push(new File([await r.arrayBuffer()], s.split('/').pop()));
      }
      await loadFiles(files);
    } catch (e) { status(e.message); }
  })();
})();
