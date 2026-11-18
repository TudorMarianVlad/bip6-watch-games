// Alchemist's Cauldron art generator.
//
// Every ingredient is a list of simple shapes (ellipses, polygons, thick lines) in a 100 x 100 box.
// The renderer adds toon shading (light from the top-left), a dark outline around the silhouette,
// soft glows and anti-aliasing (4x supersampling), then puts the icon on a glossy tile.
//
// Run:  node tools/art.cjs          (writes PNGs into assets/default.{s,r,b}/)
//       node tools/art.cjs sheet    (also writes tools/sheet.png, a preview of every tile)
//
// Outputs
//   t<L>_<v>.png   tile for level L (1..14) or "c" (catalyst); v = s1 | s2 | n | p
//                  (spawn small, spawn mid, normal, merge pop). All are 84x84 with the
//                  70x70 tile centred, so a tile never changes position when its size changes.
//   bg.png         the cauldron scene (390x450) with a transparent hole for the liquid
//   menu.png       the title-screen backdrop (390x450)
//   bubble.png     a rising bubble (14x14)
//   spoon.png      the stirring spoon (undo) for the top bar (32x32)
//   icon.png       app icon (248x248)

const fs = require('fs')
const path = require('path')
const { encodePng } = require('./png.cjs')

const OUT = path.join(__dirname, '..', 'assets')
const SS = 4 // supersampling
const INK = 0x1a1226

// ---------- colour helpers ----------
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const WHITE3 = [255, 255, 255]
const SHADE3 = rgb(0x1e1430)

// ---------- a premultiplied RGBA float buffer ----------
function buffer(w, h) {
  return { w, h, d: new Float32Array(w * h * 4) }
}
function over(b, x, y, col, a) {
  if (a <= 0 || x < 0 || y < 0 || x >= b.w || y >= b.h) return
  const i = (y * b.w + x) * 4
  const k = 1 - a
  b.d[i] = col[0] * a + b.d[i] * k
  b.d[i + 1] = col[1] * a + b.d[i + 1] * k
  b.d[i + 2] = col[2] * a + b.d[i + 2] * k
  b.d[i + 3] = a + b.d[i + 3] * k
}
function erase(b, x, y) {
  const i = (y * b.w + x) * 4
  b.d[i] = b.d[i + 1] = b.d[i + 2] = b.d[i + 3] = 0
}
// layer `src` over `dst` (same size)
function composite(dst, src) {
  const n = dst.w * dst.h * 4
  for (let i = 0; i < n; i += 4) {
    const a = src.d[i + 3]
    if (a <= 0) continue
    const k = 1 - a
    dst.d[i] = src.d[i] + dst.d[i] * k
    dst.d[i + 1] = src.d[i + 1] + dst.d[i + 1] * k
    dst.d[i + 2] = src.d[i + 2] + dst.d[i + 2] * k
    dst.d[i + 3] = a + dst.d[i + 3] * k
  }
}
function downsample(b, s) {
  const w = b.w / s
  const h = b.h / s
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, bl = 0, a = 0
      for (let yy = 0; yy < s; yy++)
        for (let xx = 0; xx < s; xx++) {
          const i = ((y * s + yy) * b.w + x * s + xx) * 4
          r += b.d[i]; g += b.d[i + 1]; bl += b.d[i + 2]; a += b.d[i + 3]
        }
      const n = s * s
      const o = (y * w + x) * 4
      a /= n
      out[o + 3] = Math.round(Math.min(1, a) * 255)
      if (a > 0) {
        out[o] = Math.round(Math.min(255, r / n / a))
        out[o + 1] = Math.round(Math.min(255, g / n / a))
        out[o + 2] = Math.round(Math.min(255, bl / n / a))
      }
    }
  return { w, h, px: out }
}

// ---------- shapes (100 x 100 box) ----------
const E = (x, y, rx, ry, c, o = {}) => ({ t: 'e', x, y, rx, ry, rot: o.rot || 0, c, ...o })
const C = (x, y, r, c, o = {}) => E(x, y, r, r, c, o)
const P = (pts, c, o = {}) => ({ t: 'p', pts, c, ...o })
const Lw = (x1, y1, x2, y2, w, c, o = {}) => ({ t: 'l', x1, y1, x2, y2, w, c, ...o })
const G = (x, y, r, c, a = 0.6) => ({ t: 'g', x, y, r, c, a }) // soft glow (not outlined)
const flat = { flat: true }
const CUT = { cut: true }

