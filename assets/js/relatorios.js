import { bootPage } from "./shell.js";
import { state, effectiveStatus, demandCode, converterCode, activeCatalog } from "./store.js";
import { escapeHtml, formatDate, formatHours, showToast } from "./ui.js";
import { intervalFor, dateInInterval, managerSeries } from "./charts.js";

let activePeriod = "30";
let reportDemands = [];
let reportConverters = [];

function currentInterval() {
  const period = activePeriod === "today" ? "1" : activePeriod;
  return intervalFor(period, document.getElementById("reportStartDate").value, document.getElementById("reportEndDate").value);
}

function periodLabel() {
  const labels = {
    today: "Hoje",
    "7": "Últimos 7 dias",
    "30": "Últimos 30 dias",
    month: "Mês atual",
    year: `Ano de ${new Date().getFullYear()}`,
    custom: "Período personalizado",
  };
  return labels[activePeriod] || "Período selecionado";
}

function populateFilters() {
  document.getElementById("reportManager").innerHTML = `<option value="">Todos</option>${activeCatalog("managers").map(item => `<option>${escapeHtml(item.name)}</option>`).join("")}<option>Gestor não informado</option>`;
  document.getElementById("reportCategory").innerHTML = `<option value="">Todas</option>${activeCatalog("categories").map(item => `<option>${escapeHtml(item.name)}</option>`).join("")}`;
}

function getDemands() {
  const interval = currentInterval();
  const status = document.getElementById("reportStatus").value;
  const priority = document.getElementById("reportPriority").value;
  const manager = document.getElementById("reportManager").value;
  const category = document.getElementById("reportCategory").value;
  const responsible = document.getElementById("reportResponsible").value.trim().toLocaleLowerCase("pt-BR");
  return state.demands.filter(item => {
    const managerName = item.manager?.trim() || "Gestor não informado";
    return dateInInterval(item.start_date, interval) &&
      (!status || effectiveStatus(item) === status) &&
      (!priority || item.priority === priority) &&
      (!manager || managerName === manager) &&
      (!category || item.category === category) &&
      (!responsible || item.responsible.toLocaleLowerCase("pt-BR").includes(responsible));
  });
}

function getConverters() {
  const interval = currentInterval();
  return state.converters.filter(item => dateInInterval(item.service_date, interval));
}

function converterSummary(records) {
  const quantity = records.reduce((total, item) => total + Number(item.quantity_replaced || 0), 0);
  const locations = Object.entries(records.reduce((map, item) => {
    map[item.location_name] = (map[item.location_name] || 0) + 1;
    return map;
  }, {})).sort((a, b) => b[1] - a[1]);
  return { quantity, topLocation: locations[0]?.[0] || "—", topCount: locations[0]?.[1] || 0 };
}

function render() {
  reportDemands = getDemands();
  reportConverters = getConverters();
  const done = reportDemands.filter(item => effectiveStatus(item) === "Concluída").length;
  const progress = reportDemands.filter(item => effectiveStatus(item) === "Em andamento").length;
  const overdue = reportDemands.filter(item => effectiveStatus(item) === "Atrasada").length;
  const estimated = reportDemands.reduce((total, item) => total + Number(item.estimated_hours || 0), 0);
  const actual = reportDemands.reduce((total, item) => total + Number(item.actual_hours || 0), 0);
  document.getElementById("reportTotal").textContent = reportDemands.length;
  document.getElementById("reportDone").textContent = done;
  document.getElementById("reportProgress").textContent = progress;
  document.getElementById("reportOverdue").textContent = overdue;
  document.getElementById("reportDoneRate").textContent = `${Math.round(done / Math.max(reportDemands.length, 1) * 100)}% de conclusão`;
  document.getElementById("reportEstimatedHours").textContent = formatHours(estimated);
  document.getElementById("reportActualHours").textContent = formatHours(actual);
  document.getElementById("reportHoursRate").textContent = estimated ? `${Math.round(actual / estimated * 100)}% do estimado` : actual ? "sem estimativa" : "0% do estimado";
  document.getElementById("reportPeriodLabel").textContent = periodLabel();
  document.getElementById("reportDemandCount").textContent = `${reportDemands.length} ${reportDemands.length === 1 ? "registro" : "registros"}`;

  document.getElementById("reportBody").innerHTML = reportDemands.length ? reportDemands.map(item => `<tr>
    <td>${demandCode(item)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.manager?.trim() || "Gestor não informado")}</td><td>${escapeHtml(item.responsible)}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.priority)}</td><td>${escapeHtml(effectiveStatus(item))}</td><td>${formatDate(item.start_date, { year: true })}</td><td>${formatDate(item.due_date, { year: true })}</td><td>${formatHours(item.estimated_hours)}</td><td>${formatHours(item.actual_hours)}</td>
  </tr>`).join("") : `<tr><td colspan="11" class="empty-table">Nenhuma demanda encontrada para os filtros.</td></tr>`;

  const converters = converterSummary(reportConverters);
  document.getElementById("reportConverterRecords").textContent = reportConverters.length;
  document.getElementById("reportConverterQuantity").textContent = converters.quantity;
  document.getElementById("reportConverterTopLocation").textContent = converters.topLocation;
  document.getElementById("reportConverterSummary").textContent = `${converters.quantity} ${converters.quantity === 1 ? "troca" : "trocas"}`;
  document.getElementById("reportConvertersBody").innerHTML = reportConverters.length ? reportConverters.map(item => `<tr>
    <td>${converterCode(item)}</td><td>${formatDate(item.service_date, { year: true })}</td><td>${escapeHtml(item.location_name)}</td><td>${escapeHtml(item.point_reference || "—")}</td><td>${escapeHtml(item.service_type)}</td><td>${escapeHtml(item.conversion_direction || "—")}</td><td>${Number(item.quantity_replaced || 0)}</td><td>${escapeHtml(item.issue_reason || "—")}</td><td>${escapeHtml(item.status)}</td>
  </tr>`).join("") : `<tr><td colspan="9" class="empty-table">Nenhum atendimento de conversor no período.</td></tr>`;
}

