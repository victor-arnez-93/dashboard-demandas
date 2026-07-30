import { state, effectiveStatus } from "./store.js";

const charts = new Map();
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const STATUS_COLORS = {
  Pendente: "#D4CDAB",
  "Em andamento": "#F96900",
  "Aguardando retorno": "#8aa6b8",
  Concluída: "#2bbf88",
  Atrasada: "#ee5b68",
  Cancelada: "#7d8589",
};

function create(id, config) {
  charts.get(id)?.destroy();
  const canvas = document.getElementById(id);
  if (!canvas || !window.Chart) return;
  charts.set(id, new window.Chart(canvas, config));
}

function baseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: { display: false },
      tooltip: { padding: 10, backgroundColor: css("--surface"), borderColor: css("--border"), borderWidth: 1, titleColor: css("--text"), bodyColor: css("--text-soft"), cornerRadius: 10 },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: css("--text-muted"), font: { family: "Inter", size: 9 } } },
      y: { beginAtZero: true, ticks: { precision: 0, color: css("--text-muted"), font: { family: "Inter", size: 9 } }, grid: { color: css("--border") }, border: { display: false } },
    },
  };
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function periodDemands(days = 30) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - Number(days) + 1);
  return state.demands.filter(item => new Date(`${item.start_date}T12:00:00`) >= start);
}

export function renderDashboardCharts(days = 30) {
  const demands = periodDemands(days);
  const points = Number(days) === 7 ? 7 : 6;
  const bucketDays = Math.ceil(Number(days) / points);
  const labels = [];
  const received = Array(points).fill(0);
  const completed = Array(points).fill(0);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - Number(days) + 1);

  for (let i = 0; i < points; i++) {
    const bucketStart = new Date(start);
    bucketStart.setDate(start.getDate() + i * bucketDays);
    const bucketEnd = new Date(bucketStart);
    bucketEnd.setDate(bucketStart.getDate() + bucketDays - 1);
    labels.push(Number(days) === 7
      ? new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(bucketStart).replace(".", "")
      : `${bucketStart.getDate()}/${bucketStart.getMonth() + 1}`);
    demands.forEach(item => {
      const opened = new Date(`${item.start_date}T12:00:00`);
      if (opened >= bucketStart && opened <= new Date(`${dateKey(bucketEnd)}T23:59:59`)) received[i]++;
      if (item.completed_at) {
        const done = new Date(item.completed_at);
        if (done >= bucketStart && done <= new Date(`${dateKey(bucketEnd)}T23:59:59`)) completed[i]++;
      }
    });
  }

  create("flowChart", {
    type: "line",
    data: { labels, datasets: [
      { label: "Recebidas", data: received, borderColor: css("--primary"), backgroundColor: `${css("--primary")}28`, fill: true, tension: .38, pointRadius: 2, borderWidth: 2 },
      { label: "Concluídas", data: completed, borderColor: "#2bbf88", backgroundColor: "transparent", tension: .38, pointRadius: 2, borderWidth: 2, borderDash: [5, 4] },
    ] },
    options: baseOptions(),
  });

  const statuses = Object.keys(STATUS_COLORS);
  const values = statuses.map(status => demands.filter(item => effectiveStatus(item) === status).length);
  create("statusChart", {
    type: "doughnut",
    data: { labels: statuses, datasets: [{ data: values, backgroundColor: statuses.map(item => STATUS_COLORS[item]), borderColor: css("--surface"), borderWidth: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "72%", plugins: { legend: { display: false }, tooltip: baseOptions().plugins.tooltip } },
  });
  document.getElementById("donutTotal").textContent = demands.length;
  document.getElementById("statusLegend").innerHTML = statuses.map((status, index) => `<span><i style="background:${STATUS_COLORS[status]}"></i>${status} · ${values[index]}</span>`).join("");
}

export function renderAnalysisCharts() {
  const demands = state.demands;
  const managerName = item => item.manager?.trim() || "Gestor não informado";
  const managers = [...new Set(demands.map(managerName))]
    .sort((a, b) => demands.filter(item => managerName(item) === b).length - demands.filter(item => managerName(item) === a).length)
    .slice(0, 12);
  const categories = [...new Set(demands.map(item => item.category).filter(Boolean))].slice(0, 12);
  create("managerChart", {
    type: "bar",
    data: {
      labels: managers,
      datasets: [{
        label: "Demandas",
        data: managers.map(name => demands.filter(item => managerName(item) === name).length),
        backgroundColor: css("--primary"),
        borderRadius: 8,
      }],
    },
    options: baseOptions(),
  });
  create("categoryChart", {
    type: "bar",
    data: { labels: categories, datasets: [{ data: categories.map(name => demands.filter(item => item.category === name).length), backgroundColor: css("--accent"), borderRadius: 7 }] },
    options: { ...baseOptions(), indexAxis: "y" },
  });
  create("hoursChart", {
    type: "bar",
    data: {
      labels: managers,
      datasets: [
        {
          label: "Estimadas",
          data: managers.map(name => demands
            .filter(item => managerName(item) === name)
            .reduce((total, item) => total + Number(item.estimated_hours || 0), 0)),
          backgroundColor: css("--primary"),
          borderRadius: 7,
        },
        {
          label: "Realizadas",
          data: managers.map(name => demands
            .filter(item => managerName(item) === name)
            .reduce((total, item) => total + Number(item.actual_hours || 0), 0)),
          backgroundColor: css("--accent"),
          borderRadius: 7,
        },
      ],
    },
    options: {
      ...baseOptions(),
      plugins: {
        ...baseOptions().plugins,
        legend: { display: true, labels: { color: css("--text-soft"), boxWidth: 10, font: { size: 9 } } },
      },
      scales: {
        ...baseOptions().scales,
        y: { ...baseOptions().scales.y, ticks: { ...baseOptions().scales.y.ticks, precision: 1 } },
      },
    },
  });
  const priorities = ["Baixa", "Normal", "Alta", "Urgente"];
  create("priorityChart", {
    type: "bar",
    data: { labels: priorities, datasets: [
      { label: "Abertas", data: priorities.map(priority => demands.filter(item => item.priority === priority && !["Concluída", "Cancelada"].includes(effectiveStatus(item))).length), backgroundColor: css("--accent"), borderRadius: 6 },
      { label: "Concluídas", data: priorities.map(priority => demands.filter(item => item.priority === priority && effectiveStatus(item) === "Concluída").length), backgroundColor: "#2bbf88", borderRadius: 6 },
    ] },
    options: { ...baseOptions(), plugins: { ...baseOptions().plugins, legend: { display: true, labels: { color: css("--text-soft"), boxWidth: 10, font: { size: 9 } } } } },
  });
}

export function redrawCharts(days = 30) {
  renderDashboardCharts(days);
  renderAnalysisCharts();
}
