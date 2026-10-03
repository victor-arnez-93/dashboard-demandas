import { bootPage } from "./shell.js";
import { state } from "./store.js";
import { showToast, openModal, closeModal, renderDemandDetail, renderConverterDetail } from "./ui.js";
import { readAll, canWritePhase2, saveAmount, phase2Rpc, migrationMissing, companyId } from "./phase2-api.js";
import { html, moneyCents, money, normalizeKey, executionRows, serviceDate, dateLabel, sheetRows, RESULT_LABELS } from "./phase2-rules.js";

const $ = id => document.getElementById(id);
let records = { demand: [], converter: [] };
let checks = [];
let lastItems = new Map();
let writable = false;
let amountReady = false;
let ready = false;
let loading = false;
let closingLimit = 50;
let resultLimit = 100;
let editRecord = null;
let workbook = null;
let fileInfo = null;
let preview = null;
let savedView = false;
let fileGeneration = 0;
let previewGeneration = 0;
let importBusy = false;

function scope() { return { kind: $("closingKind").value, month: $("closingMonth").value }; }
function project(record, kind = scope().kind) { return kind === "demand" ? record.title : record.project; }
function activities(record, kind = scope().kind) { return record.notes || ""; }
function manager(record, kind = scope().kind) { return kind === "demand" ? record.manager : record.manager_name; }
function responsible(record, kind = scope().kind) { return kind === "demand" ? record.responsible : record.responsible_name; }

function activateTab(id) {
  const buttons = [...document.querySelectorAll("[data-closing-tab]")];
  buttons.forEach(button => {
    const active = button.dataset.closingTab === id;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    $(button.dataset.closingTab).hidden = !active;
  });
}

function invalidatePreview(message = "") {
  ++previewGeneration;
  preview = null;
  savedView = false;
  $("billingReviewed").checked = false;
  $("saveBilling").disabled = true;
  $("billingResults").hidden = true;
  $("billingSaveFeedback").textContent = "";
  if (message) $("billingFeedback").textContent = message;
}

function checkFor(record) {
  const item = lastItems.get(record.id);
  if (!item) return { result: "unchecked", label: "Sem conferência" };
  const snapshot = item.snapshot || {};
  const currentCents = moneyCents(record.billable_amount);
  if (new Date(snapshot.updated_at).getTime() !== new Date(record.updated_at).getTime() ||
    snapshot.date !== serviceDate(scope().kind, record) || snapshot.expected_cents !== currentCents) {
    return { result: "stale", label: "Revisar: registro alterado" };
  }
  return { result: item.result, label: RESULT_LABELS[item.result] || "Revisar" };
}

function filteredClosing() {
  if (!ready) return [];
  const { kind, month } = scope();
  const search = normalizeKey($("closingSearch").value);
  return executionRows(kind, records[kind], month).filter(record => {
    const text = normalizeKey([record.lpu_number, project(record), record.description, record.issue_reason,
      record.location_name, record.location_subdivision_name, activities(record), manager(record), responsible(record)].join(" "));
    return (!search || text.includes(search)) &&
      (!$("closingManager").value || manager(record) === $("closingManager").value) &&
      (!$("closingStatus").value || record.status === $("closingStatus").value) &&
      (!$("closingOnlyPending").checked || checkFor(record).result !== "found");
  }).sort((a, b) => serviceDate(kind, a).localeCompare(serviceDate(kind, b)) || String(a.lpu_number || "").localeCompare(String(b.lpu_number || "")));
}

