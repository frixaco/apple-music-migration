import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { CircleCheckIcon, CircleIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Brand } from '@/components/brand'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { connectApple, disconnectApple } from '@/functions/account'
import { connectYouTube } from '@/lib/auth-client'
import { formatCount } from '@/lib/format'
import { configureMusicKit } from '@/lib/musickit'
import {
  connectionsQuery,
  developerTokenQuery,
  playlistsQuery,
} from '@/lib/queries'
import type { Service } from '@/lib/types'

export const Route = createFileRoute('/connect')({
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: '/sign-in' })
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(connectionsQuery),
  component: Connect,
})

function Connect() {
  const { data: connections } = useQuery(connectionsQuery)
  const queryClient = useQueryClient()
  const musicKit = useQuery({
    queryKey: ['musickit'],
    queryFn: async () =>
      configureMusicKit(await queryClient.fetchQuery(developerTokenQuery)),
    staleTime: Infinity,
  })
  const connect = useMutation({
    mutationFn: async () => {
      const musicUserToken = await musicKit.data!.authorize()
      await connectApple({ data: { musicUserToken } })
    },
    meta: {
      invalidates: [['connections'], ['playlists']],
      success: 'Apple Music connected',
    },
  })
  const disconnect = useMutation({
    mutationFn: () => disconnectApple(),
    meta: { invalidates: [['connections'], ['playlists']] },
  })
  const ready = Boolean(connections?.youtube && connections.apple)

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-11 items-center border-b bg-card px-3">
        <Brand />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[10svh]">
        <Card className="w-full max-w-[480px] gap-0 py-0">
          <CardHeader className="border-b px-4 py-4">
            <CardTitle>Connect your accounts</CardTitle>
            <CardDescription>
              Migrator reads your playlists and only changes them when you apply
              a decision.
            </CardDescription>
          </CardHeader>
          <ConnectionSection
            service="youtube"
            title="YouTube"
            detail={
              connections?.youtube?.email ??
              'Google account with YouTube access'
            }
            connected={Boolean(connections?.youtube)}
            action={
              <Button
                variant={connections?.youtube ? 'ghost' : 'outline'}
                onClick={() => void connectYouTube()}
              >
                {connections?.youtube ? 'Switch account' : 'Connect'}
              </Button>
            }
          />
          <ConnectionSection
            service="apple"
            title="Apple Music"
            detail={
              connections?.apple
                ? `Storefront ${connections.apple.storefront.toUpperCase()}`
                : 'Sign in with your Apple ID'
            }
            connected={Boolean(connections?.apple)}
            action={
              connections?.apple ? (
                <Button
                  variant="ghost"
                  disabled={disconnect.isPending}
                  onClick={() => disconnect.mutate()}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled={!musicKit.data || connect.isPending}
                  onClick={() => connect.mutate()}
                >
                  {(musicKit.isPending || connect.isPending) && <Spinner />}
                  Connect
                </Button>
              )
            }
          />
          <CardFooter className="justify-between gap-4 px-4 py-3">
            <span className="text-[11px] text-subtle">
              Tokens are stored on this server only. Disconnect any time.
            </span>
            <Button disabled={!ready} asChild={ready}>
              {ready ? <Link to="/">Continue</Link> : 'Continue'}
            </Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  )
}

function ConnectionSection({
  service,
  title,
  detail,
  connected,
  action,
}: {
  service: Service
  title: string
  detail: string
  connected: boolean
  action: ReactNode
}) {
  return (
    <Item size="sm" className="rounded-none border-b-border">
      <ItemMedia>
        {connected ? (
          <CircleCheckIcon className="size-4 fill-foreground text-card" />
        ) : (
          <CircleIcon className="size-4 text-subtle" />
        )}
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0">
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription className="truncate">{detail}</ItemDescription>
      </ItemContent>
      <ItemActions>{action}</ItemActions>
      {connected && (
        <ItemFooter className="block pl-6.5">
          <PlaylistPreview service={service} />
        </ItemFooter>
      )}
    </Item>
  )
}

/** A read-only list showing the playlists loaded from a service. */
function PlaylistPreview({ service }: { service: Service }) {
  const { data, isPending, error } = useQuery(playlistsQuery)
  const playlists =
    data?.filter((playlist) => playlist.service === service) ?? []

  return (
    <div>
      <div className="mb-1 text-[11px] text-subtle">
        {service === 'youtube' ? 'Playlists' : 'Library playlists'}{' '}
        {data && <Badge variant="count">{playlists.length}</Badge>}
      </div>
      <ScrollArea className="h-[141px] rounded-md border">
        {isPending ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-4" />
            ))}
          </div>
        ) : error ? (
          <p className="p-2 text-destructive">{error.message}</p>
        ) : (
          <Table>
            <TableBody>
              {playlists.map((playlist) => (
                <TableRow key={playlist.id}>
                  <TableCell className="truncate">{playlist.title}</TableCell>
                  <TableCell className="w-16 text-right font-mono text-[11px] text-subtle">
                    {formatCount(playlist.count)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ScrollArea>
    </div>
  )
}
