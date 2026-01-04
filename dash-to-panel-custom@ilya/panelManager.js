/**
 * PanelManager - управляет жизненным циклом панели и её геометрией
 * 
 * Ключевое отличие от dash-to-panel:
 * - Поддержка независимых отступов (marginTop, marginBottom)
 * - panelBox.height = thickness + marginTop + marginBottom
 * - Визуальная панель позиционируется с отступом marginTop от верха panelBox
 */

const Main = imports.ui.main;
const Meta = imports.gi.Meta;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { Panel } = Me.imports.panel;
const { Taskbar } = Me.imports.taskbar;
const { SystemIndicators } = Me.imports.systemIndicators;
const { DistroIcon } = Me.imports.distroIcon;

var PanelManager = class PanelManager {
    constructor() {
        this._settings = null;
        this._panel = null;
        this._taskbar = null;
        this._systemIndicators = null;
        this._distroIcon = null;
        
        // Для панели снизу - отдельный контейнер
        this._bottomPanelBox = null;
        
        // Оригинальные состояния для восстановления
        this._originalPanelBox = null;
        this._originalPanelBoxWidth = null;
        this._originalPanelBoxHeight = null;
        this._originalPanelBoxX = null;
        this._originalPanelBoxY = null;
        this._originalMainPanelVisible = null;
        this._originalDashVisible = null;
        this._originalDashHeight = null;
        
        // ID сигналов
        this._settingsChangedId = null;
        this._monitorsChangedId = null;
        this._sessionModeChangedId = null;
    }
    
    enable() {
        log('PanelManager: enable()');
        
        // Получаем настройки
        this._settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.panel-margins');
        
        // Сохраняем оригинальные состояния
        this._originalPanelBox = Main.layoutManager.panelBox;
        this._originalPanelBoxWidth = this._originalPanelBox.width;
        this._originalPanelBoxHeight = this._originalPanelBox.height;
        this._originalPanelBoxX = this._originalPanelBox.x;
        this._originalPanelBoxY = this._originalPanelBox.y;
        this._originalMainPanelVisible = Main.panel.visible;
        
        // Скрываем оригинальную панель
        Main.panel.visible = false;
        
        // Скрываем dash в Overview
        this._hideDash();
        
        // Создаём нашу панель
        this._panel = new Panel(this._settings);
        
        // Определяем позицию и добавляем панель
        this._setupPanelPosition();
        
        // Создаём и включаем таскбар
        this._taskbar = new Taskbar();
        this._taskbar.enable(this._panel);
        
        // Переносим системные элементы (дата, системное меню, раскладка)
        this._systemIndicators = new SystemIndicators();
        this._systemIndicators.enable(this._panel);
        
        // Добавляем иконку дистрибутива
        this._distroIcon = new DistroIcon();
        this._distroIcon.enable(this._panel);
        
        // Применяем геометрию
        this._applyGeometry();
        
        // Слушаем изменения настроек
        this._settingsChangedId = this._settings.connect('changed', (settings, key) => {
            if (key === 'panel-position') {
                // Перестраиваем позицию панели
                this._setupPanelPosition();
            }
            this._applyGeometry();
        });
        
        // Слушаем изменения конфигурации мониторов
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            log('PanelManager: monitors changed, recalculating geometry');
            this._applyGeometry();
        });
        
        // Слушаем смену режима сессии (для скрытия на экране блокировки)
        this._sessionModeChangedId = Main.sessionMode.connect('updated', () => {
            this._onSessionModeChanged();
        });
        
        // Проверяем начальное состояние сессии
        this._onSessionModeChanged();
        
        log('PanelManager: enabled successfully');
    }
    
    /**
     * Обрабатывает смену режима сессии (user, unlock-dialog, lock-screen)
     */
    _onSessionModeChanged() {
        if (!this._panel) return;
        
        const dominated = Main.sessionMode.currentMode === 'unlock-dialog' ||
                         Main.sessionMode.currentMode === 'lock-screen' ||
                         Main.sessionMode.currentMode === 'gdm';
        
        if (dominated) {
            // Скрываем панель на экране блокировки
            this._panel.hide();
            if (this._bottomPanelBox) {
                this._bottomPanelBox.hide();
            }
        } else {
            // Показываем панель
            this._panel.show();
            if (this._bottomPanelBox) {
                this._bottomPanelBox.show();
            }
        }
    }
    
    /**
     * Настраивает позицию панели (top или bottom)
     */
    _setupPanelPosition() {
        const position = this._settings.get_string('panel-position');
        
        // Удаляем панель из текущего родителя
        const currentParent = this._panel.get_parent();
        if (currentParent) {
            currentParent.remove_child(this._panel);
        }
        
        if (position === 'bottom') {
            // Создаём контейнер для нижней панели если его нет
            if (!this._bottomPanelBox) {
                this._bottomPanelBox = new imports.gi.St.BoxLayout({
                    name: 'bottomPanelBox',
                    vertical: true
                });
                Main.layoutManager.addChrome(this._bottomPanelBox, {
                    affectsStruts: true,
                    trackFullscreen: true
                });
            }
            
            this._bottomPanelBox.add_child(this._panel);
            
            // Скрываем верхний panelBox
            this._originalPanelBox.set_size(0, 0);
        } else {
            // Удаляем нижний контейнер если есть
            if (this._bottomPanelBox) {
                Main.layoutManager.removeChrome(this._bottomPanelBox);
                this._bottomPanelBox.destroy();
                this._bottomPanelBox = null;
            }
            
            // Добавляем в верхний panelBox
            this._originalPanelBox.add_child(this._panel);
        }
    }
    
    disable() {
        log('PanelManager: disable()');
        
        // Отключаем слушатели
        if (this._settingsChangedId && this._settings) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }
        
        if (this._sessionModeChangedId) {
            Main.sessionMode.disconnect(this._sessionModeChangedId);
            this._sessionModeChangedId = null;
        }
        
        // Возвращаем системные элементы на место (до удаления панели!)
        if (this._systemIndicators) {
            this._systemIndicators.disable();
            this._systemIndicators = null;
        }
        
        // Отключаем иконку дистрибутива
        if (this._distroIcon) {
            this._distroIcon.disable();
            this._distroIcon = null;
        }
        
        // Отключаем таскбар
        if (this._taskbar) {
            this._taskbar.disable();
            this._taskbar = null;
        }
        
        // Удаляем нашу панель
        if (this._panel) {
            const parent = this._panel.get_parent();
            if (parent) {
                parent.remove_child(this._panel);
            }
            this._panel.destroy();
            this._panel = null;
        }
        
        // Удаляем нижний контейнер если есть
        if (this._bottomPanelBox) {
            Main.layoutManager.removeChrome(this._bottomPanelBox);
            this._bottomPanelBox.destroy();
            this._bottomPanelBox = null;
        }
        
        // Восстанавливаем оригинальные состояния panelBox
        if (this._originalPanelBox) {
            // Восстанавливаем позицию
            this._originalPanelBox.set_position(
                this._originalPanelBoxX,
                this._originalPanelBoxY
            );
            // Восстанавливаем размер
            this._originalPanelBox.set_size(
                this._originalPanelBoxWidth,
                this._originalPanelBoxHeight
            );
        }
        
        // Показываем стандартную панель
        Main.panel.visible = this._originalMainPanelVisible;
        
        // Показываем dash обратно
        this._showDash();
        
        // Принудительно пересчитываем struts и layout
        // Это критично для восстановления корректной геометрии рабочей области
        if (Main.layoutManager._updatePanelBarrier) {
            Main.layoutManager._updatePanelBarrier();
        }
        Main.layoutManager._queueUpdateRegions();
        
        // Очищаем
        this._originalPanelBox = null;
        this._originalPanelBoxWidth = null;
        this._originalPanelBoxHeight = null;
        this._originalPanelBoxX = null;
        this._originalPanelBoxY = null;
        this._originalMainPanelVisible = null;
        this._originalDashVisible = null;
        this._originalDashHeight = null;
        this._settings = null;
        
        log('PanelManager: disabled');
    }
    
    /**
     * Вычисляет и применяет геометрию панели
     */
    _applyGeometry() {
        if (!this._settings || !this._panel) return;
        
        const geom = this._calculateGeometry();
        const position = this._settings.get_string('panel-position');
        
        if (position === 'bottom') {
            // Для нижней панели
            if (this._bottomPanelBox) {
                const monitor = Main.layoutManager.primaryMonitor;
                
                // Позиционируем контейнер внизу экрана
                this._bottomPanelBox.set_position(
                    monitor.x + (monitor.width - geom.panelWidth) / 2,
                    monitor.y + monitor.height - geom.panelBoxHeight
                );
                this._bottomPanelBox.set_size(geom.panelWidth, geom.panelBoxHeight);
            }
            
            // Скрываем верхний panelBox
            this._originalPanelBox.set_size(0, 0);
        } else {
            // Для верхней панели - фиксируем размер и отключаем автоматическое расширение
            const monitor = Main.layoutManager.primaryMonitor;
            this._originalPanelBox.set_size(monitor.width, geom.panelBoxHeight);
            this._originalPanelBox.set_position(monitor.x, monitor.y);
        }
        
        // Применяем геометрию к нашей панели
        this._panel.applyGeometry(geom);
    }
    
    /**
     * Вычисляет геометрию на основе настроек
     */
    _calculateGeometry() {
        const thickness = this._settings.get_int('panel-thickness');
        const marginTop = this._settings.get_int('margin-top');
        const marginBottom = this._settings.get_int('margin-bottom');
        const widthPercent = this._settings.get_int('panel-width');
        const position = this._settings.get_string('panel-position');
        
        const monitor = Main.layoutManager.primaryMonitor;
        const screenWidth = monitor ? monitor.width : 1920;
        const panelWidth = Math.floor(screenWidth * widthPercent / 100);
        
        // Для нижней панели marginTop и marginBottom меняются местами логически
        let effectiveMarginTop = marginTop;
        let effectiveMarginBottom = marginBottom;
        
        if (position === 'bottom') {
            effectiveMarginTop = marginBottom;
            effectiveMarginBottom = marginTop;
        }
        
        return {
            thickness,
            marginTop: effectiveMarginTop,
            marginBottom: effectiveMarginBottom,
            screenWidth,
            panelWidth,
            position,
            panelBoxHeight: thickness + marginTop + marginBottom
        };
    }
    
    /**
     * Скрывает dash в Overview
     */
    _hideDash() {
        const dash = Main.overview._overview._controls.dash;
        
        if (dash) {
            // Сохраняем оригинальное состояние
            this._originalDashVisible = dash.visible;
            this._originalDashHeight = dash.height;
            
            // Скрываем dash
            dash.hide();
            // Устанавливаем минимальную высоту чтобы не ломать layout
            dash.set_height(0);
        }
    }
    
    /**
     * Показывает dash обратно
     */
    _showDash() {
        const dash = Main.overview._overview._controls.dash;
        
        if (dash) {
            // Сбрасываем высоту на автоматическую (-1)
            dash.set_height(-1);
            
            // Показываем dash
            dash.show();
            
            // Если была сохранена оригинальная высота, восстанавливаем
            // (но обычно -1 достаточно для автоматического расчёта)
            if (this._originalDashVisible !== null) {
                dash.visible = this._originalDashVisible;
            }
        }
    }
    
    /**
     * Возвращает нашу панель
     */
    get panel() {
        return this._panel;
    }
};
