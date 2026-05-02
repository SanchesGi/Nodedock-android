import RNFS from 'react-native-fs';

async function checkProject(uri, name) {
  try {
    // Testa package.json usando a URI direta
    const pkgUri = uri.endsWith('/') ? `${uri}package.json` : `${uri}/package.json`;
    const exists = await RNFS.exists(pkgUri);
    if (!exists) return null;

    const raw = await RNFS.readFile(pkgUri, 'utf8');
    const pkg = JSON.parse(raw);

    const candidates = [pkg.main, 'server.js', 'index.js', 'app.js'].filter(Boolean);
    let script = null;
    for (const c of candidates) {
      const scriptUri = uri.endsWith('/') ? `${uri}${c}` : `${uri}/${c}`;
      if (await RNFS.exists(scriptUri)) { script = c; break; }
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
  } catch(e) {
    return null;
  }
}

export async function scanProjects(uri) {
  const found = [];
  const debug = [`URI: ${uri}`];

  // Verifica se a própria pasta é projeto
  const self = await checkProject(uri, uri.split('/').pop() || 'projeto');
  if (self) { found.push(self); debug.push(`✅ Própria pasta: ${self.name}`); }

  // Lê subpastas via RNFS com URI direta
  try {
    const items = await RNFS.readDir(uri);
    debug.push(`Itens: ${items.length}`);
    for (const item of items) {
      if (!item.isDirectory()) continue;
      const p = await checkProject(item.path, item.name);
      if (p) { found.push(p); debug.push(`✅ ${p.name}`); }
    }
  } catch(e) {
    debug.push(`❌ ${e.message}`);
  }

  debug.push(`Total: ${found.length}`);
  return { found, debug: debug.join('\n') };
}
