// Kleine Helfer, die überall gebraucht werden.

// Text sicher in HTML einsetzen (verhindert, dass ein Task-Titel Code einschleust)
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---- Datum ----
// Wir speichern Daten als Text "YYYY-MM-DD" (lokale Zeit), Uhrzeiten als "HH:MM".
const pad = (n) => String(n).padStart(2, '0');
export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => toDateStr(new Date());
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return toDateStr(d); };
export const addMonths = (s, n) => { const d = parseDate(s); d.setMonth(d.getMonth() + n); return toDateStr(d); };
export const weekStart = (s) => { const d = parseDate(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return toDateStr(d); }; // Montag
export const weekday = (s) => (parseDate(s).getDay() + 6) % 7; // 0 = Montag
export const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

const fmtDay = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtLong = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtWd = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
export const dayLabel = (s) => {
  const t = today();
  if (s === t) return 'Heute';
  if (s === addDays(t, 1)) return 'Morgen';
  if (s === addDays(t, -1)) return 'Gestern';
  return fmtDay.format(parseDate(s));
};
export const longDate = (s) => fmtLong.format(parseDate(s));
export const shortWeekday = (s) => fmtWd.format(parseDate(s)).replace('.', '');
export const dayNum = (s) => parseDate(s).getDate();
export const rangeLabel = (start) => {
  const a = parseDate(start), b = parseDate(addDays(start, 6));
  const m = new Intl.DateTimeFormat('de-DE', { month: 'short' });
  return a.getMonth() === b.getMonth() ? `${a.getDate()}.–${b.getDate()}. ${m.format(b)}` : `${a.getDate()}. ${m.format(a)} – ${b.getDate()}. ${m.format(b)}`;
};

// ---- Dauer ----
export const fmtDur = (ms) => {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
};
export const fmtHours = (ms) => { const h = ms / 3600000; return h >= 10 || h === 0 ? `${Math.round(h)}h` : `${h.toFixed(1).replace('.0', '').replace('.', ',')}h`; };
export const fmtClock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};
export const fmtMinutes = (min) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ' ' + (min % 60) + 'm' : ''}` : `${min}m`);

// ---- Prioritäten (Eat the Frog first) ----
export const PRIOS = [
  { id: 'frog', label: 'Frosch', icon: '🐸', rank: 0 },
  { id: 'high', label: 'Hoch', icon: '', rank: 1 },
  { id: 'medium', label: 'Mittel', icon: '', rank: 2 },
  { id: 'low', label: 'Niedrig', icon: '', rank: 3 },
];
export const prioRank = (p) => PRIOS.find((x) => x.id === p)?.rank ?? 4;
export const prioLabel = (p) => PRIOS.find((x) => x.id === p)?.label ?? '';

export const STATUS = [
  { id: 'todo', label: 'Offen' },
  { id: 'doing', label: 'In Arbeit' },
  { id: 'waiting', label: 'Wartet' },
  { id: 'done', label: 'Erledigt' },
];
export const statusLabel = (s) => STATUS.find((x) => x.id === s)?.label ?? 'Offen';

export const REPEATS = [
  { id: '', label: 'Nie' },
  { id: 'daily', label: 'Täglich' },
  { id: 'weekdays', label: 'Werktags (Mo–Fr)' },
  { id: 'weekly', label: 'Wöchentlich' },
  { id: 'monthly', label: 'Monatlich' },
];

export const COLORS = ['#e5484d', '#f76b15', '#e2a336', '#30a46c', '#12a594', '#0090ff', '#6e56cf', '#d6409f', '#8d8d86'];

// Sortierung: erst Frosch, dann Prio, dann Uhrzeit, dann Reihenfolge der Erstellung
export const byPrio = (a, b) => prioRank(a.priority) - prioRank(b.priority) || (a.time || '99').localeCompare(b.time || '99') || a.createdAt - b.createdAt;
export const byTime = (a, b) => (a.time || '99').localeCompare(b.time || '99') || prioRank(a.priority) - prioRank(b.priority) || a.createdAt - b.createdAt;
