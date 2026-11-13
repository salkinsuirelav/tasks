// Tasks · Claude-Helfer für den Mac
// --------------------------------
// Läuft auf deinem Mac im Terminal. Er wartet auf Aufträge aus deiner Tasks-App (über Firebase),
// lässt Claude Code laufen (über dein Claude-Abo) und schreibt das Ergebnis zurück in die App.
//
// Sicherheit:
// - Claude darf hier NUR im Web suchen/lesen. Keine Befehle ausführen, keine Dateien ändern.
// - Deine Zugangsdaten liegen nur lokal in ~/.tasks-helper.json (nur für dich lesbar).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, getDocs, updateDoc, setDoc } from 'firebase/firestore';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CRED_FILE = path.join(os.homedir(), '.tasks-helper.json');
const WORK_DIR = path.join(os.homedir(), '.tasks-helper-work');
const TIMEOUT_MS = 10 * 60 * 1000;
const log = (...a) => console.log(new Date().toLocaleTimeString('de-DE'), ...a);

// ---------- 1. Firebase-Config aus der App lesen (js/config.js) ----------
async function loadConfig() {
  const src = fs.readFileSync(path.join(HERE, '..', 'js', 'config.js'), 'utf8');
  const mod = await import('data:text/javascript,' + encodeURIComponent(src));
  if (!mod.firebaseConfig) throw new Error('In js/config.js ist kein firebaseConfig eingetragen.');
  return mod.firebaseConfig;
}

// ---------- 2. Zugangsdaten (beim ersten Start abfragen) ----------
async function loadCredentials() {
  if (fs.existsSync(CRED_FILE)) return JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('\nErster Start: Melde dich mit deinem Tasks-Konto an (dasselbe wie in der App).');
  const email = (await rl.question('E-Mail: ')).trim();
  const password = await rl.question('Passwort: ');
  rl.close();
  fs.writeFileSync(CRED_FILE, JSON.stringify({ email, password }), { mode: 0o600 });
  console.log(`Gespeichert in ${CRED_FILE} (nur für dich lesbar).\n`);
  return { email, password };
}

// ---------- 3. Claude Code finden ----------
function findClaude() {
  const candidates = [
    path.join(os.homedir(), '.local/bin/claude'),
    path.join(os.homedir(), '.claude/local/claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];
  try { const p = execSync('command -v claude', { encoding: 'utf8', shell: '/bin/zsh' }).trim(); if (p) candidates.unshift(p); } catch {}
  const found = candidates.find((p) => p && fs.existsSync(p));
  if (!found) throw new Error('Claude Code nicht gefunden. Installieren: https://claude.com/claude-code – danach einmal "claude" im Terminal starten und anmelden.');
  return found;
}

// ---------- 4. Claude ausführen ----------
const BLOCKED = 'Bash,Edit,Write,MultiEdit,NotebookEdit,Task';
function runClaude(claudePath, prompt, { web }) {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const args = ['-p', '--output-format', 'json', '--disallowedTools', web ? BLOCKED : `${BLOCKED},WebSearch,WebFetch`];
  if (web) args.push('--allowedTools', 'WebSearch,WebFetch');
  return new Promise((resolve, reject) => {
    const child = spawn(claudePath, args, { cwd: WORK_DIR, env: process.env });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Zeitüberschreitung (10 Min).')); }, TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      let parsed = null;
      try { parsed = JSON.parse(out); } catch {}
      if (parsed?.is_error || (code !== 0 && !parsed)) {
        const msg = parsed?.result || err.trim() || out.trim() || `Claude Code beendet mit Code ${code}`;
        return reject(new Error(/login|auth/i.test(msg) ? `Claude Code ist nicht angemeldet. Im Terminal "claude" starten und anmelden. (${msg.slice(0, 200)})` : msg.slice(0, 500)));
      }
      resolve((parsed?.result ?? out).trim());
    });
    child.stdin.end(prompt);
  });
}

