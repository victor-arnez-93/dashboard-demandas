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

const defaultProfile = user => ({
  id: user.id,
  full_name: user.user_metadata?.full_name || window.FLUUX_ENV.DEFAULT_USER_NAME,
  role: user.user_metadata?.role || window.FLUUX_ENV.DEFAULT_ROLE,
  avatar_url: user.user_metadata?.avatar_url || null,
  theme: "dark",
});

const defaultSettings = {
  id: 1,
  app_name: "FLUUX",
  app_subtitle: "Organização de Demandas",
  weather_city: window.FLUUX_ENV.DEFAULT_CITY,
  weather_latitude: window.FLUUX_ENV.DEFAULT_LATITUDE,
  weather_longitude: window.FLUUX_ENV.DEFAULT_LONGITUDE,
};

function ensureResult(result) {
  if (result.error) throw result.error;
  return result.data || [];
}

export async function initializeStore(session) {
  state.session = session;
  state.user = session.user;
  const sb = getSupabase();
  log.info("DADOS", "Carregando perfil, configurações, demandas, cadastros e conversores...");

  const [
    profileResult,
    settingsResult,
    demandsResult,
    convertersResult,
    managersResult,
    responsiblesResult,
    departmentsResult,
    categoriesResult,
    locationsResult,
  ] = await Promise.all([
    sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle(),
    sb.from("app_settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("demands").select("*").order("created_at", { ascending: false }),
    sb.from("media_converter_records").select("*").order("service_date", { ascending: false }).order("created_at", { ascending: false }),
    sb.from("managers").select("*").order("is_active", { ascending: false }).order("name"),
    sb.from("responsibles").select("*").order("is_active", { ascending: false }).order("name"),
    sb.from("departments").select("*").order("is_active", { ascending: false }).order("name"),
    sb.from("demand_categories").select("*").order("is_active", { ascending: false }).order("name"),
    sb.from("service_locations").select("*").order("is_active", { ascending: false }).order("name"),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (settingsResult.error) throw settingsResult.error;

  if (!profileResult.data) {
    const { data, error } = await sb.from("profiles").upsert(defaultProfile(session.user)).select().single();
    if (error) throw error;
    state.profile = data;
  } else {
    state.profile = profileResult.data;
  }

  if (!settingsResult.data) {
    const { data, error } = await sb.from("app_settings").upsert(defaultSettings).select().single();
    if (error) throw error;
    state.settings = data;
  } else {
    state.settings = settingsResult.data;
  }

  state.demands = ensureResult(demandsResult);
  state.converters = ensureResult(convertersResult);
  state.catalogs.managers = ensureResult(managersResult);
  state.catalogs.responsibles = ensureResult(responsiblesResult);
  state.catalogs.departments = ensureResult(departmentsResult);
  state.catalogs.categories = ensureResult(categoriesResult);
  state.catalogs.locations = ensureResult(locationsResult);

  log.success("DADOS", "Dados reais carregados.", {
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
    result = await sb.from("demands").update(normalized).eq("id", id).select().single();
  } else {
    result = await sb.from("demands").insert({ ...normalized, created_by: state.user.id }).select().single();
  }
  if (result.error) throw result.error;

  const index = state.demands.findIndex(item => item.id === result.data.id);
  if (index >= 0) state.demands[index] = result.data;
  else state.demands.unshift(result.data);
  log.success("DEMANDAS", id ? "Demanda atualizada." : "Demanda criada.", { id: result.data.id });
  return result.data;
}

export async function removeDemand(id) {
  const { error } = await getSupabase().from("demands").delete().eq("id", id);
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
  const result = id
    ? await sb.from(table).update(normalized).eq("id", id).select().single()
    : await sb.from(table).insert({ ...normalized, created_by: state.user.id }).select().single();
  if (result.error) throw result.error;

  const items = state.catalogs[type];
  const index = items.findIndex(item => item.id === result.data.id);
  if (index >= 0) items[index] = result.data;
  else items.push(result.data);
  items.sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name, "pt-BR"));
  log.success("CADASTROS", id ? "Cadastro atualizado." : "Cadastro criado.", { tipo: type, id: result.data.id });
  return result.data;
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
    ? await sb.from("media_converter_records").update(normalized).eq("id", id).select().single()
    : await sb.from("media_converter_records").insert({ ...normalized, created_by: state.user.id }).select().single();
  if (result.error) throw result.error;

  const index = state.converters.findIndex(item => item.id === result.data.id);
  if (index >= 0) state.converters[index] = result.data;
  else state.converters.unshift(result.data);
  state.converters.sort((a, b) => String(b.service_date).localeCompare(String(a.service_date)) || String(b.created_at).localeCompare(String(a.created_at)));
  log.success("CONVERSORES", id ? "Registro atualizado." : "Registro criado.", { id: result.data.id });
  return result.data;
}

export async function removeConverter(id) {
  const { error } = await getSupabase().from("media_converter_records").delete().eq("id", id);
  if (error) throw error;
  state.converters = state.converters.filter(item => item.id !== id);
  log.success("CONVERSORES", "Registro excluído.", { id });
}

export async function saveProfile(patch) {
  const payload = { id: state.user.id, ...patch };
  const { data, error } = await getSupabase().from("profiles").upsert(payload).select().single();
  if (error) throw error;
  state.profile = data;
  log.success("PERFIL", "Perfil salvo.");
  return data;
}

export async function saveSettings(patch) {
  const { data, error } = await getSupabase().from("app_settings").upsert({ id: 1, ...patch }).select().single();
  if (error) throw error;
  state.settings = data;
  log.success("CONFIG", "Configurações globais salvas.");
  return data;
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
