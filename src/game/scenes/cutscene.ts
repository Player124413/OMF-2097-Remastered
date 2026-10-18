// Cut scenes: the single player endings (END -> END1 -> END2 -> scoreboard) and the tournament victory cutscene
// (TRN_CUTSCENE, using the tournament's own BK). Text pages advance with punch/kick. Port of the reference cutscene.
import { addEndingPortrait } from '../../mods/portraits';
import { modPilot } from '../../mods/registry';
import { MOD_ENDING } from '../pilotWords';
import type { CtrlEvent } from '../../controller/controller';
import { Palette } from '../../formats/palette';
import { bkGetInfo, langGet } from '../../resources/resources';
import { vga } from '../../video/vga';
import { ACT_ESC, ACT_KICK, ACT_PUNCH, RENDER_LAYER_BOTTOM, RENDER_LAYER_TOP, SceneId } from '../constants';
import { registerScene, type GameState } from '../gameState';
import { FontSize, HAlign, Text } from '../gui/text';
import { GameObject } from '../object';
import { Scene } from '../scene';
import { tr } from '../../i18n/i18n';

const END_TEXT = 992;
const END1_TEXT = 993;
const END2_TEXT = 1003;

/** A mod pilot's ending (pilot.json), or the game's own words when it has none. */
function modEnding(pilotId: number, part: 0 | 1): string {
  return modPilot(pilotId)?.info.ending[part] || tr(MOD_ENDING[part]);
}

/** Splits like the reference str_split: empty pieces are dropped. */
function splitLines(s: string): string[] {
  return s.split('\n').filter((p) => p.length > 0);
}

/** BK of the tournament cutscene (reference scene_create: the CHR's bk_name, DOS-ified). */
function trnCutsceneBk(gs: GameState): string {
  const chr = gs.getPlayer(0).chr;
  if (chr && chr.bkName.length > 0) return chr.bkName.toUpperCase();
  throw new Error('Not a valid time to be going to SCENE_TRN_CUTSCENE');
}

/**
 * Expands player 1's three 16-shade HAR color ramps into three 32-shade ramps (indices 1..95) for the tournament
 * cutscene artwork (reference palette_set_player_expanded_color; float math kept in single precision).
 */
export function paletteSetPlayerExpandedColor(src: Palette): void {
  const f = Math.fround;
  const tmp = new Palette();
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 32; i++) {
      const position = f(f(i * 15.0) / 31.0);
      const lowerIndex = Math.trunc(position);
      const t = f(position - lowerIndex);
      const upperIndex = Math.min(lowerIndex + 1, 15);
      const lower = (lowerIndex + j * 16) * 3;
      const upper = (upperIndex + j * 16) * 3;
      for (let k = 0; k < 3; k++) {
        const v = f(f(f(f(1.0 - t) * src.colors[lower + k]) + f(t * src.colors[upper + k])) + 0.5);
        tmp.colors[(i + j * 32) * 3 + k] = Math.trunc(v) & 0xff;
      }
    }
  }
  // 3 shades of 32 colors, skipping palette index 0
  vga.setBasePaletteRange(tmp, 1, 1, 3 * 32 - 1);
}

export class CutsceneScene extends Scene {
  texts: string[] = [];
  current: Text;
  pos = 0;
  textX = 0;
  textY = 0;

