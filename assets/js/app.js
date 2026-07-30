import { log } from "./logger.js";
import { getSupabase, requireSession } from "./supabase-client.js";
import {
  state, initializeStore, demandCode, effectiveStatus, saveDemand, removeDemand,
  saveProfile, saveSettings, uploadAvatar,
} from "./store.js";
import {
  VIEW_LABELS, escapeHtml, slug, formatDate, showToast, setActiveView, applyTheme,
  applyIdentity, applyAvatar, openModal, closeModal, renderDemandDetail, initClock,
} from "./ui.js";
import { periodDemands, renderDashboardCharts, renderAnalysisCharts, redrawCharts } from "./charts.js";
import { closeWeather, initializeWeather, openWeather } from "./weather.js";
import { initReports, renderReport } from "./reports.js";

let dashboardPeriod = 30;
let confirmCallback = null;
let settingsEditing = false;

const managerName = demand => demand.manager?.trim() || "Gestor não informado";
const formatHours = value => `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;

function emptyRow(columns, text) {
  return `<tr><td class="empty-table" colspan="${columns}">${escapeHtml(text)}</td></tr>`;
}

function demandRow(demand, compact = false) {
  const status = effectiveStatus(demand);
  const demandCell = `<button class="demand-cell text-btn" type="button" data-action="view" data-id="${demand.id}">
    <i class="fa-regular fa-file-lines"></i><span><strong title="${escapeHtml(demand.title)}">${escapeHtml(demand.title)}</strong><small>${demandCode(demand)} · Entrada em ${formatDate(demand.start_date)}</small></span>
  </button>`;
  const priorityBadge = `<span class="badge ${slug(demand.priority)}">${escapeHtml(demand.priority)}</span>`;
  const statusBadge = `<span class="badge ${slug(status)}">${escapeHtml(status)}</span>`;
  if (compact) return `<tr><td>${demandCell}</td><td>${escapeHtml(managerName(demand))}</td><td>${priorityBadge}</td><td>${formatDate(demand.due_date)}</td><td>${statusBadge}</td></tr>`;
  return `<tr>
    <td>${demandCode(demand)}</td><td>${demandCell}</td><td>${escapeHtml(managerName(demand))}</td><td>${escapeHtml(demand.responsible)}</td><td>${escapeHtml(demand.category)}</td>
    <td>${priorityBadge}</td><td>${formatDate(demand.due_date)}</td><td>${statusBadge}</td>
    <td><div class="row-actions"><button type="button" data-action="view" data-id="${demand.id}" title="Ver"><i class="fa-regular fa-eye"></i></button><button type="button" data-action="edit" data-id="${demand.id}" title="Editar"><i class="fa-solid fa-pen"></i></button><button class="delete" type="button" data-action="delete" data-id="${demand.id}" title="Excluir"><i class="fa-regular fa-trash-can"></i></button></div></td>
  </tr>`;
}

function renderDashboard() {
  const demands = periodDemands(dashboardPeriod);
  const progress = demands.filter(item => effectiveStatus(item) === "Em andamento").length;
  const done = demands.filter(item => effectiveStatus(item) === "Concluída").length;
  const overdue = demands.filter(item => effectiveStatus(item) === "Atrasada").length;
  document.getElementById("kpiTotal").textContent = demands.length;
  document.getElementById("kpiProgress").textContent = progress;
  document.getElementById("kpiDone").textContent = done;
  document.getElementById("kpiOverdue").textContent = overdue;
  document.getElementById("kpiProgressText").textContent = `${Math.round(progress / Math.max(demands.length, 1) * 100)}% do total`;
  document.getElementById("kpiDoneText").textContent = `${Math.round(done / Math.max(demands.length, 1) * 100)}% do total`;
  document.getElementById("navDemandCount").textContent = state.demands.length;
  const estimatedHours = demands.reduce((total, item) => total + Number(item.estimated_hours || 0), 0);
  const actualHours = demands.reduce((total, item) => total + Number(item.actual_hours || 0), 0);
  const difference = actualHours - estimatedHours;
  const rate = estimatedHours > 0 ? actualHours / estimatedHours * 100 : actualHours > 0 ? 100 : 0;
  document.getElementById("dashboardEstimatedHours").textContent = formatHours(estimatedHours);
  document.getElementById("dashboardActualHours").textContent = formatHours(actualHours);
  document.getElementById("dashboardHoursDifference").textContent = `${difference > 0 ? "+" : ""}${formatHours(difference)}`;
  document.getElementById("dashboardHoursRate").textContent = `${Math.round(rate)}%`;
  document.getElementById("dashboardHoursProgress").style.width = `${Math.min(rate, 100)}%`;
  const hoursStatus = document.getElementById("hoursStatus");
  const status = estimatedHours === 0 && actualHours > 0 ? ["Horas realizadas sem estimativa", "over", "fa-triangle-exclamation"] :
    estimatedHours === 0 ? ["Sem horas registradas", "neutral", "fa-gauge-high"] :
    rate > 100 ? [`${Math.round(rate - 100)}% acima da estimativa`, "over", "fa-triangle-exclamation"] :
    rate >= 85 ? ["Próximo da estimativa", "near", "fa-clock"] :
    ["Dentro da estimativa", "ok", "fa-circle-check"];
  hoursStatus.className = `hours-status ${status[1]}`;
  hoursStatus.innerHTML = `<i class="fa-solid ${status[2]}"></i> ${status[0]}`;
  const recent = state.demands.slice(0, 6);
  document.getElementById("recentDemandsBody").innerHTML = recent.length ? recent.map(item => demandRow(item, true)).join("") : emptyRow(5, "Nenhuma demanda cadastrada. Use “Nova demanda” para começar.");
  renderDashboardCharts(dashboardPeriod);
}

function filteredDemands() {
  const search = document.getElementById("demandSearch").value.trim().toLocaleLowerCase("pt-BR");
  const status = document.getElementById("statusFilter").value;
  const priority = document.getElementById("priorityFilter").value;
  const manager = document.getElementById("managerFilter").value;
  const category = document.getElementById("categoryFilter").value;
  return state.demands.filter(item => {
    const searchable = `${demandCode(item)} ${item.title} ${item.description} ${managerName(item)} ${item.responsible} ${item.requester || ""} ${item.category}`.toLocaleLowerCase("pt-BR");
    return (!search || searchable.includes(search)) &&
      (!status || effectiveStatus(item) === status) &&
      (!priority || item.priority === priority) &&
      (!manager || managerName(item) === manager) &&
      (!category || item.category === category);
  });
}

function renderDemands() {
  const demands = filteredDemands();
  document.getElementById("allDemandsBody").innerHTML = demands.length ? demands.map(item => demandRow(item)).join("") : emptyRow(9, "Nenhuma demanda corresponde aos filtros.");
  document.getElementById("tableCount").textContent = `${demands.length} ${demands.length === 1 ? "demanda exibida" : "demandas exibidas"}`;
}

function populateDynamicFilters() {
  const categories = [...new Set(state.demands.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const managers = [...new Set(state.demands.map(managerName))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  ["categoryFilter", "reportCategory"].forEach(id => {
    const select = document.getElementById(id);
    const current = select.value;
    const first = id === "categoryFilter" ? "Todas as categorias" : "Todas";
    select.innerHTML = `<option value="">${first}</option>${categories.map(item => `<option>${escapeHtml(item)}</option>`).join("")}`;
    if ([...select.options].some(option => option.value === current)) select.value = current;
  });
  ["managerFilter", "reportManager"].forEach(id => {
    const select = document.getElementById(id);
    const current = select.value;
    const first = id === "managerFilter" ? "Todos os gestores" : "Todos";
    select.innerHTML = `<option value="">${first}</option>${managers.map(item => `<option>${escapeHtml(item)}</option>`).join("")}`;
    if ([...select.options].some(option => option.value === current)) select.value = current;
  });
  document.getElementById("managerOptions").innerHTML = managers
    .filter(item => item !== "Gestor não informado")
    .map(item => `<option value="${escapeHtml(item)}"></option>`).join("");
}

function refreshAll() {
  populateDynamicFilters();
  renderDashboard();
  renderDemands();
  renderAnalysisCharts();
  renderReport();
}

function resetDemandForm() {
  const form = document.getElementById("demandForm");
  form.reset();
  document.getElementById("demandId").value = "";
  document.getElementById("demandFormHeading").textContent = "Nova demanda";
  document.getElementById("saveDemandButton").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Salvar demanda`;
  const today = new Date();
  const due = new Date();
  due.setDate(due.getDate() + 7);
  const inputDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  document.getElementById("demandStartDate").value = inputDate(today);
  document.getElementById("demandDueDate").value = inputDate(due);
  document.getElementById("demandPriority").value = "Normal";
  document.getElementById("demandStatus").value = "Pendente";
  form.querySelectorAll(".invalid").forEach(item => item.classList.remove("invalid"));
}

