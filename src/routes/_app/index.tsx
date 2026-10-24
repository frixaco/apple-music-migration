import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ListMusicIcon } from 'lucide-react'
import { PlaylistLabel } from '@/components/playlist-label'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { playlistKey, playlistRoute, serviceName } from '@/lib/playlist'
import { playlistsQuery } from '@/lib/queries'

export const Route = createFileRoute('/_app/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(playlistsQuery),
  component: Home,
})

/** Nothing opens until you choose a playlist. */
function Home() {
  const { data: playlists } = useSuspenseQuery(playlistsQuery)

  if (playlists.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListMusicIcon />
          </EmptyMedia>
          <EmptyTitle>No playlists yet</EmptyTitle>
          <EmptyDescription>
            Create a playlist on YouTube or Apple Music from the Playlists menu.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl p-6 max-md:p-3">
        <h1 className="text-[15px] font-medium">Choose a playlist</h1>
        <p className="mt-1 text-muted-foreground">
          Open a YouTube playlist to find its videos on Apple Music, or an Apple
          Music playlist to see its songs and the videos they came from.
        </p>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {(['youtube', 'apple'] as const).map((service) => {
            const items = playlists.filter(
              (playlist) => playlist.service === service,
            )
            return (
              <section key={service}>
                <h2 className="mb-1 px-2 text-[11px] text-subtle">
                  {serviceName[service]} · {items.length}
                </h2>
                <nav className="flex flex-col">
                  {items.map((playlist) => (
                    <Link
                      key={playlistKey(playlist)}
                      {...playlistRoute(playlist)}
                      className="flex h-8 min-w-0 items-center gap-2 rounded-md px-2 hover:bg-accent"
                    >
                      <PlaylistLabel playlist={playlist} />
                    </Link>
                  ))}
                  {items.length === 0 && (
                    <span className="px-2 text-muted-foreground">
                      No playlists
                    </span>
                  )}
                </nav>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
