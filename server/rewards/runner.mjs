import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const positive=(value,fallback,min=1)=>{const n=Number(value??fallback);if(!Number.isInteger(n)||n<min)throw Error('Invalid simulation pool limit');return n;};
export class SimulationRunner{
 constructor({relayURL,gameURL=process.env.CHOG_GAME_URL||'http://127.0.0.1:8803/dist/',maxConcurrent=process.env.CHOG_MAX_REWARD_ROOMS||2,maxQueued=process.env.CHOG_MAX_QUEUED_ROOMS||16,queueTimeoutMs=process.env.CHOG_QUEUE_TIMEOUT_MS||600000,startTimeoutMs=process.env.CHOG_SIM_START_TIMEOUT_MS||180000,closeTimeoutMs=process.env.CHOG_SIM_CLOSE_TIMEOUT_MS||5000,browserLauncher=puppeteer,executablePath=process.env.CHOG_BROWSER_PATH}={}){
  Object.assign(this,{relayURL,gameURL,browserLauncher,executablePath});this.maxConcurrent=positive(maxConcurrent,2);this.maxQueued=positive(maxQueued,16,0);this.queueTimeoutMs=positive(queueTimeoutMs,600000);this.startTimeoutMs=positive(startTimeoutMs,180000);this.closeTimeoutMs=positive(closeTimeoutMs,5000);this.jobs=new Map();this.queue=[];this.stopping=false;
 }
 status(){return {maxConcurrent:this.maxConcurrent,maxQueued:this.maxQueued,active:[...this.jobs.values()].filter(j=>j.active).length,queued:this.queue.length};}
 launch(room,publicRoom,{onState=()=>{},onFailure=()=>{}}={}){
  if(this.stopping)return Promise.reject(Error('Match server is shutting down'));
  if(this.jobs.has(room.code))return Promise.reject(Error('Simulation already scheduled'));
  if(this.status().active>=this.maxConcurrent&&this.queue.length>=this.maxQueued)return Promise.reject(Error('Match queue is full. Please try again shortly.'));
  let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});
  const job={room,publicRoom,onState,onFailure,resolve,reject,promise,errors:[],closed:false,active:false,state:'queued'};
  this.jobs.set(room.code,job);this.queue.push(job);
  job.queueTimer=setTimeout(()=>this._fail(job,Error('Match queue timed out. Please try again.')),this.queueTimeoutMs);
  this._positions();this._drain();return promise;
 }
 _emit(job,state,position=0){job.state=state;try{job.onState({state,position,...this.status()});}catch{}}
 _positions(){this.queue.forEach((job,i)=>this._emit(job,'queued',i+1));}
 _drain(){if(this.stopping)return;while(this.queue.length&&this.status().active<this.maxConcurrent){const job=this.queue.shift();if(job.closed)continue;clearTimeout(job.queueTimer);job.active=true;this._emit(job,'starting');job.startTimer=setTimeout(()=>this._fail(job,Error('Match startup timed out. Please try again.')),this.startTimeoutMs);this._boot(job).then(()=>{if(job.closed)return;clearTimeout(job.startTimer);this._emit(job,'running');job.resolve();}).catch(e=>this._fail(job,e));}this._positions();}
 async _boot(job){
  if(job.closed)return;const executablePath=this.executablePath||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(p=>fs.existsSync(p));if(!executablePath)throw Error('Configure CHOG_BROWSER_PATH');
  // Each active worker owns an isolated browser/profile. No wallet session or simulation state is shared.
  job.browserPromise=this.browserLauncher.launch({executablePath,headless:true,timeout:30000,args:[...(process.env.CHOG_SIM_CPU_ONLY==='1'?['--disable-gpu','--disable-software-rasterizer','--js-flags=--max-old-space-size=128']:['--enable-unsafe-swiftshader']),'--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--autoplay-policy=no-user-gesture-required']});
  const browser=job.browser=await job.browserPromise;if(job.closed)return;
  browser.on('disconnected',()=>{if(!job.closed)this._fail(job,Error('Match simulation disconnected'));});
  const page=job.page=await browser.newPage();if(job.closed)return;
  page.on('error',()=>{if(!job.closed)this._fail(job,Error('Match simulation tab crashed'));});page.on('close',()=>{if(!job.closed)this._fail(job,Error('Match simulation tab closed'));});
  page.on('pageerror',error=>{job.errors.push(error.message);if(job.errors.length>20)job.errors.shift();});
  await page.setViewport({width:640,height:400});
  await page.evaluateOnNewDocument(data=>{window.__chogSimulation=data;},{id:job.room.simulator.id,token:job.room.simulator.token,room:job.publicRoom,relay:this.relayURL});
  const url=new URL(this.gameURL);url.searchParams.set('huntSim',job.room.code);await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>(window.__inkwave?.match?.hunt||window.__inkwave?.match?.raid||window.__inkwave?.match?.objective)?.session?.simulation,{timeout:this.startTimeoutMs});
 }
 _fail(job,error){if(job.closed)return;job.reject(error);try{job.onFailure(error);}catch{}this.close(job.room.code);}
 close(code){const job=this.jobs.get(code);if(!job)return Promise.resolve();if(job.closePromise)return job.closePromise;
  job.closed=true;this._emit(job,'closing');clearTimeout(job.queueTimer);clearTimeout(job.startTimer);this.queue=this.queue.filter(j=>j!==job);job.resolve();this._positions();
  job.closePromise=(async()=>{try{const browser=job.browser||await job.browserPromise;if(browser)await this._closeBrowser(browser);}catch{}finally{if(this.jobs.get(code)===job)this.jobs.delete(code);this._drain();}})();return job.closePromise;
 }
 async _closeBrowser(browser){
  let timer;const closed=await Promise.race([Promise.resolve().then(()=>browser.close()).then(()=>true,()=>false),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),this.closeTimeoutMs);})]);clearTimeout(timer);
  if(closed)return;
  // Kill only the Chrome process owned by this worker; never enumerate or terminate user browsers.
  const child=browser.process?.();if(child&&child.exitCode===null)try{child.kill('SIGKILL');}catch{}
  else if(child&&child.exitCode!==null)child.kill?.('SIGKILL');
  browser.disconnect?.();
  if(child&&child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>{const done=()=>{clearTimeout(timer);child.removeListener('exit',done);resolve();};timer=setTimeout(done,2000);child.once('exit',done);});
 }
 async closeAll(){this.stopping=true;await Promise.all([...this.jobs.keys()].map(code=>this.close(code)));}
}
