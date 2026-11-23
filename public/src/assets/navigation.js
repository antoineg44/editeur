"use strict";

(() => {
  const app = document.getElementById("app");
  const overlays = document.getElementById("overlays");
  const notice = document.getElementById("notice");
  const { modes, features } = window.staticNavigationData;
  const choices = Object.assign({}, window.staticNavigationData.choices, ...features.map(feature => feature.choices));
  const forms = Object.assign({}, window.staticNavigationData.forms, ...features.map(feature => feature.forms));
  const templates = new Map();
  const screenMemory = new Map();
  let manifest;
  let screen = "";
  let overlay = "";
  let returnFocus = null;
  let choiceTarget = null;
  let previousOverlay = null;
  let transition = 0;
  let noticeTimer;

  function notify(message) {
    clearTimeout(noticeTimer);
    notice.textContent = message;
    noticeTimer = setTimeout(() => { notice.textContent = ""; }, 6500);
  }

  function fail(error) {
    console.error("Interface statique :", error);
    notify("Impossible d'ouvrir l'interface : " + error.message);
    app.setAttribute("aria-busy", "false");
  }

  function preview() {
    notify("Maquette statique : aucune modification musicale, lecture, connexion ou sauvegarde n'est executee.");
  }

  async function fetchText(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(path + " (HTTP " + response.status + ")");
    return response.text();
  }

  async function template(name) {
    if (!manifest[name]) throw new Error("Interface inconnue : " + name);
    if (!templates.has(name)) templates.set(name, await fetchText(manifest[name].path));
    return templates.get(name);
  }

  function label(element) {
    const labelled = element.getAttribute("aria-labelledby");
    return element.getAttribute("aria-label") ||
      (labelled && document.getElementById(labelled)?.textContent.trim()) ||
      (element.getAttribute("role") === "menuitem" && element.firstElementChild?.textContent.trim()) ||
      element.dataset.ui || element.textContent.trim();
  }

  function prepare(host) {
    host.querySelectorAll("button, [role=menuitem], [role=option], [role=tab], [role=radio]")
      .forEach(element => {
        element.tabIndex = element.disabled || element.getAttribute("aria-disabled") === "true" ? -1 : 0;
        if (!element.dataset.ui) element.dataset.ui = label(element);
        if (!element.title && element.getAttribute("aria-label")) element.title = element.getAttribute("aria-label");
      });
    host.querySelectorAll("[role=menuitem]").forEach(element => {
      if (/^(Transpose Selection|Change instrument or tuning)/.test(label(element))) {
        element.removeAttribute("aria-disabled");
        element.removeAttribute("data-disabled");
        element.tabIndex = 0;
      }
    });
    host.querySelectorAll("[contenteditable]").forEach(element => { element.contentEditable = "false"; });
    host.querySelectorAll("form").forEach(element => { element.autocomplete = "off"; });
  }

  function rememberControls(host) {
    host.querySelectorAll("input:not([type=password]):not([type=file]), textarea, select").forEach(element => {
      if (element.tagName === "TEXTAREA") element.textContent = element.value;
      else if (element.tagName === "SELECT") {
        for (const option of element.options) option.toggleAttribute("selected", option.selected);
      } else {
        element.setAttribute("value", element.value);
        element.toggleAttribute("checked", element.checked);
      }
    });
  }

  function rememberScreen() {
    rememberControls(app);
    if (screen) screenMemory.set(screen, app.innerHTML);
  }

  function snapshotOverlay() {
    rememberControls(overlays);
    return { name: overlay, html: overlays.innerHTML, focus: returnFocus, parent: previousOverlay };
  }

  function clearOverlay(restoreFocus = false) {
    overlays.replaceChildren();
    overlay = "";
    choiceTarget = null;
    previousOverlay = null;
    app.inert = false;
    app.querySelectorAll("[aria-haspopup][aria-expanded=true]").forEach(element => {
      element.setAttribute("aria-expanded", "false");
      element.dataset.state = "closed";
    });
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus();
  }

  function closeOverlay() {
    transition++;
    if (previousOverlay) {
      const previous = previousOverlay;
      previousOverlay = previous.parent;
      mountOverlay(previous.name, previous.html, previous.focus);
    } else {
      clearOverlay(true);
    }
  }

  async function showScreen(name, history = true) {
    if (name === screen) { transition++; clearOverlay(); return; }
    const ticket = ++transition;
    const html = screenMemory.get(name) || await template(name);
    if (ticket !== transition) return;
    rememberScreen();
    clearOverlay();
    app.innerHTML = html;
    screen = name;
    prepare(app);
    app.setAttribute("aria-busy", "false");
    if (history) window.history.pushState(null, "", "#" + encodeURIComponent(name));
    document.title = name.split(":")[0] + " \u2014 Viritura (statique)";
    app.querySelector("[data-activity][aria-pressed=true]")?.focus({ preventScroll: true });
  }

  function positionPopup(anchor, rect = anchor?.isConnected ? anchor.getBoundingClientRect() : null) {
    if (!rect) return;
    const popup = overlays.querySelector(".static-popup") || overlays.querySelector("[data-radix-popper-content-wrapper]") ||
      (!overlays.querySelector("[data-dialog-content], .static-dialog") && overlays.firstElementChild);
    if (!popup) return;
    popup.style.position = "fixed";
    popup.style.transform = "none";
    popup.style.left = "8px";
    popup.style.top = "8px";
    popup.style.setProperty("--radix-popper-available-height", (innerHeight - 24) + "px");
    const box = popup.getBoundingClientRect();
    popup.style.left = Math.max(8, Math.min(rect.left, innerWidth - box.width - 8)) + "px";
    const below = rect.bottom + 5;
    popup.style.top = (below + box.height <= innerHeight - 8 ? below :
      Math.max(8, rect.top - box.height - 5)) + "px";
  }

  function mountOverlay(name, html, anchor) {
    const previous = previousOverlay;
    const rect = anchor?.isConnected ? anchor.getBoundingClientRect() : null;
    const sourceFocus = returnFocus;
    clearOverlay();
    previousOverlay = previous;
    const nestedChoices = name === "choices" && previous;
    overlays.innerHTML = (nestedChoices ? previous.html : "") + html;
    overlay = name;
    returnFocus = anchor?.isConnected ? anchor :
      (anchor?.id && document.getElementById(anchor.id)) || sourceFocus;
    prepare(overlays);
    const modal = overlays.querySelector("[data-dialog-content], .static-dialog");
    app.inert = Boolean(modal);
    if (modal) modal.setAttribute("aria-modal", "true");
    if (nestedChoices) {
      for (const child of overlays.children) {
        if (!child.classList.contains("static-popup")) child.inert = true;
      }
    }
    positionPopup(returnFocus, rect);
    if (returnFocus?.isConnected && returnFocus.hasAttribute("aria-haspopup")) {
      returnFocus.setAttribute("aria-expanded", "true");
      returnFocus.dataset.state = "open";
    }
    const focusHost = nestedChoices ? overlays.querySelector(".static-popup") : overlays;
    const first = focusHost.querySelector(
      "input:not([type=hidden]):not([disabled]), textarea, button:not([disabled]), [tabindex='0']"
    );
    (first || modal)?.focus({ preventScroll: true });
  }

  async function showOverlay(name, anchor, nested = false) {
    const ticket = ++transition;
    const html = await template(name);
    if (ticket !== transition) return;
    const previous = nested && overlay ? snapshotOverlay() : previousOverlay;
    previousOverlay = previous;
    mountOverlay(name, html, anchor || returnFocus);
  }

  function make(tag, attributes = {}, text) {
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function showForm(name, anchor, nested = false) {
    transition++;
    const form = forms[name];
    if (!form) throw new Error("Fenetre inconnue : " + name);
    const backdrop = make("div", { class: "static-dialog-backdrop", "data-dialog-overlay": "true" });
    const dialog = make("div", { class: "static-dialog", role: "dialog", "aria-labelledby": "static-dialog-title", tabindex: "-1" });
    const header = make("header");
    header.append(make("h2", { id: "static-dialog-title" }, form.title),
      make("button", { "data-ui": "Close", "aria-label": "Close", type: "button" }, "\u00d7"));
    const section = make("section");
    section.append(make("p", {}, form.description ||
      "Apercu de l'interface uniquement. Les champs ne sont ni envoyes ni enregistres."));
    for (const field of form.fields) {
      const wrapper = make("label", {}, field.label);
      const input = make(field.options ? "select" : field.type === "textarea" ? "textarea" : "input",
        { "aria-label": field.label, autocomplete: "off" });
      if (field.options) {
        for (const option of field.options) input.append(make("option", {}, option));
      } else if (field.type !== "textarea") input.type = field.type || "text";
      if (field.value) input.value = field.value;
      if (field.accept) input.accept = field.accept;
      if (field.type === "number") input.min = "1";
      wrapper.append(input);
      section.append(wrapper);
    }
    const footer = make("footer");
    footer.append(make("button", { "data-ui": "Cancel", type: "button" }, "Cancel"),
      make("button", { "data-ui": "static-confirm", "data-primary": "", type: "button" },
        name === "folder" ? "Choisir (demonstration)" : "Apercu"));
    dialog.append(header, section, footer);
    const previous = nested && overlay ? snapshotOverlay() : null;
    previousOverlay = previous;
    mountOverlay("form:" + name, backdrop.outerHTML + dialog.outerHTML, anchor);
  }

  function choose(anchor, options) {
    transition++;
    const previous = overlay ? snapshotOverlay() : null;
    const popup = make("div", { class: "static-popup", role: "listbox", "aria-label": label(anchor) });
    for (const option of options) popup.append(make("button", { role: "option", type: "button", "data-ui": option }, option));
    previousOverlay = previous;
    mountOverlay("choices", popup.outerHTML, anchor);
    choiceTarget = anchor;
  }

  function setChoice(target, value) {
    if (!target) return;
    if (!target.isConnected) {
      target = document.getElementById(target.id) ||
        [...document.querySelectorAll("[data-ui]")].find(element => element.dataset.ui === target.dataset.ui);
    }
    if (!target) throw new Error("Champ de destination introuvable.");
    const inner = target.querySelector('[class*="_triggerInner_"], [class*="_triggerLabel_"], [class*="_label_"], [class*="_placeholder_"]');
    const text = inner?.querySelector("span:last-child") || inner;
    if (text) text.textContent = value;
    else if (!target.querySelector("svg")) target.textContent = value;
    target.dataset.value = value;
  }

  function controlLabel(element) {
    const labelled = element.getAttribute("aria-labelledby");
    return element.getAttribute("aria-label") ||
      (labelled && document.getElementById(labelled)?.textContent.trim()) ||
      element.parentElement.querySelector("label")?.textContent.trim() || label(element);
  }

  function comboOptions(element) {
    const select = element.parentElement.querySelector("select");
    if (select) return Array.from(select.options, option => option.textContent);
    const key = controlLabel(element);
    return choices[key];
  }

  function setRadio(element) {
    const group = element.closest("[role=radiogroup]") || element.parentElement;
    group.querySelectorAll("[role=radio]").forEach(radio => {
      radio.setAttribute("aria-checked", String(radio === element));
      radio.dataset.active = String(radio === element);
      if (radio !== element) for (const cls of [...radio.classList]) {
        if (cls.startsWith("_active_")) radio.classList.remove(cls);
      }
    });
    const theme = label(element).toLowerCase();
    if (["light", "dark", "midnight"].includes(theme)) document.documentElement.dataset.theme = theme;
  }

  function accordion(element, expanded = element.getAttribute("aria-expanded") !== "true") {
    const section = element.closest('[class*="_container_eh69h_"]');
    const content = section?.querySelector(':scope > [class*="_content_eh69h_"]');
    if (!content) return false;
    element.setAttribute("aria-expanded", String(expanded));
    element.dataset.state = expanded ? "open" : "closed";
    section.dataset.state = element.dataset.state;
    content.dataset.state = element.dataset.state;
    content.hidden = !expanded;
    return true;
  }

  function featureContext(element) {
    return {
      element, action: label(element), role: element.getAttribute("role"),
      app, overlays, label, controlLabel, make, template, prepare, preview, notify,
      showScreen, showOverlay, showForm, closeOverlay, clearOverlay, choose, setChoice,
      get screen() { return screen; },
      get overlay() { return overlay; },
      get returnFocus() { return returnFocus; },
      resetOverlayHistory() { previousOverlay = null; }
    };
  }

  async function activate(element) {
    if (element.disabled || element.getAttribute("aria-disabled") === "true") return;
    const action = label(element);
    const role = element.getAttribute("role");
    const mode = element.dataset.activity;
    if (modes.includes(mode)) return showScreen(mode);
    if (element.closest("[role=menubar]")) return showOverlay("menu:" + action, element);
    if (["Close", "Cancel"].includes(action)) return closeOverlay();
    if (role === "tab") {
      if (overlay.startsWith("settings:") || ["new-profile", "profile-editor", "profile-instruments"].includes(overlay)) {
        return showOverlay("settings:" + action, returnFocus);
      }
      return showScreen(screen.split(":")[0] + ":" + action);
    }
    if (overlay === "choices" || role === "option") {
      const target = choiceTarget || returnFocus;
      const selectedOverlay = overlay;
      closeOverlay();
      if (selectedOverlay === "voice") {
        const parts = action.split(" ");
        return setChoice(target, (parts[0] === "Up" ? "\u2191" : "\u2193") + parts[1]);
      }
      return setChoice(target, action);
    }
    if (overlay === "score-switcher" && ["Full score", "Piano"].includes(action)) {
      const target = returnFocus;
      closeOverlay();
      setChoice(target, action);
      return;
    }
    const context = featureContext(element);
    for (const feature of features) {
      if (!feature.activate) continue;
      const result = feature.activate(context);
      // Only false delegates to the next feature; undefined is a handled action.
      if (result !== false) return result;
    }
    if (role === "radio") return setRadio(element);
    if (element.hasAttribute("aria-expanded") && !element.hasAttribute("aria-haspopup") && accordion(element)) return;
    if (/^(Collapse|Expand) all/.test(action)) {
      const section = element.closest("aside") || element.closest('[role=tabpanel]');
      const buttons = [...section.querySelectorAll('button[class*="_trigger_eh69h_"]')];
      const expanded = buttons.some(button => button.getAttribute("aria-expanded") !== "true");
      for (const button of buttons) accordion(button, expanded);
      return;
    }
    if (action.startsWith("Select score or part:")) return showOverlay("score-switcher", element);
    if (action === "Keyboard Shortcuts" || action.startsWith("Keyboard Shortcuts")) return showOverlay("help", element);
    if (action === "Reset zoom" || /^Zoom (In|Out)$/.test(action)) {
      const zoom = app.querySelector('[aria-label="Reset zoom"]');
      if (zoom) zoom.textContent = action === "Reset zoom" ? "100%" :
        Math.max(10, parseInt(zoom.textContent, 10) + (action === "Zoom In" ? 10 : -10)) + "%";
      return;
    }
    if (action === "Documentation") return showForm("documentation", element, Boolean(overlay && !overlay.startsWith("menu:")));
    if (role === "combobox" || element.hasAttribute("aria-haspopup")) {
      const options = comboOptions(element);
      if (options) return choose(element, options);
      return preview();
    }
    if (element.hasAttribute("aria-pressed")) {
      const active = element.getAttribute("aria-pressed") !== "true";
      element.setAttribute("aria-pressed", String(active));
      element.dataset.active = String(active);
      return;
    }
    return preview();
  }

  function filter(input) {
    const query = input.value.toLocaleLowerCase().trim();
    if (input.matches('[aria-label="Search settings"]')) {
      overlays.querySelectorAll('[role=tab]').forEach(tab => {
        tab.hidden = !tab.textContent.toLocaleLowerCase().includes(query);
      });
    } else if (/Search (instruments|palettes|house style)/i.test(input.getAttribute("aria-label") || input.placeholder)) {
      const host = input.closest("[role=dialog], aside, [role=tabpanel]") || app;
      host.querySelectorAll('[class*="_container_eh69h_"]').forEach(section => {
        const matches = section.textContent.toLocaleLowerCase().includes(query);
        section.hidden = !matches;
        const header = section.querySelector('button[aria-expanded]');
        if (query && matches && header) accordion(header, true);
      });
    }
  }

  document.addEventListener("click", event => {
    if (overlay === "choices" && !event.target.closest(".static-popup")) {
      closeOverlay();
      return;
    }
    if (event.target.matches("input, textarea, select, option")) return;
    const target = event.target.closest("[data-ui], [role=option]");
    if (target) {
      event.preventDefault();
      activate(target).catch(fail);
    } else if (event.target.matches("[data-dialog-overlay], .static-dialog-backdrop") ||
      overlay && !overlays.contains(event.target) && !app.inert) {
      closeOverlay();
    }
  });
  document.addEventListener("contextmenu", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (/^(Augmentation dot|Grace note)/.test(label(button))) {
      event.preventDefault();
      activate(button).catch(fail);
    }
  });
  document.addEventListener("submit", event => {
    event.preventDefault();
    preview();
  });
  document.addEventListener("input", event => {
    const input = event.target;
    if (input.matches("input")) filter(input);
    if (input.matches('[aria-label="Zoom slider"]')) {
      const reset = app.querySelector('[aria-label="Reset zoom"]');
      if (reset) reset.textContent = Math.round(Number(input.value) / 0.331496062992126 * 100) + "%";
    }
    const context = featureContext(input);
    for (const feature of features) feature.input?.(context);
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && overlay) { event.preventDefault(); closeOverlay(); return; }
    if (event.key === "F1") {
      event.preventDefault();
      showOverlay("help", document.activeElement).catch(fail);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      if (["s", "o", "n", "p", ","].includes(key)) {
        event.preventDefault();
        if (key === "s") preview();
        else if (key === "p") showScreen("publish").catch(fail);
        else if (key === ",") showOverlay("settings:Appearance", document.activeElement).catch(fail);
        else if (key === "n") showOverlay("new-project", document.activeElement).catch(fail);
        else showForm("file", document.activeElement);
        return;
      }
    }
    const modal = overlays.querySelector(".static-popup, [data-dialog-content]:not([inert]), .static-dialog:not([inert])");
    if (event.key === "Tab" && modal) {
      const elements = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]):not([type=hidden]), textarea, select, [tabindex="0"], a[href]')]
        .filter(element => element.checkVisibility());
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (first && event.shiftKey && (document.activeElement === first || document.activeElement === modal)) {
        event.preventDefault(); last.focus();
      } else if (last && !event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
    const active = document.activeElement;
    const container = active.closest('[role=menu], [role=listbox], [role=menubar], [role=tablist], [role=radiogroup]');
    if (container && ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      const elements = [...container.querySelectorAll('[data-ui]:not([disabled]):not([aria-disabled=true])')]
        .filter(element => element.checkVisibility());
      if (!elements.length) return;
      event.preventDefault();
      const direction = ["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1;
      const next = event.key === "Home" ? 0 : event.key === "End" ? elements.length - 1 :
        (elements.indexOf(active) + direction + elements.length) % elements.length;
      elements[next].focus();
    }
    if (["Enter", " "].includes(event.key) && active.matches('[data-ui]:not(button):not(a)')) {
      event.preventDefault();
      activate(active).catch(fail);
    }
  });
  window.addEventListener("resize", () => positionPopup(returnFocus));
  window.addEventListener("popstate", () => {
    const name = decodeURIComponent(location.hash.slice(1)) || "write";
    showScreen(name, false).catch(fail);
  });

  async function start() {
    if (location.protocol === "file:") {
      throw new Error("Ouvrez cette page via un serveur HTTP statique, pas en file://.");
    }
    manifest = JSON.parse(await fetchText("./interfaces/manifest.json"));
    const name = decodeURIComponent(location.hash.slice(1)) || "write";
    if (!manifest[name] || manifest[name].kind !== "screen") throw new Error("Ecran inconnu : " + name);
    await showScreen(name, false);
    if (!location.hash) await showOverlay("start", null);
  }
  start().catch(fail);
})();
