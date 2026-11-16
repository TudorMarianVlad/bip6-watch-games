// Neon Horizon — a synthwave night racer for Zepp OS (API 4.0, built for Amazfit Bip 6)
//
// How it plays:
//   * Hold the left or right half of the screen to steer. The car accelerates by itself.
//   * Race the clock: every checkpoint gate adds time and takes you into a new zone
//     (Sunset Strip, Midnight Harbor, Acid Rain, Chrome Dawn).
//   * Curves push you outward. Off the road you slow right down. Hitting traffic costs most of your speed.
//   * Pass a car close (but without touching) for a NEAR MISS: +0.5 s, and every 4 near misses = 1 nitro.
//   * Swipe up to fire nitro. Nitro charges (max 3) are kept between races and also come from walking
//     in real life: 150 steps = 1 charge.
//   * Daily Run: the same road and traffic for everyone each day.
//   * Tap the top of the screen to pause.
//
// Rendering: the road is drawn in horizontal bands (pseudo-3D) on one transparent canvas; the sky, the
// wet ground and its sky reflection are static widgets behind it. The sun, the skyline and the skyline's
// reflection are pre-drawn on their own canvases and only slid sideways for parallax. Every light (sun,
// neon poles, tail lights, checkpoint gates) also draws a broken, rippling streak below itself: the
// wet-road reflection. Detail adapts to how fast the watch draws.

import { createWidget, widget, event, prop, align, text_style, setStatusBarVisible } from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { setPageBrightTime, resetPageBrightTime } from '@zos/display'
import { onGesture, offGesture, GESTURE_UP } from '@zos/interaction'
import { LocalStorage } from '@zos/storage'
import { Time, Step, Vibrator, VIBRATOR_SCENE_SHORT_LIGHT, VIBRATOR_SCENE_SHORT_STRONG, VIBRATOR_SCENE_SHORT_MIDDLE } from '@zos/sensor'

// ---------- tuning ----------
const TICK_MS = 40
const DRAW_Z = 110 // draw distance in road segments
const NEAR_Z = 2.4 // depth at the bottom screen row
const PLAYER_Z = 2.75 // depth of the player's car
const STRIPE = 5 // rumble / lane dash length in segments
const POLE_GAP = 12
const POLE_X = 1.55
const LANES = [-0.68, 0, 0.68]
const VMAX = 40 // segments per second (shown as x6 km/h)
const VNITRO = 56
const VOFF = 15
const ACC = 13
const STEER = 2.1
const CF = 5.2 // how hard curves push outward
const CHECK_GAP = 900
const START_TIME = 32
const NITRO_TIME = 3
const STEPS_PER_NITRO = 150
const MAX_NITRO = 3
const NEAR_FOR_NITRO = 4
const KMH = 6
const SEG_M = 1.667
const HIT_X = 0.5
const NEAR_X = 0.66
const SWIPE_UP = 45
const TOP_ZONE = 100

const DETAILS = [
  { name: 'LOW', f: 0.17, refl: 1, sunEvery: 3, rain: 8, halo: false, beam: false, carRefl: false },
  { name: 'MID', f: 0.11, refl: 2, sunEvery: 2, rain: 14, halo: false, beam: false, carRefl: true },
  { name: 'HIGH', f: 0.08, refl: 3, sunEvery: 2, rain: 20, halo: true, beam: true, carRefl: true }
]

// ---------- colours ----------
const BG = 0x000000
const WHITE = 0xffffff
const DIM = 0x9a8fb0
const PINK = 0xff3fd0
const CYAN = 0x2ff3ff
const RED = 0xff3a5a
const GOLD = 0xffd84d
const PANEL = 0x0e0818
const PANEL_ON = 0x24123a
const EDGE = 0x6a2a8a

const THEMES = [
  {
    name: 'SUNSET STRIP',
    sky: [0x12002a, 0x4a0a5e, 0xc0306e, 0xff8a4a],
    sunTop: 0xfff27a, sunBot: 0xff3d7f, stripes: true, sunR: 58,
    build: 0x14031f, win: [0x2ff3ff, 0xff4fd8],
    road: 0x120a1e, rum1: 0xff2fd0, rum2: 0x3a0a40, lane: 0x7ff6ff,
    poles: [0x2ff3ff, 0xff3fd0], glow: 0xffb36b, gate: 0x2ff3ff, rain: false, rainCol: 0
  },
  {
    name: 'MIDNIGHT HARBOR',
    sky: [0x01020a, 0x061238, 0x123a7a, 0x3a8fd0],
    sunTop: 0xf2fbff, sunBot: 0x8fc8ff, stripes: false, sunR: 40,
    build: 0x02040e, win: [0xffb347, 0xfff07a],
    road: 0x070c1a, rum1: 0x2fd8ff, rum2: 0x0a2a44, lane: 0xfff3c0,
    poles: [0xffa53a, 0x2fd8ff], glow: 0x6fd2ff, gate: 0xffa53a, rain: true, rainCol: 0x5a7fa8
  },
  {
    name: 'ACID RAIN',
    sky: [0x020805, 0x0a2a1c, 0x1e7a4a, 0xa8f05a],
    sunTop: 0xf6ff8a, sunBot: 0x3ff08a, stripes: true, sunR: 52,
    build: 0x03100a, win: [0xb84fff, 0xd6ff4f],
    road: 0x06120c, rum1: 0xb4ff3a, rum2: 0x123a18, lane: 0xd08bff,
    poles: [0xb84fff, 0xb4ff3a], glow: 0xd6ff6a, gate: 0xb84fff, rain: true, rainCol: 0x6faf5a
  },
  {
    name: 'CHROME DAWN',
    sky: [0x140a2a, 0x47307e, 0xd77aa8, 0xffe0c0],
    sunTop: 0xffffff, sunBot: 0xffa0c8, stripes: true, sunR: 60,
    build: 0x1a1030, win: [0xffffff, 0x9fe8ff],
    road: 0x1a1028, rum1: 0xffffff, rum2: 0x5a3f8a, lane: 0xffc6e0,
    poles: [0x9fe8ff, 0xff9fd0], glow: 0xfff0e0, gate: 0xffffff, rain: false, rainCol: 0
  }
]

const CAR_COLS = [0x3a1d6e, 0x14506b, 0x6b1440, 0x1f5a3a, 0x5a4a14, 0x2a2a3a]

const HOWTO = [
  ['DRIVING', 'Hold the left or right half of the screen to steer. You speed up by yourself.\n\nCurves push you outward. Leave the road and you crawl.'],
  ['THE CLOCK', 'Reach each checkpoint gate before time runs out. Every gate adds time and opens a new zone.\n\nTap the top of the screen to pause.'],
  ['NITRO', 'Swipe up to fire nitro.\n\nPass a car close without touching it for a NEAR MISS: +0.5 s. Four near misses = 1 nitro.\n\nWalking charges nitro too: 150 steps = 1 (max 3).']
]

// ---------- module state ----------
let W, H, HOR, GROUND, ZK, RK, CV_Y, CVH, SUN_CY
let cv = null
let timer = null
let timeSensor = null
let stepSensor = null
let vibrator = null
let storage = null
let lastTick = 0
let step = 'start'

