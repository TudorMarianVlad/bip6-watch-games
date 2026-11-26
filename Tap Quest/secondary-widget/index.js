// Tap Quest widget: a page in the watch's widget list.
// Pure black (AMOLED: black pixels are off). Shows the monster you are fighting,
// your stage, gold, Stardust and bounties ready, read from the summary the game
// writes into its save (data.widget, see save() in page/index.js).
// Only a real tap on PLAY opens the game: a swipe (finger moves) never does, so you
// can still swipe on to the next widget.
import { createWidget, deleteWidget, widget, prop, align, event } from '@zos/ui'
import { LocalStorage } from '@zos/storage'
import { push } from '@zos/router'
import { getDeviceInfo } from '@zos/device'

let W = 390
let CX = W / 2
const GOLD = 0xffd84d
const WHITE = 0xffffff
const SUB = 0xafa9ec
const ORANGE = 0xff9a3d
const GREEN = 0x4dd06a
const TILE = 0x16131f // dark tiles: barely lit on an AMOLED screen
const TAP_SLOP = 18 // a finger that moves more than this is a swipe, not a tap

// shown before the first game is saved
const SLIME = [
  '............', '............', '....gggg....', '...gggggg...',
  '..gggggggg..', '..gwkggwkg..', '.ggwkggwkgg.', '.gggggggggg.',
  '.ggggddgggg.', 'gggggggggggg', '.dddddddddd.', '............'
]
const SLIME_PAL = { g: 0x4dd06a, d: 0x2a8a40, w: 0xffffff, k: 0x101010 }

const L = {}
function layout() {
  L.title = { x: CX - 150, y: 12, w: 300, h: 30 }
  L.world = { x: CX - 170, y: 42, w: 340, h: 24 } // the world, or the festival when one is on
  L.sprite = { y: 68, scale: 8 } // 12 x 8 = 96 px
  L.name = { x: CX - 170, y: 166, w: 340, h: 22 }
  L.stage = { x: CX - 170, y: 188, w: 340, h: 42 }
  L.gold = { x: CX - 155, y: 236, w: 150, h: 58 }
  L.dust = { x: CX + 5, y: 236, w: 150, h: 58 }
  L.todo = { x: CX - 175, y: 300, w: 350, h: 24 } // things waiting for you (orange)
  L.info = { x: CX - 175, y: 326, w: 350, h: 22 } // best stage, streak, cards
  L.play = { x: CX - 100, y: 356, w: 200, h: 54 }
}
layout()

function text(b, size, color, value) {
  return createWidget(widget.TEXT, {
    x: b.x, y: b.y, w: b.w, h: b.h, text: value || '', text_size: size, color,
    align_h: align.CENTER_H, align_v: align.CENTER_V
  })
}

function rect(x, y, w, h, color, radius) {
  return createWidget(widget.FILL_RECT, { x, y, w, h, color, radius: radius || 0 })
}

let ui = null
let spriteParts = []
let spriteKey = ''

// same-coloured pixels in a row become one rectangle
function drawSprite(rows, pal) {
  const key = JSON.stringify([rows, pal])
  if (key === spriteKey) return
  spriteKey = key
  spriteParts.forEach((o) => {
    try {
      deleteWidget(o)
    } catch (e) {
      // already gone
    }
  })
  spriteParts = []
  const s = L.sprite.scale
  const x0 = CX - 6 * s
  rows.forEach((row, r) => {
    let c = 0
    while (c < row.length) {
      const ch = row[c]
      if (ch === '.' || pal[ch] === undefined) {
        c++
        continue
      }
      let e = c
      while (e < row.length && row[e] === ch) e++
      spriteParts.push(rect(x0 + c * s, L.sprite.y + r * s, (e - c) * s, s, pal[ch], 0))
      c = e
    }
  })
}

function readSummary() {
  try {
    const raw = new LocalStorage().getItem('save', '')
    const data = raw ? JSON.parse(raw) : null
    return data && data.widget ? data.widget : null
  } catch (e) {
    return null
  }
}

function setText(o, value, color) {
  o.setProperty(prop.TEXT, value)
  if (color !== undefined) o.setProperty(prop.COLOR, color)
}

