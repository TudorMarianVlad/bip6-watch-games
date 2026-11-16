// Orbit Pop — a marble-shooter for Zepp OS (API 4.0, built for Amazfit Bip 6)
//
// Screens:
//   * MENU   — PLAY continues at your highest unlocked level, LEVELS opens the picker.
//   * LEVELS — pick any unlocked level; beating a level unlocks the next one.
//   * GAME   — tap to shoot towards your finger, tap the cannon to swap orbs.
//              The || button at the bottom (or a swipe right) pauses.
//
// Rules:
//   * A chain of coloured orbs rolls along a track towards the black hole.
//   * 3+ touching orbs of the same colour pop. If the two ends of a gap
//     share a colour, the front part rolls back and can pop again (combo!).
//   * Lose if an orb reaches the hole, win the level by clearing the chain.
//     The hole flashes red when the chain gets close.
//   * About every 15 shots the cannon gets a white special orb instead of a colour:
//     BOMB (red dot) pops everything near where it hits, SLOW (blue dot) halves
//     the speed for 5 s, REWIND (green dot) rolls the chain backwards for a moment.
//   * Stars: every level starts at 0. Points scored in the level earn 1 / 2 / 3
//     stars at 1x / 1.5x / 2.2x the level's orb points (orbs x 10). A small box
//     in a free corner shows the targets and turns gold as you reach them.
//     Best stars per level show in the level picker.
//   * The cannon is loaded with colours from the orbs nearest the hole.
//   * 10 tracks cycle: Spiral, Snake, Flower, Box, Zigzag, Heart, Wave, Diamond,
//     Square, Clover. Every level is a bit faster; shorter tracks roll a bit
//     slower so each one takes about as long.
//
// Performance notes (why the code is shaped like this):
//   * Every orb is a native CIRCLE widget that is only updated when it moves a
//     whole pixel or changes colour. The system then redraws just that spot.
//   * The track, hole and cannon base are painted once per level on a canvas.
//   * Movement uses real elapsed time, so a slow frame skips ahead instead of
//     putting the whole game in slow motion.
//   * All screens live on one page; switching screens only shows/hides widgets.
//   * One invisible full-screen layer on top receives every tap, with real
//     screen coordinates, and routes it by position.

import { createWidget, widget, event, prop, align, text_style, setStatusBarVisible } from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { setPageBrightTime, resetPageBrightTime } from '@zos/display'
import { onGesture, offGesture, GESTURE_RIGHT } from '@zos/interaction'
import { LocalStorage } from '@zos/storage'
import { Time } from '@zos/sensor'

// ---------- tuning (speeds are per second) ----------
const R = 11 // orb radius (px)
const D = R * 2 // distance between orb centres in the chain
const FRAME_MS = 50 // 20 updates per second
const MAX_DT = 0.1 // never simulate more than 0.1 s in one step
const SHOT_SPEED = 330 // px per second
const RETRACT_SPEED = 90 // px per second when a gap closes backwards
const ROLL_IN_SPEED = 120 // fast entry at the start of a level
const ROLL_IN_UNTIL = 260 // ...until the head reaches this distance
const BASE_SPEED = 9 // chain speed on level 1 (px per second)
const SPEED_PER_LEVEL = 1.4
const MAX_SPEED = 30
const ORB_POOL = 76 // more than the longest track can show at once
const LEVELS_PER_PAGE = 12
const NORMAL_TRACK = 1400 // shorter tracks roll slower, so every track takes about as long
const DANGER_DIST = 180 // the hole flashes red when the front orb is this close (px)
const SPECIAL_MIN = 13 // a special orb comes every 13..17 shots (about every 15)
const SPECIAL_MAX = 17
const BOMB_RADIUS = 52 // a bomb pops every orb within this distance
const SLOW_TIME = 5 // seconds at half speed
const REWIND_TIME = 1.2 // seconds rolling backwards...
const REWIND_SPEED = 70 // ...at this speed (px per second)
const SPARKS = 8 // dots flying out when orbs pop
const SPARK_TIME = 0.35
const SPARK_SPEED = 130

// Special orbs are stored as negative "colours". They are white with a coloured dot.
const BOMB = -1
const SLOW = -2
const REWIND = -3
const SPECIAL = {
  [BOMB]: { name: 'BOMB!', dot: 0xff5c5c },
  [SLOW]: { name: 'SLOW!', dot: 0x4db8ff },
  [REWIND]: { name: 'REWIND!', dot: 0x4dff88 }
}

const BG = 0x0b1026
const TRACK = 0x27305a
const PALETTE = [0xff5c5c, 0xffd84d, 0x4dff88, 0x4db8ff, 0xc77dff]
const WHITE = 0xffffff
const DIM = 0x8f9bd6
const LOCKED = 0x3a4166
const PANEL = 0x1c2547
const EDGE = 0x6c7bd9
const GOLD = 0xffd84d
const GREEN = 0x4dff88
const RED = 0xff5c5c

// ---------- module state ----------
let W, H, CX, CY
let path // array of [x, y], one point per pixel of track length
let bgCanvas
let timer = null
let timeSensor = null
let storage = null
let st = null // game state (only while playing)
let screen = 'menu' // 'menu' | 'levels' | 'game'
let levelPage = 0
let progress = { unlocked: 1, best: 0, stars: [] } // saved on the watch; stars[level - 1] = 0..3
let lastTick = 0
let lastTapAt = 0
let perfText = ''

const ui = {}

// ---------- tracks ----------
// Each level uses the next track in this list, then it loops around.
// goal = top-left corner of the star-points box (fractions of the screen),
// a free spot as close to a corner as possible on that track.
const TRACKS = [
  { name: 'SPIRAL', build: () => spiralTrack(1), goal: [0.056, 0.04] },
  { name: 'SNAKE', build: snakeTrack, goal: [0.785, 0.244] },
  { name: 'FLOWER', build: flowerTrack, goal: [0.056, 0.04] },
  { name: 'BOX', build: () => spiralTrack(0.55), goal: [0.056, 0.04] },
  { name: 'ZIGZAG', build: zigzagTrack, goal: [0.026, 0.227] },
  { name: 'HEART', build: heartTrack, goal: [0.056, 0.849] },
  { name: 'WAVE', build: waveTrack, goal: [0.056, 0.849] },
  { name: 'DIAMOND', build: diamondTrack, goal: [0.056, 0.04] },
  { name: 'SQUARE', build: squareTrack, goal: [0.056, 0.04] },
  { name: 'CLOVER', build: cloverTrack, goal: [0.374, 0.022] }
]

function trackFor(level) {
  return TRACKS[(level - 1) % TRACKS.length]
}