function renderClosing() {
  const { kind } = scope();
  const rows = filteredClosing();
  let total = 0;
  let valued = 0;
  let found = 0;
  rows.forEach(record => {
    const cents = moneyCents(record.billable_amount);
    if (cents !== null) { total += cents; valued++; }
    if (checkFor(record).result === "found") found++;
  });
  $("closingCount").textContent = rows.length;
  $("closingTotal").textContent = money(total);
  $("closingAmounts").textContent = `${valued} com valor · ${rows.length - valued} sem valor`;
  $("closingFound").textContent = found;
  $("closingPending").textContent = rows.length - found;
  $("closingVisibleCount").textContent = `${rows.length} registros nos filtros`;
  $("closingBody").innerHTML = rows.length ? rows.slice(0, closingLimit).map(record => {
    const conference = checkFor(record);
    return `<tr><td><strong>${html(record.lpu_number || "Não informado")}</strong>${kind === "converter" ? `<small>LPU agregada: ${html(record.project || "Não informada")}</small>` : ""}<small>${html(record.location_name || "")}</small></td>
      <td><strong>${html(project(record) || "—")}</strong>${html(record.description || record.issue_reason || "")}</td>
      <td>${dateLabel(serviceDate(kind, record))}</td><td><strong>${html(manager(record) || "—")}</strong><small>${html(responsible(record) || "—")}</small></td>
      <td>${html(record.status)}${kind === "demand" ? `<small>Gestor: ${html(record.manager_status || "—")}</small>` : ""}</td>
      <td>${html(activities(record) || "—")}</td><td>${html(money(moneyCents(record.billable_amount)))}</td>
      <td><span class="billing-tag billing-${html(conference.result)}">${html(conference.label)}</span></td>
      <td><div class="action-buttons"><button class="action-btn" type="button" data-closing-view="${record.id}" aria-label="Ver detalhes"><i class="fa-regular fa-eye"></i></button>
        ${writable && amountReady ? `<button class="action-btn" type="button" data-closing-amount="${record.id}" aria-label="Editar valor deste registro"><i class="fa-solid fa-dollar-sign"></i></button>` : ""}</div></td></tr>`;
  }).join("") : `<tr><td colspan="9" class="empty-table">${ready ? "Nenhuma execução corresponde à competência e aos filtros." : "Carregando dados..."}</td></tr>`;
  $("closingPagination").textContent = `${Math.min(closingLimit, rows.length)} de ${rows.length} registros`;
  $("moreClosing").hidden = closingLimit >= rows.length;
  $("exportClosing").disabled = !ready || !rows.length;
}

function fillClosingFilters() {
  const { kind, month } = scope();
  const rows = executionRows(kind, records[kind], month);
  for (const [id, getter] of [["closingManager", manager], ["closingStatus", row => row.status]]) {
    const previous = $(id).value;
    const values = [...new Set(rows.map(row => getter(row)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    $(id).innerHTML = `<option value="">Todos</option>${values.map(value => `<option value="${html(value)}">${html(value)}</option>`).join("")}`;
    if (values.includes(previous)) $(id).value = previous;
  }
  $("closingBasis").textContent = kind === "demand"
    ? "Demandas pela data de execução; quando ausente, pela conclusão. Canceladas são excluídas."
    : "Atendimentos concluídos/finalizados pela data do atendimento. Outros status não entram no fechamento.";
  $("billingMatch").innerHTML = kind === "demand" ? `<option value="identifier">Número LPU</option>`
    : `<option value="identifier">Número do chamado</option><option value="aggregate">LPU agregada (texto exato)</option>`;
}

async function loadChecks() {
  const { kind, month } = scope();
  checks = await readAll("fluux_billing_checks", query => query.eq("entity_kind", kind).eq("competence", `${month}-01`));
  checks.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  lastItems = new Map();
  if (checks.length) {
    // A última conferência substitui a evidência exibida, sem apagar as anteriores.
    const latest = checks.at(-1);
    const items = await readAll("fluux_billing_check_items", query => query.eq("check_id", latest.id));
    items.forEach(item => { if (item.entity_id) lastItems.set(item.entity_id, item); });
  }
  renderHistory();
}

async function reload() {
  if (loading) return;
  loading = true;
  ready = false;
  $("refreshClosing").disabled = true;
  $("closingMonth").disabled = true;
  $("closingKind").disabled = true;
  $("previewBilling").disabled = true;
  invalidatePreview();
  $("closingFeedback").textContent = "Carregando todos os registros da empresa...";
  try {
    const [demands, converters, permission] = await Promise.all([
      readAll("demands"), readAll("media_converter_records"), canWritePhase2(),
    ]);
    records = { demand: demands, converter: converters };
    writable = permission;
    // Dados não são copiados para um cadastro paralelo.
    ready = true;
    amountReady = [...demands, ...converters].some(row => Object.hasOwn(row, "billable_amount"));
    if (!demands.length && !converters.length) {
      const { error } = await (await import("./supabase-client.js")).getSupabase().from("demands").select("billable_amount").limit(1);
      if (error && !migrationMissing(error)) throw error;
      amountReady = !error;
    }
    let historyMessage = "";
    try { await loadChecks(); }
    catch (error) {
      checks = []; lastItems = new Map(); renderHistory();
      historyMessage = migrationMissing(error) ? " Conferência indisponível: aplique o SQL 03." : ` Histórico indisponível: ${error.message}`;
    }
    fillClosingFilters();
    closingLimit = 50;
    renderClosing();
    const noDate = demands.filter(row => row.status === "Concluída" && !row.execution_date && !row.completed_at).length;
    $("closingFeedback").textContent = `Dados atualizados.${!amountReady ? " Para editar valores, aplique o SQL 02." : ""}${historyMessage}${noDate ? ` ${noDate} demandas concluídas sem data não entram em uma competência; informe a data de execução correta.` : ""}${!writable ? " Acesso de leitura: alterações e confirmação estão desabilitadas." : ""}`;
  } catch (error) {
    ready = false;
    $("closingFeedback").textContent = `Não foi possível carregar o fechamento. ${error.message || "Tente novamente."}`;
  } finally {
    loading = false;
    $("refreshClosing").disabled = false;
    $("closingMonth").disabled = false;
    $("closingKind").disabled = false;
    $("previewBilling").disabled = !ready || !workbook || importBusy;
  }
}

function exportSheet(rows, fileName, title) {
  if (!window.XLSX) { showToast("A biblioteca de Excel não foi carregada.", "error"); return; }
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 24 }));
  if (sheet["!ref"]) sheet["!autofilter"] = { ref: sheet["!ref"] };
  XLSX.utils.book_append_sheet(book, sheet, title);
  XLSX.writeFile(book, fileName);
}

