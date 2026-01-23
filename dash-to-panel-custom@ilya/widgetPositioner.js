/**
 * WidgetPositioner - централизованная система позиционирования виджетов
 * 
 * Управляет порядком всех виджетов на панели с учётом:
 * - Позиции (left, center, right)
 * - Приоритета (1-10, меньше = раньше)
 * - Видимости (hide-*)
 */

const ExtensionUtils = imports.misc.extensionUtils;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

// Список ключей настроек, которые влияют на позиционирование виджетов
const POSITIONING_KEYS = [
    // Позиции
    'distro-icon-position', 'activities-position', 'appmenu-position',
    'showapps-position', 'taskbar-position', 'clock-position',
    'systemmenu-position', 'keyboard-position', 'sysmon-position',
    'media-player-position', 'thirdparty-position',
    // Приоритеты
    'distro-icon-priority', 'activities-priority', 'appmenu-priority',
    'showapps-priority', 'taskbar-priority', 'clock-priority',
    'systemmenu-priority', 'keyboard-priority', 'sysmon-priority',
    'media-player-priority', 'thirdparty-priority',
    // Скрытие
    'hide-distro-icon', 'hide-activities', 'hide-appmenu',
    'hide-showapps', 'hide-taskbar', 'hide-clock',
    'hide-systemmenu', 'hide-keyboard', 'hide-sysmon',
    'hide-media-player', 'hide-thirdparty'
];

var WidgetPositioner = class WidgetPositioner {
    constructor(panel, settings) {
        this._panel = panel;
        this._settings = settings;
        this._widgets = new Map(); // id -> { container, positionKey, priorityKey, hideKey }
        this._settingsChangedId = null;
        this._rebuildScheduled = false;
        
        // Слушаем изменения настроек позиционирования
        this._settingsChangedId = this._settings.connect('changed', (settings, key) => {
            // Проверяем точное совпадение ключа
            if (POSITIONING_KEYS.includes(key)) {
                log(`[WidgetPositioner] Settings changed: ${key}`);
                // Откладываем rebuild чтобы избежать множественных вызовов
                if (!this._rebuildScheduled) {
                    this._rebuildScheduled = true;
                    imports.gi.GLib.idle_add(imports.gi.GLib.PRIORITY_DEFAULT, () => {
                        this._rebuildScheduled = false;
                        this._rebuildPositions();
                        return imports.gi.GLib.SOURCE_REMOVE;
                    });
                }
            }
        });
    }
    
    /**
     * Регистрирует виджет в системе позиционирования
     * @param {string} id - уникальный идентификатор виджета
     * @param {St.Widget} container - контейнер виджета
     * @param {string} positionKey - ключ настройки позиции (например, 'taskbar-position')
     * @param {string} priorityKey - ключ настройки приоритета (например, 'taskbar-priority')
     * @param {string} hideKey - ключ настройки скрытия (например, 'hide-taskbar')
     */
    registerWidget(id, container, positionKey, priorityKey, hideKey) {
        this._widgets.set(id, {
            container,
            positionKey,
            priorityKey,
            hideKey
        });
        
        log(`[WidgetPositioner] Registered widget: ${id}`);
    }
    
    /**
     * Удаляет виджет из системы
     * @param {string} id - идентификатор виджета
     */
    unregisterWidget(id) {
        const widget = this._widgets.get(id);
        if (widget) {
            // Удаляем из текущего родителя
            const parent = widget.container.get_parent();
            if (parent) {
                parent.remove_child(widget.container);
            }
            this._widgets.delete(id);
            log(`[WidgetPositioner] Unregistered widget: ${id}`);
        }
    }
    
    /**
     * Перестраивает позиции всех виджетов
     */
    _rebuildPositions() {
        log('[WidgetPositioner] === REBUILDING POSITIONS ===');
        
        // 1. Удаляем все виджеты из панели
        for (const [id, widget] of this._widgets) {
            const parent = widget.container.get_parent();
            if (parent) {
                parent.remove_child(widget.container);
            }
        }
        
        // 2. Группируем виджеты по позициям
        const byPosition = {
            left: [],
            center: [],
            right: []
        };
        
        for (const [id, widget] of this._widgets) {
            // Проверяем видимость
            const isHidden = widget.hideKey && this._settings.get_boolean(widget.hideKey);
            if (isHidden) {
                log(`[WidgetPositioner] Widget ${id} is hidden`);
                continue;
            }
            
            // Получаем позицию и приоритет
            const position = this._settings.get_string(widget.positionKey) || 'left';
            const priority = widget.priorityKey ? this._settings.get_int(widget.priorityKey) : 5;
            
            byPosition[position].push({
                id,
                container: widget.container,
                priority
            });
            
            log(`[WidgetPositioner] Widget ${id}: position=${position}, priority=${priority}`);
        }
        
        // 3. Сортируем каждую группу по приоритету и добавляем
        for (const position of ['left', 'center', 'right']) {
            const box = this._getBoxForPosition(position);
            
            // Сортируем по приоритету (меньше = раньше)
            byPosition[position].sort((a, b) => a.priority - b.priority);
            
            // Добавляем виджеты
            for (const widget of byPosition[position]) {
                box.add_child(widget.container);
                log(`[WidgetPositioner] Added ${widget.id} to ${position}Box (priority ${widget.priority})`);
            }
        }
        
        log('[WidgetPositioner] === REBUILD COMPLETE ===');
    }
    
    /**
     * Принудительно обновляет позиции
     */
    updatePositions() {
        this._rebuildPositions();
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
     * Отключает позиционер
     */
    destroy() {
        if (this._settingsChangedId && this._settings) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        
        // Удаляем все виджеты из панели
        for (const [id, widget] of this._widgets) {
            const parent = widget.container.get_parent();
            if (parent) {
                parent.remove_child(widget.container);
            }
        }
        
        this._widgets.clear();
        this._panel = null;
        this._settings = null;
        
        log('[WidgetPositioner] Destroyed');
    }
};
