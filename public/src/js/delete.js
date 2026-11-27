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

    const textElementNames = new Set([
        "text",
        "words",
        "rehearsal",
        "other-dynamics",
        "work-title",
        "movement-title",
        "creator",
        "rights",
        "credit-words",
        "part-name",
        "part-abbreviation",
        "group-name",
        "group-abbreviation",
        "instrument-name",
        "instrument-abbreviation"
    ]);
    const dynamicElementNames = new Set([
        "p", "pp", "ppp", "pppp", "f", "ff", "fff", "ffff",
        "mp", "mf", "pf", "sf", "sfp", "sfpp", "fp", "fz", "sfz",
        "sffz", "sffp", "rf", "rfz", "other-dynamics"
    ]);

    function isMetronomeDirection(element) {
        return getLocalName(element) === "direction" &&
            Array.from(element.getElementsByTagName("metronome")).length > 0;
    }

    function isDeletableText(element) {
        const name = getLocalName(element);
        if (textElementNames.has(name)) return true;
        return dynamicElementNames.has(name) &&
            getLocalName(element.parentElement) === "dynamics";
    }

    function removeEmptyDirection(parent) {
        const directionType = getLocalName(parent) === "direction-type"
            ? parent
            : getLocalName(parent?.parentElement) === "direction-type"
                ? parent.parentElement
                : null;
        if (!directionType) return;

        if (!directionType.children.length && !directionType.textContent.trim()) {
            const direction = directionType.parentElement;
            directionType.remove();
            if (getLocalName(direction) === "direction" &&
                !getDirectChild(direction, "direction-type") &&
                !getDirectChild(direction, "sound")) {
                direction.remove();
            }
        }
    }

    function removeSelectedText(element) {
        if (getLocalName(element) === "direction" && isMetronomeDirection(element)) {
            const directionTypes = Array.from(element.children)
                .filter(child => getLocalName(child) === "direction-type");
            for (const directionType of directionTypes) {
                for (const metronome of Array.from(
                    directionType.getElementsByTagName("metronome")
                )) {
                    metronome.remove();
                }
                removeEmptyDirection(directionType);
            }
            for (const sound of Array.from(element.children)
                .filter(child => getLocalName(child) === "sound")) {
                sound.removeAttribute("tempo");
                if (!sound.attributes.length && !sound.children.length &&
                    !sound.textContent.trim()) {
                    sound.remove();
                }
            }
            if (!getDirectChild(element, "direction-type") &&
                !getDirectChild(element, "sound")) {
                element.remove();
            }
            return;
        }

        let parent = element.parentElement;
        if (getLocalName(parent) === "dynamics") {
            const directionType = parent.parentElement;
            element.remove();
            if (!parent.children.length) {
                parent.remove();
                removeEmptyDirection(directionType);
            }
            return;
        }

        element.remove();
        removeEmptyDirection(parent);
    }

    function replaceNoteWithRest(note, xmlDocument) {
        const pitch = getDirectChild(note, "pitch") ||
            getDirectChild(note, "unpitched");
        if (!pitch) return null;

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
        return note;
    }

    function isEditableTarget(target) {
        return target instanceof Element &&
            Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    }

    function reportError(error) {
        console.error("Could not delete the selected MusicXML elements.", error);
        window.alert("Impossible de supprimer les éléments sélectionnés.");
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
            const hasSelectedTextGraphic = selectedElements.some(element =>
                element instanceof Element && Boolean(element.closest("g.vf-text"))
            );
            const selectedSources = Array.from(new Set(selectedElements
                .map(element => window.PartitionClick.getSourceXmlElement(element))
                .filter(Boolean)));
            const selectedNotes = selectedSources.filter(element =>
                getLocalName(element) === "note"
            );
            const selectedTexts = selectedSources.filter(element =>
                getLocalName(element) === "harmony" ||
                getLocalName(element) === "lyric" ||
                isDeletableText(element) ||
                isMetronomeDirection(element)
            );
            if (hasSelectedTextGraphic && !selectedTexts.length) return;
            const deletionGroups = hasSelectedTextGraphic || selectedTexts.length
                ? []
                : createDeletionGroups(selectedNotes);
            if (!deletionGroups.length && !selectedTexts.length) return;

            const xmlDocument = window.PartitionClick.getMusicXmlDocument();
            if (!xmlDocument) throw new Error("No MusicXML document is currently loaded.");

            event.preventDefault();
            const selectedXmlNotes = new Set(selectedNotes);
            const restsToConsolidate = new Map();
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

                const rest = replaceNoteWithRest(group[0], xmlDocument);
                if (rest) {
                    const measure = rest.parentElement;
                    if (!restsToConsolidate.has(measure)) {
                        restsToConsolidate.set(measure, new Set());
                    }
                    restsToConsolidate.get(measure).add(rest);
                }
                for (const note of deletedNotes) {
                    if (note !== group[0]) note.remove();
                }
            }

            for (const [measure, rests] of restsToConsolidate) {
                window.NoteEditActions.coalesceAdjacentRests(measure, Array.from(rests));
            }

            for (const element of selectedTexts) {
                if (element.ownerDocument === xmlDocument && element.parentElement) {
                    removeSelectedText(element);
                }
            }

            window.FileActions.updateMusicXml(
                xmlDocument,
                "Deleted selected score elements"
            ).catch(reportError);
        } catch (error) {
            reportError(error);
        }
    }

    function initialize() {
        window.addEventListener("keydown", handleKeyDown);
    }

    window.DeleteActions = Object.freeze({ initialize });
})();
