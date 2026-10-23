import { Badge } from '@/components/ui/badge'
import type { Service } from '@/lib/types'

export function ServiceTag({ service }: { service: Service }) {
  return <Badge variant="tag">{service === 'youtube' ? 'YT' : 'AM'}</Badge>
}
