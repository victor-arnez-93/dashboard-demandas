import { state, demandCode, effectiveStatus } from "./store.js";
import { escapeHtml, formatDate, showToast } from "./ui.js";
import { log } from "./logger.js";

let activePeriod = "30";
let filtered = [];

function startOf(date) { const value = new Date(date); value.setHours(0, 0, 0, 0); return value; }
function endOf(date) { const value = new Date(date); value.setHours(23, 59, 59, 999); return value; }
function inputDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

function interval() {
  const today = new Date();
  if (activePeriod === "custom") {
    const start = document.getElementById("reportStartDate").value;
    const end = document.getElementById("reportEndDate").value;
    return { start: startOf(`${start}T12:00:00`), end: endOf(`${end}T12:00:00`) };
  }
  const days = activePeriod === "today" ? 1 : Number(activePeriod);
  const start = startOf(today);
  start.setDate(start.getDate() - days + 1);
  return { start, end: endOf(today) };
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

export function renderReport() {
  filtered = getReportDemands();
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
  const labels = { today: "Hoje", 7: "Últimos 7 dias", 30: "Últimos 30 dias", custom: "Período personalizado" };
  document.getElementById("reportPeriodLabel").textContent = labels[activePeriod];
  const body = document.getElementById("reportBody");
  body.innerHTML = filtered.length ? filtered.map(item => `<tr>
    <td>${demandCode(item)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.manager?.trim() || "Gestor não informado")}</td><td>${escapeHtml(item.responsible)}</td>
    <td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.priority)}</td><td>${escapeHtml(effectiveStatus(item))}</td>
    <td>${formatDate(item.start_date, { year: true })}</td><td>${formatDate(item.due_date, { year: true })}</td>
    <td>${Number(item.estimated_hours || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h</td>
    <td>${Number(item.actual_hours || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h</td>
  </tr>`).join("") : `<tr><td colspan="11" class="empty-table">Nenhuma demanda encontrada para os filtros.</td></tr>`;
}

export function setReportPeriod(value) {
  activePeriod = value;
  document.querySelectorAll("[data-report-period]").forEach(button => button.classList.toggle("active", button.dataset.reportPeriod === value));
  if (value !== "custom") {
    const days = value === "today" ? 1 : Number(value);
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days + 1);
    document.getElementById("reportStartDate").value = inputDate(start);
    document.getElementById("reportEndDate").value = inputDate(end);
  }
  renderReport();
}

