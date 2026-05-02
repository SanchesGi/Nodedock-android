import RNFS from 'react-native-fs';

async function checkProject(dirPath, name) {
  try {
    const pkgPath = `${dirPath}/package.json`;
    if (!(await RNFS.exists(pkgPath))) return null;
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
  const debug = [`📂 Lendo: ${dirPath}`];

  // Verifica se a própria pasta é um projeto
  const self = await checkProject(dirPath, dirPath.split('/').pop());
  if (self) { found.push(self); debug.push(`✅ Própria pasta: ${self.name}`); }

  // Lê subpastas
  try {
    const items = await RNFS.readDir(dirPath);
    const dirs  = items.filter(i => i.isDirectory());
    debug.push(`📁 Subpastas: ${dirs.length}`);
    for (const item of dirs) {
      const p = await checkProject(item.path, item.name);
      if (p) { found.push(p); debug.push(`✅ ${p.name}`); }
      else {
        // Tenta um nível mais fundo
        try {
          const sub = await RNFS.readDir(item.path);
          for (const s of sub.filter(x => x.isDirectory())) {
            const p2 = await checkProject(s.path, s.name);
            if (p2) { found.push(p2); debug.push(`✅ ${item.name}/${p2.name}`); }
          }
        } catch {}
      }
    }
  } catch(e) {
    debug.push(`❌ readDir: ${e.message}`);
    debug.push('⚠️ Clique em 🔑 Permissão no topo do app e ative\n"Acesso a todos os arquivos" para o SentriDock');
  }

  debug.push(`\nTotal: ${found.length} projeto(s)`);
  return { found, debug: debug.join('\n') };
}
