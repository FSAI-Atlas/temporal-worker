import * as fs from "fs";
import * as path from "path";
import { WorkerManager } from "./workers/manager";
import { TriggerManager } from "./triggers";
import { WorkflowWatcher } from "./services/watcher";
import { closeAllClients } from "./client";
import { appConfig } from "./config";
import { RegisteredWorkflow } from "./types";

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
  console.log(`Generated workflows index with ${workflows.length} workflows`);
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
    console.log(`New workflow registered: ${workflow.name}`);
  }

  // Handle updated workflows - restart affected workers
  for (const workflow of updated) {
    console.log(`Workflow updated: ${workflow.name}`);
    await workerManager.restartWorker(workflow.namespace, workflow.taskQueue);
  }

  // Handle removed workflows
  for (const name of removed) {
    console.log(`Workflow removed: ${name}`);
    // Note: Full cleanup would require tracking which triggers belong to which workflow
  }

  // If this is the first time we have workflows, start everything
  if (added.length > 0 && triggerManager.getRegisteredWorkflows().length === added.length) {
    await triggerManager.startAll();
    await workerManager.startAll();
    console.log("Workers and triggers started for initial workflows");
  }
}

async function main() {
  console.log("Starting Temporal Generic Worker...");
  console.log(`MinIO endpoint: ${appConfig.minio.endPoint}:${appConfig.minio.port}`);
  console.log(`MinIO bucket: ${appConfig.minio.bucket}`);

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
      console.log(
        `Registered: ${workflow.name} (${workflow.namespace}:${workflow.taskQueue}, trigger: ${workflow.trigger.type})`
      );
    }

    // Start triggers
    await triggerManager.startAll();
    console.log("Trigger status:", JSON.stringify(triggerManager.getStatus(), null, 2));

    // Start workers
    await workerManager.startAll();
    console.log("Worker status:", JSON.stringify(workerManager.getStatus(), null, 2));
  } else {
    console.log("No workflows found in MinIO bucket.");
    console.log("Deploy workflows using the CLI: workflow-cli deploy ./my-workflow");
    console.log("Watching for new workflows...");
  }

  console.log("System running. Press Ctrl+C to shutdown.");
}

async function shutdown() {
  console.log("\nShutting down gracefully...");

  try {
    workflowWatcher.stop();
    await triggerManager.stopAll();
    await workerManager.stopAll();
    await closeAllClients();
    console.log("Shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

export { workerManager, triggerManager, workflowWatcher };
export * from "./triggers";
export * from "./types";
export * from "./client";
export * from "./services";
