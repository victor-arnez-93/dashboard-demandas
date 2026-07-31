import {
  state, converterCode, findOrCreateCatalog, removeConverter, saveConverter,
} from "./store.js";
import { closeModal, escapeHtml, formatDate, openModal, showToast } from "./ui.js";
import { bindNumericOnly, bindSmartText, smartName, smartSentence } from "./form-utils.js";
import { populateCatalogSelects } from "./catalogs.js";
import { log } from "./logger.js";

let askConfirmation = null;
let afterChange = null;

const STANDARD_SERVICE_TYPES = ["Troca", "Manutenção", "Diagnóstico", "Instalação"];
const STANDARD_DIRECTIONS = ["UTP → Fibra", "Fibra → UTP", "Bidirecional"];
const STANDARD_STATUSES = ["Concluído", "Pendente", "Em andamento", "Aguardando material"];

function inputDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthRange() {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return { start: inputDate(start), end: inputDate(end) };
}

function setOtherField(selectId, fieldId) {
  const select = document.getElementById(selectId);
  const field = document.getElementById(fieldId);
  if (!select || !field) return;
  field.hidden = select.value !== "__other__";
  const input = field.querySelector("input,textarea");
  if (input) input.required = select.required && select.value === "__other__";
}

function bindOther(selectId, fieldId) {
  document.getElementById(selectId)?.addEventListener("change", () => setOtherField(selectId, fieldId));
}

function setSelectOrOther(selectId, otherId, value, standardValues = null, idValue = null) {
  const select = document.getElementById(selectId);
  const other = document.getElementById(otherId);
  if (!select || !other) return;
  if (idValue && [...select.options].some(option => option.value === idValue)) {
    select.value = idValue;
    other.value = "";
  } else if (standardValues && standardValues.includes(value)) {
    select.value = value;
    other.value = "";
  } else if (value) {
    select.value = "__other__";
    other.value = value;
  } else {
    select.value = "";
    other.value = "";
  }
  setOtherField(selectId, other.closest(".conditional-field")?.id);
}

function converterStatusClass(status = "") {
  const lower = status.toLocaleLowerCase("pt-BR");
  if (lower.includes("conclu")) return "concluida";
  if (lower.includes("pendente") || lower.includes("aguardando")) return "pendente";
  return "em-andamento";
}

function filteredConverters() {
  const search = document.getElementById("converterSearch")?.value.trim().toLocaleLowerCase("pt-BR") || "";
  const start = document.getElementById("converterStartFilter")?.value;
  const end = document.getElementById("converterEndFilter")?.value;
  const location = document.getElementById("converterLocationFilter")?.value || "";
  return state.converters.filter(item => {
    const searchable = `${converterCode(item)} ${item.location_name} ${item.point_reference || ""} ${item.issue_reason || ""} ${item.service_type || ""} ${item.status || ""}`.toLocaleLowerCase("pt-BR");
    return (!search || searchable.includes(search)) &&
      (!start || item.service_date >= start) &&
      (!end || item.service_date <= end) &&
      (!location || item.location_name === location);
  });
}

export function renderConverterSummary() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const current = state.converters.filter(item => {
    const date = new Date(`${item.service_date}T12:00:00`);
    return date.getFullYear() === year && date.getMonth() === month;
  });
  const quantity = current.reduce((total, item) => total + Number(item.quantity_replaced || 0), 0);
  const done = current.filter(item => item.status?.toLocaleLowerCase("pt-BR").includes("conclu")).length;
  const byLocation = current.reduce((map, item) => {
    map[item.location_name] = (map[item.location_name] || 0) + 1;
    return map;
  }, {});
  const top = Object.entries(byLocation).sort((a, b) => b[1] - a[1])[0];
  document.getElementById("converterMonthQuantity").textContent = quantity;
  document.getElementById("converterMonthRecords").textContent = current.length;
  document.getElementById("converterTopLocation").textContent = top?.[0] || "—";
  document.getElementById("converterTopLocationCount").textContent = top ? `${top[1]} ${top[1] === 1 ? "ocorrência" : "ocorrências"}` : "sem ocorrências";
  document.getElementById("converterDoneRate").textContent = `${Math.round(done / Math.max(current.length, 1) * 100)}%`;
  document.getElementById("navConverterCount").textContent = state.converters.length;
}

