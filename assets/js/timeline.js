import { readEvents, phase2Rpc, canWritePhase2, migrationMissing } from "./phase2-api.js";
import { html, money, moneyCents, dateLabel } from "./phase2-rules.js";

const LABELS = {
  lpu_number: "Identificador", title: "Projeto", project: "LPU agregada", description: "Descrição",
  issue_reason: "Descrição", status: "Status", manager_status: "Status do gestor", priority: "Prioridade",
  responsible: "Responsável", responsible_name: "Responsável", manager: "Gestor", manager_name: "Gestor",
  requester: "Solicitante", location_name: "Polo", location_subdivision_name: "Subdivisão",
  start_date: "Solicitação", due_date: "Prazo", execution_date: "Execução", completed_at: "Conclusão",
  service_date: "Atendimento", estimated_hours: "Horas estimadas", actual_hours: "Horas realizadas",
  notes: "Atividades / resolução", tags: "Tags", equipment_type: "Equipamento", service_type: "Tipo de atendimento",
  quantity_replaced: "Quantidade", billable_amount: "Valor deste registro",
};

function eventTime(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
  }).format(new Date(value));
}

function displayValue(key, value) {
  if (value === null || value === undefined || value === "") return "Não informado";
  if (key === "billable_amount") return money(moneyCents(value));
  if (key.endsWith("_date") || key === "completed_at") return dateLabel(value);
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function eventMarkup(event) {
  const entries = Object.entries(event.changes || {});
  const changes = entries.length ? `<details><summary>Ver ${entries.length} ${entries.length === 1 ? "alteração" : "alterações"}</summary>
    <dl>${entries.map(([key, change]) => `<div><dt>${html(LABELS[key] || key)}</dt><dd>
      <span>${html(displayValue(key, change.from))}</span><b aria-label="para"> → </b>
      <strong>${html(displayValue(key, change.to))}</strong></dd></div>`).join("")}</dl></details>` : "";
  const legacy = event.event_type === "baseline" ? `<p class="timeline-legacy">Datas conhecidas: cadastro ${html(dateLabel(event.snapshot?.created_at))};
    execução ${html(dateLabel(event.snapshot?.execution_date || event.snapshot?.service_date))};
    conclusão ${html(dateLabel(event.snapshot?.completed_at))}. Não representam uma trilha antiga de alterações.</p>` : "";
  return `<li class="timeline-event timeline-${html(event.event_type)}"><span class="timeline-dot" aria-hidden="true"></span>
    <div><time datetime="${html(event.occurred_at)}">${html(eventTime(event.occurred_at))}</time>
    <strong>${html(event.message)}</strong><small>${html(event.actor_name)}</small>${legacy}${changes}</div></li>`;
}

export function mountTimeline(container, kind, id) {
  const section = document.createElement("section");
  section.className = "fluux-timeline full";
  section.setAttribute("aria-label", "Histórico do registro");
  section.innerHTML = `<header><div><small>ACOMPANHAMENTO</small><h3>Linha do tempo</h3></div>
    <button class="btn-secondary btn-compact timeline-refresh" type="button" aria-label="Atualizar histórico">Atualizar</button></header>
    <p class="timeline-feedback" role="status">Carregando histórico...</p>
    <ol class="timeline-list"></ol>
    <button class="btn-secondary btn-compact timeline-more" type="button" hidden>Carregar mais eventos</button>
    <form class="timeline-form" hidden><label class="field"><span>Registrar andamento</span>
      <textarea maxlength="2000" rows="3" required placeholder="Descreva o andamento. O registro anterior será preservado."></textarea></label>
      <button class="btn-primary btn-compact" type="submit">Registrar andamento</button>
      <p class="timeline-save-feedback" role="status"></p></form>`;
  container.append(section);
  let offset = 0;
  let loading = false;
  let generation = 0;
  const feedback = section.querySelector(".timeline-feedback");
  const list = section.querySelector("ol");
  const more = section.querySelector(".timeline-more");
  const refresh = section.querySelector(".timeline-refresh");
  const form = section.querySelector("form");

  async function load(reset = false) {
    if (loading) return;
    loading = true;
    refresh.disabled = true;
    more.disabled = true;
    const currentGeneration = ++generation;
    if (reset) { offset = 0; list.innerHTML = ""; }
    feedback.textContent = "Carregando histórico...";
    try {
      const events = await readEvents(kind, id, offset);
      if (!section.isConnected || currentGeneration !== generation) return;
      list.insertAdjacentHTML("beforeend", events.map(eventMarkup).join(""));
      offset += events.length;
      more.hidden = events.length < 40;
      feedback.textContent = offset ? `${offset} eventos exibidos · horário de Brasília` : "Nenhum evento registrado.";
      try { form.hidden = !(await canWritePhase2()); }
      catch { form.hidden = true; }
    } catch (error) {
      if (!section.isConnected) return;
      more.hidden = true;
      form.hidden = true;
      feedback.textContent = migrationMissing(error)
        ? "Histórico indisponível: aplique o SQL 01 do pacote. Os detalhes do registro continuam disponíveis."
        : `Não foi possível carregar o histórico. ${error.message || "Confira sua permissão e tente novamente."}`;
    } finally {
      loading = false;
      refresh.disabled = false;
      more.disabled = false;
    }
  }
  refresh.addEventListener("click", () => load(true));
  more.addEventListener("click", () => load());
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const textarea = form.querySelector("textarea");
    const message = textarea.value.trim();
    const status = form.querySelector(".timeline-save-feedback");
    if (!message) { status.textContent = "Informe o andamento."; return; }
    const button = form.querySelector("button");
    button.disabled = true;
    status.textContent = "Registrando...";
    try {
      await phase2Rpc("fluux_add_timeline_note", { p_kind: kind, p_id: id, p_message: message });
      textarea.value = "";
      status.textContent = "Andamento registrado.";
      await load(true);
    } catch (error) { status.textContent = error.message || "Não foi possível registrar o andamento."; }
    finally { button.disabled = false; }
  });
  load(true);
}
