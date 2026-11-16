// Stick Duel — a swipe-controlled stickman fighting game for Zepp OS (API 4.0, built for Amazfit Bip 6)
//
// How it plays:
//   * You are the white stickman on the left. An NPC stickman stands on the right.
//   * Best of 3 rounds, 45 seconds each. Knock their HP to zero (K.O.) or have more HP at time-out.
//   * Beat six opponents in a row to become champion; then the ladder starts again, tougher.
//
// Controls (swipe anywhere):
//   RIGHT (towards the foe)  JAB    fast poke, low damage
//   UP                       KICK   slow high kick, big damage, BREAKS GUARD
//   DOWN                     SWEEP  low sweep, knocks the foe down
//   LEFT (away from the foe) GUARD  blocks jabs and sweeps (not kicks)
//   Guard just as a hit lands  -> PARRY: the attacker is stunned, free hit for you.
//   Hit a foe while they wind up -> COUNTER: x1.5 damage.
//   TAP when the SUPER bar is full -> unblockable flurry. Tap the timer to pause.
//
// The rock-paper-scissors at the heart of it:
//   jab / sweep  lose to  guard  loses to  kick  loses to  jab (it is faster and interrupts the wind-up)
//
// Rendering: the two fighters are drawn with lines on ONE small canvas (the fight strip);
// everything else is native widgets updated only when they change. One invisible full-screen
// text widget on top receives all touches; system swipe gestures are captured too, so a
// swipe works whichever of the two the watch delivers (duplicates are ignored).

import { createWidget, widget, event, prop, align, text_style, setStatusBarVisible } from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { setPageBrightTime, resetPageBrightTime } from '@zos/display'
import { onGesture, offGesture, GESTURE_UP, GESTURE_DOWN, GESTURE_LEFT, GESTURE_RIGHT } from '@zos/interaction'
import { LocalStorage } from '@zos/storage'
import { Time, Vibrator } from '@zos/sensor'

// ---------- tuning ----------
const TICK_MS = 66 // about 15 updates per second
const MAX_DT = 0.1
const ROUND_TIME = 45
const ROUNDS_TO_WIN = 2
const PLAYER_HP = 100
const GAP = 66 // fighters walk in until they are this far apart (hip to hip)
const MIN_GAP = 44
const WALK_SPEED = 80
const BACK_SPEED = 170
const BACK_TIME = 0.28
const GUARD_TIME = 0.65
const PERFECT = 0.18 // the first part of a guard is a PARRY window
const GUARD_COST = 8
const BACK_COST = 6
const STAMINA_REGEN = 24 // per second, while not attacking or guarding
const SUPER_MAX = 100
const SWIPE_MIN = 26 // px
const SWIPE_EARLY = 42 // px: a drag this long counts as a swipe before the finger lifts

// wind = wind-up, act = the hit, rec = recovery (seconds)
// tell = extra wind-up the NPC adds so a human can see the big moves coming
const MOVES = {
  jab: { wind: 0.1, act: 0.08, rec: 0.22, dmg: 6, range: 74, cost: 10, kb: 12, stun: 0.28, tell: 0, poses: ['jabW', 'jabA'], hitY: 110 },
  kick: { wind: 0.3, act: 0.1, rec: 0.38, dmg: 14, range: 84, cost: 22, kb: 60, stun: 0.45, tell: 0.14, breaks: true, poses: ['kickW', 'kickA'], hitY: 112 },
  sweep: { wind: 0.22, act: 0.1, rec: 0.4, dmg: 9, range: 82, cost: 16, kb: 18, tell: 0.08, down: true, poses: ['sweepW', 'sweepA'], hitY: 20 },
  super: { wind: 0.22, act: 0.32, rec: 0.5, dmg: 26, range: 104, cost: 0, kb: 70, tell: 0.16, down: true, unblock: true, lunge: 40, poses: ['superW', 'superA1'], hitY: 95 }
}
const EXHAUSTED = 4 // trying to attack with less stamina than this leaves you winded
const EXHAUST_TIME = 0.6
const DOWN_TIME = 0.85
const GETUP_TIME = 0.4

// The ladder. react = seconds before they respond to your attack, defend = chance they respond,
// aggro = chance to attack when they think, punish = chance to punish an opening,
// read = chance to kick you when you turtle, windup = their wind-ups are this much slower than yours
// (so you can see attacks coming), think = seconds between decisions.
const OPPONENTS = [
  { name: 'TWIG', tag: 'still learning', color: 0x5ab4ff, hp: 80, react: 0.6, defend: 0.25, aggro: 0.3, punish: 0.2, read: 0.1, windup: 1.75, think: 0.8 },
  { name: 'SCRIBBLE', tag: 'loves to jab', color: 0x6fd36f, hp: 90, react: 0.5, defend: 0.35, aggro: 0.45, punish: 0.35, read: 0.2, windup: 1.6, think: 0.65, likes: 'jab' },
  { name: 'INKBLOT', tag: 'sweeps the leg', color: 0xb05cff, hp: 100, react: 0.43, defend: 0.45, aggro: 0.5, punish: 0.45, read: 0.35, windup: 1.5, think: 0.55, likes: 'sweep' },
  { name: 'SKETCH', tag: 'kicks hard', color: 0xff9a3d, hp: 100, react: 0.37, defend: 0.5, aggro: 0.55, punish: 0.55, read: 0.45, windup: 1.4, think: 0.48, likes: 'kick', super: true },
  { name: 'GRAPHITE', tag: 'reads your guard', color: 0xff5c5c, hp: 110, react: 0.31, defend: 0.6, aggro: 0.62, punish: 0.7, read: 0.6, windup: 1.25, think: 0.4, super: true },
  { name: 'SHADE', tag: 'the champion', color: 0x1a1d30, outline: 0xffd84d, hp: 135, react: 0.22, defend: 0.75, aggro: 0.72, punish: 0.85, read: 0.7, windup: 1.1, think: 0.32, super: true }
]

// ---------- stickman body (pixels) ----------
const TORSO = 40
const NECK = 4
const HEAD = 11
const UPPER_ARM = 22
const FOREARM = 21
const THIGH = 29
const SHIN = 29
const LIMB_W = 5

// A pose = [lean, frontUpperArm, frontForearm, backUpperArm, backForearm, frontThigh, frontShin, backThigh, backShin]
// Angles in degrees, absolute: 0 = straight down, 90 = straight towards the foe, 180 = straight up,
// negative = backwards. lean tilts the torso forward. The lowest point always rests on the floor.
const POSES = {
  stance: [6, 50, 155, 25, 165, 22, 8, -22, -10],
  jabW: [0, 30, 150, 30, 165, 22, 8, -24, -12],
  jabA: [14, 92, 90, 15, 160, 30, 10, -30, -18],
  kickW: [-8, 45, 160, -20, 60, 85, -10, -5, -5],
  kickA: [-28, 30, 140, -45, -20, 115, 110, -8, -8],
  sweepW: [30, 60, 150, 30, 150, 70, -5, -10, -100],
  sweepA: [40, 70, 30, -30, -10, 88, 92, 30, -120],
  guard: [-4, 70, 175, 55, 170, 18, 5, -26, -14],
  hurt: [-22, -20, 10, -40, -30, 25, 15, -10, -5],
  stun: [-10, 10, 5, -5, 0, 20, -5, -15, 0],
  down: [-95, -100, -100, -80, -90, 80, 85, 70, 90],
  getup: [30, 60, 20, 40, 10, 80, -10, -10, -100],
  win: [0, 160, 165, -160, -165, 15, 5, -15, -5],
  superW: [25, 20, 130, 10, 140, 60, 0, -30, -20],
  superA1: [18, 92, 90, -20, 120, 40, 15, -35, -20],
  superA2: [18, 30, 140, 95, 92, 40, 15, -35, -20],
  superR: [-12, 150, 170, 20, 150, 30, 10, -25, -10],
  back: [-12, 50, 160, 30, 165, 5, -5, -40, -20]
}

