import { useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronDownIcon } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ConfirmButton } from '@/components/confirm-button'
import { DetailPanel, DetailRow } from '@/components/detail-panel'
import { ExternalLink } from '@/components/external-link'
import {
  FilterInput,
  FilterTabs,
  ListActions,
  ListFooter,
  ListToolbar,
  PlaylistHeader,
  SelectAllHead,
  SelectRowCell,
  VirtualRows,
} from '@/components/list-layout'
import { MoveMenu } from '@/components/playlist-menus'
import { PlaylistLabel } from '@/components/playlist-label'
import {
  CompareHead,
  CompareStatus,
  IncomingMatches,
  TowardOther,
  compareFilters,
} from '@/components/split-pane'
import type { CompareFilter, Pane } from '@/components/split-pane'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { removeVideos, sendVideos } from '@/functions/playlists'
import { startRun } from '@/functions/runs'
import { useActiveRow } from '@/hooks/use-active-row'
import { useSelection } from '@/hooks/use-selection'
import type { Selection } from '@/hooks/use-selection'
import type { Likeness } from '@/lib/compare'
import { formatCount, formatDuration, plural, timeAgo } from '@/lib/format'
import { canAddTo } from '@/lib/playlist'
import { playlistsQuery, videosQuery } from '@/lib/queries'
import type { Playlist, Video } from '@/lib/types'
import { youtubeVideoUrl } from '@/lib/youtube'

const filters = {
  all: { label: 'All', test: () => true },
  unsearched: { label: 'Not searched', test: (video: Video) => !video.match },
  found: {
    label: 'Found',
    test: (video: Video) =>
      video.match?.status === 'found' ||
      video.match?.status === 'check' ||
      video.match?.status === 'done',
  },
  missing: {
    label: 'Not found',
    test: (video: Video) => video.match?.status === 'not_found',
  },
} satisfies Record<string, { label: string; test: (video: Video) => boolean }>

type Filter = keyof typeof filters

function appleStatus(video: Video): string {
  switch (video.match?.status) {
    case undefined:
      return 'Not searched'
    case 'searching':
      return 'Searching…'
    case 'found':
    case 'check':
      return 'Found · not added'
    case 'not_found':
      return 'Not found'
    case 'done':
      return video.match.outcome ?? 'Done'
  }
}

