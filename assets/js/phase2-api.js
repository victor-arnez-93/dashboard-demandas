import { getSupabase } from "./supabase-client.js";
import { state } from "./store.js";

export function companyId() {
  const id = state.activeCompanyId;
  if (!id || !state.user?.id) throw new Error("Selecione uma empresa e entre novamente.");
  return id;
}

export function migrationMissing(error) {
  return ["42P01", "42703", "PGRST202", "PGRST205"].includes(error?.code);
}

function checked(result, company = companyId()) {
  if (result.error) throw result.error;
  const rows = result.data || [];
  if (rows.some(row => row.company_id !== company)) {
    throw new Error("A resposta não pertence à empresa ativa.");
  }
  if (companyId() !== company) throw new Error("A empresa mudou durante o carregamento.");
  return rows;
}

export async function canWritePhase2() {
  if (state.profile?.is_super_admin) return true;
  const company = companyId();
  const result = await getSupabase().from("company_members")
    .select("company_id, member_role")
    .eq("company_id", company).eq("user_id", state.user.id).eq("is_active", true);
  return checked(result, company).some(row => ["owner", "admin", "member"].includes(row.member_role));
}

export async function readAll(table, configure = query => query) {
  const allowed = ["demands", "media_converter_records", "fluux_billing_checks", "fluux_billing_check_items"];
  if (!allowed.includes(table)) throw new Error("Recurso inválido.");
  const company = companyId();
  const rows = [];
  for (let offset = 0; ;) {
    const result = await configure(getSupabase().from(table).select("*").eq("company_id", company))
      .order("id", { ascending: true }).range(offset, offset + 499);
    const page = checked(result, company);
    if (!page.length) return rows;
    rows.push(...page);
    offset += page.length;
  }
}

export async function readEvents(kind, id, offset = 0) {
  const company = companyId();
  return checked(await getSupabase().from("fluux_timeline_events").select("*")
    .eq("company_id", company).eq("entity_kind", kind).eq("entity_id", id)
    .order("occurred_at", { ascending: true }).order("id", { ascending: true })
    .range(offset, offset + 39), company);
}

export async function phase2Rpc(name, args) {
  const company = companyId();
  const { data, error } = await getSupabase().rpc(name, args);
  if (error) throw error;
  if (companyId() !== company) throw new Error("A empresa mudou durante a operação. Recarregue a página.");
  return data;
}

export async function saveAmount(kind, record, cents) {
  const data = await phase2Rpc("fluux_set_service_amount", {
    p_kind: kind, p_id: record.id, p_amount: cents === null ? null : (cents / 100).toFixed(2),
    p_updated_at: record.updated_at || null,
  });
  if (!data || data.company_id !== companyId()) throw new Error("Valor salvo sem resposta válida da empresa.");
  const items = kind === "demand" ? state.demands : state.converters;
  const index = items.findIndex(item => item.id === data.id);
  if (index >= 0) items[index] = data;
  return data;
}
