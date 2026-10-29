import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Monitor } from './monitor.mjs';
import { Jobs } from './jobs.mjs';

const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
export async function readJson(req,max=16384){let n=0,chunks=[];for await(const chunk of req){n+=chunk.length;if(n>max)throw new Error('Pedido excede o limite permitido.');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw new Error('JSON inválido.');}}
export function createApp({monitor=new Monitor(),jobs=null}={}){
  const token=randomBytes(32).toString('hex');
  const server=http.createServer(async(req,res)=>{
    const host=req.headers.host,expected='127.0.0.1:'+server.address().port;
    const origin=req.headers.origin;
    if(host!==expected || (origin&&origin!=='http://'+expected)){res.writeHead(403).end('Origem não permitida. Use http://'+expected);return;}
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    const url=new URL(req.url,'http://'+host);
    const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    try{
      if(req.method==='POST'){
        const received=Buffer.from(req.headers['x-instrument-token']??'');
        if(received.length!==token.length||!timingSafeEqual(received,Buffer.from(token)))return json({error:'Sessão inválida. Recarregue a página.'},403);
        if(!req.headers['content-type']?.startsWith('application/json'))return json({error:'Envie application/json.'},415);
      }
      if(url.pathname==='/api/session'&&req.method==='GET')return json({token,linux:process.platform==='linux',providers:jobs?.providers()??[]});
      if(url.pathname==='/api/audio/start'&&req.method==='POST'){await readJson(req);await monitor.start();return json({running:true});}
      if(url.pathname==='/api/audio/stop'&&req.method==='POST'){await readJson(req);monitor.stop();return json({running:false});}
      if(url.pathname==='/api/audio/events'&&req.method==='GET'){
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});res.write(': connected\n\n');
        const listener=frame=>{if(!res.writableNeedDrain)res.write('data: '+JSON.stringify(frame)+'\n\n');};monitor.listeners.add(listener);
        const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),15000);req.on('close',()=>{clearInterval(heartbeat);monitor.listeners.delete(listener);});return;
      }
      if(jobs&&url.pathname.startsWith('/api/jobs')){if(await jobs.handle(req,res,url,json))return;}
      if(url.pathname.startsWith('/api/'))return json({error:'Rota não encontrada.'},404);
      if(req.method!=='GET'&&req.method!=='HEAD')return json({error:'Método não permitido.'},405);
      const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);
      if(!(relative==='index.html'||relative==='style.css'||relative.startsWith('src/')||relative.startsWith('public/'))||relative.split('/').some(p=>p==='..'||p.startsWith('.')))return json({error:'Arquivo não encontrado.'},404);
      const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))return json({error:'Arquivo não encontrado.'},404);
      const content=await readFile(file);const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)]??'application/octet-stream';
      res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:content);
    }catch(error){if(!res.headersSent)json({error:error.code==='ENOENT'?'Arquivo não encontrado.':error.message},error.code==='ENOENT'?404:400);else res.end();}
  });
  server.on('close',()=>{monitor.stop();jobs?.dispose();});return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const server=createApp({jobs:new Jobs()});const port=Number(process.env.PORT??4310);server.listen(port,'127.0.0.1',()=>console.log('Synesthesia 2 · http://127.0.0.1:'+server.address().port));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
}
