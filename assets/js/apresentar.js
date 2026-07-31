import { log } from "./logger.js";
import { requireSession } from "./supabase-client.js";
import { initializeStore, state, effectiveStatus } from "./store.js";
import { applyTheme, escapeHtml } from "./ui.js";
import { createChart, chartColors, baseOptions, doughnutOptions, intervalFor, inputDate, dateInInterval, filterDemandsByStart, dailyFlow, statusDistribution, managerSeries, countBy } from "./charts.js";

let period = "7";
let slide = 0;
let autoTimer = null;

function labelForPeriod() {
  return { "7": "Últimos 7 dias", week: "Semana atual", month: "Mês atual", year: `Ano de ${new Date().getFullYear()}`, custom: "Período personalizado" }[period];
}

function interval() {
  return intervalFor(period, document.getElementById("presentationStartDate").value, document.getElementById("presentationEndDate").value);
}

function completedInInterval(range) {
  return state.demands.filter(item => item.completed_at && dateInInterval(item.completed_at, range));
}

function trendForConverters(records, range) {
  const days = Math.ceil((range.end - range.start) / 86400000) + 1;
  if (days <= 62) {
    const labels = [];
    const values = [];
    const cursor = new Date(range.start);
    while (cursor <= range.end && labels.length < 62) {
      const key = inputDate(cursor);
      labels.push(new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(cursor).replaceAll(".", ""));
      values.push(records.filter(item => item.service_date === key).reduce((total, item) => total + Number(item.quantity_replaced || 0), 0));
      cursor.setDate(cursor.getDate() + 1);
    }
    return { labels, values };
  }
  const months = [];
  const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
  const end = new Date(range.end.getFullYear(), range.end.getMonth(), 1);
  while (cursor <= end && months.length < 24) { months.push(new Date(cursor)); cursor.setMonth(cursor.getMonth() + 1); }
  return {
    labels: months.map(date => new Intl.DateTimeFormat("pt-BR", { month: "short", year: months.length > 12 ? "2-digit" : undefined }).format(date).replaceAll(".", "")),
    values: months.map(month => records.filter(item => { const date = new Date(`${item.service_date}T12:00:00`); return date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear(); }).reduce((total, item) => total + Number(item.quantity_replaced || 0), 0)),
  };
}

function renderSummary(range, received, completed) {
  const colors = chartColors();
  const progress = received.filter(item => effectiveStatus(item) === "Em andamento").length;
  const overdue = received.filter(item => effectiveStatus(item) === "Atrasada").length;
  const estimated = received.reduce((total, item) => total + Number(item.estimated_hours || 0), 0);
  const actual = received.reduce((total, item) => total + Number(item.actual_hours || 0), 0);
  const doneRate = Math.round(completed.length / Math.max(received.length, 1) * 100);
  const hoursRate = estimated ? Math.round(actual / estimated * 100) : actual ? 100 : 0;
  document.getElementById("pReceived").textContent = received.length;
  document.getElementById("pCompleted").textContent = completed.length;
  document.getElementById("pProgress").textContent = progress;
  document.getElementById("pOverdue").textContent = overdue;
  document.getElementById("pDoneRate").textContent = `${doneRate}%`;
  document.getElementById("pHoursRate").textContent = `${hoursRate}%`;
  document.getElementById("periodLabel").textContent = labelForPeriod();

  let insight = "Sem registros suficientes para destacar tendências neste período.";
  if (overdue > 0) insight = `${overdue} ${overdue === 1 ? "demanda está atrasada" : "demandas estão atrasadas"}; prioridade para revisão de prazo e próximos passos.`;
  else if (hoursRate > 100) insight = `As horas realizadas estão ${hoursRate - 100}% acima da estimativa nas demandas recebidas no período.`;
  else if (completed.length > received.length) insight = `A equipe concluiu ${completed.length - received.length} demanda(s) a mais do que recebeu, reduzindo o estoque anterior.`;
  else if (received.length > 0) insight = `${completed.length} de ${received.length} demandas recebidas foram concluídas no período.`;
  document.getElementById("pInsight").textContent = insight;

  const flow = dailyFlow(state.demands, range);
  createChart("pFlowChart", { type: "line", data: { labels: flow.labels, datasets: [
    { label: "Recebidas", data: flow.received, borderColor: colors.primary, backgroundColor: `${colors.primary}22`, fill: true, tension: .38, pointRadius: 3, borderWidth: 2.5 },
    { label: "Concluídas", data: flow.completed, borderColor: colors.success, backgroundColor: `${colors.success}16`, fill: false, tension: .38, pointRadius: 3, borderWidth: 2.5 },
  ] }, options: baseOptions() });
  const status = statusDistribution(received);
  createChart("pStatusChart", { type: "doughnut", data: { labels: status.labels, datasets: [{ data: status.values, backgroundColor: [colors.sand, colors.accent, colors.info, colors.success, colors.danger, colors.muted], borderColor: colors.surface, borderWidth: 3, hoverOffset: 5 }] }, options: doughnutOptions() });
}

