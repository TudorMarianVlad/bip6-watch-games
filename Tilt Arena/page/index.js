// Tilt Arena — an arena survival game for Zepp OS (API 4.0, built for Amazfit Bip 6)
//
// How it plays:
//   * Steer your hero around the arena. It shoots the nearest monster on its own.
//   * Survive each wave until the timer runs out. Monsters drop gems.
//   * Between waves, spend gems in the shop on upgrades (3 offers, reroll if you like).
//   * Every 5th wave a big boss joins in. Lose all HP and the run is over.
//
// Controls (switch on the menu):
//   * TILT  — tilt your wrist and the hero rolls that way, like a marble.
//             Use CALIBRATE once: hold your wrist comfortably and tap SET LEVEL.
//             If left/right or up/down feel reversed, use the FLIP buttons there.
//   * TOUCH — touch or drag on the screen and the hero walks towards your finger.
//             (Works in the simulator, which can't tilt.)
//   The pill at the bottom (or a swipe right) pauses.
//
// Performance: no canvas at all — everything is a native widget moved with
// setProperty only when it actually moved, and one invisible text layer
// receives every touch.

import { createWidget, widget, event, prop, align, text_style, setStatusBarVisible } from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { setPageBrightTime, resetPageBrightTime } from '@zos/display'
import { onGesture, offGesture, GESTURE_RIGHT } from '@zos/interaction'
import { LocalStorage } from '@zos/storage'
import { Time, Accelerometer, Vibrator, FREQ_MODE_NORMAL } from '@zos/sensor'

// ---------- tuning ----------
const TICK_MS = 66 // about 15 updates per second
const MAX_DT = 0.1
const MARGIN = 18 // keep things this far from the screen edge
const CORNER = 70 // the arena's rounded corners
const MAX_ENEMIES = 16
const MAX_BULLETS = 10
const MAX_ENEMY_SHOTS = 6
const MAX_GEMS = 16
const WAVE_SECONDS = (wave) => Math.min(45, 25 + wave * 3)
// tuned with a simulated player: a simple dodging bot reaches wave 5-8
const SPAWN_EVERY = (wave) => Math.max(0.35, 2.2 - 0.12 * wave)
const ENEMY_HP_SCALE = (wave) => 1 + 0.35 * (wave - 1)
const ENEMY_DMG_SCALE = (wave) => 1 + 0.15 * (wave - 1) // monsters also hit harder each wave
const BOSS_EVERY = 5
const SHOP_LOCK_MS = 1200 // the shop ignores taps this long, so a tap meant for the fight can't buy something

// economy (tuned with a simulated player: about 2 upgrades per wave early, 3-4 later)
const OFFERS = 4 // upgrades offered in the shop each wave
const GEM_GROWTH = 0.12 // gems are worth +12% more each wave
const PRICE_GROWTH = 0.22 // prices rise 22% each wave
const WAVE_BONUS = (wave) => 8 + wave // gems for surviving a wave

// tilt: fraction of gravity (980 cm/s^2) needed for full speed, and the dead zone
const GRAVITY = 980
const TILT_FULL = 0.3 // about 17 degrees
const TILT_DEAD = 0.05

const ENEMY_TYPES = {
  blob: { r: 11, color: 0x6fd36f, hp: 3, speed: 38, dmg: 1, gems: 1, from: 1 },
  dart: { r: 8, color: 0xff9a3d, hp: 2, speed: 72, dmg: 1, gems: 1, from: 2 },
  brute: { r: 16, color: 0xb05cff, hp: 12, speed: 26, dmg: 2, gems: 3, from: 3 },
  spitter: { r: 11, color: 0xff5c8a, hp: 5, speed: 32, dmg: 1, gems: 2, from: 4, keepAway: 120, shootEvery: 2.5 },
  boss: { r: 26, color: 0xffd84d, hp: 50, speed: 22, dmg: 3, gems: 15, from: 999 }
}

// Shop upgrades. cost = base, rising each wave. max = how many times it can be bought.
const UPGRADES = [
  { id: 'dmg', name: 'Sharp Shots', desc: '+1 damage', base: 10, apply: (p) => (p.dmg += 1) },
  { id: 'rate', name: 'Quick Hands', desc: 'shoot 15% faster', base: 12, apply: (p) => (p.fireEvery *= 0.85) },
  { id: 'speed', name: 'Light Boots', desc: '+12% move speed', base: 8, apply: (p) => (p.speed *= 1.12) },
  { id: 'hp', name: 'Big Heart', desc: '+3 max HP, heal 3', base: 10, apply: (p) => { p.maxHp += 3; p.hp = Math.min(p.maxHp, p.hp + 3) } },
  { id: 'multi', name: 'Twin Shot', desc: '+1 bullet per shot', base: 30, max: 3, apply: (p) => (p.multi += 1) },
  { id: 'pierce', name: 'Piercing', desc: 'bullets pass 1 more foe', base: 20, max: 3, apply: (p) => (p.pierce += 1) },
  { id: 'range', name: 'Long Sight', desc: '+25 range', base: 8, apply: (p) => (p.range += 25) },
  { id: 'magnet', name: 'Magnet', desc: '+25 gem pickup radius', base: 6, apply: (p) => (p.magnet += 25) },
  { id: 'crit', name: 'Lucky Eye', desc: '+6% critical hits', base: 12, apply: (p) => (p.crit += 0.06) },
  { id: 'armor', name: 'Plating', desc: 'take 15% less damage', base: 12, max: 5, apply: (p) => (p.armor += 1) },
  { id: 'regen', name: 'Mending', desc: 'heal 1 HP every 5s', base: 14, max: 3, apply: (p) => (p.regen += 1) },
  { id: 'heal', name: 'Potion', desc: 'heal to full now', base: 8, repeat: true, apply: (p) => (p.hp = p.maxHp) }
]

