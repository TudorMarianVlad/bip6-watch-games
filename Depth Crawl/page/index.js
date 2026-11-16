// Depth Crawl — a first-person roguelite dungeon crawler for Zepp OS (API 4.0, built for Amazfit Bip 6)
//
// How it plays:
//   * Every floor is generated: rooms and corridors. Find the gold key, unlock the wooden door and
//     step into the blue portal to go one floor deeper. Pick a boon between floors.
//   * Turn-based: monsters move when you act (step, attack, open, drink). Turning is free.
//   * Walk into a monster to attack: a gold ring shrinks; tap when it meets the inner ring = critical hit.
//   * Skeletons and brutes glow red before a heavy hit. Back away, or tap the red ring to block it.
//   * The torch burns one fuel per turn. The darker it gets, the less you see. At zero you are nearly
//     blind and monsters move twice. Oil flasks refill it, and so does walking in real life (4 steps = 1 fuel).
//   * Spikes rise every other turn. Cracked walls hide treasure (walk into them). Levers open iron gates.
//   * A heartbeat buzz means a monster is close and you cannot see it.
//   * Die and the run is over. Best floor is saved; the Daily Dungeon is the same for everyone each day.
//   * The run is saved when you leave the app; CONTINUE picks it up again.
//
// Controls (play): swipe up/down = step forward/back, left/right = turn. Or tap the view: left/right
// third = turn, upper middle = forward, lower middle = back. Tap the potion (bottom left) to drink.
// Tap the top bars to pause.
//
// Rendering: a raycaster on one canvas. Walls are drawn as vertical bars, neighbours with the same
// height and shade merged into one rectangle; sprites (monsters, items) are drawn column by column
// behind a depth buffer, also merged. Ceiling and floor are static widgets behind the canvas, recoloured
// only when the torch level changes. The view is only redrawn while something changes.

import { createWidget, widget, event, prop, align, text_style, setStatusBarVisible } from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { setPageBrightTime, resetPageBrightTime } from '@zos/display'
import { onGesture, offGesture, GESTURE_UP, GESTURE_DOWN, GESTURE_LEFT, GESTURE_RIGHT } from '@zos/interaction'
import { LocalStorage } from '@zos/storage'
import { Time, Step, Vibrator, VIBRATOR_SCENE_SHORT_LIGHT, VIBRATOR_SCENE_SHORT_STRONG, VIBRATOR_SCENE_SHORT_MIDDLE } from '@zos/sensor'

// ---------- tuning ----------
const TICK_MS = 30
const STEP_TIME = 0.22
const TURN_TIME = 0.2
const BUMP_TIME = 0.16
const WAIT_TIME = 0.18
const FOV_PLANE = 0.66
const COL_WIDTHS = [6, 4, 8, 10]
const MAX_DEPTH = 24
const SWIPE_MIN = 26
const MW = 19 // floor size in tiles
const MH = 19

const RING_MEET = 0.6 // seconds until the shrinking ring meets the target ring
const RING_END = 0.85
const RING_R0 = 80
const RING_RT = 26
const RING_WINDOW = 0.085 // +- seconds around RING_MEET that count as perfect

const START_HP = 20
const START_ATK = 3
const START_TORCH = 120
const STEPS_PER_FUEL = 4
const AWAKE_RANGE = 6

// ---------- colours ----------
const BG = 0x000000
const WHITE = 0xffffff
const DIM = 0x8a8170
const GOLD = 0xffd84d
const CYAN = 0x4de0ff
const RED = 0xff5c5c
const GREEN = 0x4dd06a
const ORANGE = 0xffa03a
const PANEL = 0x15120e
const PANEL_ON = 0x2a2116
const EDGE = 0x5a4a32
const BAR_BACK = 0x2a241d

const STONE = [0x9a8a72, 0x766a58]
const STONE_SEAM = [0x4a4236, 0x3a342b]
const CRACK = [0x5a4e3e, 0x463c30]
const WOOD = [0x8c5a2e, 0x6e4724]
const WOOD_SEAM = [0x3e2812, 0x301e0e]
const IRON = [0x2a2d33, 0x202328]
const IRON_BAR = [0x7a808a, 0x5e646c]
const FOG_LEVELS = 24

// ---------- monsters ----------
// every: 1 = moves every turn, 2 = every other turn. heavy: winds up (glows red) then hits hard; can be blocked.
const MONS = {
  rat: { name: 'RAT', hp: 3, dmg: 1, every: 1, size: 0.5 },
  slime: { name: 'SLIME', hp: 6, dmg: 2, every: 2, size: 0.7, splits: true },
  slimelet: { name: 'SLIMELET', hp: 2, dmg: 1, every: 1, size: 0.42 },
  skeleton: { name: 'SKELETON', hp: 8, dmg: 5, every: 1, size: 1.0, heavy: true },
  brute: { name: 'BRUTE', hp: 15, dmg: 8, every: 2, size: 1.12, heavy: true }
}

// ---------- boons (pick one between floors, or from a treasure chest) ----------
const BOONS = [
  { id: 'blade', name: 'SHARPER BLADE', desc: '+1 attack damage', ok: () => true, apply: (r) => (r.atk += 1) },
  { id: 'hide', name: 'TOUGH HIDE', desc: '+6 max HP and heal 6', ok: () => true, apply: (r) => { r.maxHp += 6; r.hp = Math.min(r.maxHp, r.hp + 6) } },
  { id: 'shield', name: 'IRON SHIELD', desc: 'Take 1 less damage per hit', ok: (r) => r.armor < 3, apply: (r) => (r.armor += 1) },
  { id: 'torch', name: 'BRIGHTER TORCH', desc: '+40 torch fuel, refilled', ok: () => true, apply: (r) => { r.torchMax += 40; r.torch = r.torchMax } },
  { id: 'hand', name: 'STEADY HAND', desc: 'Wider timing for crits and blocks', ok: (r) => r.luck < 3, apply: (r) => (r.luck += 1) },
  { id: 'belt', name: 'POTION BELT', desc: '+2 healing potions', ok: () => true, apply: (r) => (r.potions += 2) },
  { id: 'thirst', name: 'BLOODTHIRST', desc: 'Heal 2 HP on every kill', ok: (r) => r.vamp < 3, apply: (r) => (r.vamp += 1) },
  { id: 'rest', name: 'REST', desc: 'Heal to full HP', ok: (r) => r.hp < r.maxHp, apply: (r) => (r.hp = r.maxHp) },
  { id: 'purse', name: 'FAT PURSE', desc: '+25 gold', ok: () => true, apply: (r) => (r.gold += 25) }
]

const HOWTO = [
  ['MOVING', 'Swipe up to step forward, down to step back, left or right to turn. Or tap the view: sides turn, upper middle steps forward, lower middle steps back.\n\nFind the gold key, open the wooden door and step into the blue portal to go deeper.'],
  ['FIGHTING', 'Walk into a monster to attack. A gold ring shrinks: tap as it meets the inner ring for a critical hit.\n\nSkeletons and brutes glow red before a heavy blow. Back away, or tap the red ring at the right moment to block it.\n\nMonsters only move when you act. Turning is free.'],
  ['SURVIVING', 'Your torch burns every turn. At zero you are nearly blind and monsters move twice. Oil refills it, and so does walking in real life: 4 steps = 1 fuel.\n\nSpikes rise every other turn. Cracked walls hide treasure. Levers open iron gates. A heartbeat buzz: something is close behind you.']
]

// ---------- module state ----------
let W, H, VY, VH, HOR
let cv = null
let mapCv = null
let timer = null
let timeSensor = null
let stepSensor = null
let vibrator = null
let storage = null
let lastTick = 0
let step = 'start'

let screen = 'menu' // menu | howto | play | boon | dead | pause
let phase = 'idle' // idle | anim | ring  (while screen === 'play')
let howPage = 0

let meta = { best: 0, bestGold: 0, daily: { day: 0, best: 0 }, lastSteps: -1, stepBank: 0, col: 0 }
let run = null // the current run (null when none)
let map = []
let seen = []
let items = []
let mons = []
let pending = [] // heavy attacks to parry this turn
const P = { x: 1, y: 1, face: 0 }
const cam = { x: 1.5, y: 1.5, a: 0 }
let anim = null
let ring = null
let queued = null
let dirty = true
let mapDirty = true
let touch = null
let lastGesture = { t: 0, dir: '' }
let msgUntil = 0
let floatUntil = 0
let flashUntil = 0
let lastStepPoll = 0
let colW = COL_WIDTHS[0]
let fogC = 0.18
let lightBucket = -1
let zbuf = []
let overlayActions = []
let boonChoices = []
let boonFromChest = false

const perf = { avg: 0, frames: 0, rects: 0 }
const ui = {}
const shadeCache = {}
const DX = [1, 0, -1, 0] // facing: 0 east, 1 south, 2 west, 3 north (y grows downwards)
const DY = [0, 1, 0, -1]

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
  const r = Math.round(((c >> 16) & 255) * k)
  const g = Math.round(((c >> 8) & 255) * k)
  const b = Math.round((c & 255) * k)
  return (r << 16) | (g << 8) | b
}

