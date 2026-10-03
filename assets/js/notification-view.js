import { state } from "./store.js";
import { getSupabase } from "./supabase-client.js";
import { companyId } from "./phase2-api.js";
import { showToast } from "./ui.js";

export async function openLinkedRecord(kind, render) {
  const id = new URLSearchParams(location.search).get("view");
  if (!id) return;
  const company = companyId();
  try {
    const table = kind === "demand" ? "demands" : "media_converter_records";
    const { data, error } = await getSupabase().from(table).select("*").eq("company_id", company).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data || data.company_id !== company || companyId() !== company) throw new Error("Registro indisponível na empresa ativa.");
    const records = kind === "demand" ? state.demands : state.converters;
    const index = records.findIndex(record => record.id === id);
    if (index < 0) records.push(data); else records[index] = data;
    render(data);
  } catch (error) { showToast(error.message || "Não foi possível abrir o registro.", "info"); }
}
