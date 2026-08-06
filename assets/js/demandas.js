import { bootPage } from "./shell.js";
import {
  state,
  activeCatalog,
  effectiveStatus,
  removeDemand,
  demandCode,
  demandProject,
} from "./store.js";
import {
  escapeHtml,
  formatDate,
  statusClass,
  priorityClass,
  renderDemandDetail,
  confirmAction,
  showToast,
} from "./ui.js";

const customSelects = new Map();

function populateFilters() {
  const manager = document.getElementById("managerFilter");
  const location = document.getElementById("locationFilter");

  manager.innerHTML = `
    <option value="">Todos</option>
    ${activeCatalog("managers")
      .map(item => `<option>${escapeHtml(item.name)}</option>`)
      .join("")}
    <option>Gestor não informado</option>
  `;

  location.innerHTML = `
    <option value="">Todos</option>
    ${activeCatalog("locations")
      .map(item => `<option>${escapeHtml(item.name)}</option>`)
      .join("")}
  `;
}

function closeCustomSelect(select) {
  const component = customSelects.get(select);
  if (!component) return;

  component.wrapper.classList.remove("open");
  component.trigger.setAttribute("aria-expanded", "false");
  component.menu.hidden = true;
}

function closeAllCustomSelects(except = null) {
  customSelects.forEach((component, select) => {
    if (select !== except) closeCustomSelect(select);
  });
}

function updateCustomSelect(select) {
  const component = customSelects.get(select);
  if (!component) return;

  const selectedOption = select.options[select.selectedIndex] || select.options[0];
  component.label.textContent = selectedOption?.textContent || "Selecione";

  component.menu
    .querySelectorAll(".custom-select-option")
    .forEach(optionButton => {
      optionButton.setAttribute(
        "aria-selected",
        String(optionButton.dataset.value === select.value),
      );
    });
}

function chooseCustomSelectOption(select, optionButton) {
  select.value = optionButton.dataset.value;
  updateCustomSelect(select);
  closeCustomSelect(select);

  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function openCustomSelect(select, focusSelected = false) {
  const component = customSelects.get(select);
  if (!component) return;

  const willOpen = !component.wrapper.classList.contains("open");
  closeAllCustomSelects(select);

  if (!willOpen) {
    closeCustomSelect(select);
    return;
  }

  component.wrapper.classList.add("open");
  component.trigger.setAttribute("aria-expanded", "true");
  component.menu.hidden = false;

  if (focusSelected) {
    const selected = component.menu.querySelector(
      '.custom-select-option[aria-selected="true"]',
    );
    (selected || component.menu.querySelector(".custom-select-option"))?.focus();
  }
}

function moveCustomSelectFocus(menu, current, direction) {
  const options = [...menu.querySelectorAll(".custom-select-option")];
  if (!options.length) return;

  const currentIndex = options.indexOf(current);
  const nextIndex =
    direction === "first"
      ? 0
      : direction === "last"
        ? options.length - 1
        : (currentIndex + direction + options.length) % options.length;

  options[nextIndex].focus();
}

function enhanceSelect(select) {
  if (!select || customSelects.has(select)) return;

  const wrapper = document.createElement("div");
  wrapper.className = "custom-select";

  const trigger = document.createElement("button");
  trigger.className = "custom-select-trigger";
  trigger.type = "button";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", select.getAttribute("aria-label") || "Selecionar");

  const label = document.createElement("span");
  const chevron = document.createElement("i");
  chevron.className = "fa-solid fa-chevron-down";

  trigger.append(label, chevron);

  const menu = document.createElement("div");
  menu.className = "custom-select-menu";
  menu.role = "listbox";
  menu.hidden = true;

  [...select.options].forEach(option => {
    const optionButton = document.createElement("button");
    optionButton.className = "custom-select-option";
    optionButton.type = "button";
    optionButton.role = "option";
    optionButton.dataset.value = option.value;
    optionButton.textContent = option.textContent;

    optionButton.addEventListener("click", () => {
      chooseCustomSelectOption(select, optionButton);
      trigger.focus();
    });

    optionButton.addEventListener("keydown", event => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveCustomSelectFocus(menu, optionButton, 1);
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveCustomSelectFocus(menu, optionButton, -1);
      }

      if (event.key === "Home") {
        event.preventDefault();
        moveCustomSelectFocus(menu, optionButton, "first");
      }

      if (event.key === "End") {
        event.preventDefault();
        moveCustomSelectFocus(menu, optionButton, "last");
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeCustomSelect(select);
        trigger.focus();
      }

      if (event.key === "Tab") {
        closeCustomSelect(select);
      }
    });

    menu.appendChild(optionButton);
  });

  select.before(wrapper);
  wrapper.append(select, trigger, menu);
  select.classList.add("filter-native-select");

  customSelects.set(select, {
    wrapper,
    trigger,
    label,
    menu,
  });

  trigger.addEventListener("click", () => openCustomSelect(select));

  trigger.addEventListener("keydown", event => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openCustomSelect(select, true);
    }

    if (event.key === "Escape") {
      closeCustomSelect(select);
    }
  });

  select.addEventListener("change", () => updateCustomSelect(select));
  updateCustomSelect(select);
}

