// Wristlings — a creature-collecting, turn-based battle game for Zepp OS
// (API 4.0, built for the Amazfit Bip 6, 390 x 450).
//
// THE LOOP
//   * Walking earns TRACKS (1 per 300 steps today, plus 1 free every 2 hours, max 6).
//     Spend a track on EXPLORE to meet a wild Wristling.
//   * Battles are 1 vs 1 and turn based: pick one of 3 moves. Elements matter
//     (FIRE beats GRASS, WATER beats FIRE ...). The move buttons say STRONG / WEAK.
//   * Weaken a wild one, then CATCH it with a charm: tap when the shrinking ring
//     meets the gold ring. Lower HP + better timing = better odds.
//   * Up to 3 Wristlings fight in your party. Winning gives XP; at the right
//     level a happy Wristling evolves.
//
// YOUR BODY PLAYS TOO
//   * Steps: tracks, berries (every 800) and charms (every 1,500).
//   * Heart rate: minutes today well above your resting pulse become TRAIN XP.
//   * Sleep: a good night heals the whole team; enough REM sleep can bring a
//     rare Dream visitor in the morning.
//   * Time: Shadow Wristlings only come out at night (20:00 - 06:00).
//
// CARE
//   * Wristlings get hungry over time (FOOD). Feed them berries; each species has
//     a favourite berry that makes it much happier (JOY). Happy = +10% power,
//     hungry = -10%. A Wristling must be happy enough to evolve.
//
// Screens are rebuilt from scratch when you move between them (one touch layer
// on top catches every tap), and only changed values are pushed to widgets.

import { createWidget, deleteWidget, widget, event, prop, align, text_style, setStatusBarVisible, getTextLayout } from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { LocalStorage } from '@zos/storage'
import { Time, Step, HeartRate, Sleep, Weather, Calorie, Pai, Battery, Compass, Vibrator, VIBRATOR_SCENE_SHORT_LIGHT, VIBRATOR_SCENE_SHORT_STRONG, VIBRATOR_SCENE_SHORT_MIDDLE } from '@zos/sensor'
import { onGesture, offGesture, GESTURE_LEFT, GESTURE_RIGHT, GESTURE_UP, GESTURE_DOWN } from '@zos/interaction'
import { ART } from './uiart'
import { ELEMENTS, SHORT, STRONG, MOVES, SPECIES, BOOK, STARTERS, BERRIES, effectiveness, elementsOf, FAV_FULL_BONUS, FAV_JOY_BONUS } from './data'

// ---------- balance ----------
const TICK_MS = 50
const SLIDE_MS = 230 // menu transition: quick enough to stay snappy
const SLIDE_NAMES = { den: 1, guide: 1, settings: 1, team: 1, detail: 1, feed: 1, book: 1, boss: 1 }
const READ_ONLY_SCREENS = { guide: 1, book: 1, boss: 1, team: 1, detail: 1 }
const STEPS_PER_TRACK = 300
const TRACK_CAP = 6
const FREE_TRACK_MIN = 120 // a free track every 2 hours, so you can play without walking
const STEPS_PER_BERRY = 800
const STEPS_PER_CHARM = 1500
const START_TRACKS = 3
const START_CHARMS = 5
const STARTER_LV = 5
const MAX_LV = 40
const PARTY_MAX = 3
const FULL_DECAY_PER_HOUR = 4 // FOOD 100 -> 0 in 25 hours
const HUNGRY_BELOW = 25
const HAPPY_FROM = 70
const MOOD_EFFECT = 0.1 // happy: +10% attack and defence, hungry: -10%
const TRAIN_XP_BASE = 3 // TRAIN: active minutes give XP, capped
const TRAIN_XP_CAP_MIN = 30 // at most this many active minutes count per day
const GOOD_SLEEP_MIN = 360 // a night this long (minutes) fully heals the team
const WILD_EVOLVED_LV = 13 // evolved forms show up wild once your lead is this level
const WILD_FINAL_LV = 28 // ...and fully evolved ones (the third stage) once it is this level
const WILD_EVOLVED_CHANCE = 0.18 // ...and then this often
const AI_REST_BELOW = 0.35 // wild ones that know Breather use it below this much HP
const EVOLVE_JOY = 55
const HP_REGEN_PER_MIN = 0.003 // 0.3% of max HP per minute outside battle (~5.5h for a full heal)
const RESTS_PER_BATTLE = 2
const CRIT_CHANCE = 1 / 16
const CRIT_MULT = 1.5
const SUPER_MULT = 1.5 // also in data.js effectiveness()
const WEAK_MULT = 0.67
const SAME_ELEMENT_BONUS = 1.2 // a move of the creature's own element
const GUARD_TAKEN = 0.4 // a guarded hit does 40% damage
const REST_HEAL = 0.35
const FEED_HEAL = 0.2
const BERRY_DROP = 0.35 // chance of a berry after a win
const CHARM_DROP = 0.15 // chance of a charm after a win
// catching: chance = (BASE + HP * (missing HP) + timing bonus) x the rarity's mult
const CATCH_BASE = 0.15
const CATCH_HP = 0.5
const CATCH_PERFECT = 0.3
const CATCH_GOOD = 0.15
const CATCH_MAX = 0.9 // never better than this
const CATCH_OVERLEVEL = 3
const CATCH_OVERLEVEL_PENALTY = 0.1
const SAVE_EVERY_MS = 10000
const RESET_CONFIRM_MS = 3000 // Settings > RESET: tap again within this to erase the game
// rare Wristlings
const RARE_NOON_CHANCE = 0.08 // Solarion: only between 11:00 and 14:00 (was 0.03)
const RARE_WALK_STEPS = 10000 // Boulderon: only once you walked this much today
const RARE_WALK_CHANCE = 0.3 // high: a 10,000-step day is rare enough
const RARE_MIDNIGHT_CHANCE = 0.1 // Midnyx: only from 23:00 to 01:00
const RARE_ACTIVE_MIN = 30 // Pulsarex: only after this many high-heart-rate minutes today
const RARE_ACTIVE_CHANCE = 0.08 // was 0.03
const RARE_MOON_CHANCE = 0.3 // Selenyx: only on full-moon nights
const FULL_MOON_DAYS = 1.5 // days either side of the exact full moon that still count
// step eggs: you find one on a good walking day, and it hatches as you walk
const EGG_FIND_STEPS = 6000 // a day with this many steps finds an egg
const EGG_HATCH_STEPS = 5000 // steps to walk with it before it hatches
const EGG_HATCH_LV = 5 // a hatchling's level (or half your lead's level, if that is higher)
const EGG_NEW_CHANCE = 0.75 // how often it is one you have not caught yet (while any are left)
// book rewards: [creatures caught, charms, gold berries, an egg?]
const MILESTONES = [[10, 3, 0, false], [25, 3, 1, true], [50, 5, 2, true], [75, 5, 2, true], [100, 8, 3, true]]
const BADGE_CHARMS = 3 // catching every creature of a book category gives this many charms
const BADGE_GOLD = 1 // ...and gold berries
// the weekly boss (swipe right on the den): a new one every Monday
const BOSS_MIN_LV = 8
const BOSS_STEPS_PER_LV = 4000 // it gains a level for every this many steps you walk that week
const BOSS_MAX_LV = 40
const BOSS_HP_MULT = 1.5 // it has this much more HP than a wild one of its level
const BOSS_EGG_LV = 16 // beating it at this level or higher also gives an egg
const UPCOMING_DAYS = 3 // the den mentions a seasonal event this many days before it starts
// catching: tap the moving ring when it meets the gold ring
const RING_MAX = 120
const RING_MIN = 24
const RING_TARGET = 66
const PERFECT_PX = 6
const GOOD_PX = 14
// rarity tiers: rarer ones are harder to catch and their ring shrinks faster
//   common: everyday base forms. uncommon: evolved forms, night-only and real-world ones.
//   rare: the three rare ones.
const RARITY = {
  common: { name: 'COMMON', mult: 1, ringMs: 1300 },
  uncommon: { name: 'UNCOMMON', mult: 0.8, ringMs: 1100 },
  rare: { name: 'RARE', mult: 0.55, ringMs: 950 }
}
const RARITY_COLOR = { common: 0xc8c0ff, uncommon: 0x4db8ff, rare: 0xffd84d }

// ---------- colours ----------
const BG = 0x141026
const INK = 0x0c0a1c
const WHITE = 0xffffff
const DIM = 0x8a82b8
const RED = 0xff5c5c
const GOLD = 0xffd84d
const GREEN = 0x4dd06a
const ORANGE = 0xffa03d
const PINK = 0xff7ac8
const PURPLE = 0x9b6cff
const BLUE = 0x4db8ff
const LILAC = 0xc8c0ff // soft text on dark panels

// ---------- state ----------
let W = 390
let H = 450
let CX = 195
let st = null
let storage = null
let timer = null
let lastSave = 0
let lastMinute = 0
let lastSensor = 0
let lastHeart = 0
let lastFacing = 0
let step = 'start'
const notices = [] // messages shown (one screen each) before the den
let screen = { name: '', ws: [], poss: [], taps: [], ui: {} }
let slide = null // active menu slide: { old, dir, t0 }
let scrollAnim = null // active guide scroll: { from, to, t0 }
let lastDrag = 0 // used to ignore a gesture that was really a guide drag

// ---------- small helpers ----------
let timeSensor = null
function now() {
  try {
    if (!timeSensor) timeSensor = new Time()
    return timeSensor.getTime()
  } catch (e) {
    return Date.now()
  }
}
function dayKey(t) {
  const d = new Date(t)
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}
function hourOf(t) {
  return new Date(t).getHours()
}
function isNight() {
  const h = hourOf(now())
  return h >= 20 || h < 6
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v))
}
function randInt(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1))
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}
function fmt(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

let vib = null
// cat: 'battle' | 'catch' | 'other' - each can be switched off in SETTINGS
function buzz(kind, cat) {
  const set = st && st.settings
  if (set && ((cat === 'battle' && !set.vibBattle) || (cat === 'catch' && !set.vibCatch) || (cat === 'other' && !set.vibOther))) return
  try {
    if (!vib) vib = new Vibrator()
    const mode = kind === 'strong' ? VIBRATOR_SCENE_SHORT_STRONG : kind === 'mid' ? VIBRATOR_SCENE_SHORT_MIDDLE : VIBRATOR_SCENE_SHORT_LIGHT
    vib.stop()
    vib.start({ mode })
  } catch (e) {
    // no vibration motor access: play silently
  }
}

// ---------- creatures ----------
const PRE = {} // species -> the species it evolves from
for (const id in SPECIES) if (SPECIES[id].evo) PRE[SPECIES[id].evo] = id

function statsOf(m) {
  const s = SPECIES[m.sp]
  const L = m.lv
  const mood = m.joy >= HAPPY_FROM ? 1 + MOOD_EFFECT : m.full < HUNGRY_BELOW ? 1 - MOOD_EFFECT : 1
  return {
    hp: Math.floor(((2 * s.hp * L) / 100 + L + 10) * 1.4 * (m.boss ? BOSS_HP_MULT : 1)),
    atk: Math.max(1, Math.floor(((2 * s.atk * L) / 100 + 5) * mood)),
    def: Math.max(1, Math.floor(((2 * s.def * L) / 100 + 5) * mood)),
    spd: Math.floor((2 * s.spd * L) / 100 + 5)
  }
}
function maxHp(m) {
  return statsOf(m).hp
}
function xpNext(lv) {
  return Math.floor(12 + lv * lv * 1.9)
}
// The 3 move buttons always have the same roles:
//   1. main attack: the strongest move of its own element
//   2. second attack: a move of another element if it knows one (to cover a
//      weakness), otherwise its next strongest attack
//   3. GUARD or BREATHER
// Weaker moves it has outgrown are left out.
function movesOf(m) {
  const s = SPECIES[m.sp]
  const known = s.moves.filter((x) => x[0] <= m.lv).map((x) => x[1])
  const hits = known.filter((id) => MOVES[id].kind === 'hit').sort((a, b) => MOVES[b].pow - MOVES[a].pow)
  const util = known.filter((id) => MOVES[id].kind !== 'hit')
  const main = hits.find((id) => MOVES[id].el === s.el) || hits[0]
  const rest = hits.filter((id) => id !== main)
  const second = rest.find((id) => MOVES[id].el && MOVES[id].el !== s.el) || rest[0]
  const out = [main, second, util[util.length - 1]].filter((id) => id)
  // nothing to guard or rest with yet: fill the third slot with another attack
  for (const id of rest) if (out.length < 3 && out.indexOf(id) < 0) out.push(id)
  return out
}
function newMon(sp, lv) {
  const m = { id: st.nextId++, sp, lv, xp: 0, hp: 0, full: 70, joy: 50 }
  m.hp = maxHp(m)
  return m
}
function monById(id) {
  for (const m of st.mons) if (m.id === id) return m
  return null
}
function partyMons() {
  return st.party.map(monById).filter((m) => m)
}
function leadMon() {
  return monById(st.party[0])
}
function rarityOf(sp) {
  const s = SPECIES[sp]
  if (s.rare) return 'rare'
  if (PRE[sp] || s.time || s.cond) return 'uncommon'
  return 'common'
}

function canEvolve(m) {
  const s = SPECIES[m.sp]
  return !!s.evo && m.lv >= s.evoLv && (!s.evoPai || weeklyPai() >= s.evoPai) && (!s.evoSteps || (m.walked || 0) >= s.evoSteps)
}

// gives XP, levels up, returns the messages to show
function gainXp(m, amount) {
  const out = []
  const name = SPECIES[m.sp].name
  if (m.lv >= MAX_LV) return out
  m.xp += amount
  out.push(name + ' got ' + amount + ' XP')
  const startLv = m.lv
  const learned = []
  while (m.lv < MAX_LV && m.xp >= xpNext(m.lv)) {
    const before = maxHp(m)
    m.xp -= xpNext(m.lv)
    m.lv++
    m.hp = Math.min(maxHp(m), m.hp + (maxHp(m) - before))
    for (const x of SPECIES[m.sp].moves) if (x[0] === m.lv) learned.push(MOVES[x[1]].name)
  }
  // one line for all the levels, however many (a long workout can give 10 at once)
  const gained = m.lv - startLv
  if (gained) out.push(name + ' grew to Lv ' + m.lv + '!' + (gained > 1 ? ' (+' + gained + ' levels)' : ''))
  for (const mv of learned) out.push(name + ' learned ' + mv + '!')
  if (m.lv >= MAX_LV) m.xp = 0
  queueEvolution(m, out, startLv)
  return out
}

function queueEvolution(m, out, startLv) {
  const s = SPECIES[m.sp]
  // a big XP gain can skip over the evolution level; compare the level before
  // the gain so the hint still shows on a multi-level jump
  const justReached = startLv !== undefined ? startLv < s.evoLv : !(m.lv - 1 >= s.evoLv)
  if (out && s.evo && s.evoPai && m.lv >= s.evoLv && weeklyPai() < s.evoPai && justReached)
    out.push(s.name + ' will evolve once your weekly PAI reaches ' + s.evoPai)
  if (out && s.evo && s.evoSteps && m.lv >= s.evoLv && (m.walked || 0) < s.evoSteps && justReached)
    out.push(s.name + ' will evolve after walking ' + fmt(s.evoSteps) + ' steps as your lead')
  if (!canEvolve(m) || st.pendingEvo.indexOf(m.id) >= 0) return
  if (m.joy >= EVOLVE_JOY) st.pendingEvo.push(m.id)
  else if (out) out.push(SPECIES[m.sp].name + ' wants to evolve, but needs more JOY')
}

// time passing: hunger, mood and healing
function passTime(ms, noHeal) {
  if (ms <= 0) return
  const h = ms / 3600000
  for (const m of st.mons) {
    if (st.party.indexOf(m.id) >= 0) {
      m.full = clamp(m.full - FULL_DECAY_PER_HOUR * h, 0, 100)
      if (m.full < HUNGRY_BELOW) m.joy = clamp(m.joy - 2 * h, 0, 100)
    }
    // benched creatures still heal; only party members get hungry
    if (!noHeal) m.hp = clamp(m.hp + maxHp(m) * HP_REGEN_PER_MIN * h * 60, 0, maxHp(m))
  }
  // free tracks
  const t = now()
  if (!st.freeAt) st.freeAt = t + FREE_TRACK_MIN * 60000
  while (t >= st.freeAt) {
    if (st.tracks < TRACK_CAP) st.tracks++
    st.freeAt += FREE_TRACK_MIN * 60000
    if (st.tracks >= TRACK_CAP && st.freeAt < t) st.freeAt = t + FREE_TRACK_MIN * 60000
  }
}

// ---------- saving ----------
function freshState() {
  return {
    v: 1,
    started: false,
    mons: [],
    party: [],
    nextId: 1,
    tracks: START_TRACKS,
    freeAt: 0,
    charms: START_CHARMS,
    berries: { red: 2, blue: 2, green: 2, gold: 0 },
    walk: { day: 0, tracks: 0, berries: 0, charms: 0 },
    train: { day: 0, used: 0 },
    settings: { vibBattle: true, vibCatch: true, vibOther: true },
    sleepDay: 0,
    dream: false,
    seen: {},
    caught: {},
    favKnown: {},
    pendingEvo: [],
    life: { steps: 0, day: 0, last: 0 }, // steps counted by the game (legend)
    streak: { day: 0, count: 0 }, // days in a row with STREAK_STEPS+ steps (legend)
    legendRest: 0, // the day a streak legend was worn out: it comes back the next day
    egg: null, // the egg you carry: { steps } walked with it
    eggDay: 0, // the last day an egg was found by walking
    eggsWaiting: 0, // eggs won while carrying one: they start after it hatches
    milestones: [], // book rewards already given (creatures caught)
    badges: {}, // book categories completed
    week: { key: 0, steps: 0 }, // steps this week (Monday's day key): the boss's level
    bossWon: 0, // the week the boss was beaten
    last: 0
  }
}

function save() {
  lastSave = now()
  st.last = lastSave
  let data = st
  try {
    data = Object.assign({}, st, { widget: widgetSummary() })
  } catch (e) {
    // the summary is optional
  }
  try {
    storage.setItem('wristlings', JSON.stringify(data))
  } catch (e) {
    console.log('WRISTLINGS save failed: ' + e)
  }
}

// A short summary for the watch widget (secondary-widget/team-widget.js). It carries the
// rates too, so the widget can move hunger, healing and tracks on while the game is
// closed without knowing the game's formulas. load() ignores it.
function widgetSummary() {
  const m = leadMon()
  const evo = st.pendingEvo.map(monById).filter((x) => x)[0]
  return {
    t: now(),
    started: st.started && !!m,
    lead: m ? { sp: m.sp, name: SPECIES[m.sp].name, lv: m.lv, el: SPECIES[m.sp].el, elName: ELEMENTS[SPECIES[m.sp].el].name, elColor: ELEMENTS[SPECIES[m.sp].el].color, hp: m.hp, max: maxHp(m), full: m.full, joy: m.joy } : null,
    team: partyMons().length,
    // the other two team members, shown smaller left and right of the lead
    mates: partyMons().slice(1).map((p) => ({ sp: p.sp, lv: p.lv, hp: p.hp, max: maxHp(p) })),
    resting: !partyMons().some((p) => p.hp >= 1),
    tracks: st.tracks,
    cap: TRACK_CAP,
    freeAt: st.freeAt,
    freeMin: FREE_TRACK_MIN,
    walkDay: st.walk.day,
    walkTracks: st.walk.tracks,
    stepsPerTrack: STEPS_PER_TRACK,
    charms: st.charms,
    caught: Object.keys(st.caught).length,
    total: BOOK.length,
    dream: !!st.dream,
    eggReady: !!(st.egg && st.egg.steps >= EGG_HATCH_STEPS),
    evolve: evo ? SPECIES[evo.sp].name : '',
    fullPerHour: FULL_DECAY_PER_HOUR,
    hungryBelow: HUNGRY_BELOW,
    hpPerMin: HP_REGEN_PER_MIN
  }
}

function load() {
  const s = freshState()
  try {
    const raw = storage.getItem('wristlings', '')
    if (raw) {
      const d = JSON.parse(raw)
      for (const k in s) if (d[k] !== undefined) s[k] = d[k]
    }
  } catch (e) {
    console.log('WRISTLINGS could not read save: ' + e)
  }
  // drop anything that points at a species that no longer exists
  s.mons = s.mons.filter((m) => SPECIES[m.sp])
  s.party = s.party.filter((id) => s.mons.some((m) => m.id === id))
  if (s.started && !s.party.length && s.mons.length) s.party = [s.mons[0].id]
  return s
}

// ---------- the watch: steps, heart rate, sleep ----------
let stepSensor = null
// sensor objects are expensive to construct: create each one once and reuse it
let calSensor = null, batSensor = null, paiSensor = null, hrSensor = null, wxSensor = null
let stepsToday = -1
function readSteps() {
  let n = -1
  try {
    if (!stepSensor) stepSensor = new Step()
    const v = stepSensor.getCurrent()
    if (typeof v === 'number') n = v
  } catch (e) {
    n = -1
  }
  return n
}

function updateSteps() {
  stepsToday = readSteps()
  if (stepsToday < 0) return
  const day = dayKey(now())
  if (st.walk.day !== day) st.walk = { day, tracks: 0, berries: 0, charms: 0 }
  // steps counted by the game (a legend), the walking streak, and the lead's own steps
  const life = st.life
  if (life.day !== day) {
    life.day = day
    life.last = 0
  }
  const delta = Math.max(0, stepsToday - life.last)
  life.last = stepsToday
  life.steps += delta
  const lead = leadMon()
  if (lead && delta) {
    lead.walked = (lead.walked || 0) + delta
    queueEvolution(lead)
  }
  // the weekly boss grows with this week's steps; a carried egg moves on with every step
  const wk = weekKey(now())
  if (st.week.key !== wk) st.week = { key: wk, steps: 0 }
  st.week.steps += delta
  if (st.egg) st.egg.steps = Math.min(EGG_HATCH_STEPS, st.egg.steps + delta)
  if (st.started && !st.egg && st.eggDay !== day && stepsToday >= EGG_FIND_STEPS) {
    st.eggDay = day
    giveEgg()
    if (screen.name === 'den') toast('You found an EGG! Walk to hatch it', GOLD)
  }
  if (stepsToday >= STREAK_STEPS && st.streak.day !== day) {
    st.streak.count = st.streak.day === dayKey(now() - 86400000) ? st.streak.count + 1 : 1
    st.streak.day = day
  }
  const w = st.walk
  const tracks = Math.floor(stepsToday / STEPS_PER_TRACK)
  if (tracks > w.tracks) {
    const n = tracks - w.tracks
    w.tracks = tracks
    const before = st.tracks
    st.tracks = Math.min(TRACK_CAP, st.tracks + n)
    if (st.tracks > before && screen.name === 'den') toast('+' + (st.tracks - before) + ' TRACK' + (st.tracks - before > 1 ? 'S' : ''), GOLD)
  }
  const berries = Math.floor(stepsToday / STEPS_PER_BERRY)
  while (w.berries < berries) {
    w.berries++
    const b = Math.random() < 0.1 ? 'gold' : pick(['red', 'blue', 'green'])
    st.berries[b]++
  }
  const charms = Math.floor(stepsToday / STEPS_PER_CHARM)
  if (charms > w.charms) {
    st.charms += charms - w.charms
    w.charms = charms
  }
}

function stepsToNextTrack() {
  if (stepsToday < 0) return -1
  return STEPS_PER_TRACK - (stepsToday % STEPS_PER_TRACK)
}

// minutes today with a pulse well above resting (from the watch's own minute log)
let activeMinutes = -1
function updateHeart() {
  try {
    if (!hrSensor) hrSensor = new HeartRate()
    const hr = hrSensor
    const today = hr.getToday() || []
    let rest = 0
    try {
      rest = hr.getResting()
    } catch (e) {
      rest = 0
    }
    if (!rest || rest < 35 || rest > 120) rest = 65
    const limit = Math.max(rest + 35, 100)
    let n = 0
    for (let i = 0; i < today.length; i++) if (today[i] >= limit && today[i] < 230) n++
    activeMinutes = n
  } catch (e) {
    activeMinutes = -1
  }
  const day = dayKey(now())
  if (st.train.day !== day) st.train = { day, used: 0 }
}
function trainMinutes() {
  return activeMinutes < 0 ? 0 : Math.max(0, activeMinutes - st.train.used)
}

function checkSleep() {
  const t = now()
  const day = dayKey(t)
  if (st.sleepDay === day || hourOf(t) < 5 || !st.started) return
  try {
    const sl = new Sleep()
    const info = sl.getInfo()
    if (!info || !info.totalTime) return // no sleep data (yet): try again later
    st.sleepDay = day
    let rem = 0
    try {
      const K = sl.getStageConstantObj()
      for (const s of sl.getStage() || []) if (s.model === K.REM_STAGE) rem += Math.max(0, s.stop - s.start)
    } catch (e) {
      rem = 0
    }
    applySleep(info.totalTime, rem)
  } catch (e) {
    console.log('WRISTLINGS no sleep data: ' + e)
  }
}

// a night's sleep (minutes asleep, minutes of REM): heals the team, maybe a dream visitor
function applySleep(total, rem) {
  const hours = Math.floor(total / 60) + 'h ' + (total % 60) + 'm'
  const good = total >= GOOD_SLEEP_MIN
  for (const m of st.mons) {
    m.hp = good ? maxHp(m) : Math.max(m.hp, Math.round(maxHp(m) * 0.6))
    m.joy = clamp(m.joy + (good ? 10 : 3), 0, 100)
  }
  let text = good ? 'You slept ' + hours + '. Your whole team is fully rested and happier!' : 'You slept ' + hours + '. Your team got a little rest.'
  if (rem >= 30 && Math.random() < Math.min(0.85, rem / 100)) {
    st.dream = true
    text += ' Something drifted in from your dreams...'
  }
  const lead = leadMon()
  notices.push({ title: 'GOOD MORNING', text, img: lead ? 'mon/' + lead.sp + '.png' : '' })
}

// ---------- more of the real world: weather, weekend, calories, PAI ----------
// Some Wristlings only come out while one of these is true (their "cond" in data.js).
const KCAL_SPAWN = 300 // calories burned today before Kindlepig shows up
const COND_WEIGHT = 3 // a Wristling whose condition is true is this many times as likely
const RAIN_CODES = [1, 5, 7, 10, 12, 15, 18, 19, 20, 21, 24] // watch weather codes for rain / storms
const SUN_CODES = [3]
const FOG_CODES = [13, 14] // fog, haze
const MIST_NIGHT_STEPS = 8000 // Mistlantern also comes out on nights after this many steps
const SNOW_CODES = [2, 6, 8, 9, 16] // snow showers, light / moderate / heavy snow, snowstorm
const LOW_BATTERY = 20 // Ampsnail's line: the watch battery is under this many %
const HALLOWEEN = [[10, 25], [11, 2]] // Pumpkling's line: from 25 Oct to 2 Nov (month, day)
const EASTER_DAYS = [-7, 1] // Easter creatures: from Palm Sunday to Easter Monday (Western or Orthodox Easter)
const NEWYEAR = [[12, 31], [1, 2]] // 31 Dec - 2 Jan (month, day; it wraps round the new year)
const VALENTINE = [[2, 12], [2, 16]] // 12 - 16 Feb
const MIDSUMMER = [[6, 19], [6, 25]] // 19 - 25 Jun (and only at night)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// legends (one per player)
const LEGEND_STEPS = 500000 // one appears once the game has counted this many of your steps (was 1,000,000)
const STREAK_DAYS = 7 // one appears after this many days in a row with...
const STREAK_STEPS = 5000 // ...at least this many steps
const LEGEND_CHANCE = 0.15 // then this often per EXPLORE
// battle extras
const BURN_DMG = 0.08 // a burned creature loses this much of its max HP after each of its moves
const BURN_TURNS = 4
const FREEZE_TURNS = 1 // a frozen creature skips this many turns
const SLEEP_TURNS = [1, 2] // a sleeping one skips 1 to 2 turns (was 1 to 3)
const WEATHER_BOOST = 1.2
const WEATHER_DAMPEN = 0.8
const WEATHER = {
  rain: { name: 'RAIN', boost: 'water', dampen: 'fire' },
  sun: { name: 'SUN', boost: 'fire', dampen: 'water' },
  snow: { name: 'SNOW', boost: 'ice', dampen: 'fire' }
}

let weatherCache = { t: 0, kind: null }
// 'rain' | 'sun' | 'fog' | 'snow' | 'other', or null when the watch has no forecast
function weatherKind() {
  const t = now()
  if (weatherCache.t && t - weatherCache.t < 600000) return weatherCache.kind
  let kind = null
  try {
    if (!wxSensor) wxSensor = new Weather()
    const d = wxSensor.getForecastWeather()
    const today = d && d.forecastData && d.forecastData.data && d.forecastData.data[0]
    if (today)
      kind = RAIN_CODES.indexOf(today.index) >= 0 ? 'rain' : SUN_CODES.indexOf(today.index) >= 0 ? 'sun' : FOG_CODES.indexOf(today.index) >= 0 ? 'fog' : SNOW_CODES.indexOf(today.index) >= 0 ? 'snow' : 'other'
  } catch (e) {
    kind = null
  }
  weatherCache = { t, kind }
  return kind
}
function isWeekendAfternoon() {
  const d = new Date(now())
  const day = d.getDay()
  return (day === 0 || day === 6) && d.getHours() >= 12 && d.getHours() < 18
}
function kcalToday() {
  let n = 0
  try {
    if (!calSensor) calSensor = new Calorie()
    n = calSensor.getCurrent() || 0
  } catch (e) {
    n = 0
  }
  return n
}
// watch battery in %, or -1 if unknown
function batteryLevel() {
  try {
    if (!batSensor) batSensor = new Battery()
    const v = batSensor.getCurrent()
    return typeof v === 'number' ? v : -1
  } catch (e) {
    return -1
  }
}
// '31 Dec - 2 Jan' from [[12, 31], [1, 2]]
function dateRange(r) {
  return r[0][1] + ' ' + MONTHS[r[0][0] - 1] + ' - ' + r[1][1] + ' ' + MONTHS[r[1][0] - 1]
}
function isHalloween() {
  const d = new Date(now())
  const md = (d.getMonth() + 1) * 100 + d.getDate()
  return md >= HALLOWEEN[0][0] * 100 + HALLOWEEN[0][1] && md <= HALLOWEEN[1][0] * 100 + HALLOWEEN[1][1]
}
// true while today's date is inside [[month, day], [month, day]] (it may wrap round New Year)
function inDates(r) {
  const d = new Date(now())
  const md = (d.getMonth() + 1) * 100 + d.getDate()
  const a = r[0][0] * 100 + r[0][1]
  const b = r[1][0] * 100 + r[1][1]
  return a <= b ? md >= a && md <= b : md >= a || md <= b
}
// Easter Sunday of a year: Western (Gregorian) and Orthodox (Julian, shown as a Gregorian date)
function easterDays(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const west = new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1, 12)
  const jd = (19 * (y % 19) + 15) % 30
  const je = (2 * (y % 4) + 4 * (y % 7) - jd + 34) % 7
  const julian = new Date(y, Math.floor((jd + je + 114) / 31) - 1, ((jd + je + 114) % 31) + 1, 12)
  const east = new Date(julian.getTime() + 13 * 86400000) // Julian -> Gregorian (1900 - 2099)
  return [west, east]
}
function isEaster() {
  const t = new Date(now())
  const noon = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12).getTime()
  return easterDays(t.getFullYear()).some((e) => {
    const k = Math.round((noon - e.getTime()) / 86400000)
    return k >= EASTER_DAYS[0] && k <= EASTER_DAYS[1]
  })
}
// days in a row with STREAK_STEPS+ steps (0 once a day was missed)
function streakNow() {
  const d = st.streak.day
  return d === dayKey(now()) || d === dayKey(now() - 86400000) ? st.streak.count : 0
}
function weeklyPai() {
  let n = 0
  try {
    if (!paiSensor) paiSensor = new Pai()
    n = paiSensor.getTotal() || 0
  } catch (e) {
    n = 0
  }
  return n
}
// ---------- compass ----------
// The watch reports where its 12 o'clock (the top) points: 0 = north, 90 = east.
// It only runs on the den and battle screens, to save battery.
const FACE_TOLERANCE = 30 // degrees either side that still count as "facing north / east"
const NEEDLE_TOLERANCE = 45 // degrees either side that count as facing where Needlefin points
const NEEDLE_FLEE = 0.5 // chance a compass creature gets away after your turn if you were not facing it
const DUSK_HOURS = [17, 21] // Gloamstag: facing west between these hours
const NOON_HOURS = [11, 15] // Sunquill: facing south between these hours
const SPIN_WINDOW_MS = 30000 // Whirlwisp: a full turn on the den this recently before you explore
const SPIN_DEG = 330 // ...this many degrees counts as a full turn
const STEADY_MS = 8000 // Stillbill: hold one heading on the den this long before you explore
const STEADY_DEG = 15 // ...staying within this many degrees
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const DIR_WORDS = ['NORTH', 'NORTH-EAST', 'EAST', 'SOUTH-EAST', 'SOUTH', 'SOUTH-WEST', 'WEST', 'NORTH-WEST']
let compass = null
const onCompass = () => {}
function compassOn() {
  if (compass) return
  try {
    compass = new Compass()
    compass.onChange(onCompass)
    compass.start()
  } catch (e) {
    compass = null
  }
}
function compassOff() {
  if (!compass) return
  try {
    compass.offChange(onCompass)
    compass.stop()
  } catch (e) {
    // already stopped
  }
  compass = null
}
// degrees the top of the watch points, or -1 if unknown (no compass / not calibrated)
function heading() {
  if (!compass) return -1
  try {
    if (!compass.getStatus()) return -1
    const a = compass.getDirectionAngle()
    return typeof a === 'number' ? a : -1
  } catch (e) {
    return -1
  }
}
function angleGap(a, b) {
  const g = Math.abs(a - b) % 360
  return g > 180 ? 360 - g : g
}
function dirIndex(a) {
  return Math.round(a / 45) % 8
}
function facing(target, tolerance) {
  const h = heading()
  return h >= 0 && angleGap(h, target) <= tolerance
}

