# YouTube Non-Added Playlist Refresh

Requested playlist:

- https://www.youtube.com/playlist?list=PLcjQUNxFpwsTG6mUHA5nVhtvCrwcqdfer

Current status:

- Public `yt-dlp` fetch failed: YouTube reports the playlist does not exist to unauthenticated access.
- Authenticated YouTube Data API fetch failed before page 1 because the Google project quota is exhausted.
- No fresh live playlist snapshot was saved yet.

Local creation state:

- Local non-added items: 204
- Previously recorded as added to YouTube playlist: 197
- Previously skipped by YouTube API: 2
- Local non-added items not recorded as added or skipped: 5

Previously skipped by YouTube API:

- `[Deleted video]`
  - Local index: 211
  - Video ID: BOB6lvI3Y8c
  - URL: https://www.youtube.com/watch?v=BOB6lvI3Y8c
  - Original reason: YouTube API returned `videoNotFound`.

- `[Private video]`
  - Local index: 378
  - Video ID: 0mhDexv_PBI
  - URL: https://www.youtube.com/watch?v=0mhDexv_PBI
  - Original reason: YouTube API returned `failedPrecondition`.

Local non-added items not recorded in the YouTube playlist creation state:

- `百鬼祭 / 常闇トワ(cover)`
  - Local index: 692
  - Video ID: 2o_H09MdT94
  - URL: https://www.youtube.com/watch?v=2o_H09MdT94

- `Forgotten Words (忘れじの言の葉) ／DAZBEE cover`
  - Local index: 693
  - Video ID: lFNWUL9fqG8
  - URL: https://www.youtube.com/watch?v=lFNWUL9fqG8

- `Nhato & Taishi (Edelritter) 2018 ULTRA FAN MIX -NONSTOP EDM-`
  - Local index: 695
  - Video ID: wunNLFAdYfc
  - URL: https://www.youtube.com/watch?v=wunNLFAdYfc

- `Owl - ~a guest has arrived, the owl reports~ ／DAZBEE COVER`
  - Local index: 696
  - Video ID: eQBlomFo1Kw
  - URL: https://www.youtube.com/watch?v=eQBlomFo1Kw

- `Stefan Nixdorf - Commodus Pt.2 (The Menace) | Diversity Release`
  - Local index: 701
  - Video ID: HtkImmE7VfA
  - URL: https://www.youtube.com/watch?v=HtkImmE7VfA

Next check:

- Re-run `bun run fetch:youtube-non-added` after the YouTube API quota resets or with a different Google Cloud OAuth project.
- That run will save `data/raw/youtube_non_added_playlist_latest.json` and compare the live playlist against the local 204-item non-added list.
