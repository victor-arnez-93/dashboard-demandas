import { bootPage } from "./shell.js";
import {
  state,
  activeCatalog,
  catalogItem,
  findOrCreateCatalog,
  locationSubdivisions,
  saveConverter,
  removeConverter,
  converterCode,
} from "./store.js";
import {
  escapeHtml,
  formatDate,
  statusClass,
  openModal,
  closeModal,
  showToast,
  renderConverterDetail,
  confirmAction,
} from "./ui.js";
import {
  smartName,
  smartSentence,
  bindSmartText,
  bindNumericOnly,
} from "./form-utils.js";

const otherFields = [
  ["converterServiceType", "converterServiceTypeOtherField", "converterServiceTypeOther"],
  ["converterStatus", "converterStatusOtherField", "converterStatusOther"],
  ["converterResponsible", "converterResponsibleOtherField", "converterResponsibleOther"],
];

function inputDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function defaultPeriod() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return { start: inputDate(start), end: inputDate(end) };
}

function applyDefaultFilters() {
  const period = defaultPeriod();
  document.getElementById("converterSearch").value = "";
  document.getElementById("converterStartDate").value = period.start;
  document.getElementById("converterEndDate").value = period.end;
  document.getElementById("converterLocationFilter").value = "";
  document.getElementById("converterEquipmentFilter").value = "";
  document.getElementById("converterManagerFilter").value = "";
}

function showAllRecords() {
  document.getElementById("converterSearch").value = "";
  document.getElementById("converterStartDate").value = "";
  document.getElementById("converterEndDate").value = "";
  document.getElementById("converterLocationFilter").value = "";
  document.getElementById("converterEquipmentFilter").value = "";
  document.getElementById("converterManagerFilter").value = "";
}

function options(items) {
  return items.map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("");
}

function populateSelects() {
  const locations = activeCatalog("locations");
  const responsibles = activeCatalog("responsibles");
  const managers = activeCatalog("managers");
  const locationSelect = document.getElementById("converterLocation");
  const responsibleSelect = document.getElementById("converterResponsible");
  const managerSelect = document.getElementById("converterManager");
  const locationFilter = document.getElementById("converterLocationFilter");
  const managerFilter = document.getElementById("converterManagerFilter");
  const currentLocation = locationSelect.value;
  const currentResponsible = responsibleSelect.value;
  const currentManager = managerSelect.value;
  const currentLocationFilter = locationFilter.value;
  const currentManagerFilter = managerFilter.value;

  locationSelect.innerHTML = `<option value="">Selecione</option>${options(locations)}`;
  responsibleSelect.innerHTML = `<option value="">Não informado</option>${options(responsibles)}<option value="__other__">Outro</option>`;
  managerSelect.innerHTML = `<option value="">Selecione</option>${options(managers)}`;
  locationFilter.innerHTML = `<option value="">Todos os polos</option>${locations.map(item => `<option>${escapeHtml(item.name)}</option>`).join("")}`;
  managerFilter.innerHTML = `<option value="">Todos os gestores</option>${managers.map(item => `<option>${escapeHtml(item.name)}</option>`).join("")}`;

  if ([...locationSelect.options].some(option => option.value === currentLocation)) locationSelect.value = currentLocation;
  if ([...responsibleSelect.options].some(option => option.value === currentResponsible)) responsibleSelect.value = currentResponsible;
  if ([...managerSelect.options].some(option => option.value === currentManager)) managerSelect.value = currentManager;
  if ([...locationFilter.options].some(option => option.value === currentLocationFilter)) locationFilter.value = currentLocationFilter;
  if ([...managerFilter.options].some(option => option.value === currentManagerFilter)) managerFilter.value = currentManagerFilter;
}