function star(cx, cy, rIn, rOut, n, rot = -Math.PI / 2) {
  const pts = []
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? rIn : rOut
    const a = (Math.PI * i) / n + rot
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return pts
}
const twinkle = (x, y, r, c = 0xffffff) => P(star(x, y, r * 0.28, r, 4), c, flat)
function ellipsePts(cx, cy, rx, ry, n = 48) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
  }
  return pts
}
// the part of an ellipse below the line y = yc (convex clip)
function ellipseBelow(cx, cy, rx, ry, yc) {
  const src = ellipsePts(cx, cy, rx, ry, 64)
  const out = []
  for (let i = 0; i < src.length; i++) {
    const a = src[i]
    const b = src[(i + 1) % src.length]
    const ain = a[1] >= yc
    const bin = b[1] >= yc
    if (ain) out.push(a)
    if (ain !== bin) {
      const t = (yc - a[1]) / (b[1] - a[1])
      out.push([a[0] + (b[0] - a[0]) * t, yc])
    }
  }
  return out
}
function dome(cx, cy, rx, ry) {
  const pts = []
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI + (i / 24) * Math.PI
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
  }
  pts.push([cx + rx * 0.8, cy + ry * 0.22], [cx, cy + ry * 0.3], [cx - rx * 0.8, cy + ry * 0.22])
  return pts
}
function drop(cx, cy, r) {
  const pts = [[cx, cy - r * 2.1]]
  for (let i = 0; i <= 20; i++) {
    const a = -0.25 * Math.PI + (i / 20) * 1.5 * Math.PI
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return pts
}

// ---------- the ingredients ----------
const LEVELS = [
  null,
  {
    name: 'HERB', tile: 0x6f8f52,
    icon: [
      Lw(50, 92, 50, 44, 5, 0x3f7a2a),
      E(33, 55, 11, 23, 0x5cb83a, { rot: -0.7 }),
      E(67, 55, 11, 23, 0x5cb83a, { rot: 0.7 }),
      E(50, 32, 12, 25, 0x7ad048),
      Lw(50, 50, 50, 14, 1.8, 0x3f8a2a, flat),
      Lw(46, 66, 24, 44, 1.8, 0x3f8a2a, flat),
      Lw(54, 66, 76, 44, 1.8, 0x3f8a2a, flat)
    ]
  },
  {
    name: 'TOADSTOOL', tile: 0x8f6e4e,
    icon: [
      E(50, 72, 12, 20, 0xf3e6c8),
      E(50, 54, 30, 6, 0xc9a882),
      P(dome(50, 52, 38, 34), 0xe0402f),
      C(36, 34, 6, 0xffffff, flat), C(56, 26, 5, 0xffffff, flat), C(68, 42, 5, 0xffffff, flat), C(48, 44, 4, 0xffffff, flat), C(24, 46, 3.5, 0xffffff, flat)
    ]
  },
  {
    name: 'DEWDROP', tile: 0x3f6fb0,
    icon: [
      G(50, 56, 40, 0x8fd3ff, 0.35),
      P(drop(50, 62, 27), 0x4ab0ff),
      E(39, 58, 6, 11, 0xffffff, { rot: 0.3, flat: true }),
      C(44, 74, 3, 0xe0f4ff, flat),
      P(drop(78, 80, 7), 0x8fd3ff)
    ]
  },
  {
    name: 'CRYSTAL', tile: 0x2f8f98,
    icon: [
      P([[24, 42], [36, 52], [38, 90], [22, 90], [16, 58]], 0x3fb8d8),
      P([[76, 46], [84, 60], [80, 90], [62, 90], [64, 54]], 0x6ad8f0),
      P([[50, 8], [66, 32], [62, 90], [38, 90], [34, 32]], 0x7af0ff),
      P([[50, 8], [66, 32], [62, 90], [50, 90]], 0x3fc8e0, flat),
      P([[50, 8], [56, 30], [44, 30]], 0xd8ffff, flat),
      twinkle(26, 22, 8)
    ]
  },
  {
    name: 'EMBER', tile: 0xb0502a,
    icon: [
      G(50, 60, 42, 0xffb03d, 0.5),
      P([[50, 6], [60, 26], [72, 40], [76, 60], [68, 82], [50, 92], [32, 82], [24, 62], [28, 44], [38, 34], [42, 20]], 0xff5a2a),
      P([[74, 20], [80, 38], [72, 44]], 0xff5a2a),
      P([[50, 30], [62, 50], [64, 68], [56, 84], [44, 84], [36, 68], [40, 52]], 0xffa83d, flat),
      P([[50, 52], [58, 68], [54, 84], [46, 84], [42, 68]], 0xffe26b, flat)
    ]
  },
  {
    name: 'MOONSTONE', tile: 0x4c509a,
    icon: [
      G(46, 52, 40, 0xfff0b0, 0.35),
      C(46, 52, 34, 0xf6eab8),
      C(64, 40, 28, 0, CUT),
      C(30, 50, 4, 0xd8c890, flat), C(40, 70, 5, 0xd8c890, flat), C(26, 66, 2.5, 0xd8c890, flat),
      twinkle(74, 70, 9), twinkle(80, 20, 6)
    ]
  },
  {
    name: 'POTION', tile: 0x9a2f50,
    icon: [
      P([[42, 14], [58, 14], [58, 42], [42, 42]], 0xcfe8f0),
      P([[39, 4], [61, 4], [59, 16], [41, 16]], 0xb07a3f),
      C(50, 64, 30, 0xcfe8f0),
      P(ellipseBelow(50, 64, 26, 26, 54), 0xe0304a, flat),
      E(50, 54, 25, 3, 0xff6a80, flat),
      E(38, 56, 5, 9, 0xffffff, { rot: 0.4, flat: true }),
      C(58, 72, 4, 0xff8098, flat), C(48, 80, 2.5, 0xff8098, flat)
    ]
  },
  {
    name: 'ELIXIR', tile: 0x6a35a8,
    icon: [
      G(50, 60, 40, 0xd8a8ff, 0.4),
      P([[45, 14], [55, 14], [55, 30], [45, 30]], 0xd9c8ff),
      E(50, 12, 9, 6, 0xffc84a),
      P([[50, 26], [76, 60], [50, 94], [24, 60]], 0xc8a0ff),
      P([[36, 66], [64, 66], [50, 88]], 0x8a3dff, flat),
      P([[30, 60], [70, 60], [64, 66], [36, 66]], 0xa86aff, flat),
      Lw(40, 48, 32, 58, 3, 0xffffff, flat),
      twinkle(80, 30, 9, 0xfff0a0), twinkle(18, 84, 7, 0xfff0a0)
    ]
  },
  {
    name: 'DRAGON EGG', tile: 0x2f8050,
    icon: [
      E(50, 54, 28, 37, 0x4ccf74),
      E(40, 36, 6, 4, 0x2a9a50, flat), E(58, 46, 7, 4, 0x2a9a50, flat), E(38, 60, 7, 4, 0x2a9a50, flat), E(60, 70, 7, 4, 0x2a9a50, flat), E(46, 80, 6, 3.5, 0x2a9a50, flat),
      C(56, 30, 3, 0xffd23d, flat), C(30, 48, 3, 0xffd23d, flat), C(70, 56, 3, 0xffd23d, flat),
      Lw(50, 18, 56, 28, 2, 0x1a5a30, flat), Lw(56, 28, 50, 36, 2, 0x1a5a30, flat)
    ]
  },
  {
    name: 'PHOENIX PLUME', tile: 0xc8682a,
    icon: [
      G(56, 44, 40, 0xffd060, 0.45),
      Lw(26, 94, 52, 52, 3.5, 0xfff0c8),
      E(58, 40, 17, 38, 0xff6a2a, { rot: 0.55 }),
      E(60, 38, 10, 30, 0xffc83d, { rot: 0.55, flat: true }),
      E(68, 22, 6, 13, 0xff3d2a, { rot: 0.55, flat: true }),
      Lw(34, 82, 74, 14, 1.8, 0xb8401a, flat)
    ]
  },
  {
    name: "PHILOSOPHER'S STONE", short: 'STONE', tile: 0xd4a030,
    icon: [
      G(50, 50, 46, 0xfff2a0, 0.6),
      P([[50, 10], [80, 30], [80, 66], [50, 90], [20, 66], [20, 30]], 0xd8203a),
      P([[50, 10], [80, 30], [64, 36], [36, 36], [20, 30]], 0xff5a6a, flat),
      P([[36, 36], [64, 36], [64, 62], [50, 72], [36, 62]], 0xff3550, flat),
      P([[80, 30], [80, 66], [64, 62], [64, 36]], 0xa8102a, flat),
      P([[50, 90], [50, 72], [64, 62], [80, 66]], 0x8a0820, flat),
      P([[40, 40], [48, 40], [40, 52]], 0xffffff, flat)
    ]
  },
  {
    name: 'STARHEART', tile: 0x2a3c8a,
    icon: [
      G(50, 52, 46, 0xfff6b0, 0.55),
      P(star(50, 54, 18, 42, 5), 0xffe066),
      P(star(50, 54, 9, 21, 5), 0xfff8d0, flat),
      twinkle(18, 20, 7), twinkle(84, 82, 6)
    ]
  },
  {
    name: 'NEBULA', tile: 0x40206a,
    icon: [
      G(50, 50, 46, 0xd080ff, 0.5),
      E(50, 50, 40, 20, 0x6a4adf, { rot: -0.45 }),
      E(50, 50, 28, 13, 0xc06aff, { rot: -0.45, flat: true }),
      E(50, 50, 14, 8, 0xffb8f0, { rot: -0.45, flat: true }),
      C(50, 50, 5, 0xffffff, flat),
      C(24, 38, 2, 0xffffff, flat), C(72, 70, 2, 0xffffff, flat), C(70, 28, 1.6, 0xffffff, flat),
      twinkle(20, 78, 8, 0x9ff0ff)
    ]
  },
  {
    name: 'ETERNITY', tile: 0xe8dcc0,
    icon: [
      G(50, 50, 46, 0xffe080, 0.5),
      E(31, 50, 20, 18, 0xffa82a), E(31, 50, 9, 7, 0, CUT),
      E(69, 50, 20, 18, 0xffa82a), E(69, 50, 9, 7, 0, CUT),
      twinkle(50, 18, 9, 0xfff6c0), twinkle(50, 84, 7, 0xfff6c0)
    ]
  }
]
const MAX_LEVEL = LEVELS.length - 1
const CATALYST = {
  name: 'CATALYST', tile: 0x241a3a,
  icon: [
    G(50, 50, 46, 0xff8ae0, 0.55),
    P(star(50, 50, 10, 44, 4), 0xff6ad8),
    P(star(50, 50, 5, 24, 4), 0xffffff, flat),
    twinkle(80, 20, 9, 0x8ff0ff), twinkle(22, 80, 8, 0x8ff0ff), twinkle(20, 22, 5, 0xfff08a)
  ]
}

// ---------- shape raster ----------
// map(x, y) in the 100 box -> hi-res pixels; k = pixels per unit
function inShape(s, x, y) {
  if (s.t === 'e') {
    let dx = x - s.x
    let dy = y - s.y
    if (s.rot) {
      const c = Math.cos(-s.rot)
      const sn = Math.sin(-s.rot)
      const tx = dx * c - dy * sn
      dy = dx * sn + dy * c
      dx = tx
    }
    const u = dx / s.rx
    const v = dy / s.ry
    const d = u * u + v * v
    return d <= 1 ? { u, v } : null
  }
  if (s.t === 'p') {
    let inside = false
    const p = s.pts
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      if (p[i][1] > y !== p[j][1] > y && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside
    }
    return inside ? { poly: true } : null
  }
  if (s.t === 'l') {
    const vx = s.x2 - s.x1
    const vy = s.y2 - s.y1
    const len2 = vx * vx + vy * vy || 1
    const t = Math.max(0, Math.min(1, ((x - s.x1) * vx + (y - s.y1) * vy) / len2))
    const ex = x - (s.x1 + vx * t)
    const ey = y - (s.y1 + vy * t)
    return ex * ex + ey * ey <= (s.w / 2) * (s.w / 2) ? { line: true } : null
  }
  return null
}
function bounds(s) {
  if (s.t === 'e') {
    const r = Math.max(s.rx, s.ry)
    return [s.x - r, s.y - r, s.x + r, s.y + r]
  }
  if (s.t === 'p') {
    const xs = s.pts.map((p) => p[0])
    const ys = s.pts.map((p) => p[1])
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
  }
  if (s.t === 'l') return [Math.min(s.x1, s.x2) - s.w, Math.min(s.y1, s.y2) - s.w, Math.max(s.x1, s.x2) + s.w, Math.max(s.y1, s.y2) + s.w]
  return [s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r]
}
const L3 = (() => {
  const v = [-0.5, -0.62, 0.6]
  const n = Math.hypot(...v)
  return v.map((a) => a / n)
})()
function shadeColor(s, hit, yRel) {
  const base = rgb(s.c)
  if (s.flat) return base
  if (hit.u !== undefined) {
    const z = Math.sqrt(Math.max(0, 1 - hit.u * hit.u - hit.v * hit.v))
    // rotate the light into the ellipse frame is overkill: use screen-space u/v
    const lam = hit.u * L3[0] + hit.v * L3[1] + z * L3[2]
    if (lam > 0.86) return mix(base, WHITE3, 0.42)
    if (lam < 0.3) return mix(base, SHADE3, 0.32)
    return base
  }
  // polygons and lines: light top, dark bottom
  if (yRel < 0.22) return mix(base, WHITE3, 0.22)
  if (yRel > 0.72) return mix(base, SHADE3, 0.28)
  return base
}

// draw an icon (shapes) into hi-res buffers. ox, oy = top-left of the 100 box in hi-res px; k = px per unit
function drawIcon(dst, shapes, ox, oy, k, outlinePx) {
  const layer = buffer(dst.w, dst.h)
  const glow = buffer(dst.w, dst.h)
  for (const s of shapes) {
    const [bx0, by0, bx1, by1] = bounds(s)
    const x0 = Math.max(0, Math.floor(ox + bx0 * k))
    const y0 = Math.max(0, Math.floor(oy + by0 * k))
    const x1 = Math.min(dst.w - 1, Math.ceil(ox + bx1 * k))
    const y1 = Math.min(dst.h - 1, Math.ceil(oy + by1 * k))
    if (s.t === 'g') {
      const col = rgb(s.c)
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const d = Math.hypot((x + 0.5 - ox) / k - s.x, (y + 0.5 - oy) / k - s.y) / s.r
          if (d < 1) over(glow, x, y, col, s.a * Math.pow(1 - d, 1.8))
        }
      continue
    }
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const ux = (x + 0.5 - ox) / k
        const uy = (y + 0.5 - oy) / k
        const hit = inShape(s, ux, uy)
        if (!hit) continue
        if (s.cut) {
          erase(layer, x, y)
          continue
        }
        over(layer, x, y, shadeColor(s, hit, (uy - by0) / Math.max(1, by1 - by0)), 1)
      }
  }
  composite(dst, glow)
  // outline: chamfer distance from the silhouette, ink within outlinePx
  if (outlinePx > 0) {
    const W = dst.w
    const H = dst.h
    const dist = new Float32Array(W * H)
    const BIG = 1e9
    for (let i = 0; i < W * H; i++) dist[i] = layer.d[i * 4 + 3] > 0.5 ? 0 : BIG
    const a = 1
    const b = 1.4142
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        let v = dist[i]
        if (x > 0) v = Math.min(v, dist[i - 1] + a)
        if (y > 0) {
          v = Math.min(v, dist[i - W] + a)
          if (x > 0) v = Math.min(v, dist[i - W - 1] + b)
          if (x < W - 1) v = Math.min(v, dist[i - W + 1] + b)
        }
        dist[i] = v
      }
    for (let y = H - 1; y >= 0; y--)
      for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x
        let v = dist[i]
        if (x < W - 1) v = Math.min(v, dist[i + 1] + a)
        if (y < H - 1) {
          v = Math.min(v, dist[i + W] + a)
          if (x < W - 1) v = Math.min(v, dist[i + W + 1] + b)
          if (x > 0) v = Math.min(v, dist[i + W - 1] + b)
        }
        dist[i] = v
      }
    const ink = rgb(INK)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const d = dist[y * W + x]
        if (d > 0 && d <= outlinePx) over(dst, x, y, ink, 1)
      }
  }
  composite(dst, layer)
}

