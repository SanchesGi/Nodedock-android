import RNFS from 'react-native-fs';

export async function scanProjects(dirPath) {
  const found  = [];
  const debugLog = [];

  debugLog.push(`Escaneando: ${dirPath}`);

  try {
    const items = await RNFS.readDir(dirPath);
    debugLog.push(`Itens encontrados: ${items.length}`);
    items.forEach(i => debugLog.push(`  - ${i.name} (dir:${i.isDirectory()})`));

    for (const item of items) {
      if (!item.isDirectory()) continue;

      const pkgPath = `${item.path}/package.json`;
      const exists  = await RNFS.exists(pkgPath);
      debugLog.push(`  ${item.name}/package.json: ${exists}`);
      if (!exists) continue;

      try {
        const raw = await RNFS.readFile(pkgPath, 'utf8');
        const pkg = JSON.parse(raw);

        const candidates = [pkg.main, 'server.js', 'index.js', 'app.js'].filter(Boolean);
        let script = null;
        for (const c of candidates) {
          if (await RNFS.exists(`${item.path}/${c}`)) { script = c; break; }
        }
        debugLog.push(`  ${item.name} script: ${script}`);
        if (!script) continue;

        found.push({
          folderName:  item.name,
          name:        pkg.name || item.name,
          description: pkg.description || '',
          version:     pkg.version || '',
          script,
          dir: item.path,
        });
      } catch(e) {
        debugLog.push(`  Erro em ${item.name}: ${e.message}`);
      }
    }
  } catch (e) {
    debugLog.push(`Erro readDir: ${e.message}`);
  }

  return { found, debug: debugLog.join('\n') };
}