function populateSubdivisions(locationId, selectedId = "") {
  const location = catalogItem("locations", locationId);
  const field = document.getElementById("converterSubdivisionField");
  const select = document.getElementById("converterSubdivision");
  const visible = Boolean(location?.subdivision_label);
  field.hidden = !visible;
  document.getElementById("converterSubdivisionLabel").textContent = location?.subdivision_label || "Subdivisão";
  select.innerHTML = `<option value="">Não informado</option>${options(locationSubdivisions(locationId))}`;
  if ([...select.options].some(option => option.value === selectedId)) select.value = selectedId;
  if (!visible) select.value = "";
}

function toggleOther(selectId, fieldId, inputId) {
  const visible = document.getElementById(selectId).value === "__other__";
  document.getElementById(fieldId).hidden = !visible;
  document.getElementById(inputId).required = visible && ["converterServiceType", "converterStatus"].includes(selectId);
}

function resetForm() {
  document.getElementById("converterForm").reset();
  document.getElementById("converterId").value = "";
  document.getElementById("converterDate").value = inputDate(new Date());
  document.getElementById("converterQuantity").value = "1";
  document.getElementById("converterEquipmentType").value = "Conversor";
  document.getElementById("converterModalTitle").textContent = "Novo atendimento";
  document.getElementById("saveConverterButton").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Salvar registro`;
  populateSelects();
  populateSubdivisions("");
  otherFields.forEach(args => toggleOther(...args));
  document.querySelectorAll(".field.invalid").forEach(field => field.classList.remove("invalid"));
}

function valueFromSelect(selectId, otherId, mode = "name") {
  const select = document.getElementById(selectId);
  if (!select.value) return { id: null, name: "", other: false };
  if (select.value === "__other__") {
    const raw = document.getElementById(otherId).value;
    return {
      id: null,
      name: mode === "name" ? smartName(raw) : smartSentence(raw),
      other: true,
    };
  }
  return {
    id: select.value,
    name: select.options[select.selectedIndex]?.text || "",
    other: false,
  };
}

function collectDraft() {
  const locationId = document.getElementById("converterLocation").value;
  const subdivisionId = document.getElementById("converterSubdivision").value;
  const managerId = document.getElementById("converterManager").value;
  return {
    id: document.getElementById("converterId").value,
    lpu_number: document.getElementById("converterLpuNumber").value.trim(),
    project: smartSentence(document.getElementById("converterProject").value),
    service_date: document.getElementById("converterDate").value,
    location: catalogItem("locations", locationId),
    subdivision: (state.catalogs.locationSubdivisions || []).find(item => item.id === subdivisionId) || null,
    manager: catalogItem("managers", managerId),
    equipment_type: document.getElementById("converterEquipmentType").value,
    service_type: valueFromSelect("converterServiceType", "converterServiceTypeOther", "sentence"),
    quantity_replaced: Number.parseInt(document.getElementById("converterQuantity").value, 10) || 0,
    status: valueFromSelect("converterStatus", "converterStatusOther", "sentence"),
    responsible: valueFromSelect("converterResponsible", "converterResponsibleOther", "name"),
    issue_reason: smartSentence(document.getElementById("converterReason").value),
    notes: smartSentence(document.getElementById("converterNotes").value),
  };
}

function validateDraft(draft) {
  const checks = [
    ["converterLpuNumber", Boolean(draft.lpu_number)],
    ["converterProject", draft.project.length >= 3],
    ["converterDate", Boolean(draft.service_date)],
    ["converterLocation", Boolean(draft.location)],
    ["converterManager", Boolean(draft.manager)],
    ["converterEquipmentType", Boolean(draft.equipment_type)],
    ["converterServiceType", Boolean(draft.service_type.name)],
    ["converterQuantity", draft.quantity_replaced > 0],
    ["converterStatus", Boolean(draft.status.name)],
  ];
  let valid = true;
  document.querySelectorAll(".field.invalid").forEach(field => field.classList.remove("invalid"));
  checks.forEach(([id, ok]) => {
    document.getElementById(id)?.closest(".field")?.classList.toggle("invalid", !ok);
    if (!ok) valid = false;
  });
  [
    [draft.service_type, "converterServiceTypeOther"],
    [draft.status, "converterStatusOther"],
    [draft.responsible, "converterResponsibleOther"],
  ].forEach(([item, id]) => {
    if (item.other && !item.name) {
      document.getElementById(id)?.closest(".field")?.classList.add("invalid");
      valid = false;
    }
  });
  if (!valid) showToast("Revise os campos obrigatórios antes de salvar.", "error");
  return valid;
}

async function payloadFromDraft(draft) {
  let responsible = null;
  if (draft.responsible.name) {
    responsible = draft.responsible.id
      ? catalogItem("responsibles", draft.responsible.id)
      : await findOrCreateCatalog("responsibles", draft.responsible.name);
  }
  return {
    lpu_number: draft.lpu_number,
    project: draft.project,
    service_date: draft.service_date,
    location_id: draft.location?.id || null,
    location_name: draft.location?.name || null,
    location_subdivision_id: draft.subdivision?.id || null,
    location_subdivision_name: draft.subdivision?.name || null,
    manager_id: draft.manager?.id || null,
    manager_name: draft.manager?.name || null,
    equipment_type: draft.equipment_type,
    service_type: draft.service_type.name,
    quantity_replaced: draft.quantity_replaced,
    issue_reason: draft.issue_reason,
    status: draft.status.name,
    responsible_id: responsible?.id || null,
    responsible_name: responsible?.name || "",
    notes: draft.notes,
  };
}

function filtered() {
  const search = document.getElementById("converterSearch").value.trim().toLocaleLowerCase("pt-BR");
  const start = document.getElementById("converterStartDate").value;
  const end = document.getElementById("converterEndDate").value;
  const location = document.getElementById("converterLocationFilter").value;
  const equipment = document.getElementById("converterEquipmentFilter").value;
  const manager = document.getElementById("converterManagerFilter").value;
  return state.converters.filter(item => {
    const text = `${item.lpu_number || ""} ${item.project || ""} ${item.location_name || ""} ${item.location_subdivision_name || ""} ${item.manager_name || ""} ${item.equipment_type || ""} ${item.issue_reason || ""} ${item.notes || ""} ${item.service_type || ""} ${item.responsible_name || ""} ${item.status || ""}`.toLocaleLowerCase("pt-BR");
    return (!search || text.includes(search))
      && (!start || item.service_date >= start)
      && (!end || item.service_date <= end)
      && (!location || item.location_name === location)
      && (!equipment || item.equipment_type === equipment)
      && (!manager || item.manager_name === manager);
  });
}

function renderKpis(records) {
  const quantity = records.reduce((total, item) => total + Number(item.quantity_replaced || 0), 0);
  const locations = Object.entries(records.reduce((map, item) => {
    const location = item.location_name || "Polo não informado";
    map[location] = (map[location] || 0) + 1;
    return map;
  }, {})).sort((a, b) => b[1] - a[1]);
  const done = records.filter(item => item.status === "Concluído").length;
  document.getElementById("converterMonthRecords").textContent = records.length;
  document.getElementById("converterMonthQuantity").textContent = quantity;
  document.getElementById("converterTopLocation").textContent = locations[0]?.[0] || "—";
  document.getElementById("converterTopLocationText").textContent = locations[0]
    ? `${locations[0][1]} ${locations[0][1] === 1 ? "ocorrência" : "ocorrências"}`
    : "sem ocorrências";
  document.getElementById("converterDoneRate").textContent = `${Math.round(done / Math.max(records.length, 1) * 100)}%`;
}

function emptyTableMarkup() {
  if (!state.converters.length) {
    return `<tr class="converter-empty-row"><td colspan="10" class="empty-table"><div class="converter-empty-state"><i class="fa-solid fa-network-wired"></i><strong>Nenhum atendimento cadastrado ainda.</strong><span>Use “Novo atendimento” para registrar a primeira ocorrência.</span></div></td></tr>`;
  }
  const total = state.converters.length;
  return `<tr class="converter-empty-row"><td colspan="10" class="empty-table"><div class="converter-empty-state"><i class="fa-solid fa-filter-circle-xmark"></i><strong>Nenhum atendimento encontrado neste período.</strong><span>Existem ${total} ${total === 1 ? "registro cadastrado" : "registros cadastrados"} fora dos filtros selecionados. Nenhum dado foi apagado.</span><button class="btn-secondary converter-show-all" type="button" data-action="show-all"><i class="fa-solid fa-list"></i> Exibir todos</button></div></td></tr>`;
}

function renderTable(items) {
  document.getElementById("converterBody").innerHTML = items.length
    ? items.map(item => `<tr>
      <td><div class="converter-cell"><strong>${escapeHtml(item.location_name || "—")}</strong><small>${escapeHtml(item.location_subdivision_name || "")}</small></div></td>
      <td>${escapeHtml(item.lpu_number || "—")}</td>
      <td><div class="converter-cell"><strong>${escapeHtml(item.project || "Projeto não informado")}</strong><small>${escapeHtml(item.issue_reason || "Sem descrição")}</small></div></td>
      <td>${escapeHtml(item.manager_name || "—")}</td>
      <td>${escapeHtml(item.equipment_type || "—")}</td>
      <td>${escapeHtml(item.service_type || "—")}</td>
      <td>${Number(item.quantity_replaced || 0)}</td>
      <td>${formatDate(item.service_date)}</td>
      <td><span class="status-pill ${statusClass(item.status)}">${escapeHtml(item.status || "—")}</span></td>
      <td><div class="action-buttons"><button class="action-btn" data-action="view" data-id="${item.id}" type="button"><i class="fa-regular fa-eye"></i></button><button class="action-btn" data-action="edit" data-id="${item.id}" type="button"><i class="fa-solid fa-pen"></i></button><button class="action-btn danger" data-action="delete" data-id="${item.id}" type="button"><i class="fa-regular fa-trash-can"></i></button></div></td>
    </tr>`).join("")
    : emptyTableMarkup();
  const total = state.converters.length;
  document.getElementById("converterCount").textContent = total === 1
    ? `${items.length} de 1 registro exibido`
    : `${items.length} de ${total} registros exibidos`;
}

function renderAll() {
  populateSelects();
  const items = filtered();
  renderKpis(items);
  renderTable(items);
}

function setSelectValue(selectId, otherId, id, name) {
  const select = document.getElementById(selectId);
  const other = otherId ? document.getElementById(otherId) : null;
  if (id && [...select.options].some(option => option.value === id)) {
    select.value = id;
    if (other) other.value = "";
  } else if (name) {
    const matching = [...select.options].find(option => option.text === name);
    if (matching && matching.value !== "__other__") select.value = matching.value;
    else if (other) {
      select.value = "__other__";
      other.value = name;
    }
  } else {
    select.value = "";
    if (other) other.value = "";
  }
}

function editRecord(record) {
  resetForm();
  document.getElementById("converterId").value = record.id;
  document.getElementById("converterModalTitle").textContent = `Editar ${converterCode(record)}`;
  document.getElementById("saveConverterButton").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Salvar alterações`;
  document.getElementById("converterLpuNumber").value = record.lpu_number || "";
  document.getElementById("converterProject").value = record.project || "";
  document.getElementById("converterDate").value = record.service_date;
  setSelectValue("converterLocation", null, record.location_id, record.location_name);
  populateSubdivisions(record.location_id || "", record.location_subdivision_id || "");
  setSelectValue("converterManager", null, record.manager_id, record.manager_name);
  document.getElementById("converterEquipmentType").value = record.equipment_type || "Conversor";
  setSelectValue("converterServiceType", "converterServiceTypeOther", null, record.service_type);
  document.getElementById("converterQuantity").value = record.quantity_replaced || 1;
  setSelectValue("converterStatus", "converterStatusOther", null, record.status);
  setSelectValue("converterResponsible", "converterResponsibleOther", record.responsible_id, record.responsible_name);
  document.getElementById("converterReason").value = record.issue_reason || "";
  document.getElementById("converterNotes").value = record.notes || "";
  otherFields.forEach(args => toggleOther(...args));
  closeModal("converterDetailModal");
  openModal("converterModal");
}

