// Tasks · Apple Mail (iCloud) für den Mac-Helfer
// ---------------------------------------------
// iCloud hat keine Schnittstelle für Web-Apps. Der Helfer holt deine Mails deshalb per IMAP (so wie Apple Mail selbst)
// und reicht sie nur an die Task-App auf DIESEM Mac weiter: http://127.0.0.1:7777/mail/...
//
// Sicherheit und Datenschutz:
// - Das App-spezifische Passwort liegt im macOS-Schlüsselbund (Eintrag "tasks-icloud-mail"), nicht in einer Datei.
//   In ~/.tasks-helper-mail.json steht nur deine iCloud-Adresse.
// - Antworten bekommt nur die Task-App (Herkunft https://salkinsuirelav.github.io) und nur über 127.0.0.1.
// - Mails werden nur durchgereicht, nirgends gespeichert und nicht protokolliert. Nichts davon landet in Firebase.
// - Die App kann lesen, als gelesen/ungelesen markieren und ins Archiv verschieben. Senden oder Löschen geht nicht.
//
// Einrichten: mail-setup.command (siehe APPLEMAIL.md). Prüfen von Hand: node mail-icloud.mjs --check name@icloud.com

import tls from 'node:tls';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SERVICE = 'tasks-icloud-mail';
const CONF = path.join(os.homedir(), '.tasks-helper-mail.json');
const MAX_BYTES = 3_000_000;   // größere Mails werden gekürzt geladen (Text kommt fast immer zuerst, Anhänge danach)
const MAX_INLINE = 4_000_000;  // eingebettete Bilder (cid:) insgesamt
const IDLE_MS = 4 * 60 * 1000; // Verbindung zu iCloud nach 4 Min Pause schließen
const cfg = { host: 'imap.mail.me.com', port: 993, ca: undefined, origins: ['https://salkinsuirelav.github.io'], user: null, pass: null, quiet: false };
// Nur für Tests: anderer Server/Zertifikat, feste Zugangsdaten, zusätzliche Herkunft
export function configure(o) { Object.assign(cfg, o); conn?.close(); conn = null; archiveBox = null; }

const log = (...a) => { if (!cfg.quiet) console.log(new Date().toLocaleTimeString('de-DE'), ...a); };
const err = (code, message, status) => Object.assign(new Error(message), { code, status });

// ---------- Zugangsdaten ----------
export function account() {
  if (cfg.user) return cfg.user;
  try { return JSON.parse(fs.readFileSync(CONF, 'utf8')).user || null; } catch { return null; }
}
let passCache = null;
function password(user) {
  if (cfg.pass) return Promise.resolve(cfg.pass);
  if (passCache?.user === user) return Promise.resolve(passCache.pass);
  return new Promise((res, rej) => execFile('/usr/bin/security', ['find-generic-password', '-s', SERVICE, '-a', user, '-w'], { timeout: 15000 }, (e, out) => {
    if (e || !out.trim()) return rej(err('setup', 'Kein iCloud-Passwort im Schlüsselbund. Bitte mail-setup.command ausführen (APPLEMAIL.md).', 412));
    passCache = { user, pass: out.trim() };
    res(passCache.pass);
  }));
}

