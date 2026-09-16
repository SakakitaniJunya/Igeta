import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (process.argv.length !== 3 || !['--write', '--check'].includes(mode)) {
  console.error('usage: node scripts/sample-docs.mjs --write|--check');
  process.exit(2);
}
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('./generate-docs-graph.mjs', import.meta.url)), mode,
], {
  stdio: 'inherit',
  env: { ...process.env, DOCS_GRAPH_ROOT: fileURLToPath(new URL('../examples/booking/', import.meta.url)) },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 2);
