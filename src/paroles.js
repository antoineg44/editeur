
function findLyricBySvgElement(svgElement) {
    if (!osmd.graphic) return null;

    for (const measure of osmd.graphic.measureList) {
        for (const staff of measure) {
            if (!staff) continue;

            for (const staffEntry of staff.staffEntries) {
                for (const lyric of staffEntry.lyricsEntries) {
                    if (lyric.graphicalLabel?.SVGNode === svgElement) {
                        return lyric.lyricsEntry;
                    }
                }
            }
        }
    }

    return null;
}

document.getElementById("score").addEventListener("click", function (event) {
    const svgElement = event.target.closest(".lyrics");
    if (!svgElement || !this.contains(svgElement)) return;

    const lyric = findLyricBySvgElement(svgElement);
    if (!lyric) return;

    console.log("Parole cliquée :", lyric.text, "— couplet :", lyric.verseNumber);
    console.log("Parole OSMD :", lyric);
});

function xmlChildren(element, name) {
    return Array.from(element.children).filter(child => child.localName === name);
}

function findXmlNotes(xml, voiceEntry) {
    const staff = voiceEntry.parentSourceStaffEntry.parentStaff;
    const measureIndex = voiceEntry.notes[0].sourceMeasure.measureListIndex;
    const part = xmlChildren(xml.documentElement, "part")
        .find(element => element.getAttribute("id") === staff.parentInstrument.idString);
    if (!part) throw new Error("Partie MusicXML introuvable.");

    const measures = xmlChildren(part, "measure");
    if (!measures[measureIndex]) throw new Error("Mesure MusicXML introuvable.");

    let divisions = 0;
    let time = 0;
    let previousNoteTime = 0;
    const matches = [];
    for (let i = 0; i <= measureIndex; i++) {
        time = 0;
        previousNoteTime = 0;
        for (const element of measures[i].children) {
            if (element.localName === "attributes") {
                const value = xmlChildren(element, "divisions")[0];
                if (value) divisions = Number(value.textContent);
            } else if (element.localName === "backup" || element.localName === "forward") {
                const duration = Number(xmlChildren(element, "duration")[0]?.textContent);
                if (!(divisions > 0) || !Number.isFinite(duration)) {
                    throw new Error("Durée MusicXML invalide.");
                }
                time += (element.localName === "backup" ? -1 : 1) * duration / (4 * divisions);
            } else if (element.localName === "note") {
                const chord = xmlChildren(element, "chord").length > 0;
                const noteTime = chord ? previousNoteTime : time;
                if (!chord) previousNoteTime = time;

                if (i === measureIndex &&
                    Math.abs(noteTime - voiceEntry.timestamp.RealValue) < 0.0000001 &&
                    (xmlChildren(element, "voice")[0]?.textContent || "1") === String(voiceEntry.parentVoice.voiceId) &&
                    (xmlChildren(element, "staff")[0]?.textContent || "1") === String(staff.id)) {
                    matches.push(element);
                }

                const durationElement = xmlChildren(element, "duration")[0];
                if (!chord && durationElement) {
                    const duration = Number(durationElement.textContent);
                    if (!(divisions > 0) || !Number.isFinite(duration)) {
                        throw new Error("Durée MusicXML invalide.");
                    }
                    time += duration / (4 * divisions);
                }
            }
        }
    }

    return matches;
}

function findXmlLyric(xml, lyric) {
    const voiceEntry = lyric.parent;
    const measureIndex = voiceEntry.notes[0].sourceMeasure.measureListIndex;
    const matches = findXmlNotes(xml, voiceEntry).flatMap(note =>
        xmlChildren(note, "lyric").filter(candidate => {
            const text = Array.from(candidate.children)
                .filter(child => child.localName === "text" || child.localName === "elision")
                .map(child => child.textContent).join("");
            return (candidate.getAttribute("number") || "1") === String(lyric.verseNumber) &&
                text === lyric.text;
        })
    );
    if (matches.length > 1) {
        // Distinct OSMD voice entries preserve the MusicXML order at the same timestamp.
        const graphicalEntries = osmd.graphic.measureList[measureIndex]
            .filter(Boolean)
            .flatMap(measure => measure.staffEntries)
            .flatMap(entry => entry.lyricsEntries)
            .map(entry => entry.lyricsEntry)
            .filter(entry =>
                entry.parent.parentSourceStaffEntry === voiceEntry.parentSourceStaffEntry &&
                entry.parent.parentVoice.voiceId === voiceEntry.parentVoice.voiceId &&
                entry.parent.timestamp.RealValue === voiceEntry.timestamp.RealValue &&
                entry.verseNumber === lyric.verseNumber && entry.text === lyric.text
            );
        const parents = new Set(graphicalEntries.map(entry => entry.parent));
        if (graphicalEntries.length === matches.length && parents.size === matches.length) {
            const index = graphicalEntries.indexOf(lyric);
            if (index !== -1) return matches[index];
        }
    }

    if (matches.length !== 1) {
        throw new Error("Impossible d'identifier précisément la parole dans le MusicXML.");
    }
    return matches[0];
}

