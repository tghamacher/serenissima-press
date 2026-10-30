// The test cases. A case either loads the app (score, format, style, chants, setup) and lists what to expect of the
// book, or is a unit test: unit() returns what is wrong, if anything. Every book is also checked for errors, for
// pages, and for anything set beyond the edge of its page.
// expect: { warnings: the number shown, warn: a pattern (or several) some warning must match, pages: [min, max] }
(function () {
  'use strict';
  const SAMPLE = 'examples/o-quam-gloriosum.mxl';
  const GLORIA = "name: Gloria Patri;\n%%\n(c4) GLó(f)ri(gh)a(h) Pa(h)tri,(h.) (:) et(h) Fí(h)li(g)o,(f.) (;) et(f) Spi(gh)rí(h)tu(h)i(h) San(g)cto.(f.) (::)";
  const text = d => d.getElementById('book').textContent;
  const pagesWith = (pages, sel) => pages.filter(p => p.querySelector(sel)).length;
  const spaced = (d, how) => { const s = d.getElementById('noteSpacing'); s.value = how; s.dispatchEvent(new Event('change')); };
  const colophon = text => d => {
    const c = d.getElementById('colophon'); c.checked = true; c.dispatchEvent(new Event('change'));
    const t = d.getElementById('colophonText'); t.value = text; t.dispatchEvent(new Event('input'));
  };
  const surfaced = (d, kind, aged) => {
    const s = d.getElementById('surface'); s.value = kind; s.dispatchEvent(new Event('change'));
    const a = d.getElementById('agedInk'); a.checked = aged; a.dispatchEvent(new Event('change'));
  };
  const pageSize = (d, page, orient) => { for (const [id, v] of [['page', page], ['orient', orient]]) { const s = d.getElementById(id); s.value = v; s.dispatchEvent(new Event('change')); } };
  // every "Residuum" clear of the staves, clefs and words around it (some must be there to check)
  const residuumClear = d => {
    const words = [...d.querySelectorAll('.sp-residuum')], bad = [];
    if (!words.length) return ['No "Residuum" to check'];
    for (const r of words) {
      const a = r.getBoundingClientRect(), page = r.closest('.sp-page');
      const hit = [...page.querySelectorAll('.sp-sys, .sp-ems, .sp-syl, .sp-tacet')].find(s => { const b = s.getBoundingClientRect(); return b.top < a.bottom - 1 && b.bottom > a.top + 1 && b.left < a.right - 1 && b.right > a.left + 1; });
      if (hit) bad.push(`"Residuum" on page ${[...d.querySelectorAll('.sp-page')].indexOf(page) + 1} runs into ${hit.className.baseVal !== undefined ? hit.className.baseVal : hit.className}`);
    }
    return bad.slice(0, 3);
  };

  // what parsing GABC must give
  const gabc = (src, want) => () => {
    let r; try { r = window.SPGabc.parse(src); } catch (e) { return want.error && want.error.test(e.message) ? [] : ['Threw: ' + e.message]; }
    if (want.error) return ['Did not throw'];
    const bad = [], notes = r.tokens.filter(t => t.t === 'n');
    if (want.clef && r.clef !== want.clef) bad.push(`clef ${r.clef}, expected ${want.clef}`);
    if (want.sig !== undefined && r.sig !== want.sig) bad.push(`signature "${r.sig}", expected "${want.sig}"`);
    if (want.notes !== undefined && notes.length !== want.notes) bad.push(`${notes.length} notes, expected ${want.notes}`);
    if (want.glyphs && notes.map(t => t.g).join(' ') !== want.glyphs) bad.push(`glyphs ${notes.map(t => t.g).join(' ')}, expected ${want.glyphs}`);
    if (want.name !== undefined && r.name !== want.name) bad.push(`name "${r.name}", expected "${want.name}"`);
    if (want.syl && notes.filter(t => t.s).map(t => t.s + ':' + t.y).join(' ') !== want.syl) bad.push(`syllables ${notes.filter(t => t.s).map(t => t.s + ':' + t.y).join(' ')}`);
    if (want.flats !== undefined && notes.filter(t => t.a).length !== want.flats) bad.push(`${notes.filter(t => t.a).length} flats, expected ${want.flats}`);
    if (want.warnings !== undefined && r.warnings.length !== want.warnings) bad.push(`${r.warnings.length} warnings: ${r.warnings.join(' | ')}`);
    if (r.tokens[r.tokens.length - 1].g !== 'E') bad.push('does not end with a double bar');
    return bad;
  };

  // the mensuration signs a one-voice score gives, its bars in the meters given (each bar a note filling it)
  const signs = (meters, o = {}) => () => {
    const len = { 1: 'whole', 2: 'half', 4: 'quarter' };
    const bars = meters.map(([b, t], i) => {
      const dur = b * 4 / t, time = i === 0 || meters[i - 1].join() !== [b, t].join() ? `<time><beats>${b}</beats><beat-type>${t}</beat-type></time>` : '';
      return `<measure number="${i + 1}"><attributes>${i ? '' : '<divisions>1</divisions><clef><sign>G</sign><line>2</line></clef>'}${time}</attributes>` +
        `<note><pitch><step>G</step><octave>4</octave></pitch><duration>${dur}</duration><type>${len[t] || 'whole'}</type></note></measure>`;
    }).join('');
    const xml = `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Cantus</part-name></score-part></part-list><part id="P1">${bars}</part></score-partwise>`;
    const C = window.SPConvert, r = C.convert(C.parseScore(xml), { reduction: 4, repeats: 'out', ledgers: true, clefs: 'period', parts: [{ index: 0 }], ...o });
    const got = r.parts[0].tokens.filter(t => t.t === 'm').map(t => t.g).join(' ');
    return got === o.want ? [] : [`signs ${got}, expected ${o.want}`];
  };

  window.CASES = [
    // ---- GABC
    { name: 'gabc: notes, clef, syllables', unit: gabc(GLORIA, { clef: 'C4', sig: '', notes: 18, name: 'Gloria Patri', warnings: 0, syl: 'Gló:begin ri:middle a:end Pa:begin tri,:end et:single Fí:begin li:middle o,:end et:single Spi:begin rí:middle tu:middle i:end San:begin cto.:end' }) },
    { name: 'gabc: virga, inclinatum, mora', unit: gabc('(c3) A(hv)men(GFE.) (::)', { clef: 'C3', notes: 4, glyphs: 'qg ev ef ec', warnings: 0 }) },
    { name: 'gabc: flat clef and flats', unit: gabc('(cb3) Ky(gixh)ri(i)e(h) (::)', { clef: 'C3', sig: 'bv', notes: 4, flats: 1 }) },
    { name: 'gabc: F clef, name from the words', unit: gabc('(f3) Al(f)le(g)lu(h)ia.(g) (::)', { clef: 'F3', name: 'Alleluia.' }) },
    { name: 'gabc: no clef is assumed C4', unit: gabc('Do(f)mi(g)ne(h)', { clef: 'C4', warnings: 1 }) },
    { name: 'gabc: no chant is an error', unit: gabc('just words', { error: /No chant found/ }) },

    // ---- mensuration signs: one for each change of sign, not for each change of an edition's time signature
    { name: 'mensuration: irregular bars keep one C', unit: signs([[4, 4], [2, 4], [4, 4], [1, 4], [4, 4]], { want: 'T1' }) },
    { name: 'mensuration: a real change is shown, and the return', unit: signs([[4, 4], [2, 4], [3, 1], [3, 1], [4, 4], [2, 4]], { want: 'T1 T3 T1' }) },

    // ---- playback: each note knows when it sounds and its pitch; the book's notes reach the player, in time order
    { name: 'playback: pitch and time of each note', unit: () => {
        const C = window.SPConvert, xml = `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Cantus</part-name></score-part></part-list><part id="P1">` +
          `<measure number="1"><attributes><divisions>1</divisions><key><fifths>-1</fifths></key><time><beats>4</beats><beat-type>2</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>` +
          `<note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note><note><rest/><duration>2</duration><type>half</type></note>` +
          `<note><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>2</duration><type>half</type></note></measure></part></score-partwise>`;
        const r = C.convert(C.parseScore(xml), { reduction: 2, repeats: 'out', ledgers: true, clefs: 'period', parts: [{ index: 0 }] });
        const got = JSON.stringify(r.parts[0].tokens.filter(t => t.pb).map(t => t.pb)), want = '[[0,4,67],[6,2,70]]';
        return got === want ? [] : [`notes ${got}, expected ${want}`]; } },
    { name: 'playback: the book\'s notes, for the player', score: SAMPLE, check: d => {
        const P = d.defaultView.SPPlay, bad = [], els = d.querySelectorAll('#book .sp-n');
        if (d.getElementById('player').hidden) bad.push('No player');
        if (P.notes.length !== els.length || !els.length) bad.push(`${P.notes.length} notes to play, ${els.length} on the page`);
        if (P.voices.length !== 4) bad.push(`voices ${P.voices.join(', ')}, expected four`);
        if (d.querySelectorAll('#playVoices input').length !== P.voices.length) bad.push('A box for each voice is missing');
        if (P.notes.some((n, i) => i && n.on < P.notes[i - 1].on)) bad.push('Notes out of time order');
        if (P.notes.some(n => !(n.len > 0) || !(n.midi > 30 && n.midi < 90))) bad.push('A note with no length or an odd pitch');
        // at the start, each voice that sings from the first beat is sounding
        const first = P.notes[0].on, now = P.at(first + 0.01);
        if (!now.length || now.length > 4) bad.push(`${now.length} notes sounding at the start`);
        return bad; } },

    // ---- the sample, in each format and style
    { name: 'sample: partbook, printed', score: SAMPLE, expect: { warnings: 0, pages: [4, 12] } },
    { name: 'sample: partbook, manuscript', score: SAMPLE, style: 'manuscript', expect: { warnings: 0, pages: [4, 12] },
      check: d => /\bi\b|\bii\b/.test(text(d)) || d.querySelector('.sp-ruled') ? [] : ['No roman numbering or ruling in the manuscript style'] },
    { name: 'sample: choirbook, printed', score: SAMPLE, format: 'choirbook', expect: { warnings: 0, pages: [2, 8] },
      check: d => d.querySelector('.sp-residuum') ? ['Residuum in the printed style'] : [] },
    { name: 'sample: choirbook, manuscript', score: SAMPLE, format: 'choirbook', style: 'manuscript', expect: { warnings: 0, pages: [2, 8] }, check: residuumClear },
    // where a voice goes on for only one staff, its "Residuum" is written smaller rather than run into the next
    { name: 'residuum: letter landscape, notes spaced as printed', score: SAMPLE, format: 'choirbook', style: 'manuscript', setup: d => { pageSize(d, 'letter', 'landscape'); spaced(d, 'printed'); }, check: residuumClear },
    // note spacing: in both styles, starting as each style's books did, and each style keeps its own
    { name: 'note spacing: follows the style', score: SAMPLE, format: 'choirbook', check: d => {
        const bad = [], s = d.getElementById('noteSpacing');
        if (s.closest('[hidden]')) bad.push('Hidden in the printed style');
        if (s.value !== 'printed') bad.push(`The printed style starts at ${s.value}`);
        spaced(d, 'wide');
        d.querySelector('[data-style=manuscript]').click();
        if (s.value !== 'close') bad.push(`The manuscript style starts at ${s.value}`);
        d.querySelector('[data-style=print]').click();
        if (s.value !== 'wide') bad.push('The printed style forgot its spacing');
        return bad; } },
    { name: 'note spacing: printed spacing in a manuscript, a longer book', score: SAMPLE, style: 'manuscript', setup: d => spaced(d, 'printed'), expect: { pages: [6, 12] } },
    // each step closer takes fewer staves (the book typeset at each, wide to very close)
    { name: 'note spacing: closer, fewer staves', score: SAMPLE, setup: async (d, win) => {
        win.staves = [];
        for (const how of ['wide', 'printed', 'moderate', 'close', 'closest']) {
          const was = d.getElementById('book').innerHTML; spaced(d, how);
          for (let t = 0; t < 100 && d.getElementById('book').innerHTML === was; t++) await new Promise(r => setTimeout(r, 100));
          await new Promise(r => setTimeout(r, 800));
          win.staves.push([how, d.querySelectorAll('#book .sp-staff').length]);
        } },
      expect: { warnings: 0 },
      check: (d, r) => { const s = d.defaultView.staves, bad = [];
        for (let i = 1; i < s.length; i++) if (!(s[i][1] < s[i - 1][1])) bad.push(`${s[i][0]}: ${s[i][1]} staves, not fewer than ${s[i - 1][0]}'s ${s[i - 1][1]}`);
        return bad; } },
    { name: 'residuum: A5 portrait', score: SAMPLE, format: 'choirbook', style: 'manuscript', setup: d => pageSize(d, 'a5', 'portrait'), check: residuumClear },

    // ---- the initial alphabets: each loads, and draws the letter as its glyph
    // the traced cadels: drawn from their outlines; Rossi's lacks a K, so a Kyrie's comes from Franck's, and says so
    ...['cadel', 'cadelFranck'].map(style => ({
      name: `initials: ${style}`, score: SAMPLE, format: 'choirbook', style: 'manuscript',
      setup: d => { for (const id of ['initial', 'initial2']) { const s = d.getElementById(id); s.value = style; s.dispatchEvent(new Event('change')); } },
      expect: { warnings: 0 },
      check: d => { const n = d.querySelectorAll('.sp-initial.sp-glyph svg path[d]').length; return n >= 4 ? [] : [`${n} cadel initials drawn, expected one for each voice`]; } })),
    { name: 'initials: Rossi has no K, so a Kyrie takes Franck’s', score: 'test/scores/kyrie.musicxml', setup: d => { const s = d.getElementById('initial'); s.value = 'cadel'; s.dispatchEvent(new Event('change')); },
      expect: { warnings: 1, warn: /Rossi’s cadel initials have no K, so Franck’s cadel is used for it instead/ },
      check: d => d.querySelector('.sp-initial.sp-glyph svg path[d]') ? [] : ['No cadel drawn'] },
    // the lower voices begin with their name's letter (the Alamire choirbooks): the Tenor's is a T, so Rossi's cadels serve
    // a Kyrie, and the rest of the name is written beside it; the first voice keeps the K
    { name: 'initials: lower voices by their name', score: 'test/scores/kyrie.musicxml', format: 'choirbook', style: 'manuscript',
      setup: d => { const s = d.getElementById('initial2'); s.value = 'cadel'; s.dispatchEvent(new Event('change')); const c = d.getElementById('voiceInitials'); c.checked = true; c.dispatchEvent(new Event('change')); },
      expect: { warnings: 0 },
      check: d => {
        const bad = [], names = [...d.querySelectorAll('#book .sp-band-l')].map(e => e.textContent).filter(Boolean);
        if (names[0] !== 'Cantu$') bad.push(`The first voice is named ${names[0]}, expected Cantu$`);
        if (!names.includes('enor')) bad.push(`No “enor” beside the Tenor’s initial: ${names.join(', ')}`);
        if (!d.querySelector('.sp-initial.sp-glyph svg path[d]')) bad.push('No cadel drawn');
        return bad; } },
    ...['gothicWoodcut', 'flourished', 'constructed', 'foliated', 'leaves'].map(style => ({
      name: `initials: ${style}`, score: SAMPLE, format: 'choirbook',
      setup: d => { for (const id of ['initial', 'initial2']) { const s = d.getElementById(id); s.value = style; s.dispatchEvent(new Event('change')); } },
      expect: { warnings: 0 },
      check: d => {
        const bad = [], fam = d.defaultView.getComputedStyle(d.querySelector('.sp-initial.sp-glyph') || d.body).fontFamily;
        const g = d.querySelectorAll('.sp-initial.sp-glyph');
        if (g.length < 4) bad.push(`${g.length} glyph initials, expected one for each voice`);
        const svgFont = [...d.querySelectorAll('.sp-initial.sp-glyph text, .sp-initial.sp-glyph [font-family]')].map(t => t.getAttribute('font-family') || t.style.fontFamily).find(Boolean) || fam;
        if (!d.fonts.check(`20px ${svgFont}`)) bad.push(`The font ${svgFont} did not load`);
        return bad; } })),

    // ---- the colophon: at the end of each partbook, clear of the music; in a choirbook not over the staves
    { name: 'colophon: each partbook ends with it', score: SAMPLE, setup: colophon('Venetiis, apud Antonium Gardanum\n1544, et 1601'),
      check: d => {
        const bad = [], cs = [...d.querySelectorAll('#book .sp-colo')], pages = [...d.querySelectorAll('#book .sp-page')];
        if (cs.length !== 4) bad.push(`${cs.length} colophons, expected one for each of the four books`);
        const t = cs.length ? cs[0].textContent : '';
        if (!/FINIS/.test(t) || !/M\. D\. XLIIII\./.test(t) || !/M\. DC\. I\./.test(t)) bad.push(`colophon reads "${t}"`);
        for (const c of cs) {
          const a = c.getBoundingClientRect(), pg = c.closest('.sp-page'), r = pg.getBoundingClientRect();
          if (a.bottom > r.bottom + 1 || a.top < r.top - 1) bad.push(`A colophon beyond its page (page ${pages.indexOf(pg) + 1})`);
          if ([...pg.querySelectorAll('.sp-sys, .sp-syl')].some(s => { const b = s.getBoundingClientRect(); return b.top < a.bottom - 1 && b.bottom > a.top + 1; })) bad.push(`A colophon over the music (page ${pages.indexOf(pg) + 1})`);
        }
        return bad; } },
    { name: 'colophon: choirbook, on a page of its own', score: SAMPLE, format: 'choirbook', style: 'manuscript', setup: colophon('Scriptum Mechliniae 1520'),
      check: d => {
        const cs = d.querySelectorAll('#book .sp-colo');
        if (cs.length !== 1) return [`${cs.length} colophons, expected one`];
        return cs[0].closest('.sp-page').querySelector('.sp-staff') ? ['The colophon is on a page of music'] : []; } },

    // ---- Non Papa's Ego flos campi, a 7: a score converted from PDF, its faults corrected by hand (the woodcut
    // alphabet has no E, so the printed books say so)
    { name: 'ego flos campi: partbook', score: 'test/scores/ego-flos-campi.mxl', expect: { warnings: 1, warn: /Woodcut initials have no E/ } },
    { name: 'ego flos campi: choirbook, printed', score: 'test/scores/ego-flos-campi.mxl', format: 'choirbook', expect: { warnings: 1, warn: /Woodcut initials have no E/ } },
    { name: 'ego flos campi: choirbook, manuscript', score: 'test/scores/ego-flos-campi.mxl', format: 'choirbook', style: 'manuscript', expect: { warnings: 0 }, check: residuumClear },

    // ---- the voices in step: one bar short in one voice
    { name: 'voices in step: a short bar is found', score: 'test/scores/out-of-step.musicxml', check: (d, { warnings }) => warnings.filter(w => /out of step/.test(w)).length === 1 ? [] : ['Expected one voice out of step'], expect: { warn: /^ALTVS is out of step with the other voices in one bar: m\. 2 \(a \w+ short\)/ } },

    // ---- chant between the polyphony (set aside: on only with ?chant, which these cases ask for)
    { name: 'chant: hidden unless asked for', score: SAMPLE, expect: { warnings: 0 }, check: d => d.getElementById('chantBox').hidden ? [] : ['The chant controls are showing'] },
    { name: 'chant: all voices, partbook', score: SAMPLE, chants: [{ after: 'start', gabc: GLORIA }], expect: { warnings: 0 },
      check: d => /Gloria Patri|Gló|Glo/.test(text(d)) ? [] : ['The chant\'s words are not in the book'] },
    { name: 'chant: one voice, the others tacet', score: SAMPLE, chants: [{ after: 'start', voice: 'TENOR', gabc: GLORIA }], expect: { warnings: 0 },
      check: (d, { pages }) => pagesWith(pages, '.sp-tacet') >= 3 ? [] : [`Only ${pagesWith(pages, '.sp-tacet')} page(s) with a tacet; the three voices that do not sing should have one`] },
    { name: 'chant: choirbook, manuscript', score: SAMPLE, format: 'choirbook', style: 'manuscript', chants: [{ after: 'start', gabc: GLORIA }], expect: { warnings: 0 } },
    // ---- projects: saved, then opened again (as a file, and from the browser) with every setting
    { name: 'project: saved and opened again', score: SAMPLE, roundTrip: true,
      setup: d => {
        const set = (el, v, ev) => { el.value = v; el.dispatchEvent(new Event(ev)); };
        d.querySelector('[data-format=choirbook]').click();
        d.querySelector('[data-style=manuscript]').click();
        set(d.getElementById('title'), 'A test book', 'input');
        set(d.getElementById('transpose'), '-2', 'change');
        set(d.getElementById('margins'), 'book', 'change');
        set(d.getElementById('signum'), d.getElementById('signum').options[2].value, 'change');
        set(d.querySelector('#parts input[type=text]'), 'SVPERIVS', 'input');
      },
      check: (d, pj) => {
        const bad = [];
        if (d.querySelector('[data-format=choirbook]').getAttribute('aria-pressed') !== 'true') bad.push('Not reopened as a choirbook');
        if (d.querySelector('[data-style=manuscript]').getAttribute('aria-pressed') !== 'true') bad.push('Not reopened in the manuscript style');
        if (d.getElementById('title').value !== 'A test book') bad.push('Title lost');
        if (d.getElementById('transpose').value !== '-2') bad.push('Transposition lost');
        if (!pj.pieces[0].xml || pj.pieces[0].parts[0].label !== 'SVPERIVS') bad.push('The project lacks the score or the voice\'s label');
        return bad;
      } },

    // ---- the surface and aged ink: only the pages' look, the book the same
    { name: 'surface: vellum and aged ink on a manuscript choirbook', score: SAMPLE, format: 'choirbook', style: 'manuscript', expect: { warnings: 0 },
      setup: d => { surfaced(d, 'vellum', true); },
      check: (d, { pages }) => {
        const bad = [], book = d.getElementById('book');
        if (pages.some(p => !/^url\("?data:image\/jpeg/.test(p.style.backgroundImage))) bad.push('A page without its vellum');
        if (book.dataset.ink !== 'manuscript') bad.push(`Ink "${book.dataset.ink}", expected the manuscript's`);
        if (d.getElementById('surfaceBox').hidden) bad.push('The surface options are hidden');
        const faded = [...d.querySelectorAll('.sp-n')].filter(n => parseFloat(n.style.getPropertyValue('--fade')) > 0).length;
        if (!faded) bad.push('Every note the same: the ink is not uneven');
        return bad;
      } },
    { name: 'surface: the other style takes its match', score: SAMPLE, expect: { warnings: 0 },
      setup: d => { surfaced(d, 'paper', true); d.querySelector('[data-style=manuscript]').click(); },
      check: d => d.getElementById('surface').value === 'vellum' && d.getElementById('agedInk').checked ? [] : [`Manuscript style has "${d.getElementById('surface').value}", aged ink ${d.getElementById('agedInk').checked}`] },
    { name: 'surface: clean leaves the pages alone', score: SAMPLE, expect: { warnings: 0 },
      setup: d => { surfaced(d, 'paper', true); surfaced(d, 'clean', true); },
      check: (d, { pages }) => {
        const book = d.getElementById('book');
        return pages.some(p => p.style.backgroundImage) || book.dataset.ink || book.dataset.surface ? ['The pages kept a surface or aged ink'] : [];
      } },
    { name: 'surface: saved with the project', score: SAMPLE, roundTrip: true,
      setup: d => { surfaced(d, 'paper', true); const p = d.getElementById('printSurface'); p.checked = false; p.dispatchEvent(new Event('change')); },
      check: d => {
        const bad = [];
        if (d.getElementById('surface').value !== 'paper') bad.push('Surface lost');
        if (!d.getElementById('agedInk').checked) bad.push('Aged ink lost');
        if (d.getElementById('printSurface').checked) bad.push('"Print the surface" lost');
        if (d.getElementById('book').dataset.printSurface !== 'off') bad.push('The book would print its surface');
        return bad;
      } },

    // ---- the harness itself: a staff pushed off its page must be caught
    { name: 'harness: catches a staff beyond the page', score: SAMPLE, failsWith: /beyond the page/,
      setup: d => { const s = d.querySelector('.sp-staff'); s.style.position = 'relative'; s.style.top = '5000px'; } },
    { name: 'chant: bad GABC is a warning, not an error', score: SAMPLE, chants: [{ after: 'start', gabc: 'just words' }], expect: { warnings: 1, warn: /No chant found/ } }
  ];
})();
