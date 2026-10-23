export function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function readFlag(name: string): string | null {
  const index = Bun.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return Bun.argv[index + 1] ?? null;
}

export function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }

    seen.add(value);
  }

  return [...duplicates].sort();
}

export function formatDuration(seconds: number | null): string {
  return seconds === null ? "" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
