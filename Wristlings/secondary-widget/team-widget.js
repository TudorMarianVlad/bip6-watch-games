// Wristlings team widget: a page in the watch's widget list.
// Pure black background (AMOLED: black pixels are off), with the game's own art:
// your team on their stands (the lead big in the middle, the other two smaller left
// and right), the lead's HP, FOOD and JOY, what is waiting for you, and tiles for
// tracks, charms and the book. It reads the summary the game writes into its save
// (widget, see widgetSummary() in page/index.js) and moves hunger, healing and tracks
// on by the time passed and today's steps, since the game may have been closed for hours.
// Only a real tap on PLAY opens the game: a swipe (finger moves) never does, so you
// can still swipe on to the next widget.
import { createWidget, widget, prop, align, event } from '@zos/ui'
import { LocalStorage } from '@zos/storage'
import { push } from '@zos/router'
import { Step } from '@zos/sensor'

const W = 390
const CX = W / 2
const WHITE = 0xffffff
const LILAC = 0xc8c0ff
const DIM = 0x8a82b8
const FAINT = 0x4a4470
const GOLD = 0xffd84d
const GREEN = 0x4dd06a
const RED = 0xff5c5c
const ORANGE = 0xffa03d
const PINK = 0xff7ac8
const PURPLE = 0x9b6cff
const TRACK = 0x0e0b1c // empty part of a bar: barely lit
const TAP_SLOP = 18 // a finger that moves more than this is a swipe, not a tap
const STARTERS = ['embit', 'puddlop', 'sprig'] // a new game shows them in the three spots

const L = {
  logo: { x: CX - 101, y: 12, w: 203, h: 33 },
  lead: { x: CX - 66, y: 48, size: 132 }, // the big stand; the 128 px sprite sits on it
  mates: [{ x: 32, y: 94 }, { x: W - 32 - 76, y: 94 }], // small stands (76), 64 px sprites
  mateLv: { dy: 76, h: 18 },
  mateHp: { dy: 96, w: 56, h: 6 },
  name: { x: CX - 85, y: 182, w: 170, h: 26 },
  lv: { x: CX - 85, y: 206, w: 170, h: 20 },
  bars: { y: 238, xs: [30, 142, 254], label: 40, w: 66, h: 8 },
  status: { x: 20, y: 250, w: 350, h: 24 },
  tiles: { y: 278, xs: [26, 140, 254] },
  play: { x: CX - 110, y: 362, w: 220, h: 54 }
}

