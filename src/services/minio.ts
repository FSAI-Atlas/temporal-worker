import * as Minio from "minio";
import * as fs from "fs";
import * as path from "path";
import extract from "extract-zip";
import { appConfig } from "../config";

let minioClient: Minio.Client | null = null;

function getClient(): Minio.Client {
  if (!minioClient) {
    minioClient = new Minio.Client({
      endPoint: appConfig.minio.endPoint,
      port: appConfig.minio.port,
      useSSL: appConfig.minio.useSSL,
      accessKey: appConfig.minio.accessKey,
      secretKey: appConfig.minio.secretKey,
    });
  }
  return minioClient;
}

export interface WorkflowMetadata {
  name: string;
  version: string;
  namespace: string;
  taskQueue: string;
  trigger: {
    type: "schedule" | "polling" | "webhook" | "manual";
    config?: Record<string, unknown>;
  };
  deployedAt: string;
  deployedBy?: string;
  checksum: string;
}

export interface DeployedWorkflow {
  name: string;
  version: string;
  metadata: WorkflowMetadata;
  localPath: string;
}

// List all workflows in the bucket
export async function listDeployedWorkflows(): Promise<string[]> {
  const client = getClient();
  const workflows = new Set<string>();

  try {
    const exists = await client.bucketExists(appConfig.minio.bucket);
    if (!exists) {
      console.log(`Bucket ${appConfig.minio.bucket} does not exist yet`);
      return [];
    }

    const stream = client.listObjects(appConfig.minio.bucket, "", false);

    return new Promise((resolve, reject) => {
      stream.on("data", (obj) => {
        if (obj.prefix) {
          const name = obj.prefix.replace(/\/$/, "");
          workflows.add(name);
        }
      });
      stream.on("error", reject);
      stream.on("end", () => resolve(Array.from(workflows)));
    });
  } catch (error) {
    console.error("Failed to list workflows from MinIO:", error);
    return [];
  }
}

// Get the latest version of a workflow
export async function getLatestVersion(workflowName: string): Promise<string | null> {
  const client = getClient();

  try {
    const latestKey = `${workflowName}/latest`;
    const stream = await client.getObject(appConfig.minio.bucket, latestKey);

    return new Promise((resolve, reject) => {
      let data = "";
      stream.on("data", (chunk) => (data += chunk));
      stream.on("end", () => resolve(data.trim()));
      stream.on("error", reject);
    });
  } catch {
    return null;
  }
}

// Get workflow metadata
export async function getWorkflowMetadata(
  workflowName: string,
  version: string
): Promise<WorkflowMetadata | null> {
  const client = getClient();

  try {
    const metadataKey = `${workflowName}/${version}/metadata.json`;
    const stream = await client.getObject(appConfig.minio.bucket, metadataKey);

    return new Promise((resolve, reject) => {
      let data = "";
      stream.on("data", (chunk) => (data += chunk));
      stream.on("end", () => resolve(JSON.parse(data)));
      stream.on("error", reject);
    });
  } catch {
    return null;
  }
}

// Download and extract a workflow bundle
export async function downloadWorkflow(
  workflowName: string,
  version: string,
  targetDir: string
): Promise<string> {
  const client = getClient();

  // Create target directory
  const workflowDir = path.join(targetDir, workflowName);
  if (!fs.existsSync(workflowDir)) {
    fs.mkdirSync(workflowDir, { recursive: true });
  }

  // Download bundle
  const bundleKey = `${workflowName}/${version}/bundle.zip`;
  const tempZipPath = path.join(targetDir, `${workflowName}-${version}.zip`);

  await client.fGetObject(appConfig.minio.bucket, bundleKey, tempZipPath);

  // Clear existing files in workflow directory
  const existingFiles = fs.readdirSync(workflowDir);
  for (const file of existingFiles) {
    const filePath = path.join(workflowDir, file);
    if (fs.statSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
    }
  }

  // Extract bundle
  await extract(tempZipPath, { dir: path.resolve(workflowDir) });

  // Cleanup temp file
  fs.unlinkSync(tempZipPath);

  console.log(`Downloaded and extracted workflow: ${workflowName}@${version}`);
  return workflowDir;
}

// Check if a workflow needs to be updated
export async function checkWorkflowUpdate(
  workflowName: string,
  currentVersion: string | null
): Promise<{ needsUpdate: boolean; latestVersion: string | null }> {
  const latestVersion = await getLatestVersion(workflowName);

  if (!latestVersion) {
    return { needsUpdate: false, latestVersion: null };
  }

  if (!currentVersion || currentVersion !== latestVersion) {
    return { needsUpdate: true, latestVersion };
  }

  return { needsUpdate: false, latestVersion };
}

