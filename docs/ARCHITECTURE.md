<p align="center"><img src="media/doc-architecture.jpg" alt="OMF 2097 Remastered: engine architecture" width="100%"></p>

A TypeScript/WebGL2 reimplementation of One Must Fall 2097 that loads the original data files.
Game logic is a faithful port of the reverse-engineered behavior documented by the open-source
OpenOMF project (MIT, https://github.com/omf2097/openomf); rendering and platform layers are new.

## Layout

| Path | What |
| --- | --- |
| `src/formats/` | Binary parsers for the original files (AF, BK, sprites, palettes, PIC, TRN, pilots, fonts, sounds, language). |
| `src/script/` | Animation-string ("A20-B10-s3C5...") decoder and tag table. |
| `src/resources/` | Runtime resources built from parsed files: `loadAf`, `loadBk`, `langGet`, `fonts()`, `soundBank()`, `loadPic`, `loadTournament`. Loaded AF/BK objects are fresh mutable copies per scene. |
| `src/video/` | Draw list (`video.draw*`), VGA palette state (`vga`), indexed `Surface`, WebGL2 renderer; `stage/`: live backdrops (the main menu's parallax scene). |
| `src/audio/` | Audio system (3 SFX channels + PSM music in an AudioWorklet; impact thumps; an effects send through a convolution reverb for the arena acoustics). |
| `src/platform/` | Native-shell bridge (`desktop.ts`); configurable multitouch controls (`touch.ts`); the web version's game data import (`gameData.ts`: installer and zip unpacking, IndexedDB) and its first-run screen (`importScreen.ts`). |
| `src-tauri/` | Tauri 2 desktop shell and mobile entry point; `tauri.android.conf.json` defines the fullscreen Android window, while `tools/android/configure.mjs` patches the generated Android activity for landscape/immersive mode. |
| `src/controller/` | Controllers: keyboard, gamepad, AI (`ai.ts`), menu polling, network players (`net.ts`). |
| `src/game/` | Game logic: `GameState`, `Scene`, `GameObject` (object+animation player), HAR/projectile/hazard/scrap objects, score, GUI, scenes. |
| `src/game/scenes/` | One module per scene family; each calls `registerScene(SceneId.X, gs => new XScene(gs))`. `index.ts` imports them all. |
| `src/i18n/` | Languages: the fourteen the game speaks (`languages.ts`), which one (the player's choice or the system's), the remaster's texts in it (`tr`, `trn`, `trKey` in `i18n.ts`), code page 437 (`cp437.ts`). See [Languages](#languages). |
| `src/game/gui/` | Text rendering (`text.ts`; `glyphs.ts`: the letters it draws, `hiresText.ts`: the scripts the original fonts lack) and menu widgets (`widgets.ts`: `Menu`, `Button`, `TextSelector`, `TextSlider`, `Label`, `Filler`, `GuiFrame`), progress bars, pause menu. |
| `src/game/scenes/mechlab/`, `src/game/tournament/` | Tournament mode: mechlab menus and dashboards, HAR economy, CHR characters (`src/formats/chr.ts`). |
| `src/resources/sgmanager.ts`, `trnmanager.ts` | Save games (CHR files in localStorage through a small `SaveStorage` interface) and the tournament list. |
| `src/gen/` | The remaster's own content: the new robots and arenas, generated from 3D models (see below). |
| `src/fx/` | Remastered effects: the director (fight events → particles, lights, camera), per-arena ambience and weather, the new robots' special move effects. |
| `src/game/replay/` | Replays: recording every fight (REC format), the replay store (IndexedDB), playback with seeking, the controls bar and the replay list. |
| `src/net/` | Network games (MULTIPLAYER > LAN): the lockstep session (`session.ts`), its messages (`protocol.ts`), starting a game (`handshake.ts`), the game's side of it (`netplay.ts`), the links between two games (`link.ts`, `lan.ts`: the desktop app's TCP connections and UDP searches, the dev server's relay) and the LAN page. |
| `src/game/training/` | The training lab: frame meter and hitboxes (`lab.ts`), the lab session (recording the dummy, reversals, hotkeys), combo trials and their data. |
| `src/game/modes/`, `src/game/records/` | Arcade, survival, time attack and the workshop's test fight (`run.ts`), their results page; statistics and achievements. |
| `src/game/workshop/`, `src/gen/workshop.ts` | The robot workshop: robot descriptions, building them into fighters at run time, the editor page. |
| `src/game/tournament/custom*.ts` | Custom tournaments made from the installed ones, and their page. |
| `src/mods/` | Mods (see [MODDING.md](MODDING.md)): the `.omfmod` package format (`types.ts`, `package.ts`), the installed mods (`store.ts`, IndexedDB), the numbers their content plays under (`ids.ts`), loading them at start-up (`registry.ts`), pilots' portraits in each screen's colors (`portraits.ts`), their HD pictures in the remastered look (`hdArt.ts`), the Mods page, and a sample mod. |
| `src/studio/`, `studio.html` | OMF Studio, the modding tool: a second page sharing the formats, the generators and the storage (see below). |
| `src/util/zip.ts`, `src/util/png.ts` | Zip archives and PNG images read and written without the browser (the game data import, mods, Studio's art). |

## Porting conventions (C reference → TypeScript)

- Keep the structure of the reference code: one TS function/method per C function, same control flow and
  constants, camelCase names (`har_set_ani` → `harSetAni`, `object_set_repeat(obj, 1)` → `obj.setRepeat(true)`).
  Faithfulness matters more than elegance: preserve integer truncation (`Math.trunc`), unsigned wraparound, order
  of RNG calls and quirks (comment them).
- C `object *` → `GameObject` (`src/game/object.ts`). Field names map directly (`pos.x` → `posX`, `vel.y` → `velY`,
  `cur_animation` → `curAnimation`, `animation_state` → `animationState`, `sprite_state` → `spriteState`).
  `object_get_userdata(obj)` → `obj.userdata` (a `Har` for HARs: `harData(obj)`).
- `game_state *gs` → `GameState` (`src/game/gameState.ts`): `gs.findObject(id)`, `gs.addObject(obj, layer, singleton, persistent)`,
  `gs.getPlayer(i)` (`GamePlayer`: `pilot`, `ctrl`, `harObjId`, `score`, `chr`, `selectable`, `spWins`),
  `gs.setNext(SceneId.X)`, `gs.playSound(id, opts)`, `gs.playMusic('MENU.PSM')`, `gs.stopMusic()`, `gs.rand` (simulation RNG),
  `gs.matchSettings`, `gs.fightStats`, `gs.isSingleplayer()/isTournament()/isDemoplay()/isTwoplayer()`, `gs.setupAi(i)`,
  `gs.setupKeyboard(player, keysetIndex)`, `gs.initDemo()`, `gs.arena`.
  `rand_int()/rand_float()` (the reference's *global* RNG) → `globalRandom.int()/float()` from `src/util/random.ts`.
- `scene *` → subclass of `Scene` (`src/game/scene.ts`). Override: `startup(id) → [load, repeat]`, `prioOverride(id)`,
  `staticTick(paused)`, `dynamicTick(paused)`, `inputPoll()`, `render()` (drawn after the BK background),
  `renderOverlay()`, `paletteTransform()`, `free()`, `keyEvent(code, e)` (raw key events for text entry).
  The constructor loads the BK (`this.bk`) and sets the palette; `init()` (called by the engine) spawns startup animations.
  Scene-local timers: `this.tickTimer.add(ticks, cb)`.
- Menu input: `const ev: CtrlEvent[] = []; gs.menuPoll(ev); for (const e of ev) if (e.type === 'action') ...`
  Player input: `gs.getPlayer(i).ctrl.poll(ev)`.
- Drawing: `video.draw(surface, x, y)`, `video.drawFull(...)`, `video.drawOffset(...)`, `video.drawRemap(...)` in native
  320x200 coordinates. Surfaces are 8-bit indexed (`Surface`); build them from sprites with `Surface.fromSprite`
  or use the runtime `Animation`/`RSprite` objects from resources. Text: `new Text(FontSize.BIG|SMALL, w, h, str)`,
  `.setColor().setShadow().setHAlign()...draw(x, y)`; formatted documents with `textDocument()`.
- Palette: `vga.setBasePalette(pal)`, `vga.setBasePaletteRange(src, dst, srcStart, count)`, `vga.setBaseIndex(i, r, g, b)`,
  per-frame transforms via `gs.enablePaletteTransform(fn)` from `paletteTransform()`. Player HAR colors:
  `setPilotColors(pilot, c1, c2, c3)` then `paletteLoadPlayerColors(pilot.palette, playerIndex)` (`src/game/pilotColors.ts`).
- Strings from ENGLISH.DAT: `langGet(id)` (same ids as the reference `lang_get`).
- Settings: `settings()` (`src/game/settings.ts`, persisted to localStorage with `saveSettings()`).
- Host/app hooks (graphics mode, fullscreen, quit): `app` from `src/app.ts`.

## Running

- `npm run dev` then open http://localhost:5173/ (boots to the intro/menu).
- Dev params: `?scene=MELEE` start at a scene; `?fight=0&h1=0&h2=5&p1=0&p2=1[&ai]` quick fight, and with `&seed=N`
  the same fight every time (`game/quickFight.ts`: the computer on both sides, the match rules' defaults with
  `&power=6,6`, `&speed=10`, `&hyper`; the README trailer's takes are recorded this way, their seeds found by
  `src/gen/dev/trailerFights.test.ts`); `?credits=n` the credits from the n-th fight; `?training` training mode;
  `?noaudio`; `?nopause` (fights keep running when the window loses focus); `?viewer` asset viewer.
- Debug API in the page: `__omf.gs`, `__omf.step(ms)` (advance simulation; works when the tab is hidden),
  `__omf.key(code, down)` (simulate keys by `KeyboardEvent.code`), `await __omf.capture(name, w, h, crop?)` (renders a
  frame at w x h and saves `.captures/<name>.png` via the dev server — view it to check visuals),
  `__omf.renderer.options.mode = 'classic' | 'remastered'`, `__omf.drawList`, `__omf.audio`.
  Vite reloads the page whenever a source file changes, so do setup + stepping + capture in one script.
- Tests: `npx vitest run src/test` (headless game via `src/test/harness.ts`), `npx tsc --noEmit`.
- LAN games: two tabs of the dev server opened with `?devlan` host, find and join each other's games through its relay
  (`?scene=MENU&devlan`, then MULTIPLAYER > LAN in both; without it a browser has no LAN games).

## Rendering

Game code only fills the draw list (`src/video/draw.ts`); `GLRenderer` (`src/video/gl/renderer.ts`) turns it into
pixels in one of two ways, switchable at any time (F2, pause menu, OPTIONS › GRAPHICS › VISUALS):

- **Classic**: the original VGA pipeline on the GPU. Sprites are composited as palette indices into a 320x200
  indexed framebuffer (index, remap encoding, dark tint, index add), then resolved through the palette and the 19
  remap tables exactly like the original, and scaled to the screen (sharp pixels, smooth, or CRT scanlines).
  Optional widescreen shows the mirrored arena in fights; other screens are pillarboxed.
- **Remastered** (`src/video/hd/`): every sprite and background is reconstructed at display resolution from its
  indexed pixels and the live palette (xBR silhouettes + bilateral shading), so palette effects still work.
  Shadows use per-texel ratios of the original shadow remap tables; glows use a native-resolution delta computed
  with the classic pipeline (`DELTA_FS`), so both look like the original, only smooth. Fights extend the arena
  for widescreen (`hd/extend.ts`, mirrored and progressively blurred); other screens get an ambient fill.
  Objects are drawn between game ticks when SMOOTH MOTION is on (`GameObject.snapshotPosition`, `drawList.interpAlpha`).
  Bloom, vignette and a highlight shoulder are applied last; letters are cut out of the bloom's source (drawn again
  as coverage, `drawSprites` pass 3), so white text never glows. The credits (`FBUFOPT_CREDITS`: their names add 60 per
  pixel value to the background's palette index) are remastered too: index-adding sprites take the color at the
  background index under them plus 60 per step (`u_addBg`), with the upscaler's smooth silhouette.
- **Remastered effects** (fights): the fight logic reports cosmetic events (`src/game/fx.ts`: hits, blocks, slams,
  landings, knockouts). `src/fx/director.ts` turns them into particles (`src/fx/particles.ts`), lights and camera
  effects, adds each arena's ambience (`src/fx/arenas.ts`; in the painted arenas it sits on what the painting shows:
  twinkling stars, beacons blinking, lamps glowing) and derives light from glowing objects (projectiles, torches). It also shows the fighting area's edges, which the widescreen view reaches past (the robots are held at
  the classic screen's edges, `ARENA_LEFT_WALL`/`ARENA_RIGHT_WALL` ± 20): energy curtains in each arena's color
  (`FxBarrier`, `FX_BARRIER_FS`), lit where a robot is held against them, rippling from wall slams. The renderer (`src/video/gl/fxPasses.ts`, `hd/fxShaders.ts`) draws the world (background, robots,
  particles), runs a world post pass (lighting with a robot mask and rim light, heat haze, shockwaves, zoom,
  chromatic aberration, flash), adds bloom and light shafts, and only then draws the overlay (TAG_HUD draws: HUD,
  announcements, pause menu), so the overlay is never distorted or lit. The effects never touch game state or the
  game's random generators (checked by `src/test/gameplay-options.test.ts`).
- **Text and panels** (remastered): font glyphs (surfaces with `source.kind === 'font'`) are drawn in one of three
  styles (OPTIONS › GRAPHICS › REMASTERED › FONT, `renderer.textStyle`). The default is a typeface (`hd/typeface.ts`, Orbitron
  under the OFL in `public/fonts`): a worker (`hd/typefaceWorker.ts`) renders every glyph of both game fonts fitted
  into its original cell (cap height and baseline of the cell, the original's ink center and width: wide letters are
  condensed and get their stems back by smearing, lowercase takes the original's x-height, descenders are pressed into
  the cell, the capital I gets the original's serifs) and stores them as signed distance fields in one atlas; the
  sprite shader draws such glyph quads (flag 0x200) from it, so the layout of every text is the original's. SMOOTH
  draws the original letters as clean shapes in the TEXT part of `HD_SPRITE_FS`: ink pixels become squares with
  rounded outward corners and diagonal neighbors are joined by strokes, evaluated as a signed distance (the typeface
  also has the accented letters of code page 437, which the German texts use). PIXEL keeps
  the square pixels, anti-aliased per screen pixel. Each run of letters first gets a soft dark halo (`u_textPass`),
  so the halo never covers a letter's own shadow. Darkened panels (`menushade`
  surfaces drawn through a remap table) get a frosted background: the frame so far is blurred at quarter resolution
  inside the panel and passed through the panel's remap table fitted as an affine color transform
  (`fitRemapMatrix`), instead of the exact per-pixel remap delta.
- **Backdrops** (remastered): the host can hand the renderer a live backdrop for the frame (`renderer.backdrop`,
  `src/video/stage/backdrop.ts`), drawn in place of the background picture it stands for (`replaces`, a surface key)
  on any frame that shows that picture; it lists the screen's own sprites it replaces and the native columns it paints
  (the widescreen sides beyond get the ambient fill). The main menu's is a
  parallax scene (`stage/parallax.ts`): painted layers from `public/hd/menu/` (made with `tools/menu-pack/`: a master
  image cut into sky, city, towers, robot, a lit robot and crowd) drawn at their depths under a drifting camera that
  leans toward the mouse, with the original's sweeping spotlight done live (the lit robot layer shown through the
  light's pool, the tower's top brightened, the beam with dust), searchlights, twinkling stars and cloud shadows, a
  rim light on the crowd and camera flashes (the painted crowd moves only with the parallax: warping it to make heads
  bob sheared the silhouettes). MAIN.BK's two spotlight animations (10, 11) still run for classic
  mode; the backdrop hides them. The menu waits on its first black frame for the layers like other screens do for
  their HD bundles. The scoreboard and the help pages show MAIN.BK's picture too, so they get the scene as well, as
  dark as their palette makes the picture (`MenuScene.brightness`, from the live palette against the BK's own).
- **Arena depth** (remastered fights): an arena painting with a geometry map (`video/hd/geometry.ts`: normal and
  depth, by the painting's pixel hash; `public/hd/geometry/` for the original arenas, hd.json's `geometry` for a mod's)
  is drawn with parallax: the camera this frame (the effects' impact zoom and shake, the fight camera's crop, the
  game's shake) is one affine map, and `HD_BG_FS` draws each pixel's content where that map would put it at its depth
  (a fixed point, three steps), before the later passes apply the map; the arena's own animations (`ARENAn.BK`
  sprites) are moved and scaled the same way by the depth where they stand (`Renderer.parallaxRect`). The same pass
  draws the geometry into a buffer the world post pass lights the background with, per pixel and light: falloff over
  the 3D distance and the surface's facing (fight lights at the robots' depth, the arena's own lights on its scenery),
  in place of the flat light buffer; the robots keep theirs.
- **HUD bars**: `ProgressBar` draws the original bar surfaces and also describes itself in the draw list
  (`drawList.pushBar`, `HudBar`: value, damage trail, theme colors, warning pulses). The remastered renderer draws that
  description with `hd/hudShaders.ts` in place of the surfaces (HUD option), at the position of the bar's first draw
  command, so the draw order is kept; the classic renderer ignores it.
- **HD artwork** (`src/video/hd/assets.ts`, `artShaders.ts`): when imported artwork is installed (`public/hd/`,
  see `tools/hd-pack/`), remastered mode draws it instead of the procedural upscale. Surfaces are matched to their
  artwork by a fingerprint of their palette indices (`hd/pixelHash.ts`), so no game code changes are needed. Each HD
  pixel is mapped through the palette change of the native pixel it belongs to (artwork palette → live palette), which
  keeps player colors, fades, flashes and tints working. Bundles (per scene, per robot, shared effects/arena
  graphics/portraits) load on demand; scene changes preload what the next screens need, and a scene whose own bundles
  are still loading waits on its black first frame (`Engine.waiting`, at most `ARTWORK_WAIT_MS`), so fights entered
  without the VS screen (training, replays) do not start with upscaled pixels. Surfaces made at run time from an
  image with artwork point back to it (`Surface.hdSource`: a region, turned grey, or mirrored like the VS screen's
  backdrop). The VS screen's robot pictures carry pieces of the holding bay around them; `Surface.hdOwnColors` shows
  their artwork only where the pixels are in the robot's own colors (below 0x30), over the HD holding bay.


## Menus, text and input additions

- Help pages (`menuHelp.ts`, `gui/text.ts` `textDocument`): the English texts change styles only at line starts (one
  block per piece, as in the reference); the German texts change colors mid-sentence ({COLOR:WHITE}, {COLOR:PURPLE}),
  which are laid out on shared lines (`flowTexts`, texts placed with `docX` / `docAdvance`). Pages taller than the
  panel are broken over more sheets between lines (`Text.lines`), under the page's title, headings kept with their text.
- Mouse (`src/controller/mouse.ts`): pointer events are converted to native coordinates (`GLRenderer.canvasToNative`)
  and dispatched once per frame in `main.ts`: to the GUI frames drawn that frame, topmost first (`renderedFrames`,
  `Component.pointer`: `Menu` hovers/clicks/scrolls entries, `TrnMenu` moves the mechlab hand), then to the scene
  (`Scene.pointer`, e.g. the MELEE portraits, VS "continue"), else a left click means continue and a right click
  back (queued on the menu controller). Fights ignore the mouse outside their pause menu.
- F1 (`src/game/gui/helpOverlay.ts`) shows the original help pages over the paused game, full screen with the main
  menu's palette (text colors are palette entries), restoring the scene's palette afterwards. In remastered graphics
  HELP and F1 show them as one of the remaster's pages instead (`src/game/gui/helpHtml.ts`, a `Page`: the game draws the
  frame, the title and the keys like the records' or the replays'; the language file's markup, parsed into titles,
  headings and paragraphs, is HTML over the frame at the game's scale, in the remaster's
  typeface, beside the topics).
- The main menu (`src/game/scenes/mainmenu/menuMain.ts`): the original's three ways to play (its two player game is
  MULTIPLAYER's LOCAL, `menuMultiplayer.ts`, beside LAN games and ONLINE, which is still to come), then MORE MODES
  (`menuModes.ts`), EXTRAS (`menuExtras.ts`), OPTIONS (`menuOptions.ts`: GAMEPLAY, CONTROLS, GRAPHICS with
  its CLASSIC STYLE / REMASTERED / EFFECTS submenus, SOUND, LANGUAGE: a page of its own, `gui/languagePage.ts`), HELP
  and QUIT. `GameState.menuReturn` reopens EXTRAS, MORE MODES or MULTIPLAYER when their screens, runs and games end.
- Menus are audited by `src/test/menuLayout.test.ts` (entries fit their frame, help texts fit the help panel), and
  `TEXT_AUDIT=<file> npx vitest run src/test` records texts that get cut off or drawn off screen in any scene test
  (`GAME_LANG=<code>` runs the tests in a language: the audit then checks its texts).
- Training mode: `src/game/scenes/mainmenu/menuTraining.ts` (setup), `src/controller/dummy.ts` (the dummy),
  `GameState.training` (no knockouts in `har.ts`, refills and the damage readout in `arena.ts`), the input display
  (`src/game/gui/inputDisplay.ts`, fed by the arena's input poll).
- Move list (`src/game/gui/moveList.ts`): a page of the fight pause menu built from the robots' move tables (move
  strings hold a button and the directions most recent first; `moveNotation` puts them in the order they are
  entered). The original data has no move names, so moves are listed by kind. Direction icons: `inputIcons.ts`.
- Losing the window focus calls `Scene.focusLost()`; the arena opens its pause menu.

## Languages

The game speaks English, German, Japanese, Chinese (simplified), Korean, Hindi, Bengali, Spanish, Portuguese
(Brazilian), French, Arabic, Russian, Danish and Swedish (`src/i18n/languages.ts`).

- **Which one**: `settings.language` is `'auto'` (the default) or a language code. AUTOMATIC takes the first of the
  system's languages the game has (`pickLanguage`): the browser's `navigator.languages` on the web; in the desktop app
  Windows' display languages first (the shell's `os_languages` command, `sys-locale`), then WebView2's. `main.ts` sets
  the language before anything is shown (the loading screen, the import and setup screens speak it), `?lang=<code>`
  tries one out. Choosing one (OPTIONS > LANGUAGE, `gui/languagePage.ts`; the first start's setup) applies at once
  (`setLanguage`, `onLanguageChange`: the main menu rebuilds itself) and is kept; when choices come faster than their
  files load, the last one wins. The page's `lang` and `dir` follow it: in Arabic the HTML over the game reads from the
  right, and what must not turn around (the touch pad, the version, the credits) says `dir="ltr"`. Settings saved
  before (revision 6) keep German and let the old English default follow the system.
- **The original game's texts** (`langGet`): English and German are the game's own ENGLISH.DAT and GERMAN.DAT, decoded
  from code page 437 when read (`cp437.ts`; so are the tournaments' and pilots' texts); the other languages are
  `public/lang/<code>.json`, arrays of the same 1013 texts (`loadOriginalTexts`: an empty one falls back to English).
  `public/lang/de.json` fixes a few of GERMAN.DAT's texts (English ones, a help text too long for its box), by index.
  The original tournaments' own texts (descriptions, endings, the opponents' taunts) have English and German in their
  files; the other languages translate them by their English in `public/lang/trn/<code>.json` (`trnText`,
  `formats/tournament.ts` `localizedLocale`), and so does German where its file only repeats the English (the World
  Championship: `public/lang/trn/de.json`).
- **The remaster's texts** are written in English in the code: `tr('ONE PLAYER GAME')`, `tr('{name} WINS', { name })`,
  `trn(n, '{n} WIN', '{n} WINS')` (plural forms by `Intl.PluralRules`), `trKey('...')` in tables made before the
  language is known (translated where shown). Each language's translations are `public/lang/ui/<code>.json`, by the
  English text; a text without one stays English. `tools/i18n.mjs` lists the texts (`keys`), checks the translations
  (`check`: placeholders, plural forms, missing and stale texts) and lists what a language still lacks (`todo`);
  `src/test/i18n.test.ts` checks them too. OMF Studio stays English.
- **Drawing every script** (`gui/glyphs.ts`, `gui/text.ts`): a text is shaped into units, a unit per letter of the
  original fonts (laid out exactly as the original does, so English and German are unchanged) or per word of a script
  the system's fonts draw (per character in Chinese, Japanese and Korean, which take one cell each, as the
  translations' columns expect). The Latin letters the fonts lack (Ã, Ê, Ó, Ø, ¿...) are made in their style: the plain
  letter, a capital pressed a little lower, under the accent the fonts draw on their own Ä and É; the small font has
  capitals only, so its letters are capitals in every script. Other scripts (`gui/hiresText.ts`) are drawn by the
  system's fonts (Windows' Yu Gothic, Microsoft YaHei, Malgun Gothic, Nirmala UI, Segoe UI, Bahnschrift, then other
  systems'), fitted to the cell they stand in, as surfaces four times the game's resolution (`Surface.hires`). Lines
  wrap at spaces and hyphens, between Chinese and Japanese characters (not before their closing punctuation), and keep
  French spaces before ? ! : ; with their words. Arabic is laid out from the right (`visualOrder`: a simplified
  bidirectional algorithm, Latin names and numbers in it left to right; a paragraph in Arabic is right to left).
- **Rendering them**: the classic renderer draws a frame with such letters into an indexed framebuffer at their
  resolution (`classicScale`, 4; the rest of the picture is the same, nearest-neighbor), the remastered one makes a
  distance field of each one the first time it is drawn (`dynGlyphTile`, an atlas of its own, 8 texels a pixel) and
  draws it like the remastered typeface's letters (flag 0x800 with 0x200). The typeface's atlas has the made Latin
  letters too (`madeGlyphs`). HTML pages (help, setup, notices) leave the scripts to the browser, with the language's
  `lang` (and right to left for Arabic help).
- **Key names** (`keyNames.ts`, the controls page's keyboard) are what the player's keyboard prints where the browser
  tells (`navigator.keyboard.getLayoutMap()`: Chromium, WebView2): Y and Z swap on a German keyboard, A and Q on a
  French one. Keyboards in other scripts, and browsers that do not tell, keep the US names.
- The headless tests have no canvas: the system fonts' words are blank boxes there, sized from their characters.

## Generated content: the new robots and arenas

The four new robots (HARs 11-14) and arenas (5-8) are made from source code in `src/gen`, into the original game's
own file formats, so the engine runs them like the originals. They come with the game as a mod, off until the player
turns it on (`mods/extras.ts`; the package is `public/mods/omf2097r.extras.omfmod`, see Mods below): the game itself
only plays the originals, and the mod proves the modding system with content as complete as the originals'.

- **Shapes** (`gen/geometry.ts`): signed distance functions (boxes, ellipsoids, capsules, cylinders, cones, wedges,
  tapered boxes, faceted prisms) ray traced by marching from bounding spheres; the same functions run in GLSL
  (`gen/hdRender.ts`).
- **Robots** (`gen/robots/*.ts`): a humanoid skeleton (`robots/parts.ts`) carrying low-polygon parts like the
  originals' (prisms, tapered boxes, blades; ribbed joints), painted in the player's three color ramps the way the
  original robots use them (primary = the armor, tertiary = joint rings and mechanics, secondary = a few signature
  accents), so player colors, flashes and shadows work as for the originals. The native sprites are shaded like the
  originals' 1994 renders (`gen/raster.ts`): flat facets, diffuse light that saturates at the ramp's base shade (the
  shade most of an original robot's pixels use), hard-edged highlights and error-diffusion dithering within each part;
  `src/gen/dev/stylestats.test.ts` and `lineup.test.ts` compare them with the originals (shade histograms, color use,
  build). `gen/pose.ts` poses them (limb IK to screen targets);
  `gen/fighter/poses.ts` is the pose library every robot shares (built from each robot's measurements and fighting
  style), including the 24-frame damage sheet whose meaning all robots' moves rely on.
- **Moves** (`gen/fighter/moveset.ts`, `gen/roster/*.ts`): animation strings with the originals' timing and reaction
  idioms, specials, projectiles and finishers. `gen/fighter/build.ts` renders every pose (`gen/raster.ts`), stores
  identical sprites once, and derives hit points from the striking limbs' pixels. `npm run gen` makes
  `FIGHTR11.AF`..`FIGHTR14.AF` and puts them in the mod's package; `src/test/genRobots.test.ts` checks the package's
  are up to date.
- **Arenas** (`gen/scene/`): 3D scenes (materials with procedural patterns, point lights with soft shadows, a mirror
  bounce, fog, stars, aurora) seen through the original arenas' camera (`scene/types.ts`), rendered on the CPU
  (`scene/render.ts`), quantized to the arena's 64 own colors plus the 90 every arena shares (`scene/palette.ts`, which
  also derives the 19 remap tables from the reference arena's), into `ARENAn.BK` plus a native widescreen background
  (`ARENAn.WID`, used instead of the mirrored extension). Their HD backgrounds come from the GPU twin
  (`scene/gpu.ts`) through a dev-server tool (`?genarenahd`, then `npm run gen:hd`), or from an image model
  (`npm run newart:export` / `newart:import`, `tools/newart/`): its painting also replaces the rendering the scene
  file is indexed from (`scene/art/ARENAn.png`).
- **Packaging** (`gen/dev/extras.test.ts`, `npm run extras`; `npm run gen` runs it): the fighter and scene files, the
  robots' HD pictures (rendered in Blender from their 3D models, `--blender`, see BLENDER_SPRITES.md; or cut out of HD
  bundles; each by the fingerprint of the sprite it stands for) and the arenas' widescreen HD backgrounds go into the
  package, with robot.json (names, special move names, CPU tactics and
  the `workshop` description of the 3D parts each robot is built from) and arena.json (texts, music, ambience). What
  is not given is kept from the package already there, and the same inputs give the same bytes.
- **Loading** (`mods/registry.ts`, `resources/generated.ts`, `resources.ts`): like any mod. The files hold only their
  own content; the parts every robot or arena shares (sparks, scrap metal, blasts; the round announcements, shared
  palette entries, the robots' remap rows, sounds) are copied from the player's FIGHTR0.AF / ARENA0.BK when loaded.
- **HD art** (`gen/hdArtwork.ts`): the robots' sprites are rendered again on the GPU at the HD artwork scale (as
  smooth polished metal: rounded facets and rims, a reflected studio, contact shadows, like the originals' HD
  artwork) from the
  same poses (a few per frame, as scenes need them) and registered in `hd/assets.ts` by pixel fingerprint, for the
  sprites the mod has no picture of (`modPictured`: the mod's Blender renderings come first); the arenas' HD
  backgrounds are the mod's.
- **In the game**: `game/roster.ts` (which robots and arenas can be picked: the originals and the loaded mods'; the
  mod is off by default, and players who had turned the new robots or arenas on in an earlier version find it on:
  `migrateNewContent` in `mods/bundled.ts`), the robot select screen's third row (`melee.ts`), VS images and arena
  previews (`vs.ts`), CPU tactics (`controller/ai.ts`), move names (robot.json, `roster.specialNames`), arena ambience
  (`fx/arenas.ts`) and special move effects (`fx/robotFx.ts`), which stay keyed by their numbers. In tournaments Plug
  offers them in trades (`vs.ts`); the mechlab's turning robot and select buttons for them are rendered by
  `gen/mechlabModel.ts` from the robot's `workshop` description (the buttons in the originals' grays inside an
  original button's frame, with remastered artwork made on the spot). A tournament pilot on a robot of a mod that is
  off does not fight: the mech lab says which mod to turn on.

## Remaster modes and tools

- **Replays** (`game/replay/`): the arena records every fight like the reference's REC recorder (`recorder.ts`: the
  pilots, match settings and random seed, then every input), except that the computer's inputs are all written (it
  does not send one every tick, so repeating the last one would change the fight) and a tick with several inputs of a
  human player (the special button) is written whole. `playback.ts` drives both robots with `controller/rec.ts`;
  jumping to a moment plays the fight again from the start without sound or effects (`GameState.silent`,
  `fx.setFxMuted`). `src/test/replay.test.ts` checks that fights play back tick for tick. Clips are saved by
  `platform/clipExport.ts` (MediaRecorder for MP4/WebM with the game's sound through `AudioSystem.captureStream`, and
  a GIF encoder in a worker, `platform/gif.ts`: changed pixels only, per-frame palettes, LZW).
- **Training lab** (`game/training/`): the frame meter classifies each tick of both robots (startup until the move's
  first frame with hit points, active, recovery until it can act; hit and block stun) from the HAR state and the ATTACK
  events; hitboxes draw the outline of a sprite's hittable pixels (index < 96, as `intersect.ts` tests them) and the
  current frame's hit points. The dummy (`controller/dummy.ts`) plays recordings and answers with reversals by sending
  a move's whole input in the tick it can act. Combo trials come from `src/gen/dev/comboSearch.test.ts`
  (`COMBO_SEARCH=1`: every timing of two and three moves against a standing dummy, with `src/test/comboSim.ts`),
  checked against every robot by `trialVerify.test.ts` (`COMBO_VERIFY=1`) into `trialData.ts`;
  `src/test/trials.test.ts` replays them all.
- **Network games** (`src/net/`, MULTIPLAYER > LAN): delay based lockstep. Both games run the whole simulation and
  only exchange their players' inputs, like a replay's: the fight is deterministic from the robots, the rules, the
  random seed and the inputs. `GameState.net` is the session; both players get a `NetController`
  (`controller/net.ts`), the local one owning the player's keyboard or gamepad (player 1's controls). The screens
  played in step are the robot select screen, the VS screen and the fights; each one opened is a *phase*
  (`NetSession.sceneChanged`, from `GameState.createScene`), and its input steps are the scene's input polls
  (`Scene.doInputPoll`: `beginStep` samples the local device and sends its input for the step `delay` steps on,
  `endStep` closes the step). A step needs the other game's input: until it is there `GameState.dynamicTickReady`
  holds the engine's dynamic tick back (the static ticks, menus and pages go on). The status bar (`net/statusBar.ts`,
  HTML at the bottom of the screen) names the local player's side and says whose move it is: the select and VS
  screens' `Scene.netStatus` (whose pick is still to come), or, a moment into a wait, whom the game waits for and
  whether they have got to this screen yet (`NetSession.peerArrived`); YOU and READY show over the players' portraits.
  On the VS screen the host picks the arena and the fight starts once both players have pressed PUNCH
  (`VsScene.netReady`). The LAN page shows the match for a moment once both games have agreed (MATCH FOUND: the names,
  the local player's side and cursor color, what comes next); ESC there calls it off with a goodbye. The delay is the
  host's (40 ms on a LAN) in the scene's steps,
  the same in both games. Inputs a scene reads apart from the players' controls (ESC on the select and VS screens) are
  injected into the local player's next step, so both games act on them at the same step; the select screen's mouse
  is off. Each fight is seeded from the session's seed and its phase (`NetSession.fightSeed`), runs at the host's
  speed and match settings (sent with the welcome, `NetRules`), never pauses (the pause menu and F1 open over the
  running fight, the local robot standing still meanwhile; no SPEED; QUIT is LEAVE GAME), and every 30 steps the
  games compare a checksum of both robots and the random generator (`fightChecksum`): a difference ends the game.
  The victory screen is each game's own (the first one done waits at the select screen). The handshake
  (`handshake.ts`) refuses another version or other content: the robots, arenas and pilots on, and a fingerprint of
  their files (`netContent`). Leaving, the other game's goodbye, a closed connection or 15 seconds of silence end the
  session; both games go back to MULTIPLAYER (`netplay.ts`). While the window is hidden the game keeps ticking
  (`Engine.idle` on a timer), so the other player does not wait. Links (`link.ts`) carry text messages in order:
  the desktop app's TCP connections (`src-tauri/src/lan.rs`, one writer thread per connection; the game batches its
  messages so its calls keep their order), the dev server's relay (`vite.config.ts`, between two tabs opened with
  `?devlan`), the tests'
  loopback with latency (`src/test/netplay.test.ts` plays whole games on two engines at different frame rates).