// ---------- IMAP (nur das Nötigste, ohne Zusatzpakete) ----------
// Zeichenketten in Anführungszeichen. Zeilenumbrüche sind nicht erlaubt (Schutz vor eingeschleusten Befehlen).
const q = (s) => {
  s = String(s);
  if (/[\r\n\0]/.test(s)) throw err('bad', 'Ungültige Eingabe.', 400);
  return '"' + s.replace(/[\\"]/g, '\\$&') + '"';
};
const netErr = (e) => {
  if (e?.code && ['net', 'auth', 'setup', 'bad', 'no'].includes(e.code)) return e;
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|ECONNRESET/.test(e?.code || '')) return err('net', 'iCloud ist gerade nicht erreichbar. Ist der Mac online?', 502);
  return err('net', `Verbindung zu iCloud fehlgeschlagen (${e?.code || e?.message || 'unbekannt'}).`, 502);
};

class Imap {
  constructor(user) { this.user = user; this.sock = null; this.buf = Buffer.alloc(0); this.chunks = []; this.len = 0; this.need = 0; this.n = 0; this.cur = null; this.greet = null; this.dead = false; this.box = null; this.v = null; this.exists = 0; }
  get alive() { return !this.dead && this.sock && !this.sock.destroyed; }
  async open(pass) {
    await new Promise((res, rej) => {
      this.greet = { res, rej };
      const s = this.sock = tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host, ca: cfg.ca });
      s.setTimeout(45000, () => s.destroy(err('net', 'iCloud antwortet nicht (Zeitüberschreitung).', 504)));
      s.on('data', (d) => {
        this.chunks.push(d); this.len += d.length;
        if (this.len < this.need) return; // auf den Rest einer großen Mail warten
        this.buf = Buffer.concat([this.buf, ...this.chunks]); this.chunks = []; this.len = this.buf.length;
        this.drain();
      });
      s.on('error', (e) => this.fail(e));
      s.on('close', () => this.fail(err('net', 'Verbindung zu iCloud getrennt.', 502)));
    });
    try { await this.cmd(`LOGIN ${q(this.user)} ${q(pass)}`); }
    catch (e) { throw e.code === 'no' ? err('auth', 'iCloud lehnt die Anmeldung ab. Stimmt das App-spezifische Passwort? mail-setup.command nochmal ausführen.', 401) : e; }
  }
  fail(e) {
    if (this.dead) return;
    this.dead = true;
    const g = this.greet, c = this.cur; this.greet = this.cur = null;
    g?.rej(netErr(e)); c?.rej(netErr(e));
    if (this.sock && !this.sock.destroyed) this.sock.destroy();
  }
  close() {
    if (this.alive) { try { this.sock.write('Z LOGOUT\r\n'); this.sock.end(); } catch {} }
    this.dead = true;
  }
  // Antworten zerlegen. Eine Antwort kann "Literale" enthalten: {123}\r\n gefolgt von genau 123 Bytes.
  drain() {
    for (;;) {
      let i = 0, end = -1;
      for (;;) {
        const nl = this.buf.indexOf('\r\n', i);
        if (nl < 0) { this.need = this.buf.length + 1; return; }
        const lit = /\{(\d+)\+?\}$/.exec(this.buf.toString('latin1', Math.max(i, nl - 24), nl));
        if (lit) { const e = nl + 2 + Number(lit[1]); if (this.buf.length < e) { this.need = e; return; } i = e; continue; }
        end = nl; break;
      }
      const line = this.buf.toString('latin1', 0, end); // latin1 = Bytes 1:1, Zeichensatz klären wir später pro Mail
      this.buf = this.buf.subarray(end + 2); this.len = this.buf.length; this.need = 0;
      this.onLine(line);
    }
  }
  onLine(line) {
    if (this.greet) { const g = this.greet; this.greet = null; return /^\* (OK|PREAUTH)/i.test(line) ? g.res() : g.rej(err('net', 'iCloud: ' + line.slice(0, 120), 502)); }
    const c = this.cur;
    if (!c || line.startsWith('+')) return;
    if (line.startsWith('* ')) {
      const m = /^\* (\d+) (EXISTS|EXPUNGE)/i.exec(line);
      if (m) this.exists = m[2].toUpperCase() === 'EXISTS' ? Number(m[1]) : Math.max(0, this.exists - 1);
      c.untagged.push(line); return;
    }
    if (line.startsWith(c.tag + ' ')) {
      this.cur = null;
      const rest = line.slice(c.tag.length + 1);
      if (/^OK/i.test(rest)) c.res({ untagged: c.untagged, text: rest });
      else c.rej(err(/^NO/i.test(rest) ? 'no' : 'bad', rest.slice(0, 200), 502));
    }
  }
  cmd(text) {
    if (!this.alive) return Promise.reject(err('net', 'Verbindung zu iCloud getrennt.', 502));
    return new Promise((res, rej) => {
      const tag = 'T' + (++this.n);
      this.cur = { tag, untagged: [], res, rej };
      this.sock.write(`${tag} ${text}\r\n`);
    });
  }
  async select(box, force) {
    if (this.box === box && !force) return;
    this.box = null;
    const r = await this.cmd(`SELECT ${q(box)}`);
    for (const l of r.untagged) { const m = /UIDVALIDITY (\d+)/i.exec(l); if (m) this.v = m[1]; }
    this.box = box;
  }
}

