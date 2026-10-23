import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { TopBar } from '@/components/top-bar'
import { connectionsQuery, playlistsQuery, runQuery } from '@/lib/queries'

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    if (!context.session) throw redirect({ to: '/sign-in' })

    const connections = await context.queryClient.fetchQuery(connectionsQuery)
    if (!connections.youtube || !connections.apple) throw redirect({ to: '/connect' })
  },
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(playlistsQuery)
    void context.queryClient.prefetchQuery(runQuery)
  },
  component: AppLayout,
})

function AppLayout() {
  return (
    <div className="flex h-svh flex-col">
      <TopBar />
      <main className="flex min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}
