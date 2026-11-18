// Alchemist's Cauldron — a merge puzzle for Zepp OS (API 4.0, built for Amazfit Bip 6)
//
// PLAY:  Swipe up, down, left or right: every ingredient in the cauldron slides that way.
//        Two of the same ingredient that bump together melt into the next one up the recipe
//        (herb -> toadstool -> dewdrop -> ... -> Philosopher's Stone -> ...). Each swipe adds
//        a new ingredient. The brew ends when nothing can move.
//        * CATALYST (pink star): appears now and then; it melts into ANY ingredient it touches
//          and raises that ingredient one level.
//        * STIRRING SPOON (top right): undo the last move. Real steps you walk earn spoons.
//        * Menu button (top left): pause, recipe book, settings, main menu.
// MENU:  continue, new brew, recipe book (every ingredient you have discovered), how to play,
//        settings (vibration on/off, strength, merge buzz, bubbles, keep the screen awake).
//
// Swipe right on a menu screen goes back. While brewing every swipe is a move, so swipe right
// never closes the app by accident. The brew and the records are saved on the watch.
//
// Drawing: no canvas. A full-screen PNG scene (with a transparent hole) sits over a coloured
// "liquid" rect; tiles are a small pool of IMG widgets that move with prop.X / prop.Y. All tile
// sprites are 84x84 with the tile centred, so changing size (spawn / merge pop) never moves them.
// Art comes from tools/art.cjs.

import { createWidget, widget, event, prop, align, text_style, setStatusBarVisible } from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { LocalStorage } from '@zos/storage'
import { setPageBrightTime, resetPageBrightTime } from '@zos/display'
import { Time, Step, Vibrator, VIBRATOR_SCENE_SHORT_LIGHT, VIBRATOR_SCENE_SHORT_MIDDLE, VIBRATOR_SCENE_SHORT_STRONG } from '@zos/sensor'
import { onGesture, offGesture, GESTURE_UP, GESTURE_DOWN, GESTURE_LEFT, GESTURE_RIGHT } from '@zos/interaction'

// ---------- rules ----------
const N = 4
const CAT = 99 // the catalyst
const CAP = 14 // highest ingredient (two of these no longer merge)
const STONE = 11 // the Philosopher's Stone: brewing it wins (you may keep going)
const CAT_CHANCE = 0.04 // chance that a new ingredient is a catalyst
const CAT_MIN_MOVES = 8 // no catalyst in the first moves
const LEVEL2_CHANCE = 0.1 // chance that a new ingredient is a toadstool instead of a herb
const START_SPOONS = 2
const MAX_SPOONS = 3
const STEPS_PER_SPOON = 1500
const UNDO_DEPTH = 3 // how many moves the spoon can stir back in a row
const NAMES = ['', 'HERB', 'TOADSTOOL', 'DEWDROP', 'CRYSTAL', 'EMBER', 'MOONSTONE', 'POTION', 'ELIXIR', 'DRAGON EGG', 'PHOENIX PLUME', "PHILOSOPHER'S STONE", 'STARHEART', 'NEBULA', 'ETERNITY']
const SHORT = ['', 'HERB', 'TOADSTOOL', 'DEWDROP', 'CRYSTAL', 'EMBER', 'MOONSTONE', 'POTION', 'ELIXIR', 'DRAGON EGG', 'PHOENIX', 'STONE', 'STARHEART', 'NEBULA', 'ETERNITY']

// ---------- layout (390 x 450) ----------
const TILE = 70
const GAP = 6
const STEP_PX = TILE + GAP
const BX = 46 // first tile, top-left
const BY = 90
const SPR = 7 // tile sprites are 84x84 with the 70x70 tile centred
const HOLE = { x: 34, y: 76, w: 322, h: 324 }
const MENU_BTN = { x: 48, y: 10, w: 44, h: 44 }
const SPOON_BTN = { x: 298, y: 10, w: 44, h: 44 }
const SCORE_BOX = { x: 112, y: 8, w: 166, h: 48 }
const POOL = 20
const BUBBLES = 6

// ---------- timing ----------
const TICK_MS = 30
const SLIDE_MS = 105
const POP_MS = 110
const SPAWN_MS = 90
const TOAST_MS = 1800
const SWIPE_MIN = 24
const SWIPE_EARLY = 40
const STEP_POLL_MS = 30000

// ---------- colours ----------
const BG = 0x150f26
const PANEL = 0x2a2046
const PANEL_HI = 0x3a2e5e
const LINE = 0x4a3c78
const WHITE = 0xffffff
const DIM = 0x9a90c8
const GOLD = 0xffd060
const GREEN = 0x5dff9a
const RED = 0xff6070
const INK = 0x1a1226
// the liquid changes colour as the brew grows: [from level, liquid, slot]
const LIQUIDS = [
  [0, 0x1f5a3a, 0x17442c],
  [4, 0x1a5466, 0x13404e],
  [6, 0x3a2a7a, 0x2c205e],
  [8, 0x6a1f5a, 0x521846],
  [10, 0x7a3a1a, 0x5e2c14],
  [11, 0x5a3c0c, 0x442c08]
]

// ---------- state ----------
let W = 390
let H = 450
let CX = 195
let storage = null
let timeSensor = null
let stepSensor = null
let vibrator = null
let timer = null
let step = 'start'
let meta = null
let game = null
let screen = 'menu' // menu | play | ov (an overlay over the game or the menu)
let ov = null // the open overlay: { kind, back, outside, actions: [{box, fn}], panel }
let board = [] // tile objects per cell (or null)
let anim = null
let pending = null // an overlay to open when the animation ends: { fn, at }
let touch = null
let lastSwipe = { t: 0, dir: '', src: '' }
let toastUntil = 0
let lastBubble = 0
let lastStepPoll = 0
let confirmKey = ''
let howPage = 0
let nextTileId = 1
const ui = {}

function now() {
  try {
    if (!timeSensor) timeSensor = new Time()
    return timeSensor.getTime()
  } catch (e) {
    return Date.now()
  }
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
function fmt(n) {
  const s = String(Math.floor(n))
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (i && (s.length - i) % 3 === 0) out += ','
    out += s[i]
  }
  return out
}
const valueOf = (lvl) => (lvl === CAT ? 0 : Math.pow(2, lvl))
function tileSrc(lvl, v) {
  return (lvl === CAT ? 'tc_' : 't' + lvl + '_') + v + '.png'
}

