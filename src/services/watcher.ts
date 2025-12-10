import * as fs from "fs";
import * as path from "path";
import { appConfig } from "../config";
import {
  listDeployedWorkflows,
  getLatestVersion,
  getWorkflowMetadata,
  downloadWorkflow,
  WorkflowMetadata,
} from "./minio";
import { RegisteredWorkflow } from "../types";

interface TrackedWorkflow {
  name: string;
  version: string;
  metadata: WorkflowMetadata;
  localPath: string;
}

type WorkflowChangeHandler = (
  added: RegisteredWorkflow[],
  updated: RegisteredWorkflow[],
  removed: string[]
) => Promise<void>;

// Watches MinIO for workflow changes and syncs them locally
export class WorkflowWatcher {
  private trackedWorkflows: Map<string, TrackedWorkflow> = new Map();
  private intervalHandle: NodeJS.Timeout | null = null;
  private changeHandler: WorkflowChangeHandler | null = null;
  private workflowsDir: string;

  constructor() {
    this.workflowsDir = path.resolve(appConfig.worker.workflowsDir);
  }

  // Set handler for workflow changes
  onWorkflowChange(handler: WorkflowChangeHandler): void {
    this.changeHandler = handler;
  }

  // Start watching for changes
  async start(): Promise<void> {
    // Ensure workflows directory exists
    if (!fs.existsSync(this.workflowsDir)) {
      fs.mkdirSync(this.workflowsDir, { recursive: true });
    }

    // Initial sync
    await this.sync();

    // Start periodic sync
    this.intervalHandle = setInterval(() => {
      this.sync().catch((error) => {
        console.error("Workflow sync failed:", error);
      });
    }, appConfig.worker.syncIntervalMs);

    console.log(
      `Workflow watcher started (sync interval: ${appConfig.worker.syncIntervalMs}ms)`
    );
  }

  // Stop watching
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    console.log("Workflow watcher stopped");
  }

  // Sync workflows from MinIO
  async sync(): Promise<void> {
    try {
      const deployedWorkflows = await listDeployedWorkflows();
      const added: RegisteredWorkflow[] = [];
      const updated: RegisteredWorkflow[] = [];
      const removed: string[] = [];

      // Check for new or updated workflows
      for (const workflowName of deployedWorkflows) {
        const latestVersion = await getLatestVersion(workflowName);
        if (!latestVersion) {
          continue;
        }

        const tracked = this.trackedWorkflows.get(workflowName);

        if (!tracked) {
          // New workflow
          const workflow = await this.downloadAndTrack(workflowName, latestVersion);
          if (workflow) {
            added.push(this.toRegisteredWorkflow(workflow));
          }
        } else if (tracked.version !== latestVersion) {
          // Updated workflow
          const workflow = await this.downloadAndTrack(workflowName, latestVersion);
          if (workflow) {
            updated.push(this.toRegisteredWorkflow(workflow));
          }
        }
      }

      // Check for removed workflows
      for (const [name] of this.trackedWorkflows) {
        if (!deployedWorkflows.includes(name)) {
          removed.push(name);
          this.trackedWorkflows.delete(name);
          // Optionally cleanup local files
          this.cleanupLocalWorkflow(name);
        }
      }

      // Notify handler of changes
      if (this.changeHandler && (added.length > 0 || updated.length > 0 || removed.length > 0)) {
        await this.changeHandler(added, updated, removed);
      }

      if (added.length > 0 || updated.length > 0 || removed.length > 0) {
        console.log(
          `Workflow sync: ${added.length} added, ${updated.length} updated, ${removed.length} removed`
        );
      }
    } catch (error) {
      console.error("Failed to sync workflows:", error);
    }
  }

  // Download and track a workflow
  private async downloadAndTrack(
    workflowName: string,
    version: string
  ): Promise<TrackedWorkflow | null> {
    try {
      const metadata = await getWorkflowMetadata(workflowName, version);
      if (!metadata) {
        console.error(`No metadata found for ${workflowName}@${version}`);
        return null;
      }

      const localPath = await downloadWorkflow(workflowName, version, this.workflowsDir);

      const tracked: TrackedWorkflow = {
        name: workflowName,
        version,
        metadata,
        localPath,
      };

      this.trackedWorkflows.set(workflowName, tracked);
      return tracked;
    } catch (error) {
      console.error(`Failed to download workflow ${workflowName}@${version}:`, error);
      return null;
    }
  }

  // Convert tracked workflow to registered workflow format
  private toRegisteredWorkflow(tracked: TrackedWorkflow): RegisteredWorkflow {
    return {
      name: tracked.metadata.name,
      namespace: tracked.metadata.namespace,
      taskQueue: tracked.metadata.taskQueue,
      trigger: tracked.metadata.trigger,
    };
  }

  // Cleanup local workflow files
  private cleanupLocalWorkflow(workflowName: string): void {
    const workflowDir = path.join(this.workflowsDir, workflowName);
    if (fs.existsSync(workflowDir)) {
      fs.rmSync(workflowDir, { recursive: true });
      console.log(`Cleaned up local files for workflow: ${workflowName}`);
    }
  }

  // Get all currently tracked workflows as registered workflows
  getTrackedWorkflows(): RegisteredWorkflow[] {
    return Array.from(this.trackedWorkflows.values()).map((tracked) =>
      this.toRegisteredWorkflow(tracked)
    );
  }

  // Get workflows directory path
  getWorkflowsDir(): string {
    return this.workflowsDir;
  }

  // Check if any workflows are tracked
  hasWorkflows(): boolean {
    return this.trackedWorkflows.size > 0;
  }
}

