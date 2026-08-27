/**
 * Bridge smoke test:
 *   - Constructs a PiBridge against a stub ExtensionAPI.
 *   - Stubs the full ExtensionContext shape.
 *   - Calls startServer(bridge, {port:7779, ...}) and verifies HTTP endpoints.
 *
 * Run: npm run build && node scripts/smoke.mjs
 */
import { startServer } from "../dist/server.js";
import { PiBridge } from "../dist/bridge.js";

const ui = {
	setStatus: (k, v) => console.log("[stub-ui] status", k, "=", v),
	notify: (m, l) => console.log("[stub-ui] notify", l || "info", "-", m),
	setEditorText: () => {},
};

const sessionManager = {
	getSessionId: () => "stub-session-id",
	getSessionFile: () => "/tmp/stub-session.jsonl",
	getSessionDir: () => "/tmp/stub-sessions",
	getBranch: () => [{ id: "leaf", parentId: null, summary: "stub" }],
};

const ctx = {
	ui,
	cwd: process.cwd(),
	mode: "smoke",
	model: { provider: "stub", id: "stub-model", name: "Stub", contextWindow: 8000 },
	scopedModels: [],
	sessionManager,
	isIdle: () => true,
	getContextUsage: () => null,
};

const fakePi = {
	sendUserMessage: () => {},
	setActiveTools: () => {},
	setModel: () => true,
	setThinkingLevel: () => {},
	abort: () => {},
	getSessionName: () => "smoke-test",
	setSessionName: () => {},
	compact: async () => undefined,
	getActiveTools: () => [],
	getAllTools: () => [],
	getCommands: () => [],
	getModel: () => null,
	getThinkingLevel: () => "off",
	isIdle: () => true,
	getMessages: () => [],
	getScopedModels: () => [],
	setEditorText: () => {},
};

const bridge = new PiBridge(fakePi);
bridge.setContext(ctx, "test");
bridge.setCommandContext({
	newSession: async () => {},
	fork: async () => {},
	switchSession: async () => {},
	navigateTree: async () => {},
});

const server = await startServer(bridge, { port: 7779, host: "127.0.0.1", path: "/ws" });
console.log("[smoke] bridge listening on", server.url);

const probes = ["/health", "/state", "/messages"];
for (const path of probes) {
	const res = await fetch("http://127.0.0.1:7779" + path);
	const body = await res.text();
	console.log("[smoke] GET " + path + " -> " + body);
}

// WS round-trip
import { WebSocket } from "ws";
const ws = new WebSocket("ws://127.0.0.1:7779/ws");
await new Promise((resolve, reject) => {
	ws.on("open", resolve);
	ws.on("error", reject);
	setTimeout(() => reject(new Error("ws open timeout")), 3000);
});
ws.send(JSON.stringify({ type: "get_state", id: "r1" }));
const reply = await new Promise((resolve, reject) => {
	ws.onmessage = (msg) => resolve(msg.data.toString());
	ws.onerror = reject;
	setTimeout(() => reject(new Error("ws reply timeout")), 3000);
});
console.log("[smoke] ws reply ->", reply);
ws.close();

await server.close();
console.log("[smoke] done");