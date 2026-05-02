/**
 * scanner.js — versão sem SAF.
 * O scan acontece DENTRO do Node.js (main.js), porque é ele que precisa
 * dos paths reais. Aqui no JS-side só pedimos ao Node pra escanear e
 * recebemos a lista pronta.
 *
 * Esta camada existe só pra:
 *   1) Calcular o path padrão (external app-specific dir)
 *   2) Garantir que a pasta /projects exista
 *   3) Abrir o Files app na pasta certa pro usuário copiar projetos
 */

import RNFS from 'react-native-fs';
import { Linking, Platform, ToastAndroid } from 'react-native';

// /storage/emulated/0/Android/data/com.sentridock.android/files/projects
export function getDefaultProjectsDir() {
  return `${RNFS.ExternalDirectoryPath}/projects`;
}

export async function ensureProjectsDir() {
  const dir = getDefaultProjectsDir();
  try {
    const exists = await RNFS.exists(dir);
    if (!exists) await RNFS.mkdir(dir);
    // cria um README.txt explicativo se não existir
    const readme = `${dir}/README.txt`;
    if (!(await RNFS.exists(readme))) {
      await RNFS.writeFile(
        readme,
        [
          'SentriDock - Pasta de projetos',
          '================================',
          '',
          'Coloque seus projetos Node.js aqui, cada um em sua própria',
          'subpasta contendo package.json e node_modules/.',
          '',
          'Exemplo:',
          '  projects/',
          '    meu-app/',
          '      package.json',
          '      server.js',
          '      node_modules/',
          '    outro-app/',
          '      package.json',
          '      ...',
          '',
          'Após copiar os projetos, toque em "↻ Scan" no app.',
        ].join('\n'),
        'utf8'
      );
    }
    return dir;
  } catch (e) {
    return dir;
  }
}

/**
 * Tenta abrir o Files app na pasta de projetos.
 * Em Android 11+ alguns gerenciadores bloqueiam Android/data/, então
 * essa abertura pode não funcionar em todos os dispositivos. Nesse
 * caso, mostramos o path pro usuário copiar manualmente.
 */
export async function openProjectsDirInFiles() {
  const dir = getDefaultProjectsDir();
  try {
    // Não há intent universal pra "abrir pasta", mas podemos tentar
    // via file:// (funciona em Android < 11 com alguns apps)
    if (Platform.Version < 30) {
      await Linking.openURL(`file://${dir}`);
      return true;
    }
  } catch {}
  // Fallback: copia o path pro clipboard via Toast
  ToastAndroid.show(
    `Abra seu gerenciador em:\n${dir}`,
    ToastAndroid.LONG
  );
  return false;
}
