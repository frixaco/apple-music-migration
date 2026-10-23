import { appleMusicClientFromEnv, findFavoriteSongsPlaylist } from "./lib/apple-music-client";

const client = appleMusicClientFromEnv();
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
