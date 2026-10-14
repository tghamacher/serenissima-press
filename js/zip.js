// Minimal ZIP reader for compressed MusicXML (.mxl), using the browser's DecompressionStream.
// Handles the two methods .mxl files use: stored (0) and deflate (8).
(function (global) {
  'use strict';

  async function inflateRaw(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // Returns a Map of path -> async () => Uint8Array
  function readZip(buffer) {
    const bytes = new Uint8Array(buffer), view = new DataView(buffer);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a valid .mxl (zip) file.');
    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    const entries = new Map(), dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Damaged .mxl file.');
      const method = view.getUint16(p + 10, true), size = view.getUint32(p + 20, true);
      const nameLen = view.getUint16(p + 28, true), extraLen = view.getUint16(p + 30, true), commentLen = view.getUint16(p + 32, true);
      const local = view.getUint32(p + 42, true), name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      entries.set(name, async () => {
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        const data = bytes.subarray(start, start + size);
        if (method === 0) return data;
        if (method === 8) return inflateRaw(data);
        throw new Error('Unsupported compression in .mxl file.');
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  // Returns the MusicXML text inside an .mxl file
  async function readMxl(buffer) {
    const entries = readZip(buffer), dec = new TextDecoder();
    let root = null;
    if (entries.has('META-INF/container.xml')) {
      const xml = new DOMParser().parseFromString(dec.decode(await entries.get('META-INF/container.xml')()), 'application/xml');
      const rf = xml.getElementsByTagName('rootfile')[0];
      if (rf) root = rf.getAttribute('full-path');
    }
    if (!root || !entries.has(root)) root = [...entries.keys()].find(k => !k.startsWith('META-INF/') && /\.(xml|musicxml)$/i.test(k));
    if (!root) throw new Error('No MusicXML score found inside the .mxl file.');
    return dec.decode(await entries.get(root)());
  }

  global.SPZip = { readMxl };
})(window);