// recent compass readings on the den, for the spin and steady-heading creatures
let headings = []
function trackHeading(h, t) {
  if (h < 0) return
  headings.push({ t, h })
  const keep = Math.max(SPIN_WINDOW_MS, STEADY_MS) + 1000
  while (headings.length && t - headings[0].t > keep) headings.shift()
}
function spunAround() {
  const t = now()
  let turn = 0
  let prev = null
  for (const r of headings) {
    if (t - r.t > SPIN_WINDOW_MS) continue
    if (prev) {
      let d = r.h - prev.h
      if (d > 180) d -= 360
      if (d < -180) d += 360
      turn += d
    }
    prev = r
  }
  return Math.abs(turn) >= SPIN_DEG
}
function heldSteady() {
  const t = now()
  const recent = headings.filter((r) => t - r.t <= STEADY_MS + 600)
  if (!recent.length || t - recent[0].t < STEADY_MS - 600 || t - recent[recent.length - 1].t > 1500) return false
  const last = recent[recent.length - 1].h
  return recent.every((r) => angleGap(r.h, last) <= STEADY_DEG)
}

function condMet(c) {
  if (c === 'north') return facing(0, FACE_TOLERANCE)
  if (c === 'dawn') return hourOf(now()) >= 5 && hourOf(now()) < 9 && facing(90, FACE_TOLERANCE)
  if (c === 'compass') return heading() >= 0
  if (c === 'mist') return weatherKind() === 'fog' || (isNight() && stepsToday >= MIST_NIGHT_STEPS)
  if (c === 'weekend') return isWeekendAfternoon()
  if (c === 'rain') return weatherKind() === 'rain'
  if (c === 'sun') return weatherKind() === 'sun' && !isNight()
  if (c === 'kcal') return kcalToday() >= KCAL_SPAWN
  if (c === 'dusk') return hourOf(now()) >= DUSK_HOURS[0] && hourOf(now()) < DUSK_HOURS[1] && facing(270, FACE_TOLERANCE)
  if (c === 'south') return hourOf(now()) >= NOON_HOURS[0] && hourOf(now()) < NOON_HOURS[1] && facing(180, FACE_TOLERANCE)
  if (c === 'spin') return spunAround()
  if (c === 'steady') return heldSteady()
  if (c === 'battery') {
    const b = batteryLevel()
    return b >= 0 && b < LOW_BATTERY
  }
  if (c === 'halloween') return isHalloween()
  if (c === 'december') return new Date(now()).getMonth() === 11
  if (c === 'easter') return isEaster()
  if (c === 'newyear') return inDates(NEWYEAR)
  if (c === 'valentine') return inDates(VALENTINE)
  if (c === 'midsummer') return inDates(MIDSUMMER)
  if (c === 'friday13') {
    const d = new Date(now())
    return d.getDay() === 5 && d.getDate() === 13
  }
  return true
}

