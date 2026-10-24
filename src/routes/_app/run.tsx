import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  SearchIcon,
  SearchXIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { DetailPanel } from '@/components/detail-panel'
import { ExternalLink } from '@/components/external-link'
import {
  FilterTabs,
  ListActions,
  ListFooter,
  ListToolbar,
  SelectAllHead,
  SelectRowCell,
} from '@/components/list-layout'
import { AddToAppleMenu, MoveMenu } from '@/components/playlist-menus'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  addToApple,
  closeRun,
  markNotFound,
  moveToYouTube,
  searchAgain,
  selectCandidate,
} from '@/functions/runs'
import { useActiveRow } from '@/hooks/use-active-row'
import { useSelection } from '@/hooks/use-selection'
import { formatDifference, formatDuration, timeAgo } from '@/lib/format'
import { runQuery } from '@/lib/queries'
import type { Match, MatchRun } from '@/lib/types'
import { youtubeVideoUrl } from '@/lib/youtube'

export const Route = createFileRoute('/_app/run')({
  loader: ({ context }) => context.queryClient.ensureQueryData(runQuery),
  component: RunPage,
})

const filters = {
  open: { label: 'Open', test: (item: Match) => item.status !== 'done' },
  found: { label: 'Found', test: (item: Match) => item.status === 'found' },
  check: { label: 'Check', test: (item: Match) => item.status === 'check' },
  missing: {
    label: 'Not found',
    test: (item: Match) => item.status === 'not_found',
  },
  done: { label: 'Done', test: (item: Match) => item.status === 'done' },
} satisfies Record<string, { label: string; test: (item: Match) => boolean }>

type Filter = keyof typeof filters

const invalidates = [['run'], ['videos'], ['songs'], ['playlists']]

function bestOption(item: Match) {
  return (
    item.candidates.find(
      (candidate) => candidate.id === item.selectedCandidateId,
    ) ?? item.candidates.at(0)
  )
}

function RunPage() {
  const { data: run } = useSuspenseQuery(runQuery)
  return run ? <OpenRun run={run} /> : <NoRun />
}