// Eine Verbindung, alles nacheinander. Nach einer Pause wieder neu verbinden.
let conn = null, chain = Promise.resolve(), idle = null;
function withImap(fn) {
  const run = async () => {
    clearTimeout(idle);
    const user = account();
    if (!user) throw err('setup', 'Apple Mail ist auf diesem Mac noch nicht eingerichtet. Bitte mail-setup.command ausführen (APPLEMAIL.md).', 412);
    for (let attempt = 0; ; attempt++) {
      try {
        if (!conn?.alive || conn.user !== user) { conn?.close(); conn = new Imap(user); await conn.open(await password(user)); }
        return await fn(conn);
      } catch (e) {
        if (e.code === 'auth') passCache = null;
        if (e.code === 'auth' || e.code === 'net') { conn?.close(); conn = null; }
        if (e.code === 'net' && attempt === 0) continue; // iCloud trennt ruhende Verbindungen: einmal neu versuchen
        throw e;
      }
    }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {}).then(() => { clearTimeout(idle); idle = setTimeout(() => { conn?.close(); conn = null; }, IDLE_MS); idle.unref?.(); });
  return p;
}

// IMAP-Antwort in Listen/Werte zerlegen: * 3 FETCH (UID 12 FLAGS (\Seen) BODY[TEXT]<0> {5}\r\nHallo)
function parse(s) {
  let i = 0;
  const val = () => {
    const c = s[i];
    if (c === '(') { i++; return list(true); }
    if (c === '"') { let r = ''; i++; while (i < s.length && s[i] !== '"') { if (s[i] === '\\') i++; r += s[i++]; } i++; return r; }
    if (c === '{') { const j = s.indexOf('}', i); const n = parseInt(s.slice(i + 1, j), 10); i = j + 3; const r = s.substr(i, n); i += n; return r; }
    let r = '';
    while (i < s.length && s[i] !== ' ' && s[i] !== '(' && s[i] !== ')') {
      if (s[i] === '[') { const j = s.indexOf(']', i); const e = j < 0 ? s.length : j + 1; r += s.slice(i, e); i = e; }
      else r += s[i++];
    }
    return r.toUpperCase() === 'NIL' ? null : r;
  };
  const list = (inner) => {
    const out = [];
    while (i < s.length) {
      if (s[i] === ' ') { i++; continue; }
      if (s[i] === ')') { i++; if (inner) return out; continue; }
      out.push(val());
    }
    return out;
  };
  return list(false);
}
function fetchItems(line) {
  const t = parse(line);
  if (t[0] !== '*' || String(t[2]).toUpperCase() !== 'FETCH' || !Array.isArray(t[3])) return null;
  const o = {};
  for (let k = 0; k + 1 < t[3].length; k += 2) o[String(t[3][k]).toUpperCase()] = t[3][k + 1];
  return o;
}
const pick = (o, prefix) => { const k = Object.keys(o).find((x) => x.startsWith(prefix)); return k ? o[k] : null; };
const flagsOf = (o) => (Array.isArray(o.FLAGS) ? o.FLAGS : []).map((f) => String(f).toLowerCase());
const imapDate = (s) => { const t = Date.parse(String(s || '').replace(/^(\s?\d+)-(\w+)-(\d+)/, '$1 $2 $3')); return Number.isFinite(t) ? t : 0; };

