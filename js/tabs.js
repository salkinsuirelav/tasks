// Tabs oben (Mac, breite Fenster) – wie bei HeroSpace: mehrere Ansichten offen halten und zwischen ihnen springen.
// Jeder Tab merkt sich seine Ansicht (Hash) und hat seinen eigenen Zurück/Vor-Verlauf.
// Gespeichert pro Gerät (localStorage), nicht synchronisiert – wie das Design.
const KEY = 'taskapp-tabs';
const MAX = 12;
const newId = () => Math.random().toString(36).slice(2, 9);
const cur = () => location.hash || '#today';

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && Array.isArray(s.list) && s.list.length) {
      s.list = s.list.filter((t) => t && typeof t.hash === 'string').map((t) => ({ id: t.id || newId(), hash: t.hash, back: t.back || [], fwd: t.fwd || [] }));
      if (s.list.length) { if (!s.list.some((t) => t.id === s.active)) s.active = s.list[0].id; return s; }
    }
  } catch {}
  const id = newId();
  return { on: true, active: id, list: [{ id, hash: cur(), back: [], fwd: [] }] };
}
let st = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };

export const enabled = () => st.on !== false;
export const setEnabled = (on) => { st.on = !!on; save(); };
export const list = () => st.list;
export const active = () => st.list.find((t) => t.id === st.active) || st.list[0];
export const canBack = () => active().back.length > 0;
export const canFwd = () => active().fwd.length > 0;

// Sprung, den wir selbst auslösen (Tab wechseln, Zurück/Vor): kein neuer Verlaufseintrag
let jumping = null;
function go(hash) {
  if (cur() === hash) return false;
  jumping = hash;
  location.hash = hash;
  return true;
}

// Bei jeder Navigation (hashchange): gehört zum aktiven Tab
export function onNavigate() {
  const h = cur(), t = active();
  if (jumping === h) { jumping = null; t.hash = h; save(); return; }
  jumping = null;
  if (t.hash === h) return;
  t.back.push(t.hash); if (t.back.length > 50) t.back.shift();
  t.fwd = []; t.hash = h; save();
}

// Tab anklicken. Gibt false zurück, wenn sich die Adresse nicht ändert (dann selbst neu zeichnen).
export function select(id) {
  const t = st.list.find((x) => x.id === id);
  if (!t) return false;
  st.active = t.id; save();
  return go(t.hash);
}
// Neuer Tab rechts neben dem aktiven
export function open(hash = '#today') {
  if (st.list.length >= MAX) return null;
  const t = { id: newId(), hash, back: [], fwd: [] };
  const i = st.list.findIndex((x) => x.id === st.active);
  st.list.splice(i + 1, 0, t);
  st.active = t.id; save();
  go(hash);
  return t;
}
// Tab schließen. Der letzte Tab bleibt (springt dann auf Heute). Gibt den geschlossenen Tab + Position zurück (für Rückgängig).
export function close(id) {
  const i = st.list.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const t = st.list[i];
  if (st.list.length === 1) { onlyToday(t); return null; }
  st.list.splice(i, 1);
  let changed = false;
  if (st.active === id) { const n = st.list[Math.min(i, st.list.length - 1)]; st.active = n.id; changed = go(n.hash); }
  save();
  return { tab: t, index: i, changed };
}
function onlyToday(t) { if (t.hash !== '#today') { t.back.push(t.hash); t.fwd = []; t.hash = '#today'; save(); go('#today'); } }
export function restore({ tab, index }) {
  if (st.list.length >= MAX) return false;
  st.list.splice(Math.min(index, st.list.length), 0, tab);
  st.active = tab.id; save();
  return go(tab.hash);
}
export function back() {
  const t = active();
  if (!t.back.length) return false;
  t.fwd.push(t.hash); t.hash = t.back.pop(); save();
  return go(t.hash);
}
export function forward() {
  const t = active();
  if (!t.fwd.length) return false;
  t.back.push(t.hash); t.hash = t.fwd.pop(); save();
  return go(t.hash);
}
// Nächster / vorheriger Tab (rundherum)
export function cycle(d) {
  const i = st.list.findIndex((x) => x.id === st.active);
  return select(st.list[(i + d + st.list.length) % st.list.length].id);
}
// Umsortieren per Ziehen: Tab id vor den Tab beforeId (null = ans Ende)
export function move(id, beforeId) {
  const i = st.list.findIndex((x) => x.id === id);
  if (i < 0 || id === beforeId) return;
  const [t] = st.list.splice(i, 1);
  const j = beforeId ? st.list.findIndex((x) => x.id === beforeId) : -1;
  st.list.splice(j < 0 ? st.list.length : j, 0, t);
  save();
}
// App-Start: Tabs wiederherstellen. startHash = Adresse, mit der die App geöffnet wurde.
export function init(startHash) {
  const t = active();
  if (startHash && startHash !== t.hash) {
    const same = st.list.find((x) => x.hash === startHash);
    if (same) st.active = same.id; // Tab mit dieser Ansicht gibt es schon → den nehmen
    else { t.back.push(t.hash); t.fwd = []; t.hash = startHash; }
    save();
  } else if (!startHash) go(t.hash);
}
