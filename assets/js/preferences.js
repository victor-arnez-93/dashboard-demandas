import { state } from "./store.js";

export const DEFAULT_PREFERENCES = Object.freeze({
  dueDays: 3,
  inactiveDays: 7,
  dashboardPeriod: "30",
  analysisPeriod: "quarter",
  rankingRows: 5,
});

function key() {
  if (!state.user?.id || !state.activeCompanyId) throw new Error("Entre e selecione uma empresa.");
  return `fluux-preferences-v1:${state.user.id}:${state.activeCompanyId}`;
}

export function normalizePreferences(value = {}) {
  const integer = (name, min, max) => Number.isInteger(Number(value[name])) &&
    Number(value[name]) >= min && Number(value[name]) <= max ? Number(value[name]) : DEFAULT_PREFERENCES[name];
  return {
    dueDays: integer("dueDays", 1, 30),
    inactiveDays: integer("inactiveDays", 1, 90),
    dashboardPeriod: ["7", "30", "90"].includes(String(value.dashboardPeriod)) ? String(value.dashboardPeriod) : "30",
    analysisPeriod: ["week", "month", "quarter", "semester", "year"].includes(value.analysisPeriod) ? value.analysisPeriod : "quarter",
    rankingRows: integer("rankingRows", 3, 10),
  };
}

export function getPreferences() {
  try { return normalizePreferences(JSON.parse(localStorage.getItem(key()) || "{}")); }
  catch { return { ...DEFAULT_PREFERENCES }; }
}

export function savePreferences(value) {
  const result = normalizePreferences(value);
  localStorage.setItem(key(), JSON.stringify(result));
  return result;
}

export function resetPreferences() {
  localStorage.removeItem(key());
  return { ...DEFAULT_PREFERENCES };
}
