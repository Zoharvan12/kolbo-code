#!/usr/bin/env node

/**
 * Kolbo CLI Translation Check Script
 *
 * This script runs before commits to ensure all translation files are in sync.
 * It checks for missing keys across all 11 languages and warns if translations are needed.
 *
 * Usage:
 *   node scripts/check-translations.js
 *
 * Exit codes:
 *   0 - All translations in sync
 *   1 - Missing translations detected (with warning)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LANGUAGES = [
  'en', 'he', 'ar', 'ru', 'zh', 'es', 'hi', 'ja', 'de', 'ko', 'fr', 'pt'
];

const LANGUAGE_NAMES = {
  en: 'English',
  he: 'Hebrew',
  ar: 'Arabic',
  ru: 'Russian',
  zh: 'Chinese',
  es: 'Spanish',
  hi: 'Hindi',
  ja: 'Japanese',
  de: 'German',
  ko: 'Korean',
  fr: 'French',
  pt: 'Portuguese'
};

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

function checkTranslations() {
  console.log('🔍 Kolbo CLI Translation Check\n');
  console.log('Checking translation files for sync...\n');

  // Load all language files
  const languageData = {};

  for (const code of LANGUAGES) {
    const filePath = path.join(__dirname, `../src/i18n/locales/${code}.json`);
    try {
      languageData[code] = {
        json: JSON.parse(fs.readFileSync(filePath, 'utf8')),
        filePath
      };
    } catch (error) {
      console.error(`❌ Error loading ${code}.json:`, error.message);
      return false;
    }
  }

  // Flatten all
  const flattened = {};
  for (const code in languageData) {
    flattened[code] = flattenObject(languageData[code].json);
  }

  // Check for missing keys
  const allKeys = new Set(Object.keys(flattened.en));
  const issues = [];

  for (const code of LANGUAGES) {
    if (code === 'en') continue;

    const langKeys = new Set(Object.keys(flattened[code]));
    const missing = [...allKeys].filter(key => !langKeys.has(key));

    if (missing.length > 0) {
      issues.push({
        language: LANGUAGE_NAMES[code],
        code,
        missing: missing.length,
        examples: missing.slice(0, 5)
      });
    }
  }

  if (issues.length === 0) {
    console.log('✅ All 11 languages are in sync!');
    console.log(`📊 Total keys: ${allKeys.size}\n`);
    return true;
  }

  // Report issues
  console.log('⚠️  TRANSLATION SYNC ISSUES DETECTED\n');
  console.log('='.repeat(70));

  const totalMissing = issues.reduce((sum, issue) => sum + issue.missing, 0);

  issues.forEach(issue => {
    console.log(`\n❌ ${issue.language} (${issue.code}): ${issue.missing} missing keys`);
    console.log('   Examples:');
    issue.examples.forEach(key => {
      console.log(`     - ${key}`);
    });
  });

  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Total missing translations: ${totalMissing} keys across ${issues.length} languages`);
  console.log('\n🔧 To fix this, run:\n');
  console.log('   npm run translations:sync');
  console.log('   or');
  console.log('   node scripts/sync-all-translations.js\n');

  return false;
}

// Run the check
const isSync = checkTranslations();
process.exit(isSync ? 0 : 1);
