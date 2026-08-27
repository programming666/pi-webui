// pi-webui/src/server.ts
// HTTP + WebSocket server. Serves the web UI (HTML/CSS/JS), exposes a few
// REST endpoints for state/messages/health/instance registry, and runs a
// JSON-RPC WebSocket bridge that forwards events from the pi extension.
//
// Multi-instance: the default port is shared with a port-range scan so a
// second pi process started in another terminal will land on the next free
// port instead of failing with EADDRINUSE. Each running instance registers
// itself in ~/.pi/agent/webui-instances.json and unregisters on close.
//
// Manual WS upgrade handling is required because constructing a
// WebSocketServer({server}) attaches its own 'error' listener, which would
// crash the process on EADDRINUSE before our retry path can run.

import { createServer as createHttpServer, IncomingMessage, ServerResponse, Server as HttpServer } from "node:http";
import { promises as fs } from "node:fs";
import { existsSync, mkdirSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import {
  DEFAULT_PORT,
  SERVER_VERSION,
  type ServerMessage,
  type SnapshotMessage,
  type PiExtensionEvent,
} from "./types.js";

const MAX_PAYLOAD_BYTES = 64 * 1024 * 1024; // 64 MB
const DEFAULT_PORT_RANGE: readonly [number, number] = [9777, 9797];
const REGISTRY_DIR = path.join(os.homedir(), ".pi", "agent");
const REGISTRY_PATH = path.join(REGISTRY_DIR, "webui-instances.json");

export interface PiBridge {
  isReady(): boolean;
  getSnapshot(): unknown;
  handleRequest(req: unknown): Promise<unknown>;
  onEvent: ((event: PiExtensionEvent) => void) | null;
  registerWsClient?(ws: { send: (data: string) => void; readyState: number }): void;
  unregisterWsClient?(ws: { send: (data: string) => void; readyState: number }): void;
}

export interface ServerOptions {
  port?: number;
  host?: string;
  path?: string;
  portRange?: readonly [number, number];
  cwd?: string;
  sessionId?: string;
  quiet?: boolean;
}

export interface RunningServer {
  url: string;
  host: string;
  port: number;
  close(): Promise<void>;
}

export function startServer(bridge: PiBridge, opts: ServerOptions): Promise<RunningServer> {
  const host = opts.host ?? "127.0.0.1";
  const wsPath = opts.path ?? "/ws";
  const portRange: readonly [number, number] = opts.portRange ?? DEFAULT_PORT_RANGE;
  const startPort = opts.port ?? portRange[0];
  const cwd = opts.cwd ?? process.cwd();
  const sessionId = opts.sessionId ?? "";
  const quiet = !!opts.quiet;

  let actualPort = 0;
  const innerHandleHttp = (req: IncomingMessage, res: ServerResponse) => {
    handleHttp(req, res, bridge, host, () => actualPort, wsPath);
  };

  const httpServer = createHttpServer(innerHandleHttp);
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
    perMessageDeflate: false,
  });

  // Manual upgrade handling — see file header.
  httpServer.on("upgrade", (req, socket, head) => {
    const reqUrl = req.url ?? "/";
    if (!reqUrl.startsWith(wsPath)) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  let running = true;
  const clients = new Set<WebSocket>();
  let nextClientId = 1;
  let pingTimer: NodeJS.Timeout | null = null;

  const broadcast = (msg: ServerMessage) => {
    const json = JSON.stringify(msg);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    }
  };

  const sendHelloTo = (ws: WebSocket) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: "hello",
        version: SERVER_VERSION,
        mode: snapshotField(bridge, "mode"),
        connectedClients: clients.size,
        port: actualPort,
      }),
    );
  };

  const sendSnapshotTo = (ws: WebSocket) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(buildSnapshot(bridge, () => actualPort)));
  };

  wss.on("connection", (ws, req) => {
	const id = nextClientId++;
	clients.add(ws);
	bridge.registerWsClient?.(ws);
    sendHelloTo(ws);
    sendSnapshotTo(ws);
    ws.on("close", () => {
      clients.delete(ws);
      bridge.unregisterWsClient?.(ws);
    });
    ws.on("message", (raw) => {
      const text = raw.toString("utf8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== "object") return;
      const req2 = parsed as Record<string, unknown>;
      const action = (req2.type ?? req2.action) as string | undefined;
      const id2 = req2.id;
      const payload = (req2.payload ?? req2.params ?? {}) as Record<string, unknown>;
      if (typeof action !== "string" || typeof id2 !== "string") return;

const bridgeReq: import("./types.js").BrowserRequest = { action: action as import("./types.js").BrowserAction, id: id2 as string, payload };
      Promise.resolve(bridge.handleRequest(bridgeReq))
.then((envelope) => {
if (ws.readyState === WebSocket.OPEN) {
ws.send(JSON.stringify(envelope));
}
        })
        .catch((err) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "response",
                id: id2,
                success: false,
                error: err instanceof Error ? err.message : String(err),
              }),
            );
          }
        });
    });
  });

  const onEvent = (event: PiExtensionEvent) => {
    if (!running) return;
    broadcast({ type: "event", event });
  };
  bridge.onEvent = onEvent;

  // Health-check ping. Skipped when no clients.
  pingTimer = setInterval(() => {
    if (clients.size === 0) return;
    broadcast({ type: "ping", ts: Date.now() });
  }, 30000);
  pingTimer.unref?.();

  function tryListen(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const onError = (err: NodeJS.ErrnoException) => {
        httpServer.removeListener("listening", onListening);
        reject(err);
      };
      const onListening = () => {
        httpServer.removeListener("error", onError);
        const addr = httpServer.address();
        const bound = typeof addr === "object" && addr ? addr.port : port;
        resolve(bound);
      };
      httpServer.once("error", onError);
      httpServer.once("listening", onListening);
      httpServer.listen(port, host);
    });
  }

  return (async () => {
    const [rangeStart, rangeEnd] = portRange;
    const candidates: number[] = [];
    if (startPort >= rangeStart && startPort <= rangeEnd) {
      for (let p = startPort; p <= rangeEnd && candidates.length < 10; p++) {
        candidates.push(p);
      }
    } else {
      candidates.push(startPort);
      for (let p = rangeStart; p <= rangeEnd && candidates.length < 10; p++) {
        if (p !== startPort) candidates.push(p);
      }
    }

    let lastErr: NodeJS.ErrnoException | null = null;
    for (const port of candidates) {
      try {
        actualPort = await tryListen(port);
        if (port !== startPort && !quiet) {
          console.log(`[pi-webui] port ${startPort} busy, using ${actualPort} instead`);
        }
        break;
      } catch (err) {
        const e = err as NodeJS.ErrnoException;
        lastErr = e;
        if (e.code !== "EADDRINUSE") throw e;
        // close any half-open listener (defensive — listen() rejected)
        httpServer.close();
      }
    }
    if (actualPort === 0) {
      // Fall back to OS-assigned ephemeral.
      try {
        actualPort = await tryListen(0);
        if (!quiet) {
          console.log(`[pi-webui] all ports busy, using OS-assigned port ${actualPort}`);
        }
      } catch (err) {
        throw lastErr ?? err;
      }
    }

    // Register in the global instance registry.
    try {
      await registerInstance({
        pid: process.pid,
        port: actualPort,
        host,
        wsPath,
        cwd,
        sessionId,
        startedAt: new Date().toISOString(),
      });
    } catch (err) {
      if (!quiet) {
        console.warn("[pi-webui] failed to register instance:", err);
      }
    }

    // unref so pi can exit cleanly in --print / -p mode
    httpServer.unref?.();
    (wss as unknown as { _server?: HttpServer })._server?.unref?.();

    if (!quiet) {
      console.log(
        `[pi-webui] listening on ws://${host}:${actualPort}${wsPath}`,
      );
      console.log(`[pi-webui] web UI available at http://${host}:${actualPort}/`);
    }

    const close = async () => {
      if (!running) return;
      running = false;
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      bridge.onEvent = null;
      try {
        await unregisterInstance(process.pid, actualPort);
      } catch {
        // best effort
      }
      for (const client of clients) {
        try {
          client.close(1001, "server shutting down");
        } catch {
          // ignore
        }
      }
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
      wss.close();
    };

    return {
      url: `ws://${host}:${actualPort}${wsPath}`,
      host,
      port: actualPort,
      close,
    };
  })();
}