- **Special button** (`controller/special.ts`): the keyboard and gamepad controllers send the chosen special's whole
  input in one tick. `moveActions` sends a move that ends on the neutral position with its button after it (a robot
  reads STOP + button as no direction at all, a replay reads it back as the neutral position).
- **Finisher keys** (`controller/finisher.ts`, off by default): once the fight is won, a key asks for the scrap, the
  destruction or the Fire & Ice move, and the controller enters the robot's next finishing move whenever the robot can
  take it (the scrap on the victory pose's `jf` frames, the destruction on the scrap's `jf2` frames, any finishing move
  a frame's `jn` names: multi-part scraps, the Fire & Ice move after the destruction). The keys are latched by
  `input.keyPresses` (a press during the knockout's freeze, when no tick polls, still counts). Like the special button,
  it only sends ordinary inputs: network games and replays see the same as from the original motions.
- **Modes and records** (`game/modes/run.ts`): a run set on `GameState.modeRun` picks the opponents (on the robot
  select screen), shows its line in the fight and decides what follows each fight (`arena.ts`); records and
  achievements are in `game/records/`.
- **Workshop** (`gen/workshop.ts`): a robot description picks a frame, a head, the moves of the generated robots, a
  size, a weight and colors; `workshopRobot` makes a `GenRobot` of it and `buildWorkshopFighter` a fighter file, which
  `game/workshop/registry.ts` provides as `FIGHTR15.AF`.. (HARs 15 to 22, named in the language file's free entries)
  and registers with `gen/roster` (move names, remastered artwork). The editor's picture is rendered in HD from the same
  shapes by `GeneratedArtwork.renderPictures` (also the mechlab's turning new robots), against a palette row that moves the robot's color ramps to the page's
  palette entries.
- **Custom tournaments** (`game/tournament/custom.ts`): a `TournamentFile` derived from an installed one, registered
  with `resources.registerTournament` so the tournament list and saved characters find it.
- **Presentation**: the announcers (`audio/announcer.ts`, a male and a female voice, lines made by
  `tools/make-announcer.py`; while one is on, the arena's announcements play without the original game's voice), the
  newsreader (`audio/newsVoice.ts`: the newsroom's reports read aloud in the announcer's voice, stitched from
  recordings of each text's fixed pieces, one per pronoun version, and of the names in their places in a sentence;
  `audio.playSequence` plays them back to back and lowers the music meanwhile), the
  victory screen
  (`scenes/victory.ts`, a scene on the VS backdrop between the fight and what follows it) and the fight camera
  (`video/camera.ts`; the HD renderer zooms the finished world image before the overlay is drawn).
- **Remaster credits** (`game/credits/`): EXTRAS › CREDITS, scored to the credits' song. `song.ts` is the song as
  music: its steady tempo (137.98 BPM, a beat tracker's 679 beats over the master within 10 ms of a straight line), its
  bars (bar k's downbeat is beat 2 + 4k; bar 168 is the final hit) and sections. `conductor.ts` is the credits' clock:
  the song's position (the track's own, run on the page clock between its updates) or, without the song (no audio, the
  file missing, the tests), the credits' own time counted in static ticks (`GameState.staticTick` calls
  `CreditsHooks.staticTick`). `battles.ts` holds the fights: every credit, its robot, colors, opponent, arena and seed
  (`CREDITS_RULES`: both robots the computer's at ULTIMATE, the normal speed, both as strong, no HYPER moves, a single
  round, the match rules' defaults, so a fight plays out the same every time; `src/gen/dev/creditsSeeds.test.ts` scores
  seeds for fights that go back and forth, and the credit wins every one it keeps), and the game ticks measured from the
  arena's opening to the final blow and to the end of its aftermath. `creditsRun.ts` keeps the
  timetable: the title through the song's intro, the first arena held under it; every arena opens held (paused, which
  leaves the fight as it is) and is let go at the moment that lands its final blow on a half bar, its VS card on the
  downbeat before, a tick of 27 or 29 ms instead of 28 catching up drifts on the way; the cut on a downbeat after the
  blow's aftermath (the fights never end by themselves: `endTicks`; the arena's `finishing` tells a finishing move or
  the score is on); last the end titles, and a cut on a downbeat to the song's ending (`audio/credits/*-ending.flac`,
  made by `tools/credits/ending.mjs`; `Track.cutTo` starts it on the Web Audio clock where the song reaches the
  downbeat) so that they finish on the final hit whenever the fights ended. The view is worked out from the song's
  position every frame, not left to CSS animations, in the game's own look (`look.ts`: the menu frame's shade, grid and
  border, the VS screen's box and its yellow and green, the pages' colors, hard shadows, text typing in behind a block
  cursor): `creditsView.ts` (over the game: the menu frame wiping across between fights with the next credit, the VS
  card, the credit's card and its WINS, the now playing box with its meter; leaving, the picture folds away like an old
  TV), `computerRoom.ts` (the fights on an old PC in the game's colors: a picture of it behind the game, the game's
  canvas moved onto its monitor's glass and cut to its shape with a CSS mask, drawn at 4:3 so that the renderer shows
  the classic screen with its HUD, and the place on the tower where the credit's card flies in as the round starts; a
  window too small or too tall for the tower's card to be read keeps the fights full screen. The picture is rendered in
  Blender by `tools/blender/credits_computer.py`, finished by `credits_computer_post.py`, measured by
  `credits_screen_grid.py` and `credits_layout.py`, and made into `public/credits/computer` by
  `credits_computer_web.py`), `stage.ts` (the main menu's painted layers as page pictures under a moving
  camera, graded from night to dawn; canvases for the lightning, searchlights, stars, the spotlight on the statue, embers
  and sparks), `titleCard.ts` (the 1994 intro's logo, lightning and digits, cut out of the HD artwork by
  `tools/credits/title.py`, struck in on the drop and written 2 0 9 7 on the next bar's beats) and `finaleRoll.ts` (the
  winners, each with a picture taken of its fight: `CreditsRun.rendered` after the game draws a frame; the credits a
  phrase at a time; the final frame). The song plays through `AudioSystem.playTrack` (a media element at the music
  volume, with an analyser for the equalizer and the embers; END.PSM when it cannot be played). Tests:
  `test/creditsBattles.test.ts` (every fight won), `test/creditsShow.test.ts` (the timetable on the song's grid, the
  stored ticks, the cut, skipping). Dev: `?credits=n` (the n-th fight; 8: the end titles).
