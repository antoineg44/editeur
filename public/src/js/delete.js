"use strict";

(() => {
    function getLocalName(element) {
        return element?.localName || element?.nodeName?.split(":").pop();
    }

    function getDirectChild(parent, name) {
        return Array.from(parent?.children || []).find(
            child => getLocalName(child) === name
        ) || null;
    }

    function createXmlElement(document, parent, name) {
        const qualifiedName = parent.prefix ? `${parent.prefix}:${name}` : name;
        return parent.namespaceURI
            ? document.createElementNS(parent.namespaceURI, qualifiedName)
            : document.createElement(qualifiedName);
    }

    function getChordGroup(note) {
        let root = note;
        while (getDirectChild(root, "chord")) {
            const previous = root.previousElementSibling;
            if (getLocalName(previous) !== "note") break;
            root = previous;
        }

        const group = [root];
        let next = root.nextElementSibling;
        while (getLocalName(next) === "note" && getDirectChild(next, "chord")) {
            group.push(next);
            next = next.nextElementSibling;
        }
        return group;
    }

    function createDeletionGroups(notes) {
        const groups = new Map();
        for (const note of notes) {
            if (getLocalName(note) !== "note") continue;
            if (getLocalName(note.parentElement) !== "measure") {
                throw new Error("A selected MusicXML note is not inside a measure.");
            }

            const group = getChordGroup(note);
            groups.set(group[0], group);
        }

        return Array.from(groups.values());
    }

    function replaceNoteWithRest(note, xmlDocument) {
        const pitch = getDirectChild(note, "pitch") ||
            getDirectChild(note, "unpitched");
        if (!pitch) return;

        const rest = createXmlElement(xmlDocument, note, "rest");
        note.replaceChild(rest, pitch);
        for (const child of Array.from(note.children)) {
            if (["chord", "accidental", "tie"].includes(getLocalName(child))) {
                child.remove();
            }
        }

        const notations = getDirectChild(note, "notations");
        if (notations) {
            for (const tied of Array.from(notations.children)) {
                if (getLocalName(tied) === "tied") tied.remove();
            }
            if (!notations.children.length) notations.remove();
        }
    }

    function isEditableTarget(target) {
        return target instanceof Element &&
            Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    }

    function reportError(error) {
        console.error("Could not delete the selected MusicXML notes.", error);
        window.alert("Impossible de supprimer les notes sélectionnées.");
    }

    function handleKeyDown(event) {
        if ((event.key !== "Delete" && event.key !== "Backspace") ||
            event.altKey || event.ctrlKey || event.metaKey ||
            isEditableTarget(event.target) ||
            window.MenuActions.getSelectedMenu() !== "write") {
            return;
        }

        const selectedElements = window.SelectionActions.getSelectedNotes();
        if (!selectedElements.length) return;

        try {
            const selectedNotes = Array.from(new Set(selectedElements
                .map(element => window.PartitionClick.getSourceXmlElement(element))
                .filter(Boolean)));
            const deletionGroups = createDeletionGroups(selectedNotes);
            if (!deletionGroups.length) return;

            const xmlDocument = window.PartitionClick.getMusicXmlDocument();
            if (!xmlDocument) throw new Error("No MusicXML document is currently loaded.");

            event.preventDefault();
            const selectedXmlNotes = new Set(selectedNotes);
            for (const group of deletionGroups) {
                const deletedNotes = group.filter(note => selectedXmlNotes.has(note));
                if (!deletedNotes.length) continue;

                if (!selectedXmlNotes.has(group[0])) {
                    for (const note of deletedNotes) note.remove();
                    continue;
                }

                const remainingNotes = group.filter(note => !selectedXmlNotes.has(note));
                if (remainingNotes.length) {
                    getDirectChild(remainingNotes[0], "chord")?.remove();
                    for (const note of deletedNotes) note.remove();
                    continue;
                }

                replaceNoteWithRest(group[0], xmlDocument);
                for (const note of deletedNotes) {
                    if (note !== group[0]) note.remove();
                }
            }

            window.FileActions.updateMusicXml(xmlDocument, "Deleted selected notes").catch(reportError);
        } catch (error) {
            reportError(error);
        }
    }

    function initialize() {
        window.addEventListener("keydown", handleKeyDown);
    }

    window.DeleteActions = Object.freeze({ initialize });
})();
