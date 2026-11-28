// Wristlings game data: elements, moves, species and berries.
// Change numbers here to tune the game; the page code reads everything from this file.

// ---------- elements ----------
export const ELEMENTS = {
  fire: { name: 'FIRE', color: 0xff7a3d },
  water: { name: 'WATER', color: 0x4aa8ff },
  grass: { name: 'GRASS', color: 0x5cc850 },
  electric: { name: 'ELECTRIC', color: 0xf5c518 },
  ice: { name: 'ICE', color: 0x7fcfff },
  air: { name: 'AIR', color: 0x9fb2ff },
  earth: { name: 'EARTH', color: 0xc8955a },
  shadow: { name: 'SHADOW', color: 0x9a7fe0 },
  light: { name: 'LIGHT', color: 0xffe9a0 }
}

// short names, for creatures with two elements (WATER/ELEC)
export const SHORT = { fire: 'FIRE', water: 'WATER', grass: 'GRASS', electric: 'ELEC', ice: 'ICE', air: 'AIR', earth: 'EARTH', shadow: 'SHADOW', light: 'LIGHT' }

// attacker element -> the elements it hits for x1.5
// (the reverse direction, and the same element, hit for x0.67)
export const STRONG = {
  fire: ['grass', 'ice', 'shadow'],
  water: ['fire', 'earth'],
  grass: ['water', 'earth', 'electric'],
  electric: ['water', 'air'],
  ice: ['grass', 'air', 'earth'],
  earth: ['fire', 'electric', 'light'],
  air: ['grass', 'light'],
  shadow: ['air', 'light'],
  light: ['shadow', 'ice']
}

// targetEl2: a creature's second element, if it has one. Both count, multiplied, but the result
// stays within one normal bonus (1.5x) or one normal weakness (0.67x): no 2.25x one-shots.
export function effectiveness(moveEl, targetEl, targetEl2) {
  if (!moveEl) return 1
  let m = 1
  for (const t of [targetEl, targetEl2]) {
    if (!t) continue
    if (STRONG[moveEl].indexOf(t) >= 0) m *= 1.5
    else if (moveEl === t || STRONG[t].indexOf(moveEl) >= 0) m *= 0.67
  }
  return Math.min(1.5, Math.max(0.67, m))
}

// a creature's elements: [el] or [el, el2]
export function elementsOf(sp) {
  return sp.el2 ? [sp.el, sp.el2] : [sp.el]
}

// ---------- moves ----------
// pow: power (0 = no damage), acc: % chance to hit, kind: 'hit' | 'guard' | 'heal' | 'status'
// status / chance: a hit may also cause a status ('burn', 'freeze', 'sleep'); a 'status' move only causes one
// prio: moves with higher prio go first
export const MOVES = {
  tackle: { name: 'Bump', el: null, pow: 40, acc: 100, kind: 'hit' },
  guard: { name: 'Guard', el: null, pow: 0, acc: 100, kind: 'guard', prio: 1 },
  rest: { name: 'Breather', el: null, pow: 0, acc: 100, kind: 'heal' },

  ember: { name: 'Flicker', el: 'fire', pow: 55, acc: 100, kind: 'hit', status: 'burn', chance: 0.1 },
  flare: { name: 'Flare Dash', el: 'fire', pow: 85, acc: 85, kind: 'hit', status: 'burn', chance: 0.2 },
  splash: { name: 'Splash Jet', el: 'water', pow: 55, acc: 100, kind: 'hit' },
  tidal: { name: 'Tidal Crash', el: 'water', pow: 85, acc: 85, kind: 'hit' },
  leaf: { name: 'Leaf Toss', el: 'grass', pow: 55, acc: 100, kind: 'hit' },
  thorn: { name: 'Thorn Burst', el: 'grass', pow: 85, acc: 85, kind: 'hit' },
  zap: { name: 'Spark', el: 'electric', pow: 55, acc: 100, kind: 'hit' },
  arc: { name: 'Thunder Arc', el: 'electric', pow: 85, acc: 85, kind: 'hit' },
  frost: { name: 'Frost Bite', el: 'ice', pow: 55, acc: 100, kind: 'hit', status: 'freeze', chance: 0.1 },
  howl: { name: 'Ice Storm', el: 'ice', pow: 85, acc: 85, kind: 'hit', status: 'freeze', chance: 0.2 },
  gust: { name: 'Breeze', el: 'air', pow: 55, acc: 100, kind: 'hit' },
  dive: { name: 'Sky Dive', el: 'air', pow: 85, acc: 85, kind: 'hit' },
  pebble: { name: 'Pebble Shot', el: 'earth', pow: 55, acc: 100, kind: 'hit' },
  quake: { name: 'Quake Slam', el: 'earth', pow: 85, acc: 85, kind: 'hit' },
  hex: { name: 'Shade', el: 'shadow', pow: 55, acc: 100, kind: 'hit' },
  terror: { name: 'Night Terror', el: 'shadow', pow: 85, acc: 85, kind: 'hit' },
  glow: { name: 'Glow', el: 'light', pow: 55, acc: 100, kind: 'hit' },
  radiance: { name: 'Radiance', el: 'light', pow: 85, acc: 85, kind: 'hit' },
  // signature moves of the newer lines (some hit another element for coverage)
  pinch: { name: 'Rock Pinch', el: 'earth', pow: 60, acc: 95, kind: 'hit' },
  glide: { name: 'Static Glide', el: 'electric', pow: 70, acc: 95, kind: 'hit' },
  slide: { name: 'Belly Slide', el: 'water', pow: 60, acc: 100, kind: 'hit' },
  wingbite: { name: 'Wing Bite', el: 'air', pow: 60, acc: 100, kind: 'hit' },
  roar: { name: 'Solar Roar', el: 'fire', pow: 95, acc: 80, kind: 'hit', status: 'burn', chance: 0.2 },
  boulder: { name: 'Boulder Toss', el: 'earth', pow: 95, acc: 80, kind: 'hit' },
  moonclaw: { name: 'Moon Claw', el: 'ice', pow: 60, acc: 100, kind: 'hit', status: 'freeze', chance: 0.1 },
  staticrain: { name: 'Static Rain', el: 'electric', pow: 60, acc: 100, kind: 'hit' },
  sunburst: { name: 'Sunburst', el: 'fire', pow: 60, acc: 100, kind: 'hit', status: 'burn', chance: 0.1 },
  mudroll: { name: 'Mud Roll', el: 'earth', pow: 60, acc: 100, kind: 'hit' },
  // heal: how much of max HP a healing move restores (Breather uses the default)
  nap: { name: 'Long Nap', el: null, pow: 0, acc: 100, kind: 'heal', heal: 0.5 },
  // puts the foe to sleep
  lullaby: { name: 'Lullaby', el: 'air', pow: 0, acc: 75, kind: 'status', status: 'sleep' }
}

