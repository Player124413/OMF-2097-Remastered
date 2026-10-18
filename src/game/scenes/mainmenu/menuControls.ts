// OPTIONS > CONTROLS: the input entries of the reference's configuration menu (mainmenu/menu_configuration.c: PLAYER 1
// INPUT, PLAYER 2 INPUT) and the remaster's (the controls screen with the key layouts, the special button, the finisher
// keys, rumble and the touch pad).
import { app } from '../../../app';
import { Button, Label, Menu, TextSelector } from '../../gui/widgets';
import { settings } from '../../settings';
import type { MainMenuScene } from '../mainmenu';
import { menuDone, menuLinkMenu, parentMenu, settingsChanged } from './common';
import { KEYBOARD_FRAME } from './menuKeyboard';
import { menuInputCreate } from './menuInput';
import { menuFinisherKeysCreate } from './menuFinisherKeys';
import { tr } from '../../../i18n/i18n';

export function menuControlsCreate(s: MainMenuScene): Menu {
  const menu = new Menu();
  menu.attach(Label.title(tr('CONTROLS')));
  menu.attach(new Button(tr('PLAYER 1 INPUT'), tr('Choose the control for player 1: keyboard or joystick.'), false, false,
    (b) => parentMenu(b).setSubmenu(menuInputCreate(s, 1))));
  menu.attach(new Button(tr('PLAYER 2 INPUT'), tr('Choose the control for player 2: keyboard or joystick.'), false, false,
    (b) => parentMenu(b).setSubmenu(menuInputCreate(s, 2))));
  menu.attach(new Button(tr('KEYS AND BUTTONS'),
    tr('See the keys and controller buttons of both players, and switch between the classic and a modern keyboard layout (WASD) or the controller button layouts.'),
    false, false, () => app.showControls()));
  menu.attach(new TextSelector(tr('SPECIAL BUTTON'), tr('Special moves in one press: the special button with no direction, forward, back, down or up does the first to fifth special of the robot (the move list shows them). The original inputs still work.'),
  () => (settings().keys.specialButton ? 1 : 0), (pos) => (settings().keys.specialButton = pos === 1), [tr('OFF'), tr('ON')], settingsChanged));
  menu.attach(new Button(tr('FINISHER KEYS'), tr('Finishing moves in one press, once a fight is won: turn them on and choose their keys.'), false, false,
    // (the keys' rows are the custom keyboard setup's: its wider frame)
    (b) => menuLinkMenu(parentMenu(b), menuFinisherKeysCreate(s), KEYBOARD_FRAME.x, KEYBOARD_FRAME.y, KEYBOARD_FRAME.w, KEYBOARD_FRAME.h)));
  menu.attach(new TextSelector(tr('RUMBLE'), tr('Gamepad vibration when robots are hit, blocked, thrown or slammed into walls.'),
    () => (settings().keys.rumble ? 1 : 0), (pos) => (settings().keys.rumble = pos === 1), [tr('OFF'), tr('ON')], settingsChanged));
  const touchModes = ['auto', 'on', 'off'] as const;
  menu.attach(new TextSelector(tr('TOUCH PAD'), tr('On-screen stick and buttons for phones and tablets: AUTO shows them once the screen is touched.'), () => touchModes.indexOf(settings().keys.touch), (pos) => (settings().keys.touch = touchModes[pos]),
  [tr('AUTO'), tr('ON'), tr('OFF')], settingsChanged));
  menu.attach(new Button(tr('EDIT TOUCH CONTROLS'), tr('Move and resize every on-screen control, adjust stick sensitivity, opacity and vibration.'), false, false,
    () => app.editTouchControls()));
  menu.attach(new Button(tr('DONE'), tr('Go back to the options.'), false, false, menuDone));
  return menu;
}
