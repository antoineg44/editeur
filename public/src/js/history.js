"use strict";

(() => {
    let historyFrameWindow = null;
    let entries = [];
    let nextEntryId = 0;
    let currentEntryId = null;
    let isInitialized = false;

    function getVisibleEntries() {
        return entries.map((entry, index) => ({
            id: entry.id,
            description: entry.description,
            timestamp: entry.timestamp,
            isCurrent: entry.id === currentEntryId
        }));
    }

    function publish() {
        if (!historyFrameWindow) return;
        historyFrameWindow.postMessage({
            channel: "viritura-history",
            type: "history-update",
            entries: getVisibleEntries()
        }, "*");
    }

    function handleHistoryReady(event) {
        const message = event.data;
        if (event.source !== historyFrameWindow ||
            (event.origin !== window.location.origin && event.origin !== "null") ||
            !message || message.channel !== "viritura-index-new" ||
            message.type !== "history-ready") {
            return;
        }

        publish();
    }

    function initialize(frameWindow) {
        if (isInitialized) return;
        if (!frameWindow || typeof frameWindow.postMessage !== "function") {
            throw new TypeError("HistoryActions requires the write screen frame.");
        }

        isInitialized = true;
        historyFrameWindow = frameWindow;
        window.addEventListener("message", handleHistoryReady);
    }

    function startSession(name, content) {
        if (typeof name !== "string" || typeof content !== "string") {
            throw new TypeError("HistoryActions.startSession requires a name and MusicXML.");
        }

        const initialEntry = {
            id: nextEntryId++,
            description: "Initial state",
            timestamp: Date.now(),
            content
        };
        entries = [initialEntry];
        currentEntryId = initialEntry.id;
        publish();
    }

    function recordChange(description, content) {
        if (typeof content !== "string") {
            throw new TypeError("HistoryActions.recordChange requires MusicXML text.");
        }
        if (!entries.length) {
            startSession("Untitled score", content);
            return;
        }
        const currentIndex = entries.findIndex(entry => entry.id === currentEntryId);
        const currentEntry = entries[currentIndex];
        if (currentEntry && currentEntry.content === content) return;
        if (currentIndex >= 0) entries = entries.slice(0, currentIndex + 1);

        const entry = {
            id: nextEntryId++,
            description: typeof description === "string" && description.trim()
                ? description.trim()
                : "Updated MusicXML",
            timestamp: Date.now(),
            content
        };
        entries.push(entry);
        currentEntryId = entry.id;
        publish();
    }

    function getEntryContent(id) {
        const entry = entries.find(candidate => candidate.id === id);
        return entry ? entry.content : null;
    }

    function setCurrentEntry(id) {
        if (!entries.some(entry => entry.id === id)) return false;
        currentEntryId = id;
        publish();
        return true;
    }

    window.HistoryActions = Object.freeze({
        initialize,
        startSession,
        recordChange,
        getEntryContent,
        setCurrentEntry
    });
})();