// the moves a creature of each element learns, by level
function learnset(weak, strong, util) {
  return [
    [1, 'tackle'],
    [1, weak],
    [7, util],
    [14, strong]
  ]
}

// newer lines also learn a signature move at Lv 10
function learnset2(weak, strong, util, sig) {
  return [
    [1, 'tackle'],
    [1, weak],
    [7, util],
    [10, sig],
    [16, strong]
  ]
}

// ---------- species ----------
// base stats: hp, atk, def, spd. evo / evoLv: what it becomes and when.
// Evolution lines have three stages: first form -> middle form (Lv 12-16) -> final form (Lv 28).
// berry: its favourite berry (players find out by trying).
// time: 'night' = only met between 20:00 and 06:00. dream = only met after a good night's sleep.
// rare: never in the normal wild mix; legends, the dream visitor and the RARES in index.js.
// cond: only met while something is true in real life:
//   'weekend' (Sat / Sun 12:00 - 18:00), 'rain' / 'sun' (today's
//   weather), 'kcal' (you burned KCAL_SPAWN calories today),
//   'mist' (fog / haze, or a night after MIST_NIGHT_STEPS steps).
//   'north' (the top of the watch points north), 'dawn' (points east, 05:00 - 09:00),
//   'compass' (the watch has a working compass).
// condWeight: how many times as likely while the condition is true (default COND_WEIGHT).
//   'dusk' (points west, 17:00 - 21:00), 'south' (points south, 11:00 - 15:00),
//   'spin' (you turned a full circle on the den just before exploring), 'steady' (you held one
//   heading on the den just before exploring), 'battery' (watch battery is low),
//   'halloween' (25 Oct - 2 Nov), 'december', 'easter' (Palm Sunday to Easter Monday, Western or
//   Orthodox), 'newyear' (31 Dec - 2 Jan), 'valentine' (12 - 16 Feb), 'midsummer' (19 - 25 Jun),
//   'friday13' (any Friday the 13th).
// el2: a second element. legend: 'steps' (after LEGEND_STEPS steps in the game) or 'streak'
//   (after a STREAK_DAYS-day walking streak); one per player.
// evoPai: evolves when your weekly PAI reaches this (as well as the level).
// flee: how a compass creature leaves battle when you do not face it (default 'swam away').
// evoSteps: evolves once it has walked this many steps as your lead (as well as the level).
export const SPECIES = {
  embit: { name: 'Embit', el: 'fire', hp: 44, atk: 54, def: 40, spd: 58, evo: 'blazetail', evoLv: 14, berry: 'red', moves: learnset('ember', 'flare', 'guard') },
  blazetail: { name: 'Blazetail', el: 'fire', hp: 58, atk: 71, def: 51, spd: 74, evo: 'cindervix', evoLv: 28, berry: 'red', moves: learnset('ember', 'flare', 'guard') },
  cindervix: { name: 'Cindervix', el: 'fire', hp: 72, atk: 88, def: 62, spd: 90, berry: 'gold', moves: learnset('ember', 'flare', 'guard') },
  puddlop: { name: 'Puddlop', el: 'water', hp: 52, atk: 44, def: 50, spd: 40, evo: 'puddleap', evoLv: 14, berry: 'green', moves: learnset('splash', 'tidal', 'rest') },
  puddleap: { name: 'Puddleap', el: 'water', hp: 71, atk: 60, def: 66, spd: 48, evo: 'torrentoad', evoLv: 28, berry: 'blue', moves: learnset('splash', 'tidal', 'rest') },
  torrentoad: { name: 'Torrentoad', el: 'water', hp: 90, atk: 76, def: 82, spd: 56, berry: 'blue', moves: learnset('splash', 'tidal', 'rest') },
  sprig: { name: 'Sprig', el: 'grass', hp: 48, atk: 44, def: 52, spd: 46, evo: 'budnip', evoLv: 14, berry: 'blue', moves: learnset('leaf', 'thorn', 'rest') },
  budnip: { name: 'Budnip', el: 'grass', hp: 69, atk: 61, def: 70, spd: 47, evo: 'mossmaw', evoLv: 28, berry: 'green', moves: learnset('leaf', 'thorn', 'rest') },
  mossmaw: { name: 'Mossmaw', el: 'grass', hp: 90, atk: 78, def: 88, spd: 48, berry: 'red', moves: learnset('leaf', 'thorn', 'rest') },
  zippet: { name: 'Zippet', el: 'electric', hp: 40, atk: 50, def: 38, spd: 66, evo: 'buzzhorn', evoLv: 15, berry: 'gold', moves: learnset('zap', 'arc', 'guard') },
  buzzhorn: { name: 'Buzzhorn', el: 'electric', hp: 53, atk: 70, def: 53, spd: 74, evo: 'arcbeetle', evoLv: 28, berry: 'gold', moves: learnset('zap', 'arc', 'guard') },
  arcbeetle: { name: 'Arcbeetle', el: 'electric', hp: 66, atk: 90, def: 68, spd: 82, berry: 'green', moves: learnset('zap', 'arc', 'guard') },
  snowpup: { name: 'Snowpup', el: 'ice', hp: 46, atk: 48, def: 44, spd: 54, evo: 'rimecub', evoLv: 15, berry: 'red', moves: learnset('frost', 'howl', 'guard') },
  rimecub: { name: 'Rimecub', el: 'ice', hp: 59, atk: 67, def: 54, spd: 69, evo: 'frostfang', evoLv: 28, berry: 'blue', moves: learnset('frost', 'howl', 'guard') },
  frostfang: { name: 'Frostfang', el: 'ice', hp: 72, atk: 86, def: 64, spd: 84, berry: 'blue', moves: learnset('frost', 'howl', 'guard') },
  fluffin: { name: 'Fluffin', el: 'air', hp: 44, atk: 42, def: 42, spd: 62, evo: 'gustling', evoLv: 15, berry: 'green', moves: learnset('gust', 'dive', 'rest') },
  gustling: { name: 'Gustling', el: 'air', hp: 56, atk: 62, def: 50, spd: 80, evo: 'galehawk', evoLv: 28, berry: 'red', moves: learnset('gust', 'dive', 'rest') },
  galehawk: { name: 'Galehawk', el: 'air', hp: 68, atk: 82, def: 58, spd: 98, berry: 'red', moves: learnset('gust', 'dive', 'rest') },
  pebblet: { name: 'Pebblet', el: 'earth', hp: 52, atk: 46, def: 58, spd: 34, evo: 'rubbler', evoLv: 15, berry: 'blue', moves: learnset('pebble', 'quake', 'guard') },
  rubbler: { name: 'Rubbler', el: 'earth', hp: 69, atk: 65, def: 77, spd: 37, evo: 'cragmole', evoLv: 28, berry: 'green', moves: learnset('pebble', 'quake', 'guard') },
  cragmole: { name: 'Cragmole', el: 'earth', hp: 86, atk: 84, def: 96, spd: 40, berry: 'gold', moves: learnset('pebble', 'quake', 'guard') },
  gloomlet: { name: 'Gloomlet', el: 'shadow', hp: 42, atk: 54, def: 40, spd: 56, evo: 'shadeling', evoLv: 16, berry: 'green', time: 'night', moves: learnset('hex', 'terror', 'rest') },
  shadeling: { name: 'Shadeling', el: 'shadow', hp: 56, atk: 73, def: 50, spd: 69, evo: 'duskwraith', evoLv: 28, berry: 'red', time: 'night', moves: learnset('hex', 'terror', 'rest') },
  duskwraith: { name: 'Duskwraith', el: 'shadow', hp: 70, atk: 92, def: 60, spd: 82, berry: 'red', time: 'night', moves: learnset('hex', 'terror', 'rest') },
  // compass: each one needs you to do something with the watch's compass on the den
  gloamstag: { name: 'Gloamstag', el: 'light', hp: 64, atk: 72, def: 58, spd: 78, berry: 'gold', cond: 'dusk', moves: learnset2('glow', 'radiance', 'rest', 'gust') },
  sunquill: { name: 'Sunquill', el: 'light', hp: 68, atk: 66, def: 74, spd: 58, berry: 'red', cond: 'south', moves: learnset2('glow', 'radiance', 'guard', 'ember') },
  whirlwisp: { name: 'Whirlwisp', el: 'air', hp: 52, atk: 66, def: 46, spd: 92, berry: 'blue', cond: 'spin', moves: learnset2('gust', 'dive', 'guard', 'zap') },
  stillbill: { name: 'Stillbill', el: 'water', hp: 70, atk: 74, def: 60, spd: 62, berry: 'green', cond: 'steady', moves: learnset2('splash', 'tidal', 'rest', 'wingbite') },
  // battery: a snail that is hungry for power; its last step charges by walking
  ampsnail: { name: 'Ampsnail', el: 'electric', hp: 52, atk: 40, def: 62, spd: 30, evo: 'voltsnail', evoLv: 15, berry: 'gold', cond: 'battery', moves: learnset2('zap', 'arc', 'guard', 'pinch') },
  voltsnail: { name: 'Voltsnail', el: 'electric', hp: 68, atk: 60, def: 80, spd: 38, evo: 'dynamollusk', evoLv: 28, evoSteps: 20000, berry: 'blue', cond: 'battery', moves: learnset2('zap', 'arc', 'guard', 'pinch') },
  dynamollusk: { name: 'Dynamollusk', el: 'electric', hp: 86, atk: 82, def: 100, spd: 46, berry: 'gold', cond: 'battery', moves: learnset2('zap', 'arc', 'guard', 'pinch') },
  // calendar
  pumpkling: { name: 'Pumpkling', el: 'grass', hp: 50, atk: 48, def: 50, spd: 42, evo: 'gourdgrin', evoLv: 14, berry: 'red', cond: 'halloween', moves: learnset2('leaf', 'thorn', 'rest', 'hex') },
  gourdgrin: { name: 'Gourdgrin', el: 'grass', hp: 68, atk: 68, def: 66, spd: 50, evo: 'jackolord', evoLv: 28, berry: 'green', cond: 'halloween', moves: learnset2('leaf', 'thorn', 'rest', 'hex') },
  jackolord: { name: 'Jackolord', el: 'grass', el2: 'shadow', hp: 86, atk: 90, def: 80, spd: 60, berry: 'gold', cond: 'halloween', moves: learnset2('leaf', 'thorn', 'rest', 'hex') },
  frostjay: { name: 'Frostjay', el: 'ice', hp: 56, atk: 68, def: 52, spd: 86, berry: 'blue', cond: 'december', moves: learnset2('frost', 'howl', 'guard', 'wingbite') },
  // holidays
  eggling: { name: 'Eggling', el: 'light', hp: 54, atk: 46, def: 70, spd: 44, berry: 'gold', cond: 'easter', moves: learnset2('glow', 'radiance', 'guard', 'gust') },
  woolamb: { name: 'Woolamb', el: 'grass', hp: 68, atk: 50, def: 64, spd: 48, berry: 'green', cond: 'easter', moves: learnset2('leaf', 'thorn', 'rest', 'glow') },
  glimmerpine: { name: 'Glimmerpine', el: 'grass', el2: 'light', hp: 72, atk: 66, def: 76, spd: 40, berry: 'red', cond: 'december', moves: learnset2('leaf', 'thorn', 'guard', 'glow') },
  novapop: { name: 'Novapop', el: 'fire', el2: 'light', hp: 50, atk: 78, def: 44, spd: 84, berry: 'gold', cond: 'newyear', moves: learnset2('ember', 'flare', 'guard', 'radiance') },
  heartwing: { name: 'Heartwing', el: 'air', hp: 56, atk: 60, def: 50, spd: 82, berry: 'red', cond: 'valentine', moves: learnset2('gust', 'dive', 'rest', 'glow') },
  glowfly: { name: 'Glowfly', el: 'electric', el2: 'light', hp: 48, atk: 62, def: 44, spd: 88, berry: 'green', cond: 'midsummer', time: 'night', moves: learnset2('zap', 'arc', 'guard', 'glow') },
  jinxcrow: { name: 'Jinxcrow', el: 'shadow', hp: 58, atk: 74, def: 50, spd: 80, berry: 'blue', cond: 'friday13', moves: learnset2('hex', 'terror', 'guard', 'wingbite') },
  // round 3: a second line for rain, sun, calories, compass and battery
  sprinkit: { name: 'Sprinkit', el: 'grass', hp: 48, atk: 44, def: 50, spd: 46, evo: 'dewcap', evoLv: 14, berry: 'green', cond: 'rain', moves: learnset2('leaf', 'thorn', 'rest', 'splash') },
  dewcap: { name: 'Dewcap', el: 'grass', hp: 63, atk: 62, def: 65, spd: 58, evo: 'mossoon', evoLv: 28, berry: 'blue', cond: 'rain', moves: learnset2('leaf', 'thorn', 'rest', 'splash') },
  mossoon: { name: 'Mossoon', el: 'grass', el2: 'water', hp: 78, atk: 80, def: 80, spd: 70, berry: 'green', cond: 'rain', moves: learnset2('leaf', 'thorn', 'rest', 'splash') },
  basklet: { name: 'Basklet', el: 'fire', hp: 44, atk: 52, def: 46, spd: 50, evo: 'baskadon', evoLv: 15, berry: 'red', cond: 'sun', moves: learnset2('ember', 'flare', 'guard', 'pebble') },
  baskadon: { name: 'Baskadon', el: 'fire', hp: 61, atk: 71, def: 62, spd: 61, evo: 'solaurus', evoLv: 28, berry: 'gold', cond: 'sun', moves: learnset2('ember', 'flare', 'guard', 'pebble') },
  solaurus: { name: 'Solaurus', el: 'fire', el2: 'earth', hp: 78, atk: 90, def: 78, spd: 72, berry: 'red', cond: 'sun', moves: learnset2('ember', 'flare', 'guard', 'pebble') },
  hoofit: { name: 'Hoofit', el: 'earth', hp: 54, atk: 52, def: 50, spd: 38, evo: 'hoofstomp', evoLv: 15, berry: 'green', cond: 'kcal', moves: learnset2('pebble', 'quake', 'guard', 'zap') },
  hoofstomp: { name: 'Hoofstomp', el: 'earth', hp: 70, atk: 71, def: 68, spd: 50, evo: 'thundrox', evoLv: 28, berry: 'gold', cond: 'kcal', moves: learnset2('pebble', 'quake', 'guard', 'zap') },
  thundrox: { name: 'Thundrox', el: 'earth', el2: 'electric', hp: 86, atk: 90, def: 86, spd: 62, berry: 'green', cond: 'kcal', moves: learnset2('pebble', 'quake', 'guard', 'zap') },
  roamkit: { name: 'Roamkit', el: 'air', hp: 46, atk: 48, def: 44, spd: 58, evo: 'roamfox', evoLv: 15, berry: 'blue', cond: 'compass', condWeight: 1, flee: 'ran off', moves: learnset2('gust', 'dive', 'rest', 'pebble') },
  roamfox: { name: 'Roamfox', el: 'air', hp: 61, atk: 65, def: 57, spd: 75, evo: 'meridyx', evoLv: 28, berry: 'red', cond: 'compass', condWeight: 1, flee: 'ran off', moves: learnset2('gust', 'dive', 'rest', 'pebble') },
  meridyx: { name: 'Meridyx', el: 'air', el2: 'earth', hp: 76, atk: 82, def: 70, spd: 92, berry: 'blue', cond: 'compass', condWeight: 1, flee: 'ran off', moves: learnset2('gust', 'dive', 'rest', 'pebble') },
  dimwick: { name: 'Dimwick', el: 'shadow', hp: 44, atk: 54, def: 42, spd: 48, evo: 'flickwick', evoLv: 15, berry: 'gold', cond: 'battery', moves: learnset2('hex', 'terror', 'rest', 'ember') },
  flickwick: { name: 'Flickwick', el: 'shadow', hp: 60, atk: 71, def: 56, spd: 61, evo: 'snuffwick', evoLv: 28, berry: 'red', cond: 'battery', moves: learnset2('hex', 'terror', 'rest', 'ember') },
  snuffwick: { name: 'Snuffwick', el: 'shadow', el2: 'fire', hp: 76, atk: 88, def: 70, spd: 74, berry: 'gold', cond: 'battery', moves: learnset2('hex', 'terror', 'rest', 'ember') },
  // round 3: a second single for mist, north, dawn, dusk, south, spin, steady, weekend, Halloween
  mistkoi: { name: 'Mistkoi', el: 'water', hp: 62, atk: 64, def: 58, spd: 76, berry: 'blue', cond: 'mist', moves: learnset2('splash', 'tidal', 'rest', 'hex') },
  borealynx: { name: 'Borealynx', el: 'ice', el2: 'light', hp: 66, atk: 74, def: 58, spd: 82, berry: 'blue', cond: 'north', moves: learnset2('frost', 'howl', 'guard', 'glow') },
  roostar: { name: 'Roostar', el: 'fire', hp: 58, atk: 70, def: 52, spd: 80, berry: 'gold', cond: 'dawn', moves: learnset2('ember', 'flare', 'rest', 'wingbite') },
  duskadillo: { name: 'Duskadillo', el: 'earth', hp: 70, atk: 60, def: 88, spd: 44, berry: 'green', cond: 'dusk', moves: learnset2('pebble', 'quake', 'guard', 'hex') },
  siesturtle: { name: 'Siesturtle', el: 'water', hp: 80, atk: 56, def: 84, spd: 30, berry: 'green', cond: 'south', moves: [[1, 'tackle'], [1, 'splash'], [1, 'nap'], [10, 'mudroll'], [16, 'tidal']] },
  whirlnut: { name: 'Whirlnut', el: 'grass', hp: 54, atk: 68, def: 62, spd: 80, berry: 'red', cond: 'spin', moves: learnset2('leaf', 'thorn', 'guard', 'gust') },
  pandaze: { name: 'Pandaze', el: 'earth', hp: 88, atk: 70, def: 80, spd: 34, berry: 'green', cond: 'steady', moves: learnset2('pebble', 'quake', 'rest', 'leaf') },
  snackoon: { name: 'Snackoon', el: 'earth', hp: 64, atk: 62, def: 60, spd: 72, berry: 'gold', cond: 'weekend', moves: learnset2('pebble', 'quake', 'rest', 'hex') },
  boolet: { name: 'Boolet', el: 'shadow', el2: 'air', hp: 52, atk: 66, def: 48, spd: 84, berry: 'blue', cond: 'halloween', moves: learnset2('hex', 'terror', 'guard', 'gust') },
  // round 3 rares (when: see RARES in index.js)
  midnyx: { name: 'Midnyx', el: 'shadow', el2: 'ice', hp: 78, atk: 96, def: 70, spd: 92, berry: 'blue', rare: true, moves: [[1, 'hex'], [1, 'guard'], [16, 'terror'], [18, 'moonclaw']] },
  pulsarex: { name: 'Pulsarex', el: 'fire', el2: 'electric', hp: 82, atk: 100, def: 70, spd: 86, berry: 'red', rare: true, moves: [[1, 'ember'], [1, 'zap'], [1, 'guard'], [16, 'flare'], [18, 'arc']] },
  selenyx: { name: 'Selenyx', el: 'light', hp: 84, atk: 84, def: 86, spd: 80, berry: 'gold', rare: true, moves: [[1, 'glow'], [1, 'guard'], [12, 'lullaby'], [16, 'radiance'], [18, 'moonclaw']] },
  lullamoth: { name: 'Lullamoth', el: 'air', hp: 62, atk: 56, def: 58, spd: 64, berry: 'gold', dream: true, rare: true,
    moves: [[1, 'gust'], [1, 'hex'], [1, 'rest'], [14, 'lullaby'], [18, 'dive']] },
  shellby: { name: 'Shellby', el: 'water', hp: 50, atk: 46, def: 62, spd: 34, evo: 'reefling', evoLv: 16, berry: 'red', moves: learnset2('splash', 'tidal', 'guard', 'pinch') },
  reefling: { name: 'Reefling', el: 'water', hp: 67, atk: 68, def: 81, spd: 37, evo: 'coralclaw', evoLv: 28, berry: 'green', moves: learnset2('splash', 'tidal', 'guard', 'pinch') },
  coralclaw: { name: 'Coralclaw', el: 'water', el2: 'earth', hp: 84, atk: 90, def: 100, spd: 40, berry: 'gold', moves: learnset2('splash', 'tidal', 'guard', 'pinch') },
  sparkit: { name: 'Sparkit', el: 'electric', hp: 40, atk: 44, def: 38, spd: 72, evo: 'glidekit', evoLv: 15, berry: 'blue', moves: learnset2('zap', 'arc', 'rest', 'glide') },
  glidekit: { name: 'Glidekit', el: 'electric', hp: 52, atk: 62, def: 48, spd: 89, evo: 'voltglider', evoLv: 28, berry: 'red', moves: learnset2('zap', 'arc', 'rest', 'glide') },
  voltglider: { name: 'Voltglider', el: 'electric', hp: 64, atk: 80, def: 58, spd: 106, berry: 'gold', moves: learnset2('zap', 'arc', 'rest', 'glide') },
  pipfrost: { name: 'Pipfrost', el: 'ice', hp: 50, atk: 42, def: 50, spd: 42, evo: 'icesquire', evoLv: 16, berry: 'blue', moves: learnset2('frost', 'howl', 'rest', 'slide') },
  icesquire: { name: 'Icesquire', el: 'ice', hp: 72, atk: 62, def: 69, spd: 44, evo: 'glacieron', evoLv: 28, berry: 'red', moves: learnset2('frost', 'howl', 'rest', 'slide') },
  glacieron: { name: 'Glacieron', el: 'ice', hp: 94, atk: 82, def: 88, spd: 46, berry: 'green', moves: learnset2('frost', 'howl', 'rest', 'slide') },
  nibbat: { name: 'Nibbat', el: 'shadow', hp: 40, atk: 50, def: 38, spd: 66, evo: 'flitfang', evoLv: 15, berry: 'red', time: 'night', moves: learnset2('hex', 'terror', 'guard', 'wingbite') },
  flitfang: { name: 'Flitfang', el: 'shadow', hp: 54, atk: 68, def: 48, spd: 82, evo: 'vesperwing', evoLv: 28, berry: 'green', time: 'night', moves: learnset2('hex', 'terror', 'guard', 'wingbite') },
  vesperwing: { name: 'Vesperwing', el: 'shadow', hp: 68, atk: 86, def: 58, spd: 98, berry: 'blue', time: 'night', moves: learnset2('hex', 'terror', 'guard', 'wingbite') },
  // legends: one per player
  terramble: { name: 'Terramble', el: 'earth', el2: 'grass', hp: 112, atk: 88, def: 116, spd: 30, berry: 'green', rare: true, legend: 'steps', moves: [[1, 'pebble'], [1, 'leaf'], [1, 'guard'], [1, 'quake'], [20, 'boulder']] },
  emberwing: { name: 'Emberwing', el: 'fire', el2: 'air', hp: 84, atk: 104, def: 74, spd: 102, berry: 'gold', rare: true, legend: 'streak', moves: [[1, 'ember'], [1, 'gust'], [1, 'rest'], [1, 'flare'], [20, 'dive']] },
  // rare: only between 11:00 and 14:00
  solarion: { name: 'Solarion', el: 'fire', hp: 80, atk: 98, def: 72, spd: 88, berry: 'gold', rare: true, moves: [[1, 'ember'], [1, 'guard'], [16, 'flare'], [18, 'roar']] },
  // rare: only after 10,000 steps in a day
  boulderon: { name: 'Boulderon', el: 'earth', hp: 98, atk: 90, def: 106, spd: 34, berry: 'green', rare: true, moves: [[1, 'pebble'], [1, 'guard'], [16, 'quake'], [18, 'boulder']] },
  moonmew: { name: 'Moonkit', el: 'shadow', hp: 44, atk: 52, def: 42, spd: 64, evo: 'crescat', evoLv: 16, berry: 'blue', time: 'night', moves: learnset2('hex', 'terror', 'guard', 'moonclaw') },
  crescat: { name: 'Crescat', el: 'shadow', hp: 57, atk: 71, def: 52, spd: 82, evo: 'lunacat', evoLv: 28, berry: 'red', time: 'night', moves: learnset2('hex', 'terror', 'guard', 'moonclaw') },
  lunacat: { name: 'Lunacat', el: 'shadow', hp: 70, atk: 90, def: 62, spd: 100, berry: 'gold', time: 'night', moves: learnset2('hex', 'terror', 'guard', 'moonclaw') },
  slothnap: { name: 'Slothnap', el: 'grass', hp: 96, atk: 62, def: 90, spd: 20, berry: 'green', cond: 'weekend', moves: [[1, 'tackle'], [1, 'leaf'], [1, 'nap'], [14, 'thorn']] },
  drizzlet: { name: 'Drizzlet', el: 'water', hp: 46, atk: 48, def: 44, spd: 52, evo: 'squallet', evoLv: 15, berry: 'blue', cond: 'rain', moves: learnset2('splash', 'tidal', 'rest', 'staticrain') },
  squallet: { name: 'Squallet', el: 'water', hp: 61, atk: 66, def: 57, spd: 63, evo: 'stormjelly', evoLv: 28, berry: 'green', cond: 'rain', moves: learnset2('splash', 'tidal', 'rest', 'staticrain') },
  stormjelly: { name: 'Stormjelly', el: 'water', el2: 'electric', hp: 76, atk: 84, def: 70, spd: 74, berry: 'gold', cond: 'rain', moves: learnset2('splash', 'tidal', 'rest', 'staticrain') },
  sunbun: { name: 'Sunbun', el: 'grass', hp: 46, atk: 46, def: 44, spd: 60, evo: 'sunhop', evoLv: 15, berry: 'red', cond: 'sun', moves: learnset2('leaf', 'thorn', 'guard', 'sunburst') },
  sunhop: { name: 'Sunhop', el: 'grass', hp: 59, atk: 65, def: 55, spd: 76, evo: 'solarabbit', evoLv: 28, berry: 'blue', cond: 'sun', moves: learnset2('leaf', 'thorn', 'guard', 'sunburst') },
  solarabbit: { name: 'Solarabbit', el: 'grass', hp: 72, atk: 84, def: 66, spd: 92, berry: 'gold', cond: 'sun', moves: learnset2('leaf', 'thorn', 'guard', 'sunburst') },
  kindlepig: { name: 'Kindlepig', el: 'fire', hp: 54, atk: 48, def: 52, spd: 38, evo: 'hearthog', evoLv: 12, berry: 'green', cond: 'kcal', moves: learnset2('ember', 'flare', 'rest', 'mudroll') },
  hearthog: { name: 'Hearthog', el: 'fire', hp: 75, atk: 67, def: 68, spd: 39, evo: 'furnasow', evoLv: 28, berry: 'blue', cond: 'kcal', evoPai: 100, moves: learnset2('ember', 'flare', 'rest', 'mudroll') },
  dimmouse: { name: 'Dimmouse', el: 'shadow', hp: 50, atk: 58, def: 44, spd: 84, berry: 'red', time: 'night', moves: learnset2('hex', 'terror', 'guard', 'pebble') },
  mistlantern: { name: 'Mistlantern', el: 'shadow', hp: 64, atk: 70, def: 60, spd: 68, berry: 'gold', cond: 'mist', moves: learnset2('hex', 'terror', 'rest', 'ember') },
  aurowl: { name: 'Aurowl', el: 'ice', hp: 70, atk: 70, def: 66, spd: 80, berry: 'blue', cond: 'north', moves: learnset2('frost', 'howl', 'rest', 'hex') },
  dawnlark: { name: 'Dawnlark', el: 'air', hp: 50, atk: 52, def: 46, spd: 78, berry: 'gold', cond: 'dawn', moves: learnset2('gust', 'dive', 'rest', 'ember') },
  needlefin: { name: 'Needlefin', el: 'electric', hp: 48, atk: 52, def: 44, spd: 76, evo: 'vanefin', evoLv: 16, berry: 'red', cond: 'compass', condWeight: 1, moves: learnset2('zap', 'arc', 'guard', 'splash') },
  vanefin: { name: 'Vanefin', el: 'electric', hp: 61, atk: 68, def: 55, spd: 86, evo: 'lodestar', evoLv: 28, berry: 'blue', cond: 'compass', condWeight: 1, moves: learnset2('zap', 'arc', 'guard', 'splash') },
  lodestar: { name: 'Lodestar', el: 'electric', el2: 'light', hp: 74, atk: 84, def: 66, spd: 96, berry: 'gold', cond: 'compass', condWeight: 1, moves: learnset2('zap', 'arc', 'guard', 'splash') },
  furnasow: { name: 'Furnasow', el: 'fire', el2: 'earth', hp: 96, atk: 86, def: 84, spd: 40, berry: 'red', cond: 'kcal', moves: learnset2('ember', 'flare', 'rest', 'mudroll') }
}

