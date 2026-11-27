"use strict";

(() => {
    const noteTypes = new Map([
        ["maxima", 32],
        ["long", 16],
        ["breve", 8],
        ["whole", 4],
        ["half", 2],
        ["quarter", 1],
        ["eighth", 0.5],
        ["16th", 0.25],
        ["32nd", 0.125],
        ["64th", 0.0625],
        ["128th", 0.03125],
        ["256th", 0.015625]
    ]);
    const supportedDurationTypes = new Set([
        "64th", "32nd", "16th", "eighth", "quarter", "half", "whole", "breve"
    ]);
    const accidentalAlterations = new Map([
        ["triple-flat", -3],
        ["double-flat", -2],
        ["flat", -1],
        ["natural", 0],
        ["sharp", 1],
        ["double-sharp", 2],
        ["triple-sharp", 3]
    ]);
    const accidentalXmlNames = new Map([
        ["triple-flat", "triple-flat"],
        ["double-flat", "flat-flat"],
        ["flat", "flat"],
        ["natural", "natural"],
        ["sharp", "sharp"],
        ["double-sharp", "double-sharp"],
        ["triple-sharp", "triple-sharp"]
    ]);
    const sharpOrder = ["F", "C", "G", "D", "A", "E", "B"];
    const flatOrder = ["B", "E", "A", "D", "G", "C", "F"];
    const noteChildOrder = new Map([
        ["grace", 0],
        ["cue", 1],
        ["chord", 2],
        ["pitch", 3],
        ["unpitched", 3],
        ["rest", 3],
        ["duration", 4],
        ["tie", 5],
        ["instrument", 6],
        ["voice", 7],
        ["type", 8],
        ["dot", 9],
        ["accidental", 10],
        ["time-modification", 11],
        ["stem", 12],
        ["notehead", 13],
        ["staff", 14],
        ["beam", 15],
        ["notations", 16],
        ["lyric", 17],
        ["play", 18]
    ]);
    let updateQueue = Promise.resolve();

    function getLocalName(element) {
        return element?.localName || element?.nodeName?.split(":").pop();
    }

    function getDirectChild(parent, name) {
        return Array.from(parent?.children || []).find(
            child => getLocalName(child) === name
        ) || null;
    }

    function getChildText(parent, name) {
        return getDirectChild(parent, name)?.textContent.trim() || "";
    }

    function createXmlElement(document, parent, name) {
        const qualifiedName = parent.prefix ? `${parent.prefix}:${name}` : name;
        return parent.namespaceURI
            ? document.createElementNS(parent.namespaceURI, qualifiedName)
            : document.createElement(qualifiedName);
    }

    function insertXmlElement(parent, element, name) {
        const order = noteChildOrder.get(name);
        const next = Array.from(parent.children).find(child => {
            const childOrder = noteChildOrder.get(getLocalName(child));
            return childOrder !== undefined && childOrder > order;
        });
        parent.insertBefore(element, next);
    }

    function ensureXmlChild(document, parent, name) {
        let element = getDirectChild(parent, name);
        if (!element) {
            element = createXmlElement(document, parent, name);
            insertXmlElement(parent, element, name);
        }
        return element;
    }

    function getPart(note) {
        let part = note.parentElement;
        while (part && getLocalName(part) !== "part") part = part.parentElement;
        if (!part) throw new Error("La note sélectionnée n'appartient pas à une partie MusicXML.");
        return part;
    }

    function getMeasure(note) {
        const measure = note.parentElement;
        if (getLocalName(measure) !== "measure") {
            throw new Error("La note sélectionnée n'est pas dans une mesure MusicXML standard.");
        }
        return measure;
    }

    function getStaffNumber(note) {
        return getChildText(note, "staff") || "1";
    }

    function getDivisions(note) {
        const part = getPart(note);
        let divisions = null;

        for (const measure of Array.from(part.children)) {
            if (getLocalName(measure) !== "measure") continue;
            for (const child of Array.from(measure.children)) {
                if (child === note) {
                    if (!Number.isFinite(divisions) || divisions <= 0) {
                        throw new Error("La mesure ne définit pas de divisions MusicXML valides.");
                    }
                    return divisions;
                }
                if (getLocalName(child) !== "attributes") continue;
                const divisionsElement = getDirectChild(child, "divisions");
                if (divisionsElement) divisions = Number(divisionsElement.textContent);
            }
        }

        throw new Error("Impossible de trouver les divisions de la note sélectionnée.");
    }

    function getKeyFifths(note) {
        const part = getPart(note);
        const targetMeasure = getMeasure(note);
        const staffNumber = getStaffNumber(note);
        let fifths = 0;

        for (const measure of Array.from(part.children)) {
            if (getLocalName(measure) !== "measure") continue;
            for (const child of Array.from(measure.children)) {
                if (child === note) return fifths;
                if (getLocalName(child) !== "attributes") continue;

                const keys = Array.from(child.children).filter(
                    element => getLocalName(element) === "key"
                );
                const key = keys.find(
                    element => element.getAttribute("number") === staffNumber
                ) || keys.find(element => !element.hasAttribute("number"));
                if (!key) continue;

                const fifthsElement = getDirectChild(key, "fifths");
                if (!fifthsElement) {
                    throw new Error("Les altérations de cette tonalité ne sont pas prises en charge.");
                }
                fifths = Number(fifthsElement.textContent);
                if (!Number.isInteger(fifths) || fifths < -7 || fifths > 7) {
                    throw new Error("La tonalité de cette note n'est pas prise en charge.");
                }
            }
            if (measure === targetMeasure) return fifths;
        }

        return fifths;
    }

    function getKeyAlteration(step, fifths) {
        if (fifths > 0) return sharpOrder.slice(0, fifths).includes(step) ? 1 : 0;
        if (fifths < 0) return flatOrder.slice(0, -fifths).includes(step) ? -1 : 0;
        return 0;
    }

    function getVoice(note) {
        return getChildText(note, "voice") || "1";
    }

    function getChordGroup(note) {
        const measure = getMeasure(note);
        const notes = Array.from(measure.children).filter(
            child => getLocalName(child) === "note"
        );
        const selectedIndex = notes.indexOf(note);
        if (selectedIndex < 0) throw new Error("Impossible de retrouver la note dans sa mesure.");

        let first = selectedIndex;
        while (first > 0 && getDirectChild(notes[first], "chord")) first--;
        let last = first + 1;
        while (last < notes.length && getDirectChild(notes[last], "chord")) last++;
        return notes.slice(first, last);
    }

    function getDots(note) {
        return Array.from(note.children).filter(
            child => getLocalName(child) === "dot"
        ).length;
    }

    function hasTie(note) {
        const notations = getDirectChild(note, "notations");
        return Boolean(getDirectChild(note, "tie") ||
            Array.from(notations?.children || []).some(
                element => getLocalName(element) === "tied"
            ));
    }

    function getDottedMultiplier(dotCount) {
        if (!Number.isInteger(dotCount) || dotCount < 0 || dotCount > 4) {
            throw new Error("Seules les notes avec zéro à quatre points sont prises en charge.");
        }
        return 2 - 1 / Math.pow(2, dotCount);
    }

    function calculateDuration(type, dotCount, divisions) {
        const quarterNotes = noteTypes.get(type);
        if (!quarterNotes) {
            throw new Error("La valeur de note sélectionnée n'est pas prise en charge.");
        }
        return quarterNotes * divisions * getDottedMultiplier(dotCount);
    }

    function getRepresentableDuration(duration, divisions) {
        for (const [type, quarterNotes] of noteTypes) {
            for (let dotCount = 0; dotCount <= 4; dotCount++) {
                const candidate = quarterNotes * divisions * getDottedMultiplier(dotCount);
                if (Math.abs(candidate - duration) < 1e-8) {
                    return { type, dotCount };
                }
            }
        }
        throw new Error("La durée compensatoire ne peut pas être notée avec les valeurs disponibles.");
    }

    function getRestComponents(duration, divisions) {
        const candidates = [];
        for (const [type, quarterNotes] of noteTypes) {
            for (let dotCount = 0; dotCount <= 4; dotCount++) {
                candidates.push({
                    type,
                    dotCount,
                    duration: quarterNotes * divisions * getDottedMultiplier(dotCount)
                });
            }
        }
        candidates.sort((left, right) => right.duration - left.duration);

        const components = [];
        let remaining = duration;
        while (remaining > 1e-8) {
            const candidate = candidates.find(item => item.duration <= remaining + 1e-8);
            if (!candidate || components.length >= 4096) {
                throw new Error("La durée compensatoire ne peut pas être notée avec les valeurs disponibles.");
            }
            components.push(candidate);
            remaining -= candidate.duration;
            if (Math.abs(remaining) < 1e-8) remaining = 0;
        }
        return components;
    }

    function getRhythmContext(notes) {
        const first = notes[0];
        const divisions = getDivisions(first);
        const type = getChildText(first, "type").toLowerCase();
        const dotCount = getDots(first);
        const isGrace = Boolean(getDirectChild(first, "grace"));
        let duration = 0;

        for (const note of notes) {
            if (Boolean(getDirectChild(note, "grace")) !== isGrace) {
                throw new Error("Les notes d'un accord n'ont pas le même statut d'agrément.");
            }
            if (getDirectChild(note, "time-modification")) {
                throw new Error("La modification de durées dans un triolet ou autre tuplet n'est pas prise en charge.");
            }
            if (hasTie(note)) {
                throw new Error("La modification de durée d'une note liée n'est pas prise en charge.");
            }
            if (getChildText(note, "type").toLowerCase() !== type || getDots(note) !== dotCount) {
                throw new Error("Les notes de cet accord n'ont pas la même valeur rythmique.");
            }
            if (isGrace) {
                if (getDirectChild(note, "duration")) {
                    throw new Error("Cette note d'agrément contient une durée MusicXML inattendue.");
                }
                continue;
            }

            const value = Number(getChildText(note, "duration"));
            if (!Number.isFinite(value) || value <= 0) {
                throw new Error("La durée MusicXML de la note est invalide.");
            }
            if (duration && Math.abs(duration - value) > 1e-8) {
                throw new Error("Les notes de cet accord n'ont pas la même durée.");
            }
            duration = value;
        }

        if (!isGrace && type) {
            const expected = calculateDuration(type, dotCount, divisions);
            if (Math.abs(expected - duration) > 1e-8) {
                throw new Error("La durée MusicXML ne correspond pas au type et aux points de la note.");
            }
        }

        return { divisions, type, dotCount, duration, isGrace };
    }

    function getFollowingRests(notes) {
        const measure = getMeasure(notes[0]);
        const children = Array.from(measure.children);
        const lastIndex = Math.max(...notes.map(note => children.indexOf(note)));
        const voice = getVoice(notes[0]);
        const rests = [];

        for (const child of children.slice(lastIndex + 1)) {
            const name = getLocalName(child);
            if (name === "backup" || name === "forward") break;
            if (name !== "note") continue;
            if (getVoice(child) !== voice || !getDirectChild(child, "rest")) break;
            if (getDirectChild(child, "time-modification") || hasTie(child) ||
                getDirectChild(child, "grace")) break;

            const duration = Number(getChildText(child, "duration"));
            if (!Number.isFinite(duration) || duration <= 0) break;
            const divisions = getDivisions(child);
            const type = getChildText(child, "type").toLowerCase();
            const dotCount = getDots(child);
            if (type && Math.abs(calculateDuration(type, dotCount, divisions) - duration) > 1e-8) {
                break;
            }
            rests.push({ note: child, duration, divisions });
        }

        return rests;
    }

    function prepareRhythmChange(notes, newDuration) {
        const context = getRhythmContext(notes);
        const oldDuration = context.isGrace ? 0 : context.duration;
        const difference = oldDuration - newDuration;
        if (Math.abs(difference) < 1e-8) {
            return { context, newDuration, restChanges: [], restInsertion: null };
        }

        const followingRests = getFollowingRests(notes);
        if (difference > 0) {
            const firstRest = followingRests[0];
            if (firstRest) {
                const newRestDuration = firstRest.duration + difference;
                try {
                    return {
                        context,
                        newDuration,
                        restChanges: [{
                            note: firstRest.note,
                            components: [{
                                ...getRepresentableDuration(newRestDuration, firstRest.divisions),
                                duration: newRestDuration
                            }]
                        }],
                        restInsertion: null
                    };
                } catch (error) {
                    if (!error.message.startsWith("La durée compensatoire")) throw error;
                }
            }

            return {
                context,
                newDuration,
                restChanges: [],
                restInsertion: {
                    anchor: notes[notes.length - 1],
                    components: getRestComponents(difference, context.divisions)
                }
            };
        }

        let remainingToConsume = -difference;
        const restChanges = [];
        for (const rest of followingRests) {
            if (remainingToConsume < 1e-8) break;
            if (remainingToConsume >= rest.duration - 1e-8) {
                restChanges.push({ note: rest.note, remove: true });
                remainingToConsume -= rest.duration;
                continue;
            }

            const remainingDuration = rest.duration - remainingToConsume;
            restChanges.push({
                note: rest.note,
                components: getRestComponents(remainingDuration, rest.divisions)
            });
            remainingToConsume = 0;
        }

        if (remainingToConsume > 1e-8) {
            throw new Error("Le silence suivant est trop court pour conserver la mesure.");
        }

        return {
            context,
            newDuration,
            restChanges,
            restInsertion: null
        };
    }

    function applyDotCount(note, dotCount, document) {
        const dots = Array.from(note.children).filter(
            child => getLocalName(child) === "dot"
        );
        while (dots.length > dotCount) dots.pop().remove();
        while (dots.length < dotCount) {
            insertXmlElement(note, createXmlElement(document, note, "dot"), "dot");
            dots.push(null);
        }
    }

    function setNoteTypeAndDots(note, type, dotCount, document) {
        const typeElement = ensureXmlChild(document, note, "type");
        typeElement.textContent = type;
        applyDotCount(note, dotCount, document);
    }

    function setDuration(note, duration, document) {
        const durationElement = ensureXmlChild(document, note, "duration");
        durationElement.textContent = String(Number(duration.toFixed(8)));
    }

    function getMeasureDivisions(part, measureIndex) {
        let divisions = null;
        const measures = Array.from(part.children)
            .filter(child => getLocalName(child) === "measure");
        const measure = measures[measureIndex];
        if (!measure) return null;

        for (const candidate of measures.slice(0, measureIndex + 1)) {
            for (const attributes of Array.from(candidate.children)
                .filter(child => getLocalName(child) === "attributes")) {
                const divisionsElement = getDirectChild(attributes, "divisions");
                if (divisionsElement) divisions = Number(divisionsElement.textContent);
            }
        }
        return Number.isFinite(divisions) && divisions > 0 ? divisions : null;
    }

    function getMeasureIndex(part, measure) {
        return Array.from(part.children)
            .filter(child => getLocalName(child) === "measure")
            .indexOf(measure);
    }

    function getTimeSignatureDuration(time) {
        if (Array.from(time.children).some(child =>
            getLocalName(child) === "senza-misura"
        )) return null;
        const beats = Array.from(time.children)
            .filter(child => getLocalName(child) === "beats")
            .map(child => child.textContent.trim());
        const beatTypes = Array.from(time.children)
            .filter(child => getLocalName(child) === "beat-type")
            .map(child => Number(child.textContent.trim()));
        if (!beats.length || beats.length !== beatTypes.length) {
            throw new Error("La signature rythmique de la mesure n’est pas prise en charge.");
        }

        let duration = 0;
        for (let index = 0; index < beats.length; index++) {
            const numerator = beats[index].split("+").reduce((sum, value) => {
                const part = Number(value.trim());
                return Number.isFinite(part) && part > 0 ? sum + part : NaN;
            }, 0);
            const denominator = beatTypes[index];
            if (!Number.isFinite(numerator) || !Number.isFinite(denominator) ||
                numerator <= 0 || denominator <= 0) {
                throw new Error("La signature rythmique de la mesure n’est pas valide.");
            }
            duration += numerator * 4 / denominator;
        }
        if (duration <= 0) {
            throw new Error("La signature rythmique de la mesure n’est pas valide.");
        }
        return duration;
    }

    function getMeasureCapacity(part, measure, staffNumber) {
        if (measure.getAttribute("implicit") === "yes" ||
            measure.getAttribute("implicit") === "true") return null;

        const measureIndex = getMeasureIndex(part, measure);
        if (measureIndex < 0) return null;
        let duration = null;
        const measures = Array.from(part.children)
            .filter(child => getLocalName(child) === "measure");
        let isUnmeasured = false;

        for (let index = 0; index <= measureIndex; index++) {
            let hasRhythmicContent = false;
            for (const child of Array.from(measures[index].children)) {
                if (getLocalName(child) === "attributes") {
                    for (const time of Array.from(child.children)
                        .filter(element => getLocalName(element) === "time")) {
                        const number = time.getAttribute("number");
                        if (number && number !== staffNumber) continue;
                        if (index === measureIndex && hasRhythmicContent) {
                            throw new Error("Un changement de signature rythmique au milieu de la mesure empêche sa vérification automatique.");
                        }
                        duration = getTimeSignatureDuration(time);
                        isUnmeasured = duration === null;
                    }
                } else if (index === measureIndex &&
                    ["note", "backup", "forward"].includes(getLocalName(child))) {
                    hasRhythmicContent = true;
                }
            }
        }
        if (duration === null && !isUnmeasured) {
            throw new Error("Impossible de vérifier la mesure sans signature rythmique.");
        }
        return duration;
    }

    function getMeasureRhythm(part, measure) {
        const measureIndex = getMeasureIndex(part, measure);
        const initialDivisions = getMeasureDivisions(part, measureIndex);
        if (!initialDivisions) {
            throw new Error("La mesure ne définit pas de divisions MusicXML valides.");
        }

        const streams = new Map();
        const notes = [];
        const forwards = [];
        const divisionsByElement = new Map();
        const getStream = (staff, voice) => {
            const key = `${staff}|${voice}`;
            if (!streams.has(key)) streams.set(key, { staff, voice, end: 0 });
            return streams.get(key);
        };
        let divisions = initialDivisions;
        let cursor = 0;
        let highest = 0;
        let previousNoteStart = 0;

        for (const [index, child] of Array.from(measure.children).entries()) {
            const name = getLocalName(child);
            if (name === "attributes") {
                const value = Number(getChildText(child, "divisions"));
                if (Number.isFinite(value) && value > 0) divisions = value;
                continue;
            }

            if (name === "backup" || name === "forward") {
                divisionsByElement.set(child, divisions);
                const duration = Number(getChildText(child, "duration"));
                if (!Number.isFinite(duration) || duration < 0) {
                    throw new Error("La durée d’un backup ou forward est invalide.");
                }
                const amount = duration / divisions;
                if (name === "backup") {
                    cursor -= amount;
                    if (cursor < -1e-8) {
                        throw new Error("La mesure contient un backup qui dépasse le temps courant.");
                    }
                    if (cursor < 0) cursor = 0;
                    previousNoteStart = cursor;
                } else {
                    const start = cursor;
                    cursor += amount;
                    highest = Math.max(highest, cursor);
                    const voice = getChildText(child, "voice");
                    const staff = getChildText(child, "staff");
                    if (voice || staff) {
                        const stream = getStream(staff || "1", voice || "1");
                        stream.end = Math.max(stream.end, cursor);
                    }
                    forwards.push({
                        voice: voice || "1",
                        staff: staff || "1",
                        start,
                        end: cursor,
                        hasVoiceOrStaff: Boolean(voice || staff)
                    });
                    previousNoteStart = cursor;
                }
                continue;
            }

            if (name !== "note") continue;
            const voice = getVoice(child);
            const staff = getStaffNumber(child);
            const chord = Boolean(getDirectChild(child, "chord"));
            const grace = Boolean(getDirectChild(child, "grace"));
            const durationValue = Number(getChildText(child, "duration"));
            if (!grace && (!Number.isFinite(durationValue) || durationValue <= 0)) {
                throw new Error("La durée MusicXML d’une note de la mesure est invalide.");
            }

            const start = chord ? previousNoteStart : cursor;
            if (!chord) previousNoteStart = cursor;
            const duration = grace ? 0 : durationValue / divisions;
            const end = start + duration;
            const stream = getStream(staff, voice);
            stream.end = Math.max(stream.end, end);
            highest = Math.max(highest, end);
            notes.push({
                node: child,
                voice,
                staff,
                chord,
                grace,
                start,
                end,
                duration,
                index,
                divisions
            });
            if (!chord && !grace) cursor = end;
        }

        return {
            streams,
            notes,
            forwards,
            divisionsByElement,
            highest,
            finalCursor: cursor,
            finalDivisions: divisions
        };
    }

    function getVoiceIntervals(rhythm, staff, voice) {
        const intervals = rhythm.notes
            .filter(note =>
                note.staff === staff && note.voice === voice && !note.chord && !note.grace
            )
            .map(note => ({ start: note.start, end: note.end }));
        for (const forward of rhythm.forwards) {
            if (forward.staff === staff && forward.voice === voice) {
                intervals.push({ start: forward.start, end: forward.end });
            }
        }
        return intervals.sort((left, right) => left.start - right.start);
    }

    function ensureMeasureStreamsBalanced(part, measure, affectedStreams, reason) {
        const rhythm = getMeasureRhythm(part, measure);
        if (rhythm.forwards.some(forward => !forward.hasVoiceOrStaff)) {
            throw new Error("Un forward sans voix ni portée empêche de vérifier l’équilibre de la mesure.");
        }

        const uniqueStreams = Array.from(new Map(affectedStreams.map(stream => [
            `${stream.staff}|${stream.voice}`,
            stream
        ])).values());
        const unbalancedVoices = uniqueStreams
            .map(stream => {
                const capacity = getMeasureCapacity(part, measure, stream.staff);
                if (capacity === null) {
                    throw new Error("Impossible de vérifier l’équilibre rythmique de cette mesure.");
                }
                const intervals = getVoiceIntervals(rhythm, stream.staff, stream.voice);
                let previousEnd = 0;
                let hasOverlap = false;
                for (const interval of intervals) {
                    if (interval.start < previousEnd - 1e-8) hasOverlap = true;
                    previousEnd = Math.max(previousEnd, interval.end);
                }
                const duration = intervals.reduce(
                    (total, interval) => total + interval.end - interval.start,
                    0
                );
                const exceedsMeasure = intervals.some(interval =>
                    interval.start < -1e-8 || interval.end > capacity + 1e-8
                );
                return {
                    staff: stream.staff,
                    voice: stream.voice,
                    capacity,
                    duration,
                    hasOverlap,
                    exceedsMeasure
                };
            })
            .filter(stream =>
                Math.abs(stream.duration - stream.capacity) > 1e-8 ||
                stream.hasOverlap ||
                stream.exceedsMeasure
            );

        if (unbalancedVoices.length) {
            const details = unbalancedVoices.map(stream =>
                `voix ${stream.voice} (portée ${stream.staff}) : ${stream.duration.toLocaleString("fr-FR", {
                    maximumFractionDigits: 2
                })} temps${stream.hasOverlap ? " avec un chevauchement" : ""}`
            ).join(", ");
            throw new Error(
                `${reason} (${details}; capacité attendue : ${unbalancedVoices.map(stream =>
                    `${stream.capacity.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} temps`
                ).join(", ")}).`
            );
        }
    }

    function ensureVoiceChangePreservesMeasure(note, sourceVoice, targetVoice) {
        const staff = getStaffNumber(note);
        ensureMeasureStreamsBalanced(
            getPart(note),
            getMeasure(note),
            [
                { staff, voice: sourceVoice },
                { staff, voice: targetVoice }
            ],
            "Le changement de voix déséquilibrerait la mesure"
        );
    }

    function ensureAllMeasureStreamsBalanced(part, measure, reason) {
        const rhythm = getMeasureRhythm(part, measure);
        const streams = Array.from(rhythm.streams.values())
            .map(stream => ({ staff: stream.staff, voice: stream.voice }));
        if (!streams.length) {
            throw new Error("Impossible de vérifier l’équilibre rythmique de cette mesure.");
        }
        ensureMeasureStreamsBalanced(part, measure, streams, reason);
    }

    function getRightBarline(measure) {
        return Array.from(measure.children).find(child =>
            getLocalName(child) === "barline" && child.getAttribute("location") !== "left"
        ) || null;
    }

    function createMeasureRest(document, measure, template, staff, voice, component) {
        const note = template
            ? createCompensatingRest(template, component, document)
            : createXmlElement(document, measure, "note");
        if (!template) {
            insertXmlElement(note, createXmlElement(document, note, "rest"), "rest");
            setDuration(note, component.duration, document);
            setNoteTypeAndDots(note, component.type, component.dotCount, document);
        }
        ensureXmlChild(document, note, "voice").textContent = voice;
        ensureXmlChild(document, note, "staff").textContent = staff;
        return note;
    }

    function addRestsToMeasureStream(document, measure, rhythm, staff, voice, duration) {
        if (duration <= 1e-8) return;
        const key = `${staff}|${voice}`;
        const stream = rhythm.streams.get(key);

        const streamNotes = rhythm.notes.filter(note =>
            note.staff === staff && note.voice === voice && !note.chord && !note.grace
        );
        const templateEvent = streamNotes.reduce((latest, note) =>
            !latest || note.index > latest.index ? note : latest, null
        );
        const restEvents = [];
        let reference = getRightBarline(measure);
        let divisions = rhythm.finalDivisions;

        if (templateEvent) {
            if (stream && stream.end > templateEvent.end + 1e-8) {
                throw new Error("Le silence ne peut pas être ajouté à la fin de cette voix en toute sécurité.");
            }
            const children = Array.from(measure.children);
            let groupEndIndex = templateEvent.index;
            while (groupEndIndex + 1 < children.length &&
                getLocalName(children[groupEndIndex + 1]) === "note" &&
                getDirectChild(children[groupEndIndex + 1], "chord")) {
                groupEndIndex++;
            }

            let backup = null;
            for (let index = groupEndIndex + 1; index < children.length; index++) {
                const name = getLocalName(children[index]);
                if (name === "backup") {
                    backup = children[index];
                    break;
                }
                if (name === "note" || name === "forward") {
                    throw new Error("Le silence ne peut pas être ajouté sans déplacer d’autres éléments de la mesure.");
                }
            }
            if (backup) {
                reference = backup;
                divisions = rhythm.divisionsByElement.get(backup);
            }
            if (!Number.isFinite(divisions) || divisions <= 0) {
                throw new Error("Impossible de déterminer les divisions de la mesure.");
            }
        } else {
            if (rhythm.finalCursor > 1e-8) {
                const backup = createXmlElement(document, measure, "backup");
                setDuration(backup, rhythm.finalCursor * divisions, document);
                measure.insertBefore(backup, reference);
            }
        }

        const components = getRestComponents(duration * divisions, divisions);
        for (const component of components) {
            restEvents.push(createMeasureRest(
                document,
                measure,
                templateEvent?.node || null,
                staff,
                voice,
                component
            ));
        }
        for (const rest of restEvents) measure.insertBefore(rest, reference);

        if (templateEvent && reference && getLocalName(reference) === "backup") {
            const backupDivisions = rhythm.divisionsByElement.get(reference);
            const oldDuration = Number(getChildText(reference, "duration"));
            setDuration(
                reference,
                oldDuration + duration * backupDivisions,
                document
            );
        }
    }

    function getStaffStreams(rhythm, staff, voice, knownVoices = []) {
        const streams = Array.from(rhythm.streams.values())
            .filter(stream => stream.staff === staff);
        for (const knownVoice of new Set([...knownVoices, voice])) {
            if (!streams.some(stream => stream.voice === knownVoice)) {
                streams.push({ staff, voice: knownVoice, end: 0 });
            }
        }
        return streams;
    }

    function getRemovableTrailingGroup(measure, rhythm, capacity, staff, protectedNote) {
        const candidates = rhythm.notes
            .filter(note => note.staff === staff && !note.chord &&
                !note.grace && note.end > capacity + 1e-8)
            .sort((left, right) => right.end - left.end || right.index - left.index);
        const children = Array.from(measure.children);

        for (const candidate of candidates) {
            const groupNodes = [candidate.node];
            let groupEndIndex = candidate.index;
            while (groupEndIndex + 1 < children.length &&
                getLocalName(children[groupEndIndex + 1]) === "note" &&
                getDirectChild(children[groupEndIndex + 1], "chord")) {
                groupEndIndex++;
                groupNodes.push(children[groupEndIndex]);
            }
            if (groupNodes.includes(protectedNote) || groupNodes.some(note =>
                hasTie(note) || getDirectChild(note, "time-modification")
            )) continue;
            if (rhythm.notes.some(note =>
                note.index > groupEndIndex && note.staff === candidate.staff &&
                note.voice === candidate.voice && !note.grace
            )) continue;

            let backup = null;
            let safe = true;
            for (let index = groupEndIndex + 1; index < children.length; index++) {
                const name = getLocalName(children[index]);
                if (name === "backup") {
                    backup = children[index];
                    break;
                }
                if (name === "note" || name === "forward") {
                    safe = false;
                    break;
                }
            }
            if (!safe) continue;

            let backupDuration = null;
            if (backup) {
                const divisions = rhythm.divisionsByElement.get(backup);
                const duration = Number(getChildText(backup, "duration"));
                backupDuration = duration - candidate.duration * divisions;
                if (!Number.isFinite(backupDuration) || backupDuration < -1e-8) continue;
            }
            return {
                nodes: groupNodes,
                backup,
                backupDuration,
                staff: candidate.staff,
                voice: candidate.voice
            };
        }
        return null;
    }

    function repairMeasureRhythm(document, part, measure, staff, voice, protectedNote = null) {
        const capacity = getMeasureCapacity(part, measure, staff);
        if (!capacity) return { accepted: true, changed: false };

        let rhythm = getMeasureRhythm(part, measure);
        const targetVoiceWasMissing = !rhythm.streams.has(`${staff}|${voice}`);
        let targetVoiceCreated = false;
        const knownVoices = Array.from(rhythm.streams.values())
            .filter(stream => stream.staff === staff)
            .map(stream => stream.voice);
        let streams = getStaffStreams(rhythm, staff, voice, knownVoices);
        let overfullStreams = streams.filter(stream => stream.end > capacity + 1e-8);
        let underfullStreams = streams.filter(stream => stream.end < capacity - 1e-8);
        if (!overfullStreams.length && !underfullStreams.length) {
            return { accepted: true, changed: false };
        }

        if (!overfullStreams.length && targetVoiceWasMissing) {
            const targetStream = streams.find(stream => stream.staff === staff &&
                stream.voice === voice);
            if (targetStream && targetStream.end < capacity - 1e-8) {
                addRestsToMeasureStream(
                    document,
                    measure,
                    rhythm,
                    staff,
                    voice,
                    capacity - targetStream.end
                );
                targetVoiceCreated = true;
                rhythm = getMeasureRhythm(part, measure);
                streams = getStaffStreams(rhythm, staff, voice, knownVoices);
                overfullStreams = streams.filter(stream => stream.end > capacity + 1e-8);
                underfullStreams = streams.filter(stream => stream.end < capacity - 1e-8);
            }
        }
        if (!overfullStreams.length && !underfullStreams.length) {
            return { accepted: true, changed: true, targetVoiceCreated };
        }

        const difference = overfullStreams.length
            ? Math.max(...overfullStreams.map(stream => stream.end - capacity))
            : Math.max(...underfullStreams.map(stream => capacity - stream.end));
        const amount = difference.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
        if (!overfullStreams.length) {
            if (!window.confirm(
                `La mesure est incomplète de ${amount} temps. Ajouter des silences pour la compléter avant de continuer ?`
            )) {
                return { accepted: false, changed: false };
            }
            for (const stream of underfullStreams) {
                addRestsToMeasureStream(
                    document,
                    measure,
                    rhythm,
                    stream.staff,
                    stream.voice,
                    capacity - stream.end
                );
                if (targetVoiceWasMissing && stream.staff === staff &&
                    stream.voice === voice) {
                    targetVoiceCreated = true;
                }
                rhythm = getMeasureRhythm(part, measure);
            }
        } else {
            if (!window.confirm(
                `La mesure est trop remplie de ${amount} temps. Supprimer automatiquement les dernières notes et compléter les autres voix avec des silences ?`
            )) {
                return { accepted: false, changed: false };
            }

            let removedCount = 0;
            while (getStaffStreams(rhythm, staff, voice, knownVoices)
                .some(stream => stream.end > capacity + 1e-8) && removedCount < 4096) {
                const group = getRemovableTrailingGroup(
                    measure,
                    rhythm,
                    capacity,
                    staff,
                    protectedNote
                );
                if (!group) {
                    throw new Error("Aucune note de fin ne peut être supprimée sans altérer les autres voix ou la note sélectionnée.");
                }
                if (group.backup) {
                    if (group.backupDuration <= 1e-8) {
                        group.backup.remove();
                    } else {
                        setDuration(group.backup, group.backupDuration, document);
                    }
                }
                group.nodes.forEach(note => note.remove());
                removedCount++;
                rhythm = getMeasureRhythm(part, measure);
            }
            if (getStaffStreams(rhythm, staff, voice, knownVoices)
                .some(stream => stream.end > capacity + 1e-8)) {
                throw new Error("La mesure contient trop de notes pour être réparée automatiquement.");
            }
            streams = getStaffStreams(rhythm, staff, voice, knownVoices);
            underfullStreams = streams.filter(stream => stream.end < capacity - 1e-8);
            for (const stream of underfullStreams) {
                addRestsToMeasureStream(
                    document,
                    measure,
                    rhythm,
                    stream.staff,
                    stream.voice,
                    capacity - stream.end
                );
                rhythm = getMeasureRhythm(part, measure);
            }
        }

        rhythm = getMeasureRhythm(part, measure);
        streams = getStaffStreams(rhythm, staff, voice, knownVoices);
        if (streams.some(stream => Math.abs(stream.end - capacity) > 1e-8)) {
            throw new Error("La mesure n’a pas pu être complétée automatiquement.");
        }
        return { accepted: true, changed: true, targetVoiceCreated };
    }

    function getPartAtIndex(document, partIndex) {
        return Array.from(document.getElementsByTagName("part"))
            .filter(candidate => Array.from(candidate.children)
                .some(child => getLocalName(child) === "measure"))[partIndex] || null;
    }

    function getNearestRestSlot(location, settings, sourceDocument) {
        sourceDocument = sourceDocument || window.PartitionClick.getMusicXmlDocument();
        if (!sourceDocument || !Number.isInteger(location?.partIndex) ||
            !Number.isInteger(location?.measureIndex) ||
            !location.staffNumber || !location.timeInMeasure ||
            !Number.isFinite(location.timeInMeasure.fraction) ||
            !["1", "2", "3"].includes(settings?.voice) ||
            (settings.rest !== undefined && typeof settings.rest !== "boolean")) {
            return null;
        }

        const part = getPartAtIndex(sourceDocument, location.partIndex);
        if (!part) return null;

        const measures = Array.from(part.children)
            .filter(child => getLocalName(child) === "measure");
        const measure = measures[location.measureIndex];
        const divisions = getMeasureDivisions(part, location.measureIndex);
        const graceType = settings.rest ? "" : settings.graceType || "";
        const durationType = settings.duration;
        const dotCount = Number(settings.dotCount);
        if (!measure || !divisions ||
            (graceType && !["acciaccatura", "appoggiatura"].includes(graceType)) ||
            !supportedDurationTypes.has(durationType) ||
            !Number.isInteger(dotCount) || dotCount < 0 || dotCount > 4 ||
            (!settings.rest && (!location.pitch || !"CDEFGAB".includes(location.pitch.note) ||
                !Number.isInteger(location.pitch.octave)))) {
            return null;
        }

        const duration = graceType
            ? 0
            : calculateDuration(durationType, dotCount, divisions);
        const targetTime = location.timeInMeasure.fraction * 4 * divisions;
        const staffNumber = String(location.staffNumber);
        const voice = settings.voice;
        const slots = [];
        let cursor = 0;
        let previousStart = 0;

        for (const child of Array.from(measure.children)) {
            const name = getLocalName(child);
            if (name === "backup" || name === "forward") {
                const amount = Number(getChildText(child, "duration"));
                if (!Number.isFinite(amount) || amount < 0) return null;
                cursor += name === "backup" ? -amount : amount;
                continue;
            }
            if (name !== "note") continue;

            const isChordTone = Boolean(getDirectChild(child, "chord"));
            const start = isChordTone ? previousStart : cursor;
            if (!isChordTone) previousStart = cursor;
            const rest = getDirectChild(child, "rest");
            if (rest && !isChordTone &&
                getStaffNumber(child) === staffNumber &&
                getVoice(child) === voice &&
                !getDirectChild(child, "time-modification") &&
                !getDirectChild(child, "grace") &&
                !hasTie(child)) {
                const restDuration = Number(getChildText(child, "duration"));
                const type = getChildText(child, "type").toLowerCase();
                const dots = getDots(child);
                const typeMatches = !type ||
                    (noteTypes.has(type) && Math.abs(
                        calculateDuration(type, dots, divisions) - restDuration
                    ) < 1e-8);
                if (Number.isFinite(restDuration) && restDuration > 0 &&
                    typeMatches && (graceType || restDuration >= duration - 1e-8)) {
                    const remainingDuration = graceType ? restDuration : restDuration - duration;
                    let remainingComponents = [];
                    if (remainingDuration > 1e-8) {
                        try {
                            remainingComponents = getRestComponents(remainingDuration, divisions);
                        } catch (error) {
                            if (!error.message.startsWith("La durée compensatoire")) throw error;
                        }
                    }
                    if (graceType || remainingDuration <= 1e-8 || remainingComponents.length) {
                        slots.push({
                            note: child,
                            start,
                            duration,
                            divisions,
                            remainingDuration: Math.max(0, remainingDuration),
                            remainingComponents,
                            distance: Math.abs(start - targetTime)
                        });
                    }
                }
            }

            if (!isChordTone) {
                const noteDuration = Number(getChildText(child, "duration"));
                if (Number.isFinite(noteDuration) && noteDuration > 0) cursor += noteDuration;
            }
        }

        slots.sort((left, right) => left.distance - right.distance);
        return slots[0] || null;
    }

    function positionGeneratedVoiceSlot(candidate, location, settings, document) {
        if (candidate.duration <= 1e-8) return candidate;

        const totalDuration = candidate.duration + candidate.remainingDuration;
        const targetTime = location.timeInMeasure.fraction * 4 * candidate.divisions;
        const start = Math.min(
            totalDuration - candidate.duration,
            Math.max(0, Math.round(targetTime - candidate.start))
        );
        const leadingComponents = start > 1e-8
            ? getRestComponents(start, candidate.divisions)
            : [];
        const remainingDuration = totalDuration - start - candidate.duration;
        const remainingComponents = remainingDuration > 1e-8
            ? getRestComponents(remainingDuration, candidate.divisions)
            : [];
        const parent = candidate.note.parentNode;

        for (const component of leadingComponents) {
            parent.insertBefore(
                createCompensatingRest(candidate.note, component, document),
                candidate.note
            );
        }
        setDuration(candidate.note, candidate.duration, document);
        setNoteTypeAndDots(
            candidate.note,
            settings.duration,
            Number(settings.dotCount),
            document
        );
        candidate.remainingDuration = remainingDuration;
        candidate.remainingComponents = remainingComponents;
        return candidate;
    }

    function createCompensatingRest(template, component, document) {
        const note = createXmlElement(document, template, "note");
        insertXmlElement(note, createXmlElement(document, note, "rest"), "rest");
        setDuration(note, component.duration, document);
        ensureXmlChild(document, note, "voice").textContent = getVoice(template);
        const staff = getChildText(template, "staff");
        if (staff) ensureXmlChild(document, note, "staff").textContent = staff;
        setNoteTypeAndDots(note, component.type, component.dotCount, document);
        return note;
    }

    function coalesceAdjacentRests(measure, targetNotes) {
        const part = measure?.parentElement;
        if (getLocalName(measure) !== "measure" || getLocalName(part) !== "part" ||
            !Array.isArray(targetNotes)) {
            throw new TypeError("Adjacent-rest consolidation requires a measure and note list.");
        }

        const targets = new Set(targetNotes);
        const children = Array.from(measure.children);
        const restRuns = [];
        const restEngravingElements = new Set(["stem", "notehead", "beam"]);
        const isSimpleRest = note => {
            const rest = getDirectChild(note, "rest");
            if (!rest || rest.attributes.length ||
                getDirectChild(note, "chord") || getDirectChild(note, "grace") ||
                getDirectChild(note, "time-modification") || hasTie(note)) {
                return false;
            }
            return Array.from(note.children).every(child =>
                ["rest", "duration", "voice", "type", "dot", "staff"]
                    .includes(getLocalName(child)) ||
                restEngravingElements.has(getLocalName(child))
            );
        };
        const getAttributeSignature = element => Array.from(element.attributes)
            .map(attribute => [attribute.name, attribute.value])
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([name, value]) => `${name}=${value}`)
            .join("|");

        for (let index = 0; index < children.length; index++) {
            const first = children[index];
            if (getLocalName(first) !== "note" || !isSimpleRest(first)) continue;

            const run = [first];
            let nextIndex = index + 1;
            while (nextIndex < children.length) {
                const next = children[nextIndex];
                if (getLocalName(next) !== "note" || !isSimpleRest(next) ||
                    getVoice(next) !== getVoice(first) ||
                    getStaffNumber(next) !== getStaffNumber(first) ||
                    getAttributeSignature(next) !== getAttributeSignature(first)) {
                    break;
                }
                run.push(next);
                nextIndex++;
            }

            if (run.length > 1 && run.some(note => targets.has(note))) {
                restRuns.push(run);
            }
            index = nextIndex - 1;
        }

        for (const run of restRuns) {
            let divisions;
            try {
                divisions = getDivisions(run[0]);
            } catch (error) {
                console.warn("Could not consolidate adjacent rests with invalid MusicXML divisions.", error);
                continue;
            }
            const totalDuration = run.reduce(
                (total, note) => total + Number(getChildText(note, "duration")),
                0
            );
            if (!Number.isFinite(totalDuration) || totalDuration <= 0) continue;

            let components;
            try {
                components = getRestComponents(totalDuration, divisions);
            } catch (error) {
                if (!error.message.startsWith("La durée compensatoire")) throw error;
                console.warn("Could not notate the combined duration of adjacent rests.", error);
                continue;
            }
            if (components.length >= run.length) continue;

            const [first, ...removed] = run;
            const reference = removed[removed.length - 1].nextSibling;
            for (const child of Array.from(first.children)) {
                if (restEngravingElements.has(getLocalName(child))) child.remove();
            }
            setDuration(first, components[0].duration, measure.ownerDocument);
            setNoteTypeAndDots(
                first,
                components[0].type,
                components[0].dotCount,
                measure.ownerDocument
            );
            removed.forEach(note => note.remove());
            for (const component of components.slice(1)) {
                const rest = createCompensatingRest(first, component, measure.ownerDocument);
                for (const attribute of Array.from(first.attributes)) {
                    if (attribute.namespaceURI) {
                        rest.setAttributeNS(
                            attribute.namespaceURI,
                            attribute.name,
                            attribute.value
                        );
                    } else {
                        rest.setAttribute(attribute.name, attribute.value);
                    }
                }
                measure.insertBefore(rest, reference);
            }
        }
    }

    async function insertNoteAtNow(location, settings) {
        if (window.SelectionActions.getSelectedNotes().length) {
            throw new Error("Désélectionnez la note avant d’en placer une nouvelle.");
        }
        if (settings.voice === "other") {
            throw new Error("Choisissez une voix numérotée pour placer une note.");
        }

        if (!Number.isInteger(location?.partIndex) ||
            !Number.isInteger(location?.measureIndex) ||
            !location.staffNumber || !location.timeInMeasure ||
            !Number.isFinite(location.timeInMeasure.fraction) ||
            !["1", "2", "3"].includes(settings?.voice) ||
            !supportedDurationTypes.has(settings?.duration) ||
            !Number.isInteger(Number(settings?.dotCount)) ||
            Number(settings.dotCount) < 0 || Number(settings.dotCount) > 4 ||
            (settings.rest !== undefined && typeof settings.rest !== "boolean") ||
            (!settings.rest && (!location.pitch ||
                !"CDEFGAB".includes(location.pitch.note) ||
                !Number.isInteger(location.pitch.octave)))) {
            throw new Error("La position ou les options rythmiques de l’élément à insérer sont invalides.");
        }

        const sourceDocument = window.PartitionClick.getMusicXmlDocument();
        if (!sourceDocument) throw new Error("Aucun MusicXML n’est chargé.");
        const part = getPartAtIndex(sourceDocument, location.partIndex);
        if (!part) throw new Error("Impossible de retrouver la partie de la mesure.");
        const measure = Array.from(part.children)
            .filter(child => getLocalName(child) === "measure")[location.measureIndex];
        if (!measure) throw new Error("Impossible de retrouver la mesure à modifier.");

        const document = sourceDocument.cloneNode(true);
        const clonedPart = getPartAtIndex(document, location.partIndex);
        if (!clonedPart) throw new Error("Impossible de retrouver la partie clonée de la mesure.");
        const clonedMeasure = Array.from(clonedPart.children)
            .filter(child => getLocalName(child) === "measure")[location.measureIndex];
        const measureRepair = repairMeasureRhythm(
            document,
            clonedPart,
            clonedMeasure,
            String(location.staffNumber),
            settings.voice
        );
        if (!measureRepair.accepted) return false;

        let candidate = getNearestRestSlot(location, settings, document);
        if (!candidate) {
            throw new Error("Aucun silence assez long n’est disponible dans cette voix à proximité.");
        }
        if (measureRepair.targetVoiceCreated) {
            candidate = positionGeneratedVoiceSlot(candidate, location, settings, document);
        }

        const rest = candidate.note;
        if (!rest || getLocalName(rest) !== "note") {
            throw new Error("Le silence disponible n’existe plus dans le MusicXML.");
        }

        const note = createXmlElement(document, rest, "note");
        const graceType = settings.rest ? "" : settings.graceType;
        if (settings.rest) {
            insertXmlElement(note, createXmlElement(document, note, "rest"), "rest");
        } else {
            if (graceType) {
                setGrace(note, graceType === "acciaccatura" ? "yes" : "no", document);
            }
            const pitch = createXmlElement(document, note, "pitch");
            const step = createXmlElement(document, pitch, "step");
            step.textContent = location.pitch.note;
            const octave = createXmlElement(document, pitch, "octave");
            octave.textContent = String(location.pitch.octave);
            pitch.append(step, octave);
            insertXmlElement(note, pitch, "pitch");
        }
        if (!graceType) setDuration(note, candidate.duration, document);
        ensureXmlChild(document, note, "voice").textContent = settings.voice;
        ensureXmlChild(document, note, "staff").textContent = String(location.staffNumber);
        setNoteTypeAndDots(note, settings.duration, Number(settings.dotCount), document);

        const parent = rest.parentNode;
        parent.insertBefore(note, rest);
        if (!graceType && candidate.remainingDuration > 1e-8) {
            for (const component of candidate.remainingComponents) {
                parent.insertBefore(createCompensatingRest(rest, component, document), rest);
            }
        }
        if (!graceType) rest.remove();
        if (!settings.rest && settings.accidental) {
            updateAccidental(note, settings.accidental, document);
        }

        const rendered = await window.FileActions.updateMusicXml(
            document,
            measureRepair.changed
                ? "Inserted note at cursor and repaired measure"
                : "Inserted note at cursor"
        );
        if (!rendered) throw new Error("La partition n’a pas pu être actualisée.");

        if (!settings.rest) {
            const graphicalNotes = window.PartitionClick.getGraphicalElementsForSourceXmlElements([note]);
            if (!graphicalNotes.length) {
                throw new Error("La note insérée n’a pas pu être retrouvée après le rendu.");
            }
            window.SelectionActions.replaceSelectedNotes(graphicalNotes);
        }
        return true;
    }

    function insertNoteAt(location, settings) {
        const operation = updateQueue.then(() => insertNoteAtNow(location, settings));
        updateQueue = operation.catch(() => false);
        return operation;
    }

    function applyRestCompensation(plan, document) {
        for (const change of plan.restChanges) {
            if (change.remove) {
                change.note.remove();
                continue;
            }

            const [first, ...remaining] = change.components;
            setNoteTypeAndDots(change.note, first.type, first.dotCount, document);
            setDuration(change.note, first.duration, document);
            const parent = change.note.parentNode;
            const reference = change.note.nextSibling;
            for (const component of remaining) {
                parent.insertBefore(
                    createCompensatingRest(change.note, component, document),
                    reference
                );
            }
        }

        if (plan.restInsertion) {
            const { anchor, components } = plan.restInsertion;
            const parent = anchor.parentNode;
            const reference = anchor.nextSibling;
            for (const component of components) {
                parent.insertBefore(
                    createCompensatingRest(anchor, component, document),
                    reference
                );
            }
        }
    }

    function applyRhythmChange(notes, type, dotCount, newDuration, document) {
        const plan = prepareRhythmChange(notes, newDuration);
        applyRestCompensation(plan, document);
        for (const note of notes) {
            setNoteTypeAndDots(note, type, dotCount, document);
            if (newDuration === 0) {
                getDirectChild(note, "duration")?.remove();
            } else {
                setDuration(note, newDuration, document);
            }
        }
        return true;
    }

    function updateDuration(notes, type) {
        if (!supportedDurationTypes.has(type)) {
            throw new Error("Cette durée n'est pas disponible dans la barre d'outils.");
        }
        const context = getRhythmContext(notes);
        if (context.type === type) return false;

        if (context.isGrace) {
            for (const note of notes) {
                setNoteTypeAndDots(note, type, context.dotCount, note.ownerDocument);
            }
            return true;
        }

        const newDuration = calculateDuration(type, context.dotCount, context.divisions);
        return applyRhythmChange(notes, type, context.dotCount, newDuration, notes[0].ownerDocument);
    }

    function updateDots(notes, dotCount) {
        if (!Number.isInteger(dotCount) || dotCount < 0 || dotCount > 4) {
            throw new Error("Seules les options de zéro à quatre points sont prises en charge.");
        }
        const context = getRhythmContext(notes);
        if (context.dotCount === dotCount) return false;
        if (!context.type) {
            throw new Error("La note ne possède pas de type rythmique permettant de modifier ses points.");
        }

        if (context.isGrace) {
            for (const note of notes) {
                setNoteTypeAndDots(note, context.type, dotCount, note.ownerDocument);
            }
            return true;
        }

        const newDuration = calculateDuration(context.type, dotCount, context.divisions);
        return applyRhythmChange(notes, context.type, dotCount, newDuration, notes[0].ownerDocument);
    }

    function hasChordMarker(note) {
        return Boolean(getDirectChild(note, "chord"));
    }

    function updateRest(note, enabled, document) {
        const rest = getDirectChild(note, "rest");
        if (enabled && rest) return false;
        if (!enabled && rest) {
            throw new Error("Un silence ne contient pas la hauteur initiale; elle doit être ressaisie.");
        }
        if (!enabled) return false;
        if (getDirectChild(note, "grace")) {
            throw new Error("Une note d'agrément ne peut pas être convertie en silence.");
        }
        if (hasChordMarker(note) || getChordGroup(note).length > 1) {
            throw new Error("Une note d'un accord ne peut pas être convertie seule en silence.");
        }
        if (hasTie(note)) {
            throw new Error("Une note liée ne peut pas être convertie en silence.");
        }
        if (!getDirectChild(note, "pitch") || getDirectChild(note, "unpitched")) {
            throw new Error("Seule une note avec une hauteur déterminée peut être convertie en silence.");
        }

        const restElement = createXmlElement(document, note, "rest");
        insertXmlElement(note, restElement, "rest");
        getDirectChild(note, "pitch").remove();
        getDirectChild(note, "accidental")?.remove();
        return true;
    }

    function setGrace(note, slash, document) {
        let grace = getDirectChild(note, "grace");
        if (!grace) {
            grace = createXmlElement(document, note, "grace");
            insertXmlElement(note, grace, "grace");
        }
        grace.setAttribute("slash", slash);
    }

    function updateGrace(notes, graceType, document) {
        if (notes.length !== 1) {
            throw new Error("La note d'agrément ne peut pas être appliquée à une note d'accord seule.");
        }
        const note = notes[0];
        const existingGrace = getDirectChild(note, "grace");
        const isGrace = Boolean(existingGrace);
        if (!graceType && !isGrace) return false;
        if (!graceType && isGrace) {
            const context = getRhythmContext(notes);
            if (!context.type) {
                throw new Error("Le type de la note d'agrément est nécessaire pour rétablir sa durée.");
            }
            const duration = calculateDuration(context.type, context.dotCount, context.divisions);
            const plan = prepareRhythmChange(notes, duration);
            applyRestCompensation(plan, document);
            existingGrace.remove();
            setDuration(note, duration, document);
            return true;
        }
        if (graceType !== "acciaccatura" && graceType !== "appoggiatura") {
            throw new Error("Ce type de note d'agrément n'est pas pris en charge.");
        }
        if (isGrace) {
            const slash = graceType === "acciaccatura" ? "yes" : "no";
            if (existingGrace.getAttribute("slash") === slash) return false;
            existingGrace.setAttribute("slash", slash);
            return true;
        }
        if (getDirectChild(note, "rest")) {
            throw new Error("Un silence ne peut pas devenir une note d'agrément sans hauteur.");
        }
        if (!getDirectChild(note, "pitch") || getDirectChild(note, "unpitched")) {
            throw new Error("Seule une note avec une hauteur déterminée peut devenir une note d'agrément.");
        }
        if (hasTie(note)) {
            throw new Error("Une note liée ne peut pas devenir une note d'agrément.");
        }
        const context = getRhythmContext(notes);
        if (!context.type) {
            throw new Error("La note doit avoir un type rythmique avant de devenir une note d'agrément.");
        }
        const plan = prepareRhythmChange(notes, 0);
        applyRestCompensation(plan, document);
        getDirectChild(note, "duration")?.remove();
        setGrace(note, graceType === "acciaccatura" ? "yes" : "no", document);
        return true;
    }

    function setAlterElement(pitch, alteration, keyAlteration, document) {
        let alter = getDirectChild(pitch, "alter");
        if (alteration === 0 && keyAlteration === 0) {
            alter?.remove();
            return;
        }
        if (!alter) {
            alter = createXmlElement(document, pitch, "alter");
            const octave = getDirectChild(pitch, "octave");
            pitch.insertBefore(alter, octave);
        }
        alter.textContent = String(alteration);
    }

    function updateAccidental(note, accidental, document) {
        const pitch = getDirectChild(note, "pitch");
        if (!pitch) throw new Error("Une altération ne peut être appliquée qu'à une note avec hauteur.");
        if (accidental && !accidentalAlterations.has(accidental)) {
            throw new Error("Cette altération n'est pas disponible dans la barre d'outils.");
        }

        const step = getChildText(pitch, "step").toUpperCase();
        if (!"CDEFGAB".includes(step)) throw new Error("La hauteur de cette note est invalide.");
        const fifths = getKeyFifths(note);
        const keyAlteration = getKeyAlteration(step, fifths);
        const targetAlteration = accidental
            ? accidentalAlterations.get(accidental)
            : keyAlteration;
        const currentAlterElement = getDirectChild(pitch, "alter");
        const currentAlteration = currentAlterElement
            ? Number(currentAlterElement.textContent)
            : keyAlteration;
        const accidentalElement = getDirectChild(note, "accidental");
        const accidentalName = accidental
            ? accidentalXmlNames.get(accidental)
            : "";
        const shouldShowAccidental = Boolean(accidentalName) &&
            targetAlteration !== keyAlteration;
        if (currentAlteration === targetAlteration &&
            Boolean(accidentalElement) === shouldShowAccidental &&
            (!accidentalElement || accidentalElement.textContent.trim() === accidentalName)) {
            return false;
        }

        setAlterElement(pitch, targetAlteration, keyAlteration, document);
        if (!shouldShowAccidental) {
            accidentalElement?.remove();
            return true;
        }

        const element = accidentalElement || ensureXmlChild(document, note, "accidental");
        element.textContent = accidentalName;
        return true;
    }

    function updateVoice(notes, voice, document) {
        if (voice === "other") {
            if (notes.every(note => !["1", "2", "3"].includes(getVoice(note)))) return false;
            throw new Error("« Autre » ne précise pas de numéro de voix à attribuer.");
        }
        if (!["1", "2", "3"].includes(voice)) {
            throw new Error("Cette voix n'est pas disponible.");
        }
        if (notes.every(note => getVoice(note) === voice)) return false;
        for (const note of notes) {
            const voiceElement = ensureXmlChild(document, note, "voice");
            voiceElement.textContent = voice;
        }
        return true;
    }

    function getNodePath(root, node) {
        const path = [];
        let current = node;
        while (current !== root) {
            const parent = current.parentNode;
            if (!parent) throw new Error("Impossible de retrouver la note MusicXML sélectionnée.");
            path.unshift(Array.from(parent.childNodes).indexOf(current));
            current = parent;
        }
        return path;
    }

    function getNodeAtPath(root, path) {
        return path.reduce((node, index) => node?.childNodes[index] || null, root);
    }

    function getXmlElementAtPath(root, path) {
        return path.reduce((node, index) => node?.children[index] || null, root);
    }

    function getXmlAncestor(element, name) {
        let current = element;
        while (current && getLocalName(current) !== name) current = current.parentElement;
        return current || null;
    }

    function reportError(error) {
        console.error("Could not edit the selected MusicXML element.", error);
        window.SelectionActions.refreshToolbarSelection();
        window.alert(`Impossible de modifier l’élément sélectionné : ${error.message}`);
    }

    async function applySelectedNoteUpdateNow(property, value) {
        const selectedElements = window.SelectionActions.getSelectedNotes();
        if (!selectedElements.length) return false;
        if (selectedElements.length !== 1) {
            throw new Error("Sélectionnez une seule note pour la modifier.");
        }

        const sourceDocument = window.PartitionClick.getMusicXmlDocument();
        const sourceNote = window.PartitionClick.getSourceXmlElement(selectedElements[0]);
        if (!sourceDocument || !sourceNote) {
            throw new Error("Impossible de retrouver la note sélectionnée dans le MusicXML.");
        }

        const notePath = getNodePath(sourceDocument, sourceNote);
        const document = sourceDocument.cloneNode(true);
        const note = getNodeAtPath(document, notePath);
        if (!note || getLocalName(note) !== "note") {
            throw new Error("La note sélectionnée n'existe plus dans le MusicXML.");
        }

        let measureRepair = { accepted: true, changed: false };
        if (["duration", "dots", "grace"].includes(property)) {
            measureRepair = repairMeasureRhythm(
                document,
                getPart(note),
                getMeasure(note),
                getStaffNumber(note),
                getVoice(note),
                note
            );
            if (!measureRepair.accepted) return false;
        }

        const notes = getChordGroup(note);
        let changed = false;
        let description = "";

        if (property === "duration") {
            changed = updateDuration(notes, value);
            description = "Changed selected note duration";
        } else if (property === "dots") {
            const dotCount = Number(value);
            changed = updateDots(notes, dotCount);
            description = "Changed augmentation dots";
        } else if (property === "rest") {
            changed = updateRest(note, value === "true", document);
            description = "Changed selected note to rest";
        } else if (property === "grace") {
            changed = updateGrace(notes, value, document);
            description = "Changed grace note";
        } else if (property === "accidental") {
            changed = updateAccidental(note, value, document);
            description = "Changed note accidental";
        } else if (property === "voice") {
            const sourceVoice = getVoice(note);
            changed = updateVoice(notes, value, document);
            if (changed) {
                ensureVoiceChangePreservesMeasure(note, sourceVoice, value);
            }
            description = "Changed selected note voice";
        } else {
            throw new Error("Cette action de barre d'outils n'est pas prise en charge.");
        }

        if (!changed) {
            if (!measureRepair.changed) {
                window.SelectionActions.refreshToolbarSelection();
                return false;
            }
            description = "Repaired measure";
        }

        if (changed && measureRepair.changed) description += " and repaired measure";
        const rendered = await window.FileActions.updateMusicXml(document, description);
        if (!rendered) throw new Error("La partition n'a pas pu être actualisée.");

        const graphicalNotes = window.PartitionClick.getGraphicalElementsForSourceXmlElements(
            [note]
        );
        if (!graphicalNotes.length) {
            throw new Error("La note modifiée n'a pas pu être retrouvée après le rendu.");
        }
        window.SelectionActions.replaceSelectedNotes(graphicalNotes);
        return true;
    }

    function applySelectedNoteUpdate(property, value) {
        const operation = updateQueue.then(async () => {
            try {
                return await applySelectedNoteUpdateNow(property, value);
            } catch (error) {
                reportError(error);
                return false;
            }
        });
        updateQueue = operation.catch(() => false);
        return operation;
    }

    async function applySelectedXmlComponentUpdateNow(path, value, attributeName) {
        if (!Array.isArray(path) || path.some(index =>
            !Number.isInteger(index) || index < 0
        ) || typeof value !== "string" || typeof attributeName !== "string") {
            throw new TypeError("La modification de composant MusicXML est invalide.");
        }

        const selectedElements = window.SelectionActions.getSelectedNotes();
        const sourceElements = Array.from(new Set(selectedElements
            .map(element => window.PartitionClick.getSourceXmlElement(element))
            .filter(Boolean)));
        if (sourceElements.length !== 1) {
            throw new Error("Sélectionnez un seul élément de partition pour le modifier.");
        }
        const sourceDocument = window.PartitionClick.getMusicXmlDocument();
        const sourceElement = sourceElements[0];
        if (!sourceDocument || !sourceElement) {
            throw new Error("Impossible de retrouver l’élément sélectionné dans le MusicXML.");
        }

        const sourcePath = getNodePath(sourceDocument, sourceElement);
        const document = sourceDocument.cloneNode(true);
        const selectedElement = getNodeAtPath(document, sourcePath);
        const component = getXmlElementAtPath(selectedElement, path);
        if (!selectedElement || !component || !component.localName) {
            throw new Error("Le composant MusicXML sélectionné n’existe plus.");
        }

        const note = getXmlAncestor(component, "note");
        const measure = getXmlAncestor(component, "measure");
        const part = measure ? getXmlAncestor(measure, "part") : null;
        if (attributeName) {
            if (!component.hasAttribute(attributeName)) {
                throw new Error("L’attribut MusicXML sélectionné n’existe plus.");
            }
            component.setAttribute(attributeName, value);
            if (measure && part &&
                ["backup", "forward"].includes(component.localName) &&
                ["duration", "staff", "voice"].includes(attributeName)) {
                ensureAllMeasureStreamsBalanced(
                    part,
                    measure,
                    "La modification déséquilibrerait la mesure"
                );
            }
        } else {
            if (component.children.length) {
                throw new Error("Seuls les composants MusicXML sans sous-éléments peuvent être modifiés directement.");
            }

            if (note && component.localName === "voice") {
                const sourceVoice = getVoice(note);
                const changed = updateVoice(getChordGroup(note), value.trim(), document);
                if (!changed) return false;
                ensureVoiceChangePreservesMeasure(note, sourceVoice, value.trim());
            } else if (note && component.localName === "staff") {
                const sourceStaff = getStaffNumber(note);
                const targetStaff = value.trim();
                if (!/^[1-9]\d*$/.test(targetStaff)) {
                    throw new Error("Le numéro de portée doit être un entier positif.");
                }
                for (const chordNote of getChordGroup(note)) {
                    ensureXmlChild(document, chordNote, "staff").textContent = targetStaff;
                }
                ensureMeasureStreamsBalanced(
                    part,
                    measure,
                    [
                        { staff: sourceStaff, voice: getVoice(note) },
                        { staff: targetStaff, voice: getVoice(note) }
                    ],
                    "Le changement de portée déséquilibrerait la mesure"
                );
            } else if (note && component.localName === "type") {
                updateDuration(getChordGroup(note), value.trim());
                ensureMeasureStreamsBalanced(
                    part,
                    measure,
                    [{ staff: getStaffNumber(note), voice: getVoice(note) }],
                    "La modification déséquilibrerait la mesure"
                );
            } else if (note && component.localName === "duration") {
                const duration = Number(value);
                if (!Number.isFinite(duration) || duration <= 0) {
                    throw new Error("La durée MusicXML doit être un nombre positif.");
                }
                for (const chordNote of getChordGroup(note)) {
                    ensureXmlChild(document, chordNote, "duration").textContent = String(duration);
                }
                ensureMeasureStreamsBalanced(
                    part,
                    measure,
                    [{ staff: getStaffNumber(note), voice: getVoice(note) }],
                    "La modification déséquilibrerait la mesure"
                );
            } else if (note && component.localName === "step") {
                if (!"CDEFGAB".includes(value.trim())) {
                    throw new Error("La hauteur doit être une note de C à B.");
                }
                component.textContent = value.trim();
            } else if (note && component.localName === "octave") {
                if (!/^-?\d+$/.test(value.trim())) {
                    throw new Error("L’octave doit être un entier.");
                }
                component.textContent = value.trim();
            } else if (note && component.localName === "alter") {
                const alteration = Number(value);
                if (!Number.isFinite(alteration) || alteration < -3 || alteration > 3) {
                    throw new Error("L’altération doit être comprise entre -3 et 3.");
                }
                component.textContent = String(alteration);
            } else {
                component.textContent = value;
                if (measure && part && [
                    "duration", "divisions", "beats", "beat-type", "voice", "staff"
                ].includes(component.localName)) {
                    ensureAllMeasureStreamsBalanced(
                        part,
                        measure,
                        "La modification déséquilibrerait la mesure"
                    );
                }
            }
        }

        const rendered = await window.FileActions.updateMusicXml(
            document,
            "Edited selected MusicXML component"
        );
        if (!rendered) throw new Error("La partition n’a pas pu être actualisée.");

        const graphicalElements =
            window.PartitionClick.getGraphicalElementsForSourceXmlElements([selectedElement]);
        if (!graphicalElements.length) {
            throw new Error("L’élément modifié n’a pas pu être retrouvé après le rendu.");
        }
        window.SelectionActions.replaceSelectedNotes(graphicalElements);
        return true;
    }

    function applySelectedXmlComponentUpdate(path, value, attributeName = "") {
        const operation = updateQueue.then(async () => {
            try {
                return await applySelectedXmlComponentUpdateNow(
                    path,
                    String(value),
                    String(attributeName)
                );
            } catch (error) {
                reportError(error);
                return false;
            }
        });
        updateQueue = operation.catch(() => false);
        return operation;
    }

    window.NoteEditActions = Object.freeze({
        applySelectedNoteUpdate,
        applySelectedXmlComponentUpdate,
        getNearestRestSlot,
        insertNoteAt,
        coalesceAdjacentRests
    });
})();
