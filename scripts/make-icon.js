// 生成番茄图标 icon.png（纯 Node，无第三方依赖）
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;
const buf = Buffer.alloc(SIZE * SIZE * 4, 0);

function blend(x, y, r, g, b, a) {
  if (a <= 0) return;
  const i = (y * SIZE + x) * 4;
  const sa = a / 255;
  const da = buf[i + 3] / 255;
  const outA = sa + da * (1 - sa);
  if (outA <= 0) return;
  const inv = 1 - sa;
  buf[i] = Math.round((r * sa + buf[i] * da * inv) / outA);
  buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * inv) / outA);
  buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * inv) / outA);
  buf[i + 3] = Math.round(outA * 255);
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---- 果实（红色圆形，带底部阴影）----
const cx = 128;
const cy = 148;
const R = 88;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > R + 1) continue;
    const a = clamp01(R - d + 0.5) * 255;
    if (a <= 0) continue;
    const t = clamp01(d / R);
    let r = 255 + (224 - 255) * t;
    let g = 122 + (52 - 122) * t;
    let b = 107 + (44 - 107) * t;
    const shade = 1 - 0.18 * ((dy / R) * 0.5 + 0.5);
    blend(x, y, Math.round(r * shade), Math.round(g * shade), Math.round(b * shade), a);
  }
}

// ---- 高光 ----
{
  const hx = 100;
  const hy = 120;
  const hrx = 26;
  const hry = 17;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const nx = (x - hx) / hrx;
      const ny = (y - hy) / hry;
      const s = nx * nx + ny * ny;
      if (s >= 1) continue;
      blend(x, y, 255, 255, 255, Math.round((1 - s) * 0.35 * 255));
    }
  }
}

// ---- 茎（胶囊形）----
{
  const sx = 128;
  const y0 = 38;
  const y1 = 68;
  const th = 8;
  for (let y = 0; y < SIZE; y++) {
    const dySeg = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
    for (let x = 0; x < SIZE; x++) {
      const dx = x - sx;
      const d = Math.sqrt(dx * dx + dySeg * dySeg);
      if (d > th + 1) continue;
      const a = clamp01(th - d + 0.5) * 255;
      if (a <= 0) continue;
      blend(x, y, 60, 148, 76, a);
    }
  }
}

// ---- 叶子（两片椭圆）----
const leaves = [
  { cx: 162, cy: 52, rx: 26, ry: 11 },
  { cx: 94, cy: 52, rx: 26, ry: 11 },
];
for (const leaf of leaves) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const nx = (x - leaf.cx) / leaf.rx;
      const ny = (y - leaf.cy) / leaf.ry;
      const s = nx * nx + ny * ny;
      if (s >= 1) continue;
      const a = clamp01((1 - s) * Math.min(leaf.rx, leaf.ry) + 0.5) * 255;
      if (a <= 0) continue;
      blend(x, y, 78, 172, 92, a);
    }
  }
}

// ---- PNG 编码 ----
function crc32(b) {
  let table = crc32._t;
  if (!table) {
    table = crc32._t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = table[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const tb = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crc]);
}

function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function wrapICO(pngBuf) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(1, 4); // count
  const entry = Buffer.alloc(16);
  entry[0] = 0; // width 0 = 256
  entry[1] = 0; // height 0 = 256
  entry[2] = 0; // color count
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bit count
  entry.writeUInt32LE(pngBuf.length, 8); // size of image
  entry.writeUInt32LE(22, 12); // offset
  return Buffer.concat([header, entry, pngBuf]);
}

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });
const png = encodePNG(SIZE, SIZE, buf);
fs.writeFileSync(path.join(outDir, 'icon.png'), png);
fs.writeFileSync(path.join(outDir, 'icon.ico'), wrapICO(png));
console.log('已生成图标: icon.png 与 icon.ico');