function exportClosing() {
  const { kind, month } = scope();
  const rows = filteredClosing().map(row => ({
    Competência: month, Origem: kind === "demand" ? "Demanda" : "Atendimento",
    Identificador: row.lpu_number || "", "LPU agregada": kind === "converter" ? row.project || "" : "",
    Projeto: project(row) || "", Descrição: row.description || row.issue_reason || "",
    Polo: row.location_name || "", Subdivisão: row.location_subdivision_name || "",
    Gestor: manager(row) || "", Responsável: responsible(row) || "", Status: row.status,
    "Status informado pelo gestor": row.manager_status || "", Execução: serviceDate(kind, row),
    "Atividades / resolução": activities(row), "Valor deste registro (R$)": row.billable_amount === null || row.billable_amount === undefined ? "" : Number(row.billable_amount),
    "Resultado da conferência": checkFor(row).label,
  }));
  if (rows.length) exportSheet(rows, `fluux_fechamento_${kind}_${month}.xlsx`, "Fechamento");
}

function selectedSheet() { return workbook?.Sheets[$("billingSheet").value]; }
function populateColumns() {
  invalidatePreview("Confira as colunas e o intervalo antes de gerar a prévia.");
  const sheet = selectedSheet();
  if (!sheet || !window.XLSX) return;
  const range = XLSX.utils.decode_range(sheet["!fullref"] || sheet["!ref"] || "A1");
  const header = Number($("billingHeader").value) - 1;
  if (!Number.isInteger(header) || header < 0 || header > 99 || range.e.c > 199) {
    $("billingFeedback").textContent = "Cabeçalho inválido ou mais de 200 colunas.";
    $("billingIdentifier").disabled = true;
    $("billingAmount").disabled = true;
    return;
  }
  let options = "";
  let guessedId = "";
  let guessedAmount = "";
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: header, c: col })];
    const name = String(cell?.v || "").trim();
    const key = normalizeKey(name);
    if (/^(NÚMERO LPU|NUMERO LPU|LPU|CHAMADO|NÚMERO DO CHAMADO|NUMERO DO CHAMADO)$/.test(key) && guessedId === "") guessedId = String(col);
    if (/^(VALOR|VALOR TOTAL|VALOR FATURADO|VALOR DO SERVIÇO|VALOR DO SERVICO)$/.test(key) && guessedAmount === "") guessedAmount = String(col);
    options += `<option value="${col}">${html(XLSX.utils.encode_col(col))} — ${html(name || "Sem título")}</option>`;
  }
  $("billingIdentifier").innerHTML = `<option value="">Selecione</option>${options}`;
  $("billingAmount").innerHTML = `<option value="">Sem comparação de valor</option>${options}`;
  $("billingIdentifier").value = guessedId;
  $("billingAmount").value = guessedAmount;
  $("billingIdentifier").disabled = false;
  $("billingAmount").disabled = false;
}

