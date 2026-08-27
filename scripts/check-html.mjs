import { startServer } from "../dist/server.js";
import { rmSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const REGISTRY = join(homedir(), ".pi", "agent", "webui-instances.json");
if (existsSync(REGISTRY)) rmSync(REGISTRY);

const bridge = {
  isReady: () => true,
  getSnapshot: () => ({ type: "snapshot", serverVersion: "test", mode: "print", bridgeReady: true, setupDone: true, isIdle: true, model: { id: "test", provider: "test", displayName: "Test" }, scopedModels: [], allTools: [], activeTools: [], commands: [], thinkingLevel: "off", sessionId: undefined, sessionFile: undefined, sessionDir: undefined, sessionName: undefined, startReason: undefined, cwd: "/tmp" }),
  handleRequest: async (r) => r,
  onEvent: null,
};

const u = await startServer(bridge, { host: "127.0.0.1", port: 19931, cwd: "/tmp/A", sessionId: "sess-A", quiet: true });
await new Promise(r => setTimeout(r, 200));
const html = await fetch("http://127.0.0.1:19931/").then(r => r.text());
console.log("has app.js?", html.includes("app.js"));
console.log("has app.css?", html.includes("app.css"));
console.log("has __PI_WEBUI__?", html.includes("__PI_WEBUI__"));
// look for the script tag
const m = html.match(/<script[^>]*><\/script>/);
console.log("empty script?", m?.[0]);
// look for app.js src
const m2 = html.match(/script[^>]*src=[^>]*/);
console.log("script src?", m2?.[0]);
console.log("tail of html:", html.slice(-200));
await u.close();
process.exit(0);