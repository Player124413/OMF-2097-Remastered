// Persistent user settings (localStorage; also works inside the desktop shell).
import { CtrlType, KnockDownMode } from './constants';
import { isLangCode } from '../i18n/languages';

export interface KeyBindings {
  jumpUp: string[];
  jumpRight: string[];
  walkRight: string[];
  duckForward: string[];
  duck: string[];
  duckBack: string[];
  walkBack: string[];
  jumpLeft: string[];
  punch: string[];
  kick: string[];
  /** The one-button special (OPTIONS > CONTROLS > SPECIAL BUTTON; not in the original game). */
  special: string[];
  /** The finisher keys (OPTIONS > CONTROLS > FINISHER KEYS; not in the original game): see controller/finisher.ts. */
  scrap: string[];
  destruction: string[];
  fireIce: string[];
}

/** The finisher keys of each keyboard layout (controls.ts), also for settings saved before they existed. */
export const FINISHER_KEYS = {
  classic: { p1: { scrap: ['Comma'], destruction: ['Period'], fireIce: ['Semicolon'] }, p2: { scrap: ['KeyR'], destruction: ['KeyT'], fireIce: ['KeyY'] } },
  modern: {
    p1: { scrap: ['KeyU', 'KeyR'], destruction: ['KeyI', 'KeyT'], fireIce: ['KeyO', 'KeyY'] },
    p2: { scrap: ['Semicolon', 'Numpad4'], destruction: ['Quote', 'Numpad5'], fireIce: ['BracketRight', 'Numpad6'] },
  },
};

/** The special button of the modern keyboard layout (controls.ts), for settings saved before it existed. */
export const MODERN_SPECIAL_KEYS = { p1: ['KeyL', 'KeyH'], p2: ['Slash', 'Numpad3'] };

export type GraphicsMode = 'classic' | 'remastered';

/** A configurable on-screen control (normalized to the viewport, so the layout survives rotation and resolution changes). */
export type TouchControlId = 'stick' | 'punch' | 'kick' | 'special' | 'pause';

export interface TouchControlPosition {
  /** Center position, from 0 to 1 of the safe viewport. */
  x: number;
  y: number;
  /** Multiplier of the control's device-adaptive base size. */
  scale: number;
}

export interface TouchLayout {
  /** Overall opacity of the game controls, 0.25..1. */
  opacity: number;
  /** Virtual stick's neutral dead-zone as a fraction of its travel. */
  deadzone: number;
  /** Short Android vibration on attacks and pause. */
  haptics: boolean;
  controls: Record<TouchControlId, TouchControlPosition>;
}

/** Fresh default values: each player's saved layout remains independent and mutable. */
export function defaultTouchLayout(): TouchLayout {
  return {
    opacity: 0.84,
    deadzone: 0.18,
    haptics: true,
    controls: {
      stick: { x: 0.14, y: 0.76, scale: 1.08 },
      punch: { x: 0.81, y: 0.79, scale: 1.04 },
      kick: { x: 0.93, y: 0.88, scale: 1.04 },
      special: { x: 0.92, y: 0.67, scale: 0.9 },
      pause: { x: 0.96, y: 0.09, scale: 0.78 },
    },
  };
}

/** Repairs old, partial or hand-edited layout data without allowing controls to end up off-screen. */
export function normalizeTouchLayout(value: unknown): TouchLayout {
  const fallback = defaultTouchLayout();
  const source = value && typeof value === 'object' ? value as Partial<TouchLayout> : {};
  const finite = (n: unknown, d: number, min: number, max: number): number =>
    typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
  const positions = source.controls && typeof source.controls === 'object' ? source.controls : {};
  const controls = {} as TouchLayout['controls'];
  for (const id of Object.keys(fallback.controls) as TouchControlId[]) {
    const given = (positions as Partial<TouchLayout['controls']>)[id];
    const d = fallback.controls[id];
    controls[id] = {
      x: finite(given?.x, d.x, 0.04, 0.96),
      y: finite(given?.y, d.y, 0.05, 0.95),
      scale: finite(given?.scale, d.scale, 0.65, 1.6),
    };
  }
  return {
    opacity: finite(source.opacity, fallback.opacity, 0.25, 1),
    deadzone: finite(source.deadzone, fallback.deadzone, 0.08, 0.4),
    haptics: typeof source.haptics === 'boolean' ? source.haptics : fallback.haptics,
    controls,
  };
}

