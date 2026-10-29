import { validateScene } from '../core/instrument.js';
export const BUILTINS = [{
  id: 'builtin-0',
  name: 'Firmamento',
  kind: 'procedural',
  metadata: {
    provider: 'local',
    model: 'GLSL cosmos',
    prompt: 'Matéria procedural local, sem chamada de IA.'
  }
}, {
  id: 'builtin-1',
  name: 'Águas profundas',
  kind: 'procedural',
  metadata: {
    provider: 'local',
    model: 'GLSL cosmos',
    prompt: 'Matéria procedural local, sem chamada de IA.'
  }
}];
export class Library {
  async open() {
    this.db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('synesthesia-2', 1);
      r.onupgradeneeded = () => {
        for (const n of ['assets', 'scenes', 'settings']) r.result.createObjectStore(n, {
          keyPath: 'id'
        });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return this;
  }
  async operation(store, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, mode),
        req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Falha ao salvar.'));
    });
  }
  async list(s) {
    return this.operation(s, 'readonly', s => s.getAll());
  }
  async get(s, id) {
    return this.operation(s, 'readonly', s => s.get(id));
  }
  async put(store, v) {
    if (store === 'scenes') v = validateScene(v);
    return this.operation(store, 'readwrite', s => s.put(v));
  }
  async remove(store, id) {
    return this.operation(store, 'readwrite', s => s.delete(id));
  }
  async addImage(blob, name, metadata = {}) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) throw new Error('Use PNG, JPEG ou WebP.');
    if (blob.size > 20 * 1024 * 1024) throw new Error('Limite de 20 MB por imagem.');
    const asset = {
      id: crypto.randomUUID(),
      name: name.slice(0, 100),
      kind: metadata.provider ? 'generated' : 'import',
      createdAt: new Date().toISOString(),
      metadata,
      blob
    };
    await this.put('assets', asset);
    return asset;
  }
  close() {
    this.db?.close();
  }
}
export function sceneEnvelope(scene, assets) {
  return {
    format: 'synesthesia-2',
    version: 1,
    scene: validateScene(scene),
    assets
  };
}
export function validateEnvelope(d) {
  if (d?.format !== 'synesthesia-2' || d.version !== 1 || !Array.isArray(d.assets) || d.assets.length > 2) throw new Error('Arquivo de cena incompatível.');
  return validateScene(d.scene);
}
