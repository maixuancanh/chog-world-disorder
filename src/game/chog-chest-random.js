// Local presentation randomness. Multiplayer must distribute one host-created
// manifest; these client rolls are not trusted for wallet/token settlement.
export function randomUnit(){return crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;}
export function randomInt(min,max,random=randomUnit){return min+Math.floor(random()*(max-min+1));}
export function shuffle(items,random=randomUnit){
  const out=[...items];for(let i=out.length-1;i>0;i--){const j=randomInt(0,i,random);[out[i],out[j]]=[out[j],out[i]];}return out;
}
export function tokenRoll(random=randomUnit){
  if(random()<.01)return {amountMilli:1000,amount:1,jackpot:true};
  const amountMilli=randomInt(5,100,random);return {amountMilli,amount:amountMilli/1000,jackpot:false};
}
export function createChestLoot(traits,count,random=randomUnit){
  if(count<traits.length)throw new Error('Not enough chests for all traits');
  // Distinct target trait slots guarantee completion is possible without duplicates.
  const loot=traits.map(trait=>({kind:'trait',trait}));
  while(loot.length<count)loot.push(random()<.65?{kind:'token',...tokenRoll(random)}:{kind:'empty'});
  return shuffle(loot,random);
}
