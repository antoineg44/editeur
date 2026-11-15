function getMesureNumber(event) {

    const svg = event.target.closest("svg");
    if (!svg) return null;

    // Coordonnées du clic dans le SVG
    const point = svg.createSVGPoint();

    point.x = event.clientX;
    point.y = event.clientY;

    const svgPoint = point.matrixTransform(
        svg.getScreenCTM().inverse()
    );

    // Conversion OSMD
    const position = osmd.GraphicSheet.svgToOsmd({
        x: svgPoint.x,
        y: svgPoint.y
    });

    const pages = osmd.GraphicSheet.musicPages;

    // Identifier la page à partir de son SVG
    const pageIndex = Array.from(
        document.querySelectorAll("#score svg")
    ).indexOf(svg);

    if (pageIndex < 0 || !pages[pageIndex]) return null;

    const page = pages[pageIndex];

    // Parcourir les systèmes de cette page
    for (let systemIndex = 0;
         systemIndex < page.musicSystems.length;
         systemIndex++) {

        const system = page.musicSystems[systemIndex];

        // Parcourir les portées
        for (let staffIndex = 0;
             staffIndex < system.staffLines.length;
             staffIndex++) {

            const staffLine = system.staffLines[staffIndex];

            // Parcourir les mesures de la portée
            for (const measure of staffLine.measures) {

                if (!measure) continue;

                const box = measure.boundingBox;

                if (box.pointLiesInsideBorders(position)) {

                    const pitch = getPitchFromY(measure, position.y);

                    console.log("Hauteur du curseur :", pitch.note + pitch.octave);

                    console.log({
    mesure: measure.measureNumber,
    system: systemIndex,
    page: pageIndex,
    clicY: position.y,
    lignes: measure.parentStaffLine.staffLines.map(
        line => ({
            start: line.start.y,
            end: line.end.y
        })
    )
});

console.log({
    clickY: position.y,
    staffY: measure.parentStaffLine.PositionAndShape.absolutePosition.y,
    staffHeight: measure.parentStaffLine.PositionAndShape.size.height,
    lines: measure.parentStaffLine.staffLines
});



                    return {
                        measureNumber: measure.measureNumber,
                        staffIndex: staffIndex,
                        pitch: pitch
                    };
                }


            }
        }
    }

    console.log("Aucune mesure trouvée");

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
        .filter(e =>
            Number.isFinite(e.x) &&
            Number.isFinite(e.time)
        )
        .sort((a, b) => a.x - b.x);

    if (entries.length === 0) return null;

    // Durée totale de la mesure
    const duration =
        measure.parentSourceMeasure.Duration.RealValue;

    const box = measure.boundingBox;

    // Ajouter le début de la mesure
    entries.unshift({
        x: box.absolutePosition.x,
        time: 0
    });

    // Ajouter la fin de la mesure
    entries.push({
        x: box.absolutePosition.x + box.size.width,
        time: duration
    });

    // Trouver les deux entrées qui encadrent le clic
    for (let i = 0; i < entries.length - 1; i++) {

        const a = entries[i];
        const b = entries[i + 1];

        if (clickX >= a.x && clickX <= b.x) {

            const ratio = (clickX - a.x) / (b.x - a.x || 1);

            const time = a.time + ratio * (b.time - a.time);

            return {
                fraction: time,
                quarterBeats: time * 4
            };
        }
    }

    return null;
}


function getPitchFromY(measure, clickY) {

    const staffLine = measure.parentStaffLine;
    const clef = measure.InitiallyActiveClef;

    if (!clef) {
        console.warn("Clé introuvable");
        return null;
    }

    // Position absolue de la portée
    const staffY =
        staffLine.PositionAndShape.absolutePosition.y;

    // Récupération des cinq lignes
    const lines = staffLine.staffLines;

    // Coordonnées Y absolues des lignes
    const positions = lines.map(line =>
        staffY + (line.start.y + line.end.y) / 2
    ).sort((a, b) => a - b);

    // Espacement moyen
    const spacing = (
        positions[1] - positions[0] +
        positions[2] - positions[1] +
        positions[3] - positions[2] +
        positions[4] - positions[3]
    ) / 4;

    // Ligne du bas
    const bottomLine = positions[4];

    // Distance musicale depuis la ligne du bas
    const steps = Math.round(
        (bottomLine - clickY) / (spacing / 2)
    );

    // Correspondance des clés
    const clefType = clef.ClefType;

    const clefs = {
        0: { note: 4, octave: 4, line: 2 }, // Sol
        1: { note: 3, octave: 3, line: 4 }, // Fa
        2: { note: 0, octave: 4, line: 3 }  // Ut
    };

    const reference = clefs[clefType];

    if (!reference) {
        console.warn("Type de clé non géré :", clefType);
        return null;
    }

    // Indices diatoniques :
    // C = 0, D = 1, E = 2, F = 3, G = 4, A = 5, B = 6

    const referencePosition =
        reference.octave * 7 + reference.note;

    // Nombre de demi-interlignes entre la ligne de référence
    // de la clé et la position du curseur
    const referenceSteps = (reference.line - 1) * 2;

    const pitchPosition =
        referencePosition +
        steps -
        referenceSteps +
        (clef.OctaveOffset || 0) * 7;

    const notes = ["C", "D", "E", "F", "G", "A", "B"];

    const noteIndex =
        ((pitchPosition % 7) + 7) % 7;

    const octave = Math.floor(pitchPosition / 7);

    return {
        note: notes[noteIndex],
        octave: octave,
        clefType: clefType,
        steps: steps,
        midiDiatonicIndex: pitchPosition
    };
}


const partition = document.getElementById("score");

    partition.addEventListener("click", function(event) {

        console.log("Mesure cliquée :", getMesureNumber(event));
    });