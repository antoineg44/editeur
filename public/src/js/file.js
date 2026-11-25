"use strict";

(() => {
    let updateCurrentMusicXml = null;
    let restoreCurrentMusicXml = null;

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
        let currentMusicXmlName = "score.musicxml";
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
            drawPartNames: true,
            cursorsOptions: [
                { type: 0, color: "#FF0000", alpha: 0.35, follow: false }
            ]
        });
        window.PartitionClick.initialize(osmd, scoreContainer);
        window.PlayActions.initialize(osmd, dependencies.horizontalMenuWindow);

        async function renderMusicXmlDocument(xmlDocument, preserveScrollPosition = false) {
            const request = ++renderRequest;
            const scrollPosition = preserveScrollPosition
                ? { left: scoreElement.scrollLeft, top: scoreElement.scrollTop }
                : null;
            window.PlayActions.onScoreLoading();
            window.SelectionActions.replaceSelectedNotes([]);
            scoreContainer.replaceChildren();
            scoreElement.classList.add("static-score--loaded");
            scorePlaceholder.hidden = true;

            try {
                if (xmlDocument.querySelector("parsererror")) {
                    throw new Error("Le contenu de l’éditeur n’est pas un document XML valide.");
                }
                window.PartitionClick.setMusicXmlDocument(xmlDocument);
                await osmd.load(xmlDocument);
                if (request !== renderRequest) return false;
                osmd.render();
                window.SelectionActions.refreshVoiceHighlight();
                window.PlayActions.onScoreRendered();
                if (scrollPosition) {
                    scoreElement.scrollLeft = scrollPosition.left;
                    scoreElement.scrollTop = scrollPosition.top;
                }
                return true;
            } catch (error) {
                if (request !== renderRequest) return false;
                console.error("Could not render the MusicXML score.", error);
                scoreContainer.replaceChildren();
                scoreElement.classList.remove("static-score--loaded");
                scorePlaceholder.textContent = "Impossible d’afficher cette partition.";
                scorePlaceholder.hidden = false;
                return false;
            }
        }

        function renderMusicXml(content, historyDescription = null) {
            const xmlDocument = new DOMParser().parseFromString(content, "application/xml");
            if (historyDescription && !xmlDocument.querySelector("parsererror")) {
                window.HistoryActions.recordChange(historyDescription, content);
            }
            return renderMusicXmlDocument(xmlDocument);
        }

        async function applyMusicXmlDocument(xmlDocument, content, description) {
            if (description) window.HistoryActions.recordChange(description, content);
            if (isEditorReady) {
                dependencies.editorWindow.postMessage({
                    channel: "viritura-editor",
                    type: "update-musicxml",
                    name: currentMusicXmlName,
                    content
                }, "*");
            } else {
                pendingMusicXml = { name: currentMusicXmlName, content };
            }

            return renderMusicXmlDocument(xmlDocument, true);
        }

        function updateMusicXmlDocument(xmlDocument, description) {
            const content = new XMLSerializer().serializeToString(xmlDocument);
            return applyMusicXmlDocument(xmlDocument, content, description);
        }

        function restoreMusicXmlDocument(content) {
            const xmlDocument = new DOMParser().parseFromString(content, "application/xml");
            if (xmlDocument.querySelector("parsererror")) {
                throw new Error("The selected history entry is not valid MusicXML.");
            }
            return applyMusicXmlDocument(xmlDocument, content, null);
        }

        updateCurrentMusicXml = updateMusicXmlDocument;
        restoreCurrentMusicXml = restoreMusicXmlDocument;

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
            currentMusicXmlName = message.name;
            pendingMusicXml = { name: message.name, content: message.content };
            window.HistoryActions.startSession(message.name, message.content);
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
            renderMusicXml(message.content, "Edited MusicXML");
        }

        function recordEditorChange(event, message) {
            const xmlDocument = new DOMParser().parseFromString(message.content, "application/xml");
            if (xmlDocument.querySelector("parsererror")) return;
            window.HistoryActions.recordChange("Edited MusicXML", message.content);
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
            },
            {
                message: "musicxml-changed",
                source: dependencies.editorWindow,
                types: { content: "string" },
                handler: "recordEditorChange"
            }
        ], {
            openMusicXmlInEditor,
            markEditorFrameReady,
            refreshMusicXml,
            recordEditorChange
        });
    }

    window.FileActions = Object.freeze({
        initialize,
        updateMusicXml(xmlDocument, description) {
            if (!xmlDocument || typeof xmlDocument.querySelector !== "function") {
                throw new TypeError("FileActions.updateMusicXml requires an XML document.");
            }
            if (!updateCurrentMusicXml) {
                throw new Error("FileActions must be initialized before updating MusicXML.");
            }
            return updateCurrentMusicXml(xmlDocument, description);
        },
        restoreMusicXml(content) {
            if (typeof content !== "string") {
                throw new TypeError("FileActions.restoreMusicXml requires MusicXML text.");
            }
            if (!restoreCurrentMusicXml) {
                throw new Error("FileActions must be initialized before restoring MusicXML.");
            }
            return restoreCurrentMusicXml(content);
        }
    });

    if (window.parent !== window &&
        document.querySelector('[data-ui^="Open MNX Score"]')) {
        installMenuFilePicker();
    }
})();
