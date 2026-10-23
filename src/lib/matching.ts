import type { AppleMusicCatalogResource } from "./apple-music-client";

export function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanSearch(value: string): string {
  return value.replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
}

export function channelArtist(value: string): string {
  return value
    .replace(/\bofficial\b/gi, " ")
    .replace(/\b(channel|youtube|music|records|recordings|label|labels|topic)\b/gi, " ")
    .replace(/\bch\.\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function artistBeforeDash(value: string): string | null {
  const match = value.match(/^(.+?)\s[-–—]\s/);

  return match?.[1]?.trim() ?? null;
}

export function dedupeCandidates(candidates: AppleMusicCatalogResource[]): AppleMusicCatalogResource[] {
  const seen = new Set<string>();
  const deduped: AppleMusicCatalogResource[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.type}:${candidate.id}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

/** Scores how close two durations in seconds are; 0.45 when either is unknown. */
export function scoreDuration(leftSeconds: number | null, rightSeconds: number | null): number {
  if (!leftSeconds || !rightSeconds) {
    return 0.45;
  }

  const difference = Math.abs(leftSeconds - rightSeconds);

  if (difference <= 4) return 1;
  if (difference <= 8) return 0.92;
  if (difference <= 15) return 0.78;
  if (difference <= 30) return 0.56;
  if (difference <= 60) return 0.32;
  return 0.08;
}

export function millisToSeconds(milliseconds: number | undefined): number | null {
  return milliseconds ? Math.round(milliseconds / 1000) : null;
}
