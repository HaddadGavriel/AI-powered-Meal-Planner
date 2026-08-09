import { readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const check = process.argv.includes('--check');
const roots = ['src', 'e2e', 'scripts'];
const topLevel = ['next.config.ts', 'playwright.config.ts', 'vitest.config.ts', 'tailwind.config.ts'];
const files = [...topLevel];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (['.ts', '.tsx', '.mjs'].includes(extname(path))) files.push(path);
  }
}
for (const root of roots) await collect(root);
const invalid = [];
for (const file of files.sort()) {
  const source = await readFile(file, 'utf8');
  const formatted = `${source.split(/\r?\n/).map((line) => line.trimEnd()).join('\n').trim()}\n`;
  const longLines = formatted.split('\n').flatMap((line, index) => line.length > 500 ? [index + 1] : []);
  if (formatted !== source || longLines.length) {
    invalid.push(`${file}${longLines.length ? ` (lines over 500 characters: ${longLines.join(', ')})` : ''}`);
    if (!check && !longLines.length) await writeFile(file, formatted);
  }
}
if (check && invalid.length) {
  console.error(`Formatting required:\n${invalid.join('\n')}`);
  process.exit(1);
}
