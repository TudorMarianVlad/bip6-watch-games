# Bip 6 Watch Games

Nine original games for the **Amazfit Bip 6** smartwatch, written in JavaScript for **Zepp OS** (API 4.0, 390×450 touch screen).

**[▶ Play them in your browser](https://tudormarianvlad.github.io/bip6-watch-games/)**: browser builds that fake the watch APIs, so you can try every game without a watch.

| Game | Genre | Watch features used |
|---|---|---|
| <img src="docs/icons/tap-quest.png" width="64"><br>**Tap Quest** | Idle clicker RPG: hire heroes, earn gold while away | Step counter, offline progress |
| <img src="docs/icons/wristlings.png" width="64"><br>**Wristlings** | Creature collecting and turn-based battles: 106 creatures (including holiday ones and rares), three-stage evolution lines, legends, step eggs, a weekly boss, book badges, status effects and battle weather | Steps, sleep, heart rate, calories, PAI, weather, compass, watch widget |
| <img src="docs/icons/depth-crawl.png" width="64"><br>**Depth Crawl** | First-person roguelite dungeon crawler | Step counter |
| <img src="docs/icons/neon-horizon.png" width="64"><br>**Neon Horizon** | Synthwave night racer | Step counter |
| <img src="docs/icons/stick-duel.png" width="64"><br>**Stick Duel** | Swipe-controlled stickman fighter | Swipe gestures |
| <img src="docs/icons/tilt-arena.png" width="64"><br>**Tilt Arena** | Arena survival, steered by tilting your wrist | Accelerometer |
| <img src="docs/icons/orbit-pop.png" width="64"><br>**Orbit Pop** | Marble shooter | Touch aiming |
| <img src="docs/icons/mine-patrol.png" width="64"><br>**Mine Patrol** | Mine-sweeping puzzle | Best-time saves |
| <img src="docs/icons/alchemist-cauldron.png" width="64"><br>**Alchemist's Cauldron** | Merge puzzle: brew ingredients up to the Philosopher's Stone | Swipe gestures, step counter |

## Highlights

- **Built for tight hardware.** Smooth on a low-power watch thanks to dirty-region rendering (only redraw what changed) and a frame-rate-independent game loop.
- **Shared game systems.** Local saves, offline progress, upgrade and prestige loops, achievements, daily goals, step-counter rewards, interactive tutorials and animated swipe menus.
- **Original pixel art.** Sprites, UI and app icons are original pixel art, many of them drawn as code (pixel grids or shape lists) by small Node.js scripts in each game's `tools/` folder. Wristlings' creatures were generated with Google Gemini and brought in by the game's own importer ([`Wristlings/tools/import.cjs`](Wristlings/tools/import.cjs)).
- **Browser preview tool.** [`tools/preview.cjs`](tools/preview.cjs) bundles a game's page with a fake Zepp OS API layer and runs it in a web browser for fast iteration without the simulator.
- **Built with AI assistance.** Developed with Claude Code as a coding assistant.

## Project layout

```
<Game>/
  app.json        Zepp OS manifest (permissions, targets)
  app.js          app entry
  page/           game code (index.js + layout)
  assets/         icons and sprites per screen target
  tools/          sprite / icon generator scripts (some games)
tools/
  preview.cjs         browser preview builder  -> tools/preview/<Game>.html
  publish-demos.cjs   copies previews to docs/ for GitHub Pages
docs/             the playable web demos (GitHub Pages)
```

## Running a game

**On the watch or simulator:** install the [Zeus CLI](https://docs.zepp.com/docs/guides/tools/cli/), then from a game folder:

```bash
zeus dev      # run in the Zepp OS simulator
zeus build    # build an installable .zab into dist/
```

**In a browser:**

```bash
node tools/preview.cjs "Tap Quest"
```

To update the web demos after a change: rebuild the preview, then run `node tools/publish-demos.cjs`.

---

Personal project by Tudor Marian-Vlad. Not affiliated with Zepp Health or Amazfit.
