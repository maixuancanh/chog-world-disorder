import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {provisionCloudData} from './provision.mjs';
import {createSimulationAssets} from './assets.mjs';
// Only the remote ledger is persistent; recreate private runtime files from Secrets.
process.env.CHOG_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'chog-runtime-'));
provisionCloudData();
const assets=createSimulationAssets();await new Promise(r=>assets.listen(8803,'127.0.0.1',r));
const {RewardService}=await import('../rewards/service.mjs');
const {SimulationRunner}=await import('../rewards/runner.mjs');
const {createHuntRelay}=await import('../hunt-relay.mjs');
const port=Number(process.env.PORT||8805);
const economy=new RewardService();
const runner=new SimulationRunner({relayURL:`http://127.0.0.1:${port}`,maxConcurrent:1,maxQueued:4});
const maintenance=process.env.CHOG_CLOUD_MAINTENANCE==='1';
if(!maintenance){economy.nftXP.start();economy.modeRegistry.start();}
const server=createHuntRelay({economy,runner,maintenance});
server.listen(port,'0.0.0.0',()=>console.log(`CHOG cloud relay listening on ${port}; durable remote ledger; one worker`));
if(maintenance)import('./smoke.mjs').then(m=>m.smokeCloudWorker()).catch(e=>console.error('CHOG cloud worker smoke failed: '+e.message));
let stopping=false;
async function shutdown(){if(stopping)return;stopping=true;for(const room of server.rooms.values())server.closeRoom(room.code,'Match server restarting');await runner.closeAll();await new Promise(r=>server.close(r));await new Promise(r=>assets.close(r));economy.close();}
process.once('SIGTERM',()=>shutdown().then(()=>process.exit(0)));
process.once('SIGINT',()=>shutdown().then(()=>process.exit(0)));
