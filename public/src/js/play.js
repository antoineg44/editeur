"use strict";

(() => {
    const tempo = 100;
    const schedulerInterval = 25;
    const lookAheadSeconds = 0.1;
    let osmd = null;
    let horizontalMenuWindow = null;
    let isActive = false;
    let hasRenderedScore = false;
    let isInitialized = false;
    let isPlaying = false;
    let followEnabled = true;
    let metronomeEnabled = false;
    let showMeasureBeat = false;
    let audioContext = null;
    let masterGain = null;
    let playbackEvents = [];
    let durationBeats = 0;
    let playbackStartTime = 0;
    let pausedAtBeat = 0;
    let playFromCurrentEvent = false;
    let cursorEventIndex = 0;
    let nextSoundEventIndex = 0;
    let nextMetronomeBeat = 0;
    let scheduler = null;
    let lastStateUpdate = 0;
    const activeNotes = new Set();

    function currentBeat() {
        if (!isPlaying || !audioContext) return pausedAtBeat;
        return Math.max(0, (audioContext.currentTime - playbackStartTime) * tempo / 60);
    }

    function formatPlaybackTime(seconds) {
        const totalSeconds = Math.max(0, Math.floor(seconds));
        const minutes = Math.floor(totalSeconds / 60);
        return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
    }

    function formatMeasureBeat(beat, isTotal = false) {
        if (!playbackEvents.length) return "1:1";

        let currentEvent = playbackEvents[0];
        for (const event of playbackEvents) {
            if (event.time > beat) break;
            currentEvent = event;
        }

        const measureStart = playbackEvents.find(event =>
            event.measure === currentEvent.measure
        )?.time ?? 0;
        const beatInMeasure = isTotal
            ? Math.max(1, Math.ceil(beat - measureStart))
            : Math.floor(Math.max(0, beat - measureStart)) + 1;
        return `${currentEvent.measure}:${beatInMeasure}`;
    }

    function postPlaybackState() {
        if (!horizontalMenuWindow) return;
        const elapsedBeats = currentBeat();
        const elapsedSeconds = elapsedBeats * 60 / tempo;
        const totalSeconds = durationBeats * 60 / tempo;
        horizontalMenuWindow.postMessage({
            channel: "viritura-index-new",
            type: "playback-state",
            loaded: hasRenderedScore && playbackEvents.length > 0,
            playing: isPlaying,
            canStop: isPlaying || pausedAtBeat > 0,
            elapsedSeconds,
            totalSeconds,
            elapsedDisplay: showMeasureBeat
                ? formatMeasureBeat(elapsedBeats)
                : formatPlaybackTime(elapsedSeconds),
            totalDisplay: showMeasureBeat
                ? formatMeasureBeat(durationBeats, true)
                : formatPlaybackTime(totalSeconds),
            showMeasureBeat,
            followEnabled,
            metronomeEnabled
        }, "*");
    }

    function formatPlaybackError(error) {
        console.error("Could not play the MusicXML score.", error);
        window.alert(`Impossible de lire la partition : ${error.message || error}`);
    }

    function buildPlaybackTimeline() {
        const iterator = osmd.cursor.Iterator.clone();
        const timeline = [];
        let safety = 0;

        while (!iterator.EndReached && safety < 100000) {
            const timestamp = iterator.currentTimeStamp?.realValue ??
                iterator.currentTimeStamp?.RealValue ?? 0;
            const time = timestamp * 4;
            const measureIndex = iterator.CurrentMeasureIndex;
            const measure = measureIndex + 1;
            const relativeTimestamp = iterator.CurrentRelativeInMeasureTimestamp?.RealValue ??
                iterator.CurrentRelativeInMeasureTimestamp?.realValue ?? 0;
            const timeInMeasure = relativeTimestamp * 4;
            const notes = [];

            for (const voice of iterator.CurrentVoiceEntries) {
                for (const note of voice.Notes) {
                    if (!note || note.isRest()) continue;
                    const midi = note.halfTone + 12;
                    const duration = note.Length.RealValue * 4;
                    if (Number.isFinite(midi) && Number.isFinite(duration) && duration > 0) {
                        notes.push({ midi, duration });
                    }
                }
            }

            const previous = timeline[timeline.length - 1];
            if (previous && previous.measureIndex === measureIndex &&
                Math.abs(previous.time - time) < 0.00001) {
                previous.notes.push(...notes);
            } else {
                timeline.push({ time, measure, measureIndex, timeInMeasure, notes });
            }

            iterator.moveToNext();
            safety++;
        }

        if (safety >= 100000 && !iterator.EndReached) {
            throw new Error("La partition contient trop de positions à lire.");
        }

        return timeline;
    }

    function ensureAudioContext() {
        if (!audioContext) {
            const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextConstructor) {
                throw new Error("Ce navigateur ne prend pas en charge la lecture audio.");
            }
            audioContext = new AudioContextConstructor();
            masterGain = audioContext.createGain();
            masterGain.gain.value = 0.18;
            masterGain.connect(audioContext.destination);
        }

        return audioContext.resume();
    }

    function registerAudioNode(oscillator, gain, startTime) {
        const note = { oscillator, gain, startTime, stopScheduled: false };
        activeNotes.add(note);
        oscillator.addEventListener("ended", () => activeNotes.delete(note), { once: true });
        return note;
    }

    function scheduleNote(note, startTime) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const duration = Math.max(0.06, note.duration * 60 / tempo);
        const attackEnd = startTime + Math.min(0.02, duration / 3);
        const noteEnd = startTime + duration;

        oscillator.type = "triangle";
        oscillator.frequency.value = 440 * Math.pow(2, (note.midi - 69) / 12);
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.16, attackEnd);
        gain.gain.setTargetAtTime(0.0001, noteEnd, 0.05);
        oscillator.connect(gain);
        gain.connect(masterGain);
        registerAudioNode(oscillator, gain, startTime);
        oscillator.start(startTime);
        oscillator.stop(noteEnd + 0.2);
    }

    function scheduleMetronomeClick(startTime, beatIndex) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const frequency = beatIndex % 4 === 0 ? 1320 : 880;

        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.08, startTime + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.04);
        oscillator.connect(gain);
        gain.connect(masterGain);
        registerAudioNode(oscillator, gain, startTime);
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.05);
    }

    function silenceActiveNotes() {
        if (!audioContext) return;
        const now = audioContext.currentTime;

        activeNotes.forEach(note => {
            if (note.stopScheduled) return;
            note.gain.gain.cancelScheduledValues(now);
            note.gain.gain.setTargetAtTime(0.0001, now, 0.015);
            note.oscillator.stop(Math.max(now + 0.04, note.startTime + 0.04));
            note.stopScheduled = true;
        });
    }

    function updateCursorAtBeat(beat) {
        while (cursorEventIndex < playbackEvents.length &&
            playbackEvents[cursorEventIndex].time <= beat) {
            if (cursorEventIndex > 0) osmd.cursor.next();
            cursorEventIndex++;
        }
    }

    function updateCursorVisibility() {
        if (!hasRenderedScore) return;

        if (isActive) {
            osmd.cursor.show();
            if (!isPlaying) osmd.cursor.reset();
        } else {
            osmd.cursor.hide();
        }
    }

    function alignPlaybackToBeat(beat, includeCurrentEvent = false) {
        osmd.cursor.reset();
        cursorEventIndex = 0;
        updateCursorAtBeat(beat);
        nextSoundEventIndex = playbackEvents.findIndex(event =>
            includeCurrentEvent
                ? event.time >= beat - 0.00001
                : event.time > beat + 0.01
        );
        if (nextSoundEventIndex < 0) nextSoundEventIndex = playbackEvents.length;
        nextMetronomeBeat = Math.ceil(beat);
    }

    function seekToPartitionClick(event) {
        if (!isActive || !hasRenderedScore || !playbackEvents.length) return;

        const click = event.detail;
        const measureIndex = Number.isInteger(click.measureIndex)
            ? click.measureIndex
            : Number(click.measure) - 1;
        const clickTime = Number(click.timeInMeasure?.quarterBeats) || 0;
        const measureEvents = playbackEvents.filter(entry => entry.measureIndex === measureIndex);
        if (!measureEvents.length) return;

        const targetEvent = measureEvents.reduce((previous, entry) =>
            entry.timeInMeasure <= clickTime + 0.00001 ? entry : previous,
        measureEvents[0]);
        const targetBeat = targetEvent.time;
        const wasPlaying = isPlaying;
        if (wasPlaying) silenceActiveNotes();

        pausedAtBeat = targetBeat;
        playFromCurrentEvent = true;
        alignPlaybackToBeat(targetBeat, true);

        if (wasPlaying) {
            playbackStartTime = audioContext.currentTime + 0.05 - targetBeat * 60 / tempo;
            updatePlayback();
        }

        postPlaybackState();
    }

    function updatePlayback() {
        if (!isPlaying || !audioContext) return;
        const elapsed = currentBeat();
        const lookAheadBeats = lookAheadSeconds * tempo / 60;

        while (nextSoundEventIndex < playbackEvents.length &&
            playbackEvents[nextSoundEventIndex].time <= elapsed + lookAheadBeats) {
            const event = playbackEvents[nextSoundEventIndex];
            const eventAudioTime = Math.max(
                audioContext.currentTime + 0.005,
                playbackStartTime + event.time * 60 / tempo
            );
            event.notes.forEach(note => scheduleNote(note, eventAudioTime));
            nextSoundEventIndex++;
        }

        if (metronomeEnabled) {
            while (nextMetronomeBeat <= elapsed + lookAheadBeats) {
                const clickTime = Math.max(
                    audioContext.currentTime + 0.005,
                    playbackStartTime + nextMetronomeBeat * 60 / tempo
                );
                scheduleMetronomeClick(clickTime, nextMetronomeBeat);
                nextMetronomeBeat++;
            }
        } else {
            nextMetronomeBeat = Math.ceil(elapsed);
        }

        updateCursorAtBeat(elapsed);

        if (elapsed >= durationBeats) {
            stopPlayback();
            return;
        }

        const now = Date.now();
        if (now - lastStateUpdate >= 250) {
            lastStateUpdate = now;
            postPlaybackState();
        }
    }

    async function startPlayback() {
        if (!hasRenderedScore || !playbackEvents.length) return;
        await ensureAudioContext();

        if (pausedAtBeat === 0 && !playFromCurrentEvent) {
            osmd.cursor.reset();
            cursorEventIndex = 0;
            nextSoundEventIndex = 0;
            nextMetronomeBeat = 0;
        } else {
            alignPlaybackToBeat(pausedAtBeat, playFromCurrentEvent);
        }
        playFromCurrentEvent = false;

        playbackStartTime = audioContext.currentTime + 0.05 - pausedAtBeat * 60 / tempo;
        isPlaying = true;
        lastStateUpdate = 0;
        updateCursorVisibility();
        updatePlayback();
        scheduler = window.setInterval(updatePlayback, schedulerInterval);
        postPlaybackState();
    }

    function pausePlayback() {
        if (!isPlaying) return;
        pausedAtBeat = Math.min(durationBeats, currentBeat());
        playFromCurrentEvent = false;
        isPlaying = false;
        window.clearInterval(scheduler);
        scheduler = null;
        silenceActiveNotes();
        if (isActive) updateCursorAtBeat(pausedAtBeat);
        postPlaybackState();
    }

    function stopPlayback() {
        isPlaying = false;
        pausedAtBeat = 0;
        playFromCurrentEvent = false;
        window.clearInterval(scheduler);
        scheduler = null;
        silenceActiveNotes();
        if (hasRenderedScore) osmd.cursor.reset();
        cursorEventIndex = 0;
        nextSoundEventIndex = 0;
        nextMetronomeBeat = 0;
        postPlaybackState();
    }

    function togglePlayback() {
        if (isPlaying) {
            pausePlayback();
            return;
        }
        startPlayback().catch(formatPlaybackError);
    }

    function handlePlaybackControl(event, message) {
        switch (message.action) {
            case "toggle":
                togglePlayback();
                break;
            case "stop":
            case "rewind":
                stopPlayback();
                break;
            case "toggle-follow":
                followEnabled = !followEnabled;
                if (hasRenderedScore) osmd.cursor.CursorOptions.follow = followEnabled;
                postPlaybackState();
                break;
            case "toggle-metronome":
                metronomeEnabled = !metronomeEnabled;
                nextMetronomeBeat = Math.ceil(currentBeat());
                postPlaybackState();
                break;
            case "toggle-time-display":
                showMeasureBeat = !showMeasureBeat;
                postPlaybackState();
                break;
            default:
                console.error("Unknown score playback action:", message.action);
        }
    }

    function handleMenuSelection(event) {
        isActive = event.detail.activity === "play";
        updateCursorVisibility();
    }

    function handlePlaybackControlsReady() {
        postPlaybackState();
    }

    function initialize(scoreDisplay, toolbarWindow) {
        if (isInitialized) return;
        isInitialized = true;
        osmd = scoreDisplay;
        horizontalMenuWindow = toolbarWindow;
        isActive = window.MenuActions.getSelectedMenu() === "play";
        window.addEventListener("viritura:vertical-menu-change", handleMenuSelection);
        window.addEventListener("viritura:partition-click", seekToPartitionClick);

        window.ButtonActionList.addMessages(window, "viritura-index-new", [
            {
                message: "playback-control",
                source: horizontalMenuWindow,
                types: { action: "string" },
                handler: "handlePlaybackControl"
            },
            {
                message: "playback-controls-ready",
                source: horizontalMenuWindow,
                handler: "handlePlaybackControlsReady"
            }
        ], {
            handlePlaybackControl,
            handlePlaybackControlsReady
        });
        postPlaybackState();
    }

    function onScoreLoading() {
        isPlaying = false;
        pausedAtBeat = 0;
        playFromCurrentEvent = false;
        hasRenderedScore = false;
        playbackEvents = [];
        durationBeats = 0;
        window.clearInterval(scheduler);
        scheduler = null;
        silenceActiveNotes();
        postPlaybackState();
    }

    function onScoreRendered() {
        playbackEvents = buildPlaybackTimeline();
        durationBeats = playbackEvents.reduce((duration, event) => {
            const eventEnd = event.time + Math.max(
                0,
                ...event.notes.map(note => note.duration)
            );
            return Math.max(duration, eventEnd);
        }, 0);
        hasRenderedScore = true;
        osmd.cursor.CursorOptions.follow = followEnabled;
        updateCursorVisibility();
        postPlaybackState();
    }

    window.PlayActions = Object.freeze({ initialize, onScoreLoading, onScoreRendered });
})();
