import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { FORBIDDEN, listFiles, missingReadmes, problemsIn, run } from '../../scripts/check.js';

const sink = () => {
  const out = { text: '', write: (s) => (out.text += s) };
  return out;
};

test('the repository itself passes its own checks', () => {
  // Importing the script ran it on the real repository.
  expect(process.exitCode).toBe(0);
});

test('line limit (lockfiles exempt), CR endings and forbidden coverage tricks are reported', () => {
  const long = 'x\n'.repeat(1001);
  expect(problemsIn('a/b.md', long)).toEqual(['a/b.md: 1001 lines (max 1000)']);
  expect(problemsIn('a/b.md', 'x\n'.repeat(1000))).toEqual([]);
  expect(problemsIn('a/b.md', 'no newline at end')).toEqual([]);
  expect(problemsIn('package-lock.json', long)).toEqual([]);
  expect(problemsIn('a.txt', 'a\r\nb')).toEqual(['a.txt: CR line endings (LF only)']);
  expect(FORBIDDEN).toHaveLength(13);
  for (const pattern of FORBIDDEN) {
    expect(problemsIn('x.test.jsx', `foo ${pattern} bar`)).toEqual([
      `x.test.jsx: forbidden "${pattern}"`,
    ]);
  }
  expect(problemsIn('notes.md', FORBIDDEN[0])).toEqual([]);
});

test('every folder, including parents, needs a README', () => {
  const have = new Set(['README.md', 'a/README.md']);
  expect(missingReadmes(['README.md', 'a/b/c/file.js', 'a/x.js'], (p) => have.has(p))).toEqual([
    'a/b',
    'a/b/c',
  ]);
});

test('run() walks a tree, skips dependency folders and binaries, and reports', () => {
  const root = mkdtempSync(join(tmpdir(), 'vigie-check-'));
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'node_modules'));
  writeFileSync(join(root, 'README.md'), '# r\n');
  writeFileSync(join(root, 'src', 'a.js'), 'ok\n');
  writeFileSync(join(root, 'src', 'logo.png'), '\r\r');
  writeFileSync(join(root, 'node_modules', 'x.js'), 'ignored\r\n');
  expect(listFiles(root).sort()).toEqual(['README.md', 'src/a.js', 'src/logo.png']);
  const [out, err] = [sink(), sink()];
  expect(run(root, { stdout: out, stderr: err })).toBe(1);
  expect(err.text).toBe('src/: no README.md\n');
  writeFileSync(join(root, 'src', 'README.md'), '# src\n');
  expect(run(root, { stdout: out, stderr: err })).toBe(0);
  expect(out.text).toBe('check: 3 files OK\n');
});