function mix(a, b, k) {
  const r = Math.round(((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k)
  const g = Math.round(((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k)
  const bl = Math.round((a & 255) * (1 - k) + (b & 255) * k)
  return (r << 16) | (g << 8) | bl
}

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function fogLevel(d) {
  return Math.round((1 / (1 + fogC * d * d)) * FOG_LEVELS)
}

function shade(c, level) {
  const key = c * 32 + level
  let v = shadeCache[key]
  if (v === undefined) {
    v = scale(c, level / FOG_LEVELS)
    shadeCache[key] = v
  }
  return v
}

function buzz(kind) {
  try {
    if (!vibrator) vibrator = new Vibrator()
    const mode = kind === 'strong' ? VIBRATOR_SCENE_SHORT_STRONG : kind === 'mid' ? VIBRATOR_SCENE_SHORT_MIDDLE : VIBRATOR_SCENE_SHORT_LIGHT
    vibrator.stop()
    vibrator.start({ mode })
  } catch (e) {
    // no vibration: play silently
  }
}

function heartbeat() {
  buzz('light')
  try {
    setTimeout(() => buzz('light'), 230)
  } catch (e) {
    // one beat is enough
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
function mkStroke(x, y, w, h, color, radius, lw) {
  return wrap(createWidget(widget.STROKE_RECT, { x, y, w, h, radius: radius || 0, line_width: lw || 2, color }), color)
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
  const sig = JSON.stringify(values)
  if (o.m === sig) return
  o.m = sig
  o.w.setProperty(prop.MORE, values)
}
function setBar(o, x, y, fullW, h, frac, color) {
  const w = Math.max(0, Math.round(fullW * clamp(frac, 0, 1)))
  setVisible(o, w > 0)
  if (w > 0) setMore(o, { x, y, w, h, radius: Math.min(h / 2, w / 2), color })
}
function inBox(x, y, b) {
  return x >= b[0] && x < b[0] + b[2] && y >= b[1] && y < b[1] + b[3]
}

// ---------- the map ----------
function cell(x, y) {
  if (x < 0 || y < 0 || x >= MW || y >= MH) return '#'
  return map[y][x]
}

function solid(c) {
  return c === '#' || c === 'D' || c === 'C' || c === 'G'
}

function itemAt(x, y) {
  for (let i = 0; i < items.length; i++) if (items[i].x === x && items[i].y === y) return items[i]
  return null
}

function monAt(x, y) {
  for (let i = 0; i < mons.length; i++) if (mons[i].x === x && mons[i].y === y) return mons[i]
  return null
}

function solidItem(it) {
  return it && (it.k === 'chest' || it.k === 'lever')
}

function spikesUp() {
  return run.turn % 2 === 0
}

// ---------- floor generation ----------
function genFloor(depth, seed) {
  const R = mulberry32(seed)
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1))
  const pick = (arr) => arr[Math.floor(R() * arr.length)]
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1))
      const t = arr[i]
      arr[i] = arr[j]
      arr[j] = t
    }
    return arr
  }
  const g = []
  for (let y = 0; y < MH; y++) g.push(new Array(MW).fill('#'))

  // rooms
  const rooms = []
  for (let tries = 0; tries < 300 && rooms.length < 8; tries++) {
    const w = pick([3, 3, 5, 5, 7])
    const h = pick([3, 3, 5, 5])
    const x = 1 + 2 * ri(0, Math.floor((MW - 2 - w) / 2))
    const y = 1 + 2 * ri(0, Math.floor((MH - 2 - h) / 2))
    let ok = true
    for (const r of rooms) {
      if (x - 1 < r.x + r.w && x + w + 1 > r.x && y - 1 < r.y + r.h && y + h + 1 > r.y) {
        ok = false
        break
      }
    }
    if (!ok) continue
    rooms.push({ x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) })
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) g[yy][xx] = '.'
  }

  // corridors: each room to its nearest earlier room, plus a couple of loops
  const carveL = (a, b) => {
    const hFirst = R() < 0.5
    let x = a.cx
    let y = a.cy
    const goX = () => {
      while (x !== b.cx) {
        x += x < b.cx ? 1 : -1
        g[y][x] = '.'
      }
    }
    const goY = () => {
      while (y !== b.cy) {
        y += y < b.cy ? 1 : -1
        g[y][x] = '.'
      }
    }
    if (hFirst) {
      goX()
      goY()
    } else {
      goY()
      goX()
    }
  }
  for (let i = 1; i < rooms.length; i++) {
    let best = 0
    let bd = 1e9
    for (let j = 0; j < i; j++) {
      const d = Math.abs(rooms[i].cx - rooms[j].cx) + Math.abs(rooms[i].cy - rooms[j].cy)
      if (d < bd) {
        bd = d
        best = j
      }
    }
    carveL(rooms[i], rooms[best])
  }
  for (let i = 0; i < 2 && rooms.length > 3; i++) carveL(pick(rooms), pick(rooms))

  const start = rooms[0]
  const sx = start.cx
  const sy = start.cy
  const its = []
  const ms = []
  const taken = {}
  const key = (x, y) => x + ',' + y
  taken[key(sx, sy)] = true

  const bfs = () => {
    const d = []
    for (let y = 0; y < MH; y++) d.push(new Array(MW).fill(-1))
    d[sy][sx] = 0
    const q = [sx, sy]
    for (let i = 0; i < q.length; i += 2) {
      const x = q[i]
      const y = q[i + 1]
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k]
        const ny = y + DY[k]
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue
        if (d[ny][nx] >= 0 || solid(g[ny][nx])) continue
        d[ny][nx] = d[y][x] + 1
        q.push(nx, ny)
      }
    }
    return d
  }
  let dist = bfs()
  const floorCells = () => {
    const out = []
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (dist[y][x] > 0) out.push([x, y, dist[y][x]])
    return out
  }

  // an enclosed one-tile nook behind a wall: F floor, W wall to convert, B the nook
  const nook = (fx, fy, d) => {
    const wx = fx + DX[d]
    const wy = fy + DY[d]
    const bx = fx + 2 * DX[d]
    const by = fy + 2 * DY[d]
    if (bx < 1 || by < 1 || bx > MW - 2 || by > MH - 2) return null
    if (g[wy][wx] !== '#' || g[by][bx] !== '#') return null
    for (let k = 0; k < 4; k++) {
      const nx = bx + DX[k]
      const ny = by + DY[k]
      if (nx === wx && ny === wy) continue
      if (g[ny][nx] !== '#') return null
    }
    return { wx, wy, bx, by }
  }
  const findNook = (cells) => {
    for (const c of cells) {
      const dirs = shuffle([0, 1, 2, 3])
      for (const d of dirs) {
        const n = nook(c[0], c[1], d)
        if (!n || taken[key(n.bx, n.by)]) continue
        // the new wall must not also touch another nook (breaking it could bypass the locked door)
        let clash = false
        for (let k = 0; k < 4; k++) {
          const nx = n.wx + DX[k]
          const ny = n.wy + DY[k]
          if ((nx === c[0] && ny === c[1]) || (nx === n.bx && ny === n.by)) continue
          if (taken[key(nx, ny)] || g[ny][nx] !== '#') clash = true
        }
        if (!clash) return n
      }
    }
    return null
  }

  // exit: a nook behind the locked door, as far from the start as possible
  let cells = floorCells().sort((a, b) => b[2] - a[2])
  const maxD = cells.length ? cells[0][2] : 1
  const far = shuffle(cells.slice(0, Math.max(8, Math.floor(cells.length / 4))))
  let ex = findNook(far) || findNook(cells)
  let doorX = -1
  let doorY = -1
  if (ex) {
    g[ex.wy][ex.wx] = 'D'
    g[ex.by][ex.bx] = '.'
    doorX = ex.wx
    doorY = ex.wy
    its.push({ k: 'exit', x: ex.bx, y: ex.by })
    taken[key(ex.bx, ex.by)] = true
    taken[key(ex.wx, ex.wy)] = true
  } else {
    const c = cells[0]
    its.push({ k: 'exit', x: c[0], y: c[1] })
    taken[key(c[0], c[1])] = true
  }
  dist = bfs()
  cells = floorCells()
  const free = (c) => !taken[key(c[0], c[1])]

  // key: far from the start and not right next to the door
  if (ex) {
    let kc = shuffle(cells.filter((c) => free(c) && c[2] >= maxD * 0.4 && Math.abs(c[0] - doorX) + Math.abs(c[1] - doorY) >= 5))
    if (!kc.length) kc = cells.filter(free).sort((a, b) => b[2] - a[2])
    const c = kc[0]
    its.push({ k: 'key', x: c[0], y: c[1] })
    taken[key(c[0], c[1])] = true
  }

  // secret nook behind a cracked wall, with a chest
  if (R() < 0.7) {
    const n = findNook(shuffle(cells.slice()))
    if (n) {
      g[n.wy][n.wx] = 'C'
      g[n.by][n.bx] = '.'
      its.push({ k: 'chest', x: n.bx, y: n.by })
      taken[key(n.bx, n.by)] = true
      taken[key(n.wx, n.wy)] = true
    }
  }

  // vault behind an iron gate, opened by a lever in the middle of another room
  if (depth >= 2 && R() < 0.6) {
    const n = findNook(shuffle(cells.slice()))
    const leverRooms = shuffle(rooms.slice(1).filter((r) => !taken[key(r.cx, r.cy)] && dist[r.cy][r.cx] > 0))
    if (n && leverRooms.length) {
      g[n.wy][n.wx] = 'G'
      g[n.by][n.bx] = '.'
      its.push({ k: 'chest', x: n.bx, y: n.by })
      const r = leverRooms[0]
      its.push({ k: 'lever', x: r.cx, y: r.cy, on: false })
      taken[key(n.bx, n.by)] = true
      taken[key(n.wx, n.wy)] = true
      taken[key(r.cx, r.cy)] = true
    }
  }

  const placeRandom = (k, extra, minDist) => {
    const c = shuffle(cells.filter((c) => free(c) && c[2] >= (minDist || 1)))[0]
    if (!c) return null
    const it = Object.assign({ k, x: c[0], y: c[1] }, extra || {})
    its.push(it)
    taken[key(c[0], c[1])] = true
    return it
  }

  // spikes in corridors
  if (depth >= 2) {
    const corridor = cells.filter((c) => {
      if (!free(c) || c[2] < 3) return false
      const ew = !solid(g[c[1]][c[0] - 1]) && !solid(g[c[1]][c[0] + 1]) && solid(g[c[1] - 1][c[0]]) && solid(g[c[1] + 1][c[0]])
      const ns = !solid(g[c[1] - 1][c[0]]) && !solid(g[c[1] + 1][c[0]]) && solid(g[c[1]][c[0] - 1]) && solid(g[c[1]][c[0] + 1])
      return ew || ns
    })
    shuffle(corridor)
    const n = Math.min(corridor.length, Math.min(5, 1 + Math.floor(depth / 2)))
    for (let i = 0; i < n; i++) {
      its.push({ k: 'spikes', x: corridor[i][0], y: corridor[i][1] })
      taken[key(corridor[i][0], corridor[i][1])] = true
    }
  }

  // loot
  const piles = ri(3, 5)
  for (let i = 0; i < piles; i++) placeRandom('gold', { n: 2 + depth * 2 + ri(0, 4) })
  if (R() < 0.6) placeRandom('potion')
  if (depth >= 4 && R() < 0.4) placeRandom('potion')
  placeRandom('oil')
  if (R() < 0.4) placeRandom('oil')

  // monsters
  const pool = depth === 1 ? ['rat', 'rat', 'rat', 'slime', 'slime'] : depth === 2 ? ['rat', 'rat', 'slime', 'slime', 'skeleton', 'skeleton'] : depth < 5 ? ['rat', 'rat', 'slime', 'skeleton', 'skeleton', 'skeleton', 'brute'] : ['rat', 'slime', 'skeleton', 'skeleton', 'skeleton', 'brute', 'brute']
  const count = Math.min(12, 3 + Math.floor(depth * 1.3))
  for (let i = 0; i < count; i++) {
    const t = pick(pool)
    const c = shuffle(cells.filter((c) => free(c) && c[2] >= 5))[0]
    if (!c) break
    ms.push(makeMon(t, c[0], c[1], depth))
    taken[key(c[0], c[1])] = true
    if (t === 'rat') {
      // rats come in pairs
      for (let k = 0; k < 4; k++) {
        const nx = c[0] + DX[k]
        const ny = c[1] + DY[k]
        if (!solid(g[ny][nx]) && !taken[key(nx, ny)] && dist[ny][nx] > 0) {
          ms.push(makeMon('rat', nx, ny, depth))
          taken[key(nx, ny)] = true
          break
        }
      }
    }
  }

  // start facing an open direction
  let face = 0
  for (let k = 0; k < 4; k++) {
    if (!solid(g[sy + DY[k]][sx + DX[k]])) {
      face = k
      break
    }
  }
  return { g, items: its, mons: ms, sx, sy, face }
}

