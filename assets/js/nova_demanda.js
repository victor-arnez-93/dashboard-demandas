import { bootPage } from "./shell.js";
import {
  state,
  activeCatalog,
  catalogItem,
  findOrCreateCatalog,
  locationSubdivisions,
  saveDemand,
  demandCode,
  demandProject,
} from "./store.js";
import { showToast } from "./ui.js";
import { bindSmartText, bindNumericOnly, smartName, smartSentence, numberValue } from "./form-utils.js";

const catalogFields = [
  { type: "responsibles", select: "demandResponsible", other: "demandResponsibleOther", field: "demandResponsibleOtherField", required: true },
  { type: "managers", select: "demandManager", other: "demandManagerOther", field: "demandManagerOtherField", required: true },
  { type: "departments", select: "demandDepartment", other: "demandDepartmentOther", field: "demandDepartmentOtherField", required: false },
];

function inputDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function optionMarkup(item) {
  return `<option value="${item.id}">${item.name}</option>`;
}

function populateCatalogs() {
  catalogFields.forEach(({ type, select, required }) => {
    const element = document.getElementById(select);
    const current = element.value;
    element.innerHTML = `<option value="">${required ? "Selecione" : "Não informado"}</option>${activeCatalog(type).map(optionMarkup).join("")}<option value="__other__">Outro</option>`;
    if ([...element.options].some(option => option.value === current)) element.value = current;
  });

  const location = document.getElementById("demandLocation");
  const current = location.value;
  location.innerHTML = `<option value="">Selecione</option>${activeCatalog("locations").map(optionMarkup).join("")}`;
  if ([...location.options].some(option => option.value === current)) location.value = current;
}

function populateSubdivisions(locationId, selectedId = "") {
  const location = catalogItem("locations", locationId);
  const items = locationSubdivisions(locationId);
  const field = document.getElementById("demandSubdivisionField");
  const select = document.getElementById("demandSubdivision");
  const visible = Boolean(location?.subdivision_label);
  field.hidden = !visible;
  document.getElementById("demandSubdivisionLabel").textContent = location?.subdivision_label || "Subdivisão";
  select.innerHTML = `<option value="">Não informado</option>${items.map(optionMarkup).join("")}`;
  if ([...select.options].some(option => option.value === selectedId)) select.value = selectedId;
  if (!visible) select.value = "";
}

function toggleOther(config) {
  const select = document.getElementById(config.select);
  const field = document.getElementById(config.field);
  const input = document.getElementById(config.other);
  const visible = select.value === "__other__";
  field.hidden = !visible;
  input.required = visible && config.required;
  if (!visible) input.closest(".field")?.classList.remove("invalid");
}

function catalogDraft(config) {
  const selected = document.getElementById(config.select).value;
  if (!selected) return { id: null, name: "", isOther: false };
  if (selected === "__other__") return { id: null, name: smartName(document.getElementById(config.other).value), isOther: true };
  const item = catalogItem(config.type, selected);
  return { id: item?.id || null, name: item?.name || "", isOther: false };
}

function collectDraft() {
  const catalogs = Object.fromEntries(catalogFields.map(config => [config.type, catalogDraft(config)]));
  const locationId = document.getElementById("demandLocation").value;
  const subdivisionId = document.getElementById("demandSubdivision").value;
  return {
    id: document.getElementById("demandId").value,
    lpu_number: document.getElementById("demandLpuNumber").value.trim(),
    title: smartSentence(document.getElementById("demandTitle").value),
    description: smartSentence(document.getElementById("demandDescription").value),
    requester: smartName(document.getElementById("demandRequester").value),
    catalogs,
    location: catalogItem("locations", locationId),
    subdivision: (state.catalogs.locationSubdivisions || []).find(item => item.id === subdivisionId) || null,
    priority: document.getElementById("demandPriority").value,
    status: document.getElementById("demandStatus").value,
    manager_status: document.getElementById("demandManagerStatus").value,
    start_date: document.getElementById("demandStartDate").value,
    due_date: document.getElementById("demandDueDate").value,
    estimated_hours: numberValue(document.getElementById("demandEstimatedHours").value),
    actual_hours: numberValue(document.getElementById("demandActualHours").value),
    tags: document.getElementById("demandTags").value.split(",").map(item => smartSentence(item)).filter(Boolean),
    notes: smartSentence(document.getElementById("demandNotes").value),
  };
}

