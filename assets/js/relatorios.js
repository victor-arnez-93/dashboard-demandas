import { bootPage } from "./shell.js";
import { state, effectiveStatus, demandCode, converterCode, activeCatalog } from "./store.js";
import { escapeHtml, formatDate, formatHours, showToast } from "./ui.js";
import { intervalFor, dateInInterval } from "./charts.js";

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
      (!responsible || (item.responsible || "").toLocaleLowerCase("pt-BR").includes(responsible));
  });
}

function getConverters() {
  const interval = currentInterval();
  return state.converters.filter(item => dateInInterval(item.service_date, interval));
}

function converterSummary(records) {
  const quantity = records.reduce((total, item) => total + Number(item.quantity_replaced || 0), 0);
  const locations = Object.entries(records.reduce((map, item) => {
    const location = item.location_name?.trim() || "Local não informado";
    map[location] = (map[location] || 0) + 1;
    return map;
  }, {})).sort((a, b) => b[1] - a[1]);

  return {
    quantity,
    topLocation: locations[0]?.[0] || "—",
    topCount: locations[0]?.[1] || 0,
  };
}

function demandMetrics(records) {
  const done = records.filter(item => effectiveStatus(item) === "Concluída").length;
  const progress = records.filter(item => effectiveStatus(item) === "Em andamento").length;
  const overdue = records.filter(item => effectiveStatus(item) === "Atrasada").length;
  const estimated = records.reduce((total, item) => total + Number(item.estimated_hours || 0), 0);
  const actual = records.reduce((total, item) => total + Number(item.actual_hours || 0), 0);

  return {
    total: records.length,
    done,
    progress,
    overdue,
    estimated,
    actual,
    completionRate: records.length ? done / records.length : 0,
    utilizationRate: estimated ? actual / estimated : null,
  };
}

