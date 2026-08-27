// Quick end-to-end test: spin up two servers on the same default port range
// and verify the second one auto-picks the next free port, both work, and
// both register/unregister cleanly.

import { WebSocket } from "ws";
import { startServer } from "../dist/server.js";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const REGISTRY = join(homedir(), ".pi", "agent", "webui-instances.json");
if (existsSync(REGISTRY)) rmSync(REGISTRY);

const mockBridge = (label) => ({
  isReady: () => true,
  getSnapshot: () => ({
    type: "snapshot",
    serverVersion: "test",
    mode: "print",
    bridgeReady: true,
    setupDone: true,
    isIdle: true,
    model: { id: "test", provider: "test", displayName: "Test Model" },
    scopedModels: [],
    allTools: [],
    activeTools: [],
    commands: [],
    thinkingLevel: "off",
    sessionId: undefined,
    sessionFile: undefined,
    sessionDir: undefined,
    sessionName: undefined,
    startReason: undefined,
    cwd: "/tmp",
  }),
  handleRequest: async (req) => ({ echo: req, from: label }),
  onEvent: null,
});

const url1 = await startServer(mockBridge("A"), { host: "127.0.0.1", port: 19900, cwd: "/tmp", sessionId: "sess-A" });
console.log(`[A] listening on ${url1.url}, port ${url1.port}`);

const url2 = await startServer(mockBridge("B"), { host: "127.0.0.1", port: 19900, cwd: "/tmp", sessionId: "sess-B" });
console.log(`[B] listening on ${url2.url}, port ${url2.port}`);

if (url1.port === url2.port) {
  console.error("FAIL: both servers got the same port");
  process.exit(1);
}
console.log(`[OK] ports differ: A=${url1.port}, B=${url2.port}`);

const reg = JSON.parse(readFileSync(REGISTRY, "utf8"));
console.log(`[registry] ${reg.length} entries:`, reg.map(e => `pid=${e.pid} port=${e.port} cwd=${e.cwd}`));
if (reg.length !== 2) { console.error("FAIL: expected 2 registry entries"); process.exit(1); }

// WS round-trip on both
for (const [label, url] of [["A", url1], ["B", url2]]) {
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(url.url);
    const timeout = setTimeout(() => reject(new Error(`${label} timeout`)), 3000);
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "ping_test", id: `t-${label}` }));
    });
    let got = 0;
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString("utf8"));
      console.log(`[${label} ws]`, JSON.stringify(msg).slice(0, 200));
      got++;
      if (msg.type === "response" && msg.id === `t-${label}`) {
        clearTimeout(timeout);
        ws.close();
        resolve();
      }
    });
    ws.on("error", reject);
  });
}

console.log("[closing A]");
await url1.close();
console.log("[closing B]");
await url2.close();

const regAfter = JSON.parse(readFileSync(REGISTRY, "utf8"));
console.log(`[registry after close] ${regAfter.length} entries`);
if (regAfter.length !== 0) { console.error("FAIL: registry not cleared"); process.exit(1); }

console.log("\n=== PASS ===");
process.exit(0);