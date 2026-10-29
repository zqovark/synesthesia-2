import { app, $, el, button, input, field, select, help, panelError, openDrawer, closeDrawer, safe, notify, changed, saveSession, picture, assetCard, chooseImage, renderAssets, renderMacros, updateImages, loadScene, addImage } from './app.js';
import { PARAMETERS, createScene, validateScene, clamp } from './core/instrument.js';
import { sceneEnvelope, validateEnvelope } from './storage/library.js';
import { STATIC_PREVIEW } from './runtime.js';
const parameterOptions = () => Object.entries(PARAMETERS).map(([k, p]) => [k, p.label]);
export function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = el('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const blobData = blob => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(blob);
});
app.assetDetails = asset => openDrawer(asset.name, body => {
  body.append(picture(asset));
  const dl = el('dl', 'metadata');
  for (const [key, value] of Object.entries(asset.metadata ?? {})) dl.append(el('dt', '', key), el('dd', '', typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)));
  body.append(dl, button('Usar na composição', () => chooseImage(asset.id), 'gold'));
  if (asset.blob) {
    body.append(button('Exportar imagem e metadados', () => {
      download(asset.blob, 'synesthesia-image.' + (asset.blob.type === 'image/jpeg' ? 'jpg' : asset.blob.type === 'image/webp' ? 'webp' : 'png'));
      download(new Blob([JSON.stringify(asset.metadata, null, 2)], {
        type: 'application/json'
      }), 'image-metadata.json');
    }), button('Excluir matéria', async () => {
      await app.db.remove('assets', asset.id);
      app.assets = app.assets.filter(a => a.id !== asset.id);
      app.instrument.scene.images = app.instrument.scene.images.filter(id => id !== asset.id);
      await updateImages();
      renderAssets();
      changed();
      closeDrawer();
    }));
  }
});
$('#library-open').onclick = () => openDrawer('Matérias para atravessar', body => {
  body.append(help('Selecione até duas matérias, A/B. A terceira substitui a mais antiga. Selecione novamente para retirar.'));
  const grid = el('div', 'library-grid');
  app.assets.forEach(a => grid.append(assetCard(a, true)));
  body.append(grid, button('Importar imagens', () => $('#image-file').click(), 'gold'));
});
app.macroEditor = existing => {
  const draft = structuredClone(existing ?? {
    id: crypto.randomUUID(),
    name: 'Nova macro',
    description: '',
    value: 0,
    targets: [{
      parameter: 'zoom',
      min: 0,
      max: .5,
      curve: 'ease'
    }]
  });
  openDrawer(existing ? 'Compor ' + existing.name : 'Compor uma macro', body => {
    const name = input('text', draft.name),
      description = input('text', draft.description);
    name.maxLength = 80;
    description.maxLength = 160;
    body.append(field('Nome', name), field('O que esta macro transforma', description), help('Cada destino soma um delta ao valor manual. Intensidade zero é neutra. A curva interpola os deltas mínimo/máximo e a intensidade pondera a contribuição. Deltas negativos invertem o movimento.'));
    const list = el('div');
    body.append(list);
    function draw() {
      list.replaceChildren();
      draft.targets.forEach((t, i) => {
        const row = el('div', 'macro-target'),
          p = select(parameterOptions(), t.parameter),
          min = input('number', t.min),
          max = input('number', t.max),
          curve = select([['linear', 'Linear'], ['ease', 'Suave'], ['square', 'Quadrática'], ['sqrt', 'Raiz']], t.curve);
        min.step = max.step = .05;
        p.onchange = () => t.parameter = p.value;
        min.oninput = () => t.min = +min.value;
        max.oninput = () => t.max = +max.value;
        curve.onchange = () => t.curve = curve.value;
        row.append(field('Parâmetro', p), field('Curva', curve), field('Delta mínimo', min), field('Delta máximo', max), button('Remover destino', () => {
          draft.targets.splice(i, 1);
          draw();
        }, 'text-button'));
        list.append(row);
      });
    }
    draw();
    body.append(button('Adicionar destino +', () => {
      if (draft.targets.length >= 32) throw new Error('Máximo de 32 destinos.');
      draft.targets.push({
        parameter: 'blend',
        min: 0,
        max: .3,
        curve: 'linear'
      });
      draw();
    }), button('Salvar macro', () => {
      draft.name = name.value.trim() || 'Macro';
      draft.description = description.value;
      const scene = structuredClone(app.instrument.scene),
        i = scene.macros.findIndex(m => m.id === draft.id);
      if (i < 0) scene.macros.push(draft);else scene.macros[i] = draft;
      validateScene(scene);
      app.instrument.scene = scene;
      renderMacros();
      changed();
      closeDrawer();
    }, 'gold'));
    if (existing) body.append(button('Excluir macro', () => {
      app.instrument.scene.macros = app.instrument.scene.macros.filter(m => m.id !== existing.id);
      app.selectedMacro = 0;
      renderMacros();
      changed();
      closeDrawer();
    }));
    panelError(body);
  }, 'CONSTELAÇÃO DE EFEITOS');
};
$('#macro-edit').onclick = () => app.macroEditor();
$('#bindings-open').onclick = () => openDrawer('O som transforma a matéria', body => {
  body.append(help('Manual + macros + áudio → limites → suavização. As contribuições aparecem em cada efeito. Batidas detectadas são estimativas; ajuste o tempo manual quando necessário.'));
  const bindings = structuredClone(app.instrument.scene.bindings),
    list = el('div');
  body.append(list);
  function draw() {
    list.replaceChildren();
    bindings.forEach((b, i) => {
      const row = el('div', 'binding'),
        p = select(parameterOptions(), b.parameter),
        band = select([['low', 'Graves'], ['mid', 'Médios'], ['high', 'Agudos'], ['beat', 'Batidas'], ['level', 'Energia']], b.band);
      p.onchange = () => b.parameter = p.value;
      band.onchange = () => b.band = band.value;
      row.append(field('Parâmetro', p), field('Fonte', band));
      for (const [key, label] of [['amount', 'Intensidade'], ['smoothing', 'Suavização (s)'], ['min', 'Entrada mínima'], ['max', 'Entrada máxima']]) {
        const n = input('number', b[key]);
        n.step = .05;
        n.oninput = () => b[key] = +n.value;
        row.append(field(label, n));
      }
      row.append(button('Remover', () => {
        bindings.splice(i, 1);
        draw();
      }, 'text-button'));
      list.append(row);
    });
  }
  draw();
  const bpm = input('number', app.instrument.scene.bpm);
  bpm.min = 40;
  bpm.max = 240;
  bpm.oninput = () => {
    app.instrument.scene.bpm = clamp(+bpm.value, 40, 240);
    changed();
  };
  const manual = input('checkbox');
  manual.checked = app.instrument.scene.manualTempo;
  manual.onchange = () => {
    app.instrument.scene.manualTempo = manual.checked;
    changed();
  };
  const transition = input('checkbox');
  transition.checked = app.instrument.scene.beatTransition;
  transition.onchange = () => {
    app.instrument.scene.beatTransition = transition.checked;
    changed();
  };
  body.append(button('Adicionar associação +', () => {
    if (bindings.length < 64) {
      bindings.push({
        parameter: 'rings',
        band: 'low',
        amount: .2,
        smoothing: .25,
        min: 0,
        max: 1
      });
      draw();
    }
  }), field('BPM manual', bpm), field('Usar sempre tempo manual', manual), field('Batida detectada avança matéria B', transition), button('Salvar associações', () => {
    validateScene({
      ...app.instrument.scene,
      bindings
    });
    app.instrument.scene.bindings = bindings;
    app.instrument.audioLevels.clear();
    changed();
    closeDrawer();
  }, 'gold'));
  panelError(body);
});
$('#audio-open').onclick = () => openDrawer('Escutar o movimento', body => {
  body.append(help(STATIC_PREVIEW
    ? 'Abra um arquivo de áudio para reproduzir e sincronizar a composição. A captura do áudio do computador está disponível na versão local.'
    : 'Arquivos são reproduzidos e analisados no navegador. No Linux, “Computador” lê o monitor da saída via pipewire-pulse/parec, sem microfone e sem duplicar o som.'));
  const file = input('file');
  file.accept = 'audio/*';
  file.onchange = safe(async () => {
    if (file.files[0]) {
      await app.audio.file(file.files[0]);
      closeDrawer();
    }
  });
  const systemButton = button('Computador · monitor de saída', async () => {
    await app.audio.system();
    closeDrawer();
  }, 'gold');
  systemButton.disabled = STATIC_PREVIEW;
  if (STATIC_PREVIEW) systemButton.title = 'Disponível na versão local';
  body.append(field('Arquivo de áudio', file), systemButton, button('Parar áudio', () => app.audio.stop()));
  const player = $('#player');
  body.append(button(player.paused ? 'Reproduzir arquivo' : 'Pausar arquivo', async () => {
    if (app.audio.kind !== 'file') throw new Error('Escolha um arquivo primeiro.');
    if (player.paused) {
      await app.audio.context();
      await player.play();
    } else player.pause();
  }));
  const seek = input('range', player.currentTime);
  seek.min = 0;
  seek.max = Number.isFinite(player.duration) ? player.duration : 0;
  seek.step = .1;
  seek.oninput = () => {
    if (Number.isFinite(player.duration)) player.currentTime = +seek.value;
  };
  body.append(field('Posição no arquivo (segundos)', seek));
  panelError(body);
});
const taps = [];
$('#tap').onclick = () => {
  const now = performance.now();
  app.clock.reset(now / 1000);
  if (taps.length && now - taps.at(-1) > 2000) taps.length = 0;
  taps.push(now);
  if (taps.length > 8) taps.shift();
  if (taps.length >= 2) {
    app.instrument.scene.bpm = clamp(60000 / ((now - taps[0]) / (taps.length - 1)), 40, 240);
    app.instrument.scene.manualTempo = true;
    changed();
  }
};
async function exportScene() {
  const scene = app.instrument.scene,
    items = [];
  for (const id of scene.images) {
    const a = app.assets.find(a => a.id === id);
    if (a?.blob) items.push({
      ...a,
      blob: undefined,
      data: await blobData(a.blob)
    });
  }
  download(new Blob([JSON.stringify(sceneEnvelope(scene, items), null, 2)], {
    type: 'application/json'
  }), 'synesthesia-scene.json');
}
function scenesPanel() {
  openDrawer('Guardar uma visão', body => {
    const name = input('text', app.instrument.scene.name);
    name.maxLength = 100;
    body.append(field('Nome da composição', name), button('Salvar cena', async () => {
      app.instrument.scene.name = name.value.trim() || 'Sem título';
      await app.db.put('scenes', app.instrument.scene);
      app.scenes = await app.db.list('scenes');
      $('#scene-title').textContent = app.instrument.scene.name;
      await saveSession();
      scenesPanel();
      notify('Cena salva com imagens, macros e associações.');
    }, 'gold'), button('Nova cena', async () => {
      await loadScene({
        ...createScene(),
        id: crypto.randomUUID()
      });
      closeDrawer();
    }), button('Exportar cena com imagens', exportScene), button('Importar cena', () => $('#scene-file').click()));
    const list = el('div', 'scene-list');
    app.scenes.forEach(scene => {
      const row = el('div', 'saved-scene');
      row.append(button(scene.name, async () => {
        await loadScene(scene);
        closeDrawer();
      }, 'scene-select'), button('Excluir', async () => {
        await app.db.remove('scenes', scene.id);
        app.scenes = app.scenes.filter(s => s.id !== scene.id);
        scenesPanel();
      }, 'text-button'));
      list.append(row);
    });
    body.append(list);
    panelError(body);
  });
}
$('#scenes-open').onclick = scenesPanel;
$('#scene-file').onchange = safe(async e => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 60 * 1024 * 1024) throw new Error('Cena excede 60 MB.');
  const d = JSON.parse(await file.text()),
    scene = validateEnvelope(d),
    map = new Map();
  for (const item of d.assets) {
    if (typeof item.data !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(item.data)) throw new Error('Imagem de cena inválida.');
    const [header, encoded] = item.data.split(','),
      blob = new Blob([Uint8Array.from(atob(encoded), char => char.charCodeAt(0))], {type:header.slice(5,header.indexOf(';'))}),
      asset = await addImage(blob, String(item.name ?? 'Imagem'), item.metadata ?? {});
    map.set(item.id, asset.id);
  }
  scene.images = scene.images.map(id => map.get(id) ?? id);
  scene.id = crypto.randomUUID();
  await app.db.put('scenes', scene);
  app.scenes = await app.db.list('scenes');
  await loadScene(scene);
  e.target.value = '';
  closeDrawer();
  notify('Cena importada com imagens e metadados.');
});
function settingsPanel() {
  openDrawer('Afinar o instrumento', body => {
    const light = input('range', app.instrument.scene.luminance);
    light.min = .1;
    light.max = 1;
    light.step = .01;
    light.oninput = () => {
      app.instrument.scene.luminance = +light.value;
      changed();
    };
    const pulse = input('range', app.instrument.scene.pulse);
    pulse.min = 0;
    pulse.max = .3;
    pulse.step = .01;
    pulse.oninput = () => {
      app.instrument.scene.pulse = +pulse.value;
      changed();
    };
    const reduce = input('checkbox');
    reduce.checked = app.instrument.scene.reducedMotion;
    reduce.onchange = () => {
      app.instrument.scene.reducedMotion = reduce.checked;
      document.body.classList.toggle('reduced-motion', reduce.checked);
      changed();
    };
    body.append(field('Luminosidade máxima', light), field('Pulso nas batidas (zero = desligado)', pulse), field('Reduzir movimento da interface', reduce), help('A preferência reduz transições da interface. A composição continua sob seu controle. O pulso de luz começa desligado.'), el('h3', '', 'Controle Xbox'), help('Direcional navega; A opera; B fecha. LT/RT modulam a macro, RS horizontal altera o efeito selecionado. Back/RS selecionam efeitos; LB/RB selecionam macros. Após reconectar, solte botões e centralize analógicos.'));
    const zone = input('range', app.gamepad.deadzone);
    zone.min = .05;
    zone.max = .4;
    zone.step = .01;
    zone.oninput = () => {
      app.gamepad.deadzone = +zone.value;
      changed();
    };
    body.append(field('Zona morta', zone));
    const actions = {
      accept: 'Operar',
      back: 'Voltar',
      nextImage: 'Próxima matéria',
      nextScene: 'Próxima cena',
      previousMacro: 'Macro anterior',
      nextMacro: 'Próxima macro',
      previousParameter: 'Efeito anterior',
      nextParameter: 'Próximo efeito',
      performance: 'Performance'
      ,voice:'Voz / próxima imagem'
    };
    for (const [action, label] of Object.entries(actions)) {
      const n = select([0, 1, 2, 3, 4, 5, 8, 9, 10, 11].map(i => [String(i), 'Botão ' + i]), String(app.gamepad.mapping[action]));
      n.onchange = () => {
        const index = +n.value,
          other = Object.keys(app.gamepad.mapping).find(k => k !== action && app.gamepad.mapping[k] === index);
        if (other) app.gamepad.mapping[other] = app.gamepad.mapping[action];
        app.gamepad.mapping[action] = index;
        changed();
        settingsPanel();
      };
      body.append(field(label, n));
    }
    body.append(help('Eixos e gatilhos seguem o layout Xbox padrão. Os mapas são salvos neste navegador. O seletor de arquivos é nativo do sistema, cuja operação depende do ambiente.'));
  });
}
$('#settings-open').onclick = settingsPanel;
import('./generation/controller.js').then(()=>import('./voice-controller.js')).catch(e => notify(e.message));
