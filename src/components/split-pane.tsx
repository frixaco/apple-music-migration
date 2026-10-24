import { ArrowLeftIcon, ArrowRightIcon, CircleCheckIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { TableHead } from '@/components/ui/table'
import { compareStatus } from '@/lib/compare'
import type { Likeness } from '@/lib/compare'
import type { Playlist } from '@/lib/types'
import { cn } from '@/lib/utils'

/** What a playlist list needs to show as one side of the split view. */
export type Pane = {
  side: 'left' | 'right'
  /** Replaces the playlist header: a picker for this side, swap and close. */
  header: ReactNode
  /** The playlist open on the other side, if one is. */
  other: Playlist | undefined
  /**
   * For each row here, the rows on the other side that look the same or similar. Unset until both
   * sides have loaded.
   */
  likeness: Map<string, Likeness[]> | undefined
  /** The row whose matches the other side shows. */
  focusedId: string | undefined
  onFocus: (id: string) => void
  /** Rows here that match the row focused on the other side, and that row's title. */
  incoming: { title: string; likenesses: Likeness[] } | undefined
}

type MaybeLikeness = Likeness[] | undefined

export const compareFilters = {
  all: { label: 'All', test: () => true },
  missing: {
    label: 'Missing',
    test: (likeness: MaybeLikeness) => compareStatus(likeness) === 'missing',
  },
  similar: {
    label: 'Similar',
    test: (likeness: MaybeLikeness) => compareStatus(likeness) === 'similar',
  },
  same: {
    label: 'Already there',
    test: (likeness: MaybeLikeness) => compareStatus(likeness) === 'same',
  },
} satisfies Record<
  string,
  { label: string; test: (likeness: MaybeLikeness) => boolean }
>

export type CompareFilter = keyof typeof compareFilters

/** The arrow pointing at the other side. */
export function TowardOther({ side }: { side: Pane['side'] }) {
  return side === 'left' ? <ArrowRightIcon /> : <ArrowLeftIcon />
}

export function CompareHead({ other }: { other: Playlist | undefined }) {
  return (
    <TableHead className="w-40 max-md:hidden">
      <span className="block truncate">
        {other ? `In ${other.title}` : 'Other side'}
      </span>
    </TableHead>
  )
}

/** Whether a row is on the other side: the same song, similar songs, or neither. */
export function CompareStatus({ likeness }: { likeness: MaybeLikeness }) {
  if (!likeness) return null
  const status = compareStatus(likeness)
  if (status === 'same')
    return (
      <span className="inline-flex items-center gap-1.5 align-middle text-muted-foreground">
        <CircleCheckIcon className="size-3.5 shrink-0 fill-foreground text-card" />
        Already there
      </span>
    )
  if (status === 'similar')
    return (
      <Badge className="bg-warn align-middle font-medium text-foreground">
        {likeness.length} similar
      </Badge>
    )
  return <span className="text-subtle">Not there</span>
}

/**
 * Above a list: the rows here that look like the row focused on the other side, and why. These
 * rows are also highlighted in the list.
 */
export function IncomingMatches({
  pane,
  describe,
}: {
  pane: Pane
  /** A row's title and the line under it. */
  describe: (id: string) => { title: string; detail: string } | undefined
}) {
  if (!pane.incoming) return null
  const { title, likenesses } = pane.incoming

  return (
    <div className="shrink-0 border-b bg-background px-3 py-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className={cn(pane.side === 'left' && 'order-last')}>
          <TowardOther side={pane.side === 'left' ? 'right' : 'left'} />
        </span>
        <span className="min-w-0 truncate">
          <span className="font-medium text-foreground">{title}</span>
          {likenesses.length === 0
            ? ' · not here'
            : ` · ${likenesses.length} ${compareStatus(likenesses) === 'same' ? 'match' : 'similar'} here`}
        </span>
      </div>
      {likenesses.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1">
          {likenesses.map((likeness) => {
            const row = describe(likeness.id)
            if (!row) return null
            return (
              <li
                key={likeness.id}
                className="flex items-center gap-3 rounded-md border bg-card px-2.5 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate">{row.title}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {row.detail}
                  </div>
                </div>
                <span
                  className={cn(
                    'shrink-0 text-[11px]',
                    likeness.kind === 'same'
                      ? 'text-muted-foreground'
                      : 'font-medium',
                  )}
                >
                  {likeness.reason}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