function NoRun() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchIcon />
        </EmptyMedia>
        <EmptyTitle>No match run open</EmptyTitle>
        <EmptyDescription>
          Select videos in a YouTube playlist and choose Find on Apple Music.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" asChild>
          <Link to="/">Go to playlists</Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function OpenRun({ run }: { run: MatchRun }) {
  const [filter, setFilter] = useState<Filter>('open')
  const visible = useMemo(
    () => run.matches.filter(filters[filter].test),
    [run.matches, filter],
  )
  const selection = useSelection(
    useMemo(() => visible.map((item) => item.videoId), [visible]),
  )
  const selected = run.matches.filter((item) =>
    selection.isSelected(item.videoId),
  )
  const selectedIds = selected.map((item) => item.videoId)

  const detail = useActiveRow(run.matches, visible, (item) => item.videoId)
  const active = detail.active

  const searched = run.matches.filter(
    (item) => item.status !== 'searching',
  ).length
  const done = run.matches.filter((item) => item.status === 'done')

  const add = useMutation({
    mutationFn: addToApple,
    meta: { invalidates, success: 'Added to Apple Music' },
    onSuccess: () => selection.clear(),
  })
  const move = useMutation({
    mutationFn: moveToYouTube,
    meta: { invalidates, success: 'Moved on YouTube' },
    onSuccess: () => selection.clear(),
  })
  const close = useMutation({
    mutationFn: () => closeRun(),
    meta: { invalidates: [['run']] },
  })

  return (
    <>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-3 border-b px-3">
          <h1 className="shrink-0 font-medium whitespace-nowrap">Match run</h1>
          <span className="min-w-0 truncate text-muted-foreground">
            from YouTube playlist{' '}
            <Link
              to="/youtube/$playlistId"
              params={{ playlistId: run.sourcePlaylistId }}
              title={run.sourcePlaylistTitle}
              className="text-foreground hover:underline"
            >
              {run.sourcePlaylistTitle}
            </Link>
          </span>
          <Progress
            value={(searched / run.matches.length) * 100}
            className="h-1 w-24 shrink-0 max-md:hidden"
          />
          <span className="shrink-0 font-mono text-[11px] whitespace-nowrap text-subtle">
            {searched} / {run.matches.length} searched
          </span>
          <Button
            variant="ghost"
            className="ml-auto shrink-0"
            disabled={close.isPending}
            onClick={() => close.mutate()}
          >
            Close run
          </Button>
        </div>
        <ListToolbar>
          <FilterTabs
            filters={filters}
            items={run.matches}
            value={filter}
            onValueChange={setFilter}
          />
          <ListActions selectedCount={selected.length}>
            <AddToAppleMenu
              key={run.id}
              count={selected.length}
              noun="song"
              defaultSelected={run.targetPlaylistIds}
              pending={add.isPending}
              onAdd={(playlistIds) =>
                add.mutate({ data: { videoIds: selectedIds, playlistIds } })
              }
            >
              <Button
                variant={filter === 'missing' ? 'outline' : 'default'}
                disabled={selected.length === 0}
              >
                Add to Apple Music
                <ChevronDownIcon />
              </Button>
            </AddToAppleMenu>
            <MoveMenu
              count={selected.length}
              sourceId={run.sourcePlaylistId}
              sourceTitle={run.sourcePlaylistTitle}
              services={['youtube']}
              pending={move.isPending}
              onMove={(target, removeFromSource) =>
                move.mutate({
                  data: {
                    videoIds: selectedIds,
                    playlistId: target.id,
                    playlistTitle: target.title,
                    removeFromSource,
                  },
                })
              }
            >
              <Button
                variant={filter === 'missing' ? 'default' : 'outline'}
                disabled={selected.length === 0}
              >
                Move to YouTube
                <ChevronDownIcon />
              </Button>
            </MoveMenu>
            <Button
              variant="ghost"
              disabled={selected.length === 0}
              onClick={selection.clear}
            >
              Clear
            </Button>
          </ListActions>
        </ListToolbar>
        <Table containerClassName="flex-1 overflow-y-auto">
          <TableHeader>
            <TableRow>
              <SelectAllHead selection={selection} />
              <TableHead className="w-10 text-right max-md:hidden">#</TableHead>
              <TableHead>YouTube title</TableHead>
              <TableHead className="w-80 max-lg:hidden">Best option</TableHead>
              <TableHead className="w-24 text-right max-md:hidden">
                Confidence
              </TableHead>
              <TableHead className="w-16 text-right max-md:hidden">
                Options
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((item) => {
              const option = bestOption(item)
              return (
                <TableRow
                  key={item.videoId}
                  data-state={
                    selection.isSelected(item.videoId) ? 'selected' : undefined
                  }
                  data-active={item.videoId === active?.videoId}
                  onClick={() => detail.show(item)}
                  className="cursor-default max-md:h-12"
                >
                  <SelectRowCell
                    selection={selection}
                    id={item.videoId}
                    label={item.title}
                  />
                  <TableCell className="text-right font-mono text-[11px] text-subtle max-md:hidden">
                    {item.position}
                  </TableCell>
                  <TableCell className="max-w-0">
                    <div className="truncate">{item.title}</div>
                    <div className="truncate font-mono text-[11px] text-subtle md:hidden">
                      #{item.position} · {item.candidates.length} options
                    </div>
                  </TableCell>
                  <TableCell className="max-w-0 truncate text-muted-foreground max-lg:hidden">
                    {item.status === 'searching' ? (
                      <Spinner className="text-subtle" />
                    ) : item.status === 'done' ? (
                      item.outcome
                    ) : option ? (
                      `${option.name} — ${option.artist}`
                    ) : (
                      <span className="text-subtle">No match</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[11px] text-muted-foreground max-md:hidden">
                    {item.confidence ? `${item.confidence}/5` : ''}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[11px] text-subtle max-md:hidden">
                    {item.status === 'searching' ? '' : item.candidates.length}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <ListFooter
          start={`${done.length} done · ${run.matches.length - done.length} still open · started ${timeAgo(run.createdAt)}`}
          end="Results stay until you close the run · nothing is added until you press Add"
        />
      </section>
      {active && (
        <MatchOptions
          key={`${active.videoId}:${active.query}`}
          item={active}
          open={detail.open}
          onOpenChange={detail.setOpen}
        />
      )}
    </>
  )
}

/** The Apple Music options for one video: search again, pick one, or mark it not found. */
function MatchOptions({
  item,
  open,
  onOpenChange,
}: {
  item: Match
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [choice, setChoice] = useState(bestOption(item)?.id ?? '')
  const select = useMutation({
    mutationFn: selectCandidate,
    meta: { invalidates: [['run']] },
  })
  const reject = useMutation({
    mutationFn: markNotFound,
    meta: { invalidates: [['run']] },
  })
  const research = useMutation({
    mutationFn: searchAgain,
    meta: { invalidates: [['run']] },
  })
  const weak = item.status === 'not_found'

  return (
    <DetailPanel
      title="Apple Music options"
      meta={`#${item.position}`}
      open={open}
      onOpenChange={onOpenChange}
      footer={
        item.status === 'done' ? (
          <span className="text-muted-foreground">{item.outcome}</span>
        ) : (
          <>
            <Button
              disabled={!choice || select.isPending}
              onClick={() =>
                select.mutate({
                  data: { videoId: item.videoId, candidateId: choice },
                })
              }
            >
              Use this option
            </Button>
            <Button
              variant="outline"
              disabled={weak || reject.isPending}
              onClick={() =>
                reject.mutate({ data: { videoIds: [item.videoId] } })
              }
            >
              {weak ? 'Marked not found' : 'Mark not found'}
            </Button>
          </>
        )
      }
    >
      <div className="flex gap-3 border-b p-4">
        {item.thumbnailUrl && (
          <img
            src={item.thumbnailUrl}
            alt=""
            className="aspect-video w-24 shrink-0 rounded-md object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 font-medium">{item.title}</div>
          <div className="flex justify-between gap-2 text-muted-foreground">
            <span className="truncate">
              {item.channel} · {formatDuration(item.durationSeconds)}
            </span>
            <ExternalLink href={youtubeVideoUrl(item.videoId)}>
              YouTube
            </ExternalLink>
          </div>
        </div>
      </div>
      <form
        className="flex gap-2 border-b p-4"
        onSubmit={(event) => {
          event.preventDefault()
          const term = String(new FormData(event.currentTarget).get('term'))
          research.mutate({ data: { videoId: item.videoId, term } })
        }}
      >
        <Input
          name="term"
          defaultValue={item.query}
          aria-label="Apple Music search"
          required
        />
        <Button type="submit" variant="outline" disabled={research.isPending}>
          {research.isPending && <Spinner />}
          {weak ? 'Search again' : 'Search'}
        </Button>
      </form>
      {item.status === 'searching' ? (
        <div className="flex items-center gap-2 p-4 text-muted-foreground">
          <Spinner /> Searching Apple Music…
        </div>
      ) : item.candidates.length === 0 ? (
        <Empty className="py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>No options</EmptyTitle>
            <EmptyDescription>
              Try a different search, or move it to a YouTube playlist.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="flex justify-between px-4 py-2 text-[11px] text-subtle">
            <span>
              {item.candidates.length}{' '}
              {weak ? 'weak options · none look right' : 'options · pick one'}
            </span>
            <span>Open each link to verify</span>
          </div>
          <RadioGroup
            value={choice}
            onValueChange={setChoice}
            className="grid-cols-[minmax(0,1fr)] gap-0 border-t"
          >
            {item.candidates.map((candidate) => (
              <Label
                key={candidate.id}
                className="flex min-w-0 items-center gap-3 border-b px-4 py-2.5 has-data-[state=checked]:bg-selected"
              >
                <RadioGroupItem value={candidate.id} />
                {candidate.artworkUrl && (
                  <img
                    src={candidate.artworkUrl}
                    alt=""
                    className="size-10 shrink-0 rounded-sm"
                  />
                )}
                <div className="min-w-0 flex-1 leading-snug">
                  <div className="truncate">{candidate.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {candidate.artist} · {candidate.album}
                  </div>
                  <div className="font-mono text-[11px] text-subtle">
                    {formatDuration(candidate.durationSeconds)} ·{' '}
                    {formatDifference(
                      candidate.durationSeconds,
                      item.durationSeconds,
                    )}{' '}
                    · score {candidate.score.toFixed(2)}
                  </div>
                </div>
                {candidate.url && (
                  <Button variant="ghost" size="icon-sm" asChild>
                    <a
                      href={candidate.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open in Apple Music"
                    >
                      <ArrowUpRightIcon />
                    </a>
                  </Button>
                )}
              </Label>
            ))}
          </RadioGroup>
        </>
      )}
    </DetailPanel>
  )
}
