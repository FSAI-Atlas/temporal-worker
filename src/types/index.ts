import { z } from "zod";

export type TriggerType = "schedule" | "polling" | "webhook" | "manual";

// Webhook authentication types
export const WebhookAuthConfigSchema = z.object({
  type: z.enum(["bearer", "api-key", "basic"]),
  token: z.string().min(1),
  headerName: z.string().optional(),
});

export type WebhookAuthConfig = z.infer<typeof WebhookAuthConfigSchema>;

// Configuration for a workflow including its Temporal settings and trigger
export const WorkflowConfigSchema = z.object({
  name: z.string().min(1),
  namespace: z.string().default("default"),
  taskQueue: z.string().min(1),
  trigger: z.object({
    type: z.enum(["schedule", "polling", "webhook", "manual"]),
    config: z.record(z.unknown()).optional(),
  }),
});

export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;

// Schedule trigger configuration
export const ScheduleTriggerConfigSchema = z.object({
  cronExpression: z.string().optional(),
  intervalMs: z.number().positive().optional(),
});

export type ScheduleTriggerConfig = z.infer<typeof ScheduleTriggerConfigSchema>;

// Polling trigger configuration
export const PollingTriggerConfigSchema = z.object({
  intervalMs: z.number().positive(),
  endpoint: z.string().url().optional(),
});

export type PollingTriggerConfig = z.infer<typeof PollingTriggerConfigSchema>;

// Webhook trigger configuration with optional auth
export const WebhookTriggerConfigSchema = z.object({
  path: z.string().min(1),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("POST"),
  auth: WebhookAuthConfigSchema.optional(),
});

export type WebhookTriggerConfig = z.infer<typeof WebhookTriggerConfigSchema>;

// Manual trigger doesn't need additional configuration
export const ManualTriggerConfigSchema = z.object({});

export type ManualTriggerConfig = z.infer<typeof ManualTriggerConfigSchema>;

// Registered workflow with its configuration
export interface RegisteredWorkflow {
  name: string;
  namespace: string;
  taskQueue: string;
  trigger: {
    type: TriggerType;
    config?: unknown;
  };
}

// Options to start a workflow execution
export interface StartWorkflowOptions {
  workflowId?: string;
  args?: unknown[];
  memo?: Record<string, unknown>;
}

// Key to identify a unique worker (namespace + taskQueue combination)
export function getWorkerKey(namespace: string, taskQueue: string): string {
  return `${namespace}:${taskQueue}`;
}
