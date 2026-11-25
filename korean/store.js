// Datenhaltung + Sync wie Task-/Health-App: localStorage sofort, Firebase (users/<ID>/ko_*) wenn angemeldet.
// Alles liegt im Speicher + localStorage (offline, sofort da). Bist du angemeldet,
// geht jede Änderung zusätzlich nach Firebase (users/<deine-ID>/ko_*), andere Geräte bekommen sie live.

import { firebaseConfig } from '../js/config.js';

const KEY = 'ko-state-v1';
const PENDING_KEY = 'ko-pending-v1';
export const COLLECTIONS = ['ko_cards', 'ko_days', 'ko_meta', 'jobs', 'meta'];
const FB = '12.19.0';

const empty = () => Object.fromEntries(COLLECTIONS.map((c) => [c, {}]));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const state = load();
const listeners = new Set();
let pending = JSON.parse(localStorage.getItem(PENDING_KEY) || '{}');
let fb = null;

export const sync = { configured: !!firebaseConfig, status: firebaseConfig ? 'connecting' : 'off', user: null, error: '' };

function load() {
  try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return empty(); }
}
let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  }, 120);
}
export function subscribe(fn) { listeners.add(fn); }
function emit() { persist(); listeners.forEach((fn) => fn()); }

export const all = (c) => Object.values(state[c]);
export const get = (c, id) => state[c][id];

export function put(c, obj) {
  const now = Date.now();
  const doc = { ...obj, id: obj.id || uid(), updatedAt: now, createdAt: obj.createdAt || now };
  state[c][doc.id] = doc;
  queue(c, doc.id, 'set');
  emit();
  return doc;
}
export function patch(c, id, changes) { const cur = state[c][id]; if (cur) return put(c, { ...cur, ...changes }); }
export function remove(c, id) { delete state[c][id]; queue(c, id, 'del'); emit(); }

function queue(c, id, op) {
  if (!sync.configured) return;
  pending[`${c}/${id}`] = op;
  if (fb) flush();
}

export async function initSync() {
  if (!firebaseConfig) return;
  try {
    const base = `https://www.gstatic.com/firebasejs/${FB}`;
    const [appMod, fs, authMod] = await Promise.all([
      import(`${base}/firebase-app.js`), import(`${base}/firebase-firestore.js`), import(`${base}/firebase-auth.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    let db;
    try { db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }); }
    catch { db = fs.initializeFirestore(app, { localCache: fs.memoryLocalCache() }); }
    const auth = authMod.initializeAuth(app, { persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence] });
    const ctx = { fs, db, unsubs: [] };
    authReady({ authMod, auth });

    authMod.onAuthStateChanged(auth, (user) => {
      ctx.unsubs.forEach((u) => u()); ctx.unsubs = [];
      sync.user = user ? { email: user.email, uid: user.uid } : null;
      if (!user) { fb = null; sync.status = 'signed-out'; emit(); return; }
      fb = { ...ctx, uid: user.uid };
      const marker = `ko-synced-${user.uid}`;
      if (!localStorage.getItem(marker)) { // erster Login auf diesem Gerät: Lokales einmal hochladen
        COLLECTIONS.forEach((c) => Object.keys(state[c]).forEach((id) => { pending[`${c}/${id}`] ||= 'set'; }));
        localStorage.setItem(marker, '1');
      }
      flush();
      sync.status = 'online';
      COLLECTIONS.forEach((c) => {
        const ref = fs.collection(db, 'users', user.uid, c);
        ctx.unsubs.push(fs.onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
          snap.docChanges().forEach((ch) => {
            const k = `${c}/${ch.doc.id}`;
            if (pending[k]) return; // eigene, noch nicht hochgeladene Änderung gewinnt
            if (ch.type === 'removed') delete state[c][ch.doc.id];
            else {
              const d = ch.doc.data(), cur = state[c][ch.doc.id];
              if (!cur || (d.updatedAt || 0) >= (cur.updatedAt || 0)) state[c][ch.doc.id] = d;
            }
          });
          sync.status = snap.metadata.fromCache ? 'offline' : 'online';
          emit();
        }, (err) => { sync.status = 'error'; sync.error = err.message; emit(); }));
      });
      emit();
    });
  } catch (e) {
    console.warn('Firebase nicht erreichbar', e);
    sync.status = 'offline'; sync.error = 'Sync gerade nicht erreichbar. Änderungen werden später hochgeladen.';
    emit();
  }
}

function flush() {
  if (!fb) return;
  const { fs, db, uid: u } = fb;
  for (const [k, op] of Object.entries(pending)) {
    const [c, id] = k.split('/');
    const ref = fs.doc(db, 'users', u, c, id);
    const p = op === 'set' && state[c][id] ? fs.setDoc(ref, JSON.parse(JSON.stringify(state[c][id]))) : fs.deleteDoc(ref);
    delete pending[k];
    p.catch((err) => { console.warn('Sync-Fehler', k, err); sync.error = err.message; pending[k] = op; persist(); });
  }
  persist();
}

let authReady;
const authPromise = new Promise((r) => { authReady = r; });
export async function signIn(email, pw) { const { authMod, auth } = await authPromise; await authMod.signInWithEmailAndPassword(auth, email, pw); }
export async function signOutUser() { const { authMod, auth } = await authPromise; await authMod.signOut(auth); }

export const exportJSON = () => JSON.stringify({ app: 'korean', version: 1, exportedAt: new Date().toISOString(), data: state }, null, 2);
