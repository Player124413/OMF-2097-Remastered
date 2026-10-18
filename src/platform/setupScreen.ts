// The first start's setup: after loading, the loading screen's logo moves up and the player picks the language (the
// system's to begin with: the setup speaks it at once), how the remaster looks and sounds (graphics, effects,
// announcer, music, the keyboard layout) and whether the new robots and arenas play (their mod, EXTRAS > MODS), or
// takes a preset. Everything stays in OPTIONS afterwards. Keyboard (arrows, ENTER),
// mouse and gamepad.
import { app } from '../app';
import { audio } from '../audio/audio';
import { previewAnnouncer } from '../audio/announcer';
import { connectedPads, readPad } from '../controller/input';
import { applyKeyLayout } from '../game/controls';
import { defaultSettings, saveSettings, settings } from '../game/settings';
import { bundledEnabled, setBundledEnabled } from '../mods/bundled';
import { EXTRAS_MOD_ID } from '../mods/extras';
import { ensureUiFont, UI_FONT } from './uiFont';
import { setLanguage, systemLanguage, tr } from '../i18n/i18n';
import { languageInfo, LANGUAGES } from '../i18n/languages';

interface Choice {
  label: string;
  sub?: string;
  value: string;
}

interface Row {
  title: string;
  hint: string;
  choices: Choice[];
  /** Small chips (the languages: there are fifteen). */
  compact?: boolean;
  get(): string;
  set(value: string): void;
  shown?(): boolean;
}

const EFFECTS = ['bloom', 'fxParticles', 'fxLighting', 'fxImpact', 'fxAtmosphere'] as const;

function effectsLevel(): string {
  const v = settings().video;
  const on = EFFECTS.map((k) => v[k]);
  if (on.every(Boolean)) return 'full';
  if (on.every((x) => !x)) return 'off';
  if (v.bloom && v.fxParticles && v.fxLighting && !v.fxImpact && !v.fxAtmosphere) return 'light';
  return '';
}

function setEffects(level: string): void {
  const v = settings().video;
  for (const k of EFFECTS) v[k] = level === 'full' || (level === 'light' && (k === 'bloom' || k === 'fxParticles' || k === 'fxLighting'));
}

function rows(onLanguage: () => void): Row[] {
  const s = () => settings();
  return [
    {
      title: tr('LANGUAGE'), hint: tr('AUTOMATIC speaks the language of your system. Change it any time in Options.'), compact: true,
      choices: [{ label: tr('AUTOMATIC'), sub: languageInfo(systemLanguage()).native, value: 'auto' },
        ...LANGUAGES.map((l) => ({ label: l.native, value: l.code }))],
      get: () => s().language,
      set: (v) => {
        s().language = v;
        void setLanguage(v).then(onLanguage, onLanguage);
      },
    },
    {
      title: tr('GRAPHICS'), hint: tr('F2 switches between them at any time.'),
      choices: [{ label: tr('REMASTERED'), sub: tr('HD artwork, light, effects'), value: 'remastered' }, { label: tr('CLASSIC'), sub: tr('The 1994 pixels'), value: 'classic' }],
      get: () => s().video.graphics,
      set: (v) => {
        s().video.graphics = v === 'classic' ? 'classic' : 'remastered';
        app.setGraphicsMode(s().video.graphics);
      },
    },
    {
      title: tr('EFFECTS'), hint: tr('Glow, sparks, lighting, impacts and arena atmosphere.'),
      choices: [{ label: tr('FULL'), value: 'full' }, { label: tr('LIGHT'), value: 'light' }, { label: tr('OFF'), value: 'off' }],
      get: effectsLevel, set: setEffects, shown: () => s().video.graphics === 'remastered',
    },
    {
      title: tr('PIXELS'), hint: tr('How the classic graphics are scaled up.'),
      choices: [{ label: tr('SHARP'), value: 'sharp' }, { label: tr('SMOOTH'), value: 'smooth' }, { label: tr('CRT'), value: 'crt' }],
      get: () => s().video.classicFilter, set: (v) => (s().video.classicFilter = v as 'sharp' | 'smooth' | 'crt'),
      shown: () => s().video.graphics === 'classic',
    },
    {
      title: tr('ANNOUNCER'), hint: tr('Calls the rounds and knockouts, and reads the news.'),
      choices: [{ label: tr('MALE'), value: 'male' }, { label: tr('FEMALE'), value: 'female' }, { label: tr('ORIGINAL'), value: 'off' }],
      get: () => s().sound.announcer,
      set: (v) => {
        s().sound.announcer = v as 'off' | 'male' | 'female';
        if (v === 'off') audio.playSoundSimple(10, 0);
        else previewAnnouncer(s().sound.announcer);
      },
    },
    {
      title: tr('MUSIC'), hint: tr('The soundtrack in high quality, or as the 1994 sound cards played it.'),
      choices: [{ label: tr('ENHANCED'), value: 'on' }, { label: tr('ORIGINAL'), value: 'off' }],
      get: () => (s().sound.enhancedMusic ? 'on' : 'off'),
      set: (v) => {
        s().sound.enhancedMusic = v === 'on';
        audio.setQuality(v === 'on' ? 'enhanced' : 'classic');
      },
    },
    {
      title: tr('NEW ROBOTS AND ARENAS'), hint: tr('Glacier, Tempest, Helix and Spectre, and four arenas, made for the remaster (a mod: EXTRAS › MODS).'),
      choices: [{ label: tr('OFF'), value: 'off' }, { label: tr('ON'), value: 'on' }],
      get: () => (bundledEnabled(EXTRAS_MOD_ID) ? 'on' : 'off'), set: (v) => setBundledEnabled(EXTRAS_MOD_ID, v === 'on'),
    },
    {
      title: tr('KEYBOARD'), hint: tr('Controllers work right away. Both players can share one keyboard.'),
      choices: [{ label: tr('CLASSIC'), sub: tr('Arrows, Enter, Shift'), value: 'classic' }, { label: tr('MODERN'), sub: tr('WASD'), value: 'modern' }],
      get: () => s().keys.layout, set: (v) => applyKeyLayout(v === 'modern' ? 'modern' : 'classic'),
    },
  ];
}

