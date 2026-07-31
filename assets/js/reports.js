import { state, converterCode, demandCode, effectiveStatus } from "./store.js";
import { escapeHtml, formatDate, showToast } from "./ui.js";
import { log } from "./logger.js";

let activePeriod = "30";
let filtered = [];
let filteredConverters = [];

function startOf(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOf(date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function inputDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function interval() {
  const today = new Date();
  if (activePeriod === "custom") {
    const start = document.getElementById("reportStartDate").value || inputDate(today);
    const end = document.getElementById("reportEndDate").value || inputDate(today);
    return { start: startOf(`${start}T12:00:00`), end: endOf(`${end}T12:00:00`) };
  }
  if (activePeriod === "month") return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: endOf(today) };
  if (activePeriod === "year") return { start: new Date(today.getFullYear(), 0, 1), end: endOf(today) };
  const days = activePeriod === "today" ? 1 : Number(activePeriod);
  const start = startOf(today);
  start.setDate(start.getDate() - days + 1);
  return { start, end: endOf(today) };
}

function periodLabel() {
  return {
    today: "Hoje",
    7: "Últimos 7 dias",
    30: "Últimos 30 dias",
    month: "Mês atual",
    year: `Ano de ${new Date().getFullYear()}`,
    custom: "Período personalizado",
  }[activePeriod];
}

export function getReportDemands() {
  const { start, end } = interval();
  const status = document.getElementById("reportStatus").value;
  const priority = document.getElementById("reportPriority").value;
  const category = document.getElementById("reportCategory").value;
  const manager = document.getElementById("reportManager").value;
  const responsible = document.getElementById("reportResponsible").value.trim().toLocaleLowerCase("pt-BR");
  return state.demands.filter(item => {
    const date = new Date(`${item.start_date}T12:00:00`);
    return date >= start && date <= end &&
      (!status || effectiveStatus(item) === status) &&
      (!priority || item.priority === priority) &&
      (!category || item.category === category) &&
      (!manager || (item.manager?.trim() || "Gestor não informado") === manager) &&
      (!responsible || item.responsible.toLocaleLowerCase("pt-BR").includes(responsible));
  });
}

export function getReportConverters() {
  const { start, end } = interval();
  return state.converters.filter(item => {
    const date = new Date(`${item.service_date}T12:00:00`);
    return date >= start && date <= end;
  });
}

function converterSummary(records) {
  const quantity = records.reduce((total, item) => total + Number(item.quantity_replaced || 0), 0);
  const locations = Object.entries(records.reduce((map, item) => {
    map[item.location_name] = (map[item.location_name] || 0) + 1;
    return map;
  }, {})).sort((a, b) => b[1] - a[1]);
  return { quantity, topLocation: locations[0]?.[0] || "—", topCount: locations[0]?.[1] || 0 };
}

export function renderReport() {
  filtered = getReportDemands();
  filteredConverters = getReportConverters();
  const done = filtered.filter(item => effectiveStatus(item) === "Concluída").length;
  const progress = filtered.filter(item => effectiveStatus(item) === "Em andamento").length;
  const overdue = filtered.filter(item => effectiveStatus(item) === "Atrasada").length;
  const estimatedHours = filtered.reduce((total, item) => total + Number(item.estimated_hours || 0), 0);
  const actualHours = filtered.reduce((total, item) => total + Number(item.actual_hours || 0), 0);
  document.getElementById("reportTotal").textContent = filtered.length;
  document.getElementById("reportDone").textContent = done;
  document.getElementById("reportProgress").textContent = progress;
  document.getElementById("reportOverdue").textContent = overdue;
  document.getElementById("reportDoneRate").textContent = `${Math.round(done / Math.max(filtered.length, 1) * 100)}% de conclusão`;
  document.getElementById("reportEstimatedHours").textContent = `${estimatedHours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
  document.getElementById("reportActualHours").textContent = `${actualHours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
  document.getElementById("reportHoursRate").textContent = estimatedHours > 0
    ? `${Math.round(actualHours / estimatedHours * 100)}% do estimado`
    : actualHours > 0 ? "sem estimativa registrada" : "0% do estimado";
  document.getElementById("reportPeriodLabel").textContent = periodLabel();

  const body = document.getElementById("reportBody");
  body.innerHTML = filtered.length ? filtered.map(item => `<tr>
    <td>${demandCode(item)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.manager?.trim() || "Gestor não informado")}</td><td>${escapeHtml(item.responsible)}</td>
    <td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.priority)}</td><td>${escapeHtml(effectiveStatus(item))}</td>
    <td>${formatDate(item.start_date, { year: true })}</td><td>${formatDate(item.due_date, { year: true })}</td>
    <td>${Number(item.estimated_hours || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h</td>
    <td>${Number(item.actual_hours || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h</td>
  </tr>`).join("") : `<tr><td colspan="11" class="empty-table">Nenhuma demanda encontrada para os filtros.</td></tr>`;

  const converterData = converterSummary(filteredConverters);
  document.getElementById("reportConverterRecords").textContent = filteredConverters.length;
  document.getElementById("reportConverterQuantity").textContent = converterData.quantity;
  document.getElementById("reportConverterTopLocation").textContent = converterData.topLocation;
  document.getElementById("reportConverterSummary").textContent = `${converterData.quantity} ${converterData.quantity === 1 ? "troca" : "trocas"}`;
  document.getElementById("reportConvertersBody").innerHTML = filteredConverters.length ? filteredConverters.map(item => `<tr>
    <td>${converterCode(item)}</td><td>${formatDate(item.service_date, { year: true })}</td><td>${escapeHtml(item.location_name)}</td><td>${escapeHtml(item.point_reference || "—")}</td>
    <td>${escapeHtml(item.service_type)}</td><td>${escapeHtml(item.conversion_direction || "—")}</td><td>${Number(item.quantity_replaced || 0)}</td><td>${escapeHtml(item.issue_reason || "—")}</td><td>${escapeHtml(item.status)}</td>
  </tr>`).join("") : `<tr><td colspan="9" class="empty-table">Nenhum atendimento de conversor no período.</td></tr>`;
}

export function setReportPeriod(value) {
  activePeriod = value;
  document.querySelectorAll("[data-report-period]").forEach(button => button.classList.toggle("active", button.dataset.reportPeriod === value));
  const today = new Date();
  let start = new Date(today);
  if (value === "today") start = new Date(today);
  else if (value === "7") start.setDate(start.getDate() - 6);
  else if (value === "30") start.setDate(start.getDate() - 29);
  else if (value === "month") start = new Date(today.getFullYear(), today.getMonth(), 1);
  else if (value === "year") start = new Date(today.getFullYear(), 0, 1);
  if (value !== "custom") {
    document.getElementById("reportStartDate").value = inputDate(start);
    document.getElementById("reportEndDate").value = inputDate(today);
  }
  renderReport();
}

function fileDate() {
  return new Date().toISOString().slice(0, 10);
}

function addSheet(workbook, data, name, widths, autoFilter = null) {
  const sheet = XLSX.utils.aoa_to_sheet(data);
  sheet["!cols"] = widths.map(wch => ({ wch }));
  if (autoFilter) sheet["!autofilter"] = { ref: autoFilter };
  XLSX.utils.book_append_sheet(workbook, sheet, name);
  return sheet;
}

export function exportExcel() {
  filtered = getReportDemands();
  filteredConverters = getReportConverters();
  if (!filtered.length && !filteredConverters.length) return showToast("Não há dados nos filtros atuais para exportar.", "error");
  if (!window.XLSX) return showToast("A biblioteca de Excel não foi carregada.", "error");

  const done = filtered.filter(item => effectiveStatus(item) === "Concluída").length;
  const overdue = filtered.filter(item => effectiveStatus(item) === "Atrasada").length;
  const estimatedHours = filtered.reduce((total, item) => total + Number(item.estimated_hours || 0), 0);
  const actualHours = filtered.reduce((total, item) => total + Number(item.actual_hours || 0), 0);
  const converterData = converterSummary(filteredConverters);
  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: "FLUUX — Relatório de Demandas",
    Subject: periodLabel(),
    Author: state.profile.full_name,
    CreatedDate: new Date(),
  };

  const summary = [
    ["FLUUX — RELATÓRIO DE DEMANDAS"],
    [`Período: ${periodLabel()}`],
    [`Gerado em: ${new Date().toLocaleString("pt-BR")}`],
    [],
    ["Indicador", "Valor"],
    ["Total de demandas", filtered.length],
    ["Concluídas", done],
    ["Em andamento", filtered.filter(item => effectiveStatus(item) === "Em andamento").length],
    ["Atrasadas", overdue],
    ["Taxa de conclusão", filtered.length ? done / filtered.length : 0],
    ["Horas estimadas", estimatedHours],
    ["Horas realizadas", actualHours],
    ["Utilização das horas", estimatedHours ? actualHours / estimatedHours : 0],
    [],
    ["Conversores — atendimentos", filteredConverters.length],
    ["Conversores trocados", converterData.quantity],
    ["Local mais recorrente", converterData.topLocation],
  ];
  const wsSummary = addSheet(workbook, summary, "Resumo", [32, 24]);
  ["B10", "B13"].forEach(cell => { if (wsSummary[cell]) wsSummary[cell].z = "0.0%"; });
  wsSummary["!merges"] = [XLSX.utils.decode_range("A1:B1"), XLSX.utils.decode_range("A2:B2"), XLSX.utils.decode_range("A3:B3")];

  const demandRows = [["Código", "Título", "Descrição", "Solicitante", "Responsável", "Gestor", "Departamento", "Categoria", "Prioridade", "Status", "Entrada", "Prazo", "Horas estimadas", "Horas realizadas", "Diferença de horas", "Tags", "Observações"]];
  filtered.forEach(item => demandRows.push([
    demandCode(item), item.title, item.description, item.requester || "", item.responsible, item.manager?.trim() || "Gestor não informado", item.department || "", item.category,
    item.priority, effectiveStatus(item), new Date(`${item.start_date}T12:00:00`), new Date(`${item.due_date}T12:00:00`), Number(item.estimated_hours || 0), Number(item.actual_hours || 0),
    Number(item.actual_hours || 0) - Number(item.estimated_hours || 0), (item.tags || []).join(", "), item.notes || "",
  ]));
  const wsDemands = addSheet(workbook, demandRows, "Demandas", [12, 34, 52, 22, 22, 22, 20, 20, 12, 20, 13, 13, 16, 16, 17, 28, 45], `A1:Q${demandRows.length}`);
  for (let row = 2; row <= demandRows.length; row++) {
    ["K", "L"].forEach(column => { if (wsDemands[`${column}${row}`]) wsDemands[`${column}${row}`].z = "dd/mm/yyyy"; });
    ["M", "N", "O"].forEach(column => { if (wsDemands[`${column}${row}`]) wsDemands[`${column}${row}`].z = "0.0"; });
  }

  const byManager = [...new Set(filtered.map(item => item.manager?.trim() || "Gestor não informado"))]
    .map(manager => {
      const demands = filtered.filter(item => (item.manager?.trim() || "Gestor não informado") === manager);
      const managerDone = demands.filter(item => effectiveStatus(item) === "Concluída").length;
      const managerEstimated = demands.reduce((total, item) => total + Number(item.estimated_hours || 0), 0);
      const managerActual = demands.reduce((total, item) => total + Number(item.actual_hours || 0), 0);
      return [manager, demands.length, managerDone, demands.length ? managerDone / demands.length : 0, managerEstimated, managerActual, managerActual - managerEstimated];
    }).sort((a, b) => b[1] - a[1]);
  const wsManagers = addSheet(workbook, [["Gestor", "Demandas", "Concluídas", "Taxa de conclusão", "Horas estimadas", "Horas realizadas", "Diferença"], ...byManager], "Por gestor", [28, 14, 14, 18, 18, 18, 16], `A1:G${byManager.length + 1}`);
  for (let row = 2; row <= byManager.length + 1; row++) if (wsManagers[`D${row}`]) wsManagers[`D${row}`].z = "0.0%";

  const converterRows = [["Código", "Data", "Local", "Ponto / referência", "Tipo de atendimento", "Conversão", "Quantidade", "Motivo / problema", "Status", "Responsável", "Observações"]];
  filteredConverters.forEach(item => converterRows.push([
    converterCode(item), new Date(`${item.service_date}T12:00:00`), item.location_name, item.point_reference || "", item.service_type, item.conversion_direction || "", Number(item.quantity_replaced || 0), item.issue_reason || "", item.status, item.responsible_name || "", item.notes || "",
  ]));
  const wsConverters = addSheet(workbook, converterRows, "Conversores", [12, 13, 28, 25, 22, 18, 12, 42, 20, 22, 42], `A1:K${converterRows.length}`);
  for (let row = 2; row <= converterRows.length; row++) if (wsConverters[`B${row}`]) wsConverters[`B${row}`].z = "dd/mm/yyyy";

  XLSX.writeFile(workbook, `fluux_relatorio_demandas_${fileDate()}.xlsx`, { compression: true });
  log.success("RELATÓRIOS", "Excel exportado.", { demandas: filtered.length, conversores: filteredConverters.length });
}

function managerSummaryRows() {
  return [...new Set(filtered.map(item => item.manager?.trim() || "Gestor não informado"))]
    .map(manager => {
      const demands = filtered.filter(item => (item.manager?.trim() || "Gestor não informado") === manager);
      return {
        manager,
        total: demands.length,
        done: demands.filter(item => effectiveStatus(item) === "Concluída").length,
        estimated: demands.reduce((total, item) => total + Number(item.estimated_hours || 0), 0),
        actual: demands.reduce((total, item) => total + Number(item.actual_hours || 0), 0),
      };
    }).sort((a, b) => b.total - a.total);
}

export function exportPdf() {
  filtered = getReportDemands();
  filteredConverters = getReportConverters();
  if (!filtered.length && !filteredConverters.length) return showToast("Não há dados nos filtros atuais para exportar.", "error");

  const done = filtered.filter(item => effectiveStatus(item) === "Concluída").length;
  const progress = filtered.filter(item => effectiveStatus(item) === "Em andamento").length;
  const overdue = filtered.filter(item => effectiveStatus(item) === "Atrasada").length;
  const estimatedHours = filtered.reduce((total, item) => total + Number(item.estimated_hours || 0), 0);
  const actualHours = filtered.reduce((total, item) => total + Number(item.actual_hours || 0), 0);
  const converterData = converterSummary(filteredConverters);
  const title = `fluux_relatorio_demandas_${fileDate()}`;
  const logo = new URL("assets/img/logo.png", location.href).href;
  const managers = managerSummaryRows().map(item => `<tr><td>${escapeHtml(item.manager)}</td><td>${item.total}</td><td>${item.done}</td><td>${item.estimated.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h</td><td>${item.actual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h</td></tr>`).join("");
  const demandRows = filtered.map(item => `<tr><td>${demandCode(item)}</td><td><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.category)} · ${escapeHtml(item.responsible)}</small></td><td>${escapeHtml(item.manager?.trim() || "Gestor não informado")}</td><td>${escapeHtml(effectiveStatus(item))}<small>${escapeHtml(item.priority)}</small></td><td>${formatDate(item.due_date, { year: true })}<small>${Number(item.estimated_hours || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h est. · ${Number(item.actual_hours || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h real.</small></td></tr>`).join("");
  const converterRows = filteredConverters.map(item => `<tr><td>${converterCode(item)}</td><td>${formatDate(item.service_date, { year: true })}</td><td><strong>${escapeHtml(item.location_name)}</strong><small>${escapeHtml(item.point_reference || "Sem referência")}</small></td><td>${escapeHtml(item.service_type)}<small>${escapeHtml(item.conversion_direction || "Conversão não informada")}</small></td><td>${Number(item.quantity_replaced || 0)}</td><td>${escapeHtml(item.status)}<small>${escapeHtml(item.issue_reason || "Sem motivo informado")}</small></td></tr>`).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
    @page{size:A4 portrait;margin:12mm 10mm 14mm}*{box-sizing:border-box}body{font:9.5px Arial,sans-serif;color:#172027;margin:0}.head{display:flex;align-items:center;gap:14px;border-bottom:3px solid #F96900;padding-bottom:10px}.head img{width:108px;height:44px;object-fit:contain;border:1px solid #d8e0e3;border-radius:10px;background:#f7fafb}.head h1{margin:0;color:#284B63;font-size:20px}.head p{margin:3px 0 0;color:#68757c}.section{margin-top:14px;break-inside:avoid}.section h2{margin:0 0 7px;color:#284B63;font-size:14px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:12px 0}.card{border:1px solid #cdd4d7;border-radius:8px;padding:8px;background:#fff}.card small{display:block;color:#68757c}.card strong{font-size:16px;color:#284B63}.highlight{background:#f6f3eb;border-left:3px solid #F96900;padding:8px 10px;margin:8px 0;color:#39464d}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th{background:#284B63;color:#fff;text-align:left;padding:6px;font-size:8px}td{border:1px solid #dce1e3;padding:5px;vertical-align:top;overflow-wrap:anywhere}tr:nth-child(even){background:#f7f5ef}td small{display:block;margin-top:2px;color:#68757c;font-size:7.5px}.manager-table th:nth-child(1){width:38%}.demand-table th:nth-child(1){width:12%}.demand-table th:nth-child(2){width:34%}.demand-table th:nth-child(3){width:20%}.demand-table th:nth-child(4){width:16%}.demand-table th:nth-child(5){width:18%}.converter-table th:nth-child(1){width:12%}.converter-table th:nth-child(2){width:13%}.converter-table th:nth-child(3){width:23%}.converter-table th:nth-child(4){width:19%}.converter-table th:nth-child(5){width:8%}.converter-table th:nth-child(6){width:25%}.empty{padding:10px;border:1px solid #dce1e3;color:#68757c}.foot{position:fixed;right:10mm;bottom:6mm;color:#68757c;font-size:7px}.page-break{break-before:page}
  </style></head><body>
    <div class="head"><img src="${logo}"><div><h1>FLUUX — Relatório de Demandas</h1><p>${escapeHtml(periodLabel())} · Gerado em ${new Date().toLocaleString("pt-BR")}</p></div></div>
    <div class="cards"><div class="card"><small>Demandas</small><strong>${filtered.length}</strong></div><div class="card"><small>Concluídas</small><strong>${done}</strong></div><div class="card"><small>Em andamento</small><strong>${progress}</strong></div><div class="card"><small>Atrasadas</small><strong>${overdue}</strong></div><div class="card"><small>Horas estimadas</small><strong>${estimatedHours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h</strong></div><div class="card"><small>Horas realizadas</small><strong>${actualHours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h</strong></div></div>
    <div class="highlight">Taxa de conclusão: <strong>${Math.round(done / Math.max(filtered.length, 1) * 100)}%</strong> · Utilização das horas: <strong>${estimatedHours ? Math.round(actualHours / estimatedHours * 100) : 0}%</strong> · Conversores trocados: <strong>${converterData.quantity}</strong>.</div>
    <section class="section"><h2>Resumo por gestor</h2>${managers ? `<table class="manager-table"><thead><tr><th>Gestor</th><th>Demandas</th><th>Concluídas</th><th>Est.</th><th>Real.</th></tr></thead><tbody>${managers}</tbody></table>` : '<div class="empty">Sem demandas no período.</div>'}</section>
    <section class="section"><h2>Demandas do período</h2>${demandRows ? `<table class="demand-table"><thead><tr><th>Código</th><th>Demanda</th><th>Gestor</th><th>Status</th><th>Prazo e horas</th></tr></thead><tbody>${demandRows}</tbody></table>` : '<div class="empty">Sem demandas no período.</div>'}</section>
    <section class="section ${filtered.length > 8 ? "page-break" : ""}"><h2>Sustentação de conversores de mídia</h2><div class="highlight">${filteredConverters.length} atendimentos · ${converterData.quantity} conversores trocados · Local mais recorrente: <strong>${escapeHtml(converterData.topLocation)}</strong>.</div>${converterRows ? `<table class="converter-table"><thead><tr><th>Código</th><th>Data</th><th>Local</th><th>Atendimento</th><th>Qtd.</th><th>Status e motivo</th></tr></thead><tbody>${converterRows}</tbody></table>` : '<div class="empty">Sem registros de conversores no período.</div>'}</section>
    <div class="foot">FLUUX · Organização de Demandas</div><script>addEventListener("load",()=>setTimeout(()=>print(),300))<\/script>
  </body></html>`;
  const popup = open("", "_blank");
  if (!popup) return showToast("Permita pop-ups para gerar o PDF.", "error");
  popup.document.write(html);
  popup.document.close();
  log.success("RELATÓRIOS", "Visualização de PDF aberta.", { demandas: filtered.length, conversores: filteredConverters.length });
}

export function initReports() {
  const today = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  document.getElementById("reportStartDate").value = inputDate(start);
  document.getElementById("reportEndDate").value = inputDate(today);
  document.querySelectorAll("[data-report-period]").forEach(button => button.addEventListener("click", () => setReportPeriod(button.dataset.reportPeriod)));
  ["reportStartDate", "reportEndDate"].forEach(id => document.getElementById(id).addEventListener("change", () => setReportPeriod("custom")));
  ["reportStatus", "reportPriority", "reportCategory", "reportManager", "reportResponsible"].forEach(id => document.getElementById(id).addEventListener(id === "reportResponsible" ? "input" : "change", renderReport));
  document.getElementById("exportExcelButton").addEventListener("click", exportExcel);
  document.getElementById("exportPdfButton").addEventListener("click", exportPdf);
  renderReport();
}
