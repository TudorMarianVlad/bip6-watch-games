// Wristlings art importer: turns your own creature drawings into game sprites.
//
// 1. Put one PNG per creature in Wristlings/art/, named after its id:
//      art/embit.png, art/cindervix.png, ...   (ids: see docs/creatures.md)
//    Any size. Transparent background is best; a plain single-colour background
//    also works (it is removed automatically).
//    The creature should face LEFT. If yours faces right, name it embit.right.png
//    (or run with --right to flip every image).
// 2. Run:  node tools/import.cjs
// 3. Run:  zeus build
//
// For each image it: removes a plain background, trims empty space, scales it to the
// game's sizes (crisp for pixel art, smooth for painted art), and writes the four
// sprites the game uses into all three asset folders:
//    mon/<id>.png    128 x 128, facing left  (wild creatures, den, book, ...)
//    mon/<id>_b.png  112 x 112, facing right (your creature in battle)
//    mon/<id>_s.png   64 x 64                (team list, book grid)
//    mon/<id>_x.png   64 x 64 silhouette     (book, before you catch it)
// art/ holds the source image of every creature (the user's Gemini images).
//
// Options:
//   --right          every image faces right (flip them all)
//   --pixel          force crisp pixel scaling      --smooth   force smooth scaling
//   --only id,id     import just these creatures
//   --art <dir>      read images from another folder (default: art/)
//   --out <dir>      write to another assets folder (for trying it out)

const fs = require('fs')
const path = require('path')
const { readPng } = require('./pngread.cjs')
const { encodePng } = require('./png.cjs')

const ROOT = path.join(__dirname, '..')
const args = process.argv.slice(2)
const opt = (name) => args.indexOf(name) >= 0
const val = (name) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : null)
const ART = path.resolve(val('--art') || path.join(ROOT, 'art'))
const OUT = path.resolve(val('--out') || path.join(ROOT, 'assets'))
const ONLY = val('--only') ? val('--only').split(',') : null
const PLATFORMS = ['default.s', 'default.r', 'default.b']
const SILHOUETTE = [0x2e, 0x28, 0x50]

// the creature ids, straight from the game data
function speciesIds() {
  let src = fs.readFileSync(path.join(ROOT, 'page', 'data.js'), 'utf8')
  const names = []
  src = src.replace(/^export (const|function) (\w+)/gm, (m, k, n) => {
    names.push(n)
    return k + ' ' + n
  })
  const mod = { exports: {} }
  new Function('module', src + '\nmodule.exports = {' + names.join(',') + '}')(mod)
  return mod.exports.BOOK
}

// ---------- image steps ----------
// the main colours along the image border: one for a plain background, two for the
// grey-and-white checkerboard that AI tools paint when they "fake" transparency
function borderColours(img) {
  const { w, h, rgba } = img
  const buckets = new Map()
  let total = 0
  const add = (p) => {
    const i = p * 4
    const key = (rgba[i] >> 4) * 256 + (rgba[i + 1] >> 4) * 16 + (rgba[i + 2] >> 4)
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 }
    b.n++
    b.r += rgba[i]
    b.g += rgba[i + 1]
    b.b += rgba[i + 2]
    buckets.set(key, b)
    total++
  }
  for (let x = 0; x < w; x++) add(x), add((h - 1) * w + x)
  for (let y = 0; y < h; y++) add(y * w), add(y * w + w - 1)
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .filter((b, i) => i < 2 && b.n > total * 0.15)
    .map((b) => [b.r / b.n, b.g / b.n, b.b / b.n])
}

