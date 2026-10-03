export function mountSettingsSections() {
  const main = document.getElementById("mainContent");
  const form = document.getElementById("settingsForm");
  const sections = [...form.querySelectorAll(".settings-section")];
  sections.push(main.querySelector(".fluux-preferences"));
  const description = main.querySelector(".fluux-preferences .settings-section-head p");
  if (description) description.textContent = "Períodos e rankings são deste navegador. Os limites de alerta também alimentam o sino deste usuário na empresa ativa.";
  const actions = form.querySelector(".settings-actions");
  if (actions) form.appendChild(actions); // One save action remains available for both profile and system.
  const nav = document.createElement("div");
  nav.className = "fluux-settings-tabs";
  nav.setAttribute("role", "tablist"); nav.setAttribute("aria-label", "Categoria das configurações");
  document.getElementById("settingsLock").before(nav);
  ["Perfil", "Sistema", "Operação"].forEach((label, index) => {
    const section = sections[index];
    if (!section) return;
    section.id = `settings-panel-${index}`;
    section.setAttribute("role", "tabpanel"); section.setAttribute("aria-labelledby", `settings-tab-${index}`);
    const button = document.createElement("button");
    button.type = "button"; button.textContent = label; button.id = `settings-tab-${index}`;
    button.setAttribute("role", "tab"); button.setAttribute("aria-controls", section.id);
    button.addEventListener("click", () => {
      nav.querySelectorAll("button").forEach((item, current) => {
        item.setAttribute("aria-selected", String(current === index)); item.tabIndex = current === index ? 0 : -1;
      });
      sections.forEach((item, current) => item.hidden = current !== index);
      document.getElementById("settingsLock").hidden = index === 2;
      document.getElementById("editSettingsButton").hidden = index === 2;
      if (actions) actions.hidden = index === 2;
    });
    button.addEventListener("keydown", event => {
      const buttons = [...nav.querySelectorAll("button")];
      const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 :
        event.key === "Home" ? 0 : event.key === "End" ? 2 : -1;
      if (next < 0) return;
      event.preventDefault(); buttons[next].focus(); buttons[next].click();
    });
    nav.appendChild(button);
  });
  nav.querySelector("button")?.click();
}