export interface Settings {
  video: {
    /** Classic = pixel-exact 320x200; remastered = HD, widescreen, effects. */
    graphics: GraphicsMode;
    /** Classic mode scaling filter. */
    classicFilter: 'sharp' | 'smooth' | 'crt';
    /** Show extended widescreen backgrounds in classic mode instead of black bars. */
    classicWidescreen: boolean;
    crossfade: boolean;
    screenShake: boolean;
    fullscreen: boolean;
    /** Remastered: bloom/glow post effects. */
    bloom: boolean;
    /** Remastered: smooth motion interpolation between game ticks. */
    motionSmoothing: boolean;
    /** Remastered: 'auto' lowers the internal resolution when the GPU is too slow; 'full' never does. */
    hdResolution: 'auto' | 'full';
    /** Remastered: use the HD artwork (backgrounds, robots, portraits...) where it is installed. */
    hdArtwork: boolean;
    /**
     * Remastered: text in a high-resolution typeface in the style of the original fonts ('type'), the original font as
     * clean HD shapes ('smooth'), or kept as crisp pixels.
     */
    hdFont: 'type' | 'smooth' | 'pixel';
    /** Remastered: health, endurance and stat bars drawn as smooth vector graphics (else the original bars). */
    hdHud: boolean;
    /** Remastered fights: sparks, dust and debris. */
    fxParticles: boolean;
    /** Remastered fights: light from impacts, fire and energy effects; arena light on the robots. */
    fxLighting: boolean;
    /** Remastered fights: shockwaves, flashes and the knockout camera. */
    fxImpact: boolean;
    /** Remastered fights: arena ambience (embers, sand, dust motes, crowd flashes, heat haze, light shafts). */
    fxAtmosphere: boolean;
  };
  sound: {
    soundVol: number; // 0..10
    musicVol: number; // 0..10
    enhancedMusic: boolean;
    /** Arena reverb on the sound effects. */
    acoustics: boolean;
    /** A low thump under heavy impacts. */
    impactBass: boolean;
    /** Where the player's own music replaces the soundtrack: nowhere, in fights, or everywhere. */
    myMusic: 'off' | 'fights' | 'always';
    /** The announcer (audio/announcer.ts): off, or its voice. */
    announcer: 'off' | 'male' | 'female';
  };
  gameplay: {
    speed: number; // 0..10
    fightMode: number; // 0 normal, 1 hyper
    power1: number; // 1..8 (reference range)
    power2: number;
    hazards: boolean;
    difficulty: number; // 0..6
    rounds: number; // 0..3
    /** Every fight is recorded and kept in the replay list. */
    saveReplays: boolean;
    /** The winner's portrait and a line of theirs after one and two player fights (scenes/victory.ts). */
    victoryScreens: boolean;
    /** Remastered graphics: the view follows the fight, closer when the robots are close (video/camera.ts). */
    fightCamera: boolean;
  };
  advanced: {
    rehitMode: boolean;
    defensiveThrows: boolean;
    throwRange: number;
    jumpHeight: number;
    hitPause: number;
    vitality: number;
    knockDown: KnockDownMode;
    blockDamage: number;
  };
  keys: {
    ctrlType1: CtrlType;
    ctrlType2: CtrlType;
    gamepad1: number; // gamepad index or -1
    gamepad2: number;
    /** Gamepad vibration on hits and screen shakes. */
    rumble: boolean;
    /** Keyboard players also play with a free gamepad (player 1 the first, player 2 the second). */
    autoPads: boolean;
    /** Keyboard layout of both players: the original's, a modern one (WASD), or keys rebound by the player. */
    layout: 'classic' | 'modern' | 'custom';
    /** Gamepad buttons: 'modern' (X/Y punch, A/B kick) or 'classic' (A/X punch, B/Y kick). */
    padLayout: 'modern' | 'classic';
    /** The special button does special moves in one press (see controller/special.ts). */
    specialButton: boolean;
    /**
     * The finisher keys do the robot's scrap, destruction or Fire & Ice move in one press once a fight is won, and the
     * special button the next of them (see controller/finisher.ts). Off: the original inputs only.
     */
    finisherKeys: boolean;
    /** Touch controls (platform/touch.ts): shown on touch screens once touched, always, or never. */
    touch: 'auto' | 'on' | 'off';
    /** Per-device position, size, opacity and stick feel for the virtual controls. */
    touchLayout: TouchLayout;
    p1: KeyBindings;
    p2: KeyBindings;
  };
  tournament: {
    lastName: string;
  };
  /** LAN games (MULTIPLAYER > LAN, net/lanPage.ts): the player's name there, and the address joined last. */
  lan: {
    name: string;
    address: string;
  };
  /** Training mode setup (last used). */
  training: {
    har: number;
    pilot: number;
    opponent: number;
    arena: number;
    /** DummyMode */
    dummy: number;
    /** Show the player's recent inputs. */
    inputDisplay: boolean;
    /** Training lab: the frame meter and frame data, the hitbox view. */
    frameData: boolean;
    hitboxes: boolean;
    /** The dummy's reversal: 'off', 'jump', 'tape' or 'move:<move string>'. */
    reversal: string;
    /** Combo trials completed, as '<robot id>:<trial index>'. */
    trialsDone: string[];
    /** The dummy's recording (see controller/dummy.ts DummyTape), kept between sessions. */
    tape: { frames: number[][]; facing: number } | null;
  };
  /** The language the game speaks: 'auto' (the system's, see i18n/i18n.ts) or a language code (i18n/languages.ts). */
  language: string;
  /** The first start's setup (platform/setupScreen.ts) was done (settings saved before it get it once too). */
  setupDone: boolean;
  /** Format revision of saved settings (see loadSettings). */
  revision: number;
}

