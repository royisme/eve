import { Dispatcher } from "./core/dispatcher";

type IngestPayload = {
  url: string;
  content: string;
  timestamp: string;
};

type GeneratePayload = {
  prompt: string;
  contextId?: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const dispatcher = new Dispatcher();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

export function startServer(port = 3033): void {
  const server = Bun.serve({
    port,
    fetch: async (request) => {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/ingest") {
        const payload = (await request.json()) as IngestPayload;
        console.log(`[server] ingest url=${payload.url}`);

        // Construct pseudo-email for Dispatcher
        const email = {
          id: `ext-${Date.now()}`,
          threadId: `thread-ext-${Date.now()}`,
          from: "chrome-extension", // Trigger logic might need "indeed.com" in sender to route to IndeedAdapter
          subject: `Page Ingest: ${payload.url}`, // Might need "job" keyword
          snippet: "Ingested via chrome extension",
          body: payload.content,
          date: new Date(payload.timestamp),
        };

        // Hack: If URL is indeed, force sender to indeed to trigger Adapter
        if (payload.url.includes("indeed.com")) {
          email.from = "alerts@indeed.com";
          email.subject = "Indeed Job Alert";
        } else if (payload.url.includes("linkedin.com")) {
          email.from = "jobs-listings@linkedin.com";
          email.subject = "LinkedIn Job Alert";
        }

        await dispatcher.dispatch(email);

        return jsonResponse({ status: "ok" });
      }

      if (request.method === "POST" && url.pathname === "/generate") {
        const payload = (await request.json()) as GeneratePayload;
        return jsonResponse({ text: `Echo: ${payload.prompt}` });
      }

      return jsonResponse({ error: "Not found" }, 404);
    },
  });

  console.log(`🚀 Eve server listening on http://localhost:${server.port}`);
}
