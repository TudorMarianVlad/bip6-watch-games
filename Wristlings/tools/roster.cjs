// Builds docs/roster.html: every Wristling with its sprite, element, evolution,
// stats, how to meet it and its moves - straight from page/data.js, so it always
// matches the game. Evolution lines are grouped together.
//
// Run:  node tools/roster.cjs

const fs = require('fs')
const path = require('path')

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
const { ELEMENTS, MOVES, SPECIES, BOOK, STARTERS, BERRIES } = loadData()

const PRE = {}
for (const id in SPECIES) if (SPECIES[id].evo) PRE[SPECIES[id].evo] = id

const hex = (c) => '#' + c.toString(16).padStart(6, '0')
const img = (id) => 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'assets', 'default.s', 'mon', id + '.png')).toString('base64')
// where each creature's art stands: its own Gemini art, borrowing its first form's sprite, or the "?" egg
const sprite = (id) => fs.readFileSync(path.join(__dirname, '..', 'assets', 'default.s', 'mon', id + '.png'))
// the egg is the one sprite many creatures share
const EGG = (() => {
  const n = {}
  for (const id of BOOK) { const k = sprite(id).toString('base64'); n[k] = (n[k] || 0) + 1 }
  return Buffer.from(Object.keys(n).sort((a, b) => n[b] - n[a])[0], 'base64')
})()
function artState(id) {
  if (fs.existsSync(path.join(__dirname, '..', 'art', id + '.png'))) return 'done'
  if (sprite(id).equals(EGG)) return 'egg'
  if (PRE[id] && sprite(id).equals(sprite(PRE[id]))) return 'borrowed'
  return 'egg'
}
const ART_TAG = { done: '', borrowed: '<span class="tag art">needs art: uses first form</span>', egg: '<span class="tag art">needs art: egg</span>' }
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

// what each real-life condition (SPECIES[..].cond) means
const COND_TEXT = {
  rain: 'rainy or stormy days (watch forecast)',
  sun: 'sunny days, in daylight',
  kcal: '300 kcal burned today',
  weekend: 'weekend afternoons (Sat / Sun 12:00 - 18:00)',
  mist: 'fog or haze, or nights after 8,000 steps',
  north: 'the watch points NORTH when you explore',
  dawn: 'the watch points EAST, 05:00 - 09:00',
  compass: 'the watch has a working compass; in battle, face where it points or it gets away',
  dusk: 'the watch points WEST, 17:00 - 21:00',
  south: 'the watch points SOUTH, 11:00 - 15:00',
  spin: 'you turned a full circle on the den just before exploring',
  steady: 'you held the watch still one way on the den just before exploring',
  battery: 'the watch battery is under 20%',
  halloween: '25 Oct - 2 Nov',
  december: 'December',
  easter: 'Easter week, Palm Sunday to Easter Monday (Western or Orthodox Easter)',
  newyear: '31 Dec - 2 Jan',
  valentine: '12 - 16 Feb',
  midsummer: '19 - 25 Jun',
  friday13: 'any Friday the 13th'
}

function howToMeet(id) {
  const s = SPECIES[id]
  const out = []
  if (STARTERS.indexOf(id) >= 0) out.push('Starter choice')
  if (s.dream) out.push('Rare: a dream visitor after a night with lots of REM sleep')
  else if (id === 'solarion') out.push('Rare: only between 11:00 and 14:00')
  else if (id === 'boulderon') out.push('Rare: only after 10,000 steps in a day')
  else if (id === 'midnyx') out.push('Rare: only between 23:00 and 01:00')
  else if (id === 'pulsarex') out.push('Rare: only after 30 high-heart-rate minutes in a day')
  else if (id === 'selenyx') out.push('Rare: only at night around a full moon')
  else if (s.legend === 'steps') out.push('LEGEND (one per player): after 1,000,000 steps counted by the game')
  else if (s.legend === 'streak') out.push('LEGEND (one per player): after a 7-day streak of 5,000+ steps; if it faints it is back tomorrow')
  if (s.cond) out.push('Only while: ' + COND_TEXT[s.cond])
  if (s.time === 'night') out.push('Night only (20:00 - 06:00), 3x as likely then')
  if (PRE[id]) {
    const p = SPECIES[PRE[id]]
    out.push('Evolves from ' + p.name + ' at Lv ' + p.evoLv + (p.evoPai ? ' + ' + p.evoPai + ' weekly PAI' : '') + (p.evoSteps ? ' + ' + p.evoSteps.toLocaleString('en') + ' steps walked as lead' : '') + '. Also wild (rarely) once your lead is Lv ' + (PRE[PRE[id]] ? 28 : 13) + '+')
  } else if (!s.rare && !s.cond && !s.time && STARTERS.indexOf(id) < 0) out.push('Anywhere, any time')
  else if (STARTERS.indexOf(id) >= 0) out.push('Also wild anywhere')
  return out
}

// the catch rarity tier, same rule as rarityOf() in the game
function rarity(id) {
  const s = SPECIES[id]
  if (s.rare) return 'rare'
  if (PRE[id] || s.time || s.cond) return 'uncommon'
  return 'common'
}

