import {G} from '../core/ctx.js';
const fallback=new URL('../../assets/chog-hunt-ui/chog-head-icon-v1.png',import.meta.url).href;

export function playerAvatar(actor,match=G.match){
 if(!actor)return fallback;
 const row=match?.opts?.roster?.find(p=>(actor.nid!==undefined&&p.nid===actor.nid)||(actor.owner&&p.owner===actor.owner));
 const nft=actor.isLocal?G.game?.menus?._identity?.nft:null;
 if(nft?.image)return nft.image;
 if(!actor.isBot&&(row?.nftImage||row?.objectiveNft?.image||actor.raidNft?.image))return row?.nftImage||row?.objectiveNft?.image||actor.raidNft.image;
 const id=actor.character?.nftId;
 if(actor.isBot&&id)return new URL('../../assets/chog-briefing-ui/portraits/'+id+'.png',import.meta.url).href;
 return row?.objectiveNft?.image||fallback;
}

export function setPlayerAvatar(container,actor,match=G.match){
 const source=playerAvatar(actor,match);
 if(container.dataset.playerAvatar===source&&container.querySelector('img'))return;
 const image=document.createElement('img');image.src=source;image.alt=actor?.name||'CHOG';image.className='chog-jump-avatar';
 image.onerror=()=>{image.onerror=null;image.src=fallback;};
 container.dataset.playerAvatar=source;container.replaceChildren(image);
}
