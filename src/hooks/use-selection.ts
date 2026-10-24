import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'

/** Distance from the visible top or bottom edge of the list where dragging starts to scroll it. */
const scrollEdge = 24
/** Fastest auto-scroll, in pixels per millisecond. */
const maxScrollSpeed = 1.8
/** How far the pointer must move before a press counts as a drag that can scroll. */
const dragThreshold = 4

const isMac =
  typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent)

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

  const latest = useRef({ ids, selected })
  latest.current = { ids, selected }
  const stopDrag = useRef<(() => void) | undefined>(undefined)
  useEffect(() => () => stopDrag.current?.(), [])

  const toggle = useCallback(
    (id: string, checked: boolean) =>
      setSelected((current) => {
        const next = new Set(current)
        if (checked) next.add(id)
        else next.delete(id)
        return next
      }),
    [],
  )

  const startDrag = (event: ReactMouseEvent<HTMLTableSectionElement>) => {
    const body = event.currentTarget
    const target = event.target as Element
    const row = target.closest('tr')
    const container = body.closest<HTMLElement>('[data-slot="table-container"]')
    if (event.button !== 0 || !row || row.parentElement !== body || !container)
      return
    // No text selection or native image drag while selecting rows. That also stops focus from
    // moving, so move it by hand: onto a pressed control, otherwise away from e.g. the filter.
    event.preventDefault()
    const control = target.closest<HTMLElement>('button, a, input')
    if (control) control.focus({ preventScroll: true })
    else if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur()
    stopDrag.current?.()

    const mode =
      event.ctrlKey || event.metaKey
        ? 'remove'
        : event.shiftKey
          ? 'add'
          : 'replace'
    // Hidden rows keep their selection, as they do when a checkbox is toggled.
    const base = latest.current.selected
    const anchor = row.sectionRowIndex
    let current = anchor
    // A plain press only becomes a drag once it reaches another row; until then it is a click.
    let started = mode !== 'replace'
    // Only a press that has moved scrolls, so a modifier click on an edge row stays a click.
    let moved = false
    const startY = event.clientY
    let pointerY = startY

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
    let lastTime: number | undefined
    let scrollCarry = 0
    const tick = (time: number) => {
      const elapsed = Math.min(time - (lastTime ?? time), 50)
      lastTime = time
      const rect = container.getBoundingClientRect()
      const top =
        rect.top + (container.querySelector('thead')?.offsetHeight ?? 0)
      if (started && moved) {
        const overshoot =
          pointerY < top + scrollEdge
            ? pointerY - top - scrollEdge
            : pointerY > rect.bottom - scrollEdge
              ? pointerY - rect.bottom + scrollEdge
              : 0
        // Faster the further past the edge, at the same speed on any refresh rate.
        scrollCarry +=
          Math.sign(overshoot) *
          Math.min(maxScrollSpeed, Math.abs(overshoot) / 50) *
          elapsed
        const step = Math.trunc(scrollCarry)
        scrollCarry -= step
        if (step) container.scrollTop += step
      }
      const index = rowAt(Math.min(Math.max(pointerY, top), rect.bottom - 1))
      if (body.rows.length && index !== current) {
        current = index
        started = true
        apply()
      }
      // While dragging, rows ignore the pointer so their hover cards stay closed.
      if (started && moved) body.style.pointerEvents = 'none'
      frame = requestAnimationFrame(tick)
    }

    const move = (moveEvent: MouseEvent) => {
      if (!(moveEvent.buttons & 1)) return stop()
      pointerY = moveEvent.clientY
      if (Math.abs(pointerY - startY) > dragThreshold) moved = true
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
      body.style.pointerEvents = ''
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
    /** Stable, so memoized rows can take it. */
    toggle,
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
        if (isMac && event.ctrlKey) event.preventDefault()
      },
    },
  }
}

export type Selection = ReturnType<typeof useSelection>