// ---------- colours ----------
const FLOOR = 0x121729
const GRID = 0x1a2140
const PANEL = 0x1c2547
const PANEL_ON = 0x26346a
const EDGE = 0x3a4680
const WHITE = 0xffffff
const DIM = 0x8f9bd6
const LOCKED = 0x3a4166
const GOLD = 0xffd84d
const RED = 0xff5c5c
const GREEN = 0x4dd06a
const CYAN = 0x4de0ff
const GEM = 0x7cf0ff

// ---------- module state ----------
let W, H, CX, CY
let timer = null
let storage = null
let timeSensor = null
let accel = null
let vibrator = null
let screen = 'menu' // menu | game | shop | calibrate
let run = null // the current run
let lastTick = 0
let lastTapAt = 0
let perfText = ''
let touchTarget = null // where the finger is (TOUCH mode)

// saved on the watch
const settings = { mode: 'touch', best: 0, nx: 0, ny: 0, flipX: true, flipY: false, swap: false }

const ui = {}

// ---------- helpers ----------
function now() {
  try {
    if (!timeSensor) timeSensor = new Time()
    return timeSensor.getTime()
  } catch (e) {
    return Date.now()
  }
}

function rnd(a, b) {
  return a + Math.random() * (b - a)
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v
}

// Keep a circle of radius r inside the arena (a rounded rectangle).
function clampToArena(x, y, r) {
  const left = MARGIN + r
  const right = W - MARGIN - r
  const top = MARGIN + r
  const bottom = H - MARGIN - r
  x = clamp(x, left, right)
  y = clamp(y, top, bottom)
  const c = Math.max(0, CORNER - r)
  const cx = x < left + c ? left + c : x > right - c ? right - c : x
  const cy = y < top + c ? top + c : y > bottom - c ? bottom - c : y
  if (cx !== x && cy !== y) {
    const d = Math.hypot(x - cx, y - cy)
    if (d > c) {
      x = cx + ((x - cx) / d) * c
      y = cy + ((y - cy) / d) * c
    }
  }
  return [x, y]
}

function buzz() {
  try {
    if (!vibrator) vibrator = new Vibrator()
    vibrator.start()
  } catch (e) {
    // no vibration available: that's fine
  }
}

// ---------- saving ----------
function loadSettings() {
  try {
    const raw = storage.getItem('settings', '')
    if (raw) Object.assign(settings, JSON.parse(raw))
  } catch (e) {
    console.log('TILT ARENA could not read settings: ' + e)
  }
}

function saveSettings() {
  try {
    storage.setItem('settings', JSON.stringify(settings))
  } catch (e) {
    console.log('TILT ARENA could not save settings: ' + e)
  }
}

// ---------- tilt ----------
function startTilt() {
  try {
    if (!accel) {
      accel = new Accelerometer()
      accel.setFreqMode(FREQ_MODE_NORMAL)
    }
    accel.start()
    return true
  } catch (e) {
    console.log('TILT ARENA no accelerometer: ' + e)
    accel = null
    return false
  }
}

function stopTilt() {
  try {
    if (accel) accel.stop()
  } catch (e) {
    // ignore
  }
}

// Raw reading mapped to screen directions (swap / flip as calibrated).
function readTilt() {
  if (!accel) return null
  let r
  try {
    r = accel.getCurrent()
  } catch (e) {
    return null
  }
  if (!r || typeof r.x !== 'number') return null
  let ax = settings.swap ? r.y : r.x
  let ay = settings.swap ? r.x : r.y
  if (settings.flipX) ax = -ax
  if (settings.flipY) ay = -ay
  return { ax, ay, raw: r }
}

// Turn tilt into a direction with strength 0..1 on each axis.
function tiltVector() {
  const t = readTilt()
  if (!t) return [0, 0]
  const axis = (v) => {
    const f = v / GRAVITY
    const s = Math.sign(f)
    const m = Math.abs(f)
    return m < TILT_DEAD ? 0 : s * Math.min(1, (m - TILT_DEAD) / (TILT_FULL - TILT_DEAD))
  }
  return [axis(t.ax - settings.nx), axis(t.ay - settings.ny)]
}

// ---------- widget wrappers (every update goes through a "did it change?" check) ----------
function wrap(w, color) {
  return { w, v: true, t: null, c: color === undefined ? null : color, m: null }
}