async function openFile(event) {
  const generation = ++fileGeneration;
  workbook = null; fileInfo = null;
  invalidatePreview();
  $("previewBilling").disabled = true;
  $("billingSheet").disabled = true;
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (!/\.xlsx$/i.test(file.name) || !file.size || file.size > 10 * 1024 * 1024) throw new Error("Selecione um arquivo .xlsx com até 10 MB.");
    if (!window.XLSX) throw new Error("A biblioteca de Excel não foi carregada.");
    if (!globalThis.crypto?.subtle) throw new Error("A importação precisa de HTTPS ou localhost para validar o arquivo.");
    $("billingFeedback").textContent = "Lendo a planilha localmente...";
    const buffer = await file.arrayBuffer();
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))].map(value => value.toString(16).padStart(2, "0")).join("");
    const parsed = XLSX.read(buffer, { type: "array", cellDates: false, cellFormula: true, sheetRows: 5101 });
    if (generation !== fileGeneration) return;
    if (!parsed.SheetNames.length || parsed.SheetNames.length > 100) throw new Error("Planilha sem abas ou com mais de 100 abas.");
    workbook = parsed;
    fileInfo = { name: file.name.slice(0, 240), hash };
    $("billingSheet").innerHTML = parsed.SheetNames.map(name => `<option value="${html(name)}">${html(name)}</option>`).join("");
    $("billingSheet").disabled = false;
    $("billingHeader").value = "1";
    $("billingLastRow").value = "";
    populateColumns();
    $("previewBilling").disabled = !ready;
  } catch (error) {
    if (generation !== fileGeneration) return;
    workbook = null; fileInfo = null;
    $("billingIdentifier").disabled = true;
    $("billingAmount").disabled = true;
    $("billingFeedback").textContent = error.message || "Não foi possível ler a planilha.";
  }
}

function toggleImportBusy(value) {
  importBusy = value;
  for (const id of ["closingMonth", "closingKind", "refreshClosing", "billingFile", "billingHeader", "billingLastRow", "billingMatch", "billingTolerance"]) $(id).disabled = value;
  for (const id of ["billingSheet", "billingIdentifier", "billingAmount"]) $(id).disabled = value || !workbook;
  $("previewBilling").disabled = value || !ready || !workbook;
  $("saveBilling").disabled = value || !writable || !preview || savedView || !$("billingReviewed").checked;
  $("billingReviewed").disabled = value;
}

async function compareBilling() {
  invalidatePreview();
  const generation = previewGeneration;
  toggleImportBusy(true);
  try {
    if (!ready || !workbook || !fileInfo) throw new Error("Carregue os dados e selecione uma planilha.");
    if ($("billingIdentifier").value === "") throw new Error("Selecione a coluna de identificador.");
    const tolerance = moneyCents($("billingTolerance").value);
    if (tolerance === null || tolerance > 100000) throw new Error("Tolerância entre R$ 0,00 e R$ 1.000,00.");
    const { kind, month } = scope();
    const rows = sheetRows(XLSX, selectedSheet(), $("billingHeader").value, $("billingIdentifier").value, $("billingAmount").value, $("billingLastRow").value);
    const request = { kind, competence: month, match_by: $("billingMatch").value,
      tolerance_cents: tolerance, file_name: fileInfo.name, file_hash: fileInfo.hash,
      mapping: { sheet: $("billingSheet").value, header_row: Number($("billingHeader").value), last_row: $("billingLastRow").value ? Number($("billingLastRow").value) : null,
        identifier_column: Number($("billingIdentifier").value), amount_column: $("billingAmount").value === "" ? null : Number($("billingAmount").value) }, rows };
    $("billingFeedback").textContent = "Conferindo com as execuções da empresa...";
    const result = await phase2Rpc("fluux_preview_billing", { p_request: request });
    if (generation !== previewGeneration) return;
    if (result.company_id !== companyId() || !Array.isArray(result.items) || !result.fingerprint) throw new Error("Resposta de conferência inválida.");
    preview = result;
    savedView = false;
    resultLimit = 100;
    $("billingFeedback").textContent = "Prévia pronta. Nenhuma conferência foi salva ainda.";
    renderResults();
  } catch (error) {
    $("billingFeedback").textContent = migrationMissing(error) ? "Aplique o SQL 03 para habilitar a conferência." : error.message || "Falha na conferência.";
  } finally { toggleImportBusy(false); }
}