// ---------- widgets ----------
// Every widget is recorded by wrap() so a screen can be moved as one layer by
// applying the same offset to all of them.
function makeWidget(type, params) {
  return createWidget(type, params)
}
function wrap(w, extra, params) {
  const o = { w, x: params ? params.x : undefined, y: params ? params.y : undefined, h: params ? params.h : undefined }
  if (extra) for (const k in extra) o[k] = extra[k]
  o.bx = o.x
  o.by = o.y
  screen.ws.push(w)
  screen.poss.push(o)
  return o
}
function mkRect(x, y, w, h, color, radius) {
  const p = { x, y, w, h, radius: radius || 0, color }
  return wrap(makeWidget(widget.FILL_RECT, p), { b: p }, p)
}
function mkRing(x, y, w, h, color, radius, lw) {
  const p = { x, y, w, h, radius, line_width: lw, color }
  return wrap(makeWidget(widget.STROKE_RECT, p), { b: p }, p)
}
function mkText(x, y, w, h, size, color, alignH, text, alignV) {
  const p = {
    x, y, w, h,
    text: text || '',
    text_size: size,
    color,
    align_h: alignH === undefined ? align.CENTER_H : alignH,
    align_v: alignV === undefined ? align.CENTER_V : alignV,
    text_style: text_style.WRAP
  }
  return wrap(makeWidget(widget.TEXT, p), { t: text || '', c: color, tp: p }, p)
}
function mkImg(x, y, src) {
  const p = { x, y, src }
  return wrap(makeWidget(widget.IMG, p), { src, x, y, v: true }, p)
}
function setText(o, v) {
  if (o.sh) setText(o.sh, v)
  if (o.t === v) return
  o.t = v
  // keep the style blob in sync: prop.MORE must not reset text to ''
  if (o.tp) o.tp.text = v
  o.w.setProperty(prop.TEXT, v)
}
function setTextColor(o, c) {
  if (o.c === c) return
  o.c = c
  o.w.setProperty(prop.COLOR, c)
}
function setTextStyle(o, changes) {
  const b = o.tp || o.b
  if (!b) return
  let same = true
  for (const k in changes) if (b[k] !== changes[k]) same = false
  if (same) return
  for (const k in changes) b[k] = changes[k]
  if (changes.color !== undefined) o.c = changes.color
  if (changes.x !== undefined) o.x = changes.x
  if (changes.y !== undefined) o.y = changes.y
  o.w.setProperty(prop.MORE, b)
}
function setVisible(o, v) {
  if (o.sh) setVisible(o.sh, v)
  if (o.v === v) return
  o.v = v
  o.w.setProperty(prop.VISIBLE, v)
}
function setRect(o, changes) {
  let same = true
  for (const k in changes) if (o.b[k] !== changes[k]) same = false
  if (same) return
  for (const k in changes) o.b[k] = changes[k]
  o.w.setProperty(prop.MORE, o.b)
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

// a bar: background + fill
function mkBar(x, y, w, h, color) {
  const bg = mkRect(x, y, w, h, INK, h / 2)
  const fill = mkRect(x, y, w, h, color, h / 2)
  return { bg, fill, x, y, w, h, color }
}
function setBar(bar, frac, color) {
  const w = Math.max(0, Math.round(bar.w * clamp(frac, 0, 1)))
  setRect(bar.fill, { w: Math.max(w, 1), color: color || bar.color })
  setVisible(bar.fill, w > 0)
}
function hpColor(frac) {
  return frac > 0.5 ? GREEN : frac > 0.2 ? GOLD : RED
}

// a tappable button
// ---------- art: pre-rendered UI images (made by tools/ui.cjs, sizes in uiart.js) ----------
function artSrc(key) {
  return 'ui/' + key + '.png'
}
function artSize(key) {
  return ART[key] || [0, 0]
}
function mkArt(x, y, key) {
  return mkImg(x, y, artSrc(key))
}
// centred on the screen horizontally
function mkArtC(y, key) {
  return mkArt(Math.round(CX - artSize(key)[0] / 2), y, key)
}

// text with a dark drop shadow, readable on top of pictures
// The biggest font size (max down to min) at which `text` fits a w x h box.
// Calibrated on the watch: a character is about 0.52 x the size wide and a line
// about 1.28 x the size tall; we assume a bit wider (word wrapping wastes space).
const CHAR_W = 0.58
const LINE_H = 1.32
function fitSize(text, w, h, max, min) {
  for (let size = max; size > min; size--) {
    const perLine = Math.max(1, Math.floor(w / (size * CHAR_W)))
    let lines = 0
    for (const para of String(text).split('\n')) lines += Math.max(1, Math.ceil(para.length / perLine))
    if (lines * size * LINE_H <= h) return size
  }
  return min
}

function mkTextS(x, y, w, h, size, color, alignH, text, alignV) {
  const sh = mkText(x + 1, y + 2, w, h, size, INK, alignH, text, alignV)
  const o = mkText(x, y, w, h, size, color, alignH, text, alignV)
  o.sh = sh
  return o
}

// a button made of one picture (the label is usually baked into it).
// opts.label: extra text on top (for labels that change, like move names)
// opts.badge: a gold bubble in the corner for a number
// opts.offKey: the picture when disabled (default: key + '_off' if it exists)
function mkArtButton(x, y, key, fn, opts) {
  opts = opts || {}
  const [w, h] = artSize(key)
  const b = { key, on: true, x, y, w, h, fixedOff: !!opts.offKey }
  b.offKey = opts.offKey || (ART[key + '_off'] ? key + '_off' : key)
  b.img = mkArt(x, y, key)
  if (opts.label !== undefined) b.txt = mkTextS(x, y + (opts.labelY || 0), w, opts.labelH || h - 6, opts.size || 20, WHITE, align.CENTER_H, opts.label)
  if (opts.badge) {
    b.badgeImg = mkArt(x + w - 24, y - 8, 'badge')
    b.badgeTxt = mkText(x + w - 24, y - 8, 30, 30, 16, INK, align.CENTER_H, '')
    setVisible(b.badgeImg, false)
    setVisible(b.badgeTxt, false)
  }
  addTap(x, y, w, h, () => {
    if (b.on) fn()
    else if (b.offFn) b.offFn()
  })
  return b
}
function setArtButton(b, on, key) {
  if (key && key !== b.key) {
    b.key = key
    if (!b.fixedOff) b.offKey = ART[key + '_off'] ? key + '_off' : key
  }
  b.on = on
  setSrc(b.img, artSrc(on ? b.key : b.offKey))
  if (b.txt) setTextColor(b.txt, on ? WHITE : DIM)
}
function setBadge(b, n) {
  const show = n > 0
  setVisible(b.badgeImg, show)
  setVisible(b.badgeTxt, show)
  if (show) setText(b.badgeTxt, n > 99 ? '99' : String(n))
}

// the picture behind each screen
function bgFor(name) {
  if (name === 'den') return isNight() ? 'bg_den_night' : 'bg_den_day'
  if (name === 'battle') return isNight() ? 'bg_battle_night' : 'bg_battle_day'
  if (name === 'catch' || name === 'evolve') return 'bg_spot'
  return 'bg_menu'
}

function addTap(x, y, w, h, fn) {
  screen.taps.push({ x, y, w, h, fn })
}

// ---------- screens ----------
function clearWidgets(ws) {
  if (!ws) return
  for (const w of ws) {
    try {
      if (typeof deleteWidget === 'function') deleteWidget(w)
      else w.setProperty(prop.VISIBLE, false)
    } catch (e) {
      try {
        w.setProperty(prop.VISIBLE, false)
      } catch (e2) {
        // already gone
      }
    }
  }
}
function clearScreen() {
  clearWidgets(screen.ws)
}

function ease(p) {
  return 1 - (1 - p) * (1 - p)
}

// Move every widget on a screen by the same offset during a transition.
function moveLayer(s, dx, dy) {
  if (!s) return
  dx = Math.round(dx || 0)
  dy = Math.round(dy || 0)
  for (const o of s.poss || []) {
    if (o.bx === undefined || o.v === false) continue
    setPos(o, o.bx + dx, o.by + dy)
  }
}

function slideDistance(axis) {
  return axis === 'y' ? H : W
}

function finishSlide() {
  if (!slide) return
  moveLayer(screen, 0, 0)
  clearWidgets(slide.old.ws)
  slide = null
}

function tickSlide(t) {
  if (!slide) return
  const p = clamp((t - slide.t0) / SLIDE_MS, 0, 1)
  const e = ease(p)
  const dist = slideDistance(slide.axis) * slide.dir
  if (slide.axis === 'y') {
    moveLayer(slide.old, 0, -dist * e)
    moveLayer(screen, 0, dist * (1 - e))
  } else {
    moveLayer(slide.old, -dist * e, 0)
    moveLayer(screen, dist * (1 - e), 0)
  }
  if (p >= 1) finishSlide()
}

// Back reverses the way this screen came in.
function backInfo() {
  if (!screen || !screen.enterDir) return { dir: -1, axis: 'x' }
  return { dir: -screen.enterDir, axis: screen.enterAxis || 'x' }
}
function gotoBack(name, arg) {
  const b = backInfo()
  goto(name, arg, b.dir, b.axis)
}

// Builds a screen without deleting the current one, so two screens can slide.
function buildScreen(name, arg, offset, axis) {
  screen = { name, ws: [], poss: [], taps: [], ui: {}, arg, instant: false, enterDir: 0, enterAxis: 'x' }
  // one full-screen picture instead of a fill + shapes: cheap to draw
  if (name === 'den' || name === 'battle') compassOn()
  else compassOff()
  screen.ui.bg = mkArt(0, 0, bgFor(name))
  SCREENS[name](arg)
  // toast (above the screen, below the touch layer)
  screen.ui.toastBg = mkArt(CX - 160, 60, 'pnl_toast')
  screen.ui.toast = mkText(CX - 150, 62, 300, 62, 17, WHITE, align.CENTER_H, '')
  setVisible(screen.ui.toastBg, false)
  setVisible(screen.ui.toast, false)
  screen.toastUntil = 0
  // touch layer stays put so taps always use screen coordinates
  const touch = createWidget(widget.TEXT, { x: 0, y: 0, w: W, h: H, text: '', text_size: 10, color: BG })
  screen.ws.push(touch)
  touch.addEventListener(event.CLICK_DOWN, (e) => onDown(e))
  try {
    touch.addEventListener(event.CLICK_UP, (e) => onUp(e))
  } catch (e) {
    // no finger-lift events: taps fire on touch-down after a short wait
  }
  try {
    touch.addEventListener(event.MOVE, (e) => onMove(e))
  } catch (e) {
    // no drag events: guide still scrolls with swipes
  }
  if (offset) {
    if (axis === 'y') moveLayer(screen, 0, offset)
    else moveLayer(screen, offset, 0)
  }
  if (!READ_ONLY_SCREENS[name]) save()
}

function goto(name, arg, dir, axis) {
  step = 'goto ' + name
  if (slide) finishSlide()
  scrollAnim = null
  const old = screen
  // Same-screen rebuilds (page turns, settings toggles) must not re-animate.
  const animate = old && old.name && old.name !== name && SLIDE_NAMES[old.name] && SLIDE_NAMES[name]
  if (!animate) {
    clearScreen()
    buildScreen(name, arg, 0)
    return
  }
  dir = dir === -1 ? -1 : 1
  axis = axis === 'y' ? 'y' : 'x'
  buildScreen(name, arg, slideDistance(axis) * dir, axis)
  screen.enterDir = dir
  screen.enterAxis = axis
  slide = { old, dir, axis, t0: now() }
}

function toast(msg, color) {
  const u = screen.ui
  if (!u.toast) return
  // show first, then change: a hidden widget may not redraw its new content
  setVisible(u.toastBg, true)
  setVisible(u.toast, true)
  setText(u.toast, msg)
  setTextColor(u.toast, color || WHITE)
  screen.toastUntil = now() + 2200
}

// where to go "home": evolutions first, then notices, then the den
function home() {
  checkBook()
  st.pendingEvo = st.pendingEvo.filter((id) => {
    const m = monById(id)
    return m && canEvolve(m)
  })
  if (st.pendingEvo.length) return goto('evolve', st.pendingEvo[0])
  if (notices.length) return goto('notice', notices.shift())
  const b = backInfo()
  goto('den', undefined, b.dir, b.axis)
}

// ---------- starter ----------
function buildStarter() {
  const u = screen.ui
  u.sel = -1
  mkArtC(8, 't_logo')
  mkTextS(20, 62, W - 40, 28, 20, LILAC, align.CENTER_H, 'Pick your first partner')
  u.cards = STARTERS.map((sp, i) => {
    const x = 14 + i * 122
    const card = mkArt(x, 98, 'pnl_card')
    mkImg(x + 3, 104, 'mon/' + sp + '_b.png')
    mkTextS(x, 216, 118, 30, 22, WHITE, align.CENTER_H, SPECIES[sp].name)
    const el = ELEMENTS[SPECIES[sp].el]
    mkText(x, 246, 118, 26, 18, el.color, align.CENTER_H, el.name)
    addTap(x, 98, 118, 186, () => {
      u.sel = i
      u.cards.forEach((c, j) => setSrc(c, artSrc(j === i ? 'pnl_card_sel' : 'pnl_card')))
      setArtButton(u.go, true)
      setText(u.pick, SPECIES[sp].name + ' it is? Tap CHOOSE!')
      setTextColor(u.pick, GOLD)
    })
    return card
  })
  u.pick = mkTextS(30, 290, W - 60, 60, 18, LILAC, align.CENTER_H, 'Walk to find wild Wristlings. Sleep well to heal them. Feed them berries.')
  u.go = mkArtButton(55, 354, 'btn_choose', () => {
    const m = newMon(STARTERS[u.sel], STARTER_LV)
    m.full = 80
    m.joy = 60
    st.mons.push(m)
    st.party = [m.id]
    st.seen[m.sp] = true
    st.caught[m.sp] = true
    st.started = true
    st.freeAt = now() + FREE_TRACK_MIN * 60000
    notices.push({ title: SPECIES[m.sp].name + '!', text: 'Your new partner. You have ' + st.tracks + ' tracks: tap EXPLORE to find wild Wristlings.', img: 'mon/' + m.sp + '.png' })
    home()
  })
  setArtButton(u.go, false)
}

// ---------- den (home) ----------
function buildDen() {
  const u = screen.ui
  updateSteps()
  updateHeart()
  lastHeart = now()
  // top: tracks and charms in two chips
  mkArt(63, 8, 'pnl_chip')
  mkArt(71, 12, 'ico_paw')
  u.tracks = mkTextS(103, 8, 80, 36, 20, GOLD, align.LEFT, '')
  mkArt(203, 8, 'pnl_chip')
  mkArt(211, 12, 'ico_charm')
  u.charms = mkTextS(243, 8, 80, 36, 20, 0x8fe6ff, align.LEFT, '')
  u.walk = mkTextS(30, 46, W - 60, 22, 15, WHITE, align.CENTER_H, '')
  u.facing = mkTextS(CX - 70, 66, 140, 20, 14, 0x8fe6ff, align.CENTER_H, '')
  // the egg you carry, left of your lead: it fills up as you walk, tap it to check or hatch
  u.egg = mkArt(26, 104, 'ico_egg')
  u.eggTxt = mkText(14, 156, 68, 20, 14, LILAC, align.CENTER_H, '')
  addTap(14, 96, 68, 84, eggTap)
  // the lead creature standing on the grass
  u.shadow = mkRect(CX - 50, 184, 100, 12, isNight() ? 0x123020 : 0x2f7a34, 6)
  u.img = mkImg(CX - 64, DEN_MON_Y, 'mon/' + leadMon().sp + '.png')
  u.hopAt = -1e9
  // tap your lead: a little hop
  addTap(CX - 64, DEN_MON_Y, 128, 120, () => {
    u.hopAt = now()
    buzz('light', 'other')
  })
  u.name = mkTextS(30, 194, W - 60, 30, 26, WHITE, align.CENTER_H, '')
  const row = (y, label, color) => {
    mkText(44, y - 4, 60, 20, 15, LILAC, align.LEFT, label)
    const bar = mkBar(100, y, 196, 12, color)
    const val = mkText(300, y - 4, 60, 20, 15, LILAC, align.LEFT, '')
    return { bar, val }
  }
  u.hp = row(238, 'HP', GREEN)
  u.food = row(258, 'FOOD', ORANGE)
  u.joy = row(278, 'JOY', PINK)
  u.status = mkTextS(24, 284, W - 48, 34, 15, DIM, align.CENTER_H, '')
  u.explore = mkArtButton(45, 316, 'btn_explore', explore, { badge: true })
  const bx = [34, 116, 198, 280]
  mkArtButton(bx[0], 378, 'btn_feed', () => goto('feed', { id: leadMon().id, back: 'den' }, 1))
  mkArtButton(bx[1], 378, 'btn_team', () => goto('team', 0, 1))
  mkArtButton(bx[2], 378, 'btn_book', () => goto('book', 0, 1))
  u.train = mkArtButton(bx[3], 378, 'btn_train', train, { badge: true })
  u.train.offFn = () => toast(activeMinutes < 0 ? 'No heart rate data' : 'Get your pulse up: active minutes = XP', PINK)
  mkText(34, 430, W - 68, 18, 13, DIM, align.CENTER_H, 'left: GUIDE   right: BOSS   up: SETTINGS')
  updateDen()
}

function updateDen() {
  const u = screen.ui
  const m = leadMon()
  const s = SPECIES[m.sp]
  setText(u.tracks, st.tracks + '/' + TRACK_CAP)
  setText(u.charms, String(st.charms))
  const next = stepsToNextTrack()
  setText(u.walk, stepsToday < 0 ? 'no step counter: free track every 2 hours' : st.tracks >= TRACK_CAP ? fmt(stepsToday) + ' steps today: tracks full!' : 'next track in ' + next + ' steps  (' + fmt(stepsToday) + ' today)')
  updateFacing()
  setSrc(u.img, 'mon/' + m.sp + '.png')
  setText(u.name, s.name + '  Lv ' + m.lv)
  const mx = maxHp(m)
  setBar(u.hp.bar, m.hp / mx, hpColor(m.hp / mx))
  setText(u.hp.val, Math.ceil(m.hp) + '/' + mx)
  setBar(u.food.bar, m.full / 100)
  setText(u.food.val, Math.round(m.full) + '')
  setBar(u.joy.bar, m.joy / 100)
  setText(u.joy.val, Math.round(m.joy) + '')
  const egg = !!st.egg
  const eggReady = egg && st.egg.steps >= EGG_HATCH_STEPS
  setVisible(u.egg, egg)
  setVisible(u.eggTxt, egg)
  if (egg) {
    setSrc(u.egg, artSrc(eggReady ? 'ico_egg_ready' : 'ico_egg'))
    setText(u.eggTxt, eggReady ? 'TAP!' : Math.floor((st.egg.steps * 100) / EGG_HATCH_STEPS) + '%')
    setTextColor(u.eggTxt, eggReady ? GOLD : LILAC)
  }
  let status = 'Walk to find more Wristlings'
  let sc = LILAC
  let keep = false // an important one: never swapped for the coming-up line
  if (st.dream) {
    status = 'A DREAM VISITOR is waiting!'
    sc = PURPLE
    keep = true
  } else if (eggReady) {
    status = 'Your egg is hatching: tap it!'
    sc = GOLD
    keep = true
  } else if (!partyMons().some((p) => p.hp >= 1)) {
    status = 'Your team is resting...'
    sc = RED
    keep = true
  } else if (m.full < HUNGRY_BELOW) {
    status = s.name + ' is hungry: -10% power'
    sc = ORANGE
  } else if (canEvolve(m) && m.joy < EVOLVE_JOY) {
    status = s.name + ' needs JOY to evolve'
    sc = PINK
  } else if (condMet('north')) {
    status = 'Facing north: something shimmers in the cold'
    sc = 0x8fe6ff
  } else if (condMet('dawn')) {
    status = 'Facing the sunrise: a lark is singing'
    sc = GOLD
  } else if (condMet('dusk')) {
    status = 'Facing the sunset: antlers glow on the horizon'
    sc = GOLD
  } else if (condMet('south')) {
    status = 'Facing the midday sun: something bristles'
    sc = GOLD
  } else if (condMet('battery')) {
    status = 'Low battery: something hungry for power is near'
    sc = ORANGE
  } else if (condMet('mist')) {
    status = 'Mist is rising: a lantern flickers'
    sc = LILAC
  } else if (condMet('rain')) {
    status = 'Rainy day: watery Wristlings are out'
    sc = BLUE
  } else if (condMet('sun')) {
    status = 'Sunny day: something bright hops around'
    sc = GOLD
  } else if (isWeekendAfternoon()) {
    status = 'Weekend afternoon: something sleepy is near'
    sc = GREEN
  } else if (condMet('kcal')) {
    status = fmt(KCAL_SPAWN) + ' kcal burned: a warm piglet sniffs around'
    sc = ORANGE
  } else if (m.joy >= HAPPY_FROM) {
    status = s.name + ' is happy: +10% power'
    sc = PINK
  } else if (stepsToday >= RARE_WALK_STEPS) {
    status = fmt(RARE_WALK_STEPS) + ' steps! Something big stirs...'
    sc = GOLD
  } else if (hourOf(now()) >= 11 && hourOf(now()) < 14) {
    status = 'Noon: the sun is at its strongest'
    sc = GOLD
  } else if (isNight() && isFullMoon()) {
    status = 'Full moon: something silver is out tonight'
    sc = WHITE
  } else if (activeMinutes >= RARE_ACTIVE_MIN) {
    status = 'Your heart worked hard today: something stirs...'
    sc = ORANGE
  } else if (isNight()) {
    status = 'Night: Shadow Wristlings are out'
    sc = PURPLE
  }
  // every other 10 seconds: a seasonal event that is about to start
  const up = keep ? '' : upcoming()
  if (up && Math.floor(now() / 10000) % 2 === 1) {
    status = up
    sc = GOLD
  }
  setText(u.status, status)
  setTextColor(u.status, sc)
  if (st.dream) setArtButton(u.explore, true, 'btn_dream')
  else setArtButton(u.explore, true, st.tracks > 0 ? 'btn_explore' : 'btn_notracks')
  setBadge(u.explore, st.dream ? 0 : st.tracks)
  const tm = trainMinutes()
  setArtButton(u.train, tm > 0)
  setBadge(u.train, tm)
}

// ---------- den: the lead breathes ----------
// A slow up-and-down bob (the shadow narrows as it rises). Happy ones bob a bit
// quicker, hungry ones slow and low, a worn-out one rests. Tapping it makes it hop.
// Only moves the picture when a whole pixel changes, so it costs almost nothing.
const DEN_MON_Y = 62
const BOB_PX = 3 // how high it rises
const BOB_MS = 2400 // one breath
const BOB_HAPPY_MS = 1600
const BOB_HUNGRY_MS = 3400
const HOP_PX = 16
const HOP_MS = 420

function denIdle(t) {
  const u = screen.ui
  if (!u.img || !u.shadow) return
  const m = leadMon()
  let dy = 0
  if (m.hp >= 1) {
    const hungry = m.full < HUNGRY_BELOW
    const period = hungry ? BOB_HUNGRY_MS : m.joy >= HAPPY_FROM ? BOB_HAPPY_MS : BOB_MS
    const amp = hungry ? BOB_PX / 2 : BOB_PX
    dy -= amp * (0.5 - 0.5 * Math.cos((2 * Math.PI * (t % period)) / period))
  }
  const ht = t - u.hopAt
  if (ht < HOP_MS) dy -= HOP_PX * Math.sin((Math.PI * ht) / HOP_MS)
  dy = Math.round(dy)
  setPos(u.img, CX - 64, DEN_MON_Y + dy)
  // the shadow gets a little narrower the higher it is
  const w = Math.round(100 + dy * 1.5)
  setRect(u.shadow, { x: CX - Math.round(w / 2), w })
}

// the small compass line on the den ("facing NE"), refreshed often
function updateFacing() {
  const u = screen.ui
  if (!u.facing) return
  const h = heading()
  trackHeading(h, now())
  setText(u.facing, h < 0 ? '' : 'facing ' + DIRS[dirIndex(h)] + (spunAround() ? '  spun!' : heldSteady() ? '  steady' : ''))
}

function explore() {
  const party = partyMons()
  if (!party.some((p) => p.hp >= 1)) return toast('Your team needs rest first', RED)
  if (st.dream) {
    st.dream = false
    const lv = clamp(leadMon().lv - 1, 3, MAX_LV)
    return startBattle(enemyMon('lullamoth', lv), true)
  }
  if (st.tracks <= 0) {
    const n = stepsToNextTrack()
    return toast(n > 0 ? 'Walk ' + n + ' steps for a track' : 'Out of tracks: walk a little!', GOLD)
  }
  st.tracks--
  startBattle(rollWild(), false)
}

function rollWild() {
  const lead = leadMon()
  const night = isNight()
  const h = hourOf(now())
  // legends (one per player), then the rare ones (see RARE_* in the balance section)
  const legend = legendReady()
  if (legend && Math.random() < LEGEND_CHANCE) return enemyMon(legend, clamp(lead.lv + 1, 10, MAX_LV))
  for (const r of RARES) if (r.when() && Math.random() < r.chance) return enemyMon(r.id, clamp(lead.lv, 6, MAX_LV))
  const ok = (id) => {
    const s = SPECIES[id]
    if (s.rare || (!night && s.time === 'night') || (s.cond && !condMet(s.cond))) return false
    // keep strong single-stage species out of early-game fights
    if (!PRE[id] && !s.evo && lead.lv < 10 && s.hp + s.atk + s.def >= 180) return false
    return true
  }
  const base = BOOK.filter((id) => ok(id) && !PRE[id])
  const evolved = BOOK.filter((id) => ok(id) && PRE[id] && (!PRE[PRE[id]] || lead.lv >= WILD_FINAL_LV))
  let sp
  if (lead.lv >= WILD_EVOLVED_LV && evolved.length && Math.random() < WILD_EVOLVED_CHANCE) sp = pick(evolved)
  else {
    // at night the Shadow line is three times as likely
    const bag = []
    for (const id of base) {
      bag.push(id)
      if (night && SPECIES[id].el === 'shadow') bag.push(id, id)
      // creatures tied to weather, weekend, calories or the compass are easier to meet while it lasts
      if (SPECIES[id].cond) for (let k = 1; k < (SPECIES[id].condWeight || COND_WEIGHT); k++) bag.push(id)
    }
    sp = pick(bag)
  }
  // early on wild ones are never above your lead's level
  let lv = clamp(lead.lv + (lead.lv < 10 ? randInt(-3, 0) : randInt(-3, 1)), 2, MAX_LV)
  if (PRE[sp]) lv = Math.max(lv, SPECIES[PRE[sp]].evoLv)
  return enemyMon(sp, lv)
}

// days since the last new moon (0 - 29.5); 14.8 is full moon
function moonAge(t) {
  const SYNODIC = 29.530588853
  const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14) // a known new moon
  const a = ((t - NEW_MOON) / 86400000) % SYNODIC
  return a < 0 ? a + SYNODIC : a
}
function isFullMoon() {
  return Math.abs(moonAge(now()) - 29.530588853 / 2) <= FULL_MOON_DAYS
}
// the rare ones: each only while its moment lasts, then in `chance` of explores
const RARES = [
  { id: 'solarion', chance: RARE_NOON_CHANCE, when: () => hourOf(now()) >= 11 && hourOf(now()) < 14, text: 'Only between 11:00 and 14:00', guide: 'noon, 11:00 - 14:00' },
  { id: 'boulderon', chance: RARE_WALK_CHANCE, when: () => stepsToday >= RARE_WALK_STEPS, text: 'Only after ' + fmt(RARE_WALK_STEPS) + ' steps in a day', guide: fmt(RARE_WALK_STEPS) + ' steps in a day' },
  { id: 'midnyx', chance: RARE_MIDNIGHT_CHANCE, when: () => hourOf(now()) === 23 || hourOf(now()) === 0, text: 'Only between 23:00 and 01:00', guide: 'around midnight, 23:00 - 01:00' },
  { id: 'pulsarex', chance: RARE_ACTIVE_CHANCE, when: () => activeMinutes >= RARE_ACTIVE_MIN, text: 'Only after ' + RARE_ACTIVE_MIN + ' minutes of high heart rate today (the same minutes as TRAIN)', guide: RARE_ACTIVE_MIN + ' high-heart-rate minutes in a day' },
  { id: 'selenyx', chance: RARE_MOON_CHANCE, when: () => isNight() && isFullMoon(), text: 'Only at night around a full moon', guide: 'a full-moon night' }
]
// ---------- step eggs ----------
const CALENDAR = ['halloween', 'december', 'easter', 'newyear', 'valentine', 'midsummer', 'friday13']
function giveEgg() {
  if (st.egg) st.eggsWaiting++
  else st.egg = { steps: 0 }
}
// what can hatch: first forms and singles, but no rares and nothing seasonal
function eggPool() {
  return BOOK.filter((id) => !PRE[id] && !SPECIES[id].rare && CALENDAR.indexOf(SPECIES[id].cond) < 0)
}
function hatchEgg() {
  if (!st.egg || st.egg.steps < EGG_HATCH_STEPS) return
  const pool = eggPool()
  const fresh = pool.filter((id) => !st.caught[id])
  const sp = fresh.length && Math.random() < EGG_NEW_CHANCE ? pick(fresh) : pick(pool)
  const m = newMon(sp, Math.max(EGG_HATCH_LV, Math.floor(leadMon().lv / 2)))
  m.full = 80
  m.joy = 80
  st.mons.push(m)
  const first = !st.caught[sp]
  st.caught[sp] = true
  st.seen[sp] = true
  let where = 'It is waiting in your team list.'
  if (st.party.length < PARTY_MAX) {
    st.party.push(m.id)
    where = 'It joined your party!'
  }
  st.egg = null
  if (st.eggsWaiting > 0) {
    st.eggsWaiting--
    st.egg = { steps: 0 }
  }
  notices.push({ title: 'IT HATCHED!', text: 'Out came ' + (first ? 'a NEW one: ' : '') + SPECIES[sp].name + ', Lv ' + m.lv + '! ' + where + (st.egg ? ' Your next egg is warming up.' : ''), img: 'mon/' + sp + '.png' })
  buzz('mid', 'catch')
  home()
}
function eggTap() {
  if (!st.egg) return toast('Walk ' + fmt(EGG_FIND_STEPS) + ' steps in a day to find an egg', GOLD)
  if (st.egg.steps >= EGG_HATCH_STEPS) return hatchEgg()
  toast(fmt(EGG_HATCH_STEPS - st.egg.steps) + ' more steps to hatch' + (st.eggsWaiting ? ' (+' + st.eggsWaiting + ' waiting)' : ''), GOLD)
}