/**
 * Current settings revision. 2: the new robots and arenas became opt-in (gameplay.extraRobots / extraArenas); settings
 * saved before could only hold the old default (on), so they were off. 3: the remastered typeface became the default
 * font; the smooth letters saved before were the old default. 4: the announcer became a choice of voice; the on / off
 * saved before becomes the male voice / off. 5: the new robots and arenas became a mod that comes with the game
 * (mods/extras.ts): a player who had either on finds the mod on (mods/bundled.ts migrateNewContent). 6: the language
 * became a language code or 'auto' (it was the original's language file): German stays German, the English that was
 * everyone's default becomes the system's language. 7: the touch controls gained an editable, normalized layout.
 */
const REVISION = 7;

export function defaultSettings(): Settings {
  return {
    video: {
      graphics: 'remastered',
      classicFilter: 'sharp',
      classicWidescreen: false,
      crossfade: true,
      screenShake: true,
      fullscreen: false,
      bloom: true,
      motionSmoothing: true,
      hdResolution: 'auto',
      hdArtwork: true,
      hdFont: 'type',
      hdHud: true,
      fxParticles: true,
      fxLighting: true,
      fxImpact: true,
      fxAtmosphere: true,
    },
    sound: { soundVol: 7, musicVol: 6, enhancedMusic: true, acoustics: true, impactBass: true, myMusic: 'fights', announcer: 'male' },
    gameplay: { speed: 5, fightMode: 0, power1: 5, power2: 5, hazards: true, difficulty: 1, rounds: 1, saveReplays: true, victoryScreens: true, fightCamera: false },
    advanced: {
      rehitMode: false,
      defensiveThrows: false,
      throwRange: 100,
      jumpHeight: 100,
      hitPause: 4,
      vitality: 100,
      knockDown: KnockDownMode.NONE,
      blockDamage: 0,
    },
    keys: {
      ctrlType1: CtrlType.KEYBOARD,
      ctrlType2: CtrlType.KEYBOARD,
      gamepad1: -1,
      gamepad2: -1,
      rumble: true,
      autoPads: true,
      layout: 'classic',
      padLayout: 'modern',
      specialButton: true,
      finisherKeys: false,
      touch: 'auto',
      touchLayout: defaultTouchLayout(),
      // KeyboardEvent.code values. Player 1: arrows / numpad, Enter + Right Shift (like the reference defaults).
      p1: {
        jumpUp: ['ArrowUp', 'Numpad8'],
        jumpRight: ['PageUp', 'Numpad9'],
        walkRight: ['ArrowRight', 'Numpad6'],
        duckForward: ['PageDown', 'Numpad3'],
        duck: ['ArrowDown', 'Numpad2', 'Numpad5'],
        duckBack: ['End', 'Numpad1'],
        walkBack: ['ArrowLeft', 'Numpad4'],
        jumpLeft: ['Home', 'Numpad7'],
        punch: ['Enter', 'NumpadEnter', 'Numpad0'],
        kick: ['ShiftRight', 'NumpadDecimal', 'NumpadAdd'],
        special: ['Slash', 'NumpadSubtract'],
        ...copyKeys(FINISHER_KEYS.classic.p1),
      },
      // Player 2: QWE/AD/ZXC block, Left Ctrl + Left Shift.
      p2: {
        jumpUp: ['KeyW'],
        jumpRight: ['KeyE'],
        walkRight: ['KeyD'],
        duckForward: ['KeyC'],
        duck: ['KeyX', 'KeyS'],
        duckBack: ['KeyZ'],
        walkBack: ['KeyA'],
        jumpLeft: ['KeyQ'],
        punch: ['ControlLeft', 'KeyF'],
        kick: ['ShiftLeft', 'KeyG'],
        special: ['KeyH'],
        ...copyKeys(FINISHER_KEYS.classic.p2),
      },
    },
    tournament: { lastName: '' },
    lan: { name: '', address: '' },
    training: {
      har: 0, pilot: 0, opponent: 5, arena: 0, dummy: 0, inputDisplay: true, frameData: true, hitboxes: false, reversal: 'off',
      trialsDone: [], tape: null,
    },
    language: 'auto',
    setupDone: false,
    revision: REVISION,
  };
}

