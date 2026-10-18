// Hooks the game logic uses to talk to the host application (renderer, window, persistence).
import type { GraphicsMode } from './game/settings';

export const app = {
  setGraphicsMode(_mode: GraphicsMode): void {},
  getGraphicsMode(): GraphicsMode {
    return 'remastered';
  },
  toggleFullscreen(): void {},
  quit(): void {},
  /** Shows the controls screen (keyboard and controller layouts) over the game. */
  showControls(): void {},
  /** Opens the on-screen control editor (move/scale each control, adjust stick feel and haptics). */
  editTouchControls(): void {},
  /** Exports the replay being watched (its clip marks, or all of it) as a video or an animated GIF. */
  exportReplay(_kind: 'video' | 'gif'): void {},
  /** Stops saving a replay clip (nothing is saved). */
  cancelExport(): void {},
  /** Shows the list of saved fights. */
  showReplays(): void {},
  /** Shows how an arcade, survival or time attack run went (once the main menu is back). */
  showRunResults(_result: import('./game/modes/run').RunResult): void {},
  /** Shows the player's records and achievements. */
  showRecords(): void {},
  /** Shows the robot workshop (once the main menu is back, when called during a fight). */
  showWorkshop(): void {},
  /** Shows the custom tournaments. */
  showTournaments(): void {},
  /** Shows the remaster's credits. */
  showCredits(): void {},
  /** Shows the installed mods. */
  showMods(): void {},
  /** Shows the LAN games page: hosting a network game, finding and joining one. */
  showLan(): void {},
  /** Shows the language page (every language the game speaks, and AUTOMATIC). */
  showLanguage(): void {},
  /** Notified whenever settings change so the host can apply them. */
  settingsChanged(): void {},
};
