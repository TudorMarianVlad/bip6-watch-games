// Browser preview for the Bip 6 games: runs a game's page/index.js in your web browser with the
// Zepp OS APIs faked, so you can see and play it without the simulator.
//
//   node tools/preview.cjs "Neon Horizon"          builds tools/preview/Neon Horizon.html and opens it
//   node tools/preview.cjs "Neon Horizon" --no-open  only builds it
//
// Run it again after every code change (or press "Rebuild hint" in the page to see the command).
// It is only an approximation of the watch: speed, fonts and touch feel differ. Always check in the
// simulator / on the watch before you ship. Lives outside the game folders so `zeus build` never sees it.
const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')

const root = path.join(__dirname, '..')
const args = process.argv.slice(2)
const game = args.find((a) => !a.startsWith('--'))
if (!game) {
  const games = fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, 'page', 'index.js')))
  console.log('Usage: node tools/preview.cjs "<game folder>" [--no-open]\nGames: ' + games.join(', '))
  process.exit(1)
}
const gameDir = path.isAbsolute(game) ? game : path.join(root, game)
const pageDir = path.join(gameDir, 'page')
if (!fs.existsSync(path.join(pageDir, 'index.js'))) {
  console.error('No page/index.js in ' + gameDir)
  process.exit(1)
}

// ---------- bundle the page and its local imports ----------
const IMPORT_RE = /^\s*import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm
const zosNames = new Set()
const done = new Set()
const chunks = []
function bundle(file) {
  if (done.has(file)) return
  done.add(file)
  let src = fs.readFileSync(file, 'utf8')
  src = src.replace(IMPORT_RE, (m, names, from) => {
    if (from.startsWith('.')) {
      let dep = path.join(path.dirname(file), from)
      if (!dep.endsWith('.js')) dep += '.js'
      bundle(dep)
    } else {
      names.split(',').map((n) => n.trim().split(/\s+as\s+/).pop()).filter(Boolean).forEach((n) => zosNames.add(n))
    }
    return ''
  })
  src = src.replace(/^export\s+default\s+/gm, '').replace(/^export\s+(const|let|var|function|class)\s/gm, '$1 ')
  chunks.push('// ---- ' + path.relative(gameDir, file) + ' ----\n' + src)
}
bundle(path.join(pageDir, 'index.js'))

// ---------- embed the images ----------
const assetDir = path.join(gameDir, 'assets', 'default.s')
const images = {}
function walk(dir) {
  if (!fs.existsSync(dir)) return
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) walk(p)
    else if (/\.png$/i.test(f)) images[path.relative(assetDir, p).replace(/\\/g, '/')] = 'data:image/png;base64,' + fs.readFileSync(p).toString('base64')
  }
}
walk(assetDir)

// names the fake runtime below defines itself; anything else imported from @zos gets a stub
const KNOWN = new Set(['createWidget', 'deleteWidget', 'widget', 'event', 'prop', 'align', 'text_style', 'setStatusBarVisible', 'getDeviceInfo', 'setPageBrightTime', 'resetPageBrightTime', 'onGesture', 'offGesture', 'GESTURE_UP', 'GESTURE_DOWN', 'GESTURE_LEFT', 'GESTURE_RIGHT', 'LocalStorage', 'Time', 'Step', 'Accelerometer', 'HeartRate', 'Battery', 'Vibrator', 'px'])
const stubs = [...zosNames].filter((n) => !KNOWN.has(n)).map((n) => `const ${n} = __stub(${JSON.stringify(n)})`).join('\n')

