// Tasks · Claude-Helfer für den Mac
// --------------------------------
// Läuft auf deinem Mac (im Hintergrund über install.command oder im Terminal über start.command).
// lässt Claude Code laufen (über dein Claude-Abo) und schreibt das Ergebnis zurück in die App.
//
// Sicherheit:
// - Claude darf hier NUR im Web suchen/lesen. Keine Befehle ausführen, keine Dateien ändern.
// - Deine Zugangsdaten liegen nur lokal in ~/.tasks-helper.json (nur für dich lesbar).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, getDocs, updateDoc, setDoc } from 'firebase/firestore';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CRED_FILE = path.join(os.homedir(), '.tasks-helper.json');
const WORK_DIR = path.join(os.homedir(), '.tasks-helper-work');
const TIMEOUT_MS = 10 * 60 * 1000;
const log = (...a) => console.log(new Date().toLocaleTimeString('de-DE'), ...a);

// ---------- 1. Firebase-Config aus der App lesen (js/config.js) ----------
// Installiert (Hintergrund): config.js liegt neben dem Helfer. Sonst: im Repo unter ../js/config.js
async function loadConfig() {
  const file = [path.join(HERE, 'config.js'), path.join(HERE, '..', 'js', 'config.js')].find((f) => fs.existsSync(f));
  if (!file) throw new Error('js/config.js nicht gefunden.');
  const src = fs.readFileSync(file, 'utf8');
  const mod = await import('data:text/javascript,' + encodeURIComponent(src));
  if (!mod.firebaseConfig) throw new Error('In js/config.js ist kein firebaseConfig eingetragen.');
  return mod.firebaseConfig;
}

