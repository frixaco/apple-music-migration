import { MutationCache, QueryClient } from '@tanstack/react-query'
import type { QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** Queries to refetch after the mutation succeeds. */
      invalidates?: QueryKey[]
      /** Toast shown after the mutation succeeds. */
      success?: string
    }
  }
}

export function getContext() {
  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      // YouTube calls cost API quota, so cached lists stay fresh for a while.
      queries: { staleTime: 60_000, refetchOnWindowFocus: false },
    },
    mutationCache: new MutationCache({
      onSuccess: async (_data, _variables, _context, mutation) => {
        const { invalidates = [], success } = mutation.meta ?? {}
        if (success) toast.success(success)
        await Promise.all(
          invalidates.map((queryKey) =>
            queryClient.invalidateQueries({ queryKey }),
          ),
        )
      },
      onError: (error) => {
        toast.error(error.message)
      },
    }),
  })

  return { queryClient }
}
