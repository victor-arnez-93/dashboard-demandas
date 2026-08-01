import { bootPage } from "./shell.js";
import {
  state,
  saveCatalog,
  setCatalogActive,
  removeCatalog,
} from "./store.js";
import {
  escapeHtml,
  formatDate,
  openModal,
  closeModal,
  showToast,
} from "./ui.js";
import { smartName, bindSmartText } from "./form-utils.js";

const META = {
  managers: {
    label: "Gestor",
    plural: "Gestores",
    icon: "fa-user-tie",
  },
  responsibles: {
    label: "Responsável",
    plural: "Responsáveis",
    icon: "fa-user-check",
  },
  departments: {
    label: "Departamento",
    plural: "Departamentos",
    icon: "fa-building",
  },
  categories: {
    label: "Categoria",
    plural: "Categorias",
    icon: "fa-tags",
  },
  locations: {
    label: "Local",
    plural: "Locais",
    icon: "fa-location-dot",
  },
};

let activeType = "managers";
let pendingDelete = null;

function getSearchValue() {
  return document
    .getElementById("catalogSearch")
    .value
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function filteredItems() {
  const search = getSearchValue();
  const items = state.catalogs[activeType] || [];

  return items.filter(item => {
    if (!search) return true;

    const content = `${item.name} ${item.description || ""}`
      .toLocaleLowerCase("pt-BR");

    return content.includes(search);
  });
}

function actionButton({ action, id, title, icon, danger = false }) {
  return `
    <button
      class="action-btn ${danger ? "danger" : ""}"
      data-action="${action}"
      data-id="${id}"
      type="button"
      title="${escapeHtml(title)}"
      aria-label="${escapeHtml(title)}"
    >
      <i class="fa-solid ${icon}"></i>
    </button>
  `;
}

function render() {
  const items = filteredItems();
  const meta = META[activeType];
  const body = document.getElementById("catalogBody");

  body.innerHTML = items.length
    ? items.map(item => `
      <tr>
        <td>
          <div class="catalog-name">
            <i class="fa-solid ${meta.icon}"></i>
            <strong>${escapeHtml(item.name)}</strong>
          </div>
        </td>

        <td>
          <span class="catalog-description">
            ${escapeHtml(item.description || "—")}
          </span>
        </td>

        <td>
          <span class="catalog-status ${item.is_active ? "active" : "inactive"}">
            ${item.is_active ? "Ativo" : "Inativo"}
          </span>
        </td>

        <td>
          ${formatDate(
            (item.updated_at || item.created_at || "").slice(0, 10),
            { year: true },
          )}
        </td>

        <td>
          <div class="catalog-actions">
            ${actionButton({
              action: "edit",
              id: item.id,
              title: `Editar ${meta.label.toLowerCase()}`,
              icon: "fa-pen",
            })}

            ${actionButton({
              action: "toggle",
              id: item.id,
              title: item.is_active ? "Inativar cadastro" : "Ativar cadastro",
              icon: item.is_active ? "fa-eye-slash" : "fa-eye",
            })}

            ${actionButton({
              action: "delete",
              id: item.id,
              title: "Excluir cadastro",
              icon: "fa-trash-can",
              danger: true,
            })}
          </div>
        </td>
      </tr>
    `).join("")
    : `
      <tr>
        <td colspan="5" class="empty-table">
          Nenhum item encontrado neste cadastro.
        </td>
      </tr>
    `;

  document.getElementById("catalogCount").textContent =
    `${items.length} ${items.length === 1 ? "item" : "itens"}`;
}

function openCatalog(item = null) {
  const meta = META[activeType];
  const editing = Boolean(item);

  document.getElementById("catalogId").value = item?.id || "";
  document.getElementById("catalogType").value = activeType;
  document.getElementById("catalogModalType").textContent =
    meta.label.toUpperCase();

  document.getElementById("catalogModalTitle").textContent = editing
    ? `Editar ${meta.label.toLowerCase()}`
    : `Novo ${meta.label.toLowerCase()}`;

  document.getElementById("catalogModalDescription").textContent = editing
    ? `Atualize os dados deste ${meta.label.toLowerCase()} sem perder o histórico existente.`
    : `Cadastre um novo ${meta.label.toLowerCase()} para reutilizar nos registros do sistema.`;

  document.getElementById("catalogName").value = item?.name || "";
  document.getElementById("catalogDescription").value =
    item?.description || "";

  document.getElementById("catalogDescriptionField").hidden =
    activeType !== "locations";

  document.getElementById("catalogActive").checked =
    item?.is_active ?? true;

  openModal("catalogModal");
}

function openDeleteConfirmation(item) {
  pendingDelete = {
    type: activeType,
    id: item.id,
    name: item.name,
  };

  document.getElementById("deleteCatalogName").textContent = item.name;
  openModal("deleteCatalogModal");
}

function clearDeleteConfirmation() {
  pendingDelete = null;
  document.getElementById("deleteCatalogName").textContent = "—";
}

async function deleteCatalog() {
  if (!pendingDelete) return;

  const { type, id, name } = pendingDelete;
  const button = document.getElementById("confirmDeleteCatalogButton");

  if (!META[type]) {
    showToast("Tipo de cadastro inválido.", "error");
    return;
  }

  try {
    button.disabled = true;

    await removeCatalog(type, id);

    closeModal("deleteCatalogModal");
    clearDeleteConfirmation();
    render();

    showToast(`${META[type].label} “${name}” excluído.`, "success");
  } catch (error) {
    showToast(
      error.message || "Não foi possível excluir o cadastro.",
      "error",
    );
  } finally {
    button.disabled = false;
  }
}

async function handleTable(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const item = (state.catalogs[activeType] || [])
    .find(entry => entry.id === button.dataset.id);

  if (!item) return;

  if (button.dataset.action === "edit") {
    openCatalog(item);
    return;
  }

  if (button.dataset.action === "delete") {
    openDeleteConfirmation(item);
    return;
  }

  if (button.dataset.action === "toggle") {
    const nextActive = !item.is_active;

    try {
      button.disabled = true;

      await setCatalogActive(activeType, item.id, nextActive);

      showToast(
        `${META[activeType].label} ${nextActive ? "ativado" : "inativado"}.`,
        "success",
      );

      render();
    } catch (error) {
      showToast(
        error.message || "Não foi possível alterar o cadastro.",
        "error",
      );
    } finally {
      button.disabled = false;
    }
  }
}

function changeCatalogType(button) {
  activeType = button.dataset.catalogType;

  document.querySelectorAll("[data-catalog-type]").forEach(item => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
  });

  document.getElementById("catalogSearch").value = "";
  render();
}

