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

function tooltipOptions() {
  return {
    padding: 12,
    backgroundColor: css("--surface"),
    borderColor: css("--border-strong"),
    borderWidth: 1,
    titleColor: css("--text"),
    bodyColor: css("--text-soft"),
    cornerRadius: 12,
    displayColors: true,
    usePointStyle: true,
  };
}

function baseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    animation: { duration: 520, easing: "easeOutQuart" },
    plugins: {
      legend: { display: false },
      tooltip: tooltipOptions(),
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: css("--text-muted"), font: { family: "Inter", size: 10 }, maxRotation: 0 },
      },
      y: {
        beginAtZero: true,
        ticks: { precision: 0, color: css("--text-muted"), font: { family: "Inter", size: 10 } },
        grid: { color: css("--border") },
        border: { display: false },
      },
    },
  };
}

function withLegend(options = baseOptions()) {
  return {
    ...options,
    plugins: {
      ...options.plugins,
      legend: {
        display: true,
        labels: {
          color: css("--text-soft"),
          boxWidth: 9,
          boxHeight: 9,
          usePointStyle: true,
          pointStyle: "rectRounded",
          padding: 18,
          font: { family: "Inter", size: 10 },
        },
      },
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

  for (let index = 0; index < points; index++) {
    const bucketStart = new Date(start);
    bucketStart.setDate(start.getDate() + index * bucketDays);
    const bucketEnd = new Date(bucketStart);
    bucketEnd.setDate(bucketStart.getDate() + bucketDays - 1);
    labels.push(Number(days) === 7
      ? new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(bucketStart).replace(".", "")
      : `${bucketStart.getDate()}/${bucketStart.getMonth() + 1}`);
    demands.forEach(item => {
      const opened = new Date(`${item.start_date}T12:00:00`);
      if (opened >= bucketStart && opened <= new Date(`${dateKey(bucketEnd)}T23:59:59`)) received[index]++;
      if (item.completed_at) {
        const done = new Date(item.completed_at);
        if (done >= bucketStart && done <= new Date(`${dateKey(bucketEnd)}T23:59:59`)) completed[index]++;
      }
    });
  }

  create("flowChart", {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Recebidas",
          data: received,
          borderColor: css("--primary"),
          backgroundColor: `${css("--primary")}26`,
          fill: true,
          tension: .42,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2.5,
        },
        {
          label: "Concluídas",
          data: completed,
          borderColor: "#2bbf88",
          backgroundColor: "transparent",
          tension: .42,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2.5,
          borderDash: [6, 5],
        },
      ],
    },
    options: withLegend(baseOptions()),
  });

  const statuses = Object.keys(STATUS_COLORS);
  const values = statuses.map(status => demands.filter(item => effectiveStatus(item) === status).length);
  create("statusChart", {
    type: "doughnut",
    data: {
      labels: statuses,
      datasets: [{
        data: values,
        backgroundColor: statuses.map(item => STATUS_COLORS[item]),
        borderColor: css("--surface"),
        borderWidth: 5,
        hoverOffset: 7,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      animation: { duration: 520 },
      plugins: { legend: { display: false }, tooltip: tooltipOptions() },
    },
  });
  document.getElementById("donutTotal").textContent = demands.length;
  document.getElementById("statusLegend").innerHTML = statuses.map((status, index) => `<span><i style="background:${STATUS_COLORS[status]}"></i>${status} · ${values[index]}</span>`).join("");
}

function managerName(item) {
  return item.manager?.trim() || "Gestor não informado";
}

function renderDemandAnalysis() {
  const demands = state.demands;
  const managers = [...new Set(demands.map(managerName))]
    .sort((a, b) => demands.filter(item => managerName(item) === b).length - demands.filter(item => managerName(item) === a).length)
    .slice(0, 12);
  const categories = [...new Set(demands.map(item => item.category).filter(Boolean))]
    .sort((a, b) => demands.filter(item => item.category === b).length - demands.filter(item => item.category === a).length)
    .slice(0, 12);

  create("managerChart", {
    type: "bar",
    data: {
      labels: managers,
      datasets: [{
        label: "Demandas",
        data: managers.map(name => demands.filter(item => managerName(item) === name).length),
        backgroundColor: css("--primary"),
        borderColor: css("--primary-hover"),
        borderWidth: 1,
        borderRadius: 12,
        borderSkipped: false,
        maxBarThickness: 62,
      }],
    },
    options: baseOptions(),
  });

  create("categoryChart", {
    type: "bar",
    data: {
      labels: categories,
      datasets: [{
        label: "Demandas",
        data: categories.map(name => demands.filter(item => item.category === name).length),
        backgroundColor: css("--accent"),
        borderColor: css("--accent-hover"),
        borderWidth: 1,
        borderRadius: 10,
        borderSkipped: false,
        maxBarThickness: 46,
      }],
    },
    options: { ...baseOptions(), indexAxis: "y" },
  });

  create("hoursChart", {
    type: "bar",
    data: {
      labels: managers,
      datasets: [
        {
          label: "Estimadas",
          data: managers.map(name => demands.filter(item => managerName(item) === name).reduce((total, item) => total + Number(item.estimated_hours || 0), 0)),
          backgroundColor: css("--primary"),
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 48,
        },
        {
          label: "Realizadas",
          data: managers.map(name => demands.filter(item => managerName(item) === name).reduce((total, item) => total + Number(item.actual_hours || 0), 0)),
          backgroundColor: css("--accent"),
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 48,
        },
      ],
    },
    options: withLegend(baseOptions()),
  });

  const priorities = ["Baixa", "Normal", "Alta", "Urgente"];
  create("priorityChart", {
    type: "bar",
    data: {
      labels: priorities,
      datasets: [
        {
          label: "Abertas",
          data: priorities.map(priority => demands.filter(item => item.priority === priority && !["Concluída", "Cancelada"].includes(effectiveStatus(item))).length),
          backgroundColor: css("--accent"),
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 60,
        },
        {
          label: "Concluídas",
          data: priorities.map(priority => demands.filter(item => item.priority === priority && effectiveStatus(item) === "Concluída").length),
          backgroundColor: "#2bbf88",
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 60,
        },
      ],
    },
    options: withLegend(baseOptions()),
  });
}

function renderConverterAnalysis() {
  const records = state.converters;
  const months = [];
  const now = new Date();
  for (let offset = 5; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", ""),
    });
  }
  create("converterMonthlyChart", {
    type: "line",
    data: {
      labels: months.map(item => item.label),
      datasets: [{
        label: "Conversores trocados",
        data: months.map(month => records.filter(item => item.service_date?.startsWith(month.key)).reduce((total, item) => total + Number(item.quantity_replaced || 0), 0)),
        borderColor: css("--accent"),
        backgroundColor: `${css("--accent")}24`,
        fill: true,
        tension: .42,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2.5,
      }],
    },
    options: baseOptions(),
  });

  const locations = Object.entries(records.reduce((map, item) => {
    map[item.location_name] = (map[item.location_name] || 0) + 1;
    return map;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10);
  create("converterLocationChart", {
    type: "bar",
    data: {
      labels: locations.map(item => item[0]),
      datasets: [{
        label: "Ocorrências",
        data: locations.map(item => item[1]),
        backgroundColor: css("--primary"),
        borderRadius: 10,
        borderSkipped: false,
        maxBarThickness: 46,
      }],
    },
    options: { ...baseOptions(), indexAxis: "y" },
  });
}

export function renderAnalysisCharts() {
  renderDemandAnalysis();
  renderConverterAnalysis();
}

export function redrawCharts(days = 30) {
  renderDashboardCharts(days);
  renderAnalysisCharts();
}
