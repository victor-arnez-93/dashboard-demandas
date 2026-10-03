export const RESULT_LABELS = Object.freeze({
  found: "Encontrado na planilha",
  missing: "Executado e não encontrado",
  unknown: "Não reconhecido",
  divergent: "Divergência de valor",
  ambiguous: "Revisão manual",
});

export function html(value = "") {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function normalizeKey(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

export function moneyCents(value) {
  if (value === null || value === undefined || value === "") return null;
  let number;
  if (typeof value === "number") {
    number = value;
  } else {
    let text = String(value).trim().replace(/^R\$\s*/, "").replace(/\s/g, "");
    if (!text) return null;
    if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(text)) {
      text = text.replaceAll(".", "").replace(",", ".");
    } else if (/^\d+(?:,\d{1,2})?$/.test(text)) {
      text = text.replace(",", ".");
    } else if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
      throw new Error("Valor inválido. Use, por exemplo, 1.234,56 ou 1234,56.");
    }
    number = Number(text);
  }
  const cents = Math.round(number * 100);
  if (!Number.isFinite(number) || number < 0 || number > 999999999999.99 ||
    !Number.isSafeInteger(cents) || Math.abs(number * 100 - cents) > Math.max(1e-7, Number.EPSILON * Math.abs(number * 100) * 2)) {
    throw new Error("Informe um valor não negativo com até duas casas decimais.");
  }
  return cents;
}

export function money(cents) {
  return cents === null || cents === undefined ? "Não informado" :
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
}

export function localDate(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function serviceDate(kind, record) {
  return kind === "demand" ? localDate(record.execution_date || record.completed_at) : localDate(record.service_date);
}

export function isExecuted(kind, record) {
  if (kind === "demand") return record.status !== "Cancelada" && Boolean(record.execution_date || record.status === "Concluída");
  return ["CONCLUÍDO", "CONCLUÍDA", "CONCLUIDO", "CONCLUIDA", "FINALIZADO", "FINALIZADA"].includes(normalizeKey(record.status));
}

export function executionRows(kind, records, competence) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(competence)) throw new Error("Selecione uma competência válida.");
  return records.filter(record => isExecuted(kind, record) && serviceDate(kind, record).slice(0, 7) === competence);
}

export function dateLabel(value) {
  const day = localDate(value);
  return day ? day.split("-").reverse().join("/") : "—";
}

export function identifierFromCell(cell) {
  if (!cell || cell.v === undefined || cell.v === null || cell.v === "") return "";
  if (cell.f) throw new Error("O identificador contém fórmula. Use uma coluna de valores/texto.");
  if (cell.t === "e" || cell.t === "b" || cell.t === "d") throw new Error("Tipo de identificador inválido.");
  if (typeof cell.v === "number") {
    if (!Number.isSafeInteger(cell.v) || cell.v < 0) throw new Error("Identificador numérico inválido ou sem precisão. Use texto.");
    const formatted = String(cell.w || "").trim();
    if (/^\d+$/.test(formatted)) return formatted;
  }
  const value = String(cell.v).trim();
  if (value.length > 240) throw new Error("Identificador muito longo.");
  return value;
}

export function sheetRows(XLSX, sheet, headerRow, identifierColumn, amountColumn, lastRow) {
  const range = XLSX.utils.decode_range(sheet["!fullref"] || sheet["!ref"] || "A1");
  const last = lastRow ? Number(lastRow) - 1 : range.e.r;
  const header = Number(headerRow) - 1;
  if (!Number.isInteger(header) || header < 0 || header > 99 || !Number.isInteger(last) ||
    last <= header || last > range.e.r || last - header > 5000 || last >= 5101 || range.e.c > 199) {
    throw new Error("Use cabeçalho nas primeiras 100 linhas, até 200 colunas e no máximo 5000 linhas de dados.");
  }
  const idColumn = Number(identifierColumn);
  const valueColumn = amountColumn === "" ? null : Number(amountColumn);
  if (!Number.isInteger(idColumn) || idColumn < 0 || idColumn > range.e.c ||
    (valueColumn !== null && (!Number.isInteger(valueColumn) || valueColumn < 0 || valueColumn > range.e.c || valueColumn === idColumn))) {
    throw new Error("Selecione colunas diferentes para identificador e valor.");
  }
  const rows = [];
  for (let index = header + 1; index <= last; index++) {
    const address = column => XLSX.utils.encode_cell({ r: index, c: column });
    const identifierCell = sheet[address(idColumn)];
    const valueCell = valueColumn === null ? null : sheet[address(valueColumn)];
    let any = false;
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = sheet[address(col)];
      if (cell?.f || (cell?.v !== undefined && cell.v !== null && String(cell.v).trim() !== "")) { any = true; break; }
    }
    if (!any) continue;
    try {
      const identifier = identifierFromCell(identifierCell);
      if (!identifier) throw new Error("Identificador vazio. Ajuste o intervalo para excluir títulos/totais.");
      if (valueCell?.f) throw new Error("O valor contém fórmula. Use uma coluna com valores, sem fórmula.");
      if (valueCell && ["e", "b", "d"].includes(valueCell.t)) throw new Error("Tipo de valor inválido.");
      rows.push({ row_number: index + 1, identifier, amount_cents: valueCell ? moneyCents(valueCell.v) : null });
    } catch (error) {
      throw new Error(`Linha ${index + 1}: ${error.message}`);
    }
  }
  if (!rows.length) throw new Error("Nenhuma linha de dados encontrada no intervalo selecionado.");
  return rows;
}
