# Temporal Worker

A generic Temporal worker that dynamically discovers and executes workflows deployed via MinIO. Supports multiple trigger types: schedule, polling, webhook, and manual.

## Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  workflow-cli   │         │     MinIO       │         │ temporal-worker │
│                 │ deploy  │                 │  watch  │                 │
│  Deploy tool    │ ──────► │  workflows/     │ ◄────── │  This project   │
│                 │         │  bucket         │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
                                                               │
                                                               ▼
                                                        ┌─────────────────┐
                                                        │    Temporal     │
                                                        │    Server       │
                                                        └─────────────────┘
```

## Features

- Dynamic workflow discovery from MinIO bucket
- Multiple trigger types per workflow
- Per-workflow namespace and task queue
- Webhook authentication (Bearer, API Key, Basic)
- Automatic workflow updates on new deployments
- Multiple workers for different namespace/taskQueue combinations

## Installation

```bash
git clone <repo-url>
cd temporal-worker
npm install
npm run build
```

## Configuration

Create a `.env` file:

```bash
# Temporal Server
TEMPORAL_ADDRESS=localhost:7233

# MinIO Storage
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=temporal-workflows

# Webhook Server
WEBHOOK_PORT=3000
WEBHOOK_HOST=0.0.0.0

# Worker Settings
WORKER_MAX_CONCURRENT_ACTIVITIES=100
WORKER_MAX_CONCURRENT_WORKFLOWS=100
WORKER_SYNC_INTERVAL_MS=30000
WORKFLOWS_DIR=./workflows
```

## Running

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## Trigger Types

### Schedule

Runs the workflow on a cron schedule or fixed interval.

```typescript
// config.ts
export const myScheduledWorkflowConfig = {
  name: "myScheduledWorkflow",
  namespace: "default",
  taskQueue: "scheduled-tasks",
  trigger: {
    type: "schedule" as const,
    config: {
      // Option 1: Cron expression
      cronExpression: "0 * * * *",  // Every hour
      
      // Option 2: Fixed interval in milliseconds
      // intervalMs: 3600000,  // Every hour
    }
  }
};
```

### Polling

Periodically checks an external source and triggers when data is available.

```typescript
// config.ts
export const myPollingWorkflowConfig = {
  name: "myPollingWorkflow",
  namespace: "default",
  taskQueue: "polling-tasks",
  trigger: {
    type: "polling" as const,
    config: {
      intervalMs: 60000,  // Check every minute
      endpoint: "https://api.example.com/pending-items",  // Optional
    }
  }
};
```

### Webhook

Exposes an HTTP endpoint that triggers the workflow when called.

```typescript
// config.ts
export const myWebhookWorkflowConfig = {
  name: "myWebhookWorkflow",
  namespace: "default",
  taskQueue: "webhook-tasks",
  trigger: {
    type: "webhook" as const,
    config: {
      path: "/my-endpoint",
      method: "POST",  // GET, POST, PUT, DELETE
      
      // Authentication (optional)
      auth: {
        type: "bearer",
        token: "my-secret-token"
      }
    }
  }
};
```

### Manual

No automatic trigger. Workflow is started programmatically via Temporal client.

```typescript
// config.ts
export const myManualWorkflowConfig = {
  name: "myManualWorkflow",
  namespace: "default",
  taskQueue: "manual-tasks",
  trigger: {
    type: "manual" as const,
    config: {}
  }
};
```

## Webhook Authentication

Webhooks can be configured with authentication to secure your endpoints.

### Bearer Token

```typescript
trigger: {
  type: "webhook",
  config: {
    path: "/secure-endpoint",
    method: "POST",
    auth: {
      type: "bearer",
      token: "my-secret-bearer-token"
    }
  }
}
```

**Request:**
```bash
curl -X POST http://localhost:3000/webhooks/secure-endpoint \
  -H "Authorization: Bearer my-secret-bearer-token" \
  -H "Content-Type: application/json" \
  -d '{"data": "test"}'
