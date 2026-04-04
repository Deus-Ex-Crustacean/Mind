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
        headers: { "Content-Type": "application/json" },
      });
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

    // Static files from public/
    if (path === "/" || path === "/index.html") {
      return new Response(Bun.file("public/index.html"), {
        headers: { "Content-Type": "text/html" },
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

console.log(`Mind listening on http://localhost:${server.port}`);
