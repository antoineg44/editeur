"use strict";

(() => {
    const durationGlyphs = new Map([
        ["64th", ""],
        ["32nd", ""],
        ["16th", ""],
        ["eighth", ""],
        ["quarter", ""],
        ["half", ""],
        ["whole", ""],
        ["breve", ""]
    ]);
    const accidentalGlyphs = new Map([
        ["triple-flat", ""],
        ["double-flat", ""],
        ["flat", ""],
        ["natural", ""],
        ["sharp", ""],
        ["double-sharp", ""],
        ["triple-sharp", ""]
    ]);
    let horizontalMenuWindow = null;
    let cursorGhost = null;
    let scoreGhost = null;
    let armed = false;
    let settings = null;
    let pointerPosition = null;
    let previewFrame = null;

    function createGhost() {
        const ghost = document.createElement("div");
        ghost.setAttribute("aria-hidden", "true");
        ghost.dataset.notePlacementPreview = "true";
        Object.assign(ghost.style, {
            position: "fixed",
            zIndex: "1300",
            display: "none",
            alignItems: "center",
            gap: "3px",
            color: "#1764b0",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            transform: "translate(-50%, -50%)"
        });
        const symbol = document.createElement("span");
        symbol.dataset.placementSymbol = "true";
        Object.assign(symbol.style, {
            fontFamily: "Bravura, serif",
            fontSize: "30px",
            lineHeight: "1"
        });
        ghost.appendChild(symbol);

        const details = document.createElement("span");
        details.dataset.placementDetails = "true";
        Object.assign(details.style, {
            display: "inline-flex",
            alignItems: "center",
            gap: "2px",
            fontFamily: "Bravura, serif",
            fontSize: "16px",
            lineHeight: "1"
        });
        ghost.appendChild(details);
        document.body.appendChild(ghost);
        return ghost;
    }

    function updateGhostAppearance(ghost) {
        const symbol = ghost.querySelector('[data-placement-symbol="true"]');
        const details = ghost.querySelector('[data-placement-details="true"]');
        symbol.textContent = settings.rest
            ? ""
            : durationGlyphs.get(settings.duration) || durationGlyphs.get("quarter");
        details.replaceChildren();

        const graceGlyph = !settings.rest && settings.graceType === "appoggiatura" ? "" :
            !settings.rest && settings.graceType ? "" : "";
        const accidentalGlyph = settings.rest ? "" :
            accidentalGlyphs.get(settings.accidental) || "";
        for (const glyph of [graceGlyph, accidentalGlyph]) {
            if (!glyph) continue;
            const item = document.createElement("span");
            item.textContent = glyph;
            details.appendChild(item);
        }

        for (let index = 0; index < settings.dotCount; index++) {
            const dot = document.createElement("span");
            dot.textContent = "";
            details.appendChild(dot);
        }

        if (settings.voice !== "1") {
            const voice = document.createElement("span");
            voice.textContent = `↑${settings.voice}`;
            voice.style.fontFamily = "system-ui, sans-serif";
            voice.style.fontSize = "11px";
            details.appendChild(voice);
        }
    }

    function hideScoreGhost() {
        if (scoreGhost) scoreGhost.style.display = "none";
    }

    function showCursorGhost(x, y) {
        cursorGhost.style.left = `${x + 14}px`;
        cursorGhost.style.top = `${y + 14}px`;
        cursorGhost.style.display = "flex";
        hideScoreGhost();
    }

    function getDistanceToBounds(bounds, x, y) {
        const dx = Math.max(bounds.left - x, 0, x - bounds.right);
        const dy = Math.max(bounds.top - y, 0, y - bounds.bottom);
        return Math.hypot(dx, dy);
    }

    function getSnappedStaffPosition(graphicalNote, clientY) {
        const measure = graphicalNote.closest("g.staffline")?.querySelector("g.vf-measure");
        if (!measure) return null;

        const positions = Array.from(measure.querySelectorAll(":scope > path"))
            .map(path => {
                const bounds = path.getBoundingClientRect();
                return { y: bounds.top + bounds.height / 2, width: bounds.width };
            })
            .filter(line => line.width >= measure.getBoundingClientRect().width / 2)
            .map(line => line.y)
            .sort((left, right) => left - right);
        if (positions.length !== 5) return null;

        const spacing = positions.slice(1).reduce(
            (total, position, index) => total + position - positions[index],
            0
        ) / 4;
        const stepHeight = spacing / 2;
        return {
            y: positions[4] -
                Math.round((positions[4] - clientY) / stepHeight) * stepHeight,
            lineSpacing: spacing
        };
    }

    function scaleScoreGhost(lineSpacing) {
        if (!Number.isFinite(lineSpacing) || lineSpacing <= 0) return;
        scoreGhost.querySelector('[data-placement-symbol="true"]').style.fontSize =
            `${lineSpacing * 3.5}px`;
        scoreGhost.querySelector('[data-placement-details="true"]').style.fontSize =
            `${lineSpacing * 1.6}px`;
    }

    function updateScorePreview() {
        previewFrame = null;
        if (!armed || !pointerPosition) return;

        const target = document.elementFromPoint(pointerPosition.x, pointerPosition.y);
        const result = window.PartitionClick.getPointerResult({
            clientX: pointerPosition.x,
            clientY: pointerPosition.y,
            target: target || document.body,
            pointerId: null,
            shiftKey: false
        });
        if (!result || !result.timeInMeasure || !result.pitch) return;

        const candidate = window.NoteEditActions.getNearestRestSlot(result, settings);
        if (!candidate) return;

        const graphicalNotes = window.PartitionClick.getGraphicalElementsForSourceXmlElements(
            [candidate.note]
        );
        const graphicalNote = graphicalNotes[0];
        if (!graphicalNote) return;

        const bounds = graphicalNote.getBoundingClientRect();
        if (getDistanceToBounds(bounds, pointerPosition.x, pointerPosition.y) > 110) return;

        const staffPosition = getSnappedStaffPosition(graphicalNote, pointerPosition.y);
        scaleScoreGhost(staffPosition?.lineSpacing);
        cursorGhost.style.display = "none";
        scoreGhost.style.left = `${bounds.left + bounds.width / 2}px`;
        scoreGhost.style.top = `${staffPosition?.y ?? bounds.top + bounds.height / 2}px`;
        scoreGhost.style.display = "flex";
    }

    function updatePointerPosition(x, y) {
        if (!armed || !Number.isFinite(x) || !Number.isFinite(y)) return;
        pointerPosition = { x, y };
        showCursorGhost(x, y);
        if (previewFrame !== null) return;
        previewFrame = window.requestAnimationFrame(updateScorePreview);
    }

    function handlePointerMove(event) {
        updatePointerPosition(event.clientX, event.clientY);
    }

    function cancel() {
        const wasArmed = armed;
        armed = false;
        settings = null;
        pointerPosition = null;
        if (cursorGhost) cursorGhost.style.display = "none";
        hideScoreGhost();
        if (previewFrame !== null) {
            window.cancelAnimationFrame(previewFrame);
            previewFrame = null;
        }
        if (wasArmed && horizontalMenuWindow) {
            horizontalMenuWindow.postMessage({
                channel: "viritura-index-new",
                type: "toolbar-placement-cancelled"
            }, "*");
        }
    }

    function start(placementSettings, x, y) {
        if (window.SelectionActions.getSelectedNotes().length) {
            cancel();
            return false;
        }

        settings = {
            duration: placementSettings.duration,
            dotCount: placementSettings.dotCount,
            rest: placementSettings.rest,
            graceType: placementSettings.graceType,
            accidental: placementSettings.accidental,
            voice: placementSettings.voice
        };
        armed = true;
        if (!cursorGhost) cursorGhost = createGhost();
        if (!scoreGhost) scoreGhost = createGhost();
        updateGhostAppearance(cursorGhost);
        updateGhostAppearance(scoreGhost);
        updatePointerPosition(x, y);
        return true;
    }

    function handlePartitionClick(result) {
        if (!armed) return false;
        if (!result || !result.timeInMeasure) return true;

        const placementSettings = { ...settings };
        window.NoteEditActions.insertNoteAt(result, placementSettings).then(placed => {
            if (placed) cancel();
        }).catch(error => {
            console.error("Could not place a note at the cursor.", error);
            window.alert(`Impossible de placer l’élément : ${error.message}`);
        });
        return true;
    }

    function handleContextMenu(event) {
        if (!armed || event.target.closest?.("#horizontal-menu-frame")) return;
        event.preventDefault();
        cancel();
    }

    function handleKeyDown(event) {
        if (!armed || event.key !== "Escape") return;
        event.preventDefault();
        cancel();
    }

    function initialize(menuWindow) {
        horizontalMenuWindow = menuWindow || null;
        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("contextmenu", handleContextMenu);
        window.addEventListener("keydown", handleKeyDown);
    }

    window.NotePlacementActions = Object.freeze({
        initialize,
        start,
        updatePointerPosition,
        handlePartitionClick,
        isArmed: () => armed,
        cancel
    });
})();