function mkText(x, y, w, h, size, color, alignH) {
  return wrap(
    createWidget(widget.TEXT, {
      x, y, w, h,
      text: '',
      text_size: size,
      color,
      align_h: alignH === undefined ? align.CENTER_H : alignH,
      align_v: align.CENTER_V
    }),
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

function setBox(o, b, color, radius, stroke) {
  const values = { x: b.x, y: b.y, w: b.w, h: b.h, radius, color }
  if (stroke) values.line_width = 2
  setMore(o, b.x + ',' + b.y + ',' + b.w + ',' + b.h + ',' + color, values)
}

function inBox(x, y, b) {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
}

// A button = rounded panel + outline + label.
function mkButton(x, y, w, h, size) {
  return { box: { x, y, w, h }, bg: mkRect(x, y, w, h, PANEL, 12), edge: mkStroke(x, y, w, h, EDGE, 12), label: mkText(x, y, w, h, size, WHITE) }
}

function buttonParts(b) {
  return [b.bg, b.edge, b.label]
}

function styleButton(b, label, highlight, enabled) {
  setText(b.label, label)
  setColor(b.label, enabled === false ? LOCKED : WHITE)
  setBox(b.bg, b.box, highlight ? PANEL_ON : PANEL, 12)
  setBox(b.edge, b.box, highlight ? GOLD : EDGE, 12, true)
}

function hit(x, y, b) {
  return b.bg.v && inBox(x, y, b.box)
}

// ---------- a run ----------
function newRun() {
  run = {
    wave: 0,
    p: {
      x: CX, y: CY, r: 11,
      hp: 15, maxHp: 15, speed: 95, dmg: 3, fireEvery: 0.6, bulletSpeed: 230, range: 170,
      multi: 1, pierce: 0, crit: 0.05, armor: 0, regen: 0, magnet: 70,
      fireT: 0, hurtT: 0, regenT: 0
    },
    bought: {},
    enemies: [],
    shots: [],
    enemyShots: [],
    gems: [],
    kills: 0,
    paused: false,
    over: false
  }
  run.gemCount = 0
  startWave()
}

function startWave() {
  run.wave++
  run.time = WAVE_SECONDS(run.wave)
  run.spawnT = 1
  run.bossSpawned = false
  run.p.x = CX
  run.p.y = CY
  run.p.hurtT = 1 // a moment of safety at the start
  setScreen('game')
}

function freeSlot(list, max) {
  return list.length < max
}

function spawnEnemy(typeId) {
  if (!freeSlot(run.enemies, MAX_ENEMIES)) return
  const t = ENEMY_TYPES[typeId]
  // a random spot on the arena edge, not too close to the player
  let x = 0
  let y = 0
  for (let tries = 0; tries < 8; tries++) {
    const side = Math.floor(Math.random() * 4)
    x = side === 0 ? MARGIN + t.r : side === 1 ? W - MARGIN - t.r : rnd(MARGIN + CORNER, W - MARGIN - CORNER)
    y = side === 2 ? MARGIN + t.r : side === 3 ? H - MARGIN - t.r : rnd(MARGIN + CORNER, H - MARGIN - CORNER)
    if (Math.hypot(x - run.p.x, y - run.p.y) > 140) break
  }
  const hp = t.hp * ENEMY_HP_SCALE(run.wave)
  run.enemies.push({ type: typeId, t, x, y, hp, maxHp: hp, shootT: rnd(1, t.shootEvery || 1), flash: 0 })
}

function pickEnemyType() {
  const options = Object.keys(ENEMY_TYPES).filter((k) => ENEMY_TYPES[k].from <= run.wave)
  // later waves lean towards the tougher types
  const weights = options.map((k) => (k === 'blob' ? 3 : 1 + run.wave * 0.15))
  let r = Math.random() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < options.length; i++) {
    r -= weights[i]
    if (r <= 0) return options[i]
  }
  return options[0]
}

function damagePlayer(amount) {
  const p = run.p
  if (p.hurtT > 0 || run.over) return
  p.hp -= amount * Math.pow(0.85, p.armor)
  p.hurtT = 0.7
  buzz()
  if (p.hp <= 0) {
    p.hp = 0
    run.over = true
    if (run.wave > settings.best) {
      settings.best = run.wave
      saveSettings()
    }
    showDialog('GAME OVER', RED, 'reached wave ' + run.wave + '   best ' + settings.best, [
      { label: 'TRY AGAIN', action: newRun },
      { label: 'MENU', action: () => setScreen('menu') }
    ])
  }
}

function fire() {
  const p = run.p
  let target = null
  let best = p.range
  for (const e of run.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y)
    if (d < best) {
      best = d
      target = e
    }
  }
  if (!target) return false
  const base = Math.atan2(target.y - p.y, target.x - p.x)
  for (let i = 0; i < p.multi; i++) {
    if (!freeSlot(run.shots, MAX_BULLETS)) break
    const a = base + (i - (p.multi - 1) / 2) * 0.22 // a small fan
    run.shots.push({ x: p.x, y: p.y, vx: Math.cos(a) * p.bulletSpeed, vy: Math.sin(a) * p.bulletSpeed, life: p.range / p.bulletSpeed + 0.2, pierce: p.pierce, hitList: [] })
  }
  return true
}

// gems are worth more every wave, so income keeps up with rising prices
function gemValue(e) {
  return Math.max(1, Math.round(e.t.gems * (1 + GEM_GROWTH * (run.wave - 1))))
}

function killEnemy(e) {
  run.kills++
  const value = gemValue(e)
  if (run.gems.length >= MAX_GEMS) {
    run.gemCount += value // no room on the floor: collect straight away
    return
  }
  run.gems.push({ x: e.x, y: e.y, value, pulled: false })
}

