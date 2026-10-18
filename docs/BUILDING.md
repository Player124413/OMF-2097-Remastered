<p align="center"><img src="media/doc-building.jpg" alt="Building OMF 2097 Remastered" width="100%"></p>

## Prerequisites

- **Node.js 22.12+** (developed on Node 24) and npm.
- **The original game's data** comes with the repository (`public/gamedata/`; *One Must Fall 2097* is freeware, see
  [NOTICE.md](../NOTICE.md)), and so does the imported HD artwork (`public/hd/`).
- **Desktop or Android native builds:** Rust stable via [rustup](https://rustup.rs) and network access for the first build (Cargo downloads crates).
- **Desktop build only:** on Linux the Tauri CLI also downloads the AppImage tools, and:
  - Windows: Visual Studio 2022 Build Tools (or newer) with the "Desktop development with C++" workload (MSVC linker
    and Windows SDK), and the Microsoft Edge WebView2 runtime, which comes with Windows 10 and 11.
  - macOS: the Xcode command line tools (`xcode-select --install`).
  - Linux: WebKitGTK 4.1 and the build tools; on Debian and Ubuntu `libwebkit2gtk-4.1-dev librsvg2-dev patchelf
    libxdo-dev build-essential file`, and `gstreamer1.0-plugins-base gstreamer1.0-plugins-good` for the AppImage's
    sound.

  See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for details.

## Setup

```sh
npm install
```

To use the data of another copy of the game instead (the CD's `OMF/OMF21.EXE`, a PKZIP self-extractor, or an
installed copy):

```sh
npm run extract                       # reads omf21cd/OMF/OMF21.EXE (falls back to gamedata/)
npm run extract -- path/to/OMF21.EXE  # or pass OMF21.EXE, a .zip, or an installed game directory
```

`extract` replaces the files in `public/gamedata/` with that copy's.

### HD artwork

The imported artwork in `public/hd/` comes with the repository. To replace it with a new HD asset pack (see the
README):

```sh
npm run hd:export                     # writes the pack for the image model to hd-pack/ (sources, guides, prompts, specs)
npm run hd:export -- path/to/folder   # or to another folder
npm run hd:import                     # reads hd-pack/, writes public/hd/ (needs Python 3 with numpy and Pillow)
npm run hd:import -- path/to/pack     # or another pack folder
```

The export empties its folder first, so it stops when the folder holds delivered `*.hd.png` files (they are not in
git): export to another folder, or add `-- --force` to delete them. `npm run newart:export` (below) does the same.

The web and desktop builds include `public/hd/` when it exists; without it, the remastered mode upscales the
original images procedurally.

### The main menu's layers

In remastered mode the main menu is a parallax scene of painted layers (`public/hd/menu/`, drawn by
`src/video/stage/parallax.ts`). `npm run menu:export` writes a small pack for an image generation model to
`menu-pack/`: a master image of the whole scene and the layers cut from it (sky, city, the two towers, the robot and
the robot in the spotlight, two rows of crowd), each with a guide, a mask, a context image and a prompt (the pack's
README and OUTPUT_SPEC explain the rest). Once the model has made the `*.hd.png` files:

```sh
npm run menu:import                   # reads menu-pack/, writes public/hd/menu/ (Python 3 with numpy and Pillow)
```

Layers the pack does not have yet come from placeholders cut from the current HD artwork (made by `menu:export`).

### Generated content: the new robots and arenas

The new robots and arenas are generated from `src/gen` and come with the game as a mod: its package,
`public/mods/omf2097r.extras.omfmod`, and the list of the mods that come with the game, `public/mods/index.json` (both
committed, so a fresh checkout does not need this). After changing their definitions:

```sh
npm run gen                           # robots (FIGHTR11-14.AF) and arenas (ARENA5-8.BK/.WID), then into the package
SKIP_ARENAS=1 npm run gen             # only the robots (ROBOT=glacier for one); SKIP_ROBOTS=1 / ARENA=ORBITAL,ARENA7 likewise
npm run gen -- some/folder            # only the files, into that folder (the package stays as it is)
```

The arenas need the game data (`public/gamedata`). `npm run gen` makes the files in a work folder and runs
`npm run extras`, which packs the mod: what it is not given is kept from the package already there, and the same
inputs give the same package, byte for byte. Its options, for the other steps below:

```sh
npm run extras -- --gen <folder>      # the fighter and scene files of that folder (npm run gen's)
npm run extras -- --hd <folder>       # the robots' HD pictures, cut out of the fighter-GLACIER... bundles of an HD asset folder
npm run extras -- --arena-hd <folder> # the arenas' HD backgrounds (ARENAn-WIDE.webp, 2880 x 1200)
npm run extras -- --out <folder>      # somewhere else than public/mods
```

A robot's HD picture goes with the fingerprint of its sprite: a sprite that changed loses its picture, and the game
renders that one from the robot's 3D model instead, on the GPU while it runs. The arenas' HD backgrounds are rendered
on the GPU in the browser: start `npm run dev`, open http://localhost:5173/?genarenahd (or `?genarenahd=ARENA6.BK`
for one arena), wait for "done", then run `npm run gen:hd` (Python 3 with Pillow) to put `.captures/ARENAn-WIDE.png`
in the package (arenas painted by an image model, see below, keep their paintings unless `-- --force`).

