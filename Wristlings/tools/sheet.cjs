// A review sheet of every Wristling: the sprite the game uses, with its number and
// name under it, in book order. Handy for picking which drawings to redo.
//
// Run:  node tools/sheet.cjs                 (writes tools/sheet_named.png)
//       node tools/sheet.cjs embit sprig     (only those creatures)
//       SIZE=200 node tools/sheet.cjs ...    (bigger sprites for a closer look)

const fs = require('fs')
const path = require('path')
const { encodePng } = require('./png.cjs')
const { readPng } = require('./pngread.cjs')
const ui = require('./ui.cjs')

// load page/data.js (an ES module) without a bundler
function loadData() {
  let src = fs.readFileSync(path.join(__dirname, '..', 'page', 'data.js'), 'utf8')
  const names = []
  src = src.replace(/^export (const|function) (\w+)/gm, (m, k, n) => {
    names.push(n)
    return k + ' ' + n
  })
  const mod = { exports: {} }
  new Function('module', src + '\nmodule.exports = {' + names.join(',') + '}')(mod)
  return mod.exports
}
const data = loadData()
const { SPECIES, ELEMENTS } = data
const only = process.argv.slice(2)
const BOOK = only.length ? data.BOOK.filter((id) => only.indexOf(id) >= 0) : data.BOOK

const COLS = Math.min(6, process.argv.length - 2 || 6)
const SPRITE = +process.env.SIZE || 128
const CELL_W = SPRITE + 32
const CELL_H = SPRITE + 56
const BG = [0x1a, 0x14, 0x30]
const CARD = [0x24, 0x1d, 0x45]

const rows = Math.ceil(BOOK.length / COLS)
const W = COLS * CELL_W
const H = rows * CELL_H
const px = new Uint8Array(W * H * 4)
for (let i = 0; i < W * H; i++) {
  px[i * 4] = BG[0]
  px[i * 4 + 1] = BG[1]
  px[i * 4 + 2] = BG[2]
  px[i * 4 + 3] = 255
}

// paste an RGBA image (alpha-blended) at x, y
function blit(rgba, iw, ih, x, y) {
  for (let j = 0; j < ih; j++)
    for (let i = 0; i < iw; i++) {
      const s = (j * iw + i) * 4
      const a = rgba[s + 3] / 255
      if (!a) continue
      const d = ((y + j) * W + (x + i)) * 4
      for (let k = 0; k < 3; k++) px[d + k] = Math.round(rgba[s + k] * a + px[d + k] * (1 - a))
    }
}
function fillRect(x, y, w, h, c) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    const d = (j * W + i) * 4
    px[d] = c[0]
    px[d + 1] = c[1]
    px[d + 2] = c[2]
  }
}
// one line of 3D text, centred in a box
function label(str, x, y, w, scale, colors) {
  const tw = Math.ceil(ui.textWidth(str, scale)) + 8
  const th = Math.ceil(7 * scale) + 8
  const cv = new ui.Canvas(tw, th)
  ui.text3d(cv, str, 4, 3, scale, colors)
  blit(cv.out(false), tw, th, x + Math.round((w - tw) / 2), y)
}

// the sprite the game really uses: assets/default.s/mon/<id>.png
const ASSETS = path.join(__dirname, '..', 'assets', 'default.s', 'mon')
function spriteOf(id) {
  const img = readPng(path.join(ASSETS, id + '.png'))
  if (img.w === SPRITE && img.h === SPRITE) return img.rgba
  // nearest-pixel resize to the sheet's sprite size
  const out = new Uint8Array(SPRITE * SPRITE * 4)
  for (let y = 0; y < SPRITE; y++)
    for (let x = 0; x < SPRITE; x++) {
      const s = (Math.floor((y * img.h) / SPRITE) * img.w + Math.floor((x * img.w) / SPRITE)) * 4
      out.set(img.rgba.subarray(s, s + 4), (y * SPRITE + x) * 4)
    }
  return out
}

BOOK.forEach((id, n) => {
  const s = SPECIES[id]
  const x = (n % COLS) * CELL_W
  const y = Math.floor(n / COLS) * CELL_H
  fillRect(x + 4, y + 4, CELL_W - 8, CELL_H - 8, CARD)
  // element colour strip at the top of the card
  const ec = ELEMENTS[s.el].color
  fillRect(x + 4, y + 4, CELL_W - 8, 4, [(ec >> 16) & 255, (ec >> 8) & 255, ec & 255])
  blit(spriteOf(id), SPRITE, SPRITE, x + (CELL_W - SPRITE) / 2, y + 12)
  label(String(data.BOOK.indexOf(id) + 1), x + 6, y + 12, 34, 2, { top: 0xfffbe0, bottom: 0xffc531, side: 0xa0601a })
  label(s.name.toUpperCase(), x, y + SPRITE + 18, CELL_W, 1.75, { top: 0xffffff, bottom: 0xd8d0ff, side: 0x4a3f8c })
})

fs.writeFileSync(path.join(__dirname, 'sheet_named.png'), encodePng(W, H, px))
console.log('wrote tools/sheet_named.png:', BOOK.length, 'Wristlings')
