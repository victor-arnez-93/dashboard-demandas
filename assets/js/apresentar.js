import { log } from "./logger.js";
import { requireSession } from "./supabase-client.js";
import { initializeStore, state, effectiveStatus } from "./store.js";
import { applyTheme, escapeHtml } from "./ui.js";
import {
  createChart,
  destroyChart,
  chartColors,
  baseOptions,
  doughnutOptions,
  intervalFor,
  inputDate,
  dateInInterval,
  filterDemandsByStart,
  dailyFlow,
  statusDistribution,
  managerSeries,
  countBy,
} from "./charts.js";

let period = "quarter";
let slide = 0;
let autoTimer = null;

const filters = {
  manager: "",
  location: "",
};

const presentationValueLabels = {
  id: "presentationValueLabels",
  afterDatasetsDraw(chart, _args, options) {
    if (options?.display === false) return;

    const colors = chartColors();
    const horizontal = chart.options.indexAxis === "y";
    const suffix = options?.suffix || "";
    const prefix = options?.prefix || "";
    const { ctx, chartArea } = chart;

    ctx.save();
    ctx.fillStyle = colors.text;
    ctx.font = '700 10px "Inter", sans-serif';
    ctx.textBaseline = "middle";

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);

      meta.data.forEach((element, index) => {
        const numericValue = Number(dataset.data[index] || 0);
        if (!Number.isFinite(numericValue) || numericValue === 0) return;

        const label = `${prefix}${formatNumber(numericValue)}${suffix}`;

        if (horizontal) {
          const desiredX = element.x + 7;
          const rightLimit = chartArea.right - 2;
          const outside = desiredX + ctx.measureText(label).width <= rightLimit;

          ctx.textAlign = outside ? "left" : "right";
          ctx.fillText(label, outside ? desiredX : element.x - 7, element.y);
          return;
        }

        ctx.textAlign = "center";
        ctx.fillText(label, element.x, Math.max(chartArea.top + 8, element.y - 10));
      });
    });

    ctx.restore();
  },
};

