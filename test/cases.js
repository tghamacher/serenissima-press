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

    // ---- the harness itself: a staff pushed off its page must be caught
    { name: 'harness: catches a staff beyond the page', score: SAMPLE, failsWith: /beyond the page/,
      setup: d => { const s = d.querySelector('.sp-staff'); s.style.position = 'relative'; s.style.top = '5000px'; } },
    { name: 'chant: bad GABC is a warning, not an error', score: SAMPLE, chants: [{ after: 'start', gabc: 'just words' }], expect: { warnings: 1, warn: /No chant found/ } }
  ];
})();
