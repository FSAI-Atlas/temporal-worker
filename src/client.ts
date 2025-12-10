import { Client, Connection } from "@temporalio/client";
import { appConfig } from "./config";

// Manages multiple Temporal clients, one per namespace
const clients: Map<string, Client> = new Map();
let sharedConnection: Connection | null = null;

async function getConnection(): Promise<Connection> {
  if (!sharedConnection) {
    sharedConnection = await Connection.connect({
      address: appConfig.temporal.address,
    });
  }
  return sharedConnection;
}

// Get or create a client for a specific namespace
export async function getClientForNamespace(namespace: string): Promise<Client> {
  const existing = clients.get(namespace);
  if (existing) {
    return existing;
  }

  const connection = await getConnection();
  const client = new Client({
    connection,
    namespace,
  });

  clients.set(namespace, client);
  console.log(`Created Temporal client for namespace: ${namespace}`);

  return client;
}

export async function closeAllClients(): Promise<void> {
  clients.clear();
  
  if (sharedConnection) {
    await sharedConnection.close();
    sharedConnection = null;
  }
  
  console.log("All Temporal clients closed");
}
