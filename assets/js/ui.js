import { state, effectiveStatus, demandCode, converterCode } from "./store.js";

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function slug(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function formatDate(value, { year = false, long = false } = {}) {
  if (!value) return "—";
  const options = long
    ? { day: "2-digit", month: "long", year: "numeric" }
    : { day: "2-digit", month: "short", year: year ? "numeric" : undefined };
  return new Intl.DateTimeFormat("pt-BR", options)
    .format(new Date(`${value}T12:00:00`))
    .replaceAll(".", "");
}

export function formatHours(value) {
  return `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
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
  document.querySelectorAll("[data-app-name]").forEach(el => { el.textContent = settings.app_name; });
  document.querySelectorAll("[data-app-subtitle]").forEach(el => { el.textContent = settings.app_subtitle; });
  document.title = `${settings.app_name} — ${document.body.dataset.pageLabel || settings.app_subtitle}`;
  ["headerUserName", "menuUserName", "welcomeName"].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.textContent = profile.full_name;
  });
  const role = document.getElementById("headerUserRole");
  if (role) role.textContent = profile.role || "Gestão de Demandas";
  const email = document.getElementById("menuUserEmail");
  if (email) email.textContent = state.user.email || "—";
  applyAvatar(profile.avatar_url, profile.full_name);
}

export function applyAvatar(url, name) {
  ["headerAvatar", "menuAvatar", "settingsAvatar"].forEach(id => {
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
    } else {
      current.textContent = initials(name);
    }
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
  if (![...document.querySelectorAll(".modal-layer")].some(item => !item.hidden)) {
    document.body.classList.remove("modal-open");
  }
}

export function statusClass(status) {
  const map = {
    "Pendente": "status-pendente",
    "Em andamento": "status-andamento",
    "Aguardando retorno": "status-retorno",
    "Concluída": "status-concluida",
    "Concluído": "status-concluida",
    "Atrasada": "status-atrasada",
    "Cancelada": "status-cancelada",
    "Cancelado": "status-cancelada",
  };
  return map[status] || "status-pendente";
}

export function priorityClass(priority) {
  return `priority-${slug(priority)}`;
}

export function demandCell(demand) {
  return `<div class="demand-cell"><i class="fa-regular fa-file-lines"></i><span><strong>${escapeHtml(demand.title)}</strong><small>${demandCode(demand)} · Entrada em ${formatDate(demand.start_date)}</small></span></div>`;
}

export function renderDemandDetail(demand) {
  const code = document.getElementById("detailCode");
  const title = document.getElementById("detailTitle");
  const content = document.getElementById("demandDetailContent");
  if (!code || !title || !content) return;
  code.textContent = demandCode(demand);
  title.textContent = demand.title;
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
    ["Horas estimadas", formatHours(demand.estimated_hours)],
    ["Horas realizadas", formatHours(demand.actual_hours)],
    ["Descrição", demand.description, true],
    ["Observações", demand.notes || "—", true],
    ["Tags", (demand.tags || []).join(", ") || "—", true],
  ];
  content.innerHTML = cells.map(([label, value, full]) =>
    `<div class="detail-block ${full ? "full" : ""}"><small>${escapeHtml(label)}</small>${full ? `<p>${escapeHtml(value)}</p>` : `<strong>${escapeHtml(value)}</strong>`}</div>`
  ).join("");
  const edit = document.getElementById("detailEditButton");
  if (edit) edit.dataset.id = demand.id;
  openModal("demandDetailModal");
}

export function renderConverterDetail(record) {
  const code = document.getElementById("converterDetailCode");
  const content = document.getElementById("converterDetailContent");
  if (!code || !content) return;
  code.textContent = converterCode(record);
  const cells = [
    ["Data", formatDate(record.service_date, { year: true })],
    ["Local", record.location_name],
    ["Ponto / referência", record.point_reference || "—"],
    ["Atendimento", record.service_type],
    ["Conversão", record.conversion_direction || "—"],
    ["Quantidade", String(record.quantity_replaced || 0)],
    ["Status", record.status],
    ["Responsável", record.responsible_name || "—"],
    ["Motivo", record.issue_reason || "—", true],
    ["Observações", record.notes || "—", true],
  ];
  content.innerHTML = cells.map(([label, value, full]) =>
    `<div class="detail-block ${full ? "full" : ""}"><small>${escapeHtml(label)}</small>${full ? `<p>${escapeHtml(value)}</p>` : `<strong>${escapeHtml(value)}</strong>`}</div>`
  ).join("");
  const edit = document.getElementById("converterDetailEditButton");
  if (edit) edit.dataset.id = record.id;
  openModal("converterDetailModal");
}

export function initClock() {
  const update = () => {
    const now = new Date();
    const time = document.getElementById("currentTime");
    const date = document.getElementById("currentDate");
    if (time) time.textContent = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
    if (date) date.textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).format(now).replaceAll(".", "");
    const hour = now.getHours();
    const greeting = document.getElementById("greeting");
    const welcomeDate = document.getElementById("welcomeDate");
    if (greeting) greeting.textContent = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
    if (welcomeDate) welcomeDate.textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(now);
  };
  update();
  setInterval(update, 30000);
}

export function confirmAction({ title, text, confirmLabel = "Confirmar", danger = true }) {
  return new Promise(resolve => {
    const modal = document.getElementById("confirmModal");
    if (!modal) return resolve(false);
    document.getElementById("confirmTitle").textContent = title;
    document.getElementById("confirmText").textContent = text;
    const button = document.getElementById("confirmActionButton");
    button.textContent = confirmLabel;
    button.className = danger ? "btn-danger" : "btn-primary";
    const cleanup = result => {
      closeModal("confirmModal");
      button.removeEventListener("click", onConfirm);
      modal.removeEventListener("click", onCancel);
      resolve(result);
    };
    const onConfirm = () => cleanup(true);
    const onCancel = event => {
      if (event.target.closest("[data-close-modal='confirmModal']")) cleanup(false);
    };
    button.addEventListener("click", onConfirm);
    modal.addEventListener("click", onCancel);
    openModal("confirmModal");
  });
}
