import { responseJson, image } from './providers.mjs';

const controls = (...names) => Object.fromEntries(['seed', 'negative', 'steps', 'cfg'].map(n => [n, names.includes(n)]));
export function cloudProviders(env, fetcher) {
  env = { ...env };
  const providers = new Map();
  function add({ id, name, model, keyEnv, setupUrl, supported, note, limits, paid = true, generate }) {
    const adapter = {
      id, name, model, keyEnv, setupUrl, supported, note, limits, configured: !!env[keyEnv], paid,
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
  return providers;
}
