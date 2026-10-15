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
    engraved: { family: '"Libertinus Serif Initials", "IM Fell French Canon"' },
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
  // D: { title, composer, parts: [{label, clef, sig, tokens}] }
  // o: { format, staffSize, initials: {first: {style, lines}, other: {style, lines}, src, red},
  //      partbookPage: [w,h], choirbookPage: [w,h], verso: [i], recto: [i] }
  // In a choirbook the voice at the top of the left page gets the first initial; in partbooks every voice does.
  async function render(book, D, o) {
    const I = o.initials, warnings = [];
    const lead = o.format === 'choirbook' ? (o.verso.length ? o.verso[0] : o.recto[0]) : null;
    const specFor = i => (lead === null || i === lead) ? I.first : I.other;
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
      p.init = { style, lines: spec.lines, red: I.red && spec === I.other && lead !== null };
      return p;
    }
    if (o.format !== 'choirbook') D.parts.forEach((p, i) => dress(p, specFor(i)));
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
    // pieces: [{ p, lines, from, to, initial, after }], one after another down the block (a choirbook
    // opening may hold several sections, each starting a new line with its initial)
    function systemsBlock(pieces, F, W, height) {
      const box = el('div', 'sp-systems'); box.style.height = height + 'px';
      const made = [];
      for (const { p, lines, from, to, initial, after } of pieces) {
        const wrap = el('div', 'sp-piece'); box.append(wrap);
        const iw = initial && from === 0 ? initW(p, F) : 0;
        if (iw) wrap.append(initialBox(p, F));
        for (let li = from; li < to; li++) {
          const ind = li < p.init.lines ? iw : 0, s = system(p, lines, li, F, W - ind, ind, after);
          wrap.append(s); made.push(s);
        }
      }
      const count = made.length, slack = height - made.reduce((s, m) => s + parseFloat(m.style.height), 0);
      const extra = count > 1 ? Math.max(0, Math.min(slack / (count - 1), 0.45 * F)) : 0;
      made.forEach((s, i) => { if (i < count - 1) s.style.marginBottom = extra + 'px'; });
      return box;
    }
    const page = (Win, Hin, M) => { const pg = el('div', 'sp-page'); pg.style.cssText = `width:${Win * IN}px;height:${Hin * IN}px;padding:${M}px`; return pg; };

    let size, staff, sections = [];
    if (o.format === 'choirbook') {
      // The page is turned only where every singer has reached the same bar: each section starts an
      // opening, and a section too long for one is turned at the last bar every voice reaches on it.
      const [Win, Hin] = o.choirbookPage, M = 0.6 * IN, W = Win * IN - 2 * M;
      const verso = o.verso.map(i => D.parts[i]).filter(Boolean), recto = o.recto.map(i => D.parts[i]).filter(Boolean);
      const k = Math.max(verso.length, recto.length, 1);
      const regionH = (Hin * IN - 2 * M - 34 - 10 - 16) / k, inner = regionH - 24 - 10;
      const cap = F => Math.max(1, Math.floor(inner / (F * SYS)));
      const all = verso.concat(recto);
      const cutAt = st => all.every(p => p.cuts && p.cuts[st] !== undefined);
      // sections (s.opening: must start an opening; the others share one when there is room)
      const secs = (D.sections || []).filter((s, n) => n && cutAt(s.step));
      secs.unshift({ step: 0, name: (D.sections || [])[0] ? D.sections[0].name : '', opening: true });
      const bars = all.length ? Object.keys(all[0].cuts || {}).map(Number).filter(cutAt).sort((a, b) => a - b) : [];
      // each section: its voices (with their initials) and the bars inside it where the page may turn
      const segs = secs.map((s, n) => {
        const next = secs[n + 1], start = p => n ? p.cuts[s.step] : 0, end = p => next ? p.cuts[next.step] : p.tokens.length;
        const inside = bars.filter(st => st > s.step && (!next || st < next.step));
        const views = all.map(p => {
          const v = { label: p.label, clef: p.clef, sig: p.sig, tokens: p.tokens.slice(start(p), end(p)) };
          dress(v, n === 0 || s.movement ? specFor(D.parts.indexOf(p)) : I.other);   // a movement opens like the book
          v.bounds = [0, ...inside.map(st => p.cuts[st] - start(p)), v.tokens.length];
          v.tacet = !v.tokens.some(t => t.t === 'n');
          return v;
        });
        return { s, views, last: inside.length + 1, hard: !!s.opening };
      });
      // a voice from bar a to bar b of its section; only the section's first opening has the initial
      function part(v, a, b, F) {
        const key = `${F}|${a}|${b}`; v.memo = v.memo || new Map();
        if (!v.memo.has(key)) {
          const t = { ...v, tokens: v.tokens.slice(v.bounds[a], v.bounds[b]) };
          if (a) t.init = { ...v.init, style: 'none', lines: 0 };
          v.memo.set(key, { t, lines: breakLines(t, F, widthFn(t, W, F)) });
        }
        return v.memo.get(key);
      }
      const fits = (g, a, b, F) => g.views.every(v => v.tacet || part(v, a, b, F).lines.length <= cap(F));
      // the openings of a section: [first bar, bar after the last], as many bars on each as every voice has room for
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
      // fit to page: the largest staff with every section on one opening, but no smaller than a choir can
      // read from a lectern; below that, long sections take more than one
      const READABLE = 40, whole = F => segs.every(g => fits(g, 0, g.last, F));
      let F = o.staffSize;
      if (!(F > 0)) {
        F = READABLE;
        for (let f = FMAX; f >= READABLE; f -= 2) if (whole(f)) { F = f; while (F + 0.5 < f + 2 && F + 0.5 <= FMAX && whole(F + 0.5)) F += 0.5; break; }
      }
      staff = F;
      // Fill the openings: a section goes on the current opening if every voice still has room for it,
      // else (or if it must start an opening, or needs more than one) the page is turned before it.
      const openings = [];
      for (const g of segs) {
        const chunks = openingsOf(g, F); let first = 0;
        chunks.forEach(([a, b], ci) => {
          const parts = g.views.map(v => v.tacet ? null : part(v, a, b, F));
          const lens = parts.map(x => x ? x.lines.length : 0);
          if (lens.some(n => n > cap(F)) && !warnings.some(w => w.includes('single bar')))
            warnings.push(`${g.s.name || 'A section'}: a single bar is too long for one opening at this staff size. Choose a smaller staff.`);
          let cur = openings[openings.length - 1];
          if (!cur || ci || g.hard || chunks.length > 1 || lens.some((n, q) => cur.used[q] + n > cap(F))) {
            cur = { used: all.map(() => 0), blocks: [] }; openings.push(cur);
          }
          // the first note on the next opening, for the custos at the end of a section cut in two
          const after = g.views.map(v => b < g.last ? v.tokens.slice(v.bounds[b]).find(t => t.k) : null);
          cur.blocks.push({ g, ci, parts, after });
          if (!ci) first = openings.length;
          lens.forEach((n, q) => cur.used[q] += n);
        });
        sections.push({ step: g.s.step, first, last: openings.length });
      }
      for (const op of openings) {
        const spread = el('div', 'sp-spread');
        // the names of the sections that begin on this opening, at the head of each voice
        const names = segs.length > 1 ? op.blocks.filter(bl => !bl.ci && bl.g.s.name).map(bl => bl.g.s.name).join(' · ') : '';
        for (const [side, list] of [['verso', verso], ['recto', recto]]) {
          const pg = page(Win, Hin, M);
          pg.append(el('div', 'sp-runhead ' + side, side === 'verso' ? D.title : (D.composer || '')));
          for (const p of list) {
            const q = all.indexOf(p), reg = el('div', 'sp-region'); reg.style.height = regionH + 'px';
            const pieces = op.blocks.filter(bl => bl.parts[q] && bl.parts[q].lines.length)
              .map(bl => ({ p: bl.parts[q].t, lines: bl.parts[q].lines, from: 0, to: bl.parts[q].lines.length, initial: !bl.ci, after: bl.after[q] }));
            if (pieces.length) {
              const lab = el('div', 'sp-label', p.label);
              if (names) lab.append(el('span', 'sp-sec', names));
              reg.append(lab, systemsBlock(pieces, F, W, inner));
            }
            pg.append(reg);
          }
          spread.append(pg);
        }
        book.append(spread);
      }
      size = [Win, Hin];
    } else {
      const [Win, Hin] = o.partbookPage, M = 0.6 * IN, W = Win * IN - 2 * M;
      const avail = first => Hin * IN - 2 * M - 34 - 16 - (first ? 44 : 0);
      const cap = (F, first) => Math.max(1, Math.floor(avail(first) / (F * SYS)));
      // a partbook runs on over as many pages as it needs, at a size that is comfortable to sing from
      const F = o.staffSize > 0 ? o.staffSize : PARTBOOK; staff = F;
      for (const p of D.parts) {
        const lines = breakLines(p, F, widthFn(p, W, F));
        let from = 0, first = true;
        while (from < lines.length) {
          const pg = page(Win, Hin, M), to = Math.min(lines.length, from + cap(F, first));
          pg.append(el('div', 'sp-head', p.label));
          if (first) { const tl = el('div', 'sp-titleline'); tl.append(el('span', 'sp-t', D.title), el('span', 'sp-c', D.composer || '')); pg.append(tl); }
          pg.append(systemsBlock([{ p, lines, from, to, initial: first }], F, W, avail(first)));
          book.append(pg); from = to; first = false;
        }
      }
      size = [Win, Hin];
    }
    // font credit (CC BY 4.0) on the last page of each book
    const pages = book.querySelectorAll('.sp-page');
    if (o.format === 'partbook') {
      let lastOfPart = [];
      pages.forEach((pg, i) => { const next = pages[i + 1]; if (!next || next.querySelector('.sp-head').textContent !== pg.querySelector('.sp-head').textContent) lastOfPart.push(pg); });
      lastOfPart.forEach(pg => pg.append(el('div', 'sp-credit', CREDIT)));
    } else if (pages.length) pages[pages.length - 1].append(el('div', 'sp-credit', CREDIT));

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
    return { pageSize: size, staffSize: staff, sections, warnings };
  }

  global.SPLayout = { render, CREDIT };
})(window);