// ---------- Mails entschlüsseln (MIME) ----------
function decode(b, cs = 'utf-8') {
  cs = String(cs || 'utf-8').trim().toLowerCase().replace(/^["']|["']$/g, '');
  if (cs === 'us-ascii' || cs === 'ascii' || cs === 'unknown-8bit') cs = 'utf-8';
  try { return new TextDecoder(cs).decode(b); } catch { return new TextDecoder('utf-8').decode(b); }
}
// Kopfzeilen mit rohen 8-Bit-Zeichen (kommt vor): als UTF-8 lesen, wenn es passt
function rawText(s) {
  if (!/[\x80-\xff]/.test(s)) return s;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(s, 'latin1')); } catch { return s; }
}
// =?utf-8?B?...?= und =?iso-8859-1?Q?...?= (aufeinanderfolgende Teile zusammen, sonst zerbrechen Umlaute/Emojis)
const EW = /=\?([^?*]+)(?:\*[^?]*)?\?([bBqQ])\?([^?]*)\?=/g;
export function words(s) {
  s = rawText(String(s || ''));
  if (!s.includes('=?')) return s;
  let out = '', last = 0, pend = null;
  const flush = () => { if (pend) { out += decode(Buffer.concat(pend.bytes), pend.cs); pend = null; } };
  for (const m of s.matchAll(EW)) {
    const gap = s.slice(last, m.index);
    if (!(pend && /^\s*$/.test(gap))) { flush(); out += gap; }
    const cs = m[1].toLowerCase();
    const b = m[2].toUpperCase() === 'B' ? Buffer.from(m[3], 'base64')
      : Buffer.from(m[3].replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_, x) => String.fromCharCode(parseInt(x, 16))), 'latin1');
    if (pend && pend.cs !== cs) flush();
    (pend ||= { cs, bytes: [] }).bytes.push(b);
    last = m.index + m[0].length;
  }
  flush();
  return out + s.slice(last);
}
function splitHead(raw) {
  const m = /\r?\n\r?\n/.exec(raw);
  return m ? { head: raw.slice(0, m.index), body: raw.slice(m.index + m[0].length) } : { head: raw, body: '' };
}
function headers(head) {
  const h = {};
  for (const l of head.replace(/\r?\n(?=[ \t])/g, '').split(/\r?\n/)) {
    const i = l.indexOf(':');
    if (i <= 0) continue;
    const k = l.slice(0, i).trim().toLowerCase();
    if (!(k in h)) h[k] = l.slice(i + 1).trim();
  }
  return h;
}
function splitParams(v) {
  const out = []; let cur = '', inq = false;
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (c === '"' && v[i - 1] !== '\\') inq = !inq;
    if (c === ';' && !inq) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}
