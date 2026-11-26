// Placeholder sprites: a "?" mystery egg for creatures whose art isn't made yet.
// It is clearly temporary; the real art replaces it through tools/import.cjs.
//
//   node tools/egg.cjs            gives every creature with no sprite at all the egg
//   node tools/egg.cjs id id ...  gives just those creatures the egg
//
// The egg is drawn into a temporary folder and imported from there, so art/ only ever
// holds real creature art.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { Canvas, text3d, textWidth, solid } = require('./ui.cjs')
const { encodePng } = require('./png.cjs')
const { speciesIds } = require('./import.cjs')

const ROOT = path.join(__dirname, '..')
const W = 200
const H = 240

function egg() {
  const cv = new Canvas(W, H)
  const cx = W / 2
  const cy = H / 2 + 6
  // outline, body, a darker lower half and a shine: an egg in the game's purple UI colours
  cv.ellipse(cx, cy, 84, 108, solid(0x1c1530))
  cv.ellipse(cx, cy, 78, 102, solid(0x6a5fb0))
  cv.ellipse(cx + 10, cy + 22, 64, 74, solid(0x4f4590, 0.8))
  cv.ellipse(cx - 30, cy - 52, 18, 26, solid(0xffffff, 0.35))
  // a few speckles
  for (const [x, y, r] of [[56, 150, 7], [140, 110, 6], [120, 190, 8], [70, 92, 5], [150, 168, 5]]) cv.ellipse(x, y, r, r, solid(0x8a80d0, 0.9))
  // the question mark, in the game's 3D pixel font
  const s = 9
  text3d(cv, '?', cx - textWidth('?', s) / 2, cy - 7 * s / 2, s, { top: 0xfffbe0, bottom: 0xffc531, side: 0xa0601a })
  return cv.out(false)
}

function main() {
  const ids = speciesIds()
  let want = process.argv.slice(2)
  if (!want.length) want = ids.filter((id) => !fs.existsSync(path.join(ROOT, 'assets', 'default.s', 'mon', id + '.png')))
  const bad = want.filter((id) => ids.indexOf(id) < 0)
  if (bad.length) throw new Error('not creature ids: ' + bad.join(', '))
  if (!want.length) return console.log('Every creature already has a sprite.')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wristlings-egg-'))
  const png = encodePng(W, H, egg())
  for (const id of want) fs.writeFileSync(path.join(tmp, id + '.png'), png)
  execFileSync(process.execPath, [path.join(__dirname, 'import.cjs'), '--art', tmp, '--smooth'], { stdio: 'ignore' })
  for (const id of want) fs.unlinkSync(path.join(tmp, id + '.png'))
  fs.rmdirSync(tmp)
  console.log('Egg placeholder for ' + want.length + ': ' + want.join(', '))
}

main()
