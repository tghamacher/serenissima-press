// Playback: the book's notes sounded in the browser (Web Audio, no samples) and lit on the page as they sound.
// Each note's element carries data-pb="start length midi" (start and length in semibreves on the book's one
// timeline, see app.js) and data-v, its voice. The tempo is the tactus: semibreves a minute.
(function (global) {
  'use strict';
  const LOOKAHEAD = 1.0, TICK = 50;   // seconds scheduled ahead; ms between scheduling passes
  let ac = null, out = null, wave = null;
  let notes = [], voices = [], book = null;
  let playing = false, startAt = 0, from = 0, next = 0, timer = 0, raf = 0, sounding = [], lit = new Set(), followed = null, handAt = 0, fv = null;
  // the reader scrolling by hand: the view stops following the notes for a while
  const HAND = 4000;
  for (const ev of ['wheel', 'touchmove']) global.addEventListener(ev, () => { handAt = Date.now(); }, { passive: true });
  global.addEventListener('keydown', e => { if (/^(Page|Arrow(Up|Down)|Home|End)/.test(e.key)) handAt = Date.now(); });
  const opts = { tempo: 66, muted: new Set(), onchange: () => { } };

  // the notes on the page, in order of time
  function load(el) {
    stop();
    book = el;
    notes = [...el.querySelectorAll('.sp-n[data-pb]')].map(n => {
      const [on, len, midi] = n.dataset.pb.split(' ').map(Number);
      return { on, len, midi, v: n.dataset.v, el: n };
    }).sort((a, b) => a.on - b.on);
    voices = [...new Set(notes.map(n => n.v))];
    return { notes: notes.length, voices };
  }
  const sec = sb => sb * 60 / opts.tempo;
  const pos = () => playing ? from + (ac.currentTime - startAt) * opts.tempo / 60 : from;
  const end = () => notes.reduce((m, n) => Math.max(m, n.on + n.len), 0);

  // a soft organ-like tone: a few harmonics, a gentle attack and release; each voice a little apart in the stereo field
  function audio() {
    if (ac) return;
    ac = new (global.AudioContext || global.webkitAudioContext)();
    const comp = ac.createDynamicsCompressor(), master = ac.createGain();
    master.gain.value = 0.9; master.connect(comp); comp.connect(ac.destination); out = master;
    wave = ac.createPeriodicWave(new Float32Array([0, 1, 0.42, 0.2, 0.1, 0.05, 0.025]), new Float32Array(7));
  }
  function sound(n, t0) {
    const t1 = t0 + Math.max(0.06, sec(n.len) - 0.03), vi = voices.indexOf(n.v), k = voices.length;
    const o = ac.createOscillator(), g = ac.createGain(), p = ac.createStereoPanner ? ac.createStereoPanner() : null;
    o.setPeriodicWave(wave); o.frequency.value = 440 * 2 ** ((n.midi - 69) / 12);
    const peak = 0.5 / Math.max(2, k);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + 0.03);
    g.gain.setValueAtTime(peak, t1 - 0.02); g.gain.linearRampToValueAtTime(0, t1 + 0.06);
    o.connect(g);
    if (p) { p.pan.value = k > 1 ? (vi / (k - 1) - 0.5) * 0.8 : 0; g.connect(p); p.connect(out); } else g.connect(out);
    o.start(t0); o.stop(t1 + 0.08); sounding.push(o);
    o.onended = () => { const i = sounding.indexOf(o); if (i >= 0) sounding.splice(i, 1); };
  }
  // schedule what falls in the next LOOKAHEAD seconds
  function schedule() {
    const horizon = pos() + LOOKAHEAD * opts.tempo / 60;
    while (next < notes.length && notes[next].on < horizon) {
      const n = notes[next++];
      if (n.on + n.len <= from || opts.muted.has(n.v)) continue;
      const at = startAt + sec(Math.max(0, n.on - from));
      // a note already under way when playing starts sounds for the rest of its length
      sound(n.on < from ? { ...n, len: n.on + n.len - from } : n, at);
    }
    if (pos() > end() + 0.5) stop(true);
  }
  // keep a note in view, below the playing bar pinned at the top of the window
  function follow(el) {
    if (el === followed || Date.now() - handAt < HAND) return;
    followed = el;
    const bar = document.querySelector('.sp-player:not([hidden])');
    const top = bar ? bar.getBoundingClientRect().bottom : 0, r = el.getBoundingClientRect();
    if (r.top < top + 12 || r.bottom > global.innerHeight - 24)
      global.scrollBy({ top: r.top - top - (global.innerHeight - top) / 3, behavior: 'smooth' });
  }
  // light the notes sounding now; keep the newest in view
  function frame() {
    const t = pos(), now = new Set();
    let i = 0; while (i < notes.length && notes[i].on <= t) { const n = notes[i++]; if (t < n.on + n.len && !opts.muted.has(n.v)) now.add(n.el); }
    for (const e of lit) if (!now.has(e)) e.classList.remove('sp-playing');
    for (const e of now) e.classList.add('sp-playing');
    lit = now;
    // follow one voice, through its rests too: in partbooks the voices sounding together are in different books
    const on = [...now];
    if (fv === null || opts.muted.has(fv)) fv = on.length ? on[0].dataset.v : null;
    const el = on.find(e => e.dataset.v === fv);
    if (el) follow(el);
    if (playing) raf = requestAnimationFrame(frame);
  }

  function play(at, voice) {
    if (!notes.length) return;
    audio();
    if (ac.state === 'suspended') ac.resume();
    if (playing) pause();
    if (at !== undefined) from = at;
    if (from >= end()) from = 0;
    playing = true; startAt = ac.currentTime + 0.08; followed = null; handAt = 0; if (voice !== undefined) fv = voice;
    // from the first note still sounding here (one begun before it sounds for the rest of its length)
    next = Math.max(0, notes.findIndex(n => n.on + n.len > from));
    schedule(); timer = setInterval(schedule, TICK); raf = requestAnimationFrame(frame);
    opts.onchange();
  }
  function silence() {
    clearInterval(timer); cancelAnimationFrame(raf);
    for (const o of sounding.splice(0)) { try { o.stop(); } catch (e) { } }
  }
  function pause() {
    if (!playing) return;
    from = pos(); playing = false; silence(); opts.onchange();
  }
  function stop(atEnd) {
    const was = playing; playing = false; silence();
    from = 0; fv = null; for (const e of lit) e.classList.remove('sp-playing'); lit = new Set();
    if (was || atEnd) opts.onchange();
  }
  // a new tempo, or voices muted, take effect from where playing has got to
  function changed() { if (playing) { const t = pos(); pause(); play(t); } }

  global.SPPlay = {
    load, play, pause, stop,
    get playing() { return playing; },
    get position() { return pos(); },
    get notes() { return notes; },
    get voices() { return voices; },
    set tempo(v) { opts.tempo = Math.max(10, Math.min(240, +v || 66)); changed(); },
    get tempo() { return opts.tempo; },
    mute(v, on) { if (on) opts.muted.add(v); else opts.muted.delete(v); changed(); },
    set onchange(f) { opts.onchange = f; },
    // the notes sounding at a time, in semibreves (for the tests: no audio needed)
    at: t => notes.filter(n => n.on <= t && t < n.on + n.len)
  };
})(window);
