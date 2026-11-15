// -------------------------------------------------- // ZOOM // --------------------------------------------------
function setZoom(value) {
  zoom = Math.max(0.4, Math.min(2.5, value));
  osmd.Zoom = zoom;
  osmd.render();
  document.getElementById("zoomInfo").textContent =
    Math.round(zoom * 100) + " %";
  setTimeout(() => {
    pages = Array.from(container.querySelectorAll("svg"));
    updatePage();
  }, 200);
}
document
  .getElementById("zoomIn")
  .addEventListener("click", () => setZoom(zoom + 0.1));
document
  .getElementById("zoomOut")
  .addEventListener("click", () => setZoom(zoom - 0.1)); // Zoom avec Ctrl + molette
document.getElementById("scoreContainer").addEventListener(
  "wheel",
  function (e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(zoom + (e.deltaY < 0 ? 0.1 : -0.1));
  },
  { passive: false },
); // -------------------------------------------------- // AFFICHAGE PLEIN ÉCRAN // --------------------------------------------------
document.getElementById("fullscreen").addEventListener("click", async () => {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
});
