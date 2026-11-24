"use strict";

(() => {
  const routes = [];
  const dispatchers = new WeakMap();

  function add(target, eventType, name, handler, matches = null, handlerName = handler.name || name) {
    if (!target || typeof target.addEventListener !== "function") {
      throw new TypeError("Une cible d'événement valide est requise.");
    }
    if (typeof handler !== "function") {
      throw new TypeError("Le gestionnaire d'action doit être une fonction.");
    }

    let targetDispatchers = dispatchers.get(target);
    if (!targetDispatchers) {
      targetDispatchers = new Map();
      dispatchers.set(target, targetDispatchers);
    }

    routes.push({ target, eventType, name, handler, matches, handlerName });

    if (!targetDispatchers.has(eventType)) {
      const dispatcher = event => {
        routes
          .filter(route => route.target === target && route.eventType === eventType)
          .forEach(route => {
            if (!route.matches || route.matches(event)) {
              route.handler.call(target, event);
            }
          });
      };
      targetDispatchers.set(eventType, dispatcher);
      target.addEventListener(eventType, dispatcher);
    }
  }

  function addMessages(target, channel, messageRoutes, handlers) {
    messageRoutes.forEach(route => {
      if (typeof route.message !== "string" || typeof route.handler !== "string" ||
          !handlers || !Object.prototype.hasOwnProperty.call(handlers, route.handler) ||
          typeof handlers[route.handler] !== "function") {
        throw new TypeError("Chaque route doit définir un message et le nom d'un gestionnaire existant.");
      }

      const handler = handlers[route.handler];
      const messageDetails = route.data ? " " + JSON.stringify(route.data) : "";
      add(
        target,
        "message",
        route.message + messageDetails,
        event => handler(event, event.data),
        event => {
          const message = event.data;
          return Boolean(message && message.channel === channel &&
            message.type === route.message &&
            (!route.source || event.source === route.source) &&
            Object.entries(route.data || {}).every(([key, value]) => message[key] === value) &&
            Object.entries(route.types || {}).every(([key, type]) => typeof message[key] === type));
        },
        route.handler
      );
    });
  }

  function list() {
    return routes.map(route => ({
      event: route.eventType,
      action: route.name,
      handler: route.handlerName
    }));
  }

  window.ButtonActionList = Object.freeze({ add, addMessages, list });
})();