function makeMon(t, x, y, depth) {
  const d = MONS[t]
  const hp = Math.round(d.hp * (1 + 0.2 * (depth - 1)))
  return { t, x, y, fx: x, fy: y, hp, max: hp, awake: false, wind: 0, tick: 0, flash: 0 }
}

// ---------- runs and floors ----------
function newRun(daily) {
  const day = dayKey()
  run = {
    daily: !!daily,
    day,
    seed: daily ? day * 7919 : Math.floor(Math.random() * 1e9),
    depth: 1,
    hp: START_HP,
    maxHp: START_HP,
    atk: START_ATK,
    armor: 0,
    luck: 0,
    vamp: 0,
    torch: START_TORCH,
    torchMax: START_TORCH,
    potions: 1,
    gold: 0,
    key: false,
    kills: 0,
    turn: 0,
    steps: 0,
    beatTurn: -9,
    dead: false
  }
  lastStepPollReset()
  enterFloor()
}

function lastStepPollReset() {
  // only steps walked from now on count for this run
  const s = readSteps()
  if (s >= 0) meta.lastSteps = s
  meta.stepBank = 0
}

function enterFloor() {
  const f = genFloor(run.depth, run.seed + run.depth * 1013)
  map = f.g
  items = f.items
  mons = f.mons
  seen = []
  for (let y = 0; y < MH; y++) seen.push(new Array(MW).fill(false))
  P.x = f.sx
  P.y = f.sy
  P.face = f.face
  run.key = false
  resetView()
  setScreen('play')
  say('FLOOR ' + run.depth, GOLD, 1.6)
  setVisible(ui.hint, run.depth === 1)
  saveRun()
}

function resetView() {
  cam.x = P.x + 0.5
  cam.y = P.y + 0.5
  cam.a = P.face * (Math.PI / 2)
  anim = null
  ring = null
  queued = null
  pending = []
  phase = 'idle'
  lightBucket = -1
  dirty = true
  mapDirty = true
  hideRings()
  updateLight()
  updateHud()
  updateFoe()
}

// ---------- saving ----------
function loadMeta() {
  try {
    const raw = storage.getItem('meta', '')
    if (raw) Object.assign(meta, JSON.parse(raw))
  } catch (e) {
    console.log('DEPTH CRAWL bad meta: ' + e)
  }
  colW = COL_WIDTHS[meta.col % COL_WIDTHS.length]
}

function saveMeta() {
  try {
    storage.setItem('meta', JSON.stringify(meta))
  } catch (e) {
    console.log('DEPTH CRAWL could not save meta: ' + e)
  }
}

function saveRun() {
  try {
    if (!run || run.dead) {
      storage.setItem('run', '')
      return
    }
    const s = {
      run,
      map: map.map((r) => r.join('')),
      seen: seen.map((r) => r.map((v) => (v ? '1' : '0')).join('')),
      items,
      mons: mons.map((m) => ({ t: m.t, x: m.x, y: m.y, hp: m.hp, max: m.max, awake: m.awake, wind: m.wind, tick: m.tick })),
      p: [P.x, P.y, P.face]
    }
    storage.setItem('run', JSON.stringify(s))
  } catch (e) {
    console.log('DEPTH CRAWL could not save run: ' + e)
  }
}

function hasSavedRun() {
  try {
    return !!storage.getItem('run', '')
  } catch (e) {
    return false
  }
}

function loadRun() {
  try {
    const s = JSON.parse(storage.getItem('run', ''))
    run = s.run
    map = s.map.map((r) => r.split(''))
    seen = s.seen.map((r) => r.split('').map((c) => c === '1'))
    items = s.items
    mons = s.mons.map((m) => Object.assign({ fx: m.x, fy: m.y, flash: 0 }, m))
    P.x = s.p[0]
    P.y = s.p[1]
    P.face = s.p[2]
    resetView()
    setScreen('play')
    say('FLOOR ' + run.depth, GOLD, 1.4)
    pollSteps()
    return true
  } catch (e) {
    console.log('DEPTH CRAWL could not load run: ' + e)
    run = null
    return false
  }
}

// ---------- real steps refuel the torch ----------
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
  if (!run || run.dead || delta <= 0) return
  meta.stepBank += delta
  const fuel = Math.floor(meta.stepBank / STEPS_PER_FUEL)
  if (fuel <= 0) return
  meta.stepBank -= fuel * STEPS_PER_FUEL
  const before = run.torch
  run.torch = Math.min(run.torchMax, run.torch + fuel)
  const got = run.torch - before
  if (got >= 3 && screen === 'play') say('Walking: torch +' + got, ORANGE)
  updateLight()
  updateHud()
}

// ---------- sprites ----------
// shape(u, obj) returns vertical pieces [v0, v1, colour] at horizontal position u (0..1 across the sprite box)
function dome(u, cx, rx, hgt, color) {
  const du = (u - cx) / rx
  if (Math.abs(du) > 1) return null
  const h = hgt * Math.sqrt(1 - du * du)
  return [1 - h, 1, color]
}

function band(out, u, u0, u1, v0, v1, color) {
  if (u >= u0 && u < u1) out.push([v0, v1, color])
}

function keyShape(u) {
  const out = []
  const du = (u - 0.5) / 0.16
  if (Math.abs(du) <= 1) {
    const half = Math.sqrt(1 - du * du) * 0.16
    const inner = Math.abs(du) < 0.5 ? Math.sqrt(1 - (du / 0.5) * (du / 0.5)) * 0.07 : 0
    if (inner > 0) {
      out.push([0.3 - half, 0.3 - inner, GOLD])
      out.push([0.3 + inner, 0.3 + half, GOLD])
    } else out.push([0.3 - half, 0.3 + half, GOLD])
  }
  band(out, u, 0.45, 0.55, 0.46, 0.92, 0xe0b030)
  if (u > 0.55 && u <= 0.68) {
    out.push([0.74, 0.8, 0xe0b030])
    out.push([0.85, 0.92, 0xe0b030])
  }
  return out
}

function exitShape(u) {
  const du = Math.abs(u - 0.5) / 0.5
  if (du > 1) return []
  const top = 0.3 * (1 - Math.sqrt(1 - du * du))
  if (du > 0.72) return [[top, 1, CYAN]]
  const innerTop = 0.3 * (1 - Math.sqrt(Math.max(0, 1 - (du / 0.72) * (du / 0.72)))) + 0.12
  return [
    [top, innerTop, CYAN],
    [innerTop, 1, mix(0x123a6a, 0x2a7ac0, 1 - du)]
  ]
}

function goldShape(u) {
  const out = []
  const d = dome(u, 0.5, 0.4, 0.38, 0xd4a020)
  if (d) out.push(d)
  const t = dome(u, 0.45, 0.18, 0.3, GOLD)
  if (t) out.push([t[0], t[0] + 0.08, 0xfff0a0])
  return out
}

function bottleShape(color) {
  return (u) => {
    const out = []
    band(out, u, 0.42, 0.58, 0.06, 0.14, 0x8c5a2e)
    band(out, u, 0.44, 0.56, 0.14, 0.4, 0xd8d8e0)
    const du = (u - 0.5) / 0.32
    if (Math.abs(du) <= 1) {
      const h = Math.sqrt(1 - du * du) * 0.3
      out.push([0.68 - h, 0.68 + h, color])
      if (du < -0.2 && du > -0.6) out.push([0.6 - h * 0.5, 0.64 - h * 0.5, WHITE])
    }
    return out
  }
}

function chestShape(u) {
  const out = []
  if (u < 0.08 || u > 0.92) return out
  out.push([0.3, 0.5, 0x8c5a2e])
  out.push([0.5, 0.57, GOLD])
  out.push([0.57, 1, 0x6e4724])
  band(out, u, 0.44, 0.56, 0.45, 0.66, 0xffe070)
  return out
}

