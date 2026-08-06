import { bootPage } from "./shell.js";
import { state, effectiveStatus } from "./store.js";
import {
  createChart,
  chartColors,
  safeCanvasColor,
  intervalFor,
  filterDemandsByStart,
  monthlyConverters,
  dateInInterval,
} from "./charts.js";

let period = "30";

const periodLabels = {
  30: "Exibindo os últimos 30 dias.",
  90: "Exibindo os últimos 90 dias.",
  365: "Exibindo o ano corrente.",
  all: "Exibindo todo o histórico disponível.",
};

function safeText(value, fallback = "Não informado") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function numeric(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function plural(value, singular, pluralForm) {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

function formatHours(value) {
  return `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(numeric(value))}h`;
}

function sortedEntries(map) {
  return Object.entries(map).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")
  );
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function hexToRgba(color, alpha, fallback = "#284b63") {
  const normalized = safeCanvasColor(color, fallback);

  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    const red = parseInt(normalized.slice(1, 3), 16);
    const green = parseInt(normalized.slice(3, 5), 16);
    const blue = parseInt(normalized.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    const red = parseInt(normalized[1] + normalized[1], 16);
    const green = parseInt(normalized[2] + normalized[2], 16);
    const blue = parseInt(normalized[3] + normalized[3], 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  return normalized;
}

function verticalGradient(context, startColor, endColor) {
  const { chart } = context;
  const { ctx, chartArea } = chart;
  const safeStart = safeCanvasColor(startColor, "#284b63");
  const safeEnd = safeCanvasColor(endColor, "rgba(40, 75, 99, 0.42)");

  if (!chartArea) return safeStart;

  const gradient = ctx.createLinearGradient(
    0,
    chartArea.bottom,
    0,
    chartArea.top
  );

  gradient.addColorStop(0, safeEnd);
  gradient.addColorStop(1, safeStart);

  return gradient;
}

function horizontalGradient(context, startColor, endColor) {
  const { chart } = context;
  const { ctx, chartArea } = chart;
  const safeStart = safeCanvasColor(startColor, "#284b63");
  const safeEnd = safeCanvasColor(endColor, "rgba(40, 75, 99, 0.42)");

  if (!chartArea) return safeStart;

  const gradient = ctx.createLinearGradient(
    chartArea.left,
    0,
    chartArea.right,
    0
  );

  gradient.addColorStop(0, safeStart);
  gradient.addColorStop(1, safeEnd);

  return gradient;
}

function buildManagerSeries(demands) {
  const map = new Map();

  demands.forEach(item => {
    const manager = safeText(item.manager, "Gestor não informado");

    if (!map.has(manager)) {
      map.set(manager, {
        count: 0,
        estimated: 0,
        actual: 0,
      });
    }

    const record = map.get(manager);
    record.count += 1;
    record.estimated += numeric(item.estimated_hours);
    record.actual += numeric(item.actual_hours);
  });

  const entries = [...map.entries()].sort(
    (a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0], "pt-BR")
  );

  return {
    labels: entries.map(([label]) => label),
    counts: entries.map(([, values]) => values.count),
    estimated: entries.map(([, values]) => Number(values.estimated.toFixed(2))),
    actual: entries.map(([, values]) => Number(values.actual.toFixed(2))),
  };
}

function buildCountSeries(items, getter) {
  const map = {};

  items.forEach(item => {
    const key = safeText(getter(item));
    map[key] = (map[key] || 0) + 1;
  });

  const entries = sortedEntries(map);

  return {
    labels: entries.map(([label]) => label),
    values: entries.map(([, value]) => value),
  };
}

const emptyStatePlugin = {
  id: "fluuxEmptyState",
  afterDraw(chart, _args, options) {
    const values = chart.data.datasets.flatMap(dataset => dataset.data || []);
    const hasValues = values.some(value => numeric(value) > 0);

    if (hasValues) return;

    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = options?.color || chartColors().muted;
    ctx.font = "600 12px Inter";
    ctx.fillText(
      options?.text || "Sem dados no período",
      (chartArea.left + chartArea.right) / 2,
      (chartArea.top + chartArea.bottom) / 2
    );
    ctx.restore();
  },
};

const valueLabelsPlugin = {
  id: "fluuxValueLabels",
  afterDatasetsDraw(chart, _args, options) {
    if (options?.display === false) return;

    const { ctx, chartArea } = chart;
    const horizontal = chart.options.indexAxis === "y";

    ctx.save();
    ctx.font = "700 10px Inter";
    ctx.textBaseline = "middle";

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;

      meta.data.forEach((element, index) => {
        const value = numeric(dataset.data[index]);
        if (value <= 0) return;

        const position = element.tooltipPosition();
        const suffix = dataset.valueSuffix || "";
        const text = `${new Intl.NumberFormat("pt-BR", {
          maximumFractionDigits: 2,
        }).format(value)}${suffix}`;

        ctx.fillStyle = options?.color || chartColors().text;

        if (horizontal) {
          const textWidth = ctx.measureText(text).width;
          const preferredX = position.x + 8;
          const fitsOutside = preferredX + textWidth <= chartArea.right;

          ctx.textAlign = fitsOutside ? "left" : "right";
          ctx.fillText(
            text,
            fitsOutside ? preferredX : Math.max(chartArea.left + textWidth, position.x - 7),
            position.y
          );
        } else {
          ctx.textAlign = "center";
          ctx.fillText(
            text,
            position.x,
            Math.max(chartArea.top + 8, position.y - 11)
          );
        }
      });
    });

    ctx.restore();
  },
};

function modernOptions({
  horizontal = false,
  legend = false,
  stacked = false,
  hours = false,
} = {}) {
  const colors = chartColors();

  const valueCallback = value => {
    if (hours) return formatHours(value);
    return Number.isInteger(Number(value)) ? value : numeric(value).toFixed(1);
  };

  const valueAxis = {
    stacked,
    beginAtZero: true,
    border: { display: false },
    grid: {
      color: hexToRgba(colors.border, 0.82),
      drawTicks: false,
      lineWidth: 1,
    },
    ticks: {
      color: colors.muted,
      padding: 10,
      precision: hours ? 1 : 0,
      font: {
        family: "Inter",
        size: 10,
        weight: "500",
      },
      callback: valueCallback,
    },
  };

  const categoryAxis = {
    stacked,
    border: { display: false },
    grid: { display: false },
    ticks: {
      color: colors.muted,
      padding: 10,
      autoSkip: false,
      maxRotation: 0,
      font: {
        family: "Inter",
        size: 10,
        weight: "600",
      },
    },
  };

  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? "y" : "x",
    interaction: {
      mode: "index",
      intersect: false,
    },
    layout: {
      padding: {
        top: 20,
        right: horizontal ? 28 : 10,
        bottom: 2,
        left: 2,
      },
    },
    animation: {
      duration: 680,
      easing: "easeOutQuart",
    },
    plugins: {
      legend: {
        display: legend,
        position: "top",
        align: "center",
        labels: {
          color: colors.muted,
          usePointStyle: true,
          pointStyle: "rectRounded",
          boxWidth: 9,
          boxHeight: 9,
          padding: 18,
          font: {
            family: "Inter",
            size: 10,
            weight: "600",
          },
        },
      },
      tooltip: {
        backgroundColor: colors.surface,
        titleColor: colors.text,
        bodyColor: colors.text,
        borderColor: colors.border,
        borderWidth: 1,
        padding: 12,
        cornerRadius: 12,
        displayColors: true,
        boxPadding: 5,
        titleFont: {
          family: "Inter",
          size: 11,
          weight: "700",
        },
        bodyFont: {
          family: "Inter",
          size: 11,
          weight: "500",
        },
        callbacks: {
          label(context) {
            const label = context.dataset.label ? `${context.dataset.label}: ` : "";
            const value = horizontal ? context.parsed.x : context.parsed.y;
            return `${label}${hours ? formatHours(value) : value}`;
          },
        },
      },
      fluuxEmptyState: {
        color: colors.muted,
        text: "Sem dados no período",
      },
      fluuxValueLabels: {
        color: colors.text,
        display: true,
      },
    },
    scales: horizontal
      ? {
          x: valueAxis,
          y: categoryAxis,
        }
      : {
          x: categoryAxis,
          y: valueAxis,
        },
  };
}

