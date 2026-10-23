import { readRequiredEnv } from "./env";

export type AppleMusicPage<T> = {
  data?: T[];
  next?: string;
};

export type AppleMusicPlaylist = {
  id: string;
  type: "library-playlists";
  attributes?: {
    name?: string;
    canEdit?: boolean;
  };
  relationships?: {
    tracks?: AppleMusicPage<AppleMusicTrack>;
  };
};

export type AppleMusicTrack = {
  id: string;
  type: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    playParams?: {
      catalogId?: string;
      id?: string;
      isLibrary?: boolean;
      kind?: string;
    };
  };
};

export type AppleMusicCatalogResource = {
  id: string;
  type: "songs" | "music-videos";
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    durationInMillis?: number;
    url?: string;
  };
};

export type AppleMusicCatalogSearchResponse = {
  results?: Partial<Record<"songs" | "music-videos", AppleMusicPage<AppleMusicCatalogResource>>>;
};

export type AppleMusicPlaylistCreationRequest = {
  attributes: {
    name: string;
    description?: string;
  };
  relationships?: {
    tracks?: {
      data: Array<{
        id: string;
        type: string;
      }>;
    };
  };
};

const appleMusicApiOrigin = "https://api.music.apple.com";

export class AppleMusicClient {
  private readonly developerToken: string;
  private readonly musicUserToken: string;

  constructor(options: { developerToken: string; musicUserToken: string }) {
    this.developerToken = options.developerToken;
    this.musicUserToken = options.musicUserToken;
  }

  async getAllLibraryPlaylists(): Promise<AppleMusicPlaylist[]> {
    return this.getAllPages<AppleMusicPlaylist>("/v1/me/library/playlists");
  }

  async getAllLibraryPlaylistTracks(playlistId: string): Promise<AppleMusicTrack[]> {
    try {
      return await this.getAllPages<AppleMusicTrack>(`/v1/me/library/playlists/${playlistId}/tracks`);
    } catch (error) {
      if (String(error).includes("\"code\":\"40403\"")) {
        return [];
      }

      throw error;
    }
  }

  async createLibraryPlaylist(request: AppleMusicPlaylistCreationRequest): Promise<AppleMusicPlaylist> {
    const response = await this.post<{ data?: AppleMusicPlaylist[] }>("/v1/me/library/playlists", request);
    const playlist = response.data?.[0];

    if (!playlist) {
      throw new Error("Apple Music created a playlist but returned no playlist data.");
    }

    return playlist;
  }

  async addTracksToLibraryPlaylist(
    playlistId: string,
    tracks: Array<{ id: string; type: string }>,
  ): Promise<void> {
    await this.post(`/v1/me/library/playlists/${playlistId}/tracks`, {
      data: tracks,
    });
  }

  async deleteLibrarySongRating(librarySongId: string): Promise<void> {
    await this.delete(`/v1/me/ratings/library-songs/${encodeURIComponent(librarySongId)}`);
  }

  async searchCatalog(options: {
    storefront: string;
    term: string;
    types: Array<"songs" | "music-videos">;
    limit?: number;
  }): Promise<AppleMusicCatalogSearchResponse> {
    const searchParams = new URLSearchParams({
      term: options.term,
      types: options.types.join(","),
      limit: String(options.limit ?? 25),
    });

    return this.get<AppleMusicCatalogSearchResponse>(
      `/v1/catalog/${encodeURIComponent(options.storefront)}/search?${searchParams}`,
    );
  }

  async getCatalogSong(storefront: string, songId: string): Promise<AppleMusicCatalogResource> {
    const response = await this.get<{ data?: AppleMusicCatalogResource[] }>(
      `/v1/catalog/${encodeURIComponent(storefront)}/songs/${encodeURIComponent(songId)}`,
    );
    const song = response.data?.[0];

    if (!song) {
      throw new Error(`Could not find catalog song ${songId} in ${storefront}.`);
    }

    return song;
  }

  private async getAllPages<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    let nextPath: string | undefined = path;

    while (nextPath) {
      const currentPath = nextPath;
      const page: AppleMusicPage<T> = await this.get<AppleMusicPage<T>>(currentPath);
      items.push(...(page.data ?? []));
      nextPath = page.next;
    }

    return items;
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private async delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  private async request<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
    const url = path.startsWith("http") ? path : `${appleMusicApiOrigin}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.developerToken}`,
        "Music-User-Token": this.musicUserToken,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const responseBody = await response.text();

    if (!response.ok) {
      throw new Error(`Apple Music API request failed: ${response.status} ${responseBody}`);
    }

    if (!responseBody) {
      return undefined as T;
    }

    return JSON.parse(responseBody) as T;
  }
}

export function appleMusicClientFromEnv(): AppleMusicClient {
  return new AppleMusicClient({
    developerToken: readRequiredEnv("APPLE_MUSIC_DEVELOPER_TOKEN"),
    musicUserToken: readRequiredEnv("APPLE_MUSIC_USER_TOKEN"),
  });
}

export function findFavoriteSongsPlaylist(playlists: AppleMusicPlaylist[]): AppleMusicPlaylist | undefined {
  return playlists.find((playlist) => {
    const name = playlist.attributes?.name?.toLowerCase();
    return name === "favorite songs" || name === "favourite songs";
  });
}
