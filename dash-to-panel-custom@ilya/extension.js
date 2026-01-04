/**
 * Panel Margins Extension
 * 
 * Использует собственную панельную систему для избежания проблем
 * со сбросом стилей при Overview.
 */

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { PanelManager } = Me.imports.panelManager;

let panelManager = null;

function init() {
    log('Panel Margins: init()');
}

function enable() {
    log('Panel Margins: enable()');
    
    panelManager = new PanelManager();
    panelManager.enable();
    
    log('Panel Margins: enabled successfully');
}

function disable() {
    log('Panel Margins: disable()');
    
    if (panelManager) {
        panelManager.disable();
        panelManager = null;
    }
    
    log('Panel Margins: disabled');
}