function editDemand(id) {
  const demand = state.demands.find(item => item.id === id);
  if (!demand) return;
  closeModal("demandDetailModal");
  document.getElementById("demandId").value = demand.id;
  document.getElementById("demandTitle").value = demand.title;
  document.getElementById("demandDescription").value = demand.description;
  document.getElementById("demandRequester").value = demand.requester || "";
  document.getElementById("demandResponsible").value = demand.responsible;
  document.getElementById("demandManager").value = demand.manager || "";
  document.getElementById("demandDepartment").value = demand.department || "";
  document.getElementById("demandCategory").value = [...document.getElementById("demandCategory").options].some(option => option.value === demand.category) ? demand.category : "Outro";
  document.getElementById("demandPriority").value = demand.priority;
  document.getElementById("demandStatus").value = demand.status;
  document.getElementById("demandStartDate").value = demand.start_date;
  document.getElementById("demandDueDate").value = demand.due_date;
  document.getElementById("demandEstimatedHours").value = demand.estimated_hours || "";
  document.getElementById("demandActualHours").value = demand.actual_hours || "";
  document.getElementById("demandTags").value = (demand.tags || []).join(", ");
  document.getElementById("demandNotes").value = demand.notes || "";
  document.getElementById("demandFormHeading").textContent = `Editar ${demandCode(demand)}`;
  document.getElementById("saveDemandButton").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Salvar alterações`;
  setActiveView("nova-demanda");
}

function demandPayload() {
  return {
    title: document.getElementById("demandTitle").value.trim(),
    description: document.getElementById("demandDescription").value.trim(),
    requester: document.getElementById("demandRequester").value.trim(),
    responsible: document.getElementById("demandResponsible").value.trim(),
    manager: document.getElementById("demandManager").value.trim(),
    department: document.getElementById("demandDepartment").value.trim(),
    category: document.getElementById("demandCategory").value,
    priority: document.getElementById("demandPriority").value,
    status: document.getElementById("demandStatus").value,
    start_date: document.getElementById("demandStartDate").value,
    due_date: document.getElementById("demandDueDate").value,
    estimated_hours: Number(document.getElementById("demandEstimatedHours").value || 0),
    actual_hours: Number(document.getElementById("demandActualHours").value || 0),
    tags: document.getElementById("demandTags").value.split(",").map(item => item.trim()).filter(Boolean),
    notes: document.getElementById("demandNotes").value.trim(),
  };
}

function validateDemand(payload) {
  const fields = [
    ["demandTitle", payload.title.length >= 4],
    ["demandDescription", payload.description.length >= 5],
    ["demandResponsible", Boolean(payload.responsible)],
    ["demandManager", Boolean(payload.manager)],
    ["demandCategory", Boolean(payload.category)],
    ["demandStartDate", Boolean(payload.start_date)],
    ["demandDueDate", Boolean(payload.due_date)],
  ];
  let valid = true;
  fields.forEach(([id, ok]) => {
    document.getElementById(id).closest(".field").classList.toggle("invalid", !ok);
    if (!ok) valid = false;
  });
  if (payload.start_date && payload.due_date && payload.due_date < payload.start_date) {
    document.getElementById("demandDueDate").closest(".field").classList.add("invalid");
    showToast("O prazo não pode ser anterior à data de entrada.", "error");
    valid = false;
  }
  return valid;
}

function askConfirmation(title, text, callback) {
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmText").textContent = text;
  confirmCallback = callback;
  openModal("confirmModal");
}

function fillSettings() {
  document.getElementById("settingsFullName").value = state.profile.full_name;
  document.getElementById("settingsRole").value = state.profile.role || "";
  document.getElementById("settingsEmail").value = state.user.email || "";
  document.getElementById("settingsAppName").value = state.settings.app_name;
  document.getElementById("settingsAppSubtitle").value = state.settings.app_subtitle;
  document.getElementById("avatarFile").value = "";
  applyAvatar(state.profile.avatar_url, state.profile.full_name);
  applyTheme(state.profile.theme);
}

function setSettingsEditing(enabled) {
  settingsEditing = Boolean(enabled);
  const form = document.getElementById("settingsForm");
  const editButton = document.getElementById("editSettingsButton");
  const status = document.getElementById("settingsLockStatus");
  form.classList.toggle("settings-locked", !settingsEditing);
  document.querySelectorAll("[data-settings-control]").forEach(control => control.disabled = !settingsEditing);
  document.getElementById("avatarButton").classList.toggle("is-disabled", !settingsEditing);
  document.getElementById("settingsSaveActions").hidden = !settingsEditing;
  editButton.innerHTML = settingsEditing
    ? `<i class="fa-solid fa-xmark"></i> Cancelar edição`
    : `<i class="fa-solid fa-pen"></i> Editar`;
  status.classList.toggle("is-editing", settingsEditing);
  status.innerHTML = settingsEditing
    ? `<i class="fa-solid fa-lock-open"></i><span>Edição liberada. Revise os campos e salve as alterações.</span>`
    : `<i class="fa-solid fa-lock"></i><span>Configurações protegidas contra alterações acidentais.</span>`;
}

function bindNavigation() {
  document.querySelectorAll("[data-view],[data-go-view]").forEach(button => button.addEventListener("click", () => {
    const view = button.dataset.view || button.dataset.goView;
    if (view === "nova-demanda" && !document.getElementById("demandId").value) resetDemandForm();
    setActiveView(view);
    document.getElementById("userMenu").hidden = true;
  }));
  document.getElementById("sidebarToggle").addEventListener("click", () => {
    const shell = document.getElementById("appShell");
    const collapsed = shell.classList.toggle("sidebar-collapsed");
    document.querySelector("#sidebarToggle span").textContent = collapsed ? "Expandir menu" : "Recolher menu";
    document.getElementById("sidebarToggle").setAttribute("aria-label", collapsed ? "Expandir menu" : "Recolher menu");
  });
  document.getElementById("mobileMenuButton").addEventListener("click", () => {
    document.getElementById("appShell").classList.add("sidebar-mobile-open");
    document.getElementById("sidebarBackdrop").hidden = false;
  });
  const closeMobile = () => {
    document.getElementById("appShell").classList.remove("sidebar-mobile-open");
    document.getElementById("sidebarBackdrop").hidden = true;
  };
  document.getElementById("sidebarClose").addEventListener("click", closeMobile);
  document.getElementById("sidebarBackdrop").addEventListener("click", closeMobile);
}

function bindEvents() {
  bindNavigation();
  document.querySelectorAll("[data-close-modal]").forEach(button => button.addEventListener("click", () => closeModal(button.dataset.closeModal)));
  document.querySelectorAll("[data-period]").forEach(button => button.addEventListener("click", () => {
    dashboardPeriod = Number(button.dataset.period);
    document.querySelectorAll("[data-period]").forEach(item => item.classList.toggle("active", item === button));
    renderDashboard();
  }));
  ["demandSearch", "statusFilter", "priorityFilter", "managerFilter", "categoryFilter"].forEach(id => {
    const element = document.getElementById(id);
    element.addEventListener(id === "demandSearch" ? "input" : "change", renderDemands);
  });
  document.getElementById("clearDemandFilters").addEventListener("click", () => {
    ["demandSearch", "statusFilter", "priorityFilter", "managerFilter", "categoryFilter"].forEach(id => document.getElementById(id).value = "");
    renderDemands();
  });
  document.querySelectorAll("#allDemandsBody,#recentDemandsBody").forEach(body => body.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const demand = state.demands.find(item => item.id === button.dataset.id);
    if (!demand) return;
    if (button.dataset.action === "view") renderDemandDetail(demand);
    if (button.dataset.action === "edit") editDemand(demand.id);
    if (button.dataset.action === "delete") askConfirmation("Excluir demanda", `A demanda “${demand.title}” será removida permanentemente.`, async () => {
      try {
        await removeDemand(demand.id);
        refreshAll();
        showToast("Demanda excluída.", "success");
      } catch (error) {
        log.error("DEMANDAS", "Falha ao excluir.", error);
        showToast("Não foi possível excluir a demanda.", "error");
      }
    });
  }));
  document.getElementById("detailEditButton").addEventListener("click", event => editDemand(event.currentTarget.dataset.id));
  document.getElementById("confirmActionButton").addEventListener("click", async () => {
    const callback = confirmCallback;
    confirmCallback = null;
    closeModal("confirmModal");
    await callback?.();
  });
  document.getElementById("demandForm").addEventListener("submit", async event => {
    event.preventDefault();
    const payload = demandPayload();
    if (!validateDemand(payload)) return showToast("Revise os campos obrigatórios destacados.", "error");
    const button = document.getElementById("saveDemandButton");
    try {
      button.disabled = true;
      const id = document.getElementById("demandId").value || null;
      await saveDemand(payload, id);
      resetDemandForm();
      refreshAll();
      setActiveView("demandas");
      showToast(id ? "Demanda atualizada com sucesso." : "Demanda cadastrada com sucesso.", "success");
    } catch (error) {
      log.error("DEMANDAS", "Falha ao salvar.", error);
      const migrationPending = /manager/i.test(error.message || "") && /column|schema cache|could not find/i.test(error.message || "");
      showToast(
        migrationPending
          ? "Execute supabase-migration-v1.1.sql no Supabase antes de salvar demandas com gestor."
          : `Não foi possível salvar: ${error.message}`,
        "error",
      );
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById("cancelDemandEdit").addEventListener("click", () => { resetDemandForm(); setActiveView("demandas"); });
  document.getElementById("weatherButton").addEventListener("click", openWeather);
  document.getElementById("refreshWeatherButton").addEventListener("click", event => {
    event.stopPropagation();
    initializeWeather({ requestLocation: true, force: true });
  });
  document.getElementById("userMenuButton").addEventListener("click", event => {
    event.stopPropagation();
    const menu = document.getElementById("userMenu");
    menu.hidden = !menu.hidden;
    event.currentTarget.setAttribute("aria-expanded", String(!menu.hidden));
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".user-area")) {
      document.getElementById("userMenu").hidden = true;
      document.getElementById("userMenuButton").setAttribute("aria-expanded", "false");
    }
    if (!event.target.closest(".weather-area")) closeWeather();
  });
  document.getElementById("logoutButton").addEventListener("click", () => askConfirmation("Sair do sistema", "Deseja encerrar sua sessão no FLUUX?", async () => {
    await getSupabase().auth.signOut();
    location.replace("index.html");
  }));
  document.getElementById("themeButton").addEventListener("click", async () => {
    const theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    applyTheme(theme);
    try { await saveProfile({ theme }); } catch (error) { log.warn("PERFIL", "Tema aplicado, mas não salvo.", error); }
  });
  const startPresentation = () => {
    document.body.classList.add("presentation-mode");
    document.getElementById("presentationExit").hidden = false;
    document.getElementById("presentationButton").innerHTML = `<i class="fa-solid fa-arrow-left"></i> Voltar`;
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const stopPresentation = () => {
    document.body.classList.remove("presentation-mode");
    document.getElementById("presentationExit").hidden = true;
    document.getElementById("presentationButton").innerHTML = `<i class="fa-solid fa-display"></i> Apresentar`;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  };
  document.getElementById("presentationButton").addEventListener("click", () => {
    document.body.classList.contains("presentation-mode") ? stopPresentation() : startPresentation();
  });
  document.getElementById("exitPresentationButton").addEventListener("click", stopPresentation);
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    document.querySelectorAll(".modal-layer:not([hidden])").forEach(modal => closeModal(modal.id));
    if (document.body.classList.contains("presentation-mode")) stopPresentation();
  });
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && document.body.classList.contains("presentation-mode")) stopPresentation();
  });
  addEventListener("fluux:viewchange", event => {
    if (event.detail.view === "analises") setTimeout(renderAnalysisCharts, 20);
    if (event.detail.view === "relatorios") renderReport();
    if (event.detail.view === "configuracoes") {
      fillSettings();
      setSettingsEditing(false);
    }
  });
  addEventListener("fluux:themechange", () => setTimeout(() => redrawCharts(dashboardPeriod), 25));
}

function bindSettings() {
  document.getElementById("editSettingsButton").addEventListener("click", () => {
    if (settingsEditing) fillSettings();
    setSettingsEditing(!settingsEditing);
  });
  document.getElementById("avatarFile").addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      event.target.value = "";
      return showToast("A foto deve ter no máximo 2 MB.", "error");
    }
    applyAvatar(URL.createObjectURL(file), document.getElementById("settingsFullName").value);
  });
  document.getElementById("settingsForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("saveSettingsButton");
    try {
      button.disabled = true;
      let avatarUrl = state.profile.avatar_url;
      const file = document.getElementById("avatarFile").files?.[0];
      if (file) avatarUrl = await uploadAvatar(file);
      await Promise.all([
        saveProfile({
          full_name: document.getElementById("settingsFullName").value.trim(),
          role: document.getElementById("settingsRole").value.trim(),
          avatar_url: avatarUrl,
        }),
        saveSettings({
          app_name: document.getElementById("settingsAppName").value.trim(),
          app_subtitle: document.getElementById("settingsAppSubtitle").value.trim(),
        }),
      ]);
      document.getElementById("avatarFile").value = "";
      applyIdentity();
      applyTheme(state.profile.theme);
      fillSettings();
      setSettingsEditing(false);
      showToast("Configurações salvas com sucesso.", "success");
    } catch (error) {
      log.error("CONFIG", "Falha ao salvar configurações.", error);
      showToast(`Não foi possível salvar: ${error.message}`, "error");
    } finally {
      button.disabled = false;
    }
  });
}

function showFatal(error) {
  document.getElementById("bootScreen").hidden = true;
  document.getElementById("appShell").hidden = true;
  document.getElementById("fatalMessage").textContent =
    error.message?.includes("configurado") ? error.message :
    "Verifique se o SQL de instalação foi executado e se a URL/chave do Supabase estão corretas.";
  document.getElementById("fatalLayer").hidden = false;
}

async function boot() {
  log.boot();
  try {
    const session = await requireSession();
    if (!session) return;
    await initializeStore(session);
    applyTheme(state.profile.theme);
    applyIdentity();
    fillSettings();
    setSettingsEditing(false);
    initClock();
    resetDemandForm();
    populateDynamicFilters();
    bindEvents();
    bindSettings();
    initReports();
    refreshAll();
    document.getElementById("bootScreen").hidden = true;
    document.getElementById("appShell").hidden = false;
    const hash = location.hash.slice(1);
    const initial = hash === "inicio" || !VIEW_LABELS[hash] ? "dashboard" : hash;
    setActiveView(initial, false);
    initializeWeather({ requestLocation: true });
    getSupabase().auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT" || !nextSession) location.replace("index.html");
    });
    log.success("APP", "Sistema pronto. Nenhum erro de inicialização.");
  } catch (error) {
    log.error("APP", "Falha crítica na inicialização.", error);
    showFatal(error);
  }
}

boot();
