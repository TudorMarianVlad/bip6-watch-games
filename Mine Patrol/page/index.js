// Mine Patrol — a mine-sweeping puzzle for Zepp OS (API 4.0, built for Amazfit Bip 6)
//
// TITLE: pick a field size (EASY, NORMAL, HARD). Your best time is shown on each.
//        CONTINUE comes back to an unfinished field.
// PLAY:  * Tap a tile to dig it. A number tells how many mines touch that tile
//          (also diagonally). An empty tile opens its neighbours by itself.
//        * The button at the top switches between DIG and FLAG. In FLAG mode a tap
//          puts a flag on a tile you think hides a mine (tap again to remove it).
//        * Tap a number whose mines are all flagged to dig all its other neighbours.
//        * The first dig is always safe. Dig every safe tile to win.
//        * Swipe left: back to the title (the field waits for you).
//
// Progress (best times, the unfinished field) is saved on the watch. The clock
// only runs while you are playing.
//
// Performance: plain widgets only (no canvas), updated only when a value changes,
// and one invisible full-screen touch layer for every tap.

import { createWidget, widget, event, prop, align, text_style, setStatusBarVisible } from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { LocalStorage } from '@zos/storage'
import { Time } from '@zos/sensor'
import { onGesture, offGesture, GESTURE_LEFT } from '@zos/interaction'

// ---------- settings ----------
const MODES = [
  { id: 'easy', name: 'EASY', n: 8, mines: 8, color: 0x4dd06a },
  { id: 'normal', name: 'NORMAL', n: 9, mines: 12, color: 0xffb03d },
  { id: 'hard', name: 'HARD', n: 10, mines: 18, color: 0xff5c5c }
]
const MAX_N = 10
const MAX_MINES = 18
const GRID_SIZE = 330 // the field is at most 330 x 330 px, inside the rounded screen corners
const GRID_Y = 84
const TICK_MS = 200
const SAVE_EVERY_SECONDS = 5
const MAX_SECONDS = 99 * 60 + 59

// ---------- colours ----------
const BG = 0x141026
const PANEL = 0x241d45
const INK = 0x0e0b1e
const WHITE = 0xffffff
const DIM = 0x8a82b8
const RED = 0xff5c5c
const GOLD = 0xffd84d
const GREEN = 0x4dd06a
const PURPLE = 0x9b6cff
const SAND = 0xe0b060
const HIDDEN = [0x4a5aa8, 0x4352a0] // checkerboard of the covered tiles
const OPEN = [0x221c40, 0x1d1838] // checkerboard of the dug tiles
const NUM_COLORS = [WHITE, 0x4db8ff, 0x4dd06a, 0xff6b6b, 0xc77dff, 0xffa03d, 0x3de0d0, WHITE, 0xb4b2a9]

// ---------- state ----------
let W = 390
let H = 450
let CX = 195
let st = null
let storage = null
let timeSensor = null
let timer = null
let lastTick = 0
let saveTimer = 0
let step = 'start'
const L = {}
const ui = {}

function now() {
  try {
    if (!timeSensor) timeSensor = new Time()
    return timeSensor.getTime()
  } catch (e) {
    return Date.now()
  }
}

function freshState() {
  const s = { screen: 'title', best: {}, wins: {}, plays: {}, game: null }
  for (const m of MODES) {
    s.best[m.id] = 0
    s.wins[m.id] = 0
    s.plays[m.id] = 0
  }
  return s
}

// ---------- the field ----------
// A game: cells[i] = { m: mine?, open: dug?, flag: flagged?, adj: mines around }
function newGame(modeIndex) {
  const m = MODES[modeIndex]
  const cells = []
  for (let i = 0; i < m.n * m.n; i++) cells.push({ m: false, open: false, flag: false, adj: 0 })
  return { mode: modeIndex, n: m.n, mines: m.mines, cells, started: false, over: null, boom: -1, elapsed: 0, flagMode: false, newBest: false }
}

function neighbours(g, i) {
  const r = Math.floor(i / g.n)
  const c = i % g.n
  const out = []
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue
      const rr = r + dr
      const cc = c + dc
      if (rr >= 0 && rr < g.n && cc >= 0 && cc < g.n) out.push(rr * g.n + cc)
    }
  return out
}

