// Use the two existing stage bases, independently of chest randomization.
// Exclusion is horizontal at every elevation so a chest cannot spawn above a base either.
export function outsideHuntSpawns(point,level,footprint=1.8){
 const radius=Math.max(12.2,(level.spawnBarrier||4.2)+8)+footprint+1;
 return level.spawnPads.every(p=>Math.hypot(point.x-p.x,point.z-p.z)>radius);
}
export function huntSpawnPlan(level,players,holderId){
 const hunters=players.filter(p=>p.id!==holderId);
 return players.map(p=>{
  const carrier=p.id===holderId,side=carrier?0:1,pad=level.spawnPads[side],other=level.spawnPads[1-side];
  const yaw=Math.atan2(other.x-pad.x,other.z-pad.z);
  // Same spawn-deck formation as the original shooter, with room for five hunters.
  const angle=2*Math.PI*hunters.findIndex(h=>h.id===p.id)/Math.max(1,hunters.length)+yaw;
  const radius=carrier?0:1.4;
  return {id:p.id,side,x:pad.x+Math.cos(angle)*radius,y:pad.y,z:pad.z+Math.sin(angle)*radius,yaw};
 });
}
