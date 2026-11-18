// Tap Quest — an idle / clicker RPG for Zepp OS (API 4.0, built for Amazfit Bip 6)
//
// HOME (the battle):
//   * Tap the monster to hit it. 10 kills clear a stage; every 5th stage is a
//     timed BOSS (if it escapes you drop back a stage).
//   * Three skill buttons: RAGE (x2 damage), GOLD (x3 gold), SMITE (huge hit).
//   * BEST BUY: one tap buys the upgrade that adds the most power per gold.
//   * The menu button (three bars) or a swipe left opens the main menu (heroes,
//     upgrades, modes); a swipe up (or the small ^) opens the info menu (goals,
//     bestiary, stats, guide, settings). Some tabs appear only once unlocked.
//
// MENU (folders you swipe through):
//   * Swipe left/right (or tap the dots) to switch tabs.
//   * Swipe up/down (or the arrows) to turn pages. X or swipe right on the first tab closes.
//   * The battle keeps running while the menu is open.
//
// LONG GAME:
//   * From stage 20 you can REBIRTH: start over, but earn Stardust.
//     Every unspent Stardust gives +3% damage and gold, or spend it on RELICS.
//   * Progress is saved on the watch. While the app is closed your heroes keep
//     farming, and skill cooldowns keep counting down.
//
// Performance: native widgets updated only when a value changes, one small
// canvas for the monster, and one invisible touch layer for every tap.

import { createWidget, widget, event, prop, align, text_style, setStatusBarVisible } from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { LocalStorage } from '@zos/storage'
import { Time, Step } from '@zos/sensor'
import { onGesture, offGesture, GESTURE_LEFT, GESTURE_RIGHT, GESTURE_UP, GESTURE_DOWN } from '@zos/interaction'

// ---------- balance (change these to tune the game) ----------
const KILLS_PER_STAGE = 10
const BOSS_EVERY = 5
const BASE_BOSS_SECONDS = 30
const BASE_CRIT = 0.08
const CRIT_MULT = 4
const BASE_OFFLINE_HOURS = 4 // Dreamcatcher relics add +30 min each (up to 8h)
const DREAM_HOURS = 0.5 // extra offline hours per Dreamcatcher level
const SAVE_EVERY_SECONDS = 5
const TICK_MS = 100
const REBIRTH_FROM = 20 // stage you must reach before you can rebirth
const CHEST_CHANCE = 0.03 // chance that a normal monster is a loot chest instead
const CHEST_GOLD = 10 // a loot chest gives this many times the normal gold
const RUSH_TAPS = 8 // auto taps per second while the Rush skill is active
// +3% damage and gold per UNSPENT Stardust. Low on purpose: the first levels of a
// relic (+5% for 1-2 Stardust) are worth more, later levels are not, so spending
// vs saving is a real choice. Tuned with a simulated player: stage ~39 after 1 h,
// ~60 after 2 h, ~65 after 3 h.
const DUST_BONUS = 0.03
const TAP_RATE = 3 // taps per second assumed when BEST BUY values the sword
const SHOW_PERF = false // a small speed counter (turned off; set to true to measure speed again)

// Monster HP grows faster than gold, so every stage takes a bit longer.
// Tuned with a simulated player (4 taps/s, Best Buy, skills, rebirths):
// about stage 25 after 10 min, 34 after 1 hour, 41 after 2 hours, 45 after 3 hours.
function monsterHp(stage) {
  return Math.ceil(10 * Math.pow(1.55, stage - 1))
}
function bossHp(stage) {
  return monsterHp(stage) * 6
}
function goldFor(stage, boss) {
  return Math.ceil(3 * Math.pow(1.42, stage - 1)) * (boss ? 6 : 1)
}

// The Sword raises tap damage; heroes attack on their own (dps = damage per second at level 1).
// icon = the colour of the round icon in the menu.
// perks = bonuses unlocked when the hero reaches a level (on top of x2 every 25 levels):
//   self: this hero x N      all: every hero x N      tap: taps x N     gold: gold x N
//   tapDps: every tap also deals N of your DPS        crit: crits deal +N times more
//   skill: unlocks that skill (see SKILLS)
const HEROES = [
  { id: 'sword', name: 'Sword', base: 5, growth: 1.17, tap: true, icon: 0xd8dcf0,
    perks: [{ lv: 10, kind: 'tap', x: 2 }, { lv: 50, kind: 'crit', x: 1 }, { lv: 100, kind: 'tap', x: 3 }] },
  { id: 'archer', name: 'Archer', base: 20, growth: 1.15, dps: 1, icon: 0x4dd06a,
    perks: [{ lv: 10, kind: 'skill', skill: 'rage' }, { lv: 50, kind: 'self', x: 3 }, { lv: 100, kind: 'all', x: 1.1 }] },
  { id: 'mage', name: 'Mage', base: 250, growth: 1.16, dps: 9, icon: 0x5aa8ff,
    perks: [{ lv: 10, kind: 'skill', skill: 'rain' }, { lv: 50, kind: 'gold', x: 1.25 }, { lv: 100, kind: 'self', x: 3 }] },
  { id: 'knight', name: 'Knight', base: 3000, growth: 1.17, dps: 70, icon: 0xffd84d,
    perks: [{ lv: 10, kind: 'skill', skill: 'smite' }, { lv: 50, kind: 'tapDps', x: 0.02 }, { lv: 100, kind: 'self', x: 3 }] },
  { id: 'druid', name: 'Druid', base: 40000, growth: 1.17, dps: 520, icon: 0x3fae4a,
    perks: [{ lv: 10, kind: 'skill', skill: 'rush' }, { lv: 50, kind: 'all', x: 1.2 }, { lv: 100, kind: 'self', x: 3 }] },
  { id: 'golem', name: 'Golem', base: 600000, growth: 1.18, dps: 4000, icon: 0xb0a090,
    perks: [{ lv: 10, kind: 'skill', skill: 'lucky' }, { lv: 50, kind: 'self', x: 4 }, { lv: 100, kind: 'all', x: 1.2 }] },
  // fills the big price gap between Golem (600K) and Wyvern Rider (10M)
  { id: 'witch', name: 'Frost Witch', base: 2500000, growth: 1.18, dps: 12000, icon: 0x9cc4ea,
    perks: [{ lv: 10, kind: 'self', x: 2 }, { lv: 50, kind: 'all', x: 1.15 }, { lv: 100, kind: 'self', x: 3 }] },
  { id: 'wyvern', name: 'Wyvern Rider', base: 10000000, growth: 1.18, dps: 32000, icon: 0xff7a4a,
    perks: [{ lv: 10, kind: 'skill', skill: 'wind' }, { lv: 50, kind: 'all', x: 1.25 }, { lv: 100, kind: 'self', x: 4 }] },
  { id: 'monk', name: 'Sky Monk', base: 150000000, growth: 1.19, dps: 250000, icon: 0x4de0ff,
    perks: [{ lv: 10, kind: 'gold', x: 1.5 }, { lv: 50, kind: 'all', x: 1.3 }, { lv: 100, kind: 'self', x: 4 }] },
  { id: 'titan', name: 'Star Titan', base: 2500000000, growth: 1.2, dps: 2000000, icon: 0xc77dff,
    perks: [{ lv: 10, kind: 'self', x: 2 }, { lv: 50, kind: 'all', x: 1.5 }, { lv: 100, kind: 'self', x: 5 }] }
]

// Skills are free to use but have a cooldown. Each one is unlocked by levelling a hero.
const SKILLS = [
  { id: 'rage', name: 'Rage', short: 'RAGE', desc: 'x2 damage for 30s', hero: 'archer', heroLv: 10, duration: 30, cooldown: 180, color: 0xff5c5c },
  { id: 'rain', name: 'Gold Rain', short: 'GOLD', desc: 'x3 gold for 30s', hero: 'mage', heroLv: 10, duration: 30, cooldown: 300, color: 0xffd84d },
  { id: 'smite', name: 'Smite', short: 'SMITE', desc: 'one huge hit', hero: 'knight', heroLv: 10, duration: 0, cooldown: 120, color: 0x6cc4ff },
  { id: 'rush', name: 'Rush', short: 'RUSH', desc: '8 auto taps a second, 30s', hero: 'druid', heroLv: 10, duration: 30, cooldown: 240, color: 0x4dd06a },
  { id: 'lucky', name: 'Lucky Star', short: 'LUCK', desc: '+40% crit chance for 30s', hero: 'golem', heroLv: 10, duration: 30, cooldown: 300, color: 0xff7ac8 },
  { id: 'wind', name: 'Second Wind', short: 'WIND', desc: 'refresh all other skills', hero: 'wyvern', heroLv: 10, duration: 0, cooldown: 1800, color: 0x4de0ff }
]

function heroById(id) {
  return HEROES.find((h) => h.id === id)
}

// ---------- skill levels ----------
// A skill is level 1 when its hero reaches level 10, then gains a level at every
// 25 hero levels (25 -> 2, 50 -> 3, 75 -> 4, ...), the same levels where the hero
// itself doubles its power. Fewer levels than before, so each one is worth more.
const SKILL_LEVEL_EVERY = 25
function skillLevel(id) {
  const s = SKILLS.find((k) => k.id === id)
  const lv = st.lv[s.hero]
  return lv < s.heroLv ? 0 : Math.floor(lv / SKILL_LEVEL_EVERY) + 1 + conLv('lyra')
}
function skillBonusLevels(id) {
  return Math.max(0, skillLevel(id) - 1)
}
const rageMult = () => 2 + 0.25 * skillBonusLevels('rage') // x2, x2.25, x2.5 ...
const rainMult = () => 3 + 0.3 * skillBonusLevels('rain') // x3, x3.3, x3.6 ...
const smiteMult = () => 1 + 0.25 * skillBonusLevels('smite') // +25% per level
const rushRate = () => RUSH_TAPS + 1 * skillBonusLevels('rush') // +1 tap/s per level
const luckyBonus = () => 0.4 + 0.04 * skillBonusLevels('lucky') // +4% per level
function cooldownOf(s) {
  // Second Wind comes back 2.5 minutes sooner per level, never below 15 minutes
  return s.id === 'wind' ? Math.max(900, s.cooldown - 150 * skillBonusLevels('wind')) : s.cooldown
}

// The description with the current numbers, for the SKILLS menu.
function skillDesc(s) {
  if (s.id === 'rage') return 'x' + rageMult().toFixed(1) + ' damage, 30s'
  if (s.id === 'rain') return 'x' + rainMult().toFixed(2).replace(/0$/, '') + ' gold, 30s'
  if (s.id === 'smite') return 'huge hit' + (smiteMult() > 1 ? ' +' + Math.round((smiteMult() - 1) * 100) + '%' : '')
  if (s.id === 'rush') return rushRate().toFixed(1).replace('.0', '') + ' auto taps/s, 30s'
  if (s.id === 'lucky') return '+' + Math.round(luckyBonus() * 100) + '% crit, 30s'
  return 'refresh all other skills'
}

// Multiply together every perk of one kind that has been reached.
function perkProduct(kind, onlyHero) {
  let m = 1
  for (const h of HEROES) {
    if (onlyHero && h !== onlyHero) continue
    for (const p of h.perks) if (p.kind === kind && st.lv[h.id] >= p.lv) m *= p.x
  }
  return m
}

function perkSum(kind) {
  let s = 0
  for (const h of HEROES) for (const p of h.perks) if (p.kind === kind && st.lv[h.id] >= p.lv) s += p.x
  return s
}

// What this hero unlocks next (a perk or a x2 milestone), for the menu.
function nextGoal(h) {
  const lv = st.lv[h.id]
  const nextMilestone = (Math.floor(lv / 25) + 1) * 25
  const perk = h.perks.find((p) => p.lv > lv)
  if (perk && perk.lv <= nextMilestone) {
    const text =
      perk.kind === 'skill' ? SKILLS.find((s) => s.id === perk.skill).short + ' skill'
        : perk.kind === 'self' ? 'x' + perk.x
          : perk.kind === 'all' ? 'all +' + Math.round((perk.x - 1) * 100) + '%'
            : perk.kind === 'tap' ? 'taps x' + perk.x
              : perk.kind === 'gold' ? 'gold +' + Math.round((perk.x - 1) * 100) + '%'
                : perk.kind === 'tapDps' ? 'taps +' + Math.round(perk.x * 100) + '% DPS'
                  : 'crits x' + (CRIT_MULT + perk.x)
    return text + ' at ' + perk.lv
  }
  return 'x2 at ' + nextMilestone
}

// Permanent upgrades bought with Stardust. They survive rebirth.
const RELICS = [
  // per = what one level of the relic adds (the description says the same)
  { id: 'edge', name: 'Sharp Edge', desc: '+5% tap damage', per: 0.05, max: 50, icon: 0xd8dcf0 },
  { id: 'banner', name: 'War Banner', desc: '+5% hero damage', per: 0.05, max: 50, icon: 0xff5c5c },
  { id: 'coin', name: 'Lucky Coin', desc: '+5% gold', per: 0.05, max: 50, icon: 0xffd84d },
  { id: 'eye', name: 'Hawk Eye', desc: '+1.5% crit chance', per: 0.015, max: 10, icon: 0x4de0ff },
  { id: 'glass', name: 'Hourglass', desc: '+2s boss timer', per: 2, max: 10, icon: 0xe0a860 },
  { id: 'dream', name: 'Dreamcatcher', desc: '+5% offline gold, +30min', per: 0.05, max: 8, icon: 0xc77dff }
]

function cost(h, level) {
  return Math.ceil(h.base * Math.pow(h.growth, level))
}
function costN(h, level, n) {
  let total = 0
  for (let i = 0; i < n; i++) total += cost(h, level + i)
  return total
}
function relicCost(level) {
  return Math.ceil(Math.pow(1.6, level))
}
// every 25 levels of something doubles its power
function milestone(level) {
  return Math.pow(2, Math.floor(level / 25))
}

// ---------- colours ----------
const BG = 0x0d0f1e
const PANEL = 0x161b30
const PANEL_ON = 0x22305a
const EDGE = 0x2e3658
const GOLD = 0xffd84d
const DIM = 0x7a83a8
const LOCKED = 0x3a4166
const WHITE = 0xffffff
const RED = 0xff5c5c
const BLUE = 0x6cc4ff
const GREEN = 0x4dd06a
const PURPLE = 0xc77dff
const OVERLAY = 0x1c2547

