import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useParams } from '@tanstack/react-router'
import { SearchIcon } from 'lucide-react'
import { AccountMenu } from '@/components/account-menu'
import { Brand } from '@/components/brand'
import { PlaylistPicker } from '@/components/playlist-picker'
import { ServiceTag } from '@/components/service-tag'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { formatCount } from '@/lib/format'
import { playlistRoute } from '@/lib/playlist-route'
import { playlistsQuery, runQuery } from '@/lib/queries'

export function TopBar() {
  const { data: playlists = [] } = useQuery(playlistsQuery)
  const { playlistId } = useParams({ strict: false })
  const { pathname } = useLocation()
  const service = pathname.startsWith('/apple') ? 'apple' : 'youtube'
  const current = playlists.find(
    (playlist) => playlist.id === playlistId && playlist.service === service,
  )
  const pinned = playlists.filter((playlist) => playlist.pinned)

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b bg-card px-3">
      <Brand compact />
      <nav className="flex min-w-0 items-center gap-1 max-md:hidden">
        {pinned.map((playlist) => (
          <Button
            key={`${playlist.service}:${playlist.id}`}
            variant="ghost"
            className="text-muted-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground"
            asChild
          >
            <Link {...playlistRoute(playlist)}>
              <ServiceTag service={playlist.service} />
              <span className="truncate">{playlist.title}</span>
              <Badge variant="count">{formatCount(playlist.count)}</Badge>
            </Link>
          </Button>
        ))}
        <PlaylistPicker variant="columns" />
      </nav>
      <div className="flex min-w-0 flex-1 md:hidden">
        <PlaylistPicker variant="menu" current={current} />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <RunButton />
        <AccountMenu />
      </div>
    </header>
  )
}

function RunButton() {
  const { data: run } = useQuery(runQuery)
  if (!run) return null

  const searched = run.matches.filter((item) => item.status !== 'searching').length

  return (
    <Button variant="outline" asChild>
      <Link to="/run">
        {searched < run.matches.length ? <Spinner /> : <SearchIcon />}
        <span className="max-w-64 truncate max-md:hidden">
          Match run · {run.sourcePlaylistTitle}
        </span>
        <span className="font-mono text-[11px] text-subtle">
          {searched} / {run.matches.length}
          <span className="max-md:hidden"> searched</span>
        </span>
      </Link>
    </Button>
  )
}
