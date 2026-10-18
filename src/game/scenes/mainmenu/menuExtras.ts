// MAIN MENU > EXTRAS: the remaster's robot workshop, mods, replays and records, and the original's DEMO and SCOREBOARD.
import { app } from '../../../app';
import { isAndroidApp, openStudio } from '../../../platform/desktop';
import { Button, Label, Menu } from '../../gui/widgets';
import type { MainMenuScene } from '../mainmenu';
import { menuDone } from './common';
import { mainmenuDemo, mainmenuScoreboard } from './menuMain';
import { tr } from '../../../i18n/i18n';

export function menuExtrasCreate(s: MainMenuScene): Menu {
  const menu = new Menu();
  menu.attach(Label.title(tr('EXTRAS')));
  menu.attach(new Button(tr('ROBOT WORKSHOP'), tr('Build your own robots from the parts of the new robots, try them out and share them as files.'), false, false, () => app.showWorkshop()));
  menu.attach(new Button(tr('MODS'), tr('More robots, arenas and pilots: the new robots and arenas made for the remaster, and mods made by players with OMF Studio. Turn them on or off, install mod files.'), false, false, () => app.showMods()));
  if (!isAndroidApp) menu.attach(new Button(tr('OMF STUDIO'), tr('The mod tools: make your own robots, arenas and pilots, pixel for pixel, and play them in the game.'), false, false, () => void openStudio()));
  menu.attach(new Button(tr('REPLAYS'), tr('Watch your saved fights again, slow them down, step through them and save clips.'), false, false,
    () => app.showReplays()));
  menu.attach(new Button(tr('RECORDS'), tr('Your statistics, the best results of the modes, and achievements.'), false, false,
    () => app.showRecords()));
  // (both come back to this menu)
  menu.attach(new Button(tr('SCOREBOARD'), tr('The high scores of the one player game.'), false, false, () => {
    s.gs.menuReturn = 'extras';
    mainmenuScoreboard(s);
  }));
  menu.attach(new Button(tr('DEMO'), tr('Sit back and watch the computer fight the computer.'), false, false, () => {
    s.gs.menuReturn = 'extras';
    mainmenuDemo(s);
  }));
  menu.attach(new Button(tr('CREDITS'), tr('The people and projects behind the remaster, fought out: every credit pilots a robot in its own colors and wins its fight.'), false, false, () => app.showCredits()));
  menu.attach(new Button(tr('DONE'), tr('Go back to the main menu.'), false, false, menuDone));
  return menu;
}
