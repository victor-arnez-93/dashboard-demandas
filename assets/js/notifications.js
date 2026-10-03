import { state } from "./store.js";
import { getSupabase } from "./supabase-client.js";
import { getPreferences } from "./preferences.js";
import { html, localDate, serviceDate } from "./phase2-rules.js";
import { phase2Rpc, migrationMissing, companyId } from "./phase2-api.js";

let channel = null;
let timer = null;
let generation = 0;
let mode = "unread";
let hasMore = false;
let items = [];
let refreshing = false;
let queued = false;
let realtime = false;
let company = "";
let recipient = "";
const $ = id => document.getElementById(id);

function visible(value) {
  $("notificationPanel").hidden = !value;
  $("notificationButton").setAttribute("aria-expanded", String(value));
  if (value) refresh(false);
}

function render(data) {
  items = data.items;
  hasMore = Boolean(data.has_more);
  const count = Number(data.unread) || 0;
  $("notificationBadge").textContent = count > 99 ? "99+" : String(count);
  $("notificationBadge").hidden = count === 0;
  $("notificationButton").setAttribute("aria-label", `Notificações: ${count} não lidas`);
  $("notificationsReadAll").disabled = count === 0;
  $("notificationList").innerHTML = items.map(item => {
    const status = item.resolved_at ? "Resolvida" : item.dismissed_at ? "Dispensada" : item.read_at ? "Lida" : "Não lida";
    const time = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(item.created_at));
    return `<li class="fluux-notification ${item.read_at ? "is-read" : ""}">
      <strong>${html(item.title)}</strong><p>${html(item.body)}</p><small>${html(time)} · ${status}</small>
      <div class="fluux-notification-actions">
        <button type="button" class="btn-ghost btn-compact" data-notification-id="${item.id}" data-notification-action="open">Abrir registro</button>
        ${!item.read_at && !item.resolved_at && !item.dismissed_at ? `<button type="button" class="btn-ghost btn-compact" data-notification-id="${item.id}" data-notification-action="read">Marcar lida</button>` : ""}
        ${!item.dismissed_at && !item.resolved_at ? `<button type="button" class="btn-ghost btn-compact" data-notification-id="${item.id}" data-notification-action="dismiss">Dispensar</button>` : ""}
      </div></li>`;
  }).join("") || `<li class="fluux-notification-empty">${mode === "unread" ? "Nenhuma notificação não lida." : "Nenhuma notificação no histórico."}</li>`;
  $("notificationMore").hidden = !hasMore;
  $("notificationMode").value = mode;
}

async function refresh(sync = true) {
  if (state.activeCompanyId !== company || state.user?.id !== recipient) { stopNotifications(); return; }
  if (refreshing) { queued = true; return; }
  refreshing = true;
  const epoch = generation;
  try {
    if (sync) {
      const preferences = getPreferences();
      await phase2Rpc("fluux_sync_notifications", { p_due_days: preferences.dueDays, p_inactive_days: preferences.inactiveDays });
    }
    const data = await phase2Rpc("fluux_notification_inbox", { p_mode: mode, p_limit: 20, p_offset: 0 });
    if (epoch !== generation) return;
    if (data.company_id !== company || data.recipient_id !== recipient || !Array.isArray(data.items) ||
      data.items.some(item => item.company_id !== company || item.recipient_id !== recipient)) throw new Error("Resposta inválida da caixa de entrada.");
    render(data);
    $("notificationFeedback").textContent = realtime ? "Conectado em tempo real." : "Atualização automática a cada minuto; reconectando ao tempo real.";
  } catch (error) {
    if (epoch !== generation) return;
    $("notificationFeedback").textContent = migrationMissing(error) ? "Notificações indisponíveis. Execute o SQL 04 deste patch." :
      error.message || "Não foi possível atualizar as notificações.";
    $("notificationList").replaceChildren();
    $("notificationBadge").hidden = true;
  } finally {
    refreshing = false;
    if (queued && epoch === generation) { queued = false; refresh(false); }
  }
}

async function act(id, action, button) {
  const item = items.find(row => row.id === id);
  if (!item) return;
  button.disabled = true;
  try {
    let target = "";
    if (action === "open") {
      const table = item.entity_kind === "demand" ? "demands" : "media_converter_records";
      const { data: record, error } = await getSupabase().from(table).select("*").eq("company_id", company).eq("id", item.entity_id).maybeSingle();
      if (error) throw error;
      if (!record || record.company_id !== company || companyId() !== company) throw new Error("O registro não está mais disponível na empresa ativa.");
      const month = serviceDate(item.entity_kind, record).slice(0, 7);
      target = item.category === "billing" ? `fechamento.html?kind=${item.entity_kind}&month=${encodeURIComponent(month)}` :
        `${item.entity_kind === "demand" ? "demandas" : "conversores"}.html?view=${encodeURIComponent(item.entity_id)}`;
    }
    await phase2Rpc("fluux_notification_action", { p_id: id, p_action: action === "open" ? "read" : action });
    if (target) { location.assign(target); return; }
    await refresh(false);
  } catch (error) { $("notificationFeedback").textContent = error.message || "Não foi possível atualizar o aviso."; }
  finally { button.disabled = false; }
}

