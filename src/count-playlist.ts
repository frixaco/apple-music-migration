import { AppleMusicClient } from "./apple-music-client";

const playlistName = Bun.argv[2]?.trim();

if (!playlistName) {
  throw new Error("Usage: bun run src/count-playlist.ts <playlist name>");
}

const developerToken = readRequiredEnv("APPLE_MUSIC_DEVELOPER_TOKEN");
const musicUserToken = readRequiredEnv("APPLE_MUSIC_USER_TOKEN");
const client = new AppleMusicClient({ developerToken, musicUserToken });
const playlists = await client.getAllLibraryPlaylists();
const playlist = playlists.find((candidate) => candidate.attributes?.name === playlistName);

if (!playlist) {
  throw new Error(`Could not find playlist "${playlistName}".`);
}

const tracks = await client.getAllLibraryPlaylistTracks(playlist.id);

console.log(`Playlist: ${playlist.attributes?.name ?? playlistName}`);
console.log(`ID: ${playlist.id}`);
console.log(`Editable: ${playlist.attributes?.canEdit ?? "unknown"}`);
console.log(`Songs: ${tracks.length}`);

function readRequiredEnv(name: string): string {
  const value = Bun.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required. Add it to .env.`);
  }

  return value;
}
