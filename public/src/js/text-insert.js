"use strict";

(() => {
    const dynamicKinds = new Set([
        "p", "pp", "ppp", "pppp", "mp", "mf", "f", "ff", "fff", "ffff",
        "pf", "sf", "sfp", "sfpp", "sfz", "sffz", "sffp", "fz", "rf", "rfz"
    ]);
    const beatUnitQuarterValues = {
        maxima: 32,
        long: 16,
        breve: 8,
        whole: 4,
        half: 2,
        quarter: 1,
        eighth: 0.5,
        "16th": 0.25,
        "32nd": 0.125,
        "64th": 0.0625,
        "128th": 0.03125,
        "256th": 0.015625
    };
    let scoreContainer = null;
    let placementStatus = null;
    let pendingText = null;
    let previousCursor = "";

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

    function setStatus(message) {
        if (!placementStatus) return;
        placementStatus.textContent = message;
        placementStatus.hidden = false;
    }

    function clearPlacement() {
        pendingText = null;
        if (scoreContainer) scoreContainer.style.cursor = previousCursor;
        if (placementStatus) placementStatus.hidden = true;
    }

    function cancelPlacement() {
        if (!pendingText) return;
        clearPlacement();
    }

    function validateTextRequest(request) {
        if (!request || typeof request !== "object") {
            throw new TypeError("Type de texte MusicXML invalide.");
        }
        const acceptedTypes = new Set([
            "words",
            "rehearsal",
            "metronome",
            "other-direction",
            "other-dynamics",
            "dynamics"
        ]);
        if (!acceptedTypes.has(request.type)) {
            throw new TypeError("Type de texte MusicXML non pris en charge.");
        }

        const text = typeof request.text === "string" ? request.text : "";
        if (["words", "rehearsal", "other-direction", "other-dynamics"]
            .includes(request.type) && !text.trim()) {
            throw new Error("Saisissez le texte à ajouter.");
        }

        if (request.type === "metronome") {
            if (!Object.prototype.hasOwnProperty.call(beatUnitQuarterValues, request.beatUnit) ||
                !Number.isFinite(request.perMinute) || request.perMinute <= 0) {
                throw new Error("Indication de tempo invalide.");
            }
        }

        if (request.type === "dynamics" && !dynamicKinds.has(request.dynamic)) {
            throw new Error("Nuance MusicXML invalide.");
        }

        return {
            type: request.type,
            text,
            beatUnit: request.beatUnit,
            perMinute: request.perMinute,
            dynamic: request.dynamic
        };
    }

    function getStaffPosition(result) {
        const target = result.element instanceof Element ? result.element : null;
        const staffLine = target?.closest("g.staffline");
        const measureGraphic = staffLine?.querySelector("g.vf-measure");
        if (!measureGraphic) return null;

        const width = measureGraphic.getBoundingClientRect().width;
        const linePositions = Array.from(measureGraphic.querySelectorAll(":scope > path"))
            .map(path => {
                const bounds = path.getBoundingClientRect();
                return { y: bounds.top + bounds.height / 2, width: bounds.width };
            })
            .filter(line => line.width >= width / 2)
            .map(line => line.y)
            .sort((first, second) => first - second);
        if (linePositions.length !== 5) return null;

        const spacing = linePositions.slice(1).reduce(
            (total, position, index) => total + position - linePositions[index],
            0
        ) / 4;
        if (!(spacing > 0) || !result.clientPosition) return null;

        const tenthsAboveStaff = -(result.clientPosition.y - linePositions[0]) /
            spacing * 10;
        return Math.round(tenthsAboveStaff * 10) / 10;
    }

    function getDivisionsAtMeasureStart(part, targetMeasure) {
        const measures = Array.from(part.children)
            .filter(child => getLocalName(child) === "measure");
        const targetIndex = measures.indexOf(targetMeasure);
        if (targetIndex < 0) return null;

        let divisions = 0;
        for (const [index, measure] of measures.entries()) {
            if (index > targetIndex) break;
            for (const child of measure.children) {
                if (index === targetIndex &&
                    ["note", "backup", "forward"].includes(getLocalName(child))) {
                    break;
                }
                if (getLocalName(child) !== "attributes") continue;
                const value = Number(getDirectChild(child, "divisions")?.textContent);
                if (Number.isFinite(value) && value > 0) divisions = value;
            }
        }
        return divisions > 0 ? divisions : null;
    }

    function getPlacementTarget(result, xmlDocument) {
        const partIndex = result.partIndex;
        const measure = Number.isInteger(partIndex)
            ? result.musicXmlMeasureElements?.[partIndex]
            : null;
        const part = measure?.parentElement;
        const fraction = result.timeInMeasure?.fraction;
        const staffNumber = Number(result.staffNumber);
        if (measure?.ownerDocument !== xmlDocument ||
            getLocalName(measure) !== "measure" ||
            getLocalName(part) !== "part" ||
            !Number.isFinite(fraction) || fraction < 0 ||
            !Number.isInteger(staffNumber) || staffNumber < 1) {
            throw new Error("Cliquez dans une mesure et sur une portée pour placer le texte.");
        }

        const divisions = getDivisionsAtMeasureStart(part, measure);
        if (!divisions) {
            throw new Error("La mesure sélectionnée ne contient pas de divisions MusicXML valides.");
        }

        return {
            measure,
            staffNumber,
            offset: Math.max(0, Math.round(fraction * 4 * divisions)),
            defaultY: getStaffPosition(result)
        };
    }

    function appendText(parent, document, name, text) {
        const element = createXmlElement(document, parent, name);
        element.textContent = text;
        parent.appendChild(element);
        return element;
    }

    function buildDirection(document, placement, request) {
        const direction = createXmlElement(document, placement.measure, "direction");
        const directionType = createXmlElement(document, direction, "direction-type");
        let positionElement;
        let quarterTempo = null;

        if (request.type === "metronome") {
            const metronome = createXmlElement(document, directionType, "metronome");
            appendText(metronome, document, "beat-unit", request.beatUnit);
            appendText(metronome, document, "per-minute", String(request.perMinute));
            directionType.appendChild(metronome);
            positionElement = metronome;
            quarterTempo = request.perMinute * beatUnitQuarterValues[request.beatUnit];
        } else if (request.type === "dynamics" || request.type === "other-dynamics") {
            const dynamics = createXmlElement(document, directionType, "dynamics");
            const dynamic = createXmlElement(
                document,
                dynamics,
                request.type === "dynamics" ? request.dynamic : "other-dynamics"
            );
            if (request.type === "other-dynamics") dynamic.textContent = request.text;
            dynamics.appendChild(dynamic);
            directionType.appendChild(dynamics);
            positionElement = dynamics;
        } else {
            positionElement = appendText(
                directionType,
                document,
                request.type,
                request.text
            );
        }

        if (placement.defaultY !== null) {
            positionElement.setAttribute("default-y", String(placement.defaultY));
        }
        direction.setAttribute(
            "placement",
            placement.defaultY !== null && placement.defaultY < 0 ? "below" : "above"
        );
        direction.appendChild(directionType);
        if (placement.offset) {
            const offset = createXmlElement(document, direction, "offset");
            offset.textContent = String(placement.offset);
            direction.appendChild(offset);
        }
        const staff = createXmlElement(document, direction, "staff");
        staff.textContent = String(placement.staffNumber);
        direction.appendChild(staff);
        if (quarterTempo !== null) {
            const sound = createXmlElement(document, direction, "sound");
            sound.setAttribute("tempo", String(Math.round(quarterTempo * 10) / 10));
            direction.appendChild(sound);
        }

        const measureChildren = Array.from(placement.measure.children);
        const firstCursorElement = measureChildren.find(child =>
            ["note", "backup", "forward"].includes(getLocalName(child))
        ) || measureChildren.find(child => getLocalName(child) === "barline");
        placement.measure.insertBefore(direction, firstCursorElement || null);
        return direction;
    }

    async function handleScoreClick(event) {
        if (!pendingText) return;
        event.preventDefault();
        event.stopImmediatePropagation();

        let direction = null;
        try {
            const result = event.detail;
            if (!result || !Number.isInteger(result.measureIndex)) {
                setStatus("Cliquez dans une mesure pour placer le texte. Échap pour annuler.");
                return;
            }
            const sourceDocument = window.PartitionClick.getMusicXmlDocument();
            const placement = getPlacementTarget(result, sourceDocument);
            const request = pendingText;
            clearPlacement();
            direction = buildDirection(sourceDocument, placement, request);
            const rendered = await window.FileActions.updateMusicXml(
                sourceDocument,
                "Added text to score"
            );
            if (!rendered) {
                throw new Error("La partition n’a pas pu être actualisée.");
            }
            window.SelectionActions.replaceSelectedNotes([]);
        } catch (error) {
            direction?.remove();
            clearPlacement();
            console.error("Could not add text to the MusicXML score.", error);
            window.alert(`Impossible d’ajouter le texte : ${error.message}`);
        }
    }

    function handleKeyDown(event) {
        if (!pendingText || event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        cancelPlacement();
    }

    function beginPlacement(request) {
        if (pendingText) cancelPlacement();
        const text = validateTextRequest(request);
        if (!scoreContainer || !window.PartitionClick.getMusicXmlDocument()) {
            throw new Error("Ouvrez d’abord un fichier MusicXML.");
        }

        pendingText = text;
        previousCursor = scoreContainer.style.cursor;
        scoreContainer.style.cursor = "crosshair";
        window.SelectionActions.replaceSelectedNotes([]);
        const label = {
            words: "le texte libre",
            rehearsal: "la marque de répétition",
            metronome: "l’indication de tempo",
            "other-direction": "l’autre direction",
            "other-dynamics": "la dynamique personnalisée",
            dynamics: "la nuance"
        }[text.type];
        setStatus(`Cliquez sur la partition pour placer ${label}. Échap pour annuler.`);
    }

    function initialize(container, statusElement) {
        if (scoreContainer) return;
        if (!(container instanceof Element) || !(statusElement instanceof Element)) {
            throw new TypeError("TextInsertActions requires a score and placement status element.");
        }
        scoreContainer = container;
        placementStatus = statusElement;
        window.addEventListener("viritura:partition-click", handleScoreClick, true);
        window.addEventListener("keydown", handleKeyDown, true);
    }

    window.TextInsertActions = Object.freeze({
        initialize,
        beginPlacement,
        cancelPlacement
    });
})();
