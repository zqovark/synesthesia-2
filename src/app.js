import { Instrument, PARAMETERS, clamp } from './core/instrument.js';
import { Renderer } from './visuals/renderer.js';
import { AudioEngine } from './audio/audio.js';
import { TempoClock } from './audio/clock.js';
import { GamepadInput, DEFAULT_MAPPING } from './input/gamepad.js';
import { Library, BUILTINS } from './storage/library.js';
import { STATIC_PREVIEW } from './runtime.js';
import {ImageTransport} from './core/transport.js';
export const $ = s => document.querySelector(s),
  $$ = s => Array.from(document.querySelectorAll(s));
const glyph = '<svg viewBox="0 0 48 48" aria-hidden="true"><ellipse cx="24" cy="24" rx="19" ry="9"/><ellipse cx="24" cy="24" rx="19" ry="9" transform="rotate(60 24 24)"/><ellipse cx="24" cy="24" rx="19" ry="9" transform="rotate(120 24 24)"/><circle cx="24" cy="24" r="3"/></svg>';
$('#app').innerHTML = `
<header class="topbar"><a class="brand" href="/" aria-label="Synesthesia início">${glyph}<span>synesthesia<sup>II</sup><small>UM INSTRUMENTO PARA OUTRAS REALIDADES</small></span></a><div class="top-actions"><span id="gamepad-state" class="connection">○ CONTROLE AUSENTE</span><button id="audio-open" data-pad>◉ <span>Áudio</span></button><button id="generate-open" class="gold" data-pad>✧ <span>Gerar matéria</span></button><button id="performance" title="Modo performance" data-pad>⛶</button></div></header>
<main class="workspace"><section class="composition" aria-label="Composição"><div class="stage-heading"><div><span class="eyebrow">COMPOSIÇÃO / 01</span><h1 id="scene-title">Primeira luz</h1><p>Luz, matéria e movimento.</p></div><button id="scenes-open" class="subtle" data-pad>Explorar cenas ↗</button></div><div class="stage-frame"><i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i><div class="stage-tag">VISÃO CONTÍNUA · GPU / 2D</div><div class="stage-hint">ARRASTE PARA ATRAVESSAR <span>↔ profundidade · ↕ espiral</span></div><div id="gpu-status">INICIANDO GPU</div></div><div class="macro-dock"><div class="dock-heading"><span class="eyebrow">CONSTELAÇÃO DE MACROS</span><button id="macro-edit" class="text-button" data-pad>Compor macro +</button></div><div id="macros" class="macro-row"></div></div></section>
<aside class="effects"><div class="section-heading"><span class="eyebrow">MATÉRIA EM MOVIMENTO</span><span class="tiny">M + Σ + ♪</span></div><div id="parameters"></div><button id="bindings-open" class="wide subtle" data-pad>Rotear o áudio ↗</button><div class="spectrum"><div><i id="band-low"></i><span>GRAVES</span></div><div><i id="band-mid"></i><span>MÉDIOS</span></div><div><i id="band-high"></i><span>AGUDOS</span></div></div><div class="tempo-row"><button id="tap" data-pad>TAP</button><span id="tempo">120</span><small>BPM<br><span id="tempo-mode">MANUAL</span></small></div><p id="audio-state" class="tiny muted">SEM FONTE DE ÁUDIO</p></aside></main>
<section class="library-ribbon"><div class="ribbon-title"><span class="eyebrow">MATÉRIAS</span><span id="asset-count">02 / LOCAL</span><button id="import-open" class="text-button" data-pad>Importar +</button></div><div id="assets" class="asset-strip"></div><div class="ribbon-end"><span>A / B</span><span id="layer-info">2 CAMADAS</span><button id="library-open" class="subtle" data-pad>Biblioteca ↗</button></div></section>
<footer><span id="status" role="status" aria-live="polite">Composição local · pronta para explorar</span><span id="pad-help">LB/RB macro · LT/RT intensidade · RS efeito · A selecionar</span><button id="settings-open" class="text-button" data-pad>Ajustes ⚙</button></footer>
<div id="drawer" class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" hidden><div class="drawer-top"><div><span class="eyebrow" id="drawer-kicker">INSTRUMENTO</span><h2 id="drawer-title"></h2></div><button id="drawer-close" data-pad aria-label="Fechar painel">✕ <small>B</small></button></div><div id="drawer-body"></div></div><button id="return-controls" hidden data-pad>⛶ Mostrar instrumentos</button><input id="image-file" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden><input id="scene-file" type="file" accept="application/json,.json" hidden><audio id="player" hidden></audio>`;
export const app = {
  instrument: new Instrument(),
  transport: new ImageTransport(),
  clock: new TempoClock(),
  assets: [...BUILTINS],
  scenes: [],
  db: null,
  selectedMacro: 0,
  selectedParameter: 0,
  drawer: null
};
const voiceButton=document.createElement('button');voiceButton.id='voice-open';voiceButton.dataset.pad='';voiceButton.textContent='◉ Voz';voiceButton.setAttribute('aria-label','Gerar próxima imagem por voz');
voiceButton.onclick=()=>app.voice?.toggle();$('.top-actions').insertBefore(voiceButton,$('#generate-open'));
$('#pad-help').textContent='LS voz · LB/RB macro · LT/RT intensidade · RS efeito · A selecionar';
$('.brand').href = './';
if (STATIC_PREVIEW) {
  $('.brand small').textContent = 'PREVIEW ONLINE · INSTRUMENTO AUDIOVISUAL';
  $('#status').textContent = 'Preview online · abra um arquivo de áudio ou importe imagens';
}
export function notify(text) {
  $('#status').textContent = text;
}
export const safe = fn => async (...args) => {
  try {
    return await fn(...args);
  } catch (e) {
    notify(e.message);
    if ($('#drawer-error')) $('#drawer-error').textContent = e.message;
  }
};
let session;
export async function api(path, body, options = {}) {
  if (STATIC_PREVIEW) throw new Error('Este recurso usa o serviço da versão local.');
  session ??= await fetch('/api/session').then(r => r.json());
  const r = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Instrument-Token': session.token
    },
    body: JSON.stringify(body),
    signal: options.signal
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error);
  return d;
}
app.api = api;
app.audio = new AudioEngine($('#player'), api, text => {
  $('#audio-state').textContent = text;
  notify(text);
});
try {
  app.renderer = new Renderer($('#stage'), notify);
} catch (e) {
  notify(e.message);
}
app.gamepad = new GamepadInput(dispatch);
let timer, lastFocus;
const thumbs = new Map();
export function changed() {
  if (timer) return;
  timer = setTimeout(safe(saveSession), 400);
}
export async function saveSession() {
  clearTimeout(timer);
  timer = null;
  if (app.db) await app.db.put('settings', {
      id: 'session',
      scene: app.instrument.scene,
      selectedMacro: app.selectedMacro,
      selectedParameter: app.selectedParameter,
      mapping: app.gamepad.mapping,
      deadzone: app.gamepad.deadzone
  });
}
export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
export function button(text, fn, cls = '') {
  const n = el('button', cls, text);
  n.dataset.pad = '';
  n.onclick = safe(fn);
  return n;
}
export function input(type, value = '') {
  const n = el('input');
  n.type = type;
  // A range defaults to integer steps. Preserve fractional baselines while its
  // caller configures min/max/step, including when restoring a saved scene.
  if (type === 'range') n.step = 'any';
  n.value = value;
  n.dataset.pad = '';
  return n;
}
export function field(label, node) {
  const n = el('label', 'field');
  n.append(el('span', 'field-label', label), node);
  return n;
}
export function select(options, value) {
  const n = el('select');
  n.dataset.pad = '';
  for (const [v, label] of options) {
    const o = el('option', '', label);
    o.value = v;
    n.append(o);
  }
  n.value = value;
  return n;
}
export const help = text => el('p', 'help', text);
export function panelError(body) {
  const n = el('p', 'error');
  n.id = 'drawer-error';
  n.setAttribute('role', 'alert');
  body.append(n);
}
export function openDrawer(title, render, kicker = 'INSTRUMENTO') {
  if (!app.drawer) lastFocus = document.activeElement;
  app.drawer = title;
  $('#drawer-title').textContent = title;
  $('#drawer-kicker').textContent = kicker;
  $('#drawer-body').replaceChildren();
  render($('#drawer-body'));
  $('#drawer').hidden = false;
  $('#drawer-close').focus();
  $('#app').querySelectorAll('.topbar,.workspace,.library-ribbon,footer').forEach(n => n.inert = true);
}
export function closeDrawer() {
  if(app.drawer==='Próxima imagem por voz'&&app.voice?.listening)app.voice.cancel();
  app.drawer = null;
  $('#drawer').hidden = true;
  $('#app').querySelectorAll('.topbar,.workspace,.library-ribbon,footer').forEach(n => n.inert = false);
  lastFocus?.focus();
}
$('#drawer-close').onclick = closeDrawer;
export function picture(asset) {
  if (asset.blob) {
    if (!thumbs.has(asset.id)) thumbs.set(asset.id, URL.createObjectURL(asset.blob));
    const n = el('img');
    n.src = thumbs.get(asset.id);
    n.alt = asset.name;
    return n;
  }
  const n = el('div', 'procedural-preview p' + asset.id.slice(-1));
  n.append(el('span', '', '✧'));
  return n;
}
export function assetCard(asset, large = false) {
  const card = el('div', 'asset-card' + (large ? ' large' : '')),
    choose = button('', () => chooseImage(asset.id), 'asset-choice');
  choose.append(picture(asset));
  const i = app.instrument.scene.images.indexOf(asset.id);
  choose.setAttribute('aria-label', asset.name + (i >= 0 ? ' · camada ' + (i ? 'B' : 'A') : ''));
  if (i >= 0) choose.append(el('span', 'layer-badge', i ? 'B' : 'A'));
  card.append(choose, el('span', 'asset-name', asset.name));
  if (large) {
    card.append(el('span', 'tiny muted', asset.kind === 'procedural' ? 'PROCEDURAL LOCAL' : asset.kind === 'generated' ? 'GERADA POR IA' : 'IMPORTADA'), button('Detalhes', () => app.assetDetails(asset), 'text-button'));
  }
  return card;
}
export function renderAssets() {
  $('#assets').replaceChildren(...app.assets.map(a => assetCard(a)));
  $('#asset-count').textContent = String(app.assets.length).padStart(2, '0') + ' / LOCAL';
}
export async function updateImages() {
  const ids = app.instrument.scene.images;
  if (ids.some(id => !app.assets.some(a => a.id === id))) notify('Cena com imagens ausentes. Importe a cena completa.');
  await app.renderer?.setImages(ids.map(id => app.assets.find(a => a.id === id)));
  $('#layer-info').textContent = ids.length + ' CAMADAS';
  app.decks?.libraryChanged();
}
export async function chooseImage(id) {
  if(app.decks?.managed){await app.decks.queueNext(id);return;}
  const ids = app.instrument.scene.images,
    i = ids.indexOf(id);
  if (i >= 0) ids.splice(i, 1);else {
    if (ids.length === 2) ids.shift();
    ids.push(id);
  }
  await updateImages();
  renderAssets();
  changed();
}
export async function addImage(blob, name, metadata = {}) {
  if (!app.db) throw new Error('Armazenamento indisponível.');
  const a = await app.db.addImage(blob, name, metadata);
  app.assets.push(a);
  if(app.decks?.managed){await app.decks.queueNext(a.id);renderAssets();changed();return a;}
  app.instrument.scene.images = [...app.instrument.scene.images, a.id].slice(-2);
  await updateImages();
  renderAssets();
  changed();
  return a;
}
export function renderMacros() {
  $('#macros').replaceChildren();
  app.instrument.scene.macros.forEach((m, i) => {
    const card = el('div', 'macro' + (i === app.selectedMacro ? ' selected' : '')),
      dial = el('div', 'dial');
    dial.innerHTML = '<svg viewBox="0 0 80 80" aria-hidden="true"><circle class="track" cx="40" cy="40" r="33"/><circle class="arc" cx="40" cy="40" r="33" pathLength="100"/><circle class="inner" cx="40" cy="40" r="25"/></svg>';
    const range = input('range', m.value);
    range.min = 0;
    range.max = 1;
    range.step = .01;
    range.setAttribute('aria-label', 'Intensidade de ' + m.name);
    range.oninput = () => {
      app.instrument.setMacro(m.id, +range.value);
      app.selectedMacro = i;
      changed();
    };
    range.onfocus = () => app.selectedMacro = i;
    dial.append(range, el('output', 'macro-value'));
    const copy = el('div', 'macro-copy');
    copy.append(button(m.name, () => app.macroEditor(m), 'macro-name'), el('p', '', m.description ?? 'Macro de parâmetros'));
    card.append(dial, copy);
    $('#macros').append(card);
  });
}
export function renderParameters() {
  $('#parameters').replaceChildren();
  Object.entries(PARAMETERS).forEach(([key, p], i) => {
    const row = el('div', 'parameter');
    row.dataset.key = key;
    const heading = el('div', 'parameter-heading'),
      label = el('label', '', p.label),
      out = el('output', 'parameter-value');
    label.htmlFor = 'param-' + key;
    out.id = 'value-' + key;
    heading.append(label, out);
    const slider = input('range', app.instrument.scene.base[key]);
    slider.id = 'param-' + key;
    slider.min = p.min;
    slider.max = p.max;
    slider.step = .01;
    slider.oninput = () => {
      app.instrument.setBase(key, +slider.value);
      app.selectedParameter = i;
      changed();
    };
    slider.onfocus = () => app.selectedParameter = i;
    const hint = el('span', 'source-hint');
    hint.id = 'source-' + key;
    row.append(heading, slider, hint);
    $('#parameters').append(row);
  });
}
export function refresh() {
  $('#scene-title').textContent = app.instrument.scene.name;
  renderMacros();
  renderParameters();
  renderAssets();
  document.body.classList.toggle('reduced-motion', app.instrument.scene.reducedMotion);
  app.decks?.refresh();
}
export async function loadScene(scene) {
  app.instrument.setScene(scene);
  app.decks?.reset();
  app.selectedMacro = 0;
  refresh();
  await updateImages();
  changed();
}
export function performanceMode(force) {
  const enabled = force ?? !document.body.classList.contains('performance');
  document.body.classList.toggle('performance', enabled);
  $('#return-controls').hidden = !enabled;
  if (enabled) $('#return-controls').focus();
}
$('#performance').onclick = () => performanceMode();
$('#return-controls').onclick = () => performanceMode(false);
function focusables() {
  return Array.from((app.drawer ? $('#drawer') : $('#app')).querySelectorAll('[data-pad]')).filter(n => !n.disabled && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
}
function navigate(direction) {
  const nodes = focusables(),
    current = document.activeElement,
    index = nodes.indexOf(current);
  if (['left', 'right'].includes(direction) && current?.matches('input[type=range],input[type=number]')) {
    current.value = String(clamp(+(current.value || 0) + (direction === 'right' ? 1 : -1) * +(current.step || 1), current.min === '' ? -1e9 : +current.min, current.max === '' ? 1e9 : +current.max));
    current.dispatchEvent(new Event('input', {
      bubbles: true
    }));
    return;
  }
  if (['left', 'right'].includes(direction) && current?.tagName === 'SELECT') {
    current.selectedIndex = clamp(current.selectedIndex + (direction === 'right' ? 1 : -1), 0, current.options.length - 1);
    current.dispatchEvent(new Event('change', {
      bubbles: true
    }));
    return;
  }
  const next = nodes[(index + (direction === 'up' || direction === 'left' ? -1 : 1) + nodes.length) % nodes.length];
  next?.focus();
  next?.scrollIntoView({
    block: 'nearest',
    inline: 'nearest'
  });
}
async function cycleImage() {
  if(app.decks?.managed){await app.decks.next();return;}
  const ids = app.instrument.scene.images,
    i = app.assets.findIndex(a => a.id === ids.at(-1));
  ids[1] = app.assets[(i + 1) % app.assets.length].id;
  if (!ids[0]) ids[0] = 'builtin-0';
  await updateImages();
  renderAssets();
  changed();
}
function dispatch(action, value) {
  const k = app.instrument,
    macros = k.scene.macros;
  if (action === 'connection') {
    if(!value&&app.voice?.listening)app.voice.cancel();
    $('#gamepad-state').textContent = value ? '● CONTROLE CONECTADO' : '○ CONTROLE AUSENTE';
    notify(value ? 'Controle conectado. Solte os botões e centralize os analógicos.' : 'Controle desconectado. Valores mantidos.');
    return;
  }
  if(action==='voice'){app.voice?.toggle();return;}
  if (action === 'navigate') {
    navigate(value);
    return;
  }
  if (action === 'accept') {
    const target = document.activeElement;
    if (target?.matches('[data-pad]')) target.click();else focusables()[0]?.focus();
    return;
  }
  if (action === 'back') {
    if (app.drawer) closeDrawer();else performanceMode(false);
    return;
  }
  if (action === 'performance') {
    if (app.drawer) closeDrawer();
    performanceMode();
    return;
  }
  if (app.drawer) return;
  if (action === 'previousMacro' || action === 'nextMacro') {
    app.selectedMacro = (app.selectedMacro + (action === 'nextMacro' ? 1 : -1) + macros.length) % Math.max(1, macros.length);
    renderMacros();
    changed();
  }
  if (action === 'macroDelta' && macros[app.selectedMacro]) {
    const m = macros[app.selectedMacro];
    k.setMacro(m.id, m.value + value);
    changed();
  }
  if (action === 'previousParameter' || action === 'nextParameter') {
    app.selectedParameter = (app.selectedParameter + (action === 'nextParameter' ? 1 : -1) + 8) % 8;
    notify('Efeito selecionado: ' + Object.values(PARAMETERS)[app.selectedParameter].label);
    changed();
  }
  if (action === 'parameterDelta') {
    const [key, p] = Object.entries(PARAMETERS)[app.selectedParameter];
    k.setBase(key, k.scene.base[key] + value * (p.max - p.min));
    $('#param-' + key).value = k.scene.base[key];
    changed();
  }
  if (action === 'nextImage') safe(cycleImage)();
  if (action === 'nextScene' && app.scenes.length) {
    const i = app.scenes.findIndex(s => s.id === k.scene.id);
    safe(() => loadScene(app.scenes[(i + 1) % app.scenes.length]))();
  }
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeDrawer();
    performanceMode(false);
  }
  if (app.drawer && e.key === 'Tab') {
    const nodes = focusables(),
      first = nodes[0],
      last = nodes.at(-1);
    if (e.shiftKey && e.target === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && e.target === last) {
      e.preventDefault();
      first?.focus();
    }
  }
});
let drag = null;
const stage = $('.stage-frame');
stage.onpointerdown = e => {
  if (e.button) return;
  drag = {
    x: e.clientX,
    y: e.clientY,
    zoom: app.instrument.scene.base.zoom,
    spiral: app.instrument.scene.base.spiral
  };
  stage.setPointerCapture(e.pointerId);
};
stage.onpointermove = e => {
  if (!drag) return;
  app.instrument.setBase('zoom', drag.zoom + (e.clientX - drag.x) / 300);
  app.instrument.setBase('spiral', drag.spiral + (e.clientY - drag.y) / 180);
  $('#param-zoom').value = app.instrument.scene.base.zoom;
  $('#param-spiral').value = app.instrument.scene.base.spiral;
  changed();
};
stage.onpointerup = stage.onpointercancel = () => drag = null;
$('#import-open').onclick = () => $('#image-file').click();
$('#image-file').onchange = safe(async e => {
  for (const f of e.target.files) await addImage(f, f.name);
  e.target.value = '';
  notify('Matéria adicionada e salva localmente.');
});
let last = performance.now(),
  ui = 0,
  count = 0,
  fps = 0,
  fpsTime = last,
  raf,
  sceneTime = 0,
  disposed = false,
  beatSwap = 0;
