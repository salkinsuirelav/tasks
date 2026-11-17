// Tasks · Erinnerungs-Dienst (Cloudflare Worker)
// ----------------------------------------------
// Läuft jede Minute (Cron). Meldet sich mit deinem Tasks-Konto bei Firebase an, schaut, welche Aufgabe
// jetzt eine Erinnerung braucht, und schickt eine Push-Mitteilung an alle Geräte, auf denen du
// Erinnerungen aktiviert hast (iPhone, Mac).
//
// Geheimnisse (nur in Cloudflare gespeichert, nie im Code): FB_EMAIL, FB_PASSWORD, VAPID_JWK
// Öffentliche Werte (aus js/config.js): FB_API_KEY, FB_PROJECT

import { sendPush } from './webpush.js';

const DEFAULT_LEAD = 10;

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env, event.scheduledTime).catch((e) => console.error('Fehler:', e.message)));
  },
};

export async function run(env, scheduledTime, deps = {}) {
  const fetchFn = deps.fetch || fetch;
  const fs = await firestore(env, fetchFn);
  const meta = await fs.list('meta');
  const subs = meta.filter((d) => d.id?.startsWith('push-') && d.endpoint);
  const prefs = { enabled: true, lead: DEFAULT_LEAD, ...(meta.find((d) => d.id === 'pushprefs') || {}) };
  const vapid = JSON.parse(env.VAPID_JWK);
  const vapidPublic = rawPublic(vapid);

  // Öffentlichen Schlüssel für die App hinterlegen (+ Lebenszeichen alle 15 Min)
  const cfg = meta.find((d) => d.id === 'pushconfig');
  const minuteTs = Math.floor(scheduledTime / 60000) * 60000;
  if (!cfg || cfg.vapidPublic !== vapidPublic || new Date(minuteTs).getUTCMinutes() % 15 === 0) {
    await fs.set('meta', 'pushconfig', { id: 'pushconfig', vapidPublic, lastRun: minuteTs, updatedAt: Date.now(), createdAt: cfg?.createdAt || Date.now() });
  }
  if (!subs.length) return { sent: 0, reason: 'keine Geräte' };

  const tz = subs.find((s) => s.tz)?.tz || 'Asia/Seoul';
  const messages = [];

  // Test-Mitteilung (Knopf in den Einstellungen): wurde in der letzten Minute angefordert
  const test = meta.find((d) => d.id === 'pushtest');
  if (test?.at && test.at >= minuteTs - 60000 && test.at < minuteTs) {
    messages.push({ title: 'Tasks · Test ✓', body: 'Erinnerungen funktionieren auf diesem Gerät.', tag: 'test' });
  }

  if (prefs.enabled !== false) {
    const now = localParts(minuteTs, tz);
    const days = [now.date];
    if (now.min >= 22 * 60) days.push(addDays(now.date, 1)); // Termine kurz nach Mitternacht
    const byDate = await Promise.all(days.map((d) => fs.query('tasks', 'date', 'EQUAL', d)));
    const repeating = await fs.query('tasks', 'repeat', 'IN', ['daily', 'weekdays', 'weekly', 'monthly']);
    const seen = new Set();
    for (const day of days) {
      const cands = [...byDate.flat().filter((t) => t.date === day), ...repeating.filter((t) => repeatsOn(t, day))];
      for (const t of cands) {
        const key = t.id + day;
        if (seen.has(key) || !t.time || t.status === 'done') continue;
        seen.add(key);
        const lead = t.remind === undefined || t.remind === null ? prefs.lead : t.remind;
        if (lead === false || lead < 0) continue; // "Keine Erinnerung"
        const startMin = dayDiff(now.date, day) * 1440 + toMin(t.time);
        if (startMin - lead !== now.min) continue;
        const end = fromMin((toMin(t.time) + (t.duration || 30)) % 1440);
        messages.push({ title: t.title, body: lead > 0 ? `In ${fmtLead(lead)} · ${t.time}–${end}` : `Jetzt · ${t.time}–${end}`, tag: key });
      }
    }
  }
  if (!messages.length) return { sent: 0 };

  let sent = 0;
  for (const sub of subs) {
    for (const m of messages) {
      const res = await sendPush(sub, { ...m, url: env.APP_URL || 'https://salkinsuirelav.github.io/tasks/' }, vapid, fetchFn);
      if (res.status === 404 || res.status === 410) { await fs.remove('meta', sub.id); break; } // Gerät abgemeldet
      if (res.ok) sent++; else console.error('Push abgelehnt', res.status, await res.text());
    }
  }
  return { sent, messages };
}

// ---------- Firebase (REST) ----------
async function firestore(env, fetchFn) {
  const r = await fetchFn(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FB_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.FB_EMAIL, password: env.FB_PASSWORD, returnSecureToken: true }),
  });
  const auth = await r.json();
  if (!r.ok) throw new Error('Anmeldung fehlgeschlagen: ' + (auth.error?.message || r.status));
  const base = `https://firestore.googleapis.com/v1/projects/${env.FB_PROJECT}/databases/(default)/documents/users/${auth.localId}`;
  const call = async (url, opt = {}) => {
    const res = await fetchFn(url, { ...opt, headers: { Authorization: 'Bearer ' + auth.idToken, 'Content-Type': 'application/json' } });
    if (!res.ok && res.status !== 404) throw new Error(`Firestore ${res.status}: ${await res.text()}`);
    return res.status === 404 ? {} : res.json();
  };
  return {
    async list(coll) {
      const out = [];
      let token = '';
      do {
        const j = await call(`${base}/${coll}?pageSize=300${token ? '&pageToken=' + token : ''}`);
        (j.documents || []).forEach((d) => out.push(fromDoc(d)));
        token = j.nextPageToken || '';
      } while (token);
      return out;
    },
    async query(coll, field, op, value) {
      const j = await call(`${base}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: coll }],
        where: { fieldFilter: { field: { fieldPath: field }, op, value: toValue(value) } },
      } }) });
      return (Array.isArray(j) ? j : []).filter((x) => x.document).map((x) => fromDoc(x.document));
    },
    set: (coll, id, data) => call(`${base}/${coll}/${id}`, { method: 'PATCH', body: JSON.stringify({ fields: toFields(data) }) }),
    remove: (coll, id) => call(`${base}/${coll}/${id}`, { method: 'DELETE' }),
  };
}

function fromValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromValue(x)]));
  return undefined;
}
const fromDoc = (d) => ({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromValue(v)])) });
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: toFields(v) } };
}
const toFields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toValue(v)]));

// ---------- Zeit ----------
const pad = (n) => String(n).padStart(2, '0');
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const weekday = (s) => (new Date(s + 'T12:00:00Z').getUTCDay() + 6) % 7; // 0 = Montag
const fmtLead = (m) => (m >= 60 && m % 60 === 0 ? `${m / 60} Std` : `${m} Min`);
export function localParts(ts, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
// Gleiche Regeln wie in der App (js/model.js → repeatsOn)
export function repeatsOn(t, date) {
  if (!t.repeat || !t.date || t.status === 'done' || date <= t.date) return false;
  if (Array.isArray(t.skip) && t.skip.includes(date)) return false;
  if (t.repeat === 'daily') return true;
  if (t.repeat === 'weekdays') return weekday(date) < 5;
  if (t.repeat === 'weekly') return weekday(date) === weekday(t.date);
  if (t.repeat === 'monthly') return date.slice(8) === t.date.slice(8);
  return false;
}

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
export const rawPublic = (jwk) => b64u(new Uint8Array([4, ...unb64u(jwk.x), ...unb64u(jwk.y)]));