// ---------- 8-bit monsters (12x12 pixels, '.' = transparent) ----------
// Each enemy has two colour sets; the second one appears the next time round the worlds.
const ENEMIES = {
  slime: {
    name: 'SLIME',
    rows: [
      '............', '............', '....gggg....', '...gggggg...',
      '..gggggggg..', '..gwkggwkg..', '.ggwkggwkgg.', '.gggggggggg.',
      '.ggggddgggg.', 'gggggggggggg', '.dddddddddd.', '............'
    ],
    pals: [
      { g: 0x4dd06a, d: 0x2a8a40, w: 0xffffff, k: 0x101010 },
      { g: 0x5aa8ff, d: 0x2f5fa8, w: 0xffffff, k: 0x101010 }
    ]
  },
  bat: {
    name: 'BAT',
    rows: [
      '............', 'p..........p', 'pp..p..p..pp', 'ppp.pppp.ppp',
      'pppppppppppp', 'pppprpprpppp', 'pppppppppppp', '.pppwppwppp.',
      '..pp.pp.pp..', '..p..pp..p..', '............', '............'
    ],
    pals: [
      { p: 0x8a5cd6, r: 0xff3b3b, w: 0xffffff },
      { p: 0x5a5a6e, r: 0xffd84d, w: 0xffffff }
    ]
  },
  skull: {
    name: 'SKULL',
    rows: [
      '............', '...wwwwww...', '..wwwwwwww..', '.wwwwwwwwww.',
      '.wkkwwwwkkw.', '.wkkwwwwkkw.', '.wwwwkkwwww.', '..wwwwwwww..',
      '...wkwkwk...', '...wwwwww...', '............', '............'
    ],
    pals: [
      { w: 0xe8e2d0, k: 0x151515 },
      { w: 0xb8f0ff, k: 0x0b2a55 }
    ]
  },
  shroom: {
    name: 'SHROOM',
    rows: [
      '............', 
      '....rrrr....', 
      '..rrwwrrrr..', 
      '.rrrwwrrwwr.',
      '.rrrrrrrwwr.', 
      'rrwwrrrrrrrr', 
      'rrrrrrrrrrrr', 
      '...ssssss...',
      '...skssks...', 
      '...ssssss...', 
      '..ssssssss..', 
      '............'
    ],
    pals: [
      { r: 0xe03c3c, w: 0xffffff, s: 0xf2d2a9, k: 0x151515 },
      { r: 0x9b5cff, w: 0xffd84d, s: 0xf2d2a9, k: 0x151515 }
    ]
  },
  ghost: {
    name: 'GHOST',
    rows: [
      '............', '....wwww....', '...wwwwww...', '..wwwwwwww..',
      '..wkkwwkkw..', '..wkkwwkkw..', '..wwwwwwww..', '..wwwkkwww..',
      '..wwwwwwww..', '..wwwwwwww..', '..w.ww.ww.w.', '............'
    ],
    pals: [
      { w: 0xf0f0ff, k: 0x202040 },
      { w: 0xa8ffcf, k: 0x0d3b24 }
    ]
  },
  goblin: {
    name: 'GOBLIN',
    rows: [
      '............', '.g..gggg..g.', '.gggggggggg.', '..ggrggrgg..',
      '..gggggggg..', '...gkwkwkg..', '...gggggg...', '..bbbbbbbb..',
      '.gbbbbbbbbg.', '.g.bbbbbb.g.', '...bb..bb...', '...gg..gg...'
    ],
    pals: [
      { g: 0x7cc242, r: 0xff3b3b, k: 0x1a1a1a, w: 0xffffff, b: 0x7a4a24 },
      { g: 0x6a9bd8, r: 0xffd84d, k: 0x1a1a1a, w: 0xffffff, b: 0x3a3a5a }
    ]
  },
  spider: {
    name: 'SPIDER',
    rows: [
      '............', 'k..........k', '.k..kkkk..k.', '..kkkkkkkk..',
      'kkkrkkkkrkkk', '..kkkppkkk..', '.kkkpppppkk.', 'k..kkppkk..k',
      '..k.kkkk.k..', '.k..k..k..k.', 'k...k..k...k', '............'
    ],
    pals: [
      { k: 0x2a2a35, r: 0xff3b3b, p: 0xc77dff },
      { k: 0x5a3a1a, r: 0x9dff7a, p: 0xffd84d }
    ]
  },
  snake: {
    name: 'SNAKE',
    rows: [
      '............', '......gggg..', '.....gkgggg.', '.....gggggg.',
      '.......ggr.r', '......gg....', '..gggggg....', '.ggyyyygg...',
      'gg......gg..', 'gg......ggg.', '.gggyyyggg..', '..gggggg....'
    ],
    pals: [
      { g: 0x3fae4a, y: 0xe8d84d, k: 0x101010, r: 0xff3b3b },
      { g: 0xd08a3a, y: 0xf2d2a9, k: 0x101010, r: 0xff3b3b }
    ]
  },
  crab: {
    name: 'CRAB',
    rows: [
      '............', 'rr........rr', 'r.r......r.r', 'rr..w..w..rr',
      '.r..k..k..r.', '..rrrrrrrr..', '.rrrrrrrrrr.', 'rrrrrkkrrrrr',
      '.rrrrrrrrrr.', 'r.r.r..r.r.r', '.r.r....r.r.', '............'
    ],
    pals: [
      { r: 0xff6a3d, w: 0xffffff, k: 0x101010 },
      { r: 0x4db8ff, w: 0xffffff, k: 0x101010 }
    ]
  },
  eye: {
    name: 'WATCHER',
    rows: [
      '............', '....wwww....', '..wwwwwwww..', '.wwpwbbwwpw.',
      '.wwwbbbbwww.', 'wwwbbkkbbwww', 'wwwbbkkbbwww', '.wwwbbbbwww.',
      '.wpwwbbwwpw.', '..wwwwwwww..', '....wwww....', '.....pp.....'
    ],
    pals: [
      { w: 0xf4f0e8, b: 0x2f7dd1, k: 0x101010, p: 0xff6b8a },
      { w: 0xf4f0e8, b: 0x3fae4a, k: 0x101010, p: 0xc77dff }
    ]
  },
  imp: {
    name: 'IMP',
    rows: [
      '............', '.h........h.', '.hh.rrrr.hh.', '..rrrrrrrr..',
      '..ryyrryyr..', '..rkyrrykr..', '..rrrkkrrr..', '...rrrrrr...',
      '.rrrrrrrrrr.', 'r..rrrrrr..r', '...rr..rr...', '..rr....rr..'
    ],
    pals: [
      { r: 0xd23a3a, y: 0xffd84d, k: 0x101010, h: 0xf0e6d2 },
      { r: 0x7a4ad8, y: 0x9dff7a, k: 0x101010, h: 0xf0e6d2 }
    ]
  },
  golem: {
    name: 'ROCK GOLEM',
    rows: [
      '............', '...ssssss...', '..ssggssss..', '..syssssys..',
      '..ssssssss..', '.ssddssddss.', 'ssssssssssss', 'ss.ssssss.ss',
      'ss.ssgsss.ss', '...ssssss...', '...ss..ss...', '..sss..sss..'
    ],
    pals: [
      { s: 0x8a8a96, d: 0x55555f, g: 0x5aa84a, y: 0xffd84d },
      { s: 0xa8c8e8, d: 0x6a88a8, g: 0xffffff, y: 0x4db8ff }
    ]
  },
  rat: {
    name: 'RAT',
    rows: [
      '............', '.pp......pp.', '.pgg....ggp.', '..gggggggg..',
      '.ggkggggkgg.', '.gggggggggg.', '..gggppggg..', '...gggggg...',
      '..gggggggg..', '.gggggggggg.', '..gg....gg.p', '...........p'
    ],
    pals: [
      { g: 0x8a8090, p: 0xff9ab0, k: 0x101010 },
      { g: 0xc8a070, p: 0xff9ab0, k: 0x101010 }
    ]
  },
  wisp: {
    name: 'FIRE WISP',
    rows: [
      '.....o......', '....oo..o...', '...ooo.oo...', '..ooyyyoo...',
      '..oyyyyyoo..', '.ooykyykyoo.', '.ooyyyyyyoo.', '.ooyyrryyoo.',
      '..ooyyyyoo..', '...oooooo...', '....rrrr....', '............'
    ],
    pals: [
      { o: 0xff7a2a, y: 0xffe066, r: 0xd23a1a, k: 0x2a1000 },
      { o: 0x4db8ff, y: 0xd8f4ff, r: 0x2a5ad8, k: 0x001030 }
    ]
  },
  cactus: {
    name: 'CACTUS',
    rows: [
      '.....yy.....', '....gggg....', '...gggggg...', '...gkggkg...',
      'g..gggggg..g', 'g..ggddgg..g', 'gggggggggggg', '...gggggg...',
      '...gdggdg...', '...gggggg...', '..bbbbbbbb..', '...bbbbbb...'
    ],
    pals: [
      { g: 0x4fae4a, d: 0x2a6a2a, y: 0xff6ac8, k: 0x101010, b: 0xb0602a },
      { g: 0x7ac8a0, d: 0x3a7a5a, y: 0xffd84d, k: 0x101010, b: 0x8a4a2a }
    ]
  },
  yeti: {
    name: 'YETI',
    rows: [
      '...wwwwww...', '..wwwwwwww..', '.wwbbbbbbww.', '.wbkbbbbkbw.',
      '.wbbbbbbbbw.', '.wbbkkkkbbw.', 'wwwbbbbbbwww', 'wwwwwwwwwwww',
      'ww.wwwwww.ww', 'ww.wwwwww.ww', '...ww..ww...', '..www..www..'
    ],
    pals: [
      { w: 0xf2f6ff, b: 0x8ab4e0, k: 0x101828 },
      { w: 0xe8d8c0, b: 0xc89070, k: 0x201008 }
    ]
  },
  slug: {
    name: 'LAVA SLUG',
    rows: [
      '............', '............', '.......y..y.', '.......o..o.',
      '......oooooo', '.....ookooko', '....oooooooo', '..oooorroooo',
      '.oooorrrrooo', 'ooorrrrrrrro', 'oooooooooooo', '.yy.yy.yy.yy'
    ],
    pals: [
      { o: 0xff6a2a, r: 0xd2281a, y: 0xffd84d, k: 0x200800 },
      { o: 0x9b5cff, r: 0x5a2aa8, y: 0xff9ae8, k: 0x100020 }
    ]
  },
  owl: {
    name: 'OWL',
    rows: [
      '.b........b.', '.bb......bb.', '.bbbbbbbbbb.', 'bbwwwbbwwwbb',
      'bbwkwbbwkwbb', 'bbwwwyywwwbb', '.bbbbyybbbb.', '.bbwbbbbwbb.',
      '.bwbwbbwbwb.', '..bbbbbbbb..', '...y....y...', '..yy....yy..'
    ],
    pals: [
      { b: 0x8a5a32, w: 0xf4ecd8, k: 0x101010, y: 0xffb030 },
      { b: 0xd8dce8, w: 0xffffff, k: 0x101010, y: 0xffd84d }
    ]
  },
  mummy: {
    name: 'MUMMY',
    rows: [
      '...wwwwww...', '..wddwwwww..', '..wwwwddww..', '..wgkwwgkw..',
      '..wwwwwwww..', '..wddddwww..', '.wwwwwwwwww.', 'w.wwddwwww.w',
      '..wwwwwddw..', '..wddwwwww..', '..ww....ww..', '..ww....ww..'
    ],
    pals: [
      { w: 0xe8dcb8, d: 0xa89870, g: 0x9dff7a, k: 0x101010 },
      { w: 0xd0d8e8, d: 0x8890a8, g: 0xff5c5c, k: 0x101010 }
    ]
  },
  bug: {
    name: 'CRYSTAL BUG',
    rows: [
      '..k......k..', '...k....k...', '...pppppp...', '..pwcppwcp..',
      '..pppppppp..', '.cccppppccc.', 'ccwccccccwcc', '.cccccccccc.',
      'k.cccwwccc.k', '.k.cccccc.k.', 'k..cc..cc..k', '............'
    ],
    pals: [
      { c: 0x4de0ff, p: 0x9b5cff, w: 0xffffff, k: 0x2a2a40 },
      { c: 0x7cf07a, p: 0x2f9e5a, w: 0xffffff, k: 0x1a2a1a }
    ]
  },
  chest: {
    name: 'LOOT CHEST',
    rows: [
      '............', '............', '..bbbbbbbb..', '.bbbbbbbbbb.',
      '.byyyyyyyyb.', '.bbbbyybbbb.', '.yyyykkyyyy.', '.bbbbyybbbb.',
      '.bbbbbbbbbb.', '.byyyyyyyyb.', '.bbbbbbbbbb.', '............'
    ],
    pals: [
      { b: 0x9a5a2a, y: 0xffd84d, k: 0x2a1000 },
      { b: 0x5a5a7a, y: 0x4de0ff, k: 0x101030 }
    ]
  },
  treant: {
    name: 'ANCIENT TREANT',
    boss: true,
    rows: [
      '..gggggggg..', '.gggggggggg.', 'gggggggggggg', 'ggbbbbbbbbgg',
      '..byybbyyb..', '..bkybbkyb..', '..bbbbbbbb..', '..bkkkkkkb..',
      '.bbbbbbbbbb.', 'b.bbbbbbbb.b', '..bb.bb.bb..', '.bb..bb..bb.'
    ],
    pals: [
      { g: 0x3fae4a, b: 0x7a4a24, y: 0xffd84d, k: 0x101010 },
      { g: 0xd8e8f8, b: 0x5a4a5a, y: 0x4de0ff, k: 0x101010 }
    ]
  },
  thief: {
    name: 'GOLD THIEF',
    rows: [
      '............', '...mmmmmm...', '..mmmmmmmm..', '..mwkmmwkm..',
      '..ssssssss..', '...ssssss...', '..mmmmmm.yy.', '.mmmmmmmbyyb',
      '.m.mmmm.bbbb', '...mmmm..bb.', '...m..m.....', '..mm..mm....'
    ],
    pals: [
      { m: 0x3a3a5a, s: 0xf2d2a9, w: 0xffffff, k: 0x101010, b: 0x9a5a2a, y: 0xffd84d },
      { m: 0x5a2a3a, s: 0xc89070, w: 0xffffff, k: 0x101010, b: 0x5a5a7a, y: 0x4de0ff }
    ]
  },
  // bosses
  dragon: {
    name: 'DRAGON',
    boss: true,
    rows: [
      '..r......r..', '..rr....rr..', '..rrrrrrrr..', '.rrrrrrrrrr.',
      '.ryyrrrryyr.', '.rkyrrrrykr.', '.rrrrrrrrrr.', 'rrrrrrrrrrrr',
      'rrwrwrrwrwrr', 'rrkkkkkkkkrr', '.rwrwrrwrwr.', '..rrrrrrrr..'
    ],
    pals: [
      { r: 0xc0392b, y: 0xffd84d, k: 0x111111, w: 0xffffff },
      { r: 0x1f7a4d, y: 0xff5c5c, k: 0x111111, w: 0xffffff }
    ]
  },
  cyclops: {
    name: 'CYCLOPS',
    boss: true,
    rows: [
      '...ssssss...', '..ssssssss..', '.sssswwssss.', '.ssswwkwsss.',
      '.sssswwssss.', '.ssssssssss.', '.sskkkkkkss.', '..ssswwsss..',
      '.bbbbbbbbbb.', 'sbbbbbbbbbbs', 's.bbb..bbb.s', '..ss....ss..'
    ],
    pals: [
      { s: 0x8fbf5a, w: 0xffffff, k: 0x101010, b: 0x7a4a24 },
      { s: 0xa8c8e8, w: 0xffffff, k: 0x101010, b: 0x3a4a6a }
    ]
  },
  kraken: {
    name: 'KRAKEN',
    boss: true,
    rows: [
      '....pppp....', '..pppppppp..', '.pppppppppp.', '.pyyppppyyp.',
      '.pykppppkyp.', '.pppppppppp.', '..pppwwppp..', '.p.pppppp.p.',
      'p.p.p..p.p.p', 'p.p.p..p.p.p', '.p..p..p..p.', 'p..p....p..p'
    ],
    pals: [
      { p: 0x9b5cff, y: 0xffd84d, k: 0x101010, w: 0xffffff },
      { p: 0x2f9ea8, y: 0xff5c5c, k: 0x101010, w: 0xffffff }
    ]
  }
}

// ---------- worlds (a new one every 5 stages, then they repeat) ----------
// sky: top, middle, horizon · hills: back, front · ground: soil, grass edge
// light: sun/moon (null = none) · fx: the moving particles · clouds: drifting clouds
const WORLDS = [
  {
    name: 'MEADOW',
    sky: [0x2a5aa8, 0x3a74c4, 0x6aa6dc], hills: [0x3d8a4a, 0x4fa85a], ground: [0x6a4626, 0x7cd04a],
    light: { color: 0xffe066, glow: 0x4f7fb0, r: 18, x: 300, y: 70 },
    fx: { mode: 'float', color: 0xfff3a0 }, clouds: 0xd8e6f5,
    enemies: ['slime', 'goblin', 'shroom', 'snake', 'rat', 'owl'], boss: 'treant'
  },
  {
    name: 'DESERT',
    sky: [0x6a2a5a, 0xb04a4a, 0xf09a50], hills: [0xc98a42, 0xe0a858], ground: [0x9a6a32, 0xf0c070],
    light: { color: 0xffb347, glow: 0xb85a3a, r: 24, x: 90, y: 92 },
    fx: { mode: 'dust', color: 0xe8c080 }, clouds: null,
    enemies: ['snake', 'crab', 'skull', 'spider', 'cactus', 'mummy'], boss: 'dragon'
  },
  {
    name: 'CRYSTAL CAVE',
    sky: [0x0c0a16, 0x161226, 0x221b36], hills: [0x2e2840, 0x3c3452], ground: [0x221d2c, 0x5a4a7a],
    light: null,
    fx: { mode: 'fireflies', color: 0x9dff7a }, clouds: null,
    enemies: ['spider', 'bat', 'eye', 'golem', 'bug', 'rat'], boss: 'kraken'
  },
  {
    name: 'FROST PEAKS',
    sky: [0x2e4a7a, 0x5a82b8, 0x9cc4ea], hills: [0xc8d8ee, 0xe6eff9], ground: [0xa8bcd6, 0xffffff],
    light: { color: 0xf4f8ff, glow: 0x5a7aa8, r: 15, x: 80, y: 60 },
    fx: { mode: 'snow', color: 0xffffff }, clouds: 0xc8d6ea,
    enemies: ['ghost', 'golem', 'bat', 'slime', 'yeti', 'owl'], boss: 'cyclops'
  },
  {
    name: 'VOLCANO',
    sky: [0x1f0808, 0x4a140c, 0x7a2810], hills: [0x3a1c14, 0x4f2418], ground: [0x2b1510, 0xff5a1f],
    light: { color: 0xff6a2a, glow: 0x6a1c0c, r: 20, x: 310, y: 100 },
    fx: { mode: 'embers', color: 0xff8a3a }, clouds: null,
    enemies: ['imp', 'skull', 'crab', 'golem', 'slug', 'wisp'], boss: 'dragon'
  },
  {
    name: 'MOONLIT WOODS',
    sky: [0x050816, 0x0b1430, 0x16244a], hills: [0x0f2a1e, 0x153a29], ground: [0x15110d, 0x1f4a32],
    light: { color: 0xf0f0e0, glow: 0x1c2a52, r: 16, x: 300, y: 64 },
    fx: { mode: 'stars', color: 0xffffff }, clouds: null,
    enemies: ['ghost', 'bat', 'eye', 'imp', 'owl', 'wisp'], boss: 'treant'
  }
]

function worldFor(stage) {
  return WORLDS[Math.floor((stage - 1) / BOSS_EVERY) % WORLDS.length]
}

// ---------- module state ----------
let W, H, CX
let monCanvas
let timer = null
let storage = null
let timeSensor = null
let st // game state
let lastTick = 0
let saveTimer = 0
let lastTapAt = 0
let pausedAt = 0

const L = {} // layout
const ui = {} // widgets
const menu = { open: false, kind: 'main', cat: 0, page: 0, mult: 1 }
const CATS = ['HEROES', 'SKILLS', 'RELICS', 'REBIRTH', 'GEAR', 'TRAVEL', 'ASCEND', 'GOALS', 'BESTIARY', 'MODES', 'STATS', 'GUIDE', 'SETTINGS']
const ROWS_PER_PAGE = 3

function layout() {
  CX = W / 2
  // home
  L.goldY = 8
  L.stageY = 46
  L.monX = CX - 80
  L.monY = 74
  L.monW = 160
  L.monH = 140
  // The plate under the monster (name, HP bar, info line). Everything on it is
  // placed relative to plateY, so moving the plate is one number.
  L.plateY = 218
  L.tapBottom = L.plateY + 66 // taps above this line attack
  L.prevStage = { x: 40, y: 14, w: 54, h: 46 } // top-left arrow: go back a stage
  L.nextStage = { x: 296, y: 14, w: 54, h: 46 } // top-right arrow: go forward a stage
  L.skillY = 318
  L.skillR = 21
  L.skillX = [CX - 140, CX - 84, CX - 28, CX + 28, CX + 84, CX + 140] // six skills in one row
  // bottom row: gold on the left, BEST BUY in the middle, menu on the right.
  // As low as the screen's rounded corners allow (bottom edge at 420).
  L.goldBox = { x: 24, y: 362, w: 106, h: 58 }
  L.best = { x: 136, y: 362, w: 166, h: 58 }
  L.menuBtn = { x: 308, y: 362, w: 52, h: 58 }
  L.infoHint = { x: CX - 40, y: 422, w: 80, h: 28 }
  // menu
  L.dotY = 24
  // a round X tucked into the top-right corner: its centre sits on the corner's
  // diagonal so it still fits inside the rounded screen edge (corner radius 86)
  L.close = { x: 324, y: 22, w: 44, h: 44 }
  L.closeTap = { x: 300, y: 0, w: W - 300, h: 76 } // the whole corner closes the menu
  // its mirror in the top-left corner swaps between the main and the info menu
  L.swap = { x: W - L.close.x - L.close.w, y: L.close.y, w: L.close.w, h: L.close.h }
  L.swapTap = { x: 0, y: 0, w: W - L.closeTap.x, h: L.closeTap.h }
  L.rows = [82, 164, 246].map((y) => ({ x: 30, y, w: 330, h: 74 }))
  L.up = { x: 30, y: 330, w: 70, h: 48 }
  L.mid = { x: 110, y: 330, w: 170, h: 48 }
  L.down = { x: 290, y: 330, w: 70, h: 48 }
}

// ---------- clock & saving ----------
function now() {
  try {
    if (!timeSensor) timeSensor = new Time()
    return timeSensor.getTime()
  } catch (e) {
    return Date.now()
  }
}

function freshRun(s) {
  // the Vela constellation lets every new run start further in
  const startStage = 1 + 5 * ((s.asc && s.asc.levels && s.asc.levels.vela) || 0)
  s.gold = 0
  s.stage = startStage
  s.kills = 0
  s.runBest = startStage
  s.lv = {}
  for (const h of HEROES) s.lv[h.id] = 0
}

function freshState() {
  const s = {
    best: 1,
    dust: 0,
    relics: {},
    skills: {},
    stats: {
      kills: 0, taps: 0, rebirths: 0, dustEarned: 0, chests: 0, goldEarned: 0, bosses: 0, skillsUsed: 0, thieves: 0, stepDust: 0, dailies: 0,
      starsCaught: 0, gearFound: 0, trips: 0, ascensions: 0, challenges: 0
    },
    ach: {}, // achievements reached (id -> true); they survive rebirth
    stars: {}, // hero stars from rebirths (id -> count); they survive rebirth
    daily: null, // today's goal
    steps: { day: 0, claimed: 0 }, // steps already turned into Stardust today
    tutorial: 0, // how many first-launch hints were shown
    tips: {}, // feature tips already shown (id -> true)
    auto: false, // auto-advance while farming
    anim: true, // menu transitions
    bestiary: {}, // monster id -> kills (forever)
    gear: { weapon: null, charm: null, banner: null }, // equipped items (forever)
    pet: { lv: 1, treats: 0 }, // the companion (forever)
    trip: null, // the current expedition { hero, hours, endAt }
    tripHours: 1, // expedition length chosen in the TRAVEL tab
    asc: { shards: 0, dustAt: 0, levels: {} }, // ascension (the second, bigger reset)
    chal: { active: null, done: {}, saved: null }, // challenges
    rush: { best: 0, day: 0, active: null } // boss rush
  }
  freshRun(s)
  for (const r of RELICS) s.relics[r.id] = 0
  for (const k of SKILLS) s.skills[k.id] = { readyAt: 0, activeUntil: 0 }
  for (const h of HEROES) s.stars[h.id] = 0
  return s
}

function save() {
  saveTimer = 0
  const data = {
    v: 3,
    gold: st.gold, stage: st.stage, kills: st.kills, best: st.best, runBest: st.runBest,
    lv: st.lv, dust: st.dust, relics: st.relics, skills: st.skills, stats: st.stats,
    ach: st.ach, stars: st.stars, daily: st.daily, steps: st.steps, tutorial: st.tutorial, tips: st.tips, auto: st.auto, anim: st.anim,
    bestiary: st.bestiary, gear: st.gear, pet: st.pet, trip: st.trip, tripHours: st.tripHours,
    asc: st.asc, chal: st.chal, rush: { best: st.rush.best, day: st.rush.day, active: null, saved: st.rush.saved || null },
    last: now()
  }
  try {
    storage.setItem('save', JSON.stringify(data))
  } catch (e) {
    console.log('TAP QUEST save failed: ' + e)
  }
}

function load() {
  let data = null
  try {
    const raw = storage.getItem('save', '')
    if (raw) data = JSON.parse(raw)
  } catch (e) {
    console.log('TAP QUEST could not read save: ' + e)
  }
  const s = freshState()
  if (data) {
    // works for both the old (v1) and the new save format
    s.gold = data.gold || 0
    s.stage = data.stage || 1
    s.kills = data.kills || 0
    s.best = data.best || s.stage
    s.runBest = data.runBest || s.stage
    s.dust = data.dust || 0
    for (const k in s.lv) s.lv[k] = (data.lv && data.lv[k]) || 0
    for (const k in s.relics) s.relics[k] = (data.relics && data.relics[k]) || 0
    for (const k in s.skills) if (data.skills && data.skills[k]) s.skills[k] = data.skills[k]
    if (data.stats) for (const k in s.stats) s.stats[k] = data.stats[k] || 0
    if (data.ach) s.ach = data.ach
    for (const k in s.stars) s.stars[k] = (data.stars && data.stars[k]) || 0
    if (data.daily) s.daily = data.daily
    if (data.steps) s.steps = data.steps
    // someone who already played (an older save) does not need the tutorial
    s.tutorial = data.tutorial !== undefined ? data.tutorial : 99
    s.auto = !!data.auto
    s.anim = data.anim !== false
    if (data.tips) s.tips = data.tips
    if (data.bestiary) s.bestiary = data.bestiary
    if (data.gear) s.gear = Object.assign(s.gear, data.gear)
    if (data.pet) s.pet = data.pet
    if (data.trip) s.trip = data.trip
    if (data.tripHours) s.tripHours = data.tripHours
    if (data.asc) s.asc = Object.assign(s.asc, data.asc)
    if (data.chal) s.chal = Object.assign(s.chal, data.chal)
    if (data.rush) {
      s.rush.best = data.rush.best || 0
      s.rush.day = data.rush.day || 0
      // the app closed during a boss rush: put the normal run back
      if (data.rush.saved) Object.assign(s, data.rush.saved)
    }
  }
  return { state: s, last: data ? data.last : 0 }
}

