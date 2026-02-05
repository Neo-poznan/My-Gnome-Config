const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var config = {
    "leftBoxMarginPercent": 0.16,
    "rightBoxMarginPercent": 0.25,
    "panelThickness": 60,
    "verticalMargins": 7,
    "horizontalMargins": 10,

    "widgets": {
        "activities": {
            "position": "left",
            "hide": false,
            "priority": 2,
            "width": 60,
        },
        "appMenu": {
            "position": "left",
            "hide": false,
            "priority": 4,
            "width": 200,

        },
        "dateMenu": {
            "position": "right",
            "hide": false,
            "priority": 2,
            "width": 180,
        },
        "quickSettings": {
            "position": "left",
            "hide": false,
            "priority": 1,
            "width": 82,
        },
        "keyboard": {
            "position": "right",
            "hide": false,
            "priority": 1,
            "width": 35,
        },
        "ArcMenu": {
            "position": "left",
            "hide": false,
            "priority": 0,
            "width": 50,
            "height": 50,
        },
        "taskbar": {
            "position": "left",
            "priority": 3,
            "height": 50,
            "trackHover": false,
        },
        "systemMonitor": {
            "position": "center",
            "priority": 1,
            "height": 50,
            "width": 460,
            "trackHover": false,
        },
        "mediaPlayer": {
            "position": "center",
            "priority": 2,
            "height": 46,
            "width": 280,
            "trackHover": false,
        }
    }
};