let mode = 'menu' // menu | howto | play | pause | over
let howPage = 0
let meta = { best: 0, daily: { day: 0, best: 0 }, nitro: 1, stepBank: 0, lastSteps: -1, detail: 'auto', played: 0 }
let race = null
const cam = { pos: 0, x: 0, v: 0 }
let theme = THEMES[0]
let themeIdx = -1
let detail = 1
let bands = [] // far -> near
let nb = [] // near -> far
let lut = [] // background colour per screen row
let curves = []
let trackRnd = Math.random
let trafRnd = Math.random
let cars = []
let drops = []
let splashes = []
let lines = []
let spr = []
let steerIn = 0
let steerVis = 0
let touch = null
let skyOff = 0
let sunOff = 0
let shakeT = 0
let shakeX = 0
let msgUntil = 0
let flashUntil = 0
let lastStepPoll = 0
let rects = 0
let rstep = ''
let frame = 0
let clock = 0
let lastBeep = -1
let canvasMoves = true

const perf = { avg: 0, n: 0, cnt: 0, dropped: false }
const ui = {}
const P = { x: 0, y: 0, sc: 0 }

// ---------- helpers ----------
function now() {
  try {
    if (!timeSensor) timeSensor = new Time()
    return timeSensor.getTime()
  } catch (e) {
    return Date.now()
  }
}

function dayKey() {
  try {
    if (!timeSensor) timeSensor = new Time()
    return timeSensor.getFullYear() * 10000 + timeSensor.getMonth() * 100 + timeSensor.getDate()
  } catch (e) {
    const d = new Date()
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
  }
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v
}

function ease(k) {
  k = clamp(k, 0, 1)
  return k * k * (3 - 2 * k)
}

function scale(c, k) {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k))
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k))
  const b = Math.min(255, Math.round((c & 255) * k))
  return (r << 16) | (g << 8) | b
}