// ---------- colours ----------
const SKY = 0x0b0d18
const MOON = 0x171b33
const PILLAR = 0x12152a
const FLOOR = 0x1a1e33
const FLOOR_EDGE = 0x2c3355
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
const STAMINA = 0xf2c84b
const PURPLE = 0xb05cff
const BAR_BACK = 0x2a2f4a

// ---------- module state ----------
let W, H, CX
let CV_Y, CV_H, GROUND_C // the fight canvas strip and the floor line inside it
let ARENA_L, ARENA_R
let timer = null
let storage = null
let timeSensor = null
let vibrator = null
let cv = null // the one canvas
let lineOk = true
let screen = 'menu' // menu | howto | fight | result
let paused = false
let lastTick = 0
let frame = 0
let step = 'start'

let P = null // the player fighter
let E = null // the enemy fighter
let match = null
let fx = { sparks: [], shake: 0, hitStop: 0, slowT: 0 }
let touch = null
let lastSwipe = { t: 0, dir: '', src: '' }
let resultActions = []

const save = { stage: 0, tier: 0, wins: 0, losses: 0, titles: 0 }
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

function ease(k) {
  k = clamp(k, 0, 1)
  return k * k * (3 - 2 * k)
}

function lerpPose(a, b, k) {
  const out = new Array(9)
  for (let i = 0; i < 9; i++) out[i] = a[i] + (b[i] - a[i]) * k
  return out
}