```

### API Key

```typescript
trigger: {
  type: "webhook",
  config: {
    path: "/api-endpoint",
    method: "POST",
    auth: {
      type: "api-key",
      token: "my-api-key-123",
      headerName: "X-API-Key"  // Optional, default: X-API-Key
    }
  }
}
```

**Request:**
```bash
curl -X POST http://localhost:3000/webhooks/api-endpoint \
  -H "X-API-Key: my-api-key-123" \
  -H "Content-Type: application/json" \
  -d '{"data": "test"}'
```

### Basic Auth

```typescript
trigger: {
  type: "webhook",
  config: {
    path: "/basic-endpoint",
    method: "POST",
    auth: {
      type: "basic",
      token: "dXNlcm5hbWU6cGFzc3dvcmQ="  // base64 of "username:password"
    }
  }
}
```

**Request:**
```bash
curl -X POST http://localhost:3000/webhooks/basic-endpoint \
  -H "Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=" \
  -H "Content-Type: application/json" \
  -d '{"data": "test"}'
```

### No Authentication (Public)

```typescript
trigger: {
  type: "webhook",
  config: {
    path: "/public-endpoint",
    method: "POST"
    // No auth = public endpoint
  }
}
```

## Workflow Structure

Each workflow deployed to MinIO must have the following structure:

```
my-workflow/
├── workflow.ts     # Workflow implementation
└── config.ts       # Workflow configuration
```

### workflow.ts

```typescript
import { proxyActivities } from "@temporalio/workflow";

const activities = proxyActivities<{
  logMessage: (message: string) => Promise<void>;
  httpRequest: (params: { url: string; method: string; headers?: Record<string, string>; body?: unknown }) => Promise<unknown>;
}>({
  startToCloseTimeout: "1 minute",
  retry: {
    maximumAttempts: 3,
  },
});

interface OrderInput {
  orderId: string;
  amount: number;
}

export async function orderWorkflow(input: OrderInput): Promise<string> {
  await activities.logMessage(`Processing order ${input.orderId}`);
  
  // Your workflow logic here
  
  await activities.logMessage(`Order ${input.orderId} completed`);
  return `Order ${input.orderId} processed successfully`;
}
```

### config.ts

```typescript
export const orderWorkflowConfig = {
  name: "orderWorkflow",
  namespace: "orders",
  taskQueue: "order-processing",
  trigger: {
    type: "webhook" as const,
    config: {
      path: "/orders",
      method: "POST",
      auth: {
        type: "bearer",
        token: "order-service-token-123"
      }
    }
  }
};
```

## Complete Example

### 1. Create a workflow folder

```bash
mkdir -p my-workflows/order-processing
```

### 2. Create workflow.ts

```typescript
// my-workflows/order-processing/workflow.ts
import { proxyActivities } from "@temporalio/workflow";

const activities = proxyActivities<{
  logMessage: (message: string) => Promise<void>;
}>({
  startToCloseTimeout: "1 minute",
});

interface OrderPayload {
  body: {
    orderId: string;
    customerId: string;
    items: Array<{ productId: string; quantity: number }>;
    total: number;
  };
  query: Record<string, unknown>;
  headers: Record<string, unknown>;
  timestamp: string;
}

