// Stage only browser runtime files. Never upload the repository, server data or Blender sources.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const [folder,relayArg]=process.argv.slice(2);
if(!folder||!relayArg)throw Error('Usage: node tools/chog/stage-public.mjs <new-staging-folder> <https-relay-origin>');
const relay=new URL(relayArg);
if(relay.protocol!=='https:'||relay.username||relay.password||relay.pathname!=='/'||relay.search||relay.hash)throw Error('Use a plain HTTPS relay origin');
const stage=path.resolve(root,folder),source=path.join(root,'dist');
if(!stage.startsWith(path.join(root,'outputs')+path.sep)||fs.existsSync(stage))throw Error('Use a fresh folder inside outputs');
const allow=new Set(['.glb','.png','.webp','.js','.svg','.json','.jpg','.jpeg','.ttf','.css','.woff2','.html','.ogg','.mp3','.wav','.bin','.ktx2','.wasm']);
let count=0,bytes=0;
function copy(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,item.name),rel=path.relative(source,file),top=rel.split(path.sep)[0];
 if(item.isDirectory()){if(dir!==source||['assets','styles','src','songs'].includes(top))copy(file);continue;}
 if(!item.isFile()||!allow.has(path.extname(file).toLowerCase())||(!['assets','styles','src','songs'].includes(top)&&!['index.html','testnet.html'].includes(rel)))continue;
 const target=path.join(stage,rel);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);count++;bytes+=fs.statSync(file).size;
}}
copy(source);
fs.writeFileSync(path.join(stage,'vercel.json'),JSON.stringify({
 $schema:'https://openapi.vercel.sh/vercel.json',framework:null,
 rewrites:[{source:'/relay/:path*',destination:relay.origin+'/:path*'}],
 headers:[{source:'/(.*)',headers:[{key:'Cache-Control',value:'public, max-age=0, must-revalidate'}]}],
},null,2)+'\n');
console.log(JSON.stringify({stage,files:count,bytes}));