function updateGame(dt) {
  const p = run.p

  // --- move the player ---
  let vx = 0
  let vy = 0
  if (settings.mode === 'tilt') {
    const v = tiltVector()
    vx = v[0] * p.speed
    vy = v[1] * p.speed
  } else if (touchTarget) {
    const dx = touchTarget[0] - p.x
    const dy = touchTarget[1] - p.y
    const d = Math.hypot(dx, dy)
    if (d > 4) {
      const s = Math.min(p.speed, d / dt)
      vx = (dx / d) * s
      vy = (dy / d) * s
    }
  }
  const moved = clampToArena(p.x + vx * dt, p.y + vy * dt, p.r)
  p.x = moved[0]
  p.y = moved[1]

  // --- timers ---
  p.hurtT = Math.max(0, p.hurtT - dt)
  if (p.regen > 0) {
    p.regenT += dt
    if (p.regenT >= 5) {
      p.regenT = 0
      p.hp = Math.min(p.maxHp, p.hp + p.regen)
    }
  }
  run.time -= dt

  // --- spawn ---
  run.spawnT -= dt
  if (run.spawnT <= 0) {
    run.spawnT = SPAWN_EVERY(run.wave)
    spawnEnemy(pickEnemyType())
    if (run.wave >= 3 && Math.random() < 0.3) spawnEnemy(pickEnemyType())
  }
  if (run.wave % BOSS_EVERY === 0 && !run.bossSpawned) {
    run.bossSpawned = true
    spawnEnemy('boss')
  }

  // --- shoot ---
  p.fireT -= dt
  if (p.fireT <= 0 && fire()) p.fireT = p.fireEvery

  // --- player bullets ---
  for (const s of run.shots) {
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.life -= dt
    for (const e of run.enemies) {
      if (e.hp <= 0 || s.hitList.indexOf(e) >= 0) continue
      if (Math.hypot(e.x - s.x, e.y - s.y) < e.t.r + 4) {
        const crit = Math.random() < p.crit
        e.hp -= p.dmg * (crit ? 2 : 1)
        e.flash = 0.12
        s.hitList.push(e)
        if (s.pierce-- <= 0) {
          s.life = 0
          break
        }
      }
    }
  }
  run.shots = run.shots.filter((s) => s.life > 0 && s.x > 0 && s.x < W && s.y > 0 && s.y < H)

  // --- enemies ---
  for (const e of run.enemies) {
    if (e.hp <= 0) continue
    e.flash = Math.max(0, e.flash - dt)
    const dx = p.x - e.x
    const dy = p.y - e.y
    const d = Math.hypot(dx, dy) || 1
    const speed = e.t.speed * (1 + 0.02 * (run.wave - 1))
    let dir = 1
    if (e.t.keepAway && d < e.t.keepAway) dir = -0.6 // spitters back off
    const m = clampToArena(e.x + (dx / d) * speed * dir * dt, e.y + (dy / d) * speed * dir * dt, e.t.r)
    e.x = m[0]
    e.y = m[1]
    if (d < e.t.r + p.r) damagePlayer(e.t.dmg * ENEMY_DMG_SCALE(run.wave))
    if (e.t.shootEvery) {
      e.shootT -= dt
      if (e.shootT <= 0) {
        e.shootT = e.t.shootEvery
        if (freeSlot(run.enemyShots, MAX_ENEMY_SHOTS)) run.enemyShots.push({ x: e.x, y: e.y, vx: (dx / d) * 95, vy: (dy / d) * 95, life: 4 })
      }
    }
  }
  for (const e of run.enemies) if (e.hp <= 0) killEnemy(e)
  run.enemies = run.enemies.filter((e) => e.hp > 0)

  // --- enemy bullets ---
  for (const s of run.enemyShots) {
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.life -= dt
    if (Math.hypot(s.x - p.x, s.y - p.y) < p.r + 4) {
      damagePlayer(ENEMY_DMG_SCALE(run.wave))
      s.life = 0
    }
  }
  run.enemyShots = run.enemyShots.filter((s) => s.life > 0 && s.x > 0 && s.x < W && s.y > 0 && s.y < H)

  // --- gems: pulled in by the magnet, then collected ---
  for (const g of run.gems) {
    const d = Math.hypot(p.x - g.x, p.y - g.y)
    if (d < p.magnet) g.pulled = true
    if (g.pulled) {
      const step = Math.min(d, 260 * dt)
      g.x += ((p.x - g.x) / (d || 1)) * step
      g.y += ((p.y - g.y) / (d || 1)) * step
    }
    if (d < p.r + 4) g.taken = true
  }
  for (const g of run.gems) if (g.taken) run.gemCount += g.value
  run.gems = run.gems.filter((g) => !g.taken)

  // --- wave over? ---
  if (run.time <= 0 && !run.over) endWave()
}

function endWave() {
  // everything left on the floor is collected, monsters vanish, plus a bonus for surviving
  for (const g of run.gems) run.gemCount += g.value
  run.gems = []
  run.bonus = WAVE_BONUS(run.wave)
  run.gemCount += run.bonus
  run.enemies = []
  run.shots = []
  run.enemyShots = []
  if (run.wave > settings.best) {
    settings.best = run.wave
    saveSettings()
  }
  openShop()
}

// ---------- shop ----------
function upgradeCost(u) {
  return Math.round(u.base * (1 + PRICE_GROWTH * (run.wave - 1)))
}

function rollOffers() {
  const pool = UPGRADES.filter((u) => !u.max || (run.bought[u.id] || 0) < u.max)
  const offers = []
  while (offers.length < OFFERS && pool.length) offers.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  run.offers = offers.map((u) => ({ u, sold: false }))
}

