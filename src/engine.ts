// Main loop: fixed-rate static (100 Hz) and dynamic (game-speed) ticks; the host may cap expensive frame rendering.
import type { GameState } from './game/gameState';
import { drawList } from './video/draw';
import { vga } from './video/vga';
import { STATIC_TICKS } from './game/constants';

const MAX_TICKS_PER_FRAME = 10;
const TICK_EXPIRY_MS = 100;
/**
 * A hidden window's game catches up in steps of a frame, at most this much at a time (ms): the browser may run its
 * timers only once a second then (WebKit, and Chromium's background throttling).
 */
const IDLE_STEP_MS = 16;
const IDLE_CATCH_UP_MS = 1000;

export interface FrameRenderer {
  render(gs: GameState, alpha: number): void;
}

export class Engine {
  private staticWait = 0;
  private dynamicWait = 0;
  private last = 0;
  private running = false;
  private raf = 0;
  private renderElapsed = 0;
  /** Fraction of the next dynamic tick already elapsed (for motion interpolation). */
  alpha = 0;
  paused = false;
  /** The game waits while a scene's remastered artwork loads (see main.ts): its clock stands still meanwhile. */
  waiting = false;
  /** Draw objects between game ticks (smooth motion on high refresh rate displays). */
  interpolate = false;
  /** Optional render cap; simulation ticks continue at their normal fixed rates between rendered frames. */
  maxRenderFps = 0;
  frames = 0;
  ticks = 0;
  /** Frames that threw (logged, the loop keeps running). */
  errors = 0;

  constructor(public gs: GameState, public renderer: FrameRenderer) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.renderElapsed = 0;
    const loop = (now: number) => {
      if (!this.running) return;
      // Schedule the next frame first: an exception in this one must not stop the game loop.
      this.raf = requestAnimationFrame(loop);
      try {
        const dt = Math.max(0, now - this.last);
        this.last = now;
        if (!this.paused && !this.waiting) this.advance(dt);
        const interval = this.maxRenderFps > 0 ? 1000 / this.maxRenderFps : 0;
        if (interval > 0) {
          // Keep the simulation/input/audio clocks moving on every browser frame, but only repaint the expensive scene
          // when its render-time accumulator reaches the cap. Carry the remainder so 90/144 Hz displays average 60 Hz
          // instead of dropping to 45/48 Hz through a simple elapsed-time comparison.
          this.renderElapsed += dt;
          if (this.renderElapsed + 0.5 < interval) return;
          this.renderElapsed -= interval;
          if (this.renderElapsed < 0) this.renderElapsed = 0;
          else if (this.renderElapsed >= interval) this.renderElapsed %= interval;
        }
        this.renderCurrentFrame();
      } catch (err) {
        this.errors++;
        if (this.errors <= 5) console.error('[engine] frame failed:', err);
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Runs the simulation for `ms` milliseconds of game time (also used by tests / hidden-tab stepping). */
  advance(ms: number): void {
    const gs = this.gs;
    this.staticWait = Math.min(this.staticWait + ms, TICK_EXPIRY_MS);
    // (a tick can last longer than that: a replay played slowly, a knockout's slow motion in it)
    this.dynamicWait = Math.min(this.dynamicWait + ms, Math.max(TICK_EXPIRY_MS, 2 * gs.msPerDyntick()));
    let limit = MAX_TICKS_PER_FRAME;
    let hasStatic: boolean;
    let hasDynamic: boolean;
    do {
      const dynMs = gs.msPerDyntick();
      hasStatic = this.staticWait > STATIC_TICKS;
      if (hasStatic) {
        gs.staticTick();
        this.staticWait -= STATIC_TICKS;
      }
      // (a network game waits here for the other game's inputs)
      hasDynamic = this.dynamicWait > dynMs && gs.dynamicTickReady();
      if (hasDynamic) {
        gs.dynamicTick();
        this.dynamicWait -= dynMs;
        this.ticks++;
      }
      if (hasStatic || hasDynamic) {
        gs.paletteTransform();
        vga.render();
      }
    } while (limit-- && (hasStatic || hasDynamic));
    this.alpha = Math.max(0, Math.min(1, this.dynamicWait / Math.max(1, gs.msPerDyntick())));
  }

  /**
   * Runs the game up to now without drawing: a network game goes on while the window is hidden (the other player would
   * wait for it). Nothing is drawn, so nothing waits for a scene's artwork either.
   */
  idle(now: number): void {
    let dt = Math.min(now - this.last, IDLE_CATCH_UP_MS);
    this.last = now;
    this.waiting = false;
    if (this.paused) return;
    for (; dt > 0; dt -= IDLE_STEP_MS) this.advance(Math.min(dt, IDLE_STEP_MS));
  }

  frame(now: number): void {
    const dt = now - this.last;
    this.last = now;
    this.renderElapsed = 0;
    if (!this.paused && !this.waiting) this.advance(dt);
    this.renderCurrentFrame();
  }

  private renderCurrentFrame(): void {
    drawList.begin();
    drawList.interpAlpha = this.interpolate ? this.alpha : -1;
    this.gs.render();
    this.renderer.render(this.gs, this.alpha);
    this.frames++;
  }
}
