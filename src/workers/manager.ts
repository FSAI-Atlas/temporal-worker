import { NativeConnection, Worker } from "@temporalio/worker";
import { appConfig } from "../config";
import { RegisteredWorkflow, getWorkerKey } from "../types";
import * as activities from "../activities";

interface ManagedWorker {
  worker: Worker;
  runPromise: Promise<void> | null;
  namespace: string;
  taskQueue: string;
  workflows: string[];
}

// Manages multiple Temporal workers, one per unique namespace/taskQueue combination
export class WorkerManager {
  private workers: Map<string, ManagedWorker> = new Map();
  private connection: NativeConnection | null = null;

  private async getConnection(): Promise<NativeConnection> {
    if (!this.connection) {
      this.connection = await NativeConnection.connect({
        address: appConfig.temporal.address,
      });
    }
    return this.connection;
  }

  // Register a workflow and create/update its worker
  async registerWorkflow(workflow: RegisteredWorkflow): Promise<void> {
    const key = getWorkerKey(workflow.namespace, workflow.taskQueue);
    const existing = this.workers.get(key);

    if (existing) {
      // Worker already exists for this namespace/taskQueue, just track the workflow
      existing.workflows.push(workflow.name);
      console.log(
        `Added workflow ${workflow.name} to existing worker (${workflow.namespace}:${workflow.taskQueue})`
      );
      return;
    }

    // Worker will be created when startAll is called
    this.workers.set(key, {
      worker: null as unknown as Worker,
      runPromise: null,
      namespace: workflow.namespace,
      taskQueue: workflow.taskQueue,
      workflows: [workflow.name],
    });

    console.log(
      `Registered worker for ${workflow.namespace}:${workflow.taskQueue} (workflow: ${workflow.name})`
    );
  }

  // Start all registered workers
  async startAll(): Promise<void> {
    const connection = await this.getConnection();

    for (const [key, managed] of this.workers) {
      if (managed.worker) {
        continue; // Already running
      }

      try {
        const worker = await Worker.create({
          connection,
          namespace: managed.namespace,
          taskQueue: managed.taskQueue,
          workflowsPath: require.resolve("../workflows"),
          activities,
          maxConcurrentActivityTaskExecutions: appConfig.worker.maxConcurrentActivities,
          maxConcurrentWorkflowTaskExecutions: appConfig.worker.maxConcurrentWorkflows,
        });

        managed.worker = worker;

        // Run worker in background (non-blocking), store promise for graceful shutdown
        managed.runPromise = worker.run().catch((error) => {
          console.error(`Worker ${key} stopped with error:`, error);
        });

        console.log(
          `Worker started for ${managed.namespace}:${managed.taskQueue} (workflows: ${managed.workflows.join(", ")})`
        );
      } catch (error) {
        console.error(`Failed to start worker ${key}:`, error);
        throw error;
      }
    }
  }

  // Stop all workers gracefully
  async stopAll(): Promise<void> {
    const runPromises: Promise<void>[] = [];

    for (const [key, managed] of this.workers) {
      if (managed.worker) {
        // Signal worker to shutdown
        managed.worker.shutdown();
        console.log(`Shutdown signal sent to worker ${key}`);

        // Collect run promises to wait for completion
        if (managed.runPromise) {
          runPromises.push(managed.runPromise);
        }
      }
    }

    // Wait for all workers to finish
    await Promise.all(runPromises);
    this.workers.clear();

    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }

    console.log("All workers stopped");
  }

  // Get list of all worker keys
  getWorkerKeys(): string[] {
    return Array.from(this.workers.keys());
  }

  // Get status of all workers
  getStatus(): Record<string, { namespace: string; taskQueue: string; workflows: string[] }> {
    const status: Record<string, { namespace: string; taskQueue: string; workflows: string[] }> = {};

    for (const [key, managed] of this.workers) {
      status[key] = {
        namespace: managed.namespace,
        taskQueue: managed.taskQueue,
        workflows: managed.workflows,
      };
    }

    return status;
  }
}

