import { WorkerManager } from "./workers/manager";
import { TriggerManager } from "./triggers";
import { getRegisteredWorkflows } from "./registry";
import { closeAllClients } from "./client";

const workerManager = new WorkerManager();
const triggerManager = new TriggerManager();

async function main() {
  console.log("Starting Temporal Generic Worker...");

  const workflows = getRegisteredWorkflows();
  console.log(`Found ${workflows.length} registered workflows`);

  if (workflows.length === 0) {
    console.log("No workflows registered. Add workflows to the registry to start.");
    console.log("Waiting for workflows... (press Ctrl+C to exit)");
    
    // Keep the process running
    await new Promise(() => {});
    return;
  }

  // Register each workflow with both the worker manager and trigger manager
  for (const workflow of workflows) {
    await workerManager.registerWorkflow(workflow);
    triggerManager.register(workflow);
    console.log(
      `Registered: ${workflow.name} (${workflow.namespace}:${workflow.taskQueue}, trigger: ${workflow.trigger.type})`
    );
  }

  // Start all triggers
  await triggerManager.startAll();

  // Log trigger status
  const triggerStatus = triggerManager.getStatus();
  console.log("Trigger status:", JSON.stringify(triggerStatus, null, 2));

  // Log worker status
  const workerStatus = workerManager.getStatus();
  console.log("Worker status:", JSON.stringify(workerStatus, null, 2));

  // Start all workers
  await workerManager.startAll();

  console.log("All systems running. Press Ctrl+C to shutdown.");
}

async function shutdown() {
  console.log("\nShutting down gracefully...");

  try {
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

export { workerManager, triggerManager };
export * from "./triggers";
export * from "./types";
export * from "./registry";
export * from "./client";
