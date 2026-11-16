// Wristlings sprite generator.
//
// Every creature is a list of simple shapes (ellipses, polygons, thick lines)
// in a 100 x 100 box, facing LEFT. The renderer adds toon shading (light from
// the top-left), a dark outline around the silhouette, thin inner lines where
// shapes overlap, and anti-aliasing (4x supersampling).
//
// Run:  node tools/sprites.cjs        (writes PNGs into assets/default.{s,r,b}/)
//       node tools/sprites.cjs sheet  (also writes tools/sheet.png, a preview of all)

const fs = require('fs')
const path = require('path')
const { encodePng } = require('./png.cjs')

const INK = 0x1c1530 // outline colour
const SHADOW = 0x24183f // shadows are mixed toward this
const WHITE = 0xffffff
const DARK = 0x1a1428
const PINK = 0xff7a9a

// ---------- shape helpers ----------
const E = (x, y, rx, ry, c, o = {}) => ({ t: 'e', x, y, rx, ry, rot: o.rot || 0, c, ...o })
const C = (x, y, r, c, o = {}) => E(x, y, r, r, c, o)
const P = (pts, c, o = {}) => ({ t: 'p', pts, c, ...o })
const Lw = (x1, y1, x2, y2, w, c, o = {}) => ({ t: 'l', x1, y1, x2, y2, w, c, ...o })
const flat = { s: false, line: false }
// a star / spiky polygon (manes, bursts)
function star(cx, cy, rIn, rOut, n) {
  const pts = []
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? rIn : rOut
    const a = (Math.PI * i) / n - Math.PI / 2
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return pts
}

function eye(x, y, r, style = 'cute') {
  if (style === 'glow')
    return [E(x, y, r, r * 1.2, 0xffe66b, { s: false }), E(x - r * 0.1, y, r * 0.3, r * 0.85, DARK, flat), C(x - r * 0.35, y - r * 0.45, r * 0.22, WHITE, flat)]
  if (style === 'white')
    return [E(x, y, r, r * 1.12, WHITE, { s: false }), E(x - r * 0.2, y + r * 0.05, r * 0.62, r * 0.78, DARK, flat), C(x - r * 0.4, y - r * 0.3, r * 0.24, WHITE, flat)]
  return [
    E(x, y, r, r * 1.15, DARK, flat),
    C(x - r * 0.36, y - r * 0.38, r * 0.34, WHITE, flat),
    C(x + r * 0.28, y + r * 0.42, r * 0.15, WHITE, flat)
  ]
}
const brow = (x1, y1, x2, y2) => Lw(x1, y1, x2, y2, 2.6, DARK, flat)
const blush = (x, y) => E(x, y, 3.2, 2, PINK, flat)

// ---------- palettes ----------
const FIRE = 0xff8a3d, FIRE_BELLY = 0xffd88a, FLAME = 0xff5a2a, FLAME_CORE = 0xffd23d, BONE = 0xfff0d6
const WATER = 0x4aa8ff, WATER_BELLY = 0xc4e8ff, FIN = 0x2f6fd6
const LEAF = 0x3f9f45, SEED = 0xb8df6a, MOSS = 0x5aa548, MOSS_DARK = 0x2f7d3a, MOSS_BELLY = 0xd9ef9a
const VOLT = 0xffd93d, NAVY = 0x3a3550, SPARK = 0xfff3a0
const SNOW = 0xeef8ff, ICE = 0x8fd3ff
const CLOUD = 0xf2f4ff, SKY = 0x9fb7ff, SKY_DARK = 0x6f86d9, BEAK = 0xffbf47
const DIRT = 0xa87a52, DIRT_DARK = 0x946a46, ROCK = 0x8c8478, NOSE = 0xff9db0, CLAW = 0xf0e2c8
const GLOOM = 0x6b4fb8, GLOOM_DARK = 0x3a2a70, GLOOM_MID = 0x4b3890
const TEAL = 0x3fbfc4, SHELL = 0xf2d3a0, SHELL_DARK = 0xd9a86e, CORAL = 0xff8fa8
const CYAN = 0x5ad1e6, CYAN_DARK = 0x2f8fb0, PENGUIN = 0x3a5a8a, SUN = 0xffc04d, STONE = 0x9a8f80
const STORM = 0x6a7a9a, CLOUDB = 0xdbe8ff, BUN = 0xf6e6c4, PETAL = 0xffd23d, PETAL_IN = 0xffb02a
const PIG = 0xf2a08a, PIG_DARK = 0xd8806a, METAL = 0x5a5a6a, SLOTH = 0x9a8a6a, FACE = 0xe8dcc0, BARK = 0x7a4a2a
const FUR = 0x4a4870, FUR_LIGHT = 0x6a6898, MIST = 0xc4c4e0
const LARK = 0xffc89a
const MOTH = 0xc9b6ff, MOTH_DARK = 0x9a8ad8, FUZZ = 0xf3e6c4, MOON = 0xffe9a8

