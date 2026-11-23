"use strict";

window.staticNavigationData.features.push({
  name: "project",
  forms: {
    file: { title: "Open MNX Score", fields: [{ label: "File", type: "file", accept: ".mnx,.json" }] },
    import: { title: "Import", fields: [{ label: "File", type: "file", accept: ".musicxml,.xml,.mxl,.musx" }] },
    folder: {
      title: "Project location",
      description: "Dossier de demonstration uniquement. Aucun acces au systeme de fichiers.",
      fields: [{ label: "Folder name", value: "My Project" }]
    }
  },
  activate(ui) {
    const { action, element, overlay, overlays, label, showScreen, showOverlay, showForm, closeOverlay, setChoice, choose, preview } = ui;
    if (action === "static-confirm") {
      const folder = overlay === "form:folder";
      closeOverlay();
      if (folder && ui.overlay === "new-project") {
        const location = [...overlays.querySelectorAll("button")].find(button => label(button) === "Project location");
        if (location) setChoice(location, "My Project (demonstration)");
        const create = [...overlays.querySelectorAll("button")].find(button => label(button) === "Create project");
        if (create) create.disabled = false;
      }
      return preview();
    }
    if (action === "Share") return showOverlay("share", element);
    if (action === "Start Center" || action.startsWith("Recent Projects")) return showOverlay("start", element);
    if (action.startsWith("New Project") || action === "Create project" && overlay === "start") return showOverlay("new-project", element);
    if (action === "Create project" && overlay === "new-project") return showScreen("setup").then(preview);
    if (action.startsWith("Open Recent")) return choose(element, ["(no recent items)"]);
    if (action.startsWith("Rhapsody") || action.startsWith("Beethoven") || action.startsWith("Llamigos")) return showScreen("write");
    const routes = [
      [/^Open (MNX|MNX file)/, "file"],
      [/^Open Project Folder|^Project location$|^Choose folder$|^Choose.*folder/, "folder"],
      [/^Import/, "import"]
    ];
    for (const [pattern, form] of routes) {
      if (pattern.test(action)) return showForm(form, element, Boolean(overlay && !overlay.startsWith("menu:")));
    }
    return false;
  },
  input({ overlay, overlays, label }) {
    if (overlay === "new-project") {
      const create = [...overlays.querySelectorAll("button")].find(button => label(button) === "Create project");
      if (create) create.disabled = !overlays.querySelector('input[placeholder="My Project"]')?.value.trim();
    }
  }
});
