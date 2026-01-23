/**
 * DistroIcon - декоративная иконка дистрибутива на панели
 * 
 * Чисто декоративный элемент без интерактивности.
 * Поддерживает настройку позиции и видимости.
 * Размер автоматически подстраивается под высоту панели.
 */

const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

var DistroIcon = class DistroIcon {
    constructor() {
        this._panel = null;
        this._settings = null;
        this._container = null;
        this._icon = null;
        this._settingsChangedId = null;
    }
    
    /**
     * Геттер для контейнера
     */
    get container() {
        return this._container;
    }
    
    /**
     * Создаёт виджет без добавления на панель
     * (позиционирование управляется через WidgetPositioner)
     * @param {Panel} panel - наша кастомная панель
     */
    createWidget(panel) {
        this._panel = panel;
        this._settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.panel-margins');
        
        // Создаём контейнер для иконки
        this._container = new St.Bin({
            style_class: 'distro-icon-container',
            reactive: false,  // Не реагирует на клики
            can_focus: false,
            track_hover: false,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER
        });
        
        // Загружаем иконку
        const iconPath = GLib.build_filenamev([Me.path, 'debian-logo.png']);
        const iconFile = Gio.File.new_for_path(iconPath);
        
        if (iconFile.query_exists(null)) {
            const gicon = Gio.icon_new_for_string(iconPath);
            
            // Размер иконки = высота панели - отступы
            const iconSize = this._panel.panelHeight - 8;
            
            this._icon = new St.Icon({
                gicon: gicon,
                icon_size: iconSize,
                style_class: 'distro-icon'
            });
            
            this._container.set_child(this._icon);
        } else {
            log(`[Custom Panel] Distro icon not found: ${iconPath}`);
        }
    }
    
    /**
     * @deprecated Используйте createWidget() + WidgetPositioner
     * Включает иконку и добавляет её на панель
     * @param {Panel} panel - наша кастомная панель
     */
    enable(panel) {
        this.createWidget(panel);
        
        // Слушаем изменения настроек (для обратной совместимости)
        this._settingsChangedId = this._settings.connect('changed', (settings, key) => {
            if (key === 'distro-icon-position' || key === 'hide-distro-icon' || key === 'distro-icon-priority') {
                this._updatePosition();
            }
        });
        
        this._updatePosition();
    }
    
    /**
     * Отключает и удаляет иконку
     */
    disable() {
        if (this._settingsChangedId && this._settings) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        
        if (this._container) {
            const parent = this._container.get_parent();
            if (parent) {
                parent.remove_child(this._container);
            }
            this._container.destroy();
            this._container = null;
        }
        
        this._icon = null;
        this._panel = null;
        this._settings = null;
    }
    
    /**
     * Обновляет позицию иконки на панели
     */
    _updatePosition() {
        if (!this._container || !this._panel || !this._settings) return;
        
        // Удаляем из текущего родителя
        const currentParent = this._container.get_parent();
        if (currentParent) {
            currentParent.remove_child(this._container);
        }
        
        // Проверяем видимость
        if (this._settings.get_boolean('hide-distro-icon')) {
            return;
        }
        
        // Получаем позицию
        const position = this._settings.get_string('distro-icon-position');
        const box = this._getBoxForPosition(position);
        
        // Получаем приоритет и вставляем в нужное место
        const priority = this._settings.get_int('distro-icon-priority');
        
        // Простая вставка - в начало блока для низкого приоритета
        // Для полной поддержки приоритетов нужна координация с другими виджетами
        if (priority <= 2) {
            box.insert_child_at_index(this._container, 0);
        } else {
            box.add_child(this._container);
        }
    }
    
    /**
     * Возвращает box для указанной позиции
     */
    _getBoxForPosition(position) {
        switch (position) {
            case 'center':
                return this._panel.centerBox;
            case 'right':
                return this._panel.rightBox;
            default:
                return this._panel.leftBox;
        }
    }
    
    /**
     * Обновляет размер иконки (вызывается при изменении размера панели)
     */
    updateSize(panelHeight) {
        if (this._icon) {
            const iconSize = panelHeight - 8;
            this._icon.set_icon_size(iconSize);
        }
    }
};