function setPeriod(value) {
  activePeriod = value;
  document.querySelectorAll("[data-report-period]").forEach(button => button.classList.toggle("active", button.dataset.reportPeriod === value));
  document.getElementById("reportFilterGrid").classList.toggle("custom", value === "custom");
  if (value !== "custom") {
    const interval = currentInterval();
    const toInput = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    document.getElementById("reportStartDate").value = toInput(interval.start);
    document.getElementById("reportEndDate").value = toInput(interval.end);
  }
  render();
}

function fileDate() {
  return new Date().toISOString().slice(0, 10);
}

function exportExcel() {
  reportDemands = getDemands();
  reportConverters = getConverters();
  if (!reportDemands.length && !reportConverters.length) return showToast("Não há dados nos filtros atuais para exportar.", "error");
  if (!window.XLSX) return showToast("A biblioteca de Excel não foi carregada.", "error");

  const done = reportDemands.filter(item => effectiveStatus(item) === "Concluída").length;
  const estimated = reportDemands.reduce((total, item) => total + Number(item.estimated_hours || 0), 0);
  const actual = reportDemands.reduce((total, item) => total + Number(item.actual_hours || 0), 0);
  const conv = converterSummary(reportConverters);
  const workbook = XLSX.utils.book_new();
  workbook.Props = { Title: "FLUUX — Relatório de Demandas", Subject: periodLabel(), Author: state.profile.full_name, CreatedDate: new Date() };

  const summaryRows = [
    ["FLUUX — RELATÓRIO DE DEMANDAS"],
    [`Período: ${periodLabel()}`],
    [`Gerado em: ${new Date().toLocaleString("pt-BR")}`],
    [],
    ["Indicador", "Valor"],
    ["Total de demandas", reportDemands.length],
    ["Concluídas", done],
    ["Em andamento", reportDemands.filter(item => effectiveStatus(item) === "Em andamento").length],
    ["Atrasadas", reportDemands.filter(item => effectiveStatus(item) === "Atrasada").length],
    ["Taxa de conclusão", reportDemands.length ? done / reportDemands.length : 0],
    ["Horas estimadas", estimated],
    ["Horas realizadas", actual],
    ["Utilização das horas", estimated ? actual / estimated : 0],
    [],
    ["Atendimentos de conversores", reportConverters.length],
    ["Conversores trocados", conv.quantity],
    ["Local mais recorrente", conv.topLocation],
  ];
  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  summary["!cols"] = [{ wch: 34 }, { wch: 24 }];
  summary["!merges"] = [XLSX.utils.decode_range("A1:B1"), XLSX.utils.decode_range("A2:B2"), XLSX.utils.decode_range("A3:B3")];
  ["B10", "B13"].forEach(cell => { if (summary[cell]) summary[cell].z = "0.0%"; });
  summary["!freeze"] = { xSplit: 0, ySplit: 4 };
  XLSX.utils.book_append_sheet(workbook, summary, "Resumo");

  const demandRows = reportDemands.map(item => ({
    Código: demandCode(item),
    Demanda: item.title,
    Descrição: item.description,
    Solicitante: item.requester || "",
    Gestor: item.manager?.trim() || "Gestor não informado",
    Responsável: item.responsible,
    Departamento: item.department || "",
    Categoria: item.category,
    Prioridade: item.priority,
    Status: effectiveStatus(item),
    Entrada: new Date(`${item.start_date}T12:00:00`),
    Prazo: new Date(`${item.due_date}T12:00:00`),
    "Horas estimadas": Number(item.estimated_hours || 0),
    "Horas realizadas": Number(item.actual_hours || 0),
    Tags: (item.tags || []).join(", "),
    Observações: item.notes || "",
  }));
  const demandSheet = XLSX.utils.json_to_sheet(demandRows, { cellDates: true });
  demandSheet["!cols"] = [12,34,48,22,22,22,20,20,12,20,14,14,16,16,24,42].map(wch => ({ wch }));
  demandSheet["!autofilter"] = { ref: demandSheet["!ref"] || "A1:P1" };
  demandSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  for (let row = 2; row <= demandRows.length + 1; row++) { if (demandSheet[`K${row}`]) demandSheet[`K${row}`].z = "dd/mm/yyyy"; if (demandSheet[`L${row}`]) demandSheet[`L${row}`].z = "dd/mm/yyyy"; }
  XLSX.utils.book_append_sheet(workbook, demandSheet, "Demandas");

  const managers = managerSeries(reportDemands);
  const managerRows = managers.labels.map(label => ({ Gestor: label, Demandas: managers.map[label].count, Concluídas: managers.map[label].done, "Horas estimadas": managers.map[label].estimated, "Horas realizadas": managers.map[label].actual, Utilização: managers.map[label].estimated ? managers.map[label].actual / managers.map[label].estimated : 0 }));
  const managerSheet = XLSX.utils.json_to_sheet(managerRows);
  managerSheet["!cols"] = [26,12,12,18,18,14].map(wch => ({ wch }));
  managerSheet["!autofilter"] = { ref: managerSheet["!ref"] || "A1:F1" };
  for (let row = 2; row <= managerRows.length + 1; row++) if (managerSheet[`F${row}`]) managerSheet[`F${row}`].z = "0.0%";
  XLSX.utils.book_append_sheet(workbook, managerSheet, "Por gestor");

  const converterRows = reportConverters.map(item => ({ Código: converterCode(item), Data: new Date(`${item.service_date}T12:00:00`), Local: item.location_name, Ponto: item.point_reference || "", Atendimento: item.service_type, Conversão: item.conversion_direction || "", Quantidade: Number(item.quantity_replaced || 0), Motivo: item.issue_reason || "", Status: item.status, Responsável: item.responsible_name || "", Observações: item.notes || "" }));
  const converterSheet = XLSX.utils.json_to_sheet(converterRows, { cellDates: true });
  converterSheet["!cols"] = [12,14,28,22,18,18,12,40,20,22,42].map(wch => ({ wch }));
  converterSheet["!autofilter"] = { ref: converterSheet["!ref"] || "A1:K1" };
  converterSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  for (let row = 2; row <= converterRows.length + 1; row++) if (converterSheet[`B${row}`]) converterSheet[`B${row}`].z = "dd/mm/yyyy";
  XLSX.utils.book_append_sheet(workbook, converterSheet, "Conversores");

  XLSX.writeFile(workbook, `fluux_relatorio_demandas_${fileDate()}.xlsx`);
  showToast("Planilha gerada com sucesso.", "success");
}