function openShop() {
  run.shopLockUntil = now() + SHOP_LOCK_MS
  run.rerolls = 0
  rollOffers()
  setScreen('shop')
}

function rerollCost() {
  return 2 + run.wave + run.rerolls * 2
}

function buyOffer(i) {
  const o = run.offers[i]
  if (!o || o.sold) return
  const c = upgradeCost(o.u)
  if (run.gemCount < c) return
  run.gemCount -= c
  o.u.apply(run.p)
  run.bought[o.u.id] = (run.bought[o.u.id] || 0) + 1
  o.sold = true
}

function reroll() {
  const c = rerollCost()
  if (run.gemCount < c) return
  run.gemCount -= c
  run.rerolls++
  rollOffers()
}

// ---------- dialog (pause / game over) ----------
function showDialog(title, color, sub, buttons) {
  const d = ui.dialog
  ui.dialogOpen = true
  ;[d.panel, d.edge, d.title, d.sub].forEach((o) => setVisible(o, true))
  setText(d.title, title)
  setColor(d.title, color)
  setText(d.sub, sub)
  d.actions = []
  d.buttons.forEach((b, i) => {
    const spec = buttons[i]
    buttonParts(b).forEach((o) => setVisible(o, !!spec))
    if (spec) {
      styleButton(b, spec.label, i === 0)
      d.actions[i] = spec.action
    }
  })
}

function hideDialog() {
  const d = ui.dialog
  ui.dialogOpen = false
  ;[d.panel, d.edge, d.title, d.sub].forEach((o) => setVisible(o, false))
  d.buttons.forEach((b) => buttonParts(b).forEach((o) => setVisible(o, false)))
}

function pause() {
  if (screen !== 'game' || !run || run.over || run.paused) return
  run.paused = true
  const t = settings.mode === 'tilt' ? readTilt() : null
  const tiltInfo = t ? '  tilt ' + Math.round(t.raw.x) + ',' + Math.round(t.raw.y) + ',' + Math.round(t.raw.z) : ''
  showDialog('PAUSED', WHITE, (perfText || 'speed: measuring...') + tiltInfo, [
    { label: 'RESUME', action: resume },
    { label: 'MENU', action: () => setScreen('menu') }
  ])
}

function resume() {
  hideDialog()
  run.paused = false
  lastTick = now()
}

// ---------- screens ----------
function setScreen(name) {
  screen = name
  hideDialog()
  touchTarget = null
  ui.groups.game.forEach((o) => setVisible(o, name === 'game'))
  ui.groups.menu.forEach((o) => setVisible(o, name === 'menu'))
  ui.groups.shop.forEach((o) => setVisible(o, name === 'shop'))
  ui.groups.calibrate.forEach((o) => setVisible(o, name === 'calibrate'))
  if (name !== 'game') hidePools()
  if ((name === 'game' && settings.mode === 'tilt') || name === 'calibrate') startTilt()
  else stopTilt()
  if (name === 'menu') run = null
  lastTick = now()
  render()
}

function hidePools() {
  for (const k of ['enemies', 'shots', 'enemyShots', 'gems']) ui.pools[k].forEach((o) => setVisible(o, false))
}

// ---------- input ----------
function onTouch(kind, x, y) {
  const t = now()
  if (kind === 'down') {
    if (t - lastTapAt < 40) return // ignore an accidental double event
    lastTapAt = t
  }

  if (ui.dialogOpen) {
    if (kind !== 'down') return
    const d = ui.dialog
    for (let i = 0; i < d.buttons.length; i++) {
      if (hit(x, y, d.buttons[i])) return d.actions[i]()
    }
    return
  }

  if (screen === 'game') {
    if (kind === 'down' && inBox(x, y, ui.pauseBox)) return pause()
    if (settings.mode === 'touch') touchTarget = kind === 'up' ? touchTarget : [x, y]
    return
  }
  if (kind !== 'down') return

  if (screen === 'menu') {
    if (hit(x, y, ui.play)) newRun()
    else if (hit(x, y, ui.modeBtn)) {
      settings.mode = settings.mode === 'tilt' ? 'touch' : 'tilt'
      saveSettings()
      render()
    } else if (hit(x, y, ui.calBtn)) setScreen('calibrate')
  } else if (screen === 'shop') {
    if (now() < run.shopLockUntil) return // still locked: ignore stray taps from the fight
    for (let i = 0; i < ui.offers.length; i++) {
      if (inBox(x, y, ui.offers[i].box)) {
        buyOffer(i)
        return render()
      }
    }
    if (hit(x, y, ui.rerollBtn)) {
      reroll()
      render()
    } else if (hit(x, y, ui.nextBtn)) startWave()
  } else if (screen === 'calibrate') {
    if (hit(x, y, ui.cal.level)) {
      const r = readTilt()
      if (r) {
        settings.nx = r.ax
        settings.ny = r.ay
        saveSettings()
      }
    } else if (hit(x, y, ui.cal.flipX)) {
      settings.flipX = !settings.flipX
      settings.nx = -settings.nx
      saveSettings()
    } else if (hit(x, y, ui.cal.flipY)) {
      settings.flipY = !settings.flipY
      settings.ny = -settings.ny
      saveSettings()
    } else if (hit(x, y, ui.cal.swap)) {
      settings.swap = !settings.swap
      settings.nx = 0
      settings.ny = 0
      saveSettings()
    } else if (hit(x, y, ui.cal.back)) setScreen('menu')
  }
}

