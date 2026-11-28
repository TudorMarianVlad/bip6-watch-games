# Wristlings: creature art

How the creature art gets into the game, the style rules that keep every creature looking like one game,
and one brief per creature to paste into Gemini.

## Where the art comes from

The game has 106 creatures. Where their art stands (2026-11-19):

- **44 done:** the 42 first and final forms of the user's Gemini set, plus the middle forms
  Blazetail and Puddleap. Each source image is `art/<id>.png`, stored cut out, trimmed and compressed.
- **15 borrowing:** the other middle forms of the original lines still use their first form's
  sprite. Gemini scripts: [middle-evolutions.md](middle-evolutions.md).
- **47 eggs:** every creature added later (compass, battery, calendar, holidays, legends, the
  round-3 lines, singles and rares) shows a "?" egg. Gemini scripts 1–47:
  [new-wristlings.md](new-wristlings.md).

[roster.html](roster.html) shows every creature with a pink "needs art" tag on the ones still to make;
`node tools/roster.cjs` refreshes it after new art is imported.

**Gemini tip:** a redraw in the same chat comes out almost the same, because Gemini sticks to its
first image. For a genuinely new design, start a new chat and describe a different creature (pose and
body shape), or ask for 4 clearly different designs side by side and pick one.

## Adding or replacing art

From the `Wristlings` folder:

1. Save each creature as `art/<id>.png`. The id is the first word of each heading below, e.g.
   `art/embit.png`. Gemini downloads are often `.jpg`: open it in Paint and use *Save as > PNG*
   (or hand the files to Claude, who can convert and name them).
2. `node tools/import.cjs` imports everything in `art/` (`--only embit,sprig` for just some).
3. `node tools/sheet.cjs` writes `tools/sheet_named.png`, every creature at game size with its name.
   `SIZE=200 node tools/sheet.cjs <id>` shows one up close.
4. `node tools/icon.cjs` remakes the app icon from `art/sprig.png` (`--look` to preview it).
5. `node tools/widget-preview.cjs` redraws the widget's picker preview with the new sprites.
6. `zeus build`.

What the importer does:
- **Background:** transparent is best. A plain one-colour background (white, or Gemini's fake
  grey-and-white checkerboard) is removed, but only from the outside, so a white belly stays white.
  Background completely enclosed by the creature stays and has to be cleared by hand: check new art
  on the dark review sheet (in the 2026-11-19 set: Arcbeetle between its horns, Galehawk between leg
  and tail).
- **Size:** any size. Empty space is trimmed, the creature is centred with its feet at the bottom,
  and it is scaled to every size the game uses: 128 (wild, den, book page), 112 facing right (yours,
  in battle), 64 (lists) and a 64 silhouette (book, before you catch it).
