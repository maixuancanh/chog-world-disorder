export const RAID_ROLES={
 breaker:{id:'breaker',name:'BREAKER',description:'Empower shots for 5s. Counter a matching trait shield.'},
 guardian:{id:'guardian',name:'GUARDIAN',description:'Protect nearby allies for 5s. Counter a matching trait shield.'},
 medic:{id:'medic',name:'MEDIC',description:'Heal nearby allies. Counter a matching trait shield.'},
 recruit:{id:'recruit',name:'RECRUIT',description:'Fight alongside the squad. Equip an NFT for a trait ability.'},
};
export function raidRole(nft){
 const traits=nft?.traits||[];if(!traits.length)return RAID_ROLES.recruit;
 const key=traits.filter(t=>t.category!=='Tier').map(t=>t.category+':'+t.value).sort().join('|');
 let hash=2166136261;for(const c of key)hash=Math.imul(hash^c.charCodeAt(0),16777619);
 return RAID_ROLES[['breaker','guardian','medic'][(hash>>>0)%3]];
}
export function raidRequirements(nfts){
 const all=nfts.flatMap(n=>n?.traits||[]),unique=[...new Map(all.map(t=>[t.id,t])).values()];
 if(!unique.length)return [];
 return ['Body','Eyes','Head'].map((category,i)=>{const group=unique.filter(t=>t.category===category);return {...(group.length?group[i%group.length]:unique[i%unique.length])};});
}
export function raidSkills(wins=0){return [
 {id:'trait',name:'TRAIT POWER',wins:0,description:'Use your NFT role ability.'},
 {id:'rally',name:'RALLY',wins:1,description:'Empower nearby allies for 4s.'},
 {id:'second-wind',name:'SECOND WIND',wins:3,description:'Recover 35 HP.'},
].filter(s=>s.wins<=wins);}
export function raidActivity(s){return {bossDamage:Math.min(12,Math.floor((s.damage||0)/250)),bossSupport:Math.min(10,Math.floor(((s.healing||0)+(s.blocked||0))/20)),bossShields:Math.min(3,s.breaks||0)};}
export function raidRewardBps(s,maxHp){
 const points=(s.damage||0)+(s.healing||0)*2+(s.blocked||0)+(s.breaks||0)*maxHp*.04;
 if(points<=0)return 0;
 return Math.min(10000,Math.floor(points/Math.max(1,maxHp/6)*10000));
}
