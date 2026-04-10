#!/usr/bin/env node

/**
 * Kolbo CLI Translation Verify Script
 *
 * Validates all locale JSON files, reports file sizes, and counts keys per language.
 * Does not require a Gemini API key — purely structural validation.
 *
 * Usage:
 *   node scripts/verify-all-translations.js
 *
 * Exit codes:
 *   0 - All files valid
 *   1 - One or more files failed validation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'he', name: 'Hebrew' },
  { code: 'ar', name: 'Arabic' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'es', name: 'Spanish' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ja', name: 'Japanese' },
  { code: 'de', name: 'German' },
  { code: 'ko', name: 'Korean' },
  { code: 'fr', name: 'French' },
  { code: 'pt', name: 'Portuguese' }
];

function flattenObject(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

function verifyAllTranslations() {
  console.log('🔎 Kolbo CLI Translation Verify\n');
  console.log('Validating all locale files...\n');
  console.log('='.repeat(70));

  const localesDir = path.join(__dirname, '../src/i18n/locales');
  const results = [];
  let allValid = true;

  for (const lang of LANGUAGES) {
    const filePath = path.join(localesDir, `${lang.code}.json`);
    const result = { code: lang.code, name: lang.name, valid: false, sizeKB: 0, keyCount: 0, error: null };

    try {
      const raw = fs.readFileSync(filePath, 'utf8');

      // Validate JSON
      const parsed = JSON.parse(raw);

      // File size
      const stats = fs.statSync(filePath);
      result.sizeKB = (stats.size / 1024).toFixed(2);

      // Key count (flattened)
      const flat = flattenObject(parsed);
      result.keyCount = Object.keys(flat).length;
      result.valid = true;
    } catch (error) {
      result.error = error.message;
      allValid = false;
    }

    results.push(result);
  }

  console.log('');

  // Print table
  const maxNameLen = Math.max(...results.map(r => r.name.length));
  console.log(
    'Language'.padEnd(maxNameLen + 2) +
    'Code'.padEnd(6) +
    'Valid'.padEnd(8) +
    'Keys'.padEnd(8) +
    'Size (KB)'
  );
  console.log('-'.repeat(maxNameLen + 2 + 6 + 8 + 8 + 10));

  for (const r of results) {
    const validMark = r.valid ? '✅' : '❌';
    const keysStr = r.valid ? String(r.keyCount) : '-';
    const sizeStr = r.valid ? String(r.sizeKB) : '-';
    console.log(
      r.name.padEnd(maxNameLen + 2) +
      r.code.padEnd(6) +
      `${validMark}     ` +
      keysStr.padEnd(8) +
      sizeStr
    );
    if (!r.valid) {
      console.log(`   Error: ${r.error}`);
    }
  }

  console.log('\n' + '='.repeat(70));

  const validCount = results.filter(r => r.valid).length;
  const totalKeys = results.find(r => r.code === 'en')?.keyCount ?? 0;

  console.log(`\n📊 ${validCount}/${LANGUAGES.length} files valid`);
  console.log(`📋 English (source) key count: ${totalKeys}`);

  if (!allValid) {
    const failed = results.filter(r => !r.valid).map(r => r.code).join(', ');
    console.log(`\n❌ Failed files: ${failed}`);
    console.log('Fix JSON syntax errors before running translations:sync.\n');
  } else {
    console.log('\n✅ All locale files are valid JSON.\n');
  }

  return allValid;
}

const ok = verifyAllTranslations();
process.exit(ok ? 0 : 1);
