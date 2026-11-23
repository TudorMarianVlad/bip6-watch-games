// Wristlings item generator.
//
// The berries and the catch charm are lists of simple shapes (ellipses, polygons,
// thick lines) in a 100 x 100 box. The renderer adds toon shading (light from the
// top-left), a dark outline, thin inner lines where shapes overlap, and anti-aliasing
// (4x supersampling). Creatures come from art/ via tools/import.cjs, and the app icon
// from tools/icon.cjs.
//
// Run:  node tools/sprites.cjs   (writes item/*.png into assets/default.{s,r,b}/)

const fs = require('fs')
const path = require('path')
const { encodePng } = require('./png.cjs')

const INK = 0x1c1530 // outline colour
const SHADOW = 0x24183f // shadows are mixed toward this
const WHITE = 0xffffff

// ---------- shape helpers ----------
const E = (x, y, rx, ry, c, o = {}) => ({ t: 'e', x, y, rx, ry, rot: o.rot || 0, c, ...o })
const C = (x, y, r, c, o = {}) => E(x, y, r, r, c, o)
const P = (pts, c, o = {}) => ({ t: 'p', pts, c, ...o })
const Lw = (x1, y1, x2, y2, w, c, o = {}) => ({ t: 'l', x1, y1, x2, y2, w, c, ...o })
const flat = { s: false, line: false }

// ---------- palettes ----------
const LEAF = 0x3f9f45

// items
const ITEMS = {
  berry_red: [Lw(50, 30, 54, 18, 3, LEAF), E(62, 22, 10, 5, LEAF, { rot: -0.3 }), C(50, 58, 28, 0xff4d5e), C(40, 46, 6, WHITE, flat)],
  berry_blue: [Lw(50, 30, 54, 18, 3, LEAF), E(62, 22, 10, 5, LEAF, { rot: -0.3 }), C(50, 58, 28, 0x4d8dff), C(40, 46, 6, WHITE, flat)],
  berry_green: [Lw(50, 30, 54, 18, 3, LEAF), E(62, 22, 10, 5, LEAF, { rot: -0.3 }), C(50, 58, 28, 0x6bd65a), C(40, 46, 6, WHITE, flat)],
  berry_gold: [Lw(50, 30, 54, 18, 3, LEAF), E(62, 22, 10, 5, LEAF, { rot: -0.3 }), C(50, 58, 28, 0xffc531), C(40, 46, 6, WHITE, flat)],
  charm: [
    E(50, 16, 9, 9, 0xd6c27a, { s: false }),
    E(50, 16, 5, 5, 0x000000, { hole: true }),
    P([[50, 24], [76, 40], [76, 70], [50, 90], [24, 70], [24, 40]], 0x4fd6ff),
    P([[50, 36], [64, 46], [64, 64], [50, 76], [36, 64], [36, 46]], 0xa8f0ff, { line: false }),
    C(42, 44, 4, WHITE, flat)
  ]
}

// ---------- renderer ----------
function sdf(s, x, y) {
  if (s.t === 'e') {
    const dx = x - s.x
    const dy = y - s.y
    const c = Math.cos(-s.rot)
    const sn = Math.sin(-s.rot)
    const lx = dx * c - dy * sn
    const ly = dx * sn + dy * c
    const k = Math.sqrt((lx / s.rx) ** 2 + (ly / s.ry) ** 2)
    return (k - 1) * Math.min(s.rx, s.ry)
  }
  if (s.t === 'l') return segDist(x, y, s.x1, s.y1, s.x2, s.y2) - s.w / 2
  // polygon
  let inside = false
  let d = Infinity
  const p = s.pts
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i]
    const [xj, yj] = p[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    d = Math.min(d, segDist(x, y, xi, yi, xj, yj))
  }
  return inside ? -d : d
}

function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax
  const vy = by - ay
  const len = vx * vx + vy * vy
  let t = len ? ((px - ax) * vx + (py - ay) * vy) / len : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - ax - vx * t, py - ay - vy * t)
}

function bbox(s) {
  if (s._bb) return s._bb
  let b
  if (s.t === 'e') {
    const r = Math.max(s.rx, s.ry)
    b = s.rot ? [s.x - r, s.y - r, s.x + r, s.y + r] : [s.x - s.rx, s.y - s.ry, s.x + s.rx, s.y + s.ry]
  } else if (s.t === 'l') {
    b = [Math.min(s.x1, s.x2) - s.w / 2, Math.min(s.y1, s.y2) - s.w / 2, Math.max(s.x1, s.x2) + s.w / 2, Math.max(s.y1, s.y2) + s.w / 2]
  } else {
    const xs = s.pts.map((q) => q[0])
    const ys = s.pts.map((q) => q[1])
    b = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
  }
  s._bb = b
  return b
}

const LIGHT = (() => {
  const v = [-0.45, -0.55, 0.7]
  const n = Math.hypot(...v)
  return v.map((a) => a / n)
})()

