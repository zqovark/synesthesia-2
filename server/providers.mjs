import { randomInt } from 'node:crypto';
import { cloudProviders } from './cloud-providers.mjs';
export function validateRequest(input) {
  if (typeof input?.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 4000) throw new Error('Prompt deve ter de 1 a 4000 caracteres.');
  const seed = input.seed === 0 || input.seed === undefined ? randomInt(1, 2147483647) : input.seed;
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > 2147483647) throw new Error('Seed deve ser um inteiro entre 1 e 2147483647 (0 sorteia).');
  const steps = input.steps ?? 25,
    cfg = input.cfg ?? 5;
  if (!Number.isInteger(steps) || steps < 5 || steps > 100 || !Number.isFinite(cfg) || cfg < 1 || cfg > 9) throw new Error('Use 5–100 passos e orientação entre 1 e 9.');
  return {
    prompt: input.prompt.trim(),
    negative: String(input.negative ?? '').slice(0, 1000),
    seed,
    steps,
    cfg
  };
}
export async function responseJson(response) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(response.status === 401 || response.status === 403 ? 'Credencial ou permissão recusada pelo provedor.' : response.status === 429 ? 'Limite do provedor atingido. Tente mais tarde.' : 'Provedor retornou HTTP ' + response.status + '. Nenhuma repetição automática foi feita.');
  }
  // Bound untrusted upstream bodies, including chunked responses.
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  for (;;) {
    const {
      done,
      value
    } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 30 * 1024 * 1024) {
      await reader.cancel();
      throw new Error('Resposta do provedor excede 30 MB.');
    }
    chunks.push(Buffer.from(value));
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
export function image(base64) {
  if (typeof base64 !== 'string' || base64.length > 28 * 1024 * 1024) throw new Error('Provedor não retornou uma imagem válida.');
  const data = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  let type;
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) type = 'image/png';else if (data[0] === 255 && data[1] === 216 && data[2] === 255) type = 'image/jpeg';else if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') type = 'image/webp';else throw new Error('Formato de imagem inválido na resposta do provedor.');
  return {
    data,
    type
  };
}
export function createProviders(env = process.env, fetcher = fetch) {
  const providers = cloudProviders(env, fetcher);
  const local = env.A1111_URL;
  if (local) {
    const url = new URL(local);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) throw new Error('A1111_URL deve apontar para um serviço HTTP local.');
    const dimensions = {};
    for (const key of ['A1111_WIDTH', 'A1111_HEIGHT']) {
      const value = env[key] === undefined ? 1024 : Number(env[key]);
      if (!Number.isInteger(value) || value < 256 || value > 2048 || value % 8 !== 0) throw new Error(key + ' deve ser um inteiro múltiplo de 8 entre 256 e 2048.');
      dimensions[key] = value;
    }
    providers.set('a1111', {
      id: 'a1111',
      name: 'Local · AUTOMATIC1111',
      model: env.A1111_MODEL ?? 'checkpoint do servidor local',
      configured: true,
      paid: false,
      async generate(p, signal) {
        const payload = {
          prompt: p.prompt,
          negative_prompt: p.negative,
          seed: p.seed,
          steps: p.steps,
          cfg_scale: p.cfg,
          width: dimensions.A1111_WIDTH,
          height: dimensions.A1111_HEIGHT,
          batch_size: 1,
          n_iter: 1,
          sampler_name: 'Euler a',
          ...(env.A1111_MODEL ? {
            override_settings: {
              sd_model_checkpoint: env.A1111_MODEL
            }
          } : {})
        };
        const result = await responseJson(await fetcher(new URL('/sdapi/v1/txt2img', url), {
          method: 'POST',
          redirect: 'error',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal
        }));
        let info = {};
        try {
          info = JSON.parse(result.info ?? '{}');
        } catch {}
        return {
          ...image(result.images?.[0]),
          actualSeed: info.seed ?? p.seed,
          actualModel: info.sd_model_name ?? info.sd_model_hash ?? null,
          parameters: payload
        };
      }
    });
  }
  return providers;
}