function leverShape(u, it) {
  const out = []
  band(out, u, 0.3, 0.7, 0.86, 1, 0x60646c)
  const dir = it.on ? 1 : -1
  const t = ((u - 0.5) * dir) / 0.25
  if (t >= -0.1 && t <= 1) {
    const v = 0.86 - 0.5 * clamp(t, 0, 1)
    out.push([v - 0.05, v + 0.05, 0x8c5a2e])
  }
  const kx = 0.5 + dir * 0.27
  band(out, u, kx - 0.06, kx + 0.06, 0.28, 0.4, it.on ? GREEN : RED)
  return out
}

function spikesShape(u, it) {
  if (!spikesUp()) {
    const hole = (u * 5) % 1 > 0.35 && (u * 5) % 1 < 0.65
    return [[0.94, 1, hole ? 0x202226 : 0x555a60]]
  }
  const tri = (u * 5) % 1
  const h = 1 - Math.abs(tri - 0.5) * 2
  return [
    [1 - 0.5 * h, 0.95, 0xc0c4cc],
    [0.95, 1, 0x555a60]
  ]
}

function ratShape(u) {
  const out = []
  const du = (u - 0.45) / 0.33
  if (Math.abs(du) <= 1) {
    const h = 0.16 * Math.sqrt(1 - du * du)
    out.push([0.84 - h * 1.4, 0.84 + h * 0.8, 0x7a6a5a])
  }
  band(out, u, 0.16, 0.24, 0.66, 0.74, 0xc08a8a) // ear
  band(out, u, 0.15, 0.2, 0.76, 0.8, RED) // eye
  band(out, u, 0.78, 1, 0.9, 0.93, 0xc08a8a) // tail
  return out
}

function slimeShape(u) {
  const out = []
  const d = dome(u, 0.5, 0.46, 0.62, 0x4dd06a)
  if (d) {
    out.push(d)
    const hl = dome(u, 0.38, 0.12, 0.5, 0xa0f0b0)
    if (hl) out.push([hl[0] + 0.04, hl[0] + 0.12, 0xa0f0b0])
  }
  band(out, u, 0.34, 0.42, 0.58, 0.68, 0x103018)
  band(out, u, 0.58, 0.66, 0.58, 0.68, 0x103018)
  return out
}

function skeletonShape(u) {
  const out = []
  const BONE = 0xe8e2d0
  band(out, u, 0.38, 0.62, 0.0, 0.18, BONE)
  if (u >= 0.42 && u < 0.47) out.push([0.06, 0.11, 0x201a14])
  if (u >= 0.53 && u < 0.58) out.push([0.06, 0.11, 0x201a14])
  band(out, u, 0.47, 0.53, 0.18, 0.6, BONE)
  if (u >= 0.33 && u < 0.67) {
    out.push([0.24, 0.27, BONE])
    out.push([0.31, 0.34, BONE])
    out.push([0.38, 0.41, BONE])
  }
  band(out, u, 0.38, 0.62, 0.58, 0.64, BONE)
  band(out, u, 0.38, 0.44, 0.64, 1, BONE)
  band(out, u, 0.56, 0.62, 0.64, 1, BONE)
  band(out, u, 0.26, 0.32, 0.22, 0.56, BONE)
  band(out, u, 0.68, 0.74, 0.22, 0.56, BONE)
  band(out, u, 0.76, 0.8, 0.02, 0.56, 0xa0a8b4) // sword
  band(out, u, 0.72, 0.84, 0.5, 0.54, 0x8c5a2e)
  return out
}

function bruteShape(u) {
  const out = []
  const SKIN = 0x8a7a4a
  band(out, u, 0.2, 0.8, 0.26, 0.76, SKIN)
  band(out, u, 0.22, 0.78, 0.5, 0.56, 0x5a3a20) // belt
  band(out, u, 0.38, 0.62, 0.04, 0.27, SKIN)
  if (u >= 0.42 && u < 0.48) out.push([0.12, 0.16, 0xffe050])
  if (u >= 0.52 && u < 0.58) out.push([0.12, 0.16, 0xffe050])
  band(out, u, 0.42, 0.58, 0.2, 0.23, 0x3a2a14)
  band(out, u, 0.25, 0.42, 0.76, 1, 0x6a5a34)
  band(out, u, 0.58, 0.75, 0.76, 1, 0x6a5a34)
  band(out, u, 0.07, 0.2, 0.28, 0.66, SKIN)
  band(out, u, 0.8, 0.93, 0.28, 0.66, SKIN)
  band(out, u, 0.86, 0.98, 0.0, 0.44, 0x6e4724) // club
  return out
}

const SPRITES = {
  key: { shape: keyShape, size: 0.42, lift: 0.18, glow: 0.5 },
  exit: { shape: exitShape, size: 0.85, lift: 0, glow: 0.6 },
  gold: { shape: goldShape, size: 0.32, lift: 0, glow: 0.35 },
  potion: { shape: bottleShape(0xe0403a), size: 0.34, lift: 0, glow: 0.35 },
  oil: { shape: bottleShape(0xe0a030), size: 0.34, lift: 0, glow: 0.35 },
  chest: { shape: chestShape, size: 0.55, lift: 0, glow: 0.3 },
  lever: { shape: leverShape, size: 0.6, lift: 0, glow: 0.25 },
  spikes: { shape: spikesShape, size: 0.8, lift: 0, glow: 0 },
  rat: { shape: ratShape, size: 0.5, lift: 0, glow: 0 },
  slime: { shape: slimeShape, size: 0.7, lift: 0, glow: 0 },
  slimelet: { shape: slimeShape, size: 0.42, lift: 0, glow: 0 },
  skeleton: { shape: skeletonShape, size: 0.86, lift: 0, glow: 0 },
  brute: { shape: bruteShape, size: 0.96, lift: 0, glow: 0 }
}

// ---------- rendering ----------
function monK() {
  return anim && anim.mon ? ease(anim.t / anim.dur) : 1
}

let canvasFailures = 0
function render() {
  const t0 = now()
  let rects = 0
  try {
    cv.clear({ x: 0, y: 0, w: W, h: VH })
    const dirX = Math.cos(cam.a)
    const dirY = Math.sin(cam.a)
    const plX = -dirY * FOV_PLANE
    const plY = dirX * FOV_PLANE
    const cols = Math.ceil(W / colW)
    const px = cam.x
    const py = cam.y

    let runX = 0
    let runTop = -1
    let runBot = -1
    let runColor = -1
    const flush = (endX) => {
      if (runColor >= 0 && runBot > runTop) {
        cv.drawRect({ x1: runX, y1: runTop, x2: endX - 1, y2: runBot, color: runColor })
        rects++
      }
    }

    for (let c = 0; c < cols; c++) {
      const sx = c * colW
      const camX = (2 * (sx + colW / 2)) / W - 1
      const rdx = dirX + plX * camX
      const rdy = dirY + plY * camX
      let mx = Math.floor(px)
      let my = Math.floor(py)
      const ddx = rdx === 0 ? 1e9 : Math.abs(1 / rdx)
      const ddy = rdy === 0 ? 1e9 : Math.abs(1 / rdy)
      const stepX = rdx < 0 ? -1 : 1
      const stepY = rdy < 0 ? -1 : 1
      let sdx = rdx < 0 ? (px - mx) * ddx : (mx + 1 - px) * ddx
      let sdy = rdy < 0 ? (py - my) * ddy : (my + 1 - py) * ddy
      let side = 0
      let hit = '#'
      let n = 0
      for (; n < MAX_DEPTH; n++) {
        if (sdx < sdy) {
          sdx += ddx
          mx += stepX
          side = 0
        } else {
          sdy += ddy
          my += stepY
          side = 1
        }
        const ch = cell(mx, my)
        if (mx >= 0 && my >= 0 && mx < MW && my < MH && !seen[my][mx]) {
          seen[my][mx] = true
          mapDirty = true
        }
        if (solid(ch)) {
          hit = ch
          break
        }
        // the light only reaches so far: stop marking the map in the dark
        if (fogLevel(side === 0 ? sdx - ddx : sdy - ddy) === 0) {
          n = MAX_DEPTH
          break
        }
      }
      let dist = side === 0 ? sdx - ddx : sdy - ddy
      if (n >= MAX_DEPTH) dist = 1e9
      if (dist < 0.05) dist = 0.05
      zbuf[c] = dist

      let top = 0
      let bot = 0
      let color = -1
      const level = fogLevel(dist)
      if (level > 0) {
        const h = VH / dist
        top = Math.max(0, Math.round(HOR - h / 2))
        bot = Math.min(VH, Math.round(HOR + h / 2))
        let wx = side === 0 ? py + dist * rdy : px + dist * rdx
        wx -= Math.floor(wx)
        let base
        if (hit === 'D') {
          const plank = (wx * 4) % 1
          base = wx < 0.06 || wx > 0.94 || plank < 0.08 ? WOOD_SEAM[side] : WOOD[side]
          if (wx > 0.7 && wx < 0.8) base = side ? 0xb08a20 : 0xd4a82a
        } else if (hit === 'G') {
          base = (wx * 6) % 1 < 0.4 ? IRON_BAR[side] : IRON[side]
        } else if (hit === 'C') {
          // cracked: a little browner, with a jagged dark crack
          base = Math.abs(wx - 0.32) < 0.03 || Math.abs(wx - 0.64) < 0.025 || wx < 0.05 || wx > 0.95 ? STONE_SEAM[side] : CRACK[side]
        } else {
          base = wx < 0.05 || wx > 0.95 || Math.abs(wx - 0.5) < 0.025 ? STONE_SEAM[side] : STONE[side]
        }
        color = shade(base, level)
      }
      if (color !== runColor || top !== runTop || bot !== runBot) {
        flush(sx)
        runX = sx
        runTop = top
        runBot = bot
        runColor = color
      }
    }
    flush(Math.min(W, cols * colW))

    rects += drawSprites(dirX, dirY, plX, plY, cols)
    canvasFailures = 0
  } catch (e) {
    canvasFailures++
    if (canvasFailures === 1 || canvasFailures % 50 === 0) console.log('DEPTH CRAWL canvas error: ' + e)
  }
  const ms = now() - t0
  perf.avg = perf.frames ? perf.avg * 0.8 + ms * 0.2 : ms
  perf.frames++
  perf.rects = rects
}