function mixColor(c, k) {
  // darken a colour to k (0..1) of its brightness, used for the far-side limbs
  const r = Math.round(((c >> 16) & 255) * k)
  const g = Math.round(((c >> 8) & 255) * k)
  const b = Math.round((c & 255) * k)
  return (r << 16) | (g << 8) | b
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
function loadSave() {
  try {
    const raw = storage.getItem('save', '')
    if (raw) Object.assign(save, JSON.parse(raw))
  } catch (e) {
    console.log('STICK DUEL could not read save: ' + e)
  }
}

function writeSave() {
  try {
    storage.setItem('save', JSON.stringify(save))
  } catch (e) {
    console.log('STICK DUEL could not save: ' + e)
  }
}

// ---------- widget wrappers (every update goes through a "did it change?" check) ----------
function wrap(w, color) {
  return { w, v: true, t: null, c: color === undefined ? null : color, m: null }
}

function mkText(x, y, w, h, size, color, alignH, wrapText) {
  const opts = { x, y, w, h, text: '', text_size: size, color, align_h: alignH === undefined ? align.CENTER_H : alignH, align_v: align.CENTER_V }
  if (wrapText) opts.text_style = text_style.WRAP
  return wrap(createWidget(widget.TEXT, opts), color)
}

function mkRect(x, y, w, h, color, radius) {
  return wrap(createWidget(widget.FILL_RECT, { x, y, w, h, radius: radius || 0, color }), color)
}

function mkStroke(x, y, w, h, color, radius) {
  return wrap(createWidget(widget.STROKE_RECT, { x, y, w, h, radius: radius || 0, line_width: 2, color }), color)
}

function mkCircle(x, y, r, color) {
  return wrap(createWidget(widget.CIRCLE, { center_x: x, center_y: y, radius: r, color }), color)
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

// a horizontal bar: x,y fixed, width changes (fromRight = drains towards the right edge)
function setBar(o, x, y, fullW, h, frac, color, fromRight) {
  const w = Math.max(0, Math.round(fullW * clamp(frac, 0, 1)))
  const bx = fromRight ? x + fullW - w : x
  setMore(o, bx + ',' + w + ',' + color, { x: bx, y, w: Math.max(1, w), h, radius: Math.min(h >> 1, Math.max(0, w >> 1)), color })
  setVisible(o, w > 0)
}

function inBox(x, y, b) {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
}

function mkButton(x, y, w, h, size) {
  return { box: { x, y, w, h }, bg: mkRect(x, y, w, h, PANEL, 14), edge: mkStroke(x, y, w, h, EDGE, 14), label: mkText(x, y, w, h, size, WHITE) }
}

function buttonParts(b) {
  return [b.bg, b.edge, b.label]
}

function setBox(o, b, color, radius, stroke) {
  const values = { x: b.x, y: b.y, w: b.w, h: b.h, radius, color }
  if (stroke) values.line_width = 2
  setMore(o, b.x + ',' + b.y + ',' + b.w + ',' + b.h + ',' + color, values)
}

function setDot(o, x, y, r, color) {
  setMore(o, x + ',' + y + ',' + r + ',' + color, { center_x: x, center_y: y, radius: r, color })
}

function styleButton(b, label, highlight) {
  setText(b.label, label)
  setBox(b.bg, b.box, highlight ? PANEL_ON : PANEL, 14)
  setBox(b.edge, b.box, highlight ? GOLD : EDGE, 14, true)
}

function hit(x, y, b) {
  return b.bg.v && inBox(x, y, b.box)
}

// ---------- fighters ----------
function opponentCfg() {
  return OPPONENTS[clamp(save.stage, 0, OPPONENTS.length - 1)]
}

function makeFighter(isPlayer, cfg) {
  return {
    isPlayer,
    cfg,
    name: isPlayer ? 'YOU' : cfg.name,
    color: isPlayer ? WHITE : cfg.color,
    outline: isPlayer ? 0 : cfg.outline || 0,
    dir: isPlayer ? 1 : -1,
    x: 0,
    kb: 0,
    hp: 100,
    maxHp: 100,
    st: 100,
    sup: 0,
    state: 'idle',
    t: 0,
    dur: 0,
    move: null,
    phase: null,
    phaseT: 0,
    moveId: 0,
    flash: 0,
    walkPh: 0,
    pose: POSES.stance.slice(),
    from: POSES.stance.slice(),
    buffer: null,
    ai: isPlayer ? null : { seen: 0, react: -1, think: 1 }
  }
}

function resetFighter(f, x) {
  f.x = x
  f.kb = 0
  f.hp = f.maxHp
  f.st = 100
  f.state = 'idle'
  f.t = 0
  f.move = null
  f.flash = 0
  f.buffer = null
  f.pose = POSES.stance.slice()
  if (f.ai) {
    f.ai.react = -1
    f.ai.think = 1
  }
}

function windScale(f) {
  if (f.isPlayer) return 1
  return Math.max(1.05, f.cfg.windup - 0.08 * save.tier)
}

function phaseTime(f, phase) {
  const m = MOVES[f.move]
  if (phase !== 'wind') return m[phase]
  return f.isPlayer ? m.wind : m.wind * windScale(f) + m.tell
}

function setState(f, state, dur) {
  f.from = f.pose.slice()
  f.state = state
  f.t = 0
  f.dur = dur || 0
  if (state !== 'move') {
    f.move = null
    f.phase = null
  }
}

function canAct(f) {
  return f.state === 'idle' || f.state === 'walk' || (f.state === 'guard' && f.t > 0.15)
}

function other(f) {
  return f === P ? E : P
}

function startMove(f, key) {
  const m = MOVES[key]
  if (!canAct(f)) return false
  if (f.st < m.cost) {
    if (f.st < EXHAUSTED) {
      // mashing on an empty tank: winded for a moment
      setState(f, 'stun', EXHAUST_TIME)
      floater(f, 'EXHAUSTED', RED)
    } else if (f.isPlayer) floater(f, 'TIRED', RED)
    return false
  }
  f.st -= m.cost
  if (key === 'super') f.sup = 0
  setState(f, 'move')
  f.move = key
  f.phase = 'wind'
  f.phaseT = 0
  f.moveId++
  return true
}

function startGuard(f) {
  if (!canAct(f) || f.state === 'guard') return false
  if (f.st < GUARD_COST) {
    if (f.isPlayer) floater(f, 'TIRED', RED)
    return false
  }
  f.st -= GUARD_COST
  setState(f, 'guard', GUARD_TIME)
  return true
}

function startBack(f) {
  if (!canAct(f) || f.st < BACK_COST) return false
  f.st -= BACK_COST
  setState(f, 'back', BACK_TIME)
  return true
}

// ---------- combat ----------
function resolveHit(a) {
  const d = other(a)
  const m = MOVES[a.move]
  const gap = Math.abs(d.x - a.x)
  if (gap > m.range) return // whiff: out of reach
  if (d.state === 'down' || d.state === 'getup' || d.state === 'ko') return // can't hit a fallen fighter
  const sx = d.x - a.dir * 14
  const sy = GROUND_C - m.hitY

  if (d.state === 'guard' && !m.unblock) {
    if (m.breaks) {
      damage(d, 4)
      setState(d, 'stun', 0.65)
      a.sup = Math.min(SUPER_MAX, a.sup + 10)
      floater(d, 'GUARD BREAK', GOLD)
      spark(sx, sy, GOLD, true)
      fx.shake = 0.15
      fx.hitStop = 0.08
      if (d.isPlayer) buzz()
      return
    }
    if (d.t <= PERFECT) {
      setState(a, 'stun', 0.6)
      a.kb = -a.dir * 140
      setState(d, 'idle')
      d.sup = Math.min(SUPER_MAX, d.sup + 20)
      floater(d, 'PARRY!', CYAN)
      spark(sx, sy, CYAN, true)
      fx.hitStop = 0.1
      return
    }
    damage(d, 1)
    d.st = Math.max(0, d.st - 6)
    d.kb = a.dir * 60
    a.kb = -a.dir * 30
    floater(d, 'BLOCK', DIM)
    spark(sx, sy, CYAN, false)
    return
  }

  const counter = d.state === 'move' && d.phase === 'wind'
  const scale = a.isPlayer ? 1 : 1 + 0.1 * save.tier
  const dmg = Math.round(m.dmg * (counter ? 1.5 : 1) * scale)
  d.flash = 0.15
  damage(d, dmg)
  d.kb = a.dir * m.kb * 5
  a.sup = Math.min(SUPER_MAX, a.sup + 12)
  d.sup = Math.min(SUPER_MAX, d.sup + 6)
  spark(sx, sy, d.isPlayer ? RED : GOLD, a.move !== 'jab')
  fx.hitStop = a.move === 'jab' ? 0.05 : 0.09
  fx.shake = a.move === 'jab' ? 0.06 : 0.14
  if (d.isPlayer) buzz()
  if (d.hp <= 0) {
    d.hp = 0
    setState(d, 'ko')
    d.kb = a.dir * 260
    endRound(a, 'K.O.!')
    return
  }
  if (counter) floater(d, 'COUNTER x1.5', GOLD)
  else if (a.move === 'super') floater(d, 'SUPER!', PURPLE)
  if (m.down) setState(d, 'down', DOWN_TIME)
  else setState(d, 'hurt', m.stun)
}

function damage(f, amount) {
  f.hp = Math.max(0, f.hp - amount)
}

function spark(x, y, color, big) {
  if (fx.sparks.length > 5) fx.sparks.shift()
  fx.sparks.push({ x, y, color, big, t: 0 })
}

// ---------- fighter update ----------
function updateFighter(f, dt) {
  const o = other(f)
  f.t += dt
  if (f.flash > 0) f.flash -= dt

  // stamina comes back while not busy
  if (f.state !== 'move' && f.state !== 'guard') f.st = Math.min(100, f.st + STAMINA_REGEN * dt)

  // knockback slides, then stops
  if (f.kb !== 0) {
    f.x += f.kb * dt
    f.kb *= Math.exp(-8 * dt)
    if (Math.abs(f.kb) < 6) f.kb = 0
  }

  switch (f.state) {
    case 'move': {
      f.phaseT += dt
      const m = MOVES[f.move]
      if (f.phase === 'wind') {
        if (m.lunge) f.x += (f.dir * m.lunge * dt) / phaseTime(f, 'wind')
        if (f.phaseT >= phaseTime(f, 'wind')) {
          f.phase = 'act'
          f.phaseT = 0
          resolveHit(f)
        }
      } else if (f.phase === 'act') {
        if (f.phaseT >= m.act) {
          f.phase = 'rec'
          f.phaseT = 0
        }
      } else if (f.phaseT >= m.rec) setState(f, 'idle')
      break
    }
    case 'guard':
    case 'hurt':
    case 'stun':
      if (f.t >= f.dur) setState(f, 'idle')
      break
    case 'back':
      f.x -= f.dir * BACK_SPEED * dt
      if (f.t >= f.dur) setState(f, 'idle')
      break
    case 'down':
      if (f.t >= f.dur && match.phase !== 'end') setState(f, 'getup', GETUP_TIME)
      break
    case 'getup':
      if (f.t >= f.dur) setState(f, 'idle')
      break
    case 'idle':
    case 'walk': {
      const gap = Math.abs(o.x - f.x)
      const walking = gap > GAP + 2 && match.phase !== 'end'
      if (walking) {
        f.x += f.dir * WALK_SPEED * dt
        f.walkPh += dt * 13
        if (f.state !== 'walk') {
          f.from = f.pose.slice()
          f.state = 'walk'
          f.t = 0
        }
      } else if (f.state === 'walk') setState(f, 'idle')
      break
    }
  }

  // a buffered swipe fires as soon as the fighter is free
  if (f.buffer) {
    f.buffer.t -= dt
    if (f.buffer.t <= 0) f.buffer = null
    else if (canAct(f) && match.phase === 'fight') {
      const b = f.buffer.action
      f.buffer = null
      doAction(f, b)
    }
  }

  // a fallen fighter's head lies ~55 px behind the hips: keep it on screen
  const lying = f.state === 'down' || f.state === 'ko' || f.state === 'getup'
  const back = lying ? 30 : 0
  f.x = f.dir > 0 ? clamp(f.x, ARENA_L + back, ARENA_R) : clamp(f.x, ARENA_L, ARENA_R - back)
}

// keep the two fighters apart and in their own halves
function separate() {
  const gap = E.x - P.x
  if (gap < MIN_GAP) {
    const push = (MIN_GAP - gap) / 2
    P.x -= push
    E.x += push
    if (P.x < ARENA_L) {
      E.x += ARENA_L - P.x
      P.x = ARENA_L
    }
    if (E.x > ARENA_R) {
      P.x -= E.x - ARENA_R
      E.x = ARENA_R
    }
  }
}

// ---------- poses ----------
function targetPose(f) {
  switch (f.state) {
    case 'move': {
      const m = MOVES[f.move]
      const st = f.from
      const W1 = POSES[m.poses[0]]
      let A = POSES[m.poses[1]]
      if (f.move === 'super' && f.phase === 'act') A = Math.floor(f.phaseT / 0.06) % 2 ? POSES.superA2 : POSES.superA1
      if (f.phase === 'wind') return lerpPose(st, W1, ease(f.phaseT / phaseTime(f, 'wind')))
      if (f.phase === 'act') return A // snap to the strike so it shows even during the impact freeze
      const end = f.move === 'super' ? POSES.superR : A
      const k = f.phaseT / m.rec
      if (f.move === 'super') return k < 0.5 ? lerpPose(A, end, ease(k * 2)) : lerpPose(end, POSES.stance, ease((k - 0.5) * 2))
      return lerpPose(A, POSES.stance, ease(k))
    }
    case 'walk': {
      const s = Math.sin(f.walkPh)
      const p = POSES.stance.slice()
      p[5] = 8 + 22 * s
      p[6] = p[5] - 12
      p[7] = -8 - 22 * s
      p[8] = p[7] - 12
      return p
    }
    case 'guard':
      return POSES.guard
    case 'hurt':
      return POSES.hurt
    case 'stun': {
      const p = POSES.stun.slice()
      p[0] += Math.sin(f.t * 9) * 8
      return p
    }
    case 'down':
    case 'ko':
      return POSES.down
    case 'getup':
      return POSES.getup
    case 'back':
      return POSES.back
    case 'win': {
      const p = POSES.win.slice()
      p[1] += Math.sin(f.t * 8) * 10
      p[3] -= Math.sin(f.t * 8) * 10
      return p
    }
    default: {
      const p = POSES.stance.slice()
      p[0] += Math.sin(f.t * 4) * 2 // breathing
      p[2] += Math.sin(f.t * 4) * 4
      return p
    }
  }
}

function updatePose(f, dt) {
  const target = targetPose(f)
  if (f.state === 'move') {
    f.pose = target // attacks follow their keyframes exactly
    return
  }
  const fast = f.state === 'hurt' || f.state === 'down' || f.state === 'ko' || f.state === 'stun'
  const k = 1 - Math.exp(-(fast ? 26 : 16) * dt)
  f.pose = lerpPose(f.pose, target, k)
}

// ---------- drawing the fighters (canvas) ----------
const D2R = Math.PI / 180

function limb(o, a, len, dir) {
  return [o[0] + dir * Math.sin(a * D2R) * len, o[1] + Math.cos(a * D2R) * len]
}

function line(x1, y1, x2, y2, color) {
  x1 = Math.round(x1)
  y1 = Math.round(y1)
  x2 = Math.round(x2)
  y2 = Math.round(y2)
  if (lineOk) {
    try {
      cv.drawLine({ x1, y1, x2, y2, color })
      return
    } catch (e) {
      lineOk = false
      console.log('STICK DUEL drawLine failed, using dots: ' + e)
    }
  }
  // fallback: a chain of dots
  const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / 3))
  for (let i = 0; i <= n; i++) cv.drawCircle({ center_x: Math.round(x1 + ((x2 - x1) * i) / n), center_y: Math.round(y1 + ((y2 - y1) * i) / n), radius: 2, color })
}

