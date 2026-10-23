export const DROP_TIMES=Object.freeze([30,90,180,250]);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function dropRoll(random=Math.random){const count=5+Math.floor(clamp(random(),0,.999999999)*6);return Array.from({length:count},()=>1+Math.floor(clamp(random(),0,.999999999)*100));}
export function dropPose(age,seed=0){
 if(age>=8)return {x:0,y:0,z:0,roll:0,pitch:0,parachute:false,landed:true};
 const k=clamp(age/8,0,1),landed=k===1,wind=landed?0:Math.sin(Math.PI*k);
 return {x:Math.sin(age*1.35+seed)*.85*wind,y:18*(1-k),z:Math.cos(age*1.05+seed)*.5*wind,roll:Math.sin(age*1.6+seed)*.12*wind,pitch:Math.cos(age*1.2+seed)*.07*wind,parachute:!landed,landed};
}
export function botSkill(level){
 const lv=Number.isFinite(Number(level))?Math.max(1,Number(level)):1,k=clamp(Math.log2(lv)/6,0,1);
 return {level:lv,reaction:.65-.5*k,aimError:.18-.155*k,awareness:14+16*k,repath:1.2-.85*k,fireDelay:2.7-1.9*k,lead:.1+.65*k,lootRadius:6+10*k};
}