// A spiral that starts at the top and winds towards the centre.
// roundness 1 = oval, smaller values = squarer corners, bigger = pointier (diamond).
function spiralTrack(roundness, turns = 1.5, shrink = 0.5) {
  const rx = W / 2 - R - 6
  const ry = H / 2 - R - 6
  const raw = []
  const steps = 3000
  const bend = (v) => Math.sign(v) * Math.pow(Math.abs(v), roundness)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = -Math.PI / 2 + t * turns * 2 * Math.PI // start at the top, go clockwise
    const k = 1 - shrink * t
    raw.push([CX + rx * k * bend(Math.cos(a)), CY + ry * k * bend(Math.sin(a))])
  }
  return resample(raw)
}

// A spiral with five "petals" bulging in and out.
function flowerTrack() {
  const petal = 16
  const rx = W / 2 - R - 6 - petal
  const ry = H / 2 - R - 6 - petal
  const turns = 1.25
  const shrink = 0.35 // keeps the inner loop clear of the score text
  const raw = []
  const steps = 3000
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const turn = t * turns * 2 * Math.PI
    const a = -Math.PI / 2 + turn
    const k = 1 - shrink * t
    const wob = petal * Math.cos(5 * turn)
    raw.push([CX + (rx * k + wob) * Math.cos(a), CY + (ry * k + wob) * Math.sin(a)])
  }
  return resample(raw)
}

// Winds back and forth across the top, down the left side,
// then back and forth across the bottom. Built from straight lines and
// round turns only, so the straight parts are perfectly straight.
function snakeTrack() {
  const u = 0.06 * H // radius of the U-turns (rows are 2u apart)
  const c = 0.09 * H // radius of the two corners on the left
  const left = 0.15 * W // x of the long vertical part
  const top = 0.09 * H
  const p = drive(0.1 * W, top, 0, [
    ['line', 0.93 * W - u - 0.1 * W], // across the top, to the right
    ['turn', u, 180], // U-turn down (clockwise)
    ['line', 0.93 * W - u - (left + c)], // back to the left
    ['turn', c, -90], // corner: now heading down
    ['line', 0.79 * H - c - (top + 2 * u + c)], // down the left side
    ['turn', c, -90], // corner: now heading right
    ['line', 0.9 * W - u - (left + c)], // across, to the right
    ['turn', u, 180], // U-turn down
    ['line', 0.9 * W - u - left] // back to the left, into the hole
  ])
  return resample(p)
}

// Saw teeth across the top, down the right side, saw teeth back along the bottom.
function zigzagTrack() {
  const L = 0.133 * W // length of one tooth edge
  const r = 10 // tooth tips are slightly rounded
  const steps = []
  for (let i = 0; i < 6; i++) {
    steps.push(['line', L])
    if (i < 5) steps.push(['turn', r, i % 2 ? 90 : -90])
  }
  steps.push(['turn', 20, 135], ['line', 0.63 * H], ['turn', 20, 45]) // heading down, then down-left
  for (let i = 0; i < 6; i++) {
    steps.push(['line', L])
    if (i < 5) steps.push(['turn', r, i % 2 ? -90 : 90])
  }
  return resample(drive(0.1 * W, 0.1 * H, 45, steps))
}

// A heart: a tilted square with a half circle on each upper side.
// Starts at the dip, round the right lobe, down to the tip, up and round the left lobe.
function heartTrack() {
  const h = 0.34 * W // centre to side corner of the tilted square
  const side = h * Math.SQRT2
  const top = CY - 25 - h // the dip
  return resample(
    drive(CX, top, -45, [
      ['turn', side / 2, 180],
      ['line', side - 20],
      ['turn', 20, 90], // rounded tip
      ['line', side - 20],
      ['turn', side / 2, 150] // stop short of the start
    ])
  )
}

// Wavy U: down the left side, along the bottom, up the right side.
function waveTrack() {
  const c = 0.18 * W // corner radius
  const x0 = 0.18 * W
  const base = resample(
    drive(x0, 0.09 * H, 90, [
      ['line', 0.58 * H],
      ['turn', c, -90],
      ['line', W - 2 * x0 - 2 * c],
      ['turn', c, -90],
      ['line', 0.58 * H]
    ])
  )
  // push every point sideways by a sine wave
  const amp = 0.03 * W // gentle: small, long waves keep it easy to aim
  const wave = 0.45 * W
  const out = []
  for (let i = 0; i < base.length; i++) {
    const a = base[Math.max(0, i - 2)]
    const b = base[Math.min(base.length - 1, i + 2)]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const nx = -(b[1] - a[1]) / l
    const ny = (b[0] - a[0]) / l
    const off = amp * Math.sin((2 * Math.PI * i) / wave)
    out.push([base[i][0] + nx * off, base[i][1] + ny * off])
  }
  return resample(out)
}

// A square spiral with tight corners: starts at the top middle, one lap
// round the edge, then an inner lap along the top and down the right.
function squareTrack() {
  const r = 14
  const g = 0.14 * W // gap between laps
  const x0 = 0.1 * W
  const x1 = 0.9 * W
  const y0 = 0.09 * H
  const y1 = 0.9 * H
  return resample(
    drive(CX, y0, 0, [
      ['line', x1 - CX - r],
      ['turn', r, 90],
      ['line', y1 - y0 - 2 * r],
      ['turn', r, 90],
      ['line', x1 - x0 - 2 * r],
      ['turn', r, 90],
      ['line', y1 - y0 - g - 2 * r],
      ['turn', r, 90],
      ['line', x1 - x0 - g - 2 * r],
      ['turn', r, 90],
      ['line', 0.45 * H]
    ])
  )
}

// Almost one lap round four leaves that point into the screen corners.
// Starts at the top, ends just before getting back there.
function cloverTrack() {
  const leaf = 0.15 * W // how far the leaves stick out
  const rx = 0.25 * W // the narrow parts (top, bottom, left, right)
  const ry = 0.27 * H
  const turns = 0.93
  const raw = []
  const steps = 3000
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * turns * 2 * Math.PI
    const w = leaf * (1 - Math.cos(4 * a)) // 0 on the axes, 2 x leaf on the diagonals
    raw.push([CX + (rx + w) * Math.cos(a), CY + (ry + w) * Math.sin(a)])
  }
  return resample(raw)
}

// One lap round a diamond, from the top corner clockwise, stopping before the top.
function diamondTrack() {
  const top = [CX, 0.07 * H]
  const left = [0.07 * W, CY]
  return resample(
    corners(
      [top, [0.93 * W, CY], [CX, 0.91 * H], left, [left[0] + (top[0] - left[0]) * 0.78, left[1] + (top[1] - left[1]) * 0.78]],
      28
    )
  )
}

