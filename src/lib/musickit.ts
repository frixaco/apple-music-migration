type MusicKitInstance = { authorize: () => Promise<string> }

declare global {
  interface Window {
    MusicKit?: {
      configure: (options: {
        developerToken: string
        app: { name: string; build: string }
      }) => Promise<MusicKitInstance>
    }
  }
}

const scriptUrl = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js'

function loadScript(): Promise<void> {
  if (window.MusicKit) return Promise.resolve()

  // The dev client defines window.process, which makes MusicKit think it runs in Node and fail.
  const process: unknown = Reflect.get(window, 'process')
  Reflect.deleteProperty(window, 'process')

  return new Promise<void>((resolve, reject) => {
    document.addEventListener('musickitloaded', () => resolve(), { once: true })
    const script = document.createElement('script')
    script.src = scriptUrl
    script.async = true
    script.onerror = () => reject(new Error('Could not load MusicKit.'))
    document.head.append(script)
  }).finally(() => {
    if (process !== undefined) Reflect.set(window, 'process', process)
  })
}

/**
 * Loads and configures MusicKit ahead of time, so `authorize()` can open Apple's sign-in popup
 * straight from a click without the browser blocking it.
 */
export async function configureMusicKit(
  developerToken: string,
): Promise<MusicKitInstance> {
  await loadScript()
  return window.MusicKit!.configure({
    developerToken,
    app: { name: 'Migrator', build: '1.0.0' },
  })
}
