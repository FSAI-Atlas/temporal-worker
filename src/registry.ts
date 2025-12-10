import { RegisteredWorkflow, TriggerType} from "./types";

// Simple in-memory registry for tracking registered workflows.
// Workflows are now discovered and managed by the WorkflowWatcher from MinIO.
const workflowRegistry: RegisteredWorkflow[] = [];

export function getRegisteredWorkflows(): RegisteredWorkflow[] {
  return workflowRegistry;
}

export function getWorkflowsByTriggerType(type: TriggerType): RegisteredWorkflow[] {
  return workflowRegistry.filter((w) => w.trigger.type === type);
}

export function getWorkflowsByNamespace(namespace: string): RegisteredWorkflow[] {
  return workflowRegistry.filter((w) => w.namespace === namespace);
}

export function getWorkflowByName(name: string): RegisteredWorkflow | undefined {
  return workflowRegistry.find((w) => w.name === name);
}

export function registerWorkflow(workflow: RegisteredWorkflow): void {
  const existing = workflowRegistry.find((w) => w.name === workflow.name);
  if (existing) {
    // Update existing
    Object.assign(existing, workflow);
    return;
  }
  workflowRegistry.push(workflow);
}

export function unregisterWorkflow(name: string): boolean {
  const index = workflowRegistry.findIndex((w) => w.name === name);
  if (index !== -1) {
    workflowRegistry.splice(index, 1);
    return true;
  }
  return false;
}

export function clearRegistry(): void {
  workflowRegistry.length = 0;
}
