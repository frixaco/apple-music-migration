export { formatDuration } from '@/lib/util'

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
]

export function timeAgo(date: Date | string): string {
  const seconds = (new Date(date).getTime() - Date.now()) / 1000

  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return relative.format(Math.round(seconds / size), unit)
    }
  }

  return 'just now'
}

/** Difference between an Apple Music song and its video, e.g. "+12s", "-1s" or "same". */
export function formatDifference(
  songSeconds: number | null,
  videoSeconds: number | null,
): string {
  if (songSeconds === null || videoSeconds === null) return ''
  const difference = songSeconds - videoSeconds
  if (difference === 0) return 'same'
  return `${difference > 0 ? '+' : '−'}${Math.abs(difference)}s`
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}
