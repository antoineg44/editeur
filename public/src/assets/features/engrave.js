"use strict";

window.staticNavigationData.features.push({
  name: "engrave",
  choices: {
    "Layout type": [
      "Conductor Score", "Orchestral Part", "Lead Sheet", "Choral Score",
      "Piano Solo", "Worksheet / Exercise", "Manuscript Draft"
    ],
    "Preset": ["A4", "A3", "Letter", "Legal", "Tabloid", "9 x 12 in", "Custom"],
    "Rastral": [
      "0 \u2014 8.0mm", "1 \u2014 7.5mm", "2 \u2014 7.0mm",
      "3 \u2014 6.5mm", "4 \u2014 6.0mm", "5 \u2014 5.5mm",
      "6 \u2014 5.0mm", "7 \u2014 4.5mm", "8 \u2014 3.5mm"
    ],
    "Page setup for": ["Full score", "Piano"],
    "Page defaults for": ["Scores", "Parts"],
    "First system": ["Full", "Short", "None"],
    "Later systems": ["Full", "Short", "None"],
    "First system instrument labels": ["Full", "Short", "None"],
    "Subsequent systems instrument labels": ["Full", "Short", "None"],
    "Chord symbols": ["Automatic", "Show", "Hide"],
    "Apply to": ["Full scores", "Parts"],
    "Time signature appearance scope": ["Full scores", "Parts"],
    "Distribution": ["One per staff", "One per group", "One per system"],
    "Grand staves": ["Include grand staves", "Exclude grand staves"],
    "Vertical position": ["Vertically centered", "Above staff"],
    "Open meter": ["Open-meter X", "No symbol"],
    "Non-default meter grouping": ["Standard", "Additive"]
  }
});
