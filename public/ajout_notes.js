// Récupérer les éléments
const partition = document.getElementById("scoreContainer");
const note = document.getElementById("noteSuiveuse");
const infoNote = document.getElementById("infoNote");

let ajoutNoteActif = false;
let noteSVG = null;


// Activer l'ajout de notes
function activerAjoutNote() {
    ajoutNoteActif = true;
}


// Arrêter l'ajout de notes
function desactiverAjoutNote() {
    ajoutNoteActif = false;

    if (noteSVG) {
        noteSVG.remove();
        noteSVG = null;
    }
}


// Créer la noire directement dans le SVG
function creerNoteSVG(svg) {

    const groupe = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "g"
    );

    groupe.setAttribute("pointer-events", "none");

    // Tête de la noire
    const tete = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "ellipse"
    );

    tete.setAttribute("cx", "0");
    tete.setAttribute("cy", "0");
    tete.setAttribute("rx", "5");
    tete.setAttribute("ry", "3.5");
    tete.setAttribute("fill", "#1677ff");

    // Inclinaison de la tête
    tete.setAttribute(
        "transform",
        "rotate(-25)"
    );

    // Hampe
    const hampe = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line"
    );

    hampe.setAttribute("x1", "4");
    hampe.setAttribute("y1", "-1");
    hampe.setAttribute("x2", "4");
    hampe.setAttribute("y2", "-35");
    hampe.setAttribute("stroke", "#1677ff");
    hampe.setAttribute("stroke-width", "1.5");

    groupe.appendChild(tete);
    groupe.appendChild(hampe);

    svg.appendChild(groupe);

    return groupe;
}


// Déplacement de la noire
document.getElementById("scoreContainer")
    .addEventListener("mousemove", function(event) {

        if (!ajoutNoteActif) return;

        const svg = event.target.closest("svg");

        if (!svg) return;

        const point = svg.createSVGPoint();

        point.x = event.clientX;
        point.y = event.clientY;

        const position = point.matrixTransform(
            svg.getScreenCTM().inverse()
        );

        // Création de la note si nécessaire
        if (!noteSVG) {
            noteSVG = creerNoteSVG(svg);
        }

        // Positionner directement dans le SVG
        noteSVG.setAttribute(
            "transform",
            `translate(${position.x}, ${position.y})`
        );

    });


// Valider la position au clic
document.getElementById("scoreContainer")
    .addEventListener("click", function() {

        if (!ajoutNoteActif || !noteSVG) return;

        // La note reste dans le SVG
        noteSVG = null;

    });


// --------------------------------------------------
// GESTION DU MUSICXML
// --------------------------------------------------

// Prochaine voix disponible
let prochaineVoix = 10;

// --------------------------------------------------
// RÉCUPÉRER LA POSITION DU CURSEUR
// --------------------------------------------------

function obtenirPositionCurseur() {

    if (!loaded) {
        throw new Error("Aucune partition chargée.");
    }

    const iterator = osmd.cursor.Iterator;

    if (!iterator) {
        throw new Error("Curseur indisponible.");
    }

    console.log("Iterator :", iterator);

    console.log("Propriétés :", Object.keys(iterator));

    return {
        mesure: iterator.CurrentMeasureIndex + 1,
        temps: iterator.currentTimeStamp?.RealValue ??
               iterator.currentTimeStamp?.realValue ??
               0
    };
}



// --------------------------------------------------
// FONCTION : AJOUTER UNE NOIRE
// --------------------------------------------------