function ctype(v = '') {
  const [t, ...ps] = splitParams(String(v));
  const p = {};
  for (const x of ps) {
    const i = x.indexOf('=');
    if (i < 0) continue;
    let val = x.slice(i + 1).trim();
    if (val.startsWith('"')) val = val.slice(1, -1).replace(/\\(.)/g, '$1');
    p[x.slice(0, i).trim().toLowerCase()] = val;
  }
  // RFC 2231: filename*=utf-8''Rechnung%20Nov.pdf bzw. filename*0*=…; filename*1*=…
  for (const base of new Set(Object.keys(p).filter((k) => k.includes('*')).map((k) => k.split('*')[0]))) {
    const keys = Object.keys(p).filter((k) => k.startsWith(base + '*')).sort((a, b) => (parseInt(a.split('*')[1], 10) || 0) - (parseInt(b.split('*')[1], 10) || 0));
    let cs = 'utf-8', s = '';
    keys.forEach((k, n) => {
      let v = p[k];
      if (k.endsWith('*')) {
        const m = n === 0 && /^([^']*)'[^']*'(.*)$/s.exec(v);
        if (m) { cs = m[1] || cs; v = m[2]; }
        v = v.replace(/%([0-9A-Fa-f]{2})/g, (_, x) => String.fromCharCode(parseInt(x, 16)));
      }
      s += v;
    });
    p[base] = decode(Buffer.from(s, 'latin1'), cs);
  }
  return { type: (t || '').trim().toLowerCase() || 'text/plain', p };
}
function bodyBytes(body, cte = '') {
  cte = String(cte).trim().toLowerCase();
  if (cte === 'base64') { const c = body.replace(/[^A-Za-z0-9+/=]/g, '').replace(/=+(?=[^=])/g, ''); return Buffer.from(c.slice(0, c.length - (c.length % 4)), 'base64'); }
  if (cte === 'quoted-printable') return Buffer.from(body.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, x) => String.fromCharCode(parseInt(x, 16))), 'latin1');
  return Buffer.from(body, 'latin1');
}
function splitMultipart(body, boundary) {
  const parts = [], delim = '--' + boundary;
  let i = body.startsWith(delim) ? 0 : body.indexOf('\n' + delim) + 1;
  if (i <= 0 && !body.startsWith(delim)) return parts;
  for (;;) {
    if (body.startsWith(delim + '--', i)) break;
    const nl = body.indexOf('\n', i);
    if (nl < 0) break;
    const next = body.indexOf('\n' + delim, nl + 1);
    parts.push(body.slice(nl + 1, next < 0 ? body.length : next).replace(/\r$/, ''));
    if (next < 0) break;
    i = next + 1;
  }
  return parts;
}
function walk(raw, out, depth = 0) {
  const { head, body } = splitHead(raw);
  const h = headers(head);
  const ct = ctype(h['content-type'] || 'text/plain');
  if (ct.type.startsWith('multipart/') && ct.p.boundary && depth < 12) { for (const part of splitMultipart(body, ct.p.boundary)) walk(part, out, depth + 1); return; }
  const disp = ctype(h['content-disposition'] || '');
  const name = words(disp.p.filename || ct.p.name || '');
  const attach = disp.type === 'attachment' || (!!name && !ct.type.startsWith('text/')) || ct.type === 'message/rfc822';
  if (!attach && ct.type === 'text/html' && out.html == null) { out.html = decode(bodyBytes(body, h['content-transfer-encoding']), ct.p.charset); return; }
  if (!attach && ct.type === 'text/plain' && out.text == null) { out.text = decode(bodyBytes(body, h['content-transfer-encoding']), ct.p.charset); return; }
  if (!attach && ct.type.startsWith('text/')) return;
  const bytes = bodyBytes(body, h['content-transfer-encoding']);
  const cid = (h['content-id'] || '').replace(/^\s*<|>\s*$/g, '').toLowerCase();
  if (cid && ct.type.startsWith('image/') && out.inline + bytes.length <= MAX_INLINE) { out.cid[cid] = `data:${ct.type};base64,${bytes.toString('base64')}`; out.inline += bytes.length; }
  out.att.push({ name: name || (ct.type === 'message/rfc822' ? 'Weitergeleitete Mail.eml' : ct.type), type: ct.type, size: bytes.length, cid });
}
const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", zwnj: '', zwj: '', shy: '', hellip: '…', ndash: '–', mdash: '—', euro: '€', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', bdquo: '„', copy: '©', reg: '®' };
const cp = (n) => { try { return String.fromCodePoint(n); } catch { return ''; } };
function htmlText(h) {
  return h.replace(/<(head|style|script|title)\b[\s\S]*?(<\/\1\s*>|$)/gi, ' ').replace(/<!--[\s\S]*?(-->|$)/g, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|h\d|li)>/gi, '\n').replace(/<[^>]*>?/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? cp(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? ENT[e.toLowerCase()] ?? m));
}
const tidy = (s) => s.replace(/[​-‏͏­﻿⁠᠎]/g, '').replace(/\s+/g, ' ').trim();
function snippetOf(h, textRaw) {
  const out = { html: null, text: null, cid: {}, att: [], inline: MAX_INLINE }; // inline voll: in der Liste keine Bilder
  walk(`Content-Type: ${h['content-type'] || 'text/plain'}\r\nContent-Transfer-Encoding: ${h['content-transfer-encoding'] || '7bit'}\r\n\r\n${textRaw || ''}`, out);
  return tidy(out.text != null && tidy(out.text) ? out.text : out.html ? htmlText(out.html) : '').slice(0, 220);
}

// ---------- Befehle für die App ----------
const HDRS = 'FROM TO SUBJECT DATE MESSAGE-ID CONTENT-TYPE CONTENT-TRANSFER-ENCODING';
const checkV = (c, v) => { if (v && String(v) !== String(c.v)) throw err('stale', 'Der Posteingang hat sich geändert. Bitte neu laden.', 409); };
const uidOk = (u) => { const n = Number(u); if (!Number.isInteger(n) || n <= 0) throw err('bad', 'Ungültige Mail-Nummer.', 400); return n; };