async function imageData(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
  } catch { return null; }
}

async function exportPdf() {
  reportDemands = getDemands();
  reportConverters = getConverters();
  if (!reportDemands.length && !reportConverters.length) return showToast("Não há dados nos filtros atuais para exportar.", "error");
  if (!window.jspdf?.jsPDF) return showToast("A biblioteca de PDF não foi carregada.", "error");

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const logo = await imageData("assets/img/logo.png");
  const done = reportDemands.filter(item => effectiveStatus(item) === "Concluída").length;
  const estimated = reportDemands.reduce((total, item) => total + Number(item.estimated_hours || 0), 0);
  const actual = reportDemands.reduce((total, item) => total + Number(item.actual_hours || 0), 0);
  const conv = converterSummary(reportConverters);

  const drawHeader = () => {
    if (logo) doc.addImage(logo, "PNG", 15, 9, 34, 13, undefined, "FAST");
    doc.setTextColor(40,75,99); doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text("Relatório de Demandas", 105, 18, { align: "center" });
    doc.setTextColor(100); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(`${periodLabel()} · Gerado em ${new Date().toLocaleString("pt-BR")}`, 105, 24, { align: "center" });
    doc.setDrawColor(249,105,0); doc.setLineWidth(1); doc.line(15, 29, 195, 29);
  };
  drawHeader();

  const metrics = [
    ["Total", reportDemands.length], ["Concluídas", done], ["Em andamento", reportDemands.filter(item => effectiveStatus(item) === "Em andamento").length],
    ["Atrasadas", reportDemands.filter(item => effectiveStatus(item) === "Atrasada").length], ["Horas estimadas", formatHours(estimated)], ["Horas realizadas", formatHours(actual)],
  ];
  metrics.forEach(([label, value], index) => {
    const col = index % 3; const row = Math.floor(index / 3); const x = 15 + col * 61; const y = 35 + row * 22;
    doc.setFillColor(247,244,236); doc.setDrawColor(215); doc.roundedRect(x, y, 56, 17, 2, 2, "FD");
    doc.setTextColor(105); doc.setFontSize(7); doc.text(String(label), x + 4, y + 6);
    doc.setTextColor(40,75,99); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(String(value), x + 4, y + 13); doc.setFont("helvetica", "normal");
  });

  let y = 83;
  doc.setTextColor(40,75,99); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Demandas", 15, y);
  doc.autoTable({
    startY: y + 4,
    head: [["Código", "Demanda", "Gestor", "Status", "Prazo", "Est.", "Real."]],
    body: reportDemands.map(item => [demandCode(item), item.title, item.manager?.trim() || "Gestor não informado", effectiveStatus(item), formatDate(item.due_date, { year: true }), formatHours(item.estimated_hours), formatHours(item.actual_hours)]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 6.7, cellPadding: 2, textColor: [55,65,70], lineColor: [218,222,224], lineWidth: .15, overflow: "linebreak" },
    headStyles: { fillColor: [40,75,99], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248,247,243] },
    columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 53 }, 2: { cellWidth: 31 }, 3: { cellWidth: 24 }, 4: { cellWidth: 25 }, 5: { cellWidth: 13 }, 6: { cellWidth: 13 } },
    margin: { left: 15, right: 15, top: 34, bottom: 16 },
    didDrawPage: data => { if (data.pageNumber > 1) drawHeader(); },
  });

  y = doc.lastAutoTable.finalY + 10;
  if (y > 245) { doc.addPage(); drawHeader(); y = 38; }
  doc.setTextColor(40,75,99); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Sustentação de conversores", 15, y);
  doc.setFont("helvetica", "normal"); doc.setTextColor(90); doc.setFontSize(8); doc.text(`${reportConverters.length} atendimentos · ${conv.quantity} conversores trocados · Local mais recorrente: ${conv.topLocation}`, 15, y + 5);
  doc.autoTable({
    startY: y + 9,
    head: [["Código", "Data", "Local", "Atendimento", "Qtd.", "Status"]],
    body: reportConverters.map(item => [converterCode(item), formatDate(item.service_date, { year: true }), item.location_name, item.service_type, String(item.quantity_replaced || 0), item.status]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7, cellPadding: 2, textColor: [55,65,70], lineColor: [218,222,224], lineWidth: .15 },
    headStyles: { fillColor: [249,105,0], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248,247,243] },
    margin: { left: 15, right: 15, top: 34, bottom: 16 },
    didDrawPage: data => { if (data.pageNumber > 1) drawHeader(); },
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setTextColor(125); doc.setFontSize(7); doc.text(`FLUUX · Organização de Demandas`, 15, 289); doc.text(`Página ${page} de ${pages}`, 195, 289, { align: "right" });
  }
  doc.save(`fluux_relatorio_demandas_${fileDate()}.pdf`);
  showToast("PDF em formato retrato gerado com sucesso.", "success");
}

bootPage(() => {
  populateFilters();
  document.querySelectorAll("[data-report-period]").forEach(button => button.addEventListener("click", () => setPeriod(button.dataset.reportPeriod)));
  ["reportStartDate", "reportEndDate", "reportStatus", "reportPriority", "reportManager", "reportCategory", "reportResponsible"].forEach(id => document.getElementById(id).addEventListener("input", render));
  document.getElementById("exportExcelButton").addEventListener("click", exportExcel);
  document.getElementById("exportPdfButton").addEventListener("click", exportPdf);
  setPeriod("30");
});
