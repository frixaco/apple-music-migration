import { readFileSync } from "node:fs";
import { AppleMusicClient, type AppleMusicPlaylist } from "./apple-music-client";
import { upsertManualProgress } from "./manual-progress";

type ManualQueueItem = {
  index: number;
  youtubeTitle: string;
};

const targetPlaylistName = Bun.env.TARGET_PLAYLIST_NAME?.trim() || "All";
const storefront = Bun.env.APPLE_MUSIC_STOREFRONT?.trim() || "uz";
const indexArg = readFlag("--index");
const songId = readFlag("--apple-song-id");
const notes = readFlag("--notes") ?? "manual review: song found and added";

if (!indexArg || !songId) {
  throw new Error("Usage: bun run manual:add-song -- --index <youtube index> --apple-song-id <apple song id> [--notes \"...\"]");
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

const client = new AppleMusicClient({
  developerToken: readRequiredEnv("APPLE_MUSIC_DEVELOPER_TOKEN"),
  musicUserToken: readRequiredEnv("APPLE_MUSIC_USER_TOKEN"),
});
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
  appleDurationSeconds: attributes.durationInMillis ? Math.round(attributes.durationInMillis / 1000) : null,
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

function readFlag(name: string): string | null {
  const index = Bun.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return Bun.argv[index + 1] ?? null;
}

function readRequiredEnv(name: string): string {
  const value = Bun.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required. Add it to .env.`);
  }

  return value;
}
