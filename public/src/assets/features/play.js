"use strict";

window.staticNavigationData.features.push({
  name: "play",
  choices: {
    "Room": ["Vienna Musikverein", "Small room", "Concert hall"]
  },
  activate({ action, element, overlay, template, label, choose, showOverlay }) {
    if (action.startsWith("Sound for ")) return showOverlay("sound", element);
    if (overlay === "sound" && action === "VirituraSounds") {
      return template("instruments").then(html => {
        const fragment = document.createElement("template");
        fragment.innerHTML = html;
        const sounds = [...fragment.content.querySelectorAll('button[class*="_row_"]')].map(button => label(button));
        return choose(element, sounds);
      });
    }
    if (/^Showing (time|measure)/.test(action)) {
      element.textContent = element.dataset.measure === "true" ? "0:00 / 0:16" : "1:1 / 8:4";
      element.dataset.measure = String(element.dataset.measure !== "true");
      return;
    }
    return false;
  }
});
