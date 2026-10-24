import { useVirtualizer } from '@tanstack/react-virtual'
import { SearchIcon } from 'lucide-react'
import { useRef } from 'react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { TableCell, TableHead } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Selection } from '@/hooks/use-selection'
import { ExternalLink } from '@/components/external-link'
import { ServiceTag } from '@/components/playlist-label'
import { formatCount, plural } from '@/lib/format'
import { canAddTo, playlistUrl, serviceName } from '@/lib/playlist'
import type { Playlist } from '@/lib/types'

/** Which playlist a list shows: its service, title, size and a link to the original. */
export function PlaylistHeader({
  playlist,
  noun,
}: {
  playlist: Playlist
  /** Singular noun for an item, e.g. "video". */
  noun: string
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
      <ServiceTag service={playlist.service} />
      <h1 className="min-w-0 truncate font-medium" title={playlist.title}>
        {playlist.title}
      </h1>
      <span className="shrink-0 whitespace-nowrap text-muted-foreground">
        <span className="max-md:hidden">
          {serviceName[playlist.service]} playlist ·{' '}
        </span>
        {plural(playlist.count, noun)}
        {!canAddTo(playlist) && ' · read-only'}
      </span>
      <ExternalLink
        href={playlistUrl(playlist)}
        className="ml-auto shrink-0 max-md:hidden"
      >
        Open in {serviceName[playlist.service]}
      </ExternalLink>
    </div>
  )
}

/** The bar above a list: filters on the left, actions for selected rows on the right. */
export function ListToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-b px-3">
      {children}
    </div>
  )
}

/** The right side of a list toolbar: how many rows are selected, then the actions for them. */
export function ListActions({
  selectedCount,
  children,
}: {
  selectedCount: number
  children: ReactNode
}) {
  return (
    <div className="ml-auto flex items-center gap-2">
      {selectedCount > 0 && (
        <span className="whitespace-nowrap text-muted-foreground">
          {selectedCount} selected
        </span>
      )}
      {children}
    </div>
  )
}

/** Segmented filters over a list, each with the number of items it matches. */
export function FilterTabs<TItem, TKey extends string>({
  filters,
  items,
  value,
  onValueChange,
  className,
}: {
  filters: Record<TKey, { label: string; test: (item: TItem) => boolean }>
  items: TItem[]
  value: TKey
  onValueChange: (value: TKey) => void
  className?: string
}) {
  return (
    <ToggleGroup
      type="single"
      variant="segmented"
      value={value}
      onValueChange={(next) => next && onValueChange(next as TKey)}
      className={className}
    >
      {(Object.keys(filters) as TKey[]).map((key) => (
        <ToggleGroupItem key={key} value={key}>
          {filters[key].label}
          <Badge variant="count">
            {formatCount(items.filter(filters[key].test).length)}
          </Badge>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** A text filter in a list toolbar. */
export function FilterInput({
  value,
  onChange,
  placeholder = 'Filter',
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <InputGroup className={className}>
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </InputGroup>
  )
}

/** The header cell that selects every visible row. */
export function SelectAllHead({ selection }: { selection: Selection }) {
  return (
    <TableHead className="w-8">
      <Checkbox
        aria-label="Select all"
        checked={selection.allState}
        onCheckedChange={(checked) => selection.setAll(checked === true)}
      />
    </TableHead>
  )
}

/** The checkbox cell of a row; clicking it doesn't open the row's details. */
export function SelectRowCell({
  id,
  label,
  checked,
  onToggle,
}: {
  id: string
  label: string
  checked: boolean
  onToggle: Selection['toggle']
}) {
  return (
    <TableCell onClick={(event) => event.stopPropagation()}>
      <Checkbox
        aria-label={`Select ${label}`}
        checked={checked}
        onCheckedChange={(value) => onToggle(id, value === true)}
      />
    </TableCell>
  )
}

/**
 * The rows of a long list, rendering only those near the visible part of the table's scrolling
 * container. Each row must pass `index` as `data-index` and `measureRef` as its `ref`.
 */
export function VirtualRows<T>({
  items,
  columns,
  estimateSize,
  getKey,
  children,
}: {
  items: T[]
  /** Number of columns, for the spacer rows above and below. */
  columns: number
  /** Row height in pixels before it is measured. */
  estimateSize: number
  getKey: (item: T) => string
  children: (
    item: T,
    index: number,
    measureRef: (row: Element | null) => void,
  ) => ReactNode
}) {
  const spacer = useRef<HTMLTableRowElement>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () =>
      spacer.current?.closest('[data-slot="table-container"]') ?? null,
    estimateSize: () => estimateSize,
    getItemKey: (index) => getKey(items[index]),
    overscan: 12,
    // Rows the server renders before the container has been measured.
    initialRect: { width: 0, height: 1200 },
  })
  const rows = virtualizer.getVirtualItems()
  const before = rows.at(0)?.start ?? 0
  const after = virtualizer.getTotalSize() - (rows.at(-1)?.end ?? 0)

  return (
    <>
      <tr ref={spacer} aria-hidden>
        <td colSpan={columns} style={{ height: before, padding: 0 }} />
      </tr>
      {rows.map((row) =>
        children(items[row.index], row.index, virtualizer.measureElement),
      )}
      <tr aria-hidden>
        <td colSpan={columns} style={{ height: after, padding: 0 }} />
      </tr>
    </>
  )
}

/** The status line under a list. */
export function ListFooter({
  start,
  end,
}: {
  start: ReactNode
  end?: ReactNode
}) {
  return (
    <div className="flex h-7 shrink-0 items-center justify-between gap-4 border-t px-3 text-[11px] text-subtle">
      <span className="truncate">{start}</span>
      <span className="truncate max-md:hidden">{end}</span>
    </div>
  )
}