function mix(a, b, k) {
  k = clamp(k, 0, 1)
  const r = Math.round(((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k)
  const g = Math.round(((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k)
  const bl = Math.round((a & 255) * (1 - k) + (b & 255) * k)
  return (r << 16) | (g << 8) | bl
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

function buzz(kind) {
  try {
    if (!vibrator) vibrator = new Vibrator()
    const m = kind === 'strong' ? VIBRATOR_SCENE_SHORT_STRONG : kind === 'mid' ? VIBRATOR_SCENE_SHORT_MIDDLE : VIBRATOR_SCENE_SHORT_LIGHT
    vibrator.stop()
    vibrator.start({ mode: m })
  } catch (e) {
    // no vibration: play silently
  }
}

function readSteps() {
  try {
    if (!stepSensor) stepSensor = new Step()
    const v = stepSensor.getCurrent()
    return typeof v === 'number' ? v : -1
  } catch (e) {
    return -1
  }
}

function km(seg) {
  return ((seg * SEG_M) / 1000).toFixed(2) + ' km'
}

// ---------- widgets ----------
function wrap(w, color) {
  return { w, v: true, t: null, c: color === undefined ? null : color, m: null }
}
function mkText(x, y, w, h, size, color, wrapText, alignH) {
  const opts = { x, y, w, h, text: '', text_size: size, color, align_h: alignH === undefined ? align.CENTER_H : alignH, align_v: align.CENTER_V }
  if (wrapText) opts.text_style = text_style.WRAP
  return wrap(createWidget(widget.TEXT, opts), color)
}
function mkRect(x, y, w, h, color, radius) {
  return wrap(createWidget(widget.FILL_RECT, { x, y, w, h, radius: radius || 0, color }), color)
}
function setText(o, value) {
  if (o.t === value) return
  o.t = value
  o.w.setProperty(prop.TEXT, value)
}
function setColor(o, value) {
  if (o.c === value) return
  o.c = value
  o.w.setProperty(prop.COLOR, value)
}
function setVisible(o, value) {
  if (o.v === value) return
  o.v = value
  o.w.setProperty(prop.VISIBLE, value)
}
function setMore(o, values) {
  const sig = values.x + ',' + values.y + ',' + values.w + ',' + values.h
  if (o.m === sig) return
  o.m = sig
  o.w.setProperty(prop.MORE, values)
}

// ---------- storage ----------
function loadMeta() {
  try {
    const raw = storage.getItem('meta', '')
    if (raw) {
      const m = JSON.parse(raw)
      meta = Object.assign(meta, m)
      if (!meta.daily) meta.daily = { day: 0, best: 0 }
    }
  } catch (e) {
    console.log('NEON load failed: ' + e)
  }
}

function saveMeta() {
  try {
    storage.setItem('meta', JSON.stringify(meta))
  } catch (e) {
    console.log('NEON save failed: ' + e)
  }
}

function pollSteps() {
  lastStepPoll = now()
  const s = readSteps()
  if (s < 0) return
  if (meta.lastSteps < 0) {
    meta.lastSteps = s
    return
  }
  const delta = s >= meta.lastSteps ? s - meta.lastSteps : s // the counter resets at midnight
  meta.lastSteps = s
  if (delta <= 0) return
  if (meta.nitro >= MAX_NITRO) {
    meta.stepBank = 0
    return
  }
  meta.stepBank += delta
  const got = Math.min(MAX_NITRO - meta.nitro, Math.floor(meta.stepBank / STEPS_PER_NITRO))
  if (got > 0) {
    meta.nitro += got
    meta.stepBank = meta.nitro >= MAX_NITRO ? 0 : meta.stepBank - got * STEPS_PER_NITRO
    if (mode === 'play') say('WALKING: +' + got + ' NITRO', CYAN, 1.6)
  }
  saveMeta()
}

// ---------- track ----------
function pushStraight(n) {
  for (let i = 0; i < n; i++) curves.push(0)
}

function pushCurve(amp, n) {
  for (let i = 0; i < n; i++) {
    const k = i / n
    const e = k < 0.3 ? ease(k / 0.3) : k > 0.7 ? ease((1 - k) / 0.3) : 1
    curves.push(amp * e)
  }
}

function extendTrack(upTo) {
  while (curves.length < upTo) {
    const d = clamp(curves.length / (CHECK_GAP * 6), 0, 1)
    if (trackRnd() < 0.28) {
      pushStraight(40 + Math.floor(trackRnd() * 110))
    } else {
      const dir = trackRnd() < 0.5 ? -1 : 1
      const amp = dir * (0.0018 + trackRnd() * (0.0024 + 0.0022 * d))
      pushCurve(amp, 60 + Math.floor(trackRnd() * 130))
      if (trackRnd() < 0.25 + 0.2 * d) pushCurve(-amp * (0.7 + trackRnd() * 0.5), 50 + Math.floor(trackRnd() * 90))
    }
  }
}

function resetTrack(seed) {
  trackRnd = rngFrom(seed)
  trafRnd = rngFrom(seed ^ 0x5bd1e995)
  curves = []
  pushStraight(140)
  extendTrack(1200)
}

function curveAt(p) {
  if (p < 0) p = 0
  const i = Math.floor(p)
  if (i + 2 >= curves.length) extendTrack(i + 600)
  const f = p - i
  return curves[i] * (1 - f) + curves[i + 1] * f
}

// ---------- background (static widgets + pre-drawn canvases) ----------
function skyAt(u) {
  const s = theme.sky
  const stops = [0, 0.4, 0.75, 1]
  for (let i = 1; i < 4; i++) {
    if (u <= stops[i]) return mix(s[i - 1], s[i], (u - stops[i - 1]) / (stops[i] - stops[i - 1]))
  }
  return s[3]
}

// The wet ground mirrors the sky: bright near the horizon, darker towards the viewer.
function groundAt(y) {
  const t = clamp((y - HOR) / GROUND, 0, 1)
  return scale(skyAt(1 - Math.min(1, t * 1.15)), 0.62 - 0.4 * t)
}

function colAt(y) {
  y = Math.round(y)
  return lut[y < 0 ? 0 : y >= H ? H - 1 : y]
}

// Scenery images come from tools/scenery.cjs: sun_N (120x90), sky_N and ref_N (W wide, tile sideways).
const SKY_H = 72
const REF_H = 44

function mkImage(x, y, src) {
  const o = wrap(createWidget(widget.IMAGE, { x, y, src }))
  o.x = x
  o.y = y
  o.src = src
  return o
}

function setSrc(o, src) {
  if (o.src === src) return
  o.src = src
  try {
    o.w.setProperty(prop.SRC, src)
  } catch (e) {
    o.w.setProperty(prop.MORE, { x: o.x, y: o.y, src })
  }
}

function setX(o, x) {
  x = Math.round(x)
  if (o.x === x) return
  o.x = x
  try {
    o.w.setProperty(prop.X, x)
  } catch (e) {
    o.w.setProperty(prop.MORE, { x, y: o.y, src: o.src })
  }
}

function applyTheme(i) {
  if (i === themeIdx) return
  themeIdx = i
  theme = THEMES[i]
  for (let y = 0; y < H; y++) lut[y] = y < HOR ? skyAt(y / HOR) : groundAt(y)
  ui.sky.forEach((o) => setColor(o, colAt(o.my)))
  ui.ground.forEach((o) => setColor(o, colAt(o.my)))
  setColor(ui.glow, theme.glow)
  setColor(ui.glow2, mix(theme.glow, theme.sky[3], 0.5))
  try {
    setSrc(ui.sun, 'scene/sun_' + i + '.png')
    ui.sky2.forEach((o) => setSrc(o, 'scene/sky_' + i + '.png'))
    ui.ref2.forEach((o) => setSrc(o, 'scene/ref_' + i + '.png'))
  } catch (e) {
    console.log('NEON scenery failed: ' + e)
  }
  bandColors()
  drops.forEach((d) => (d.y = CV_Y + Math.random() * (H - CV_Y)))
}

// ---------- bands ----------
function buildBands() {
  const D = DETAILS[detail]
  bands = []
  const dyMin = ZK / DRAW_Z
  let y = HOR + Math.ceil(dyMin)
  while (y < H) {
    const h = Math.max(1, Math.round((y - HOR) * D.f))
    const y1 = Math.min(H - 1, y + h - 1)
    const dy = (y + y1) / 2 - HOR + 0.5
    bands.push({ y0: y, y1, dy, z: ZK / dy, sc: RK * dy, k: 1 - dy / GROUND, cx: 0, wx: 0, road: 0, rum1: 0, rum2: 0, lane: 0, sunRef: 0, glint: 0, beam: 0, rw: 0, rx: 0 })
    y = y1 + 1
  }
  nb = bands.slice().reverse()
  bandColors()
}

function bandColors() {
  if (!lut.length) return
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i]
    const k = b.k
    const g = colAt(b.y0)
    b.road = mix(theme.road, g, 0.12 + 0.55 * k * k) // wet asphalt reflects more at grazing angles
    b.rum1 = mix(theme.rum1, theme.glow, 0.5 * k * k * k)
    b.rum2 = mix(theme.rum2, g, 0.5 * k)
    b.lane = mix(theme.lane, b.road, 0.15 + 0.6 * k * k)
    const q = clamp((1 - k) / 0.34, 0, 1)
    b.sunRef = mix(theme.sunBot, g, 0.15 + 0.8 * q)
    b.glint = mix(b.road, b.sunRef, 0.28)
    b.beam = mix(b.road, 0xfff6d0, 0.1 * clamp(1 - b.z / 26, 0, 1))
  }
}

function setDetail(d) {
  detail = clamp(d, 0, 2)
  buildBands()
  const want = theme.rain ? DETAILS[detail].rain : 0
  while (drops.length < 20) drops.push({ x: 0, y: 0, len: 0, v: 0 })
  drops.forEach(resetDrop)
  dropCount = want
}
let dropCount = 0

function resetDrop(d) {
  d.x = Math.floor(Math.random() * W)
  d.y = CV_Y + Math.random() * (H - CV_Y)
  d.len = 8 + Math.floor(Math.random() * 14)
  d.v = 500 + Math.random() * 250
}

// ---------- drawing ----------
function R(x1, y1, x2, y2, color) {
  x1 = Math.round(x1)
  x2 = Math.round(x2)
  y1 = Math.round(y1)
  y2 = Math.round(y2)
  if (x1 < 0) x1 = 0
  if (x2 > W - 1) x2 = W - 1
  if (y1 < CV_Y) y1 = CV_Y
  if (y2 > H - 1) y2 = H - 1
  if (x2 < x1 || y2 < y1) return
  try {
    // x2/y2 are passed one past the last pixel, so a 1-pixel line never becomes an empty rectangle
    cv.drawRect({ x1, y1: y1 - CV_Y, x2: x2 + 1, y2: y2 - CV_Y + 1, color })
  } catch (e) {
    throw new Error('drawRect #' + rects + ' (' + x1 + ',' + (y1 - CV_Y) + ')-(' + x2 + ',' + (y2 - CV_Y) + ') colour ' + color + ': ' + e)
  }
  rects++
}

// road centre offset (road units) at depth z, from the bands' integrated curve
function wxAt(z) {
  const n = nb.length
  if (!n) return 0
  if (z <= nb[0].z) return nb[0].wx * (z / nb[0].z) * (z / nb[0].z)
  for (let i = 1; i < n; i++) {
    if (z <= nb[i].z) {
      const a = nb[i - 1]
      const b = nb[i]
      const f = (z - a.z) / (b.z - a.z)
      return a.wx + (b.wx - a.wx) * f
    }
  }
  return nb[n - 1].wx
}

function proj(z, xu) {
  const dy = ZK / z
  P.y = HOR + dy
  P.sc = RK * dy
  P.x = W / 2 + (wxAt(z) - cam.x + xu) * P.sc + shakeX
}

function sunScreenX() {
  return W / 2 + sunOff
}

function render(t) {
  const t0 = now()
  rects = 0
  const D = DETAILS[detail]
  rstep = 'clear'
  try {
    cv.clear({ x: 0, y: 0, w: W, h: CVH })
  } catch (e) {
    throw new Error('canvas clear ' + W + 'x' + CVH + ': ' + e)
  }
  rstep = 'geometry'

  // road geometry, near -> far: integrate the curvature twice
  let zPrev = 0
  let dxv = 0
  let xacc = 0
  for (let i = 0; i < nb.length; i++) {
    const b = nb[i]
    const dz = b.z - zPrev
    dxv += curveAt(cam.pos + (b.z + zPrev) * 0.5) * dz
    xacc += dxv * dz
    b.wx = xacc
    b.cx = W / 2 + (xacc - cam.x) * b.sc + shakeX
    zPrev = b.z
  }

  // The sun's reflection on the wet ground: a rippling, broken mirror image under the sun.
  // It is drawn first, so the road covers it; on the asphalt only a faint glint shows through,
  // under the lane markings, so the road always stays readable.
  rstep = 'sun reflection'
  const sx = sunScreenX()
  const R0 = theme.sunR
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i]
    b.rw = 0
    if (b.k < 0.66 || i % D.sunEvery) continue
    const q = (1 - b.k) / 0.34
    b.rw = R0 * (0.85 - 0.6 * q) * (0.78 + 0.22 * Math.sin(t * 4 + i * 1.3))
    b.rx = sx + Math.sin(t * 2.3 + i * 0.9) * 3 * (0.3 + q)
    R(b.rx - b.rw, b.y0, b.rx + b.rw, b.y1, b.sunRef)
  }

  rstep = 'road'
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i]
    const hw = b.sc
    const rw = b.sc * 0.14
    const ph = Math.floor((cam.pos + b.z) / STRIPE) & 1
    R(b.cx - hw - rw, b.y0, b.cx + hw + rw, b.y1, ph ? b.rum2 : b.rum1)
    R(b.cx - hw, b.y0, b.cx + hw, b.y1, b.road)
    if (b.rw > 0) {
      const gx1 = Math.max(b.rx - b.rw, b.cx - hw)
      const gx2 = Math.min(b.rx + b.rw, b.cx + hw)
      if (gx2 > gx1) R(gx1, b.y0, gx2, b.y1, b.glint)
    }
    if (D.beam && b.z < 26 && mode === 'play') {
      const bw = (0.3 + 0.03 * b.z) * b.sc
      R(W / 2 + shakeX - bw, b.y0, W / 2 + shakeX + bw, b.y1, b.beam)
    }
    if (!ph && b.sc > 5) {
      const lw = Math.max(1, b.sc * 0.03)
      const l1 = b.cx - 0.34 * b.sc
      const l2 = b.cx + 0.34 * b.sc
      R(l1 - lw / 2, b.y0, l1 + lw / 2, b.y1, b.lane)
      R(l2 - lw / 2, b.y0, l2 + lw / 2, b.y1, b.lane)
    }
  }

  rstep = 'sprites'
  // sprites, far -> near
  spr.length = 0
  const p0 = Math.ceil((cam.pos + 1.2) / POLE_GAP) * POLE_GAP
  for (let p = p0; p < cam.pos + DRAW_Z; p += POLE_GAP) {
    const idx = Math.round(p / POLE_GAP)
    spr.push({ k: 0, z: p - cam.pos, x: -POLE_X, col: theme.poles[idx & 1] })
    spr.push({ k: 0, z: p - cam.pos, x: POLE_X, col: theme.poles[(idx + 1) & 1] })
  }
  if (race && mode !== 'menu') {
    const gz = race.nextCheck - cam.pos
    if (gz > 0.9 && gz < DRAW_Z) spr.push({ k: 2, z: gz, x: 0, col: theme.gate })
  }
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i]
    const z = c.pos - cam.pos
    if (z > 0.9 && z < DRAW_Z) spr.push({ k: 1, z, x: c.x, col: c.col, car: c })
  }
  spr.sort((a, b) => b.z - a.z)
  for (let i = 0; i < spr.length; i++) {
    const o = spr[i]
    if (o.k === 0) drawPole(o, D, t)
    else if (o.k === 1) drawCar(o, D, t)
    else drawGate(o, D, t)
  }

  rstep = 'player'
  if (mode !== 'menu') drawPlayer(t, D)
  rstep = 'rain'

  // rain and splashes
  if (theme.rain) {
    for (let i = 0; i < dropCount; i++) {
      const d = drops[i]
      R(d.x, d.y, d.x, d.y + d.len, theme.rainCol)
    }
    for (let i = 0; i < splashes.length; i++) {
      const s = splashes[i]
      R(s.x - s.w, s.y, s.x + s.w, s.y, mix(theme.rainCol, WHITE, 0.3))
    }
  }

  // nitro speed lines
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    R(l.x, l.y, l.x + 1, l.y + l.len, l.col)
  }

  rstep = ''
  noteFrame(now() - t0)
}

