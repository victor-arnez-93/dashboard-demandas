import { getSupabase } from "./supabase-client.js";
import { log } from "./logger.js";

export const state = {
  session: null,
  user: null,
  profile: null,
  settings: null,
  demands: [],
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

export async function initializeStore(session) {
  state.session = session;
  state.user = session.user;
  const sb = getSupabase();
  log.info("DADOS", "Carregando perfil, configurações e demandas...");

  const [profileResult, settingsResult, demandsResult] = await Promise.all([
    sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle(),
    sb.from("app_settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("demands").select("*").order("created_at", { ascending: false }),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (settingsResult.error) throw settingsResult.error;
  if (demandsResult.error) throw demandsResult.error;

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

  state.demands = demandsResult.data || [];
  log.success("DADOS", "Dados reais carregados.", { demandas: state.demands.length });
  return state;
}

export function demandCode(demand) {
  return `FLX-${String(demand.demand_number || 0).padStart(4, "0")}`;
}

export function effectiveStatus(demand) {
  if (["Concluída", "Cancelada"].includes(demand.status)) return demand.status;
  if (demand.due_date && new Date(`${demand.due_date}T23:59:59`) < new Date()) return "Atrasada";
  return demand.status;
}

export async function saveDemand(payload, id = null) {
  const sb = getSupabase();
  const normalized = {
    title: payload.title,
    description: payload.description,
    requester: payload.requester || null,
    responsible: payload.responsible,
    manager: payload.manager,
    department: payload.department || null,
    category: payload.category,
    priority: payload.priority,
    status: payload.status,
    start_date: payload.start_date,
    due_date: payload.due_date,
    estimated_hours: payload.estimated_hours || 0,
    actual_hours: payload.actual_hours || 0,
    tags: payload.tags || [],
    notes: payload.notes || null,
    completed_at: payload.status === "Concluída" ? new Date().toISOString() : null,
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
