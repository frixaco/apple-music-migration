import type { ReactNode } from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useIsMobile } from '@/hooks/use-mobile'

/**
 * The details of the focused row: a fixed panel on the right on desktop, a bottom sheet on mobile.
 * On mobile the sheet is open while `open` is true.
 */
export function DetailPanel({
  title,
  meta,
  open,
  onOpenChange,
  footer,
  children,
}: {
  title: string
  meta?: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  footer?: ReactNode
  children: ReactNode
}) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85svh]">
          <DrawerHeader className="sr-only">
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto">{children}</div>
          {footer && <DrawerFooter className="border-t">{footer}</DrawerFooter>}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l bg-card">
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-4">
        <h2 className="font-medium">{title}</h2>
        <span className="font-mono text-[11px] text-subtle">{meta}</span>
      </div>
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">{children}</ScrollArea>
      {footer && (
        <div className="flex shrink-0 items-center gap-2 border-t px-4 py-3">{footer}</div>
      )}
    </aside>
  )
}

/** A label and value row in a detail panel. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2 py-1">
      <dt className="text-subtle">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}
