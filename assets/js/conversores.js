import { bootPage } from "./shell.js";
import { state, activeCatalog, catalogItem, findOrCreateCatalog, saveConverter, removeConverter, converterCode } from "./store.js";
import { escapeHtml, formatDate, statusClass, openModal, closeModal, showToast, renderConverterDetail, confirmAction } from "./ui.js";
import { smartName, smartSentence, bindSmartText, bindNumericOnly } from "./form-utils.js";

const otherFields = [
  ["converterLocation", "converterLocationOtherField", "converterLocationOther"],
  ["converterServiceType", "converterServiceTypeOtherField", "converterServiceTypeOther"],
  ["converterDirection", "converterDirectionOtherField", "converterDirectionOther"],
  ["converterStatus", "converterStatusOtherField", "converterStatusOther"],
  ["converterResponsible", "converterResponsibleOtherField", "converterResponsibleOther"],
];

function inputDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function populateSelects() {
  const locations = activeCatalog("locations");
  const responsibles = activeCatalog("responsibles");
  const locationSelect = document.getElementById("converterLocation");
  const responsibleSelect = document.getElementById("converterResponsible");
  const locationFilter = document.getElementById("converterLocationFilter");
  const currentLocation = locationSelect.value;
  const currentResponsible = responsibleSelect.value;
  locationSelect.innerHTML = `<option value="">Selecione</option>${locations.map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}<option value="__other__">Outro</option>`;
  responsibleSelect.innerHTML = `<option value="">Não informado</option>${responsibles.map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}<option value="__other__">Outro</option>`;
  locationFilter.innerHTML = `<option value="">Todos os locais</option>${locations.map(item => `<option>${escapeHtml(item.name)}</option>`).join("")}`;
  if ([...locationSelect.options].some(option => option.value === currentLocation)) locationSelect.value = currentLocation;
  if ([...responsibleSelect.options].some(option => option.value === currentResponsible)) responsibleSelect.value = currentResponsible;
}

function toggleOther(selectId, fieldId, inputId) {
  const visible = document.getElementById(selectId).value === "__other__";
  document.getElementById(fieldId).hidden = !visible;
  document.getElementById(inputId).required = visible && ["converterLocation", "converterServiceType", "converterStatus"].includes(selectId);
}

