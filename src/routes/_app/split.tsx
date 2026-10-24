import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeftRightIcon, Columns2Icon, XIcon } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'
import { AppleList, SongDetails } from '@/components/apple-list'
import { DetailPanel } from '@/components/detail-panel'
import { ExternalLink } from '@/components/external-link'
import { ListPending } from '@/components/list-layout'
import { PlaylistPicker } from '@/components/playlist-picker'
import type { Pane } from '@/components/split-pane'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { VideoDetails, YouTubeList } from '@/components/youtube-list'
import { useIsMobile } from '@/hooks/use-mobile'
import { comparePlaylists, songTrack, videoTrack } from '@/lib/compare'
import type { Track } from '@/lib/compare'
import { plural } from '@/lib/format'
import {
  playlistKey,
  playlistRoute,
  playlistUrl,
  serviceName,
} from '@/lib/playlist'
import { playlistsQuery, songsQuery, videosQuery } from '@/lib/queries'
import type { Playlist, Service } from '@/lib/types'
import { cn } from '@/lib/utils'

type Side = 'left' | 'right'
const sides: Side[] = ['left', 'right']

/** Each side is a playlist key, e.g. `youtube:PL…` or `apple:p.…`. */
type SplitSearch = { left?: string; right?: string }

type PlaylistRef = { service: Service; id: string }

function parseKey(key: string | undefined): PlaylistRef | undefined {
  const separator = key?.indexOf(':') ?? -1
  if (!key || separator < 0) return undefined
  const service = key.slice(0, separator)
  if (service !== 'youtube' && service !== 'apple') return undefined
  return { service, id: key.slice(separator + 1) }
}

export const Route = createFileRoute('/_app/split')({
  validateSearch: (search: Record<string, unknown>): SplitSearch => ({
    left: typeof search.left === 'string' ? search.left : undefined,
    right: typeof search.right === 'string' ? search.right : undefined,
  }),
  loaderDeps: ({ search }) => search,
  // Start loading both sides at once; each side shows its own loading state.
  loader: ({ context, deps }) => {
    for (const ref of [parseKey(deps.left), parseKey(deps.right)]) {
      if (ref?.service === 'youtube')
        void context.queryClient.prefetchQuery(videosQuery(ref.id))
      if (ref?.service === 'apple')
        void context.queryClient.prefetchQuery(songsQuery(ref.id))
    }
  },
  component: SplitView,
})

/** A side's rows as tracks to compare, once they have loaded. */
function useTracks(ref: PlaylistRef | undefined): Track[] | undefined {
  const videos = useQuery({
    ...videosQuery(ref?.id ?? ''),
    enabled: ref?.service === 'youtube',
  })
  const songs = useQuery({
    ...songsQuery(ref?.id ?? ''),
    enabled: ref?.service === 'apple',
  })
  return useMemo(() => {
    if (ref?.service === 'youtube') return videos.data?.map(videoTrack)
    if (ref?.service === 'apple') return songs.data?.map(songTrack)
    return undefined
  }, [ref?.service, videos.data, songs.data])
}