function setInvalid(id, invalid) {
  document.getElementById(id)?.closest(".field")?.classList.toggle("invalid", invalid);
}

function validateDraft(draft) {
  document.querySelectorAll(".field.invalid").forEach(field => field.classList.remove("invalid"));
  let valid = true;
  const checks = [
    ["demandLpuNumber", Boolean(draft.lpu_number)],
    ["demandTitle", draft.title.length >= 4],
    ["demandDescription", draft.description.length >= 5],
    ["demandResponsible", Boolean(draft.catalogs.responsibles.name)],
    ["demandManager", Boolean(draft.catalogs.managers.name)],
    ["demandLocation", Boolean(draft.location)],
    ["demandStartDate", Boolean(draft.start_date)],
    ["demandDueDate", Boolean(draft.due_date)],
  ];
  checks.forEach(([id, ok]) => { setInvalid(id, !ok); if (!ok) valid = false; });
  catalogFields.forEach(config => {
    const item = draft.catalogs[config.type];
    if (item.isOther && !item.name) {
      setInvalid(config.other, true);
      valid = false;
    }
  });
  if (draft.start_date && draft.due_date && draft.due_date < draft.start_date) {
    setInvalid("demandDueDate", true);
    showToast("O prazo não pode ser anterior à data de entrada.", "error");
    valid = false;
  }
  const duplicate = state.demands.some(item =>
    item.id !== draft.id &&
    demandProject(item).localeCompare(draft.title, "pt-BR", { sensitivity: "accent" }) === 0 &&
    (item.manager?.trim() || "Gestor não informado").localeCompare(draft.catalogs.managers.name, "pt-BR", { sensitivity: "accent" }) === 0
  );
  if (duplicate) {
    setInvalid("demandTitle", true);
    showToast("Já existe uma demanda com o mesmo título para este gestor.", "error");
    valid = false;
  }
  if (!valid) showToast("Revise os campos destacados antes de salvar.", "error");
  return valid;
}

async function resolveCatalogs(draft) {
  const result = {};
  for (const config of catalogFields) {
    const item = draft.catalogs[config.type];
    if (!item.name) { result[config.type] = null; continue; }
    result[config.type] = item.id ? catalogItem(config.type, item.id) : await findOrCreateCatalog(config.type, item.name);
  }
  return result;
}

function payloadFrom(draft, catalogs) {
  return {
    lpu_number: draft.lpu_number,
    title: draft.title,
    description: draft.description,
    requester: draft.requester,
    responsible: catalogs.responsibles?.name || "",
    responsible_id: catalogs.responsibles?.id || null,
    manager: catalogs.managers?.name || "",
    manager_id: catalogs.managers?.id || null,
    manager_status: draft.manager_status,
    location_id: draft.location?.id || null,
    location_name: draft.location?.name || null,
    location_subdivision_id: draft.subdivision?.id || null,
    location_subdivision_name: draft.subdivision?.name || null,
    department: catalogs.departments?.name || "",
    department_id: catalogs.departments?.id || null,
    priority: draft.priority,
    status: draft.status,
    start_date: draft.start_date,
    due_date: draft.due_date,
    estimated_hours: draft.estimated_hours,
    actual_hours: draft.actual_hours,
    tags: draft.tags,
    notes: draft.notes,
  };
}

