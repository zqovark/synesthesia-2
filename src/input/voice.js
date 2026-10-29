/** Optional push-to-talk capture, with explicit recording and browser-ASR modes. */
export class VoiceInput {
  constructor({
    mediaDevices = globalThis.navigator?.mediaDevices,
    Recorder = globalThis.MediaRecorder,
    Recognition = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition,
    onAudio = () => {},
    onText = () => {},
    onState = () => {},
    onError = () => {},
    limit = 20000
  } = {}) {
    Object.assign(this, {
      mediaDevices,
      Recorder,
      Recognition,
      onAudio,
      onText,
      onState,
      onError,
      limit
    });
    this.ticket = 0;
    this.state = 'idle';
  }
  emit(state) {
    this.state = state;
    this.onState(state);
  }
  get listening() {
    return ['permission', 'recording', 'recognizing'].includes(this.state);
  }
  async start(mode = 'recording') {
    if (this.listening) throw new Error('O microfone já está ativo.');
    const ticket = ++this.ticket;
    if (mode === 'browser') {
      if (!this.Recognition) throw new Error('Reconhecimento de voz do navegador indisponível. Use a gravação com transcrição.');
      const r = this.recognition = new this.Recognition();
      let text = '';
      r.lang = 'pt-BR';
      r.continuous = false;
      r.interimResults = true;
      r.onresult = e => {
        text = Array.from(e.results).map(result => result[0].transcript).join(' ').trim();
      };
      r.onerror = e => {
        if (ticket !== this.ticket) return;
        this.cancel();
        this.onError(new Error(e.error === 'not-allowed' ? 'Permissão do microfone negada.' : 'Reconhecimento de voz falhou: ' + e.error));
      };
      r.onend = () => {
        if (ticket !== this.ticket) return;
        clearTimeout(this.timer);
        this.recognition = null;
        this.emit('idle');
        if (text) this.onText(text);else this.onError(new Error('Nenhuma fala reconhecida.'));
      };
      this.emit('recognizing');
      try {
        r.start();
      } catch (error) {
        this.cancel();
        throw error;
      }
    } else {
      if (!this.mediaDevices?.getUserMedia || !this.Recorder) throw new Error('Gravação de voz indisponível neste navegador.');
      this.emit('permission');
      let stream;
      try {
        stream = await this.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          },
          video: false
        });
        if (ticket !== this.ticket) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        this.stream = stream;
        const chunks = [],
          mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find(m => this.Recorder.isTypeSupported?.(m));
        const r = this.recorder = new this.Recorder(stream, mime ? {
          mimeType: mime
        } : undefined);
        r.ondataavailable = e => {
          if (e.data?.size) chunks.push(e.data);
        };
        r.onerror = () => {
          if (ticket === this.ticket) {
            this.cancel();
            this.onError(new Error('Falha ao gravar o microfone.'));
          }
        };
        r.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          if (ticket !== this.ticket) return;
          clearTimeout(this.timer);
          this.recorder = null;
          this.stream = null;
          this.emit('idle');
          const blob = new Blob(chunks, {
            type: r.mimeType || mime || 'audio/webm'
          });
          if (blob.size) this.onAudio(blob);else this.onError(new Error('Gravação vazia.'));
        };
        r.start();
        this.emit('recording');
      } catch (error) {
        stream?.getTracks().forEach(t => t.stop());
        if (ticket === this.ticket) this.emit('idle');
        throw new Error(error.name === 'NotAllowedError' ? 'Permissão do microfone negada.' : error.message);
      }
    }
    this.timer = setTimeout(() => this.stop(), this.limit);
  }
  stop() {
    clearTimeout(this.timer);
    if (this.state === 'permission') {
      this.cancel();
      return;
    }
    if (this.recognition) this.recognition.stop();else if (this.recorder?.state !== 'inactive') this.recorder?.stop();
  }
  cancel() {
    ++this.ticket;
    clearTimeout(this.timer);
    this.recognition?.abort();
    this.recognition = null;
    if (this.recorder?.state !== 'inactive') this.recorder?.stop();
    this.recorder = null;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.emit('idle');
  }
}
export function pcmWav(samples, rate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2),
    view = new DataView(buffer),
    text = (at, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
    };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, Number.isFinite(samples[i]) ? samples[i] : 0));
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return new Blob([buffer], {
    type: 'audio/wav'
  });
}
export async function voiceWav(blob) {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration > 20.5) throw new Error('A gravação deve ter até 20 segundos.');
    const offline = new OfflineAudioContext(1, Math.min(320000, Math.ceil(decoded.duration * 16000)), 16000),
      source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return pcmWav(rendered.getChannelData(0));
  } finally {
    await context.close();
  }
}
