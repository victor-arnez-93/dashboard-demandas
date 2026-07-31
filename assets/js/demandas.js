import { bootPage } from "./shell.js";
import { state, activeCatalog, effectiveStatus, removeDemand, demandCode } from "./store.js";
import { escapeHtml, formatDate, demandCell, statusClass, priorityClass, renderDemandDetail, confirmAction, showToast, closeModal } from "./ui.js";

function populateFilters() {
  const manager = document.getElementById("managerFilter");
  const category = document.getElementById("categoryFilter");
  manager.innerHTML = `<option value="">Todos os gestores</option>${activeCatalog("managers").map(item => `<option>${escapeHtml(item.name)}</option>`).join("")}<option>Gestor não informado</option>`;
  category.innerHTML = `<option value="">Todas as categorias</option>${activeCatalog("categories").map(item => `<option>${escapeHtml(item.name)}</option>`).join("")}`;
}

function filtered() {
  const search = document.getElementById("demandSearch").value.trim().toLocaleLowerCase("pt-BR");
  const status = document.getElementById("statusFilter").value;
  const priority = document.getElementById("priorityFilter").value;
  const manager = document.getElementById("managerFilter").value;
  const category = document.getElementById("categoryFilter").value;
  return state.demands.filter(item => {
    const managerName = item.manager?.trim() || "Gestor não informado";
    const text = `${demandCode(item)} ${item.title} ${item.description} ${managerName} ${item.responsible} ${item.requester || ""} ${item.category}`.toLocaleLowerCase("pt-BR");
    return (!search || text.includes(search)) && (!status || effectiveStatus(item) === status) && (!priority || item.priority === priority) && (!manager || managerName === manager) && (!category || item.category === category);
  });
}

function row(item) {
  const status = effectiveStatus(item);
  const manager = item.manager?.trim() || "Gestor não informado";
  return `<tr>
    <td>${demandCode(item)}</td>
    <td>${demandCell(item)}</td>
    <td class="${manager === "Gestor não informado" ? "manager-missing" : ""}">${escapeHtml(manager)}</td>
    <td>${escapeHtml(item.responsible)}</td>
    <td>${escapeHtml(item.category)}</td>
    <td><span class="priority-pill ${priorityClass(item.priority)}">${escapeHtml(item.priority)}</span></td>
    <td>${formatDate(item.due_date)}</td>
    <td><span class="status-pill ${statusClass(status)}">${escapeHtml(status)}</span></td>
    <td><div class="action-buttons"><button class="action-btn" data-action="view" data-id="${item.id}" title="Visualizar"><i class="fa-regular fa-eye"></i></button><button class="action-btn" data-action="edit" data-id="${item.id}" title="Editar"><i class="fa-solid fa-pen"></i></button><button class="action-btn danger" data-action="delete" data-id="${item.id}" title="Excluir"><i class="fa-regular fa-trash-can"></i></button></div></td>
  </tr>`;
}

function render() {
  const items = filtered();
  document.getElementById("allDemandsBody").innerHTML = items.length ? items.map(row).join("") : `<tr><td colspan="9" class="empty-table">Nenhuma demanda corresponde aos filtros.</td></tr>`;
  document.getElementById("tableCount").textContent = `${items.length} ${items.length === 1 ? "demanda exibida" : "demandas exibidas"}`;
}

async function handleAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const item = state.demands.find(demand => demand.id === button.dataset.id);
  if (!item) return;
  if (button.dataset.action === "view") renderDemandDetail(item);
  if (button.dataset.action === "edit") location.href = `nova_demanda.html?id=${encodeURIComponent(item.id)}`;
  if (button.dataset.action === "delete") {
    const confirmed = await confirmAction({ title: "Excluir demanda", text: `A demanda “${item.title}” será removida permanentemente.`, confirmLabel: "Excluir demanda" });
    if (!confirmed) return;
    try {
      await removeDemand(item.id);
      showToast("Demanda excluída.", "success");
      render();
    } catch (error) {
      showToast(error.message || "Não foi possível excluir a demanda.", "error");
    }
  }
}

bootPage(() => {
  populateFilters();
  ["demandSearch", "statusFilter", "priorityFilter", "managerFilter", "categoryFilter"].forEach(id => document.getElementById(id).addEventListener("input", render));
  document.getElementById("clearDemandFilters").addEventListener("click", () => {
    ["demandSearch", "statusFilter", "priorityFilter", "managerFilter", "categoryFilter"].forEach(id => { document.getElementById(id).value = ""; });
    render();
  });
  document.getElementById("allDemandsBody").addEventListener("click", handleAction);
  document.getElementById("detailEditButton").addEventListener("click", event => { location.href = `nova_demanda.html?id=${encodeURIComponent(event.currentTarget.dataset.id)}`; });
  render();
  const viewId = new URLSearchParams(location.search).get("view");
  if (viewId) {
    const item = state.demands.find(demand => demand.id === viewId);
    if (item) renderDemandDetail(item);
  }
});