function paint(color, width) {
  try {
    cv.setPaint({ color, line_width: width })
  } catch (e) {
    // older firmware: lines stay thin
  }
}

function drawFighter(f, ox, oy) {
  const p = f.pose
  const dir = f.dir
  const hip = [0, 0]
  const ta = 180 - p[0]
  const sh = limb(hip, ta, TORSO, dir)
  const head = limb(sh, ta, NECK + HEAD, dir)
  const fe = limb(sh, p[1], UPPER_ARM, dir)
  const fh = limb(fe, p[2], FOREARM, dir)
  const be = limb(sh, p[3], UPPER_ARM, dir)
  const bh = limb(be, p[4], FOREARM, dir)
  const fk = limb(hip, p[5], THIGH, dir)
  const ff = limb(fk, p[6], SHIN, dir)
  const bk = limb(hip, p[7], THIGH, dir)
  const bf = limb(bk, p[8], SHIN, dir)
  let low = head[1] + HEAD
  const pts = [sh, fe, fh, be, bh, fk, ff, bk, bf]
  for (let i = 0; i < pts.length; i++) if (pts[i][1] > low) low = pts[i][1]
  const X = f.x + ox
  const Y = GROUND_C - low + oy

  // shadow on the floor
  cv.drawRect({ x1: Math.round(X - 22), y1: GROUND_C + 1, x2: Math.round(X + 22), y2: GROUND_C + 4, color: 0x080a14 })

  const flash = f.flash > 0
  const main = flash ? WHITE : f.color
  const far = flash ? 0xdddddd : f.outline ? f.color : mixColor(f.color, 0.62)
  const segs = [
    [hip, bk, far], [bk, bf, far], [sh, be, far], [be, bh, far],
    [hip, sh, main],
    [hip, fk, main], [fk, ff, main], [sh, fe, main], [fe, fh, main]
  ]
  const headX = Math.round(X + head[0])
  const headY = Math.round(Y + head[1])
  if (f.outline && !flash) {
    // the champion gets a glowing outline: thick lines first, the body on top
    paint(f.outline, LIMB_W + 4)
    for (let i = 0; i < segs.length; i++) line(X + segs[i][0][0], Y + segs[i][0][1], X + segs[i][1][0], Y + segs[i][1][1], f.outline)
    cv.drawCircle({ center_x: headX, center_y: headY, radius: HEAD + 2, color: f.outline })
  }
  let current = -1
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    if (s[2] !== current) {
      current = s[2]
      paint(current, i === 4 ? LIMB_W + 1 : LIMB_W)
    }
    line(X + s[0][0], Y + s[0][1], X + s[1][0], Y + s[1][1], s[2])
  }
  cv.drawCircle({ center_x: headX, center_y: headY, radius: HEAD, color: main })
  // eye: a dark dot on the facing side
  cv.drawCircle({ center_x: Math.round(X + head[0] + dir * 5), center_y: Math.round(Y + head[1] - 2), radius: 2, color: f.outline ? f.outline : SKY })

  // guard shield: a curved bar in front (gold during the parry window)
  if (f.state === 'guard') {
    const perfect = f.t <= PERFECT
    const c = perfect ? GOLD : CYAN
    paint(c, perfect ? 4 : 3)
    const gx = X + sh[0] + dir * 28
    const gy = Y + sh[1] + 8
    const arc = [[-6, -34], [2, -18], [5, 0], [2, 18], [-6, 34]]
    for (let i = 0; i < arc.length - 1; i++) line(gx + dir * arc[i][0], gy + arc[i][1], gx + dir * arc[i + 1][0], gy + arc[i + 1][1], c)
  }
  // dizzy stars
  if (f.state === 'stun') {
    for (let i = 0; i < 2; i++) {
      const a = f.t * 7 + i * Math.PI
      cv.drawCircle({ center_x: Math.round(X + head[0] + Math.cos(a) * 16), center_y: Math.round(Y + head[1] - 16 + Math.sin(a) * 4), radius: 3, color: GOLD })
    }
  }
  // super ready: a little glow ring over the head
  if (f.sup >= SUPER_MAX && f.state !== 'ko' && frame % 6 < 3) {
    try {
      cv.strokeCircle({ center_x: Math.round(X + head[0]), center_y: Math.round(Y + head[1]), radius: HEAD + 5, color: PURPLE })
    } catch (e) {
      // not available: skip the glow
    }
  }
}

