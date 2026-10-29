import { app, $, el, input, field, select, button, help, panelError, openDrawer, notify, safe, addImage } from '../app.js';
import { PRESETS } from './presets.js';
import { STATIC_PREVIEW } from '../runtime.js';
let presets = structuredClone(PRESETS),
  selected = presets[0].id,
  draft = {
    ...presets[0]
  },
  provider = '',
  job = null,
  jobName = 'Nova matéria',
  poll = null,
  saving = false,
  pending = false,
  completion = null,
  generationEpoch = 0,
  destination = 'composition',
  sourceMetadata = {};
if (app.db) {
  const saved = await app.db.get('settings', 'generation').catch(() => null);
  if (Array.isArray(saved?.presets) && saved.presets.length) presets = saved.presets;
  draft = {
    ...presets[0]
  };
  selected = draft.id;
  provider = typeof saved?.provider === 'string' ? saved.provider : '';
}
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] % 2147483646 + 1;
async function persist() {
  await app.db?.put('settings', {
    id: 'generation',
    presets,
    provider
  });
}
async function providers() {
  const r = await fetch('/api/session');
  if (!r.ok) throw new Error('Não foi possível consultar os provedores.');
  const list = (await r.json()).providers ?? [];
  if (!list.some(p => p.id === provider)) provider = (list.find(p => p.configured && p.paid === false) ?? list.find(p => p.configured) ?? list[0])?.id ?? '';
  const limit = list.find(p => p.id === provider)?.limits?.cfgMax;
  if (limit && draft.cfg > limit) draft.cfg = limit;
  return list;
}
async function providerControls(container, onChange = () => {}) {
  if (STATIC_PREVIEW) {
    container.append(help('NVIDIA Cosmos3 Nano (Free Endpoint), OpenAI, Google Gemini, Black Forest Labs, fal.ai e Replicate estão disponíveis na versão local.'));
    return;
  }
  const list = await providers();
  if (!container.isConnected) return;
  const choice = select(list.map(p => [p.id, p.name + (p.configured ? ' · conectado' : ' · configurar chave')]), provider);
  choice.id = 'image-provider';
  const details = el('div');
  const update = () => {
    details.replaceChildren();
    const adapter = list.find(p => p.id === provider);
    if (!adapter) return;
    details.append(help('Modelo: ' + adapter.model));
    if (adapter.note) details.append(help(adapter.note));
    onChange(adapter);
    if (!adapter.keyEnv) {
      details.append(help('Configuração pelo serviço local (.env).'));
      return;
    }
    const link = el('a', '', 'Obter chave de ' + adapter.name.split(' · ')[0] + ' ↗');
    link.href = adapter.setupUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const key = input('password');
    key.id = 'provider-api-key';
    key.autocomplete = 'off';
    key.maxLength = 512;
    const save = button('Usar chave nesta sessão', async () => {
      if (!key.value.trim()) throw new Error('Informe uma chave de API.');
      const secret = key.value;
      key.value = '';
      await app.api('/api/providers/' + adapter.id, { apiKey: secret });
      adapter.configured = true;
      choice.options[choice.selectedIndex].textContent = adapter.name + ' · conectado';
      update();
      notify('Chave configurada até encerrar o serviço local.');
    });
    details.append(link, field('Chave de API · ' + adapter.keyEnv, key), save,
      help('A chave fica na memória do serviço local até ele encerrar. Para manter a configuração, use o arquivo .env.'));
    if (adapter.configured) details.append(button('Remover chave da sessão', async () => {
      await app.api('/api/providers/' + adapter.id, { apiKey: '' });
      adapter.configured = false;
      choice.options[choice.selectedIndex].textContent = adapter.name + ' · configurar chave';
      update();
    }));
  };
  choice.onchange = safe(async () => {
    provider = choice.value;
    update();
    await persist();
  });
  container.append(field('Provedor de imagens · texto e voz', choice), details);
  update();
}
async function startGeneration(request, name, target = 'composition', metadata = {}) {
  if (pending || saving || job?.state === 'running') throw new Error('Uma geração já está em andamento.');
  pending = true;
  const epoch = ++generationEpoch;
  try {
    jobName = name;
    destination = target;
    sourceMetadata = metadata;
    job = await app.api('/api/jobs', request);
    if (epoch !== generationEpoch) {
      await app.api('/api/jobs/' + job.id + '/cancel', {});
      job.state = 'cancelled';
      throw new Error('Geração cancelada.');
    }
    const result = new Promise((resolve, reject) => completion = {
      resolve,
      reject
    });
    watch();
    renderJob();
    notify('Geração em segundo plano. O instrumento continua disponível.');
    return await result;
  } finally {
    pending = false;
  }
}
app.generation = {
  providerControls,
  get busy() {
    return pending || saving || job?.state === 'running';
  },
  async generateNext(text) {
    if (STATIC_PREVIEW) throw new Error('Geração por voz disponível na versão local.');
    const epoch = generationEpoch;
    const list = await providers();
    if (epoch !== generationEpoch) throw new Error('Geração cancelada.');
    const adapter = list.find(p => p.id === provider && p.configured);
    if (!adapter) throw new Error('Configure a chave do provedor selecionado antes de usar a voz.');
    return startGeneration({
      ...draft,
      prompt: text,
      seed: randomSeed(),
      provider: adapter.id,
      confirmed: true
    }, text.slice(0, 70), 'next', {
      input: 'voice',
      spokenPrompt: text
    });
  },
  async cancel() {
    ++generationEpoch;
    clearTimeout(poll);
    try {
      if (job?.state === 'running') {
        job = await app.api('/api/jobs/' + job.id + '/cancel', {});
        renderJob();
      }
    } finally {
      completion?.reject(new Error('Geração cancelada.'));
      completion = null;
    }
  }
};
function panel() {
  openDrawer('Dar forma ao invisível', body => {
    body.append(help('Presets são direções artísticas editáveis. As famílias bíblicas são interpretações visuais, sem pretensão histórica ou canônica.'));
    const preset = select(presets.map(p => [p.id, p.category + ' · ' + p.name]), selected);
    preset.onchange = () => {
      selected = preset.value;
      draft = {
        ...presets.find(p => p.id === selected)
      };
      panel();
    };
    body.append(field('Ponto de partida', preset));
    const prompt = el('textarea');
    prompt.dataset.pad = '';
    prompt.value = draft.prompt;
    prompt.maxLength = 4000;
    prompt.oninput = () => draft.prompt = prompt.value;
    body.append(field('Visão / prompt livre', prompt));
    const negative = input('text', draft.negative);
    negative.maxLength = 1000;
    negative.oninput = () => draft.negative = negative.value;
    const seed = input('number', draft.seed);
    seed.min = 1;
    seed.max = 2147483647;
    seed.step = 1;
    seed.oninput = () => draft.seed = +seed.value;
    const steps = input('number', draft.steps);
    steps.min = 5;
    steps.max = 100;
    steps.oninput = () => draft.steps = +steps.value;
    const cfg = input('number', draft.cfg);
    cfg.min = 1;
    cfg.max = 9;
    cfg.step = .1;
    cfg.oninput = () => draft.cfg = +cfg.value;
    body.append(field('Evitar', negative), field('Seed', seed), button('Sortear seed / preparar variação', () => {
      draft.seed = randomSeed();
      seed.value = draft.seed;
    }), field('Passos', steps), field('Orientação ao prompt', cfg));
    const adapters = el('div');
    body.append(adapters);
    void providerControls(adapters, adapter => {
      cfg.max = adapter.limits?.cfgMax ?? 9;
      if (draft.cfg > +cfg.max) cfg.value = draft.cfg = +cfg.max;
      for (const [name, control] of [['seed', seed], ['negative', negative], ['steps', steps], ['cfg', cfg]]) {
        control.disabled = adapter.supported?.[name] === false;
        control.title = control.disabled ? 'Este provedor não oferece este parâmetro.' : '';
      }
    }).catch(e => notify(e.message));
    body.append(button('Salvar alterações no preset', async () => {
      const i = presets.findIndex(p => p.id === selected);
      presets[i] = {
        ...draft
      };
      await persist();
      notify('Preset salvo localmente.');
    }), button('Salvar como novo preset', async () => {
      draft = {
        ...draft,
        id: crypto.randomUUID(),
        name: 'Variação de ' + draft.name
      };
      presets.push(draft);
      selected = draft.id;
      await persist();
      panel();
    }));
    const consent = input('checkbox');
    consent.id = 'generation-consent';
    if (!STATIC_PREVIEW) body.append(field('Confirmo enviar este prompt ao provedor. A chamada pode consumir créditos; cancelar não garante estorno.', consent));
    const generate = button('Gerar uma imagem', async () => {
      if (!consent.checked) throw new Error('Marque a confirmação para enviar ao provedor.');
      if (job?.state === 'running') throw new Error('Uma geração já está em andamento.');
      generate.disabled = true;
      try {
        await startGeneration({
          ...draft,
          provider,
          confirmed: true
        }, draft.name);
      } finally {
        generate.disabled = false;
      }
    }, 'gold');
    generate.disabled = STATIC_PREVIEW;
    if (STATIC_PREVIEW) generate.title = 'Disponível na versão local';
    body.append(generate);
    const state = el('div', 'job-state');
    state.id = 'generation-job';
    body.append(state);
    renderJob();
    if (!STATIC_PREVIEW) body.append(help('A seed e os parâmetros ficam junto da imagem. Repeti-los não garante resultado idêntico entre versões de modelos, provedores e hardware. Fechar este painel não interrompe a geração. Resultados no serviço expiram após dez minutos.'));
    panelError(body);
  }, 'ATELIÊ DE MATÉRIA');
}
function renderJob() {
  const box = $('#generation-job');
  if (!box) return;
  box.replaceChildren();
  if (!job) {
    box.append(el('span', '', 'Nenhuma geração em andamento.'));
    return;
  }
  box.append(el('p', '', job.stage));
  if (job.error) box.append(el('p', 'error', job.error));
  if (job.state === 'running') {
    box.append(el('progress'));
    box.append(button('Cancelar geração', async () => {
      await app.generation.cancel();
    }));
  }
  if (job.state === 'completed' && job.hasImage) box.append(button('Adicionar novamente à composição', async () => {
    const r = await fetch('/api/jobs/' + job.id + '/image');
    if (!r.ok) throw new Error('Resultado expirado.');
    await addImage(await r.blob(), jobName, job.metadata);
    notify('Imagem adicionada à composição.');
  }, 'gold'));
}
function watch() {
  clearTimeout(poll);
  const epoch = generationEpoch;
  poll = setTimeout(async () => {
    try {
      if (epoch !== generationEpoch) return;
      const r = await fetch('/api/jobs/' + job.id);
      if (!r.ok) throw new Error('Geração expirada.');
      const update = await r.json();
      if (epoch !== generationEpoch) return;
      job = update;
      renderJob();
      if (job.state === 'running') {
        watch();
        return;
      }
      if (job.state === 'completed' && !saving) {
        saving = true;
        const completedJob = job,
          name = jobName;
        try {
          const r = await fetch('/api/jobs/' + completedJob.id + '/image');
          if (!r.ok) throw new Error('Imagem indisponível.');
          const blob = await r.blob(),
            metadata = {
              ...completedJob.metadata,
              ...sourceMetadata
            };
          if (epoch !== generationEpoch) return;
          const asset = destination === 'next' ? await app.queueGenerated(blob, name, metadata) : await addImage(blob, name, metadata);
          notify(destination === 'next' ? 'Imagem gerada por voz e preparada no deck B.' : 'Nova matéria gerada, salva e adicionada à composição.');
          completion?.resolve(asset);
          completion = null;
        } finally {
          saving = false;
        }
      } else if (job.error || job.state === 'cancelled') throw new Error(job.error ?? 'Geração cancelada.');
    } catch (error) {
      if (epoch !== generationEpoch) return;
      if (job?.state === 'running') job = {
        ...job,
        state: 'failed',
        stage: 'Falha na geração',
        error: error.message
      };
      renderJob();
      completion?.reject(error);
      completion = null;
      notify(error.message);
    }
  }, 800);
}
$('#generate-open').onclick = panel;
window.addEventListener('pagehide', () => clearTimeout(poll));