function drawSprites(dirX, dirY, plX, plY, cols) {
  let rects = 0
  const plane2 = plX * plX + plY * plY
  const list = []
  const k = monK()
  const add = (obj, x, y, def) => {
    const rx = x - cam.x
    const ry = y - cam.y
    const depth = rx * dirX + ry * dirY
    if (depth < 0.25) return
    const camX = (rx * plX + ry * plY) / (depth * plane2)
    if (camX < -2 || camX > 2) return
    list.push({ obj, def, depth, sx: ((camX + 1) / 2) * W })
  }
  for (let i = 0; i < items.length; i++) add(items[i], items[i].x + 0.5, items[i].y + 0.5, SPRITES[items[i].k])
  for (let i = 0; i < mons.length; i++) {
    const m = mons[i]
    add(m, m.fx + (m.x - m.fx) * k + 0.5, m.fy + (m.y - m.fy) * k + 0.5, SPRITES[m.t])
  }
  list.sort((a, b) => b.depth - a.depth)

  for (let i = 0; i < list.length; i++) {
    const it = list[i]
    const def = it.def
    const unit = VH / it.depth
    const size = unit * def.size
    const floorY = HOR + unit / 2
    const top = floorY - size - unit * def.lift
    const left = it.sx - size / 2
    const level = Math.max(fogLevel(it.depth), Math.round(def.glow * FOG_LEVELS * (fogC > 1 ? 0.5 : 1)))
    if (level <= 0) continue
    const o = it.obj
    const flash = o.flash > 0
    const wind = o.wind > 0
    const c0 = Math.max(0, Math.floor(left / colW))
    const c1 = Math.min(cols - 1, Math.floor((left + size) / colW))
    let open = {}
    for (let c = c0; c <= c1 + 1; c++) {
      const cur = {}
      if (c <= c1 && it.depth < zbuf[c]) {
        const u = (c * colW + colW / 2 - left) / size
        if (u >= 0 && u < 1) {
          const parts = def.shape(u, o)
          for (let p = 0; p < parts.length; p++) {
            const y1 = Math.max(0, Math.round(top + parts[p][0] * size))
            const y2 = Math.min(VH, Math.round(top + parts[p][1] * size))
            if (y2 <= y1) continue
            let col = parts[p][2]
            if (flash) col = WHITE
            else if (wind) col = mix(col, 0xff2020, 0.35)
            col = shade(col, flash ? FOG_LEVELS : level)
            cur[y1 + ':' + y2 + ':' + col] = { y1, y2, col }
          }
        }
      }
      for (const key in open) {
        if (!cur[key]) {
          const r = open[key]
          cv.drawRect({ x1: r.x0, y1: r.y1, x2: c * colW - 1, y2: r.y2, color: r.col })
          rects++
          delete open[key]
        }
      }
      for (const key in cur) if (!open[key]) open[key] = { x0: c * colW, y1: cur[key].y1, y2: cur[key].y2, col: cur[key].col }
    }
  }
  return rects
}

// ---------- automap (its own small canvas, redrawn only when something new is seen) ----------
const MAP_CELL = 4
let mapX0 = 0
let mapY0 = 0

function cellColor(x, y) {
  const c = map[y][x]
  if (c === '#' || c === 'C') return 0x5a5146
  if (c === 'D') return 0x8c5a2e
  if (c === 'G') return 0x7a808a
  const it = itemAt(x, y)
  if (it) {
    if (it.k === 'key') return GOLD
    if (it.k === 'exit') return CYAN
    if (it.k === 'chest') return 0xb08a40
    if (it.k === 'spikes') return 0x6a6e76
  }
  return 0x2a251f
}

function drawAutomap() {
  mapDirty = false
  try {
    mapCv.clear({ x: 0, y: 0, w: MW * MAP_CELL, h: MH * MAP_CELL })
    for (let y = 0; y < MH; y++) {
      let x0 = -1
      let col = -1
      for (let x = 0; x <= MW; x++) {
        const c = x < MW && seen[y][x] ? cellColor(x, y) : -1
        if (c !== col) {
          if (col >= 0) mapCv.drawRect({ x1: x0 * MAP_CELL, y1: y * MAP_CELL, x2: x * MAP_CELL - 1, y2: y * MAP_CELL + MAP_CELL - 1, color: col })
          x0 = x
          col = c
        }
      }
    }
  } catch (e) {
    console.log('DEPTH CRAWL automap error: ' + e)
  }
}

function updateMarker() {
  const x = mapX0 + P.x * MAP_CELL
  const y = mapY0 + P.y * MAP_CELL
  setMore(ui.me, { x: x - 1, y: y - 1, w: MAP_CELL + 2, h: MAP_CELL + 2, radius: 1, color: RED })
  setMore(ui.pip, { x: x + DX[P.face] * 4 + 1, y: y + DY[P.face] * 4 + 1, w: 2, h: 2, radius: 0, color: WHITE })
}

// ---------- light ----------
function updateLight() {
  if (!run) return
  const frac = run.torch / run.torchMax
  fogC = run.torch <= 0 ? 2.2 : 0.14 + 0.6 * (1 - frac) * (1 - frac)
  const bright = run.torch <= 0 ? 0.15 : 0.35 + 0.65 * frac
  const bucket = Math.round(bright * 8)
  if (bucket === lightBucket) return
  lightBucket = bucket
  dirty = true
  const k = bucket / 8
  for (let i = 0; i < ui.ceil.length; i++) setColor(ui.ceil[i], scale(0x3a3128, Math.pow(1 - i / ui.ceil.length, 1.8) * k))
  for (let i = 0; i < ui.floor.length; i++) setColor(ui.floor[i], scale(0x4a3e30, Math.pow((i + 1) / ui.floor.length, 1.8) * k))
}

// ---------- HUD ----------
function updateHud() {
  if (!run) return
  const hpFrac = run.hp / run.maxHp
  setBar(ui.hp, ui.hpBox[0], ui.hpBox[1], ui.hpBox[2], ui.hpBox[3], hpFrac, hpFrac > 0.5 ? GREEN : hpFrac > 0.25 ? GOLD : RED)
  setBar(ui.torch, ui.torchBox[0], ui.torchBox[1], ui.torchBox[2], ui.torchBox[3], run.torch / run.torchMax, run.torch > 0 ? ORANGE : RED)
  setText(ui.hpText, run.hp + '/' + run.maxHp)
  setText(ui.torchText, run.torch > 0 ? 'torch ' + Math.ceil((run.torch / run.torchMax) * 100) + '%' : 'DARK')
  setText(ui.info, (run.daily ? 'DAILY  ' : '') + 'FLOOR ' + run.depth + '  ·  ' + run.gold + ' gold')
  setText(ui.potText, 'POTION x' + run.potions)
  setColor(ui.potText, run.potions > 0 ? WHITE : DIM)
  setColor(ui.potBtn, run.potions > 0 ? 0x5a1c1c : PANEL)
  setText(ui.keyText, run.key ? 'KEY' : 'no key')
  setColor(ui.keyText, run.key ? GOLD : DIM)
  setColor(ui.keyBtn, run.key ? 0x4a3c10 : PANEL)
}

function updateFoe() {
  if (!run) return
  const m = monAt(P.x + DX[P.face], P.y + DY[P.face])
  if (!m) {
    setVisible(ui.foe, false)
    return
  }
  setText(ui.foe, MONS[m.t].name + '  ' + Math.max(0, m.hp) + '/' + m.max + (m.wind ? '  !' : ''))
  setColor(ui.foe, m.wind ? RED : WHITE)
  setVisible(ui.foe, true)
}

function say(text, color, seconds) {
  setText(ui.msg, text)
  setColor(ui.msg, color || WHITE)
  setVisible(ui.msg, true)
  msgUntil = now() + (seconds || 1.6) * 1000
}

function floater(text, color) {
  setText(ui.float, text)
  setColor(ui.float, color)
  setVisible(ui.float, true)
  floatUntil = now() + 700
}

function flashRed() {
  ui.flash.forEach((o) => setVisible(o, true))
  flashUntil = now() + 220
}

// ---------- the timing ring ----------
function ringWindow() {
  return RING_WINDOW + run.luck * 0.03
}

function hideRings() {
  if (!ui.ringT) return
  setVisible(ui.ringT, false)
  setVisible(ui.ringM, false)
}

function placeRing(o, r, color, lw) {
  const cx = Math.round(W / 2)
  const cy = Math.round(VY + HOR)
  r = Math.max(2, Math.round(r))
  setMore(o, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, radius: r, line_width: lw, color })
}

function startRing(mode, m) {
  phase = 'ring'
  ring = { mode, m, t: 0 }
  const color = mode === 'strike' ? GOLD : RED
  placeRing(ui.ringT, RING_RT, mode === 'strike' ? 0x806a20 : 0x802020, 4)
  placeRing(ui.ringM, RING_R0, color, 4)
  setVisible(ui.ringT, true)
  setVisible(ui.ringM, true)
  if (mode === 'parry') say(MONS[m.t].name + ' swings! TAP to block', RED, 1)
}

function updateRing(dt) {
  ring.t += dt
  const r = RING_RT + (RING_R0 - RING_RT) * (1 - ring.t / RING_MEET)
  const good = Math.abs(ring.t - RING_MEET) <= ringWindow()
  placeRing(ui.ringM, r, good ? WHITE : ring.mode === 'strike' ? GOLD : RED, good ? 6 : 4)
  if (ring.t >= RING_END) resolveRing(false)
}

