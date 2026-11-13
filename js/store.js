// Datenhaltung + Sync.
// Idee: Alle Daten liegen im Speicher (state) und zusätzlich im localStorage (offline, sofort da).
// Wenn Firebase eingerichtet ist und du angemeldet bist, wird jede Änderung auch in die Cloud geschrieben,
// und Änderungen von anderen Geräten kommen per "onSnapshot" automatisch rein.

import { firebaseConfig } from './config.js';
import { uid } from './util.js';

const KEY = 'taskapp-state-v1';
const PENDING_KEY = 'taskapp-pending-v1';
const FILES_KEY = 'taskapp-files-v1';
const COLLECTIONS = ['tasks', 'projects', 'entries', 'blocks', 'files', 'jobs', 'meta'];
const FB = '12.19.0'; // Firebase-Version (fest, damit nichts überraschend kaputtgeht)

const empty = () => ({ tasks: {}, projects: {}, entries: {}, blocks: {}, files: {}, jobs: {}, meta: {} });

export const state = load();
export const settings = loadSettings();
const listeners = new Set();
let pending = JSON.parse(localStorage.getItem(PENDING_KEY) || '{}'); // Änderungen, die noch in die Cloud müssen
let fb = null; // wird gesetzt, sobald Firebase verbunden ist

export const sync = { configured: !!firebaseConfig, status: firebaseConfig ? 'connecting' : 'off', user: null, error: '' };

function load() {
  try {
    const s = { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    s.files = JSON.parse(localStorage.getItem(FILES_KEY) || '{}');
    return s;
  } catch { return empty(); }
}

function loadSettings() {
  const defaults = { dayStart: 7, dayEnd: 23, sortMode: 'prio', sidebar: true, weeklyGoal: 20, theme: 'system', navCollapsed: false, keys: {} };
  try { return { ...defaults, ...JSON.parse(localStorage.getItem('taskapp-settings') || '{}') }; } catch { return defaults; }
}
export function saveSettings(patch) {
  Object.assign(settings, patch);
  localStorage.setItem('taskapp-settings', JSON.stringify(settings));
  emit();
}

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { files, ...rest } = state;
    try {
      localStorage.setItem(KEY, JSON.stringify(rest));
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      localStorage.setItem(FILES_KEY, JSON.stringify(files));
    } catch (e) {
      console.warn('localStorage voll', e);
      sync.error = 'Lokaler Speicher ist voll (meist wegen Anhängen). Mit Sync bleiben die Daten in der Cloud.';
    }
  }, 150);
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() {
  if (batching) { dirty = true; return; }
  persist();
  listeners.forEach((fn) => fn());
}

// ---- Lesen ----
export const all = (coll) => Object.values(state[coll]);
export const get = (coll, id) => state[coll][id];

// ---- Schreiben ----
export function put(coll, obj) {
  const now = Date.now();
  const doc = { ...obj, id: obj.id || uid(), updatedAt: now, createdAt: obj.createdAt || now };
  state[coll][doc.id] = doc;
  queue(coll, doc.id, 'set');
  emit();
  return doc;
}
export function patch(coll, id, changes) {
  const cur = state[coll][id];
  if (!cur) return;
  return put(coll, { ...cur, ...changes });
}
export function remove(coll, id) {
  delete state[coll][id];
  queue(coll, id, 'del');
  emit();
}
// Mehrere Änderungen auf einmal (z. B. Auto-Plan), nur ein Neuzeichnen
let batching = 0, dirty = false;
export function batch(fn) {
  batching++;
  try { fn(); } finally { batching--; if (!batching && dirty) { dirty = false; emit(); } }
}

function queue(coll, id, op) {
  if (!sync.configured) return;
  pending[`${coll}/${id}`] = op;
  if (fb) flush();
}

