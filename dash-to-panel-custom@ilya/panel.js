/**
 * Panel - собственная панель, которая заменяет стандартную Main.panel
 * 
 * В отличие от dash-to-panel, мы поддерживаем независимые отступы:
 * - panelBox.height = thickness + marginTop + marginBottom (для struts)
 * - Визуальная панель позиционируется внутри panelBox с нужными отступами
 */

const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const GObject = imports.gi.GObject;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var Panel = GObject.registerClass(
class Panel extends St.BoxLayout {
    _init(settings) {
        super._init({
            name: 'panelCustom',
            style_class: 'panel-custom',
            reactive: true,
            can_focus: true,
            track_hover: true
        });
        
        this._settings = settings;
        
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
    
    get leftBox() {
        return this._leftBox;
    }
    
    get centerBox() {
        return this._centerBox;
    }
    
    get rightBox() {
        return this._rightBox;
    }
    
    /**
     * Применяет геометрию панели
     * @param {Object} geom - объект с полями: thickness, marginTop, panelWidth, screenWidth, position
     */
    applyGeometry(geom) {
        const { thickness, marginTop, panelWidth, screenWidth, position } = geom;
        
        // Устанавливаем размер панели
        this.set_size(panelWidth, thickness);
        
        // Позиционируем панель по центру и с нужным отступом
        const horizontalOffset = (screenWidth - panelWidth) / 2;
        
        if (position === 'bottom') {
            // Для нижней панели отступ снизу
            this.set_style(`margin-left: ${horizontalOffset}px; margin-top: ${marginTop}px;`);
        } else {
            // Для верхней панели отступ сверху
            this.set_style(`margin-left: ${horizontalOffset}px; margin-top: ${marginTop}px;`);
        }
        
        // Применяем цвет и прозрачность
        this._applyColor();
        
        // Применяем padding для left и right box
        const leftPadding = this._settings.get_int('left-box-padding');
        const rightPadding = this._settings.get_int('right-box-padding');
        
        this._leftBox.set_style(`padding-left: ${leftPadding}px;`);
        this._rightBox.set_style(`padding-right: ${rightPadding}px;`);
    }
    
    /**
     * Применяет цвет и прозрачность панели
     */
    _applyColor() {
        const colorHex = this._settings.get_string('panel-color');
        const alpha = this._settings.get_int('panel-alpha') / 100;
        const borderRadius = this._settings.get_int('panel-border-radius');
        
        // Преобразуем hex в rgba
        const r = parseInt(colorHex.slice(1, 3), 16);
        const g = parseInt(colorHex.slice(3, 5), 16);
        const b = parseInt(colorHex.slice(5, 7), 16);
        
        const currentStyle = this.get_style() || '';
        const bgStyle = `background-color: rgba(${r}, ${g}, ${b}, ${alpha});`;
        const radiusStyle = `border-radius: ${borderRadius}px;`;
        
        // Удаляем старые стили и добавляем новые
        let newStyle = currentStyle
            .replace(/background-color:[^;]+;/g, '')
            .replace(/border-radius:[^;]+;/g, '');
        newStyle += bgStyle + radiusStyle;
        
        this.set_style(newStyle);
    }
    
    /**
     * Возвращает размер иконок на основе толщины панели
     */
    getIconSize() {
        const thickness = this._settings.get_int('panel-thickness');
        return Math.max(16, thickness - 16);
    }
});