// ---------- power ----------
function rl(id) {
  return st.relics[id]
}
// the total bonus of a relic: its level x what one level adds (see RELICS)
function relicValue(id) {
  return st.relics[id] * RELICS.find((r) => r.id === id).per
}
function buffActive(id) {
  return st.skills[id].activeUntil > now()
}
function dmgMult(withBuffs) {
  return (1 + DUST_BONUS * st.dust) * achBonus('dmg') * bestiaryMult() * petMult() * (1 + 0.5 * conLv('orion')) *
    (withBuffs && buffActive('rage') ? rageMult() : 1) * (withBuffs && frenzyOn() ? FRENZY_MULT : 1)
}
function goldMult(withBuffs) {
  return (1 + relicValue('coin')) * (1 + DUST_BONUS * st.dust) * perkProduct('gold') * achBonus('gold') * gearMult('banner') *
    (1 + 0.5 * conLv('pleiades')) * (chalDone('poor') ? 1.3 : 1) * (chalOn('poor') ? 0.3 : 1) * (eventIs('gold') ? 1.5 : 1) *
    (withBuffs && buffActive('rain') ? rainMult() : 1)
}
// a hero's own perks of one kind, for a given level (so BEST BUY can look one level ahead)
function ownPerk(h, kind, lv) {
  let m = 1
  for (const p of h.perks) if (p.kind === kind && lv >= p.lv) m *= p.x
  return m
}
function tapBase(lv) {
  return Math.ceil((1 + lv) * milestone(lv) * Math.pow(1.05, lv)) * ownPerk(HEROES[0], 'tap', lv) * starMult('sword')
}
function tapDamage() {
  // taps also deal a share of your DPS once the Knight reaches level 50
  return tapBase(st.lv.sword) * (1 + relicValue('edge')) * gearMult('weapon') * (chalDone('bare') ? 1.5 : 1) * dmgMult(true) + perkSum('tapDps') * partyDps(true)
}
function heroDps(h, lv) {
  return h.dps * lv * milestone(lv) * ownPerk(h, 'self', lv) * starMult(h.id)
}
function heroMult() {
  return perkProduct('all') * (1 + relicValue('banner')) * gearMult('charm') * (chalDone('hasty') ? 1.3 : 1)
}
function partyDps(withBuffs) {
  let total = 0
  if (chalOn('bare')) return 0 // the Bare Hands challenge: heroes do nothing
  // a hero on an expedition does not fight; element pairs add +30%
  for (const h of HEROES) if (h.dps && !tripAway(h.id)) total += heroDps(h, st.lv[h.id]) * pairMult(h.id)
  return total * heroMult() * dmgMult(withBuffs)
}
function critChance() {
  return Math.min(1, BASE_CRIT + relicValue('eye') + (buffActive('lucky') ? luckyBonus() : 0))
}
function critMult() {
  return CRIT_MULT + perkSum('crit')
}
function bossSeconds() {
  return (BASE_BOSS_SECONDS + relicValue('glass') + (chalDone('giants') ? 5 : 0)) * (chalOn('hasty') ? 0.5 : 1)
}
function offlineHours() {
  return BASE_OFFLINE_HOURS + DREAM_HOURS * rl('dream') + conLv('pyxis')
}
// "4h", "4.5h" or "4h 30m" style text for the offline limit
function hoursText(h) {
  const whole = Math.floor(h)
  const mins = Math.round((h - whole) * 60)
  return mins ? whole + 'h ' + mins + 'm' : whole + 'h'
}

// How much power one more level adds (used by BEST BUY and the hero list)
function gainOf(h) {
  const lv = st.lv[h.id]
  if (h.tap) return (tapBase(lv + 1) - tapBase(lv)) * (1 + relicValue('edge')) * dmgMult(false) * TAP_RATE
  return (heroDps(h, lv + 1) - heroDps(h, lv)) * heroMult() * dmgMult(false)
}

// The upgrade with the most power per gold. Prefers something you can afford now.
function bestBuy() {
  let best = null
  let bestAffordable = null
  for (const h of HEROES) {
    const c = cost(h, st.lv[h.id])
    const value = gainOf(h) / c
    const item = { h, c, value }
    if (!best || value > best.value) best = item
    if (c <= st.gold && (!bestAffordable || value > bestAffordable.value)) bestAffordable = item
  }
  return bestAffordable || best
}

// ---------- achievements ----------
// Goals you reach once. Each gives a small permanent bonus and survives rebirth.
const maxHeroLv = () => Math.max(...HEROES.map((h) => st.lv[h.id]))
const ACHIEVEMENTS = [
  { id: 'k100', name: 'Monster Hunter', desc: 'kill 100 monsters', stat: () => st.stats.kills, goal: 100, kind: 'dmg', x: 0.02 },
  { id: 'k1000', name: 'Slayer', desc: 'kill 1,000 monsters', stat: () => st.stats.kills, goal: 1000, kind: 'dmg', x: 0.03 },
  { id: 'k10000', name: 'Exterminator', desc: 'kill 10,000 monsters', stat: () => st.stats.kills, goal: 10000, kind: 'dmg', x: 0.05 },
  { id: 'b5', name: 'Boss Breaker', desc: 'beat 5 bosses', stat: () => st.stats.bosses, goal: 5, kind: 'gold', x: 0.03 },
  { id: 'b25', name: 'Giant Killer', desc: 'beat 25 bosses', stat: () => st.stats.bosses, goal: 25, kind: 'gold', x: 0.05 },
  { id: 'b100', name: 'Legend', desc: 'beat 100 bosses', stat: () => st.stats.bosses, goal: 100, kind: 'dmg', x: 0.05 },
  { id: 'c1', name: 'Treasure Hunter', desc: 'open a loot chest', stat: () => st.stats.chests, goal: 1, kind: 'gold', x: 0.02 },
  { id: 'c10', name: 'Pirate', desc: 'open 10 loot chests', stat: () => st.stats.chests, goal: 10, kind: 'gold', x: 0.04 },
  { id: 's10', name: 'Explorer', desc: 'reach stage 10', stat: () => st.best, goal: 10, kind: 'dmg', x: 0.02 },
  { id: 's25', name: 'Adventurer', desc: 'reach stage 25', stat: () => st.best, goal: 25, kind: 'dmg', x: 0.03 },
  { id: 's50', name: 'Hero', desc: 'reach stage 50', stat: () => st.best, goal: 50, kind: 'dmg', x: 0.05 },
  { id: 's75', name: 'Champion', desc: 'reach stage 75', stat: () => st.best, goal: 75, kind: 'dmg', x: 0.08 },
  { id: 'r1', name: 'Born Again', desc: 'rebirth once', stat: () => st.stats.rebirths, goal: 1, kind: 'gold', x: 0.03 },
  { id: 'r5', name: 'Phoenix', desc: 'rebirth 5 times', stat: () => st.stats.rebirths, goal: 5, kind: 'dmg', x: 0.05 },
  { id: 't1000', name: 'Tapper', desc: 'tap 1,000 times', stat: () => st.stats.taps, goal: 1000, kind: 'dmg', x: 0.02 },
  { id: 't10000', name: 'Iron Finger', desc: 'tap 10,000 times', stat: () => st.stats.taps, goal: 10000, kind: 'dmg', x: 0.04 },
  { id: 'u50', name: 'Skilled', desc: 'use skills 50 times', stat: () => st.stats.skillsUsed, goal: 50, kind: 'dmg', x: 0.03 },
  { id: 'th5', name: 'Thief Catcher', desc: 'catch 5 gold thieves', stat: () => st.stats.thieves, goal: 5, kind: 'gold', x: 0.04 },
  { id: 'h100', name: 'Master', desc: 'a hero at level 100', stat: maxHeroLv, goal: 100, kind: 'dmg', x: 0.05 },
  { id: 'w10', name: 'Walker', desc: 'earn 10 dust from steps', stat: () => st.stats.stepDust, goal: 10, kind: 'gold', x: 0.03 },
  { id: 'd7', name: 'Dedicated', desc: 'finish 7 daily goals', stat: () => st.stats.dailies, goal: 7, kind: 'dmg', x: 0.05 }
]

function achBonus(kind) {
  let sum = 0
  for (const a of ACHIEVEMENTS) if (st.ach[a.id] && a.kind === kind) sum += a.x
  return 1 + sum
}

function achCount() {
  return ACHIEVEMENTS.filter((a) => st.ach[a.id]).length
}

function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (!st.ach[a.id] && a.stat() >= a.goal) {
      st.ach[a.id] = true
      toast('ACHIEVEMENT: ' + a.name.toUpperCase(), GOLD)
      save()
    }
  }
}

// ---------- daily goal ----------
// One small task per day (it changes at midnight). Finishing it gives Stardust.
const DAILY_KINDS = [
  { id: 'kills', text: (n) => 'Kill ' + n + ' monsters', target: 300, stat: () => st.stats.kills },
  { id: 'bosses', text: (n) => 'Beat ' + n + ' bosses', target: 5, stat: () => st.stats.bosses },
  { id: 'skills', text: (n) => 'Use skills ' + n + ' times', target: 8, stat: () => st.stats.skillsUsed },
  { id: 'taps', text: (n) => 'Tap ' + n + ' times', target: 800, stat: () => st.stats.taps },
  { id: 'chests', text: (n) => 'Open ' + n + ' loot chests', target: 2, stat: () => st.stats.chests }
]