// ---------- the creatures (facing left, feet near y = 96) ----------
const CREATURES = {
  embit: [
    E(76, 70, 7, 15, FIRE, { rot: 0.7 }),
    P([[88, 42], [95, 56], [88, 66], [81, 56]], FLAME),
    E(88, 58, 3.5, 5, FLAME_CORE, flat),
    E(66, 90, 6, 6, FIRE),
    E(56, 80, 16, 13, FIRE),
    E(46, 83, 8, 8, FIRE_BELLY, { line: false }),
    E(46, 91, 5, 5, FIRE),
    P([[30, 50], [28, 28], [44, 44]], FIRE),
    P([[32, 46], [31, 34], [39, 43]], FLAME, flat),
    P([[44, 46], [53, 26], [56, 48]], FIRE),
    P([[47, 45], [52, 33], [53, 46]], FLAME, flat),
    E(40, 61, 17, 15, FIRE),
    P([[16, 68], [30, 58], [36, 72], [24, 74]], FIRE_BELLY),
    C(17, 67, 2.6, DARK, flat),
    ...eye(35, 58, 4.5),
    blush(42, 69)
  ],
  cindervix: [
    E(80, 56, 7, 20, FIRE, { rot: 0.5 }),
    P([[94, 22], [100, 38], [93, 48], [86, 36]], FLAME),
    E(92, 38, 3, 5, FLAME_CORE, flat),
    E(76, 66, 6, 17, FIRE, { rot: 1.0 }),
    P([[96, 52], [100, 66], [92, 72], [88, 60]], FLAME),
    E(93, 63, 2.5, 4, FLAME_CORE, flat),
    E(72, 85, 8, 10, FIRE),
    E(74, 95, 8, 3, FIRE),
    E(58, 72, 22, 14, FIRE),
    P([[36, 60], [42, 34], [52, 50], [58, 32], [64, 58]], FLAME),
    P([[34, 64], [50, 60], [48, 84], [38, 78]], FIRE_BELLY),
    E(42, 86, 6, 11, FIRE),
    E(40, 95, 8, 3, FIRE),
    P([[24, 42], [22, 16], [38, 34]], FIRE),
    P([[26, 37], [25, 24], [33, 33]], FLAME, flat),
    P([[38, 36], [48, 12], [51, 38]], FIRE),
    P([[41, 35], [47, 21], [48, 36]], FLAME, flat),
    E(32, 48, 15, 13, FIRE),
    P([[6, 56], [22, 45], [30, 58], [13, 61]], FIRE_BELLY),
    C(7, 55, 2.6, DARK, flat),
    ...eye(28, 46, 4),
    brow(22, 39, 34, 42)
  ],
  puddlop: [
    P([[58, 78], [84, 62], [92, 82], [62, 90]], FIN),
    E(34, 95, 7, 3, FIN),
    E(56, 95, 7, 3, FIN),
    E(44, 76, 26, 20, WATER),
    E(40, 83, 16, 10, WATER_BELLY, { line: false }),
    C(28, 59, 9, WATER),
    C(48, 56, 9, WATER),
    P([[56, 34], [62, 48], [56, 54], [50, 48]], ICE),
    ...eye(28, 59, 5),
    ...eye(48, 56, 5),
    blush(22, 74),
    Lw(20, 79, 31, 81, 1.8, DARK, flat)
  ],
  torrentoad: [
    E(76, 82, 15, 13, WATER),
    E(72, 95, 12, 4, FIN),
    P([[54, 50], [70, 30], [88, 34], [78, 44], [92, 50], [72, 58]], FIN),
    E(74, 34, 5, 3, WHITE, flat),
    E(52, 70, 32, 24, WATER),
    E(42, 81, 20, 13, WATER_BELLY, { line: false }),
    C(62, 64, 3.2, FIN, flat),
    C(70, 72, 2.6, FIN, flat),
    C(60, 76, 2.2, FIN, flat),
    E(30, 89, 8, 7, WATER),
    E(26, 95, 11, 3.5, FIN),
    C(24, 46, 11, WATER),
    C(46, 41, 11, WATER),
    ...eye(24, 46, 6),
    ...eye(46, 41, 6),
    brow(16, 36, 30, 39),
    brow(40, 31, 54, 33),
    Lw(10, 62, 40, 66, 2.4, DARK, flat)
  ],
  sprig: [
    E(40, 94, 6, 3, LEAF),
    E(56, 94, 6, 3, LEAF),
    Lw(50, 60, 52, 44, 3, LEAF),
    E(41, 40, 10, 5, LEAF, { rot: -0.5 }),
    E(61, 38, 11, 5, LEAF, { rot: 0.4 }),
    E(48, 76, 19, 19, SEED),
    ...eye(38, 74, 4.5),
    ...eye(51, 73, 4.5),
    blush(33, 83),
    Lw(41, 85, 46, 85, 1.5, DARK, flat)
  ],
  mossmaw: [
    E(76, 88, 9, 8, MOSS),
    E(58, 72, 28, 21, MOSS),
    E(54, 40, 12, 5, LEAF, { rot: -0.8 }),
    E(72, 38, 12, 5, LEAF, { rot: 0.25 }),
    E(84, 50, 11, 5, LEAF, { rot: 0.9 }),
    E(64, 58, 25, 15, MOSS_DARK),
    C(64, 47, 4.5, 0xff7ab8),
    C(64, 47, 1.8, FLAME_CORE, flat),
    E(52, 82, 16, 9, MOSS_BELLY, { line: false }),
    E(40, 89, 9, 7, MOSS),
    C(38, 46, 5, MOSS),
    E(30, 62, 18, 16, MOSS),
    E(19, 71, 12, 7, MOSS_BELLY),
    Lw(9, 71, 28, 71, 2, DARK, flat),
    P([[13, 71], [15, 75], [17, 71]], WHITE, { s: false }),
    P([[20, 71], [22, 75], [24, 71]], WHITE, { s: false }),
    ...eye(26, 58, 4.5),
    brow(20, 51, 32, 54)
  ],
  zippet: [
    Lw(36, 84, 30, 95, 2.6, NAVY),
    Lw(50, 88, 50, 96, 2.6, NAVY),
    Lw(62, 84, 68, 95, 2.6, NAVY),
    E(54, 76, 21, 15, VOLT),
    P([[50, 66], [58, 66], [53, 74], [60, 74], [47, 88], [51, 78], [45, 78]], NAVY, { s: false }),
    Lw(28, 68, 20, 52, 2.2, NAVY),
    Lw(36, 67, 38, 50, 2.2, NAVY),
    C(20, 50, 3.4, SPARK),
    C(38, 48, 3.4, SPARK),
    E(31, 77, 12, 11, NAVY),
    ...eye(26, 76, 4.5, 'white')
  ],
  arcbeetle: [
    Lw(40, 82, 30, 95, 3.4, NAVY),
    Lw(56, 86, 56, 96, 3.4, NAVY),
    Lw(72, 82, 82, 95, 3.4, NAVY),
    E(60, 64, 30, 22, VOLT),
    Lw(62, 44, 64, 86, 2.4, NAVY, flat),
    P([[44, 54], [52, 54], [47, 62], [54, 62], [42, 76], [45, 66], [39, 66]], NAVY, { s: false }),
    P([[74, 52], [82, 52], [77, 60], [84, 60], [72, 74], [75, 64], [69, 64]], NAVY, { s: false }),
    P([[24, 62], [10, 46], [17, 46], [6, 26], [27, 48], [20, 48], [32, 62]], SPARK),
    E(28, 70, 15, 13, NAVY),
    P([[16, 78], [8, 84], [18, 82]], NAVY),
    ...eye(23, 69, 4.5, 'white'),
    brow(17, 62, 29, 65)
  ],
  snowpup: [
    E(73, 72, 7, 11, SNOW, { rot: 0.6 }),
    E(64, 90, 7, 6, SNOW),
    E(56, 78, 18, 14, SNOW),
    P([[46, 72], [50, 78], [46, 84], [42, 78]], ICE),
    E(42, 90, 6, 6, SNOW),
    P([[28, 48], [26, 30], [40, 42]], ICE),
    P([[42, 44], [50, 28], [54, 46]], ICE),
    E(38, 60, 19, 17, SNOW),
    E(23, 67, 9, 6, SNOW),
    C(16, 65, 2.8, DARK, flat),
    ...eye(33, 57, 4.5),
    blush(28, 70)
  ],
  frostfang: [
    P([[70, 64], [96, 42], [92, 66], [80, 80]], SNOW),
    E(72, 84, 10, 11, SNOW),
    E(74, 95, 8, 3, SNOW),
    E(58, 68, 25, 16, SNOW),
    P([[38, 50], [44, 24], [54, 46]], ICE),
    P([[52, 52], [60, 30], [65, 54]], ICE),
    P([[64, 56], [72, 38], [74, 60]], ICE),
    E(40, 84, 7, 12, SNOW),
    E(37, 95, 8, 3, SNOW),
    P([[30, 44], [36, 24], [43, 44]], SNOW),
    E(30, 54, 16, 13, SNOW),
    P([[8, 60], [22, 50], [30, 64], [12, 67]], SNOW),
    P([[17, 64], [19, 71], [22, 64]], WHITE, { s: false }),
    C(8, 59, 2.6, DARK, flat),
    ...eye(27, 52, 4),
    brow(21, 45, 33, 48)
  ],
  fluffin: [
    Lw(44, 88, 43, 96, 2.2, BEAK),
    Lw(54, 88, 55, 96, 2.2, BEAK),
    C(62, 78, 13, CLOUD),
    C(36, 78, 13, CLOUD),
    C(48, 74, 18, CLOUD),
    C(50, 61, 13, CLOUD),
    P([[46, 50], [50, 36], [55, 49]], SKY),
    P([[53, 51], [62, 41], [60, 55]], SKY),
    E(63, 72, 10, 6, SKY, { rot: -0.5 }),
    P([[22, 70], [31, 65], [31, 75]], BEAK),
    ...eye(37, 66, 4.5),
    blush(39, 76)
  ],
  galehawk: [
    P([[64, 64], [97, 72], [95, 82], [64, 76]], SKY_DARK),
    P([[56, 50], [84, 10], [93, 26], [70, 58]], SKY_DARK),
    Lw(48, 80, 46, 94, 3, BEAK),
    Lw(58, 80, 60, 94, 3, BEAK),
    E(52, 66, 21, 17, CLOUD),
    E(46, 72, 11, 10, WHITE, { line: false }),
    P([[46, 56], [76, 26], [86, 38], [62, 72]], SKY),
    Lw(66, 44, 78, 34, 1.6, SKY_DARK, flat),
    Lw(62, 54, 80, 40, 1.6, SKY_DARK, flat),
    P([[38, 38], [52, 28], [46, 42]], SKY_DARK),
    E(32, 48, 13, 12, CLOUD),
    P([[13, 50], [22, 43], [25, 54], [17, 58]], BEAK),
    ...eye(30, 46, 4),
    brow(23, 39, 35, 42)
  ],
  pebblet: [
    E(36, 94, 8, 3.5, CLAW),
    E(60, 94, 7, 3, CLAW),
    E(48, 78, 22, 17, DIRT),
    E(56, 62, 14, 9, ROCK, { rot: 0.2 }),
    E(70, 70, 7, 6, ROCK),
    E(25, 80, 10, 6, DIRT),
    C(16, 79, 3.4, NOSE),
    ...eye(35, 73, 3.6),
    blush(30, 82)
  ],
  cragmole: [
    E(76, 87, 10, 9, DIRT_DARK),
    E(56, 70, 30, 22, DIRT_DARK),
    P([[58, 46], [63, 22], [69, 44]], 0xd99cff),
    P([[68, 50], [76, 34], [78, 54]], 0xd99cff),
    E(52, 52, 16, 10, ROCK, { rot: -0.2 }),
    E(74, 58, 13, 10, ROCK, { rot: 0.4 }),
    E(52, 81, 16, 9, 0xc79b70, { line: false }),
    E(34, 80, 9, 9, DIRT_DARK),
    P([[12, 84], [30, 74], [32, 92]], CLAW),
    Lw(20, 80, 24, 88, 1.4, 0xb0a48e, flat),
    E(28, 60, 16, 14, DIRT_DARK),
    E(14, 64, 9, 6, DIRT_DARK),
    C(7, 62, 3.4, NOSE),
    ...eye(28, 56, 3.6),
    brow(22, 49, 34, 52)
  ],
  gloomlet: [
    P([[56, 82], [82, 92], [72, 80], [90, 74], [64, 70]], GLOOM),
    P([[36, 58], [50, 28], [58, 58]], GLOOM),
    E(44, 72, 20, 20, GLOOM),
    E(38, 80, 11, 7, GLOOM_MID, { line: false }),
    ...eye(36, 68, 4.5, 'glow'),
    ...eye(50, 68, 4.5, 'glow'),
    P([[38, 82], [41, 79], [44, 82], [47, 79], [50, 82]], DARK, flat)
  ],
  duskwraith: [
    P([[30, 30], [62, 20], [80, 50], [86, 94], [74, 84], [66, 95], [56, 84], [46, 95], [36, 84], [22, 92], [26, 56]], GLOOM_DARK),
    C(72, 30, 4, 0x9a7fe0),
    C(84, 42, 3, 0x9a7fe0),
    E(44, 40, 20, 18, GLOOM_MID),
    E(38, 45, 13, 12, 0x120c24, flat),
    E(33, 45, 3.2, 2.2, 0xffe66b, flat),
    E(44, 45, 3.2, 2.2, 0xffe66b, flat),
    P([[22, 62], [8, 68], [15, 71], [5, 78], [20, 76], [31, 70]], GLOOM_MID),
    C(46, 63, 4, 0xff5a8a)
  ],
  lullamoth: [
    E(64, 44, 22, 15, MOTH_DARK, { rot: -0.6 }),
    E(64, 82, 13, 9, MOTH, { rot: 0.4 }),
    E(50, 72, 10, 18, FUZZ, { rot: 0.3 }),
    E(68, 61, 24, 16, MOTH, { rot: -0.3 }),
    C(68, 60, 8, MOON, { s: false }),
    C(72, 57, 7, MOTH, flat),
    Lw(36, 44, 26, 28, 1.8, DARK, flat),
    Lw(43, 43, 46, 26, 1.8, DARK, flat),
    C(26, 28, 2.6, MOON),
    C(46, 26, 2.6, MOON),
    C(40, 54, 11, FUZZ),
    ...eye(36, 54, 4.5),
    blush(38, 62),
    C(18, 72, 1.6, MOON, flat),
    C(26, 86, 1.2, MOON, flat)
  ],
  shellby: [
    Lw(30, 86, 22, 95, 3, TEAL),
    Lw(40, 88, 38, 96, 3, TEAL),
    Lw(50, 88, 54, 96, 3, TEAL),
    E(62, 68, 21, 21, SHELL),
    C(63, 68, 12, SHELL_DARK, { line: false }),
    C(64, 67, 5, SHELL, { line: false }),
    E(40, 80, 16, 12, TEAL),
    Lw(34, 72, 30, 58, 2.2, TEAL),
    Lw(42, 72, 44, 58, 2.2, TEAL),
    ...eye(30, 56, 4, 'white'),
    ...eye(44, 56, 4, 'white'),
    E(20, 84, 9, 7, TEAL),
    P([[8, 76], [16, 74], [14, 82]], TEAL),
    blush(34, 84)
  ],
  coralclaw: [
    Lw(44, 84, 34, 96, 4, TEAL),
    Lw(58, 86, 58, 97, 4, TEAL),
    Lw(72, 84, 80, 96, 4, TEAL),
    Lw(56, 40, 48, 18, 5, CORAL),
    Lw(66, 38, 74, 12, 5, CORAL),
    Lw(72, 22, 84, 18, 4, CORAL),
    Lw(50, 28, 40, 24, 4, CORAL),
    C(48, 17, 3.4, 0xffd0dc),
    C(74, 11, 3.4, 0xffd0dc),
    C(85, 17, 3, 0xffd0dc),
    E(64, 58, 28, 22, CORAL),
    C(58, 52, 4, 0xffd0dc, flat),
    C(72, 62, 3.4, 0xffd0dc, flat),
    C(64, 70, 2.6, 0xffd0dc, flat),
    E(42, 76, 22, 15, TEAL),
    Lw(34, 66, 30, 52, 2.6, TEAL),
    Lw(44, 66, 46, 52, 2.6, TEAL),
    ...eye(29, 50, 4, 'white'),
    ...eye(46, 50, 4, 'white'),
    E(18, 76, 13, 11, TEAL),
    P([[2, 64], [16, 66], [10, 74]], TEAL),
    P([[2, 90], [16, 86], [10, 80]], TEAL),
    brow(24, 44, 34, 47)
  ],
  sparkit: [
    E(70, 68, 10, 17, CYAN, { rot: 0.6 }),
    E(73, 63, 5, 9, 0xd9f6ff, { rot: 0.6, line: false }),
    P(star(80, 50, 3.5, 9, 4), VOLT),
    E(40, 94, 6, 3, CYAN_DARK),
    E(56, 94, 6, 3, CYAN_DARK),
    E(48, 80, 15, 13, CYAN),
    E(44, 84, 8, 7, 0xd9f6ff, { line: false }),
    C(30, 50, 6, CYAN),
    C(46, 49, 6, CYAN),
    C(30, 50, 3, CYAN_DARK, flat),
    C(46, 49, 3, CYAN_DARK, flat),
    E(38, 64, 15, 13, CYAN),
    P([[38, 52], [44, 52], [40, 57], [44, 57], [36, 63], [38, 58], [35, 58]], VOLT, { s: false }),
    ...eye(32, 64, 4.5),
    blush(38, 72),
    C(23, 68, 2, DARK, flat)
  ],
  voltglider: [
    E(86, 60, 8, 17, CYAN, { rot: 0.5 }),
    P(star(92, 42, 4, 10, 4), VOLT),
    P([[30, 58], [80, 50], [90, 80], [64, 74], [34, 84]], CYAN_DARK),
    Lw(44, 62, 82, 56, 1.6, VOLT, flat),
    Lw(46, 74, 84, 72, 1.6, VOLT, flat),
    E(56, 66, 20, 12, CYAN),
    E(52, 70, 10, 6, 0xd9f6ff, { line: false }),
    Lw(44, 76, 40, 92, 3.4, CYAN_DARK),
    Lw(64, 76, 68, 92, 3.4, CYAN_DARK),
    P([[22, 44], [20, 26], [32, 40]], CYAN),
    P([[34, 40], [40, 24], [44, 42]], CYAN),
    E(30, 54, 15, 12, CYAN),
    P([[30, 44], [36, 44], [32, 49], [36, 49], [28, 55], [30, 50], [27, 50]], VOLT, { s: false }),
    C(16, 58, 2.2, DARK, flat),
    ...eye(26, 52, 4),
    brow(20, 45, 32, 48)
  ],
  pipfrost: [
    E(40, 95, 7, 3, BEAK),
    E(56, 95, 7, 3, BEAK),
    P([[44, 40], [48, 28], [52, 42]], ICE),
    P([[50, 42], [58, 32], [58, 46]], ICE),
    E(48, 72, 19, 23, PENGUIN),
    E(44, 77, 12, 16, WHITE, { line: false }),
    E(64, 76, 5, 12, PENGUIN, { rot: -0.3 }),
    P([[22, 62], [32, 57], [32, 67]], BEAK),
    ...eye(37, 59, 4.5),
    blush(40, 68)
  ],
  glacieron: [
    E(40, 95, 9, 3, BEAK),
    E(62, 95, 9, 3, BEAK),
    P([[38, 30], [40, 10], [48, 28]], ICE),
    P([[48, 28], [56, 6], [62, 28]], ICE),
    P([[60, 30], [70, 14], [70, 34]], ICE),
    E(52, 62, 25, 32, PENGUIN),
    E(46, 70, 15, 22, WHITE, { line: false }),
    P([[56, 44], [80, 38], [76, 58]], ICE),
    P([[74, 76], [96, 94], [80, 70]], ICE),
    E(72, 66, 6, 16, PENGUIN, { rot: -0.4 }),
    P([[14, 50], [28, 44], [28, 56]], BEAK),
    ...eye(35, 44, 4),
    brow(29, 37, 41, 40)
  ],
  nibbat: [
    P([[48, 62], [82, 44], [76, 56], [94, 58], [80, 68], [88, 80], [54, 76]], GLOOM_DARK),
    P([[40, 64], [10, 48], [16, 60], [2, 64], [16, 72], [8, 84], [38, 76]], GLOOM_DARK),
    P([[36, 58], [33, 40], [44, 54]], GLOOM),
    P([[50, 54], [57, 38], [59, 56]], GLOOM),
    C(46, 68, 15, GLOOM),
    E(46, 76, 8, 5, GLOOM_MID, { line: false }),
    ...eye(40, 65, 4, 'white'),
    ...eye(52, 65, 4, 'white'),
    P([[42, 76], [44, 81], [46, 76]], WHITE, { s: false }),
    Lw(44, 84, 42, 92, 2, DARK, flat),
    Lw(50, 84, 52, 92, 2, DARK, flat)
  ],
  vesperwing: [
    P([[40, 52], [4, 16], [12, 36], [0, 48], [14, 54], [6, 70], [38, 70]], GLOOM_DARK),
    P([[60, 52], [96, 16], [88, 36], [100, 48], [86, 54], [94, 70], [62, 70]], GLOOM_DARK),
    Lw(36, 56, 10, 36, 1.6, GLOOM_MID, flat),
    Lw(64, 56, 90, 36, 1.6, GLOOM_MID, flat),
    Lw(44, 80, 42, 94, 3, DARK),
    Lw(56, 80, 58, 94, 3, DARK),
    E(50, 66, 14, 18, GLOOM),
    E(50, 72, 8, 10, GLOOM_MID, { line: false }),
    P([[40, 40], [36, 18], [48, 36]], GLOOM),
    P([[52, 36], [64, 18], [60, 40]], GLOOM),
    C(50, 44, 12, GLOOM),
    ...eye(45, 44, 3.6, 'glow'),
    ...eye(56, 44, 3.6, 'glow'),
    P([[47, 52], [49, 57], [51, 52]], WHITE, { s: false }),
    C(50, 61, 3, 0xff5a8a)
  ],
  solarion: [
    Lw(82, 72, 94, 54, 4.5, SUN),
    P([[94, 36], [100, 50], [94, 58], [88, 48]], FLAME),
    E(76, 88, 7, 9, SUN),
    E(62, 72, 24, 15, SUN),
    E(52, 88, 7, 9, SUN),
    E(52, 96, 8, 3, SUN),
    E(76, 96, 8, 3, SUN),
    P(star(38, 50, 18, 30, 11), FLAME),
    C(38, 50, 20, 0xffa53d, { line: false }),
    C(42, 26, 5, 0xfff3a0, flat),
    E(34, 54, 14, 13, 0xffd27a),
    E(24, 60, 8, 6, FIRE_BELLY),
    C(18, 58, 2.6, DARK, flat),
    ...eye(32, 50, 4),
    brow(26, 43, 38, 46)
  ],
  boulderon: [
    E(82, 64, 9, 15, ROCK),
    E(40, 90, 11, 8, ROCK),
    E(66, 90, 11, 8, ROCK),
    P([[30, 40], [52, 30], [74, 38], [82, 62], [74, 84], [34, 84], [22, 62]], STONE),
    P([[54, 34], [58, 16], [64, 34]], 0xd99cff),
    P([[64, 38], [72, 24], [74, 42]], 0x7fe0c8),
    E(40, 36, 10, 4, LEAF, { s: false, line: false }),
    Lw(60, 54, 66, 64, 1.6, 0x6f685e, flat),
    Lw(66, 64, 62, 74, 1.6, 0x6f685e, flat),
    E(22, 66, 9, 15, ROCK),
    ...eye(36, 54, 4, 'glow'),
    ...eye(50, 54, 4, 'glow'),
    Lw(36, 68, 50, 68, 2.4, DARK, flat)
  ],
  moonmew: [
    Lw(64, 84, 80, 70, 5, GLOOM),
    Lw(80, 70, 82, 56, 5, GLOOM),
    E(62, 90, 6, 6, GLOOM),
    E(54, 80, 15, 12, GLOOM),
    E(48, 84, 8, 7, 0x8a72d0, { line: false }),
    E(44, 91, 5, 5, GLOOM),
    P([[28, 54], [29, 36], [40, 49]], GLOOM),
    P([[31, 50], [31, 41], [37, 48]], 0xd99cff, flat),
    P([[42, 49], [50, 34], [53, 52]], GLOOM),
    P([[45, 48], [50, 39], [51, 50]], 0xd99cff, flat),
    E(40, 62, 16, 14, GLOOM),
    C(40, 51, 4, MOON, { s: false, line: false }),
    C(42, 50, 3.4, GLOOM, flat),
    ...eye(34, 62, 3.8, 'glow'),
    ...eye(46, 62, 3.8, 'glow'),
    P([[28, 68], [32, 68], [30, 70.5]], 0xff9db0, flat)
  ],
  lunacat: [
    C(46, 40, 24, MOON, { s: false }),
    C(46, 40, 19.5, 0x000000, { hole: true }),
    Lw(78, 74, 94, 60, 6, GLOOM_DARK),
    Lw(94, 60, 92, 42, 5, GLOOM_DARK),
    E(76, 86, 8, 10, GLOOM_DARK),
    E(78, 95, 7, 3, GLOOM_DARK),
    E(60, 72, 24, 13, GLOOM_DARK),
    C(62, 67, 2, MOON, flat),
    C(71, 74, 1.6, MOON, flat),
    C(53, 75, 1.6, MOON, flat),
    E(40, 86, 6, 11, GLOOM_DARK),
    E(38, 95, 7, 3, GLOOM_DARK),
    P([[30, 40], [32, 18], [42, 34]], GLOOM_DARK),
    P([[44, 34], [52, 16], [55, 38]], GLOOM_DARK),
    E(40, 47, 14, 12, GLOOM_DARK),
    C(40, 37, 3.6, MOON, { s: false, line: false }),
    C(42, 36, 3, GLOOM_DARK, flat),
    ...eye(34, 47, 3.4, 'glow'),
    ...eye(45, 47, 3.4, 'glow'),
    P([[28, 53], [32, 53], [30, 55.5]], 0xff9db0, flat)
  ],
  slothnap: [
    Lw(6, 22, 94, 24, 5, BARK),
    E(18, 17, 7, 3, LEAF, { rot: -0.4 }),
    E(84, 18, 7, 3, LEAF, { rot: 0.4 }),
    Lw(36, 26, 40, 52, 6, SLOTH),
    Lw(64, 26, 60, 52, 6, SLOTH),
    E(42, 88, 6, 8, SLOTH),
    E(58, 88, 6, 8, SLOTH),
    E(50, 66, 20, 24, SLOTH),
    E(59, 52, 8, 5, MOSS, flat),
    E(41, 77, 6, 4, MOSS, flat),
    E(50, 61, 12, 10, FACE, { line: false }),
    E(44, 60, 4.5, 3, 0x5a4a3a, { ...flat, rot: 0.3 }),
    E(56, 60, 4.5, 3, 0x5a4a3a, { ...flat, rot: -0.3 }),
    Lw(42, 60, 46, 61, 1.6, DARK, flat),
    Lw(54, 61, 58, 60, 1.6, DARK, flat),
    E(50, 65, 2, 1.4, DARK, flat),
    Lw(48, 68, 52, 68, 1.4, DARK, flat),
    Lw(72, 38, 78, 38, 1.6, MOON, flat),
    Lw(78, 38, 72, 44, 1.6, MOON, flat),
    Lw(72, 44, 78, 44, 1.6, MOON, flat)
  ],
  drizzlet: [
    Lw(38, 66, 36, 84, 2.6, ICE),
    Lw(46, 68, 46, 90, 2.6, ICE),
    Lw(54, 68, 56, 86, 2.6, ICE),
    Lw(62, 66, 64, 80, 2.6, ICE),
    P([[36, 84], [39, 89], [36, 92], [33, 89]], WATER),
    P([[46, 90], [49, 95], [46, 98], [43, 95]], WATER),
    P([[56, 86], [59, 91], [56, 94], [53, 91]], WATER),
    C(64, 60, 10, CLOUDB),
    C(38, 58, 11, CLOUDB),
    C(48, 62, 12, CLOUDB),
    C(53, 51, 13, CLOUDB),
    ...eye(44, 57, 3.6),
    ...eye(56, 56, 3.6),
    blush(40, 64),
    Lw(48, 64, 52, 64, 1.4, DARK, flat)
  ],
  stormjelly: [
    Lw(30, 62, 26, 88, 3, 0x8fb0d8),
    Lw(44, 66, 44, 94, 3, 0x8fb0d8),
    Lw(58, 66, 62, 92, 3, 0x8fb0d8),
    Lw(72, 62, 76, 84, 3, 0x8fb0d8),
    P([[50, 66], [57, 66], [52, 78], [58, 78], [46, 98], [49, 82], [43, 82]], VOLT),
    C(68, 46, 15, STORM),
    C(32, 46, 15, STORM),
    C(50, 54, 18, STORM),
    C(50, 34, 19, STORM),
    C(42, 26, 4, 0xa8b4cc, flat),
    C(60, 30, 3, 0xa8b4cc, flat),
    ...eye(41, 46, 4.6, 'white'),
    ...eye(59, 46, 4.6, 'white'),
    brow(35, 39, 46, 42),
    brow(54, 42, 65, 39),
    Lw(44, 58, 56, 58, 2, DARK, flat)
  ],
  sunbun: [
    C(70, 82, 5, 0xfff3d0),
    E(64, 90, 8, 5, BUN),
    E(54, 80, 15, 12, BUN),
    E(44, 92, 5, 4, BUN),
    E(35, 40, 5, 15, PETAL, { rot: -0.3 }),
    E(35, 42, 2.4, 10, PETAL_IN, { ...flat, rot: -0.3 }),
    E(49, 38, 5, 15, PETAL, { rot: 0.25 }),
    E(49, 40, 2.4, 10, PETAL_IN, { ...flat, rot: 0.25 }),
    E(40, 62, 15, 13, BUN),
    E(50, 73, 10, 4, LEAF, { rot: 0.3 }),
    ...eye(35, 60, 4),
    C(26, 64, 2, 0xff9db0, flat),
    blush(38, 69)
  ],
  solarabbit: [
    C(86, 72, 6, 0xfff3d0),
    E(76, 86, 9, 10, BUN),
    E(78, 95, 8, 3, BUN),
    E(62, 74, 22, 14, BUN),
    E(64, 64, 9, 4, LEAF, { rot: -0.4 }),
    E(46, 88, 6, 9, BUN),
    E(44, 95, 7, 3, BUN),
    E(31, 18, 5, 15, PETAL, { rot: -0.2 }),
    E(31, 20, 2.4, 10, PETAL_IN, { ...flat, rot: -0.2 }),
    E(46, 16, 5, 15, PETAL, { rot: 0.25 }),
    E(46, 18, 2.4, 10, PETAL_IN, { ...flat, rot: 0.25 }),
    P(star(40, 48, 17, 27, 12), PETAL),
    C(40, 48, 16, 0x9a6a2a, { line: false }),
    E(38, 50, 13, 12, BUN),
    ...eye(33, 48, 4),
    brow(27, 41, 38, 44),
    C(26, 53, 2, 0xff9db0, flat)
  ],
  kindlepig: [
    E(64, 90, 6, 6, PIG),
    Lw(72, 72, 78, 66, 2.4, PIG),
    P([[78, 56], [83, 64], [78, 68], [74, 64]], FLAME),
    E(52, 78, 20, 14, PIG),
    E(50, 85, 10, 6, 0xffb03d, { line: false }),
    C(50, 85, 3, 0xffe08a, flat),
    E(40, 90, 6, 6, PIG),
    P([[34, 56], [36, 43], [45, 54]], PIG),
    P([[40, 54], [44, 42], [48, 54]], FLAME),
    E(36, 66, 13, 11, PIG),
    E(24, 70, 6, 5, 0xff8a8a),
    C(22, 69, 1.1, DARK, flat),
    C(26, 69, 1.1, DARK, flat),
    ...eye(34, 63, 3.6),
    blush(38, 72)
  ],
  furnasow: [
    E(82, 86, 7, 8, PIG_DARK),
    E(70, 90, 8, 8, PIG_DARK),
    C(76, 22, 4, 0x9a9aaa, { s: false }),
    C(81, 14, 3, 0x9a9aaa, { s: false }),
    Lw(72, 46, 72, 30, 7, METAL),
    E(56, 70, 30, 20, PIG_DARK),
    E(60, 56, 17, 10, METAL),
    Lw(52, 52, 52, 60, 1.4, DARK, flat),
    Lw(60, 50, 60, 62, 1.4, DARK, flat),
    Lw(68, 52, 68, 60, 1.4, DARK, flat),
    E(60, 58, 8, 3, 0xffa53d, flat),
    E(54, 84, 14, 5, 0xffb03d, { line: false }),
    E(34, 88, 8, 8, PIG_DARK),
    E(48, 90, 8, 8, PIG_DARK),
    P([[24, 50], [29, 34], [37, 47]], PIG_DARK),
    E(28, 62, 16, 14, PIG_DARK),
    E(14, 66, 8, 7, 0xff8a8a),
    C(11, 65, 1.4, DARK, flat),
    C(16, 65, 1.4, DARK, flat),
    P([[16, 73], [18, 80], [21, 73]], WHITE, { s: false }),
    ...eye(28, 58, 3.8),
    brow(22, 51, 34, 54)
  ],
  dimmouse: [
    Lw(62, 86, 80, 88, 2.2, FUR),
    Lw(80, 88, 90, 78, 2.2, FUR),
    E(61, 93, 6, 3, FUR),
    E(53, 81, 14, 12, FUR),
    E(49, 85, 7, 6, FUR_LIGHT, { line: false }),
    E(42, 93, 5, 3, FUR),
    C(33, 47, 11, FUR),
    C(33, 47, 6.5, 0xd98aa8, flat),
    C(54, 45, 11, FUR),
    C(54, 45, 6.5, 0xd98aa8, flat),
    E(42, 64, 14, 12, FUR),
    ...eye(37, 63, 4, 'glow'),
    ...eye(48, 62, 4, 'glow'),
    C(29, 68, 1.9, 0xff9db0, flat),
    Lw(29, 68, 18, 64, 0.8, 0xb0a8d0, flat),
    Lw(29, 69, 18, 72, 0.8, 0xb0a8d0, flat)
  ],
  mistlantern: [
    C(76, 44, 4, MIST, { s: false }),
    C(82, 34, 3, MIST, { s: false }),
    P([[50, 70], [72, 92], [60, 84], [56, 97], [44, 80]], MIST),
    P([[38, 50], [50, 22], [60, 50]], MIST),
    E(49, 62, 16, 18, MIST),
    E(47, 58, 9, 8, 0x2a2850, flat),
    E(43, 58, 2.2, 1.6, 0xffe66b, flat),
    E(51, 58, 2.2, 1.6, 0xffe66b, flat),
    Lw(38, 66, 24, 70, 3.4, MIST),
    Lw(22, 66, 22, 72, 2, DARK, flat),
    P([[11, 72], [33, 72], [30, 96], [14, 96]], 0x8a6a3a),
    E(22, 84, 7, 9, 0xffe08a, flat),
    C(20, 81, 2.4, WHITE, flat)
  ],
  aurowl: [
    Lw(60, 24, 82, 12, 2.4, 0x7fe0c8, flat),
    Lw(62, 30, 86, 20, 2.4, 0x9a7fe0, flat),
    Lw(64, 36, 88, 30, 2.4, 0x4fd6ff, flat),
    Lw(44, 90, 42, 97, 2.4, BEAK),
    Lw(54, 90, 56, 97, 2.4, BEAK),
    E(66, 70, 10, 19, 0xdff1ff, { rot: 0.3 }),
    Lw(62, 62, 70, 82, 2, 0x7fe0c8, flat),
    Lw(66, 60, 74, 78, 2, 0x9a7fe0, flat),
    E(50, 70, 19, 23, SNOW),
    E(46, 75, 11, 13, WHITE, { line: false }),
    Lw(42, 70, 46, 73, 1.4, 0xb0d8f0, flat),
    Lw(46, 73, 50, 70, 1.4, 0xb0d8f0, flat),
    Lw(42, 78, 46, 81, 1.4, 0xb0d8f0, flat),
    Lw(46, 81, 50, 78, 1.4, 0xb0d8f0, flat),
    P([[29, 34], [31, 20], [39, 31]], SNOW),
    P([[49, 31], [56, 18], [59, 34]], SNOW),
    C(44, 45, 16, SNOW),
    E(43, 47, 12.5, 10, WHITE, { line: false }),
    C(37, 46, 5.6, 0xffd84d, { s: false }),
    C(50, 46, 5.6, 0xffd84d, { s: false }),
    ...eye(37, 46, 3.8),
    ...eye(50, 46, 3.8),
    P([[41, 51], [46, 51], [43.5, 57]], BEAK)
  ],
  needlefin: [
    P([[46, 46], [54, 34], [58, 47]], VOLT),
    P([[47, 66], [56, 76], [60, 64]], VOLT),
    P([[84, 56], [97, 44], [95, 68]], 0xc0c8d8),
    P([[6, 56], [50, 46], [50, 66]], 0xff5c5c),
    P([[50, 46], [90, 56], [50, 66]], 0xe0e6f0),
    C(50, 56, 4.5, VOLT),
    C(50, 56, 1.6, DARK, flat),
    ...eye(22, 55, 3.2),
    C(32, 44, 2, SPARK, flat),
    C(70, 70, 1.6, SPARK, flat)
  ],
  lodestar: [
    P(star(50, 54, 9, 30, 4), VOLT),
    P([[4, 54], [50, 42], [50, 66]], 0xff5c5c),
    P([[50, 42], [92, 54], [50, 66]], 0xe0e6f0),
    P([[86, 54], [99, 40], [97, 68]], 0xc0c8d8),
    C(50, 54, 6, NAVY),
    C(50, 54, 2.6, VOLT, flat),
    ...eye(20, 52, 3.6),
    brow(15, 46, 25, 48),
    C(30, 40, 2.2, SPARK, flat),
    C(74, 72, 1.8, SPARK, flat),
    C(66, 34, 1.6, SPARK, flat)
  ],
  dawnlark: [
    P([[60, 70], [86, 62], [84, 74], [62, 79]], 0xffa06a),
    Lw(46, 83, 44, 95, 2.2, BEAK),
    Lw(54, 83, 56, 95, 2.2, BEAK),
    E(50, 71, 18, 14, LARK),
    E(46, 76, 10, 8, 0xfff0d8, { line: false }),
    E(57, 68, 12, 7, 0xff8a5a, { rot: -0.3 }),
    P(star(38, 42, 3.5, 9, 6), 0xffd23d),
    C(36, 57, 11, LARK),
    P([[21, 57], [28, 53], [28, 61]], BEAK),
    ...eye(33, 56, 3.4),
    blush(36, 63)
  ]
}

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