/** Presets: the original game's look and sound, or the remaster's recommended settings (its defaults). */
function applyPreset(kind: 'original' | 'recommended'): void {
  const s = settings();
  const d = defaultSettings();
  const v = kind === 'original';
  s.video.graphics = v ? 'classic' : 'remastered';
  app.setGraphicsMode(s.video.graphics);
  s.video.classicFilter = d.video.classicFilter;
  setEffects('full');
  s.sound.announcer = v ? 'off' : d.sound.announcer;
  s.sound.enhancedMusic = !v;
  audio.setQuality(v ? 'classic' : 'enhanced');
  setBundledEnabled(EXTRAS_MOD_ID, false);
  applyKeyLayout('classic');
}

const CSS = `
#boot .center { transition: top .7s cubic-bezier(.2, .9, .25, 1), width .7s cubic-bezier(.2, .9, .25, 1); }
#boot.is-setup .center { top: max(14vh, 95px); width: min(30vw, 340px); }
#boot .meter, #boot .status { transition: opacity .3s, height .5s, margin .5s, padding .5s; }
#boot.is-setup .meter, #boot.is-setup .status { opacity: 0; height: 0; margin: 0; padding: 0; overflow: hidden; }
#boot.is-setup .tip { opacity: 0; transition: opacity .3s; }
#omf-setup { position: fixed; inset: 0; z-index: 60; display: flex; justify-content: center; align-items: flex-start;
  box-sizing: border-box; padding-top: max(27vh, 150px); font-family: ${UI_FONT}; color: #dfe7ff; opacity: 0; transition: opacity .45s ease .25s; }
#omf-setup.is-on { opacity: 1; }
#omf-setup.is-out { opacity: 0; transition: opacity .35s ease; }
#omf-setup > div { width: min(1000px, 94vw); max-height: 100%; min-height: 0; display: flex; flex-direction: column; }
#omf-setup .panel { width: 100%; max-height: 70vh; min-height: 0; display: flex; flex-direction: column; border-radius: 16px;
  background: linear-gradient(180deg, rgba(12, 18, 44, .82), rgba(5, 8, 22, .88)); border: 1px solid rgba(120, 160, 255, .3);
  box-shadow: 0 30px 90px rgba(0, 0, 0, .6), inset 0 1px 0 rgba(255, 255, 255, .06); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); overflow: hidden; }
#omf-setup header { flex: 0 0 auto; padding: clamp(14px, 2.4vh, 26px) clamp(20px, 3vw, 40px) clamp(8px, 1.4vh, 14px); }
#omf-setup h1 { margin: 0; font-weight: 900; font-size: clamp(18px, 1.7vw, 28px); letter-spacing: .12em;
  background: linear-gradient(180deg, #fff 0%, #dfe6f5 46%, #fff 52%, #7c8aa8 58%, #e9eef8 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent; }
#omf-setup header p { margin: .5em 0 0; font-weight: 500; font-size: clamp(11px, .9vw, 15px); color: #a9b9e2; letter-spacing: .03em; }
#omf-setup .rows { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 clamp(10px, 1.6vw, 22px); }
#omf-setup .row { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 18px; margin: 2px 0;
  padding: clamp(7px, 1.15vh, 12px) clamp(10px, 1.4vw, 18px); border-radius: 10px; border-inline-start: 3px solid transparent; }
#omf-setup .row.is-focus { background: rgba(90, 130, 255, .12); border-inline-start-color: #4fd2ff; }
#omf-setup .row h2 { margin: 0; font-weight: 800; font-size: clamp(11px, .92vw, 15px); letter-spacing: .16em; color: #eef2ff; }
#omf-setup .row p { margin: .3em 0 0; font-weight: 500; font-size: clamp(10px, .76vw, 13px); color: #8fa2cf; letter-spacing: .02em; }
#omf-setup .chips { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
#omf-setup .chip { display: flex; flex-direction: column; align-items: center; min-width: 6.5em; padding: .55em 1.1em; border-radius: 10px;
  cursor: pointer; border: 1px solid rgba(140, 170, 255, .32); background: rgba(20, 30, 70, .55); color: #cdd9ff;
  font: 700 clamp(10px, .82vw, 14px) ${UI_FONT}; letter-spacing: .1em; transition: background .15s, color .15s, border-color .15s; }
#omf-setup .chips.compact { max-width: min(560px, 60vw); gap: 6px; }
#omf-setup .chips.compact .chip { min-width: 0; padding: .45em .8em; letter-spacing: .04em; text-transform: none; }
#omf-setup .chip small { margin-top: .3em; font-weight: 500; font-size: .74em; letter-spacing: .04em; color: #8fa2cf; }
#omf-setup .chip:hover { border-color: rgba(160, 190, 255, .7); color: #fff; }
#omf-setup .chip.is-on { background: linear-gradient(180deg, #ffe08a, #ffb02e); border-color: #ffc23d; color: #1a1204; }
#omf-setup .chip.is-on small { color: #5a3d06; }
#omf-setup footer { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  padding: clamp(10px, 1.8vh, 18px) clamp(20px, 3vw, 40px); border-top: 1px solid rgba(120, 160, 255, .16); }
#omf-setup .presets { display: flex; gap: 10px; flex-wrap: wrap; }
#omf-setup .btn { cursor: pointer; border-radius: 10px; padding: .75em 1.3em; font: 700 clamp(10px, .8vw, 13px) ${UI_FONT};
  letter-spacing: .14em; color: #cdd9ff; background: rgba(255, 255, 255, .04); border: 1px solid rgba(140, 170, 255, .32); }
#omf-setup .btn:hover, #omf-setup .btn.is-focus { color: #fff; border-color: #4fd2ff; background: rgba(79, 210, 255, .12); }
#omf-setup .start { padding: .8em 2.4em; font-weight: 900; font-size: clamp(12px, 1vw, 16px); color: #1b0b02; border: 0;
  background: linear-gradient(180deg, #ffd27a, #ff8a2a 55%, #ff5a14); box-shadow: 0 0 22px rgba(255, 120, 40, .45); }
#omf-setup .start:hover, #omf-setup .start.is-focus { color: #1b0b02; background: linear-gradient(180deg, #ffe3a0, #ffa04a 55%, #ff6a24);
  box-shadow: 0 0 30px rgba(255, 140, 60, .75); outline: 2px solid #fff3d6; outline-offset: 2px; }
#omf-setup .keys { flex: 0 0 auto; margin-top: 10px; text-align: center; font: 600 clamp(9px, .7vw, 12px) ${UI_FONT}; letter-spacing: .14em;
  color: rgba(170, 190, 235, .7); text-transform: uppercase; }
/* Short landscape viewports (especially phones at 2x DPR): keep the footer fixed on-screen and scroll just the options. */
@media (max-height: 760px) {
  #omf-setup { align-items: stretch; overflow: hidden;
    padding: max(env(safe-area-inset-top, 0px), clamp(10px, 6vh, 28px))
      max(env(safe-area-inset-right, 0px), 10px) max(env(safe-area-inset-bottom, 0px), 8px)
      max(env(safe-area-inset-left, 0px), 10px); }
  #omf-setup > div { width: min(1000px, 94vw); height: 100%; max-height: 100%; }
  #omf-setup .panel { flex: 1 1 auto; max-height: none; }
  #omf-setup header { padding: 7px clamp(12px, 2vw, 20px) 4px; }
  #omf-setup h1 { font-size: clamp(16px, 2.1vw, 22px); }
  #omf-setup header p { margin-top: .3em; font-size: clamp(10px, .9vw, 12px); }
  #omf-setup .rows { padding-inline: 8px; }
  #omf-setup .row { gap: 10px; margin: 1px 0; padding: clamp(4px, .8vh, 7px) 9px; }
  #omf-setup .row h2 { font-size: clamp(10px, .9vw, 13px); }
  #omf-setup .row p { margin-top: .2em; font-size: clamp(9px, .75vw, 11px); }
  #omf-setup .chips { gap: 5px; }
  #omf-setup .chip { min-width: 5.5em; padding: .45em .8em; font-size: clamp(9px, .75vw, 12px); }
  #omf-setup footer { gap: 8px; padding: 7px clamp(12px, 2vw, 20px); }
  #omf-setup .presets { gap: 6px; }
  #omf-setup .btn { padding: .55em .9em; font-size: clamp(9px, .72vw, 11px); }
  #omf-setup .start { padding: .65em 1.5em; font-size: clamp(11px, .9vw, 13px); }
  #omf-setup .keys { margin-top: 4px; font-size: clamp(8px, .65vw, 10px); }
}
`;

