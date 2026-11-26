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
| Wristlings | 21384 | Creature collector with turn-based battles: 106 creatures (24 three-stage lines, singles incl. 9 holiday ones, 6 rares, 2 legends) met through steps, sleep, heart rate, calories, PAI, weather, battery, calendar and compass |
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
Wristlings/art/              source image of every creature (Gemini; imported into assets/ by tools/import.cjs)
Wristlings/docs/             art briefs, current art status, creature ideas, roster page
tools/preview.cjs            browser preview builder
tools/publish-demos.cjs      copies previews + icons into docs/ for GitHub Pages
docs/                        the live web demos (index.html, play/*.html, icons/)
README.md                    public front page of the repo
```

## Hard-won rules (follow them)

### All games

- **`zeus build` compiles every `.js` file in a game folder** and fails on Node `require`. Name every Node helper script inside a game folder **`.cjs`**.
- **`zeus build` also rewrites the game folder's `.gitignore`** with its own template. Put extra ignore rules in the repository's root `.gitignore` (with the game folder in the path), never in `<Game>/.gitignore`.
- **Watch widgets** (`secondary-widget` in app.json; Tap Quest has one): the Bip 6 supports SecondaryWidget (full-screen widget list), not confirmed for small shortcut cards. Its `preview` image must also exist as `<name>_en-US.png` in the asset folders or `zeus build` fails. The widget reads a summary the game writes into its save (`data.widget`).
- **Canvas safety on the watch:** a zero-width or zero-height `drawRect` (x1==x2 or y1==y2) makes the watch throw a bare `null`. Pass x2/y2 *one past* the last pixel. Prefer **one canvas** per page, with pre-rendered PNG scenery moved via `prop.X`. Neon Horizon v1 broke on both counts; keep doing both fixes in new games.
### Wristlings (the biggest game)

- **In-game GUIDE** (swipe left on the den; `guidePages()` in `page/index.js`). Whenever a mechanic changes, update the matching guide page in the same change, and build the text from the game's constants (`GUARD_TAKEN`, `CATCH_BASE`, …), not hard-coded numbers. The guide never names a creature (spoilers).
- **Book:** a creature shows "???" until met, then its name; its sprite stays a silhouette until caught. Tapping one opens a detail page with a hint. An evolved form's page never names an unmet earlier form. Guide and book pages use one text size (17) everywhere.
- **Settings** (swipe up on the den): vibration on/off for battle, catching and other events, plus a full reset with a 3-second confirm. There is no test mode any more (the user has the watch).
- **Three-stage evolution (added 2026-11-19):** every line is first form -> middle form (at the old level, 12-16) -> final form (Lv 28; Kindlepig's line needs its 100+ weekly PAI on that last step). Middle forms are wild from lead Lv `WILD_EVOLVED_LV` (13), final forms from `WILD_FINAL_LV` (28). Middle stats are halfway between the other two. All 17 middle forms have their own art as of 2026-11-23 (Blazetail and Puddleap earlier, the other 15 imported from `C:\Users\xxkor\Desktop\bip6 art after\2`); no placeholders remain. The combined reference is `Wristlings/docs/creatures.md`; middle-form art descriptions are there.
- **Added 2026-11-19 (round 2):** 13 new creatures with new conditions (compass: west at dusk, south at midday, a full spin, a steady heading; battery under 20%; 25 Oct - 2 Nov; December; legends after 1,000,000 game-counted steps and a 7-day 5,000+ step streak), the LIGHT element, dual elements (`el2`), status effects (burn / freeze / sleep, `STATUS` in index.js), battle weather from the forecast (`WEATHER`), and evolving by steps walked as lead (`evoSteps`). New save fields: `life` (game-counted steps), `streak`, `legendRest`, and `walked` on each creature. New creatures show the "?" egg from `tools/egg.cjs` until their art exists; their descriptions are in `Wristlings/docs/creatures.md`. **Holiday creatures (same day):** Eggling and Woolamb (Easter week, Palm Sunday to Easter Monday, Western or Orthodox: `easterDays()`), Glimmerpine (December), Novapop (31 Dec - 2 Jan), Heartwing (12 - 16 Feb), Glowfly (19 - 25 Jun, night), Jinxcrow (Friday the 13th); date ranges are constants (`NEWYEAR`, `VALENTINE`, `MIDSUMMER`, `EASTER_DAYS`). **Round 3 (same day):** a second line for rain (Sprinkit), sun (Basklet), calories (Hoofit), compass (Roamkit) and low battery (Dimwick); a second single for mist, north, dawn, dusk, south, spin, steady, weekend and Halloween; rares are now one `RARES` table in index.js (noon, 10,000 steps, midnight Midnyx, 30 high-heart-rate minutes Pulsarex, full-moon nights Selenyx via `moonAge()`), with a RARE ONES guide page. All 47 newer creatures now have their own art (see `Wristlings/docs/creatures.md`), imported 2026-11-23. Art status: 106/106 done, 0 placeholders, 0 eggs; `docs/roster.html` has no "needs art" tags. Five supporting forms were refreshed or added the same day: Snowpup, Zippet and Mossmaw were replaced with updated art; Solarabbit and Lodestar had no source PNG before and were added. Originals are in `C:\Users\xxkor\Desktop\bip6 art after\ORIGINAL_ART_BACKUP`. **Mapping caveat:** the 47 new images had random filenames; IDs were assigned from save timestamps assuming script order (see `C:\Users\xxkor\Desktop\bip6 art after\MAPPING.csv` and `ART_AUDIT.md`). The user visually checked the whole roster on 2026-11-23 and approved the art, so the old "unverified" caveat is resolved; keep the CSV as provenance in case a creature ever looks wrong.
- **Features and balance (2026-11-19, round 4):** step EGGS (found at `EGG_FIND_STEPS` in a day, hatch after `EGG_HATCH_STEPS` more; tap the egg left of the lead on the den; never rare or seasonal; `st.egg`, `eggDay`, `eggsWaiting`), BOOK REWARDS (`MILESTONES`, `BADGES` per category, `checkBook()` runs in `home()`; the book's last page lists them; `st.milestones`, `st.badges`), a WEEKLY BOSS (swipe right on the den, `buildBoss()`; a final form picked per week, Lv grows with `st.week.steps`, 1.5x HP via `m.boss` in `statsOf`, uncatchable, `st.bossWon`), and COMING-UP hints (`upcoming()`, shown every other 10 s in the den status). Balance: two-element effectiveness is capped to 1.5x / 0.67x in `effectiveness()`; rare chances were re-tuned by a simulation to about 1-2 weeks each for a typical player (Midnyx is now 23:00-01:00). Each has a guide page (EGGS, BOOK REWARDS, WEEKLY BOSS).
- **Creature art:** all 106 species now have their own Gemini art (final pass 2026-11-23), one source image each in `art/<id>.png` — 106 transparent RGBA PNGs (~204 MB). The 47 random-named new images were mapped by save timestamp/script order; the user has visually approved the whole roster. Current status, provenance and rebuild command: `Wristlings/docs/art-status.md`. Claude's old drawing tools (code-drawn pixel art, Aseprite scripts) were deleted on request: don't draw creatures yourself unless asked. To replace one: save it as `art/<id>.png` (Gemini gives .jfif/.jpg; convert to PNG and name it for the user), then from a normal Command Prompt run `cd /d "C:\Users\xxkor\Bip6 Games\Wristlings\tools"` and `reimport.cmd <id>` (PowerShell needs `.\reimport.cmd`). Comma-separated IDs are allowed; the helper runs import, sheet, widget preview, roster, browser preview, published demos and `zeus build`. For a full re-import run the same steps with `node tools/import.cjs` (no `--only`). If the app icon source changes, run `node tools/icon.cjs`. The importer only removes background reachable from the image edge: white trapped inside a creature stays unless the user explicitly picks the pocket to clear. All source PNGs are now transparent; judge art in `docs/roster.html`, not the dark review sheet. The combined creature reference (art, stats, rarity, evolution, berries and moves) is `Wristlings/docs/creatures.md`.
- **UI art** comes from `tools/ui.cjs` (backgrounds, 3D pixel-font buttons and titles; it also writes `page/uiart.js`). The user is happy with it. Berries and the catch charm come from `tools/sprites.cjs`. The app icon comes from `tools/icon.cjs`: the round Gemini Sprig icon in `tools/icon_gemini.png` (`--look` writes a preview). Run it again whenever that source changes.
- **Watch widget** (`secondary-widget/index.js`, added 2026-11-18): pure black for AMOLED, built from the game's art (`ui/w_*.png` from `tools/ui.cjs`). Shows the team (lead big in the middle, the other two smaller left and right with level and HP; a new game shows the three starters there), the lead's HP/FOOD/JOY, a status line, tiles for tracks, charms and book, and PLAY (tap only; swipes pass through). It reads `widget` from the save, written by `widgetSummary()` in `page/index.js`, which also carries the rates so the widget can move hunger, healing and free or step-earned tracks on while the game is closed. If you change those mechanics, update `widgetSummary()` too. `node tools/widget-preview.cjs` runs the real widget code with a sample save to draw the picker preview (`--full` also writes a 390×450 check image).
- `docs/roster.html` (from `tools/roster.cjs`) lists every creature with stats and how to meet it; `docs/creature-ideas.md` holds unbuilt creature ideas.
### Alchemist Cauldron

- Its art comes from its `tools/art.cjs` (same shape-list approach: tiles, scene, menu, icon). Every tile sprite is 84×84 with the tile centred, so swapping between spawn/normal/pop sizes never moves a tile; keep that when adding levels. `bg.png` has a transparent hole over a coloured "liquid" rect whose colour follows the best tile. Its HOW TO PLAY text is built from the rule constants (`CAT_CHANCE`, `STEPS_PER_SPOON`, …).

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
