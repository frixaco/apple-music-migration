import { useIsFetching, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronDownIcon, PinIcon, PlusIcon, RefreshCwIcon } from 'lucide-react'
import { useState } from 'react'
import { NewPlaylistDialog } from '@/components/new-playlist-dialog'
import { ServiceTag } from '@/components/service-tag'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { setPinned } from '@/functions/playlists'
import { formatCount } from '@/lib/format'
import { playlistRoute } from '@/lib/playlist-route'
import { playlistsQuery } from '@/lib/queries'
import type { Playlist, Service } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Finds, opens, pins and creates playlists. `columns` is the desktop picker with YouTube and
 * Apple Music side by side; `menu` is the mobile dropdown that replaces the tabs.
 */
export function PlaylistPicker({
  variant,
  current,
}: {
  variant: 'columns' | 'menu'
  current?: Playlist
}) {
  const [open, setOpen] = useState(false)
  const [newService, setNewService] = useState<Service | null>(null)
  const { data: playlists = [] } = useQuery(playlistsQuery)
  const navigate = useNavigate()

  const openPlaylist = (playlist: Playlist) => {
    setOpen(false)
    void navigate(playlistRoute(playlist))
  }
  const createOn = (service: Service) => {
    setOpen(false)
    setNewService(service)
  }
  const byService = (service: Service) =>
    playlists.filter((playlist) => playlist.service === service)

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {variant === 'columns' ? (
            <Button variant="outline" className="border-dashed">
              <PlusIcon />
              Playlists
              <Badge variant="count">{playlists.length}</Badge>
              <ChevronDownIcon className="text-subtle" />
            </Button>
          ) : (
            <Button variant="secondary" className="min-w-0 flex-1 justify-start">
              {current && <ServiceTag service={current.service} />}
              <span className="truncate">{current?.title ?? 'Playlists'}</span>
              {current && <Badge variant="count">{formatCount(current.count)}</Badge>}
              <ChevronDownIcon className="ml-auto text-subtle" />
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent
          align={variant === 'columns' ? 'end' : 'start'}
          className={cn(
            'p-0',
            variant === 'columns'
              ? 'w-[720px]'
              : 'w-(--radix-popover-trigger-width) min-w-[calc(100vw-1rem)]',
          )}
        >
          <Command>
            <div className="flex items-center border-b pr-2 [&_[data-slot=command-input-wrapper]]:flex-1 [&_[data-slot=command-input-wrapper]]:border-0">
              <CommandInput placeholder="Find playlist" />
              {variant === 'columns' ? (
                <span className="mr-2 text-[11px] text-subtle">
                  Pinned playlists show as tabs
                </span>
              ) : (
                <Badge variant="count">{playlists.length}</Badge>
              )}
              {variant === 'columns' && <RefreshButton />}
            </div>
            {variant === 'columns' ? (
              <div className="grid grid-cols-2 divide-x">
                {(['youtube', 'apple'] as const).map((service) => (
                  <CommandList key={service} className="max-h-none">
                    <CommandEmpty>No playlists</CommandEmpty>
                    <CommandGroup
                      heading={`${service === 'youtube' ? 'YouTube' : 'Apple Music'} · ${byService(service).length}`}
                      className="h-80 overflow-y-auto"
                    >
                      {byService(service).map((playlist) => (
                        <PlaylistItem
                          key={playlist.id}
                          playlist={playlist}
                          onSelect={openPlaylist}
                        />
                      ))}
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem onSelect={() => createOn(service)}>
                        <PlusIcon />
                        New {service === 'youtube' ? 'YouTube' : 'Apple Music'} playlist
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                ))}
              </div>
            ) : (
              <>
                <CommandList className="max-h-[60svh]">
                  <CommandEmpty>No playlists</CommandEmpty>
                  {[
                    { heading: 'Pinned', items: playlists.filter((p) => p.pinned) },
                    { heading: 'YouTube', items: byService('youtube').filter((p) => !p.pinned) },
                    { heading: 'Apple Music', items: byService('apple').filter((p) => !p.pinned) },
                  ].map(({ heading, items }) => (
                    <CommandGroup key={heading} heading={`${heading} · ${items.length}`}>
                      {items.map((playlist) => (
                        <PlaylistItem
                          key={`${playlist.service}:${playlist.id}`}
                          playlist={playlist}
                          onSelect={openPlaylist}
                        />
                      ))}
                    </CommandGroup>
                  ))}
                </CommandList>
                <div className="flex items-center justify-between border-t p-1">
                  <Button variant="ghost" onClick={() => createOn('apple')}>
                    <PlusIcon />
                    New Apple Music playlist
                  </Button>
                  <RefreshButton />
                </div>
              </>
            )}
          </Command>
        </PopoverContent>
      </Popover>
      <NewPlaylistDialog
        service={newService}
        onOpenChange={(isOpen) => !isOpen && setNewService(null)}
      />
    </>
  )
}

function PlaylistItem({
  playlist,
  onSelect,
}: {
  playlist: Playlist
  onSelect: (playlist: Playlist) => void
}) {
  const queryClient = useQueryClient()
  const pin = useMutation({
    mutationFn: setPinned,
    // Pins only change local state, so update the cached list instead of refetching every playlist.
    onMutate: ({ data }) =>
      queryClient.setQueryData(playlistsQuery.queryKey, (playlists) =>
        playlists?.map((item) =>
          item.service === data.service && item.id === data.playlistId
            ? { ...item, pinned: data.pinned }
            : item,
        ),
      ),
  })

  return (
    <CommandItem
      value={`${playlist.service}:${playlist.id}`}
      keywords={[playlist.title]}
      onSelect={() => onSelect(playlist)}
      className="group/playlist"
    >
      <ServiceTag service={playlist.service} />
      <span className="truncate">{playlist.title}</span>
      {playlist.service === 'apple' && !playlist.canEdit && !playlist.isFavorites && (
        <span className="text-[11px] text-subtle">read-only</span>
      )}
      <Badge variant="count" className="ml-auto">
        {formatCount(playlist.count)}
      </Badge>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={playlist.pinned ? 'Unpin' : 'Pin as tab'}
        aria-pressed={playlist.pinned}
        className={cn(
          'text-subtle hover:text-foreground',
          playlist.pinned ? 'text-foreground' : 'opacity-0 group-data-[selected=true]/playlist:opacity-100',
        )}
        onClick={(event) => {
          event.stopPropagation()
          pin.mutate({
            data: {
              service: playlist.service,
              playlistId: playlist.id,
              pinned: !playlist.pinned,
            },
          })
        }}
      >
        <PinIcon className={cn(playlist.pinned && 'fill-current')} />
      </Button>
    </CommandItem>
  )
}

function RefreshButton() {
  const queryClient = useQueryClient()
  const fetching = useIsFetching({ queryKey: playlistsQuery.queryKey }) > 0

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={fetching}
      onClick={() => queryClient.invalidateQueries({ queryKey: playlistsQuery.queryKey })}
    >
      <RefreshCwIcon className={cn(fetching && 'animate-spin')} />
      Refresh
    </Button>
  )
}
