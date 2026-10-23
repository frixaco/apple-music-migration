import { appleMusicClientFromEnv, findFavoriteSongsPlaylist, type AppleMusicTrack } from "./lib/apple-music-client";
import { chunks } from "./lib/util";

type CopyCandidate = {
  track: AppleMusicTrack;
  keys: Set<string>;
};

const targetPlaylistName = Bun.env.TARGET_PLAYLIST_NAME?.trim() || "All";
const dryRun = Bun.argv.includes("--dry-run");
const client = appleMusicClientFromEnv();
const playlists = await client.getAllLibraryPlaylists();
const favoriteSongs = findFavoriteSongsPlaylist(playlists);
const targetPlaylist = playlists.find((playlist) => playlist.attributes?.name === targetPlaylistName);

if (!favoriteSongs) {
  const playlistNames = playlists.map((playlist) => playlist.attributes?.name ?? "(unnamed)").sort();
  throw new Error(`Could not find Favourite Songs playlist. Found playlists: ${playlistNames.join(", ")}`);
}

if (!targetPlaylist) {
  throw new Error(`Could not find target playlist "${targetPlaylistName}".`);
}

if (targetPlaylist.attributes?.canEdit === false) {
  throw new Error(`Target playlist "${targetPlaylistName}" is not editable.`);
}

const [favoriteTracks, targetTracks] = await Promise.all([
  client.getAllLibraryPlaylistTracks(favoriteSongs.id),
  client.getAllLibraryPlaylistTracks(targetPlaylist.id),
]);
const targetKeys = buildExistingKeys(targetTracks);
const missingFavorites = favoriteTracks
  .map((track) => ({ track, keys: getTrackKeys(track) }))
  .filter((candidate) => !hasAnyKey(targetKeys, candidate.keys));

console.log(`Source: ${favoriteSongs.attributes?.name ?? "Favourite Songs"} (${favoriteTracks.length} songs)`);
console.log(`Target: ${targetPlaylist.attributes?.name ?? targetPlaylistName} (${targetTracks.length} songs before)`);
console.log(`Already in target: ${favoriteTracks.length - missingFavorites.length}`);
console.log(`Will append: ${missingFavorites.length}`);

if (dryRun) {
  printCandidates(missingFavorites);
  process.exit(0);
}

for (const chunk of chunks(missingFavorites, 100)) {
  await client.addTracksToLibraryPlaylist(
    targetPlaylist.id,
    chunk.map(({ track }) => ({
      id: track.id,
      type: track.type,
    })),
  );
}

const updatedTargetTracks = await client.getAllLibraryPlaylistTracks(targetPlaylist.id);

console.log(`Appended: ${missingFavorites.length}`);
console.log(`Target songs after: ${updatedTargetTracks.length}`);

function buildExistingKeys(tracks: AppleMusicTrack[]): Set<string> {
  const keys = new Set<string>();

  for (const track of tracks) {
    for (const key of getTrackKeys(track)) {
      keys.add(key);
    }
  }

  return keys;
}

function getTrackKeys(track: AppleMusicTrack): Set<string> {
  const keys = new Set<string>();
  const playParams = track.attributes?.playParams;
  const name = track.attributes?.name;
  const artist = track.attributes?.artistName;

  addKey(keys, "track", track.id);
  addKey(keys, "play", playParams?.id);
  addKey(keys, "catalog", playParams?.catalogId);

  if (name && artist) {
    addKey(keys, "song", `${normalizeText(name)}::${normalizeText(artist)}`);
  }

  return keys;
}

function hasAnyKey(existingKeys: Set<string>, candidateKeys: Set<string>): boolean {
  for (const key of candidateKeys) {
    if (existingKeys.has(key)) {
      return true;
    }
  }

  return false;
}

function addKey(keys: Set<string>, prefix: string, value: string | undefined): void {
  if (value) {
    keys.add(`${prefix}:${value}`);
  }
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function printCandidates(candidates: CopyCandidate[]): void {
  for (const [index, { track }] of candidates.entries()) {
    const name = track.attributes?.name ?? track.id;
    const artist = track.attributes?.artistName ?? "";
    const album = track.attributes?.albumName ?? "";
    console.log(`${index + 1}. ${name} - ${artist}${album ? ` (${album})` : ""}`);
  }
}
