# Wristlings: creature ideas

Ideas for new Wristlings that are **not in the game yet**. Each one is tied to something
the watch knows about you or the world, so that collecting them keeps rewarding real life.
All creatures already in the game are in [creatures.md](creatures.md), with the visual roster in
[roster.html](roster.html).

**Sensor check needed:** the Zepp OS 4 API has all the sensors below, but not every
watch has every sensor. Before building one, confirm the Bip 6 has it (the barometer especially).

When one gets built: add its art description, stats and rarity to [creatures.md](creatures.md),
add it to `page/data.js`, update the in-game guide, and remove it from this list.

## 1. Weather (`Weather` forecast)

| Name | Element | Look | How you meet it |
|---|---|---|---|
| **Snowbell** → **Chimefrost** | Ice | A bell made of snow that rings when it moves | Only when it is **snowing** |
| **Kitewing** → **Galeray** | Air | A kite-shaped manta ray with a string tail | Only on **windy** days |

Battle twist: while it rains, Water moves could hit 10% harder, and Fire moves 10% softer (and the other way round in sunshine).

## 2. Altitude (`Barometer`)

| Name | Element | Look | How you meet it |
|---|---|---|---|
| **Peakid** → **Cragram** | Earth | A goat kid with pebble horns; grows huge curled stone horns | Only **above 500 m altitude**, or after climbing a lot today |

## 3. Body and health (`Stress`, `Stand`, `Distance`)

| Name | Element | Look | How you meet it |
|---|---|---|---|
| **Hushling** → **Serenewool** | Air | A tiny cloud sheep that dozes while floating | Only when your **stress is low** (calm reward) |
| **Frazzlet** → **Overcharge** | Electric | A frizzy ball of static with spiky hair | Only when your **stress is high**. Its Breather is weak, but it hits hard |
| **Totemite** → **Totemaw** | Earth | A little stacked totem pole with a carved face | After you reach your **stand goal**. Gains a "head" for every 4 stand hours |
| **Trekkit** → **Wanderhorn** | Grass | A fawn with leafy antlers that bloom over time | After **5 km** today. Evolves after walking **50 km in total** with it as your lead |

## 6. Workouts (`Workout` history)

| Name | Element | Look | How you meet it |
|---|---|---|---|
| **Finnix** → **Tidecutter** | Water | A streamlined fish with fin "goggles" | After you log a **swim** workout |
| **Sprintail** → **Dashhare** | Air | A hare with streaming wind-ribbon ears | After you log a **run** workout |
| **Pedalbug** | Earth | A pill bug that rolls like a wheel | After you log a **cycling** workout |

## Mechanics

Built on 2026-11-19: status effects (burn, freeze, sleep), weather in battle (rain, sun, snow),
evolving by steps walked as lead (Dynamollusk), dual elements, and the LIGHT element.
Still open:

- **More ways to evolve:** stand hours (Totemite), distance as lead for more lines (Trekkit).
- **More status users:** Sleep for Hushling and Snowbell when they get built.
- **A "Glowmouse":** a LIGHT opposite for Dimmouse.
