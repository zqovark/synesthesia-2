import {chromium} from 'playwright';
import http from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {once} from 'node:events';
import path from 'node:path';
import assert from 'node:assert/strict';
import {buildPreview} from './build-preview.mjs';
const dist=await buildPreview(),prefix='/synesthesia-2/';
const server=http.createServer(async(req,res)=>{
  try {
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(!pathname.startsWith(prefix))return res.writeHead(404).end();
    const relative=pathname.slice(prefix.length)||'index.html';
    if(relative.includes('..'))return res.writeHead(404).end();
    const file=path.join(dist,relative),data=await readFile(file);
    const type={'.js':'text/javascript','.html':'text/html','.css':'text/css'}[path.extname(file)]??'application/octet-stream';
    res.writeHead(200,{'Content-Type':type});res.end(data);
  }catch {res.writeHead(404).end();}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
let browser,page;const errors=[],apiRequests=[];
try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
  page=await browser.newPage({viewport:{width:1280,height:900}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(new URL(r.url()).pathname.includes('/api/'))apiRequests.push(r.url());});
  await page.goto('http://127.0.0.1:'+server.address().port+prefix);
  await page.waitForFunction(()=>/\d+ FPS/.test(document.querySelector('#gpu-status').textContent));
  await page.waitForFunction(()=>!!document.querySelector('#generate-open').onclick);
  assert.match(await page.locator('.brand small').textContent(),/PREVIEW ONLINE/);
  assert.match(await page.locator('.brand').getAttribute('href'),/\.\//);
  await page.locator('#generate-open').click();
  assert.equal(await page.getByRole('button',{name:'Gerar uma imagem',exact:true}).isDisabled(),true);
  assert.match(await page.locator('#drawer-body').textContent(),/versão local/);
  await page.locator('#drawer-close').click();
  await page.locator('#audio-open').click();
  assert.equal(await page.getByRole('button',{name:'Computador · monitor de saída',exact:true}).isDisabled(),true);
  assert.equal(await page.getByLabel('Arquivo de áudio').count(),1);
  await page.locator('#drawer-close').click();
  await page.locator('#param-zoom').evaluate(n=>{n.value='1.8';n.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#scenes-open').click();await page.getByLabel('Nome da composição').fill('Cena do preview');
  await page.getByRole('button',{name:'Salvar cena',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Cena salva'));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#scene-title').textContent==='Cena do preview');
  assert.equal(await page.locator('#param-zoom').inputValue(),'1.8');
  assert.deepEqual(apiRequests,[]);assert.deepEqual(errors,[]);
  await mkdir('test-results',{recursive:true});await page.evaluate(()=>window.requestAnimationFrame=()=>0);
  await page.screenshot({path:'test-results/pages-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'test-results/pages-mobile.png',fullPage:true});
  console.log('Pages preview passed: subdirectory, WebGL, scene persistence, honest capabilities, no service requests.');
}catch(error){
  if(page){console.error('Preview status:',await page.locator('#status').textContent().catch(()=>'?'));await mkdir('test-results',{recursive:true});await page.evaluate(()=>window.requestAnimationFrame=()=>0).catch(()=>{});await page.screenshot({path:'test-results/pages-failure.png',timeout:15000}).catch(()=>{});}
  throw error;
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