// ---------- rounded rect helpers ----------
function sdRoundRect(x, y, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const hx = (x1 - x0) / 2 - r
  const hy = (y1 - y0) / 2 - r
  const qx = Math.abs(x - cx) - hx
  const qy = Math.abs(y - cy) - hy
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

// 3x5 digits for the level badge
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111']

// ---------- a tile ----------
const CANVAS = 84
const TILE = 70
function tile(def, scale, badge) {
  const N = CANVAS * SS
  const b = buffer(N, N)
  const c = N / 2
  const half = (TILE * scale * SS) / 2
  const r = 15 * scale * SS
  const x0 = c - half
  const y0 = c - half
  const x1 = c + half
  const y1 = c + half
  const base = rgb(def.tile)
  const dark = mix(base, SHADE3, 0.55)
  const light = mix(base, WHITE3, 0.35)
  // drop shadow
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = sdRoundRect(x + 0.5, y + 0.5, x0 + 1 * SS, y0 + 4 * SS * scale, x1 + 1 * SS, y1 + 4 * SS * scale, r)
      if (d < 0) over(b, x, y, [8, 4, 16], 0.45)
    }
  // body: border, vertical gradient, top gloss, inner rim
  const bw = 2.2 * SS
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = sdRoundRect(x + 0.5, y + 0.5, x0, y0, x1, y1, r)
      if (d > 0) continue
      const t = (y - y0) / (y1 - y0)
      let col
      if (d > -bw) col = dark
      else {
        col = mix(mix(base, WHITE3, 0.12), mix(base, SHADE3, 0.25), t)
        if (d > -bw - 2 * SS && t < 0.5) col = mix(col, light, 0.6)
        // gloss: a soft lighter cap on the top third
        const gy = (y - y0) / (y1 - y0)
        if (gy < 0.36 && d < -bw - 4 * SS) col = mix(col, WHITE3, 0.1)
      }
      over(b, x, y, col, 1)
    }
  // icon
  const box = 56 * scale * SS
  drawIcon(b, def.icon, c - box / 2, c - box / 2 - 2 * SS * scale, box / 100, 2.2 * SS * scale)
  // level badge (bottom right)
  if (badge) {
    const br = 9.5 * scale * SS
    const bx = x1 - 10 * scale * SS
    const by = y1 - 10 * scale * SS
    for (let y = Math.floor(by - br - SS); y <= by + br + SS; y++)
      for (let x = Math.floor(bx - br - SS); x <= bx + br + SS; x++) {
        const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by)
        if (d <= br) over(b, x, y, d > br - 1.6 * SS ? [255, 236, 190] : rgb(INK), 1)
      }
    const s = String(badge)
    const p = 2 * scale * SS * (s.length > 1 ? 0.8 : 1)
    const tw = s.length * 3 * p + (s.length - 1) * p
    let gx = bx - tw / 2
    const gy = by - 2.5 * p
    for (const ch of s) {
      const m = DIGITS[+ch]
      for (let yy = 0; yy < 5; yy++)
        for (let xx = 0; xx < 3; xx++) {
          if (m[yy * 3 + xx] !== '1') continue
          for (let py = Math.round(gy + yy * p); py < Math.round(gy + (yy + 1) * p); py++)
            for (let px = Math.round(gx + xx * p); px < Math.round(gx + (xx + 1) * p); px++) over(b, px, py, [255, 244, 214], 1)
        }
      gx += 4 * p
    }
  }
  return downsample(b, SS)
}