/** A YouTube playlist's videos: a page of its own, or one side of the split view when `pane` is set. */
export function YouTubeList({
  playlistId,
  pane,
}: {
  playlistId: string
  pane?: Pane
}) {
  const navigate = useNavigate()
  const { data: videos, dataUpdatedAt } = useSuspenseQuery(
    videosQuery(playlistId),
  )
  const { data: playlists = [] } = useQuery(playlistsQuery)
  const playlist = playlists.find(
    (item) => item.service === 'youtube' && item.id === playlistId,
  )
  const title = playlist?.title ?? 'Playlist'

  const [filter, setFilter] = useState<Filter>('all')
  const [compareFilter, setCompareFilter] = useState<CompareFilter>('all')
  const [text, setText] = useState('')
  const likeness = pane?.likeness
  const visible = useMemo(() => {
    const needle = text.trim().toLowerCase()
    return videos.filter(
      (video) =>
        (likeness
          ? compareFilters[compareFilter].test(likeness.get(video.videoId))
          : filters[filter].test(video)) &&
        (!needle ||
          `${video.title} ${video.channel}`.toLowerCase().includes(needle)),
    )
  }, [videos, filter, compareFilter, likeness, text])
  const selection = useSelection(
    useMemo(() => visible.map((video) => video.videoId), [visible]),
  )
  const selected = videos.filter((video) => selection.isSelected(video.videoId))

  const detail = useActiveRow(videos, visible, (video) => video.videoId)
  const active = detail.active
  // In the split view a click focuses the row so the other side shows its matches.
  const showRow = pane?.onFocus ?? detail.show
  const activeId = pane ? pane.focusedId : active?.videoId
  const highlighted = new Set(pane?.incoming?.likenesses.map((item) => item.id))

  // In the split view the search runs in the background, so both playlists stay open.
  const search = useMutation({
    mutationFn: startRun,
    meta: {
      invalidates: [['run']],
      success: pane
        ? 'Searching Apple Music · review it in the match run'
        : undefined,
    },
    onSuccess: () => {
      if (!pane) void navigate({ to: '/run' })
    },
  })
  // Both the source and the target playlist change, so every cached video list goes stale.
  const send = useMutation({
    mutationFn: sendVideos,
    meta: {
      invalidates: [['videos'], ['playlists']],
      success: 'Sent to YouTube playlist',
    },
    onSuccess: () => selection.clear(),
  })
  const remove = useMutation({
    mutationFn: removeVideos,
    meta: {
      invalidates: [['videos', playlistId], ['playlists']],
      success: 'Removed from YouTube',
    },
    onSuccess: () => selection.clear(),
  })

  const searchOnApple = (
    items: Video[],
    target?: Playlist,
    removeFromSource = false,
  ) =>
    search.mutate({
      data: {
        sourcePlaylistId: playlistId,
        sourcePlaylistTitle: title,
        targetPlaylistIds: target ? [target.id] : [],
        removeFromSource,
        videos: items.map((video) => ({
          videoId: video.videoId,
          playlistItemId: video.playlistItemId,
          position: video.position,
          title: video.title,
          channel: video.channel,
          durationSeconds: video.durationSeconds,
          thumbnailUrl: video.thumbnailUrl,
        })),
      },
    })
  const sendTo = (
    items: Video[],
    target: Playlist,
    removeFromSource: boolean,
  ) =>
    send.mutate({
      data: {
        items: items.map(({ videoId, playlistItemId }) => ({
          videoId,
          playlistItemId,
        })),
        targetPlaylistId: target.id,
        removeFromSource,
      },
    })
  const moveOrSearch =
    (items: Video[]) => (target: Playlist, removeFromSource: boolean) =>
      target.service === 'apple'
        ? searchOnApple(items, target, removeFromSource)
        : sendTo(items, target, removeFromSource)

  return (
    <>
      <section className="flex min-w-0 flex-1 flex-col">
        {pane
          ? pane.header
          : playlist && <PlaylistHeader playlist={playlist} noun="video" />}
        {pane && (
          <>
            <ListToolbar>
              {likeness && (
                <FilterTabs
                  filters={compareFilters}
                  items={videos.map((video) => likeness.get(video.videoId))}
                  value={compareFilter}
                  onValueChange={setCompareFilter}
                  className="max-lg:hidden"
                />
              )}
              <FilterInput
                value={text}
                onChange={setText}
                className="w-40 max-2xl:hidden"
              />
              <ListActions selectedCount={selected.length}>
                {pane.other?.service === 'youtube' && (
                  <>
                    <Button
                      variant="outline"
                      disabled={selected.length === 0 || send.isPending}
                      title={`Copy to ${pane.other.title}`}
                      onClick={() => sendTo(selected, pane.other!, false)}
                    >
                      Copy
                    </Button>
                    <Button
                      disabled={selected.length === 0 || send.isPending}
                      title={`Move to ${pane.other.title}`}
                      onClick={() => sendTo(selected, pane.other!, true)}
                    >
                      Move
                      <TowardOther side={pane.side} />
                    </Button>
                  </>
                )}
                {pane.other?.service === 'apple' && canAddTo(pane.other) && (
                  <Button
                    disabled={selected.length === 0 || search.isPending}
                    title={`Find on Apple Music and add to ${pane.other.title}`}
                    onClick={() => searchOnApple(selected, pane.other)}
                  >
                    Find & add
                    <TowardOther side={pane.side} />
                  </Button>
                )}
              </ListActions>
            </ListToolbar>
            <IncomingMatches
              pane={pane}
              describe={(id) => {
                const video = videos.find((item) => item.videoId === id)
                return (
                  video && {
                    title: video.title,
                    detail: `#${video.position} · ${video.channel} · ${formatDuration(video.durationSeconds)}`,
                  }
                )
              }}
            />
          </>
        )}
        {!pane && (
          <ListToolbar>
            <FilterTabs
              filters={filters}
              items={videos}
              value={filter}
              onValueChange={setFilter}
              className="max-md:hidden"
            />
            <FilterInput
              value={text}
              onChange={setText}
              className="w-48 max-md:hidden"
            />
            <ListActions selectedCount={selected.length}>
              <MoveMenu
                count={selected.length}
                sourceId={playlistId}
                sourceTitle={title}
                services={['youtube', 'apple']}
                pending={send.isPending || search.isPending}
                onMove={moveOrSearch(selected)}
              >
                <Button variant="outline" disabled={selected.length === 0}>
                  Move to
                  <ChevronDownIcon className="text-subtle" />
                </Button>
              </MoveMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={selected.length === 0}
                    className="max-md:hidden"
                  >
                    Copy to
                    <ChevronDownIcon className="text-subtle" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>
                    Copy {plural(selected.length, 'video')} to
                  </DropdownMenuLabel>
                  {playlists
                    .filter(
                      (item) =>
                        item.service === 'youtube' && item.id !== playlistId,
                    )
                    .map((target) => (
                      <DropdownMenuItem
                        key={target.id}
                        onSelect={() => sendTo(selected, target, false)}
                      >
                        <PlaylistLabel playlist={target} />
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <ConfirmButton
                disabled={selected.length === 0}
                className="max-md:hidden"
                title={`Remove ${plural(selected.length, 'video')} from ${title}?`}
                description="They are removed from the YouTube playlist. The videos themselves are not affected."
                confirmLabel="Remove"
                onConfirm={() =>
                  remove.mutate({
                    data: {
                      playlistItemIds: selected.map(
                        (video) => video.playlistItemId,
                      ),
                    },
                  })
                }
              >
                Remove
              </ConfirmButton>
              <Button
                disabled={selected.length === 0 || search.isPending}
                onClick={() => searchOnApple(selected)}
              >
                Find on Apple Music
              </Button>
            </ListActions>
          </ListToolbar>
        )}
        <Table containerClassName="flex-1 overflow-y-auto">
          <TableHeader>
            <TableRow>
              <SelectAllHead selection={selection} />
              <TableHead className="w-10 text-right max-md:hidden">#</TableHead>
              <TableHead>Title</TableHead>
              {!pane && (
                <TableHead className="w-56 max-lg:hidden">Channel</TableHead>
              )}
              <TableHead className="w-14 text-right max-md:hidden">
                Length
              </TableHead>
              {pane ? (
                <CompareHead other={pane.other} />
              ) : (
                <TableHead className="w-48 max-md:hidden">
                  Apple Music
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody {...selection.bodyProps}>
            <VirtualRows
              items={visible}
              columns={pane ? 5 : 6}
              estimateSize={28}
              getKey={(video) => video.videoId}
            >
              {(video, index, measureRef) => (
                <VideoRow
                  key={video.videoId}
                  index={index}
                  measureRef={measureRef}
                  video={video}
                  selected={selection.isSelected(video.videoId)}
                  active={video.videoId === activeId}
                  highlighted={highlighted.has(video.videoId)}
                  split={!!pane}
                  compare={likeness?.get(video.videoId)}
                  onShow={showRow}
                  onToggle={selection.toggle}
                />
              )}
            </VirtualRows>
          </TableBody>
        </Table>
        <ListFooter
          start={`${formatCount(visible.length)} of ${formatCount(videos.length)} videos shown`}
          end={`Loaded from YouTube ${timeAgo(new Date(dataUpdatedAt))}`}
        />
      </section>
      {active && !pane && (
        <DetailPanel
          title="Video"
          meta={`${active.position} of ${formatCount(videos.length)}`}
          open={detail.open}
          onOpenChange={detail.setOpen}
          footer={
            <>
              <Button
                disabled={search.isPending}
                onClick={() => searchOnApple([active])}
              >
                Find on Apple Music
              </Button>
              <MoveMenu
                count={1}
                sourceId={playlistId}
                sourceTitle={title}
                services={['youtube', 'apple']}
                pending={send.isPending || search.isPending}
                onMove={moveOrSearch([active])}
              >
                <Button variant="outline">
                  Move to
                  <ChevronDownIcon className="text-subtle" />
                </Button>
              </MoveMenu>
            </>
          }
        >
          <VideoDetails video={active} />
        </DetailPanel>
      )}
    </>
  )
}

/** Memoized so dragging a selection re-renders only the rows whose state changed. */
const VideoRow = memo(function VideoRow({
  index,
  measureRef,
  video,
  selected,
  active,
  highlighted,
  split,
  compare,
  onShow,
  onToggle,
}: {
  index: number
  measureRef: (row: Element | null) => void
  video: Video
  selected: boolean
  active: boolean
  /** Matches the row focused on the other side of the split view. */
  highlighted: boolean
  /** One side of the split view: the comparison replaces the channel and Apple Music columns. */
  split: boolean
  compare: Likeness[] | undefined
  onShow: (id: string) => void
  onToggle: Selection['toggle']
}) {
  return (
    <TableRow
      ref={measureRef}
      data-index={index}
      data-state={selected ? 'selected' : undefined}
      data-active={active}
      data-highlighted={highlighted}
      onClick={() => onShow(video.videoId)}
      className="cursor-default data-[highlighted=true]:bg-warn/25 max-md:h-14"
    >
      <SelectRowCell
        id={video.videoId}
        label={video.title}
        checked={selected}
        onToggle={onToggle}
      />
      <TableCell className="text-right font-mono text-[11px] text-subtle max-md:hidden">
        {video.position}
      </TableCell>
      <TableCell className="max-w-0">
        <VideoTitle
          video={video}
          status={split ? <CompareStatus likeness={compare} /> : undefined}
        />
      </TableCell>
      {!split && (
        <TableCell className="max-w-0 truncate text-muted-foreground max-lg:hidden">
          {video.channel}
        </TableCell>
      )}
      <TableCell className="text-right font-mono text-[11px] text-muted-foreground max-md:hidden">
        {formatDuration(video.durationSeconds)}
      </TableCell>
      <TableCell className="max-w-0 truncate max-md:hidden">
        {split ? (
          <CompareStatus likeness={compare} />
        ) : (
          <span
            className={
              video.match?.status === 'done' ? undefined : 'text-subtle'
            }
          >
            {appleStatus(video)}
          </span>
        )}
      </TableCell>
    </TableRow>
  )
})

function VideoTitle({
  video,
  status = appleStatus(video),
}: {
  video: Video
  /** Shown after the channel and length on mobile. */
  status?: ReactNode
}) {
  return (
    <HoverCard openDelay={300} closeDelay={0}>
      <HoverCardTrigger asChild>
        <div className="flex min-w-0 items-center gap-2">
          {video.thumbnailUrl ? (
            <img
              src={video.thumbnailUrl}
              alt=""
              loading="lazy"
              className="aspect-video w-16 shrink-0 rounded-sm object-cover md:w-11"
            />
          ) : (
            <div className="aspect-video w-16 shrink-0 rounded-sm bg-muted md:w-11" />
          )}
          <div className="min-w-0">
            <div className="truncate">{video.title}</div>
            <div className="truncate text-[11px] text-subtle md:hidden">
              {video.channel} · {formatDuration(video.durationSeconds)} ·{' '}
              {status}
            </div>
          </div>
        </div>
      </HoverCardTrigger>
      {video.thumbnailUrl && (
        <HoverCardContent
          side="bottom"
          align="start"
          className="w-56 max-md:hidden"
        >
          <img
            src={video.thumbnailUrl}
            alt=""
            className="aspect-video w-full rounded-md object-cover"
          />
          <div className="flex justify-between gap-2 px-1 pt-1 text-[11px] text-muted-foreground">
            <span className="truncate">{video.channel}</span>
            <span className="font-mono text-subtle">
              {formatDuration(video.durationSeconds)}
            </span>
          </div>
        </HoverCardContent>
      )}
    </HoverCard>
  )
}

function VideoDetails({ video }: { video: Video }) {
  return (
    <>
      <div className="space-y-3 p-4">
        {video.thumbnailUrl && (
          <img
            src={video.thumbnailUrl}
            alt=""
            className="aspect-video w-full rounded-md object-cover"
          />
        )}
        <h3 className="text-[15px] font-medium">{video.title}</h3>
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          <span className="truncate">
            {video.channel} · {formatDuration(video.durationSeconds)}
          </span>
          <ExternalLink href={youtubeVideoUrl(video.videoId)}>
            Open on YouTube
          </ExternalLink>
        </div>
      </div>
      <Separator />
      <dl className="p-4">
        <DetailRow label="Added">{timeAgo(video.addedAt)}</DetailRow>
        <DetailRow label="Apple Music">{appleStatus(video)}</DetailRow>
      </dl>
      {video.description && (
        <>
          <Separator />
          <div className="p-4">
            <div className="mb-1 text-[11px] text-subtle">Description</div>
            <p className="whitespace-pre-line break-words text-muted-foreground">
              {video.description}
            </p>
          </div>
        </>
      )}
    </>
  )
}
