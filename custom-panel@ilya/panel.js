const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const GObject = imports.gi.GObject;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var Panel = GObject.registerClass(
class Panel extends St.BoxLayout {
    _init() {
        super._init({
            name: 'panelCustom',
            style_class: 'panel-custom',
            reactive: true,
            can_focus: true,
            track_hover: true
        });
        
        // Три секции панели как в оригинальной
        this._leftBox = new St.BoxLayout({
            name: 'panelLeft',
            style_class: 'panel-custom-left',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER
        });
        
        this._centerBox = new St.BoxLayout({
            name: 'panelCenter', 
            style_class: 'panel-custom-center',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        
        this._rightBox = new St.BoxLayout({
            name: 'panelRight',
            style_class: 'panel-custom-right',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER
        });
        
        this.add_child(this._leftBox);
        this.add_child(this._centerBox);
        this.add_child(this._rightBox);
    }

    applyGeometry() {
        this.set_size(3000, 70);
        this.set_style(`
            background-color: rgba(60, 60, 74, 0.9); 
            margin-top: 7px; 
            margin-bottom: 7px;
            margin-left: 50px; 
            margin-right: 50px;
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