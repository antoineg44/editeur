Architecture d'un éditeur de partitions basé sur OSMD

Pour ton projet, je recommande une architecture javascript + OSMD + modèle musical indépendant.

L'idée est de profiter d'OSMD pour toute la partie complexe de gravure musicale, tout en développant toi-même les fonctionnalités d'édition graphique.

Je partirais sur une architecture modulaire, suffisamment évolutive pour aller progressivement vers un éditeur comparable à MuseScore.
1. Architecture générale

Voici l'architecture que je propose :
text

┌──────────────────────────────────────────────────────┐
│                    APPLICATION                       │
│                     javascript                       │
│                                                      │
│  ┌────────────┐  ┌────────────────────────────────┐  │
│  │ Toolbar    │  │         Score Editor            │  │
│  │            │  │                                │  │
│  │ Notes      │  │       Partition SVG            │  │
│  │ Silences   │  │                                │  │
│  │ Altérations│  │       Interaction Layer        │  │
│  │ Nuances    │  │                                │  │
│  └────────────┘  └────────────────────────────────┘  │
│                                                      │
│  ┌────────────┐  ┌────────────────────────────────┐  │
│  │ Properties │  │          Status Bar             │  │
│  └────────────┘  └────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────┐
│                  EDITOR CORE                          │
│                                                      │
│  ┌───────────────┐  ┌─────────────────────────────┐  │
│  │ Score Model   │  │       Command Manager       │  │
│  │               │  │                             │  │
│  │ Measures      │  │ AddNoteCommand              │  │
│  │ Notes         │  │ MoveNoteCommand             │  │
│  │ Voices        │  │ DeleteNoteCommand           │  │
│  │ Instruments   │  │ ChangeDurationCommand       │  │
│  └───────────────┘  └─────────────────────────────┘  │
│                                                      │
│  ┌───────────────┐  ┌─────────────────────────────┐  │
│  │ Music Engine  │  │       Selection Manager     │  │
│  │               │  │                             │  │
│  │ Pitch         │  │ Selected notes              │  │
│  │ Duration      │  │ Selected measures           │  │
│  │ Rhythm        │  │ Selection range             │  │
│  │ Quantization  │  └─────────────────────────────┘  │
│  └───────────────┘                                  │
└──────────────────────────┬───────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────┐
│                   RENDER ENGINE                       │
│                                                      │
│                OpenSheetMusicDisplay                 │
│                                                      │
│  MusicXML → MusicSheet → GraphicalMusicSheet → SVG   │
│                                                      │
└──────────────────────────┬───────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────┐
│                    FILE SYSTEM                        │
│                                                      │
│  MusicXML Import / Export                            │
│  MXL Import / Export                                 │
│  Autosave                                            │
│  Undo / Redo                                         │
└──────────────────────────────────────────────────────┘

Il y a une règle fondamentale : OSMD ne doit pas être responsable de la logique d'édition.

Il est responsable de la représentation graphique de la partition.
2. Organisation du projet

Je structurerais le projet ainsi :
text

