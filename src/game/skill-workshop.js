import {raidRole} from './boss-raid-rules.js';

export const WORKSHOP_VERSION=1;
export const WORKSHOP_BUDGET=5;
const effects=[
 {id:'mend',name:'MEND',icon:'heart',cost:2,requiredWins:0,description:'Recover 18 HP.',amount:18},
 {id:'empower',name:'EMPOWER',icon:'bolt',cost:3,requiredWins:0,role:'breaker',description:'Shots deal 12% more damage for 4s.',amount:.12},
 {id:'ward',name:'WARD',icon:'shield',cost:3,requiredWins:0,role:'guardian',description:'Take 15% less damage for 4s.',amount:.15},
];
const targets=[
 {id:'self',name:'SELF',icon:'person',cost:0,requiredWins:0,description:'Affect only yourself.'},
 {id:'nearby',name:'SQUAD',icon:'group',cost:2,requiredWins:2,description:'Affect living allies within 8m.'},
];
const modifiers=[
 {id:'steady',name:'STEADY',icon:'clock',cost:0,requiredWins:0,description:'18s cooldown.'},
 {id:'quick',name:'QUICK',icon:'clock',cost:1,requiredWins:0,description:'Two-thirds strength; 12s cooldown. Trade burst power for frequency.'},
 {id:'focused',name:'FOCUSED',icon:'bolt',cost:2,requiredWins:3,description:'Heal 6 more HP or add 5 percentage points; 24s cooldown.'},
 {id:'lasting',name:'LASTING',icon:'clock',cost:1,requiredWins:1,description:'Buff lasts 2s longer; 22s cooldown. Buff effects only.'},
];
export function workshopIdentity(nft){
 const collection=nft?.contract??nft?.collection??nft?.nftContract,token=String(nft?.tokenId??nft?.nftTokenId??'');
 return typeof collection==='string'&&/^0x[\da-f]{40}$/i.test(collection)&&/^\d{1,78}$/.test(token)?collection.toLowerCase()+':'+BigInt(token).toString():'guest';
}
function winsFor(nft,progress){
 const identity=workshopIdentity(nft);
 return identity!=='guest'&&progress?.identity===identity&&Number.isSafeInteger(progress.wins)&&progress.wins>=0?progress.wins:0;
}
export function workshopOptions(nft,progress={}){
 const identity=workshopIdentity(nft),wins=winsFor(nft,progress);
 // Wallet metadata carries attributes; authoritative objective rows carry traits.
 // Use the same wearable/fallback selection as objectiveFromNft without an art dependency.
 const available=(Array.isArray(nft?.attributes)?nft.attributes:[]).filter(a=>typeof a.trait_type==='string'&&typeof a.value==='string'&&!['','none','no','n/a','null'].includes(a.value.trim().toLowerCase()));
 let traits=['Head','Eyes','Body','Accessory'].map(category=>available.find(a=>a.trait_type===category)).filter(Boolean);
 if(!traits.length)traits=['Skin','Mouth','Aura','Form','Base','Tier'].map(category=>available.find(a=>a.trait_type===category)).filter(Boolean).slice(0,4);
 const role=raidRole(nft?.traits?nft:{traits:traits.map(a=>({category:a.trait_type,value:a.value}))}).id;
 const rows=list=>list.map(row=>({...row,unlocked:row.requiredWins<=wins&&(!row.role||row.role===role),traitValid:!row.role||row.role===role}));
 return {identity,budget:WORKSHOP_BUDGET,version:WORKSHOP_VERSION,wins,role,effects:rows(effects),targets:rows(targets),modifiers:rows(modifiers)};
}
export function defaultWorkshopSkill(nft){return {version:WORKSHOP_VERSION,identity:workshopIdentity(nft),effect:'mend',target:'self',modifier:'steady'};}
export function validateWorkshopSkill(recipe,nft,progress={}){
 if(!recipe||typeof recipe!=='object'||Array.isArray(recipe)||Object.getPrototypeOf(recipe)!==Object.prototype)throw Error('Invalid workshop recipe');
 const keys=['version','identity','effect','target','modifier'];
 if(Object.keys(recipe).length!==keys.length||keys.some(k=>!Object.hasOwn(recipe,k)))throw Error('Unexpected workshop fields');
 const options=workshopOptions(nft,progress);
 if(recipe.version!==WORKSHOP_VERSION||recipe.identity!==options.identity)throw Error('Workshop identity or version mismatch');
 const selected=[options.effects.find(r=>r.id===recipe.effect),options.targets.find(r=>r.id===recipe.target),options.modifiers.find(r=>r.id===recipe.modifier)];
 if(selected.some(r=>!r?.unlocked))throw Error('Workshop option locked or invalid for traits');
 if(recipe.effect==='mend'&&recipe.modifier==='lasting')throw Error('Mend has no duration');
 if(selected.reduce((sum,r)=>sum+r.cost,0)>WORKSHOP_BUDGET)throw Error('Workshop power budget exceeded');
 return Object.fromEntries(keys.map(k=>[k,recipe[k]]));
}
export function resolveWorkshopSkill(recipe,nft,progress={}){
 const skill=validateWorkshopSkill(recipe,nft,progress),effect=effects.find(r=>r.id===skill.effect);
 return {...skill,name:effect.name,cost:effect.cost+targets.find(r=>r.id===skill.target).cost+modifiers.find(r=>r.id===skill.modifier).cost,
  amount:skill.modifier==='quick'?(skill.effect==='mend'?12:skill.effect==='empower'?.08:.10):effect.amount+(skill.modifier==='focused'?(skill.effect==='mend'?6:.05):0),duration:skill.effect==='mend'?0:4+(skill.modifier==='lasting'?2:0),
  radius:skill.target==='nearby'?8:0,cooldown:skill.modifier==='quick'?12:skill.modifier==='focused'?24:skill.modifier==='lasting'?22:18};
}
export function loadWorkshopSkill(storage,nft,progress={}){
 try{return validateWorkshopSkill(JSON.parse(storage.getItem('chog:workshop:v1:'+workshopIdentity(nft))),nft,progress);}catch{return defaultWorkshopSkill(nft);}
}
export function saveWorkshopSkill(storage,recipe,nft,progress={}){
 const valid=validateWorkshopSkill(recipe,nft,progress);storage.setItem('chog:workshop:v1:'+valid.identity,JSON.stringify(valid));return valid;
}
// Buff fields are independent of existing Boss trait/rally/second-wind buffs.
// Call only in authoritative simulation after checking the separate cooldown.
export function applyWorkshopSkill({actor,actors,recipe,nft,progress={},clock,buffs,stats}){
 const skill=resolveWorkshopSkill(recipe,nft,progress);
 if(!actor?.alive||!Number.isFinite(clock)||clock<0)return false;
 const recipients=actors.filter(a=>a.alive&&(a===actor||(skill.target==='nearby'&&a.team===actor.team&&a.pos.distanceTo(actor.pos)<=skill.radius)));
 let healing=0;
 for(const a of recipients){
  if(skill.effect==='mend'){const gain=Math.max(0,Math.min(skill.amount,(a.maxHp||100)-a.hp));a.hp+=gain;healing+=gain;}
  else {const previous=buffs.get(a.huntId)||{},prefix=skill.effect==='ward'?'workshopGuard':'workshopPower';buffs.set(a.huntId,{...previous,[prefix+'Until']:clock+skill.duration,[prefix+'Amount']:skill.amount,[prefix+'Owner']:actor.huntId});}
 }
 const row=stats?.get(actor.huntId);if(row)row.healing=(row.healing||0)+healing;
 return skill;
}
export function workshopIncoming(actor,amount,clock,buffs,stats){
 const buff=buffs.get(actor?.huntId);if(!(buff?.workshopGuardUntil>clock))return amount;
 const blocked=amount*buff.workshopGuardAmount,row=stats?.get(buff.workshopGuardOwner);if(row)row.blocked=(row.blocked||0)+blocked;return amount-blocked;
}
export function workshopOutgoing(actor,damage,clock,buffs){const b=buffs.get(actor?.huntId);return damage*(b?.workshopPowerUntil>clock?1+b.workshopPowerAmount:1);}
