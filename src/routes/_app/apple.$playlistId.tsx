import { useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ChevronDownIcon } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { ConfirmButton } from '@/components/confirm-button'
import { DetailPanel } from '@/components/detail-panel'
import { ExternalLink } from '@/components/external-link'
import {
  FilterInput,
  ListActions,
  ListFooter,
  ListPending,
  ListToolbar,
  PlaylistHeader,
  SelectAllHead,
  SelectRowCell,
  VirtualRows,
} from '@/components/list-layout'
import { AddToAppleMenu } from '@/components/playlist-menus'
import { Button } from '@/components/ui/button'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { addSongs, removeFavorites } from '@/functions/playlists'
import { useActiveRow } from '@/hooks/use-active-row'
import { useSelection } from '@/hooks/use-selection'
import type { Selection } from '@/hooks/use-selection'
import {
  formatCount,
  formatDifference,
  formatDuration,
  plural,
  timeAgo,
} from '@/lib/format'
import { connectionsQuery, playlistsQuery, songsQuery } from '@/lib/queries'
import type { Song } from '@/lib/types'
import { youtubeVideoUrl } from '@/lib/youtube'

export const Route = createFileRoute('/_app/apple/$playlistId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(songsQuery(params.playlistId)),
  pendingComponent: () => (
    <ListPending
      service="apple"
      playlistId={Route.useParams().playlistId}
      noun="song"
    />
  ),
  component: ApplePlaylist,
})

