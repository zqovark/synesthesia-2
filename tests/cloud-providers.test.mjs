import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createProviders, validateRequest } from '../server/providers.mjs';
import { Jobs } from '../server/jobs.mjs';
import { createApp } from '../server/index.mjs';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH1kAAAAASUVORK5CYII=';
const json = value => new Response(JSON.stringify(value));
const parameters = validateRequest({ prompt: 'Um portal dourado', negative: 'text', seed: 42, steps: 30, cfg: 4 });
const cases = [
  { id: 'openai', key: 'OPENAI_API_KEY', url: 'https://api.openai.com/v1/images/generations', response: { data: [{ b64_json: png }] }, auth: ['Authorization', 'Bearer test-secret'] },
  { id: 'gemini', key: 'GEMINI_API_KEY', url: 'https://generativelanguage.googleapis.com/v1beta/interactions', response: { steps: [{ type: 'model_output', content: [{ type: 'image', data: png, mime_type: 'image/png' }] }] }, auth: ['x-goog-api-key', 'test-secret'] },
  { id: 'fal', key: 'FAL_KEY', url: 'https://fal.run/fal-ai/flux-2', response: { images: [{ url: 'data:image/png;base64,' + png }], seed: 42 }, auth: ['Authorization', 'Key test-secret'] },
  { id: 'bfl', key: 'BFL_API_KEY', url: 'https://api.bfl.ai/v1/flux-2-pro', response: { polling_url: 'https://api.bfl.ai/v1/get_result?id=123' }, auth: ['x-key', 'test-secret'] },
  { id: 'replicate', key: 'REPLICATE_API_TOKEN', url: 'https://api.replicate.com/v1/models/black-forest-labs/flux-2-pro/predictions', response: { status: 'succeeded', output: 'https://example.replicate.delivery/output.png', input: { seed: 42 } }, auth: ['Authorization', 'Bearer test-secret'] }
];
for (const c of cases) test(c.id + ': image contract, metadata, credentials and supported parameters', async () => {
  const requests = [];
  const adapter = createProviders({ [c.key]: 'test-secret' }, async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('get_result')) return json({ status: 'Ready', result: { sample: 'https://delivery.bfl.ai/test.png', seed: 42 } });
    if (String(url).endsWith('.png')) return new Response(Buffer.from(png, 'base64'));
    return json(c.response);
  }).get(c.id);
  const controller = new AbortController();
  const result = await adapter.generate(parameters, controller.signal);
  assert.equal(requests[0].url, c.url);
  assert.equal(requests[0].options.headers[c.auth[0]], c.auth[1]);
  for (const request of requests) {
    assert.equal(request.options.signal, controller.signal);
    assert.equal(request.options.redirect, 'error');
    if (request.url.endsWith('.png')) assert.equal(request.options.headers, undefined, 'image downloads must not carry the API key');
  }
  assert.equal(result.type, 'image/png');
  assert.deepEqual(result.data, Buffer.from(png, 'base64'));
  assert.ok(!JSON.stringify(result).includes('test-secret'));
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.input?.prompt ?? (typeof body.input === 'string' ? body.input : body.prompt), parameters.prompt);
  if (!adapter.supported.seed) {
    assert.equal(result.actualSeed, null);
    assert.equal(body.seed, undefined);
    assert.equal(body.steps, undefined);
    assert.equal(body.cfg, undefined);
    assert.equal(body.negative_prompt, undefined);
  } else assert.equal(result.actualSeed, 42);
  if (c.id === 'fal') {
    assert.equal(body.sync_mode, true);
    assert.equal(body.num_inference_steps, 30);
    assert.equal(body.guidance_scale, 4);
  }
  if (c.id === 'gemini') assert.equal(body.store, false);
});

