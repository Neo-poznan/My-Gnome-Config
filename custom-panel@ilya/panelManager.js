import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Panel } from './panel.js';
import { WidgetsManager } from './widgetsManager.js';

export class PanelManager {
    constructor(config) {
        this._marginTop = null;
        this._marginBottom = null;
        this._height = null; 
        this._panel = null;
        this.config = config;
    }

    enable() {
        console.log('PanelManager: enable();')
        this._originalPanelBox = Main.layoutManager.panelBox;
        this._originalPanelBoxWidth = this._originalPanelBox.width;
        this._originalPanelBoxHeight = this._originalPanelBox.height;
        this._originalMainPanelVisible = Main.panel.visible;
        
        Main.panel.visible = false;
        this._panel = new Panel(this.config);

        this._widgetsManager = new WidgetsManager(this.config);
        this._widgetsManager.addAllWidgets(this._panel);

        const monitor = Main.layoutManager.primaryMonitor;
        this._originalPanelBox.set_size(monitor.width, this.config.panelThickness + 2 * this.config.verticalMargins);
        this._originalPanelBox.set_position(monitor.x, monitor.y);
        this._panel.applyGeometry();

        // Добавляем в верхний panelBox
        this._originalPanelBox.add_child(this._panel);

    }

    disable() {
        console.log('PanelManager: disable();')
        this._widgetsManager.restoreOriginalWidgets();
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