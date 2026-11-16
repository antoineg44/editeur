const chordKinds = {
    "": "major", "maj": "major", "M": "major",
    "m": "minor", "min": "minor", "-": "minor",
    "7": "dominant", "maj7": "major-seventh", "M7": "major-seventh",
    "m7": "minor-seventh", "min7": "minor-seventh", "-7": "minor-seventh",
    "mMaj7": "major-minor", "mM7": "major-minor",
    "6": "major-sixth", "m6": "minor-sixth", "-6": "minor-sixth",
    "dim": "diminished", "dim7": "diminished-seventh",
    "aug": "augmented", "+": "augmented",
    "sus2": "suspended-second", "sus4": "suspended-fourth", "sus": "suspended-fourth",
    "9": "dominant-ninth", "maj9": "major-ninth", "m9": "minor-ninth",
    "11": "dominant-11th", "maj11": "major-11th", "m11": "minor-11th",
    "13": "dominant-13th", "maj13": "major-13th", "m13": "minor-13th",
    "5": "power"
};

let beatGridOverlay = null;

function createBeatGridOverlay(osmdContainer) {
    if (beatGridOverlay) beatGridOverlay.remove();
    beatGridOverlay = document.createElement("div");
    beatGridOverlay.className = "beat-grid-overlay";
    beatGridOverlay.style.position = "absolute";
    beatGridOverlay.style.top = "0";
    beatGridOverlay.style.left = "0";
    beatGridOverlay.style.width = "100%";
    beatGridOverlay.style.height = "100%";
    beatGridOverlay.style.pointerEvents = "none";
    beatGridOverlay.style.zIndex = "10";
    osmdContainer.appendChild(beatGridOverlay);
}

function addBeatGridMarkers(measureList, beatGridOverlay, osmdContainer) {
    if (!beatGridOverlay || !osmd) return;
    beatGridOverlay.innerHTML = "";

    const xml = new DOMParser().parseFromString(musicXMLText, "application/xml");
    if (xml.querySelector("parsererror")) return;

    const part = xmlChildren(xml.documentElement, "part")[0];
    if (!part) return;

    const containerRect = osmdContainer.getBoundingClientRect();

    for (let measureIndex = 0; measureIndex < measureList.length; measureIndex++) {
        const measures = measureList[measureIndex];
        if (!measures || !measures[0]) continue;
        const measure = measures[0];
        const measureElement = xmlChildren(part, "measure")[measureIndex];
        if (!measureElement) continue;

        let beats = 4, beatType = 4;
        const attrEl = xmlChildren(measureElement, "attributes")[0];
        if (attrEl) {
            const timeEl = xmlChildren(attrEl, "time")[0];
            if (timeEl) {
                const b = xmlChildren(timeEl, "beats")[0];
                const bt = xmlChildren(timeEl, "beat-type")[0];
                if (b) beats = Number(b.textContent);
                if (bt) beatType = Number(bt.textContent);
            }
        }

        const measureDuration = (beats * 4) / beatType;
        const bbox = measure.boundingBox;

        for (let beat = 0; beat < beats; beat++) {
            const beatTime = (beat * measureDuration) / beats;
            const beatProgress = beat / beats;
            const beatX = bbox.absolutePosition.x + beatProgress * bbox.width;
            const beatY = (measure.parentStaffLine.boundingBox.absolutePosition.y - 2) * 10;

            const marker = document.createElement("div");
            marker.className = "beat-marker";
            marker.style.position = "absolute";
            marker.style.width = "8px";
            marker.style.height = "8px";
            marker.style.borderRadius = "50%";
            marker.style.backgroundColor = "#999";
            marker.style.opacity = "0.5";
            marker.style.pointerEvents = "auto";
            marker.style.cursor = "pointer";
            marker.dataset.measureIndex = measureIndex;
            marker.dataset.beatTime = beatTime;
            marker.style.left = (beatX - containerRect.left + osmdContainer.scrollLeft) + "px";
            marker.style.top = (beatY - containerRect.top + osmdContainer.scrollTop - 15) + "px";

            beatGridOverlay.appendChild(marker);
        }
    }
}

