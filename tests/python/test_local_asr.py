"""Contract tests for scripts/local_asr.py using an injected fake engine (no model download)."""
import io
import sys
import threading
import time
import types
import unittest
import wave
from unittest import mock
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import local_asr as asr  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

TOKEN = 'test-token-with-enough-entropy'
AUTH = {'Authorization': 'Bearer ' + TOKEN}


def make_wav(frames=16000, rate=16000, channels=1, width=2, comptype='NONE'):
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as w:
        w.setnchannels(channels)
        w.setsampwidth(width)
        w.setframerate(rate)
        w.setnframes(0)
        w.writeframes(b'\x00\x01' * frames * channels if width == 2 else b'\x00' * frames * channels * width)
    return buffer.getvalue()


class FakeEngine:
    def __init__(self, text='um portal dourado'):
        self.text = text
        self.calls = []

    def transcribe(self, pcm, language):
        self.calls.append((len(pcm), language))
        return self.text


def upload(client, data=None, headers=None, **fields):
    data = make_wav() if data is None else data
    form = {'language': 'pt-BR', 'model': 'whisper-1', 'response_format': 'json'}
    form.update(fields)
    return client.post('/v1/audio/transcriptions', headers=headers if headers is not None else AUTH,
                       files={'file': ('voice.wav', data, 'audio/wav')}, data=form)


class PureHelpersTest(unittest.TestCase):
    def test_wav_validation_returns_pcm_for_mono_16bit_16khz(self):
        pcm = asr.parse_wav_pcm16_mono_16k(make_wav(frames=1600))
        self.assertEqual(len(pcm), 3200)

    def test_wav_validation_rejects_wrong_format_empty_and_too_long(self):
        bad = [
            b'not a wav at all',
            make_wav(channels=2),
            make_wav(width=1),
            make_wav(rate=44100),
            make_wav(frames=0),
        ]
        for data in bad:
            with self.subTest(size=len(data)):
                with self.assertRaises(asr.AudioRejected) as caught:
                    asr.parse_wav_pcm16_mono_16k(data)
                self.assertEqual(caught.exception.status, 400)
        with self.assertRaises(asr.AudioRejected) as caught:
            asr.parse_wav_pcm16_mono_16k(make_wav(frames=asr.MAX_SAMPLES + 1))
        self.assertEqual(caught.exception.status, 413)

    def test_language_defaults_to_portuguese_and_normalizes_pt_br(self):
        self.assertEqual(asr.normalize_language(None), 'pt')
        self.assertEqual(asr.normalize_language(''), 'pt')
        self.assertEqual(asr.normalize_language('pt-BR'), 'pt')
        self.assertEqual(asr.normalize_language('pt_br'), 'pt')
        self.assertEqual(asr.normalize_language('PT'), 'pt')
        with self.assertRaises(asr.AudioRejected):
            asr.normalize_language('en')

    def test_inference_gate_rejects_second_holder_until_released(self):
        gate = asr.InferenceGate()
        self.assertTrue(gate.try_acquire())
        self.assertFalse(gate.try_acquire())
        gate.release()
        self.assertTrue(gate.try_acquire())
        gate.release()

    def test_bearer_check_is_exact_and_fails_closed_without_token(self):
        self.assertTrue(asr.bearer_matches('Bearer ' + TOKEN, TOKEN))
        self.assertFalse(asr.bearer_matches(None, TOKEN))
        self.assertFalse(asr.bearer_matches('Basic ' + TOKEN, TOKEN))
        self.assertFalse(asr.bearer_matches('Bearer wrong', TOKEN))
        self.assertFalse(asr.bearer_matches('Bearer ' + TOKEN, ''))
        self.assertFalse(asr.bearer_matches('Bearer ', ''))


