// Wristlings UI art generator: backgrounds, buttons, panels and 3D titles.
//
// Everything is drawn here once and saved as PNGs, so the watch only shows a
// few images per screen instead of many shapes (cheap to draw, keeps fps up).
// It also writes page/uiart.js with the size of every image, so the game can
// centre them without hard-coded numbers.
//
// Run:  node tools/ui.cjs          (writes assets/default.{s,r,b}/ui/*.png + page/uiart.js)
//       node tools/ui.cjs preview  (also writes tools/ui_sheet.png)

const fs = require('fs')
const path = require('path')
const { encodePng } = require('./png.cjs')
const sprites = require('./sprites.cjs')

const INK = 0x1c1530
const SS = 4 // supersampling for smooth edges

// ---------- colours ----------
function rgb(c) {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255]
}
function mixc(a, b, t) {
  const A = rgb(a)
  const B = rgb(b)
  return (Math.round(A[0] + (B[0] - A[0]) * t) << 16) | (Math.round(A[1] + (B[1] - A[1]) * t) << 8) | Math.round(A[2] + (B[2] - A[2]) * t)
}
const lighten = (c, t) => mixc(c, 0xffffff, t)
const darken = (c, t) => mixc(c, 0x000000, t)

// paints: solid(color, alpha) or vgrad([[t, color], ...], y0, y1, alpha)
function solid(c, a = 1) {
  const v = rgb(c)
  return () => [v[0], v[1], v[2], a]
}
function vgrad(stops, y0, y1, a = 1) {
  return (x, y) => {
    const t = Math.max(0, Math.min(1, (y - y0) / Math.max(1e-6, y1 - y0)))
    let i = 0
    while (i < stops.length - 2 && t > stops[i + 1][0]) i++
    const [ta, ca] = stops[i]
    const [tb, cb] = stops[i + 1]
    const k = Math.max(0, Math.min(1, (t - ta) / Math.max(1e-6, tb - ta)))
    const c = rgb(mixc(ca, cb, k))
    return [c[0], c[1], c[2], a]
  }
}
function radial(cx, cy, r, inner, outer, aIn = 1, aOut = 0) {
  return (x, y) => {
    const t = Math.min(1, Math.hypot(x - cx, y - cy) / r)
    const c = rgb(mixc(inner, outer, t))
    return [c[0], c[1], c[2], aIn + (aOut - aIn) * t]
  }
}

// ---------- signed distances (pixels) ----------
function sdRoundRect(x, y, w, h, r) {
  return (px, py) => {
    const cx = x + w / 2
    const cy = y + h / 2
    const qx = Math.abs(px - cx) - (w / 2 - r)
    const qy = Math.abs(py - cy) - (h / 2 - r)
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
  }
}
function sdEllipse(cx, cy, rx, ry) {
  return (px, py) => (Math.hypot((px - cx) / rx, (py - cy) / ry) - 1) * Math.min(rx, ry)
}
function sdPoly(pts) {
  return (px, py) => {
    let inside = false
    let d = Infinity
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]
      const [xj, yj] = pts[j]
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
      const vx = xj - xi
      const vy = yj - yi
      const l = vx * vx + vy * vy
      let t = l ? ((px - xi) * vx + (py - yi) * vy) / l : 0
      t = Math.max(0, Math.min(1, t))
      d = Math.min(d, Math.hypot(px - xi - vx * t, py - yi - vy * t))
    }
    return inside ? -d : d
  }
}