function drawSparks(ox, oy) {
  for (let i = 0; i < fx.sparks.length; i++) {
    const s = fx.sparks[i]
    const k = s.t / 0.25
    const r0 = (s.big ? 6 : 4) + k * 6
    const r1 = (s.big ? 18 : 11) + k * 10
    paint(s.color, s.big ? 4 : 3)
    for (let j = 0; j < 6; j++) {
      const a = (j * Math.PI) / 3 + (s.big ? 0.3 : 0)
      line(s.x + ox + Math.cos(a) * r0, s.y + oy + Math.sin(a) * r0, s.x + ox + Math.cos(a) * r1, s.y + oy + Math.sin(a) * r1, s.color)
    }
    if (k < 0.4) cv.drawCircle({ center_x: Math.round(s.x + ox), center_y: Math.round(s.y + oy), radius: s.big ? 7 : 4, color: WHITE })
  }
}

let canvasFailures = 0
function renderCanvas() {
  try {
    cv.clear({ x: 0, y: 0, w: W, h: CV_H })
    if (screen === 'howto') return
    const ox = fx.shake > 0 ? (frame % 2 ? 3 : -3) : 0
    // draw the one being hit/fallen first so the attacker is on top
    const order = P.state === 'move' ? [E, P] : [P, E]
    drawFighter(order[0], ox, 0)
    drawFighter(order[1], ox, 0)
    drawSparks(ox, 0)
    canvasFailures = 0
  } catch (e) {
    canvasFailures++
    if (canvasFailures === 1 || canvasFailures % 50 === 0) console.log('STICK DUEL canvas error: ' + e)
  }
}

// ---------- the NPC brain ----------
function aiUpdate(e, p, dt) {
  const a = e.ai
  const c = e.cfg
  const tier = save.tier

  // 0. remember how often the player attacks (spam detector, decays over ~2 s)
  a.spam = (a.spam || 0) * Math.exp(-dt / 2)

  // 1. notice the player's attack and maybe respond after a reaction delay
  if (p.state === 'move' && p.moveId !== a.seen) {
    a.seen = p.moveId
    a.spam += 1
    a.readDone = false
    a.react = Math.random() < Math.min(0.9, c.defend + 0.05 * tier) ? Math.max(0.15, c.react - 0.03 * tier) * rnd(0.8, 1.25) : -1
    // if not defending, maybe plan to hit back while they recover
    a.punishPlan = a.react < 0 && Math.random() < Math.min(0.9, c.punish + 0.05 * tier)
  }
  if (a.punishPlan && p.state === 'move' && p.phase === 'rec' && p.phaseT >= Math.min(0.12, c.react * 0.4)) {
    a.punishPlan = false
    if (canAct(e) && Math.abs(e.x - p.x) <= MOVES.jab.range && e.st >= MOVES.jab.cost + 2) {
      startMove(e, 'jab')
      return
    }
  }
  if (a.react > 0) {
    a.react -= dt
    if (a.react <= 0) {
      a.react = -1
      if (p.state === 'move' && p.phase !== 'rec' && canAct(e)) {
        // kicks break guard, so dodge them instead; guard everything else
        if (p.move === 'kick' || p.move === 'super') startBack(e)
        else startGuard(e)
        return
      }
    }
  }

  // 1b. a player who keeps jabbing gets read: guard just before the next one lands = parry
  if (!a.readDone && a.spam >= 2.5 && p.state === 'move' && p.move === 'jab' && p.phase === 'rec' && p.phaseT > MOVES.jab.rec - 0.1) {
    a.readDone = true
    if (Math.random() < c.read + 0.15 && canAct(e)) {
      startGuard(e)
      return
    }
  }

  // 2. otherwise decide something every so often
  a.think -= dt
  if (a.think > 0 || !canAct(e)) return
  a.think = Math.max(0.2, c.think - 0.04 * tier) * rnd(0.6, 1.3)
  const gap = Math.abs(e.x - p.x)
  if (gap > MOVES.jab.range + 4) return // still walking in

  if (e.sup >= SUPER_MAX && (c.super || tier > 0) && Math.random() < 0.5) {
    startMove(e, 'super')
    return
  }
  if (e.st < MOVES.jab.cost + 2) return // catch a breath rather than get winded
  const open = p.state === 'stun' || p.state === 'hurt' || (p.state === 'move' && p.phase === 'rec')
  if (open && Math.random() < c.punish) {
    startMove(e, p.state === 'stun' ? 'kick' : 'jab')
    return
  }
  if (p.state === 'guard' && Math.random() < c.read) {
    startMove(e, 'kick')
    return
  }
  if (Math.random() < Math.min(0.9, c.aggro + 0.05 * tier)) {
    const w = { jab: 0.45, sweep: 0.25, kick: 0.3 }
    if (c.likes) w[c.likes] += 0.4
    let r = Math.random() * (w.jab + w.sweep + w.kick)
    const pick = (r -= w.jab) < 0 ? 'jab' : (r -= w.sweep) < 0 ? 'sweep' : 'kick'
    startMove(e, pick)
    return
  }
  const r = Math.random()
  if (r < 0.25) startGuard(e)
  else if (r < 0.35) startBack(e)
}

// ---------- the match ----------
function startMatch() {
  const cfg = opponentCfg()
  P = makeFighter(true, null)
  E = makeFighter(false, cfg)
  P.maxHp = PLAYER_HP
  E.maxHp = Math.round(cfg.hp * (1 + 0.15 * save.tier))
  match = { round: 0, pWins: 0, eWins: 0, time: ROUND_TIME, phase: 'intro', t: 0, winner: null, msg: '' }
  fx.sparks = []
  paused = false
  setScreen('fight')
  startRound()
}

function startRound() {
  match.round++
  match.time = ROUND_TIME
  match.phase = 'intro'
  match.t = 0
  match.winner = null
  resetFighter(P, W / 2 - 75)
  resetFighter(E, W / 2 + 75)
  P.sup = 0
  E.sup = 0
  fx.sparks = []
  fx.slowT = 0
}

