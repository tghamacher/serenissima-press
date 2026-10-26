// MusicXML (modern notation) -> mensural notation tokens for the EMS Serenissima font.
// Port of tools/ConvertTo-Ems.ps1. The output feeds layout.js.
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- font facts
  const PITCH_KEYS = ['z', 's', 'x', 'd', 'c', 'f', 'v', 'g', 'b', 'h', 'n', 'j', 'm', 'k', ','];  // positions 0..14, bottom line d = 3
  const STEP = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  // clef -> [staff position of its line, diatonic number of the pitch it names, glyph]
  const CLEFS = {
    C1: [3, 28, 'C1'], C2: [5, 28, 'C2'], C3: [7, 28, 'C3'], C4: [9, 28, 'C4'], C5: [11, 28, 'C5'],
    F3: [7, 24, 'F3'], F4: [9, 24, 'F4'], F5: [11, 24, 'F5'],
    G1: [3, 32, 'G1'], G2: [5, 32, 'G2'],
    'G2-8': [5, 25, 'G2']   // octave treble, as modern tenor parts
  };
  const CLEF_NAMES = {
    C1: 'C1 (soprano)', C2: 'C2 (mezzo)', C3: 'C3 (alto)', C4: 'C4 (tenor)', C5: 'C5 (baritone)',
    F3: 'F3 (baritone)', F4: 'F4 (bass)', F5: 'F5 (sub-bass)', G1: 'G1 (French violin)', G2: 'G2 (treble)', 'G2-8': 'G2, octave lower (modern tenor)'
  };
  // semibreve value -> key, largest first
  const NOTE = [[8, 'r'], [4, '1'], [2, '2'], [1, '3'], [0.5, '4'], [0.25, '5'], [0.125, '6'], [0.0625, '8']];
  const BLACK = [[4, 'q'], [2, 'w'], [1, 'e'], [0.5, '5']];
  const REST = [[4, '10'], [2, '20'], [1, '30'], [0.5, '40'], [0.25, '50'], [0.125, '60'], [0.0625, '70']];
  const MENS = { T1: 'C', T2: 'cut C', T3: 'O', T4: 'cut O', T5: '3', T6: '3/2', T7: '6/4', T8: '2', T9: '3/4' };
  const NATURAL = [0, 2, 4, 5, 7, 9, 11];
  const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6], FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];

  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const mod = (a, n) => ((a % n) + n) % n;
  const kid = (el, ...path) => { for (const name of path) { if (!el) return null; el = [...el.children].find(c => c.localName === name) || null; } return el; };
  const kids = (el, name) => el ? [...el.children].filter(c => c.localName === name) : [];
  const text = el => el ? el.textContent.trim() : '';

  function keyAlter(fifths, step) {
    if (fifths > 0) return SHARP_ORDER.indexOf(step) < fifths ? 1 : 0;
    if (fifths < 0) return FLAT_ORDER.indexOf(step) < -fifths ? -1 : 0;
    return 0;
  }
  function transposition(semitones) {
    const a = Math.abs(semitones);
    const dia = Math.sign(semitones) * (Math.floor(a / 12) * 7 + [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6][a % 12]);
    let fifths = mod(semitones * 7, 12); if (fifths > 6) fifths -= 12;
    return { dia, fifths, semitones };
  }

  // ---------------------------------------------------------------- loading
  function parseScore(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('This file isn’t valid XML. It may be damaged, or not a MusicXML file at all.');
    const root = doc.documentElement;
    if (root.localName === 'score-timewise') throw new Error('This score is saved as timewise MusicXML, which isn’t supported. Export it again as standard (partwise) MusicXML.');
    if (root.localName !== 'score-partwise') throw new Error('This file isn’t a MusicXML score.');
    return doc;
  }

  // Quick look at a score: title, composer, parts, suggested settings
  function inspect(doc) {
    const root = doc.documentElement;
    const title = [kid(root, 'work', 'work-title'), kid(root, 'movement-title')].map(text).find(Boolean) || '';
    const composer = text(kids(kid(root, 'identification'), 'creator').find(c => c.getAttribute('type') === 'composer'));
    const names = {};
    for (const sp of kids(kid(root, 'part-list'), 'score-part')) names[sp.getAttribute('id')] = (text(kid(sp, 'part-name')) || sp.getAttribute('id')).replace(/\s+/g, ' ');
    // a staff shared by two singers becomes two entries; part: the <part>, split: which singer
    const parts = [];
    kids(root, 'part').forEach((p, i) => {
      const name = names[p.getAttribute('id')] || `Part ${i + 1}`;
      const staves = p.querySelector('attributes > staves');
      const keyboard = /piano|rehearsal|reduction|keyboard|organ/i.test(name) || (staves && +text(staves) > 1);
      const voices = keyboard ? [] : partVoices(p);
      if (voices.length === 2) {
        const pair = pairNames(name, p);
        pair.forEach((nm, line) => parts.push({ index: parts.length, part: i, split: { line, voices, pair, staff: name }, name: `${nm} (${name})`, label: partLabel(nm), keyboard }));
      } else parts.push({ index: parts.length, part: i, split: null, name, label: partLabel(name), keyboard });
    });
    // note values: x/2 or x/1 time (or breves) usually means original values; x/4 usually halved
    const firstPart = kids(root, 'part')[0], music = kids(firstPart, 'measure').filter((m, i) => !(i === 0 && isPrefatory(m)));
    const beatType = +text(music.map(m => m.querySelector('time > beat-type')).find(Boolean)) || 4;
    const hasBreves = [...root.querySelectorAll('note > type')].some(t => t.textContent === 'breve');
    const reduction = beatType <= 2 || hasBreves ? 4 : beatType >= 8 ? 1 : 2;
    return { title, composer, parts, reduction };
  }

  function partLabel(name) {
    const n = name.toLowerCase();
    let label;
    if (/^(soprano|superius|cantus|discantus|treble)/.test(n)) label = 'CANTVS';
    else if (/^(alto|altus|contra|countertenor|mezzo)/.test(n)) label = 'ALTVS';
    else if (/^tenor/.test(n)) label = 'TENOR';
    else if (/^(bass|bassus|baritone)/.test(n)) label = 'BASSVS';
    else if (/^quintus/.test(n)) label = 'QVINTVS';
    else if (/^sextus/.test(n)) label = 'SEXTVS';
    else label = name.toUpperCase().replace(/U/g, 'V');
    const num = (name.match(/\s(\d|I+V?|V?I*)$/) || [])[1];
    return num ? label + ' ' + num.toUpperCase() : label;
  }

  // ---------------------------------------------------------------- mensural values
  // Returns [['val', key] | ['dot', '.'] ...] for a duration in semibreves
  function values(sb, isRest, perfect, where, warn) {
    const table = isRest ? REST : NOTE;
    for (const [v, k] of table) if (near(sb, v)) return [['val', k]];
    if (!isRest) {
      if (perfect && near(sb, 3)) return [['val', '2']];   // perfect breve
      if (perfect && near(sb, 6)) return [['val', '1']];
      for (const [v, k] of table) if (near(sb, 1.5 * v)) return [['val', k], ['dot', '.']];
      for (const [v, k] of BLACK) if (near(sb, v * 2 / 3)) return [['val', k]];   // coloration
    }
    const out = []; let left = sb;
    for (const [v, k] of table) while (left >= v - 1e-6) { out.push(['val', k]); left -= v; }
    if (left > 1e-6) warn(`${where}: a note or rest ${+sb.toFixed(4)} semibreves long can’t be written exactly, so the leftover ${+left.toFixed(4)} was dropped. Check it.`);
    else if (out.length > 1 && !isRest) warn(`${where}: a note ${+sb.toFixed(4)} semibreves long (tied, or an unusual length) was written as ${out.length} notes. Check it.`);
    return out;
  }

  function mensSign(time, reduction, warn) {
    const sym = time.getAttribute('symbol');
    if (sym === 'common') return 'T1';
    if (sym === 'cut') return 'T2';
    const beats = +(text(kid(time, 'beats')).split('+')[0]), type = +text(kid(time, 'beat-type'));
    const measureSb = beats * 4 / type / reduction;
    if (beats === 3 && near(measureSb, 3)) return 'T3';
    if (beats === 3 && near(measureSb, 1.5)) return 'T5';
    if (beats === 6) { warn(`Time ${beats}/${type}: the font has no sign for prolatio major (C or O with a dot), so C is used instead.`); return 'T1'; }
    if ([1, 2, 4].includes(beats)) return 'T1';
    warn(`There’s no obvious mensuration sign for ${beats}/${type} time, so C is used. You can choose a different one under Mensuration sign.`); return 'T1';
  }

  // A prefatory staff (incipit): editions often open with a measure showing the original clef and
  // mensuration over an invisible rest, before the music proper in modern clefs.
  const isPrefatory = m => { const ns = kids(m, 'note'); return ns.length > 0 && ns.every(n => n.getAttribute('print-object') === 'no'); };

  // ---------------------------------------------------------------- voices sharing a staff
  // Choral scores often put two singers on one staff (S+A, T+B) as voices 1 and 2. Such a part is
  // offered as two voices. "Real" voices have notes in at least a quarter of the measures; stray
  // layers (a few notes in voice 3) don't count, but their notes are still placed by pitch.
  function partVoices(p) {
    const ms = kids(p, 'measure'), seen = new Map();
    for (const m of ms) new Set(kids(m, 'note').filter(n => !kid(n, 'rest')).map(n => text(kid(n, 'voice')) || '1')).forEach(v => seen.set(v, (seen.get(v) || 0) + 1));
    return [...seen].filter(([, c]) => c >= ms.length / 4).map(([v]) => v).sort((a, b) => a - b);
  }
  const VOICE_WORDS = {
    s: 'Soprano', soprano: 'Soprano', superius: 'Soprano', cantus: 'Soprano', discantus: 'Soprano', treble: 'Soprano',
    a: 'Alto', alto: 'Alto', altus: 'Alto', contralto: 'Alto', t: 'Tenor', tenor: 'Tenor',
    b: 'Bass', bass: 'Bass', bassus: 'Bass', baritone: 'Bass'
  };
  // names for the two singers: from the part name ("Soprano/Alto", "T B"), else from the clef
  function pairNames(name, p) {
    const words = name.toLowerCase().split(/[^a-z]+/).map(w => VOICE_WORDS[w]).filter(Boolean);
    if (words.length === 2) return words;
    const sign = text(p.querySelector('attributes > clef > sign'));
    return sign === 'F' ? ['Tenor', 'Bass'] : sign === 'C' ? ['Alto', 'Tenor'] : ['Soprano', 'Alto'];
  }

  // One measure of a shared staff: the notes the upper (line 0) or lower (line 1) singer sings.
  // Decided by pitch where voices sound together, so swapped layers and stray voices still land right;
  // chords split top/bottom; if one voice is missing from the measure both singers share the other.
  function splitLine(items, split, mlen, where, warn) {
    const notes = items.filter(it => !it.rest), real = split.voices;
    const present = real.filter(v => items.some(it => it.voice === v));
    const sounding = (m, t) => m.start <= t + 1e-6 && m.end > t + 1e-6;
    const mine = [];
    for (const n of notes) {
      const group = notes.filter(m => m.voice === n.voice && near(m.start, n.start));
      let line;
      if (group.length > 1) {
        const ps = group.map(m => m.p), hi = Math.max(...ps), lo = Math.min(...ps);
        line = hi === lo ? 'both' : n.p === hi ? 0 : n.p === lo ? 1 : -1;
      } else {
        const others = notes.filter(m => m.voice !== n.voice && sounding(m, n.start));
        if (others.length) {
          const ps = others.map(m => m.p), hi = Math.max(...ps), lo = Math.min(...ps);
          if (n.p > hi) line = 0;
          else if (n.p < lo) line = 1;
          else if (n.p > lo && n.p < hi) line = hi - n.p <= n.p - lo ? 0 : 1;   // between two others: the nearer singer
          else line = real.includes(n.voice) ? real.indexOf(n.voice) : n.p === hi ? 0 : 1;   // unison: keep its layer
        } else if (present.length < 2 && real.includes(n.voice)) line = 'both';
        else if (real.includes(n.voice)) line = real.indexOf(n.voice);
        else line = items.some(m => m.voice === real[0] && sounding(m, n.start)) ? 1 : 0;   // a stray layer fills the gap
      }
      if (line === split.line || line === 'both') mine.push(n);
    }
    mine.sort((a, b) => a.start - b.start);
    const out = [];
    for (let k = 0; k < mine.length; k++) {
      const n = mine[k], prev = out[out.length - 1];
      if (prev && n.start < prev.end - 1e-6) {
        if (near(n.start, prev.start) && n.p === prev.p) continue;   // the same note reached twice
        // usually a note misplaced by the exporting program: move it after the note it overlaps if there is room
        const d = n.end - n.start, next = mine[k + 1] ? mine[k + 1].start : mlen;
        if (prev.end + d <= next + 1e-6) { out.push({ ...n, start: prev.end, end: prev.end + d }); warn(`${where}: a note overlapped the one before it, so it was moved to follow it. Check it.`); }
        else warn(`${where}: a note overlapping the one before it was left out. Check it.`);
        continue;
      }
      out.push(n);
    }
    return out;
  }

  // Text for a lower voice that has none of its own: the staff's syllables, each given to the note
  // sounding when it is sung, or the next untexted note before the following syllable.
  function borrowText(notes, track, name, warn) {
    const off = [];
    let j = 0;
    track.forEach((s, k) => {
      const next = k + 1 < track.length ? track[k + 1].t : Infinity;
      while (j < notes.length && notes[j].end <= s.t + 1e-6) j++;
      let n = j; while (n < notes.length && (notes[n].syl || notes[n].cont)) n++;   // not on a slurred melisma
      if (n < notes.length && notes[n].t < next - 1e-6) { notes[n].syl = s.syl; if (!near(notes[n].t, s.t)) off.push(s.mno); j = n + 1; }
      else off.push(s.mno);
    });
    const ms = [...new Set(off)];
    if (ms.length) warn(`${name}: the words were taken from the other voice on the same staff, but ${off.length} syllable(s) don’t fit this voice’s rhythm (m. ${ms.slice(0, 8).join(', ')}${ms.length > 8 ? '…' : ''}). Check the underlay.`);
  }
  // A voice with its own text: add a word the other voice carries where this one starts a note untexted
  // (as "A-" of "Amen" written only in the other voice), unless this voice sings that word itself next.
  function fillText(notes, track) {
    const key = s => s.text.toLowerCase().replace(/[^\p{L}]/gu, '');
    for (const s of track) {
      if (s.syl.syllabic !== 'begin' && s.syl.syllabic !== 'single') continue;
      const i = notes.findIndex(e => near(e.t, s.t));
      if (i < 0 || notes[i].syl || notes[i].cont) continue;
      const before = notes.slice(0, i).reverse().find(e => e.syl), after = notes.slice(i + 1).find(e => e.syl);
      if (before && (before.syl.syllabic === 'begin' || before.syl.syllabic === 'middle')) continue;
      if (after && key(after.syl) === key(s.syl)) continue;
      notes[i].syl = s.syl;
    }
  }

  // ---------------------------------------------------------------- repeats
  // The order in which a part's measures are sung. "out": repeats written out in full, taking only the
  // measures of the ending that belongs to each pass. Otherwise the measures as written, marking where
  // repeat signs go. Each entry: { el, pass, open, close } (open/close: a repeat sign before/after it).
  function measureOrder(partEl, mode, warn) {
    const ms = kids(partEl, 'measure');
    let ending = null;
    const info = ms.map(m => {
      const bars = kids(m, 'barline'), rep = d => bars.some(b => kid(b, 'repeat') && kid(b, 'repeat').getAttribute('direction') === d);
      const back = bars.map(b => kid(b, 'repeat')).find(r => r && r.getAttribute('direction') === 'backward');
      const start = bars.map(b => kid(b, 'ending')).find(e => e && e.getAttribute('type') === 'start');
      if (start) ending = (start.getAttribute('number') || '1').split(/[\s,]+/).filter(Boolean).map(Number);
      const mine = ending;
      if (bars.some(b => kid(b, 'ending') && /stop|discontinue/.test(kid(b, 'ending').getAttribute('type')))) ending = null;
      return { el: m, forward: rep('forward'), backward: !!back, times: back ? +back.getAttribute('times') || 2 : 0, ending: mine };
    });
    if (!info.some(m => m.backward)) return ms.map(el => ({ el, pass: 1 }));
    if (mode !== 'out') return info.map((m, i) => ({ el: m.el, pass: 1, open: m.forward && i > 0, close: m.backward }));
    const fwd = info.find(m => m.forward);
    warn(`Repeats are written out in full${fwd ? ` (from m. ${fwd.el.getAttribute('number')})` : ''}. To keep the repeat signs instead, choose “Keep repeat signs” under Repeats.`);
    const order = [];
    let i = 0, from = 0, pass = 1, after = false;
    while (i < info.length && order.length < info.length * 10) {
      const m = info[i];
      if (m.forward && from !== i) { from = i; pass = 1; after = false; }
      if (after && !m.ending) { from = i; pass = 1; after = false; }
      if (m.ending && !m.ending.includes(pass)) { i++; continue; }
      order.push({ el: m.el, pass });
      if (m.backward && pass < m.times) { pass++; i = from; continue; }
      if (m.backward) after = true;
      i++;
    }
    return order;
  }

  // ---------------------------------------------------------------- sections
  // Where the edition's double and final barlines fall (not repeat signs): a section ends there, and a
  // final barline ends a movement. Named from the edition's words at its first bar, if any.
  // Steps index the order in which the measures are sung, the same in every part.
  function findSections(partEls, mode) {
    const orders = partEls.map(p => measureOrder(p, mode, () => { }));
    const n = Math.min(...orders.map(o => o.length));
    const bars = (i, loc) => orders.flatMap(o => kids(o[i].el, 'barline').filter(b => !kid(b, 'repeat') && (b.getAttribute('location') || 'right') === loc).map(b => text(kid(b, 'bar-style'))));
    const out = [{ step: 0, movement: true }];
    for (let i = 1; i < n; i++) {
      const ends = bars(i - 1, 'right').concat(bars(i, 'left'));
      if (!ends.some(s => /^(light-light|light-heavy|heavy-light|heavy-heavy)$/.test(s))) continue;
      out.push({ step: i, movement: ends.includes('light-heavy') });
    }
    for (const s of out) {
      const m = orders[0][s.step].el;
      s.mno = m.getAttribute('number');
      const words = orders.flatMap(o => [...o[s.step].el.querySelectorAll('direction > direction-type > words')].map(w => w.textContent.replace(/\s+/g, ' ').trim()));
      s.name = words.find(Boolean) || '';
    }
    // a prefatory incipit is not a bar of music
    if (out.length > 1 && isPrefatory(orders[0][0].el)) out[0].mno = orders[0][1].el.getAttribute('number');
    return out;
  }
  // a name for a section the edition leaves unnamed: its first word, or two if the first is short ("Et incarnatus")
  function sectionName(toks) {
    const words = []; let w = '';
    for (const t of toks) {
      if (!t.s) continue;
      w += t.s;
      // some editions mark every syllable single and hyphenate in the text ("Cru–")
      if ((t.y === 'single' || t.y === 'end') && !/[-–—]\s*$/.test(t.s)) { words.push(w.replace(/[^\p{L}'’]/gu, '')); w = ''; if (words[0].length > 3 || words.length === 2) break; }
    }
    return words.filter(Boolean).join(' ');
  }

  // ---------------------------------------------------------------- read one part into events
  // Notes are placed by time (backup/forward followed), so gaps in a voice become rests.
  // split: null for the whole part (its first voice), or { line, voices } for one singer of a shared staff.
  // secs: the steps at which sections start; each gets a double bar, and rests never run across one.
  // Every event carries t0, its start time, so bars can be found where the layout may turn the page.
  function readPart(partEl, name, o, tr, warn, split, secs) {
    const events = [], track = [], bars = [], lens = [];   // lens: each bar's length as written, and as its time signature has it
    let meter = 0, divisions = 1, clefInfo = null, editionClef = null, fifths = 0, shown = Math.min(tr.fifths, 0), voice = null, tie = null, perfect = false, origSign = null, mstart = 0, pass = 1;
    const slurs = new Map();   // open slurs: number -> voice that opened it
    const seen = new Set();   // measures already read (a repeat comes round again)
    // the verse for this pass through a repeat ("2", "verse2", "part1verse2"), else the first
    const lyricOf = node => {
      const all = kids(node, 'lyric'), num = l => +((l.getAttribute('number') || '1').match(/(\d+)\D*$/) || [0, 1])[1];
      const lyr = all.find(l => num(l) === pass) || all.find(l => num(l) === 1) || all[0];
      const t = lyr ? kids(lyr, 'text').map(e => e.textContent).join(' ').trim() : '';
      return t ? { text: t, syllabic: text(kid(lyr, 'syllabic')) || 'single' } : null;
    };
    function pushRest(ql, where, t0) {
      if (ql < 1e-6) return;
      // consecutive rests merge, so long silences come out as longa + breve rests as in the sources
      const prev = events[events.length - 1];
      if (prev && prev.kind === 'rest') prev.ql += ql; else events.push({ kind: 'rest', ql, where, perfect, t0 });
      tie = null;
    }
    function pushNote(node, t, ql, where, edMem, head, cont) {
      const fermata = !!kid(node, 'notations', 'fermata');
      const step = text(kid(node, 'pitch', 'step')), oct = +text(kid(node, 'pitch', 'octave'));
      const alter = Math.round(+text(kid(node, 'pitch', 'alter')) || 0);
      const dia0 = oct * 7 + STEP[step];
      // editorial (ficta) status: from this note's accidental, or carried from earlier in the bar
      const acc = kid(node, 'accidental');
      if (acc) edMem[dia0] = acc.getAttribute('editorial') === 'yes' || acc.getAttribute('parentheses') === 'yes' || acc.getAttribute('bracket') === 'yes';
      const chromatic = alter !== keyAlter(fifths, STEP[step]);
      const editorial = chromatic && !!edMem[dia0];
      // transpose, then compare with the key signature actually printed
      const dia = dia0 + tr.dia;
      const midi = oct * 12 + NATURAL[STEP[step]] + alter + tr.semitones;
      const alter2 = midi - (Math.floor(dia / 7) * 12 + NATURAL[mod(dia, 7)]);
      const key2 = keyAlter(shown, mod(dia, 7));
      let accKey = null;
      if (alter2 !== key2 && (!editorial || o.ficta)) {
        if (Math.abs(alter2) > 1) warn(`${where}: double sharps and double flats can’t be shown.`);
        accKey = alter2 > key2 ? '+' : 'b';
      }
      const ties = kids(node, 'tie').map(t => t.getAttribute('type'));
      if (tie && ties.includes('stop') && tie.dia === dia) {
        tie.ql += ql; tie.end += ql; if (fermata) tie.fermata = true;
        if (!ties.includes('start')) tie = null;
        return;
      }
      const ev = { kind: 'note', dia, midi: midi + 12, ql, acc: accKey, fermata, syl: lyricOf(node) || (head && lyricOf(head)), cont, where, perfect, t, t0: t, end: t + ql };
      events.push(ev);
      tie = ties.includes('start') ? ev : null;
    }

    // the mensuration sign in force: the last one since the section began
    const inForce = () => { for (let i = events.length - 1; i >= 0; i--) { if (events[i].kind === 'sec') return null; if (events[i].kind === 'mens') return events[i].code; } return null; };
    measureOrder(partEl, o.repeats, warn).forEach((step, si) => {
      const measure = step.el, revisit = seen.has(measure); pass = step.pass; seen.add(measure);
      const mno = measure.getAttribute('number'), edMem = {}, where = `${name} m. ${mno}`;
      const incipit = !events.some(e => e.kind === 'note' || e.kind === 'rest') && isPrefatory(measure);
      if (incipit) warn('The score opens with a prefatory staff showing the original clefs and signs. Those clefs and signs are used, but the prefatory bar itself isn’t printed.');
      if (!incipit && secs && secs.has(si) && events.length) {
        if (events[events.length - 1].kind === 'bar') events.pop();
        events.push({ kind: 'sec', t0: mstart });
      }
      if (!incipit) bars.push({ step: si, ev: events.length, t: mstart });
      let items = [];
      let pos = 0, last = 0, mlen = 0;
      const dur = node => +text(kid(node, 'duration')) / divisions;
      for (const node of measure.children) {
        if (incipit && node.localName !== 'attributes') continue;
        switch (node.localName) {
          case 'attributes': {
            const d = kid(node, 'divisions'); if (d) divisions = +text(d);
            const k = kid(node, 'key', 'fifths');
            if (k) {
              if (events.length && !revisit) warn(`${name} m. ${mno}: the key changes here. The new signature isn’t printed, but the accidentals follow the new key.`);
              fifths = +text(k); shown = fifths + tr.fifths;
              if (shown > 0) { warn(`${name}: this key needs ${shown} sharp(s). Mensural notation has no sharp key signatures, so each sharp is printed beside its note. You may want to transpose.`); shown = 0; }
            }
            const c = kids(node, 'clef').find(c => !c.getAttribute('number') || c.getAttribute('number') === '1');
            if (c && !(clefInfo && c.getAttribute('print-object') === 'no')) {   // a hidden clef is the edition's, not the source's
              const ci = { sign: text(kid(c, 'sign')), line: +text(kid(c, 'line')) || 0, octave: +text(kid(c, 'clef-octave-change')) || 0 };
              if (!incipit && !editionClef) editionClef = ci;
              if (!clefInfo) clefInfo = ci; else if (ci.sign !== clefInfo.sign || ci.line !== clefInfo.line) warn(`${name} m. ${mno}: clef change ignored. The voice keeps its first clef.`);
            }
            const t = kid(node, 'time');
            if (t && kid(t, 'beats')) {
              if (incipit) { origSign = mensSign(t, o.reduction, () => { }); break; }
              const opening = !events.length;
              const sign = (opening && o.mensuration) || (opening && origSign) || mensSign(t, o.reduction, warn);
              const beats = +(text(kid(t, 'beats')).split('+')[0]), type = +text(kid(t, 'beat-type'));
              meter = text(kid(t, 'beats')).split('+').reduce((a, b) => a + +b, 0) * 4 / type;
              perfect = sign === 'T3' || sign === 'T4' || (beats === 3 && near(beats * 4 / type / o.reduction, 3));
              // not restated when a repeat comes round again, nor where the sign does not change (an edition's
              // irregular bars, 4/4 then 2/4, are all one C); a new section restates it
              if (!revisit && sign !== inForce()) events.push({ kind: 'mens', code: sign, t0: mstart });
            }
            break;
          }
          case 'direction': {
            // the edition's ligature brackets, placed by time among the notes
            if (!o.brackets) break;
            const at = pos + (+text(kid(node, 'offset')) || 0) / divisions, v = text(kid(node, 'voice'));
            for (const br of node.querySelectorAll('direction-type > bracket')) {
              const type = br.getAttribute('type');
              if (type === 'start' || type === 'stop') items.push({ bracket: type === 'start' ? '{' : '}', voice: v, start: at, end: at });
            }
            break;
          }
          case 'backup': pos -= dur(node); break;
          case 'forward': pos += dur(node); mlen = Math.max(mlen, pos); break;
          case 'note': {
            if (kid(node, 'grace')) { warn(`${where}: grace note left out.`); break; }
            if (kid(node, 'cue') || !kid(node, 'duration')) break;
            const chord = !!kid(node, 'chord'), d = dur(node), start = chord ? last : pos;
            if (!chord) { last = pos; pos += d; mlen = Math.max(mlen, pos); }
            const rest = !!kid(node, 'rest'), pitch = kid(node, 'pitch');
            if (!rest && !pitch) break;   // unpitched
            const p = rest ? null : +text(kid(pitch, 'octave')) * 12 + NATURAL[STEP[text(kid(pitch, 'step'))]] + (+text(kid(pitch, 'alter')) || 0);
            // a chord's syllable is on its first note; every note of the chord sings it
            const head = chord ? [...items].reverse().find(it => !it.chord) : null;
            // inside a slur its own voice opened (not the slur's first note): a melisma, so no syllable of its own.
            // Slurs pair by number across the part; a rest ends any left open in that voice.
            const v = text(kid(node, 'voice')) || '1';
            const cont = !rest && [...slurs.values()].includes(v);
            if (rest) for (const [k, sv] of slurs) if (sv === v) slurs.delete(k);
            for (const s of kids(node, 'notations').flatMap(n => kids(n, 'slur'))) {
              const k = s.getAttribute('number') || '1';
              if (s.getAttribute('type') === 'stop') slurs.delete(k); else if (s.getAttribute('type') === 'start') slurs.set(k, v);
            }
            items.push({ node, voice: v, chord, rest, start, end: start + d, p, head: head && head.node, cont });
          }
        }
      }
      if (incipit) return;

      const brackets = items.filter(it => it.bracket);
      items = items.filter(it => !it.bracket);
      let line;
      if (split) line = splitLine(items, split, mlen, where, warn);
      else {
        if (voice === null && items.length) voice = items[0].voice;
        line = items.filter(it => it.voice === voice);
        if (line.some(it => it.chord)) { warn(`${where}: chord notes left out. Each part can only hold a single line of music.`); line = line.filter(it => !it.chord); }
      }
      // a bracket belongs to this line unless it names another voice; at the same moment a closing
      // bracket comes before the notes that start then, an opening one just before them
      const mineVoice = split ? split.voices[split.line] : voice;
      line = line.concat(brackets.filter(b => !b.voice || b.voice === mineVoice))
        .sort((a, b) => a.start - b.start || (a.bracket === '}' ? -1 : a.bracket ? 0 : 1) - (b.bracket === '}' ? -1 : b.bracket ? 0 : 1));
      if (step.open && !(events.length && events[events.length - 1].kind === 'repeat')) events.push({ kind: 'repeat', t0: mstart });
      let cur = 0;
      for (const it of line) {
        if (it.bracket) {
          if (it.bracket === '{' && it.start > cur + 1e-6) { pushRest(it.start - cur, where, mstart + cur); cur = it.start; }
          events.push({ kind: 'bracket', code: it.bracket, t0: mstart + it.start }); continue;
        }
        if (it.start > cur + 1e-6) pushRest(it.start - cur, where, mstart + cur);
        if (it.rest) pushRest(it.end - Math.max(it.start, cur), where, mstart + Math.max(it.start, cur)); else pushNote(it.node, mstart + it.start, it.end - it.start, where, edMem, it.head, it.cont);
        cur = Math.max(cur, it.end);
      }
      if (mlen > cur + 1e-6) pushRest(mlen - cur, where, mstart + cur);
      if (split) for (const it of items) {
        const s = !it.rest && lyricOf(it.node), t = mstart + it.start;
        if (s && !track.some(x => near(x.t, t))) track.push({ t, syl: s, mno });
      }
      lens.push({ mno, len: mlen, meter });
      mstart += mlen;
      if (step.close) events.push({ kind: 'repeat', t0: mstart });
      else if (o.barlines) events.push({ kind: 'bar', t0: mstart });
    });
    if (o.barlines && events.length && events[events.length - 1].kind === 'bar') events.pop();
    if (split && track.length) {
      track.sort((a, b) => a.t - b.t);
      const notes = events.filter(e => e.kind === 'note');
      if (notes.filter(e => e.syl).length < track.length / 2) { notes.forEach(e => e.syl = null); borrowText(notes, track, name, warn); }
      else fillText(notes, track);
    }
    // bars where the music can be cut cleanly: nothing (a rest, a tied note) runs across them; and every bar,
    // where a note or rest that runs across it may end the line (a page turned while it is held)
    const clean = bars.filter(b => events[b.ev] && near(events[b.ev].t0, b.t));
    return { events, clefInfo, editionClef, fifths: shown, bars: clean, every: bars.filter(b => events[b.ev]), lens };
  }

  // ---------------------------------------------------------------- clefs
  // how often the sources use each clef: the chiavi naturali first, then the chiavette, then the rare ones
  const CLEF_RARITY = { C1: 0, C3: 0, C4: 0, F4: 0, G2: 0.4, C2: 0.4, F3: 0.4, C5: 1.2, F5: 1.2, G1: 1.5 };
  function clefFit(name, dias) {
    const [line, ref] = CLEFS[name]; let out = 0, spread = 0;
    for (const d of dias) { const p = line + (d - ref); if (p < 0 || p > 14) out++; spread += Math.abs(p - 7); }
    return out * 1000 + spread / Math.max(1, dias.length);
  }
  // modern clefs for learners, as in choral editions: soprano and alto in treble, tenor in treble an octave
  // lower, bass in F4. By the voice's name, else the edition's own clef, else the average pitch.
  function modernClef(name, ed, dias) {
    const label = partLabel(name);
    if (label === 'CANTVS' || label === 'ALTVS') return 'G2';
    if (label === 'TENOR') return 'G2-8';
    if (label === 'BASSVS') return 'F4';
    if (ed && ed.sign === 'G') return ed.octave < 0 ? 'G2-8' : 'G2';
    if (ed && ed.sign === 'F') return 'F4';
    const mean = dias.reduce((s, d) => s + d, 0) / Math.max(1, dias.length);
    return !dias.length || mean >= 29 ? 'G2' : mean >= 25 ? 'G2-8' : 'F4';
  }
  // The font reaches only one ledger line past the staff: a part that goes further in the edition's clef
  // gets the clef a scribe would have used, a common one that keeps every note within that reach.
  function chooseClef(info, dias, override, name, note) {
    if (override && override !== 'auto') { if (!CLEFS[override]) throw new Error(`Unknown clef ${override}`); return override; }
    // the file's clef, if the font has it and every note fits on the staff
    const own = info && info.octave === 0 && CLEFS[info.sign + info.line] ? info.sign + info.line : null;
    if (!override && own && clefFit(own, dias) < 1000) return own;
    const score = c => clefFit(c, dias) + CLEF_RARITY[c];
    const best = Object.keys(CLEF_RARITY).sort((a, b) => score(a) - score(b) || a.localeCompare(b))[0];
    if (!override) note(name, info ? `${info.sign}${info.line}${info.octave ? (info.octave < 0 ? ' octave lower' : ' octave higher') : ''}` : '', best);
    return best;
  }

  // ---------------------------------------------------------------- tokens
  // a: accidental, g: the sign itself, d: dot/fermata after it, k: pitch key (for the custos), s/y: syllable + syllabic
  function tokens(parsed, clefName, o, warn) {
    const [line, ref, glyph] = CLEFS[clefName];
    // the font draws one ledger line above and below the staff; past that, layout adds the lines (lp)
    // when ledgers are on, else the note is drawn at the nearest position it has
    const placeOf = (dia, where) => {
      const p = line + (dia - ref);
      if (p >= 0 && p <= 14) return { k: PITCH_KEYS[p] };
      if (!o.ledgers) warn(`${where}: this note is out of the font’s range in ${clefName}, so it was placed at the nearest position. Turn on “Add ledger lines” under Notation to draw it at its pitch.`);
      return { k: PITCH_KEYS[Math.max(0, Math.min(14, p))], lp: o.ledgers ? p : undefined };
    };
    let sig = '';
    if (parsed.fifths < 0) {
      for (const st of ['B', 'E', 'A', 'D', 'G', 'C', 'F'].slice(0, -parsed.fifths))
        for (let p = 3; p <= 11; p++) if (mod(p - line + ref, 7) === STEP[st]) sig += 'b' + PITCH_KEYS[p];
    }
    const out = [], at = [];
    for (const e of parsed.events) {
      at.push(out.length);
      if (e.kind === 'mens') out.push({ t: 'm', g: e.code });
      else if (e.kind === 'bar') out.push({ t: 'b', g: 'B' });
      else if (e.kind === 'sec') out.push({ t: 'b', g: 'E' });
      else if (e.kind === 'repeat') out.push({ t: 'b', g: 'R' });
      else if (e.kind === 'bracket') out.push({ t: 'x', g: e.code });
      else if (e.kind === 'rest') { for (const [, k] of values(e.ql / o.reduction, true, e.perfect, e.where, warn)) out.push({ t: 'r', g: k + 'g' }); }
      else if (e.kind === 'note') {
        const { k, lp } = placeOf(e.dia, e.where); let first = true;
        for (const [kind, v] of values(e.ql / o.reduction, false, e.perfect, e.where, warn)) {
          if (kind === 'dot') { out[out.length - 1].d += '.' + k; continue; }
          const tk = { t: 'n', a: '', g: v + k, d: '', k };
          if (lp !== undefined) { tk.lp = lp; tk.v = v; }
          // (for playback: when it sounds and how long, in the edition's quarter notes from the start, and its pitch)
          if (first) { if (e.acc) tk.a = e.acc + k; if (e.syl) { tk.s = e.syl.text; tk.y = e.syl.syllabic; } tk.pb = [e.t0, e.ql, e.midi]; }
          out.push(tk); first = false;
        }
        if (e.fermata) out[out.length - 1].d += '*';
      }
    }
    out.push({ t: 'b', g: 'E' });
    // step -> the token that starts that bar, where the layout may cut (cuts: cleanly; loose: after whatever runs across it)
    const cuts = {}, loose = {};
    for (const b of parsed.bars) cuts[b.step] = at[b.ev];
    for (const b of parsed.every) loose[b.step] = at[b.ev];
    return { clef: glyph, sig, tokens: out, cuts, loose };
  }

  // ---------------------------------------------------------------- "ij" repeat signs
  // As in the sources: a phrase sung again straight away is not written out; "ij" stands under its
  // first note and the rest of the repeat carries no text. The longest repeated phrase wins.
  const IJ_MAX = 8;   // words
  function markRepeats(toks) {
    const words = [];
    for (const t of toks) {
      if (!t.s) continue;
      if (!words.length || t.y === 'single' || t.y === 'begin' || words[words.length - 1].done) words.push({ syl: [], done: false });
      const w = words[words.length - 1]; w.syl.push(t);
      if (t.y === 'single' || t.y === 'end') w.done = true;
    }
    const norm = w => w.syl.map(t => t.s).join('').toLowerCase().replace(/[^\p{L}]/gu, '').replace(/j/g, 'i').replace(/v/g, 'u');
    const key = words.map(norm);
    const same = (a, b, n) => { for (let k = 0; k < n; k++) if (!key[a + k] || key[a + k] !== key[b + k]) return false; return true; };
    // a repeat starts a phrase: after punctuation, when the text has any (so "eleison, Christe" is not one)
    const ends = words.map(w => /[,.;:!?]\s*$/.test(w.syl[w.syl.length - 1].s));
    const phraseStart = ends.some(Boolean) ? i => ends[i - 1] : () => true;
    let count = 0;
    for (let i = 1; i < words.length;) {
      if (!phraseStart(i)) { i++; continue; }
      let n = Math.min(IJ_MAX, i, words.length - i);
      while (n > 0 && !(same(i - n, i, n) && (i === n || phraseStart(i - n)))) n--;
      if (!n) { i++; continue; }
      words.slice(i, i + n).forEach((w, k) => w.syl.forEach((t, j) => { if (k || j) { delete t.s; delete t.y; } else { t.s = 'ij'; t.y = 'single'; } }));
      i += n; count++;
    }
    return count;
  }

  // ---------------------------------------------------------------- the voices in step
  // A bar one voice makes shorter or longer than the others (a dropped rest, a misread value: the usual faults of
  // scanned and converted scores) puts it out of step with them from there on. Each bar is checked against the
  // length most voices give it, or, where they are evenly split, the time signature's.
  const VALUE_NAMES = [[8, 'maxima', 'maximas'], [4, 'longa', 'longas'], [2, 'breve', 'breves'], [1, 'semibreve', 'semibreves'], [0.5, 'minim', 'minims'], [0.25, 'semiminim', 'semiminims'], [0.125, 'fusa', 'fusas']];
  // a length in semibreves, named by its values ("a breve and a minim"); one that no values make exactly
  // (the stray fractions of converted scores) is named by the nearest, as "about" it
  function valueName(sb) {
    const exact = Math.abs(sb * 8 - Math.round(sb * 8)) < 1e-6, near8 = Math.round(sb * 8) / 8;
    if (!exact && !near8) return 'a fraction of a note';
    const out = []; let left = exact ? sb : near8;
    for (const [v, one, many] of VALUE_NAMES) {
      const k = Math.floor((left + 1e-6) / v);
      if (k) { out.push(k > 1 ? `${k} ${many}` : `a ${one}`); left -= k * v; }
    }
    return (exact ? '' : 'about ') + out.join(' and ');
  }
  function checkBars(voices, reduction, warn) {
    if (voices.length < 2) return;
    const n = Math.max(...voices.map(v => v.lens.length));
    const short = voices.filter(v => v.lens.length < n);
    if (short.length && short.length < voices.length) for (const v of short) warn(`${v.label} has ${v.lens.length} bars, but the other voices have ${n}. A bar may be missing.`);
    const off = new Map(voices.map(v => [v, []]));
    for (let i = 0; i < n; i++) {
      const here = voices.filter(v => v.lens[i]), count = new Map();
      for (const v of here) { const k = Math.round(v.lens[i].len * 1e4); count.set(k, (count.get(k) || 0) + 1); }
      const top = Math.max(...count.values()), most = [...count].filter(([, c]) => c === top).map(([k]) => k);
      const meter = Math.round(here[0].lens[i].meter * 1e4);
      const ref = most.length === 1 ? most[0] : most.includes(meter) ? meter : null;
      if (ref === null) continue;
      for (const v of here) {
        const d = Math.round(v.lens[i].len * 1e4) - ref;
        if (d) off.get(v).push(`m. ${v.lens[i].mno} (${valueName(Math.abs(d) / 1e4 / reduction)} ${d < 0 ? 'short' : 'long'})`);
      }
    }
    for (const [v, bars] of off) if (bars.length)
      warn(`${v.label} is out of step with the other voices in ${bars.length > 1 ? bars.length + ' bars' : 'one bar'}: ${bars.slice(0, 6).join(', ')}${bars.length > 6 ? `, and ${bars.length - 6} more` : ''}. Look for a missing note or rest, or one with the wrong value.`);
  }

  // ---------------------------------------------------------------- main
  // o: { reduction, transpose, mensuration, ficta, barlines, brackets, ij, parts: [{index, clef, label}] }
  function convert(doc, o) {
    const warnings = [], warn = m => { if (!warnings.includes(m)) warnings.push(m); };
    const tr = transposition(o.transpose || 0);
    const info = inspect(doc);
    const partEls = kids(doc.documentElement, 'part');
    const sections = findSections(o.parts.map(sel => partEls[info.parts[sel.index].part]), o.repeats);
    const secSteps = new Set(sections.map(s => s.step));
    const parts = [], clefs = [], lens = [];
    for (const sel of o.parts) {
      const entry = info.parts[sel.index], el = partEls[entry.part], name = entry.name, label = sel.label || partLabel(name);
      if (entry.split) warn(`${entry.split.staff}: two voices share this staff, so they were separated by pitch into ${entry.split.pair.join(' and ')}. Check the places where they cross.`);
      const parsed = readPart(el, name, o, tr, warn, entry.split, secSteps);
      const dias = parsed.events.filter(e => e.kind === 'note').map(e => e.dia);
      const clefName = o.clefs === 'modern' && !sel.clef ? modernClef(name, parsed.editionClef, dias)
        : chooseClef(parsed.clefInfo, dias, sel.clef, name, (n, from, to) => clefs.push(`${label} ${to}${from ? ` (edition: ${from})` : ''}`));
      parts.push({ name, label, clefName, ...tokens(parsed, clefName, o, warn) });
      lens.push({ label, lens: parsed.lens });
    }
    checkBars(lens, o.reduction || 1, warn);
    // each section's tokens in a part (the first from the start, as an incipit has no bar of its own)
    const slice = (p, k) => p.tokens.slice(k ? p.cuts[sections[k].step] : 0, k + 1 < sections.length ? p.cuts[sections[k + 1].step] : undefined);
    sections.forEach((s, k) => {
      s.auto = !s.name;
      for (const p of parts) if (!s.name && (k === 0 || p.cuts[s.step] !== undefined)) s.name = sectionName(slice(p, k));
    });
    // "ij" within a section only: a new section starts its text afresh
    if (o.ij) for (const p of parts) sections.forEach((s, k) => { if (!k || p.cuts[s.step] !== undefined) markRepeats(slice(p, k)); });
    // not a problem, but worth knowing: one note for all the parts
    const notes = clefs.length ? [`The font only reaches one ledger line beyond the staff, so these parts get a clef that keeps them on it, as a scribe would have done: ${clefs.join(', ')}. You can pick a different clef in the voices table, or switch to modern clefs under Notation.`] : [];
    return { parts, sections: sections.length > 1 ? sections : [], warnings, notes };
  }

  global.SPConvert = { parseScore, inspect, convert, partLabel, CLEFS, CLEF_NAMES, MENS };
})(window);
