import * as path from "path";
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

// Manages multiple Temporal workers, one per unique namespace/taskQueue combination.
export class WorkerManager {
  private workers: Map<string, ManagedWorker> = new Map();
  private connection: NativeConnection | null = null;
  private workflowsDir: string;

  constructor(workflowsDir: string) {
    this.workflowsDir = workflowsDir;
  }

  private async getConnection(): Promise<NativeConnection> {
    if (!this.connection) {
      this.connection = await NativeConnection.connect({
        address: appConfig.temporal.address,
      });
    }
    return this.connection;
  }

  async registerWorkflow(workflow: RegisteredWorkflow): Promise<void> {
    const key = getWorkerKey(workflow.namespace, workflow.taskQueue);
    const existing = this.workers.get(key);

    if (existing) {
      if (!existing.workflows.includes(workflow.name)) {
        existing.workflows.push(workflow.name);
      }
      console.log(
        `Added workflow ${workflow.name} to worker (${workflow.namespace}:${workflow.taskQueue})`
      );
      return;
    }

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

  async startAll(): Promise<void> {
    const connection = await this.getConnection();
    const workflowsIndexPath = path.join(this.workflowsDir, "index.ts");

    console.log(`Loading workflows from: ${workflowsIndexPath}`);

    for (const [key, managed] of this.workers) {
      if (managed.worker) {
        continue;
      }

      try {
        const worker = await Worker.create({
          connection,
          namespace: managed.namespace,
          taskQueue: managed.taskQueue,
          workflowsPath: workflowsIndexPath,
          activities,
          maxConcurrentActivityTaskExecutions: appConfig.worker.maxConcurrentActivities,
          maxConcurrentWorkflowTaskExecutions: appConfig.worker.maxConcurrentWorkflows,
        });

        managed.worker = worker;

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

  // Restart a specific worker (used when workflows are updated)
  async restartWorker(namespace: string, taskQueue: string): Promise<void> {
    const key = getWorkerKey(namespace, taskQueue);
    const managed = this.workers.get(key);

    if (!managed || !managed.worker) {
      return;
    }

    console.log(`Restarting worker ${key}...`);

    // Shutdown existing worker
    managed.worker.shutdown();
    if (managed.runPromise) {
      await managed.runPromise;
    }

    // Clear the worker reference
    managed.worker = null as unknown as Worker;
    managed.runPromise = null;

    // Start new worker
    const connection = await this.getConnection();
    const workflowsIndexPath = path.join(this.workflowsDir, "index.ts");

    const worker = await Worker.create({
      connection,
      namespace: managed.namespace,
      taskQueue: managed.taskQueue,
      workflowsPath: workflowsIndexPath,
      activities,
      maxConcurrentActivityTaskExecutions: appConfig.worker.maxConcurrentActivities,
      maxConcurrentWorkflowTaskExecutions: appConfig.worker.maxConcurrentWorkflows,
    });

    managed.worker = worker;
    managed.runPromise = worker.run().catch((error) => {
      console.error(`Worker ${key} stopped with error:`, error);
    });

    console.log(`Worker ${key} restarted`);
  }

  async stopAll(): Promise<void> {
    const runPromises: Promise<void>[] = [];

    for (const [key, managed] of this.workers) {
      if (managed.worker) {
        managed.worker.shutdown();
        console.log(`Shutdown signal sent to worker ${key}`);

        if (managed.runPromise) {
          runPromises.push(managed.runPromise);
        }
      }
    }

    await Promise.all(runPromises);
    this.workers.clear();

    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }

    console.log("All workers stopped");
  }

  getWorkerKeys(): string[] {
    return Array.from(this.workers.keys());
  }

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
