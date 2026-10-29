import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Spectrum } from '../src/audio/dsp.js';
const run=promisify(execFile);
/** Explicit output monitor. Never falls back to microphone/default input. */
export class Monitor {
  constructor(){this.listeners=new Set();this.child=null;}
  async start(){
    if(this.child)return;
    if(process.platform!=='linux')throw new Error('Monitor nativo disponível apenas no Linux. Use um arquivo de áudio.');
    let sink;
    try{sink=(await run('pactl',['get-default-sink'],{timeout:3000})).stdout.trim();}
    catch{throw new Error('Instale pipewire-pulse e pulseaudio-utils (Arch: sudo pacman -S pipewire-pulse libpulse). pactl/parec precisam estar no PATH.');}
    if(!sink||sink.includes('\n'))throw new Error('Saída de áudio padrão inválida.');
    const sources=(await run('pactl',['list','short','sources'],{timeout:3000})).stdout;
    const monitor=sink+'.monitor';if(!sources.split('\n').some(line=>line.split('\t')[1]===monitor))throw new Error('Monitor da saída padrão não encontrado. Confira pactl list short sources.');
    const child=spawn('parec',['--device='+monitor,'--raw','--format=float32le','--rate=24000','--channels=1','--latency-msec=40'],{stdio:['ignore','pipe','pipe']});
    this.child=child;this.lastClient=Date.now();let pending=Buffer.alloc(0),err='';const fft=new Spectrum(1024,24000);const samples=new Float32Array(1024);
    child.stdout.on('data',chunk=>{pending=Buffer.concat([pending,chunk]);while(pending.length>=4096){for(let i=0;i<1024;i++)samples[i]=pending.readFloatLE(i*4);pending=pending.subarray(4096);const frame={...fft.analyze(samples),timestamp:Date.now()};for(const listener of this.listeners)listener(frame);}});
    child.stderr.on('data',d=>{err=(err+d.toString()).slice(-1000);});
    child.on('error',()=>{if(this.child===child)this.child=null;this.broadcast({error:'parec não iniciou. Instale os utilitários PulseAudio.'});});
    child.on('exit',code=>{if(this.child===child){this.child=null;if(code)this.broadcast({error:'Captura de saída terminou: '+err});}});
    this.timer=setInterval(()=>{if(this.listeners.size)this.lastClient=Date.now();else if(Date.now()-this.lastClient>5000)this.stop();},1000);this.timer.unref();
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  }
  broadcast(frame){for(const f of this.listeners)f(frame);}
  stop(){clearInterval(this.timer);const child=this.child;this.child=null;child?.kill('SIGTERM');}
}
