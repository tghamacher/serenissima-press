// Lays out converted parts as partbook or choirbook pages, with text underlay.
// Everything is measured from the fonts, so it must run after they have loaded.
(function (global) {
  'use strict';

  const IN = 96;                 // CSS px per inch
  const TEXT = 0.27;             // syllable size, as a proportion of the staff font size F
  const GAP = 0.06;              // minimum staff between signs
  const SYS = 1.30;              // height of one system (staff + text)
  const TEXT_TOP = 0.89;         // top of the syllables
  const FMIN = 28, FMAX = 100;
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
  function prepareText(p, mode) {
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
    toks.forEach(t => { if (t.s != null) t.sd = t.s + (t.y === 'begin' || t.y === 'middle' ? '-' : ''); });
    if (!p.initialLetter) p.initialLetter = p.label.charAt(0);
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

  function fill(w, F) {
    const s = el('span'); if (w <= 0.05) return s;
    const iW = wE('i', F), pW = wE('p', F), n = Math.floor(w / iW), m = Math.max(0, Math.ceil((w - n * iW) / pW - 1e-6));
    s.textContent = 'i'.repeat(n) + 'p'.repeat(m);
    s.style.marginRight = (w - n * iW - m * pW) + 'px';
    return s;
  }

  // ---------------------------------------------------------------- render
  // D: { title, composer, parts: [{label, clef, sig, tokens}] }
  // o: { format, staffSize, initial: {mode, src}, initialLines, partbookPage: [w,h], choirbookPage: [w,h], verso: [i], recto: [i] }
  async function render(book, D, o) {
    // fonts only start loading when used, so ask for them before measuring anything
    try { await Promise.all(['"EMS Serenissima"', '"EB Garamond"', '"IM Fell French Canon"'].map(f => document.fonts.load('40px ' + f))); } catch (e) { }
    await document.fonts.ready;
    if (!document.fonts.check('20px "EMS Serenissima"')) throw new Error('The EMS Serenissima music font could not be loaded.');
    meas = el('div'); meas.style.cssText = 'position:absolute;left:-20000px;top:0;visibility:hidden;white-space:pre';
    document.body.appendChild(meas);
    D = JSON.parse(JSON.stringify(D));   // text preparation edits the tokens
    D.parts.forEach(p => prepareText(p, o.initial.mode));
    book.innerHTML = '';
    const pending = [];

    function system(p, lines, li, F, width, indent) {
      const line = lines[li], last = li === lines.length - 1, pre = prefix(p, F);
      let nk = null;
      if (!last) outer: for (let j = li + 1; j < lines.length; j++) for (const b of lines[j]) if (b.tk.k) { nk = b.tk.k; break outer; }
      const used = pre.w + line.reduce((s, b) => s + b.w, 0), cW = nk ? wE('U' + nk, F) : 0;
      const per = last ? 0 : Math.max(0, width - used - cW) / line.length;
      const sys = el('div', 'sp-sys'); sys.style.cssText = `width:${width}px;height:${F * SYS}px;margin-left:${indent}px`;
      const staff = el('div', 'sp-staff sp-ems'); staff.style.fontSize = F + 'px';
      staff.append(el('span', null, p.clef), fill(pre.gap, F));
      if (p.sig) staff.append(el('span', null, p.sig), fill(pre.gap, F));
      const marks = [];
      for (const b of line) {
        if (b.L > 0.05) staff.append(fill(b.L, F));
        const g = el('span', null, (b.tk.a || '') + b.tk.g + (b.tk.d || '')); staff.append(g);
        staff.append(fill(b.R + per, F));
        if (b.tk.sd) marks.push([g, b]);
      }
      if (nk) staff.append(el('span', null, 'U' + nk));
      sys.append(staff);
      pending.push({ sys, marks, F });
      return sys;
    }
    const initialSize = F => o.initialLines * F * SYS - 0.22 * F;
    function initialBox(p, F) {
      const h = initialSize(F), box = el('div', 'sp-initial' + (o.initial.mode === 'blank' ? ' sp-blank' : ''));
      box.style.width = box.style.height = h + 'px';
      const inner = el('div', 'sp-in'); box.append(inner);
      if (o.initial.mode === 'image' && o.initial.src) { const img = el('img'); img.src = o.initial.src; img.alt = ''; inner.append(img); }
      else if (o.initial.mode === 'letter') { const t = el('span', null, p.initialLetter); t.style.fontSize = h * 0.74 + 'px'; inner.append(t); }
      return box;
    }
    const initW = F => initialSize(F) + 0.16 * F;
    const widthFn = (W, F) => n => n < o.initialLines ? W - initW(F) : W;
    function systemsBlock(p, lines, from, to, F, W, height, withInitial) {
      const box = el('div', 'sp-systems'); box.style.height = height + 'px';
      const count = to - from, slack = height - count * F * SYS, extra = count > 1 ? Math.min(slack / (count - 1), 0.45 * F) : 0;
      if (withInitial && from === 0) box.append(initialBox(p, F));
      for (let li = from; li < to; li++) {
        const ind = (withInitial && li < o.initialLines) ? initW(F) : 0;
        const s = system(p, lines, li, F, W - ind, ind);
        if (li < to - 1) s.style.marginBottom = extra + 'px';
        box.append(s);
      }
      return box;
    }
    const page = (Win, Hin, M) => { const pg = el('div', 'sp-page'); pg.style.cssText = `width:${Win * IN}px;height:${Hin * IN}px;padding:${M}px`; return pg; };
    const pickF = fits => { if (o.staffSize > 0) return o.staffSize; for (let F = FMAX; F > FMIN; F -= 0.5) if (fits(F)) return F; return FMIN; };
    const fitsAt = (parts, F, W, cap) => parts.every(p => breakLines(p, F, widthFn(W, F)).length <= cap(F));

    let size;
    if (o.format === 'choirbook') {
      const [Win, Hin] = o.choirbookPage, M = 0.6 * IN, W = Win * IN - 2 * M;
      const verso = o.verso.map(i => D.parts[i]).filter(Boolean), recto = o.recto.map(i => D.parts[i]).filter(Boolean);
      const k = Math.max(verso.length, recto.length, 1);
      const regionH = (Hin * IN - 2 * M - 34 - 10 - 16) / k, inner = regionH - 24 - 10;
      const cap = F => Math.max(1, Math.floor(inner / (F * SYS)));
      const all = verso.concat(recto);
      const F = pickF(F => fitsAt(all, F, W, cap));
      const lines = new Map(all.map(p => [p, breakLines(p, F, widthFn(W, F))]));
      const openings = Math.max(1, ...all.map(p => Math.ceil(lines.get(p).length / cap(F))));
      for (let op = 0; op < openings; op++) {
        const spread = el('div', 'sp-spread');
        for (const [side, parts] of [['verso', verso], ['recto', recto]]) {
          const pg = page(Win, Hin, M);
          pg.append(el('div', 'sp-runhead ' + side, side === 'verso' ? D.title : (D.composer || '')));
          for (const p of parts) {
            const ls = lines.get(p), from = op * cap(F), to = Math.min(ls.length, from + cap(F));
            const reg = el('div', 'sp-region'); reg.style.height = regionH + 'px';
            reg.append(el('div', 'sp-label', p.label));
            if (from < to) reg.append(systemsBlock(p, ls, from, to, F, W, inner, op === 0));
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
      const F = pickF(F => fitsAt(D.parts, F, W, F => cap(F, true)));
      for (const p of D.parts) {
        const lines = breakLines(p, F, widthFn(W, F));
        let from = 0, first = true;
        while (from < lines.length) {
          const pg = page(Win, Hin, M), to = Math.min(lines.length, from + cap(F, first));
          pg.append(el('div', 'sp-head', p.label));
          if (first) { const tl = el('div', 'sp-titleline'); tl.append(el('span', 'sp-t', D.title), el('span', 'sp-c', D.composer || '')); pg.append(tl); }
          pg.append(systemsBlock(p, lines, from, to, F, W, avail(first), first));
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
    for (const { sys, marks, F } of pending) {
      const left = sys.getBoundingClientRect().left;
      for (const [g, b] of marks) {
        const s = el('span', 'sp-syl', b.tk.sd);
        s.style.fontSize = F * TEXT + 'px'; s.style.top = F * TEXT_TOP + 'px';
        s.style.left = (g.getBoundingClientRect().left - left + b.aW + b.gW / 2) + 'px';
        sys.append(s);
      }
    }
    meas.remove();
    return { pageSize: size };
  }

  global.SPLayout = { render, CREDIT };
})(window);
