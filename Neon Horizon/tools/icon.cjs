// Draws the Neon Horizon app icon (248x248): a striped synthwave sun over a wet neon road.
// Run: node tools/icon.cjs   (writes assets/default.{s,r,b}/icon.png)
const fs = require('fs')
const path = require('path')
const { encodePng } = require('./png.cjs')

const S = 248
const C = S / 2
const HOR = 132
const out = new Uint8Array(S * S * 4)

function lerp(a, b, k) {
  return a + (b - a) * k
}
function mixc(a, b, k) {
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]
}
function hex(c) {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255]
}
const SKY = [hex(0x12002a), hex(0x4a0a5e), hex(0xc0306e), hex(0xff8a4a)]
function sky(u) {
  const stops = [0, 0.4, 0.75, 1]
  for (let i = 1; i < stops.length; i++) {
    if (u <= stops[i]) return mixc(SKY[i - 1], SKY[i], (u - stops[i - 1]) / (stops[i] - stops[i - 1]))
  }
  return SKY[3]
}

const SUN_R = 56
const SUN_Y = HOR - 18
const ROAD = hex(0x120a1e)
const PINK = hex(0xff2fd0)
const CYAN = hex(0x2ff3ff)

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4
    const r = Math.hypot(x + 0.5 - C, y + 0.5 - C)
    const alpha = Math.max(0, Math.min(1, C - 1 - r + 0.5))
    if (alpha <= 0) continue
    let col
    if (y < HOR) {
      col = sky(y / HOR)
      const dy = y - SUN_Y
      const d = Math.hypot(x - C, dy)
      const stripe = dy > 0 && dy % 12 < 2 + (dy / SUN_R) * 6
      if (d < SUN_R && !stripe) col = mixc(hex(0xfff27a), hex(0xff3d7f), (y - (SUN_Y - SUN_R)) / (2 * SUN_R))
      // skyline
      const bh = [10, 22, 14, 30, 18, 8, 26, 12, 20, 16][Math.floor(x / 25) % 10]
      if (y > HOR - bh) col = hex(0x14031f)
    } else {
      const dy = y - HOR + 0.5
      const t = dy / (S - HOR)
      col = sky(1 - Math.min(1, t * 1.15)).map((v) => v * (0.62 - 0.4 * t))
      const sc = dy * 0.95
      const hw = sc
      const dx = x + 0.5 - C
      // sun reflection stripes
      if (t < 0.5 && Math.floor(dy) % 3 !== 0 && Math.abs(dx) < SUN_R * (0.85 - t)) col = mixc(hex(0xff3d7f), col, 0.3 + t)
      if (Math.abs(dx) < hw) {
        const k = 1 - t
        col = mixc(ROAD, col, 0.12 + 0.55 * k * k)
        const z = 300 / dy
        if (Math.floor(z) % 2 === 0 && Math.abs(Math.abs(dx) - hw * 0.34) < Math.max(0.6, hw * 0.03)) col = CYAN
      } else if (Math.abs(dx) < hw * 1.14) col = Math.floor(300 / dy) % 2 ? PINK : hex(0x3a0a40)
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