function endRound(winner, msg) {
  if (match.phase === 'end') return
  match.phase = 'end'
  match.t = 0
  match.winner = winner
  match.msg = msg
  if (winner === P) match.pWins++
  else if (winner === E) match.eWins++
  if (msg === 'K.O.!') fx.slowT = 0.9
  if (winner === E) buzz()
}

function timeUp() {
  const pf = P.hp / P.maxHp
  const ef = E.hp / E.maxHp
  if (Math.abs(pf - ef) < 0.005) {
    endRound(null, 'DRAW')
    return
  }
  const w = pf > ef ? P : E
  setState(other(w), 'stun', 99)
  endRound(w, 'TIME')
}

function finishMatch() {
  const won = match.pWins >= ROUNDS_TO_WIN
  const cfg = opponentCfg()
  let title
  let sub
  if (won) {
    save.wins++
    save.stage++
    if (save.stage >= OPPONENTS.length) {
      save.stage = 0
      save.tier++
      save.titles++
      title = 'CHAMPION!'
      sub = 'You beat all six. The ladder starts again, tougher (+' + save.tier + ').'
    } else {
      title = 'VICTORY'
      sub = cfg.name + ' is down. Next up: ' + opponentCfg().name + ' - ' + opponentCfg().tag
    }
    resultActions = [['NEXT FIGHT', startMatch], ['MENU', () => setScreen('menu')]]
  } else {
    save.losses++
    title = 'DEFEAT'
    sub = cfg.name + ' wins ' + match.eWins + '-' + match.pWins + '. Try guarding their jabs and kicking their guard.'
    resultActions = [['RETRY', startMatch], ['MENU', () => setScreen('menu')]]
  }
  writeSave()
  showDialog(title, won ? GOLD : RED, sub, resultActions)
  screen = 'result'
}

function updateMatch(dt) {
  match.t += dt
  if (match.phase === 'intro') {
    if (match.t >= 1.6) {
      match.phase = 'fight'
      match.t = 0
    }
  } else if (match.phase === 'fight') {
    match.time -= dt
    if (match.time <= 0) {
      match.time = 0
      timeUp()
    }
  } else if (match.phase === 'end') {
    const w = match.winner
    if (w && match.t >= 0.8 && w.state !== 'win' && w.state !== 'ko' && (canAct(w) || w.state === 'guard')) setState(w, 'win')
    if (match.t >= 2.4) {
      if (match.pWins >= ROUNDS_TO_WIN || match.eWins >= ROUNDS_TO_WIN) finishMatch()
      else startRound()
    }
  }
}

// ---------- input ----------
function doAction(f, action) {
  if (action === 'guard') return startGuard(f)
  return startMove(f, action)
}

function playerAction(action) {
  if (screen !== 'fight' || paused || match.phase !== 'fight') return
  if (P.state === 'ko' || P.state === 'win') return
  if (canAct(P)) doAction(P, action)
  else P.buffer = { action, t: 0.3 } // remember it for a moment
}

function onSwipe(dir, src) {
  const t = now()
  // the touch layer and the system gesture can both report the same swipe
  if (t - lastSwipe.t < 350 && lastSwipe.dir === dir && lastSwipe.src !== src) return
  lastSwipe = { t, dir, src }
  if (screen === 'fight') {
    const map = { right: 'jab', up: 'kick', down: 'sweep', left: 'guard' }
    playerAction(map[dir])
  } else if (screen === 'howto' && dir === 'right') setScreen('menu')
}

function onTap(x, y) {
  if (screen === 'menu') {
    if (hit(x, y, ui.play)) startMatch()
    else if (hit(x, y, ui.howBtn)) setScreen('howto')
    return
  }
  if (screen === 'howto') {
    if (hit(x, y, ui.howBack)) setScreen('menu')
    return
  }
  if (screen === 'result' || paused) {
    const d = ui.dialog
    for (let i = 0; i < d.buttons.length; i++) {
      if (hit(x, y, d.buttons[i]) && d.actions[i]) {
        const fn = d.actions[i][1]
        hideDialog()
        fn()
        return
      }
    }
    return
  }
  if (screen === 'fight') {
    if (inBox(x, y, ui.timerBox)) {
      pause()
      return
    }
    if (P.sup >= SUPER_MAX) playerAction('super')
  }
}

function pause() {
  if (paused || screen !== 'fight') return
  paused = true
  showDialog('PAUSED', WHITE, 'vs ' + E.name + '  -  round ' + match.round, [
    ['RESUME', () => { paused = false }],
    ['QUIT', () => { paused = false; setScreen('menu') }]
  ])
}

function handleTouch(kind, e) {
  try {
    if (!e || typeof e.x !== 'number' || typeof e.y !== 'number') return
    if (kind === 'down') {
      touch = { x: e.x, y: e.y, done: false }
      return
    }
    if (!touch) return
    const dx = e.x - touch.x
    const dy = e.y - touch.y
    const dist = Math.hypot(dx, dy)
    const dirOf = () => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
    if (kind === 'move') {
      if (!touch.done && dist >= SWIPE_EARLY) {
        touch.done = true
        onSwipe(dirOf(), 't')
      }
      return
    }
    // up
    if (!touch.done) {
      if (dist >= SWIPE_MIN) onSwipe(dirOf(), 't')
      else onTap(touch.x, touch.y)
    }
    touch = null
  } catch (err) {
    showError('touch', err)
  }
}

// System swipes: during a fight every direction is a move (and swipe right must not close the app).
function onGesture4(ev) {
  const dir = ev === GESTURE_RIGHT ? 'right' : ev === GESTURE_LEFT ? 'left' : ev === GESTURE_UP ? 'up' : ev === GESTURE_DOWN ? 'down' : ''
  if (!dir) return false
  if (screen === 'fight' && !paused) {
    onSwipe(dir, 'g')
    return true
  }
  if (screen === 'howto' && dir === 'right') {
    onSwipe(dir, 'g')
    return true
  }
  return false // menu / result: normal system behaviour (swipe right leaves the app)
}

// ---------- screens ----------
function setScreen(name) {
  screen = name
  const groups = ui.groups
  for (const k in groups) {
    const on = k === name || (k === 'fight' && name === 'result')
    groups[k].forEach((o) => setVisible(o, on))
  }
  if (name !== 'result' && !paused) hideDialog()
  if (name === 'menu') prepareMenu()
  if (name === 'howto') renderCanvas()
}

function prepareMenu() {
  const cfg = opponentCfg()
  P = makeFighter(true, null)
  E = makeFighter(false, cfg)
  P.x = 64
  E.x = W - 64
  match = { phase: 'menu' }
  fx.sparks = []
  fx.shake = 0
  fx.hitStop = 0
  fx.slowT = 0
  styleButton(ui.play, save.wins + save.losses > 0 ? 'FIGHT' : 'PLAY', true)
  styleButton(ui.howBtn, 'HOW TO PLAY', false)
  setText(ui.nextText, 'Next: ' + cfg.name + '  (' + (save.stage + 1) + '/' + OPPONENTS.length + ')' + (save.tier ? '  +' + save.tier : ''))
  setText(ui.recordText, save.wins + ' wins  ' + save.losses + ' losses' + (save.titles ? '  -  ' + save.titles + (save.titles === 1 ? ' title' : ' titles') : ''))
}

