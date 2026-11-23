"use strict";

window.staticNavigationData.features.push({
  name: "settings",
  choices: {
    "Track position": ["Above", "Below"],
    "Entry grid": ["Quarter", "Eighth", "Sixteenth"]
  },
  forms: {
    "profile-plugin": {
      title: "Instrument profile",
      fields: [
        { label: "Name", value: "New instrument" },
        { label: "Script", type: "textarea" },
        { label: "Plugin", value: "No plugin selected" },
        { label: "State", type: "file" }
      ]
    }
  },
  activate({ action, element, role, overlay, returnFocus, showOverlay, showForm, closeOverlay, resetOverlayHistory, preview }) {
    if (overlay.startsWith("calibrate:") && ["Credit Card", "Inch Ruler", "Cm Ruler"].includes(action)) {
      return showOverlay("calibrate:" + action, returnFocus);
    }
    if (action === "Settings") return showOverlay("settings:Appearance", element);
    if (action === "New profile") return showOverlay("new-profile", returnFocus);
    if (action === "Back to profiles") {
      resetOverlayHistory();
      return showOverlay("settings:Instrument Profiles", returnFocus);
    }
    if (action === "Add new instrument") return showOverlay("profile-instruments", element, true);
    if (overlay === "profile-instruments" && role === "menuitem") return showOverlay("profile-editor", returnFocus);
    if (["Setup", "Choose", "Select an instrument"].includes(action) && overlay === "profile-editor") return showForm("profile-plugin", element, true);
    if (/^(Calibrate display|Display calibration)/i.test(action)) return showOverlay("calibrate:Credit Card", element, overlay.startsWith("settings:"));
    if (action === "Reset to default" && overlay.startsWith("calibrate:")) return showOverlay("calibrate:Credit Card", returnFocus);
    if (action.startsWith("Save calibration")) { closeOverlay(); return preview(); }
    return false;
  }
});