async function ajouterNoire({
    mesure = 1,
    note = "C",
    octave = 4,
    temps = 0,
    partie = "P1"
} = {}) {

    console.log("Mesure :", mesure);
    console.log("Position :", temps);


    if (!musicXMLText) {
        throw new Error("Aucun fichier MusicXML chargé.");
    }

    const parser = new DOMParser();

    const xml = parser.parseFromString(
        musicXMLText,
        "application/xml"
    );

    if (xml.querySelector("parsererror")) {
        throw new Error("MusicXML invalide.");
    }

    // --------------------------------------------------
    // RECHERCHER LA PARTIE
    // --------------------------------------------------

    const part = Array.from(
        xml.querySelectorAll("score-partwise > part")
    ).find(p => p.getAttribute("id") === partie);

    if (!part) {
        throw new Error("Partie introuvable : " + partie);
    }

    // --------------------------------------------------
    // RECHERCHER LA MESURE
    // --------------------------------------------------

    const measureElement = Array.from(
        part.children
    ).filter(el => el.tagName === "measure")
     .find(m => Number(m.getAttribute("number")) === mesure);

    if (!measureElement) {
        throw new Error("Mesure introuvable : " + mesure);
    }

    // --------------------------------------------------
    // RÉCUPÉRER LES DIVISIONS
    // --------------------------------------------------

    let divisions = 1;

    for (const m of Array.from(part.children)) {

        if (m.tagName !== "measure") continue;

        const div = m.querySelector(
            ":scope > attributes > divisions"
        );

        if (div) {
            divisions = Number(div.textContent) || divisions;
        }

        if (m === measureElement) break;
    }

    // Durée d'une noire
    const duree = divisions;

    temps = Math.round(temps * divisions);


    // --------------------------------------------------
    // CALCULER LA POSITION DU CURSEUR
    // --------------------------------------------------

    let curseur = 0;

    for (const element of measureElement.children) {

        if (element.tagName === "note") {

            const duration = Number(
                element.querySelector(":scope > duration")?.textContent || 0
            );

            const chord = element.querySelector(":scope > chord");

            if (!chord) {
                curseur += duration;
            }

        } else if (element.tagName === "forward") {

            curseur += Number(
                element.querySelector(":scope > duration")?.textContent || 0
            );

        } else if (element.tagName === "backup") {

            curseur -= Number(
                element.querySelector(":scope > duration")?.textContent || 0
            );
        }
    }

    // --------------------------------------------------
    // REVENIR AU DÉBUT DE LA MESURE
    // --------------------------------------------------

    if (curseur > 0) {

        const backup = xml.createElement("backup");

        const backupDuration = xml.createElement("duration");
        backupDuration.textContent = curseur;

        backup.appendChild(backupDuration);

        measureElement.appendChild(backup);
    }

    // --------------------------------------------------
    // AVANCER JUSQU'AU TEMPS SOUHAITÉ
    // --------------------------------------------------

    if (temps > 0) {

        const forward = xml.createElement("forward");

        const forwardDuration = xml.createElement("duration");
        forwardDuration.textContent = temps;

        const forwardVoice = xml.createElement("voice");
        forwardVoice.textContent = prochaineVoix;

        const forwardStaff = xml.createElement("staff");
        forwardStaff.textContent = "1";

        forward.appendChild(forwardDuration);
        forward.appendChild(forwardVoice);
        forward.appendChild(forwardStaff);

        measureElement.appendChild(forward);
    }

    // --------------------------------------------------
    // CRÉER LA NOUVELLE NOTE
    // --------------------------------------------------

    const nouvelleNote = xml.createElement("note");

    // Hauteur
    const pitch = xml.createElement("pitch");

    const step = xml.createElement("step");
    step.textContent = note;

    const octaveElement = xml.createElement("octave");
    octaveElement.textContent = octave;

    pitch.appendChild(step);
    pitch.appendChild(octaveElement);

    // Durée
    const duration = xml.createElement("duration");
    duration.textContent = duree;

    // Voix
    const voice = xml.createElement("voice");
    voice.textContent = prochaineVoix;

    // Type : noire
    const type = xml.createElement("type");
    type.textContent = "quarter";

    // Hampe
    const stem = xml.createElement("stem");
    stem.textContent = "up";

    // Portée
    const staff = xml.createElement("staff");
    staff.textContent = "1";

    // Assemblage
    nouvelleNote.appendChild(pitch);
    nouvelleNote.appendChild(duration);
    nouvelleNote.appendChild(voice);
    nouvelleNote.appendChild(type);
    nouvelleNote.appendChild(stem);
    nouvelleNote.appendChild(staff);

    measureElement.appendChild(nouvelleNote);

    prochaineVoix++;

    // --------------------------------------------------
    // RECONSTRUIRE LE MUSICXML
    // --------------------------------------------------

    musicXMLText = new XMLSerializer().serializeToString(xml);

    // --------------------------------------------------
    // ACTUALISER LA PARTITION OSMD
    // --------------------------------------------------

    stopPlayback();

    await osmd.load(musicXMLText);

    osmd.render();

    loaded = true;

    // Réinitialiser le curseur
    osmd.cursor.reset();

    // Actualiser les pages
    setTimeout(() => {

        pages = Array.from(
            container.querySelectorAll("svg")
        );

        currentPage = 0;

        updatePage();

    }, 300);

    // --------------------------------------------------
    // ACTUALISER LES ÉVÉNEMENTS AUDIO
    // --------------------------------------------------

    events = parseMusicXML(musicXMLText);

    totalDuration = Math.max(
        ...events.map(e => e.time + e.duration),
        0
    );

    document.getElementById("status").textContent =
        "Note ajoutée : " + note + octave +
        " — Mesure " + mesure;

}

