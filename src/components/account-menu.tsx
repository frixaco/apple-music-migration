import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronDownIcon } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { authClient, connectYouTube } from '@/lib/auth-client'
import { connectionsQuery, sessionQuery } from '@/lib/queries'

/** Apple Music user tokens last about six months. */
const appleTokenLifetimeDays = 180

export function AccountMenu() {
  const { data: session } = useQuery(sessionQuery)
  const { data: connections } = useQuery(connectionsQuery)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const user = session?.user
  const appleDaysLeft = connections?.apple
    ? Math.round(
        appleTokenLifetimeDays -
          (Date.now() - new Date(connections.apple.connectedAt).getTime()) / 86_400_000,
      )
    : null

  const signOut = async () => {
    await authClient.signOut()
    queryClient.clear()
    await navigate({ to: '/sign-in' })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 px-1" aria-label="Account">
          <Avatar className="size-5">
            {user?.image && <AvatarImage src={user.image} alt="" />}
            <AvatarFallback className="bg-foreground text-[10px] text-background">
              {user?.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <ChevronDownIcon className="text-subtle" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="px-2 py-1.5">
          <div>{user?.name}</div>
          <div className="text-muted-foreground">{user?.email}</div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Connections</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => void connectYouTube()}>
            <div className="min-w-0 flex-1">
              <div>YouTube</div>
              <div className="truncate text-[11px] text-subtle">
                {connections?.youtube?.email ?? 'Not connected'}
              </div>
            </div>
            <span className="text-muted-foreground">
              {connections?.youtube ? 'Switch' : 'Connect'}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/connect">
              <div className="min-w-0 flex-1">
                <div>Apple Music</div>
                <div className="text-[11px] text-subtle">
                  {connections?.apple
                    ? `${connections.apple.storefront.toUpperCase()} storefront · sign-in expires in ${appleDaysLeft}d`
                    : 'Not connected'}
                </div>
              </div>
              <span className="text-muted-foreground">
                {connections?.apple ? 'Reconnect' : 'Connect'}
              </span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
