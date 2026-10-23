import { readManualProgress, readManualQueue } from "./lib/manual-review";

const queue = readManualQueue();
const progress = readManualProgress();
const byStatus = new Map<string, number>();

for (const item of progress) {
  byStatus.set(item.status, (byStatus.get(item.status) ?? 0) + 1);
}

console.log(`Queue items: ${queue.length}`);
console.log(`Processed items: ${progress.length}`);
console.log(`Remaining items: ${queue.length - progress.length}`);

for (const [status, count] of [...byStatus.entries()].sort()) {
  console.log(`${status}: ${count}`);
}