function resolveRing(tapped) {
  if (!ring) return
  const r = ring
  ring = null
  hideRings()
  const perfect = tapped && Math.abs(r.t - RING_MEET) <= ringWindow()
  if (r.mode === 'strike') {
    const m = r.m
    let dmg = run.atk + (Math.random() < 0.5 ? 1 : 0)
    if (perfect) {
      dmg *= 2
      floater('CRIT ' + dmg, GOLD)
      buzz('mid')
      m.wind = 0 // a critical hit interrupts a wind-up
    } else floater('-' + dmg, WHITE)
    m.hp -= dmg
    m.flash = 0.14
    m.awake = true
    if (m.hp <= 0) kill(m)
    takeTurn()
    startAnim({ kind: 'bump', dur: BUMP_TIME, dx: DX[P.face], dy: DY[P.face], mon: true })
  } else {
    const m = r.m
    if (perfect) {
      floater('BLOCKED!', CYAN)
      buzz('light')
    } else hurt(MONS[m.t].dmg + Math.floor((run.depth - 1) / 3))
    m.wind = 0
    updateHud()
    nextStep()
  }
}

// ---------- combat and turns ----------
function hurt(d) {
  d = Math.max(1, d - run.armor)
  run.hp -= d
  floater('-' + d, RED)
  flashRed()
  buzz('strong')
  if (run.hp <= 0) {
    run.hp = 0
    run.dead = true
  }
  updateHud()
}

function kill(m) {
  const def = MONS[m.t]
  mons = mons.filter((o) => o !== m)
  run.kills++
  if (run.vamp) run.hp = Math.min(run.maxHp, run.hp + 2 * run.vamp)
  say(def.name + ' defeated', GREEN, 1.2)
  if (def.splits) {
    let n = 0
    for (let k = 0; k < 4 && n < 2; k++) {
      const nx = m.x + DX[k]
      const ny = m.y + DY[k]
      if (solid(cell(nx, ny)) || monAt(nx, ny) || (nx === P.x && ny === P.y) || solidItem(itemAt(nx, ny))) continue
      const s = makeMon('slimelet', nx, ny, run.depth)
      s.fx = m.x
      s.fy = m.y
      s.awake = true
      mons.push(s)
      n++
    }
    if (n) say('The slime splits!', GREEN, 1.2)
  } else if (Math.random() < 0.35 && !itemAt(m.x, m.y)) {
    items.push({ k: 'gold', x: m.x, y: m.y, n: 2 + run.depth + Math.floor(Math.random() * 4) })
  }
  updateHud()
}

// path distance from the player over tiles monsters can walk on
function distMap() {
  const d = []
  for (let y = 0; y < MH; y++) d.push(new Array(MW).fill(-1))
  d[P.y][P.x] = 0
  const q = [P.x, P.y]
  for (let i = 0; i < q.length; i += 2) {
    const x = q[i]
    const y = q[i + 1]
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k]
      const ny = y + DY[k]
      if (d[ny] === undefined || d[ny][nx] === undefined || d[ny][nx] >= 0) continue
      if (solid(cell(nx, ny))) continue
      const it = itemAt(nx, ny)
      if (solidItem(it) || (it && it.k === 'spikes')) continue
      d[ny][nx] = d[y][x] + 1
      q.push(nx, ny)
    }
  }
  return d
}

function canSee(m) {
  const rx = m.x - P.x
  const ry = m.y - P.y
  const fwd = rx * DX[P.face] + ry * DY[P.face]
  const side = Math.abs(rx * -DY[P.face] + ry * DX[P.face])
  if (fwd <= 0 || side > fwd * FOV_PLANE + 0.5) return false
  const n = Math.ceil(Math.hypot(rx, ry) * 4)
  for (let i = 1; i < n; i++) {
    const x = Math.floor(P.x + 0.5 + (rx * i) / n)
    const y = Math.floor(P.y + 0.5 + (ry * i) / n)
    if (solid(cell(x, y))) return false
  }
  return fogLevel(fwd) > 1
}

// everything that happens after the player used a turn
function takeTurn() {
  run.turn++
  for (let i = 0; i < mons.length; i++) {
    mons[i].fx = mons[i].x
    mons[i].fy = mons[i].y
  }
  if (run.torch > 0) {
    run.torch--
    if (run.torch === 0) say('Your torch dies out...', RED, 2)
    else if (run.torch === 20) say('Your torch is flickering', ORANGE, 1.6)
  }
  const d = distMap()
  const passes = run.torch <= 0 ? 2 : 1
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < mons.length; i++) monsterAct(mons[i], d, pass)
  }
  // spikes rise every other turn
  const sp = itemAt(P.x, P.y)
  if (sp && sp.k === 'spikes' && spikesUp() && !run.dead) {
    say('Spikes!', RED, 1)
    hurt(2 + Math.floor(run.depth / 3))
  }
  // heartbeat: something close that you cannot see
  let near = false
  for (let i = 0; i < mons.length; i++) {
    const m = mons[i]
    const md = d[m.y][m.x]
    if (m.awake && Math.abs(m.x - P.x) + Math.abs(m.y - P.y) <= 3 && (md < 0 || md <= 4) && !canSee(m)) near = true
  }
  if (near && run.turn - run.beatTurn >= 2 && !run.dead) {
    run.beatTurn = run.turn
    heartbeat()
  }
  if (run.turn % 10 === 0) {
    pollSteps()
    saveRun()
  }
  updateLight()
  updateHud()
}

function monsterAct(m, d, pass) {
  const def = MONS[m.t]
  const md = d[m.y][m.x]
  if (!m.awake) {
    if (md >= 0 && md <= AWAKE_RANGE) m.awake = true
    else return
  }
  const adjacent = Math.abs(m.x - P.x) + Math.abs(m.y - P.y) === 1
  if (adjacent) {
    if (def.heavy) {
      if (m.wind) {
        if (pending.indexOf(m) < 0) pending.push(m)
      } else {
        m.wind = 1
        say(def.name + ' raises its weapon!', RED, 1.2)
      }
    } else if (!run.dead) {
      hurt(def.dmg + Math.floor((run.depth - 1) / 3))
    }
    return
  }
  m.wind = 0
  m.tick++
  if (def.every === 2 && m.tick % 2 === 1 && pass === 0) return
  if (md <= 0) return
  let best = null
  let bestD = md
  for (let k = 0; k < 4; k++) {
    const nx = m.x + DX[k]
    const ny = m.y + DY[k]
    const nd = d[ny] ? d[ny][nx] : -1
    if (nd < 0 || nd >= bestD) continue
    if (monAt(nx, ny) || (nx === P.x && ny === P.y)) continue
    best = [nx, ny]
    bestD = nd
  }
  if (best) {
    m.x = best[0]
    m.y = best[1]
  }
}

function startAnim(a) {
  a.t = 0
  anim = a
  phase = 'anim'
  dirty = true
}

function nextStep() {
  if (run.dead) {
    phase = 'idle'
    queued = null
    die()
    return
  }
  if (pending.length) {
    startRing('parry', pending.shift())
    return
  }
  phase = 'idle'
  updateFoe()
  if (queued) {
    const q = queued
    queued = null
    act(q)
  }
}

function act(action) {
  if (screen !== 'play' || !run) return
  if (phase === 'anim') {
    queued = action
    return
  }
  if (phase !== 'idle') return
  setVisible(ui.hint, false)
  const fromA = P.face * (Math.PI / 2)

  if (action === 'left' || action === 'right') {
    const d = action === 'left' ? -1 : 1
    P.face = (P.face + d + 4) % 4
    startAnim({ kind: 'turn', dur: TURN_TIME, a0: fromA, a1: fromA + d * (Math.PI / 2) })
    return
  }

  if (action === 'potion') {
    if (run.potions <= 0) {
      say('No potions', DIM, 1)
      return
    }
    if (run.hp >= run.maxHp) {
      say('Already at full health', DIM, 1)
      return
    }
    run.potions--
    const heal = Math.max(8, Math.round(run.maxHp * 0.4))
    run.hp = Math.min(run.maxHp, run.hp + heal)
    floater('+' + heal, GREEN)
    buzz('light')
    takeTurn()
    startAnim({ kind: 'wait', dur: WAIT_TIME, mon: true })
    return
  }

  const back = action === 'back'
  const dx = back ? -DX[P.face] : DX[P.face]
  const dy = back ? -DY[P.face] : DY[P.face]
  const nx = P.x + dx
  const ny = P.y + dy
  const target = cell(nx, ny)
  const m = monAt(nx, ny)
  const it = itemAt(nx, ny)

  if (m) {
    if (back) {
      bump(dx, dy)
      return
    }
    startRing('strike', m)
    return
  }
  if (!back) {
    if (target === 'D') {
      if (run.key) {
        map[ny][nx] = '.'
        mapDirty = true
        say('The door creaks open', GOLD)
        buzz('mid')
        return turnPassed()
      }
      say('Locked. Find the key.', RED)
    } else if (target === 'C') {
      map[ny][nx] = '.'
      mapDirty = true
      say('The cracked wall crumbles!', GOLD)
      buzz('mid')
      return turnPassed()
    } else if (target === 'G') {
      say('Iron bars. A lever opens them.', DIM)
    } else if (it && it.k === 'lever') {
      if (!it.on) {
        it.on = true
        for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (map[y][x] === 'G') map[y][x] = '.'
        mapDirty = true
        say('Somewhere, a gate grinds open', GOLD, 2)
        buzz('mid')
        return turnPassed()
      }
      say('The lever is already pulled', DIM, 1)
    } else if (it && it.k === 'chest') {
      items = items.filter((o) => o !== it)
      mapDirty = true
      buzz('mid')
      dirty = true
      showBoons(true)
      return
    }
  }
  if (solid(target) || solidItem(it)) {
    bump(dx, dy)
    return
  }
  P.x = nx
  P.y = ny
  run.steps++
  takeTurn()
  startAnim({ kind: 'step', dur: STEP_TIME, x0: nx - dx, y0: ny - dy, dx, dy, mon: true, arrive: true })
}

