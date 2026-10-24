import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useParams, useSearch } from '@tanstack/react-router'
import { Columns2Icon, SearchIcon } from 'lucide-react'
import { AccountMenu } from '@/components/account-menu'
import { Brand } from '@/components/brand'
import { PlaylistPicker } from '@/components/playlist-picker'
import { PlaylistLabel } from '@/components/playlist-label'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { playlistKey, playlistRoute } from '@/lib/playlist'
import { playlistsQuery, runQuery } from '@/lib/queries'
import type { Playlist } from '@/lib/types'

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
            key={playlistKey(playlist)}
            variant="ghost"
            className="text-muted-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground"
            asChild
          >
            <Link {...playlistRoute(playlist)}>
              <PlaylistLabel playlist={playlist} />
            </Link>
          </Button>
        ))}
        <PlaylistPicker variant="columns" />
      </nav>
      <div className="flex min-w-0 flex-1 md:hidden">
        <PlaylistPicker variant="menu" current={current} />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <SplitButton current={current} />
        <RunButton />
        <AccountMenu />
      </div>
    </header>
  )
}

function RunButton() {
  const { data: run } = useQuery(runQuery)
  if (!run) return null

  const searched = run.matches.filter(
    (item) => item.status !== 'searching',
  ).length

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

/** Opens the current playlist on the left of the split view, or leaves the split view. */
function SplitButton({ current }: { current: Playlist | undefined }) {
  const { pathname } = useLocation()
  const { left } = useSearch({ strict: false })
  const { data: playlists = [] } = useQuery(playlistsQuery)

  if (pathname === '/split') {
    const leftPlaylist = playlists.find(
      (playlist) => playlistKey(playlist) === left,
    )
    return (
      <Button variant="secondary" aria-pressed asChild>
        <Link {...(leftPlaylist ? playlistRoute(leftPlaylist) : { to: '/' })}>
          <Columns2Icon />
          <span className="max-md:hidden">Side by side</span>
        </Link>
      </Button>
    )
  }

  return (
    <Button variant="outline" asChild>
      <Link
        to="/split"
        search={{ left: current ? playlistKey(current) : undefined }}
      >
        <Columns2Icon />
        <span className="max-md:hidden">Side by side</span>
      </Link>
    </Button>
  )
}