function renderResults() {
  if (!preview) return;
  $("billingResults").hidden = false;
  $("billingResultTitle").textContent = savedView ? "Conferência salva" : "Prévia da conferência";
  $("billingSummary").innerHTML = `<span><b>${preview.executed ?? preview.items.filter(item => item.entity_id).length}</b> execuções</span>
    ${Object.entries(RESULT_LABELS).map(([key, label]) => `<span class="billing-${key}"><b>${preview.counts[key] || 0}</b> ${html(label)}</span>`).join("")}`;
  const request = preview.request;
  $("billingResultContext").textContent = `${request.competence} · ${request.kind === "demand" ? "Demandas" : "Conversores e PoE"} · ${request.match_by === "aggregate" ? "LPU agregada" : "Identificador"} · ${request.file_name}`;
  const items = preview.items.filter(item => !$("billingOnlyPending").checked || item.result !== "found");
  $("billingResultBody").innerHTML = items.length ? items.slice(0, resultLimit).map(item => `<tr><td>${html(item.identifier)}</td>
    <td><span class="billing-tag billing-${html(item.result)}">${html(RESULT_LABELS[item.result])}</span></td>
    <td>${html(money(item.expected_cents))}</td><td>${html(money(item.imported_cents))}</td>
    <td>${html((item.sheet_rows || []).join(", ") || "—")}</td><td>${html(item.reason)}</td></tr>`).join("") : `<tr><td colspan="6" class="empty-table">Nenhuma pendência neste resultado.</td></tr>`;
  $("billingPagination").textContent = `${Math.min(resultLimit, items.length)} de ${items.length} resultados`;
  $("moreBilling").hidden = resultLimit >= items.length;
  $("billingConfirmation").hidden = savedView || !writable;
  $("saveBilling").disabled = !writable || importBusy || !$("billingReviewed").checked || savedView;
}

async function confirmBilling() {
  if (!preview || savedView || !writable || !$("billingReviewed").checked || importBusy) return;
  toggleImportBusy(true);
  try {
    $("billingSaveFeedback").textContent = "Salvando a conferência...";
    await phase2Rpc("fluux_save_billing", { p_request: preview.request, p_fingerprint: preview.fingerprint });
    savedView = true;
    $("billingSaveFeedback").textContent = "Conferência salva. O status informado pelo gestor foi preservado.";
    $("billingFeedback").textContent = "Conferência salva. Consulte os eventos no histórico dos registros.";
    renderResults();
    await loadChecks();
    renderClosing();
    showToast("Conferência salva com histórico.", "success");
  } catch (error) {
    $("billingSaveFeedback").textContent = error.message || "Não foi possível salvar.";
  } finally { toggleImportBusy(false); }
}

function renderHistory() {
  $("billingHistoryBody").innerHTML = checks.length ? [...checks].reverse().map(check => `<tr>
    <td>${html(check.file_name)}</td><td>${html(new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(check.created_at)))}<br>${html(check.actor_name)}</td>
    <td>${check.match_by === "aggregate" ? "LPU agregada" : "Identificador"}</td><td>${Object.entries(RESULT_LABELS).map(([key, label]) => `${check.counts[key] || 0} ${label}`).join(" · ")}</td>
    <td><button type="button" class="btn-secondary btn-compact" data-open-check="${check.id}">Abrir</button></td></tr>`).join("")
    : `<tr><td colspan="5" class="empty-table">Nenhuma conferência salva disponível neste recorte.</td></tr>`;
}

async function openSavedCheck(id) {
  const check = checks.find(row => row.id === id);
  if (!check || importBusy) return;
  invalidatePreview();
  toggleImportBusy(true);
  try {
    const items = await readAll("fluux_billing_check_items", query => query.eq("check_id", id));
    preview = { items, counts: check.counts, request: { ...check.mapping, file_name: check.file_name, competence: check.competence.slice(0, 7), kind: check.entity_kind, match_by: check.match_by } };
    savedView = true;
    resultLimit = 100;
    $("billingFeedback").textContent = "Resultado histórico. Os dados refletem o momento em que a conferência foi salva.";
    renderResults();
    activateTab("panelImport");
  } catch (error) { showToast(error.message || "Não foi possível abrir a conferência.", "error"); }
  finally { toggleImportBusy(false); }
}