function plural(value, singular, pluralForm) {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

function formatHours(value) {
  return `${formatNumber(value)}h`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR").format(value);
}

function labelForPeriod(range) {
  const names = {
    "7": "Últimos 7 dias",
    "30": "Últimos 30 dias",
    quarter: "Trimestre atual",
    year: `Ano de ${new Date().getFullYear()}`,
    custom: "Período personalizado",
  };

  return `${names[period]} · ${formatDate(range.start)} a ${formatDate(range.end)}`;
}

function selectedInterval() {
  const startInput = document.getElementById("presentationStartDate");
  const endInput = document.getElementById("presentationEndDate");
  const status = document.getElementById("customPeriodStatus");
  const range = intervalFor(period, startInput.value, endInput.value);

  status.textContent = "";

  if (range.start > range.end) {
    status.textContent = "A data inicial deve ser anterior ou igual à data final.";
    return null;
  }

  return range;
}

function normalized(value) {
  return String(value || "").trim();
}

function scopedDemands() {
  return state.demands.filter(item => {
    const manager = normalized(item.manager) || "Gestor não informado";
    const location = normalized(item.location_name) || "Polo não informado";

    return (
      (!filters.manager || manager === filters.manager) &&
      (!filters.location || location === filters.location)
    );
  });
}

function scopedConverters() {
  return state.converters.filter(item => {
    const manager = normalized(item.manager_name) || "Gestor não informado";
    const location = normalized(item.location_name) || "Polo não informado";

    return (
      (!filters.manager || manager === filters.manager) &&
      (!filters.location || location === filters.location)
    );
  });
}

function completedInInterval(demands, range) {
  return demands.filter(item => (
    item.completed_at && dateInInterval(item.completed_at, range)
  ));
}

function uniqueValues(values) {
  return [...new Set(values.map(normalized).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function fillSelect(select, values, emptyLabel) {
  select.innerHTML = [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...values.map(value => (
      `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
    )),
  ].join("");
}

function populateFilters() {
  const managers = uniqueValues([
    ...state.demands.map(item => normalized(item.manager) || "Gestor não informado"),
    ...state.converters.map(item => normalized(item.manager_name) || "Gestor não informado"),
  ]);

  const locations = uniqueValues([
    ...state.demands.map(item => normalized(item.location_name) || "Polo não informado"),
    ...state.converters.map(item => normalized(item.location_name) || "Polo não informado"),
  ]);

  fillSelect(
    document.getElementById("presentationManagerFilter"),
    managers,
    "Todos os gestores",
  );

  fillSelect(
    document.getElementById("presentationLocationFilter"),
    locations,
    "Todos os polos",
  );
}

function updateFilterStatus() {
  const labels = [];

  if (filters.manager) labels.push(`Gestor: ${filters.manager}`);
  if (filters.location) labels.push(`Polo: ${filters.location}`);

  const count = labels.length;
  const counter = document.getElementById("activeFilterCount");

  counter.textContent = count;
  counter.hidden = count === 0;
  document.getElementById("filterButton").classList.toggle("active", count > 0);
  document.getElementById("presentationFilterStatus").textContent = count
    ? labels.join(" · ")
    : "Exibindo todos os registros.";
}

function setFilterPanel(open) {
  const panel = document.getElementById("presentationFilters");
  const button = document.getElementById("filterButton");

  panel.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
}

function applyFiltersFromControls() {
  filters.manager = document.getElementById("presentationManagerFilter").value;
  filters.location = document.getElementById("presentationLocationFilter").value;

  updateFilterStatus();
  renderAll();
}

function clearFilters() {
  filters.manager = "";
  filters.location = "";

  document.getElementById("presentationManagerFilter").value = "";
  document.getElementById("presentationLocationFilter").value = "";

  updateFilterStatus();
  renderAll();
}

function showChart(id, config, hasData, emptyMessage) {
  const canvas = document.getElementById(id);
  const container = canvas?.parentElement;

  if (!canvas || !container) return;

  container.querySelector(".presentation-chart-empty")?.remove();

  if (hasData) {
    canvas.hidden = false;
    createChart(id, config);
    return;
  }

  destroyChart(id);
  canvas.hidden = true;

  const empty = document.createElement("div");
  empty.className = "presentation-chart-empty";
  empty.innerHTML = `
    <i class="fa-regular fa-chart-bar"></i>
    <strong>Sem dados no período</strong>
    <span>${escapeHtml(emptyMessage)}</span>
  `;
  container.appendChild(empty);
}

function trendForConverters(records, range) {
  const dayMilliseconds = 86400000;
  const days = Math.ceil((range.end - range.start) / dayMilliseconds) + 1;

  if (days <= 62) {
    const labels = [];
    const values = [];
    const cursor = new Date(range.start);

    while (cursor <= range.end && labels.length < 62) {
      const key = inputDate(cursor);

      labels.push(
        new Intl.DateTimeFormat("pt-BR", {
          day: "2-digit",
          month: "short",
        }).format(cursor).replaceAll(".", ""),
      );

      values.push(
        records
          .filter(item => item.service_date === key)
          .reduce((total, item) => (
            total + Number(item.quantity_replaced || 0)
          ), 0),
      );

      cursor.setDate(cursor.getDate() + 1);
    }

    return { labels, values };
  }

  const months = [];
  const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
  const end = new Date(range.end.getFullYear(), range.end.getMonth(), 1);

  while (cursor <= end && months.length < 24) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return {
    labels: months.map(date => (
      new Intl.DateTimeFormat("pt-BR", {
        month: "short",
        year: months.length > 12 ? "2-digit" : undefined,
      }).format(date).replaceAll(".", "")
    )),
    values: months.map(month => (
      records
        .filter(item => {
          const date = new Date(`${item.service_date}T12:00:00`);

          return (
            date.getMonth() === month.getMonth() &&
            date.getFullYear() === month.getFullYear()
          );
        })
        .reduce((total, item) => (
          total + Number(item.quantity_replaced || 0)
        ), 0)
    )),
  };
}

function renderSummary(range, demands, received, completed) {
  const colors = chartColors();
  const progress = received.filter(item => (
    effectiveStatus(item) === "Em andamento"
  )).length;
  const overdue = received.filter(item => (
    effectiveStatus(item) === "Atrasada"
  )).length;
  const estimated = received.reduce((total, item) => (
    total + Number(item.estimated_hours || 0)
  ), 0);
  const actual = received.reduce((total, item) => (
    total + Number(item.actual_hours || 0)
  ), 0);
  const balance = received.length - completed.length;
  const hoursRate = estimated
    ? Math.round((actual / estimated) * 100)
    : actual
      ? 100
      : 0;

  document.getElementById("pReceived").textContent = received.length;
  document.getElementById("pCompleted").textContent = completed.length;
  document.getElementById("pProgress").textContent = progress;
  document.getElementById("pOverdue").textContent = overdue;
  document.getElementById("pHoursRate").textContent = `${hoursRate}%`;
  document.getElementById("pHoursDetail").textContent = (
    `${formatHours(actual)} de ${formatHours(estimated)} estimadas`
  );
  document.getElementById("periodLabel").textContent = labelForPeriod(range);

  const balanceElement = document.getElementById("pBalance");
  const balanceDetail = document.getElementById("pBalanceDetail");

  balanceElement.textContent = balance > 0
    ? `+${balance}`
    : balance < 0
      ? `−${Math.abs(balance)}`
      : "0";

  balanceElement.dataset.tone = balance < 0
    ? "good"
    : balance > 0
      ? "attention"
      : "neutral";

  balanceDetail.textContent = balance < 0
    ? `${plural(Math.abs(balance), "demanda reduzida", "demandas reduzidas")}`
    : balance > 0
      ? `${plural(balance, "demanda adicionada", "demandas adicionadas")}`
      : "Estoque estável";

  let insight = "Sem registros suficientes para destacar tendências neste período.";

  if (overdue > 0) {
    insight = `${plural(overdue, "demanda está atrasada", "demandas estão atrasadas")}; prioridade para revisão de prazo e próximos passos.`;
  } else if (hoursRate > 100) {
    insight = `As horas realizadas estão ${hoursRate - 100}% acima da estimativa nas demandas recebidas no período.`;
  } else if (completed.length > received.length) {
    insight = `A equipe concluiu ${plural(completed.length - received.length, "demanda a mais", "demandas a mais")} do que recebeu, reduzindo o estoque anterior.`;
  } else if (received.length > 0) {
    insight = `${completed.length} de ${received.length} demandas recebidas foram concluídas no período.`;
  }

  document.getElementById("pInsight").textContent = insight;
  document.getElementById("pFlowSummary").textContent = (
    `${received.length} recebidas · ${completed.length} concluídas`
  );
  document.getElementById("pStatusSummary").textContent = (
    plural(received.length, "demanda recebida", "demandas recebidas")
  );

  const flow = dailyFlow(demands, range);
  const pointRadius = flow.labels.length <= 16 ? 3 : 0;
  const flowOptions = baseOptions();

  flowOptions.interaction = {
    mode: "nearest",
    intersect: false,
  };

  showChart("pFlowChart", {
    type: "line",
    data: {
      labels: flow.labels,
      datasets: [
        {
          label: "Recebidas",
          data: flow.received,
          borderColor: colors.primary,
          backgroundColor: `${colors.primary}22`,
          fill: true,
          tension: 0.34,
          pointRadius,
          pointHoverRadius: 5,
          borderWidth: 2.5,
        },
        {
          label: "Concluídas",
          data: flow.completed,
          borderColor: colors.success,
          backgroundColor: `${colors.success}16`,
          fill: false,
          tension: 0.34,
          pointRadius,
          pointHoverRadius: 5,
          borderWidth: 2.5,
        },
      ],
    },
    options: flowOptions,
  }, received.length > 0 || completed.length > 0, (
    "Nenhuma demanda foi recebida ou concluída neste recorte."
  ));

  const status = statusDistribution(received);
  const statusColors = [
    colors.sand,
    colors.accent,
    colors.info,
    colors.success,
    colors.danger,
    colors.muted,
  ];
  const visibleStatus = status.labels
    .map((label, index) => ({
      label,
      value: status.values[index],
      color: statusColors[index],
    }))
    .filter(item => item.value > 0);

  showChart("pStatusChart", {
    type: "doughnut",
    data: {
      labels: visibleStatus.map(item => item.label),
      datasets: [{
        data: visibleStatus.map(item => item.value),
        backgroundColor: visibleStatus.map(item => item.color),
        borderColor: colors.surface,
        borderWidth: 3,
        hoverOffset: 5,
      }],
    },
    options: doughnutOptions(),
  }, visibleStatus.length > 0, (
    "Nenhuma demanda recebida para distribuir por status."
  ));
}

function managerChartHeight(managerCount) {
  return Math.max(230, Math.min(310, managerCount * 46 + 68));
}

function renderManagers(received) {
  const colors = chartColors();
  const managers = managerSeries(received);
  const estimated = managers.estimated.reduce((total, value) => total + value, 0);
  const actual = managers.actual.reduce((total, value) => total + value, 0);
  const height = managerChartHeight(managers.labels.length);

  document.getElementById("pManagersChartContainer").style.height = `${height}px`;
  document.getElementById("pHoursChartContainer").style.height = `${height}px`;
  document.getElementById("pManagerHeadline").textContent = (
    `${plural(managers.labels.length, "gestor", "gestores")} · ${plural(received.length, "demanda", "demandas")}`
  );
  document.getElementById("pManagersSummary").textContent = (
    plural(received.length, "demanda", "demandas")
  );
  document.getElementById("pHoursSummary").textContent = (
    `${formatHours(actual)} realizadas de ${formatHours(estimated)}`
  );

  const managerOptions = baseOptions({
    horizontal: true,
    legend: false,
  });

  managerOptions.layout = { padding: { right: 30 } };
  managerOptions.plugins.presentationValueLabels = { display: true };

  showChart("pManagersChart", {
    type: "bar",
    data: {
      labels: managers.labels,
      datasets: [{
        label: "Demandas",
        data: managers.counts,
        backgroundColor: `${colors.primary}e5`,
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 42,
      }],
    },
    options: managerOptions,
    plugins: [presentationValueLabels],
  }, managers.labels.length > 0, (
    "Nenhum gestor possui demandas no período e nos filtros selecionados."
  ));

  const hoursOptions = baseOptions({ horizontal: true });

  hoursOptions.layout = { padding: { right: 34 } };
  hoursOptions.plugins.presentationValueLabels = {
    display: true,
    suffix: "h",
  };

  showChart("pHoursChart", {
    type: "bar",
    data: {
      labels: managers.labels,
      datasets: [
        {
          label: "Estimadas",
          data: managers.estimated,
          backgroundColor: `${colors.primary}e5`,
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 34,
        },
        {
          label: "Realizadas",
          data: managers.actual,
          backgroundColor: `${colors.accent}e5`,
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 34,
        },
      ],
    },
    options: hoursOptions,
    plugins: [presentationValueLabels],
  }, managers.labels.length > 0 && (estimated > 0 || actual > 0), (
    "As demandas deste recorte ainda não possuem horas registradas."
  ));

  document.getElementById("pManagerRanking").innerHTML = (
    managers.labels
      .slice(0, 3)
      .map((label, index) => `
        <article>
          <small>${index + 1}º EM VOLUME</small>
          <strong title="${escapeHtml(label)}">${escapeHtml(label)}</strong>
          <span>${managers.map[label].count} demandas · ${managers.map[label].done} concluídas</span>
        </article>
      `)
      .join("") || `
        <article class="presentation-ranking-empty">
          <small>SEM DADOS</small>
          <strong>—</strong>
          <span>Nenhum gestor no período</span>
        </article>
      `
  );
}

function renderConverters(range, converters) {
  const colors = chartColors();
  const records = converters.filter(item => (
    dateInInterval(item.service_date, range)
  ));
  const quantity = records.reduce((total, item) => (
    total + Number(item.quantity_replaced || 0)
  ), 0);
  const locations = Object.entries(
    countBy(
      records,
      item => normalized(item.location_name) || "Polo não informado",
    ),
  ).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  const done = records.filter(item => item.status === "Concluído").length;
  const doneRate = Math.round((done / Math.max(records.length, 1)) * 100);
  const topLocation = locations[0];

  document.getElementById("pConverterRecords").textContent = records.length;
  document.getElementById("pConverterQuantity").textContent = quantity;
  document.getElementById("pConverterLocation").textContent = topLocation?.[0] || "—";
  document.getElementById("pConverterLocation").title = topLocation?.[0] || "";
  document.getElementById("pConverterLocationDetail").textContent = topLocation
    ? plural(topLocation[1], "ocorrência", "ocorrências")
    : "sem ocorrências";
  document.getElementById("pConverterDoneRate").textContent = `${doneRate}%`;
  document.getElementById("pConverterDoneDetail").textContent = (
    `${done} de ${records.length} atendimentos`
  );
  document.getElementById("pConverterHeadline").textContent = (
    `${plural(quantity, "equipamento registrado", "equipamentos registrados")} · ${plural(records.length, "atendimento", "atendimentos")}`
  );
  document.getElementById("pConverterTrendSummary").textContent = (
    plural(quantity, "equipamento", "equipamentos")
  );
  document.getElementById("pConverterLocationSummary").textContent = (
    plural(locations.length, "polo", "polos")
  );

  const trend = trendForConverters(records, range);
  const trendOptions = baseOptions({ legend: false });
  const pointRadius = trend.labels.length <= 16 ? 3 : 0;

  trendOptions.interaction = {
    mode: "nearest",
    intersect: false,
  };

  showChart("pConverterTrendChart", {
    type: "line",
    data: {
      labels: trend.labels,
      datasets: [{
        label: "Equipamentos registrados",
        data: trend.values,
        borderColor: colors.accent,
        backgroundColor: `${colors.accent}22`,
        fill: true,
        tension: 0.34,
        pointRadius,
        pointHoverRadius: 5,
        borderWidth: 2.5,
      }],
    },
    options: trendOptions,
  }, quantity > 0, (
    "Nenhum equipamento foi registrado neste recorte."
  ));

  const locationOptions = baseOptions({
    horizontal: true,
    legend: false,
  });

  locationOptions.layout = { padding: { right: 30 } };
  locationOptions.plugins.presentationValueLabels = { display: true };

  showChart("pConverterLocationChart", {
    type: "bar",
    data: {
      labels: locations.map(([label]) => label),
      datasets: [{
        label: "Ocorrências",
        data: locations.map(([, value]) => value),
        backgroundColor: `${colors.primary}e5`,
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 40,
      }],
    },
    options: locationOptions,
    plugins: [presentationValueLabels],
  }, locations.length > 0, (
    "Nenhum polo possui atendimentos neste período."
  ));
}

function renderAll() {
  const range = selectedInterval();
  if (!range) return;

  const demands = scopedDemands();
  const converters = scopedConverters();
  const received = filterDemandsByStart(demands, range);
  const completed = completedInInterval(demands, range);

  renderSummary(range, demands, received, completed);
  renderManagers(received);
  renderConverters(range, converters);

  requestAnimationFrame(resizeVisibleCharts);
}

function resizeVisibleCharts() {
  const activeSlide = document.querySelector(`[data-slide="${slide}"]`);

  activeSlide?.querySelectorAll("canvas").forEach(canvas => {
    window.Chart?.getChart(canvas)?.resize();
  });
}

function showSlide(index) {
  slide = (index + 3) % 3;

  document.querySelectorAll("[data-slide]").forEach(item => {
    item.hidden = Number(item.dataset.slide) !== slide;
  });

  document.querySelectorAll("[data-go-slide]").forEach(item => {
    const active = Number(item.dataset.goSlide) === slide;

    item.classList.toggle("active", active);
    item.setAttribute("aria-current", active ? "true" : "false");
  });

  requestAnimationFrame(resizeVisibleCharts);
}

function setAuto(enabled) {
  const button = document.getElementById("autoButton");

  if (autoTimer) clearInterval(autoTimer);

  autoTimer = enabled
    ? setInterval(() => showSlide(slide + 1), 10000)
    : null;

  button.setAttribute("aria-pressed", String(enabled));
  button.innerHTML = enabled
    ? `<i class="fa-solid fa-pause"></i><span>Pausar</span>`
    : `<i class="fa-solid fa-play"></i><span>Automático</span>`;
}

function updateFullscreenButton() {
  const button = document.getElementById("fullscreenButton");
  const active = Boolean(document.fullscreenElement);

  button.innerHTML = active
    ? `<i class="fa-solid fa-compress"></i><span>Sair da tela cheia</span>`
    : `<i class="fa-solid fa-expand"></i><span>Tela cheia</span>`;
  button.setAttribute("aria-pressed", String(active));
}

function isTypingTarget(target) {
  return target instanceof HTMLElement && target.matches(
    "input, select, textarea, button, a",
  );
}

async function boot() {
  try {
    log.boot();

    const session = await requireSession();
    if (!session) return;

    await initializeStore(session);
    applyTheme(state.profile.theme);

    const today = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 29);

    document.getElementById("presentationStartDate").value = inputDate(start);
    document.getElementById("presentationEndDate").value = inputDate(today);

    populateFilters();
    updateFilterStatus();

    document.getElementById("presentationShell").hidden = false;
    document.getElementById("bootScreen").hidden = true;

    document
      .querySelectorAll("[data-presentation-period]")
      .forEach(button => {
        button.addEventListener("click", () => {
          period = button.dataset.presentationPeriod;

          document
            .querySelectorAll("[data-presentation-period]")
            .forEach(item => {
              const active = item === button;

              item.classList.toggle("active", active);
              item.setAttribute("aria-pressed", String(active));
            });

          const customPanel = document.getElementById("presentationCustom");
          customPanel.hidden = period !== "custom";

          if (period === "custom") {
            document.getElementById("presentationStartDate").focus();
            return;
          }

          renderAll();
        });
      });

    document.getElementById("applyCustomPeriod").addEventListener("click", renderAll);

    document.getElementById("filterButton").addEventListener("click", event => {
      const open = event.currentTarget.getAttribute("aria-expanded") !== "true";
      setFilterPanel(open);
    });

    document.getElementById("closePresentationFilters").addEventListener("click", () => {
      applyFiltersFromControls();
      setFilterPanel(false);
    });

    document.getElementById("clearPresentationFilters").addEventListener("click", clearFilters);
    document.getElementById("presentationManagerFilter").addEventListener("change", applyFiltersFromControls);
    document.getElementById("presentationLocationFilter").addEventListener("change", applyFiltersFromControls);
    document.getElementById("prevSlide").addEventListener("click", () => showSlide(slide - 1));
    document.getElementById("nextSlide").addEventListener("click", () => showSlide(slide + 1));

    document.querySelectorAll("[data-go-slide]").forEach(button => {
      button.addEventListener("click", () => {
        showSlide(Number(button.dataset.goSlide));
      });
    });

    document.getElementById("autoButton").addEventListener("click", event => {
      setAuto(event.currentTarget.getAttribute("aria-pressed") !== "true");
    });

    document.getElementById("fullscreenButton").addEventListener("click", async () => {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
        return;
      }

      await document.exitFullscreen?.();
    });

    document.addEventListener("fullscreenchange", () => {
      updateFullscreenButton();
      requestAnimationFrame(resizeVisibleCharts);
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !document.getElementById("presentationFilters").hidden) {
        setFilterPanel(false);
        return;
      }

      if (isTypingTarget(event.target)) return;

      if (event.key === "ArrowRight") showSlide(slide + 1);
      if (event.key === "ArrowLeft") showSlide(slide - 1);
    });

    window.addEventListener("fluux:themechange", renderAll);
    window.addEventListener("resize", resizeVisibleCharts);

    updateFullscreenButton();
    showSlide(0);
    renderAll();
  } catch (error) {
    log.error("APRESENTAÇÃO", "Falha ao iniciar.", error);

    document.getElementById("bootScreen").hidden = true;
    document.getElementById("fatalMessage").textContent = (
      error.message || "Confira a configuração e tente novamente."
    );
    document.getElementById("fatalLayer").hidden = false;
  }
}

boot();