function managerSummary(records) {
  const map = records.reduce((result, item) => {
    const manager = item.manager?.trim() || "Gestor não informado";
    const current = result[manager] || {
      manager,
      demands: 0,
      done: 0,
      overdue: 0,
      estimated: 0,
      actual: 0,
    };

    current.demands += 1;
    current.done += effectiveStatus(item) === "Concluída" ? 1 : 0;
    current.overdue += effectiveStatus(item) === "Atrasada" ? 1 : 0;
    current.estimated += Number(item.estimated_hours || 0);
    current.actual += Number(item.actual_hours || 0);
    result[manager] = current;
    return result;
  }, {});

  return Object.values(map).sort((a, b) =>
    b.demands - a.demands || a.manager.localeCompare(b.manager, "pt-BR"),
  );
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

function fileDate(value = new Date()) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

function exportExcel() {
  reportDemands = getDemands();
  reportConverters = getConverters();

  if (!reportDemands.length && !reportConverters.length) {
    showToast("Não há dados nos filtros atuais para exportar.", "error");
    return;
  }

  if (!window.XLSX) {
    showToast("A biblioteca de Excel não foi carregada.", "error");
    return;
  }

  const metrics = demandMetrics(reportDemands);
  const converters = converterSummary(reportConverters);
  const workbook = XLSX.utils.book_new();

  workbook.Props = {
    Title: "FLUUX — Relatório de Demandas",
    Subject: `${periodLabel()} · ${pdfIntervalLabel()}`,
    Author: state.profile?.full_name || "FLUUX",
    CreatedDate: new Date(),
  };

  const summaryRows = [
    ["FLUUX — RELATÓRIO DE DEMANDAS"],
    [`Período: ${periodLabel()} (${pdfIntervalLabel()})`],
    [`Filtros: ${pdfFilterSummary()}`],
    [`Gerado em: ${pdfDateTime()}`],
    [],
    ["Indicador", "Valor"],
    ["Total de demandas", metrics.total],
    ["Concluídas", metrics.done],
    ["Em andamento", metrics.progress],
    ["Atrasadas", metrics.overdue],
    ["Taxa de conclusão", metrics.completionRate],
    ["Horas estimadas", metrics.estimated],
    ["Horas realizadas", metrics.actual],
    ["Utilização das horas", metrics.utilizationRate ?? "Sem estimativa"],
  ];

  if (reportConverters.length) {
    summaryRows.push(
      [],
      ["Sustentação de conversores", "Valor"],
      ["Atendimentos", reportConverters.length],
      ["Conversores trocados", converters.quantity],
      ["Local mais recorrente", converters.topLocation],
    );
  }

  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  summary["!cols"] = [{ wch: 38 }, { wch: 30 }];
  summary["!merges"] = [
    XLSX.utils.decode_range("A1:B1"),
    XLSX.utils.decode_range("A2:B2"),
    XLSX.utils.decode_range("A3:B3"),
    XLSX.utils.decode_range("A4:B4"),
  ];
  summary["!freeze"] = { xSplit: 0, ySplit: 6 };
  if (summary.B11) summary.B11.z = "0.0%";
  if (typeof summary.B14?.v === "number") summary.B14.z = "0.0%";
  XLSX.utils.book_append_sheet(workbook, summary, "Resumo");

  if (reportDemands.length) {
    const demandRows = reportDemands.map(item => ({
      Código: demandCode(item),
      Demanda: item.title,
      Descrição: item.description,
      Solicitante: item.requester || "",
      Gestor: item.manager?.trim() || "Gestor não informado",
      Responsável: item.responsible || "",
      Departamento: item.department || "",
      Categoria: item.category || "",
      Prioridade: item.priority || "",
      Status: effectiveStatus(item),
      Entrada: new Date(`${item.start_date}T12:00:00`),
      Prazo: new Date(`${item.due_date}T12:00:00`),
      "Horas estimadas": Number(item.estimated_hours || 0),
      "Horas realizadas": Number(item.actual_hours || 0),
      Tags: (item.tags || []).join(", "),
      Observações: item.notes || "",
    }));

    const demandSheet = XLSX.utils.json_to_sheet(demandRows, { cellDates: true });
    demandSheet["!cols"] = [12, 34, 48, 22, 22, 22, 20, 20, 12, 20, 14, 14, 16, 16, 24, 42]
      .map(wch => ({ wch }));
    demandSheet["!autofilter"] = { ref: demandSheet["!ref"] || "A1:P1" };
    demandSheet["!freeze"] = { xSplit: 0, ySplit: 1 };

    for (let row = 2; row <= demandRows.length + 1; row += 1) {
      if (demandSheet[`K${row}`]) demandSheet[`K${row}`].z = "dd/mm/yyyy";
      if (demandSheet[`L${row}`]) demandSheet[`L${row}`].z = "dd/mm/yyyy";
    }

    XLSX.utils.book_append_sheet(workbook, demandSheet, "Demandas");

    const managerRows = managerSummary(reportDemands).map(item => ({
      Gestor: item.manager,
      Demandas: item.demands,
      Concluídas: item.done,
      Atrasadas: item.overdue,
      "Horas estimadas": item.estimated,
      "Horas realizadas": item.actual,
      Utilização: item.estimated ? item.actual / item.estimated : "Sem estimativa",
    }));

    const managerSheet = XLSX.utils.json_to_sheet(managerRows);
    managerSheet["!cols"] = [28, 12, 12, 12, 18, 18, 16].map(wch => ({ wch }));
    managerSheet["!autofilter"] = { ref: managerSheet["!ref"] || "A1:G1" };
    managerSheet["!freeze"] = { xSplit: 0, ySplit: 1 };

    for (let row = 2; row <= managerRows.length + 1; row += 1) {
      if (typeof managerSheet[`G${row}`]?.v === "number") managerSheet[`G${row}`].z = "0.0%";
    }

    XLSX.utils.book_append_sheet(workbook, managerSheet, "Por gestor");
  }

  if (reportConverters.length) {
    const converterRows = reportConverters.map(item => ({
      Código: converterCode(item),
      Data: new Date(`${item.service_date}T12:00:00`),
      Local: item.location_name,
      Ponto: item.point_reference || "",
      Atendimento: item.service_type,
      Conversão: item.conversion_direction || "",
      Quantidade: Number(item.quantity_replaced || 0),
      Motivo: item.issue_reason || "",
      Status: item.status,
      Responsável: item.responsible_name || "",
      Observações: item.notes || "",
    }));

    const converterSheet = XLSX.utils.json_to_sheet(converterRows, { cellDates: true });
    converterSheet["!cols"] = [12, 14, 28, 22, 18, 18, 12, 40, 20, 22, 42]
      .map(wch => ({ wch }));
    converterSheet["!autofilter"] = { ref: converterSheet["!ref"] || "A1:K1" };
    converterSheet["!freeze"] = { xSplit: 0, ySplit: 1 };

    for (let row = 2; row <= converterRows.length + 1; row += 1) {
      if (converterSheet[`B${row}`]) converterSheet[`B${row}`].z = "dd/mm/yyyy";
    }

    XLSX.utils.book_append_sheet(workbook, converterSheet, "Conversores");
  }

  XLSX.writeFile(workbook, `fluux_relatorio_demandas_${fileDate()}.xlsx`);
  showToast("Planilha gerada com sucesso.", "success");
}

async function imageData(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;

    const blob = await response.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function pdfDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "—";

  return value.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function pdfDateTime(value = new Date()) {
  return value.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pdfIntervalLabel() {
  const interval = currentInterval();
  return `${pdfDate(interval.start)} a ${pdfDate(interval.end)}`;
}

function pdfFilterSummary() {
  const labels = [];
  const status = document.getElementById("reportStatus").value;
  const priority = document.getElementById("reportPriority").value;
  const manager = document.getElementById("reportManager").value;
  const category = document.getElementById("reportCategory").value;
  const responsible = document.getElementById("reportResponsible").value.trim();

  if (status) labels.push(`Status: ${status}`);
  if (priority) labels.push(`Prioridade: ${priority}`);
  if (manager) labels.push(`Gestor: ${manager}`);
  if (category) labels.push(`Categoria: ${category}`);
  if (responsible) labels.push(`Responsável: ${responsible}`);

  return labels.length ? labels.join(" · ") : "Todos os registros do período";
}

function pdfPercentage(value) {
  return `${Math.round(value * 100)}%`;
}

function pdfUtilizationLabel(estimated, actual) {
  if (!estimated && !actual) return "0%";
  if (!estimated) return "Sem estimativa";
  return `${Math.round((actual / estimated) * 100)}%`;
}

function pdfDrawSectionTitle(doc, title, y, color = [40, 75, 99]) {
  doc.setTextColor(...color);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.2);
  doc.text(String(title).toUpperCase(), 15, y);
  doc.setDrawColor(166, 172, 175);
  doc.setLineWidth(0.22);
  doc.line(15, y + 2.5, 195, y + 2.5);
  return y + 7;
}

function pdfDrawCompactHeader(doc, logo) {
  const page = doc.internal.getCurrentPageInfo().pageNumber;
  if (page === 1) return;

  if (logo) {
    doc.addImage(logo, "PNG", 15, 7, 24, 8.5, undefined, "FAST");
  } else {
    doc.setTextColor(0, 111, 151);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("FLUUX", 15, 14);
  }

  doc.setTextColor(40, 75, 99);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.8);
  doc.text("RELATÓRIO DE DEMANDAS", 195, 13, { align: "right" });
  doc.setDrawColor(249, 105, 0);
  doc.setLineWidth(0.45);
  doc.line(15, 19, 195, 19);
}

function pdfEnsureSpace(doc, y, required, logo) {
  if (y + required <= 274) return y;
  doc.addPage();
  pdfDrawCompactHeader(doc, logo);
  return 28;
}

function pdfDrawFooter(doc) {
  const pages = doc.getNumberOfPages();

  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(190, 194, 196);
    doc.setLineWidth(0.2);
    doc.line(15, 281, 195, 281);
    doc.setTextColor(115, 122, 126);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("FLUUX · Organização de Demandas", 15, 286.5);
    doc.text(`Página ${page} de ${pages}`, 195, 286.5, { align: "right" });
  }
}

