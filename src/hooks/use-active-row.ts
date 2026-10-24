import { useCallback, useState } from 'react'

/**
 * The row whose details are shown: the last one clicked, or the first visible row. On mobile the
 * details open in a sheet, which `open` controls.
 */
export function useActiveRow<T>(
  items: T[],
  visible: T[],
  idOf: (item: T) => string,
) {
  const [activeId, setActiveId] = useState<string | undefined>()
  const [open, setOpen] = useState(false)
  // Stable, so memoized rows can take it.
  const show = useCallback((id: string) => {
    setActiveId(id)
    setOpen(true)
  }, [])

  return {
    active: items.find((item) => idOf(item) === activeId) ?? visible.at(0),
    open,
    setOpen,
    /** Shows the row with this id. */
    show,
  }
}
