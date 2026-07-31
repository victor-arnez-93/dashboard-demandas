import { state, activeCatalog, catalogItem, saveCatalog, setCatalogActive } from "./store.js";
import { closeModal, escapeHtml, formatDate, openModal, showToast } from "./ui.js";
import { smartName } from "./form-utils.js";
import { log } from "./logger.js";

const META = Object.freeze({
  managers: { singular: "gestor", plural: "Gestores", icon: "fa-user-tie" },
  responsibles: { singular: "responsável", plural: "Responsáveis", icon: "fa-user-check" },
  departments: { singular: "departamento", plural: "Departamentos", icon: "fa-building" },
  categories: { singular: "categoria", plural: "Categorias", icon: "fa-tags" },
  locations: { singular: "local", plural: "Locais", icon: "fa-location-dot" },
});

let currentType = "managers";
let askConfirmation = null;
let afterChange = null;

function optionHtml(item) {
  return `<option value="${item.id}">${escapeHtml(item.name)}</option>`;
}

function fillSelect(id, type, firstLabel, { other = true } = {}) {
  const select = document.getElementById(id);
  if (!select) return;
  const current = select.value;
  const items = activeCatalog(type);
  select.innerHTML = `<option value="">${escapeHtml(firstLabel)}</option>${items.map(optionHtml).join("")}${other ? '<option value="__other__">Outro</option>' : ""}`;
  if ([...select.options].some(option => option.value === current)) select.value = current;
}

