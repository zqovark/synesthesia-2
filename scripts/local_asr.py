"""Local Portuguese speech-to-text service (OpenAI-compatible subset) on CPU with faster-whisper.

Audio is processed in memory and never written to disk. Only loopback is bound.
Configure with environment variables:
  LOCAL_ASR_TOKEN  required bearer token; the service refuses to start without it
  LOCAL_ASR_MODEL  required path to a local faster-whisper (CTranslate2) model directory
  LOCAL_ASR_PORT   optional, default 9000
"""
import asyncio
import hmac
import io
import logging
import os
import sys
import threading
import wave
from pathlib import Path
from typing import Callable, Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse

SAMPLE_RATE = 16000
MAX_SECONDS = 20
MAX_SAMPLES = SAMPLE_RATE * MAX_SECONDS
MAX_AUDIO_BYTES = 640044  # 44-byte WAV header + 20 s of mono 16-bit PCM at 16 kHz
MAX_BODY_BYTES = MAX_AUDIO_BYTES + 65536  # multipart framing allowance
NO_SPEECH_THRESHOLD = 0.9

log = logging.getLogger('local_asr')


class AudioRejected(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def parse_wav_pcm16_mono_16k(data):
    """Return the raw little-endian PCM bytes of a valid 20 s-or-shorter WAV, or raise AudioRejected."""
    if len(data) > MAX_AUDIO_BYTES:
        raise AudioRejected('Áudio excede 20 segundos.', 413)
    try:
        with wave.open(io.BytesIO(data), 'rb') as w:
            if w.getnchannels() != 1 or w.getsampwidth() != 2 or w.getframerate() != SAMPLE_RATE or w.getcomptype() != 'NONE':
                raise AudioRejected('Envie WAV PCM mono, 16 bits e 16 kHz.')
            frames = w.getnframes()
            if frames == 0:
                raise AudioRejected('Gravação vazia.')
            if frames > MAX_SAMPLES:
                raise AudioRejected('Áudio excede 20 segundos.', 413)
            return w.readframes(frames)
    except wave.Error as error:
        raise AudioRejected('Envie um arquivo WAV válido.') from error


def normalize_language(value):
    """Portuguese only; pt-BR / pt_BR / PT are normalized to 'pt'. Empty means Portuguese."""
    if value is None or str(value).strip() == '':
        return 'pt'
    code = str(value).strip().lower().replace('_', '-')
    if code == 'pt' or code.startswith('pt-'):
        return 'pt'
    raise AudioRejected('Somente português (pt ou pt-BR) é suportado.')


def bearer_matches(header, token):
    if not token or not header or not header.startswith('Bearer '):
        return False
    return hmac.compare_digest(header[len('Bearer '):].encode(), token.encode())


class InferenceGate:
    """Non-blocking single-slot lock: one transcription at a time, extra requests are rejected as busy."""

    def __init__(self):
        self._lock = threading.Lock()

    def try_acquire(self):
        return self._lock.acquire(blocking=False)

    def release(self):
        self._lock.release()


class FasterWhisperEngine:
    """CPU int8 faster-whisper engine. Loads only from a local directory (no network)."""

    def __init__(self, model_path):
        from faster_whisper import WhisperModel
        self.model = WhisperModel(model_path, device='cpu', compute_type='int8', cpu_threads=4, num_workers=1, local_files_only=True)

    def transcribe(self, pcm, language):
        import numpy as np
        audio = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768.0
        segments, _ = self.model.transcribe(audio, language=language, beam_size=5, vad_filter=False)
        parts = [segment.text.strip() for segment in segments if segment.no_speech_prob < NO_SPEECH_THRESHOLD]
        return ' '.join(part for part in parts if part).strip()


def create_app(token, engine_factory: Optional[Callable[[], object]]):
    if not isinstance(token, str) or not token.strip():
        raise RuntimeError('LOCAL_ASR_TOKEN é obrigatório; o serviço não inicia sem ele.')
    if engine_factory is None:
        raise RuntimeError('Informe a fábrica do motor de transcrição.')
    state = {'engine': None}
    gate = InferenceGate()

    async def lifespan(app):
        try:
            state['engine'] = await asyncio.to_thread(engine_factory)
            log.info('Modelo de transcrição carregado.')
        except Exception:
            log.exception('Falha ao carregar o modelo de transcrição.')
        yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    @app.get('/health')
    async def health():
        return {'status': 'ok', 'ready': state['engine'] is not None}

    @app.post('/v1/audio/transcriptions')
    async def transcriptions(request: Request):
        if not bearer_matches(request.headers.get('authorization'), token):
            return JSONResponse({'error': 'Não autorizado.'}, status_code=401, headers={'WWW-Authenticate': 'Bearer'})
        declared = request.headers.get('content-length')
        if declared is None:
            return JSONResponse({'error': 'Envie Content-Length.'}, status_code=411)
        if not declared.isdigit() or int(declared) > MAX_BODY_BYTES:
            return JSONResponse({'error': 'Requisição excede o limite de 20 segundos de áudio.'}, status_code=413)
        if state['engine'] is None:
            return JSONResponse({'error': 'Modelo de transcrição indisponível.'}, status_code=503)
        form = await request.form()
        try:
            language = normalize_language(form.get('language'))
            response_format = form.get('response_format') or 'json'
            if response_format not in ('json', 'text'):
                raise AudioRejected('response_format deve ser json ou text.')
            upload = form.get('file')
            if upload is None or not hasattr(upload, 'read'):
                raise AudioRejected('Envie o áudio no campo file.')
            data = await upload.read(MAX_AUDIO_BYTES + 1)
            pcm = parse_wav_pcm16_mono_16k(data)
        except AudioRejected as error:
            return JSONResponse({'error': str(error)}, status_code=error.status)
        finally:
            await form.close()
        if not gate.try_acquire():
            return JSONResponse({'error': 'Transcrição ocupada. Tente novamente.'}, status_code=503, headers={'Retry-After': '2'})
        try:
            text = await asyncio.to_thread(state['engine'].transcribe, pcm, language)
        except Exception:
            log.exception('Falha na transcrição.')
            return JSONResponse({'error': 'Falha na transcrição.'}, status_code=500)
        finally:
            gate.release()
        text = (text or '').strip()
        if not text:
            return JSONResponse({'error': 'Nenhuma fala reconhecida.'}, status_code=422)
        if response_format == 'text':
            return PlainTextResponse(text)
        return {'text': text}

    return app


def main():
    token = os.environ.get('LOCAL_ASR_TOKEN', '')
    model = os.environ.get('LOCAL_ASR_MODEL', '')
    if not token.strip():
        sys.exit('LOCAL_ASR_TOKEN é obrigatório.')
    if not model or not Path(model).is_dir():
        sys.exit('LOCAL_ASR_MODEL deve apontar para um diretório de modelo faster-whisper local.')
    import uvicorn
    logging.basicConfig(level=logging.INFO)
    app = create_app(token, lambda: FasterWhisperEngine(model))
    uvicorn.run(app, host='127.0.0.1', port=int(os.environ.get('LOCAL_ASR_PORT', '9000')), log_level='info')


if __name__ == '__main__':
    main()
