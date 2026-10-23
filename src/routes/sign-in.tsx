import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { Brand } from '@/components/brand'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { authClient } from '@/lib/auth-client'
import { sessionQuery } from '@/lib/queries'

export const Route = createFileRoute('/sign-in')({
  validateSearch: z.object({
    mode: z.enum(['sign-in', 'sign-up']).default('sign-in'),
  }),
  beforeLoad: ({ context }) => {
    if (context.session) throw redirect({ to: '/' })
  },
  component: SignIn,
})

function SignIn() {
  const { mode } = Route.useSearch()
  const isSignUp = mode === 'sign-up'
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const submit = useMutation({
    mutationFn: async (form: FormData) => {
      const email = String(form.get('email'))
      const password = String(form.get('password'))
      const { error } = isSignUp
        ? await authClient.signUp.email({ name: String(form.get('name')), email, password })
        : await authClient.signIn.email({ email, password })
      if (error) throw new Error(error.message ?? 'Could not sign in.')
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })
      await navigate({ to: isSignUp ? '/connect' : '/' })
    },
  })
  const google = useMutation({
    mutationFn: () => authClient.signIn.social({ provider: 'google', callbackURL: '/' }),
  })

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-11 items-center border-b bg-card px-3">
        <Brand />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[12svh]">
        <Card className="w-full max-w-[360px] gap-4 py-4">
          <CardHeader className="px-4">
            <CardTitle>{isSignUp ? 'Create account' : 'Sign in'}</CardTitle>
            <CardDescription>
              {isSignUp
                ? 'Your playlists and match runs stay separate from other users.'
                : 'Pick up where you left off.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            <form
              onSubmit={(event) => {
                event.preventDefault()
                submit.mutate(new FormData(event.currentTarget))
              }}
            >
              <FieldGroup className="gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={google.isPending}
                  onClick={() => google.mutate()}
                >
                  {google.isPending && <Spinner />}
                  {isSignUp ? 'Sign up with Google' : 'Continue with Google'}
                </Button>
                <FieldSeparator>or</FieldSeparator>
                {isSignUp && (
                  <Field>
                    <FieldLabel htmlFor="name">Name</FieldLabel>
                    <Input id="name" name="name" placeholder="Your name" required />
                  </Field>
                )}
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder={isSignUp ? 'At least 10 characters' : undefined}
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    minLength={isSignUp ? 10 : undefined}
                    required
                  />
                </Field>
                <Button type="submit" disabled={submit.isPending}>
                  {submit.isPending && <Spinner />}
                  {isSignUp ? 'Create account' : 'Sign in'}
                </Button>
                {isSignUp && (
                  <FieldDescription className="text-[11px]">
                    Next you’ll connect YouTube and Apple Music.
                  </FieldDescription>
                )}
              </FieldGroup>
            </form>
          </CardContent>
          <CardFooter className="justify-center border-t px-4 pt-4 text-muted-foreground [.border-t]:pt-4">
            {isSignUp ? 'Have an account?' : 'No account?'}
            <Button variant="link" className="h-auto px-1 text-foreground" asChild>
              <Link to="/sign-in" search={{ mode: isSignUp ? 'sign-in' : 'sign-up' }}>
                {isSignUp ? 'Sign in' : 'Create one'}
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  )
}
