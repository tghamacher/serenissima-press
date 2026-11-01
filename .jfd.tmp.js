const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:8765/index.html?score=test/scores/joseph-fili-david.musicxml&format=choirbook'); await p.waitForTimeout(7000);
  const res = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('#book .sp-page').forEach((pg, i) => {
      const t = pg.querySelectorAll('.sp-syl'); out.push(i + ': ' + [...t].map(s => s.textContent).filter(x => /men|A$/.test(x)).join(' | '));
    });
    return out;
  });
  console.log(res.join('\n'));
  console.log('warnings', await p.evaluate(() => document.getElementById('status').innerText.slice(0, 600)));
  await b.close();
})();
