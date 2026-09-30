/**
 * Minimal RFC 4180 CSV writer (REQ-35). Kept here rather than pulled in as a
 * dependency: reports are a handful of flat tables, and the escaping rules are
 * short enough to test directly.
 */
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((column) => escapeCsv(column.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsv(column.value(row))).join(','));
  }
  // Trailing newline: some tools drop the last row without it.
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Quotes a field when it contains a delimiter, quote or newline, doubling any
 * embedded quotes. A leading =, +, - or @ is prefixed with a quote character so
 * spreadsheets treat it as text instead of a formula.
 */
export function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
