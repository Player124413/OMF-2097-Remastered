import { app } from './app';
import { audio } from './audio/audio';
import { initInput, setKeyState } from './controller/input';
import { startViewer } from './debug/viewer';
import { Engine } from './engine';
import { ANIM_IDLE, isArenaScene, PILOT_INFO, SceneId } from './game/constants';
import { GameState, hasScene } from './game/gameState';
import { setPilotColors } from './game/pilotColors';
import { loadSettings, saveSettings, settings } from './game/settings';
import { loadKeyboardLayout } from './game/scenes/mainmenu/keyNames';
import './game/scenes/index';
import { registerPlaceholders } from './game/scenes/placeholder';
import { getFile, preloadAll } from './resources/files';
import { GeneratedArtwork } from './gen/hdArtwork';
import { ModArtwork } from './mods/hdArt';
import { MOVE } from './gen/fighter/moveset';
import { arenaAvailable, arenaLook, modHarIds, pilotExists, pilotInfo, pilotNameOf } from './game/roster';
import { loadBundled, loadMods, testContent } from './mods/registry';
import { EXTRAS_MOD_ID, testNamesExtras } from './mods/extras';
import { installModFiles, ModsPage } from './mods/modsPage';
import { MOD_EXTENSION } from './mods/package';
import { loadStoredGameFiles, provideGameFiles } from './platform/gameData';
import { showImportScreen } from './platform/importScreen';
import { fonts, langGet, loadOriginalTexts, soundBank } from './resources/resources';
import { setLanguage, setOriginalTextsLoader, tr, trKey, trn } from './i18n/i18n';
import { madeGlyphs } from './game/gui/glyphs';
import { startBootTips } from './platform/bootTips';
import { FontSize, getFont, setTextAudit, type TextAuditHit } from './game/gui/text';
import { GLRenderer } from './video/gl/renderer';
import { drawList } from './video/draw';
import { blockBrowserMenu, framed, isAndroidApp, isDesktop, isFullscreen, isTauri, onAndroidBackPress, quitApp, setFullscreen, toggleFullscreen } from './platform/desktop';
import { onKey } from './controller/input';
import { HdAssets, hdAssets } from './video/hd/assets';
import { arenaGeometry } from './video/hd/geometry';
import { buildGlyphAtlas, loadTypeface, type GlyphAtlas } from './video/hd/typeface';
import TypefaceWorker from './video/hd/typefaceWorker.ts?worker';
import { vga } from './video/vga';
import { FxDirector } from './fx/director';
import { FxType, onFx } from './game/fx';
import { globalRandom } from './util/random';
import { HelpOverlay } from './game/gui/helpOverlay';
import { htmlHelpOpen } from './game/gui/helpHtml';
import { APP_VERSION, showVersionLabel } from './platform/versionLabel';
import { setCreditsButtonAction, showCreditsButton } from './platform/creditsButton';
import { firstRunSetup } from './platform/setupScreen';
import { drainPointer, initMouse, pushPointer } from './controller/mouse';
import { renderedFrames } from './game/gui/widgets';
import { startTraining } from './game/scenes/mainmenu/menuTraining';
import { seedQuickFight, setPlayerPilot, setupQuickFight } from './game/quickFight';
import { applyPadSettings } from './game/controls';
import { addTracks, audioFiles } from './audio/customMusic';
import { toast } from './platform/toast';
import { saveFile } from './platform/files';
import { ACT_ESC, ACT_PUNCH } from './game/constants';
import { ReplaysPage } from './game/replay/replaysPage';
import { RunResultsPage } from './game/modes/resultsPage';
import { RecordsPage } from './game/records/recordsPage';
import { LanguagePage } from './game/gui/languagePage';
import { suspendRecords } from './game/records/records';
import { MS_PER_OMF_TICK_SLOWEST } from './game/constants';
import { ReplaySession } from './game/replay/playback';
import { ClipExporter } from './platform/clipExport';
import { TouchControls } from './platform/touch';
import { WorkshopPage, type WorkshopHost } from './game/workshop/workshopPage';
import { buildWorkshopInBackground, ensureWorkshopRobot, harIdOf, isWorkshopHar, workshopDesign } from './game/workshop/registry';
import { hasFighter } from './resources/resources';
import { CustomTournamentsPage } from './game/tournament/customPage';
import { CreditsRun, startCredits } from './game/credits/creditsRun';
import { registerCustomTournaments } from './game/tournament/custom';
import { ModeRun } from './game/modes/run';
import { setupPlayerInput } from './game/scenes/mainmenu/menuMain';
import { MainMenuScene } from './game/scenes/mainmenu';
import { FightCamera } from './video/camera';
import { loadAnnouncer } from './audio/announcer';
import { CtrlType } from './game/constants';
import { MenuScene } from './video/stage/parallax';
import { LanPage } from './net/lanPage';
import { showNetStatus } from './net/statusBar';

const boot = document.getElementById('boot')!;
{
  const ver = boot.querySelector<HTMLElement>('.ver');
  if (ver) ver.textContent = `v${APP_VERSION}`;
}
/** The loading screen's stage (and its bar and percentage, 0..1). */
function bootStatus(text: string, progress?: number): void {
  const line = boot.querySelector<HTMLElement>('.text');
  if (line) line.textContent = text;
  else boot.textContent = text;
  if (progress === undefined) return;
  const p = Math.max(0, Math.min(1, progress));
  const fill = boot.querySelector<HTMLElement>('.fill');
  if (fill) fill.style.width = `${Math.round(p * 1000) / 10}%`;
  const pct = boot.querySelector<HTMLElement>('.pct');
  if (pct) pct.textContent = `${Math.round(p * 100)}%`;
}
/** The loading screen fades out (and is gone a moment later). */
function hideBoot(): void {
  boot.classList.add('is-done');
  window.setTimeout(() => {
    if (boot.classList.contains('is-done')) boot.style.display = 'none';
  }, 650);
}
const canvas = document.getElementById('screen') as HTMLCanvasElement;

