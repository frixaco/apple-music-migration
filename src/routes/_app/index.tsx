import { createFileRoute, redirect } from '@tanstack/react-router'
import { ListMusicIcon } from 'lucide-react'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { playlistRoute } from '@/lib/playlist'
import { playlistsQuery } from '@/lib/queries'

export const Route = createFileRoute('/_app/')({
  loader: async ({ context }) => {
    const playlists = await context.queryClient.ensureQueryData(playlistsQuery)
    const first = playlists.find((playlist) => playlist.pinned) ?? playlists.at(0)
    if (first) throw redirect(playlistRoute(first))
  },
  component: NoPlaylists,
})

function NoPlaylists() {
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