function mix(c, to, f) {
  const r = (c >> 16) & 255
  const g = (c >> 8) & 255
  const b = c & 255
  const tr = (to >> 16) & 255
  const tg = (to >> 8) & 255
  const tb = to & 255
  return [Math.round(r + (tr - r) * f), Math.round(g + (tg - g) * f), Math.round(b + (tb - b) * f)]
}

function shade(s, x, y) {
  if (s.s === false) return mix(s.c, s.c, 0)
  let u, v
  if (s.t === 'e') {
    const dx = x - s.x
    const dy = y - s.y
    // light comes from the screen's top-left, so shade in screen space
    u = dx / Math.max(s.rx, 1)
    v = dy / Math.max(s.ry, 1)
    if (s.rot) {
      const r = Math.max(s.rx, s.ry)
      u = dx / r
      v = dy / r
    }
  } else {
    const [x0, y0, x1, y1] = bbox(s)
    u = ((x - x0) / Math.max(x1 - x0, 1)) * 2 - 1
    v = ((y - y0) / Math.max(y1 - y0, 1)) * 2 - 1
  }
  const r2 = Math.min(1, u * u + v * v)
  const nz = Math.sqrt(1 - r2)
  const d = u * LIGHT[0] + v * LIGHT[1] + nz * LIGHT[2]
  if (d > 0.8) return mix(s.c, WHITE, 0.32)
  if (d < 0.22) return mix(s.c, SHADOW, 0.34)
  return mix(s.c, s.c, 0)
}

// size: output size in px. Returns RGBA Uint8Array (size*size*4).
function render(shapes, size, opts = {}) {
  const SS = 4
  const N = size * SS
  const unit = N / 100
  const outerPx = (1.2 + size * 0.016) * SS
  const innerPx = (0.6 + size * 0.009) * SS
  const rOut = outerPx / unit
  const rIn = innerPx / unit
  const ink = mix(INK, INK, 0)
  const big = new Float32Array(N * N * 4)
  const sd = new Float64Array(shapes.length)
  for (let py = 0; py < N; py++) {
    const y = (py + 0.5) / unit
    for (let px = 0; px < N; px++) {
      let x = (px + 0.5) / unit
      if (opts.flip) x = 100 - x
      let top = -1
      let minD = Infinity
      for (let i = 0; i < shapes.length; i++) {
        const b = bbox(shapes[i])
        if (x < b[0] - rOut - 1 || x > b[2] + rOut + 1 || y < b[1] - rOut - 1 || y > b[3] + rOut + 1) {
          sd[i] = Infinity
          continue
        }
        const d = sdf(shapes[i], x, y)
        sd[i] = d
        if (shapes[i].hole) continue
        if (d < minD) minD = d
        if (d < 0) top = i
      }
      // a "hole" shape punches through everything below it (e.g. the charm's loop)
      let holed = false
      for (let i = 0; i < shapes.length; i++) if (shapes[i].hole && sd[i] < 0 && i > top) holed = true
      let col = null
      if (holed) {
        const h = shapes.find((s) => s.hole)
        col = sdf(h, x, y) > -rIn * 1.4 ? ink : null
      } else if (top < 0) {
        if (minD < rOut) col = ink
      } else {
        const s = shapes[top]
        if (opts.silhouette) col = mix(0x2e2850, 0x2e2850, 0)
        else {
          let edge = false
          if (s.line !== false && sd[top] > -rIn) {
            for (let j = 0; j < top; j++) if (!shapes[j].hole && sd[j] < 0) edge = true
          }
          col = edge ? ink : shade(s, x, y)
        }
      }
      if (col) {
        const o = (py * N + px) * 4
        big[o] = col[0]
        big[o + 1] = col[1]
        big[o + 2] = col[2]
        big[o + 3] = 1
      }
    }
  }
  // downsample (premultiplied average)
  const out = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let j = 0; j < SS; j++)
        for (let i = 0; i < SS; i++) {
          const o = ((y * SS + j) * N + (x * SS + i)) * 4
          const al = big[o + 3]
          r += big[o] * al
          g += big[o + 1] * al
          b += big[o + 2] * al
          a += al
        }
      const o = (y * size + x) * 4
      if (a > 0) {
        out[o] = Math.round(r / a)
        out[o + 1] = Math.round(g / a)
        out[o + 2] = Math.round(b / a)
        out[o + 3] = Math.round((a / (SS * SS)) * 255)
      }
    }
  }
  return out
}

module.exports = { render, ITEMS }

if (require.main === module) main()

function main() {
  const ROOT = path.join(__dirname, '..', 'assets')
  const PLATFORMS = ['default.s', 'default.r', 'default.b']
  for (const [id, shapes] of Object.entries(ITEMS)) {
    // berries are shown small (feeding), the charm large (catching)
    const size = id === 'charm' ? 72 : 48
    const png = encodePng(size, size, render(shapes, size))
    for (const p of PLATFORMS) {
      const f = path.join(ROOT, p, 'item', id === 'charm' ? 'charm_l.png' : id + '.png')
      fs.mkdirSync(path.dirname(f), { recursive: true })
      fs.writeFileSync(f, png)
    }
    console.log('item', id)
  }
}
