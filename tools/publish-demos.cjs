// Copies the browser previews (tools/preview/*.html) into docs/play/ so GitHub Pages can host them
// as playable demos.
//
//   node tools/preview.cjs "<game>" --no-open   (rebuild a game's preview first, if it changed)
//   node tools/publish-demos.cjs
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const src = path.join(__dirname, 'preview')
const out = path.join(root, 'docs', 'play')
fs.mkdirSync(out, { recursive: true })

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
for (const file of fs.readdirSync(src).filter((f) => f.endsWith('.html'))) {
  const target = slug(path.basename(file, '.html')) + '.html'
  fs.copyFileSync(path.join(src, file), path.join(out, target))
  console.log(file + '  ->  docs/play/' + target)
}

// app icons for the landing page (docs/ is the site root, so it can't reach the game folders)
const icons = path.join(root, 'docs', 'icons')
fs.mkdirSync(icons, { recursive: true })
for (const game of fs.readdirSync(root)) {
  const icon = path.join(root, game, 'assets', 'default.b', 'icon.png')
  if (fs.existsSync(icon)) fs.copyFileSync(icon, path.join(icons, slug(game) + '.png'))
}
