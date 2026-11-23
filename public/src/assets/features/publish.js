"use strict";

window.staticNavigationData.features.push({
  name: "publish",
  activate({ action, element, screen, role, app, controlLabel, showScreen, showOverlay }) {
    if (screen === "publish" && (/^Include .* in export/.test(action) || ["All", "None"].includes(action))) {
      const inputs = action.startsWith("Include ") ? element.querySelectorAll("input[type=checkbox]") :
        app.querySelectorAll('input[type=checkbox][aria-label^="Include "]');
      for (const input of inputs) input.checked = action === "All" || action !== "None" && !input.checked;
      return;
    }
    if (action.startsWith("Publish")) return showScreen("publish");
    if ((role === "combobox" || element.hasAttribute("aria-haspopup")) &&
      screen === "publish" && (/PDF/.test(action) || controlLabel(element) === "Format")) {
      return showOverlay("export-format", element);
    }
    return false;
  }
});