export function renderConverters() {
  const body = document.getElementById("converterBody");
  if (!body) return;
  const records = filteredConverters();
  body.innerHTML = records.length ? records.map(item => `<tr>
    <td>${converterCode(item)}</td>
    <td>${formatDate(item.service_date, { year: true })}</td>
    <td><strong>${escapeHtml(item.location_name)}</strong></td>
    <td>${escapeHtml(item.point_reference || "—")}</td>
    <td>${escapeHtml(item.service_type)}</td>
    <td>${escapeHtml(item.conversion_direction || "—")}</td>
    <td><strong>${Number(item.quantity_replaced || 0)}</strong></td>
    <td class="truncate-cell" title="${escapeHtml(item.issue_reason || "")}">${escapeHtml(item.issue_reason || "—")}</td>
    <td><span class="badge ${converterStatusClass(item.status)}">${escapeHtml(item.status)}</span></td>
    <td><div class="row-actions"><button type="button" data-converter-action="view" data-id="${item.id}" title="Ver"><i class="fa-regular fa-eye"></i></button><button type="button" data-converter-action="edit" data-id="${item.id}" title="Editar"><i class="fa-solid fa-pen"></i></button><button class="delete" type="button" data-converter-action="delete" data-id="${item.id}" title="Excluir"><i class="fa-regular fa-trash-can"></i></button></div></td>
  </tr>`).join("") : `<tr><td colspan="10" class="empty-table">Nenhum registro de conversor corresponde aos filtros.</td></tr>`;
  document.getElementById("converterTableCount").textContent = `${records.length} ${records.length === 1 ? "registro exibido" : "registros exibidos"}`;
  renderConverterSummary();
}

function resetForm() {
  document.getElementById("converterForm").reset();
  document.getElementById("converterId").value = "";
  document.getElementById("converterModalTitle").textContent = "Novo registro de conversor";
  document.getElementById("converterDate").value = inputDate(new Date());
  document.getElementById("converterQuantity").value = "1";
  document.getElementById("converterServiceType").value = "Troca";
  document.getElementById("converterStatus").value = "Concluído";
  [
    ["converterLocation", "converterLocationOtherField"],
    ["converterServiceType", "converterServiceTypeOtherField"],
    ["converterDirection", "converterDirectionOtherField"],
    ["converterStatus", "converterStatusOtherField"],
    ["converterResponsible", "converterResponsibleOtherField"],
  ].forEach(([select, field]) => setOtherField(select, field));
}

function openForm(record = null) {
  populateCatalogSelects();
  resetForm();
  if (record) {
    document.getElementById("converterId").value = record.id;
    document.getElementById("converterModalTitle").textContent = `Editar ${converterCode(record)}`;
    document.getElementById("converterDate").value = record.service_date;
    setSelectOrOther("converterLocation", "converterLocationOther", record.location_name, null, record.location_id);
    document.getElementById("converterPoint").value = record.point_reference || "";
    setSelectOrOther("converterServiceType", "converterServiceTypeOther", record.service_type, STANDARD_SERVICE_TYPES);
    setSelectOrOther("converterDirection", "converterDirectionOther", record.conversion_direction, STANDARD_DIRECTIONS);
    document.getElementById("converterQuantity").value = record.quantity_replaced || 1;
    setSelectOrOther("converterStatus", "converterStatusOther", record.status, STANDARD_STATUSES);
    setSelectOrOther("converterResponsible", "converterResponsibleOther", record.responsible_name, null, record.responsible_id);
    document.getElementById("converterReason").value = record.issue_reason || "";
    document.getElementById("converterNotes").value = record.notes || "";
  }
  openModal("converterModal");
}

async function resolveCatalogSelection(selectId, otherId, type, required = false) {
  const select = document.getElementById(selectId);
  if (!select.value) {
    if (required) throw new Error(`Selecione ${type === "locations" ? "um local" : "um responsável"}.`);
    return null;
  }
  if (select.value !== "__other__") {
    return state.catalogs[type].find(item => item.id === select.value) || null;
  }
  const value = smartName(document.getElementById(otherId).value);
  document.getElementById(otherId).value = value;
  if (!value) throw new Error("Preencha a opção “Outro” antes de salvar.");
  return findOrCreateCatalog(type, value);
}

function selectedText(selectId, otherId, transform = smartSentence) {
  const select = document.getElementById(selectId);
  if (select.value === "__other__") {
    const input = document.getElementById(otherId);
    input.value = transform(input.value);
    return input.value;
  }
  return select.value;
}

