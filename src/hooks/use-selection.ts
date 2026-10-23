import { useMemo, useState } from 'react'

/** Checkbox selection over a list; ids that leave the list drop out of the selection. */
export function useSelection(ids: string[]) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const visible = useMemo(
    () => new Set(ids.filter((id) => selected.has(id))),
    [ids, selected],
  )

  return {
    selected: visible,
    isSelected: (id: string) => visible.has(id),
    toggle: (id: string, checked: boolean) =>
      setSelected((current) => {
        const next = new Set(current)
        if (checked) next.add(id)
        else next.delete(id)
        return next
      }),
    /** State for the header checkbox. */
    allState:
      visible.size === 0
        ? false
        : visible.size === ids.length
          ? true
          : ('indeterminate' as const),
    setAll: (checked: boolean) => setSelected(new Set(checked ? ids : [])),
    clear: () => setSelected(new Set()),
  }
}

export type Selection = ReturnType<typeof useSelection>
