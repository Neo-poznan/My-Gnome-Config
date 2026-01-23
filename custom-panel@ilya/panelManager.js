const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { Panel } = Me.imports.panel;
const { SystemWidgets } = Me.imports.systemWidgets;
const { Taskbar } = Me.imports.taskbar;

var PanelManager = class PanelManager {
    constructor() {
        this._marginTop = null;
        this._marginBottom = null;
        this._height = null; 
        this._panel = null;
    }

    enable() {
        log('PanelManager: enable();')

        this._originalPanelBox = Main.layoutManager.panelBox;
        this._originalPanelBoxWidth = this._originalPanelBox.width;
        this._originalPanelBoxHeight = this._originalPanelBox.height;
        this._originalMainPanelVisible = Main.panel.visible;
        this.widgets = new SystemWidgets();

        this._taskbar = new Taskbar();
        this._taskbar.createWidgets(this._panel);

        Main.panel.visible = false;
        this._panel = new Panel();

        const monitor = Main.layoutManager.primaryMonitor;
        this._originalPanelBox.set_size(monitor.width, 84);
        this._originalPanelBox.set_position(monitor.x, monitor.y);
        this._panel.applyGeometry();

            
        // Добавляем в верхний panelBox
        this._originalPanelBox.add_child(this._panel);
        this.widgets.enable(this._panel.leftBox);

        this._panel.centerBox.add_child(this._taskbar.container);

    }

    disable() {
        log('PanelManager: disable();')
        this.widgets.disable();
        if (this._panel) {
            const parent = this._panel.get_parent();
            if (parent) {
                parent.remove_child(this._panel);
            }
            this._panel.destroy();
            this._panel = null;
        }
        if (this._originalPanelBox) {
            this._originalPanelBox.set_size(this._originalPanelBoxWidth, this._originalPanelBoxHeight);
        }    
        Main.panel.visible = this._originalMainPanelVisible;
    }
}