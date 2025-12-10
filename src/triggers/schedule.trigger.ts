import { ScheduleClient } from "@temporalio/client";
import { BaseTrigger } from "./base.trigger";
import { RegisteredWorkflow, ScheduleTriggerConfig, ScheduleTriggerConfigSchema } from "../types";
import { getClientForNamespace } from "../client";

// Schedule trigger uses Temporal's built-in Schedule feature
export class ScheduleTrigger extends BaseTrigger {
  private scheduleClient: ScheduleClient | null = null;
  private scheduleId: string;
  private config: ScheduleTriggerConfig;

  constructor(workflow: RegisteredWorkflow) {
    super(workflow);
    this.scheduleId = `schedule-${workflow.name}`;
    this.config = ScheduleTriggerConfigSchema.parse(workflow.trigger.config || {});
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`Schedule trigger for ${this.workflow.name} is already running`);
      return;
    }

    // Get client for this workflow's namespace
    const client = await getClientForNamespace(this.workflow.namespace);
    this.scheduleClient = client.schedule;

    const spec = this.buildScheduleSpec();

    try {
      await this.scheduleClient.create({
        scheduleId: this.scheduleId,
        spec,
        action: {
          type: "startWorkflow",
          workflowType: this.workflow.name,
          taskQueue: this.workflow.taskQueue,
          args: [],
        },
      });

      console.log(
        `Schedule trigger started for ${this.workflow.name} (${this.workflow.namespace}:${this.workflow.taskQueue})`
      );
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("already exists")) {
        const handle = this.scheduleClient.getHandle(this.scheduleId);
        await handle.update((schedule) => {
          schedule.spec = spec;
          return schedule;
        });
        console.log(`Schedule trigger updated for ${this.workflow.name}`);
      } else {
        throw error;
      }
    }

    this.isRunning = true;
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.scheduleClient) {
      return;
    }

    try {
      const handle = this.scheduleClient.getHandle(this.scheduleId);
      await handle.delete();
      console.log(`Schedule trigger stopped for ${this.workflow.name}`);
    } catch (error) {
      console.error(`Failed to stop schedule trigger for ${this.workflow.name}:`, error);
    }

    this.isRunning = false;
    this.scheduleClient = null;
  }

  private buildScheduleSpec() {
    if (this.config.cronExpression) {
      return {
        cronExpressions: [this.config.cronExpression],
      };
    }

    if (this.config.intervalMs) {
      return {
        intervals: [{ every: this.config.intervalMs, offset: 0 }],
      };
    }

    return {
      intervals: [{ every: 3600000, offset: 0 }],
    };
  }
}
