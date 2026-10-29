import { randomUUID } from 'node:crypto';
import { validateRequest, createProviders } from './providers.mjs';
import { readJson } from './index.mjs';
export class Jobs {
  constructor({
    providers = createProviders(),
    ttl = 600000,
    timeout = 180000
  } = {}) {
    this.adapters = providers;
    this.jobs = new Map();
    this.ttl = ttl;
    this.timeout = timeout;
    this.busy = false;
    this.timer = setInterval(() => this.expire(), 30000);
    this.timer.unref();
  }
  providers() {
    return [...this.adapters.values()].map(({
      id,
      name,
      model,
      configured,
      paid
    }) => ({
      id,
      name,
      model,
      configured,
      paid
    }));
  }
  expire() {
    for (const [id, job] of this.jobs) if (Date.now() - job.created > this.ttl) {
      job.controller.abort();
      this.jobs.delete(id);
    }
  }
  snapshot(j) {
    return {
      id: j.id,
      state: j.state,
      stage: j.stage,
      error: j.error,
      metadata: j.metadata,
      hasImage: !!j.result
    };
  }
  create(input) {
    this.expire();
    if (this.busy) throw new Error('Já existe uma geração em andamento.');
    if (this.jobs.size >= 10) throw new Error('Limite de resultados temporários atingido. Aguarde ou reinicie o serviço.');
    const adapter = this.adapters.get(input.provider);
    if (!adapter?.configured) throw new Error('Provedor não configurado.');
    if (input.confirmed !== true) throw new Error('Confirme explicitamente o envio ao provedor.');
    const parameters = validateRequest(input);
    const job = {
      id: randomUUID(),
      created: Date.now(),
      state: 'running',
      stage: 'Aguardando o provedor · progresso percentual indisponível',
      controller: new AbortController(),
      metadata: {
        provider: adapter.id,
        model: adapter.model,
        ...parameters,
        createdAt: new Date().toISOString(),
        reproducibility: 'Seed, modelo e parâmetros são registrados; reprodução exata depende do provedor e sua versão.'
      }
    };
    this.jobs.set(job.id, job);
    this.busy = true;
    const timeout = setTimeout(() => {
      if (job.state === 'running') {
        job.state = 'failed';
        job.stage = 'Tempo limite';
        job.error = 'Provedor excedeu ' + this.timeout / 1000 + ' segundos.';
        job.controller.abort();
      }
    }, this.timeout);
    timeout.unref();
    Promise.resolve().then(() => adapter.generate(parameters, job.controller.signal)).then(result => {
      if (job.state !== 'running') return;
      job.result = result;
      job.metadata = {
        ...job.metadata,
        actualSeed: result.actualSeed,
        actualModel: result.actualModel ?? adapter.model,
        parameters: result.parameters
      };
      job.state = 'completed';
      job.stage = 'Imagem pronta para salvar';
    }).catch(error => {
      if (job.state !== 'running') return;
      job.state = 'failed';
      job.stage = 'Falha na geração';
      job.error = error.message;
    }).finally(() => {
      clearTimeout(timeout);
      this.busy = false;
    });
    return this.snapshot(job);
  }
  cancel(id) {
    const j = this.jobs.get(id);
    if (!j) throw new Error('Geração não encontrada.');
    if (j.state === 'running') {
      j.state = 'cancelled';
      j.stage = 'Cancelada localmente; o provedor pode continuar processando ou cobrar.';
      j.controller.abort();
    }
    return this.snapshot(j);
  }
  async handle(req, res, url, json) {
    if (url.pathname === '/api/jobs' && req.method === 'POST') {
      const d = await readJson(req);
      return json(this.create(d), 202), true;
    }
    const match = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)(\/image|\/cancel)?$/);
    if (!match) return false;
    const j = this.jobs.get(match[1]);
    if (!j) return json({
      error: 'Geração expirada ou não encontrada.'
    }, 404), true;
    if (req.method === 'POST' && match[2] === '/cancel') {
      await readJson(req);
      json(this.cancel(j.id));
      return true;
    }
    if (req.method === 'GET' && match[2] === '/image') {
      if (!j.result) return json({
        error: 'Imagem indisponível.'
      }, 409), true;
      res.writeHead(200, {
        'Content-Type': j.result.type,
        'Cache-Control': 'no-store'
      });
      res.end(j.result.data);
      return true;
    }
    if (req.method === 'GET' && !match[2]) {
      json(this.snapshot(j));
      return true;
    }
    return false;
  }
  dispose() {
    clearInterval(this.timer);
    for (const j of this.jobs.values()) j.controller.abort();
    this.jobs.clear();
  }
}
