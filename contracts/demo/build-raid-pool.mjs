import fs from 'node:fs';import {fileURLToPath} from 'node:url';import path from 'node:path';import solc from 'solc';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const input={language:'Solidity',sources:{'ChogRaidPool.sol':{content:fs.readFileSync(path.join(here,'ChogRaidPool.sol'),'utf8')}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'paris',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}}};
const out=JSON.parse(solc.compile(JSON.stringify(input),{import:p=>({contents:fs.readFileSync(path.join(here,'node_modules',p),'utf8')})}));for(const e of out.errors||[])if(e.severity==='error')throw Error(e.formattedMessage);
const c=out.contracts['ChogRaidPool.sol'].ChogRaidPool;
fs.writeFileSync(path.join(root,'assets/chog-testnet/raid-pool.json'),JSON.stringify({compiler:solc.version(),abi:c.abi,bytecode:'0x'+c.evm.bytecode.object,runtime:'0x'+c.evm.deployedBytecode.object,immutableReferences:c.evm.deployedBytecode.immutableReferences},null,2)+'\n');
console.log('Boss raid pool compiled:',c.evm.bytecode.object.length/2,'bytes');
