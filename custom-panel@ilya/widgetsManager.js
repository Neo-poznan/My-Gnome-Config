import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { SystemWidgets } from './systemWidgets.js';
import { SystemMonitor } from './systemMonitor.js';
import { Taskbar } from './taskbar.js';
import { MediaPlayer } from './mediaPlayer.js';


export class WidgetsManager {

    constructor(config) {
        this.config = config;
        this._widgets = [];
        this._knownElements = Object.keys(this.config.widgets);
        this.defaultElementsHeight = 40;
        this.elementsHeight = this._getElementsHeight();
        this._elementsWidth = this._getElementsWidth();
    }

    _getElementsHeight() {
        const elementsHeight = {};
        for (let elementName of this._knownElements) {
            elementsHeight[elementName] = this.config.widgets[elementName].height || this.defaultElementsHeight;
        }
        return elementsHeight;
    }

    _getElementsWidth() {
        const elementsWidth = {};
        for (let elementName of this._knownElements) {
            elementsWidth[elementName] = this.config.widgets[elementName].width || -1;
        }
        return elementsWidth;
    }

    addAllWidgets(panel) {
        this._systemWidgets = new SystemWidgets(this.config);
        this._systemWidgets.saveOriginalWidgets();

        this._taskbar = new Taskbar();
        this._taskbar.createWidgets();
    
        this._systemMonitor = new SystemMonitor();
        this._systemMonitor.createWidget();
        
        this._mediaPlayer = new MediaPlayer(this.config);
        this._mediaPlayer.createWidget();
        
        this._widgets = this._systemWidgets.getWidgets();
        this._widgets['taskbar'] = this._taskbar.container;
        this._widgets['systemMonitor'] = this._systemMonitor.container;
        this._widgets['mediaPlayer'] = this._mediaPlayer.container;
        this.addWidgets(panel, this._widgets);
    }

    addWidgets(panel, widgets) {
        const sortedWidgets = this._sortWidgetsByPriority(Object.keys(widgets));
        console.log('Sorted widgets: ' + sortedWidgets);
        for (let widgetName of sortedWidgets) {
            if ( this._isHidden(widgetName) ) {
                console.log('Widget ' + widgetName + ' is hidden, skipping');
                continue;
            }
            if ( this._knownElements.includes(widgetName) ) {
                const item = widgets[widgetName];
                const parent = item.container.get_parent();
                if (parent) {
                    parent.remove_child(item.container);
                }
                const needTrackHover = this._isNeedTrackHover(widgetName);
                const widgetContainer = new St.BoxLayout({
                    name: `${widgetName}-container`,
                    style_class: 'widget-container widget-container-' + widgetName,
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                    reactive: true,
                    can_focus: true,
                    track_hover: needTrackHover,
                })
                widgetContainer.set_size(this._elementsWidth[widgetName], this.elementsHeight[widgetName]);
                widgetContainer.add_child(item.container);
                const box = this._getWidgetBox(widgetName, panel);
                console.log('Adding widget ' + widgetName + ' to box ' + box.name);
                box.add_child(widgetContainer);
            }
            else {
                const item = widgets[widgetName];
                console.log('Unknown widget: ' + widgetName);
                const parent = item.container.get_parent();
                if (parent) {
                    parent.remove_child(item.container);
                }
                const widgetContainer = new St.BoxLayout({
                    name: `${widgetName}-container`,
                    style_class: 'widget-container widget-container-' + widgetName,
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                    reactive: true, 
                    can_focus: true,
                    track_hover: true,
                })
                widgetContainer.set_size(-1, this.defaultElementsHeight);
                widgetContainer.add_child(item.container);
                const box = this._getWidgetBox(widgetName, panel);
                box.add_child(widgetContainer);
                
            }
        }
    } 

    _isHidden(widgetName) {
        if (this.config.widgets[widgetName] && this.config.widgets[widgetName].hidden === true ) {
            return true;
        }
        else {
            return false;
        }
    }

    _isNeedTrackHover(widgetName) {
        if (this.config.widgets[widgetName] && this.config.widgets[widgetName].trackHover === false) {
                return false;
        } 
        // if the widget is not in config, we will track hover by default
        else {
            return true;
        }

    }

    restoreOriginalWidgets() {
        this._systemWidgets.restoreOriginalWidgets();
        if (this._systemMonitor) {
            this._systemMonitor.disable();
            this._systemMonitor = null;
        }
        if (this._mediaPlayer) {
            this._mediaPlayer.disable();
            this._mediaPlayer = null;
        }
        this._taskbar.disable();
    }



    _sortWidgetsByPriority(widgetsArray) {
        widgetsArray.sort((a, b) => {
            const aPriority = this._getWidgetPriority(a);
            const bPriority = this._getWidgetPriority(b);
            return aPriority - bPriority;
        });
        return widgetsArray;
    }

    _getWidgetPriority(widgetName) {
        if (this._knownElements.includes(widgetName)) {
            const elementConfig = this.config.widgets[widgetName];
            return elementConfig.priority || 0;
        }
        return 0;
    }

    _getWidgetBox(widgetName, panel) {
        if (this._knownElements.includes(widgetName)) {
            console.log('Getting box for known widget: ' + widgetName);
            const elementConfig = this.config.widgets[widgetName];
            if (elementConfig.position === 'left') {
                return panel._leftBox;
            }
            else if (elementConfig.position === 'center') {
                return panel._centerBox;
            }
            else {
                return panel._rightBox;
            }
        }
        else {
            return panel._rightBox;
        }
    }
}