function drawPole(o, D, t) {
  proj(o.z, o.x)
  const sc = P.sc
  const x = P.x
  const y = P.y
  const h = 2.3 * sc
  const w = Math.max(1, sc * 0.05)
  const fade = clamp((o.z - 10) / (DRAW_Z - 10), 0, 1)
  const col = fade > 0 ? mix(o.col, theme.glow, fade * 0.55) : o.col
  // reflection: the same tube, upside down, broken by ripples
  const L = h * 0.9
  const n = sc < 8 ? 1 : D.refl
  for (let i = 0; i < n; i++) {
    const ya = y + 1 + (L * i) / n
    const yb = ya + (L / n) * 0.6
    const wob = sc > 10 ? Math.sin(t * 6 + o.z + i * 2) * w * 0.7 : 0
    R(x - w + wob, ya, x + w + wob, yb, mix(col, colAt(ya), 0.45 + (0.4 * i) / n))
  }
  if (D.halo && sc > 10) R(x - w * 2.5, y - h, x + w * 2.5, y, mix(col, colAt(y - h * 0.5), 0.72))
  R(x - w / 2, y - h, x + w / 2, y, col)
  if (sc > 6) {
    const cs = Math.max(2, sc * 0.08)
    R(x - cs, y - h - cs, x + cs, y - h + cs, mix(col, WHITE, 0.55))
  }
}

const TAIL = 0xff2a4a
function drawCar(o, D, t) {
  proj(o.z, o.x)
  const sc = P.sc
  const x = P.x
  const y = P.y
  const bw = 0.27 * sc
  const bh = 0.2 * sc
  const tail = o.car.brake > 0 ? 0xff6a80 : TAIL
  if (bw < 3) {
    R(x - bw, y - bh, x + bw, y, o.col)
    R(x - bw, y - bh * 0.7, x + bw, y - bh * 0.45, tail)
    R(x - bw * 0.6, y + 1, x + bw * 0.6, y + bh, mix(tail, colAt(y + 2), 0.6))
    return
  }
  // reflection: dim body, and long red streaks from the tail lights
  const g = colAt(y + 2)
  if (D.carRefl) R(x - bw, y + 1, x + bw, y + bh * 0.5, mix(o.col, g, 0.55))
  const sl = bh * 1.8
  const pieces = sc > 30 ? D.refl : 1
  for (let i = 0; i < pieces; i++) {
    const ya = y + 2 + (sl * i) / pieces
    const yb = ya + (sl / pieces) * 0.6
    const c = mix(tail, colAt(ya), 0.4 + (0.4 * i) / pieces)
    const wob = Math.sin(t * 7 + o.z + i) * bw * 0.04
    R(x - bw * 0.95 + wob, ya, x - bw * 0.55 + wob, yb, c)
    R(x + bw * 0.55 + wob, ya, x + bw * 0.95 + wob, yb, c)
  }
  const tire = 0x06060c
  R(x - bw + 1, y - bh * 0.3, x - bw * 0.62, y, tire)
  R(x + bw * 0.62, y - bh * 0.3, x + bw - 1, y, tire)
  R(x - bw, y - bh, x + bw, y - bh * 0.22, o.col)
  R(x - bw * 0.7, y - bh * 1.6, x + bw * 0.7, y - bh, mix(o.col, 0x05050a, 0.6))
  R(x - bw * 0.58, y - bh * 1.5, x + bw * 0.58, y - bh * 1.08, 0x223355)
  R(x - bw + 1, y - bh * 0.78, x - bw * 0.5, y - bh * 0.55, tail)
  R(x + bw * 0.5, y - bh * 0.78, x + bw - 1, y - bh * 0.55, tail)
}

function drawGate(o, D, t) {
  proj(o.z, 0)
  const sc = P.sc
  const y = P.y
  const xl = P.x - 1.3 * sc
  const xr = P.x + 1.3 * sc
  const h = 2.7 * sc
  const th = Math.max(1, sc * 0.1)
  const col = o.col
  // reflections
  const L = h * 0.85
  for (let i = 0; i < D.refl; i++) {
    const ya = y + 1 + (L * i) / D.refl
    const yb = ya + (L / D.refl) * 0.6
    const c = mix(col, colAt(ya), 0.45 + (0.4 * i) / D.refl)
    R(xl - th, ya, xl + th, yb, c)
    R(xr - th, ya, xr + th, yb, c)
  }
  R(xl, y + L * 0.95, xr, y + L * 0.95 + th, mix(col, colAt(y + L), 0.6))
  // pillars and the top bar with a chequered strip
  R(xl - th, y - h, xl + th, y, col)
  R(xr - th, y - h, xr + th, y, col)
  R(xl - th, y - h - th, xr + th, y - h + th, col)
  if (sc > 8) {
    const n = 8
    const cw = (xr - xl) / n
    for (let i = 0; i < n; i += 2) {
      const ofs = Math.floor(t * 4) & 1 ? cw : 0
      R(xl + i * cw + ofs, y - h + th, xl + i * cw + ofs + cw, y - h + th * 3, WHITE)
    }
  }
}

