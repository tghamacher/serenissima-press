// Runs the cases in cases.js, one at a time, in the frame: each loads the app with its score and settings, adds
// any chant through the app's own controls, waits for the book to settle, and checks it. The summary goes in the
// page title too (PASS n/n or FAIL k/n), and a plain report in #report, for a headless browser's --dump-dom.
(function () {
  'use strict';
  const frame = document.getElementById('frame'), only = new URLSearchParams(location.search).get('only');
  const pause = ms => new Promise(r => setTimeout(r, ms));

  // the app in the frame, once its book has stopped changing (typesetting waits 250 ms, then renders)
  async function settled(win, timeout = 60000) {
    const t0 = Date.now(); let last = null, same = 0;
    for (;;) {
      await pause(150);
      const d = win.document, book = d.getElementById('book'), status = d.getElementById('status');
      const done = book && !book.classList.contains('sp-busy') && (book.querySelector('.sp-page') || status.querySelector('.err'));
      const sig = done ? book.innerHTML.length + '|' + status.textContent.length : null;
      if (sig && sig === last) { if (++same >= 4) return; } else same = 0;
      last = sig;
      if (Date.now() - t0 > timeout) throw new Error('The book did not settle within ' + timeout / 1000 + ' s.');
    }
  }
  function load(url) {
    return new Promise((res, rej) => {
      frame.onload = () => { frame.contentWindow.addEventListener('error', e => (frame.errors = frame.errors || []).push(e.message)); res(frame.contentWindow); };
      frame.onerror = rej; frame.errors = []; frame.src = url;
    });
  }
  // a chant added as a user would: the button, then its fields
  async function addChant(win, c) {
    const d = win.document;
    d.getElementById('addChant').click();
    const box = [...d.querySelectorAll('#chants .sp-chant')].pop(), [where, who] = box.querySelectorAll('select');
    const set = (el, v, ev) => { el.value = v; el.dispatchEvent(new win.Event(ev)); };
    if (c.after !== undefined) set(where, String(c.after), 'change');
    // a voice by its label, as the menu shows it
    if (c.voice !== undefined) { const o = [...who.options].find(o => o.text === c.voice || o.value === String(c.voice)); if (!o) throw new Error(`No voice ${c.voice} to sing the chant (there are ${[...who.options].map(o => o.text).join(", ")}).`); set(who, o.value, 'change'); }
    set(box.querySelector('textarea'), c.gabc, 'input');
    await settled(win);
  }

  // what is wrong with the book in the frame, by the checks every case has, and its own
  function inspect(win, cs) {
    const d = win.document, bad = [], book = d.getElementById('book');
    const err = d.querySelector('#status .err');
    if (err) bad.push('Error shown: ' + err.textContent);
    if (frame.errors.length) bad.push('Script errors: ' + frame.errors.join('; '));
    const pages = [...book.querySelectorAll('.sp-page')];
    if (!pages.length) bad.push('No pages.');
    // nothing set beyond the edge of its page (the preview's scaling scales both alike)
    let over = 0; const first = [];
    for (const pg of pages) {
      const r = pg.getBoundingClientRect(), tol = 1.5;
      for (const el of pg.querySelectorAll('.sp-staff, .sp-syl, .sp-tacet, .sp-residuum')) {
        const e = el.getBoundingClientRect(); if (!e.width && !e.height) continue;
        if (e.bottom > r.bottom + tol || e.right > r.right + tol || e.top < r.top - tol || e.left < r.left - tol) {
          over++; if (first.length < 3) first.push(`${el.className} on page ${pages.indexOf(pg) + 1}`);
        }
      }
    }
    if (over) bad.push(`${over} thing(s) beyond the page: ${first.join(', ')}`);
    const warnings = [...d.querySelectorAll('#status .sp-notice:not(.err):not(.info) li')].map(li => li.textContent);
    const ex = cs.expect || {};
    if (ex.warnings !== undefined && warnings.length !== ex.warnings) bad.push(`${warnings.length} warning(s), expected ${ex.warnings}${warnings.length ? ': ' + warnings.slice(0, 4).join(' | ') : ''}`);
    if (ex.warn) for (const w of [].concat(ex.warn)) if (!warnings.some(x => w.test(x))) bad.push(`No warning matching ${w}`);
    if (ex.pages && (pages.length < ex.pages[0] || pages.length > ex.pages[1])) bad.push(`${pages.length} pages, expected ${ex.pages[0]}–${ex.pages[1]}`);
    if (cs.check) { try { bad.push(...(cs.check(d, { pages, warnings }) || [])); } catch (e) { bad.push('Check failed: ' + e.message); } }
    return { bad, info: `${pages.length} pages, ${warnings.length} warning(s)` };
  }

  // a book saved as a project, then opened in a fresh app (as a file, and from what the browser kept), must come
  // out the same: its pages, its words and its warnings
  const print = d => ({ pages: d.querySelectorAll('#book .sp-page').length, text: d.getElementById('book').textContent, status: d.getElementById('status').textContent });
  async function roundTrip(win, cs) {
    const before = print(win.document), bad = [];
    // the download, caught
    let href = null; const orig = win.HTMLAnchorElement.prototype.click;
    win.HTMLAnchorElement.prototype.click = function () { if (this.download) href = this.href; else orig.call(this); };
    win.document.getElementById('saveProject').click();
    if (!href) return { bad: ['Save project made no download'], info: '' };
    const json = await (await win.fetch(href)).text();
    await pause(1500);   // what the browser keeps is written a second after the last change
    const same = (d, how) => {
      const after = print(d);
      if (after.pages !== before.pages) bad.push(`${how}: ${after.pages} pages, before ${before.pages}`);
      if (after.text !== before.text) bad.push(`${how}: the book's words differ (${after.text.length} characters, before ${before.text.length})`);
      if (after.status !== before.status) bad.push(`${how}: the warnings differ`);
    };
    // opened as a file
    win = await load('../index.html');
    const input = win.document.getElementById('file'), dt = new win.DataTransfer();
    dt.items.add(new win.File([json], 'test.serenissima', { type: 'application/json' }));
    input.files = dt.files; input.dispatchEvent(new win.Event('change'));
    await settled(win);
    same(win.document, 'Opened as a file');
    // picked up from the browser: where its storage answers (a headless browser on virtual time never lets it)
    const storage = await Promise.race([new Promise(res => { try { const r = indexedDB.open('sp-probe'); r.onsuccess = () => res(true); r.onerror = () => res(false); } catch (e) { res(false); } }), pause(3000).then(() => false)]);
    let note = '';
    if (storage) {
      win = await load('../index.html');
      const t0 = Date.now();
      while (win.document.getElementById('resumeHint').hidden && Date.now() - t0 < 10000) await pause(100);
      if (win.document.getElementById('resumeHint').hidden) bad.push('No offer to pick up where you left off');
      else { win.document.getElementById('resume').click(); await settled(win); same(win.document, 'Picked up'); }
    } else note = '; picking up skipped: no browser storage here';
    if (cs.check) bad.push(...(cs.check(win.document, JSON.parse(json)) || []));
    return { bad, info: `${before.pages} pages, project ${Math.round(json.length / 1024)} KB${note}` };
  }

  async function runCase(cs) {
    if (cs.unit) return { bad: cs.unit() || [], info: '' };
    const q = new URLSearchParams();
    for (const s of [].concat(cs.score)) q.append('score', s);
    if (cs.format) q.set('format', cs.format);
    if (cs.style) q.set('style', cs.style);
    if (cs.chants) q.set('chant', '1');   // chant is set aside unless asked for
    let win = await load('../index.html?' + q);
    await settled(win);
    for (const c of cs.chants || []) await addChant(win, c);
    if (cs.setup) { await cs.setup(win.document, win); await settled(win); }
    if (cs.roundTrip) return roundTrip(win, cs);
    const r = inspect(win, cs);
    // a case that shows a check works: it must fail, and for that reason
    if (cs.failsWith) return r.bad.some(b => cs.failsWith.test(b)) ? { bad: [], info: 'caught: ' + r.bad.join('; ') } : { bad: ['Not caught' + (r.bad.length ? ': ' + r.bad.join('; ') : '')], info: '' };
    return r;
  }

  (async () => {
    const tb = document.getElementById('results'), lines = [];
    const cases = window.CASES.filter(c => !only || c.name.includes(only));
    let fails = 0;
    for (const cs of cases) {
      const tr = tb.insertRow(); tr.insertCell().textContent = cs.name;
      const res = tr.insertCell(), det = tr.insertCell(); res.textContent = '…';
      let r;
      try { r = await runCase(cs); } catch (e) { r = { bad: [e.message], info: '' }; }
      const ok = !r.bad.length; if (!ok) fails++;
      res.textContent = ok ? 'pass' : 'FAIL'; res.className = ok ? 'ok' : 'bad';
      if (ok) det.textContent = r.info;
      else { const ul = document.createElement('ul'); r.bad.forEach(b => { const li = document.createElement('li'); li.textContent = b; ul.append(li); }); det.append(ul); }
      lines.push(`${ok ? 'pass' : 'FAIL'}  ${cs.name}${ok ? (r.info ? '  (' + r.info + ')' : '') : '\n      ' + r.bad.join('\n      ')}`);
    }
    const sum = document.getElementById('summary'), n = cases.length;
    sum.textContent = fails ? `${fails} of ${n} failed` : `All ${n} passed`;
    sum.className = fails ? 'fail' : 'pass';
    document.title = fails ? `FAIL ${fails}/${n}` : `PASS ${n}/${n}`;
    const pre = document.createElement('pre'); pre.id = 'report'; pre.hidden = true;
    pre.textContent = `${document.title}\n${lines.join('\n')}`; document.body.append(pre);
  })();
})();
