(() => {
  "use strict";

  const THEME_KEY = "fluux-landing-theme";

  const root = document.documentElement;
  const header = document.getElementById("landingHeader");
  const nav = document.getElementById("landingNav");
  const menuButton = document.getElementById("landingMenuButton");
  const themeButton = document.getElementById("landingThemeButton");

  function setTheme(theme) {
    root.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "light" ? "#f4f1e8" : "#090d10");

    if (themeButton) {
      themeButton.innerHTML = `<i class="fa-solid ${theme === "light" ? "fa-moon" : "fa-sun"}"></i>`;
      themeButton.setAttribute(
        "aria-label",
        theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"
      );
    }
  }

  function closeMobileMenu() {
    nav?.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");

    if (menuButton) {
      menuButton.innerHTML = '<i class="fa-solid fa-bars"></i>';
    }
  }

  function bindNavigation() {
    menuButton?.addEventListener("click", () => {
      const opening = !nav?.classList.contains("open");

      nav?.classList.toggle("open", opening);
      menuButton.setAttribute("aria-expanded", String(opening));
      menuButton.innerHTML = `<i class="fa-solid ${opening ? "fa-xmark" : "fa-bars"}"></i>`;
    });

    nav?.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", closeMobileMenu);
    });

    document.addEventListener("click", event => {
      if (!event.target.closest(".header-inner")) {
        closeMobileMenu();
      }
    });
  }

  function bindFaq() {
    document.querySelectorAll(".faq-list details").forEach(detail => {
      detail.addEventListener("toggle", () => {
        if (!detail.open) return;

        document.querySelectorAll(".faq-list details").forEach(other => {
          if (other !== detail) {
            other.open = false;
          }
        });
      });
    });
  }

  function initializeReveal() {
    const items = document.querySelectorAll(".reveal");

    if (!("IntersectionObserver" in window)) {
      items.forEach(item => item.classList.add("visible"));
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;

          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.12,
        rootMargin: "0px 0px -40px"
      }
    );

    items.forEach(item => observer.observe(item));
  }

  function initializeHeader() {
    const update = () => {
      header?.classList.toggle("scrolled", window.scrollY > 18);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
  }

  setTheme(root.dataset.theme === "light" ? "light" : "dark");

  themeButton?.addEventListener("click", () => {
    setTheme(root.dataset.theme === "light" ? "dark" : "light");
  });

  bindNavigation();
  bindFaq();
  initializeReveal();
  initializeHeader();
})();
