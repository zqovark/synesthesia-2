import { setTimeout as delay } from 'node:timers/promises';
import { responseJson, image } from './providers.mjs';

// Only provider-controlled HTTPS locations may receive credentials or serve images.
function trustedUrl(value, hosts) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !hosts.some(host => host.startsWith('.') ? url.hostname.endsWith(host) : url.hostname === host)) {
    throw new Error('O provedor retornou um endereço de resultado não permitido.');
  }
  return url;
}
async function download(value, hosts, fetcher, signal) {
  if (typeof value !== 'string') throw new Error('O provedor não retornou uma imagem.');
  if (/^data:image\/(png|jpeg|webp);base64,/.test(value)) return image(value);
  const response = await fetcher(trustedUrl(value, hosts), { signal, redirect: 'error' });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('Não foi possível baixar a imagem gerada (HTTP ' + response.status + ').');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 20 * 1024 * 1024) throw new Error('Imagem gerada excede 20 MB.');
    chunks.push(Buffer.from(chunk));
  }
  return image(Buffer.concat(chunks).toString('base64'));
}
const controls = (...names) => Object.fromEntries(['seed', 'negative', 'steps', 'cfg'].map(n => [n, names.includes(n)]));
export function cloudProviders(env, fetcher) {
  env = { ...env };
  const providers = new Map();
  function add({ id, name, model, keyEnv, setupUrl, supported, generate }) {
    const adapter = {
      id, name, model, keyEnv, setupUrl, supported, configured: !!env[keyEnv], paid: true,
      configure(apiKey) {
        if (typeof apiKey !== 'string' || apiKey.length > 512 || /[\r\n]/.test(apiKey)) throw new Error('Chave de API inválida.');
        env[keyEnv] = apiKey.trim();
        adapter.configured = !!env[keyEnv];
      },
      async generate(p, signal) {
        if (!env[keyEnv]) throw new Error('Configure ' + keyEnv + ' no serviço local.');
        signal?.throwIfAborted();
        // Keys exist only in headers; never return them in job metadata.
        return generate(p, signal, model, env[keyEnv]);
      }
    };
    providers.set(id, adapter);
  }
  async function post(url, headers, payload, signal) {
    return responseJson(await fetcher(url, {
      method: 'POST', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload)
    }));
  }
  add({
    id: 'openai', name: 'OpenAI · GPT Image', model: env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-flare',
    keyEnv: 'OPENAI_API_KEY', setupUrl: 'https://platform.openai.com/api-keys', supported: controls(),
    async generate(p, signal, model, key) {
      const payload = { model, prompt: p.prompt, n: 1, size: '1536x1024', quality: 'medium', output_format: 'png' };
      const r = await post('https://api.openai.com/v1/images/generations', { Authorization: 'Bearer ' + key }, payload, signal);
      return { ...image(r.data?.[0]?.b64_json), actualSeed: null, parameters: payload };
    }
  });
  add({
    id: 'gemini', name: 'Google · Gemini / Nano Banana', model: env.GEMINI_IMAGE_MODEL || 'gemini-nano-banana-2.1',
    keyEnv: 'GEMINI_API_KEY', setupUrl: 'https://aistudio.google.com/apikey', supported: controls(),
    async generate(p, signal, model, key) {
      const payload = { model, input: p.prompt, store: false, response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: '16:9' } };
      const r = await post('https://generativelanguage.googleapis.com/v1beta/interactions', { 'x-goog-api-key': key, 'Api-Revision': '2026-05-20' }, payload, signal);
      const part = r.steps?.filter(s => s.type === 'model_output').flatMap(s => s.content ?? []).find(c => c.type === 'image' && c.data);
      if (!part) throw new Error('Gemini não retornou uma imagem. O pedido pode ter sido filtrado.');
      return { ...image(part.data), actualSeed: null, parameters: payload };
    }
  });
  add({
    id: 'bfl', name: 'Black Forest Labs · FLUX.2 Pro', model: 'flux-2-pro',
    keyEnv: 'BFL_API_KEY', setupUrl: 'https://dashboard.bfl.ai/', supported: controls('seed'),
    async generate(p, signal, model, key) {
      const payload = { prompt: p.prompt, width: 1440, height: 816, seed: p.seed, output_format: 'png' };
      const r = await post('https://api.bfl.ai/v1/' + model, { 'x-key': key }, payload, signal);
      const polling = trustedUrl(r.polling_url, ['api.bfl.ai', 'api.eu.bfl.ai', 'api.us.bfl.ai']);
      for (let i = 0; i < 180; i++) {
        signal?.throwIfAborted();
        const result = await responseJson(await fetcher(polling, { headers: { 'x-key': key }, redirect: 'error', signal }));
        if (result.status === 'Ready') return {
          ...await download(result.result?.sample, ['.bfl.ai', '.blob.core.windows.net'], fetcher, signal),
          actualSeed: result.result?.seed ?? p.seed, parameters: payload
        };
        if (!['Pending', 'Processing'].includes(result.status)) throw new Error('FLUX não concluiu a imagem. O pedido pode ter sido filtrado.');
        await delay(750, undefined, { signal });
      }
      throw new Error('FLUX excedeu o tempo de espera.');
    }
  });
  add({
    id: 'fal', name: 'fal.ai · FLUX.2', model: 'fal-ai/flux-2',
    keyEnv: 'FAL_KEY', setupUrl: 'https://fal.ai/dashboard/keys', supported: controls('seed', 'steps', 'cfg'),
    async generate(p, signal, model, key) {
      const payload = { prompt: p.prompt, image_size: 'landscape_16_9', seed: p.seed, num_inference_steps: p.steps, guidance_scale: p.cfg, num_images: 1, sync_mode: true, output_format: 'png', enable_safety_checker: true };
      const r = await post('https://fal.run/' + model, { Authorization: 'Key ' + key, 'X-Fal-Store-IO': '0' }, payload, signal);
      if (r.has_nsfw_concepts?.[0]) throw new Error('A imagem foi filtrada pelo provedor.');
      return { ...await download(r.images?.[0]?.url, ['.fal.media', '.fal.ai'], fetcher, signal), actualSeed: r.seed ?? p.seed, parameters: payload };
    }
  });
  add({
    id: 'replicate', name: 'Replicate · FLUX.2 Pro', model: 'black-forest-labs/flux-2-pro',
    keyEnv: 'REPLICATE_API_TOKEN', setupUrl: 'https://replicate.com/account/api-tokens', supported: controls('seed'),
    async generate(p, signal, model, key) {
      const payload = { input: { prompt: p.prompt, aspect_ratio: '16:9', resolution: '1 MP', seed: p.seed, output_format: 'png' } };
      let r = await post('https://api.replicate.com/v1/models/' + model + '/predictions', { Authorization: 'Bearer ' + key, Prefer: 'wait=60', 'Cancel-After': '3m' }, payload, signal);
      for (let i = 0; i < 180; i++) {
        signal?.throwIfAborted();
        if (r.status === 'succeeded') return {
          ...await download(Array.isArray(r.output) ? r.output[0] : r.output, ['replicate.delivery', '.replicate.delivery'], fetcher, signal),
          actualSeed: r.input?.seed ?? p.seed, parameters: payload
        };
        if (!['starting', 'processing'].includes(r.status)) throw new Error('Replicate não concluiu a imagem. O pedido pode ter sido filtrado.');
        const polling = trustedUrl(r.urls?.get, ['api.replicate.com']);
        await delay(750, undefined, { signal });
        r = await responseJson(await fetcher(polling, { headers: { Authorization: 'Bearer ' + key }, redirect: 'error', signal }));
      }
      throw new Error('Replicate excedeu o tempo de espera.');
    }
  });
  return providers;
}
