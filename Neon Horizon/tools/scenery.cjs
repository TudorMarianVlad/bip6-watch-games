// Pre-renders the scenery behind the road for every zone (Bip 6: 390x450, horizon at y=180):
//   scene/sun_N.png  120x90  the sun (or moon), cut off at the horizon
//   scene/sky_N.png  390x72  mountains + city skyline (tiles seamlessly sideways)
//   scene/ref_N.png  390x44  the skyline's rippled reflection in the wet ground
// The page shows these as image widgets and slides them for parallax (no canvases needed).
// Keep the colours in sync with THEMES in page/index.js.
// Run: node tools/scenery.cjs
const fs = require('fs')
const path = require('path')
const { encodePng } = require('./png.cjs')

const W = 390
const H = 450
const HOR = Math.round(H * 0.4)
const GROUND = H - HOR
const SKY_H = 72
const REF_H = 44
const SUN_S = 120
const SUN_CY = 60 // sun centre inside its image; the image's top sits at HOR - 30 - 60
const SUN_ROWS = 90 // rows above the horizon

const THEMES = [
  { sky: [0x12002a, 0x4a0a5e, 0xc0306e, 0xff8a4a], sunTop: 0xfff27a, sunBot: 0xff3d7f, stripes: true, sunR: 58, build: 0x14031f, win: [0x2ff3ff, 0xff4fd8] },
  { sky: [0x01020a, 0x061238, 0x123a7a, 0x3a8fd0], sunTop: 0xf2fbff, sunBot: 0x8fc8ff, stripes: false, sunR: 40, build: 0x02040e, win: [0xffb347, 0xfff07a] },
  { sky: [0x020805, 0x0a2a1c, 0x1e7a4a, 0xa8f05a], sunTop: 0xf6ff8a, sunBot: 0x3ff08a, stripes: true, sunR: 52, build: 0x03100a, win: [0xb84fff, 0xd6ff4f] },
  { sky: [0x140a2a, 0x47307e, 0xd77aa8, 0xffe0c0], sunTop: 0xffffff, sunBot: 0xffa0c8, stripes: true, sunR: 60, build: 0x1a1030, win: [0xffffff, 0x9fe8ff] }
]

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v
}
function mix(a, b, k) {
  k = clamp(k, 0, 1)
  const r = Math.round(((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k)
  const g = Math.round(((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k)
  const bl = Math.round((a & 255) * (1 - k) + (b & 255) * k)
  return (r << 16) | (g << 8) | bl
}
function scale(c, k) {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k))
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k))
  const b = Math.min(255, Math.round((c & 255) * k))
  return (r << 16) | (g << 8) | b
}
function rngFrom(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function img(w, h) {
  const px = new Uint8Array(w * h * 4)
  return {
    w,
    h,
    px,
    rect(x1, y1, x2, y2, c) {
      for (let y = Math.max(0, y1); y <= Math.min(h - 1, y2); y++) {
        for (let x = x1; x <= x2; x++) {
          const xx = ((x % w) + w) % w // wrap sideways so tiles join
          const i = (y * w + xx) * 4
          px[i] = (c >> 16) & 255
          px[i + 1] = (c >> 8) & 255
          px[i + 2] = c & 255
          px[i + 3] = 255
        }
      }
    },
    disc(cx, cy, r, c) {
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (Math.hypot(x - cx, y - cy) <= r) this.rect(x, y, x, y, c)
    }
  }
}

// same layout as before: one period of skyline, W wide
const r = rngFrom(7)
const skyline = []
let sx = 0
while (sx < W) {
  const w = Math.min(W - sx, 16 + Math.floor(r() * 30))
  const tall = r() < 0.2
  const h = tall ? 40 + Math.floor(r() * 24) : 12 + Math.floor(r() * 26)
  const wins = []
  for (let k = 0; k < (w * h) / 90; k++) wins.push([2 + Math.floor(r() * (w - 5)), 3 + Math.floor(r() * (h - 6)), r() < 0.5 ? 0 : 1])
  skyline.push({ x: sx, w, h, ant: tall && r() < 0.6, wins })
  sx += w + (r() < 0.3 ? 4 + Math.floor(r() * 10) : 0)
}

function mountainH(x) {
  const a = (2 * Math.PI * x) / W
  return 22 + 9 * Math.sin(2 * a + 1) + 6 * Math.sin(5 * a + 2) + 3 * Math.sin(11 * a)
}

const outDirs = ['default.s', 'default.r', 'default.b'].map((d) => path.join(__dirname, '..', 'assets', d, 'scene'))
outDirs.forEach((d) => fs.mkdirSync(d, { recursive: true }))
function save(name, im) {
  const png = encodePng(im.w, im.h, im.px)
  outDirs.forEach((d) => fs.writeFileSync(path.join(d, name), png))
}

THEMES.forEach((th, n) => {
  const skyAt = (u) => {
    const stops = [0, 0.4, 0.75, 1]
    for (let i = 1; i < 4; i++) if (u <= stops[i]) return mix(th.sky[i - 1], th.sky[i], (u - stops[i - 1]) / (stops[i] - stops[i - 1]))
    return th.sky[3]
  }
  const groundAt = (y) => {
    const t = clamp((y - HOR) / GROUND, 0, 1)
    return scale(skyAt(1 - Math.min(1, t * 1.15)), 0.62 - 0.4 * t)
  }

  // sun / moon
  const sun = img(SUN_S, SUN_ROWS)
  const R = th.sunR
  for (let y = SUN_CY - R; y < SUN_ROWS; y++) {
    const dy = y - SUN_CY + 0.5
    if (Math.abs(dy) >= R) continue
    if (th.stripes && dy > 2 && Math.floor(dy) % 11 < 2 + (dy / R) * 5) continue
    const half = Math.sqrt(R * R - dy * dy)
    sun.rect(Math.round(60 - half), y, Math.round(60 + half) - 1, y, mix(th.sunTop, th.sunBot, (y - (SUN_CY - R)) / (2 * R)))
  }
  if (!th.stripes) {
    const crater = mix(th.sunBot, th.sunTop, 0.4)
    sun.disc(48, SUN_CY - 8, 7, crater)
    sun.disc(74, SUN_CY + 6, 5, crater)
    sun.disc(64, SUN_CY - 20, 3, crater)
  }
  save('sun_' + n + '.png', sun)

  // skyline and its reflection
  const sky = img(W, SKY_H)
  const ref = img(W, REF_H)
  const mount = mix(th.build, skyAt(0.9), 0.55)
  const groundTop = groundAt(HOR + 2)
  const mountRef = mix(mount, groundTop, 0.5)
  const buildRef = mix(th.build, groundTop, 0.3)
  for (let x = 0; x < W; x += 2) {
    const h = Math.round(mountainH(x))
    sky.rect(x, SKY_H - h, x + 1, SKY_H - 1, mount)
    ref.rect(x, 0, x + 1, Math.round(h * 0.5), mountRef)
  }
  skyline.forEach((b) => {
    sky.rect(b.x, SKY_H - b.h, b.x + b.w - 1, SKY_H - 1, th.build)
    if (b.ant) sky.rect(b.x + Math.floor(b.w / 2), SKY_H - b.h - 10, b.x + Math.floor(b.w / 2), SKY_H - b.h, th.build)
    ref.rect(b.x, 0, b.x + b.w - 1, Math.round(b.h * 0.55), buildRef)
    b.wins.forEach((wv) => {
      const wc = th.win[wv[2]]
      sky.rect(b.x + wv[0], SKY_H - b.h + wv[1], b.x + wv[0] + 1, SKY_H - b.h + wv[1] + 1, wc)
      const ry = Math.round((b.h - wv[1]) * 0.55)
      if (ry < REF_H - 3) ref.rect(b.x + wv[0], ry, b.x + wv[0], ry + 2, mix(wc, buildRef, 0.55))
    })
  })
  // ripples: rows of bare ground break the reflection into streaks
  for (let y = 3; y < REF_H; y += 4 + Math.floor(y / 12)) ref.rect(0, y, W - 1, y, groundAt(HOR + 2 + y))
  save('sky_' + n + '.png', sky)
  save('ref_' + n + '.png', ref)
})
console.log('scenery written for ' + THEMES.length + ' zones')