function resetForm() {
  document.getElementById("converterForm").reset();
  document.getElementById("converterId").value = "";
  document.getElementById("converterDate").value = inputDate(new Date());
  document.getElementById("converterQuantity").value = "1";
  document.getElementById("converterModalTitle").textContent = "Novo atendimento";
  document.getElementById("saveConverterButton").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Salvar registro`;
  populateSelects();
  otherFields.forEach(args => toggleOther(...args));
}

function valueFromSelect(selectId, otherId, mode = "name") {
  const select = document.getElementById(selectId);
  if (!select.value) return { id: null, name: "", other: false };
  if (select.value === "__other__") {
    const raw = document.getElementById(otherId).value;
    return { id: null, name: mode === "name" ? smartName(raw) : smartSentence(raw), other: true };
  }
  return { id: select.value, name: select.options[select.selectedIndex]?.text || "", other: false };
}

function collectDraft() {
  return {
    id: document.getElementById("converterId").value,
    service_date: document.getElementById("converterDate").value,
    location: valueFromSelect("converterLocation", "converterLocationOther", "name"),
    point_reference: smartSentence(document.getElementById("converterPoint").value),
    service_type: valueFromSelect("converterServiceType", "converterServiceTypeOther", "sentence"),
    direction: valueFromSelect("converterDirection", "converterDirectionOther", "sentence"),
    quantity_replaced: Number.parseInt(document.getElementById("converterQuantity").value, 10) || 0,
    status: valueFromSelect("converterStatus", "converterStatusOther", "sentence"),
    responsible: valueFromSelect("converterResponsible", "converterResponsibleOther", "name"),
    issue_reason: smartSentence(document.getElementById("converterReason").value),
    notes: smartSentence(document.getElementById("converterNotes").value),
  };
}

function validateDraft(draft) {
  const checks = [
    ["converterDate", Boolean(draft.service_date)],
    ["converterLocation", Boolean(draft.location.name)],
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
    [draft.location, "converterLocationOther"],
    [draft.service_type, "converterServiceTypeOther"],
    [draft.direction, "converterDirectionOther"],
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
  const location = draft.location.id ? catalogItem("locations", draft.location.id) : await findOrCreateCatalog("locations", draft.location.name);
  let responsible = null;
  if (draft.responsible.name) responsible = draft.responsible.id ? catalogItem("responsibles", draft.responsible.id) : await findOrCreateCatalog("responsibles", draft.responsible.name);
  return {
    service_date: draft.service_date,
    location_id: location?.id || null,
    location_name: location?.name || draft.location.name,
    point_reference: draft.point_reference,
    service_type: draft.service_type.name,
    conversion_direction: draft.direction.name,
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
  return state.converters.filter(item => {
    const text = `${converterCode(item)} ${item.location_name} ${item.point_reference || ""} ${item.issue_reason || ""} ${item.service_type}`.toLocaleLowerCase("pt-BR");
    return (!search || text.includes(search)) && (!start || item.service_date >= start) && (!end || item.service_date <= end) && (!location || item.location_name === location);
  });
}

function renderKpis() {
  const today = new Date();
  const records = state.converters.filter(item => {
    const date = new Date(`${item.service_date}T12:00:00`);
    return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
  });
  const quantity = records.reduce((total, item) => total + Number(item.quantity_replaced || 0), 0);
  const locations = Object.entries(records.reduce((map, item) => {
    map[item.location_name] = (map[item.location_name] || 0) + 1;
    return map;
  }, {})).sort((a, b) => b[1] - a[1]);
  const done = records.filter(item => item.status === "Concluído").length;
  document.getElementById("converterMonthRecords").textContent = records.length;
  document.getElementById("converterMonthQuantity").textContent = quantity;
  document.getElementById("converterTopLocation").textContent = locations[0]?.[0] || "—";
  document.getElementById("converterTopLocationText").textContent = locations[0] ? `${locations[0][1]} ${locations[0][1] === 1 ? "ocorrência" : "ocorrências"}` : "sem ocorrências";
  document.getElementById("converterDoneRate").textContent = `${Math.round(done / Math.max(records.length, 1) * 100)}%`;
}

function renderTable() {
  const items = filtered();
  document.getElementById("converterBody").innerHTML = items.length ? items.map(item => `<tr>
    <td>${converterCode(item)}</td><td>${formatDate(item.service_date)}</td><td>${escapeHtml(item.location_name)}</td><td>${escapeHtml(item.point_reference || "—")}</td><td>${escapeHtml(item.service_type)}</td><td>${escapeHtml(item.conversion_direction || "—")}</td><td>${Number(item.quantity_replaced || 0)}</td><td>${escapeHtml(item.issue_reason || "—")}</td><td><span class="status-pill ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td><td><div class="action-buttons"><button class="action-btn" data-action="view" data-id="${item.id}"><i class="fa-regular fa-eye"></i></button><button class="action-btn" data-action="edit" data-id="${item.id}"><i class="fa-solid fa-pen"></i></button><button class="action-btn danger" data-action="delete" data-id="${item.id}"><i class="fa-regular fa-trash-can"></i></button></div></td>
  </tr>`).join("") : `<tr><td colspan="10" class="empty-table">Nenhum registro de conversor corresponde aos filtros.</td></tr>`;
  document.getElementById("converterCount").textContent = `${items.length} ${items.length === 1 ? "registro exibido" : "registros exibidos"}`;
}

function renderAll() {
  populateSelects();
  renderKpis();
  renderTable();
}

function setSelectValue(selectId, otherId, id, name) {
  const select = document.getElementById(selectId);
  const other = document.getElementById(otherId);
  if (id && [...select.options].some(option => option.value === id)) {
    select.value = id;
    other.value = "";
  } else if (name) {
    const matching = [...select.options].find(option => option.text === name);
    if (matching && matching.value !== "__other__") select.value = matching.value;
    else { select.value = "__other__"; other.value = name; }
  } else {
    select.value = "";
    other.value = "";
  }
}

function editRecord(record) {
  resetForm();
  document.getElementById("converterId").value = record.id;
  document.getElementById("converterModalTitle").textContent = `Editar ${converterCode(record)}`;
  document.getElementById("saveConverterButton").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Salvar alterações`;
  document.getElementById("converterDate").value = record.service_date;
  setSelectValue("converterLocation", "converterLocationOther", record.location_id, record.location_name);
  document.getElementById("converterPoint").value = record.point_reference || "";
  setSelectValue("converterServiceType", "converterServiceTypeOther", null, record.service_type);
  setSelectValue("converterDirection", "converterDirectionOther", null, record.conversion_direction);
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
  const record = state.converters.find(item => item.id === button.dataset.id);
  if (!record) return;
  if (button.dataset.action === "view") renderConverterDetail(record);
  if (button.dataset.action === "edit") editRecord(record);
  if (button.dataset.action === "delete") {
    const confirmed = await confirmAction({ title: "Excluir atendimento", text: `${converterCode(record)} será removido permanentemente.`, confirmLabel: "Excluir registro" });
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
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  document.getElementById("converterStartDate").value = inputDate(start);
  document.getElementById("converterEndDate").value = inputDate(today);
  resetForm();
  otherFields.forEach(args => document.getElementById(args[0]).addEventListener("change", () => toggleOther(...args)));
  [
    ["converterLocationOther", "name"], ["converterPoint", "sentence"], ["converterServiceTypeOther", "sentence"], ["converterDirectionOther", "sentence"], ["converterStatusOther", "sentence"], ["converterResponsibleOther", "name"], ["converterReason", "sentence"], ["converterNotes", "sentence"],
  ].forEach(([id, mode]) => bindSmartText(document.getElementById(id), mode));
  bindNumericOnly(document.getElementById("converterQuantity"), { integer: true, min: 1 });
  document.getElementById("newConverterButton").addEventListener("click", () => { resetForm(); openModal("converterModal"); });
  document.getElementById("converterBody").addEventListener("click", handleTable);
  document.getElementById("converterDetailEditButton").addEventListener("click", event => {
    const record = state.converters.find(item => item.id === event.currentTarget.dataset.id);
    if (record) editRecord(record);
  });
  ["converterSearch", "converterStartDate", "converterEndDate", "converterLocationFilter"].forEach(id => document.getElementById(id).addEventListener("input", renderTable));
  document.getElementById("clearConverterFilters").addEventListener("click", () => {
    document.getElementById("converterSearch").value = "";
    document.getElementById("converterStartDate").value = "";
    document.getElementById("converterEndDate").value = "";
    document.getElementById("converterLocationFilter").value = "";
    renderTable();
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
      button.innerHTML = draft.id ? `<i class="fa-solid fa-floppy-disk"></i> Salvar alterações` : `<i class="fa-solid fa-floppy-disk"></i> Salvar registro`;
    }
  });
  renderAll();
});
