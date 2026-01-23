const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var SystemWidgets = class SystemWidgets{

    constructor() {
        this._originalWidgets = [];
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
            'quickSettings': {
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
        this._elementsWidth = {
            'activities': 70,
            'appMenu': 200,
            'dateMenu': 180,
            'quickSettings': 82,
            'keyboard': 35
        }
    }

    enable(panel) {
        this._saveWidgets()
        this._moveWidgets(panel);
    }

    disable() {
        this._restoreWidgets();
    }

    _saveWidgets() {
        const statusArea = Main.panel.statusArea;
        for (let i in statusArea) {
            const item = statusArea[i];
            const widgetData = {
                container: item.container,
                parent: item.container.get_parent()
            }
            this._originalWidgets.push(widgetData);
        }
    }

    _moveWidgets(panel) {
        const statusArea = Main.panel.statusArea;
        for (let widgetName in statusArea) {
            if ( widgetName in this._knownElements ) {
                const item = statusArea[widgetName];
                log(widgetName);
                const parent = item.container.get_parent();
                parent.remove_child(item.container);
                const widgetContainer = new St.BoxLayout({
                    name: `${widgetName}-container`,
                    style_class: 'widget-container',
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                    reactive: true, 
                    can_focus: true,
                    track_hover: true,
                })
                widgetContainer.set_size(this._elementsWidth[widgetName], 42);
                widgetContainer.add_child(item.container);
                panel.add_child(widgetContainer);
            }
        }
    }

    _restoreWidgets() {
        this._originalWidgets.forEach(element => {
            const currentParent = element.container.get_parent();
            currentParent.remove_child(element.container);
            element.parent.add_child(element.container);
        });
    }
}
