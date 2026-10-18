import { describe, expect, it } from 'vitest';
import { setKeyState } from '../controller/input';
import { Palette } from '../formats/palette';
import { Pilot } from '../formats/pilot';
import { SceneId } from '../game/constants';
import type { GameState } from '../game/gameState';
import { CutsceneScene } from '../game/scenes/cutscene';
import type { ChrFile } from '../game/tournament/chr';
import { langGet, loadTournament } from '../resources/resources';
import { vga } from '../video/vga';
import { createGame, hasGameData, HeadlessRunner } from './harness';

function tap(run: HeadlessRunner, code = 'Enter'): void {
  setKeyState(code, true);
  run.advance(60);
  setKeyState(code, false);
  run.advance(60);
}

function pages(text: string): string[] {
  return text.split('\n').filter((s) => s.length > 0);
}

/** Minimal tournament save built from a real TRN (the CHR loader belongs to the tournament mode). */
function fakeChr(trnName: string, harId: number): ChrFile {
  const trn = loadTournament(trnName);
  const pilot = new Pilot();
  pilot.name = 'TESTER';
  pilot.harId = harId;
  pilot.rank = 1;
  for (let i = 0; i < 48; i++) pilot.palette.set(i, (i % 16) * 16, (i % 16) * 16, (i % 16) * 16);
  return {
    pilot,
    pal: new Palette(),
    unknownB: 0,
    photo: null,
    winningsMultiplier: trn.winningsMultiplier,
    enemies: trn.enemies.map((p, i) => ({ pilot: p, unknownA: new Uint8Array(0), trnIndex: i, unknownB: new Uint8Array(0) })),
    bkName: trn.bkName,
    tournamentId: trn.tournamentId,
    cutsceneText: trn.locales[0].endTexts[harId].slice(),
  };
}

function scene(gs: GameState): CutsceneScene {
  expect(gs.sc).toBeInstanceOf(CutsceneScene);
  return gs.sc as CutsceneScene;
}

describe.skipIf(!hasGameData)('cutscenes (headless)', () => {
  it('plays END -> END1 -> END2 -> scoreboard, one text page per punch', () => {
    const gs = createGame(SceneId.MENU, [3, 1], [2, 5]); // Christian
    gs.swapScene(SceneId.END);
    const run = new HeadlessRunner(gs);
    const expected: [SceneId, number, number, number][] = [
      // scene, language string, text x/y
      [SceneId.END, 992, 10, 5],
      [SceneId.END1, 993 + 3, 10, 157],
      [SceneId.END2, 1003 + 3, 10, 160],
    ];
    for (const [id, langId, x, y] of expected) {
      run.advance(700);
      expect(gs.thisId).toBe(id);
      const sc = scene(gs);
      const texts = pages(langGet(langId));
      expect(texts.length).toBeGreaterThan(0);
      expect(sc.texts).toEqual(texts);
      expect([sc.textX, sc.textY]).toEqual([x, y]);
      for (let i = 0; i < texts.length; i++) {
        expect(sc.pos).toBe(i);
        expect(sc.current.str).toBe(texts[i]);
        run.advance(200);
        tap(run);
      }
      expect(gs.nextId).toBe(sc.nextScene());
    }
    run.advance(700);
    expect(gs.thisId).toBe(SceneId.SCOREBOARD);
    expect(gs.nextNextId).toBe(SceneId.MENU);
  });

  it('END1 shows the pilot portrait and the pilot animation', () => {
    const gs = createGame(SceneId.MENU, [7, 1], [0, 5]); // Angel
    gs.swapScene(SceneId.END1);
    const ids = gs.objects.map((r) => r.obj.curAnimation?.id);
    expect(ids).toContain(3);
    expect(ids).toContain(10 + 7);
    expect(ids).toContain(1);
    const portrait = gs.objects.find((r) => r.obj.curAnimation?.id === 3)!.obj;
    expect(portrait.curSpriteId).toBe(7);
    new HeadlessRunner(gs).advance(2000);
    expect(portrait.curSpriteId).toBe(7); // halted
  });

  it('escape does not skip ending pages', () => {
    const gs = createGame(SceneId.MENU);
    gs.swapScene(SceneId.END);
    const run = new HeadlessRunner(gs);
    run.advance(700);
    tap(run, 'Escape');
    run.advance(200);
    expect(scene(gs).pos).toBe(0);
    expect(gs.nextId).toBe(SceneId.END);
  });

  it('plays the tournament victory cutscene from the CHR texts', () => {
    const gs = createGame(SceneId.MENU, [0, 1], [3, 5]);
    const chr = fakeChr('NORTH_AM.TRN', 3);
    gs.getPlayer(0).chr = chr;
    gs.getPlayer(0).pilot.harId = 3;
    gs.fightStats.winner = 0;
    gs.swapScene(SceneId.TRN_CUTSCENE);
    const sc = scene(gs);
    expect(sc.bk.file).toBe('NORTH_AM.BK');
    // Every BK animation except the other HARs' ones (10..20).
    const ids = gs.objects.map((r) => r.obj.curAnimation!.id).sort((a, b) => a - b);
    expect(ids).toEqual([0, 13, 45, 46, 47]);
    // Player colors expanded to 3 ramps of 32 shades.
    expect(vga.base.colors[31 * 3]).toBe(chr.pilot.palette.colors[15 * 3]);
    expect(vga.base.colors[1 * 3]).toBe(8);
    expect([sc.textX, sc.textY]).toEqual([10, 160]);
    const texts = chr.cutsceneText.filter((s) => s.length > 0);
    const run = new HeadlessRunner(gs);
    run.advance(500);
    for (let i = 0; i < texts.length; i++) {
      expect(sc.current.str).toBe(texts[i]);
      tap(run);
      run.advance(100);
    }
    expect(gs.nextId).toBe(SceneId.VS);
  });

  it('uses the WORLD.BK quirks and goes to the mechlab without a fight result', () => {
    const gs = createGame(SceneId.MENU, [0, 1], [0, 5]);
    const chr = fakeChr('WORLD.TRN', 0);
    gs.getPlayer(0).chr = chr;
    gs.fightStats.winner = -1;
    const before = vga.base.colors.slice();
    gs.swapScene(SceneId.TRN_CUTSCENE);
    const sc = scene(gs);
    expect(sc.textY).toBe(10);
    // No color expansion for tournament 4: palette is the BK's (plus menu colors).
    expect(vga.base.colors[31 * 3]).toBe(sc.bk.palettes[0].colors[31 * 3]);
    expect(before.length).toBe(768);
    const run = new HeadlessRunner(gs);
    run.advance(500);
    for (let i = 0; i < 10 && gs.nextId === SceneId.TRN_CUTSCENE; i++) {
      tap(run);
      run.advance(100);
    }
    expect(gs.nextId).toBe(SceneId.MECHLAB);
  });
});
