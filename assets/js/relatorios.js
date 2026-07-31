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

function pdfStoredDate(value) {
  if (!value) return "—";

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? `${value}T12:00:00`
    : value;

  return pdfDate(new Date(normalized));
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
  const responsible = document
    .getElementById("reportResponsible")
    .value
    .trim();

  if (status) labels.push(`Status: ${status}`);
  if (priority) labels.push(`Prioridade: ${priority}`);
  if (manager) labels.push(`Gestor: ${manager}`);
  if (category) labels.push(`Categoria: ${category}`);
  if (responsible) labels.push(`Responsável: ${responsible}`);

  return labels.length
    ? labels.join(" · ")
    : "Todos os registros do período selecionado";
}

function pdfPercentage(value) {
  return `${Math.round(value * 100)}%`;
}

function pdfUtilizationLabel(estimated, actual) {
  if (!estimated && !actual) return "0%";
  if (!estimated) return "Sem estimativa";

  return `${Math.round((actual / estimated) * 100)}%`;
}

function pdfValue(value, fallback = "—") {
  if (Array.isArray(value)) {
    const text = value
      .filter(Boolean)
      .join(", ")
      .trim();

    return text || fallback;
  }

  if (value === 0) return "0";

  const text = String(value ?? "").trim();
  return text || fallback;
}

function pdfDrawLogo(
  doc,
  logo,
  centerX,
  y,
  maxWidth,
  maxHeight,
) {
  if (!logo) {
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text(
      "FLUUX",
      centerX,
      y + maxHeight - 1,
      { align: "center" },
    );
    return;
  }

  try {
    const properties = doc.getImageProperties(logo);
    const ratio = properties.width / properties.height;

    let width = maxWidth;
    let height = width / ratio;

    if (height > maxHeight) {
      height = maxHeight;
      width = height * ratio;
    }

    doc.addImage(
      logo,
      "PNG",
      centerX - width / 2,
      y,
      width,
      height,
      undefined,
      "FAST",
    );
  } catch {
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text(
      "FLUUX",
      centerX,
      y + maxHeight - 1,
      { align: "center" },
    );
  }
}

function pdfDrawSectionTitle(doc, title, y) {
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.2);
  doc.text(String(title).toUpperCase(), 15, y);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.line(15, y + 2.5, 195, y + 2.5);

  return y + 7;
}

function pdfDrawCompactHeader(doc, logo) {
  if (
    doc.internal.getCurrentPageInfo().pageNumber === 1
  ) {
    return;
  }

  pdfDrawLogo(
    doc,
    logo,
    28,
    7,
    24,
    8,
  );

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.8);
  doc.text(
    "RELATÓRIO DE DEMANDAS",
    195,
    13,
    { align: "right" },
  );

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.line(15, 19, 195, 19);
}

function pdfEnsureSpace(
  doc,
  y,
  required,
  logo,
) {
  if (y + required <= 274) return y;

  doc.addPage();
  pdfDrawCompactHeader(doc, logo);

  return 28;
}

function pdfDrawFooter(doc) {
  const pages = doc.getNumberOfPages();

  for (
    let page = 1;
    page <= pages;
    page += 1
  ) {
    doc.setPage(page);

    doc.setDrawColor(90, 90, 90);
    doc.setLineWidth(0.2);
    doc.line(15, 281, 195, 281);

    doc.setTextColor(70, 70, 70);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);

    doc.text(
      "FLUUX · Organização de Demandas",
      15,
      286.5,
    );

    doc.text(
      `Página ${page} de ${pages}`,
      195,
      286.5,
      { align: "right" },
    );
  }
}

function pdfTableBase(doc, logo) {
  return {
    theme: "grid",

    styles: {
      font: "helvetica",
      fontSize: 6.6,
      cellPadding: 2,
      textColor: [20, 20, 20],
      lineColor: [145, 145, 145],
      lineWidth: 0.18,
      overflow: "linebreak",
      valign: "middle",
    },

    headStyles: {
      fillColor: [0, 0, 0],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
      lineWidth: 0.18,
    },

    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },

    margin: {
      left: 15,
      right: 15,
      top: 24,
      bottom: 19,
    },

    showHead: "everyPage",
    rowPageBreak: "avoid",

    didDrawPage: () =>
      pdfDrawCompactHeader(doc, logo),
  };
}

function pdfDemandRows(records) {
  return records.map(item => [
    demandCode(item),

    [
      `Demanda: ${pdfValue(item.title)}`,
      `Descrição: ${pdfValue(item.description)}`,
      `Solicitante: ${pdfValue(item.requester)}`,
      `Tags: ${pdfValue(item.tags)}`,
      `Observações: ${pdfValue(item.notes)}`,
    ].join("\n"),

    [
      `Gestor: ${pdfValue(
        item.manager?.trim(),
        "Gestor não informado",
      )}`,
      `Responsável: ${pdfValue(item.responsible)}`,
      `Departamento: ${pdfValue(item.department)}`,
      `Categoria: ${pdfValue(item.category)}`,
      `Prioridade: ${pdfValue(item.priority)}`,
      `Status: ${effectiveStatus(item)}`,
    ].join("\n"),

    [
      `Entrada: ${pdfStoredDate(item.start_date)}`,
      `Prazo: ${pdfStoredDate(item.due_date)}`,
      `Conclusão: ${pdfStoredDate(item.completed_at)}`,
      `Estimadas: ${formatHours(
        item.estimated_hours,
      )}`,
      `Realizadas: ${formatHours(
        item.actual_hours,
      )}`,
    ].join("\n"),
  ]);
}

