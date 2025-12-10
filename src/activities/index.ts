// Activities are the building blocks that workflows use to interact with external systems.
// Add your activity implementations here and export them.

export async function logMessage(message: string): Promise<void> {
  console.log(`[Activity] ${message}`);
}

export async function httpRequest(params: {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: unknown;
}): Promise<unknown> {
  const response = await fetch(params.url, {
    method: params.method,
    headers: params.headers,
    body: params.body ? JSON.stringify(params.body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`HTTP request failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