function text(x, y, w, h, size, color, value, alignH) {
  return createWidget(widget.TEXT, {
    x, y, w, h, text: value || '', text_size: size, color,
    align_h: alignH === undefined ? align.CENTER_H : alignH, align_v: align.CENTER_V
  })
}
function rect(x, y, w, h, color, radius) {
  return createWidget(widget.FILL_RECT, { x, y, w, h, color, radius: radius || 0 })
}
function img(x, y, src) {
  return createWidget(widget.IMG, { x, y, src })
}
function setText(o, value, color) {
  o.setProperty(prop.TEXT, value)
  if (color !== undefined) o.setProperty(prop.COLOR, color)
}
function show(o, on) {
  o.setProperty(prop.VISIBLE, !!on)
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const hpColor = (f) => (f > 0.5 ? GREEN : f > 0.2 ? GOLD : RED)

// ---------- the numbers ----------
// reuse these across build / resume: constructing them on every wake is wasteful
let store = null, stepSensor = null
function readSummary() {
  try {
    if (!store) store = new LocalStorage()
    const raw = store.getItem('wristlings', '')
    const data = raw ? JSON.parse(raw) : null
    return data && data.widget ? data.widget : null
  } catch (e) {
    return null
  }
}
function dayKey(t) {
  const d = new Date(t)
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}
function stepsToday() {
  try {
    if (!stepSensor) stepSensor = new Step()
    const v = stepSensor.getCurrent()
    return typeof v === 'number' ? v : -1
  } catch (e) {
    return -1
  }
}

// what the game would show now, from the saved summary and the time since
function project(s) {
  const t = Date.now()
  const h = Math.max(0, (t - s.t) / 3600000)
  const heal = (m) => Object.assign({}, m, { hp: clamp(m.hp + m.max * s.hpPerMin * h * 60, 0, m.max) })
  const out = Object.assign({}, s)
  out.lead = heal(s.lead)
  out.lead.full = clamp(s.lead.full - s.fullPerHour * h, 0, 100)
  out.mates = (s.mates || []).map(heal)
  // free tracks while away: closed-form so weeks away don't loop hundreds of times
  let tracks = s.tracks
  const stepMs = (s.freeMin || 120) * 60000
  let freeAt = s.freeAt || t + stepMs
  if (t >= freeAt) {
    const gained = Math.floor((t - freeAt) / stepMs) + 1
    tracks = Math.min(s.cap, tracks + gained)
    freeAt += gained * stepMs
  }
  // tracks earned by today's steps that the game has not counted yet
  const steps = stepsToday()
  if (steps >= 0) {
    const counted = s.walkDay === dayKey(t) ? s.walkTracks : 0
    tracks += Math.max(0, Math.floor(steps / s.stepsPerTrack) - counted)
  }
  out.tracks = Math.min(s.cap, tracks)
  out.freeIn = Math.max(1, Math.ceil((freeAt - t) / 60000))
  out.steps = steps
  return out
}

// the one line that tells you what is waiting
function status(s) {
  const m = s.lead
  if (s.dream) return ['A dream visitor is waiting!', PURPLE]
  if (s.evolve) return [s.evolve + ' is ready to evolve!', GOLD]
  if (s.eggReady) return ['Your egg is ready to hatch!', GOLD]
  if (s.resting && m.hp < 1 && !(s.mates || []).some((p) => p.hp >= 1)) return ['Your team is resting...', RED]
  if (m.full < s.hungryBelow) return [m.name + ' is hungry: feed it!', ORANGE]
  if (s.tracks >= s.cap) return ['Tracks full: time to explore!', GREEN]
  if (s.tracks > 0) return [s.tracks + (s.tracks > 1 ? ' tracks' : ' track') + ' ready to explore', LILAC]
  return ['Walk to find more Wristlings', DIM]
}

// ---------- the widget ----------
let ui = null

// a bar whose fill can be resized: { fill, y, x, w, h, parts }
function bar(x, y, w, h, color, label) {
  const parts = []
  let bx = x
  if (label) {
    parts.push(text(x, y - 7, L.bars.label, 22, 13, DIM, label, align.LEFT))
    bx = x + L.bars.label
  }
  parts.push(rect(bx, y, w, h, TRACK, h / 2))
  const fill = rect(bx, y, w, h, color, h / 2)
  parts.push(fill)
  return { fill, parts, x: bx, y, w, h, color }
}
function setBar(b, frac, color) {
  const f = clamp(frac, 0, 1)
  show(b.fill, f > 0) // an empty bar must not leave a colored dot
  if (f <= 0) return
  const w = Math.max(b.h, Math.round(b.w * f))
  b.fill.setProperty(prop.MORE, { x: b.x, y: b.y, w, h: b.h, radius: b.h / 2, color: color || b.color })
}
const showBar = (b, on) => b.parts.forEach((o) => show(o, on))

function tile(x, label, icon) {
  const y = L.tiles.y
  img(x, y, 'ui/w_tile.png')
  if (icon) img(x + 8, y + 8, icon)
  text(icon ? x + 34 : x, y + 6, icon ? 70 : 110, 22, 14, DIM, label, icon ? align.LEFT : align.CENTER_H)
  return {
    value: text(x, y + 28, 110, 28, 24, WHITE),
    sub: text(x + 4, y + 54, 102, 18, 12, DIM)
  }
}

function refresh() {
  if (!ui) return
  const saved = readSummary()
  if (!(saved && saved.started && saved.lead)) {
    // a new game: the three starters on the three stands
    ui.leadArt.setProperty(prop.SRC, 'mon/' + STARTERS[0] + '.png')
    ui.mates.forEach((m, i) => {
      m.art.setProperty(prop.SRC, 'mon/' + STARTERS[i + 1] + '_s.png')
      show(m.art, true)
      setText(m.lv, '', DIM)
      showBar(m.hp, false)
    })
    setText(ui.name, 'NEW GAME', WHITE)
    setText(ui.lv, 'pick your first partner', LILAC)
    ui.bars.forEach((b) => showBar(b, false))
    setText(ui.status, 'Embit, Puddlop or Sprig?', GOLD)
    setText(ui.tracks.value, '-')
    setText(ui.tracks.sub, '')
    setText(ui.charms.value, '-')
    setText(ui.book.value, '0')
    return
  }
  const s = project(saved)
  const m = s.lead
  ui.leadArt.setProperty(prop.SRC, 'mon/' + m.sp + '.png')
  ui.mates.forEach((u, i) => {
    const p = s.mates[i]
    show(u.art, !!p)
    showBar(u.hp, !!p)
    if (!p) return setText(u.lv, 'free slot', FAINT)
    u.art.setProperty(prop.SRC, 'mon/' + p.sp + '_s.png')
    setText(u.lv, 'Lv ' + p.lv, LILAC)
    setBar(u.hp, p.hp / p.max, hpColor(p.hp / p.max))
  })
  setText(ui.name, m.name, WHITE)
  setText(ui.lv, 'Lv ' + m.lv + '  ' + m.elName, m.elColor)
  ui.bars.forEach((b) => showBar(b, true))
  setBar(ui.bars[0], m.hp / m.max, hpColor(m.hp / m.max))
  setBar(ui.bars[1], m.full / 100)
  setBar(ui.bars[2], m.joy / 100)
  const [line, color] = status(s)
  setText(ui.status, line, color)
  setText(ui.tracks.value, s.tracks + '/' + s.cap, s.tracks ? GOLD : WHITE)
  let sub = 'free in ' + s.freeIn + 'm'
  if (s.tracks >= s.cap) sub = 'full!'
  else if (s.steps >= 0) sub = 'next: ' + (s.stepsPerTrack - (s.steps % s.stepsPerTrack)) + ' steps'
  setText(ui.tracks.sub, sub)
  setText(ui.charms.value, String(s.charms), s.charms ? WHITE : RED)
  setText(ui.book.value, s.caught + '/' + s.total)
}

function play() {
  try {
    push({ url: 'page/index' })
  } catch (e) {
    console.log('WRISTLINGS widget could not open the game: ' + e)
  }
}

SecondaryWidget({
  build() {
    // no background: the screen is already black
    img(L.logo.x, L.logo.y, 'ui/w_logo.png')
    ui = { mates: [] }
    // the two smaller teammates, left and right
    for (const p of L.mates) {
      img(p.x, p.y, 'ui/w_plate_s.png')
      ui.mates.push({
        art: img(p.x + 6, p.y + 4, 'mon/puddlop_s.png'),
        lv: text(p.x - 4, p.y + L.mateLv.dy, 84, L.mateLv.h, 13, LILAC),
        hp: bar(p.x + 38 - L.mateHp.w / 2, p.y + L.mateHp.dy, L.mateHp.w, L.mateHp.h, GREEN)
      })
    }
    // the lead, big in the middle
    img(L.lead.x, L.lead.y, 'ui/w_plate.png')
    ui.leadArt = img(L.lead.x + 2, L.lead.y - 4, 'mon/embit.png')
    ui.name = text(L.name.x, L.name.y, L.name.w, L.name.h, 22, WHITE)
    ui.lv = text(L.lv.x, L.lv.y, L.lv.w, L.lv.h, 15, LILAC)
    const b = L.bars
    ui.bars = [bar(b.xs[0], b.y, b.w, b.h, GREEN, 'HP'), bar(b.xs[1], b.y, b.w, b.h, ORANGE, 'FOOD'), bar(b.xs[2], b.y, b.w, b.h, PINK, 'JOY')]
    ui.status = text(L.status.x, L.status.y, L.status.w, L.status.h, 17, LILAC)
    const [tx0, tx1, tx2] = L.tiles.xs
    ui.tracks = tile(tx0, 'TRACKS', 'ui/ico_paw.png')
    ui.charms = tile(tx1, 'CHARMS', 'ui/ico_charm.png')
    setText(ui.charms.sub, 'to catch with')
    ui.book = tile(tx2, 'BOOK')
    setText(ui.book.sub, 'caught')
    const p = L.play
    img(p.x, p.y, 'ui/w_play.png')

    // Only the PLAY button listens, and only to a tap: the finger must lift close
    // to where it went down. A swipe that starts on the button is ignored, so the
    // watch can move on to the next widget.
    const hit = createWidget(widget.TEXT, { x: p.x, y: p.y, w: p.w, h: p.h, text: '', text_size: 10, color: 0 })
    let down = null
    hit.addEventListener(event.CLICK_DOWN, (e) => {
      down = { x: e && e.x, y: e && e.y }
    })
    hit.addEventListener(event.CLICK_UP, (e) => {
      const d = down
      down = null
      if (!d) return
      const moved = typeof d.x === 'number' && e && typeof e.x === 'number' ? Math.hypot(e.x - d.x, e.y - d.y) : 0
      if (moved <= TAP_SLOP) play()
    })
    refresh()
  },

  // the game may have moved on since the widget was built
  onResume() {
    refresh()
  },

  onDestroy() {
    ui = null
  }
})
