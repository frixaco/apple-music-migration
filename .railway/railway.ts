import { defineRailway, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "web";
export default defineRailway(() => {
  const web = service("web", {
    build: { buildCommand: "bun run build", buildEnvironment: "V3", builder: "RAILPACK" },
    start: "bun run start",
    healthcheck: "/api/auth/ok",
    preDeploy: "bun run db:migrate",
    replicas: { "europe-west4-drams3a": 1 },
  });

  return project("migrator", {
    variables: { managed: false },
    resources: [web],
  });
});