interface InstanceEntry {
  pid: number;
  port: number;
  host: string;
  wsPath: string;
  cwd: string;
  sessionId: string;
  startedAt: string;
}

async function readRegistry(): Promise<InstanceEntry[]> {
  try {
    const raw = await fs.readFile(REGISTRY_PATH, "utf8");
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // Filter out entries whose pid is no longer alive (process exited without unregister).
    return arr.filter((e) => isProcessAlive(e.pid));
  } catch {
    return [];
  }
}

async function writeRegistry(entries: InstanceEntry[]): Promise<void> {
  if (!existsSync(REGISTRY_DIR)) mkdirSync(REGISTRY_DIR, { recursive: true });
  await fs.writeFile(REGISTRY_PATH, JSON.stringify(entries, null, 2), "utf8");
}

async function registerInstance(entry: InstanceEntry): Promise<void> {
  const entries = await readRegistry();
  // De-duplicate by pid
  const filtered = entries.filter((e) => !(e.pid === entry.pid && e.port === entry.port));
  filtered.push(entry);
  await writeRegistry(filtered);
}

async function unregisterInstance(pid: number, port: number): Promise<void> {
  const entries = await readRegistry();
  const filtered = entries.filter((e) => !(e.pid === pid && e.port === port));
  await writeRegistry(filtered);
}

function isProcessAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function snapshotField(bridge: PiBridge, key: string): unknown {
  try {
    const snap = bridge.getSnapshot() as Record<string, unknown> | null;
    return snap?.[key];
  } catch {
    return undefined;
  }
}

function buildSnapshot(bridge: PiBridge, getPort: () => number): SnapshotMessage {
  const loading: SnapshotMessage = {
    type: "snapshot",
    serverVersion: SERVER_VERSION,
    mode: "unknown",
    bridgeReady: false,
    setupDone: false,
    isIdle: true,
    model: null,
    scopedModels: [],
    allTools: [],
    activeTools: [],
    commands: [],
    thinkingLevel: "off",
    sessionId: undefined,
    sessionFile: undefined,
    sessionName: undefined,
    startReason: undefined,
    port: getPort(),
    sessionDir: undefined,
    cwd: "",
  };
  try {
    if (!bridge.isReady()) return loading;
    const snap = bridge.getSnapshot() as Partial<SnapshotMessage>;
    return { ...loading, ...snap, type: "snapshot", serverVersion: SERVER_VERSION, port: getPort() };
  } catch {
    return loading;
  }
}

function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  bridge: PiBridge,
  host: string,
  getPort: () => number,
  wsPath: string,
): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`);
  const send = (status: number, body: unknown, contentType = "application/json") => {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    res.writeHead(status, {
      "Content-Type": contentType,
      "Content-Length": Buffer.byteLength(text),
      "Cache-Control": "no-store",
    });
    res.end(text);
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    send(405, { error: "method not allowed" });
    return;
  }

  if (url.pathname === "/health") {
    send(200, { ok: true, actualPort: getPort(), ts: Date.now() });
    return;
  }

  if (url.pathname === "/state") {
    send(200, buildSnapshot(bridge, getPort));
    return;
  }

  if (url.pathname === "/messages") {
    const beforeParam = url.searchParams.get("before");
    const limitParam = url.searchParams.get("limit");
    const payload: Record<string, unknown> = {};
    if (beforeParam) payload.before = beforeParam;
    if (limitParam) payload.limit = limitParam;
Promise.resolve(bridge.handleRequest({ action: "get_messages", id: "http-messages", payload }))
      .then((data) => send(200, data ?? []))
      .catch((err) => send(500, { error: err instanceof Error ? err.message : String(err) }));
    return;
  }

  if (url.pathname === "/instances") {
    readRegistry()
      .then((entries) => send(200, { instances: entries }))
      .catch((err) => send(500, { error: err instanceof Error ? err.message : String(err) }));
    return;
  }

  // Static UI
  if (url.pathname === "/" || url.pathname === "/index.html") {
    serveHtml(res, host, getPort, wsPath);
    return;
  }

  sendStatic(res, url.pathname, host, getPort, wsPath);
}

function serveHtml(
  res: ServerResponse,
  host: string,
  getPort: () => number,
  wsPath: string,
): void {
  const uiDir = findUiDir();
  if (!uiDir) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("web UI not found (expected app.html next to server.ts)");
    return;
  }
  const htmlPath = path.join(uiDir, "app.html");
  fs.readFile(htmlPath, "utf8")
    .then((html) => {
const injected = html.replace(
'<script type="module" src="app.js"></script>',
`<script>window.__PI_WEBUI__=${JSON.stringify({
host,
port: getPort(),
wsPath,
})}</script><script type="module" src="app.js"></script>`
);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(injected),
        "Cache-Control": "no-store",
      });
      res.end(injected);
    })
    .catch(() => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("failed to read app.html");
    });
}

function sendStatic(
  res: ServerResponse,
  pathname: string,
  host: string,
  getPort: () => number,
  wsPath: string,
): void {
  const uiDir = findUiDir();
  if (!uiDir) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  const filePath = path.join(uiDir, pathname.replace(/^\/+/, ""));
  if (!filePath.startsWith(uiDir)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("forbidden");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
  };
  const ct = mime[ext] ?? "application/octet-stream";
  // For .html under specific filenames, re-inject port (defensive)
  if (ext === ".html" && pathname === "/index.html") {
    serveHtml(res, host, getPort, wsPath);
    return;
  }
  fs.readFile(filePath)
    .then((buf) => {
      res.writeHead(200, {
        "Content-Type": ct,
        "Content-Length": buf.length,
        "Cache-Control": "no-store",
      });
      res.end(buf);
    })
    .catch(() => {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    });
}

function findUiDir(): string | null {
// server.ts may be loaded by jiti from src/ or pre-compiled to dist/.
// Use import.meta.dirname for ESM compat (undefined __dirname in ESM).
const here = (import.meta as any).dirname ?? __dirname;
const candidates = [
path.join(here, "ui"),
path.join(here, "..", "src", "ui"),
path.join(here, "..", "..", "src", "ui"),
  ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "app.html"))) return dir;
  }
  return null;
}