import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire(new URL('../../contracts/demo/package.json',import.meta.url)),{build}=require('esbuild');
const artifact=path.join(root,'assets/chog-simulation-colliders.json');
const plugin={name:'three-paths',setup(b){b.onResolve({filter:/^three$/},()=>({path:path.join(root,'vendor/three/build/three.module.js')}));b.onResolve({filter:/^three\/addons\//},a=>({path:path.join(root,'vendor/three/jsm',a.path.slice('three/addons/'.length))}));}};
export async function colliderSource(){
 const result=await build({stdin:{contents:"export {PropKit} from './src/world/props.js';export {dressingFor} from './src/world/dressing.js';export {MAP_LAYOUTS} from './src/world/maps.js';export {inMode} from './src/world/variants.js';",resolveDir:root,sourcefile:'collider-entry.js'},bundle:true,write:false,format:'esm',platform:'node',metafile:true,plugins:[plugin]});
 const inputs=Object.keys(result.metafile.inputs).filter(f=>f!=='collider-entry.js').sort(),hash=createHash('sha256');for(const f of inputs)hash.update(f.replaceAll('\\','/')).update('\0').update(fs.readFileSync(path.resolve(root,f))).update('\0');
 return {sourceHash:hash.digest('hex'),inputs,code:result.outputFiles[0].text};
}
export async function generateColliderSnapshot(source,{quality='low'}={}){
 const cloudRequire=createRequire(new URL('../../server/cloud/package.json',import.meta.url)),puppeteer=cloudRequire('puppeteer-core');
 const executablePath=process.env.CHOG_BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(p=>fs.existsSync(p));
 const browser=await puppeteer.launch({executablePath,headless:true,args:['--disable-gpu']});let layouts;
 try{const page=await browser.newPage();layouts=await page.evaluate(async ({code,quality})=>{
 const {PropKit,dressingFor,MAP_LAYOUTS,inMode}=await import('data:text/javascript;base64,'+btoa(unescape(encodeURIComponent(code)))),layouts={};
 for(const layout of Object.keys(MAP_LAYOUTS)){
  const kit=new PropKit(null,{headless:true,quality}),placements=dressingFor(layout),entries=[];
  try{for(const item of placements){const {colliders}=kit.add(item.type,item);entries.push({modes:['hunt','boss','control','trials'].filter(mode=>inMode(item,mode)),colliders});kit.clear();}}finally{kit.dispose();}
  layouts[layout]=entries;
 }return layouts;
 },{code:source.code.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(path.join(root,'src/world/props.js')).href)),quality});}finally{await browser.close();}
 return {version:1,sourceHash:source.sourceHash,inputs:source.inputs,layouts};
}
export async function checkColliderSnapshot(){const source=await colliderSource(),snapshot=JSON.parse(fs.readFileSync(artifact,'utf8'));if(snapshot.version!==1||snapshot.sourceHash!==source.sourceHash)throw Error('Simulation collider snapshot is stale. Run node tools/chog/build-simulation-colliders.mjs');return {source,snapshot};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv.includes('--check')){await checkColliderSnapshot();console.log('Simulation collider source fingerprint verified');}else{const source=await colliderSource(),snapshot=await generateColliderSnapshot(source);fs.writeFileSync(artifact,JSON.stringify(snapshot));console.log(`Generated simulation colliders for ${Object.keys(snapshot.layouts).length} layouts`);}}
