import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { formatCount } from '@/lib/format'
import type { Playlist, Service } from '@/lib/types'

export function ServiceTag({ service }: { service: Service }) {
  return <Badge variant="tag">{service === 'youtube' ? 'YT' : 'AM'}</Badge>
}

/** A playlist's service, title and song count, as shown in menus and tabs. */
export function PlaylistLabel({
  playlist,
  children,
}: {
  playlist: Playlist
  /** Shown between the title and the count. */
  children?: ReactNode
}) {
  return (
    <>
      <ServiceTag service={playlist.service} />
      <span className="truncate">{playlist.title}</span>
      {children}
      <Badge variant="count" className="ml-auto">
        {formatCount(playlist.count)}
      </Badge>
    </>
  )
}