class ServiceTest(unittest.TestCase):
    def make_client(self, engine=None, factory=None):
        engine = engine or FakeEngine()
        app = asr.create_app(TOKEN, factory or (lambda: engine))
        client = TestClient(app)
        client.__enter__()
        self.addCleanup(client.__exit__, None, None, None)
        return client, engine

    def test_create_app_refuses_missing_or_blank_token(self):
        for token in [None, '', '   ']:
            with self.subTest(token=token):
                with self.assertRaises(RuntimeError):
                    asr.create_app(token, lambda: FakeEngine())

    def test_health_reports_readiness_without_paths_or_secrets(self):
        client, _ = self.make_client()
        response = client.get('/health')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok', 'ready': True})
        self.assertNotIn(TOKEN, response.text)

    def test_failed_model_load_is_not_ready_and_transcription_is_unavailable(self):
        def broken():
            raise OSError('model missing')

        with self.assertLogs('local_asr', 'ERROR'):
            client, _ = self.make_client(factory=broken)
        self.assertEqual(client.get('/health').json(), {'status': 'ok', 'ready': False})
        response = upload(client)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('model missing', response.text)

    def test_transcription_requires_the_exact_bearer_token(self):
        client, engine = self.make_client()
        for headers in [{}, {'Authorization': 'Bearer nope'}, {'Authorization': 'Basic ' + TOKEN}]:
            with self.subTest(headers=headers):
                response = upload(client, headers=headers)
                self.assertEqual(response.status_code, 401)
                self.assertNotIn(TOKEN, response.text)
        self.assertEqual(engine.calls, [])

    def test_json_response_contains_text_only_and_defaults_to_portuguese(self):
        client, engine = self.make_client()
        response = upload(client)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'text': 'um portal dourado'})
        self.assertEqual(engine.calls, [(32000, 'pt')])

    def test_text_response_format_returns_plain_text(self):
        client, _ = self.make_client()
        response = upload(client, response_format='text')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.headers['content-type'].startswith('text/plain'))
        self.assertEqual(response.text, 'um portal dourado')

    def test_unsupported_language_and_response_format_are_rejected(self):
        client, engine = self.make_client()
        self.assertEqual(upload(client, language='en').status_code, 400)
        self.assertEqual(upload(client, response_format='srt').status_code, 400)
        self.assertEqual(engine.calls, [])

    def test_invalid_audio_is_rejected_before_inference(self):
        client, engine = self.make_client()
        for data in [b'RIFF????WAVEjunk', make_wav(channels=2), make_wav(rate=8000), make_wav(frames=0)]:
            with self.subTest(size=len(data)):
                self.assertEqual(upload(client, data=data).status_code, 400)
        self.assertEqual(engine.calls, [])

    def test_audio_longer_than_twenty_seconds_or_oversized_body_is_refused(self):
        client, engine = self.make_client()
        self.assertEqual(upload(client, data=make_wav(frames=asr.MAX_SAMPLES + 1)).status_code, 413)
        huge = b'0' * (asr.MAX_BODY_BYTES + 10)
        response = client.post('/v1/audio/transcriptions', headers=AUTH,
                               files={'file': ('voice.wav', huge, 'audio/wav')}, data={'language': 'pt'})
        self.assertEqual(response.status_code, 413)
        self.assertEqual(engine.calls, [])

    def test_requests_without_content_length_are_refused_before_parsing(self):
        client, engine = self.make_client()
        response = client.post('/v1/audio/transcriptions', headers=AUTH,
                               content=iter([b'--x--', b'more']))
        self.assertEqual(response.status_code, 411)
        self.assertEqual(engine.calls, [])

    def test_silence_or_empty_recognition_is_an_error_not_fabricated_text(self):
        for text in ['', '   ']:
            with self.subTest(text=repr(text)):
                client, _ = self.make_client(FakeEngine(text))
                response = upload(client)
                self.assertEqual(response.status_code, 422)
                self.assertNotIn('text', response.json())

    def test_inference_runs_off_the_event_loop_and_busy_requests_are_rejected(self):
        started = threading.Event()
        release = threading.Event()

        class SlowEngine(FakeEngine):
            def transcribe(self, pcm, language):
                started.set()
                release.wait(5)
                return 'lento'

        client, _ = self.make_client(SlowEngine())
        first = {}
        worker = threading.Thread(target=lambda: first.update(response=upload(client)))
        worker.start()
        self.assertTrue(started.wait(5))
        begin = time.monotonic()
        self.assertEqual(client.get('/health').status_code, 200)
        self.assertLess(time.monotonic() - begin, 2)
        busy = upload(client)
        self.assertEqual(busy.status_code, 503)
        release.set()
        worker.join(5)
        self.assertEqual(first['response'].status_code, 200)
        self.assertEqual(first['response'].json(), {'text': 'lento'})
        self.assertEqual(upload(client).status_code, 200)


class FasterWhisperEngineTest(unittest.TestCase):
    def test_engine_is_cpu_int8_local_only_and_drops_no_speech_segments(self):
        calls = {}

        class Segment:
            def __init__(self, text, no_speech_prob):
                self.text = text
                self.no_speech_prob = no_speech_prob

        class FakeModel:
            def __init__(self, path, **kwargs):
                calls['init'] = (path, kwargs)

            def transcribe(self, audio, **kwargs):
                calls['audio'] = (str(audio.dtype), len(audio), float(audio.max()), kwargs)
                return iter([Segment(' olá ', 0.1), Segment('ruído', 0.95), Segment(' mundo', 0.2), Segment(' real', 0.736)]), None

        fake = types.ModuleType('faster_whisper')
        fake.WhisperModel = FakeModel
        with mock.patch.dict(sys.modules, {'faster_whisper': fake}):
            engine = asr.FasterWhisperEngine('/models/pt-ct2')
            text = engine.transcribe(b'\x00\x40\x00\x00', 'pt')
        path, kwargs = calls['init']
        self.assertEqual(path, '/models/pt-ct2')
        self.assertEqual(kwargs, {'device': 'cpu', 'compute_type': 'int8', 'cpu_threads': 4, 'num_workers': 1, 'local_files_only': True})
        dtype, length, peak, transcribe_kwargs = calls['audio']
        self.assertEqual((dtype, length), ('float32', 2))
        self.assertAlmostEqual(peak, 16384 / 32768)
        self.assertEqual(transcribe_kwargs['language'], 'pt')
        self.assertEqual(text, 'olá mundo real')


if __name__ == '__main__':
    unittest.main()
