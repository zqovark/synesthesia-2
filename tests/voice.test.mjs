import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceInput, pcmWav } from '../src/input/voice.js';
import { VoiceService } from '../server/voice.mjs';
test('WAV encoding is mono 16k PCM and finite/clamped', async () => {
  const b = Buffer.from(await pcmWav([NaN, 2, -2]).arrayBuffer());
  assert.equal(b.readUInt32LE(24), 16000);
  assert.equal(b.readUInt16LE(22), 1);
  assert.equal(b.readInt16LE(44), 0);
  assert.equal(b.readInt16LE(46), 32767);
  assert.equal(b.readInt16LE(48), -32768);
});
test('cancel while microphone permission is pending stops late tracks and never records', async () => {
  let release,
    stopped = 0,
    recorded = 0;
  const v = new VoiceInput({
    mediaDevices: {
      getUserMedia: () => new Promise(r => release = r)
    },
    Recorder: class {
      constructor() {
        recorded++;
      }
    }
  });
  const p = v.start();
  v.cancel();
  release({
    getTracks: () => [{
      stop: () => stopped++
    }]
  });
  await p;
  assert.equal(stopped, 1);
  assert.equal(recorded, 0);
  assert.equal(v.listening, false);
});
test('browser recognition cancellation ignores late transcripts', async () => {
  let r,
    spoken = [];
  class Recognition {
    constructor() {
      r = this;
    }
    start() {}
    abort() {}
    stop() {}
  }
  const v = new VoiceInput({
    Recognition,
    onText: x => spoken.push(x)
  });
  await v.start('browser');
  v.cancel();
  r.onresult({
    results: [[{
      transcript: 'nebula'
    }]]
  });
  r.onend();
  assert.deepEqual(spoken, []);
});
test('ASR sends multipart server-side and exposes text without credentials', async () => {
  let payload;
  const service = new VoiceService({
    GROQ_API_KEY: 'secret'
  }, async (url, options) => {
    payload = {
      url,
      options
    };
    return new Response(JSON.stringify({
      text: 'um portal dourado'
    }));
  });
  const audio = Buffer.from(await pcmWav(new Float32Array(1600)).arrayBuffer()).toString('base64');
  const result = await service.transcribe({
    audio,
    confirmed: true
  });
  assert.equal(result.text, 'um portal dourado');
  assert.equal(payload.url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.equal(payload.options.body.get('model'), 'whisper-large-v3-turbo');
  assert.equal(payload.options.body.get('file').type, 'audio/wav');
  assert.ok(!JSON.stringify(service.status()).includes('secret'));
  await assert.rejects(service.transcribe({
    audio,
    confirmed: false
  }), /Ative/);
  await assert.rejects(service.transcribe({
    audio: 'bad',
    confirmed: true
  }), /WAV/);
});
test('ASR handles missing configuration, provider failure and empty speech', async () => {
  await assert.rejects(new VoiceService({}).transcribe({}), /Configure/);
  const audio = Buffer.from(await pcmWav([0]).arrayBuffer()).toString('base64');
  const s = new VoiceService({
    GROQ_API_KEY: 'x'
  }, async () => new Response('{}', {
    status: 401
  }));
  await assert.rejects(s.transcribe({
    audio,
    confirmed: true
  }), /Credencial/);
  const empty = new VoiceService({
    GROQ_API_KEY: 'x'
  }, async () => new Response('{"text":""}'));
  await assert.rejects(empty.transcribe({
    audio,
    confirmed: true
  }), /reconhecer/);
  assert.throws(() => new VoiceService({
    VOICE_TRANSCRIPTION_URL: 'http://example.com/asr'
  }), /HTTPS/);
});
