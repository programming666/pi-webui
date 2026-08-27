/**
 * Smoke test: starts the bridge HTTP+WS server using a fake PiBridge
 * implementation that just echoes everything. This verifies the transport
 * layer works without needing a real pi session.
 *
 * Run: npx tsx scripts/smoke.ts
 */
import { startServer } from "../src/server.ts";
import { PiBridge } from "../src/bridge.ts";

// Minimal fake of the pi extension API — only the bits PiBridge touches.
// Constructing PiBridge requires it.
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
} as unknown as ConstructorParameters<typeof PiBridge>[0];

const bridge = new PiBridge(fakePi);
// Pretend the bridge is wired and ready.
(bridge as unknown as { latestCtx: unknown }).latestCtx = { ui: {} };

const running = await startServer(bridge, { port: 7779, host: "127.0.0.1" });
console.log("[smoke] bridge server listening on", `http://127.0.0.1:${running.port}`);

const h = await fetch("http://127.0.0.1:7779/health");
console.log("[smoke] /health  ->", await h.text());

const s = await fetch("http://127.0.0.1:7779/state");
console.log("[smoke] /state   ->", await s.text());

const m = await fetch("http://127.0.0.1:7779/messages");
console.log("[smoke] /messages->", await m.text());

await running.stop();
console.log("[smoke] stopped");