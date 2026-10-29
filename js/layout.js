// Lays out converted parts as partbook or choirbook pages, with text underlay.
// Everything is measured from the fonts, so it must run after they have loaded.
(function (global) {
  'use strict';

  const IN = 96;                 // CSS px per inch
  // (the staff lines run from 0.24 F to 0.70 F of a staff 1 F high)
  let TEXT = 0.27;               // syllable size, as a proportion of the staff font size F
  const GAP = 0.06;              // minimum staff between signs
  let SYS = 1.30;                // height of one system (staff + text)
  let TEXT_TOP = 0.89;           // top of the syllables
  // a choirbook spaced as the period books were (o.spacing 'print' or 'manuscript'): staves about two
  // staff-heights apart, the syllables smaller and close under the staff, the voice's and section's names
  // in the space above it; 'modern' spaces it as a partbook
  const SPACING = { modern: { TEXT: 0.27, SYS: 1.30, TEXT_TOP: 0.89 }, period: { TEXT: 0.22, SYS: 0.95, TEXT_TOP: 0.72 } };
  const FMAX = 100;
  const PARTBOOK = 56;           // a partbook's staff, with its syllables about 11 pt
  const CREDIT = 'Music font: EMS Serenissima by Elam Rotem, Early Music Sources (CC BY 4.0) · Set with Serenissima Press';

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const cache = new Map();
  let meas = null;
  function unit(str, cls) {
    const key = (gothic ? 'g|' : '') + cls + '|' + str; let v = cache.get(key);
    if (v === undefined) {
      const s = el('span', cls, str); s.style.fontSize = '100px'; meas.appendChild(s);
      v = s.getBoundingClientRect().width / 100; s.remove(); cache.set(key, v);
    }
    return v;
  }
  const roman = n => { let s = ''; for (const [v, r] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= v) { s += r; n -= v; } return s; };
  const wE = (s, F) => s ? unit(s, 'sp-ems') * F : 0;
  const wT = (s, T) => s ? unit(s, 'sp-text') * T : 0;

  // Gothic text type (Rotunda Pommerania) is set as the printers set it: long s within a word and round s
  // at its end, and the founts' ligatures. The font has its own places for these: "$" is the round s and
  // accented letters stand for ligatures, so true accents are dropped (but not umlauts, which it has).
  let gothic = false;
  const LIG = [['ssi', 'Î'], ['sst', 'ô'], ['sch', 'À'], ['ffl', 'â'], ['s$', 'Á'], ['ss', 'ó'], ['st', 'ù'], ['si', 'ò'], ['sk', 'Ê'],
    ['ch', 'à'], ['ck', 'á'], ['ff', 'è'], ['fi', 'é'], ['fl', 'ì'], ['ft', 'í'], ['ll', 'î'], ['tt', 'û'], ['tz', 'ú']];
  const LIGS = new Map(LIG), LIG_RE = new RegExp(LIG.map(([a]) => a.replace('$', '\\$')).join('|'), 'g');
  // end: the string ends a word (a syllable followed by a hyphen does not)
  function gothicText(s, end = true) {
    if (!s) return s;
    s = [...s.normalize('NFC')].map(c => 'äöüÄÖÜßæœÆŒ'.includes(c) ? c : c.normalize('NFD').replace(/[̀-ͯ]/g, '')).join('').replace(/\$/g, 'S');
    s = s.replace(/s(?=[^\p{L}]|$)/gu, (m, at) => at === s.length - 1 && !end ? 's' : '$');
    return s.replace(LIG_RE, m => LIGS.get(m));
  }
  // voice names in gothic are not in capitals: CANTVS is Cantus, ALTVS II Altus II
  const gothicLabel = l => gothicText(l.split(' ').map((w, i) => i && /^[ivxlc]+$/i.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase().replace(/v/g, 'u')).join(' '));
  // a roman numeral (1 to 39) after the first word, in lower case: BASSVS II is BASSVS ii
  const lowNumerals = s => s && s.replace(/(\s)(X{0,3}(?:IX|IV|V?I{0,3}))(?=[\s.,;:)]|$)/g, (m, sp, r) => r ? sp + r.toLowerCase() : m);

  // the decorated initial takes the first letter; the rest of the first word goes in capitals (in roman type)
  function prepareText(p, mode, fallback) {
    const caps = s => gothic ? s : s.toUpperCase().replace(/U/g, 'V').replace(/J/g, 'I');
    const toks = p.tokens, first = toks.findIndex(t => t.s);
    p.initialLetter = '';
    if (first >= 0) {
      const word = [];
      for (let i = first; i < toks.length; i++) { if (!toks[i].s) continue; word.push(toks[i]); if (toks[i].y === 'single' || toks[i].y === 'end') break; }
      p.initialLetter = word[0].s.charAt(0).toUpperCase().replace(/U/g, 'V').replace(/J/g, 'I');
      if (mode !== 'none') word[0].s = word[0].s.slice(1);
      word.forEach(t => t.s = caps(t.s));
    }
    if (gothic) toks.forEach(t => { if (t.s) t.s = gothicText(t.s, !(t.y === 'begin' || t.y === 'middle')); });
    toks.forEach(t => { if (t.s) t.sd = t.s + (t.y === 'begin' || t.y === 'middle' ? '-' : ''); });
    if (!p.initialLetter) p.initialLetter = fallback || p.label.charAt(0);
  }

  // token boxes: [staff L][sign][staff R], wide enough for the syllable centred under the note head.
  // Note spacing, from very close to wide. gap: the least staff between signs (in F); syl: the least room
  // between syllables (in text size). Close spacings (close: true), as the scribes wrote: notes close together
  // and the words fitted under them, a syllable spreading under the notes beside it; a note moves on only to keep
  // its syllable clear of the one before. own: what a syllable needs on the left at a line's start; tail: how far
  // it hangs past its box. The others, as the printers set: each note as wide as its syllable.
  // Each of the font's notes carries its own piece of staff, wider than its head; so the notes can come closer,
  // their pieces overlap (the lines lie on each other), trim off each side (trim: true). Not where the sign
  // reaches the edge of its piece: ledger lines, the longa's and maxima's tails, fusas' flags, an accidental or a dot.
  const SPACINGS = {
    closest: { close: true, gap: 0.012, syl: 0.25, trim: true },
    close: { close: true, gap: 0.025, syl: 0.35, trim: true },     // the Alamire manuscripts
    moderate: { close: true, gap: 0.045, syl: 0.45, trim: false },
    printed: { close: false, gap: GAP, syl: 0.5, trim: false },   // the printed books
    wide: { close: false, gap: 0.1, syl: 0.8, trim: false }
  };
  let sp = SPACINGS.printed;
  const TRIM = 0.03;
  const trimmable = tk => (tk.t === 'n' || tk.t === 'r') && !tk.a && !tk.d && tk.lp === undefined && !/^[1qr68]|[zsk,]$/.test(tk.g);
  function boxes(p, F) {
    const T = F * TEXT, gap = sp.gap * F, tg = sp.syl * T;
    let x = 0, prev = -Infinity;
    return p.tokens.map(tk => {
      const trim = sp.trim && trimmable(tk) ? TRIM * F : 0;
      const aW = wE(tk.a, F), gW = wE(tk.g, F), dW = wE(tk.d, F), glyph = aW + gW + dW - 2 * trim, center = aW + gW / 2 - trim;
      let L = 0, R = gap, own = 0, tail = 0;
      if (tk.sd) {
        const half = (wT(tk.sd, T) + tg) / 2;
        own = Math.max(0, half - center);
        if (sp.close) { L = Math.max(0, prev - (x + center - half)); prev = x + L + center + half; tail = Math.max(0, half - (glyph - center) - R); }
        else { L = own; R = Math.max(gap, half - (glyph - center)); }
      }
      if (tk.g === 'E') R = 0;
      x += L + glyph + R;
      return { tk, aW, gW, w: L + glyph + R, L, R, own, tail, trim };
    });
  }
  // a box that starts a line: in close spacing, only the room its own syllable needs (not what the line before wanted)
  function startLine(b) { if (sp.close && b && b.L !== b.own && b.tk.sd) { b.w += b.own - b.L; b.L = b.own; } }
  function prefix(p, F) { const gap = GAP * F * 1.5; return { gap, w: wE(p.clef, F) + gap + (p.sig ? wE(p.sig, F) + gap : 0) }; }
  function breakLines(p, F, widthFor) {
    const bx = boxes(p, F), pre = prefix(p, F), cW = wE('Ug', F) + GAP * F;
    const lines = []; let cur = [], used = 0;
    for (const b of bx) {
      const avail = widthFor(lines.length) - pre.w - cW;
      // (a syllable hanging past its note must still end within the line)
      if (cur.length && b.tk.g !== 'E' && used + b.w + b.tail > avail) {
        const carry = [];
        while (cur.length > 1 && cur[cur.length - 1].tk.t === 'm') carry.unshift(cur.pop());   // no sign stranded at a line end
        lines.push(cur); cur = carry;
        startLine(cur[0] || b); used = carry.reduce((s, c) => s + c.w, 0);
      }
      cur.push(b); used += b.w;
    }
    if (cur.length) lines.push(cur);
    return lines;
  }

  // ---------------------------------------------------------------- initials
  // Glyph-font initials are drawn as SVG cropped to the letter's ink. Framed ones (a letter cut into a
  // decorated block) fill the initial's height; bare capitals stand on its foot, as tall as their H.
  const INITIAL_FONTS = {
    woodcut: { family: '"EB Garamond Initials"', framed: true, letters: 'ADFGLNOQT', name: 'Woodcut', fallback: 'foliated', fallbackName: 'the foliated woodcut' },
    gothic: { family: 'Yinit', framed: true },
    // Dieter Steffmann's: two gothic, three roman. Each is sized by all its ink, flourishes and frame included
    gothicWoodcut: { family: '"Gotische Initialen"', framed: true },
    flourished: { family: '"Rothenburg Decorative"', framed: true },
    constructed: { family: '"Typographer Caps"', framed: true },
    foliated: { family: '"Goudy Initialen"', framed: true },
    leaves: { family: '"Zallman Caps"', framed: true },
    capital: { family: '"IM Fell French Canon"' },
    // cadels traced from the writing books (outlines in fonts/initials/<outlines>.json): Rossi has no K or W
    cadel: { outlines: 'rossi-cadels', framed: true, letters: 'ABCDEFGHILMNOPQRSTVXYZ', name: 'Rossi’s cadel', fallback: 'cadelFranck', fallbackName: 'Franck’s cadel' },
    cadelFranck: { outlines: 'franck-cadels', framed: true, letters: 'ABCDEFGHIKLMNOPQRSTVWXYZ', name: 'Franck’s cadel', fallback: 'capital', fallbackName: 'a plain capital' }
  };
  // the traced alphabets, as loaded: { m: the matrix of their paths, letters: { A: { box: [x, y, w, h], d } } }
  const OUTLINES = {};
  async function loadOutlines(name) {
    if (OUTLINES[name]) return;
    const r = await fetch(`fonts/initials/${name}.json`);
    if (!r.ok) throw new Error('The cadel initials couldn’t be loaded. Check your connection and reload the page.');
    OUTLINES[name] = await r.json();
  }
  function outline(o, L) {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
    svg.setAttribute('viewBox', L.box.join(' ')); svg.setAttribute('aria-hidden', 'true');
    p.setAttribute('transform', `matrix(${o.m.join(' ')})`); p.setAttribute('d', L.d); p.setAttribute('fill', 'currentColor');
    svg.append(p); return svg;
  }
  const inkCache = new Map();
  let ctx = null;
  function ink(ch, family) {
    const key = family + '|' + ch; let v = inkCache.get(key);
    if (!v) {
      ctx = ctx || document.createElement('canvas').getContext('2d');
      ctx.font = '100px ' + family; const m = ctx.measureText(ch);
      v = { x: m.actualBoundingBoxLeft, y: m.actualBoundingBoxAscent, w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight, h: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent };
      inkCache.set(key, v);
    }
    return v;
  }
  function glyph(ch, family, view) {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), t = document.createElementNS(NS, 'text');
    svg.setAttribute('viewBox', view.join(' ')); svg.setAttribute('aria-hidden', 'true');
    t.setAttribute('font-size', '100'); t.style.fontFamily = family; t.textContent = ch;
    svg.append(t); return svg;
  }

  function fill(w, F) {
    const s = el('span'); if (w <= 0.05) return s;
    const iW = wE('i', F), pW = wE('p', F), n = Math.floor(w / iW), m = Math.max(0, Math.ceil((w - n * iW) / pW - 1e-6));
    s.textContent = 'i'.repeat(n) + 'p'.repeat(m);
    s.style.marginRight = (w - n * iW - m * pW) + 'px';
    return s;
  }

  // ---------------------------------------------------------------- notes past the font's range
  // The font draws each note with its own piece of staff, reaching one ledger line above or below it.
  // A note further out is drawn from the bare sign (which stands on the middle line) over plain staff,
  // moved to its place, with ledger lines copied from the font's own: measured once from the glyphs.
  let geom = null;
  const dark = (d, i) => d[i * 4 + 3] > 110;
  function measureGeom() {
    const S = 100, H = 400, base = 250, cv = document.createElement('canvas'); cv.width = H; cv.height = H;
    const c = cv.getContext('2d', { willReadFrequently: true }); c.font = S + 'px "EMS Serenissima"';
    c.fillText('iiii', 0, base);
    const col = c.getImageData(Math.round(c.measureText('i').width * 1.5), 0, 1, H).data, bands = [];
    for (let y = 0; y < H; y++) if (dark(col, y)) { const b = bands[bands.length - 1]; if (b && y === b[1] + 1) b[1] = y; else bands.push([y, y]); }
    if (bands.length !== 5) return null;
    const mid = b => (b[0] + b[1] + 1) / 2 - base, step = (mid(bands[4]) - mid(bands[0])) / 8;
    const y = p => mid(bands[4]) - (p - 3) * step;   // position -> height above (-) the baseline; the bottom line is 3
    const m = c.measureText('3'), ref = Math.round(3 + (y(3) - (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2) / step);
    // the staff in a line 1em high: its top line below the top of the line, and its height (in em)
    const fa = m.fontBoundingBoxAscent, fd = m.fontBoundingBoxDescent;
    const lines = { top: ((S - fa - fd) / 2 + fa + y(11)) / S, h: 8 * step / S, base: ((S - fa - fd) / 2 + fa) / S };
    return { S, H, c, base, step, y, ref, lines, ledgers: new Map() };
  }
  // the font's ledger line for sign v, from v on position 1 (line through the head): left, width, thickness
  function ledgerOf(v) {
    if (geom.ledgers.has(v)) return geom.ledgers.get(v) || ledgerOf('3');
    const { S, H, c, base } = geom, yl = Math.round(base + geom.y(1));
    c.clearRect(0, 0, H, H); c.fillText(v + 's', 0, base);
    const row = c.getImageData(0, yl, H, 1).data; let x0 = -1, x1 = -1;
    for (let x = 0; x < H; x++) if (dark(row, x)) { if (x0 < 0) x0 = x; x1 = x; }
    let L = null;
    if (x0 >= 0) {
      const col = c.getImageData(x0 + 1, 0, 1, H).data; let t = 0;
      for (let y = yl - 10; y <= yl + 10; y++) if (dark(col, y)) t++;
      L = { x: x0 / S, w: (x1 - x0 + 1) / S, t: Math.max(1, t) / S };
    }
    geom.ledgers.set(v, L);
    return L || ledgerOf('3');
  }
  // tk: { lp: position, v: sign, a: accidental, d: dots/fermata }, with the widths of its parts in the font
  function farNote(tk, aW, gW, F) {
    const p = tk.lp, k = F / geom.S, g = el('span');
    const raw = (ch, w) => { const r = el('span', 'sp-raw', ch); r.style.top = (geom.ref - p) * geom.step * k + 'px'; g.append(r, fill(w, F)); };
    if (tk.a) raw(tk.a[0], aW);
    const L = ledgerOf(tk.v), down = p < 0;
    for (let q = down ? 1 : 13; down ? q >= p : q <= p; q += down ? -2 : 2) {
      const z = el('span', 'sp-ledger'), line = el('b');
      line.style.cssText = `left:${L.x * F}px;width:${L.w * F}px;border-top-width:${L.t * F}px;top:${geom.y(q) * k - L.t * F / 2}px`;
      z.append(line); g.append(z);
    }
    raw(tk.v, gW);
    for (const part of (tk.d || '').match(/\.[^.*]|\*/g) || []) { if (part === '*') g.append('*'); else raw('.', wE(part, F)); }
    return g;
  }

  // ---------------------------------------------------------------- render
  // D: { title, composer, imprint (for the title page),
  //      pieces: [{ title, composer, parts: [{label, clef, sig, tokens, cuts, side}], sections: [{step, name, movement, mode}] }] }
  //      (side: 'verso' or 'recto' in a choirbook; mode: 'run', 'line' or 'page', where a section starts)
  // o: { format, staffSize, initials: {first: {style, lines}, other: {style, lines}, src, red, voice (choirbooks: see dress)},
  //      partbookPage: [w,h], choirbookPage: [w,h], numbering: 'arabic'|'roman'|'none', titlePage, index,
  //      pieceStart: 'line'|'page' (partbooks), labels: { first, rest } (voice names where a piece begins, and after),
  //      margins: { top, bottom, inside, outside } in inches, ruleEmpty (draw the staves the music leaves empty),
  //      textType: 'roman'|'gothic', signum: 'fleur'|'hand'|'hedera'|'none' (choirbooks: where a voice runs on),
  //      style: 'print'|'manuscript' (choirbooks: a manuscript has "Residuum" where a voice goes on),
  //      noteSpacing: 'closest'|'close'|'moderate'|'printed'|'wide' (see SPACINGS; close is the manuscripts', printed the books'),
  //      spacing: 'print'|'manuscript'|'modern' (choirbooks: staff size and spacing after the period books, or roomier) }
  // In a choirbook the voice at the top of the left page gets the first initial; in partbooks every voice
  // does. Sections that start a new line or page get the other initials.
  async function render(book, D, o) {
    const I = o.initials, warnings = [], labels = o.labels || { first: true, rest: true };
    gothic = o.textType === 'gothic';
    sp = SPACINGS[o.noteSpacing] || SPACINGS.printed;
    const period = o.format === 'choirbook' && o.spacing !== 'modern';
    ({ TEXT, SYS, TEXT_TOP } = SPACING[period ? 'period' : 'modern']);
    const families = new Set(['"EMS Serenissima"', '"EB Garamond"', 'italic "EB Garamond"', '"IM Fell French Canon"']);
    if (gothic) families.add('"Rotunda Pommerania"');
    // (and the alphabet that stands in for a letter one lacks)
    // (and the alphabets that stand in for letters one lacks)
    const outlines = new Set();
    for (const spec of [I.first, I.other]) for (let f = INITIAL_FONTS[spec.style]; f; f = INITIAL_FONTS[f.fallback]) {
      if (f.family) f.family.split(', ').forEach(x => families.add(x));
      if (f.outlines) outlines.add(f.outlines);
    }
    await Promise.all([...outlines].map(loadOutlines));
    // fonts only start loading when used, so ask for them before measuring anything
    // (with the capitals: a font in parts, by unicode-range, loads only the parts its text needs)
    try { await Promise.all([...families].map(f => document.fonts.load(f.replace(/^(italic )?/, '$140px '), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'))); } catch (e) { }
    await document.fonts.ready;
    if (!document.fonts.check('20px "EMS Serenissima"')) throw new Error('The EMS Serenissima music font couldn’t be loaded. Check your connection and reload the page.');
    geom = geom || measureGeom();
    meas = el('div'); meas.style.cssText = 'position:absolute;left:-20000px;top:0;visibility:hidden;white-space:pre';
    book.dataset.type = meas.dataset.type = gothic ? 'gothic' : 'roman';
    document.body.appendChild(meas);
    D = JSON.parse(JSON.stringify(D));   // text preparation edits the tokens
    // roman numerals after the first word of a voice's, section's or piece's name are set in lower case, as
    // the books set them (Bassus ii, Agnus Dei ii), and so are page and folio numbers
    for (const pc of D.pieces) {
      pc.title = lowNumerals(pc.title);
      pc.parts.forEach(p => p.label = lowNumerals(p.label));
      (pc.sections || []).forEach(s => s.name = lowNumerals(s.name));
    }
    if (gothic) {
      D.title = gothicText(D.title); D.composer = gothicText(D.composer); D.imprint = gothicText(D.imprint);
      if (D.colophon) D.colophon.text = gothicText(D.colophon.text);
      for (const pc of D.pieces) {
        pc.title = gothicText(pc.title); pc.composer = gothicText(pc.composer);
        pc.parts.forEach(p => p.label = gothicLabel(p.label));
        (pc.sections || []).forEach(s => s.name = gothicText(s.name));
      }
    }
    // a voice (or a section of it) gets its text ready and its initial
    // (in a choirbook, the voices below the first may begin with their name's letter, as in the Alamire workshop's
    // books: the T of Tenor, the rest of the name beside it, the text's first word written whole)
    const voiceSpec = I.voice ? { ...I.other, voice: true } : I.other;
    function dress(p, spec) {
      let style = spec.style === 'image' && !I.src ? 'capital' : spec.style;
      const named = spec.voice && !['none', 'image'].includes(style) && /^\p{L}/u.test(p.label || '');
      prepareText(p, named ? 'none' : style);
      if (named) p.initialLetter = p.label.charAt(0).toUpperCase().replace(/U/g, 'V').replace(/J/g, 'I');
      // a letter the alphabet lacks comes from the one that stands in for it (and that one's, if need be)
      for (let f = INITIAL_FONTS[style]; f && f.letters && !f.letters.includes(p.initialLetter); f = INITIAL_FONTS[style]) {
        const w = `${f.name} initials have no ${p.initialLetter}, so ${f.fallbackName} is used for it instead.`;
        if (!warnings.includes(w)) warnings.push(w);
        style = f.fallback;
      }
      p.init = { style, lines: spec.lines, red: I.red && (spec === I.other || spec === voiceSpec) };
      if (named) p.init.voice = p.label.slice(1);
      return p;
    }
    book.innerHTML = '';
    const pending = [];

    // after: the first note past these lines (on the next opening), for the custos at the end of the last
    function system(p, lines, li, F, width, indent, after) {
      const line = lines[li], last = li === lines.length - 1, pre = prefix(p, F);
      let nk = null, nlp;
      if (!last) outer: for (let j = li + 1; j < lines.length; j++) for (const b of lines[j]) if (b.tk.k) { nk = b.tk.k; nlp = b.tk.lp; break outer; }
      if (last && after) { nk = after.k; nlp = after.lp; }
      const used = pre.w + line.reduce((s, b) => s + b.w, 0), cW = nk ? wE('U' + nk, F) : 0;
      const per = last ? 0 : Math.max(0, width - used - cW) / line.length;
      // room for notes past the font's range: the staff moves down for high ones, the text for low ones
      const lps = geom ? line.map(b => b.tk.lp).concat(nlp).filter(p => p !== undefined) : [], stepF = geom ? geom.step / geom.S * F : 0;
      const above = Math.max(0, ...lps.map(p => p - 14)) * stepF, below = Math.max(0, ...lps.map(p => -p)) * stepF;
      // with the syllables close under the staff (period spacing), a note whose ink reaches them (a low note,
      // a stem down) moves the line's syllables down, as far as the room above the next staff allows
      let low = 0;
      if (period && geom) for (const s of line.filter(b => b.tk.t === 'n' && b.tk.lp === undefined).map(b => b.tk.g).concat(nk && nlp === undefined ? ['U' + nk] : [])) {
        const k = ink(s, '"EMS Serenissima"'); low = Math.max(low, geom.lines.base + (k.h - k.y) / 100);
      }
      const lift = Math.min(0.22 * F, Math.max(0, (low + 0.01 - TEXT_TOP) * F));
      const sys = el('div', 'sp-sys'); sys.style.cssText = `width:${width}px;height:${F * SYS + above + below}px;margin-left:${indent}px`;
      const staff = el('div', 'sp-staff sp-ems'); staff.style.fontSize = F + 'px'; staff.style.top = above + 'px';
      staff.append(el('span', null, p.clef), fill(pre.gap, F));
      if (p.sig) staff.append(el('span', null, p.sig), fill(pre.gap, F));
      const marks = [];
      for (const b of line) {
        if (b.L > 0.05) staff.append(fill(b.L, F));
        let g;
        if (b.tk.t === 'x') { g = fill(b.gW, F); g.classList.add('sp-ligf'); g.append(el('span', 'sp-lig', b.tk.g)); }   // ligature bracket: staff, with the bracket above it
        else if (b.tk.lp !== undefined && geom) g = farNote(b.tk, b.aW, b.gW, F);
        else g = el('span', null, (b.tk.a || '') + b.tk.g + (b.tk.d || ''));
        if (b.trim) g.style.margin = `0 ${-b.trim}px`;
        // a note to be played: its time and pitch (see app.js), and its voice
        if (b.tk.pb) { g.classList.add('sp-n'); g.dataset.pb = b.tk.pb.join(' '); g.dataset.v = b.tk.v || ''; }
        staff.append(g);
        staff.append(fill(b.R + per, F));
        if (b.tk.sd) marks.push([g, b]);
      }
      if (nk) staff.append(nlp !== undefined && geom ? farNote({ lp: nlp, v: 'U' }, 0, cW, F) : el('span', null, 'U' + nk));
      // on a ruled page the staff of a short last line runs on, empty, to the margin
      if (last && o.ruleEmpty) staff.append(fill(Math.max(0, width - used - cW - 0.5), F));
      sys.append(staff);
      pending.push({ sys, marks, F, drop: above + below + lift });
      return sys;
    }
    // size of a voice's initial: framed boxes are square, glyph initials as wide as their letter
    // (in a choirbook the staves are ruled at a fixed pitch, slot: { h, ann }, and an initial spans them)
    let slot = null;
    function initialDims(p, F) {
      const { style, lines } = p.init, f = INITIAL_FONTS[style];
      const h = slot ? lines * slot.h - slot.ann - slot.lift - 0.22 * F : lines * F * SYS - 0.22 * F;
      if (style === 'none') return null;
      if (!f) return { h, w: h };
      if (f.outlines) { const L = OUTLINES[f.outlines].letters[p.initialLetter]; return { h, w: h * L.box[2] / L.box[3], f, outline: L }; }
      const k = ink(p.initialLetter, f.family), top = f.framed ? k.y : ink('H', f.family).y, kh = f.framed ? k.h : top;
      return { h, w: h * k.w / kh, f, view: [-k.x, -top, k.w, kh] };
    }
    function initialBox(p, F) {
      const d = initialDims(p, F), { style, red } = p.init;
      const box = el('div', 'sp-initial' + (d.f ? ' sp-glyph' : '') + (style === 'blank' ? ' sp-blank' : '') + (red ? ' sp-red' : ''));
      box.style.width = d.w + 'px'; box.style.height = d.h + 'px';
      if (d.outline) { box.append(outline(OUTLINES[d.f.outlines], d.outline)); return box; }
      if (d.f) { box.append(glyph(p.initialLetter, d.f.family, d.view)); return box; }
      const inner = el('div', 'sp-in'); box.append(inner);
      if (style === 'image') { const img = el('img'); img.src = I.src; img.alt = ''; inner.append(img); }

      return box;
    }
    const initW = (p, F) => { const d = initialDims(p, F); return d ? d.w + 0.16 * F : 0; };
    const widthFn = (p, W, F) => { const iw = initW(p, F); return n => n < p.init.lines ? W - iw : W; };
    // ---- rows: what goes down a voice's column, one after another: a system of music, a piece's title
    // line, a section's name, or a "tacet" for a voice silent through a section
    const H = { title: 44, head: F => 0.42 * F, tacet: F => 0.62 * F, sys: F => F * SYS };
    function rowEl(r, F) {
      if (r.kind === 'title') { const t = el('div', 'sp-titleline'); t.append(el('span', 'sp-t', r.title), el('span', 'sp-c', r.composer || '')); return t; }
      const d = el('div', r.kind === 'tacet' ? 'sp-tacet' : 'sp-sechead', r.text);
      d.style.height = r.h + 'px'; d.style.fontSize = Math.max(11, 0.3 * F) + 'px'; d.style.lineHeight = r.h + 'px';
      return d;
    }
    // a staff ruled but left empty, as in a manuscript whose pages were ruled before the music was copied
    function ruled(W, F) {
      const sys = el('div', 'sp-sys sp-ruled'), st = el('div', 'sp-staff sp-ems');
      sys.style.cssText = `width:${W}px;height:${F * SYS}px`; st.style.fontSize = F + 'px';
      st.append(fill(W, F)); sys.append(st);
      return sys;
    }
    // the staff lines within a staff: top line and height, in px
    const staffLines = F => geom ? { top: geom.lines.top * F, h: geom.lines.h * F } : { top: 0.2 * F, h: 0.56 * F };
    // a "tacet" on a ruled page: the words in the middle of the staff, its lines running up to them on each side
    function ruledTacet(text, W, F) {
      const sys = el('div', 'sp-sys sp-tacetrule'), L = staffLines(F);
      sys.style.cssText = `width:${W}px;height:${F * SYS}px`;
      const side = () => { const s = el('div', 'sp-tside'), st = el('div', 'sp-staff sp-ems'); st.style.fontSize = F + 'px'; st.append(fill(W, F)); s.append(st); return s; };
      const t = el('div', 'sp-tacet', text);
      t.style.cssText = `margin-top:${L.top}px;height:${L.h}px;line-height:${L.h}px;font-size:${Math.max(11, 0.7 * L.h)}px;padding:0 ${0.25 * F}px`;
      sys.append(side(), t, side());
      return sys;
    }
    // the sign (signum congruentiae) at the end of a voice's last staff on one page and before its next
    // staff on the other, to show the singer where to go on: a fleur-de-lis, or one from the text fount
    const FLEUR = 'M50 0C61 16 66 38 57 60H43C34 38 39 16 50 0Z' +
      'M55 59C60 38 76 26 89 32C99 37 99 53 89 58C92 50 89 43 82 44C72 46 65 53 62 63Z' +
      'M45 59C40 38 24 26 11 32C1 37 1 53 11 58C8 50 11 43 18 44C28 46 35 53 38 63Z' +
      'M29 61H71Q73 64.5 71 68H29Q27 64.5 29 61Z' +
      'M44 68H56L54 81C53 88 47 88 46 81Z' +
      'M43 69C35 71 27 76 24 86C31 81 38 79 45 76Z M57 69C65 71 73 76 76 86C69 81 62 79 55 76Z';
    const SIGNS = { hand: '☞', hedera: '❦' };
    // its size at staff size F: { w, h } of the sign, and the room it takes in a line (sign and a gap), or null
    function signSize(F) {
      const kind = o.signum || 'fleur';
      if (kind === 'none') return null;
      const L = staffLines(F);
      let h = L.h * 1.15, w;
      if (kind === 'fleur') w = h * 100 / 89;
      else { const k = ink(SIGNS[kind], '"EB Garamond"'); if (kind === 'hand') h = L.h * 0.6; w = h * k.w / k.h; }
      return { w, h, room: w + 0.2 * F };
    }
    const signRoom = F => { const z = signSize(F); return z ? z.room : 0; };
    // in a manuscript choirbook the indent carries "Residuum" written down beside the staves, as in the books of
    // the Alamire workshop (in red if the initials are): the indent no wider than the word, close against the
    // staves, and the word drawn out down the staves beside it, as the scribes wrote it. Drawn from its letters' ink
    // (residInk, at 100 px: w its length, h its breadth), so it can be fitted exactly. As many staves are indented
    // as the word, at its natural length, needs.
    const manuscript = o.style === 'manuscript';
    const RESID = 'Residuum', residSize = F => 0.3 * F, residTop = F => period ? 0.22 * F : slot.ann;
    const RESID_PAD = 0.04, RESID_GAP = 0.1, RESID_FOOT = 0.12, RESID_DRAW = 1.45;   // in F; the most it is drawn out
    const residWord = () => gothic ? gothicText(RESID) : RESID;
    const residInk = () => ink(residWord(), gothic ? '"Rotunda Pommerania"' : '"EB Garamond"');
    const residLines = F => manuscript ? Math.max(1, Math.ceil((residTop(F) + residInk().w / 100 * residSize(F)) / slot.h - 0.05)) : 1;
    // a voice that goes on from the opening before starts its first staff here a little in, so its singer
    // finds at a glance where to pick up again (in a manuscript, by the width of "Residuum")
    const goesOn = F => manuscript ? (RESID_PAD + RESID_GAP) * F + residInk().h / 100 * residSize(F) : 0.6 * F;
    function signum(F) {
      const z = signSize(F);
      if (!z) return null;
      const kind = o.signum || 'fleur', L = staffLines(F), NS = 'http://www.w3.org/2000/svg', { w, h } = z;
      let svg;
      if (kind === 'fleur') {
        svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 100 89'); svg.setAttribute('aria-hidden', 'true');
        const p = document.createElementNS(NS, 'path'); p.setAttribute('d', FLEUR); svg.append(p);
      } else { const ch = SIGNS[kind], k = ink(ch, '"EB Garamond"'); svg = glyph(ch, '"EB Garamond"', [-k.x, -k.y, k.w, k.h]); }
      const box = el('div', 'sp-signum'); box.append(svg);
      box.style.cssText = `width:${w}px;height:${h}px`;
      // its place: centred on the staff lines, which are dy below the top of the slot
      return { box, w: z.room, at: (x, dy) => { box.style.left = x + 'px'; box.style.top = dy + L.top - (h - L.h) / 2 + 'px'; return box; } };
    }
    // rows down a block of the given height; a voice's systems are spaced out evenly to fill it, and
    // with o.ruleEmpty the room the music leaves at the foot is ruled with empty staves
    function block(rows, F, W, height) {
      const box = el('div', 'sp-systems'); box.style.height = height + 'px';
      const made = []; let wrap = null, wv = null, iw = 0;
      for (const r of rows) {
        if (r.kind !== 'sys') { wrap = null; box.append(rowEl(r, F)); continue; }
        if (!wrap || wv !== r.v || r.li === 0) {
          wrap = el('div', 'sp-piece'); box.append(wrap); wv = r.v; iw = 0;
          if (r.li === 0) { iw = initW(r.v, F); if (iw) wrap.append(initialBox(r.v, F)); }
        }
        const ind = r.li < r.v.init.lines ? iw : 0, s = system(r.v, r.lines, r.li, F, W - ind, ind, r.after);
        wrap.append(s); made.push(s);
      }
      const fixed = rows.filter(r => r.kind !== 'sys').reduce((s, r) => s + r.h, 0);
      let slack = height - fixed - made.reduce((s, m) => s + parseFloat(m.style.height), 0);
      if (o.ruleEmpty) for (let k = Math.floor(slack / (F * SYS + 0.2 * F)); k > 0; k--) {
        const s = ruled(W, F); box.append(s); made.push(s); slack -= F * SYS;
      }
      const count = made.length;
      const extra = count > 1 ? Math.max(0, Math.min(slack / (count - 1), 0.45 * F)) : 0;
      made.forEach((s, i) => { if (i < count - 1) s.style.marginBottom = extra + 'px'; });
      return box;
    }
    // A voice of a piece in spans: a new span where a section starts a new line or page (s.mode), each
    // with its own initial (a section that opens a movement gets the voice's first one). ok(step): the
    // voice may be divided there.
    function spans(pc, p, ok, spec) {
      const secs = pc.sections || [];
      // a chant verse, in its own clef, starts a new line, and so does the music after it
      const own = (s, n) => s.chant || (n && secs[n - 1].chant);
      const brk = secs.filter((s, n) => n && (s.mode === 'line' || s.mode === 'page' || own(s, n)) && p.cuts && p.cuts[s.step] !== undefined && ok(s.step));
      const starts = [{ at: 0, sec: secs.length && (brk.length || secs[0].chant) ? secs[0] : null, mode: 'piece' }, ...brk.map(s => ({ at: p.cuts[s.step], sec: s, mode: s.mode === 'page' ? 'page' : 'line' }))];
      // the voice's first initial goes where it first sings (after a chant it is silent in, say); a tacet has none
      let first = true;
      return starts.map((st, n) => {
        const end = n + 1 < starts.length ? starts[n + 1].at : p.tokens.length, ch = st.sec && st.sec.chant;
        const v = { label: p.label, clef: ch ? ch.clef : p.clef, sig: ch ? ch.sig : p.sig, tokens: p.tokens.slice(st.at, end), off: st.at, sec: st.sec, mode: st.mode };
        v.tacet = !v.tokens.some(t => t.t === 'n');
        // the same without an initial, its first word whole (in a choirbook, for a section after the first on a page)
        const plain = { ...v, tokens: v.tokens.map(t => ({ ...t })) };
        dress(v, v.tacet ? { style: 'none', lines: 0 } : first || (st.sec && st.sec.movement) ? spec : I.other);
        if (!v.tacet) first = false;
        v.plain = dress(plain, { style: 'none', lines: 0 });
        return v;
      });
    }
    const name = v => v.sec && v.sec.name ? v.sec.name : '';
    // "Pleni a 2 tacet" reads oddly: the number of voices goes
    const tacet = text => `${text.replace(/\s+a\s*\d+\s*$/i, '')} tacet`;
    const numeral = n => o.numbering === 'none' ? '' : o.numbering === 'roman' ? roman(n).toLowerCase() : String(n);
    // margins in px: top, bottom, inside (at the fold or binding) and outside, mirrored on left- and right-hand pages
    const MG = (() => { const m = o.margins || {}, v = k => (m[k] >= 0 ? m[k] : 0.6) * IN; return { t: v('top'), b: v('bottom'), i: v('inside'), o: v('outside') }; })();
    const page = (Win, Hin, side) => {
      const pg = el('div', 'sp-page'), l = side === 'verso' ? MG.o : MG.i, r = side === 'verso' ? MG.i : MG.o;
      pg.style.cssText = `width:${Win * IN}px;height:${Hin * IN}px;padding:${MG.t}px ${r}px ${MG.b}px ${l}px`;
      return pg;
    };
    const credit = () => { const c = el('div', 'sp-credit', CREDIT); c.style.bottom = Math.max(4, MG.b * 0.37) + 'px'; return c; };
    // title page, after the printed books: the voice (in partbooks), the title, the composer, the imprint;
    // added to the book, then its type made smaller until it all fits (on an octavo, say)
    function addTitlePage(Win, Hin, voice) {
      // a generous page: the chosen margins, but never less than 0.9 in (less on a small page)
      const least = Math.min(0.9 * IN, 0.12 * Math.min(Win, Hin) * IN);
      const pg = page(Win, Hin, 'recto'), w = x => Math.max(x, least) + 'px'; pg.classList.add('sp-tp');
      pg.style.padding = [MG.t, MG.o, MG.b, MG.i].map(w).join(' ');
      if (voice) pg.append(el('div', 'sp-tp-voice', voice));
      const mid = el('div', 'sp-tp-mid');
      mid.append(el('div', 'sp-tp-title', D.title || ''));
      if (D.composer) mid.append(el('div', 'sp-tp-comp', D.composer));
      mid.append(el('div', 'sp-tp-orn', '❧'));
      pg.append(mid, el('div', 'sp-tp-imprint', D.imprint || ''));
      book.append(pg);
      for (let s = 19; pg.scrollHeight > pg.clientHeight + 1 && s > 6; s -= 0.5) pg.style.fontSize = s - 0.5 + 'px';
    }
    // the index at the back: each piece and the page (or folio) where it starts
    function indexPage(Win, Hin, entries, voice) {
      const pg = page(Win, Hin, 'recto'); pg.classList.add('sp-ix');
      pg.append(el('div', 'sp-ix-head', (gothic ? 'Index' : 'INDEX') + (voice ? ` · ${voice}` : '')));
      const ol = el('div', 'sp-ix-list');
      for (const [t, n] of entries) { const r = el('div', 'sp-ix-row'); r.append(el('span', 'sp-ix-t', t), el('span', 'sp-ix-dots'), el('span', 'sp-ix-n', numeral(n))); ol.append(r); }
      pg.append(ol);
      return pg;
    }
    const where = [];   // for the sections list: [piece, step, opening or page]

    // the colophon, after the printed books (D.colophon: { finis, device, src, text }): "Finis", the printer's
    // device or an ornament, and the colophon's lines naming the place, the printer and the year
    const COLO_GAP = 18;
    function colophonEl() {
      // (its type a little larger than the words under the music, so it grows with a choirbook's staves)
      const c = D.colophon, box = el('div', 'sp-colo'); box.style.fontSize = Math.max(17, (staff || 0) * TEXT * 1.15) + 'px';
      if (c.finis) box.append(el('div', 'sp-colo-finis', gothic ? 'Finis.' : 'FINIS.'));
      if (c.device === 'image' && c.src) { const im = el('img', 'sp-colo-dev'); im.src = c.src; im.alt = ''; box.append(im); }
      else if (c.device === 'fleuron' || c.device === 'hedera') box.append(el('div', 'sp-colo-orn', c.device === 'fleuron' ? '❧' : '❦'));
      if (c.text && c.text.trim()) box.append(el('div', 'sp-colo-text', c.text.trim()));
      return box;
    }
    function colophonHeight(Win, Hin) {
      const pg = page(Win, Hin, 'recto'), c = colophonEl(); pg.append(c); book.append(pg);
      const h = c.offsetHeight; pg.remove(); return h;
    }
    // at the foot of a page that ends a book (the index), if what is on it leaves room; else on a page of its own
    function colophonAfter(pg, Win, Hin) {
      const c = colophonEl(); c.classList.add('sp-colo-foot'); c.style.bottom = MG.b + 'px'; pg.append(c);
      const content = [...pg.children].filter(x => x !== c && !x.classList.contains('sp-credit')).reduce((m, x) => Math.max(m, x.offsetTop + x.offsetHeight), 0);
      if (content + COLO_GAP <= c.offsetTop) return pg;
      c.remove(); return colophonPage(Win, Hin);
    }
    function colophonPage(Win, Hin) {
      const pg = page(Win, Hin, 'recto'); pg.classList.add('sp-colo-page'); pg.append(colophonEl()); book.append(pg); return pg;
    }

    let size, staff;
    if (o.format === 'choirbook') {
      // As in a ruled choirbook, every page has the same staves at the same places; the voices on a page
      // share them, a busier voice taking more, and the lowest voice of a full page may run on at the foot of
      // the facing page. The page is turned only where every singer has reached the same bar: the last bar
      // every voice can reach on the opening. Each piece, and each section set to, starts a new opening.
      const [Win, Hin] = o.choirbookPage, W = Win * IN - MG.i - MG.o;
      const usable = Hin * IN - MG.t - MG.b - 34 - 10 - 16;
      // the staves of a page at staff size F: n of them, h apart, each with a band above (ann) for names
      // (period spacing: no band of its own, the names going in the space above the staff lines)
      // lift: where an initial starts below the top of its staff's slot (under the voice's name, in period spacing)
      const slotOf = F => { const ann = period ? 0 : Math.max(16, 0.32 * F), n = Math.max(1, Math.floor(usable / (ann + F * SYS))); return { n, h: usable / n, ann, lift: period ? 0.2 * F : 0 }; };
      const segs = [];
      D.pieces.forEach((pc, pi) => {
        const verso = pc.parts.filter(p => p.side !== 'recto'), recto = pc.parts.filter(p => p.side === 'recto');
        const all = verso.concat(recto);
        const cutAt = st => all.every(p => p.cuts && p.cuts[st] !== undefined);
        // the voice at the top of the left page gets the first initial
        const sp = all.map((p, q) => spans(pc, p, cutAt, q === 0 ? I.first : voiceSpec));
        // the page may be turned at any bar every voice has reached, best where nothing runs across it (clean); at
        // another, a voice holding a note across it ends its line with that note, and the page is turned while it is held
        const loose = p => p.loose || p.cuts, turnAt = st => all.every(p => p.cuts && loose(p)[st] !== undefined);
        const bars = all.length ? Object.keys(loose(all[0]) || {}).map(Number).filter(turnAt).sort((a, b) => a - b) : [];
        const opens = [0, ...(pc.sections || []).filter((s, n) => n && s.mode === 'page' && cutAt(s.step)).map(s => s.step)];
        opens.forEach((st, n) => {
          const next = opens[n + 1], inside = bars.filter(b => b > st && (next === undefined || b < next));
          const bounds = all.map(p => [n ? p.cuts[st] : 0, ...inside.map(b => loose(p)[b]), next === undefined ? p.tokens.length : p.cuts[next]]);
          const clean = [true, ...inside.map(cutAt), true];
          segs.push({ pc, pi, all, verso, recto, sp, bounds, clean, steps: [st, ...inside], last: inside.length + 1, begins: n === 0 });
        });
      });
      // a voice from bound a to bound b of its segment: one row for each staff it takes. A section that
      // starts a new line starts a new staff (its name is not printed); a silent one takes a staff for its "tacet".
      // keep: if the voice runs on to the facing page, how many of its rows stay on its own page; the last of
      // them, and the first on the facing page, are set shorter, to leave room for the sign that shows where it goes on
      function rowsOf(g, q, a, b, F, keep) {
        const key = `${F}|${a}|${b}|${keep || 0}`, memo = g.memo = g.memo || new Map(), mk = q + '|' + key;
        if (memo.has(mk)) return memo.get(mk);
        slot = slotOf(F);
        const ta = g.bounds[q][a], tb = g.bounds[q][b], end = g.bounds[q][g.last], rows = [], room = keep ? signRoom(F) : 0;
        let sung = false;
        for (let v of g.sp[q]) {
          const vend = v.off + v.tokens.length;
          if (vend <= ta || v.off >= tb) continue;
          const from = Math.max(ta, v.off), to = Math.min(tb, vend), starts = from === v.off;
          if (v.tacet) { if (starts && name(v)) rows.push({ kind: 'tacet', text: tacet(name(v)) }); continue; }
          // only the first section a voice sings on the opening has an initial, to mark the voice's place on the page
          if (sung && starts) v = v.plain;
          sung = true;
          const t = starts && to === vend ? v : { ...v, tokens: v.tokens.slice(from - v.off, to - v.off), init: starts ? v.init : { ...v.init, style: 'none', lines: 0 } };
          const wf = widthFn(t, W, F), short = keep - 1 - rows.length, cont = starts ? 0 : goesOn(F), ind = cont ? residLines(F) : 0;
          const lines = breakLines(t, F, n => wf(n) - (room && (n === short || n === short + 1) ? room : 0) - (n < ind ? cont : 0));
          // the custos at the end of the opening points to the first note on the next
          const after = to === tb && tb < end ? g.sp[q].flatMap(x => x.tokens.slice(Math.max(0, tb - x.off))).find(x => x.k) : null;
          // resid: the staves beside "Residuum" (fewer than it wants where the voice has fewer lines: it is then written smaller)
          lines.forEach((l, li) => rows.push({ kind: 'sys', v: t, lines, li, after: li === lines.length - 1 ? after : null, cont: li < ind ? cont : 0, resid: !li && cont && manuscript ? Math.min(ind, lines.length) : 0 }));
        }
        memo.set(mk, rows);
        return rows;
      }
      // how bars a to b sit on an opening, or null if they don't fit: each page's voices in its staves,
      // the lowest voice of a full page running on at the foot of the facing page if there is room
      // where the voices of a page start, so each singer finds their part at its place on the page: of k voices
      // with music there, the j-th starts no higher than j/k of the way down (the staves above it left empty).
      // at: staff of each voice (by index in g.all); end: the staff after the last; last: the lowest voice
      // But never so low that the voices below it (and extra staves at the foot: a run-on from the facing page)
      // would fall off the page: then the voices close up, as tight as need be.
      function startsOf(g, list, rows, n, extra = 0) {
        const live = list.map(p => g.all.indexOf(p)).filter(q => rows[q].length), at = new Map();
        let i = 0, below = extra + live.reduce((s, q) => s + rows[q].length, 0);
        live.forEach((q, j) => { i = Math.max(i, Math.min(Math.ceil(j * n / live.length - 1e-9), n - below)); at.set(q, i); i += rows[q].length; below -= rows[q].length; });
        return { at, end: i, last: live[live.length - 1] };
      }
      function place(g, a, b, F) {
        const n = slotOf(F).n, rows = g.all.map((p, q) => rowsOf(g, q, a, b, F));
        const V = startsOf(g, g.verso, rows, n), R = startsOf(g, g.recto, rows, n);
        if (V.end <= n && R.end <= n) return { rows, move: null };
        if (V.end > n && R.end > n) return null;
        // the run-on below the facing page's lowest voice is not held to these places
        const [to, N, q] = V.end > n ? ['recto', V.end, V.last] : ['verso', R.end, R.last];
        const stay = rows[q].length - (N - n);
        // the voice keeps at least its first staff, and the staves beside its initial, on its own page
        const keep = Math.max(1, rows[q].filter(r => r.cont).length, ...rows[q].filter(r => r.kind === 'sys' && r.li === 0).map(r => r.v.init.lines || 1));
        if (stay < Math.min(keep, rows[q].length)) return null;
        // set again with room for the sign at the end of its last staff here, which may push a note on
        if (signRoom(F)) rows[q] = rowsOf(g, q, a, b, F, stay);
        const over = rows[q].length - stay;
        if (startsOf(g, to === 'recto' ? g.recto : g.verso, rows, n, over).end + over > n) return null;
        return { rows, move: { q, over, to } };
      }
      const fits = (g, a, b, F) => place(g, a, b, F) !== null;
      // the openings of a segment: [first bound, bound after the last], as many bars as fit
      function openingsOf(g, F) {
        const out = []; let a = 0;
        while (a < g.last) {
          let b = g.last;
          if (!fits(g, a, b, F)) {
            let lo = a + 2, hi = g.last - 1; b = a + 1;
            while (lo <= hi) { const mid = (lo + hi) >> 1; if (fits(g, a, mid, F)) { b = mid; lo = mid + 1; } else hi = mid - 1; }
            // turned rather at a clean bar, if one fits that leaves no more than a third of the opening's bars over
            if (!g.clean[b]) for (let c = b - 1; c > a && c - a >= (b - a) * 2 / 3; c--) if (g.clean[c] && fits(g, a, c, F)) { b = c; break; }
          }
          out.push([a, b]); a = b;
        }
        return out;
      }
      // automatic: a choirbook is sung from by a whole choir gathered round it. With period spacing the staff
      // is as high, for the page's height, as in the books: 4.4% in Moderne's print of Morales's masses (Lyon
      // 1546, after Dorico's Rome 1544: 42 cm, staff 18.6 mm), 4.1% in the Alamire workshop's manuscripts
      // (Montserrat 773: 56.5 cm, 23 mm; Royal 8 G. vii: 37 cm, 15 mm). That is about 18 mm on 11 × 17 in.
      // With modern spacing, the largest staff with each piece (or each part set to start a new opening) on
      // one opening, but at least about 12 mm on 11 × 17 in (in proportion on a smaller page, never less than
      // a partbook's); a part too long for that runs on to more openings rather than shrinking the whole book.
      const RULED = { print: 0.0443, manuscript: 0.0407 };
      const COMFORT = Math.max(PARTBOOK, Math.round(FMAX * Hin / 17)), whole = F => segs.every(g => fits(g, 0, g.last, F));
      let F = o.staffSize;
      if (!(F > 0) && period) F = Math.round(RULED[o.spacing === 'manuscript' ? 'manuscript' : 'print'] * Hin * IN / (geom ? geom.lines.h : 0.45) * 2) / 2;
      else if (!(F > 0)) {
        F = COMFORT;
        for (let f = FMAX; f > COMFORT; f -= 2) if (whole(f)) { F = f; while (F + 0.5 < f + 2 && F + 0.5 <= FMAX && whole(F + 0.5)) F += 0.5; break; }
      }
      staff = F;
      const S = slotOf(F);
      slot = S;
      const openings = [], starts = [];
      for (const g of segs) {
        const chunks = openingsOf(g, F), base = openings.length;
        if (!starts[g.pi]) starts[g.pi] = base + 1;
        chunks.forEach(([a, b], ci) => {
          let pl = place(g, a, b, F);
          if (!pl) {
            // a single bar too long for an opening: set it anyway, overfull
            if (!warnings.some(w => w.includes('single bar'))) warnings.push(`${g.pc.title || 'The music'}: a single bar is too long to fit on one opening at this staff size. Choose a smaller staff size.`);
            pl = { rows: g.all.map((p, q) => rowsOf(g, q, a, b, F)), move: null };
          }
          openings.push({ g, ci, ...pl });
        });
        const at = j => base + chunks.findIndex(([a, b]) => j >= a && j < b) + 1;
        for (const s of g.pc.sections || []) { const j = g.steps.indexOf(s.step); if (j >= 0) where.push([g.pi, s.step, at(j)]); }
      }
      // one staff of a page: the band above it (the voice name, on the left), then
      // the music or a "tacet"; an initial hangs from the first staff over the ones beside it
      // mark: 'end' where a voice breaks off to run on at the foot of the facing page, 'start' where it goes on
      function staffEl(r, top, left, F, mark) {
        const box = el('div', 'sp-slot'); box.style.top = top + 'px'; box.style.height = S.h + 'px';
        const band = el('div', 'sp-band'); band.style.height = S.ann + 'px'; band.style.fontSize = Math.max(11, 0.26 * F) + 'px';
        if (period) band.style.cssText = `position:absolute;left:0;right:0;top:0;height:${0.21 * F}px;font-size:${Math.max(11, 0.15 * F)}px;z-index:1`;
        band.append(el('span', 'sp-band-l', left || ''));
        box.append(band);
        const sg = mark ? signum(F) : null, sw = sg ? sg.w : 0, at = mark === 'start' ? sw : 0;
        if (r.kind === 'tacet') {
          let t;
          if (o.ruleEmpty) t = ruledTacet(r.text, W - sw, F);
          else { t = el('div', 'sp-tacet', r.text); t.style.cssText = `width:${W - sw}px;height:${F * SYS}px;line-height:${F * SYS}px;font-size:${Math.max(11, 0.3 * F)}px`; }
          t.style.marginLeft = at + 'px'; box.append(t);
          if (sg) box.append(sg.at(mark === 'start' ? 0 : W - sw + 0.2 * F, S.ann));
          return box;
        }
        const iw = r.v.init.lines && r.li < r.v.init.lines ? initW(r.v, F) : 0;
        // an initial that is the voice name's first letter: the rest of the name beside its top, in place of the name
        const named = iw && r.li === 0 && r.v.init.voice !== undefined;
        if (named) { const l = band.firstChild; l.textContent = r.v.init.voice; l.style.paddingLeft = at + iw + 'px'; if (r.v.init.red) l.classList.add('sp-red'); }
        if (iw && r.li === 0) { const ib = initialBox(r.v, F); ib.style.top = S.ann + (named ? 0 : S.lift) + 'px'; ib.style.left = at + 'px'; box.append(ib); }
        if (r.resid) {
          // down the staves beside it (less a little at the foot): drawn out to fill them, up to a point, or, beside
          // fewer staves than it wants, made smaller to fit. Turned to read downwards, the tops of its letters to the staff.
          const k = residInk(), room = r.resid * S.h - residTop(F) - RESID_FOOT * F, len = k.w / 100 * residSize(F);
          const z = Math.min(residSize(F), residSize(F) * room / len), u = z / 100, s = Math.min(RESID_DRAW, Math.max(1, room / len));
          const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), t = document.createElementNS(NS, 'text');
          svg.setAttribute('viewBox', [k.y - k.h, -s * k.x, k.h, s * k.w].join(' ')); svg.setAttribute('aria-label', RESID);
          svg.style.cssText = `display:block;width:${k.h * u}px;height:${s * k.w * u}px;overflow:visible`;
          t.setAttribute('font-size', '100'); t.setAttribute('fill', 'currentColor'); t.setAttribute('transform', `rotate(90) scale(${s} 1)`);
          t.style.fontFamily = gothic ? '"Rotunda Pommerania"' : '"EB Garamond"'; t.textContent = residWord();
          svg.append(t);
          const rd = el('div', 'sp-residuum' + (o.initials && o.initials.red ? ' sp-red' : ''));
          rd.style.cssText = `top:${residTop(F)}px;left:${at + RESID_PAD * F}px`;
          rd.append(svg); box.append(rd);
        }
        const s = system(r.v, r.lines, r.li, F, W - iw - sw - (r.cont || 0), iw + at + (r.cont || 0), r.after);
        box.append(s);
        if (sg) box.append(sg.at(mark === 'start' ? 0 : W - sw + 0.2 * F, S.ann + parseFloat(s.firstChild.style.top)));
        return box;
      }
      function emptyStaff(top, F) {
        const box = el('div', 'sp-slot');
        box.style.top = top + S.ann + 'px'; box.style.height = S.h - S.ann + 'px';
        box.append(ruled(W, F));
        return box;
      }
      // folios: the right-hand page of each opening is numbered; with a title page that is folio 1
      const folio = n => n + (o.titlePage ? 1 : 0);
      if (o.titlePage) addTitlePage(Win, Hin);
      openings.forEach((op, n) => {
        const { g, ci, rows, move } = op, spread = el('div', 'sp-spread');
        const shown = !ci && g.begins ? labels.first : labels.rest;
        for (const [side, list] of [['verso', g.verso], ['recto', g.recto]]) {
          const pg = page(Win, Hin, side), head = el('div', 'sp-runhead ' + side, side === 'verso' ? g.pc.title : (g.pc.composer || ''));
          if (side === 'recto' && numeral(folio(n + 1))) head.append(el('span', 'sp-num', numeral(folio(n + 1))));
          const area = el('div', 'sp-staves'); area.style.height = usable + 'px';
          let i = 0;
          // mark: a sign at the end of the last of these staves (the voice goes on elsewhere) or before the first
          const put = (rs, label, always, mark) => rs.forEach((r, k) => area.append(staffEl(r, (i++) * S.h, !k && (always || shown) ? label : '', F,
            mark === 'end' && k === rs.length - 1 ? 'end' : mark === 'start' && !k ? 'start' : null)));
          // each voice at its place on the page, the staves left above it empty (ruled, if chosen)
          const { at } = startsOf(g, list, rows, S.n, move && move.to === side ? move.over : 0);
          for (const p of list) {
            const q = g.all.indexOf(p), moved = move && move.q === q;
            if (!at.has(q)) continue;
            for (; i < at.get(q); i++) if (o.ruleEmpty) area.append(emptyStaff(i * S.h, F));
            put(moved ? rows[q].slice(0, rows[q].length - move.over) : rows[q], p.label, false, moved ? 'end' : null);
          }
          // the lowest voice of the facing page, running on below this page's lowest part
          if (move && move.to === side) put(rows[move.q].slice(rows[move.q].length - move.over), g.all[move.q].label, true, 'start');
          // as in a manuscript choirbook, whose pages were ruled before they were copied, the staves the
          // music leaves empty are drawn all the same (a printed book simply leaves the space)
          if (o.ruleEmpty) while (i < S.n) area.append(emptyStaff((i++) * S.h, F));
          pg.append(head, area);
          spread.append(pg);
        }
        book.append(spread);
      });
      slot = null;
      if (o.index && D.pieces.length > 1) {
        const ix = indexPage(Win, Hin, D.pieces.map((pc, i) => [pc.title, folio(starts[i] || 1)])); book.append(ix);
        if (D.colophon) colophonAfter(ix, Win, Hin);
      } else if (D.colophon) colophonPage(Win, Hin);   // (not over the ruled staves of the last opening)
      const pages = book.querySelectorAll('.sp-page');
      if (pages.length) pages[pages.length - 1].append(credit());
      size = [Win, Hin];
    } else {
      // Partbooks: a book for each voice, in the order the voices first appear, holding that voice of
      // every piece that has it. The music runs on from page to page at a size comfortable to sing from.
      const [Win, Hin] = o.partbookPage, W = Win * IN - MG.i - MG.o, avail = Hin * IN - MG.t - MG.b - 34 - 16;
      // automatic: comfortable to sing from, but smaller on a small page (an octavo), for about five lines
      const F = o.staffSize > 0 ? o.staffSize : Math.max(36, Math.min(PARTBOOK, Math.floor(2 * avail / (5 * SYS)) / 2)); staff = F;
      const voices = [];
      D.pieces.forEach(pc => pc.parts.forEach(p => { if (!voices.includes(p.label)) voices.push(p.label); }));
      for (const label of voices) {
        const rows = [];
        D.pieces.forEach((pc, pi) => {
          const p = pc.parts.find(x => x.label === label); if (!p) return;
          if (rows.length) rows.push({ kind: 'break', page: o.pieceStart === 'page' });
          rows.push({ kind: 'title', title: pc.title, composer: pc.composer, h: H.title, mark: [pi, 0] });
          for (const v of spans(pc, p, () => true, I.first)) {
            if (v.mode === 'page') rows.push({ kind: 'break', page: true });
            if (name(v) && !v.tacet)
              rows.push({ kind: 'head', text: name(v), h: H.head(F), mark: v.sec ? [pi, v.sec.step] : null });
            if (v.tacet) { rows.push({ kind: 'tacet', text: tacet(name(v) || pc.title), h: H.tacet(F), mark: v.sec ? [pi, v.sec.step] : null }); continue; }
            const lines = breakLines(v, F, widthFn(v, W, F));
            lines.forEach((l, li) => rows.push({ kind: 'sys', v, lines, li, h: H.sys(F) }));
          }
        });
        // pages: a heading stays with what follows it, and an initial with the lines beside it
        const pages = []; let cur = null;
        const newPage = () => { cur = { rows: [], used: 0 }; pages.push(cur); };
        rows.forEach((r, i) => {
          if (r.kind === 'break') { if (r.page && cur && cur.rows.length) newPage(); return; }
          let need = r.h, j = i;
          while ((rows[j].kind === 'title' || rows[j].kind === 'head') && rows[j + 1] && rows[j + 1].kind !== 'break') need += rows[++j].h;
          if (rows[j].kind === 'sys' && rows[j].li === 0) for (let m = 1; m < Math.min(rows[j].v.init.lines, rows[j].lines.length); m++) need += rows[j + m].h;
          if (!cur || (cur.rows.length && cur.used + need > avail + 0.5)) newPage();
          cur.rows.push(r); cur.used += r.h;
          if (r.mark && label === voices.find(x => D.pieces[r.mark[0]].parts.some(p => p.label === x))) where.push([r.mark[0], r.mark[1], pages.length]);
        });
        if (o.titlePage) addTitlePage(Win, Hin, label);
        let last = null, placed = false;
        const ix = o.index && D.pieces.length > 1, colo = D.colophon ? colophonHeight(Win, Hin) : 0;
        pages.forEach((pgr, n) => {
          const begins = pgr.rows.some(r => r.kind === 'title'), shown = begins ? labels.first : labels.rest;
          const pg = page(Win, Hin, (n + 1) % 2 ? 'recto' : 'verso'), head = el('div', 'sp-head', shown ? label : ''), num = numeral(n + 1);
          // page numbers in the outer corner: right on a right-hand (odd) page, left on a left-hand one
          if (num) head.append(el('span', 'sp-num ' + ((n + 1) % 2 ? 'r' : 'l'), num));
          // with no index to follow, the colophon at the foot of the last page if the music leaves room (its
          // staves then end above it)
          const foot = colo && !ix && n === pages.length - 1 && avail - pgr.used >= colo + COLO_GAP;
          pg.append(head, block(pgr.rows, F, W, foot ? avail - colo - COLO_GAP : avail));
          if (foot) { const c = colophonEl(); c.style.marginTop = COLO_GAP + 'px'; pg.append(c); }
          book.append(pg); last = pg; placed = placed || foot;
        });
        if (ix) {
          const entries = [];
          pages.forEach((pgr, n) => pgr.rows.forEach(r => { if (r.kind === 'title') entries.push([r.title, n + 1]); }));
          book.append(last = indexPage(Win, Hin, entries, label));
          if (colo) { last = colophonAfter(last, Win, Hin); placed = true; }
        }
        if (colo && !placed) last = colophonPage(Win, Hin);
        if (last) last.append(credit());
      }
      size = [Win, Hin];
    }

    // syllables are placed from the real positions of the notes
    for (const { sys, marks, F, drop } of pending) {
      const left = sys.getBoundingClientRect().left;
      for (const [g, b] of marks) {
        const s = el('span', 'sp-syl', b.tk.sd);
        s.style.fontSize = F * TEXT + 'px'; s.style.top = F * TEXT_TOP + drop + 'px';
        s.style.left = (g.getBoundingClientRect().left - left + b.aW + b.gW / 2) + 'px';   // (a trimmed note's box is still its whole piece)
        sys.append(s);
      }
    }
    meas.remove();
    return { pageSize: size, staffSize: staff, where, warnings };
  }

  global.SPLayout = { render, CREDIT };
})(window);
