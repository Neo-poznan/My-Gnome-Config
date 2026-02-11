import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
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
                container: item.container,
                parent: item.container.get_parent()
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
                container: item.container,
                parent: item.parent
            });
        }
    }

    restoreOriginalWidgets() {
        this._originalWidgets.forEach(element => {
            const currentParent = element.container.get_parent();
            currentParent.remove_child(element.container);
            element.parent.add_child(element.container);
        });
    }

}
