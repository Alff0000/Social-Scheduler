/**
 * Minimal CSV building. No library: this project's exports are a handful of well-known
 * columns, and RFC 4180 quoting is a few lines, not a dependency.
 */

/** Quotes a field only when it needs it (contains a comma, quote, or newline) — matches
 *  what Excel/Sheets produce themselves, so a plain number or short label stays readable
 *  in a quick look at the raw file. */
function csvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(csvField).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvField).join(","));
  }
  // \r\n: the RFC 4180 line ending, and what stops Excel occasionally mis-detecting the
  // encoding on a file that only ever uses \n.
  return lines.join("\r\n") + "\r\n";
}