// ---------- canvas ----------
class Canvas {
  constructor(w, h) {
    this.w = w
    this.h = h
    this.W = w * SS
    this.H = h * SS
    this.px = new Float32Array(this.W * this.H * 4)
  }
  // fill where sdf < 0 (bbox in px limits the work)
  fill(sdf, bb, paint) {
    const x0 = Math.max(0, Math.floor(bb[0] * SS))
    const y0 = Math.max(0, Math.floor(bb[1] * SS))
    const x1 = Math.min(this.W, Math.ceil(bb[2] * SS))
    const y1 = Math.min(this.H, Math.ceil(bb[3] * SS))
    for (let Y = y0; Y < y1; Y++) {
      const y = (Y + 0.5) / SS
      for (let X = x0; X < x1; X++) {
        const x = (X + 0.5) / SS
        if (sdf(x, y) >= 0) continue
        const c = paint(x, y)
        this.blend((Y * this.W + X) * 4, c)
      }
    }
  }
  blend(o, c) {
    const a = c[3]
    if (a <= 0) return
    const p = this.px
    const da = p[o + 3]
    const oa = a + da * (1 - a)
    for (let k = 0; k < 3; k++) p[o + k] = (c[k] * a + p[o + k] * da * (1 - a)) / oa
    p[o + 3] = oa
  }
  rect(x, y, w, h, r, paint) {
    this.fill(sdRoundRect(x, y, w, h, Math.min(r, w / 2, h / 2)), [x, y, x + w, y + h], paint)
  }
  ellipse(cx, cy, rx, ry, paint) {
    this.fill(sdEllipse(cx, cy, rx, ry), [cx - rx, cy - ry, cx + rx, cy + ry], paint)
  }
  poly(pts, paint) {
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    this.fill(sdPoly(pts), [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], paint)
  }
  // paste an RGBA image (Uint8Array) at x, y
  image(rgba, iw, ih, x, y) {
    for (let Y = 0; Y < ih * SS; Y++) {
      const ty = y * SS + Y
      if (ty < 0 || ty >= this.H) continue
      for (let X = 0; X < iw * SS; X++) {
        const tx = x * SS + X
        if (tx < 0 || tx >= this.W) continue
        const s = (Math.floor(Y / SS) * iw + Math.floor(X / SS)) * 4
        const a = rgba[s + 3] / 255
        if (a > 0) this.blend((ty * this.W + tx) * 4, [rgba[s], rgba[s + 1], rgba[s + 2], a])
      }
    }
  }
  out(opaque) {
    const o = new Uint8Array(this.w * this.h * 4)
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        let r = 0, g = 0, b = 0, a = 0
        for (let j = 0; j < SS; j++)
          for (let i = 0; i < SS; i++) {
            const p = ((y * SS + j) * this.W + x * SS + i) * 4
            const al = this.px[p + 3]
            r += this.px[p] * al
            g += this.px[p + 1] * al
            b += this.px[p + 2] * al
            a += al
          }
        const d = (y * this.w + x) * 4
        if (a > 0) {
          o[d] = Math.round(r / a)
          o[d + 1] = Math.round(g / a)
          o[d + 2] = Math.round(b / a)
        }
        o[d + 3] = opaque ? 255 : Math.round((a / (SS * SS)) * 255)
      }
    return o
  }
}

