import { defineRailway, github, project, service } from 'railway/iac'
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = 'migrator'
export default defineRailway(() => {
  const migrator = service('migrator', {
    // Pushes to main deploy automatically.
    source: github('frixaco/apple-music-migration', { branch: 'main' }),
    build: {
      buildCommand: 'bun run build',
      buildEnvironment: 'V3',
      builder: 'RAILPACK',
    },
    start: 'bun run start',
    healthcheck: '/api/auth/ok',
    preDeploy: 'bun run db:migrate',
    replicas: { 'europe-west4-drams3a': 1 },
  })

  return project('main', {
    variables: { managed: false },
    resources: [migrator],
  })
})
