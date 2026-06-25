import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import type { AtCoderMessage } from "../services/atcoder/messages";
import { JsonStore } from "./json-store";
import { DataService } from "./data-service";

export interface DesktopStatus {
  username: string;
  authenticated: boolean;
  authMode: "atcoder" | "public";
  serverUrl: string;
  version: string;
}

interface ServerActions {
  status(): Promise<DesktopStatus>;
  login(): Promise<DesktopStatus>;
  logout(): Promise<DesktopStatus>;
  setUsername(username: string): Promise<DesktopStatus>;
  resetAccount(): Promise<DesktopStatus>;
}

export async function startLocalServer(options: {
  assetDir: string;
  token: string;
  store: JsonStore;
  dataService: DataService;
  actions: ServerActions;
}): Promise<{ url: string; close(): Promise<void> }> {
  let origin = "";
  const server = createServer(async (request, response) => {
    try {
      if (request.url?.startsWith("/api/")) {
        if (!isAuthorizedRequest(request.headers, options.token, origin)) return sendJson(response, 403, { error: "Forbidden" });
        await handleApi(request, response, options);
        return;
      }
      await serveAsset(request, response, options.assetDir);
    } catch (error) {
      sendJson(response, 500, { error: String(error) });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to bind local server");
  origin = `http://127.0.0.1:${address.port}`;
  return {
    url: origin,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

export function isAuthorizedRequest(
  headers: IncomingMessage["headers"],
  token: string,
  origin: string
): boolean {
  return headers["x-atcoder-dashboard-token"] === token &&
    (headers.origin === origin || headers.origin === undefined);
}

async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  options: {
    store: JsonStore;
    dataService: DataService;
    actions: ServerActions;
  }
): Promise<void> {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  const body = request.method === "POST" ? await readBody(request) : {};
  if (path === "/api/status") return sendJson(response, 200, await options.actions.status());
  if (path === "/api/auth/login") return sendJson(response, 200, await options.actions.login());
  if (path === "/api/auth/logout") return sendJson(response, 200, await options.actions.logout());
  if (path === "/api/settings/username") {
    return sendJson(response, 200, await options.actions.setUsername(String(body.username ?? "")));
  }
  if (path === "/api/account/reset") return sendJson(response, 200, await options.actions.resetAccount());
  if (path === "/api/cache/clear") {
    await options.dataService.clearCache();
    return sendJson(response, 200, { ok: true });
  }
  if (path === "/api/message") {
    return sendJson(response, 200, await options.dataService.handle(body as unknown as AtCoderMessage));
  }
  if (path === "/api/storage/get") {
    return sendJson(response, 200, await options.store.get(body.keys as string | string[] | null));
  }
  if (path === "/api/storage/set") {
    await options.store.set(body.items as Record<string, unknown>);
    return sendJson(response, 200, { ok: true });
  }
  if (path === "/api/storage/remove") {
    await options.store.remove(body.keys as string | string[]);
    return sendJson(response, 200, { ok: true });
  }
  sendJson(response, 404, { error: "Not found" });
}

async function serveAsset(request: IncomingMessage, response: ServerResponse, assetDir: string): Promise<void> {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  const requested = pathname === "/" || !extname(pathname) ? "index.html" : pathname.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  const path = join(assetDir, safePath);
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Content-Type": contentType(path),
      "Cache-Control": path.endsWith("index.html") ? "no-store" : "public, max-age=3600",
      "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'"
    });
    createReadStream(path).pipe(response);
  } catch {
    response.writeHead(404);
    response.end(await readFile(join(assetDir, "index.html"), "utf8"));
  }
}

function contentType(path: string): string {
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 2_000_000) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
}
