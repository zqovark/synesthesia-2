import { vertex, fragment } from './shaders.js';
export class Renderer {
  constructor(canvas, onError = () => {}) {
    this.canvas = canvas;
    this.onError = onError;
    this.gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance'
    });
    if (!this.gl) throw new Error('WebGL 2 indisponível. Habilite aceleração gráfica.');
    this.cache = new Map();
    this.current = [null, null];
    this.previous = [null, null];
    this.ticket = 0;
    this.changed = 0;
    this.dead = false;
    this.init();
    this.lost = e => {
      e.preventDefault();
      this.onError('Contexto GPU perdido. Aguardando restauração.');
    };
    this.restored = () => {
      this.ticket++;
      this.cache.clear();
      this.current = [null, null];
      this.previous = [null, null];
      this.init();
      this.onError('GPU restaurada. Selecione novamente suas imagens.');
    };
    canvas.addEventListener('webglcontextlost', this.lost);
    canvas.addEventListener('webglcontextrestored', this.restored);
  }
  init() {
    const gl = this.gl;
    const compile = (type, source) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const msg = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw new Error(msg);
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, vertex),
      fs = compile(gl.FRAGMENT_SHADER, fragment);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(this.program, 'position');
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    this.uniforms = Object.fromEntries(['resolution', 'time', 'blend', 'linearBlend', 'displacement', 'spiral', 'rings', 'tunnel', 'symmetry', 'zoom', 'brightness', 'luminance', 'pulse', 'transition', 'present', 'layerActive', 'variants', 'texA', 'texB', 'oldA', 'oldB'].map(k => [k, gl.getUniformLocation(this.program, k)]));
    this.fallback = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.fallback);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }
  async load(asset) {
    if (!asset) return null;
    if (asset.id.startsWith('builtin-')) return asset.id;
    if (this.cache.has(asset.id)) return asset.id;
    const url = URL.createObjectURL(asset.blob),
      img = new Image();
    try {
      img.src = url;
      await img.decode();
      if (this.dead) return null;
      const gl = this.gl;
      // Cap decoded uploads before allocating GPU memory; browser decoding is outside the render loop.
      const scale = Math.min(1, 2048 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // Concurrent requests for the same asset must release the superseded allocation.
      if (this.cache.has(asset.id)) gl.deleteTexture(tex);else this.cache.set(asset.id, tex);
      return asset.id;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async setImages(assets, {immediate=false} = {}) {
    const ticket = ++this.ticket;
    this.pending ??= new Map();
    this.pending.set(ticket, new Set(assets.filter(Boolean).map(a => a.id)));
    try {
      const ids = await Promise.all([this.load(assets[0]), this.load(assets[1])]);
      if (ticket !== this.ticket || this.dead) return;
      this.previous = immediate ? [null,null] : this.current;
      this.current = ids;
      this.changed = performance.now() - (immediate ? 1000 : 0);
    } finally {
      this.pending.delete(ticket);
      this.prune();
    }
  }
  prune() {
    const keep = new Set([...this.current, ...this.previous, ...Array.from(this.pending?.values() ?? []).flatMap(set => [...set])]);
    for (const [id, tex] of this.cache) if (!keep.has(id)) {
      this.gl.deleteTexture(tex);
      this.cache.delete(id);
    }
  }
  render(params, scene, time, beat = 0) {
    const gl = this.gl;
    if (this.dead || gl.isContextLost()) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5),
      w = Math.max(1, Math.round(this.canvas.clientWidth * dpr)),
      h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.resolution, w, h);
    gl.uniform1f(this.uniforms.time, time);
    gl.uniform1f(this.uniforms.linearBlend,scene.transport?.enabled?1:0);
    for (const [key, value] of Object.entries(params)) gl.uniform1f(this.uniforms[key], value);
    gl.uniform1f(this.uniforms.luminance, scene.luminance);
    gl.uniform1f(this.uniforms.pulse, beat * scene.pulse);
    const t = Math.min(1, (performance.now() - this.changed) / 800);
    gl.uniform1f(this.uniforms.transition, t * t * (3 - 2 * t));
    const ids = [...this.current, ...this.previous];
    gl.uniform4f(this.uniforms.present, ...ids.map(id => id && this.cache.has(id) ? 1 : 0));
    gl.uniform4f(this.uniforms.layerActive, ...ids.map(id => id ? 1 : 0));
    gl.uniform4f(this.uniforms.variants, ...ids.map(id => id === 'builtin-1' ? 1 : 0));
    ['texA', 'texB', 'oldA', 'oldB'].forEach((key, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.cache.get(ids[i]) ?? this.fallback);
      gl.uniform1i(this.uniforms[key], i);
    });
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (t === 1 && this.previous.some(Boolean)) {
      this.previous = [null, null];
      this.prune();
    }
  }
  dispose() {
    this.dead = true;
    this.ticket++;
    for (const tex of this.cache.values()) this.gl.deleteTexture(tex);
    this.cache.clear();
    this.gl.deleteTexture(this.fallback);
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    this.canvas.removeEventListener('webglcontextrestored', this.restored);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
