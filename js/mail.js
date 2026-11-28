// Mail: Gmail direkt im Browser (Google-Login + Gmail-API) und Apple Mail (iCloud) über den Mac-Helfer.
// Beide landen in einem gemeinsamen Posteingang, Aufbau wie die Mail-Ansicht von HeroSpace.
// iCloud hat keine Web-Schnittstelle: Der Helfer holt die Mails per IMAP und gibt sie nur an die App auf
// demselben Mac weiter (http://127.0.0.1:7777/mail/...). Auf dem iPhone geht Apple Mail deshalb nicht.
// Datenschutz: Mails liegen nur im Arbeitsspeicher dieses Geräts. Nichts davon landet in Firebase.
// Bilder aus dem Netz (oft Zählpixel) werden erst nach Klick geladen.
import * as store from './store.js';
import { ui, isMobile } from './ui.js';
import { icon } from './icons.js';
import { head } from './views.js';
import { esc, today, addDays } from './util.js';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
const HELPER = 'http://127.0.0.1:7777/mail/';
const GUIDE = 'https://github.com/salkinsuirelav/tasks/blob/main/APPLEMAIL.md';
const TOK = 'taskapp-gtok', ACC = 'taskapp-gmail-account', ICL = 'taskapp-icloud-account';
export const clientId = () => (store.settings.gmailClientId || '').trim();

const ls = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
// Zugriffsschlüssel von Google gilt 1 Stunde und bleibt nur in diesem Tab (sessionStorage)
let tok = (() => { try { const t = JSON.parse(sessionStorage.getItem(TOK) || 'null'); return t && t.exp > Date.now() ? t : null; } catch { return null; } })();
const saveTok = () => { try { tok ? sessionStorage.setItem(TOK, JSON.stringify(tok)) : sessionStorage.removeItem(TOK); } catch {} };
// st = Gmail (+ gemeinsamer Speicher für geöffnete Mails), ic = Apple Mail (iCloud)
// list = Mails im gerade gewählten Ordner (folder), cache = zuletzt geladene Listen der anderen Ordner
export const st = { account: ls(ACC), list: null, loading: false, error: null, full: {}, imgs: {}, folder: 'inbox', cache: {}, seq: 0 };
export const ic = { account: ls(ICL), list: null, loading: false, error: null, code: null, v: null, busy: false, folder: 'inbox', cache: {}, seq: 0 };
export const connected = () => !!st.account || !!ic.account;
export const hasToken = () => !!tok && tok.exp > Date.now();
const both = () => !!st.account && !!ic.account;
// Ordner, für Gmail und iCloud gleich: [Schlüssel, Name, Symbol]
export const FOLDERS = [['inbox', 'Posteingang', 'inbox'], ['archive', 'Archiv', 'archive'], ['sent', 'Gesendet', 'send'], ['spam', 'Spam', 'spam'], ['trash', 'Papierkorb', 'trash']];
export const folder = () => (FOLDERS.some((f) => f[0] === ui.mailFolder) ? ui.mailFolder : 'inbox');
const fInfo = (f) => FOLDERS.find((x) => x[0] === f) || FOLDERS[0];
const MOVABLE = ['archive', 'spam', 'trash']; // von dort geht „In den Posteingang“

const listeners = new Set();
export const onMail = (fn) => listeners.add(fn);
const notify = () => listeners.forEach((f) => f());

// ---------- Google-Login (Google Identity Services, Pop-up) ----------
let gisP = null;
const loadGis = () => gisP ||= new Promise((res, rej) => {
  if (window.google?.accounts?.oauth2) return res();
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
  s.onload = () => res(); s.onerror = () => { gisP = null; rej(new Error('Google-Login konnte nicht geladen werden. Bist du online?')); };
  document.head.appendChild(s);
});
// Muss direkt aus einem Klick kommen, sonst blockiert der Browser das Pop-up
export async function signIn() {
  if (!clientId()) throw new Error('Zuerst die Client-ID eintragen.');
  if (!window.google?.accounts?.oauth2) await loadGis(); // schon geladen: Pop-up öffnet noch im selben Klick
  await new Promise((res, rej) => {
    const c = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId(), scope: SCOPE, login_hint: st.account || undefined,
      prompt: st.account ? '' : 'consent',
      callback: (r) => {
        if (r.error) return rej(new Error(r.error === 'access_denied' ? 'Zugriff wurde nicht erlaubt.' : r.error));
        if (!window.google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) return rej(new Error('Bitte beim Google-Login das Häkchen für Gmail setzen.'));
        tok = { at: r.access_token, exp: Date.now() + (Number(r.expires_in || 3600) - 60) * 1000 }; saveTok(); res();
      },
      error_callback: (e) => rej(new Error(e?.type === 'popup_closed' ? 'Anmeldefenster geschlossen.' : 'Anmeldung fehlgeschlagen.')),
    });
    c.requestAccessToken();
  });
  if (!st.account) { const p = await g('/profile'); st.account = p.emailAddress; lsSet(ACC, st.account); }
  st.error = null; ui.mailSetup = false;
  return gmRefresh();
}
// Automatisch erneuern: Google gibt Web-Apps den Zugriff immer nur für 1 Stunde. Beim ersten Klick in Mail
// (oder auf „Mail“) holt die App einen neuen. Google fragt dabei nichts, das Fenster blitzt nur kurz auf.
// Ein Pop-up geht nur direkt aus einem Klick. Klappt es nicht, 1 Minute Pause, dann bleibt „Weiter mit Google“.
let renewing = false, renewFail = 0;
export const renewingNow = () => renewing;
export const needsRenew = () => !!st.account && !!clientId() && !renewing && Date.now() - renewFail > 60000 && (!tok || tok.exp - Date.now() < 5 * 60000);
export function autoRenew() {
  if (!needsRenew()) return;
  renewing = true;
  setTimeout(notify, 0);
  signIn().catch(() => { renewFail = Date.now(); }).finally(() => { renewing = false; notify(); });
}
export const preloadGis = () => { if (st.account && clientId()) loadGis().catch(() => {}); };
export function signOut() {
  if (tok && window.google?.accounts?.oauth2) try { window.google.accounts.oauth2.revoke(tok.at, () => {}); } catch {}
  if (mailById(ui.mailOpen)?.src === 'gm') ui.mailOpen = null;
  tok = null; saveTok(); st.account = null; lsSet(ACC, null); st.list = null; st.cache = {}; st.error = null;
  notify();
}