function dayKey(t) {
  const d = new Date(t)
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function dailyKind() {
  return DAILY_KINDS.find((k) => k.id === st.daily.kind) || DAILY_KINDS[0]
}

function dailyReward() {
  return 3 + Math.floor(st.best / 10)
}

function dailyProgress() {
  return Math.min(st.daily.target, dailyKind().stat() - st.daily.start)
}

function updateDaily() {
  const day = dayKey(now())
  if (!st.daily || st.daily.day !== day) {
    const k = DAILY_KINDS[day % DAILY_KINDS.length]
    st.daily = { day, kind: k.id, start: k.stat(), target: k.target, done: false }
  }
  if (!st.daily.done && dailyProgress() >= st.daily.target) {
    st.daily.done = true
    const r = dailyReward()
    st.dust += r
    st.stats.dustEarned += r
    st.stats.dailies++
    toast('DAILY GOAL DONE! +' + r + ' STARDUST', PURPLE)
    save()
  }
}

// ---------- steps -> Stardust ----------
// Every 2,000 steps you walk today (read from the watch) gives 1 Stardust.
const STEPS_PER_DUST = 2000
let stepSensor = null

function readSteps() {
  try {
    if (!stepSensor) stepSensor = new Step()
    const n = stepSensor.getCurrent()
    return typeof n === 'number' ? n : -1
  } catch (e) {
    return -1 // no step counter (or no permission): the feature just stays quiet
  }
}

function updateSteps() {
  const steps = readSteps()
  st.stepsToday = steps
  if (steps < 0) return
  const day = dayKey(now())
  if (st.steps.day !== day) st.steps = { day, claimed: 0 }
  const earned = Math.floor(steps / STEPS_PER_DUST)
  if (earned > st.steps.claimed) {
    const n = earned - st.steps.claimed
    st.steps.claimed = earned
    st.dust += n
    st.stats.dustEarned += n
    st.stats.stepDust += n
    toast('+' + n + ' STARDUST FROM STEPS', 0x4de0ff)
    save()
  }
}

// ---------- hero stars ----------
// Every rebirth gives a star to one of the heroes you used that run: +50% forever.
const STAR_BONUS = 0.5
function starMult(id) {
  return 1 + STAR_BONUS * (st.stars[id] || 0)
}

function giveStar() {
  const used = HEROES.filter((h) => st.lv[h.id] > 0)
  const pool = used.length ? used : HEROES
  const h = pool[Math.floor(Math.random() * pool.length)]
  st.stars[h.id] = (st.stars[h.id] || 0) + 1
  return h
}

// ---------- special monsters ----------
// From stage 5 a normal monster is sometimes special:
//   GOLD THIEF (runs away after 5 s, lots of gold)  ARMORED (heroes do half damage)
//   HEALING (heals itself if you stop tapping)
const THIEF_CHANCE = 0.04
const ARMORED_CHANCE = 0.08
const HEALER_CHANCE = 0.06
const THIEF_SECONDS = 5
const THIEF_GOLD = 6
const HEAL_PER_SECOND = 0.05 // healers regain 5% of their HP per second...
const HEAL_AFTER = 1.5 // ...once you have not tapped for this many seconds

function rollSpecial() {
  if (st.boss || st.chest || st.stage < 5) return null
  const r = Math.random()
  const thief = THIEF_CHANCE * (eventIs('thieves') ? 3 : 1)
  if (r < thief) return 'thief'
  if (st.stage >= 8 && r < thief + ARMORED_CHANCE) return 'armored'
  if (st.stage >= 12 && r < thief + ARMORED_CHANCE + HEALER_CHANCE) return 'healer'
  return null
}

// ---------- boss mechanics ----------
// From stage 10 bosses raise a shield every 9 s for 2 s (it blocks 90% of damage).
// From stage 15 a boss below half HP gets ENRAGED: its timer runs 1.5x faster.
const SHIELD_EVERY = 9
const SHIELD_SECONDS = 2
const SHIELD_BLOCK = 0.9

function updateBoss(dt) {
  if (st.stage >= 10) {
    if (st.shieldOn > 0) st.shieldOn = Math.max(0, st.shieldOn - dt)
    else {
      st.shieldT -= dt
      if (st.shieldT <= 0) {
        st.shieldOn = SHIELD_SECONDS // shown as a badge next to the monster
        st.shieldT = SHIELD_EVERY
      }
    }
  }
  if (st.stage >= 15 && !st.enraged && st.hp < st.maxHp / 2) st.enraged = true // badge: "!"
  st.bossLeft -= dt * (st.enraged ? 1.5 : 1)
}

// ---------- reset ----------
function resetTap() {
  const t = now()
  if (!st.resetConfirm || st.resetConfirm < t) {
    st.resetConfirm = t + 3000 // a second tap within 3 s erases everything
    return
  }
  // A full wipe: nothing from the old game is kept (stats, goals, steps, daily).
  st = freshState()
  st.tutorial = 0
  initRuntime()
  spawn()
  save()
  closeMenu()
  toast('NEW GAME', WHITE)
}

// ---------- hit flash and death poof ----------
const WHITE_PAL = {} // every pixel letter drawn white: used for a moment on a crit
'abcdefghijklmnopqrstuvwxyz'.split('').forEach((ch) => (WHITE_PAL[ch] = 0xffffff))
const POOF_PARTS = 8
const POOF_SECONDS = 0.45

function startPoof() {
  st.poof = POOF_SECONDS
  st.poofColor = st.pal ? st.pal[Object.keys(st.pal)[0]] : WHITE
  st.poofDirs = []
  for (let i = 0; i < POOF_PARTS; i++) {
    const a = (i / POOF_PARTS) * Math.PI * 2 + Math.random() * 0.5
    st.poofDirs.push([Math.cos(a), Math.sin(a)])
  }
}

// ---------- effect badges ----------
// Small round icons left of the monster instead of messages:
//   shield = armored monster (steel) or a boss shield that is up (pale blue)
//   +      = healing monster       number = seconds before the gold thief escapes
//   !      = enraged boss
const BADGE_X = 50
const BADGE_Y = 104
const BADGE_GAP = 40

function activeBadges() {
  const list = []
  if (st.special === 'armored') list.push({ color: 0x9cc4ea, shield: true })
  if (st.special === 'healer') list.push({ color: 0x4dd06a, plus: true })
  if (st.special === 'thief') list.push({ color: GOLD, text: String(Math.max(0, Math.ceil(st.fleeLeft))) })
  if (st.boss && st.shieldOn > 0) list.push({ color: 0xbfe0ff, shield: true })
  if (st.boss && st.enraged) list.push({ color: RED, text: '!' })
  return list.slice(0, ui.badges.length)
}

function updateBadges() {
  const list = activeBadges()
  ui.badges.forEach((b, i) => {
    const d = list[i]
    setVisible(b.ring, !!d)
    setVisible(b.bg, !!d)
    setVisible(b.shieldTop, !!(d && d.shield))
    setVisible(b.shieldBottom, !!(d && d.shield))
    setVisible(b.plusH, !!(d && d.plus))
    setVisible(b.plusV, !!(d && d.plus))
    setVisible(b.label, !!(d && d.text))
    if (!d) return
    const x = BADGE_X
    const y = BADGE_Y + i * BADGE_GAP
    setCircle(b.ring, x, y, 17, d.color)
    if (d.shield) {
      setBox(b.shieldTop, { x: x - 7, y: y - 8, w: 14, h: 9 }, d.color, 3)
      setCircle(b.shieldBottom, x, y + 1, 7, d.color)
    } else if (d.plus) {
      // a "+" made of two bars crossing exactly at the centre (a text "+" sits off-centre)
      setBox(b.plusH, { x: x - 8, y: y - 2, w: 16, h: 4 }, d.color, 2)
      setBox(b.plusV, { x: x - 2, y: y - 8, w: 4, h: 16 }, d.color, 2)
    } else {
      setText(b.label, d.text)
      setColor(b.label, d.color)
    }
  })
}

function updatePoof() {
  const on = st.poof > 0
  const p = on ? 1 - st.poof / POOF_SECONDS : 0 // 0 -> 1 as it spreads
  ui.poof.forEach((o, i) => {
    setVisible(o, on)
    if (!on) return
    const d = st.poofDirs[i]
    setCircle(o, Math.round(CX + d[0] * 70 * p), Math.round(L.monY + 80 + d[1] * 55 * p), Math.max(1, Math.round(7 * (1 - p))), st.poofColor)
  })
}

// things that are not saved, set up after loading or resetting
function initRuntime() {
  st.toast = null
  st.welcome = null
  st.paused = false
  st.shake = 0
  st.flash = 0
  st.poof = 0
  st.lastHitAt = 0
}

// =====================================================================
// Bigger features: weekly event, shooting star, combo, bestiary, gear,
// pet, expeditions, hero element pairs, ascension, challenges, boss rush.
// =====================================================================

// ---------- weekly event ----------
// One bonus per week, the same for everyone, changing every Monday.
const EVENTS = [
  { id: 'chests', name: 'Treasure Week', text: '3x more loot chests' },
  { id: 'thieves', name: 'Thief Week', text: '3x more gold thieves' },
  { id: 'gold', name: 'Golden Week', text: '+50% gold all week' },
  { id: 'stars', name: 'Star Week', text: '2x more shooting stars' },
  { id: 'bosses', name: 'Boss Week', text: 'bosses drop 2x gold' }
]
function weekEvent() {
  const days = Math.floor(now() / 86400000) + 3 // +3: weeks start on Monday
  return EVENTS[Math.floor(days / 7) % EVENTS.length]
}
const eventIs = (id) => weekEvent().id === id

// ---------- shooting star ----------
// Every few minutes a star flies across the sky. Tap it before it is gone.
const STAR_MIN = 150 // seconds between stars (at least)
const STAR_MAX = 300 // (at most)
const STAR_LIFE = 6 // seconds it stays
const STAR_TAP_RADIUS = 34
const FRENZY_MULT = 5 // one reward: x5 damage...
const FRENZY_SECONDS = 15 // ...for 15 s

function scheduleStar() {
  st.starIn = rnd(STAR_MIN, STAR_MAX) * (eventIs('stars') ? 0.5 : 1)
}

function updateStar(dt) {
  if (st.star) {
    st.star.t -= dt
    st.star.x += st.star.vx * dt
    st.star.y += st.star.vy * dt
    if (st.star.t <= 0) {
      st.star = null
      scheduleStar()
    }
    return
  }
  if (st.starIn === undefined) scheduleStar()
  st.starIn -= dt
  if (st.starIn <= 0 && !st.rush.active) {
    const fromLeft = Math.random() < 0.5
    st.star = { x: fromLeft ? 75 : W - 75, y: rnd(105, 165), vx: (fromLeft ? 1 : -1) * rnd(25, 40), vy: rnd(-6, 6), t: STAR_LIFE }
  }
}

function frenzyOn() {
  return (st.frenzyUntil || 0) > now()
}

function catchStar() {
  st.star = null
  scheduleStar()
  st.stats.starsCaught++
  const r = Math.random()
  if (r < 0.4) {
    const g = Math.floor(goldFor(st.stage, false) * goldMult(true) * 25)
    st.gold += g
    st.stats.goldEarned += g
    toast('STAR: +' + fmt(g) + ' GOLD', GOLD)
  } else if (r < 0.75) {
    st.frenzyUntil = now() + FRENZY_SECONDS * 1000
    toast('STAR: x' + FRENZY_MULT + ' DAMAGE!', GOLD)
  } else {
    const t = now()
    for (const s of SKILLS) st.skills[s.id].readyAt = Math.min(st.skills[s.id].readyAt, t)
    toast('STAR: SKILLS READY!', GOLD)
  }
}

// ---------- combo ----------
// Tap again within 1 s to keep a combo going: +1% tap damage per combo tap, up to +50%.
const COMBO_WINDOW = 1
const COMBO_MAX = 50
const COMBO_STEP = 0.01

function comboMult() {
  return 1 + COMBO_STEP * Math.min(COMBO_MAX, st.combo || 0)
}

function bumpCombo() {
  const t = now()
  st.combo = t - (st.comboAt || 0) <= COMBO_WINDOW * 1000 ? Math.min(COMBO_MAX, (st.combo || 0) + 1) : 1
  st.comboAt = t
}

function updateCombo() {
  if (st.combo && now() - st.comboAt > COMBO_WINDOW * 1000) st.combo = 0
}

// ---------- bestiary ----------
// Kill 100 of a monster (25 of a boss, 10 chests or thieves) to complete it: +1% damage each.
const BESTIARY_BONUS = 0.01

function bestiaryGoal(id) {
  const e = ENEMIES[id]
  return e.boss ? 25 : id === 'chest' || id === 'thief' ? 10 : 100
}

function bestiaryDone() {
  return Object.keys(ENEMIES).filter((id) => (st.bestiary[id] || 0) >= bestiaryGoal(id)).length
}

function bestiaryMult() {
  return 1 + BESTIARY_BONUS * bestiaryDone()
}

function countKill(id) {
  const before = st.bestiary[id] || 0
  st.bestiary[id] = before + 1
  if (before < bestiaryGoal(id) && before + 1 >= bestiaryGoal(id)) toast('BESTIARY: ' + ENEMIES[id].name + ' DONE!', 0xb07a3a)
}

// ---------- equipment ----------
// Bosses sometimes drop gear for one of three slots. A better piece is equipped
// automatically; anything else (and what it replaces) turns into Stardust.
const GEAR_SLOTS = [
  { id: 'weapon', name: 'Weapon', stat: 'tap damage' },
  { id: 'charm', name: 'Charm', stat: 'hero damage' },
  { id: 'banner', name: 'Banner', stat: 'gold' }
]
const RARITIES = [
  { name: 'COMMON', base: 0.05, weight: 60, color: 0xb4b2a9 },
  { name: 'RARE', base: 0.1, weight: 28, color: 0x4db8ff },
  { name: 'EPIC', base: 0.2, weight: 10, color: 0xc77dff },
  { name: 'LEGENDARY', base: 0.4, weight: 2, color: 0xffd84d }
]
const GEAR_DROP = 0.3 // chance per boss kill

function gearMult(slot) {
  const g = st.gear[slot]
  return 1 + (g ? g.v : 0)
}

function rollGear() {
  const slot = GEAR_SLOTS[Math.floor(Math.random() * GEAR_SLOTS.length)]
  let r = Math.random() * 100
  let k = 0
  for (; k < RARITIES.length - 1; k++) {
    r -= RARITIES[k].weight
    if (r <= 0) break
  }
  // better gear from later stages: +50% every 25 stages of your best
  const v = Math.round(RARITIES[k].base * (1 + Math.floor(st.best / 25) * 0.5) * 100) / 100
  st.stats.gearFound++
  const cur = st.gear[slot.id]
  const label = RARITIES[k].name + ' ' + slot.name.toUpperCase()
  if (!cur || v > cur.v) {
    if (cur) {
      st.dust += cur.r + 1
      st.stats.dustEarned += cur.r + 1
    }
    st.gear[slot.id] = { r: k, v }
    toast(label + ' +' + Math.round(v * 100) + '%!', RARITIES[k].color)
  } else {
    st.dust += k + 1
    st.stats.dustEarned += k + 1
    toast(label + ': +' + (k + 1) + ' DUST', RARITIES[k].color)
  }
}

// ---------- pet ----------
// The companion hits every 2 s and adds +3% damage per level. Bosses and trips give treats.
const PET_DMG = 0.03
const PET_HIT_EVERY = 2

function petMult() {
  return 1 + PET_DMG * st.pet.lv
}

function feedPet() {
  const c = st.pet.lv
  if (st.pet.treats < c) {
    toast('NEED ' + (c - st.pet.treats) + ' MORE TREATS', DIM)
    return
  }
  st.pet.treats -= c
  st.pet.lv++
  toast('PET LEVEL ' + st.pet.lv + '!', 0xff9ab0)
  save()
}

function petHit() {
  const dmg = tapDamage() * (0.2 + 0.05 * st.pet.lv)
  addFloat(fmt(dmg), CX - 95, L.monY + 95, 0xff9ab0)
  st.petHop = 0.2
  hit(dmg)
}

// ---------- expeditions ----------
// Send one hero away for 1, 4 or 8 hours (it does not fight meanwhile) for loot.
const TRIP_HOURS = [1, 4, 8]

function tripAway(id) {
  return !!st.trip && st.trip.hero === id && now() < st.trip.endAt
}

function tripReady() {
  return !!st.trip && now() >= st.trip.endAt
}

function tripReward(hours) {
  return {
    dust: hours * (1 + Math.floor(st.best / 25)),
    treats: hours,
    gold: Math.floor(goldFor(st.stage, false) * goldMult(false) * 40 * hours),
    gearChance: Math.min(0.9, 0.15 * hours)
  }
}

function sendTrip(id) {
  if (st.trip) {
    toast(tripReady() ? 'CLAIM THE LAST TRIP FIRST' : 'A HERO IS ALREADY AWAY', DIM)
    return
  }
  if (!st.lv[id]) return
  st.trip = { hero: id, hours: st.tripHours, endAt: now() + st.tripHours * 3600000 }
  toast(heroById(id).name.toUpperCase() + ' LEFT FOR ' + st.tripHours + 'h', 0x5aa8ff)
  save()
}

function claimTrip() {
  if (!tripReady()) return
  const r = tripReward(st.trip.hours)
  st.dust += r.dust
  st.stats.dustEarned += r.dust
  st.pet.treats += r.treats
  st.gold += r.gold
  st.stats.goldEarned += r.gold
  st.stats.trips++
  toast('TRIP: +' + r.dust + ' DUST, +' + r.treats + ' TREATS', 0x5aa8ff)
  if (Math.random() < r.gearChance) rollGear()
  st.trip = null
  save()
}

// ---------- hero element pairs ----------
// Heroes come in elemental pairs. With both heroes of a pair at level 25+,
// both of them deal +30% damage.
const ELEMENTS = {
  nature: { name: 'Nature', color: 0x4dd06a, heroes: ['archer', 'druid'] },
  fire: { name: 'Fire', color: 0xff7a4a, heroes: ['mage', 'wyvern'] },
  earth: { name: 'Earth', color: 0xc8a070, heroes: ['knight', 'golem'] },
  frost: { name: 'Frost', color: 0x9cc4ea, heroes: ['witch', 'monk'] }
}
const PAIR_LEVEL = 25
const PAIR_BONUS = 0.3

function elementOf(id) {
  for (const k in ELEMENTS) if (ELEMENTS[k].heroes.indexOf(id) >= 0) return k
  return null
}

function pairActive(el) {
  return ELEMENTS[el].heroes.every((id) => st.lv[id] >= PAIR_LEVEL)
}

function pairMult(id) {
  const el = elementOf(id)
  return el && pairActive(el) ? 1 + PAIR_BONUS : 1
}

// ---------- ascension ----------
// The bigger reset. After many rebirths, ASCEND to start completely over
// (Stardust, relics and hero stars too) for Shards, which buy Constellations:
// strong permanent upgrades. Gear, pet, bestiary, goals and stats are kept.
const ASC_MIN_BEST = 60
const ASC_MIN_REBIRTHS = 8
const CONSTELLATIONS = [
  { id: 'orion', name: 'Orion', desc: '+50% damage', max: 20 },
  { id: 'pleiades', name: 'Pleiades', desc: '+50% gold', max: 20 },
  { id: 'draco', name: 'Draco', desc: '+25% rebirth Stardust', max: 10 },
  { id: 'lyra', name: 'Lyra', desc: '+1 level to every skill', max: 3 },
  { id: 'vela', name: 'Vela', desc: 'runs start 5 stages later', max: 5 },
  { id: 'pyxis', name: 'Pyxis', desc: '+1h offline time', max: 4 }
]

function conLv(id) {
  return st.asc.levels[id] || 0
}

function ascShardsGain() {
  const dust = st.stats.dustEarned - (st.asc.dustAt || 0) // Stardust earned since the last ascension
  return Math.floor(Math.sqrt(Math.max(0, dust) / 25))
}

function canAscend() {
  return st.best >= ASC_MIN_BEST && st.stats.rebirths >= ASC_MIN_REBIRTHS && ascShardsGain() > 0
}

function ascendTap() {
  if (!canAscend()) {
    toast('NEED STAGE ' + ASC_MIN_BEST + ' AND ' + ASC_MIN_REBIRTHS + ' REBIRTHS', DIM)
    return
  }
  if (st.chal.active || st.rush.active) return
  const t = now()
  if (!st.ascConfirm || st.ascConfirm < t) {
    st.ascConfirm = t + 3000 // a second tap within 3 s confirms
    return
  }
  st.ascConfirm = 0
  const gain = ascShardsGain()
  st.asc.shards += gain
  st.asc.dustAt = st.stats.dustEarned
  st.stats.ascensions++
  st.dust = 0
  for (const r of RELICS) st.relics[r.id] = 0
  for (const h of HEROES) st.stars[h.id] = 0
  freshRun(st)
  for (const k of SKILLS) st.skills[k.id] = { readyAt: 0, activeUntil: 0 }
  spawn()
  save()
  closeMenu()
  toast('ASCENDED! +' + gain + ' SHARDS', 0x9cc4ea)
}

function buyConstellation(i) {
  const c = CONSTELLATIONS[i]
  const lv = conLv(c.id)
  if (lv >= c.max) return
  const cost = lv + 1
  if (st.asc.shards < cost) {
    toast('NEED ' + (cost - st.asc.shards) + ' MORE SHARDS', DIM)
    return
  }
  st.asc.shards -= cost
  st.asc.levels[c.id] = lv + 1
  save()
}

// ---------- challenges ----------
// Optional runs with a twist. Your normal run is put aside and comes back
// afterwards. Reach the goal stage once for a permanent reward.
const CHALLENGES = [
  { id: 'bare', name: 'Bare Hands', desc: 'heroes do nothing', goal: 15, reward: 'taps x1.5 forever' },
  { id: 'giants', name: 'Giants', desc: 'monsters have 3x HP', goal: 20, reward: '+5s boss timer' },
  { id: 'poor', name: 'Poverty', desc: 'only 30% of the gold', goal: 20, reward: '+30% gold forever' },
  { id: 'hasty', name: 'Hasty', desc: 'boss timers are halved', goal: 25, reward: 'heroes x1.3 forever' }
]
const RUN_KEYS = ['gold', 'stage', 'kills', 'runBest', 'lv', 'skills']

function chalOn(id) {
  return st.chal.active === id
}

function chalDone(id) {
  return !!st.chal.done[id]
}

function snapshotRun() {
  const s = {}
  for (const k of RUN_KEYS) s[k] = JSON.parse(JSON.stringify(st[k]))
  return s
}

function restoreRun(snap) {
  Object.assign(st, JSON.parse(JSON.stringify(snap)))
}

function challengeTap(i) {
  const c = CHALLENGES[i]
  if (st.chal.active) {
    if (st.chal.active === c.id) endChallenge(false)
    else toast('FINISH YOUR CHALLENGE FIRST', DIM)
    return
  }
  if (st.rush.active) return
  const t = now()
  if (!st.chalConfirm || st.chalConfirm.id !== c.id || st.chalConfirm.until < t) {
    st.chalConfirm = { id: c.id, until: t + 3000 }
    return
  }
  st.chalConfirm = null
  st.chal.saved = snapshotRun()
  st.chal.active = c.id
  freshRun(st)
  st.stage = 1
  st.runBest = 1
  for (const k of SKILLS) st.skills[k.id] = { readyAt: 0, activeUntil: 0 }
  spawn()
  save()
  closeMenu()
  toast('CHALLENGE: ' + c.name.toUpperCase() + ', REACH ' + c.goal, GREEN)
}

function endChallenge(won) {
  const c = CHALLENGES.find((k) => k.id === st.chal.active)
  st.chal.active = null
  restoreRun(st.chal.saved)
  st.chal.saved = null
  if (won) {
    if (!st.chal.done[c.id]) st.stats.challenges++
    st.chal.done[c.id] = true
    toast('CHALLENGE DONE: ' + c.reward.toUpperCase(), GREEN)
  } else toast('CHALLENGE GIVEN UP', DIM)
  spawn()
  save()
}

function checkChallenge() {
  const c = CHALLENGES.find((k) => k.id === st.chal.active)
  if (c && st.stage >= c.goal) endChallenge(true)
}

// ---------- boss rush ----------
// 60 seconds, bosses only, each one a bit tougher. Once a day it pays Stardust.
const RUSH_SECONDS = 60

function rushStage() {
  return Math.max(BOSS_EVERY, Math.floor(Math.max(st.best - 10, BOSS_EVERY) / BOSS_EVERY) * BOSS_EVERY)
}

function rushPaysToday() {
  return st.rush.day !== dayKey(now())
}

function startRush() {
  if (st.chal.active) {
    toast('FINISH YOUR CHALLENGE FIRST', DIM)
    return
  }
  if (st.rush.active) return
  st.rush.saved = snapshotRun()
  st.rush.active = { count: 0, left: RUSH_SECONDS, stage: rushStage() }
  st.stage = st.rush.active.stage
  spawn()
  closeMenu()
  toast('BOSS RUSH! ' + RUSH_SECONDS + ' SECONDS', RED)
}

function endRush() {
  const n = st.rush.active.count
  const reward = rushPaysToday() ? n * 2 : 0
  if (reward) {
    st.dust += reward
    st.stats.dustEarned += reward
    st.rush.day = dayKey(now())
  }
  if (n > st.rush.best) st.rush.best = n
  restoreRun(st.rush.saved)
  st.rush.saved = null
  st.rush.active = null
  spawn()
  toast('RUSH OVER: ' + n + ' BOSSES' + (reward ? ', +' + reward + ' DUST' : ''), GOLD)
  save()
}

// ---------- offline ----------
// gold the heroes earn in `seconds` while you are away (they farm, but don't advance)
function offlineGold(seconds) {
  const dps = partyDps(false)
  if (dps <= 0 || seconds <= 0) return 0
  const capped = Math.min(seconds, offlineHours() * 3600)
  const farmStage = st.stage % BOSS_EVERY === 0 ? Math.max(1, st.stage - 1) : st.stage
  const killsPerSecond = dps / monsterHp(farmStage)
  const gold = killsPerSecond * capped * goldFor(farmStage, false) * goldMult(false) * (1 + relicValue('dream'))
  return Math.floor(gold)
}

function awayFor(seconds) {
  const g = offlineGold(seconds)
  if (g > 0) st.gold += g
  if (seconds >= 60 && g > 0) {
    st.welcome = { away: duration(seconds), gold: g, capped: seconds > offlineHours() * 3600 }
  }
}

// ---------- battle ----------
function spawn() {
  st.boss = st.stage % BOSS_EVERY === 0
  st.maxHp = st.boss ? bossHp(st.stage) : monsterHp(st.stage)
  if (st.rush.active) st.maxHp *= 1 + 0.15 * st.rush.active.count // each rush boss is tougher
  if (chalOn('giants')) st.maxHp *= 3
  st.hp = st.maxHp
  st.bossLeft = bossSeconds()
  const world = worldFor(st.stage)
  // now and then a loot chest shows up instead: little HP, lots of gold
  st.chest = !st.boss && st.stage >= 3 && Math.random() < CHEST_CHANCE * (eventIs('chests') ? 3 : 1)
  if (st.chest) {
    st.maxHp = Math.ceil(st.maxHp * 0.5)
    st.hp = st.maxHp
  }
  // sometimes a special monster (see rollSpecial), and bosses get their shield timer
  st.special = rollSpecial()
  if (st.special === 'thief') {
    st.maxHp = Math.ceil(st.maxHp * 0.7)
    st.hp = st.maxHp
    st.fleeLeft = THIEF_SECONDS
  }
  st.shieldT = 6
  st.shieldOn = 0
  st.enraged = false
  const id = st.boss ? world.boss : st.chest ? 'chest' : st.special === 'thief' ? 'thief' : world.enemies[(st.stage * 3 + st.kills) % world.enemies.length]
  const e = ENEMIES[id]
  st.monsterId = id
  st.sprite = e.rows
  st.monsterName = st.special === 'armored' ? 'ARMORED ' + e.name : st.special === 'healer' ? 'HEALING ' + e.name : e.name
  // the second colour set appears the next time round all the worlds
  const lap = Math.floor((st.stage - 1) / (BOSS_EVERY * WORLDS.length))
  st.pal = e.pals[lap % e.pals.length]
  st.monsterDirty = true
  if (st.world !== world) {
    if (st.world) toast('~ ' + world.name + ' ~', world.light ? world.light.color : 0x9dff7a)
    st.world = world
  }
}

function hit(amount) {
  if (st.boss && st.shieldOn > 0) amount *= 1 - SHIELD_BLOCK // the shield blocks most of it
  st.hp -= amount
  if (st.hp <= 0) kill()
}

function kill() {
  const special = st.chest ? CHEST_GOLD : st.special === 'thief' ? THIEF_GOLD : 1
  const g = Math.floor(goldFor(st.stage, st.boss) * goldMult(true) * special * (st.boss && eventIs('bosses') ? 2 : 1))
  st.gold += g
  st.stats.kills++
  st.stats.goldEarned += g
  addFloat('+' + fmt(g), CX + 40, L.monY + 10, GOLD)
  startPoof()
  countKill(st.monsterId)
  if (st.chest) {
    st.stats.chests++
    toast('LOOT CHEST! +' + fmt(g), GOLD)
  }
  if (st.special === 'thief') {
    st.stats.thieves++
    toast('THIEF CAUGHT! +' + fmt(g), GOLD)
  }
  if (st.boss) {
    st.pet.treats++ // every boss leaves a treat for the pet
    if (Math.random() < GEAR_DROP) rollGear()
  }
  if (st.rush.active) {
    // boss rush: count it and bring the next (tougher) boss
    st.rush.active.count++
    st.stats.bosses++
    spawn()
    return
  }
  // On your furthest stage you move forward as usual. On an earlier stage you
  // are farming: you stay there (use the arrows to move), so you can farm gold.
  const farming = isFarming()
  if (st.boss) {
    st.stats.bosses++
    st.kills = 0
    if (!farming || st.auto) st.stage++ // auto-advance also moves on from a farmed boss
    toast('BOSS DEFEATED!', GOLD)
  } else {
    st.kills++
    if (st.kills >= KILLS_PER_STAGE) {
      st.kills = 0
      // (no message for a new stage: the stage badge at the top already shows it)
      if (!farming) st.stage++
      else if (st.auto) st.stage++ // auto-advance: after 10 kills on a farmed stage, try the next one
    }
  }
  if (st.stage > st.runBest) st.runBest = st.stage
  if (st.stage > st.best) {
    st.best = st.stage
    if (st.best === REBIRTH_FROM) toast('REBIRTH UNLOCKED!', PURPLE)
  }
  if (st.chal.active) {
    checkChallenge()
    if (!st.chal.active) return // finished: the normal run is back
  }
  spawn()
}

// Farming = playing a stage below the furthest one you have reached.
function isFarming() {
  return st.stage < st.runBest
}

function bossEscaped() {
  if (isFarming()) {
    // a boss you already beat: it just comes back for another try
    toast('BOSS ESCAPED!', RED)
  } else {
    // your first try at this boss failed: drop back one stage to farm, press > to retry
    st.stage = Math.max(1, st.stage - 1)
    toast('BOSS ESCAPED! FARM, THEN >', RED)
  }
  st.kills = 0
  spawn()
}

// The arrows in the top corners: any stage from 1 up to the furthest reached.
function goStage(delta) {
  if (st.rush.active) return // no stage changes during a boss rush
  const target = Math.max(1, Math.min(st.runBest, st.stage + delta))
  if (target === st.stage) return
  st.stage = target
  st.kills = 0
  spawn()
}

function attack() {
  const crit = Math.random() < critChance()
  bumpCombo()
  const dmg = tapDamage() * comboMult() * (crit ? critMult() : 1)
  st.stats.taps++
  st.lastHitAt = now()
  addFloat((crit ? 'CRIT ' : '') + fmt(dmg), CX - 60 + Math.random() * 120, L.monY + 20 + Math.random() * 60, crit ? RED : WHITE)
  st.shake = 2
  if (crit) st.flash = 2 // the monster flashes white for a moment
  hit(dmg)
}

// ---------- buying ----------
function buyHero(i, n) {
  const h = HEROES[i]
  const c = costN(h, st.lv[h.id], n)
  if (st.gold < c) {
    toast('NEED ' + fmt(c - st.gold) + ' MORE', DIM)
    return
  }
  const before = st.lv[h.id]
  st.gold -= c
  st.lv[h.id] += n
  // celebrate whatever this purchase unlocked. Several things can happen at once
  // (at level 50: a perk, the x2 and a skill level), so they share one message.
  const name = h.name.split(' ')[0].toUpperCase()
  const perk = h.perks.find((p) => p.lv > before && p.lv <= st.lv[h.id])
  const doubled = Math.floor(st.lv[h.id] / 25) > Math.floor(before / 25)
  const skill = SKILLS.find((k) => k.hero === h.id)
  const skillUp = skill && before >= skill.heroLv && skillLevel(skill.id) > Math.floor(before / SKILL_LEVEL_EVERY) + 1
  if (perk && perk.kind === 'skill') {
    const s = SKILLS.find((k) => k.id === perk.skill)
    toast(s.name.toUpperCase() + ' SKILL UNLOCKED!', s.color)
  } else if (perk || doubled || skillUp) {
    const parts = []
    if (perk) parts.push('PERK')
    if (doubled) parts.push('x2')
    if (skillUp) parts.push(skill.short + ' LV ' + skillLevel(skill.id))
    toast(name + ' ' + parts.join(' + ') + '!', skillUp ? skill.color : GOLD)
  }
  save()
}

function buyBest() {
  const b = bestBuy()
  buyHero(HEROES.indexOf(b.h), 1)
}

function buyRelic(i) {
  const r = RELICS[i]
  const lv = st.relics[r.id]
  if (lv >= r.max) return
  const c = relicCost(lv)
  if (st.dust < c) {
    toast('NEED ' + (c - st.dust) + ' MORE STARDUST', DIM)
    return
  }
  st.dust -= c
  st.relics[r.id]++
  save()
}

// ---------- skills ----------
function skillState(s) {
  const k = st.skills[s.id]
  const t = now()
  if (st.lv[s.hero] < s.heroLv) return 'locked'
  if (k.activeUntil > t) return 'active'
  if (k.readyAt > t) return 'cooldown'
  return 'ready'
}

function useSkill(i) {
  const s = SKILLS[i]
  const state = skillState(s)
  if (state === 'locked') {
    toast(heroById(s.hero).name.toUpperCase() + ' LV ' + s.heroLv + ' UNLOCKS ' + s.short, DIM)
    return
  }
  if (state !== 'ready') return
  const t = now()
  const k = st.skills[s.id]
  k.activeUntil = t + s.duration * 1000
  k.readyAt = t + cooldownOf(s) * 1000
  st.stats.skillsUsed++
  if (s.id === 'smite') {
    const dmg = Math.max(tapDamage() * 50, partyDps(true) * 30) * smiteMult()
    addFloat('SMITE ' + fmt(dmg), CX - 40, L.monY + 40, BLUE)
    st.shake = 4
    hit(dmg)
  } else if (s.id === 'wind') {
    // every other skill is ready again right away
    for (const o of SKILLS) if (o.id !== 'wind') st.skills[o.id].readyAt = t
    toast('ALL SKILLS READY!', s.color)
  }
  // the other skills need no message: the info line lists every active skill side by side
  save()
}

// ---------- rebirth ----------
function rebirthGain() {
  if (st.runBest < REBIRTH_FROM) return 0
  // stage 20 -> 3, stage 30 -> 15, stage 40 -> 33, stage 50 -> 57 Stardust
  return Math.max(1, Math.floor(Math.pow((st.runBest - 15) / 2.5, 1.7) * (1 + 0.25 * conLv('draco'))))
}

function rebirthTap() {
  if (st.chal.active || st.rush.active) {
    toast('NOT DURING A CHALLENGE OR RUSH', DIM)
    return
  }
  const gain = rebirthGain()
  if (gain <= 0) {
    toast('REACH STAGE ' + REBIRTH_FROM + ' FIRST', DIM)
    return
  }
  const t = now()
  if (!st.confirmUntil || st.confirmUntil < t) {
    st.confirmUntil = t + 3000 // a second tap within 3 s confirms
    return
  }
  st.confirmUntil = 0
  st.dust += gain
  st.stats.dustEarned += gain
  st.stats.rebirths++
  const starred = giveStar() // picked before the reset, from the heroes used this run
  freshRun(st)
  for (const k of SKILLS) st.skills[k.id] = { readyAt: 0, activeUntil: 0 }
  spawn()
  save()
  closeMenu()
  toast('REBORN! +' + gain + ' DUST, ' + starred.name.toUpperCase() + ' +STAR', PURPLE)
}

// ---------- pause ----------
function setPaused(p) {
  const t = now()
  if (p && !st.paused) {
    pausedAt = t
    save()
  } else if (!p && st.paused) {
    // paused time does not count for skills either
    const d = t - pausedAt
    for (const k in st.skills) {
      if (st.skills[k].readyAt > pausedAt) st.skills[k].readyAt += d
      if (st.skills[k].activeUntil > pausedAt) st.skills[k].activeUntil += d
    }
  }
  st.paused = p
  lastTick = t
}

// ---------- menu ----------
// Two menus: swipe left (or the menu button) for things you DO, swipe up for
// things you CHECK. Some tabs stay hidden until they are useful.
const MENUS = {
  main: ['HEROES', 'SKILLS', 'RELICS', 'REBIRTH', 'GEAR', 'TRAVEL', 'ASCEND', 'MODES'],
  info: ['GOALS', 'BESTIARY', 'STATS', 'GUIDE', 'SETTINGS']
}
const TAB_UNLOCK = {
  TRAVEL: () => st.stats.rebirths >= 1 || !!st.trip,
  MODES: () => st.best >= 25 || !!st.chal.active || !!st.rush.active,
  ASCEND: () => (st.best >= ASC_MIN_BEST && st.stats.rebirths >= ASC_MIN_REBIRTHS) || st.stats.ascensions > 0 || st.asc.shards > 0
}
const DOT_GAP = 22

function menuOf(name) {
  return MENUS.info.indexOf(name) >= 0 ? 'info' : 'main'
}

function tabUnlocked(name) {
  return !TAB_UNLOCK[name] || TAB_UNLOCK[name]()
}

// CATS indexes of the tabs in the open menu, in order
function menuTabs() {
  return MENUS[menu.kind].filter(tabUnlocked).map((n) => CATS.indexOf(n))
}

// x of the dot for the i-th visible tab
function dotX(i) {
  return CX + (i - (menuTabs().length - 1) / 2) * DOT_GAP
}

function openMenu(kind) {
  menu.open = true
  menu.kind = kind || 'main'
  menu.cat = menuTabs()[0] // always start fresh on the first tab, page 1
  menu.page = 0
  transition()
}

function closeMenu() {
  finishAnim()
  menu.open = false
  menu.kind = 'main'
  menu.cat = 0 // the next time it opens on HEROES, page 1
  menu.page = 0
  st.monsterDirty = true
}

function setCat(c) {
  const same = c === menu.cat
  menu.kind = menuOf(CATS[c])
  menu.cat = c
  menu.page = 0
  if (same || !menu.open) return
  transition()
}

// ---------- transitions: a row cascade ----------
// The header, dots and buttons change at once; the active dot pops a little bigger,
// and the 3 rows appear one after another (top to bottom), REVEAL_STEP_MS apart.
// Why not something that slides: the watch repaints everything under a moving
// widget, so a sweep across the screen meant a full repaint every frame (it
// flickered on the real Bip 6). This needs only ~4 small redraws in total.
// The heavy screen redraw waits while the rows come in.
const REVEAL_STEP_MS = 70
const ANIM_STEP_MS = 35
const ANIM_TOTAL_MS = REVEAL_STEP_MS * ROWS_PER_PAGE
let anim = null // { start, shown } while rows are coming in
let animTimer = null

// how many rows of the page are shown right now
function rowsShown() {
  return anim ? anim.shown : ROWS_PER_PAGE
}

function transition() {
  finishAnim()
  if (!st || !st.anim || !menu.open) return
  anim = { start: now(), shown: 0 }
  updateScreen() // the new header right away; rows hidden
  try {
    animTimer = setInterval(stepAnim, ANIM_STEP_MS)
  } catch (e) {
    finishAnim()
    updateScreen()
  }
}

function stepAnim() {
  try {
    if (!anim) return finishAnim()
    const n = Math.min(ROWS_PER_PAGE, 1 + Math.floor((now() - anim.start) / REVEAL_STEP_MS))
    if (n !== anim.shown) {
      anim.shown = n
      if (n >= ROWS_PER_PAGE) finishAnim()
      if (menu.open) updateMenu()
    }
  } catch (e) {
    finishAnim()
  }
}

function finishAnim() {
  if (animTimer !== null) {
    try {
      clearInterval(animTimer)
    } catch (e) {
      // already stopped
    }
    animTimer = null
  }
  anim = null
}

// move d tabs left/right within the open menu (wraps around)
function stepCat(d) {
  const tabs = menuTabs()
  const i = Math.max(0, tabs.indexOf(menu.cat))
  setCat(tabs[(i + d + tabs.length) % tabs.length])
}

function pageCount() {
  return Math.max(1, Math.ceil(menuRows().length / ROWS_PER_PAGE))
}

function setPage(p) {
  const old = menu.page
  menu.page = Math.max(0, Math.min(pageCount() - 1, p))
  if (menu.page !== old && menu.open) transition()
}

function countdown(ms) {
  const s = Math.ceil(ms / 1000)
  return s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : s + 's'
}

// ---------- the new tabs ----------
function extraTabRows(cat) {
  if (cat === 'GEAR') {
    const rows = GEAR_SLOTS.map((slot) => {
      const g = st.gear[slot.id]
      const r = g ? RARITIES[g.r] : null
      return {
        title: g ? r.name[0] + r.name.slice(1).toLowerCase() + ' ' + slot.name : slot.name,
        detail: g ? '+' + Math.round(g.v * 100) + '% ' + slot.stat : 'empty: bosses drop gear',
        right: g ? '+' + Math.round(g.v * 100) + '%' : '',
        on: !!g,
        icon: g ? r.color : 0x5a5478,
        letter: slot.name[0]
      }
    })
    const cost = st.pet.lv
    rows.push({
      title: 'Pet lv ' + st.pet.lv,
      detail: '+' + Math.round(PET_DMG * 100 * st.pet.lv) + '% damage, hits every 2s',
      right: 'FEED ' + cost,
      on: st.pet.treats >= cost,
      icon: 0xff9ab0,
      letter: 'P',
      action: feedPet
    })
    rows.push({ title: 'Treats ' + st.pet.treats, detail: 'from bosses and trips', right: '', on: false, icon: 0xff9ab0, letter: 'T' })
    return rows
  }
  if (cat === 'TRAVEL') {
    const t = now()
    const rows = []
    if (st.trip) {
      const h = heroById(st.trip.hero)
      const ready = tripReady()
      rows.push({
        title: ready ? 'Trip done!' : h.name + ' away',
        detail: ready ? 'tap to collect the loot' : 'back in ' + countdown(st.trip.endAt - t),
        right: ready ? 'CLAIM' : 'AWAY',
        on: ready,
        icon: 0x2f9ea8,
        letter: 'T',
        action: claimTrip
      })
    } else rows.push({ title: 'Expeditions', detail: 'send one hero for loot', right: '', on: false, icon: 0x2f9ea8, letter: 'T' })
    const rw = tripReward(st.tripHours)
    rows.push({
      title: 'Loot for ' + st.tripHours + 'h',
      detail: '+' + rw.dust + ' dust, ' + rw.treats + ' treats, gold',
      right: Math.round(rw.gearChance * 100) + '% gear',
      on: false,
      icon: GOLD,
      letter: '$'
    })
    for (const h of HEROES) {
      if (!h.dps || !st.lv[h.id]) continue
      const away = tripAway(h.id)
      rows.push({
        title: h.name + ' ' + st.lv[h.id],
        detail: away ? 'on a trip' : 'no DPS while away',
        right: away ? 'AWAY' : st.trip ? 'BUSY' : 'SEND',
        on: !st.trip,
        icon: h.icon,
        action: () => sendTrip(h.id)
      })
    }
    return rows
  }
  if (cat === 'ASCEND') {
    const confirming = st.ascConfirm && st.ascConfirm > now()
    const gain = ascShardsGain()
    const rows = [
      {
        title: confirming ? 'TAP AGAIN!' : 'ASCEND',
        detail: canAscend() ? 'restart all for shards' : 'stage ' + ASC_MIN_BEST + ' + ' + ASC_MIN_REBIRTHS + ' rebirths',
        right: canAscend() ? '+' + gain + ' shards' : 'LOCKED',
        on: canAscend(),
        icon: confirming ? RED : 0x5a6ad8,
        letter: 'A',
        action: ascendTap
      },
      { title: 'Shards ' + st.asc.shards, detail: 'buy constellations', right: '', on: false, icon: 0x9cc4ea, letter: '*' }
    ]
    CONSTELLATIONS.forEach((c, i) => {
      const lv = conLv(c.id)
      const maxed = lv >= c.max
      rows.push({
        title: c.name + ' ' + lv,
        detail: c.desc,
        right: maxed ? 'MAX' : lv + 1 + ' shards',
        on: !maxed && st.asc.shards >= lv + 1,
        icon: 0x9cc4ea,
        action: () => buyConstellation(i)
      })
    })
    return rows
  }
  if (cat === 'BESTIARY') {
    const ids = Object.keys(ENEMIES)
    const rows = [{ title: 'Completed ' + bestiaryDone() + '/' + ids.length, detail: '+1% damage for each', right: '', on: false, icon: 0x6a8a3a, letter: 'B' }]
    for (const id of ids) {
      const e = ENEMIES[id]
      const kills = st.bestiary[id] || 0
      const goal = bestiaryGoal(id)
      const seen = kills > 0
      rows.push({
        title: seen ? e.name : '???',
        detail: seen ? fmt(Math.min(kills, goal)) + ' / ' + goal + ' kills' : 'not met yet',
        right: kills >= goal ? '+1% dmg' : '',
        on: kills >= goal,
        icon: seen ? e.pals[0][Object.keys(e.pals[0])[0]] : 0x3a3150,
        letter: seen ? e.name[0] : '?'
      })
    }
    return rows
  }
  if (cat === 'MODES') {
    const rush = st.rush
    const rows = [
      {
        title: 'Boss Rush',
        detail: '60s of bosses, best ' + rush.best,
        right: rushPaysToday() ? 'START' : 'PLAY',
        on: !rush.active && !st.chal.active,
        icon: RED,
        letter: 'R',
        action: startRush
      }
    ]
    const t = now()
    CHALLENGES.forEach((c, i) => {
      const active = st.chal.active === c.id
      const confirming = st.chalConfirm && st.chalConfirm.id === c.id && st.chalConfirm.until > t
      rows.push({
        title: c.name + (chalDone(c.id) ? ' *' : ''),
        detail: active ? 'reach stage ' + c.goal : chalDone(c.id) ? c.reward : c.desc,
        right: active ? 'GIVE UP' : confirming ? 'SURE?' : 'START',
        on: !st.chal.active && !rush.active,
        icon: chalDone(c.id) ? GOLD : 0xd23a3a,
        action: () => challengeTap(i)
      })
    })
    return rows
  }
  return null
}

// home extras: the shooting star, the right-side badges and the pet
function updateExtras() {
  const s = st.star
  ;[ui.starTail, ui.starGlow, ui.starCore].forEach((o) => setVisible(o, !!s))
  if (s) {
    const dir = s.vx > 0 ? -1 : 1
    setCircle(ui.starTail, Math.round(s.x + dir * 14), Math.round(s.y), 5, 0xc9a227)
    setCircle(ui.starGlow, Math.round(s.x), Math.round(s.y), 13, 0xffe066)
    setCircle(ui.starCore, Math.round(s.x), Math.round(s.y), 6, WHITE)
  }
  const right = []
  if (frenzyOn()) right.push({ color: GOLD, text: 'x' + FRENZY_MULT })
  if ((st.combo || 0) >= 5) right.push({ color: 0xff9a3d, text: 'x' + comboMult().toFixed(1) })
  ui.rbadges.forEach((b, i) => {
    const d = right[i]
    Object.values(b).forEach((o) => setVisible(o, !!d))
    if (!d) return
    setCircle(b.ring, W - BADGE_X, BADGE_Y + i * BADGE_GAP, 17, d.color)
    setText(b.label, d.text)
    setColor(b.label, d.color)
  })
  const hop = st.petHop > 0 ? -5 : 0
  setCircle(ui.petBody, 70, 190 + hop, 11, 0xff9ab0)
  setCircle(ui.petEye1, 66, 188 + hop, 2, INK)
  setCircle(ui.petEye2, 74, 188 + hop, 2, INK)
}

// ---------- guide ----------
// The GUIDE tab: short explanations, grouped by colour. Each entry is a title and
// two lines of at most 36 characters (that is what fits on the watch).
function guideRows() {
  const BASICS = 0xe8663a
  const HEROES_C = 0x4dd06a
  const SKILLS_C = 0x378add
  const MONSTERS = 0xff5c5c
  const LONG = 0xc77dff
  const GOALS_C = 0xd4537e
  const AWAY = 0x5aa8ff
  const EXTRA = 0xff9a3d
  const BIG = 0x9cc4ea
  const g = (title, color, a, b) => ({ title, lines: [a, b], icon: color, letter: title[0], right: '', on: false })
  return [
    // basics
    g('Tap to attack', BASICS, 'Tap the monster to hit it.', 'Every kill gives you gold.'),
    g('Stages', BASICS, 'Every ' + KILLS_PER_STAGE + ' kills: next stage.', 'Every ' + BOSS_EVERY + 'th stage is a timed boss.'),
    g('Stage arrows', BASICS, '< goes back to farm gold.', '> goes forward to your best stage.'),
    g('Bosses', BASICS, 'Beat the boss before time runs out.', 'If it escapes you drop back a stage.'),
    g('Two menus', BASICS, 'Swipe left: heroes, upgrades, modes.', 'Swipe up: goals, stats, settings.'),
    // heroes
    g('Best Buy', HEROES_C, 'The green button buys the hero', 'level with the most power per gold.'),
    g('Heroes', HEROES_C, 'Heroes attack on their own (DPS).', 'The Sword makes your taps stronger.'),
    g('x2 every 25', HEROES_C, 'Heroes double their power at', 'level 25, 50, 75, 100 and so on.'),
    g('Perks', HEROES_C, 'At levels 10, 50 and 100 a hero', 'gets a bonus or unlocks a skill.'),
    // skills
    g('Skills', SKILLS_C, 'Each one is unlocked by a hero', 'at level 10. Free to use, recharges.'),
    g('Skill levels', SKILLS_C, 'A skill levels up at hero level', '25, 50, 75... and gets stronger.'),
    g('Rage Gold Smite', SKILLS_C, 'RAGE: x2 damage. GOLD: x3 gold.', 'SMITE: one huge hit on the monster.'),
    g('Rush Luck Wind', SKILLS_C, 'RUSH: auto taps. LUCK: more crits.', 'WIND: all other skills ready again.'),
    // special monsters
    g('Loot chest', MONSTERS, 'A rare chest monster with little', 'HP that drops ' + CHEST_GOLD + 'x gold.'),
    g('Gold thief', MONSTERS, 'The gold badge shows seconds left.', 'Catch it in time for ' + THIEF_GOLD + 'x gold.'),
    g('Armored', MONSTERS, 'Shield badge: heroes only do half', 'damage. Tapping matters more.'),
    g('Healing', MONSTERS, '+ badge: it heals itself when you', 'stop tapping. Keep hitting it!'),
    g('Boss badges', MONSTERS, 'Shield: blocks 90% for 2 seconds.', '! = enraged: its timer runs faster.'),
    // the long game
    g('Rebirth', LONG, 'From stage ' + REBIRTH_FROM + ' you can start over', 'and earn Stardust (more if further).'),
    g('Stardust', LONG, 'Each unspent Stardust: +' + Math.round(DUST_BONUS * 100) + '%', 'damage and gold. Or buy relics.'),
    g('Relics', LONG, 'Permanent upgrades bought with', 'Stardust. They survive rebirths.'),
    g('Hero stars', LONG, 'Each rebirth gives a used hero a', 'star: +' + Math.round(STAR_BONUS * 100) + '% for that hero, forever.'),
    // goals
    g('Achievements', GOALS_C, 'Reach goals (kills, bosses...) for', 'small permanent bonuses.'),
    g('Daily goal', GOALS_C, 'A new small task every day.', 'Finish it to earn Stardust.'),
    g('Steps', GOALS_C, 'Every ' + String(STEPS_PER_DUST).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' steps you walk today', 'gives you 1 Stardust.'),
    // away
    g('Offline gold', AWAY, 'Heroes farm while the app is closed,', 'up to ' + hoursText(offlineHours()) + ' (Dreamcatcher: more).'),
    g('Auto-advance', AWAY, 'In SETTINGS: while farming, move', 'to the next stage by itself.'),
    // extras
    g('Shooting star', EXTRA, 'Tap the flying star quickly for', 'gold, x5 damage or ready skills.'),
    g('Combo', EXTRA, 'Keep tapping (under 1s apart) for', 'up to +50% tap damage.'),
    g('Gear', EXTRA, 'Bosses drop weapons, charms and', 'banners. Better ones auto-equip.'),
    g('Pet', EXTRA, 'Your pet hits every 2 seconds.', 'Feed it treats from bosses.'),
    g('Expeditions', EXTRA, 'TRAVEL: send a hero away 1-8h.', 'It skips fights but brings loot.'),
    g('Element pairs', EXTRA, 'Both heroes of a colour at lv 25+', 'deal +30% damage.'),
    g('Bestiary', EXTRA, 'Kill 100 of each monster type', 'for +1% damage each.'),
    g('Weekly event', EXTRA, 'A new bonus every Monday,', 'shown on the GOALS page.'),
    // the biggest goals
    g('Ascension', BIG, 'Stage ' + ASC_MIN_BEST + ' + ' + ASC_MIN_REBIRTHS + ' rebirths: restart', 'everything for Shards (ASCEND).'),
    g('Constellations', BIG, 'Bought with Shards. Permanent:', 'they survive every reset.'),
    g('Challenges', BIG, 'MODES: runs with a twist. Your run', 'waits. Win once for a reward.'),
    g('Boss Rush', BIG, '60 seconds of bosses only.', 'Pays Stardust once a day.')
  ]
}

// Every category is just a list of rows; the screen shows three per page.
function menuRows() {
  const cat = CATS[menu.cat]
  if (cat === 'HEROES') {
    return HEROES.map((h, i) => {
      const lv = st.lv[h.id]
      const c = costN(h, lv, menu.mult)
      const can = st.gold >= c
      const detail = 'next: ' + nextGoal(h)
      const stars = st.stars[h.id] ? ' *' + st.stars[h.id] : '' // * = hero stars from rebirths
      const el = elementOf(h.id) // the icon shows the hero's element (see element pairs)
      return { title: h.name + ' ' + lv + stars, detail, right: fmt(c), on: can, icon: el ? ELEMENTS[el].color : h.icon, action: () => buyHero(i, menu.mult) }
    })
  }
  if (cat === 'SKILLS') {
    const t = now()
    return SKILLS.map((s, i) => {
      const k = st.skills[s.id]
      const state = skillState(s)
      const right =
        state === 'locked' ? heroById(s.hero).name.split(' ')[0].toUpperCase() + ' ' + s.heroLv
          : state === 'active' ? 'ON ' + countdown(k.activeUntil - t)
            : state === 'cooldown' ? countdown(k.readyAt - t)
              : 'USE'
      const lvl = skillLevel(s.id)
      return {
        title: s.name + (lvl > 0 ? ' ' + lvl : ''),
        detail: lvl > 0 ? skillDesc(s) + ', every ' + countdown(cooldownOf(s) * 1000) : s.desc,
        right,
        on: state === 'ready',
        icon: s.color,
        action: () => useSkill(i)
      }
    })
  }
  if (cat === 'RELICS') {
    return RELICS.map((r, i) => {
      const lv = st.relics[r.id]
      const maxed = lv >= r.max
      const c = relicCost(lv)
      return { title: r.name + ' ' + lv, detail: r.desc, right: maxed ? 'MAX' : c + ' dust', on: !maxed && st.dust >= c, icon: r.icon, action: () => buyRelic(i) }
    })
  }
  if (cat === 'REBIRTH') {
    const gain = rebirthGain()
    const confirming = st.confirmUntil && st.confirmUntil > now()
    return [
      { title: 'Stardust ' + st.dust, detail: '+' + Math.round(DUST_BONUS * 100) + '% damage & gold each', right: '', on: false, icon: 0xc77dff, letter: '*' },
      {
        title: confirming ? 'TAP AGAIN!' : 'REBIRTH',
        detail: gain > 0 ? 'start over at stage 1' : 'reach stage ' + REBIRTH_FROM + ' (now ' + st.runBest + ')',
        right: gain > 0 ? '+' + gain + ' dust' : 'LOCKED',
        on: gain > 0,
        icon: confirming ? 0xff5c5c : 0xe0a820,
        letter: 'R',
        action: rebirthTap
      },
      { title: 'Keeps', detail: 'dust, relics, stars, goals', right: '', on: false, icon: 0x4dd06a, letter: '+' },
      { title: 'Hero stars', detail: 'each rebirth: +50% to a hero', right: '', on: false, icon: GOLD, letter: '*' }
    ]
  }
  if (cat === 'GOALS') {
    const k = dailyKind()
    const steps = st.stepsToday
    const ev = weekEvent()
    const rows = [
      { title: ev.name, detail: ev.text, right: 'THIS WEEK', on: true, icon: GOLD, letter: 'W' },
      {
        title: 'Daily goal',
        detail: st.daily.done ? 'done! new one tomorrow' : k.text(st.daily.target) + ' ' + fmt(dailyProgress()) + '/' + fmt(st.daily.target),
        right: st.daily.done ? 'DONE' : '+' + dailyReward() + ' dust',
        on: st.daily.done,
        icon: 0xd4537e,
        letter: 'D'
      },
      steps >= 0
        ? {
          title: 'Steps ' + fmt(steps),
          detail: 'next dust at ' + fmt((Math.floor(steps / STEPS_PER_DUST) + 1) * STEPS_PER_DUST),
          right: '+' + st.steps.claimed + ' today',
          on: st.steps.claimed > 0,
          icon: 0x4de0ff,
          letter: 'S'
        }
        : { title: 'Steps', detail: 'no step counter found', right: '', on: false, icon: 0x5a5478, letter: 'S' }
    ]
    for (const a of ACHIEVEMENTS) {
      const done = !!st.ach[a.id]
      rows.push({
        title: a.name,
        detail: a.desc,
        right: done ? '+' + Math.round(a.x * 100) + '% ' + (a.kind === 'dmg' ? 'dmg' : 'gold') : fmt(Math.min(a.stat(), a.goal)) + '/' + fmt(a.goal),
        on: done,
        icon: done ? GOLD : 0x5a5478,
        letter: done ? '!' : '?'
      })
    }
    return rows
  }
  if (cat === 'GUIDE') return guideRows()
  if (cat === 'SETTINGS') {
    const confirming = st.resetConfirm && st.resetConfirm > now()
    return [
      {
        title: 'Auto-advance',
        detail: 'auto retry when farming',
        right: st.auto ? 'ON' : 'OFF',
        on: st.auto,
        icon: 0x4dd06a,
        letter: 'A',
        action: () => {
          st.auto = !st.auto
          save()
        }
      },
      {
        title: 'Tutorial',
        detail: 'show the first hints again',
        right: 'SHOW',
        on: false,
        icon: 0x5aa8ff,
        letter: '?',
        action: () => {
          st.tutorial = 0
          st.tips = {} // the feature tips come back too
          st.tip = null
          closeMenu()
        }
      },
      {
        title: confirming ? 'TAP AGAIN!' : 'Reset progress',
        detail: 'erase all and start over',
        right: confirming ? 'SURE?' : 'RESET',
        on: false,
        icon: 0xff5c5c,
        letter: 'X',
        action: resetTap
      },
      {
        title: 'Animations',
        detail: 'menu rows cascade in',
        right: st.anim ? 'ON' : 'OFF',
        on: st.anim,
        icon: 0x9b6cff,
        letter: '~',
        action: () => {
          st.anim = !st.anim
          save()
        }
      }
    ]
  }
  const extra = extraTabRows(cat)
  if (extra) return extra
  // STATS
  const s = st.stats
  const starTotal = HEROES.reduce((n, h) => n + (st.stars[h.id] || 0), 0)
  return [
    { title: 'Stars caught ' + s.starsCaught, detail: 'gear found ' + s.gearFound + ', trips ' + s.trips, right: '', on: false, icon: GOLD, letter: '*' },
    { title: 'Ascensions ' + s.ascensions, detail: 'challenges won ' + s.challenges, right: '', on: false, icon: 0x9cc4ea, letter: 'A' },
    { title: 'Achievements ' + achCount() + '/' + ACHIEVEMENTS.length, detail: 'dailies ' + s.dailies + ', step dust ' + s.stepDust, right: '', on: false, icon: 0xd4537e, letter: '!' },
    { title: 'Thieves ' + s.thieves, detail: 'skills used ' + fmt(s.skillsUsed), right: '', on: false, icon: GOLD, letter: 'T' },
    { title: 'Hero stars ' + starTotal, detail: '+50% per star', right: '', on: false, icon: GOLD, letter: '*' },
    { title: 'Best stage ' + st.best, detail: 'this run: ' + st.runBest, right: '', on: false, icon: 0x4dd06a, letter: '#' },
    { title: 'Kills ' + fmt(s.kills), detail: 'bosses ' + fmt(s.bosses) + ', taps ' + fmt(s.taps), right: '', on: false, icon: 0xff5c5c, letter: 'K' },
    { title: 'Loot chests ' + s.chests, detail: 'gold earned ' + fmt(s.goldEarned), right: '', on: false, icon: GOLD, letter: '$' },
    { title: 'Rebirths ' + s.rebirths, detail: 'stardust earned ' + s.dustEarned, right: '', on: false, icon: 0xc77dff, letter: 'R' },
    { title: 'Damage', detail: 'tap ' + fmt(tapDamage()) + ', DPS ' + fmtDps(partyDps(false)), right: '', on: false, icon: 0xff7a4a, letter: '!' },
    { title: 'Crit ' + Math.round(critChance() * 100) + '% x' + critMult(), detail: 'boss timer ' + bossSeconds() + 's', right: '', on: false, icon: 0xff7ac8, letter: 'C' },
    { title: 'Offline cap ' + hoursText(offlineHours()), detail: 'gold x' + goldMult(false).toFixed(1), right: '', on: false, icon: 0x5aa8ff, letter: 'i' }
  ]
}

// ---------- input ----------
function inBox(x, y, b) {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
}

// All taps arrive through one invisible full-screen layer on top of everything.
function onTap(x, y) {
  const t = now()
  // ignore an accidental double event (only when time moves forward: if the
  // watch clock jumps back, e.g. a time sync, taps must still work)
  if (t >= lastTapAt && t - lastTapAt < 40) return
  lastTapAt = t

  if (st.welcome) {
    st.welcome = null
    return
  }
  if (tutorialActive()) {
    st.tutorial++
    save()
    return
  }
  if (st.tip && !menu.open) {
    if (t - st.tipAt >= TIP_MIN_MS) st.tip = null
    return
  }

  if (menu.open) {
    if (inBox(x, y, L.closeTap)) return closeMenu()
    if (inBox(x, y, L.swapTap)) return openMenu(menu.kind === 'main' ? 'info' : 'main')
    if (y < L.dotY + 16) {
      // tap a dot to jump to that category
      const tabs = menuTabs()
      let nearest = 0
      tabs.forEach((_, i) => {
        if (Math.abs(x - dotX(i)) < Math.abs(x - dotX(nearest))) nearest = i
      })
      if (Math.abs(x - dotX(nearest)) < DOT_GAP / 2) setCat(tabs[nearest])
      return
    }
    // Only the green (price) button of a row acts, and only once the finger lifts
    // without sliding: a swipe that starts on a row must never buy anything.
    const rows = menuRows()
    for (let i = 0; i < ROWS_PER_PAGE; i++) {
      const row = rows[menu.page * ROWS_PER_PAGE + i]
      if (row && inBox(x, y, L.rows[i])) {
        if (row.action && row.right && inBox(x, y, pillTapBox(i))) press = { idx: menu.page * ROWS_PER_PAGE + i, cat: menu.cat, page: menu.page, x, y, at: t }
        return
      }
    }
    if (inBox(x, y, L.up)) setPage(menu.page - 1)
    else if (inBox(x, y, L.down)) setPage(menu.page + 1)
    else if (inBox(x, y, L.mid) && CATS[menu.cat] === 'HEROES') menu.mult = menu.mult === 1 ? 10 : 1
    else if (inBox(x, y, L.mid) && CATS[menu.cat] === 'TRAVEL') st.tripHours = TRIP_HOURS[(TRIP_HOURS.indexOf(st.tripHours) + 1) % TRIP_HOURS.length]
    return
  }

  // home
  if (st.star && Math.hypot(x - st.star.x, y - st.star.y) <= STAR_TAP_RADIUS) return catchStar()
  if (inBox(x, y, L.prevStage)) return goStage(-1)
  if (inBox(x, y, L.nextStage)) return goStage(1)
  for (let i = 0; i < SKILLS.length; i++) {
    if (Math.hypot(x - L.skillX[i], y - L.skillY) <= L.skillR + 4) return useSkill(i)
  }
  if (inBox(x, y, L.best)) return buyBest()
  if (inBox(x, y, L.menuBtn)) return openMenu('main')
  if (inBox(x, y, L.infoHint)) return openMenu('info')
  if (y < L.tapBottom) attack()
}

// ---------- button presses in the menu ----------
// A press waits for the finger to lift. It counts only if the finger stayed close
// (a swipe moves it), and any swipe cancels it. If the watch never reports a lift,
// the press goes through after PRESS_WAIT_MS unless a swipe came first.
const PRESS_SLOP = 24 // px the finger may drift and still count as a tap
const PRESS_WAIT_MS = 350
let press = null
let seenRelease = false // true once the watch has reported a finger lift

// the green button's tap area: the drawn pill plus a margin for fingers
function pillTapBox(i) {
  const b = L.rows[i]
  return { x: b.x + b.w - 112, y: b.y + 10, w: 108, h: 54 }
}

function onRelease(x, y) {
  seenRelease = true
  if (!press) return
  const p = press
  press = null
  const moved = typeof x === 'number' && typeof y === 'number' ? Math.hypot(x - p.x, y - p.y) : 0
  if (moved <= PRESS_SLOP) runPress(p)
}

function runPress(p) {
  // only if the menu still shows the same page (nothing changed in between)
  if (!menu.open || menu.cat !== p.cat || menu.page !== p.page) return
  const row = menuRows()[p.idx]
  if (row && row.action) row.action()
}

// called every tick: the backup for a watch that never reports a lift
function checkPress() {
  if (press && !seenRelease && now() - press.at >= PRESS_WAIT_MS) {
    const p = press
    press = null
    runPress(p)
  }
}

function handleRelease(e) {
  try {
    onRelease(e && e.x, e && e.y)
  } catch (err) {
    showError('release', err)
  }
}

// Swipes: on HOME swipe left opens the main menu, swipe up the info menu (swipe
// right still leaves the app). In a MENU: left/right = tab, up/down = page, right on
// the first tab closes. Any swipe cancels a button press that is waiting.
function onSwipe(ev) {
  press = null
  if (!st || st.welcome || st.paused) return false
  if (!menu.open) {
    if (ev === GESTURE_LEFT) {
      openMenu('main')
      return true
    }
    if (ev === GESTURE_UP) {
      openMenu('info')
      return true
    }
    return false
  }
  if (ev === GESTURE_LEFT) stepCat(1)
  else if (ev === GESTURE_RIGHT) {
    if (menu.cat === menuTabs()[0]) closeMenu()
    else stepCat(-1)
  } else if (ev === GESTURE_UP) setPage(menu.page + 1)
  else if (ev === GESTURE_DOWN) setPage(menu.page - 1)
  return true
}

// ---------- effects ----------
function addFloat(text, x, y, color) {
  const f = ui.floats[ui.nextFloat]
  ui.nextFloat = (ui.nextFloat + 1) % ui.floats.length
  f.text = text
  f.x = x - 70
  f.y = y
  f.color = color
  f.t = 8
  f.fresh = true
}

// Messages on the info line. If one is already showing, the new one waits its
// turn (up to 3 waiting), so two things happening at once are both seen.
function toast(text, color) {
  const msg = { text, color, t: 20 }
  if (!st.toast) {
    st.toast = msg
    return
  }
  if (st.toast.text === text) return // the same message again: no need to repeat it
  st.toastQ = st.toastQ || []
  if (st.toastQ.length >= 3) st.toastQ.shift() // full: drop the oldest waiting one, keep the newest news
  st.toastQ.push(msg)
}

function nextToast() {
  st.toast = st.toastQ && st.toastQ.length ? st.toastQ.shift() : null
}

// ---------- formatting ----------
function fmt(n) {
  n = Math.floor(n)
  if (n < 1000) return String(n)
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc']
  let u = -1
  while (n >= 1000 && u < units.length - 1) {
    n /= 1000
    u++
  }
  const s = n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : String(Math.floor(n))
  return s + units[u]
}

function fmtDps(n) {
  return n < 100 ? n.toFixed(1).replace('.0', '') : fmt(n)
}

function duration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm'
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

function setBox(o, b, color, radius, stroke) {
  const values = { x: b.x, y: b.y, w: b.w, h: b.h, radius, color }
  if (stroke) values.line_width = 2
  setMore(o, b.x + ',' + b.y + ',' + b.w + ',' + b.h + ',' + color, values)
}

function setCircle(o, x, y, r, color) {
  setMore(o, x + ',' + y + ',' + r + ',' + color, { center_x: x, center_y: y, radius: r, color })
}

// ---------- building the screen (once) ----------
function drawSprite(cv, rows, pal, x0, y0, scale) {
  // merge runs of same-coloured pixels into one rectangle = far fewer draw calls
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    let c = 0
    while (c < row.length) {
      const ch = row[c]
      if (ch === '.') {
        c++
        continue
      }
      let e = c
      while (e < row.length && row[e] === ch) e++
      cv.drawRect({ x1: x0 + c * scale, y1: y0 + r * scale, x2: x0 + e * scale, y2: y0 + (r + 1) * scale, color: pal[ch] })
      c = e
    }
  }
}