/** Two playlists side by side: compare them and move music from one to the other. */
function SplitView() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const { data: playlists = [] } = useQuery(playlistsQuery)
  const refs = { left: parseKey(search.left), right: parseKey(search.right) }
  const playlistOf = (side: Side) =>
    playlists.find(
      (item) =>
        item.service === refs[side]?.service && item.id === refs[side].id,
    )

  const tracks = { left: useTracks(refs.left), right: useTracks(refs.right) }
  const leftLikeness = useMemo(
    () =>
      tracks.left && tracks.right
        ? comparePlaylists(tracks.left, tracks.right)
        : undefined,
    [tracks.left, tracks.right],
  )
  const rightLikeness = useMemo(
    () =>
      tracks.left && tracks.right
        ? comparePlaylists(tracks.right, tracks.left)
        : undefined,
    [tracks.left, tracks.right],
  )
  const likeness = { left: leftLikeness, right: rightLikeness }

  const [focus, setFocus] = useState<{ side: Side; id: string }>()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [mobileSide, setMobileSide] = useState<Side>('left')

  const setSides = (next: SplitSearch) => {
    setFocus(undefined)
    setDetailsOpen(false)
    void navigate({ to: '/split', search: next })
  }
  const close = (side: Side) => {
    const remaining = playlistOf(side === 'left' ? 'right' : 'left')
    void navigate(remaining ? playlistRoute(remaining) : { to: '/' })
  }

  const paneFor = (side: Side): Pane => {
    const otherSide = side === 'left' ? 'right' : 'left'
    const focusedThere = focus?.side === otherSide ? focus.id : undefined
    const source = tracks[otherSide]?.find((track) => track.id === focusedThere)
    return {
      side,
      header: (
        <PaneHeader
          side={side}
          playlist={playlistOf(side)}
          onPick={(playlist) => {
            const key = playlistKey(playlist)
            // Picking the playlist open on the other side swaps them.
            setSides(
              key === search[otherSide]
                ? { [side]: key, [otherSide]: search[side] }
                : { ...search, [side]: key },
            )
          }}
          onSwap={() => setSides({ left: search.right, right: search.left })}
          onClose={() => close(side)}
        />
      ),
      other: playlistOf(otherSide),
      likeness: likeness[side],
      focusedId: focus?.side === side ? focus.id : undefined,
      onFocus: (id) => {
        setFocus({ side, id })
        setDetailsOpen(true)
      },
      incoming: source && {
        title: source.artist
          ? `${source.title} — ${source.artist}`
          : source.title,
        likenesses: likeness[otherSide]?.get(source.id) ?? [],
      },
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="shrink-0 border-b p-2 md:hidden">
        <ToggleGroup
          type="single"
          variant="segmented"
          value={mobileSide}
          onValueChange={(value) => value && setMobileSide(value as Side)}
          className="w-full"
        >
          {sides.map((side) => (
            <ToggleGroupItem key={side} value={side} className="min-w-0 flex-1">
              <span className="truncate">
                {playlistOf(side)?.title ?? 'Choose playlist'}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex min-h-0 flex-1">
        {sides.map((side) => {
          const ref = refs[side]
          const pane = paneFor(side)
          return (
            <div
              key={side}
              className={cn(
                'flex min-w-0 flex-1',
                side === 'right' && 'md:border-l',
                side !== mobileSide && 'max-md:hidden',
              )}
            >
              {ref ? (
                <Suspense
                  fallback={
                    <ListPending
                      service={ref.service}
                      playlistId={ref.id}
                      noun={ref.service === 'youtube' ? 'video' : 'song'}
                    />
                  }
                >
                  {ref.service === 'youtube' ? (
                    <YouTubeList key={ref.id} playlistId={ref.id} pane={pane} />
                  ) : (
                    <AppleList key={ref.id} playlistId={ref.id} pane={pane} />
                  )}
                </Suspense>
              ) : (
                <section className="flex min-w-0 flex-1 flex-col">
                  {pane.header}
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Columns2Icon />
                      </EmptyMedia>
                      <EmptyTitle>Choose a playlist for this side</EmptyTitle>
                      <EmptyDescription>
                        Each row then shows whether it is already in the other
                        playlist, and you can move rows across.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </section>
              )}
            </div>
          )
        })}
        {focus && refs[focus.side] && (
          <FocusDetails
            playlist={refs[focus.side]!}
            id={focus.id}
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
          />
        )}
      </div>
    </div>
  )
}

/** The details and link of the row clicked on either side, until closed. */
function FocusDetails({
  playlist,
  id,
  open,
  onOpenChange,
}: {
  playlist: PlaylistRef
  id: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const videos = useQuery({
    ...videosQuery(playlist.id),
    enabled: playlist.service === 'youtube',
  })
  const songs = useQuery({
    ...songsQuery(playlist.id),
    enabled: playlist.service === 'apple',
  })
  const video =
    playlist.service === 'youtube'
      ? videos.data?.find((item) => item.videoId === id)
      : undefined
  const song =
    playlist.service === 'apple'
      ? songs.data?.find((item) => item.id === id)
      : undefined
  // On desktop the panel is a column that stays until closed; on mobile it is a sheet.
  if ((!video && !song) || (!open && !isMobile)) return null

  return (
    <DetailPanel
      title={video ? 'Video' : 'Song'}
      meta={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close details"
          onClick={() => onOpenChange(false)}
        >
          <XIcon />
        </Button>
      }
      open={open}
      onOpenChange={onOpenChange}
    >
      {video ? (
        <VideoDetails video={video} />
      ) : (
        song && <SongDetails song={song} />
      )}
    </DetailPanel>
  )
}

function PaneHeader({
  side,
  playlist,
  onPick,
  onSwap,
  onClose,
}: {
  side: Side
  playlist: Playlist | undefined
  onPick: (playlist: Playlist) => void
  onSwap: () => void
  onClose: () => void
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b bg-card px-3">
      <div className="flex max-w-80 min-w-0 flex-1">
        <PlaylistPicker variant="menu" current={playlist} onOpen={onPick} />
      </div>
      {playlist && (
        <span className="shrink-0 whitespace-nowrap text-muted-foreground max-xl:hidden">
          {plural(
            playlist.count,
            playlist.service === 'youtube' ? 'video' : 'song',
          )}
        </span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {side === 'right' && (
          <Button variant="ghost" onClick={onSwap} className="max-md:hidden">
            <ArrowLeftRightIcon />
            Swap
          </Button>
        )}
        {playlist && (
          <ExternalLink href={playlistUrl(playlist)} className="max-lg:hidden">
            {serviceName[playlist.service]}
          </ExternalLink>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close this side"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>
    </div>
  )
}