src/
│
├── app/
│   ├── App.tsx
│   └── EditorLayout.tsx
│
├── components/
│   ├── toolbar/
│   │   ├── NoteToolbar.tsx
│   │   ├── DurationToolbar.tsx
│   │   ├── AccidentalToolbar.tsx
│   │   └── ArticulationToolbar.tsx
│   │
│   ├── panels/
│   │   ├── PropertiesPanel.tsx
│   │   └── InstrumentPanel.tsx
│   │
│   └── editor/
│       ├── ScoreEditor.tsx
│       ├── ScoreViewport.tsx
│       ├── ScoreOverlay.tsx
│       └── SelectionOverlay.tsx
│
├── core/
│   ├── model/
│   │   ├── Score.ts
│   │   ├── Instrument.ts
│   │   ├── Staff.ts
│   │   ├── Measure.ts
│   │   ├── Voice.ts
│   │   ├── Note.ts
│   │   └── Duration.ts
│   │
│   ├── commands/
│   │   ├── Command.ts
│   │   ├── CommandManager.ts
│   │   ├── AddNoteCommand.ts
│   │   ├── MoveNoteCommand.ts
│   │   ├── DeleteNoteCommand.ts
│   │   └── ChangeDurationCommand.ts
│   │
│   ├── selection/
│   │   ├── SelectionManager.ts
│   │   └── Selection.ts
│   │
│   ├── geometry/
│   │   ├── CoordinateMapper.ts
│   │   ├── StaffGeometry.ts
│   │   └── HitTesting.ts
│   │
│   └── music/
│       ├── PitchCalculator.ts
│       ├── RhythmCalculator.ts
│       └── Quantizer.ts
│
├── rendering/
│   ├── OSMDRenderer.ts
│   ├── OSMDAdapter.ts
│   ├── NoteLocator.ts
│   └── RenderScheduler.ts
│
├── interaction/
│   ├── InteractionController.ts
│   ├── PointerHandler.ts
│   ├── NoteDragHandler.ts
│   ├── NoteInsertionHandler.ts
│   └── KeyboardHandler.ts
│
├── io/
│   ├── MusicXMLImporter.ts
│   ├── MusicXMLExporter.ts
│   └── FileManager.ts
│
└── store/
    ├── editorStore.ts
    └── scoreStore.ts

Cette séparation permettra notamment de remplacer OSMD ultérieurement sans réécrire le moteur d'édition.
3. Le modèle musical interne

C'est probablement la partie la plus importante du projet.

Je déconseille fortement d'utiliser directement les classes Note, VoiceEntry ou SourceMeasure d'OSMD comme modèle métier.

Même si OSMD expose son modèle interne, celui-ci est conçu pour son fonctionnement et son rendu.

Je créerais donc mes propres classes.

Par exemple :
havascript

interface Score {
    id: string;
    title: string;
    instruments: Instrument[];
}

interface Instrument {
    id: string;
    name: string;
    staves: Staff[];
}

interface Staff {
    id: string;
    measures: Measure[];
}

interface Measure {
    id: string;
    number: number;
    voices: Voice[];
    timeSignature: TimeSignature;
}

interface Voice {
    id: string;
    events: MusicalEvent[];
}

type MusicalEvent = NoteEvent | RestEvent;

interface NoteEvent {
    id: string;
    type: "note";
    pitch: Pitch;
    duration: Duration;
    position: number;
}

interface RestEvent {
    id: string;
    type: "rest";
    duration: Duration;
    position: number;
}

interface Pitch {
    step: "C" | "D" | "E" | "F" | "G" | "A" | "B";
    octave: number;
    alter: number;
}

interface Duration {
    numerator: number;
    denominator: number;
    dots: number;
}

Quelques remarques :

    position représente une position temporelle dans la mesure, et non une position graphique.
    pitch représente la hauteur musicale indépendamment de la portée.
    duration permet de gérer les valeurs rythmiques et les points.
    Chaque élément possède un identifiant stable.

Je recommande également d'ajouter progressivement les notions de tuplets, de liaisons, d'accords, d'ornements et d'altérations accidentelles.

Il faudra prévoir un modèle suffisamment riche pour préserver les informations MusicXML qui ne sont pas encore éditables.
4. L'adaptation entre OSMD et ton modèle

C'est ici que l'architecture devient intéressante.

OSMD possède déjà plusieurs classes utiles :

    MusicSheet : représentation logique de la partition.
    GraphicalMusicSheet : représentation graphique.
    GraphicalMeasure : mesure graphique.
    GraphicalNote : représentation graphique d'une note.
    GraphicalStaffEntry : positionnement des événements sur une portée.

Cette séparation existe déjà dans OSMD. Elle est décrite dans son architecture interne. GitHub