// ---- Firebase ----
export async function initSync() {
  if (!firebaseConfig) return;
  try {
    const base = `https://www.gstatic.com/firebasejs/${FB}`;
    const [appMod, fsMod, authMod] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-firestore.js`),
      import(`${base}/firebase-auth.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    let db;
    try {
      db = fsMod.initializeFirestore(app, { localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }) });
    } catch {
      db = fsMod.initializeFirestore(app, { localCache: fsMod.memoryLocalCache() });
    }
    const auth = authMod.initializeAuth(app, { persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence] });
    const ctx = { fs: fsMod, authMod, db, auth, unsubs: [] };
    authReady({ authMod, auth });

    authMod.onAuthStateChanged(auth, (user) => {
      ctx.unsubs.forEach((u) => u());
      ctx.unsubs = [];
      sync.user = user ? { email: user.email, uid: user.uid } : null;
      if (!user) { fb = null; sync.status = 'signed-out'; emit(); return; }
      fb = { ...ctx, uid: user.uid };
      // Beim ersten Login auf diesem Gerät: alles Lokale einmal hochladen
      const marker = `taskapp-synced-${user.uid}`;
      if (!localStorage.getItem(marker)) {
        COLLECTIONS.forEach((c) => Object.keys(state[c]).forEach((id) => { pending[`${c}/${id}`] ||= 'set'; }));
        localStorage.setItem(marker, '1');
      }
      flush();
      sync.status = 'online';
      COLLECTIONS.forEach((c) => {
        const ref = fsMod.collection(db, 'users', user.uid, c);
        ctx.unsubs.push(fsMod.onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
          const next = {};
          snap.forEach((d) => { next[d.id] = d.data(); });
          // Lokale Änderungen, die noch nicht hochgeladen sind, behalten
          Object.keys(pending).forEach((k) => {
            const [pc, pid] = k.split('/');
            if (pc !== c) return;
            if (pending[k] === 'set' && state[c][pid]) next[pid] = state[c][pid];
            if (pending[k] === 'del') delete next[pid];
          });
          state[c] = next;
          sync.status = snap.metadata.fromCache ? 'offline' : 'online';
          emit();
        }, (err) => { sync.status = 'error'; sync.error = err.message; emit(); }));
      });
      emit();
    });
  } catch (e) {
    console.warn('Firebase nicht erreichbar', e);
    sync.status = 'offline';
    sync.error = 'Sync gerade nicht erreichbar. Änderungen werden später hochgeladen.';
    emit();
  }
}

async function flush() {
  if (!fb) return;
  const { fs, db, uid: u } = fb;
  const entries = Object.entries(pending);
  for (const [k, op] of entries) {
    const [c, id] = k.split('/');
    const ref = fs.doc(db, 'users', u, c, id);
    // Firestore puffert Schreibvorgänge selbst, auch offline. Wir müssen nicht auf den Server warten.
    const p = op === 'set' && state[c][id] ? fs.setDoc(ref, clean(state[c][id])) : fs.deleteDoc(ref);
    delete pending[k];
    p.catch((err) => { console.warn('Sync-Fehler', k, err); sync.error = err.message; pending[k] = op; persist(); });
  }
  persist();
}
const clean = (o) => JSON.parse(JSON.stringify(o)); // entfernt undefined-Werte (mag Firestore nicht)

let authReady;
const authPromise = new Promise((r) => { authReady = r; });

export async function signIn(email, password) {
  if (!sync.configured) throw new Error('Sync ist noch nicht eingerichtet (config.js).');
  const { authMod, auth } = await authPromise;
  await authMod.signInWithEmailAndPassword(auth, email, password);
}
export async function signOutUser() {
  const { authMod, auth } = await authPromise;
  await authMod.signOut(auth);
}

// ---- Backup ----
export function exportJSON() {
  return JSON.stringify({ app: 'taskapp', version: 1, exportedAt: new Date().toISOString(), data: state }, null, 2);
}
export function importJSON(text) {
  const parsed = JSON.parse(text);
  const data = parsed.data || parsed;
  COLLECTIONS.forEach((c) => Object.values(data[c] || {}).forEach((doc) => {
    state[c][doc.id] = doc;
    queue(c, doc.id, 'set');
  }));
  emit();
}
