import { PERIOD_DATA } from "./data.js";
import { getDemands } from "./demands.js";
import { renderFlow } from "./charts.js";

function animateNumber(element,target) {
  if (!element) return;
  if (matchMedia("(prefers-reduced-motion:reduce)").matches) {
    element.textContent = target;
    return;
  }
  const start = Number(element.textContent) || 0;
  const startTime = performance.now();
  const tick = now => {
    const progress = Math.min((now-startTime)/420,1);
    element.textContent = Math.round(start + (target-start)*(1-Math.pow(1-progress,3)));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function updateDashboard(period = 30) {
  const demands = getDemands();
  const progress = demands.filter(demand => demand.status === "Em andamento").length;
  const done = demands.filter(demand => demand.status === "Concluída").length;
  const average = Math.round(demands.reduce((sum,demand) => sum+demand.averageDays,0)/demands.length);
  const total = Math.max(demands.length,Math.round(demands.length*(PERIOD_DATA[period]?.multiplier || 1)));
  animateNumber(document.getElementById("kpiTotal"),total);
  animateNumber(document.getElementById("kpiProgress"),progress);
  animateNumber(document.getElementById("kpiDone"),done);
  animateNumber(document.getElementById("kpiAverage"),average);
  document.getElementById("kpiProgressText").textContent = `${Math.round(progress/demands.length*100)}% do total demonstrativo`;
  document.getElementById("kpiDoneText").textContent = `${Math.round(done/demands.length*100)}% do total demonstrativo`;
  document.getElementById("donutTotal").textContent = demands.length;
  document.getElementById("navDemandCount").textContent = demands.length;
  const completion = Math.round(done/Math.max(done+progress,1)*100);
  document.getElementById("sidebarProgressValue").textContent = `${completion}%`;
  document.getElementById("sidebarProgressBar").style.width = `${completion}%`;
}

export function initDashboard() {
  updateDashboard();
  document.querySelectorAll("[data-period]").forEach(button => button.addEventListener("click",() => {
    document.querySelectorAll("[data-period]").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    const period = Number(button.dataset.period);
    updateDashboard(period);
    renderFlow(period);
  }));
  addEventListener("dashboard:datachange",() => updateDashboard(30));
}
