import { app, $, el, button, input, field, changed, notify, safe, picture, renderAssets } from './app.js';
import { ImageTransport } from './core/transport.js';
const consoleEl = el('section', 'deck-console');
consoleEl.setAttribute('aria-label', 'Decks e temporizador de imagens');
consoleEl.innerHTML = '<div class="transport-heading"><span class="eyebrow">IMAGE DECKS</span><div id="transport-buttons"></div><span id="transport-state" role="status">MIX LIVRE</span></div><div class="decks"><article class="image-deck deck-a"><span class="deck-letter">A</span><div id="deck-art-a" class="deck-art"></div><div class="deck-copy"><small>NO AR</small><strong id="deck-name-a"></strong><span id="deck-time-a"></span></div><div id="deck-duration-a"></div></article><article class="image-deck deck-b"><span class="deck-letter">B</span><div id="deck-art-b" class="deck-art"></div><div class="deck-copy"><small>PRÓXIMA / CUE</small><strong id="deck-name-b"></strong><span id="deck-time-b"></span></div><div id="deck-duration-b"></div></article></div><div class="image-timeline"><span id="image-elapsed">00:00</span><div class="timeline-track"><input id="image-progress" type="range" min="0" max="20" step="0.1" value="0" data-pad aria-label="Posição no tempo da imagem"><div class="time-ticks" aria-hidden="true"></div></div><span id="image-remaining">−00:20</span></div>';
$('.library-ribbon').before(consoleEl);
let ticket = 0,
  playIntent = 0,
  heldMix = 0,
  lastPair = '',
  artKey = '';
const format = seconds => {
  const s = Math.max(0, Math.floor(seconds));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};
