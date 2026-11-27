"use strict";

(() => {
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
    const frenchNoteNames = {
        A: "La", B: "Si", C: "Do", D: "Ré", E: "Mi", F: "Fa", G: "Sol"
    };
    let osmd = null;
    let scoreContainer = null;
    let activeEditor = null;

    function xmlChildren(element, name) {
        return Array.from(element?.children || [])
            .filter(child => child.localName === name);
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
                    alteration = {
                        value,
                        alter: accidental === "#" || accidental === "♯" ? 1 : -1
                    };
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
        const structuralNames = ["root", "function", "kind", "inversion", "bass", "degree"];
        const existing = Array.from(harmony.children);
        const insertion = existing.find(element => !structuralNames.includes(element.localName));
        for (const element of existing) {
            if (structuralNames.includes(element.localName)) element.remove();
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
        return /^(?:Do|Ré|Re|Mi|Fa|Sol|La|Si|[A-G])(?:[#♯b♭])?(?:(?:maj|min|dim|aug|sus|add|no)|[mM0-9+#♯b♭°ø()\-/?])*$/u.test(text);
    }

    function toFrenchChordSymbol(text) {
        const translateNoteAt = (value, index) => {
            const match = /^(Do|Ré|Re|Mi|Fa|Sol|La|Si|[A-G])([#♯b♭]?)/u.exec(value.slice(index));
            if (!match) return value;
            const note = frenchNoteNames[match[1]] || match[1];
            return value.slice(0, index) + note + match[2] + value.slice(index + match[0].length);
        };
        let result = translateNoteAt(text, 0);
        const bassIndex = result.indexOf("/");
        if (bassIndex >= 0) result = translateNoteAt(result, bassIndex + 1);
        return result;
    }

    function localizeChordGraphics() {
        for (const graphic of chordGraphics()) {
            if (graphic.type !== "harmony" && !chordTextLooksLikeSymbol(graphic.text)) continue;
            const translated = toFrenchChordSymbol(graphic.text);
            if (translated === graphic.text || graphic.svg.textContent === translated) continue;
            const textNodes = graphic.svg.querySelectorAll("text");
            if (textNodes.length === 1) textNodes[0].textContent = translated;
        }
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
                    const value = xmlChildren(element, "divisions")[0];
                    if (value) divisions = Number(value.textContent);
                    const timeSignature = xmlChildren(element, "time")[0];
                    if (timeSignature) {
                        const beats = xmlChildren(timeSignature, "beats")[0];
                        const beatType = xmlChildren(timeSignature, "beat-type")[0];
                        if (beats) currentBeats = Number(beats.textContent);
                        if (beatType) currentBeatType = Number(beatType.textContent);
                    }
                } else if (element.localName === "backup" || element.localName === "forward") {
                    const duration = Number(xmlChildren(element, "duration")[0]?.textContent);
                    if (!(divisions > 0) || !Number.isFinite(duration)) {
                        throw new Error("Durée MusicXML invalide.");
                    }
                    time += (element.localName === "backup" ? -1 : 1) * duration / (4 * divisions);
                } else if (element.localName === "note") {
                    const isChord = xmlChildren(element, "chord").length > 0;
                    const noteTime = isChord ? previousTime : time;
                    if (!isChord) previousTime = time;
                    if (!xmlChildren(element, "rest").length &&
                        (xmlChildren(element, "staff")[0]?.textContent || "1") === staffId) {
                        positions.push({ measureIndex, time: noteTime, note: element });
                    }
                    const duration = xmlChildren(element, "duration")[0];
                    if (!isChord && duration) {
                        const value = Number(duration.textContent);
                        if (!(divisions > 0) || !Number.isFinite(value)) {
                            throw new Error("Durée MusicXML invalide.");
                        }
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
            if (!(currentBeats > 0) || !(currentBeatType > 0)) {
                throw new Error("Signature de temps MusicXML invalide.");
            }
            const measureDuration = currentBeats / currentBeatType;
            for (let beat = 0; beat < currentBeats; beat++) {
                const noteCandidates = positions.filter(position =>
                    position.note && position.measureIndex === measureIndex
                );
                const beatTime = beat / currentBeatType;
                const anchor = noteCandidates.reduce((nearest, candidate) =>
                    !nearest || Math.abs(candidate.time - beatTime) <
                        Math.abs(nearest.time - beatTime)
                        ? candidate
                        : nearest, null);
                positions.push({
                    measureIndex,
                    time: beatTime,
                    measureDuration,
                    note: anchor?.note || null,
                    noteTime: anchor?.time,
                    divisions,
                    beat: true
                });
            }
        });
        return { positions, symbols };
    }

    function samePosition(first, second) {
        return first.measureIndex === second.measureIndex &&
            Math.abs(first.time - second.time) < 0.0000001;
    }

    function chordGraphics() {
        const result = [];
        for (const page of osmd.graphic.musicPages || []) {
            for (const system of page.musicSystems || []) {
                for (const line of system.staffLines || []) {
                    const staff = line.parentStaff;
                    for (const expression of line.abstractExpressions || []) {
                        const label = expression.label;
                        if (!label?.SVGNode || !expression.sourceMultiExpression) continue;
                        result.push({
                            type: "words",
                            svg: label.SVGNode,
                            text: label.label.text,
                            partId: staff.parentInstrument.idString,
                            staffId: String(staff.id),
                            measureIndex: expression.sourceMultiExpression.sourceMeasure.measureListIndex,
                            time: expression.sourceMultiExpression.timestamp.RealValue
                        });
                    }
                }
            }
        }
        (osmd.graphic.measureList || []).forEach((measures, measureIndex) => {
            for (const measure of (measures || []).filter(Boolean)) {
                for (const entry of measure.staffEntries || []) {
                    for (const chord of entry.graphicalChordContainers || []) {
                        if (!chord.graphicalLabel?.SVGNode) continue;
                        result.push({
                            type: "harmony",
                            svg: chord.graphicalLabel.SVGNode,
                            text: chord.graphicalLabel.label.text,
                            partId: measure.parentStaff.parentInstrument.idString,
                            staffId: String(measure.parentStaff.id),
                            measureIndex,
                            time: entry.relInMeasureTimestamp.RealValue
                        });
                    }
                }
            }
        });
        return result;
    }

    function getElementPath(root, element) {
        const path = [];
        for (let current = element; current !== root.documentElement;) {
            const parent = current.parentElement;
            if (!parent) return null;
            const index = Array.from(parent.children).indexOf(current);
            if (index < 0) return null;
            path.unshift(index);
            current = parent;
        }
        return path;
    }

    function getElementAtPath(root, path) {
        return path.reduce((element, index) => element?.children[index] || null, root);
    }

    function findPart(xml, partId) {
        return Array.from(xml.getElementsByTagName("part"))
            .find(part => part.getAttribute("id") === partId) || null;
    }

    function harmonyMatchesGraphic(harmony, text) {
        let parsed;
        try {
            parsed = parseChord(text);
        } catch {
            return false;
        }
        const root = xmlChildren(harmony, "root")[0];
        const kind = xmlChildren(harmony, "kind")[0];
        const bass = xmlChildren(harmony, "bass")[0];
        if (!root || !kind ||
            xmlChildren(root, "root-step")[0]?.textContent !== parsed.root.step ||
            Number(xmlChildren(root, "root-alter")[0]?.textContent || 0) !== parsed.root.alter ||
            kind.textContent !== parsed.kind) return false;
        if (Boolean(bass) !== Boolean(parsed.bass)) return false;
        if (bass &&
            (xmlChildren(bass, "bass-step")[0]?.textContent !== parsed.bass.step ||
                Number(xmlChildren(bass, "bass-alter")[0]?.textContent || 0) !== parsed.bass.alter)) {
            return false;
        }
        const degrees = xmlChildren(harmony, "degree");
        return parsed.alteration
            ? degrees.some(degree =>
                Number(xmlChildren(degree, "degree-value")[0]?.textContent) === parsed.alteration.value &&
                Number(xmlChildren(degree, "degree-alter")[0]?.textContent) === parsed.alteration.alter
            )
            : degrees.length === 0;
    }

    function findSourceSymbol(xml, graphic) {
        const part = findPart(xml, graphic.partId);
        if (!part) throw new Error("Partie MusicXML introuvable.");
        const symbols = chordTimeline(part, graphic.staffId).symbols;
        const matches = symbols.filter(symbol =>
            samePosition(symbol, graphic) &&
            symbol.type === graphic.type &&
            (symbol.type !== "words" || symbol.element.textContent === graphic.text)
        );
        if (matches.length === 1) return { part, symbol: matches[0] };
        if (graphic.type === "harmony") {
            const candidates = symbols.filter(symbol =>
                symbol.type === "harmony" && symbol.measureIndex === graphic.measureIndex
            );
            const textMatches = candidates.filter(symbol =>
                harmonyMatchesGraphic(symbol.element, graphic.text)
            );
            if (textMatches.length === 1) return { part, symbol: textMatches[0] };
            if (!textMatches.length && candidates.length === 1) {
                return { part, symbol: candidates[0] };
            }
        }
        throw new Error("Impossible d'identifier précisément l'accord dans le MusicXML.");
    }

    function findPositionForNote(note, partId, staffId) {
        for (let measureIndex = 0; measureIndex < osmd.graphic.measureList.length; measureIndex++) {
            for (const measure of osmd.graphic.measureList[measureIndex] || []) {
                if (!measure || measure.parentStaff.parentInstrument.idString !== partId ||
                    String(measure.parentStaff.id) !== staffId) continue;
                for (const entry of measure.staffEntries || []) {
                    for (const voice of entry.graphicalVoiceEntries || []) {
                        if (voice.notes.some(graphicalNote =>
                            graphicalNote.sourceNote?.SourceXmlElement === note
                        )) {
                            return {
                                measureIndex,
                                time: entry.relInMeasureTimestamp.RealValue,
                                note
                            };
                        }
                    }
                }
            }
        }
        throw new Error("Impossible de localiser la note sélectionnée sur la partition.");
    }

    function findGraphicForSymbol(symbol) {
        const matches = chordGraphics().filter(graphic =>
            graphic.partId === symbol.part.getAttribute("id") &&
            graphic.staffId === symbol.staffId &&
            samePosition(graphic, symbol.symbol) &&
            graphic.type === symbol.symbol.type &&
            (graphic.type !== "words" || graphic.text === symbol.symbol.element.textContent)
        );
        if (matches.length !== 1) throw new Error("Impossible de localiser l'accord sur la partition.");
        return matches[0];
    }

    function installStyles() {
        if (document.getElementById("chord-inline-editor-styles")) return;
        const style = document.createElement("style");
        style.id = "chord-inline-editor-styles";
        style.textContent = `
            #chord-inline-editor {
                position: fixed;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                background: white;
                box-shadow: 0 0 0 2px #3498db;
                white-space: pre;
            }
            #chord-inline-editor input {
                min-width: 3ch;
                max-width: 50vw;
                padding: 0 2px;
                border: 0;
                background: transparent;
                font: inherit;
                outline: none;
            }
            #chord-inline-editor .chord-editor-message {
                color: #b42318;
                font: 12px system-ui, sans-serif;
            }
        `;
        document.head.appendChild(style);
    }

    function positionEditor(state) {
        if (!state.editor.isConnected) return;
        const graphic = state.graphic?.svg?.isConnected ? state.graphic.svg : null;
        if (graphic) {
            const rect = graphic.getBoundingClientRect();
            state.editor.style.left = `${rect.left}px`;
            state.editor.style.top = `${rect.top}px`;
            return;
        }
        if (state.position?.beat) {
            const graphicalNote = state.position.note
                ? window.PartitionClick.getGraphicalElementsForSourceXmlElements([state.position.note])[0]
                : null;
            const noteRect = graphicalNote?.getBoundingClientRect();
            const measureRect = graphicalNote?.closest("g.vf-measure")?.getBoundingClientRect();
            if (noteRect && measureRect) {
                const isExactNote = Number.isFinite(state.position.noteTime) &&
                    Math.abs(state.position.time - state.position.noteTime) < 0.0000001;
                const left = isExactNote
                    ? noteRect.left
                    : measureRect.left +
                        state.position.time / state.position.measureDuration * measureRect.width;
                state.editor.style.left = `${left}px`;
                state.editor.style.top = `${Math.max(0, noteRect.top - state.editor.offsetHeight - 4)}px`;
            }
            return;
        }
        const anchor = state.anchorElement?.isConnected ? state.anchorElement : null;
        if (!anchor) return;
        const rect = anchor.getBoundingClientRect();
        state.editor.style.left = `${rect.left}px`;
        state.editor.style.top = `${Math.max(0, rect.top - state.editor.offsetHeight - 4)}px`;
    }

    function closeEditor(state) {
        if (activeEditor !== state) return;
        activeEditor = null;
        if (state.hiddenGraphic?.isConnected) state.hiddenGraphic.style.visibility = "";
        document.removeEventListener("pointerdown", state.onOutside, true);
        window.removeEventListener("resize", state.reposition);
        window.removeEventListener("scroll", state.reposition, true);
        state.editor.remove();
    }

    function findNextBeat(state) {
        const beats = chordTimeline(state.part, state.staffId).positions
            .filter(position => position.beat)
            .sort((first, second) =>
                first.measureIndex - second.measureIndex || first.time - second.time
            );
        return beats.find(position =>
            position.measureIndex > state.position.measureIndex ||
            (position.measureIndex === state.position.measureIndex &&
                position.time > state.position.time + 0.0000001)
        ) || null;
    }

    function openEditorAtPosition(sourceDocument, partId, staffId, position) {
        const part = findPart(sourceDocument, partId);
        if (!part) throw new Error("Partie MusicXML introuvable.");
        const timeline = chordTimeline(part, staffId);
        position = timeline.positions.find(candidate =>
            candidate.beat && samePosition(candidate, position)
        );
        if (!position) throw new Error("Impossible de retrouver le temps suivant dans le MusicXML.");
        const existing = timeline.symbols.filter(symbol =>
            samePosition(symbol, position) &&
            (symbol.type === "harmony" || chordTextLooksLikeSymbol(symbol.element.textContent))
        );
        if (existing.length > 1) throw new Error("Plusieurs accords correspondent à ce temps.");
        if (existing.length === 1) {
            const symbol = existing[0];
            const graphic = findGraphicForSymbol({ part, staffId, symbol });
            openEditor({
                sourceDocument,
                part,
                staffId,
                position,
                symbol,
                graphic,
                type: symbol.type,
                isNew: false
            });
            return;
        }
        if (!position.note) {
            throw new Error("Aucune note ne permet d'ajouter un accord à ce temps.");
        }
        openEditor({
            sourceDocument,
            part,
            staffId,
            position,
            symbol: null,
            graphic: null,
            type: "harmony",
            isNew: true
        });
    }

    async function saveEditor(state, advance) {
        if (activeEditor !== state || state.saving) return;
        const value = state.isTextOnly ? state.input.value : state.input.value.trim();
        if (!value.trim()) {
            if (state.isNew) {
                closeEditor(state);
                if (advance) {
                    const nextPosition = findNextBeat(state);
                    if (nextPosition) {
                        openEditorAtPosition(state.sourceDocument, state.partId, state.staffId, nextPosition);
                    }
                }
            }
            else {
                state.message.textContent = state.isTextOnly
                    ? "Le texte ne peut pas être vide."
                    : "L'accord ne peut pas être vide.";
                state.input.focus();
            }
            return;
        }
        try {
            if (state.type === "harmony") parseChord(value);
        } catch (error) {
            state.message.textContent = error.message;
            state.input.focus();
            state.input.select();
            return;
        }
        if (!state.isNew && value === state.originalText) {
            closeEditor(state);
            if (advance) {
                const nextPosition = findNextBeat(state);
                if (nextPosition) {
                    openEditorAtPosition(state.sourceDocument, state.partId, state.staffId, nextPosition);
                }
            }
            return;
        }

        const nextPosition = advance ? findNextBeat(state) : null;
        state.saving = true;
        state.input.disabled = true;
        state.message.textContent = "";
        try {
            const sourceDocument = window.PartitionClick.getMusicXmlDocument();
            if (!sourceDocument || sourceDocument !== state.sourceDocument) {
                throw new Error("La partition a changé pendant la modification de l'accord.");
            }
            const updatedDocument = sourceDocument.cloneNode(true);
            if (state.isNew) {
                const notePath = getElementPath(sourceDocument, state.position.note);
                const note = notePath
                    ? getElementAtPath(updatedDocument.documentElement, notePath)
                    : null;
                if (!note) throw new Error("La note sélectionnée n'existe plus dans le MusicXML.");
                const harmony = updatedDocument.createElementNS(note.namespaceURI, "harmony");
                updateHarmony(harmony, value);
                if (state.position.beat && Number.isFinite(state.position.noteTime)) {
                    const offsetValue = Math.round(
                        (state.position.time - state.position.noteTime) * 4 * state.position.divisions
                    );
                    if (offsetValue) {
                        const offset = updatedDocument.createElementNS(note.namespaceURI, "offset");
                        offset.textContent = String(offsetValue);
                        harmony.appendChild(offset);
                    }
                }
                if (state.staffId !== "1") {
                    const staff = updatedDocument.createElementNS(note.namespaceURI, "staff");
                    staff.textContent = state.staffId;
                    harmony.appendChild(staff);
                }
                note.parentElement.insertBefore(harmony, note);
            } else {
                const symbolPath = getElementPath(sourceDocument, state.symbol.element);
                const element = symbolPath
                    ? getElementAtPath(updatedDocument.documentElement, symbolPath)
                    : null;
                if (!element) throw new Error("L'accord sélectionné n'existe plus dans le MusicXML.");
                if (state.type === "harmony") updateHarmony(element, value);
                else element.textContent = value;
            }

            const rendered = await window.FileActions.updateMusicXml(
                updatedDocument,
                state.isNew
                    ? "Added chord symbol"
                    : state.isTextOnly ? "Edited text" : "Edited chord symbol"
            );
            if (!rendered) throw new Error("La partition n'a pas pu être actualisée.");
            closeEditor(state);
            if (nextPosition) {
                const updatedSource = window.PartitionClick.getMusicXmlDocument();
                if (!updatedSource) throw new Error("Partition MusicXML introuvable après actualisation.");
                openEditorAtPosition(updatedSource, state.partId, state.staffId, nextPosition);
            }
        } catch (error) {
            console.error(
                state.isTextOnly ? "Could not save the text." : "Could not save the chord symbol.",
                error
            );
            if (activeEditor === state) {
                state.saving = false;
                state.input.disabled = false;
                state.message.textContent = error.message;
                state.input.focus();
            } else {
                window.alert(`Impossible de passer à l'accord suivant : ${error.message}`);
            }
        }
    }

    function openEditor(options) {
        if (activeEditor) throw new Error("Terminez d'abord la modification de l'accord en cours.");
        installStyles();
        const editor = document.createElement("form");
        editor.id = "chord-inline-editor";
        editor.setAttribute("aria-label", options.isTextOnly ? "Modifier le texte" : "Modifier l'accord");
        const input = document.createElement("input");
        input.type = "text";
        input.value = options.initialValue ?? (
            options.graphic ? toFrenchChordSymbol(options.graphic.text) : ""
        );
        input.setAttribute("aria-label", options.isTextOnly ? "Texte" : "Accord");
        input.size = Math.max(3, input.value.length + 1);
        input.addEventListener("input", () => {
            input.size = Math.max(3, input.value.length + 1);
        });
        const message = document.createElement("span");
        message.className = "chord-editor-message";
        editor.append(input, message);

        const state = {
            ...options,
            partId: options.partId || options.part?.getAttribute("id") || null,
            editor,
            input,
            message,
            originalText: input.value,
            saving: false,
            hiddenGraphic: options.graphic?.svg || null
        };
        state.reposition = () => positionEditor(state);
        state.onOutside = event => {
            if (!editor.contains(event.target)) void saveEditor(state);
        };
        editor.addEventListener("submit", event => {
            event.preventDefault();
            void saveEditor(state);
        });
        editor.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeEditor(state);
            } else if (event.key === " " && !state.isTextOnly) {
                event.preventDefault();
                event.stopPropagation();
                void saveEditor(state, true);
            }
        });

        activeEditor = state;
        document.body.appendChild(editor);
        if (state.hiddenGraphic) state.hiddenGraphic.style.visibility = "hidden";
        positionEditor(state);
        document.addEventListener("pointerdown", state.onOutside, true);
        window.addEventListener("resize", state.reposition);
        window.addEventListener("scroll", state.reposition, true);
        input.focus();
        input.select();
    }

    function handleDoubleClick(event) {
        if (activeEditor || !(event.target instanceof Element)) return;
        const group = event.target.closest("g.vf-text");
        if (!group || !scoreContainer.contains(group)) return;
        try {
            const candidates = chordGraphics().filter(graphic =>
                graphic.svg === group &&
                (graphic.type === "harmony" || chordTextLooksLikeSymbol(graphic.text))
            );
            if (!candidates.length) {
                if (group.classList.contains("lyrics") || group.classList.contains("dash")) return;
                const sourceDocument = window.PartitionClick.getMusicXmlDocument();
                const sourceElement = window.PartitionClick.getSourceXmlElement(group);
                if (!sourceDocument || !sourceElement ||
                    sourceElement.ownerDocument !== sourceDocument ||
                    sourceElement.children.length ||
                    !sourceElement.textContent.trim() ||
                    sourceElement.localName === "lyric") return;
                let measure = sourceElement;
                while (measure && measure.localName !== "measure") {
                    measure = measure.parentElement;
                }
                const part = measure?.parentElement?.localName === "part"
                    ? measure.parentElement
                    : null;
                openEditor({
                    sourceDocument,
                    part,
                    graphic: { svg: group, text: group.textContent.trim() },
                    symbol: { element: sourceElement },
                    type: "text",
                    isTextOnly: true,
                    initialValue: sourceElement.textContent
                });
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if (candidates.length !== 1) throw new Error("Accord ambigu sur la partition.");
            const graphic = candidates[0];
            const sourceDocument = window.PartitionClick.getMusicXmlDocument();
            if (!sourceDocument) throw new Error("Partition MusicXML introuvable.");
            const { part, symbol } = findSourceSymbol(sourceDocument, graphic);
            event.preventDefault();
            event.stopPropagation();
            openEditor({
                sourceDocument,
                part,
                partId: graphic.partId,
                staffId: graphic.staffId,
                position: { measureIndex: graphic.measureIndex, time: graphic.time },
                symbol,
                graphic,
                type: graphic.type,
                isNew: false
            });
        } catch (error) {
            console.error("Could not open the chord editor.", error);
            window.alert(`Impossible de modifier l'accord : ${error.message}`);
        }
    }

    async function addChordToSelectedNote() {
        if (activeEditor) throw new Error("Terminez d'abord la modification de l'accord en cours.");
        if (document.getElementById("lyric-inline-editor")) {
            throw new Error("Terminez d'abord la modification de la parole en cours.");
        }
        const selectedNotes = window.SelectionActions.getSelectedNotes();
        if (selectedNotes.length !== 1) {
            throw new Error("Sélectionnez une seule note pour ajouter un accord.");
        }
        const note = window.PartitionClick.getSourceXmlElement(selectedNotes[0]);
        if (note?.localName !== "note" || xmlChildren(note, "rest").length) {
            throw new Error("La sélection ne correspond pas à une note.");
        }
        const sourceDocument = window.PartitionClick.getMusicXmlDocument();
        if (!sourceDocument || note.ownerDocument !== sourceDocument) {
            throw new Error("Impossible de retrouver la note sélectionnée dans le MusicXML.");
        }
        const measure = note.parentElement;
        const part = measure?.parentElement;
        if (measure?.localName !== "measure" || part?.localName !== "part") {
            throw new Error("Partie MusicXML introuvable.");
        }
        const partId = part.getAttribute("id");
        const staffId = xmlChildren(note, "staff")[0]?.textContent || "1";
        const position = findPositionForNote(note, partId, staffId);
        const existing = chordTimeline(part, staffId).symbols.filter(symbol =>
            samePosition(symbol, position) &&
            (symbol.type === "harmony" || chordTextLooksLikeSymbol(symbol.element.textContent))
        );
        if (existing.length > 1) throw new Error("Plusieurs accords correspondent à cette note.");
        if (existing.length === 1) {
            const graphic = findGraphicForSymbol({ part, staffId, symbol: existing[0] });
            openEditor({
                sourceDocument,
                part,
                partId,
                staffId,
                position,
                symbol: existing[0],
                graphic,
                type: existing[0].type,
                isNew: false
            });
            return;
        }
        openEditor({
            sourceDocument,
            part,
            partId,
            staffId,
            position,
            symbol: null,
            graphic: null,
            anchorElement: selectedNotes[0],
            type: "harmony",
            isNew: true
        });
    }

    async function convertSelectedTextToChord() {
        if (activeEditor) throw new Error("Terminez d'abord la modification de l'accord en cours.");
        const selectedElements = window.SelectionActions.getSelectedNotes();
        const selectedSources = Array.from(new Set(selectedElements
            .map(element => window.PartitionClick.getSourceXmlElement(element))
            .filter(Boolean)));
        if (selectedSources.length !== 1) {
            throw new Error("Sélectionnez un seul texte pour le convertir en accord.");
        }
        const textElement = selectedSources[0];
        if (!textElement || !["words", "rehearsal"].includes(textElement.localName) ||
            textElement.parentElement?.localName !== "direction-type") {
            throw new Error("Le texte sélectionné ne peut pas être converti en accord.");
        }
        const value = textElement.textContent.trim();
        parseChord(value);
        const direction = textElement.parentElement.parentElement;
        const measure = direction.parentElement;
        const part = measure?.parentElement;
        const sourceDocument = window.PartitionClick.getMusicXmlDocument();
        if (direction.localName !== "direction" || measure?.localName !== "measure" ||
            part?.localName !== "part" || textElement.ownerDocument !== sourceDocument) {
            throw new Error("Impossible de retrouver la position du texte dans le MusicXML.");
        }

        const textPath = getElementPath(sourceDocument, textElement);
        const directionPath = getElementPath(sourceDocument, direction);
        if (!textPath || !directionPath) {
            throw new Error("Impossible de retrouver le texte dans le MusicXML.");
        }
        const updatedDocument = sourceDocument.cloneNode(true);
        const updatedText = getElementAtPath(updatedDocument.documentElement, textPath);
        const updatedDirection = getElementAtPath(updatedDocument.documentElement, directionPath);
        if (!updatedText || !updatedDirection) {
            throw new Error("Le texte sélectionné n'existe plus dans le MusicXML.");
        }
        const harmony = updatedDocument.createElementNS(updatedText.namespaceURI, "harmony");
        updateHarmony(harmony, value);
        if (updatedDirection.hasAttribute("placement")) {
            harmony.setAttribute("placement", updatedDirection.getAttribute("placement"));
        }
        for (const name of ["offset", "staff"]) {
            const child = xmlChildren(updatedDirection, name)[0];
            if (child) {
                const copy = updatedDocument.createElementNS(updatedText.namespaceURI, name);
                copy.textContent = child.textContent;
                harmony.appendChild(copy);
            }
        }
        updatedDirection.parentElement.insertBefore(harmony, updatedDirection);

        const directionType = updatedText.parentElement;
        updatedText.remove();
        if (!directionType.children.length && !directionType.textContent.trim()) {
            directionType.remove();
        }
        if (!xmlChildren(updatedDirection, "direction-type").length &&
            !xmlChildren(updatedDirection, "sound").length) {
            updatedDirection.remove();
        }

        const rendered = await window.FileActions.updateMusicXml(
            updatedDocument,
            "Converted text to chord symbol"
        );
        if (!rendered) throw new Error("La partition n'a pas pu être actualisée.");
        return true;
    }

    function initialize(osmdInstance, container) {
        if (osmd) return;
        if (!osmdInstance || !(container instanceof Element)) {
            throw new TypeError("ChordEditActions requires an OSMD instance and score container.");
        }
        osmd = osmdInstance;
        scoreContainer = container;
        scoreContainer.addEventListener("dblclick", handleDoubleClick);
        let localizationFrame = 0;
        const localizationObserver = new MutationObserver(() => {
            if (localizationFrame) return;
            localizationFrame = requestAnimationFrame(() => {
                localizationFrame = 0;
                localizeChordGraphics();
            });
        });
        localizationObserver.observe(scoreContainer, { childList: true, subtree: true });
    }

    window.ChordEditActions = Object.freeze({
        initialize,
        addChordToSelectedNote,
        convertSelectedTextToChord
    });
})();