// ---------- the 3D pixel font (5 x 7) ----------
const GLYPHS = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['#..#.', '#..#.', '#..#.', '#####', '...#.', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '-': ['...', '...', '...', '###', '...', '...', '...'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  '<': ['...', '..#', '.#.', '#..', '.#.', '..#', '...'],
  '>': ['...', '#..', '.#.', '..#', '.#.', '#..', '...'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  ':': ['.', '#', '.', '.', '.', '#', '.'],
  ',': ['..', '..', '..', '..', '..', '.#', '#.'],
  ' ': ['..', '..', '..', '..', '..', '..', '..']
}

// letters are drawn bold: every pixel is BOLD times wider (overlapping to the right)
const BOLD = 1.5
function textWidth(str, s) {
  let w = 0
  for (const ch of str) w += (GLYPHS[ch] || GLYPHS[' '])[0].length + BOLD
  return (w - 1) * s
}

// chunky letters: dark outline, an extruded "side" below, gradient face
function text3d(cv, str, x, y, s, o) {
  const top = o.top || 0xffffff
  const bottom = o.bottom || 0xffe9a0
  const side = o.side || darken(bottom, 0.5)
  const depth = o.depth === undefined ? Math.max(1.5, s * 0.6) : o.depth
  const ol = o.outline === undefined ? Math.max(1.5, s * 0.55) : o.outline
  const cells = []
  let cx = x
  for (const ch of str) {
    const g = GLYPHS[ch] || GLYPHS[' ']
    g.forEach((row, gy) => {
      for (let gx = 0; gx < row.length; gx++) if (row[gx] === '#') cells.push([cx + gx * s, y + gy * s])
    })
    cx += (g[0].length + BOLD) * s
  }
  const ink = solid(o.ink || INK)
  // 1. outline around the face and the extrusion
  for (const [px, py] of cells) cv.rect(px - ol, py - ol, s * BOLD + ol * 2, s + ol * 2 + depth, ol, ink)
  // 2. extrusion (the side of the letters)
  const sidePaint = solid(side)
  for (let d = depth; d > 0; d -= 0.5) for (const [px, py] of cells) cv.rect(px, py + d, s * BOLD, s, 0, sidePaint)
  // 3. face: light at the top, colour at the bottom, with a shine line
  const face = vgrad([[0, top], [0.45, mixc(top, bottom, 0.5)], [1, bottom]], y, y + 7 * s)
  for (const [px, py] of cells) cv.rect(px, py, s * BOLD, s, 0, face)
}

// ---------- building blocks ----------
function button(w, h, base, label, opts = {}) {
  const cv = new Canvas(w, h)
  const r = Math.min(opts.r || 16, h / 2)
  const lip = Math.max(4, Math.round(h * 0.11))
  cv.rect(0, 0, w, h, r, solid(INK))
  cv.rect(2, 2, w - 4, h - 4, r - 2, solid(darken(base, 0.45)))
  const fh = h - 4 - lip
  cv.rect(2, 2, w - 4, fh, r - 2, vgrad([[0, lighten(base, 0.28)], [0.55, base], [1, darken(base, 0.08)]], 2, 2 + fh))
  // gloss on the upper half and two sparkles
  cv.rect(7, 5, w - 14, fh * 0.36, Math.max(2, r - 6), vgrad([[0, 0xffffff], [1, 0xffffff]], 5, 5 + fh * 0.36, 0.22))
  if (w > 60) {
    cv.ellipse(w - 15, 9, 2.6, 2.6, solid(0xffffff, 0.75))
    cv.ellipse(w - 22, 13, 1.4, 1.4, solid(0xffffff, 0.5))
  }
  if (label) {
    const s = opts.s || fitScale(label, w - 16, fh - 8)
    const tw = textWidth(label, s)
    const tx = (w - tw) / 2
    const ty = 2 + (fh - 7 * s) / 2 - s * 0.3
    text3d(cv, label, tx, ty, s, { top: 0xffffff, bottom: opts.textColor || lighten(base, 0.7), side: darken(base, 0.55) })
  }
  return cv
}

function fitScale(label, maxW, maxH) {
  let s = 3.5
  while (s > 1.5 && (textWidth(label, s) + s * 1.2 > maxW || 7 * s + s * 1.2 > maxH)) s -= 0.25
  return s
}

function panel(w, h, opts = {}) {
  const cv = new Canvas(w, h)
  const r = opts.r || 16
  const top = opts.top || 0x30286a
  const bottom = opts.bottom || 0x1b163e
  const edge = opts.edge || 0x5b4fb0
  const a = opts.alpha || 0.94
  cv.rect(0, 0, w, h, r, solid(INK, Math.min(1, a + 0.04)))
  cv.rect(2, 2, w - 4, h - 4, r - 2, solid(edge, a))
  cv.rect(4, 4, w - 8, h - 8, r - 4, vgrad([[0, top], [1, bottom]], 4, h - 4, a))
  cv.rect(8, 5, w - 16, 2, 1, solid(0xffffff, 0.12))
  return cv
}

function plate(size) {
  const cv = new Canvas(size, size)
  const c = size / 2
  cv.ellipse(c, c, c, c, solid(INK))
  cv.ellipse(c, c, c - 2, c - 2, vgrad([[0, 0x6a5fc0], [1, 0x2a2350]], 0, size))
  cv.ellipse(c, c, c - 6, c - 6, radial(c, c * 0.8, c, 0x3a3180, 0x1a1540))
  cv.ellipse(c, size * 0.8, c * 0.55, c * 0.12, solid(0x0d0a20, 0.6))
  return cv
}

// the round stand under the lead creature in the widget: a dim version of plate()
function darkPlate(size) {
  const cv = new Canvas(size, size)
  const c = size / 2
  cv.ellipse(c, c, c, c, solid(INK))
  cv.ellipse(c, c, c - 2, c - 2, vgrad([[0, 0x3a3180], [1, 0x140f2c]], 0, size))
  cv.ellipse(c, c, c - 5, c - 5, radial(c, c * 0.75, c, 0x1e1846, 0x07060f))
  cv.ellipse(c, size * 0.82, c * 0.5, c * 0.1, solid(0x000000, 0.7))
  return cv
}

function badge(size) {
  const cv = new Canvas(size, size)
  const c = size / 2
  cv.ellipse(c, c, c, c, solid(INK))
  cv.ellipse(c, c, c - 2, c - 2, vgrad([[0, 0xfff2a0], [1, 0xe09a20]], 2, size - 2))
  cv.ellipse(c - c * 0.25, c - c * 0.35, c * 0.3, c * 0.18, solid(0xffffff, 0.55))
  return cv
}

function title(str, s, colors) {
  const pad = Math.ceil(s * 1.2)
  const w = Math.ceil(textWidth(str, s) + pad * 2)
  const h = Math.ceil(7 * s + pad * 2 + s * 0.6)
  const cv = new Canvas(w, h)
  text3d(cv, str, pad, pad, s, colors)
  return cv
}

// ---------- backgrounds (390 x 450) ----------
let seed = 7
function rnd() {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

function sky(cv, h, top, bottom) {
  cv.rect(0, 0, 390, h, 0, vgrad([[0, top], [1, bottom]], 0, h))
}
function floor(cv, y) {
  // the dark area under the scene, where the buttons sit
  cv.rect(0, y, 390, 450 - y, 0, vgrad([[0, 0x1d1840], [1, 0x0d0a1e]], y, 450))
  // a faint diamond pattern
  for (let yy = y + 18; yy < 450; yy += 26)
    for (let xx = ((yy / 26) % 2) * 13; xx < 390; xx += 26) cv.poly([[xx, yy - 4], [xx + 4, yy], [xx, yy + 4], [xx - 4, yy]], solid(0xffffff, 0.035))
  cv.rect(0, y, 390, 3, 0, solid(0x000000, 0.35))
}
function clouds(cv, list, color, a) {
  for (const [x, y, s] of list) {
    cv.ellipse(x, y, 26 * s, 12 * s, solid(color, a))
    cv.ellipse(x - 16 * s, y + 3 * s, 14 * s, 9 * s, solid(color, a))
    cv.ellipse(x + 14 * s, y - 5 * s, 15 * s, 11 * s, solid(color, a))
  }
}
function stars(cv, n, yMax) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * 390
    const y = rnd() * yMax
    const r = rnd() < 0.15 ? 1.6 : 0.9
    cv.ellipse(x, y, r, r, solid(0xffffff, 0.5 + rnd() * 0.5))
  }
}
function hills(cv, baseY, color, bumps) {
  for (const [x, rx, ry] of bumps) cv.ellipse(x, baseY, rx, ry, solid(color))
}
function tufts(cv, y0, y1, color, n) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * 390
    const y = y0 + rnd() * (y1 - y0)
    const s = 3 + rnd() * 3
    cv.poly([[x - s, y], [x - s * 0.4, y - s * 1.6], [x, y - s * 0.3], [x + s * 0.4, y - s * 1.8], [x + s, y]], solid(color))
  }
}
function flowers(cv, y0, y1, n, night) {
  const cols = night ? [0x8f7fd0, 0x6f8fd0, 0xc0b060] : [0xff7ab8, 0xffe066, 0xffffff, 0x9fb7ff]
  for (let i = 0; i < n; i++) {
    const x = rnd() * 390
    const y = y0 + rnd() * (y1 - y0)
    const c = cols[Math.floor(rnd() * cols.length)]
    for (let k = 0; k < 4; k++) cv.ellipse(x + Math.cos(k * 1.57) * 2.4, y + Math.sin(k * 1.57) * 2.4, 2, 2, solid(c))
    cv.ellipse(x, y, 1.4, 1.4, solid(night ? 0xd0c060 : 0xffc531))
  }
}
function tree(cv, x, y, night) {
  cv.rect(x - 7, y - 50, 14, 52, 4, solid(night ? 0x3a2a30 : 0x7a4a2a))
  const leaf = night ? 0x1f4a3a : 0x3f9a45
  const leaf2 = night ? 0x2a5a48 : 0x5cbf5a
  cv.ellipse(x, y - 70, 34, 30, solid(leaf))
  cv.ellipse(x - 20, y - 56, 22, 18, solid(leaf))
  cv.ellipse(x + 22, y - 58, 22, 18, solid(leaf))
  cv.ellipse(x - 8, y - 80, 18, 14, solid(leaf2, 0.8))
}
function moon(cv, x, y) {
  cv.ellipse(x, y, 34, 34, solid(0xfff6c8, 0.12))
  cv.ellipse(x, y, 22, 22, vgrad([[0, 0xfffbe0], [1, 0xe8dca0]], y - 22, y + 22))
  cv.ellipse(x - 7, y - 4, 4, 4, solid(0xd8cc90, 0.8))
  cv.ellipse(x + 6, y + 7, 3, 3, solid(0xd8cc90, 0.8))
  cv.ellipse(x + 8, y - 8, 2, 2, solid(0xd8cc90, 0.8))
}
function sun(cv, x, y) {
  cv.ellipse(x, y, 40, 40, solid(0xfff3b0, 0.18))
  cv.ellipse(x, y, 30, 30, solid(0xfff3b0, 0.25))
  cv.ellipse(x, y, 21, 21, vgrad([[0, 0xfffbe0], [1, 0xffd23d]], y - 21, y + 21))
}

