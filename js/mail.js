// Mail: Gmail direkt im Browser (Google-Login + Gmail-API), Aufbau wie die Mail-Ansicht von HeroSpace.
// Apple Mail (iCloud) hat keine Web-Schnittstelle und kommt später über den Mac-Helfer dazu.
// Datenschutz: Mails liegen nur im Arbeitsspeicher dieses Geräts. Nichts davon landet in Firebase.
// Bilder aus dem Netz (oft Zählpixel) werden erst nach Klick geladen.
import * as store from './store.js';
import { ui, isMobile } from './ui.js';
import { icon } from './icons.js';
import { head } from './views.js';
import { esc, today, addDays } from './util.js';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
const TOK = 'taskapp-gtok', ACC = 'taskapp-gmail-account';
export const clientId = () => (store.settings.gmailClientId || '').trim();

const ls = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
// Zugriffsschlüssel von Google gilt 1 Stunde und bleibt nur in diesem Tab (sessionStorage)
let tok = (() => { try { const t = JSON.parse(sessionStorage.getItem(TOK) || 'null'); return t && t.exp > Date.now() ? t : null; } catch { return null; } })();
const saveTok = () => { try { tok ? sessionStorage.setItem(TOK, JSON.stringify(tok)) : sessionStorage.removeItem(TOK); } catch {} };
export const st = { account: ls(ACC), list: null, loading: false, error: null, full: {}, imgs: {} };
export const connected = () => !!st.account;
export const hasToken = () => !!tok && tok.exp > Date.now();

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
  st.error = null;
  return refresh();
}
export function signOut() {
  if (tok && window.google?.accounts?.oauth2) try { window.google.accounts.oauth2.revoke(tok.at, () => {}); } catch {}
  tok = null; saveTok(); st.account = null; lsSet(ACC, null); st.list = null; st.full = {}; st.error = null; ui.mailOpen = null; notify();
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
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || m[2], email: m[2].trim() } : { name: v.trim(), email: v.trim() };
}
const CATS = { CATEGORY_UPDATES: 'Updates', CATEGORY_PROMOTIONS: 'Werbung', CATEGORY_SOCIAL: 'Soziale Netzwerke', CATEGORY_FORUMS: 'Foren' };
function parseMeta(m) {
  const from = parseFrom(hdr(m, 'From'));
  const labels = m.labelIds || [];
  return {
    id: m.id, threadId: m.threadId, from, subject: hdr(m, 'Subject') || '(ohne Betreff)', snippet: decodeEnt(m.snippet),
    at: Number(m.internalDate) || Date.parse(hdr(m, 'Date')) || Date.now(),
    unread: labels.includes('UNREAD'), starred: labels.includes('STARRED'), important: labels.includes('IMPORTANT'),
    cat: Object.keys(CATS).find((c) => labels.includes(c)) || null,
  };
}
export async function refresh() {
  if (!hasToken()) { notify(); return; }
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
export async function openMail(id) {
  ui.mailOpen = id; notify();
  const m = st.list?.find((x) => x.id === id);
  if (!st.full[id]) {
    try {
      const full = await g(`/messages/${id}?format=full`);
      st.full[id] = { html: bodyOf(full.payload, 'text/html'), text: bodyOf(full.payload, 'text/plain'), to: hdr(full, 'To'), cc: hdr(full, 'Cc') };
    } catch (e) { st.full[id] = { error: e.message === 'auth' ? 'Google-Anmeldung abgelaufen.' : e.message }; }
  }
  if (m?.unread) { m.unread = false; g(`/messages/${id}/modify`, { method: 'POST', body: JSON.stringify({ removeLabelIds: ['UNREAD'] }) }).catch(() => {}); }
  notify();
}
export async function setUnread(id, unread) {
  const m = st.list?.find((x) => x.id === id); if (m) m.unread = unread; notify();
  await g(`/messages/${id}/modify`, { method: 'POST', body: JSON.stringify(unread ? { addLabelIds: ['UNREAD'] } : { removeLabelIds: ['UNREAD'] }) });
}
// Archivieren = aus dem Posteingang nehmen (bleibt in Gmail unter „Alle Nachrichten“)
export async function archive(id) {
  const i = st.list?.findIndex((x) => x.id === id) ?? -1;
  const m = i >= 0 ? st.list.splice(i, 1)[0] : null;
  if (ui.mailOpen === id) ui.mailOpen = null;
  notify();
  try { await g(`/messages/${id}/modify`, { method: 'POST', body: JSON.stringify({ removeLabelIds: ['INBOX'] }) }); }
  catch (e) { if (m) { st.list.splice(i, 0, m); notify(); } throw e; }
  return { m, i };
}
export async function unarchive({ m, i }) {
  await g(`/messages/${m.id}/modify`, { method: 'POST', body: JSON.stringify({ addLabelIds: ['INBOX'] }) });
  st.list.splice(Math.min(i, st.list.length), 0, m); notify();
}
export const mailById = (id) => st.list?.find((x) => x.id === id);
export const gmailLink = (m) => `https://mail.google.com/mail/u/${encodeURIComponent(st.account || '0')}/#all/${m.threadId}`;

// ---------- Ansicht ----------
const COLORS = ['#e5484d', '#f76b15', '#e2a336', '#30a46c', '#12a594', '#0090ff', '#6e56cf', '#d6409f', '#8d8d86'];
const avatar = (from, size = 28) => {
  const s = from.name || from.email || '?';
  let h = 0; for (const ch of from.email || s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const c = COLORS[h % COLORS.length];
  return `<span class="m-av" style="--c:${c};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px">${esc((s.match(/[A-Za-zÀ-ž0-9]/) || ['?'])[0].toUpperCase())}</span>`;
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

function setupView() {
  const cid = clientId();
  return `
    <div class="mail-setup">
      <div class="panel m-acc">
        <div class="m-acc-h"><span class="m-acc-ic gm">${icon('mail')}</span><div><h4>Gmail</h4><p class="muted">Posteingang lesen, archivieren, als gelesen markieren, Mail → Aufgabe</p></div></div>
        ${cid && !ui.mailCidEdit ? `<button class="btn primary" data-action="mail-signin">${icon('mail')} Mit Google anmelden</button>
          <p class="fin-note">Client-ID ist eingetragen. <a href="#" data-action="mail-cid-edit">Ändern</a></p>`
        : `<p class="m-steps">Einmalig: In der Google Cloud Console ein kleines Projekt anlegen und dort eine <b>Client-ID</b> erstellen (Webanwendung, Herkunft <code>https://salkinsuirelav.github.io</code>, Gmail-API aktivieren). Die genaue Anleitung steht in <a href="https://github.com/salkinsuirelav/tasks/blob/main/MAIL.md" target="_blank" rel="noopener">MAIL.md</a>.</p>
          <div class="field"><label>Client-ID</label><div class="pf-search"><input id="gm-cid" value="${esc(cid)}" placeholder="…apps.googleusercontent.com" autocomplete="off" spellcheck="false"><button class="btn primary" data-action="mail-cid-save">Speichern</button></div></div>`}
      </div>
      <div class="panel m-acc">
        <div class="m-acc-h"><span class="m-acc-ic ic">${icon('mail')}</span><div><h4>Apple Mail (iCloud)</h4><p class="muted">Kommt über den Mac-Helfer dazu. iCloud hat keine Schnittstelle für Web-Apps.</p></div></div>
        <span class="pf-pill">Bald</span>
      </div>
      <p class="fin-note">Deine Mails bleiben auf deinem Gerät. Die App speichert sie nirgends, auch nicht in Firebase.</p>
    </div>`;
}

function row(m, compact) {
  const on = ui.mailOpen === m.id;
  return `<div class="m-row ${m.unread ? 'unread' : ''} ${on ? 'on' : ''}" data-action="mail-open" data-id="${m.id}">
    ${avatar(m.from)}
    <span class="m-from">${esc(m.from.name)}</span>
    ${compact ? '' : m.cat ? `<span class="m-cat"><i></i>${CATS[m.cat]}</span>` : '<span class="m-cat empty"></span>'}
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
  else if (f.error) body = `<p class="fin-note" style="color:var(--danger)">${esc(f.error)}</p>`;
  else if (f.html) {
    // Eigenes, abgeschottetes Fenster: keine Skripte, Links öffnen neu, Bilder aus dem Netz erst nach Klick
    const csp = `default-src 'none'; style-src 'unsafe-inline' *; font-src *; img-src data: cid:${imgs ? ' https: http:' : ''};`;
    const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>html,body{margin:0;padding:0;background:#fff;color:#18181b;font:14px/1.5 -apple-system,BlinkMacSystemFont,Inter,sans-serif;word-wrap:break-word}body{padding:16px}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${f.html}</body></html>`;
    body = `<iframe class="m-frame" data-id="${m.id}" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin" srcdoc="${esc(doc)}" title="Mail"></iframe>`;
  } else body = `<div class="m-plain">${esc(f.text || m.snippet).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')}</div>`;
  const hasRemote = f?.html && /<img[^>]+src=["']?https?:/i.test(f.html);
  return `<div class="m-reader panel">
    <div class="m-r-bar">
      ${isMobile() ? `<button class="icon-btn" data-action="mail-close" title="Zurück">${icon('arrowLeft')}</button>` : `<button class="icon-btn" data-action="mail-close" title="Schließen">${icon('x')}</button>`}
      <span class="m-r-sp"></span>
      <button class="icon-btn" data-action="mail-task" data-id="${m.id}" title="Als Aufgabe übernehmen">${icon('check')}</button>
      <button class="icon-btn" data-action="mail-unread" data-id="${m.id}" title="Als ungelesen markieren">${icon('mail')}</button>
      <button class="icon-btn" data-action="mail-archive" data-id="${m.id}" title="Archivieren">${icon('archive')}</button>
      <a class="icon-btn" href="${esc(gmailLink(m))}" target="_blank" rel="noopener" title="In Gmail öffnen">${icon('external')}</a>
    </div>
    <h2 class="m-subj">${esc(m.subject)}</h2>
    <div class="m-meta">${avatar(m.from, 36)}<div><span class="m-who"><b>${esc(m.from.name)}</b> <span class="muted">&lt;${esc(m.from.email)}&gt;</span></span><small class="muted">${f?.to ? `an ${esc(f.to)} · ` : ''}${new Date(m.at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}</small></div></div>
    ${hasRemote && !imgs ? `<div class="m-imgs">${icon('eyeOff')}<span>Bilder aus dem Netz sind blockiert (Schutz vor Zählpixeln).</span><button class="btn small" data-action="mail-imgs" data-id="${m.id}">Bilder laden</button></div>` : ''}
    ${body}
  </div>`;
}

export function viewMail() {
  if (!connected()) return `${head('Mail', 'Gmail und Apple Mail an einem Ort')}${setupView()}`;
  if (hasToken() && !st.list && !st.loading && !st.error) refresh();
  const unread = st.list?.filter((m) => m.unread).length || 0;
  const filter = ui.mailFilter || 'all';
  const actions = `${hasToken() ? `<button class="icon-btn" data-action="mail-refresh" title="Neu laden">${icon('refresh')}</button>` : ''}
    <button class="icon-btn" data-action="mail-signout" title="Gmail auf diesem Gerät trennen">${icon('logout')}</button>`;
  const tabs = `<div class="tabs m-filter">${[['all', 'Posteingang'], ['unread', `Ungelesen${unread ? `<span class="n">${unread}</span>` : ''}`]].map(([v, l]) => `<button class="${filter === v ? 'on' : ''}" data-action="mail-filter" data-v="${v}">${l}</button>`).join('')}</div>`;
  const top = head('Mail', esc(st.account || ''), actions, 'mail-head', tabs);
  if (!hasToken()) return `${top}
    <div class="panel fin-empty"><span class="fin-empty-ic">${icon('lock')}</span><h3>Google-Anmeldung abgelaufen</h3>
      <p class="muted">Google gibt der App immer nur für eine Stunde Zugriff. Ein Klick genügt, du musst nichts neu bestätigen.</p>
      <button class="btn primary" data-action="mail-signin">${icon('mail')} Weiter mit Google</button>
      ${st.error ? `<p class="fin-note" style="color:var(--danger)">${esc(st.error)}</p>` : ''}</div>`;
  if (!st.list) return `${top}<div class="m-load muted">${st.error ? `<span style="color:var(--danger)">${esc(st.error)}</span> <button class="btn small" data-action="mail-refresh">Nochmal</button>` : 'Posteingang wird geladen …'}</div>`;
  const list = st.list.filter((m) => filter !== 'unread' || m.unread || ui.mailOpen === m.id);
  const open = ui.mailOpen && mailById(ui.mailOpen);
  const compact = !!open;
  let lastG = '';
  const rows = list.map((m) => { const gname = groupOf(m.at); const h = gname !== lastG ? `<div class="m-group">${gname}</div>` : ''; lastG = gname; return h + row(m, compact); }).join('');
  const listHTML = `<div class="m-list ${compact ? 'compact' : ''}">${rows || `<p class="muted fin-none" style="padding:24px">${filter === 'unread' ? 'Alles gelesen.' : 'Posteingang leer. 🎉'}</p>`}</div>`;
  if (open && isMobile()) return reader(open);
  return `${top}${st.error ? `<p class="fin-note" style="color:var(--danger);margin:0 0 12px">${esc(st.error)}</p>` : ''}
    <div class="mail-wrap ${open ? 'split' : ''}">${listHTML}${open ? reader(open) : ''}</div>`;
}
