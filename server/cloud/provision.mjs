import fs from 'node:fs';
import path from 'node:path';
const allowed=new Set(['vault.json','faucet.json','progression.json','raid-pool.json','mode-registry.json']);
export function provisionCloudData(env=process.env){
 if(!env.CHOG_DATABASE_URL||!env.CHOG_DATABASE_AUTH_TOKEN)throw Error('Cloud relay requires a durable database and auth token');
 if(!/^0x[0-9a-f]{64}$/i.test(env.CHOG_SIGNER_PRIVATE_KEY||''))throw Error('Cloud relay requires the existing testnet signer');
 if(!env.CHOG_DATA_DIR)throw Error('CHOG_DATA_DIR required');
 const config=JSON.parse(env.CHOG_DEPLOYMENT_CONFIG||'{}');
 for(const key of Object.keys(config))if(!allowed.has(key))throw Error('Unknown deployment config file');
 const dir=path.resolve(env.CHOG_DATA_DIR),signerFile=path.join(dir,'reward-signer.json');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 if(fs.existsSync(signerFile)&&JSON.parse(fs.readFileSync(signerFile)).privateKey!==env.CHOG_SIGNER_PRIVATE_KEY)throw Error('Data directory contains a different signer');
 fs.writeFileSync(signerFile,JSON.stringify({privateKey:env.CHOG_SIGNER_PRIVATE_KEY}),{mode:0o600});
 for(const [name,value]of Object.entries(config)){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid deployment config file');
  const file=path.join(dir,name);if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(value),{mode:0o600});
 }
 return dir;
}
