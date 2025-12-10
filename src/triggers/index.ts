import { BaseTrigger } from "./base.trigger";
import { ScheduleTrigger } from "./schedule.trigger";
import { PollingTrigger } from "./polling.trigger";
import { WebhookTrigger } from "./webhook.trigger";
import { ManualTrigger } from "./manual.trigger";
import { RegisteredWorkflow, TriggerType } from "../types";

export { BaseTrigger } from "./base.trigger";
export { ScheduleTrigger } from "./schedule.trigger";
export { PollingTrigger } from "./polling.trigger";
export { WebhookTrigger } from "./webhook.trigger";
export { ManualTrigger } from "./manual.trigger";

// Factory function to create the appropriate trigger based on type
export function createTrigger(workflow: RegisteredWorkflow): BaseTrigger {
  switch (workflow.trigger.type) {
    case "schedule":
      return new ScheduleTrigger(workflow);
    case "polling":
      return new PollingTrigger(workflow);
    case "webhook":
      return new WebhookTrigger(workflow);
    case "manual":
      return new ManualTrigger(workflow);
    default:
      throw new Error(`Unknown trigger type: ${(workflow.trigger as { type: string }).type}`);
  }
}

// Manager class to handle multiple triggers for multiple workflows
export class TriggerManager {
  private triggers: Map<string, BaseTrigger> = new Map();

  // Register a workflow and create its trigger
  register(workflow: RegisteredWorkflow): BaseTrigger {
    if (this.triggers.has(workflow.name)) {
      console.log(`Workflow ${workflow.name} is already registered, returning existing trigger`);
      return this.triggers.get(workflow.name)!;
    }

    const trigger = createTrigger(workflow);
    this.triggers.set(workflow.name, trigger);
    return trigger;
  }

  // Get trigger for a specific workflow
  getTrigger(workflowName: string): BaseTrigger | undefined {
    return this.triggers.get(workflowName);
  }

  // Get manual trigger with proper typing for direct execution
  getManualTrigger(workflowName: string): ManualTrigger | undefined {
    const trigger = this.triggers.get(workflowName);
    if (trigger instanceof ManualTrigger) {
      return trigger;
    }
    return undefined;
  }

  // Start all registered triggers
  async startAll(): Promise<void> {
    const startPromises = Array.from(this.triggers.values()).map((trigger) =>
      trigger.start().catch((error) => {
        console.error(`Failed to start trigger for ${trigger.workflowName}:`, error);
      })
    );

    await Promise.all(startPromises);
    console.log(`Started ${this.triggers.size} triggers`);
  }

  // Stop all registered triggers
  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.triggers.values()).map((trigger) =>
      trigger.stop().catch((error) => {
        console.error(`Failed to stop trigger for ${trigger.workflowName}:`, error);
      })
    );

    await Promise.all(stopPromises);
    this.triggers.clear();
    console.log("All triggers stopped");
  }

  // Get list of all registered workflow names
  getRegisteredWorkflows(): string[] {
    return Array.from(this.triggers.keys());
  }

  // Get status of all triggers
  getStatus(): Record<string, { running: boolean; type: TriggerType }> {
    const status: Record<string, { running: boolean; type: TriggerType }> = {};

    for (const [name, trigger] of this.triggers) {
      status[name] = {
        running: trigger.running,
        type: this.getTriggerType(trigger),
      };
    }

    return status;
  }

  private getTriggerType(trigger: BaseTrigger): TriggerType {
    if (trigger instanceof ScheduleTrigger) return "schedule";
    if (trigger instanceof PollingTrigger) return "polling";
    if (trigger instanceof WebhookTrigger) return "webhook";
    if (trigger instanceof ManualTrigger) return "manual";
    throw new Error("Unknown trigger type");
  }
}

