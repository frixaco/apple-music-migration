import { appleMusicClientFromEnv, findFavoriteSongsPlaylist, type AppleMusicTrack } from "./lib/apple-music-client";

type RemovalCandidate = {
  index: number;
  track: AppleMusicTrack;
};

const dryRun = Bun.argv.includes("--dry-run");
const limit = readLimitFlag();
const client = appleMusicClientFromEnv();
const playlists = await client.getAllLibraryPlaylists();
const favoriteSongs = findFavoriteSongsPlaylist(playlists);

if (!favoriteSongs) {
  const playlistNames = playlists.map((playlist) => playlist.attributes?.name ?? "(unnamed)").sort();
  throw new Error(`Could not find Favourite Songs playlist. Found playlists: ${playlistNames.join(", ")}`);
}

const favoriteTracks = await client.getAllLibraryPlaylistTracks(favoriteSongs.id);
const candidates = favoriteTracks.map((track, index) => ({ index: index + 1, track }));
const selectedCandidates = limit === null ? candidates : candidates.slice(0, limit);

console.log(`Playlist: ${favoriteSongs.attributes?.name ?? "Favourite Songs"}`);
console.log(`Editable: ${favoriteSongs.attributes?.canEdit ?? "unknown"}`);
console.log(`Current songs: ${favoriteTracks.length}`);
console.log(`Will remove favorite status from: ${selectedCandidates.length}`);

if (dryRun) {
  printCandidates(selectedCandidates);
  process.exit(0);
}

for (const candidate of selectedCandidates) {
  const name = candidate.track.attributes?.name ?? candidate.track.id;
  const artist = candidate.track.attributes?.artistName ?? "";
  console.log(`${candidate.index}. Removing favorite: ${name}${artist ? ` - ${artist}` : ""}`);
  await client.deleteLibrarySongRating(candidate.track.id);
}

const updatedFavoriteTracks = await client.getAllLibraryPlaylistTracks(favoriteSongs.id);

console.log(`Removed favorite status: ${selectedCandidates.length}`);
console.log(`Favourite Songs after: ${updatedFavoriteTracks.length}`);

function printCandidates(candidatesToPrint: RemovalCandidate[]): void {
  for (const candidate of candidatesToPrint) {
    const name = candidate.track.attributes?.name ?? candidate.track.id;
    const artist = candidate.track.attributes?.artistName ?? "";
    const album = candidate.track.attributes?.albumName ?? "";
    console.log(`${candidate.index}. ${name}${artist ? ` - ${artist}` : ""}${album ? ` (${album})` : ""}`);
  }
}

function readLimitFlag(): number | null {
  const index = Bun.argv.indexOf("--limit");

  if (index === -1) {
    return null;
  }

  const value = Number(Bun.argv[index + 1]);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error("--limit must be a positive integer.");
  }

  return value;
}