// The graphics can be lost (a driver reset, a switch of graphics card, a phone putting the browser away): the picture
// would stay black. The game starts again once they are back (settings, saves and tournaments are kept as they go).
/** The game is starting again by itself (the page's leave prompt stays away). */
let restarting = false;
const restart = () => {
  restarting = true;
  location.reload();
};
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  toast(tr('The graphics were reset: the game starts again...'), 8000);
  window.setTimeout(restart, 3000);
});
canvas.addEventListener('webglcontextrestored', restart);

/** Hides the mouse pointer over the game after a moment without movement (the game is keyboard / pad driven). */
function autoHideCursor(): void {
  let timer = 0;
  const show = () => {
    canvas.style.cursor = '';
    clearTimeout(timer);
    timer = window.setTimeout(() => (canvas.style.cursor = 'none'), 2000);
  };
  window.addEventListener('mousemove', show);
  show();
}

function resize(): void {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  // On mobile, the native game's detail tops out at about 4x 320x200. Rendering a 3x-DPR 1440p surface on top of
  // that only burns battery and memory, so keep a generous 3 MP budget and let the HD renderer's GPU timer refine it.
  const touchDevice = isAndroidApp || (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches);
  const pixelBudget = touchDevice ? 3_000_000 : 8_000_000;
  const dpr = Math.min(
    window.devicePixelRatio || 1,
    touchDevice ? 2.25 : 3,
    Math.sqrt(pixelBudget / (width * height)),
    4096 / Math.max(width, height),
  );
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
}

/**
 * A window moved to a display of another pixel density keeps its size in CSS pixels, so no resize comes: the page is
 * told as if it had been resized (everything that sizes itself to the window listens to that).
 */
function watchPixelRatio(): void {
  matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener('change', () => {
    window.dispatchEvent(new Event('resize'));
    watchPixelRatio();
  }, { once: true });
}

/** What a graphics driver that refuses the remastered look's shaders gets told (see GLRenderer.hdError). */
const REMASTERED_UNAVAILABLE = trKey("The remastered look can't run on this computer's graphics driver: the game is shown in the classic look.");

/** Font family name of the remastered typeface. */
const TYPEFACE_FAMILY = 'OMF Remastered';

/** The main menu's parallax layers (tools/menu-pack). */
const MENU_LAYERS = 'hd/menu/';
/** Where the main menu scene starts its loop (seconds): the spotlight on the robot's chest. */
const STAGE_START = 0.3;

/** How long a fight waits at most for its remastered artwork (see onSceneChange). */
const ARTWORK_WAIT_MS = 4000;

