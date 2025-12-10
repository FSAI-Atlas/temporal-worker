import { RegisteredWorkflow, TriggerType, WorkflowConfig, WorkflowConfigSchema } from "./types";

// Central registry for all workflows and their configurations.
// Each workflow defines its own namespace, taskQueue, and trigger.
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

// Register a workflow from a config object
export function registerWorkflow(config: WorkflowConfig): RegisteredWorkflow {
  const validated = WorkflowConfigSchema.parse(config);

  const existing = workflowRegistry.find((w) => w.name === validated.name);
  if (existing) {
    throw new Error(`Workflow ${validated.name} is already registered`);
  }

  const workflow: RegisteredWorkflow = {
    name: validated.name,
    namespace: validated.namespace,
    taskQueue: validated.taskQueue,
    trigger: validated.trigger,
  };

  workflowRegistry.push(workflow);
  return workflow;
}

export function unregisterWorkflow(name: string): boolean {
  const index = workflowRegistry.findIndex((w) => w.name === name);
  if (index !== -1) {
    workflowRegistry.splice(index, 1);
    return true;
  }
  return false;
}

// Get unique namespace/taskQueue combinations
export function getUniqueWorkerConfigs(): Array<{ namespace: string; taskQueue: string }> {
  const seen = new Set<string>();
  const configs: Array<{ namespace: string; taskQueue: string }> = [];

  for (const workflow of workflowRegistry) {
    const key = `${workflow.namespace}:${workflow.taskQueue}`;
    if (!seen.has(key)) {
      seen.add(key);
      configs.push({ namespace: workflow.namespace, taskQueue: workflow.taskQueue });
    }
  }

  return configs;
}