function drawPlayer(t, D) {
  const lean = steerVis
  const shake = race && race.off ? Math.sin(t * 60) * 1.5 : 0
  const PX = W / 2 + shakeX + lean * 6
  const PY = HOR + ZK / PLAYER_Z + shake
  const body = 0x4a1f7a
  const hi = 0xff4fd8
  const tail = race && race.brake > 0 ? 0xff7a9a : TAIL
  const c = -lean * 5 // the cabin leans against the turn
  // reflection (drawn first): underglow and the full-width tail bar, rippled
  R(PX - 70, PY + 2, PX + 70, PY + 5, mix(CYAN, colAt(PY + 4), 0.45))
  for (let i = 0; i < 3; i++) {
    const ya = PY + 7 + i * 8
    const wob = Math.sin(t * 8 + i * 2) * 2
    R(PX - 56 + wob, ya, PX + 56 + wob, ya + 3, mix(tail, colAt(ya), 0.35 + i * 0.2))
  }
  R(PX - 66, PY - 3, PX + 66, PY, 0x05030a)
  R(PX - 62, PY - 20, PX - 44, PY, 0x0a0a12)
  R(PX + 44, PY - 20, PX + 62, PY, 0x0a0a12)
  R(PX - 66, PY - 30, PX + 66, PY - 8, 0x2a1048)
  R(PX - 64, PY - 48, PX + 64, PY - 30, body)
  R(PX - 64, PY - 49, PX + 64, PY - 48, hi)
  R(PX - 58, PY - 43, PX + 58, PY - 36, tail)
  R(PX - 55, PY - 41, PX + 55, PY - 38, mix(tail, WHITE, 0.5))
  R(PX - 42 + c, PY - 70, PX + 42 + c, PY - 49, 0x24123f)
  R(PX - 36 + c, PY - 66, PX + 36 + c, PY - 52, 0x3a5a9a)
  R(PX - 30 + c, PY - 63, PX - 10 + c, PY - 61, 0x9fd8ff)
  R(PX - 70, PY - 57, PX + 70, PY - 53, 0x120a22)
  R(PX - 70, PY - 58, PX + 70, PY - 57, hi)
  R(PX - 50, PY - 53, PX - 46, PY - 49, 0x120a22)
  R(PX + 46, PY - 53, PX + 50, PY - 49, 0x120a22)
  R(PX - 30, PY - 16, PX - 20, PY - 10, 0x2a2a3a)
  R(PX + 20, PY - 16, PX + 30, PY - 10, 0x2a2a3a)
  R(PX - 66, PY - 8, PX + 66, PY - 6, CYAN)
  if (race && race.nitro > 0) {
    const f = 6 + Math.floor(Math.random() * 8)
    R(PX - 33, PY - 15, PX - 17, PY - 9 + f, 0x2f8fff)
    R(PX + 17, PY - 15, PX + 33, PY - 9 + f, 0x2f8fff)
    R(PX - 29, PY - 14, PX - 21, PY - 10 + f / 2, 0xdff6ff)
    R(PX + 21, PY - 14, PX + 29, PY - 10 + f / 2, 0xdff6ff)
  }
}

// ---------- adaptive detail ----------
function noteFrame(ms) {
  perf.avg = perf.n ? perf.avg * 0.9 + ms * 0.1 : ms
  perf.n++
  perf.rects = rects
  if (meta.detail !== 'auto' || mode !== 'play') return
  perf.cnt++
  if (perf.cnt < 45) return
  if (perf.avg > TICK_MS * 0.95 && detail > 0) {
    perf.dropped = true
    perf.cnt = 0
    setDetail(detail - 1)
  } else if (!perf.dropped && perf.avg < TICK_MS * 0.45 && detail < 2 && perf.cnt > 150) {
    perf.cnt = 0
    setDetail(detail + 1)
  }
}

// ---------- traffic ----------
function spawnTraffic() {
  const want = Math.min(9, 3 + race.stage)
  let ahead = 0
  for (let i = 0; i < cars.length; i++) if (cars[i].pos > cam.pos) ahead++
  if (ahead >= want) return
  const pos = cam.pos + DRAW_Z + 8 + trafRnd() * 50
  const used = [false, false, false]
  for (let i = 0; i < cars.length; i++) {
    if (Math.abs(cars[i].pos - pos) < 14) used[cars[i].lane] = true
  }
  const free = [0, 1, 2].filter((l) => !used[l])
  if (free.length <= 1) return // always leave a gap
  const lane = free[Math.floor(trafRnd() * free.length)]
  cars.push({
    pos,
    lane,
    x: LANES[lane],
    v: 14 + trafRnd() * (10 + Math.min(6, race.stage)),
    col: CAR_COLS[Math.floor(trafRnd() * CAR_COLS.length)],
    weave: race.stage >= 2 && trafRnd() < 0.3 ? 2 + trafRnd() * 3 : 0,
    hit: 0,
    passed: false,
    touched: false,
    brake: 0
  })
}

function updateTraffic(dt) {
  const pz = cam.pos + PLAYER_Z
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i]
    c.pos += c.v * dt
    if (c.weave) {
      c.weave -= dt
      if (c.weave <= 0) {
        const opts = [c.lane - 1, c.lane + 1].filter((l) => l >= 0 && l <= 2)
        c.lane = opts[Math.floor(trafRnd() * opts.length)]
        c.weave = 2 + trafRnd() * 3
      }
    }
    c.x += (LANES[c.lane] - c.x) * Math.min(1, dt * 1.6)
    if (c.hit > 0) c.hit -= dt
    if (c.brake > 0) c.brake -= dt
    const dz = c.pos - pz
    const dx = c.x - cam.x
    if (Math.abs(dz) < 1.0 && Math.abs(dx) < HIT_X && c.hit <= 0 && !race.ending) crash(c, dx)
    if (!c.passed && dz < -1.0) {
      c.passed = true
      if (!c.touched && Math.abs(dx) < NEAR_X && !race.ending && cam.v > 20) nearMiss()
    }
    if (c.pos < cam.pos - 3 || c.pos > cam.pos + 420) cars.splice(i, 1)
  }
  spawnTraffic()
}

function crash(c, dx) {
  c.hit = 1
  c.touched = true
  c.brake = 0.8
  c.pos += 1.6
  cam.v = Math.min(cam.v, c.v * 0.55)
  cam.x += (dx > 0 ? -1 : 1) * 0.22
  race.nitro = 0
  race.streak = 0
  race.crashes++
  shakeT = 0.35
  flashUntil = now() + 300
  ui.flash.forEach((o) => setVisible(o, true))
  buzz('strong')
  say('CRASH!', RED, 0.9)
}

function nearMiss() {
  race.streak++
  race.time += 0.5
  race.bits++
  let txt = 'NEAR MISS' + (race.streak > 1 ? ' x' + race.streak : '') + '  +0.5s'
  if (race.bits >= NEAR_FOR_NITRO) {
    race.bits = 0
    if (meta.nitro < MAX_NITRO) {
      meta.nitro++
      txt = 'NEAR MISS  +1 NITRO'
    }
  }
  buzz('light')
  say(txt, CYAN, 1.0)
}

