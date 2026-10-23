import { ArrowUpRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** A muted link that opens YouTube or Apple Music in a new tab. */
export function ExternalLink({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: ReactNode
}) {
  return (
    <Button
      variant="link"
      className={cn('h-auto p-0 text-muted-foreground', className)}
      asChild
    >
      <a href={href} target="_blank" rel="noreferrer">
        {children}
        <ArrowUpRightIcon />
      </a>
    </Button>
  )
}
