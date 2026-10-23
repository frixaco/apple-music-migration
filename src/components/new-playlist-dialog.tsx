import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { createPlaylist } from '@/functions/playlists'
import { playlistRoute, serviceName } from '@/lib/playlist'
import type { Service } from '@/lib/types'

export function NewPlaylistDialog({
  service,
  onOpenChange,
}: {
  /** The service to create the playlist on; the dialog is open while this is set. */
  service: Service | null
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: createPlaylist,
    meta: { invalidates: [['playlists']], success: 'Playlist created' },
    onSuccess: (playlistId, { data }) => {
      onOpenChange(false)
      void navigate(playlistRoute({ service: data.service, id: playlistId }))
    },
  })

  return (
    <Dialog open={service !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault()
            const title = String(new FormData(event.currentTarget).get('title'))
            create.mutate({ data: { service: service!, title } })
          }}
        >
          <DialogHeader>
            <DialogTitle>New {service && serviceName[service]} playlist</DialogTitle>
            <DialogDescription>
              {service === 'youtube'
                ? 'Created as a private playlist.'
                : 'Added to your Apple Music library.'}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="playlist-title">Name</FieldLabel>
            <Input id="playlist-title" name="title" required autoFocus />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Spinner />}
              Create playlist
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
