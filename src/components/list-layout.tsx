import type { ReactNode } from 'react'

/** The bar above a list: filters on the left, actions for selected rows on the right. */
export function ListToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-b px-3">
      {children}
    </div>
  )
}

/** The status line under a list. */
export function ListFooter({ start, end }: { start: ReactNode; end?: ReactNode }) {
  return (
    <div className="flex h-7 shrink-0 items-center justify-between gap-4 border-t px-3 text-[11px] text-subtle">
      <span className="truncate">{start}</span>
      <span className="truncate max-md:hidden">{end}</span>
    </div>
  )
}
