let artifact;
export async function progressionArtifact(){return artifact||=fetch(new URL('../../assets/chog-testnet/progression.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('NFT progression contract unavailable');return r.json();});}
