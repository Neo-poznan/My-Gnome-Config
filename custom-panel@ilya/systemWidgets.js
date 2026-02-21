import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class SystemWidgets {

    constructor(config) {
        this.config = config;
        this._originalWidgets = [];
    }
 
    getWidgets() {
        const statusArea = Main.panel.statusArea;
        const widgets = {};
        for (let widgetName in statusArea) {
            const item = statusArea[widgetName];
            const widgetData = {
                actor: item.container,
                originalParent: item.container.get_parent()
            };
            widgets[widgetName] = widgetData;
        };
        return widgets;
    }

    saveOriginalWidgets() {
        const widgets = this.getWidgets();
        for (let widgetName in widgets) {
            const item = widgets[widgetName];
            this._originalWidgets.push({
                name: widgetName,
                actor: item.actor,
                originalParent: item.originalParent
            });
        }
    }

    restoreOriginalWidgets() {
        this._originalWidgets.forEach(element => {
            const currentParent = element.actor.get_parent();
            currentParent.remove_child(element.actor);
            element.originalParent.add_child(element.actor);
        });
    }

}