// Straight lines through the given points, with every corner rounded off.
function corners(pts, radius) {
  const head = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0])
  const steps = []
  let cutBefore = 0
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    let cutAfter = 0
    let turn = 0
    if (i < pts.length - 1) {
      turn = head(pts[i], pts[i + 1]) - head(pts[i - 1], pts[i])
      while (turn > Math.PI) turn -= 2 * Math.PI
      while (turn < -Math.PI) turn += 2 * Math.PI
      cutAfter = radius * Math.tan(Math.abs(turn) / 2)
    }
    steps.push(['line', len - cutBefore - cutAfter])
    if (turn) steps.push(['turn', radius, (turn * 180) / Math.PI])
    cutBefore = cutAfter
  }
  return drive(pts[0][0], pts[0][1], (head(pts[0], pts[1]) * 180) / Math.PI, steps)
}

// Builds a path like a car: drive straight ('line', length) or steer
// ('turn', radius, degrees; positive = clockwise on screen).
// heading is in degrees: 0 = right, 90 = down.
function drive(x, y, heading, steps) {
  const out = [[x, y]]
  let a = (heading * Math.PI) / 180
  for (const s of steps) {
    if (s[0] === 'line') {
      x += s[1] * Math.cos(a)
      y += s[1] * Math.sin(a)
      out.push([x, y])
    } else {
      const total = (s[2] * Math.PI) / 180
      const n = Math.ceil(Math.abs(s[2]) / 2) // a point every 2 degrees
      const da = total / n
      const chord = 2 * s[1] * Math.sin(Math.abs(da) / 2)
      for (let i = 0; i < n; i++) {
        x += chord * Math.cos(a + da / 2)
        y += chord * Math.sin(a + da / 2)
        a += da
        out.push([x, y])
      }
    }
  }
  return out
}

// Resample a curve so that result[i] is exactly i pixels along the track.
function resample(raw) {
  const pts = [raw[0]]
  let need = 1
  let px = raw[0][0]
  let py = raw[0][1]
  for (let i = 1; i < raw.length; i++) {
    const x1 = raw[i][0]
    const y1 = raw[i][1]
    let seg = Math.hypot(x1 - px, y1 - py)
    while (seg >= need) {
      const f = need / seg
      px += (x1 - px) * f
      py += (y1 - py) * f
      pts.push([px, py])
      seg -= need
      need = 1
    }
    need -= seg
    px = x1
    py = y1
  }
  return pts
}

function pos(s) {
  const i = Math.max(0, Math.min(path.length - 1, Math.round(s)))
  return path[i]
}

function tangent(s) {
  const a = pos(s - 2)
  const b = pos(s + 2)
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l = Math.hypot(dx, dy) || 1
  return [dx / l, dy / l]
}

// ---------- backgrounds (painted only when the screen or track changes) ----------
function drawStars() {
  bgCanvas.drawRect({ x1: 0, y1: 0, x2: W, y2: H, color: BG })
  let seed = 7
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let i = 0; i < 40; i++) {
    bgCanvas.drawCircle({ center_x: rnd() * W, center_y: rnd() * H, radius: 1, color: 0x5a6390 })
  }
}

function drawGameBackground() {
  drawStars()
  for (let s = 0; s < path.length; s += 7) {
    const p = path[s]
    bgCanvas.drawCircle({ center_x: p[0], center_y: p[1], radius: 2, color: TRACK })
  }
  const end = path[path.length - 1]
  bgCanvas.drawCircle({ center_x: end[0], center_y: end[1], radius: 17, color: 0x000000 })
  bgCanvas.setPaint({ color: 0x9b5cff, line_width: 3 })
  bgCanvas.strokeCircle({ center_x: end[0], center_y: end[1], radius: 17, color: 0x9b5cff })
  // cannon base
  bgCanvas.drawCircle({ center_x: CX, center_y: CY, radius: 26, color: PANEL })
  bgCanvas.setPaint({ color: EDGE, line_width: 3 })
  bgCanvas.strokeCircle({ center_x: CX, center_y: CY, radius: 26, color: EDGE })
}

function drawMenuBackground() {
  drawStars()
  // a decorative dotted orbit with a few orbs on it, around the title
  const rx = 150
  const ry = 62
  const cy = 100
  for (let a = 0; a < Math.PI * 2; a += 0.09) {
    bgCanvas.drawCircle({ center_x: CX + rx * Math.cos(a), center_y: cy + ry * Math.sin(a), radius: 2, color: TRACK })
  }
  const deco = [0.4, 0.75, 1.1, 2.6, 2.95, 3.3, 4.6]
  deco.forEach((a, i) => {
    bgCanvas.drawCircle({ center_x: CX + rx * Math.cos(a), center_y: cy + ry * Math.sin(a), radius: 9, color: PALETTE[i % PALETTE.length] })
  })
}

// ---------- widget wrappers (every update goes through a "did it change?" check) ----------
function wrap(w, color) {
  return { w, v: true, t: null, c: color === undefined ? null : color, m: null }
}

function mkText(x, y, w, h, size, color) {
  return wrap(
    createWidget(widget.TEXT, { x, y, w, h, text: '', text_size: size, color, align_h: align.CENTER_H, align_v: align.CENTER_V }),
    color
  )
}

function mkRect(x, y, w, h, color, radius) {
  return wrap(createWidget(widget.FILL_RECT, { x, y, w, h, radius: radius || 0, color }))
}

function mkStroke(x, y, w, h, color, radius) {
  return wrap(createWidget(widget.STROKE_RECT, { x, y, w, h, radius: radius || 0, line_width: 2, color }))
}

function mkCircle(x, y, r, color) {
  return wrap(createWidget(widget.CIRCLE, { center_x: x, center_y: y, radius: r, color }))
}

// a small circle that stays put and only changes colour (star dots)
function mkDot(x, y, r, color) {
  const o = mkCircle(x, y, r, color)
  o.px = x
  o.py = y
  o.r = r
  return o
}

