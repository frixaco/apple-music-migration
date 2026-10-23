import { useState } from 'react'

/**
 * The row whose details are shown: the last one clicked, or the first visible row. On mobile the
 * details open in a sheet, which `open` controls.
 */
export function useActiveRow<T>(items: T[], visible: T[], idOf: (item: T) => string) {
  const [activeId, setActiveId] = useState<string | undefined>()
  const [open, setOpen] = useState(false)

  return {
    active: items.find((item) => idOf(item) === activeId) ?? visible.at(0),
    open,
    setOpen,
    show: (item: T) => {
      setActiveId(idOf(item))
      setOpen(true)
    },
  }
}