// ---------- scenes ----------
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
const WALL_TOP = rgb(0x231a3c)
const WALL_BOT = rgb(0x150f26)
function wall(x, y, H, warm) {
  let col = mix(WALL_TOP, WALL_BOT, y / H)
  const row = Math.floor(y / 24)
  const off = row % 2 ? 22 : 0
  const bx = Math.floor((x + off) / 44)
  const lx = (x + off) - bx * 44
  const ly = y - row * 24
  const v = hash(bx, row)
  col = mix(col, v > 0.5 ? WHITE3 : SHADE3, Math.abs(v - 0.5) * 0.12)
  if (lx < 2 || ly < 2) col = mix(col, [8, 5, 14], 0.55)
  else if (ly < 4) col = mix(col, WHITE3, 0.04)
  if (warm > 0) col = mix(col, [255, 120, 50], warm)
  return col
}

function sceneBuffer(w, h, s, fn) {
  const b = buffer(w * s, h * s)
  for (let y = 0; y < h * s; y++)
    for (let x = 0; x < w * s; x++) {
      const res = fn((x + 0.5) / s, (y + 0.5) / s)
      if (res) over(b, x, y, res[0], res[1] === undefined ? 1 : res[1])
    }
  return b
}

const IRON = rgb(0x3a3648)
const IRON_LIGHT = rgb(0x5c5872)
const IRON_DARK = rgb(0x1e1b28)
const INK3 = rgb(INK)

