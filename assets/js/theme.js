import { APP_CONFIG } from "./config.js";

const root = document.documentElement;

function updateButton(theme) {
  const button = document.getElementById("themeButton");
  if (!button) return;
  const light = theme === "light";
  button.setAttribute("aria-pressed", String(light));
  button.setAttribute("aria-label", light ? "Ativar tema escuro" : "Ativar tema claro");
  button.innerHTML = `<i class="fa-solid ${light ? "fa-moon" : "fa-sun"}"></i>`;
}

export function applyTheme(theme, notify = true) {
  const selected = theme === "light" ? "light" : "dark";
  root.dataset.theme = selected;
  localStorage.setItem(APP_CONFIG.themeKey, selected);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", selected === "light" ? "#f3f5fa" : "#080b14");
  updateButton(selected);
  dispatchEvent(new CustomEvent("dashboard:themechange", { detail:{ theme:selected, notify } }));
}

export function toggleTheme() {
  applyTheme(root.dataset.theme === "light" ? "dark" : "light");
}

export function initTheme() {
  updateButton(root.dataset.theme);
  document.getElementById("themeButton")?.addEventListener("click", toggleTheme);
  document.getElementById("settingsThemeButton")?.addEventListener("click", toggleTheme);
}
