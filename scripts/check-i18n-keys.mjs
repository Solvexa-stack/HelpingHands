#!/usr/bin/env node
// Verification helper for the localization pass: extracts translation-key
// call sites from source files and confirms each key resolves to a STRING
// (not undefined, not an object namespace collision) in en/ar/fr alike, plus
// a parity guard between the three catalogs. Not a translation system itself
// — it only inspects the two existing ones (next-intl in apps/web, the
// custom t()/resolve() in apps/admin).
//
// Usage:
//   node scripts/check-i18n-keys.mjs --app=web [--files=a.tsx,b.tsx]
//   node scripts/check-i18n-keys.mjs --app=admin [--files=a.tsx,b.tsx]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const APPS = {
  web: {
    srcDir: 'apps/web/src',
    messagesDir: 'apps/web/messages',
    style: 'namespaced',
  },
  admin: {
    srcDir: 'apps/admin/src',
    messagesDir: 'apps/admin/src/messages',
    style: 'dotted',
  },
};

const LOCALES = ['en', 'ar', 'fr'];

function parseArgs(argv) {
  const args = { app: null, files: null };
  for (const a of argv) {
    if (a.startsWith('--app=')) args.app = a.slice('--app='.length);
    else if (a.startsWith('--files=')) {
      args.files = a
        .slice('--files='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return args;
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(p);
  }
  return out;
}

// Flattens a nested messages object into Map<dottedKey, typeof leafValue>.
function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, full, out);
    } else {
      out.set(full, typeof v);
    }
  }
  return out;
}

// admin: t() always takes the full dotted path directly.
function extractAdminKeys(content) {
  const keys = new Set();
  const re = /\bt\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g;
  let m;
  while ((m = re.exec(content))) keys.add(m[1]);
  return keys;
}

// web: useTranslations('ns') / getTranslations({..., namespace:'ns'}) bind a
// scoped t-function to a variable; keys used through that variable resolve
// to `ns.key`. Only namespaced-t() calls are checked (a bare t() with no ns
// binding in scope is not analyzed here).
function extractWebKeys(content) {
  const keys = new Set();
  const nsRe =
    /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:\{\s*[^}]*namespace:\s*)?['"]([a-zA-Z0-9_.-]*)['"]/g;
  const nsMap = new Map();
  let m;
  while ((m = nsRe.exec(content))) nsMap.set(m[1], m[2]);
  if (nsMap.size === 0) return keys;

  const callRe = /\b(\w+)\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g;
  while ((m = callRe.exec(content))) {
    const [, varName, key] = m;
    if (nsMap.has(varName)) {
      const ns = nsMap.get(varName);
      keys.add(ns ? `${ns}.${key}` : key);
    }
  }
  return keys;
}

function main() {
  const { app, files } = parseArgs(process.argv.slice(2));
  if (!app || !APPS[app]) {
    console.error('Usage: node scripts/check-i18n-keys.mjs --app=<web|admin> [--files=a.tsx,b.tsx]');
    process.exit(2);
  }
  const cfg = APPS[app];
  const messagesDir = path.join(repoRoot, cfg.messagesDir);

  const flat = {};
  for (const loc of LOCALES) {
    const raw = JSON.parse(fs.readFileSync(path.join(messagesDir, `${loc}.json`), 'utf8'));
    flat[loc] = flatten(raw);
  }

  const targetFiles = files && files.length
    ? files.map((f) => (path.isAbsolute(f) ? f : path.resolve(repoRoot, f)))
    : walk(path.join(repoRoot, cfg.srcDir));

  const usedKeys = new Set();
  for (const fp of targetFiles) {
    if (!fs.existsSync(fp)) {
      console.warn(`warning: file not found, skipping: ${fp}`);
      continue;
    }
    const content = fs.readFileSync(fp, 'utf8');
    const keys = cfg.style === 'dotted' ? extractAdminKeys(content) : extractWebKeys(content);
    for (const k of keys) usedKeys.add(k);
  }

  const errors = [];
  for (const key of usedKeys) {
    for (const loc of LOCALES) {
      const type = flat[loc].get(key);
      if (type === undefined) errors.push(`[${loc}] missing key used in code: ${key}`);
      else if (type !== 'string') errors.push(`[${loc}] key resolves to ${type}, not string: ${key}`);
    }
  }

  // Catalog parity guard (always whole-catalog, independent of --files).
  for (const [key] of flat.en) {
    for (const loc of ['ar', 'fr']) {
      if (!flat[loc].has(key)) errors.push(`[parity] ${key} exists in en but missing in ${loc}`);
    }
  }
  for (const loc of ['ar', 'fr']) {
    for (const key of flat[loc].keys()) {
      if (!flat.en.has(key)) errors.push(`[parity] ${key} exists in ${loc} but missing in en`);
    }
  }

  if (errors.length) {
    console.error(`i18n check FAILED for app=${app} (${errors.length} issue(s)):`);
    for (const e of [...new Set(errors)].sort()) console.error('  - ' + e);
    process.exit(1);
  }
  console.log(
    `i18n check passed for app=${app}: ${usedKeys.size} key(s) checked across ${targetFiles.length} file(s), ${LOCALES.length} locales in parity.`,
  );
}

main();
