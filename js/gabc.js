// Reads Gregorian chant in GABC (the notation of Gregorio and GregorioTeX) into tokens for the layout, set in
// the music font as the books set chant beside polyphony: black square notes on the staff. A punctum is a
// black breve, a virga a black longa, a punctum inclinatum a black semibreve (the diamond); quilisma,
// oriscus, liquescents and episemata are set as plain puncta, a mora as a dot.
(function (global) {
  'use strict';

  const PITCH_KEYS = ['z', 's', 'x', 'd', 'c', 'f', 'v', 'g', 'b', 'h', 'n', 'j', 'm', 'k', ','];  // positions 0..14, bottom line d = 3
  // GABC's letters a..m are staff positions too: its four lines are d f h j, our five lines' lowest four
  const posOf = ch => ch.toLowerCase().charCodeAt(0) - 97;
  // the clef's C, as a staff position: c4 = C on the fourth line; an F clef's C is a fourth above its F
  const cOf = c => 1 + 2 * +c.slice(-1) + (c[0] === 'f' ? 3 : 0);

  // text: GABC's markup stripped, its versicle and response signs kept
  function cleanText(s) {
    return s.replace(/<sp>\s*V\/\s*<\/sp>/gi, '℣').replace(/<sp>\s*R\/\s*<\/sp>/gi, '℟').replace(/<sp>\s*\+\s*<\/sp>/gi, '✠')
      .replace(/<sp>\s*'?(ae|æ)\s*<\/sp>/gi, 'æ').replace(/<sp>\s*'?(oe|œ)\s*<\/sp>/gi, 'œ')
      .replace(/<[^>]*>/g, '').replace(/[{}]/g, '').replace(/[*†]/g, '').replace(/\s+/g, ' ');
  }

  // text -> { name, clef: glyph, sig, tokens, warnings }
  function parse(text) {
    const warnings = [], warn = m => { if (!warnings.includes(m)) warnings.push(m); };
    let head = '', body = text;
    const split = text.match(/^([\s\S]*?)^%%\s*$/m);
    if (split) { head = split[1]; body = text.slice(split[0].length); }
    const meta = {};
    for (const line of head.split(/\r?\n/)) { const m = line.match(/^\s*([\w-]+)\s*:\s*(.*?);?\s*$/); if (m) meta[m[1].toLowerCase()] = m[2]; }
    body = body.replace(/%.*$/gm, '');

    // syllables: the text before each group of notes, and the group
    const groups = [];
    const re = /([^()]*)\(([^)]*)\)/g; let m;
    while ((m = re.exec(body))) groups.push({ raw: m[1], notes: m[2] });
    if (!groups.length) throw new Error('No chant found: GABC is text with its notes in brackets, as Ma(f)gní(gh)fi(h)cat(h).');

    // the first clef, which the staff takes; later clefs are read into it
    let clef = null, shift = 0, sig = '';
    const first = groups.find(g => /^\s*[cf]b?[1-4]\s*$/.test(g.notes));
    if (!first) { clef = 'c4'; warn('The chant has no clef: a C clef on the fourth line is assumed.'); }

    const tokens = [], words = [];
    let pendingFlat = new Map(), wordStart = true;
    for (const g of groups) {
      const notes = g.notes.trim();
      const c = notes.match(/^([cf])(b?)([1-4])$/);
      if (c) {
        const name = c[1] + c[3];
        if (!clef) {
          clef = name;
          if (c[2]) { const p = cOf(name) - 1; if (p >= 0 && p < PITCH_KEYS.length) sig = 'b' + PITCH_KEYS[p]; }
        } else shift = cOf(clef) - cOf(name);
        if (/^\s/.test(g.raw)) wordStart = true;
        continue;
      }
      // a syllable after a space starts a new word
      const txt = cleanText(g.raw).trim();
      if (/^\s/.test(g.raw)) wordStart = true;
      let sylDone = !txt;
      for (let i = 0; i < notes.length; i++) {
        const ch = notes[i];
        if (ch === '[') { const e = notes.indexOf(']', i); i = e < 0 ? notes.length : e; continue; }
        if (ch === ':' || ch === ';' || ch === ',') {
          const dbl = notes[i + 1] === ':';
          if (ch === ',') { /* a quarter bar: only a breath */ }
          else tokens.push({ t: 'b', g: dbl ? 'E' : 'B' });
          if (dbl) i++;
          while (/[0-9'_`?]/.test(notes[i + 1] || '')) i++;
          pendingFlat = new Map(); wordStart = true;
          continue;
        }
        if (/[a-mA-M]/.test(ch)) {
          const pos = posOf(ch) + shift;
          if (/[xy#]/.test(notes[i + 1] || '')) {   // an accidental on this pitch, before the note it alters
            if (notes[i + 1] === 'x') pendingFlat.set(pos, true); else pendingFlat.delete(pos);
            if (notes[i + 1] === '#') warn('A sharp in the chant is left out: the font has none for chant.');
            i++; while (/[?]/.test(notes[i + 1] || '')) i++;
            continue;
          }
          let virga = false, dots = 0;
          while (i + 1 < notes.length && /[vVwWoOsS~<>._'0-9rRqQ\-@=]/.test(notes[i + 1])) {
            const mod = notes[++i];
            if (mod === 'v' || mod === 'V') virga = true;
            else if (mod === '.') dots++;
          }
          const p = Math.max(0, Math.min(14, pos)), k = PITCH_KEYS[p];
          const tk = { t: 'n', a: '', g: (ch === ch.toUpperCase() ? 'e' : virga ? 'q' : 'w') + k, d: dots ? '.' + k : '', k, chant: true };
          if (pos !== p) warn('A note of the chant lies beyond the staff\'s reach: it is set at the edge.');
          if (pendingFlat.get(pos)) { tk.a = 'b' + k; pendingFlat.delete(pos); }
          if (!sylDone) { tk.s = txt; words.push({ tk, start: wordStart }); sylDone = true; wordStart = false; }
          tokens.push(tk);
          continue;
        }
        // spacing, custos, line breaks and anything else: nothing to set
      }
    }
    // syllables: a word runs on until a syllable starts a new one
    words.forEach((w, i) => {
      const next = words[i + 1], cont = next && !next.start;
      w.tk.y = w.start ? (cont ? 'begin' : 'single') : (cont ? 'middle' : 'end');
    });
    // GABC writes the first word in capitals for the initial (GLó-ri-a); the layout sets it as it sets any first word
    for (let i = 0; i < words.length && (i === 0 || !words[i].start); i++) { const s = words[i].tk.s; words[i].tk.s = i ? s.toLowerCase() : s.charAt(0) + s.slice(1).toLowerCase(); }
    while (tokens.length && tokens[tokens.length - 1].t === 'b') tokens.pop();
    tokens.push({ t: 'b', g: 'E' });
    if (!tokens.some(t => t.t === 'n')) throw new Error('The chant has no notes.');
    const glyph = (clef[0] === 'f' ? 'F' : 'C') + clef.slice(-1);
    // its name: the header's, or its first words
    let nameOf = meta.name || '';
    if (!nameOf) { let n = 0; for (const w of words) { if (w.start && ++n > 3) break; nameOf += (w.start && nameOf ? ' ' : '') + w.tk.s; } }
    return { name: nameOf, clef: glyph, sig, tokens, warnings };
  }

  global.SPGabc = { parse };
})(window);
