// The pages' surface: rag paper, as the printed books, or vellum, as the manuscripts. Each is drawn once on a
// canvas, at the page's shape, and used as the page's background (so it prints, if wanted, as an image under
// the music, which stays type). A few variants of each, seeded, so facing pages are not the same sheet.
(function (global) {
  'use strict';
  const LONG = 1400;   // pixels along the page's longer side
  const KINDS = {
    paper: { base: [244, 236, 216], mottle: 12, cloud: 7, edge: 20 },
    vellum: { base: [236, 222, 190], mottle: 26, cloud: 12, edge: 34 }
  };
  const cache = new Map();
  const random = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // smooth value noise on a grid of the given cell size
  function noise(w, h, cell, r) {
    const gw = Math.ceil(w / cell) + 2, g = Array.from({ length: gw * (Math.ceil(h / cell) + 2) }, r);
    const at = (x, y) => g[y * gw + x], s = t => t * t * (3 - 2 * t);
    return (x, y) => {
      const fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = s(fx - x0), ty = s(fy - y0);
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx, b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
      return a + (b - a) * ty;
    };
  }
  function draw(kind, W, H, seed) {
    const k = KINDS[kind], r = random(seed * 7919 + (kind === 'vellum' ? 7 : 3));
    // the colour and its mottling, worked at a quarter of the size (it is all soft) and drawn up smooth
    const w = Math.ceil(W / 4), h = Math.ceil(H / 4), low = document.createElement('canvas'); low.width = w; low.height = h;
    const big = noise(w, h, 55, r), mid = noise(w, h, 15, r), img = low.getContext('2d').createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const m = (big(x, y) - .5) * k.mottle + (mid(x, y) - .5) * k.cloud;
      // browner toward the edges, where it was handled and the air reached it
      const e = Math.max(0, .09 - Math.min(x / w, 1 - x / w, y / h, 1 - y / h)) / .09, edge = e * e * k.edge;
      const i = (y * w + x) * 4;
      d[i] = k.base[0] + m - edge * .7; d[i + 1] = k.base[1] + m - edge; d[i + 2] = k.base[2] + m * 1.1 - edge * 1.5; d[i + 3] = 255;
    }
    low.getContext('2d').putImageData(img, 0, 0);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(low, 0, 0, W, H);
    // the grain
    x.fillStyle = '#5a4520';
    for (let n = W * H / 60; n > 0; n--) { x.globalAlpha = r() * .07; x.fillRect(r() * W, r() * H, 1, 1); }
    if (kind === 'paper') {
      // the laid lines and chain lines of a sheet made by hand on a wire mould, and a few spots of foxing
      x.globalAlpha = .035; for (let y = 0; y < H; y += 4) x.fillRect(0, y, W, 1);
      x.globalAlpha = .045; for (let i = 40 + r() * 60; i < W; i += 150) x.fillRect(i, 0, 2, H);
      x.fillStyle = '#7a5528';
      for (let n = 0; n < 12; n++) { x.globalAlpha = .04 + r() * .05; x.beginPath(); x.arc(r() * W, r() * H, 1 + r() * 3, 0, 7); x.fill(); }
    } else {
      // the skin: follicles where the hair was, and faint veins
      x.fillStyle = '#7a5a2a';
      for (let n = W * H / 1800; n > 0; n--) { x.globalAlpha = .05 + r() * .08; x.fillRect(r() * W, r() * H, 1.3, 1.3); }
      x.strokeStyle = '#8a6a3a'; x.lineWidth = 2; x.globalAlpha = .025;
      for (let n = 0; n < 6; n++) {
        let px = r() * W, py = r() * H; x.beginPath(); x.moveTo(px, py);
        for (let s = 0; s < 8; s++) { px += (r() - .5) * 160; py += r() * 120; x.lineTo(px, py); }
        x.stroke();
      }
    }
    return c.toDataURL('image/jpeg', .86);
  }
  global.SPSurface = {
    // the surface for a page of this shape (any size: only the proportion counts), as a data URL; variant 0, 1, 2…
    texture(kind, width, height, variant = 0) {
      const W = width >= height ? LONG : Math.round(LONG * width / height), H = width >= height ? Math.round(LONG * height / width) : LONG;
      const key = [kind, W, H, variant].join('|');
      if (!cache.has(key)) cache.set(key, draw(kind, W, H, variant + 1));
      return cache.get(key);
    }
  };
})(window);