function ApplePlaylist() {
  const { playlistId } = Route.useParams()
  const { data: songs, dataUpdatedAt } = useSuspenseQuery(
    songsQuery(playlistId),
  )
  const { data: playlists = [] } = useQuery(playlistsQuery)
  const { data: connections } = useQuery(connectionsQuery)
  const playlist = playlists.find(
    (item) => item.service === 'apple' && item.id === playlistId,
  )

  const [text, setText] = useState('')
  const visible = useMemo(() => {
    const needle = text.trim().toLowerCase()
    return needle
      ? songs.filter((song) =>
          `${song.name} ${song.artist} ${song.album}`
            .toLowerCase()
            .includes(needle),
        )
      : songs
  }, [songs, text])
  const selection = useSelection(
    useMemo(() => visible.map((song) => song.id), [visible]),
  )
  const selected = songs.filter((song) => selection.isSelected(song.id))

  const detail = useActiveRow(songs, visible, (song) => song.id)
  const active = detail.active

  const add = useMutation({
    mutationFn: addSongs,
    meta: {
      invalidates: [['songs'], ['playlists']],
      success: 'Added to Apple Music',
    },
    onSuccess: () => selection.clear(),
  })
  const remove = useMutation({
    mutationFn: removeFavorites,
    meta: {
      invalidates: [['songs', playlistId], ['playlists']],
      success: 'Removed from Favourite Songs',
    },
    onSuccess: () => selection.clear(),
  })
  const addTo = (items: Song[]) => (playlistIds: string[]) =>
    add.mutate({
      data: {
        catalogIds: items.flatMap((song) => song.catalogId ?? []),
        playlistIds,
      },
    })
  const activeUrl =
    active?.catalogId && connections?.apple
      ? `https://music.apple.com/${connections.apple.storefront}/song/${active.catalogId}`
      : null

  return (
    <>
      <section className="flex min-w-0 flex-1 flex-col">
        {playlist && <PlaylistHeader playlist={playlist} noun="song" />}
        <ListToolbar>
          <FilterInput
            value={text}
            onChange={setText}
            placeholder="Filter song, artist, album"
            className="w-56"
          />
          <ListActions selectedCount={selected.length}>
            <AddToAppleMenu
              count={selected.length}
              noun="song"
              pending={add.isPending}
              onAdd={addTo(selected)}
            >
              <Button variant="outline" disabled={selected.length === 0}>
                Add to Apple Music
                <ChevronDownIcon className="text-subtle" />
              </Button>
            </AddToAppleMenu>
            {playlist?.isFavorites && (
              <ConfirmButton
                disabled={selected.length === 0}
                title={`Remove ${plural(selected.length, 'song')} from Favourite Songs?`}
                description="Their favourite rating is cleared. They stay in your library and other playlists."
                confirmLabel="Remove"
                onConfirm={() =>
                  remove.mutate({
                    data: { librarySongIds: selected.map((song) => song.id) },
                  })
                }
              >
                Remove from Favourite Songs
              </ConfirmButton>
            )}
          </ListActions>
        </ListToolbar>
        <Table containerClassName="flex-1 overflow-y-auto">
          <TableHeader>
            <TableRow>
              <SelectAllHead selection={selection} />
              <TableHead className="w-9" />
              <TableHead>Song</TableHead>
              <TableHead className="w-52 max-md:hidden">Artist</TableHead>
              <TableHead className="w-52 max-lg:hidden">Album</TableHead>
              <TableHead className="w-14 text-right max-md:hidden">
                Length
              </TableHead>
              <TableHead className="w-36 max-lg:hidden">Matched from</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody {...selection.bodyProps}>
            <VirtualRows
              items={visible}
              columns={7}
              estimateSize={36}
              getKey={(song) => song.id}
            >
              {(song, index, measureRef) => (
                <SongRow
                  key={song.id}
                  index={index}
                  measureRef={measureRef}
                  song={song}
                  selected={selection.isSelected(song.id)}
                  active={song.id === active?.id}
                  onShow={detail.show}
                  onToggle={selection.toggle}
                />
              )}
            </VirtualRows>
          </TableBody>
        </Table>
        <ListFooter
          start={`${formatCount(visible.length)} of ${formatCount(songs.length)} songs shown`}
          end={`Loaded from Apple Music ${timeAgo(new Date(dataUpdatedAt))}`}
        />
      </section>
      {active && (
        <DetailPanel
          title="Song"
          meta={`${songs.indexOf(active) + 1} of ${formatCount(songs.length)}`}
          open={detail.open}
          onOpenChange={detail.setOpen}
          footer={
            <AddToAppleMenu
              count={1}
              noun="song"
              pending={add.isPending}
              onAdd={addTo([active])}
            >
              <Button variant="outline" disabled={!active.catalogId}>
                Add to Apple Music
                <ChevronDownIcon className="text-subtle" />
              </Button>
            </AddToAppleMenu>
          }
        >
          <div className="flex gap-3 p-4">
            {active.artworkUrl && (
              <img
                src={active.artworkUrl}
                alt=""
                className="size-28 shrink-0 rounded-md"
              />
            )}
            <div className="flex min-w-0 flex-col">
              <h3 className="text-[15px] font-medium">{active.name}</h3>
              <div className="text-muted-foreground">{active.artist}</div>
              <div className="text-muted-foreground">
                {active.album} · {formatDuration(active.durationSeconds)}
              </div>
              {activeUrl && (
                <ExternalLink
                  href={activeUrl}
                  className="mt-auto justify-start"
                >
                  Open in Apple Music
                </ExternalLink>
              )}
            </div>
          </div>
          {!active.catalogId && (
            <>
              <Separator />
              <p className="p-4 text-muted-foreground">
                Not in the Apple Music catalog, so it can't be added to other
                playlists.
              </p>
            </>
          )}
          {active.source && (
            <>
              <Separator />
              <div className="p-4">
                <div className="mb-2 text-[11px] text-subtle">Matched from</div>
                <div className="flex gap-3">
                  {active.source.thumbnailUrl && (
                    <img
                      src={active.source.thumbnailUrl}
                      alt=""
                      className="aspect-video w-24 shrink-0 rounded-md object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{active.source.title}</div>
                    <div className="font-mono text-[11px] text-subtle">
                      {active.source.sourcePlaylistTitle} #
                      {active.source.position} ·{' '}
                      {formatDuration(active.source.durationSeconds)}{' '}
                      {formatDifference(
                        active.durationSeconds,
                        active.source.durationSeconds,
                      )}
                    </div>
                    <ExternalLink href={youtubeVideoUrl(active.source.videoId)}>
                      YouTube
                    </ExternalLink>
                  </div>
                </div>
              </div>
            </>
          )}
        </DetailPanel>
      )}
    </>
  )
}

/** Memoized so dragging a selection re-renders only the rows whose state changed. */
const SongRow = memo(function SongRow({
  index,
  measureRef,
  song,
  selected,
  active,
  onShow,
  onToggle,
}: {
  index: number
  measureRef: (row: Element | null) => void
  song: Song
  selected: boolean
  active: boolean
  onShow: (id: string) => void
  onToggle: Selection['toggle']
}) {
  return (
    <TableRow
      ref={measureRef}
      data-index={index}
      data-state={selected ? 'selected' : undefined}
      data-active={active}
      onClick={() => onShow(song.id)}
      className="h-9 cursor-default"
    >
      <SelectRowCell
        id={song.id}
        label={song.name}
        checked={selected}
        onToggle={onToggle}
      />
      <TableCell className="px-0">
        <Artwork song={song} />
      </TableCell>
      <TableCell className="max-w-0">
        <div className="truncate">{song.name}</div>
        <div className="truncate text-[11px] text-subtle md:hidden">
          {song.artist}
        </div>
      </TableCell>
      <TableCell className="max-w-0 truncate text-muted-foreground max-md:hidden">
        {song.artist}
      </TableCell>
      <TableCell className="max-w-0 truncate text-muted-foreground max-lg:hidden">
        {song.album}
      </TableCell>
      <TableCell className="text-right font-mono text-[11px] text-muted-foreground max-md:hidden">
        {formatDuration(song.durationSeconds)}
      </TableCell>
      <TableCell className="max-w-0 truncate font-mono text-[11px] text-subtle max-lg:hidden">
        {song.source
          ? `${song.source.sourcePlaylistTitle} #${song.source.position}`
          : '—'}
      </TableCell>
    </TableRow>
  )
})

function Artwork({ song }: { song: Song }) {
  if (!song.artworkUrl) return <div className="size-6 rounded-sm bg-muted" />

  return (
    <HoverCard openDelay={300} closeDelay={0}>
      <HoverCardTrigger asChild>
        <img
          src={song.artworkUrl}
          alt=""
          loading="lazy"
          className="size-6 rounded-sm"
        />
      </HoverCardTrigger>
      <HoverCardContent side="right" className="w-28">
        <img src={song.artworkUrl} alt="" className="size-[104px] rounded-md" />
        <div className="truncate px-0.5 pt-1 text-[11px] text-muted-foreground">
          {song.artist} · {song.album}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
