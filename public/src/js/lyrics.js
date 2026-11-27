"use strict";

(() => {
    let scoreContainer = null;
    let activeEditor = null;
    let isInitialized = false;

    function directChildren(element, name) {
        return Array.from(element.children).filter(child => child.localName === name);
    }

    function findNextXmlNote(note) {
        const part = note.parentElement.parentElement;
        const measures = directChildren(part, "measure");
        const voice = directChildren(note, "voice")[0]?.textContent || "1";
        const staff = directChildren(note, "staff")[0]?.textContent || "1";
        const positions = [];
        let divisions = 0;
        measures.forEach((measure, measureIndex) => {
            let time = 0;
            let previousTime = 0;
            for (const element of measure.children) {
                if (element.localName === "attributes") {
                    const value = directChildren(element, "divisions")[0];
                    if (value) divisions = Number(value.textContent);
                } else if (element.localName === "backup" || element.localName === "forward") {
                    const duration = Number(directChildren(element, "duration")[0]?.textContent);
                    if (!(divisions > 0) || !Number.isFinite(duration)) {
                        throw new Error("Durée MusicXML invalide.");
                    }
                    time += (element.localName === "backup" ? -1 : 1) *
                        duration / (4 * divisions);
                } else if (element.localName === "note") {
                    const chord = directChildren(element, "chord").length > 0;
                    const noteTime = chord ? previousTime : time;
                    if (!chord) previousTime = time;
                    if ((directChildren(element, "voice")[0]?.textContent || "1") === voice &&
                        (directChildren(element, "staff")[0]?.textContent || "1") === staff &&
                        !directChildren(element, "rest").length &&
                        (!chord || element === note)) {
                        positions.push({ note: element, measureIndex, time: noteTime });
                    }

                    const durationElement = directChildren(element, "duration")[0];
                    if (!chord && durationElement) {
                        const duration = Number(durationElement.textContent);
                        if (!(divisions > 0) || !Number.isFinite(duration)) {
                            throw new Error("Durée MusicXML invalide.");
                        }
                        time += duration / (4 * divisions);
                    }
                }
            }
        });

        const current = positions.find(position => position.note === note);
        if (!current) throw new Error("Note de la parole introuvable.");
        const following = positions.filter(position =>
            position.measureIndex > current.measureIndex ||
            (position.measureIndex === current.measureIndex &&
                position.time > current.time + 0.0000001)
        ).sort((left, right) =>
            left.measureIndex - right.measureIndex || left.time - right.time
        );
        if (following.length > 1 &&
            following[0].measureIndex === following[1].measureIndex &&
            Math.abs(following[0].time - following[1].time) < 0.0000001) {
            throw new Error("La note suivante est ambiguë dans cette voix.");
        }
        return following[0] || null;
    }

    function findChordLyrics(note, verse) {
        const notes = [note];
        for (let sibling = note.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
            if (sibling.localName === "backup" || sibling.localName === "forward") break;
            if (sibling.localName !== "note") continue;
            if (!directChildren(sibling, "chord").length) break;
            notes.push(sibling);
        }
        return notes.flatMap(candidate => directChildren(candidate, "lyric"))
            .filter(lyric => (lyric.getAttribute("number") || "1") === verse);
    }

    function createXmlLyric(note, previousLyric) {
        const lyric = note.ownerDocument.createElementNS(note.namespaceURI, "lyric");
        for (const name of ["number", "name", "placement"]) {
            if (previousLyric?.hasAttribute(name)) {
                lyric.setAttribute(name, previousLyric.getAttribute(name));
            }
        }
        lyric.appendChild(note.ownerDocument.createElementNS(note.namespaceURI, "text"));
        const nextElement = Array.from(note.children).find(child =>
            child.localName === "play" || child.localName === "listen"
        );
        note.insertBefore(lyric, nextElement || null);
        return lyric;
    }

    function getNextAvailableLyricVerse(note) {
        const measure = note.parentElement;
        const part = measure?.parentElement;
        if (measure?.localName !== "measure" || part?.localName !== "part") {
            throw new Error("Impossible de retrouver la partie de la note sélectionnée.");
        }

        const voice = directChildren(note, "voice")[0]?.textContent || "1";
        const staff = directChildren(note, "staff")[0]?.textContent || "1";
        const usedVerses = new Set(directChildren(part, "measure")
            .flatMap(candidateMeasure => directChildren(candidateMeasure, "note"))
            .filter(candidate => (
                (directChildren(candidate, "voice")[0]?.textContent || "1") === voice &&
                (directChildren(candidate, "staff")[0]?.textContent || "1") === staff
            ))
            .flatMap(candidate => directChildren(candidate, "lyric")
                .map(lyric => lyric.getAttribute("number") || "1")));
        let verse = 1;
        while (usedVerses.has(String(verse))) verse++;
        return String(verse);
    }

    function setSyllabicLink(lyric, incoming, outgoing) {
        const current = directChildren(lyric, "syllabic")[0];
        const type = current?.textContent || "single";
        const hasIncoming = incoming === null
            ? type === "middle" || type === "end"
            : incoming;
        const hasOutgoing = outgoing === null
            ? type === "middle" || type === "begin"
            : outgoing;
        const value = hasIncoming
            ? (hasOutgoing ? "middle" : "end")
            : (hasOutgoing ? "begin" : "single");
        const syllabic = current ||
            lyric.ownerDocument.createElementNS(lyric.namespaceURI, "syllabic");
        syllabic.textContent = value;
        if (!current) lyric.insertBefore(syllabic, lyric.firstChild);
    }

    function findLyricPositionAnchor(lyric, noteElement) {
        const svg = noteElement.closest("svg");
        const note = lyric.parentElement;
        const part = note?.parentElement?.parentElement;
        const voice = directChildren(note, "voice")[0]?.textContent || "1";
        const staff = directChildren(note, "staff")[0]?.textContent || "1";
        const verse = lyric.getAttribute("number") || "1";
        const sourceDocument = window.PartitionClick.getMusicXmlDocument();
        if (!svg || !part || !sourceDocument) return null;
        const noteAnchor = noteElement.querySelector(".vf-notehead") || noteElement;
        const noteRect = noteAnchor.getBoundingClientRect();
        const noteCenterY = noteRect.top + noteRect.height / 2;
        let nearestGroup = null;
        let nearestDistance = Infinity;

        for (const candidate of sourceDocument.getElementsByTagName("lyric")) {
            if (candidate === lyric || (candidate.getAttribute("number") || "1") !== verse) {
                continue;
            }
            const candidateNote = candidate.parentElement;
            if (candidateNote?.parentElement?.parentElement !== part ||
                (directChildren(candidateNote, "voice")[0]?.textContent || "1") !== voice ||
                (directChildren(candidateNote, "staff")[0]?.textContent || "1") !== staff) {
                continue;
            }

            const candidateGraphicalLyric =
                window.PartitionClick.getGraphicalLyricForSourceXmlElement(candidate);
            const group = candidateGraphicalLyric?.graphicalLabel?.SVGNode;
            if (!group?.isConnected || group.closest("svg") !== svg) continue;

            const distance = Math.abs(getLyricTextRect(group).top - noteCenterY);
            if (distance < nearestDistance) {
                nearestGroup = group;
                nearestDistance = distance;
            }
        }
        return nearestGroup;
    }

    function findNextGraphicalLyric(lyric) {
        const result = window.PartitionClick.getGraphicalLyricForSourceXmlElement(lyric);
        const hasText = directChildren(lyric, "text")
            .some(text => text.textContent.trim().length > 0);
        if (hasText && result?.graphicalLabel?.SVGNode?.isConnected) return result;

        const noteElement = window.PartitionClick
            .getGraphicalElementsForSourceXmlElements([lyric.parentElement])[0];
        if (!noteElement?.isConnected) {
            if (result && hasText) return result;
            throw new Error("La note suivante ne peut pas être localisée sur la partition.");
        }
        return {
            ...(result || { graphicalLabel: null, graphicalStaffEntry: null }),
            graphicalLabel: hasText ? result?.graphicalLabel : null,
            noteElement,
            positionAnchor: findLyricPositionAnchor(lyric, noteElement)
        };
    }

    function serializeMusicXml(xml) {
        return new XMLSerializer().serializeToString(xml);
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

    function getLyricTextRect(group) {
        const textElements = Array.from(group.querySelectorAll("text"))
            .filter(element => element.textContent.trim());
        if (!textElements.length) return group.getBoundingClientRect();

        const rects = textElements.map(element => element.getBoundingClientRect());
        const left = Math.min(...rects.map(rect => rect.left));
        const top = Math.min(...rects.map(rect => rect.top));
        const right = Math.max(...rects.map(rect => rect.right));
        const bottom = Math.max(...rects.map(rect => rect.bottom));
        return { left, top, right, bottom, width: right - left, height: bottom - top };
    }

    function getScrollableAncestor(element) {
        for (let ancestor = element?.parentElement; ancestor; ancestor = ancestor.parentElement) {
            const overflowY = getComputedStyle(ancestor).overflowY;
            if ((overflowY === "auto" || overflowY === "scroll") &&
                ancestor.scrollHeight > ancestor.clientHeight) {
                return ancestor;
            }
        }
        return null;
    }

    function installStyles() {
        const style = document.createElement("style");
        style.textContent = `
            #lyric-inline-editor {
                position: fixed;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                gap: 2px;
                background: white;
                box-shadow: 0 0 0 2px #3498db;
                white-space: pre;
            }

            #lyric-inline-editor input {
                min-width: 2ch;
                max-width: 50vw;
                padding: 0;
                border: 0;
                background: transparent;
                font: inherit;
                outline: none;
            }

            #lyric-inline-editor .lyric-inline-editor-message {
                color: #b42318;
                font: 12px system-ui, sans-serif;
            }
        `;
        document.head.appendChild(style);
    }

    function positionEditor(state) {
        let left;
        let top;
        const group = state.group;
        const text = group?.isConnected ? group.querySelector("text") : null;
        const positionAnchor = state.graphicalLyric?.positionAnchor?.isConnected
            ? state.graphicalLyric.positionAnchor
            : null;
        const anchorText = positionAnchor?.querySelector("text");
        const textStyle = (text || anchorText) && getComputedStyle(text || anchorText);
        const matrix = (text || anchorText)?.getScreenCTM();
        if (group?.isConnected) {
            const rect = getLyricTextRect(group);
            left = rect.left;
            top = rect.top;
        } else if (positionAnchor) {
            const noteElement = state.graphicalLyric.noteElement;
            const noteAnchor = noteElement.querySelector(".vf-notehead") || noteElement;
            const noteRect = noteAnchor.getBoundingClientRect();
            left = noteRect.left;
            top = getLyricTextRect(positionAnchor).top;
        } else {
            const graphicalLyric = state.graphicalLyric;
            const label = graphicalLyric?.graphicalLabel;
            const note = graphicalLyric?.graphicalStaffEntry?.graphicalVoiceEntries
                ?.flatMap(entry => entry.notes)
                .find(entry => entry.getSVGGElement()?.isConnected);
            const noteElement = graphicalLyric?.noteElement || note?.getSVGGElement();
            const svg = noteElement?.closest("svg");
            const position = label?.boundingBox?.absolutePosition;
            if (!noteElement?.isConnected || !svg) {
                throw new Error("Position de la parole suivante introuvable.");
            }
            if (position) {
                const point = svg.createSVGPoint();
                point.x = position.x * 10;
                point.y = (position.y - (label.label?.fontHeight || 0) - 0.4) * 10;
                const screenPosition = point.matrixTransform(svg.getScreenCTM());
                left = screenPosition.x;
                top = screenPosition.y;
            } else {
                const anchor = noteElement.querySelector(".vf-notehead") || noteElement;
                const rect = anchor.getBoundingClientRect();
                left = rect.left;
                top = rect.bottom + Math.max(4, rect.height * 0.35);
            }
        }

        if (textStyle && matrix) {
            const scale = Math.hypot(matrix.a, matrix.b);
            state.editor.style.fontFamily = textStyle.fontFamily;
            state.editor.style.fontSize = `${parseFloat(textStyle.fontSize) * scale}px`;
        }

        state.editor.style.left = `${left}px`;
        state.editor.style.top = `${top}px`;
        const editorRect = state.editor.getBoundingClientRect();
        const scrollTarget = group?.isConnected
            ? group
            : positionAnchor || state.graphicalLyric?.noteElement;
        const scrollableAncestor = getScrollableAncestor(scrollTarget);
        if (scrollableAncestor) {
            const overflowAbove = Math.max(0, -top);
            const overflowBelow = Math.max(0, top + editorRect.height - window.innerHeight);
            const scrollDelta = overflowAbove > 0
                ? -Math.min(overflowAbove, scrollableAncestor.scrollTop)
                : Math.min(
                    overflowBelow,
                    scrollableAncestor.scrollHeight - scrollableAncestor.clientHeight -
                        scrollableAncestor.scrollTop
                );
            if (scrollDelta !== 0) {
                scrollableAncestor.scrollTop += scrollDelta;
                top -= scrollDelta;
            }
        }
        left = Math.max(0, Math.min(left, window.innerWidth - editorRect.width));
        top = Math.max(0, Math.min(top, window.innerHeight - editorRect.height));
        state.editor.style.left = `${left}px`;
        state.editor.style.top = `${top}px`;
    }

    function closeEditor(state) {
        if (activeEditor !== state) return;
        if (state.group?.isConnected) {
            state.group.style.visibility = state.previousVisibility;
        }
        window.removeEventListener("resize", state.reposition);
        window.removeEventListener("scroll", state.reposition, true);
        document.removeEventListener("pointerdown", state.commitOnOutside, true);
        window.removeEventListener("blur", state.commitOnWindowBlur);
        state.editor.remove();
        activeEditor = null;
    }

    function reportEditError(state, error) {
        console.error("Could not edit the selected lyric.", error);
        if (state) closeEditor(state);
        window.alert(`Impossible de modifier la parole : ${error.message}`);
    }

    function setEditorSaving(state, saving) {
        state.saving = saving;
        state.inputs.forEach(input => { input.disabled = saving; });
    }

    function commitOnOutsideClick(state, event) {
        if (state.saving || state.editor.contains(event.target)) return;

        const emptyInput = state.inputs.find(input => !input.value.trim());
        const emptyPendingLyric = state.pendingNew &&
            state.inputs.every(input => !input.value.trim());
        if (emptyInput && !emptyPendingLyric) {
            state.message.textContent = "La parole ne peut pas être vide.";
            event.preventDefault();
            event.stopImmediatePropagation();
            emptyInput.focus();
            return;
        }

        void saveEditor(state);
    }

    function commitOnWindowBlur(state) {
        if (activeEditor === state && !state.saving) void saveEditor(state);
    }

    async function cancelEditor(state) {
        if (state.saving) return;
        if (!state.pendingNew && !state.hasNavigatedChanges) {
            closeEditor(state);
            return;
        }

        const sourceDocument = window.PartitionClick.getMusicXmlDocument();
        if (!sourceDocument || sourceDocument !== state.sourceDocument) {
            reportEditError(state, new Error("La partition a changé pendant la modification."));
            return;
        }
        setEditorSaving(state, true);
        try {
            const updatedDocument = sourceDocument.cloneNode(true);
            if (state.pendingNew) {
                const path = getElementPath(sourceDocument, state.lyric);
                const pendingLyric = path &&
                    getElementAtPath(updatedDocument.documentElement, path);
                if (!pendingLyric) {
                    throw new Error("Impossible de retrouver la syllabe provisoire.");
                }
                pendingLyric.remove();
                if (state.pendingPreviousPath) {
                    const previousLyric = getElementAtPath(
                        updatedDocument.documentElement,
                        state.pendingPreviousPath
                    );
                    if (previousLyric) setSyllabicLink(previousLyric, null, false);
                }
            }

            const rendered = await window.FileActions.updateMusicXml(
                updatedDocument,
                state.hasNavigatedChanges ? "Edited lyric text" : null
            );
            if (!rendered) throw new Error("La partition n’a pas pu être actualisée.");
            closeEditor(state);
        } catch (error) {
            reportEditError(state, error);
        }
    }

    async function saveEditor(state) {
        if (state.saving) return;
        const values = state.inputs.map(input => input.value);
        const emptyInput = state.inputs.find(input => !input.value.trim());
        if (emptyInput) {
            if (state.pendingNew && state.inputs.every(input => !input.value.trim())) {
                await cancelEditor(state);
                return;
            }
            state.message.textContent = "La parole ne peut pas être vide.";
            emptyInput.focus();
            return;
        }

        const originalTexts = directChildren(state.lyric, "text");
        const changed = values.some((value, index) =>
            value !== originalTexts[index]?.textContent
        );
        if (!changed && !state.hasNavigatedChanges && !state.pendingNew) {
            closeEditor(state);
            return;
        }

        const sourceDocument = window.PartitionClick.getMusicXmlDocument();
        if (!sourceDocument || sourceDocument !== state.sourceDocument) {
            reportEditError(state, new Error("La partition a changé pendant la modification."));
            return;
        }
        const path = getElementPath(sourceDocument, state.lyric);
        if (!path) {
            reportEditError(state, new Error("Impossible de retrouver la parole dans le MusicXML."));
            return;
        }

        setEditorSaving(state, true);
        try {
            const updatedDocument = sourceDocument.cloneNode(true);
            const updatedLyric = getElementAtPath(updatedDocument.documentElement, path);
            const updatedTexts = updatedLyric && directChildren(updatedLyric, "text");
            if (!updatedTexts || updatedTexts.length !== values.length) {
                throw new Error("Les paroles ont changé pendant la modification.");
            }
            updatedTexts.forEach((text, index) => { text.textContent = values[index]; });

            const rendered = await window.FileActions.updateMusicXml(
                updatedDocument,
                "Edited lyric text"
            );
            if (!rendered) throw new Error("La partition n’a pas pu être actualisée.");
            closeEditor(state);
        } catch (error) {
            reportEditError(state, error);
        }
    }

    async function navigateEditor(state, separator) {
        if (state.saving) return;
        const values = state.inputs.map(input => input.value);
        const skipEmpty = state.pendingNew && values.every(value => !value.trim());
        const emptyInput = state.inputs.find(input => !input.value.trim());
        if (emptyInput && !(skipEmpty && separator === " ")) {
            state.message.textContent = "La parole ne peut pas être vide.";
            emptyInput.focus();
            return;
        }

        const sourceDocument = window.PartitionClick.getMusicXmlDocument();
        if (!sourceDocument || sourceDocument !== state.sourceDocument) {
            state.message.textContent = "La partition a changé pendant la modification.";
            return;
        }

        let next;
        let nextLyrics = [];
        try {
            next = findNextXmlNote(state.lyric.parentElement);
            if (next) {
                const verse = state.lyric.getAttribute("number") || "1";
                nextLyrics = findChordLyrics(next.note, verse);
                if (nextLyrics.length > 1) {
                    throw new Error("Plusieurs paroles correspondent au même couplet.");
                }
            }
        } catch (error) {
            state.message.textContent = `Impossible de passer à la note suivante : ${error.message}`;
            return;
        }

        const currentPath = getElementPath(sourceDocument, state.lyric);
        const nextNotePath = next && getElementPath(sourceDocument, next.note);
        const nextLyricPath = nextLyrics.length
            ? getElementPath(sourceDocument, nextLyrics[0])
            : null;
        if (!currentPath || (next && !nextNotePath) ||
            (nextLyrics.length && !nextLyricPath)) {
            state.message.textContent = "Impossible de retrouver la note dans le MusicXML.";
            return;
        }

        setEditorSaving(state, true);
        try {
            const updatedDocument = sourceDocument.cloneNode(true);
            const currentLyric = getElementAtPath(updatedDocument.documentElement, currentPath);
            if (!currentLyric) throw new Error("La parole sélectionnée n’existe plus.");

            if (skipEmpty) {
                currentLyric.remove();
                if (state.pendingPreviousPath) {
                    const previousLyric = getElementAtPath(
                        updatedDocument.documentElement,
                        state.pendingPreviousPath
                    );
                    if (previousLyric) setSyllabicLink(previousLyric, null, false);
                }
            } else {
                const currentTexts = directChildren(currentLyric, "text");
                if (currentTexts.length !== values.length) {
                    throw new Error("Les paroles ont changé pendant la modification.");
                }
                currentTexts.forEach((text, index) => { text.textContent = values[index]; });
                const currentSyllabic = directChildren(currentLyric, "syllabic")[0]?.textContent;
                if (next && separator === "-") {
                    setSyllabicLink(currentLyric, null, true);
                } else if (currentSyllabic === "begin" || currentSyllabic === "middle") {
                    setSyllabicLink(currentLyric, null, false);
                }
            }

            if (!next) {
                const rendered = await window.FileActions.updateMusicXml(
                    updatedDocument,
                    "Edited lyric text"
                );
                if (!rendered) throw new Error("La partition n’a pas pu être actualisée.");
                closeEditor(state);
                return;
            }

            const nextNote = getElementAtPath(updatedDocument.documentElement, nextNotePath);
            let nextLyric = nextLyrics.length
                ? getElementAtPath(updatedDocument.documentElement, nextLyricPath)
                : createXmlLyric(nextNote, currentLyric);
            if (!nextLyric) throw new Error("La parole de la note suivante est introuvable.");
            const nextIsNew = nextLyrics.length === 0;
            const nextSyllabic = directChildren(nextLyric, "syllabic")[0]?.textContent;
            if (!skipEmpty && separator === "-") {
                setSyllabicLink(nextLyric, true, null);
            } else if (nextSyllabic === "middle" || nextSyllabic === "end") {
                setSyllabicLink(nextLyric, false, null);
            }

            const pendingPreviousPath = nextIsNew && !skipEmpty && separator === "-"
                ? getElementPath(updatedDocument, currentLyric)
                : null;
            const rendered = await window.FileActions.updateMusicXml(updatedDocument, null);
            if (!rendered) throw new Error("La partition n’a pas pu être actualisée.");

            const renderedDocument = window.PartitionClick.getMusicXmlDocument();
            const renderedNextLyricPath = getElementPath(updatedDocument, nextLyric);
            const renderedNextLyric = renderedDocument && renderedNextLyricPath
                ? getElementAtPath(renderedDocument.documentElement, renderedNextLyricPath)
                : null;
            if (!renderedNextLyric) {
                throw new Error("La parole suivante n’a pas pu être retrouvée après le rendu.");
            }

            const graphicalLyric = findNextGraphicalLyric(renderedNextLyric);
            const hasText = directChildren(renderedNextLyric, "text")
                .some(text => text.textContent.trim().length > 0);
            const group = hasText ? graphicalLyric.graphicalLabel?.SVGNode : null;

            closeEditor(state);
            openEditor(group, renderedNextLyric, renderedDocument, graphicalLyric, {
                pendingNew: nextIsNew,
                pendingPreviousPath,
                hasNavigatedChanges: true
            });
        } catch (error) {
            reportEditError(state, error);
        }
    }

    function openEditor(group, lyric, sourceDocument, graphicalLyric = null, options = {}) {
        const texts = directChildren(lyric, "text");
        if (!texts.length) throw new Error("Texte de la parole introuvable.");

        const editor = document.createElement("form");
        editor.id = "lyric-inline-editor";
        editor.setAttribute("aria-label", "Modifier la parole");
        const inputs = [];
        for (const child of lyric.children) {
            if (child.localName === "text") {
                const input = document.createElement("input");
                input.type = "text";
                input.value = child.textContent;
                input.setAttribute("aria-label", texts.length === 1
                    ? "Parole"
                    : `Partie ${inputs.length + 1} de la parole`);
                input.addEventListener("input", () => {
                    input.size = Math.max(2, input.value.length + 1);
                });
                input.dispatchEvent(new Event("input"));
                editor.appendChild(input);
                inputs.push(input);
            } else if (child.localName === "elision") {
                const separator = document.createElement("span");
                separator.textContent = child.textContent;
                editor.appendChild(separator);
            }
        }

        const message = document.createElement("span");
        message.className = "lyric-inline-editor-message";
        editor.append(message);

        const state = {
            group,
            lyric,
            sourceDocument,
            editor,
            inputs,
            message,
            saving: false,
            previousVisibility: group?.style.visibility || "",
            graphicalLyric,
            pendingNew: Boolean(options.pendingNew),
            pendingPreviousPath: options.pendingPreviousPath || null,
            hasNavigatedChanges: Boolean(options.hasNavigatedChanges),
            reposition: null,
            commitOnOutside: null,
            commitOnWindowBlur: null
        };
        state.reposition = () => positionEditor(state);
        state.commitOnOutside = event => commitOnOutsideClick(state, event);
        state.commitOnWindowBlur = () => commitOnWindowBlur(state);
        editor.addEventListener("submit", event => {
            event.preventDefault();
            void saveEditor(state);
        });
        editor.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                void saveEditor(state);
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                void cancelEditor(state);
                return;
            }
            if ((event.key === " " || event.key === "-") &&
                !event.ctrlKey && !event.altKey && !event.metaKey && !event.repeat) {
                event.preventDefault();
                event.stopPropagation();
                void navigateEditor(state, event.key);
            }
        });

        activeEditor = state;
        document.body.appendChild(editor);
        positionEditor(state);
        if (group) group.style.visibility = "hidden";
        window.addEventListener("resize", state.reposition);
        window.addEventListener("scroll", state.reposition, true);
        document.addEventListener("pointerdown", state.commitOnOutside, true);
        window.addEventListener("blur", state.commitOnWindowBlur);
        inputs[0].focus();
        inputs[0].select();
    }

    function handleDoubleClick(event) {
        if (window.MenuActions.getSelectedMenu() !== "write" || activeEditor ||
            !(event.target instanceof Element)) {
            return;
        }
        const group = event.target.closest("g.vf-text.lyrics");
        if (!group || !scoreContainer.contains(group)) return;

        const result = window.PartitionClick.getPointerResult(event);
        const lyric = window.PartitionClick.getSourceXmlElement(group) ||
            result?.musicXmlElement;
        if (!lyric || lyric.localName !== "lyric") return;

        const sourceDocument = window.PartitionClick.getMusicXmlDocument();
        if (!sourceDocument || lyric.ownerDocument !== sourceDocument) {
            reportEditError(null, new Error("Impossible de retrouver cette parole dans le MusicXML."));
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        try {
            openEditor(group, lyric, sourceDocument);
        } catch (error) {
            console.error("Could not open the selected lyric.", error);
            window.alert(`Impossible de modifier la parole : ${error.message}`);
        }
    }

    async function addLyricToSelectedNote() {
        console.log("[lyrics:add] Starting lyric creation.", {
            activeEditor: Boolean(activeEditor)
        });
        if (activeEditor) throw new Error("Terminez d’abord la modification de la parole en cours.");

        const selectedNotes = window.SelectionActions.getSelectedNotes();
        console.log("[lyrics:add] Current note selection.", {
            selectedNotes: selectedNotes.length
        });
        if (selectedNotes.length !== 1) {
            throw new Error("Sélectionnez une seule note pour ajouter une parole.");
        }

        const note = window.PartitionClick.getSourceXmlElement(selectedNotes[0]);
        console.log("[lyrics:add] Selected MusicXML element.", {
            element: note?.localName || null,
            isRest: note?.localName === "note" && directChildren(note, "rest").length > 0
        });
        if (note?.localName !== "note" || directChildren(note, "rest").length) {
            throw new Error("La sélection ne correspond pas à une note.");
        }

        const sourceDocument = window.PartitionClick.getMusicXmlDocument();
        if (!sourceDocument || note.ownerDocument !== sourceDocument) {
            throw new Error("Impossible de retrouver la note sélectionnée dans le MusicXML.");
        }
        const notePath = getElementPath(sourceDocument, note);
        if (!notePath) throw new Error("Impossible de retrouver la note dans le MusicXML.");

        const updatedDocument = sourceDocument.cloneNode(true);
        const updatedNote = getElementAtPath(updatedDocument.documentElement, notePath);
        if (!updatedNote) throw new Error("Impossible de copier la note sélectionnée.");

        const verse = getNextAvailableLyricVerse(note);
        console.log("[lyrics:add] Creating lyric verse.", {
            verse,
            voice: directChildren(note, "voice")[0]?.textContent || "1",
            staff: directChildren(note, "staff")[0]?.textContent || "1"
        });
        const lyric = createXmlLyric(updatedNote, directChildren(updatedNote, "lyric")[0]);
        if (verse !== "1") lyric.setAttribute("number", verse);
        const lyricPath = getElementPath(updatedDocument, lyric);
        if (!lyricPath) throw new Error("Impossible de créer la parole dans le MusicXML.");

        const rendered = await window.FileActions.updateMusicXml(updatedDocument, null);
        console.log("[lyrics:add] Score render completed.", { rendered });
        if (!rendered) throw new Error("La partition n’a pas pu être actualisée.");

        const renderedDocument = window.PartitionClick.getMusicXmlDocument();
        const renderedLyric = renderedDocument
            ? getElementAtPath(renderedDocument.documentElement, lyricPath)
            : null;
        if (!renderedLyric) {
            throw new Error("La parole n’a pas pu être retrouvée après le rendu.");
        }

        const graphicalLyric = findNextGraphicalLyric(renderedLyric);
        console.log("[lyrics:add] Opening inline editor.", {
            verse,
            graphicalLyricFound: Boolean(graphicalLyric)
        });
        openEditor(null, renderedLyric, renderedDocument, graphicalLyric, {
            pendingNew: true
        });
    }

    function initialize(container) {
        if (isInitialized) return;
        if (!(container instanceof Element)) {
            throw new TypeError("LyricEditActions requires a score container element.");
        }

        isInitialized = true;
        scoreContainer = container;
        installStyles();
        scoreContainer.addEventListener("dblclick", handleDoubleClick);
        window.addEventListener("viritura:vertical-menu-change", event => {
            if (event.detail?.activity !== "write" && activeEditor) {
                void saveEditor(activeEditor);
            }
        });
    }

    window.LyricEditActions = Object.freeze({ initialize, addLyricToSelectedNote });
})();