// ---------- the living background ----------
// Built from plain rectangles and circles (no canvas, so almost no memory),
// recoloured when you enter a new world, with a few small things that move.
const scene = { world: null }
const SKY_Y = [0, 80, 150, 200] // three sky bands
const GROUND_Y = 196

function darken(color, f) {
  const r = Math.floor(((color >> 16) & 255) * f)
  const g = Math.floor(((color >> 8) & 255) * f)
  const b = Math.floor((color & 255) * f)
  return (r << 16) | (g << 8) | b
}

function boxed(o, box) {
  o.box = box
  return o
}

function buildScene() {
  scene.sky = [0, 1, 2].map((i) =>
    boxed(mkRect(0, SKY_Y[i], W, SKY_Y[i + 1] - SKY_Y[i], BG, 0), { x: 0, y: SKY_Y[i], w: W, h: SKY_Y[i + 1] - SKY_Y[i] })
  )
  scene.glow = mkCircle(-60, -60, 10, BG)
  scene.light = mkCircle(-60, -60, 10, BG)
  scene.clouds = [
    { x: 60, y: 38, speed: 7 },
    { x: 260, y: 112, speed: 4 }
  ].map((c) => Object.assign(c, { parts: [mkCircle(-60, -60, 14, BG), mkCircle(-60, -60, 11, BG), mkCircle(-60, -60, 11, BG)] }))
  // hills: two at the back, one in front (big circles; only their tops show)
  scene.hillSpec = [
    { x: 70, y: 255, r: 95, layer: 0 },
    { x: 330, y: 258, r: 105, layer: 0 },
    { x: 200, y: 300, r: 135, layer: 1 }
  ]
  scene.hills = scene.hillSpec.map((h) => mkCircle(h.x, h.y, h.r, BG))
  scene.ground = boxed(mkRect(0, GROUND_Y + 4, W, 80, BG, 0), { x: 0, y: GROUND_Y + 4, w: W, h: 80 })
  scene.grass = boxed(mkRect(0, GROUND_Y, W, 8, BG, 0), { x: 0, y: GROUND_Y, w: W, h: 8 })
  scene.fx = []
  for (let i = 0; i < 8; i++) scene.fx.push({ o: mkCircle(-10, -10, 2, BG), x: 0, y: 0, vx: 0, vy: 0, t: 0, on: true })
  // everything below the scene is plain dark background again (hides the bottom of the hills)
  mkRect(0, L.tapBottom, W, H - L.tapBottom, BG, 0)
}

