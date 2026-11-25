"use strict";

(() => {
    const emptyState = document.getElementById("inspector-empty");
    const selectionState = document.getElementById("inspector-selection");
    const selectionTitle = document.getElementById("inspector-selection-title");
    const status = document.getElementById("inspector-status");
    const tree = document.getElementById("inspector-tree");
    const maxNodes = 400;
    let nodeCount = 0;

    function sendUpdate(path, value, attribute, button) {
        button.disabled = true;
        status.textContent = "Enregistrement…";
        window.parent.postMessage({
            channel: "viritura-index-new",
            type: "write-component-update",
            path: JSON.stringify(path),
            value,
            attribute
        }, "*");
    }

    function createField(label, value, path, attribute = "") {
        const row = document.createElement("div");
        row.className = "write-inspector-field";

        const fieldLabel = document.createElement("label");
        fieldLabel.textContent = label;
        const input = document.createElement("input");
        input.type = "text";
        input.value = value;
        input.setAttribute("aria-label", label);

        const button = document.createElement("button");
        button.type = "button";
        button.className = "_button_4hx0m_4 _sm_4hx0m_85 _ghost_4hx0m_186";
        button.textContent = "Appliquer";
        button.addEventListener("click", () => {
            sendUpdate(path, input.value, attribute, button);
        });

        row.append(fieldLabel, input, button);
        return row;
    }

    function renderNode(element, path, depth) {
        if (nodeCount >= maxNodes) return null;
        nodeCount++;

        const details = document.createElement("details");
        details.className = "write-inspector-node";
        details.open = depth === 0 || element.localName === "lyric" ||
            element.parentElement?.localName === "lyric";

        const summary = document.createElement("summary");
        summary.textContent = `<${element.localName}>`;
        details.appendChild(summary);

        const content = document.createElement("div");
        content.className = "write-inspector-node-content";
        for (const attribute of Array.from(element.attributes)) {
            if (attribute.namespaceURI === "http://www.w3.org/2000/xmlns/") continue;
            content.appendChild(createField(
                `@${attribute.name}`,
                attribute.value,
                path,
                attribute.name
            ));
        }

        const children = Array.from(element.children);
        if (children.length) {
            for (const [index, child] of children.entries()) {
                const childNode = renderNode(child, [...path, index], depth + 1);
                if (childNode) content.appendChild(childNode);
                if (nodeCount >= maxNodes) break;
            }
        } else if (element.textContent !== "") {
            content.appendChild(createField("#text", element.textContent, path));
        } else if (!element.attributes.length) {
            const emptyValue = document.createElement("span");
            emptyValue.className = "write-inspector-hint";
            emptyValue.textContent = "Élément présent sans valeur textuelle.";
            content.appendChild(emptyValue);
        }

        if (content.childNodes.length) details.appendChild(content);
        return details;
    }

    function showSelection(message) {
        tree.replaceChildren();
        status.textContent = "";
        emptyState.hidden = Boolean(message.selected);
        selectionState.hidden = !message.selected;

        if (message.multiple) {
            emptyState.hidden = false;
            document.getElementById("inspector-empty-title").textContent =
                "Plusieurs éléments sélectionnés";
            document.getElementById("inspector-empty-description").textContent =
                "Sélectionnez un seul élément pour afficher et modifier ses composants.";
            return;
        }
        if (!message.selected) {
            document.getElementById("inspector-empty-title").textContent =
                "Aucun élément sélectionné";
            document.getElementById("inspector-empty-description").textContent =
                "Sélectionnez un élément de la partition pour afficher et modifier ses composants MusicXML ici.";
            return;
        }

        document.getElementById("inspector-empty-title").textContent =
            "Aucun élément sélectionné";
        document.getElementById("inspector-empty-description").textContent =
            "Sélectionnez un élément de la partition pour afficher et modifier ses composants MusicXML ici.";
        selectionTitle.textContent =
            `Élément sélectionné : <${message.tag || "élément"}>` +
            (message.parentTag ? ` dans <${message.parentTag}>` : "");

        const parsed = new DOMParser().parseFromString(
            `<inspector-root>${message.xml}</inspector-root>`,
            "application/xml"
        );
        if (parsed.querySelector("parsererror") || !parsed.documentElement.firstElementChild) {
            status.textContent = "Impossible de lire les composants MusicXML de cet élément.";
            return;
        }

        nodeCount = 0;
        const root = renderNode(parsed.documentElement.firstElementChild, [], 0);
        if (root) tree.appendChild(root);
        if (nodeCount >= maxNodes) {
            const limit = document.createElement("p");
            limit.className = "write-inspector-hint";
            limit.textContent = "La liste est limitée aux 400 premiers composants.";
            tree.appendChild(limit);
        }
    }

    window.addEventListener("message", event => {
        if (event.source !== window.parent || event.data?.channel !== "viritura-index-new") return;
        if (event.data.type === "write-selection-state") {
            showSelection(event.data);
        } else if (event.data.type === "write-component-update-result") {
            status.textContent = event.data.success
                ? "Modification enregistrée dans la partition et le MusicXML."
                : "La modification n’a pas été appliquée.";
            tree.querySelectorAll("button").forEach(button => {
                button.disabled = false;
            });
        }
    });
})();
