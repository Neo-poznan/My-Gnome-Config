/**
 * PanelManager - управляет жизненным циклом панели и её геометрией
 * 
 * Ключевое отличие от dash-to-panel:
 * - Поддержка независимых отступов (marginTop, marginBottom)
 * - panelBox.height = thickness + marginTop + marginBottom
 * - Визуальная панель позиционируется с отступом marginTop от верха panelBox
 */

const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { Panel } = Me.imports.panel;
const { Taskbar } = Me.imports.taskbar;
const { SystemIndicators } = Me.imports.systemIndicators;
const { DistroIcon } = Me.imports.distroIcon;
const { SystemMonitor } = Me.imports.systemMonitor;
const { MediaPlayer } = Me.imports.mediaPlayer;
const { WidgetPositioner } = Me.imports.widgetPositioner;

var PanelManager = class PanelManager {
    constructor() {
        this._settings = null;
        this._panel = null;
        this._taskbar = null;
        this._systemIndicators = null;
        this._distroIcon = null;
        this._systemMonitor = null;
        this._mediaPlayer = null;
        this._widgetPositioner = null;
        
        // Для панели снизу - отдельный контейнер
        this._bottomPanelBox = null;
        
        // Оригинальные состояния для восстановления
        this._originalPanelBox = null;
        this._originalPanelBoxWidth = null;
        this._originalPanelBoxHeight = null;
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
        this._originalMainPanelVisible = Main.panel.visible;
        
        // Скрываем оригинальную панель
        Main.panel.visible = false;
        
        // Скрываем dash в Overview
        this._hideDash();
        
        // Создаём нашу панель
        this._panel = new Panel(this._settings);
        
        // Определяем позицию и добавляем панель
        this._setupPanelPosition();
        
        // Создаём централизованную систему позиционирования
        this._widgetPositioner = new WidgetPositioner(this._panel, this._settings);
        
        // Создаём виджеты и регистрируем их в позиционере
        this._createAndRegisterWidgets();
        
        // Запускаем позиционирование
        this._widgetPositioner.updatePositions();
        
        // Применяем геометрию
        this._applyGeometry();
        
        // Настройки, которые влияют на геометрию панели (НЕ на позиционирование виджетов)
        const geometryKeys = [
            'panel-position', 'panel-thickness', 'panel-width',
            'margin-top', 'margin-bottom',
            'panel-color', 'panel-alpha', 'panel-border-radius',
            'left-box-padding', 'right-box-padding'
        ];
        
        // Слушаем изменения настроек
        this._settingsChangedId = this._settings.connect('changed', (settings, key) => {
            // Обновляем геометрию только для ключей, влияющих на размеры/положение панели
            if (geometryKeys.includes(key)) {
                if (key === 'panel-position') {
                    // Перестраиваем позицию панели
                    this._setupPanelPosition();
                }
                this._applyGeometry();
            }
            // Настройки позиционирования виджетов обрабатываются WidgetPositioner
        });
        
        // Слушаем изменения конфигурации мониторов
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            log('[PanelManager] === MONITORS CHANGED ===');
            log(`[PanelManager] New monitors count: ${Main.layoutManager.monitors.length}`);
            log(`[PanelManager] New primary monitor: ${JSON.stringify(Main.layoutManager.primaryMonitor)}`);
            log(`[PanelManager] Current panelBox: ${this._originalPanelBox.width}x${this._originalPanelBox.height} at (${this._originalPanelBox.x}, ${this._originalPanelBox.y})`);
            if (this._bottomPanelBox) {
                log(`[PanelManager] Current bottomPanelBox: ${this._bottomPanelBox.width}x${this._bottomPanelBox.height} at (${this._bottomPanelBox.x}, ${this._bottomPanelBox.y})`);
            }
            
            // Показываем текущие struts
            if (Main.layoutManager._isLocked) {
                log('[PanelManager] Layout manager is locked, deferring geometry update');
            } else {
                log('[PanelManager] Layout manager is unlocked, updating geometry...');
                log(`[PanelManager] Hot corners enabled: ${Main.layoutManager._hotCorners.length > 0}`);
                // Показываем информацию о текущих chrome областях
                log(`[PanelManager] Total chrome regions: ${Main.layoutManager._trackedActors.length}`);
                for (let i = 0; i < Main.layoutManager._trackedActors.length; i++) {
                    const actor = Main.layoutManager._trackedActors[i];
                    if (actor && actor.actor) {
                        log(`[PanelManager]   Chrome ${i}: ${actor.actor.name || 'unnamed'} - ${actor.actor.width}x${actor.actor.height} at (${actor.actor.x}, ${actor.actor.y})`);
                    }
                }
            }
            
            this._applyGeometry();
            log('[PanelManager] === MONITORS CHANGED COMPLETE ===');
        });
        
        // Слушаем смену режима сессии (для скрытия на экране блокировки)
        this._sessionModeChangedId = Main.sessionMode.connect('updated', () => {
            this._onSessionModeChanged();
        });
        
        // ДОБАВЛЕНО: Отслеживаем состояние экрана (важно для пробуждения из спящего режима)
        if (Main.screenShield) {
            this._screenShieldActivateId = Main.screenShield.connect('active-changed', () => {
                log(`[PanelManager] Screen shield active changed: ${Main.screenShield.active}`);
                if (!Main.screenShield.active) {
                    // Экран разблокирован, возможно нужно пересчитать геометрию
                    log('[PanelManager] Screen unlocked, checking geometry...');
                    // Небольшая задержка для стабилизации
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                        this._applyGeometry();
                        log('[PanelManager] Geometry reapplied after screen unlock');
                        return GLib.SOURCE_REMOVE;
                    });
                }
            });
            log(`[PanelManager] Screen shield handler connected with id: ${this._screenShieldActivateId}`);
        }
        
        // Проверяем начальное состояние сессии
        this._onSessionModeChanged();
        
        log('[PanelManager] === ENABLE COMPLETE ===');
        log(`[PanelManager] Panel position: ${this._panel.get_position()}`);
        log(`[PanelManager] Panel size: ${this._panel.width}x${this._panel.height}`);
        if (this._bottomPanelBox) {
            log(`[PanelManager] BottomPanelBox: ${this._bottomPanelBox.width}x${this._bottomPanelBox.height} at (${this._bottomPanelBox.x}, ${this._bottomPanelBox.y})`);
        }
    }
    
    /**
     * Создаёт виджеты и регистрирует их в централизованном позиционере
     */
    _createAndRegisterWidgets() {
        log('[PanelManager] === CREATING AND REGISTERING WIDGETS ===');
        
        // 1. Таскбар - создаём и получаем контейнеры
        this._taskbar = new Taskbar();
        this._taskbar.createWidgets(this._panel);
        
        // Регистрируем кнопку показа приложений
        if (this._taskbar.showAppsButton) {
            this._widgetPositioner.registerWidget(
                'showApps',
                this._taskbar.showAppsButton,
                'showapps-position',
                'showapps-priority',
                'hide-showapps'
            );
        }
        
        // Регистрируем контейнер таскбара
        if (this._taskbar.container) {
            this._widgetPositioner.registerWidget(
                'taskbar',
                this._taskbar.container,
                'taskbar-position',
                'taskbar-priority',
                'hide-taskbar'
            );
        }
        
        // 2. Системные индикаторы (дата, системное меню, раскладка)
        this._systemIndicators = new SystemIndicators();
        this._systemIndicators.enable(this._panel, this._widgetPositioner);
        
        // 3. Иконка дистрибутива
        this._distroIcon = new DistroIcon();
        this._distroIcon.createWidget(this._panel);
        if (this._distroIcon.container) {
            this._widgetPositioner.registerWidget(
                'distroIcon',
                this._distroIcon.container,
                'distro-icon-position',
                'distro-icon-priority',
                'hide-distro-icon'
            );
        }
        
        // 4. Системный монитор
        this._systemMonitor = new SystemMonitor();
        this._systemMonitor.createWidget(this._panel);
        if (this._systemMonitor.container) {
            this._widgetPositioner.registerWidget(
                'sysmon',
                this._systemMonitor.container,
                'sysmon-position',
                'sysmon-priority',
                'hide-sysmon'
            );
        }
        
        // 5. Медиа-плеер
        this._mediaPlayer = new MediaPlayer();
        this._mediaPlayer.createWidget();
        if (this._mediaPlayer.widget) {
            this._widgetPositioner.registerWidget(
                'mediaPlayer',
                this._mediaPlayer.widget,
                'media-player-position',
                'media-player-priority',
                'hide-media-player'
            );
        }
        
        log('[PanelManager] === WIDGETS CREATED AND REGISTERED ===');
    }
    
    /**
     * Обрабатывает смену режима сессии (user, unlock-dialog, lock-screen)
     */
    _onSessionModeChanged() {
        log('[PanelManager] === SESSION MODE CHANGED ===');
        log(`[PanelManager] Current session mode: ${Main.sessionMode.currentMode}`);
        log(`[PanelManager] Has unlock dialog: ${Main.sessionMode.hasUnlockDialog}`);
        log(`[PanelManager] Is locked: ${Main.sessionMode.isLocked}`);
        log(`[PanelManager] Is greeter: ${Main.sessionMode.isGreeter}`);
        
        if (!this._panel) {
            log('[PanelManager] No panel to manage, returning early');
            return;
        }
        
        const dominated = Main.sessionMode.currentMode === 'unlock-dialog' ||
                         Main.sessionMode.currentMode === 'lock-screen' ||
                         Main.sessionMode.currentMode === 'gdm';
        
        log(`[PanelManager] Should hide panels: ${dominated}`);
        
        if (dominated) {
            // Скрываем панель на экране блокировки
            log('[PanelManager] Hiding panel due to lock screen/unlock dialog/gdm');
            this._panel.hide();
            if (this._bottomPanelBox) {
                this._bottomPanelBox.hide();
                log('[PanelManager] Hidden bottomPanelBox');
            }
        } else {
            // Показываем панель
            log('[PanelManager] Showing panel (session unlocked)');
            this._panel.show();
            if (this._bottomPanelBox) {
                this._bottomPanelBox.show();
                log('[PanelManager] Shown bottomPanelBox');
                // После разблокировки проверяем геометрию
                log(`[PanelManager] BottomPanelBox after unlock: ${this._bottomPanelBox.width}x${this._bottomPanelBox.height} at (${this._bottomPanelBox.x}, ${this._bottomPanelBox.y})`);
                log(`[PanelManager] Chrome regions after unlock: ${Main.layoutManager._trackedActors.length}`);
            }
            // Возможно, нужно пересчитать геометрию после разблокировки
            this._applyGeometry();
            log('[PanelManager] Geometry reapplied after session unlock');
        }
        
        log('[PanelManager] === SESSION MODE CHANGED COMPLETE ===');
    }
    
    /**
     * Настраивает позицию панели (top или bottom)
     */
    _setupPanelPosition() {
        const position = this._settings.get_string('panel-position');
        log(`[PanelManager] === SETUP PANEL POSITION: ${position} ===`);
        
        // Удаляем панель из текущего родителя
        const currentParent = this._panel.get_parent();
        if (currentParent) {
            log(`[PanelManager] Removing panel from current parent: ${currentParent.constructor.name}`);
            currentParent.remove_child(this._panel);
        }
        
        if (position === 'bottom') {
            // Создаём контейнер для нижней панели если его нет
            if (!this._bottomPanelBox) {
                log('[PanelManager] Creating bottomPanelBox');
                this._bottomPanelBox = new imports.gi.St.BoxLayout({
                    name: 'bottomPanelBox',
                    vertical: true
                });
                log('[PanelManager] Adding bottomPanelBox to chrome...');
                Main.layoutManager.addChrome(this._bottomPanelBox, {
                    affectsStruts: true,
                    trackFullscreen: true
                });
                log('[PanelManager] BottomPanelBox added to chrome successfully');
                log(`[PanelManager] BottomPanelBox after chrome: ${this._bottomPanelBox.width}x${this._bottomPanelBox.height} at (${this._bottomPanelBox.x}, ${this._bottomPanelBox.y})`);
                log(`[PanelManager] Chrome regions count: ${Main.layoutManager._trackedActors.length}`);
            }
            
            this._bottomPanelBox.add_child(this._panel);
            log('[PanelManager] Panel added to bottomPanelBox');
            
            // Скрываем верхний panelBox
            this._originalPanelBox.set_size(0, 0);
            log('[PanelManager] Original panelBox hidden (size 0x0)');
        } else {
            // Удаляем нижний контейнер если есть
            if (this._bottomPanelBox) {
                log('[PanelManager] Removing bottomPanelBox');
                log(`[PanelManager] BottomPanelBox before removal: ${this._bottomPanelBox.width}x${this._bottomPanelBox.height} at (${this._bottomPanelBox.x}, ${this._bottomPanelBox.y})`);
                log(`[PanelManager] Chrome regions count before removal: ${Main.layoutManager._trackedActors.length}`);
                Main.layoutManager.removeChrome(this._bottomPanelBox);
                log(`[PanelManager] Chrome regions count after removal: ${Main.layoutManager._trackedActors.length}`);
                this._bottomPanelBox.destroy();
                this._bottomPanelBox = null;
                log('[PanelManager] BottomPanelBox destroyed');
            }
            
            // Добавляем в верхний panelBox
            this._originalPanelBox.add_child(this._panel);
            log('[PanelManager] Panel added to original panelBox');
        }
        
        log('[PanelManager] === SETUP PANEL POSITION COMPLETE ===');
    }
    
    disable() {
        log('[PanelManager] === DISABLE START ===');
        log(`[PanelManager] Current state - Panel visible: ${this._panel ? this._panel.visible : 'null'}`);
        log(`[PanelManager] Current panelBox: ${this._originalPanelBox ? this._originalPanelBox.width + 'x' + this._originalPanelBox.height + ' at (' + this._originalPanelBox.x + ', ' + this._originalPanelBox.y + ')' : 'null'}`);
        if (this._bottomPanelBox) {
            log(`[PanelManager] BottomPanelBox exists: ${this._bottomPanelBox.width}x${this._bottomPanelBox.height} at (${this._bottomPanelBox.x}, ${this._bottomPanelBox.y})`);
        }
        
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
        
        if (this._screenShieldActivateId && Main.screenShield) {
            Main.screenShield.disconnect(this._screenShieldActivateId);
            this._screenShieldActivateId = null;
        }
        
        // Уничтожаем позиционер виджетов
        if (this._widgetPositioner) {
            this._widgetPositioner.destroy();
            this._widgetPositioner = null;
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
        
        // Отключаем монитор системы
        if (this._systemMonitor) {
            this._systemMonitor.disable();
            this._systemMonitor = null;
        }
        
        // Отключаем медиа-плеер
        if (this._mediaPlayer) {
            this._mediaPlayer.disable();
            this._mediaPlayer = null;
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
            log('[PanelManager] Removing bottomPanelBox from chrome...');
            log(`[PanelManager] BottomPanelBox before removal: ${this._bottomPanelBox.width}x${this._bottomPanelBox.height} at (${this._bottomPanelBox.x}, ${this._bottomPanelBox.y})`);
            log(`[PanelManager] Chrome regions count before removal: ${Main.layoutManager._trackedActors.length}`);
            Main.layoutManager.removeChrome(this._bottomPanelBox);
            log(`[PanelManager] Chrome regions count after removal: ${Main.layoutManager._trackedActors.length}`);
            this._bottomPanelBox.destroy();
            this._bottomPanelBox = null;
            log('[PanelManager] BottomPanelBox destroyed successfully');
        }
        
        // Восстанавливаем оригинальные состояния
        if (this._originalPanelBox) {
            this._originalPanelBox.set_size(this._originalPanelBoxWidth, this._originalPanelBoxHeight);
        }
        
        Main.panel.visible = this._originalMainPanelVisible;
        
        // Показываем dash обратно
        this._showDash();
        
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
        
        log('[PanelManager] === DISABLE COMPLETE ===');
        log(`[PanelManager] Final panelBox: ${Main.layoutManager.panelBox.width}x${Main.layoutManager.panelBox.height} at (${Main.layoutManager.panelBox.x}, ${Main.layoutManager.panelBox.y})`);
        log(`[PanelManager] Final Main.panel visible: ${Main.panel.visible}`);
    }
    
    /**
     * Вычисляет и применяет геометрию панели
     */
    _applyGeometry() {
        if (!this._settings || !this._panel) {
            log('[PanelManager] _applyGeometry: early return (no settings or panel)');
            return;
        }
        
        log('[PanelManager] === APPLY GEOMETRY START ===');
        const geom = this._calculateGeometry();
        const position = this._settings.get_string('panel-position');
        
        log(`[PanelManager] Calculated geometry:`);
        log(`  - Position: ${geom.position}`);
        log(`  - Panel width: ${geom.panelWidth}`);
        log(`  - Panel box height: ${geom.panelBoxHeight}`);
        log(`  - Thickness: ${geom.thickness}`);
        log(`  - Margins: top=${geom.marginTop}, bottom=${geom.marginBottom}`);
        log(`  - Monitor: ${geom.screenWidth}px`);
        
        if (position === 'bottom') {
            // Для нижней панели
            if (this._bottomPanelBox) {
                const monitor = Main.layoutManager.primaryMonitor;
                
                const newX = monitor.x + (monitor.width - geom.panelWidth) / 2;
                const newY = monitor.y + monitor.height - geom.panelBoxHeight;
                
                log(`[PanelManager] Setting bottomPanelBox: ${geom.panelWidth}x${geom.panelBoxHeight} at (${newX}, ${newY})`);
                
                // Позиционируем контейнер внизу экрана
                this._bottomPanelBox.set_position(newX, newY);
                this._bottomPanelBox.set_size(geom.panelWidth, geom.panelBoxHeight);
            } else {
                log('[PanelManager] ERROR: bottomPanelBox is null for bottom position!');
            }
            
            // Скрываем верхний panelBox
            log(`[PanelManager] Hiding original panelBox (setting to 0x0)`);
            this._originalPanelBox.set_size(0, 0);
        } else {
            // Для верхней панели - фиксируем размер и отключаем автоматическое расширение
            const monitor = Main.layoutManager.primaryMonitor;
            log(`[PanelManager] Setting original panelBox: ${monitor.width}x${geom.panelBoxHeight} at (${monitor.x}, ${monitor.y})`);
            this._originalPanelBox.set_size(monitor.width, geom.panelBoxHeight);
            this._originalPanelBox.set_position(monitor.x, monitor.y);
        }
        
        // Применяем геометрию к нашей панели
        this._panel.applyGeometry(geom);
        
        log('[PanelManager] === APPLY GEOMETRY COMPLETE ===');
        log(`[PanelManager] Final panel size: ${this._panel.width}x${this._panel.height}`);
        if (this._bottomPanelBox) {
            log(`[PanelManager] Final bottomPanelBox: ${this._bottomPanelBox.width}x${this._bottomPanelBox.height} at (${this._bottomPanelBox.x}, ${this._bottomPanelBox.y})`);
        }
        log(`[PanelManager] Final panelBox: ${this._originalPanelBox.width}x${this._originalPanelBox.height} at (${this._originalPanelBox.x}, ${this._originalPanelBox.y})`);
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
            dash.show();
            if (this._originalDashHeight !== null) {
                dash.set_height(this._originalDashHeight);
            } else {
                dash.set_height(-1);
            }
        }
    }
    
    /**
     * Возвращает нашу панель
     */
    get panel() {
        return this._panel;
    }
    
    /**
     * Метод для диагностики состояния панели (можно вызвать из консоли)
     */
    debugStatus() {
        log('[PanelManager] === DEBUG STATUS ===');
        log(`Session mode: ${Main.sessionMode.currentMode}`);
        log(`Monitors count: ${Main.layoutManager.monitors.length}`);
        log(`Primary monitor: ${JSON.stringify(Main.layoutManager.primaryMonitor)}`);
        log(`Original panel visible: ${Main.panel.visible}`);
        log(`panelBox: ${Main.layoutManager.panelBox.width}x${Main.layoutManager.panelBox.height} at (${Main.layoutManager.panelBox.x}, ${Main.layoutManager.panelBox.y})`);
        
        if (this._panel) {
            log(`Custom panel: ${this._panel.width}x${this._panel.height}, visible: ${this._panel.visible}`);
            log(`Panel parent: ${this._panel.get_parent() ? this._panel.get_parent().constructor.name : 'null'}`);
        } else {
            log('Custom panel: null');
        }
        
        if (this._bottomPanelBox) {
            log(`bottomPanelBox: ${this._bottomPanelBox.width}x${this._bottomPanelBox.height} at (${this._bottomPanelBox.x}, ${this._bottomPanelBox.y})`);
            log(`bottomPanelBox visible: ${this._bottomPanelBox.visible}`);
        } else {
            log('bottomPanelBox: null');
        }
        
        if (this._settings) {
            log(`Panel position setting: ${this._settings.get_string('panel-position')}`);
            log(`Panel thickness: ${this._settings.get_int('panel-thickness')}`);
            log(`Panel width: ${this._settings.get_int('panel-width')}%`);
        }
        
        log('[PanelManager] === DEBUG STATUS END ===');
    }
};