async function main(): Promise<void> {
  resize();
  window.addEventListener('resize', resize);
  watchPixelRatio();
  autoHideCursor();
  blockBrowserMenu();
  // The language: the player's choice, else their system's (the loading screen and the import screen speak it too);
  // ?lang=<code> tries one out without saving it.
  loadSettings();
  // (the key names follow the keyboard's layout; it may change while the game is away)
  void loadKeyboardLayout();
  window.addEventListener('focus', () => void loadKeyboardLayout());
  await setLanguage(new URLSearchParams(location.search).get('lang') ?? settings().language).catch(() => undefined);
  startBootTips(boot);
  // The original game data: from the server (npm run extract, the desktop app), else imported earlier in this
  // browser, else the player provides it now (web version).
  const fromServer = await preloadAll((loaded, total) => {
    bootStatus(tr('LOADING GAME DATA'), (loaded / total) * 0.8);
  });
  if (!fromServer && !(await loadStoredGameFiles())) {
    boot.style.display = 'none';
    provideGameFiles(await showImportScreen());
    boot.style.display = '';
    bootStatus(tr('LOADING GAME DATA'), 0.8);
  }
  // The mods that are on: their robots, arenas and pilots join the game (src/mods): the ones that come with the game
  // (the remaster's new robots and arenas) and the installed ones; ?modtest: OMF Studio's test fight, with the project
  // it is testing (and the new robots and arenas when it names them).
  bootStatus(tr('LOADING THE MODS'), 0.82);
  const bootParams = new URLSearchParams(location.search);
  const modTestError = await loadMods(bootParams.has('modtest'), testNamesExtras(bootParams) ? [EXTRAS_MOD_ID] : []);
  loadSettings();
  // (the original game's texts in that language: its own language files, or their translations)
  setOriginalTextsLoader(loadOriginalTexts);
  initInput();
  bootStatus(tr('STARTING THE RENDERER'), 0.86);
  const renderer = new GLRenderer(canvas);
  // HD artwork (optional: only if the imported bundles are installed).
  await hdAssets.init(renderer.gl, 'hd/');
  // The arenas' geometry maps (parallax and lighting by their shape; see video/hd/geometry.ts).
  await arenaGeometry.init(renderer.gl, 'hd/');
  // Integrated / mobile GPUs load the artwork at half resolution (a quarter of the memory).
  if (renderer.isLowEndGpu) hdAssets.textureScale = 0.5;
  hdAssets.enabled = settings().video.hdArtwork;
  // The remaster's robots get their HD artwork rendered on the GPU (between frames, as scenes need it).
  const genArt = new GeneratedArtwork(renderer.gl, hdAssets);
  // (the mods' HD pictures: in the remastered look, with HD artwork on)
  const modArt = new ModArtwork(hdAssets, () => renderer.options.mode === 'remastered' && hdAssets.enabled);
  const params = new URLSearchParams(location.search);
  // Development: ?textaudit collects the texts that do not fit their boxes (window.__omfTextAudit, by kind, box, text).
  if (import.meta.env.DEV && params.has('textaudit')) {
    const hits = new Map<string, TextAuditHit>();
    (window as unknown as { __omfTextAudit: unknown }).__omfTextAudit = hits;
    setTextAudit((h) => hits.set(`${h.kind}|${h.box.join('x')}|${h.text}`, h));
  }
  if (params.has('viewer')) {
    startViewer(renderer);
    return;
  }
  // Development: render the generated arenas' HD backgrounds (see gen/dev/arenaHd.ts).
  if (import.meta.env.DEV && params.has('genarenahd')) {
    const { renderArenaHd } = await import('./gen/dev/arenaHd');
    await renderArenaHd(renderer.gl, (s) => bootStatus(s), params.get('genarenahd') || undefined);
    return;
  }
  if (!params.has('noaudio')) {
    await audio.init(soundBank(), (name) => getFile(name));
    loadAnnouncer();
  }
  const s = settings();
  audio.setSoundVolume(s.sound.soundVol / 10);
  audio.setMusicVolume(s.sound.musicVol / 10);
  // Browsers start the sound with the player's first press (in the capture phase: screens that keep their keys to
  // themselves, like the first start's setup, stop them on the way; a touch counts as it ends).
  const resumeAudio = () => audio.resume();
  for (const type of ['keydown', 'pointerdown', 'pointerup', 'touchend', 'click']) window.addEventListener(type, resumeAudio, true);

  registerPlaceholders();

  let startScene = hasScene(SceneId.INTRO) ? SceneId.INTRO : SceneId.MENU;
  const sceneParam = params.get('scene');
  if (sceneParam) {
    const id = (SceneId as unknown as Record<string, number>)[sceneParam.toUpperCase()];
    if (id !== undefined) startScene = id;
  }
  const gs = new GameState(SceneId.MENU);
  // OMF Studio's test (?modtest&t=fight|watch|training|select|vs|ending&h1&h2&arena&p1&p2): the project's content by
  // folder name.
  if (params.has('modtest') && params.has('h1')) {
    const h1 = testContent('robot', params.get('h1')) ?? 0, h2 = testContent('robot', params.get('h2')) ?? 5;
    const arena = testContent('arena', params.get('arena')) ?? 0, p1 = testContent('pilot', params.get('p1')) ?? 0;
    const mode = params.get('t');
    if (mode === 'training') {
      const t = settings().training;
      Object.assign(t, { har: h1, opponent: h2, arena, pilot: p1, dummy: 0 });
      params.set('training', '');
    } else if (mode === 'select' || mode === 'vs' || mode === 'ending') {
      // The one-player game, as its menu item starts it: from the pilot select screen, from the VS screen (the pilot
      // against an original one, then the fight in the arena), or its ending.
      setupPlayerInput(gs, 0);
      for (let i = 0; i < 2; i++) gs.getPlayer(i).score.setDifficulty(settings().gameplay.difficulty);
      gs.setupAi(1);
      gs.matchSettingsReset();
      if (mode === 'select') {
        gs.getPlayer(0).pilot.name = '';
        gs.getPlayer(0).pilot.pilotId = p1;
        startScene = SceneId.MELEE;
      } else {
        setPlayerPilot(gs, 0, p1, h1);
        setPlayerPilot(gs, 1, Math.min(10, testContent('pilot', params.get('p2')) ?? 3), h2);
        gs.arena = arena;
        startScene = mode === 'vs' ? SceneId.VS : SceneId.END1;
      }
    } else {
      params.set('fight', String(arena));
      params.set('h1', String(h1));
      params.set('h2', String(h2));
      params.set('p1', String(p1));
      // (the computer's pilot as chosen, any but the player's: then another, as before)
      const p2 = testContent('pilot', params.get('p2'));
      params.set('p2', String(p2 !== null && p2 !== p1 ? p2 : p1 === 3 ? 4 : 3));
      params.set('ai', '');
      if (params.get('t') === 'watch') params.set('watch', '');
    }
  }
  if (params.has('fight')) {
    startScene = setupQuickFight(gs, params);
    gs.arena = startScene - SceneId.ARENA0;
    // (&seed: the same fight every time, the computer on both sides; see quickFight.ts)
    if (import.meta.env.DEV && params.has('seed')) seedQuickFight(gs, params);
    else if (params.has('ai')) gs.setupAi(1);
    // (Studio's test: the computer on both sides)
    if (params.has('watch')) gs.setupAi(0);
  }
  // ?training: straight into training mode with the last used setup.
  if (params.has('training')) {
    startScene = SceneId.MENU;
    startTraining(gs);
  }
  // (OMF Studio's tests show the arena's hazards whatever the player's own setting, and Kreissack at any difficulty)
  if (params.has('modtest')) {
    gs.matchSettings.hazards = true;
    gs.modTest = true;
    suspendRecords(true);
  }
  if (startScene !== SceneId.MENU) gs.swapScene(startScene);
  // On scene changes: evict stale surfaces from the atlas, and start loading the HD artwork the scene needs (the VS
  // screen also loads both robots and the fight graphics, so fights start with their artwork ready).
  // The artwork a scene shows itself...
  const sceneArtwork = () => {
    const fight = gs.sc.isArena() || gs.thisId === SceneId.VS;
    const hars = fight ? [0, 1].map((i) => gs.getPlayer(i).pilot?.harId ?? -1).filter((h) => h >= 0) : [];
    return HdAssets.bundlesFor(gs.sc.bk?.file ?? null, hars, fight);
  };
  // ...and what it loads ahead: the arena is picked on the VS screen (or at random right after it), have them all ready.
  const artworkFor = () => {
    const names = sceneArtwork();
    if (gs.thisId === SceneId.VS) for (let a = 0; a < 5; a++) names.push(`scene-ARENA${a}`);
    return names;
  };
  // The main menu's parallax scene (loaded when the menu is first shown in remastered mode).
  const menuScene = new MenuScene();
  const menuLoading = () => renderer.options.mode === 'remastered' && gs.thisId === SceneId.MENU && menuScene.loading;
  // The generated robots' artwork and the mods' HD pictures: all of the fighting robots, the arena, the select
  // screen's cells and idle animations (the mod pilots' portraits come with the screens that show them).
  const wantGenerated = () => {
    const fight = gs.sc.isArena() || gs.thisId === SceneId.VS;
    const hars = [0, 1].map((i) => gs.getPlayer(i).pilot?.harId ?? -1);
    if (fight) {
      genArt.want(hars);
      modArt.want(hars);
    }
    if (gs.sc.isArena() && gs.sc.bk) {
      modArt.wantArena(gs.thisId - SceneId.ARENA0, gs.sc.bk);
    } else if (gs.thisId === SceneId.MELEE) {
      genArt.want(modHarIds(), [MOVE.PORTRAIT_CELL, ANIM_IDLE]);
      modArt.want(modHarIds(), [MOVE.PORTRAIT_CELL, ANIM_IDLE]);
    } else if (gs.thisId === SceneId.MECHLAB) {
      modArt.wantMech(modHarIds());
    }
  };
  gs.onSceneChange = () => {
    // (a network game goes on under the help: the new screen's palette is the one the help gives back when it closes)
    help.sceneChanged();
    renderer.resetAtlas();
    hdAssets.preload(artworkFor());
    modArt.sceneChanged();
    wantGenerated();
    // A scene whose artwork is not there yet (a fight entered without the VS screen, which loads it beforehand, the
    // first visit of a screen): the game waits on the scene's black first frame until it is (a few seconds at most),
    // so nothing starts blurry and sharpens a moment later.
    if (renderer.options.mode === 'remastered' && gs.thisId === SceneId.MENU) menuScene.load(MENU_LAYERS);
    if (renderer.options.mode === 'remastered' && (hdAssets.loading(sceneArtwork()) || menuLoading() || modArt.loading)) {
      engine.waiting = true;
      artworkWaitEnd = performance.now() + ARTWORK_WAIT_MS;
    }
    audio.setRoom(gs.sc.isArena() ? arenaLook(gs.thisId - SceneId.ARENA0) : -1);
    // Back from trying a workshop robot: the workshop opens again.
    if (workshopAfter && gs.thisId === SceneId.MENU) {
      workshopAfter = false;
      onMenu = () => app.showWorkshop();
    }
  };
  let workshopAfter = false;
  let artworkWaitEnd = 0;
  // Pages that open once the main menu is back and has faded in (the replay list after watching a replay, the results
  // of an arcade, survival or time attack run).
  let onMenu: (() => void) | null = null;
  audio.setRoom(gs.sc.isArena() ? arenaLook(gs.thisId - SceneId.ARENA0) : -1);
  wantGenerated();
  // The first screen waits (briefly) for its artwork so it does not pop in.
  bootStatus(tr('LOADING ARTWORK'), 0.9);
  if (renderer.options.mode === 'remastered') menuScene.load(MENU_LAYERS);
  await hdAssets.whenReady(artworkFor(), 4000);
  // (a mod's pictures too: Studio's tests start in a fight)
  for (const end = performance.now() + 4000; modArt.loading && performance.now() < end;) await new Promise((r) => setTimeout(r, 30));
  if (gs.thisId === SceneId.MENU) await menuScene.whenReady(4000);
  bootStatus(tr('READY'), 1);

  // Remastered effects follow the game clock (dynamic ticks), so they pause and slow down with the game.
  const fxDirector = new FxDirector();
  const camera = new FightCamera();
  // F1: the original help pages over the paused game (a network game goes on: the other player is still playing).
  const help = new HelpOverlay((paused) => (engine.paused = paused && !gs.net));
  // Touch controls: in fights (not replays, demos or the pause menu) and on the robot select screen.
  const touch = new TouchControls();
  app.editTouchControls = () => touch.openEditor();
  const touchWanted = () => {
    if (help.isOpen()) return false;
    if (gs.thisId === SceneId.MELEE) return true;
    const menuOpen = (gs.sc as { menuVisible?: boolean }).menuVisible;
    return gs.sc.isArena() && !gs.replay && !gs.isDemoplay() && !menuOpen && gs.getPlayer(0).ctrl.type !== CtrlType.AI;
  };
  // Android's system Back behaves like Escape in fights/menus, closes the touch editor first, and double-Back exits
  // from the main menu instead of silently navigating away from the WebView.
  let lastMenuBackAt = 0;
  onAndroidBackPress(() => {
    if (touch.isEditing()) {
      touch.cancelEditor();
      return;
    }
    const pulseEscape = () => {
      setKeyState('Escape', true);
      window.setTimeout(() => setKeyState('Escape', false), 130);
    };
    if (help.isOpen()) {
      pulseEscape();
      help.key('Escape');
      return;
    }
    if (gs.thisId === SceneId.MENU && gs.sc instanceof MainMenuScene && gs.sc.atMainPage()) {
      const now = performance.now();
      if (now - lastMenuBackAt < 1700) {
        lastMenuBackAt = 0;
        app.quit();
      } else {
        lastMenuBackAt = now;
        toast(tr('Press Back again to quit.'), 1500);
      }
      return;
    }
    pulseEscape();
  });
  // Mouse: menus take hovers and clicks first (topmost frame first), then the scene; other clicks mean "continue"
  // (left) or "back" (right) on screens without menus. Fights ignore the mouse (except their pause menu).
  initMouse(canvas, (px, py) => renderer.canvasToNative(px, py));
  const dispatchPointer = () => {
    for (const e of drainPointer()) {
      if (help.isOpen()) {
        help.pointer(e.kind, e.x, e.y);
        continue;
      }
      let used = false;
      for (let i = renderedFrames.length - 1; i >= 0 && !used; i--) used = renderedFrames[i].pointer(e.x, e.y, e.kind);
      if (!used) used = gs.sc.pointer(e.x, e.y, e.kind);
      if (used || (e.kind !== 'click' && e.kind !== 'rclick')) continue;
      if (gs.sc.isArena() && !(gs.sc as { menuVisible?: boolean }).menuVisible) continue;
      // (not while the screen changes: the click would press ENTER on the next one)
      if (!gs.sc.takesInput()) continue;
      if (e.kind === 'rclick') gs.menuCtrl.queued = ACT_ESC;
      else if (renderedFrames.length === 0) gs.menuCtrl.queued = ACT_PUNCH;
    }
    renderedFrames.length = 0;
  };
  // The main menu's parallax scene in remastered mode (video/stage/parallax.ts): its clock starts when the menu
  // opens, and its camera leans toward the mouse.
  let stageSince = -1;
  /** Development: a fixed time for the menu scene (seconds), or null. */
  const stageDebug = { time: null as number | null };
  let lean: [number, number] | null = null;
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    lean = [((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1];
  });
  canvas.addEventListener('pointerleave', () => {
    lean = [0, 0];
  });
  // It stands for MAIN.BK's picture wherever the game shows it (the main menu, the scoreboard, the help pages); its loop
  // starts over each time the main menu opens. Screens that darken the picture's colors (the scoreboard) darken it too.
  let stageScene = -1;
  let pictureColors: { bk: unknown; used: number[] } | null = null;
  const pictureBrightness = () => {
    const bk = gs.sc.bk;
    if (!bk) return 1;
    if (pictureColors?.bk !== bk) {
      const seen = new Set<number>(bk.background.data);
      pictureColors = { bk, used: [...seen].filter((i) => i > 0) };
    }
    const ref = bk.palettes[0].colors, cur = vga.undarkened.colors;
    let a = 0, b = 0;
    for (const i of pictureColors.used) {
      a += cur[i * 3] + cur[i * 3 + 1] + cur[i * 3 + 2];
      b += ref[i * 3] + ref[i * 3 + 1] + ref[i * 3 + 2];
    }
    return b > 0 ? Math.min(1, a / b) : 1;
  };
  const menuBackdrop = () => {
    if (renderer.options.mode !== 'remastered') return null;
    if (gs.thisId === SceneId.MENU) menuScene.load(MENU_LAYERS);
    if (!menuScene.ready) return null;
    const now = performance.now();
    if (stageSince < 0 || (gs.thisId === SceneId.MENU && stageScene !== SceneId.MENU)) stageSince = now;
    stageScene = gs.thisId;
    menuScene.update(stageDebug.time ?? STAGE_START + (now - stageSince) / 1000, lean);
    menuScene.brightness = pictureBrightness();
    return menuScene;
  };
  const engine = new Engine(gs, {
    render: () => {
      if (onMenu && gs.thisId === SceneId.MENU && gs.nextId === SceneId.MENU && gs.thisWaitTicks === 0 && !help.isOpen()) {
        const open = onMenu;
        onMenu = null;
        open();
      }
      if (engine.waiting && ((!hdAssets.loading(sceneArtwork()) && !menuLoading() && !modArt.loading) || performance.now() > artworkWaitEnd)) {
        engine.waiting = false;
      }
      dispatchPointer();
      touch.update(settings().keys.touch, touchWanted());
      help.update();
      help.render();
      // The product's name and version in the main menu's corner (not over the help, the pages or the credits), and on
      // its main page the button that plays the credits.
      const menuCorner = gs.thisId === SceneId.MENU && gs.nextId === SceneId.MENU && !engine.waiting && !help.isOpen() &&
        !htmlHelpOpen() && !gs.credits;
      showVersionLabel(menuCorner);
      // (a network game: what to do on its screens, or whom it waits for; above a screen's own things at its bottom)
      showNetStatus(gs, (y) => {
        const vp = renderer.viewport();
        const r = canvas.getBoundingClientRect();
        return r.top + ((vp.y + y * vp.sy) / canvas.height) * r.height;
      });
      showCreditsButton(menuCorner && gs.sc instanceof MainMenuScene && gs.sc.atMainPage());
      fxDirector.update(gs, engine.ticks + engine.alpha, renderer.options.mode === 'remastered');
      renderer.fx = fxDirector.frame;
      renderer.backdrop = menuBackdrop();
      renderer.camera = camera.update(gs, performance.now(), settings().gameplay.fightCamera && renderer.options.mode === 'remastered');
      if (renderer.options.mode === 'remastered' && hdAssets.enabled) genArt.pump(4);
      // (a page or the credits' titles covering the screen: nothing of the game shows)
      if (!help.coversScreen() && !(gs.credits instanceof CreditsRun && gs.credits.coversScreen())) {
        renderer.render();
        // (the credits keep a picture of each fight's winner, taken while the frame is there)
        if (gs.credits instanceof CreditsRun) gs.credits.rendered(canvas);
      }
      clips.frame();
    },
  });
  // Rendering the same game at 90/120 Hz wastes mobile GPU time; fixed simulation/input ticks keep running. Tell the
  // no-GPU-timer resolution heuristic this is intentional so a 90 Hz display's 22/11 ms cadence isn't a false overload.
  if (isAndroidApp) {
    engine.maxRenderFps = 60;
    renderer.frameRateCap = 60;
  }
  // Impact bass: a low thump under heavy hits, slams and knockouts (the original sounds stay as they are).
  onFx((e) => {
    const p = Math.max(0, Math.min(60, e.power));
    const pan = ((e.x - 160) / 160) * 40;
    switch (e.type) {
      case FxType.HIT:
      case FxType.PROJECTILE_HIT:
      case FxType.HAZARD_HIT:
        if (p >= 6) audio.thump((p - 4) / 36, 0.1 + p / 120, pan);
        break;
      case FxType.KO:
        audio.thump(1, 1, pan);
        break;
      case FxType.WALL_SLAM:
        audio.thump(0.85, 0.75, pan);
        break;
      case FxType.LANDING:
        if (p >= 15) audio.thump((p - 10) / 40, 0.4, pan);
        break;
    }
  });
  // Gamepad rumble on impacts (the player hit feels it most, the attacker a little).
  onFx((e) => {
    if (!settings().keys.rumble || e.playerId < 0) return;
    const victim = gs.getPlayer(e.playerId)?.ctrl;
    const attacker = gs.getPlayer(e.playerId ? 0 : 1)?.ctrl;
    const p = Math.max(0, Math.min(60, e.power));
    switch (e.type) {
      case FxType.HIT:
      case FxType.PROJECTILE_HIT:
      case FxType.HAZARD_HIT:
        victim?.rumble(Math.min(1, 0.3 + p / 45), 70 + p * 4);
        attacker?.rumble(Math.min(0.5, 0.1 + p / 90), 60);
        break;
      case FxType.BLOCK:
        victim?.rumble(0.18, 60);
        break;
      case FxType.KO:
        victim?.rumble(1, 450);
        attacker?.rumble(0.6, 300);
        break;
      case FxType.WALL_SLAM:
        victim?.rumble(0.85, 260);
        break;
      case FxType.LANDING:
        if (p >= 15) victim?.rumble(Math.min(0.8, 0.25 + p / 80), 140);
        break;
    }
  });

  // The remastered typeface (FONT: REMASTERED): loaded and its glyphs built in a worker the first time it is wanted
  // (here if the worker cannot draw text); text keeps the smooth letters until then.
  let typefaceWanted = false;
  const wantTypeface = () => {
    if (typefaceWanted) return;
    typefaceWanted = true;
    const url = new URL('fonts/Orbitron.ttf', location.href).href;
    // (with the letters the fonts lack, made for the game's other Latin languages: Ã, Ê, Ø...)
    const extras = { small: madeGlyphs(getFont(FontSize.SMALL)), big: madeGlyphs(getFont(FontSize.BIG)) };
    const here = () => void loadTypeface(url, TYPEFACE_FAMILY).then((ok) => {
      const atlas = ok ? buildGlyphAtlas(TYPEFACE_FAMILY, fonts(), extras) : null;
      if (atlas) renderer.setGlyphAtlas(atlas);
    });
    try {
      const worker = new TypefaceWorker();
      worker.onmessage = (e: MessageEvent<GlyphAtlas | null>) => {
        worker.terminate();
        if (e.data) renderer.setGlyphAtlas(e.data);
        else here();
      };
      worker.onerror = () => {
        worker.terminate();
        here();
      };
      worker.postMessage({ url, family: TYPEFACE_FAMILY, fonts: fonts(), extras });
    } catch {
      here();
    }
  };
  // Apply video/audio settings to the renderer and audio system.
  const applySettings = () => {
    const v = settings().video;
    // (a graphics driver that refused the remastered look's shaders: the classic look, whatever the setting says)
    renderer.options.mode = renderer.hdError ? 'classic' : v.graphics;
    renderer.options.scaleMode = v.classicFilter;
    renderer.options.classicWidescreen = v.classicWidescreen;
    renderer.options.bloom = v.bloom;
    renderer.options.hdResolution = v.hdResolution;
    renderer.textStyle = v.hdFont === 'pixel' ? 1 : v.hdFont === 'type' ? 2 : 0;
    if (v.hdFont === 'type') wantTypeface();
    renderer.options.hdHud = v.hdHud;
    hdAssets.enabled = v.hdArtwork;
    engine.interpolate = v.motionSmoothing && renderer.options.mode === 'remastered';
    audio.setQuality(settings().sound.enhancedMusic ? 'enhanced' : 'classic');
    applyPadSettings();
    audio.setAcoustics(settings().sound.acoustics);
    audio.setMyMusicMode(settings().sound.myMusic);
    audio.setImpactBass(settings().sound.impactBass);
    // (switched to the remastered look, or HD artwork on, in the middle of a scene: its pictures now, not at the next)
    if (renderer.options.mode === 'remastered' && v.hdArtwork) wantGenerated();
  };
  applySettings();
  app.setGraphicsMode = (mode) => {
    settings().video.graphics = mode;
    saveSettings();
    applySettings();
    if (mode === 'remastered' && renderer.hdError) toast(tr(REMASTERED_UNAVAILABLE), 6000);
  };
  app.getGraphicsMode = () => settings().video.graphics;
  app.settingsChanged = () => {
    saveSettings();
    applySettings();
  };
  // Keep the FULLSCREEN option in sync with the real state (hotkeys, Esc leaving browser fullscreen).
  const syncFullscreenSetting = async () => {
    // (in OMF Studio's test the window is Studio's: the game's own setting stays as it is)
    if (framed) return;
    const fs = await isFullscreen();
    if (settings().video.fullscreen !== fs) {
      settings().video.fullscreen = fs;
      saveSettings();
    }
  };
  app.toggleFullscreen = () => void toggleFullscreen().then(syncFullscreenSetting);
  document.addEventListener('fullscreenchange', () => void syncFullscreenSetting());
  // Browsers only allow fullscreen from a user gesture; a native shell can restore it at startup.
  if (isTauri && settings().video.fullscreen) void setFullscreen(true);
  else if (!isTauri) void syncFullscreenSetting();
  app.quit = () => {
    if (isTauri && !framed) void quitApp();
    else gs.setNext(SceneId.MENU);
  };
  gs.onQuit = () => app.quit();
  app.showControls = () => help.open('controls');
  // Replays: the list (EXTRAS > REPLAYS) over the menu; watching a fight, and saving clips of it.
  app.showReplays = () => help.open(new ReplaysPage((record) => {
    // A fight with a workshop robot needs it built (and still there, as it was designed then).
    for (const [i, p] of record.meta.players.entries()) {
      if (isWorkshopHar(p.harId)) ensureWorkshopRobot(p.harId - harIdOf(0));
      if (!hasFighter(p.harId)) {
        toast(isWorkshopHar(p.harId) ? tr('This fight was played with a robot that is not in the workshop any more.')
          : tr('This fight was played with a robot of a mod that is not on (EXTRAS > MODS).'), 4000);
        return false;
      }
      const design = record.meta.designs?.[i];
      if (design && design !== workshopDesign(p.harId)) {
        toast(tr('This fight was played with an earlier design of a workshop robot: it would not play out the same.'), 5000);
        return false;
      }
    }
    if (!arenaAvailable(record.meta.arena)) {
      toast(tr('This fight was played in an arena of a mod that is not on (EXTRAS > MODS).'), 4000);
      return false;
    }
    new ReplaySession(gs, record, () => {
      clips.cancel();
      onMenu = () => app.showReplays();
      gs.menuReturn = 'extras';
      gs.setNext(SceneId.MENU);
    }).start();
    return true;
  }, () => gs.speed));
  app.showRunResults = (result) => (onMenu = () => help.open(new RunResultsPage(result)));
  // The robot workshop: trying a robot in training or in a fight against the computer.
  const workshopHost: WorkshopHost = {
    train(slot, spec) {
      settings().training.har = harIdOf(slot);
      startTraining(gs);
      const c = spec.colors;
      setPilotColors(gs.getPlayer(0).pilot, c[0], c[1], c[2]);
      gs.menuReturn = 'extras';
      workshopAfter = true;
    },
    fight(slot, spec) {
      setupPlayerInput(gs, 0);
      gs.setupAi(1);
      gs.matchSettingsReset();
      const p1 = gs.getPlayer(0);
      const pilotId = pilotExists(settings().training.pilot) ? settings().training.pilot : 0;
      const info = pilotInfo(pilotId);
      p1.pilot.pilotId = pilotId;
      p1.pilot.harId = harIdOf(slot);
      p1.pilot.power = info.power;
      p1.pilot.agility = info.agility;
      p1.pilot.endurance = info.endurance;
      p1.pilot.name = pilotNameOf(p1.pilot.pilotId);
      p1.pilot.photo = null;
      setPilotColors(p1.pilot, spec.colors[0], spec.colors[1], spec.colors[2]);
      gs.modeRun = new ModeRun('exhibition');
      gs.modeRun.setupOpponent(gs);
      gs.setNext(SceneId.VS);
    },
  };
  app.showWorkshop = () => {
    const open = () => help.open(new WorkshopPage(workshopHost));
    if (gs.thisId === SceneId.MENU && gs.nextId === SceneId.MENU) open();
    else onMenu = open;
  };
  buildWorkshopInBackground();
  app.showTournaments = () => help.open(new CustomTournamentsPage());
  app.showCredits = () => startCredits(gs, { links: !isDesktop });
  setCreditsButtonAction(() => startCredits(gs, { links: !isDesktop, from: 'main' }));
  app.showMods = () => help.open(new ModsPage());
  // MULTIPLAYER > LAN: hosting and joining network games (net/lanPage.ts).
  app.showLan = () => help.open(new LanPage(gs));
  // A network game goes on while the window is hidden (the browser stops drawing it, and the other player would wait),
  // and the other player hears when this one closes the game. So does what leads to one: the LAN page starts the match
  // it found, and closes (help.update: frames are drawn no more).
  window.setInterval(() => {
    if (!document.hidden) return;
    help.update();
    if (gs.net) engine.idle(performance.now());
  }, 15);
  window.addEventListener('pagehide', () => gs.net?.leave());
  registerCustomTournaments();
  app.showLanguage = () => help.open(new LanguagePage());
  app.showRecords = () => help.open(new RecordsPage(() => Math.trunc(8 + MS_PER_OMF_TICK_SLOWEST - ((settings().gameplay.speed + 5) / 15) * MS_PER_OMF_TICK_SLOWEST)));
  const clips = new ClipExporter({
    canvas,
    viewport: () => renderer.viewport(),
    audioStream: () => audio.captureStream(),
    releaseAudio: () => audio.releaseCapture(),
  });
  app.exportReplay = (kind) => {
    if (gs.replay) clips.start(gs.replay, kind);
  };
  app.cancelExport = () => clips.cancel();
  // Screenshots (PRINT SCREEN; F12 in the desktop app): the frame at the display's resolution, saved as a PNG where
  // replays and clips go.
  const screenshot = () => {
    if (help.coversScreen()) return;
    engine.frame(performance.now());
    canvas.toBlob((blob) => {
      if (!blob) return;
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      const name = `OMF 2097 ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.png`;
      saveFile(name, blob, 'image/png')
        .then((where) => toast(where === name ? tr('Screenshot saved') : tr('Screenshot saved: {where}', { where }), 3500))
        .catch(() => toast(tr('The screenshot could not be saved.'), 3500));
    }, 'image/png');
  };
  // (Windows gives PRINT SCREEN to the page only as a key release)
  window.addEventListener('keyup', (e) => {
    if (e.code === 'PrintScreen') screenshot();
  });
  // Global hotkeys: F2 swaps classic/remastered graphics, F11 / Alt+Enter (on a Mac also Ctrl+Cmd+F) toggle fullscreen.
  const mac = /Mac/.test(navigator.platform);
  onKey((code, e) => {
    if (code === 'F12' && isDesktop) {
      if (!e.repeat) screenshot();
      return;
    }
    if (code === 'F1' && !help.isOpen()) {
      // (not over the credits: their pages cover the game, and the fights would stop off their beat)
      if (!e.repeat && !gs.credits) help.open();
      return;
    }
    if (help.isOpen()) {
      if (!e.repeat) help.key(code, e);
      return;
    }
    if (code === 'F2') {
      if (!e.repeat) app.setGraphicsMode(settings().video.graphics === 'classic' ? 'remastered' : 'classic');
      return;
    }
    if (code === 'F3') {
      if (!e.repeat) audio.nextSong();
      return;
    }
    if (code === 'F11' || ((code === 'Enter' || code === 'NumpadEnter') && e.altKey) || (mac && code === 'KeyF' && e.metaKey && e.ctrlKey)) {
      if (!e.repeat) app.toggleFullscreen();
      return;
    }
    // Raw key events for scenes that want them (text entry, key capture, help pages).
    gs.sc.keyEvent(code, e);
  });

  // The player's own music: songs dropped onto the window go to the library; a notice names each song as it starts.
  audio.onSong = (name) => toast(`\u266A  ${name}`);
  audio.onMyMusicFailed = () => toast(tr("Your songs could not be played here: the game's own music plays instead."), 6000);
  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer?.files ?? []);
    // (whatever was dropped, the browser must not open it in place of the game)
    if (files.length) e.preventDefault();
    // Mod files are installed (they play from the next start).
    const mods = files.filter((f) => f.name.toLowerCase().endsWith(MOD_EXTENSION));
    if (mods.length) {
      void installModFiles(mods).then(({ installed, errors }) => {
        if (errors.length) toast(errors[0], 6000);
        if (installed.length) {
          toast(trn(installed.length, '{mods} installed: it plays from the next start (EXTRAS > MODS).', '{mods} installed: they play from the next start (EXTRAS > MODS).', { mods: installed.join(', ') }), 6000);
        }
      });
      return;
    }
    if (audioFiles(files).length === 0) {
      if (files.length) toast(tr('Drop songs to add them to your music, or {MOD_EXTENSION} files to install mods.', { MOD_EXTENSION }), 5000);
      return;
    }
    void addTracks(files).then(async (n) => {
      await audio.reloadMyMusic();
      toast(trn(n, '{n} song added to your music ({total} in total). OPTIONS > SOUND > MY MUSIC chooses where they play.',
        '{n} songs added to your music ({total} in total). OPTIONS > SOUND > MY MUSIC chooses where they play.', { total: audio.myMusicCount }), 5000);
    }).catch(() => toast(tr('The songs could not be saved in this browser.')));
  });

  // The browser version: closing the tab in the middle of a fight asks first (player 2's Ctrl + W is the browser's
  // close tab, which no page can stop; demo fights, replays, credits and Studio tests may go).
  if (!isTauri && !params.has('nopause')) {
    window.addEventListener('beforeunload', (e) => {
      if (!restarting && isArenaScene(gs.thisId) && !gs.isDemoplay() && !gs.replay && !gs.credits && !gs.modTest) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  // Switching to another window or tab pauses a fight (?nopause keeps it running, e.g. for recordings).
  if (!params.has('nopause')) {
    window.addEventListener('blur', () => gs.sc.focusLost());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) gs.sc.focusLost();
    });
  }

  // The first start: the setup over the finished loading screen (not for the development pages and recordings, which
  // open with parameters).
  if (!settings().setupDone && !['scene', 'fight', 'training', 'credits', 'nosetup'].some((p) => params.has(p))) {
    await firstRunSetup(boot);
    // (the new robots and arenas turned on there play right away)
    await loadBundled(EXTRAS_MOD_ID);
  }
  hideBoot();
  engine.start();
  if (renderer.hdError) toast(tr(REMASTERED_UNAVAILABLE), 8000);
  if (modTestError) toast(tr('The mod could not be tested: {modTestError}', { modTestError }), 8000);
  // Development: ?credits starts the remaster's credits (=n: at the n-th fight; past the last: the end titles).
  if (import.meta.env.DEV && params.has('credits')) startCredits(gs, { links: !isDesktop, start: Number(params.get('credits')) || 0 });

  // Debug hooks for automated testing (also usable from the dev console).
  (window as unknown as { __omf: unknown }).__omf = {
    gs,
    engine,
    /** The host hooks (show the replay list, records...). */
    app,
    renderer,
    /** The live menu scene's clock override (set `time` to freeze it at a moment). */
    stage: stageDebug,
    /** The app's draw list (dynamic imports from the console may get a different module instance after HMR). */
    drawList,
    vga,
    fx: fxDirector,
    audio,
    hdAssets,
    /** The arenas' geometry maps. */
    arenaGeometry,
    genArt,
    /** The mods' HD pictures. */
    modArt,
    /** Advances the simulation by `ms` of game time (in small chunks, so long steps are not capped). */
    step(ms: number) {
      for (let t = 0; t < ms; t += 20) engine.advance(Math.min(20, ms - t));
    },
    key: setKeyState,
    /** Mouse input in native coordinates, e.g. pointer('click', 240, 40). */
    pointer: pushPointer,
    /** The reference's global RNG (seed it for reproducible recordings) and the effect event feed. */
    random: globalRandom,
    onFx,
    frame() {
      engine.frame(performance.now());
    },
    /**
     * Renders one frame at the given size and uploads it as a PNG to the dev server.
     * Optional crop [x, y, w, h] (in rendered pixels) to inspect details.
     */
    async capture(name: string, w = 960, h = 600, crop?: [number, number, number, number]) {
      const ow = canvas.width, oh = canvas.height;
      canvas.width = w;
      canvas.height = h;
      drawList.begin();
      drawList.interpAlpha = engine.interpolate ? engine.alpha : -1;
      gs.render();
      engine.renderer.render(gs, engine.alpha);
      let url: string;
      if (crop) {
        const c2 = document.createElement('canvas');
        c2.width = crop[2];
        c2.height = crop[3];
        c2.getContext('2d')!.drawImage(canvas, crop[0], crop[1], crop[2], crop[3], 0, 0, crop[2], crop[3]);
        url = c2.toDataURL('image/png');
      } else {
        url = canvas.toDataURL('image/png');
      }
      canvas.width = ow;
      canvas.height = oh;
      const blob = await (await fetch(url)).blob();
      const res = await fetch(`/__debug/capture?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
      return res.json();
    },
  };
}

// Web version: work offline and be installable (not inside either native shell or the dev server).
if (import.meta.env.PROD && !isTauri && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  // (the list of what the page loads: the first visit hands it to the worker, see below)
  performance.setResourceTimingBufferSize(2000);
  window.addEventListener('load', () => {
    const sw = navigator.serviceWorker;
    // The first visit: the worker starts once the page has loaded the game, so it is told what to keep for offline
    // play (what comes after it took over goes through it anyway). Media played in parts stay out (the song).
    const keep = () => sw.controller?.postMessage({
      keep: (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
        .filter((e) => e.initiatorType !== 'audio' && e.initiatorType !== 'video')
        .map((e) => e.name),
    });
    if (!sw.controller) sw.addEventListener('controllerchange', keep, { once: true });
    sw.register('./sw.js').catch(() => undefined);
  });
}

main().catch((err) => {
  console.error(err);
  boot.style.display = '';
  boot.classList.remove('is-done');
  boot.classList.add('is-error');
  bootStatus(String(err?.message ?? err));
});