async function exportPdf() {
  reportDemands = getDemands();
  reportConverters = getConverters();

  if (!reportDemands.length && !reportConverters.length) {
    showToast("Não há dados nos filtros atuais para exportar.", "error");
    return;
  }

  if (!window.jspdf?.jsPDF) {
    showToast("A biblioteca de PDF não foi carregada.", "error");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const generatedAt = new Date();
  const logo = await imageData("assets/img/logo.png");
  const metrics = demandMetrics(reportDemands);
  const converters = converterSummary(reportConverters);
  const managers = managerSummary(reportDemands);

  doc.setProperties({
    title: `FLUUX — Relatório de Demandas — ${periodLabel()}`,
    subject: `Demandas e conversores — ${pdfIntervalLabel()}`,
    author: state.profile?.full_name || "FLUUX",
    creator: "FLUUX — Organização de Demandas",
  });

  if (logo) {
    doc.addImage(logo, "PNG", 85, 7, 40, 14, undefined, "FAST");
  } else {
    doc.setTextColor(0, 111, 151);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(19);
    doc.text("FLUUX", 105, 18, { align: "center" });
  }

  doc.setTextColor(17, 21, 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("RELATÓRIO DE DEMANDAS", 105, 29, { align: "center" });

  doc.setTextColor(76, 85, 90);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Período: ${periodLabel()} · ${pdfIntervalLabel()}`, 105, 35, { align: "center" });
  doc.text(`Gerado em ${pdfDateTime(generatedAt)}`, 105, 40, { align: "center" });

  doc.setDrawColor(249, 105, 0);
  doc.setLineWidth(0.8);
  doc.line(15, 46, 195, 46);

  let y = pdfDrawSectionTitle(doc, "Resumo do período", 54);
  const summaryMetrics = [
    ["Total de demandas", String(metrics.total)],
    ["Concluídas", String(metrics.done)],
    ["Em andamento", String(metrics.progress)],
    ["Atrasadas", String(metrics.overdue)],
    ["Horas estimadas", formatHours(metrics.estimated)],
    ["Horas realizadas", formatHours(metrics.actual)],
    ["Taxa de conclusão", pdfPercentage(metrics.completionRate)],
    ["Utilização das horas", pdfUtilizationLabel(metrics.estimated, metrics.actual)],
  ];

  const cardGap = 4;
  const cardWidth = 88;
  const cardHeight = 15;
  const rowGap = 3;

  summaryMetrics.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 15 + column * (cardWidth + cardGap);
    const cardY = y + row * (cardHeight + rowGap);

    doc.setFillColor(250, 250, 249);
    doc.setDrawColor(207, 211, 213);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, cardY, cardWidth, cardHeight, 1.4, 1.4, "FD");

    doc.setTextColor(91, 99, 104);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.text(String(label).toUpperCase(), x + 4, cardY + 5.2);

    doc.setTextColor(22, 28, 31);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.8);
    doc.text(String(value), x + 4, cardY + 11.6);
  });

  y += 4 * (cardHeight + rowGap) + 2;

  const executiveText = metrics.total
    ? `No período selecionado foram registradas ${metrics.total} demanda${metrics.total === 1 ? "" : "s"}. ` +
      `${metrics.done} foram concluída${metrics.done === 1 ? "" : "s"}, com taxa de conclusão de ${pdfPercentage(metrics.completionRate)}. ` +
      `As horas realizadas representam ${pdfUtilizationLabel(metrics.estimated, metrics.actual)} do esforço estimado.`
    : "Não houve demandas no período selecionado. O documento apresenta somente os registros de sustentação de conversores encontrados nos filtros atuais.";

  doc.setTextColor(52, 60, 64);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const executiveLines = doc.splitTextToSize(executiveText, 180);
  doc.text(executiveLines, 15, y);
  y += executiveLines.length * 4 + 3;

  doc.setTextColor(89, 97, 102);
  doc.setFontSize(7.2);
  const filterLines = doc.splitTextToSize(`Filtros aplicados: ${pdfFilterSummary()}`, 180);
  doc.text(filterLines, 15, y);
  y += filterLines.length * 3.5 + 5;

  if (reportDemands.length) {
    y = pdfEnsureSpace(doc, y, 42, logo);
    y = pdfDrawSectionTitle(doc, "Demandas do período", y);

    doc.autoTable({
      startY: y,
      head: [["Código", "Demanda", "Gestor", "Responsável", "Status", "Prazo", "Est.", "Real."]],
      body: reportDemands.map(item => [
        demandCode(item),
        item.title || "—",
        item.manager?.trim() || "Gestor não informado",
        item.responsible || "—",
        effectiveStatus(item),
        formatDate(item.due_date, { year: true }),
        formatHours(item.estimated_hours),
        formatHours(item.actual_hours),
      ]),
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 6.25,
        cellPadding: 1.8,
        textColor: [45, 54, 59],
        lineColor: [204, 209, 211],
        lineWidth: 0.16,
        overflow: "linebreak",
        valign: "middle",
      },
      headStyles: {
        fillColor: [40, 75, 99],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 6.1,
        halign: "left",
      },
      alternateRowStyles: {
        fillColor: [248, 248, 246],
      },
      columnStyles: {
        0: { cellWidth: 16 },
        1: { cellWidth: 43 },
        2: { cellWidth: 24 },
        3: { cellWidth: 26 },
        4: { cellWidth: 21 },
        5: { cellWidth: 20 },
        6: { cellWidth: 14, halign: "center" },
        7: { cellWidth: 16, halign: "center" },
      },
      margin: { left: 15, right: 15, top: 24, bottom: 19 },
      showHead: "everyPage",
      rowPageBreak: "avoid",
      didDrawPage: () => pdfDrawCompactHeader(doc, logo),
    });

    y = doc.lastAutoTable.finalY + 8;

    if (managers.length) {
      y = pdfEnsureSpace(doc, y, 44, logo);
      y = pdfDrawSectionTitle(doc, "Resumo por gestor", y);

      doc.autoTable({
        startY: y,
        head: [["Gestor", "Demandas", "Concluídas", "Atrasadas", "Est.", "Real."]],
        body: managers.map(item => [
          item.manager,
          String(item.demands),
          String(item.done),
          String(item.overdue),
          formatHours(item.estimated),
          formatHours(item.actual),
        ]),
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 7,
          cellPadding: 2.1,
          textColor: [45, 54, 59],
          lineColor: [204, 209, 211],
          lineWidth: 0.16,
          valign: "middle",
        },
        headStyles: {
          fillColor: [237, 240, 241],
          textColor: [27, 45, 55],
          fontStyle: "bold",
          fontSize: 6.7,
        },
        alternateRowStyles: {
          fillColor: [250, 250, 249],
        },
        columnStyles: {
          0: { cellWidth: 62 },
          1: { cellWidth: 25, halign: "center" },
          2: { cellWidth: 26, halign: "center" },
          3: { cellWidth: 24, halign: "center" },
          4: { cellWidth: 21, halign: "center" },
          5: { cellWidth: 22, halign: "center" },
        },
        margin: { left: 15, right: 15, top: 24, bottom: 19 },
        showHead: "everyPage",
        rowPageBreak: "avoid",
        didDrawPage: () => pdfDrawCompactHeader(doc, logo),
      });

      y = doc.lastAutoTable.finalY + 8;
    }
  }

  if (reportConverters.length) {
    y = pdfEnsureSpace(doc, y, 50, logo);
    y = pdfDrawSectionTitle(doc, "Sustentação de conversores", y, [249, 105, 0]);

    doc.setTextColor(65, 73, 78);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const converterIntro = `${reportConverters.length} atendimento${reportConverters.length === 1 ? "" : "s"} · ` +
      `${converters.quantity} conversor${converters.quantity === 1 ? "" : "es"} trocado${converters.quantity === 1 ? "" : "s"} · ` +
      `Local mais recorrente: ${converters.topLocation}`;
    const converterLines = doc.splitTextToSize(converterIntro, 180);
    doc.text(converterLines, 15, y);
    y += converterLines.length * 4 + 3;

    doc.autoTable({
      startY: y,
      head: [["Código", "Data", "Local", "Ponto", "Atendimento", "Qtd.", "Status"]],
      body: reportConverters.map(item => [
        converterCode(item),
        formatDate(item.service_date, { year: true }),
        item.location_name || "—",
        item.point_reference || "—",
        item.service_type || "—",
        String(item.quantity_replaced || 0),
        item.status || "—",
      ]),
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 6.7,
        cellPadding: 2,
        textColor: [45, 54, 59],
        lineColor: [204, 209, 211],
        lineWidth: 0.16,
        overflow: "linebreak",
        valign: "middle",
      },
      headStyles: {
        fillColor: [249, 105, 0],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 6.5,
      },
      alternateRowStyles: {
        fillColor: [250, 248, 244],
      },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 23 },
        2: { cellWidth: 37 },
        3: { cellWidth: 31 },
        4: { cellWidth: 31 },
        5: { cellWidth: 15, halign: "center" },
        6: { cellWidth: 25 },
      },
      margin: { left: 15, right: 15, top: 24, bottom: 19 },
      showHead: "everyPage",
      rowPageBreak: "avoid",
      didDrawPage: () => pdfDrawCompactHeader(doc, logo),
    });
  }

  pdfDrawFooter(doc);
  doc.save(`fluux_relatorio_demandas_${fileDate(generatedAt)}.pdf`);
  showToast("PDF profissional gerado com sucesso.", "success");
}

bootPage(() => {
  populateFilters();
  document.querySelectorAll("[data-report-period]").forEach(button => button.addEventListener("click", () => setPeriod(button.dataset.reportPeriod)));
  ["reportStartDate", "reportEndDate", "reportStatus", "reportPriority", "reportManager", "reportCategory", "reportResponsible"].forEach(id => document.getElementById(id).addEventListener("input", render));
  document.getElementById("exportExcelButton").addEventListener("click", exportExcel);
  document.getElementById("exportPdfButton").addEventListener("click", exportPdf);
  setPeriod("30");
});