// ---------- saving ----------
function freshMeta() {
  return {
    v: 1,
    best: 0,
    disc: 2, // highest ingredient ever brewed (herb and toadstool are known from the start)
    stones: 0,
    games: 0,
    sawCat: false,
    spoons: START_SPOONS,
    stepAcc: 0,
    lastSteps: -1,
    lastDay: '',
    vib: { on: true, power: 1, merges: true },
    bubbles: true,
    awake: true
  }
}
function loadAll() {
  meta = freshMeta()
  game = null
  try {
    const raw = storage.getItem('meta', '')
    if (raw) {
      const m = JSON.parse(raw)
      meta = Object.assign(freshMeta(), m)
      meta.vib = Object.assign(freshMeta().vib, m.vib || {})
    }
  } catch (e) {
    console.log('CAULDRON could not read records: ' + e)
  }
  try {
    const raw = storage.getItem('game', '')
    if (raw) {
      const g = JSON.parse(raw)
      if (g && g.cells && g.cells.length === N * N) game = g
    }
  } catch (e) {
    console.log('CAULDRON could not read the brew: ' + e)
  }
}
function saveMeta() {
  try {
    storage.setItem('meta', JSON.stringify(meta))
  } catch (e) {
    console.log('CAULDRON save failed: ' + e)
  }
}
function saveGame() {
  try {
    storage.setItem('game', game ? JSON.stringify(game) : '')
  } catch (e) {
    console.log('CAULDRON save failed: ' + e)
  }
}

// ---------- vibration ----------
// kind: merge (every merge, can be muted) | big (discoveries, spoons) | end (win, brew over) | test
function buzz(kind) {
  const v = meta.vib
  if (!v.on) return
  if (kind === 'merge' && !v.merges) return
  const base = kind === 'end' ? 2 : kind === 'big' || kind === 'test' ? 1 : 0
  const lvl = clamp(base + v.power - 1, 0, 2)
  try {
    if (!vibrator) vibrator = new Vibrator()
    vibrator.stop()
    vibrator.start({ mode: lvl === 2 ? VIBRATOR_SCENE_SHORT_STRONG : lvl === 1 ? VIBRATOR_SCENE_SHORT_MIDDLE : VIBRATOR_SCENE_SHORT_LIGHT })
  } catch (e) {
    // no vibration: play silently
  }
}

function applyAwake() {
  try {
    if (meta.awake) setPageBrightTime({ brightTime: 600000 })
    else resetPageBrightTime()
  } catch (e) {
    // the watch decides
  }
}