- **HTML over the game**: notices (`platform/toast.ts`), achievement banners (`platform/achievementBanner.ts`, queued,
  from `records.unlock`), the main menu's name and version (`platform/versionLabel.ts`, the version from package.json
  through Vite's `__APP_VERSION__`) and the loading screen (`index.html`, `bootStatus` in `main.ts`; the logo is
  `public/brand/logo.webp`, made by `tools/brand/logo.py`) use the remaster's typeface (`platform/uiFont.ts`). At the
  first start (`settings.setupDone`), the setup (`platform/setupScreen.ts`) opens over the finished loading screen;
  development URLs with parameters (`?scene`, `?fight`...) skip it. Screenshots: PRINT SCREEN (key release; F12 in the desktop app) renders a frame and saves the
  canvas as a PNG through `platform/files.ts`.
- **Touch controls** (`platform/touch.ts`): DOM controls read by player 1's keyboard controller like a gamepad.

## Fire and Ice

The one-player game's two secret opponents (`game/fireIce.ts`), reverse engineered from the original program
(`MASTER.DAT`, a PMODE/W LE executable; the addresses are its code object's, loaded at 0x10000) and the Fire & Ice FAQ
(Robyrt, 2001):

- **The way down** (`[0x847b4]`, set at 0x314b3): the Fire Pit (arena 3), the one-player game against the computer,
  CHAMPION or harder; from Fire's stage only on ULTIMATE, never from Ice's; not once Fire was beaten (`[0x847bc]`, set
  when a secret opponent loses, cleared at a new game). A robot's condition mask (0x112aa) holds the bits its moves'
  position constraints ask for: 8 << arena, 0x2000 the way down open, 0x4000 the opponent destroyed (the pilot record's
  byte 0x9b). The Fire & Ice moves need all three (0x6040); `har.ts` checks those bits (`harConditions`) and still
  leaves the move out (`'!'`) where the way is shut.
- **The tags**: `b1` sets the flag that sends the game down after the match (`[0x84980]`), `b2` the one that shows the
  broken floor (BK animation 12); both only where the way is open, and not while a recording plays back. `ax` (fall
  through the floor) is parsed but used nowhere: the moves' own frames do the fall. After a match with `b1`, the stage
  goes up (0x32f4b) and the next fight is set up at once, against the beaten pilot's record rewritten (0x31033):
  - FIRE: Katana, power 24, agility 26, endurance 30, offense and defense 130, move preferences (throws 50, specials 20,
    jumps 10, high -5, low 10, middle 10; jumping -20, forward 100, back 10), the third enhancement; score x5.
  - ICE: Shadow, power and agility 30, endurance 33, offense and defense 170 (throws 50, specials 50, jumps 20, high 2,
    low 20, middle 20; jumping 0, forward 10, back 100), the third enhancement, draw flags 0x400 (the `bt` mode, the
    word at 0xf4); score x10 on top of Fire's.
  Their colors are not loaded from the record (0x31334): the stage palette's player 2 entries (48-95, ARENA3.BK
  palette 1 flames, 2 ice). The player's robot is colorized toward (63,35,0) by 16/64 (Fire) or (0,20,63) by 19/64
  (Ice), with the palette effect at 0x5ec68 (mode 1).