- **Facing:** creatures face **left**. A right-facing image named `<id>.right.png` is flipped.
- **Scaling:** images up to 100 px are treated as pixel art and scaled by whole pixels; bigger
  images (Gemini's are 2000 px) are scaled smoothly. `--pixel` or `--smooth` forces one.

## Style guide (same for every creature)

This is the look the user liked in the first round of Gemini art.

- **Look:** cute, chunky 16-bit handheld monster-game pixel art. A big head, clear eyes, one strong
  silhouette and 2 or 3 big features. Everything must read at **64×64 px** on the watch.
- **Lines:** a dark plum outline (`#2a1430`-ish, never pure black) around the creature **and** between
  overlapping parts (ears over head, leg over body, wing over back). This is what makes it look drawn.
- **Shading:** three tones per material: base colour, a darker underside and right edge, and a soft
  lighter patch at the upper left (light from the top left).
- **Eyes:** dark and glossy with a white glint. Cute ones get pink blush; fierce or evolved ones get
  angled brows, half-closed lids or glowing slits. Give each creature an eye that fits it.
- **Pose:** 3/4 side view, facing left, whole body, standing on an invisible floor, calm idle pose.
- **Evolutions:** keep the colours and one or two features of the first form, but change the body:
  bigger, sharper, armoured or winged, fiercer eyes. Not just a bigger copy.
- **Background:** transparent or plain white. No ground shadow, scenery, text or frame.
- **Dark scene:** the game background is dark navy/purple, so shadow creatures need a lighter rim or
  glowing eyes (the Gemini ones have a soft lavender glow edge).

### Element colours

| Element | Main colour | Use for |
|---|---|---|
| fire | `#ff7a3d` orange | warm orange/red, yellow flame tips |
| water | `#4aa8ff` blue | blues, white foam, coral accents |
| grass | `#5cc850` green | greens, wood brown, flower accents |
| electric | `#f5c518` yellow | yellow, black stripes, white sparks |
| ice | `#7fcfff` pale blue | white, ice blue, crystal highlights |
| air | `#9fb2ff` lavender blue | white, sky blue, soft lavender |
| earth | `#c8955a` tan | browns, grey stone, moss green |
| shadow | `#9a7fe0` violet | deep purple, glowing eyes, silver |

## AI prompt template

Fill in the [brackets] from the creature's brief. Ask for a creature and its evolution in the same
chat so they match, and attach an image of one you like as a style reference.

> Pixel art game sprite of a single cute fantasy creature, [LOOK], [ELEMENT] element, main colours
> [COLOURS], [KEY FEATURES]. 3/4 side view facing left, full body, standing, idle pose. 16-bit
> handheld monster-collecting game style, chunky readable shapes, big expressive [EYES] eyes,
> 3-tone cel shading, light from top left, dark purple outline also between overlapping parts.
> Centred, plain solid white background, no ground shadow, no text, no frame.

Keep names generic in prompts: don't name a creature from another game. The art must be
original.

---

## The first and final forms (middle forms: see middle-evolutions.md)

Format: **number. id (Name)**, element, how/when it appears, and what evolves into what.

### 1. embit (Embit): fire, starter → evolves into Cindervix (lv 14)
- **Look:** a small fire fox kit, sitting, with a fluffy tail whose tip is a real flame.
- **Colours:** orange fur, cream chest and muzzle, yellow-red flame tip, dark paws.
- **Key features:** big ears with dark tips, a curious face, a tail flame as big as its head.
- **Eyes:** round and bright, amber.
- **Avoid:** looking like a plain dog; the flame must clearly come out of the tail.

### 2. cindervix (Cindervix): fire, evolved Embit
- **Look:** an adult, lean fire fox standing tall on four long legs. Three flame tails fan out behind it.
- **Change from Embit:** grown-up proportions (long legs, narrow muzzle), three tails instead of one,
  a flame mane along the neck and back, ear tips that glow like embers.
- **Colours:** deeper orange-red, cream chest, yellow flames, charcoal legs ("socks").
- **Eyes:** sharp almond eyes, gold.
- **Avoid:** a busy mess of flames. Keep 3 clear tail flames and one mane line.

### 3. puddlop (Puddlop): water, starter → evolves into Torrentoad (lv 14)
- **Look:** a round baby frog-tadpole: chubby blue body, a tail fin, big bubble eyes on top.
- **Colours and features:** light blue, pale belly, pink cheeks, a small fin on its head and back.

### 4. torrentoad (Torrentoad): water, evolved Puddlop (lv 14)
- **Look:** a heavy, powerful toad squatting low, with a pair of **water-cannon spouts** on its back
  (like the vents of a whale).
- **Change from Puddlop:** loses the tail and gains thick front legs, a wide jaw and a warty back
  with spouts. It should look much bigger and tougher.
- **Colours:** deep blue back, light blue belly, white foam spraying from the spouts, yellow eyes.
- **Eyes:** heavy-lidded, determined, sitting high on the head.
- **Avoid:** just a bigger Puddlop.

### 5. sprig (Sprig): grass, starter → evolves into Mossmaw (lv 14)
- **Look:** a round green seed-sprout with two leaves growing out of its head and tiny feet.
- **Colours and features:** lime-green round body, two leaves on a stem, small dark eyes, blush.

### 6. mossmaw (Mossmaw): grass, evolved Sprig (lv 14)
- **Look:** a big **flytrap-plant creature**: its whole head is a huge leafy mouth with a row of
  thorn teeth, standing on stubby root legs, a flower on top.
- **Change from Sprig:** the round seed opens into a jaw. The leaf pair becomes a big leaf crown,
  and roots become legs.
- **Colours:** dark and moss green, red-pink inside the mouth, cream thorn teeth, a pink flower.
- **Eyes:** small fierce eyes above the jaw.
- **Avoid:** too many teeth and leaves. Keep it readable as "a plant mouth on legs".

### 7. zippet (Zippet): electric → evolves into Arcbeetle (lv 15)
- **Look:** a tiny round electric bug with antennae and a lightning-bolt pattern on its yellow shell.
- **Colours and features:** yellow shell with a black bolt, dark head, small antennae.

### 8. arcbeetle (Arcbeetle): electric, evolved Zippet (lv 15)
- **Look:** a big **stag beetle** whose two horn-jaws spark like a Tesla coil, with clear wings slightly open.
- **Change from Zippet:** much longer body, six strong legs, big pincer horns, see-through wings.
- **Colours:** yellow shell with black bolt stripes (kept from Zippet), dark armour, white-blue
  spark between the horns.
- **Eyes:** shiny compound eyes.

### 9. snowpup (Snowpup): ice → evolves into Frostfang (lv 15)
- **Look:** a fluffy white puppy with a snowball-like coat, an ice-blue nose and a little ice crystal
  on its forehead.
- **Colours:** white, light ice blue, pink tongue.
- **Key features:** floppy ears, puffy tail, a snowflake mark on its forehead.
- **Eyes:** big round blue eyes.

### 10. frostfang (Frostfang): ice, evolved Snowpup
- **Look:** a lean **ice wolf** mid-stride, with jagged ice crystals growing along its spine and two
  ice fangs.
- **Change from Snowpup:** puppy fluff becomes a sleek adult wolf, and the crystals grow out of its back.
- **Colours:** white and pale blue fur, transparent-looking blue crystals, a dark blue nose.
- **Eyes:** narrow and icy, glowing pale blue.
- **Avoid:** too many crystals. Use 3 to 5 big ones.

### 11. fluffin (Fluffin): air → evolves into Galehawk (lv 15)
- **Look:** a round, fluffy **chick made of cloud fluff**: almost a ball, with tiny wings and a tuft on its head.
- **Colours:** white and pale lavender, a yellow beak and feet.
- **Eyes:** big shiny round eyes, a little sleepy and cute.
- **Avoid:** looking like an owl (Aurowl is the owl).

### 12. galehawk (Galehawk): air, evolved Fluffin
- **Look:** a sleek **hawk** diving or with wings spread wide, its wing tips trailing wind streaks.
- **Change from Fluffin:** the round fluff ball becomes a streamlined raptor with a hooked beak, while
  a cloud-white chest stays from Fluffin.
- **Colours:** white chest, blue-lavender wings, yellow beak and talons.
- **Eyes:** sharp hawk eyes.

### 13. pebblet (Pebblet): earth → evolves into Cragmole (lv 15)
- **Look:** a small **mole wearing a round pebble like a helmet**, with big digging claws.
- **Colours:** warm brown fur, a grey stone helmet, pink nose and paws.
- **Eyes:** tiny squinty eyes (it lives underground).

### 14. cragmole (Cragmole): earth, evolved Pebblet
- **Look:** a large **armoured mole** covered in rocky plates, with huge drill-like claws.
- **Change from Pebblet:** the one pebble becomes full rock armour with crystal spikes, and the claws
  become drills.
- **Colours:** brown fur, grey and slate rock plates, a purple crystal, a pink nose.
- **Eyes:** small and determined, under a rock brow.

### 15. gloomlet (Gloomlet): shadow, only at night → evolves into Duskwraith (lv 16)
- **Look:** a small **shadow blob ghost** with a wavy bottom edge and a shy face.
- **Colours:** violet with a lighter rim, glowing yellow eyes.
- **Key features:** two little stubby arms, a wisp curling off its top.

### 16. duskwraith (Duskwraith): shadow, evolved Gloomlet, only at night
- **Look:** a tall **hooded wraith** in a tattered cloak, with long thin hands. Only two glowing eyes
  show in the dark hood.
- **Change from Gloomlet:** the blob grows into a tall, cloaked figure, keeping the wavy bottom edge.
- **Colours:** deep violet cloak, lighter purple edges, yellow eyes.
- **Avoid:** a flat dark shape. It needs a lighter rim to show on the dark background.

### 17. shellby (Shellby): water → evolves into Coralclaw (lv 16)
- **Look:** a little **hermit crab** in a spiral seashell.
- **Colours:** teal crab body, a cream and beige spiral shell, pink claw tips.
- **Eyes:** eyes on short stalks.

### 18. coralclaw (Coralclaw): water, evolved Shellby
- **Look:** a big **crab whose shell has grown into a coral reef**, with branching pink coral on its
  back and one oversized claw.
- **Change from Shellby:** the spiral shell becomes living coral, and it gets a much bigger claw.
- **Colours:** teal body (kept), pink and orange coral, white highlights.

### 19. sparkit (Sparkit): electric → evolves into Voltglider (lv 15)
- **Look:** a light blue **electric squirrel** with a big tail ending in a star-shaped spark.
- **Colours and features:** cyan-blue fur, a yellow star on its tail, round ears.

### 20. voltglider (Voltglider): electric, evolved Sparkit (lv 15)
- **Look:** a **flying squirrel** gliding with its skin flaps fully spread, lightning crackling along
  the flap edges.
- **Change from Sparkit:** it is now gliding (a flat, wide shape), with the star spark kept on its tail tip.
- **Colours:** cyan fur, yellow lightning edges on the flaps, a pale belly.
- **Avoid:** wings with feathers. They are skin flaps.

### 21. pipfrost (Pipfrost): ice → evolves into Glacieron (lv 16)
- **Look:** a small round **penguin chick** with a little ice crest.
- **Colours and features:** navy and white body, a yellow beak, an ice-crystal crest.

### 22. glacieron (Glacieron): ice, evolved Pipfrost (lv 16)
- **Look:** a tall **emperor-penguin knight** with an ice shield and an icicle crown.
- **Change from Pipfrost:** tall and upright, armoured, holding an ice shield.
- **Colours:** navy back and white front (from Pipfrost), clear ice armour, yellow beak.

### 23. nibbat (Nibbat): shadow, only at night → evolves into Vesperwing (lv 15)
- **Look:** a round, small **bat** with big ears, folded wings and a tiny fang.
- **Colours:** violet fur, pink inner ears, lighter wing membranes.
- **Eyes:** big round eyes (it is a baby), pink-glowing.

### 24. vesperwing (Vesperwing): shadow, evolved Nibbat, only at night
- **Look:** a large **vampire bat** with huge spread wings, a ruff of fur around its neck and a small
  crescent mark on its forehead.
- **Change from Nibbat:** a much bigger wingspan, a tall slim body, a regal pose.
- **Colours:** deep purple, a lilac fur ruff, red-pink eyes.

### 25. moonmew (Moonkit): shadow, only at night → evolves into Lunacat (lv 16)
- **Look:** a small **purple kitten** with a crescent moon mark on its forehead and a curled tail tip
  that glows like a tiny moon.
- **Colours:** lavender-purple, a pale yellow moon mark, a white muzzle.
- **Eyes:** large, slightly sleepy gold eyes.

### 26. lunacat (Lunacat): shadow, evolved Moonkit, only at night
- **Look:** a sleek, tall **night panther**, its coat dotted with tiny stars like a night sky, with a
  crescent-moon halo above its head.
- **Change from Moonkit:** a lean, long-legged big cat, keeping the moon mark and gaining the star pattern.
- **Colours:** dark indigo with lighter violet edges, yellow stars and moon.
- **Eyes:** glowing gold slits.

### 27. drizzlet (Drizzlet): water, only when it rains → evolves into Stormjelly (lv 15)
- **Look:** a small fluffy **rain cloud** with a face. Raindrops dangle underneath like little legs.
- **Colours:** white and pale grey cloud, blue drops, pink cheeks.
- **Eyes:** round, with a happy face.

### 28. stormjelly (Stormjelly): water, evolved Drizzlet, only when it rains
- **Look:** a **jellyfish made of a storm cloud**: a dark, rumbling cloud dome with long rain
  tentacles, and lightning crackling between them.
- **Change from Drizzlet:** grey storm colours, a frowning face and long tentacles instead of drops.
- **Colours:** slate grey, blue tentacles, a yellow lightning bolt.

### 29. sunbun (Sunbun): grass, only in sunny weather → evolves into Solarabbit (lv 15)
- **Look:** a round **bunny** whose long ears end in sunflower petals.
- **Colours:** cream fur, yellow petal ear tips, a pink nose.
- **Eyes:** happy, bright brown eyes.

### 30. solarabbit (Solarabbit): grass, evolved Sunbun, only in sunny weather
- **Look:** an athletic **hare** standing upright, with a **sunflower blossom** on its chest and
  long petal-tipped ears.
- **Change from Sunbun:** long legs and an upright stance, and a full sunflower on its chest.
- **Colours:** cream and white, yellow petals, an orange flower centre.

### 31. kindlepig (Kindlepig): fire, appears after you burn calories → evolves into Furnasow (lv 12)
- **Look:** a little **piglet** with a glowing coal on its back and a tiny flame curl for a tail.
- **Colours:** peach-pink, orange glow, a red coal.
- **Eyes:** small and cheerful.

### 32. furnasow (Furnasow): fire, evolved Kindlepig
- **Look:** a big **pig that's partly a cast-iron stove**: a round iron furnace belly with a glowing
  door, a chimney puffing smoke on its back, and tusks.
- **Change from Kindlepig:** from a cute piglet to a heavy, armoured furnace.
- **Colours:** pink-orange skin, dark iron plates, a yellow-orange glow, grey smoke.

### 33. slothnap (Slothnap): grass, only on weekends
- **Look:** a **sloth** hanging from a branch, half asleep, with moss growing on its fur.
- **Colours and features:** beige-brown fur, green moss, a sleepy face, "z" sleep bubbles.

### 34. dimmouse (Dimmouse): shadow, only at night
- **Look:** a **mouse** with huge round ears and big night-vision eyes, holding its tail curled
  around itself.
- **Colours:** dusky grey-purple, pink ears and nose.
- **Eyes:** huge, round, reflective (they shine in the dark).

### 35. mistlantern (Mistlantern): shadow, only in fog or mist
- **Look:** a **ghostly wisp in a pointy hood** holding a lantern on a pole. Its lower body fades into mist.
- **Colours:** misty pale grey and violet, a warm yellow lantern glow, a dark face with bright eyes.
- **Avoid:** a plain white ghost. The lantern is its main feature.

### 36. aurowl (Aurowl): ice, appears when you face north
- **Look:** a snowy **owl** with an aurora-coloured shimmer on its wings.
- **Colours:** white with soft blue, green-teal-pink aurora streaks on the wing feathers.
- **Eyes:** big round gold owl eyes.

### 37. dawnlark (Dawnlark): air, only around sunrise
- **Look:** a small **songbird** with a little sun-star crest.
- **Colours and features:** warm peach and cream, a yellow star crest, an orange tail.

### 38. needlefin (Needlefin): electric, appears when you point the watch at a compass bearing → evolves into Lodestar (lv 16)
- **Look:** a slim **needle-nosed fish** shaped like a compass needle: one half red, one half white,
  with a little magnet-coloured fin.
- **Colours:** red front and silver-white back (like a compass needle), a yellow fin.
- **Eyes:** small and alert.

### 39. lodestar (Lodestar): electric, evolved Needlefin
- **Look:** a bigger, armoured **swordfish whose body is a compass rose**: the four compass points
  stick out as fins, with a glowing star in the centre.
- **Change from Needlefin:** cross-shaped fins (N/E/S/W) and a big glowing centre.
- **Colours:** red and silver (kept), gold fin points, a yellow star.

### 40. lullamoth (Lullamoth): air, rare, found while you sleep
- **Look:** a soft, plump **moth** with big lavender wings marked with a crescent moon.
- **Colours and features:** cream body, lavender wings with a yellow crescent, sleepy eyes.

### 41. solarion (Solarion): fire, rare
- **Look:** a proud young **lion** whose mane is a blazing sun corona, with a flaming tail tuft.
- **Colours:** gold-orange body, a yellow-to-red sun mane, a cream muzzle.
- **Eyes:** confident amber eyes.
- **Feel:** rare and majestic. It should look like the best fire creature in the game.

### 42. boulderon (Boulderon): earth, rare
- **Look:** a big, ancient **stone golem** made of stacked boulders, with moss on its head and
  glowing crystals growing from its shoulders.
- **Colours:** grey stone, green moss, purple-pink crystals, glowing yellow eyes.
- **Feel:** rare, heavy and old. Rounded boulders, not blocky bricks.
