import { config } from "dotenv";

config();

export const appConfig = {
  temporal: {
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  },
  minio: {
    endPoint: process.env.MINIO_ENDPOINT || "localhost",
    port: parseInt(process.env.MINIO_PORT || "9000", 10),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
    secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
    bucket: process.env.MINIO_BUCKET || "temporal-workflows",
  },
  webhook: {
    port: parseInt(process.env.WEBHOOK_PORT || "3000", 10),
    host: process.env.WEBHOOK_HOST || "0.0.0.0",
  },
  worker: {
    maxConcurrentActivities: parseInt(
      process.env.WORKER_MAX_CONCURRENT_ACTIVITIES || "100",
      10
    ),
    maxConcurrentWorkflows: parseInt(
      process.env.WORKER_MAX_CONCURRENT_WORKFLOWS || "100",
      10
    ),
    // How often to check MinIO for new workflows (in milliseconds)
    syncIntervalMs: parseInt(process.env.WORKER_SYNC_INTERVAL_MS || "30000", 10),
    // Directory to store downloaded workflows
    workflowsDir: process.env.WORKFLOWS_DIR || "./workflows",
  },
};
