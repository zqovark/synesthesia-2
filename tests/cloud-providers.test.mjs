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
  { id: 'gemini', key: 'GEMINI_API_KEY', url: 'https://generativelanguage.googleapis.com/v1beta/interactions', response: { steps: [{ type: 'model_output', content: [{ type: 'image', data: png, mime_type: 'image/png' }] }] }, auth: ['x-goog-api-key', 'test-secret'] }
];
for (const c of cases) test(c.id + ': image contract, metadata, credentials and supported parameters', async () => {
  const requests = [];
  const adapter = createProviders({ [c.key]: 'test-secret' }, async (url, options) => {
    requests.push({ url: String(url), options });
    return json(c.response);
  }).get(c.id);
  const controller = new AbortController();
  const result = await adapter.generate(parameters, controller.signal);
  assert.equal(requests[0].url, c.url);
  assert.equal(requests[0].options.headers[c.auth[0]], c.auth[1]);
  assert.equal(requests[0].options.signal, controller.signal);
  assert.equal(requests[0].options.redirect, 'error');
  assert.equal(result.type, 'image/png');
  assert.deepEqual(result.data, Buffer.from(png, 'base64'));
  assert.ok(!JSON.stringify(result).includes('test-secret'));
  const body = JSON.parse(requests[0].options.body);
  assert.equal(typeof body.input === 'string' ? body.input : body.prompt, parameters.prompt);
  // Neither hosted provider exposes seed/steps/cfg/negative controls.
  assert.equal(result.actualSeed, null);
  assert.equal(body.seed, undefined);
  assert.equal(body.steps, undefined);
  assert.equal(body.cfg, undefined);
  assert.equal(body.negative_prompt, undefined);
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
test('provider content filtering and invalid images fail safely', async () => {
  for (const [id, key, response] of [
    ['openai', 'OPENAI_API_KEY', { data: [{ b64_json: 'bm90LWltYWdl' }] }],
    ['gemini', 'GEMINI_API_KEY', { steps: [{ type: 'model_output', content: [{ type: 'text', text: 'blocked' }] }] }]
  ]) {
    let calls = 0;
    await assert.rejects(createProviders({ [key]: 'secret' }, async () => { calls++; return json(response); }).get(id).generate(parameters));
    assert.equal(calls, 1);
  }
});
test('only the two hosted providers plus the optional local adapter are registered', () => {
  const ids = [...createProviders({}).keys()];
  assert.deepEqual(ids, ['openai', 'gemini']);
  assert.ok(createProviders({ A1111_URL: 'http://127.0.0.1:7860' }).has('a1111'));
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