// the order of the collection book
export const BOOK = ['embit', 'blazetail', 'cindervix', 'puddlop', 'puddleap', 'torrentoad', 'sprig', 'budnip', 'mossmaw', 'zippet',
  'buzzhorn', 'arcbeetle', 'snowpup', 'rimecub', 'frostfang', 'fluffin', 'gustling', 'galehawk', 'pebblet', 'rubbler',
  'cragmole', 'gloomlet', 'shadeling', 'duskwraith', 'shellby', 'reefling', 'coralclaw', 'sparkit', 'glidekit', 'voltglider',
  'pipfrost', 'icesquire', 'glacieron', 'nibbat', 'flitfang', 'vesperwing', 'moonmew', 'crescat', 'lunacat', 'drizzlet',
  'squallet', 'stormjelly', 'sunbun', 'sunhop', 'solarabbit', 'kindlepig', 'hearthog', 'furnasow', 'slothnap', 'dimmouse',
  'mistlantern', 'aurowl', 'dawnlark', 'needlefin', 'vanefin', 'lodestar', 'gloamstag', 'sunquill', 'whirlwisp', 'stillbill',
  'ampsnail', 'voltsnail', 'dynamollusk', 'pumpkling', 'gourdgrin', 'jackolord', 'frostjay', 'eggling', 'woolamb', 'glimmerpine',
  'novapop', 'heartwing', 'glowfly', 'jinxcrow', 'sprinkit', 'dewcap', 'mossoon', 'basklet', 'baskadon', 'solaurus',
  'hoofit', 'hoofstomp', 'thundrox', 'roamkit', 'roamfox', 'meridyx', 'dimwick', 'flickwick', 'snuffwick', 'mistkoi',
  'borealynx', 'roostar', 'duskadillo', 'siesturtle', 'whirlnut', 'pandaze', 'snackoon', 'boolet', 'lullamoth', 'solarion',
  'boulderon', 'midnyx', 'pulsarex', 'selenyx', 'terramble', 'emberwing']

export const STARTERS = ['embit', 'puddlop', 'sprig']

// ---------- berries ----------
// full: how much fuller it makes a creature, joy: how much happier. Favourites give more.
export const BERRIES = [
  { id: 'red', name: 'Red Berry', color: 0xff4d5e, full: 35, joy: 5 },
  { id: 'blue', name: 'Blue Berry', color: 0x4d8dff, full: 35, joy: 5 },
  { id: 'green', name: 'Green Berry', color: 0x6bd65a, full: 35, joy: 5 },
  { id: 'gold', name: 'Gold Berry', color: 0xffc531, full: 60, joy: 12 }
]
export const FAV_FULL_BONUS = 15
export const FAV_JOY_BONUS = 12
