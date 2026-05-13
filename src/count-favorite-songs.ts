import { AppleMusicClient } from "./apple-music-client";

const developerToken = readRequiredEnv("APPLE_MUSIC_DEVELOPER_TOKEN");
const musicUserToken = readRequiredEnv("APPLE_MUSIC_USER_TOKEN");
const client = new AppleMusicClient({ developerToken, musicUserToken });
const playlists = await client.getAllLibraryPlaylists();
const favoriteSongs = findFavoriteSongsPlaylist(playlists);

if (!favoriteSongs) {
  const playlistNames = playlists.map((playlist) => playlist.attributes?.name ?? "(unnamed)").sort();
  throw new Error(`Could not find Favorite Songs playlist. Found playlists: ${playlistNames.join(", ")}`);
}

const tracks = await client.getAllLibraryPlaylistTracks(favoriteSongs.id);

console.log(`Playlist: ${favoriteSongs.attributes?.name ?? "(unnamed)"}`);
console.log(`ID: ${favoriteSongs.id}`);
console.log(`Editable: ${favoriteSongs.attributes?.canEdit ?? "unknown"}`);
console.log(`Songs: ${tracks.length}`);

function findFavoriteSongsPlaylist(playlists: Awaited<ReturnType<AppleMusicClient["getAllLibraryPlaylists"]>>) {
  return playlists.find((playlist) => {
    const name = playlist.attributes?.name?.toLowerCase();
    return name === "favorite songs" || name === "favourite songs";
  });
}

function readRequiredEnv(name: string): string {
  const value = Bun.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required. Add it to .env.`);
  }

  return value;
}