bootPage(async () => {
  const date = new Date();
  $("closingMonth").value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const params = new URLSearchParams(location.search);
  const requestedMonth = params.get("month");
  const requestedKind = params.get("kind");
  if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(requestedMonth || "")) $("closingMonth").value = requestedMonth;
  if (["demand", "converter"].includes(requestedKind)) $("closingKind").value = requestedKind;
  document.querySelectorAll("[data-closing-tab]").forEach((button, index, all) => {
    button.addEventListener("click", () => activateTab(button.dataset.closingTab));
    button.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? all.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + all.length) % all.length;
      activateTab(all[next].dataset.closingTab); all[next].focus();
    });
  });
  $("refreshClosing").addEventListener("click", reload);
  for (const id of ["closingMonth", "closingKind"]) $(id).addEventListener("change", async () => {
    if (!$("closingMonth").value) { $("closingMonth").value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
    invalidatePreview("O recorte mudou. Gere uma nova prévia.");
    await reload();
  });
  for (const id of ["closingSearch", "closingManager", "closingStatus", "closingOnlyPending"]) $(id).addEventListener("input", () => { closingLimit = 50; renderClosing(); });
  $("moreClosing").addEventListener("click", () => { closingLimit += 50; renderClosing(); });
  $("exportClosing").addEventListener("click", exportClosing);
  $("closingBody").addEventListener("click", event => {
    const button = event.target.closest("[data-closing-view], [data-closing-amount]");
    if (!button) return;
    const { kind } = scope();
    const record = records[kind].find(row => row.id === (button.dataset.closingView || button.dataset.closingAmount));
    if (!record) return;
    if (button.dataset.closingView) { (kind === "demand" ? renderDemandDetail : renderConverterDetail)(record); return; }
    if (!writable || !amountReady) return;
    editRecord = { kind, record };
    $("amountRecord").textContent = `${record.lpu_number || "Sem identificador"} · ${project(record) || ""}`;
    const cents = moneyCents(record.billable_amount);
    $("amountValue").value = cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",");
    $("amountFeedback").textContent = "";
    openModal("amountModal");
  });
  $("amountForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!editRecord || !writable) return;
    $("saveAmountButton").disabled = true;
    try {
      const value = moneyCents($("amountValue").value);
      const saved = await saveAmount(editRecord.kind, editRecord.record, value);
      const index = records[editRecord.kind].findIndex(row => row.id === saved.id);
      records[editRecord.kind][index] = saved;
      invalidatePreview("O valor mudou. Gere uma nova prévia antes de salvar uma conferência.");
      closeModal("amountModal");
      renderClosing();
      showToast("Valor deste registro salvo.", "success");
    } catch (error) { $("amountFeedback").textContent = error.message || "Não foi possível salvar o valor."; }
    finally { $("saveAmountButton").disabled = false; }
  });
  $("billingFile").addEventListener("change", openFile);
  for (const id of ["billingSheet", "billingHeader"]) $(id).addEventListener("change", populateColumns);
  for (const id of ["billingLastRow", "billingMatch", "billingIdentifier", "billingAmount", "billingTolerance"]) $(id).addEventListener("input", () => invalidatePreview("A configuração mudou. Gere uma nova prévia."));
  $("previewBilling").addEventListener("click", compareBilling);
  $("billingReviewed").addEventListener("change", () => { $("saveBilling").disabled = !$("billingReviewed").checked || !preview || savedView || !writable || importBusy; });
  $("saveBilling").addEventListener("click", confirmBilling);
  $("billingOnlyPending").addEventListener("change", () => { resultLimit = 100; renderResults(); });
  $("moreBilling").addEventListener("click", () => { resultLimit += 100; renderResults(); });
  $("exportBilling").addEventListener("click", () => {
    if (!preview?.items.length) return;
    const rows = preview.items.filter(item => !$("billingOnlyPending").checked || item.result !== "found").map(item => ({
      Identificador: item.identifier, Resultado: RESULT_LABELS[item.result],
      "Valor FLUUX (R$)": item.expected_cents === null ? "" : item.expected_cents / 100,
      "Valor planilha (R$)": item.imported_cents === null ? "" : item.imported_cents / 100,
      "Linhas da planilha": (item.sheet_rows || []).join(", "), Observação: item.reason,
    }));
    if (rows.length) exportSheet(rows, `fluux_conferencia_${preview.request.competence}.xlsx`, "Conferencia");
  });
  $("billingHistoryBody").addEventListener("click", event => {
    const button = event.target.closest("[data-open-check]");
    if (button) openSavedCheck(button.dataset.openCheck);
  });
  await reload();
});
