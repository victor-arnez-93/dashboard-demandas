import { log } from "./logger.js";
import { configureAuthPersistence, getSupabase, isConfigured, shouldRememberSession } from "./supabase-client.js";

const PRELOGIN_KEY = "fluux-prelogin-authorized";
const preLoginAuthorized = sessionStorage.getItem(PRELOGIN_KEY) === "1";

if (!preLoginAuthorized) {
  location.replace("index.html#entrar");
}

if (preLoginAuthorized) {
const root = document.documentElement;
const form = document.getElementById("loginForm");
const submit = document.getElementById("loginSubmit");
const message = document.getElementById("loginMessage");
const remember = document.getElementById("rememberSession");

function setMessage(text = "") {
  message.hidden = !text;
  message.textContent = text;
}

function applyLoginTheme(theme) {
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f4f1e8" : "#090d10");
  document.querySelector("#loginThemeButton i").className = `fa-solid ${theme === "light" ? "fa-moon" : "fa-sun"}`;
}

document.getElementById("loginThemeButton")?.addEventListener("click", () => {
  applyLoginTheme(root.dataset.theme === "light" ? "dark" : "light");
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
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) throw error;
    log.success("AUTH", "Login concluído.", { email, manterConectado: remember.checked });
    location.replace("inicio.html");
  } catch (error) {
    log.error("AUTH", "Falha no login.", error);
    setMessage(error.message?.includes("configurado") ? error.message : "E-mail ou senha inválidos. Confira os dados e tente novamente.");
  } finally {
    submit.disabled = false;
    submit.querySelector("span").textContent = "Entrar no sistema";
  }
});

async function boot() {
  log.boot();
  applyLoginTheme(root.dataset.theme);
  remember.checked = shouldRememberSession();
  if (!isConfigured()) {
    setMessage("Conecte este projeto ao Supabase preenchendo assets/js/env.js.");
    return;
  }
  if (!shouldRememberSession()) return;
  try {
    const { data } = await getSupabase().auth.getSession();
    if (data.session) location.replace("inicio.html");
  } catch (error) {
    log.error("AUTH", "Não foi possível verificar a sessão.", error);
  }
}
boot();
}