export function stopNotifications() {
  generation++;
  if (timer) clearInterval(timer);
  timer = null;
  if (channel) getSupabase().removeChannel(channel);
  channel = null;
  if ($("notificationList")) $("notificationList").replaceChildren();
  if ($("notificationBadge")) $("notificationBadge").hidden = true;
  if ($("notificationPanel")) $("notificationPanel").hidden = true;
}

export async function mountNotifications() {
  company = companyId(); recipient = state.user.id;
  const area = document.createElement("div");
  area.className = "fluux-notification-area";
  area.innerHTML = `<button id="notificationButton" class="icon-btn" type="button" aria-label="Notificações" aria-expanded="false" aria-controls="notificationPanel">
    <i class="fa-regular fa-bell" aria-hidden="true"></i><b id="notificationBadge" hidden>0</b></button>
    <section id="notificationPanel" class="fluux-notification-panel" hidden aria-label="Caixa de notificações">
      <header><h2>Notificações</h2><button id="notificationClose" class="icon-btn" type="button" aria-label="Fechar notificações">×</button></header>
      <div class="fluux-notification-toolbar"><label for="notificationMode">Exibir</label><select id="notificationMode"><option value="unread">Não lidas</option><option value="history">Histórico completo</option></select>
        <button id="notificationsReadAll" class="btn-ghost btn-compact" type="button">Ler todas</button><button id="notificationRefresh" class="btn-ghost btn-compact" type="button">Atualizar</button></div>
      <p id="notificationFeedback" class="fluux-notification-feedback" role="status">Conectando…</p>
      <ul id="notificationList" class="fluux-notification-list"></ul>
      <button id="notificationMore" class="btn-ghost" type="button" hidden>Mostrar mais</button>
    </section>`;
  $("themeButton").before(area);
  $("notificationButton").addEventListener("click", () => visible($("notificationPanel").hidden));
  $("notificationClose").addEventListener("click", () => { visible(false); $("notificationButton").focus(); });
  document.addEventListener("click", event => { if (!area.contains(event.target)) visible(false); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !$("notificationPanel").hidden) { visible(false); $("notificationButton").focus(); } });
  $("notificationMode").addEventListener("change", () => { mode = $("notificationMode").value; refresh(false); });
  $("notificationMore").addEventListener("click", async () => {
    const button = $("notificationMore"); button.disabled = true;
    try {
      const epoch = generation; const currentMode = mode;
      const data = await phase2Rpc("fluux_notification_inbox", { p_mode: mode, p_limit: 20, p_offset: items.length });
      if (epoch !== generation || mode !== currentMode) return;
      if (data.company_id !== company || data.recipient_id !== recipient || data.items.some(item => item.company_id !== company || item.recipient_id !== recipient)) throw new Error("Resposta inválida da caixa de entrada.");
      const merged = [...new Map([...items,...data.items].map(item => [item.id,item])).values()];
      render({ ...data, items: merged });
    } catch (error) { $("notificationFeedback").textContent = error.message || "Não foi possível carregar mais avisos."; }
    finally { button.disabled = false; }
  });
  $("notificationRefresh").addEventListener("click", () => refresh(true));
  $("notificationList").addEventListener("click", event => {
    const button = event.target.closest("[data-notification-action]");
    if (button) act(button.dataset.notificationId, button.dataset.notificationAction, button);
  });
  $("notificationsReadAll").addEventListener("click", async () => {
    const button = $("notificationsReadAll"); button.disabled = true;
    try { await phase2Rpc("fluux_notification_action", { p_id: null, p_action: "read_all" }); await refresh(false); }
    catch (error) { $("notificationFeedback").textContent = error.message || "Não foi possível marcar as notificações."; }
    finally { button.disabled = $("notificationBadge").hidden; }
  });
  try {
    channel = getSupabase().channel(`fluux-notifications:${company}:${recipient}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fluux_notifications", filter: `recipient_id=eq.${recipient}` }, payload => {
        if (payload.new?.company_id === company && payload.new?.recipient_id === recipient) refresh(false);
      }).subscribe(status => {
        realtime = status === "SUBSCRIBED";
        if (realtime) refresh(true); // Reconcile any events missed during reconnect.
      });
  } catch { realtime = false; }
  timer = setInterval(() => { if (!document.hidden) refresh(true); }, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(true); });
  window.addEventListener("fluux:preferenceschange", () => refresh(true));
  window.addEventListener("pagehide", stopNotifications, { once: true });
  await refresh(true);
}
