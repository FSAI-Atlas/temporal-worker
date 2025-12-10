import { config } from "dotenv";

config();

// Global configuration - only contains Temporal server address and default settings.
// Each workflow defines its own namespace and taskQueue.
export const appConfig = {
  temporal: {
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
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
  },
};