test('every cloud provider handles missing keys and refuses to leak upstream error bodies', async () => {
  for (const c of cases) {
    await assert.rejects(createProviders({}).get(c.id).generate(parameters), new RegExp(c.key));
    for (const status of [401, 429, 500]) {
      let count = 0;
      const adapter = createProviders({ [c.key]: 'test-secret' }, async () => {
        count++;
        return new Response('private upstream test-secret', { status });
      }).get(c.id);
      await assert.rejects(adapter.generate(parameters), e => !e.message.includes('test-secret') && /Credencial|Limite|HTTP/.test(e.message));
      assert.equal(count, 1, 'no automatic paid retries');
    }
  }
});
test('provider content filtering, invalid images and untrusted result URLs fail safely', async () => {
  for (const [id, key, response] of [
    ['openai', 'OPENAI_API_KEY', { data: [{ b64_json: 'bm90LWltYWdl' }] }],
    ['gemini', 'GEMINI_API_KEY', { steps: [{ type: 'model_output', content: [{ type: 'text', text: 'blocked' }] }] }],
    ['fal', 'FAL_KEY', { has_nsfw_concepts: [true], images: [{ url: 'data:image/png;base64,' + png }] }],
    ['bfl', 'BFL_API_KEY', { polling_url: 'http://127.0.0.1/private' }],
    ['replicate', 'REPLICATE_API_TOKEN', { status: 'succeeded', output: 'https://evil.example/steal' }]
  ]) {
    let calls = 0;
    await assert.rejects(createProviders({ [key]: 'secret' }, async () => { calls++; return json(response); }).get(id).generate(parameters));
    assert.equal(calls, 1);
  }
});
test('Replicate polls after a long prediction and accepts array output', async () => {
  let calls = 0;
  const adapter = createProviders({ REPLICATE_API_TOKEN: 'secret' }, async (url, options) => {
    calls++;
    if (calls === 1) return json({ status: 'processing', urls: { get: 'https://api.replicate.com/v1/predictions/123' } });
    assert.equal(String(url), 'https://api.replicate.com/v1/predictions/123');
    assert.equal(options.headers.Authorization, 'Bearer secret');
    return json({ status: 'succeeded', output: ['data:image/png;base64,' + png] });
  }).get('replicate');
  assert.equal((await adapter.generate(parameters)).type, 'image/png');
  assert.equal(calls, 2);
});
test('aborting FLUX polling stops follow-up calls and cancels the delay', async () => {
  const controller = new AbortController();
  let calls = 0;
  const adapter = createProviders({ BFL_API_KEY: 'secret' }, async () => {
    if (++calls === 1) return json({ polling_url: 'https://api.bfl.ai/v1/get_result?id=123' });
    controller.abort();
    return json({ status: 'Pending' });
  }).get('bfl');
  await assert.rejects(adapter.generate(parameters, controller.signal), { name: 'AbortError' });
  assert.equal(calls, 2);
});
test('session key configuration requires authentication and never exposes or persists keys', async () => {
  const env = {};
  const jobs = new Jobs({ providers: createProviders(env) });
  const server = createApp({ jobs });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const session = await fetch(base + '/api/session').then(r => r.json());
    const configure = (apiKey, token = session.token) => fetch(base + '/api/providers/openai', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Instrument-Token': token }, body: JSON.stringify({ apiKey })
    });
    assert.equal((await configure('secret', '')).status, 403);
    assert.equal((await configure('bad\nkey')).status, 400);
    const response = await configure('session-secret');
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(!text.includes('session-secret'));
    assert.equal(JSON.parse(text).providers.find(p => p.id === 'openai').configured, true);
    assert.equal(env.OPENAI_API_KEY, undefined);
    assert.equal((await configure('')).status, 200);
    assert.equal(jobs.adapters.get('openai').configured, false);
    assert.ok(!JSON.stringify(await fetch(base + '/api/session').then(r => r.json())).includes('session-secret'));
  } finally {
    server.closeAllConnections();
    await new Promise(r => server.close(r));
  }
});
test('NVIDIA Free Endpoint generates a JPEG with the Cosmos text2image contract', async () => {
  let request;
  // The provider returns original JPEG bytes, without converting or stripping provenance.
  const jpeg = Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 255, 217]);
  const adapter = createProviders({ NVIDIA_API_KEY: 'nvidia-test-secret' }, async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return json({ b64_image: jpeg.toString('base64') });
  }).get('nvidia-cosmos');
  assert.equal(adapter.paid, false);
  assert.equal(adapter.configured, true);
  const result = await adapter.generate(parameters);
  assert.equal(request.url, 'https://ai.api.nvidia.com/v1/cosmos/nvidia/cosmos3-nano');
  assert.equal(request.options.headers.Authorization, 'Bearer nvidia-test-secret');
  assert.equal(request.body.model_mode, 'text2image');
  assert.equal(request.body.num_frames, 1);
  assert.equal(request.body.resolution, '720_16_9');
  assert.equal(request.body.num_inference_steps, 30);
  assert.equal(request.body.guidance_scale, 4);
  assert.equal(request.body.seed, 42);
  assert.deepEqual(result.data, jpeg);
  assert.equal(result.type, 'image/jpeg');
  assert.equal(result.actualSeed, null, 'requested seed is recorded separately from a seed confirmed by the provider');
  assert.ok(!JSON.stringify(result).includes('nvidia-test-secret'));
  await assert.rejects(adapter.generate({ ...parameters, cfg: 9 }), /entre 1 e 7/);
  adapter.configure('');
  await assert.rejects(adapter.generate(parameters), /NVIDIA_API_KEY/);
});
test('NVIDIA Free Endpoint handles rate limiting and filtered responses without retrying', async () => {
  for (const status of [401, 422, 429]) {
    let calls = 0;
    const adapter = createProviders({ NVIDIA_API_KEY: 'secret' }, async () => { calls++; return new Response('secret', { status }); }).get('nvidia-cosmos');
    await assert.rejects(adapter.generate(parameters), e => !e.message.includes('secret'));
    assert.equal(calls, 1);
  }
  const adapter = createProviders({ NVIDIA_API_KEY: 'secret' }, async () => json({ b64_video: 'video-instead-of-image' })).get('nvidia-cosmos');
  await assert.rejects(adapter.generate(parameters), /imagem válida/);
});

