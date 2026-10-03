export function mountAnalysisSections(render) {
  const grid = document.querySelector(".analysis-grid");
  if (!grid) return;
  const categories = [
    ["management", "Gestão", ["managerChart", "demandLocationChart"]],
    ["capacity", "Capacidade", ["managerHoursChart"]],
    ["priority", "Prioridades", ["priorityChart"]],
    ["equipment", "Equipamentos", ["converterTrendChart", "converterLocationChart"]],
  ];
  const nav = document.createElement("div");
  nav.className = "fluux-analysis-sections";
  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-label", "Categoria das análises");
  grid.before(nav);
  categories.forEach(([key, label, ids], index) => {
    const panel = document.createElement("section");
    panel.id = `analysis-panel-${key}`;
    panel.className = "fluux-analysis-panel";
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", `analysis-tab-${key}`);
    panel.hidden = index !== 0;
    panel.tabIndex = 0;
    grid.appendChild(panel);
    ids.forEach(id => {
      const card = document.getElementById(id)?.closest(".analysis-card");
      if (card) panel.appendChild(card);
    });
    if (key === "equipment") {
      const heading = grid.querySelector(".converter-analysis-title");
      if (heading) panel.prepend(heading);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.id = `analysis-tab-${key}`;
    button.textContent = label;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", panel.id);
    button.setAttribute("aria-selected", String(index === 0));
    button.tabIndex = index === 0 ? 0 : -1;
    button.addEventListener("click", () => {
      nav.querySelectorAll("button").forEach(item => {
        item.setAttribute("aria-selected", String(item === button));
        item.tabIndex = item === button ? 0 : -1;
      });
      grid.querySelectorAll(".fluux-analysis-panel").forEach(item => item.hidden = item !== panel);
      render();
    });
    button.addEventListener("keydown", event => {
      const buttons = [...nav.querySelectorAll("button")];
      const current = buttons.indexOf(button);
      const next = event.key === "ArrowRight" ? (current + 1) % buttons.length :
        event.key === "ArrowLeft" ? (current + buttons.length - 1) % buttons.length :
        event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault(); buttons[next].focus(); buttons[next].click();
    });
    nav.appendChild(button);
  });
}