// Swipe right normally closes the app; during a run it pauses instead.
function onSwipe(ev) {
  if (ev === GESTURE_RIGHT && screen === 'game') {
    pause()
    return true
  }
  return false
}

// ---------- building the screen (once) ----------
function buildScreen() {
  const bg = mkRect(0, 0, W, H, FLOOR, 0)
  bg.w.addEventListener(event.CLICK_DOWN, (e) => handleTouch('down', e)) // backup if taps fall through

  // --- arena floor: a faint grid and a border (static) ---
  ui.groups = { game: [], menu: [], shop: [], calibrate: [] }
  const g = ui.groups.game
  for (let x = 60; x < W - 20; x += 55) g.push(mkRect(x, MARGIN + 30, 1, H - 2 * MARGIN - 60, GRID, 0))
  for (let y = 60; y < H - 20; y += 55) g.push(mkRect(MARGIN + 30, y, W - 2 * MARGIN - 60, 1, GRID, 0))
  g.push(mkStroke(MARGIN - 4, MARGIN - 4, W - 2 * MARGIN + 8, H - 2 * MARGIN + 8, EDGE, CORNER))

  // --- pools of moving things (created hidden; borrowed as needed) ---
  ui.pools = {
    gems: Array.from({ length: MAX_GEMS }, () => mkCircle(-20, -20, 3, GEM)),
    enemies: Array.from({ length: MAX_ENEMIES }, () => mkCircle(-40, -40, 10, WHITE)),
    shots: Array.from({ length: MAX_BULLETS }, () => mkCircle(-20, -20, 4, GOLD)),
    enemyShots: Array.from({ length: MAX_ENEMY_SHOTS }, () => mkCircle(-20, -20, 4, RED))
  }
  hidePoolsNow()

  // --- player ---
  ui.player = mkCircle(CX, CY, 11, CYAN)
  ui.playerCore = mkCircle(CX, CY, 5, WHITE)
  g.push(ui.player, ui.playerCore)

  // --- HUD ---
  ui.hpBack = mkRect(CX - 80, 14, 160, 10, 0x2a2f4a, 5)
  ui.hpFill = mkRect(CX - 80, 14, 160, 10, GREEN, 5)
  ui.hud = mkText(CX - 120, 26, 240, 24, 17, WHITE)
  ui.gemText = mkText(CX - 120, 48, 240, 20, 14, GEM)
  ui.pauseBox = { x: CX - 26, y: H - 25, w: 52, h: 22 }
  const pb = ui.pauseBox
  g.push(ui.hpBack, ui.hpFill, ui.hud, ui.gemText)
  g.push(mkRect(pb.x, pb.y, pb.w, pb.h, PANEL, 11), mkRect(CX - 7, pb.y + 5, 4, 12, DIM, 0), mkRect(CX + 3, pb.y + 5, 4, 12, DIM, 0))

  // --- menu ---
  const m = ui.groups.menu
  ui.title = mkText(0, 70, W, 56, 42, WHITE)
  setText(ui.title, 'TILT ARENA')
  ui.subtitle = mkText(0, 124, W, 24, 16, DIM)
  setText(ui.subtitle, 'survive the waves')
  ui.play = mkButton(CX - 110, 170, 220, 54, 24)
  ui.modeBtn = mkButton(CX - 110, 234, 220, 48, 19)
  ui.calBtn = mkButton(CX - 110, 292, 220, 48, 19)
  ui.bestText = mkText(0, 352, W, 26, 17, GOLD)
  m.push(ui.title, ui.subtitle, ui.bestText)
  ;[ui.play, ui.modeBtn, ui.calBtn].forEach((b) => m.push(...buttonParts(b)))
  // a little decoration: a hero surrounded by monsters
  ;[[CX - 120, 150, 9, 0x6fd36f], [CX + 120, 150, 9, 0xff9a3d], [CX - 150, 100, 7, 0xff5c8a], [CX + 150, 100, 12, 0xb05cff]].forEach(([x, y, r, c]) =>
    m.push(mkCircle(x, y, r, c))
  )

  // --- shop ---
  const s = ui.groups.shop
  ui.shopTitle = mkText(0, 18, W, 36, 26, GREEN)
  ui.shopSub = mkText(0, 52, W, 24, 16, GEM)
  s.push(ui.shopTitle, ui.shopSub)
  ui.offers = [80, 140, 200, 260].map((y) => {
    const box = { x: 30, y, w: 330, h: 54 }
    const o = {
      box,
      bg: mkRect(box.x, box.y, box.w, box.h, PANEL, 12),
      edge: mkStroke(box.x, box.y, box.w, box.h, EDGE, 12),
      name: mkText(box.x + 14, box.y + 3, 220, 26, 18, WHITE, align.LEFT),
      desc: mkText(box.x + 14, box.y + 28, 230, 22, 13, DIM, align.LEFT),
      cost: mkText(box.x + box.w - 110, box.y, 98, box.h, 17, GEM, align.RIGHT)
    }
    s.push(o.bg, o.edge, o.name, o.desc, o.cost)
    return o
  })
  ui.rerollBtn = mkButton(30, 326, 150, 46, 18)
  ui.nextBtn = mkButton(190, 326, 170, 46, 20)
  ui.statsText = mkText(0, 380, W, 22, 13, DIM)
  s.push(...buttonParts(ui.rerollBtn), ...buttonParts(ui.nextBtn), ui.statsText)

  // --- calibration ---
  const c = ui.groups.calibrate
  ui.cal = {
    title: mkText(0, 18, W, 34, 24, WHITE),
    help: mkText(30, 50, W - 60, 40, 14, DIM),
    raw: mkText(0, 92, W, 22, 14, GEM),
    ringOuter: mkCircle(CX, 190, 62, 0x1a2140),
    ringMid: mkCircle(CX, 190, 40, FLOOR),
    ball: mkCircle(CX, 190, 9, CYAN),
    level: mkButton(CX - 110, 266, 220, 46, 19),
    flipX: mkButton(30, 320, 100, 44, 16),
    flipY: mkButton(145, 320, 100, 44, 16),
    swap: mkButton(260, 320, 100, 44, 16),
    back: mkButton(CX - 70, 372, 140, 44, 18)
  }
  setText(ui.cal.title, 'CALIBRATE TILT')
  setText(ui.cal.help, 'hold your wrist comfortably, tap SET LEVEL')
  c.push(ui.cal.title, ui.cal.help, ui.cal.raw, ui.cal.ringOuter, ui.cal.ringMid, ui.cal.ball)
  ;['level', 'flipX', 'flipY', 'swap', 'back'].forEach((k) => c.push(...buttonParts(ui.cal[k])))

  // --- dialog (pause / game over) ---
  ui.dialog = {
    panel: mkRect(CX - 140, 110, 280, 210, PANEL, 16),
    edge: mkStroke(CX - 140, 110, 280, 210, EDGE, 16),
    title: mkText(CX - 140, 122, 280, 40, 30, WHITE),
    sub: wrap(
      createWidget(widget.TEXT, {
        x: CX - 135, y: 164, w: 270, h: 34, text: '', text_size: 13, color: DIM,
        align_h: align.CENTER_H, align_v: align.CENTER_V, text_style: text_style.WRAP
      }),
      DIM
    ),
    buttons: [0, 1].map((i) => mkButton(CX - 100, 206 + i * 54, 200, 46, 20)),
    actions: []
  }

  // --- touch layer: an empty full-screen text widget on top of everything ---
  // (no canvas: canvases need a big block of pixel memory)
  ui.touch = createWidget(widget.TEXT, { x: 0, y: 0, w: W, h: H, text: '', text_size: 10, color: FLOOR })
  ui.touch.addEventListener(event.CLICK_DOWN, (e) => handleTouch('down', e))
  ui.touch.addEventListener(event.MOVE, (e) => handleTouch('move', e))
  ui.touch.addEventListener(event.CLICK_UP, (e) => handleTouch('up', e))
}

