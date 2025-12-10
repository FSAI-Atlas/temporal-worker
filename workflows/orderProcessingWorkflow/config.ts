// Workflow configuration
// This file defines how the workflow will be deployed and triggered

export const orderProcessingWorkflowConfig = {
  // Name must match the exported workflow function name
  name: "orderProcessingWorkflow",

  // Temporal namespace for this workflow
  namespace: "default",

  // Task queue where workers will pick up tasks
  taskQueue: "order-processing-queue",

  // Trigger configuration - how this workflow will be started
  trigger: {
    type: "webhook" as const,
    config: {
      // HTTP endpoint path (will be available at /webhooks/orders/process)
      path: "/orders/process",
      
      // HTTP method
      method: "POST",
      
      // Authentication configuration (optional)
      auth: {
        type: "api-key" as const,
        token: "order-api-secret-key-123",
        headerName: "X-API-Key",
      },
    },
  },
};

