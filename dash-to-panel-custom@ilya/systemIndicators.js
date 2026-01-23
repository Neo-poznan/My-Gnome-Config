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
        this._widgetPositioner = null;
        this._movedElements = [];
        this._settingsChangedId = null;
        this._statusAreaWatchId = null;
    }
    
    /**
     * Включает и переносит элементы на указанную панель
     * @param {Panel} panel - наша кастомная панель
     * @param {WidgetPositioner} widgetPositioner - централизованный позиционер (опционально)
     */
    enable(panel, widgetPositioner = null) {
        this._panel = panel;
        this._widgetPositioner = widgetPositioner;
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
        
        // Если используем WidgetPositioner - отменяем регистрацию
        if (this._widgetPositioner) {
            this._movedElements.forEach(info => {
                const config = this._knownElements[info.statusName];
                if (config) {
                    this._widgetPositioner.unregisterWidget(`system:${info.statusName}`);
                } else {
                    this._widgetPositioner.unregisterWidget(`thirdparty:${info.statusName}`);
                }
            });
        }
        
        // Возвращаем элементы на их оригинальные места
        this._movedElements.forEach(info => {
            this._restoreElement(info);
        });
        
        this._movedElements = [];
        this._panel = null;
        this._settings = null;
        this._widgetPositioner = null;
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
        
        // Элементы, которые НЕ являются частью statusArea (обрабатываются отдельно)
        const nonStatusAreaElements = [];
        
        // Сначала переносим элементы из statusArea
        for (const name in statusArea) {
            this._moveElement(name);
        }
        
        // Теперь обрабатываем кнопку Activities отдельно (она не в statusArea)
        this._moveActivitiesButton();
    }
    
    /**
     * Переносит кнопку Activities
     */
    _moveActivitiesButton() {
        const activities = Main.panel.statusArea.activities;
        
        // Activities может быть в statusArea или как отдельный элемент
        if (activities && activities.container) {
            // Уже обработан через statusArea
            return;
        }
        
        // Пробуем найти activities button в _leftBox
        const activitiesButton = Main.panel._leftBox.get_children().find(child => {
            return child.name === 'panelActivities' || 
                   child.get_style_class_name && child.get_style_class_name().includes('activities');
        });
        
        if (activitiesButton) {
            const originalParent = activitiesButton.get_parent();
            const originalIndex = originalParent ? originalParent.get_children().indexOf(activitiesButton) : -1;
            
            const info = {
                statusName: 'activities',
                element: null,
                container: activitiesButton,
                originalParent: originalParent,
                originalPosition: 'left',
                originalIndex: originalIndex,
                isThirdParty: false
            };
            
            if (originalParent) {
                originalParent.remove_child(activitiesButton);
            }
            
            this._movedElements.push(info);
            
            if (this._widgetPositioner) {
                const config = this._knownElements['activities'];
                this._widgetPositioner.registerWidget(
                    'system:activities',
                    activitiesButton,
                    config.settingsKey,
                    config.priorityKey,
                    config.hideKey
                );
            }
            
            log('[SystemIndicators] Moved activities button');
        } else {
            log('[SystemIndicators] Activities button not found');
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
        
        this._movedElements.push(info);
        
        // Если есть централизованный позиционер - регистрируем в нём
        if (this._widgetPositioner) {
            const config = this._knownElements[statusName];
            if (config) {
                this._widgetPositioner.registerWidget(
                    `system:${statusName}`,
                    container,
                    config.settingsKey,
                    config.priorityKey,
                    config.hideKey
                );
                log(`[SystemIndicators] Registered system widget: ${statusName}, container visible: ${container.visible}, width: ${container.width}, height: ${container.height}`);
            } else {
                // Сторонний виджет
                this._widgetPositioner.registerWidget(
                    `thirdparty:${statusName}`,
                    container,
                    'thirdparty-position',
                    'thirdparty-priority',
                    'hide-thirdparty'
                );
                log(`[SystemIndicators] Registered thirdparty widget: ${statusName}`);
            }
        } else {
            // Старый режим - локальное позиционирование
            this._rebuildAllPositions();
        }
    }
    
    /**
     * Обновляет позиции и видимость всех элементов
     */
    _updateAllElements() {
        // В режиме WidgetPositioner не нужно делать ничего - он сам отслеживает
        if (this._widgetPositioner) {
            return;
        }
        
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
     * Перестраивает все элементы с учётом приоритетов (только для старого режима без WidgetPositioner)
     */
    _rebuildAllPositions() {
        // В режиме WidgetPositioner не нужно - он сам управляет
        if (this._widgetPositioner) {
            return;
        }
        
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
            // Получаем текущие настройки для элемента
            const config = this._knownElements[info.statusName];
            let position = info.originalPosition;
            let hidden = false;
            let priority = 5;
            
            if (config) {
                position = this._settings.get_string(config.settingsKey);
                hidden = this._settings.get_boolean(config.hideKey);
                priority = this._settings.get_int(config.priorityKey);
            } else {
                position = this._settings.get_string('thirdparty-position');
                priority = this._settings.get_int('thirdparty-priority');
                hidden = this._settings.get_boolean('hide-thirdparty');
            }
            
            if (!hidden && byPosition[position]) {
                byPosition[position].push({
                    container: info.container,
                    priority: priority
                });
            }
        });
        
        // Сортируем каждую группу по приоритету
        for (const pos in byPosition) {
            byPosition[pos].sort((a, b) => a.priority - b.priority);
            
            // Добавляем в нужный box
            const box = this._getBoxForPosition(pos);
            byPosition[pos].forEach(item => {
                box.add_child(item.container);
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
