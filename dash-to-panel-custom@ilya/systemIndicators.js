/**
 * SystemIndicators - переносит ВСЕ элементы с Main.panel на нашу панель
 * 
 * Включает:
 * - Все элементы из statusArea (включая сторонние расширения)
 * - Поддержка настройки позиции и видимости
 * - Поддержка приоритетов для порядка внутри блока
 */

const Main = imports.ui.main;
const Config = imports.misc.config;
const ExtensionUtils = imports.misc.extensionUtils;

/**
 * Возвращает информацию о системном меню в зависимости от версии GNOME
 */
function getSystemMenuName() {
    return parseFloat(Config.PACKAGE_VERSION) >= 43 ? 'quickSettings' : 'aggregateMenu';
}

var SystemIndicators = class SystemIndicators {
    constructor() {
        this._panel = null;
        this._settings = null;
        this._movedElements = [];
        this._settingsChangedId = null;
        this._statusAreaWatchId = null;
    }
    
    /**
     * Включает и переносит элементы на указанную панель
     * @param {Panel} panel - наша кастомная панель
     */
    enable(panel) {
        this._panel = panel;
        this._settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.panel-margins');
        
        // Известные элементы с настройками позиции и приоритета
        const systemMenuName = getSystemMenuName();
        this._knownElements = {
            'activities': {
                settingsKey: 'activities-position',
                hideKey: 'hide-activities',
                priorityKey: 'activities-priority'
            },
            'appMenu': {
                settingsKey: 'appmenu-position',
                hideKey: 'hide-appmenu',
                priorityKey: 'appmenu-priority'
            },
            'dateMenu': { 
                settingsKey: 'clock-position', 
                hideKey: 'hide-clock',
                priorityKey: 'clock-priority'
            },
            [systemMenuName]: { 
                settingsKey: 'systemmenu-position', 
                hideKey: 'hide-systemmenu',
                priorityKey: 'systemmenu-priority'
            },
            'keyboard': { 
                settingsKey: 'keyboard-position', 
                hideKey: 'hide-keyboard',
                priorityKey: 'keyboard-priority'
            },
        };
        
        // Переносим все элементы из statusArea
        this._moveAllElements();
        
        // Слушаем изменения в настройках
        this._settingsChangedId = this._settings.connect('changed', (settings, key) => {
            if (key.endsWith('-position') || key.startsWith('hide-') || key.endsWith('-priority')) {
                this._updateAllElements();
            }
        });
        
        // Следим за новыми элементами в statusArea (для сторонних расширений)
        this._watchStatusArea();
    }
    
    /**
     * Отключает и возвращает элементы на место
     */
    disable() {
        // Отключаем слушатели
        if (this._settingsChangedId && this._settings) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        
        if (this._statusAreaWatchId) {
            clearInterval(this._statusAreaWatchId);
            this._statusAreaWatchId = null;
        }
        
        // Возвращаем элементы на их оригинальные места
        this._movedElements.forEach(info => {
            this._restoreElement(info);
        });
        
        this._movedElements = [];
        this._panel = null;
        this._settings = null;
    }
    
    /**
     * Следит за появлением новых элементов в statusArea
     */
    _watchStatusArea() {
        const knownNames = new Set(this._movedElements.map(e => e.statusName));
        
        this._statusAreaWatchId = setInterval(() => {
            const statusArea = Main.panel.statusArea;
            
            for (const name in statusArea) {
                if (!knownNames.has(name)) {
                    const element = statusArea[name];
                    if (element && element.container) {
                        this._moveElement(name);
                        knownNames.add(name);
                    }
                }
            }
        }, 1000);
    }
    
    /**
     * Переносит все элементы из Main.panel.statusArea
     */
    _moveAllElements() {
        const statusArea = Main.panel.statusArea;
        
        // Пропускаем activities - он нам не нужен
        const skipElements = ['activities'];
        
        for (const name in statusArea) {
            if (skipElements.includes(name)) continue;
            this._moveElement(name);
        }
    }
    
    /**
     * Переносит элемент из Main.panel в нашу панель
     */
    _moveElement(statusName) {
        const statusArea = Main.panel.statusArea;
        
        if (!statusArea[statusName]) {
            return;
        }
        
        const element = statusArea[statusName];
        const container = element.container;
        
        if (!container) {
            return;
        }
        
        const originalParent = container.get_parent();
        
        if (!originalParent) {
            return;
        }
        
        // Определяем оригинальную позицию (left, center, right)
        let originalPosition = 'right';
        if (originalParent === Main.panel._leftBox) {
            originalPosition = 'left';
        } else if (originalParent === Main.panel._centerBox) {
            originalPosition = 'center';
        }
        
        // Сохраняем информацию для восстановления
        const info = {
            statusName: statusName,
            element: element,
            container: container,
            originalParent: originalParent,
            originalPosition: originalPosition,
            originalIndex: originalParent.get_children().indexOf(container),
            isThirdParty: !this._knownElements[statusName]
        };
        
        // Удаляем из оригинального родителя
        originalParent.remove_child(container);
        
        // Определяем позицию, видимость и приоритет
        const config = this._knownElements[statusName];
        let position = originalPosition;
        let hidden = false;
        let priority = 5; // Средний приоритет по умолчанию
        
        if (config) {
            position = this._settings.get_string(config.settingsKey);
            hidden = this._settings.get_boolean(config.hideKey);
            priority = this._settings.get_int(config.priorityKey);
        } else {
            // Сторонний виджет - используем общие настройки
            position = this._settings.get_string('thirdparty-position');
            priority = this._settings.get_int('thirdparty-priority');
            hidden = this._settings.get_boolean('hide-thirdparty');
        }
        
        info.currentPosition = position;
        info.hidden = hidden;
        info.priority = priority;
        
        this._movedElements.push(info);
        
        // Добавляем все элементы с учётом приоритетов
        this._rebuildAllPositions();
    }
    
    /**
     * Обновляет позиции и видимость всех элементов
     */
    _updateAllElements() {
        this._movedElements.forEach(info => {
            const config = this._knownElements[info.statusName];
            
            let position = info.originalPosition;
            let hidden = false;
            let priority = 5;
            
            if (config) {
                position = this._settings.get_string(config.settingsKey);
                hidden = this._settings.get_boolean(config.hideKey);
                priority = this._settings.get_int(config.priorityKey);
            } else {
                // Сторонний виджет
                position = this._settings.get_string('thirdparty-position');
                priority = this._settings.get_int('thirdparty-priority');
                hidden = this._settings.get_boolean('hide-thirdparty');
            }
            
            info.currentPosition = position;
            info.hidden = hidden;
            info.priority = priority;
        });
        
        // Перестраиваем все позиции с учётом приоритетов
        this._rebuildAllPositions();
    }
    
    /**
     * Перестраивает все элементы с учётом приоритетов
     */
    _rebuildAllPositions() {
        // Удаляем все элементы из текущих родителей
        this._movedElements.forEach(info => {
            const currentParent = info.container.get_parent();
            if (currentParent) {
                currentParent.remove_child(info.container);
            }
        });
        
        // Группируем по позициям и сортируем по приоритету
        const byPosition = { left: [], center: [], right: [] };
        
        this._movedElements.forEach(info => {
            if (!info.hidden) {
                byPosition[info.currentPosition].push(info);
            }
        });
        
        // Сортируем каждую группу по приоритету
        for (const pos in byPosition) {
            byPosition[pos].sort((a, b) => a.priority - b.priority);
            
            // Добавляем в нужный box
            const box = this._getBoxForPosition(pos);
            byPosition[pos].forEach(info => {
                box.add_child(info.container);
            });
        }
    }
    
    /**
     * Возвращает box для указанной позиции
     */
    _getBoxForPosition(position) {
        switch (position) {
            case 'center':
                return this._panel.centerBox;
            case 'left':
                return this._panel.leftBox;
            default:
                return this._panel.rightBox;
        }
    }
    
    /**
     * Возвращает элемент на оригинальное место
     */
    _restoreElement(info) {
        const { statusName, container, originalParent, originalIndex } = info;
        
        // Удаляем из нашей панели
        const currentParent = container.get_parent();
        if (currentParent) {
            currentParent.remove_child(container);
        }
        
        // Возвращаем в оригинальное место
        if (originalIndex >= 0 && originalIndex < originalParent.get_children().length) {
            originalParent.insert_child_at_index(container, originalIndex);
        } else {
            originalParent.add_child(container);
        }
    }
};