function lineOptions() {
  const options = modernOptions({ legend: false });

  options.interaction = {
    mode: "nearest",
    intersect: false,
  };

  options.plugins.fluuxValueLabels.display = false;

  return options;
}

function render() {
  const interval = intervalFor(period);
  const demands = filterDemandsByStart(state.demands, interval);
  const converters = state.converters.filter(item =>
    dateInInterval(item.service_date, interval)
  );

  const colors = chartColors();
  const managers = buildManagerSeries(demands);
  const demandLocations = buildCountSeries(
    demands,
    item => item.location_name,
  );

  setText(
    "analysisPeriodStatus",
    periodLabels[period] || periodLabels[30]
  );

  setText(
    "managerChartSummary",
    plural(managers.labels.length, "gestor", "gestores")
  );

  setText(
    "demandLocationChartSummary",
    plural(demandLocations.labels.length, "polo", "polos")
  );

  setText(
    "hoursChartSummary",
    `${formatHours(managers.actual.reduce((total, value) => total + value, 0))} realizadas`
  );

  setText(
    "priorityChartSummary",
    plural(demands.length, "demanda", "demandas")
  );

  createChart("managerChart", {
    type: "bar",
    data: {
      labels: managers.labels,
      datasets: [
        {
          label: "Demandas",
          data: managers.counts,
          backgroundColor: context =>
            verticalGradient(
              context,
              hexToRgba(colors.primary, 0.96),
              hexToRgba(colors.primary, 0.54)
            ),
          hoverBackgroundColor: colors.primary,
          borderColor: hexToRgba(colors.primary, 0.98),
          borderWidth: 1,
          borderRadius: 12,
          borderSkipped: false,
          maxBarThickness: 68,
          categoryPercentage: 0.68,
          barPercentage: 0.74,
        },
      ],
    },
    options: modernOptions(),
    plugins: [emptyStatePlugin, valueLabelsPlugin],
  });

  createChart("demandLocationChart", {
    type: "bar",
    data: {
      labels: demandLocations.labels,
      datasets: [
        {
          label: "Demandas",
          data: demandLocations.values,
          backgroundColor: context =>
            horizontalGradient(
              context,
              hexToRgba(colors.accent, 0.94),
              hexToRgba(colors.warning, 0.66)
            ),
          hoverBackgroundColor: colors.accent,
          borderColor: hexToRgba(colors.accent, 0.96),
          borderWidth: 1,
          borderRadius: 12,
          borderSkipped: false,
          maxBarThickness: 44,
          categoryPercentage: 0.70,
          barPercentage: 0.76,
        },
      ],
    },
    options: modernOptions({ horizontal: true }),
    plugins: [emptyStatePlugin, valueLabelsPlugin],
  });

  createChart("managerHoursChart", {
    type: "bar",
    data: {
      labels: managers.labels,
      datasets: [
        {
          label: "Estimadas",
          data: managers.estimated,
          valueSuffix: "h",
          backgroundColor: context =>
            verticalGradient(
              context,
              hexToRgba(colors.primary, 0.95),
              hexToRgba(colors.primary, 0.52)
            ),
          hoverBackgroundColor: colors.primary,
          borderRadius: 11,
          borderSkipped: false,
          maxBarThickness: 56,
          categoryPercentage: 0.66,
          barPercentage: 0.72,
        },
        {
          label: "Realizadas",
          data: managers.actual,
          valueSuffix: "h",
          backgroundColor: context =>
            verticalGradient(
              context,
              hexToRgba(colors.accent, 0.96),
              hexToRgba(colors.accent, 0.54)
            ),
          hoverBackgroundColor: colors.accent,
          borderRadius: 11,
          borderSkipped: false,
          maxBarThickness: 56,
          categoryPercentage: 0.66,
          barPercentage: 0.72,
        },
      ],
    },
    options: modernOptions({ legend: true, hours: true }),
    plugins: [emptyStatePlugin, valueLabelsPlugin],
  });

  const priorities = ["Baixa", "Normal", "Alta", "Urgente"];

  const open = priorities.map(priority =>
    demands.filter(
      item =>
        item.priority === priority &&
        effectiveStatus(item) !== "Concluída"
    ).length
  );

  const completed = priorities.map(priority =>
    demands.filter(
      item =>
        item.priority === priority &&
        effectiveStatus(item) === "Concluída"
    ).length
  );

  createChart("priorityChart", {
    type: "bar",
    data: {
      labels: priorities,
      datasets: [
        {
          label: "Abertas",
          data: open,
          backgroundColor: context =>
            verticalGradient(
              context,
              hexToRgba(colors.accent, 0.96),
              hexToRgba(colors.accent, 0.54)
            ),
          hoverBackgroundColor: colors.accent,
          borderRadius: 11,
          borderSkipped: false,
          maxBarThickness: 64,
          categoryPercentage: 0.68,
          barPercentage: 0.74,
        },
        {
          label: "Concluídas",
          data: completed,
          backgroundColor: context =>
            verticalGradient(
              context,
              hexToRgba(colors.success, 0.96),
              hexToRgba(colors.success, 0.52)
            ),
          hoverBackgroundColor: colors.success,
          borderRadius: 11,
          borderSkipped: false,
          maxBarThickness: 64,
          categoryPercentage: 0.68,
          barPercentage: 0.74,
        },
      ],
    },
    options: modernOptions({ legend: true }),
    plugins: [emptyStatePlugin, valueLabelsPlugin],
  });

  const converterTrend = monthlyConverters(converters, interval);
  const converterTotal = converters.reduce(
    (total, item) => total + numeric(item.quantity_replaced),
    0
  );

  setText(
    "converterTrendSummary",
    plural(converterTotal, "equipamento", "equipamentos")
  );

  createChart("converterTrendChart", {
    type: "line",
    data: {
      labels: converterTrend.labels,
      datasets: [
        {
          label: "Equipamentos registrados",
          data: converterTrend.values,
          borderColor: colors.accent,
          backgroundColor: context => {
            const { chart } = context;
            const { ctx, chartArea } = chart;

            if (!chartArea) return hexToRgba(colors.accent, 0.12);

            const gradient = ctx.createLinearGradient(
              0,
              chartArea.top,
              0,
              chartArea.bottom
            );

            gradient.addColorStop(
              0,
              safeCanvasColor(
                hexToRgba(colors.accent, 0.28, "#f96900"),
                "rgba(249, 105, 0, 0.28)",
              ),
            );
            gradient.addColorStop(
              1,
              safeCanvasColor(
                hexToRgba(colors.accent, 0.015, "#f96900"),
                "rgba(249, 105, 0, 0.015)",
              ),
            );

            return gradient;
          },
          fill: true,
          tension: 0.38,
          cubicInterpolationMode: "monotone",
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: colors.surface,
          pointBorderColor: colors.accent,
          pointBorderWidth: 2,
        },
      ],
    },
    options: lineOptions(),
    plugins: [emptyStatePlugin, valueLabelsPlugin],
  });

  const locations = buildCountSeries(
    converters,
    item => item.location_name
  );

  setText(
    "converterLocationSummary",
    plural(locations.labels.length, "polo", "polos")
  );

  createChart("converterLocationChart", {
    type: "bar",
    data: {
      labels: locations.labels,
      datasets: [
        {
          label: "Ocorrências",
          data: locations.values,
          backgroundColor: context =>
            horizontalGradient(
              context,
              hexToRgba(colors.primary, 0.94),
              hexToRgba(colors.info, 0.64)
            ),
          hoverBackgroundColor: colors.primary,
          borderColor: hexToRgba(colors.primary, 0.95),
          borderWidth: 1,
          borderRadius: 12,
          borderSkipped: false,
          maxBarThickness: 44,
          categoryPercentage: 0.70,
          barPercentage: 0.76,
        },
      ],
    },
    options: modernOptions({ horizontal: true }),
    plugins: [emptyStatePlugin, valueLabelsPlugin],
  });
}

bootPage(() => {
  document
    .querySelectorAll("[data-analysis-period]")
    .forEach(button => {
      button.addEventListener("click", () => {
        period = button.dataset.analysisPeriod;

        document
          .querySelectorAll("[data-analysis-period]")
          .forEach(item => {
            const active = item === button;
            item.classList.toggle("active", active);
            item.setAttribute("aria-pressed", String(active));
          });

        render();
      });
    });

  window.addEventListener("fluux:themechange", render);

  render();
});
