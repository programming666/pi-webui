// Simulate what browser does: load HTML, check it has the script, simulate WS
import { WebSocket } from "ws";

const html = await fetch("http://127.0.0.1:9777/").then(r => r.text());
const matches = html.match(/__PI_WEBUI__\s*=\s*\{[^}]+\}/);
console.log("HTML injected:", matches ? matches[0] : "NONE");
console.log("Has app.js script:", html.includes('app.js'));

const ws = new WebSocket("ws://127.0.0.1:9777/ws");
ws.on("open", () => { console.log("WS connected"); ws.close(); process.exit(0); });
ws.on("error", e => { console.log("WS error:", e.message); process.exit(1); });
setTimeout(() => { console.log("WS timeout"); process.exit(2); }, 3000);