# Wristlings: creatures, art and stats

This is the single reference for all **106 Wristlings**. It replaces the three earlier art
documents; the old prompt templates have been removed.
The art text below describes the **finished sprite** in `art/<id>.png`. Game numbers come
from `page/data.js`, with rare/legend timing from `page/index.js`.

Art status, provenance of the 47 mapped images and the rebuild command stay in
[art-status.md](art-status.md). The visual source of truth is [roster.html](roster.html).

## Contents

- [The art at a glance](#the-art-at-a-glance)
  - [Style of the sprites](#style-of-the-sprites)
  - [Element colours](#element-colours)
- [How to read an entry](#how-to-read-an-entry)
- [Quick index](#quick-index)
  - [Evolution lines](#evolution-lines)
  - [By primary element](#by-primary-element)
  - [Rares, legends and special availability](#rares-legends-and-special-availability)
- [All 106 creatures](#all-106-creatures)

## The art at a glance

- All 106 species have their own source PNG in `art/<id>.png`: transparent RGBA, trimmed and centred,
  feet at the bottom. No borrowed sprites, no "?" eggs.
- The importer turns each source into 128 px, 112 px right-facing, 64 px and a 64 px book silhouette
  for each of the three resource packs. It removes only white reachable from the edge, so enclosed
  white pockets stay unless explicitly cleared.
- Judge art in `roster.html`. `tools/sheet_named.png` uses a dark background, so transparent areas
  look like dark holes there; that is expected.
- Creatures face **left**. Evolutions keep the first form's colours and one or two features, but
  change the body: bigger, sharper, armoured or winged, with a fiercer expression. A middle form is
  still recognisably the baby, with only two or three visible changes.

### Style of the sprites

- Cute, chunky 16-bit handheld monster-game pixel art: big head, clear eyes, one strong silhouette,
  2–3 big features. Everything must read at 64×64 px.
- Dark plum outline (`#2a1430`-ish, never pure black), including between overlapping parts.
- Three tones per material: base, darker underside/right edge, soft lighter patch at upper left.
- Dark glossy eyes with a white glint; cute forms get blush, evolved forms get angled brows,
  half-closed lids or glowing slits.
- 3/4 side view, full body, calm idle pose. Transparent background; no shadow, scenery, text or frame.
- Shadow creatures need a soft lavender rim or glowing eyes to show against the dark game background.

### Element colours

| Element | Game colour | Art palette |
|---|---|---|
| Fire | `#ff7a3d` | warm orange/red, yellow flame tips |
| Water | `#4aa8ff` | blues, white foam, coral accents |
| Grass | `#5cc850` | greens, wood brown, flower accents |
| Electric | `#f5c518` | yellow, black stripes, white sparks |
| Ice | `#7fcfff` | white, ice blue, crystal highlights |
| Air | `#9fb2ff` | white, sky blue, soft lavender |
| Earth | `#c8955a` | browns, grey stone, moss green |
| Shadow | `#9a7fe0` | deep purple, glowing eyes, silver |
| Light | `#ffe9a0` | cream, pale gold, warm glowing accents |

## How to read an entry

- **Status** is the role: starter, evolution stage, condition-only, night-only, rare, legend or dream.
- **Found** is the real-world trigger. Condition creatures are about 3× as likely while their
  condition is true; compass/roaming creatures are the exception at 1× and flee if you face away.
- **Stats** are base HP / Attack / Defence / Speed from `data.js`.
- **Moves** are the levels and move names the species learns.
- Evolution lines are three stages: first → middle at Lv 12–16, middle → final at Lv 28. Hearthog
  also needs 100+ weekly PAI, and Voltsnail also needs 20,000 steps walked as lead. Evolved forms
  appear in the wild once your lead is Lv 13+, final forms from Lv 28+.

## Quick index

### Evolution lines

The level in brackets is when the previous stage evolves.

- **Embit** → Blazetail (Lv 14) → Cindervix (Lv 28)
- **Puddlop** → Puddleap (Lv 14) → Torrentoad (Lv 28)
- **Sprig** → Budnip (Lv 14) → Mossmaw (Lv 28)
- **Zippet** → Buzzhorn (Lv 15) → Arcbeetle (Lv 28)
- **Snowpup** → Rimecub (Lv 15) → Frostfang (Lv 28)
- **Fluffin** → Gustling (Lv 15) → Galehawk (Lv 28)
- **Pebblet** → Rubbler (Lv 15) → Cragmole (Lv 28)
- **Gloomlet** → Shadeling (Lv 16) → Duskwraith (Lv 28)
- **Shellby** → Reefling (Lv 16) → Coralclaw (Lv 28)
- **Sparkit** → Glidekit (Lv 15) → Voltglider (Lv 28)
- **Pipfrost** → Icesquire (Lv 16) → Glacieron (Lv 28)
- **Nibbat** → Flitfang (Lv 15) → Vesperwing (Lv 28)
- **Moonmew** → Crescat (Lv 16) → Lunacat (Lv 28)
- **Drizzlet** → Squallet (Lv 15) → Stormjelly (Lv 28)
- **Sunbun** → Sunhop (Lv 15) → Solarabbit (Lv 28)
- **Kindlepig** → Hearthog (Lv 12) → Furnasow (Lv 28, 100+ weekly PAI)
- **Needlefin** → Vanefin (Lv 16) → Lodestar (Lv 28)
- **Ampsnail** → Voltsnail (Lv 15) → Dynamollusk (Lv 28, 20,000 lead steps)
- **Pumpkling** → Gourdgrin (Lv 14) → Jackolord (Lv 28)
- **Sprinkit** → Dewcap (Lv 14) → Mossoon (Lv 28)
- **Basklet** → Baskadon (Lv 15) → Solaurus (Lv 28)
- **Hoofit** → Hoofstomp (Lv 15) → Thundrox (Lv 28)
- **Roamkit** → Roamfox (Lv 15) → Meridyx (Lv 28)
- **Dimwick** → Flickwick (Lv 15) → Snuffwick (Lv 28)

### By primary element

A name with `(+element)` has that element as its second type.

| Primary element | Creatures |
|---|---|
| Fire | Embit, Blazetail, Cindervix, Kindlepig, Hearthog, Furnasow (+Earth), Novapop (+Light), Basklet, Baskadon, Solaurus (+Earth), Roostar, Solarion, Pulsarex (+Electric), Emberwing (+Air) |
| Water | Puddlop, Puddleap, Torrentoad, Shellby, Reefling, Coralclaw (+Earth), Drizzlet, Squallet, Stormjelly (+Electric), Stillbill, Mistkoi, Siesturtle |
| Grass | Sprig, Budnip, Mossmaw, Sunbun, Sunhop, Solarabbit, Slothnap, Pumpkling, Gourdgrin, Jackolord (+Shadow), Woolamb, Glimmerpine (+Light), Sprinkit, Dewcap, Mossoon (+Water), Whirlnut |
| Electric | Zippet, Buzzhorn, Arcbeetle, Sparkit, Glidekit, Voltglider, Needlefin, Vanefin, Lodestar (+Light), Ampsnail, Voltsnail, Dynamollusk, Glowfly (+Light) |
| Ice | Snowpup, Rimecub, Frostfang, Pipfrost, Icesquire, Glacieron, Aurowl, Frostjay, Borealynx (+Light) |
| Air | Fluffin, Gustling, Galehawk, Dawnlark, Whirlwisp, Heartwing, Roamkit, Roamfox, Meridyx (+Earth), Lullamoth |
| Earth | Pebblet, Rubbler, Cragmole, Hoofit, Hoofstomp, Thundrox (+Electric), Duskadillo, Pandaze, Snackoon, Boulderon, Terramble (+Grass) |
| Shadow | Gloomlet, Shadeling, Duskwraith, Nibbat, Flitfang, Vesperwing, Moonmew, Crescat, Lunacat, Dimmouse, Mistlantern, Jinxcrow, Dimwick, Flickwick, Snuffwick (+Fire), Boolet (+Air), Midnyx (+Ice) |
| Light | Gloamstag, Sunquill, Eggling, Selenyx |

### Rares, legends and special availability

| Trigger | Creatures |
|---|---|
| Rare: noon (11:00–14:00) | Solarion |
| Rare: 10,000 steps in a day | Boulderon |
| Rare: midnight (23:00–01:00) | Midnyx |
| Rare: 30 high-heart-rate minutes in a day | Pulsarex |
| Rare: full-moon night | Selenyx |
| Dream visitor: after a good night's sleep | Lullamoth |
| Legend: 1,000,000 steps counted | Terramble |
| Legend: 7-day streak of 5,000+ steps a day | Emberwing |
| Night only (20:00–06:00) | Gloomlet, Shadeling, Duskwraith, Nibbat, Flitfang, Vesperwing, Moonmew, Crescat, Lunacat, Dimmouse |
| Weekend (Sat–Sun, 12:00–18:00) | Slothnap, Snackoon |
| Rain | Drizzlet, Squallet, Stormjelly, Sprinkit, Dewcap, Mossoon |
| Mist | Mistlantern, Mistkoi |
| Sun | Sunbun, Sunhop, Solarabbit, Basklet, Baskadon, Solaurus |
| Calories (300 kcal in a day) | Kindlepig, Hearthog, Furnasow, Hoofit, Hoofstomp, Thundrox |
| Low battery (<20%) | Ampsnail, Voltsnail, Dynamollusk, Dimwick, Flickwick, Snuffwick |
| North | Aurowl, Borealynx |
| East at dawn (05:00–09:00) | Dawnlark, Roostar |
| West at dusk (17:00–21:00) | Gloamstag, Duskadillo |
| South at midday (11:00–15:00) | Sunquill, Siesturtle |
| Full spin | Whirlwisp, Whirlnut |
| Steady heading | Stillbill, Pandaze |
| Working compass | Needlefin, Vanefin, Lodestar, Roamkit, Roamfox, Meridyx |
| Halloween (25 Oct–2 Nov) | Pumpkling, Gourdgrin, Jackolord, Boolet |
| December | Frostjay, Glimmerpine |
| Easter week | Eggling, Woolamb |
| New Year (31 Dec–2 Jan) | Novapop |
| Valentine's (12–16 Feb) | Heartwing |
| Midsummer nights (19–25 Jun) | Glowfly |
| Friday the 13th | Jinxcrow |

---

## All 106 creatures

### 001. Embit (`embit`)
- **Art:** A sitting fire-fox kit with a fluffy tail whose tip is a real flame. Orange fur, cream chest and muzzle, dark paws, big dark-tipped ears; tail flame as big as its head. Round bright amber eyes.
- **Elements:** Fire
- **Status:** Starter · first form · evolves → Blazetail (Lv 14)
- **Found:** Chosen as a starter; also wild and common.
- **Stats:** 44 HP / 54 ATK / 40 DEF / 58 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Ember, 7 Guard, 14 Flare Dash

### 002. Blazetail (`blazetail`)
- **Art:** A young fox standing on four slightly longer legs, with two flame-tipped tails and small ember-glowing ear tips. Keeps Embit's round face, colours and dark outline; no mane or adult proportions.
- **Elements:** Fire
- **Status:** Middle form · evolves → Cindervix (Lv 28)
- **Found:** Wild once your lead is Lv 13+.
- **Stats:** 58 HP / 71 ATK / 51 DEF / 74 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Ember, 7 Guard, 14 Flare Dash

### 003. Cindervix (`cindervix`)
- **Art:** A lean adult fire fox standing tall on four long legs, with three flame tails fanned out, one flame mane along the neck and back, and glowing ear tips. Deeper orange-red, cream chest, charcoal socks; sharp gold almond eyes.
- **Elements:** Fire
- **Status:** Final form
- **Found:** Wild once your lead is Lv 28+.
- **Stats:** 72 HP / 88 ATK / 62 DEF / 90 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Ember, 7 Guard, 14 Flare Dash

### 004. Puddlop (`puddlop`)
- **Art:** A round baby frog-tadpole with a chubby blue body, tail fin and big bubble eyes on top. Light blue, pale belly, pink cheeks, small head and back fin.
- **Elements:** Water
- **Status:** Starter · first form · evolves → Puddleap (Lv 14)
- **Found:** Chosen as a starter; also wild and common.
- **Stats:** 52 HP / 44 ATK / 50 DEF / 40 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Splash Jet, 7 Rest, 14 Tidal Crash

### 005. Puddleap (`puddleap`)
- **Art:** A young frog a little older and bigger: tail fin much shorter, small clear front legs and stronger back legs, one small back bump with a tiny water spray. Keeps Puddlop's round face and colours.
- **Elements:** Water
- **Status:** Middle form · evolves → Torrentoad (Lv 28)
- **Found:** Wild once your lead is Lv 13+.
- **Stats:** 71 HP / 60 ATK / 66 DEF / 48 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Splash Jet, 7 Rest, 14 Tidal Crash

### 006. Torrentoad (`torrentoad`)
- **Art:** A heavy toad squatting low with thick front legs, wide jaw, warty back and two water-cannon spouts like whale vents spraying white foam. Deep blue back, light blue belly, yellow heavy-lidded eyes.
- **Elements:** Water
- **Status:** Final form
- **Found:** Wild once your lead is Lv 28+.
- **Stats:** 90 HP / 76 ATK / 82 DEF / 56 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Splash Jet, 7 Rest, 14 Tidal Crash

### 007. Sprig (`sprig`)
- **Art:** A round lime-green seed-sprout with two leaves on a stem, tiny feet, small dark eyes and blush.
- **Elements:** Grass
- **Status:** Starter · first form · evolves → Budnip (Lv 14)
- **Found:** Chosen as a starter; also wild and common. The app icon is based on Sprig.
- **Stats:** 48 HP / 44 ATK / 52 DEF / 46 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Leaf Toss, 7 Rest, 14 Thorn Burst

### 008. Budnip (`budnip`)
- **Art:** A round Sprig-like sprout with a small closed flytrap bud between its two slightly bigger leaves, a few tiny teeth peeking out, and short root feet. The face stays cute and round.
- **Elements:** Grass
- **Status:** Middle form · evolves → Mossmaw (Lv 28)
- **Found:** Wild once your lead is Lv 13+.
- **Stats:** 69 HP / 61 ATK / 70 DEF / 47 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Leaf Toss, 7 Rest, 14 Thorn Burst

### 009. Mossmaw (`mossmaw`)
- **Art:** A round mossy flytrap creature with a leafy green body, a big red-pink flower crown on top, a broad grinning mouth with two small fangs and stubby brown root legs. Lime and dark greens, cream fangs, small fierce eyes.
- **Elements:** Grass
- **Status:** Final form
- **Found:** Wild once your lead is Lv 28+.
- **Stats:** 90 HP / 78 ATK / 88 DEF / 48 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Leaf Toss, 7 Rest, 14 Thorn Burst

### 010. Zippet (`zippet`)
- **Art:** A tiny round electric bug with antennae and a black lightning-bolt pattern on a yellow shell, with a dark head.
- **Elements:** Electric
- **Status:** Standard · first form · evolves → Buzzhorn (Lv 15)
- **Found:** Wild and common.
- **Stats:** 40 HP / 50 ATK / 38 DEF / 66 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Zap, 7 Guard, 14 Thunder Arc

### 011. Buzzhorn (`buzzhorn`)
- **Art:** Zippet grown a little longer and more beetle-like, with one small stubby horn tipped with a spark and slightly bigger wings. Still round and cute; no big pincers.
- **Elements:** Electric
- **Status:** Middle form · evolves → Arcbeetle (Lv 28)
- **Found:** Wild once your lead is Lv 13+.
- **Stats:** 53 HP / 70 ATK / 53 DEF / 74 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Zap, 7 Guard, 14 Thunder Arc

### 012. Arcbeetle (`arcbeetle`)
- **Art:** A big stag beetle with six strong legs, large pincer horns sparking like a Tesla coil and clear wings slightly open. Yellow shell with black bolt stripes kept from Zippet, dark armour, white-blue spark between the horns, shiny compound eyes.
- **Elements:** Electric
- **Status:** Final form
- **Found:** Wild once your lead is Lv 28+.
- **Stats:** 66 HP / 90 ATK / 68 DEF / 82 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Zap, 7 Guard, 14 Thunder Arc

### 013. Snowpup (`snowpup`)
- **Art:** A fluffy pale-blue puppy with a snowball-like coat, long pointed ears tipped with ice blue, a big frosty tail, ice-blue nose and a little crystal on its forehead. Big round blue eyes, pink tongue.
- **Elements:** Ice
- **Status:** Standard · first form · evolves → Rimecub (Lv 15)
- **Found:** Wild and common.
- **Stats:** 46 HP / 48 ATK / 44 DEF / 54 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Frost Bite, 7 Guard, 14 Blizzard

### 014. Rimecub (`rimecub`)
- **Art:** A lankier young pup with slightly longer legs and snout, two or three small ice crystals on its shoulders and a longer fluffy tail. Keeps Snowpup's snowy colours and cute face.
- **Elements:** Ice
- **Status:** Middle form · evolves → Frostfang (Lv 28)
- **Found:** Wild once your lead is Lv 13+.
- **Stats:** 59 HP / 67 ATK / 54 DEF / 69 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Frost Bite, 7 Guard, 14 Blizzard

### 015. Frostfang (`frostfang`)
- **Art:** A lean ice wolf mid-stride with 3–5 big jagged ice crystals along its spine and two ice fangs. White and pale-blue fur, transparent-looking blue crystals, narrow icy eyes glowing pale blue.
- **Elements:** Ice
- **Status:** Final form
- **Found:** Wild once your lead is Lv 28+.
- **Stats:** 72 HP / 86 ATK / 64 DEF / 84 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Frost Bite, 7 Guard, 14 Blizzard

### 016. Fluffin (`fluffin`)
- **Art:** A round fluffy chick made of cloud fluff, almost a ball, with tiny wings and a head tuft. White and pale lavender, yellow beak and feet, big shiny sleepy round eyes. Not an owl.
- **Elements:** Air
- **Status:** Standard · first form · evolves → Gustling (Lv 15)
- **Found:** Wild and common.
- **Stats:** 44 HP / 42 ATK / 42 DEF / 62 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Gust, 7 Rest, 14 Sky Dive

### 017. Gustling (`gustling`)
- **Art:** A scruffy fledgling, a little less round than Fluffin, with longer wings tipped in a few real feathers, a small feather crest and fluff still sticking out. Keeps the cloud-white chest.
- **Elements:** Air
- **Status:** Middle form · evolves → Galehawk (Lv 28)
- **Found:** Wild once your lead is Lv 13+.
- **Stats:** 56 HP / 62 ATK / 50 DEF / 80 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Gust, 7 Rest, 14 Sky Dive

### 018. Galehawk (`galehawk`)
- **Art:** A sleek hawk diving or with wings spread wide, wing tips trailing wind streaks. White chest kept from Fluffin, blue-lavender wings, yellow hooked beak and talons, sharp hawk eyes.
- **Elements:** Air
- **Status:** Final form
- **Found:** Wild once your lead is Lv 28+.
- **Stats:** 68 HP / 82 ATK / 58 DEF / 98 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Gust, 7 Rest, 14 Sky Dive

### 019. Pebblet (`pebblet`)
- **Art:** A small mole wearing a round pebble like a helmet, with big digging claws. Warm brown fur, grey stone helmet, pink nose and paws, tiny squinty eyes.
- **Elements:** Earth
- **Status:** Standard · first form · evolves → Rubbler (Lv 15)
- **Found:** Wild and common.
- **Stats:** 52 HP / 46 ATK / 58 DEF / 34 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Pebble Shot, 7 Guard, 14 Quake Slam

### 020. Rubbler (`rubbler`)
- **Art:** Pebblet grown a bit bigger: stone helmet enlarged with a crack, two small stone shoulder plates, slightly bigger pointier claws. Still cute; no drills or full armour.
- **Elements:** Earth
- **Status:** Middle form · evolves → Cragmole (Lv 28)
- **Found:** Wild once your lead is Lv 13+.
- **Stats:** 69 HP / 65 ATK / 77 DEF / 37 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Pebble Shot, 7 Guard, 14 Quake Slam

### 021. Cragmole (`cragmole`)
- **Art:** A large armoured mole covered in rocky plates and crystal spikes, with huge drill-like claws. Brown fur, grey and slate plates, a purple crystal, pink nose, small determined eyes under a rock brow.
- **Elements:** Earth
- **Status:** Final form
- **Found:** Wild once your lead is Lv 28+.
- **Stats:** 86 HP / 84 ATK / 96 DEF / 40 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Pebble Shot, 7 Guard, 14 Quake Slam

### 022. Gloomlet (`gloomlet`)
- **Art:** A small shy violet shadow-blob ghost with a wavy bottom edge, two stubby arms and a wisp curling off its top. Lighter rim, glowing yellow eyes.
- **Elements:** Shadow
- **Status:** Night only · first form · evolves → Shadeling (Lv 16)
- **Found:** 20:00–06:00.
- **Stats:** 42 HP / 54 ATK / 40 DEF / 56 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Hex, 7 Rest, 14 Night Terror

### 023. Shadeling (`shadeling`)
- **Art:** Gloomlet a bit taller with a small soft hood over the top of its head, face still fully visible, a longer wispy bottom and slightly longer little arms. Lavender glow edge and slightly glowing eyes.
- **Elements:** Shadow
- **Status:** Night only · middle form · evolves → Duskwraith (Lv 28)
- **Found:** 20:00–06:00; also wild once your lead is Lv 13+.
- **Stats:** 56 HP / 73 ATK / 50 DEF / 69 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Hex, 7 Rest, 14 Night Terror

### 024. Duskwraith (`duskwraith`)
- **Art:** A tall hooded wraith in a tattered deep-violet cloak with long thin hands; only two glowing yellow eyes show in the dark hood. Wavy bottom edge kept from Gloomlet, lighter purple edges.
- **Elements:** Shadow
- **Status:** Night only · final form
- **Found:** 20:00–06:00; also wild once your lead is Lv 28+.
- **Stats:** 70 HP / 92 ATK / 60 DEF / 82 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Hex, 7 Rest, 14 Night Terror

### 025. Shellby (`shellby`)
- **Art:** A little teal hermit crab in a cream and beige spiral shell, with pink claw tips and eyes on short stalks.
- **Elements:** Water
- **Status:** Standard · first form · evolves → Reefling (Lv 16)
- **Found:** Wild and common.
- **Stats:** 50 HP / 46 ATK / 62 DEF / 34 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Splash Jet, 7 Guard, 10 Rock Pinch, 16 Tidal Crash

### 026. Reefling (`reefling`)
- **Art:** Shellby with two or three small pink coral sprouts on top of its still-normal spiral shell, one claw a bit bigger, and a few pink spots on its legs.
- **Elements:** Water
- **Status:** Middle form · evolves → Coralclaw (Lv 28)
- **Found:** Wild once your lead is Lv 13+.
- **Stats:** 67 HP / 68 ATK / 81 DEF / 37 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Splash Jet, 7 Guard, 10 Rock Pinch, 16 Tidal Crash

### 027. Coralclaw (`coralclaw`)
- **Art:** A big crab whose shell has grown into a coral reef, with branching pink and orange coral on its back and one oversized claw. Teal body kept from Shellby, white highlights.
- **Elements:** Water / Earth
- **Status:** Final form
- **Found:** Wild once your lead is Lv 28+.
- **Stats:** 84 HP / 90 ATK / 100 DEF / 40 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Splash Jet, 7 Guard, 10 Rock Pinch, 16 Tidal Crash

### 028. Sparkit (`sparkit`)
- **Art:** A light-blue electric squirrel with a big tail ending in a star-shaped spark, cyan fur, round ears and a yellow star.
- **Elements:** Electric
- **Status:** Standard · first form · evolves → Glidekit (Lv 15)
- **Found:** Wild and common.
- **Stats:** 40 HP / 44 ATK / 38 DEF / 72 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Zap, 7 Rest, 10 Static Glide, 16 Thunder Arc

### 029. Glidekit (`glidekit`)
- **Art:** Sparkit standing on its back legs ready to jump, with small folded skin flaps between front and back legs and a bigger sparkling star on its tail. Not flying; no feathered wings.
- **Elements:** Electric
- **Status:** Middle form · evolves → Voltglider (Lv 28)
- **Found:** Wild once your lead is Lv 13+.
- **Stats:** 52 HP / 62 ATK / 48 DEF / 89 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Zap, 7 Rest, 10 Static Glide, 16 Thunder Arc

### 030. Voltglider (`voltglider`)
- **Art:** A flying squirrel gliding with skin flaps fully spread, lightning crackling along the flap edges, tail star kept. Cyan fur, yellow lightning edges, pale belly. No feathered wings.
- **Elements:** Electric
- **Status:** Final form
- **Found:** Wild once your lead is Lv 28+.
- **Stats:** 64 HP / 80 ATK / 58 DEF / 106 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Zap, 7 Rest, 10 Static Glide, 16 Thunder Arc

### 031. Pipfrost (`pipfrost`)
- **Art:** A small round penguin chick with navy-and-white body, yellow beak and a little ice-crystal crest.
- **Elements:** Ice
- **Status:** Standard · first form · evolves → Icesquire (Lv 16)
- **Found:** Wild and common.
- **Stats:** 50 HP / 42 ATK / 50 DEF / 42 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Frost Bite, 7 Rest, 10 Belly Slide, 16 Blizzard

### 032. Icesquire (`icesquire`)
- **Art:** Pipfrost grown into a slightly taller young penguin with its ice crest developed into a small ice helmet and a small round ice buckler in one flipper. No crown or big armour.
- **Elements:** Ice
- **Status:** Middle form · evolves → Glacieron (Lv 28)
- **Found:** Wild once your lead is Lv 13+.
- **Stats:** 72 HP / 62 ATK / 69 DEF / 44 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Frost Bite, 7 Rest, 10 Belly Slide, 16 Blizzard

### 033. Glacieron (`glacieron`)
- **Art:** A tall emperor-penguin knight with an icicle crown, clear ice armour and an ice shield. Navy back, white front and yellow beak kept from Pipfrost.
- **Elements:** Ice
- **Status:** Final form
- **Found:** Wild once your lead is Lv 28+.
- **Stats:** 94 HP / 82 ATK / 88 DEF / 46 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Frost Bite, 7 Rest, 10 Belly Slide, 16 Blizzard

### 034. Nibbat (`nibbat`)
- **Art:** A round small violet bat with big ears, folded lighter wing membranes, pink inner ears and a tiny fang. Big round pink-glowing baby eyes.
- **Elements:** Shadow
- **Status:** Night only · first form · evolves → Flitfang (Lv 15)
- **Found:** 20:00–06:00.
- **Stats:** 40 HP / 50 ATK / 38 DEF / 66 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Hex, 7 Guard, 10 Wing Bite, 16 Night Terror

### 035. Flitfang (`flitfang`)
- **Art:** Nibbat with bigger half-spread wings, two small fangs in its smile and a small tuft of lighter fur on its chest. Keeps the big glossy eyes and lavender glow edge.
- **Elements:** Shadow
- **Status:** Night only · middle form · evolves → Vesperwing (Lv 28)
- **Found:** 20:00–06:00; also wild once your lead is Lv 13+.
- **Stats:** 54 HP / 68 ATK / 48 DEF / 82 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Hex, 7 Guard, 10 Wing Bite, 16 Night Terror

### 036. Vesperwing (`vesperwing`)
- **Art:** A large vampire bat with huge spread wings, a lilac fur ruff around its neck and a small crescent mark on its forehead. Deep purple, tall slim regal pose, red-pink eyes.
- **Elements:** Shadow
- **Status:** Night only · final form
- **Found:** 20:00–06:00; also wild once your lead is Lv 28+.
- **Stats:** 68 HP / 86 ATK / 58 DEF / 98 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Hex, 7 Guard, 10 Wing Bite, 16 Night Terror

### 037. Moonmew (`moonmew`)
- **Art:** A small lavender-purple kitten with a pale-yellow crescent on its forehead and a curled tail tip glowing like a tiny moon. White muzzle, large slightly sleepy gold eyes.
- **Elements:** Shadow
- **Status:** Night only · first form · evolves → Crescat (Lv 16)
- **Found:** 20:00–06:00.
- **Stats:** 44 HP / 52 ATK / 42 DEF / 64 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Hex, 7 Guard, 10 Moon Claw, 16 Night Terror

### 038. Crescat (`crescat`)
- **Art:** A slimmer young cat on four legs with a few tiny stars twinkling in its fur and a softly glowing forehead crescent. Keeps Moonmew's lavender face; no panther build or halo yet.
- **Elements:** Shadow
- **Status:** Night only · middle form · evolves → Lunacat (Lv 28)
- **Found:** 20:00–06:00; also wild once your lead is Lv 13+.
- **Stats:** 57 HP / 71 ATK / 52 DEF / 82 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Hex, 7 Guard, 10 Moon Claw, 16 Night Terror

### 039. Lunacat (`lunacat`)
- **Art:** A sleek tall night panther dotted with tiny yellow stars like a night sky, with a crescent-moon halo above its head. Dark indigo with lighter violet edges, glowing gold slit eyes.
- **Elements:** Shadow
- **Status:** Night only · final form
- **Found:** 20:00–06:00; also wild once your lead is Lv 28+.
- **Stats:** 70 HP / 90 ATK / 62 DEF / 100 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Hex, 7 Guard, 10 Moon Claw, 16 Night Terror

### 040. Drizzlet (`drizzlet`)
- **Art:** A small fluffy white and pale-grey rain cloud with a happy face and blue raindrops dangling underneath like little legs. Pink cheeks.
- **Elements:** Water
- **Status:** Condition (rain) · first form · evolves → Squallet (Lv 15)
- **Found:** Rain today.
- **Stats:** 46 HP / 48 ATK / 44 DEF / 52 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Splash Jet, 7 Rest, 10 Static Rain, 16 Tidal Crash

### 041. Squallet (`squallet`)
- **Art:** A rain cloud turning grey on the bottom half, with short dripping tendrils instead of drops and one tiny spark beside it. Keeps the cute face; no long tentacles or storm bolt.
- **Elements:** Water
- **Status:** Condition (rain) · middle form · evolves → Stormjelly (Lv 28)
- **Found:** Rain today; also wild once your lead is Lv 13+.
- **Stats:** 61 HP / 66 ATK / 57 DEF / 63 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Splash Jet, 7 Rest, 10 Static Rain, 16 Tidal Crash

### 042. Stormjelly (`stormjelly`)
- **Art:** A jellyfish made of a storm cloud: dark slate-grey rumbling cloud dome, long blue rain tentacles and yellow lightning crackling between them. Frowning face.
- **Elements:** Water / Electric
- **Status:** Condition (rain) · final form
- **Found:** Rain today; also wild once your lead is Lv 28+.
- **Stats:** 76 HP / 84 ATK / 70 DEF / 74 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Splash Jet, 7 Rest, 10 Static Rain, 16 Tidal Crash

### 043. Sunbun (`sunbun`)
- **Art:** A round cream bunny whose long ears end in sunflower petals, with a pink nose and happy bright brown eyes.
- **Elements:** Grass
- **Status:** Condition (sun) · first form · evolves → Sunhop (Lv 15)
- **Found:** Sunny today.
- **Stats:** 46 HP / 46 ATK / 44 DEF / 60 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Leaf Toss, 7 Guard, 10 Sunburst, 16 Thorn Burst

### 044. Sunhop (`sunhop`)
- **Art:** A lankier bunny with longer ears and back feet, bigger sunflower petals on its ears and a small closed sunflower bud on its chest. Keeps Sunbun's cute round face.
- **Elements:** Grass
- **Status:** Condition (sun) · middle form · evolves → Solarabbit (Lv 28)
- **Found:** Sunny today; also wild once your lead is Lv 13+.
- **Stats:** 59 HP / 65 ATK / 55 DEF / 76 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Leaf Toss, 7 Guard, 10 Sunburst, 16 Thorn Burst

### 045. Solarabbit (`solarabbit`)
- **Art:** An athletic cream rabbit with orange flame-like markings, long ears tipped with yellow-orange petals, a big sunflower ruff around its neck and chest, and a sweeping flame-shaped tail. Yellow petals, orange centre, alert brown eyes.
- **Elements:** Grass
- **Status:** Condition (sun) · final form
- **Found:** Sunny today; also wild once your lead is Lv 28+.
- **Stats:** 72 HP / 84 ATK / 66 DEF / 92 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Leaf Toss, 7 Guard, 10 Sunburst, 16 Thorn Burst

### 046. Kindlepig (`kindlepig`)
- **Art:** A little peach-pink piglet with a glowing coal on its back and a tiny flame curl for a tail. Orange glow, small cheerful eyes.
- **Elements:** Fire
- **Status:** Condition (calories) · first form · evolves → Hearthog (Lv 12)
- **Found:** After burning 300 kcal in a day.
- **Stats:** 54 HP / 48 ATK / 52 DEF / 38 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Ember, 7 Rest, 10 Mud Roll, 16 Flare Dash

### 047. Hearthog (`hearthog`)
- **Art:** A chubbier piglet with a small iron band around its belly and a little glowing grate on its side; the back coal is bigger with a tiny puff of smoke. No full stove body or tusks yet.
- **Elements:** Fire
- **Status:** Condition (calories) · middle form · evolves → Furnasow (Lv 28, also 100+ weekly PAI)
- **Found:** After burning 300 kcal in a day; also wild once your lead is Lv 13+.
- **Stats:** 75 HP / 67 ATK / 68 DEF / 39 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Ember, 7 Rest, 10 Mud Roll, 16 Flare Dash

### 048. Furnasow (`furnasow`)
- **Art:** A big pig partly made into a cast-iron stove: round iron furnace belly with a glowing door, chimney puffing smoke on its back, and tusks. Pink-orange skin, dark iron plates, yellow-orange glow, grey smoke.
- **Elements:** Fire / Earth
- **Status:** Condition (calories) · final form
- **Found:** After burning 300 kcal in a day; also wild once your lead is Lv 28+.
- **Stats:** 96 HP / 86 ATK / 84 DEF / 40 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Ember, 7 Rest, 10 Mud Roll, 16 Flare Dash

### 049. Slothnap (`slothnap`)
- **Art:** A beige-brown sloth hanging from a branch, half asleep, with green moss growing on its fur and little "z" sleep bubbles.
- **Elements:** Grass
- **Status:** Condition (weekend)
- **Found:** Saturday or Sunday, 12:00–18:00.
- **Stats:** 96 HP / 62 ATK / 90 DEF / 20 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Leaf Toss, 1 Long Nap, 14 Thorn Burst

### 050. Dimmouse (`dimmouse`)
- **Art:** A dusky grey-purple mouse with huge round ears, pink ears and nose, and huge round reflective night-vision eyes; tail curled around itself.
- **Elements:** Shadow
- **Status:** Night only
- **Found:** 20:00–06:00.
- **Stats:** 50 HP / 58 ATK / 44 DEF / 84 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Hex, 7 Guard, 10 Pebble Shot, 16 Night Terror

### 051. Mistlantern (`mistlantern`)
- **Art:** A ghostly wisp in a pointy hood holding a lantern on a pole, lower body fading into mist. Misty pale grey and violet, warm yellow lantern glow, dark face with bright eyes.
- **Elements:** Shadow
- **Status:** Condition (mist)
- **Found:** Fog or haze, or a night after enough steps.
- **Stats:** 64 HP / 70 ATK / 60 DEF / 68 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Hex, 7 Rest, 10 Ember, 16 Night Terror

### 052. Aurowl (`aurowl`)
- **Art:** A snowy white owl with big round gold eyes and an aurora shimmer (blue, green-teal, pink) on its wing feathers.
- **Elements:** Ice
- **Status:** Condition (compass)
- **Found:** Watch pointing north.
- **Stats:** 70 HP / 70 ATK / 66 DEF / 80 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Frost Bite, 7 Rest, 10 Hex, 16 Blizzard

### 053. Dawnlark (`dawnlark`)
- **Art:** A small songbird in warm peach and cream with a yellow star crest and an orange tail.
- **Elements:** Air
- **Status:** Condition (compass)
- **Found:** Watch pointing east, 05:00–09:00.
- **Stats:** 50 HP / 52 ATK / 46 DEF / 78 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Gust, 7 Rest, 10 Ember, 16 Sky Dive

### 054. Needlefin (`needlefin`)
- **Art:** A slim needle-nosed fish shaped like a compass needle: red front, silver-white back, yellow magnet-coloured fin, small alert eyes.
- **Elements:** Electric
- **Status:** Condition (compass) · first form · evolves → Vanefin (Lv 16)
- **Found:** Working compass; flees if you face away.
- **Stats:** 48 HP / 52 ATK / 44 DEF / 76 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Zap, 7 Guard, 10 Splash Jet, 16 Thunder Arc

### 055. Vanefin (`vanefin`)
- **Art:** Needlefin grown slightly longer and stronger, with two new small fins (one on top, one underneath) starting to make a cross and a small glowing dot in the middle. No big star or gold points yet.
- **Elements:** Electric
- **Status:** Condition (compass) · middle form · evolves → Lodestar (Lv 28)
- **Found:** Working compass; flees if you face away; also wild once your lead is Lv 13+.
- **Stats:** 61 HP / 68 ATK / 55 DEF / 86 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Zap, 7 Guard, 10 Splash Jet, 16 Thunder Arc

### 056. Lodestar (`lodestar`)
- **Art:** A bigger armoured swordfish whose body is a compass rose: four compass-point fins, gold fin points, a big glowing yellow star in the centre. Red and silver kept from Needlefin.
- **Elements:** Electric / Light
- **Status:** Condition (compass) · final form
- **Found:** Working compass; flees if you face away; also wild once your lead is Lv 28+.
- **Stats:** 74 HP / 84 ATK / 66 DEF / 96 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Zap, 7 Guard, 10 Splash Jet, 16 Thunder Arc

### 057. Gloamstag (`gloamstag`)
- **Art:** A graceful young deer of light standing calmly, small branching antlers glowing warm orange-gold, soft cream and peach coat fading to dusky lavender on the legs, tiny glowing specks around the antlers. Gentle almond eyes.
- **Elements:** Light
- **Status:** Condition (compass)
- **Found:** Watch pointing west, 17:00–21:00.
- **Stats:** 64 HP / 72 ATK / 58 DEF / 78 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Glow, 7 Rest, 10 Gust, 16 Radiance

### 058. Sunquill (`sunquill`)
- **Art:** A round little hedgehog of light with short golden sunray quills fanning out like a halo, warm cream face and belly, small pink nose and paws, quill tips glowing white-yellow. Happy round eyes.
- **Elements:** Light
- **Status:** Condition (compass)
- **Found:** Watch pointing south, 11:00–15:00.
- **Stats:** 68 HP / 66 ATK / 74 DEF / 58 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Glow, 7 Guard, 10 Ember, 16 Radiance

### 059. Whirlwisp (`whirlwisp`)
- **Art:** A playful whirlwind spirit: a swirling cone of pale blue and white wind with a cute round face near the top, two wispy arms, leaves caught in the spiral, bottom tapering to a curly point. Bright excited eyes.
- **Elements:** Air
- **Status:** Condition (compass)
- **Found:** Turn a full circle on the den, then explore.
- **Stats:** 52 HP / 66 ATK / 46 DEF / 92 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Gust, 7 Guard, 10 Zap, 16 Sky Dive

### 060. Stillbill (`stillbill`)
- **Art:** A patient little heron standing perfectly still on one leg, blue-grey and white feathers, long pointed yellow beak, small feather crest, calm ripple pattern on its wings. Half-closed serene eyes.
- **Elements:** Water
- **Status:** Condition (compass)
- **Found:** Hold one heading on the den, then explore.
- **Stats:** 70 HP / 74 ATK / 60 DEF / 62 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Splash Jet, 7 Rest, 10 Wing Bite, 16 Tidal Crash

### 061. Ampsnail (`ampsnail`)
- **Art:** A cute little snail whose shell is a small battery with a charge meter showing one red bar, soft yellow body, antennae ending in tiny sparks, sleepy hungry look.
- **Elements:** Electric
- **Status:** Condition (battery) · first form · evolves → Voltsnail (Lv 15)
- **Found:** Watch battery under 20%.
- **Stats:** 52 HP / 40 ATK / 62 DEF / 30 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Zap, 7 Guard, 10 Rock Pinch, 16 Thunder Arc

### 062. Voltsnail (`voltsnail`)
- **Art:** Ampsnail a bit older and bigger: charge meter shows two or three bars, one small copper coil on top of the shell, antennae a bit longer with bigger sparks. Still cute; no big dynamo or armour.
- **Elements:** Electric
- **Status:** Condition (battery) · middle form · evolves → Dynamollusk (Lv 28, also 20,000 lead steps)
- **Found:** Watch battery under 20%; also wild once your lead is Lv 13+.
- **Stats:** 68 HP / 60 ATK / 80 DEF / 38 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Zap, 7 Guard, 10 Rock Pinch, 16 Thunder Arc

### 063. Dynamollusk (`dynamollusk`)
- **Art:** A big powerful snail with a large dynamo shell, spinning copper coils, a full green charge meter, electricity crackling between two big antennae and a sturdier armoured body. Yellow body and battery colours kept, determined eyes.
- **Elements:** Electric
- **Status:** Condition (battery) · final form
- **Found:** Watch battery under 20%; also wild once your lead is Lv 28+.
- **Stats:** 86 HP / 82 ATK / 100 DEF / 46 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Zap, 7 Guard, 10 Rock Pinch, 16 Thunder Arc

### 064. Pumpkling (`pumpkling`)
- **Art:** A tiny round pumpkin sprout with a cute carved grin and warm-orange glowing triangle eyes, a curly green vine and one leaf on top, two stubby root feet. Friendly and mischievous.
- **Elements:** Grass
- **Status:** Condition (Halloween) · first form · evolves → Gourdgrin (Lv 14)
- **Found:** 25 Oct – 2 Nov.
- **Stats:** 50 HP / 48 ATK / 50 DEF / 42 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Leaf Toss, 7 Rest, 10 Hex, 16 Thorn Burst

### 065. Gourdgrin (`gourdgrin`)
- **Art:** Pumpkling a little older and bigger: wider grin glowing brighter, two short vine arms, and a small scrap of dark-purple cloth tied like a scarf. No cape or crown yet.
- **Elements:** Grass
- **Status:** Condition (Halloween) · middle form · evolves → Jackolord (Lv 28)
- **Found:** 25 Oct – 2 Nov; also wild once your lead is Lv 13+.
- **Stats:** 68 HP / 68 ATK / 66 DEF / 50 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Leaf Toss, 7 Rest, 10 Hex, 16 Thorn Burst

### 066. Jackolord (`jackolord`)
- **Art:** A proud big pumpkin lord with a carved jack-o'-lantern head, wide warm-orange glowing grin, tattered dark-purple cape, long twisting vine arms and a small crown of curled vines. Fun-spooky, with a lavender glow edge.
- **Elements:** Grass / Shadow
- **Status:** Condition (Halloween) · final form
- **Found:** 25 Oct – 2 Nov; also wild once your lead is Lv 28+.
- **Stats:** 86 HP / 90 ATK / 80 DEF / 60 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Leaf Toss, 7 Rest, 10 Hex, 16 Thorn Burst

### 067. Frostjay (`frostjay`)
- **Art:** A cheerful blue jay with a pointed crest, bright ice-blue and white feathers, a cosy scarf made of little icicles and a few snowflakes on its wing tips. Bright cheeky eyes.
- **Elements:** Ice
- **Status:** Condition (December)
- **Found:** December.
- **Stats:** 56 HP / 68 ATK / 52 DEF / 86 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Frost Bite, 7 Guard, 10 Wing Bite, 16 Blizzard

### 068. Eggling (`eggling`)
- **Art:** A small round chick peeking out of a cracked pastel-cream Easter egg with soft pink and mint zigzag stripes; fluffy pale-yellow chick, tiny orange beak, stubby wings on the shell rim, faint warm glow. Sweet curious eyes.
- **Elements:** Light
- **Status:** Condition (Easter)
- **Found:** Easter week, Palm Sunday to Easter Monday (Western or Orthodox).
- **Stats:** 54 HP / 46 ATK / 70 DEF / 44 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Glow, 7 Guard, 10 Gust, 16 Radiance

### 069. Woolamb (`woolamb`)
- **Art:** A fluffy spring lamb with a cloud-like cream wool coat, soft light-brown face and legs, small floppy ears and a little crown of white and yellow spring flowers with green leaves. Gentle sleepy-happy eyes.
- **Elements:** Grass
- **Status:** Condition (Easter)
- **Found:** Easter week, Palm Sunday to Easter Monday (Western or Orthodox).
- **Stats:** 68 HP / 50 ATK / 64 DEF / 48 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Leaf Toss, 7 Rest, 10 Glow, 16 Thorn Burst

### 070. Glimmerpine (`glimmerpine`)
- **Art:** A little walking fir tree with layered dark-green branch body, two short wooden stump feet, a happy face in the lowest branches, tiny red and gold glowing ornaments, snow on branch tips and a glowing golden star on top. Cheerful eyes.
- **Elements:** Grass / Light
- **Status:** Condition (December)
- **Found:** December.
- **Stats:** 72 HP / 66 ATK / 76 DEF / 40 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Leaf Toss, 7 Guard, 10 Glow, 16 Thorn Burst

### 071. Novapop (`novapop`)
- **Art:** A small round firework creature: red-and-gold striped rocket-shell body, short fizzing fuse tail with a bright spark, and a crest-like burst of gold, pink and blue sparkles from its head. Excited bright eyes, big grin.
- **Elements:** Fire / Light
- **Status:** Condition (New Year)
- **Found:** 31 Dec – 2 Jan.
- **Stats:** 50 HP / 78 ATK / 44 DEF / 84 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Ember, 7 Guard, 10 Radiance, 16 Flare Dash

### 072. Heartwing (`heartwing`)
- **Art:** A small soft songbird with rosy pink and white feathers, wings shaped like hearts, a tiny heart-shaped head tuft, curled tail and pale pink cheeks. Sweet shy eyes.
- **Elements:** Air
- **Status:** Condition (Valentine's)
- **Found:** 12 – 16 Feb.
- **Stats:** 56 HP / 60 ATK / 50 DEF / 82 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Gust, 7 Rest, 10 Glow, 16 Sky Dive

### 073. Glowfly (`glowfly`)
- **Art:** A chubby firefly with a dark navy body, round clear wings with faint blue shimmer, curly antennae tipped with tiny sparks and a big round tail lantern glowing warm yellow-green. Friendly big eyes.
- **Elements:** Electric / Light
- **Status:** Condition (midsummer nights)
- **Found:** 19 – 25 Jun, 20:00–06:00.
- **Stats:** 48 HP / 62 ATK / 44 DEF / 88 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Zap, 7 Guard, 10 Glow, 16 Thunder Arc

### 074. Jinxcrow (`jinxcrow`)
- **Art:** A mischievous young crow with glossy blue-black feathers, messy head tuft, smug lopsided grin, a small cracked mirror charm on a string around its neck and one wing raised as if about to play a trick. Clever cheeky eyes, lavender glow edge.
- **Elements:** Shadow
- **Status:** Condition (Friday the 13th)
- **Found:** Any Friday the 13th.
- **Stats:** 58 HP / 74 ATK / 50 DEF / 80 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Hex, 7 Guard, 10 Wing Bite, 16 Night Terror

### 075. Sprinkit (`sprinkit`)
- **Art:** A tiny mushroom sprout with a round pale-green cap dotted with water droplets, soft cream stem body, two stubby feet and a little leaf sticking out of the cap like an antenna. Happy sleepy eyes.
- **Elements:** Grass
- **Status:** Condition (rain) · first form · evolves → Dewcap (Lv 14)
- **Found:** Rain today.
- **Stats:** 48 HP / 44 ATK / 50 DEF / 46 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Leaf Toss, 7 Rest, 10 Splash Jet, 16 Thorn Burst

### 076. Dewcap (`dewcap`)
- **Art:** Sprinkit grown a bit: cap wider and drooping at the edges like a small umbrella, a few moss tufts on its body and two short root arms. No big ferns or water streams yet.
- **Elements:** Grass
- **Status:** Condition (rain) · middle form · evolves → Mossoon (Lv 28)
- **Found:** Rain today; also wild once your lead is Lv 13+.
- **Stats:** 63 HP / 62 ATK / 65 DEF / 58 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Leaf Toss, 7 Rest, 10 Splash Jet, 16 Thorn Burst

### 077. Mossoon (`mossoon`)
- **Art:** A big mossy rain spirit: wide dark-green umbrella-like mushroom cap with water running off the rim in little streams, sturdy mossy body with small ferns and strong root legs. Keeps the pale-green cap and cream body colours.
- **Elements:** Grass / Water
- **Status:** Condition (rain) · final form
- **Found:** Rain today; also wild once your lead is Lv 28+.
- **Stats:** 78 HP / 80 ATK / 80 DEF / 70 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Leaf Toss, 7 Rest, 10 Splash Jet, 16 Thorn Burst

### 078. Basklet (`basklet`)
- **Art:** A small round orange lizard lying happily on its belly, yellow spots, short curly tail with a tiny flame at the tip and a sunny yellow frill folded behind its head. Content half-closed eyes.
- **Elements:** Fire
- **Status:** Condition (sun) · first form · evolves → Baskadon (Lv 15)
- **Found:** Sunny today.
- **Stats:** 44 HP / 52 ATK / 46 DEF / 50 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Ember, 7 Guard, 10 Pebble Shot, 16 Flare Dash

### 079. Baskadon (`baskadon`)
- **Art:** Basklet a bit bigger: frill half open, a short row of small sandy plates on its back and a slightly bigger tail flame. Keeps the orange scales and yellow frill.
- **Elements:** Fire
- **Status:** Condition (sun) · middle form · evolves → Solaurus (Lv 28)
- **Found:** Sunny today; also wild once your lead is Lv 13+.
- **Stats:** 61 HP / 71 ATK / 62 DEF / 61 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Ember, 7 Guard, 10 Pebble Shot, 16 Flare Dash

### 080. Solaurus (`solaurus`)
- **Art:** A big proud sun dinosaur with thick orange and sandy-brown scales, a huge open sun-yellow frill like a halo, rocky back plates and a long flame-tipped tail. Orange scales and yellow frill kept from Basklet.
- **Elements:** Fire / Earth
- **Status:** Condition (sun) · final form
- **Found:** Sunny today; also wild once your lead is Lv 28+.
- **Stats:** 78 HP / 90 ATK / 78 DEF / 72 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Ember, 7 Guard, 10 Pebble Shot, 16 Flare Dash

### 081. Hoofit (`hoofit`)
- **Art:** A sturdy little calf with a warm brown coat, cream muzzle, tiny rounded horn nubs, fluffy head tuft and stubby hooves kicking up a puff of dust. Eager determined eyes.
- **Elements:** Earth
- **Status:** Condition (calories) · first form · evolves → Hoofstomp (Lv 15)
- **Found:** After burning 300 kcal in a day.
- **Stats:** 54 HP / 52 ATK / 50 DEF / 38 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Pebble Shot, 7 Guard, 10 Zap, 16 Quake Slam

### 082. Hoofstomp (`hoofstomp`)
- **Art:** Hoofit a little older and bigger: small curved horns instead of nubs, slightly shaggier tuft and shoulders, and one tiny yellow spark near its horns. No huge mane or lightning yet.
- **Elements:** Earth
- **Status:** Condition (calories) · middle form · evolves → Thundrox (Lv 28)
- **Found:** After burning 300 kcal in a day; also wild once your lead is Lv 13+.
- **Stats:** 70 HP / 71 ATK / 68 DEF / 50 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Pebble Shot, 7 Guard, 10 Zap, 16 Quake Slam

### 083. Thundrox (`thundrox`)
- **Art:** A mighty storm ox with a big muscular brown body, curved horns crackling with small yellow lightning sparks, a thick shaggy mane and heavy hooves. Warm coat and cream muzzle kept from Hoofit.
- **Elements:** Earth / Electric
- **Status:** Condition (calories) · final form
- **Found:** After burning 300 kcal in a day; also wild once your lead is Lv 28+.
- **Stats:** 86 HP / 90 ATK / 86 DEF / 62 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Pebble Shot, 7 Guard, 10 Zap, 16 Quake Slam

### 084. Roamkit (`roamkit`)
- **Art:** A little traveller fox kit with sky-blue and white fur, very big ears, a fluffy tail with a compass-rose pattern at the tip and a tiny satchel strap across its chest. Curious adventurous eyes.
- **Elements:** Air
- **Status:** Condition (compass) · first form · evolves → Roamfox (Lv 15)
- **Found:** Working compass; flees with "ran off" if you face away.
- **Stats:** 46 HP / 48 ATK / 44 DEF / 58 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Gust, 7 Rest, 10 Pebble Shot, 16 Sky Dive

### 085. Roamfox (`roamfox`)
- **Art:** Roamkit a bit older: legs a bit longer, tail longer and splitting slightly at the tip, and a faint compass mark on its forehead. No three tails or stone bracers yet.
- **Elements:** Air
- **Status:** Condition (compass) · middle form · evolves → Meridyx (Lv 28)
- **Found:** Working compass; flees if you face away; also wild once your lead is Lv 13+.
- **Stats:** 61 HP / 65 ATK / 57 DEF / 75 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Gust, 7 Rest, 10 Pebble Shot, 16 Sky Dive

### 086. Meridyx (`meridyx`)
- **Art:** A graceful wind fox with long legs, sky-blue and white fur, three flowing tails, a glowing compass-rose mark on its forehead and small stone bracers on its front legs. Keeps the compass theme from Roamkit.
- **Elements:** Air / Earth
- **Status:** Condition (compass) · final form
- **Found:** Working compass; flees if you face away; also wild once your lead is Lv 28+.
- **Stats:** 76 HP / 82 ATK / 70 DEF / 92 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Gust, 7 Rest, 10 Pebble Shot, 16 Sky Dive

### 087. Dimwick (`dimwick`)
- **Art:** A tiny stubby candle creature with a short purple-grey wax body, wax drips like little arms and a small flickering almost-out flame on its head glowing dim violet. Sleepy droopy eyes, lavender glow edge.
- **Elements:** Shadow
- **Status:** Condition (battery) · first form · evolves → Flickwick (Lv 15)
- **Found:** Watch battery under 20%.
- **Stats:** 44 HP / 54 ATK / 42 DEF / 48 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Hex, 7 Rest, 10 Ember, 16 Night Terror

### 088. Flickwick (`flickwick`)
- **Art:** Dimwick a little taller with a bigger, steadier flame and one small wax branch carrying a second tiny flame. Keeps the purple-grey wax and violet glow.
- **Elements:** Shadow
- **Status:** Condition (battery) · middle form · evolves → Snuffwick (Lv 28)
- **Found:** Watch battery under 20%; also wild once your lead is Lv 13+.
- **Stats:** 60 HP / 71 ATK / 56 DEF / 61 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Hex, 7 Rest, 10 Ember, 16 Night Terror

### 089. Snuffwick (`snuffwick`)
- **Art:** A tall dark-purple candelabra spirit with three small flames on curling wax branches burning violet and orange, and smoky wisps around it. Purple-grey wax and violet flame kept from Dimwick, lavender glow edge.
- **Elements:** Shadow / Fire
- **Status:** Condition (battery) · final form
- **Found:** Watch battery under 20%; also wild once your lead is Lv 28+.
- **Stats:** 76 HP / 88 ATK / 70 DEF / 74 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Hex, 7 Rest, 10 Ember, 16 Night Terror

### 090. Mistkoi (`mistkoi`)
- **Art:** A small floating koi swimming in air, pale white and soft grey scales with a few coral-orange patches, long veil-like fins fading into mist and a faint wisp of fog trailing behind. Calm dreamy eyes.
- **Elements:** Water
- **Status:** Condition (mist)
- **Found:** Fog or haze, or a misty night after enough steps.
- **Stats:** 62 HP / 64 ATK / 58 DEF / 76 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Splash Jet, 7 Rest, 10 Hex, 16 Tidal Crash

### 091. Borealynx (`borealynx`)
- **Art:** A young snow lynx with pale blue-white fur, tufted ears glowing green-violet at the tips and soft aurora stripes (green, teal, violet) shimmering along its back and tail. Bright alert eyes.
- **Elements:** Ice / Light
- **Status:** Condition (compass)
- **Found:** Watch pointing north.
- **Stats:** 66 HP / 74 ATK / 58 DEF / 82 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Frost Bite, 7 Guard, 10 Glow, 16 Blizzard

### 092. Roostar (`roostar`)
- **Art:** A proud little rooster with warm red and orange feathers, a bright yellow comb shaped like a rising sun, golden tail feathers fanned out and chest puffed as if about to crow. Cheerful confident eyes.
- **Elements:** Fire
- **Status:** Condition (compass)
- **Found:** Watch pointing east, 05:00–09:00.
- **Stats:** 58 HP / 70 ATK / 52 DEF / 80 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Ember, 7 Rest, 10 Wing Bite, 16 Flare Dash

### 093. Duskadillo (`duskadillo`)
- **Art:** A round armadillo with shell bands coloured like a sunset sky (orange to pink to deep purple), small dusty-brown snout and ears and a few tiny stars on its back shell. Shy gentle eyes.
- **Elements:** Earth
- **Status:** Condition (compass)
- **Found:** Watch pointing west, 17:00–21:00.
- **Stats:** 70 HP / 60 ATK / 88 DEF / 44 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Pebble Shot, 7 Guard, 10 Hex, 16 Quake Slam

### 094. Siesturtle (`siesturtle`)
- **Art:** A chubby sea turtle napping happily with a teal shell, a little straw sun hat resting on top, soft green flippers and a small water droplet on its nose. Relaxed sleepy eyes.
- **Elements:** Water
- **Status:** Condition (compass)
- **Found:** Watch pointing south, 11:00–15:00.
- **Stats:** 80 HP / 56 ATK / 84 DEF / 30 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Splash Jet, 1 Long Nap, 10 Mud Roll, 16 Tidal Crash

### 095. Whirlnut (`whirlnut`)
- **Art:** A lively acorn creature shaped like a spinning top, with a brown acorn body, leafy cap, two tiny leaf arms held out, pointed balancing tip and small swirl lines around it. Dizzy happy eyes.
- **Elements:** Grass
- **Status:** Condition (compass)
- **Found:** Turn a full circle on the den, then explore.
- **Stats:** 54 HP / 68 ATK / 62 DEF / 80 SPD
- **Favourite berry:** Red
- **Moves:** 1 Tackle, 1 Leaf Toss, 7 Guard, 10 Gust, 16 Thorn Burst

### 096. Pandaze (`pandaze`)
- **Art:** A round little panda sitting cross-legged like it is meditating, black-and-white coat, a small bamboo leaf on its head, paws on its knees and a calm peaceful smile. Closed serene eyes.
- **Elements:** Earth
- **Status:** Condition (compass)
- **Found:** Hold one heading on the den, then explore.
- **Stats:** 88 HP / 70 ATK / 80 DEF / 34 SPD
- **Favourite berry:** Green
- **Moves:** 1 Tackle, 1 Pebble Shot, 7 Rest, 10 Leaf Toss, 16 Quake Slam

### 097. Snackoon (`snackoon`)
- **Art:** A cheeky raccoon holding a picnic basket, grey and brown fur, black eye mask, striped ringed tail and a small sandwich peeking out of the basket. Mischievous happy eyes.
- **Elements:** Earth
- **Status:** Condition (weekend)
- **Found:** Saturday or Sunday, 12:00–18:00.
- **Stats:** 64 HP / 62 ATK / 60 DEF / 72 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Tackle, 1 Pebble Shot, 7 Rest, 10 Hex, 16 Quake Slam

### 098. Boolet (`boolet`)
- **Art:** A tiny floating ghost in a white sheet with two cut-out eye holes, wavy drifting sheet edges, a little candy-corn coloured scarf and two small hands poking out. Playful cheeky look, lavender glow edge.
- **Elements:** Shadow / Air
- **Status:** Condition (Halloween)
- **Found:** 25 Oct – 2 Nov.
- **Stats:** 52 HP / 66 ATK / 48 DEF / 84 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Tackle, 1 Hex, 7 Guard, 10 Gust, 16 Night Terror

### 099. Lullamoth (`lullamoth`)
- **Art:** A soft plump moth with a cream body and big lavender wings marked with a yellow crescent moon. Sleepy eyes.
- **Elements:** Air
- **Status:** Rare · dream visitor
- **Found:** After a good night's sleep.
- **Stats:** 76 HP / 72 ATK / 72 DEF / 78 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Gust, 1 Hex, 1 Rest, 8 Lullaby, 12 Sky Dive

### 100. Solarion (`solarion`)
- **Art:** A proud young lion whose mane is a blazing sun corona (yellow to red), with a gold-orange body, cream muzzle and flaming tail tuft. Confident amber eyes; rare and majestic.
- **Elements:** Fire
- **Status:** Rare
- **Found:** Only 11:00–14:00.
- **Stats:** 80 HP / 98 ATK / 72 DEF / 88 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Ember, 1 Guard, 1 Flare Dash, 18 Solar Roar

### 101. Boulderon (`boulderon`)
- **Art:** A big ancient stone golem made of rounded stacked boulders, moss on its head and glowing purple-pink crystals growing from its shoulders. Grey stone, glowing yellow eyes; heavy and old, not blocky.
- **Elements:** Earth
- **Status:** Rare
- **Found:** Only after 10,000 steps in a day.
- **Stats:** 98 HP / 90 ATK / 106 DEF / 34 SPD
- **Favourite berry:** Green
- **Moves:** 1 Pebble Shot, 1 Guard, 1 Quake Slam, 18 Boulder Toss

### 102. Midnyx (`midnyx`)
- **Art:** A sleek midnight panther with deep navy-black fur, frosty pale-blue clock-face markings on its shoulder, icy blue crescent claws and a long tail tipped with a small glowing star. Sharp glowing ice-blue eyes, lavender glow edge.
- **Elements:** Shadow / Ice
- **Status:** Rare
- **Found:** Only 23:00–01:00.
- **Stats:** 78 HP / 96 ATK / 70 DEF / 92 SPD
- **Favourite berry:** Blue
- **Moves:** 1 Hex, 1 Guard, 1 Night Terror, 18 Moon Claw

### 103. Pulsarex (`pulsarex`)
- **Art:** A fierce athletic dragon-like creature with bright red scales, a glowing heart-shaped chest that crackles with yellow electricity, flame-like back spikes and strong legs in a running stance. Bold energetic eyes.
- **Elements:** Fire / Electric
- **Status:** Rare
- **Found:** Only after 30 high-heart-rate minutes in a day.
- **Stats:** 82 HP / 100 ATK / 70 DEF / 86 SPD
- **Favourite berry:** Red
- **Moves:** 1 Ember, 1 Zap, 1 Guard, 1 Flare Dash, 18 Thunder Arc

### 104. Selenyx (`selenyx`)
- **Art:** An elegant moon fox-spirit with silvery-white fur, a glowing full-moon disc floating behind its head like a halo, long flowing silver tails and soft pale-gold markings. Calm wise eyes.
- **Elements:** Light
- **Status:** Rare
- **Found:** Only on a full-moon night.
- **Stats:** 84 HP / 84 ATK / 86 DEF / 80 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Glow, 1 Guard, 1 Lullaby, 1 Radiance, 18 Moon Claw

### 105. Terramble (`terramble`)
- **Art:** A giant ancient gentle tortoise whose shell carries a whole little meadow: green grass, tiny flowers, a small tree and a mossy rock. Thick stony legs, wise wrinkled face, calm old eyes; huge, peaceful and very special.
- **Elements:** Earth / Grass
- **Status:** Legend · one per save
- **Found:** After the game has counted 1,000,000 of your steps.
- **Stats:** 112 HP / 88 ATK / 116 DEF / 30 SPD
- **Favourite berry:** Green
- **Moves:** 1 Pebble Shot, 1 Leaf Toss, 1 Guard, 1 Quake Slam, 20 Boulder Toss

### 106. Emberwing (`emberwing`)
- **Art:** A majestic firebird standing proudly with wings half raised, red-orange feathers, long tail feathers turning into flames at the ends and a golden flame crest. Bright amber eyes; noble, fast and very special.
- **Elements:** Fire / Air
- **Status:** Legend · one per save
- **Found:** After a 7-day streak of 5,000+ steps a day.
- **Stats:** 84 HP / 104 ATK / 74 DEF / 102 SPD
- **Favourite berry:** Gold
- **Moves:** 1 Ember, 1 Gust, 1 Rest, 1 Flare Dash, 20 Sky Dive