// ---------- book rewards ----------
// a badge for each book category, once every creature in it is caught
const BADGES = [
  { id: 'everyday', name: 'Everyday', has: (s) => !s.cond && !s.time && !s.rare },
  { id: 'night', name: 'Night', has: (s) => s.time === 'night' && !s.cond },
  { id: 'weather', name: 'Weather', has: (s) => ['rain', 'sun', 'mist'].indexOf(s.cond) >= 0 },
  { id: 'life', name: 'Daily life', has: (s) => ['kcal', 'weekend', 'battery'].indexOf(s.cond) >= 0 },
  { id: 'compass', name: 'Compass', has: (s) => ['compass', 'north', 'dawn', 'dusk', 'south', 'spin', 'steady'].indexOf(s.cond) >= 0 },
  { id: 'calendar', name: 'Calendar', has: (s) => CALENDAR.indexOf(s.cond) >= 0 },
  { id: 'rare', name: 'Rare', has: (s) => s.rare && !s.legend },
  { id: 'legend', name: 'Legends', has: (s) => !!s.legend }
]
function badgeCount(b) {
  const ids = BOOK.filter((id) => b.has(SPECIES[id]))
  return [ids.filter((id) => st.caught[id]).length, ids.length]
}
function rewardText(charms, gold, egg) {
  const parts = [charms + ' charms']
  if (gold) parts.push(gold + ' Gold Berr' + (gold > 1 ? 'ies' : 'y'))
  if (egg) parts.push('an EGG')
  return parts.slice(0, -1).join(', ') + (parts.length > 1 ? ' and ' : '') + parts[parts.length - 1]
}
function nextMilestone() {
  return MILESTONES.find((x) => st.milestones.indexOf(x[0]) < 0) || null
}
// give any book reward that is due (called on the way home)
function checkBook() {
  if (!st.started) return
  const n = BOOK.filter((id) => st.caught[id]).length
  for (const [at, charms, gold, egg] of MILESTONES) {
    if (n < at || st.milestones.indexOf(at) >= 0) continue
    st.milestones.push(at)
    st.charms += charms
    st.berries.gold += gold
    if (egg) giveEgg()
    notices.push({ title: at + ' CAUGHT!', text: 'Your book reached ' + at + ' Wristlings. Reward: ' + rewardText(charms, gold, egg) + '.', img: '' })
  }
  for (const b of BADGES) {
    const [got, all] = badgeCount(b)
    if (st.badges[b.id] || !all || got < all) continue
    st.badges[b.id] = true
    st.charms += BADGE_CHARMS
    st.berries.gold += BADGE_GOLD
    notices.push({ title: 'BADGE: ' + b.name.toUpperCase(), text: 'You caught every ' + b.name.toLowerCase() + ' Wristling! Reward: ' + rewardText(BADGE_CHARMS, BADGE_GOLD, false) + '.', img: '' })
  }
}

// ---------- the weekly boss ----------
// Monday's day key: the week the boss belongs to
function weekKey(t) {
  const d = new Date(t)
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7), 12).getTime())
}
// fully evolved ones that stay put in battle (no compass ones) and are not seasonal
function bossPool() {
  return BOOK.filter((id) => PRE[id] && !SPECIES[id].evo && SPECIES[id].cond !== 'compass' && CALENDAR.indexOf(SPECIES[id].cond) < 0)
}
function bossNow() {
  const pool = bossPool()
  const wk = weekKey(now())
  const steps = st.week.key === wk ? st.week.steps : 0
  return { sp: pool[(Math.floor(wk / 7) * 31) % pool.length], lv: clamp(BOSS_MIN_LV + Math.floor(steps / BOSS_STEPS_PER_LV), BOSS_MIN_LV, BOSS_MAX_LV), won: st.bossWon === wk }
}
function bossReward(lv) {
  return { charms: 2 + Math.floor(lv / 8), gold: lv >= 24 ? 2 : 1, egg: lv >= BOSS_EGG_LV }
}
function fightBoss() {
  const b = bossNow()
  if (b.won) return toast('Beaten! A new boss comes on Monday', GOLD)
  if (!partyMons().some((p) => p.hp >= 1)) return toast('Your team needs rest first', RED)
  const e = enemyMon(b.sp, b.lv)
  e.boss = true
  e.hp = maxHp(e)
  startBattle(e, false)
}
function buildBoss() {
  const b = bossNow()
  const r = bossReward(b.lv)
  const left = 7 - ((new Date(now()).getDay() + 6) % 7)
  mkArtC(8, 't_boss')
  mkText(30, 50, W - 60, 20, 15, LILAC, align.CENTER_H, 'new boss in ' + left + ' day' + (left > 1 ? 's' : ''))
  mkArt(CX - 70, 72, 'plate140')
  mkImg(CX - 64, 76, 'mon/' + b.sp + '.png')
  mkTextS(30, 208, W - 60, 30, 24, WHITE, align.CENTER_H, SPECIES[b.sp].name + '  Lv ' + b.lv)
  const text = b.won
    ? 'Beaten this week! A new boss comes on Monday.'
    : 'It gains a level for every ' + fmt(BOSS_STEPS_PER_LV) + ' steps you walk this week. Win: ' + rewardText(r.charms, r.gold, r.egg) + '.'
  mkTextS(34, 238, W - 68, 74, fitSize(text, W - 68, 74, 17, 13), b.won ? GREEN : LILAC, align.CENTER_H, text)
  mkArtButton(45, 316, b.won ? 'btn_fight_off' : 'btn_fight', fightBoss)
  mkArtButton(95, 380, 'btn_back', () => home())
}

// ---------- coming up ----------
// a seasonal event that starts within UPCOMING_DAYS days, for the den ('' if none)
function upcoming() {
  const t = new Date(now())
  const easters = easterDays(t.getFullYear())
  for (let k = 1; k <= UPCOMING_DAYS; k++) {
    const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + k, 12)
    const m = d.getMonth() + 1
    const day = d.getDate()
    const when = k === 1 ? 'tomorrow' : 'in ' + k + ' days'
    const starts = (r) => r[0][0] === m && r[0][1] === day
    if (starts(HALLOWEEN)) return 'Coming up: Halloween ones arrive ' + when
    if (m === 12 && day === 1) return 'Coming up: December ones arrive ' + when
    if (starts(NEWYEAR)) return 'Coming up: New Year ones ' + when
    if (starts(VALENTINE)) return 'Coming up: Valentine\'s ones ' + when
    if (starts(MIDSUMMER)) return 'Coming up: midsummer nights ' + when
    if (easters.some((e) => dayKey(e.getTime() + EASTER_DAYS[0] * 86400000) === dayKey(d.getTime()))) return 'Coming up: Easter week starts ' + when
    if (d.getDay() === 5 && day === 13) return 'Coming up: Friday the 13th ' + when
  }
  // full moon: tonight is not one yet, but a night in the next days is
  const night = (k) => { const n = new Date(t.getFullYear(), t.getMonth(), t.getDate() + k, 23).getTime(); return Math.abs(moonAge(n) - 29.530588853 / 2) <= FULL_MOON_DAYS }
  if (!night(0)) for (let k = 1; k <= UPCOMING_DAYS; k++) if (night(k)) return 'Coming up: full moon ' + (k === 1 ? 'tomorrow night' : 'in ' + k + ' days')
  return ''
}

// a legend that may appear now, if any
function legendReady() {
  for (const id of BOOK) {
    const s = SPECIES[id]
    if (!s.legend || st.caught[id]) continue
    if (s.legend === 'steps' && st.life.steps >= LEGEND_STEPS) return id
    if (s.legend === 'streak' && streakNow() >= STREAK_DAYS && st.legendRest !== dayKey(now())) return id
  }
  return null
}

function enemyMon(sp, lv) {
  const m = { id: 0, sp, lv, xp: 0, hp: 0, full: 70, joy: 50 }
  m.hp = maxHp(m)
  return m
}

function train() {
  const tm = trainMinutes()
  if (tm <= 0) return
  const m = leadMon()
  const used = Math.min(tm, TRAIN_XP_CAP_MIN)
  const xp = used * (TRAIN_XP_BASE + m.lv)
  st.train.used += tm
  m.joy = clamp(m.joy + 5, 0, 100)
  const msgs = gainXp(m, xp)
  for (const p of partyMons()) {
    if (p === m) continue
    p.joy = clamp(p.joy + 2, 0, 100)
    msgs.push(...gainXp(p, Math.floor(xp / 2)).filter((x) => x.indexOf(' XP') < 0))
  }
  notices.push({ title: 'TRAINING', text: used + ' active minutes today' + (tm > used ? ' (' + TRAIN_XP_CAP_MIN + ' max)' : '') + '!\n' + msgs.join('\n'), img: 'mon/' + m.sp + '.png' })
  buzz('mid', 'other')
  home()
}

// ---------- battle ----------
// pIdx: who is really fighting (the game logic). showIdx: who the screen shows. A turn is
// worked out at once and then played back as messages, so showIdx only changes when
// the "Go, X!" message appears.
const B = { enemy: null, pIdx: 0, showIdx: 0, queue: [], until: 0, busy: false, shown: { p: 0, e: 0 }, target: { p: 0, e: 0 }, guard: { p: false, e: false }, rests: { p: 0, e: 0 }, blink: null, over: false }

// the creature the battle screen is showing right now (see B.showIdx)
function shownMon() {
  return monById(st.party[B.showIdx])
}
function activeMon() {
  return monById(st.party[B.pIdx])
}
function nextHealthy(skip) {
  for (let i = 0; i < st.party.length; i++) {
    const m = monById(st.party[i])
    if (i !== skip && m && m.hp >= 1) return i
  }
  return -1
}

function startBattle(enemy, dream) {
  B.enemy = enemy
  B.pIdx = Math.max(0, nextHealthy(-1))
  B.showIdx = B.pIdx
  B.queue = []
  B.until = 0
  B.busy = false
  B.over = false
  B.guard = { p: false, e: false }
  B.rests = { p: 0, e: 0 }
  B.status = { p: null, e: null }
  B.weather = battleWeather()
  B.blink = null
  B.later = []
  B.entered = false
  B.fx = { e: newFx(), p: newFx(), flash: 0, flashColor: 0 }
  B.shown.e = B.target.e = enemy.hp
  B.shown.p = B.target.p = activeMon().hp
  st.seen[enemy.sp] = true
  say(enemy.boss ? 'BOSS ' + SPECIES[enemy.sp].name + ' steps up!' : (dream ? 'A dreamy ' : 'A wild ') + SPECIES[enemy.sp].name + (dream ? ' drifted in!' : ' wandered in!'), null, 750)
  if (B.weather) say(weatherLine(B.weather), null, 1000)
  // a compass creature points somewhere: face it, or it may get away
  B.needle = SPECIES[enemy.sp].cond === 'compass' ? randInt(0, 7) * 45 : null
  if (B.needle !== null) say('It points ' + DIR_WORDS[dirIndex(B.needle)] + '! Face it or it may flee', null, 1400)
  goto('battle')
}

// today's forecast in battle: 'rain' | 'sun' (daytime) | 'snow', or null
function battleWeather() {
  const k = weatherKind()
  return k === 'rain' || k === 'snow' || (k === 'sun' && !isNight()) ? k : null
}
function weatherLine(w) {
  const x = WEATHER[w]
  return x.name + ': ' + ELEMENTS[x.boost].name + ' moves +' + pct(WEATHER_BOOST - 1) + ', ' + ELEMENTS[x.dampen].name + ' -' + pct(1 - WEATHER_DAMPEN)
}
function weatherMult(el) {
  const x = B.weather && WEATHER[B.weather]
  if (!x || !el) return 1
  return el === x.boost ? WEATHER_BOOST : el === x.dampen ? WEATHER_DAMPEN : 1
}
// how well a move hits a creature: its element(s), the attacker's own-element bonus, the weather
function hitMult(mvEl, me, foe) {
  const f = SPECIES[foe.sp]
  const own = mvEl && elementsOf(SPECIES[me.sp]).indexOf(mvEl) >= 0 ? SAME_ELEMENT_BONUS : 1
  return effectiveness(mvEl, f.el, f.el2) * own * weatherMult(mvEl)
}
// a creature's element(s) as text: FIRE, or WATER/ELEC for two
function elName(s) {
  return s.el2 ? SHORT[s.el] + '/' + SHORT[s.el2] : ELEMENTS[s.el].name
}

// ---------- status: burn, freeze, sleep ----------
const STATUS = {
  burn: { label: 'BURN', color: 0xff8a3d, got: ' was burned!', end: "'s burn healed" },
  freeze: { label: 'FROZEN', color: 0x8fe6ff, got: ' was frozen solid!', end: ' thawed out!' },
  sleep: { label: 'ASLEEP', color: 0xc8c0ff, got: ' fell asleep!', end: ' woke up!' }
}
function canGetStatus(m, kind, side) {
  if (B.status[side] || m.hp < 1) return false
  const els = elementsOf(SPECIES[m.sp])
  return !(kind === 'burn' && els.indexOf('fire') >= 0) && !(kind === 'freeze' && els.indexOf('ice') >= 0)
}
function applyStatus(side, m, kind) {
  const turns = kind === 'burn' ? BURN_TURNS : kind === 'freeze' ? FREEZE_TURNS : randInt(SLEEP_TURNS[0], SLEEP_TURNS[1])
  B.status[side] = { kind, turns }
  const who = (side === 'e' ? 'Wild ' : '') + SPECIES[m.sp].name
  say(who + STATUS[kind].got, () => popText(side, STATUS[kind].label, STATUS[kind].color), 800)
}
// a burned creature loses HP after it moves. Returns false when it was worn out.
function burnTick(side) {
  const me = side === 'p' ? activeMon() : B.enemy
  const b = B.status[side]
  if (!b || b.kind !== 'burn' || me.hp < 1 || B.over) return true
  const who = (side === 'e' ? 'Wild ' : '') + SPECIES[me.sp].name
  const dmg = Math.max(1, Math.round(maxHp(me) * BURN_DMG))
  me.hp = Math.max(0, me.hp - dmg)
  const v = me.hp
  say(who + ' is hurt by its burn', () => {
    B.target[side] = v
    popText(side, '-' + dmg, STATUS.burn.color)
  }, 700)
  b.turns--
  if (b.turns <= 0 && me.hp >= 1) {
    B.status[side] = null
    say(who + STATUS.burn.end, null, 600)
  }
  if (me.hp < 1) {
    if (side === 'e') enemyFainted()
    else playerFainted()
    return false
  }
  return true
}

// queue a battle message; fn runs when the message appears
function say(text, fn, ms) {
  B.queue.push({ text, fn, ms: ms === undefined ? (text ? MSG_MS : 0) : ms })
}

// ---------- battle effects ----------
// Each side has timestamps for its animations: lunge (attacking), shake (hit),
// drop (fainting), enter (sliding in) and a popping damage number.
const MSG_MS = 800
const ENEMY_POS = { x: 236, y: 26 }
const PLAYER_POS = { x: 30, y: 148 }
const LUNGE_MS = 220
const SHAKE_MS = 360
const DROP_MS = 420
const ENTER_MS = 450
const POP_MS = 750
const HIT_DELAY_MS = 170 // the hit lands as the lunge reaches the target

function newFx() {
  return { lunge: -1e9, shake: -1e9, drop: 0, enter: -1e9, pop: -1e9, vis: true }
}

function later(ms, fn) {
  B.later.push({ at: now() + ms, fn })
}

// a number (or word) that floats up from a sprite
function popText(side, text, color) {
  const o = screen.ui.pop && screen.ui.pop[side]
  if (!o) return
  // show first, then change: a hidden widget may not redraw its new content
  setVisible(o, true)
  setText(o, text)
  setTextColor(o, color)
  B.fx[side].pop = now()
}

// Moves a widget. Rects/rings use MORE; text/img use X/Y (safe across Zepp).
function setPos(o, x, y, force) {
  x = Math.round(x)
  y = Math.round(y)
  if (o.sh) setPos(o.sh, x + 1, y + 2, force)
  if (!force && o.x === x && o.y === y) return
  try {
    if (o.b && o.t === undefined && o.src === undefined) {
      if (force || o.b.x !== x || o.b.y !== y) {
        o.b.x = x; o.b.y = y
        o.w.setProperty(prop.MORE, o.b)
      }
    } else if (o.src !== undefined) {
      if (force || o.x !== x) o.w.setProperty(prop.X, x)
      if (force || o.y !== y) o.w.setProperty(prop.Y, y)
    } else {
      if (force || o.x !== x) o.w.setProperty(prop.X, x)
      if (force || o.y !== y) o.w.setProperty(prop.Y, y)
    }
  } catch (e) {
    try {
      if (o.b) o.w.setProperty(prop.MORE, Object.assign({}, o.b, { x, y }))
      else if (o.src !== undefined) o.w.setProperty(prop.MORE, { x, y, src: o.src })
      else o.w.setProperty(prop.MORE, { x, y, w: o.pw || o.w0 || 0, h: o.ph || o.h || 0 })
    } catch (e2) {}
  }
  o.x = x
  o.y = y
}

function tickFx(t) {
  const u = screen.ui
  for (const side of ['e', 'p']) {
    const f = B.fx[side]
    const base = side === 'e' ? ENEMY_POS : PLAYER_POS
    const toward = side === 'e' ? -1 : 1 // the direction of the other creature
    let dx = 0
    let dy = 0
    let gone = !f.vis
    const lt = t - f.lunge
    if (lt < LUNGE_MS) {
      dx += toward * 20 * Math.sin((Math.PI * lt) / LUNGE_MS)
      dy -= toward * 8 * Math.sin((Math.PI * lt) / LUNGE_MS)
    }
    const st2 = t - f.shake
    if (st2 < SHAKE_MS) dx += Math.sin(st2 / 20) * 8 * (1 - st2 / SHAKE_MS)
    if (f.drop) {
      const k = Math.min(1, (t - f.drop) / DROP_MS)
      dy += k * k * 70
      if (k >= 1) gone = true
    }
    const et = t - f.enter
    if (et < ENTER_MS) {
      const k = 1 - et / ENTER_MS
      dx -= toward * k * k * 230
    }
    // party-member visibility is handled by refreshPlayer(), not every tick
    const img = side === 'e' ? u.eImg : u.pImgs[B.showIdx]
    setPos(img, base.x + dx, base.y + dy)
    const blinkOff = B.blink && B.blink.side === side && B.blink.n > 0 && Math.floor(B.blink.n / 2) % 2 === 1
    setVisible(img, !gone && !blinkOff)
    // damage number: rises 30 px and disappears
    const pt = t - f.pop
    const pop = u.pop[side]
    if (pt < POP_MS) {
      setPos(pop, pop.bx, pop.by - 30 * (pt / POP_MS))
      setVisible(pop, true)
    } else setVisible(pop, false)
  }
  if (B.blink) {
    B.blink.n--
    if (B.blink.n <= 0) B.blink = null
  }
  const fl = t - B.fx.flash < 140
  if (fl) setRect(u.flash, { color: B.fx.flashColor })
  setVisible(u.flash, fl)
}

