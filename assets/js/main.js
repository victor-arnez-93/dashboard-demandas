import { VIEW_LABELS } from "./config.js";
import { initClock } from "./clock.js";
import { initTheme } from "./theme.js";
import {
  initializeBrand, showToast, setActiveView, toggleSidebar, closeMobileSidebar,
  restoreSidebar, openModal, closeModal, startPresentation, stopPresentation,
} from "./ui.js";
import { renderRecent, renderAll, initDemandInteractions } from "./demands.js";
import { initCharts } from "./charts.js";
import { initDashboard } from "./dashboard.js";

function initialView() {
  const hash = location.hash.slice(1);
  if (!hash || hash === "inicio") return "dashboard";
  return VIEW_LABELS[hash] ? hash : "dashboard";
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click",() => setActiveView(button.dataset.view)));
  document.querySelectorAll("[data-go-view]").forEach(button => button.addEventListener("click",() => setActiveView(button.dataset.goView)));
  document.getElementById("menuButton")?.addEventListener("click",toggleSidebar);
  document.getElementById("sidebarCollapseButton")?.addEventListener("click",toggleSidebar);
  document.getElementById("sidebarExpandButton")?.addEventListener("click",toggleSidebar);
  document.getElementById("settingsSidebarButton")?.addEventListener("click",toggleSidebar);
  document.getElementById("sidebarClose")?.addEventListener("click",closeMobileSidebar);
  document.getElementById("sidebarBackdrop")?.addEventListener("click",closeMobileSidebar);
  document.getElementById("newDemandButton")?.addEventListener("click",openModal);
  document.querySelectorAll("[data-open-modal]").forEach(button => button.addEventListener("click",openModal));
  document.querySelectorAll("[data-close-modal]").forEach(button => button.addEventListener("click",closeModal));
  document.getElementById("presentationButton")?.addEventListener("click",startPresentation);
  document.getElementById("exitPresentationButton")?.addEventListener("click",stopPresentation);
  document.getElementById("notificationButton")?.addEventListener("click",() => showToast("Não há novas notificações nesta versão demonstrativa."));
  document.querySelectorAll("[data-demo]").forEach(button => button.addEventListener("click",() => showToast(`${button.dataset.demo} será implementado em uma próxima fase.`)));

  addEventListener("resize",() => {
    if (!matchMedia("(max-width:960px)").matches) closeMobileSidebar();
  });
  addEventListener("dashboard:themechange",event => {
    if (event.detail.notify) showToast(event.detail.theme === "light" ? "Tema claro ativado." : "Tema escuro ativado.","success");
  });
  document.addEventListener("fullscreenchange",() => {
    if (!document.fullscreenElement && document.body.classList.contains("presentation-mode")) stopPresentation();
  });
  document.addEventListener("keydown",event => {
    if (event.key !== "Escape") return;
    closeModal();
    if (document.body.classList.contains("presentation-mode")) stopPresentation();
  });
}

function boot() {
  initializeBrand();
  restoreSidebar();
  initTheme();
  initClock();
  renderRecent();
  renderAll();
  initDemandInteractions();
  initDashboard();
  initCharts();
  bindEvents();
  setActiveView(initialView(),false);
}

boot();
