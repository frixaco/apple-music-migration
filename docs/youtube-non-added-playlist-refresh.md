# YouTube Non-Added Playlist Refresh

Requested playlist:

- https://youtube.com/playlist?list=PLcjQUNxFpwsTG6mUHA5nVhtvCrwcqdfer&si=LUpuZ2uRQzUbuybz

Current public fetch:

- Playlist title: Music NOT on Apple Music
- Playlist ID: PLcjQUNxFpwsTG6mUHA5nVhtvCrwcqdfer
- Fetched items: 204
- Unavailable-looking items in fetched playlist: 0
- Duplicate video IDs: 0

Local comparison:

- Local non-added items from the Apple Music migration ledger: 204
- Current YouTube playlist items: 204
- Old local non-added IDs missing from current YouTube playlist: 2
- Current YouTube playlist IDs not in old local non-added list: 2

Old local unavailable items still present only in the old migration ledger:

- `[Deleted video]`
  - Local index: 211
  - Video ID: BOB6lvI3Y8c
  - URL: https://www.youtube.com/watch?v=BOB6lvI3Y8c

- `[Private video]`
  - Local index: 378
  - Video ID: 0mhDexv_PBI
  - URL: https://www.youtube.com/watch?v=0mhDexv_PBI

New videos present in the current YouTube playlist instead:

- `【Ado】 Show（唱）`
  - Playlist index: 198
  - Video ID: pgXpM4l_MwI
  - URL: https://www.youtube.com/watch?v=pgXpM4l_MwI

- `"Code Race" by Ryan Lott of Son Lux | Marathon OST`
  - Playlist index: 199
  - Video ID: -wQfCuKxC5c
  - URL: https://www.youtube.com/watch?v=-wQfCuKxC5c

Unavailable-video check:

- Public `yt-dlp` fetch sees no deleted/private/unavailable placeholder entries.
- Authenticated YouTube Data API check could not run because the Google project quota is exhausted.
- Based on the public fetch, the current playlist itself looks good.
- If YouTube UI still says unavailable videos are hidden, that is likely YouTube showing owner-only hidden playlist entries that public fetches omit, or stale UI/cache state. Re-run the authenticated check after quota resets to confirm.

Saved local files:

- `data/raw/youtube_non_added_playlist_latest.json`
- `data/manual-review/youtube-non-added-playlist-current.json`
- `data/manual-review/youtube-non-added-playlist-current.csv`
- `docs/youtube-non-added-playlist-current.md`