function buildBattle() {
  const u = screen.ui
  const e = B.enemy
  const es = SPECIES[e.sp]
  // a full-screen tint above the background, flashed on big hits
  u.flash = mkRect(0, 0, W, H, BG, 0)
  setVisible(u.flash, false)
  // enemy panel
  mkArt(26, 32, 'pnl_info')
  mkRect(40, 46, 10, 10, ELEMENTS[es.el].color, 5)
  mkTextS(56, 36, 118, 30, 22, WHITE, align.LEFT, es.name)
  mkText(150, 36, 62, 30, 18, LILAC, align.RIGHT, 'Lv ' + e.lv)
  u.eBar = mkBar(40, 70, 168, 12, GREEN)
  mkText(40, 86, 168, 20, 14, ELEMENTS[es.el].color, align.LEFT, elName(es))
  u.eHint = mkText(40, 86, 168, 20, 14, DIM, align.RIGHT, 'tap: stats')
  addTap(26, 32, 196, 78, openStats)
  u.eImg = mkImg(ENEMY_POS.x, ENEMY_POS.y, 'mon/' + e.sp + '.png')
  // player
  // one picture per party member, made once: swapping only shows / hides them.
  // (Changing an image's picture while it is hidden did not redraw on the watch.)
  u.pImgs = st.party.map((id) => {
    const im = mkImg(PLAYER_POS.x, PLAYER_POS.y, 'mon/' + monById(id).sp + '_b.png')
    setVisible(im, false)
    return im
  })
  mkArt(172, 178, 'pnl_info')
  u.pDot = mkRect(186, 190, 10, 10, WHITE, 5)
  u.pName = mkTextS(202, 180, 108, 30, 22, WHITE, align.LEFT, '')
  u.pLv = mkText(296, 180, 62, 30, 18, LILAC, align.RIGHT, '')
  u.pBar = mkBar(186, 216, 168, 12, GREEN)
  u.pHp = mkText(186, 230, 168, 22, 16, LILAC, align.RIGHT, '')
  // who moves first this turn (from both speeds; GUARD always goes first)
  u.order = mkText(186, 230, 100, 22, 16, GREEN, align.LEFT, '')
  addTap(172, 178, 196, 78, openStats)
  // message
  mkArt(18, 260, 'pnl_msg')
  u.msg = mkText(26, 260, W - 52, 42, 19, WHITE, align.CENTER_H, '')
  // moves: the button colour is the move's element
  u.moves = [0, 1, 2].map((i) => {
    const x = 24 + i * 116
    const b = mkArtButton(x, 304, 'btn_move_none', () => act('move', b.mv), { label: '', labelY: 4, labelH: 28, size: 18, offKey: 'btn_move_off' })
    b.tag = mkText(x, 331, 110, 20, 14, GOLD, align.CENTER_H, '')
    return b
  })
  u.catchBtn = mkArtButton(36, 368, 'btn_catch', tryCatch, { badge: true })
  u.catchBtn.offFn = () => toast(B.busy ? '...' : 'No charms left: walk to find more', GOLD)
  u.swapBtn = mkArtButton(144, 368, 'btn_swap', () => act('swap'))
  u.runBtn = mkArtButton(250, 368, 'btn_run', run)
  // floating damage numbers, above the sprites and panels
  const mkPop = (x, y) => {
    const o = mkText(x, y, 120, 40, 32, WHITE, align.CENTER_H, '')
    o.x = o.bx = x
    o.y = o.by = y
    setVisible(o, false)
    return o
  }
  u.pop = { e: mkPop(ENEMY_POS.x + 4, ENEMY_POS.y + 30), p: mkPop(PLAYER_POS.x - 4, PLAYER_POS.y + 20) }
  buildStatsOverlay()
  // both creatures slide in when the battle starts
  if (!B.entered) {
    B.entered = true
    B.fx.e.enter = B.fx.p.enter = now()
  }
  refreshPlayer()
  tickFx(now())
  if (!B.busy && !B.queue.length && !B.over) setText(u.msg, 'What will ' + SPECIES[activeMon().sp].name + ' do?')
  updateBattle()
}

function refreshPlayer() {
  const u = screen.ui
  if (screen.name !== 'battle') return
  // only the active party member is drawn; B.showIdx changes only on a swap
  u.pImgs.forEach((im, i) => setVisible(im, i === B.showIdx))
  const m = shownMon()
  const s = SPECIES[m.sp]
  setRect(u.pDot, { color: ELEMENTS[s.el].color })
  setText(u.pName, s.name)
  setText(u.pLv, 'Lv ' + m.lv)
  const mvs = movesOf(m)
  const es = SPECIES[B.enemy.sp]
  u.moves.forEach((b, i) => {
    const id = mvs[i]
    b.mv = id
    if (!id) {
      setArtButton(b, false, 'btn_move_none')
      setText(b.txt, '-')
      setText(b.tag, '')
      return
    }
    const mv = MOVES[id]
    setArtButton(b, b.on, 'btn_move_' + (mv.el || 'none'))
    setText(b.txt, mv.name)
    const eff = mv.kind === 'hit' ? effectiveness(mv.el, es.el, es.el2) : 1
    setText(b.tag, mv.kind === 'guard' ? 'BLOCK' : mv.kind === 'heal' ? 'HEAL' : mv.kind === 'status' ? STATUS[mv.status].label : eff > 1 ? 'STRONG' : eff < 1 ? 'WEAK' : 'POW ' + mv.pow)
    setTextColor(b.tag, eff > 1 ? 0x9cff8a : eff < 1 ? 0xffa0a0 : mv.kind === 'hit' ? 0xe0dcff : 0xa8e0ff)
  })
}

// ---------- stats comparison (tap a panel in battle) ----------
// Your creature's numbers are always shown; a wild one's only once you have
// caught that species (otherwise "?").
const STAT_ROWS = [['HP', 'hp'], ['ATK', 'atk'], ['DEF', 'def'], ['SPD', 'spd']]

function buildStatsOverlay() {
  const u = screen.ui
  const o = (u.stats = { ws: [], open: false })
  const add = (w) => {
    o.ws.push(w)
    return w
  }
  add(mkRect(0, 0, W, H, INK, 0))
  add(mkArt(20, 20, 'pnl_big'))
  add(mkArtC(18, 't_stats'))
  o.col = [30, 235].map((x) => ({
    who: add(mkText(x, 56, 125, 20, 14, DIM, align.CENTER_H, '')),
    name: add(mkTextS(x, 76, 125, 28, 20, WHITE, align.CENTER_H, '')),
    el: add(mkText(x, 104, 125, 22, 15, WHITE, align.CENTER_H, '')),
    vals: STAT_ROWS.map((r, i) => add(mkTextS(x, 136 + i * 40, 125, 34, 24, WHITE, align.CENTER_H, ''))),
    mood: add(mkText(x, 298, 125, 24, 15, DIM, align.CENTER_H, ''))
  }))
  STAT_ROWS.forEach((r, i) => add(mkText(155, 136 + i * 40, 80, 34, 16, DIM, align.CENTER_H, r[0])))
  o.note = add(mkText(36, 326, W - 72, 46, 15, DIM, align.CENTER_H, ''))
  add(mkText(40, 380, W - 80, 30, 15, DIM, align.CENTER_H, 'tap anywhere to close'))
  o.ws.forEach((w) => setVisible(w, false))
}

function moodText(m) {
  if (m.joy >= HAPPY_FROM) return ['HAPPY +10%', PINK]
  if (m.full < HUNGRY_BELOW) return ['HUNGRY -10%', ORANGE]
  return ['mood: normal', DIM]
}

function openStats() {
  const o = screen.ui.stats
  if (!o || B.busy) return
  // show first, then fill in: a hidden widget may not redraw its new content
  o.ws.forEach((w) => setVisible(w, true))
  o.open = true
  const mons = [activeMon(), B.enemy]
  const known = !!st.caught[B.enemy.sp]
  const stats = mons.map((m) => statsOf(m))
  mons.forEach((m, c) => {
    const col = o.col[c]
    const s = SPECIES[m.sp]
    setText(col.who, c === 0 ? 'YOURS' : 'WILD')
    setText(col.name, s.name)
    setText(col.el, elName(s) + '  Lv ' + m.lv)
    setTextColor(col.el, ELEMENTS[s.el].color)
    STAT_ROWS.forEach((r, i) => {
      const hidden = c === 1 && !known
      const v = r[1] === 'hp' ? Math.ceil(m.hp) + '/' + stats[c].hp : String(stats[c][r[1]])
      setText(col.vals[i], hidden ? '?' : v)
      // the better number of each pair is green (only when both are known)
      const mine = stats[c][r[1]]
      const theirs = stats[1 - c][r[1]]
      setTextColor(col.vals[i], !hidden && known && mine > theirs ? GREEN : hidden ? DIM : WHITE)
    })
    const md = c === 0 ? moodText(m) : ['', DIM]
    setText(col.mood, md[0])
    setTextColor(col.mood, md[1])
  })
  setText(o.note, known ? 'HP compares max HP. Green = better.' : 'Catch a ' + SPECIES[B.enemy.sp].name + ' to see its stats.')
}

function closeStats() {
  const o = screen.ui.stats
  o.ws.forEach((w) => setVisible(w, false))
  o.open = false
}

function updateBattle() {
  const u = screen.ui
  const m = shownMon()
  const e = B.enemy
  const pm = maxHp(m)
  const em = maxHp(e)
  setBar(u.pBar, B.shown.p / pm, hpColor(B.shown.p / pm))
  setBar(u.eBar, B.shown.e / em, hpColor(B.shown.e / em))
  setText(u.pHp, Math.ceil(B.shown.p) + ' / ' + pm)
  const ps = statsOf(m).spd
  const es = statsOf(e).spd
  const pst = B.status.p
  setText(u.order, pst ? STATUS[pst.kind].label : ps > es ? 'FIRST' : ps < es ? 'SECOND' : 'SAME SPD')
  if (B.needle !== null) {
    const h = heading()
    const ok = h >= 0 && angleGap(h, B.needle) <= NEEDLE_TOLERANCE
    setText(u.eHint, h < 0 ? 'points ' + DIRS[dirIndex(B.needle)] + ' (no compass)' : (ok ? 'facing it! ' : 'face ') + DIRS[dirIndex(B.needle)])
    setTextColor(u.eHint, ok ? GREEN : ORANGE)
  } else {
    const est = B.status.e
    // a two-element name is long: then the hint makes room
    setText(u.eHint, est ? STATUS[est.kind].label : SPECIES[e.sp].el2 ? '' : 'tap: stats')
    setTextColor(u.eHint, est ? STATUS[est.kind].color : DIM)
  }
  setTextColor(u.order, pst ? STATUS[pst.kind].color : ps > es ? GREEN : ps < es ? ORANGE : DIM)
  const free = !B.busy && !B.over
  u.moves.forEach((b) => setArtButton(b, free && !!b.mv))
  setArtButton(u.catchBtn, free && st.charms > 0)
  setBadge(u.catchBtn, st.charms)
  setArtButton(u.swapBtn, free && nextHealthy(B.pIdx) >= 0)
  setArtButton(u.runBtn, free)
}

function tickBattle(t) {
  let dirty = false
  // effects scheduled a moment after a message (the hit lands after the lunge)
  if (B.later.length) {
    const due = B.later.filter((l) => t >= l.at)
    B.later = B.later.filter((l) => t < l.at)
    for (const l of due) l.fn()
    if (screen.name !== 'battle') return
    dirty = true
  }
  // play the queued messages one by one
  if (t >= B.until && !B.later.length) {
    if (B.queue.length) {
      const q = B.queue.shift()
      B.busy = true
      if (q.fn) q.fn()
      if (screen.name !== 'battle') return
      if (q.text) setText(screen.ui.msg, q.text)
      B.until = t + q.ms
      dirty = true
    } else if (B.busy) {
      B.busy = false
      setText(screen.ui.msg, 'What will ' + SPECIES[activeMon().sp].name + ' do?')
      dirty = true
    }
  }
  // HP bars slide toward their new value
  for (const k of ['p', 'e']) {
    const d = B.target[k] - B.shown[k]
    if (d !== 0) {
      B.shown[k] = Math.abs(d) < 0.5 ? B.target[k] : B.shown[k] + d * 0.25
      dirty = true
    }
  }
  tickFx(t)
  // compass creatures need a live heading; otherwise only redraw on a change
  if (dirty || B.needle !== null) updateBattle()
}

function aiMove(e, foe) {
  const mvs = movesOf(e)
  const mx = maxHp(e)
  // healing moves have different IDs (Breather, Long Nap): match by kind
  const healMv = mvs.find((id) => MOVES[id].kind === 'heal')
  if (healMv && e.hp < mx * AI_REST_BELOW && B.rests.e < RESTS_PER_BATTLE && Math.random() < 0.6) return healMv
  if (mvs.indexOf('guard') >= 0 && Math.random() < 0.12) return 'guard'
  const sMv = mvs.find((id) => MOVES[id].kind === 'status')
  if (sMv && canGetStatus(foe, MOVES[sMv].status, 'p') && Math.random() < 0.3) return sMv
  const hits = mvs.filter((id) => MOVES[id].kind === 'hit')
  if (!hits.length) return mvs[0]
  // young wild ones pick moves more randomly, so early fights are gentler
  if (Math.random() < (e.lv < 8 ? 0.55 : 0.3)) return pick(hits)
  let best = hits[0]
  let bestV = -1
  for (const id of hits) {
    const mv = MOVES[id]
    const v = mv.pow * (mv.acc / 100) * hitMult(mv.el, e, foe)
    if (v > bestV) {
      bestV = v
      best = id
    }
  }
  return best
}

function act(kind, mvId) {
  if (B.busy || B.over || B.queue.length) return
  const e = B.enemy
  B.guard = { p: false, e: false }
  if (kind === 'move') {
    const p = activeMon()
    const eMv = aiMove(e, p)
    const pp = MOVES[mvId].prio || 0
    const ep = MOVES[eMv].prio || 0
    const ps = statsOf(p).spd
    const es = statsOf(e).spd
    const pFirst = pp !== ep ? pp > ep : ps !== es ? ps > es : Math.random() < 0.5
    const order = pFirst ? [['p', mvId], ['e', eMv]] : [['e', eMv], ['p', mvId]]
    for (const o of order) if (!doMove(o[0], o[1])) break
  } else if (kind === 'swap') {
    const next = nextHealthy(B.pIdx)
    if (next < 0) return
    const old = activeMon()
    B.pIdx = next
    B.status.p = null
    const m = activeMon()
    const hp = m.hp
    say('Come back, ' + SPECIES[old.sp].name + '!', () => (B.fx.p.vis = false), 650)
    say('Go, ' + SPECIES[m.sp].name + '!', () => sendIn(next, hp))
    doMove('e', aiMove(e, m))
  } else if (kind === 'enemy') {
    doMove('e', aiMove(e, activeMon()))
  }
  needleTurn()
  save()
}

// compass creatures: if you were not facing where it points, it may get away; then it turns
function needleTurn() {
  const e = B.enemy
  if (B.needle === null || B.over || e.hp < 1) return
  const name = SPECIES[e.sp].name
  if (!facing(B.needle, NEEDLE_TOLERANCE)) {
    if (Math.random() < NEEDLE_FLEE) {
      B.over = true
      say(name + ' ' + (SPECIES[e.sp].flee || 'swam away') + '! Face where it points', () => (B.fx.e.vis = false), 1200)
      say('', () => home(), 0)
      return
    }
    say(name + ' wriggles... face it!', null, 750)
  }
  let next = B.needle
  while (next === B.needle) next = randInt(0, 7) * 45
  B.needle = next
  say(name + ' now points ' + DIR_WORDS[dirIndex(next)] + '!', null, 1000)
}

// one creature uses one move, then a burn may hurt it. Returns false when someone was worn out.
function doMove(side, mvId) {
  return doMoveOnly(side, mvId) && burnTick(side)
}

function doMoveOnly(side, mvId) {
  const me = side === 'p' ? activeMon() : B.enemy
  const foe = side === 'p' ? B.enemy : activeMon()
  const other = side === 'p' ? 'e' : 'p'
  if (me.hp < 1 || foe.hp < 1) return false
  const mv = MOVES[mvId]
  const who = (side === 'e' ? 'Wild ' : '') + SPECIES[me.sp].name
  // asleep or frozen: this turn is skipped
  const stt = B.status[side]
  if (stt && stt.kind !== 'burn' && stt.turns > 0) {
    stt.turns--
    const k = STATUS[stt.kind]
    say(who + (stt.kind === 'sleep' ? ' is fast asleep...' : ' is frozen and can\'t move!'), () => popText(side, k.label, k.color), 800)
    if (stt.turns <= 0) {
      B.status[side] = null
      say(who + k.end, null, 650)
    }
    return true
  }
  if (mv.kind === 'status') {
    say(who + ' chose ' + mv.name + '!', () => (B.fx[side].lunge = now()))
    if (Math.random() * 100 >= mv.acc || !canGetStatus(foe, mv.status, other)) say('...but nothing happened.', null, 650)
    else applyStatus(other, foe, mv.status)
    return true
  }
  if (mv.kind === 'guard') {
    B.guard[side] = true
    say(who + ' chose Guard!', () => popText(side, 'GUARD', BLUE))
    return true
  }
  if (mv.kind === 'heal') {
    if (B.rests[side] >= RESTS_PER_BATTLE) {
      say(who + ' is too restless to use ' + mv.name)
      return true
    }
    B.rests[side]++
    const mx = maxHp(me)
    const before = me.hp
    me.hp = Math.min(mx, me.hp + Math.ceil(mx * (mv.heal || REST_HEAL)))
    const v = me.hp
    say(who + ' chose ' + mv.name + '!')
    say(who + ' feels better', () => {
      B.target[side] = v
      popText(side, '+' + Math.round(v - before), GREEN)
    }, 700)
    return true
  }
  if (Math.random() * 100 >= mv.acc) {
    say(who + ' chose ' + mv.name + '!', () => {
      B.fx[side].lunge = now()
      later(HIT_DELAY_MS, () => popText(other, 'MISS', DIM))
    })
    say('...but it missed!', null, 650)
    return true
  }
  const a = statsOf(me)
  const d = statsOf(foe)
  const fs = SPECIES[foe.sp]
  const eff = effectiveness(mv.el, fs.el, fs.el2)
  const stab = mv.el && elementsOf(SPECIES[me.sp]).indexOf(mv.el) >= 0 ? SAME_ELEMENT_BONUS : 1
  const crit = Math.random() < CRIT_CHANCE ? CRIT_MULT : 1
  let dmg = (((2 * me.lv) / 5 + 2) * mv.pow * (a.atk / d.def)) / 50 + 2
  dmg *= eff * stab * weatherMult(mv.el) * crit * (0.85 + Math.random() * 0.15)
  if (B.guard[other]) dmg *= GUARD_TAKEN
  dmg = Math.max(1, Math.round(dmg))
  foe.hp = Math.max(0, foe.hp - dmg)
  const v = foe.hp
  const big = eff > 1 || crit > 1
  say(who + ' chose ' + mv.name + '!', () => {
    // the attacker lunges; the hit lands a moment later
    B.fx[side].lunge = now()
    later(HIT_DELAY_MS, () => {
      B.target[other] = v
      B.fx[other].shake = now()
      B.blink = { side: other, n: 8 }
      popText(other, '-' + dmg + (crit > 1 ? '!' : ''), crit > 1 ? GOLD : eff > 1 ? ORANGE : eff < 1 ? DIM : WHITE)
      if (big) {
        B.fx.flash = now()
        B.fx.flashColor = crit > 1 ? 0x4a4214 : 0x4a2a12
      }
      buzz(other === 'p' || big ? 'strong' : 'light', 'battle')
    })
  })
  if (B.guard[other]) say('The guard softened the blow', null, 650)
  if (crit > 1) say('A critical hit!', null, 650)
  if (eff > 1) say("It's super effective!", null, 650)
  else if (eff < 1) say("It's not very effective...", null, 650)
  // some moves can also burn or freeze
  if (foe.hp >= 1 && mv.status && Math.random() < (mv.chance || 0) && canGetStatus(foe, mv.status, other)) applyStatus(other, foe, mv.status)
  if (foe.hp < 1) {
    if (other === 'e') enemyFainted()
    else playerFainted()
    return false
  }
  return true
}

function enemyFainted() {
  const e = B.enemy
  B.over = true
  say((e.boss ? 'The boss ' : 'Wild ') + SPECIES[e.sp].name + (e.boss ? ' is beaten!' : ' is worn out!'), () => {
    B.fx.e.drop = now()
    buzz('mid', 'battle')
  })
  // a streak legend that faints flies off until tomorrow
  if (SPECIES[e.sp].legend === 'streak') {
    st.legendRest = dayKey(now())
    say(SPECIES[e.sp].name + ' flew off... it will be back tomorrow.', null, 1000)
  }
  if (e.boss) {
    const r = bossReward(e.lv)
    st.bossWon = weekKey(now())
    st.charms += r.charms
    st.berries.gold += r.gold
    if (r.egg) giveEgg()
    say('Boss reward: ' + rewardText(r.charms, r.gold, r.egg) + '!', null, 1400)
  }
  const xp = Math.round((8 + e.lv * 6) * (SPECIES[e.sp].rare || e.boss ? 1.5 : 1) * (e.boss ? 2 : 1))
  const p = activeMon()
  p.joy = clamp(p.joy + 3, 0, 100)
  const msgs = gainXp(p, xp)
  for (const m of partyMons()) if (m !== p && m.hp >= 1) msgs.push(...gainXp(m, Math.floor(xp / 2)).filter((x) => x.indexOf(' XP') < 0))
  for (const msg of msgs) say(msg, null, 750)
  if (Math.random() < BERRY_DROP) {
    const b = Math.random() < 0.15 ? 'gold' : pick(['red', 'blue', 'green'])
    st.berries[b]++
    say('Found a ' + BERRIES.find((x) => x.id === b).name + '!', null, 750)
  }
  if (Math.random() < CHARM_DROP) {
    st.charms++
    say('Found a charm!', null, 750)
  }
  say('', () => home(), 0)
}

// the next party member slides in
function sendIn(idx, hp) {
  B.showIdx = idx
  B.shown.p = B.target.p = hp
  B.fx.p = newFx()
  B.fx.p.enter = now()
  refreshPlayer()
}

