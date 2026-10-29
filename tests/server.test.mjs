import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/index.mjs';
import { Jobs } from '../server/jobs.mjs';
test('HTTP service serves modules, rejects CSRF/foreign origins, keeps secrets private', async () => {
  const monitor = {
      listeners: new Set(),
      start: async () => {
        throw new Error('monitor unavailable');
      },
      stop() {}
    },
    jobs = new Jobs({
      providers: new Map()
    });
  const server = createApp({
    monitor,
    jobs
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.equal((await fetch(base + '/')).status, 200);
    const r = await fetch(base + '/src/app.js');
    assert.match(r.headers.get('content-type'), /javascript/);
    assert.equal((await fetch(base + '/.env')).status, 404);
    assert.equal((await fetch(base + '/server/providers.mjs')).status, 404);
    assert.equal((await fetch(base + '/api/session', {
      headers: {
        Origin: 'https://evil.example'
      }
    })).status, 403);
    const session = await fetch(base + '/api/session').then(r => r.json());
    assert.ok(session.token);
    assert.deepEqual(session.providers, []);
    assert.equal((await fetch(base + '/api/audio/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: '{}'
    })).status, 403);
    const fail = await fetch(base + '/api/audio/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Instrument-Token': session.token
      },
      body: '{}'
    });
    assert.equal(fail.status, 400);
    assert.match((await fail.json()).error, /monitor unavailable/);
  } finally {
    server.closeAllConnections();
    await new Promise(r => server.close(r));
  }
});
