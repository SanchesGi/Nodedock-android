import {
  openDocumentTree,
  listFiles,
  readFile,
  exists,
} from 'react-native-saf-x';

async function checkProject(uri, name) {
  try {
    const pkgUri = `${uri.replace(/\/$/, '')}/package.json`;
    const pkgExists = await exists(pkgUri);
    if (!pkgExists) return null;

    const raw  = await readFile(pkgUri, 'utf8');
    const pkg  = JSON.parse(raw);
    const cands = [pkg.main, 'server.js', 'index.js', 'app.js'].filter(Boolean);
    let script = null;
    for (const c of cands) {
      if (await exists(`${uri.replace(/\/$/, '')}/${c}`)) { script = c; break; }
    }
    if (!script) return null;
    return {
      folderName:  name,
      name:        pkg.name || name,
      description: pkg.description || '',
      version:     pkg.version || '',
      script,
      dir: uri,
    };
  } catch { return null; }
}

export async function scanProjects(uri) {
  const found = [];
  const debug = [`URI: ${uri}`];

  const self = await checkProject(uri, uri.split('%2F').pop() || 'projeto');
  if (self) { found.push(self); debug.push(`✅ Própria pasta: ${self.name}`); }

  try {
    const items = await listFiles(uri);
    debug.push(`Itens: ${items.length}`);
    for (const item of items) {
      if (item.type !== 'directory') continue;
      const p = await checkProject(item.uri, item.name);
      if (p) { found.push(p); debug.push(`✅ ${p.name}`); }
    }
  } catch(e) {
    debug.push(`❌ listFiles: ${e.message}`);
  }

  debug.push(`Total: ${found.length}`);
  return { found, debug: debug.join('\n') };
}

// Abre o picker SAF e retorna a URI
export async function pickDirectory() {
  const result = await openDocumentTree(true);
  return result?.uri || null;
}