function pdfConverterRows(records) {
  return records.map(item => [
    [
      converterCode(item),
      `Data: ${pdfStoredDate(item.service_date)}`,
    ].join("\n"),

    [
      `Local: ${pdfValue(item.location_name)}`,
      `Ponto: ${pdfValue(item.point_reference)}`,
    ].join("\n"),

    [
      `Atendimento: ${pdfValue(item.service_type)}`,
      `Conversão: ${pdfValue(
        item.conversion_direction,
      )}`,
      `Quantidade: ${Number(
        item.quantity_replaced || 0,
      )}`,
      `Status: ${pdfValue(item.status)}`,
    ].join("\n"),

    [
      `Responsável: ${pdfValue(
        item.responsible_name,
      )}`,
      `Motivo: ${pdfValue(item.issue_reason)}`,
      `Observações: ${pdfValue(item.notes)}`,
    ].join("\n"),
  ]);
}

async function exportPdf() {
  reportDemands = getDemands();
  reportConverters = getConverters();

  if (
    !reportDemands.length &&
    !reportConverters.length
  ) {
    showToast(
      "Não há dados nos filtros atuais para exportar.",
      "error",
    );
    return;
  }

  if (!window.jspdf?.jsPDF) {
    showToast(
      "A biblioteca de PDF não foi carregada.",
      "error",
    );
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
  const logo = await imageData(
    "assets/img/logo.png",
  );

  const metrics = demandMetrics(reportDemands);
  const converters = converterSummary(
    reportConverters,
  );
  const managers = managerSummary(reportDemands);
  const tableBase = pdfTableBase(doc, logo);

  doc.setProperties({
    title:
      `FLUUX — Relatório de Demandas — ` +
      periodLabel(),

    subject:
      `Demandas e conversores — ` +
      pdfIntervalLabel(),

    author:
      state.profile?.full_name || "FLUUX",

    creator:
      "FLUUX — Organização de Demandas",
  });

  pdfDrawLogo(
    doc,
    logo,
    105,
    7,
    34,
    11,
  );

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);

  doc.text(
    "RELATÓRIO DE DEMANDAS",
    105,
    27,
    { align: "center" },
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  doc.text(
    `Período: ${periodLabel()} · ` +
      pdfIntervalLabel(),
    105,
    33,
    { align: "center" },
  );

  doc.text(
    `Gerado em ${pdfDateTime(generatedAt)}`,
    105,
    38,
    { align: "center" },
  );

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(15, 44, 195, 44);

  let y = pdfDrawSectionTitle(
    doc,
    "Resumo do período",
    52,
  );

  doc.autoTable({
    ...tableBase,

    startY: y,

    head: [[
      "Indicador",
      "Valor",
      "Indicador",
      "Valor",
    ]],

    body: [
      [
        "Total de demandas",
        String(metrics.total),
        "Concluídas",
        String(metrics.done),
      ],
      [
        "Em andamento",
        String(metrics.progress),
        "Atrasadas",
        String(metrics.overdue),
      ],
      [
        "Horas estimadas",
        formatHours(metrics.estimated),
        "Horas realizadas",
        formatHours(metrics.actual),
      ],
      [
        "Taxa de conclusão",
        pdfPercentage(metrics.completionRate),
        "Utilização das horas",
        pdfUtilizationLabel(
          metrics.estimated,
          metrics.actual,
        ),
      ],
    ],

    styles: {
      ...tableBase.styles,
      fontSize: 7.2,
      cellPadding: 2.4,
    },

    columnStyles: {
      0: {
        cellWidth: 52,
        fontStyle: "bold",
      },

      1: {
        cellWidth: 38,
      },

      2: {
        cellWidth: 52,
        fontStyle: "bold",
      },

      3: {
        cellWidth: 38,
      },
    },
  });

  y = doc.lastAutoTable.finalY + 6;

  const executiveText = metrics.total
    ? (
      `No período selecionado foram registradas ` +
      `${metrics.total} demanda${
        metrics.total === 1 ? "" : "s"
      }. ` +
      `${metrics.done} foram concluída${
        metrics.done === 1 ? "" : "s"
      }, com taxa de conclusão de ` +
      `${pdfPercentage(metrics.completionRate)}. ` +
      `As horas realizadas representam ` +
      `${pdfUtilizationLabel(
        metrics.estimated,
        metrics.actual,
      )} do esforço estimado.`
    )
    : (
      "Não houve demandas no período selecionado. " +
      "O documento apresenta somente os registros " +
      "de sustentação de conversores encontrados " +
      "no período."
    );

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  const executiveLines =
    doc.splitTextToSize(
      executiveText,
      180,
    );

  doc.text(
    executiveLines,
    15,
    y,
  );

  y += executiveLines.length * 4 + 3;

  doc.setFontSize(7.2);

  const filterLines =
    doc.splitTextToSize(
      `Filtros aplicados: ${pdfFilterSummary()}`,
      180,
    );

  doc.text(
    filterLines,
    15,
    y,
  );

  y += filterLines.length * 3.5 + 5;

  if (reportDemands.length) {
    y = pdfEnsureSpace(
      doc,
      y,
      44,
      logo,
    );

    y = pdfDrawSectionTitle(
      doc,
      "Demandas do período",
      y,
    );

    doc.autoTable({
      ...tableBase,

      startY: y,

      head: [[
        "Código",
        "Demanda e conteúdo",
        "Gestão e classificação",
        "Datas e esforço",
      ]],

      body: pdfDemandRows(
        reportDemands,
      ),

      styles: {
        ...tableBase.styles,
        fontSize: 6.15,
        cellPadding: 2.1,
        valign: "top",
      },

      columnStyles: {
        0: {
          cellWidth: 18,
          fontStyle: "bold",
        },

        1: {
          cellWidth: 70,
        },

        2: {
          cellWidth: 52,
        },

        3: {
          cellWidth: 40,
        },
      },
    });

    y = doc.lastAutoTable.finalY + 8;

    if (managers.length) {
      y = pdfEnsureSpace(
        doc,
        y,
        42,
        logo,
      );

      y = pdfDrawSectionTitle(
        doc,
        "Resumo por gestor",
        y,
      );

      doc.autoTable({
        ...tableBase,

        startY: y,

        head: [[
          "Gestor",
          "Demandas",
          "Concluídas",
          "Atrasadas",
          "Est.",
          "Real.",
          "Utilização",
        ]],

        body: managers.map(item => [
          item.manager,
          String(item.demands),
          String(item.done),
          String(item.overdue),
          formatHours(item.estimated),
          formatHours(item.actual),
          pdfUtilizationLabel(
            item.estimated,
            item.actual,
          ),
        ]),

        styles: {
          ...tableBase.styles,
          fontSize: 6.8,
        },

        columnStyles: {
          0: {
            cellWidth: 54,
          },

          1: {
            cellWidth: 21,
            halign: "center",
          },

          2: {
            cellWidth: 23,
            halign: "center",
          },

          3: {
            cellWidth: 22,
            halign: "center",
          },

          4: {
            cellWidth: 20,
            halign: "center",
          },

          5: {
            cellWidth: 20,
            halign: "center",
          },

          6: {
            cellWidth: 20,
            halign: "center",
          },
        },
      });

      y = doc.lastAutoTable.finalY + 8;
    }
  }

  if (reportConverters.length) {
    y = pdfEnsureSpace(
      doc,
      y,
      48,
      logo,
    );

    y = pdfDrawSectionTitle(
      doc,
      "Sustentação de conversores",
      y,
    );

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);

    const converterIntro =
      `${reportConverters.length} atendimento${
        reportConverters.length === 1
          ? ""
          : "s"
      } · ` +
      `${converters.quantity} conversor${
        converters.quantity === 1
          ? ""
          : "es"
      } trocado${
        converters.quantity === 1
          ? ""
          : "s"
      } · ` +
      `Local mais recorrente: ` +
      `${converters.topLocation}`;

    const converterLines =
      doc.splitTextToSize(
        converterIntro,
        180,
      );

    doc.text(
      converterLines,
      15,
      y,
    );

    y += converterLines.length * 4 + 3;

    doc.autoTable({
      ...tableBase,

      startY: y,

      head: [[
        "Código e data",
        "Local e ponto",
        "Atendimento",
        "Resultado e observações",
      ]],

      body: pdfConverterRows(
        reportConverters,
      ),

      styles: {
        ...tableBase.styles,
        fontSize: 6.2,
        cellPadding: 2.1,
        valign: "top",
      },

      columnStyles: {
        0: {
          cellWidth: 26,
          fontStyle: "bold",
        },

        1: {
          cellWidth: 48,
        },

        2: {
          cellWidth: 47,
        },

        3: {
          cellWidth: 59,
        },
      },
    });
  }

  pdfDrawFooter(doc);

  doc.save(
    `fluux_relatorio_demandas_` +
    `${fileDate(generatedAt)}.pdf`,
  );

  showToast(
    "PDF em preto e branco gerado com sucesso.",
    "success",
  );
}

bootPage(() => {
  populateFilters();
  document.querySelectorAll("[data-report-period]").forEach(button => button.addEventListener("click", () => setPeriod(button.dataset.reportPeriod)));
  ["reportStartDate", "reportEndDate", "reportStatus", "reportPriority", "reportManager", "reportCategory", "reportResponsible"].forEach(id => document.getElementById(id).addEventListener("input", render));
  document.getElementById("exportExcelButton").addEventListener("click", exportExcel);
  document.getElementById("exportPdfButton").addEventListener("click", exportPdf);
  setPeriod("30");
});
