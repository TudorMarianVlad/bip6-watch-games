// The Wristlings app icon (248 x 248): Sprig in a round badge with the same purple
// ring as Tap Quest's icon, so the games look like one family. Sprig's picture is
// Sprig's creature art, art/sprig.png (a Gemini image; its plain background is removed
// here the same way tools/import.cjs does it).
//
//   node tools/icon.cjs            writes assets/default.{s,r,b}/icon.png
//   node tools/icon.cjs --look     also writes tools/icon_preview.png (full size and list size)

const fs = require('fs')
const path = require('path')
const { readPng } = require('./pngread.cjs')
const { encodePng } = require('./png.cjs')
const { removeBackground, trim } = require('./import.cjs')

const S = 248
const C = S / 2
const ROOT = path.join(__dirname, '..')
const RING = 0x9b6cff // Tap Quest's ring
const RING_EDGE = 0x5a3fb0
const DISC = 0x241a4f
const DISC_IN = 0x2e2263
const R_OUT = 124
const R_RING = 113 // inner edge of the ring
const R_IN = 96 // the lighter inner circle

const hex = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]
const cover = (v) => Math.max(0, Math.min(1, v + 0.5)) // anti-aliased edge

const px = new Float32Array(S * S * 4)
function put(x, y, rgb, a) {
  if (x < 0 || y < 0 || x >= S || y >= S || a <= 0) return
  const i = (y * S + x) * 4
  const outA = a + px[i + 3] * (1 - a)
  for (let k = 0; k < 3; k++) px[i + k] = outA ? (rgb[k] * a + px[i + k] * px[i + 3] * (1 - a)) / outA : 0
  px[i + 3] = outA
}
function circle(r, c) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) put(x, y, hex(c), cover(r - Math.hypot(x + 0.5 - C, y + 0.5 - C)))
}
// a chunky pixel sparkle (a plus), like the ones on Tap Quest's icon
function sparkle(x, y, n, c = 0xffffff) {
  const arm = 4 + n * 4
  const t = n > 1 ? 4 : 3
  for (let j = -arm; j < arm; j++)
    for (let i = 0; i < t; i++) {
      put(x - Math.floor(t / 2) + i, y + j, hex(c), 1)
      put(x + j, y - Math.floor(t / 2) + i, hex(c), 1)
    }
}
// a picture scaled down smoothly (area average) to height h, centred on x, top at y,
// tucked under the ring
function picture(file, h, cx, y0) {
  const f = path.join(ROOT, file)
  if (!fs.existsSync(f)) {
    console.log('No ' + file + ' yet: add Sprig\'s new art there first. The current icon was left as it is.')
    process.exit(1)
  }
  const raw = readPng(f)
  removeBackground(raw)
  const im = trim(raw)
  const k = h / im.h
  const w = Math.round(im.w * k)
  const x0 = Math.round(cx - w / 2)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let sy = Math.floor(y / k); sy < Math.min(im.h, Math.ceil((y + 1) / k)); sy++)
        for (let sx = Math.floor(x / k); sx < Math.min(im.w, Math.ceil((x + 1) / k)); sx++) {
          const s = (sy * im.w + sx) * 4
          const al = im.rgba[s + 3] / 255
          r += im.rgba[s] * al
          g += im.rgba[s + 1] * al
          b += im.rgba[s + 2] * al
          a += al
          n++
        }
      if (!a) continue
      const d = Math.hypot(x0 + x + 0.5 - C, y0 + y + 0.5 - C)
      put(x0 + x, y0 + y, [r / a, g / a, b / a], (a / n) * cover(R_RING - d))
    }
}

// the badge: ring edge, dark disc, a lighter inner circle
circle(R_OUT, RING_EDGE)
circle(R_RING + 1, DISC)
circle(R_IN, DISC_IN)
// Sprig, big, with a few sparkles around its leaves
picture('art/sprig.png', 196, C + 4, 34)
sparkle(52, 70, 2)
sparkle(40, 108, 0)
sparkle(200, 150, 1)
// the purple ring on top, with a soft light line along its upper half
for (let y = 0; y < S; y++)
  for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - C, y + 0.5 - C)
    const a = Math.min(cover(R_OUT - 2 - d), cover(d - R_RING))
    if (!a) continue
    put(x, y, hex(RING), a)
    if (y < C && Math.abs(d - (R_OUT - 5)) < 1.2) put(x, y, hex(0xc9b0ff), 0.5 * a)
  }

const out = new Uint8Array(S * S * 4)
for (let i = 0; i < out.length; i++) out[i] = Math.round(i % 4 === 3 ? px[i] * 255 : px[i])
const png = encodePng(S, S, out)
for (const p of ['default.s', 'default.r', 'default.b']) fs.writeFileSync(path.join(ROOT, 'assets', p, 'icon.png'), png)
console.log('wrote icon.png into assets/default.{s,r,b}')

if (process.argv.includes('--look')) {
  // full size next to the size it has in the watch's app list, on a dark background
  const SMALL = 96, GAP = 16, W = S + SMALL + GAP * 3, H = S + GAP * 2
  const sheet = new Uint8Array(W * H * 4)
  for (let i = 0; i < W * H; i++) sheet.set([0x10, 0x0d, 0x1c, 255], i * 4)
  const paste = (k, ox, oy) => {
    const size = Math.round(S * k)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const acc = [0, 0, 0]
        let a = 0, n = 0
        for (let sy = Math.floor(y / k); sy < Math.min(S, Math.ceil((y + 1) / k)); sy++)
          for (let sx = Math.floor(x / k); sx < Math.min(S, Math.ceil((x + 1) / k)); sx++) {
            const s = (sy * S + sx) * 4
            const al = out[s + 3] / 255
            for (let c = 0; c < 3; c++) acc[c] += out[s + c] * al
            a += al
            n++
          }
        if (!a) continue
        const f = a / n
        const d = ((oy + y) * W + ox + x) * 4
        for (let c = 0; c < 3; c++) sheet[d + c] = Math.round((acc[c] / a) * f + sheet[d + c] * (1 - f))
      }
  }
  paste(1, GAP, GAP)
  paste(SMALL / S, S + GAP * 2, GAP + (S - SMALL) / 2)
  fs.writeFileSync(path.join(__dirname, 'icon_preview.png'), encodePng(W, H, sheet))
  console.log('wrote tools/icon_preview.png')
}
