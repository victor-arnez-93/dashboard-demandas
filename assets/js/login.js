import { log } from "./logger.js";
import {
  configureAuthPersistence,
  getSupabase,
  isConfigured,
  shouldRememberSession,
} from "./supabase-client.js";

const root = document.documentElement;
const form = document.getElementById("loginForm");
const submit = document.getElementById("loginSubmit");
const message = document.getElementById("loginMessage");
const remember = document.getElementById("rememberSession");

function setMessage(text = "") {
  message.hidden = !text;
  message.textContent = text;
}

function applyTheme(theme) {
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f5f2e9" : "#090d10");
  document.querySelector("#loginThemeButton i").className = `fa-solid ${theme === "light" ? "fa-moon" : "fa-sun"}`;
}

document.getElementById("loginThemeButton")?.addEventListener("click", () => {
  applyTheme(root.dataset.theme === "light" ? "dark" : "light");
});

document.getElementById("togglePassword")?.addEventListener("click", event => {
  const input = document.getElementById("loginPassword");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  event.currentTarget.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
  event.currentTarget.innerHTML = `<i class="fa-regular ${show ? "fa-eye-slash" : "fa-eye"}"></i>`;
});

form?.addEventListener("submit", async event => {
  event.preventDefault();
  setMessage();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  if (!email || !password) return setMessage("Informe o e-mail e a senha.");

  try {
    submit.disabled = true;
    submit.querySelector("span").textContent = "Entrando...";
    configureAuthPersistence(remember.checked);
    const sb = getSupabase();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    log.success("AUTH", "Login concluído.", {
      email,
      manterConectado: remember.checked,
    });
    location.replace("dashboard.html");
  } catch (error) {
    log.error("AUTH", "Falha no login.", error);
    const configError = error.message?.includes("configurado");
    setMessage(configError ? error.message : "E-mail ou senha inválidos. Confira os dados e tente novamente.");
  } finally {
    submit.disabled = false;
    submit.querySelector("span").textContent = "Entrar no sistema";
  }
});

async function boot() {
  log.boot();
  applyTheme(root.dataset.theme);
  remember.checked = shouldRememberSession();
  if (!isConfigured()) {
    setMessage("Conecte este projeto ao Supabase preenchendo assets/js/env.js.");
    log.warn("CONFIG", "Credenciais públicas do Supabase pendentes.");
    return;
  }

  // Só restaura automaticamente quando o usuário escolheu manter a sessão.
  if (!shouldRememberSession()) return;

  try {
    const { data } = await getSupabase().auth.getSession();
    if (data.session) location.replace("dashboard.html");
  } catch (error) {
    log.error("AUTH", "Não foi possível verificar a sessão.", error);
  }
}

boot();