function safeName(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

export function exportExcel() {
  filtered = getReportDemands();
  if (!filtered.length) return showToast("Não há dados nos filtros atuais para exportar.", "error");
  if (!window.XLSX) return showToast("A biblioteca de Excel não foi carregada.", "error");

  const done = filtered.filter(item => effectiveStatus(item) === "Concluída").length;
  const overdue = filtered.filter(item => effectiveStatus(item) === "Atrasada").length;
  const estimatedHours = filtered.reduce((total, item) => total + Number(item.estimated_hours || 0), 0);
  const actualHours = filtered.reduce((total, item) => total + Number(item.actual_hours || 0), 0);
  const wb = XLSX.utils.book_new();
  const summary = [
    [`RELATÓRIO DE DEMANDAS — ${state.settings.app_name}`],
    [`Período: ${document.getElementById("reportPeriodLabel").textContent}`],
    [`Gerado em: ${new Date().toLocaleString("pt-BR")}`],
    [],
    ["Indicador", "Valor"],
    ["Total de demandas", filtered.length],
    ["Concluídas", done],
    ["Em andamento", filtered.filter(item => effectiveStatus(item) === "Em andamento").length],
    ["Atrasadas", overdue],
    ["Horas estimadas", estimatedHours],
    ["Horas realizadas", actualHours],
    ["Taxa de conclusão", done / filtered.length],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary["!cols"] = [{ wch: 28 }, { wch: 22 }];
  wsSummary.B12.z = "0.0%";
  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo");

  const rows = [["Código", "Título", "Descrição", "Solicitante", "Responsável", "Gestor", "Departamento", "Categoria", "Prioridade", "Status", "Entrada", "Prazo", "Horas estimadas", "Horas realizadas", "Tags", "Observações"]];
  filtered.forEach(item => rows.push([
    demandCode(item), item.title, item.description, item.requester || "", item.responsible, item.manager?.trim() || "Gestor não informado", item.department || "", item.category,
    item.priority, effectiveStatus(item), item.start_date, item.due_date, Number(item.estimated_hours || 0), Number(item.actual_hours || 0),
    (item.tags || []).join(", "), item.notes || "",
  ]));
  const wsDemands = XLSX.utils.aoa_to_sheet(rows);
  wsDemands["!autofilter"] = { ref: `A1:P${rows.length}` };
  wsDemands["!cols"] = [{ wch: 12 }, { wch: 34 }, { wch: 55 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 28 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsDemands, "Demandas");

  const byCategory = Object.entries(filtered.reduce((map, item) => { map[item.category] = (map[item.category] || 0) + 1; return map; }, {})).sort((a, b) => b[1] - a[1]);
  const indicators = [["Categoria", "Quantidade"], ...byCategory];
  const wsIndicators = XLSX.utils.aoa_to_sheet(indicators);
  wsIndicators["!cols"] = [{ wch: 28 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsIndicators, "Indicadores");

  const byManager = [...new Set(filtered.map(item => item.manager?.trim() || "Gestor não informado"))]
    .map(manager => {
      const demands = filtered.filter(item => (item.manager?.trim() || "Gestor não informado") === manager);
      return [
        manager,
        demands.length,
        demands.reduce((total, item) => total + Number(item.estimated_hours || 0), 0),
        demands.reduce((total, item) => total + Number(item.actual_hours || 0), 0),
      ];
    })
    .sort((a, b) => b[1] - a[1]);
  const wsManagers = XLSX.utils.aoa_to_sheet([["Gestor", "Demandas", "Horas estimadas", "Horas realizadas"], ...byManager]);
  wsManagers["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsManagers, "Por gestor");

  XLSX.writeFile(wb, `relatorio_demandas_${safeName(state.settings.app_name)}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  log.success("RELATÓRIOS", "Excel exportado.", { registros: filtered.length });
}

export function exportPdf() {
  filtered = getReportDemands();
  if (!filtered.length) return showToast("Não há dados nos filtros atuais para exportar.", "error");
  const done = filtered.filter(item => effectiveStatus(item) === "Concluída").length;
  const overdue = filtered.filter(item => effectiveStatus(item) === "Atrasada").length;
  const estimatedHours = filtered.reduce((total, item) => total + Number(item.estimated_hours || 0), 0);
  const actualHours = filtered.reduce((total, item) => total + Number(item.actual_hours || 0), 0);
  const logo = new URL("assets/img/logo.png", location.href).href;
  const rows = filtered.map(item => `<tr><td>${demandCode(item)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.manager?.trim() || "Gestor não informado")}</td><td>${escapeHtml(item.responsible)}</td><td>${escapeHtml(item.priority)}</td><td>${escapeHtml(effectiveStatus(item))}</td><td>${Number(item.estimated_hours || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h</td><td>${Number(item.actual_hours || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h</td><td>${formatDate(item.due_date, { year: true })}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Relatório de Demandas</title><style>
    @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font:10px Arial;color:#172027;margin:0}.head{text-align:center;border-bottom:3px solid #F96900;padding-bottom:10px}.head img{width:170px;height:54px;object-fit:contain;border:1px solid #d8e0e3;border-radius:12px;background:#f7fafb}.head h1{margin:7px 0 2px;color:#284B63}.head p{margin:0;color:#68757c}.cards{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin:12px 0}.card{border:1px solid #cdd4d7;border-radius:8px;padding:8px}.card small{display:block;color:#68757c}.card strong{font-size:17px;color:#284B63}table{width:100%;border-collapse:collapse}th{background:#284B63;color:#fff;text-align:left;padding:6px}td{border:1px solid #dce1e3;padding:5px;vertical-align:top}tr:nth-child(even){background:#f6f3eb}.foot{margin-top:10px;color:#68757c;font-size:9px;text-align:right}
  </style></head><body><div class="head"><img src="${logo}"><h1>${escapeHtml(state.settings.app_name)} — Relatório de Demandas</h1><p>${escapeHtml(document.getElementById("reportPeriodLabel").textContent)} · Gerado em ${new Date().toLocaleString("pt-BR")}</p></div><div class="cards"><div class="card"><small>Total</small><strong>${filtered.length}</strong></div><div class="card"><small>Concluídas</small><strong>${done}</strong></div><div class="card"><small>Em andamento</small><strong>${filtered.filter(item => effectiveStatus(item) === "Em andamento").length}</strong></div><div class="card"><small>Atrasadas</small><strong>${overdue}</strong></div><div class="card"><small>Horas estimadas</small><strong>${estimatedHours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h</strong></div><div class="card"><small>Horas realizadas</small><strong>${actualHours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h</strong></div></div><table><thead><tr><th>Código</th><th>Demanda</th><th>Gestor</th><th>Responsável</th><th>Prioridade</th><th>Status</th><th>Est.</th><th>Real.</th><th>Prazo</th></tr></thead><tbody>${rows}</tbody></table><div class="foot">FLUUX · Organização de Demandas</div><script>addEventListener("load",()=>setTimeout(()=>print(),250))<\/script></body></html>`;
  const popup = open("", "_blank");
  if (!popup) return showToast("Permita pop-ups para gerar o PDF.", "error");
  popup.document.write(html);
  popup.document.close();
  log.success("RELATÓRIOS", "Visualização de PDF aberta.", { registros: filtered.length });
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
