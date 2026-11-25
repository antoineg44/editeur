"use strict";

(() => {
    const activities = new Set([
        "setup",
        "write",
        "edit",
        "engrave",
        "play",
        "roll",
        "review",
        "publish",
        "settings"
    ]);
    let selectedMenu = "write";
    let horizontalMenuWindow = null;
    let isInitialized = false;

    function syncHorizontalToolbar() {
        horizontalMenuWindow.postMessage({
            channel: "viritura-index-new",
            type: "horizontal-toolbar-state",
            showPlayControls: selectedMenu === "play",
            showWriteControls: selectedMenu === "write"
        }, "*");
    }

    function setSelectedMenu(activity) {
        if (activity !== null && !activities.has(activity)) {
            throw new TypeError(`Unknown vertical menu activity: ${activity}`);
        }

        if (selectedMenu === activity) return;
        selectedMenu = activity;
        window.selectedVerticalMenu = selectedMenu;
        window.dispatchEvent(new CustomEvent("viritura:vertical-menu-change", {
            detail: { activity: selectedMenu }
        }));
        syncHorizontalToolbar();
    }

    function recordMenuAction(event, message) {
        setSelectedMenu(message.activity);
    }

    function syncAfterHorizontalMenuReady() {
        syncHorizontalToolbar();
    }

    function initialize(menuWindow, horizontalWindow) {
        if (isInitialized) return;
        isInitialized = true;
        horizontalMenuWindow = horizontalWindow;
        window.selectedVerticalMenu = selectedMenu;

        window.ButtonActionList.addMessages(window, "viritura-index-new", [
            {
                message: "menu-action",
                source: menuWindow,
                types: { activity: "string", wasSelected: "boolean" },
                handler: "recordMenuAction"
            },
            {
                message: "horizontal-toolbar-ready",
                source: horizontalMenuWindow,
                handler: "syncAfterHorizontalMenuReady"
            }
        ], {
            recordMenuAction,
            syncAfterHorizontalMenuReady
        });
        syncHorizontalToolbar();
    }

    window.MenuActions = Object.freeze({
        initialize,
        setSelectedMenu,
        getSelectedMenu: () => selectedMenu
    });
})();