function refresh() {
  if (!ui) return
  const s = readSummary()
  if (!s) {
    drawSprite(SLIME, SLIME_PAL)
    setText(ui.world, '')
    setText(ui.name, 'SLIME')
    setText(ui.stage, 'NEW GAME')
    setText(ui.gold, '0')
    setText(ui.dust, '0')
    setText(ui.todo, 'tap PLAY to start', SUB)
    setText(ui.info, '')
    return
  }
  const sprite = Array.isArray(s.sprite) && s.sprite.length === 12 && s.pal ? s.sprite : SLIME
  drawSprite(sprite, sprite === SLIME ? SLIME_PAL : s.pal)
  // a festival takes the world's place at the top, in its own colour
  if (s.festival) setText(ui.world, '* ' + s.festival.name + ' *', s.festival.color)
  else setText(ui.world, '~ ' + s.world + ' ~', SUB)
  const shiny = /^SHINY /.test(s.monster || '')
  setText(ui.name, s.monster || '', s.boss ? 0xc77dff : shiny ? 0xfff3a0 : SUB)
  setText(ui.stage, 'STAGE ' + s.stage)
  setText(ui.gold, s.gold)
  setText(ui.dust, s.dust || '0')
  // what is waiting for you in the game
  const todo = []
  if (s.bounties > 0) todo.push(s.bounties + (s.bounties > 1 ? ' bounties' : ' bounty'))
  if (s.loginReady) todo.push('daily gift')
  if (s.talentPts > 0) todo.push(s.talentPts + (s.talentPts > 1 ? ' talent pts' : ' talent pt'))
  setText(ui.todo, todo.length ? todo.join(', ') + ' waiting!' : 'all done for now', todo.length ? ORANGE : 0x5a5478)
  const parts = ['best ' + s.best]
  if (s.streak > 1) parts.push(s.streak + '-day streak')
  parts.push('cards ' + (s.cards || 0) + '/' + (s.cardTotal || '?'))
  setText(ui.info, parts.join('   '), SUB)
}

function play() {
  try {
    push({ url: 'page/index' })
  } catch (e) {
    console.log('TAP QUEST widget could not open the game: ' + e)
  }
}

SecondaryWidget({
  build() {
    // Bip 6 is 390 wide, but app.json also lists a 480 round target: centre on the real screen
    try {
      const info = getDeviceInfo()
      W = info && info.width ? info.width : 390
      CX = W / 2
    } catch (e) {
      W = 390
      CX = W / 2
    }
    layout()
    spriteKey = '' // force a redraw if the widget is rebuilt at a different width
    // no background: the screen is already black
    text(L.title, 18, GOLD, 'TAP QUEST')
    ui = {
      world: text(L.world, 16, SUB),
      name: text(L.name, 16, SUB),
      stage: text(L.stage, 32, WHITE)
    }
    // two tiles: gold and Stardust
    const tile = (b, label, color) => {
      rect(b.x, b.y, b.w, b.h, TILE, 14)
      text({ x: b.x, y: b.y + 4, w: b.w, h: 20 }, 14, SUB, label)
      return text({ x: b.x, y: b.y + 24, w: b.w, h: 30 }, 24, color)
    }
    ui.gold = tile(L.gold, 'GOLD', GOLD)
    ui.dust = tile(L.dust, 'STARDUST', 0xc77dff)
    ui.todo = text(L.todo, 16, ORANGE)
    ui.info = text(L.info, 14, SUB)
    const p = L.play
    rect(p.x, p.y + 4, p.w, p.h, 0x2a8a40, p.h / 2)
    rect(p.x, p.y, p.w, p.h, GREEN, p.h / 2)
    text(p, 24, 0x0d2a12, 'PLAY')

    // Only the PLAY button listens, and only to a tap: the finger must lift close
    // to where it went down. A swipe that starts on the button is ignored, so the
    // watch can move on to the next widget.
    const hit = createWidget(widget.TEXT, { x: p.x, y: p.y, w: p.w, h: p.h + 4, text: '', text_size: 10, color: 0 })
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
    spriteParts = []
    spriteKey = ''
  }
})
