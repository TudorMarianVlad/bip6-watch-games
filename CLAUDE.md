# Bip 6 Watch Games: briefing for Claude

Read this first. It records what was built and decided in earlier sessions, so a new Claude account or a fresh Windows install can carry on. Personal and account details (CV, GitHub sign-in, to-dos) are in `HANDOFF-PRIVATE.md` next to this file. That file is git-ignored and never pushed; read it too.

## What this folder is

Nine original games for the **Amazfit Bip 6** smartwatch: Zepp OS, API 4.0, 390×450 touch screen, corners rounded by about 86 px. All JavaScript, one folder per game. The folder is also a public GitHub repo with playable browser demos.

| Folder | appId | What it is |
|---|---|---|
| Orbit Pop | 21379 | Marble shooter: pop orbs before they reach the black hole |
| Tap Quest | 21380 | Idle clicker RPG: heroes, gold while away, prestige, step rewards |
| Tilt Arena | 21381 | Arena survival steered by the accelerometer |
| Mine Patrol | 21382 | Mine-sweeping puzzle with best times |
| Wristlings | 21384 | Creature collector powered by steps, sleep, heart rate, calories, PAI, weather |
| Stick Duel | 21385 | Swipe-controlled stickman fighter (drawLine on one canvas strip) |
| Depth Crawl | 21386 | First-person roguelite raycaster; torch refuelled by real steps |
| Neon Horizon | 21387 | Synthwave pseudo-3D night racer with wet-road reflections |
| Alchemist Cauldron | 21388 | Merge puzzle (swipe): brew ingredients up to the Philosopher's Stone; catalyst tiles, step-earned undo spoons |

A new game takes the **next free appId (21389)**.

## Layout

```
<Game>/app.json, app.js      manifest + entry
<Game>/page/index.js         the game (one page; Wristlings also has data.js and uiart.js)
<Game>/assets/default.{s,r,b}/   sprites; put every image in ALL THREE folders
<Game>/tools/*.cjs           sprite/icon/scenery generators (some games)
tools/preview.cjs            browser preview builder
tools/publish-demos.cjs      copies previews + icons into docs/ for GitHub Pages
docs/                        the live web demos (index.html, play/*.html, icons/)
README.md                    public front page of the repo
```

## Hard-won rules (follow them)

- **`zeus build` compiles every `.js` file in a game folder** and fails on Node `require`. Name every Node helper script inside a game folder **`.cjs`**.
- **Canvas safety on the watch:** a zero-width or zero-height `drawRect` (x1==x2 or y1==y2) makes the watch throw a bare `null`. Pass x2/y2 *one past* the last pixel. Prefer **one canvas** per page, with pre-rendered PNG scenery moved via `prop.X`. Neon Horizon v1 broke on both counts; keep doing both fixes in new games.
- **Wristlings has an in-game GUIDE** (swipe left on the den; `guidePages()` in `page/index.js`). Whenever a Wristlings mechanic changes, update the matching guide page in the same change, and build the guide text from the game's constants (`GUARD_TAKEN`, `CATCH_BASE`, …), not hard-coded numbers.
- Wristlings sprites come from `tools/sprites.cjs` (shape lists → toon-shaded PNGs) and its UI art from `tools/ui.cjs` (which also writes `page/uiart.js`). The richer look was requested because the earlier games all looked alike.
- Alchemist Cauldron art comes from its `tools/art.cjs` (same shape-list approach: tiles, scene, menu, icon). Every tile sprite is 84×84 with the tile centred, so swapping between spawn/normal/pop sizes never moves a tile; keep that when adding levels. `bg.png` has a transparent hole over a coloured "liquid" rect whose colour follows the best tile. Its HOW TO PLAY text is built from the rule constants (`CAT_CHANCE`, `STEPS_PER_SPOON`, …).

## Building and running

- Watch / simulator: from a game folder, run `zeus dev` (simulator) or `zeus build` (makes `dist/*.zab`). Zeus is a global npm CLI: `npm i -g @zeppos/zeus-cli`.
- Browser preview: from this folder, run `node tools/preview.cjs "<Game>"`. It writes `tools/preview/<Game>.html` and opens it. It fakes the `@zos` APIs, inlines local imports and embeds `assets/default.s` PNGs. Strict mode throws on empty drawRects, like the watch. Extend its fakes when a game uses a new API.
  - The game code is wrapped in its own **function scope** (IIFE). It used to be a `{ }` block, which leaked function names, so games defining `hit()` broke the preview's own `hit()` (fixed 2026-11-16). Never go back to a bare block.

## Publishing (GitHub + Pages)

- Repo: https://github.com/TudorMarianVlad/bip6-watch-games (public, branch `main`).
- Live demos: https://tudormarianvlad.github.io/bip6-watch-games/ (Pages serves `main` → `/docs`).
- To update the demos after changing a game:
  1. `node tools/preview.cjs "<Game>" --no-open`
  2. `node tools/publish-demos.cjs`
  3. Commit and push. Pages redeploys in 1–2 minutes.
- `tools/preview/` is git-ignored; only the `docs/play/` copies are published.
- Commit identity for this repo (set in `.git/config`, not globally): `Tudor Marian-Vlad <148555928+TudorMarianVlad@users.noreply.github.com>`. **Never commit with the work email.** See HANDOFF-PRIVATE.md.
- Commits made by Claude end with a `Co-Authored-By` line for Claude.

## Related project outside this folder

**Meowbat: The Accidental Hero**: a Unity 6 (6000.0.43f1) 2D top-down Action-RPG, the user's Bachelor's thesis. Its code comments are in Romanian.
- Repo: https://github.com/TudorMarianVlad/meowbat-the-accidental-hero
- Old local path: `C:\Storage\Programe\Unity\Projects\Meowbat The Accidental Hero Licenta Final`. After a reinstall, **clone it from GitHub** (Library/ etc. are git-ignored; Unity regenerates them).
- Main scripts in `Assets/Scripts`: WaveManager, SaveManager (JSON), Inventory + ItemData (ScriptableObjects, observer events), ShopManager, UpgradeShopkeeper, WarpGate (single-scene hub ↔ arena, Cinemachine bounds), DayNightCycle, Enemy*AI (melee, ranged, healer).
- Controls: WASD move, mouse aim, left click attack, Shift sprint, Ctrl dash, E interact, Tab inventory, Esc pause.
- Not done yet: a **WebGL build** to host on GitHub Pages or itch.io so recruiters can play it.

## Known limitations / ideas

- On phones, the demo pages are wider than the screen (the watch canvas is a fixed 585 px). They're fine on laptops; could be made responsive.
- No automated test suite exists. Don't claim one anywhere (the CV was corrected).
