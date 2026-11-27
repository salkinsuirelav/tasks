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
export const st = { account: ls(ACC), list: null, loading: false, error: null, full: {}, imgs: {} };
export const ic = { account: ls(ICL), list: null, loading: false, error: null, code: null, v: null, busy: false };
export const connected = () => !!st.account || !!ic.account;
export const hasToken = () => !!tok && tok.exp > Date.now();
const both = () => !!st.account && !!ic.account;

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
  await loadGis();
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
export function signOut() {
  if (tok && window.google?.accounts?.oauth2) try { window.google.accounts.oauth2.revoke(tok.at, () => {}); } catch {}
  if (mailById(ui.mailOpen)?.src === 'gm') ui.mailOpen = null;
  tok = null; saveTok(); st.account = null; lsSet(ACC, null); st.list = null; st.error = null;
  notify();
}

// ---------- Gmail-API ----------
async function g(path, opts = {}) {
  if (!hasToken()) { tok = null; saveTok(); throw new Error('auth'); }
  const r = await fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${tok.at}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (r.status === 401) { tok = null; saveTok(); throw new Error('auth'); }
  if (!r.ok) throw new Error(`Gmail antwortet gerade nicht (${r.status}).`);
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
function parseMeta(m) {
  const from = parseFrom(hdr(m, 'From'));
  const labels = m.labelIds || [];
  return {
    id: m.id, src: 'gm', threadId: m.threadId, from, subject: hdr(m, 'Subject') || '(ohne Betreff)', snippet: decodeEnt(m.snippet),
    at: Number(m.internalDate) || Date.parse(hdr(m, 'Date')) || Date.now(),
    unread: labels.includes('UNREAD'), starred: labels.includes('STARRED'), important: labels.includes('IMPORTANT'),
    cat: Object.keys(CATS).find((c) => labels.includes(c)) || null,
  };
}
async function gmRefresh() {
  if (!st.account || !hasToken()) { notify(); return; }
  st.loading = true; st.error = null; notify();
  try {
    const j = await g('/messages?maxResults=40&labelIds=INBOX');
    const ids = (j.messages || []).map((m) => m.id);
    const metas = await pool(ids, 8, (id) => g(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`));
    st.list = metas.filter(Boolean).map(parseMeta).sort((a, b) => b.at - a.at);
    st.at = Date.now();
  } catch (e) { if (e.message !== 'auth') st.error = e.message; } finally { st.loading = false; notify(); }
}
// Ganze Mail laden (beim Öffnen) und als gelesen markieren
const b64 = (s) => { const bin = atob((s || '').replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); };
function bodyOf(p, kind) {
  if (!p) return null;
  if (p.mimeType === kind && p.body?.data) return b64(p.body.data);
  for (const c of p.parts || []) { const r = bodyOf(c, kind); if (r) return r; }
  return null;
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
  ic.account = null; lsSet(ICL, null); ic.list = null; ic.error = null; ic.code = null;
  notify();
}
const icMeta = (x) => ({
  id: 'ic' + x.uid, uid: x.uid, src: 'ic', from: parseFrom(x.from), subject: x.subject || '(ohne Betreff)', snippet: x.snippet || '',
  at: x.at || Date.now(), unread: !!x.unread, starred: !!x.flagged, mid: x.mid || '', cat: null,
});
async function icRefresh() {
  if (!ic.account) return;
  ic.loading = true; ic.error = null; ic.code = null; notify();
  try {
    const j = await hx('list?n=40');
    ic.v = j.v; ic.list = (j.list || []).map(icMeta); ic.at = Date.now();
    if (j.account && j.account !== ic.account) { ic.account = j.account; lsSet(ICL, j.account); }
  } catch (e) { ic.error = e.message; ic.code = e.code; } finally { ic.loading = false; notify(); }
}
// Posteingang hat sich in iCloud geändert: neu laden
const icStale = (e) => { if (e.code === 'stale') icRefresh(); return e; };

// ---------- Gemeinsam ----------
export function refresh() { return Promise.all([gmRefresh(), icRefresh()]); }
export const icRetry = () => icRefresh();
export const allMail = () => [...(st.list || []), ...(ic.list || [])].sort((a, b) => b.at - a.at);
export const mailById = (id) => (id ? (st.list || []).find((x) => x.id === id) || (ic.list || []).find((x) => x.id === id) : null);
const listOf = (m) => (m.src === 'ic' ? ic.list : st.list);
export const gmailLink = (m) => `https://mail.google.com/mail/u/${encodeURIComponent(st.account || '0')}/#all/${m.threadId}`;
// Apple Mail auf dem Mac öffnet eine Mail über ihre Message-ID (message://<…>)
export const mailLink = (m) => (m.src === 'ic' ? (m.mid ? `message://${encodeURIComponent(m.mid)}` : '') : gmailLink(m));

export async function openMail(id) {
  ui.mailOpen = id; notify();
  const m = mailById(id);
  if (!m) return;
  if (!st.full[id]) {
    try {
      if (m.src === 'ic') {
        const f = await hx(`msg?uid=${m.uid}&v=${encodeURIComponent(ic.v || '')}`);
        st.full[id] = { html: f.html, text: f.text, to: f.to, cc: f.cc, attachments: f.attachments || [], truncated: f.truncated };
        if (f.mid && !m.mid) m.mid = f.mid;
      } else {
        const full = await g(`/messages/${id}?format=full`);
        st.full[id] = { html: bodyOf(full.payload, 'text/html'), text: bodyOf(full.payload, 'text/plain'), to: hdr(full, 'To'), cc: hdr(full, 'Cc') };
      }
    } catch (e) { icStale(e); st.full[id] = { error: e.message === 'auth' ? 'Google-Anmeldung abgelaufen.' : e.message }; }
  }
  if (m.unread && !st.full[id]?.error) {
    m.unread = false;
    (m.src === 'ic' ? hx('seen', { uid: m.uid, v: ic.v, seen: true }) : g(`/messages/${id}/modify`, { method: 'POST', body: JSON.stringify({ removeLabelIds: ['UNREAD'] }) })).catch(() => {});
  }
  notify();
}
export async function setUnread(id, unread) {
  const m = mailById(id); if (!m) return;
  m.unread = unread; notify();
  try {
    if (m.src === 'ic') await hx('seen', { uid: m.uid, v: ic.v, seen: !unread });
    else await g(`/messages/${id}/modify`, { method: 'POST', body: JSON.stringify(unread ? { addLabelIds: ['UNREAD'] } : { removeLabelIds: ['UNREAD'] }) });
  } catch (e) { m.unread = !unread; notify(); throw icStale(e); }
}
// Archivieren = aus dem Posteingang nehmen. Gmail: bleibt unter „Alle Nachrichten“. iCloud: Ordner „Archive“.
export async function archive(id) {
  const m = mailById(id); if (!m) return null;
  const L = listOf(m), i = L.indexOf(m);
  L.splice(i, 1);
  if (ui.mailOpen === id) ui.mailOpen = null;
  notify();
  try {
    if (m.src === 'ic') { const r = await hx('archive', { uid: m.uid, v: ic.v }); return { m, i, box: r.box, newUid: r.uid }; }
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

// ---------- Ansicht ----------
const COLORS = ['#e5484d', '#f76b15', '#e2a336', '#30a46c', '#12a594', '#0090ff', '#6e56cf', '#d6409f', '#8d8d86'];
const avatar = (from, size = 28) => {
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
        <div class="m-acc-h"><span class="m-acc-ic gm">${icon('mail')}</span><div><h4>Gmail</h4><p class="muted">Posteingang lesen, archivieren, als gelesen markieren, Mail → Aufgabe</p></div></div>
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
      <div class="panel m-acc">${h}<p class="muted">Lesen, archivieren, als gelesen markieren, Mail → Aufgabe. Läuft über den Mac-Helfer, nur auf diesem Mac.</p></div></div>
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

function row(m, compact) {
  const on = ui.mailOpen === m.id;
  const chip = m.src === 'ic' ? (both() ? '<span class="m-cat ic"><i></i>iCloud</span>' : '<span class="m-cat empty"></span>')
    : m.cat ? `<span class="m-cat"><i></i>${CATS[m.cat]}</span>` : both() ? '<span class="m-cat gm"><i></i>Gmail</span>' : '<span class="m-cat empty"></span>';
  return `<div class="m-row ${m.unread ? 'unread' : ''} ${on ? 'on' : ''}" data-action="mail-open" data-id="${m.id}">
    ${avatar(m.from)}
    <span class="m-from">${esc(m.from.name)}</span>
    ${compact ? '' : chip}
    <span class="m-txt"><b>${esc(m.subject)}</b><span class="muted"> ${esc(m.snippet)}</span></span>
    <span class="m-time">${fmtTime(m.at)}</span>
    <span class="m-acts">
      <button class="icon-btn" data-action="mail-task" data-id="${m.id}" title="Als Aufgabe übernehmen">${icon('check')}</button>
      <button class="icon-btn" data-action="mail-archive" data-id="${m.id}" title="Archivieren">${icon('archive')}</button>
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
  const att = f?.attachments?.length ? `<div class="m-att">${f.attachments.map((a) => `<span class="m-att-i" title="${esc(a.type)}">${icon('clip')}<b>${esc(a.name)}</b><small>${fsize(a.size)}</small></span>`).join('')}<small class="muted m-att-n">Anhänge öffnest du in Apple Mail.</small></div>` : '';
  return `<div class="m-reader panel">
    <div class="m-r-bar">
      ${isMobile() ? `<button class="icon-btn" data-action="mail-close" title="Zurück">${icon('arrowLeft')}</button>` : `<button class="icon-btn" data-action="mail-close" title="Schließen">${icon('x')}</button>`}
      <span class="m-r-sp"></span>
      <button class="icon-btn" data-action="mail-task" data-id="${m.id}" title="Als Aufgabe übernehmen">${icon('check')}</button>
      <button class="icon-btn" data-action="mail-unread" data-id="${m.id}" title="Als ungelesen markieren">${icon('mail')}</button>
      <button class="icon-btn" data-action="mail-archive" data-id="${m.id}" title="Archivieren">${icon('archive')}</button>
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
  if (st.account && !hasToken()) out.push(`<div class="m-note">${icon('lock')}<span><b>Gmail:</b> Google gibt der App immer nur für eine Stunde Zugriff.</span><button class="btn small primary" data-action="mail-signin">Weiter mit Google</button></div>`);
  else if (st.account && st.error) out.push(`<div class="m-note bad"><span><b>Gmail:</b> ${esc(st.error)}</span><button class="btn small" data-action="mail-refresh">Nochmal</button></div>`);
  if (ic.account && ic.error) out.push(`<div class="m-note bad"><span><b>Apple Mail:</b> ${esc(ic.error)}${['setup', 'auth', 'old'].includes(ic.code) ? ` <a href="${GUIDE}" target="_blank" rel="noopener">Anleitung</a>` : ''}</span><button class="btn small" data-action="ic-refresh">Nochmal</button></div>`);
  return out.join('');
}

export function viewMail() {
  if (!connected() || ui.mailSetup) {
    const done = connected() ? `<button class="btn" data-action="mail-setup-done">Fertig</button>` : '';
    return `${head('Mail', connected() ? 'Konten' : 'Gmail und Apple Mail an einem Ort', done, 'mail-head')}${setupView()}`;
  }
  if (st.account && hasToken() && !st.list && !st.loading && !st.error) gmRefresh();
  if (ic.account && !ic.list && !ic.loading && !ic.error) icRefresh();
  const boxF = both() ? ui.mailBox || 'all' : 'all';
  const items = allMail().filter((m) => boxF === 'all' || m.src === boxF);
  const unread = items.filter((m) => m.unread).length;
  const filter = ui.mailFilter || 'all';
  const actions = `<button class="icon-btn" data-action="mail-refresh" title="Neu laden">${icon('refresh')}</button>
    <button class="icon-btn" data-action="mail-accounts" title="Konten (Gmail, Apple Mail)">${icon('user')}</button>`;
  const tabs = `<div class="tabs m-filter">${[['all', 'Posteingang'], ['unread', `Ungelesen${unread ? `<span class="n">${unread}</span>` : ''}`]].map(([v, l]) => `<button class="${filter === v ? 'on' : ''}" data-action="mail-filter" data-v="${v}">${l}</button>`).join('')}</div>`
    + (both() ? `<div class="tabs m-box">${[['all', 'Alle'], ['gm', 'Gmail'], ['ic', 'iCloud']].map(([v, l]) => `<button class="${boxF === v ? 'on' : ''}" data-action="mail-box" data-v="${v}">${l}</button>`).join('')}</div>` : '');
  const sub = [st.account, ic.account].filter(Boolean).map(esc).join(' · ');
  const top = head('Mail', sub, actions, 'mail-head', tabs);
  // Nur Gmail und die Stunde ist um: große Karte wie bisher
  if (st.account && !ic.account && !hasToken()) return `${top}
    <div class="panel fin-empty"><span class="fin-empty-ic">${icon('lock')}</span><h3>Google-Anmeldung abgelaufen</h3>
      <p class="muted">Google gibt der App immer nur für eine Stunde Zugriff. Ein Klick genügt, du musst nichts neu bestätigen.</p>
      <button class="btn primary" data-action="mail-signin">${icon('mail')} Weiter mit Google</button>
      ${st.error ? errLine(st.error) : ''}</div>`;
  if (!st.list && !ic.list) {
    const pending = (st.account && hasToken() && !st.error) || (ic.account && !ic.error);
    return `${top}${notes()}${pending ? '<div class="m-load muted">Posteingang wird geladen …</div>' : ''}`;
  }
  const list = items.filter((m) => filter !== 'unread' || m.unread || ui.mailOpen === m.id);
  const open = ui.mailOpen && mailById(ui.mailOpen);
  const compact = !!open;
  let lastG = '';
  const rows = list.map((m) => { const gname = groupOf(m.at); const h = gname !== lastG ? `<div class="m-group">${gname}</div>` : ''; lastG = gname; return h + row(m, compact); }).join('');
  const listHTML = `<div class="m-list ${compact ? 'compact' : ''}">${rows || `<p class="muted fin-none" style="padding:24px">${filter === 'unread' ? 'Alles gelesen.' : 'Posteingang leer. 🎉'}</p>`}</div>`;
  if (open && isMobile()) return reader(open);
  return `${top}${notes()}
    <div class="mail-wrap ${open ? 'split' : ''}">${listHTML}${open ? reader(open) : ''}</div>`;
}
