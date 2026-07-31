import { bootPage } from "./shell.js";
import { state, effectiveStatus } from "./store.js";
import { createChart, chartColors, baseOptions, intervalFor, filterDemandsByStart, managerSeries, countBy, monthlyConverters, dateInInterval } from "./charts.js";

let period = "30";

function sortedMap(map) {
  return Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
}

function render() {
  const interval = intervalFor(period);
  const demands = filterDemandsByStart(state.demands, interval);
  const converters = state.converters.filter(item => dateInInterval(item.service_date, interval));
  const colors = chartColors();
  const managers = managerSeries(demands);

  createChart("managerChart", {
    type: "bar",
    data: { labels: managers.labels, datasets: [{ label: "Demandas", data: managers.counts, backgroundColor: `${colors.primary}dd`, borderColor: colors.primary, borderWidth: 1, borderRadius: 9, maxBarThickness: 74 }] },
    options: { ...baseOptions({ legend: false }), plugins: { ...baseOptions({ legend: false }).plugins, legend: { display: false } } },
  });

  const categories = sortedMap(countBy(demands, item => item.category));
  createChart("categoryChart", {
    type: "bar",
    data: { labels: categories.map(([label]) => label), datasets: [{ label: "Demandas", data: categories.map(([, value]) => value), backgroundColor: `${colors.accent}dc`, borderColor: colors.accent, borderWidth: 1, borderRadius: 9, maxBarThickness: 54 }] },
    options: { ...baseOptions({ horizontal: true, legend: false }), plugins: { ...baseOptions({ horizontal: true, legend: false }).plugins, legend: { display: false } } },
  });

  createChart("managerHoursChart", {
    type: "bar",
    data: { labels: managers.labels, datasets: [
      { label: "Estimadas", data: managers.estimated, backgroundColor: `${colors.primary}e6`, borderRadius: 8, maxBarThickness: 58 },
      { label: "Realizadas", data: managers.actual, backgroundColor: `${colors.accent}e6`, borderRadius: 8, maxBarThickness: 58 },
    ] },
    options: baseOptions(),
  });

  const priorities = ["Baixa", "Normal", "Alta", "Urgente"];
  const open = priorities.map(priority => demands.filter(item => item.priority === priority && effectiveStatus(item) !== "Concluída").length);
  const done = priorities.map(priority => demands.filter(item => item.priority === priority && effectiveStatus(item) === "Concluída").length);
  createChart("priorityChart", {
    type: "bar",
    data: { labels: priorities, datasets: [
      { label: "Abertas", data: open, backgroundColor: `${colors.accent}e6`, borderRadius: 8, maxBarThickness: 70 },
      { label: "Concluídas", data: done, backgroundColor: `${colors.success}e6`, borderRadius: 8, maxBarThickness: 70 },
    ] },
    options: baseOptions(),
  });

  const converterTrend = monthlyConverters(converters, interval);
  createChart("converterTrendChart", {
    type: "line",
    data: { labels: converterTrend.labels, datasets: [{ label: "Conversores trocados", data: converterTrend.values, borderColor: colors.accent, backgroundColor: `${colors.accent}22`, fill: true, tension: .38, pointRadius: 4, borderWidth: 2.5 }] },
    options: baseOptions(),
  });

  const locations = sortedMap(countBy(converters, item => item.location_name));
  createChart("converterLocationChart", {
    type: "bar",
    data: { labels: locations.map(([label]) => label), datasets: [{ label: "Ocorrências", data: locations.map(([, value]) => value), backgroundColor: `${colors.primary}dd`, borderRadius: 9, maxBarThickness: 50 }] },
    options: { ...baseOptions({ horizontal: true, legend: false }), plugins: { ...baseOptions({ horizontal: true, legend: false }).plugins, legend: { display: false } } },
  });
}

bootPage(() => {
  document.querySelectorAll("[data-analysis-period]").forEach(button => {
    button.addEventListener("click", () => {
      period = button.dataset.analysisPeriod;
      document.querySelectorAll("[data-analysis-period]").forEach(item => item.classList.toggle("active", item === button));
      render();
    });
  });
  window.addEventListener("fluux:themechange", render);
  render();
});
