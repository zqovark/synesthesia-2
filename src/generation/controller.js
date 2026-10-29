import { app, $, el, input, field, select, button, help, panelError, openDrawer, notify, safe, addImage } from '../app.js';
import { PRESETS } from './presets.js';
import { STATIC_PREVIEW } from '../runtime.js';
let presets = structuredClone(PRESETS),
  selected = presets[0].id,
  draft = {
    ...presets[0]
  },
  provider = 'nvidia-sdxl',
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
}
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] % 2147483646 + 1;
async function persist() {
  await app.db?.put('settings', {
    id: 'generation',
    presets
  });
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
  get busy() {
    return pending || saving || job?.state === 'running';
  },
  async generateNext(text) {
    if (STATIC_PREVIEW) throw new Error('Geração por voz disponível na versão local.');
    const session = await fetch('/api/session').then(r => r.json());
    const adapter = session.providers?.find(p => p.id === provider && p.configured) ?? session.providers?.find(p => p.configured);
    if (!adapter) throw new Error('Configure um provedor de imagens antes de usar a voz.');
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
    if (job?.state === 'running') {
      job = await app.api('/api/jobs/' + job.id + '/cancel', {});
      clearTimeout(poll);
      renderJob();
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
    if (STATIC_PREVIEW) {
      adapters.append(help('A geração de imagens por IA está disponível na versão local. Neste preview, você pode editar presets e usar imagens importadas.'));
    } else fetch('/api/session').then(r => r.json()).then(data => {
      if (!adapters.isConnected) return;
      const providers = data.providers ?? [],
        p = select(providers.map(p => [p.id, p.name + (p.configured ? '' : ' · não configurado')]), provider);
      p.onchange = () => provider = p.value;
      adapters.append(field('Provedor de geração', p));
      if (!providers.some(p => p.configured)) adapters.append(help('Configure NVIDIA_API_KEY no serviço local ou A1111_URL. Imagens locais e efeitos funcionam sem conta.'));
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
  poll = setTimeout(async () => {
    try {
      const r = await fetch('/api/jobs/' + job.id);
      if (!r.ok) throw new Error('Geração expirada.');
      job = await r.json();
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
          const asset = destination === 'next' ? await app.queueGenerated(blob, name, metadata) : await addImage(blob, name, metadata);
          notify(destination === 'next' ? 'Imagem gerada por voz e preparada no deck B.' : 'Nova matéria gerada, salva e adicionada à composição.');
          completion?.resolve(asset);
          completion = null;
        } finally {
          saving = false;
        }
      } else if (job.error || job.state === 'cancelled') throw new Error(job.error ?? 'Geração cancelada.');
    } catch (error) {
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