function denBg(night) {
  seed = night ? 11 : 7
  const cv = new Canvas(390, 450)
  sky(cv, 200, night ? 0x0b1238 : 0x3d86d8, night ? 0x2a3a7a : 0xa8dcff)
  if (night) {
    stars(cv, 70, 150)
    moon(cv, 320, 58)
  } else {
    sun(cv, 322, 58)
    clouds(cv, [[70, 46, 1], [205, 92, 0.75], [355, 120, 0.6]], 0xffffff, 0.92)
  }
  hills(cv, 180, night ? 0x1f3a52 : 0x86c7b0, [[40, 120, 46], [210, 150, 40], [380, 110, 52]])
  hills(cv, 192, night ? 0x234a3a : 0x5cb85c, [[-10, 130, 40], [170, 120, 30], [330, 140, 44]])
  cv.rect(0, 168, 390, 52, 0, vgrad([[0, night ? 0x2f6a3a : 0x58b84f], [1, night ? 0x1f4a2a : 0x3d8f3c]], 168, 220))
  tree(cv, 44, 182, night)
  tree(cv, 356, 176, night)
  tufts(cv, 172, 214, night ? 0x173a22 : 0x2f7a34, 60)
  flowers(cv, 176, 212, 14, night)
  if (night) for (let i = 0; i < 9; i++) cv.ellipse(rnd() * 390, 90 + rnd() * 110, 1.8, 1.8, solid(0xfff38a, 0.9))
  cv.rect(0, 216, 390, 10, 0, vgrad([[0, night ? 0x3a2a24 : 0x7a5230], [1, night ? 0x2a1e1a : 0x5a3a20]], 216, 226))
  floor(cv, 226)
  return cv
}

