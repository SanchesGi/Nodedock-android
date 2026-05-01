import RNFS from 'react-native-fs';

async function checkProject(dirPath, name) {
  const pkgPath = `${dirPath}/package.json`;
  if (!(await RNFS.exists(pkgPath))) return null;
  try {
    const pkg = JSON.parse(await RNFS.readFile(pkgPath, 'utf8'));
    const candidates = [pkg.main, 'server.js', 'index.js', 'app.js'].filter(Boolean);
    let script = null;
    for (const c of candidates) {
      if (await RNFS.exists(`${dirPath}/${c}`)) { script = c; break; }
    }
    if (!script) return null;
    return {
      folderName:  name,
      name:        pkg.name || name,
      description: pkg.description || '',
      version:     pkg.version || '',
      script,
      dir: dirPath,
    };
  } catch { return null; }
}

export async function scanProjects(dirPath) {
  const found = [];
  const debug = [];

  debug.push(`Path: ${dirPath}`);

  // Verifica se a própria pasta selecionada é um projeto
  const self = await checkProject(dirPath, dirPath.split('/').pop());
  if (self) {
    debug.push(`Própria pasta é projeto: ${self.name}`);
    found.push(self);
  }

  // Verifica subpastas
  try {
    const items = await RNFS.readDir(dirPath);
    debug.push(`Subpastas: ${items.filter(i=>i.isDirectory()).map(i=>i.name).join(', ')||'nenhuma'}`);
    for (const item of items) {
      if (!item.isDirectory()) continue;
      const p = await checkProject(item.path, item.name);
      if (p) { found.push(p); debug.push(`Projeto: ${p.name}`); }
    }
  } catch(e) {
    debug.push(`readDir erro: ${e.message}`);
  }

  debug.push(`Total: ${found.length}`);
  return { found, debug: debug.join('\n') };
}
