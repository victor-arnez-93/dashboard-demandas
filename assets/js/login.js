import { log } from "./logger.js";
import {
  clearStoredAuthSessions,
  configureAuthPersistence,
  getSupabase,
  isConfigured,
  shouldRememberSession
} from "./supabase-client.js";

const root = document.documentElement;
const form = document.getElementById("loginForm");
const submit = document.getElementById("loginSubmit");
const message = document.getElementById("loginMessage");
const remember = document.getElementById("rememberSession");
const themeButton = document.getElementById("loginThemeButton");
const togglePasswordButton = document.getElementById("togglePassword");
const emailInput = document.getElementById("loginEmail");
const passwordInput = document.getElementById("loginPassword");

function setMessage(text = "") {
  if (!message) return;

  message.hidden = !text;
  message.textContent = text;
}

function applyLoginTheme(theme) {
  const selectedTheme = theme === "light" ? "light" : "dark";

  root.dataset.theme = selectedTheme;

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      selectedTheme === "light" ? "#f4f1e8" : "#090d10"
    );

  const icon = themeButton?.querySelector("i");

  if (icon) {
    icon.className = `fa-solid ${
      selectedTheme === "light" ? "fa-moon" : "fa-sun"
    }`;
  }

  themeButton?.setAttribute(
    "aria-label",
    selectedTheme === "light"
      ? "Ativar tema escuro"
      : "Ativar tema claro"
  );
}

themeButton?.addEventListener("click", () => {
  const nextTheme = root.dataset.theme === "light" ? "dark" : "light";

  applyLoginTheme(nextTheme);
  localStorage.setItem("fluux-landing-theme", nextTheme);
});

togglePasswordButton?.addEventListener("click", event => {
  if (!passwordInput) return;

  const showPassword = passwordInput.type === "password";

  passwordInput.type = showPassword ? "text" : "password";

  event.currentTarget.setAttribute(
    "aria-label",
    showPassword ? "Ocultar senha" : "Mostrar senha"
  );

  event.currentTarget.innerHTML = `
    <i class="fa-regular ${
      showPassword ? "fa-eye-slash" : "fa-eye"
    }"></i>
  `;
});

form?.addEventListener("submit", async event => {
  event.preventDefault();
  setMessage();

  const email = emailInput?.value.trim() || "";
  const password = passwordInput?.value || "";

  if (!email || !password) {
    setMessage("Informe o e-mail e a senha.");
    return;
  }

  try {
    if (submit) {
      submit.disabled = true;

      const submitText = submit.querySelector("span");

      if (submitText) {
        submitText.textContent = "Entrando...";
      }
    }

    configureAuthPersistence(Boolean(remember?.checked));

    const { error } = await getSupabase().auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw error;
    }

    log.success("AUTH", "Login concluído.", {
      email,
      manterConectado: Boolean(remember?.checked)
    });

    location.replace("inicio.html");
  } catch (error) {
    log.error("AUTH", "Falha no login.", error);

    setMessage(
      error.message?.includes("configurado")
        ? error.message
        : "E-mail ou senha inválidos. Confira os dados e tente novamente."
    );
  } finally {
    if (submit) {
      submit.disabled = false;

      const submitText = submit.querySelector("span");

      if (submitText) {
        submitText.textContent = "Entrar no sistema";
      }
    }
  }
});

async function boot() {
  log.boot();

  const savedTheme =
    localStorage.getItem("fluux-landing-theme") ||
    root.dataset.theme ||
    "dark";

  applyLoginTheme(savedTheme);

  if (remember) {
    remember.checked = false;
  }

  if (!isConfigured()) {
    setMessage(
      "Conecte este projeto ao Supabase preenchendo assets/js/env.js."
    );
    return;
  }

  if (!shouldRememberSession()) {
    return;
  }

  try {
    const { data, error } = await getSupabase().auth.getSession();

    if (error) {
      throw error;
    }

    if (!data.session) {
      clearStoredAuthSessions();
      return;
    }

    if (remember) {
      remember.checked = true;
    }

    location.replace("inicio.html");
  } catch (error) {
    log.error(
      "AUTH",
      "Não foi possível verificar a sessão.",
      error
    );
  }
}

boot();
