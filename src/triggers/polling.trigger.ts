import { BaseTrigger } from "./base.trigger";
import { RegisteredWorkflow, PollingTriggerConfig, PollingTriggerConfigSchema } from "../types";
import { getClientForNamespace } from "../client";

// Polling trigger periodically checks for new data and starts workflows
export class PollingTrigger extends BaseTrigger {
  private intervalHandle: NodeJS.Timeout | null = null;
  private config: PollingTriggerConfig;

  constructor(workflow: RegisteredWorkflow) {
    super(workflow);
    this.config = PollingTriggerConfigSchema.parse(workflow.trigger.config || { intervalMs: 60000 });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`Polling trigger for ${this.workflow.name} is already running`);
      return;
    }

    this.isRunning = true;

    await this.poll();

    this.intervalHandle = setInterval(() => {
      this.poll().catch((error) => {
        console.error(`Polling error for ${this.workflow.name}:`, error);
      });
    }, this.config.intervalMs);

    console.log(
      `Polling trigger started for ${this.workflow.name} (${this.workflow.namespace}:${this.workflow.taskQueue}, interval: ${this.config.intervalMs}ms)`
    );
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    this.isRunning = false;
    console.log(`Polling trigger stopped for ${this.workflow.name}`);
  }

  protected async shouldTrigger(): Promise<{ trigger: boolean; data?: unknown }> {
    if (this.config.endpoint) {
      try {
        const response = await fetch(this.config.endpoint);
        if (response.ok) {
          const data = await response.json();
          const shouldStart = Boolean(
            data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)
          );
          return { trigger: shouldStart, data };
        }
      } catch (error) {
        console.error(`Failed to fetch polling endpoint for ${this.workflow.name}:`, error);
      }
    }

    return { trigger: true };
  }

  private async poll(): Promise<void> {
    try {
      const { trigger, data } = await this.shouldTrigger();

      if (trigger) {
        await this.startWorkflow(data);
      }
    } catch (error) {
      console.error(`Poll execution failed for ${this.workflow.name}:`, error);
    }
  }

  private async startWorkflow(data?: unknown): Promise<void> {
    const client = await getClientForNamespace(this.workflow.namespace);
    const workflowId = this.generateWorkflowId("poll");

    await client.workflow.start(this.workflow.name, {
      taskQueue: this.workflow.taskQueue,
      workflowId,
      args: data ? [data] : [],
    });

    console.log(`Polling trigger started workflow: ${workflowId}`);
  }
}
