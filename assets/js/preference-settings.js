import { getPreferences, savePreferences, resetPreferences } from "./preferences.js";

export function mountPreferenceSettings() {
  const section = document.createElement("section");
  section.className = "panel settings-section fluux-preferences";
  section.innerHTML = `
    <div class="settings-section-head"><i class="fa-solid fa-sliders"></i><div><h2>Operação e indicadores</h2>
      <p>Preferências deste navegador, separadas por usuário e empresa. Não alteram os dados da equipe.</p></div></div>
    <form id="operationalPreferencesForm">
      <div class="fluux-preference-fields">
        <label class="field"><span>Próximos vencimentos (dias)</span><input id="prefDueDays" type="number" min="1" max="30" step="1" required></label>
        <label class="field"><span>Alerta sem atualização (dias)</span><input id="prefInactiveDays" type="number" min="1" max="90" step="1" required></label>
        <label class="field"><span>Período padrão do Início</span><select id="prefDashboardPeriod"><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option></select></label>
        <label class="field"><span>Período padrão das Análises</span><select id="prefAnalysisPeriod"><option value="week">Semana</option><option value="month">Mês</option><option value="quarter">Trimestre</option><option value="semester">Semestre</option><option value="year">Ano</option></select></label>
        <label class="field"><span>Itens visíveis nos rankings</span><input id="prefRankingRows" type="number" min="3" max="10" step="1" required><small>Todos os demais continuam disponíveis pelo scroll.</small></label>
      </div>
      <div class="settings-actions"><button class="btn-ghost" id="resetOperationalPreferences" type="button">Restaurar padrões</button><button class="btn-primary" type="submit">Salvar preferências</button></div>
      <p id="preferenceFeedback" role="status" class="fluux-attention-feedback"></p>
    </form>`;
  document.getElementById("mainContent").appendChild(section);
  const fields = { dueDays: "prefDueDays", inactiveDays: "prefInactiveDays", dashboardPeriod: "prefDashboardPeriod", analysisPeriod: "prefAnalysisPeriod", rankingRows: "prefRankingRows" };
  const feedback = document.getElementById("preferenceFeedback");
  const populate = value => Object.entries(fields).forEach(([key, id]) => document.getElementById(id).value = value[key]);
  populate(getPreferences());
  document.getElementById("operationalPreferencesForm").addEventListener("submit", event => {
    event.preventDefault();
    try {
      const values = Object.fromEntries(Object.entries(fields).map(([key, id]) => [key, document.getElementById(id).value]));
      populate(savePreferences(values));
      feedback.textContent = "Preferências salvas. Aplicadas ao abrir Início, Análises ou Central de atenção.";
    } catch { feedback.textContent = "O navegador não permitiu salvar. Verifique as permissões de armazenamento."; }
  });
  document.getElementById("resetOperationalPreferences").addEventListener("click", () => {
    try { populate(resetPreferences()); feedback.textContent = "Padrões restaurados para este usuário e empresa."; }
    catch { feedback.textContent = "O navegador não permitiu restaurar as preferências."; }
  });
}