const runtime = String.raw`
// ================= fake Zepp OS runtime =================
const W0 = 390, H0 = 450, CORNER = 86
const GAME = __GAME__
const IMG_SRC = __IMAGES__
const IMGS = {}
for (const k in IMG_SRC) { IMGS[k] = new Image(); IMGS[k].src = IMG_SRC[k] }
const S = { steps: 3000, hr: 72, tilt: { x: 0, y: 0 }, strict: true, mouseGestures: true }
const logBox = document.getElementById('log')
function log(msg, cls) {
  const d = document.createElement('div'); d.textContent = msg; if (cls) d.className = cls
  logBox.appendChild(d); while (logBox.childNodes.length > 300) logBox.removeChild(logBox.firstChild)
  logBox.scrollTop = logBox.scrollHeight
}
const _log = console.log.bind(console)
console.log = (...a) => { _log(...a); log(a.join(' ')) }
window.addEventListener('error', (e) => log('ERROR: ' + e.message, 'err'))
const warned = {}
function warnOnce(k, msg) { if (!warned[k]) { warned[k] = 1; log(msg, 'warn') } }

const widgets = []
const widget = new Proxy({}, { get: (t, k) => String(k) })
const prop = new Proxy({}, { get: (t, k) => String(k) })
const event = new Proxy({}, { get: (t, k) => String(k) })
const align = new Proxy({}, { get: (t, k) => String(k) })
const text_style = new Proxy({}, { get: (t, k) => String(k) })
const hex = (c) => '#' + ((c >>> 0) & 0xffffff).toString(16).padStart(6, '0')
const PROP_KEYS = { TEXT: 'text', COLOR: 'color', VISIBLE: 'visible', X: 'x', Y: 'y', W: 'w', H: 'h', SRC: 'src' }

function makeCanvas(w) {
  w.buf = document.createElement('canvas'); w.buf.width = w.w; w.buf.height = w.h
  const g = w.buf.getContext('2d')
  let paint = { color: 0xffffff, line_width: 1 }
  const api = {
    clear: () => g.clearRect(0, 0, w.buf.width, w.buf.height),
    setPaint: (p) => { paint = Object.assign({}, paint, p) },
    drawRect: (r) => {
      if (S.strict && (r.x2 <= r.x1 || r.y2 <= r.y1)) throw null // what the watch appears to do with empty rects
      g.fillStyle = hex(r.color !== undefined ? r.color : paint.color)
      g.fillRect(r.x1, r.y1, Math.max(1, r.x2 - r.x1), Math.max(1, r.y2 - r.y1))
    },
    strokeRect: (r) => { g.strokeStyle = hex(r.color !== undefined ? r.color : paint.color); g.lineWidth = paint.line_width; g.strokeRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1) },
    drawCircle: (c) => { g.fillStyle = hex(c.color !== undefined ? c.color : paint.color); g.beginPath(); g.arc(c.center_x, c.center_y, c.radius, 0, 7); g.fill() },
    strokeCircle: (c) => { g.strokeStyle = hex(c.color !== undefined ? c.color : paint.color); g.lineWidth = paint.line_width; g.beginPath(); g.arc(c.center_x, c.center_y, c.radius, 0, 7); g.stroke() },
    drawLine: (l) => { g.strokeStyle = hex(l.color !== undefined ? l.color : paint.color); g.lineWidth = paint.line_width; g.beginPath(); g.moveTo(l.x1, l.y1); g.lineTo(l.x2, l.y2); g.stroke() }
  }
  Object.assign(w, api)
}

function createWidget(type, opts) {
  const w = Object.assign({ type, visible: true, listeners: {} }, opts || {})
  if (w.w === undefined && w.radius !== undefined && type === 'CIRCLE') w.w = w.radius * 2
  if (type === 'CANVAS') makeCanvas(w)
  w.setProperty = (p, v) => {
    if (p === 'MORE') Object.assign(w, v)
    else if (PROP_KEYS[p]) w[PROP_KEYS[p]] = v
    else warnOnce('prop' + p, 'setProperty(prop.' + p + ') is not faked; ignored')
  }
  w.getProperty = (p) => (p === 'MORE' ? Object.assign({}, w) : w[PROP_KEYS[p] || p])
  w.addEventListener = (ev, fn) => { w.listeners[ev] = fn }
  w.removeEventListener = (ev) => { delete w.listeners[ev] }
  widgets.push(w)
  const handle = new Proxy(w, { get: (t, k) => (k in t ? t[k] : typeof k === 'string' ? () => warnOnce(type + k, type + '.' + k + '() is not faked; ignored') : undefined) })
  RAW.set(handle, w)
  return handle
}
const RAW = new WeakMap()
function deleteWidget(w) { const i = widgets.indexOf(RAW.get(w) || w); if (i >= 0) widgets.splice(i, 1) }
const setStatusBarVisible = () => {}
const getDeviceInfo = () => ({ width: W0, height: H0, screenShape: 0 })
const setPageBrightTime = () => {}, resetPageBrightTime = () => {}
const px = (v) => v
let gestureCb = null
const onGesture = (o) => { gestureCb = o && o.callback }
const offGesture = () => { gestureCb = null }
const GESTURE_UP = 1, GESTURE_DOWN = 2, GESTURE_LEFT = 3, GESTURE_RIGHT = 4
class LocalStorage {
  getItem(k, d) { const v = localStorage.getItem(GAME + ':' + k); return v === null ? d : JSON.parse(v) }
  setItem(k, v) { localStorage.setItem(GAME + ':' + k, JSON.stringify(v)) }
  removeItem(k) { localStorage.removeItem(GAME + ':' + k) }
  clear() { Object.keys(localStorage).filter((k) => k.startsWith(GAME + ':')).forEach((k) => localStorage.removeItem(k)) }
}
class Time {
  getTime() { return Date.now() }
  getFullYear() { return new Date().getFullYear() }
  getMonth() { return new Date().getMonth() + 1 }
  getDate() { return new Date().getDate() }
  getDay() { return new Date().getDay() }
  getHours() { return new Date().getHours() }
  getMinutes() { return new Date().getMinutes() }
  getSeconds() { return new Date().getSeconds() }
  onPerMinute() {} onPerDay() {}
}
function sensorClass(name, current) {
  return class {
    constructor() { return new Proxy(this, { get: (t, k) => (k === 'getCurrent' ? current : k in t ? t[k] : () => 0) }) }
  }
}
const Step = sensorClass('Step', () => S.steps)
const HeartRate = sensorClass('HeartRate', () => S.hr)
const Accelerometer = sensorClass('Accelerometer', () => ({ x: S.tilt.x * 980, y: S.tilt.y * 980, z: 980 }))
const Battery = sensorClass('Battery', () => 80) // a healthy battery (0 would mean "low" in Wristlings)
class Vibrator { start() { flashVibe() } stop() {} setMode() {} getConfig() { return [] } }
function __stub(name) {
  if (/^[A-Z0-9_]+$/.test(name)) return name // constants
  if (/^[A-Z]/.test(name)) { warnOnce(name, name + ' is faked: every method returns 0'); return sensorClass(name, () => 0) }
  return (...a) => { warnOnce(name, name + '() is faked and does nothing'); return undefined }
}
let page = null
function Page(p) { page = p }
function App() {}
function getApp() { return { _options: { globalData: {} } } }
`

