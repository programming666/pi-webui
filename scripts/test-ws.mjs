import { startServer } from "../dist/server.js";

class MockBridge {
  constructor() { this.isIdle = true; }
  isReady() { return true; }
  getAvailableTools() { return [{name:'bash',description:'Run bash'},{name:'read',description:'Read file'}]; }
  getSnapshot() {
    return {
      ok: true, serverVersion: '0.1.0-test', mode: 'interactive',
      bridgeReady: true, setupDone: true,
      sessionId: 'test-session', cwd: '/tmp', sessionName: 'Test Session',
      sessionFile: '/tmp/test.jsonl',
      model: { id: 'MiniMax-M3', provider: 'MiniMax', name: 'MiniMax' },
      thinkingLevel: 'medium',
      commands: [{name:'/new',description:'New session'}],
      scopedModels: [{id:'MiniMax-M3',provider:'MiniMax'}],
      allTools: this.getAvailableTools(), activeTools: ['bash','read'],
      isIdle: this.isIdle,
    };
  }
  getMessages() { return []; }
  async handleRequest(req) {
    const {type, payload} = req;
    if (type === 'send_message') {
      console.log('[bridge] send_message payload:', JSON.stringify(payload));
      return {success: true, data: {deliveredAs: this.isIdle ? 'queued' : 'steer', receivedMessage: payload?.message, receivedImages: payload?.images?.length ?? 0}};
    }
    if (type === 'abort') return {success: true};
    if (type === 'get_state') return {success: true, data: this.getSnapshot()};
    return {success: false, error: 'unknown type ' + type};
  }
}

const bridge = new MockBridge();
const started = await startServer(bridge, {
  port: 19891, host: '127.0.0.1', path: '/ws', quiet: true, unref: true,
});
const port = started.port;
console.log('[test] server up on', port);

const { default: WSClient } = await import('ws');
const messages = [];
const ws = new WSClient('ws://127.0.0.1:' + port + '/ws');
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  messages.push(msg);
  console.log('[ws] recv', JSON.stringify(msg).slice(0, 220));
});
ws.on('open', async () => {
  console.log('[ws] open');
  await new Promise(r => setTimeout(r, 100));
  console.log('[ws] sending send_message with NEW payload {message, images, streamingBehavior}');
  ws.send(JSON.stringify({type:'send_message', id:'t1', payload:{message:'hello test', images:[], streamingBehavior:'steer'}}));
  await new Promise(r => setTimeout(r, 500));
  ws.close();
  console.log('[test] total messages received:', messages.length);
  console.log('[test] last response:', JSON.stringify(messages[messages.length-1]));
  process.exit(0);
});
ws.on('error', (e) => { console.log('[ws] error', e.message); process.exit(1); });
setTimeout(() => { console.log('[test] timeout'); process.exit(1); }, 5000);