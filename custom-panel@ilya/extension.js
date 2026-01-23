/**
 * Panel Margins Extension
 * 
 * Использует собственную панельную систему для избежания проблем
 * со сбросом стилей при Overview.
 */

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { PanelManager } = Me.imports.panelManager;

function init() {
    log('Extension: init()');
}

function enable() {
    log('Extension: enable()');
    panelManager = new PanelManager();
    panelManager.enable();
}

function disable() {
    log('Extension: disable()');
    if (panelManager) {
        panelManager.disable();
        panelManager = null;
    }
}