function initializeCustomSelects() {
  [
    "statusFilter",
    "priorityFilter",
    "managerFilter",
    "managerStatusFilter",
    "locationFilter",
  ].forEach(id => enhanceSelect(document.getElementById(id)));

  document.addEventListener("click", event => {
    if (!event.target.closest(".custom-select")) {
      closeAllCustomSelects();
    }
  });

  window.addEventListener("resize", () => closeAllCustomSelects());
}

function filtered() {
  const search = document
    .getElementById("demandSearch")
    .value.trim()
    .toLocaleLowerCase("pt-BR");

  const status = document.getElementById("statusFilter").value;
  const priority = document.getElementById("priorityFilter").value;
  const manager = document.getElementById("managerFilter").value;
  const managerStatus = document.getElementById("managerStatusFilter").value;
  const location = document.getElementById("locationFilter").value;

  return state.demands.filter(item => {
    const managerName = item.manager?.trim() || "Gestor não informado";

    const text = `${demandCode(item)} ${item.lpu_number || ""} ${item.title} ${item.description} ${item.location_name || ""} ${item.location_subdivision_name || ""} ${managerName} ${item.responsible} ${item.requester || ""} ${item.manager_status || ""}`
      .toLocaleLowerCase("pt-BR");

    return (
      (!search || text.includes(search)) &&
      (!status || effectiveStatus(item) === status) &&
      (!priority || item.priority === priority) &&
      (!manager || managerName === manager) &&
      (!managerStatus || item.manager_status === managerStatus) &&
      (!location || item.location_name === location)
    );
  });
}

function demandSummary(item) {
  const project = demandProject(item);

  return `
    <div class="demand-summary">
      <strong title="${escapeHtml(project)}">
        ${escapeHtml(project)}
      </strong>

      <small title="${escapeHtml(item.description || "Sem descrição")}">
        ${escapeHtml(item.description || "Sem descrição")}
      </small>
    </div>
  `;
}

