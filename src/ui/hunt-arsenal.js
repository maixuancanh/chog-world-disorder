import { WEAPONS } from '../config.js';
// CHOG loadout profiles share the native firing implementation.
export const HUNT_WEAPON_ORDER=['shooter','twins','spinner','charger','blaster'];
const definitions={
 shooter:{name:'Rascal',class:'Carbine',blurb:'A compact all-rounder for steady tracking and quick reactions.',stats:{range:.62,damage:.76,rate:.72,mobility:.78}},
 twins:{name:'Double Trouble',class:'Twin markers',blurb:'Paired markers for agile hunters. Both grips share the same five-round allowance.',stats:{range:.46,damage:.64,rate:.88,mobility:.95}},
 spinner:{name:'Whirlwind',class:'Rotary marker',blurb:'Hold to spin up, then release to fire. Each projectile uses one of your remaining rounds.',stats:{range:.78,damage:.82,rate:.94,mobility:.38}},
 charger:{name:'Longshot',class:'Precision marker',blurb:'Hold to charge, then release a precise long-range shot. Each shot uses one round.',stats:{range:.98,damage:.98,rate:.28,mobility:.48}},
 blaster:{name:'Party Crasher',class:'Impact marker',blurb:'A bold close-range marker with a wide silhouette and deliberate shot rhythm.',stats:{range:.54,damage:.68,rate:.42,mobility:.65}},
};
export const HUNT_WEAPONS=Object.fromEntries(HUNT_WEAPON_ORDER.map(id=>[id,{...WEAPONS[id],...definitions[id],stats:{...definitions[id].stats,paint:0}}]));
export const weaponArt=id=>new URL(`../../assets/chog-hunt-ui/weapons/${HUNT_WEAPON_ORDER.includes(id)?id:'shooter'}.png`,import.meta.url).href;
export const weaponMarkup=id=>`<img class="chog-weapon-icon" src="${weaponArt(id)}" alt="" decoding="async">`;
