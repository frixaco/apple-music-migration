import { Link } from '@tanstack/react-router'
import { Columns2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="mr-2 flex items-center gap-1.5 font-semibold">
      <Columns2Icon className="size-4" />
      <span className={cn(compact && 'max-md:sr-only')}>Migrator</span>
    </Link>
  )
}
