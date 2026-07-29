import { DEMANDS } from "./data.js";
import { closeModal, escapeHtml, showToast } from "./ui.js";

const demands = DEMANDS.map(item => ({...item}));
const slug = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g,"-");
const formatDate = value => new Intl.DateTimeFormat("pt-BR",{ day:"2-digit", month:"short" }).format(new Date(`${value}T12:00:00`)).replace(".","");

function row(demand, compact = false) {
  const title = escapeHtml(demand.title);
  const demandCell = `<div class="demand-cell"><i class="fa-regular fa-file-lines"></i><span><strong title="${title}">${title}</strong><small>${compact ? escapeHtml(demand.id) : `Entrada em ${formatDate(demand.startDate)}`}</small></span></div>`;
  const priority = `<span class="badge ${slug(demand.priority)}">${escapeHtml(demand.priority)}</span>`;
  const status = `<span class="badge status ${slug(demand.status)}">${escapeHtml(demand.status)}</span>`;
  if (compact) return `<tr><td>${demandCell}</td><td>${escapeHtml(demand.manager)}</td><td>${priority}</td><td>${formatDate(demand.dueDate)}</td><td>${status}</td></tr>`;
  return `<tr><td>${escapeHtml(demand.id)}</td><td>${demandCell}</td><td>${escapeHtml(demand.manager)}</td><td>${escapeHtml(demand.category)}</td><td>${priority}</td><td>${formatDate(demand.dueDate)}</td><td>${status}</td></tr>`;
}

export function renderRecent() {
  const body = document.getElementById("recentDemandsBody");
  if (body) body.innerHTML = demands.slice(0,5).map(demand => row(demand,true)).join("");
}

export function renderAll() {
  const search = document.getElementById("demandSearch")?.value.trim().toLocaleLowerCase("pt-BR") || "";
  const status = document.getElementById("statusFilter")?.value || "";
  const priority = document.getElementById("priorityFilter")?.value || "";
  const filtered = demands.filter(demand => {
    const searchable = `${demand.title} ${demand.manager} ${demand.category}`.toLocaleLowerCase("pt-BR");
    return (!search || searchable.includes(search)) && (!status || demand.status === status) && (!priority || demand.priority === priority);
  });
  const body = document.getElementById("allDemandsBody");
  if (body) body.innerHTML = filtered.length ? filtered.map(demand => row(demand)).join("") : `<tr><td class="empty-table" colspan="7">Nenhuma demanda corresponde aos filtros.</td></tr>`;
  document.getElementById("tableCount").textContent = `${filtered.length} ${filtered.length === 1 ? "demanda exibida" : "demandas exibidas"}`;
}

export function getDemands() { return demands; }

export function initDemandInteractions() {
  document.getElementById("demandSearch")?.addEventListener("input", renderAll);
  document.getElementById("statusFilter")?.addEventListener("change", renderAll);
  document.getElementById("priorityFilter")?.addEventListener("change", renderAll);

  document.getElementById("demandForm")?.addEventListener("submit", event => {
    event.preventDefault();
    const titleInput = document.getElementById("demandTitle");
    const title = titleInput.value.trim();
    const field = titleInput.closest(".field");
    field.classList.toggle("invalid", title.length < 4);
    if (title.length < 4) return titleInput.focus();
    const manager = document.getElementById("demandManager").value;
    if (!manager) return showToast("Selecione um responsável para continuar.");

    demands.unshift({
      id:`DEM-${String(demands.length+1).padStart(3,"0")}`,
      title,
      manager,
      category:"Geral",
      priority:document.getElementById("demandPriority").value,
      startDate:document.getElementById("demandStartDate").value,
      dueDate:document.getElementById("demandDueDate").value,
      status:"Pendente",
      averageDays:0,
    });
    renderRecent();
    renderAll();
    document.getElementById("navDemandCount").textContent = demands.length;
    event.currentTarget.reset();
    closeModal();
    showToast("Demanda adicionada à demonstração desta sessão.","success");
    dispatchEvent(new CustomEvent("dashboard:datachange"));
  });
}