const STORAGE_KEY = 'omf2097r.settings';

function copyKeys<T extends Record<string, string[]>>(k: T): T {
  return Object.fromEntries(Object.entries(k).map(([a, codes]) => [a, [...codes]])) as T;
}

/** Gives both players the finisher keys of a layout, leaving out keys that already do something else. */
export function fillFinisherKeys(keys: Settings['keys'], layout: 'classic' | 'modern'): void {
  const finisher = new Set<string>(['scrap', 'destruction', 'fireIce']);
  const used = new Set<string>();
  for (const k of [keys.p1, keys.p2]) {
    for (const [action, codes] of Object.entries(k)) if (!finisher.has(action)) for (const c of codes) used.add(c);
  }
  const fill = (k: KeyBindings, d: (typeof FINISHER_KEYS)['classic']['p1']) => {
    k.scrap = d.scrap.filter((c) => !used.has(c));
    k.destruction = d.destruction.filter((c) => !used.has(c));
    k.fireIce = d.fireIce.filter((c) => !used.has(c));
  };
  fill(keys.p1, FINISHER_KEYS[layout].p1);
  fill(keys.p2, FINISHER_KEYS[layout].p2);
}

function merge<T>(base: T, over: unknown): T {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) {
    return (over === undefined ? base : (over as T));
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  if (over && typeof over === 'object') {
    for (const k of Object.keys(out)) {
      out[k] = merge(out[k], (over as Record<string, unknown>)[k]);
    }
  }
  return out as T;
}

let current: Settings = defaultSettings();

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings> | null;
      current = merge(defaultSettings(), saved);
      // Saved before the special button: the modern layout gets its own special keys (else the classic ones).
      if (saved?.keys && !saved.keys.p1?.special && saved.keys.layout === 'modern') {
        current.keys.p1.special = [...MODERN_SPECIAL_KEYS.p1];
        current.keys.p2.special = [...MODERN_SPECIAL_KEYS.p2];
      }
      // Saved before the finisher keys: the layout's own (keys rebound by the player keep theirs: what clashes stays free).
      if (saved?.keys && !saved.keys.p1?.scrap) fillFinisherKeys(current.keys, saved.keys.layout === 'modern' ? 'modern' : 'classic');
      if (!((saved?.revision ?? 0) >= 3) && current.video.hdFont === 'smooth') current.video.hdFont = 'type';
      const announcer: unknown = current.sound.announcer;
      if (announcer !== 'off' && announcer !== 'male' && announcer !== 'female') current.sound.announcer = announcer === false ? 'off' : 'male';
      if (!((saved?.revision ?? 0) >= 6)) current.language = current.language === 'GERMAN.DAT' ? 'de' : 'auto';
      if (current.language !== 'auto' && !isLangCode(current.language)) current.language = 'auto';
      current.revision = REVISION;
    }
  } catch {
    current = defaultSettings();
  }
  current.keys.touchLayout = normalizeTouchLayout(current.keys.touchLayout);
  return current;
}

export function saveSettings(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable (private mode) — settings stay in memory */
  }
}

export function settings(): Settings {
  return current;
}
