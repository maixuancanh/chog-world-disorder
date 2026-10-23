export const XP_WIN=1200,XP_LOSS=500;
export const levelFloor=level=>800*(level-1)+175*(level-1)*level;
export function progression(totalXp=0,matches=0,wins=0){
 if(![totalXp,matches,wins].every(n=>Number.isSafeInteger(n)&&n>=0)||wins>matches)throw Error('Invalid progression totals');
 let lo=1,hi=Math.floor(Math.sqrt(totalXp/175))+2;
 while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(levelFloor(mid)<=totalXp)lo=mid;else hi=mid-1;}
 return {totalXp,level:lo,xp:totalXp-levelFloor(lo),nextLevelXp:800+lo*350,matches,wins};
}
export function normalizeProgress(p={}){return progression(p.totalXp??levelFloor(p.level||1)+(p.xp||0),p.matches||0,p.wins||0);}

export const ACTIVITY_XP=Object.freeze({bossDamage:{xp:25,cap:12,label:'Boss damage'},bossSupport:{xp:10,cap:10,label:'Squad support'},bossShields:{xp:30,cap:3,label:'Trait shields broken'},captures:{xp:200,cap:5,label:'Carrier captures'},traits:{xp:150,cap:4,label:'New traits'},supplies:{xp:25,cap:12,label:'Supply chests'},loot:{xp:15,cap:20,label:'Loot collected'},stuns:{xp:10,cap:10,label:'Opponent stuns'}});
export function matchExperience(won=false,left=false,activity={}){
 const breakdown=[];for(const [key,rule]of Object.entries(ACTIVITY_XP)){const count=activity?.[key]??0;if(!Number.isSafeInteger(count)||count<0||count>rule.cap)throw Error('Invalid authoritative activity: '+key);if(count&&!left)breakdown.push({key,label:rule.label,count,xp:count*rule.xp});}
 if(left)return {total:0,breakdown:[]};breakdown.unshift({key:'completion',label:won?'Victory bonus':'Match completed',count:1,xp:won?XP_WIN:XP_LOSS});return {total:breakdown.reduce((sum,r)=>sum+r.xp,0),breakdown};
}
