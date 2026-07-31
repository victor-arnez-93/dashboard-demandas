import { effectiveStatus } from "./store.js";

const instances = new Map();

export function css(variable) {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
}

export function destroyChart(id) {
  const instance = instances.get(id);
  if (instance) instance.destroy();
  instances.delete(id);
}

export function createChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas || !window.Chart) return null;
  destroyChart(id);
  const instance = new Chart(canvas, config);
  instances.set(id, instance);
  return instance;
}

export function chartColors() {
  return {
    primary: css("--primary"),
    accent: css("--accent"),
    success: css("--success"),
    danger: css("--danger"),
    sand: css("--sand"),
    info: css("--info"),
    text: css("--text"),
    muted: css("--text-muted"),
    border: css("--border"),
    surface: css("--surface-raised"),
  };
}

export function baseOptions({ horizontal = false, legend = true, stacked = false, percent = false } = {}) {
  const colors = chartColors();
  const indexAxis = horizontal ? "y" : "x";
  const axis = {
    stacked,
    beginAtZero: true,
    grid: { color: colors.border, drawBorder: false },
    border: { display: false },
    ticks: {
      color: colors.muted,
      font: { family: "Inter", size: 10 },
      precision: percent ? undefined : 0,
      callback: percent ? value => `${value}%` : undefined,
    },
  };
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis,
    interaction: { mode: "index", intersect: false },
    animation: { duration: 520, easing: "easeOutQuart" },
    plugins: {
      legend: {
        display: legend,
        labels: { color: colors.muted, usePointStyle: true, pointStyle: "rectRounded", boxWidth: 10, boxHeight: 10, font: { family: "Inter", size: 10 } },
      },
      tooltip: {
        backgroundColor: colors.surface,
        titleColor: colors.text,
        bodyColor: colors.text,
        borderColor: colors.border,
        borderWidth: 1,
        padding: 11,
        cornerRadius: 10,
      },
    },
    scales: horizontal ? { x: axis, y: { ...axis, grid: { display: false } } } : { x: { ...axis, grid: { display: false } }, y: axis },
  };
}

export function doughnutOptions() {
  const colors = chartColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "68%",
    animation: { duration: 520, easing: "easeOutQuart" },
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: colors.muted, usePointStyle: true, pointStyle: "circle", padding: 16, font: { family: "Inter", size: 10 } },
      },
      tooltip: {
        backgroundColor: colors.surface,
        titleColor: colors.text,
        bodyColor: colors.text,
        borderColor: colors.border,
        borderWidth: 1,
        padding: 11,
        cornerRadius: 10,
      },
    },
  };
}

export function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfDay(value) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function inputDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function intervalFor(period, customStart = "", customEnd = "") {
  const today = new Date();
  const end = endOfDay(today);
  let start;
  if (period === "custom") {
    start = startOfDay(new Date(`${customStart || inputDate(today)}T12:00:00`));
    return { start, end: endOfDay(new Date(`${customEnd || inputDate(today)}T12:00:00`)) };
  }
  if (period === "week") {
    start = startOfDay(today);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    return { start, end };
  }
  if (period === "month") return { start: new Date(today.getFullYear(), today.getMonth(), 1), end };
  if (period === "year") return { start: new Date(today.getFullYear(), 0, 1), end };
  if (period === "all") return { start: new Date(2000, 0, 1), end };
  const days = Math.max(1, Number(period || 30));
  start = startOfDay(today);
  start.setDate(start.getDate() - days + 1);
  return { start, end };
}

export function dateInInterval(value, interval) {
  if (!value) return false;
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  return date >= interval.start && date <= interval.end;
}

export function filterDemandsByStart(demands, interval) {
  return demands.filter(item => dateInInterval(item.start_date, interval));
}

export function countBy(items, getter) {
  return items.reduce((map, item) => {
    const key = getter(item) || "Não informado";
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
}

export function statusDistribution(demands) {
  const order = ["Pendente", "Em andamento", "Aguardando retorno", "Concluída", "Atrasada", "Cancelada"];
  const counts = countBy(demands, effectiveStatus);
  return { labels: order, values: order.map(label => counts[label] || 0) };
}

export function managerSeries(demands) {
  const map = {};
  demands.forEach(item => {
    const manager = item.manager?.trim() || "Gestor não informado";
    if (!map[manager]) map[manager] = { count: 0, estimated: 0, actual: 0, done: 0 };
    map[manager].count += 1;
    map[manager].estimated += Number(item.estimated_hours || 0);
    map[manager].actual += Number(item.actual_hours || 0);
    if (effectiveStatus(item) === "Concluída") map[manager].done += 1;
  });
  const labels = Object.keys(map).sort((a, b) => map[b].count - map[a].count || a.localeCompare(b, "pt-BR"));
  return {
    labels,
    counts: labels.map(label => map[label].count),
    estimated: labels.map(label => Number(map[label].estimated.toFixed(2))),
    actual: labels.map(label => Number(map[label].actual.toFixed(2))),
    done: labels.map(label => map[label].done),
    map,
  };
}

export function dailyFlow(demands, interval) {
  const days = [];
  const cursor = startOfDay(interval.start);
  while (cursor <= interval.end && days.length < 370) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  const labels = days.map(date => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: days.length > 14 ? "short" : undefined, weekday: days.length <= 10 ? "short" : undefined }).format(date).replaceAll(".", ""));
  const received = days.map(day => demands.filter(item => {
    const date = new Date(`${item.start_date}T12:00:00`);
    return date.toDateString() === day.toDateString();
  }).length);
  const completed = days.map(day => demands.filter(item => {
    if (!item.completed_at) return false;
    const date = new Date(item.completed_at);
    return date.toDateString() === day.toDateString();
  }).length);
  return { labels, received, completed };
}

export function monthlyConverters(records, interval) {
  const months = [];
  const cursor = new Date(interval.start.getFullYear(), interval.start.getMonth(), 1);
  const end = new Date(interval.end.getFullYear(), interval.end.getMonth(), 1);
  while (cursor <= end && months.length < 24) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const labels = months.map(date => new Intl.DateTimeFormat("pt-BR", { month: "short", year: months.length > 12 ? "2-digit" : undefined }).format(date).replaceAll(".", ""));
  const values = months.map(month => records.filter(item => {
    const date = new Date(`${item.service_date}T12:00:00`);
    return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
  }).reduce((total, item) => total + Number(item.quantity_replaced || 0), 0));
  return { labels, values };
}

window.addEventListener("fluux:themechange", () => {
  // Os scripts de página escutam este evento e redesenham seus gráficos.
});
