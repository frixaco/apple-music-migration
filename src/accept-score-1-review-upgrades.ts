import { readFileSync, writeFileSync } from "node:fs";

type ManualOverride = {
  index: number;
  confidenceScore: number;
  rawScore: number;
  [key: string]: unknown;
};

const existingOverrides = JSON.parse(readFileSync("data/manual-overrides.json", "utf8")) as ManualOverride[];
const scoreOneOverrides = JSON.parse(readFileSync("reports/manual-review/score-1-deep-review-overrides.json", "utf8")) as ManualOverride[];
const acceptedRecoveryIndexes = new Set([
  16,
  56,
  143,
  160,
  178,
  205,
  230,
  260,
  264,
  289,
  290,
  291,
  394,
  409,
  508,
  566,
  682,
]);
const accepted = scoreOneOverrides.filter((override) => acceptedRecoveryIndexes.has(override.index));
const mergedByIndex = new Map(existingOverrides.map((override) => [override.index, override]));

for (const override of accepted) {
  mergedByIndex.set(override.index, {
    ...override,
    notes: [
      "accepted from conservative score 1 deep review",
      ...((override.notes as string[] | undefined) ?? []),
    ],
  });
}

const merged = [...mergedByIndex.values()].sort((left, right) => left.index - right.index);
const held = scoreOneOverrides.filter((override) => !accepted.some((acceptedOverride) => acceptedOverride.index === override.index));

writeFileSync("data/manual-overrides.json", `${JSON.stringify(merged, null, 2)}\n`);
writeFileSync("reports/manual-review/score-1-held-overrides.json", `${JSON.stringify(held, null, 2)}\n`);

console.log(`Accepted score 1 recoveries: ${accepted.length}`);
console.log(`Manual overrides total: ${merged.length}`);
console.log(`Held score 1 suggestions: ${held.length}`);
