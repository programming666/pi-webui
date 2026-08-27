import { WebSocket } from "ws";
import { startServer } from "../dist/server.js";

// Minimal mock bridge matching PiBridge shape
function makeBridge() {
  return {
    isReady: () => true,
    getSnapshot: () => ({
      type: "snapshot",
      serverVersion: "test",
      mode: "test",
      bridgeReady: true,
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
    }),
    handleRequest: async (req) => ({ ok: true, echoed: req }),
    onEvent: null,
  };
}

console.log("=== Test 1: First instance on default port ===");
const s1 = await startServer(makeBridge(), { port: 9777, host: "127.0.0.1", quiet: true });
console.log(`  → bound port ${s1.port}, url ${s1.url}`);

console.log("=== Test 2: Second instance on same port (should fall back) ===");
const s2 = await startServer(makeBridge(), { port: 9777, host: "127.0.0.1", quiet: true });
console.log(`  → bound port ${s2.port}, url ${s2.url}`);
if (s2.port === 9777) throw new Error("FAIL: second instance should NOT get 9777");
console.log(`  ✓ port auto-incremented to ${s2.port}`);

console.log("=== Test 3: Third instance (should land on port+2) ===");
const s3 = await startServer(makeBridge(), { port: 9777, host: "127.0.0.1", quiet: true });
console.log(`  → bound port ${s3.port}, url ${s3.url}`);
if (s3.port <= s2.port) throw new Error("FAIL: third instance should get higher port");
console.log(`  ✓ port auto-incremented to ${s3.port}`);

console.log("=== Test 4: WebSocket connection to first instance ===");
const ws = new WebSocket(s1.url);
await new Promise((resolve, reject) => {
  let got = 0;
  const want = 2; // hello + snapshot
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    got++;
    console.log(`  ← msg ${got}:`, msg.type, msg.type === "hello" ? `(port ${msg.port})` : "");
    if (got === want) resolve();
  });
  ws.on("error", reject);
  setTimeout(() => reject(new Error("timeout")), 3000);
});
ws.close();

console.log("=== Test 5: HTTP /health on second instance ===");
const res = await fetch(`http://127.0.0.1:${s2.port}/health`);
const body = await res.json();
console.log(`  ← ${res.status}:`, JSON.stringify(body));
if (body.actualPort !== s2.port) throw new Error("FAIL: /health should report actualPort");

console.log("=== Test 6: HTTP /instances registry ===");
const reg = await (await fetch(`http://127.0.0.1:${s1.port}/instances`)).json();
console.log(`  ← ${reg.instances.length} instances registered:`);
for (const inst of reg.instances) {
  console.log(`    pid=${inst.pid} port=${inst.port} host=${inst.host}`);
}
if (reg.instances.length !== 3) throw new Error(`FAIL: expected 3 instances, got ${reg.instances.length}`);

console.log("=== Test 7: HTML page injection ===");
const html = await (await fetch(`http://127.0.0.1:${s1.port}/`)).text();
if (!html.includes("__PI_WEBUI__")) throw new Error("FAIL: __PI_WEBUI__ not injected");
if (!html.includes(`"port":${s1.port}`)) throw new Error(`FAIL: port ${s1.port} not in injected script`);
console.log(`  ✓ injected window.__PI_WEBUI__ with port ${s1.port}`);

console.log("=== Cleanup ===");
await s1.close();
await s2.close();
await s3.close();

// Verify registry cleanup
import { promises as fs } from "fs";
import os from "os";
import path from "path";
const regPath = path.join(os.homedir(), ".pi", "agent", "webui-instances.json");
try {
  const content = await fs.readFile(regPath, "utf8");
  const arr = JSON.parse(content);
  console.log(`  → registry has ${arr.length} entries after close (should be 0)`);
} catch (err) {
  console.log(`  → registry file removed (good)`);
}

console.log("\n✓ All tests passed.");
process.exit(0);