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
  shadow: { name: 'SHADOW', color: 0x9a7fe0 }
}

// attacker element -> the elements it hits for x1.5
// (the reverse direction, and the same element, hit for x0.67)
export const STRONG = {
  fire: ['grass', 'ice', 'shadow'],
  water: ['fire', 'earth'],
  grass: ['water', 'earth'],
  electric: ['water', 'air', 'shadow'],
  ice: ['grass', 'air'],
  earth: ['fire', 'electric'],
  air: ['grass', 'earth'],
  shadow: ['air', 'ice']
}

export function effectiveness(moveEl, targetEl) {
  if (!moveEl) return 1
  if (STRONG[moveEl].indexOf(targetEl) >= 0) return 1.5
  if (moveEl === targetEl || STRONG[targetEl].indexOf(moveEl) >= 0) return 0.67
  return 1
}

// ---------- moves ----------
// pow: power (0 = no damage), acc: % chance to hit, kind: 'hit' | 'guard' | 'heal'
// prio: moves with higher prio go first
export const MOVES = {
  tackle: { name: 'Tackle', el: null, pow: 40, acc: 100, kind: 'hit' },
  guard: { name: 'Guard', el: null, pow: 0, acc: 100, kind: 'guard', prio: 1 },
  rest: { name: 'Rest', el: null, pow: 0, acc: 100, kind: 'heal' },

  ember: { name: 'Ember', el: 'fire', pow: 55, acc: 100, kind: 'hit' },
  flare: { name: 'Flare Dash', el: 'fire', pow: 85, acc: 85, kind: 'hit' },
  splash: { name: 'Splash Jet', el: 'water', pow: 55, acc: 100, kind: 'hit' },
  tidal: { name: 'Tidal Crash', el: 'water', pow: 85, acc: 85, kind: 'hit' },
  leaf: { name: 'Leaf Toss', el: 'grass', pow: 55, acc: 100, kind: 'hit' },
  thorn: { name: 'Thorn Burst', el: 'grass', pow: 85, acc: 85, kind: 'hit' },
  zap: { name: 'Zap', el: 'electric', pow: 55, acc: 100, kind: 'hit' },
  arc: { name: 'Thunder Arc', el: 'electric', pow: 85, acc: 85, kind: 'hit' },
  frost: { name: 'Frost Bite', el: 'ice', pow: 55, acc: 100, kind: 'hit' },
  howl: { name: 'Blizzard', el: 'ice', pow: 85, acc: 85, kind: 'hit' },
  gust: { name: 'Gust', el: 'air', pow: 55, acc: 100, kind: 'hit' },
  dive: { name: 'Sky Dive', el: 'air', pow: 85, acc: 85, kind: 'hit' },
  pebble: { name: 'Pebble Shot', el: 'earth', pow: 55, acc: 100, kind: 'hit' },
  quake: { name: 'Quake Slam', el: 'earth', pow: 85, acc: 85, kind: 'hit' },
  hex: { name: 'Hex', el: 'shadow', pow: 55, acc: 100, kind: 'hit' },
  terror: { name: 'Night Terror', el: 'shadow', pow: 85, acc: 85, kind: 'hit' },
  // signature moves of the newer lines (some hit another element for coverage)
  pinch: { name: 'Rock Pinch', el: 'earth', pow: 60, acc: 95, kind: 'hit' },
  glide: { name: 'Static Glide', el: 'electric', pow: 70, acc: 95, kind: 'hit' },
  slide: { name: 'Belly Slide', el: 'water', pow: 60, acc: 100, kind: 'hit' },
  wingbite: { name: 'Wing Bite', el: 'air', pow: 60, acc: 100, kind: 'hit' },
  roar: { name: 'Solar Roar', el: 'fire', pow: 95, acc: 80, kind: 'hit' },
  boulder: { name: 'Boulder Toss', el: 'earth', pow: 95, acc: 80, kind: 'hit' },
  moonclaw: { name: 'Moon Claw', el: 'ice', pow: 60, acc: 100, kind: 'hit' },
  staticrain: { name: 'Static Rain', el: 'electric', pow: 60, acc: 100, kind: 'hit' },
  sunburst: { name: 'Sunburst', el: 'fire', pow: 60, acc: 100, kind: 'hit' },
  mudroll: { name: 'Mud Roll', el: 'earth', pow: 60, acc: 100, kind: 'hit' },
  // heal: how much of max HP a healing move restores (Rest uses the default)
  nap: { name: 'Long Nap', el: null, pow: 0, acc: 100, kind: 'heal', heal: 0.5 }
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
// berry: its favourite berry (players find out by trying).
// time: 'night' = only met between 20:00 and 06:00. dream = only met after a good night's sleep.
// cond: only met while something is true in real life:
//   'weekend' (Sat / Sun 12:00 - 18:00), 'rain' / 'sun' (today's
//   weather), 'kcal' (you burned KCAL_SPAWN calories today), 'dark' (the watch's light sensor
//   reads under DARK_LUX), 'mist' (fog / haze, or a night after MIST_NIGHT_STEPS steps).
//   'north' (the top of the watch points north), 'dawn' (points east, 05:00 - 09:00),
//   'compass' (the watch has a working compass).
// condWeight: how many times as likely while the condition is true (default COND_WEIGHT).
// evoPai: evolves when your weekly PAI reaches this (as well as the level).
export const SPECIES = {
  embit: { name: 'Embit', el: 'fire', hp: 44, atk: 54, def: 40, spd: 58, evo: 'cindervix', evoLv: 14, berry: 'red', moves: learnset('ember', 'flare', 'guard') },
  cindervix: { name: 'Cindervix', el: 'fire', hp: 72, atk: 88, def: 62, spd: 90, berry: 'gold', moves: learnset('ember', 'flare', 'guard') },
  puddlop: { name: 'Puddlop', el: 'water', hp: 52, atk: 44, def: 50, spd: 40, evo: 'torrentoad', evoLv: 14, berry: 'green', moves: learnset('splash', 'tidal', 'rest') },
  torrentoad: { name: 'Torrentoad', el: 'water', hp: 90, atk: 76, def: 82, spd: 56, berry: 'blue', moves: learnset('splash', 'tidal', 'rest') },
  sprig: { name: 'Sprig', el: 'grass', hp: 48, atk: 44, def: 52, spd: 46, evo: 'mossmaw', evoLv: 14, berry: 'blue', moves: learnset('leaf', 'thorn', 'rest') },
  mossmaw: { name: 'Mossmaw', el: 'grass', hp: 90, atk: 78, def: 88, spd: 48, berry: 'red', moves: learnset('leaf', 'thorn', 'rest') },
  zippet: { name: 'Zippet', el: 'electric', hp: 40, atk: 50, def: 38, spd: 66, evo: 'arcbeetle', evoLv: 15, berry: 'gold', moves: learnset('zap', 'arc', 'guard') },
  arcbeetle: { name: 'Arcbeetle', el: 'electric', hp: 66, atk: 90, def: 68, spd: 82, berry: 'green', moves: learnset('zap', 'arc', 'guard') },
  snowpup: { name: 'Snowpup', el: 'ice', hp: 46, atk: 48, def: 44, spd: 54, evo: 'frostfang', evoLv: 15, berry: 'red', moves: learnset('frost', 'howl', 'guard') },
  frostfang: { name: 'Frostfang', el: 'ice', hp: 72, atk: 86, def: 64, spd: 84, berry: 'blue', moves: learnset('frost', 'howl', 'guard') },
  fluffin: { name: 'Fluffin', el: 'air', hp: 44, atk: 42, def: 42, spd: 62, evo: 'galehawk', evoLv: 15, berry: 'green', moves: learnset('gust', 'dive', 'rest') },
  galehawk: { name: 'Galehawk', el: 'air', hp: 68, atk: 82, def: 58, spd: 98, berry: 'red', moves: learnset('gust', 'dive', 'rest') },
  pebblet: { name: 'Pebblet', el: 'earth', hp: 52, atk: 46, def: 58, spd: 34, evo: 'cragmole', evoLv: 15, berry: 'blue', moves: learnset('pebble', 'quake', 'guard') },
  cragmole: { name: 'Cragmole', el: 'earth', hp: 86, atk: 84, def: 96, spd: 40, berry: 'gold', moves: learnset('pebble', 'quake', 'guard') },
  gloomlet: { name: 'Gloomlet', el: 'shadow', hp: 42, atk: 54, def: 40, spd: 56, evo: 'duskwraith', evoLv: 16, berry: 'green', time: 'night', moves: learnset('hex', 'terror', 'rest') },
  duskwraith: { name: 'Duskwraith', el: 'shadow', hp: 70, atk: 92, def: 60, spd: 82, berry: 'red', time: 'night', moves: learnset('hex', 'terror', 'rest') },
  lullamoth: { name: 'Lullamoth', el: 'air', hp: 76, atk: 72, def: 72, spd: 78, berry: 'gold', dream: true, rare: true,
    moves: [[1, 'gust'], [1, 'hex'], [1, 'rest'], [12, 'dive']] },
  shellby: { name: 'Shellby', el: 'water', hp: 50, atk: 46, def: 62, spd: 34, evo: 'coralclaw', evoLv: 16, berry: 'red', moves: learnset2('splash', 'tidal', 'guard', 'pinch') },
  coralclaw: { name: 'Coralclaw', el: 'water', hp: 84, atk: 90, def: 100, spd: 40, berry: 'gold', moves: learnset2('splash', 'tidal', 'guard', 'pinch') },
  sparkit: { name: 'Sparkit', el: 'electric', hp: 40, atk: 44, def: 38, spd: 72, evo: 'voltglider', evoLv: 15, berry: 'blue', moves: learnset2('zap', 'arc', 'rest', 'glide') },
  voltglider: { name: 'Voltglider', el: 'electric', hp: 64, atk: 80, def: 58, spd: 106, berry: 'gold', moves: learnset2('zap', 'arc', 'rest', 'glide') },
  pipfrost: { name: 'Pipfrost', el: 'ice', hp: 50, atk: 42, def: 50, spd: 42, evo: 'glacieron', evoLv: 16, berry: 'blue', moves: learnset2('frost', 'howl', 'rest', 'slide') },
  glacieron: { name: 'Glacieron', el: 'ice', hp: 94, atk: 82, def: 88, spd: 46, berry: 'green', moves: learnset2('frost', 'howl', 'rest', 'slide') },
  nibbat: { name: 'Nibbat', el: 'shadow', hp: 40, atk: 50, def: 38, spd: 66, evo: 'vesperwing', evoLv: 15, berry: 'red', time: 'night', moves: learnset2('hex', 'terror', 'guard', 'wingbite') },
  vesperwing: { name: 'Vesperwing', el: 'shadow', hp: 68, atk: 86, def: 58, spd: 98, berry: 'blue', time: 'night', moves: learnset2('hex', 'terror', 'guard', 'wingbite') },
  // rare: only between 11:00 and 14:00
  solarion: { name: 'Solarion', el: 'fire', hp: 80, atk: 98, def: 72, spd: 88, berry: 'gold', rare: true, moves: [[1, 'ember'], [1, 'guard'], [1, 'flare'], [18, 'roar']] },
  // rare: only after 10,000 steps in a day
  boulderon: { name: 'Boulderon', el: 'earth', hp: 98, atk: 90, def: 106, spd: 34, berry: 'green', rare: true, moves: [[1, 'pebble'], [1, 'guard'], [1, 'quake'], [18, 'boulder']] },
  moonmew: { name: 'Moonmew', el: 'shadow', hp: 44, atk: 52, def: 42, spd: 64, evo: 'lunacat', evoLv: 16, berry: 'blue', time: 'night', moves: learnset2('hex', 'terror', 'guard', 'moonclaw') },
  lunacat: { name: 'Lunacat', el: 'shadow', hp: 70, atk: 90, def: 62, spd: 100, berry: 'gold', time: 'night', moves: learnset2('hex', 'terror', 'guard', 'moonclaw') },
  slothnap: { name: 'Slothnap', el: 'grass', hp: 96, atk: 62, def: 90, spd: 20, berry: 'green', cond: 'weekend', moves: [[1, 'tackle'], [1, 'leaf'], [1, 'nap'], [14, 'thorn']] },
  drizzlet: { name: 'Drizzlet', el: 'water', hp: 46, atk: 48, def: 44, spd: 52, evo: 'stormjelly', evoLv: 15, berry: 'blue', cond: 'rain', moves: learnset2('splash', 'tidal', 'rest', 'staticrain') },
  stormjelly: { name: 'Stormjelly', el: 'water', hp: 76, atk: 84, def: 70, spd: 74, berry: 'gold', cond: 'rain', moves: learnset2('splash', 'tidal', 'rest', 'staticrain') },
  sunbun: { name: 'Sunbun', el: 'grass', hp: 46, atk: 46, def: 44, spd: 60, evo: 'solarabbit', evoLv: 15, berry: 'red', cond: 'sun', moves: learnset2('leaf', 'thorn', 'guard', 'sunburst') },
  solarabbit: { name: 'Solarabbit', el: 'grass', hp: 72, atk: 84, def: 66, spd: 92, berry: 'gold', cond: 'sun', moves: learnset2('leaf', 'thorn', 'guard', 'sunburst') },
  kindlepig: { name: 'Kindlepig', el: 'fire', hp: 54, atk: 48, def: 52, spd: 38, evo: 'furnasow', evoLv: 12, evoPai: 100, berry: 'green', cond: 'kcal', moves: learnset2('ember', 'flare', 'rest', 'mudroll') },
  dimmouse: { name: 'Dimmouse', el: 'shadow', hp: 50, atk: 58, def: 44, spd: 84, berry: 'red', cond: 'dark', moves: learnset2('hex', 'terror', 'guard', 'pebble') },
  mistlantern: { name: 'Mistlantern', el: 'shadow', hp: 64, atk: 70, def: 60, spd: 68, berry: 'gold', cond: 'mist', moves: learnset2('hex', 'terror', 'rest', 'ember') },
  aurowl: { name: 'Aurowl', el: 'ice', hp: 70, atk: 70, def: 66, spd: 80, berry: 'blue', cond: 'north', moves: learnset2('frost', 'howl', 'rest', 'hex') },
  dawnlark: { name: 'Dawnlark', el: 'air', hp: 50, atk: 52, def: 46, spd: 78, berry: 'gold', cond: 'dawn', moves: learnset2('gust', 'dive', 'rest', 'ember') },
  needlefin: { name: 'Needlefin', el: 'electric', hp: 48, atk: 52, def: 44, spd: 76, evo: 'lodestar', evoLv: 16, berry: 'red', cond: 'compass', condWeight: 1, moves: learnset2('zap', 'arc', 'guard', 'splash') },
  lodestar: { name: 'Lodestar', el: 'electric', hp: 74, atk: 84, def: 66, spd: 96, berry: 'gold', cond: 'compass', condWeight: 1, moves: learnset2('zap', 'arc', 'guard', 'splash') },
  furnasow: { name: 'Furnasow', el: 'fire', hp: 96, atk: 86, def: 84, spd: 40, berry: 'red', cond: 'kcal', moves: learnset2('ember', 'flare', 'rest', 'mudroll') }
}

// the order of the collection book
export const BOOK = ['embit', 'cindervix', 'puddlop', 'torrentoad', 'sprig', 'mossmaw', 'zippet', 'arcbeetle', 'snowpup', 'frostfang',
  'fluffin', 'galehawk', 'pebblet', 'cragmole', 'gloomlet', 'duskwraith', 'shellby', 'coralclaw', 'sparkit', 'voltglider',
  'pipfrost', 'glacieron', 'nibbat', 'vesperwing', 'moonmew', 'lunacat', 'drizzlet', 'stormjelly', 'sunbun', 'solarabbit',
  'kindlepig', 'furnasow', 'slothnap', 'dimmouse', 'mistlantern', 'aurowl', 'dawnlark', 'needlefin', 'lodestar', 'lullamoth', 'solarion', 'boulderon']

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
