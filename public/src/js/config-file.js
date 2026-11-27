"use strict";

(() => {
    let initialized = false;
    let updateQueue = Promise.resolve();

    function getXmlChildren(parent, name) {
        return parent
            ? Array.from(parent.children).filter(child => child.localName === name)
            : [];
    }

    function getXmlChild(parent, name) {
        return getXmlChildren(parent, name)[0] || null;
    }

    function createXmlElement(parent, name) {
        const qualifiedName = parent.prefix ? `${parent.prefix}:${name}` : name;
        return parent.namespaceURI
            ? parent.ownerDocument.createElementNS(parent.namespaceURI, qualifiedName)
            : parent.ownerDocument.createElement(qualifiedName);
    }

    function insertXmlElement(parent, element, beforeNames, afterName = null) {
        const after = afterName ? getXmlChild(parent, afterName) : null;
        if (after) {
            parent.insertBefore(element, after.nextSibling);
            return;
        }
        const before = Array.from(parent.children).find(child =>
            beforeNames.includes(child.localName)
        );
        parent.insertBefore(element, before || null);
    }

    function ensureXmlChild(parent, name, beforeNames) {
        const existing = getXmlChild(parent, name);
        if (existing) return existing;
        const element = createXmlElement(parent, name);
        insertXmlElement(parent, element, beforeNames);
        return element;
    }

    function getCreatorValues(identification, type) {
        return getXmlChildren(identification, "creator")
            .filter(creator => creator.getAttribute("type") === type)
            .map(creator => creator.textContent.trim())
            .join("\n");
    }

    function getCopyrightCreditValues(root) {
        const values = [];
        for (const credit of getXmlChildren(root, "credit")) {
            const isCopyright = getXmlChildren(credit, "credit-type")
                .some(type => ["copyright", "rights"].includes(type.textContent.trim().toLowerCase()));
            if (!isCopyright) continue;
            for (const words of getXmlChildren(credit, "credit-words")) {
                const value = words.textContent.trim();
                if (value && !values.includes(value)) values.push(value);
            }
        }
        return values;
    }

    function getMetadataLines(value) {
        return value.split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);
    }

    function readMetadata(xmlDocument) {
        const root = xmlDocument.documentElement;
        const work = getXmlChild(root, "work");
        const identification = getXmlChild(root, "identification");
        const rights = getXmlChildren(identification, "rights")
            .map(element => element.textContent.trim())
            .filter(Boolean);
        const copyright = rights.length ? rights : getCopyrightCreditValues(root);
        return {
            title: getXmlChild(work, "work-title")?.textContent.trim() || "",
            subtitle: getXmlChild(root, "movement-title")?.textContent.trim() || "",
            composer: getCreatorValues(identification, "composer"),
            lyricist: getCreatorValues(identification, "lyricist"),
            arranger: getCreatorValues(identification, "arranger"),
            copyright: copyright.join("\n")
        };
    }

    function ensureWork(root) {
        const work = getXmlChild(root, "work");
        if (work) return work;
        const element = createXmlElement(root, "work");
        insertXmlElement(root, element, [
            "movement-number", "movement-title", "identification", "defaults",
            "credit", "part-list"
        ]);
        return element;
    }

    function ensureIdentification(root) {
        const identification = getXmlChild(root, "identification");
        if (identification) return identification;
        const element = createXmlElement(root, "identification");
        insertXmlElement(root, element, ["defaults", "credit", "part-list"]);
        return element;
    }

    function setSingleValue(parent, name, value, beforeNames, afterName = null) {
        const existing = getXmlChildren(parent, name);
        const normalizedValue = value.trim();
        if (!normalizedValue) {
            existing.forEach(element => element.remove());
            return;
        }

        const element = existing[0] || createXmlElement(parent, name);
        element.textContent = normalizedValue;
        if (!existing.length) insertXmlElement(parent, element, beforeNames, afterName);
        existing.slice(1).forEach(duplicate => duplicate.remove());
    }

    function setRepeatedValues(parent, name, values, beforeNames, attribute) {
        const existing = getXmlChildren(parent, name)
            .filter(element => !attribute || element.getAttribute(attribute.name) === attribute.value);
        for (let index = 0; index < values.length; index++) {
            let element = existing[index];
            if (!element) {
                element = createXmlElement(parent, name);
                if (attribute) element.setAttribute(attribute.name, attribute.value);
                insertXmlElement(parent, element, beforeNames);
                existing.push(element);
            }
            element.textContent = values[index];
        }
        existing.slice(values.length).forEach(element => element.remove());
    }

    function getCreditLayout(root, role) {
        const defaults = getXmlChild(root, "defaults");
        const pageLayout = getXmlChild(defaults, "page-layout");
        const pageHeight = Number(getXmlChild(pageLayout, "page-height")?.textContent) || 1780;
        const pageWidth = Number(getXmlChild(pageLayout, "page-width")?.textContent) || 1435;
        const margins = getXmlChildren(pageLayout, "page-margins");
        const pageMargins = margins.find(element => element.getAttribute("type") === "both") ||
            margins.find(element => element.getAttribute("type") === "odd") ||
            margins[0];
        const margin = name => Number(getXmlChild(pageMargins, `${name}-margin`)?.textContent) || 80;
        const left = margin("left");
        const right = margin("right");
        const top = margin("top");
        const bottom = margin("bottom");
        const topY = pageHeight - top - 48;

        if (role === "composer") {
            return { x: pageWidth - right, y: topY, justify: "right", fontSize: 12 };
        }
        if (role === "lyricist") {
            return { x: left + 160, y: topY, justify: "left", fontSize: 12 };
        }
        if (role === "arranger") {
            return { x: pageWidth - right, y: topY - 240, justify: "right", fontSize: 9 };
        }
        return { x: pageWidth / 2, y: bottom + 80, justify: "center", fontSize: 9 };
    }

    function getCredits(root, types) {
        return getXmlChildren(root, "credit").filter(credit =>
            getXmlChildren(credit, "credit-type").some(type =>
                types.includes(type.textContent.trim().toLowerCase())
            )
        );
    }

    function createDisplayCredit(root, type, value, layout) {
        const credit = createXmlElement(root, "credit");
        credit.setAttribute("page", "1");
        const creditType = createXmlElement(credit, "credit-type");
        creditType.textContent = type;
        credit.appendChild(creditType);
        const words = createXmlElement(credit, "credit-words");
        words.textContent = value;
        words.setAttribute("default-x", String(Math.round(layout.x)));
        words.setAttribute("default-y", String(Math.round(layout.y)));
        words.setAttribute("justify", layout.justify);
        words.setAttribute("font-family", "serif");
        words.setAttribute("font-size", String(layout.fontSize));
        credit.appendChild(words);
        insertXmlElement(root, credit, ["part-list"]);
        return credit;
    }

    function ensureDisplayCredit(root, types, createType, values, layout) {
        if (!values.length) return;
        const hasVisibleCredit = getCredits(root, types).some(credit =>
            getXmlChildren(credit, "credit-words").some(words => words.textContent.trim())
        );
        if (!hasVisibleCredit) {
            createDisplayCredit(root, createType, values.join(", "), layout);
        }
    }

    function prepareScoreCredits(xmlDocument) {
        const root = xmlDocument.documentElement;
        const metadata = readMetadata(xmlDocument);

        ensureDisplayCredit(
            root,
            ["composer"],
            "composer",
            getMetadataLines(metadata.composer),
            getCreditLayout(root, "composer")
        );
        ensureDisplayCredit(
            root,
            ["lyricist"],
            "lyricist",
            getMetadataLines(metadata.lyricist).slice(0, -1),
            getCreditLayout(root, "lyricist")
        );
        ensureDisplayCredit(
            root,
            ["arranger"],
            "arranger",
            getMetadataLines(metadata.arranger),
            getCreditLayout(root, "arranger")
        );
        ensureDisplayCredit(
            root,
            ["copyright", "rights"],
            "copyright",
            getMetadataLines(metadata.copyright),
            getCreditLayout(root, "copyright")
        );
    }

    function synchronizeDisplayCredits(root, types, createType, values, layout, createWhenMissing) {
        const credits = getCredits(root, types);
        if (!values.length) {
            credits.forEach(credit => credit.remove());
            return;
        }

        if (!credits.length) {
            if (createWhenMissing) {
                createDisplayCredit(root, createType, values.join(", "), layout);
            }
            return;
        }

        const displayCredits = credits.slice(0, values.length);
        credits.slice(values.length).forEach(credit => credit.remove());
        displayCredits.forEach((credit, index) => {
            const words = getXmlChildren(credit, "credit-words");
            let value;
            if (values.length > credits.length && index === 0) {
                value = values.join(", ");
            } else {
                value = values[Math.min(index, values.length - 1)];
            }
            if (words.length) {
                words[0].textContent = value;
                words.slice(1).forEach(word => word.remove());
            } else {
                const newWords = createXmlElement(credit, "credit-words");
                newWords.textContent = value;
                newWords.setAttribute("default-x", String(Math.round(layout.x)));
                newWords.setAttribute("default-y", String(Math.round(layout.y)));
                newWords.setAttribute("justify", layout.justify);
                newWords.setAttribute("font-family", "serif");
                newWords.setAttribute("font-size", String(layout.fontSize));
                credit.appendChild(newWords);
            }
        });
    }

    function applyMetadataValue(xmlDocument, field, value) {
        const root = xmlDocument.documentElement;
        const normalizedLines = getMetadataLines(value);

        switch (field) {
            case "title": {
                const work = getXmlChild(root, "work");
                if (!work && !value.trim()) return;
                const target = ensureWork(root);
                setSingleValue(target, "work-title", value, [], "work-number");
                if (!target.children.length) target.remove();
                break;
            }
            case "subtitle":
                setSingleValue(root, "movement-title", value, [
                    "identification", "defaults", "credit", "part-list"
                ]);
                break;
            case "composer":
            case "lyricist":
            case "arranger": {
                if (!getXmlChild(root, "identification") && !normalizedLines.length) return;
                setRepeatedValues(
                    ensureIdentification(root),
                    "creator",
                    normalizedLines,
                    ["rights", "encoding", "source", "relation", "miscellaneous"],
                    { name: "type", value: field }
                );
                // OSMD renders the final lyricist creator automatically.
                const displayCreditValues = field === "lyricist"
                    ? normalizedLines.slice(0, -1)
                    : normalizedLines;
                synchronizeDisplayCredits(
                    root,
                    [field],
                    field,
                    displayCreditValues,
                    getCreditLayout(root, field),
                    true
                );
                break;
            }
            case "copyright": {
                const identification = getXmlChild(root, "identification");
                if (identification || normalizedLines.length) {
                    setRepeatedValues(
                        identification || ensureIdentification(root),
                        "rights",
                        normalizedLines,
                        ["encoding", "source", "relation", "miscellaneous"]
                    );
                }
                synchronizeDisplayCredits(
                    root,
                    ["copyright", "rights"],
                    "copyright",
                    normalizedLines,
                    getCreditLayout(root, "copyright"),
                    true
                );
                break;
            }
            default:
                throw new TypeError("Project metadata field is not supported.");
        }
    }

    function sendMetadata(setupFrame) {
        const xmlDocument = window.PartitionClick.getMusicXmlDocument();
        const metadata = xmlDocument
            ? readMetadata(xmlDocument)
            : {
                title: "",
                subtitle: "",
                composer: "",
                lyricist: "",
                arranger: "",
                copyright: ""
            };
        setupFrame.contentWindow.postMessage({
            channel: "viritura-index-new",
            type: "project-metadata",
            available: Boolean(xmlDocument),
            ...metadata
        }, "*");
    }

    function applySetupProjectMetadata(setupFrame, message) {
        const reply = (success, status) => setupFrame.contentWindow.postMessage({
            channel: "viritura-index-new",
            type: "project-metadata-update-result",
            field: message.field,
            success,
            message: status
        }, "*");

        const update = async () => {
            const xmlDocument = window.PartitionClick.getMusicXmlDocument();
            if (!xmlDocument) {
                reply(false, "Open a MusicXML file before editing project information.");
                return;
            }

            try {
                applyMetadataValue(xmlDocument, message.field, message.value);
                const rendered = await window.FileActions.updateMusicXml(
                    xmlDocument,
                    `Updated project metadata: ${message.field}`
                );
                if (!rendered) throw new Error("The updated score could not be rendered.");
                reply(true, "Project information saved to the MusicXML file.");
            } catch (error) {
                console.error("Could not update project metadata in MusicXML.", error);
                reply(false, `Could not save project information: ${error.message}`);
            }
        };
        updateQueue = updateQueue.then(update, update);
    }

    function initialize(setupFrame) {
        if (initialized) return;
        if (!(setupFrame instanceof HTMLIFrameElement)) {
            throw new TypeError("ConfigFileActions requires the setup screen iframe.");
        }

        window.ButtonActionList.addMessages(window, "viritura-index-new", [
            {
                message: "project-metadata-request",
                source: setupFrame.contentWindow,
                handler: "requestProjectMetadata"
            },
            {
                message: "project-metadata-update",
                source: setupFrame.contentWindow,
                types: { field: "string", value: "string" },
                handler: "updateProjectMetadata"
            }
        ], {
            requestProjectMetadata() {
                sendMetadata(setupFrame);
            },
            updateProjectMetadata(event, message) {
                applySetupProjectMetadata(setupFrame, message);
            }
        });
        initialized = true;
    }

    window.ConfigFileActions = Object.freeze({ initialize, prepareScoreCredits });
})();
