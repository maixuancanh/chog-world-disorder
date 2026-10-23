import {createRequire} from 'node:module';import path from 'node:path';import fs from 'node:fs';import {fileURLToPath} from 'node:url';
import {checkColliderSnapshot} from './build-simulation-colliders.mjs';
await checkColliderSnapshot();
const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire(new URL('../../contracts/demo/package.json',import.meta.url)),{build}=require('esbuild');
const plugin={name:'three-paths',setup(b){b.onResolve({filter:/^three$/},()=>({path:path.join(root,'vendor/three/build/three.module.js')}));b.onResolve({filter:/^three\/addons\//},a=>({path:path.join(root,'vendor/three/jsm',a.path.slice('three/addons/'.length))}));}};
await build({entryPoints:[path.join(root,'src/main.js')],outfile:path.join(root,'dist/src/game/main.js'),bundle:true,format:'esm',minify:true,sourcemap:true,target:['es2022'],legalComments:'none',plugins:[plugin]});
for(const f of ['styles/hunt-core.css','assets/chog-testnet/raid-pool.json','assets/chog-testnet/mode-registry.json']){fs.mkdirSync(path.dirname(path.join(root,'dist',f)),{recursive:true});fs.copyFileSync(path.join(root,f),path.join(root,'dist',f));}
await build({entryPoints:[path.join(root,'src/ui/chog-testnet-setup.js')],outfile:path.join(root,'dist/src/ui/chog-testnet-setup.js'),bundle:true,format:'esm',minify:true,target:['es2022'],legalComments:'none'});
fs.copyFileSync(path.join(root,'assets/chog-testnet/ethers.js'),path.join(root,'dist/assets/chog-testnet/ethers.js'));
console.log('Game bundle, operator setup and raid assets updated');