function fire(x, y, x0, x1, yBase, height) {
  if (x < x0 || x > x1) return null
  const t = (x - x0) / (x1 - x0)
  const env = Math.sin(t * Math.PI)
  const h = height * env * (0.65 + 0.2 * Math.sin(x * 0.21) + 0.15 * Math.sin(x * 0.53 + 2))
  const top = yBase - h
  if (y < top) return null
  const k = (y - top) / Math.max(1, h)
  if (k < 0.18) return [[255, 70, 30], 1]
  if (k < 0.45) return [[255, 140, 40], 1]
  return [[255, 222, 110], 1]
}

// the game scene: wall, cauldron with a hole for the liquid, lip, handles, feet and fire
const HOLE = [34, 76, 356, 400, 24]
function gameScene(x, y) {
  const H = 450
  // fire under the pot (drawn before the pot so the pot overlaps it)
  const warm = y > 300 ? Math.min(0.22, ((y - 300) / 150) * 0.22) * Math.max(0, 1 - Math.abs(x - 195) / 230) : 0
  let col = wall(x, y, H, warm)
  const f = fire(x, y, 112, 278, 452, 46)
  if (f) col = f[0]
  // logs
  const log1 = Math.abs((y - 440) - (x - 195) * 0.12) < 5 && x > 120 && x < 270
  const log2 = Math.abs((y - 442) + (x - 195) * 0.12) < 5 && x > 120 && x < 270
  if (log1 || log2) col = mix(rgb(0x6a3f22), [0, 0, 0], (y - 434) / 30)
  // feet
  for (const fx of [84, 306]) {
    const d = sdRoundRect(x, y, fx - 18, 400, fx + 18, 432, 8)
    if (d < 0) col = d > -1.6 ? INK3 : mix(IRON, IRON_DARK, (y - 400) / 32)
  }
  // handles (rings on both sides)
  for (const hx of [16, 374]) {
    const d = Math.abs(Math.hypot(x - hx, y - 196) - 15)
    if (d < 4.5) col = d > 3 ? INK3 : mix(IRON_LIGHT, IRON_DARK, (y - 181) / 30)
  }
  // pot body
  const dp = sdRoundRect(x, y, 22, 64, 368, 416, 42)
  if (dp < 0) {
    const dh = sdRoundRect(x, y, HOLE[0], HOLE[1], HOLE[2], HOLE[3], HOLE[4])
    if (dh < 0) return [col, 1] // the hole: the liquid widget shows through
    if (dp > -1.8 || dh < 1.8) col = INK3
    else {
      const tx = (x - 22) / 346
      col = mix(IRON_LIGHT, IRON, Math.min(1, tx * 2.2))
      if (tx > 0.7) col = mix(col, IRON_DARK, (tx - 0.7) * 1.6)
      if (dp > -5) col = mix(col, x < 195 ? IRON_LIGHT : IRON_DARK, 0.5)
      if (dh < 5) col = mix(col, IRON_DARK, 0.6) // inner lip shadow
      // warm light from the fire on the lower pot
      if (y > 330) col = mix(col, [255, 120, 50], Math.min(0.28, (y - 330) / 300))
      // rivets
      for (const [rx, ry] of [[28, 120], [28, 260], [28, 360], [362, 120], [362, 260], [362, 360], [120, 408], [195, 408], [270, 408]]) {
        const d = Math.hypot(x - rx, y - ry)
        if (d < 3.2) col = d > 2.3 ? INK3 : mix(IRON_LIGHT, WHITE3, 0.25)
      }
    }
  }
  // lip
  const dl = sdRoundRect(x, y, 12, 58, 378, 82, 11)
  if (dl < 0) {
    if (dl > -1.8) col = INK3
    else {
      const t = (y - 58) / 24
      col = t < 0.3 ? mix(IRON_LIGHT, WHITE3, 0.18) : t > 0.75 ? IRON_DARK : IRON_LIGHT
    }
  }
  return [col, 1]
}

