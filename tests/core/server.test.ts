import { describe, expect, test, beforeAll } from "bun:test";
import { createApp } from "../../src/server";
import { ConfigReader } from "../../src/core/config-reader";
import type { Hono } from "hono";

describe("Server API Integration", () => {
  let app: Hono;
  const TEST_TOKEN = "abcdefghijklmnopqrstuvwxyzabcdef";

  beforeAll(async () => {
    ConfigReader.load();
    app = await createApp();
  });

  describe("Basic Endpoints", () => {
    test("GET /health should return 200", async () => {
      const res = await app.request("/health");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
    });

    test("GET /agent/status with token should return 200", async () => {
      const res = await app.request("/agent/status", {
        headers: { "x-eve-token": TEST_TOKEN }
      });
      expect(res.status).toBe(200);
    });
  });

  describe("Jobs Chat API", () => {
    test("POST /jobs/chat should return actual stream content", async () => {
      const res = await app.request("/jobs/chat", {
        method: "POST",
        headers: { 
          "x-eve-token": TEST_TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: "test-conv",
          messages: [{ role: "user", content: "Hi" }]
        })
      });
      
      expect(res.status).toBe(200);
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let hasContent = false;
      let chunks = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          chunks += chunk;
          if (chunk.includes("text-delta") || chunk.includes("content")) {
            hasContent = true;
          }
        }
      }
      
      console.log("Full SSE Response Chunks:", chunks);
      expect(hasContent).toBe(true);
    });

    test("GET /jobs/chat/conversations should return 200", async () => {
      const res = await app.request("/jobs/chat/conversations", {
        headers: { "x-eve-token": TEST_TOKEN }
      });
      expect(res.status).toBe(200);
    });
  });
});
