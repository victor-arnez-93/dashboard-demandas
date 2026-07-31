import { state, effectiveStatus } from "./store.js";
import { escapeHtml } from "./ui.js";

const charts = new Map();
let activePeriod = "7";
let activeSlide = 0;
let autoTimer = null;

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const STATUS_COLORS = {
  Pendente: "#D4CDAB",
  "Em andamento": "#F96900",
  "Aguardando retorno": "#8aa6b8",
  Concluída: "#2bbf88",
  Atrasada: "#ee5b68",
  Cancelada: "#7d8589",
};

function inputDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

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

function currentInterval() {
  const today = new Date();
  const end = endOf(today);
  if (activePeriod === "custom") {
    const startValue = document.getElementById("presentationStartDate").value;
    const endValue = document.getElementById("presentationEndDate").value;
    return {
      start: startOf(`${startValue || inputDate(today)}T12:00:00`),
      end: endOf(`${endValue || inputDate(today)}T12:00:00`),
      label: "Período personalizado",
    };
  }
  if (activePeriod === "week") {
    const start = startOf(today);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    return { start, end, label: "Semana atual" };
  }
  if (activePeriod === "month") {
    return { start: new Date(today.getFullYear(), today.getMonth(), 1), end, label: "Mês atual" };
  }
  if (activePeriod === "year") {
    return { start: new Date(today.getFullYear(), 0, 1), end, label: `Ano de ${today.getFullYear()}` };
  }
  const start = startOf(today);
  start.setDate(start.getDate() - 6);
  return { start, end, label: "Últimos 7 dias" };
}

function demandIntervalData() {
  const { start, end } = currentInterval();
  return state.demands.filter(item => {
    const date = new Date(`${item.start_date}T12:00:00`);
    return date >= start && date <= end;
  });
}

function converterIntervalData() {
  const { start, end } = currentInterval();
  return state.converters.filter(item => {
    const date = new Date(`${item.service_date}T12:00:00`);
    return date >= start && date <= end;
  });
}

function destroyChart(id) {
  charts.get(id)?.destroy();
  charts.delete(id);
}

function createChart(id, config) {
  destroyChart(id);
  const canvas = document.getElementById(id);
  if (!canvas || !window.Chart) return;
  charts.set(id, new window.Chart(canvas, config));
}

function tooltip() {
  return {
    padding: 12,
    backgroundColor: css("--surface"),
    borderColor: css("--border-strong"),
    borderWidth: 1,
    titleColor: css("--text"),
    bodyColor: css("--text-soft"),
    cornerRadius: 12,
  };
}

function axisOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 650, easing: "easeOutQuart" },
    plugins: { legend: { display: false }, tooltip: tooltip() },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: css("--text-muted"), font: { family: "Inter", size: 11 } } },
      y: { beginAtZero: true, grid: { color: css("--border") }, border: { display: false }, ticks: { precision: 0, color: css("--text-muted"), font: { family: "Inter", size: 10 } } },
    },
  };
}

function bucketSeries(demands) {
  const { start, end } = currentInterval();
  const totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const points = Math.min(totalDays, totalDays <= 10 ? totalDays : 8);
  const bucketDays = Math.ceil(totalDays / points);
  const labels = [];
  const received = Array(points).fill(0);
  const completed = Array(points).fill(0);
  for (let index = 0; index < points; index++) {
    const bucketStart = new Date(start);
    bucketStart.setDate(start.getDate() + index * bucketDays);
    const bucketEnd = new Date(bucketStart);
    bucketEnd.setDate(bucketStart.getDate() + bucketDays - 1);
    labels.push(totalDays <= 10
      ? new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(bucketStart).replace(".", "")
      : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(bucketStart).replace(".", ""));
    demands.forEach(item => {
      const opened = new Date(`${item.start_date}T12:00:00`);
      if (opened >= bucketStart && opened <= endOf(bucketEnd)) received[index]++;
      if (item.completed_at) {
        const completedDate = new Date(item.completed_at);
        if (completedDate >= bucketStart && completedDate <= endOf(bucketEnd)) completed[index]++;
      }
    });
  }
  return { labels, received, completed };
}