function card(id) {
  const s = SPECIES[id]
  const el = ELEMENTS[s.el]
  const stats = ['hp', 'atk', 'def', 'spd']
    .map((k) => `<div class="stat"><span>${k.toUpperCase()}</span><div class="bar"><i style="width:${Math.round((s[k] / 110) * 100)}%"></i></div><b>${s[k]}</b></div>`)
    .join('')
  const moves = s.moves
    .map(([lv, m]) => {
      const mv = MOVES[m]
      const e = mv.el ? ELEMENTS[mv.el] : null
      const what = mv.kind === 'hit' ? mv.pow + ' pow' + (mv.acc < 100 ? ', ' + mv.acc + '%' : '') + (mv.status ? ', ' + Math.round(mv.chance * 100) + '% ' + mv.status : '') : mv.kind === 'guard' ? 'blocks 60%' : mv.kind === 'status' ? 'causes ' + mv.status + ', ' + mv.acc + '%' : 'heals ' + Math.round((mv.heal || 0.35) * 100) + '%'
      return `<li><em>Lv ${lv}</em> ${esc(mv.name)} <small style="color:${e ? hex(e.color) : '#aaa'}">${e ? e.name : 'NORMAL'}</small> <small>${what}</small></li>`
    })
    .join('')
  const evo = s.evo ? `<div class="evo">Evolves into <b>${esc(SPECIES[s.evo].name)}</b> at Lv ${s.evoLv}${s.evoPai ? ' + ' + s.evoPai + ' PAI' : ''}</div>` : ''
  const berry = BERRIES.find((b) => b.id === s.berry)
  return `<article class="card" data-id="${id}" data-name="${esc(s.name)}">
  <img src="${img(id)}" alt="${esc(s.name)}" width="128" height="128">
  <h3>${esc(s.name)}</h3>
  <div class="tags"><span class="el" style="background:${hex(el.color)}">${el.name}</span>${s.el2 ? '<span class="el" style="background:' + hex(ELEMENTS[s.el2].color) + '">' + ELEMENTS[s.el2].name + '</span>' : ''}${PRE[id] ? (s.evo ? '<span class="tag">middle</span>' : '<span class="tag">final</span>') : s.evo ? '<span class="tag">base</span>' : '<span class="tag">single</span>'}<span class="tag ${rarity(id)}">${s.legend ? 'legend' : rarity(id)}</span>${ART_TAG[artState(id)]}</div>
  ${evo}
  <div class="stats">${stats}</div>
  <h4>How to meet</h4><ul class="how">${howToMeet(id).map((t) => '<li>' + esc(t) + '</li>').join('')}</ul>
  <h4>Moves</h4><ul class="moves">${moves}</ul>
  <div class="berry">Favourite berry: <span style="color:${hex(berry.color)}">${berry.name}</span></div>
</article>`
}

// group each evolution line together, in book order
const seen = new Set()
const groups = []
for (const id of BOOK) {
  if (seen.has(id)) continue
  const line = [id]
  let cur = id
  while (SPECIES[cur].evo) {
    cur = SPECIES[cur].evo
    line.push(cur)
  }
  line.forEach((x) => seen.add(x))
  groups.push(line)
}

const ART = { done: 0, borrowed: 0, egg: 0 }
for (const id of BOOK) ART[artState(id)]++
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Wristlings Roster</title>
<style>
:root{--bg:#141026;--panel:#241d45;--edge:#4a3f8c;--text:#eee;--dim:#a8a0d8}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.4 system-ui,sans-serif;padding:16px}
header{position:sticky;top:0;background:var(--bg);padding:8px 0 12px;z-index:2;border-bottom:1px solid var(--edge);margin-bottom:16px}
h1{margin:0 0 4px;color:#ffd84d}header p{margin:0;color:var(--dim)}
.line{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px;padding:10px;border-radius:14px;background:#1b1638}
.card{position:relative;width:250px;background:var(--panel);border:2px solid var(--edge);border-radius:14px;padding:10px}
.card img{display:block;margin:0 auto;image-rendering:auto}
.card h3{margin:4px 0;text-align:center;font-size:18px}
.tags{text-align:center;margin-bottom:6px}.el,.tag{display:inline-block;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700;margin:0 2px;color:#111}
.tag{background:#3a3170;color:var(--dim)}.tag.art{background:#ff7a9a;color:#111}.tag.rare{background:#ffd84d;color:#111}.tag.uncommon{background:#4db8ff;color:#111}.tag.common{background:#3a3170;color:var(--dim)}
.evo{font-size:12px;color:var(--dim);text-align:center;margin-bottom:6px}
.stat{display:flex;align-items:center;gap:6px;font-size:11px}.stat span{width:28px;color:var(--dim)}.stat b{width:24px;text-align:right}
.bar{flex:1;height:6px;background:#0c0a1c;border-radius:3px}.bar i{display:block;height:100%;background:#4dd06a;border-radius:3px}
h4{margin:8px 0 2px;font-size:12px;color:#ffd84d}ul{margin:0;padding-left:16px;font-size:12px}
.moves em{color:var(--dim);font-style:normal}.moves small{color:var(--dim)}.berry{margin-top:6px;font-size:12px;color:var(--dim)}
</style></head><body>
<header><h1>Wristlings roster: ${BOOK.length} creatures</h1>
<p>Spoilers: every creature, how to meet it, its stats and moves. Stats are base stats (higher = better).</p>
<p>Art: ${ART.done} finished, ${ART.borrowed} middle forms borrowing their first form's sprite, ${ART.egg} still a "?" egg (pink tag = needs art).</p></header>
${groups.map((g) => `<section class="line">${g.map(card).join('')}</section>`).join('\n')}
</body></html>`

const outFile = path.join(__dirname, '..', 'docs', 'roster.html')
fs.writeFileSync(outFile, html)
console.log('wrote docs/roster.html with', BOOK.length, 'creatures in', groups.length, 'lines; art', JSON.stringify(ART))
