import RNFS from 'react-native-fs';

// Escaneia uma pasta em busca de projetos Node.js
export async function scanProjects(dirPath) {
  const found = [];
  try {
    const items = await RNFS.readDir(dirPath);
    for (const item of items) {
      if (!item.isDirectory()) continue;
      const pkgPath = `${item.path}/package.json`;
      const exists  = await RNFS.exists(pkgPath);
      if (!exists) continue;

      try {
        const raw = await RNFS.readFile(pkgPath, 'utf8');
        const pkg = JSON.parse(raw);

        // Detecta script de entrada
        const candidates = [pkg.main, 'server.js', 'index.js', 'app.js'].filter(Boolean);
        let script = null;
        for (const c of candidates) {
          if (await RNFS.exists(`${item.path}/${c}`)) { script = c; break; }
        }
        if (!script) continue;

        found.push({
          folderName:  item.name,
          name:        pkg.name || item.name,
          description: pkg.description || '',
          version:     pkg.version || '',
          script,
          dir:         item.path,
        });
      } catch { continue; }
    }
  } catch (e) {
    console.warn('scanProjects error:', e.message);
  }
  return found;
}
