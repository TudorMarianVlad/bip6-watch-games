// Draws the widget's preview picture for the watch's widget picker by running the real
// widget code (secondary-widget/index.js) with fake watch APIs and a sample save, so the
// preview always matches the widget. Text uses the game's 3D pixel font.
// Writes assets/default.{s,r,b}/widget-preview.png and widget-preview_en-US.png at
// 266 x 307 (the Bip 6 preview size; zeus build needs both names).
//   node tools/widget-preview.cjs           write the previews
//   node tools/widget-preview.cjs --full    also write tools/widget_full.png (390 x 450, to check the layout)
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')
const { readPng } = require('./pngread.cjs')
const { encodePng } = require('./png.cjs')
const ui = require('./ui.cjs')

const HOUR = 3600000
const now = Date.now()
// a sample game: Embit, a few tracks ready, half the book
const SAMPLE = { t: now, started: true, lead: { sp: 'embit', name: 'Embit', lv: 12, el: 'fire', elName: 'FIRE', elColor: 0xff7a3d, hp: 38, max: 44, full: 72, joy: 85 }, team: 3, mates: [{ sp: 'sprig', lv: 10, hp: 30, max: 36 }, { sp: 'zippet', lv: 9, hp: 26, max: 30 }], resting: false, tracks: 3, cap: 6, freeAt: now + 42 * 60000, freeMin: 90, walkDay: 0, walkTracks: 0, stepsPerTrack: 250, charms: 5, caught: 21, total: 42, dream: false, evolve: '', fullPerHour: 4, hungryBelow: 25, hpPerMin: 0.03 }
const STEPS = -1

const made = []
class Obj {
  constructor(type, o) {
    this.type = type
    this.o = Object.assign({ visible: true }, o)
    made.push(this)
  }
  setProperty(p, v) {
    if (p === 'more') Object.assign(this.o, v)
    else this.o[p] = v
  }
  getProperty(p) {
    return this.o[p]
  }
  addEventListener() {}
}
const zui = {
  createWidget: (t, o) => new Obj(t, o),
  deleteWidget: () => {},
  widget: { TEXT: 'text', FILL_RECT: 'rect', IMG: 'img' },
  prop: { TEXT: 'text', COLOR: 'color', SRC: 'src', VISIBLE: 'visible', MORE: 'more', Y: 'y' },
  align: { LEFT: 'l', CENTER_H: 'c', RIGHT: 'r', CENTER_V: 'cv' },
  event: { CLICK_DOWN: 'd', CLICK_UP: 'u' }
}
const save = JSON.stringify({ widget: SAMPLE })
const fakes = {
  '@zos/ui': zui,
  '@zos/storage': { LocalStorage: class { getItem() { return save } } },
  '@zos/router': { push: () => {} },
  '@zos/sensor': { Step: class { getCurrent() { return STEPS } } }
}
let def = null
let src = fs.readFileSync(ROOT + '/secondary-widget/index.js', 'utf8')
src = src.replace(/^import \{([^}]+)\} from '([^']+)'/gm, (m, names, mod) => 'const {' + names + "} = __fakes['" + mod + "']")
new Function('__fakes', 'SecondaryWidget', src)(fakes, (d) => (def = d))
def.build()

// ---------- draw ----------
const W = 390, H = 450
const px = new Uint8Array(W * H * 4)
for (let i = 0; i < W * H; i++) px[i * 4 + 3] = 255
const hex = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]
function blend(x, y, rgb, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const d = (y * W + x) * 4
  for (let k = 0; k < 3; k++) px[d + k] = Math.round(rgb[k] * a + px[d + k] * (1 - a))
}
for (const w of made) {
  const o = w.o
  if (!o.visible) continue
  if (w.type === 'rect') {
    const r = o.radius || 0
    for (let y = o.y; y < o.y + o.h; y++)
      for (let x = o.x; x < o.x + o.w; x++) {
        const cx = Math.min(Math.max(x + 0.5, o.x + r), o.x + o.w - r), cy = Math.min(Math.max(y + 0.5, o.y + r), o.y + o.h - r)
        if (r && (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue
        blend(x, y, hex(o.color), 1)
      }
  } else if (w.type === 'img') {
    const im = readPng(path.join(ROOT, 'assets/default.s', o.src))
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const s = (y * im.w + x) * 4; if (im.rgba[s + 3]) blend(o.x + x, o.y + y, [im.rgba[s], im.rgba[s + 1], im.rgba[s + 2]], im.rgba[s + 3] / 255) }
  } else if (w.type === 'text' && o.text) {
    const str = String(o.text).toUpperCase()
    const s = o.text_size / 10
    const tw = Math.ceil(ui.textWidth(str, s)) + 6, th = Math.ceil(7 * s) + 6
    const cv = new ui.Canvas(tw, th)
    const c = hex(o.color)
    const col = (c[0] << 16) | (c[1] << 8) | c[2]
    ui.text3d(cv, str, 3, 2, s, { top: col, bottom: col, side: 0x000000 })
    const t = cv.out(false)
    const x0 = o.align_h === 'l' ? o.x : o.align_h === 'r' ? o.x + o.w - tw : o.x + Math.round((o.w - tw) / 2)
    const y0 = o.y + Math.round((o.h - th) / 2)
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { const k = (y * tw + x) * 4; if (t[k + 3]) blend(x0 + x, y0 + y, [t[k], t[k + 1], t[k + 2]], t[k + 3] / 255) }
  }
}
if (process.argv.includes('--full')) fs.writeFileSync(path.join(__dirname, 'widget_full.png'), encodePng(W, H, px))

// scale down to the preview size (area average), with rounded transparent corners
const PW = 266, PH = 307, k = W / PW
const prev = new Uint8Array(PW * PH * 4)
for (let y = 0; y < PH; y++)
  for (let x = 0; x < PW; x++) {
    const acc = [0, 0, 0]
    let n = 0
    for (let sy = Math.floor(y * k); sy < Math.min(H, Math.ceil((y + 1) * k)); sy++)
      for (let sx = Math.floor(x * k); sx < Math.min(W, Math.ceil((x + 1) * k)); sx++) {
        for (let c = 0; c < 3; c++) acc[c] += px[(sy * W + sx) * 4 + c]
        n++
      }
    const r = 40, cx = Math.min(Math.max(x + 0.5, r), PW - r), cy = Math.min(Math.max(y + 0.5, r), PH - r)
    const inside = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r
    prev.set([acc[0] / n, acc[1] / n, acc[2] / n, inside ? 255 : 0], (y * PW + x) * 4)
  }
const png = encodePng(PW, PH, prev, { small: true })
for (const p of ['default.s', 'default.r', 'default.b'])
  for (const name of ['widget-preview.png', 'widget-preview_en-US.png']) fs.writeFileSync(path.join(ROOT, 'assets', p, name), png)
console.log('wrote widget-preview.png (+ _en-US) into assets/default.{s,r,b}')
