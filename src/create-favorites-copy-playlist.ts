import { AppleMusicClient, type AppleMusicPlaylist } from "./apple-music-client";

const playlistName = Bun.env.FAVORITES_COPY_PLAYLIST_NAME?.trim() || "YouTube + Favourite Songs";
const developerToken = readRequiredEnv("APPLE_MUSIC_DEVELOPER_TOKEN");
const musicUserToken = readRequiredEnv("APPLE_MUSIC_USER_TOKEN");
const client = new AppleMusicClient({ developerToken, musicUserToken });
const playlists = await client.getAllLibraryPlaylists();
const favoriteSongs = findFavoriteSongsPlaylist(playlists);

if (!favoriteSongs) {
  const playlistNames = playlists.map((playlist) => playlist.attributes?.name ?? "(unnamed)").sort();
  throw new Error(`Could not find Favourite Songs playlist. Found playlists: ${playlistNames.join(", ")}`);
}

const existingTarget = playlists.find((playlist) => playlist.attributes?.name === playlistName);

if (existingTarget) {
  throw new Error(`Playlist "${playlistName}" already exists (${existingTarget.id}). Choose another name before creating a copy.`);
}

const tracks = await client.getAllLibraryPlaylistTracks(favoriteSongs.id);

if (tracks.length === 0) {
  throw new Error("Favourite Songs playlist has no tracks to copy.");
}

const created = await client.createLibraryPlaylist({
  attributes: {
    name: playlistName,
    description: `Copied from ${favoriteSongs.attributes?.name ?? "Favourite Songs"} before YouTube playlist migration.`,
  },
  relationships: {
    tracks: {
      data: tracks.map((track) => ({
        id: track.id,
        type: track.type,
      })),
    },
  },
});

console.log(`Created playlist: ${created.attributes?.name ?? playlistName}`);
console.log(`ID: ${created.id}`);
console.log(`Copied songs: ${tracks.length}`);

function findFavoriteSongsPlaylist(playlists: AppleMusicPlaylist[]): AppleMusicPlaylist | undefined {
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