  constructor(gs: GameState, id: SceneId) {
    super(gs, id, id === SceneId.TRN_CUTSCENE ? trnCutsceneBk(gs) : undefined);
    this.current = new Text(FontSize.SMALL, 300, 200).setHAlign(HAlign.CENTER);
    const p1 = gs.getPlayer(0);
    let text = '';
    switch (id) {
      case SceneId.END:
        gs.playMusic('END.PSM');
        text = langGet(END_TEXT);
        this.textX = 10;
        this.textY = 5;
        this.current.setColor(0xf8);
        break;
      case SceneId.END1: {
        text = modPilot(p1.pilot.pilotId) ? modEnding(p1.pilot.pilotId, 0) : langGet(END1_TEXT + p1.pilot.pilotId);
        this.textX = 10;
        this.textY = 157;
        this.current.setColor(0xfd);
        // Pilot portrait (one frame per pilot) ...
        const portrait = bkGetInfo(this.bk, 3);
        if (portrait) {
          // (a mod pilot's own, in the ending's colors)
          addEndingPortrait(portrait.ani, p1.pilot.pilotId, this.bk.palettes[0]);
          const obj = new GameObject(gs, 0, 0);
          obj.setAnimation(portrait.ani);
          obj.selectSprite(p1.pilot.pilotId);
          obj.setHalt(1);
          gs.addObject(obj, RENDER_LAYER_TOP, false, false);
        }
        // ... and the pilot's own animation.
        const anim = bkGetInfo(this.bk, 10 + p1.pilot.pilotId);
        if (anim) {
          const obj = new GameObject(gs, 0, 0);
          obj.setAnimation(anim.ani);
          gs.addObject(obj, RENDER_LAYER_TOP, false, false);
        }
        break;
      }
      case SceneId.END2:
        text = modPilot(p1.pilot.pilotId) ? modEnding(p1.pilot.pilotId, 1) : langGet(END2_TEXT + p1.pilot.pilotId);
        this.textX = 10;
        this.textY = 160;
        this.current.setColor(0xf8);
        break;
      case SceneId.TRN_CUTSCENE: {
        const chr = p1.chr!;
        if (chr.tournamentId !== 4) paletteSetPlayerExpandedColor(chr.pilot.palette);
        gs.playMusic('END.PSM');
        for (let i = 0; i < 256; i++) {
          // Only the animation of the player's own HAR out of the per-HAR ones (10..20).
          if (i >= 10 && i <= 20 && i !== 10 + p1.pilot.harId) continue;
          const bki = bkGetInfo(this.bk, i);
          if (bki) {
            const obj = new GameObject(gs, 0, 0);
            obj.soundTranslationTable = this.bk.soundTranslationTable;
            obj.setAnimation(bki.ani);
            gs.addObject(obj, RENDER_LAYER_TOP, false, false);
          }
        }
        this.textX = 10;
        this.textY = 160;
        this.current.setColor(0xf8);
        break;
      }
    }
    if (p1.chr && p1.chr.tournamentId === 4) this.textY = 10;
    if (p1.chr) {
      this.pos = 0;
      this.current.set(p1.chr.cutsceneText[this.pos] ?? '');
    } else {
      this.texts = splitLines(text);
      this.pos = 0;
      this.current.set(this.texts[this.pos] ?? '');
    }
  }

  /** Scene that follows this one. */
  nextScene(): SceneId {
    const player1 = this.gs.getPlayer(0);
    switch (this.id) {
      case SceneId.END:
        return SceneId.END1;
      case SceneId.END1:
        return SceneId.END2;
      case SceneId.END2:
        return SceneId.SCOREBOARD;
      case SceneId.TRN_CUTSCENE:
        if (player1.chr && this.gs.fightStats.winner !== -1) return SceneId.VS;
        return SceneId.MECHLAB;
      default:
        return SceneId.NONE;
    }
  }

  override startup(id: number): [boolean, boolean] {
    if (this.id === SceneId.END || this.id === SceneId.END1) {
      if (id === 1) return [true, false];
    } else if (this.id === SceneId.END2 && (id === 1 || id === 11)) {
      return [true, false];
    }
    return [false, false];
  }

  override inputPoll(): void {
    const gs = this.gs;
    const player1 = gs.getPlayer(0);
    const ev: CtrlEvent[] = [];
    gs.menuPoll(ev);
    for (const e of ev) {
      if (e.type !== 'action') continue;
      if (e.action === ACT_ESC) {
        // The single-player ending spans END, END1 and END2; skip all of it, not just the current text page.
        gs.setNext(this.id === SceneId.END || this.id === SceneId.END1 || this.id === SceneId.END2
          ? SceneId.SCOREBOARD
          : this.nextScene());
        continue;
      }
      if (e.action !== ACT_KICK && e.action !== ACT_PUNCH) continue;
      if (player1.chr && (player1.chr.cutsceneText[this.pos + 1] ?? '').length > 0) {
        this.pos++;
        this.current.set(player1.chr.cutsceneText[this.pos]);
      } else if (!player1.chr && this.pos < this.texts.length - 1) {
        this.pos++;
        this.current.set(this.texts[this.pos]);
      } else {
        gs.setNext(this.nextScene());
      }
    }
  }

  override renderOverlay(): void {
    this.current.draw(this.textX, this.textY);
  }

  /** Random ambient animations (BK entries with a spawn probability). */
  private spawnRandom(): void {
    const gs = this.gs;
    for (const info of this.bk.infos.values()) {
      if (info.probability > 1) {
        if (gs.rand.int(info.probability) !== 1) continue;
        const obj = new GameObject(gs, info.ani.startX, info.ani.startY);
        obj.soundTranslationTable = this.bk.soundTranslationTable;
        obj.setAnimation(info.ani);
        if (!gs.addObject(obj, RENDER_LAYER_BOTTOM, true, false)) obj.free();
      }
    }
  }

  override dynamicTick(_paused: boolean): void {
    this.spawnRandom();
  }
}

for (const id of [SceneId.END, SceneId.END1, SceneId.END2, SceneId.TRN_CUTSCENE]) {
  registerScene(id, (gs) => new CutsceneScene(gs, id));
}