// --------------------------------------------------
// MODE AJOUT DE NOTES
// --------------------------------------------------

let modeAjoutNote = false;

const boutonAjout = document.getElementById("toggleAddNote");

boutonAjout.addEventListener("click", () => {

    modeAjoutNote = !modeAjoutNote;

    boutonAjout.textContent = modeAjoutNote
        ? "❌ Désactiver l'ajout de notes"
        : "✏️ Activer l'ajout de notes";

    document.getElementById("scoreContainer").style.cursor =
        modeAjoutNote ? "crosshair" : "default";

});

function obtenirPositionDepuisClic(event) {

    const svg = event.target.closest("svg");

    if (!svg) {
        console.warn("SVG introuvable.");
        return null;
    }

    // Récupérer les coordonnées exactes du clic
    const point = svg.createSVGPoint();

    point.x = event.clientX;
    point.y = event.clientY;

    const matrice = svg.getScreenCTM();

    if (!matrice) {
        console.error("Transformation SVG indisponible.");
        return null;
    }

    // Conversion coordonnées écran -> coordonnées SVG
    const pointSVG = point.matrixTransform(
        matrice.inverse()
    );

    // Récupérer GraphicSheet
    const graphicSheet = osmd.GraphicSheet;

    if (!graphicSheet) {
        console.error("GraphicSheet introuvable.");
        return null;
    }

    // Conversion coordonnées SVG -> coordonnées OSMD
    const positionOSMD = graphicSheet.svgToOsmd({
        x: pointSVG.x,
        y: pointSVG.y
    });

    // Récupérer le timestamp musical
    const timestamp =
        graphicSheet.tryGetTimeStampFromPosition(positionOSMD);

    if (!timestamp) {
        console.warn("Position musicale introuvable.");
        return null;
    }

    // Retrouver la mesure correspondant au timestamp
    const sourceMeasures = osmd.Sheet.SourceMeasures;

const epsilon = 0.000001;

const sourceMeasure = sourceMeasures.find((measure, index) => {

    const debut = measure.AbsoluteTimestamp.RealValue;

    const fin = debut + measure.Duration.RealValue;

    const tempsClique = timestamp.RealValue;

    // Début inclus, fin exclue
    if (index < sourceMeasures.length - 1) {
        return tempsClique >= debut - epsilon &&
               tempsClique < fin - epsilon;
    }

    // Dernière mesure : fin incluse
    return tempsClique >= debut - epsilon &&
           tempsClique <= fin + epsilon;

});

    if (!sourceMeasure) {
        console.warn("Mesure introuvable.");
        return null;
    }

    const numeroMesure = sourceMeasure.MeasureNumber;

    // Position dans la mesure, en temps (noires)
    const debutMesure =
        sourceMeasure.AbsoluteTimestamp.RealValue;

    const tempsDansMesure =
        timestamp.RealValue - debutMesure;

    // Retrouver les divisions MusicXML
    const part = musicxml.querySelector(
        'score-partwise > part[id="P1"]'
    );

    const mesures = Array.from(
        part.children
    ).filter(el => el.tagName === "measure");

    let divisions = 1;

    for (const m of mesures) {

        const d = m.querySelector(
            ":scope > attributes > divisions"
        );

        if (d) {
            divisions = Number(d.textContent);
        }

        if (Number(m.getAttribute("number")) === numeroMesure) {
            break;
        }
    }

    // Conversion en divisions MusicXML
    const positionDivisions =
        tempsDansMesure * divisions;

    const resultat = {
        mesure: numeroMesure,
        temps: positionDivisions,
        divisions: divisions,
        tempsMusical: tempsDansMesure
    };

    console.log("Position détectée :", resultat);

    return resultat;
}

