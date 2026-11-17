// Hilfsskript für setup.command.
// Ohne Argument: erstellt einmalig deine Push-Schlüssel (VAPID) in ~/.tasks-push-keys.json und fragt ggf. nach dem Login.
// Mit --secrets: gibt die Geheimnisse für Cloudflare als JSON aus (nur für "wrangler secret bulk").
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';

const KEYS = path.join(os.homedir(), '.tasks-push-keys.json');
const HELPER_CREDS = path.join(os.homedir(), '.tasks-helper.json');

async function creds() {
  if (fs.existsSync(HELPER_CREDS)) return JSON.parse(fs.readFileSync(HELPER_CREDS, 'utf8')); // vom Mac-Helfer
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('   Anmeldung für die App (dieselbe wie in der App unter Einstellungen → Sync):');
  const email = (await rl.question('   E-Mail: ')).trim();
  const password = await rl.question('   Passwort: ');
  rl.close();
  return { email, password };
}

// --config <name>: öffentlichen Wert aus js/config.js lesen (apiKey, projectId)
const ci = process.argv.indexOf('--config');
if (ci > 0) {
  const src = fs.readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
  console.log(src.match(new RegExp(process.argv[ci + 1] + '\\s*:\\s*["\']([^"\']+)'))?.[1] || '');
  process.exit(0);
}

let data = fs.existsSync(KEYS) ? JSON.parse(fs.readFileSync(KEYS, 'utf8')) : null;
if (process.argv.includes('--secrets')) {
  if (!data) { console.error('Erst ohne --secrets starten.'); process.exit(1); }
  process.stdout.write(JSON.stringify({ FB_EMAIL: data.email, FB_PASSWORD: data.password, VAPID_JWK: JSON.stringify(data.vapid) }));
} else {
  if (!data) {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const { email, password } = await creds();
    data = { email, password, vapid: privateKey.export({ format: 'jwk' }) };
    fs.writeFileSync(KEYS, JSON.stringify(data), { mode: 0o600 });
    console.log(`   Gespeichert in ${KEYS} (nur für dich lesbar).`);
  } else console.log('   Schlüssel vorhanden.');
}