// ---------- 5. Hauptprogramm ----------
async function main() {
  console.log('┌──────────────────────────────────────┐');
  console.log('│  Tasks · Claude-Helfer               │');
  console.log('│  Fenster offen lassen. Beenden: ⌃C   │');
  console.log('└──────────────────────────────────────┘');
  const claudePath = findClaude();
  log('Claude Code gefunden:', claudePath);
  const config = await loadConfig();
  const creds = await loadCredentials();

  const app = initializeApp(config);
  const auth = getAuth(app);
  let user;
  try {
    user = (await signInWithEmailAndPassword(auth, creds.email, creds.password)).user;
  } catch (e) {
    fs.rmSync(CRED_FILE, { force: true });
    throw new Error(`Anmeldung fehlgeschlagen (${e.code || e.message}). Zugangsdaten gelöscht, beim nächsten Start neu eingeben.`);
  }
  log('Angemeldet als', user.email);
  const db = getFirestore(app);
  const base = ['users', user.uid];

  // Lebenszeichen, damit die App "Mac-Helfer online" anzeigt
  const beat = () => setDoc(doc(db, ...base, 'meta', 'helper'), { id: 'helper', lastSeen: Date.now(), host: os.hostname().replace(/\.local$/, ''), updatedAt: Date.now(), createdAt: Date.now() }).catch((e) => log('Heartbeat-Fehler:', e.message));
  beat();
  setInterval(beat, 60000);

  // Aufträge, die beim letzten Mal hängen geblieben sind, neu einreihen
  const stuck = await getDocs(query(collection(db, ...base, 'jobs'), where('status', '==', 'running')));
  for (const d of stuck.docs) await updateDoc(d.ref, { status: 'queued', updatedAt: Date.now() });

  // Warteschlange: ein Auftrag nach dem anderen
  const seen = new Set();
  let chain = Promise.resolve();
  onSnapshot(query(collection(db, ...base, 'jobs'), where('status', '==', 'queued')), (snap) => {
    snap.docs.forEach((d) => {
      if (seen.has(d.id)) return;
      seen.add(d.id);
      chain = chain.then(() => handle(d.ref, d.data())).finally(() => seen.delete(d.id));
    });
  }, (e) => log('Fehler beim Zuhören:', e.message));
  log('Warte auf Aufträge …');

  async function handle(ref, job) {
    const label = job.type === 'plan' ? 'Wochenplanung' : `Aufgabe ${job.taskId}`;
    log(`▶ Starte: ${label}`);
    await updateDoc(ref, { status: 'running', startedAt: Date.now(), updatedAt: Date.now() });
    try {
      const result = await runClaude(claudePath, job.prompt, { web: job.type === 'task' });
      await updateDoc(ref, { status: 'done', result, finishedAt: Date.now(), updatedAt: Date.now() });
      if (job.type === 'task' && job.taskId) {
        const tRef = doc(db, ...base, 'tasks', job.taskId);
        const t = (await getDoc(tRef)).data();
        if (t) {
          const stamp = new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
          const notes = `${t.notes ? t.notes.trimEnd() + '\n\n' : ''}— Claude · ${stamp} —\n${result}`;
          await updateDoc(tRef, { notes, status: t.status === 'waiting' ? 'todo' : t.status, updatedAt: Date.now() });
        }
      }
      log(`✓ Fertig: ${label}`);
    } catch (e) {
      await updateDoc(ref, { status: 'error', error: e.message, updatedAt: Date.now() });
      log(`✗ Fehler bei ${label}: ${e.message}`);
    }
  }
}

// "npm run check": prüft nur, ob Claude Code gefunden wird und antwortet
async function selfTest() {
  const claudePath = findClaude();
  log('Claude Code gefunden:', claudePath);
  log('Frage Claude kurz an …');
  const answer = await runClaude(claudePath, 'Antworte nur mit dem Wort: BEREIT', { web: false });
  log('Antwort:', answer);
  log(/BEREIT/i.test(answer) ? '✓ Alles bereit.' : 'Antwort unerwartet, aber Claude Code läuft.');
}

(process.argv.includes('--check') ? selfTest() : main()).catch((e) => { console.error('\n✗', e.message, '\n'); process.exit(1); });
