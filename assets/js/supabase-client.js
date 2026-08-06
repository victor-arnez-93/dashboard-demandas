import { log } from "./logger.js";

const REMEMBER_KEY = "fluux-remember-session";
let client = null;

export function isConfigured() {
  const env = window.FLUUX_ENV || {};
  return Boolean(
    env.SUPABASE_URL?.startsWith("https://") &&
    env.SUPABASE_ANON_KEY &&
    !env.SUPABASE_ANON_KEY.startsWith("COLE_AQUI")
  );
}

export function shouldRememberSession() {
  return localStorage.getItem(REMEMBER_KEY) === "1";
}

function projectAuthPrefix() {
  try {
    const projectRef = new URL(window.FLUUX_ENV?.SUPABASE_URL || "").hostname.split(".")[0];
    return projectRef ? `sb-${projectRef}-auth-token` : "sb-";
  } catch {
    return "sb-";
  }
}

function clearAuthFrom(storage) {
  const prefix = projectAuthPrefix();
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && (key === prefix || key.startsWith(`${prefix}-`))) storage.removeItem(key);
  }
}

export function clearStoredAuthSessions() {
  localStorage.removeItem(REMEMBER_KEY);
  clearAuthFrom(localStorage);
  clearAuthFrom(sessionStorage);
  client = null;
}

export function configureAuthPersistence(remember) {
  if (remember) {
    localStorage.setItem(REMEMBER_KEY, "1");
    clearAuthFrom(sessionStorage);
  } else {
    localStorage.removeItem(REMEMBER_KEY);
    clearAuthFrom(localStorage);
  }
  client = null;
}

function authStorage() {
  return shouldRememberSession() ? localStorage : sessionStorage;
}

export function getSupabase() {
  if (client) return client;
  if (!window.supabase?.createClient) throw new Error("Biblioteca do Supabase não foi carregada.");
  if (!isConfigured()) throw new Error("Supabase ainda não foi configurado em assets/js/env.js.");

  const env = window.FLUUX_ENV;
  client = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: authStorage(),
    },
  });
  window.fluuxSupabase = client;
  log.success("SUPABASE", "Cliente inicializado.", {
    persistencia: shouldRememberSession() ? "dispositivo" : "sessão do navegador",
  });
  return client;
}

export async function requireSession() {
  const sb = getSupabase();
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    log.warn("AUTH", "Sessão ausente. Redirecionando para o login.");
    location.replace("index.html");
    return null;
  }
  log.success("AUTH", "Sessão autenticada.", { email: data.session.user.email });
  return data.session;
}
