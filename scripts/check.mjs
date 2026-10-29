import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function scan(dir) {
  for (const e of await readdir(dir, {
    withFileTypes: true
  })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) await scan(p);else if (/\.(m?js)$/.test(p)) {
      const r = spawnSync(process.execPath, ['--check', p], {
        stdio: 'inherit'
      });
      if (r.status) process.exit(r.status);
    }
  }
}
for (const dir of ['src', 'server', 'scripts', 'tests']) await scan(dir);
console.log('All JavaScript modules pass syntax checks.');