function showDialog(title, color, sub, actions) {
  const d = ui.dialog
  d.actions = actions
  setText(d.title, title)
  setColor(d.title, color)
  setText(d.sub, sub)
  ;[d.panel, d.edge, d.title, d.sub].forEach((o) => setVisible(o, true))
  d.buttons.forEach((b, i) => {
    const on = i < actions.length
    buttonParts(b).forEach((o) => setVisible(o, on))
    if (on) styleButton(b, actions[i][0], i === 0)
  })
}

function hideDialog() {
  const d = ui.dialog
  if (!d) return
  ;[d.panel, d.edge, d.title, d.sub].forEach((o) => setVisible(o, false))
  d.buttons.forEach((b) => buttonParts(b).forEach((o) => setVisible(o, false)))
  d.actions = []
}

// ---------- building the screen (once) ----------
function buildScreen() {
  const bg = mkRect(0, 0, W, H, SKY, 0)
  bg.w.addEventListener(event.CLICK_DOWN, (e) => handleTouch('down', e)) // backup if taps fall through
  bg.w.addEventListener(event.CLICK_UP, (e) => handleTouch('up', e))

  const groundY = CV_Y + GROUND_C
  // --- the stage: a faint moon, two pillars and the floor (static widgets behind the canvas) ---
  mkCircle(W / 2, groundY - 150, 70, MOON)
  mkRect(26, 120, 22, groundY - 120, PILLAR, 4)
  mkRect(W - 48, 120, 22, groundY - 120, PILLAR, 4)
  mkRect(16, 112, 42, 10, FLOOR_EDGE, 3)
  mkRect(W - 58, 112, 42, 10, FLOOR_EDGE, 3)
  mkRect(0, groundY, W, H - groundY, FLOOR, 0)
  mkRect(0, groundY, W, 2, FLOOR_EDGE, 0)
  for (let x = 30; x < W; x += 60) mkRect(x, groundY + 14, 30, 2, 0x22273f, 1)

  // --- the fight strip: the only canvas ---
  cv = createWidget(widget.CANVAS, { x: 0, y: CV_Y, w: W, h: CV_H })

  ui.groups = { fight: [], menu: [], howto: [] }

  // --- fight HUD ---
  const g = ui.groups.fight
  const barW = 136
  ui.pName = mkText(34, 32, 150, 24, 16, WHITE, align.LEFT)
  ui.eName = mkText(W - 184, 32, 150, 24, 16, WHITE, align.RIGHT)
  ui.pHpBack = mkRect(34, 58, barW, 12, BAR_BACK, 6)
  ui.eHpBack = mkRect(W - 34 - barW, 58, barW, 12, BAR_BACK, 6)
  ui.pHp = mkRect(34, 58, barW, 12, GREEN, 6)
  ui.eHp = mkRect(W - 34 - barW, 58, barW, 12, GREEN, 6)
  ui.pSt = mkRect(34, 73, barW, 4, STAMINA, 2)
  ui.eSt = mkRect(W - 34 - barW, 73, barW, 4, STAMINA, 2)
  ui.pDots = [0, 1].map((i) => mkCircle(40 + i * 16, 88, 5, LOCKED))
  ui.eDots = [0, 1].map((i) => mkCircle(W - 40 - i * 16, 88, 5, LOCKED))
  ui.timerBox = { x: W / 2 - 34, y: 6, w: 68, h: 64 }
  ui.timerBg = mkCircle(W / 2, 38, 25, PANEL)
  ui.timerText = mkText(W / 2 - 30, 22, 60, 32, 24, WHITE)
  ui.pauseHint = mkText(W / 2 - 30, 64, 60, 16, 11, LOCKED)
  setText(ui.pauseHint, 'pause')
  ui.big = mkText(0, 140, W, 52, 42, WHITE)
  ui.bigSub = mkText(0, 190, W, 24, 17, DIM)
  ui.pFloat = mkText(10, 112, W / 2 - 10, 26, 18, WHITE)
  ui.eFloat = mkText(W / 2, 112, W / 2 - 10, 26, 18, WHITE)
  ui.supBack = mkRect(W / 2 - 85, 400, 170, 14, BAR_BACK, 7)
  ui.sup = mkRect(W / 2 - 85, 400, 170, 14, PURPLE, 7)
  ui.supText = mkText(W / 2 - 85, 396, 170, 22, 13, WHITE)
  ui.hint = mkText(0, 420, W, 18, 12, LOCKED)
  g.push(ui.pName, ui.eName, ui.pHpBack, ui.eHpBack, ui.pHp, ui.eHp, ui.pSt, ui.eSt, ...ui.pDots, ...ui.eDots)
  g.push(ui.timerBg, ui.timerText, ui.pauseHint, ui.big, ui.bigSub, ui.pFloat, ui.eFloat, ui.supBack, ui.sup, ui.supText, ui.hint)
  ui.floats = { p: { o: ui.pFloat, t: 0 }, e: { o: ui.eFloat, t: 0 } }

  // --- menu ---
  const m = ui.groups.menu
  ui.title = mkText(0, 44, W, 56, 44, WHITE)
  setText(ui.title, 'STICK DUEL')
  ui.subtitle = mkText(0, 96, W, 24, 16, DIM)
  setText(ui.subtitle, 'swipe to strike - swipe away to guard')
  ui.play = mkButton(W / 2 - 90, 140, 180, 54, 26)
  ui.howBtn = mkButton(W / 2 - 90, 204, 180, 44, 18)
  ui.nextText = mkText(W / 2 - 100, 258, 200, 22, 15, GOLD)
  ui.recordText = mkText(W / 2 - 110, 282, 220, 20, 13, DIM)
  m.push(ui.title, ui.subtitle, ui.nextText, ui.recordText, ...buttonParts(ui.play), ...buttonParts(ui.howBtn))

  // --- how to play ---
  const h = ui.groups.howto
  ui.howTitle = mkText(0, 30, W, 36, 26, GOLD)
  setText(ui.howTitle, 'HOW TO FIGHT')
  ui.howRows = [
    ['SWIPE RIGHT', 'JAB - fast poke', WHITE],
    ['SWIPE UP', 'KICK - breaks guard', WHITE],
    ['SWIPE DOWN', 'SWEEP - knocks down', WHITE],
    ['SWIPE LEFT', 'GUARD - stops jab, sweep', CYAN]
  ].map(([k, v, c], i) => {
    const y = 72 + i * 34
    const a = mkText(38, y, 130, 30, 15, GOLD, align.LEFT)
    const b = mkText(160, y, 200, 30, 15, c, align.LEFT)
    setText(a, k)
    setText(b, v)
    h.push(a, b)
    return [a, b]
  })
  ui.howText = mkText(40, 210, W - 80, 160, 14, DIM, align.CENTER_H, true)
  setText(ui.howText, 'Guard right as a hit lands to PARRY. Hit a foe mid wind-up for a COUNTER (x1.5). Moves use stamina (yellow bar). When SUPER is full, TAP. Tap the timer to pause.')
  ui.howBack = mkButton(W / 2 - 70, 376, 140, 44, 18)
  styleButton(ui.howBack, 'BACK', true)
  h.push(ui.howTitle, ui.howText, ...buttonParts(ui.howBack))

  // --- dialog (pause / result) ---
  ui.dialog = {
    panel: mkRect(W / 2 - 145, 104, 290, 236, PANEL, 18),
    edge: mkStroke(W / 2 - 145, 104, 290, 236, EDGE, 18),
    title: mkText(W / 2 - 145, 116, 290, 44, 34, WHITE),
    sub: mkText(W / 2 - 132, 160, 264, 60, 14, DIM, align.CENTER_H, true),
    buttons: [0, 1].map((i) => mkButton(W / 2 - 105, 226 + i * 54, 210, 46, 20)),
    actions: []
  }
  hideDialog()

  // --- touch layer: an empty full-screen text widget on top of everything ---
  ui.touch = createWidget(widget.TEXT, { x: 0, y: 0, w: W, h: H, text: '', text_size: 10, color: SKY })
  ui.touch.addEventListener(event.CLICK_DOWN, (e) => handleTouch('down', e))
  ui.touch.addEventListener(event.MOVE, (e) => handleTouch('move', e))
  ui.touch.addEventListener(event.CLICK_UP, (e) => handleTouch('up', e))
}

