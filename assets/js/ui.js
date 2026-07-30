import { state, effectiveStatus, demandCode } from "./store.js";

export const VIEW_LABELS = {
  dashboard: "Início",
  "nova-demanda": "Nova demanda",
  demandas: "Demandas",
  analises: "Análises",
  relatorios: "Relatórios",
  configuracoes: "Configurações",
};

export function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function slug(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function formatDate(value, options = {}) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: options.year ? "numeric" : undefined }).format(new Date(`${value}T12:00:00`)).replaceAll(".", "");
}

export function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "FG";
}

export function showToast(message, type = "info") {
  const region = document.getElementById("toastRegion");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icon = type === "success" ? "fa-circle-check" : type === "error" ? "fa-circle-exclamation" : "fa-circle-info";
  toast.innerHTML = `<i class="fa-solid ${icon}"></i><p>${escapeHtml(message)}</p><button type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>`;
  const close = () => toast.remove();
  toast.querySelector("button").addEventListener("click", close);
  region.appendChild(toast);
  setTimeout(close, 4200);
}

export function setActiveView(view, focus = true) {
  if (!VIEW_LABELS[view]) view = "dashboard";
  document.querySelectorAll("[data-view-panel]").forEach(panel => {
    const active = panel.dataset.viewPanel === view;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
  document.querySelectorAll("[data-view]").forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    active ? button.setAttribute("aria-current", "page") : button.removeAttribute("aria-current");
  });
  document.getElementById("currentViewLabel").textContent = VIEW_LABELS[view];
  document.getElementById("appShell").classList.remove("sidebar-mobile-open");
  document.getElementById("sidebarBackdrop").hidden = true;
  history.replaceState(null, "", view === "dashboard" ? "#inicio" : `#${view}`);
  if (focus) {
    document.getElementById("mainContent")?.focus({ preventScroll: true });
    scrollTo({ top: 0, behavior: "smooth" });
  }
  dispatchEvent(new CustomEvent("fluux:viewchange", { detail: { view } }));
}

export function applyTheme(theme) {
  const selected = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = selected;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", selected === "light" ? "#f4f1e8" : "#090d10");
  const icon = document.querySelector("#themeButton i");
  if (icon) icon.className = `fa-solid ${selected === "light" ? "fa-moon" : "fa-sun"}`;
  dispatchEvent(new CustomEvent("fluux:themechange", { detail: { theme: selected } }));
}

export function applyIdentity() {
  const profile = state.profile;
  const settings = state.settings;
  document.querySelectorAll("[data-app-name]").forEach(el => el.textContent = settings.app_name);
  document.querySelectorAll("[data-app-subtitle]").forEach(el => el.textContent = settings.app_subtitle);
  document.title = `${settings.app_name} — ${settings.app_subtitle}`;
  ["headerUserName", "menuUserName", "welcomeName"].forEach(id => document.getElementById(id).textContent = profile.full_name);
  document.getElementById("headerUserRole").textContent = profile.role || "Gestão de Demandas";
  document.getElementById("menuUserEmail").textContent = state.user.email || "—";
  applyAvatar(profile.avatar_url, profile.full_name);
}

export function applyAvatar(url, name) {
  const ids = ["headerAvatar", "menuAvatar", "settingsAvatar"];
  ids.forEach(id => {
    const current = document.getElementById(id);
    if (!current) return;
    if (url) {
      const img = document.createElement("img");
      img.id = id;
      img.className = current.className;
      img.src = url;
      img.alt = `Foto de ${name}`;
      current.replaceWith(img);
    } else if (current.tagName === "IMG") {
      const span = document.createElement("span");
      span.id = id;
      span.className = current.className;
      span.textContent = initials(name);
      current.replaceWith(span);
    } else current.textContent = initials(name);
  });
}

export function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  setTimeout(() => modal.querySelector("button,input,select,textarea")?.focus(), 20);
}

export function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.hidden = true;
  if (![...document.querySelectorAll(".modal-layer")].some(item => !item.hidden)) document.body.classList.remove("modal-open");
}

export function renderDemandDetail(demand) {
  document.getElementById("detailCode").textContent = demandCode(demand);
  document.getElementById("detailTitle").textContent = demand.title;
  const cells = [
    ["Status", effectiveStatus(demand)],
    ["Prioridade", demand.priority],
    ["Gestor", demand.manager || "Gestor não informado"],
    ["Responsável", demand.responsible],
    ["Solicitante", demand.requester || "—"],
    ["Categoria", demand.category],
    ["Departamento", demand.department || "—"],
    ["Entrada", formatDate(demand.start_date, { year: true })],
    ["Prazo", formatDate(demand.due_date, { year: true })],
    ["Horas estimadas", `${Number(demand.estimated_hours || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`],
    ["Horas realizadas", `${Number(demand.actual_hours || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`],
    ["Descrição", demand.description, true],
    ["Observações", demand.notes || "—", true],
    ["Tags", (demand.tags || []).join(", ") || "—", true],
  ];
  document.getElementById("demandDetailContent").innerHTML = cells.map(([label, value, full]) =>
    `<div class="detail-block ${full ? "full" : ""}"><small>${escapeHtml(label)}</small>${full ? `<p>${escapeHtml(value)}</p>` : `<strong>${escapeHtml(value)}</strong>`}</div>`
  ).join("");
  document.getElementById("detailEditButton").dataset.id = demand.id;
  openModal("demandDetailModal");
}

export function initClock() {
  const update = () => {
    const now = new Date();
    document.getElementById("currentTime").textContent = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
    document.getElementById("currentDate").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).format(now).replaceAll(".", "");
    const hour = now.getHours();
    document.getElementById("greeting").textContent = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
    document.getElementById("welcomeDate").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(now);
  };
  update();
  setInterval(update, 30000);
}