function playerFainted() {
  const m = activeMon()
  say(SPECIES[m.sp].name + ' is worn out!', () => {
    B.fx.p.drop = now()
    buzz('strong', 'battle')
  })
  const next = nextHealthy(B.pIdx)
  if (next >= 0) {
    B.pIdx = next
    B.status.p = null
    const hp = activeMon().hp
    say('Go, ' + SPECIES[activeMon().sp].name + '!', () => sendIn(next, hp))
    return
  }
  B.over = true
  say('Your team is worn out!')
  say('You hurry home to rest.', () => {
    for (const p of partyMons()) p.hp = Math.max(p.hp, 1)
  })
  say('', () => home(), 0)
}

function run() {
  if (B.busy || B.over) return
  B.over = true
  say('You got away safely.', null, 700)
  say('', () => home(), 0)
}

function tryCatch() {
  if (B.busy || B.over || st.charms <= 0) return
  if (B.enemy.boss) return toast('A boss cannot be caught', GOLD)
  st.charms--
  goto('catch')
}

// ---------- catching ----------
const CATCH = { phase: 'aim', t0: 0, step: -1, period: 1300, r: RING_MAX, rating: '', ok: false, wob: 0, next: 0 }
const COUNT_STEP_MS = 600 // each beat of the 3-2-1 countdown
const GO_SHOW_MS = 450 // how long GO! stays up once the ring moves
const CATCH_CY = 196

function catchChance(e, bonus) {
  const frac = e.hp / maxHp(e)
  let chance = (CATCH_BASE + (1 - frac) * CATCH_HP + bonus) * RARITY[rarityOf(e.sp)].mult
  if (e.lv > leadMon().lv + CATCH_OVERLEVEL) chance -= CATCH_OVERLEVEL_PENALTY
  return clamp(chance, 0.05, CATCH_MAX)
}

function buildCatch() {
  const u = screen.ui
  const e = B.enemy
  // a short 3-2-1-GO first, so you can get ready; the ring starts at GO
  CATCH.phase = 'count'
  CATCH.t0 = now()
  CATCH.step = -1
  mkArtC(6, 't_catch')
  mkTextS(20, 56, W - 40, 26, 18, LILAC, align.CENTER_H, 'Tap when the rings meet')
  // how hard this one is: its rarity, and the ring speed that goes with it
  const rar = rarityOf(e.sp)
  CATCH.period = RARITY[rar].ringMs
  mkTextS(20, 80, W - 40, 22, 16, RARITY_COLOR[rar], align.CENTER_H, RARITY[rar].name)
  u.target = mkRing(CX - RING_TARGET, CATCH_CY - RING_TARGET, RING_TARGET * 2, RING_TARGET * 2, GOLD, RING_TARGET, 4)
  u.img = mkImg(CX - 64, CATCH_CY - 70, 'mon/' + e.sp + '.png')
  u.charm = mkImg(CX - 36, CATCH_CY - 36, 'item/charm_l.png')
  setVisible(u.charm, false)
  u.ring = mkRing(CX - RING_MAX, CATCH_CY - RING_MAX, RING_MAX * 2, RING_MAX * 2, WHITE, RING_MAX, 5)
  // the result words are pictures; one is shown at a time
  u.rate = {}
  for (const k of ['perfect', 'good', 'miss', 'gotcha', 'free']) {
    u.rate[k] = mkArtC(318, 't_' + k)
    setVisible(u.rate[k], false)
  }
  // countdown pictures over the creature: 3, 2, 1, GO!
  u.count = ['t_count3', 't_count2', 't_count1', 't_go'].map((k) => {
    const im = mkArt(Math.round(CX - artSize(k)[0] / 2), Math.round(CATCH_CY - artSize(k)[1] / 2), k)
    setVisible(im, false)
    return im
  })
  const frac = e.hp / maxHp(e)
  u.info = mkTextS(20, 368, W - 40, 30, 18, LILAC, align.CENTER_H, 'HP ' + Math.round(frac * 100) + '%   charms left ' + st.charms)
  const lo = pct(catchChance(e, 0))
  const hi = pct(catchChance(e, CATCH_PERFECT))
  mkTextS(20, 400, W - 40, 26, 16, GOLD, align.CENTER_H, 'Odds: ' + (lo === hi ? hi : lo + ' - ' + hi))
  screen.instant = true
  addTap(0, 0, W, H, catchTap)
}

function showRating(k) {
  const r = screen.ui.rate
  for (const key in r) setVisible(r[key], key === k)
}

function catchTap() {
  if (CATCH.phase !== 'aim') return
  const d = Math.abs(CATCH.r - RING_TARGET)
  CATCH.rating = d <= PERFECT_PX ? 'perfect' : d <= GOOD_PX ? 'good' : 'miss'
  const bonus = d <= PERFECT_PX ? CATCH_PERFECT : d <= GOOD_PX ? CATCH_GOOD : 0
  CATCH.ok = Math.random() < catchChance(B.enemy, bonus)
  CATCH.phase = 'wobble'
  CATCH.wob = 0
  CATCH.next = now() + 500
  const u = screen.ui
  showRating(CATCH.rating)
  setVisible(u.count[3], false)
  setVisible(u.ring, false)
  setVisible(u.img, false)
  setVisible(u.charm, true)
  buzz('light', 'catch')
}

function tickCatch(t) {
  const u = screen.ui
  if (CATCH.phase === 'count') {
    // 3, 2, 1 (one beat each, with a tap on the wrist), then GO and the ring starts
    const step = Math.floor((t - CATCH.t0) / COUNT_STEP_MS)
    if (step !== CATCH.step) {
      CATCH.step = step
      u.count.forEach((im, i) => setVisible(im, i === step))
      if (step < 3) buzz('light', 'catch')
    }
    if (step >= 3) {
      buzz('mid', 'catch')
      CATCH.phase = 'aim'
      CATCH.t0 = t
    }
    return
  }
  if (CATCH.phase === 'aim') {
    // GO! stays up for a moment while the ring starts moving
    if (t - CATCH.t0 > GO_SHOW_MS) setVisible(u.count[3], false)
    const f = ((t - CATCH.t0) % CATCH.period) / CATCH.period
    const r = Math.round(RING_MAX - (RING_MAX - RING_MIN) * f)
    CATCH.r = r
    setRect(u.ring, { x: CX - r, y: CATCH_CY - r, w: r * 2, h: r * 2, radius: r })
    return
  }
  if (t < CATCH.next) return
  if (CATCH.phase === 'wobble') {
    CATCH.wob++
    // the charm wiggles: up to 3 times, a failed catch can break out early
    if (CATCH.wob <= 3) {
      setText(u.info, '.'.repeat(CATCH.wob))
      setRect(u.target, { color: CATCH.wob % 2 ? WHITE : GOLD })
      buzz('light', 'catch')
      CATCH.next = t + 650
      if (!CATCH.ok && CATCH.wob >= 1 + Math.floor(Math.random() * 3)) CATCH.wob = 3
      return
    }
    CATCH.phase = 'done'
    CATCH.next = t + 1500
    const e = B.enemy
    const name = SPECIES[e.sp].name
    if (CATCH.ok) {
      buzz('strong', 'catch')
      showRating('gotcha')
      setText(u.info, name + ' was caught!')
    } else {
      setVisible(u.charm, false)
      setVisible(u.img, true)
      showRating('free')
      setText(u.info, '')
    }
    return
  }
  if (CATCH.phase === 'done') {
    CATCH.phase = 'gone'
    if (CATCH.ok) caught()
    else {
      goto('battle')
      act('enemy')
    }
  }
}

function caught() {
  const e = B.enemy
  B.over = true
  const m = newMon(e.sp, e.lv)
  m.hp = Math.max(1, e.hp)
  m.full = 50
  m.joy = 45
  st.mons.push(m)
  const first = !st.caught[e.sp]
  st.caught[e.sp] = true
  st.seen[e.sp] = true
  let where = 'It is waiting in your team list.'
  if (st.party.length < PARTY_MAX) {
    st.party.push(m.id)
    where = 'It joined your party!'
  }
  const p = activeMon()
  const xp = Math.round((8 + e.lv * 6) / 2)
  const msgs = gainXp(p, xp)
  for (const mate of partyMons()) {
    if (mate !== p && mate !== m && mate.hp >= 1) {
      msgs.push(...gainXp(mate, Math.floor(xp / 2)).filter((x) => x.indexOf(' XP') < 0))
    }
  }
  notices.push({
    title: (first ? 'NEW! ' : '') + SPECIES[e.sp].name,
    text: where + (first ? ' New entry in your book.' : '') + '\n' + msgs.join('\n'),
    img: 'mon/' + e.sp + '.png'
  })
  home()
}

// ---------- evolution ----------
const EVO = { t0: 0, flips: 0, next: 0, done: false }
const EVO_FLIPS = [500, 450, 400, 330, 280, 230, 190, 160, 140, 120, 110, 100]

function buildEvolve(id) {
  const u = screen.ui
  const m = monById(id)
  const from = m.sp
  const to = SPECIES[from].evo
  u.m = m
  u.to = to
  mkArtC(12, 't_evolution')
  mkArt(CX - 90, 74, 'plate180')
  u.a = mkImg(CX - 64, 96, 'mon/' + from + '.png')
  u.b = mkImg(CX - 64, 96, 'mon/' + to + '.png')
  setVisible(u.b, false)
  u.text = mkTextS(24, 268, W - 48, 70, 24, WHITE, align.CENTER_H, 'What? ' + SPECIES[from].name + ' is evolving!')
  u.ok = mkArtButton(95, 358, 'btn_ok', () => home())
  setArtButton(u.ok, false)
  EVO.t0 = now()
  EVO.flips = 0
  EVO.next = EVO.t0 + 900
  EVO.done = false
}

function tickEvolve(t) {
  const u = screen.ui
  if (EVO.done || t < EVO.next) return
  if (EVO.flips < EVO_FLIPS.length) {
    EVO.flips++
    const showB = EVO.flips % 2 === 1
    setVisible(u.a, !showB)
    setVisible(u.b, showB)
    EVO.next = t + EVO_FLIPS[EVO.flips - 1]
    if (EVO.flips % 3 === 0) buzz('light', 'other')
    return
  }
  EVO.done = true
  const m = u.m
  const fromName = SPECIES[m.sp].name
  const ratio = m.hp / maxHp(m)
  m.sp = u.to
  m.hp = Math.round(maxHp(m) * ratio)
  st.seen[m.sp] = true
  st.caught[m.sp] = true
  st.pendingEvo = st.pendingEvo.filter((x) => x !== m.id)
  setVisible(u.a, false)
  setVisible(u.b, true)
  setText(u.text, fromName + ' evolved into ' + SPECIES[m.sp].name + '!')
  setTextColor(u.text, GOLD)
  setArtButton(u.ok, true)
  buzz('strong', 'other')
  save()
}

// ---------- notice (one message with a picture) ----------
function buildNotice(n) {
  if (n.img) {
    mkArt(CX - 76, 18, 'plate152')
    mkImg(CX - 64, 30, n.img)
  }
  mkTextS(20, 174, W - 40, 40, 28, GOLD, align.CENTER_H, n.title)
  mkTextS(28, 214, W - 56, 140, fitSize(n.text, W - 56, 140, 19, 13), WHITE, align.CENTER_H, n.text)
  mkArtButton(95, 360, 'btn_ok', () => home())
}

// ---------- team ----------
function teamOrder() {
  const inParty = partyMons()
  const rest = st.mons.filter((m) => st.party.indexOf(m.id) < 0).sort((a, b) => b.lv - a.lv)
  return inParty.concat(rest)
}

function buildTeam(page) {
  const list = teamOrder()
  const pages = Math.max(1, Math.ceil(list.length / 3))
  page = clamp(page || 0, 0, pages - 1)
  screen.page = page
  screen.pages = pages
  mkArtC(2, 't_team')
  mkText(40, 46, W - 80, 20, 15, LILAC, align.CENTER_H, list.length + (list.length === 1 ? ' Wristling' : ' Wristlings'))
  list.slice(page * 3, page * 3 + 3).forEach((m, i) => {
    const y = 70 + i * 80
    const s = SPECIES[m.sp]
    mkArt(28, y, 'pnl_row')
    mkImg(36, y + 4, 'mon/' + m.sp + '_s.png')
    mkTextS(106, y + 6, 160, 30, 22, WHITE, align.LEFT, s.name)
    mkText(260, y + 6, 92, 30, 18, LILAC, align.RIGHT, 'Lv ' + m.lv)
    const bar = mkBar(106, y + 44, 150, 10, GREEN)
    const mx = maxHp(m)
    setBar(bar, m.hp / mx, hpColor(m.hp / mx))
    const slot = st.party.indexOf(m.id)
    if (slot >= 0) mkText(262, y + 36, 90, 26, 16, GOLD, align.RIGHT, slot === 0 ? 'LEAD' : 'PARTY')
    else if (m.full < HUNGRY_BELOW) mkText(262, y + 36, 90, 26, 16, ORANGE, align.RIGHT, 'HUNGRY')
    addTap(28, y, W - 56, 72, () => goto('detail', { id: m.id, page }, 1))
  })
  if (pages > 1) {
    mkArtButton(50, 312, 'btn_prev', () => goto('team', (page + pages - 1) % pages, -1))
    mkTextS(130, 312, 130, 50, 20, LILAC, align.CENTER_H, page + 1 + ' / ' + pages)
    mkArtButton(260, 312, 'btn_next', () => goto('team', (page + 1) % pages, 1))
  } else mkTextS(30, 312, W - 60, 50, 17, LILAC, align.CENTER_H, 'Tap a Wristling for details')
  mkArtButton(95, 368, 'btn_back', () => home())
}

function buildDetail(arg) {
  const u = screen.ui
  const m = monById(arg.id)
  const s = SPECIES[m.sp]
  const st2 = statsOf(m)
  const el = ELEMENTS[s.el]
  mkArt(CX - 70, 8, 'plate140')
  mkImg(CX - 64, 12, 'mon/' + m.sp + '.png')
  // 2-tap RELEASE button in the top-right corner
  u.relBg = mkRect(282, 16, 92, 34, 0x3a1828, 10)
  u.relTxt = mkText(282, 16, 92, 34, 15, RED, align.CENTER_H, 'RELEASE')
  u.relUntil = 0
  addTap(282, 16, 92, 34, () => {
    if (st.mons.length <= 1) return toast('Keep at least one Wristling', GOLD)
    if (st.party.length <= 1 && st.party[0] === m.id) return toast('Put another in PARTY first', GOLD)
    const t = now()
    if (!u.relUntil || t > u.relUntil) {
      u.relUntil = t + RESET_CONFIRM_MS
      setRect(u.relBg, { color: RED })
      setText(u.relTxt, 'SURE?')
      setTextColor(u.relTxt, WHITE)
      return
    }
    st.party = st.party.filter((x) => x !== m.id)
    st.pendingEvo = st.pendingEvo.filter((x) => x !== m.id)
    st.mons = st.mons.filter((x) => x.id !== m.id)
    const bId = s.berry
    st.berries[bId]++
    save()
    gotoBack('team', arg.page)
    toast('Released ' + s.name + ' (+1 ' + BERRIES.find((b) => b.id === bId).name + ')', GOLD)
  })
  mkTextS(30, 148, W - 60, 34, 28, WHITE, align.CENTER_H, s.name + '  Lv ' + m.lv)
  const fav = st.favKnown[m.sp] ? 'loves ' + BERRIES.find((b) => b.id === s.berry).name : 'favourite berry: ?'
  mkText(30, 180, W - 60, 24, 17, el.color, align.CENTER_H, el.name + '   ' + fav)
  const row = (y, label, frac, color, val) => {
    mkText(40, y - 5, 54, 20, 15, LILAC, align.LEFT, label)
    setBar(mkBar(96, y, 200, 10, color), frac, color)
    mkText(300, y - 5, 60, 20, 15, LILAC, align.LEFT, val)
  }
  row(212, 'HP', m.hp / st2.hp, hpColor(m.hp / st2.hp), Math.ceil(m.hp) + '/' + st2.hp)
  row(230, 'XP', m.lv >= MAX_LV ? 1 : m.xp / xpNext(m.lv), BLUE, m.lv >= MAX_LV ? 'MAX' : Math.floor((m.xp / xpNext(m.lv)) * 100) + '%')
  row(248, 'FOOD', m.full / 100, ORANGE, Math.round(m.full) + '')
  row(266, 'JOY', m.joy / 100, PINK, Math.round(m.joy) + '')
  mkText(24, 276, W - 48, 22, 16, WHITE, align.CENTER_H, 'ATK ' + st2.atk + '   DEF ' + st2.def + '   SPD ' + st2.spd + (s.evo ? '   evolves Lv ' + s.evoLv + (s.evoPai ? ' + ' + s.evoPai + ' PAI' : '') + (s.evoSteps ? ' + ' + fmt(s.evoSteps) + ' steps' : '') : ''))
  mkText(24, 296, W - 48, 22, 16, LILAC, align.CENTER_H, movesOf(m).map((id) => MOVES[id].name).join('  /  '))
  const slot = st.party.indexOf(m.id)
  mkArtButton(34, 322, slot === 0 ? 'btn_leader' : 'btn_lead', () => {
    if (slot === 0) return
    st.party = st.party.filter((x) => x !== m.id)
    st.party.unshift(m.id)
    if (st.party.length > PARTY_MAX) st.party.pop()
    save()
    goto('detail', arg, 1)
  })
  mkArtButton(143, 322, slot >= 0 ? 'btn_bench' : 'btn_join', () => {
    if (slot >= 0) {
      if (st.party.length <= 1) return toast('Keep at least one in the party', GOLD)
      st.party = st.party.filter((x) => x !== m.id)
    } else {
      if (st.party.length >= PARTY_MAX) return toast('Party is full (3). BENCH one first', GOLD)
      st.party.push(m.id)
    }
    save()
    goto('detail', arg, 1)
  })
  mkArtButton(252, 322, 'btn_feed_s', () => goto('feed', { id: m.id, back: 'detail', page: arg.page }, 1))
  mkArtButton(95, 376, 'btn_back', () => gotoBack('team', arg.page))
}

function tickDetail(t) {
  const u = screen.ui
  if (u.relUntil && t > u.relUntil) {
    u.relUntil = 0
    setRect(u.relBg, { color: 0x3a1828 })
    setText(u.relTxt, 'RELEASE')
    setTextColor(u.relTxt, RED)
  }
}

// ---------- feeding ----------
function buildFeed(arg) {
  const u = screen.ui
  const m = monById(arg.id)
  u.m = m
  mkArt(CX - 70, 8, 'plate140')
  u.img = mkImg(CX - 64, 12, 'mon/' + m.sp + '.png')
  mkTextS(30, 148, W - 60, 34, 26, WHITE, align.CENTER_H, SPECIES[m.sp].name)
  mkText(44, 186, 56, 20, 15, LILAC, align.LEFT, 'FOOD')
  u.food = mkBar(100, 190, 200, 12, ORANGE)
  mkText(44, 206, 56, 20, 15, LILAC, align.LEFT, 'JOY')
  u.joy = mkBar(100, 210, 200, 12, PINK)
  u.counts = BERRIES.map((b, i) => {
    const x = 33 + i * 82
    mkArt(x, 234, 'pnl_cell_feed')
    mkImg(x + 15, 242, 'item/berry_' + b.id + '.png')
    addTap(x, 234, 78, 92, () => feed(b))
    return mkTextS(x, 292, 78, 28, 20, WHITE, align.CENTER_H, '')
  })
  u.hint = mkTextS(24, 330, W - 48, 30, 18, LILAC, align.CENTER_H, 'Tap a berry to feed')
  mkArtButton(95, 368, 'btn_back', () => {
    if (arg.back === 'detail') gotoBack('detail', { id: m.id, page: arg.page })
    else home()
  })
  updateFeed()
}

function updateFeed() {
  const u = screen.ui
  setBar(u.food, u.m.full / 100)
  setBar(u.joy, u.m.joy / 100)
  BERRIES.forEach((b, i) => {
    setText(u.counts[i], 'x' + st.berries[b.id])
    setTextColor(u.counts[i], st.berries[b.id] > 0 ? WHITE : DIM)
  })
}

function feed(b) {
  const u = screen.ui
  const m = u.m
  const s = SPECIES[m.sp]
  if (st.berries[b.id] <= 0) return toast('No ' + b.name + 's: walk to find more', GOLD)
  if (m.full >= 95 && m.hp >= maxHp(m)) return toast(s.name + ' is full!', ORANGE)
  st.berries[b.id]--
  const fav = s.berry === b.id
  m.full = clamp(m.full + b.full + (fav ? FAV_FULL_BONUS : 0), 0, 100)
  m.joy = clamp(m.joy + b.joy + (fav ? FAV_JOY_BONUS : 0), 0, 100)
  m.hp = Math.min(maxHp(m), m.hp + maxHp(m) * FEED_HEAL)
  if (fav) {
    const first = !st.favKnown[m.sp]
    st.favKnown[m.sp] = true
    setText(u.hint, first ? 'Its FAVOURITE! Lots of JOY!' : 'Its favourite! Lots of JOY!')
    setTextColor(u.hint, PINK)
    buzz('strong', 'other')
  } else {
    setText(u.hint, pick(['Yum!', 'Munch munch...', 'Tasty!', 'Thanks!']))
    setTextColor(u.hint, WHITE)
    buzz('light', 'other')
  }
  queueEvolution(m, null)
  if (st.pendingEvo.indexOf(m.id) >= 0) toast(s.name + ' is ready to evolve!', GOLD)
  updateFeed()
  save()
}

// ---------- book ----------
// The grid shows "???" until you have met a creature, then its name. The sprite is
// a silhouette until you catch it. Tapping a creature opens its page with a full
// "where to find it" explanation, built from the same settings the game uses.