export function populateCatalogSelects() {
  fillSelect("demandManager", "managers", "Selecione");
  fillSelect("demandResponsible", "responsibles", "Selecione");
  fillSelect("demandDepartment", "departments", "Não informado");
  fillSelect("demandCategory", "categories", "Selecione");
  fillSelect("converterLocation", "locations", "Selecione");
  fillSelect("converterResponsible", "responsibles", "Não informado");

  const managerFilter = document.getElementById("managerFilter");
  const reportManager = document.getElementById("reportManager");
  const categoryFilter = document.getElementById("categoryFilter");
  const reportCategory = document.getElementById("reportCategory");
  const converterLocationFilter = document.getElementById("converterLocationFilter");

  const preserve = (select, html) => {
    if (!select) return;
    const current = select.value;
    select.innerHTML = html;
    if ([...select.options].some(option => option.value === current)) select.value = current;
  };

  const managerNames = [...new Set([
    ...activeCatalog("managers").map(item => item.name),
    ...state.demands.map(item => item.manager?.trim() || "Gestor não informado"),
  ])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const categoryNames = [...new Set([
    ...activeCatalog("categories").map(item => item.name),
    ...state.demands.map(item => item.category).filter(Boolean),
  ])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const locationNames = [...new Set([
    ...activeCatalog("locations").map(item => item.name),
    ...state.converters.map(item => item.location_name).filter(Boolean),
  ])].sort((a, b) => a.localeCompare(b, "pt-BR"));

  preserve(managerFilter, `<option value="">Todos os gestores</option>${managerNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`);
  preserve(reportManager, `<option value="">Todos</option>${managerNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`);
  preserve(categoryFilter, `<option value="">Todas as categorias</option>${categoryNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`);
  preserve(reportCategory, `<option value="">Todas</option>${categoryNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`);
  preserve(converterLocationFilter, `<option value="">Todos os locais</option>${locationNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`);
}

function filteredItems() {
  const search = document.getElementById("catalogSearch")?.value.trim().toLocaleLowerCase("pt-BR") || "";
  return (state.catalogs[currentType] || []).filter(item => {
    const text = `${item.name} ${item.description || ""}`.toLocaleLowerCase("pt-BR");
    return !search || text.includes(search);
  });
}

export function renderCatalogs() {
  const body = document.getElementById("catalogBody");
  if (!body) return;
  const items = filteredItems();
  body.innerHTML = items.length ? items.map(item => `<tr>
    <td><span class="catalog-name"><i class="fa-solid ${META[currentType].icon}"></i><strong>${escapeHtml(item.name)}</strong></span></td>
    <td>${escapeHtml(item.description || "—")}</td>
    <td><span class="catalog-status ${item.is_active ? "active" : "inactive"}">${item.is_active ? "Ativo" : "Inativo"}</span></td>
    <td>${formatDate(String(item.updated_at || item.created_at).slice(0, 10), { year: true })}</td>
    <td><div class="row-actions"><button type="button" data-catalog-action="edit" data-id="${item.id}" title="Editar"><i class="fa-solid fa-pen"></i></button><button type="button" data-catalog-action="toggle" data-id="${item.id}" title="${item.is_active ? "Inativar" : "Ativar"}"><i class="fa-solid ${item.is_active ? "fa-toggle-on" : "fa-toggle-off"}"></i></button></div></td>
  </tr>`).join("") : `<tr><td colspan="5" class="empty-table">Nenhum ${META[currentType].singular} encontrado.</td></tr>`;
  document.getElementById("catalogCount").textContent = `${items.length} ${items.length === 1 ? "item" : "itens"}`;
}

function openCatalogForm(item = null) {
  const meta = META[currentType];
  document.getElementById("catalogId").value = item?.id || "";
  document.getElementById("catalogName").value = item?.name || "";
  document.getElementById("catalogDescription").value = item?.description || "";
  document.getElementById("catalogDescriptionField").hidden = currentType !== "locations";
  document.getElementById("catalogModalEyebrow").textContent = meta.plural.toUpperCase();
  document.getElementById("catalogModalTitle").textContent = item ? `Editar ${meta.singular}` : `Novo ${meta.singular}`;
  openModal("catalogModal");
}

async function submitCatalog(event) {
  event.preventDefault();
  const id = document.getElementById("catalogId").value || null;
  const nameInput = document.getElementById("catalogName");
  const name = smartName(nameInput.value);
  nameInput.value = name;
  if (name.length < 2) return showToast("Informe um nome válido para o cadastro.", "error");
  const button = document.getElementById("saveCatalogButton");
  try {
    button.disabled = true;
    await saveCatalog(currentType, {
      name,
      description: document.getElementById("catalogDescription").value.trim(),
      is_active: id ? catalogItem(currentType, id)?.is_active : true,
    }, id);
    closeModal("catalogModal");
    renderCatalogs();
    populateCatalogSelects();
    afterChange?.();
    showToast(id ? "Cadastro atualizado com sucesso." : "Cadastro criado com sucesso.", "success");
  } catch (error) {
    log.error("CADASTROS", "Falha ao salvar cadastro.", error);
    const duplicate = /duplicate key|unique/i.test(error.message || "");
    showToast(duplicate ? "Já existe um cadastro com esse nome." : `Não foi possível salvar: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
}

function bindTableActions() {
  document.getElementById("catalogBody").addEventListener("click", event => {
    const button = event.target.closest("[data-catalog-action]");
    if (!button) return;
    const item = catalogItem(currentType, button.dataset.id);
    if (!item) return;
    if (button.dataset.catalogAction === "edit") return openCatalogForm(item);
    const next = !item.is_active;
    const action = next ? "ativar" : "inativar";
    askConfirmation?.(
      `${next ? "Ativar" : "Inativar"} ${META[currentType].singular}`,
      `${next ? "O item voltará a aparecer" : "O item deixará de aparecer"} em novos registros. O histórico existente será preservado.`,
      async () => {
        try {
          await setCatalogActive(currentType, item.id, next);
          renderCatalogs();
          populateCatalogSelects();
          afterChange?.();
          showToast(`Cadastro ${action}ado com sucesso.`, "success");
        } catch (error) {
          log.error("CADASTROS", `Falha ao ${action}.`, error);
          showToast(`Não foi possível ${action} o cadastro.`, "error");
        }
      },
    );
  });
}

export function initCatalogs(options = {}) {
  askConfirmation = options.askConfirmation;
  afterChange = options.afterChange;
  document.querySelectorAll("[data-catalog-type]").forEach(button => button.addEventListener("click", () => {
    currentType = button.dataset.catalogType;
    document.querySelectorAll("[data-catalog-type]").forEach(item => item.classList.toggle("active", item === button));
    document.getElementById("newCatalogButton").innerHTML = `<i class="fa-solid fa-plus"></i> Novo ${META[currentType].singular}`;
    renderCatalogs();
  }));
  document.getElementById("catalogSearch").addEventListener("input", renderCatalogs);
  document.getElementById("newCatalogButton").addEventListener("click", () => openCatalogForm());
  document.getElementById("catalogForm").addEventListener("submit", submitCatalog);
  bindTableActions();
  populateCatalogSelects();
  renderCatalogs();
}
