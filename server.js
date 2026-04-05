import LaunchDarkly from "@launchdarkly/node-server-sdk";
import { Observability } from "@launchdarkly/observability-node";

const PORT = process.env.PORT || 4300;
const HIVE_URL = (process.env.HIVE_URL || "http://localhost:3000").replace(/\/$/, "");
const HIVE_ADMIN_TOKEN = process.env.HIVE_ADMIN_TOKEN || "";

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Proxy: GET /api/workspaces
    if (path === "/api/workspaces" && req.method === "GET") {
      const res = await fetch(`${HIVE_URL}/workspaces`, {
        headers: hiveHeaders(),
      });
      return new Response(res.body, {
        status: res.status,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    // GET /api/workspaces/:id/conversation — conversation.json
    const convMatch = path.match(/^\/api\/workspaces\/([^/]+)\/conversation$/);
    if (convMatch && req.method === "GET") {
      const id = convMatch[1];
      const wsRes = await fetch(`${HIVE_URL}/workspaces/${id}`, { headers: hiveHeaders() });
      if (!wsRes.ok) return new Response("Not found", { status: 404 });
      const ws = await wsRes.json();
      const convFile = Bun.file(`${ws.path}/conversation.json`);
      if (await convFile.exists()) {
        return new Response(await convFile.text(), {
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }
      return new Response("[]", { headers: { "Content-Type": "application/json" } });
    }

    // Proxy: GET /api/workspaces/:id/logs (SSE)
    const logsMatch = path.match(/^\/api\/workspaces\/([^/]+)\/logs$/);
    if (logsMatch && req.method === "GET") {
      const id = logsMatch[1];
      const res = await fetch(`${HIVE_URL}/workspaces/${id}/logs`, {
        headers: hiveHeaders(),
      });
      return new Response(res.body, {
        status: res.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // Proxy: PATCH /api/workspaces/:id
    const patchMatch = path.match(/^\/api\/workspaces\/([^/]+)$/);
    if (patchMatch && req.method === "PATCH") {
      const id = patchMatch[1];
      const body = await req.text();
      const res = await fetch(`${HIVE_URL}/workspaces/${id}`, {
        method: "PATCH",
        headers: { ...hiveHeaders(), "Content-Type": "application/json" },
        body,
      });
      return new Response(res.body, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Proxy: POST /api/workspaces/:id/start
    const startMatch = path.match(/^\/api\/workspaces\/([^/]+)\/start$/);
    if (startMatch && req.method === "POST") {
      const id = startMatch[1];
      const res = await fetch(`${HIVE_URL}/workspaces/${id}/start`, {
        method: "POST",
        headers: hiveHeaders(),
      });
      return new Response(res.body, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Proxy: POST /api/workspaces/:id/stop
    const stopMatch = path.match(/^\/api\/workspaces\/([^/]+)\/stop$/);
    if (stopMatch && req.method === "POST") {
      const id = stopMatch[1];
      const res = await fetch(`${HIVE_URL}/workspaces/${id}/stop`, {
        method: "POST",
        headers: hiveHeaders(),
      });
      return new Response(res.body, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Proxy: POST /api/workspaces/:id/message
    const msgMatch = path.match(/^\/api\/workspaces\/([^/]+)\/message$/);
    if (msgMatch && req.method === "POST") {
      const id = msgMatch[1];
      const body = await req.text();
      const res = await fetch(`${HIVE_URL}/workspaces/${id}/message`, {
        method: "POST",
        headers: { ...hiveHeaders(), "Content-Type": "application/json" },
        body,
      });
      return new Response(res.body, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Proxy: POST /api/workspaces/:id/emergency
    const emergencyMatch = path.match(/^\/api\/workspaces\/([^/]+)\/emergency$/);
    if (emergencyMatch && req.method === "POST") {
      const id = emergencyMatch[1];
      const body = await req.text();
      const res = await fetch(`${HIVE_URL}/workspaces/${id}/emergency`, {
        method: "POST",
        headers: { ...hiveHeaders(), "Content-Type": "application/json" },
        body,
      });
      return new Response(res.body, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Static files from public/
    if (path === "/" || path === "/index.html") {
      return new Response(Bun.file("public/index.html"), {
        headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
      });
    }

    const staticFile = Bun.file(`public${path}`);
    if (await staticFile.exists()) {
      return new Response(staticFile);
    }

    return new Response("Not Found", { status: 404 });
  },
});

function hiveHeaders() {
  const h = {};
  if (HIVE_ADMIN_TOKEN) h["Authorization"] = `Bearer ${HIVE_ADMIN_TOKEN}`;
  return h;
}

// LaunchDarkly initialization
const ldClient = LaunchDarkly.init(process.env.LD_SDK_KEY, {
  plugins: [new Observability({ serviceName: "mind", environment: "production", consoleMethodsToRecord: ["warn", "error"] })],
});
const ldContext = { kind: "service", key: "mind", name: "Mind" };

ldClient.on("ready", () => {
  console.log("LaunchDarkly client ready");
});

ldClient.on("failed", (err) => {
  console.error("LaunchDarkly client failed to initialize:", err);
});

process.on("exit", () => ldClient.close());
process.on("SIGINT", () => { ldClient.close(); process.exit(0); });
process.on("SIGTERM", () => { ldClient.close(); process.exit(0); });

console.log(`Mind listening on http://localhost:${server.port}`);