/**
 * Shows the setup over the finished loading screen; resolves when the player starts the game (the settings are
 * saved, and the setup is marked done).
 */
export function firstRunSetup(boot: HTMLElement): Promise<void> {
  ensureUiFont();
  if (!document.getElementById('omf-setup-style')) {
    const style = document.createElement('style');
    style.id = 'omf-setup-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  let all: Row[] = [];
  const root = document.createElement('div');
  root.id = 'omf-setup';
  const panel = document.createElement('div');
  panel.className = 'panel';
  const header = document.createElement('header');
  const list = document.createElement('div');
  list.className = 'rows';
  const footer = document.createElement('footer');
  const presets = document.createElement('div');
  presets.className = 'presets';
  const button = (label: string, cls: string) => {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = label;
    return b;
  };
  const original = button('', 'btn');
  const recommended = button('', 'btn');
  const start = button('', 'btn start');
  presets.append(original, recommended);
  footer.append(presets, start);
  panel.append(header, list, footer);
  const keys = document.createElement('div');
  keys.className = 'keys';
  /** The setup's texts in the language spoken now (again when the player picks another). */
  const words = () => {
    all = rows(() => {
      words();
      render();
    });
    header.innerHTML = `<h1></h1><p></p>`;
    header.querySelector('h1')!.textContent = tr('WELCOME, PILOT');
    header.querySelector('p')!.textContent = tr('Set up the remaster your way. You can change all of this later in Options.');
    original.textContent = tr('ORIGINAL 1994 STYLE');
    recommended.textContent = tr('RECOMMENDED');
    start.textContent = tr('START ▶');
    keys.textContent = tr('↑ ↓ choose · ← → change · Enter start');
  };
  words();
  const column = document.createElement('div');
  column.append(panel, keys);
  root.appendChild(column);
  document.body.appendChild(root);

  // Focus: a row, or a footer button (index past the rows: 0 original, 1 recommended, 2 start).
  let focus = 0;
  const shown = () => all.filter((r) => !r.shown || r.shown());
  const buttons = [original, recommended, start];
  let rowEls: HTMLElement[] = [];

  const render = () => {
    const vis = shown();
    rowEls = vis.map((r, i) => {
      const el = document.createElement('div');
      el.className = 'row' + (i === focus ? ' is-focus' : '');
      const text = document.createElement('div');
      text.innerHTML = `<h2></h2><p></p>`;
      text.querySelector('h2')!.textContent = r.title;
      text.querySelector('p')!.textContent = r.hint;
      const chips = document.createElement('div');
      chips.className = r.compact ? 'chips compact' : 'chips';
      const current = r.get();
      for (const c of r.choices) {
        const chip = document.createElement('button');
        chip.className = 'chip' + (c.value === current ? ' is-on' : '');
        chip.textContent = c.label;
        if (c.sub) {
          const small = document.createElement('small');
          small.textContent = c.sub;
          chip.appendChild(small);
        }
        chip.addEventListener('click', () => {
          focus = i;
          choose(r, c.value);
        });
        chips.appendChild(chip);
      }
      el.addEventListener('mouseenter', () => {
        if (focus !== i) {
          focus = i;
          highlight();
        }
      });
      el.append(text, chips);
      return el;
    });
    list.replaceChildren(...rowEls);
    highlight();
  };
  const highlight = () => {
    const n = shown().length;
    rowEls.forEach((el, i) => el.classList.toggle('is-focus', i === focus));
    buttons.forEach((b, i) => b.classList.toggle('is-focus', focus === n + i));
    if (focus < n) rowEls[focus]?.scrollIntoView({ block: 'nearest' });
  };
  const choose = (r: Row, value: string) => {
    if (r.get() === value) return;
    r.set(value);
    audio.playSoundSimple(19, 0);
    render();
  };
  const step = (row: number, dir: number) => {
    const r = shown()[row];
    if (!r) return;
    const i = r.choices.findIndex((c) => c.value === r.get());
    const next = r.choices[Math.max(0, Math.min(r.choices.length - 1, (i < 0 ? 0 : i) + dir))];
    if (next) choose(r, next.value);
  };
  const preset = (kind: 'original' | 'recommended') => {
    applyPreset(kind);
    audio.playSoundSimple(20, 0);
    render();
  };
  original.addEventListener('click', () => preset('original'));
  recommended.addEventListener('click', () => preset('recommended'));
  buttons.forEach((b, i) => b.addEventListener('mouseenter', () => {
    focus = shown().length + i;
    highlight();
  }));

  return new Promise((resolve) => {
    let done = false;
    let raf = 0;
    const finish = () => {
      if (done) return;
      done = true;
      audio.playSoundSimple(20, 0);
      settings().setupDone = true;
      saveSettings();
      app.settingsChanged();
      window.removeEventListener('keydown', onKey, true);
      // (the release of the key that started the game is swallowed a moment longer)
      window.setTimeout(() => window.removeEventListener('keyup', onKeyUp, true), 400);
      cancelAnimationFrame(raf);
      root.classList.add('is-out');
      window.setTimeout(() => {
        root.remove();
        boot.classList.remove('is-setup');
        resolve();
      }, 360);
    };
    start.addEventListener('click', finish);
    const act = (a: 'up' | 'down' | 'left' | 'right' | 'ok') => {
      const n = shown().length;
      if (a === 'up') focus = focus >= n ? n - 1 : Math.max(0, focus - 1);
      else if (a === 'down') focus = focus >= n ? focus : focus + 1 >= n ? n + 2 : focus + 1;
      else if (a === 'left' || a === 'right') {
        // (a language read from the right lays the choices and buttons out from the right: the arrows go as they look)
        const d = (a === 'left' ? -1 : 1) * (document.documentElement.dir === 'rtl' ? -1 : 1);
        if (focus < n) step(focus, d);
        else focus = Math.max(n, Math.min(n + 2, focus + d));
      } else if (a === 'ok') {
        if (focus === n) preset('original');
        else if (focus === n + 1) preset('recommended');
        else finish();
        return;
      }
      if (a === 'up' || a === 'down') audio.playSoundSimple(19, 0);
      highlight();
    };
    const map: Record<string, 'up' | 'down' | 'left' | 'right' | 'ok'> = {
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right',
      KeyD: 'right', Enter: 'ok', NumpadEnter: 'ok', Space: 'ok',
    };
    const onKey = (e: KeyboardEvent) => {
      const a = map[e.code];
      if (!a) return;
      // (the setup's keys don't reach the game: ENTER would also skip the intro that follows)
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!(e.repeat && a === 'ok')) act(a);
    };
    // Their releases don't reach it either.
    const onKeyUp = (e: KeyboardEvent) => {
      if (map[e.code]) e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKeyUp, true);
    // Gamepads: the stick or pad directions and A.
    let prev = { up: true, down: true, left: true, right: true, ok: true };
    const poll = () => {
      const now = { up: false, down: false, left: false, right: false, ok: false };
      for (const i of connectedPads()) {
        const p = readPad(i);
        if (!p) continue;
        now.up ||= p.up;
        now.down ||= p.down;
        now.left ||= p.left;
        now.right ||= p.right;
        now.ok ||= p.a || p.start;
      }
      for (const k of ['up', 'down', 'left', 'right', 'ok'] as const) if (now[k] && !prev[k]) act(k);
      prev = now;
      if (!done) raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    render();
    boot.classList.add('is-setup');
    // (a moment after it is on the page, so it fades in; a timer, as animation frames stop in background windows)
    window.setTimeout(() => root.classList.add('is-on'), 30);
  });
}