function serializeMusicXml(xml) {
    const serialized = new XMLSerializer().serializeToString(xml)
        .replace(/^\s*<\?xml\s[^?]*\?>/i, "");
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + serialized;
}

function findNextXmlNote(note) {
    const part = note.parentElement.parentElement;
    const measures = xmlChildren(part, "measure");
    const voice = xmlChildren(note, "voice")[0]?.textContent || "1";
    const staff = xmlChildren(note, "staff")[0]?.textContent || "1";
    const positions = [];
    let divisions = 0;
    measures.forEach((measure, measureIndex) => {
        let time = 0;
        let previousTime = 0;
        for (const element of measure.children) {
            if (element.localName === "attributes") {
                const value = xmlChildren(element, "divisions")[0];
                if (value) divisions = Number(value.textContent);
            } else if (element.localName === "backup" || element.localName === "forward") {
                const duration = Number(xmlChildren(element, "duration")[0]?.textContent);
                if (!(divisions > 0) || !Number.isFinite(duration)) throw new Error("Durée MusicXML invalide.");
                time += (element.localName === "backup" ? -1 : 1) * duration / (4 * divisions);
            } else if (element.localName === "note") {
                const chord = xmlChildren(element, "chord").length > 0;
                const noteTime = chord ? previousTime : time;
                if (!chord) previousTime = time;
                if ((xmlChildren(element, "voice")[0]?.textContent || "1") === voice &&
                    (xmlChildren(element, "staff")[0]?.textContent || "1") === staff &&
                    !xmlChildren(element, "rest").length && (!chord || element === note)) {
                    positions.push({ note: element, measureIndex, time: noteTime });
                }
                const durationElement = xmlChildren(element, "duration")[0];
                if (!chord && durationElement) {
                    const duration = Number(durationElement.textContent);
                    if (!(divisions > 0) || !Number.isFinite(duration)) throw new Error("Durée MusicXML invalide.");
                    time += duration / (4 * divisions);
                }
            }
        }
    });
    const current = positions.find(position => position.note === note);
    if (!current) throw new Error("Note de la parole introuvable.");
    const following = positions.filter(position =>
        position.measureIndex > current.measureIndex ||
        (position.measureIndex === current.measureIndex && position.time > current.time + 0.0000001)
    ).sort((a, b) => a.measureIndex - b.measureIndex || a.time - b.time);
    if (following.length > 1 && following[0].measureIndex === following[1].measureIndex &&
        Math.abs(following[0].time - following[1].time) < 0.0000001) {
        throw new Error("La note suivante est ambiguë dans cette voix.");
    }
    return following[0] || null;
}

function setSyllabicLink(lyric, incoming, outgoing) {
    const current = xmlChildren(lyric, "syllabic")[0];
    const type = current?.textContent || "single";
    const hasIncoming = incoming === null ? type === "middle" || type === "end" : incoming;
    const hasOutgoing = outgoing === null ? type === "middle" || type === "begin" : outgoing;
    const value = hasIncoming ? (hasOutgoing ? "middle" : "end") : (hasOutgoing ? "begin" : "single");
    const syllabic = current || lyric.ownerDocument.createElementNS(lyric.namespaceURI, "syllabic");
    syllabic.textContent = value;
    if (!current) lyric.insertBefore(syllabic, lyric.firstChild);
}

