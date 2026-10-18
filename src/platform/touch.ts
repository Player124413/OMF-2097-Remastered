// Mobile controls: a fixed, eight-way virtual stick, simultaneous attack buttons and pause. Every control can be
// dragged and scaled in the editor; positions are stored as viewport fractions so they survive screen-size changes.
import { setKeyState } from '../controller/input';
import { tr } from '../i18n/i18n';
import { defaultTouchLayout, normalizeTouchLayout, saveSettings, settings, type TouchControlId, type TouchLayout } from '../game/settings';

export interface TouchPad {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  punch: boolean;
  kick: boolean;
  special: boolean;
}

const pad: TouchPad = { up: false, down: false, left: false, right: false, punch: false, kick: false, special: false };
let active = false;

/** The controls' live state while they are visible and playable (null in menus, demos, replays and the editor). */
export function touchPad(): TouchPad | null {
  return active ? pad : null;
}

/** Pure eight-way quantization, shared with tests. `deadzone` is measured in CSS pixels. */
export function touchDirections(dx: number, dy: number, deadzone: number): Pick<TouchPad, 'up' | 'down' | 'left' | 'right'> {
  const out = { up: false, down: false, left: false, right: false };
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= deadzone) return out;
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  out.right = sector === 0 || sector === 1 || sector === -1;
  out.left = sector === 4 || sector === -4 || sector === 3 || sector === -3;
  out.down = sector >= 1 && sector <= 3;
  out.up = sector <= -1 && sector >= -3;
  return out;
}

function el(tag: string, style: Partial<CSSStyleDeclaration>, parent?: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  parent?.appendChild(node);
  return node;
}