function fireNitro() {
  if (mode !== 'play' || !race || race.ending || race.count > 0 || race.nitro > 0) return
  if (meta.nitro <= 0) {
    say('NO NITRO  -  walk to charge', DIM, 1.2)
    return
  }
  meta.nitro--
  race.nitro = NITRO_TIME
  buzz('mid')
  say('NITRO!', CYAN, 0.8)
  saveMeta()
}

// ---------- race flow ----------
function startRace(daily) {
  const seed = daily ? dayKey() * 7919 + 13 : Math.floor(Math.random() * 1e9)
  resetTrack(seed)
  cam.pos = 0
  cam.x = 0
  cam.v = 0
  cars = []
  splashes = []
  lines = []
  skyOff = 0
  sunOff = 0
  race = { daily, time: START_TIME, stage: 0, nextCheck: CHECK_GAP, ending: false, endT: 0, count: 3.2, nitro: 0, streak: 0, bits: 0, crashes: 0, off: false, brake: 0 }
  applyTheme(0)
  setDetail(detail)
  mode = 'play'
  hideOverlay()
  showHud(true)
  steerIn = 0
  lastBeep = -1
  perf.cnt = 0
  meta.played = (meta.played || 0) + 1
  saveMeta()
  updateHud(true)
}

function passCheckpoint() {
  race.stage++
  const add = race.stage === 1 ? 30 : Math.max(18, 30 - race.stage * 2)
  race.time += add
  race.nextCheck += CHECK_GAP
  applyTheme(race.stage % THEMES.length)
  setDetail(detail)
  buzz('mid')
  say('CHECKPOINT  +' + add + 's', GOLD, 1.8, theme.name)
}

function finishRace() {
  const dist = cam.pos
  let best = false
  if (dist > meta.best) {
    meta.best = dist
    best = true
  }
  let dailyBest = false
  if (race.daily) {
    const d = dayKey()
    if (meta.daily.day !== d) meta.daily = { day: d, best: 0 }
    if (dist > meta.daily.best) {
      meta.daily.best = dist
      dailyBest = true
    }
  }
  saveMeta()
  mode = 'over'
  showHud(false)
  const lines2 = [km(dist) + '  ·  ' + race.stage + (race.stage === 1 ? ' checkpoint' : ' checkpoints')]
  if (best) lines2.push('NEW BEST!')
  else lines2.push('Best ' + km(meta.best))
  if (race.daily) lines2.push(dailyBest ? 'Best Daily Run today!' : 'Daily best ' + km(meta.daily.best))
  showOverlay({
    title: 'TIME UP',
    titleColor: PINK,
    panel: true,
    sub: lines2.join('\n'),
    buttons: [
      { label: 'RACE AGAIN', act: () => startRace(race.daily) },
      { label: 'MENU', act: showMenu }
    ]
  })
}

function update(dt, t) {
  const D = DETAILS[detail]
  if (mode === 'play' && race) {
    if (race.count > 0) {
      const before = Math.ceil(race.count)
      race.count -= dt
      const after = Math.ceil(race.count)
      if (after !== before && after > 0) {
        say(String(after), WHITE, 0.9)
        buzz('light')
      }
      if (race.count <= 0) {
        say('GO!', CYAN, 0.8, (meta.played || 0) <= 2 ? 'Hold left / right to steer  ·  swipe up = nitro' : theme.name)
        buzz('mid')
      }
    } else if (!race.ending) {
      race.time -= dt
      const secs = Math.ceil(race.time)
      if (race.time < 10 && secs !== lastBeep && secs > 0) {
        lastBeep = secs
        buzz('light')
      }
      if (race.time <= 0) {
        race.time = 0
        race.ending = true
        race.nitro = 0
        buzz('strong')
        say('TIME UP', PINK, 3)
      }
    }
    // speed
    race.off = Math.abs(cam.x) > 1.12
    const vmax = race.count > 0 || race.ending ? 0 : race.off ? VOFF : race.nitro > 0 ? VNITRO : VMAX
    if (cam.v < vmax) cam.v = Math.min(vmax, cam.v + ACC * (1 - (0.6 * cam.v) / VNITRO) * dt * (race.nitro > 0 ? 2 : 1))
    else cam.v = Math.max(vmax, cam.v - (race.ending ? 16 : race.off ? 34 : 10) * dt)
    if (race.nitro > 0) race.nitro -= dt
    if (race.brake > 0) race.brake -= dt
    // steering and the outward push of curves
    const target = race.ending ? 0 : steerIn
    steerVis += (target - steerVis) * Math.min(1, dt * 10)
    const grip = Math.min(1, cam.v / 12)
    cam.x += steerVis * STEER * grip * dt
    cam.x -= curveAt(cam.pos + PLAYER_Z) * cam.v * CF * dt
    cam.x = clamp(cam.x, -2.3, 2.3)
    cam.pos += cam.v * dt
    if (cam.pos + PLAYER_Z >= race.nextCheck) passCheckpoint()
    updateTraffic(dt)
    if (race.ending) {
      race.endT += dt
      if (race.endT > 2.4) finishRace()
    }
  } else if (mode === 'menu' || mode === 'howto') {
    // attract mode: an autopilot cruise behind the menu
    cam.v += (30 - cam.v) * Math.min(1, dt)
    cam.pos += cam.v * dt
    cam.x += (0 - cam.x) * Math.min(1, dt * 2)
    steerVis = 0
  } else return

  // parallax: the sky slides against the curve
  const c = curveAt(cam.pos)
  skyOff += c * cam.v * dt * 170
  sunOff -= c * cam.v * dt * 85
  sunOff -= sunOff * Math.min(1, dt * 0.12)
  sunOff = clamp(sunOff, -150, 150)
  moveScenery()

  // camera shake
  if (shakeT > 0) {
    shakeT -= dt
    shakeX = Math.sin(t * 70) * 5 * clamp(shakeT / 0.35, 0, 1)
  } else shakeX = 0

  // rain
  if (theme.rain) {
    for (let i = 0; i < dropCount; i++) {
      const d = drops[i]
      d.y += d.v * dt
      if (d.y > H) {
        resetDrop(d)
        d.y = CV_Y - d.len
      }
    }
    for (let i = splashes.length - 1; i >= 0; i--) {
      splashes[i].life -= dt
      if (splashes[i].life <= 0) splashes.splice(i, 1)
    }
    if (splashes.length < 2 + detail * 2 && Math.random() < 0.5) {
      const b = bands[Math.floor(bands.length * (0.45 + Math.random() * 0.5))]
      if (b) splashes.push({ x: b.cx + (Math.random() * 2 - 1) * b.sc, y: b.y0, w: Math.max(1, b.sc * 0.04), life: 0.12 })
    }
  }

  // nitro speed lines
  const wantLines = race && race.nitro > 0 && mode === 'play' ? 6 : 0
  while (lines.length < wantLines) {
    const left = Math.random() < 0.5
    lines.push({ x: left ? 30 + Math.random() * 70 : W - 100 + Math.random() * 70, y: HOR + Math.random() * 60, len: 30 + Math.random() * 40, v: 700 + Math.random() * 300, col: Math.random() < 0.5 ? CYAN : 0xdff6ff })
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]
    l.y += l.v * dt
    l.x += (l.x < W / 2 ? -1 : 1) * l.v * dt * 0.25
    if (l.y > H || wantLines === 0) lines.splice(i, 1)
  }
}

function moveScenery() {
  if (!canvasMoves) return
  try {
    const off = ((Math.round(skyOff) % W) + W) % W
    setX(ui.sky2[0], -off)
    setX(ui.sky2[1], W - off)
    setX(ui.ref2[0], -off)
    setX(ui.ref2[1], W - off)
    setX(ui.sun, sunScreenX() - 60)
  } catch (e) {
    console.log('NEON cannot move scenery: ' + e)
    canvasMoves = false
  }
}