export function status() {
  return withImap(async (c) => { await c.select('INBOX', true); return { configured: true, account: c.user, count: c.exists }; });
}
export function list(n = 40) {
  n = Math.min(Math.max(Number(n) || 40, 1), 100);
  return withImap(async (c) => {
    await c.select('INBOX', true); // frisch auswählen: Anzahl und Stand aktuell
    if (!c.exists) return { account: c.user, v: c.v, list: [] };
    const r = await c.cmd(`FETCH ${Math.max(1, c.exists - n + 1)}:${c.exists} (UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (${HDRS})] BODY.PEEK[TEXT]<0.6000>)`);
    const out = [];
    for (const line of r.untagged) {
      const f = fetchItems(line);
      if (!f?.UID) continue;
      const h = headers(pick(f, 'BODY[HEADER') || '');
      const fl = flagsOf(f);
      out.push({
        uid: Number(f.UID), from: words(h.from), subject: words(h.subject), at: imapDate(f.INTERNALDATE) || Date.parse(h.date) || 0,
        unread: !fl.includes('\\seen'), flagged: fl.includes('\\flagged'), snippet: snippetOf(h, pick(f, 'BODY[TEXT]')), mid: (h['message-id'] || '').trim(),
      });
    }
    out.sort((a, b) => b.at - a.at);
    return { account: c.user, v: c.v, list: out };
  });
}
export function message(uid, v) {
  uid = uidOk(uid);
  return withImap(async (c) => {
    await c.select('INBOX'); checkV(c, v);
    const r = await c.cmd(`UID FETCH ${uid} (UID FLAGS RFC822.SIZE BODY.PEEK[]<0.${MAX_BYTES}>)`);
    const f = r.untagged.map(fetchItems).find((x) => x && Number(x.UID) === uid);
    if (!f) throw err('gone', 'Diese Mail ist nicht mehr im Posteingang.', 404);
    const raw = pick(f, 'BODY[]') || '';
    const h = headers(splitHead(raw).head);
    const out = { html: null, text: null, cid: {}, att: [], inline: 0 };
    walk(raw, out);
    const used = new Set();
    const html = out.html && out.html.replace(/cid:([^"'\s)>]+)/gi, (m, id) => { let k = id.toLowerCase(); try { k = decodeURIComponent(k); } catch {} const d = out.cid[k]; if (d) used.add(k); return d || m; });
    return {
      html, text: out.text, to: words(h.to), cc: words(h.cc), mid: (h['message-id'] || '').trim(),
      attachments: out.att.filter((a) => !a.cid || !used.has(a.cid)).map(({ name, type, size }) => ({ name, type, size })),
      truncated: Number(f['RFC822.SIZE']) > MAX_BYTES,
    };
  });
}
export function setSeen(uid, v, seen) {
  uid = uidOk(uid);
  return withImap(async (c) => { await c.select('INBOX'); checkV(c, v); await c.cmd(`UID STORE ${uid} ${seen ? '+' : '-'}FLAGS.SILENT (\\Seen)`); return { ok: true }; });
}
// Archiv-Ordner finden. iCloud meldet keine Sonder-Ordner (SPECIAL-USE), der Ordner heißt "Archive".
// Gibt es ihn noch nicht, wird er angelegt (macht Apple Mail beim ersten Archivieren genauso).
let archiveBox = null;
async function findArchive(c) {
  if (archiveBox) return archiveBox;
  const r = await c.cmd('LIST "" "*"');
  const boxes = r.untagged.map((l) => { const t = parse(l); return String(t[1]).toUpperCase() === 'LIST' ? { flags: (t[2] || []).map((x) => String(x).toLowerCase()), name: t[4] } : null; }).filter((b) => b && typeof b.name === 'string');
  const b = boxes.find((x) => x.flags.includes('\\archive')) || boxes.find((x) => /^archive$/i.test(x.name)) || boxes.find((x) => /^archiv(es)?$/i.test(x.name));
  if (b) return (archiveBox = b.name);
  await c.cmd('CREATE "Archive"');
  log('Mail: Ordner "Archive" in iCloud angelegt');
  return (archiveBox = 'Archive');
}
// Verschieben. iCloud kann UID MOVE, meldet es aber nicht. Falls doch nicht: kopieren und NUR diese eine Mail
// aus dem Ordner nehmen (UID EXPUNGE). Gibt die neue Nummer im Zielordner zurück (falls iCloud sie nennt).
async function move(c, uid, dest) {
  let r;
  try { r = await c.cmd(`UID MOVE ${uid} ${q(dest)}`); }
  catch (e) {
    if (e.code !== 'bad') throw e;
    r = await c.cmd(`UID COPY ${uid} ${q(dest)}`);
    await c.cmd(`UID STORE ${uid} +FLAGS.SILENT (\\Deleted)`);
    try { await c.cmd(`UID EXPUNGE ${uid}`); }
    catch (e2) { await c.cmd(`UID STORE ${uid} -FLAGS.SILENT (\\Deleted)`).catch(() => {}); throw e2; }
  }
  const m = /COPYUID \d+ [\d:,]+ (\d+)/i.exec([r.text, ...r.untagged].join('\n'));
  return m ? Number(m[1]) : null;
}
export function archive(uid, v) {
  uid = uidOk(uid);
  return withImap(async (c) => {
    const box = await findArchive(c);
    await c.select('INBOX'); checkV(c, v);
    const newUid = await move(c, uid, box);
    return { box, uid: newUid };
  });
}
export function unarchive(box, uid, mid) {
  return withImap(async (c) => {
    if (typeof box !== 'string' || !box || box.toUpperCase() === 'INBOX') throw err('bad', 'Ungültiger Ordner.', 400);
    await c.select(box, true);
    let u = uid ? uidOk(uid) : null;
    if (!u && mid) {
      const r = await c.cmd(`UID SEARCH HEADER Message-ID ${q(mid)}`);
      const m = r.untagged.map((l) => /^\* SEARCH(.*)$/i.exec(l)).find(Boolean);
      u = m ? Number(m[1].trim().split(/\s+/).filter(Boolean).pop()) || null : null;
    }
    if (!u) throw err('gone', 'Mail im Archiv nicht gefunden.', 404);
    const back = await move(c, u, 'INBOX');
    return { uid: back };
  });
}

// ---------- HTTP für die App (im Helfer unter http://127.0.0.1:7777/mail/...) ----------
// Gibt true zurück, wenn die Anfrage hierher gehörte.
export function handleMail(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (!url.pathname.startsWith('/mail/')) return false;
  const origin = req.headers.origin;
  // Host prüfen (Schutz vor "DNS-Rebinding"), Herkunft prüfen (nur die Task-App)
  const hostOk = /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(req.headers.host || '');
  const originOk = !origin || cfg.origins.includes(origin);
  const cors = origin && originOk ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors }); res.end(JSON.stringify(obj)); };
  if (!hostOk || !originOk) { log(`Mail-Anfrage abgelehnt (Herkunft ${origin || '–'}, Host ${req.headers.host || '–'})`); send(403, { error: 'forbidden', message: 'Nur die Task-App darf Mails abrufen.' }); return true; }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'X-Tasks, Content-Type', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Max-Age': '600' });
    res.end(); return true;
  }
  // Eigener Header: eine fremde Webseite kann ihn nicht ohne Erlaubnis (CORS) mitschicken
  if (!req.headers['x-tasks']) { send(403, { error: 'forbidden', message: 'Header X-Tasks fehlt.' }); return true; }
  const done = (p) => p.then((j) => send(200, j), (e) => {
    if (!['setup', 'auth', 'stale', 'gone'].includes(e.code)) log('Mail-Fehler:', e.message);
    send(e.status || 500, { error: e.code || 'error', message: e.message || 'Unbekannter Fehler' });
  });
  const route = url.pathname.slice(6);
  if (req.method === 'GET') {
    const s = url.searchParams;
    if (route === 'status') return done(account() ? status() : Promise.resolve({ configured: false })), true;
    if (route === 'list') return done(list(s.get('n'))), true;
    if (route === 'msg') return done(Promise.resolve().then(() => message(s.get('uid'), s.get('v')))), true;
  }
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 20000) req.destroy(); });
    req.on('end', () => {
      let j = {};
      try { j = JSON.parse(body || '{}'); } catch { return send(400, { error: 'bad', message: 'Ungültige Anfrage.' }); }
      const run = {
        seen: () => setSeen(j.uid, j.v, j.seen !== false),
        archive: () => archive(j.uid, j.v),
        unarchive: () => unarchive(j.box, j.uid, j.mid),
      }[route];
      if (!run) return send(404, { error: 'unknown', message: 'Unbekannter Befehl.' });
      done(Promise.resolve().then(run));
    });
    return true;
  }
  send(404, { error: 'unknown', message: 'Unbekannter Befehl.' });
  return true;
}

// ---------- Prüfen von Hand / aus mail-setup.command: Passwort kommt über stdin ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === '--check') {
  const user = (process.argv[3] || '').trim().toLowerCase();
  let pass = '';
  process.stdin.on('data', (d) => { pass += d; });
  process.stdin.on('end', async () => {
    try {
      if (!user) throw new Error('iCloud-Adresse fehlt.');
      configure({ user, pass: pass.replace(/\s+/g, '') || null, quiet: true });
      const s = await status();
      console.log(`✓ Verbunden mit ${s.account}. Im Posteingang: ${s.count} Mails.`);
      conn?.close(); process.exit(0);
    } catch (e) { console.log(`✗ ${e.message}`); process.exit(1); }
  });
}