// no transparency at all? then the border colour is the background: flood-fill it
// away from the edges (so the same colour inside the creature stays)
function removeBackground(img) {
  const { w, h, rgba } = img
  // already cut out? (most of the border is transparent)
  let clear = 0
  for (let x = 0; x < w; x++) clear += (rgba[x * 4 + 3] < 128) + (rgba[((h - 1) * w + x) * 4 + 3] < 128)
  for (let y = 0; y < h; y++) clear += (rgba[y * w * 4 + 3] < 128) + (rgba[(y * w + w - 1) * 4 + 3] < 128)
  if (clear > (w + h) * 2 * 0.5) return false
  const bg = borderColours(img)
  if (!bg.length) return false
  const tol = 48
  const near = (i) => bg.some((c) => Math.abs(rgba[i] - c[0]) + Math.abs(rgba[i + 1] - c[1]) + Math.abs(rgba[i + 2] - c[2]) <= tol)
  const seen = new Uint8Array(w * h)
  const stack = []
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x)
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1)
  while (stack.length) {
    const p = stack.pop()
    if (seen[p] || !near(p * 4)) continue
    seen[p] = 1
    rgba[p * 4 + 3] = 0
    const x = p % w
    const y = (p - x) / w
    if (x > 0) stack.push(p - 1)
    if (x < w - 1) stack.push(p + 1)
    if (y > 0) stack.push(p - w)
    if (y < h - 1) stack.push(p + w)
  }
  return true
}

function trim(img) {
  const { w, h, rgba } = img
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (rgba[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  if (x1 < 0) throw new Error('the image is empty (fully transparent)')
  const tw = x1 - x0 + 1
  const th = y1 - y0 + 1
  const out = new Uint8Array(tw * th * 4)
  for (let y = 0; y < th; y++) out.set(rgba.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + tw) * 4), y * tw * 4)
  return { w: tw, h: th, rgba: out }
}

function flip(img) {
  const { w, h, rgba } = img
  const out = new Uint8Array(rgba.length)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.set(rgba.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (y * w + (w - 1 - x)) * 4)
  return { w, h, rgba: out }
}

// scale to (nw x nh): nearest pixel (crisp pixel art) or area average (smooth)
function scale(img, nw, nh, crisp) {
  const { w, h, rgba } = img
  const out = new Uint8Array(nw * nh * 4)
  for (let y = 0; y < nh; y++)
    for (let x = 0; x < nw; x++) {
      const d = (y * nw + x) * 4
      if (crisp) {
        const sx = Math.min(w - 1, Math.floor(((x + 0.5) * w) / nw))
        const sy = Math.min(h - 1, Math.floor(((y + 0.5) * h) / nh))
        out.set(rgba.subarray((sy * w + sx) * 4, (sy * w + sx) * 4 + 4), d)
        continue
      }
      // average every source pixel this target pixel covers (alpha-weighted)
      const sx0 = (x * w) / nw, sx1 = ((x + 1) * w) / nw
      const sy0 = (y * h) / nh, sy1 = ((y + 1) * h) / nh
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++)
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          const cw = Math.min(sx + 1, sx1) - Math.max(sx, sx0)
          const ch = Math.min(sy + 1, sy1) - Math.max(sy, sy0)
          const k = cw * ch
          const s = (Math.min(h - 1, sy) * w + Math.min(w - 1, sx)) * 4
          const al = (rgba[s + 3] / 255) * k
          r += rgba[s] * al
          g += rgba[s + 1] * al
          b += rgba[s + 2] * al
          a += al
          n += k
        }
      if (a > 0) {
        out[d] = Math.round(r / a)
        out[d + 1] = Math.round(g / a)
        out[d + 2] = Math.round(b / a)
        out[d + 3] = Math.round((a / n) * 255)
      }
    }
  return { w: nw, h: nh, rgba: out }
}

