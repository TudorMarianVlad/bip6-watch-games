// Draws the Depth Crawl app icon (248x248): a torchlit stone corridor ending in a blue portal.
// Run: node tools/icon.cjs   (writes assets/default.{s,r,b}/icon.png)
const fs = require('fs')
const path = require('path')
const { encodePng } = require('./png.cjs')

const S = 248
const C = S / 2
const out = new Uint8Array(S * S * 4)

function rgb(c, k) {
  return [((c >> 16) & 255) * k, ((c >> 8) & 255) * k, (c & 255) * k]
}

const FAR = 34 // half-size of the far wall square
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4
    const dx = x + 0.5 - C
    const dy = y + 0.5 - C
    const r = Math.hypot(dx, dy)
    const alpha = Math.max(0, Math.min(1, C - 1 - r + 0.5))
    if (alpha <= 0) continue
    let col
    if (Math.abs(dx) <= FAR && Math.abs(dy) <= FAR) {
      // far wall with a glowing arch
      const u = Math.abs(dx) / 22
      const archTop = 4 - 14 * Math.sqrt(Math.max(0, 1 - u * u))
      if (u <= 1 && dy > archTop) col = rgb(0x4de0ff, 0.55 + 0.45 * (1 - u))
      else if (u <= 1.3 && dy > archTop - 6) col = rgb(0x4de0ff, 0.35)
      else col = rgb(0x9a8a72, 0.22)
    } else if (Math.abs(dx) > Math.abs(dy)) {
      // side walls: depth = 1 / distance from the centre; seams every block
      const z = FAR / Math.abs(dx)
      const k = Math.pow(1 - z, 1.4) * 0.9 + 0.08
      const seam = ((1 / z) * 1.6) % 1 < 0.08
      col = rgb(seam ? 0x4a4236 : 0x9a8a72, k)
    } else {
      const z = FAR / Math.abs(dy)
      const k = Math.pow(1 - z, 1.6) * (dy < 0 ? 0.55 : 0.75) + 0.05
      const tile = dy > 0 && (((1 / z) * 1.6) % 1 < 0.06 || Math.abs(dx / dy) * 3 % 1 < 0.06)
      col = rgb(tile ? 0x2a231b : dy < 0 ? 0x3a3128 : 0x5a4a38, k)
    }
    out[i] = Math.round(col[0])
    out[i + 1] = Math.round(col[1])
    out[i + 2] = Math.round(col[2])
    out[i + 3] = Math.round(alpha * 255)
  }
}

const png = encodePng(S, S, out)
for (const d of ['default.s', 'default.r', 'default.b']) {
  fs.writeFileSync(path.join(__dirname, '..', 'assets', d, 'icon.png'), png)
}
console.log('icon written')
