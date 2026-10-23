import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';

const cloudRequire=createRequire(new URL('../cloud/package.json',import.meta.url));

// Use a direct remote connection: embedded replicas can lose unflushed writes
// when a free hosting instance is replaced. Never fall back to local storage
// after remote configuration or authentication fails.
export function openRewardDatabase(file,{env=process.env,loadLibsql=()=>cloudRequire('libsql')}={}){
 const remote=env.CHOG_DATABASE_URL?.trim(),token=env.CHOG_DATABASE_AUTH_TOKEN?.trim();
 if(!remote){
  if(token)throw Error('CHOG_DATABASE_URL is required with a database auth token');
  const db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;');return db;
 }
 let url;try{url=new URL(remote);}catch{throw Error('Invalid CHOG_DATABASE_URL');}
 if(!['libsql:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password||url.search||url.hash)throw Error('CHOG_DATABASE_URL must be a secure remote libSQL URL');
 if(!token)throw Error('CHOG_DATABASE_AUTH_TOKEN is required for remote storage');
 const Database=loadLibsql(),db=new Database(remote,{authToken:token,timeout:10});
 try{db.exec('PRAGMA foreign_keys=ON;');return db;}catch(error){db.close();throw error;}
}