// the hole must be fully transparent: punch it after supersampling-friendly drawing
function punchHole(b, s) {
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      const px = (x + 0.5) / s
      const py = (y + 0.5) / s
      if (py >= 80 && sdRoundRect(px, py, HOLE[0], HOLE[1], HOLE[2], HOLE[3], HOLE[4]) < 0) erase(b, x, y)
    }
}

const SHELVES = [196, 286]
function menuScene(x, y) {
  const H = 450
  let col = wall(x, y, H, 0)
  // green glow rising from the cauldron
  const g = Math.max(0, 1 - Math.hypot((x - 195) / 230, (y - 360) / 200))
  col = mix(col, [90, 255, 150], g * g * 0.35)
  // two small shelves on each side wall (beside the menu buttons) with bottles
  for (const sy of SHELVES) {
    for (const [sx0, sx1] of [[4, 72], [318, 386]]) {
      if (y > sy && y < sy + 8 && x > sx0 && x < sx1) col = y < sy + 2 ? rgb(0x8a5a32) : rgb(0x4a2c18)
    }
  }
  const bottles = [[24, 0, 0x3fd07a, 14], [52, 0, 0xff5a6a, 18], [338, 0, 0xffc84a, 16], [364, 0, 0x4ab0ff, 20], [26, 1, 0x8a6aff, 12], [52, 1, 0xff8ad8, 16], [338, 1, 0x5dff9a, 13], [364, 1, 0xff9a3d, 18]]
  for (const [bx, k, c, h] of bottles) {
    const sy = SHELVES[k]
    const body = Math.hypot(x - bx, (y - (sy - 9)) * 1.1) < 9
    const neck = Math.abs(x - bx) < 3 && y > sy - 9 - h && y < sy - 9
    if (body || neck) col = mix(rgb(c), y < sy - 11 ? WHITE3 : SHADE3, 0.25)
  }
  // big cauldron at the bottom
  const dl = sdRoundRect(x, y, 30, 336, 360, 362, 13)
  const dp = sdRoundRect(x, y, 48, 346, 342, 520, 70)
  if (dp < 0) {
    col = dp > -1.8 ? INK3 : mix(IRON_LIGHT, IRON_DARK, Math.min(1, (x - 48) / 294 * 1.2))
  }
  // liquid surface visible above the lip
  const le = ((x - 195) / 150) ** 2 + ((y - 338) / 13) ** 2
  if (le < 1) col = mix(rgb(0x5dff9a), rgb(0x1f9a5a), Math.sqrt(le))
  if (dl < 0) {
    if (dl > -1.8) col = INK3
    else col = (y - 336) / 26 < 0.35 ? mix(IRON_LIGHT, WHITE3, 0.18) : IRON_LIGHT
  }
  return [col, 1]
}

