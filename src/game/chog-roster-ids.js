export const CHOG_NFT_IDS=['1462','0697','1070','1055'];
export const CHOG_CHARACTER_IDS=[...CHOG_NFT_IDS,'varsity'];
export const CHOG_MAIN_WEAPONS=['shooter','twins','spinner','charger','blaster'];
export function normalizedChogId(value){if(value==='varsity')return 'varsity';const number=String(value??'').match(/\d+/)?.[0];const id=number?.padStart(4,'0');return CHOG_NFT_IDS.includes(id)?id:null;}