function capture(node: HTMLElement, id: number): void {
  try {
    node.setPointerCapture(id);
  } catch {
    // Synthetic events and browsers that do not support pointer capture still get their local events.
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function cloneLayout(layout: TouchLayout): TouchLayout {
  return {
    opacity: layout.opacity,
    deadzone: layout.deadzone,
    haptics: layout.haptics,
    controls: Object.fromEntries(Object.entries(layout.controls).map(([id, p]) => [id, { ...p }])) as TouchLayout['controls'],
  };
}

const CONTROL_META: Record<TouchControlId, { short: string; label: string; color: string }> = {
  stick: { short: '✣', label: 'MOVE', color: '#8bbcff' },
  punch: { short: 'P', label: 'PUNCH', color: '#ffb13b' },
  kick: { short: 'K', label: 'KICK', color: '#50d8ff' },
  special: { short: 'S', label: 'SPECIAL', color: '#78ee91' },
  pause: { short: 'Ⅱ', label: 'PAUSE', color: '#d7e4ff' },
};

/** The directional and action states exposed to the keyboard controller's normal input path. */
const emptyPad = (): void => {
  pad.up = pad.down = pad.left = pad.right = pad.punch = pad.kick = pad.special = false;
};

/** A touch screen was used; AUTO keeps the fight controls available from then on. */
let touched = false;

export class TouchControls {
  private root: HTMLElement;
  private stickZone: HTMLElement;
  private stickBase: HTMLElement;
  private stickKnob: HTMLElement;
  private controls = new Map<TouchControlId, HTMLElement>();
  private buttonPointers = new Map<Exclude<TouchControlId, 'stick'>, Set<number>>();
  private stickId = -1;
  private playVisible = false;
  private shown = false;
  private editing = false;
  private selected: TouchControlId = 'stick';
  private editSnapshot: TouchLayout | null = null;
  private dragPointer = -1;
  private dragControl: TouchControlId | null = null;
  private dragOffset = { x: 0, y: 0 };
  private pauseTimer = 0;
  private editor: HTMLElement | null = null;
  private editorSelect: HTMLSelectElement | null = null;
  private sizeInput: HTMLInputElement | null = null;
  private sizeValue: HTMLElement | null = null;
  private opacityInput: HTMLInputElement | null = null;
  private opacityValue: HTMLElement | null = null;
  private deadzoneInput: HTMLInputElement | null = null;
  private deadzoneValue: HTMLElement | null = null;
  private hapticsInput: HTMLInputElement | null = null;

  constructor() {
    // `pointerdown` also covers modern touch-only devices whose browser does not dispatch a useful touchstart.
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') touched = true;
    }, { passive: true, capture: true });
    window.addEventListener('touchstart', () => (touched = true), { passive: true, capture: true });
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
    window.addEventListener('resize', () => this.applyLayout());

    this.root = el('div', {
      position: 'fixed',
      inset: 'env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)',
      pointerEvents: 'none', zIndex: '15', display: 'none', userSelect: 'none', touchAction: 'none',
      webkitUserSelect: 'none',
    }, document.body);
    this.root.dir = 'ltr';
    this.root.setAttribute('aria-label', tr('TOUCH CONTROLS'));

    // Large hit area around a fixed visual stick: the thumb can land a little off-center without losing the direction.
    this.stickZone = el('div', {
      position: 'absolute', left: '0', top: '0', width: '160px', height: '160px', borderRadius: '50%',
      transform: 'translate(-50%, -50%)', pointerEvents: 'auto', touchAction: 'none',
    }, this.root);
    this.stickBase = el('div', {
      position: 'absolute', left: '50%', top: '50%', width: '100px', height: '100px', borderRadius: '50%',
      transform: 'translate(-50%, -50%)', pointerEvents: 'none', boxSizing: 'border-box',
      border: '1px solid rgba(183, 213, 255, .55)',
      background: 'radial-gradient(circle, rgba(100, 143, 205, .18) 0 36%, rgba(22, 35, 57, .58) 37% 68%, rgba(19, 30, 48, .3) 69% 100%)',
      boxShadow: 'inset 0 1px 14px rgba(180, 215, 255, .12), 0 4px 22px rgba(0, 0, 0, .28)',
    }, this.stickZone);
    for (const [glyph, x, y] of [
      ['▲', 50, 12], ['◢', 77, 23], ['▶', 88, 50], ['◣', 77, 77],
      ['▼', 50, 88], ['◤', 23, 77], ['◀', 12, 50], ['◥', 23, 23],
    ] as const) {
      const marker = el('span', {
        position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)',
        color: 'rgba(208, 229, 255, .66)', font: '700 10px/1 system-ui, sans-serif', pointerEvents: 'none',
        textShadow: '0 1px 3px #102038',
      }, this.stickBase);
      marker.textContent = glyph;
    }
    this.stickKnob = el('div', {
      position: 'absolute', left: '50%', top: '50%', width: '40px', height: '40px', borderRadius: '50%',
      transform: 'translate(-50%, -50%)', pointerEvents: 'none', boxSizing: 'border-box',
      border: '1px solid rgba(231, 242, 255, .85)',
      background: 'radial-gradient(circle at 34% 28%, rgba(223, 240, 255, .88), rgba(129, 176, 233, .72) 46%, rgba(57, 86, 130, .82))',
      boxShadow: '0 3px 10px rgba(0, 0, 0, .5), 0 0 14px rgba(98, 163, 255, .25)',
    }, this.stickBase);
    this.stickZone.addEventListener('pointerdown', (e) => this.stickDown(e));
    this.stickZone.addEventListener('pointermove', (e) => this.stickMove(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.stickZone.addEventListener(type, (e) => this.stickUp(e as PointerEvent));
    }
    this.stickBase.addEventListener('pointerdown', (e) => this.beginDrag('stick', e));
    this.stickBase.addEventListener('pointermove', (e) => this.dragMove('stick', e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.stickBase.addEventListener(type, (e) => this.endDrag('stick', e as PointerEvent));
    }

    for (const id of ['punch', 'kick', 'special', 'pause'] as const) this.makeButton(id);

    // Repair settings written by older builds or edited outside the in-game layout tool.
    settings().keys.touchLayout = normalizeTouchLayout(settings().keys.touchLayout);
    this.applyLayout();
  }

  private makeButton(id: Exclude<TouchControlId, 'stick'>): void {
    const meta = CONTROL_META[id];
    const button = el('button', {
      position: 'absolute', left: '0', top: '0', width: '64px', height: '64px', transform: 'translate(-50%, -50%)',
      padding: '0', borderRadius: id === 'pause' ? '17px' : '50%', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px',
      color: '#f5f8ff', border: `1px solid ${meta.color}cc`,
      background: `radial-gradient(circle at 35% 26%, ${meta.color}66, ${meta.color}30 52%, rgba(10, 17, 32, .78))`,
      boxShadow: `inset 0 1px 10px rgba(255, 255, 255, .12), 0 4px 14px rgba(0, 0, 0, .32), 0 0 16px ${meta.color}1c`,
      fontFamily: 'system-ui, "Segoe UI", sans-serif', cursor: 'pointer', pointerEvents: 'auto', touchAction: 'none',
      appearance: 'none',
    }, this.root) as HTMLButtonElement;
    button.type = 'button';
    button.style.setProperty('-webkit-tap-highlight-color', 'transparent');
    button.className = `omf-touch-control omf-touch-${id}`;
    button.setAttribute('aria-label', tr(meta.label));
    button.title = tr(meta.label);
    const glyph = el('span', {
      font: '800 21px/1 system-ui, sans-serif', letterSpacing: '.02em', pointerEvents: 'none',
      textShadow: '0 1px 5px rgba(0,0,0,.55)',
    }, button);
    glyph.textContent = meta.short;
    if (id !== 'pause') {
      const caption = el('small', {
        font: '800 7px/1 system-ui, sans-serif', letterSpacing: '.09em', pointerEvents: 'none',
        textShadow: '0 1px 4px rgba(0,0,0,.7)',
      }, button);
      caption.textContent = tr(meta.label);
    }
    this.controls.set(id, button);
    this.buttonPointers.set(id, new Set());
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.editing) {
        this.beginDrag(id, e);
        return;
      }
      if (!this.playVisible) return;
      capture(button, e.pointerId);
      const pointers = this.buttonPointers.get(id)!;
      pointers.add(e.pointerId);
      if (id === 'pause') this.pressPause();
      else this.setButtonHeld(id, true);
      this.haptic(id === 'special' ? 14 : id === 'pause' ? 10 : 8);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(type, (e) => {
        const p = e as PointerEvent;
        if (this.editing) {
          this.endDrag(id, p);
          return;
        }
        const pointers = this.buttonPointers.get(id)!;
        pointers.delete(p.pointerId);
        this.setButtonHeld(id, pointers.size > 0);
      });
    }
    button.addEventListener('pointermove', (e) => this.dragMove(id, e));
  }

  private setButtonHeld(id: Exclude<TouchControlId, 'stick'>, on: boolean): void {
    if (id === 'pause') return;
    if (id === 'punch') pad.punch = on;
    else if (id === 'kick') pad.kick = on;
    else pad.special = on;
    const button = this.controls.get(id);
    if (button) {
      const color = CONTROL_META[id].color;
      button.style.background = `radial-gradient(circle at 35% 26%, ${color}${on ? 'bb' : '66'}, ${color}${on ? '70' : '30'} 52%, rgba(10, 17, 32, .78))`;
      button.style.boxShadow = on
        ? `inset 0 1px 12px rgba(255,255,255,.24), 0 0 25px ${color}99, 0 4px 14px rgba(0,0,0,.42)`
        : `inset 0 1px 10px rgba(255,255,255,.12), 0 4px 14px rgba(0,0,0,.32), 0 0 16px ${color}1c`;
    }
  }

  private stickDown(e: PointerEvent): void {
    if (this.editing || !this.playVisible || this.stickId >= 0 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    this.stickId = e.pointerId;
    capture(this.stickZone, e.pointerId);
    this.stickMove(e);
  }

  private stickMove(e: PointerEvent): void {
    if (this.editing || e.pointerId !== this.stickId) return;
    const rect = this.stickBase.getBoundingClientRect();
    const radius = Math.max(16, rect.width * 0.34);
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > radius) {
      dx = (dx / len) * radius;
      dy = (dy / len) * radius;
    }
    this.stickKnob.style.left = `${50 + (dx / rect.width) * 100}%`;
    this.stickKnob.style.top = `${50 + (dy / rect.height) * 100}%`;
    const deadzone = Math.max(10, radius * settings().keys.touchLayout.deadzone);
    const directions = touchDirections(dx, dy, deadzone);
    pad.up = directions.up;
    pad.down = directions.down;
    pad.left = directions.left;
    pad.right = directions.right;
  }

  private stickUp(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    this.stickId = -1;
    pad.up = pad.down = pad.left = pad.right = false;
    this.stickKnob.style.left = '50%';
    this.stickKnob.style.top = '50%';
  }

  private pressPause(): void {
    setKeyState('Escape', true);
    window.clearTimeout(this.pauseTimer);
    this.pauseTimer = window.setTimeout(() => setKeyState('Escape', false), 130);
  }

  private haptic(duration: number): void {
    if (!settings().keys.touchLayout.haptics || typeof navigator.vibrate !== 'function') return;
    navigator.vibrate(duration);
  }

  private releaseAll(): void {
    this.stickId = -1;
    for (const [id, pointers] of this.buttonPointers) {
      pointers.clear();
      if (id !== 'pause') this.setButtonHeld(id, false);
    }
    pad.up = pad.down = pad.left = pad.right = false;
    this.stickKnob?.style && (this.stickKnob.style.left = '50%');
    this.stickKnob?.style && (this.stickKnob.style.top = '50%');
    window.clearTimeout(this.pauseTimer);
    setKeyState('Escape', false);
  }

  /** Per frame: show only where they are used, with AUTO remembering the first touch. */
  update(mode: 'auto' | 'on' | 'off', wanted: boolean): void {
    const showInGame = wanted && (mode === 'on' || (mode === 'auto' && touched));
    const nextActive = showInGame && !this.editing;
    if (this.playVisible && !nextActive) this.releaseAll();
    this.playVisible = nextActive;
    active = nextActive;
    const show = showInGame || this.editing;
    if (show !== this.shown) {
      this.shown = show;
      this.root.style.display = show ? 'block' : 'none';
      this.applyLayout();
    }
    this.stickZone.style.pointerEvents = this.editing ? 'none' : 'auto';
    this.stickBase.style.pointerEvents = this.editing ? 'auto' : 'none';
    this.root.dataset.editing = String(this.editing);
  }

  /** Opens the drag-and-scale editor over the game; changes are saved only when the player taps SAVE. */
  openEditor(): void {
    if (this.editing) return;
    this.editSnapshot = cloneLayout(normalizeTouchLayout(settings().keys.touchLayout));
    settings().keys.touchLayout = cloneLayout(this.editSnapshot);
    this.selected = 'stick';
    this.editing = true;
    this.shown = true;
    this.playVisible = false;
    active = false;
    this.releaseAll();
    this.root.style.display = 'block';
    this.editor = this.makeEditor();
    document.body.appendChild(this.editor);
    this.applyLayout();
    this.refreshEditor();
  }

  private makeEditor(): HTMLElement {
    const overlay = el('div', {
      position: 'fixed', inset: 'env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)',
      zIndex: '20', pointerEvents: 'none', userSelect: 'none', touchAction: 'none', fontFamily: 'system-ui, "Segoe UI", sans-serif',
      color: '#e9f1ff',
    });
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', tr('EDIT TOUCH CONTROLS'));

    const hint = el('div', {
      position: 'absolute', left: '50%', top: '10px', transform: 'translateX(-50%)', maxWidth: 'min(90vw, 700px)',
      padding: '9px 14px', border: '1px solid rgba(139,188,255,.42)', borderRadius: '8px',
      background: 'rgba(8,14,29,.86)', boxShadow: '0 5px 24px rgba(0,0,0,.38)', fontSize: '12px', fontWeight: '700',
      letterSpacing: '.05em', textAlign: 'center', pointerEvents: 'none',
    }, overlay);
    hint.textContent = tr('Drag each control to move it. Select a control below to resize it.');

    const panel = el('section', {
      position: 'absolute', left: '50%', top: '50px', transform: 'translateX(-50%)', width: 'min(94vw, 780px)',
      display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px', alignItems: 'end',
      padding: '10px', border: '1px solid rgba(139,188,255,.42)', borderRadius: '10px',
      background: 'linear-gradient(145deg, rgba(12,20,39,.96), rgba(17,29,53,.93))',
      boxShadow: '0 8px 30px rgba(0,0,0,.48)', pointerEvents: 'auto', boxSizing: 'border-box',
    }, overlay);

    const makeLabel = (text: string, parent: HTMLElement): HTMLElement => {
      const label = el('label', {
        minWidth: '0', display: 'flex', flexDirection: 'column', gap: '4px', color: '#99afd6', fontSize: '9px',
        fontWeight: '800', letterSpacing: '.11em', textTransform: 'uppercase',
      }, parent);
      const title = el('span', {}, label);
      title.textContent = text;
      return label;
    };
    const selectLabel = makeLabel(tr('CONTROL'), panel);
    const select = el('select', {
      width: '100%', height: '32px', border: '1px solid rgba(139,188,255,.45)', borderRadius: '6px',
      padding: '0 8px', color: '#eff5ff', background: '#111d34', font: '700 12px system-ui,sans-serif',
    }, selectLabel) as HTMLSelectElement;
    const names: [TouchControlId, string][] = [
      ['stick', tr('DIRECTION STICK')], ['punch', tr('PUNCH')], ['kick', tr('KICK')], ['special', tr('SPECIAL')], ['pause', tr('PAUSE')],
    ];
    for (const [id, name] of names) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = name;
      select.appendChild(option);
    }
    this.editorSelect = select;

    const makeRange = (title: string, min: number, max: number, step: number, parent: HTMLElement): [HTMLInputElement, HTMLElement] => {
      const label = makeLabel(title, parent);
      const row = el('div', { display: 'flex', gap: '6px', alignItems: 'center' }, label);
      const input = el('input', { flex: '1', minWidth: '0', accentColor: '#78c8ff', touchAction: 'auto' }, row) as HTMLInputElement;
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      const value = el('span', { minWidth: '36px', textAlign: 'right', color: '#e4efff', fontSize: '10px', fontVariantNumeric: 'tabular-nums' }, row);
      return [input, value];
    };
    [this.sizeInput, this.sizeValue] = makeRange(tr('SIZE'), 0.65, 1.6, 0.05, panel);
    [this.opacityInput, this.opacityValue] = makeRange(tr('OPACITY'), 25, 100, 1, panel);
    [this.deadzoneInput, this.deadzoneValue] = makeRange(tr('STICK DEAD ZONE'), 8, 40, 1, panel);

    const hapticsLabel = makeLabel(tr('HAPTIC FEEDBACK'), panel);
    const hapticsRow = el('label', {
      height: '32px', display: 'flex', alignItems: 'center', gap: '7px', padding: '0 8px', boxSizing: 'border-box',
      border: '1px solid rgba(139,188,255,.3)', borderRadius: '6px', color: '#e4efff', fontSize: '11px', letterSpacing: '0',
      textTransform: 'none',
    }, hapticsLabel);
    const haptics = el('input', { width: '16px', height: '16px', accentColor: '#65dbff' }, hapticsRow) as HTMLInputElement;
    haptics.type = 'checkbox';
    const hapticsText = el('span', {}, hapticsRow);
    hapticsText.textContent = tr('VIBRATE ON TOUCH');
    this.hapticsInput = haptics;

    const actions = el('div', {
      gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '7px', marginTop: '2px',
    }, panel);
    const makeAction = (text: string, primary: boolean, onClick: () => void): HTMLButtonElement => {
      const button = el('button', {
        minWidth: '78px', height: '34px', padding: '0 13px', border: `1px solid ${primary ? 'rgba(95,200,255,.8)' : 'rgba(147,174,217,.38)'}`,
        borderRadius: '6px', color: primary ? '#04101d' : '#dce9ff',
        background: primary ? 'linear-gradient(180deg,#a1ecff,#49beff)' : 'rgba(68,91,129,.36)',
        font: '800 10px system-ui,sans-serif', letterSpacing: '.07em', cursor: 'pointer', touchAction: 'manipulation',
      }, actions) as HTMLButtonElement;
      button.type = 'button';
      button.textContent = text;
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
      return button;
    };
    makeAction(tr('RESET'), false, () => {
      settings().keys.touchLayout = defaultTouchLayout();
      this.applyLayout();
      this.refreshEditor();
    });
    makeAction(tr('CANCEL'), false, () => this.closeEditor(false));
    makeAction(tr('SAVE'), true, () => this.closeEditor(true));

    select.addEventListener('change', () => {
      this.selected = select.value as TouchControlId;
      this.refreshEditor();
    });
    this.sizeInput.addEventListener('input', () => {
      settings().keys.touchLayout.controls[this.selected].scale = Number(this.sizeInput!.value);
      this.applyLayout();
      this.refreshEditor();
    });
    this.opacityInput.addEventListener('input', () => {
      settings().keys.touchLayout.opacity = Number(this.opacityInput!.value) / 100;
      this.applyLayout();
      this.refreshEditor();
    });
    this.deadzoneInput.addEventListener('input', () => {
      settings().keys.touchLayout.deadzone = Number(this.deadzoneInput!.value) / 100;
      this.refreshEditor();
    });
    this.hapticsInput.addEventListener('change', () => {
      settings().keys.touchLayout.haptics = this.hapticsInput!.checked;
    });

    // The panel gets a second, compact row on portrait phones and narrow split-screen windows.
    const style = el('style', {}, overlay);
    style.textContent = `@media (max-width: 620px) { .omf-touch-editor-panel { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; top: 54px !important; } }`;
    panel.classList.add('omf-touch-editor-panel');
    return overlay;
  }

  private refreshEditor(): void {
    if (!this.editorSelect || !this.sizeInput || !this.sizeValue || !this.opacityInput || !this.opacityValue || !this.deadzoneInput || !this.deadzoneValue || !this.hapticsInput) return;
    const layout = settings().keys.touchLayout;
    this.editorSelect.value = this.selected;
    const scale = layout.controls[this.selected].scale;
    this.sizeInput.value = String(scale);
    this.sizeValue.textContent = `${Math.round(scale * 100)}%`;
    this.opacityInput.value = String(Math.round(layout.opacity * 100));
    this.opacityValue.textContent = `${Math.round(layout.opacity * 100)}%`;
    this.deadzoneInput.value = String(Math.round(layout.deadzone * 100));
    this.deadzoneValue.textContent = `${Math.round(layout.deadzone * 100)}%`;
    this.hapticsInput.checked = layout.haptics;
    for (const [id, node] of this.controls) {
      const selected = this.editing && id === this.selected;
      node.style.outline = selected ? '2px solid rgba(226,244,255,.96)' : '';
      node.style.outlineOffset = selected ? '4px' : '';
    }
    this.stickBase.style.outline = this.editing && this.selected === 'stick' ? '2px solid rgba(226,244,255,.96)' : '';
    this.stickBase.style.outlineOffset = this.editing && this.selected === 'stick' ? '4px' : '';
  }

  private controlSize(id: TouchControlId): number {
    const unit = clamp(Math.min(this.root.clientWidth || window.innerWidth, this.root.clientHeight || window.innerHeight) * 0.17, 48, 90);
    const scale = settings().keys.touchLayout.controls[id].scale;
    return id === 'stick' ? unit * 1.55 * scale : (id === 'pause' ? unit * 0.76 : unit) * scale;
  }

  private beginDrag(id: TouchControlId, e: PointerEvent): void {
    if (!this.editing || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    e.stopPropagation();
    this.selected = id;
    this.dragPointer = e.pointerId;
    this.dragControl = id;
    const bounds = this.root.getBoundingClientRect();
    const pos = settings().keys.touchLayout.controls[id];
    this.dragOffset = { x: e.clientX - (bounds.left + pos.x * bounds.width), y: e.clientY - (bounds.top + pos.y * bounds.height) };
    capture(e.currentTarget as HTMLElement, e.pointerId);
    this.refreshEditor();
  }

  private dragMove(id: TouchControlId, e: PointerEvent): void {
    if (!this.editing || e.pointerId !== this.dragPointer || this.dragControl !== id) return;
    e.preventDefault();
    const bounds = this.root.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const pos = settings().keys.touchLayout.controls[id];
    const radius = this.controlSize(id) / 2 + 6;
    pos.x = clamp((e.clientX - this.dragOffset.x - bounds.left) / bounds.width, radius / bounds.width, 1 - radius / bounds.width);
    pos.y = clamp((e.clientY - this.dragOffset.y - bounds.top) / bounds.height, radius / bounds.height, 1 - radius / bounds.height);
    this.applyLayout();
  }

  private endDrag(id: TouchControlId, e: PointerEvent): void {
    if (e.pointerId !== this.dragPointer || this.dragControl !== id) return;
    this.dragPointer = -1;
    this.dragControl = null;
  }

  private applyLayout(): void {
    if (!this.root || !this.stickBase) return;
    const layout = settings().keys.touchLayout;
    const width = this.root.clientWidth || window.innerWidth || 1;
    const height = this.root.clientHeight || window.innerHeight || 1;
    const unit = clamp(Math.min(width, height) * 0.17, 48, 90);
    this.root.style.opacity = String(layout.opacity);
    for (const id of ['stick', 'punch', 'kick', 'special', 'pause'] as const) {
      const target = id === 'stick' ? this.stickBase : this.controls.get(id)!;
      const p = layout.controls[id];
      const size = id === 'stick' ? unit * 1.55 * p.scale : (id === 'pause' ? unit * 0.76 : unit) * p.scale;
      const minX = Math.min(0.49, (size / 2 + 5) / width);
      const minY = Math.min(0.49, (size / 2 + 5) / height);
      const x = clamp(p.x, minX, 1 - minX);
      const y = clamp(p.y, minY, 1 - minY);
      target.style.left = `${x * 100}%`;
      target.style.top = `${y * 100}%`;
      if (id === 'stick') {
        this.stickBase.style.width = `${size}px`;
        this.stickBase.style.height = `${size}px`;
        this.stickZone.style.left = `${x * 100}%`;
        this.stickZone.style.top = `${y * 100}%`;
        const diameter = size * 2.45;
        this.stickZone.style.width = `${diameter}px`;
        this.stickZone.style.height = `${diameter}px`;
        const knob = size * 0.39;
        this.stickKnob.style.width = `${knob}px`;
        this.stickKnob.style.height = `${knob}px`;
        const radius = size * 0.34;
        const deadzone = Math.max(10, radius * layout.deadzone);
        // The stick indicator moves only inside its visual travel, independent of the larger hit target.
        this.stickKnob.dataset.deadzone = String(deadzone);
      } else {
        target.style.width = `${size}px`;
        target.style.height = `${size}px`;
        target.style.fontSize = `${Math.max(16, size * 0.32)}px`;
        const glyph = target.querySelector('span');
        if (glyph) glyph.style.fontSize = `${Math.max(18, size * 0.34)}px`;
        const caption = target.querySelector('small');
        if (caption) caption.style.fontSize = `${Math.max(7, size * 0.105)}px`;
      }
    }
    if (this.editor) this.refreshEditor();
  }

  /** Whether the custom layout editor is currently open (Android Back closes it before touching the game). */
  isEditing(): boolean {
    return this.editing;
  }

  /** Leave the layout editor without committing the last drag or slider changes. */
  cancelEditor(): void {
    this.closeEditor(false);
  }

  /** Restore defaults after a cancel, a hidden overlay, or a native focus loss. */
  private closeEditor(save: boolean): void {
    if (!this.editing) return;
    if (save) saveSettings();
    else if (this.editSnapshot) settings().keys.touchLayout = cloneLayout(this.editSnapshot);
    this.editing = false;
    this.dragPointer = -1;
    this.dragControl = null;
    this.editor?.remove();
    this.editor = null;
    this.editSnapshot = null;
    this.editorSelect = null;
    this.sizeInput = this.opacityInput = this.deadzoneInput = null;
    this.sizeValue = this.opacityValue = this.deadzoneValue = null;
    this.hapticsInput = null;
    this.root.dataset.editing = 'false';
    this.applyLayout();
    // `update` decides whether AUTO/ON should re-enable live input on its next frame.
    active = false;
  }
}