function tick(now) {
  if (disposed) return;
  const elapsedSeconds=Math.max(0,(now-last)/1000);
  const dt = Math.min(.1, (now - last) / 1000);
  last = now;
  sceneTime += dt;
  app.gamepad.poll(navigator.getGamepads?.(), dt, now / 1000);
  const k = app.instrument,
    sound = app.clock.sample(app.audio.sample(now / 1000, dt), k.scene, now / 1000);
  app.decks?.step(elapsedSeconds);
  const parameters=k.step(sound,dt);
  app.renderer?.render(app.decks?.renderParams(parameters)??parameters, k.scene, sceneTime, sound.beat);
  count++;
  if (now - fpsTime > 1000) {
    fps = Math.round(count * 1000 / (now - fpsTime));
    count = 0;
    fpsTime = now;
  }
  if (sound.onset && k.scene.beatTransition && now - beatSwap > 500) {
    beatSwap = now;
    safe(cycleImage)();
  }
  if (now - ui > 100) {
    ui = now;
    app.decks?.refresh();
    $('#gpu-status').textContent = app.renderer ? fps + ' FPS · ' + app.renderer.canvas.width + ' × ' + app.renderer.canvas.height : 'GPU INDISPONÍVEL';
    const manual = k.scene.manualTempo || sound.confidence < .65;
    $('#tempo').textContent = Math.round((manual ? k.scene.bpm : sound.bpm) || 120);
    $('#tempo-mode').textContent = manual ? 'MANUAL' : 'EST. ' + Math.round(sound.confidence * 100) + '%';
    for (const band of ['low', 'mid', 'high']) $('#band-' + band).style.transform = 'scaleY(' + Math.max(.02, sound[band] ?? 0) + ')';
    for (const key of Object.keys(PARAMETERS)) {
      const s = k.sources[key];
      $('#value-' + key).textContent = s.effective.toFixed(2);
      $('#source-' + key).textContent = 'M ' + s.manual.toFixed(2) + '  Σ ' + s.macro.toFixed(2) + '  ♪ ' + s.audio.toFixed(2);
      $('.parameter[data-key="' + key + '"]').classList.toggle('chosen', Object.keys(PARAMETERS)[app.selectedParameter] === key);
    }
    $('#param-blend').disabled=!!app.decks?.managed;
    if(app.decks?.managed){$('#value-blend').textContent=app.transport.mix.toFixed(2);$('#source-blend').textContent='DECK A → B · TEMPORIZADOR';}
    $$('#macros .macro').forEach((n, i) => {
      const m = k.scene.macros[i];
      if (!m) return;
      n.querySelector('.arc').setAttribute('stroke-dasharray', Math.round((k.macroLevels.get(m.id) ?? 0) * 100) + ' 100');
      n.querySelector('output').textContent = Math.round(m.value * 100) + '%';
      n.classList.toggle('selected', i === app.selectedMacro);
      if (document.activeElement !== n.querySelector('input')) n.querySelector('input').value = m.value;
    });
  }
  raf = requestAnimationFrame(tick);
}
refresh();
raf = requestAnimationFrame(tick);
await safe(async () => {
  app.db = await new Library().open();
  app.assets = [...BUILTINS, ...(await app.db.list('assets'))];
  app.scenes = await app.db.list('scenes');
  const saved = await app.db.get('settings', 'session');
  if (saved) {
    app.instrument.setScene(saved.scene);
    app.selectedMacro = clamp(saved.selectedMacro ?? 0, 0, Math.max(0, app.instrument.scene.macros.length - 1));
    app.selectedParameter = clamp(saved.selectedParameter ?? 0, 0, 7);
    app.gamepad.mapping = {
      ...DEFAULT_MAPPING,
      ...saved.mapping
    };
    if(saved.mapping&&!('voice' in saved.mapping)){
      const used=new Set(Object.values(saved.mapping));
      app.gamepad.mapping.voice=[10,0,1,2,3,4,5,8,9,11].find(index=>!used.has(index))??-1;
    }
    app.gamepad.deadzone = clamp(saved.deadzone ?? .16, .05, .4);
  } else app.instrument.scene.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  refresh();
  await updateImages();
})();
import('./panels.js').catch(e => notify(e.message));
import('./decks.js').catch(e=>notify(e.message));
window.addEventListener('pagehide', () => {
  disposed = true;
  cancelAnimationFrame(raf);
  clearTimeout(timer);
  app.voice?.cancel();
  app.renderer?.dispose();
  void app.audio.dispose();
  for (const url of thumbs.values()) URL.revokeObjectURL(url);
  void saveSession().finally(() => app.db?.close());
});
document.addEventListener('visibilitychange', () => { if (document.hidden) {app.transport.pause();app.voice?.cancel();void safe(saveSession)();} });
