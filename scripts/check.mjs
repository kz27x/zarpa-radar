// node scripts/check.mjs — confere o manifest, os arquivos citados nele e a sintaxe de todo JS.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const m = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const files = new Set([m.background.service_worker, m.action.default_popup, ...Object.values(m.icons), ...Object.values(m.action.default_icon)]);
m.content_scripts.forEach((c) => c.js.forEach((f) => files.add(f)));
m.web_accessible_resources.forEach((w) => w.resources.forEach((f) => files.add(f)));
let bad = 0;
for (const f of files) if (!existsSync(join(root, f))) { console.error('falta', f); bad++; }
if (m.manifest_version !== 3) { console.error('manifest_version deve ser 3'); bad++; }
if (JSON.stringify(m.permissions) !== '["storage"]') { console.error('permissões mudaram:', m.permissions); bad++; }
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? (/node_modules|\.git/.test(n) ? [] : walk(p)) : [p]; });
for (const f of walk(root).filter((p) => p.endsWith('.js'))) {
  try { execFileSync(process.execPath, ['--check', f]); } catch (e) { console.error('sintaxe:', f); bad++; }
}
const html = readFileSync(join(root, 'popup/popup.html'), 'utf8');
for (const [, src] of html.matchAll(/(?:src|href)="(\.\.\/[^"]+|[^":]+\.(?:css|js))"/g)) if (!existsSync(join(root, 'popup', src))) { console.error('popup cita arquivo inexistente', src); bad++; }
console.log(bad ? bad + ' problema(s)' : 'tudo certo: ' + files.size + ' arquivos do manifest, versão ' + m.version);
process.exit(bad ? 1 : 0);
