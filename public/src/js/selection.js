"use strict";

(() => {
    const selectedNoteClass = "viritura-selected-note";
    const activeVoiceClass = "viritura-active-voice";
    const selectedNotes = new Set();
    const selectionOverlayGroups = new Map();
    const dragThreshold = 5;
    let dragSelection = null;
    let suppressedClickPointerId = null;
    let suppressClickTimer = null;
    let horizontalToolbarWindow = null;
    let lastToolbarState = null;
    let isInitialized = false;
    let clearToolbarSelection = false;
    let activeVoice = "1";

    function getLocalName(element) {
        return element?.localName || element?.nodeName?.split(":").pop();
    }

    function getDirectChild(parent, name) {
        return Array.from(parent?.children || []).find(
            child => getLocalName(child) === name
        ) || null;
    }

    function getNoteToolbarState(graphicalNote) {
        const note = window.PartitionClick.getSourceXmlElement(graphicalNote);
        if (!note || getLocalName(note) !== "note") return null;

        const grace = getDirectChild(note, "grace");
        const graceType = grace
            ? grace.getAttribute("slash") === "yes" ? "acciaccatura" : "appoggiatura"
            : "";
        const accidentalElement = getDirectChild(note, "accidental");
        const accidentalNames = new Map([
            ["flat-flat", "double-flat"],
            ["double-flat", "double-flat"],
            ["flat", "flat"],
            ["natural", "natural"],
            ["sharp", "sharp"],
            ["sharp-sharp", "double-sharp"],
            ["double-sharp", "double-sharp"],
            ["triple-flat", "triple-flat"],
            ["triple-sharp", "triple-sharp"]
        ]);
        let accidental = accidentalElement
            ? accidentalNames.get(accidentalElement.textContent.trim().toLowerCase()) || ""
            : "";

        if (!accidentalElement) {
            const alter = getDirectChild(getDirectChild(note, "pitch"), "alter");
            const alterationNames = new Map([
                [-3, "triple-flat"],
                [-2, "double-flat"],
                [-1, "flat"],
                [0, "natural"],
                [1, "sharp"],
                [2, "double-sharp"],
                [3, "triple-sharp"]
            ]);
            const alteration = alter ? Number(alter.textContent) : null;
            accidental = alterationNames.get(alteration) || "";
        }

        const voice = getDirectChild(note, "voice")?.textContent.trim() || "1";
        return {
            selected: true,
            duration: getDirectChild(note, "type")?.textContent.trim().toLowerCase() || "",
            dotCount: Array.from(note.children)
                .filter(child => getLocalName(child) === "dot").length,
            rest: Boolean(getDirectChild(note, "rest")),
            graceType,
            accidental,
            voice: ["1", "2", "3"].includes(voice) ? voice : "other"
        };
    }

    function syncToolbarSelection(force = false) {
        syncInspectorSelection();
        if (!horizontalToolbarWindow) return;

        const selectedNote = selectedNotes.size === 1
            ? getNoteToolbarState(selectedNotes.values().next().value)
            : null;
        const state = selectedNote || {
            selected: false,
            duration: "",
            dotCount: 0,
            rest: false,
            graceType: "",
            accidental: "",
            voice: ""
        };
        state.clearToolbarSelection = clearToolbarSelection;
        const serializedState = JSON.stringify(state);
        if (!force && serializedState === lastToolbarState) return;
        lastToolbarState = serializedState;

        horizontalToolbarWindow.postMessage({
            channel: "viritura-index-new",
            type: "selected-note-state",
            ...state
        }, "*");
    }

    function syncInspectorSelection() {
        const frame = document.getElementById("write-screen-frame");
        if (!frame?.contentWindow) return;

        const sourceElements = Array.from(selectedNotes)
            .map(selected => window.PartitionClick.getSourceXmlElement(selected))
            .filter(Boolean);
        const distinctSourceElements = Array.from(new Set(sourceElements));
        const sourceElement = distinctSourceElements.length === 1
            ? distinctSourceElements[0]
            : null;
        frame.contentWindow.postMessage({
            channel: "viritura-index-new",
            type: "write-selection-state",
            selected: Boolean(sourceElement),
            multiple: distinctSourceElements.length > 1 ||
                (selectedNotes.size > 1 && distinctSourceElements.length === 0),
            xml: sourceElement
                ? new XMLSerializer().serializeToString(sourceElement)
                : "",
            tag: sourceElement ? getLocalName(sourceElement) : "",
            parentTag: sourceElement?.parentElement
                ? getLocalName(sourceElement.parentElement)
                : ""
        }, "*");
    }

    function installStyles() {
        const style = document.createElement("style");
        style.textContent = `
            #musicxml-score .${selectedNoteClass} [fill]:not([fill="none"]) {
                fill: #ff0000 !important;
            }

            #musicxml-score .${selectedNoteClass} [stroke]:not([stroke="none"]) {
                stroke: #ff0000 !important;
            }

            #musicxml-score .${activeVoiceClass} [fill]:not([fill="none"]) {
                fill: #1677ff !important;
            }

            #musicxml-score .${activeVoiceClass} [stroke]:not([stroke="none"]) {
                stroke: #1677ff !important;
            }

            #musicxml-score .${activeVoiceClass} text {
                fill: #1677ff !important;
            }

            #musicxml-score g.vf-text {
                cursor: pointer;
                pointer-events: bounding-box;
            }

            #musicxml-score .${selectedNoteClass}.${activeVoiceClass} [fill]:not([fill="none"]) {
                fill: #ff0000 !important;
            }

            #musicxml-score .${selectedNoteClass}.${activeVoiceClass} [stroke]:not([stroke="none"]) {
                stroke: #ff0000 !important;
            }

            #musicxml-score .viritura-selection-region {
                fill: #00ff00;
                fill-opacity: 0.22;
                stroke: #00a000;
                stroke-width: 1;
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);
    }

    function normalizeLyricText(text) {
        return text.replace(/\s+/g, " ").trim();
    }

    function getLyricTexts(note) {
        return Array.from(note.children)
            .filter(child => getLocalName(child) === "lyric")
            .map(lyric => Array.from(lyric.children)
                .filter(child => ["text", "elision"].includes(getLocalName(child)))
                .map(child => child.textContent)
                .join(""))
            .map(normalizeLyricText)
            .filter(Boolean);
    }

    function highlightVoiceLyrics(note, graphicalNote) {
        const lyricTexts = getLyricTexts(note);
        const staffLine = graphicalNote.closest("g.staffline");
        if (!lyricTexts.length || !staffLine) return;

        const noteBounds = graphicalNote.getBoundingClientRect();
        const noteX = noteBounds.left + noteBounds.width / 2;
        const lyricGroups = Array.from(staffLine.querySelectorAll("g.vf-text.lyrics"))
            .filter(group => lyricTexts.includes(normalizeLyricText(group.textContent)));
        for (const lyricText of lyricTexts) {
            const matchingGroups = lyricGroups.filter(group =>
                normalizeLyricText(group.textContent) === lyricText
            );
            let nearestDistance = Infinity;
            const nearestGroups = [];
            for (const group of matchingGroups) {
                const bounds = group.getBoundingClientRect();
                const distance = Math.max(bounds.left - noteX, 0, noteX - bounds.right);
                if (distance < nearestDistance - 0.5) {
                    nearestDistance = distance;
                    nearestGroups.length = 0;
                    nearestGroups.push(group);
                } else if (distance <= nearestDistance + 0.5) {
                    nearestGroups.push(group);
                }
            }

            if (nearestDistance <= 48) {
                nearestGroups.forEach(group => group.classList.add(activeVoiceClass));
            }
        }
    }

    function highlightVoiceLyricDashes(scoreContainer) {
        const lyricBounds = Array.from(
            scoreContainer.querySelectorAll(`g.vf-text.lyrics.${activeVoiceClass}`)
        ).map(group => group.getBoundingClientRect());
        for (const dash of scoreContainer.querySelectorAll("g.vf-text.dash")) {
            const bounds = dash.getBoundingClientRect();
            const centerY = bounds.top + bounds.height / 2;
            const sameRowLyrics = lyricBounds.filter(lyric =>
                Math.abs(lyric.top + lyric.height / 2 - centerY) < 4
            );
            const hasLeftLyric = sameRowLyrics.some(lyric =>
                lyric.right <= bounds.left && bounds.left - lyric.right <= 60
            );
            const hasRightLyric = sameRowLyrics.some(lyric =>
                lyric.left >= bounds.right && lyric.left - bounds.right <= 60
            );
            if (hasLeftLyric && hasRightLyric) {
                dash.classList.add(activeVoiceClass);
            }
        }
    }

    function refreshVoiceHighlight() {
        const scoreContainer = document.getElementById("musicxml-score");
        scoreContainer.querySelectorAll(`.${activeVoiceClass}`).forEach(element => {
            element.classList.remove(activeVoiceClass);
        });
        if (!activeVoice) return;

        const sourceDocument = window.PartitionClick.getMusicXmlDocument();
        if (!sourceDocument) return;
        const voiceNotes = Array.from(sourceDocument.getElementsByTagName("note"))
            .filter(note =>
                (getDirectChild(note, "voice")?.textContent.trim() || "1") === activeVoice
            );
        const graphicalNotes = window.PartitionClick.getGraphicalElementsForSourceXmlElements(
            voiceNotes
        );
        for (const graphicalNote of graphicalNotes) {
            graphicalNote.classList.add(activeVoiceClass);
            const sourceNote = window.PartitionClick.getSourceXmlElement(graphicalNote);
            if (sourceNote) highlightVoiceLyrics(sourceNote, graphicalNote);
            if (!graphicalNote.id) continue;

            const measure = graphicalNote.closest("g.vf-measure");
            if (!measure) continue;
            for (const element of measure.querySelectorAll("[id]")) {
                if (element.id.startsWith(`${graphicalNote.id}-`)) {
                    element.classList.add(activeVoiceClass);
                }
            }
        }
        highlightVoiceLyricDashes(scoreContainer);
    }

    function setActiveVoice(voice) {
        if (voice === "other") {
            activeVoice = "";
        } else if (["1", "2", "3"].includes(voice)) {
            activeVoice = voice;
        } else {
            throw new TypeError("SelectionActions.setActiveVoice requires voice 1, 2, 3, or other.");
        }
        refreshVoiceHighlight();
    }

    function isScoreSelectionMode() {
        const selectedMenu = window.MenuActions.getSelectedMenu();
        return selectedMenu === "write" || selectedMenu === "engrave";
    }

    function clearMarquee() {
        for (const group of selectionOverlayGroups.values()) group.remove();
        selectionOverlayGroups.clear();
    }

    function clearSelectedNotes(forceToolbarSync = false) {
        setSelectedNotes(new Set());
        if (forceToolbarSync) syncToolbarSelection(true);
    }

    function setSelectedNotes(notes) {
        if (notes.size) window.NotePlacementActions.cancel();
        if (notes.size) clearToolbarSelection = false;
        for (const note of selectedNotes) {
            if (!notes.has(note)) note.classList.remove(selectedNoteClass);
        }
        for (const note of notes) note.classList.add(selectedNoteClass);

        selectedNotes.clear();
        for (const note of notes) selectedNotes.add(note);
        syncToolbarSelection();
    }

    function getSelectedNotes() {
        return Array.from(selectedNotes);
    }

    function replaceSelectedNotes(notes) {
        clearMarquee();
        setSelectedNotes(new Set(notes));
    }

    function getSelectedStaffRange() {
        if (!Number.isInteger(dragSelection.startStaff) ||
            !Number.isInteger(dragSelection.currentStaff)) return null;
        return {
            start: Math.min(dragSelection.startStaff, dragSelection.currentStaff),
            end: Math.max(dragSelection.startStaff, dragSelection.currentStaff)
        };
    }

    function getMusicalPosition(result) {
        const fraction = result?.timeInMeasure?.fraction;
        if (!Number.isInteger(result?.measureIndex) || !Number.isFinite(fraction)) return null;
        return { measureIndex: result.measureIndex, fraction };
    }

    function updateMarquee(segments) {
        clearMarquee();
        for (const segment of segments) {
            const svg = segment.svg;
            if (!(svg instanceof SVGSVGElement)) continue;

            let group = selectionOverlayGroups.get(svg);
            if (!group) {
                group = document.createElementNS("http://www.w3.org/2000/svg", "g");
                group.classList.add("viritura-selection-overlay");
                group.setAttribute("pointer-events", "none");
                svg.insertBefore(group, svg.firstChild);
                selectionOverlayGroups.set(svg, group);
            }

            const matrix = svg.getScreenCTM();
            if (!matrix) continue;
            const inverse = matrix.inverse();
            const topLeft = svg.createSVGPoint();
            topLeft.x = segment.left;
            topLeft.y = segment.top;
            const bottomRight = svg.createSVGPoint();
            bottomRight.x = segment.left + segment.width;
            bottomRight.y = segment.top + segment.height;
            const svgTopLeft = topLeft.matrixTransform(inverse);
            const svgBottomRight = bottomRight.matrixTransform(inverse);
            const region = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            region.classList.add("viritura-selection-region");
            region.setAttribute("x", String(Math.min(svgTopLeft.x, svgBottomRight.x)));
            region.setAttribute("y", String(Math.min(svgTopLeft.y, svgBottomRight.y)));
            region.setAttribute("width", String(Math.abs(svgBottomRight.x - svgTopLeft.x)));
            region.setAttribute("height", String(Math.abs(svgBottomRight.y - svgTopLeft.y)));
            group.appendChild(region);
        }
    }

    function updateMarqueeFromDrag(container) {
        const segments = window.PartitionClick.getStaffSegments(
            container,
            dragSelection.startResult,
            dragSelection.currentResult,
            getSelectedStaffRange()
        );
        if (segments.length) {
            updateMarquee(segments);
            return;
        }

        const start = dragSelection.startClient;
        const end = dragSelection.currentClient;
        const startBounds = dragSelection.startStaffBounds;
        const endBounds = dragSelection.currentStaffBounds;
        const top = Math.min(startBounds?.top ?? start.y, endBounds?.top ?? end.y);
        const bottom = Math.max(startBounds?.bottom ?? start.y, endBounds?.bottom ?? end.y);
        updateMarquee([{
            left: Math.min(start.x, end.x),
            top,
            width: Math.max(2, Math.abs(end.x - start.x)),
            height: Math.max(2, bottom - top),
            svg: dragSelection.startResult.element.closest("svg")
        }]);
    }

    function updateRangeSelection(container) {
        if (!dragSelection.endPosition) return;

        const range = window.PartitionClick.getElementsBetween(
            container,
            dragSelection.startPosition,
            dragSelection.endPosition,
            getSelectedStaffRange()
        );
        const nextSelection = new Set(dragSelection.additive ? dragSelection.baseSelection : []);
        for (const note of range) nextSelection.add(note);
        setSelectedNotes(nextSelection);
    }

    function updateDrag(event, container) {
        const point = event.detail.clientPosition;
        if (point) {
            const distance = Math.hypot(
                point.x - dragSelection.startClient.x,
                point.y - dragSelection.startClient.y
            );
            if (distance >= dragThreshold) dragSelection.moved = true;
            dragSelection.currentClient = point;
        }

        if (event.detail.result?.staffBounds) {
            dragSelection.currentStaffBounds = event.detail.result.staffBounds;
        }
        if (Number.isInteger(event.detail.result?.staff)) {
            dragSelection.currentStaff = event.detail.result.staff;
        }
        if (event.detail.result) {
            dragSelection.currentResult = event.detail.result;
        }

        const position = getMusicalPosition(event.detail.result);
        if (position) dragSelection.endPosition = position;
        if (dragSelection.moved) {
            updateMarqueeFromDrag(container);
            updateRangeSelection(container);
        }
    }

    function cancelDragSelection() {
        if (dragSelection?.moved) setSelectedNotes(dragSelection.baseSelection);
        clearMarquee();
        dragSelection = null;
    }

    function suppressNextClick(pointerId) {
        suppressedClickPointerId = pointerId;
        window.clearTimeout(suppressClickTimer);
        suppressClickTimer = window.setTimeout(() => {
            suppressedClickPointerId = null;
        }, 300);
    }

    function handlePartitionPointer(event, container) {
        if (window.TextDragActions?.isDraggingText()) {
            if (dragSelection) cancelDragSelection();
            return;
        }

        if (window.TransposeActions?.isDraggingNote()) {
            if (dragSelection) cancelDragSelection();
            return;
        }

        if (!isScoreSelectionMode()) {
            if (dragSelection) cancelDragSelection();
            return;
        }

        const pointer = event.detail;
        if (pointer.phase === "start") {
            window.clearTimeout(suppressClickTimer);
            suppressedClickPointerId = null;

            const startPosition = getMusicalPosition(pointer.result);
            if (!startPosition || !pointer.clientPosition) return;

            dragSelection = {
                pointerId: pointer.pointerId,
                startPosition,
                endPosition: startPosition,
                startResult: pointer.result,
                currentResult: pointer.result,
                startClient: pointer.clientPosition,
                currentClient: pointer.clientPosition,
                startStaffBounds: pointer.result.staffBounds,
                currentStaffBounds: pointer.result.staffBounds,
                startStaff: pointer.result.staff,
                currentStaff: pointer.result.staff,
                additive: pointer.shiftKey,
                baseSelection: new Set(selectedNotes),
                moved: false
            };
            return;
        }

        if (!dragSelection || dragSelection.pointerId !== pointer.pointerId) return;
        updateDrag(event, container);

        if (pointer.phase === "end") {
            if (dragSelection.moved) {
                suppressNextClick(dragSelection.pointerId);
            }
            dragSelection = null;
        } else if (pointer.phase === "cancel") {
            cancelDragSelection();
        }
    }

    function clearSelectionOnBackgroundClick(event, container) {
        if (!isScoreSelectionMode()) return;
        if (!(event.target instanceof Element) || !container.contains(event.target)) return;
        if (window.PartitionClick.getSourceXmlElement(event.target)) return;
        if (event.pointerId === suppressedClickPointerId && suppressedClickPointerId !== null) return;

        clearToolbarSelection = true;
        clearSelectedNotes(true);
        clearMarquee();
    }

    function selectClickedElement(event, container) {
        if (!isScoreSelectionMode()) return;

        const click = event.detail;
        if (!click || !(click.element instanceof Element)) return;
        if (!container.contains(click.element)) return;
        if (click.pointerId === suppressedClickPointerId && suppressedClickPointerId !== null) return;

        const graphicalElement = click.graphicalElement;
        const sourceElement = click.musicXmlElement;
        if (!(graphicalElement instanceof Element) ||
            !(sourceElement instanceof Element) ||
            !container.contains(graphicalElement)) {
            clearToolbarSelection = true;
            clearSelectedNotes(true);
            clearMarquee();
            return;
        }

        clearToolbarSelection = false;
        if (!click.shiftKey) {
            clearSelectedNotes();
            clearMarquee();
        }

        graphicalElement.classList.add(selectedNoteClass);
        selectedNotes.add(graphicalElement);
        syncToolbarSelection();
    }

    function initialize(container, toolbarWindow) {
        if (isInitialized) return;
        if (!(container instanceof Element)) {
            throw new TypeError("SelectionActions requires a score container element.");
        }

        isInitialized = true;
        horizontalToolbarWindow = toolbarWindow || null;
        installStyles();
        refreshVoiceHighlight();
        syncToolbarSelection();
        container.addEventListener("click", event => {
            clearSelectionOnBackgroundClick(event, container);
        });
        window.addEventListener("viritura:partition-click", event => {
            if (!window.NotePlacementActions.handlePartitionClick(event.detail)) return;
            event.stopImmediatePropagation();
        }, true);
        window.addEventListener("viritura:partition-click", event => {
            selectClickedElement(event, container);
        });
        window.addEventListener("viritura:partition-pointer", event => {
            handlePartitionPointer(event, container);
        });
    }

    window.SelectionActions = Object.freeze({
        initialize,
        setActiveVoice,
        refreshVoiceHighlight,
        getSelectedNotes,
        replaceSelectedNotes,
        cancelPointerSelection: cancelDragSelection,
        suppressNextClick,
        refreshToolbarSelection: () => syncToolbarSelection(true)
    });
})();
