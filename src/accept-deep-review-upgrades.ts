import { readFileSync, writeFileSync } from "node:fs";

type MatchReportItem = {
  index: number;
  confidenceScore: number;
};

type ManualOverride = {
  index: number;
  confidenceScore: number;
  rawScore: number;
  notes: string[];
  [key: string]: unknown;
};

const report = JSON.parse(readFileSync("data/processed/youtube_apple_music_confidence.json", "utf8")) as MatchReportItem[];
const deepOverrides = JSON.parse(readFileSync("reports/manual-review/deep-review-overrides.json", "utf8")) as ManualOverride[];
const existingOverrides = JSON.parse(readFileSync("data/manual-overrides.json", "utf8")) as ManualOverride[];
const reportByIndex = new Map(report.map((item) => [item.index, item]));
const acceptedDeepOverrides = deepOverrides
  .filter((override) => {
    const current = reportByIndex.get(override.index);

    if (!current || override.confidenceScore <= current.confidenceScore) {
      return false;
    }

    return override.confidenceScore === 5 || (override.confidenceScore === 4 && override.rawScore >= 0.9);
  })
  .map((override) => ({
    ...override,
    notes: [
      "accepted from conservative deep score 2-4 review",
      ...override.notes,
    ],
  }));
const mergedByIndex = new Map(existingOverrides.map((override) => [override.index, override]));

for (const override of acceptedDeepOverrides) {
  mergedByIndex.set(override.index, override);
}

const merged = [...mergedByIndex.values()].sort((left, right) => left.index - right.index);
const held = deepOverrides.filter((override) => !acceptedDeepOverrides.some((accepted) => accepted.index === override.index));

writeFileSync("data/manual-overrides.json", `${JSON.stringify(merged, null, 2)}\n`);
writeFileSync("reports/manual-review/deep-review-held-overrides.json", `${JSON.stringify(held, null, 2)}\n`);

console.log(`Accepted deep-review upgrades: ${acceptedDeepOverrides.length}`);
console.log(`Manual overrides total: ${merged.length}`);
console.log(`Held deep-review suggestions: ${held.length}`);