// ---------- steps -> spoons ----------
function today() {
  try {
    if (!timeSensor) timeSensor = new Time()
    return timeSensor.getFullYear() + '-' + timeSensor.getMonth() + '-' + timeSensor.getDate()
  } catch (e) {
    return ''
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
// returns how many spoons were earned
function pollSteps() {
  lastStepPoll = now()
  const cur = readSteps()
  if (cur < 0) return 0
  const day = today()
  let delta = 0
  if (meta.lastSteps < 0) delta = 0 // first run: only steps from now on count
  else if (day !== meta.lastDay || cur < meta.lastSteps) delta = cur // a new day: today's steps so far
  else delta = cur - meta.lastSteps
  meta.lastSteps = cur
  meta.lastDay = day
  let earned = 0
  if (meta.spoons < MAX_SPOONS) {
    meta.stepAcc += delta
    while (meta.stepAcc >= STEPS_PER_SPOON && meta.spoons < MAX_SPOONS) {
      meta.stepAcc -= STEPS_PER_SPOON
      meta.spoons++
      earned++
    }
  }
  if (meta.spoons >= MAX_SPOONS) meta.stepAcc = 0
  if (delta) saveMeta()
  return earned
}
function spoonLine() {
  if (meta.spoons >= MAX_SPOONS) return 'spoons ' + meta.spoons + '/' + MAX_SPOONS + '  (full)'
  return 'spoons ' + meta.spoons + '/' + MAX_SPOONS + '  ·  next in ' + fmt(STEPS_PER_SPOON - meta.stepAcc) + ' steps'
}

// ---------- the brew (pure rules) ----------
function canMerge(a, b) {
  if (!a || !b) return false
  if (a === CAT && b === CAT) return false
  if (a === CAT) return b < CAP
  if (b === CAT) return a < CAP
  return a === b && a < CAP
}
function mergedLevel(a, b) {
  if (a === CAT) return b + 1
  if (b === CAT) return a + 1
  return a + 1
}
function canMove(cells) {
  for (let i = 0; i < N * N; i++) {
    if (!cells[i]) return true
    const r = Math.floor(i / N)
    const c = i % N
    if (c < N - 1 && canMerge(cells[i], cells[i + 1])) return true
    if (r < N - 1 && canMerge(cells[i], cells[i + N])) return true
  }
  return false
}
function maxLevel(cells) {
  let m = 0
  for (const v of cells) if (v !== CAT && v > m) m = v
  return m
}
// the cells of each line, in the order tiles travel (leading edge first)
function lines(dir) {
  const out = []
  for (let a = 0; a < N; a++) {
    const line = []
    for (let b = 0; b < N; b++) {
      if (dir === 'left') line.push(a * N + b)
      else if (dir === 'right') line.push(a * N + (N - 1 - b))
      else if (dir === 'up') line.push(b * N + a)
      else line.push((N - 1 - b) * N + a)
    }
    out.push(line)
  }
  return out
}
function pickSpawn(cells) {
  const empty = []
  for (let i = 0; i < N * N; i++) if (!cells[i]) empty.push(i)
  if (!empty.length) return null
  const at = empty[Math.floor(Math.random() * empty.length)]
  let lvl = Math.random() < LEVEL2_CHANCE ? 2 : 1
  if (game && game.moves >= CAT_MIN_MOVES && cells.indexOf(CAT) < 0 && Math.random() < CAT_CHANCE) lvl = CAT
  return { at, lvl }
}

// ---------- tiles on screen ----------
function cellX(i) {
  return BX + (i % N) * STEP_PX - SPR
}
function cellY(i) {
  return BY + Math.floor(i / N) * STEP_PX - SPR
}
function takeWidget() {
  for (let k = 0; k < POOL; k++) if (!ui.pool[k].used) {
    ui.pool[k].used = true
    return k
  }
  return -1
}
function newTile(lvl, cell, variant) {
  const t = { id: nextTileId++, lvl, cell, wi: takeWidget() }
  if (t.wi >= 0) {
    const o = ui.pool[t.wi]
    setSrc(o, tileSrc(lvl, variant || 'n'))
    setPos(o, cellX(cell), cellY(cell))
    setVisible(o, true)
  }
  return t
}
function dropTile(t) {
  if (t.wi < 0) return
  const o = ui.pool[t.wi]
  o.used = false
  setVisible(o, false)
  t.wi = -1
}
function tileVariant(t, v) {
  if (t.wi >= 0) setSrc(ui.pool[t.wi], tileSrc(t.lvl, v))
}
function tileAt(t, x, y) {
  if (t.wi >= 0) setPos(ui.pool[t.wi], x, y)
}
// rebuild every tile widget from game.cells (new game, load, undo)
function syncTiles() {
  anim = null
  ui.pool.forEach((o) => {
    o.used = false
    setVisible(o, false)
  })
  board = []
  for (let i = 0; i < N * N; i++) board.push(game && game.cells[i] ? newTile(game.cells[i], i, 'n') : null)
  updateLiquid()
  updateHud()
}

// ---------- moves ----------
function newGame() {
  game = { cells: new Array(N * N).fill(0), score: 0, moves: 0, won: false, over: false, hist: [] }
  for (let k = 0; k < 2; k++) {
    const s = pickSpawn(game.cells)
    game.cells[s.at] = s.lvl === CAT ? 1 : s.lvl
  }
  meta.games++
  saveMeta()
  saveGame()
  syncTiles()
}

function move(dir) {
  if (!game || game.over) return
  if (anim) finishAnim()
  const cells = game.cells
  const next = new Array(N * N).fill(0)
  const nextBoard = new Array(N * N).fill(null)
  const slides = [] // { t, from, to, dies }
  const merged = [] // tiles that grew
  let moved = false
  let gained = 0
  let top = 0
  for (const line of lines(dir)) {
    let pos = 0
    let last = null // { cell, lvl, tile, merged }
    for (let k = 0; k < N; k++) {
      const from = line[k]
      const lvl = cells[from]
      if (!lvl) continue
      const t = board[from]
      if (last && !last.merged && canMerge(last.lvl, lvl)) {
        const nl = mergedLevel(last.lvl, lvl)
        last.lvl = nl
        last.merged = true
        next[last.cell] = nl
        gained += valueOf(nl)
        if (nl > top) top = nl
        moved = true
        // the tile that is already in place keeps its widget and grows; the newcomer slides in and melts
        slides.push({ t, from, to: last.cell, dies: true })
        merged.push({ t: last.tile, lvl: nl })
      } else {
        const to = line[pos++]
        if (to !== from) moved = true
        next[to] = lvl
        nextBoard[to] = t
        slides.push({ t, from, to, dies: false })
        last = { cell: to, lvl, tile: t, merged: false }
      }
    }
  }
  if (!moved) return

  game.hist.push({ cells: cells.slice(), score: game.score, moves: game.moves })
  while (game.hist.length > UNDO_DEPTH) game.hist.shift()
  game.cells = next
  game.score += gained
  game.moves++
  const spawn = pickSpawn(next)
  if (spawn) next[spawn.at] = spawn.lvl
  if (spawn && spawn.lvl === CAT && !meta.sawCat) {
    meta.sawCat = true
    toast('A CATALYST appeared!', 0xff8ae0)
  }

  // records, discoveries, buzz
  let discovered = 0
  if (top > meta.disc && top <= CAP) {
    meta.disc = top
    discovered = top
  }
  if (game.score > meta.best) meta.best = game.score
  let won = false
  if (top >= STONE && !game.won) {
    game.won = true
    meta.stones++
    won = true
  }
  if (!canMove(next)) game.over = true
  saveGame()
  saveMeta()
  if (won) buzz('end')
  else if (discovered) buzz('big')
  else if (merged.length) buzz('merge')
  if (discovered && discovered >= 3) toast('NEW: ' + NAMES[discovered], GOLD)

  // animation: slide, then grow the merged tiles and drop the new ingredient in
  for (const s of slides) s.t.cell = s.to
  const spawnTile = spawn ? { lvl: spawn.lvl, at: spawn.at, tile: null } : null
  board = nextBoard
  anim = { t0: now(), slides, merged, spawn: spawnTile, stage: 0 }
  if (game.over) pending = { fn: showGameOver, delay: 450 }
  else if (won) pending = { fn: showWin, delay: 350 }
  updateHud()
}

function stepAnim() {
  const a = anim
  const e = now() - a.t0
  if (a.stage === 0) {
    const p = clamp(e / SLIDE_MS, 0, 1)
    const k = 1 - (1 - p) * (1 - p)
    for (const s of a.slides) {
      const x = cellX(s.from) + (cellX(s.to) - cellX(s.from)) * k
      const y = cellY(s.from) + (cellY(s.to) - cellY(s.from)) * k
      tileAt(s.t, Math.round(x), Math.round(y))
    }
    if (p < 1) return
    // landed
    for (const s of a.slides) if (s.dies) dropTile(s.t)
    for (const m of a.merged) {
      m.t.lvl = m.lvl
      tileVariant(m.t, 'p')
    }
    if (a.spawn) {
      a.spawn.tile = newTile(a.spawn.lvl, a.spawn.at, 's1')
      board[a.spawn.at] = a.spawn.tile
    }
    updateLiquid()
    a.stage = 1
    return
  }
  const e2 = e - SLIDE_MS
  if (a.spawn && a.spawn.tile && a.stage === 1 && e2 >= SPAWN_MS / 2) {
    tileVariant(a.spawn.tile, 's2')
    a.stage = 2
  }
  if (e2 >= Math.max(POP_MS, SPAWN_MS)) finishAnim()
}

// jump straight to the end of the animation (a new swipe arrived, or it finished)
function finishAnim() {
  const a = anim
  if (!a) return
  anim = null
  if (a.stage === 0) {
    for (const s of a.slides) {
      if (s.dies) dropTile(s.t)
      else tileAt(s.t, cellX(s.to), cellY(s.to))
    }
    for (const m of a.merged) m.t.lvl = m.lvl
    if (a.spawn) {
      a.spawn.tile = newTile(a.spawn.lvl, a.spawn.at, 'n')
      board[a.spawn.at] = a.spawn.tile
    }
    updateLiquid()
  }
  for (const m of a.merged) {
    tileAt(m.t, cellX(m.t.cell), cellY(m.t.cell))
    tileVariant(m.t, 'n')
  }
  if (a.spawn && a.spawn.tile) tileVariant(a.spawn.tile, 'n')
}

function undo() {
  if (!game || !game.hist.length) {
    toast('Nothing to stir back', DIM)
    return
  }
  if (meta.spoons <= 0) {
    toast('No spoons: walk ' + fmt(STEPS_PER_SPOON - meta.stepAcc) + ' steps', DIM)
    return
  }
  const h = game.hist.pop()
  game.cells = h.cells
  game.score = h.score
  game.moves = h.moves
  game.over = false
  meta.spoons--
  if (meta.spoons < MAX_SPOONS && meta.stepAcc < 0) meta.stepAcc = 0
  pending = null
  saveGame()
  saveMeta()
  syncTiles()
  buzz('merge')
}

// ---------- widget wrappers (every update goes through a "did it change?" check) ----------
function wrap(w, extra) {
  return Object.assign({ w, v: true, t: null, c: null, m: null }, extra || {})
}
function mkText(x, y, w, h, size, color, alignH, wrapText) {
  const o = { x, y, w, h, text: '', text_size: size, color, align_h: alignH === undefined ? align.CENTER_H : alignH, align_v: align.CENTER_V }
  if (wrapText) o.text_style = text_style.WRAP
  return wrap(createWidget(widget.TEXT, o), { c: color })
}
function mkRect(x, y, w, h, color, radius) {
  return wrap(createWidget(widget.FILL_RECT, { x, y, w, h, radius: radius || 0, color }), { c: color })
}
function mkStroke(x, y, w, h, color, radius, lw) {
  return wrap(createWidget(widget.STROKE_RECT, { x, y, w, h, radius: radius || 0, line_width: lw || 2, color }), { c: color })
}
function mkImg(x, y, src) {
  return wrap(createWidget(widget.IMG, { x, y, src }), { x, y, src })
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
function setBox(o, b, color, radius) {
  setMore(o, b.x + ',' + b.y + ',' + b.w + ',' + b.h + ',' + color + ',' + radius, { x: b.x, y: b.y, w: b.w, h: b.h, radius, color })
  o.c = color
}
function setTextBox(o, b, size) {
  setMore(o, b.x + ',' + b.y + ',' + b.w + ',' + b.h + ',' + size, { x: b.x, y: b.y, w: b.w, h: b.h, text_size: size })
}
function setSrc(o, src) {
  if (o.src === src) return
  o.src = src
  o.w.setProperty(prop.SRC, src)
}
function setPos(o, x, y) {
  if (o.x !== x) {
    o.x = x
    o.w.setProperty(prop.X, x)
  }
  if (o.y !== y) {
    o.y = y
    o.w.setProperty(prop.Y, y)
  }
}

// ---------- building the screen (once) ----------
function buildScreen() {
  mkRect(0, 0, W, H, BG, 0)

  // --- the cauldron: liquid, slots, bubbles, scene, tiles ---
  ui.game = []
  const g = (o) => (ui.game.push(o), o)
  ui.liquid = g(mkRect(HOLE.x, HOLE.y, HOLE.w, HOLE.h, LIQUIDS[0][1], 24))
  ui.slots = []
  for (let i = 0; i < N * N; i++) ui.slots.push(g(mkRect(BX + (i % N) * STEP_PX, BY + Math.floor(i / N) * STEP_PX, TILE, TILE, LIQUIDS[0][2], 15)))
  ui.bubbles = []
  for (let k = 0; k < BUBBLES; k++) {
    const b = g(mkImg(60 + k * 50, 380 - k * 50, 'bubble.png'))
    b.bx = 60 + k * 50
    b.by = 380 - k * 50
    b.sp = 0.5 + Math.random() * 0.6
    b.ph = Math.random() * 6
    ui.bubbles.push(b)
  }
  g(mkImg(0, 0, 'bg.png'))
  ui.pool = []
  for (let k = 0; k < POOL; k++) {
    const o = g(mkImg(0, 0, 't1_n.png'))
    o.used = false
    setVisible(o, false)
    ui.pool.push(o)
  }

  // --- top bar ---
  ui.menuBg = g(mkRect(MENU_BTN.x, MENU_BTN.y, MENU_BTN.w, MENU_BTN.h, PANEL, 22))
  for (let k = 0; k < 3; k++) g(mkRect(MENU_BTN.x + 13, MENU_BTN.y + 14 + k * 7, 18, 3, WHITE, 1))
  ui.scoreBg = g(mkRect(SCORE_BOX.x, SCORE_BOX.y, SCORE_BOX.w, SCORE_BOX.h, PANEL, 24))
  ui.scoreLbl = g(mkText(SCORE_BOX.x, SCORE_BOX.y + 3, SCORE_BOX.w, 18, 13, DIM))
  setText(ui.scoreLbl, 'SCORE')
  ui.score = g(mkText(SCORE_BOX.x, SCORE_BOX.y + 18, SCORE_BOX.w, 30, 24, WHITE))
  ui.spoonBg = g(mkRect(SPOON_BTN.x, SPOON_BTN.y, SPOON_BTN.w, SPOON_BTN.h, PANEL, 22))
  ui.spoonImg = g(mkImg(SPOON_BTN.x + 6, SPOON_BTN.y + 6, 'spoon.png'))
  ui.spoonDot = g(mkRect(SPOON_BTN.x + 28, SPOON_BTN.y + 28, 20, 20, GOLD, 10))
  ui.spoonNum = g(mkText(SPOON_BTN.x + 28, SPOON_BTN.y + 28, 20, 20, 14, INK))
  // the toast covers the top bar; kept clear of the rounded screen corners
  ui.toastBg = g(mkRect(56, 8, W - 112, 48, GOLD, 24))
  ui.toast = g(mkText(60, 8, W - 120, 48, 15, INK))
  setVisible(ui.toastBg, false)
  setVisible(ui.toast, false)

  // --- the title-screen backdrop (covers the cauldron while in the menu) ---
  ui.menuScene = mkImg(0, 0, 'menu.png')
  ui.menuBubbles = []
  for (let k = 0; k < 4; k++) {
    const b = mkImg(90 + k * 64, 330, 'bubble.png')
    b.bx = 90 + k * 64
    b.by = 330 - k * 22
    b.sp = 0.35 + Math.random() * 0.4
    b.ph = Math.random() * 6
    ui.menuBubbles.push(b)
  }

  // --- overlays (pause, game over, settings, how to, menu buttons) ---
  ui.shade = mkRect(0, 0, W, H, BG, 0)
  ui.panel = mkRect(0, 0, 10, 10, PANEL, 28)
  ui.panelLine = mkStroke(0, 0, 10, 10, LINE, 28, 2)
  ui.title = mkText(20, 20, W - 40, 40, 30, WHITE)
  ui.title2 = mkText(20, 20, W - 40, 30, 20, GOLD)
  ui.sub = mkText(30, 60, W - 60, 26, 15, DIM)
  ui.body = mkText(40, 90, W - 80, 260, 18, WHITE, align.CENTER_H, true)
  ui.btns = []
  for (let k = 0; k < 7; k++) {
    ui.btns.push({
      bg: mkRect(0, 0, 10, 10, PANEL_HI, 20),
      label: mkText(0, 0, 10, 10, 18, WHITE),
      labelL: mkText(0, 0, 10, 10, 16, WHITE, align.LEFT),
      value: mkText(0, 0, 10, 10, 16, GOLD, align.RIGHT)
    })
  }
  ui.foot = mkText(30, 380, W - 60, 24, 14, DIM)
  ui.foot2 = mkText(30, 404, W - 60, 24, 14, DIM)

  // --- recipe book ---
  ui.book = []
  for (let k = 0; k <= CAP; k++) {
    const col = k % 2
    const row = Math.floor(k / 2)
    const x = k === CAP ? CX - 70 : col ? 206 : 40 // the catalyst gets the last row to itself
    const y = 60 + row * 42
    const lvl = k === CAP ? CAT : k + 1
    ui.book.push({
      lvl,
      img: mkImg(x + 18 - 42, y + 20 - 42, tileSrc(lvl, 's1')),
      lock: mkRect(x + 3, y + 5, 30, 30, PANEL_HI, 9),
      name: mkText(x + 42, y, 128, 40, 14, WHITE, align.LEFT)
    })
  }

  hideOverlay()

  // touch layer: an empty full-screen TEXT widget created last, so it is on top of everything
  ui.touch = createWidget(widget.TEXT, { x: 0, y: 0, w: W, h: H, text: '', text_size: 10, color: BG })
  ui.touch.addEventListener(event.CLICK_DOWN, (e) => handleTouch('down', e))
  ui.touch.addEventListener(event.MOVE, (e) => handleTouch('move', e))
  ui.touch.addEventListener(event.CLICK_UP, (e) => handleTouch('up', e))
}

// ---------- the play screen ----------
function updateLiquid() {
  const top = game ? maxLevel(game.cells) : 0
  let pick = LIQUIDS[0]
  for (const l of LIQUIDS) if (top >= l[0]) pick = l
  setColor(ui.liquid, pick[1])
  ui.slots.forEach((s) => setColor(s, pick[2]))
}
function updateHud() {
  setText(ui.score, game ? fmt(game.score) : '0')
  setColor(ui.score, game && game.score && game.score >= meta.best ? GOLD : WHITE)
  setText(ui.spoonNum, String(meta.spoons))
  setColor(ui.spoonDot, meta.spoons ? GOLD : LINE)
  setColor(ui.spoonNum, meta.spoons ? INK : DIM)
}
function toast(text, color) {
  setText(ui.toast, text)
  setColor(ui.toastBg, color || GOLD)
  setVisible(ui.toastBg, true)
  setVisible(ui.toast, true)
  toastUntil = now() + TOAST_MS
}
function updateBubbles(list, top, bottom) {
  const t = now() / 1000
  for (const b of list) {
    b.by -= b.sp * 3
    if (b.by < top) {
      b.by = bottom
      b.bx = list === ui.bubbles ? 46 + Math.floor(Math.random() * 300) : 70 + Math.floor(Math.random() * 236)
      b.sp = 0.5 + Math.random() * 0.6
    }
    setPos(b, Math.round(b.bx + Math.sin(t * 2 + b.ph) * 4), Math.round(b.by))
  }
}

// ---------- overlays ----------
function hideOverlay() {
  ov = null
  ;[ui.shade, ui.panel, ui.panelLine, ui.title, ui.title2, ui.sub, ui.body, ui.foot, ui.foot2].forEach((o) => setVisible(o, false))
  ui.btns.forEach((b) => [b.bg, b.label, b.labelL, b.value].forEach((o) => setVisible(o, false)))
  ui.book.forEach((e) => [e.img, e.lock, e.name].forEach((o) => setVisible(o, false)))
}

// cfg: { kind, scene: 'menu' | 'shade' | 'game', panel: box, title, title2, titleY, titleColor, sub, subY, body, bodyBox,
//        buttons: [{ label, value, fn, hi, dim, color }], btnY, btnH, gap, btnW, foot, foot2, footY, back, outside }
function showOverlay(cfg) {
  hideOverlay()
  confirmKey = cfg.keepConfirm ? confirmKey : ''
  screen = cfg.kind === 'play' ? 'play' : 'ov'
  ov = { kind: cfg.kind, back: cfg.back || null, outside: cfg.outside || null, actions: [], panel: cfg.panel || null }
  setVisible(ui.menuScene, cfg.scene === 'menu')
  ui.menuBubbles.forEach((b) => setVisible(b, cfg.scene === 'menu' && meta.bubbles))
  setVisible(ui.shade, cfg.scene === 'shade')
  if (cfg.panel) {
    setBox(ui.panel, cfg.panel, PANEL, 28)
    setBox(ui.panelLine, cfg.panel, LINE, 28)
    setVisible(ui.panel, true)
    setVisible(ui.panelLine, true)
  }
  let y = cfg.titleY || 24
  if (cfg.title2) {
    setTextBox(ui.title2, { x: 20, y, w: W - 40, h: 28 }, 20)
    setText(ui.title2, cfg.title2)
    setColor(ui.title2, GOLD)
    setVisible(ui.title2, true)
    y += 26
  }
  if (cfg.title) {
    setTextBox(ui.title, { x: 20, y, w: W - 40, h: 42 }, cfg.titleSize || 30)
    setText(ui.title, cfg.title)
    setColor(ui.title, cfg.titleColor || WHITE)
    setVisible(ui.title, true)
  }
  if (cfg.sub) {
    setTextBox(ui.sub, { x: 30, y: cfg.subY || y + 40, w: W - 60, h: 26 }, 15)
    setText(ui.sub, cfg.sub)
    setColor(ui.sub, cfg.subColor || DIM)
    setVisible(ui.sub, true)
  }
  if (cfg.body) {
    const b = cfg.bodyBox || { x: 40, y: 92, w: W - 80, h: 270 }
    setTextBox(ui.body, b, cfg.bodySize || 18)
    setText(ui.body, cfg.body)
    setVisible(ui.body, true)
  }
  const btns = cfg.buttons || []
  const bh = cfg.btnH || 40
  const gap = cfg.gap || 48
  btns.forEach((d, k) => {
    const u = ui.btns[k]
    const bw = d.w || cfg.btnW || 230
    const box = { x: Math.round(CX - bw / 2), y: (cfg.btnY || 120) + k * gap, w: bw, h: bh }
    const color = d.color || (d.hi ? 0x6a3fc8 : PANEL_HI)
    setBox(u.bg, box, color, bh / 2)
    setVisible(u.bg, true)
    // settings rows: label on the left, value on the right; other buttons: centred label
    const lab = d.value !== undefined ? u.labelL : u.label
    if (d.value !== undefined) {
      setTextBox(u.labelL, { x: box.x + 20, y: box.y, w: bw - 120, h: bh }, 16)
      setTextBox(u.value, { x: box.x + bw - 120, y: box.y, w: 100, h: bh }, 16)
      setText(u.value, d.value)
      setColor(u.value, d.dim ? DIM : d.on === false ? RED : GOLD)
      setVisible(u.value, true)
    } else setTextBox(u.label, box, d.size || 18)
    setText(lab, d.label)
    setColor(lab, d.dim ? DIM : d.labelColor || WHITE)
    setVisible(lab, true)
    ov.actions.push({ box, fn: d.fn })
  })
  if (cfg.foot) {
    setTextBox(ui.foot, { x: 30, y: cfg.footY || 380, w: W - 60, h: 24 }, 14)
    setText(ui.foot, cfg.foot)
    setColor(ui.foot, cfg.footColor || DIM)
    setVisible(ui.foot, true)
  }
  if (cfg.foot2) {
    setTextBox(ui.foot2, { x: 30, y: (cfg.footY || 380) + 24, w: W - 60, h: 24 }, 14)
    setText(ui.foot2, cfg.foot2)
    setVisible(ui.foot2, true)
  }
}

function play() {
  hideOverlay()
  setVisible(ui.menuScene, false)
  ui.menuBubbles.forEach((b) => setVisible(b, false))
  screen = 'play'
  updateHud()
}

// two taps to confirm anything that throws a brew away
function confirm(key, fn, redraw) {
  if (confirmKey === key) {
    confirmKey = ''
    fn()
  } else {
    confirmKey = key
    redraw()
  }
}
const brewInProgress = () => !!(game && !game.over && game.moves > 0)

function showMenu() {
  pending = null
  if (anim) finishAnim()
  const cont = !!(game && !game.over)
  const buttons = []
  if (cont) buttons.push({ label: 'CONTINUE', hi: true, fn: () => play() })
  buttons.push({
    label: confirmKey === 'menuNew' ? 'TAP AGAIN: NEW BREW' : 'NEW BREW',
    hi: !cont,
    color: confirmKey === 'menuNew' ? 0xa83a4a : undefined,
    fn: () => (brewInProgress() ? confirm('menuNew', startNew, () => showMenuKeep()) : startNew())
  })
  buttons.push({ label: 'RECIPE BOOK', fn: () => showBook(showMenu) })
  buttons.push({ label: 'HOW TO PLAY', fn: () => showHow(showMenu, 0) })
  buttons.push({ label: 'SETTINGS', fn: () => showSettings(showMenu) })
  showOverlay({
    kind: 'menu',
    scene: 'menu',
    keepConfirm: true,
    title2: "ALCHEMIST'S",
    title: 'CAULDRON',
    titleY: 22,
    titleSize: 34,
    buttons,
    btnY: cont ? 104 : 126,
    btnH: 38,
    gap: 45,
    btnW: 236,
    foot: meta.best ? 'BEST ' + fmt(meta.best) + (meta.stones ? '   ·   STONES ' + meta.stones : '') : 'brew the Philosopher’s Stone',
    foot2: spoonLine(),
    footY: 370,
    footColor: GOLD
  })
  screen = 'menu'
}
function showMenuKeep() {
  showMenu()
}
function startNew() {
  confirmKey = ''
  newGame()
  play()
}

function showPause() {
  if (anim) finishAnim()
  const panel = { x: 34, y: 64, w: W - 68, h: 352 }
  showOverlay({
    kind: 'pause',
    scene: 'game',
    keepConfirm: true,
    panel,
    title: 'PAUSED',
    titleY: 76,
    titleSize: 26,
    sub: 'best ' + fmt(meta.best) + '   ·   move ' + (game ? game.moves : 0),
    subY: 110,
    buttons: [
      { label: 'RESUME', hi: true, fn: () => play() },
      {
        label: confirmKey === 'pauseNew' ? 'TAP AGAIN: NEW BREW' : 'NEW BREW',
        color: confirmKey === 'pauseNew' ? 0xa83a4a : undefined,
        fn: () => (brewInProgress() ? confirm('pauseNew', startNew, () => showPause()) : startNew())
      },
      { label: 'RECIPE BOOK', fn: () => showBook(showPause) },
      { label: 'SETTINGS', fn: () => showSettings(showPause) },
      { label: 'MAIN MENU', fn: () => showMenu() }
    ],
    btnY: 142,
    btnH: 38,
    gap: 45,
    btnW: 240,
    foot: spoonLine(),
    footY: 370,
    back: () => play(),
    outside: () => play()
  })
}

function showGameOver() {
  buzz('end')
  const panel = { x: 34, y: 64, w: W - 68, h: 352 }
  const best = game.score >= meta.best && game.score > 0
  const buttons = []
  if (meta.spoons > 0 && game.hist.length) buttons.push({ label: 'STIR BACK  (' + meta.spoons + ' spoon' + (meta.spoons > 1 ? 's' : '') + ')', hi: true, fn: () => { undo(); play() } })
  buttons.push({ label: 'NEW BREW', hi: !buttons.length, fn: () => startNew() })
  buttons.push({ label: 'MAIN MENU', fn: () => showMenu() })
  showOverlay({
    kind: 'over',
    scene: 'game',
    panel,
    title2: 'THE BREW HAS SETTLED',
    title: fmt(game.score),
    titleY: 84,
    titleSize: 40,
    titleColor: best ? GOLD : WHITE,
    sub: best ? 'NEW BEST!' : 'best ' + fmt(meta.best),
    subColor: best ? GOLD : DIM,
    subY: 158,
    body: 'top ingredient: ' + NAMES[maxLevel(game.cells)],
    bodyBox: { x: 50, y: 186, w: W - 100, h: 30 },
    bodySize: 15,
    buttons,
    btnY: buttons.length > 2 ? 234 : 262,
    btnH: 40,
    gap: 48,
    btnW: 250
    // no swipe-back here: a last frantic swipe must not skip the result
  })
}

function showWin() {
  const panel = { x: 34, y: 64, w: W - 68, h: 352 }
  showOverlay({
    kind: 'win',
    scene: 'game',
    panel,
    title2: 'YOU BREWED THE',
    title: "PHILOSOPHER'S STONE",
    titleY: 84,
    titleSize: 22,
    titleColor: GOLD,
    body: 'The cauldron glows gold. Keep brewing: Starheart, Nebula and Eternity lie beyond.',
    bodyBox: { x: 54, y: 150, w: W - 108, h: 100 },
    bodySize: 16,
    buttons: [
      { label: 'KEEP BREWING', hi: true, fn: () => play() },
      { label: 'MAIN MENU', fn: () => showMenu() }
    ],
    btnY: 280,
    btnH: 40,
    gap: 50,
    btnW: 240,
    back: () => play(),
    outside: () => play()
  })
}

function showSettings(back) {
  const v = meta.vib
  const onOff = (b) => (b ? 'ON' : 'OFF')
  const change = (fn, test) => () => {
    fn()
    saveMeta()
    if (test) test()
    showSettings(back)
  }
  showOverlay({
    kind: 'settings',
    scene: 'shade',
    keepConfirm: true,
    title: 'SETTINGS',
    titleY: 20,
    titleSize: 26,
    buttons: [
      { label: 'VIBRATION', value: onOff(v.on), on: v.on, fn: change(() => (v.on = !v.on), () => buzz('test')) },
      { label: 'STRENGTH', value: ['LIGHT', 'MEDIUM', 'STRONG'][v.power], dim: !v.on, fn: change(() => (v.power = (v.power + 1) % 3), () => buzz('test')) },
      { label: 'MERGE BUZZ', value: onOff(v.merges), on: v.merges, dim: !v.on, fn: change(() => (v.merges = !v.merges), () => buzz('merge')) },
      { label: 'BUBBLES', value: onOff(meta.bubbles), on: meta.bubbles, fn: change(() => (meta.bubbles = !meta.bubbles)) },
      { label: 'KEEP AWAKE', value: onOff(meta.awake), on: meta.awake, fn: change(() => (meta.awake = !meta.awake), applyAwake) },
      {
        label: confirmKey === 'reset' ? 'TAP AGAIN TO RESET' : 'RESET RECORDS',
        value: '',
        labelColor: confirmKey === 'reset' ? RED : WHITE,
        fn: () => confirm('reset', () => { resetRecords(); showSettings(back) }, () => showSettings(back))
      },
      { label: 'BACK', hi: true, w: 150, fn: () => { confirmKey = ''; back() } }
    ],
    btnY: 66,
    btnH: 38,
    gap: 46,
    btnW: 290,
    back: () => { confirmKey = ''; back() }
  })
}
function resetRecords() {
  const keep = { vib: meta.vib, bubbles: meta.bubbles, awake: meta.awake, spoons: meta.spoons, stepAcc: meta.stepAcc, lastSteps: meta.lastSteps, lastDay: meta.lastDay }
  meta = Object.assign(freshMeta(), keep)
  saveMeta()
  toast('Records cleared', DIM)
}

function showBook(back) {
  showOverlay({
    kind: 'book',
    scene: 'shade',
    title: 'RECIPE BOOK',
    titleY: 16,
    titleSize: 24,
    foot: 'tap or swipe right to close',
    footY: 404,
    back,
    outside: back
  })
  ov.panel = { x: 0, y: 0, w: 0, h: 0 } // every tap is "outside"
  for (const e of ui.book) {
    const known = e.lvl === CAT ? !!meta.sawCat : e.lvl <= meta.disc
    setVisible(e.img, known)
    setVisible(e.lock, !known)
    setVisible(e.name, true)
    setText(e.name, known ? (e.lvl === CAT ? 'CATALYST' : SHORT[e.lvl]) : '? ? ?')
    setColor(e.name, !known ? DIM : e.lvl === CAT ? 0xff8ae0 : e.lvl === STONE ? GOLD : WHITE)
  }
}

function howPages() {
  return [
    ['SWIPE', 'Swipe in any direction: every ingredient in the cauldron slides that way.\n\nTwo of the same that bump together melt into the next one up the recipe.'],
    ['THE RECIPE', SHORT.slice(1, STONE + 1).join(' > ') + '\n\nBrew the ' + NAMES[STONE] + ' to win, then keep going.'],
    ['CATALYST', 'A pink star turns up about once in ' + Math.round(1 / CAT_CHANCE) + ' new ingredients (never in the first ' + CAT_MIN_MOVES + ' moves).\n\nIt melts into ANY ingredient it touches and raises it one level.'],
    ['STIRRING SPOON', 'Tap the spoon to undo a move (up to ' + UNDO_DEPTH + ' in a row). You start with ' + START_SPOONS + '.\n\nEvery ' + fmt(STEPS_PER_SPOON) + ' real steps you walk earns another spoon, up to ' + MAX_SPOONS + '.'],
    ['THE END', 'The brew settles when nothing can move.\n\nTap the menu button to pause. Your brew is saved whenever you leave.']
  ]
}
function showHow(back, page) {
  const pages = howPages()
  howPage = page
  const p = pages[page]
  showOverlay({
    kind: 'how',
    scene: 'shade',
    title: p[0],
    titleY: 30,
    titleSize: 26,
    titleColor: GOLD,
    body: p[1],
    bodyBox: { x: 40, y: 84, w: W - 80, h: 270 },
    bodySize: 18,
    foot: (page + 1) + ' / ' + pages.length + '   ·   tap: ' + (page + 1 < pages.length ? 'next' : 'done'),
    footY: 372,
    back: page > 0 ? () => showHow(back, page - 1) : back,
    outside: page + 1 < pages.length ? () => showHow(back, page + 1) : back
  })
  ov.panel = { x: 0, y: 0, w: 0, h: 0 }
}

// ---------- input ----------
function inBox(x, y, b) {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
}

function onTap(x, y) {
  if (screen === 'play') {
    if (inBox(x, y, { x: MENU_BTN.x - 8, y: 0, w: MENU_BTN.w + 16, h: MENU_BTN.h + 18 })) showPause()
    else if (inBox(x, y, { x: SPOON_BTN.x - 8, y: 0, w: SPOON_BTN.w + 16, h: SPOON_BTN.h + 18 })) undo()
    return
  }
  if (!ov) return
  for (const a of ov.actions) {
    if (inBox(x, y, a.box)) {
      a.fn()
      return
    }
  }
  if (ov.outside && (!ov.panel || !inBox(x, y, ov.panel))) ov.outside()
}

function onSwipe(dir, src) {
  const t = now()
  // the touch layer and the system gesture can both report the same swipe
  if (t - lastSwipe.t < 350 && lastSwipe.dir === dir && lastSwipe.src !== src) return
  lastSwipe = { t, dir, src }
  if (screen === 'play') {
    move(dir)
    return
  }
  if (dir === 'right' && ov && ov.back) ov.back()
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
      // in play a swipe counts as soon as it is long enough: snappier than waiting for the lift
      if (screen === 'play' && !touch.done && dist >= SWIPE_EARLY) {
        touch.done = true
        onSwipe(dirOf(), 't')
      }
      return
    }
    if (!touch.done) {
      if (dist >= SWIPE_MIN) onSwipe(dirOf(), 't')
      else onTap(touch.x, touch.y)
    }
    touch = null
  } catch (err) {
    showError('touch', err)
  }
}

// System swipes: while brewing every direction is a move, so swipe right must not close the app.
// On the main menu the system keeps its swipes (swipe right leaves the app).
function onGesture4(ev) {
  const dir = ev === GESTURE_RIGHT ? 'right' : ev === GESTURE_LEFT ? 'left' : ev === GESTURE_UP ? 'up' : ev === GESTURE_DOWN ? 'down' : ''
  if (!dir) return false
  if (screen === 'menu') return false
  onSwipe(dir, 'g')
  return true
}

// ---------- main loop ----------
function tick() {
  try {
    const t = now()
    if (anim) stepAnim()
    if (pending && !anim) {
      if (!pending.at) pending.at = t + pending.delay
      if (t >= pending.at) {
        const fn = pending.fn
        pending = null
        if (screen === 'play') fn()
      }
    }
    if (ui.toast.v && t > toastUntil) {
      setVisible(ui.toast, false)
      setVisible(ui.toastBg, false)
    }
    if (meta.bubbles && t - lastBubble > 90) {
      lastBubble = t
      if (screen === 'play' || (ov && ov.kind !== 'settings' && ov.kind !== 'book' && ov.kind !== 'how' && screen !== 'menu')) updateBubbles(ui.bubbles, 92, 388)
      if (screen === 'menu') updateBubbles(ui.menuBubbles, 250, 334)
    }
    ui.bubbles.forEach((b) => setVisible(b, meta.bubbles))
    if (t - lastStepPoll > STEP_POLL_MS) {
      const earned = pollSteps()
      if (earned) {
        updateHud()
        if (screen === 'play') toast('+' + earned + ' SPOON from your steps', GREEN)
        buzz('big')
      }
    }
  } catch (e) {
    showError('tick', e)
  }
}

function showError(where, e) {
  const msg = where + ' / ' + step + ': ' + (e && e.message ? e.message : String(e))
  console.log('CAULDRON ERROR ' + msg)
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
      CX = Math.floor(W / 2)
      step = 'setStatusBarVisible'
      try {
        setStatusBarVisible(false)
      } catch (e) {
        console.log('CAULDRON could not hide status bar: ' + e)
      }
      step = 'load'
      storage = new LocalStorage()
      loadAll()
      pollSteps()
      applyAwake()
      step = 'build screen'
      buildScreen()
      syncTiles()
      showMenu()
      step = 'onGesture'
      try {
        onGesture({ callback: onGesture4 })
      } catch (e) {
        console.log('CAULDRON could not listen for swipes: ' + e)
      }
      step = 'setInterval'
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
    if (anim) finishAnim()
    if (meta) saveMeta()
    saveGame()
    try {
      resetPageBrightTime()
    } catch (e) {
      // nothing to undo
    }
  }
})
