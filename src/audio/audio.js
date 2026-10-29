import { bands, PulseTracker } from './dsp.js';
export class AudioEngine {
  constructor(element, api, onStatus) {
    this.element = element;
    this.api = api;
    this.onStatus = onStatus;
    this.tracker = new PulseTracker();
    this.frame = {};
    this.kind = 'none';
    this.epoch = 0;
    this.operations = Promise.resolve();
  }
  enqueue(fn) {
    const next = this.operations.then(fn);
    this.operations = next.catch(() => {});
    return next;
  }
  file(file) {
    return this.enqueue(() => this.openFile(file));
  }
  system() {
    return this.enqueue(() => this.openSystem());
  }
  stop() {
    return this.enqueue(() => this.stopNow());
  }
  async context() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.5;
      this.bytes = new Uint8Array(this.analyser.frequencyBinCount);
      this.source = this.ctx.createMediaElementSource(this.element);
      this.source.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    await this.ctx.resume();
  }
  async openFile(file) {
    const epoch = ++this.epoch;
    await this.stopSystem();
    await this.context();
    if (epoch !== this.epoch) return;
    this.element.pause();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(file);
    this.element.src = this.url;
    this.kind = 'file';
    this.tracker.reset();
    await this.element.play();
    this.onStatus('Arquivo · ' + file.name);
  }
  async openSystem() {
    ++this.epoch;
    await this.stopSystem();
    this.element.pause();
    await this.api('/api/audio/start', {});
    this.kind = 'system';
    this.tracker.reset();
    this.received = 0;
    this.events = new EventSource('/api/audio/events');
    this.events.onmessage = e => {
      const message = JSON.parse(e.data);
      if (message.error) {
        void this.stop().then(() => this.onStatus(message.error));
        return;
      }
      this.frame = message;
      this.received = performance.now();
    };
    this.events.onerror = () => {
      void this.stop().then(() => this.onStatus('Monitor desconectado. Reconecte a fonte.'));
    };
    this.onStatus('Monitor de saída · Linux');
  }
  async stopSystem() {
    this.events?.close();
    this.events = null;
    if (this.kind === 'system') await this.api('/api/audio/stop', {}).catch(() => {});
    this.kind = 'none';
    this.frame = {};
  }
  async stopNow() {
    ++this.epoch;
    this.element.pause();
    await this.stopSystem();
    this.tracker.reset();
    this.onStatus('Áudio parado');
  }
  sample(time, dt) {
    if (this.kind === 'file' && !this.element.paused && !this.element.ended) {
      this.analyser.getByteFrequencyData(this.bytes);
      const b = bands(this.bytes, this.ctx.sampleRate);
      return {
        ...b,
        ...this.tracker.sample(b.low, time, dt)
      };
    }
    if (this.kind === 'system' && performance.now() - this.received < 500) {
      const b = this.frame;
      return {
        ...b,
        ...this.tracker.sample(b.low ?? 0, time, dt)
      };
    }
    return {
      low: 0,
      mid: 0,
      high: 0,
      level: 0,
      ...this.tracker.sample(0, time, dt)
    };
  }
  async dispose() {
    await this.stop();
    this.source?.disconnect();
    this.analyser?.disconnect();
    await this.ctx?.close();
    if (this.url) URL.revokeObjectURL(this.url);
  }
}
