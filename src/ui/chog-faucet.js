import {Contract} from '../../assets/chog-testnet/ethers.js';

export const FAUCET_AMOUNT=10n*10n**18n;
export function executableCode(raw,artifact){
 let hex=raw.slice(2);
 for(const refs of Object.values(artifact.immutableReferences))for(const {start,length}of refs)hex=hex.slice(0,start*2)+'0'.repeat(length*2)+hex.slice((start+length)*2);
 const metadataLength=parseInt(hex.slice(-4),16);return hex.slice(0,-4-metadataLength*2);
}
let artifactPromise;
export function faucetArtifact(){return artifactPromise||=fetch(new URL('../../assets/chog-testnet/faucet.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('Faucet contract unavailable.');return r.json();});}
export async function verifiedFaucet(config,runner){
 if(!config?.faucet)throw Error('The 10 CHOG faucet is not deployed yet.');
 if(Number((await runner.provider.getNetwork()).chainId)!==10143)throw Error('Switch to Monad testnet.');
 const artifact=await faucetArtifact(),code=await runner.provider.getCode(config.faucet);
 if(code==='0x'||executableCode(code,artifact)!==executableCode(artifact.runtime,artifact))throw Error('Faucet contract verification failed.');
 const faucet=new Contract(config.faucet,artifact.abi,runner);
 if((await faucet.token()).toLowerCase()!==config.token.toLowerCase()||await faucet.CLAIM_AMOUNT()!==FAUCET_AMOUNT||await faucet.CLAIM_INTERVAL()!==86400n)throw Error('Faucet token or amount mismatch.');
 return faucet;
}
export async function claimTen(rewards,progress=()=>{}){
 const config=await rewards.request('status'),signer=await rewards.signer(),faucet=await verifiedFaucet(config,signer);
 const block=await signer.provider.getBlock('latest'),next=await faucet.nextClaimAt(signer.address);
 if(next>BigInt(block.timestamp))throw Error('Next 10 CHOG claim: '+new Date(Number(next)*1000).toLocaleString());
 if(await faucet.paused())throw Error('The faucet is temporarily paused.');
 const token=new Contract(config.token,['function balanceOf(address) view returns(uint256)'],signer);
 if(await token.balanceOf(config.faucet)<FAUCET_AMOUNT)throw Error('The faucet needs testCHOG funding.');
 progress('Confirm the 10 testCHOG claim in your wallet.');
 const tx=await faucet.claim();progress('Claim submitted. Waiting for confirmation.');const receipt=await tx.wait(2);
 if(!receipt||receipt.status!==1)throw Error('Claim transaction failed.');
 const event=receipt.logs.filter(l=>l.address.toLowerCase()===config.faucet.toLowerCase()).map(l=>{try{return faucet.interface.parseLog(l);}catch{return null;}}).find(e=>e?.name==='Claimed'&&e.args.wallet.toLowerCase()===signer.address.toLowerCase()&&e.args.amount===FAUCET_AMOUNT);
 if(!event)throw Error('Claim receipt does not match this wallet.');
 return {hash:receipt.hash,nextClaimAt:Number(event.args.nextClaimAt)};
}
