import { SearchIcon } from 'lucide-react'
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
import { formatCount } from '@/lib/format'

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
  selection,
  id,
  label,
}: {
  selection: Selection
  id: string
  label: string
}) {
  return (
    <TableCell onClick={(event) => event.stopPropagation()}>
      <Checkbox
        aria-label={`Select ${label}`}
        checked={selection.isSelected(id)}
        onCheckedChange={(checked) => selection.toggle(id, checked === true)}
      />
    </TableCell>
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