- **The arena** (0x1b0ee): the stage is the arena variant: its BK palette, remap tables and the animations' extra
  string of that index (0x29428). On a secret stage the original draws animation 5's sprites into the background: the
  hole in the ceiling, the floor over the grille (except on Fire's stage on ULTIMATE: the blue grille is the way on),
  Ice's frost; it turns the globes off (animation 0's probability) and, on Ice's stage, animation 5's shimmer on. Here
  the sprites are scenery objects (the background keeps its fingerprint, so its HD painting and depth are found), the
  shimmer runs with `GameObject.spritelessPaletteFx` (its frames have no sprite), and a beaten Fire leaves the pit with
  its solid floor and no globes.
- **After**: losing to Fire or Ice costs nothing (0x4bedd): the game goes on from the fight that led down, whose news
  (`FireIceResume`) and next arena follow. The REC header's byte after the scores is the stage (`RecFile.secretStage`);
  the remaster's records add the Fire Pit's floor in an extended record ('F', `recFirePitFlags`), so a recording plays
  back with the same globes and floor.
- **Scores**: the original's one-player multipliers (0x30c6b) are 20, 40, 60, 80, 100, 150 and 200 percent, so DEADLY
  and ULTIMATE count 1.5 and 2 times (the FAQ's 400,000 for a destruction on ULTIMATE, 2 million on Fire's stage).