function createXmlLyric(note, previousLyric) {
    const lyric = note.ownerDocument.createElementNS(note.namespaceURI, "lyric");
    for (const name of ["number", "name", "placement"]) {
        if (previousLyric?.hasAttribute(name)) lyric.setAttribute(name, previousLyric.getAttribute(name));
    }
    lyric.appendChild(note.ownerDocument.createElementNS(note.namespaceURI, "text"));
    const nextElement = Array.from(note.children).find(child => child.localName === "play" || child.localName === "listen");
    note.insertBefore(lyric, nextElement || null);
    return lyric;
}

function findChordLyrics(note, verse) {
    const notes = [note];
    for (let sibling = note.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
        if (sibling.localName === "backup" || sibling.localName === "forward") break;
        if (sibling.localName !== "note") continue;
        if (!xmlChildren(sibling, "chord").length) break;
        notes.push(sibling);
    }
    return notes.flatMap(candidate => xmlChildren(candidate, "lyric"))
        .filter(lyric => (lyric.getAttribute("number") || "1") === verse);
}

function defaultLyricVerse(note) {
    const voice = xmlChildren(note, "voice")[0]?.textContent || "1";
    const staff = xmlChildren(note, "staff")[0]?.textContent || "1";
    const part = note.parentElement.parentElement;
    const hasFirstVerse = xmlChildren(part, "measure").some(measure =>
        xmlChildren(measure, "note").some(candidate =>
            (xmlChildren(candidate, "voice")[0]?.textContent || "1") === voice &&
            (xmlChildren(candidate, "staff")[0]?.textContent || "1") === staff &&
            xmlChildren(candidate, "lyric").some(lyric => (lyric.getAttribute("number") || "1") === "1")
        )
    );
    return hasFirstVerse ? "2" : "1";
}

function findGraphicalXmlLyric(xml, xmlLyric, measureIndex) {
    const matches = [];
    const note = xmlLyric.parentElement;
    const partId = note.parentElement.parentElement.getAttribute("id");
    const voice = xmlChildren(note, "voice")[0]?.textContent || "1";
    const staffId = xmlChildren(note, "staff")[0]?.textContent || "1";
    const text = Array.from(xmlLyric.children)
        .filter(child => child.localName === "text" || child.localName === "elision")
        .map(child => child.textContent).join("");
    for (const staff of osmd.graphic.measureList[measureIndex] || []) {
        if (!staff) continue;
        for (const staffEntry of staff.staffEntries) {
            for (const graphicalLyric of staffEntry.lyricsEntries) {
                const candidate = graphicalLyric.lyricsEntry;
                const sourceStaff = candidate.parent.parentSourceStaffEntry.parentStaff;
                if (String(candidate.verseNumber) !== (xmlLyric.getAttribute("number") || "1") ||
                    candidate.text !== text || sourceStaff.parentInstrument.idString !== partId ||
                    String(sourceStaff.id) !== staffId || String(candidate.parent.parentVoice.voiceId) !== voice) continue;
                if (findXmlLyric(xml, candidate) === xmlLyric) matches.push(graphicalLyric);
            }
        }
    }
    if (matches.length !== 1) throw new Error("La parole suivante ne peut pas être localisée sur la partition.");
    return matches[0];
}

document.getElementById("score").addEventListener("dblclick", function (event) {
    const svgElement = event.target.closest(".lyrics");
    if (!svgElement || !this.contains(svgElement) || updatingScore || addingLyrics) return;
    const lyric = findLyricBySvgElement(svgElement);
    if (!lyric) return;
    try {
        const xml = new DOMParser().parseFromString(musicXMLText, "application/xml");
        if (xml.querySelector("parsererror")) throw new Error("MusicXML invalide.");
        openLyricEditor(xml, findXmlLyric(xml, lyric), lyric);
    } catch (error) {
        console.error("Erreur de modification de la parole :", error);
        document.getElementById("status").textContent =
            "Impossible de modifier la parole : " + error.message;
    }
});

async function renderLyricScore(text) {
    const scoreContainer = document.getElementById("scoreContainer");
    const scrollTop = scoreContainer.scrollTop;
    const scrollLeft = scoreContainer.scrollLeft;
    await osmd.load(text);
    osmd.Zoom = zoom;
    osmd.render();
    osmd.cursor.show();
    osmd.cursor.reset();
    pages = Array.from(container.querySelectorAll("svg"));
    updatePage(false);
    scoreContainer.scrollTop = scrollTop;
    scoreContainer.scrollLeft = scrollLeft;
}

