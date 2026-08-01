import { log } from "./logger.js";
import { requireSession, getSupabase, clearStoredAuthSessions } from "./supabase-client.js";
import { initializeStore, resetStore, state, saveProfile } from "./store.js";
import { applyTheme, applyIdentity, initClock, closeModal, showToast } from "./ui.js";
import { initializeWeather, openWeather, closeWeather, refreshWeather } from "./weather.js";

const VERSION = "v1.3.0";
const COLLAPSED_KEY = "fluux-sidebar-collapsed";
const WARM_BOOT_KEY = "fluux-warm-navigation";

const NAV = [
  { label: "VISÃO GERAL" },
  { page: "inicio", href: "inicio.html", icon: "fa-table-cells-large", text: "Início" },
  { page: "nova_demanda", href: "nova_demanda.html", icon: "fa-plus", text: "Nova demanda", primary: true },
  { page: "demandas", href: "demandas.html", icon: "fa-list-check", text: "Demandas", count: "navDemandCount" },
  { page: "cadastros", href: "cadastros.html", icon: "fa-address-book", text: "Cadastros" },
  { page: "analises", href: "analises.html", icon: "fa-chart-column", text: "Análises" },
  { page: "relatorios", href: "relatorios.html", icon: "fa-file-lines", text: "Relatórios", regular: true },
  { label: "OPERAÇÃO", spaced: true },
  { page: "conversores", href: "conversores.html", icon: "fa-network-wired", text: "Conversores", count: "navConverterCount" },
  { label: "SISTEMA", spaced: true },
  { page: "configuracoes", href: "configuracoes.html", icon: "fa-sliders", text: "Configurações" },
];

function navMarkup(activePage) {
  return NAV.map(item => {
    if (item.label) return `<span class="nav-label ${item.spaced ? "nav-label-spaced" : ""}">${item.label}</span>`;
    const active = item.page === activePage;
    return `<a class="nav-item ${item.primary ? "primary-link" : ""} ${active ? "active" : ""}" href="${item.href}" ${active ? 'aria-current="page"' : ""}>
      <i class="${item.regular ? "fa-regular" : "fa-solid"} ${item.icon}"></i>
      <span>${item.text}</span>
      ${item.count ? `<b class="nav-count" id="${item.count}">0</b>` : ""}
    </a>`;
  }).join("");
}

function mountShell() {
  const page = document.body.dataset.page || "inicio";
  const pageLabel = document.body.dataset.pageLabel || "Início";
  const shell = document.getElementById("appShell");
  const main = document.getElementById("mainContent");
  if (!shell || !main) throw new Error("Estrutura principal da página não foi encontrada.");

  shell.insertAdjacentHTML("afterbegin", `
    <aside class="sidebar" id="sidebar" aria-label="Navegação principal">
      <div class="brand">
        <div class="brand-glass"><img src="assets/img/logo.png" alt="FLUUX"></div>
        <div class="brand-copy"><strong data-app-name>FLUUX</strong><small data-app-subtitle>Organização de Demandas</small></div>
        <button class="icon-btn sidebar-close" id="sidebarClose" type="button" aria-label="Fechar menu"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="sidebar-control"><button class="sidebar-toggle" id="sidebarToggle" type="button" aria-label="Recolher menu"><i class="fa-solid fa-angles-left"></i><span>Recolher menu</span></button></div>
      <nav class="sidebar-nav">${navMarkup(page)}</nav>
      <footer class="sidebar-footer"><span>Desenvolvido por</span><strong>Victor Arnez</strong><small>FLUUX · <span>${VERSION}</span></small></footer>
    </aside>
    <div class="sidebar-backdrop" id="sidebarBackdrop" hidden></div>
  `);

  const column = document.createElement("div");
  column.className = "app-column";
  column.innerHTML = `
    <header class="topbar">
      <div class="topbar-start">
        <button class="icon-btn mobile-menu" id="mobileMenuButton" type="button" aria-label="Abrir menu"><i class="fa-solid fa-bars"></i></button>
        <div class="breadcrumb"><span>Organização</span><i class="fa-solid fa-chevron-right"></i><strong>${pageLabel}</strong></div>
      </div>
      <div class="topbar-actions">
        <div class="weather-area">
          <button class="topbar-info weather" id="weatherButton" type="button" aria-label="Abrir previsão do tempo" aria-expanded="false" aria-controls="weatherPopover">
            <i id="weatherIcon" class="fa-solid fa-cloud-sun"></i>
            <span><strong id="weatherTemp">--°</strong><small id="weatherCity">Carregando clima</small></span>
            <i class="weather-chevron fa-solid fa-chevron-down"></i>
          </button>
          <section class="weather-popover" id="weatherPopover" aria-label="Previsão do tempo" hidden>
            <header><div><small>PREVISÃO DO TEMPO</small><strong id="weatherPopoverCity">Local atual</strong></div><button class="icon-btn" id="refreshWeatherButton" type="button" aria-label="Atualizar clima"><i class="fa-solid fa-rotate"></i></button></header>
            <div class="weather-days" id="weatherDays"><span class="spinner"></span></div>
            <footer>Open-Meteo · localização automática quando permitida</footer>
          </section>
        </div>
        <div class="topbar-info clock" aria-live="polite"><i class="fa-regular fa-clock"></i><span><strong id="currentTime">--:--</strong><small id="currentDate">--</small></span></div>
        <button class="icon-btn" id="themeButton" type="button" aria-label="Alternar tema"><i class="fa-solid fa-sun"></i></button>
        <div class="user-area">
          <button class="user-chip" id="userMenuButton" type="button" aria-expanded="false">
            <span class="avatar" id="headerAvatar">FG</span><span><strong id="headerUserName">Usuário</strong><small id="headerUserRole">Gestão de Demandas</small></span><i class="fa-solid fa-chevron-down"></i>
          </button>
          <div class="user-menu" id="userMenu" hidden>
            <div class="user-menu-head"><span class="avatar large" id="menuAvatar">FG</span><span><strong id="menuUserName">Usuário</strong><small id="menuUserEmail">—</small></span></div>
            <a href="configuracoes.html"><i class="fa-solid fa-gear"></i> Configurações</a>
            <button class="logout" id="logoutButton" type="button"><i class="fa-solid fa-arrow-right-from-bracket"></i> Sair</button>
          </div>
        </div>
      </div>
    </header>`;
  main.replaceWith(column);
  column.appendChild(main);
  shell.appendChild(column);
}