export async function orderProcessingWorkflow(payload: OrderPayload): Promise<string> {
  const order = payload.body;
  
  await activities.logMessage(`Received order ${order.orderId} from customer ${order.customerId}`);
  await activities.logMessage(`Processing ${order.items.length} items, total: $${order.total}`);
  
  // Simulate processing steps
  await activities.logMessage("Validating order...");
  await activities.logMessage("Reserving inventory...");
  await activities.logMessage("Processing payment...");
  await activities.logMessage("Order completed!");
  
  return `Order ${order.orderId} processed successfully`;
}
```

### 3. Create config.ts

```typescript
// my-workflows/order-processing/config.ts
export const orderProcessingWorkflowConfig = {
  name: "orderProcessingWorkflow",
  namespace: "ecommerce",
  taskQueue: "order-queue",
  trigger: {
    type: "webhook" as const,
    config: {
      path: "/orders/process",
      method: "POST",
      auth: {
        type: "api-key",
        token: "order-api-key-abc123",
        headerName: "X-Order-API-Key"
      }
    }
  }
};
```

### 4. Deploy using CLI

```bash
workflow-cli login
workflow-cli deploy ./my-workflows/order-processing
```

### 5. Test the webhook

```bash
curl -X POST http://localhost:3000/webhooks/orders/process \
  -H "X-Order-API-Key: order-api-key-abc123" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORD-001",
    "customerId": "CUST-123",
    "items": [
      {"productId": "PROD-A", "quantity": 2},
      {"productId": "PROD-B", "quantity": 1}
    ],
    "total": 99.99
  }'
```

## Available Activities

The worker provides these built-in activities:

### logMessage

Logs a message to the console.

```typescript
await activities.logMessage("Hello, World!");
```

### httpRequest

Makes an HTTP request to an external service.

```typescript
const response = await activities.httpRequest({
  url: "https://api.example.com/data",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer token"
  },
  body: { key: "value" }
});
```

## Project Structure

```
temporal-worker/
├── src/
│   ├── index.ts              # Main entry point
│   ├── client.ts             # Temporal client (per namespace)
│   ├── registry.ts           # Workflow registry
│   ├── config/
│   │   └── index.ts          # Configuration
│   ├── types/
│   │   └── index.ts          # TypeScript types
│   ├── activities/
│   │   └── index.ts          # Activity implementations
│   ├── services/
│   │   ├── minio.ts          # MinIO client
│   │   └── watcher.ts        # Workflow watcher
│   ├── workers/
│   │   └── manager.ts        # Worker manager
│   └── triggers/
│       ├── index.ts          # Trigger exports
│       ├── base.trigger.ts   # Base trigger class
│       ├── schedule.trigger.ts
│       ├── polling.trigger.ts
│       ├── webhook.trigger.ts
│       └── manual.trigger.ts
├── workflows/                 # Downloaded workflows (auto-managed)
├── package.json
├── tsconfig.json
└── README.md
```

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal server address |
| `MINIO_ENDPOINT` | `localhost` | MinIO server endpoint |
| `MINIO_PORT` | `9000` | MinIO server port |
| `MINIO_USE_SSL` | `false` | Use SSL for MinIO connection |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO access key |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO secret key |
| `MINIO_BUCKET` | `temporal-workflows` | Bucket for workflow storage |
| `WEBHOOK_PORT` | `3000` | Port for webhook server |
| `WEBHOOK_HOST` | `0.0.0.0` | Host for webhook server |
| `WORKER_MAX_CONCURRENT_ACTIVITIES` | `100` | Max concurrent activities |
| `WORKER_MAX_CONCURRENT_WORKFLOWS` | `100` | Max concurrent workflows |
| `WORKER_SYNC_INTERVAL_MS` | `30000` | MinIO sync interval (ms) |
| `WORKFLOWS_DIR` | `./workflows` | Local workflows directory |

## Health Check

The webhook server provides a health check endpoint:

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"2024-12-10T15:30:00.000Z"}
```

## Integration with workflow-cli

This worker is designed to work with `temporal-workflow-cli` for deploying workflows:

```bash
# Install and setup CLI
cd ../temporal-workflow-cli
npm install
npm run build
npm link

# Login
workflow-cli login
# Enter secret: temporal-workflow-secret-2024

# Deploy a workflow
workflow-cli deploy ./my-workflow

# List deployed workflows
workflow-cli list

# Check workflow info
workflow-cli info my-workflow

# Rollback to previous version
workflow-cli rollback my-workflow
```

## License

MIT

