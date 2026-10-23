import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowUpRightIcon, ChevronDownIcon, SearchIcon, SearchXIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DetailPanel } from '@/components/detail-panel'
import { ListFooter, ListToolbar } from '@/components/list-layout'
import { AddToAppleMenu, MoveMenu } from '@/components/playlist-menus'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  addToApple,
  closeRun,
  markNotFound,
  moveToYouTube,
  searchAgain,
  selectCandidate,
} from '@/functions/runs'
import { useSelection } from '@/hooks/use-selection'
import { formatDifference, formatDuration, timeAgo } from '@/lib/format'
import { runQuery } from '@/lib/queries'
import type { Match, MatchRun, MatchStatus } from '@/lib/types'
import { youtubeVideoUrl } from '@/lib/youtube'

export const Route = createFileRoute('/_app/run')({
  loader: ({ context }) => context.queryClient.ensureQueryData(runQuery),
  component: RunPage,
})

const filters = {
  open: { label: 'Open', statuses: ['searching', 'found', 'check', 'not_found'] },
  found: { label: 'Found', statuses: ['found'] },
  check: { label: 'Check', statuses: ['check'] },
  missing: { label: 'Not found', statuses: ['not_found'] },
  done: { label: 'Done', statuses: ['done'] },
} satisfies Record<string, { label: string; statuses: MatchStatus[] }>

type Filter = keyof typeof filters

const invalidates = [['run'], ['videos'], ['songs'], ['playlists']]

function bestOption(item: Match) {
  return (
    item.candidates.find((candidate) => candidate.id === item.selectedCandidateId) ??
    item.candidates.at(0)
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
    () =>
      run.matches.filter((item) =>
        (filters[filter].statuses as MatchStatus[]).includes(item.status),
      ),
    [run.matches, filter],
  )
  const selection = useSelection(useMemo(() => visible.map((item) => item.videoId), [visible]))
  const selected = run.matches.filter((item) => selection.isSelected(item.videoId))
  const selectedIds = selected.map((item) => item.videoId)

  const [activeId, setActiveId] = useState<string | undefined>()
  const [sheetOpen, setSheetOpen] = useState(false)
  const active = run.matches.find((item) => item.videoId === activeId) ?? visible.at(0)

  const searched = run.matches.filter((item) => item.status !== 'searching').length
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
          <span
            className="min-w-0 truncate text-muted-foreground"
            title={run.sourcePlaylistTitle}
          >
            {run.sourcePlaylistTitle}
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
          <ToggleGroup
            type="single"
            variant="segmented"
            value={filter}
            onValueChange={(value) => value && setFilter(value as Filter)}
          >
            {Object.entries(filters).map(([key, { label, statuses }]) => (
              <ToggleGroupItem key={key} value={key}>
                {label}
                <Badge variant="count">
                  {
                    run.matches.filter((item) =>
                      (statuses as MatchStatus[]).includes(item.status),
                    ).length
                  }
                </Badge>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="ml-auto flex items-center gap-2">
            {selected.length > 0 && (
              <span className="whitespace-nowrap text-muted-foreground">
                {selected.length} selected
              </span>
            )}
            <AddToAppleMenu
              key={run.id}
              count={selected.length}
              noun={selected.length === 1 ? 'song' : 'songs'}
              defaultSelected={run.targetPlaylistIds}
              pending={add.isPending}
              onAdd={(playlistIds) => add.mutate({ data: { videoIds: selectedIds, playlistIds } })}
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
            <Button variant="ghost" disabled={selected.length === 0} onClick={selection.clear}>
              Clear
            </Button>
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
              <TableHead className="w-10 text-right max-md:hidden">#</TableHead>
              <TableHead>YouTube title</TableHead>
              <TableHead className="w-80 max-lg:hidden">Best option</TableHead>
              <TableHead className="w-14 text-right max-md:hidden">Conf.</TableHead>
              <TableHead className="w-12 text-right max-md:hidden">Opt.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((item) => {
              const option = bestOption(item)
              return (
                <TableRow
                  key={item.videoId}
                  data-state={selection.isSelected(item.videoId) ? 'selected' : undefined}
                  data-active={item.videoId === active?.videoId}
                  onClick={() => {
                    setActiveId(item.videoId)
                    setSheetOpen(true)
                  }}
                  className="cursor-default max-md:h-12"
                >
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      aria-label={`Select ${item.title}`}
                      checked={selection.isSelected(item.videoId)}
                      onCheckedChange={(checked) =>
                        selection.toggle(item.videoId, checked === true)
                      }
                    />
                  </TableCell>
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
          open={sheetOpen}
          onOpenChange={setSheetOpen}
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
  const select = useMutation({ mutationFn: selectCandidate, meta: { invalidates: [['run']] } })
  const reject = useMutation({ mutationFn: markNotFound, meta: { invalidates: [['run']] } })
  const research = useMutation({ mutationFn: searchAgain, meta: { invalidates: [['run']] } })
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
                select.mutate({ data: { videoId: item.videoId, candidateId: choice } })
              }
            >
              Use this option
            </Button>
            <Button
              variant="outline"
              disabled={weak || reject.isPending}
              onClick={() => reject.mutate({ data: { videoIds: [item.videoId] } })}
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
            <Button variant="link" className="h-auto p-0 text-muted-foreground" asChild>
              <a href={youtubeVideoUrl(item.videoId)} target="_blank" rel="noreferrer">
                YouTube
                <ArrowUpRightIcon />
              </a>
            </Button>
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
        <Input name="term" defaultValue={item.query} aria-label="Apple Music search" required />
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
            <EmptyDescription>Try a different search, or move it to a YouTube playlist.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="flex justify-between px-4 py-2 text-[11px] text-subtle">
            <span>
              {item.candidates.length} {weak ? 'weak options · none look right' : 'options · pick one'}
            </span>
            <span>Open each link to verify</span>
          </div>
          <RadioGroup value={choice} onValueChange={setChoice} className="grid-cols-[minmax(0,1fr)] gap-0 border-t">
            {item.candidates.map((candidate) => (
              <Label
                key={candidate.id}
                className="flex min-w-0 items-center gap-3 border-b px-4 py-2.5 has-data-[state=checked]:bg-selected"
              >
                <RadioGroupItem value={candidate.id} />
                {candidate.artworkUrl && (
                  <img src={candidate.artworkUrl} alt="" className="size-10 shrink-0 rounded-sm" />
                )}
                <div className="min-w-0 flex-1 leading-snug">
                  <div className="truncate">{candidate.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {candidate.artist} · {candidate.album}
                  </div>
                  <div className="font-mono text-[11px] text-subtle">
                    {formatDuration(candidate.durationSeconds)} ·{' '}
                    {formatDifference(candidate.durationSeconds, item.durationSeconds)} · score{' '}
                    {candidate.score.toFixed(2)}
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
