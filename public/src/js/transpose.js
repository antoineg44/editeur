"use strict";

(() => {
    const steps = ["C", "D", "E", "F", "G", "A", "B"];
    const sharpOrder = ["F", "C", "G", "D", "A", "E", "B"];
    const flatOrder = ["B", "E", "A", "D", "G", "C", "F"];
    const dragThreshold = 5;
    const accidentalNames = new Map([
        [-2, "flat-flat"],
        [-1.5, "three-quarters-flat"],
        [-1, "flat"],
        [-0.5, "quarter-flat"],
        [0, "natural"],
        [0.5, "quarter-sharp"],
        [1, "sharp"],
        [1.5, "three-quarters-sharp"],
        [2, "double-sharp"]
    ]);

    function getLocalName(element) {
        return element?.localName || element?.nodeName?.split(":").pop();
    }

    function getDirectChild(parent, name) {
        return Array.from(parent?.children || []).find(
            child => getLocalName(child) === name
        ) || null;
    }

    function getKeyAlteration(step, fifths) {
        if (fifths > 0) return sharpOrder.slice(0, fifths).includes(step) ? 1 : 0;
        if (fifths < 0) return flatOrder.slice(0, -fifths).includes(step) ? -1 : 0;
        return 0;
    }

    function getNoteStaffNumber(note) {
        const staff = getDirectChild(note, "staff");
        return staff?.textContent.trim() || "1";
    }

    function getKeyFifths(note) {
        let part = note.parentElement;
        while (part && getLocalName(part) !== "part") part = part.parentElement;
        if (!part) {
            throw new Error("The selected note is not inside a MusicXML part.");
        }

        const targetMeasure = note.parentElement;
        const staffNumber = getNoteStaffNumber(note);
        let fifths = 0;

        for (const measure of Array.from(part.children)) {
            if (getLocalName(measure) !== "measure") continue;
            for (const child of Array.from(measure.children)) {
                if (child === note) return fifths;
                if (getLocalName(child) !== "attributes") continue;

                const keys = Array.from(child.children).filter(
                    element => getLocalName(element) === "key"
                );
                const selectedKey = keys.find(
                    element => element.getAttribute("number") === staffNumber
                ) || keys.find(element => !element.hasAttribute("number"));
                if (!selectedKey) continue;
                const fifthsElement = getDirectChild(selectedKey, "fifths");
                if (!fifthsElement) {
                    throw new Error("The selected note uses a nonstandard key signature.");
                }

                const value = Number(fifthsElement.textContent);
                if (!Number.isInteger(value) || value < -7 || value > 7) {
                    throw new Error("The selected note has an unsupported key signature.");
                }
                fifths = value;
            }
            if (measure === targetMeasure) return fifths;
        }

        return fifths;
    }

    function getNumericAlteration(alterElement) {
        if (!alterElement) return 0;
        const value = Number(alterElement.textContent);
        if (!Number.isFinite(value)) {
            throw new Error("The selected note has an invalid pitch alteration.");
        }
        return value;
    }

    function createTranspositionPlan(note, diatonicSteps) {
        if (getLocalName(note) !== "note") return null;
        const pitch = getDirectChild(note, "pitch");
        if (!pitch) return null;

        const stepElement = getDirectChild(pitch, "step");
        const octaveElement = getDirectChild(pitch, "octave");
        const alterElement = getDirectChild(pitch, "alter");
        const step = stepElement?.textContent.trim().toUpperCase();
        const octave = Number(octaveElement?.textContent);
        const stepIndex = steps.indexOf(step);
        if (stepIndex < 0 || !Number.isInteger(octave)) {
            throw new Error("The selected note has an invalid MusicXML pitch.");
        }

        const fifths = getKeyFifths(note);
        const sourceAlter = getNumericAlteration(alterElement);
        const sourceKeyAlter = getKeyAlteration(step, fifths);
        const targetPosition = stepIndex + diatonicSteps;
        const targetStepIndex = ((targetPosition % steps.length) + steps.length) % steps.length;
        const targetStep = steps[targetStepIndex];
        const targetOctave = octave + Math.floor(targetPosition / steps.length);
        const targetKeyAlter = getKeyAlteration(targetStep, fifths);
        const targetAlter = targetKeyAlter + sourceAlter - sourceKeyAlter;
        const accidentalElement = getDirectChild(note, "accidental");
        const accidentalName = accidentalNames.get(targetAlter);

        if (accidentalElement && targetAlter !== targetKeyAlter && !accidentalName) {
            throw new Error("The selected note would require an unsupported accidental.");
        }

        return {
            note,
            pitch,
            stepElement,
            octaveElement,
            alterElement,
            accidentalElement,
            targetStep,
            targetOctave,
            targetAlter,
            targetKeyAlter,
            accidentalName
        };
    }

    function createXmlElement(document, parent, name) {
        const qualifiedName = parent.prefix ? `${parent.prefix}:${name}` : name;
        return parent.namespaceURI
            ? document.createElementNS(parent.namespaceURI, qualifiedName)
            : document.createElement(qualifiedName);
    }

    function applyTranspositionPlan(plan, document) {
        plan.stepElement.textContent = plan.targetStep;
        plan.octaveElement.textContent = String(plan.targetOctave);

        if (Math.abs(plan.targetAlter) < 1e-8 && plan.targetKeyAlter === 0) {
            plan.alterElement?.remove();
        } else {
            const alteration = Math.abs(plan.targetAlter) < 1e-8
                ? "0"
                : String(plan.targetAlter);
            if (plan.alterElement) {
                plan.alterElement.textContent = alteration;
            } else {
                const alterElement = createXmlElement(document, plan.pitch, "alter");
                alterElement.textContent = alteration;
                plan.pitch.insertBefore(alterElement, plan.octaveElement);
            }
        }

        if (!plan.accidentalElement) return;
        if (plan.targetAlter === plan.targetKeyAlter) {
            plan.accidentalElement.remove();
            return;
        }
        plan.accidentalElement.textContent = plan.accidentalName;
    }

    function isEditableTarget(target) {
        return target instanceof Element &&
            Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    }

    function reportError(error) {
        console.error("Could not transpose the selected MusicXML notes.", error);
        window.alert("Impossible de transposer les notes sélectionnées.");
    }

    function getPitchPosition(pitch) {
        const index = steps.indexOf(pitch?.note);
        if (index < 0 || !Number.isInteger(pitch?.octave)) return null;
        return pitch.octave * steps.length + index;
    }

    function getNotePitch(note) {
        const pitch = getDirectChild(note, "pitch");
        const step = getDirectChild(pitch, "step")?.textContent.trim().toUpperCase();
        const octave = Number(getDirectChild(pitch, "octave")?.textContent);
        return { note: step, octave };
    }

    function getGraphicalNote(element) {
        return element instanceof Element
            ? element.closest('g.vf-stavenote[id^="vf-auto"]')
            : null;
    }

    function getStaffStepHeight(note) {
        const measure = note.closest("g.staffline")?.querySelector("g.vf-measure");
        if (!measure) return null;

        const measureWidth = measure.getBoundingClientRect().width;
        const linePositions = Array.from(measure.querySelectorAll(":scope > path"))
            .map(path => {
                const bounds = path.getBoundingClientRect();
                return {
                    y: bounds.top + bounds.height / 2,
                    width: bounds.width
                };
            })
            .filter(line => line.width >= measureWidth / 2)
            .map(line => line.y)
            .sort((a, b) => a - b);
        if (linePositions.length !== 5) return null;

        const lineSpacing = linePositions.slice(1).reduce(
            (total, position, index) => total + position - linePositions[index],
            0
        ) / 4;
        return lineSpacing / 2;
    }

    function getLocalVerticalDelta(note, start, verticalDelta) {
        const matrix = note.getScreenCTM();
        const svg = note.ownerSVGElement;
        if (!matrix || !svg) return null;

        const inverse = matrix.inverse();
        const startPoint = svg.createSVGPoint();
        startPoint.x = start.x;
        startPoint.y = start.y;
        const currentPoint = svg.createSVGPoint();
        currentPoint.x = start.x;
        currentPoint.y = start.y + verticalDelta;
        const localStart = startPoint.matrixTransform(inverse);
        const localCurrent = currentPoint.matrixTransform(inverse);
        return {
            x: localCurrent.x - localStart.x,
            y: localCurrent.y - localStart.y
        };
    }

    function restoreDraggedNote(drag) {
        if (drag.note.isConnected) {
            if (drag.originalTransform === null) {
                drag.note.removeAttribute("transform");
            } else {
                drag.note.setAttribute("transform", drag.originalTransform);
            }
        }
    }

    function updateDraggedNote(drag) {
        const position = getLocalVerticalDelta(
            drag.note,
            drag.startClient,
            -drag.staffStepHeight * drag.targetSteps
        );
        if (!position) return;

        const original = drag.originalTransform || "";
        drag.note.setAttribute(
            "transform",
            `${original}${original ? " " : ""}translate(${position.x} ${position.y})`
        );
    }

    function beginNoteDrag(pointer) {
        if (window.MenuActions.getSelectedMenu() !== "write" ||
            pointer.result?.musicXmlTag !== "note" ||
            !pointer.clientPosition ||
            !pointer.result.pitch) return;

        const noteElement = pointer.result.musicXmlElement;
        const note = getGraphicalNote(pointer.result.element);
        const sourcePitch = noteElement && getNotePitch(noteElement);
        const startPitchPosition = getPitchPosition(pointer.result.pitch);
        const staffStepHeight = note && getStaffStepHeight(note);
        if (!note || !noteElement || !getDirectChild(noteElement, "pitch") ||
            !Number.isInteger(getPitchPosition(sourcePitch)) ||
            !Number.isInteger(startPitchPosition) ||
            !Number.isFinite(staffStepHeight) || staffStepHeight <= 0) return;

        activeNoteDrag = {
            pointerId: pointer.pointerId,
            note,
            noteElement,
            startPitchPosition,
            staffStepHeight,
            startStaff: pointer.result.staff,
            startClient: pointer.clientPosition,
            originalTransform: note.getAttribute("transform"),
            baseSelection: window.SelectionActions.getSelectedNotes(),
            targetSteps: 0,
            hasMoved: false
        };
        window.SelectionActions.cancelPointerSelection();
    }

    function updateNoteDrag(pointer) {
        const drag = activeNoteDrag;
        if (!drag || drag.pointerId !== pointer.pointerId) return;
        if (pointer.clientPosition) {
            const distance = Math.hypot(
                pointer.clientPosition.x - drag.startClient.x,
                pointer.clientPosition.y - drag.startClient.y
            );
            if (!drag.hasMoved && distance >= dragThreshold) {
                drag.hasMoved = true;
                window.SelectionActions.replaceSelectedNotes([drag.note]);
            }
        }
        if (!drag.hasMoved) return;

        const result = pointer.result;
        if (result?.staff === drag.startStaff && result.pitch) {
            const pitchPosition = getPitchPosition(result.pitch);
            if (pitchPosition !== null) {
                drag.targetSteps = pitchPosition - drag.startPitchPosition;
                updateDraggedNote(drag);
            }
        }
    }

    function finishNoteDrag(pointer) {
        const drag = activeNoteDrag;
        if (!drag || drag.pointerId !== pointer.pointerId) return;

        updateNoteDrag(pointer);
        activeNoteDrag = null;
        if (pointer.phase === "cancel") {
            restoreDraggedNote(drag);
            if (drag.hasMoved) {
                window.SelectionActions.replaceSelectedNotes(drag.baseSelection);
            }
            return;
        }

        if (!drag.hasMoved) {
            restoreDraggedNote(drag);
            return;
        }
        if (!drag.targetSteps) {
            restoreDraggedNote(drag);
            return;
        }

        try {
            const plan = createTranspositionPlan(drag.noteElement, drag.targetSteps);
            if (!plan) {
                restoreDraggedNote(drag);
                return;
            }
            const xmlDocument = window.PartitionClick.getMusicXmlDocument();
            if (!xmlDocument) throw new Error("No MusicXML document is currently loaded.");
            applyTranspositionPlan(plan, xmlDocument);

            window.FileActions.updateMusicXml(
                xmlDocument,
                "Transposed note by dragging"
            ).then(rendered => {
                if (!rendered) return;
                const graphicalElements =
                    window.PartitionClick.getGraphicalElementsForSourceXmlElements([plan.note]);
                window.SelectionActions.replaceSelectedNotes(graphicalElements);
            }).catch(reportError);
        } catch (error) {
            restoreDraggedNote(drag);
            reportError(error);
        }
    }

    function handlePartitionPointer(event) {
        const pointer = event.detail;
        if (pointer.phase === "start") {
            beginNoteDrag(pointer);
            return;
        }
        if (!activeNoteDrag || activeNoteDrag.pointerId !== pointer.pointerId) return;
        if (pointer.phase === "move") {
            updateNoteDrag(pointer);
        } else {
            finishNoteDrag(pointer);
        }
    }

    function handleKeyDown(event) {
        if ((event.key !== "ArrowUp" && event.key !== "ArrowDown") ||
            event.altKey || event.ctrlKey || event.metaKey ||
            isEditableTarget(event.target) ||
            window.MenuActions.getSelectedMenu() !== "write") {
            return;
        }

        const selectedNotes = window.SelectionActions.getSelectedNotes();
        if (!selectedNotes.length) return;

        try {
            const sourceNotes = Array.from(new Set(selectedNotes
                .map(element => window.PartitionClick.getSourceXmlElement(element))
                .filter(Boolean)));
            const direction = event.key === "ArrowUp" ? 1 : -1;
            const plans = sourceNotes
                .map(note => createTranspositionPlan(note, direction))
                .filter(Boolean);
            if (!plans.length) return;

            const xmlDocument = window.PartitionClick.getMusicXmlDocument();
            if (!xmlDocument) throw new Error("No MusicXML document is currently loaded.");

            event.preventDefault();
            for (const plan of plans) applyTranspositionPlan(plan, xmlDocument);

            window.FileActions.updateMusicXml(xmlDocument, "Transposed selected notes").then(rendered => {
                if (!rendered) return;
                const graphicalElements =
                    window.PartitionClick.getGraphicalElementsForSourceXmlElements(
                        plans.map(plan => plan.note)
                    );
                window.SelectionActions.replaceSelectedNotes(graphicalElements);
            }).catch(reportError);
        } catch (error) {
            reportError(error);
        }
    }

    function initialize() {
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("viritura:partition-pointer", handlePartitionPointer);
    }

    let activeNoteDrag = null;

    window.TransposeActions = Object.freeze({
        initialize,
        isDraggingNote: () => activeNoteDrag !== null
    });
})();
