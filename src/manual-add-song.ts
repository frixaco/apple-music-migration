import { appleMusicClientFromEnv, type AppleMusicClient, type AppleMusicPlaylist } from "./lib/apple-music-client";
import { readQueueItemFromIndexFlag, upsertManualProgress } from "./lib/manual-review";
import { millisToSeconds } from "./lib/matching";
import { readFlag } from "./lib/util";

const targetPlaylistName = Bun.env.TARGET_PLAYLIST_NAME?.trim() || "All";
const storefront = Bun.env.APPLE_MUSIC_STOREFRONT?.trim() || "uz";
const indexArg = readFlag("--index");
const songId = readFlag("--apple-song-id");
const notes = readFlag("--notes") ?? "manual review: song found and added";

if (!indexArg || !songId) {
  throw new Error("Usage: bun run manual:add-song -- --index <youtube index> --apple-song-id <apple song id> [--notes \"...\"]");
}

const item = readQueueItemFromIndexFlag();

const client = appleMusicClientFromEnv();
const playlist = await findTargetPlaylist(client);
const song = await client.getCatalogSong(storefront, songId);
const attributes = song.attributes ?? {};

if (song.type !== "songs") {
  throw new Error(`Refusing to add non-song resource ${songId} (${song.type}).`);
}

await client.addTracksToLibraryPlaylist(playlist.id, [{ id: song.id, type: "songs" }]);
upsertManualProgress({
  index: item.index,
  status: "added",
  youtubeTitle: item.youtubeTitle,
  appleSongId: song.id,
  appleName: attributes.name ?? "",
  appleArtist: attributes.artistName ?? "",
  appleAlbum: attributes.albumName ?? "",
  appleDurationSeconds: millisToSeconds(attributes.durationInMillis),
  appleUrl: attributes.url ?? "",
  reviewerNotes: notes,
  processedAt: new Date().toISOString(),
});

console.log(`Added #${item.index}: ${attributes.name ?? song.id} - ${attributes.artistName ?? ""}`);
console.log(`Playlist: ${playlist.attributes?.name ?? targetPlaylistName}`);

async function findTargetPlaylist(client: AppleMusicClient): Promise<AppleMusicPlaylist> {
  const playlists = await client.getAllLibraryPlaylists();
  const target = playlists.find((playlist) => playlist.attributes?.name === targetPlaylistName);

  if (!target) {
    throw new Error(`Could not find target playlist "${targetPlaylistName}".`);
  }

  if (target.attributes?.canEdit === false) {
    throw new Error(`Target playlist "${targetPlaylistName}" is not editable.`);
  }

  return target;
}