function battleBg(night) {
  seed = night ? 23 : 19
  const cv = new Canvas(390, 450)
  sky(cv, 140, night ? 0x0b1238 : 0x4a90e0, night ? 0x2a3a7a : 0xb8e4ff)
  if (night) {
    stars(cv, 60, 110)
    moon(cv, 60, 150)
  } else clouds(cv, [[110, 120, 0.9], [300, 18, 0.7]], 0xffffff, 0.9)
  // far mountains
  cv.poly([[0, 150], [40, 104], [80, 132], [130, 92], [180, 140], [230, 112], [290, 146], [340, 100], [390, 130], [390, 160], [0, 160]], solid(night ? 0x26305a : 0x8fb0d8))
  cv.poly([[60, 104], [72, 112], [66, 112]], solid(0xffffff, night ? 0.3 : 0.8))
  // field
  cv.rect(0, 140, 390, 124, 0, vgrad([[0, night ? 0x2a5a3a : 0x7cc96a], [1, night ? 0x1a3a24 : 0x3f9a45]], 140, 264))
  tufts(cv, 150, 262, night ? 0x173a22 : 0x2f7a34, 70)
  flowers(cv, 160, 258, 12, night)
  // platforms under the creatures
  const top = night ? 0x3a7a4a : 0x8ad870
  const side = night ? 0x2a4a2a : 0x5a8a3a
  cv.ellipse(300, 154, 74, 18, solid(INK, 0.25))
  cv.ellipse(300, 150, 72, 16, solid(side))
  cv.ellipse(300, 146, 70, 13, vgrad([[0, lighten(top, 0.2)], [1, top]], 133, 159))
  cv.ellipse(86, 259, 82, 18, solid(INK, 0.25))
  cv.ellipse(86, 255, 80, 16, solid(side))
  cv.ellipse(86, 251, 78, 13, vgrad([[0, lighten(top, 0.2)], [1, top]], 238, 264))
  floor(cv, 262)
  return cv
}

function menuBg() {
  seed = 31
  const cv = new Canvas(390, 450)
  cv.rect(0, 0, 390, 450, 0, vgrad([[0, 0x2a2058], [0.5, 0x181338], [1, 0x0c0a1e]], 0, 450))
  cv.ellipse(195, -40, 260, 170, radial(195, -40, 260, 0x5a4ab0, 0x2a2058, 0.35, 0))
  stars(cv, 40, 450)
  for (let yy = 30; yy < 450; yy += 36)
    for (let xx = ((yy / 36) % 2) * 18; xx < 390; xx += 36) cv.poly([[xx, yy - 5], [xx + 5, yy], [xx, yy + 5], [xx - 5, yy]], solid(0xffffff, 0.03))
  return cv
}

function spotBg() {
  const cv = menuBg()
  cv.ellipse(195, 196, 190, 190, radial(195, 196, 190, 0xffe08a, 0x2a2058, 0.32, 0))
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    const r0 = 70
    const r1 = 210
    cv.poly(
      [[195 + Math.cos(a - 0.05) * r0, 196 + Math.sin(a - 0.05) * r0], [195 + Math.cos(a - 0.09) * r1, 196 + Math.sin(a - 0.09) * r1], [195 + Math.cos(a + 0.09) * r1, 196 + Math.sin(a + 0.09) * r1], [195 + Math.cos(a + 0.05) * r0, 196 + Math.sin(a + 0.05) * r0]],
      solid(0xfff0b0, 0.06)
    )
  }
  return cv
}

