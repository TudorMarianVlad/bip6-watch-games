// Draws the widget's preview picture (shown in the watch's widget picker) as a PNG:
// the widget layout scaled to 266x307 (the Bip 6 preview size). Pixel shapes only,
// no text. Writes assets/default.{s,r,b}/widget-preview.png.
// Run from the Tap Quest folder: node tools/widget-preview.cjs
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const W = 266
const H = 307
const px = new Uint8Array(W * H * 4)

function fill(x, y, w, h, color, radius) {
  const r = radius || 0
  for (let j = Math.max(0, Math.floor(y)); j < Math.min(H, Math.ceil(y + h)); j++) {
    for (let i = Math.max(0, Math.floor(x)); i < Math.min(W, Math.ceil(x + w)); i++) {
      if (r) {
        const cx = Math.min(Math.max(i + 0.5, x + r), x + w - r)
        const cy = Math.min(Math.max(j + 0.5, y + r), y + h - r)
        if ((i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2 > r * r) continue
      }
      const k = (j * W + i) * 4
      px[k] = (color >> 16) & 255
      px[k + 1] = (color >> 8) & 255
      px[k + 2] = color & 255
      px[k + 3] = 255
    }
  }
}

const S = W / 390 // the widget is 390x450
const SLIME = [
  '............', '............', '....gggg....', '...gggggg...',
  '..gggggggg..', '..gwkggwkg..', '.ggwkggwkgg.', '.gggggggggg.',
  '.ggggddgggg.', 'gggggggggggg', '.dddddddddd.', '............'
]
const PAL = { g: 0x4dd06a, d: 0x2a8a40, w: 0xffffff, k: 0x101010 }

fill(0, 0, W, H, 0x000000, 40) // pure black, like the widget (AMOLED)
// "TAP QUEST" title and the world name
fill(135 * S, 20 * S, 120 * S, 16 * S, 0xffd84d, 8 * S)
fill(140 * S, 50 * S, 110 * S, 10 * S, 0xafa9ec, 5 * S)
// the monster
const scale = 9 * S
SLIME.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== '.') fill(195 * S - 54 * S + c * scale, 72 * S + r * scale, scale + 0.5, scale + 0.5, PAL[ch]) }))
// monster name, STAGE line
fill(160 * S, 190 * S, 70 * S, 10 * S, 0xafa9ec, 5 * S)
fill(110 * S, 216 * S, 170 * S, 26 * S, 0xffffff, 8 * S)
// gold and Stardust tiles
fill(40 * S, 258 * S, 150 * S, 64 * S, 0x16131f, 14 * S)
fill(200 * S, 258 * S, 150 * S, 64 * S, 0x16131f, 14 * S)
fill(80 * S, 290 * S, 70 * S, 16 * S, 0xffd84d, 6 * S)
fill(240 * S, 290 * S, 70 * S, 16 * S, 0xc77dff, 6 * S)
fill(130 * S, 336 * S, 130 * S, 10 * S, 0xff9a3d, 5 * S)
// PLAY button
fill(95 * S, 366 * S, 200 * S, 56 * S, 0x2a8a40, 28 * S)
fill(95 * S, 362 * S, 200 * S, 56 * S, 0x4dd06a, 28 * S)
// a play triangle on it
for (let j = 0; j < 28 * S; j++) fill(187 * S, 376 * S + j, (j < 14 * S ? j : 28 * S - j) * 1.3, 1, 0x0d2a12)

// PNG encoding (RGBA, no filter)
function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 255
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
const raw = Buffer.alloc((W * 4 + 1) * H)
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0
  Buffer.from(px.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1)
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8
ihdr[9] = 6
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0))
])
// zeus looks for one per language (widget-preview_en-US.png); keep the plain name too
for (const d of ['s', 'r', 'b']) {
  for (const name of ['widget-preview.png', 'widget-preview_en-US.png']) {
    const out = path.join(__dirname, '..', 'assets', 'default.' + d, name)
    fs.writeFileSync(out, png)
    console.log('wrote ' + out)
  }
}
