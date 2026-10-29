const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
export function transportConfig(config = {}) {
  const duration = clamp(Number(config.duration ?? 20), 2, 600);
  const order = [...new Set((Array.isArray(config.order) ? config.order : []).filter(id => typeof id === 'string'))].slice(0, 128);
  const durations = {};
  for (const [id, seconds] of Object.entries(config.durations ?? {}).slice(0, 128)) if (Number.isFinite(seconds)) durations[id] = clamp(seconds, 2, 600);
  return {
    enabled: config.enabled === true,
    duration,
    transition: clamp(Number(config.transition ?? 1), 0, 5),
    loop: config.loop !== false,
    order,
    durations
  };
}
/** A timeline for existing images. No generation, DOM, audio or wall-clock dependency. */
export class ImageTransport {
  constructor(config = {}) {
    this.configure(config);
    this.playing = false;
    this.elapsed = 0;
    this.ready = true;
    this.index = 0;
  }
  configure(config, available = [], selected = []) {
    this.config = transportConfig(config);
    const previous = this.current;
    const known = new Set(available);
    this.order = [...new Set([...this.config.order, ...selected, ...available])].filter(id => known.has(id));
    this.index = Math.max(0, this.order.indexOf(previous ?? selected[0]));
    this.config.order = [...this.order];
  }
  get current() {
    return this.order?.[this.index] ?? null;
  }
  get next() {
    return this.order?.[this.index + 1] ?? (this.config.loop && this.order?.length > 1 ? this.order[0] : null);
  }
  get duration() {
    return this.config.durations[this.current] ?? this.config.duration;
  }
  get transition() {
    return Math.min(this.config.transition, this.duration / 2);
  }
  get mix() {
    return this.next && this.transition > 0 ? clamp((this.elapsed - this.duration + this.transition) / this.transition) : 0;
  }
  get progress() {
    return clamp(this.elapsed / this.duration);
  }
  play() {
    if (!this.current) return false;
    if (this.elapsed >= this.duration) this.elapsed = 0;
    this.playing = true;
    return true;
  }
  pause() {
    this.playing = false;
  }
  cue() {
    this.elapsed = 0;
    this.pause();
  }
  seek(seconds) {
    this.elapsed = clamp(seconds, 0, this.duration);
  }
  select(id) {
    const i = this.order.indexOf(id);
    if (i < 0) return false;
    this.index = i;
    this.elapsed = 0;
    return true;
  }
  enqueueNext(id) {
    const active = this.current;
    if (id === active) return;
    this.order = this.order.filter(x => x !== id);
    this.index = Math.max(0, this.order.indexOf(active));
    this.order.splice(this.index + 1, 0, id);
    this.config.order = [...this.order];
  }
  advance() {
    if (!this.next) {
      this.elapsed = this.duration;
      this.pause();
      return false;
    }
    this.index = this.order.indexOf(this.next);
    this.elapsed = 0;
    return true;
  }
  tick(seconds) {
    if (!this.playing || !this.ready || !Number.isFinite(seconds) || seconds < 0) return false;
    this.elapsed += seconds;
    if (this.elapsed < this.duration) return false;
    return this.advance();
  }
}
