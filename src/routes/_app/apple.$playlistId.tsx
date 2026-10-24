import { createFileRoute } from '@tanstack/react-router'
import { AppleList } from '@/components/apple-list'
import { ListPending } from '@/components/list-layout'
import { songsQuery } from '@/lib/queries'

export const Route = createFileRoute('/_app/apple/$playlistId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(songsQuery(params.playlistId)),
  pendingComponent: () => (
    <ListPending
      service="apple"
      playlistId={Route.useParams().playlistId}
      noun="song"
    />
  ),
  component: ApplePlaylist,
})

function ApplePlaylist() {
  return <AppleList playlistId={Route.useParams().playlistId} />
}
