// Test the /instances HTTP endpoint

import { startServer } from "../dist/server.js";
import { rmSync, existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const REGISTRY = join(homedir(), ".pi", "agent", "webui-instances.json");
if (existsSync(REGISTRY)) rmSync(REGISTRY);

const bridge = {
  isReady: () => true,
  getSnapshot: () => ({ type: "snapshot", serverVersion: "test", mode: "print", bridgeReady: true, setupDone: true, isIdle: true, model: { id: "test", provider: "test", displayName: "Test" }, scopedModels: [], allTools: [], activeTools: [], commands: [], thinkingLevel: "off", sessionId: undefined, sessionFile: undefined, sessionDir: undefined, sessionName: undefined, startReason: undefined, cwd: "/tmp" }),
  handleRequest: async (r) => r,
  onEvent: null,
};

const url1 = await startServer(bridge, { host: "127.0.0.1", port: 19920, cwd: "/tmp/A", sessionId: "sess-A" });
const url2 = await startServer(bridge, { host: "127.0.0.1", port: 19920, cwd: "/tmp/B", sessionId: "sess-B" });

const r1 = await fetch("http://127.0.0.1:19920/instances").then(r => r.json());
const r2 = await fetch(`http://127.0.0.1:${url2.port}/instances`).then(r => r.json());

console.log(`[/instances from 19920]`, JSON.stringify(r1));
console.log(`[/instances from ${url2.port}]`, JSON.stringify(r2));

if (!Array.isArray(r1) || r1.length !== 2) { console.error("FAIL"); process.exit(1); }
if (!Array.isArray(r2) || r2.length !== 2) { console.error("FAIL"); process.exit(1); }

// HTML page should contain __PI_WEBUI__ injection
const html = await fetch("http://127.0.0.1:19920/").then(r => r.text());
if (!html.includes("window.__PI_WEBUI__")) { console.error("FAIL: HTML missing __PI_WEBUI__ injection"); process.exit(1); }
const match = html.match(/window\.__PI_WEBUI__\s*=\s*(\{[^}]+\})/);
if (!match) { console.error("FAIL: could not parse injected config"); process.exit(1); }
const config = JSON.parse(match[1].replace(/'/g, '"'));
console.log(`[html injected config]`, config);
if (config.port !== 19920) { console.error("FAIL: injected port wrong"); process.exit(1); }

console.log("\n=== PASS ===");
await url1.close();
await url2.close();
process.exit(0);