### The new robots' and arenas' artwork

The generator's robots and arenas are plainer than the originals' HD artwork. `npm run newart:export` writes a pack for
an image generation model to `newart-pack/` (and `newart-pack.zip`): each arena as one widescreen painting to redo
(2880 × 1200, with the current painting as its guide and a layout image of the lines to keep: the floor, the fighting
area, the 4:3 screen), and each robot as a design sheet (its fighting stance, to settle its detailed look) followed by
every frame of its animations, redrawn from it. Reference sheets set the originals' HD artwork (from `hd-pack/`) next
to the new content as the game shows it now; the pack's README, OUTPUT_SPEC and STYLE_GUIDE explain the rest. Once the
model has made the `*.hd.png` files:

```sh
npm run newart:import                 # reads newart-pack/ (Python 3 with numpy and Pillow)
npm run newart:import -- path/to/pack # or another pack folder
```

An arena's painting becomes its HD background and, at the native 576 × 200, `src/gen/scene/art/ARENAn.png`, which
`npm run gen` indexes in place of the rendering: the classic graphics, and the colors the painting is recolored
through. The robots' frames are clipped to their silhouettes, get a steel core drawn in behind them through the waist
(where a sprite's spine rings part in a leaning pose, the painting showed the torso floating over the hips;
`src/gen/dev/spineCore.test.ts` renders the core), are copied into `hd-pack/` (their jobs added to its `jobs.jsonl`)
and made into HD bundles with the originals' artwork's importer. The import runs all of it and puts the results in
the mod's package (`npm run extras`); `public/hd/` is not touched. A later full `npm run hd:import` makes the new
robots' bundles too: it puts them in the package the same way and takes them back out of `public/hd/`. Anything not
delivered keeps its current artwork; `newart-pack/import_report.txt` lists deliveries worth a look (no transparency,
drawn outside the silhouette, a moved composition).