function synchronize() {
  app.transport.configure(app.instrument.scene.transport, app.assets.map(a => a.id), app.instrument.scene.images);
  if (!app.decks?.managed && app.instrument.scene.images[0]) app.transport.select(app.instrument.scene.images[0]);
}
function store() {
  app.instrument.scene.transport = {
    ...app.transport.config,
    order: [...app.transport.order]
  };
  changed();
}
async function loadPair() {
  const t = app.transport,
    pair = [t.current, t.next].filter(Boolean),
    key = pair.join('|');
  if (key === lastPair) return;
  lastPair = key;
  const own = ++ticket;
  t.ready = false;
  try {
    await app.renderer?.setImages(pair.map(id => app.assets.find(a => a.id === id)), {
      immediate: true
    });
    if (own !== ticket) return;
    app.instrument.scene.images = pair;
    renderAssets();
  } catch (error) {
    lastPair = '';
    t.pause();
    notify(error.message);
  } finally {
    if (own === ticket) t.ready = true;
  }
}
const play = button('▶ PLAY', async () => {
  const intent=++playIntent;
  synchronize();
  app.transport.config.enabled = true;
  if (app.transport.playing) app.transport.pause();else {
    await loadPair();
    if(intent!==playIntent)return;
    app.transport.play();
  }
  store();
  refresh();
}, 'transport-play');
play.id = 'image-play';
const cue = button('CUE', () => {
  ++playIntent;
  app.transport.cue();
  store();
  refresh();
});
cue.id = 'image-cue';
const next = button('NEXT ›', () => app.decks.next());
next.id = 'image-next';
const free = button('MIX LIVRE', () => {
  ++playIntent;
  app.transport.pause();
  app.transport.config.enabled = false;
  store();
  refresh();
});
free.id = 'image-free';
const loop = button('↻ LOOP', () => {
  app.transport.config.loop = !app.transport.config.loop;
  lastPair = '';
  store();
  if (app.decks.managed) void loadPair();
  refresh();
});
loop.id = 'image-loop';
$('#transport-buttons').append(play, cue, next, loop, free);
for (const deck of ['a', 'b']) {
  const n = input('number', 20);
  n.min = 2;
  n.max = 600;
  n.step = 1;
  n.id = 'duration-' + deck;
  n.setAttribute('aria-label', 'Duração da imagem no deck ' + deck.toUpperCase());
  n.oninput = () => {
    const t = app.transport,
      id = deck === 'a' ? t.current : t.next;
    if (id) {
      t.config.durations[id] = Math.max(2, Math.min(600, +n.value || 2));
      if (deck === 'a') t.seek(Math.min(t.elapsed, t.duration));
      store();
    }
  };
  $('#deck-duration-' + deck).append(field('DURAÇÃO / s', n));
}
$('#image-progress').oninput = e => {
  app.transport.seek(+e.target.value);
  refresh();
};
function refresh() {
  const t = app.transport;
  if (!t?.config) return;
  const current = app.assets.find(a => a.id === t.current),
    upcoming = app.assets.find(a => a.id === t.next);
  const key = [current?.id, upcoming?.id].join('|');
  if (key !== artKey) {
    artKey = key;
    for (const [deck, asset] of [['a', current], ['b', upcoming]]) {
      const box = $('#deck-art-' + deck);
      box.replaceChildren();
      if (asset) box.append(picture(asset));
    }
  }
  $('#deck-name-a').textContent = current?.name ?? 'Carregue uma imagem';
  $('#deck-name-b').textContent = upcoming?.name ?? 'Fim da fila';
  $('#deck-time-a').textContent = format(t.elapsed) + ' / ' + format(t.duration);
  $('#deck-time-b').textContent = upcoming ? 'READY · ' + format(t.config.durations[t.next] ?? t.config.duration) : 'SEM CUE';
  $('#transport-state').textContent = !t.config.enabled ? 'MIX LIVRE' : !t.ready ? 'PREPARANDO' : t.playing ? 'AUTO · ' + (t.index + 1) + ' / ' + t.order.length : 'PAUSADO';
  play.textContent = t.playing ? 'Ⅱ PAUSE' : '▶ PLAY';
  play.setAttribute('aria-pressed', String(t.playing));
  loop.setAttribute('aria-pressed', String(t.config.loop));
  free.setAttribute('aria-pressed', String(!t.config.enabled));
  const progress = $('#image-progress');
  progress.max = t.duration;
  if (document.activeElement !== progress) progress.value = t.elapsed;
  progress.style.setProperty('--played', Math.round(t.progress * 100) + '%');
  $('#image-elapsed').textContent = format(t.elapsed);
  $('#image-remaining').textContent = '−' + format(Math.ceil(t.duration - t.elapsed));
  for (const deck of ['a', 'b']) {
    const n = $('#duration-' + deck),
      id = deck === 'a' ? t.current : t.next;
    if (document.activeElement !== n) n.value = t.config.durations[id] ?? t.config.duration;
    n.disabled = !id;
  }
}
app.decks = {
  get managed() {
    return app.transport.config.enabled;
  },
  refresh,
  libraryChanged() {
    synchronize();
    refresh();
  },
  reset() {
    ++playIntent;
    ++ticket;
    lastPair = '';
    app.transport = new ImageTransport();
    synchronize();
    refresh();
  },
  async queueNext(id) {
    synchronize();
    app.transport.enqueueNext(id);
    lastPair = '';
    if (this.managed) {
      heldMix = app.transport.mix;
      await loadPair();
    }
    store();
    renderAssets();
    refresh();
    notify('Próxima imagem preparada no deck B.');
  },
  async next() {
    synchronize();
    app.transport.config.enabled = true;
    if (app.transport.advance()) {
      heldMix = 1;
      lastPair = '';
      await loadPair();
    }
    store();
    refresh();
  },
  step(seconds) {
    if (!this.managed) return;
    const t = app.transport;
    if (t.tick(seconds)) {
      heldMix = 1;
      lastPair = '';
      void loadPair();
      store();
    }
  },
  renderParams(params) {
    return this.managed ? {
      ...params,
      blend: app.transport.ready ? app.transport.mix : heldMix
    } : params;
  }
};
app.decks.reset();
app.queueGenerated = async (blob, name, metadata) => {
  if (!app.db) throw new Error('Armazenamento indisponível.');
  const asset = await app.db.addImage(blob, name, metadata);
  app.assets.push(asset);
  await app.decks.queueNext(asset.id);
  return asset;
};
