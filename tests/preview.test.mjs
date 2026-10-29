import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildPreview} from '../scripts/build-preview.mjs';
test('static build supports a Pages subdirectory and excludes service and credentials', async()=>{
  const temp=await mkdtemp(path.join(tmpdir(),'synesthesia-preview-'));
  try {
    await buildPreview(temp);
    const files=await readdir(temp),html=await readFile(path.join(temp,'index.html'),'utf8');
    assert.deepEqual(files.sort(),['.nojekyll','index.html','src','style.css']);
    assert.match(html,/data-mode="preview"/);
    assert.match(html,/src="\.\/src\/app.js"/);
    assert.match(html,/href="\.\/style.css"/);
    assert.ok(!files.includes('server')&&!files.includes('.env'));
    assert.match(await readFile(path.join(temp,'src/runtime.js'),'utf8'),/dataset.mode === 'preview'/);
  } finally { await rm(temp,{recursive:true,force:true}); }
});
