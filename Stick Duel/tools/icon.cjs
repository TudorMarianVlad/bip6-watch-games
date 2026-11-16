// Draws the Stick Duel app icon (248x248): a white stickman kicking an orange one.
// Run: node tools/icon.cjs   (writes assets/default.{s,r,b}/icon.png)
const fs = require('fs')
const path = require('path')
const { encodePng } = require('./png.cjs')

const S = 248
const px = new Float32Array(S * S * 4) // straight RGBA, 0..1

function blend(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= S || y >= S || a <= 0) return
  const i = (y * S + x) * 4
  const ia = 1 - a
  px[i] = r * a + px[i] * ia
  px[i + 1] = g * a + px[i + 1] * ia
  px[i + 2] = b * a + px[i + 2] * ia
  px[i + 3] = a + px[i + 3] * ia
}

function hex(c) {
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]
}

// anti-aliased shape from a signed distance function
function shape(sdf, color, x0, y0, x1, y1) {
  const [r, g, b] = hex(color)
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(S, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(S, Math.ceil(x1)); x++) {
      const d = sdf(x + 0.5, y + 0.5)
      blend(x, y, r, g, b, Math.max(0, Math.min(1, 0.5 - d)))
    }
  }
}

function seg(ax, ay, bx, by, w, color) {
  const sdf = (x, y) => {
    const dx = bx - ax
    const dy = by - ay
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    return Math.hypot(x - ax - t * dx, y - ay - t * dy) - w / 2
  }
  shape(sdf, color, Math.min(ax, bx) - w, Math.min(ay, by) - w, Math.max(ax, bx) + w, Math.max(ay, by) + w)
}

function disc(cx, cy, r, color) {
  shape((x, y) => Math.hypot(x - cx, y - cy) - r, color, cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2)
}

// background: dark rounded tile with a faint moon and floor
shape((x, y) => Math.hypot(x - S / 2, y - S / 2) - S / 2 + 1, 0x0b0d18, 0, 0, S, S)
disc(124, 112, 70, 0x171b33)
shape((x, y) => Math.max(Math.hypot(x - S / 2, y - S / 2) - S / 2 + 1, 186 - y), 0x1a1e33, 0, 186, S, S)
seg(20, 187, 228, 187, 3, 0x2c3355)

// a stickman from joint list: [hip, shoulder, head, frontElbow, frontHand, backElbow, backHand, frontKnee, frontFoot, backKnee, backFoot]
function stick(j, color, far, w) {
  const L = (a, b, c) => seg(j[a][0], j[a][1], j[b][0], j[b][1], w, c)
  L(0, 9, far); L(9, 10, far); L(1, 5, far); L(5, 6, far)
  L(0, 1, color)
  L(0, 7, color); L(7, 8, color); L(1, 3, color); L(3, 4, color)
  disc(j[2][0], j[2][1], w * 1.9, color)
}

// white fighter, high kick to the right
stick(
  [[78, 132], [66, 92], [60, 70], [84, 98], [96, 84], [52, 104], [40, 116], [104, 116], [140, 98], [76, 160], [74, 186]],
  0xffffff, 0x9e9e9e, 10
)
// orange fighter, knocked back
stick(
  [[176, 136], [190, 98], [198, 78], [208, 106], [222, 98], [178, 110], [168, 96], [168, 160], [160, 186], [190, 160], [196, 186]],
  0xff9a3d, 0x9e5f26, 10
)
// impact spark
for (let k = 0; k < 6; k++) {
  const a = (k * Math.PI) / 3 + 0.3
  seg(160 + Math.cos(a) * 9, 84 + Math.sin(a) * 9, 160 + Math.cos(a) * 24, 84 + Math.sin(a) * 24, 6, 0xffd84d)
}
disc(160, 84, 7, 0xffffff)

const out = new Uint8Array(S * S * 4)
for (let i = 0; i < S * S; i++) {
  const a = px[i * 4 + 3]
  out[i * 4] = Math.round((a > 0 ? px[i * 4] : 0) * 255)
  out[i * 4 + 1] = Math.round((a > 0 ? px[i * 4 + 1] : 0) * 255)
  out[i * 4 + 2] = Math.round((a > 0 ? px[i * 4 + 2] : 0) * 255)
  out[i * 4 + 3] = Math.round(a * 255)
}
const png = encodePng(S, S, out)
for (const d of ['default.s', 'default.r', 'default.b']) {
  fs.writeFileSync(path.join(__dirname, '..', 'assets', d, 'icon.png'), png)
}
console.log('icon written')