function rnd(a, b) {
  return a + Math.random() * (b - a)
}

function resetParticle(p, mode, anywhere) {
  p.t = rnd(0.2, 1)
  p.on = true
  if (mode === 'snow') {
    p.x = rnd(0, W)
    p.y = anywhere ? rnd(0, GROUND_Y) : -4
    p.vx = 0
    p.vy = rnd(25, 40)
  } else if (mode === 'embers') {
    p.x = rnd(20, W - 20)
    p.y = anywhere ? rnd(0, GROUND_Y) : GROUND_Y
    p.vx = rnd(-10, 10)
    p.vy = -rnd(30, 50)
  } else if (mode === 'dust') {
    p.x = anywhere ? rnd(0, W) : -4
    p.y = rnd(110, GROUND_Y - 4)
    p.vx = rnd(60, 90)
    p.vy = rnd(-5, 5)
  } else if (mode === 'stars') {
    p.x = rnd(10, W - 10)
    p.y = rnd(8, 140)
    p.vx = p.vy = 0
  } else if (mode === 'fireflies') {
    p.x = rnd(20, W - 20)
    p.y = rnd(30, GROUND_Y - 10)
    p.vx = rnd(-15, 15)
    p.vy = rnd(-15, 15)
  } else {
    // float (pollen)
    p.x = rnd(0, W)
    p.y = anywhere ? rnd(40, GROUND_Y) : GROUND_Y
    p.vx = rnd(-6, 6)
    p.vy = -rnd(6, 12)
  }
}

