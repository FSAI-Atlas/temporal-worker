import * as fs from "fs";
import * as path from "path";
import { WorkerManager } from "./workers/manager";
import { TriggerManager } from "./triggers";
import { WorkflowWatcher } from "./services/watcher";
import { closeAllClients } from "./client";
import { appConfig } from "./config";
import { RegisteredWorkflow } from "./types";
import logger, { createLogger } from "./lib/logger";

const log = createLogger("main");

let workerManager: WorkerManager;
let triggerManager: TriggerManager;
let workflowWatcher: WorkflowWatcher;

// Generate workflows/index.ts dynamically based on downloaded workflows
function generateWorkflowsIndex(workflowsDir: string, workflows: RegisteredWorkflow[]): void {
  const exports = workflows
    .map((w) => `export { ${w.name} } from "./${w.name}/workflow";`)
    .join("\n");

  const indexContent = `// Auto-generated file - DO NOT EDIT\n// Generated at: ${new Date().toISOString()}\n\n${exports}\n`;

  const indexPath = path.join(workflowsDir, "index.ts");
  fs.writeFileSync(indexPath, indexContent);
  log.info({ count: workflows.length }, "Generated workflows index");
}

// Handle workflow changes from the watcher
async function handleWorkflowChanges(
  added: RegisteredWorkflow[],
  updated: RegisteredWorkflow[],
  removed: string[]
): Promise<void> {
  const workflowsDir = workflowWatcher.getWorkflowsDir();

  // Regenerate index file
  const allWorkflows = workflowWatcher.getTrackedWorkflows();
  generateWorkflowsIndex(workflowsDir, allWorkflows);

  // Handle added workflows
  for (const workflow of added) {
    await workerManager.registerWorkflow(workflow);
    triggerManager.register(workflow);
    log.info({ workflow: workflow.name }, "New workflow registered");
  }

  // Handle updated workflows - restart affected workers
  for (const workflow of updated) {
    log.info({ workflow: workflow.name }, "Workflow updated");
    await workerManager.restartWorker(workflow.namespace, workflow.taskQueue);
  }

  // Handle removed workflows
  for (const name of removed) {
    log.info({ workflow: name }, "Workflow removed");
  }

  // If this is the first time we have workflows, start everything
  if (added.length > 0 && triggerManager.getRegisteredWorkflows().length === added.length) {
    await triggerManager.startAll();
    await workerManager.startAll();
    log.info("Workers and triggers started for initial workflows");
  }
}

async function main() {
  log.info("Starting Temporal Generic Worker...");
  log.info({ endpoint: `${appConfig.minio.endPoint}:${appConfig.minio.port}`, bucket: appConfig.minio.bucket }, "MinIO config");

  // Initialize components
  workflowWatcher = new WorkflowWatcher();
  workerManager = new WorkerManager(workflowWatcher.getWorkflowsDir());
  triggerManager = new TriggerManager();

  // Set up change handler
  workflowWatcher.onWorkflowChange(handleWorkflowChanges);

  // Start watching for workflows
  await workflowWatcher.start();

  // Check if we have any workflows after initial sync
  if (workflowWatcher.hasWorkflows()) {
    const workflows = workflowWatcher.getTrackedWorkflows();

    // Generate index file
    generateWorkflowsIndex(workflowWatcher.getWorkflowsDir(), workflows);

    // Register all workflows
    for (const workflow of workflows) {
      await workerManager.registerWorkflow(workflow);
      triggerManager.register(workflow);
      log.info({
        workflow: workflow.name,
        namespace: workflow.namespace,
        taskQueue: workflow.taskQueue,
        trigger: workflow.trigger.type,
      }, "Workflow registered");
    }

    // Start triggers
    await triggerManager.startAll();
    log.info({ status: triggerManager.getStatus() }, "Triggers started");

    // Start workers
    await workerManager.startAll();
    log.info({ status: workerManager.getStatus() }, "Workers started");
  } else {
    log.warn("No workflows found in MinIO bucket");
    log.info("Deploy workflows using the CLI: workflow-cli deploy ./my-workflow");
    log.info("Watching for new workflows...");
  }

  log.info("System running. Press Ctrl+C to shutdown.");
}

async function shutdown() {
  log.info("Shutting down gracefully...");

  try {
    workflowWatcher.stop();
    await triggerManager.stopAll();
    await workerManager.stopAll();
    await closeAllClients();
    log.info("Shutdown complete");
    process.exit(0);
  } catch (error) {
    log.error(error, "Error during shutdown");
    process.exit(1);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((error) => {
  log.fatal(error, "Fatal error");
  process.exit(1);
});

export { workerManager, triggerManager, workflowWatcher, logger };
export * from "./triggers";
export * from "./types";
export * from "./client";
export * from "./services";
