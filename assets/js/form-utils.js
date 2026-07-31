const KEEP_UPPER = new Set(["UTP", "TI", "PDF", "SLA", "IP", "LAN", "WAN", "VLAN", "RJ45", "GBIC", "SFP", "UPS", "ONU", "OLT"]);
const LOWER_CONNECTORS = new Set(["da", "de", "do", "das", "dos", "e", "em", "para", "por", "com"]);

export function cleanSpaces(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function preserveToken(token) {
  const bare = token.replace(/[^\p{L}\p{N}]/gu, "");
  if (KEEP_UPPER.has(bare.toUpperCase())) return token.replace(bare, bare.toUpperCase());
  if (/^[A-Z0-9]{2,6}$/.test(bare)) return token;
  return null;
}

export function smartName(value = "") {
  const normalized = cleanSpaces(value);
  return normalized.split(" ").map((word, index) => {
    const preserved = preserveToken(word);
    if (preserved) return preserved;
    const lower = word.toLocaleLowerCase("pt-BR");
    if (index > 0 && LOWER_CONNECTORS.has(lower)) return lower;
    return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
  }).join(" ");
}

export function smartSentence(value = "") {
  const normalized = cleanSpaces(value);
  if (!normalized) return "";
  const words = normalized.split(" ").map(word => preserveToken(word) || word);
  const text = words.join(" ");
  return text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);
}

export function normalizeDecimalInput(value = "") {
  const normalized = String(value).replace(",", ".").replace(/[^0-9.]/g, "");
  const [integer = "", ...decimals] = normalized.split(".");
  return decimals.length ? `${integer}.${decimals.join("").slice(0, 2)}` : integer;
}

export function numberValue(value = "") {
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function bindSmartText(input, mode = "sentence") {
  if (!input) return;
  input.addEventListener("blur", () => {
    input.value = mode === "name" ? smartName(input.value) : smartSentence(input.value);
  });
}

export function bindNumericOnly(input, { integer = false, min = 0 } = {}) {
  if (!input) return;
  input.addEventListener("input", () => {
    if (integer) input.value = input.value.replace(/\D/g, "");
    else input.value = normalizeDecimalInput(input.value);
  });
  input.addEventListener("blur", () => {
    if (!input.value) return;
    const value = integer ? Number.parseInt(input.value, 10) : numberValue(input.value);
    input.value = String(Math.max(min, Number.isFinite(value) ? value : min));
  });
}
