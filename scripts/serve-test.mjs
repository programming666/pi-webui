import { startServer } from "../dist/server.js";
class MockBridge {
  isReady() { return true; }
  getAvailableTools() { return []; }
  getSnapshot() { return {serverVersion:'0.2.0', mode:'interactive', bridgeReady:true, setupDone:true, isIdle:true, scopedModels:[], allTools:[], activeTools:[], commands:[], thinkingLevel:'off', model:null}; }
  getMessages() { return []; }
  async handleRequest() { return {success:true}; }
}
const started = await startServer(new MockBridge(), {port:19892, host:'127.0.0.1', path:'/ws', quiet:true, unref:true});
console.log('ready', started.port);
// keep alive
setInterval(()=>{}, 60000);