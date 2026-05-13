# Manual Review Workflow

Goal: review all 703 YouTube items one by one, manually search Apple Music, and only add confirmed Apple Music songs. Do not add music videos.

## Rules

- Progress starts empty in `data/manual-review/progress.json`.
- Every processed YouTube item gets exactly one progress entry.
- Only Apple Music resources with type `songs` are valid.
- `music-videos` are not valid, even when confidence is high.
- If the song appears playable in the Apple Music app but not through the API candidate list, record it as `needs_followup` with the Apple URL and notes.
- Preserve YouTube order when adding confirmed songs later.

## Status Values

- `found_not_added`: exact song found, not added yet.
- `added`: exact song found and added.
- `not_found`: no Apple Music song found in the Uzbekistan storefront.
- `unavailable`: found elsewhere or by URL, but not addable/playable through the current Apple Music API/storefront.
- `skip_cover`: YouTube item is a cover and we are not replacing it with the original.
- `skip_mix_or_longform`: YouTube item is a mix, album stream, set, compilation, or non-single longform item.
- `needs_user_decision`: a plausible match exists but needs your decision.

## Files

- Queue: `data/manual-review/queue.json`
- Empty progress ledger: `data/manual-review/progress.json`
- CSV mirror: `reports/manual-review/progress.csv`
- Search snapshots: `reports/manual-review/searches/`

## Commands

```sh
bun run manual:init
bun run manual:search -- --index 19
bun run manual:search -- --index 19 --query "This Is America Childish Gambino"
bun run manual:summary
```
