import { bootPage } from "./shell.js";
import { state } from "./store.js";
import { readAll, migrationMissing } from "./phase2-api.js";
import { getPreferences } from "./preferences.js";
import { ATTENTION_LABELS, classifyAttention, addBillingAttention } from "./attention-rules.js";
import { html, dateLabel, localDate, serviceDate } from "./phase2-rules.js";
import { renderDemandDetail, renderConverterDetail } from "./ui.js";

let groups = {};
let active = "overdue";
let shown = 50;
let visible = [];
const $ = id => document.getElementById(id);

function render() {
  const labels = ATTENTION_LABELS;
  $("attentionCards").innerHTML = Object.entries(labels).map(([key, label]) => `
    <button type="button" class="fluux-attention-card" data-attention="${key}" aria-pressed="${key === active}">
      <strong>${groups[key]?.length || 0}</strong><span>${label}</span>
    </button>`).join("");
  $("attentionTitle").textContent = labels[active];
  const search = $("attentionSearch").value.trim().toLocaleLowerCase("pt-BR");
  const origin = $("attentionOrigin").value;
  visible = (groups[active] || []).filter(entry => {
    const record = entry.record || {};
    return (!origin || entry.kind === origin) && (!search ||
      [record.title, record.project, record.lpu_number, record.manager, record.manager_name,
        record.location_name, entry.item?.identifier, entry.reason].join(" ").toLocaleLowerCase("pt-BR").includes(search));
  }).sort((a, b) => {
    const date = entry => ["overdue", "today", "soon"].includes(active) ? entry.record?.due_date :
      ["waiting", "inactive"].includes(active) ? localDate(entry.record?.updated_at || entry.record?.created_at) :
      entry.record ? serviceDate(entry.kind, entry.record) : localDate(entry.check?.competence);
    return date(a).localeCompare(date(b));
  });
  $("attentionResults").textContent = `${visible.length} ocorrência(s) · exibindo até ${shown}. Um registro pode aparecer em mais de um indicador.`;
  $("attentionBody").innerHTML = visible.slice(0, shown).map((entry, index) => {
    const record = entry.record || {};
    const label = record.title || record.project || entry.item?.identifier || "Atendimento";
    const detail = entry.reason || (active === "closing" ? "Execução pendente de revisão no fechamento; não significa pagamento pendente." :
      ["waiting", "inactive"].includes(active) ? `Última atualização: ${dateLabel(record.updated_at || record.created_at)}` : `Prazo: ${dateLabel(record.due_date)}`);
    return `<tr><td>${entry.kind === "demand" ? "Demanda" : "Conversor / PoE"}</td>
      <td><strong>${html(label)}</strong><small class="fluux-attention-secondary">${html(record.lpu_number || entry.item?.identifier || "Sem identificador")}</small></td>
      <td>${html(record.manager || record.manager_name || "—")}<small class="fluux-attention-secondary">${html(record.location_name || "—")}</small></td>
      <td>${html(detail)}</td><td>${entry.record ? `<button type="button" class="btn-secondary btn-compact" data-attention-view="${index}">Detalhes</button>` : ""}
      ${["closing", "missing", "review"].includes(active) ? `<a class="btn-ghost btn-compact" href="fechamento.html?kind=${entry.kind}&month=${encodeURIComponent(entry.check ? localDate(entry.check.competence).slice(0, 7) : serviceDate(entry.kind, record).slice(0, 7))}">Fechamento</a>` : ""}</td></tr>`;
  }).join("") || `<tr><td colspan="5" class="empty-table">Nenhum registro neste filtro.</td></tr>`;
  $("attentionMore").hidden = visible.length <= shown;
}

async function refresh() {
  const button = $("attentionRefresh");
  button.disabled = true;
  $("attentionFeedback").textContent = "Carregando registros da empresa ativa…";
  try {
    const [demands, converters] = await Promise.all([readAll("demands"), readAll("media_converter_records")]);
    state.demands = demands; state.converters = converters;
    const preferences = getPreferences();
    groups = classifyAttention(demands, converters, preferences);
    let message = "";
    try {
      const checks = await readAll("fluux_billing_checks");
      checks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || b.id.localeCompare(a.id));
      const latest = [...new Map(checks.map(check => [`${check.entity_kind}:${localDate(check.competence).slice(0, 7)}`, null])).keys()]
        .map(key => checks.find(check => `${check.entity_kind}:${localDate(check.competence).slice(0, 7)}` === key));
      const items = (await Promise.all(latest.map(check => readAll("fluux_billing_check_items", query => query.eq("check_id", check.id))))).flat();
      addBillingAttention(groups, latest, items, demands, converters);
      message = checks.length ? "Conferência: último resultado salvo de cada origem e competência." : "Nenhuma conferência salva ainda.";
    } catch (error) {
      message = migrationMissing(error) ? "Conferência indisponível: execute o SQL 03 do lote anterior." :
        `Não foi possível consultar as conferências: ${error.message || "tente novamente"}.`;
    }
    $("attentionFeedback").textContent = `Dados atualizados. Próximos vencimentos: ${preferences.dueDays} dias; sem atualização: ${preferences.inactiveDays} dias. ${message}`;
    render();
  } catch (error) {
    groups = {}; render();
    $("attentionFeedback").textContent = error.message || "Não foi possível carregar os registros.";
  } finally { button.disabled = false; }
}

bootPage(async () => {
  $("attentionCards").addEventListener("click", event => {
    const button = event.target.closest("[data-attention]");
    if (!button) return;
    active = button.dataset.attention; shown = 50; render();
  });
  $("attentionBody").addEventListener("click", event => {
    const button = event.target.closest("[data-attention-view]");
    if (!button) return;
    const entry = visible[Number(button.dataset.attentionView)];
    if (!entry?.record) return;
    if (entry.kind === "demand") renderDemandDetail(entry.record);
    else renderConverterDetail(entry.record);
  });
  ["attentionSearch", "attentionOrigin"].forEach(id => $(id).addEventListener("input", () => { shown = 50; render(); }));
  $("attentionMore").addEventListener("click", () => { shown += 50; render(); });
  $("attentionRefresh").addEventListener("click", refresh);
  await refresh();
});
