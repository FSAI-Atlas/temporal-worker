import express, { Express, Request, Response, Router } from "express";
import { BaseTrigger } from "./base.trigger";
import { RegisteredWorkflow, WebhookTriggerConfig, WebhookTriggerConfigSchema } from "../types";
import { getClientForNamespace } from "../client";
import { appConfig } from "../config";

let sharedApp: Express | null = null;
let sharedRouter: Router | null = null;
let serverInstance: ReturnType<Express["listen"]> | null = null;
let registeredTriggers = 0;

function getSharedApp(): { app: Express; router: Router } {
  if (!sharedApp) {
    sharedApp = express();
    sharedApp.use(express.json());
    sharedRouter = Router();
    sharedApp.use("/webhooks", sharedRouter);

    sharedApp.get("/health", (_req, res) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });
  }

  return { app: sharedApp, router: sharedRouter! };
}

async function startServer(): Promise<void> {
  if (serverInstance) {
    return;
  }

  const { app } = getSharedApp();

  return new Promise((resolve) => {
    serverInstance = app.listen(appConfig.webhook.port, appConfig.webhook.host, () => {
      console.log(`Webhook server listening on ${appConfig.webhook.host}:${appConfig.webhook.port}`);
      resolve();
    });
  });
}

async function stopServer(): Promise<void> {
  if (serverInstance && registeredTriggers === 0) {
    return new Promise((resolve) => {
      serverInstance!.close(() => {
        serverInstance = null;
        sharedApp = null;
        sharedRouter = null;
        console.log("Webhook server stopped");
        resolve();
      });
    });
  }
}

// Webhook trigger receives HTTP requests and starts workflows
export class WebhookTrigger extends BaseTrigger {
  private config: WebhookTriggerConfig;

  constructor(workflow: RegisteredWorkflow) {
    super(workflow);
    this.config = WebhookTriggerConfigSchema.parse(workflow.trigger.config || { path: `/${workflow.name}` });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`Webhook trigger for ${this.workflow.name} is already running`);
      return;
    }

    const { router } = getSharedApp();

    const handler = this.createHandler();
    const path = this.config.path;

    switch (this.config.method) {
      case "GET":
        router.get(path, handler);
        break;
      case "POST":
        router.post(path, handler);
        break;
      case "PUT":
        router.put(path, handler);
        break;
      case "DELETE":
        router.delete(path, handler);
        break;
      default:
        router.post(path, handler);
    }

    registeredTriggers++;
    await startServer();

    this.isRunning = true;
    console.log(
      `Webhook trigger registered for ${this.workflow.name} at ${this.config.method} /webhooks${path} (${this.workflow.namespace}:${this.workflow.taskQueue})`
    );
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    registeredTriggers--;
    this.isRunning = false;

    await stopServer();
    console.log(`Webhook trigger stopped for ${this.workflow.name}`);
  }

  private createHandler() {
    return async (req: Request, res: Response) => {
      try {
        const workflowId = await this.startWorkflow(req.body, req.query, req.headers);

        res.json({
          success: true,
          workflowId,
          namespace: this.workflow.namespace,
          taskQueue: this.workflow.taskQueue,
          message: `Workflow ${this.workflow.name} started successfully`,
        });
      } catch (error) {
        console.error(`Failed to start workflow ${this.workflow.name}:`, error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    };
  }

  private async startWorkflow(
    body: unknown,
    query: Record<string, unknown>,
    headers: Record<string, unknown>
  ): Promise<string> {
    const client = await getClientForNamespace(this.workflow.namespace);
    const workflowId = this.generateWorkflowId("webhook");

    const payload = {
      body,
      query,
      headers: this.sanitizeHeaders(headers),
      timestamp: new Date().toISOString(),
    };

    await client.workflow.start(this.workflow.name, {
      taskQueue: this.workflow.taskQueue,
      workflowId,
      args: [payload],
    });

    console.log(`Webhook trigger started workflow: ${workflowId} (${this.workflow.namespace})`);
    return workflowId;
  }

  private sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
    const sensitiveHeaders = ["authorization", "cookie", "x-api-key"];
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(headers)) {
      if (!sensitiveHeaders.includes(key.toLowerCase())) {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
