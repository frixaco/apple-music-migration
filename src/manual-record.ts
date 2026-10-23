import { readQueueItemFromIndexFlag, upsertManualProgress, type ManualStatus } from "./lib/manual-review";
import { readFlag } from "./lib/util";

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

const item = readQueueItemFromIndexFlag();

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