async function handleTable(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "show-all") {
    showAllRecords();
    renderAll();
    return;
  }
  const record = state.converters.find(item => item.id === button.dataset.id);
  if (!record) return;
  if (button.dataset.action === "view") renderConverterDetail(record);
  if (button.dataset.action === "edit") editRecord(record);
  if (button.dataset.action === "delete") {
    const identifier = record.lpu_number ? `LPU ${record.lpu_number}` : record.project || "selecionado";
    const confirmed = await confirmAction({
      title: "Excluir atendimento",
      text: `O atendimento ${identifier} será removido permanentemente.`,
      confirmLabel: "Excluir registro",
    });
    if (!confirmed) return;
    try {
      await removeConverter(record.id);
      showToast("Registro excluído.", "success");
      renderAll();
    } catch (error) {
      showToast(error.message || "Não foi possível excluir o registro.", "error");
    }
  }
}

bootPage(() => {
  populateSelects();
  applyDefaultFilters();
  resetForm();
  otherFields.forEach(args => document.getElementById(args[0]).addEventListener("change", () => toggleOther(...args)));
  document.getElementById("converterLocation").addEventListener("change", event => populateSubdivisions(event.currentTarget.value));
  [
    ["converterProject", "sentence"],
    ["converterServiceTypeOther", "sentence"],
    ["converterStatusOther", "sentence"],
    ["converterResponsibleOther", "name"],
    ["converterReason", "sentence"],
    ["converterNotes", "sentence"],
  ].forEach(([id, mode]) => bindSmartText(document.getElementById(id), mode));
  bindNumericOnly(document.getElementById("converterQuantity"), { integer: true, min: 1 });
  document.getElementById("newConverterButton").addEventListener("click", () => {
    resetForm();
    openModal("converterModal");
  });
  document.getElementById("converterBody").addEventListener("click", handleTable);
  document.getElementById("converterDetailEditButton").addEventListener("click", event => {
    const record = state.converters.find(item => item.id === event.currentTarget.dataset.id);
    if (record) editRecord(record);
  });
  [
    "converterSearch",
    "converterStartDate",
    "converterEndDate",
    "converterLocationFilter",
    "converterEquipmentFilter",
    "converterManagerFilter",
  ].forEach(id => document.getElementById(id).addEventListener("input", renderAll));
  document.getElementById("clearConverterFilters").addEventListener("click", () => {
    applyDefaultFilters();
    renderAll();
  });
  document.getElementById("converterForm").addEventListener("submit", async event => {
    event.preventDefault();
    const draft = collectDraft();
    if (!validateDraft(draft)) return;
    const button = document.getElementById("saveConverterButton");
    try {
      button.disabled = true;
      button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Salvando...`;
      const payload = await payloadFromDraft(draft);
      await saveConverter(payload, draft.id || null);
      closeModal("converterModal");
      showToast(draft.id ? "Atendimento atualizado." : "Atendimento registrado.", "success");
      renderAll();
    } catch (error) {
      showToast(error.message || "Não foi possível salvar o atendimento.", "error");
    } finally {
      button.disabled = false;
      button.innerHTML = draft.id
        ? `<i class="fa-solid fa-floppy-disk"></i> Salvar alterações`
        : `<i class="fa-solid fa-floppy-disk"></i> Salvar registro`;
    }
  });
  renderAll();
});
