(() => {
  "use strict";

  const PRELOGIN_KEY = "fluux-prelogin-authorized";
  const PRELOGIN_EMAIL = "admin@sistema.com";
  const PRELOGIN_PASSWORD = "adminadmin123";
  const THEME_KEY = "fluux-landing-theme";

  const root = document.documentElement;
  const body = document.body;
  const header = document.getElementById("landingHeader");
  const nav = document.getElementById("landingNav");
  const menuButton = document.getElementById("landingMenuButton");
  const themeButton = document.getElementById("landingThemeButton");
  const modal = document.getElementById("accessModal");
  const form = document.getElementById("preLoginForm");
  const emailInput = document.getElementById("preLoginEmail");
  const passwordInput = document.getElementById("preLoginPassword");
  const message = document.getElementById("preLoginMessage");
  const submit = document.getElementById("preLoginSubmit");
  const togglePassword = document.getElementById("preLoginTogglePassword");

  function setTheme(theme) {
    root.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f4f1e8" : "#090d10");
    if (themeButton) {
      themeButton.innerHTML = `<i class="fa-solid ${theme === "light" ? "fa-moon" : "fa-sun"}"></i>`;
      themeButton.setAttribute("aria-label", theme === "light" ? "Ativar tema escuro" : "Ativar tema claro");
    }
  }

  function setMessage(text = "") {
    if (!message) return;
    message.hidden = !text;
    message.textContent = text;
  }

  function openAccessModal() {
    if (!modal) return;
    setMessage();
    modal.hidden = false;
    body.classList.add("modal-open");
    window.setTimeout(() => {
      emailInput?.focus();
      emailInput?.select();
    }, 60);
  }

  function closeAccessModal() {
    if (!modal) return;
    modal.hidden = true;
    body.classList.remove("modal-open");
    setMessage();
  }

  function closeMobileMenu() {
    nav?.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
    if (menuButton) menuButton.innerHTML = '<i class="fa-solid fa-bars"></i>';
  }

  function bindNavigation() {
    menuButton?.addEventListener("click", () => {
      const opening = !nav?.classList.contains("open");
      nav?.classList.toggle("open", opening);
      menuButton.setAttribute("aria-expanded", String(opening));
      menuButton.innerHTML = `<i class="fa-solid ${opening ? "fa-xmark" : "fa-bars"}"></i>`;
    });

    nav?.querySelectorAll("a").forEach(link => link.addEventListener("click", closeMobileMenu));

    document.addEventListener("click", event => {
      if (!event.target.closest(".header-inner")) closeMobileMenu();
    });
  }

  function bindAccessModal() {
    document.querySelectorAll("[data-open-access]").forEach(button => button.addEventListener("click", openAccessModal));
    document.querySelectorAll("[data-close-access]").forEach(button => button.addEventListener("click", closeAccessModal));

    togglePassword?.addEventListener("click", () => {
      const showing = passwordInput.type === "password";
      passwordInput.type = showing ? "text" : "password";
      togglePassword.setAttribute("aria-label", showing ? "Ocultar senha" : "Mostrar senha");
      togglePassword.innerHTML = `<i class="fa-regular ${showing ? "fa-eye-slash" : "fa-eye"}"></i>`;
    });

    form?.addEventListener("submit", event => {
      event.preventDefault();
      setMessage();

      const email = emailInput.value.trim().toLowerCase();
      const password = passwordInput.value;

      if (!email || !password) {
        setMessage("Informe o e-mail e a senha de acesso.");
        return;
      }

      if (email !== PRELOGIN_EMAIL || password !== PRELOGIN_PASSWORD) {
        setMessage("Credencial de entrada inválida. Confira os dados e tente novamente.");
        passwordInput.focus();
        passwordInput.select();
        return;
      }

      submit.disabled = true;
      submit.querySelector("span").textContent = "Acesso validado";
      sessionStorage.setItem(PRELOGIN_KEY, "1");
      window.setTimeout(() => location.assign("login.html"), 280);
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !modal?.hidden) closeAccessModal();
    });
  }

  function bindFaq() {
    document.querySelectorAll(".faq-list details").forEach(detail => {
      detail.addEventListener("toggle", () => {
        if (!detail.open) return;
        document.querySelectorAll(".faq-list details").forEach(other => {
          if (other !== detail) other.open = false;
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

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px" });

    items.forEach(item => observer.observe(item));
  }

  function initializeHeader() {
    const update = () => header?.classList.toggle("scrolled", window.scrollY > 18);
    update();
    window.addEventListener("scroll", update, { passive: true });
  }

  setTheme(root.dataset.theme === "light" ? "light" : "dark");
  themeButton?.addEventListener("click", () => setTheme(root.dataset.theme === "light" ? "dark" : "light"));

  bindNavigation();
  bindAccessModal();
  bindFaq();
  initializeReveal();
  initializeHeader();

  if (location.hash === "#entrar") openAccessModal();
})();
