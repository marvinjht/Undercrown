// Boot. Waits for fonts (so the arena text renders with them) then starts the UI.
window.G = window.G || {};
(function (G) {
  function start() { G.UI.init(); }
  if (document.fonts && document.fonts.ready) {
    Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1200))]).then(start);
  } else start();
})(window.G);