function turnPassed() {
  takeTurn()
  startAnim({ kind: 'wait', dur: WAIT_TIME, mon: true })
}

function bump(dx, dy) {
  buzz('light')
  startAnim({ kind: 'bump', dur: BUMP_TIME, dx: dx * 0.6, dy: dy * 0.6 })
}

function arrive() {
  const it = itemAt(P.x, P.y)
  if (!it) return
  if (it.k === 'key') {
    run.key = true
    say('You found the key!', GOLD)
    buzz('mid')
  } else if (it.k === 'gold') {
    run.gold += it.n
    floater('+' + it.n + ' gold', GOLD)
  } else if (it.k === 'potion') {
    run.potions++
    say('Healing potion', RED, 1.2)
  } else if (it.k === 'oil') {
    const before = run.torch
    run.torch = Math.min(run.torchMax, run.torch + 50)
    say('Oil: torch +' + (run.torch - before), ORANGE, 1.2)
    updateLight()
  } else if (it.k === 'exit') {
    floorCleared()
    return
  } else return
  items = items.filter((o) => o !== it)
  mapDirty = true
  dirty = true
  updateHud()
}

function updateAnim(dt) {
  anim.t += dt
  const k = ease(anim.t / anim.dur)
  if (anim.kind === 'turn') {
    cam.a = anim.a0 + (anim.a1 - anim.a0) * k
  } else if (anim.kind === 'step') {
    cam.x = anim.x0 + 0.5 + anim.dx * k
    cam.y = anim.y0 + 0.5 + anim.dy * k
  } else if (anim.kind === 'bump') {
    const b = Math.sin(Math.PI * clamp(anim.t / anim.dur, 0, 1)) * 0.22
    cam.x = P.x + 0.5 + anim.dx * b
    cam.y = P.y + 0.5 + anim.dy * b
  }
  dirty = true
  if (anim.t < anim.dur) return
  const a = anim
  anim = null
  cam.x = P.x + 0.5
  cam.y = P.y + 0.5
  cam.a = P.face * (Math.PI / 2)
  for (let i = 0; i < mons.length; i++) {
    mons[i].fx = mons[i].x
    mons[i].fy = mons[i].y
  }
  updateMarker()
  if (a.arrive && !run.dead) {
    arrive()
    if (screen !== 'play') return
  }
  nextStep()
}

// ---------- between floors ----------
function floorCleared() {
  pending = []
  queued = null
  run.depth++
  buzz('mid')
  showBoons(false)
}

function rollBoons() {
  const okList = BOONS.filter((b) => b.ok(run))
  const out = []
  while (out.length < 3 && okList.length) out.push(okList.splice(Math.floor(Math.random() * okList.length), 1)[0])
  return out
}

function showBoons(fromChest) {
  boonFromChest = fromChest
  boonChoices = rollBoons()
  showBoonOverlay()
}

function showBoonOverlay() {
  const title = boonFromChest ? 'TREASURE!' : 'FLOOR ' + (run.depth - 1) + ' CLEARED'
  const btns = boonChoices.map((b) => ({ label: b.name, desc: b.desc, fn: () => pickBoon(b) }))
  const foot = run.gold >= 10 ? 'Reroll for 10 gold  (' + run.gold + ')' : run.gold + ' gold'
  showOverlay('boon', {
    title,
    color: boonFromChest ? GOLD : CYAN,
    sub: 'Choose a boon  ·  HP ' + run.hp + '/' + run.maxHp,
    subBox: [40, 70, W - 80, 30],
    buttons: btns,
    btnY: 112,
    btnH: 64,
    gap: 74,
    foot,
    footFn: run.gold >= 10 ? rerollBoons : null
  })
}

function rerollBoons() {
  run.gold -= 10
  boonChoices = rollBoons()
  showBoonOverlay()
}

function pickBoon(b) {
  b.apply(run)
  if (boonFromChest) {
    setScreen('play')
    updateLight()
    updateHud()
    say(b.name + '!', GOLD, 1.4)
    saveRun()
  } else {
    enterFloor()
  }
}

function die() {
  const depth = run.depth
  if (depth > meta.best) meta.best = depth
  if (run.gold > meta.bestGold) meta.bestGold = run.gold
  if (run.daily) {
    if (meta.daily.day !== run.day) meta.daily = { day: run.day, best: 0 }
    if (depth > meta.daily.best) meta.daily.best = depth
  }
  saveMeta()
  saveRun() // clears the saved run
  buzz('strong')
  const wasDaily = run.daily
  showOverlay('dead', {
    title: 'YOU DIED',
    color: RED,
    sub: 'Floor ' + depth + '  ·  ' + run.kills + ' kills  ·  ' + run.gold + ' gold\nBest: floor ' + meta.best,
    subBox: [40, 92, W - 80, 70],
    buttons: [
      { label: wasDaily ? 'DAILY AGAIN' : 'NEW RUN', fn: () => newRun(wasDaily), hi: true },
      { label: 'MENU', fn: showMenu }
    ],
    btnY: 200,
    btnH: 52,
    gap: 64
  })
}

// ---------- overlays (menu, how to play, boons, death, pause) ----------
function showOverlay(name, o) {
  screen = name
  phase = 'idle'
  hideRings()
  setVisible(ui.hint, false)
  const ov = ui.ov
  setVisible(ov.cover, true)
  setText(ov.title, o.title)
  setColor(ov.title, o.color || GOLD)
  setVisible(ov.title, true)
  setMore(ov.sub, { x: o.subBox[0], y: o.subBox[1], w: o.subBox[2], h: o.subBox[3] })
  setText(ov.sub, o.sub || '')
  setColor(ov.sub, o.subColor || WHITE)
  setVisible(ov.sub, !!o.sub)
  overlayActions = []
  ov.btns.forEach((b, i) => {
    const d = o.buttons[i]
    const on = !!d
    ;[b.edge, b.fill, b.label, b.desc].forEach((x) => setVisible(x, on))
    if (!on) return
    const bw = o.btnW || 290
    const x = Math.round(W / 2 - bw / 2)
    const y = o.btnY + i * o.gap
    const h = o.btnH
    setMore(b.edge, { x, y, w: bw, h, radius: 14, color: d.hi ? GOLD : EDGE })
    setMore(b.fill, { x: x + 2, y: y + 2, w: bw - 4, h: h - 4, radius: 12, color: d.hi ? PANEL_ON : PANEL })
    if (d.desc) {
      setMore(b.label, { x: x + 8, y: y + 6, w: bw - 16, h: 26 })
      setMore(b.desc, { x: x + 8, y: y + 32, w: bw - 16, h: 24 })
      setText(b.desc, d.desc)
      setVisible(b.desc, true)
    } else {
      setMore(b.label, { x: x + 8, y, w: bw - 16, h })
      setVisible(b.desc, false)
    }
    setText(b.label, d.label)
    setColor(b.label, d.hi ? GOLD : WHITE)
    overlayActions.push({ box: [x, y, bw, h], fn: d.fn })
  })
  setText(ov.foot, o.foot || '')
  setVisible(ov.foot, !!o.foot)
  if (o.foot && o.footFn) overlayActions.push({ box: [W / 2 - 130, ui.footY - 6, 260, 40], fn: o.footFn })
}

function hideOverlay() {
  const ov = ui.ov
  ;[ov.cover, ov.title, ov.sub, ov.foot].forEach((x) => setVisible(x, false))
  ov.btns.forEach((b) => [b.edge, b.fill, b.label, b.desc].forEach((x) => setVisible(x, false)))
  overlayActions = []
}

function setScreen(name) {
  if (name === 'play') {
    hideOverlay()
    screen = 'play'
    phase = 'idle'
    dirty = true
    updateMarker()
    return
  }
}

function showMenu() {
  run = null
  const today = dayKey()
  const dailyBest = meta.daily.day === today ? meta.daily.best : 0
  const btns = []
  if (hasSavedRun()) btns.push({ label: 'CONTINUE', fn: () => loadRun() || showMenu(), hi: true })
  btns.push({ label: 'NEW RUN', fn: () => newRun(false), hi: btns.length === 0 })
  btns.push({ label: 'DAILY DUNGEON', fn: () => newRun(true) })
  btns.push({ label: 'HOW TO PLAY', fn: () => showHowto(0) })
  showOverlay('menu', {
    title: 'DEPTH CRAWL',
    color: GOLD,
    sub: 'Best: floor ' + meta.best + (dailyBest ? '   ·   Today: floor ' + dailyBest : ''),
    subColor: DIM,
    subBox: [40, 84, W - 80, 28],
    buttons: btns,
    btnY: 128,
    btnH: 50,
    gap: 60,
    foot: 'Detail ' + colW + 'px' + (perf.frames ? '  ·  ' + Math.round(perf.avg) + ' ms' : '') + '  (tap)',
    footFn: cycleDetail
  })
}

function cycleDetail() {
  meta.col = (meta.col + 1) % COL_WIDTHS.length
  colW = COL_WIDTHS[meta.col]
  perf.frames = 0
  saveMeta()
  showMenu()
}

function showHowto(page) {
  howPage = page
  const last = page === HOWTO.length - 1
  showOverlay('howto', {
    title: HOWTO[page][0],
    color: GOLD,
    sub: HOWTO[page][1],
    subBox: [44, 78, W - 88, 280],
    buttons: [{ label: last ? 'BACK' : 'NEXT  ' + (page + 1) + '/' + HOWTO.length, fn: () => (last ? showMenu() : showHowto(page + 1)), hi: true }],
    btnY: 368,
    btnH: 44,
    gap: 0,
    btnW: 200
  })
}

function showPause() {
  saveRun()
  showOverlay('pause', {
    title: 'PAUSED',
    color: GOLD,
    sub: 'Floor ' + run.depth + '  ·  ' + run.kills + ' kills  ·  ' + run.gold + ' gold\nAttack ' + run.atk + '  ·  Armor ' + run.armor + '  ·  Torch ' + run.torch + '/' + run.torchMax,
    subBox: [40, 84, W - 80, 60],
    buttons: [
      { label: 'RESUME', fn: () => setScreen('play'), hi: true },
      { label: 'SAVE & QUIT', fn: showMenu }
    ],
    btnY: 170,
    btnH: 52,
    gap: 64
  })
}

