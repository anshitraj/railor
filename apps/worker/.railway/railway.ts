import { defineRailway, github, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const railorWorkerVolume = volume("railor-worker-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "sfo", sizeMB: 5000 });
  const railorWorker = service("railor-worker", {
    source: github("anshitraj/railor", { branch: "main", rootDirectory: "/apps/worker" }),
    start: "python -m railor_worker.cli crawl",
    deploy: { cronSchedule: "0 */6 * * *", restartPolicyType: "NEVER" },
    replicas: { "sfo": 1 },
    volumeMounts: { "/data": railorWorkerVolume },
    env: {
      DATABASE_URL: preserve(),
      GEMINI_API_KEY: preserve(),
      RAILOR_CONCURRENCY: "2",
      RAILOR_ENV: "production",
      SNAPSHOT_DIR: "/data/snapshots",
    },
  });

  return project("Railor", {
    resources: [railorWorker, railorWorkerVolume],
  });
});