function parseChord(text) {
    const match = /^(Do|Ré|Re|Mi|Fa|Sol|La|Si|[A-G])([#♯b♭]?)([^/]*)(?:\/(Do|Ré|Re|Mi|Fa|Sol|La|Si|[A-G])([#♯b♭]?))?$/.exec(text);
    let suffix = match?.[3];
    let alteration = null;
    if (match && !Object.prototype.hasOwnProperty.call(chordKinds, suffix)) {
        const degree = /^(.*?)(?:\(([#♯b♭])(\d+)\)|([#♯b♭])(\d+))$/.exec(suffix);
        if (degree) {
            const accidental = degree[2] || degree[4];
            const value = Number(degree[3] || degree[5]);
            if (value > 0) {
                suffix = degree[1];
                alteration = { value, alter: accidental === "#" || accidental === "♯" ? 1 : -1 };
            }
        }
    }
    if (!match || !Object.prototype.hasOwnProperty.call(chordKinds, suffix)) {
        throw new Error("Accord non reconnu. Exemples : C, Ré#m7, Sol7, Cmaj7 ou Dm/F.");
    }
    const steps = { Do: "C", Ré: "D", Re: "D", Mi: "E", Fa: "F", Sol: "G", La: "A", Si: "B" };
    const pitch = (step, accidental) => ({
        step: steps[step] || step,
        alter: accidental === "#" || accidental === "♯" ? 1 :
            accidental === "b" || accidental === "♭" ? -1 : 0
    });
    return {
        root: pitch(match[1], match[2]),
        kind: chordKinds[suffix],
        bass: match[4] ? pitch(match[4], match[5]) : null,
        alteration
    };
}

function updateHarmony(harmony, text) {
    const parsed = parseChord(text);
    const doc = harmony.ownerDocument;
    const make = (name, value) => {
        const element = doc.createElementNS(harmony.namespaceURI, name);
        if (value !== undefined) element.textContent = value;
        return element;
    };
    const root = make("root");
    root.appendChild(make("root-step", parsed.root.step));
    if (parsed.root.alter) root.appendChild(make("root-alter", String(parsed.root.alter)));
    const kind = make("kind", parsed.kind);
    const bass = parsed.bass && make("bass");
    if (bass) {
        bass.appendChild(make("bass-step", parsed.bass.step));
        if (parsed.bass.alter) bass.appendChild(make("bass-alter", String(parsed.bass.alter)));
    }
    const existing = Array.from(harmony.children);
    const insertion = existing.find(element =>
        !["root", "function", "kind", "inversion", "bass", "degree"].includes(element.localName)
    );
    for (const element of existing) {
        if (["root", "function", "kind", "inversion", "bass", "degree"].includes(element.localName)) {
            element.remove();
        }
    }
    harmony.insertBefore(root, insertion || null);
    harmony.insertBefore(kind, insertion || null);
    if (bass) harmony.insertBefore(bass, insertion || null);
    if (parsed.alteration) {
        const degree = make("degree");
        const value = parsed.alteration.value;
        const hasSeventh = /seventh|ninth|11th|13th|dominant/.test(parsed.kind);
        const hasNinth = /ninth|11th|13th/.test(parsed.kind);
        const hasEleventh = /11th|13th/.test(parsed.kind);
        const present = value === 1 || value === 3 || value === 5 ||
            (value === 7 && hasSeventh) || (value === 9 && hasNinth) ||
            (value === 11 && hasEleventh) || (value === 13 && /13th/.test(parsed.kind));
        degree.appendChild(make("degree-value", String(value)));
        degree.appendChild(make("degree-alter", String(parsed.alteration.alter)));
        degree.appendChild(make("degree-type", present ? "alter" : "add"));
        harmony.insertBefore(degree, insertion || null);
    }
}

function chordTextLooksLikeSymbol(text) {
    return /^(?:Do|Ré|Re|Mi|Fa|Sol|So[!I]|La|Si|[A-G])(?:[#♯b♭])?(?:(?:maj|min|dim|aug|sus|add|no|rn)|[mM0-9+#♯b♭°ø()\-/?])*$/u.test(text);
}

function chordTimeline(part, staffId) {
    const positions = [];
    const symbols = [];
    let divisions = 0;
    let currentBeats = 4;
    let currentBeatType = 4;

    xmlChildren(part, "measure").forEach((measure, measureIndex) => {
        let time = 0;
        let previousTime = 0;

        for (const element of measure.children) {
            if (element.localName === "attributes") {
                const divValue = xmlChildren(element, "divisions")[0];
                if (divValue) divisions = Number(divValue.textContent);
                const timeElement = xmlChildren(element, "time")[0];
                if (timeElement) {
                    const beatsEl = xmlChildren(timeElement, "beats")[0];
                    const beatTypeEl = xmlChildren(timeElement, "beat-type")[0];
                    if (beatsEl) currentBeats = Number(beatsEl.textContent);
                    if (beatTypeEl) currentBeatType = Number(beatTypeEl.textContent);
                }
            } else if (element.localName === "backup" || element.localName === "forward") {
                const duration = Number(xmlChildren(element, "duration")[0]?.textContent);
                if (!(divisions > 0) || !Number.isFinite(duration)) throw new Error("Durée MusicXML invalide.");
                time += (element.localName === "backup" ? -1 : 1) * duration / (4 * divisions);
            } else if (element.localName === "note") {
                const isChord = xmlChildren(element, "chord").length > 0;
                const noteTime = isChord ? previousTime : time;
                if (!isChord) previousTime = time;
                if (!isChord && !xmlChildren(element, "rest").length &&
                    (xmlChildren(element, "staff")[0]?.textContent || "1") === staffId) {
                    positions.push({ measureIndex, time: noteTime, note: element });
                }
                const duration = xmlChildren(element, "duration")[0];
                if (!isChord && duration) {
                    const value = Number(duration.textContent);
                    if (!(divisions > 0) || !Number.isFinite(value)) throw new Error("Durée MusicXML invalide.");
                    time += value / (4 * divisions);
                }
            } else if (element.localName === "harmony" || element.localName === "direction") {
                const staff = xmlChildren(element, "staff")[0]?.textContent || "1";
                if (staff !== staffId) continue;
                const offset = xmlChildren(element, "offset")[0];
                const amount = offset ? Number(offset.textContent) : 0;
                if (offset && (!(divisions > 0) || !Number.isFinite(amount))) {
                    throw new Error("Décalage MusicXML invalide.");
                }
                const symbolTime = time + (offset ? amount / (4 * divisions) : 0);
                if (element.localName === "harmony") {
                    symbols.push({ measureIndex, time: symbolTime, element, type: "harmony" });
                } else if (element.getAttribute("placement") !== "below") {
                    for (const direction of xmlChildren(element, "direction-type")) {
                        for (const words of xmlChildren(direction, "words")) {
                            symbols.push({ measureIndex, time: symbolTime, element: words, type: "words" });
                        }
                    }
                }
            }
        }

        const measureDuration = (currentBeats * 4) / currentBeatType;
        for (let beat = 0; beat < currentBeats; beat++) {
            const beatTime = (beat * measureDuration) / currentBeats;
            positions.push({ measureIndex, time: beatTime, note: null, beat: true });
        }
    });
    return { positions, symbols };
}

function sameChordPosition(a, b) {
    return a.measureIndex === b.measureIndex && Math.abs(a.time - b.time) < 0.0000001;
}

function chordGraphics() {
    const result = [];
    for (const page of osmd.graphic.musicPages) {
        for (const system of page.musicSystems) {
            for (const line of system.staffLines) {
                const staff = line.parentStaff;
                for (const expression of line.abstractExpressions) {
                    const label = expression.label;
                    if (!label?.SVGNode || !expression.sourceMultiExpression) continue;
                    result.push({
                        type: "words", svg: label.SVGNode, text: label.label.text,
                        partId: staff.parentInstrument.idString, staffId: String(staff.id),
                        measureIndex: expression.sourceMultiExpression.sourceMeasure.measureListIndex,
                        time: expression.sourceMultiExpression.timestamp.RealValue
                    });
                }
            }
        }
    }
    osmd.graphic.measureList.forEach((measures, measureIndex) => {
        for (const measure of measures.filter(Boolean)) {
            for (const entry of measure.staffEntries) {
                for (const chord of entry.graphicalChordContainers) {
                    if (!chord.graphicalLabel?.SVGNode) continue;
                    result.push({
                        type: "harmony", svg: chord.graphicalLabel.SVGNode,
                        text: chord.graphicalLabel.label.text,
                        partId: measure.parentStaff.parentInstrument.idString,
                        staffId: String(measure.parentStaff.id), measureIndex,
                        time: entry.relInMeasureTimestamp.RealValue
                    });
                }
            }
        }
    });
    return result;
}

function graphicForChord(partId, staffId, position, symbol) {
    const candidates = chordGraphics().filter(item =>
        item.partId === partId && item.staffId === staffId && sameChordPosition(item, position) &&
        item.type === symbol.type &&
        (symbol.type !== "words" || item.text === symbol.element.textContent)
    );
    if (candidates.length !== 1) throw new Error("Impossible de localiser précisément l'accord sur la partition.");
    return candidates[0];
}

function noteGraphicForChord(partId, staffId, position) {
    const matches = [];
    for (const measure of osmd.graphic.measureList[position.measureIndex] || []) {
        if (!measure || measure.parentStaff.parentInstrument.idString !== partId ||
            String(measure.parentStaff.id) !== staffId) continue;
        for (const entry of measure.staffEntries) {
            if (Math.abs(entry.relInMeasureTimestamp.RealValue - position.time) >= 0.0000001) continue;
            for (const voice of entry.graphicalVoiceEntries) {
                for (const note of voice.notes) {
                    if (!note.sourceNote.isRest() && note.getSVGGElement()?.isConnected) {
                        matches.push({ note, staffLine: measure.parentStaffLine });
                    }
                }
            }
        }
    }
    if (!matches.length) throw new Error("Impossible de localiser la note sur la partition.");
    return matches[0];
}

function insertChord(position, part, staffId, type, text) {
    const doc = part.ownerDocument;
    const make = name => doc.createElementNS(part.namespaceURI, name);
    let element;

    const measure = xmlChildren(part, "measure")[position.measureIndex];
    if (!measure) throw new Error("Mesure non trouvée dans le MusicXML.");

    if (position.note) {
        const note = position.note;
        if (type === "harmony") {
            element = make("harmony");
            updateHarmony(element, text);
            if (staffId !== "1") {
                const staff = make("staff");
                staff.textContent = staffId;
                element.appendChild(staff);
            }
            note.parentElement.insertBefore(element, note);
            return { element, type };
        }
        const direction = make("direction");
        direction.setAttribute("placement", "above");
        const directionType = make("direction-type");
        element = make("words");
        element.textContent = text;
        directionType.appendChild(element);
        direction.appendChild(directionType);
        if (staffId !== "1") {
            const staff = make("staff");
            staff.textContent = staffId;
            direction.appendChild(staff);
        }
        note.parentElement.insertBefore(direction, note);
        return { element, type: "words" };
    }

    let divisions = 0;
    const attrEl = xmlChildren(measure, "attributes")[0];
    if (attrEl) {
        const divEl = xmlChildren(attrEl, "divisions")[0];
        if (divEl) divisions = Number(divEl.textContent);
    }

    const offset = Math.round(position.time * 4 * divisions);

    if (type === "harmony") {
        element = make("harmony");
        updateHarmony(element, text);
        if (staffId !== "1") {
            const staff = make("staff");
            staff.textContent = staffId;
            element.appendChild(staff);
        }
        if (offset > 0) {
            const offsetEl = make("offset");
            offsetEl.textContent = String(offset);
            element.insertBefore(offsetEl, element.firstChild);
        }
        measure.appendChild(element);
        return { element, type };
    }

    const direction = make("direction");
    direction.setAttribute("placement", "above");
    if (offset > 0) {
        const offsetEl = make("offset");
        offsetEl.textContent = String(offset);
        direction.appendChild(offsetEl);
    }
    const directionType = make("direction-type");
    element = make("words");
    element.textContent = text;
    directionType.appendChild(element);
    direction.appendChild(directionType);
    if (staffId !== "1") {
        const staff = make("staff");
        staff.textContent = staffId;
        direction.appendChild(staff);
    }
    measure.appendChild(direction);
    return { element, type: "words" };
}

let addingChords = false;
const addChordButton = document.getElementById("toggleAddChord");
addChordButton.addEventListener("click", () => {
    if (updatingScore) return;
    if (!addingChords && addingLyrics) addLyricButton.click();
    addingChords = !addingChords;
    addChordButton.setAttribute("aria-pressed", String(addingChords));
    addChordButton.textContent = addingChords ? "Terminer l'ajout d'accords" : "Ajouter des accords";
    container.classList.toggle("adding-chords", addingChords);
    if (addingChords) {
        createBeatGridOverlay(container);
        addBeatGridMarkers(osmd.graphic.measureList, beatGridOverlay, container);
    } else if (beatGridOverlay) {
        beatGridOverlay.remove();
        beatGridOverlay = null;
    }
    document.getElementById("status").textContent = addingChords ?
        "Cliquez sur une note ou un temps pour ajouter ou modifier un accord." : "Ajout d'accords terminé.";
});

container.addEventListener("dblclick", event => {
    if (updatingScore || addingLyrics || addingChords) return;
    const svg = event.target.closest(".vf-text");
    if (!svg || !container.contains(svg)) return;
    try {
        const graphics = chordGraphics().filter(item => item.svg === svg);
        if (!graphics.length) return;
        if (graphics.length !== 1) throw new Error("Accord ambigu sur la partition.");
        const graphic = graphics[0];
        const xml = new DOMParser().parseFromString(musicXMLText, "application/xml");
        if (xml.querySelector("parsererror")) throw new Error("MusicXML invalide.");
        const part = xmlChildren(xml.documentElement, "part")
            .find(item => item.getAttribute("id") === graphic.partId);
        if (!part) throw new Error("Partie MusicXML introuvable.");
        const candidates = chordTimeline(part, graphic.staffId).symbols.filter(item =>
            sameChordPosition(item, graphic) && item.type === graphic.type &&
            (item.type !== "words" || item.element.textContent === graphic.text));
        if (candidates.length !== 1) throw new Error("Impossible d'identifier précisément l'accord dans le MusicXML.");
        openChordEditor(xml, part, graphic.staffId, graphic, candidates[0], graphic.type);
    } catch (error) {
        console.error("Erreur de modification de l'accord :", error);
        document.getElementById("status").textContent = "Impossible de modifier l'accord : " + error.message;
    }
});

container.addEventListener("click", event => {
    if (!addingChords || updatingScore) return;
    const beatMarker = event.target.closest(".beat-marker");
    if (beatMarker) {
        try {
            const measureIndex = Number(beatMarker.dataset.measureIndex);
            const beatTime = Number(beatMarker.dataset.beatTime);
            const xml = new DOMParser().parseFromString(musicXMLText, "application/xml");
            if (xml.querySelector("parsererror")) throw new Error("MusicXML invalide.");
            const part = xmlChildren(xml.documentElement, "part")[0];
            if (!part) throw new Error("Partie MusicXML introuvable.");

            const measure = osmd.graphic.measureList[measureIndex]?.[0];
            const staffId = measure ? String(measure.parentStaff.id) : "1";

            const timeline = chordTimeline(part, staffId);
            let position = timeline.positions.find(p =>
                p.measureIndex === measureIndex &&
                Math.abs(p.time - beatTime) < 0.0000001
            );

            if (!position) {
                position = { measureIndex, time: beatTime, note: null, beat: true };
            }

            const candidates = timeline.symbols.filter(item =>
                sameChordPosition(item, position) &&
                (item.type === "harmony" || chordTextLooksLikeSymbol(item.element.textContent)));
            if (candidates.length > 1) throw new Error("Plusieurs accords correspondent à ce temps.");
            openChordEditor(xml, part, staffId, position, candidates[0] || null, candidates[0]?.type || "words");
        } catch (error) {
            console.error("Erreur d'ajout d'accord au temps :", error);
            document.getElementById("status").textContent = "Impossible d'ajouter l'accord : " + error.message;
        }
        return;
    }

    const group = event.target.closest(".vf-stavenote");
    if (!group || !container.contains(group)) return;
    try {
        const notes = osmd.graphic.measureList.flat().filter(Boolean)
            .flatMap(measure => measure.staffEntries)
            .flatMap(entry => entry.graphicalVoiceEntries)
            .flatMap(entry => entry.notes).filter(note => note.getSVGGElement() === group);
        if (!notes.length || notes[0].sourceNote.isRest()) throw new Error("Sélectionnez une note, pas un silence.");
        const source = notes[0].sourceNote;
        const xml = new DOMParser().parseFromString(musicXMLText, "application/xml");
        if (xml.querySelector("parsererror")) throw new Error("MusicXML invalide.");
        const matches = findXmlNotes(xml, source.voiceEntry);
        if (!matches.length || (matches.length > 1 &&
            (xmlChildren(matches[0], "chord").length ||
             !matches.slice(1).every(note => xmlChildren(note, "chord").length)))) {
            throw new Error("Impossible d'identifier précisément la note dans le MusicXML.");
        }
        const note = matches[0];
        const part = note.parentElement.parentElement;
        const staffId = xmlChildren(note, "staff")[0]?.textContent || "1";
        const position = {
            measureIndex: source.sourceMeasure.measureListIndex,
            time: source.voiceEntry.timestamp.RealValue,
            note
        };
        const candidates = chordTimeline(part, staffId).symbols.filter(item =>
            sameChordPosition(item, position) &&
            (item.type === "harmony" || chordTextLooksLikeSymbol(item.element.textContent)));
        if (candidates.length > 1) throw new Error("Plusieurs accords correspondent à cette note.");
        openChordEditor(xml, part, staffId, position, candidates[0] || null, candidates[0]?.type || "words");
    } catch (error) {
        console.error("Erreur d'ajout d'accord :", error);
        document.getElementById("status").textContent = "Impossible d'ajouter l'accord : " + error.message;
    }
});

function openChordEditor(xml, part, staffId, initialPosition, initialSymbol, initialType) {
    const scoreContainer = document.getElementById("scoreContainer");
    const status = document.getElementById("status");
    const previousStatus = status.textContent;
    const controls = Array.from(document.querySelectorAll(lyricControlSelector))
        .map(element => ({ element, disabled: element.disabled }));
    const editor = document.createElement("form");
    editor.className = "lyric-editor";
    editor.setAttribute("aria-label", "Modifier l'accord");
    const input = document.createElement("input");
    input.type = "text";
    input.setAttribute("aria-label", "Accord");
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "✓";
    save.setAttribute("aria-label", "Valider l'accord");
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "×";
    cancel.setAttribute("aria-label", "Annuler la modification");
    editor.append(input, save, cancel);
    const partId = part.getAttribute("id");
    let position = initialPosition;
    let symbol = initialSymbol;
    let type = initialType;
    let activeSvg = null;
    let originalText = "";
    let saving = false;
    let editing = true;
    let hasSavedChanges = false;
    const resizeInput = () => { input.size = Math.max(2, input.value.length + 1); };
    input.addEventListener("input", resizeInput);

    function setInput() {
        const graphic = symbol ? graphicForChord(partId, staffId, position, symbol) : null;
        originalText = graphic?.text || "";
        input.value = originalText;
        resizeInput();
    }

    function positionEditor() {
        if (!editing || saving) return;
        if (activeSvg) activeSvg.style.visibility = "";
        activeSvg = symbol ? graphicForChord(partId, staffId, position, symbol).svg : null;
        const containerRect = scoreContainer.getBoundingClientRect();
        if (activeSvg) {
            const rect = activeSvg.getBoundingClientRect();
            const text = activeSvg.querySelector("text");
            const matrix = text?.getScreenCTM();
            const style = text && getComputedStyle(text);
            editor.style.left = rect.left - containerRect.left + scoreContainer.scrollLeft + "px";
            editor.style.top = rect.top - containerRect.top + scoreContainer.scrollTop + "px";
            if (style && matrix) {
                editor.style.fontFamily = style.fontFamily;
                editor.style.fontSize = parseFloat(style.fontSize) * Math.hypot(matrix.a, matrix.b) + "px";
            }
            activeSvg.style.visibility = "hidden";
        } else if (position.note) {
            const graphical = noteGraphicForChord(partId, staffId, position);
            const svg = graphical.note.getSVGGElement().closest("svg");
            const rect = graphical.note.getSVGGElement().getBoundingClientRect();
            const point = svg.createSVGPoint();
            point.x = 0;
            point.y = (graphical.staffLine.boundingBox.absolutePosition.y - 2) * 10;
            const screen = point.matrixTransform(svg.getScreenCTM());
            editor.style.left = rect.left - containerRect.left + scoreContainer.scrollLeft + "px";
            editor.style.top = screen.y - containerRect.top + scoreContainer.scrollTop + "px";
        } else {
            const measure = osmd.graphic.measureList[position.measureIndex]?.[0];
            if (measure && typeof measure.getBoundingBox === 'function') {
                const bbox = measure.getBoundingBox();
                const measureDuration = (measure.musicXMLMeasure?.beats || 4);
                const beatX = bbox.absolutePosition.x + (position.time / (measureDuration * 4 / (measure.musicXMLMeasure?.beatType || 4))) * bbox.width;
                const staffLine = measure.parentStaffLine;
                const beatY = (staffLine.boundingBox.absolutePosition.y - 2) * 10;

                editor.style.left = beatX - containerRect.left + scoreContainer.scrollLeft + "px";
                editor.style.top = beatY - containerRect.top + scoreContainer.scrollTop + "px";
            }
        }
    }
    setInput();
    scoreContainer.appendChild(editor);
    try {
        positionEditor();
    } catch (error) {
        editor.remove();
        throw error;
    }
    updatingScore = true;
    controls.forEach(control => {
        if (control.element.id !== "pause" && control.element.id !== "stop") control.element.disabled = true;
    });
    const observer = new MutationObserver(() => requestAnimationFrame(positionEditor));
    const handleResize = () => requestAnimationFrame(positionEditor);
    observer.observe(container, { childList: true, subtree: true });
    window.addEventListener("resize", handleResize);
    status.textContent = "Espace : temps suivant ; Entrée : valider ; Échap : annuler.";
    input.focus();
    input.select();

    function closeEditor() {
        editing = false;
        observer.disconnect();
        window.removeEventListener("resize", handleResize);
        if (activeSvg) activeSvg.style.visibility = "";
        editor.remove();
        updatingScore = false;
        controls.forEach(control => { control.element.disabled = control.disabled; });
    }

    cancel.addEventListener("click", () => {
        if (saving) return;
        closeEditor();
        status.textContent = hasSavedChanges ?
            "Accords modifiés. Téléchargez le MusicXML pour enregistrer vos changements." : previousStatus;
    });
    editor.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            event.preventDefault();
            cancel.click();
        } else if (event.key === " " && event.target === input && !event.isComposing &&
            !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            if (!saving && !event.repeat) saveChord(true);
        }
    });
    editor.addEventListener("submit", event => {
        event.preventDefault();
        saveChord(false);
    });

    async function saveChord(advance) {
        if (saving) return;
        const value = input.value.trim();
        if (!value && symbol) {
            status.textContent = "L'accord ne peut pas être vide.";
            input.focus();
            return;
        }
        if (!value && !advance) {
            cancel.click();
            return;
        }
        let next;
        let nextSymbol;
        try {
            if (value && type === "harmony" && (!symbol || value !== originalText)) parseChord(value);
            if (advance) {
                const timeline = chordTimeline(part, staffId);
                next = timeline.positions.filter(candidate =>
                    candidate.beat &&
                    (candidate.measureIndex > position.measureIndex ||
                    (candidate.measureIndex === position.measureIndex && candidate.time > position.time + 0.0000001))
                ).sort((a, b) => a.measureIndex - b.measureIndex || a.time - b.time)[0];
                if (next) {
                    const candidates = timeline.symbols.filter(candidate =>
                        sameChordPosition(candidate, next) &&
                        (candidate.type === "harmony" || chordTextLooksLikeSymbol(candidate.element.textContent)));
                    if (candidates.length > 1) throw new Error("Plusieurs accords correspondent au temps suivant.");
                    nextSymbol = candidates[0] || null;
                }
            }
        } catch (error) {
            console.error("Erreur de saisie d'accord :", error);
            status.textContent = "Impossible de modifier l'accord : " + error.message;
            return;
        }
        if (!advance && symbol && value === originalText) {
            closeEditor();
            status.textContent = hasSavedChanges ?
                "Accords modifiés. Téléchargez le MusicXML pour enregistrer vos changements." : previousStatus;
            return;
        }
        const oldXml = musicXMLText;
        saving = true;
        input.disabled = true;
        save.disabled = true;
        cancel.disabled = true;
        stopPlayback();
        try {
            if (value && (!symbol || value !== originalText)) {
                if (!symbol) {
                    symbol = insertChord(position, part, staffId, type, value);
                } else if (symbol.type === "words") {
                    symbol.element.textContent = value;
                } else {
                    updateHarmony(symbol.element, value);
                }
                const updated = serializeMusicXml(xml);
                await renderLyricScore(updated);
                musicXMLText = updated;
                hasSavedChanges = true;
            }
            if (!next) {
                closeEditor();
                status.textContent = advance ? "Dernier temps atteint. Téléchargez le MusicXML pour enregistrer vos changements." :
                    "Accord modifié. Téléchargez le MusicXML pour enregistrer vos changements.";
                return;
            }
            position = next;
            symbol = nextSymbol;
            if (symbol) type = symbol.type;
            setInput();
            saving = false;
            positionEditor();
            let target = null;
            if (symbol) {
                target = activeSvg?.closest("svg");
            } else if (position.note) {
                target = noteGraphicForChord(partId, staffId, position).note.getSVGGElement().closest("svg");
            } else {
                const measure = osmd.graphic.measureList[position.measureIndex]?.[0];
                if (measure) {
                    const svg = measure.getBoundingBox()?.getBoundingBoxUnclipped?.().absolutePosition?.svg ||
                        Array.from(document.querySelectorAll("svg")).find(s => 
                            s.querySelector(`[data-measure-index="${position.measureIndex}"]`)
                        );
                    target = svg;
                }
            }
            const pageIndex = target ? pages.indexOf(target) : -1;
            if (pageIndex >= 0) {
                currentPage = pageIndex;
                updatePage(false);
            }
            editor.scrollIntoView({ block: "nearest", inline: "nearest" });
            input.disabled = false;
            save.disabled = false;
            cancel.disabled = false;
            input.focus();
            input.select();
            status.textContent = "Espace : temps suivant ; Entrée : valider ; Échap : annuler.";
        } catch (error) {
            console.error("Erreur de modification de l'accord :", error);
            musicXMLText = oldXml;
            try {
                await renderLyricScore(oldXml);
            } catch (restoreError) {
                console.error("Erreur de restauration de la partition :", restoreError);
                error = new Error(error.message + " Restauration impossible : " + restoreError.message);
            }
            closeEditor();
            status.textContent = "Impossible de modifier l'accord : " + error.message;
        }
    }
}