// ---------- 2. Zugangsdaten (beim ersten Start abfragen) ----------
async function loadCredentials() {
  if (fs.existsSync(CRED_FILE)) return JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
  if (!process.stdin.isTTY) throw new Error('Keine Zugangsdaten gespeichert. Bitte install.command nochmal doppelklicken.');
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

// ---------- 5. Anmelden bei Firebase ----------
const AUTH_ERRORS = /invalid-credential|wrong-password|user-not-found|invalid-email|user-disabled/;
async function login() {
  const config = await loadConfig();
  const creds = await loadCredentials();
  const app = getApps()[0] || initializeApp(config);
  try {
    const user = (await signInWithEmailAndPassword(getAuth(app), creds.email, creds.password)).user;
    return { app, user };
  } catch (e) {
    // Nur bei falschem Passwort löschen. Bei Netzwerkfehlern (z. B. direkt nach dem Aufwachen)
    // behalten: der Hintergrunddienst startet dann einfach neu.
    if (AUTH_ERRORS.test(e.code || '')) {
      fs.rmSync(CRED_FILE, { force: true });
      throw Object.assign(new Error(`Anmeldung fehlgeschlagen (${e.code}). Zugangsdaten gelöscht. install.command nochmal starten.`), { badCredentials: true });
    }
    throw new Error(`Anmeldung gerade nicht möglich (${e.code || e.message}). Neuer Versuch gleich.`);
  }
}

// ---------- 6. Hauptprogramm ----------
async function main() {
  log('Tasks · Claude-Helfer startet');
  const claudePath = findClaude();
  log('Claude Code gefunden:', claudePath);
  const { app, user } = await login();
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

  // Schnell-Eingabe für den Mac-Kurzbefehl: POST http://127.0.0.1:7777/add  {"title": "..."}
  // Nur von diesem Mac erreichbar (127.0.0.1). Der Header "X-Tasks" muss gesetzt sein: Webseiten im Browser
  // können so einen Header nicht ohne Erlaubnis mitschicken, damit kann keine fremde Seite Aufgaben anlegen.
  const server = http.createServer((req, res) => {
    const reply = (code, text) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(text); };
    if (req.method === 'GET' && req.url === '/ping') return reply(200, 'ok');
    // Erlaubt: Header X-Tasks ODER JSON-Body. Beides kann eine fremde Webseite nicht ohne Erlaubnis schicken.
    const okHeader = !!req.headers['x-tasks'] || /application\/json/i.test(req.headers['content-type'] || '');
    if (req.method !== 'POST' || !req.url.startsWith('/add') || !okHeader) {
      log(`Schnell-Eingabe abgelehnt: ${req.method} ${req.url} (Header: ${Object.keys(req.headers).join(', ')})`);
      return reply(403, 'Abgelehnt: Methode muss POST sein und Header X-Tasks gesetzt.');
    }
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 10000) req.destroy(); });
    req.on('end', async () => {
      let title = body;
      try { const j = JSON.parse(body); title = j.title ?? j.text ?? ''; } catch {}
      title = String(title).trim();
      if (!title) { log(`Schnell-Eingabe ohne Titel. Empfangen: ${body.slice(0, 200)}`); return reply(400, 'Kein Titel angekommen. Im Kurzbefehl bei title die Variable "Provided Input" setzen.'); }
      const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
      const now = Date.now();
      try {
        await setDoc(doc(db, ...base, 'tasks', id), {
          id, title, notes: '', projectId: null, date: null, time: null, duration: 30,
          priority: '', status: 'todo', repeat: '', ai: false, createdAt: now, updatedAt: now,
        });
        log(`＋ Neue Aufgabe: ${title}`);
        reply(200, `In der Inbox: ${title}`);
      } catch (e) { log('Fehler beim Anlegen:', e.message); reply(500, 'Fehler: ' + e.message); }
    });
  });
  server.on('error', (e) => log('Schnell-Eingabe nicht verfügbar:', e.message));
  server.listen(7777, '127.0.0.1', () => log('Schnell-Eingabe bereit: http://127.0.0.1:7777/add'));

  async function handle(ref, job) {
    const label = job.type === 'plan' ? 'Wochenplanung' : `Aufgabe ${job.taskId}`;
    log(`▶ Starte: ${label}`);
    await updateDoc(ref, { status: 'running', startedAt: Date.now(), updatedAt: Date.now() });
    try {
      const result = await runClaude(claudePath, job.prompt, { web: job.type === 'task' });
      await updateDoc(ref, { status: 'done', result, finishedAt: Date.now(), updatedAt: Date.now() });
      // Ergebnis zeigt die App direkt aus dem Auftrag an (kurze Karte in der Aufgabe). Hier nur den Status zurücksetzen.
      if (job.type === 'task' && job.taskId) {
        const tRef = doc(db, ...base, 'tasks', job.taskId);
        const t = (await getDoc(tRef)).data();
        if (t && t.status === 'waiting') await updateDoc(tRef, { status: 'todo', updatedAt: Date.now() });
      }
      log(`✓ Fertig: ${label}`);
    } catch (e) {
      await updateDoc(ref, { status: 'error', error: e.message, updatedAt: Date.now() });
      log(`✗ Fehler bei ${label}: ${e.message}`);
    }
  }
}

// "--check": prüft, ob Claude Code gefunden wird und antwortet
async function selfTest() {
  const claudePath = findClaude();
  log('Claude Code gefunden:', claudePath);
  log('Frage Claude kurz an …');
  const answer = await runClaude(claudePath, 'Antworte nur mit dem Wort: BEREIT', { web: false });
  log('Antwort:', answer);
  log(/BEREIT/i.test(answer) ? '✓ Claude Code ist bereit.' : 'Antwort unerwartet, aber Claude Code läuft.');
}

// "--setup" (vom Installer): Zugangsdaten abfragen, Anmeldung und Claude testen, dann beenden
async function setup() {
  for (let i = 0; i < 3; i++) {
    try { const { user } = await login(); log('✓ Anmeldung klappt:', user.email); break; }
    catch (e) { if (!e.badCredentials || i === 2) throw e; console.log('✗ E-Mail oder Passwort falsch. Bitte nochmal eingeben.'); }
  }
  await selfTest();
  process.exit(0);
}

const mode = process.argv.includes('--setup') ? setup : process.argv.includes('--check') ? selfTest : main;
mode().catch((e) => { console.error('\n✗', e.message, '\n'); process.exit(1); });