function countAdjacent(g) {
  g.cells.forEach((cell, i) => {
    cell.adj = neighbours(g, i).filter((k) => g.cells[k].m).length
  })
}

// Mines are placed on the first dig, never on that tile or around it,
// so the first dig always opens an area.
function placeMines(g, first) {
  const safe = neighbours(g, first).concat([first])
  let spots = []
  for (let i = 0; i < g.cells.length; i++) if (safe.indexOf(i) < 0) spots.push(i)
  if (spots.length < g.mines) spots = g.cells.map((_, i) => i).filter((i) => i !== first)
  for (let k = 0; k < g.mines; k++) {
    const j = k + Math.floor(Math.random() * (spots.length - k))
    const t = spots[k]
    spots[k] = spots[j]
    spots[j] = t
    g.cells[spots[k]].m = true
  }
  countAdjacent(g)
}

function flagsPlaced(g) {
  return g.cells.filter((c) => c.flag).length
}

// open one tile; an empty one (no mines around) opens its neighbours too
function openFrom(g, start) {
  const todo = [start]
  while (todo.length) {
    const i = todo.pop()
    const cell = g.cells[i]
    if (cell.open || cell.flag) continue
    cell.open = true
    if (cell.m) {
      lose(g, i)
      return
    }
    if (cell.adj === 0) for (const k of neighbours(g, i)) if (!g.cells[k].open) todo.push(k)
  }
}

function dig(g, i) {
  const cell = g.cells[i]
  if (g.over || cell.flag) return
  if (cell.open) return chord(g, i)
  if (!g.started) {
    placeMines(g, i)
    g.started = true
    st.plays[MODES[g.mode].id]++
  }
  openFrom(g, i)
  checkWin(g)
}

// a number with all its mines flagged: dig every other neighbour
function chord(g, i) {
  const cell = g.cells[i]
  if (!cell.open || cell.adj === 0) return
  const around = neighbours(g, i)
  if (around.filter((k) => g.cells[k].flag).length !== cell.adj) return
  for (const k of around) {
    if (g.over) break
    if (!g.cells[k].open && !g.cells[k].flag) openFrom(g, k)
  }
  checkWin(g)
}

function toggleFlag(g, i) {
  const cell = g.cells[i]
  if (g.over || cell.open) return
  if (!cell.flag && flagsPlaced(g) >= g.mines) return // no more flags than mines
  cell.flag = !cell.flag
}

function lose(g, i) {
  g.over = 'lose'
  g.boom = i
}

function checkWin(g) {
  if (g.over) return
  if (!g.cells.every((c) => c.m || c.open)) return
  g.over = 'win'
  for (const c of g.cells) if (c.m) c.flag = true
  const id = MODES[g.mode].id
  st.wins[id]++
  const t = Math.floor(g.elapsed)
  if (!st.best[id] || t < st.best[id]) {
    st.best[id] = t
    g.newBest = true
  }
}