// ---------- small sprites ----------
function bubble() {
  const S = 14
  const b = sceneBuffer(S, S, SS, (x, y) => {
    const d = Math.hypot(x - 7, y - 7)
    if (d > 6) return null
    if (d > 4.6) return [[220, 255, 230], 0.85]
    if (Math.hypot(x - 5, y - 5) < 1.6) return [[255, 255, 255], 0.95]
    return [[200, 255, 220], 0.18]
  })
  return downsample(b, SS)
}

function spoon() {
  const S = 32
  const b = buffer(S * SS, S * SS)
  drawIcon(b, [
    Lw(22, 86, 66, 34, 9, 0xc8904a),
    E(74, 24, 14, 19, 0xd8a058, { rot: 0.7 }),
    E(75, 23, 8, 12, 0x9a6a32, { rot: 0.7, flat: true })
  ], 0, 0, (S * SS) / 100, 1.5 * SS)
  return downsample(b, SS)
}

function appIcon() {
  const S = 248
  const s = 2
  const b = sceneBuffer(S, S, s, (x, y) => {
    const d = Math.hypot(x - 124, y - 124)
    if (d > 123) return null
    let col = mix(rgb(0x3a2466), rgb(0x150f26), d / 124)
    const g = Math.max(0, 1 - Math.hypot((x - 124) / 120, (y - 150) / 90))
    col = mix(col, [90, 255, 150], g * 0.45)
    // pot
    const dp = sdRoundRect(x, y, 44, 140, 204, 250, 56)
    if (dp < 0) col = dp > -3 ? INK3 : mix(IRON_LIGHT, IRON_DARK, (x - 44) / 160)
    const le = ((x - 124) / 86) ** 2 + ((y - 140) / 16) ** 2
    if (le < 1) col = mix(rgb(0x7dffb0), rgb(0x1f9a5a), Math.sqrt(le))
    const dl = sdRoundRect(x, y, 30, 136, 218, 158, 11)
    if (dl < 0 && y > 147) col = dl > -3 ? INK3 : IRON_LIGHT
    const alpha = Math.max(0, Math.min(1, 123 - d))
    return [col, alpha]
  })
  // the Philosopher's Stone floating above the cauldron + bubbles
  drawIcon(b, LEVELS[11].icon, 124 * s - 46 * s, 30 * s, (92 * s) / 100, 3 * s)
  drawIcon(b, [C(50, 50, 30, 0xb0ffd0)], 70 * s, 104 * s, (16 * s) / 100, 1.5 * s)
  drawIcon(b, [C(50, 50, 30, 0xb0ffd0)], 160 * s, 96 * s, (22 * s) / 100, 1.5 * s)
  return downsample(b, s)
}

