// Este patch adiciona o handler set-projects-list ao main.js
const fs = require('fs');
const p  = __dirname + '/main.js';
let src  = fs.readFileSync(p, 'utf8');

const handler = `
    case 'set-projects-list': {
      const BASE_PORT = 3001;
      const discovered = data.projects || [];
      const next = {};
      discovered.forEach((p, i) => {
        const id = p.folderName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const ex = services[id];
        next[id] = { ...p, id, port: BASE_PORT + i, proc: ex?.proc ?? null, status: ex?.status ?? 'stopped' };
      });
      for (const [id, svc] of Object.entries(services)) {
        if (!next[id] && svc.proc) svc.proc.kill('SIGTERM');
      }
      services = next;
      const ip = getIP();
      rn.channel.send(JSON.stringify({ event: 'projects-list', data: Object.values(services).map(s => ({
        id: s.id, name: s.name, description: s.description, version: s.version,
        folderName: s.folderName, script: s.script, port: s.port,
        status: fs.existsSync(s.dir) ? s.status : 'missing',
        tunnelUrl: tunnels.getUrl(s.id), ip,
      }))}));
      break;
    }`;

if (!src.includes('set-projects-list')) {
  src = src.replace("case 'refresh':", handler + "\n    case 'refresh':");
  fs.writeFileSync(p, src);
  console.log('✅ set-projects-list handler adicionado.');
} else {
  console.log('Handler já existe.');
}
