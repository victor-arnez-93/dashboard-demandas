import { bootPage } from "./shell.js";
import { state, saveCatalog, setCatalogActive } from "./store.js";
import { escapeHtml, formatDate, openModal, closeModal, showToast } from "./ui.js";
import { smartName, bindSmartText } from "./form-utils.js";

const META = {
  managers: { label: "Gestor", plural: "Gestores", icon: "fa-user-tie" },
  responsibles: { label: "Responsável", plural: "Responsáveis", icon: "fa-user-check" },
  departments: { label: "Departamento", plural: "Departamentos", icon: "fa-building" },
  categories: { label: "Categoria", plural: "Categorias", icon: "fa-tags" },
  locations: { label: "Local", plural: "Locais", icon: "fa-location-dot" },
};
let activeType = "managers";

function filtered() {
  const search = document.getElementById("catalogSearch").value.trim().toLocaleLowerCase("pt-BR");
  return state.catalogs[activeType].filter(item => !search || `${item.name} ${item.description || ""}`.toLocaleLowerCase("pt-BR").includes(search));
}

function render() {
  const items = filtered();
  const meta = META[activeType];
  document.getElementById("catalogBody").innerHTML = items.length ? items.map(item => `<tr>
    <td><div class="catalog-name"><i class="fa-solid ${meta.icon}"></i><strong>${escapeHtml(item.name)}</strong></div></td>
    <td>${escapeHtml(item.description || "—")}</td>
    <td><span class="catalog-status ${item.is_active ? "active" : "inactive"}">${item.is_active ? "Ativo" : "Inativo"}</span></td>
    <td>${formatDate((item.updated_at || item.created_at || "").slice(0,10), { year: true })}</td>
    <td><div class="action-buttons"><button class="action-btn" data-action="edit" data-id="${item.id}" title="Editar"><i class="fa-solid fa-pen"></i></button><button class="action-btn" data-action="toggle" data-id="${item.id}" title="${item.is_active ? "Inativar" : "Ativar"}"><i class="fa-solid ${item.is_active ? "fa-eye-slash" : "fa-eye"}"></i></button></div></td>
  </tr>`).join("") : `<tr><td colspan="5" class="empty-table">Nenhum item encontrado neste cadastro.</td></tr>`;
  document.getElementById("catalogCount").textContent = `${items.length} ${items.length === 1 ? "item" : "itens"}`;
}

function openCatalog(item = null) {
  const meta = META[activeType];
  document.getElementById("catalogId").value = item?.id || "";
  document.getElementById("catalogType").value = activeType;
  document.getElementById("catalogModalType").textContent = meta.label.toUpperCase();
  document.getElementById("catalogModalTitle").textContent = item ? `Editar ${meta.label.toLowerCase()}` : `Novo ${meta.label.toLowerCase()}`;
  document.getElementById("catalogName").value = item?.name || "";
  document.getElementById("catalogDescription").value = item?.description || "";
  document.getElementById("catalogDescriptionField").hidden = activeType !== "locations";
  document.getElementById("catalogActive").checked = item?.is_active ?? true;
  openModal("catalogModal");
}

async function handleTable(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const item = state.catalogs[activeType].find(entry => entry.id === button.dataset.id);
  if (!item) return;
  if (button.dataset.action === "edit") openCatalog(item);
  if (button.dataset.action === "toggle") {
    const nextActive = !item.is_active;
    try {
      await setCatalogActive(activeType, item.id, nextActive);
      showToast(`${META[activeType].label} ${nextActive ? "ativado" : "inativado"}.`, "success");
      render();
    } catch (error) {
      showToast(error.message || "Não foi possível alterar o cadastro.", "error");
    }
  }
}

bootPage(() => {
  bindSmartText(document.getElementById("catalogName"), "name");
  document.querySelectorAll("[data-catalog-type]").forEach(button => {
    button.addEventListener("click", () => {
      activeType = button.dataset.catalogType;
      document.querySelectorAll("[data-catalog-type]").forEach(item => item.classList.toggle("active", item === button));
      document.getElementById("catalogSearch").value = "";
      render();
    });
  });
  document.getElementById("catalogSearch").addEventListener("input", render);
  document.getElementById("newCatalogButton").addEventListener("click", () => openCatalog());
  document.getElementById("catalogBody").addEventListener("click", handleTable);
  document.getElementById("catalogForm").addEventListener("submit", async event => {
    event.preventDefault();
    const type = document.getElementById("catalogType").value;
    const id = document.getElementById("catalogId").value;
    const name = smartName(document.getElementById("catalogName").value);
    const description = document.getElementById("catalogDescription").value.trim();
    if (name.length < 2) return showToast("Informe um nome válido.", "error");
    const duplicate = state.catalogs[type].some(item => item.id !== id && item.name.localeCompare(name, "pt-BR", { sensitivity: "accent" }) === 0);
    if (duplicate) return showToast("Já existe um cadastro com este nome.", "error");
    const button = document.getElementById("saveCatalogButton");
    try {
      button.disabled = true;
      await saveCatalog(type, { name, description, is_active: document.getElementById("catalogActive").checked }, id || null);
      closeModal("catalogModal");
      showToast("Cadastro salvo com sucesso.", "success");
      render();
    } catch (error) {
      showToast(error.message || "Não foi possível salvar o cadastro.", "error");
    } finally {
      button.disabled = false;
    }
  });
  render();
});
