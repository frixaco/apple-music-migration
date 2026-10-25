import { z } from 'zod'

// Zod probes whether eval works when schemas are built, which the Content Security Policy forbids.
// Imported first in router.tsx, before any schema exists.
z.config({ jitless: true })
