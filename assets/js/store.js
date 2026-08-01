import { getSupabase } from "./supabase-client.js";
import { log } from "./logger.js";

export const CATALOG_TABLES = Object.freeze({
  managers: "managers",
  responsibles: "responsibles",
  departments: "departments",
  categories: "demand_categories",
  locations: "service_locations",
});

export const state = {
  session: null,
  user: null,
  profile: null,
  activeCompanyId: null,
  company: null,
  settings: null,
  demands: [],
  converters: [],
  catalogs: {
    managers: [],
    responsibles: [],
    departments: [],
    categories: [],
    locations: [],
  },
};

const defaultSettings = companyId => ({
  company_id: companyId,
  id: 1,
  app_name: "FLUUX",
  app_subtitle: "Organização de Demandas",
  weather_city: window.FLUUX_ENV.DEFAULT_CITY,
  weather_latitude: window.FLUUX_ENV.DEFAULT_LATITUDE,
  weather_longitude: window.FLUUX_ENV.DEFAULT_LONGITUDE,
});

function emptyCatalogs() {
  return {
    managers: [],
    responsibles: [],
    departments: [],
    categories: [],
    locations: [],
  };
}

export function resetStore() {
  state.session = null;
  state.user = null;
  state.profile = null;
  state.activeCompanyId = null;
  state.company = null;
  state.settings = null;
  state.demands = [];
  state.converters = [];
  state.catalogs = emptyCatalogs();
}

function requireActiveCompanyId() {
  const companyId = state.activeCompanyId || state.profile?.active_company_id;
  if (!companyId) {
    throw new Error("Seu perfil não possui uma empresa ativa. Verifique o provisionamento do usuário no Supabase.");
  }
  return companyId;
}

function ensureResult(result) {
  if (result.error) throw result.error;
  return result.data || [];
}

function ensureCompanyRows(result, resource) {
  const rows = ensureResult(result);
  const companyId = requireActiveCompanyId();
  if (rows.some(row => row.company_id !== companyId)) {
    throw new Error(`O Supabase retornou ${resource} de outra empresa. O carregamento foi interrompido por segurança.`);
  }
  return rows;
}

function ensureCompanyRecord(result, resource) {
  if (result.error) throw result.error;
  const record = result.data;
  if (!record) throw new Error(`O Supabase não retornou ${resource}.`);
  if (record.company_id !== requireActiveCompanyId()) {
    throw new Error(`O Supabase retornou ${resource} de outra empresa. A operação foi interrompida por segurança.`);
  }
  return record;
}

export async function initializeStore(session) {
  resetStore();
  state.session = session;
  state.user = session.user;
  const sb = getSupabase();
  log.info("DADOS", "Carregando perfil e empresa ativa...");

  const profileResult = await sb
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();

  if (profileResult.error) throw profileResult.error;
  if (!profileResult.data) {
    throw new Error("Seu perfil empresarial ainda não foi provisionado. Verifique o trigger de criação de usuários no Supabase.");
  }

  state.profile = profileResult.data;
  state.activeCompanyId = state.profile.active_company_id;
  const companyId = requireActiveCompanyId();

  log.info("DADOS", "Carregando dados da empresa ativa...", { companyId });

  const [
    companyResult,
    settingsResult,
    demandsResult,
    convertersResult,
    managersResult,
    responsiblesResult,
    departmentsResult,
    categoriesResult,
    locationsResult,
  ] = await Promise.all([
    sb.from("companies").select("*").eq("id", companyId).maybeSingle(),
    sb.from("app_settings").select("*").eq("company_id", companyId).eq("id", 1).maybeSingle(),
    sb.from("demands").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    sb.from("media_converter_records").select("*").eq("company_id", companyId).order("service_date", { ascending: false }).order("created_at", { ascending: false }),
    sb.from("managers").select("*").eq("company_id", companyId).order("is_active", { ascending: false }).order("name"),
    sb.from("responsibles").select("*").eq("company_id", companyId).order("is_active", { ascending: false }).order("name"),
    sb.from("departments").select("*").eq("company_id", companyId).order("is_active", { ascending: false }).order("name"),
    sb.from("demand_categories").select("*").eq("company_id", companyId).order("is_active", { ascending: false }).order("name"),
    sb.from("service_locations").select("*").eq("company_id", companyId).order("is_active", { ascending: false }).order("name"),
  ]);

  if (companyResult.error) throw companyResult.error;
  if (!companyResult.data) {
    throw new Error("A empresa ativa do perfil não está disponível para este usuário.");
  }
  state.company = companyResult.data;

  if (settingsResult.error) throw settingsResult.error;

  if (!settingsResult.data) {
    const settingsUpsert = await sb
      .from("app_settings")
      .upsert(defaultSettings(companyId), { onConflict: "company_id,id" })
      .select()
      .single();
    state.settings = ensureCompanyRecord(settingsUpsert, "as configurações da empresa");
  } else {
    state.settings = ensureCompanyRecord(settingsResult, "as configurações da empresa");
  }

  state.demands = ensureCompanyRows(demandsResult, "demandas");
  state.converters = ensureCompanyRows(convertersResult, "registros de conversores");
  state.catalogs.managers = ensureCompanyRows(managersResult, "gestores");
  state.catalogs.responsibles = ensureCompanyRows(responsiblesResult, "responsáveis");
  state.catalogs.departments = ensureCompanyRows(departmentsResult, "departamentos");
  state.catalogs.categories = ensureCompanyRows(categoriesResult, "categorias");
  state.catalogs.locations = ensureCompanyRows(locationsResult, "locais");

  log.success("DADOS", "Dados reais carregados.", {
    empresa: state.company.name,
    demandas: state.demands.length,
    conversores: state.converters.length,
    cadastros: Object.values(state.catalogs).reduce((total, items) => total + items.length, 0),
  });
  return state;
}