// ---------- HUD (only what changed) ----------
function hpColor(f) {
  const k = f.hp / f.maxHp
  return k > 0.5 ? GREEN : k > 0.25 ? GOLD : RED
}

function floater(f, text, color) {
  const fl = f.isPlayer ? ui.floats.p : ui.floats.e
  setText(fl.o, text)
  setColor(fl.o, color)
  setVisible(fl.o, true)
  fl.t = 0.75
}

function renderHud(dt) {
  const barW = 136
  setText(ui.pName, 'YOU')
  setText(ui.eName, E.name + (save.tier ? ' +' + save.tier : ''))
  setColor(ui.eName, E.outline || E.color)
  setBar(ui.pHp, 34, 58, barW, 12, P.hp / P.maxHp, hpColor(P), false)
  setBar(ui.eHp, W - 34 - barW, 58, barW, 12, E.hp / E.maxHp, hpColor(E), true)
  setBar(ui.pSt, 34, 73, barW, 4, P.st / 100, P.st < 22 ? RED : STAMINA, false)
  setBar(ui.eSt, W - 34 - barW, 73, barW, 4, E.st / 100, E.st < 22 ? RED : STAMINA, true)
  ui.pDots.forEach((o, i) => setDot(o, 40 + i * 16, 88, 5, i < match.pWins ? GOLD : LOCKED))
  ui.eDots.forEach((o, i) => setDot(o, W - 40 - i * 16, 88, 5, i < match.eWins ? GOLD : LOCKED))
  setText(ui.timerText, String(Math.ceil(match.time)))
  setColor(ui.timerText, match.time <= 10 && match.phase === 'fight' ? RED : WHITE)

  // the super bar
  const full = P.sup >= SUPER_MAX
  setBar(ui.sup, W / 2 - 85, 400, 170, 14, P.sup / SUPER_MAX, full ? (frame % 6 < 3 ? GOLD : PURPLE) : PURPLE, false)
  setText(ui.supText, full ? 'TAP FOR SUPER!' : 'SUPER')
  setColor(ui.supText, full ? 0x1a1030 : DIM)

  // centre messages
  let big = ''
  let sub = ''
  let col = WHITE
  if (match.phase === 'intro') {
    if (match.t < 1.05) {
      big = match.round === 1 ? 'ROUND 1' : match.pWins === 1 && match.eWins === 1 ? 'FINAL ROUND' : 'ROUND ' + match.round
      sub = match.round === 1 ? 'vs ' + E.name + ' - ' + E.cfg.tag : ''
    } else {
      big = 'FIGHT!'
      col = GOLD
    }
  } else if (match.phase === 'end') {
    big = match.msg
    col = match.msg === 'K.O.!' ? RED : GOLD
    if (match.t > 0.8) sub = match.winner === P ? 'you take the round' : match.winner === E ? E.name + ' takes the round' : 'no winner - replay'
  }
  setText(ui.big, big)
  setColor(ui.big, col)
  setVisible(ui.big, big !== '')
  setText(ui.bigSub, sub)
  setVisible(ui.bigSub, sub !== '')

  setText(ui.hint, match.round === 1 && match.phase !== 'end' && match.time > ROUND_TIME - 12 ? 'right jab  up kick  down sweep  left guard' : '')

  for (const k in ui.floats) {
    const fl = ui.floats[k]
    if (fl.t > 0) {
      fl.t -= dt
      if (fl.t <= 0) setVisible(fl.o, false)
    }
  }
}

// ---------- the loop ----------
function tick() {
  try {
    const t = now()
    let dt = (t - lastTick) / 1000
    lastTick = t
    dt = clamp(dt, 0, MAX_DT)
    frame++
    update(dt)
    if (screen !== 'howto') renderCanvas()
    if (screen === 'fight' || screen === 'result') renderHud(dt)
  } catch (e) {
    showError('tick', e)
  }
}

function update(dt) {
  if (screen === 'menu') {
    P.t += dt
    E.t += dt
    updatePose(P, dt)
    updatePose(E, dt)
    return
  }
  if ((screen !== 'fight' && screen !== 'result') || paused) return

  if (fx.shake > 0) fx.shake -= dt
  for (let i = fx.sparks.length - 1; i >= 0; i--) {
    fx.sparks[i].t += dt
    if (fx.sparks[i].t > 0.25) fx.sparks.splice(i, 1)
  }
  if (fx.hitStop > 0) {
    fx.hitStop -= dt // freeze-frame on impact
    return
  }
  let sdt = dt
  if (fx.slowT > 0) {
    fx.slowT -= dt
    sdt = dt * 0.35 // slow motion on a K.O.
  }

  if (screen === 'fight') updateMatch(sdt)
  if (screen !== 'fight' && screen !== 'result') return // the match may have ended into the menu
  if (match.phase === 'fight') aiUpdate(E, P, sdt)
  updateFighter(P, sdt)
  updateFighter(E, sdt)
  separate()
  updatePose(P, sdt)
  updatePose(E, sdt)
}

// ---------- errors ----------
function showError(where, e) {
  const stack = e && e.stack ? String(e.stack).slice(0, 300) : ''
  const msg = where + ' / ' + step + ': ' + (e && e.message ? e.message : String(e)) + '\n' + stack
  console.log('STICK DUEL ERROR ' + msg)
  try {
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
      CX = W / 2
      // the fight strip: from just above head height down to under the floor line
      CV_Y = Math.round(H * 0.435)
      CV_H = Math.round(H * 0.432)
      GROUND_C = Math.round(H * 0.827) - CV_Y
      ARENA_L = 44
      ARENA_R = W - 44

      step = 'setStatusBarVisible'
      try {
        setStatusBarVisible(false)
      } catch (e) {
        console.log('STICK DUEL could not hide status bar: ' + e)
      }

      step = 'setPageBrightTime'
      setPageBrightTime({ brightTime: 600000 }) // keep the screen on while playing (10 min)

      step = 'load save'
      storage = new LocalStorage()
      loadSave()

      step = 'build screen'
      buildScreen()
      setScreen('menu')

      step = 'onGesture'
      try {
        onGesture({ callback: onGesture4 })
      } catch (e) {
        console.log('STICK DUEL could not listen for swipes: ' + e)
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
    resetPageBrightTime()
  }
})
