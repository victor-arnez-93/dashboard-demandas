import { bootPage } from "./shell.js";
import { state, effectiveStatus, demandCode } from "./store.js";
import { escapeHtml, formatDate, formatHours, statusClass, priorityClass, demandCell } from "./ui.js";
import { createChart, chartColors, baseOptions, doughnutOptions, intervalFor, filterDemandsByStart, dailyFlow, statusDistribution } from "./charts.js";

let activePeriod = "30";

function percent(value, total) {
  return total ? Math.round(value / total * 100) : 0;
}

function renderCharts(interval, periodDemands) {
  const colors = chartColors();
  const flow = dailyFlow(state.demands, interval);
  createChart("flowChart", {
    type: "line",
    data: {
      labels: flow.labels,
      datasets: [
        { label: "Recebidas", data: flow.received, borderColor: colors.primary, backgroundColor: `${colors.primary}22`, fill: true, tension: .38, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2.5 },
        { label: "Concluídas", data: flow.completed, borderColor: colors.success, backgroundColor: `${colors.success}14`, fill: false, tension: .38, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2.5 },
      ],
    },
    options: baseOptions(),
  });

  const status = statusDistribution(periodDemands);
  createChart("statusChart", {
    type: "doughnut",
    data: {
      labels: status.labels,
      datasets: [{
        data: status.values,
        backgroundColor: [colors.sand, colors.accent, colors.info, colors.success, colors.danger, colors.muted],
        borderColor: colors.surface,
        borderWidth: 3,
        hoverOffset: 5,
      }],
    },
    options: doughnutOptions(),
  });
}

function renderRecent() {
  const items = state.demands.slice(0, 4);
  const body = document.getElementById("recentDemandsBody");
  body.innerHTML = items.length ? items.map(item => {
    const status = effectiveStatus(item);
    const manager = item.manager?.trim() || "Gestor não informado";
    return `<tr>
      <td><a href="demandas.html?view=${encodeURIComponent(item.id)}" style="text-decoration:none">${demandCell(item)}</a></td>
      <td>${escapeHtml(manager)}</td>
      <td><span class="priority-pill ${priorityClass(item.priority)}">${escapeHtml(item.priority)}</span></td>
      <td>${formatDate(item.due_date)}</td>
      <td><span class="status-pill ${statusClass(status)}">${escapeHtml(status)}</span></td>
    </tr>`;
  }).join("") : `<tr><td colspan="5" class="empty-table">Nenhuma demanda cadastrada.</td></tr>`;
}

function renderDashboard() {
  const interval = intervalFor(activePeriod);
  const demands = filterDemandsByStart(state.demands, interval);
  const done = demands.filter(item => effectiveStatus(item) === "Concluída").length;
  const progress = demands.filter(item => effectiveStatus(item) === "Em andamento").length;
  const overdue = demands.filter(item => effectiveStatus(item) === "Atrasada").length;
  const estimated = demands.reduce((total, item) => total + Number(item.estimated_hours || 0), 0);
  const actual = demands.reduce((total, item) => total + Number(item.actual_hours || 0), 0);
  const rate = estimated > 0 ? actual / estimated * 100 : actual > 0 ? 100 : 0;
  const difference = actual - estimated;

  document.getElementById("kpiTotal").textContent = demands.length;
  document.getElementById("kpiProgress").textContent = progress;
  document.getElementById("kpiProgressText").textContent = `${percent(progress, demands.length)}% do total`;
  document.getElementById("kpiDone").textContent = done;
  document.getElementById("kpiDoneText").textContent = `${percent(done, demands.length)}% do total`;
  document.getElementById("kpiOverdue").textContent = overdue;
  document.getElementById("dashboardEstimatedHours").textContent = formatHours(estimated);
  document.getElementById("dashboardActualHours").textContent = formatHours(actual);
  document.getElementById("dashboardHoursDifference").textContent = `${difference > 0 ? "+" : ""}${formatHours(difference)}`;
  document.getElementById("dashboardHoursRate").textContent = `${Math.round(rate)}%`;

  const status = document.getElementById("hoursStatus");
  if (!estimated && !actual) {
    status.className = "hours-status";
    status.innerHTML = `<i class="fa-solid fa-gauge-high"></i> Sem horas registradas`;
  } else if (!estimated && actual > 0) {
    status.className = "hours-status over";
    status.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Horas sem estimativa`;
  } else if (rate > 100) {
    status.className = "hours-status over";
    status.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${Math.round(rate - 100)}% acima da estimativa`;
  } else if (rate >= 85) {
    status.className = "hours-status near";
    status.innerHTML = `<i class="fa-solid fa-clock"></i> Próximo da estimativa`;
  } else {
    status.className = "hours-status ok";
    status.innerHTML = `<i class="fa-solid fa-circle-check"></i> Dentro da estimativa`;
  }

  renderCharts(interval, demands);
  renderRecent();
}

bootPage(() => {
  document.querySelectorAll("[data-period]").forEach(button => {
    button.addEventListener("click", () => {
      activePeriod = button.dataset.period;
      document.querySelectorAll("[data-period]").forEach(item => item.classList.toggle("active", item === button));
      renderDashboard();
    });
  });
  window.addEventListener("fluux:themechange", renderDashboard);
  renderDashboard();
});