function row(item) {
  const status = effectiveStatus(item);
  const manager = item.manager?.trim() || "Gestor não informado";
  const project = demandProject(item);
  const location = [item.location_name, item.location_subdivision_name]
    .filter(Boolean)
    .join(" · ") || "—";

  return `
    <tr>
      <td title="${escapeHtml(location)}">${escapeHtml(location)}</td>

      <td title="${escapeHtml(item.lpu_number || "—")}">${escapeHtml(item.lpu_number || "—")}</td>

      <td>${demandSummary(item)}</td>

      <td
        class="${manager === "Gestor não informado" ? "manager-missing" : ""}"
        title="${escapeHtml(manager)}"
      >
        ${escapeHtml(manager)}
      </td>

      <td title="${escapeHtml(item.responsible || "—")}">${escapeHtml(item.responsible || "—")}</td>

      <td>
        <span class="priority-pill ${priorityClass(item.priority)}">
          ${escapeHtml(item.priority)}
        </span>
      </td>

      <td>
        <span class="status-pill ${statusClass(status)}">
          ${escapeHtml(status)}
        </span>
      </td>

      <td class="manager-status-cell" title="${escapeHtml(item.manager_status || "—")}">
        ${item.manager_status
          ? `<span class="status-pill ${statusClass(item.manager_status)}">${escapeHtml(item.manager_status)}</span>`
          : `<span class="table-dash">—</span>`}
      </td>

      <td>${formatDate(item.due_date)}</td>

      <td>
        <div class="action-buttons">
          <button
            class="action-btn"
            data-action="view"
            data-id="${item.id}"
            type="button"
            title="Visualizar"
            aria-label="Visualizar ${escapeHtml(project)}"
          >
            <i class="fa-regular fa-eye"></i>
          </button>

          <button
            class="action-btn"
            data-action="edit"
            data-id="${item.id}"
            type="button"
            title="Editar"
            aria-label="Editar ${escapeHtml(project)}"
          >
            <i class="fa-solid fa-pen"></i>
          </button>

          <button
            class="action-btn danger"
            data-action="delete"
            data-id="${item.id}"
            type="button"
            title="Excluir"
            aria-label="Excluir ${escapeHtml(project)}"
          >
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </div>
      </td>
    </tr>
  `;
}

function render() {
  const items = filtered();

  document.getElementById("allDemandsBody").innerHTML = items.length
    ? items.map(row).join("")
    : `
      <tr>
        <td colspan="10" class="empty-table">
          Nenhuma demanda corresponde aos filtros.
        </td>
      </tr>
    `;

  document.getElementById("tableCount").textContent =
    `${items.length} ${items.length === 1 ? "demanda exibida" : "demandas exibidas"}`;
}

async function handleAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const item = state.demands.find(demand => demand.id === button.dataset.id);
  if (!item) return;

  if (button.dataset.action === "view") {
    renderDemandDetail(item);
  }

  if (button.dataset.action === "edit") {
    location.href = `nova_demanda.html?id=${encodeURIComponent(item.id)}`;
  }

  if (button.dataset.action === "delete") {
    const confirmed = await confirmAction({
      title: "Excluir demanda",
      text: `A demanda “${demandProject(item)}” será removida permanentemente.`,
      confirmLabel: "Excluir demanda",
    });

    if (!confirmed) return;

    try {
      await removeDemand(item.id);
      showToast("Demanda excluída.", "success");
      render();
    } catch (error) {
      showToast(
        error.message || "Não foi possível excluir a demanda.",
        "error",
      );
    }
  }
}

function clearFilters() {
  document.getElementById("demandSearch").value = "";

  [
    "statusFilter",
    "priorityFilter",
    "managerFilter",
    "managerStatusFilter",
    "locationFilter",
  ].forEach(id => {
    const select = document.getElementById(id);
    select.value = "";
    updateCustomSelect(select);
  });

  closeAllCustomSelects();
  render();
}

bootPage(() => {
  populateFilters();
  initializeCustomSelects();

  document.getElementById("demandSearch").addEventListener("input", render);

  [
    "statusFilter",
    "priorityFilter",
    "managerFilter",
    "managerStatusFilter",
    "locationFilter",
  ].forEach(id => {
    document.getElementById(id).addEventListener("input", render);
  });

  document
    .getElementById("clearDemandFilters")
    .addEventListener("click", clearFilters);

  document
    .getElementById("allDemandsBody")
    .addEventListener("click", handleAction);

  document
    .getElementById("detailEditButton")
    .addEventListener("click", event => {
      location.href = `nova_demanda.html?id=${encodeURIComponent(event.currentTarget.dataset.id)}`;
    });

  render();

  const viewId = new URLSearchParams(location.search).get("view");

  if (viewId) {
    const item = state.demands.find(demand => demand.id === viewId);
    if (item) renderDemandDetail(item);
  }
});
