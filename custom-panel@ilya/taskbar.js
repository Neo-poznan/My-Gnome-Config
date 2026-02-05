const St = imports.gi.St;
const Main = imports.ui.main;
const Shell = imports.gi.Shell;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const AppFavorites = imports.ui.appFavorites;
const PopupMenu = imports.ui.popupMenu;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const { WindowPreviewPopup } = Me.imports.windowPreview;

var Taskbar = class Taskbar {
    constructor() {
        this._panel = null;
        this._settings = null;
        this._container = null;
        this._showAppsButton = null;
        this._appSystemSignalId = null;
        this._favoritesSignalId = null;
        this._settingsChangedId = null;
        this._windowCreatedId = null;
        this._windowClosedId = null;
        this._iconSize = 28;
        this._windowPreview = null;
        this._contextMenu = null;
        this._globalClickId = null;
    }
    
    /**
     * Создаёт виджеты таскбара без добавления на панель
     * (позиционирование управляется через WidgetPositioner)
     * @param {Panel} panel - наша кастомная панель
     */
    createWidgets() {
        
        // Получаем размер иконок из настроек
        this._iconSize = 30;
        
        // Создаем контейнер таскбара
        this._container = new St.BoxLayout({
            name: 'taskbar',
            style_class: 'panel-taskbar',
            x_expand: false,
            y_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER
        });

        log(this.container, 'container name');
        
        // Заполняем таскбар
        this._updateApps();
        
        // Слушаем изменения в приложениях
        this._appSystemSignalId = Shell.AppSystem.get_default().connect('app-state-changed', () => {
            this._updateApps();
        });
        
        this._favoritesSignalId = AppFavorites.getAppFavorites().connect('changed', () => {
            this._updateApps();
        });
        
        // Слушаем изменения окон для обновления индикаторов
        this._windowCreatedId = global.display.connect('window-created', () => {
            this._updateApps();
        });
        
        // Слушаем закрытие окон
        this._windowClosedId = global.window_manager.connect('destroy', () => {
            // Небольшая задержка чтобы окно успело удалиться
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                this._updateApps();
                return GLib.SOURCE_REMOVE;
            });
        });
        
        // Создаём popup для превью окон
        this._windowPreview = new WindowPreviewPopup();
    
    }
    
    /**
     * @deprecated Используйте createWidgets() + WidgetPositioner
     * Включает таскбар и добавляет его на указанную панель
     * @param {Panel} panel - наша кастомная панель
     */
    enable(panel) {
        this.createWidgets(panel);
        // Старое позиционирование - не используется с WidgetPositioner
        this._updatePositions();
    }
    
    /**
     * Геттер для кнопки показа приложений
     */
    get showAppsButton() {
        return this._showAppsButton;
    }
    
    /**
     * Геттер для контейнера таскбара
     */
    get container() {
        const widgetData = {
            container: this._container,
        };
        return widgetData;
    }
    
    disable() {
        // Закрываем контекстное меню
        this._closeContextMenu();;
        if (this._contextMenu) {
            if (this._contextMenu.actor) {
                Main.uiGroup.remove_actor(this._contextMenu.actor);
            }
            this._contextMenu.destroy();
            this._contextMenu = null;
        }
        
        // Уничтожаем превью окон
        if (this._windowPreview) {
            this._windowPreview.destroy();
            this._windowPreview = null;
        }
        
        // Отключаем слушатели
        if (this._appSystemSignalId) {
            Shell.AppSystem.get_default().disconnect(this._appSystemSignalId);
            this._appSystemSignalId = null;
        }
        
        if (this._favoritesSignalId) {
            AppFavorites.getAppFavorites().disconnect(this._favoritesSignalId);
            this._favoritesSignalId = null;
        }
        
        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = null;
        }
        
        if (this._windowClosedId) {
            global.window_manager.disconnect(this._windowClosedId);
            this._windowClosedId = null;
        }
        
        this._removeGlobalClickHandler();
        
        // Удаляем элементы из всех возможных контейнеров
        if (this._showAppsButton) {
            const parent = this._showAppsButton.get_parent();
            if (parent) parent.remove_child(this._showAppsButton);
            this._showAppsButton.destroy();
            this._showAppsButton = null;
        }
        
        if (this._container) {
            const parent = this._container.get_parent();
            if (parent) parent.remove_child(this._container);
            this._container.destroy();
            this._container = null;
        }
        
        this._panel = null;
    }
    
    /**
     * Обновляет позиции элементов на панели
     */
    _updatePositions() {
        if (!this._panel ) return;
        
        // Удаляем из текущих родителей
        if (this._showAppsButton.get_parent()) {
            this._showAppsButton.get_parent().remove_child(this._showAppsButton);
        }
        if (this._container.get_parent()) {
            this._container.get_parent().remove_child(this._container);
        }
    }
    
    /**
     * Обновляет размеры всех иконок
     */
    _updateIconSizes() {
        // Обновляем иконку кнопки показа приложений
        if (this._showAppsButton && this._showAppsButton._icon) {
            this._showAppsButton._icon.set_icon_size(this._iconSize);
            this._showAppsButton._icon.set_size(this._iconSize, this._iconSize);
        }
        
        // Обновляем иконки приложений (новая структура с контейнером)
        if (this._container) {
            this._container.get_children().forEach((container) => {
                if (container._icon) {
                    container._icon.set_icon_size(this._iconSize);
                    container._icon.set_size(this._iconSize, this._iconSize);
                }
            });
        }
    }
    
    _createShowAppsButton() {
        const button = new St.Button({
            style_class: 'show-apps panel-button',
            track_hover: true,
            can_focus: true,
            toggle_mode: false,
            y_align: Clutter.ActorAlign.CENTER
        });
        
        button._icon = new St.Icon({
            icon_name: 'view-app-grid-symbolic',
            style_class: 'show-apps-icon',
            icon_size: this._iconSize
        });
        button._icon.set_size(40, 40);
        
        button.set_child(button._icon);
        
        button.connect('clicked', () => {
            if (Main.overview.visible) {
                Main.overview.hide();
            } else {
                Main.overview.showApps();
            }
        });
        
        return button;
    }
    
    _createAppButton(app, windowCount, isFavorite) {
        const button = new St.BoxLayout({
            style_class: 'app-button-container',
            vertical: true,
            reactive: true,
            track_hover: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        
        button._app = app;
        button._isFavorite = isFavorite;
        
        // Контейнер для иконки (без hover-эффекта)
        const iconButton = new St.Button({
            style_class: 'taskbar-icon-button',
            can_focus: true,
            reactive: true
        });
        
        // Используем St.Icon с gicon для фиксированного размера
        button._icon = new St.Icon({
            gicon: app.get_icon(),
            icon_size: this._iconSize,
            style_class: 'taskbar-app-icon'
        });
        button._icon.set_size(this._iconSize, this._iconSize);
        
        iconButton.set_child(button._icon);
        
        // Индикатор окон (точки)
        const indicator = this._createWindowIndicator(windowCount);
        button._indicator = indicator;
        
        button.add_child(iconButton);
        button.add_child(indicator);
        
        // Анимация приподнимания иконки при наведении
        button.connect('notify::hover', () => {
            if (button.hover) {
                button._icon.ease({
                    translation_y: -6,
                    duration: 150,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD
                });
            } else {
                button._icon.ease({
                    translation_y: 0,
                    duration: 150,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD
                });
            }
            
            // Показ/скрытие превью
            if (button.hover) {
                const windows = app.get_windows().filter(w => !w.skip_taskbar);
                if (windows.length > 0 && this._windowPreview) {
                    const panelPosition = 'top';
                    this._windowPreview.showWithDelay(app, button, panelPosition);
                }
            } else {
                if (this._windowPreview) {
                    this._windowPreview.hideWithDelay();
                }
            }
        });
        
        // Левый клик по кнопке
        iconButton.connect('clicked', () => {
            // Скрываем превью при клике
            if (this._windowPreview) {
                this._windowPreview.hideImmediately();
            }
            
            const windows = app.get_windows().filter(w => !w.skip_taskbar);
            if (windows.length > 0) {
                // Активируем первое окно или циклируем между окнами
                let focused = global.display.focus_window;
                let found = false;
                
                for (let i = 0; i < windows.length; i++) {
                    if (windows[i] === focused) {
                        // Переключаемся на следующее окно
                        let nextWindow = windows[(i + 1) % windows.length];
                        Main.activateWindow(nextWindow);
                        found = true;
                        break;
                    }
                }
                
                if (!found) {
                    Main.activateWindow(windows[0]);
                }
            } else {
                // Запускаем приложение
                app.activate();
                // Выходим из обзора, если открыт
                if (Main.overview.visible) {
                    Main.overview.hide();
                }
                
            }
        });
        
        // Правый клик - контекстное меню
        iconButton.connect('button-release-event', (actor, event) => {
            if (event.get_button() === 3) { // Правый клик
                if (this._windowPreview) {
                    this._windowPreview.hideImmediately();
                }
                this._showAppContextMenu(event, app, button);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        
        return button;
    }
    
    /**
     * Показывает контекстное меню приложения
     */
    _showAppContextMenu(event, app, button) {
        this._closeContextMenu();
        
        const [x, y] = event.get_coords();
        
        // Создаём контекстное меню
        this._contextMenu = new PopupMenu.PopupMenu(button, 0, St.Side.TOP);
        
        // Пункт "Открыть новое окно"
        if (app.can_open_new_window && app.can_open_new_window()) {
            const newWindowItem = new PopupMenu.PopupMenuItem('Открыть новое окно');
            newWindowItem.connect('activate', () => {
                app.open_new_window(-1);
            });
            this._contextMenu.addMenuItem(newWindowItem);
        }
        
        // Разделитель
        this._contextMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        // Избранное
        const favorites = AppFavorites.getAppFavorites();
        const appId = app.get_id();
        const isFavorite = favorites.isFavorite(appId);
        
        if (isFavorite) {
            const removeFromFavItem = new PopupMenu.PopupMenuItem('Удалить из избранного');
            removeFromFavItem.connect('activate', () => {
                favorites.removeFavorite(appId);
            });
            this._contextMenu.addMenuItem(removeFromFavItem);
        } else {
            const addToFavItem = new PopupMenu.PopupMenuItem('Добавить в избранное');
            addToFavItem.connect('activate', () => {
                favorites.addFavorite(appId);
            });
            this._contextMenu.addMenuItem(addToFavItem);
        }
        
        // Закрыть все окна
        const windows = app.get_windows().filter(w => !w.skip_taskbar);
        if (windows.length > 0) {
            this._contextMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            
            const closeAllItem = new PopupMenu.PopupMenuItem(
                windows.length === 1 ? 'Закрыть окно' : 'Закрыть все окна'
            );
            closeAllItem.connect('activate', () => {
                windows.forEach(w => w.delete(global.get_current_time()));
            });
            this._contextMenu.addMenuItem(closeAllItem);
        }
        
        // Добавляем меню на сцену
        Main.uiGroup.add_actor(this._contextMenu.actor);
        
        // Позиционируем меню относительно кнопки
        const [buttonX, buttonY] = button.get_transformed_position();
        const panelPosition = 'top';
        
        if (panelPosition === 'bottom') {
            this._contextMenu.actor.set_position(
                Math.floor(buttonX), 
                Math.floor(buttonY - this._contextMenu.actor.height - 8)
            );
        } else {
            this._contextMenu.actor.set_position(
                Math.floor(buttonX), 
                Math.floor(buttonY + button.height + 8)
            );
        }
        
        // Обработчик закрытия меню
        this._contextMenu.connect('open-state-changed', (menu, isOpen) => {
            if (!isOpen) {
                this._removeGlobalClickHandler();
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                    if (this._contextMenu && this._contextMenu.actor) {
                        Main.uiGroup.remove_actor(this._contextMenu.actor);
                        this._contextMenu.destroy();
                        this._contextMenu = null;
                    }
                    return GLib.SOURCE_REMOVE;
                });
            }
        });
        
        this._contextMenu.open();
        
        // Добавляем глобальный обработчик кликов для закрытия меню
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            this._addGlobalClickHandler();
            return GLib.SOURCE_REMOVE;
        });
    }
    
    _closeContextMenu() {
        this._removeGlobalClickHandler();
        if (this._contextMenu) {
            this._contextMenu.close();
        }
    }
    
    _addGlobalClickHandler() {
        if (this._globalClickId) return;
        
        this._globalClickId = global.stage.connect('button-press-event', (actor, event) => {
            if (this._contextMenu && this._contextMenu.isOpen) {
                // Проверяем, был ли клик вне меню
                const [x, y] = event.get_coords();
                const menuActor = this._contextMenu.actor;
                const [menuX, menuY] = menuActor.get_transformed_position();
                const menuW = menuActor.width;
                const menuH = menuActor.height;
                
                if (x < menuX || x > menuX + menuW || y < menuY || y > menuY + menuH) {
                    this._closeContextMenu();
                    return Clutter.EVENT_STOP;
                }
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }
    
    _removeGlobalClickHandler() {
        if (this._globalClickId) {
            global.stage.disconnect(this._globalClickId);
            this._globalClickId = null;
        }
    }
    
    /**
     * Создаёт индикатор количества окон (точки)
     */
    _createWindowIndicator(windowCount) {
        const indicator = new St.BoxLayout({
            style_class: 'window-indicator',
            x_align: Clutter.ActorAlign.CENTER
        });
        
        // Максимум показываем 4 точки
        const dotCount = Math.min(windowCount, 4);
        
        for (let i = 0; i < dotCount; i++) {
            const dot = new St.Widget({
                style_class: 'window-indicator-dot'
            });
            indicator.add_child(dot);
        }
        
        // Скрываем если нет окон
        indicator.visible = windowCount > 0;
        
        return indicator;
    }
    
    _updateApps() {
        if (!this._container) return;
        
        // Очищаем таскбар
        this._container.destroy_all_children();
        
        // Получаем избранные приложения
        const favorites = AppFavorites.getAppFavorites().getFavorites();
        const favoriteIds = new Set(favorites.map(app => app.get_id()));
        
        // Получаем запущенные приложения
        const runningApps = Shell.AppSystem.get_default().get_running();
        
        // Собираем избранные приложения
        const favoriteApps = [];
        favorites.forEach(app => {
            const windows = app.get_windows().filter(w => !w.skip_taskbar);
            favoriteApps.push({ 
                app: app, 
                favorite: true, 
                running: windows.length > 0,
                windowCount: windows.length
            });
        });
        
        // Собираем запущенные НЕ из избранных
        const nonFavoriteRunning = [];
        runningApps.forEach(app => {
            const id = app.get_id();
            const windows = app.get_windows().filter(w => !w.skip_taskbar);
            
            if (favoriteIds.has(id)) {
                // Обновляем windowCount для избранных
                const fav = favoriteApps.find(f => f.app.get_id() === id);
                if (fav) {
                    fav.running = true;
                    fav.windowCount = windows.length;
                }
            } else {
                nonFavoriteRunning.push({ 
                    app: app, 
                    favorite: false, 
                    running: true,
                    windowCount: windows.length
                });
            }
        });

        this._container.add_child(this._createShowAppsButton());
        
        // Создаём кнопки для избранных
        favoriteApps.forEach(info => {
            const button = this._createAppButton(info.app, info.windowCount, true);
            this._container.add_child(button);
        });
        
        // Добавляем разделитель, если есть неизбранные запущенные приложения
        if (nonFavoriteRunning.length > 0 && favoriteApps.length > 0) {
            const separator = new St.Widget({
                style_class: 'taskbar-separator',
                width: 1,
                height: 20,
                y_align: Clutter.ActorAlign.CENTER
            });
            this._container.add_child(separator);
        }
        
        // Создаём кнопки для запущенных (не избранных)
        nonFavoriteRunning.forEach(info => {
            const button = this._createAppButton(info.app, info.windowCount, false);
            this._container.add_child(button);
        });
    }
};