function estSurPorteeCleFa(y, graphicSheet) {

    if (!graphicSheet) {
        console.error("GraphicSheet introuvable.");
        return false;
    }

    const staffEntries =
        graphicSheet.VerticalGraphicalStaffEntryContainers || [];

    if (!staffEntries.length) {
        console.warn("Aucune entrée de portée disponible.");
        return false;
    }

    let meilleureEntree = null;
    let distanceMin = Infinity;

    for (const entry of staffEntries) {

        if (!entry || !entry.PositionAndShape) continue;

        const staff = entry.ParentStaff;

        if (!staff) continue;

        const staffY =
            entry.PositionAndShape.AbsolutePosition.y;

        const distance = Math.abs(y - staffY);

        if (distance < distanceMin) {
            distanceMin = distance;
            meilleureEntree = entry;
        }
    }

    if (!meilleureEntree) {
        console.warn("Impossible de trouver la portée.");
        return false;
    }

    const staff = meilleureEntree.ParentStaff;

    const cle = staff.ActiveClef;

    const cleName =
        cle?.ClefType?.toString().toLowerCase() || "";

    console.log("Clé détectée :", cleName);

    return cleName.includes("bass") ||
           cleName.includes("fa");
}


function obtenirHauteurDepuisClic(svg, x, y, numeroMesure) {

    if (!svg) {
        console.error("SVG introuvable");
        return null;
    }

    // Conversion écran vers coordonnées SVG
    const point = svg.createSVGPoint();

    point.x = x;
    point.y = y;

    const matrice = svg.getScreenCTM();

    if (!matrice) return null;

    const p = point.matrixTransform(matrice.inverse());

    // Récupérer toutes les lignes horizontales du SVG
    const lignes = Array.from(
        svg.querySelectorAll("path, line")
    );

    const lignesHorizontales = [];

    for (const element of lignes) {

        try {

            const box = element.getBBox();

            // Une ligne horizontale est très large et peu haute
            if (
                box.width > 100 &&
                box.height < 2
            ) {
                lignesHorizontales.push({
                    y: box.y + box.height / 2,
                    x1: box.x,
                    x2: box.x + box.width
                });
            }

        } catch (e) {
            continue;
        }
    }

    // Trouver les lignes proches du clic horizontalement
    const lignesProches = lignesHorizontales.filter(ligne =>
        p.x >= ligne.x1 - 5 &&
        p.x <= ligne.x2 + 5
    );

    // Trier par position verticale
    lignesProches.sort((a, b) => a.y - b.y);

    // Regrouper les lignes presque superposées
    const lignesUniques = [];

    for (const ligne of lignesProches) {

        const existe = lignesUniques.some(
            l => Math.abs(l.y - ligne.y) < 2
        );

        if (!existe) {
            lignesUniques.push(ligne);
        }
    }

    // Rechercher un groupe de cinq lignes
    let meilleurePortee = null;
    let distanceMin = Infinity;

    for (let i = 0; i <= lignesUniques.length - 5; i++) {

        const groupe = lignesUniques.slice(i, i + 5);

        const ecarts = [];

        for (let j = 1; j < 5; j++) {
            ecarts.push(groupe[j].y - groupe[j - 1].y);
        }

        const moyenne =
            ecarts.reduce((a, b) => a + b, 0) / 4;

        const regulier = ecarts.every(
            e => Math.abs(e - moyenne) < moyenne * 0.25
        );

        if (!regulier) continue;

        const centre = (groupe[0].y + groupe[4].y) / 2;

        const distance = Math.abs(p.y - centre);

        if (distance < distanceMin) {

            distanceMin = distance;

            meilleurePortee = {
                lignes: groupe,
                espacement: moyenne
            };
        }
    }

    if (!meilleurePortee) {
        console.error("Impossible de détecter les cinq lignes de la portée.");
        return null;
    }

    // Vérifier que le clic est suffisamment proche de la portée
    const haut = meilleurePortee.lignes[0].y;
    const bas = meilleurePortee.lignes[4].y;

    if (p.y < haut - 20 || p.y > bas + 20) {
        console.warn("Clic trop éloigné de la portée.");
        return null;
    }

    // Déterminer la clé de la portée
    const graphicSheet = osmd.GraphicSheet;
    // À adapter si ta partition possède plusieurs instruments.
    const cle = numeroMesure && estSurPorteeCleFa(p.y, graphicSheet)
        ? "fa"
        : "sol";

    // Notes de la ligne inférieure vers le haut
    const notesSol = [
        { note: "E", octave: 4 },
        { note: "F", octave: 4 },
        { note: "G", octave: 4 },
        { note: "A", octave: 4 },
        { note: "B", octave: 4 },
        { note: "C", octave: 5 },
        { note: "D", octave: 5 },
        { note: "E", octave: 5 },
        { note: "F", octave: 5 }
    ];

    const notesFa = [
        { note: "G", octave: 2 },
        { note: "A", octave: 2 },
        { note: "B", octave: 2 },
        { note: "C", octave: 3 },
        { note: "D", octave: 3 },
        { note: "E", octave: 3 },
        { note: "F", octave: 3 },
        { note: "G", octave: 3 },
        { note: "A", octave: 3 }
    ];

    const notes = cle === "fa" ? notesFa : notesSol;

    // Position de la ligne inférieure
    const ligneDuBas = bas;

    // Une position = une ligne ou un interligne
    const demiInterligne = meilleurePortee.espacement / 2;

    const position = Math.round(
        (ligneDuBas - p.y) / demiInterligne
    );

    // Autoriser également les notes en dehors de la portée
    const notesComplete = cle === "fa"
        ? notesFa
        : notesSol;

    let index = 0;
    let octave = 0;

    let reference = cle === "fa" ? 2 : 4;

    index = reference * 7 + position;

    const noms = ["C", "D", "E", "F", "G", "A", "B"];

    octave = Math.floor(index / 7);

    const noteIndex = ((index % 7) + 7) % 7;

    const resultat = {
        note: noms[noteIndex],
        octave: octave
    };

    console.log("Hauteur détectée :", resultat);

    return resultat;
}