const lyricControlSelector =
    "#fileInput, #downloadMusicXML, #previousPage, #nextPage, #zoomIn, #zoomOut, #play, #pause, #stop, #toggleAddNote, #toggleAddLyric, #lyricVerse, #toggleAddChord";
let addingLyrics = false;
const addLyricButton = document.getElementById("toggleAddLyric");
const lyricVerseSelector = document.getElementById("lyricVerseSelector");
const lyricVerse = document.getElementById("lyricVerse");
addLyricButton.addEventListener("click", () => {
    if (updatingScore) return;
    if (!addingLyrics && typeof addingChords !== "undefined" && addingChords) {
        document.getElementById("toggleAddChord").click();
    }
    addingLyrics = !addingLyrics;
    addLyricButton.setAttribute("aria-pressed", String(addingLyrics));
    addLyricButton.textContent = addingLyrics ? "Terminer l'ajout de paroles" : "Ajouter des paroles";
    lyricVerseSelector.hidden = !addingLyrics;
    container.classList.toggle("adding-lyrics", addingLyrics);
    document.getElementById("status").textContent = addingLyrics ?
        "Cliquez sur une note pour ajouter ou modifier sa parole." :
        "Ajout de paroles terminé.";
});

container.addEventListener("click", async event => {
    if (!addingLyrics || updatingScore) return;
    const group = event.target.closest(".vf-stavenote");
    if (!group || !container.contains(group)) return;
    const status = document.getElementById("status");
    const controls = Array.from(document.querySelectorAll(lyricControlSelector))
        .map(element => ({ element, disabled: element.disabled }));
    updatingScore = true;
    controls.forEach(control => { control.element.disabled = true; });
    let renderedPlaceholder = false;
    try {
        const graphicalNotes = osmd.graphic.measureList
            .flatMap(measure => measure.filter(Boolean))
            .flatMap(staff => staff.staffEntries)
            .flatMap(entry => entry.graphicalVoiceEntries)
            .flatMap(entry => entry.notes)
            .filter(note => note.getSVGGElement() === group);
        const head = event.target.closest(".vf-notehead");
        const headIndex = head ? Array.from(group.querySelectorAll(".vf-notehead")).indexOf(head) : -1;
        const selected = graphicalNotes.length === 1 ? graphicalNotes[0] :
            graphicalNotes.find(note => note.vfnoteIndex === headIndex);
        if (!selected) throw new Error("Cliquez sur la tête de la note à sélectionner.");
        const sourceNote = selected.sourceNote;
        if (sourceNote.isRest()) throw new Error("Sélectionnez une note, pas un silence.");
        const xml = new DOMParser().parseFromString(musicXMLText, "application/xml");
        if (xml.querySelector("parsererror")) throw new Error("MusicXML invalide.");
        const matches = findXmlNotes(xml, sourceNote.voiceEntry);
        let note = matches[0];
        let chord = false;
        if (matches.length > 1 && matches.length === sourceNote.voiceEntry.notes.length &&
            !xmlChildren(matches[0], "chord").length &&
            matches.slice(1).every(candidate => xmlChildren(candidate, "chord").length)) {
            chord = true;
            note = matches[sourceNote.voiceEntry.notes.indexOf(sourceNote)];
        } else if (matches.length !== 1) {
            throw new Error("Impossible d'identifier précisément cette note dans le MusicXML.");
        }
        if (!note) throw new Error("Impossible d'identifier précisément cette note dans le MusicXML.");
        const verse = lyricVerse.value === "auto" ? defaultLyricVerse(note) : lyricVerse.value;
        const existing = (chord ? matches : [note]).flatMap(candidate => xmlChildren(candidate, "lyric"))
            .filter(lyric => (lyric.getAttribute("number") || "1") === verse);
        if (existing.length > 1) throw new Error("Plusieurs paroles correspondent à cette ligne.");
        const lyric = existing[0] || createXmlLyric(note, null);
        if (!existing.length && verse !== "1") lyric.setAttribute("number", verse);
        if (!existing.length) {
            stopPlayback();
            renderedPlaceholder = true;
            await renderLyricScore(serializeMusicXml(xml));
        }
        const graphicalLyric = findGraphicalXmlLyric(xml, lyric, sourceNote.sourceMeasure.measureListIndex);
        updatingScore = false;
        controls.forEach(control => { control.element.disabled = control.disabled; });
        openLyricEditor(xml, lyric, graphicalLyric.lyricsEntry, !existing.length);
    } catch (error) {
        console.error("Erreur d'ajout de parole :", error);
        if (renderedPlaceholder) {
            try {
                await renderLyricScore(musicXMLText);
            } catch (restoreError) {
                console.error("Erreur de restauration de la partition :", restoreError);
                error = new Error(error.message + " Restauration impossible : " + restoreError.message);
            }
        }
        status.textContent = "Impossible d'ajouter la parole : " + error.message;
        updatingScore = false;
        controls.forEach(control => { control.element.disabled = control.disabled; });
    }
});