const view = String.raw`
// ================= screen, input and controls =================
const scr = document.getElementById('s'), g = scr.getContext('2d')
function wrapLines(text, w) {
  const out = []
  String(text).split('\n').forEach((para) => {
    let line = ''
    para.split(' ').forEach((word) => {
      const t = line ? line + ' ' + word : word
      if (g.measureText(t).width > w && line) { out.push(line); line = word } else line = t
    })
    out.push(line)
  })
  return out
}
function draw() {
  g.save(); g.fillStyle = '#000'; g.fillRect(0, 0, W0, H0)
  g.beginPath(); g.roundRect(0, 0, W0, H0, CORNER); g.clip()
  for (const w of widgets) {
    if (!w.visible) continue
    const t = w.type
    if (t === 'FILL_RECT') { g.fillStyle = hex(w.color); g.beginPath(); g.roundRect(w.x, w.y, w.w, w.h, w.radius || 0); g.fill() }
    else if (t === 'STROKE_RECT') { g.strokeStyle = hex(w.color); g.lineWidth = w.line_width || 1; g.beginPath(); g.roundRect(w.x, w.y, w.w, w.h, w.radius || 0); g.stroke() }
    else if (t === 'CIRCLE') { g.fillStyle = hex(w.color); g.beginPath(); g.arc(w.center_x, w.center_y, w.radius, 0, 7); g.fill() }
    else if (t === 'CANVAS') g.drawImage(w.buf, w.x, w.y)
    else if (t === 'IMG' || t === 'IMAGE') {
      const im = IMGS[String(w.src || '').replace(/^\//, '')]
      if (im && im.complete) g.drawImage(im, w.x, w.y)
      else if (w.src) warnOnce('img' + w.src, 'image not found: ' + w.src)
    } else if ((t === 'TEXT' || t === 'BUTTON') && w.text !== undefined && w.text !== '') {
      g.fillStyle = hex(w.color !== undefined ? w.color : 0xffffff); g.font = (w.text_size || 20) + 'px Roboto, Arial, sans-serif'; g.textBaseline = 'middle'
      const lines = w.text_style === 'WRAP' ? wrapLines(w.text, w.w) : String(w.text).split('\n')
      const lh = (w.text_size || 20) * 1.25
      const blockH = lines.length * lh
      const top = w.align_v === 'CENTER_V' ? w.y + (w.h - blockH) / 2 : w.align_v === 'BOTTOM' ? w.y + w.h - blockH : w.y
      g.textAlign = w.align_h === 'LEFT' ? 'left' : w.align_h === 'RIGHT' ? 'right' : w.align_h === 'CENTER_H' ? 'center' : 'left'
      const x = g.textAlign === 'left' ? w.x : g.textAlign === 'right' ? w.x + w.w : w.x + w.w / 2
      g.save(); g.beginPath(); g.rect(w.x, w.y, w.w, w.h); g.clip()
      lines.forEach((l, i) => g.fillText(l, x, top + lh * i + lh / 2))
      g.restore()
    }
  }
  g.restore()
  requestAnimationFrame(draw)
}

function hit(w, x, y) {
  if (w.type === 'CIRCLE') return Math.hypot(x - w.center_x, y - w.center_y) <= w.radius
  return x >= w.x && y >= w.y && x < w.x + (w.w || 0) && y < w.y + (w.h || 0)
}
function target(ev, x, y) {
  for (let i = widgets.length - 1; i >= 0; i--) {
    const w = widgets[i]
    if (w.visible && w.listeners[ev] && hit(w, x, y)) return w
  }
  return null
}
const pos = (e) => { const r = scr.getBoundingClientRect(); return { x: Math.round((e.clientX - r.left) * W0 / r.width), y: Math.round((e.clientY - r.top) * H0 / r.height) } }
let downAt = null, downW = null
function call(fn, p) { try { fn(p) } catch (e) { log('ERROR in touch handler: ' + e, 'err') } }
scr.addEventListener('pointerdown', (e) => {
  scr.setPointerCapture(e.pointerId)
  const p = pos(e); downAt = p
  downW = target('CLICK_DOWN', p.x, p.y) || target('CLICK_UP', p.x, p.y)
  if (downW && downW.listeners.CLICK_DOWN) call(downW.listeners.CLICK_DOWN, p)
})
scr.addEventListener('pointermove', (e) => { if (downAt && downW && downW.listeners.MOVE) call(downW.listeners.MOVE, pos(e)) })
scr.addEventListener('pointerup', (e) => {
  if (!downAt) return
  const p = pos(e), dx = p.x - downAt.x, dy = p.y - downAt.y
  if (downW && downW.listeners.CLICK_UP) call(downW.listeners.CLICK_UP, p)
  downAt = null
  if (S.mouseGestures && Math.hypot(dx, dy) > 60) gesture(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
})
function gesture(dir) {
  const code = { up: GESTURE_UP, down: GESTURE_DOWN, left: GESTURE_LEFT, right: GESTURE_RIGHT }[dir]
  let handled = false
  try { handled = gestureCb ? gestureCb(code) : false } catch (e) { log('ERROR in gesture handler: ' + e, 'err') }
  if (!handled && dir === 'right') log('swipe right not handled: on the watch this would close the app', 'warn')
}
function flashVibe() { const v = document.getElementById('vibe'); v.style.opacity = 1; setTimeout(() => (v.style.opacity = 0), 150) }

// controls
const keys = { w: 'up', a: 'left', s: 'down', d: 'right' }
const held = {}
function updTilt() { S.tilt.x = (held.ArrowRight ? 0.4 : 0) - (held.ArrowLeft ? 0.4 : 0); S.tilt.y = (held.ArrowDown ? 0.4 : 0) - (held.ArrowUp ? 0.4 : 0); document.getElementById('tilt').textContent = 'x ' + S.tilt.x + '  y ' + S.tilt.y }
window.addEventListener('keydown', (e) => {
  if (keys[e.key]) gesture(keys[e.key])
  if (e.key.startsWith('Arrow')) { held[e.key] = true; updTilt(); e.preventDefault() }
})
window.addEventListener('keyup', (e) => { if (e.key.startsWith('Arrow')) { held[e.key] = false; updTilt() } })
document.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => gesture(b.dataset.g)))
document.getElementById('steps').addEventListener('click', () => { S.steps += 100; document.getElementById('stepv').textContent = S.steps })
document.getElementById('strict').addEventListener('change', (e) => (S.strict = e.target.checked))
document.getElementById('mg').addEventListener('change', (e) => (S.mouseGestures = e.target.checked))
document.getElementById('zoom').addEventListener('change', (e) => { scr.style.width = W0 * e.target.value + 'px'; scr.style.height = H0 * e.target.value + 'px' })
document.getElementById('reset').addEventListener('click', () => { if (confirm('Delete the saved data of ' + GAME + ' in this browser?')) { new LocalStorage().clear(); location.reload() } })
document.getElementById('reload').addEventListener('click', () => location.reload())
document.getElementById('stepv').textContent = S.steps

try {
  if (page && page.onInit) page.onInit()
  if (page && page.build) page.build()
  else log('This page never called Page({ build })', 'err')
} catch (e) { log('ERROR in build: ' + e, 'err') }
requestAnimationFrame(draw)
window.addEventListener('beforeunload', () => { try { page && page.onDestroy && page.onDestroy() } catch (e) {} })
`

