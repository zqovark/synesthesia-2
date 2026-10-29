import {Instrument} from './core/instrument.js';
import {Renderer} from './visuals/renderer.js';
import {AudioEngine} from './audio/audio.js';
const root=document.querySelector('#app');
root.innerHTML='<header><h1>Synesthesia <small>II</small></h1><span>INSTRUMENTO AUDIOVISUAL</span></header><main><h2>Primeira luz</h2><p>Uma matéria. Infinitas travessias.</p><label class="button">Abrir áudio<input id="audio-file" type="file" accept="audio/*" hidden></label><button id="system">Áudio do computador</button><button id="stop">Parar áudio</button><p id="status" role="status">Composição local · sem áudio</p><audio controls></audio></main>';
const status=document.querySelector('#status');
let session;const api=async(path,body)=>{session??=await fetch('/api/session').then(r=>r.json());const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Instrument-Token':session.token},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error);return data;};
const instrument=new Instrument();const audio=new AudioEngine(document.querySelector('audio'),api,text=>status.textContent=text);let renderer;
try{renderer=new Renderer(document.querySelector('#stage'),text=>status.textContent=text);}catch(e){status.textContent=e.message;}
const report=fn=>async e=>{try{await fn(e);}catch(error){status.textContent=error.message;}};
document.querySelector('#audio-file').onchange=report(e=>audio.file(e.target.files[0]));document.querySelector('#system').onclick=report(()=>audio.system());document.querySelector('#stop').onclick=report(()=>audio.stop());
let previous=performance.now();function tick(now){const dt=(now-previous)/1000;previous=now;const frame=audio.sample(now/1000,dt);renderer?.render(instrument.step(frame,dt),instrument.scene,now/1000,frame.beat);requestAnimationFrame(tick);}requestAnimationFrame(tick);