function openLyricEditor(xml, initialXmlLyric, initialLyric, initialPendingNew = false) {
    let lyric = initialLyric;
    let xmlLyric = initialXmlLyric;
    let texts = xmlChildren(xmlLyric, "text");
    if (!texts.length) throw new Error("Texte de la parole introuvable.");

    const scoreContainer = document.getElementById("scoreContainer");
    const status = document.getElementById("status");
    const previousStatus = status.textContent;
    const controls = Array.from(document.querySelectorAll(lyricControlSelector))
        .map(element => ({ element, disabled: element.disabled }));
    const editor = document.createElement("form");
    editor.className = "lyric-editor";
    editor.setAttribute("aria-label", "Modifier la parole");
    let inputs = [];
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "✓";
    save.setAttribute("aria-label", "Valider la parole");
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "×";
    cancel.setAttribute("aria-label", "Annuler la modification");
    function populateEditor() {
        texts = xmlChildren(xmlLyric, "text");
        if (!texts.length) throw new Error("Texte de la parole introuvable.");
        inputs = [];
        editor.replaceChildren();
        for (const child of xmlLyric.children) {
            if (child.localName === "text") {
                const input = document.createElement("input");
                input.type = "text";
                input.value = child.textContent;
                input.setAttribute("aria-label", texts.length === 1 ? "Parole" :
                    `Partie ${inputs.length + 1} de la parole`);
                const resizeInput = () => { input.size = Math.max(2, input.value.length + 1); };
                input.addEventListener("input", resizeInput);
                resizeInput();
                editor.appendChild(input);
                inputs.push(input);
            } else if (child.localName === "elision") {
                const separator = document.createElement("span");
                separator.textContent = child.textContent;
                editor.appendChild(separator);
            }
        }
        editor.append(save, cancel);
    }
    populateEditor();
    let activeSvg = null;
    let saving = false;
    let editing = true;
    let pendingNew = initialPendingNew;
    let pendingPrevious = null;
    let hasSavedChanges = false;
    function positionEditor() {
        if (saving || !editing) return;
        const graphicalLyric = osmd.graphic.measureList
            .flatMap(measure => measure.filter(Boolean))
            .flatMap(staff => staff.staffEntries)
            .flatMap(entry => entry.lyricsEntries)
            .find(entry => entry.lyricsEntry === lyric);
        const currentSvg = graphicalLyric?.graphicalLabel?.SVGNode;
        if (!graphicalLyric) return;
        if (currentSvg !== activeSvg) {
            if (activeSvg) activeSvg.style.visibility = "";
            activeSvg = currentSvg;
        }
        const containerRect = scoreContainer.getBoundingClientRect();
        if (activeSvg?.isConnected) {
            const rect = activeSvg.getBoundingClientRect();
            const textElement = activeSvg.querySelector("text");
            const textStyle = textElement && getComputedStyle(textElement);
            const matrix = textElement?.getScreenCTM();
            editor.style.left = rect.left - containerRect.left + scoreContainer.scrollLeft + "px";
            editor.style.top = rect.top - containerRect.top + scoreContainer.scrollTop + "px";
            if (textStyle && matrix) {
                editor.style.fontFamily = textStyle.fontFamily;
                editor.style.fontSize = parseFloat(textStyle.fontSize) * Math.hypot(matrix.a, matrix.b) + "px";
            }
            activeSvg.style.visibility = "hidden";
        } else {
            const note = graphicalLyric.graphicalStaffEntry.graphicalVoiceEntries
                .flatMap(entry => entry.notes).find(entry => entry.getSVGGElement()?.isConnected);
            const svg = note?.getSVGGElement()?.closest("svg");
            if (!svg) throw new Error("Position de la note suivante introuvable.");
            const box = graphicalLyric.graphicalLabel.boundingBox.absolutePosition;
            const point = svg.createSVGPoint();
            point.x = box.x * 10;
            point.y = (box.y - graphicalLyric.graphicalLabel.label.fontHeight - 0.4) * 10;
            const screen = point.matrixTransform(svg.getScreenCTM());
            editor.style.left = screen.x - containerRect.left + scoreContainer.scrollLeft + "px";
            editor.style.top = screen.y - containerRect.top + scoreContainer.scrollTop + "px";
        }
    }
    const observer = new MutationObserver(() => requestAnimationFrame(positionEditor));
    const handleResize = () => requestAnimationFrame(positionEditor);
    scoreContainer.appendChild(editor);
    try {
        positionEditor();
    } catch (error) {
        editor.remove();
        throw error;
    }
    updatingScore = true;
    controls.forEach(control => {
        if (control.element.id !== "pause" && control.element.id !== "stop") {
            control.element.disabled = true;
        }
    });
    observer.observe(container, { childList: true, subtree: true });
    window.addEventListener("resize", handleResize);
    status.textContent = "Espace : note suivante ; tiret : syllabe suivante ; Entrée : valider ; Échap : annuler.";
    inputs[0].focus();
    inputs[0].select();

    function closeEditor() {
        editing = false;
        observer.disconnect();
        window.removeEventListener("resize", handleResize);
        if (activeSvg) activeSvg.style.visibility = "";
        editor.remove();
        updatingScore = false;
        controls.forEach(control => { control.element.disabled = control.disabled; });
    }

    cancel.addEventListener("click", async () => {
        if (saving) return;
        saving = true;
        try {
            if (pendingNew) await renderLyricScore(musicXMLText);
            status.textContent = hasSavedChanges ?
                "Paroles modifiées. Téléchargez le MusicXML pour enregistrer vos changements." : previousStatus;
        } catch (error) {
            console.error("Erreur de restauration de la partition :", error);
            status.textContent = "Impossible de restaurer la partition : " + error.message;
        } finally {
            closeEditor();
        }
    });
    editor.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            event.preventDefault();
            cancel.click();
        } else if ((event.key === " " || event.key === "-") &&
            event.target.tagName === "INPUT" && !event.isComposing &&
            !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            if (!saving && !event.repeat) saveLyric(event.key);
        }
    });

    function committedXmlWithoutPlaceholder(nextLyric, previousLyric, linked) {
        const elements = Array.from(xml.getElementsByTagName("*"));
        const nextIndex = elements.indexOf(nextLyric);
        const previousIndex = elements.indexOf(previousLyric);
        const clone = xml.cloneNode(true);
        const clonedElements = Array.from(clone.getElementsByTagName("*"));
        if (linked) setSyllabicLink(clonedElements[previousIndex], null, false);
        clonedElements[nextIndex].remove();
        return serializeMusicXml(clone);
    }

    async function saveLyric(separator) {
        if (saving) return;
        const emptyInput = inputs.find(input => !input.value.trim());
        const skipEmpty = pendingNew && inputs.every(input => !input.value.trim());
        if (emptyInput && !(skipEmpty && separator === " ")) {
            if (skipEmpty && !separator) {
                cancel.click();
                return;
            }
            status.textContent = "La parole ne peut pas être vide.";
            emptyInput.focus();
            return;
        }
        if (!separator && inputs.every((input, i) => input.value === texts[i].textContent) && !pendingNew) {
            closeEditor();
            status.textContent = hasSavedChanges ?
                "Paroles modifiées. Téléchargez le MusicXML pour enregistrer vos changements." : previousStatus;
            return;
        }

        let next;
        let nextLyrics = [];
        try {
            next = separator ? findNextXmlNote(xmlLyric.parentElement) : null;
            if (next) {
                const verse = xmlLyric.getAttribute("number") || "1";
                nextLyrics = findChordLyrics(next.note, verse);
                if (nextLyrics.length > 1) throw new Error("Plusieurs paroles correspondent au même couplet.");
            }
        } catch (error) {
            console.error("Erreur de navigation des paroles :", error);
            status.textContent = "Impossible de passer à la note suivante : " + error.message;
            return;
        }

        const oldXml = musicXMLText;
        saving = true;
        controls.forEach(control => { control.element.disabled = true; });
        inputs.forEach(input => { input.disabled = true; });
        save.disabled = true;
        cancel.disabled = true;
        stopPlayback();
        try {
            if (skipEmpty) {
                xmlLyric.remove();
                if (pendingPrevious) setSyllabicLink(pendingPrevious, null, false);
            } else {
                texts.forEach((text, i) => { text.textContent = inputs[i].value; });
                if (next) setSyllabicLink(xmlLyric, null, separator === "-");
            }
            if (!next) {
                const updatedXml = serializeMusicXml(xml);
                await renderLyricScore(updatedXml);
                musicXMLText = updatedXml;
                hasSavedChanges = true;
                closeEditor();
                status.textContent = separator ?
                    "Dernière note atteinte. Téléchargez le MusicXML pour enregistrer vos changements." :
                    "Parole modifiée. Téléchargez le MusicXML pour enregistrer vos changements.";
                return;
            }

            const nextLyric = nextLyrics[0] || createXmlLyric(next.note, xmlLyric);
            const nextIsNew = !nextLyrics.length;
            setSyllabicLink(nextLyric, !skipEmpty && separator === "-", null);
            const updatedXml = serializeMusicXml(xml);
            const checkpoint = nextIsNew ?
                committedXmlWithoutPlaceholder(nextLyric, xmlLyric, !skipEmpty && separator === "-") : updatedXml;
            await renderLyricScore(updatedXml);
            const graphicalLyric = findGraphicalXmlLyric(xml, nextLyric, next.measureIndex);
            musicXMLText = checkpoint;
            hasSavedChanges = true;
            pendingNew = nextIsNew;
            pendingPrevious = nextIsNew && !skipEmpty && separator === "-" ? xmlLyric : null;
            xmlLyric = nextLyric;
            lyric = graphicalLyric.lyricsEntry;
            populateEditor();
            save.disabled = false;
            cancel.disabled = false;
            saving = false;
            positionEditor();
            const targetSvg = graphicalLyric.graphicalLabel.SVGNode?.closest("svg") ||
                graphicalLyric.graphicalStaffEntry.graphicalVoiceEntries
                    .flatMap(entry => entry.notes).map(note => note.getSVGGElement()?.closest("svg")).find(Boolean);
            const pageIndex = pages.indexOf(targetSvg);
            if (pageIndex >= 0) {
                currentPage = pageIndex;
                updatePage(false);
            }
            editor.scrollIntoView({ block: "nearest", inline: "nearest" });
            inputs[0].focus();
            inputs[0].select();
            status.textContent = "Espace : note suivante ; tiret : syllabe suivante ; Entrée : valider ; Échap : annuler.";
        } catch (error) {
            console.error("Erreur de modification de la parole :", error);
            musicXMLText = oldXml;
            try {
                await renderLyricScore(oldXml);
            } catch (restoreError) {
                console.error("Erreur de restauration de la partition :", restoreError);
                error = new Error(error.message + " Restauration impossible : " + restoreError.message);
            }
            status.textContent = "Impossible de modifier la parole : " + error.message;
            closeEditor();
        }
    }
    editor.addEventListener("submit", event => {
        event.preventDefault();
        saveLyric(null);
    });
}

document.getElementById("downloadMusicXML").addEventListener("click", function () {
    if (!musicXMLText || updatingScore) return;

    const file = document.getElementById("fileInput").files[0];
    const link = document.createElement("a");
    const url = URL.createObjectURL(new Blob([musicXMLText], { type: "application/vnd.recordare.musicxml+xml" }));
    link.href = url;
    link.download = (file ? file.name.replace(/\.(musicxml|xml)$/i, "") : "partition") + "-modifiee.musicxml";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});
