"use strict";

window.staticNavigationData.features.push({
  name: "review",
  forms: {
    history: {
      title: "Set up version history",
      fields: [{ label: "Project name", value: "My Project" }, { label: "Location", value: "Demonstration" }]
    }
  },
  activate({ action, element, overlay, showForm }) {
    if (action.startsWith("Set up version history")) return showForm("history", element, Boolean(overlay && !overlay.startsWith("menu:")));
    return false;
  }
});
