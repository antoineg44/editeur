"use strict";

(() => {
    const dragThreshold = 5;
    const positionedTextNames = new Set([
        "text",
        "words",
        "rehearsal",
        "other-dynamics",
        "other-direction",
        "harmony",
        "lyric",
        "credit-words",
        "metronome"
    ]);
    const dynamicNames = new Set([
        "p", "pp", "ppp", "pppp", "f", "ff", "fff", "ffff",
        "mp", "mf", "pf", "sf", "sfp", "sfpp", "fp", "fz", "sfz",
        "sffz", "sffp", "rf", "rfz", "other-dynamics"
    ]);
    let activeDrag = null;

    function getLocalName(element) {
        return element?.localName || element?.nodeName?.split(":").pop();
    }

    function getPositionElement(sourceElement) {
        const name = getLocalName(sourceElement);
        if (dynamicNames.has(name) && getLocalName(sourceElement.parentElement) === "dynamics") {
            return sourceElement.parentElement;
        }
        if (name === "direction") {
            return sourceElement.getElementsByTagName("metronome")[0] || null;
        }
        return positionedTextNames.has(name) ? sourceElement : null;
    }

    function getStaffSpacePixels(graphic) {
        const svg = graphic.ownerSVGElement;
        const staffLine = graphic.closest("g.staffline") ||
            svg?.querySelector("g.staffline");
        const measure = staffLine?.querySelector("g.vf-measure");
        if (!measure) return null;

        const measureWidth = measure.getBoundingClientRect().width;
        const linePositions = Array.from(measure.querySelectorAll(":scope > path"))
            .map(path => {
                const bounds = path.getBoundingClientRect();
                return { y: bounds.top + bounds.height / 2, width: bounds.width };
            })
            .filter(line => line.width >= measureWidth / 2)
            .map(line => line.y)
            .sort((first, second) => first - second);
        if (linePositions.length !== 5) return null;

        const spacing = linePositions.slice(1).reduce(
            (total, position, index) => total + position - linePositions[index],
            0
        ) / 4;
        return spacing > 0 ? spacing : null;
    }

    function getLocalDelta(graphic, start, current) {
        const parent = graphic.parentElement;
        const svg = graphic.ownerSVGElement;
        const matrix = parent?.getScreenCTM();
        if (!parent || !svg || !matrix) return null;

        const inverse = matrix.inverse();
        const startPoint = svg.createSVGPoint();
        startPoint.x = start.x;
        startPoint.y = start.y;
        const currentPoint = svg.createSVGPoint();
        currentPoint.x = current.x;
        currentPoint.y = current.y;
        const localStart = startPoint.matrixTransform(inverse);
        const localCurrent = currentPoint.matrixTransform(inverse);
        return {
            x: localCurrent.x - localStart.x,
            y: localCurrent.y - localStart.y
        };
    }

    function restoreGraphic(drag) {
        if (!drag.graphic.isConnected) return;
        if (drag.originalTransform === null) {
            drag.graphic.removeAttribute("transform");
        } else {
            drag.graphic.setAttribute("transform", drag.originalTransform);
        }
    }

    function restorePositionAttribute(drag, name) {
        if (drag.originalPosition[name] === null) {
            drag.positionElement.removeAttribute(name);
        } else {
            drag.positionElement.setAttribute(name, drag.originalPosition[name]);
        }
    }

    function reportError(error) {
        console.error("Could not move the selected MusicXML text.", error);
        window.alert("Impossible de déplacer le texte sélectionné.");
    }

    function updateTextDrag(pointer) {
        const drag = activeDrag;
        if (!drag || drag.pointerId !== pointer.pointerId || !pointer.clientPosition) return;

        const distance = Math.hypot(
            pointer.clientPosition.x - drag.startClient.x,
            pointer.clientPosition.y - drag.startClient.y
        );
        if (!drag.hasMoved && distance >= dragThreshold) {
            drag.hasMoved = true;
            window.SelectionActions.replaceSelectedNotes([drag.graphic]);
        }
        if (!drag.hasMoved) return;

        const delta = getLocalDelta(drag.graphic, drag.startClient, pointer.clientPosition);
        if (!delta) return;
        drag.graphic.setAttribute(
            "transform",
            `translate(${delta.x} ${delta.y})${drag.originalTransform
                ? ` ${drag.originalTransform}`
                : ""}`
        );
    }

    function beginTextDrag(pointer) {
        if (window.MenuActions.getSelectedMenu() !== "write" ||
            !Number.isInteger(pointer.pointerId) ||
            !pointer.clientPosition ||
            !(pointer.result?.element instanceof Element)) {
            return;
        }

        const graphic = pointer.result.element.closest("g.vf-text");
        const sourceElement = pointer.result.musicXmlElement;
        const xmlDocument = window.PartitionClick.getMusicXmlDocument();
        const positionElement = getPositionElement(sourceElement);
        const staffSpacePixels = graphic ? getStaffSpacePixels(graphic) : null;
        if (!graphic || !sourceElement || !positionElement ||
            sourceElement.ownerDocument !== xmlDocument ||
            positionElement.ownerDocument !== xmlDocument ||
            !Number.isFinite(staffSpacePixels)) {
            return;
        }

        activeDrag = {
            pointerId: pointer.pointerId,
            graphic,
            sourceElement,
            positionElement,
            xmlDocument,
            staffSpacePixels,
            startClient: pointer.clientPosition,
            originalTransform: graphic.getAttribute("transform"),
            originalPosition: {
                "relative-x": positionElement.getAttribute("relative-x"),
                "relative-y": positionElement.getAttribute("relative-y")
            },
            baseSelection: window.SelectionActions.getSelectedNotes(),
            hasMoved: false
        };
        window.SelectionActions.cancelPointerSelection();
    }

    function finishTextDrag(pointer) {
        const drag = activeDrag;
        if (!drag || drag.pointerId !== pointer.pointerId) return;
        updateTextDrag(pointer);
        activeDrag = null;

        if (pointer.phase === "cancel" || !drag.hasMoved) {
            restoreGraphic(drag);
            if (pointer.phase === "cancel" && drag.hasMoved) {
                window.SelectionActions.replaceSelectedNotes(drag.baseSelection);
            }
            return;
        }

        const delta = getLocalDelta(drag.graphic, drag.startClient, pointer.clientPosition);
        if (!delta) {
            restoreGraphic(drag);
            window.SelectionActions.replaceSelectedNotes(drag.baseSelection);
            return;
        }

        const horizontal = delta.x / drag.staffSpacePixels * 10;
        const vertical = -delta.y / drag.staffSpacePixels * 10;
        const changes = [
            ["relative-x", horizontal],
            ["relative-y", vertical]
        ].map(([name, change]) => {
            const original = drag.originalPosition[name];
            const value = original === null ? 0 : Number(original);
            return { name, original, value, change };
        });
        const invalidChange = changes.find(change =>
            !Number.isFinite(change.value) || !Number.isFinite(change.change)
        );
        if (invalidChange) {
            restoreGraphic(drag);
            window.SelectionActions.replaceSelectedNotes(drag.baseSelection);
            reportError(new Error(`Invalid MusicXML ${invalidChange.name} value.`));
            return;
        }

        for (const { name, original, value, change } of changes) {
            const next = Math.round((value + change) * 10) / 10;
            if (original === null && Math.abs(next) < 0.05) {
                drag.positionElement.removeAttribute(name);
            } else {
                drag.positionElement.setAttribute(name, String(next));
            }
        }

        window.SelectionActions.suppressNextClick(pointer.pointerId);
        window.FileActions.updateMusicXml(
            drag.xmlDocument,
            "Moved selected text"
        ).then(rendered => {
            if (!rendered) {
                restorePositionAttribute(drag, "relative-x");
                restorePositionAttribute(drag, "relative-y");
                restoreGraphic(drag);
                window.SelectionActions.replaceSelectedNotes(drag.baseSelection);
                throw new Error("The score could not be refreshed after moving the text.");
            }
            window.SelectionActions.replaceSelectedNotes([]);
        }).catch(error => {
            restorePositionAttribute(drag, "relative-x");
            restorePositionAttribute(drag, "relative-y");
            restoreGraphic(drag);
            window.SelectionActions.replaceSelectedNotes(drag.baseSelection);
            reportError(error);
        });
    }

    function handlePartitionPointer(event) {
        const pointer = event.detail;
        if (pointer.phase === "start") {
            beginTextDrag(pointer);
            return;
        }
        if (!activeDrag || activeDrag.pointerId !== pointer.pointerId) return;
        if (pointer.phase === "move") {
            updateTextDrag(pointer);
        } else {
            finishTextDrag(pointer);
        }
    }

    function initialize() {
        window.addEventListener("viritura:partition-pointer", handlePartitionPointer);
    }

    window.TextDragActions = Object.freeze({
        initialize,
        isDraggingText: () => activeDrag !== null
    });
})();
