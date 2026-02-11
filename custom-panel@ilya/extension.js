/**
 * Panel Extension
   Использует собственную панельную систему
   Debugging:
   journalctl --user  -n 50
 */

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { PanelManager } from './panelManager.js';
import { config } from './config.js';

let panelManager = null;

export default class CustomPanelExtension extends Extension {
    enable() {
        console.log('Extension: enable()');
        panelManager = new PanelManager(config);
        panelManager.enable();
    }

    disable() {
        console.log('Extension: disable()');
        if (panelManager) {
            panelManager.disable();
            panelManager = null;
        }
    }
}