The new robots' pictures in the mod are rendered from their 3D models in Blender (see
[BLENDER_SPRITES.md](BLENDER_SPRITES.md)), which keeps every frame's detail the same: `npm run blender:export --
<robot>` writes a robot as glTF (every sprite as a scene of its parts), `npm run blender:render -- <robot>` renders
every sprite's HD picture and color zone mask and grades them in the paintings' colors (Blender 5.2, `BLENDER=` its
path when it is not in the default place; Python 3 with numpy and Pillow), and `npm run extras -- --blender
.captures/blender` puts them in the mod's package (a new-art delivery of robot frames would put paintings back in
their place). `tools/blender/score.py` compares them with the paintings.

### The arenas' depth

In remastered fights the arenas' paintings have depth: each has a geometry map (its surface direction and depth,
estimated from the painting by MoGe, a monocular geometry model), so the fights' lights light the floor and the walls
facing them instead of glowing over the far end of the room, and the camera's moves (the shake, the knockout zoom, the
fight camera) move near things more than far ones (the arena's own animations go with the wall they are on). Arenas
with thin things in front of far ones (fences, window frames, railings) get the light but no parallax: the background
is moved pixel by pixel, which bends them.

```sh
python tools/arena-geo.py                       # the original arenas: public/hd/geometry/ (index.json by painting)
python tools/arena-geo.py --mod public/mods/omf2097r.extras.omfmod   # the new arenas: .captures/arena-geo
npm run extras -- --arena-geo .captures/arena-geo                      # puts those in their mod (hd.json "geometry")
```

Both need ComfyUI (0.38 or later, at http://127.0.0.1:8188, or `--comfy`) with `moge_3_vitl_fp16.safetensors` in
`models/geometry_estimation` ([Comfy-Org/MoGe](https://huggingface.co/Comfy-Org/MoGe)). `--far` and `--parallax` set
an arena's depth range and how much parallax it gets (`src/video/hd/geometry.ts` explains them).

### The new arenas' moving scenery

Now and then something crosses the new arenas behind the fight (`src/gen/scene/scenery.ts`): a hover-car over the
Rooftop, a shuttle outside the Orbital station's window, shooting stars over the Ice Cave's mountains, a research
submersible outside the Abyss's dome. They are modeled and rendered in Blender (the shooting star is drawn), each frame
the HD picture of a sprite in `src/gen/scene/scenery/`; the classic sprites are those pictures scaled down to the
native pixels, in the arena's own colors. Where a piece passes behind parts of the painting (the window's bars, the
dome's ribs, the rocks around the cave's mouth), those parts are cut out of the painting by their depth (MoGe again,
as above) and drawn over it as another animation of the arena's own: its HD picture is the painting's own pixels, its
classic sprite the background's, so it cannot be told from the painting until something passes behind it.

```sh
blender -b --factory-startup -P tools/blender/setpiece.py -- shuttle   # car, shuttle, sub or meteor (Blender 5.2)
python tools/scenery-cutout.py orbital --rect -20,54,360,46 --near 55   # each cut-out's command is in scenery.ts
npm run extras                                                          # puts them in the new arenas' mod
```

### The original robots' consistency

The original robots' HD frames were painted one by one, so a part can be painted differently from frame to frame
although its sprite shows it the same way, and the armor flickers in play. `npm run rework:survey` measures it
(`.captures/consistency`: a score per robot, move and frame, contact sheets, hotspot maps). Two ways to reduce it:

```sh
npm run rework:steady -- --robots JAGUAR --seams 0.10   # writes .captures/steady (Python 3 with numpy and Pillow)
npm run rework:import -- .captures/steady --robots JAGUAR
```

`rework:steady` makes frames agree where that can be done cleanly: wherever part of a frame's sprite reappears
unchanged in the robot's canonical idle frame or in an earlier frame of its move, the frame takes that frame's painting
of it (whole regions, aligned, blended in). `--seams 0.10` keeps it to where the two paintings agree at the region's
edge, so seams hardly show (thin parts can get small specks: FLAIL's gun barrels); without it the frames agree far
more, but seams show where a part was painted in a different shape. `rework:import` puts the result in `hd-pack/` (the replaced paintings are kept in `hd-pack/rework-backup/`;
`npm run rework:import -- --restore` puts them back), rebuilds those robots' bundles in `public/hd/` and surveys them
again. Or `npm run rework:export` writes a pack to redraw robots with an image model (each robot's design sheet first,
then every frame from it), imported the same way.

### Other generated data

- **Combo trials** (`src/game/training/trialData.ts`, committed): `COMBO_SEARCH=1 npx vitest run
  src/gen/dev/comboSearch.test.ts` searches every robot's combos (about 15 minutes), then `COMBO_VERIFY=1 npx vitest run
  src/gen/dev/trialVerify.test.ts` checks them against every robot and writes the file.
- **Announcers** (`public/audio/announcer/male|female/*.mp3`, committed): `python tools/make-announcer.py` performs
  the lines with [ElevenLabs](https://elevenlabs.io) Eleven v4 (set `ELEVENLABS_API_KEY` to an API key with text to
  speech access; `--voice male`, `--takes N` or a list of lines to redo some): each line is directed with audio tags,
  generated in a few takes, the most intense one kept, and finished with ffmpeg. The round calls are kept under 1.2 s
  (the time before "Fight!"). Any line can be replaced by a recording of the same name.
- **Newsreader** (`public/audio/news/male|female/`, committed): `npm run news:voice` writes the recording plan
  (`src/gen/dev/newsPlan.ts`: the news texts in their pronoun versions with stand-in names, and every name in carrier
  sentences for the places it takes) and records it with ElevenLabs (`tools/make-news.py`, `ELEVENLABS_API_KEY`;
  `-- --voice female`, `--only t97` for some, `--force` to redo): the speech comes with character timestamps, so the
  texts are cut tight around the names and the names out of their carriers. Recordings already made are kept, so a run
  resumes. `-- --engine sapi --out DIR` tries the whole chain for free with Windows' speech synthesizer.
  `src/test/newsVoice.test.ts` checks that the plan covers every report with every name.

### The game manual

The manual (`docs/manual/OMF-2097-Remastered-Manual.pdf`, committed) is made from `tools/manual`: the game's own
texts, the pilots' stats and every robot's command list are read from the game data (the command lists as the pause
menu's move list shows them), laid out as the pages of a 1990s booklet and printed to PDF by Microsoft Edge in
headless mode (Windows).

```sh
npm run manual                        # docs/manual/OMF-2097-Remastered-Manual.pdf; reports pages whose content does not fit
npm run manual:images                 # the pictures in tools/manual/img (Python 3 with Pillow)
```

`npm run manual` only needs `tools/manual/img` (committed). The pictures are made from the HD asset pack (`hd-pack/`:
the robots, the pilots, the logo), the imported artwork (the main menu's layers, the arenas) and screenshots recorded
from the game (`.captures/trailer2`), so `manual:images` only runs when they change.

### The GitHub pages' pictures

The README's hero, buttons, section banners and footer, the docs' headers and the repository's social preview
(`docs/media`, committed) are HTML in the style of the game's menus (the blue grid panels in their bright blue frames,
the green and gold Orbitron, the painted main menu), made by `tools/github/build.mjs` from the game's own pictures and
shot by Microsoft Edge in headless mode (Windows):

```sh
npm run github                        # every picture
npm run github -- hero banner-build   # only those (their file names)
npm run github -- --out some/folder   # somewhere else, to compare first
```

The social preview (`docs/media/social-preview.jpg`, 1280 × 640) is set in the repository's settings (General ›
Social preview): GitHub has no other way to set it.

## Web

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on http://localhost:5173 (strict port). |
| `npm run build` | Typechecks (`tsc --noEmit`), then builds the static site into `dist/`. `npm run preview` serves it. |

The build uses relative URLs (`base: './'`), so `dist/` works from any path.

### Publishing the web version

`npm run build` makes the complete site: game data and artwork included, the game starts with one click. The
[Web version](../.github/workflows/pages.yml) workflow builds it and publishes it on GitHub Pages on every push to
`main`, while the site is turned on (repository settings: Pages from GitHub Actions, and the variable
`WEB_VERSION = on`). It is: [jared-woodruff.github.io/OMF-2097-Remastered](https://jared-woodruff.github.io/OMF-2097-Remastered/).

### A lean web version

| Command | What it does |
| --- | --- |
| `npm run build:web` | `npm run build`, then reports the site's size (game data and artwork included). |
| `npm run build:web -- --lean` | The same, then removes `dist/gamedata/` and `dist/hd/` (about 110 MB left of 235: the music, with the credits song's 69 MB, and the new robots' mod, 27 MB). |

A lean site asks for the game on its first visit: players drop or pick the freeware `OMF21.EXE`, a zip
that contains the game or its installer, or the folder of an installed copy. `src/platform/gameData.ts` unpacks it in
the browser (the installer is a PKZIP self-extractor; deflate goes through `DecompressionStream`) and keeps the files
in IndexedDB, so later visits start right away. Nothing is uploaded. A service worker (`public/sw.js`) caches the
site for offline play, and `public/manifest.webmanifest` makes it installable. Serve it over HTTPS (or localhost):
browsers only run service workers there.

## Desktop (Tauri 2: Windows, macOS, Linux)

| Command | What it does |
| --- | --- |
| `npm run desktop:dev` | Runs `npm run dev` and opens the game in a native window with hot reload. This is a debug build, so DevTools are available (F12 or right-click > Inspect). Port 5173 must be free. |
| `npm run desktop:build` | Runs `npx vite build` (no typecheck) and compiles the release program with `dist/` embedded; on macOS it makes the `.app`, on Linux the AppImage. |

`desktop:build` outputs (no installers: every download is portable):

- Windows: `src-tauri/target/release/omf2097-remastered.exe`, the whole game in one file. It only needs the WebView2
  runtime.
- macOS: `src-tauri/target/release/bundle/macos/OMF 2097 Remastered.app`, signed ad hoc (Apple Silicon runs nothing
  unsigned). It is not notarized: on another Mac, **System Settings › Privacy & Security › Open Anyway** opens it the
  first time.
- Linux: `src-tauri/target/release/bundle/appimage/OMF 2097 Remastered_<version>_<arch>.AppImage`, with WebKitGTK and
  GStreamer inside.

The program opens OMF Studio instead of the game when it is started with `--studio`, or when its file is named like
Studio: an exe or AppImage with "studio" in its name, a `.app` named like `OMF Studio.app` (`studio_start()` in
`src-tauri/src/lib.rs`). The release's Studio downloads are the same program under such names.

The first desktop build compiles all the Rust dependencies, which takes a few minutes. Later builds are incremental.

Release builds turn off the browser's shortcuts on Windows (F5 and Ctrl+R reload, Ctrl+F find, Ctrl+P print, and so
on) and its right-click menu everywhere (`blockBrowserMenu()` in `src/platform/desktop.ts`; text fields keep theirs).
The game still receives every key. On macOS the menu bar's Quit closes the windows (so Studio saves first) instead of
ending the program on the spot.

The desktop app keeps its web storage (localStorage, IndexedDB) in `%LOCALAPPDATA%\com.omf2097.remastered\EBWebView`
on Windows, in WebKit's store for the app's identifier on macOS, and in `~/.local/share/com.omf2097.remastered` on
Linux.

### Release downloads

`.github/workflows/release.yml` builds the downloads when a release is published, and attaches them to it with the
manual: the game and OMF Studio for Windows 10/11 (x64, ARM64 and 32-bit, cross-compiled on an x64 runner), macOS 12
or later (Apple Silicon and Intel, both on an Apple Silicon runner) and Linux (x64 and ARM64 AppImages, each on its own
kind of runner, Ubuntu 22.04 for an old enough glibc). The files carry no version in their names
(`OMF-2097-Remastered-windows-x64.exe`, `OMF-Studio-macos-arm64.zip`...), so the README links to the latest release's
files. Started by hand (Actions › Release packages › Run workflow), it builds a tag's downloads and attaches them to
its release, or with no tag just builds them as the run's artifacts.

The app version comes from `package.json`. Tauri settings are in `src-tauri/tauri.conf.json`, and window permissions are in
`src-tauri/capabilities/default.json`. Game code reaches native window features through `src/platform/desktop.ts`.

The app's pages run under a Content Security Policy (`app.security.csp` in `tauri.conf.json`): scripts, workers and
frames from the app itself, pictures, sounds and fonts also from `data:` and `blob:` URLs, and the app's own IPC
(`http://ipc.localhost`). Anything new from elsewhere (another site, another URL scheme) must be added there. The game
and Studio build their styles while they run, so Tauri is kept from adding a nonce to `style-src` (with a nonce there,
browsers ignore `'unsafe-inline'` and refuse those styles). `npm run desktop:dev` runs under the looser `devCsp`.

## Android

The native Android shell (Tauri 2) starts directly in landscape and immersive full-screen mode. Its generated activity
is configured by `tools/android/configure.mjs`; the script reapplies the orientation, transient system bars, display-cutout
settings and Android's normal (no prompt) vibration permission after `tauri android init` and before each build.
`src-tauri/gen/android/` remains generated/ignored, not checked in.

Install Android Studio, its bundled JDK (17 or newer), and from SDK Manager install **Android SDK Platform**,
**Platform-Tools**, **Build-Tools**, **Command-line Tools** and **NDK (Side by side)**. Set `JAVA_HOME`, `ANDROID_HOME`
and `NDK_HOME` for your machine, then install the Android Rust targets:

```sh
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

Then run:

```sh
npm run android:init                 # creates Tauri's Android project and configures immersive landscape mode
npm run android:dev                  # run on a connected device or emulator (hot reload)
npm run android:dev -- --open       # open the generated project in Android Studio
npm run android:build                # release APKs for the supported Android ABIs
npm run android:bundle               # Android App Bundle for store distribution
```

For ready-to-install testing builds, `.github/workflows/android-apk.yml` builds optimized, debug-key-signed APKs for
64-bit ARM (`arm64`) and 32-bit ARM (`armv7`) on pull requests and pushes to `main`, or when run manually from
**Actions → Android APK**. The artifact contains `OMF-2097-Remastered-arm64.apk` for 64-bit ARM phones and
`OMF-2097-Remastered-armv7-32bit.apk` for 32-bit ARM phones. These are for device testing, not Play Store releases;
Play distribution needs your own release signing key.

For a physical device, enable USB debugging and accept its ADB prompt. If Android Studio cannot reach the Vite server,
pass the computer's LAN address to the mobile dev server, for example `npm run android:dev -- --host 192.168.1.25`.
The generated APK/AAB files are under `src-tauri/gen/android/app/build/outputs/`. A Play Store upload needs your own
release signing key; signing credentials are not stored in this repository. The current release workflow still publishes
desktop builds only. Files exported from Android are written under the app's scoped
`Android/data/com.omf2097.remastered/files/Download/OMF 2097 Remastered` directory, so no broad storage permission is
requested; copy them elsewhere before uninstalling the app.

The Android renderer is tuned for a GPU-bound game: Android starts with a conservative 4×-native internal-resolution
ceiling, the canvas is budgeted to at most 3 megapixels (2.25 device-pixel scale), and the full scene render is capped
to 60 Hz on high-refresh displays; fixed 100 Hz input ticks and game-speed simulation ticks keep running.
The GPU timer can lower or raise the internal render scale according to the phone's actual load. Fight controls support simultaneous
multitouch, cancellation-safe input release, persisted per-button placement/size, stick dead-zone, opacity and optional
haptics. In **OPTIONS > CONTROLS > EDIT TOUCH CONTROLS**, drag each button, adjust the selected control's size, and save
or cancel the layout. Android system Back closes this editor, backs out of menus, pauses a fight, and takes a deliberate
double press at the main menu to exit.

## App icon

The icon is original vector artwork in `tools/brand/`: `icon.svg`, and a simplified `icon-small.svg` for 16 to 40
pixels. To change it, edit those files and run:

```sh
npm run icons    # Python 3 with Pillow, and Microsoft Edge or Google Chrome
```

It renders the icon at 1024 pixels in a headless browser, scales it down with Lanczos filtering, and writes
`src-tauri/icons/*` (through `npx tauri icon`, plus an `icon.ico` with a separately rendered image for every size from
16 to 256 pixels), `public/favicon.png` and the web app icons.
