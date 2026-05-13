import { readFileSync } from "node:fs";
import { upsertManualProgress, type ManualStatus } from "./manual-progress";

type ManualQueueItem = {
  index: number;
  youtubeTitle: string;
};

const validStatuses = new Set<ManualStatus>([
  "found_not_added",
  "added",
  "not_found",
  "unavailable",
  "skip_cover",
  "skip_mix_or_longform",
  "needs_user_decision",
]);
const indexArg = readFlag("--index");
const status = readFlag("--status") as ManualStatus | null;
const notes = readFlag("--notes") ?? "";

if (!indexArg || !status) {
  throw new Error("Usage: bun run manual:record -- --index <youtube index> --status <status> [--notes \"...\"]");
}

if (!validStatuses.has(status)) {
  throw new Error(`Invalid status "${status}".`);
}

const targetIndex = Number(indexArg);

if (!Number.isInteger(targetIndex)) {
  throw new Error("--index must be an integer.");
}

const queue = JSON.parse(readFileSync("data/manual-review/queue.json", "utf8")) as ManualQueueItem[];
const item = queue.find((candidate) => candidate.index === targetIndex);

if (!item) {
  throw new Error(`Could not find queue item ${targetIndex}.`);
}

upsertManualProgress({
  index: item.index,
  status,
  youtubeTitle: item.youtubeTitle,
  appleSongId: "",
  appleName: "",
  appleArtist: "",
  appleAlbum: "",
  appleDurationSeconds: null,
  appleUrl: "",
  reviewerNotes: notes,
  processedAt: new Date().toISOString(),
});

console.log(`Recorded #${item.index}: ${status}`);

function readFlag(name: string): string | null {
  const index = Bun.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return Bun.argv[index + 1] ?? null;
}
