// Deterministic objective rules shared by the game and verified-result service.
export const OBJECTIVE_RULE_VERSION = 1;
export const CONTROL = Object.freeze({duration:240,target:100,captureSeconds:4,pointsPerSecond:0.6,radius:4});
export function dailyChallenge(day = new Date().toISOString().slice(0,10)) {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Error('Invalid challenge day');
 let seed=2166136261;for(const c of day)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
 const duration=120+(seed%3)*30;
 return {id:'beacon-'+day,day,seed,version:OBJECTIVE_RULE_VERSION,duration,target:8,holdSeconds:3,mapId:'tidewater',weapon:'shooter',label:'Secure 8 beacons. Stand inside the active ring for 3 seconds.'};
}
export function createObjectiveState(mode,stations,challenge=dailyChallenge()) {
 if(!['control','trials'].includes(mode))throw Error('Invalid objective mode');
 return {mode,version:OBJECTIVE_RULE_VERSION,phase:'playing',time:mode==='control'?CONTROL.duration:challenge.duration,duration:mode==='control'?CONTROL.duration:challenge.duration,scores:[0,0],stations:stations.map((p,i)=>({...p,id:String.fromCharCode(65+i),radius:CONTROL.radius,owner:null,progress:0,contested:false})),challenge:mode==='trials'?challenge:null,score:0,objectiveProgress:0,hold:0,activeStation:mode==='trials'?challenge.seed%stations.length:0,winner:null,reason:null,completed:false};
}
export function stepObjective(c,actors,dt) {
 if(c.phase!=='playing'||!Number.isFinite(dt)||dt<=0)return c;
 dt=Math.min(dt,c.time);c.time=Math.max(0,c.time-dt);
 const inside=(a,s)=>a.alive&&!a.left&&Math.abs((a.y||0)-(s.y||0))<3&&Math.hypot(a.x-s.x,a.z-s.z)<=s.radius;
 if(c.mode==='control'){
  for(const s of c.stations){const teams=[0,1].map(t=>actors.some(a=>a.team===t&&inside(a,s)));s.contested=teams[0]&&teams[1];
   if(!s.contested&&(teams[0]||teams[1])){const t=teams[0]?0:1,sign=t===0?1:-1;s.progress=Math.max(-1,Math.min(1,s.progress+sign*dt/CONTROL.captureSeconds));if(s.owner!==null&&s.owner!==t&&s.progress*(s.owner===0?1:-1)<=0)s.owner=null;if(Math.abs(s.progress)>=1)s.owner=t;}
   if(s.owner!==null&&!s.contested)c.scores[s.owner]=Math.min(CONTROL.target,c.scores[s.owner]+CONTROL.pointsPerSecond*dt);
  }
  if(c.scores.some(x=>x>=CONTROL.target)||c.time<=0){c.phase='finished';c.winner=Math.abs(c.scores[0]-c.scores[1])<1e-7?null:c.scores[0]>c.scores[1]?0:1;c.reason=c.winner===null?'tie':c.time<=0?'timeout':'target';}
 }else{
  const s=c.stations[c.activeStation],a=actors.find(a=>a.team===0);
  if(a&&inside(a,s)){c.hold+=dt;if(c.hold>=c.challenge.holdSeconds){c.objectiveProgress++;c.score=c.objectiveProgress*100;c.hold=0;c.activeStation=(c.activeStation+1+(c.challenge.seed+c.objectiveProgress)%2)%c.stations.length;}}else c.hold=0;
  if(c.objectiveProgress>=c.challenge.target||c.time<=0){c.phase='finished';c.completed=c.objectiveProgress>=c.challenge.target;c.score+=c.completed?Math.floor(c.time)*2:0;c.winner=c.completed?0:null;c.reason=c.completed?'completed':'timeout';}
 }
 return c;
}
export function validateObjectiveResult(result,config={}){
 if(!result||!['control','trials'].includes(result.mode)||result.mode!==config.mode||result.version!==OBJECTIVE_RULE_VERSION)throw Error('Objective mode/version mismatch');
 if(!Array.isArray(result.players)||!result.players.length)throw Error('Missing objective players');
 if(result.mode==='control'){
  if(!Array.isArray(result.scores)||result.scores.length!==2||result.scores.some(n=>!Number.isFinite(n)||n<0||n>100))throw Error('Invalid Control scores');
  if(!Number.isFinite(result.time)||result.time<0||result.time>CONTROL.duration||(['timeout','tie'].includes(result.reason)&&result.time!==0))throw Error('Invalid Control time');
  const [a,b]=result.scores,w=Math.abs(a-b)<1e-7?null:a>b?0:1;if(result.winner!==w||!['target','timeout','tie'].includes(result.reason)||(result.reason==='target'&&Math.max(a,b)<100)||(result.reason==='tie'&&w!==null))throw Error('Invalid Control winner');
 }else{
  const expected=dailyChallenge(config.challenge?.day||result.challenge?.day);if(JSON.stringify(result.challenge)!==JSON.stringify(expected)||config.challenge&&JSON.stringify(config.challenge)!==JSON.stringify(expected))throw Error('Daily challenge mismatch');
  if(!Number.isInteger(result.objectiveProgress)||result.objectiveProgress<0||result.objectiveProgress>expected.target||!Number.isInteger(result.score)||result.score<0||result.score>expected.target*100+expected.duration*2||!Number.isFinite(result.time)||result.time<0||result.time>expected.duration)throw Error('Invalid Daily score');
  const completed=result.objectiveProgress===expected.target,score=result.objectiveProgress*100+(completed?Math.floor(result.time)*2:0);if(result.completed!==completed||result.score!==score||result.winner!==(completed?0:null)||result.reason!==(completed?'completed':'timeout')||(!completed&&result.time!==0))throw Error('Invalid Daily outcome');
 }
 return result;
}