function renderManagers(received) {
  const colors = chartColors();
  const managers = managerSeries(received);
  document.getElementById("pManagerHeadline").textContent = `${managers.labels.length} ${managers.labels.length === 1 ? "gestor" : "gestores"} no período`;
  createChart("pManagersChart", { type: "bar", data: { labels: managers.labels, datasets: [{ label: "Demandas", data: managers.counts, backgroundColor: `${colors.primary}e5`, borderRadius: 8, maxBarThickness: 62 }] }, options: { ...baseOptions({ legend: false }), plugins: { ...baseOptions({ legend: false }).plugins, legend: { display: false } } } });
  createChart("pHoursChart", { type: "bar", data: { labels: managers.labels, datasets: [
    { label: "Estimadas", data: managers.estimated, backgroundColor: `${colors.primary}e5`, borderRadius: 8, maxBarThickness: 54 },
    { label: "Realizadas", data: managers.actual, backgroundColor: `${colors.accent}e5`, borderRadius: 8, maxBarThickness: 54 },
  ] }, options: baseOptions() });
  document.getElementById("pManagerRanking").innerHTML = managers.labels.slice(0, 3).map((label, index) => `<article><small>${index + 1}º EM VOLUME</small><strong>${escapeHtml(label)}</strong><span>${managers.map[label].count} demandas · ${managers.map[label].done} concluídas</span></article>`).join("") || `<article><small>SEM DADOS</small><strong>—</strong><span>Nenhum gestor no período</span></article>`;
}

function renderConverters(range) {
  const colors = chartColors();
  const records = state.converters.filter(item => dateInInterval(item.service_date, range));
  const quantity = records.reduce((total, item) => total + Number(item.quantity_replaced || 0), 0);
  const locations = Object.entries(countBy(records, item => item.location_name)).sort((a, b) => b[1] - a[1]);
  const done = records.filter(item => item.status === "Concluído").length;
  document.getElementById("pConverterRecords").textContent = records.length;
  document.getElementById("pConverterQuantity").textContent = quantity;
  document.getElementById("pConverterLocation").textContent = locations[0]?.[0] || "—";
  document.getElementById("pConverterDoneRate").textContent = `${Math.round(done / Math.max(records.length, 1) * 100)}%`;
  document.getElementById("pConverterHeadline").textContent = `${quantity} ${quantity === 1 ? "conversor trocado" : "conversores trocados"} no período`;
  const trend = trendForConverters(records, range);
  createChart("pConverterTrendChart", { type: "line", data: { labels: trend.labels, datasets: [{ label: "Conversores trocados", data: trend.values, borderColor: colors.accent, backgroundColor: `${colors.accent}22`, fill: true, tension: .38, pointRadius: 3, borderWidth: 2.5 }] }, options: baseOptions() });
  createChart("pConverterLocationChart", { type: "bar", data: { labels: locations.map(([label]) => label), datasets: [{ label: "Ocorrências", data: locations.map(([,value]) => value), backgroundColor: `${colors.primary}e5`, borderRadius: 8, maxBarThickness: 48 }] }, options: { ...baseOptions({ horizontal: true, legend: false }), plugins: { ...baseOptions({ horizontal: true, legend: false }).plugins, legend: { display: false } } } });
}

function renderAll() {
  const range = interval();
  const received = filterDemandsByStart(state.demands, range);
  const completed = completedInInterval(range);
  renderSummary(range, received, completed);
  renderManagers(received);
  renderConverters(range);
}

function showSlide(index) {
  slide = (index + 3) % 3;
  document.querySelectorAll("[data-slide]").forEach(item => { const active = Number(item.dataset.slide) === slide; item.hidden = !active; });
  document.querySelectorAll("[data-go-slide]").forEach(item => item.classList.toggle("active", Number(item.dataset.goSlide) === slide));
}

function setAuto(enabled) {
  const button = document.getElementById("autoButton");
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = enabled ? setInterval(() => showSlide(slide + 1), 10000) : null;
  button.setAttribute("aria-pressed", String(enabled));
  button.innerHTML = enabled ? `<i class="fa-solid fa-pause"></i> Pausar` : `<i class="fa-solid fa-play"></i> Automático`;
}

async function boot() {
  try {
    log.boot();
    const session = await requireSession();
    if (!session) return;
    await initializeStore(session);
    applyTheme(state.profile.theme);
    const today = new Date();
    const start = new Date(); start.setDate(start.getDate() - 6);
    document.getElementById("presentationStartDate").value = inputDate(start);
    document.getElementById("presentationEndDate").value = inputDate(today);
    document.getElementById("presentationShell").hidden = false;
    document.getElementById("bootScreen").hidden = true;
    document.querySelectorAll("[data-presentation-period]").forEach(button => button.addEventListener("click", () => {
      period = button.dataset.presentationPeriod;
      document.querySelectorAll("[data-presentation-period]").forEach(item => item.classList.toggle("active", item === button));
      document.getElementById("presentationCustom").hidden = period !== "custom";
      if (period !== "custom") renderAll();
    }));
    document.getElementById("applyCustomPeriod").addEventListener("click", renderAll);
    document.getElementById("prevSlide").addEventListener("click", () => showSlide(slide - 1));
    document.getElementById("nextSlide").addEventListener("click", () => showSlide(slide + 1));
    document.querySelectorAll("[data-go-slide]").forEach(button => button.addEventListener("click", () => showSlide(Number(button.dataset.goSlide))));
    document.getElementById("autoButton").addEventListener("click", event => setAuto(event.currentTarget.getAttribute("aria-pressed") !== "true"));
    document.getElementById("fullscreenButton").addEventListener("click", async () => {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      else await document.exitFullscreen?.();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "ArrowRight") showSlide(slide + 1);
      if (event.key === "ArrowLeft") showSlide(slide - 1);
      if (event.key === "Escape" && !document.fullscreenElement) location.href = "inicio.html";
    });
    window.addEventListener("fluux:themechange", renderAll);
    renderAll();
  } catch (error) {
    log.error("APRESENTAÇÃO", "Falha ao iniciar.", error);
    document.getElementById("bootScreen").hidden = true;
    document.getElementById("fatalMessage").textContent = error.message || "Confira a configuração e tente novamente.";
    document.getElementById("fatalLayer").hidden = false;
  }
}
boot();
