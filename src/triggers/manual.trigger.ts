import { BaseTrigger } from "./base.trigger";
import { RegisteredWorkflow, StartWorkflowOptions } from "../types";
import { getClientForNamespace } from "../client";

// Manual trigger allows workflows to be started programmatically
export class ManualTrigger extends BaseTrigger {
  constructor(workflow: RegisteredWorkflow) {
    super(workflow);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`Manual trigger for ${this.workflow.name} is already running`);
      return;
    }

    this.isRunning = true;
    console.log(
      `Manual trigger registered for ${this.workflow.name} (${this.workflow.namespace}:${this.workflow.taskQueue})`
    );
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    console.log(`Manual trigger stopped for ${this.workflow.name}`);
  }

  async execute(options: StartWorkflowOptions = {}): Promise<string> {
    if (!this.isRunning) {
      throw new Error(`Manual trigger for ${this.workflow.name} is not running`);
    }

    const client = await getClientForNamespace(this.workflow.namespace);
    const workflowId = options.workflowId || this.generateWorkflowId("manual");

    const handle = await client.workflow.start(this.workflow.name, {
      taskQueue: this.workflow.taskQueue,
      workflowId,
      args: options.args || [],
      memo: options.memo,
    });

    console.log(`Manual trigger started workflow: ${workflowId} (${this.workflow.namespace})`);
    return handle.workflowId;
  }

  async executeAndWait<T = unknown>(options: StartWorkflowOptions = {}): Promise<T> {
    if (!this.isRunning) {
      throw new Error(`Manual trigger for ${this.workflow.name} is not running`);
    }

    const client = await getClientForNamespace(this.workflow.namespace);
    const workflowId = options.workflowId || this.generateWorkflowId("manual");

    const handle = await client.workflow.start(this.workflow.name, {
      taskQueue: this.workflow.taskQueue,
      workflowId,
      args: options.args || [],
      memo: options.memo,
    });

    console.log(`Manual trigger started workflow and waiting: ${workflowId} (${this.workflow.namespace})`);
    return (await handle.result()) as T;
  }
}
