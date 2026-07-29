import { log } from "./logger.js";

let client = null;

export function isConfigured() {
  const env = window.FLUUX_ENV || {};
  return Boolean(
    env.SUPABASE_URL?.startsWith("https://") &&
    env.SUPABASE_ANON_KEY &&
    !env.SUPABASE_ANON_KEY.startsWith("COLE_AQUI")
  );
}

export function getSupabase() {
  if (client) return client;
  if (!window.supabase?.createClient) throw new Error("Biblioteca do Supabase não foi carregada.");
  if (!isConfigured()) throw new Error("Supabase ainda não foi configurado em assets/js/env.js.");

  const env = window.FLUUX_ENV;
  client = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  window.fluuxSupabase = client;
  log.success("SUPABASE", "Cliente inicializado.");
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
