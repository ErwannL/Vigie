/**
 * Repository rules that no linter checks on its own. Fails (exit code 1) when:
 *  - a file has more than 1000 lines or contains a CR character (LF only);
 *  - a source or test file hides code from coverage or skips/focuses tests;
 *  - a folder has no README.md.
 * Generated lockfiles are exempt from the line limit. Run by `npm run check` / `make check`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_LINES = 1000;
export const IGNORED_DIRS = new Set(['node_modules', 'coverage', 'dist', '.git']);
const GENERATED = new Set(['package-lock.json']);
// Built from pieces so this file does not match its own patterns.
export const FORBIDDEN = [
  ['istanbul', 'ignore'],
  ['c8', 'ignore'],
  ['v8', 'ignore'],
  ['__cover', 'age__'],
  ['test', '.skip('],
  ['it', '.skip('],
  ['describe', '.skip('],
  ['test', '.only('],
  ['it', '.only('],
  ['describe', '.only('],
  ['test', '.todo('],
  ['assert.ok', '(true)'],
  ['expect(true)', '.toBe(true)'],
].map((parts) => parts.join(''));
const CODE = /\.(js|jsx|mjs|cjs)$/;
const BINARY = /\.(png|ico|jpg|gif|woff2?)$/;

/** Every file under `root`, relative, skipping dependency and build folders. */
export function listFiles(root, dir = root) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return IGNORED_DIRS.has(name) ? [] : listFiles(root, path);
    return [relative(root, path)];
  });
}

export function problemsIn(path, text) {
  const problems = [];
  const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  const name = path.split('/').pop();
  if (lines > MAX_LINES && !GENERATED.has(name)) {
    problems.push(`${path}: ${lines} lines (max ${MAX_LINES})`);
  }
  if (text.includes('\r')) problems.push(`${path}: CR line endings (LF only)`);
  if (CODE.test(path)) {
    for (const pattern of FORBIDDEN) {
      if (text.includes(pattern)) problems.push(`${path}: forbidden "${pattern}"`);
    }
  }
  return problems;
}

/** Folders (including parents of folders) without a README.md. */
export function missingReadmes(files, exists) {
  const dirs = new Set();
  for (const file of files) {
    for (let d = dirname(file); !dirs.has(d); d = dirname(d)) {
      dirs.add(d);
      if (d === '.') break;
    }
  }
  return [...dirs].filter((d) => !exists(join(d, 'README.md'))).sort();
}

/** Runs every check on `root`; returns the process exit code. */
export function run(root, { stdout, stderr }) {
  const files = listFiles(root).filter((f) => !BINARY.test(f));
  const problems = files.flatMap((f) => problemsIn(f, readFileSync(join(root, f), 'utf8')));
  for (const dir of missingReadmes(files, (p) => existsSync(join(root, p)))) {
    problems.push(`${dir}/: no README.md`);
  }
  if (problems.length > 0) {
    stderr.write(`${problems.join('\n')}\n`);
    return 1;
  }
  stdout.write(`check: ${files.length} files OK\n`);
  return 0;
}

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

process.exitCode = run(REPO_ROOT, process);