// ---------- Gmail-API ----------
async function g(path, opts = {}) {
  if (!hasToken()) { tok = null; saveTok(); throw new Error('auth'); }
  const r = await fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${tok.at}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (r.status === 401) { tok = null; saveTok(); throw new Error('auth'); }
  if (!r.ok) throw Object.assign(new Error(`Gmail antwortet gerade nicht (${r.status}).`), { status: r.status });
  return r.status === 204 ? null : r.json();
}
// Mehrere Abrufe gleichzeitig, aber nicht alle auf einmal
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}
const decodeEnt = (s) => { const t = document.createElement('textarea'); t.innerHTML = s || ''; return t.value; };
const hdr = (m, name) => (m.payload?.headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
function parseFrom(v) {
  v = String(v || '');
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || m[2], email: m[2].trim() } : { name: v.trim() || '(unbekannt)', email: v.trim() };
}
const CATS = { CATEGORY_UPDATES: 'Updates', CATEGORY_PROMOTIONS: 'Werbung', CATEGORY_SOCIAL: 'Soziale Netzwerke', CATEGORY_FORUMS: 'Foren' };
// Empfänger für die Liste in „Gesendet“: erster Empfänger + wie viele noch
const toOf = (raw) => { const a = splitAddrs(raw); return a.length ? { to: parseFrom(a[0].raw), toMore: a.length - 1 } : { to: null, toMore: 0 }; };
function parseMeta(m, f = 'inbox') {
  const from = parseFrom(hdr(m, 'From'));
  const labels = m.labelIds || [];
  return {
    id: m.id, src: 'gm', folder: f, ...toOf(hdr(m, 'To')), threadId: m.threadId, from, subject: hdr(m, 'Subject') || '(ohne Betreff)', snippet: decodeEnt(m.snippet),
    at: Number(m.internalDate) || Date.parse(hdr(m, 'Date')) || Date.now(),
    unread: labels.includes('UNREAD'), starred: labels.includes('STARRED'), important: labels.includes('IMPORTANT'),
    cat: Object.keys(CATS).find((c) => labels.includes(c)) || null,
  };
}
// Ordner in Gmail: Labels. Archiv = alles, was nicht im Posteingang, gesendet oder Entwurf ist (Spam und Papierkorb sind ohnehin raus).
const GQ = {
  inbox: 'labelIds=INBOX',
  archive: 'q=' + encodeURIComponent('-in:inbox -in:sent -in:drafts'),
  sent: 'labelIds=SENT',
  spam: 'labelIds=SPAM&includeSpamTrash=true',
  trash: 'labelIds=TRASH&includeSpamTrash=true',
};
async function gmRefresh() {
  if (!st.account || !hasToken()) { notify(); return; }
  const f = st.folder, n = ++st.seq; // Ordner gewechselt, während geladen wird: Ergebnis in den Zwischenspeicher
  st.loading = true; st.error = null; notify();
  try {
    const j = await g(`/messages?maxResults=40&${GQ[f]}`);
    const ids = (j.messages || []).map((m) => m.id);
    const metas = await pool(ids, 8, (id) => g(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`));
    const list = metas.filter(Boolean).map((m) => parseMeta(m, f)).sort((a, b) => b.at - a.at);
    if (st.folder === f) { st.list = list; st.at = Date.now(); } else st.cache[f] = list;
  } catch (e) { if (e.message !== 'auth' && st.folder === f) st.error = e.message; } finally { if (n === st.seq) st.loading = false; notify(); }
}
// Ganze Mail laden (beim Öffnen) und als gelesen markieren
const b64 = (s) => { const bin = atob((s || '').replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); };
function bodyOf(p, kind) {
  if (!p) return null;
  if (p.mimeType === kind && p.body?.data) return b64(p.body.data);
  for (const c of p.parts || []) { const r = bodyOf(c, kind); if (r) return r; }
  return null;
}
// Anhänge (ohne eingebettete Bilder mit Content-ID)
function attsOf(p, out = []) {
  if (!p) return out;
  const ph = (n) => (p.headers || []).find((h) => h.name.toLowerCase() === n)?.value || '';
  if (p.filename && p.body?.attachmentId && !(ph('content-id') && !/^attachment/i.test(ph('content-disposition')))) out.push({ name: p.filename, size: p.body.size || 0, type: p.mimeType || '' });
  for (const c of p.parts || []) attsOf(c, out);
  return out;
}

// ---------- Apple Mail (iCloud) über den Mac-Helfer ----------
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
// Warum der Helfer nicht antwortet: aus dem Lebenszeichen in Firebase ablesbar (online? neue Version?)
function unreachable() {
  if (isIOS()) return ['ios', 'Apple Mail geht in der Task-App nur auf dem Mac (über den Mac-Helfer). Auf dem iPhone nutzt du die Mail-App.'];
  const h = store.get('meta', 'helper');
  if (!h || Date.now() - h.lastSeen > 150000) return ['off', 'Der Mac-Helfer läuft gerade nicht. Apple Mail kommt über ihn, also zuerst den Helfer starten (status.command).'];
  if (!(h.features || []).includes('mail-icloud')) return ['old', 'Der Mac-Helfer ist noch die alte Version. Einmal updaten, siehe Anleitung Schritt 2.'];
  return ['blocked', 'Der Mac-Helfer ist online, aber dieser Browser erreicht ihn nicht. Läuft die App auf demselben Mac wie der Helfer? Sonst die App in Zen oder Chrome öffnen.'];
}
async function hx(path, body) {
  let r;
  try {
    r = await fetch(HELPER + path, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { 'X-Tasks': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { const [code, msg] = unreachable(); throw Object.assign(new Error(msg), { code }); }
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) throw Object.assign(new Error(j.message || `Mac-Helfer: Fehler ${r.status}`), { code: j.error || 'error' });
  return j;
}
// „Verbinden“: fragt den Helfer, ob iCloud eingerichtet ist
export async function icConnect() {
  ic.busy = true; ic.error = null; ic.code = null; notify();
  try {
    const s = await hx('status');
    if (!s.configured) throw Object.assign(new Error('Auf diesem Mac ist Apple Mail noch nicht eingerichtet. Führe mail-setup.command aus (Anleitung Schritt 3).'), { code: 'setup' });
    ic.account = s.account; lsSet(ICL, s.account); ui.mailSetup = false;
    ic.busy = false;
    await icRefresh();
  } catch (e) { ic.error = e.message; ic.code = e.code; } finally { ic.busy = false; notify(); }
}
export function icDisconnect() {
  if (mailById(ui.mailOpen)?.src === 'ic') ui.mailOpen = null;
  ic.account = null; lsSet(ICL, null); ic.list = null; ic.cache = {}; ic.error = null; ic.code = null;
  notify();
}
// UIDs gelten nur je Ordner: Posteingang „ic5“, andere Ordner „ic-archive-5“
const icId = (f, uid) => (f === 'inbox' ? 'ic' + uid : `ic-${f}-${uid}`);
const icMeta = (x, f = 'inbox', v = null) => ({
  id: icId(f, x.uid), uid: x.uid, src: 'ic', folder: f, v, ...toOf(x.to), from: parseFrom(x.from), subject: x.subject || '(ohne Betreff)', snippet: x.snippet || '',
  at: x.at || Date.now(), unread: !!x.unread, starred: !!x.flagged, mid: x.mid || '', cat: null,
});
async function icRefresh() {
  if (!ic.account) return;
  const f = ic.folder, n = ++ic.seq;
  ic.loading = true; ic.error = null; ic.code = null; notify();
  try {
    const j = await hx(`list?n=40${f === 'inbox' ? '' : '&box=' + f}`);
    // Alter Helfer kennt keine Ordner und schickt den Posteingang
    if (f !== 'inbox' && j.box !== f) throw Object.assign(new Error('Für die Ordner braucht es den neuen Mac-Helfer. Einmal updaten, siehe Anleitung Schritt 2.'), { code: 'old' });
    const list = (j.list || []).map((x) => icMeta(x, f, j.v));
    if (f === 'inbox') ic.v = j.v;
    if (ic.folder === f) { ic.list = list; ic.at = Date.now(); } else ic.cache[f] = list;
    if (j.account && j.account !== ic.account) { ic.account = j.account; lsSet(ICL, j.account); }
  } catch (e) { if (ic.folder === f) { ic.error = e.message; ic.code = e.code; } } finally { if (n === ic.seq) ic.loading = false; notify(); }
}
// Ordner-Angaben für den Helfer (Posteingang ohne, damit auch der alte Helfer passt)
const icAt = (m) => ({ uid: m.uid, v: m.v || ic.v, ...(m.folder && m.folder !== 'inbox' ? { box: m.folder } : {}) });
// Posteingang hat sich in iCloud geändert: neu laden
const icStale = (e) => { if (e.code === 'stale') icRefresh(); return e; };

// ---------- Gemeinsam ----------
export function refresh() { return Promise.all([gmRefresh(), icRefresh()]); }
// Ordner wechseln: zuletzt geladene Liste sofort zeigen, dann frisch laden
function useFolder(f) {
  for (const s of [st, ic]) {
    if (s.folder === f) continue;
    if (s.list) s.cache[s.folder] = s.list;
    s.folder = f; s.list = s.cache[f] || null; s.error = null; s.loading = false;
    if (s === ic) ic.code = null;
  }
}
export function setFolder(f) {
  ui.mailFolder = f; ui.mailOpen = null;
  useFolder(folder());
  notify();
  return refresh();
}
export const icRetry = () => icRefresh();
export const allMail = () => [...(st.list || []), ...(ic.list || [])].sort((a, b) => b.at - a.at);
export const mailById = (id) => (id ? (st.list || []).find((x) => x.id === id) || (ic.list || []).find((x) => x.id === id) : null);
// Liste, in die eine Mail gehört (auch wenn gerade ein anderer Ordner offen ist)
const listOf = (m) => { const s = m.src === 'ic' ? ic : st, f = m.folder || 'inbox'; return s.folder === f ? s.list : s.cache[f]; };
export const gmailLink = (m) => `https://mail.google.com/mail/u/${encodeURIComponent(st.account || '0')}/#${m.folder === 'spam' ? 'spam' : m.folder === 'trash' ? 'trash' : 'all'}/${m.threadId}`;
// Apple Mail auf dem Mac öffnet eine Mail über ihre Message-ID (message://<…>)
export const mailLink = (m) => (m.src === 'ic' ? (m.mid ? `message://${encodeURIComponent(m.mid)}` : '') : gmailLink(m));

export async function openMail(id) {
  ui.mailOpen = id; notify();
  const m = mailById(id);
  if (!m) return;
  if (!st.full[id]) {
    try {
      if (m.src === 'ic') {
        const a = icAt(m);
        const f = await hx(`msg?uid=${a.uid}&v=${encodeURIComponent(a.v || '')}${a.box ? '&box=' + a.box : ''}`);
        st.full[id] = { html: f.html, text: f.text, to: f.to, cc: f.cc, attachments: f.attachments || [], truncated: f.truncated, subject: f.subject, mid: f.mid || m.mid, refs: f.refs, replyTo: f.replyTo };
        if (f.mid && !m.mid) m.mid = f.mid;
      } else {
        const full = await g(`/messages/${id}?format=full`);
        // Kopfzeilen fürs Antworten merken (richtiger Verlauf: Message-ID, References, Reply-To)
        st.full[id] = {
          html: bodyOf(full.payload, 'text/html'), text: bodyOf(full.payload, 'text/plain'), to: hdr(full, 'To'), cc: hdr(full, 'Cc'),
          attachments: attsOf(full.payload), subject: hdr(full, 'Subject'), mid: hdr(full, 'Message-ID'), refs: hdr(full, 'References'), replyTo: hdr(full, 'Reply-To'),
        };
      }
    } catch (e) { icStale(e); st.full[id] = { error: e.message === 'auth' ? 'Google-Anmeldung abgelaufen.' : e.message }; }
  }
  if (m.unread && !st.full[id]?.error) {
    m.unread = false;
    (m.src === 'ic' ? hx('seen', { ...icAt(m), seen: true }) : g(`/messages/${id}/modify`, { method: 'POST', body: JSON.stringify({ removeLabelIds: ['UNREAD'] }) })).catch(() => {});
  }
  notify();
}
export async function setUnread(id, unread) {
  const m = mailById(id); if (!m) return;
  m.unread = unread; notify();
  try {
    if (m.src === 'ic') await hx('seen', { ...icAt(m), seen: !unread });
    else await g(`/messages/${id}/modify`, { method: 'POST', body: JSON.stringify(unread ? { addLabelIds: ['UNREAD'] } : { removeLabelIds: ['UNREAD'] }) });
  } catch (e) { m.unread = !unread; notify(); throw icStale(e); }
}
// Archivieren = aus dem Posteingang nehmen. Gmail: bleibt unter „Alle Nachrichten“. iCloud: Ordner „Archive“.
export async function archive(id) {
  const m = mailById(id); if (!m) return null;
  const L = listOf(m), i = L.indexOf(m);
  const next = ui.mailOpen === id ? nextAfter(id) : undefined;
  L.splice(i, 1);
  if (ui.mailOpen === id) ui.mailOpen = null;
  if (next) openMail(next);
  delete (m.src === 'ic' ? ic : st).cache.archive;
  notify();
  try {
    if (m.src === 'ic') { const r = await hx('archive', { uid: m.uid, v: m.v || ic.v }); return { m, i, box: r.box, newUid: r.uid }; }
    await g(`/messages/${id}/modify`, { method: 'POST', body: JSON.stringify({ removeLabelIds: ['INBOX'] }) });
    return { m, i };
  } catch (e) { L.splice(i, 0, m); notify(); throw icStale(e); }
}
export async function unarchive({ m, i, box, newUid }) {
  if (m.src === 'ic') {
    const r = await hx('unarchive', { box, uid: newUid, mid: m.mid });
    if (!r.uid) return icRefresh(); // neue Nummer unbekannt: einfach neu laden
    const old = m.id;
    m.uid = r.uid; m.id = 'ic' + r.uid;
    if (st.full[old]) { st.full[m.id] = st.full[old]; delete st.full[old]; }
  } else await g(`/messages/${m.id}/modify`, { method: 'POST', body: JSON.stringify({ addLabelIds: ['INBOX'] }) });
  const L = listOf(m);
  if (L) { L.splice(Math.min(i, L.length), 0, m); notify(); }
}
// „In den Posteingang“ aus Archiv, Spam oder Papierkorb. Gmail: Label INBOX wieder dran (Spam: SPAM weg,
// Papierkorb: erst zurückholen). iCloud: in den Posteingang verschieben.
export async function restore(id) {
  const m = mailById(id); if (!m || !MOVABLE.includes(m.folder)) return null;
  const L = listOf(m), i = L.indexOf(m);
  const next = ui.mailOpen === id ? nextAfter(id) : undefined;
  L.splice(i, 1);
  if (ui.mailOpen === id) ui.mailOpen = null;
  if (next) openMail(next);
  delete (m.src === 'ic' ? ic : st).cache.inbox;
  notify();
  try {
    if (m.src === 'ic') { const r = await hx('move', { from: m.folder, to: 'inbox', uid: m.uid, v: m.v, mid: m.mid }); return { m, i, newUid: r.uid }; }
    if (m.folder === 'trash') await g(`/messages/${id}/untrash`, { method: 'POST' });
    await g(`/messages/${id}/modify`, { method: 'POST', body: JSON.stringify({ addLabelIds: ['INBOX'], ...(m.folder === 'spam' ? { removeLabelIds: ['SPAM'] } : {}) }) });
    return { m, i };
  } catch (e) { L.splice(i, 0, m); notify(); throw icStale(e); }
}
// Rückgängig: wieder zurück in den Ordner
export async function unrestore({ m, i, newUid }) {
  if (m.src === 'ic') {
    const r = await hx('move', { from: 'inbox', to: m.folder, uid: newUid || undefined, mid: m.mid });
    const old = m.id;
    if (r.uid) { m.uid = r.uid; m.id = icId(m.folder, r.uid); if (st.full[old]) { st.full[m.id] = st.full[old]; delete st.full[old]; } }
    else { delete ic.cache[m.folder]; return ic.folder === m.folder ? icRefresh() : undefined; } // neue Nummer unbekannt: neu laden
  } else if (m.folder === 'trash') await g(`/messages/${m.id}/trash`, { method: 'POST' });
  else await g(`/messages/${m.id}/modify`, { method: 'POST', body: JSON.stringify({ removeLabelIds: ['INBOX'], ...(m.folder === 'spam' ? { addLabelIds: ['SPAM'] } : {}) }) });
  delete (m.src === 'ic' ? ic : st).cache.inbox;
  const L = listOf(m);
  if (L && !L.includes(m)) { L.splice(Math.min(i, L.length), 0, m); notify(); }
}

// ---------- Ansicht ----------
const COLORS = ['#e5484d', '#f76b15', '#e2a336', '#30a46c', '#12a594', '#0090ff', '#6e56cf', '#d6409f', '#8d8d86'];
// Profilbilder der Absender lassen sich in den Einstellungen ausblenden
export const showAvatars = () => store.settings.mailAvatars !== false;
const avatar = (from, size = 28) => {
  if (!showAvatars()) return '';
  const s = from.name || from.email || '?';
  let h = 0; for (const ch of from.email || s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const c = COLORS[h % COLORS.length];
  return `<span class="m-av" style="--c:${c};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px">${esc((s.match(/[A-Za-zÀ-ž0-9가-힣]/) || ['?'])[0].toUpperCase())}</span>`;
};
const fmtTime = (at) => {
  const d = new Date(at), t = today(), ds = d.toISOString().slice(0, 10);
  const loc = new Date(at - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (loc === t) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (loc >= addDays(t, -6)) return d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }).replace('.', '') + (ds.slice(0, 4) !== t.slice(0, 4) ? ' ' + ds.slice(0, 4) : '');
};
const groupOf = (at) => {
  const d = new Date(at), loc = new Date(at - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10), t = today();
  if (loc === t) return 'Heute';
  if (loc === addDays(t, -1)) return 'Gestern';
  if (loc >= addDays(t, -6)) return 'Diese Woche';
  return 'Älter';
};
const fsize = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const errLine = (s) => `<p class="fin-note m-err">${esc(s)}</p>`;

function gmCard() {
  const cid = clientId();
  if (st.account) return `
      <div class="panel m-acc">
        <div class="m-acc-h"><span class="m-acc-ic gm">${icon('mail')}</span><div><h4>Gmail</h4><p class="muted">Verbunden: <b>${esc(st.account)}</b></p></div></div>
        <div class="m-acc-btns">${hasToken() ? '' : `<button class="btn primary" data-action="mail-signin">${icon('mail')} Weiter mit Google</button>`}<button class="btn" data-action="mail-signout">${icon('logout')} Trennen</button></div>
      </div>`;
  return `
      <div class="panel m-acc">
        <div class="m-acc-h"><span class="m-acc-ic gm">${icon('mail')}</span><div><h4>Gmail</h4><p class="muted">Posteingang lesen, archivieren, Mails schreiben und beantworten, Mail → Aufgabe</p></div></div>
        ${cid && !ui.mailCidEdit ? `<button class="btn primary" data-action="mail-signin">${icon('mail')} Mit Google anmelden</button>
          <p class="fin-note">Client-ID ist eingetragen. <a href="#" data-action="mail-cid-edit">Ändern</a></p>`
        : `<p class="m-steps">Einmalig: In der Google Cloud Console ein kleines Projekt anlegen und dort eine <b>Client-ID</b> erstellen (Webanwendung, Herkunft <code>https://salkinsuirelav.github.io</code>, Gmail-API aktivieren). Die genaue Anleitung steht in <a href="https://github.com/salkinsuirelav/tasks/blob/main/MAIL.md" target="_blank" rel="noopener">MAIL.md</a>.</p>
          <div class="field"><label>Client-ID</label><div class="pf-search"><input id="gm-cid" value="${esc(cid)}" placeholder="…apps.googleusercontent.com" autocomplete="off" spellcheck="false"><button class="btn primary" data-action="mail-cid-save">Speichern</button></div></div>`}
      </div>`;
}
function icCard() {
  const h = `<div class="m-acc-h"><span class="m-acc-ic ic">${icon('mail')}</span><div><h4>Apple Mail (iCloud)</h4>`;
  if (ic.account) return `
      <div class="panel m-acc">${h}<p class="muted">Verbunden: <b>${esc(ic.account)}</b> · über den Mac-Helfer</p></div></div>
        <div class="m-acc-btns"><button class="btn" data-action="ic-disconnect">${icon('logout')} Trennen</button></div>
      </div>`;
  if (isIOS()) return `
      <div class="panel m-acc">${h}<p class="muted">Geht nur auf dem Mac: Der Mac-Helfer holt die Mails von iCloud. Auf dem iPhone nutzt du die Mail-App.</p></div></div>
        <span class="pf-pill">Nur auf dem Mac</span>
      </div>`;
  return `
      <div class="panel m-acc">${h}<p class="muted">Lesen, schreiben, archivieren, Mail → Aufgabe. Läuft über den Mac-Helfer, nur auf diesem Mac.</p></div></div>
        <ol class="m-steps m-ol">
          <li>Bei <a href="https://account.apple.com" target="_blank" rel="noopener">account.apple.com</a> ein <b>App-spezifisches Passwort</b> erstellen.</li>
          <li>Den Mac-Helfer updaten (1 Befehl im Terminal).</li>
          <li><code>mail-setup.command</code> doppelklicken, Adresse und Passwort einfügen.</li>
        </ol>
        <p class="fin-note" style="margin:0">Schritt für Schritt: <a href="${GUIDE}" target="_blank" rel="noopener">APPLEMAIL.md</a></p>
        <button class="btn primary" data-action="ic-connect" ${ic.busy ? 'disabled' : ''}>${icon('refresh')} ${ic.busy ? 'Prüfe …' : 'Verbinden'}</button>
        ${ic.error ? errLine(ic.error) : ''}
      </div>`;
}
function setupView() {
  return `
    <div class="mail-setup">
      ${gmCard()}
      ${icCard()}
      <p class="fin-note">Deine Mails bleiben auf deinem Gerät. Die App speichert sie nirgends, auch nicht in Firebase.</p>
    </div>`;
}

// Knopf je nach Ordner: Posteingang → Archivieren, Archiv/Spam/Papierkorb → zurück in den Posteingang
const moveBtn = (m) => (m.folder === 'inbox' || !m.folder ? `<button class="icon-btn" data-action="mail-archive" data-id="${m.id}" title="Archivieren">${icon('archive')}</button>`
  : MOVABLE.includes(m.folder) ? `<button class="icon-btn" data-action="mail-restore" data-id="${m.id}" title="${m.folder === 'spam' ? 'Kein Spam: in den Posteingang' : 'In den Posteingang'}">${icon('inbox')}</button>` : '');
function row(m, compact) {
  const on = ui.mailOpen === m.id;
  // In „Gesendet“ zählt, an wen die Mail ging
  const sent = m.folder === 'sent' && m.to, who = sent ? m.to : m.from;
  const chip = m.src === 'ic' ? (both() ? '<span class="m-cat ic"><i></i>iCloud</span>' : '<span class="m-cat empty"></span>')
    : m.cat ? `<span class="m-cat"><i></i>${CATS[m.cat]}</span>` : both() ? '<span class="m-cat gm"><i></i>Gmail</span>' : '<span class="m-cat empty"></span>';
  return `<div class="m-row ${m.unread ? 'unread' : ''} ${on ? 'on' : ''}" data-action="mail-open" data-id="${m.id}">
    ${avatar(who)}
    <span class="m-from">${sent ? `<span class="muted">An</span> ${esc(who.name)}${m.toMore ? ` <span class="muted">+${m.toMore}</span>` : ''}` : esc(m.from.name)}</span>
    ${compact ? '' : chip}
    <span class="m-txt"><b>${esc(m.subject)}</b><span class="muted"> ${esc(m.snippet)}</span></span>
    <span class="m-time">${fmtTime(m.at)}</span>
    <span class="m-acts">
      <button class="icon-btn" data-action="mail-task" data-id="${m.id}" title="Als Aufgabe übernehmen">${icon('check')}</button>
      ${moveBtn(m)}
    </span>
  </div>`;
}

function reader(m) {
  const f = st.full[m.id];
  const imgs = !!st.imgs[m.id];
  let body;
  if (!f) body = '<div class="m-load muted">Lädt …</div>';
  else if (f.error) body = errLine(f.error);
  else if (f.html) {
    // Eigenes, abgeschottetes Fenster: keine Skripte, Links öffnen neu, Bilder aus dem Netz erst nach Klick
    const csp = `default-src 'none'; style-src 'unsafe-inline' *; font-src *; img-src data: cid:${imgs ? ' https: http:' : ''};`;
    const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>html,body{margin:0;padding:0;background:#fff;color:#18181b;font:14px/1.5 -apple-system,BlinkMacSystemFont,Inter,sans-serif;word-wrap:break-word}body{padding:16px}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${f.html}</body></html>`;
    body = `<iframe class="m-frame" data-id="${m.id}" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin" srcdoc="${esc(doc)}" title="Mail"></iframe>`;
  } else body = `<div class="m-plain">${esc(f.text || m.snippet).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')}</div>`;
  const hasRemote = f?.html && /<img[^>]+src=["']?https?:/i.test(f.html);
  const link = mailLink(m);
  // Antworten/Weiterleiten: Gmail direkt, iCloud über den Mac-Helfer (nur am Mac)
  const rep = canSend(m.src) && f && !f.error && m.folder !== 'spam', all = rep && canReplyAll(m); // auf Spam nicht antworten
  const att = f?.attachments?.length ? `<div class="m-att">${f.attachments.map((a) => `<span class="m-att-i" title="${esc(a.type)}">${icon('clip')}<b>${esc(a.name)}</b><small>${fsize(a.size)}</small></span>`).join('')}<small class="muted m-att-n">Anhänge öffnest du in ${m.src === 'ic' ? 'Apple Mail' : 'Gmail'}.</small></div>` : '';
  return `<div class="m-reader panel">
    <div class="m-r-bar">
      ${isMobile() ? `<button class="icon-btn" data-action="mail-close" title="Zurück">${icon('arrowLeft')}</button>` : `<button class="icon-btn" data-action="mail-close" title="Schließen">${icon('x')}</button>`}
      <span class="m-r-sp"></span>
      ${rep ? `<button class="icon-btn" data-action="mail-reply" data-id="${m.id}" title="Antworten">${icon('reply')}</button>
      ${all ? `<button class="icon-btn" data-action="mail-replyall" data-id="${m.id}" title="Allen antworten">${icon('replyAll')}</button>` : ''}
      <button class="icon-btn" data-action="mail-forward" data-id="${m.id}" title="Weiterleiten">${icon('forward')}</button><span class="m-r-div"></span>` : ''}
      <button class="icon-btn" data-action="mail-task" data-id="${m.id}" title="Als Aufgabe übernehmen">${icon('check')}</button>
      ${m.folder === 'sent' ? '' : `<button class="icon-btn" data-action="mail-unread" data-id="${m.id}" title="Als ungelesen markieren">${icon('mail')}</button>`}
      ${moveBtn(m)}
      ${link ? `<a class="icon-btn" href="${esc(link)}" ${m.src === 'ic' ? '' : 'target="_blank" rel="noopener"'} title="${m.src === 'ic' ? 'In Apple Mail öffnen' : 'In Gmail öffnen'}">${icon('external')}</a>` : ''}
    </div>
    <h2 class="m-subj">${esc(m.subject)}</h2>
    <div class="m-meta">${avatar(m.from, 36)}<div><span class="m-who"><b>${esc(m.from.name)}</b> <span class="muted">&lt;${esc(m.from.email)}&gt;</span></span><small class="muted">${f?.to ? `an ${esc(f.to)} · ` : ''}${new Date(m.at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}${both() ? ` · ${m.src === 'ic' ? 'iCloud' : 'Gmail'}` : ''}</small></div></div>
    ${hasRemote && !imgs ? `<div class="m-imgs">${icon('eyeOff')}<span>Bilder aus dem Netz sind blockiert (Schutz vor Zählpixeln).</span><button class="btn small" data-action="mail-imgs" data-id="${m.id}">Bilder laden</button></div>` : ''}
    ${f?.truncated ? '<p class="fin-note" style="margin:0">Sehr große Mail: Nur der Anfang ist geladen. Den Rest siehst du in Apple Mail.</p>' : ''}
    ${body}
    ${att}
  </div>`;
}

// Hinweise oben (abgelaufene Anmeldung, Helfer aus, Fehler)
function notes() {
  const out = [];
  if (st.account && !hasToken()) out.push(renewing ? `<div class="m-note">${icon('refresh')}<span><b>Gmail:</b> Anmeldung wird erneuert …</span></div>`
    : `<div class="m-note">${icon('lock')}<span><b>Gmail:</b> Anmeldung abgelaufen (Google erlaubt nur 1 Stunde).</span><button class="btn small primary" data-action="mail-signin">Weiter mit Google</button></div>`);
  else if (st.account && st.error) out.push(`<div class="m-note bad"><span><b>Gmail:</b> ${esc(st.error)}</span><button class="btn small" data-action="mail-refresh">Nochmal</button></div>`);
  if (ic.account && ic.error) out.push(`<div class="m-note bad"><span><b>Apple Mail:</b> ${esc(ic.error)}${['setup', 'auth', 'old'].includes(ic.code) ? ` <a href="${GUIDE}" target="_blank" rel="noopener">Anleitung</a>` : ''}</span><button class="btn small" data-action="ic-refresh">Nochmal</button></div>`);
  return out.join('');
}

// Mails, wie sie gerade in der Liste stehen (Konto-Filter, optional Ungelesen-Filter)
function shown(useFilter = true) {
  const boxF = both() ? ui.mailBox || 'all' : 'all';
  const items = allMail().filter((m) => boxF === 'all' || m.src === boxF);
  return useFilter && (ui.mailFilter || 'all') === 'unread' ? items.filter((m) => m.unread || ui.mailOpen === m.id) : items;
}
// Nach Archivieren/Verschieben der offenen Mail: die nächste darunter öffnen (sonst die darüber, sonst keine)
function nextAfter(id) {
  const L = shown(), i = L.findIndex((m) => m.id === id);
  if (i < 0) return null;
  return (L[i + 1] || L[i - 1] || null)?.id || null;
}
const EMPTY = { inbox: 'Posteingang leer. 🎉', archive: 'Archiv leer.', sent: 'Noch nichts gesendet.', spam: 'Kein Spam. 👍', trash: 'Papierkorb leer.' };
export function viewMail() {
  if (!connected() || ui.mailSetup) {
    const done = connected() ? `<button class="btn" data-action="mail-setup-done">Fertig</button>` : '';
    return `${head('Mail', connected() ? 'Konten' : 'Gmail und Apple Mail an einem Ort', done, 'mail-head')}${setupView()}`;
  }
  const fo = folder();
  if (st.folder !== fo || ic.folder !== fo) useFolder(fo);
  if (st.account && !hasToken()) preloadGis();
  if (st.account && hasToken() && !st.list && !st.loading && !st.error) gmRefresh();
  if (ic.account && !ic.list && !ic.loading && !ic.error) icRefresh();
  const items = shown(false);
  const unread = items.filter((m) => m.unread).length;
  const filter = ui.mailFilter || 'all';
  const write = canSend() ? `<button class="btn primary m-compose" data-action="mail-compose" title="Neue Mail">${icon('pen')} Schreiben</button>` : '';
  const actions = `${write}<button class="icon-btn" data-action="mail-refresh" title="Neu laden">${icon('refresh')}</button>
    <button class="icon-btn" data-action="mail-accounts" title="Konten (Gmail, Apple Mail)">${icon('user')}</button>`;
  const fsel = `<label class="m-folder${fo !== 'inbox' ? ' on' : ''}" title="Ordner">${icon(fInfo(fo)[2])}<select id="m-folder" aria-label="Ordner">${FOLDERS.map(([v, l]) => `<option value="${v}"${v === fo ? ' selected' : ''}>${l}</option>`).join('')}</select>${icon('chevDown')}</label>`;
  const tabs = fsel + `<div class="tabs m-filter">${[['all', 'Alle'], ['unread', `Ungelesen${unread ? `<span class="n">${unread}</span>` : ''}`]].map(([v, l]) => `<button class="${filter === v ? 'on' : ''}" data-action="mail-filter" data-v="${v}">${l}</button>`).join('')}</div>`
    + (both() ? `<div class="tabs m-box">${[['all', 'Alle'], ['gm', 'Gmail'], ['ic', 'iCloud']].map(([v, l]) => `<button class="${(ui.mailBox || 'all') === v ? 'on' : ''}" data-action="mail-box" data-v="${v}">${l}</button>`).join('')}</div>` : '');
  const sub = [st.account, ic.account].filter(Boolean).map(esc).join(' · ');
  const top = head('Mail', sub, actions, 'mail-head', tabs);
  // Nur Gmail und die Stunde ist um: große Karte wie bisher
  if (st.account && !ic.account && !hasToken()) return `${top}${renewing ? '<div class="m-load muted">Google-Anmeldung wird erneuert …</div>' : `
    <div class="panel fin-empty"><span class="fin-empty-ic">${icon('lock')}</span><h3>Google-Anmeldung abgelaufen</h3>
      <p class="muted">Google gibt der App immer nur für eine Stunde Zugriff. Normalerweise erneuert die App das beim ersten Klick selbst. Hier geht es von Hand, ohne neue Bestätigung.</p>
      <button class="btn primary" data-action="mail-signin">${icon('mail')} Weiter mit Google</button>
      ${st.error ? errLine(st.error) : ''}</div>`}`;
  if (!st.list && !ic.list) {
    const pending = (st.account && hasToken() && !st.error) || (ic.account && !ic.error);
    return `${top}${notes()}${pending ? `<div class="m-load muted">${fInfo(fo)[1]} wird geladen …</div>` : ''}`;
  }
  const list = shown();
  const open = ui.mailOpen && mailById(ui.mailOpen);
  const compact = !!open;
  let lastG = '';
  const rows = list.map((m) => { const gname = groupOf(m.at); const h = gname !== lastG ? `<div class="m-group">${gname}</div>` : ''; lastG = gname; return h + row(m, compact); }).join('');
  const listHTML = `<div class="m-list ${compact ? 'compact' : ''} ${showAvatars() ? '' : 'no-av'}">${rows || `<p class="muted fin-none" style="padding:24px">${filter === 'unread' ? 'Alles gelesen.' : EMPTY[fo]}</p>`}</div>`;
  if (open && isMobile()) return reader(open);
  const fab = canSend() && isMobile() ? `<button class="m-fab" data-action="mail-compose" aria-label="Neue Mail">${icon('pen')}</button>` : '';
  return `${top}${notes()}
    <div class="mail-wrap ${open ? 'split' : ''}">${listHTML}${open ? reader(open) : ''}</div>${fab}`;
}

// ---------- Schreiben, Antworten, Weiterleiten ----------
// Gmail: über die Gmail-API (die Berechtigung gmail.modify erlaubt Senden schon, kein neuer Login nötig).
// Gmail setzt Absender, Datum und Message-ID selbst und legt die Mail unter „Gesendet“ ab.
// iCloud: über den Mac-Helfer (SMTP von iCloud, danach Kopie in „Gesendet“). Gesendet wird reiner Text.
export const canSend = (src) => (src === 'gm' ? !!st.account : src === 'ic' ? !!ic.account && !isIOS() : canSend('gm') || canSend('ic'));
export const isCompose = (m) => m?.type === 'compose';
const mine = () => [st.account, ic.account].filter(Boolean).map((x) => x.toLowerCase());
const isMe = (e) => mine().includes(String(e || '').toLowerCase());
const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;
// "A <a@x>, \"Doe, John\" <j@x>; b@y" → [{name, email, raw}]
export function splitAddrs(s) {
  const out = []; let cur = '', q = false, a = false;
  for (const ch of String(s || '')) {
    if (ch === '"' && !a) q = !q;
    else if (ch === '<' && !q) a = true;
    else if (ch === '>' && !q) a = false;
    if ((ch === ',' || ch === ';') && !q && !a) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean).map((raw) => {
    const m = raw.match(/^(.*?)\s*<([^>]*)>\s*$/);
    const email = (m ? m[2] : raw).trim(), name = m ? m[1].trim().replace(/^"(.*)"$/, '$1').replace(/\\(.)/g, '$1') : '';
    return { name, email, raw };
  });
}
const showAddr = (a) => (a.name && a.name.toLowerCase() !== a.email.toLowerCase() ? `${/[,;"<>]/.test(a.name) ? `"${a.name.replace(/"/g, '')}"` : a.name} <${a.email}>` : a.email);
const uniq = (list, skip = []) => {
  const seen = new Set(skip.map((x) => x.toLowerCase()));
  return list.filter((a) => { const k = a.email.toLowerCase(); if (!a.email || seen.has(k) || isMe(k)) return false; seen.add(k); return true; });
};

// MIME-Kopfzeilen: Umlaute als =?UTF-8?B?…?= (höchstens 39 Byte je Stück, damit Zeilen unter 78 Zeichen bleiben; kein Zeichen wird zerteilt)
const utf8 = (s) => new TextEncoder().encode(s);
const b64bytes = (u8) => { let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(bin); };
function encWord(s) {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const parts = []; let cur = '';
  for (const ch of s) { if (utf8(cur + ch).length > 39) { parts.push(cur); cur = ch; } else cur += ch; }
  if (cur) parts.push(cur);
  return parts.map((p) => `=?UTF-8?B?${b64bytes(utf8(p))}?=`).join('\r\n ');
}
const hdrAddr = (a) => (!a.name ? a.email : /^[\x20-\x7e]*$/.test(a.name) ? `"${a.name.replace(/["\\]/g, '\\$&')}" <${a.email}>` : `${encWord(a.name)} <${a.email}>`);
const rfcDate = (d = new Date()) => d.toUTCString().replace('GMT', '+0000');
export function buildRaw({ to, cc, bcc, subject, body, inReplyTo, references }) {
  const H = [];
  const addr = (k, list) => { if (list.length) H.push(`${k}: ${list.map(hdrAddr).join(',\r\n ')}`); };
  addr('To', to); addr('Cc', cc); addr('Bcc', bcc);
  H.push(`Subject: ${encWord(subject || '')}`, `Date: ${rfcDate()}`);
  if (inReplyTo) H.push(`In-Reply-To: ${inReplyTo}`);
  if (references) H.push(`References: ${references}`);
  H.push('MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64');
  const b = b64bytes(utf8(String(body || '').replace(/\r?\n/g, '\r\n'))).replace(/.{76}/g, '$&\r\n');
  const msg = `${H.join('\r\n')}\r\n\r\n${b}\r\n`;
  return b64bytes(utf8(msg)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// HTML-Mail als Text (fürs Zitat). DOMParser lädt keine Bilder und führt nichts aus.
function htmlToText(html) {
  const d = new DOMParser().parseFromString(html || '', 'text/html');
  d.querySelectorAll('style,script,head,title').forEach((e) => e.remove());
  d.querySelectorAll('br').forEach((e) => e.replaceWith('\n'));
  d.querySelectorAll('li').forEach((e) => e.prepend('• '));
  d.querySelectorAll('p,div,tr,li,h1,h2,h3,h4,h5,h6,blockquote,table').forEach((e) => e.append('\n'));
  return (d.body?.textContent || '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
const textOf = (m) => { const f = st.full[m.id] || {}; return (f.text || htmlToText(f.html) || m.snippet || '').replace(/\r\n/g, '\n').trim(); };
const whenDE = (at) => { const d = new Date(at); return `${d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} um ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`; };
const quote = (t) => t.split('\n').map((l) => (l.startsWith('>') ? '>' + l : l ? '> ' + l : '>')).join('\n');

// Wer bekommt die Antwort? Antworten: Reply-To bzw. Absender. Allen: zusätzlich alle aus An/Cc außer mir.
function replyTargets(m) {
  const f = st.full[m.id] || {};
  const sender = splitAddrs(f.replyTo).length ? splitAddrs(f.replyTo) : [{ name: m.from.name === m.from.email ? '' : m.from.name, email: m.from.email }];
  const own = isMe(m.from.email);
  const to = own ? splitAddrs(f.to) : sender;
  const toAll = uniq([...to, ...(own ? [] : splitAddrs(f.to))]);
  const ccAll = uniq(splitAddrs(f.cc), toAll.map((a) => a.email));
  return { to: uniq(to), toAll, ccAll };
}
export const canReplyAll = (m) => { const r = replyTargets(m); return r.toAll.length + r.ccAll.length > r.to.length; };

export function composeFor(kind, id) {
  const m = id && mailById(id);
  // Absender: bei Antworten das Konto, in dem die Mail liegt, sonst Gmail (falls verbunden)
  const src = m && canSend(m.src) ? m.src : canSend('gm') ? 'gm' : 'ic';
  const c = { type: 'compose', kind, src, to: '', cc: '', bcc: '', subject: '', body: '', showCc: false, err: null };
  if (kind !== 'new' && m) {
    const f = st.full[m.id] || {};
    const subj = f.subject || (m.subject === '(ohne Betreff)' ? '' : m.subject);
    c.ref = m.id; c.threadId = m.threadId;
    if (f.mid) { c.inReplyTo = f.mid; c.references = [f.refs, f.mid].filter(Boolean).join(' ').trim(); }
    const from = `${m.from.name && m.from.name !== m.from.email ? m.from.name + ' ' : ''}<${m.from.email}>`;
    if (kind === 'fwd') {
      c.subject = /^\s*(fwd?|wg)\s*:/i.test(subj) ? subj : `Fwd: ${subj}`;
      c.body = `\n\n---------- Weitergeleitete Nachricht ----------\nVon: ${from}\nDatum: ${whenDE(m.at)}\nBetreff: ${subj}\n${f.to ? `An: ${f.to}\n` : ''}${f.cc ? `Cc: ${f.cc}\n` : ''}\n${textOf(m)}\n`;
      c.attNote = (f.attachments || []).length;
    } else {
      const r = replyTargets(m);
      const to = kind === 'all' ? r.toAll : r.to, cc = kind === 'all' ? r.ccAll : [];
      c.to = to.map(showAddr).join(', '); c.cc = cc.map(showAddr).join(', '); c.showCc = cc.length > 0;
      c.subject = /^\s*(re|aw|antw)\s*:/i.test(subj) ? subj : `Re: ${subj}`;
      c.body = `\n\nAm ${whenDE(m.at)} schrieb ${from}:\n${quote(textOf(m))}\n`;
    }
  }
  c.init = JSON.stringify([c.to, c.cc, c.bcc, c.subject, c.body]);
  return c;
}
export function captureCompose(c) {
  const v = (id) => document.getElementById(id)?.value;
  for (const [k, id] of [['to', 'c-to'], ['cc', 'c-cc'], ['bcc', 'c-bcc'], ['subject', 'c-subj'], ['body', 'c-body'], ['src', 'c-from']]) { const x = v(id); if (x != null) c[k] = x; }
}
export const composeDirty = (c) => JSON.stringify([c.to, c.cc, c.bcc, c.subject, c.body]) !== c.init;
// Prüfen und fertig machen. Wirft einen Fehler mit verständlichem Text.
export function prepareSend(c) {
  const lists = {};
  for (const k of ['to', 'cc', 'bcc']) {
    lists[k] = splitAddrs(c[k]);
    const bad = lists[k].find((a) => !EMAIL.test(a.email));
    if (bad) throw new Error(`„${bad.raw}“ ist keine gültige Adresse.`);
  }
  if (!lists.to.length) throw new Error(lists.cc.length || lists.bcc.length ? 'Bitte mindestens eine Adresse bei „An“ eintragen.' : 'An wen soll die Mail gehen?');
  // Verlauf (threadId) gibt es nur in Gmail; wechselt der Absender, beginnt dort ein neuer Verlauf
  const ref = c.ref && mailById(c.ref);
  return { ...lists, src: c.src, subject: c.subject.trim(), body: c.body, threadId: ref?.src === c.src ? c.threadId : undefined, inReplyTo: c.inReplyTo, references: c.references };
}
// Gibt einen Hinweis zurück, falls etwas nur halb geklappt hat
export async function send(p) {
  if (p.src === 'ic') {
    if (!canSend('ic')) throw new Error('Zum Senden über iCloud zuerst Apple Mail auf diesem Mac verbinden.');
    let r;
    try {
      r = await hx('send', { to: p.to, cc: p.cc, bcc: p.bcc, subject: p.subject, body: p.body, inReplyTo: p.inReplyTo, references: p.references });
    } catch (e) {
      if (e.code === 'unknown') throw new Error('Der Mac-Helfer ist noch die alte Version. Zum Senden über iCloud einmal updaten (APPLEMAIL.md, Schritt 2).');
      throw e;
    }
    for (const a of [...p.to, ...p.cc, ...p.bcc]) sent.set(a.email.toLowerCase(), a);
    return r.saved === false ? 'Die Kopie in „Gesendet“ hat nicht geklappt.' : null;
  }
  if (!canSend('gm')) throw new Error('Zum Senden zuerst Gmail verbinden.');
  try {
    await g('/messages/send', { method: 'POST', body: JSON.stringify({ raw: buildRaw(p), ...(p.threadId ? { threadId: p.threadId } : {}) }) });
  } catch (e) {
    if (e.status === 400) throw new Error('Gmail hat die Mail abgelehnt. Stimmen die Adressen?');
    if (e.status === 403) throw new Error('Gmail erlaubt das Senden gerade nicht (403). Einmal bei Gmail trennen und neu anmelden.');
    throw e;
  }
  for (const a of [...p.to, ...p.cc, ...p.bcc]) sent.set(a.email.toLowerCase(), a);
  return null;
}

// Vorschläge beim Tippen der Adresse: alle Absender und Empfänger aus den geladenen Mails
const sent = new Map();
function contacts() {
  const map = new Map(sent);
  const add = (a) => { const k = (a.email || '').toLowerCase(); if (!EMAIL.test(k) || isMe(k) || /no-?reply|mailer-daemon/.test(k)) return; const o = map.get(k); if (!o || (!o.name && a.name)) map.set(k, { name: a.name && a.name !== a.email ? a.name : '', email: a.email }); };
  for (const m of allMail()) add(m.from);
  for (const f of Object.values(st.full)) { splitAddrs(f.to).forEach(add); splitAddrs(f.cc).forEach(add); }
  return [...map.values()];
}
let sug = null; // { el, items, i }
const sugBox = (el) => el.closest('.c-row')?.querySelector('.c-sug');
function hideSug() { if (sug) { const b = sugBox(sug.el); if (b) b.hidden = true; } sug = null; }
export function composeInput(el) {
  if (!/^c-(to|cc|bcc)$/.test(el.id)) return;
  const v = el.value.slice(0, el.selectionStart ?? el.value.length);
  const tok = v.split(/[,;]/).pop().trim().toLowerCase();
  const have = new Set(splitAddrs(el.value).map((a) => a.email.toLowerCase()));
  // Treffer am Wortanfang zuerst; „le“ soll Lea finden, nicht jede …@example.com
  const score = (a) => {
    const n = a.name.toLowerCase(), e = a.email.toLowerCase(), local = e.split('@')[0];
    if (n.startsWith(tok) || e.startsWith(tok)) return 0;
    if (n.split(/\s+/).some((x) => x.startsWith(tok)) || local.split(/[._-]/).some((x) => x.startsWith(tok))) return 1;
    if (tok.length >= 3 && (local.includes(tok) || n.includes(tok))) return 2;
    return /[@.]/.test(tok) && e.includes(tok) ? 3 : 9;
  };
  const items = !tok ? [] : contacts().filter((a) => !have.has(a.email.toLowerCase())).map((a) => [score(a), a]).filter(([x]) => x < 9).sort((x, y) => x[0] - y[0]).map(([, a]) => a).slice(0, 5);
  const box = sugBox(el);
  if (!box || !items.length) return hideSug();
  sug = { el, items, i: 0 };
  drawSug();
}
function drawSug() {
  const box = sugBox(sug.el);
  box.innerHTML = sug.items.map((a, i) => `<div class="c-sug-i ${i === sug.i ? 'on' : ''}" data-action="compose-pick" data-i="${i}">${avatar({ name: a.name || a.email, email: a.email }, 24)}<span>${a.name ? `<b>${esc(a.name)}</b> ` : ''}<span class="muted">${esc(a.email)}</span></span></div>`).join('');
  box.hidden = false;
}
export function composePick(i) {
  if (!sug) return;
  const { el, items } = sug, a = items[i ?? sug.i];
  const pos = el.selectionStart ?? el.value.length;
  const before = el.value.slice(0, pos), after = el.value.slice(pos);
  const cut = Math.max(before.lastIndexOf(','), before.lastIndexOf(';'));
  const head = cut >= 0 ? before.slice(0, cut + 1) + ' ' : '';
  const rest = after.replace(/^[^,;]*[,;]?\s*/, '');
  el.value = `${head}${showAddr(a)}, ${rest}`;
  const caret = head.length + showAddr(a).length + 2;
  hideSug(); el.focus(); el.setSelectionRange(caret, caret);
}
// Pfeiltasten/Enter/Tab/Esc in der Vorschlagsliste. true = Taste gehört der Liste.
export function composeKey(e) {
  if (!sug || e.target !== sug.el) return false;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sug.i = (sug.i + (e.key === 'ArrowDown' ? 1 : -1) + sug.items.length) % sug.items.length; drawSug(); return true; }
  if ((e.key === 'Enter' || e.key === 'Tab') && !e.isComposing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); composePick(); return true; }
  if (e.key === 'Escape') { hideSug(); return true; }
  return false;
}
export const composeBlur = (el) => { if (sug && el !== sug.el) hideSug(); };

export function composeHTML(c) {
  const title = { new: 'Neue Mail', reply: 'Antworten', all: 'Allen antworten', fwd: 'Weiterleiten' }[c.kind] || 'Neue Mail';
  const row = (id, label, val, extra = '') => `<div class="c-row"><label for="${id}">${label}</label><input id="${id}" value="${esc(val)}" ${id === 'c-subj' ? '' : 'inputmode="email" autocapitalize="off"'} autocomplete="off" spellcheck="false" ${extra}>${id === 'c-to' && !c.showCc ? '<button class="c-ccb" data-action="compose-cc" title="Kopie (Cc) und Blindkopie (Bcc)">Cc/Bcc</button>' : ''}${id === 'c-subj' ? '' : '<div class="c-sug" hidden></div>'}</div>`;
  const focusTo = c.kind === 'new' || c.kind === 'fwd';
  return `<div class="overlay modal-overlay" data-action="close-modal"></div>
  <div class="modal compose" role="dialog" aria-label="${title}">
    <div class="c-head">
      <button class="icon-btn c-x" data-action="compose-close" title="Schließen (Esc)">${icon('x')}</button>
      <h2>${title}</h2>
      <button class="btn primary small c-send-m" data-action="compose-send">${icon('send')} Senden</button>
    </div>
    <div class="c-fields">
      <div class="c-row c-from"><label for="c-from">Von</label>${canSend('gm') && canSend('ic')
        ? `<select id="c-from">${[['gm', st.account], ['ic', ic.account]].map(([v, a]) => `<option value="${v}" ${c.src === v ? 'selected' : ''}>${esc(a)} · ${v === 'gm' ? 'Gmail' : 'iCloud'}</option>`).join('')}</select>`
        : `<span>${esc((c.src === 'ic' ? ic.account : st.account) || '')}</span>`}</div>
      ${row('c-to', 'An', c.to, focusTo ? 'autofocus' : '')}
      ${c.showCc ? row('c-cc', 'Cc', c.cc) + row('c-bcc', 'Bcc', c.bcc) : ''}
      ${row('c-subj', 'Betreff', c.subject)}
    </div>
    <textarea id="c-body" class="c-body" placeholder="Nachricht" ${focusTo ? '' : 'autofocus'}>\n${esc(c.body)}</textarea>
    ${c.attNote ? `<p class="fin-note c-note">${icon('clip')} ${c.attNote === 1 ? 'Der Anhang wird' : `Die ${c.attNote} Anhänge werden`} nicht mitgeschickt. Dafür die Mail in Gmail weiterleiten.</p>` : ''}
    ${c.err ? `<p class="fin-note m-err c-err">${esc(c.err)}</p>` : ''}
    <div class="foot c-foot"><span class="muted c-hint"><kbd>⌘</kbd> <kbd>Enter</kbd> sendet</span><button class="btn primary" data-action="compose-send">${icon('send')} Senden</button></div>
  </div>`;
}