## Mods and OMF Studio

Mods (`src/mods`) are zip archives of the game's own formats: a robot is a fighter file (AF) and a JSON file of what
the game cannot read from it (its name, special move names, which specials the computer uses for its tactics); an
arena a scene file (BK), its widescreen background and a JSON file (texts, music, ambience, the original arena whose
built-in rules it follows); a pilot a JSON file and PNG pictures. At start-up (`main.ts`, before the language)
`loadMods()` reads the mods that come with the game (`mods/bundled.ts`: `public/mods/index.json` lists them, and a
package is fetched only when its mod is on; the service worker keeps it by its signature) and the installed mods that
are on, checks them like OMF Studio does, gives their content numbers (kept in localStorage by `<mod id>/<content id>`,
because replays, records and the training setup save them; the new robots and arenas keep the numbers they had before
they were a mod, `mods/extras.ts`) and registers it: files through `provideGenerated` (so robots get the
shared effect moves and arenas the shared palette, remap rows, announcements and sounds at load), names through
`setHarName`/`HAR_NAMES` and `harName()`, the rest in the registry that `roster.ts` asks (the select grids' extra rows,
`arenaList()` for the rotation and the VS screen, `pilotInfo()`/`pilotNameOf()`/`pilotBio()` for pilots). Arenas are the
last block of `SceneId` (`ARENA0 + n` for any n below `MAX_ARENAS`), and code keyed by an original arena asks
`arenaBase()` (built-in rules) or `arenaLook()` (remastered ambience and acoustics). A mod's HD pictures
(`hd.json`) are loaded when a screen needs them (`mods/hdArt.ts`, from `onSceneChange` like the generated robots'
artwork, and from the portrait surfaces the screens make) and registered with the HD artwork by the fingerprints of
the classic pictures they stand for, against the palette they were painted in; freed a few screens after the last
that wanted them. A robot whose robot.json describes the workshop's parts it is built from (`workshop`) is registered
with `gen/roster` like the workshop's robots: the mechlab's turning model and buttons, and HD pictures rendered from
its 3D model for the sprites the mod has no picture of. The engine keeps what it loaded, so turning mods on or off
applies at the next start (the first start's setup loads the new robots and arenas' mod at once when it is picked).