// ---------- app icon: a creature on a round badge ----------
function renderIcon(size) {
  const bg = [C(50, 50, 48, 0x2a2052, { s: false, line: false })]
  const badge = render(bg, size)
  const mon = render(CREATURES.embit, Math.round(size * 0.86))
  const off = Math.round(size * 0.07)
  const ms = Math.round(size * 0.86)
  for (let y = 0; y < ms; y++)
    for (let x = 0; x < ms; x++) {
      const s = (y * ms + x) * 4
      const a = mon[s + 3] / 255
      if (!a) continue
      const d = ((y + off) * size + (x + off)) * 4
      for (let k = 0; k < 3; k++) badge[d + k] = Math.round(mon[s + k] * a + badge[d + k] * (1 - a))
      badge[d + 3] = Math.max(badge[d + 3], mon[s + 3])
    }
  return badge
}

module.exports = { render, CREATURES, ITEMS, writeAll: null }

if (require.main === module) main()

function main() {
  // ---------- write everything (only when run directly) ----------
  const ROOT = path.join(__dirname, '..', 'assets')
  const PLATFORMS = ['default.s', 'default.r', 'default.b']
  const SIZES = { big: 128, back: 112, small: 64 }

  function writeAll(rel, size, rgba) {
    const png = encodePng(size, size, rgba)
    for (const p of PLATFORMS) {
      const f = path.join(ROOT, p, rel)
      fs.mkdirSync(path.dirname(f), { recursive: true })
      fs.writeFileSync(f, png)
    }
  }

  const sheet = process.argv.includes('sheet')
  const tiles = []
  for (const [id, shapes] of Object.entries(CREATURES)) {
    const big = render(shapes, SIZES.big)
    writeAll('mon/' + id + '.png', SIZES.big, big)
    writeAll('mon/' + id + '_b.png', SIZES.back, render(shapes, SIZES.back, { flip: true }))
    writeAll('mon/' + id + '_s.png', SIZES.small, render(shapes, SIZES.small))
    writeAll('mon/' + id + '_x.png', SIZES.small, render(shapes, SIZES.small, { silhouette: true }))
    tiles.push(big)
    console.log('creature', id)
  }
  for (const [id, shapes] of Object.entries(ITEMS)) {
    // berries are shown small (feeding), the charm large (catching)
    if (id === 'charm') writeAll('item/charm_l.png', 72, render(shapes, 72))
    else writeAll('item/' + id + '.png', 48, render(shapes, 48))
    if (sheet) tiles.push(render(shapes, SIZES.big))
    console.log('item', id)
  }
  writeAll('icon.png', 248, renderIcon(248))

  if (sheet) {
    // preview: all creatures on a dark background, 6 per row
    const cols = 6
    const T = SIZES.big
    const rows = Math.ceil(tiles.length / cols)
    const w = cols * T
    const h = rows * T
    const px = new Uint8Array(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      px[i * 4] = 0x1a
      px[i * 4 + 1] = 0x14
      px[i * 4 + 2] = 0x30
      px[i * 4 + 3] = 255
    }
    tiles.forEach((t, n) => {
      const ox = (n % cols) * T
      const oy = Math.floor(n / cols) * T
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          const s = (y * T + x) * 4
          const a = t[s + 3] / 255
          const d = ((oy + y) * w + ox + x) * 4
          for (let k = 0; k < 3; k++) px[d + k] = Math.round(t[s + k] * a + px[d + k] * (1 - a))
        }
    })
    fs.writeFileSync(path.join(__dirname, 'sheet.png'), encodePng(w, h, px))
    console.log('wrote tools/sheet.png')
  }

}
