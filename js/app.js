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
  // pieces: [{ file, xml (as read, for saving), doc, info, title, composer, reduction, mens, transpose, parts: [{index, name, include, label, clef, side}],
  //   secs: {step: {name, mode}}, sections (as last converted) }]; cur: the piece whose settings are shown
  const state = { format: 'partbook', page: { partbook: 'quarto', choirbook: 'tabloid' }, orient: { partbook: 'landscape', choirbook: 'portrait' }, initialSrc: '', pieces: [], cur: 0, secKey: '' };
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
      const base = { narrow: 'Narrow', normal: 'Normal', wide: 'Wide', book: 'Book: narrow inside, wide bottom' }[opt.value];
      opt.text = opt.value === 'book' ? base : `${base} (${fmt(a[0])} ${unit})`;
    }
    $('margins').value = m.preset;
    $('marginBox').hidden = m.preset !== 'custom';
    MIDS.forEach((id, i) => { $(id).value = fmt(m.custom[i]); $(id).step = metric() ? '1' : '0.05'; });
    $('mUnit').textContent = unit;
    const a = margins();
    $('marginHint').textContent = (m.preset === 'book' ? `Top ${fmt(a.top)}, bottom ${fmt(a.bottom)}, inside ${fmt(a.inside)}, outside ${fmt(a.outside)} ${unit}. ` : '') +
      (state.format === 'choirbook' ? '“Inside” is the fold between the two facing pages.' : '“Inside” is the bound edge: the left side of a right-hand page, the right side of a left-hand one.');
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
      p.append(b, ' (opens the feedback form with your settings already filled in)'); box.append(p);
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
      `Format: ${state.format}, ${sel('page')} ${state.orient[state.format]}, staff ${sel('staffSize')}${state.staffUsed ? ` (${Math.round(state.staffUsed)} px)` : ''}, numbering ${sel('numbering')}, text ${$('textType').value}, sign ${$('signum').value}, spacing ${$('spacing').value}, style ${style()}, margins ${Object.values(margins()).join('/')} in`,
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
        // a saved project, told by its contents (iOS may offer it under any name)
        if (!isZip && /^\s*\{\s*"serenissima"/.test(new TextDecoder().decode(buf.slice(0, 64)))) {
          if (state.pieces.length && !confirm('Opening this project will replace the book you’re working on. Continue?')) return;
          openProject(JSON.parse(new TextDecoder().decode(buf))); return;
        }
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
      file, xml, doc, info, title: info.title || file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), composer: info.composer,
      reduction: info.reduction, mens: '', transpose: 0, secs: {}, sections: [], chants: [],
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
        if (!state.pieces.length) { $('settings').hidden = true; $('empty').hidden = false; $('book').innerHTML = ''; status(); keep(); }
        showPieces(); if (state.pieces.length) { showPiece(); typeset(); }
      }, false));
      ol.append(li);
    });
    $('dropTitle').textContent = n ? 'Add another piece' : 'Choose MusicXML files';
    $('sampleHint').hidden = n > 0;
    if (n) $('resumeHint').hidden = true;
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
      lab.title = 'Voices with the same label share a partbook';
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
  // a choirbook's staves: after the period books, or roomier (with an automatic staff size)
  const SPACING_HINTS = {
    print: 'Big staves for a choir gathered around one book, modeled on Moderne’s 1546 print of Morales’s masses. Each staff is about 4.4% of the page height (about 19 mm on 11 × 17 paper), with staves two staff-heights apart and the words tucked close underneath.',
    manuscript: 'Big staves for a choir gathered around one book, modeled on the Alamire workshop’s choirbooks. Each staff is about 4.1% of the page height (about 17.6 mm on 11 × 17 paper), with staves two staff-heights apart and the words tucked close underneath.',
    modern: 'More space between the staves and for the words, as in a modern edition. The staves are smaller (about 12 mm on 11 × 17 paper), so more music fits on each opening.'
  };
  function showSpacing() {
    $('spacingPeriod').text = style() === 'manuscript' ? 'Period: like the manuscript choirbooks' : 'Period: like the printed choirbooks';
    const k = $('spacing').value === 'modern' ? 'modern' : style();
    $('spacingHint').textContent = SPACING_HINTS[k] + ($('staffSize').value === '0' ? '' : ' Your staff size above overrides the size given here. Set it to Automatic to use this one.');
  }

  // ---- a book, partbook or choirbook, is printed or a manuscript. The style sets the type, the initials,
  // the ruling and a choirbook's staff (see SPACING_HINTS); each can still be changed, and each format and
  // style keeps its own choices. A printed book is black and white; a manuscript may have its initials (and a
  // choirbook its "Residuum") in red.
  const LOOK_IDS = ['textType', 'initial', 'initial2', 'rubric', 'ruleEmpty', 'numbering', 'noteSpacing'];
  const LOOKS = {
    print: { textType: 'roman', initial: 'woodcut', initial2: 'capital', rubric: false, ruleEmpty: false, numbering: 'arabic', noteSpacing: 'printed' },
    manuscript: { textType: 'gothic', initial: 'gothic', initial2: 'gothic', rubric: true, ruleEmpty: true, numbering: 'roman', noteSpacing: 'close' }
  };
  const STYLE_HINTS = {
    choirbook: {
      print: 'Modeled on the printed choirbooks of Dorico in Rome and Moderne in Lyon: roman type, woodcut initials, arabic folio numbers, black ink only, and blank space wherever there’s no music.',
      manuscript: 'Modeled on the Alamire workshop’s manuscript choirbooks: gothic script, decorated red initials, roman folio numbers, ruled staves, and “Residuum” written down the margin where a voice continues from the previous opening.'
    },
    partbook: {
      print: 'Modeled on the printed partbooks of Venice and Paris (Gardano, Scotto, Le Roy & Ballard): roman type, woodcut initials, arabic page numbers, black ink only, and blank space wherever there’s no music.',
      manuscript: 'Modeled on manuscript partbooks of the period: gothic script, decorated red initials, roman page numbers and ruled staves.'
    }
  };
  state.styles = { partbook: 'print', choirbook: 'print' };
  const style = () => state.styles[state.format];
  state.looks = {};
  for (const f of ['partbook', 'choirbook']) for (const s of ['print', 'manuscript']) state.looks[f + '|' + s] = { ...LOOKS[s] };
  const printed = () => style() === 'print';
  const lookKey = () => state.format + '|' + style();
  const saveLook = () => { state.looks[lookKey()] = Object.fromEntries(LOOK_IDS.map(id => [id, $(id).type === 'checkbox' ? $(id).checked : $(id).value])); };
  function loadLook() {
    const l = state.looks[lookKey()];
    for (const id of LOOK_IDS) if ($(id).type === 'checkbox') $(id).checked = l[id]; else $(id).value = l[id];
  }
  function showStyle() {
    document.querySelectorAll('[data-style]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.style === style())));
    $('styleHint').textContent = STYLE_HINTS[state.format][style()];
    $('rubricRow').hidden = printed();
    showSpacing();
  }
  function showFormat() {
    const cb = state.format === 'choirbook';
    document.querySelectorAll('.sideCol').forEach(e => e.style.display = cb ? '' : 'none');
    $('sideHint').hidden = !cb;
    $('initialFor').textContent = cb ? 'First voice (top left)' : 'Each voice';
    $('initial2For').textContent = cb ? 'Other voices and sections' : 'Sections';
    // as in the sources: printed partbooks are numbered by page, choirbooks by leaf (on the right-hand page)
    $('numberingLabel').textContent = cb ? 'Folio numbers' : 'Page numbers';
    $('numberingHint').textContent = cb ? 'Choirbooks are numbered by leaf, so only the right-hand pages get a number.' : 'Printed partbooks number every page in the outer corner. Roman numerals were common until about 1550.';
    $('pieceStartRow').hidden = cb;
    $('signRow').hidden = !cb;
    $('spacingRow').hidden = !cb;
    showStyle();
    $('secWhere').textContent = cb ? 'Opening' : 'Page';
    $('secHint').textContent = cb
      ? 'The music flows from one opening to the next, turning the page only at a bar every voice has reached. A section can also start on a new line or a new opening. Choirbooks don’t print section names, except in a “tacet” and the index. Each voice gets one initial per page, where its part begins.'
      : 'The music flows on without a break. A section can also start on a new line, with its own initial and name, or on a new page. A voice that’s silent for the whole section gets a “tacet”.';
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
      if (!sel.length) { warnings.push(`${pc.title}: no voices are selected, so it’s left out of the book.`); pc.sections = []; continue; }
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
      pc.base = res.sections.slice();
      addChants(pc, res, sel, warnings);
      pc.sections = res.sections.map(s => ({ ...s, mode: s.chant ? 'line' : 'run', ...pc.secs[s.step] }));
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
          src: state.initialSrc, red: $('rubric').checked && !printed()
        },
        partbookPage: pg('partbook'), choirbookPage: pg('choirbook'),
        numbering: $('numbering').value, titlePage: $('titlePage').checked, index: $('index').checked, pieceStart: $('pieceStart').value,
        labels: { first: $('labelFirst').checked, rest: $('labelRest').checked }, margins: margins(), ruleEmpty: $('ruleEmpty').checked, textType: $('textType').value, signum: $('signum').value, style: style(),
        noteSpacing: $('noteSpacing').value,
        spacing: $('spacing').value === 'modern' ? 'modern' : style()
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
    keep();
  }
  // the sections of the piece shown: rebuilt only when they change, so typing a name keeps its focus
  // ---- chant verses: each read from GABC and set between the piece's sections, in the voices that sing it
  // (c.after: 'start', before the first section, or the step of the section it follows; c.voice: 'all' or a
  // part's index). Each goes in as a section of its own, its tokens spliced into those voices, the bars after
  // it moved on; a voice that does not sing it has the section empty, and so a "tacet".
  // set aside for now (chant wants a four-line staff, not this five-line one): on only with ?chant in the address,
  // as the tests use it; a project's verses are kept but not set
  const CHANT = new URLSearchParams(location.search).has('chant');
  $('chantBox').hidden = !CHANT;
  function addChants(pc, res, sel, warnings) {
    const placed = {}, todo = CHANT ? pc.chants.filter(c => c.gabc.trim()) : [];
    // a piece without sections is one, from its start
    if (todo.length && !res.sections.length) res.sections.push({ step: 0, mno: '', name: '', auto: true, movement: true });
    for (const c of todo) {
      let ch;
      try { ch = window.SPGabc.parse(c.gabc); } catch (e) { warnings.push(`${pc.title}, chant: ${e.message}`); continue; }
      ch.warnings.forEach(w => warnings.push(`${pc.title}, chant ${ch.name}: ${w}`));
      const secs = res.sections, k = c.after === 'start' ? 0 : c.after === 'end' ? secs.length : secs.findIndex(s => s.step === +c.after && !s.chant) + 1;
      if (k <= 0 && c.after !== 'start') continue;
      // after the chant: the next section, or the end of the piece
      const next = secs[k], lastStep = Math.max(0, ...res.parts.flatMap(p => Object.keys(p.cuts).map(Number)));
      const base = next ? next.step : lastStep + 1, n = placed[base] = (placed[base] || 0) + 1, step = base - 0.5 + n / 100;
      res.parts.forEach((p, i) => {
        const sings = c.voice === 'all' || sel[i].index === +c.voice;
        // (a piece that opens with a prefatory staff has no cut at its start)
        const at = next ? (p.cuts[next.step] !== undefined ? p.cuts[next.step] : k === 0 ? 0 : undefined) : p.tokens.length;
        if (at === undefined) return;
        const toks = sings ? ch.tokens.map(t => ({ ...t })) : [];
        p.tokens.splice(at, 0, ...toks);
        for (const map of [p.cuts, p.loose]) {
          if (!map) continue;
          for (const st of Object.keys(map)) if (+st > step) map[st] += toks.length;
          map[step] = at;
          if (next && map[next.step] === undefined) map[next.step] = at + toks.length;
        }
      });
      secs.splice(k, 0, { step, mno: 'chant', name: c.name || ch.name, auto: !c.name, chant: { clef: ch.clef, sig: ch.sig } });
    }
  }
  function showChants() {
    const pc = piece(), box = $('chants'); if (!pc) return;
    const base = pc.base || [], parts = pc.parts.filter(p => p.include);
    const key = state.cur + '|' + pc.chants.length + '|' + base.map(s => s.step + s.name).join() + '|' + parts.map(p => p.index).join();
    if (key === state.chantKey) return;
    state.chantKey = key; box.innerHTML = '';
    pc.chants.forEach((c, n) => {
      const d = document.createElement('div'); d.className = 'sp-chant';
      const row = document.createElement('div'); row.className = 'sp-row';
      const field = (label, ctl) => { const l = document.createElement('label'); l.className = 'sp-field'; const s = document.createElement('span'); s.textContent = label; l.append(s, ctl); return l; };
      const after = document.createElement('select');
      if (base.length) {
        after.append(new Option('Before the first section', 'start'));
        base.forEach(s => after.append(new Option(`After ${s.name || 'm. ' + s.mno}`, s.step)));
      } else after.append(new Option('Before the piece', 'start'), new Option('After the piece', 'end'));
      if (![...after.options].some(o => o.value === String(c.after))) c.after = base.length ? base[0].step : 'end';
      after.value = c.after; after.onchange = () => { c.after = /^(start|end)$/.test(after.value) ? after.value : +after.value; typeset(); };
      const who = document.createElement('select');
      who.append(new Option('All voices', 'all'));
      parts.forEach(p => who.append(new Option(p.label, p.index)));
      if (![...who.options].some(o => o.value === String(c.voice))) c.voice = 'all';
      who.value = c.voice; who.onchange = () => { c.voice = who.value === 'all' ? 'all' : +who.value; typeset(); };
      const x = document.createElement('button'); x.type = 'button'; x.className = 'sp-x'; x.textContent = '×'; x.title = 'Remove this chant';
      x.onclick = () => { pc.chants.splice(n, 1); state.chantKey = ''; showChants(); typeset(); };
      row.append(field('Where', after), field('Sung by', who), x);
      const nm = document.createElement('input'); nm.type = 'text'; nm.value = c.name || ''; nm.placeholder = 'Name (else its first words)';
      nm.oninput = () => { c.name = nm.value; typeset(); };
      const ta = document.createElement('textarea'); ta.value = c.gabc; ta.spellcheck = false;
      ta.placeholder = 'name: Gloria Patri;\n%%\n(c4) GLó(f)ri(gh)a(h) Pa(h)tri,(h.) (:) et(h) Fí(h)li(g)o,(f.) (::)';
      ta.oninput = () => { c.gabc = ta.value; typeset(); };
      const load = document.createElement('button'); load.type = 'button'; load.className = 'sp-link'; load.textContent = 'Load a .gabc file';
      load.onclick = () => { state.chantFor = c; $('chantFile').click(); };
      const foot = document.createElement('p'); foot.className = 'sp-hint'; foot.append(load);
      d.append(row, field('Name', nm), ta, foot);
      box.append(d);
    });
  }
  function showSections() {
    showChants();
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
          // a chant, in its own clef, cannot run on from the music before it
          if (!s.chant) start.append(new Option('Continues', 'run'));
          start.append(new Option('New line', 'line'), new Option(cb ? 'New opening' : 'New page', 'page'));
          start.value = s.mode === 'run' && s.chant ? 'line' : s.mode || 'run';
          start.onchange = () => { mine().mode = start.value; typeset(); };
        }
        const nm = document.createElement('input'); nm.type = 'text'; nm.value = s.name; nm.setAttribute('aria-label', `Name of the section at bar ${s.mno}`);
        nm.title = s.auto ? 'The edition doesn’t name this section, so its first words are used' : 'As named in the edition';
        nm.oninput = () => { mine().name = nm.value; typeset(); };
        const cells = [[start], [nm], [s.chant ? 'chant' : s.mno ? `m. ${s.mno}` : ''], ['']];
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
  // iOS knows no file type for .mxl or .musicxml, so its picker greys them out: there, offer every file
  // (a score is told by its contents, not its name). iPadOS calls itself a Mac, but one with a touch screen
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) $('file').removeAttribute('accept');
  $('file').onchange = e => { if (e.target.files.length) loadFiles([...e.target.files]); e.target.value = ''; };
  const drop = $('drop');
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { if (e.dataTransfer.files.length) loadFiles([...e.dataTransfer.files]); });
  $('sample').onclick = async () => {
    try { const r = await fetch('examples/o-quam-gloriosum.mxl'); if (!r.ok) throw new Error(); await loadFiles([new File([await r.arrayBuffer()], 'o-quam-gloriosum.mxl')]); }
    catch { status('Couldn’t load the sample. Check your connection and try again.'); }
  };
  document.querySelectorAll('[data-format]').forEach(b => b.onclick = () => {
    saveLook();
    state.format = b.dataset.format;
    loadLook();
    document.querySelectorAll('[data-format]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('page').value = state.page[state.format];
    $('orient').value = state.orient[state.format];
    showFormat(); showMargins(); showPageHint(); showSections(); typeset();
  });
  document.querySelectorAll('[data-style]').forEach(b => b.onclick = () => {
    if (style() === b.dataset.style) return;
    saveLook(); state.styles[state.format] = b.dataset.style; loadLook();
    showStyle(); typeset();
  });
  // partbooks start as the Venetian ones were: an oblong quarto
  $('page').value = state.page.partbook; $('orient').value = state.orient.partbook;
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
    showSpacing(); typeset();
  };
  $('staffCustom').oninput = typeset;
  for (const id of ['repeats', 'ficta', 'barlines', 'brackets', 'clefs', 'ledgers', 'numbering', 'index', 'pieceStart', 'labelFirst', 'labelRest', 'ruleEmpty', 'textType', 'signum', 'initialLines', 'initial2', 'initialLines2', 'rubric', 'noteSpacing']) $(id).onchange = typeset;
  $('spacing').onchange = () => { showSpacing(); typeset(); };
  $('initial').onchange = () => { if ($('initial').value === 'image' && !state.initialSrc) $('initialFile').click(); typeset(); };
  $('initialFile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => { state.initialSrc = r.result; typeset(); }; r.readAsDataURL(f);
  };
  $('addChant').onclick = () => {
    const pc = piece(); if (!pc) return;
    const base = pc.base || [];
    pc.chants.push({ after: base.length ? base[0].step : 'end', voice: 'all', name: '', gabc: '' });
    state.chantKey = ''; showChants();
    const tas = $('chants').querySelectorAll('textarea'); if (tas.length) tas[tas.length - 1].focus();
  };
  $('chantFile').onchange = e => {
    const f = e.target.files[0], c = state.chantFor; e.target.value = '';
    if (!f || !c) return;
    const r = new FileReader();
    r.onload = () => { c.gabc = String(r.result); state.chantKey = ''; showChants(); typeset(); };
    r.readAsText(f);
  };
  // ---- projects: the book's settings and its scores in one file (JSON), to open again here or elsewhere; the
  // last one is also kept in this browser, to pick up after a reload
  const PROJECT_IDS = ['title', 'composer', 'imprint', 'staffSize', 'staffCustom', 'numbering', 'spacing', 'textType', 'labelFirst', 'labelRest', 'ruleEmpty', 'signum',
    'titlePage', 'index', 'pieceStart', 'clefs', 'ledgers', 'repeats', 'ficta', 'barlines', 'brackets', 'initial', 'initialLines', 'initial2', 'initialLines2', 'rubric', 'noteSpacing'];
  function project() {
    saveLook();
    return {
      serenissima: 1, version: $('version').dataset.version, saved: new Date().toISOString(),
      book: {
        controls: Object.fromEntries(PROJECT_IDS.map(id => [id, $(id).type === 'checkbox' ? $(id).checked : $(id).value])),
        format: state.format, styles: state.styles, looks: state.looks, page: state.page, orient: state.orient, margins: state.margins, initialSrc: state.initialSrc, cur: state.cur
      },
      pieces: state.pieces.map(pc => ({
        file: pc.file, xml: pc.xml, title: pc.title, composer: pc.composer, reduction: pc.reduction, mens: pc.mens, transpose: pc.transpose, secs: pc.secs, chants: pc.chants,
        parts: pc.parts.map(({ index, include, label, clef, side }) => ({ index, include, label, clef, side }))
      }))
    };
  }
  function openProject(pj) {
    if (!pj || pj.serenissima !== 1 || !Array.isArray(pj.pieces)) throw new Error('This file isn’t a Serenissima Press project, or it was saved by a newer version.');
    const b = pj.book || {};
    state.chantKey = '';
    state.pieces = [];
    for (const s of pj.pieces) {
      addPiece(s.xml, s.file);
      const pc = state.pieces[state.pieces.length - 1];
      for (const k of ['title', 'composer', 'reduction', 'mens', 'transpose']) if (s[k] !== undefined) pc[k] = s[k];
      pc.secs = s.secs || {}; pc.chants = s.chants || [];
      for (const p of s.parts || []) { const q = pc.parts.find(x => x.index === p.index); if (q) Object.assign(q, p); }
    }
    // the book: what each format and style keeps, then the controls (the look of the format in use among them)
    for (const k of ['format', 'initialSrc']) if (b[k] !== undefined) state[k] = b[k];
    for (const k of ['styles', 'page', 'orient', 'margins']) if (b[k]) Object.assign(state[k], b[k]);
    // before 1.2, close spacing was a switch of the manuscript style: on, close; off, as printed
    const spacingOf = tight => tight ? 'close' : 'printed';
    for (const l of Object.values(b.looks || {})) if (l.tight !== undefined) { if (l.noteSpacing === undefined) l.noteSpacing = spacingOf(l.tight); delete l.tight; }
    if (b.controls && b.controls.tight !== undefined) { if (b.controls.noteSpacing === undefined) b.controls.noteSpacing = spacingOf(b.controls.tight && b.styles && b.styles[b.format || 'partbook'] === 'manuscript'); delete b.controls.tight; }
    // before 1.3, initials could be set on a dotted ground: now the foliated woodcut
    for (const c of [b.controls, ...Object.values(b.looks || {})]) if (c) for (const id of ['initial', 'initial2']) if (c[id] === 'letter') c[id] = 'foliated';
    if (b.looks) Object.assign(state.looks, b.looks);
    for (const [id, v] of Object.entries(b.controls || {})) if ($(id)) { if ($(id).type === 'checkbox') $(id).checked = !!v; else $(id).value = v; }
    state.cur = Math.min(Math.max(0, b.cur || 0), state.pieces.length - 1);
    document.querySelectorAll('[data-format]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.format === state.format)));
    $('page').value = state.page[state.format]; $('orient').value = state.orient[state.format];
    $('staffCustom').hidden = $('staffSize').value !== 'custom';
    $('imprintRow').hidden = !$('titlePage').checked;
    showFormat(); showMargins(); showPageHint();
    showPieces(); showPiece(); typeset();
  }
  // a file name from the book's title
  const projectName = () => ($('title').value || state.pieces[0].title || 'book').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) + '.serenissima';
  $('saveProject').onclick = () => {
    if (!state.pieces.length) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(project())], { type: 'application/json' }));
    a.download = projectName(); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };
  // kept in this browser (IndexedDB: a book's scores can outgrow localStorage), a second after each change
  const kept = {
    db: () => new Promise((res, rej) => { const r = indexedDB.open('serenissima', 1); r.onupgradeneeded = () => r.result.createObjectStore('projects'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }),
    async op(mode, fn) { const db = await this.db(); return new Promise((res, rej) => { const t = db.transaction('projects', mode), r = fn(t.objectStore('projects')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); },
    get() { return this.op('readonly', s => s.get('last')).catch(() => null); },
    set(v) { return this.op('readwrite', s => v ? s.put(v, 'last') : s.delete('last')).catch(() => { }); }
  };
  let keepTimer = null;
  function keep() { clearTimeout(keepTimer); keepTimer = setTimeout(() => kept.set(state.pieces.length ? project() : null), 1000); }
  // on an empty page, the book last open here, to pick up
  async function offerKept() {
    const pj = await kept.get();
    if (!pj || !pj.pieces || !pj.pieces.length || state.pieces.length) return;
    const t = (pj.book && pj.book.controls && pj.book.controls.title) || pj.pieces[0].title || pj.pieces[0].file;
    const when = new Date(pj.saved), n = pj.pieces.length;
    $('resume').textContent = `${t}${n > 1 ? ` (${n} pieces)` : ''}`;
    $('resume').title = `Last edited ${when.toLocaleString()}`;
    $('resume').onclick = () => { try { openProject(pj); } catch (e) { status(e.message); } };
    $('resumeHint').hidden = false;
  }

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
  if (q.get('style') === 'manuscript') document.querySelector('[data-style=manuscript]').click();
  if (!q.get('score')) offerKept();
  if (q.get('score')) (async () => {
    try {
      const files = [];
      for (const s of q.getAll('score')) {
        const r = await fetch(s); if (!r.ok) throw new Error(`Couldn’t load ${s} (${r.status}).`);
        files.push(new File([await r.arrayBuffer()], s.split('/').pop()));
      }
      await loadFiles(files);
    } catch (e) { status(e.message); }
  })();
})();
