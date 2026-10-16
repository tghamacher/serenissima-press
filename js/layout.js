// Lays out converted parts as partbook or choirbook pages, with text underlay.
// Everything is measured from the fonts, so it must run after they have loaded.
(function (global) {
  'use strict';

  const IN = 96;                 // CSS px per inch
  const TEXT = 0.27;             // syllable size, as a proportion of the staff font size F
  const GAP = 0.06;              // minimum staff between signs
  const SYS = 1.30;              // height of one system (staff + text)
  const TEXT_TOP = 0.89;         // top of the syllables
  const FMAX = 100;
  const PARTBOOK = 56;           // a partbook's staff, with its syllables about 11 pt
  const CREDIT = 'Music font: EMS Serenissima by Elam Rotem, Early Music Sources (CC BY 4.0) · Set with Serenissima Press';

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const cache = new Map();
  let meas = null;
  function unit(str, cls) {
    const key = cls + '|' + str; let v = cache.get(key);
    if (v === undefined) {
      const s = el('span', cls, str); s.style.fontSize = '100px'; meas.appendChild(s);
      v = s.getBoundingClientRect().width / 100; s.remove(); cache.set(key, v);
    }
    return v;
  }
  const roman = n => { let s = ''; for (const [v, r] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= v) { s += r; n -= v; } return s; };
  const wE = (s, F) => s ? unit(s, 'sp-ems') * F : 0;
  const wT = (s, T) => s ? unit(s, 'sp-text') * T : 0;

  // the decorated initial takes the first letter; the rest of the first word goes in capitals
  function prepareText(p, mode, fallback) {
    const caps = s => s.toUpperCase().replace(/U/g, 'V').replace(/J/g, 'I');
    const toks = p.tokens, first = toks.findIndex(t => t.s);
    p.initialLetter = '';
    if (first >= 0) {
      const word = [];
      for (let i = first; i < toks.length; i++) { if (!toks[i].s) continue; word.push(toks[i]); if (toks[i].y === 'single' || toks[i].y === 'end') break; }
      p.initialLetter = caps(word[0].s.charAt(0));
      if (mode !== 'none') word[0].s = word[0].s.slice(1);
      word.forEach(t => t.s = caps(t.s));
    }
    toks.forEach(t => { if (t.s) t.sd = t.s + (t.y === 'begin' || t.y === 'middle' ? '-' : ''); });
    if (!p.initialLetter) p.initialLetter = fallback || p.label.charAt(0);
  }

  // token boxes: [staff L][sign][staff R], wide enough for the syllable centred under the note head
  function boxes(p, F) {
    const T = F * TEXT, gap = GAP * F, tg = 0.5 * T;
    return p.tokens.map(tk => {
      const aW = wE(tk.a, F), gW = wE(tk.g, F), dW = wE(tk.d, F), glyph = aW + gW + dW, center = aW + gW / 2;
      let L = 0, R = gap;
      if (tk.sd) { const half = (wT(tk.sd, T) + tg) / 2; L = Math.max(0, half - center); R = Math.max(gap, half - (glyph - center)); }
      if (tk.g === 'E') R = 0;
      return { tk, aW, gW, w: L + glyph + R, L, R };
    });
  }
  function prefix(p, F) { const gap = GAP * F * 1.5; return { gap, w: wE(p.clef, F) + gap + (p.sig ? wE(p.sig, F) + gap : 0) }; }
  function breakLines(p, F, widthFor) {
    const bx = boxes(p, F), pre = prefix(p, F), cW = wE('Ug', F) + GAP * F;
    const lines = []; let cur = [], used = 0;
    for (const b of bx) {
      const avail = widthFor(lines.length) - pre.w - cW;
      if (cur.length && b.tk.g !== 'E' && used + b.w > avail) {
        const carry = [];
        while (cur.length > 1 && cur[cur.length - 1].tk.t === 'm') carry.unshift(cur.pop());   // no sign stranded at a line end
        lines.push(cur); cur = carry; used = carry.reduce((s, c) => s + c.w, 0);
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
    woodcut: { family: '"EB Garamond Initials"', framed: true, letters: 'ADFGLNOQT', name: 'Woodcut' },
    gothic: { family: 'Yinit', framed: true },
    capital: { family: '"IM Fell French Canon"' }
  };
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
    return { S, H, c, base, step, y, ref, ledgers: new Map() };
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
  // o: { format, staffSize, initials: {first: {style, lines}, other: {style, lines}, src, red},
  //      partbookPage: [w,h], choirbookPage: [w,h], numbering: 'arabic'|'roman'|'none', titlePage, index,
  //      pieceStart: 'line'|'page' (partbooks), labels: { first, rest } (voice names where a piece begins, and after) }
  // In a choirbook the voice at the top of the left page gets the first initial; in partbooks every voice
  // does. Sections that start a new line or page get the other initials.
  async function render(book, D, o) {
    const I = o.initials, warnings = [], labels = o.labels || { first: true, rest: true };
    const families = new Set(['"EMS Serenissima"', '"EB Garamond"', '"IM Fell French Canon"']);
    for (const spec of [I.first, I.other]) { const f = INITIAL_FONTS[spec.style]; if (f) f.family.split(', ').forEach(x => families.add(x)); }
    // fonts only start loading when used, so ask for them before measuring anything
    try { await Promise.all([...families].map(f => document.fonts.load('40px ' + f))); } catch (e) { }
    await document.fonts.ready;
    if (!document.fonts.check('20px "EMS Serenissima"')) throw new Error('The EMS Serenissima music font could not be loaded.');
    geom = geom || measureGeom();
    meas = el('div'); meas.style.cssText = 'position:absolute;left:-20000px;top:0;visibility:hidden;white-space:pre';
    document.body.appendChild(meas);
    D = JSON.parse(JSON.stringify(D));   // text preparation edits the tokens
    // a voice (or a section of it) gets its text ready and its initial
    function dress(p, spec) {
      let style = spec.style === 'image' && !I.src ? 'letter' : spec.style;
      prepareText(p, style);
      const f = INITIAL_FONTS[style];
      if (f && f.letters && !f.letters.includes(p.initialLetter)) {
        const w = `${f.name} initials have no ${p.initialLetter}; it is set on a dotted ground instead.`;
        if (!warnings.includes(w)) warnings.push(w);
        style = 'letter';
      }
      p.init = { style, lines: spec.lines, red: I.red && spec === I.other };
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
        staff.append(g);
        staff.append(fill(b.R + per, F));
        if (b.tk.sd) marks.push([g, b]);
      }
      if (nk) staff.append(nlp !== undefined && geom ? farNote({ lp: nlp, v: 'U' }, 0, cW, F) : el('span', null, 'U' + nk));
      sys.append(staff);
      pending.push({ sys, marks, F, drop: above + below });
      return sys;
    }
    // size of a voice's initial: framed boxes are square, glyph initials as wide as their letter
    function initialDims(p, F) {
      const { style, lines } = p.init, h = lines * F * SYS - 0.22 * F, f = INITIAL_FONTS[style];
      if (style === 'none') return null;
      if (!f) return { h, w: h };
      const k = ink(p.initialLetter, f.family), top = f.framed ? k.y : ink('H', f.family).y, kh = f.framed ? k.h : top;
      return { h, w: h * k.w / kh, f, view: [-k.x, -top, k.w, kh] };
    }
    function initialBox(p, F) {
      const d = initialDims(p, F), { style, red } = p.init;
      const box = el('div', 'sp-initial' + (d.f ? ' sp-glyph' : '') + (style === 'blank' ? ' sp-blank' : '') + (red ? ' sp-red' : ''));
      box.style.width = d.w + 'px'; box.style.height = d.h + 'px';
      if (d.f) { box.append(glyph(p.initialLetter, d.f.family, d.view)); return box; }
      const inner = el('div', 'sp-in'); box.append(inner);
      if (style === 'image') { const img = el('img'); img.src = I.src; img.alt = ''; inner.append(img); }
      else if (style === 'letter') { const t = el('span', null, p.initialLetter); t.style.fontSize = d.h * 0.74 + 'px'; inner.append(t); }
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
    // rows down a block of the given height; a voice's systems are spaced out evenly to fill it
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
      const count = made.length, fixed = rows.filter(r => r.kind !== 'sys').reduce((s, r) => s + r.h, 0);
      const slack = height - fixed - made.reduce((s, m) => s + parseFloat(m.style.height), 0);
      const extra = count > 1 ? Math.max(0, Math.min(slack / (count - 1), 0.45 * F)) : 0;
      made.forEach((s, i) => { if (i < count - 1) s.style.marginBottom = extra + 'px'; });
      return box;
    }
    // A voice of a piece in spans: a new span where a section starts a new line or page (s.mode), each
    // with its own initial (a section that opens a movement gets the voice's first one). ok(step): the
    // voice may be divided there.
    function spans(pc, p, ok, spec) {
      const secs = pc.sections || [];
      const brk = secs.filter((s, n) => n && (s.mode === 'line' || s.mode === 'page') && p.cuts && p.cuts[s.step] !== undefined && ok(s.step));
      const starts = [{ at: 0, sec: brk.length ? secs[0] : null, mode: 'piece' }, ...brk.map(s => ({ at: p.cuts[s.step], sec: s, mode: s.mode }))];
      return starts.map((st, n) => {
        const end = n + 1 < starts.length ? starts[n + 1].at : p.tokens.length;
        const v = { label: p.label, clef: p.clef, sig: p.sig, tokens: p.tokens.slice(st.at, end), off: st.at, sec: st.sec, mode: st.mode };
        v.tacet = !v.tokens.some(t => t.t === 'n');
        return dress(v, st.mode === 'piece' || (st.sec && st.sec.movement) ? spec : I.other);
      });
    }
    const name = v => v.sec && v.sec.name ? v.sec.name : '';
    // "Pleni a 2 tacet" reads oddly: the number of voices goes
    const tacet = text => `${text.replace(/\s+a\s*\d+\s*$/i, '')} tacet`;
    const numeral = n => o.numbering === 'none' ? '' : o.numbering === 'roman' ? roman(n) : String(n);
    const page = (Win, Hin, M) => { const pg = el('div', 'sp-page'); pg.style.cssText = `width:${Win * IN}px;height:${Hin * IN}px;padding:${M}px`; return pg; };
    // title page, after the printed books: the voice (in partbooks), the title, the composer, the imprint
    function titlePage(Win, Hin, voice) {
      const pg = page(Win, Hin, 0.9 * IN); pg.classList.add('sp-tp');
      if (voice) pg.append(el('div', 'sp-tp-voice', voice));
      const mid = el('div', 'sp-tp-mid');
      mid.append(el('div', 'sp-tp-title', D.title || ''));
      if (D.composer) mid.append(el('div', 'sp-tp-comp', D.composer));
      mid.append(el('div', 'sp-tp-orn', '❧'));
      pg.append(mid, el('div', 'sp-tp-imprint', D.imprint || ''));
      return pg;
    }
    // the index at the back: each piece and the page (or folio) where it starts
    function indexPage(Win, Hin, M, entries, voice) {
      const pg = page(Win, Hin, M); pg.classList.add('sp-ix');
      pg.append(el('div', 'sp-ix-head', voice ? `INDEX · ${voice}` : 'INDEX'));
      const ol = el('div', 'sp-ix-list');
      for (const [t, n] of entries) { const r = el('div', 'sp-ix-row'); r.append(el('span', 'sp-ix-t', t), el('span', 'sp-ix-dots'), el('span', 'sp-ix-n', numeral(n))); ol.append(r); }
      pg.append(ol);
      return pg;
    }
    const where = [];   // for the sections list: [piece, step, opening or page]

    let size, staff;
    if (o.format === 'choirbook') {
      // The page is turned only where every singer has reached the same bar: the last bar every voice
      // reaches on the opening. Each piece, and each section the user sets to, starts a new opening.
      const [Win, Hin] = o.choirbookPage, M = 0.6 * IN, W = Win * IN - 2 * M;
      const segs = [];
      D.pieces.forEach((pc, pi) => {
        const verso = pc.parts.filter(p => p.side !== 'recto'), recto = pc.parts.filter(p => p.side === 'recto');
        const all = verso.concat(recto), k = Math.max(verso.length, recto.length, 1);
        const regionH = (Hin * IN - 2 * M - 34 - 10 - 16) / k, inner = regionH - 24 - 10;
        const cutAt = st => all.every(p => p.cuts && p.cuts[st] !== undefined);
        // the voice at the top of the left page gets the first initial
        const sp = all.map((p, q) => spans(pc, p, cutAt, q === 0 ? I.first : I.other));
        const bars = all.length ? Object.keys(all[0].cuts || {}).map(Number).filter(cutAt).sort((a, b) => a - b) : [];
        const opens = [0, ...(pc.sections || []).filter((s, n) => n && s.mode === 'page' && cutAt(s.step)).map(s => s.step)];
        opens.forEach((st, n) => {
          const next = opens[n + 1], inside = bars.filter(b => b > st && (next === undefined || b < next));
          const bounds = all.map(p => [n ? p.cuts[st] : 0, ...inside.map(b => p.cuts[b]), next === undefined ? p.tokens.length : p.cuts[next]]);
          const first = sp.map(list => list.find(v => v.off === bounds[0][0]) || list[0]);
          segs.push({ pc, pi, all, verso, recto, regionH, inner, sp, bounds, steps: [st, ...inside], last: inside.length + 1, head: first[0].sec, begins: n === 0 });
        });
      });
      // a voice from bound a to bound b of its segment, as rows
      function rowsOf(g, q, a, b, F) {
        const key = `${F}|${a}|${b}`, memo = g.memo = g.memo || new Map(), mk = q + '|' + key;
        if (memo.has(mk)) return memo.get(mk);
        const ta = g.bounds[q][a], tb = g.bounds[q][b], end = g.bounds[q][g.last], rows = [];
        for (const v of g.sp[q]) {
          const vend = v.off + v.tokens.length;
          if (vend <= ta || v.off >= tb) continue;
          const from = Math.max(ta, v.off), to = Math.min(tb, vend), starts = from === v.off;
          if (starts && v.mode === 'line' && name(v) && !v.tacet) rows.push({ kind: 'head', text: name(v), h: H.head(F) });
          if (v.tacet) { if (starts && name(v)) rows.push({ kind: 'tacet', text: tacet(name(v)), h: H.tacet(F) }); continue; }
          const t = starts && to === vend ? v : { ...v, tokens: v.tokens.slice(from - v.off, to - v.off), init: starts ? v.init : { ...v.init, style: 'none', lines: 0 } };
          const lines = breakLines(t, F, widthFn(t, W, F));
          // the custos at the end of the opening points to the first note on the next
          const after = to === tb && tb < end ? g.sp[q].flatMap(x => x.tokens.slice(Math.max(0, tb - x.off))).find(x => x.k) : null;
          lines.forEach((l, li) => rows.push({ kind: 'sys', v: t, lines, li, after: li === lines.length - 1 ? after : null, h: H.sys(F) }));
        }
        memo.set(mk, rows);
        return rows;
      }
      const height = rows => rows.reduce((s, r) => s + r.h, 0);
      const fits = (g, a, b, F) => g.all.every((p, q) => height(rowsOf(g, q, a, b, F)) <= g.inner + 0.5);
      // the openings of a segment: [first bound, bound after the last], as many bars as every voice has room for
      function openingsOf(g, F) {
        const out = []; let a = 0;
        while (a < g.last) {
          let b = g.last;
          if (!fits(g, a, b, F)) {
            let lo = a + 2, hi = g.last - 1; b = a + 1;
            while (lo <= hi) { const mid = (lo + hi) >> 1; if (fits(g, a, mid, F)) { b = mid; lo = mid + 1; } else hi = mid - 1; }
          }
          out.push([a, b]); a = b;
        }
        return out;
      }
      // automatic: the largest staff with each piece (or each part the user starts on a new opening) on
      // one opening, but no smaller than a choir can read from a lectern; below that, more openings
      const READABLE = 40, whole = F => segs.every(g => fits(g, 0, g.last, F));
      let F = o.staffSize;
      if (!(F > 0)) {
        F = READABLE;
        for (let f = FMAX; f >= READABLE; f -= 2) if (whole(f)) { F = f; while (F + 0.5 < f + 2 && F + 0.5 <= FMAX && whole(F + 0.5)) F += 0.5; break; }
      }
      staff = F;
      const openings = [], starts = [];
      for (const g of segs) {
        const chunks = openingsOf(g, F), base = openings.length;
        if (!starts[g.pi]) starts[g.pi] = base + 1;
        chunks.forEach(([a, b], ci) => {
          const rows = g.all.map((p, q) => rowsOf(g, q, a, b, F));
          if (rows.some(r => height(r) > g.inner + 0.5) && !warnings.some(w => w.includes('single bar')))
            warnings.push(`${g.pc.title || 'The music'}: a single bar is too long for one opening at this staff size. Choose a smaller staff.`);
          openings.push({ g, ci, rows });
        });
        const at = j => base + chunks.findIndex(([a, b]) => j >= a && j < b) + 1;
        for (const s of g.pc.sections || []) { const j = g.steps.indexOf(s.step); if (j >= 0) where.push([g.pi, s.step, at(j)]); }
      }
      // folios: the right-hand page of each opening is numbered; with a title page that is folio 1
      const folio = n => n + (o.titlePage ? 1 : 0);
      if (o.titlePage) book.append(titlePage(Win, Hin));
      openings.forEach((op, n) => {
        const { g, ci, rows } = op, spread = el('div', 'sp-spread');
        const sec = !ci && g.head ? g.head.name : '';
        for (const [side, list] of [['verso', g.verso], ['recto', g.recto]]) {
          const pg = page(Win, Hin, M), head = el('div', 'sp-runhead ' + side, side === 'verso' ? g.pc.title : (g.pc.composer || ''));
          if (side === 'recto' && numeral(folio(n + 1))) head.append(el('span', 'sp-num', numeral(folio(n + 1))));
          pg.append(head);
          for (const p of list) {
            const q = g.all.indexOf(p), reg = el('div', 'sp-region'); reg.style.height = g.regionH + 'px';
            if (rows[q].length) {
              // the voice's name, where the piece begins and on later openings, as chosen
              const shown = !ci && g.begins ? labels.first : labels.rest, lab = el('div', 'sp-label', shown ? p.label : '');
              if (sec) lab.append(el('span', 'sp-sec', sec));
              reg.append(lab, block(rows[q], F, W, g.inner));
            }
            pg.append(reg);
          }
          spread.append(pg);
        }
        book.append(spread);
      });
      if (o.index && D.pieces.length > 1) book.append(indexPage(Win, Hin, M, D.pieces.map((pc, i) => [pc.title, folio(starts[i] || 1)])));
      const pages = book.querySelectorAll('.sp-page');
      if (pages.length) pages[pages.length - 1].append(el('div', 'sp-credit', CREDIT));
      size = [Win, Hin];
    } else {
      // Partbooks: a book for each voice, in the order the voices first appear, holding that voice of
      // every piece that has it. The music runs on from page to page at a size comfortable to sing from.
      const [Win, Hin] = o.partbookPage, M = 0.6 * IN, W = Win * IN - 2 * M, avail = Hin * IN - 2 * M - 34 - 16;
      const F = o.staffSize > 0 ? o.staffSize : PARTBOOK; staff = F;
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
        if (o.titlePage) book.append(titlePage(Win, Hin, label));
        let last = null;
        pages.forEach((pgr, n) => {
          const begins = pgr.rows.some(r => r.kind === 'title'), shown = begins ? labels.first : labels.rest;
          const pg = page(Win, Hin, M), head = el('div', 'sp-head', shown ? label : ''), num = numeral(n + 1);
          // page numbers in the outer corner: right on a right-hand (odd) page, left on a left-hand one
          if (num) head.append(el('span', 'sp-num ' + ((n + 1) % 2 ? 'r' : 'l'), num));
          pg.append(head, block(pgr.rows, F, W, avail));
          book.append(pg); last = pg;
        });
        if (o.index && D.pieces.length > 1) {
          const entries = [];
          pages.forEach((pgr, n) => pgr.rows.forEach(r => { if (r.kind === 'title') entries.push([r.title, n + 1]); }));
          book.append(last = indexPage(Win, Hin, M, entries, label));
        }
        if (last) last.append(el('div', 'sp-credit', CREDIT));
      }
      size = [Win, Hin];
    }

    // syllables are placed from the real positions of the notes
    for (const { sys, marks, F, drop } of pending) {
      const left = sys.getBoundingClientRect().left;
      for (const [g, b] of marks) {
        const s = el('span', 'sp-syl', b.tk.sd);
        s.style.fontSize = F * TEXT + 'px'; s.style.top = F * TEXT_TOP + drop + 'px';
        s.style.left = (g.getBoundingClientRect().left - left + b.aW + b.gW / 2) + 'px';
        sys.append(s);
      }
    }
    meas.remove();
    return { pageSize: size, staffSize: staff, where, warnings };
  }

  global.SPLayout = { render, CREDIT };
})(window);
