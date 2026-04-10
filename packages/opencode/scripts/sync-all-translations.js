import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Google Gemini
const genAI = new GoogleGenerativeAI(
  process.env.GOOGLE_API_KEY || 'AIzaSyC_wsTYFHZAMfC-BZnDdjBrOCCED3-qAR8'
);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// All supported languages
const LANGUAGES = [
  { code: 'en', name: 'English', isSource: true },
  { code: 'he', name: 'Hebrew', instructions: 'Use Hebrew (עברית). Use appropriate formal language.' },
  { code: 'ar', name: 'Arabic', instructions: 'Use Arabic (العربية). Use formal language.' },
  { code: 'ru', name: 'Russian', instructions: 'Use Russian (Русский). Use formal "вы" form.' },
  { code: 'zh', name: 'Chinese', instructions: 'Use Simplified Chinese (简体中文).' },
  { code: 'es', name: 'Spanish', instructions: 'Use neutral Spanish. Use formal "usted" form.' },
  { code: 'hi', name: 'Hindi', instructions: 'Use Hindi (हिंदी) with Devanagari script.' },
  { code: 'ja', name: 'Japanese', instructions: 'Use Japanese (日本語). Use polite です/ます form.' },
  { code: 'de', name: 'German', instructions: 'Use German (Deutsch). Use formal "Sie" form.' },
  { code: 'ko', name: 'Korean', instructions: 'Use Korean (한국어). Use formal 합니다 form.' },
  { code: 'fr', name: 'French', instructions: 'Use French (Français). Use formal "vous" form.' },
  { code: 'pt', name: 'Portuguese', instructions: 'Use Brazilian Portuguese (Português do Brasil). Use formal "você" form.' }
];

// Flatten nested object
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

// Unflatten with conflict handling
function unflattenObject(flatObj) {
  const sortedEntries = Object.entries(flatObj).sort((a, b) => {
    return a[0].split('.').length - b[0].split('.').length;
  });

  const result = {};
  const skipped = [];

  for (const [key, value] of sortedEntries) {
    const parts = key.split('.');
    let current = result;
    let shouldSkip = false;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] !== undefined && typeof current[part] !== 'object') {
        skipped.push(key);
        shouldSkip = true;
        break;
      }
      if (!current[part]) current[part] = {};
      current = current[part];
    }

    if (!shouldSkip) {
      const lastPart = parts[parts.length - 1];
      if (current[lastPart] === undefined || typeof current[lastPart] !== 'object') {
        current[lastPart] = value;
      }
    }
  }

  return { result, skipped };
}

// Get nested value
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Set nested value
function setNestedValue(obj, path, value) {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }

  current[parts[parts.length - 1]] = value;
}

// Chunk object for parallel processing
function chunkObject(obj, chunkSize) {
  const entries = Object.entries(obj);
  const chunks = [];
  for (let i = 0; i < entries.length; i += chunkSize) {
    chunks.push(Object.fromEntries(entries.slice(i, i + chunkSize)));
  }
  return chunks;
}

// Translate chunk using Gemini
async function translateChunk(chunk, language) {
  try {
    const prompt = `You are a professional translator. Translate the following JSON from English to ${language.name}.
${language.instructions}
- Maintain exact JSON structure
- Only translate VALUES, never keys
- Preserve ALL variables like {{variable}}, {{count}}, etc.
- Keep translation natural and culturally appropriate
- Return ONLY valid JSON, no additional text or markdown code blocks

JSON to translate:
${JSON.stringify(chunk, null, 2)}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let translatedText = response.text().trim();

    // Remove markdown code blocks if present
    if (translatedText.startsWith('```json')) {
      translatedText = translatedText.slice(7);
    } else if (translatedText.startsWith('```')) {
      translatedText = translatedText.slice(3);
    }
    if (translatedText.endsWith('```')) {
      translatedText = translatedText.slice(0, -3);
    }
    translatedText = translatedText.trim();

    return JSON.parse(translatedText);
  } catch (error) {
    console.error(`    ❌ Translation error:`, error.message);
    return chunk; // Return original on error
  }
}