function icon(kind) {
  const cv = new Canvas(28, 28)
  if (kind === 'paw') {
    const p = solid(0xffd84d)
    const o = solid(INK)
    for (const [x, y, rx, ry, paint] of [[14, 18, 8, 7], [6, 10, 3.6, 4.2], [11, 6, 3.6, 4.2], [17, 6, 3.6, 4.2], [22, 10, 3.6, 4.2]]) {
      cv.ellipse(x, y, rx + 1.6, ry + 1.6, o)
      void paint
    }
    for (const [x, y, rx, ry] of [[14, 18, 8, 7], [6, 10, 3.6, 4.2], [11, 6, 3.6, 4.2], [17, 6, 3.6, 4.2], [22, 10, 3.6, 4.2]]) cv.ellipse(x, y, rx, ry, p)
  } else {
    const img = sprites.render(sprites.ITEMS.charm, 28)
    cv.image(img, 28, 28, 0, 0)
  }
  return cv
}

// the egg you carry on the den (ready: glowing gold, about to hatch)
function eggIcon(ready) {
  const cv = new Canvas(44, 52)
  if (ready) cv.ellipse(22, 27, 21, 25, solid(0xffd84d, 0.45))
  cv.ellipse(22, 27, 17, 22, solid(INK))
  cv.ellipse(22, 27, 15, 20, solid(ready ? 0xf2c14a : 0x6a5fb0))
  cv.ellipse(24, 32, 12, 13, solid(ready ? 0xc8902a : 0x4f4590, 0.8))
  cv.ellipse(16, 18, 4, 6, solid(0xffffff, 0.4))
  for (const [x, y, r] of [[27, 21, 2.4], [16, 31, 2.2], [27, 36, 1.9], [20, 40, 1.6]]) cv.ellipse(x, y, r, r, solid(ready ? 0xffffff : 0xffd84d, ready ? 0.7 : 1))
  if (ready) cv.poly([[9, 24], [14, 21], [18, 25], [23, 20], [27, 24], [32, 21], [35, 24], [35, 26], [32, 23.5], [27, 26.5], [23, 22.5], [18, 27.5], [14, 23.5], [9, 26.5]], solid(INK))
  return cv
}

// ---------- everything the game uses ----------
const C = {
  green: 0x3fbf5a,
  orange: 0xf28c28,
  blue: 0x3a8ee6,
  purple: 0x8a5ad8,
  red: 0xe2474b,
  gold: 0xe0a92a,
  off: 0x4a4466,
  neutral: 0x4a3f8c,
  catch: 0x2a8ac8
}
const ELEMENT_BTN = {
  fire: 0xd8642a,
  water: 0x2f7fd0,
  grass: 0x3f9f45,
  electric: 0xc89a10,
  ice: 0x3a9cc8,
  air: 0x6a7fd8,
  earth: 0x9a6a3a,
  shadow: 0x6a4fb0,
  light: 0xc9a33a,
  none: 0x4a3f8c
}

// one letter size for a group of buttons that sit side by side
function groupScale(labels, w, h) {
  const lip = Math.max(4, Math.round(h * 0.11))
  return Math.min(...labels.map((l) => fitScale(l, w - 16, h - 4 - lip - 8)))
}

