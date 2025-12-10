import { RegisteredWorkflow } from "../types";

// Base class for all trigger implementations
export abstract class BaseTrigger {
  protected workflow: RegisteredWorkflow;
  protected isRunning: boolean = false;

  constructor(workflow: RegisteredWorkflow) {
    this.workflow = workflow;
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;

  protected generateWorkflowId(prefix?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const base = prefix || this.workflow.name;
    return `${base}-${timestamp}-${random}`;
  }

  get workflowName(): string {
    return this.workflow.name;
  }

  get namespace(): string {
    return this.workflow.namespace;
  }

  get taskQueue(): string {
    return this.workflow.taskQueue;
  }

  get running(): boolean {
    return this.isRunning;
  }
}

export interface TriggerFactory {
  create(workflow: RegisteredWorkflow): BaseTrigger;
}