// how a real-life condition works, in full
function condText(c) {
  if (c === 'rain') return 'Only on rainy or stormy days (watch forecast).'
  if (c === 'sun') return 'Only on sunny days, in daylight (06:00 - 20:00).'
  if (c === 'kcal') return 'Only after you burn ' + fmt(KCAL_SPAWN) + ' kcal in a day.'
  if (c === 'weekend') return 'Only on Saturday and Sunday, 12:00 - 18:00.'
  if (c === 'mist') return 'On foggy or hazy days, or at night after ' + fmt(MIST_NIGHT_STEPS) + ' steps that day.'
  if (c === 'north') return 'Point the top of your watch NORTH when you tap EXPLORE. The den shows which way you face.'
  if (c === 'dawn') return 'Point the top of your watch EAST when you explore, between 05:00 and 09:00.'
  if (c === 'compass') return 'Anywhere, if your watch has a calibrated compass. In battle it points somewhere: face that way or it may get away.'
  if (c === 'dusk') return 'Point the top of your watch WEST when you explore, between ' + DUSK_HOURS[0] + ':00 and ' + DUSK_HOURS[1] + ':00.'
  if (c === 'south') return 'Point the top of your watch SOUTH when you explore, between ' + NOON_HOURS[0] + ':00 and ' + NOON_HOURS[1] + ':00.'
  if (c === 'spin') return 'With the den open, turn around in a full circle, then tap EXPLORE within ' + SPIN_WINDOW_MS / 1000 + ' seconds. The den says "spun!".'
  if (c === 'steady') return 'With the den open, keep the watch pointing the same way for ' + STEADY_MS / 1000 + ' seconds, then tap EXPLORE. The den says "steady".'
  if (c === 'battery') return 'Only when your watch battery is under ' + LOW_BATTERY + '%.'
  if (c === 'halloween') return 'Only from ' + HALLOWEEN[0][1] + ' ' + MONTHS[HALLOWEEN[0][0] - 1] + ' to ' + HALLOWEEN[1][1] + ' ' + MONTHS[HALLOWEEN[1][0] - 1] + '.'
  if (c === 'december') return 'Only in December.'
  if (c === 'easter') return 'Only in Easter week: from Palm Sunday to Easter Monday (Western or Orthodox Easter).'
  if (c === 'newyear') return 'Only around New Year: ' + dateRange(NEWYEAR) + '.'
  if (c === 'valentine') return 'Only around Valentine\'s Day: ' + dateRange(VALENTINE) + '.'
  if (c === 'midsummer') return 'Only on midsummer nights: ' + dateRange(MIDSUMMER) + '.'
  if (c === 'friday13') return 'Only on a Friday the 13th.'
  return ''
}

// the full "where to find it" text for one creature
// worst: pretend you have met nobody (the longest version, used to pick the text size)
function findText(id, worst) {
  const s = SPECIES[id]
  const parts = []
  if (PRE[id]) {
    const p = SPECIES[PRE[id]]
    // name the earlier form only once you have met it yourself (no spoilers)
    const metPre = !worst && (st.seen[PRE[id]] || st.caught[PRE[id]])
    parts.push('Evolves from ' + (metPre ? p.name : "one you haven't met yet") + ' at Lv ' + p.evoLv + (p.evoPai ? ' with ' + p.evoPai + '+ weekly PAI' : '') + (p.evoSteps ? ' after walking ' + fmt(p.evoSteps) + ' steps as your lead' : '') + '. Also wild once your lead is Lv ' + (PRE[PRE[id]] ? WILD_FINAL_LV : WILD_EVOLVED_LV) + '+.')
  }
  if (s.dream) parts.push('Rare. After a night with lots of REM sleep it may wait as a DREAM VISITOR in the morning.')
  else if (s.legend === 'steps') parts.push('LEGEND, only one. Appears once the game has counted ' + fmt(LEGEND_STEPS) + ' of your steps (' + (worst ? fmt(LEGEND_STEPS) : fmt(st.life.steps)) + ' so far), in ' + pct(LEGEND_CHANCE) + ' of explores.')
  else if (s.legend === 'streak') parts.push('LEGEND, only one. Appears after a ' + STREAK_DAYS + '-day streak of ' + fmt(STREAK_STEPS) + '+ steps a day (now ' + (worst ? STREAK_DAYS : streakNow()) + '), in ' + pct(LEGEND_CHANCE) + ' of explores. If it faints it is back tomorrow.')
  else if (RARES.some((r) => r.id === id)) {
    const r = RARES.find((x) => x.id === id)
    parts.push('Rare. ' + r.text + ', in ' + pct(r.chance) + ' of explores.')
  }
  if (s.cond) parts.push(condText(s.cond) + ((s.condWeight || COND_WEIGHT) > 1 ? ' Easier to meet while that lasts.' : ''))
  if (s.time === 'night') parts.push('Only at night (20:00 - 06:00).' + (s.el === 'shadow' ? ' Shadow ones are 3x as likely then.' : ''))
  if (STARTERS.indexOf(id) >= 0) parts.push('One of the three starters.')
  if (!parts.length || (STARTERS.indexOf(id) >= 0 && !s.cond && !s.time)) parts.push('Anywhere, any time: spend a TRACK on EXPLORE.')
  return parts.join(' ')
}

function buildBook(arg) {
  const per = 12
  const pages = Math.ceil(BOOK.length / per) + 1 // the last page: badges and rewards
  const info = arg && typeof arg === 'object' ? arg.info : null
  let page = arg && typeof arg === 'object' ? arg.page : arg
  page = clamp(page || 0, 0, pages - 1)
  screen.page = page
  screen.pages = pages
  const caughtN = BOOK.filter((id) => st.caught[id]).length
  mkArtC(2, 't_book')
  mkText(40, 46, W - 80, 20, 15, LILAC, align.CENTER_H, 'caught ' + caughtN + ' / ' + BOOK.length + '  -  tap one for details')
  if (page === pages - 1) buildRewards()
  else BOOK.slice(page * per, page * per + per).forEach((id, i) => {
    const x = 37 + (i % 4) * 80
    const y = 68 + Math.floor(i / 4) * 82
    mkArt(x, y, 'pnl_cell')
    const caught = st.caught[id]
    const seen = caught || st.seen[id]
    mkImg(x + 6, y + 2, 'mon/' + id + (caught ? '_s' : '_x') + '.png')
    mkText(x, y + 60, 76, 20, 13, caught ? WHITE : seen ? LILAC : DIM, align.CENTER_H, seen ? SPECIES[id].name : '???')
    addTap(x, y, 76, 80, () => goto('book', { page, info: id }, 1))
  })
  mkArtButton(50, 316, 'btn_prev', () => goto('book', (page + pages - 1) % pages, -1))
  mkTextS(130, 316, 130, 50, 20, LILAC, align.CENTER_H, page + 1 + ' / ' + pages)
  mkArtButton(260, 316, 'btn_next', () => goto('book', (page + 1) % pages, 1))
  mkArtButton(95, 372, 'btn_back', () => home())
  if (info) buildBookPage(info, page)
}

// the book's last page: a badge per category, and the next reward
function buildRewards() {
  const size = pageTextSize()
  BADGES.forEach((b, i) => {
    const [got, all] = badgeCount(b)
    const done = !!st.badges[b.id]
    const y = 70 + i * 26
    mkText(44, y, 220, 24, size, done ? GOLD : LILAC, align.LEFT, (done ? 'BADGE  ' : '') + b.name)
    mkText(250, y, 96, 24, size, done ? GOLD : WHITE, align.RIGHT, got + ' / ' + all)
  })
  const nx = nextMilestone()
  mkTextS(24, 274, W - 48, 42, size, GREEN, align.CENTER_H, nx ? 'At ' + nx[0] + ' caught: ' + rewardText(nx[1], nx[2], nx[3]) : 'Every book reward collected!')
}

// one creature's page, on top of the grid (a tap anywhere closes it)
// ---------- one text size for the guide and the book ----------
// The biggest size at which EVERY guide page and every book page fits, so all of
// them look the same. Worked out once (the texts only change with the game data).
const GUIDE_BOX = { x: 28, y: 66, w: 334, h: 296 }
const BOOK_BOX = { x: 28, y: 232, w: 334, h: 154 }
let pageSize = 0
function pageTextSize() {
  if (pageSize) return pageSize
  let size = 18
  for (const p of guidePages()) if (p.text) size = Math.min(size, fitSize(p.text, GUIDE_BOX.w, GUIDE_BOX.h, 18, 12))
  for (const id of BOOK) size = Math.min(size, fitSize(findText(id, true), BOOK_BOX.w, BOOK_BOX.h, 18, 12))
  pageSize = size
  return size
}

function buildBookPage(id, page) {
  const s = SPECIES[id]
  const caught = st.caught[id]
  const seen = caught || st.seen[id]
  mkRect(0, 0, W, H, INK, 0)
  mkArt(20, 20, 'pnl_big')
  mkArt(CX - 70, 24, 'plate140')
  if (caught) mkImg(CX - 64, 28, 'mon/' + id + '.png')
  else mkImg(CX - 32, 58, 'mon/' + id + '_x.png')
  mkTextS(30, 162, W - 60, 30, 26, caught ? WHITE : seen ? LILAC : DIM, align.CENTER_H, seen ? s.name : '???')
  const status = caught ? 'CAUGHT' : seen ? 'MET, NOT CAUGHT YET' : 'NOT MET YET'
  mkText(30, 190, W - 60, 20, 15, caught ? GREEN : seen ? GOLD : DIM, align.CENTER_H, status + (seen ? '   ' + elName(s) + '   ' + (s.legend ? 'LEGEND' : RARITY[rarityOf(id)].name) : ''))
  mkText(30, 210, W - 60, 22, 15, GOLD, align.CENTER_H, 'WHERE TO FIND IT')
  mkText(BOOK_BOX.x, BOOK_BOX.y, BOOK_BOX.w, BOOK_BOX.h, pageTextSize(), WHITE, align.CENTER_H, findText(id))
  mkText(30, 390, W - 60, 22, 14, DIM, align.CENTER_H, 'tap anywhere to close')
  addTap(0, 0, W, H, () => gotoBack('book', page))
}

// ---------- settings (swipe up on the den) ----------
const SETTING_ROWS = [
  { key: 'vibBattle', label: 'Battle vibration', sub: 'hits and knockouts', cat: 'battle' },
  { key: 'vibCatch', label: 'Catch vibration', sub: 'countdown and wobbles', cat: 'catch' },
  { key: 'vibOther', label: 'Other vibration', sub: 'taps, feeding, evolving', cat: 'other' }
]

function buildSettings() {
  const u = screen.ui
  mkArtC(2, 't_settings')
  SETTING_ROWS.forEach((r, i) => {
    const y = 52 + i * 76
    mkArt(28, y, 'pnl_row')
    mkTextS(42, y + 8, 200, 30, 20, WHITE, align.LEFT, r.label)
    mkText(42, y + 38, 200, 24, 15, LILAC, align.LEFT, r.sub)
    const on = st.settings[r.key] !== false
    mkArtButton(258, y + 14, on ? 'tgl_on' : 'tgl_off', () => {
      st.settings[r.key] = !on
      save()
      goto('settings', undefined, 1)
      // a little buzz so you feel it is back on
      if (!on) buzz('mid', r.cat)
    })
  })
  // full reset, like Tap Quest: the first tap asks SURE?, a second tap within
  // RESET_CONFIRM_MS erases the whole game (your vibration choices are kept)
  const y = 52 + SETTING_ROWS.length * 76
  mkArt(28, y, 'pnl_row')
  u.resetLabel = mkTextS(42, y + 8, 210, 30, 20, RED, align.LEFT, 'Reset game')
  u.resetSub = mkText(42, y + 38, 210, 24, 15, LILAC, align.LEFT, 'erases every Wristling')
  u.confirmUntil = 0
  u.reset = mkArtButton(258, y + 14, 'btn_reset', () => {
    const t = now()
    if (!u.confirmUntil || t > u.confirmUntil) {
      u.confirmUntil = t + RESET_CONFIRM_MS
      setArtButton(u.reset, true, 'btn_sure')
      setText(u.resetLabel, 'TAP AGAIN!')
      setText(u.resetSub, 'to erase everything')
      return
    }
    resetGame()
  })
  mkArtButton(95, 370, 'btn_back', () => home())
}

// the SURE? state runs out after a few seconds (called every tick on this screen)
function tickSettings(t) {
  const u = screen.ui
  if (u.confirmUntil && t > u.confirmUntil) {
    u.confirmUntil = 0
    setArtButton(u.reset, true, 'btn_reset')
    setText(u.resetLabel, 'Reset game')
    setText(u.resetSub, 'erases every Wristling')
  }
}

// A full wipe: every Wristling, item, track and the book. Only settings stay.
function resetGame() {
  const keep = st.settings
  st = freshState()
  st.settings = keep
  notices.length = 0
  save()
  goto('starter')
  toast('NEW GAME', WHITE)
}

// ---------- guide (swipe left on the den) ----------
// KEEP THIS UP TO DATE: every rule shown here is built from the constants and
// data the game itself uses, so tuning a number updates the guide. When you add
// or change a mechanic, add or change its page here too.
function pct(x) {
  return Math.round(x * 100) + '%'
}

// a real-life condition in a few words, for the guide (no creature names: those are
// for the book, once you have met them)
function guideCond(c) {
  if (c === 'rain') return 'Rainy or stormy days (watch forecast)'
  if (c === 'sun') return 'Sunny days, in daylight'
  if (c === 'kcal') return 'After you burn ' + fmt(KCAL_SPAWN) + ' kcal in a day'
  if (c === 'weekend') return 'Weekend afternoons (Sat / Sun 12:00 - 18:00)'
  if (c === 'mist') return 'Fog or haze, or nights after ' + fmt(MIST_NIGHT_STEPS) + ' steps'
  if (c === 'north') return 'Watch pointing NORTH when you explore'
  if (c === 'dawn') return 'Watch pointing EAST, 05:00 - 09:00'
  if (c === 'compass') return 'Any time with a compass; in battle, face where it points'
  if (c === 'dusk') return 'Watch pointing WEST, ' + DUSK_HOURS[0] + ':00 - ' + DUSK_HOURS[1] + ':00'
  if (c === 'south') return 'Watch pointing SOUTH, ' + NOON_HOURS[0] + ':00 - ' + NOON_HOURS[1] + ':00'
  if (c === 'spin') return 'Turn a full circle on the den, then explore'
  if (c === 'steady') return 'Hold the watch still one way, then explore'
  if (c === 'battery') return 'Watch battery under ' + LOW_BATTERY + '%'
  if (c === 'halloween') return HALLOWEEN[0][1] + ' ' + MONTHS[HALLOWEEN[0][0] - 1] + ' - ' + HALLOWEEN[1][1] + ' ' + MONTHS[HALLOWEEN[1][0] - 1]
  if (c === 'december') return 'In December'
  if (c === 'easter') return 'Easter week (Western or Orthodox)'
  if (c === 'newyear') return 'New Year, ' + dateRange(NEWYEAR)
  if (c === 'valentine') return 'Valentine\'s, ' + dateRange(VALENTINE)
  if (c === 'midsummer') return 'Midsummer nights, ' + dateRange(MIDSUMMER)
  if (c === 'friday13') return 'Any Friday the 13th'
  return c
}

// All real-life conditions in one scrollable section
function realWorldPages() {
  const conds = []
  for (const id of BOOK) if (SPECIES[id].cond && !PRE[id] && conds.indexOf(SPECIES[id].cond) < 0) conds.push(SPECIES[id].cond)
  return [{
    title: 'REAL-WORLD ONES',
    text:
      'Some Wristlings only come out while something is true where you are (' + COND_WEIGHT + 'x as likely then):\n\n' +
      conds.map((c) => '- ' + guideCond(c)).join('\n') +
      '\n\nTap one in the BOOK to see its rule.'
  }]
}

// "Most evolve twice: at Lv 12-16, then again at Lv 28." (built from the data)
function evoStepsText() {
  const first = BOOK.filter((id) => SPECIES[id].evo && !PRE[id]).map((id) => SPECIES[id].evoLv)
  const second = BOOK.filter((id) => SPECIES[id].evo && PRE[id]).map((id) => SPECIES[id].evoLv)
  if (!second.length) return ''
  const range = (a) => (Math.min(...a) === Math.max(...a) ? String(a[0]) : Math.min(...a) + '-' + Math.max(...a))
  return 'Most evolve twice: at Lv ' + range(first) + ', then again at Lv ' + range(second) + '.\n'
}

function guidePages() {
  return [
    {
      title: 'WELCOME',
      text:
        'Wristlings live on your wrist.\n\n' +
        'Walk to earn TRACKS. Spend a track on EXPLORE to meet a wild Wristling, then battle it, catch it, feed it and help it evolve.\n\n' +
        'Drag up or down to scroll this guide. Swipe RIGHT to go back. In TEAM and BOOK, swipe left or right to turn pages.\n\n' +
        'Swipe UP on the den for SETTINGS (vibrations, reset). You can also add the Wristlings widget to your watch.'
    },
    {
      title: 'WALKING',
      text:
        '1 TRACK every ' + fmt(STEPS_PER_TRACK) + ' steps (max ' + TRACK_CAP + ' saved, so spend them!).\n' +
        'A free track every ' + FREE_TRACK_MIN + ' minutes.\n\n' +
        '1 berry every ' + fmt(STEPS_PER_BERRY) + ' steps.\n' +
        '1 charm every ' + fmt(STEPS_PER_CHARM) + ' steps.\n' +
        'Wins can also drop a berry (' + pct(BERRY_DROP) + ') or a charm (' + pct(CHARM_DROP) + ').\n\n' +
        'Steps count from midnight, like your watch.'
    },
    {
      title: 'HEART & SLEEP',
      text:
        'TRAIN: minutes today with your pulse well above resting become XP for your LEAD (other party members get half). Each minute = ' + TRAIN_XP_BASE + ' + lead level XP, up to ' + TRAIN_XP_CAP_MIN + ' min/day.\n\n' +
        'SLEEP: ' + GOOD_SLEEP_MIN / 60 + 'h or more fully heals the team and adds JOY. Lots of REM sleep can bring a rare DREAM VISITOR in the morning.'
    },
    {
      title: 'TURN ORDER',
      text:
        'Pick a move, then both sides act:\n\n' +
        '1. GUARD always goes first.\n' +
        '2. Otherwise the FASTER one goes first (SPD in its details).\n' +
        '3. Same speed: coin flip.\n\n' +
        'Your battle panel says FIRST or SECOND.\n' +
        'If your first hit knocks it out, it never attacks.\n' +
        'SWAP and failed CATCH: the enemy attacks. RUN always works.'
    },
    {
      title: 'BATTLE SCREEN',
      text:
        'Top: the wild one. Middle: yours, with FIRST / SECOND.\n\n' +
        'TAP A PANEL to compare HP, ATK, DEF and SPD (green = better). A wild one shows its stats once you have caught that species.\n\n' +
        'Move buttons say STRONG / WEAK.'
    },
    {
      title: 'MOVES',
      text:
        'Buttons: 1 main attack, 2 another element (if it has one), 3 GUARD / BREATHER.\n\n' +
        'Weak: ' + MOVES.ember.pow + ' power, never miss.\n' +
        'Strong: ' + MOVES.flare.pow + ' power, ' + MOVES.flare.acc + '% hit.\n' +
        'BUMP: no element, never resisted.\n' +
        'GUARD: next hit does ' + pct(GUARD_TAKEN) + '.\n' +
        'BREATHER: heals ' + pct(REST_HEAL) + ' (LONG NAP ' + pct(MOVES.nap.heal) + '), ' + RESTS_PER_BATTLE + 'x a battle.\n' +
        'Own element: x' + SAME_ELEMENT_BONUS + '. Crit: 1 in ' + Math.round(1 / CRIT_CHANCE) + ', x' + CRIT_MULT
    },
    { title: 'ELEMENTS', chart: true },
    {
      title: 'STATUS',
      text:
        'BURN: loses ' + pct(BURN_DMG) + ' of its HP after each of its moves, for ' + BURN_TURNS + ' turns.\n' +
        'FREEZE: skips its next turn.\n' +
        'SLEEP: skips ' + SLEEP_TURNS[0] + ' to ' + SLEEP_TURNS[1] + ' turns.\n\n' +
        'Some FIRE moves can burn and some ICE moves can freeze. FIRE ones never burn, ICE ones never freeze.\n\n' +
        'One status at a time. Swapping out clears it.'
    },
    {
      title: 'WEATHER',
      text:
        'Battles use today\'s forecast:\n' +
        Object.keys(WEATHER).map((w) => weatherLine(w)).join('\n')
    },
    {
      title: 'CATCHING',
      text:
        'Tap CATCH (uses a charm). After 3-2-1-GO, tap when the rings meet.\n\n' +
        'Chance: ' + pct(CATCH_BASE) + ' + up to ' + pct(CATCH_HP) + ' for lost HP + ' + pct(CATCH_PERFECT) + ' PERFECT / ' + pct(CATCH_GOOD) + ' GOOD (max ' + pct(CATCH_MAX) + ').\n' +
        'UNCOMMON x' + RARITY.uncommon.mult + ', RARE x' + RARITY.rare.mult + ' (faster ring).\n' +
        'Over ' + CATCH_OVERLEVEL + ' levels above your lead: -' + pct(CATCH_OVERLEVEL_PENALTY) + '.\n\n' +
        'Chip HP with BUMP first.'
    },
    {
      title: 'TEAM',
      text:
        'Up to ' + PARTY_MAX + ' fight in your PARTY; the LEAD goes first. Set them in TEAM.\n\n' +
        'Win: the one that won gets full XP, other standing party members half.\n\n' +
        'Worn out? The next one jumps in.\n' +
        'Out of battle they heal ' + pct(HP_REGEN_PER_MIN * 60) + ' of HP an hour.\n\n' +
        'Extras can be RELEASED from their details for 1 berry (your Book keeps them).'
    },
    {
      title: 'CARE',
      text:
        'FOOD drops ' + FULL_DECAY_PER_HOUR + ' an hour for your PARTY (benched ones do not get hungry). Below ' + HUNGRY_BELOW + ' = HUNGRY: -' + pct(MOOD_EFFECT) + ' power.\n' +
        'JOY ' + HAPPY_FROM + '+ = HAPPY: +' + pct(MOOD_EFFECT) + ' power.\n\n' +
        'Each species has a FAVOURITE berry: +' + FAV_FULL_BONUS + ' food, +' + FAV_JOY_BONUS + ' joy extra. Feeding also heals ' + pct(FEED_HEAL) + ' HP (even when FOOD is full).'
    },
    {
      title: 'EVOLVING',
      text:
        evoStepsText() + '\n' +
        'Evolving needs the right level AND ' + EVOLVE_JOY + '+ JOY.' +
        (BOOK.some((id) => SPECIES[id].evoPai)
          ? ' A few also need ' + Math.min(...BOOK.filter((id) => SPECIES[id].evoPai).map((id) => SPECIES[id].evoPai)) + '+ weekly PAI (the book says which).'
          : '') +
        (BOOK.some((id) => SPECIES[id].evoSteps) ? ' One must walk ' + fmt(Math.min(...BOOK.filter((id) => SPECIES[id].evoSteps).map((id) => SPECIES[id].evoSteps))) + ' steps as your lead.' : '')
    },
    {
      title: 'WHEN & WHERE',
      text:
        'NIGHT: some Wristlings only come out from 20:00 to 06:00, and all SHADOW ones are 3x as likely then.\n\n' +
        'EVOLVED forms show up wild once your lead is Lv ' + WILD_EVOLVED_LV + '+, fully evolved ones from Lv ' + WILD_FINAL_LV + '+.'
    },
    {
      title: 'RARE ONES',
      text: 'Each RARE one comes only at its moment:\n' + RARES.map((r) => '- ' + r.guide).join('\n') + '\n- a night of lots of REM sleep\nThen in ' + pct(Math.min(...RARES.map((r) => r.chance))) + ' - ' + pct(Math.max(...RARES.map((r) => r.chance))) + ' of explores.'
    },
    {
      title: 'LEGENDS',
      text:
        'Two LEGENDS, one of each per player:\n\n' +
        '- one after the game has counted ' + fmt(LEGEND_STEPS) + ' of your steps\n' +
        '- one after a ' + STREAK_DAYS + '-day streak of ' + fmt(STREAK_STEPS) + '+ steps a day (miss a day and the streak starts again)\n\n' +
        'Then they appear in ' + pct(LEGEND_CHANCE) + ' of explores. Their book pages show your progress.'
    },
    ...realWorldPages(),
    {
      title: 'EGGS',
      text:
        'Walk ' + fmt(EGG_FIND_STEPS) + ' steps in a day to find an EGG (one a day). It sits next to your lead on the den.\n\n' +
        'It hatches after you walk ' + fmt(EGG_HATCH_STEPS) + ' more steps: tap it when it glows. Usually it is one you have not caught yet. Rare and seasonal ones never hatch.\n\n' +
        'Eggs won while you carry one wait their turn.'
    },
    {
      title: 'BOOK REWARDS',
      text:
        'Creatures caught:\n' +
        MILESTONES.map((x) => x[0] + ': ' + x[1] + ' charms' + (x[2] ? ', ' + x[2] + ' gold' : '') + (x[3] ? ', an EGG' : '')).join('\n') + '\n\n' +
        'A BADGE for each of the ' + BADGES.length + ' categories you complete: ' + BADGE_CHARMS + ' charms, ' + BADGE_GOLD + ' gold. See the last book page.'
    },
    {
      title: 'WEEKLY BOSS',
      text:
        'Swipe RIGHT on the den. A new boss every Monday, starting at Lv ' + BOSS_MIN_LV + '. It gains a level for every ' + fmt(BOSS_STEPS_PER_LV) + ' steps you walk that week: fight it early, or walk more for a bigger reward.\n\n' +
        'It has ' + Math.round((BOSS_HP_MULT - 1) * 100) + '% more HP and cannot be caught. Beat it once a week for charms, Gold Berries, and an EGG from Lv ' + BOSS_EGG_LV + '.'
    },
    {
      title: 'TIPS',
      text:
        '- Check the move hints: STRONG / WEAK.\n' +
        '- SWAP to one that resists the enemy: it takes the free hit.\n' +
        '- Finish enemies before they use BREATHER (they do below ' + pct(AI_REST_BELOW) + ' HP).\n' +
        '- HAPPY vs HUNGRY is a ' + pct(MOOD_EFFECT * 2) + ' swing: keep everyone fed.\n' +
        '- Save charms for species you do not have yet.\n' +
        '- In the BOOK, tap any creature to see where to find it.'
    }
  ]
}

