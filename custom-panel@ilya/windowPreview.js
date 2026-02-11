/**
 * WindowPreview - виджет предпросмотра окон при наведении на иконку приложения
 * Основан на dash-to-panel windowPreview.js
 */

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// Размеры превью
const PREVIEW_WIDTH = 240;
const PREVIEW_ASPECT_RATIO = 16 / 10; // Соотношение сторон
const PREVIEW_PADDING = 6;
const HEADER_HEIGHT = 28;

// Задержки показа/скрытия
const POPUP_SHOW_DELAY = 250;
const POPUP_HIDE_DELAY = 150;

export class WindowPreviewPopup {
    constructor() {
        this._popup = null;
        this._showTimeoutId = null;
        this._hideTimeoutId = null;
        this._currentApp = null;
        this._currentButton = null;
        this._contextMenu = null;
        this._globalClickId = null;
    }
    
    /**
     * Показывает превью с задержкой
     */
    showWithDelay(app, button, panelPosition) {
        // Отменяем скрытие если было запланировано
        this._cancelHide();
        
        // Если уже показываем это же приложение - ничего не делаем
        if (this._currentApp === app && this._popup && this._popup.visible) {
            return;
        }
        
        // Отменяем предыдущий показ
        this._cancelShow();
        
        this._showTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POPUP_SHOW_DELAY, () => {
            this._showTimeoutId = null;
            this._show(app, button, panelPosition);
            return GLib.SOURCE_REMOVE;
        });
    }
    
    /**
     * Скрывает превью с задержкой
     */
    hideWithDelay() {
        // Отменяем показ если был запланирован
        this._cancelShow();
        
        if (!this._popup || !this._popup.visible) {
            return;
        }
        
        // Не скрываем если открыто контекстное меню
        if (this._contextMenu && this._contextMenu.isOpen) {
            return;
        }
        
        this._hideTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POPUP_HIDE_DELAY, () => {
            this._hideTimeoutId = null;
            this._hide();
            return GLib.SOURCE_REMOVE;
        });
    }
    
    /**
     * Немедленно скрывает превью
     */
    hideImmediately() {
        this._cancelShow();
        this._cancelHide();
        this._closeContextMenu();
        this._hide();
    }
    
    _cancelShow() {
        if (this._showTimeoutId) {
            GLib.source_remove(this._showTimeoutId);
            this._showTimeoutId = null;
        }
    }
    
    _cancelHide() {
        if (this._hideTimeoutId) {
            GLib.source_remove(this._hideTimeoutId);
            this._hideTimeoutId = null;
        }
    }
    
    _closeContextMenu() {
        this._removeGlobalClickHandler();
        if (this._contextMenu) {
            this._contextMenu.close();
        }
    }
    
    _show(app, button, panelPosition) {
        const windows = app.get_windows().filter(w => !w.skip_taskbar);
        
        if (windows.length === 0) {
            return;
        }
        
        this._currentApp = app;
        this._currentButton = button;
        this._panelPosition = panelPosition;
        
        // Создаём popup если его нет
        if (!this._popup) {
            this._createPopup();
        }
        
        // Очищаем содержимое
        this._popup._content.destroy_all_children();
        
        // Добавляем превью для каждого окна
        windows.forEach(window => {
            const preview = this._createWindowPreview(window, app);
            this._popup._content.add_child(preview);
        });
        
        // Позиционируем popup
        this._positionPopup(button, panelPosition);
        
        // Показываем
        this._popup.show();
        this._popup.ease({
            opacity: 255,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
    }
    
    _hide() {
        if (!this._popup) return;
        
        this._popup.ease({
            opacity: 0,
            duration: 100,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (this._popup) {
                    this._popup.hide();
                }
            }
        });
        
        this._currentApp = null;
        this._currentButton = null;
    }
    
    /**
     * Обновляет содержимое превью после закрытия окна
     */
    _refreshPreview() {
        if (!this._popup || !this._currentApp || !this._currentButton) {
            return;
        }
        
        // Небольшая задержка, чтобы окно успело закрыться
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
            if (!this._popup || !this._currentApp) {
                return GLib.SOURCE_REMOVE;
            }
            
            const windows = this._currentApp.get_windows().filter(w => !w.skip_taskbar);
            
            if (windows.length === 0) {
                this.hideImmediately();
                return GLib.SOURCE_REMOVE;
            }
            
            // Очищаем содержимое
            this._popup._content.destroy_all_children();
            
            // Добавляем превью для каждого окна
            windows.forEach(window => {
                const preview = this._createWindowPreview(window, this._currentApp);
                this._popup._content.add_child(preview);
            });
            
            // Обновляем позицию
            this._positionPopup(this._currentButton, this._panelPosition);
            
            return GLib.SOURCE_REMOVE;
        });
    }
    
    _createPopup() {
        this._popup = new St.BoxLayout({
            style_class: 'window-preview-popup',
            vertical: true,
            reactive: true,
            track_hover: true,
            opacity: 0
        });
        
        this._popup._content = new St.BoxLayout({
            style_class: 'window-preview-content',
            vertical: false
        });
        
        this._popup.add_child(this._popup._content);
        
        // Обработка наведения на popup
        this._popup.connect('notify::hover', () => {
            if (this._popup.hover) {
                this._cancelHide();
            } else {
                this.hideWithDelay();
            }
        });
        
        Main.layoutManager.addChrome(this._popup, {
            affectsInputRegion: true
        });
    }
    
    _createWindowPreview(window, app) {
        // Единый контейнер для превью (без вложенных контейнеров)
        const container = new St.Widget({
            style_class: 'window-preview-item',
            reactive: true,
            track_hover: true,
            layout_manager: new Clutter.BoxLayout({ orientation: Clutter.Orientation.VERTICAL })
        });
        
        // Сохраняем ссылки для обработчиков
        container._window = window;
        container._app = app;
        
        // Заголовок с иконкой, названием и кнопкой закрытия
        const headerBox = new St.BoxLayout({
            style_class: 'window-preview-header',
            x_expand: true,
            height: HEADER_HEIGHT
        });
        
        // Иконка приложения
        const icon = new St.Icon({
            gicon: app.get_icon(),
            icon_size: 16,
            style_class: 'window-preview-icon',
            y_align: Clutter.ActorAlign.CENTER
        });
        
        const titleLabel = new St.Label({
            text: window.get_title() || app.get_name(),
            style_class: 'window-preview-title',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        titleLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        
        const closeButton = new St.Button({
            style_class: 'window-preview-close',
            child: new St.Icon({
                icon_name: 'window-close-symbolic',
                icon_size: 14
            }),
            y_align: Clutter.ActorAlign.CENTER
        });
        
        closeButton.connect('clicked', () => {
            window.delete(global.get_current_time());
            // Обновляем превью после закрытия окна
            this._refreshPreview();
        });
        
        headerBox.add_child(icon);
        headerBox.add_child(titleLabel);
        headerBox.add_child(closeButton);
        
        // Миниатюра окна - с правильным соотношением сторон
        const thumbnailBin = this._createThumbnail(window);
        
        container.add_child(headerBox);
        container.add_child(thumbnailBin);
        
        // Обработка кликов мыши
        container.connect('button-release-event', (actor, event) => {
            const button = event.get_button();
            
            switch (button) {
                case 1: // Левый клик - активация окна
                    Main.activateWindow(window);
                    this.hideImmediately();
                    break;
                case 2: // Средний клик - закрытие окна
                    window.delete(global.get_current_time());
                    this._refreshPreview();
                    break;
                case 3: // Правый клик - контекстное меню
                    this._showContextMenu(event, window, app);
                    break;
            }
            
            return Clutter.EVENT_STOP;
        });
        
        // Hover эффект
        container.connect('notify::hover', () => {
            if (container.hover) {
                container.add_style_class_name('hover');
            } else {
                container.remove_style_class_name('hover');
            }
        });
        
        return container;
    }
    
    /**
     * Показывает контекстное меню с опциями для окна
     */
    _showContextMenu(event, window, app) {
        this._closeContextMenu();
        this._cancelHide();
        
        const [x, y] = event.get_coords();
        
        // Создаём контекстное меню
        this._contextMenu = new PopupMenu.PopupMenu(this._popup, 0, St.Side.TOP);
        
        // Пункт "Открыть новое окно"
        if (app.can_open_new_window && app.can_open_new_window()) {
            const newWindowItem = new PopupMenu.PopupMenuItem('Открыть новое окно');
            newWindowItem.connect('activate', () => {
                app.open_new_window(-1);
                this.hideImmediately();
            });
            this._contextMenu.addMenuItem(newWindowItem);
        }
        
        // Разделитель
        if (app.can_open_new_window && app.can_open_new_window()) {
            this._contextMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
        
        // Пункт "Закрыть окно"
        if (window.can_close()) {
            const closeItem = new PopupMenu.PopupMenuItem('Закрыть окно');
            closeItem.connect('activate', () => {
                window.delete(global.get_current_time());
                this._refreshPreview();
            });
            this._contextMenu.addMenuItem(closeItem);
        }
        
        // Добавляем меню на сцену
        Main.uiGroup.add_actor(this._contextMenu.actor);
        
        // Позиционируем меню
        this._contextMenu.actor.set_position(Math.floor(x), Math.floor(y));
        
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
                    // Проверяем, нужно ли скрыть превью
                    if (this._popup && !this._popup.hover) {
                        this.hideWithDelay();
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
    
    _createThumbnail(window) {
        const actor = window.get_compositor_private();
        
        // Рассчитываем размеры превью с правильным соотношением сторон
        const previewWidth = PREVIEW_WIDTH;
        const previewHeight = Math.floor(previewWidth / PREVIEW_ASPECT_RATIO);
        
        const bin = new St.Widget({
            style_class: 'window-preview-thumbnail',
            width: previewWidth,
            height: previewHeight,
            layout_manager: new Clutter.BinLayout()
        });
        
        if (!actor) {
            return bin;
        }
        
        // Получаем размеры окна
        const frameRect = window.get_frame_rect();
        
        // Рассчитываем масштаб, чтобы окно поместилось с сохранением пропорций
        const scale = Math.min(
            (previewWidth - PREVIEW_PADDING * 2) / frameRect.width,
            (previewHeight - PREVIEW_PADDING * 2) / frameRect.height,
            1 // Не увеличиваем маленькие окна
        );
        
        const thumbnailWidth = Math.floor(frameRect.width * scale);
        const thumbnailHeight = Math.floor(frameRect.height * scale);
        
        // Создаём клон окна с правильными размерами
        const clone = new Clutter.Clone({
            source: actor,
            width: thumbnailWidth,
            height: thumbnailHeight,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true
        });
        
        bin.add_child(clone);
        
        return bin;
    }
    
    _positionPopup(button, panelPosition) {
        if (!this._popup || !button) return;
        
        const [buttonX, buttonY] = button.get_transformed_position();
        const buttonWidth = button.get_width();
        const buttonHeight = button.get_height();
        
        const popupWidth = this._popup.get_width();
        const popupHeight = this._popup.get_height();
        
        const monitor = Main.layoutManager.primaryMonitor;
        
        // Горизонтальное позиционирование - центрируем относительно кнопки
        let x = buttonX + (buttonWidth - popupWidth) / 2;
        
        // Не выходим за края экрана
        x = Math.max(monitor.x + 10, Math.min(x, monitor.x + monitor.width - popupWidth - 10));
        
        let y;
        if (panelPosition === 'bottom') {
            // Панель снизу - popup сверху
            y = buttonY - popupHeight - 8;
        } else {
            // Панель сверху - popup снизу
            y = buttonY + buttonHeight + 8;
        }
        
        this._popup.set_position(Math.floor(x), Math.floor(y));
    }
    
    destroy() {
        this._cancelShow();
        this._cancelHide();
        this._closeContextMenu();
        this._removeGlobalClickHandler();
        
        if (this._contextMenu && this._contextMenu.actor) {
            Main.uiGroup.remove_actor(this._contextMenu.actor);
            this._contextMenu.destroy();
            this._contextMenu = null;
        }
        
        if (this._popup) {
            Main.layoutManager.removeChrome(this._popup);
            this._popup.destroy();
            this._popup = null;
        }
        
        this._currentApp = null;
        this._currentButton = null;
    }
};