function applyWorld(w) {
  scene.world = w
  scene.sky.forEach((o, i) => setBox(o, o.box, w.sky[i], 0))
  scene.hills.forEach((o, i) => {
    const h = scene.hillSpec[i]
    setCircle(o, h.x, h.y, h.r, w.hills[h.layer])
  })
  setBox(scene.ground, scene.ground.box, w.ground[0], 0)
  setBox(scene.grass, scene.grass.box, w.ground[1], 0)
  setBox(ui.shadow, ui.shadow.box, darken(w.ground[0], 0.55), 9)
  setVisible(scene.glow, !!w.light)
  setVisible(scene.light, !!w.light)
  if (w.light) {
    setCircle(scene.glow, w.light.x, w.light.y, w.light.r + 9, w.light.glow)
    setCircle(scene.light, w.light.x, w.light.y, w.light.r, w.light.color)
  }
  scene.clouds.forEach((c) => c.parts.forEach((o) => setVisible(o, !!w.clouds)))
  scene.fx.forEach((p) => resetParticle(p, w.fx.mode, true))
}

function animateScene(dt) {
  const w = worldFor(st.stage)
  if (w !== scene.world) applyWorld(w)

  if (w.clouds) {
    for (const c of scene.clouds) {
      c.x += c.speed * dt
      if (c.x > W + 50) c.x = -50
      const x = Math.round(c.x)
      setCircle(c.parts[0], x, c.y, 14, w.clouds)
      setCircle(c.parts[1], x - 17, c.y + 5, 11, w.clouds)
      setCircle(c.parts[2], x + 17, c.y + 5, 11, w.clouds)
    }
  }

  const mode = w.fx.mode
  for (const p of scene.fx) {
    p.t -= dt
    if (mode === 'stars' || mode === 'fireflies' || mode === 'embers') {
      if (p.t <= 0) {
        p.t = rnd(0.3, 1.2)
        p.on = !p.on
        if (mode === 'fireflies') {
          p.vx = rnd(-15, 15)
          p.vy = rnd(-15, 15)
        }
      }
    }
    if (mode === 'snow') p.vx = Math.sin(p.y / 20) * 8 // gentle sway
    p.x += p.vx * dt
    p.y += p.vy * dt
    if (mode === 'fireflies') {
      if (p.x < 10 || p.x > W - 10) p.vx = -p.vx
      if (p.y < 20 || p.y > GROUND_Y - 6) p.vy = -p.vy
    } else if (p.y > GROUND_Y || p.y < -6 || p.x > W + 6 || p.x < -6) {
      resetParticle(p, mode, false)
    }
    let color = w.fx.color
    let r = 2
    if (mode === 'stars') {
      color = p.on ? 0xffffff : 0x4a5590
      r = p.on ? 2 : 1
    } else if (mode === 'fireflies') {
      r = p.on ? 2 : 1
      color = p.on ? w.fx.color : darken(w.fx.color, 0.5)
    } else if (mode === 'embers' && !p.on) color = GOLD
    setCircle(p.o, Math.round(p.x), Math.round(p.y), r, color)
  }
}

// ---------- arcade style ----------
// Chunky "3D" buttons are two rectangles: a darker ledge peeking out underneath
// a bright face. Badges are dark pills. Every menu category has its own colour.
const INK = 0x1a1530 // dark badge / plate colour
const ROW = 0x2a2040 // menu row colour
const ROW_SUB = 0xafa9ec // menu row detail text
const BUY_ON = 0x4dd06a
const BUY_ON_TEXT = 0x0d2a12
const BUY_OFF = 0x3a3150
const BUY_OFF_TEXT = 0x9a94b8
// HEROES, SKILLS, RELICS, REBIRTH, GOALS, STATS, SETTINGS
// (GUIDE is the warm brown of an old book)
// HEROES, SKILLS, RELICS, REBIRTH, GEAR, TRAVEL, ASCEND, GOALS, BESTIARY, MODES, STATS, GUIDE, SETTINGS
const CAT_COLORS = [0xe8663a, 0x378add, 0x8a5cf0, 0xe0a820, 0xb87333, 0x2f9ea8, 0x5a6ad8, 0xd4537e, 0x6a8a3a, 0xd23a3a, 0x1d9e75, 0xb07a3a, 0x6a6878]
const LEDGE = 5 // how far the darker ledge shows under a chunky button

function mkChunky(box, face, radius) {
  return {
    box,
    radius,
    ledge: mkRect(box.x, box.y + LEDGE, box.w, box.h - LEDGE, darken(face, 0.6), radius),
    face: mkRect(box.x, box.y, box.w, box.h - LEDGE, face, radius)
  }
}

function setChunky(b, face) {
  const x = b.box
  setBox(b.ledge, { x: x.x, y: x.y + LEDGE, w: x.w, h: x.h - LEDGE }, darken(face, 0.6), b.radius)
  setBox(b.face, { x: x.x, y: x.y, w: x.w, h: x.h - LEDGE }, face, b.radius)
}

function hpColor(frac, boss) {
  if (boss) return 0xc77dff
  return frac > 0.5 ? 0x4dd06a : frac > 0.25 ? 0xffd84d : 0xff5c5c
}

function lighten(color, f) {
  const r = (color >> 16) & 255
  const g = (color >> 8) & 255
  const b = color & 255
  const up = (v) => Math.min(255, Math.round(v + (255 - v) * f))
  return (up(r) << 16) | (up(g) << 8) | up(b)
}

function buildScreen() {
  // Background and the shadow under the monster are plain rectangles, not a canvas.
  // Every canvas reserves a block of pixel memory; this app keeps to one small one
  // (the monster), because with more a canvas sometimes came back broken
  // ("cannot read property 'id' of undefined").
  const bgRect = mkRect(0, 0, W, H, BG, 0)
  // backup tap listener: if the system lets taps fall through the layers above, they land here
  bgRect.w.addEventListener(event.CLICK_DOWN, (e) => handleTouch('B', e))
  buildScene()
  ui.shadow = mkRect(CX - 70, L.monY + L.monH - 15, 140, 18, 0x1a1f3a, 9)
  ui.shadow.box = { x: CX - 70, y: L.monY + L.monH - 15, w: 140, h: 18 }
  monCanvas = createWidget(widget.CANVAS, { x: L.monX, y: L.monY, w: L.monW, h: L.monH })
  // death "poof": a few circles that burst outwards when a monster dies
  ui.poof = []
  for (let i = 0; i < POOF_PARTS; i++) {
    const o = mkCircle(-20, -20, 4, WHITE)
    setVisible(o, false)
    ui.poof.push(o)
  }
  // effect badges: up to two small round icons left of the monster
  ui.badges = [0, 1].map((i) => {
    const x = BADGE_X
    const y = BADGE_Y + i * BADGE_GAP
    const b = {
      ring: mkCircle(x, y, 17, WHITE),
      bg: mkCircle(x, y, 14, INK),
      shieldTop: mkRect(x - 7, y - 8, 14, 9, WHITE, 3), // a shield = rounded top + round bottom
      shieldBottom: mkCircle(x, y + 1, 7, WHITE),
      plusH: mkRect(x - 8, y - 2, 16, 4, WHITE, 2), // a "+" = two crossing bars
      plusV: mkRect(x - 2, y - 8, 4, 16, WHITE, 2),
      label: mkText(x - 16, y - 13, 32, 26, 18, WHITE)
    }
    Object.values(b).forEach((o) => setVisible(o, false))
    return b
  })
  // shooting star (a glowing ball with a short tail)
  ui.starTail = mkCircle(-30, -30, 5, 0xc9a227)
  ui.starGlow = mkCircle(-30, -30, 13, 0xffe066)
  ui.starCore = mkCircle(-30, -30, 6, WHITE)
  ;[ui.starTail, ui.starGlow, ui.starCore].forEach((o) => setVisible(o, false))
  // right-side badges: combo multiplier and star frenzy
  ui.rbadges = [0, 1].map((i) => {
    const x = W - BADGE_X
    const y = BADGE_Y + i * BADGE_GAP
    const b = { ring: mkCircle(x, y, 17, WHITE), bg: mkCircle(x, y, 14, INK), label: mkText(x - 16, y - 12, 32, 24, 14, WHITE) }
    Object.values(b).forEach((o) => setVisible(o, false))
    return b
  })
  // the pet: a small round friend next to the monster
  ui.petBody = mkCircle(70, 190, 11, 0xff9ab0)
  ui.petEye1 = mkCircle(66, 188, 2, INK)
  ui.petEye2 = mkCircle(74, 188, 2, INK)

  // --- top: < STAGE badge >, with kill pips (or FARMING / boss timer) under it ---
  ui.stageBg = mkRect(CX - 90, 12, 180, 40, INK, 20)
  ui.stageEdge = mkStroke(CX - 90, 12, 180, 40, GOLD, 20)
  ui.stage = mkText(CX - 90, 12, 180, 40, 24, WHITE)
  ui.stageSub = mkText(CX - 90, 52, 180, 20, 13, ROW_SUB)
  ui.pips = []
  for (let i = 0; i < KILLS_PER_STAGE; i++) ui.pips.push(mkCircle(CX - 45 + i * 10, 62, 3, INK))
  const arrow = (box, label) => {
    const a = mkChunky(box, 0x3a3160, 14)
    a.label = mkText(box.x, box.y, box.w, box.h - LEDGE, 28, WHITE)
    setText(a.label, label)
    return a
  }
  ui.prevStage = arrow(L.prevStage, '<')
  ui.nextStage = arrow(L.nextStage, '>')

  // --- plate: monster name, HP numbers, chunky HP bar, info line ---
  const py = L.plateY
  mkRect(24, py, W - 48, 64, INK, 14)
  ui.monName = mkText(40, py + 2, 170, 20, 14, WHITE, align.LEFT)
  ui.hp = mkText(W - 210, py + 2, 170, 20, 13, ROW_SUB, align.RIGHT)
  mkRect(38, py + 23, W - 76, 16, 0x000000, 8) // outline
  mkRect(40, py + 25, W - 80, 12, 0x3a1f2a, 6) // empty part
  ui.barFill = mkRect(40, py + 25, W - 80, 12, BUY_ON, 6)
  ui.barShine = mkRect(42, py + 26, W - 84, 4, lighten(BUY_ON, 0.45), 2)
  ui.info = mkText(30, py + 41, W - 60, 22, 14, BLUE)

  // --- skill buttons: a darker ring around a bright button ---
  ui.skills = SKILLS.map((s, i) => ({
    ring: mkCircle(L.skillX[i], L.skillY, L.skillR + 2, PANEL),
    bg: mkCircle(L.skillX[i], L.skillY - 1, L.skillR - 3, PANEL),
    label: mkText(L.skillX[i] - L.skillR, L.skillY - 13, L.skillR * 2, 24, 13, DIM)
  }))

  // --- bottom row: gold (left), BEST BUY (middle), menu (right) ---
  const gb = L.goldBox
  // same shape as the chunky buttons next to it (face + darker ledge), so all three line up
  mkRect(gb.x, gb.y + LEDGE, gb.w, gb.h - LEDGE, darken(GOLD, 0.5), 14)
  mkRect(gb.x, gb.y, gb.w, gb.h - LEDGE, INK, 14)
  mkStroke(gb.x, gb.y, gb.w, gb.h - LEDGE, GOLD, 14)
  mkCircle(gb.x + 18, gb.y + 26, 10, GOLD)
  mkCircle(gb.x + 18, gb.y + 26, 6, 0xc9a227)
  ui.gold = mkText(gb.x + 32, gb.y, gb.w - 36, gb.h - LEDGE, 19, GOLD, align.LEFT)
  const b = L.best
  const mid = b.y + Math.round((b.h - LEDGE) / 2)
  ui.best = mkChunky(b, BUY_ON, 12)
  ui.bestIcon = mkCircle(b.x + 22, mid, 13, darken(BUY_ON, 0.4))
  ui.bestLetter = mkText(b.x + 9, mid - 12, 26, 24, 14, WHITE)
  ui.bestTitle = mkText(b.x + 40, b.y + 4, b.w - 44, 26, 15, BUY_ON_TEXT, align.LEFT)
  ui.bestCost = mkText(b.x + 40, b.y + 28, b.w - 44, 22, 12, BUY_ON_TEXT, align.LEFT)
  const m = L.menuBtn
  mkChunky(m, 0x9b6cff, 12)
  for (let i = 0; i < 3; i++) mkRect(m.x + 14, m.y + 15 + i * 9, m.w - 28, 4, WHITE, 2)
  // a small "^" under the bottom row: swipe up (or tap it) for the info menu
  const ih = L.infoHint
  setText(mkText(ih.x, ih.y, ih.w, ih.h, 20, 0x8a82b8), '^')

  // --- floating numbers: a pool of reusable text widgets ---
  ui.floats = []
  ui.nextFloat = 0
  for (let i = 0; i < 6; i++) {
    const o = mkText(0, 0, 140, 26, 20, WHITE)
    setVisible(o, false)
    ui.floats.push({ o, t: 0 })
  }

  if (SHOW_PERF) ui.perf = mkText(CX - 100, H - 26, 200, 20, 13, 0x4a5170)

  // --- menu (covers the whole screen; hidden until opened) ---
  ui.menu = [] // everything in the menu (hidden when it closes)
  ui.menuFixed = [] // the parts that are always shown while it is open
  const mAdd = (o, fixed) => {
    ui.menu.push(o)
    if (fixed) ui.menuFixed.push(o)
    return o
  }
  mAdd(mkRect(0, 0, W, H, 0x141026, 0), true)
  ui.band = mAdd(mkRect(0, 0, W, 74, CAT_COLORS[0], 0), true)
  // one dot per visible tab (the biggest menu has 8); placed in updateMenu
  ui.dots = MENUS.main.map(() => mAdd(mkCircle(CX, L.dotY - 6, 5, WHITE), true))
  const c = L.close
  ui.closeBg = mAdd(mkRect(c.x, c.y, c.w, c.h, darken(CAT_COLORS[0], 0.6), 22), true)
  setText(mAdd(mkText(c.x, c.y, c.w, c.h, 20, WHITE), true), 'X')
  // swap button: an up arrow and a down arrow side by side, drawn from small bars
  const sw = L.swap
  const sx = sw.x + sw.w / 2
  const sy = sw.y + sw.h / 2
  ui.swapBg = mAdd(mkRect(sw.x, sw.y, sw.w, sw.h, darken(CAT_COLORS[0], 0.6), 22), true)
  // square corners: on 2px bars a rounded corner gets smoothed into grey
  const bar = (x, y, w, h) => mAdd(mkRect(Math.round(x - w / 2), y, w, h, WHITE, 0), true)
  const head = [2, 6, 10]
  // up arrow (left): head on top, shaft below
  head.forEach((w, i) => bar(sx - 7, sy - 13 + i * 2, w, 2))
  bar(sx - 7, sy - 7, 2, 20)
  // down arrow (right): shaft on top, head below
  bar(sx + 7, sy - 12, 2, 20)
  head.forEach((w, i) => bar(sx + 7, sy + 12 - i * 2, w, 2))
  ui.menuTitle = mAdd(mkText(CX - 120, 36, 240, 32, 22, WHITE), true)
  ui.rows = L.rows.map((r) => ({
    bg: mAdd(mkRect(r.x, r.y, r.w, r.h, ROW, 14)),
    edge: mAdd(mkStroke(r.x, r.y, r.w, r.h, ROW, 14)),
    icon: mAdd(mkCircle(r.x + 32, r.y + r.h / 2, 19, WHITE)),
    letter: mAdd(mkText(r.x + 13, r.y + r.h / 2 - 15, 38, 30, 18, INK)),
    title: mAdd(mkText(r.x + 60, r.y + 8, 160, 28, 18, WHITE, align.LEFT)),
    detail: mAdd(mkText(r.x + 60, r.y + 38, 170, 24, 13, ROW_SUB, align.LEFT)),
    pill: mAdd(mkRect(r.x + r.w - 104, r.y + 20, 92, 34, BUY_OFF, 17)),
    right: mAdd(mkText(r.x + r.w - 104, r.y + 20, 92, 34, 16, BUY_OFF_TEXT)),
    // GUIDE rows: two full-width lines of text instead of the short detail and price pill
    line1: mAdd(mkText(r.x + 60, r.y + 34, r.w - 70, 18, 13, ROW_SUB, align.LEFT)),
    line2: mAdd(mkText(r.x + 60, r.y + 52, r.w - 70, 18, 13, ROW_SUB, align.LEFT))
  }))
  const navBtn = (bx) => {
    const n = { box: bx, radius: 12, ledge: mAdd(mkRect(bx.x, bx.y + LEDGE, bx.w, bx.h - LEDGE, 0x24203a, 12)), face: mAdd(mkRect(bx.x, bx.y, bx.w, bx.h - LEDGE, BUY_OFF, 12)) }
    n.label = mAdd(mkText(bx.x, bx.y, bx.w, bx.h - LEDGE, 20, WHITE))
    return n
  }
  ui.up = navBtn(L.up)
  ui.mid = navBtn(L.mid)
  ui.down = navBtn(L.down)
  ui.footer = mAdd(mkText(CX - 150, 386, 300, 26, 16, GOLD), true)
  ui.menu.forEach((o) => setVisible(o, false))

  // --- tutorial hint (first launch, or SETTINGS > Tutorial) ---
  ui.hint = [
    mkRect(CX - 150, 112, 300, 176, INK, 16),
    mkStroke(CX - 150, 112, 300, 176, 0x4de0ff, 16),
    mkText(CX - 150, 122, 300, 36, 24, 0x4de0ff),
    wrap(
      createWidget(widget.TEXT, {
        x: CX - 135, y: 160, w: 270, h: 90, text: '', text_size: 17, color: WHITE,
        align_h: align.CENTER_H, align_v: align.CENTER_V, text_style: text_style.WRAP
      }),
      WHITE
    ),
    mkText(CX - 150, 254, 300, 24, 14, ROW_SUB)
  ]

  // --- welcome-back overlay ---
  ui.welcome = [
    mkRect(CX - 150, 120, 300, 180, INK, 16),
    mkStroke(CX - 150, 120, 300, 180, GOLD, 16),
    mkText(CX - 150, 130, 300, 36, 26, GOLD),
    mkText(CX - 150, 172, 300, 26, 18, WHITE),
    mkText(CX - 150, 200, 300, 26, 18, WHITE),
    mkText(CX - 150, 226, 300, 34, 26, GOLD),
    mkText(CX - 150, 266, 300, 22, 15, ROW_SUB)
  ]
  setText(ui.welcome[2], 'WELCOME BACK!')
  setText(ui.welcome[4], 'Your heroes earned')
  setText(ui.welcome[6], 'tap to continue')

  // touch layer: an empty full-screen TEXT widget created last, so it is on top of
  // everything. It sits at 0,0, so tap coordinates are screen coordinates.
  // (It used to be a full-screen canvas, but a canvas needs a big block of pixel
  // memory, and with this many widgets it came back broken and ignored taps.)
  ui.touch = createWidget(widget.TEXT, { x: 0, y: 0, w: W, h: H, text: '', text_size: 10, color: BG })
  ui.touch.addEventListener(event.CLICK_DOWN, (e) => handleTouch('T', e))
  // finger lifted: completes a menu button press (if the watch reports it)
  try {
    ui.touch.addEventListener(event.CLICK_UP, (e) => handleRelease(e))
    bgRect.w.addEventListener(event.CLICK_UP, (e) => handleRelease(e))
  } catch (e) {
    console.log('TAP QUEST no finger-lift events: ' + e)
  }
}

// DEBUG: counts taps and remembers which layer caught them (shown with the speed counter)
const tapDebug = { n: 0, src: '-' }

function handleTouch(src, e) {
  try {
    tapDebug.n++
    tapDebug.src = src
    if (!e || typeof e.x !== 'number' || typeof e.y !== 'number') {
      tapDebug.src = src + '?' // the event came without coordinates
      return
    }
    onTap(e.x, e.y)
  } catch (err) {
    showError('tap', err)
  }
}

// ---------- updating the screen (every tick, only what changed) ----------
let monsterFailures = 0

function renderMonster() {
  // If the canvas is not ready (or the system refuses), keep the game running
  // and simply try again on the next tick instead of freezing everything.
  try {
    monCanvas.clear({ x: 0, y: 0, w: L.monW, h: L.monH })
    const scale = st.boss ? 11 : 10
    const size = 12 * scale
    const shakeX = st.shake > 0 ? (st.shake % 2 ? 4 : -4) : 0
    const bobY = st.bob ? -3 : 0 // gentle idle "breathing"
    drawSprite(monCanvas, st.sprite, st.flash > 0 ? WHITE_PAL : st.pal, (L.monW - size) / 2 + shakeX, (L.monH - size) / 2 - 4 + bobY, scale)
    st.monsterDirty = false
    monsterFailures = 0
  } catch (e) {
    monsterFailures++
    st.monsterDirty = true
    console.log('TAP QUEST monster draw failed (' + monsterFailures + '): ' + (e && e.message ? e.message : e))
  }
}

