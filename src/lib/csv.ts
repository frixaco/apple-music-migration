export function toCsv<T>(items: T[], columns: Array<keyof T & string>): string {
  const rows = items.map((item) => columns.map((column) => csvCell(item[column])).join(","));

  return `${columns.join(",")}\n${rows.join("\n")}\n`;
}

function csvCell(value: unknown): string {
  const stringValue = Array.isArray(value) ? value.join(" | ") : String(value ?? "");

  return `"${stringValue.replaceAll("\"", "\"\"")}"`;
}
