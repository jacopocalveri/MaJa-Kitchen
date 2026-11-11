import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(root, '.env');
const outputPath = join(root, 'public', 'runtime-config.js');
const contents = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';

function readValue(name) {
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator < 0 || trimmed.slice(0, separator).trim() !== name) {
      continue;
    }
    const value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }
    return value;
  }
  return '';
}

const supabaseUrl = readValue('SUPABASE_URL');
const supabaseAnonKey = readValue('SUPABASE_ANON_KEY');
if (Boolean(supabaseUrl) !== Boolean(supabaseAnonKey)) {
  throw new Error('Configura sia SUPABASE_URL sia SUPABASE_ANON_KEY nel file .env.');
}

const config = { supabaseUrl, supabaseAnonKey };
writeFileSync(outputPath, `window.MAJA_CONFIG = ${JSON.stringify(config)};\n`, 'utf8');
console.log(
  supabaseUrl ? 'Configurazione Supabase runtime generata.' : 'Avvio in modalità demo locale.',
);
