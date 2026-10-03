import { localDate, isExecuted, serviceDate, moneyCents } from "./phase2-rules.js";

export const ATTENTION_LABELS = Object.freeze({
  overdue: "Atrasadas",
  today: "Vencendo hoje",
  soon: "Próximos vencimentos",
  waiting: "Aguardando retorno sem atualização",
  inactive: "Sem atualização",
  closing: "Executadas aguardando fechamento",
  missing: "Não encontradas na conferência",
  review: "Conferências para revisar",
});

function dayNumber(value) {
  const day = localDate(value);
  return day ? Date.parse(`${day}T00:00:00Z`) / 86400000 : NaN;
}

export function classifyAttention(demands, converters, preferences, now = new Date()) {
  const groups = Object.fromEntries(Object.keys(ATTENTION_LABELS).map(key => [key, []]));
  const today = dayNumber(now);
  demands.forEach(record => {
    const entry = { kind: "demand", record };
    if (!["Concluída", "Cancelada"].includes(record.status)) {
      const due = dayNumber(record.due_date);
      if (due < today) groups.overdue.push(entry);
      else if (due === today) groups.today.push(entry);
      else if (due > today && due - today <= preferences.dueDays) groups.soon.push(entry);
      // This measures time since the last record update, not time in a status.
      const last = dayNumber(record.updated_at || record.created_at);
      if (today - last >= preferences.inactiveDays) {
        groups.inactive.push(entry);
        if (record.status === "Aguardando retorno") groups.waiting.push(entry);
      }
    }
    if (isExecuted("demand", record) && record.manager_status !== "Concluído Faturado") groups.closing.push(entry);
  });
  converters.forEach(record => {
    if (isExecuted("converter", record)) groups.closing.push({ kind: "converter", record });
  });
  return groups;
}

export function addBillingAttention(groups, checks, items, demands, converters) {
  const records = new Map([
    ...demands.map(record => [`demand:${record.id}`, record]),
    ...converters.map(record => [`converter:${record.id}`, record]),
  ]);
  const headers = new Map(checks.map(check => [check.id, check]));
  items.forEach(item => {
    const check = headers.get(item.check_id);
    if (!check) return;
    const record = records.get(`${item.entity_kind}:${item.entity_id}`);
    // Deleted/reopened records cannot become live operational alerts.
    if (record && !isExecuted(item.entity_kind, record)) return;
    const snapshot = item.snapshot || {};
    const stale = record && (new Date(snapshot.updated_at).getTime() !== new Date(record.updated_at).getTime() ||
      snapshot.date !== serviceDate(item.entity_kind, record) ||
      snapshot.expected_cents !== moneyCents(record.billable_amount) ||
      serviceDate(item.entity_kind, record).slice(0, 7) !== localDate(check.competence).slice(0, 7));
    const entry = { kind: item.entity_kind, record: record || null, check, item,
      reason: stale ? "Registro alterado após a conferência; confira novamente." : item.reason };
    if (stale || ["divergent", "ambiguous", "unknown"].includes(item.result)) groups.review.push(entry);
    else if (item.result === "missing" && record) groups.missing.push(entry);
    if (record && !stale && item.result === "found") {
      groups.closing = groups.closing.filter(value => value.kind !== item.entity_kind || value.record.id !== record.id);
    }
  });
  return groups;
}
