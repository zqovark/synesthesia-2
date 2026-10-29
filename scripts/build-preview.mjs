import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
export async function buildPreview(destination = path.join(root, 'dist')) {
  await rm(destination, {recursive: true, force: true});
  await mkdir(destination, {recursive: true});
  await cp(path.join(root, 'src'), path.join(destination, 'src'), {recursive: true});
  await cp(path.join(root, 'style.css'), path.join(destination, 'style.css'));
  await cp(path.join(root, 'decks.css'), path.join(destination, 'decks.css'));
  const html = (await readFile(path.join(root, 'index.html'), 'utf8')).replace('<html lang="pt-BR">', '<html lang="pt-BR" data-mode="preview">');
  await writeFile(path.join(destination, 'index.html'), html);
  await writeFile(path.join(destination, '.nojekyll'), '');
  return destination;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log('Static preview: ' + await buildPreview());
