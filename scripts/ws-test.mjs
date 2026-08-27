import WebSocket from "ws";
import { setTimeout as sleep } from "node:timers/promises";

const ws = new WebSocket("ws://127.0.0.1:19715/ws");
let got = 0;

ws.on("open", async () => {
  console.log("[ws] connected");
  ws.send(JSON.stringify({ id: "t1", type: "action", action: "get_state" }));
  await sleep(500);
  ws.send(JSON.stringify({ id: "t2", type: "action", action: "get_messages" }));
  await sleep(500);
  ws.close();
});

ws.on("message", (data) => {
  got++;
  const msg = JSON.parse(data.toString());
  if (msg.type === "hello") console.log("[hello]", msg.version, "mode:", msg.mode);
  if (msg.type === "response") console.log("[response]", msg.id, "success:", msg.success, "data keys:", msg.data ? Object.keys(msg.data).length : 0);
  if (msg.type === "event") console.log("[event]", msg.event?.type);
});

ws.on("close", () => console.log("[ws] closed, messages received:", got));

await new Promise(r => setTimeout(r, 2000));
process.exit(0);
