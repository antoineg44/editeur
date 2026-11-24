"use strict";

(() => {
    function installMenuFilePicker() {
        const scorePicker = document.createElement("input");
        scorePicker.type = "file";
        scorePicker.accept = ".musicxml,.xml,application/vnd.recordare.musicxml+xml,application/xml,text/xml";
        scorePicker.hidden = true;
        document.body.appendChild(scorePicker);

        window.ButtonActionList.add(document, "click", "Choose MusicXML score", event => {
            if (!(event.target instanceof Element)) return;
            if (!event.target.closest('[data-ui^="Open MNX Score"]')) return;
            scorePicker.value = "";
            scorePicker.click();
        });

        scorePicker.addEventListener("change", () => {
            const file = scorePicker.files && scorePicker.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.addEventListener("error", () => {
                console.error("Could not read the selected MusicXML file.", reader.error);
                window.alert("Impossible de lire le fichier MusicXML sélectionné.");
            });
            reader.addEventListener("load", () => {
                if (typeof reader.result !== "string") {
                    window.alert("Le fichier sélectionné n’a pas pu être lu comme texte.");
                    return;
                }

                window.parent.postMessage({
                    channel: "viritura-index-new",
                    type: "open-musicxml",
                    name: file.name,
                    content: reader.result
                }, "*");
            });
            reader.readAsText(file);
        });
    }

    function initialize(dependencies) {
        let pendingMusicXml = null;
        let isEditorReady = false;
        let renderRequest = 0;
        const scoreElement = document.getElementById("static-score");
        const scorePlaceholder = document.getElementById("static-score-placeholder");
        const scoreContainer = document.getElementById("musicxml-score");
        const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(scoreContainer, {
            backend: "svg",
            autoResize: true,
            drawTitle: true,
            drawSubtitle: true,
            drawComposer: true,
            pageFormat: "A4_P",
            pageBackgroundColor: "#FFFFFF",
            drawPartNames: true
        });

        async function renderMusicXml(content) {
            const request = ++renderRequest;
            scoreContainer.replaceChildren();
            scoreElement.classList.add("static-score--loaded");
            scorePlaceholder.hidden = true;

            try {
                const xmlDocument = new DOMParser().parseFromString(content, "application/xml");
                if (xmlDocument.querySelector("parsererror")) {
                    throw new Error("Le contenu de l’éditeur n’est pas un document XML valide.");
                }
                await osmd.load(xmlDocument);
                if (request !== renderRequest) return;
                osmd.render();
            } catch (error) {
                if (request !== renderRequest) return;
                console.error("Could not render the MusicXML score.", error);
                scoreContainer.replaceChildren();
                scoreElement.classList.remove("static-score--loaded");
                scorePlaceholder.textContent = "Impossible d’afficher cette partition.";
                scorePlaceholder.hidden = false;
            }
        }

        function deliverPendingMusicXml() {
            if (!pendingMusicXml || !isEditorReady) return;

            dependencies.editorWindow.postMessage({
                channel: "viritura-editor",
                type: "load-musicxml",
                name: pendingMusicXml.name,
                content: pendingMusicXml.content
            }, "*");
            pendingMusicXml = null;
        }

        function openMusicXmlInEditor(event, message) {
            pendingMusicXml = { name: message.name, content: message.content };
            dependencies.selectEditActivity();
            dependencies.syncMenuActivity();
            renderMusicXml(message.content);
            deliverPendingMusicXml();
        }

        function markEditorFrameReady() {
            isEditorReady = true;
            deliverPendingMusicXml();
        }

        function refreshMusicXml(event, message) {
            renderMusicXml(message.content);
        }

        window.ButtonActionList.addMessages(window, "viritura-index-new", [
            {
                message: "open-musicxml",
                source: dependencies.fileMenuWindow,
                types: { name: "string", content: "string" },
                handler: "openMusicXmlInEditor"
            },
            {
                message: "editor-ready",
                source: dependencies.editorWindow,
                handler: "markEditorFrameReady"
            },
            {
                message: "refresh-musicxml",
                source: dependencies.editorWindow,
                types: { content: "string" },
                handler: "refreshMusicXml"
            }
        ], {
            openMusicXmlInEditor,
            markEditorFrameReady,
            refreshMusicXml
        });
    }

    window.FileActions = Object.freeze({ initialize });

    if (window.parent !== window &&
        document.querySelector('[data-ui^="Open MNX Score"]')) {
        installMenuFilePicker();
    }
})();
