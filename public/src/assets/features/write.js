"use strict";

(() => {
  async function toggleExtended(element, { template, prepare }) {
    const group = element.closest("[role=group]");
    if (group.dataset.original) {
      group.innerHTML = group.dataset.original;
      delete group.dataset.original;
      return;
    }
    const fragment = document.createElement("template");
    fragment.innerHTML = await template("write:Extended");
    const expanded = [...fragment.content.querySelectorAll("[role=group]")]
      .find(candidate => candidate.getAttribute("aria-label") === group.getAttribute("aria-label"));
    if (!expanded) throw new Error("Options de barre d'outils introuvables.");
    group.dataset.original = group.innerHTML;
    group.innerHTML = expanded.innerHTML;
    prepare(group);
  }

  function toggleSource({ app, clearOverlay, make }) {
    clearOverlay();
    const existing = app.querySelector(".static-source-panel");
    if (existing) { existing.remove(); return; }
    const panel = make("aside", { class: "static-source-panel", "aria-label": "MNX Source" });
    const header = make("header");
    header.append(make("strong", {}, "MNX Source"),
      make("button", { "data-ui": "Close panel", "aria-label": "Close panel" }, "\u00d7"));
    panel.append(header, make("pre", {}, '{\n  "mnx": { "version": 1 },\n  "global": { "measures": [] },\n  "parts": []\n}\n\nApercu statique, sans analyse musicale.'));
    app.append(panel);
  }

  window.staticNavigationData.features.push({
    name: "write",
    choices: {
      "Voice": ["Up 1", "Down 1", "Up 2", "Down 2"],
      "Time signature beat unit": ["2", "4", "8", "16"],
      "Key signature": [
        "C\u266d major", "G\u266d major", "D\u266d major", "A\u266d major",
        "E\u266d major", "B\u266d major", "F major", "C major", "G major",
        "D major", "A major", "E major", "B major", "F\u266f major", "C\u266f major"
      ],
      "Rhythm reading off; using manual duration": ["Off", "Read rhythm", "Repeat rhythm"]
    },
    forms: {
      transpose: {
        title: "Transpose Selection",
        description: "Selection / Rests, rhythm, and key signatures are unchanged.",
        fields: [
          { label: "Direction", options: ["Up", "Down"] },
          { label: "Method", options: ["Chromatic", "Diatonic"] },
          { label: "Interval", options: ["Minor 2nd", "Major 2nd", "Minor 3rd", "Major 3rd", "Perfect 4th", "Perfect 5th", "Minor 6th", "Major 6th", "Minor 7th", "Major 7th", "Octave"] }
        ]
      },
      "add-bars": {
        title: "Add bars",
        fields: [
          { label: "Number of bars", type: "number", value: "4" },
          { label: "Position", options: ["After selection", "Before selection", "End of score"] }
        ]
      },
      "time-signature": {
        title: "Time signature",
        fields: [
          { label: "Beats", type: "number", value: "4" },
          { label: "Beat unit", options: ["2", "4", "8", "16"] },
          { label: "Grouping", value: "2+2" }
        ]
      },
      tuplet: {
        title: "Tuplet",
        fields: [{ label: "Notes", type: "number", value: "3" }, { label: "In the time of", type: "number", value: "2" }]
      },
      tempo: {
        title: "System text / tempo",
        fields: [{ label: "Text", value: "Allegro" }, { label: "Tempo (BPM)", type: "number", value: "120" }]
      },
      text: { title: "Staff text", fields: [{ label: "Text", type: "textarea" }] },
      expression: { title: "Expression text", fields: [{ label: "Text", value: "espress." }] },
      chord: { title: "Chord symbol", fields: [{ label: "Chord", value: "Cmaj7" }] },
      lyrics: {
        title: "Lyrics",
        fields: [{ label: "Verse", type: "number", value: "1" }, { label: "Text" }]
      },
      rehearsal: { title: "Rehearsal mark", fields: [{ label: "Text", value: "A" }] },
      "page-text": {
        title: "Page text frame",
        fields: [{ label: "Text", type: "textarea" }, { label: "Style", options: ["Title", "Subtitle", "Composer", "Plain text"] }]
      }
    },
    activate(ui) {
      const { action, element, overlay, showOverlay, showForm } = ui;
      if (action.startsWith("Toggle extended")) return toggleExtended(element, ui);
      if (action === "MNX Source" || action === "Close panel") return toggleSource(ui);
      if (action === "Voice") return showOverlay("voice", element);
      if (action.startsWith("Augmentation dot")) return showOverlay("dots", element);
      if (action.startsWith("Grace note")) return showOverlay("grace", element);
      const routes = [
        [/^Transpose Selection/, "transpose"],
        [/^Custom time signature/, "time-signature"], [/^Custom tuplet/, "tuplet"],
        [/^Add bars$/, "add-bars"], [/^System text \/ tempo/, "tempo"],
        [/^Staff text/, "text"], [/^Expression text/, "expression"],
        [/^Chord symbol \(/, "chord"], [/^Lyrics/, "lyrics"], [/^Rehearsal mark$/, "rehearsal"],
        [/^Page text frame$/, "page-text"]
      ];
      for (const [pattern, form] of routes) {
        if (pattern.test(action)) return showForm(form, element, Boolean(overlay && !overlay.startsWith("menu:")));
      }
      return false;
    }
  });
})();