Je créerais donc un adaptateur :
text

       Modèle musical interne
                 |
                 |
           OSMDAdapter
                 |
          +------+------+
          |             |
          v             v
      OSMD Note     GraphicalNote
          |             |
          |             v
          |         BoundingBox
          |             |
          +------+------+
                 |
                 v
          Interaction UI

L'adaptateur doit notamment permettre :
javascript

interface OSMDAdapter {

    // Retrouver la représentation graphique d'une note
    getGraphicalNote(noteId: string): GraphicalNote | undefined;

    // Retrouver une note à partir d'une position graphique
    getNoteAtPosition(x: number, y: number): NoteEvent | undefined;

    // Obtenir la position graphique d'une note
    getNoteBounds(noteId: string): Rectangle | undefined;

    // Obtenir la position musicale à partir d'une coordonnée
    getMusicalPosition(x: number, y: number): MusicalPosition | undefined;

    // Recalculer le rendu
    refresh(): void;
}

Ce sont les méthodes de ton adaptateur, pas des méthodes natives d'OSMD.
Une fonctionnalité OSMD particulièrement intéressante

OSMD expose notamment :

    osmd.rules.GNote(note) pour retrouver la représentation graphique d'une note.
    osmd.getClickedObject(position) pour rechercher un objet graphique.
    osmd.GetNearestNote(position, maxClickDist) pour rechercher la note la plus proche.
    osmd.svgToOsmd(point) pour convertir des coordonnées SVG en coordonnées OSMD.

Ces fonctionnalités sont particulièrement intéressantes pour développer les interactions souris. GitHub

Je recommande de les encapsuler dans OSMDAdapter, afin de ne pas disperser les appels OSMD dans toute l'application.
5. Gestion des interactions graphiques

Je développerais un véritable contrôleur d'interaction.

Il doit savoir dans quel mode se trouve l'utilisateur.
javascript

type EditorTool =
    | "select"
    | "insert-note"
    | "insert-rest"
    | "delete"
    | "move"
    | "add-slur";

Le contrôleur distribue les événements :
javascript

class InteractionController {

    private currentTool: EditorTool = "select";

    onPointerDown(event: PointerEvent) {
        switch (this.currentTool) {

            case "select":
                this.handleSelection(event);
                break;

            case "insert-note":
                this.handleNoteInsertion(event);
                break;

            case "delete":
                this.handleDeletion(event);
                break;
        }
    }

    onPointerMove(event: PointerEvent) {
        // Gestion des déplacements
    }

    onPointerUp(event: PointerEvent) {
        // Validation de l'interaction
    }
}

Exemple : déplacer une note verticalement

Imaginons une portée en clé de sol.

L'utilisateur clique sur un Do4 et déplace la note d'un interligne vers le haut.

Le fonctionnement serait :

    PointerDown : identification de la note sélectionnée.
    PointerMove : calcul du déplacement vertical.
    CoordinateMapper : conversion en position musicale.
    PitchCalculator : calcul de la nouvelle hauteur.
    MoveNoteCommand : modification du modèle.
    RenderScheduler : actualisation de la partition.

Attention à un point important : le déplacement vertical ne doit pas simplement modifier une coordonnée Y.

Il doit prendre en compte :

    La clé de la portée.
    La position des lignes et interlignes.
    L'octave.
    L'armure.
    Les altérations accidentelles de la mesure.

Exemple : ajouter une note

L'utilisateur sélectionne une noire dans la barre d'outils, puis clique sur une portée.

Le système doit :

    Identifier la portée.
    Identifier la mesure.
    Calculer la position temporelle à partir de X.
    Calculer la hauteur à partir de Y.
    Déterminer la durée sélectionnée.
    Vérifier les contraintes rythmiques.
    Ajouter la note au modèle.
    Recalculer le rendu.

Pour les coordonnées, je créerais une classe CoordinateMapper qui centralise toutes les conversions entre :

    Coordonnées écran.
    Coordonnées SVG.
    Coordonnées OSMD.
    Coordonnées musicales.

