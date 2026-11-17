const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = path.join(root, '.test-dist');
const compiler = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

fs.rmSync(output, { recursive: true, force: true });

const compile = spawnSync(process.execPath, [compiler, '-p', path.join(root, 'tsconfig.tests.json'), '--pretty', 'false'], {
  cwd: root,
  stdio: 'inherit'
});
if (compile.status !== 0) process.exit(compile.status ?? 1);

const sharedAlias = path.join(output, 'node_modules', '@shared');
fs.mkdirSync(path.dirname(sharedAlias), { recursive: true });
fs.cpSync(path.join(output, 'src', 'shared'), sharedAlias, { recursive: true });

function testFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return testFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.test.js') ? [entryPath] : [];
  });
}

const files = testFiles(path.join(output, 'tests')).sort();
if (files.length === 0) {
  console.error('No compiled test files found under tests/**/*.test.ts');
  process.exit(1);
}

const run = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
process.exit(run.status ?? 1);