// Ask the UI engine for the real wrapped height so sections stack seamlessly.
function textHeight(text, w, size, min) {
  try {
    const r = getTextLayout(String(text), { text_size: size, text_width: w, wrapped: 1 })
    if (r && typeof r.height === 'number' && r.height > 0) return Math.ceil(r.height) + 4
  } catch (e) {
    // fall through to the estimate
  }
  const s = fitSize(text, w, 100000, size, min)
  const perLine = Math.max(1, Math.floor(w / (s * CHAR_W)))
  let lines = 0
  for (const para of String(text).split('\n')) lines += Math.max(1, Math.ceil(para.length / perLine))
  return Math.max(24, Math.ceil(lines * s * LINE_H) + 6)
}
function chartText() {
  const lines = Object.keys(ELEMENTS).map((el) => ELEMENTS[el].name + ' beats ' + STRONG[el].map((x) => ELEMENTS[x].name).join(' '))
  lines.push('', 'Beats = x' + SUPER_MULT + ' damage. The same element, or one that beats yours = x' + WEAK_MULT)
  return lines.join('\n')
}
function guideText() {
  const parts = []
  for (const p of guidePages()) {
    parts.push(p.title)
    parts.push(p.chart ? chartText() : p.text)
  }
  return parts.join('\n\n')
}

// Guide: fixed chrome + fixed row pool. Only row content/style changes on scroll;
// no background/title/button/widget movement.
function guideWrap(text, w, size) {
  const perLine = Math.max(1, Math.floor(w / (size * CHAR_W)))
  const out = []
  for (const para of String(text).split('\n')) {
    if (para === '') { out.push(''); continue }
    let line = ''
    for (const word of para.split(' ')) {
      if (!word) continue
      const next = line ? line + ' ' + word : word
      if (next.length <= perLine) { line = next; continue }
      if (line) out.push(line)
      if (word.length > perLine) {
        let i = 0
        while (i + perLine < word.length) { out.push(word.slice(i, i + perLine)); i += perLine }
        line = word.slice(i)
      } else line = word
    }
    out.push(line)
  }
  return out.length ? out : ['']
}

function buildGuideRows() {
  const rows = []
  const pushSpacer = (n) => { for (let i = 0; i < (n || 1); i++) rows.push({ type: 'spacer' }) }
  const pushTitle = (text) => rows.push({ type: 'title', text })
  const pushText = (text, color) => {
    for (const line of guideWrap(text, W - 66, 15)) rows.push({ type: 'text', text: line, color: color || WHITE })
  }
  const pages = guidePages()
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]
    if (i > 0) pushSpacer(1)
    pushTitle(p.title)
    if (p.chart) {
      for (const el of Object.keys(ELEMENTS)) {
        const beats = STRONG[el].map((x) => ELEMENTS[x].name).join(', ')
        rows.push({ type: 'element', el, text: ELEMENTS[el].name + ' beats ' + beats })
      }
      pushSpacer(1)
      pushText('Beats = x' + SUPER_MULT + ' damage.', GOLD)
      pushText('Same, or beats yours = x' + WEAK_MULT + '.', DIM)
      pushSpacer(1)
      pushText('Some Wristlings have TWO elements: both count, but a hit is never more than one STRONG (x' + SUPER_MULT + ') or one WEAK (x' + WEAK_MULT + '). Moves of either element get the own-element bonus.', WHITE)
    } else {
      pushText(p.text, WHITE)
    }
  }
  pushSpacer(2)
  return rows
}

let guideRowsCache = null
function getGuideRows() {
  if (!guideRowsCache) guideRowsCache = buildGuideRows()
  return guideRowsCache
}
function guideLineStart(g, scroll) {
  return g.lineH ? clamp(Math.floor(scroll / g.lineH), 0, g.maxStart) : 0
}
function updateGuideThumb(g) {
  const trackH = g.viewH - 8
  const total = g.rows.length
  const visible = g.pool.length
  const thumbH = total > visible ? Math.max(24, Math.round(trackH * visible / total)) : trackH
  const ty = g.viewY + 4 + (g.max ? Math.round(g.scroll / g.max * (trackH - thumbH)) : 0)
  setRect(g.thumb, { y: ty, h: thumbH })
}

function setGuideScroll(v) {
  const g = screen.guide
  if (!g) return
  g.scroll = clamp(Math.round(v), 0, g.max)
  const start = guideLineStart(g, g.scroll)
  const rowsChanged = start !== g.lastStart
  g.lastStart = start

  if (rowsChanged) {
    for (let i = 0; i < g.pool.length; i++) {
      const slot = g.pool[i]
      const row = g.rows[start + i]
      if (!row || row.type === 'spacer') {
        setVisible(slot.dot, false)
        setText(slot.text, '')
        continue
      }
      if (row.type === 'title') {
        setVisible(slot.dot, false)
        setTextStyle(slot.text, { x: 28, y: slot.y, w: W - 66, h: 20, align_h: align.LEFT, align_v: align.CENTER_V, text_size: 19, color: GOLD, text: row.text })
        slot.text.t = row.text
      } else if (row.type === 'text') {
        setVisible(slot.dot, false)
        setTextStyle(slot.text, { x: 28, y: slot.y, w: W - 66, h: 20, align_h: align.LEFT, align_v: align.CENTER_V, text_size: 15, color: row.color || WHITE, text: row.text })
        slot.text.t = row.text
      } else if (row.type === 'element') {
        const color = (ELEMENTS[row.el] && ELEMENTS[row.el].color) || WHITE
        setRect(slot.dot, { x: 30, y: slot.y + 3, w: 14, h: 14, radius: 7, color })
        setVisible(slot.dot, true)
        setTextStyle(slot.text, { x: 50, y: slot.y, w: W - 88, h: 20, align_h: align.LEFT, align_v: align.CENTER_V, text_size: 15, color: WHITE, text: row.text })
        slot.text.t = row.text
      }
    }
  }
  updateGuideThumb(g)
}

function animateGuideScroll(deltaLines) {
  const g = screen.guide
  if (!g || !g.max) return
  scrollAnim = { from: g.scroll, to: clamp(g.scroll + deltaLines, 0, g.max), t0: now() }
}

function tickScroll(t) {
  if (slide || screen.name !== 'guide' || !scrollAnim) return
  const p = clamp((t - scrollAnim.t0) / 220, 0, 1)
  setGuideScroll(scrollAnim.from + (scrollAnim.to - scrollAnim.from) * ease(p))
  if (p >= 1) scrollAnim = null
}

function buildGuide() {
  const viewY = 44
  const viewH = 312
  const lineH = 20

  mkTextS(34, 2, W - 68, 38, 27, GOLD, align.CENTER_H, 'GUIDE')

  const rows = getGuideRows()
  const poolSize = Math.floor(viewH / lineH)
  const maxStart = Math.max(0, rows.length - poolSize)
  const g = { scroll: 0, max: maxStart * lineH, maxStart, viewY, viewH, lineH, rows, pool: [], lastStart: 0 }
  screen.guide = g

  for (let i = 0; i < poolSize; i++) {
    const y = viewY + i * lineH
    const row = rows[i]
    const isTitle = !!(row && row.type === 'title')
    const isText = !!(row && row.type === 'text')
    const isElement = !!(row && row.type === 'element')
    const dot = mkRect(30, y + 3, 14, 14, isElement ? ((ELEMENTS[row.el] && ELEMENTS[row.el].color) || WHITE) : WHITE, 7)
    if (!isElement) setVisible(dot, false)
    const text = mkText(
      isElement ? 50 : 28, y, isElement ? W - 88 : W - 66, lineH,
      isTitle ? 19 : 15,
      isTitle ? GOLD : isText ? (row.color || WHITE) : WHITE,
      align.LEFT,
      (isTitle || isText || isElement) ? row.text : '',
      align.CENTER_V
    )
    g.pool.push({ dot, text, y })
  }

  g.track = mkRect(W - 12, viewY + 4, 4, viewH - 8, INK, 2)
  g.thumb = mkRect(W - 12, viewY + 4, 4, viewH - 8, GOLD, 2)
  mkRect(0, viewY + viewH, W, H - (viewY + viewH), BG, 0)
  mkArtButton(Math.round(CX - artSize('btn_back_s')[0] / 2), 374, 'btn_back_s', () => gotoBack('den'))

  updateGuideThumb(g)
}

const SCREENS = {
  starter: buildStarter,
  den: buildDen,
  battle: buildBattle,
  catch: buildCatch,
  evolve: buildEvolve,
  notice: buildNotice,
  team: buildTeam,
  detail: buildDetail,
  feed: buildFeed,
  book: buildBook,
  guide: buildGuide,
  settings: buildSettings,
  boss: buildBoss
}

// ---------- input ----------
// A tap fires when the finger lifts (so a swipe that starts on a button does
// not press it). Watches that never report finger-lift fall back to firing
// 350 ms after touch-down. The catch screen fires on touch-down for timing.
// On the guide, MOVE events drag the document and swipes scroll a chunk.
let down = null
let upSeen = false
let lastMoveAt = 0

function onDown(e) {
  try {
    if (slide) return
    if (!e || typeof e.x !== 'number') return
    upSeen = false
    lastMoveAt = 0
    if (screen.instant) return fireTap(e.x, e.y)
    const t = now()
    down = {
      x: e.x, y: e.y, t,
      lastY: e.y, lastT: t, vy: 0,
      scr: screen, dragged: false,
      scroll0: screen.guide ? screen.guide.scroll : 0
    }
  } catch (err) {
    showError('tap', err)
  }
}
function onMove(e) {
  try {
    if (slide || !down || down.scr !== screen) return
    if (screen.name !== 'guide' || !e) return
    const t = now()
    if (t - lastMoveAt < 40) return
    lastMoveAt = t
    const px = typeof e.x === 'number' ? e.x : e.pos_x
    const py = typeof e.y === 'number' ? e.y : e.pos_y
    if (typeof py !== 'number') return
    const dy = down.y - py
    const dx = typeof px === 'number' ? Math.abs(px - down.x) : 0
    if (!down.dragged && (Math.abs(dy) < 8 || Math.abs(dy) < dx)) return
    const dt = Math.max(1, t - down.lastT)
    down.vy = (down.lastY - py) / dt
    down.lastY = py
    down.lastT = t
    down.dragged = true
    lastDrag = t
    scrollAnim = null
    const g = screen.guide
    const want = down.scroll0 + dy
    if (guideLineStart(g, want) !== g.lastStart) setGuideScroll(want)
    else {
      g.scroll = clamp(Math.round(want), 0, g.max)
      updateGuideThumb(g)
    }
  } catch (err) {
    showError('drag', err)
  }
}
function onUp(e) {
  try {
    upSeen = true
    const d = down
    down = null
    if (!d || d.scr !== screen) return
    if (d.dragged) {
      if (now() - d.lastT < 120 && Math.abs(d.vy) > 0.15) animateGuideScroll(d.vy * 180)
      return
    }
    if (e && typeof e.x === 'number' && (Math.abs(e.x - d.x) > 40 || Math.abs(e.y - d.y) > 40)) return
    fireTap(d.x, d.y)
  } catch (err) {
    showError('tap', err)
  }
}
function fireTap(x, y) {
  if (slide) return
  // the battle stats overlay: any tap closes it
  if (screen.name === 'battle' && screen.ui.stats && screen.ui.stats.open) {
    closeStats()
    return
  }
  // during battle messages a tap skips the wait
  if (screen.name === 'battle' && B.busy) {
    B.until = 0
    return
  }
  const taps = screen.taps
  for (let i = taps.length - 1; i >= 0; i--) {
    const b = taps[i]
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
      b.fn()
      return
    }
  }
}

function onSwipe(ev) {
  down = null
  if (slide) return true
  if (now() - lastDrag < 250) return true
  const n = screen.name
  if (n === 'guide') {
    if (ev === GESTURE_RIGHT) gotoBack('den')
    else if (ev === GESTURE_UP || ev === GESTURE_LEFT) animateGuideScroll(220)
    else if (ev === GESTURE_DOWN) animateGuideScroll(-220)
    else return false
    return true
  }
  if (n === 'den') {
    if (ev === GESTURE_LEFT) { goto('guide', 0, 1); return true }
    if (ev === GESTURE_RIGHT) { goto('boss', undefined, -1); return true }
    if (ev === GESTURE_UP) { goto('settings', undefined, 1, 'y'); return true }
    return false
  }
  if (n === 'settings' && (ev === GESTURE_RIGHT || ev === GESTURE_DOWN)) { home(); return true }
  if (n === 'boss' && (ev === GESTURE_LEFT || ev === GESTURE_RIGHT)) { home(); return true }
  if (n === 'book' && screen.arg && typeof screen.arg === 'object' && screen.arg.info) {
    if (ev === GESTURE_RIGHT) gotoBack('book', screen.arg.page)
    return ev === GESTURE_RIGHT || ev === GESTURE_LEFT
  }
  // Swipe left/right to flip pages in TEAM and BOOK; swipe right on page 1 goes home
  if (n === 'team' || n === 'book') {
    if (ev === GESTURE_LEFT && screen.pages > 1) {
      goto(n, (screen.page + 1) % screen.pages, 1)
      return true
    }
    if (ev === GESTURE_RIGHT) {
      if (screen.page > 0) goto(n, screen.page - 1, -1)
      else home()
      return true
    }
    return false
  }
  if (ev !== GESTURE_RIGHT) return false
  if (n === 'detail') { gotoBack('team', screen.arg.page); return true }
  if (n === 'feed') {
    if (screen.arg && screen.arg.back === 'detail') gotoBack('detail', { id: screen.arg.id, page: screen.arg.page })
    else home()
    return true
  }
  return n === 'battle' || n === 'catch' || n === 'evolve'
}

// ---------- main loop ----------
function tick() {
  try {
    const t = now()
    tickSlide(t)
    tickScroll(t)
    if (down && !upSeen && t - (down.dragged ? lastDrag : down.t) > 350) {
      const d = down
      down = null
      if (d.scr === screen && !d.dragged) fireTap(d.x, d.y)
    }
    if (screen.toastUntil && t > screen.toastUntil) {
      screen.toastUntil = 0
      setVisible(screen.ui.toastBg, false)
      setVisible(screen.ui.toast, false)
    }
    const n = screen.name
    if (n === 'battle') tickBattle(t)
    else if (n === 'catch') tickCatch(t)
    else if (n === 'evolve') tickEvolve(t)
    else if (n === 'settings') tickSettings(t)
    else if (n === 'detail') tickDetail(t)
    // once a minute: hunger, healing, free tracks
    if (t - lastMinute >= 60000) {
      passTime(t - lastMinute, n === 'battle' || n === 'catch') // no healing mid-fight
      lastMinute = t
    }
    // While a slide is running, denIdle would reset the lead's position and
    // make it snap. Leave the moving screen alone until the slide finishes.
    if (n === 'den' && !slide) denIdle(t)
    // elapsed-time check: t % 500 can skip or double-fire when the timer drifts
    if (n === 'den' && !slide && t - lastFacing >= 500) {
      lastFacing = t
      updateFacing()
    }
    if (n === 'den' && t - lastSensor >= 5000) {
      lastSensor = t
      updateSteps()
      if (t - lastHeart >= 60000) {
        lastHeart = t
        updateHeart()
      }
      if (!slide) updateDen()
    }
    if (t - lastSave >= SAVE_EVERY_MS) save()
  } catch (e) {
    if (timer !== null) clearInterval(timer)
    timer = null
    showError('tick', e)
  }
}

function showError(where, e) {
  const stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join('\n') : ''
  const msg = where + ' / ' + step + ': ' + (e && e.message ? e.message : String(e)) + '\n' + stack
  console.log('WRISTLINGS ERROR ' + msg)
  createWidget(widget.TEXT, { x: 15, y: 40, w: (W || 390) - 30, h: 380, text: msg, text_size: 18, color: RED, text_style: text_style.WRAP })
}

Page({
  build() {
    try {
      step = 'device'
      const info = getDeviceInfo()
      W = info.width
      H = info.height
      CX = Math.round(W / 2)
      try {
        setStatusBarVisible(false)
      } catch (e) {
        // keep the status bar
      }
      step = 'load'
      // forget any screen left over from an earlier run of this page
      screen = { name: '', ws: [], poss: [], taps: [], ui: {}, root: null }
      slide = null
      scrollAnim = null
      lastDrag = 0
      notices.length = 0
      weatherCache = { t: 0, kind: null }
      storage = new LocalStorage()
      st = load()
      const t = now()
      if (st.last) passTime(t - st.last)
      lastMinute = t
      lastSensor = t
      if (st.started) {
        updateSteps()
        checkSleep()
      }
      step = 'screen'
      if (!st.started) goto('starter')
      else home()
      try {
        onGesture({ callback: onSwipe })
      } catch (e) {
        console.log('WRISTLINGS no swipe events: ' + e)
      }
      timer = setInterval(tick, TICK_MS)
    } catch (e) {
      showError('build', e)
    }
  },
  onDestroy() {
    if (timer !== null) clearInterval(timer)
    compassOff()
    try {
      offGesture()
    } catch (e) {
      // nothing to undo
    }
    if (st) save()
  }
})