// ---------- HUD ----------
function say(text, color, secs, sub) {
  setText(ui.msg, text)
  setColor(ui.msg, color || WHITE)
  setVisible(ui.msg, true)
  setText(ui.msg2, sub || '')
  setVisible(ui.msg2, !!sub)
  msgUntil = now() + (secs || 1.2) * 1000
}

function showHud(on) {
  ui.hud.forEach((o) => setVisible(o, on))
  if (!on) {
    setVisible(ui.msg, false)
    setVisible(ui.msg2, false)
  }
}

function updateHud(force) {
  if (!race) return
  if (!force && frame % 3) return
  const secs = Math.max(0, Math.ceil(race.time))
  setText(ui.time, String(secs))
  setColor(ui.time, race.time < 10 ? RED : WHITE)
  setText(ui.speed, Math.round(cam.v * KMH) + ' km/h')
  setColor(ui.speed, race.nitro > 0 ? CYAN : race.off ? GOLD : WHITE)
  setText(ui.dist, km(cam.pos))
  for (let i = 0; i < MAX_NITRO; i++) setColor(ui.pills[i], i < meta.nitro ? CYAN : 0x2a2440)
}

// ---------- overlay menus ----------
function hideOverlay() {
  const ov = ui.ov
  setVisible(ov.title, false)
  setVisible(ov.sub, false)
  setVisible(ov.panel, false)
  setVisible(ov.foot, false)
  ov.btns.forEach((b) => {
    setVisible(b.edge, false)
    setVisible(b.fill, false)
    setVisible(b.label, false)
    b.act = null
  })
}

function showOverlay(o) {
  hideOverlay()
  const ov = ui.ov
  setText(ov.title, o.title || '')
  setColor(ov.title, o.titleColor || PINK)
  setVisible(ov.title, !!o.title)
  if (o.panel) {
    setMore(ov.panel, { x: 28, y: 92, w: W - 56, h: o.tall ? 270 : 150 })
    setVisible(ov.panel, true)
    setMore(ov.sub, { x: 44, y: 98, w: W - 88, h: o.tall ? 258 : 138 })
  } else setMore(ov.sub, { x: 40, y: 72, w: W - 80, h: 30 })
  setText(ov.sub, o.sub || '')
  setVisible(ov.sub, !!o.sub)
  setText(ov.foot, o.foot || '')
  setVisible(ov.foot, !!o.foot)
  const btns = o.buttons || []
  const bw = 230
  const bh = 44
  const y0 = 396 - (btns.length - 1) * 54
  btns.forEach((b, i) => {
    const ub = ov.btns[i]
    const x = Math.round(W / 2 - bw / 2)
    const y = y0 + i * 54
    ub.box = [x, y, bw, bh]
    ub.act = b.act
    setMore(ub.edge, { x: x - 2, y: y - 2, w: bw + 4, h: bh + 4 })
    setMore(ub.fill, { x, y, w: bw, h: bh })
    setMore(ub.label, { x, y, w: bw, h: bh })
    setColor(ub.edge, b.color || EDGE)
    setColor(ub.fill, PANEL)
    setText(ub.label, b.label)
    setVisible(ub.edge, true)
    setVisible(ub.fill, true)
    setVisible(ub.label, true)
  })
}

function nitroLine() {
  let s = 'Nitro ' + meta.nitro + '/' + MAX_NITRO
  if (meta.nitro < MAX_NITRO) s += '  ·  ' + Math.max(0, STEPS_PER_NITRO - meta.stepBank) + ' steps to next'
  return s
}

function showMenu() {
  mode = 'menu'
  race = null
  cars = []
  lines = []
  showHud(false)
  applyTheme(0)
  setDetail(detail)
  if (!curves.length) resetTrack(4242)
  const d = dayKey()
  const daily = meta.daily.day === d && meta.daily.best > 0 ? 'DAILY  ·  ' + km(meta.daily.best) : 'DAILY RUN'
  showOverlay({
    title: 'NEON HORIZON',
    titleColor: PINK,
    sub: (meta.best > 0 ? 'Best ' + km(meta.best) + '\n' : '') + nitroLine(),
    buttons: [
      { label: 'RACE', color: PINK, act: () => startRace(false) },
      { label: daily, color: CYAN, act: () => startRace(true) },
      { label: 'HOW TO PLAY', act: () => showHowTo(0) }
    ]
  })
  setMore(ui.ov.sub, { x: 30, y: 66, w: W - 60, h: 50 })
}

function showHowTo(i) {
  mode = 'howto'
  howPage = i
  showOverlay({
    title: HOWTO[i][0],
    titleColor: CYAN,
    panel: true,
    tall: true,
    sub: HOWTO[i][1],
    foot: (i + 1) + ' / ' + HOWTO.length + '  ·  tap to continue'
  })
}

function showPause() {
  mode = 'pause'
  steerIn = 0
  showHud(false)
  const label = 'DETAIL: ' + (meta.detail === 'auto' ? 'AUTO (' + DETAILS[detail].name + ')' : DETAILS[detail].name)
  showOverlay({
    title: 'PAUSED',
    titleColor: CYAN,
    panel: true,
    sub: km(cam.pos) + '  ·  ' + Math.ceil(race.time) + ' s left\n' + nitroLine() + '\n\nDraw ' + Math.round(perf.avg) + ' ms  ·  ' + (perf.rects || 0) + ' rects',
    buttons: [
      { label: 'RESUME', color: PINK, act: resume },
      { label: label, act: cycleDetail },
      { label: 'QUIT', act: showMenu }
    ]
  })
}

function cycleDetail() {
  const order = ['auto', 0, 1, 2]
  const i = order.indexOf(meta.detail)
  meta.detail = order[(i + 1) % order.length]
  if (meta.detail !== 'auto') setDetail(meta.detail)
  perf.dropped = false
  perf.cnt = 0
  saveMeta()
  render(clock)
  showPause()
}

function resume() {
  mode = 'play'
  hideOverlay()
  showHud(true)
  updateHud(true)
}

// ---------- input ----------
function onTap(x, y) {
  if (mode === 'howto') {
    if (howPage + 1 < HOWTO.length) showHowTo(howPage + 1)
    else showMenu()
    return
  }
  const btns = ui.ov.btns
  for (let i = 0; i < btns.length; i++) {
    const b = btns[i]
    if (!b.act) continue
    const [bx, by, bw, bh] = b.box
    if (x >= bx - 6 && x <= bx + bw + 6 && y >= by - 6 && y <= by + bh + 6) {
      setColor(b.fill, PANEL_ON)
      buzz('light')
      b.act()
      return
    }
  }
}

function steerFrom(x) {
  return x < W / 2 ? -1 : 1
}

function handleTouch(kind, e) {
  try {
    if (kind === 'down') {
      touch = { x: e.x, y: e.y, sw: false, pause: false }
      if (mode === 'play') {
        if (e.y < TOP_ZONE) touch.pause = true
        else steerIn = steerFrom(e.x)
      }
      return
    }
    if (kind === 'move') {
      if (!touch || mode !== 'play') return
      if (!touch.pause) steerIn = steerFrom(e.x)
      if (!touch.sw && touch.y - e.y > SWIPE_UP) {
        touch.sw = true
        fireNitro()
      }
      return
    }
    // up
    const t = touch
    touch = null
    steerIn = 0
    if (!t) return
    const dx = e.x - t.x
    const dy = e.y - t.y
    if (mode === 'play') {
      if (!t.sw && -dy > SWIPE_UP && -dy > Math.abs(dx)) fireNitro()
      else if (t.pause && Math.hypot(dx, dy) < 30) showPause()
      return
    }
    if (Math.hypot(dx, dy) < 40) onTap(e.x, e.y)
  } catch (err) {
    showError('touch', err)
  }
}

