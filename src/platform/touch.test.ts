import { describe, expect, it } from 'vitest';
import { defaultTouchLayout, normalizeTouchLayout } from '../game/settings';
import { touchDirections } from './touch';

const label = (x: number, y: number, deadzone = 0) => {
  const d = touchDirections(x, y, deadzone);
  return `${d.up ? 'U' : ''}${d.down ? 'D' : ''}${d.left ? 'L' : ''}${d.right ? 'R' : ''}`;
};

describe('mobile virtual stick', () => {
  it('maps all eight sectors to the game directions', () => {
    expect(label(100, 0)).toBe('R');
    expect(label(100, 100)).toBe('DR');
    expect(label(0, 100)).toBe('D');
    expect(label(-100, 100)).toBe('DL');
    expect(label(-100, 0)).toBe('L');
    expect(label(-100, -100)).toBe('UL');
    expect(label(0, -100)).toBe('U');
    expect(label(100, -100)).toBe('UR');
  });

  it('keeps the neutral zone centered and reports no directions inside it', () => {
    expect(label(0, 0, 12)).toBe('');
    expect(label(8, 8, 12)).toBe('');
    expect(label(13, 0, 12)).toBe('R');
  });
});

describe('editable touch layout', () => {
  it('returns independent layouts for new settings', () => {
    const a = defaultTouchLayout();
    const b = defaultTouchLayout();
    a.controls.punch.x = 0.3;
    expect(b.controls.punch.x).not.toBe(0.3);
  });

  it('fills partial saved layouts and clamps invalid coordinates and sizes', () => {
    const layout = normalizeTouchLayout({
      opacity: 4,
      deadzone: -1,
      haptics: false,
      controls: {
        stick: { x: -10, y: 4, scale: 12 },
        punch: { x: Number.NaN, y: Number.POSITIVE_INFINITY, scale: 0.01 },
      },
    });
    expect(layout.opacity).toBe(1);
    expect(layout.deadzone).toBe(0.08);
    expect(layout.haptics).toBe(false);
    expect(layout.controls.stick).toEqual({ x: 0.04, y: 0.95, scale: 1.6 });
    expect(layout.controls.punch).toEqual({ x: 0.81, y: 0.79, scale: 0.65 });
    expect(layout.controls.kick).toEqual(defaultTouchLayout().controls.kick);
  });
});