function art() {
  const A = {}
  const den = { s: groupScale(['TRAIN', 'FEED', 'TEAM', 'BOOK'], 76, 50) }
  const act = { s: groupScale(['CATCH', 'SWAP', 'RUN'], 102, 50) }
  const team = { s: groupScale(['LEADER', 'BENCH', 'JOIN', 'LEAD', 'FEED'], 104, 48) }
  const big = { s: groupScale(['NO TRACKS', 'EXPLORE', 'DREAM!', 'PICK ONE', 'CHOOSE', 'FIGHT!', 'BEATEN'], 280, 56) }
  const off = (o) => ({ ...o, textColor: 0xb0a8d0 })
  const add = (k, cv, opaque) => (A[k] = { cv, opaque })
  // backgrounds
  add('bg_den_day', denBg(false), true)
  add('bg_den_night', denBg(true), true)
  add('bg_battle_day', battleBg(false), true)
  add('bg_battle_night', battleBg(true), true)
  add('bg_menu', menuBg(), true)
  add('bg_spot', spotBg(), true)
  // den
  add('btn_explore', button(300, 56, C.green, 'EXPLORE', big))
  add('btn_dream', button(300, 56, C.purple, 'DREAM!', big))
  add('btn_notracks', button(300, 56, C.off, 'NO TRACKS', off(big)))
  add('btn_feed', button(76, 50, C.orange, 'FEED', den))
  add('btn_team', button(76, 50, C.blue, 'TEAM', den))
  add('btn_book', button(76, 50, C.purple, 'BOOK', den))
  add('btn_train', button(76, 50, C.red, 'TRAIN', den))
  add('btn_train_off', button(76, 50, C.off, 'TRAIN', off(den)))
  add('ico_egg', eggIcon(false))
  add('ico_egg_ready', eggIcon(true))
  // weekly boss (swipe right on the den)
  add('btn_fight', button(300, 56, C.red, 'FIGHT!', big))
  add('btn_fight_off', button(300, 56, C.off, 'BEATEN', off(big)))
  // battle
  for (const el in ELEMENT_BTN) add('btn_move_' + el, button(110, 58, ELEMENT_BTN[el], ''))
  add('btn_move_off', button(110, 58, C.off, ''))
  add('btn_catch', button(104, 50, C.catch, 'CATCH', act))
  add('btn_catch_off', button(104, 50, C.off, 'CATCH', off(act)))
  add('btn_swap', button(102, 50, C.neutral, 'SWAP', act))
  add('btn_swap_off', button(102, 50, C.off, 'SWAP', off(act)))
  add('btn_run', button(104, 50, C.neutral, 'RUN', act))
  add('btn_run_off', button(104, 50, C.off, 'RUN', off(act)))
  // general
  add('btn_back', button(200, 50, C.neutral, 'BACK'))
  add('btn_back_s', button(150, 50, C.neutral, 'BACK'))
  add('btn_ok', button(200, 54, C.green, 'OK'))
  add('btn_ok_off', button(200, 54, C.off, '...', { textColor: 0xb0a8d0 }))
  add('btn_prev', button(80, 50, C.neutral, '<'))
  add('btn_next', button(80, 50, C.neutral, '>'))
  add('btn_choose', button(280, 56, C.green, 'CHOOSE', big))
  add('btn_choose_off', button(280, 56, C.off, 'PICK ONE', off(big)))
  add('btn_lead', button(104, 48, C.gold, 'LEAD', team))
  add('btn_leader', button(104, 48, C.off, 'LEADER', { ...team, textColor: 0xffd84d }))
  add('btn_bench', button(104, 48, C.blue, 'BENCH', team))
  add('btn_join', button(104, 48, C.blue, 'JOIN', team))
  add('btn_feed_s', button(104, 48, C.orange, 'FEED', team))
  // settings switches
  add('tgl_on', button(92, 44, C.green, 'ON'))
  add('tgl_off', button(92, 44, C.off, 'OFF', { textColor: 0xb0a8d0 }))
  // full reset: RESET, then SURE? for a few seconds
  add('btn_reset', button(92, 44, C.red, 'RESET'))
  add('btn_sure', button(92, 44, C.gold, 'SURE?'))
  // panels
  add('pnl_info', panel(196, 78))
  add('pnl_msg', panel(354, 42, { r: 14, alpha: 0.96 }))
  add('pnl_big', panel(350, 404, { r: 26, alpha: 1 }))
  add('pnl_row', panel(334, 72))
  add('pnl_cell', panel(76, 80, { r: 14 }))
  add('pnl_cell_feed', panel(78, 92, { r: 16 }))
  add('pnl_card', panel(118, 186, { r: 18 }))
  add('pnl_card_sel', panel(118, 186, { r: 18, edge: 0xffd84d, top: 0x4a3f9a, bottom: 0x2a2360 }))
  add('pnl_chip', panel(124, 36, { r: 18 }))
  add('pnl_toast', panel(320, 66, { r: 22, alpha: 0.97, edge: 0xffd84d }))
  add('plate140', plate(140))
  add('plate152', plate(152))
  add('plate180', plate(180))
  add('badge', badge(30))
  add('ico_paw', icon('paw'))
  add('ico_charm', icon('charm'))
  // titles
  const gold = { top: 0xfffbe0, bottom: 0xffc531, side: 0xa0601a }
  const white = { top: 0xffffff, bottom: 0xc8c0ff, side: 0x4a3f8c }
  add('t_logo', title('WRISTLINGS', 4.5, gold))
  add('t_team', title('TEAM', 4, white))
  add('t_book', title('BOOK', 4, white))
  add('t_catch', title('CATCH!', 4.5, gold))
  add('t_evolution', title('EVOLUTION', 3.75, gold))
  add('t_stats', title('STATS', 3.5, gold))
  add('t_settings', title('SETTINGS', 4, white))
  add('t_boss', title('WEEKLY BOSS', 3.25, gold))
  add('t_perfect', title('PERFECT!', 4.5, gold))
  add('t_good', title('GOOD', 4.5, { top: 0xffffff, bottom: 0x8af07a, side: 0x2a7a3a }))
  add('t_miss', title('MISS', 4.5, { top: 0xffffff, bottom: 0xff8a8a, side: 0x8a2a3a }))
  add('t_gotcha', title('GOTCHA!', 4.5, { top: 0xffffff, bottom: 0x8af07a, side: 0x2a7a3a }))
  add('t_free', title('BROKE FREE!', 3.25, { top: 0xffffff, bottom: 0xff8a8a, side: 0x8a2a3a }))
  // catch countdown
  for (const n of ['3', '2', '1']) add('t_count' + n, title(n, 9, gold))
  add('t_go', title('GO!', 7, { top: 0xffffff, bottom: 0x8af07a, side: 0x2a7a3a }))
  // the watch widget (secondary-widget/index.js): same style, but dark parts stay
  // near-black so the pure black widget background stays dark on the AMOLED screen
  const dark = { r: 16, top: 0x161230, bottom: 0x0a0816, edge: 0x342b6a, alpha: 1 }
  add('w_logo', title('WRISTLINGS', 3.25, gold))
  add('w_play', button(220, 54, C.green, 'PLAY'))
  add('w_tile', panel(110, 78, dark))
  add('w_plate', darkPlate(132))
  add('w_plate_s', darkPlate(76))
  return A
}

