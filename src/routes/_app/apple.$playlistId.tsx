import { useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ChevronDownIcon, SearchIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ConfirmButton } from '@/components/confirm-button'
import { DetailPanel, DetailRow } from '@/components/detail-panel'
import { ExternalLink } from '@/components/external-link'
import { ListFooter, ListToolbar } from '@/components/list-layout'
import { AddToAppleMenu } from '@/components/playlist-menus'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
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
import { useSelection } from '@/hooks/use-selection'
import { formatCount, formatDifference, formatDuration, timeAgo } from '@/lib/format'
import { connectionsQuery, playlistsQuery, songsQuery } from '@/lib/queries'
import type { Song } from '@/lib/types'
import { youtubeVideoUrl } from '@/lib/youtube'

export const Route = createFileRoute('/_app/apple/$playlistId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(songsQuery(params.playlistId)),
  component: ApplePlaylist,
})

function ApplePlaylist() {
  const { playlistId } = Route.useParams()
  const { data: songs, dataUpdatedAt } = useSuspenseQuery(songsQuery(playlistId))
  const { data: playlists = [] } = useQuery(playlistsQuery)
  const { data: connections } = useQuery(connectionsQuery)
  const playlist = playlists.find((item) => item.service === 'apple' && item.id === playlistId)

  const [text, setText] = useState('')
  const visible = useMemo(() => {
    const needle = text.trim().toLowerCase()
    return needle
      ? songs.filter((song) =>
          `${song.name} ${song.artist} ${song.album}`.toLowerCase().includes(needle),
        )
      : songs
  }, [songs, text])
  const selection = useSelection(useMemo(() => visible.map((song) => song.id), [visible]))
  const selected = songs.filter((song) => selection.isSelected(song.id))

  const [activeId, setActiveId] = useState<string | undefined>()
  const [sheetOpen, setSheetOpen] = useState(false)
  const active = songs.find((song) => song.id === activeId) ?? visible.at(0)

  const add = useMutation({
    mutationFn: addSongs,
    meta: { invalidates: [['songs'], ['playlists']], success: 'Added to Apple Music' },
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
      data: { catalogIds: items.flatMap((song) => song.catalogId ?? []), playlistIds },
    })
  const activeUrl =
    active?.catalogId && connections?.apple
      ? `https://music.apple.com/${connections.apple.storefront}/song/${active.catalogId}`
      : null

  return (
    <>
      <section className="flex min-w-0 flex-1 flex-col">
        <ListToolbar>
          <InputGroup className="w-56">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Filter song, artist, album"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </InputGroup>
          <div className="ml-auto flex items-center gap-2">
            {selected.length > 0 && (
              <span className="whitespace-nowrap text-muted-foreground">
                {selected.length} selected
              </span>
            )}
            <AddToAppleMenu
              count={selected.length}
              noun={selected.length === 1 ? 'song' : 'songs'}
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
                title={`Remove ${selected.length} from Favourite Songs?`}
                description="Their favourite rating is cleared. They stay in your library and other playlists."
                confirmLabel="Remove"
                onConfirm={() =>
                  remove.mutate({ data: { librarySongIds: selected.map((song) => song.id) } })
                }
              >
                Remove from Favourite Songs
              </ConfirmButton>
            )}
          </div>
        </ListToolbar>
        <Table containerClassName="flex-1 overflow-y-auto">
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  aria-label="Select all"
                  checked={selection.allState}
                  onCheckedChange={(checked) => selection.setAll(checked === true)}
                />
              </TableHead>
              <TableHead className="w-9" />
              <TableHead>Song</TableHead>
              <TableHead className="w-52 max-md:hidden">Artist</TableHead>
              <TableHead className="w-52 max-lg:hidden">Album</TableHead>
              <TableHead className="w-14 text-right max-md:hidden">Length</TableHead>
              <TableHead className="w-36 max-lg:hidden">From</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((song) => (
              <TableRow
                key={song.id}
                data-state={selection.isSelected(song.id) ? 'selected' : undefined}
                data-active={song.id === active?.id}
                onClick={() => {
                  setActiveId(song.id)
                  setSheetOpen(true)
                }}
                className="h-9 cursor-default"
              >
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    aria-label={`Select ${song.name}`}
                    checked={selection.isSelected(song.id)}
                    onCheckedChange={(checked) => selection.toggle(song.id, checked === true)}
                  />
                </TableCell>
                <TableCell className="px-0">
                  <Artwork song={song} />
                </TableCell>
                <TableCell className="max-w-0">
                  <div className="truncate">{song.name}</div>
                  <div className="truncate text-[11px] text-subtle md:hidden">{song.artist}</div>
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
            ))}
          </TableBody>
        </Table>
        <ListFooter
          start={`${formatCount(songs.length)} songs · synced ${timeAgo(new Date(dataUpdatedAt))}`}
          end="From shows the YouTube video a song was matched from"
        />
      </section>
      {active && (
        <DetailPanel
          title="Song"
          meta={`${songs.indexOf(active) + 1} of ${formatCount(songs.length)}`}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
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
              <img src={active.artworkUrl} alt="" className="size-28 shrink-0 rounded-md" />
            )}
            <div className="flex min-w-0 flex-col">
              <h3 className="text-[15px] font-medium">{active.name}</h3>
              <div className="text-muted-foreground">{active.artist}</div>
              <div className="text-muted-foreground">
                {active.album} · {formatDuration(active.durationSeconds)}
              </div>
              {activeUrl && (
                <ExternalLink href={activeUrl} className="mt-auto justify-start">
                  Open in Apple Music
                </ExternalLink>
              )}
            </div>
          </div>
          <Separator />
          <dl className="p-4">
            <DetailRow label="Playlist">{playlist?.title}</DetailRow>
            <DetailRow label="Catalog ID">
              <span className="font-mono text-[11px]">{active.catalogId ?? 'Not in catalog'}</span>
            </DetailRow>
          </dl>
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
                      {active.source.sourcePlaylistTitle} #{active.source.position} ·{' '}
                      {formatDuration(active.source.durationSeconds)}{' '}
                      {formatDifference(active.durationSeconds, active.source.durationSeconds)}
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

function Artwork({ song }: { song: Song }) {
  if (!song.artworkUrl) return <div className="size-6 rounded-sm bg-muted" />

  return (
    <HoverCard openDelay={300} closeDelay={0}>
      <HoverCardTrigger asChild>
        <img src={song.artworkUrl} alt="" loading="lazy" className="size-6 rounded-sm" />
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
