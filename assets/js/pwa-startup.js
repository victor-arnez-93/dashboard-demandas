(() => {
  const standalone = navigator.standalone === true ||
    matchMedia("(display-mode: standalone), (display-mode: minimal-ui)").matches;
  if (!standalone) return;

  const loginEntry = document.currentScript.dataset.entry === "login";
  if (!loginEntry) {
    try {
      const key = "fluux-pwa-startup";
      const continuing = sessionStorage.getItem(key) === "1";
      sessionStorage.removeItem(key);
      if (!continuing) return;
    } catch {
      return;
    }
  }

  const root = document.documentElement;
  root.dataset.pwaStarting = "";

  const artwork = document.createElement("link");
  artwork.rel = "preload";
  artwork.as = "image";
  artwork.href = "assets/img/pwa/fluux-splash.webp";
  document.head.append(artwork);

  function finish() {
    delete root.dataset.pwaStarting;
  }

  // Release the artwork if a resource fails before the page's boot script runs.
  setTimeout(finish, 8000);
  window.addEventListener("pageshow", event => {
    if (event.persisted) finish();
  });
})();