function setSidebarMobile(open) {
  const shell = document.getElementById("appShell");
  const backdrop = document.getElementById("sidebarBackdrop");
  shell.classList.toggle("sidebar-mobile-open", open);
  backdrop.hidden = !open;
  document.body.classList.toggle("sidebar-open", open);
}

function bindShell() {
  const shell = document.getElementById("appShell");
  const collapsed = localStorage.getItem(COLLAPSED_KEY) === "1";
  shell.classList.toggle("sidebar-collapsed", collapsed);

  document.getElementById("sidebarToggle")?.addEventListener("click", () => {
    const next = !shell.classList.contains("sidebar-collapsed");
    shell.classList.toggle("sidebar-collapsed", next);
    localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
  });
  document.getElementById("mobileMenuButton")?.addEventListener("click", () => setSidebarMobile(true));
  document.getElementById("sidebarClose")?.addEventListener("click", () => setSidebarMobile(false));
  document.getElementById("sidebarBackdrop")?.addEventListener("click", () => setSidebarMobile(false));

  const userButton = document.getElementById("userMenuButton");
  const userMenu = document.getElementById("userMenu");
  userButton?.addEventListener("click", event => {
    event.stopPropagation();
    const opening = userMenu.hidden;
    userMenu.hidden = !opening;
    userButton.setAttribute("aria-expanded", String(opening));
    closeWeather();
  });

  document.getElementById("weatherButton")?.addEventListener("click", openWeather);
  document.getElementById("refreshWeatherButton")?.addEventListener("click", event => { event.stopPropagation(); refreshWeather(); });

  document.addEventListener("click", event => {
    if (!event.target.closest(".user-area")) {
      userMenu.hidden = true;
      userButton?.setAttribute("aria-expanded", "false");
    }
    if (!event.target.closest(".weather-area")) closeWeather();
    const close = event.target.closest("[data-close-modal]");
    if (close) closeModal(close.dataset.closeModal);
  });

  document.getElementById("themeButton")?.addEventListener("click", async () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    applyTheme(next);
    try {
      await saveProfile({ theme: next });
    } catch (error) {
      log.warn("TEMA", "Tema aplicado, mas não foi possível salvar no perfil.", error);
      showToast("Tema aplicado apenas nesta sessão.", "info");
    }
  });

  document.getElementById("logoutButton")?.addEventListener("click", async () => {
    try { await getSupabase().auth.signOut(); } catch (error) { log.warn("AUTH", "Falha ao encerrar sessão no servidor.", error); }
    resetStore();
    clearStoredAuthSessions();
    sessionStorage.clear();
    location.replace("index.html");
  });
}

function updateNavCounts() {
  const demands = document.getElementById("navDemandCount");
  const converters = document.getElementById("navConverterCount");
  if (demands) demands.textContent = state.demands.length;
  if (converters) converters.textContent = state.converters.length;
}

function showFatal(error) {
  log.error("INICIALIZAÇÃO", "Não foi possível iniciar a página.", error);
  document.getElementById("bootScreen")?.setAttribute("hidden", "");
  document.getElementById("appShell")?.setAttribute("hidden", "");
  const fatal = document.getElementById("fatalLayer");
  const message = document.getElementById("fatalMessage");
  if (message) message.textContent = error?.message || "Confira a configuração e tente novamente.";
  if (fatal) fatal.hidden = false;
}

export async function bootPage(onReady) {
  try {
    log.boot();
    mountShell();

    const session = await requireSession();
    if (!session) return;

    const appShell = document.getElementById("appShell");
    const bootScreen = document.getElementById("bootScreen");
    const warmNavigation = sessionStorage.getItem(WARM_BOOT_KEY) === "1";

    /*
     * Depois que uma página já foi inicializada nesta aba, as próximas
     * navegações exibem imediatamente a estrutura da página. Os dados
     * continuam sendo atualizados antes da execução do script específico.
     */
    if (warmNavigation) {
      appShell.hidden = false;
      bootScreen.hidden = true;
    }

    await initializeStore(session);
    applyTheme(state.profile.theme);
    applyIdentity();
    updateNavCounts();
    bindShell();
    initClock();

    appShell.hidden = false;
    bootScreen.hidden = true;

    if (typeof onReady === "function") {
      await onReady(state);
    }

    sessionStorage.setItem(WARM_BOOT_KEY, "1");

    initializeWeather().catch(error =>
      log.warn(
        "CLIMA",
        "Inicialização do clima não interrompeu o sistema.",
        error,
      ),
    );

    log.success(
      "INICIALIZAÇÃO",
      `${document.body.dataset.pageLabel || "Página"} pronta.`,
    );
  } catch (error) {
    showFatal(error);
  }
}