function setDot(o, color, x, y) {
  if (x !== undefined) {
    o.px = x
    o.py = y
  }
  setCircle(o, o.px, o.py, o.r, color)
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

function setMore(o, sig, values) {
  if (o.m === sig) return
  o.m = sig
  o.w.setProperty(prop.MORE, values)
}

function setCircle(o, x, y, r, color) {
  x = Math.round(x)
  y = Math.round(y)
  setMore(o, x + ',' + y + ',' + r + ',' + color, { center_x: x, center_y: y, radius: r, color })
}

// A button = rounded panel + outline + label. `box` is used for tap testing.
function mkButton(x, y, w, h, size) {
  return {
    box: { x, y, w, h },
    bg: mkRect(x, y, w, h, PANEL, 12),
    edge: mkStroke(x, y, w, h, EDGE, 12),
    label: mkText(x, y, w, h, size, WHITE)
  }
}

function showButton(b, visible) {
  setVisible(b.bg, visible)
  setVisible(b.edge, visible)
  setVisible(b.label, visible)
}

function styleButton(b, label, edgeColor, textColor) {
  setText(b.label, label)
  setColor(b.label, textColor)
  const x = b.box
  setMore(b.edge, 'e' + edgeColor, { x: x.x, y: x.y, w: x.w, h: x.h, radius: 12, line_width: 2, color: edgeColor })
}

function inBox(x, y, b) {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
}

function hit(x, y, b) {
  return b.bg.v && inBox(x, y, b.box)
}

// ---------- saving progress ----------
function loadProgress() {
  try {
    const raw = storage.getItem('progress', '')
    if (raw) {
      const p = JSON.parse(raw)
      progress.unlocked = Math.max(1, p.unlocked || 1)
      progress.best = p.best || 0
      progress.stars = Array.isArray(p.stars) ? p.stars : []
    }
  } catch (e) {
    console.log('ORBIT POP could not read progress: ' + e)
  }
}

function saveProgress() {
  try {
    storage.setItem('progress', JSON.stringify(progress))
  } catch (e) {
    console.log('ORBIT POP could not save progress: ' + e)
  }
}

// ---------- orb widgets ----------
// A fixed pool of circle widgets. A visible orb borrows one; a popped orb gives it back.
function takeSlot(ball) {
  const slot = ui.free.pop()
  if (!slot) return null
  slot.ball = ball
  slot.x = slot.y = slot.c = null
  return slot
}

function releaseBall(ball) {
  const slot = ball.slot
  if (!slot) return
  setVisible(slot.o, false)
  slot.ball = null
  ui.free.push(slot)
  ball.slot = null
}

function placeOrb(slot, x, y, color) {
  x = Math.round(x)
  y = Math.round(y)
  if (x === slot.x && y === slot.y && color === slot.c) return
  setVisible(slot.o, true)
  slot.x = x
  slot.y = y
  slot.c = color
  slot.o.w.setProperty(prop.MORE, { center_x: x, center_y: y, radius: R, color })
}

// ---------- game state ----------
// 3 colours on levels 1-3, 4 colours on 4-7, all 5 from level 8
function levelColors(level) {
  return PALETTE.slice(0, level <= 3 ? 3 : level <= 7 ? 4 : 5)
}

function orbCount(level) {
  return 30 + (level - 1) * 3
}

// points needed (in this level) for 1, 2 and 3 stars. Every level starts at 0 stars.
function starGoals(level) {
  const base = orbCount(level) * 10 // popping every orb once
  const round = (v) => Math.round(v / 50) * 50
  return [round(base), round(base * 1.5), round(base * 2.2)]
}

function starsFor(level, points) {
  const g = starGoals(level)
  return points >= g[2] ? 3 : points >= g[1] ? 2 : points >= g[0] ? 1 : 0
}

function newLevel(level, score) {
  if (st) for (const b of st.chain) releaseBall(b)

  const track = trackFor(level)
  path = track.build()
  drawGameBackground()

  const colors = levelColors(level)
  const count = orbCount(level)
  const chain = []
  let prev = -1
  for (let i = 0; i < count; i++) {
    // 35% chance to repeat the previous colour, so short runs appear
    const c = prev >= 0 && Math.random() < 0.35 ? prev : colors[Math.floor(Math.random() * colors.length)]
    chain.push({ color: c, s: -i * D, slot: null }) // index 0 is the head (closest to the hole)
    prev = c
  }
  const lengthFactor = Math.max(0.6, Math.min(1.1, path.length / NORMAL_TRACK))
  st = {
    level,
    score,
    startScore: score, // RESTART goes back to this
    colors,
    chain,
    speed: Math.min(MAX_SPEED, BASE_SPEED + SPEED_PER_LEVEL * (level - 1)) * lengthFactor,
    goals: starGoals(level),
    shot: null,
    aim: [0, -1],
    cur: 0,
    next: 0,
    combo: 1,
    flash: { text: track.name, t: 2 }, // seconds
    over: false,
    won: false,
    paused: false,
    time: 0, // seconds played (drives the danger flashing)
    rolledIn: false, // true once the fast entry at the start is done
    untilSpecial: randomGap(),
    slowT: 0, // seconds of slow motion left
    rewindT: 0 // seconds of rolling backwards left
  }
  st.cur = pickColor()
  st.next = pickColor()

  // the hole's danger ring sits exactly on the hole of this track
  const end = path[path.length - 1]
  setCircle(ui.danger, end[0], end[1], 21, RED)
  setCircle(ui.dangerCore, end[0], end[1], 15, 0x000000)
  setVisible(ui.danger, false)
  setVisible(ui.dangerCore, false)
  hideSparks()
  placeGoals(track.goal[0] * W, track.goal[1] * H)

  lastTick = now()
}

function randomGap() {
  return SPECIAL_MIN + Math.floor(Math.random() * (SPECIAL_MAX - SPECIAL_MIN + 1))
}

// what the cannon gets loaded with next: usually a colour, sometimes a special orb
function nextShot() {
  st.untilSpecial--
  if (st.untilSpecial <= 0) {
    st.untilSpecial = randomGap()
    return [BOMB, SLOW, REWIND][Math.floor(Math.random() * 3)]
  }
  return pickColor()
}

// Fair colours: pick from the 12 visible orbs nearest the hole, so you usually get
// a colour you can use where it matters. Colours with more orbs there come up more.
function pickColor() {
  const front = []
  for (const b of st.chain) {
    if (b.s < 0) continue
    front.push(b.color)
    if (front.length >= 12) break
  }
  if (!front.length) for (const b of st.chain) front.push(b.color) // nothing visible yet
  const from = front.length ? front : st.colors
  return from[Math.floor(Math.random() * from.length)]
}

// does chain[i] touch the orb behind it (chain[i + 1])?
function touching(c, i) {
  return c[i].s - c[i + 1].s <= D + 0.5
}

function checkMatch(i, isChainReaction) {
  const c = st.chain
  if (i < 0 || i >= c.length) return false
  const col = c[i].color
  let a = i
  let b = i
  while (a > 0 && c[a - 1].color === col && touching(c, a - 1)) a--
  while (b < c.length - 1 && c[b + 1].color === col && touching(c, b)) b++
  const n = b - a + 1
  if (n < 3) return false
  st.combo = isChainReaction ? st.combo + 1 : 1
  st.score += n * 10 * st.combo
  if (st.combo > 1) st.flash = { text: 'COMBO x' + st.combo, t: 1 }
  const mid = pos(c[Math.floor((a + b) / 2)].s)
  sparkle(mid[0], mid[1], col)
  for (let k = a; k <= b; k++) releaseBall(c[k])
  c.splice(a, n)
  return true
}

// a special orb hit the chain at the shot's position
function useSpecial(sh) {
  const kind = sh.color
  if (kind === BOMB) {
    const keep = []
    let n = 0
    for (const b of st.chain) {
      const p = b.s >= 0 ? pos(b.s) : null
      if (p && Math.hypot(p[0] - sh.x, p[1] - sh.y) < BOMB_RADIUS) {
        releaseBall(b)
        n++
      } else keep.push(b)
    }
    st.chain = keep
    st.score += n * 10
    st.flash = { text: 'BOOM +' + n * 10, t: 1 }
    sparkle(sh.x, sh.y, GOLD)
  } else if (kind === SLOW) {
    st.slowT = SLOW_TIME
    st.flash = { text: 'SLOW DOWN', t: 1.5 }
    sparkle(sh.x, sh.y, SPECIAL[SLOW].dot)
  } else if (kind === REWIND) {
    st.rewindT = REWIND_TIME
    st.flash = { text: 'REWIND', t: 1.5 }
    sparkle(sh.x, sh.y, SPECIAL[REWIND].dot)
  }
}

// ---------- update ----------
function updateChain(dt) {
  const c = st.chain
  if (!c.length) return

  // REWIND special: the whole chain rolls backwards for a moment
  if (st.rewindT > 0) {
    st.rewindT -= dt
    for (const b of c) b.s -= REWIND_SPEED * dt
    return
  }

  // remember which joints were open before moving
  const gapBehind = []
  for (let i = 0; i < c.length - 1; i++) if (!touching(c, i)) gapBehind.push(c[i + 1])

  // the tail pushes everything that touches it
  if (c[0].s >= ROLL_IN_UNTIL) st.rolledIn = true // fast entry happens once per level, not after a REWIND
  let speed = st.rolledIn ? st.speed : ROLL_IN_SPEED
  if (st.slowT > 0) {
    st.slowT -= dt
    speed *= 0.5 // SLOW special
  }
  c[c.length - 1].s += speed * dt
  for (let i = c.length - 2; i >= 0; i--) {
    if (c[i].s < c[i + 1].s + D) c[i].s = c[i + 1].s + D
  }

  // a front segment rolls back when the colours at its gap match
  for (let i = c.length - 2; i >= 0; i--) {
    if (!touching(c, i) && c[i].color === c[i + 1].color) {
      const move = Math.min(RETRACT_SPEED * dt, c[i].s - (c[i + 1].s + D))
      let k = i
      while (k > 0 && touching(c, k - 1)) k--
      for (let m = k; m <= i; m++) c[m].s -= move
    }
  }

  // a joint that just closed may now form a match -> chain reaction
  for (const b of gapBehind) {
    const i = c.indexOf(b)
    if (i > 0 && touching(c, i - 1)) checkMatch(i, true)
  }
}

function insertShot(k, shot) {
  const c = st.chain
  const hitBall = c[k]
  const p = pos(hitBall.s)
  const t = tangent(hitBall.s)
  const ahead = (shot.x - p[0]) * t[0] + (shot.y - p[1]) * t[1] > 0
  const ball = { color: shot.color, s: ahead ? hitBall.s + D : hitBall.s, slot: null }
  const idx = ahead ? k : k + 1
  c.splice(idx, 0, ball)
  // make room: push the orbs in front of the new one forward
  for (let j = idx - 1; j >= 0; j--) {
    if (c[j].s < c[j + 1].s + D) c[j].s = c[j + 1].s + D
    else break
  }
  checkMatch(idx, false)
}

function updateShot(dt) {
  const sh = st.shot
  if (!sh) return
  const dist = SHOT_SPEED * dt
  const sub = Math.max(1, Math.ceil(dist / 6)) // small steps so a fast shot can't skip over an orb
  for (let n = 0; n < sub; n++) {
    sh.x += (sh.vx * dt) / sub
    sh.y += (sh.vy * dt) / sub
    const c = st.chain
    for (let k = 0; k < c.length; k++) {
      if (c[k].s < 0) continue // still hidden before the track start
      const p = pos(c[k].s)
      if (Math.hypot(sh.x - p[0], sh.y - p[1]) < D) {
        st.shot = null
        if (sh.color < 0) useSpecial(sh)
        else insertShot(k, sh)
        return
      }
    }
  }
  if (sh.x < -R || sh.x > W + R || sh.y < -R || sh.y > H + R) st.shot = null
}

function checkEnd() {
  const c = st.chain
  if (c.length && c[0].s >= path.length - 1) st.over = true
  else if (!c.length) st.won = true
}

// ---------- screens ----------
function setScreen(name) {
  screen = name
  const inGame = name === 'game'
  ui.gameGroup.forEach((o) => setVisible(o, inGame))
  ui.menuGroup.forEach((o) => setVisible(o, name === 'menu'))
  ui.levelGroup.forEach((o) => setVisible(o, name === 'levels'))
  hideDialog()
  if (!inGame) {
    if (st) for (const b of st.chain) releaseBall(b)
    setVisible(ui.shot, false)
    setVisible(ui.shotDot, false)
    setVisible(ui.curDot, false)
    setVisible(ui.danger, false)
    setVisible(ui.dangerCore, false)
    hideSparks()
    drawMenuBackground()
  }
  if (name === 'menu') updateMenu()
  if (name === 'levels') updateLevels()
}

function goMenu() {
  setScreen('menu')
  st = null
}

function startGame(level, score) {
  if (st) for (const b of st.chain) releaseBall(b)
  st = null
  setScreen('game')
  newLevel(level, score)
  updateGame()
}

function openLevels() {
  levelPage = Math.floor((progress.unlocked - 1) / LEVELS_PER_PAGE)
  setScreen('levels')
}

function updateMenu() {
  styleButton(ui.play, 'PLAY  LV ' + progress.unlocked, GOLD, WHITE)
  styleButton(ui.levelsBtn, 'LEVELS', EDGE, WHITE)
  setText(ui.best, progress.best > 0 ? 'BEST ' + progress.best : 'pop the orbs before the black hole')
  setColor(ui.best, progress.best > 0 ? GOLD : DIM)
}

function updateLevels() {
  const first = levelPage * LEVELS_PER_PAGE + 1
  setText(ui.levelsTitle, 'LEVELS ' + first + '-' + (first + LEVELS_PER_PAGE - 1))
  ui.cells.forEach((cell, i) => {
    const lv = first + i
    const open = lv <= progress.unlocked
    styleButton(cell, String(lv), lv === progress.unlocked ? GOLD : open ? EDGE : LOCKED, open ? WHITE : LOCKED)
    setText(cell.sub, open ? trackFor(lv).name : 'LOCKED')
    setColor(cell.sub, open ? DIM : LOCKED)
    const got = progress.stars[lv - 1] || 0
    cell.stars.forEach((s, k) => {
      setVisible(s, open)
      setDot(s, k < got ? GOLD : LOCKED)
    })
  })
  const hasPrev = levelPage > 0
  const hasNext = first + LEVELS_PER_PAGE <= progress.unlocked
  styleButton(ui.prevBtn, '<', hasPrev ? EDGE : LOCKED, hasPrev ? WHITE : LOCKED)
  styleButton(ui.nextBtn, '>', hasNext ? EDGE : LOCKED, hasNext ? WHITE : LOCKED)
  styleButton(ui.backBtn, 'BACK', EDGE, WHITE)
}

// ---------- dialog (pause / level clear / game over) ----------
// stars: 0..3 shows three star dots under the buttons (only used with 2 buttons)
function showDialog(title, color, sub, buttons, stars) {
  const d = ui.dialog
  ui.dialogOpen = true
  ;[d.panel, d.edge, d.title, d.sub].forEach((o) => setVisible(o, true))
  setText(d.title, title)
  setColor(d.title, color)
  setText(d.sub, sub)
  d.stars.forEach((s, k) => {
    setVisible(s, typeof stars === 'number')
    setDot(s, k < (stars || 0) ? GOLD : LOCKED)
  })
  d.actions = []
  d.buttons.forEach((b, i) => {
    const spec = buttons[i]
    showButton(b, !!spec)
    if (spec) {
      styleButton(b, spec.label, i === 0 ? GOLD : EDGE, WHITE)
      d.actions[i] = spec.action
    }
  })
  setVisible(ui.flash, false)
}

function hideDialog() {
  const d = ui.dialog
  ui.dialogOpen = false
  ;[d.panel, d.edge, d.title, d.sub].forEach((o) => setVisible(o, false))
  d.stars.forEach((s) => setVisible(s, false))
  d.buttons.forEach((b) => showButton(b, false))
}

function pause() {
  if (!st || st.paused || st.over || st.won) return
  st.paused = true
  showDialog('PAUSED', WHITE, perfText || 'speed: measuring...', [
    { label: 'RESUME', action: resume },
    { label: 'RESTART', action: () => startGame(st.level, st.startScore) },
    { label: 'MENU', action: goMenu }
  ])
}

function resume() {
  hideDialog()
  setVisible(ui.flash, true)
  st.paused = false
  lastTick = now() // paused time does not count
}

function endLevel() {
  if (st.score > progress.best) progress.best = st.score
  if (st.won) {
    // stars: by the points scored in this level (clearing it always gives 1)
    const stars = starsFor(st.level, st.score - st.startScore)
    progress.stars[st.level - 1] = Math.max(progress.stars[st.level - 1] || 0, stars)
    progress.unlocked = Math.max(progress.unlocked, st.level + 1)
    saveProgress()
    showDialog(
      'LEVEL CLEAR!',
      GREEN,
      'SCORE ' + st.score,
      [
        { label: 'NEXT LEVEL', action: () => startGame(st.level + 1, st.score) },
        { label: 'MENU', action: goMenu }
      ],
      stars
    )
  } else {
    saveProgress()
    showDialog('GAME OVER', RED, 'SCORE ' + st.score + '   BEST ' + progress.best, [
      { label: 'RETRY', action: () => startGame(st.level, st.startScore) },
      { label: 'MENU', action: goMenu }
    ])
  }
}

// ---------- input ----------
function aimAt(x, y) {
  const dx = x - CX
  const dy = y - CY
  const len = Math.hypot(dx, dy)
  if (len < 28) {
    swap()
    return
  }
  if (st.shot) return
  st.aim = [dx / len, dy / len]
  st.shot = { x: CX, y: CY, vx: st.aim[0] * SHOT_SPEED, vy: st.aim[1] * SHOT_SPEED, color: st.cur }
  st.cur = st.next
  st.next = nextShot()
  announceSpecial()
}

function swap() {
  const t = st.cur
  st.cur = st.next
  st.next = t
  announceSpecial()
}

// when a special orb lands in the cannon, say what it is
function announceSpecial() {
  if (st.cur < 0) st.flash = { text: SPECIAL[st.cur].name, t: 1.2 }
}

// All taps arrive through one invisible full-screen layer on top of everything.
// It sits at 0,0, so its coordinates are screen coordinates.
function onTap(x, y) {
  const t = now()
  if (t - lastTapAt < 40) return // ignore an accidental double event
  lastTapAt = t

  if (ui.dialogOpen) {
    const d = ui.dialog
    for (let i = 0; i < d.buttons.length; i++) {
      if (hit(x, y, d.buttons[i])) {
        d.actions[i]()
        return
      }
    }
    return // taps outside the dialog buttons do nothing
  }

  if (screen === 'menu') {
    if (hit(x, y, ui.play)) startGame(progress.unlocked, 0)
    else if (hit(x, y, ui.levelsBtn)) openLevels()
  } else if (screen === 'levels') {
    const first = levelPage * LEVELS_PER_PAGE + 1
    for (let i = 0; i < ui.cells.length; i++) {
      if (hit(x, y, ui.cells[i])) {
        if (first + i <= progress.unlocked) startGame(first + i, 0)
        return
      }
    }
    if (hit(x, y, ui.prevBtn) && levelPage > 0) {
      levelPage--
      updateLevels()
    } else if (hit(x, y, ui.nextBtn) && first + LEVELS_PER_PAGE <= progress.unlocked) {
      levelPage++
      updateLevels()
    } else if (hit(x, y, ui.backBtn)) goMenu()
  } else if (screen === 'game' && st) {
    if (inBox(x, y, ui.pauseBox)) pause()
    else aimAt(x, y) // tapping the cannon itself swaps orbs
  }
}

// Swipe right normally closes the app. While playing it pauses instead,
// and on the level picker it goes back to the menu.
function onSwipe(ev) {
  if (ev !== GESTURE_RIGHT) return false
  if (screen === 'game') {
    pause()
    return true
  }
  if (screen === 'levels') {
    goMenu()
    return true
  }
  return false // on the menu: leave the app as usual
}

// ---------- building the screen (once) ----------
function buildScreen() {
  bgCanvas = createWidget(widget.CANVAS, { x: 0, y: 0, w: W, h: H })

  // --- game ---
  ui.score = mkText(CX - 100, CY - 92, 200, 34, 28, WHITE)
  ui.level = mkText(CX - 100, CY - 58, 200, 24, 18, DIM)

  // danger warning: a red ring with a black core, laid over the hole (under the orbs)
  ui.danger = mkCircle(-50, -50, 21, RED)
  ui.dangerCore = mkCircle(-50, -50, 15, 0x000000)
  setVisible(ui.danger, false)
  setVisible(ui.dangerCore, false)

  // orb pool (created before the menus and dialog so those stay on top)
  ui.free = []
  for (let i = 0; i < ORB_POOL; i++) {
    const slot = { o: mkCircle(-50, -50, R, WHITE), ball: null, x: null, y: null, c: null }
    setVisible(slot.o, false)
    ui.free.push(slot)
  }

  ui.shot = mkCircle(-50, -50, R, WHITE)
  setVisible(ui.shot, false)
  ui.shotDot = mkCircle(-50, -50, 5, WHITE) // marks a flying special orb
  setVisible(ui.shotDot, false)
  ui.cur = mkCircle(CX, CY - 4, R, WHITE)
  ui.curDot = mkCircle(CX, CY - 4, 5, WHITE) // marks a special orb in the cannon
  setVisible(ui.curDot, false)
  ui.next = mkCircle(CX, CY + 15, 5, WHITE)
  ui.aim = mkCircle(CX, CY - 36, 3, WHITE)
  ui.sparks = []
  for (let i = 0; i < SPARKS; i++) {
    const o = mkCircle(-50, -50, 3, WHITE)
    setVisible(o, false)
    ui.sparks.push({ o, x: 0, y: 0, vx: 0, vy: 0, t: 0, color: WHITE })
  }
  ui.flash = mkText(CX - 150, CY + 36, 300, 32, 24, GOLD)

  // star goals box: 3 rows of "dots + points", moved to a free corner each level
  ui.goals = [1, 2, 3].map((n) => ({
    dots: Array.from({ length: n }, () => mkDot(-50, -50, 4, LOCKED)),
    text: wrap(
      createWidget(widget.TEXT, { x: -100, y: -100, w: 46, h: 16, text: '', text_size: 14, color: DIM, align_h: align.LEFT, align_v: align.CENTER_V }),
      DIM
    )
  }))

  // pause pill at the bottom centre (clear of every track)
  ui.pauseBox = { x: CX - 26, y: H - 25, w: 52, h: 22 }
  const pb = ui.pauseBox
  const pill = mkRect(pb.x, pb.y, pb.w, pb.h, PANEL, 11)
  const bar1 = mkRect(CX - 7, pb.y + 5, 4, 12, DIM, 0)
  const bar2 = mkRect(CX + 3, pb.y + 5, 4, 12, DIM, 0)

  ui.gameGroup = [ui.score, ui.level, ui.cur, ui.next, ui.aim, ui.flash, pill, bar1, bar2]
  ui.goals.forEach((row) => ui.gameGroup.push(row.text, ...row.dots))

  // --- main menu ---
  ui.title = mkText(0, 72, W, 56, 44, WHITE)
  setText(ui.title, 'ORBIT POP')
  ui.play = mkButton(CX - 110, 200, 220, 56, 24)
  ui.levelsBtn = mkButton(CX - 110, 270, 220, 56, 24)
  ui.best = mkText(CX - 170, 344, 340, 28, 18, GOLD)
  ui.menuGroup = [ui.title, ui.best]
  ;[ui.play, ui.levelsBtn].forEach((b) => ui.menuGroup.push(b.bg, b.edge, b.label))

  // --- level picker: 3 columns x 4 rows ---
  ui.levelsTitle = mkText(CX - 150, 20, 300, 40, 26, WHITE)
  ui.levelGroup = [ui.levelsTitle]
  ui.cells = []
  const cw = 96
  const ch = 62
  const gap = 10
  const left = CX - (cw * 3 + gap * 2) / 2
  for (let i = 0; i < LEVELS_PER_PAGE; i++) {
    const x = left + (i % 3) * (cw + gap)
    const y = 72 + Math.floor(i / 3) * (ch + gap)
    // like a button, but with the level number on top, then 3 star dots, then the track name
    const cell = {
      box: { x, y, w: cw, h: ch },
      bg: mkRect(x, y, cw, ch, PANEL, 12),
      edge: mkStroke(x, y, cw, ch, EDGE, 12),
      label: mkText(x, y + 1, cw, 30, 24, WHITE),
      stars: [-1, 0, 1].map((k) => mkDot(x + cw / 2 + k * 12, y + 35, 4, LOCKED)),
      sub: mkText(x, y + 41, cw, 18, 13, DIM)
    }
    ui.cells.push(cell)
    ui.levelGroup.push(cell.bg, cell.edge, cell.label, cell.sub, ...cell.stars)
  }
  ui.prevBtn = mkButton(CX - 150, 364, 60, 46, 26)
  ui.backBtn = mkButton(CX - 80, 364, 160, 46, 22)
  ui.nextBtn = mkButton(CX + 90, 364, 60, 46, 26)
  ;[ui.prevBtn, ui.backBtn, ui.nextBtn].forEach((b) => ui.levelGroup.push(b.bg, b.edge, b.label))

  // --- dialog: panel, title, one line of text, up to three buttons ---
  ui.dialog = {
    panel: mkRect(CX - 130, 100, 260, 256, PANEL, 16),
    edge: mkStroke(CX - 130, 100, 260, 256, EDGE, 16),
    title: mkText(CX - 130, 110, 260, 40, 30, WHITE),
    sub: mkText(CX - 125, 150, 250, 26, 15, DIM),
    buttons: [0, 1, 2].map((i) => mkButton(CX - 100, 188 + i * 54, 200, 46, 20)),
    stars: [-1, 0, 1].map((k) => mkDot(CX + k * 36, 319, 11, LOCKED)), // where a 3rd button would be
    actions: []
  }

  // touch layer: an empty, transparent canvas created last, so it is on top of
  // everything and receives every tap with real screen coordinates
  ui.touch = createWidget(widget.CANVAS, { x: 0, y: 0, w: W, h: H })
  ui.touch.addEventListener(event.CLICK_DOWN, (e) => onTap(e.x, e.y))
}

// ---------- updating the game screen (every tick, only what changed) ----------
function orbColor(v) {
  return v < 0 ? WHITE : v // special orbs are white
}

function updateGame() {
  for (const b of st.chain) {
    if (b.s < 0) {
      if (b.slot) releaseBall(b) // rolled back off the start (REWIND)
      continue
    }
    if (!b.slot) b.slot = takeSlot(b)
    if (!b.slot) continue // pool exhausted (should not happen)
    const p = pos(b.s)
    placeOrb(b.slot, p[0], p[1], b.color)
  }

  const sh = st.shot
  setVisible(ui.shot, !!sh)
  setVisible(ui.shotDot, !!sh && sh.color < 0)
  if (sh) {
    setCircle(ui.shot, sh.x, sh.y, R, orbColor(sh.color))
    if (sh.color < 0) setCircle(ui.shotDot, sh.x, sh.y, 5, SPECIAL[sh.color].dot)
  }

  setCircle(ui.cur, CX, CY - 4, R, orbColor(st.cur))
  setVisible(ui.curDot, st.cur < 0)
  if (st.cur < 0) setCircle(ui.curDot, CX, CY - 4, 5, SPECIAL[st.cur].dot)
  setCircle(ui.next, CX, CY + 15, 5, orbColor(st.next))

  // danger: the hole flashes red (4 times a second) when the front orb is close
  const c = st.chain
  const danger = c.length > 0 && path.length - c[0].s < DANGER_DIST && !st.over
  const blink = danger && Math.floor(st.time * 4) % 2 === 0
  setVisible(ui.danger, blink)
  setVisible(ui.dangerCore, blink)
  setCircle(ui.aim, CX + st.aim[0] * 36, CY + st.aim[1] * 36, 3, WHITE)

  setText(ui.score, String(st.score))
  setText(ui.level, 'LV ' + st.level)

  // star goals: a row turns gold once this level's points reach it
  const got = st.score - st.startScore
  ui.goals.forEach((row, k) => {
    const done = got >= st.goals[k]
    setText(row.text, String(st.goals[k]))
    setColor(row.text, done ? GOLD : DIM)
    row.dots.forEach((d) => setDot(d, done ? GOLD : LOCKED))
  })
  setText(ui.flash, st.flash && !ui.dialogOpen ? st.flash.text : '')
}

// moves the star goals box (78 x 50 px) so its top-left corner is at x, y
function placeGoals(x, y) {
  ui.goals.forEach((row, k) => {
    const cy = Math.round(y + 8 + k * 17)
    row.dots.forEach((d, i) => setDot(d, LOCKED, Math.round(x + 5 + i * 10), cy))
    setMore(row.text, 'p' + x + ',' + y, { x: Math.round(x + 34), y: cy - 8, w: 46, h: 16 })
  })
}

// ---------- pop sparkles ----------
function sparkle(x, y, color) {
  ui.sparks.forEach((s, i) => {
    const a = (i / SPARKS) * 2 * Math.PI + Math.random() * 0.5
    s.x = x
    s.y = y
    s.vx = Math.cos(a) * SPARK_SPEED
    s.vy = Math.sin(a) * SPARK_SPEED
    s.t = SPARK_TIME
    s.color = color
  })
}

function updateSparks(dt) {
  for (const s of ui.sparks) {
    if (s.t <= 0) continue
    s.t -= dt
    s.x += s.vx * dt
    s.y += s.vy * dt
    setVisible(s.o, s.t > 0)
    if (s.t > 0) setCircle(s.o, s.x, s.y, s.t > SPARK_TIME / 2 ? 3 : 2, s.color)
  }
}

function hideSparks() {
  for (const s of ui.sparks) {
    s.t = 0
    setVisible(s.o, false)
  }
}

// ---------- main loop ----------
function now() {
  try {
    if (!timeSensor) timeSensor = new Time()
    return timeSensor.getTime()
  } catch (e) {
    return Date.now()
  }
}

const perf = { start: 0, ticks: 0, work: 0 }

function tick() {
  try {
    if (screen !== 'game' || !st || st.paused || st.over || st.won) return

    const t = now()
    let dt = (t - lastTick) / 1000
    lastTick = t
    if (dt < 0) dt = 0
    if (dt > MAX_DT) dt = MAX_DT // after a long stall (or screen off), just continue

    st.time += dt
    updateChain(dt)
    updateShot(dt)
    updateSparks(dt)
    checkEnd()
    if (st.flash) {
      st.flash.t -= dt
      if (st.flash.t <= 0) st.flash = null
    }
    updateGame()
    if (st.over || st.won) endLevel()

    // speed counter, shown in the pause menu
    perf.ticks++
    perf.work += now() - t
    if (t - perf.start >= 1000) {
      perfText = 'speed: ' + (perf.work / perf.ticks).toFixed(1) + ' ms/tick, ' + perf.ticks + ' ticks/s'
      perf.start = t
      perf.ticks = 0
      perf.work = 0
    }
  } catch (e) {
    if (timer !== null) clearInterval(timer)
    timer = null
    showError('tick', e)
  }
}

// DEBUG: shows what went wrong directly on the watch screen
let step = 'start'
function showError(where, e) {
  const stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join('\n') : ''
  const msg = where + ' / ' + step + ': ' + (e && e.message ? e.message : String(e)) + '\n' + stack
  console.log('ORBIT POP ERROR ' + msg)
  createWidget(widget.TEXT, {
    x: 15,
    y: 40,
    w: (W || 390) - 30,
    h: 380,
    text: msg,
    text_size: 18,
    color: RED,
    text_style: text_style.WRAP
  })
}

// ---------- page ----------
Page({
  build() {
    try {
      step = 'getDeviceInfo'
      const info = getDeviceInfo()
      W = info.width
      H = info.height
      CX = W / 2
      CY = H / 2

      step = 'setStatusBarVisible'
      try {
        setStatusBarVisible(false) // hide the "Orbit Pop" title bar (square screens only)
      } catch (e) {
        console.log('ORBIT POP could not hide status bar: ' + e)
      }

      step = 'setPageBrightTime'
      setPageBrightTime({ brightTime: 600000 }) // keep the screen on while playing (10 min)

      step = 'load progress'
      storage = new LocalStorage()
      loadProgress()

      step = 'build screen'
      buildScreen()
      setScreen('menu')

      step = 'onGesture'
      try {
        onGesture({ callback: onSwipe })
      } catch (e) {
        console.log('ORBIT POP could not listen for swipes: ' + e)
      }

      step = 'setInterval'
      lastTick = now()
      perf.start = lastTick
      timer = setInterval(tick, FRAME_MS)
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
    if (st && st.score > progress.best) {
      progress.best = st.score
      saveProgress()
    }
    resetPageBrightTime()
  }
})