// place the creature in a size x size square: centred, feet near the bottom,
// with a small margin; returns RGBA
function fit(img, size, crisp) {
  let margin = Math.round(size * 0.04)
  const box = size - margin * 2
  const m = Math.max(img.w, img.h)
  let k = box / m
  let s
  if (crisp) {
    // pixel art: a whole-number zoom keeps every pixel square. If that leaves it
    // much too small, try without the margin; failing that, zoom up crisply and
    // shrink smoothly (fine for the small 64 px sprites)
    let z = Math.floor(box / m)
    if (z * m < box * 0.8 && Math.floor(size / m) * m >= box * 0.8) {
      z = Math.floor(size / m)
      margin = Math.floor((size - z * m) / 2)
    }
    if (z >= 1 && z * m >= box * 0.8) {
      k = z
      s = scale(img, img.w * z, img.h * z, true)
    } else {
      const up = Math.max(1, Math.ceil(box / m))
      s = scale(scale(img, img.w * up, img.h * up, true), Math.max(1, Math.round(img.w * k)), Math.max(1, Math.round(img.h * k)), false)
    }
  } else s = scale(img, Math.max(1, Math.round(img.w * k)), Math.max(1, Math.round(img.h * k)), false)
  const nw = s.w
  const nh = s.h
  const out = new Uint8Array(size * size * 4)
  const ox = Math.floor((size - nw) / 2)
  const oy = size - margin - nh
  for (let y = 0; y < nh; y++) out.set(s.rgba.subarray(y * nw * 4, (y + 1) * nw * 4), ((oy + y) * size + ox) * 4)
  return out
}

function silhouette(rgba) {
  const out = new Uint8Array(rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    out[i] = SILHOUETTE[0]
    out[i + 1] = SILHOUETTE[1]
    out[i + 2] = SILHOUETTE[2]
    out[i + 3] = rgba[i + 3]
  }
  return out
}

function write(rel, size, rgba) {
  const png = encodePng(size, size, rgba)
  for (const p of PLATFORMS) {
    const f = path.join(OUT, p, rel)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, png)
  }
}

// ---------- main ----------
function main() {
  if (!fs.existsSync(ART)) {
    fs.mkdirSync(ART, { recursive: true })
    console.log('Made ' + ART + '. Put your creature PNGs there (e.g. embit.png) and run this again.')
    return
  }
  const ids = speciesIds()
  const files = fs.readdirSync(ART).filter((f) => /\.png$/i.test(f))
  const done = []
  const problems = []
  for (const f of files) {
    const m = /^([a-z]+)(\.right)?\.png$/i.exec(f)
    const id = m && m[1].toLowerCase()
    if (!id || ids.indexOf(id) < 0) {
      problems.push(f + ': not a creature name (expected e.g. embit.png). Skipped.')
      continue
    }
    if (ONLY && ONLY.indexOf(id) < 0) continue
    try {
      let img = readPng(path.join(ART, f))
      const keyed = removeBackground(img)
      img = trim(img)
      if (m[2] || opt('--right')) img = flip(img)
      // pixel art if it is small, or if asked; painted art is scaled smoothly
      const crisp = opt('--pixel') || (!opt('--smooth') && Math.max(img.w, img.h) <= 100)
      const big = fit(img, 128, crisp)
      write('mon/' + id + '.png', 128, big)
      write('mon/' + id + '_b.png', 112, fit(flip(img), 112, crisp))
      const small = fit(img, 64, crisp)
      write('mon/' + id + '_s.png', 64, small)
      write('mon/' + id + '_x.png', 64, silhouette(small))
      done.push(id + ' (' + img.w + 'x' + img.h + ', ' + (crisp ? 'pixel' : 'smooth') + (keyed ? ', background removed' : '') + (m[2] || opt('--right') ? ', flipped' : '') + ')')
    } catch (e) {
      problems.push(f + ': ' + e.message)
    }
  }
  console.log('Imported ' + done.length + ' creature(s)' + (done.length ? ':\n  ' + done.join('\n  ') : '.'))
  if (problems.length) console.log('Problems:\n  ' + problems.join('\n  '))
  const missing = ids.filter((id) => !files.some((f) => f.toLowerCase().startsWith(id + '.')))
  if (missing.length && missing.length < ids.length) console.log('Still using the old sprites (' + missing.length + '): ' + missing.join(', '))
  if (done.length) console.log('Next: node tools/sheet.cjs (to check them), then zeus build')
}

module.exports = { removeBackground, trim, flip, speciesIds }
if (require.main === module) main()
