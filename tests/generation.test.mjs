import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProviders, validateRequest } from '../server/providers.mjs';
import { Jobs } from '../server/jobs.mjs';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH1kAAAAASUVORK5CYII=';
const until = async predicate => {
  for (let i = 0; i < 100 && !predicate(); i++) await new Promise(r => setTimeout(r, 5));
  assert.ok(predicate());
};
test('NVIDIA adapter sends the documented image-generation contract and metadata', async () => {
  let request;
  const providers = createProviders({
    NVIDIA_API_KEY: 'test-secret'
  }, async (url, options) => {
    request = {
      url,
      options,
      body: JSON.parse(options.body)
    };
    return new Response(JSON.stringify({
      artifacts: [{
        base64: png,
        seed: 42,
        finishReason: 'SUCCESS'
      }]
    }));
  });
  const p = providers.get('nvidia-sdxl'),
    result = await p.generate(validateRequest({
      prompt: 'cosmos',
      seed: 42
    }), new AbortController().signal);
  assert.equal(request.url, 'https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl');
  assert.equal(request.body.seed, 42);
  assert.equal(request.body.text_prompts[0].text, 'cosmos');
  assert.equal(result.type, 'image/png');
  assert.equal(result.actualSeed, 42);
  assert.ok(!JSON.stringify(result).includes('test-secret'));
});
test('provider errors are actionable and do not expose credentials', async () => {
  const p = createProviders({
    NVIDIA_API_KEY: 'secret'
  }, async () => new Response('upstream secret', {
    status: 401
  })).get('nvidia-sdxl');
  await assert.rejects(p.generate(validateRequest({
    prompt: 'x'
  })), /Credencial/);
  assert.throws(() => validateRequest({
    prompt: 'x',
    seed: -2
  }));
  assert.throws(() => validateRequest({
    prompt: 'x',
    cfg: 100
  }));
  assert.throws(() => createProviders({
    A1111_URL: 'https://remote.example.com'
  }));
});
test('jobs isolate failures, cancel without accepting late results, and enforce explicit consent', async () => {
  let release;
  const fake = {
    id: 'fake',
    name: 'fake',
    configured: true,
    model: 'test',
    generate: () => new Promise(r => release = r)
  };
  const jobs = new Jobs({
    providers: new Map([['fake', fake]])
  });
  try {
    assert.throws(() => jobs.create({
      provider: 'fake',
      prompt: 'x'
    }), /Confirme/);
    const j = jobs.create({
      provider: 'fake',
      prompt: 'x',
      confirmed: true
    });
    await until(() => !!release);
    assert.throws(() => jobs.create({
      provider: 'fake',
      prompt: 'x',
      confirmed: true
    }), /andamento/);
    jobs.cancel(j.id);
    release({
      data: Buffer.from('late'),
      type: 'image/png'
    });
    await until(() => !jobs.busy);
    assert.equal(jobs.jobs.get(j.id).state, 'cancelled');
    assert.ok(!jobs.jobs.get(j.id).result);
    fake.generate = async () => {
      throw new Error('offline');
    };
    const failed = jobs.create({
      provider: 'fake',
      prompt: 'x',
      confirmed: true
    });
    await until(() => !jobs.busy);
    assert.equal(jobs.jobs.get(failed.id).error, 'offline');
  } finally {
    jobs.dispose();
  }
});
test('timeout fails and aborts provider; result storage expires', async () => {
  let aborted = false;
  const fake = {
    id: 'fake',
    configured: true,
    model: 'test',
    generate: (p, signal) => new Promise((resolve, reject) => signal.addEventListener('abort', () => {
      aborted = true;
      reject(new Error('aborted'));
    }))
  };
  const jobs = new Jobs({
    providers: new Map([['fake', fake]]),
    timeout: 15,
    ttl: 100
  });
  try {
    const j = jobs.create({
      provider: 'fake',
      prompt: 'x',
      confirmed: true
    });
    await until(() => !jobs.busy);
    assert.equal(jobs.jobs.get(j.id).state, 'failed');
    assert.ok(aborted);
    jobs.jobs.get(j.id).created -= 1000;
    jobs.expire();
    assert.equal(jobs.jobs.size, 0);
  } finally {
    jobs.dispose();
  }
});
