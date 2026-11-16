// Builds docs/roster.html: every Wristling with its sprite, element, evolution,
// stats, how to meet it and its moves - straight from page/data.js, so it always
// matches the game. Each card has a "cut" checkbox for reviewing the roster.
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
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

// what each real-life condition (SPECIES[..].cond) means
const COND_TEXT = {
  rain: 'rainy or stormy days (watch forecast)',
  sun: 'sunny days, in daylight',
  kcal: '300 kcal burned today',
  weekend: 'weekend afternoons (Sat / Sun 12:00 - 18:00)',
  dark: 'in the dark (watch light sensor under 10 lux)',
  mist: 'fog or haze, or nights after 8,000 steps',
  north: 'the watch points NORTH when you explore',
  dawn: 'the watch points EAST, 05:00 - 09:00',
  compass: 'the watch has a working compass; in battle, face where it points or it swims away'
}

function howToMeet(id) {
  const s = SPECIES[id]
  const out = []
  if (STARTERS.indexOf(id) >= 0) out.push('Starter choice')
  if (s.dream) out.push('Rare: a dream visitor after a night with lots of REM sleep')
  else if (id === 'solarion') out.push('Rare: only between 11:00 and 14:00')
  else if (id === 'boulderon') out.push('Rare: only after 10,000 steps in a day')
  if (s.cond) out.push('Only while: ' + COND_TEXT[s.cond])
  if (s.time === 'night') out.push('Night only (20:00 - 06:00), 3x as likely then')
  if (PRE[id]) {
    const p = SPECIES[PRE[id]]
    out.push('Evolves from ' + p.name + ' at Lv ' + p.evoLv + (p.evoPai ? ' + ' + p.evoPai + ' weekly PAI' : '') + '. Also wild (rarely) once your lead is Lv 13+')
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
      const what = mv.kind === 'hit' ? mv.pow + ' pow' + (mv.acc < 100 ? ', ' + mv.acc + '%' : '') : mv.kind === 'guard' ? 'blocks 60%' : 'heals ' + Math.round((mv.heal || 0.35) * 100) + '%'
      return `<li><em>Lv ${lv}</em> ${esc(mv.name)} <small style="color:${e ? hex(e.color) : '#aaa'}">${e ? e.name : 'NORMAL'}</small> <small>${what}</small></li>`
    })
    .join('')
  const evo = s.evo ? `<div class="evo">Evolves into <b>${esc(SPECIES[s.evo].name)}</b> at Lv ${s.evoLv}${s.evoPai ? ' + ' + s.evoPai + ' PAI' : ''}</div>` : ''
  const berry = BERRIES.find((b) => b.id === s.berry)
  return `<article class="card" data-id="${id}" data-name="${esc(s.name)}">
  <label class="cut"><input type="checkbox"> cut</label>
  <img src="${img(id)}" alt="${esc(s.name)}" width="128" height="128">
  <h3>${esc(s.name)}</h3>
  <div class="tags"><span class="el" style="background:${hex(el.color)}">${el.name}</span>${PRE[id] ? '<span class="tag">evolved</span>' : s.evo ? '<span class="tag">base</span>' : '<span class="tag">single</span>'}<span class="tag ${rarity(id)}">${rarity(id)}</span></div>
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

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Wristlings Roster</title>
<style>
:root{--bg:#141026;--panel:#241d45;--edge:#4a3f8c;--text:#eee;--dim:#a8a0d8}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.4 system-ui,sans-serif;padding:16px}
header{position:sticky;top:0;background:var(--bg);padding:8px 0 12px;z-index:2;border-bottom:1px solid var(--edge);margin-bottom:16px}
h1{margin:0 0 4px;color:#ffd84d}header p{margin:0;color:var(--dim)}
button{background:#3fbf5a;color:#fff;border:0;border-radius:8px;padding:8px 12px;font-weight:600;cursor:pointer;margin-top:8px}
textarea{width:100%;max-width:700px;height:60px;margin-top:8px;background:var(--panel);color:var(--text);border:1px solid var(--edge);border-radius:8px;padding:8px}
.line{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px;padding:10px;border-radius:14px;background:#1b1638}
.card{position:relative;width:250px;background:var(--panel);border:2px solid var(--edge);border-radius:14px;padding:10px}
.card.isCut{opacity:.45;border-color:#ff5c5c}
.card img{display:block;margin:0 auto;image-rendering:auto}
.card h3{margin:4px 0;text-align:center;font-size:18px}
.cut{position:absolute;top:8px;right:10px;color:#ff8a8a;font-size:12px;cursor:pointer}
.tags{text-align:center;margin-bottom:6px}.el,.tag{display:inline-block;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700;margin:0 2px;color:#111}
.tag{background:#3a3170;color:var(--dim)}.tag.rare{background:#ffd84d;color:#111}.tag.uncommon{background:#4db8ff;color:#111}.tag.common{background:#3a3170;color:var(--dim)}
.evo{font-size:12px;color:var(--dim);text-align:center;margin-bottom:6px}
.stat{display:flex;align-items:center;gap:6px;font-size:11px}.stat span{width:28px;color:var(--dim)}.stat b{width:24px;text-align:right}
.bar{flex:1;height:6px;background:#0c0a1c;border-radius:3px}.bar i{display:block;height:100%;background:#4dd06a;border-radius:3px}
h4{margin:8px 0 2px;font-size:12px;color:#ffd84d}ul{margin:0;padding-left:16px;font-size:12px}
.moves em{color:var(--dim);font-style:normal}.moves small{color:var(--dim)}.berry{margin-top:6px;font-size:12px;color:var(--dim)}
</style></head><body>
<header><h1>Wristlings roster: ${BOOK.length} creatures</h1>
<p>Stats are base stats (higher = better). Tick <b>cut</b> on any you want removed, then copy the list.</p>
<button id="copy">Copy my cut list</button> <span id="count" style="color:var(--dim)"></span>
<textarea id="out" readonly placeholder="Your cut list appears here"></textarea></header>
${groups.map((g) => `<section class="line">${g.map(card).join('')}</section>`).join('\n')}
<script>
const out=document.getElementById('out'),count=document.getElementById('count')
function update(){const cut=[...document.querySelectorAll('.card')].filter(c=>c.querySelector('input').checked)
document.querySelectorAll('.card').forEach(c=>c.classList.toggle('isCut',c.querySelector('input').checked))
out.value=cut.length?'Cut these Wristlings: '+cut.map(c=>c.dataset.name).join(', '):'';count.textContent=cut.length+' marked'}
document.querySelectorAll('.card input').forEach(i=>i.addEventListener('change',update))
document.getElementById('copy').onclick=()=>{update();out.select();try{navigator.clipboard.writeText(out.value)}catch(e){document.execCommand('copy')}}
update()
</script></body></html>`

const outFile = path.join(__dirname, '..', 'docs', 'roster.html')
fs.writeFileSync(outFile, html)
console.log('wrote docs/roster.html with', BOOK.length, 'creatures in', groups.length, 'lines')
