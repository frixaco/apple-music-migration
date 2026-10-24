import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'

/** Distance from the visible top or bottom edge of the list where dragging starts to scroll it. */
const scrollEdge = 24
const maxScrollSpeed = 30

/**
 * Checkbox selection over a list; ids that leave the list drop out of the selection.
 *
 * Spread `bodyProps` on the list's `<TableBody>`, whose rows must be in the same order as `ids`,
 * to select by dragging: a plain drag replaces the selection with the dragged rows, Shift adds
 * them and Ctrl (or ⌘) removes them. Shift- and Ctrl-clicking a single row adds or removes it.
 * Dragging past the top or bottom of the scrolling container scrolls it.
 */
export function useSelection(ids: string[]) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const visible = useMemo(
    () => new Set(ids.filter((id) => selected.has(id))),
    [ids, selected],
  )

  const latest = useRef({ ids, selected: visible })
  latest.current = { ids, selected: visible }
  const stopDrag = useRef<(() => void) | undefined>(undefined)
  useEffect(() => () => stopDrag.current?.(), [])

  const startDrag = (event: ReactMouseEvent<HTMLTableSectionElement>) => {
    const body = event.currentTarget
    const row = (event.target as Element).closest('tr')
    const container = body.closest<HTMLElement>('[data-slot="table-container"]')
    if (event.button !== 0 || !row || row.parentElement !== body || !container)
      return
    // No text selection or native image drag while selecting rows.
    event.preventDefault()
    stopDrag.current?.()

    const mode =
      event.ctrlKey || event.metaKey
        ? 'remove'
        : event.shiftKey
          ? 'add'
          : 'replace'
    const base = latest.current.selected
    const anchor = row.sectionRowIndex
    let current = anchor
    // A plain press only becomes a drag once it reaches another row; until then it is a click.
    let started = mode !== 'replace'
    let pointerY = event.clientY

    const apply = () => {
      const range = latest.current.ids.slice(
        Math.min(anchor, current),
        Math.max(anchor, current) + 1,
      )
      if (mode === 'replace') return setSelected(new Set(range))
      const next = new Set(base)
      for (const id of range) {
        if (mode === 'add') next.add(id)
        else next.delete(id)
      }
      setSelected(next)
    }

    const rowAt = (y: number) => {
      const rows = body.rows
      let low = 0
      let high = rows.length - 1
      while (low < high) {
        const middle = (low + high) >> 1
        if (rows[middle].getBoundingClientRect().bottom <= y) low = middle + 1
        else high = middle
      }
      return low
    }

    let frame = 0
    const tick = () => {
      const rect = container.getBoundingClientRect()
      const top =
        rect.top + (container.querySelector('thead')?.offsetHeight ?? 0)
      if (started) {
        const overshoot =
          pointerY < top + scrollEdge
            ? pointerY - top - scrollEdge
            : pointerY > rect.bottom - scrollEdge
              ? pointerY - rect.bottom + scrollEdge
              : 0
        if (overshoot)
          container.scrollTop +=
            Math.sign(overshoot) *
            Math.min(
              maxScrollSpeed,
              Math.max(1, Math.round(Math.abs(overshoot) / 3)),
            )
      }
      const index = rowAt(Math.min(Math.max(pointerY, top), rect.bottom - 1))
      if (body.rows.length && index !== current) {
        current = index
        started = true
        apply()
      }
      frame = requestAnimationFrame(tick)
    }

    const move = (moveEvent: MouseEvent) => {
      if (moveEvent.buttons & 1) pointerY = moveEvent.clientY
      else stop()
    }
    const up = () => {
      stop()
      if (!started) return
      // The click that ends a drag or a modifier click must not toggle a checkbox or open details.
      const swallow = (clickEvent: MouseEvent) => {
        clickEvent.stopPropagation()
        clickEvent.preventDefault()
      }
      window.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() =>
        window.removeEventListener('click', swallow, { capture: true }),
      )
    }
    const stop = () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      stopDrag.current = undefined
    }

    stopDrag.current = stop
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    if (started) apply()
    frame = requestAnimationFrame(tick)
  }

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
    /** Drag selection over the rows of a `<TableBody>`. */
    bodyProps: {
      onMouseDown: startDrag,
      // On macOS Ctrl-click opens the context menu instead of removing the row.
      onContextMenu: (event: ReactMouseEvent) => {
        if (event.ctrlKey) event.preventDefault()
      },
    },
  }
}

export type Selection = ReturnType<typeof useSelection>
