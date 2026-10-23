import http from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
export function createSimulationAssets({origin=process.env.CHOG_PUBLIC_GAME_ORIGIN||'https://chog-world-disorder.vercel.app',fetcher=fetch}={}){
 const publicOrigin=new URL(origin);if(publicOrigin.protocol!=='https:'||publicOrigin.username||publicOrigin.password)throw Error('HTTPS game origin required');
 return http.createServer(async(req,res)=>{
  try{
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
   const url=new URL(req.url,'http://127.0.0.1');
   if(!['/','/index.html'].includes(url.pathname)&&!/^\/(src|assets|styles|songs)\//.test(url.pathname)){res.writeHead(404);res.end();return;}
   const upstream=await fetcher(publicOrigin.origin+url.pathname+url.search,{method:req.method,redirect:'error',signal:AbortSignal.timeout(60000)});
   res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/octet-stream','Cache-Control':'no-cache'});
   if(req.method==='HEAD'||!upstream.body)res.end();else await pipeline(Readable.fromWeb(upstream.body),res);
  }catch{if(!res.headersSent)res.writeHead(502);res.end();}
 });
}