export function demandCode(demand) {
  return `FLX-${String(demand.demand_number || 0).padStart(4, "0")}`;
}

export function converterCode(record) {
  return `CNV-${String(record.record_number || 0).padStart(4, "0")}`;
}

export function effectiveStatus(demand) {
  if (["Concluída", "Cancelada"].includes(demand.status)) return demand.status;
  if (demand.due_date && new Date(`${demand.due_date}T23:59:59`) < new Date()) return "Atrasada";
  return demand.status;
}

export function activeCatalog(type) {
  return (state.catalogs[type] || []).filter(item => item.is_active);
}

export function catalogItem(type, id) {
  return (state.catalogs[type] || []).find(item => item.id === id) || null;
}

export async function saveDemand(payload, id = null) {
  const sb = getSupabase();
  const companyId = requireActiveCompanyId();
  const normalized = {
    title: payload.title,
    description: payload.description,
    requester: payload.requester || null,
    responsible: payload.responsible,
    responsible_id: payload.responsible_id || null,
    manager: payload.manager,
    manager_id: payload.manager_id || null,
    department: payload.department || null,
    department_id: payload.department_id || null,
    category: payload.category,
    category_id: payload.category_id || null,
    priority: payload.priority,
    status: payload.status,
    start_date: payload.start_date,
    due_date: payload.due_date,
    estimated_hours: Number(payload.estimated_hours || 0),
    actual_hours: Number(payload.actual_hours || 0),
    tags: payload.tags || [],
    notes: payload.notes || null,
    completed_at: payload.status === "Concluída" ? (payload.completed_at || new Date().toISOString()) : null,
    updated_by: state.user.id,
  };

  let result;
  if (id) {
    result = await sb.from("demands").update(normalized).eq("company_id", companyId).eq("id", id).select().single();
  } else {
    result = await sb.from("demands").insert({ ...normalized, company_id: companyId, created_by: state.user.id }).select().single();
  }
  const savedDemand = ensureCompanyRecord(result, "a demanda");

  const index = state.demands.findIndex(item => item.id === savedDemand.id);
  if (index >= 0) state.demands[index] = savedDemand;
  else state.demands.unshift(savedDemand);
  log.success("DEMANDAS", id ? "Demanda atualizada." : "Demanda criada.", { id: savedDemand.id });
  return savedDemand;
}

export async function removeDemand(id) {
  const { error } = await getSupabase().from("demands").delete().eq("company_id", requireActiveCompanyId()).eq("id", id);
  if (error) throw error;
  state.demands = state.demands.filter(item => item.id !== id);
  log.success("DEMANDAS", "Demanda excluída.", { id });
}

export async function saveCatalog(type, payload, id = null) {
  const table = CATALOG_TABLES[type];
  if (!table) throw new Error("Tipo de cadastro inválido.");
  const normalized = {
    name: payload.name,
    is_active: payload.is_active ?? true,
    updated_by: state.user.id,
  };
  if (type === "locations") normalized.description = payload.description || null;

  const sb = getSupabase();
  const companyId = requireActiveCompanyId();
  const result = id
    ? await sb.from(table).update(normalized).eq("company_id", companyId).eq("id", id).select().single()
    : await sb.from(table).insert({ ...normalized, company_id: companyId, created_by: state.user.id }).select().single();
  const savedCatalog = ensureCompanyRecord(result, "o cadastro");

  const items = state.catalogs[type];
  const index = items.findIndex(item => item.id === savedCatalog.id);
  if (index >= 0) items[index] = savedCatalog;
  else items.push(savedCatalog);
  items.sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name, "pt-BR"));
  log.success("CADASTROS", id ? "Cadastro atualizado." : "Cadastro criado.", { tipo: type, id: savedCatalog.id });
  return savedCatalog;
}