function renderSummary() {
  const demands = demandIntervalData();
  const done = demands.filter(item => effectiveStatus(item) === "Concluída").length;
  const progress = demands.filter(item => effectiveStatus(item) === "Em andamento").length;
  const overdue = demands.filter(item => effectiveStatus(item) === "Atrasada").length;
  const estimated = demands.reduce((total, item) => total + Number(item.estimated_hours || 0), 0);
  const actual = demands.reduce((total, item) => total + Number(item.actual_hours || 0), 0);
  const doneRate = Math.round(done / Math.max(demands.length, 1) * 100);
  const hoursRate = estimated > 0 ? Math.round(actual / estimated * 100) : 0;
  document.getElementById("presentationTotal").textContent = demands.length;
  document.getElementById("presentationDone").textContent = done;
  document.getElementById("presentationProgress").textContent = progress;
  document.getElementById("presentationOverdue").textContent = overdue;
  document.getElementById("presentationDoneRate").textContent = `${doneRate}%`;
  document.getElementById("presentationHoursRate").textContent = `${hoursRate}%`;
  document.getElementById("presentationPeriodLabel").textContent = currentInterval().label;

  let insight = "Nenhuma demanda foi registrada no período selecionado.";
  if (demands.length) {
    if (overdue) insight = `${overdue} ${overdue === 1 ? "demanda exige" : "demandas exigem"} atenção por prazo vencido.`;
    else if (hoursRate > 100) insight = `As horas realizadas estão ${hoursRate - 100}% acima do planejado.`;
    else if (doneRate >= 70) insight = `O período apresenta ${doneRate}% de conclusão e nenhum atraso aberto.`;
    else insight = `${progress} ${progress === 1 ? "demanda está" : "demandas estão"} em andamento, com ${doneRate}% de conclusão.`;
  }
  document.querySelector("#presentationInsight span").textContent = insight;

  const series = bucketSeries(demands);
  createChart("presentationFlowChart", {
    type: "line",
    data: { labels: series.labels, datasets: [
      { label: "Recebidas", data: series.received, borderColor: css("--primary"), backgroundColor: `${css("--primary")}32`, fill: true, tension: .42, pointRadius: 3, pointHoverRadius: 5, borderWidth: 3 },
      { label: "Concluídas", data: series.completed, borderColor: "#2bbf88", backgroundColor: "transparent", tension: .42, pointRadius: 3, borderWidth: 3, borderDash: [6, 5] },
    ] },
    options: { ...axisOptions(), plugins: { ...axisOptions().plugins, legend: { display: true, labels: { color: css("--text-soft"), usePointStyle: true, boxWidth: 8 } } } },
  });

  const statuses = Object.keys(STATUS_COLORS);
  const values = statuses.map(status => demands.filter(item => effectiveStatus(item) === status).length);
  createChart("presentationStatusChart", {
    type: "doughnut",
    data: { labels: statuses, datasets: [{ data: values, backgroundColor: statuses.map(status => STATUS_COLORS[status]), borderColor: css("--surface"), borderWidth: 5, hoverOffset: 8 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "66%", animation: { duration: 650 }, plugins: { legend: { position: "bottom", labels: { color: css("--text-soft"), usePointStyle: true, boxWidth: 8, padding: 14, font: { size: 10 } } }, tooltip: tooltip() } },
  });
}

function managerData(demands) {
  const managerName = item => item.manager?.trim() || "Gestor não informado";
  const names = [...new Set(demands.map(managerName))].sort((a, b) => demands.filter(item => managerName(item) === b).length - demands.filter(item => managerName(item) === a).length).slice(0, 8);
  return names.map(name => {
    const items = demands.filter(item => managerName(item) === name);
    return {
      name,
      count: items.length,
      estimated: items.reduce((total, item) => total + Number(item.estimated_hours || 0), 0),
      actual: items.reduce((total, item) => total + Number(item.actual_hours || 0), 0),
      done: items.filter(item => effectiveStatus(item) === "Concluída").length,
    };
  });
}

function renderManagers() {
  const data = managerData(demandIntervalData());
  document.getElementById("presentationManagerHeadline").textContent = data.length ? `${data.length} ${data.length === 1 ? "gestor analisado" : "gestores analisados"}` : "Sem dados no período";
  createChart("presentationManagersChart", {
    type: "bar",
    data: { labels: data.map(item => item.name), datasets: [{ label: "Demandas", data: data.map(item => item.count), backgroundColor: css("--primary"), borderColor: css("--primary-hover"), borderWidth: 1, borderRadius: 12, maxBarThickness: 62 }] },
    options: axisOptions(),
  });
  createChart("presentationHoursChart", {
    type: "bar",
    data: { labels: data.map(item => item.name), datasets: [
      { label: "Estimadas", data: data.map(item => item.estimated), backgroundColor: css("--primary"), borderRadius: 10, maxBarThickness: 44 },
      { label: "Realizadas", data: data.map(item => item.actual), backgroundColor: css("--accent"), borderRadius: 10, maxBarThickness: 44 },
    ] },
    options: { ...axisOptions(), plugins: { ...axisOptions().plugins, legend: { display: true, labels: { color: css("--text-soft"), usePointStyle: true, boxWidth: 8 } } } },
  });
  const ranking = document.getElementById("presentationManagerRanking");
  ranking.innerHTML = data.length ? data.slice(0, 4).map((item, index) => `<div><b>${index + 1}</b><span><strong>${escapeHtml(item.name)}</strong><small>${item.count} demandas · ${item.done} concluídas · ${item.actual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h realizadas</small></span></div>`).join("") : `<p>Sem dados de gestores para o período selecionado.</p>`;
}

function monthlyConverterSeries(records) {
  const months = [];
  const now = new Date();
  for (let offset = 5; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    months.push({ key, label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "") });
  }
  return {
    labels: months.map(item => item.label),
    values: months.map(month => records.filter(item => item.service_date.startsWith(month.key)).reduce((total, item) => total + Number(item.quantity_replaced || 0), 0)),
  };
}

function renderConverters() {
  const records = converterIntervalData();
  const quantity = records.reduce((total, item) => total + Number(item.quantity_replaced || 0), 0);
  const done = records.filter(item => item.status?.toLocaleLowerCase("pt-BR").includes("conclu")).length;
  const byLocation = records.reduce((map, item) => {
    map[item.location_name] = (map[item.location_name] || 0) + 1;
    return map;
  }, {});
  const locations = Object.entries(byLocation).sort((a, b) => b[1] - a[1]).slice(0, 8);
  document.getElementById("presentationConverterRecords").textContent = records.length;
  document.getElementById("presentationConverterQuantity").textContent = quantity;
  document.getElementById("presentationConverterLocation").textContent = locations[0]?.[0] || "—";
  document.getElementById("presentationConverterDoneRate").textContent = `${Math.round(done / Math.max(records.length, 1) * 100)}%`;
  document.getElementById("presentationConverterHeadline").textContent = `${quantity} ${quantity === 1 ? "conversor trocado" : "conversores trocados"} no período`;

  const monthly = monthlyConverterSeries(state.converters);
  createChart("presentationConverterMonthlyChart", {
    type: "line",
    data: { labels: monthly.labels, datasets: [{ label: "Conversores trocados", data: monthly.values, borderColor: css("--accent"), backgroundColor: `${css("--accent")}28`, fill: true, tension: .42, pointRadius: 4, borderWidth: 3 }] },
    options: axisOptions(),
  });
  createChart("presentationConverterLocationChart", {
    type: "bar",
    data: { labels: locations.map(item => item[0]), datasets: [{ data: locations.map(item => item[1]), backgroundColor: css("--primary"), borderRadius: 10, maxBarThickness: 44 }] },
    options: { ...axisOptions(), indexAxis: "y" },
  });
}

export function renderPresentation() {
  renderSummary();
  renderManagers();
  renderConverters();
}

function showSlide(index) {
  activeSlide = (index + 3) % 3;
  document.querySelectorAll("[data-presentation-slide]").forEach(slide => {
    const active = Number(slide.dataset.presentationSlide) === activeSlide;
    slide.hidden = !active;
    slide.classList.toggle("active", active);
  });
  document.querySelectorAll("[data-slide-go]").forEach(button => button.classList.toggle("active", Number(button.dataset.slideGo) === activeSlide));
  setTimeout(() => renderPresentation(), 20);
}

function setAuto(enabled) {
  clearInterval(autoTimer);
  autoTimer = null;
  const button = document.getElementById("presentationAutoButton");
  button.setAttribute("aria-pressed", String(enabled));
  button.innerHTML = `<i class="fa-solid ${enabled ? "fa-pause" : "fa-play"}"></i> ${enabled ? "Pausar" : "Automático"}`;
  if (enabled) autoTimer = setInterval(() => showSlide(activeSlide + 1), 12000);
}

export function startPresentation() {
  const shell = document.getElementById("presentationShell");
  shell.hidden = false;
  document.body.classList.add("presentation-open");
  activeSlide = 0;
  showSlide(0);
  document.documentElement.requestFullscreen?.().catch(() => {});
}

export function stopPresentation() {
  const shell = document.getElementById("presentationShell");
  if (!shell || shell.hidden) return;
  shell.hidden = true;
  document.body.classList.remove("presentation-open");
  setAuto(false);
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

function selectPeriod(value) {
  activePeriod = value;
  document.querySelectorAll("[data-presentation-period]").forEach(button => button.classList.toggle("active", button.dataset.presentationPeriod === value));
  document.getElementById("presentationCustomPeriod").hidden = value !== "custom";
  if (value === "custom") {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 29);
    if (!document.getElementById("presentationStartDate").value) document.getElementById("presentationStartDate").value = inputDate(start);
    if (!document.getElementById("presentationEndDate").value) document.getElementById("presentationEndDate").value = inputDate(end);
  } else renderPresentation();
}

export function initPresentation() {
  document.getElementById("presentationButton").addEventListener("click", startPresentation);
  document.getElementById("exitPresentationButton").addEventListener("click", stopPresentation);
  document.getElementById("presentationPrev").addEventListener("click", () => showSlide(activeSlide - 1));
  document.getElementById("presentationNext").addEventListener("click", () => showSlide(activeSlide + 1));
  document.querySelectorAll("[data-slide-go]").forEach(button => button.addEventListener("click", () => showSlide(Number(button.dataset.slideGo))));
  document.querySelectorAll("[data-presentation-period]").forEach(button => button.addEventListener("click", () => selectPeriod(button.dataset.presentationPeriod)));
  document.getElementById("applyPresentationPeriod").addEventListener("click", renderPresentation);
  document.getElementById("presentationAutoButton").addEventListener("click", event => setAuto(event.currentTarget.getAttribute("aria-pressed") !== "true"));
  document.addEventListener("keydown", event => {
    if (document.getElementById("presentationShell").hidden) return;
    if (event.key === "Escape") stopPresentation();
    if (event.key === "ArrowRight") showSlide(activeSlide + 1);
    if (event.key === "ArrowLeft") showSlide(activeSlide - 1);
  });
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && !document.getElementById("presentationShell").hidden) stopPresentation();
  });
}