async function submitForm(event) {
  event.preventDefault();
  const button = document.getElementById("saveConverterButton");
  try {
    button.disabled = true;
    const location = await resolveCatalogSelection("converterLocation", "converterLocationOther", "locations", true);
    const responsible = await resolveCatalogSelection("converterResponsible", "converterResponsibleOther", "responsibles", false);
    const serviceType = selectedText("converterServiceType", "converterServiceTypeOther");
    const direction = selectedText("converterDirection", "converterDirectionOther");
    const status = selectedText("converterStatus", "converterStatusOther");
    if (!serviceType || !status) throw new Error("Revise o tipo de atendimento e o status.");

    const id = document.getElementById("converterId").value || null;
    await saveConverter({
      service_date: document.getElementById("converterDate").value,
      location_id: location.id,
      location_name: location.name,
      point_reference: smartSentence(document.getElementById("converterPoint").value),
      service_type: serviceType,
      conversion_direction: direction || null,
      quantity_replaced: Number(document.getElementById("converterQuantity").value || 1),
      issue_reason: smartSentence(document.getElementById("converterReason").value),
      status,
      responsible_id: responsible?.id || null,
      responsible_name: responsible?.name || null,
      notes: smartSentence(document.getElementById("converterNotes").value),
    }, id);
    closeModal("converterModal");
    populateCatalogSelects();
    renderConverters();
    afterChange?.();
    showToast(id ? "Registro atualizado com sucesso." : "Registro de conversor criado com sucesso.", "success");
  } catch (error) {
    log.error("CONVERSORES", "Falha ao salvar registro.", error);
    showToast(`Não foi possível salvar: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
}

function showDetail(record) {
  document.getElementById("converterDetailCode").textContent = converterCode(record);
  document.getElementById("converterDetailTitle").textContent = `${record.service_type} em ${record.location_name}`;
  const cells = [
    ["Data", formatDate(record.service_date, { year: true })],
    ["Local", record.location_name],
    ["Ponto / referência", record.point_reference || "—"],
    ["Tipo de atendimento", record.service_type],
    ["Conversão", record.conversion_direction || "—"],
    ["Quantidade trocada", String(record.quantity_replaced || 0)],
    ["Status", record.status],
    ["Responsável", record.responsible_name || "—"],
    ["Motivo / problema", record.issue_reason || "—", true],
    ["Observações", record.notes || "—", true],
  ];
  document.getElementById("converterDetailContent").innerHTML = cells.map(([label, value, full]) => `<div class="detail-block ${full ? "full" : ""}"><small>${escapeHtml(label)}</small>${full ? `<p>${escapeHtml(value)}</p>` : `<strong>${escapeHtml(value)}</strong>`}</div>`).join("");
  document.getElementById("converterDetailEditButton").dataset.id = record.id;
  openModal("converterDetailModal");
}

function bindTableActions() {
  document.getElementById("converterBody").addEventListener("click", event => {
    const button = event.target.closest("[data-converter-action]");
    if (!button) return;
    const record = state.converters.find(item => item.id === button.dataset.id);
    if (!record) return;
    if (button.dataset.converterAction === "view") return showDetail(record);
    if (button.dataset.converterAction === "edit") return openForm(record);
    askConfirmation?.("Excluir registro de conversor", `O registro ${converterCode(record)} será removido permanentemente.`, async () => {
      try {
        await removeConverter(record.id);
        renderConverters();
        afterChange?.();
        showToast("Registro excluído com sucesso.", "success");
      } catch (error) {
        log.error("CONVERSORES", "Falha ao excluir.", error);
        showToast("Não foi possível excluir o registro.", "error");
      }
    });
  });
}

function resetFilters() {
  const range = monthRange();
  document.getElementById("converterSearch").value = "";
  document.getElementById("converterStartFilter").value = range.start;
  document.getElementById("converterEndFilter").value = range.end;
  document.getElementById("converterLocationFilter").value = "";
  renderConverters();
}

export function initConverters(options = {}) {
  askConfirmation = options.askConfirmation;
  afterChange = options.afterChange;
  const range = monthRange();
  document.getElementById("converterStartFilter").value = range.start;
  document.getElementById("converterEndFilter").value = range.end;
  document.getElementById("newConverterButton").addEventListener("click", () => openForm());
  document.getElementById("converterForm").addEventListener("submit", submitForm);
  document.getElementById("converterDetailEditButton").addEventListener("click", event => {
    const record = state.converters.find(item => item.id === event.currentTarget.dataset.id);
    closeModal("converterDetailModal");
    if (record) openForm(record);
  });
  ["converterSearch", "converterStartFilter", "converterEndFilter", "converterLocationFilter"].forEach(id => {
    const element = document.getElementById(id);
    element.addEventListener(id === "converterSearch" ? "input" : "change", renderConverters);
  });
  document.getElementById("clearConverterFilters").addEventListener("click", resetFilters);
  [
    ["converterLocation", "converterLocationOtherField"],
    ["converterServiceType", "converterServiceTypeOtherField"],
    ["converterDirection", "converterDirectionOtherField"],
    ["converterStatus", "converterStatusOtherField"],
    ["converterResponsible", "converterResponsibleOtherField"],
  ].forEach(([select, field]) => bindOther(select, field));
  bindNumericOnly(document.getElementById("converterQuantity"), { integer: true, min: 1 });
  bindSmartText(document.getElementById("converterLocationOther"), "name");
  bindSmartText(document.getElementById("converterResponsibleOther"), "name");
  bindSmartText(document.getElementById("converterPoint"), "sentence");
  bindTableActions();
  populateCatalogSelects();
  renderConverters();
}