// ---------- write ----------
const ROOT = path.join(__dirname, '..', 'assets')
const PLATFORMS = ['default.s', 'default.r', 'default.b']

function main() {
  const A = art()
  const sizes = {}
  const sheetItems = []
  for (const [k, { cv, opaque }] of Object.entries(A)) {
    const rgba = cv.out(opaque)
    const png = encodePng(cv.w, cv.h, rgba)
    for (const p of PLATFORMS) {
      const f = path.join(ROOT, p, 'ui', k + '.png')
      fs.mkdirSync(path.dirname(f), { recursive: true })
      fs.writeFileSync(f, png)
    }
    sizes[k] = [cv.w, cv.h]
    sheetItems.push({ k, w: cv.w, h: cv.h, rgba })
  }
  const js =
    '// Generated by tools/ui.cjs: the size [w, h] of every UI image in assets/.../ui/.\n' +
    '// Do not edit by hand; change tools/ui.cjs and run it again.\n' +
    'export const ART = ' + JSON.stringify(sizes).replace(/\],/g, '],\n  ').replace('{', '{\n  ').replace(/\}$/, '\n}') + '\n'
  fs.writeFileSync(path.join(__dirname, '..', 'page', 'uiart.js'), js)
  console.log('wrote', Object.keys(A).length, 'UI images + page/uiart.js')
  if (process.argv.includes('preview')) writeSheet(sheetItems)
}

// a contact sheet of everything (backgrounds first) for a quick look
function writeSheet(items) {
  const W = 1600
  let x = 0
  let y = 0
  let rowH = 0
  const placed = []
  for (const it of items) {
    if (x + it.w > W) {
      x = 0
      y += rowH + 8
      rowH = 0
    }
    placed.push({ ...it, x, y })
    x += it.w + 8
    rowH = Math.max(rowH, it.h)
  }
  const H = y + rowH
  const px = new Uint8Array(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    px[i * 4] = 0x55
    px[i * 4 + 1] = 0x55
    px[i * 4 + 2] = 0x55
    px[i * 4 + 3] = 255
  }
  for (const it of placed)
    for (let j = 0; j < it.h; j++)
      for (let i = 0; i < it.w; i++) {
        const s = (j * it.w + i) * 4
        const a = it.rgba[s + 3] / 255
        const d = ((it.y + j) * W + it.x + i) * 4
        for (let k = 0; k < 3; k++) px[d + k] = Math.round(it.rgba[s + k] * a + px[d + k] * (1 - a))
      }
  fs.writeFileSync(path.join(__dirname, 'ui_sheet.png'), encodePng(W, H, px))
  console.log('wrote tools/ui_sheet.png')
}

// other tools (e.g. tools/sheet.cjs) reuse the canvas and the 3D font
module.exports = { Canvas, text3d, textWidth, solid }

if (require.main === module) main()