function clock(sec) {
  const s = Math.min(MAX_SECONDS, Math.floor(sec))
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

// ---------- saving ----------
function save() {
  saveTimer = 0
  const g = st.game
  const data = {
    v: 1,
    best: st.best,
    wins: st.wins,
    plays: st.plays,
    screen: st.screen,
    // the field as numbers: 1 = mine, 2 = dug, 4 = flag
    game: g && !g.over ? { mode: g.mode, started: g.started, elapsed: g.elapsed, flagMode: g.flagMode, cells: g.cells.map((c) => (c.m ? 1 : 0) | (c.open ? 2 : 0) | (c.flag ? 4 : 0)) } : null
  }
  try {
    storage.setItem('save', JSON.stringify(data))
  } catch (e) {
    console.log('MINE PATROL save failed: ' + e)
  }
}

function load() {
  const s = freshState()
  let data = null
  try {
    const raw = storage.getItem('save', '')
    if (raw) data = JSON.parse(raw)
  } catch (e) {
    console.log('MINE PATROL could not read save: ' + e)
  }
  if (!data) return s
  for (const m of MODES) {
    s.best[m.id] = (data.best && data.best[m.id]) || 0
    s.wins[m.id] = (data.wins && data.wins[m.id]) || 0
    s.plays[m.id] = (data.plays && data.plays[m.id]) || 0
  }
  const d = data.game
  if (d && MODES[d.mode] && d.cells && d.cells.length === MODES[d.mode].n * MODES[d.mode].n) {
    const g = newGame(d.mode)
    g.started = !!d.started
    g.elapsed = d.elapsed || 0
    g.flagMode = !!d.flagMode
    d.cells.forEach((v, i) => {
      g.cells[i].m = !!(v & 1)
      g.cells[i].open = !!(v & 2)
      g.cells[i].flag = !!(v & 4)
    })
    countAdjacent(g)
    s.game = g
    if (data.screen === 'play') s.screen = 'play'
  }
  return s
}

// ---------- layout ----------
function layout() {
  CX = Math.floor(W / 2)
  // top bar: three boxes kept clear of the rounded corners
  L.left = { x: 36, y: 20, w: 104, h: 48 }
  L.mid = { x: 146, y: 20, w: 98, h: 48 }
  L.right = { x: W - 140, y: 20, w: 104, h: 48 }
  // title screen
  L.rows = [112, 196, 280].map((y) => ({ x: 30, y, w: W - 60, h: 72 }))
  L.cont = { x: CX - 100, y: 368, w: 200, h: 46 }
}

// size and position of the field for n x n tiles
function grid(n) {
  const cell = Math.floor(GRID_SIZE / n)
  return { n, cell, x0: Math.floor((W - n * cell) / 2), y0: GRID_Y }
}

function cellBox(gd, i) {
  const r = Math.floor(i / gd.n)
  const c = i % gd.n
  return { x: gd.x0 + c * gd.cell + 1, y: gd.y0 + r * gd.cell + 1, w: gd.cell - 2, h: gd.cell - 2 }
}

// ---------- widget wrappers (every update goes through a "did it change?" check) ----------
function wrap(w, color) {
  return { w, v: true, t: null, c: color === undefined ? null : color, m: null }
}

function mkText(x, y, w, h, size, color, alignH) {
  return wrap(
    createWidget(widget.TEXT, { x, y, w, h, text: '', text_size: size, color, align_h: alignH === undefined ? align.CENTER_H : alignH, align_v: align.CENTER_V }),
    color
  )
}

function mkRect(x, y, w, h, color, radius) {
  return wrap(createWidget(widget.FILL_RECT, { x, y, w, h, radius: radius || 0, color }))
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

function setBox(o, b, color, radius) {
  setMore(o, b.x + ',' + b.y + ',' + b.w + ',' + b.h + ',' + color + ',' + radius, { x: b.x, y: b.y, w: b.w, h: b.h, radius, color })
}

function setCircle(o, x, y, r, color) {
  setMore(o, x + ',' + y + ',' + r + ',' + color, { center_x: x, center_y: y, radius: r, color })
}

function setTextBox(o, b, size) {
  setMore(o, b.x + ',' + b.y + ',' + b.w + ',' + b.h + ',' + size, { x: b.x, y: b.y, w: b.w, h: b.h, text_size: size })
}

// ---------- building the screen (once) ----------
function buildScreen() {
  const bg = mkRect(0, 0, W, H, BG, 0)
  bg.w.addEventListener(event.CLICK_DOWN, (e) => handleTouch(e)) // backup, if taps fall through

  // --- title ---
  ui.title = []
  const t = (o) => (ui.title.push(o), o)
  setText(t(mkText(CX - 140, 34, 280, 44, 32, WHITE)), 'MINE PATROL')
  setText(t(mkText(CX - 140, 74, 280, 26, 15, DIM)), 'clear the field, flag the mines')
  ui.rows = L.rows.map((r, i) => {
    const m = MODES[i]
    const row = {
      bg: t(mkRect(r.x, r.y, r.w, r.h, PANEL, 16)),
      icon: t(mkCircle(r.x + 34, r.y + r.h / 2, 19, m.color)),
      letter: t(mkText(r.x + 15, r.y + r.h / 2 - 15, 38, 30, 18, INK)),
      name: t(mkText(r.x + 64, r.y + 8, 150, 30, 20, WHITE, align.LEFT)),
      info: t(mkText(r.x + 64, r.y + 38, 160, 24, 14, DIM, align.LEFT)),
      pill: t(mkRect(r.x + r.w - 112, r.y + 19, 100, 34, m.color, 17)),
      right: t(mkText(r.x + r.w - 112, r.y + 19, 100, 34, 15, INK))
    }
    setText(row.letter, m.name[0])
    setText(row.name, m.name)
    setText(row.info, m.n + 'x' + m.n + ', ' + m.mines + ' mines')
    return row
  })
  ui.contBg = t(mkRect(L.cont.x, L.cont.y, L.cont.w, L.cont.h, PURPLE, 23))
  ui.contText = t(mkText(L.cont.x, L.cont.y, L.cont.w, L.cont.h, 17, WHITE))
  ui.footer = t(mkText(CX - 110, 416, 220, 26, 14, DIM))

  // --- play: the field ---
  ui.play = []
  const p = (o) => (ui.play.push(o), o)
  ui.cells = []
  for (let i = 0; i < MAX_N * MAX_N; i++) ui.cells.push({ tile: p(mkRect(0, 0, 10, 10, HIDDEN[0], 6)), num: p(mkText(0, 0, 10, 10, 20, WHITE)) })
  // flags and mines come from small pools (never more than MAX_MINES of each)
  ui.flags = []
  for (let i = 0; i < MAX_MINES; i++) ui.flags.push({ pole: p(mkRect(0, 0, 2, 10, WHITE, 0)), cloth: p(mkRect(0, 0, 10, 8, RED, 1)) })
  ui.mines = []
  for (let i = 0; i < MAX_MINES; i++) ui.mines.push(p(mkCircle(0, 0, 8, INK)))

  // --- play: top bar ---
  ui.leftBg = p(mkRect(L.left.x, L.left.y, L.left.w, L.left.h, PANEL, 24))
  ui.mineIcon = p(mkCircle(L.left.x + 26, L.left.y + L.left.h / 2, 9, INK))
  ui.mineDot = p(mkCircle(L.left.x + 23, L.left.y + L.left.h / 2 - 3, 2, WHITE))
  ui.leftText = p(mkText(L.left.x + 40, L.left.y, L.left.w - 48, L.left.h, 20, WHITE))
  ui.midBg = p(mkRect(L.mid.x, L.mid.y, L.mid.w, L.mid.h, SAND, 24))
  ui.midText = p(mkText(L.mid.x, L.mid.y, L.mid.w, L.mid.h, 18, INK))
  ui.midSub = p(mkText(L.mid.x - 10, L.mid.y + 26, L.mid.w + 20, 22, 13, WHITE))
  ui.rightBg = p(mkRect(L.right.x, L.right.y, L.right.w, L.right.h, PANEL, 24))
  ui.rightText = p(mkText(L.right.x, L.right.y, L.right.w, L.right.h, 20, WHITE))

  // touch layer: an empty full-screen TEXT widget created last, so it is on top of
  // everything and tap coordinates are screen coordinates
  ui.touch = createWidget(widget.TEXT, { x: 0, y: 0, w: W, h: H, text: '', text_size: 10, color: BG })
  ui.touch.addEventListener(event.CLICK_DOWN, (e) => handleTouch(e))
}

// ---------- updating the screen (only what changed) ----------
function updateScreen() {
  const title = st.screen === 'title'
  ui.title.forEach((o) => setVisible(o, title))
  if (title) updateTitle()
  else updatePlay()
}

function updateTitle() {
  MODES.forEach((m, i) => setText(ui.rows[i].right, st.best[m.id] ? 'BEST ' + clock(st.best[m.id]) : 'PLAY'))
  const g = st.game
  const cont = !!(g && !g.over && g.started)
  setVisible(ui.contBg, cont)
  setVisible(ui.contText, cont)
  if (cont) setText(ui.contText, 'CONTINUE  ' + MODES[g.mode].name + ' ' + clock(g.elapsed))
  const wins = MODES.reduce((a, m) => a + st.wins[m.id], 0)
  const plays = MODES.reduce((a, m) => a + st.plays[m.id], 0)
  setText(ui.footer, plays ? 'cleared ' + wins + ' of ' + plays + ' fields' : 'tip: the first dig is always safe')
  setVisible(ui.footer, !cont)
  ui.play.forEach((o) => setVisible(o, false))
}

function updatePlay() {
  const g = st.game
  const gd = grid(g.n)
  const size = g.n === 8 ? 26 : g.n === 9 ? 23 : 21
  let flagN = 0
  let mineN = 0
  ui.cells.forEach((w, i) => {
    const cell = g.cells[i]
    setVisible(w.tile, !!cell)
    setVisible(w.num, !!cell)
    if (!cell) return
    const b = cellBox(gd, i)
    const r = Math.floor(i / g.n)
    const c = i % g.n
    const odd = (r + c) % 2
    let color = cell.open ? OPEN[odd] : HIDDEN[odd]
    if (g.over === 'lose' && i === g.boom) color = RED
    setBox(w.tile, b, color, 6)
    setTextBox(w.num, b, size)
    let text = ''
    let tc = WHITE
    if (cell.open && !cell.m && cell.adj > 0) {
      text = String(cell.adj)
      tc = NUM_COLORS[cell.adj]
    }
    // after a loss: a flag on a tile without a mine was wrong
    if (g.over === 'lose' && cell.flag && !cell.m) {
      text = 'X'
      tc = RED
    }
    setText(w.num, text)
    setColor(w.num, tc)
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    const showFlag = cell.flag && !(g.over === 'lose' && !cell.m)
    if (showFlag && flagN < ui.flags.length) {
      const f = ui.flags[flagN++]
      const s = gd.cell / 36 // flags scale with the tiles
      setBox(f.pole, { x: Math.round(cx - 7 * s), y: Math.round(cy - 10 * s), w: 2, h: Math.round(20 * s) }, WHITE, 0)
      setBox(f.cloth, { x: Math.round(cx - 5 * s), y: Math.round(cy - 10 * s), w: Math.round(13 * s), h: Math.round(9 * s) }, RED, 1)
      setVisible(f.pole, true)
      setVisible(f.cloth, true)
    }
    if (g.over === 'lose' && cell.m && !cell.flag && mineN < ui.mines.length) {
      const mo = ui.mines[mineN++]
      setCircle(mo, Math.round(cx), Math.round(cy), Math.round(gd.cell * 0.24), INK)
      setVisible(mo, true)
    }
  })
  for (let k = flagN; k < ui.flags.length; k++) {
    setVisible(ui.flags[k].pole, false)
    setVisible(ui.flags[k].cloth, false)
  }
  for (let k = mineN; k < ui.mines.length; k++) setVisible(ui.mines[k], false)

  // top bar
  const over = !!g.over
  setVisible(ui.mineIcon, !over)
  setVisible(ui.mineDot, !over)
  setVisible(ui.midSub, over)
  ;[ui.leftBg, ui.leftText, ui.midBg, ui.midText, ui.rightBg, ui.rightText].forEach((o) => setVisible(o, true))
  if (!over) {
    setBox(ui.leftBg, L.left, PANEL, 24)
    setText(ui.leftText, String(g.mines - flagsPlaced(g)))
    setTextBox(ui.leftText, { x: L.left.x + 40, y: L.left.y, w: L.left.w - 48, h: L.left.h }, 20)
    setBox(ui.midBg, L.mid, g.flagMode ? RED : SAND, 24)
    setText(ui.midText, g.flagMode ? 'FLAG' : 'DIG')
    setColor(ui.midText, g.flagMode ? WHITE : INK)
    setTextBox(ui.midText, L.mid, 18)
    setBox(ui.rightBg, L.right, PANEL, 24)
    setText(ui.rightText, clock(g.elapsed))
    setColor(ui.rightText, WHITE)
  } else {
    const win = g.over === 'win'
    setBox(ui.leftBg, L.left, GREEN, 24)
    setText(ui.leftText, 'AGAIN')
    setTextBox(ui.leftText, L.left, 18)
    setBox(ui.midBg, L.mid, BG, 24)
    setText(ui.midText, win ? 'CLEARED!' : 'BOOM!')
    setColor(ui.midText, win ? GOLD : RED)
    setTextBox(ui.midText, { x: L.mid.x - 10, y: L.mid.y - 2, w: L.mid.w + 20, h: 28 }, 19)
    setText(ui.midSub, win ? (g.newBest ? 'NEW BEST ' : '') + clock(g.elapsed) : clock(g.elapsed))
    setColor(ui.midSub, win && g.newBest ? GOLD : DIM)
    setBox(ui.rightBg, L.right, PURPLE, 24)
    setText(ui.rightText, 'MENU')
    setColor(ui.rightText, WHITE)
  }
  if (over) setColor(ui.leftText, INK)
  else setColor(ui.leftText, WHITE)
}

// ---------- input ----------
function inBox(x, y, b) {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
}

let lastTapAt = 0

function handleTouch(e) {
  try {
    if (!e || typeof e.x !== 'number' || typeof e.y !== 'number') return
    onTap(e.x, e.y)
  } catch (err) {
    showError('tap', err)
  }
}

function startGame(modeIndex) {
  st.game = newGame(modeIndex)
  st.screen = 'play'
  save()
}

function onTap(x, y) {
  const t = now()
  // the background and the touch layer can both report one tap: ignore the echo
  // (only when time moves forward, so a clock change never blocks taps)
  if (t >= lastTapAt && t - lastTapAt < 40) return
  lastTapAt = t

  if (st.screen === 'title') {
    L.rows.forEach((r, i) => {
      if (inBox(x, y, r)) startGame(i)
    })
    const g = st.game
    if (g && !g.over && g.started && inBox(x, y, L.cont)) st.screen = 'play'
    updateScreen()
    return
  }

  const g = st.game
  if (g.over) {
    if (inBox(x, y, L.left)) startGame(g.mode)
    else if (inBox(x, y, L.right)) {
      st.game = null
      st.screen = 'title'
      save()
    }
    updateScreen()
    return
  }
  if (inBox(x, y, L.mid)) {
    g.flagMode = !g.flagMode
    updateScreen()
    return
  }
  const gd = grid(g.n)
  const c = Math.floor((x - gd.x0) / gd.cell)
  const r = Math.floor((y - gd.y0) / gd.cell)
  if (c < 0 || r < 0 || c >= g.n || r >= g.n) return
  const i = r * g.n + c
  if (g.flagMode && !g.cells[i].open) toggleFlag(g, i)
  else dig(g, i)
  save()
  updateScreen()
}

// Swipe left: back to the title. Swipe right still leaves the app.
function onSwipe(ev) {
  if (!st || st.screen !== 'play' || ev !== GESTURE_LEFT) return false
  st.screen = 'title'
  save()
  updateScreen()
  return true
}

// ---------- main loop ----------
function tick() {
  try {
    const t = now()
    let dt = (t - lastTick) / 1000
    lastTick = t
    if (dt < 0 || dt > 3) dt = 0 // the watch slept: that time does not count
    const g = st.game
    if (st.screen === 'play' && g && g.started && !g.over) {
      g.elapsed = Math.min(MAX_SECONDS, g.elapsed + dt)
      saveTimer += dt
      if (saveTimer >= SAVE_EVERY_SECONDS) save()
    }
    updateScreen()
  } catch (e) {
    showError('tick', e)
  }
}

function showError(where, e) {
  const msg = where + ' / ' + step + ': ' + (e && e.message ? e.message : String(e))
  console.log('MINE PATROL ERROR ' + msg)
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
      layout()
      step = 'setStatusBarVisible'
      try {
        setStatusBarVisible(false)
      } catch (e) {
        console.log('MINE PATROL could not hide status bar: ' + e)
      }
      step = 'load save'
      storage = new LocalStorage()
      st = load()
      step = 'build screen'
      buildScreen()
      step = 'first render'
      updateScreen()
      step = 'onGesture'
      try {
        onGesture({ callback: onSwipe })
      } catch (e) {
        console.log('MINE PATROL could not listen for swipes: ' + e)
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
    if (st) save()
  }
})
