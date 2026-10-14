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
    if (doc.getElementsByTagName('parsererror').length) throw new Error('This file is not valid XML.');
    const root = doc.documentElement;
    if (root.localName === 'score-timewise') throw new Error('Timewise MusicXML is not supported. Export as standard (partwise) MusicXML.');
    if (root.localName !== 'score-partwise') throw new Error('This is not a MusicXML score.');
    return doc;
  }

  // Quick look at a score: title, composer, parts, suggested settings
  function inspect(doc) {
    const root = doc.documentElement;
    const title = [kid(root, 'work', 'work-title'), kid(root, 'movement-title')].map(text).find(Boolean) || '';
    const composer = text(kids(kid(root, 'identification'), 'creator').find(c => c.getAttribute('type') === 'composer'));
    const names = {};
    for (const sp of kids(kid(root, 'part-list'), 'score-part')) names[sp.getAttribute('id')] = (text(kid(sp, 'part-name')) || sp.getAttribute('id')).replace(/\s+/g, ' ');
    const parts = kids(root, 'part').map((p, i) => {
      const name = names[p.getAttribute('id')] || `Part ${i + 1}`;
      const staves = p.querySelector('attributes > staves');
      const keyboard = /piano|rehearsal|reduction|keyboard|organ/i.test(name) || (staves && +text(staves) > 1);
      return { index: i, name, label: partLabel(name), keyboard };
    });
    // note values: x/2 or x/1 time (or breves) usually means original values; x/4 usually halved
    const beatType = +text(root.querySelector('time > beat-type')) || 4;
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
    if (left > 1e-6) warn(`${where}: ${+sb.toFixed(4)} semibreves can't be written exactly; ${+left.toFixed(4)} dropped.`);
    else if (out.length > 1 && !isRest) warn(`${where}: ${+sb.toFixed(4)} semibreves split into ${out.length} notes (tie or odd value). Check it.`);
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
    if (beats === 6) { warn(`Time ${beats}/${type}: the font has no prolatio major sign (C or O with a dot); used C.`); return 'T1'; }
    if ([1, 2, 4].includes(beats)) return 'T1';
    warn(`Time ${beats}/${type} has no obvious mensuration sign; used C.`); return 'T1';
  }

  // ---------------------------------------------------------------- read one part into events
  function readPart(partEl, name, o, tr, warn) {
    const events = [];
    let divisions = 1, clefInfo = null, fifths = 0, shown = Math.min(tr.fifths, 0), voice = null, tie = null, perfect = false;
    for (const measure of kids(partEl, 'measure')) {
      const mno = measure.getAttribute('number'), edMem = {};
      for (const node of measure.children) {
        switch (node.localName) {
          case 'attributes': {
            const d = kid(node, 'divisions'); if (d) divisions = +text(d);
            const k = kid(node, 'key', 'fifths');
            if (k) {
              if (events.length) warn(`${name} m.${mno}: key change; signature not reprinted, accidentals follow the new key.`);
              fifths = +text(k); shown = fifths + tr.fifths;
              if (shown > 0) { warn(`${name}: the key needs ${shown} sharp(s); mensural notation has no sharp signatures, so each sharp is printed on its note. Consider transposing.`); shown = 0; }
            }
            const c = kids(node, 'clef').find(c => !c.getAttribute('number') || c.getAttribute('number') === '1');
            if (c) {
              const ci = { sign: text(kid(c, 'sign')), line: +text(kid(c, 'line')) || 0, octave: +text(kid(c, 'clef-octave-change')) || 0 };
              if (!clefInfo) clefInfo = ci; else if (ci.sign !== clefInfo.sign || ci.line !== clefInfo.line) warn(`${name} m.${mno}: clef change ignored (kept the first clef).`);
            }
            const t = kid(node, 'time');
            if (t && kid(t, 'beats')) {
              const sign = (o.mensuration && !events.length) ? o.mensuration : mensSign(t, o.reduction, warn);
              const beats = +(text(kid(t, 'beats')).split('+')[0]), type = +text(kid(t, 'beat-type'));
              perfect = sign === 'T3' || sign === 'T4' || (beats === 3 && near(beats * 4 / type / o.reduction, 3));
              events.push({ kind: 'mens', code: sign });
            }
            break;
          }
          case 'direction':
            if (!o.brackets) break;
            for (const br of node.querySelectorAll('direction-type > bracket')) {
              if (br.getAttribute('type') === 'start') events.push({ kind: 'bracket', code: '{' });
              else if (br.getAttribute('type') === 'stop') events.push({ kind: 'bracket', code: '}' });
            }
            break;
          case 'note': {
            if (kid(node, 'grace')) { warn(`${name} m.${mno}: grace note skipped.`); break; }
            const v = text(kid(node, 'voice')) || '1';
            if (voice === null) voice = v;
            if (v !== voice) break;
            if (kid(node, 'chord')) { warn(`${name} m.${mno}: chord note skipped (one line per part).`); break; }
            const dur = kid(node, 'duration'); if (!dur) break;
            const ql = +text(dur) / divisions;
            const fermata = !!kid(node, 'notations', 'fermata');
            const where = `${name} m.${mno}`;
            if (kid(node, 'rest')) {
              // consecutive rests merge, so long silences come out as longa + breve rests as in the sources
              const prev = events[events.length - 1];
              if (prev && prev.kind === 'rest') prev.ql += ql; else events.push({ kind: 'rest', ql, where, perfect });
              tie = null; break;
            }
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
              if (Math.abs(alter2) > 1) warn(`${where}: double sharp/flat can't be shown.`);
              accKey = alter2 > key2 ? '+' : 'b';
            }
            const ties = kids(node, 'tie').map(t => t.getAttribute('type'));
            if (tie && ties.includes('stop') && tie.dia === dia) {
              tie.ql += ql; if (fermata) tie.fermata = true;
              if (!ties.includes('start')) tie = null;
              break;
            }
            let syl = null;
            const lyr = kids(node, 'lyric').find(l => l.getAttribute('number') === '1') || kid(node, 'lyric');
            if (lyr) {
              const t = kids(lyr, 'text').map(e => e.textContent).join(' ').trim();
              if (t) syl = { text: t, syllabic: text(kid(lyr, 'syllabic')) || 'single' };
            }
            const ev = { kind: 'note', dia, ql, acc: accKey, fermata, syl, where, perfect };
            events.push(ev);
            tie = ties.includes('start') ? ev : null;
            break;
          }
        }
      }
      if (o.barlines) events.push({ kind: 'bar' });
    }
    if (o.barlines && events.length && events[events.length - 1].kind === 'bar') events.pop();
    return { events, clefInfo, fifths: shown };
  }

  // ---------------------------------------------------------------- clefs
  function clefFit(name, dias) {
    const [line, ref] = CLEFS[name]; let out = 0, spread = 0;
    for (const d of dias) { const p = line + (d - ref); if (p < 0 || p > 14) out++; spread += Math.abs(p - 7); }
    return out * 1000 + spread / Math.max(1, dias.length);
  }
  function chooseClef(info, dias, override, name, warn) {
    if (override && override !== 'auto') { if (!CLEFS[override]) throw new Error(`Unknown clef ${override}`); return override; }
    // the file's clef, if the font has it and every note fits on the staff
    const own = info && info.octave === 0 && CLEFS[info.sign + info.line] ? info.sign + info.line : null;
    if (!override && own && clefFit(own, dias) < 1000) return own;
    const best = Object.keys(CLEFS).filter(c => !c.endsWith('-8')).sort((a, b) => clefFit(a, dias) - clefFit(b, dias) || a.localeCompare(b))[0];
    if (!override) {
      const from = info ? `${info.sign}${info.line}${info.octave ? ` (octave ${info.octave})` : ''}` : 'none';
      warn(own ? `${name}: some notes don't fit the file's clef ${from} in this font (it has no ledger lines), so ${best} was chosen.`
               : `${name}: the file's clef ${from} isn't in the font, so ${best} was chosen to fit the range.`);
    }
    return best;
  }

  // ---------------------------------------------------------------- tokens
  // a: accidental, g: the sign itself, d: dot/fermata after it, k: pitch key (for the custos), s/y: syllable + syllabic
  function tokens(parsed, clefName, o, warn) {
    const [line, ref, glyph] = CLEFS[clefName];
    const keyOf = (dia, where) => {
      let p = line + (dia - ref);
      if (p < 0 || p > 14) { warn(`${where}: note is off the staff in ${clefName} (it can't be drawn there); placed at the nearest position.`); p = Math.max(0, Math.min(14, p)); }
      return PITCH_KEYS[p];
    };
    let sig = '';
    if (parsed.fifths < 0) {
      for (const st of ['B', 'E', 'A', 'D', 'G', 'C', 'F'].slice(0, -parsed.fifths))
        for (let p = 3; p <= 11; p++) if (mod(p - line + ref, 7) === STEP[st]) sig += 'b' + PITCH_KEYS[p];
    }
    const out = [];
    for (const e of parsed.events) {
      if (e.kind === 'mens') out.push({ t: 'm', g: e.code });
      else if (e.kind === 'bar') out.push({ t: 'b', g: 'B' });
      else if (e.kind === 'bracket') out.push({ t: 'x', g: e.code });
      else if (e.kind === 'rest') { for (const [, k] of values(e.ql / o.reduction, true, e.perfect, e.where, warn)) out.push({ t: 'r', g: k + 'g' }); }
      else if (e.kind === 'note') {
        const k = keyOf(e.dia, e.where); let first = true;
        for (const [kind, v] of values(e.ql / o.reduction, false, e.perfect, e.where, warn)) {
          if (kind === 'dot') { out[out.length - 1].d += '.' + k; continue; }
          const tk = { t: 'n', a: '', g: v + k, d: '', k };
          if (first) { if (e.acc) tk.a = e.acc + k; if (e.syl) { tk.s = e.syl.text; tk.y = e.syl.syllabic; } }
          out.push(tk); first = false;
        }
        if (e.fermata) out[out.length - 1].d += '*';
      }
    }
    out.push({ t: 'b', g: 'E' });
    return { clef: glyph, sig, tokens: out };
  }

  // ---------------------------------------------------------------- main
  // o: { reduction, transpose, mensuration, ficta, barlines, brackets, parts: [{index, clef, label}] }
  function convert(doc, o) {
    const warnings = [], warn = m => { if (!warnings.includes(m)) warnings.push(m); };
    const tr = transposition(o.transpose || 0);
    const info = inspect(doc);
    const partEls = kids(doc.documentElement, 'part');
    const parts = [];
    for (const sel of o.parts) {
      const el = partEls[sel.index], name = info.parts[sel.index].name;
      const parsed = readPart(el, name, o, tr, warn);
      const dias = parsed.events.filter(e => e.kind === 'note').map(e => e.dia);
      const clefName = chooseClef(parsed.clefInfo, dias, sel.clef, name, warn);
      const built = tokens(parsed, clefName, o, warn);
      parts.push({ name, label: sel.label || partLabel(name), clefName, ...built });
    }
    return { parts, warnings };
  }

  global.SPConvert = { parseScore, inspect, convert, partLabel, CLEFS, CLEF_NAMES, MENS };
})(window);