OMF Studio (`studio.html`, `src/studio`) is a separate page on the same origin: plain TypeScript and DOM, 2D canvases
for its pictures (no `GameState`: the engine's singletons are the game's), in the game's look (`studio.html`'s styles:
the menus' grid frames and blue border, the pages' colors, the remaster's typeface with the game's hard shadows).
`app.ts` is the window (the start screen, the list, the top bar with what the checks say), `home.ts` the mod's page
(what to do next, what the mod holds, its details), `ui.ts` the shared pieces (the content's pictures, the editors'
heads with their checks and a test button, the cards that fold away). A project is a mod package open for
editing (`project.ts`: fighter and scene files parsed, written back with `saveAF`/`saveBK`), kept in IndexedDB as it
changes (`storage.ts`); undo and redo keep copies of the project after each round of changes (`history.ts`: its
structure is copied, the bytes of pictures and files shared, since Studio replaces them and never writes into them).
The game's own robots, arenas and pilots' portraits, for the copy choices and the test's preview, are read once
(`gamePictures.ts`), and an arena's song plays through the game's own player (`music.ts`). Animation strings are edited as tokens that keep every character (`anim.ts`: an unedited
string is written back exactly; the tests check every string of the game's files), sprites through their sharing
groups (`sprites.ts`: a picture stored once for several sprites is edited everywhere or split off), in a pixel editor
(`pixel.ts`) working in the animation's coordinates. One panel edits an animation's frames, tags and sprites over its
stage (`animPanel.ts`); a robot's moves (`robot/moveEditor.ts`) and an arena's animations (`arena/animEditor.ts`) are
its hosts, each adding its own cards (a move's input and combat fields; an animation's looping, chance, damage and
chains). A pilot's words are laid out by the game's own text code in the boxes of the screens that show them
(`pilot/words.ts`), its portrait fitted into each screen's colors by the game's own functions (`mods/portraits.ts`),
and its personality edited as the fields the original pilots have (`controller/personalities.ts`, the table the
game's `resetPilotPersonality` applies). HD pictures are held by the fingerprints of the sprites they stand for, so
they follow their pixels (`hd.ts`: templates, shape checks, WebP; `hdCard.ts`: the cards); a robot built from the
workshop's parts (robot.json's `workshop`) has its sprites rendered again from the 3D model with the game's HD robot
renderer (`robot/hdModel.ts`: the model's sprites made again and matched by fingerprint, drawn by `RobotHdRenderer`,
read back). **Test** puts the built package in the game's storage as the mod being
tested and opens `index.html?modtest&t=…&h1=mod:<id>…` in a frame: the game loads it over the installed mods and starts
the fight, or the one-player game at its pilot select screen, its VS screen or its ending (`testContent()` in the
registry turns the names into numbers; `gs.modTest` shows the arena's hazards and Kreissack whatever the settings).

The desktop app (`src-tauri`) opens the game's window, or Studio's when it is started with `--studio` or its file is
named like Studio (`OMF-Studio-….exe`, `OMF Studio.app`, `OMF-Studio-….AppImage`); the game's **Extras › OMF Studio**
opens Studio's window through the `open_studio` command. Both windows share the storage. LAN games are the desktop app's (`src-tauri/src/lan.rs`, through the `lan_*`
commands and `lan:open` / `lan:data` / `lan:close` events): a hosted game waits on TCP port 2097 (the reference's
network port; any free port when another program has it) and answers searches broadcast on UDP port 2097 to every
network adapter; messages travel as text after their length. `lan.rs` has no Tauri in it, so its tests (`cargo test`)
open real sockets on the loopback address without a window.