function hidePoolsNow() {
  for (const k in ui.pools) ui.pools[k].forEach((o) => setVisible(o, false))
}

function handleTouch(kind, e) {
  try {
    if (!e || typeof e.x !== 'number' || typeof e.y !== 'number') return
    onTouch(kind, e.x, e.y)
  } catch (err) {
    showError('touch', err)
  }
}

// ---------- drawing (only what changed) ----------
function renderPool(pool, items, draw) {
  for (let i = 0; i < pool.length; i++) {
    const item = items[i]
    setVisible(pool[i], !!item)
    if (item) draw(pool[i], item)
  }
}

function renderGame() {
  const p = run.p
  const blink = p.hurtT > 0 && Math.floor(p.hurtT * 10) % 2 === 0
  setCircle(ui.player, p.x, p.y, p.r, blink ? RED : CYAN)
  setCircle(ui.playerCore, p.x, p.y, 5, WHITE)

  renderPool(ui.pools.gems, run.gems, (o, g) => setCircle(o, g.x, g.y, g.value >= 8 ? 5 : g.value >= 3 ? 4 : 3, g.value >= 8 ? GOLD : GEM))
  renderPool(ui.pools.enemies, run.enemies, (o, e) => setCircle(o, e.x, e.y, e.t.r, e.flash > 0 ? WHITE : e.t.color))
  renderPool(ui.pools.shots, run.shots, (o, s) => setCircle(o, s.x, s.y, 4, GOLD))
  renderPool(ui.pools.enemyShots, run.enemyShots, (o, s) => setCircle(o, s.x, s.y, 4, RED))

  const frac = clamp(p.hp / p.maxHp, 0, 1)
  const w = Math.round(160 * frac)
  setVisible(ui.hpFill, w >= 2)
  if (w >= 2) setBox(ui.hpFill, { x: CX - 80, y: 14, w, h: 10 }, frac > 0.3 ? GREEN : RED, 5)
  const secs = Math.max(0, Math.ceil(run.time))
  const boss = run.wave % BOSS_EVERY === 0 ? '  BOSS' : ''
  setText(ui.hud, 'WAVE ' + run.wave + '   ' + Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0') + boss)
  setText(ui.gemText, run.gemCount + ' gems')
}

function renderMenu() {
  styleButton(ui.play, 'PLAY', true)
  styleButton(ui.modeBtn, 'CONTROLS: ' + settings.mode.toUpperCase(), false)
  styleButton(ui.calBtn, 'CALIBRATE TILT', false, settings.mode === 'tilt')
  setText(ui.bestText, settings.best > 0 ? 'BEST: WAVE ' + settings.best : 'tip: TOUCH works in the simulator')
}

function renderShop() {
  setText(ui.shopTitle, 'WAVE ' + run.wave + ' CLEARED')
  setText(ui.shopSub, run.gemCount + ' gems (+' + run.bonus + ' bonus)    HP ' + Math.ceil(run.p.hp) + '/' + run.p.maxHp)
  const lockLeft = run.shopLockUntil - now()
  const locked = lockLeft > 0
  run.offers.forEach((o, i) => {
    const w = ui.offers[i]
    const c = upgradeCost(o.u)
    const can = !locked && !o.sold && run.gemCount >= c
    setBox(w.bg, w.box, can ? PANEL_ON : PANEL, 12)
    setBox(w.edge, w.box, can ? GOLD : EDGE, 12, true)
    setText(w.name, o.sold ? 'SOLD' : o.u.name + ((run.bought[o.u.id] || 0) > 0 ? ' +' + run.bought[o.u.id] : ''))
    setColor(w.name, o.sold ? LOCKED : can ? WHITE : DIM)
    setText(w.desc, o.sold ? '' : o.u.desc)
    setText(w.cost, o.sold ? '' : c + ' gems')
    setColor(w.cost, can ? GEM : DIM)
  })
  for (let i = run.offers.length; i < ui.offers.length; i++) {
    const w = ui.offers[i]
    setText(w.name, '')
    setText(w.desc, '')
    setText(w.cost, '')
  }
  const rc = rerollCost()
  styleButton(ui.rerollBtn, 'REROLL ' + rc, false, !locked && run.gemCount >= rc)
  if (locked) styleButton(ui.nextBtn, 'WAIT ' + (lockLeft / 1000).toFixed(1), false, false)
  else styleButton(ui.nextBtn, 'NEXT WAVE', true)
  const p = run.p
  setText(
    ui.statsText,
    'DMG ' + p.dmg + '  RATE ' + (1 / p.fireEvery).toFixed(1) + '/s  SPD ' + Math.round(p.speed) + '  x' + p.multi + '  ARMOR ' + p.armor
  )
}

function renderCalibrate() {
  const t = readTilt()
  if (!t) {
    setText(ui.cal.raw, 'no tilt sensor found here - use TOUCH')
    setCircle(ui.cal.ball, CX, 190, 9, LOCKED)
  } else {
    setText(ui.cal.raw, 'raw  x ' + Math.round(t.raw.x) + '   y ' + Math.round(t.raw.y) + '   z ' + Math.round(t.raw.z))
    const v = tiltVector()
    setCircle(ui.cal.ball, CX + v[0] * 52, 190 + v[1] * 52, 9, CYAN)
  }
  styleButton(ui.cal.level, 'SET LEVEL', true)
  styleButton(ui.cal.flipX, settings.flipX ? 'X: FLIP' : 'X: NORM', false)
  styleButton(ui.cal.flipY, settings.flipY ? 'Y: FLIP' : 'Y: NORM', false)
  styleButton(ui.cal.swap, settings.swap ? 'SWAPPED' : 'SWAP XY', false)
  styleButton(ui.cal.back, 'BACK', false)
}

function render() {
  if (screen === 'game' && run) renderGame()
  else if (screen === 'menu') renderMenu()
  else if (screen === 'shop' && run) renderShop()
  else if (screen === 'calibrate') renderCalibrate()
}

// ---------- main loop ----------
const perf = { start: 0, ticks: 0, work: 0 }

function tick() {
  try {
    const t = now()
    let dt = (t - lastTick) / 1000
    lastTick = t
    if (dt < 0) dt = 0
    if (dt > MAX_DT) dt = MAX_DT

    if (screen === 'game' && run && !run.paused && !run.over) {
      updateGame(dt)
      if (screen === 'game') renderGame()

      perf.ticks++
      perf.work += now() - t
      if (t - perf.start >= 1000) {
        perfText = 'speed ' + (perf.work / perf.ticks).toFixed(1) + ' ms, ' + perf.ticks + '/s'
        perf.start = t
        perf.ticks = 0
        perf.work = 0
      }
    } else if (screen === 'calibrate') {
      renderCalibrate()
    } else if (screen === 'shop' && run && t < run.shopLockUntil + 300) {
      renderShop() // count down the lock, then one last redraw to light the buttons up
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
  console.log('TILT ARENA ERROR ' + msg)
  createWidget(widget.TEXT, { x: 15, y: 40, w: (W || 390) - 30, h: 380, text: msg, text_size: 18, color: RED, text_style: text_style.WRAP })
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
        setStatusBarVisible(false)
      } catch (e) {
        console.log('TILT ARENA could not hide status bar: ' + e)
      }

      step = 'setPageBrightTime'
      setPageBrightTime({ brightTime: 600000 }) // keep the screen on while playing (10 min)

      step = 'load settings'
      storage = new LocalStorage()
      loadSettings()

      step = 'build screen'
      buildScreen()
      setScreen('menu')

      step = 'onGesture'
      try {
        onGesture({ callback: onSwipe })
      } catch (e) {
        console.log('TILT ARENA could not listen for swipes: ' + e)
      }

      step = 'setInterval'
      lastTick = now()
      perf.start = lastTick
      timer = setInterval(tick, TICK_MS)
      step = 'running'
    } catch (e) {
      showError('build', e)
    }
  },

  onDestroy() {
    if (timer !== null) clearInterval(timer)
    stopTilt()
    try {
      offGesture()
    } catch (e) {
      // nothing to undo
    }
    if (run && run.wave > settings.best) {
      settings.best = run.wave
      saveSettings()
    }
    resetPageBrightTime()
  }
})