export async function removeCatalog(type, id) {
  const table = CATALOG_TABLES[type];
  if (!table) throw new Error("Tipo de cadastro inválido.");
  const { error } = await getSupabase()
    .from(table)
    .delete()
    .eq("company_id", requireActiveCompanyId())
    .eq("id", id);
  if (error) throw error;
  state.catalogs[type] = (state.catalogs[type] || []).filter(item => item.id !== id);
  log.success("CADASTROS", "Cadastro excluído.", { tipo: type, id });
}

export async function setCatalogActive(type, id, isActive) {
  return saveCatalog(type, {
    ...catalogItem(type, id),
    name: catalogItem(type, id)?.name,
    description: catalogItem(type, id)?.description,
    is_active: isActive,
  }, id);
}

export async function findOrCreateCatalog(type, name, description = null) {
  const normalized = String(name || "").trim();
  if (!normalized) return null;
  const existing = (state.catalogs[type] || []).find(item => item.name.localeCompare(normalized, "pt-BR", { sensitivity: "accent" }) === 0);
  if (existing) {
    if (!existing.is_active) return setCatalogActive(type, existing.id, true);
    return existing;
  }
  return saveCatalog(type, { name: normalized, description, is_active: true });
}

export async function saveConverter(payload, id = null) {
  const companyId = requireActiveCompanyId();
  const normalized = {
    service_date: payload.service_date,
    location_id: payload.location_id || null,
    location_name: payload.location_name,
    point_reference: payload.point_reference || null,
    service_type: payload.service_type,
    conversion_direction: payload.conversion_direction || null,
    quantity_replaced: Number(payload.quantity_replaced || 1),
    issue_reason: payload.issue_reason || null,
    status: payload.status,
    responsible_id: payload.responsible_id || null,
    responsible_name: payload.responsible_name || null,
    notes: payload.notes || null,
    updated_by: state.user.id,
  };
  const sb = getSupabase();
  const result = id
    ? await sb.from("media_converter_records").update(normalized).eq("company_id", companyId).eq("id", id).select().single()
    : await sb.from("media_converter_records").insert({ ...normalized, company_id: companyId, created_by: state.user.id }).select().single();
  const savedConverter = ensureCompanyRecord(result, "o registro de conversor");

  const index = state.converters.findIndex(item => item.id === savedConverter.id);
  if (index >= 0) state.converters[index] = savedConverter;
  else state.converters.unshift(savedConverter);
  state.converters.sort((a, b) => String(b.service_date).localeCompare(String(a.service_date)) || String(b.created_at).localeCompare(String(a.created_at)));
  log.success("CONVERSORES", id ? "Registro atualizado." : "Registro criado.", { id: savedConverter.id });
  return savedConverter;
}

export async function removeConverter(id) {
  const { error } = await getSupabase().from("media_converter_records").delete().eq("company_id", requireActiveCompanyId()).eq("id", id);
  if (error) throw error;
  state.converters = state.converters.filter(item => item.id !== id);
  log.success("CONVERSORES", "Registro excluído.", { id });
}

export async function saveProfile(patch) {
  const payload = { ...patch };
  delete payload.id;
  delete payload.active_company_id;
  delete payload.is_super_admin;
  const { data, error } = await getSupabase().from("profiles").update(payload).eq("id", state.user.id).select().single();
  if (error) throw error;
  state.profile = data;
  log.success("PERFIL", "Perfil salvo.");
  return data;
}

export async function saveSettings(patch) {
  const companyId = requireActiveCompanyId();
  const result = await getSupabase()
    .from("app_settings")
    .upsert({ ...patch, company_id: companyId, id: 1 }, { onConflict: "company_id,id" })
    .select()
    .single();
  state.settings = ensureCompanyRecord(result, "as configurações da empresa");
  log.success("CONFIG", "Configurações da empresa salvas.");
  return state.settings;
}

export async function uploadAvatar(file) {
  if (!file) return state.profile.avatar_url;
  if (file.size > 2 * 1024 * 1024) throw new Error("A foto deve ter no máximo 2 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${state.user.id}/avatar-${Date.now()}.${extension}`;
  const sb = getSupabase();
  const { error } = await sb.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = sb.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}