function calculerNoteDepuisPosition(y, ligneDuBas, distanceInterligne, cle) {

    const notesSol = [
        { note: "E", octave: 4 },
        { note: "F", octave: 4 },
        { note: "G", octave: 4 },
        { note: "A", octave: 4 },
        { note: "B", octave: 4 },
        { note: "C", octave: 5 },
        { note: "D", octave: 5 },
        { note: "E", octave: 5 },
        { note: "F", octave: 5 }
    ];

    const notesFa = [
        { note: "G", octave: 2 },
        { note: "A", octave: 2 },
        { note: "B", octave: 2 },
        { note: "C", octave: 3 },
        { note: "D", octave: 3 },
        { note: "E", octave: 3 },
        { note: "F", octave: 3 },
        { note: "G", octave: 3 },
        { note: "A", octave: 3 }
    ];

    const notes = cle === "fa" ? notesFa : notesSol;

    // Chaque demi-interligne représente un degré diatonique
    const demiInterligne = distanceInterligne / 2;

    const position = Math.round(
        (ligneDuBas - y) / demiInterligne
    );

    // Position 0 = ligne du bas
    // Position 1 = interligne supérieur

    const index = Math.max(
        0,
        Math.min(notes.length - 1, position)
    );

    return notes[index];
}



// --------------------------------------------------
// CLIC SUR LA PARTITION
// --------------------------------------------------
document.getElementById("score").addEventListener(
    "click",
    async function(event) {

        if (!modeAjoutNote) return;

        const position = obtenirPositionDepuisClic(event);

        if (!position) {
            console.warn("Position musicale introuvable.");
            return;
        }

        const svg = event.target.closest("svg");

        if (!svg) return;

        const hauteur = obtenirHauteurDepuisClic(
            svg,
            event.clientX,
            event.clientY,
            position.mesure
        );

        if (!hauteur) {
            console.warn("Hauteur introuvable.");
            return;
        }

        try {

            await ajouterNoire({

                mesure: position.mesure,
                note: hauteur.note,
                octave: hauteur.octave,
                temps: Math.round(position.temps),
                partie: "P1"

            });

            console.log(
                "Note ajoutée :",
                hauteur.note + hauteur.octave,
                "Mesure :",
                position.mesure
            );

            console.log(
    "SVG :",
    document.querySelector("#score svg")
);

console.log(
    "Nombre de lignes :",
    document.querySelectorAll("#score svg path").length
);

console.log(
    "Nombre de portées :",
    osmd.GraphicSheet.numberOfStaves
);

console.log(
    "Structure graphique :",
    osmd.GraphicSheet.VerticalGraphicalStaffEntryContainers[0]
);

        } catch (error) {

            console.error("Erreur ajout note :", error);

        }

    }
);

