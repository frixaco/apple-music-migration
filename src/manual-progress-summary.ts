import { readFileSync } from "node:fs";

type ManualProgressItem = {
  index: number;
  status: string;
};

const queue = JSON.parse(readFileSync("data/manual-review/queue.json", "utf8")) as unknown[];
const progress = JSON.parse(readFileSync("data/manual-review/progress.json", "utf8")) as ManualProgressItem[];
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
