import { readFileSync } from "node:fs";
import { confidenceLabel, manualOverridesPath, matchReportCsvPath, matchReportPath, readMatchReport, writeMatchReport, type MatchReportItem } from "./lib/match-report";

type ManualOverride = Pick<MatchReportItem, "index" | "confidenceScore"> & Partial<MatchReportItem>;

const report = readMatchReport();
const overrides = JSON.parse(readFileSync(manualOverridesPath, "utf8")) as ManualOverride[];
const reportByIndex = new Map(report.map((item) => [item.index, item]));

for (const override of overrides) {
  const existing = reportByIndex.get(override.index);

  if (!existing) {
    throw new Error(`Manual override references missing report index ${override.index}.`);
  }

  reportByIndex.set(override.index, {
    ...existing,
    ...override,
    confidenceLabel: confidenceLabel(override.confidenceScore),
    notes: override.notes ?? existing.notes,
    searchQueries: override.searchQueries ?? existing.searchQueries,
  });
}

writeMatchReport([...reportByIndex.values()]);

console.log(`Applied manual overrides: ${overrides.length}`);
console.log(`Wrote ${matchReportPath}`);
console.log(`Wrote ${matchReportCsvPath}`);