const html = `<!doctype html><html><head><meta charset="utf-8"><title>${game} - Bip 6 preview</title>
<style>
body{background:#1b1b1f;color:#ddd;font:14px system-ui,sans-serif;margin:0;display:flex;gap:24px;padding:24px;flex-wrap:wrap}
#s{border-radius:${86}px;touch-action:none;box-shadow:0 0 0 10px #333,0 0 0 12px #555;cursor:pointer;width:585px;height:675px}
.panel{width:330px;display:flex;flex-direction:column;gap:12px}
h1{font-size:18px;margin:0;color:#fff} .box{background:#26262c;border-radius:10px;padding:10px 12px}
button{background:#3a3a44;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;margin:2px} button:hover{background:#4a4a58}
#log{height:220px;overflow:auto;font:12px Consolas,monospace;background:#111;border-radius:8px;padding:8px}
.err{color:#ff6b6b}.warn{color:#e8c46a} small{color:#999} kbd{background:#333;border-radius:3px;padding:0 4px}
#vibe{position:fixed;top:12px;left:12px;background:#ff3fd0;color:#000;padding:3px 8px;border-radius:6px;opacity:0;transition:opacity .15s}
</style></head><body>
<canvas id="s" width="390" height="450"></canvas>
<div class="panel">
<h1>${game}</h1>
<div class="box">Mouse = finger (click, hold, drag).<br>System swipes: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
<button data-g="up">↑</button><button data-g="left">←</button><button data-g="down">↓</button><button data-g="right">→</button><br>
<label><input type="checkbox" id="mg" checked> mouse drags also send system swipes</label><br>
Tilt (accelerometer): hold arrow keys <small id="tilt">x 0  y 0</small></div>
<div class="box">Steps today: <b id="stepv"></b> <button id="steps">+100 steps</button><br>
<label><input type="checkbox" id="strict" checked> strict canvas (empty drawRect throws, like the watch)</label><br>
Size <select id="zoom"><option value="1">1x (real pixels)</option><option value="1.5" selected>1.5x</option><option value="2">2x</option></select>
<button id="reload">Restart</button><button id="reset">Reset save</button></div>
<div class="box"><small>Log (console.log, errors, things the preview cannot fake)</small><div id="log"></div></div>
<small>After changing code run: node tools/preview.cjs "${game}" again, then Restart.<br>Speed, fonts and feel differ from the watch: always check there too.</small>
</div>
<div id="vibe">bzz</div>
<script>
${runtime.replace('__GAME__', JSON.stringify(game)).replace('__IMAGES__', JSON.stringify(images))}
;(function () {
// the game runs in its own function scope so its names never clash with the preview's
// (a plain { } block is not enough: function declarations inside it leak to the global scope)
${stubs}
${chunks.join('\n')}
})()
${view}
</script></body></html>`

const outDir = path.join(__dirname, 'preview')
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, path.basename(gameDir) + '.html')
fs.writeFileSync(out, html)
console.log('Preview written: ' + out + ' (' + Object.keys(images).length + ' images)')
if (!args.includes('--no-open')) {
  const cmd = process.platform === 'win32' ? 'start "" "' + out + '"' : process.platform === 'darwin' ? 'open "' + out + '"' : 'xdg-open "' + out + '"'
  exec(cmd)
}
