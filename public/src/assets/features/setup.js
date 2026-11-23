"use strict";

window.staticNavigationData.features.push({
  name: "setup",
  choices: {
    "Transposition preset": ["Concert pitch", "B-flat", "A", "E-flat", "F", "Octave up", "Octave down"],
    "Sounding pitch": ["C", "C\u266f", "D", "E\u266d", "E", "F", "F\u266f", "G", "A\u266d", "A", "B\u266d", "B"]
  },
  forms: {
    "new-score": {
      title: "Add score",
      fields: [
        { label: "Name", value: "New score" },
        { label: "Type", options: ["Full score", "Condensed score", "Custom score", "Section score", "Instrumental part"] }
      ]
    }
  },
  activate({ action, element, role, screen, overlay, overlays, label, make, showScreen, showOverlay, showForm, closeOverlay, preview }) {
    if (overlay === "instruments" && element.matches('button[class*="_row_"]')) {
      overlays.querySelector(".static-instrument-selection")?.remove();
      element.closest("[role=dialog]").append(make("p", { class: "static-instrument-selection" }, action + " \u2014 selection de demonstration"));
      const add = [...overlays.querySelectorAll("button")].find(button => label(button) === "Add instrument");
      if (add) add.disabled = false;
      return;
    }
    if (action.startsWith("Add instrument") || action === "Change instrument" || action === "Change instrument or tuning") {
      if (overlay === "instruments" && action === "Add instrument") { closeOverlay(); return preview(); }
      return showOverlay("instruments", element);
    }
    if (action === "Split Combined Orchestral Parts") return showOverlay("split-parts", element);
    if (action.startsWith("Instrument actions for ")) return showOverlay("instrument-menu", element);
    if (action === "Add score") return showOverlay("add-score", element);
    if (overlay === "add-score" && role === "menuitem") return showForm("new-score", element);
    if (screen.startsWith("setup") && action === "Piano") return showScreen(screen === "setup:Instrument" ? "setup" : "setup:Instrument");
    if (action === "Customize tuning" || action === "Advanced transposition") return showScreen("setup:Tuning");
    return false;
  }
});