// System swipes: while racing, a swipe must not close the app. Swipe up fires nitro.
function onGesture4(ev) {
  if (mode !== 'play') return false
  if (ev === GESTURE_UP) fireNitro()
  return true
}

// ---------- building the screen ----------
function buildScreen() {
  mkRect(0, 0, W, H, BG, 0)

  // sky and wet-ground gradients (recoloured per zone)
  ui.sky = []
  const skyBands = 16
  for (let i = 0; i < skyBands; i++) {
    const y0 = Math.round((HOR * i) / skyBands)
    const y1 = Math.round((HOR * (i + 1)) / skyBands)
    const o = mkRect(0, y0, W, y1 - y0, 0, 0)
    o.my = (y0 + y1) / 2
    ui.sky.push(o)
  }
  ui.ground = []
  let y = HOR
  let h = 2
  while (y < H) {
    const o = mkRect(0, y, W, Math.min(h, H - y), 0, 0)
    o.my = y + h / 2
    ui.ground.push(o)
    y += h
    h = Math.min(30, Math.round(h * 1.45) + 1)
  }

  // pre-rendered scenery images, slid sideways for parallax (two tiles each so they wrap)
  ui.sun = mkImage(Math.round(W / 2 - 60), SUN_CY - 60, 'scene/sun_0.png')
  ui.sky2 = [mkImage(0, HOR - SKY_H, 'scene/sky_0.png'), mkImage(W, HOR - SKY_H, 'scene/sky_0.png')]
  ui.ref2 = [mkImage(0, HOR + 2, 'scene/ref_0.png'), mkImage(W, HOR + 2, 'scene/ref_0.png')]
  ui.glow2 = mkRect(0, HOR - 1, W, 4, 0, 0)
  ui.glow = mkRect(0, HOR, W, 2, 0, 0)

  // the live scene
  cv = createWidget(widget.CANVAS, { x: 0, y: CV_Y, w: W, h: CVH })
  if (!cv) throw new Error('could not create the ' + W + 'x' + CVH + ' canvas')

  // crash flash
  ui.flash = [mkRect(0, 0, W, 6, RED, 0), mkRect(0, H - 6, W, 6, RED, 0), mkRect(0, 0, 6, H, RED, 0), mkRect(W - 6, 0, 6, H, RED, 0)]
  ui.flash.forEach((o) => setVisible(o, false))

  // HUD
  ui.time = mkText(W / 2 - 70, 6, 140, 46, 42, WHITE)
  ui.speed = mkText(W / 2 - 175, 50, 150, 28, 20, WHITE, false, align.RIGHT)
  ui.dist = mkText(W / 2 + 25, 50, 150, 28, 20, WHITE, false, align.LEFT)
  ui.pills = []
  for (let i = 0; i < MAX_NITRO; i++) ui.pills.push(mkRect(W / 2 - 52 + i * 36, 84, 32, 9, 0x2a2440, 4))
  ui.hud = [ui.time, ui.speed, ui.dist].concat(ui.pills)
  ui.msg = mkText(20, 104, W - 40, 40, 28, WHITE)
  ui.msg2 = mkText(20, 142, W - 40, 26, 16, WHITE)
  showHud(false)

  // overlay
  ui.ov = {
    panel: mkRect(28, 92, W - 56, 150, PANEL, 18),
    title: mkText(20, 22, W - 40, 44, 32, PINK),
    sub: mkText(40, 72, W - 80, 30, 17, WHITE, true),
    btns: [0, 1, 2].map(() => ({ edge: mkRect(0, 0, 10, 10, EDGE, 16), fill: mkRect(0, 0, 10, 10, PANEL, 14), label: mkText(0, 0, 10, 10, 20, WHITE), box: [0, 0, 0, 0], act: null })),
    foot: mkText(W / 2 - 140, 372, 280, 30, 15, DIM)
  }
  hideOverlay()

  // touch layer: an empty full-screen text widget on top of everything
  ui.touch = createWidget(widget.TEXT, { x: 0, y: 0, w: W, h: H, text: '', text_size: 10, color: BG })
  ui.touch.addEventListener(event.CLICK_DOWN, (e) => handleTouch('down', e))
  ui.touch.addEventListener(event.CLICK_UP, (e) => handleTouch('up', e))
  try {
    ui.touch.addEventListener(event.MOVE, (e) => handleTouch('move', e))
  } catch (e) {
    console.log('NEON no move events: ' + e)
  }
}

// ---------- loop ----------
function tick() {
  try {
    const t = now()
    const dt = clamp((t - lastTick) / 1000, 0, 0.1)
    lastTick = t
    if (mode === 'pause' || mode === 'over') return
    clock += dt
    frame++
    update(dt, clock)
    if (mode === 'play' || mode === 'menu' || mode === 'howto') render(clock)
    if (mode === 'play') {
      updateHud(false)
      if (t - lastStepPoll > 20000) pollSteps()
    }
    if (ui.msg.v && t > msgUntil) {
      setVisible(ui.msg, false)
      setVisible(ui.msg2, false)
    }
    if (ui.flash[0].v && t > flashUntil) ui.flash.forEach((o) => setVisible(o, false))
  } catch (e) {
    showError('tick', e)
  }
}

let errShown = false
function showError(where, e) {
  if (rstep) where += ' / ' + rstep
  if (e === null || e === undefined) e = 'null (thrown by the system)'
  else if (e && e.message) e = e.message
  console.log('NEON HORIZON error in ' + where + ' (' + step + '): ' + e)
  if (errShown) return
  errShown = true
  try {
    if (timer !== null) clearInterval(timer)
    const msg = 'Error in ' + where + ' (' + step + '):\n' + e
    createWidget(widget.TEXT, { x: 15, y: 40, w: (W || 390) - 30, h: 380, text: msg, text_size: 18, color: RED, text_style: text_style.WRAP })
  } catch (err) {
    // nothing more we can do
  }
}

// ---------- page ----------
Page({
  build() {
    try {
      step = 'getDeviceInfo'
      const info = getDeviceInfo()
      W = info.width
      H = info.height
      HOR = Math.round(H * 0.4)
      GROUND = H - HOR
      ZK = NEAR_Z * GROUND
      RK = (W * 0.55) / GROUND
      CV_Y = 40
      CVH = H - CV_Y
      SUN_CY = HOR - 30

      step = 'setStatusBarVisible'
      try {
        setStatusBarVisible(false)
      } catch (e) {
        console.log('NEON could not hide status bar: ' + e)
      }

      step = 'setPageBrightTime'
      setPageBrightTime({ brightTime: 600000 })

      step = 'load'
      storage = new LocalStorage()
      loadMeta()
      pollSteps()
      detail = meta.detail === 'auto' ? 1 : meta.detail

      step = 'build screen'
      buildScreen()
      buildBands()
      resetTrack(4242)
      showMenu()

      step = 'onGesture'
      try {
        onGesture({ callback: onGesture4 })
      } catch (e) {
        console.log('NEON could not listen for swipes: ' + e)
      }

      step = 'setInterval'
      lastTick = now()
      timer = setInterval(tick, TICK_MS)
      step = 'running'
    } catch (e) {
      showError('build', e)
    }
  },

  onDestroy() {
    if (timer !== null) clearInterval(timer)
    try {
      offGesture()
    } catch (e) {
      // nothing to undo
    }
    saveMeta()
    resetPageBrightTime()
  }
})