async function saveCurrentCatalog(event) {
  event.preventDefault();

  const type = document.getElementById("catalogType").value;
  const id = document.getElementById("catalogId").value;
  const name = smartName(document.getElementById("catalogName").value);
  const description = document
    .getElementById("catalogDescription")
    .value
    .trim();

  if (name.length < 2) {
    showToast("Informe um nome válido.", "error");
    document.getElementById("catalogName").focus();
    return;
  }

  const duplicate = (state.catalogs[type] || []).some(item =>
    item.id !== id
    && item.name.localeCompare(name, "pt-BR", {
      sensitivity: "accent",
    }) === 0,
  );

  if (duplicate) {
    showToast("Já existe um cadastro com este nome.", "error");
    document.getElementById("catalogName").focus();
    return;
  }

  const button = document.getElementById("saveCatalogButton");

  try {
    button.disabled = true;

    await saveCatalog(
      type,
      {
        name,
        description,
        is_active: document.getElementById("catalogActive").checked,
      },
      id || null,
    );

    closeModal("catalogModal");
    showToast("Cadastro salvo com sucesso.", "success");
    render();
  } catch (error) {
    showToast(
      error.message || "Não foi possível salvar o cadastro.",
      "error",
    );
  } finally {
    button.disabled = false;
  }
}

bootPage(() => {
  bindSmartText(document.getElementById("catalogName"), "name");

  document.querySelectorAll("[data-catalog-type]").forEach(button => {
    button.addEventListener("click", () => changeCatalogType(button));
  });

  document.getElementById("catalogSearch")
    .addEventListener("input", render);

  document.getElementById("newCatalogButton")
    .addEventListener("click", () => openCatalog());

  document.getElementById("catalogBody")
    .addEventListener("click", handleTable);

  document.getElementById("catalogForm")
    .addEventListener("submit", saveCurrentCatalog);

  document.getElementById("confirmDeleteCatalogButton")
    .addEventListener("click", deleteCatalog);

  document.getElementById("deleteCatalogModal")
    .addEventListener("click", event => {
      if (event.target.closest("[data-close-modal='deleteCatalogModal']")) {
        clearDeleteConfirmation();
      }
    });

  render();
});
