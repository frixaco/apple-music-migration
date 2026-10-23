import { useQuery } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { NewPlaylistDialog } from '@/components/new-playlist-dialog'
import { ServiceTag } from '@/components/service-tag'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Spinner } from '@/components/ui/spinner'
import { formatCount } from '@/lib/format'
import { playlistsQuery } from '@/lib/queries'
import type { Playlist, Service } from '@/lib/types'

function PlaylistLabel({ playlist }: { playlist: Playlist }) {
  return (
    <>
      <ServiceTag service={playlist.service} />
      <span className="truncate">{playlist.title}</span>
      <Badge variant="count" className="ml-auto">
        {formatCount(playlist.count)}
      </Badge>
    </>
  )
}

function MenuFooter({ note, children }: { note: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t p-2">
      <span className="text-[11px] text-subtle">{note}</span>
      {children}
    </div>
  )
}

/** Picks one or more Apple Music playlists to add songs to. */
export function AddToAppleMenu({
  count,
  noun,
  defaultSelected = [],
  pending,
  onAdd,
  children,
}: {
  count: number
  noun: string
  defaultSelected?: string[]
  pending: boolean
  onAdd: (playlistIds: string[]) => void
  /** The trigger button. */
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState(defaultSelected)
  const { data: playlists = [] } = useQuery(playlistsQuery)
  // Apple Music only accepts additions to playlists the app may edit, and to Favourite Songs.
  const targets = playlists.filter(
    (playlist) => playlist.service === 'apple' && (playlist.canEdit || playlist.isFavorites),
  )
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Command>
            <CommandList>
              <CommandEmpty>No Apple Music playlists</CommandEmpty>
              <CommandGroup heading={`Add ${count} ${noun} to`}>
                {targets.map((playlist) => (
                  <CommandItem key={playlist.id} onSelect={() => toggle(playlist.id)}>
                    <Checkbox
                      checked={selected.includes(playlist.id)}
                      tabIndex={-1}
                      className="pointer-events-none"
                    />
                    <span className="truncate">{playlist.title}</span>
                    <Badge variant="count" className="ml-auto">
                      {formatCount(playlist.count)}
                    </Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setOpen(false)
                    setCreating(true)
                  }}
                >
                  <PlusIcon />
                  New Apple Music playlist…
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
          <MenuFooter note="Added rows move to Done">
            <Button
              disabled={selected.length === 0 || pending}
              onClick={() => {
                onAdd(selected)
                setOpen(false)
              }}
            >
              {pending && <Spinner />}
              Add to {selected.length} {selected.length === 1 ? 'playlist' : 'playlists'}
            </Button>
          </MenuFooter>
        </PopoverContent>
      </Popover>
      <NewPlaylistDialog
        service={creating ? 'apple' : null}
        onOpenChange={setCreating}
      />
    </>
  )
}

/**
 * Picks one target playlist for videos. A YouTube target is a straight move; an Apple Music
 * target means the videos are searched first and reviewed in a match run.
 */
export function MoveMenu({
  count,
  sourceTitle,
  sourceId,
  services,
  pending,
  onMove,
  children,
}: {
  count: number
  sourceTitle: string
  sourceId: string
  services: Service[]
  pending: boolean
  onMove: (target: Playlist, removeFromSource: boolean) => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [targetKey, setTargetKey] = useState('')
  const [removeFromSource, setRemoveFromSource] = useState(true)
  const { data: playlists = [] } = useQuery(playlistsQuery)
  const keyOf = (playlist: Playlist) => `${playlist.service}:${playlist.id}`
  const target = playlists.find((playlist) => keyOf(playlist) === targetKey)
  const groups = services.map((service) => ({
    service,
    items: playlists.filter(
      (playlist) =>
        playlist.service === service &&
        playlist.id !== sourceId &&
        (service === 'youtube' || playlist.canEdit || playlist.isFavorites),
    ),
  }))
  const videos = `${count} ${count === 1 ? 'video' : 'videos'}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder={`Move ${videos} from ${sourceTitle} to…`} />
          <RadioGroup value={targetKey} onValueChange={setTargetKey} className="gap-0">
            <CommandList>
              <CommandEmpty>No playlists</CommandEmpty>
              {groups.map(({ service, items }) => (
                <CommandGroup
                  key={service}
                  heading={
                    service === 'youtube'
                      ? 'YouTube'
                      : 'Apple Music · searched first, you review'
                  }
                >
                  {items.map((playlist) => (
                    <CommandItem
                      key={keyOf(playlist)}
                      value={keyOf(playlist)}
                      keywords={[playlist.title]}
                      onSelect={() => setTargetKey(keyOf(playlist))}
                    >
                      <RadioGroupItem
                        value={keyOf(playlist)}
                        tabIndex={-1}
                        className="pointer-events-none"
                      />
                      <PlaylistLabel playlist={playlist} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </RadioGroup>
        </Command>
        <Label className="gap-2 border-t px-3 py-2.5">
          <Checkbox
            checked={removeFromSource}
            onCheckedChange={(checked) => setRemoveFromSource(checked === true)}
          />
          Remove from {sourceTitle} after moving
        </Label>
        <MenuFooter
          note={
            target?.service === 'apple'
              ? `${videos} need a match first`
              : 'Moved rows go to Done'
          }
        >
          <Button
            disabled={!target || pending}
            onClick={() => {
              onMove(target!, removeFromSource)
              setOpen(false)
            }}
          >
            {pending && <Spinner />}
            {target?.service === 'apple'
              ? `Search ${count} and review`
              : `Move ${videos}`}
          </Button>
        </MenuFooter>
      </PopoverContent>
    </Popover>
  )
}
