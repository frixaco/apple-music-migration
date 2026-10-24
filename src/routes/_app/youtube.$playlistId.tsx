import { createFileRoute } from '@tanstack/react-router'
import { ListPending } from '@/components/list-layout'
import { YouTubeList } from '@/components/youtube-list'
import { videosQuery } from '@/lib/queries'

export const Route = createFileRoute('/_app/youtube/$playlistId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(videosQuery(params.playlistId)),
  pendingComponent: () => (
    <ListPending
      service="youtube"
      playlistId={Route.useParams().playlistId}
      noun="video"
    />
  ),
  component: YouTubePlaylist,
})

function YouTubePlaylist() {
  return <YouTubeList playlistId={Route.useParams().playlistId} />
}
