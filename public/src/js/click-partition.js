"use strict";

(() => {
    let musicXmlDocument = null;
    let scoreDisplay = null;
    let isInitialized = false;
    let activePointerId = null;
    let activePointerSvg = null;
    const sourceXmlByGraphicalElement = new WeakMap();
    const standaloneTextTags = new Set([
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

    function findClickedNote(osmd, target) {
        const noteElement = target.closest('[id^="vf-auto"]');
        if (!noteElement) return null;

        const measures = osmd.graphic && osmd.graphic.measureList;
        if (!measures) return null;

        for (const measureStaves of measures) {
            for (const staff of measureStaves) {
                for (const staffEntry of staff.staffEntries) {
                    for (const voiceEntry of staffEntry.graphicalVoiceEntries) {
                        for (const graphicalNote of voiceEntry.notes) {
                            const svgElement = graphicalNote.getSVGGElement();
                            if (svgElement && (
                                svgElement.id === noteElement.id ||
                                noteElement.id.startsWith(`${svgElement.id}-`)
                            )) {
                                return {
                                    sourceNote: graphicalNote.sourceNote,
                                    graphicalElement: svgElement,
                                    timeInMeasure: staffEntry.relInMeasureTimestamp?.RealValue ?? null
                                };
                            }
                        }
                    }
                }
            }
        }

        return null;
    }

    function getPosition(osmd, event, svg) {
        const screenMatrix = svg.getScreenCTM();
        if (!screenMatrix || typeof svg.createSVGPoint !== "function") return null;

        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const svgPoint = point.matrixTransform(screenMatrix.inverse());

        return osmd.GraphicSheet.svgToOsmd({
            x: svgPoint.x,
            y: svgPoint.y
        });
    }

    function findMeasureAtPosition(osmd, svg, position, target) {
        const pageIndex = Array.from(
            document.querySelectorAll("#musicxml-score svg")
        ).indexOf(svg);
        const page = osmd.GraphicSheet.musicPages[pageIndex];
        if (!page) return null;

        for (let systemIndex = 0; systemIndex < page.musicSystems.length; systemIndex++) {
            const system = page.musicSystems[systemIndex];
            for (let staffIndex = 0; staffIndex < system.staffLines.length; staffIndex++) {
                const staffLine = system.staffLines[staffIndex];
                for (const measure of staffLine.measures) {
                    if (measure && measure.boundingBox.pointLiesInsideBorders(position)) {
                        return { measure, systemIndex, staffIndex, pageIndex };
                    }
                }
            }
        }

        const measureElement = target.closest("g.vf-measure");
        const measureNumber = Number(measureElement?.id);
        if (Number.isFinite(measureNumber)) {
            for (let systemIndex = 0; systemIndex < page.musicSystems.length; systemIndex++) {
                const system = page.musicSystems[systemIndex];
                for (let staffIndex = 0; staffIndex < system.staffLines.length; staffIndex++) {
                    const measure = system.staffLines[staffIndex].measures.find(
                        candidate => candidate && Number(candidate.measureNumber) === measureNumber
                    );
                    if (measure) return { measure, systemIndex, staffIndex, pageIndex };
                }
            }
        }

        const staffLineElement = target.closest("g.staffline");
        const staffLineElements = Array.from(
            document.querySelectorAll("#musicxml-score g.staffline")
        );
        const staffLineElementIndex = staffLineElements.indexOf(staffLineElement);
        if (staffLineElementIndex >= 0) {
            let currentStaffLineIndex = 0;
            for (let currentPageIndex = 0;
                currentPageIndex < osmd.GraphicSheet.musicPages.length;
                currentPageIndex++) {
                const currentPage = osmd.GraphicSheet.musicPages[currentPageIndex];
                for (let systemIndex = 0;
                    systemIndex < currentPage.musicSystems.length;
                    systemIndex++) {
                    const system = currentPage.musicSystems[systemIndex];
                    for (let staffIndex = 0;
                        staffIndex < system.staffLines.length;
                        staffIndex++) {
                        const staffLine = system.staffLines[staffIndex];
                        if (currentStaffLineIndex++ !== staffLineElementIndex) continue;

                        const measure = staffLine.measures.find(candidate => {
                            const box = candidate?.boundingBox;
                            const left = box?.absolutePosition?.x;
                            const right = left + box?.size?.width;
                            return Number.isFinite(left) && Number.isFinite(right) &&
                                position.x >= left && position.x <= right;
                        });
                        return measure
                            ? { measure, systemIndex, staffIndex, pageIndex: currentPageIndex }
                            : null;
                    }
                }
            }
        }

        return null;
    }

    function getTimeInMeasure(measure, clickX) {
        const entries = measure.staffEntries
            .map(entry => {
                const box = entry.PositionAndShape || entry.boundingBox;
                return {
                    x: box?.absolutePosition?.x,
                    time: entry.relInMeasureTimestamp?.RealValue
                };
            })
            .filter(entry => Number.isFinite(entry.x) && Number.isFinite(entry.time))
            .sort((a, b) => a.x - b.x);

        if (!entries.length) return null;

        const box = measure.boundingBox;
        const duration = measure.parentSourceMeasure?.Duration?.RealValue;
        if (!Number.isFinite(duration)) return null;

        entries.unshift({ x: box.absolutePosition.x, time: 0 });
        entries.push({
            x: box.absolutePosition.x + box.size.width,
            time: duration
        });

        for (let index = 0; index < entries.length - 1; index++) {
            const start = entries[index];
            const end = entries[index + 1];
            if (clickX < start.x || clickX > end.x) continue;

            const ratio = (clickX - start.x) / (end.x - start.x || 1);
            const fraction = start.time + ratio * (end.time - start.time);
            return { fraction, quarterBeats: fraction * 4 };
        }

        return null;
    }

    function getPitchFromY(measure, clickY) {
        const staffLine = measure.parentStaffLine;
        const clef = measure.InitiallyActiveClef;
        if (!staffLine || !clef) return null;

        const staffY = staffLine.PositionAndShape.absolutePosition.y;
        const positions = staffLine.staffLines
            .map(line => staffY + (line.start.y + line.end.y) / 2)
            .sort((a, b) => a - b);
        if (positions.length !== 5) return null;

        const spacing = positions.slice(1).reduce(
            (total, position, index) => total + position - positions[index],
            0
        ) / 4;
        const steps = Math.round((positions[4] - clickY) / (spacing / 2));
        const clefs = {
            0: { note: 4, octave: 4, line: 2 },
            1: { note: 3, octave: 3, line: 4 },
            2: { note: 0, octave: 4, line: 3 }
        };
        const reference = clefs[clef.ClefType];
        if (!reference) return null;

        const referencePosition = reference.octave * 7 + reference.note;
        const referenceSteps = (reference.line - 1) * 2;
        const pitchPosition = referencePosition + steps - referenceSteps +
            (clef.OctaveOffset || 0) * 7;
        const notes = ["C", "D", "E", "F", "G", "A", "B"];
        const noteIndex = ((pitchPosition % 7) + 7) % 7;

        return {
            note: notes[noteIndex],
            octave: Math.floor(pitchPosition / 7),
            clefType: clef.ClefType
        };
    }

    function getMeasureXmlElements(measure) {
        if (!musicXmlDocument) return [];
        const parts = Array.from(musicXmlDocument.getElementsByTagName("part"));
        const measureIndex = measure.parentSourceMeasure?.measureListIndex;
        const measures = parts.map(part =>
            Array.from(part.children).filter(element => element.localName === "measure")
        );

        if (Number.isInteger(measureIndex) && measureIndex >= 0) {
            return measures.map(partMeasures => partMeasures[measureIndex]).filter(Boolean);
        }

        const measureNumber = Number(measure.measureNumber);
        if (!Number.isFinite(measureNumber) || measureNumber < 1) return [];
        return measures.map(partMeasures =>
            partMeasures.find(element => Number(element.getAttribute("number")) === measureNumber)
        ).filter(Boolean);
    }

    function getAncestor(element, name) {
        let current = element;
        while (current && current.localName !== name) current = current.parentElement;
        return current || null;
    }

    function normalizeText(text) {
        return text.replace(/\s+/g, " ").trim();
    }

    function getStandaloneTextSourceElement(text) {
        if (!musicXmlDocument) return null;
        const candidates = Array.from(musicXmlDocument.getElementsByTagName("*"))
            .filter(element =>
                standaloneTextTags.has(element.localName) &&
                element.children.length === 0 &&
                !getAncestor(element, "measure") &&
                normalizeText(element.textContent) === text
            );
        const creators = candidates.filter(element =>
            element.localName === "creator"
        );
        if (creators.length === 1) return creators[0];
        const creditWords = candidates.filter(element =>
            element.localName === "credit-words"
        );
        if (creditWords.length === 1) return creditWords[0];
        return candidates.length === 1 ? candidates[0] : null;
    }

    function getTextSourceElement(target, measure) {
        const group = target.closest("g.vf-text");
        if (!group) return null;
        const text = normalizeText(group.textContent);
        if (!text) return null;
        if (!measure) return getStandaloneTextSourceElement(text);

        const lyrics = Array.from(measure.getElementsByTagName("lyric"));
        if (group.classList.contains("lyrics") || group.classList.contains("dash")) {
            const exactLyrics = lyrics.filter(lyric =>
                Array.from(lyric.children)
                    .some(child => child.localName === "text" && child.textContent.trim() === text)
            );
            const candidates = exactLyrics.length ? exactLyrics : lyrics;
            const targetX = group.getBoundingClientRect().left +
                group.getBoundingClientRect().width / 2;
            return candidates
                .map(lyric => {
                    const note = getAncestor(lyric, "note");
                    const graphicalNote = note
                        ? getGraphicalElementsForSourceXmlElements([note])[0]
                        : null;
                    const bounds = graphicalNote?.getBoundingClientRect();
                    return {
                        lyric,
                        distance: bounds
                            ? Math.abs(targetX - (bounds.left + bounds.width / 2))
                            : Number.POSITIVE_INFINITY
                    };
                })
                .sort((left, right) => left.distance - right.distance)[0]?.lyric || null;
        }

        const matchingText = Array.from(measure.getElementsByTagName("*"))
            .filter(element =>
                element.children.length === 0 && element.textContent.trim() === text
            );
        const preferredText = matchingText.find(element =>
            ["text", "words", "rehearsal", "other-dynamics"].includes(element.localName)
        );
        if (preferredText) return preferredText;
        if (matchingText.length) return matchingText[0];

        const dynamic = Array.from(measure.getElementsByTagName("dynamics"))
            .flatMap(element => Array.from(element.children))
            .find(element => element.localName.toLowerCase() === text.toLowerCase());
        if (dynamic) return dynamic;

        const tempoValue = text.match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(",", ".");
        if (tempoValue) {
            const direction = Array.from(measure.getElementsByTagName("direction"))
                .find(element => Array.from(element.getElementsByTagName("sound"))
                    .some(sound => sound.getAttribute("tempo") === tempoValue));
            if (direction) return direction;
        }

        return Array.from(measure.getElementsByTagName("harmony"))[0] ||
            getStandaloneTextSourceElement(text);
    }

    function findClickedSourceElement(target, measure, staffNumber) {
        const textElement = getTextSourceElement(target, measure);
        if (textElement) return textElement;
        if (!measure) return null;

        const graphicalElement = target.closest(
            "g.vf-clef, g.vf-keysignature, g.vf-timesignature"
        );
        if (graphicalElement) {
            const tag = graphicalElement.classList.contains("vf-clef")
                ? "clef"
                : graphicalElement.classList.contains("vf-keysignature")
                    ? "key"
                    : "time";
            const candidates = Array.from(measure.getElementsByTagName(tag));
            return candidates.find(element =>
                !element.getAttribute("number") ||
                element.getAttribute("number") === String(staffNumber)
            ) || measure;
        }
        return measure;
    }

    function getPartStaffMapping(staffIndex, measureIndex) {
        if (!musicXmlDocument || !Number.isInteger(staffIndex) || staffIndex < 0) return null;

        let currentStaffIndex = 0;
        const parts = Array.from(musicXmlDocument.getElementsByTagName("part"))
            .filter(part => Array.from(part.children).some(child => child.localName === "measure"));
        for (let partIndex = 0; partIndex < parts.length; partIndex++) {
            const measures = Array.from(parts[partIndex].children)
                .filter(child => child.localName === "measure");
            let staffCount = 1;
            for (const [index, measure] of measures.entries()) {
                if (index > measureIndex) break;
                for (const attributes of Array.from(measure.children)
                    .filter(child => child.localName === "attributes")) {
                    const staves = Array.from(attributes.children)
                        .find(child => child.localName === "staves");
                    if (staves) {
                        const value = Number(staves.textContent);
                        if (Number.isInteger(value) && value > 0) staffCount = value;
                    }
                }
            }

            if (staffIndex < currentStaffIndex + staffCount) {
                return {
                    partIndex,
                    staffNumber: staffIndex - currentStaffIndex + 1
                };
            }
            currentStaffIndex += staffCount;
        }

        return null;
    }

    function findSvgAtPosition(event) {
        return Array.from(document.querySelectorAll("#musicxml-score svg")).find(svg => {
            const bounds = svg.getBoundingClientRect();
            return event.clientX >= bounds.left && event.clientX <= bounds.right &&
                event.clientY >= bounds.top && event.clientY <= bounds.bottom;
        }) || null;
    }

    function getClickResult(osmd, event, fallbackSvg = null) {
        const pointedTarget = document.elementFromPoint(event.clientX, event.clientY);
        const pointedSvg = pointedTarget instanceof Element
            ? pointedTarget.closest("svg")
            : null;
        const eventSvg = event.target instanceof Element
            ? event.target.closest("svg")
            : null;
        const svg = pointedSvg || findSvgAtPosition(event) || fallbackSvg || eventSvg;
        if (!svg) return null;

        const target = pointedSvg === svg ? pointedTarget : svg;
        const position = getPosition(osmd, event, svg);
        if (!position) return null;
        const location = findMeasureAtPosition(osmd, svg, position, target);
        const textGroup = target.closest("g.vf-text");
        if (!location && !textGroup) return null;

        const staffRect = location
            ? target.closest("g.staffline")?.getBoundingClientRect()
            : null;
        const clickedNote = findClickedNote(osmd, target);
        const measureXmlElements = location
            ? getMeasureXmlElements(location.measure)
            : [];
        const measureIndex = location
            ? location.measure.parentSourceMeasure?.measureListIndex ??
                Number(location.measure.measureNumber) - 1
            : null;
        const partStaff = location
            ? getPartStaffMapping(location.staffIndex, measureIndex)
            : null;
        const measureXmlElement = measureXmlElements[partStaff?.partIndex || 0] ||
            measureXmlElements[0] || null;
        const xmlElement = clickedNote?.sourceNote?.SourceXmlElement ||
            findClickedSourceElement(target, measureXmlElement, partStaff?.staffNumber || 1);
        if (!location && !xmlElement) return null;
        const graphicalElement = clickedNote?.graphicalElement ||
            target.closest('g[class*="vf-"]') || target.closest("g.staffline");
        if (xmlElement && graphicalElement) {
            for (let current = target; current && current !== svg; current = current.parentElement) {
                sourceXmlByGraphicalElement.set(current, xmlElement);
            }
            sourceXmlByGraphicalElement.set(graphicalElement, xmlElement);
        }
        const timeInMeasure = clickedNote && Number.isFinite(clickedNote.timeInMeasure)
            ? { fraction: clickedNote.timeInMeasure, quarterBeats: clickedNote.timeInMeasure * 4 }
            : location
                ? getTimeInMeasure(location.measure, position.x)
                : null;

        return {
            element: target,
            graphicalElement,
            pointerId: Number.isInteger(event.pointerId) ? event.pointerId : null,
            shiftKey: event.shiftKey,
            clientPosition: { x: event.clientX, y: event.clientY },
            page: location?.pageIndex ??
                Array.from(document.querySelectorAll("#musicxml-score svg")).indexOf(svg),
            staffBounds: staffRect
                ? { top: staffRect.top, bottom: staffRect.bottom }
                : null,
            system: location?.systemIndex ?? null,
            staff: location?.staffIndex ?? null,
            partIndex: partStaff?.partIndex ?? null,
            staffNumber: partStaff?.staffNumber ?? null,
            measure: location?.measure.measureNumber ?? null,
            measureIndex,
            position: { x: position.x, y: position.y },
            pitch: location ? getPitchFromY(location.measure, position.y) : null,
            timeInMeasure,
            musicXmlElement: xmlElement,
            musicXmlTag: xmlElement?.localName || null,
            musicXml: xmlElement?.outerHTML || null,
            musicXmlMeasureElements: measureXmlElements
        };
    }

    function dispatchPointerPosition(osmd, event, phase) {
        activePointerSvg = findSvgAtPosition(event) || activePointerSvg;
        window.dispatchEvent(new CustomEvent("viritura:partition-pointer", {
            detail: {
                phase,
                pointerId: event.pointerId,
                shiftKey: event.shiftKey,
                clientPosition: { x: event.clientX, y: event.clientY },
                result: getClickResult(osmd, event, activePointerSvg)
            }
        }));
    }

    function getElementsBetween(osmd, container, start, end, staffRange) {
        if (!osmd || !container) return [];
        const measures = osmd.graphic && osmd.graphic.measureList;
        if (!measures) return [];

        let lower = start;
        let upper = end;
        if (start.measureIndex > end.measureIndex ||
            (start.measureIndex === end.measureIndex && start.fraction > end.fraction)) {
            lower = end;
            upper = start;
        }

        const elements = new Set();
        for (let measureIndex = 0; measureIndex < measures.length; measureIndex++) {
            const measureStaves = measures[measureIndex] || [];
            for (let staffIndex = 0; staffIndex < measureStaves.length; staffIndex++) {
                if (staffRange &&
                    (staffIndex < staffRange.start || staffIndex > staffRange.end)) {
                    continue;
                }

                const staff = measureStaves[staffIndex];
                for (const staffEntry of staff.staffEntries || []) {
                    const fraction = staffEntry.relInMeasureTimestamp?.RealValue;
                    if (!Number.isFinite(fraction)) continue;

                    const afterStart = measureIndex > lower.measureIndex ||
                        (measureIndex === lower.measureIndex && fraction >= lower.fraction);
                    const beforeEnd = measureIndex < upper.measureIndex ||
                        (measureIndex === upper.measureIndex && fraction <= upper.fraction);
                    if (!afterStart || !beforeEnd) continue;

                    for (const voiceEntry of staffEntry.graphicalVoiceEntries || []) {
                        for (const graphicalNote of voiceEntry.notes || []) {
                            const element = graphicalNote.getSVGGElement();
                            if (element && container.contains(element)) elements.add(element);
                        }
                    }
                }
            }
        }

        return Array.from(elements);
    }

    function getStaffSegments(osmd, container, start, end, staffRange) {
        const pages = osmd?.GraphicSheet?.musicPages;
        if (!pages || !container || !staffRange) return [];

        const staffElements = Array.from(container.querySelectorAll("g.staffline"));
        const systems = [];
        let staffElementIndex = 0;

        for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
            for (let systemIndex = 0;
                systemIndex < pages[pageIndex].musicSystems.length;
                systemIndex++) {
                const system = pages[pageIndex].musicSystems[systemIndex];
                const staffLines = system.staffLines.map(() => staffElements[staffElementIndex++]);
                systems.push({ pageIndex, systemIndex, staffLines });
            }
        }

        const compareResults = (first, second) => {
            if (first.measureIndex !== second.measureIndex) {
                return first.measureIndex - second.measureIndex;
            }
            return (first.timeInMeasure?.fraction ?? 0) -
                (second.timeInMeasure?.fraction ?? 0);
        };
        const firstResult = compareResults(start, end) <= 0 ? start : end;
        const lastResult = firstResult === start ? end : start;
        const firstSystemIndex = systems.findIndex(system =>
            system.pageIndex === firstResult.page && system.systemIndex === firstResult.system
        );
        const lastSystemIndex = systems.findIndex(system =>
            system.pageIndex === lastResult.page && system.systemIndex === lastResult.system
        );
        if (firstSystemIndex < 0 || lastSystemIndex < firstSystemIndex) return [];

        const segments = [];
        for (let systemIndex = firstSystemIndex; systemIndex <= lastSystemIndex; systemIndex++) {
            const system = systems[systemIndex];
            for (let staffIndex = staffRange.start;
                staffIndex <= staffRange.end && staffIndex < system.staffLines.length;
                staffIndex++) {
                const staffElement = system.staffLines[staffIndex];
                if (!staffElement) continue;

                const bounds = staffElement.getBoundingClientRect();
                let left = bounds.left;
                let right = bounds.right;
                if (firstSystemIndex === lastSystemIndex) {
                    left = Math.min(firstResult.clientPosition.x, lastResult.clientPosition.x);
                    right = Math.max(firstResult.clientPosition.x, lastResult.clientPosition.x);
                } else if (systemIndex === firstSystemIndex) {
                    left = firstResult.clientPosition.x;
                } else if (systemIndex === lastSystemIndex) {
                    right = lastResult.clientPosition.x;
                }

                segments.push({
                    svg: staffElement.closest("svg"),
                    left,
                    top: bounds.top,
                    width: Math.max(2, right - left),
                    height: Math.max(2, bounds.height)
                });
            }
        }

        return segments;
    }

    function getGraphicalElementsForSourceXmlElements(sourceXmlElements) {
        if (!scoreDisplay?.graphic?.measureList) return [];

        const noteSources = new Map();
        const measureSources = [];
        const standaloneTextSources = [];
        for (const sourceElement of sourceXmlElements) {
            const note = getAncestor(sourceElement, "note");
            if (note) {
                noteSources.set(note, sourceElement);
                continue;
            }
            const measure = getAncestor(sourceElement, "measure");
            if (measure) {
                measureSources.push({ sourceElement, measure });
            } else if (standaloneTextTags.has(sourceElement.localName) &&
                sourceElement.children.length === 0) {
                standaloneTextSources.push(sourceElement);
            }
        }

        const graphicalElements = new Set();
        for (const measureStaves of scoreDisplay.graphic.measureList) {
            for (const staff of measureStaves) {
                for (const staffEntry of staff.staffEntries || []) {
                    for (const voiceEntry of staffEntry.graphicalVoiceEntries || []) {
                        for (const graphicalNote of voiceEntry.notes || []) {
                            const sourceElement = noteSources.get(
                                graphicalNote.sourceNote?.SourceXmlElement
                            );
                            if (!sourceElement) continue;
                            const element = graphicalNote.getSVGGElement();
                            if (element) {
                                graphicalElements.add(element);
                                sourceXmlByGraphicalElement.set(element, sourceElement);
                            }
                        }
                    }
                }
            }
        }

        for (const { sourceElement, measure } of measureSources) {
            const part = getAncestor(measure, "part");
            const measureIndex = part
                ? Array.from(part.children)
                    .filter(child => child.localName === "measure")
                    .indexOf(measure)
                : -1;
            const measureNumber = measure.getAttribute("number") || String(measureIndex + 1);
            const partIndex = part
                ? Array.from(musicXmlDocument.getElementsByTagName("part"))
                    .filter(candidate => Array.from(candidate.children)
                        .some(child => child.localName === "measure"))
                    .indexOf(part)
                : -1;
            for (const element of Array.from(document.querySelectorAll("#musicxml-score g.vf-measure"))) {
                if (element.id !== measureNumber) continue;
                const staffIndexMatch = /^Voice(\d+)-/.exec(element.parentElement?.id || "");
                const staffMapping = staffIndexMatch
                    ? getPartStaffMapping(Number(staffIndexMatch[1]), measureIndex)
                    : null;
                if (partIndex >= 0 && staffMapping?.partIndex !== partIndex) continue;
                graphicalElements.add(element);
                sourceXmlByGraphicalElement.set(element, sourceElement);
            }
        }

        for (const sourceElement of standaloneTextSources) {
            const text = normalizeText(sourceElement.textContent);
            const matches = Array.from(document.querySelectorAll("#musicxml-score g.vf-text"))
                .filter(element => normalizeText(element.textContent) === text);
            if (matches.length !== 1) continue;
            graphicalElements.add(matches[0]);
            sourceXmlByGraphicalElement.set(matches[0], sourceElement);
        }

        return Array.from(graphicalElements);
    }

    function initialize(osmd, container) {
        if (isInitialized) return;
        isInitialized = true;
        scoreDisplay = osmd;

        container.addEventListener("click", event => {
            const result = getClickResult(osmd, event);
            if (!result) return;
            window.lastPartitionClick = result;
            window.dispatchEvent(new CustomEvent("viritura:partition-click", { detail: result }));
            console.log("Partition click:", result);
        });

        container.addEventListener("pointerdown", event => {
            if (event.button !== 0 || event.isPrimary === false) return;
            activePointerId = event.pointerId;
            activePointerSvg = findSvgAtPosition(event);
            dispatchPointerPosition(osmd, event, "start");
        });
        window.addEventListener("pointermove", event => {
            if (event.pointerId === activePointerId) {
                dispatchPointerPosition(osmd, event, "move");
            }
        });
        window.addEventListener("pointerup", event => {
            if (event.pointerId !== activePointerId) return;
            dispatchPointerPosition(osmd, event, "end");
            activePointerId = null;
            activePointerSvg = null;
        });
        window.addEventListener("pointercancel", event => {
            if (event.pointerId !== activePointerId) return;
            dispatchPointerPosition(osmd, event, "cancel");
            activePointerId = null;
            activePointerSvg = null;
        });
    }

    function setMusicXmlDocument(xmlDocument) {
        musicXmlDocument = xmlDocument;
    }

    function getPointerResult(event) {
        return scoreDisplay ? getClickResult(scoreDisplay, event) : null;
    }

    window.PartitionClick = Object.freeze({
        initialize,
        setMusicXmlDocument,
        getMusicXmlDocument: () => musicXmlDocument,
        getPointerResult,
        getSourceXmlElement: element =>
            sourceXmlByGraphicalElement.get(element) ||
            findClickedNote(scoreDisplay, element)?.sourceNote?.SourceXmlElement || null,
        getGraphicalElementsForSourceXmlElements,
        getElementsBetween: (container, start, end, staffRange) =>
            getElementsBetween(scoreDisplay, container, start, end, staffRange),
        getStaffSegments: (container, start, end, staffRange) =>
            getStaffSegments(scoreDisplay, container, start, end, staffRange)
    });
})();
