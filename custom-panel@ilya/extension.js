/**
 * Panel Extension
   Использует собственную панельную систему
   Debugging:
   journalctl --user  -n 50
 */

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { PanelManager } = Me.imports.panelManager;
const { config } = Me.imports.config;

function init() {
    log('Extension: init()');
}

function enable() {
    log('Extension: enable()');
    panelManager = new PanelManager(config);
    panelManager.enable();
}

function disable() {
    log('Extension: disable()');
    if (panelManager) {
        panelManager.disable();
        panelManager = null;
    }
}