function resetForm() {
  const form = document.getElementById("demandForm");
  form.reset();
  document.getElementById("demandId").value = "";
  document.getElementById("demandFormHeading").textContent = "Nova demanda";
  document.getElementById("saveDemandButton").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Salvar demanda`;
  const today = new Date();
  const due = new Date();
  due.setDate(due.getDate() + 7);
  document.getElementById("demandStartDate").value = inputDate(today);
  document.getElementById("demandDueDate").value = inputDate(due);
  document.getElementById("demandPriority").value = "Normal";
  document.getElementById("demandStatus").value = "Pendente";
  document.getElementById("demandManagerStatus").value = "Solicitado";
  populateCatalogs();
  populateSubdivisions("");
  catalogFields.forEach(toggleOther);
  document.querySelectorAll(".field.invalid").forEach(field => field.classList.remove("invalid"));
}

function setCatalogValue(config, id, name) {
  const select = document.getElementById(config.select);
  const other = document.getElementById(config.other);
  if (id && [...select.options].some(option => option.value === id)) {
    select.value = id;
    other.value = "";
  } else if (name) {
    select.value = "__other__";
    other.value = name;
  } else {
    select.value = "";
    other.value = "";
  }
  toggleOther(config);
}

function loadDemand(id) {
  const demand = state.demands.find(item => item.id === id);
  if (!demand) {
    showToast("A demanda solicitada não foi encontrada.", "error");
    return;
  }
  document.getElementById("demandId").value = demand.id;
  document.getElementById("demandFormHeading").textContent = `Editar ${demandCode(demand)}`;
  document.getElementById("saveDemandButton").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Salvar alterações`;
  document.getElementById("demandLpuNumber").value = demand.lpu_number || "";
  document.getElementById("demandTitle").value = demandProject(demand);
  document.getElementById("demandDescription").value = demand.description;
  document.getElementById("demandRequester").value = demand.requester || "";
  const values = {
    responsibles: [demand.responsible_id, demand.responsible],
    managers: [demand.manager_id, demand.manager],
    departments: [demand.department_id, demand.department],
  };
  catalogFields.forEach(config => setCatalogValue(config, ...values[config.type]));
  document.getElementById("demandLocation").value = demand.location_id || "";
  populateSubdivisions(demand.location_id || "", demand.location_subdivision_id || "");
  document.getElementById("demandPriority").value = demand.priority;
  document.getElementById("demandStatus").value = demand.status;
  document.getElementById("demandManagerStatus").value = demand.manager_status || "Solicitado";
  document.getElementById("demandStartDate").value = demand.start_date;
  document.getElementById("demandDueDate").value = demand.due_date;
  document.getElementById("demandEstimatedHours").value = demand.estimated_hours || "";
  document.getElementById("demandActualHours").value = demand.actual_hours || "";
  document.getElementById("demandTags").value = (demand.tags || []).join(", ");
  document.getElementById("demandNotes").value = demand.notes || "";
}

bootPage(() => {
  populateCatalogs();
  resetForm();
  catalogFields.forEach(config => document.getElementById(config.select).addEventListener("change", () => toggleOther(config)));
  document.getElementById("demandLocation").addEventListener("change", event => populateSubdivisions(event.currentTarget.value));
  [
    ["demandTitle", "sentence"], ["demandDescription", "sentence"], ["demandRequester", "name"],
    ["demandResponsibleOther", "name"], ["demandManagerOther", "name"], ["demandDepartmentOther", "name"],
    ["demandNotes", "sentence"],
  ].forEach(([id, mode]) => bindSmartText(document.getElementById(id), mode));
  bindNumericOnly(document.getElementById("demandEstimatedHours"));
  bindNumericOnly(document.getElementById("demandActualHours"));
  document.getElementById("resetDemandButton").addEventListener("click", resetForm);
  document.getElementById("demandForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("saveDemandButton");
    const draft = collectDraft();
    if (!validateDraft(draft)) return;
    try {
      button.disabled = true;
      button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Salvando...`;
      const catalogs = await resolveCatalogs(draft);
      await saveDemand(payloadFrom(draft, catalogs), draft.id || null);
      showToast(draft.id ? "Demanda atualizada com sucesso." : "Demanda criada com sucesso.", "success");
      location.href = "demandas.html";
    } catch (error) {
      showToast(error.message || "Não foi possível salvar a demanda.", "error");
      button.disabled = false;
      button.innerHTML = draft.id ? `<i class="fa-solid fa-floppy-disk"></i> Salvar alterações` : `<i class="fa-solid fa-floppy-disk"></i> Salvar demanda`;
    }
  });
  const id = new URLSearchParams(location.search).get("id");
  if (id) loadDemand(id);
});