// ---------- write ----------
function write(name, img) {
  const png = encodePng(img.w, img.h, img.px)
  for (const d of ['default.s', 'default.r', 'default.b']) {
    const dir = path.join(OUT, d)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, name), png)
  }
  return png.length
}

const VARIANTS = { s1: 0.45, s2: 0.8, n: 1, p: 1.12 }
let total = 0
const sheet = []
for (let L = 1; L <= MAX_LEVEL; L++) {
  for (const v in VARIANTS) {
    const img = tile(LEVELS[L], VARIANTS[v], VARIANTS[v] >= 0.8 ? L : 0)
    total += write('t' + L + '_' + v + '.png', img)
    if (v === 'n') sheet.push(img)
  }
}
for (const v in VARIANTS) {
  const img = tile(CATALYST, VARIANTS[v], 0)
  total += write('tc_' + v + '.png', img)
  if (v === 'n') sheet.push(img)
}
const bgBuf = sceneBuffer(390, 450, 2, gameScene)
punchHole(bgBuf, 2)
total += write('bg.png', downsample(bgBuf, 2))
total += write('menu.png', downsample(sceneBuffer(390, 450, 2, menuScene), 2))
total += write('bubble.png', bubble())
total += write('spoon.png', spoon())
const icon = appIcon()
total += write('icon.png', icon)
console.log('art written: ' + Math.round(total / 1024) + ' KB per folder')

if (process.argv.includes('sheet')) {
  const cols = 5
  const rows = Math.ceil(sheet.length / cols)
  const w = cols * CANVAS
  const h = rows * CANVAS
  const px = new Uint8Array(w * h * 4)
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 0x2a; px[i + 1] = 0x22; px[i + 2] = 0x40; px[i + 3] = 255
  }
  sheet.forEach((img, n) => {
    const ox = (n % cols) * CANVAS
    const oy = Math.floor(n / cols) * CANVAS
    for (let y = 0; y < CANVAS; y++)
      for (let x = 0; x < CANVAS; x++) {
        const s = (y * CANVAS + x) * 4
        const d = ((oy + y) * w + ox + x) * 4
        const a = img.px[s + 3] / 255
        for (let k = 0; k < 3; k++) px[d + k] = Math.round(img.px[s + k] * a + px[d + k] * (1 - a))
      }
  })
  fs.writeFileSync(path.join(__dirname, 'sheet.png'), encodePng(w, h, px))
  console.log('sheet written')
}

module.exports = { LEVELS }