C'est une abstraction essentielle pour gérer le zoom, le scroll et les changements de mise en page.
6. Le système Undo / Redo

Je recommande fortement le pattern Command.

Chaque opération d'édition devient une commande indépendante.
javascript

interface Command {
    execute(): void;
    undo(): void;
}

Exemple :
javascript

class MoveNoteCommand implements Command {

    constructor(
        private note: NoteEvent,
        private oldPitch: Pitch,
        private newPitch: Pitch
    ) {}

    execute() {
        this.note.pitch = this.newPitch;
    }

    undo() {
        this.note.pitch = this.oldPitch;
    }
}

Le CommandManager conserve l'historique :
javascript

class CommandManager {

    private undoStack: Command[] = [];
    private redoStack: Command[] = [];

    execute(command: Command) {
        command.execute();

        this.undoStack.push(command);
        this.redoStack = [];
    }

    undo() {
        const command = this.undoStack.pop();

        if (!command) return;

        command.undo();
        this.redoStack.push(command);
    }

    redo() {
        const command = this.redoStack.pop();

        if (!command) return;

        command.execute();
        this.undoStack.push(command);
    }
}

Pour un éditeur graphique, c'est beaucoup plus propre que de gérer Undo/Redo directement dans les composants javascript.
7. Le problème important : le rendu après modification

Il y a un point sur lequel je souhaite attirer ton attention.

OSMD est un moteur de rendu, pas un moteur d'édition.

Il ne faut donc pas imaginer que tu peux modifier une note dans son modèle interne et appeler simplement render() pour obtenir un éditeur complet.

Je recommande trois niveaux de rafraîchissement :
Opération	Rafraîchissement
Changer la couleur d'une note sélectionnée	Overlay SVG
Déplacer temporairement une note pendant un drag	Overlay graphique temporaire
Valider une modification musicale	Mise à jour du modèle puis recalcul OSMD

Pour la validation, tu peux commencer par recharger et recalculer toute la partition.

C'est plus simple et plus fiable pour un premier prototype.

Ensuite, tu pourras optimiser les performances en limitant les recalculs aux mesures concernées, si l'API OSMD le permet sans manipulations internes fragiles.

Je déconseille de chercher à modifier directement les objets GraphicalNote ou les objets VexFlow pour effectuer une édition permanente.
8. Import et export MusicXML

C'est un sujet particulièrement important.

Je recommande de ne pas faire du modèle OSMD la source de vérité de ton application.

Je conserverais trois éléments :
text

              Fichier MusicXML original
                        |
                        v
                 MusicXML Importer
                        |
             +----------+----------+
             |                     |
             v                     v
       Modèle musical        XML source
       éditable               conservé
             |                     |
             |                     |
             v                     v
       Modifications          Préservation
             |                des données
             +----------+----------+
                        |
                        v
                 MusicXML Exporter
                        |
                        v
                 Fichier MusicXML

Pourquoi conserver le XML original ?

Parce qu'un MusicXML peut contenir beaucoup d'informations :

    Informations de mise en page.
    Polices et styles.
    Informations de gravure.
    Symboles particuliers.
    Métadonnées.
    Extensions spécifiques.

Tu ne voudras probablement pas perdre ces informations simplement parce que ton éditeur ne sait pas encore les manipuler.

Je recommande donc :

    De conserver le document XML original.
    De construire ton modèle musical à partir de ce document.
    De suivre les modifications effectuées.
    De mettre à jour les éléments XML correspondants à l'export.
    De préserver les éléments inconnus ou non modifiés.

Il faudra toutefois gérer les dépendances entre éléments XML, notamment lorsque tu modifies des mesures ou des événements rythmiques.

Pour le premier prototype, tu peux aussi commencer avec un exporteur qui reconstruit entièrement le MusicXML à partir de ton modèle. La préservation complète du XML pourra venir ensuite.
