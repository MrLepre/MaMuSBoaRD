#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
const failures = [];
const checks = [];
function check(ok, message) {
  checks.push({ok, message});
  if (!ok) failures.push(message);
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function walk(dir, out=[]) {
  for (const name of fs.readdirSync(dir)) {
    if (['.git','.github'].includes(name)) continue;
    const full = path.join(dir, name), st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
}

for (const rel of ['index.html','style.css','app.js','service-worker.js','js/core/state.js','js/core/bootstrap.js','js/core/supabase.js','js/realtime.js','js/auth/auth.js','js/campaigns/campaigns.js','js/systems/systems.js','js/characters/characters.js','js/tabletop/tabletop.js','js/systems-modules/registry.js','js/systems-modules/world-trigger.js']) {
  check(fs.existsSync(path.join(root, rel)), `arquivo obrigatório ausente: ${rel}`);
}

for (const file of walk(root).filter(f => f.endsWith('.js'))) {
  const r = path.relative(root, file);
  const result = cp.spawnSync(process.execPath, ['--check', file], {encoding:'utf8'});
  check(result.status === 0, `JavaScript inválido: ${r}${result.stderr ? ` — ${result.stderr.trim()}` : ''}`);
}

for (const file of walk(root).filter(f => f.endsWith('.html'))) {
  const r = path.relative(root, file), html = fs.readFileSync(file,'utf8');
  const ids = [...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]).filter(id => !id.includes('${'));
  const seen = new Set(), dup = new Set();
  for (const id of ids) { if (seen.has(id)) dup.add(id); seen.add(id); }
  check(dup.size === 0, `IDs duplicados em ${r}: ${[...dup].join(', ')}`);
}

const app = read('app.js');
const sw = read('service-worker.js');
const index = read('index.html');
check(!/window\.scrollBy\s*\(/.test(app), 'fallback global de window.scrollBy ainda existe em app.js');
check(!/document\.addEventListener\(\s*["']touchmove["']/.test(app), 'listener global de touchmove ainda existe em app.js');
check(!/canalMesa\.send\s*\(/.test(app), 'app.js ainda envia Realtime diretamente pelo canal legado');
check(/MAMUS_REALTIME\.send\(/.test(app), 'app.js não usa MAMUS_REALTIME.send');
check(/app\.js\?v=marco10-cleanup-v1/.test(index), 'index.html não está com cache-bust do Marco 10');
check(/mamus-cache-v23/.test(sw), 'service-worker não está na versão de cache esperada');
for (const stale of ['app.js.bak','style.css.bak','index.html.bak','app_head.txt']) {
  check(!fs.existsSync(path.join(root, stale)), `artefato legado ainda presente: ${stale}`);
}

console.log(`Marco 10 smoke test: ${checks.filter(c=>c.ok).length}/${checks.length} checks OK`);
for (const c of checks) if (!c.ok) console.error(`FAIL: ${c.message}`);
if (failures.length) process.exit(1);