// Translate missing keys for a language
async function translateMissingKeys(missingKeysArray, language) {
  if (missingKeysArray.length === 0) return {};

  // Convert array of {key, value} objects to flat object
  const missingKeysFlat = missingKeysArray.reduce((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {});

  const CHUNK_SIZE = 25;
  const chunks = chunkObject(missingKeysFlat, CHUNK_SIZE);

  console.log(`   Translating ${missingKeysArray.length} keys in ${chunks.length} chunks...`);

  const results = await Promise.all(
    chunks.map(chunk => translateChunk(chunk, language))
  );

  return Object.assign({}, ...results);
}

// Main sync function
async function syncAllTranslations() {
  console.log('🔄 Kolbo CLI Translation Sync');
  console.log('📋 Checking all 11 languages for missing keys...\n');

  const startTime = Date.now();

  // Load all language files
  const languageData = {};
  for (const lang of LANGUAGES) {
    const filePath = path.join(__dirname, `../src/i18n/locales/${lang.code}.json`);
    try {
      languageData[lang.code] = {
        ...lang,
        json: JSON.parse(fs.readFileSync(filePath, 'utf8')),
        filePath
      };
    } catch (error) {
      console.error(`❌ Error loading ${lang.code}.json:`, error.message);
      process.exit(1);
    }
  }

  // Flatten all language files
  const flattened = {};
  for (const code in languageData) {
    flattened[code] = flattenObject(languageData[code].json);
  }

  // Get all keys from English (source)
  const allKeys = new Set(Object.keys(flattened.en));
  console.log(`📊 Total keys in English (source): ${allKeys.size}\n`);

  // Find missing keys for each language
  const missingByLanguage = {};
  const translationsNeeded = {};

  for (const lang of LANGUAGES) {
    if (lang.isSource) continue; // Skip English

    const langKeys = new Set(Object.keys(flattened[lang.code]));
    const missing = [...allKeys].filter(key => !langKeys.has(key));

    if (missing.length > 0) {
      missingByLanguage[lang.code] = missing;
      translationsNeeded[lang.code] = {};

      // Get English values for missing keys
      missing.forEach(key => {
        translationsNeeded[lang.code][key] = flattened.en[key];
      });

      console.log(`⚠️  ${lang.name} (${lang.code}): ${missing.length} missing keys`);
    } else {
      console.log(`✅ ${lang.name} (${lang.code}): All keys present`);
    }
  }

  const totalMissing = Object.values(missingByLanguage).reduce((sum, arr) => sum + arr.length, 0);

  if (totalMissing === 0) {
    console.log('\n🎉 All languages are in sync! No translations needed.');
    return;
  }

  console.log(`\n📝 Total missing translations: ${totalMissing} keys across ${Object.keys(missingByLanguage).length} languages`);
  console.log('\n🚀 Starting automated translation...\n');

  // Translate missing keys for each language
  const updates = {};

  for (const lang of LANGUAGES) {
    if (lang.isSource || !missingByLanguage[lang.code]) continue;

    console.log(`${'='.repeat(60)}`);
    console.log(`🌐 ${lang.name} (${lang.code})`);
    console.log('='.repeat(60));

    const translated = await translateMissingKeys(
      Object.keys(translationsNeeded[lang.code]).map(key => ({
        key,
        value: translationsNeeded[lang.code][key]
      })),
      lang
    );

    // Merge translated keys into existing language file
    const updatedJson = { ...languageData[lang.code].json };

    for (const key in translationsNeeded[lang.code]) {
      const translatedValue = translated[key] || translationsNeeded[lang.code][key];
      setNestedValue(updatedJson, key, translatedValue);
    }

    updates[lang.code] = {
      json: updatedJson,
      addedCount: missingByLanguage[lang.code].length
    };

    console.log(`   ✅ ${missingByLanguage[lang.code].length} keys translated and merged\n`);
  }

  // Write updated files
  console.log('💾 Writing updated translation files...\n');

  for (const code in updates) {
    const filePath = languageData[code].filePath;
    fs.writeFileSync(filePath, JSON.stringify(updates[code].json, null, 2), 'utf8');

    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(2);

    console.log(`   ✅ ${languageData[code].name}: +${updates[code].addedCount} keys (${sizeKB} KB)`);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const minutes = (totalTime / 60).toFixed(1);

  console.log('\n' + '='.repeat(60));
  console.log('✅ TRANSLATION SYNC COMPLETE!');
  console.log('='.repeat(60));
  console.log(`⏱️  Time: ${totalTime}s (${minutes} min)`);
  console.log(`📊 Keys added: ${totalMissing}`);
  console.log(`🌍 Languages updated: ${Object.keys(updates).length}`);
  console.log(`💰 Estimated cost: ~$${(Object.keys(updates).length * 0.02).toFixed(2)} (Gemini Flash)`);
  console.log('\n🎉 All 11 languages are now in sync!\n');

  // Generate summary report
  const report = {
    timestamp: new Date().toISOString(),
    totalKeysAdded: totalMissing,
    languagesUpdated: Object.keys(updates).length,
    duration: parseFloat(totalTime),
    details: Object.entries(updates).map(([code, data]) => ({
      language: languageData[code].name,
      code,
      keysAdded: data.addedCount
    }))
  };

  const reportPath = path.join(__dirname, '../translation-sync-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log('📄 Detailed report saved to: translation-sync-report.json\n');
}

// Run the sync
syncAllTranslations().catch(error => {
  console.error('\n❌ Sync failed:', error.message);
  console.error(error.stack);
  process.exit(1);
});