function updateHome() {
  setText(ui.gold, fmt(st.gold))

  // stage badge; under it the kill pips, or FARMING, or the boss timer
  const farming = isFarming()
  const badge = { x: CX - 90, y: 12, w: 180, h: 40 }
  setText(ui.stage, 'STAGE ' + st.stage)
  setBox(ui.stageBg, badge, st.boss ? 0x5a1428 : INK, 20)
  setBox(ui.stageEdge, badge, st.boss ? RED : farming ? 0x4dd06a : GOLD, 20, true)
  let sub = ''
  let subColor = 0x4dd06a
  const chal = CHALLENGES.find((k) => k.id === st.chal.active)
  if (st.rush.active) {
    sub = 'RUSH ' + Math.ceil(st.rush.active.left) + 's   ' + st.rush.active.count + ' BOSSES'
    subColor = RED
  } else if (chal) {
    sub = 'CHALLENGE: REACH ' + chal.goal
    subColor = GREEN
  } else if (st.boss) {
    sub = 'BOSS ' + Math.ceil(st.bossLeft) + 's'
    subColor = RED
  } else if (farming) sub = 'FARMING  (best ' + st.runBest + ')' + (st.auto ? ' AUTO' : '')
  setText(ui.stageSub, sub)
  setColor(ui.stageSub, subColor)
  const showPips = !st.boss && !farming
  updateBadges()
  updateExtras()
  ui.pips.forEach((o, i) => {
    setVisible(o, showPips)
    if (showPips) setCircle(o, CX - 45 + i * 10, 62, i < st.kills ? 4 : 3, i < st.kills ? GOLD : INK)
  })

  // the arrows light up only when you can move that way
  const arrowStyle = (a, enabled) => {
    setChunky(a, enabled ? 0x5a4aa8 : 0x241e3a)
    setColor(a.label, enabled ? WHITE : 0x4a4468)
  }
  arrowStyle(ui.prevStage, st.stage > 1)
  arrowStyle(ui.nextStage, st.stage < st.runBest)

  // HP: name, numbers, and a chunky bar that turns yellow, then red
  const frac = Math.max(0, st.hp / st.maxHp)
  const barW = W - 80
  const bw = Math.round(barW * frac)
  // the bar turns pale blue while a boss shield is up; special monsters get their own colour
  const col = st.boss && st.shieldOn > 0 ? 0x9cc4ea : hpColor(frac, st.boss)
  setText(ui.monName, st.monsterName)
  setColor(
    ui.monName,
    st.boss ? 0xc77dff : st.special === 'thief' ? GOLD : st.special === 'armored' ? 0x9cc4ea : st.special === 'healer' ? 0x4dd06a : WHITE
  )
  setText(ui.hp, fmt(Math.max(0, Math.ceil(st.hp))) + ' / ' + fmt(st.maxHp))
  setVisible(ui.barFill, bw >= 4)
  setVisible(ui.barShine, bw >= 8)
  if (bw >= 4) setBox(ui.barFill, { x: 40, y: L.plateY + 25, w: bw, h: 12 }, col, 6)
  if (bw >= 8) setBox(ui.barShine, { x: 42, y: L.plateY + 26, w: bw - 4, h: 4 }, lighten(col, 0.45), 2)

  // info line: a message, otherwise your tap damage and DPS
  // (active skills are not listed here: their buttons already show the countdown)
  const t = now()
  if (st.toast) {
    setText(ui.info, st.toast.text)
    setColor(ui.info, st.toast.color)
    // when more messages are waiting, each one gets 1 s instead of 2 so the line keeps up
    if (st.toastQ && st.toastQ.length && st.toast.t > 10) st.toast.t = 10
    if (--st.toast.t <= 0) nextToast()
  } else {
    setText(ui.info, 'TAP ' + fmt(tapDamage()) + '    DPS ' + fmtDps(partyDps(true)))
    setColor(ui.info, BLUE)
  }

  // skill buttons: bright with a dark ring when ready, white ring while active,
  // dark with a countdown while cooling down
  SKILLS.forEach((s, i) => {
    const k = st.skills[s.id]
    const state = skillState(s)
    const sb = ui.skills[i]
    const x = L.skillX[i]
    let ring = 0x24243a
    let face = 0x1a1a2e
    let text = LOCKED
    let label = heroById(s.hero).name[0] + s.heroLv // e.g. "A10" = Archer level 10 unlocks it
    if (state === 'ready') {
      ring = darken(s.color, 0.55)
      face = s.color
      text = INK
      label = s.short
    } else if (state === 'active') {
      ring = WHITE
      face = s.color
      text = INK
      label = countdown(k.activeUntil - t)
    } else if (state === 'cooldown') {
      ring = 0x2a3060
      face = 0x1f2448
      text = ROW_SUB
      label = countdown(k.readyAt - t)
    }
    setCircle(sb.ring, x, L.skillY, L.skillR + 2, ring)
    setCircle(sb.bg, x, L.skillY - 1, L.skillR - 3, face)
    setText(sb.label, label)
    setColor(sb.label, text)
  })

  // BEST BUY: green when you can afford it, grey when you can't
  const best = bestBuy()
  const can = best.c <= st.gold
  setChunky(ui.best, can ? BUY_ON : BUY_OFF)
  setCircle(ui.bestIcon, L.best.x + 22, L.best.y + Math.round((L.best.h - LEDGE) / 2), 13, can ? darken(BUY_ON, 0.4) : 0x24203a)
  setText(ui.bestLetter, best.h.name[0])
  setText(ui.bestTitle, best.h.name.toUpperCase() + ' ' + (st.lv[best.h.id] + 1))
  setColor(ui.bestTitle, can ? BUY_ON_TEXT : WHITE)
  setText(ui.bestCost, can ? fmt(best.c) + ' gold' : 'need ' + fmt(best.c - st.gold) + ' more')
  setColor(ui.bestCost, can ? BUY_ON_TEXT : BUY_OFF_TEXT)

  updatePoof()

  // floating numbers
  for (const f of ui.floats) {
    if (f.t > 0) {
      if (f.fresh) {
        setText(f.o, f.text)
        setColor(f.o, f.color)
        f.fresh = false
      }
      const x = Math.round(f.x)
      const y = Math.round(f.y - (8 - f.t) * 5)
      setMore(f.o, x + ',' + y, { x, y, w: 140, h: 26 })
      setVisible(f.o, true)
      f.t--
    } else {
      setVisible(f.o, false)
    }
  }
}

function updateMenu() {
  const catColor = CAT_COLORS[menu.cat]
  // the info menu (swipe up) has a darker header, so you always know which one is open
  const info = menu.kind === 'info'
  setBox(ui.band, { x: 0, y: 0, w: W, h: 74 }, info ? darken(catColor, 0.45) : catColor, 0)
  setBox(ui.closeBg, L.close, darken(catColor, info ? 0.3 : 0.6), 22)
  setBox(ui.swapBg, L.swap, darken(catColor, info ? 0.3 : 0.6), 22)
  const tabs = menuTabs()
  ui.dots.forEach((d, i) => {
    const c = tabs[i]
    setVisible(d, c !== undefined)
    // the active dot pops bigger while the rows come in
    if (c !== undefined) setCircle(d, dotX(i), L.dotY - 6, c === menu.cat ? (anim && anim.shown < 2 ? 8 : 6) : 4, c === menu.cat ? WHITE : darken(CAT_COLORS[c], info ? 0.8 : 0.55))
  })
  const pages = pageCount()
  if (menu.page >= pages) menu.page = pages - 1
  setText(ui.menuTitle, CATS[menu.cat] + (pages > 1 ? '  ' + (menu.page + 1) + '/' + pages : ''))

  const rows = menuRows()
  ui.rows.forEach((w, i) => {
    const row = rows[menu.page * ROWS_PER_PAGE + i]
    const show = !!row && i < rowsShown()
    const guide = show && !!row.lines
    ;[w.bg, w.edge, w.icon, w.letter, w.title].forEach((o) => setVisible(o, show))
    setVisible(w.detail, show && !guide)
    setVisible(w.line1, guide)
    setVisible(w.line2, guide)
    setVisible(w.pill, show && !guide && !!row.right)
    setVisible(w.right, show && !guide && !!row.right)
    if (!show) return
    const box = L.rows[i]
    setBox(w.edge, box, row.on ? GOLD : ROW, 14, true)
    setCircle(w.icon, box.x + 32, box.y + box.h / 2, 19, row.icon || catColor)
    setText(w.letter, row.letter || row.title[0])
    setText(w.title, row.title)
    if (guide) {
      setText(w.line1, row.lines[0] || '')
      setText(w.line2, row.lines[1] || '')
      return
    }
    setText(w.detail, row.detail)
    setText(w.right, row.right)
    setBox(w.pill, { x: box.x + box.w - 104, y: box.y + 20, w: 92, h: 34 }, row.on ? BUY_ON : BUY_OFF, 17)
    setColor(w.right, row.on ? BUY_ON_TEXT : BUY_OFF_TEXT)
  })

  // nav buttons: grey chunky arrows; the middle one is the category colour on HEROES
  const nav = (n, label, enabled, face) => {
    setChunky(n, face)
    setText(n.label, label)
    setColor(n.label, enabled ? WHITE : 0x5a5478)
  }
  nav(ui.up, '^', menu.page > 0, BUY_OFF)
  nav(ui.down, 'v', menu.page < pages - 1, BUY_OFF)
  const cat = CATS[menu.cat]
  const button = cat === 'HEROES' ? 'BUY x' + menu.mult : cat === 'TRAVEL' ? 'TRIP ' + st.tripHours + 'h' : null
  setVisible(ui.mid.face, !!button)
  setVisible(ui.mid.ledge, !!button)
  setVisible(ui.mid.label, true)
  if (button) nav(ui.mid, button, true, catColor)
  else {
    const counter = { RELICS: st.dust + ' stardust', REBIRTH: st.dust + ' stardust', ASCEND: st.asc.shards + ' shards', GEAR: st.pet.treats + ' treats' }[cat]
    setText(ui.mid.label, counter || '')
    setColor(ui.mid.label, 0xc77dff)
  }

  setText(ui.footer, fmt(st.gold) + ' gold')
}

function updateScreen() {
  const showMenu = menu.open
  if (!showMenu) ui.menu.forEach((o) => setVisible(o, false))
  if (showMenu) {
    // the fixed parts always; rows and nav decide for themselves
    ui.menuFixed.forEach((o) => setVisible(o, true))
    ;[ui.up, ui.down].forEach((n) => [n.ledge, n.face, n.label].forEach((o) => setVisible(o, true)))
    updateMenu()
  } else {
    if (st.monsterDirty) renderMonster()
    updateHome()
  }

  // overlays
  const showWelcome = !!st.welcome
  if (showWelcome) {
    const w = st.welcome
    setText(ui.welcome[3], 'Away for ' + w.away + (w.capped ? ' (max ' + hoursText(offlineHours()) + ')' : ''))
    setText(ui.welcome[5], fmt(w.gold) + ' gold')
  }
  ui.welcome.forEach((o) => setVisible(o, showWelcome))

  // tutorial: one hint at a time, tap to continue
  const showHint = hintShown()
  if (showHint) {
    const intro = tutorialActive()
    const h = intro ? TUTORIAL[st.tutorial] : st.tip
    setText(ui.hint[2], h.title)
    setText(ui.hint[3], typeof h.body === 'function' ? h.body() : h.body)
    setText(ui.hint[4], intro ? 'tap to continue  ' + (st.tutorial + 1) + '/' + TUTORIAL.length : now() - st.tipAt < TIP_MIN_MS ? '' : 'NEW TIP  -  tap to continue')
  }
  ui.hint.forEach((o) => setVisible(o, showHint))
}

// ---------- tutorial ----------
// A short intro on the first launch...
const TUTORIAL = [
  { title: 'TAP TO ATTACK', body: 'Tap the monster to hit it. Every kill gives gold.' },
  { title: 'BEST BUY', body: 'The green button levels up your best hero. Heroes fight on their own.' },
  { title: 'STAGES', body: 'Kill 10 monsters to move on. < > change stage: go back to farm gold.' },
  { title: 'MENU', body: 'Swipe left: heroes and upgrades. Swipe up: goals, stats, guide, settings.' }
]

function tutorialActive() {
  return st.tutorial < TUTORIAL.length && !st.welcome && !menu.open
}

// ...then one tip the first time each thing shows up (in this order if several do).
// The game is frozen while a tip is on screen.
const TIPS = [
  { id: 'boss', when: () => st.boss, title: 'BOSS FIGHT', body: 'Beat it before the timer ends. Too strong? Use < to farm gold, then try again.' },
  { id: 'special', when: () => !!st.special, title: 'SPECIAL MONSTER', body: 'Its trick shows on the left: shield = armored, + = heals, number = thief flees in N s.' },
  { id: 'shield', when: () => st.boss && st.shieldOn > 0, title: 'BOSS SHIELD', body: 'From stage 10 bosses raise a shield (left icon) that blocks most damage for a moment.' },
  { id: 'enrage', when: () => st.boss && st.enraged, title: 'ENRAGED!', body: 'From stage 15 a boss at half HP gets angry (!) and its timer runs faster.' },
  { id: 'star', when: () => !!st.star, title: 'SHOOTING STAR', body: 'Tap the star before it flies off: gold, x' + FRENZY_MULT + ' damage or all skills ready!' },
  { id: 'combo', when: () => st.combo >= 5, title: 'COMBO', body: 'Keep tapping fast: each hit in a row adds +1% damage, up to +' + COMBO_MAX + '% (right icon).' },
  { id: 'skill', when: () => SKILLS.some((k) => skillLevel(k.id) > 0), title: 'NEW SKILL', body: 'A hero reached level 10 and unlocked a skill. Use it in the SKILLS tab.' },
  { id: 'gear', when: () => GEAR_SLOTS.some((g) => !!st.gear[g.id]), title: 'GEAR', body: 'Bosses can drop gear. Better pieces equip themselves, the rest becomes Stardust.' },
  { id: 'pet', when: () => st.pet.treats > 0, title: 'PET TREATS', body: 'Your pet (left) hits on its own. Feed it treats in the GEAR tab to make it stronger.' },
  { id: 'rebirth', when: () => st.runBest >= REBIRTH_FROM, title: 'REBIRTH', body: 'Stage ' + REBIRTH_FROM + '! REBIRTH restarts the run for Stardust. Spend it on RELICS.' },
  { id: 'event', when: () => st.best >= 10, title: 'WEEKLY EVENT', body: () => 'This week: ' + weekEvent().name + ', ' + weekEvent().text + '. A new one every Monday.' },
  { id: 'travel', when: () => st.stats.rebirths >= 1, title: 'EXPEDITIONS', body: 'In TRAVEL send a hero away for 1-8 h. It brings back Stardust, treats and gold.' },
  { id: 'pair', when: () => Object.keys(ELEMENTS).some(pairActive), title: 'ELEMENT PAIR', body: 'Two heroes of the same color at level ' + PAIR_LEVEL + '+ both deal +30% damage.' },
  { id: 'modes', when: () => st.best >= 25, title: 'NEW MODES', body: 'MODES has challenges with forever rewards, and a daily Boss Rush for Stardust.' },
  { id: 'bestiary', when: () => bestiaryDone() > 0, title: 'BESTIARY', body: 'You beat enough of one monster: +1% damage forever. See BESTIARY for the rest.' },
  { id: 'ascend', when: () => canAscend(), title: 'ASCENSION', body: 'You can ascend: a full restart for Shards, which buy strong forever bonuses.' }
]
const TIP_MIN_MS = 1000 // a tip ignores taps this long, so fast tapping cannot skip it unread

function checkTips() {
  if (st.tip || st.tutorial < TUTORIAL.length || menu.open || st.welcome) return
  const tip = TIPS.find((k) => !st.tips[k.id] && k.when())
  if (!tip) return
  st.tips[tip.id] = true
  st.tip = tip
  st.tipAt = now()
  save()
}

function hintShown() {
  return tutorialActive() || (!!st.tip && !menu.open && !st.welcome)
}

// ---------- main loop ----------
let partyTimer = 0
let partyDamage = 0
const perf = { start: 0, ticks: 0, work: 0 }

function tick() {
  try {
    const t = now()
    let dt = (t - lastTick) / 1000
    lastTick = t
    if (dt < 0) dt = 0
    if (dt > 3) {
      // the watch slept (screen off) — treat it like time away (not while paused)
      if (!st.paused) awayFor(dt)
      dt = 0
    }
    checkTips()
    if (hintShown()) dt = 0 // the game waits while a hint is read

    if (!st.paused) {
      updateStar(dt)
      updateCombo()
      if (st.rush.active) {
        st.rush.active.left -= dt
        if (st.rush.active.left <= 0) endRush()
      }
      // the pet hits every 2 s
      st.petT = (st.petT || 0) + dt
      if (st.petT >= PET_HIT_EVERY) {
        st.petT = 0
        petHit()
      }
      if (st.petHop > 0) st.petHop -= dt
      if (st.trip && !st.trip.told && tripReady()) {
        st.trip.told = true
        toast('TRIP DONE! CLAIM IT IN TRAVEL', 0x5aa8ff)
      }
      // Rush: automatic taps while it is active
      if (buffActive('rush') && dt > 0) {
        st.rushAcc = (st.rushAcc || 0) + rushRate() * dt
        while (st.rushAcc >= 1) {
          st.rushAcc--
          attack()
        }
      }
      const dps = partyDps(true)
      if (dps > 0 && dt > 0) {
        const d = dps * dt * (st.special === 'armored' ? 0.5 : 1) // armour halves hero damage
        partyDamage += d
        partyTimer += dt
        hit(d)
        if (partyTimer >= 1) {
          addFloat(fmt(partyDamage), CX - 50, L.monY + 30, BLUE)
          partyTimer = 0
          partyDamage = 0
        }
      }
      if (st.boss && !st.rush.active) {
        updateBoss(dt)
        if (st.bossLeft <= 0) bossEscaped()
      }
      // a healer regains HP once you stop tapping it
      if (st.special === 'healer' && t - st.lastHitAt > HEAL_AFTER * 1000) {
        st.hp = Math.min(st.maxHp, st.hp + st.maxHp * HEAL_PER_SECOND * dt)
      }
      // a gold thief runs away if you are too slow
      if (st.special === 'thief') {
        st.fleeLeft -= dt
        if (st.fleeLeft <= 0) {
          toast('THE THIEF GOT AWAY!', RED)
          spawn()
        }
      }
      // goals: achievements and the daily goal every second, steps every 10 s
      st.goalT = (st.goalT || 0) + dt
      if (st.goalT >= 0.999) {
        // (0.999, not 1: ten 0.1 s ticks add up to 0.99999..., not exactly 1)
        st.goalT = 0
        checkAchievements()
        updateDaily()
        st.stepT = (st.stepT || 0) + 1
        if (st.stepT >= 10) {
          st.stepT = 0
          updateSteps()
        }
      }
      saveTimer += dt
      if (saveTimer >= SAVE_EVERY_SECONDS) save()
    }

    if (st.shake > 0) {
      st.shake--
      st.monsterDirty = true
    }
    if (st.flash > 0) {
      st.flash--
      st.monsterDirty = true
    }
    if (st.poof > 0) st.poof = Math.max(0, st.poof - dt)
    // idle bob: the monster rises and settles twice a second
    st.bobT = (st.bobT || 0) + dt
    if (st.bobT >= 0.5) {
      st.bobT = 0
      st.bob = !st.bob
      st.monsterDirty = true
    }
    if (!menu.open && !st.paused) animateScene(Math.min(dt, 0.2))
    // while the menu rows come in, the heavy redraw waits (the header was already
    // drawn); if the reveal timer ever stalls, this shows everything as a backup
    if (anim && now() - anim.start > ANIM_TOTAL_MS + 150) finishAnim()
    checkPress()
    if (!anim) updateScreen()

    // speed counter: average work per tick and real ticks per second
    perf.ticks++
    perf.work += now() - t
    if (t - perf.start >= 1000) {
      if (SHOW_PERF)
        setText(ui.perf, (perf.work / perf.ticks).toFixed(1) + ' ms  ' + perf.ticks + '/s  taps ' + tapDebug.n + ' ' + tapDebug.src)
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
  console.log('TAP QUEST ERROR ' + msg)
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
      layout()

      step = 'setStatusBarVisible'
      try {
        setStatusBarVisible(false)
      } catch (e) {
        console.log('TAP QUEST could not hide status bar: ' + e)
      }

      step = 'load save'
      storage = new LocalStorage()
      const loaded = load()
      st = loaded.state
      initRuntime()
      spawn()
      lastTick = now()
      perf.start = lastTick
      if (loaded.last) awayFor((lastTick - loaded.last) / 1000)
      updateDaily()
      updateSteps()

      step = 'build screen'
      buildScreen()

      step = 'first render'
      applyWorld(worldFor(st.stage))
      updateScreen()

      step = 'onGesture'
      try {
        onGesture({ callback: onSwipe })
      } catch (e) {
        console.log('TAP QUEST could not listen for swipes: ' + e)
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
    finishAnim()
    try {
      offGesture()
    } catch (e) {
      // nothing to undo
    }
    if (st) save()
  }
})
