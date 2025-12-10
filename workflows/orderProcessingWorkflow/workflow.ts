import { proxyActivities, sleep } from "@temporalio/workflow";

// Define the activities interface that this workflow will use
const activities = proxyActivities<{
  logMessage: (message: string) => Promise<void>;
  httpRequest: (params: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: unknown;
  }) => Promise<unknown>;
}>({
  startToCloseTimeout: "1 minute",
  retry: {
    maximumAttempts: 3,
  },
});

// Input interface for the workflow
interface OrderProcessingInput {
  body: {
    orderId: string;
    customerId: string;
    items: Array<{ productId: string; quantity: number; price: number }>;
    totalAmount: number;
  };
  query: Record<string, unknown>;
  headers: Record<string, unknown>;
  timestamp: string;
}

// Result interface for the workflow
interface OrderProcessingResult {
  orderId: string;
  status: "completed" | "failed";
  processedAt: string;
  message: string;
}

// Main workflow function
export async function orderProcessingWorkflow(
  input: OrderProcessingInput
): Promise<OrderProcessingResult> {
  const order = input.body;

  await activities.logMessage(`Starting order processing for order ${order.orderId}`);
  await activities.logMessage(`Customer: ${order.customerId}`);
  await activities.logMessage(`Items: ${order.items.length}, Total: $${order.totalAmount}`);

  // Step 1: Validate order
  await activities.logMessage("Step 1: Validating order...");
  await sleep("2 seconds");

  if (order.items.length === 0) {
    await activities.logMessage("Validation failed: No items in order");
    return {
      orderId: order.orderId,
      status: "failed",
      processedAt: new Date().toISOString(),
      message: "Order validation failed: No items",
    };
  }

  // Step 2: Check inventory
  await activities.logMessage("Step 2: Checking inventory...");
  await sleep("2 seconds");

  // Step 3: Process payment
  await activities.logMessage("Step 3: Processing payment...");
  await sleep("3 seconds");

  // Step 4: Create shipment
  await activities.logMessage("Step 4: Creating shipment...");
  await sleep("2 seconds");

  // Step 5: Send confirmation
  await activities.logMessage("Step 5: Sending confirmation...");
  await sleep("1 second");

  await activities.logMessage(`Order ${order.orderId} completed successfully!`);

  return {
    orderId: order.orderId,
    status: "completed",
    processedAt: new Date().toISOString(),
    message: `Order processed successfully. ${order.items.length} items shipped.`,
  };
}

