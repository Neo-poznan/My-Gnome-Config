import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const Panel = GObject.registerClass(
class Panel extends St.BoxLayout {
    _init(config) {
        super._init({
            name: 'panelCustom',
            style_class: 'panel-custom',
            reactive: true,
            can_focus: true,
            track_hover: true
        });

        this.config = config;
        const monitor = Main.layoutManager.primaryMonitor;
        const screenWidth = monitor.width;
        const panelWidth = screenWidth - 2 * this.config.horizontalMargins;
        const leftBoxMargin = panelWidth * this.config.leftBoxMarginPercent;
        const rightBoxMargin = panelWidth * this.config.rightBoxMarginPercent;
        // Три секции панели как в оригинальной
        this._leftBox = new St.BoxLayout({
            name: 'panelLeft',
            style_class: 'panel-custom-left',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        
        this._centerBox = new St.BoxLayout({
            name: 'panelCenter',
            style_class: 'panel-custom-center',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
        });
        
        this._rightBox = new St.BoxLayout({
            name: 'panelRight',
            style_class: 'panel-custom-right',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });
        
        this.add_child(this._leftBox);
        this.add_child(this._centerBox);
        this.add_child(this._rightBox);

        this._leftBox.set_style(`margin-right: ${leftBoxMargin}px; margin-left: 15px;`);
        this._rightBox.set_style(`margin-left: ${rightBoxMargin}px; margin-right: 15px;`);
    }

    applyGeometry() {
        console.log('Config:', JSON.stringify(this.config, null, 2));
        const monitor = Main.layoutManager.primaryMonitor;
        const screenWidth = monitor.width;
        const thickness = this.config.panelThickness;
        const verticalMargins = this.config.verticalMargins;
        const horizontalMargins = this.config.horizontalMargins;
        console.log('screenWidth:', screenWidth, 'thickness:', thickness, 'verticalMargins:', verticalMargins, 'horizontalMargins:', horizontalMargins);
        this.set_size(screenWidth - 2 * horizontalMargins, thickness);
        this.set_style(`
            background-color: rgba(60, 60, 74, 0.9); 
            margin-top: ${verticalMargins}px; 
            margin-bottom: ${verticalMargins}px;
            margin-left: ${horizontalMargins}px;
            margin-right: ${horizontalMargins}px;
            border-radius: 17px;
        `);
    }
    
    get leftBox() {
        return this._leftBox;
    }
    
    get centerBox() {
        return this._centerBox;
    }
    
    get rightBox() {
        return this._rightBox;
    }

});