// ---------- input ----------
function onSwipe(dir) {
  const t = now()
  if (lastGesture.dir === dir && t - lastGesture.t < 250) return // the same swipe from both sources
  lastGesture = { t, dir }
  if (screen !== 'play') return
  if (phase === 'ring') {
    resolveRing(true)
    return
  }
  if (dir === 'up') act('forward')
  else if (dir === 'down') act('back')
  else act(dir)
}

function onTap(x, y) {
  if (screen !== 'play') {
    for (let i = 0; i < overlayActions.length; i++) {
      if (inBox(x, y, overlayActions[i].box)) {
        overlayActions[i].fn()
        return
      }
    }
    return
  }
  if (y < VY) {
    if (phase === 'idle') showPause()
    return
  }
  if (y >= VY + VH) {
    if (inBox(x, y, ui.potBox)) act('potion')
    return
  }
  if (x < W * 0.3) act('left')
  else if (x > W * 0.7) act('right')
  else if (y < VY + VH / 2) act('forward')
  else act('back')
}

function handleTouch(kind, e) {
  try {
    if (!e || typeof e.x !== 'number' || typeof e.y !== 'number') return
    if (kind === 'down') {
      // timing taps count the moment the finger lands
      if (screen === 'play' && phase === 'ring') {
        resolveRing(true)
        touch = null
        return
      }
      touch = { x: e.x, y: e.y }
      return
    }
    if (!touch) return
    const dx = e.x - touch.x
    const dy = e.y - touch.y
    const t = touch
    touch = null
    if (Math.hypot(dx, dy) >= SWIPE_MIN) {
      if (screen === 'play') onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
    } else onTap(t.x, t.y)
  } catch (err) {
    showError('touch', err)
  }
}

// System swipes: while playing every direction is a move, so swipe right must not close the app.
function onGesture4(ev) {
  const dir = ev === GESTURE_RIGHT ? 'right' : ev === GESTURE_LEFT ? 'left' : ev === GESTURE_UP ? 'up' : ev === GESTURE_DOWN ? 'down' : ''
  if (!dir || screen !== 'play') return false
  onSwipe(dir)
  return true
}

// ---------- building the screen ----------
function buildScreen() {
  mkRect(0, 0, W, H, BG, 0)

  // ceiling and floor bands behind the 3D view (recoloured with the torch)
  const bands = 9
  ui.ceil = []
  ui.floor = []
  for (let i = 0; i < bands; i++) {
    const y0 = Math.round((HOR * i) / bands)
    const y1 = Math.round((HOR * (i + 1)) / bands)
    ui.ceil.push(mkRect(0, VY + y0, W, y1 - y0, 0x000000, 0))
  }
  const floorH = VH - HOR
  for (let i = 0; i < bands; i++) {
    const y0 = Math.round((floorH * i) / bands)
    const y1 = Math.round((floorH * (i + 1)) / bands)
    ui.floor.push(mkRect(0, VY + HOR + y0, W, y1 - y0, 0x000000, 0))
  }

  cv = createWidget(widget.CANVAS, { x: 0, y: VY, w: W, h: VH })

  // red border flash when hurt
  ui.flash = [mkRect(0, VY, W, 6, RED, 0), mkRect(0, VY + VH - 6, W, 6, RED, 0), mkRect(0, VY, 6, VH, RED, 0), mkRect(W - 6, VY, 6, VH, RED, 0)]
  ui.flash.forEach((o) => setVisible(o, false))

  // top: HP and torch bars, floor and gold
  const bw = 110
  ui.hpBox = [Math.round(W / 2 - bw - 8), 12, bw, 14]
  ui.torchBox = [Math.round(W / 2 + 8), 12, bw, 14]
  mkRect(ui.hpBox[0], ui.hpBox[1], bw, 14, BAR_BACK, 7)
  mkRect(ui.torchBox[0], ui.torchBox[1], bw, 14, BAR_BACK, 7)
  ui.hp = mkRect(ui.hpBox[0], ui.hpBox[1], bw, 14, GREEN, 7)
  ui.torch = mkRect(ui.torchBox[0], ui.torchBox[1], bw, 14, ORANGE, 7)
  ui.hpText = mkText(ui.hpBox[0], 9, bw, 20, 13, WHITE)
  ui.torchText = mkText(ui.torchBox[0], 9, bw, 20, 13, WHITE)
  ui.info = mkText(W / 2 - 140, 30, 280, 22, 15, DIM)

  // bottom: potion, automap, key
  const mapW = MW * MAP_CELL
  const mapH = MH * MAP_CELL
  mapX0 = Math.round(W / 2 - mapW / 2)
  mapY0 = VY + VH + 8
  mkRect(mapX0 - 3, mapY0 - 3, mapW + 6, mapH + 6, 0x0c0a08, 4)
  mapCv = createWidget(widget.CANVAS, { x: mapX0, y: mapY0, w: mapW, h: mapH })
  ui.me = mkRect(0, 0, MAP_CELL, MAP_CELL, RED, 1)
  ui.pip = mkRect(0, 0, 2, 2, WHITE, 0)

  ui.potBox = [mapX0 - 98, mapY0 + 4, 88, 44]
  ui.potBtn = mkRect(ui.potBox[0], ui.potBox[1], ui.potBox[2], ui.potBox[3], PANEL, 12)
  ui.potText = mkText(ui.potBox[0], ui.potBox[1], ui.potBox[2], ui.potBox[3], 14, WHITE)
  ui.keyBtn = mkRect(mapX0 + mapW + 10, mapY0 + 4, 88, 44, PANEL, 12)
  ui.keyText = mkText(mapX0 + mapW + 10, mapY0 + 4, 88, 44, 14, DIM)

  // view texts: foe readout, messages, damage numbers, first-floor hint
  ui.foe = mkText(40, VY + 6, W - 80, 24, 16, WHITE)
  setVisible(ui.foe, false)
  ui.msg = mkText(20, VY + 32, W - 40, 28, 18, WHITE)
  setVisible(ui.msg, false)
  ui.float = mkText(W / 2 - 100, VY + HOR - 90, 200, 34, 26, WHITE)
  setVisible(ui.float, false)
  ui.hint = mkText(40, VY + VH - 70, W - 80, 60, 15, WHITE, true)
  setText(ui.hint, 'Swipe up to walk, left/right to turn.\nTap the top bars to pause.')
  setVisible(ui.hint, false)

  // the timing rings
  ui.ringT = mkStroke(0, 0, 10, 10, GOLD, 5, 4)
  ui.ringM = mkStroke(0, 0, 10, 10, GOLD, 5, 4)
  hideRings()

  // overlay: one shared set of widgets for every menu screen
  ui.footY = 412
  ui.ov = {
    cover: mkRect(0, 0, W, H, BG, 0),
    title: mkText(30, 40, W - 60, 40, 28, GOLD),
    sub: mkText(40, 84, W - 80, 30, 16, WHITE, true),
    btns: [0, 1, 2, 3].map(() => ({
      edge: mkRect(0, 0, 10, 10, EDGE, 14),
      fill: mkRect(0, 0, 10, 10, PANEL, 12),
      label: mkText(0, 0, 10, 10, 20, WHITE),
      desc: mkText(0, 0, 10, 10, 14, DIM)
    })),
    foot: mkText(W / 2 - 130, ui.footY - 6, 260, 30, 14, DIM)
  }
  hideOverlay()

  // touch layer: an empty full-screen text widget on top of everything
  ui.touch = createWidget(widget.TEXT, { x: 0, y: 0, w: W, h: H, text: '', text_size: 10, color: BG })
  ui.touch.addEventListener(event.CLICK_DOWN, (e) => handleTouch('down', e))
  ui.touch.addEventListener(event.CLICK_UP, (e) => handleTouch('up', e))
}

// ---------- loop ----------
function tick() {
  try {
    const t = now()
    const dt = clamp((t - lastTick) / 1000, 0, 0.1)
    lastTick = t
    if (screen === 'play' && run) {
      if (anim) updateAnim(dt)
      if (ring) updateRing(dt)
      for (let i = 0; i < mons.length; i++) {
        if (mons[i].flash > 0) {
          mons[i].flash -= dt
          dirty = true
        }
      }
      if (dirty && screen === 'play') {
        dirty = false
        render()
      }
      if (mapDirty) drawAutomap()
      if (t - lastStepPoll > 20000) pollSteps()
    }
    if (ui.msg.v && t > msgUntil) setVisible(ui.msg, false)
    if (ui.float.v && t > floatUntil) setVisible(ui.float, false)
    if (ui.flash[0].v && t > flashUntil) ui.flash.forEach((o) => setVisible(o, false))
  } catch (e) {
    showError('tick', e)
  }
}

function showError(where, e) {
  console.log('DEPTH CRAWL error in ' + where + ' (' + step + '): ' + e)
  try {
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
      VY = Math.round(H * 0.125)
      VH = Math.round(H * 0.645)
      HOR = Math.round(VH / 2)

      step = 'setStatusBarVisible'
      try {
        setStatusBarVisible(false)
      } catch (e) {
        console.log('DEPTH CRAWL could not hide status bar: ' + e)
      }

      step = 'setPageBrightTime'
      setPageBrightTime({ brightTime: 600000 })

      step = 'load'
      storage = new LocalStorage()
      loadMeta()
      pollSteps()

      step = 'build screen'
      buildScreen()
      showMenu()

      step = 'onGesture'
      try {
        onGesture({ callback: onGesture4 })
      } catch (e) {
        console.log('DEPTH CRAWL could not listen for swipes: ' + e)
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
    if (run && !run.dead) saveRun()
    saveMeta()
    resetPageBrightTime()
  }
})
