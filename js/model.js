// Fachlogik: was bedeutet "erledigen", "Timer starten", "freie Zeit" usw.
import * as store from './store.js';
import { today, addDays, addMonths, weekday, toMin, fromMin, nowMin, byPrio, prioRank } from './util.js';

export const tasks = () => store.all('tasks');
export const openTasks = () => tasks().filter((t) => t.status !== 'done');
export const project = (id) => (id ? store.get('projects', id) : null);
export const projects = () => store.all('projects').filter((p) => !p.archived).sort((a, b) => a.createdAt - b.createdAt);

// ---- Tasks ----
export function addTask(title, extra = {}) {
  title = title.trim();
  if (!title) return null;
  return store.put('tasks', {
    title, notes: '', projectId: null, date: null, time: null, duration: 30,
    priority: '', status: 'todo', repeat: '', ai: false, ...extra,
  });
}

function nextDate(date, repeat) {
  const base = date || today();
  if (repeat === 'daily') return addDays(base, 1);
  if (repeat === 'weekly') return addDays(base, 7);
  if (repeat === 'monthly') return addMonths(base, 1);
  if (repeat === 'weekdays') { let d = addDays(base, 1); while (weekday(d) > 4) d = addDays(d, 1); return d; }
  return null;
}

// Abhaken. Bei Wiederholung wird automatisch die nächste Instanz angelegt.
export function toggleDone(id) {
  const t = store.get('tasks', id);
  if (!t) return;
  if (t.status === 'done') { store.patch('tasks', id, { status: 'todo', doneAt: null }); return; }
  store.batch(() => {
    if (running()?.taskId === id) stopTimer();
    store.patch('tasks', id, { status: 'done', doneAt: Date.now() });
    if (t.repeat) {
      const { id: _old, createdAt, updatedAt, doneAt, ...rest } = t;
      store.put('tasks', { ...rest, status: 'todo', date: nextDate(t.date, t.repeat) });
    }
  });
}

// ---- Timetracking ----
export const running = () => store.all('entries').find((e) => !e.end);
export function startTimer(taskId) {
  const t = store.get('tasks', taskId);
  store.batch(() => {
    const r = running();
    if (r) store.patch('entries', r.id, { end: Date.now() });
    store.put('entries', { taskId, projectId: t?.projectId || null, start: Date.now(), end: null });
    if (t && t.status === 'todo') store.patch('tasks', taskId, { status: 'doing' });
  });
}
export function stopTimer() {
  const r = running();
  if (r) store.patch('entries', r.id, { end: Date.now() });
}
export const entryMs = (e) => (e.end || Date.now()) - e.start;
export const trackedFor = (taskId) => store.all('entries').filter((e) => e.taskId === taskId).reduce((s, e) => s + entryMs(e), 0);
export function entriesBetween(fromDate, toDateExcl) {
  const a = new Date(fromDate + 'T00:00').getTime(), b = new Date(toDateExcl + 'T00:00').getTime();
  return store.all('entries').filter((e) => e.start < b && (e.end || Date.now()) > a);
}
// Projekt eines Eintrags: das aktuelle Projekt des Tasks (falls umgehängt), sonst das gespeicherte
export const entryProject = (e) => store.get('tasks', e.taskId)?.projectId ?? e.projectId ?? null;

// ---- Gesperrte Zeiten ----
export function blocksOn(date) {
  return store.all('blocks').filter((b) => {
    if (b.date === date) return true;
    if (!b.repeat || date < b.date) return false;
    if (b.repeat === 'daily') return true;
    if (b.repeat === 'weekdays') return weekday(date) < 5;
    if (b.repeat === 'weekly') return weekday(date) === weekday(b.date);
    return false;
  });
}

// Alles, was an einem Tag Zeit belegt, als Minuten-Abschnitte [s, e] (0–1440).
// Über Mitternacht: Termine/Sperrzeiten vom Vortag laufen ab 00:00 weiter (cont), heutige enden um 24:00 (spill).
const DAY = 24 * 60;
export function segmentsOn(date) {
  const prev = addDays(date, -1);
  const out = [];
  for (const t of tasks()) {
    if (!t.time) continue;
    const s = toMin(t.time), e = s + (t.duration || 30);
    if (t.date === date) out.push({ kind: 'task', t, s, e: Math.min(e, DAY), spill: e > DAY });
    else if (t.date === prev && e > DAY) out.push({ kind: 'task', t, s: 0, e: e - DAY, cont: true });
  }
  for (const b of blocksOn(date)) {
    const s = toMin(b.start), e = toMin(b.end);
    out.push(e > s ? { kind: 'block', b, s, e } : { kind: 'block', b, s, e: DAY, spill: true });
  }
  for (const b of blocksOn(prev)) {
    const s = toMin(b.start), e = toMin(b.end);
    if (e <= s && e > 0) out.push({ kind: 'block', b, s: 0, e, cont: true });
  }
  return out;
}

// Freie Zeitfenster eines Tages (in Minuten), ohne Sperrzeiten und bereits geplante Tasks
export function freeSlots(date, settings, extraBusy = []) {
  let start = settings.dayStart * 60;
  const end = settings.dayEnd * 60;
  if (date === today()) start = Math.max(start, Math.ceil(nowMin() / 15) * 15);
  if (date < today()) return [];
  if (settings.planWeekends === false && weekday(date) >= 5) return []; // Einstellung: am Wochenende nichts einplanen
  const busy = [
    ...segmentsOn(date).filter((x) => x.kind === 'block' || x.t.status !== 'done').map((x) => [x.s, x.e]),
    ...extraBusy,
  ].sort((a, b) => a[0] - b[0]);
  const free = [];
  let cur = start;
  for (const [s, e] of busy) {
    if (s > cur) free.push([cur, Math.min(s, end)]);
    cur = Math.max(cur, e);
    if (cur >= end) break;
  }
  if (cur < end) free.push([cur, end]);
  return free.filter(([s, e]) => e - s >= 15);
}

// ---- Auto-Plan (ohne KI): Frosch zuerst, dann nach Prio in die nächsten freien Slots ----
export function autoPlan(settings, days = 7) {
  const t0 = today();
  const candidates = openTasks()
    .filter((t) => !t.time && (!t.date || t.date >= t0) && t.status !== 'waiting')
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || byPrio(a, b));
  const placed = [];
  const extra = {}; // pro Tag zusätzlich belegte Zeiten durch diese Planung
  const undo = [];
  for (const t of candidates) {
    const dur = t.duration || 30;
    const range = t.date ? [t.date] : Array.from({ length: days }, (_, i) => addDays(t0, i));
    for (const d of range) {
      const slot = freeSlots(d, t.date ? { ...settings, planWeekends: true } : settings, extra[d] || []).find(([s, e]) => e - s >= dur);
      if (slot) {
        undo.push({ id: t.id, date: t.date, time: t.time });
        placed.push({ id: t.id, date: d, time: fromMin(slot[0]) });
        (extra[d] ||= []).push([slot[0], slot[0] + dur]);
        break;
      }
    }
  }
  store.batch(() => placed.forEach((p) => store.patch('tasks', p.id, { date: p.date, time: p.time })));
  return { count: placed.length, skipped: candidates.length - placed.length, undo };
}
export function undoPlan(undo) {
  store.batch(() => undo.forEach((u) => store.patch('tasks', u.id, { date: u.date, time: u.time, ...(u.duration ? { duration: u.duration } : {}) })));
}

// ---- Claude: Prompt bauen + Antwort übernehmen ----
export function claudePlanPrompt(settings, days = 7) {
  const t0 = today();
  const list = openTasks()
    .filter((t) => !t.time && (!t.date || t.date >= t0))
    .sort(byPrio)
    .map((t) => ({
      id: t.id, titel: t.title, dauer_min: t.duration || 30,
      prio: t.priority || 'keine', projekt: project(t.projectId)?.name || null,
      fester_tag: t.date || null, notizen: t.notes ? t.notes.slice(0, 200) : undefined,
    }));
  const slots = Array.from({ length: days }, (_, i) => addDays(t0, i)).map((d) => ({
    tag: d, frei: freeSlots(d, list.some((t) => t.fester_tag === d) ? { ...settings, planWeekends: true } : settings).map(([s, e]) => `${fromMin(s)}-${fromMin(e)}`),
  }));
  return `Du bist mein Planungsassistent. Plane meine offenen Aufgaben in meine freien Zeitfenster der nächsten ${days} Tage.

Regeln:
- "Eat the Frog": Aufgaben mit prio "frog" kommen so früh wie möglich am Tag, am besten als Erstes am Morgen.
- Danach nach Priorität: high > medium > low > keine.
- Nutze nur die freien Zeitfenster. Eine Aufgabe braucht dauer_min Minuten am Stück.
- Wenn "fester_tag" gesetzt ist, plane sie nur an diesem Tag.
- Plane nicht mehr als ca. 6 Stunden pro Tag, lass Luft für Pausen (mind. 10 Min zwischen Aufgaben).
- Wenn eine Aufgabe nicht reinpasst, lass sie weg.
- Du darfst dauer_min anpassen, wenn dir die Schätzung unrealistisch vorkommt.

Antworte NUR mit einem JSON-Array in einem Codeblock, ohne weiteren Text davor, im Format:
[{"id": "...", "date": "YYYY-MM-DD", "time": "HH:MM", "duration": 30}]

Danach darfst du unter dem Codeblock in 2-3 Sätzen erklären, wie du priorisiert hast.

Freie Zeitfenster:
${JSON.stringify(slots, null, 1)}

Offene Aufgaben:
${JSON.stringify(list, null, 1)}`;
}

export function applyClaudePlan(text) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Kein JSON-Array in der Antwort gefunden.');
  const arr = JSON.parse(match[0]);
  const undo = [];
  let count = 0;
  store.batch(() => {
    for (const p of arr) {
      const t = store.get('tasks', p.id);
      if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !/^\d{1,2}:\d{2}$/.test(p.time)) continue;
      undo.push({ id: t.id, date: t.date, time: t.time, duration: t.duration });
      store.patch('tasks', t.id, { date: p.date, time: p.time.padStart(5, '0'), duration: Number(p.duration) || t.duration });
      count++;
    }
  });
  return { count, undo };
}

export function claudeTaskPrompt(t) {
  const p = project(t.projectId);
  return `Bitte übernimm diese Aufgabe für mich. Recherchiere, wenn nötig, oder erledige sie direkt (Text, Plan, Entwurf).

Aufgabe: ${t.title}
${p ? `Projekt: ${p.name}${p.goal ? ` (Ziel: ${p.goal})` : ''}\n` : ''}${t.notes ? `Notizen:\n${t.notes}\n` : ''}
${ANSWER_RULES}`;
}

// Gilt für jede Antwort, die in der App landet: kurz, scannbar, keine Textwand
const ANSWER_RULES = `So soll die Antwort aussehen (sie wird in einer kleinen Karte in meiner Task-App angezeigt):
- Deutsch, maximal 120 Wörter, keine Einleitung, keine Wiederholung der Aufgabe.
- Zeile 1: **Ergebnis:** in einem Satz.
- Danach höchstens 5 Bullet Points, je eine Zeile, das Wichtigste zuerst. Links direkt im Bullet als [Name](URL).
- Zum Schluss: **Nächster Schritt:** eine Zeile.
- Keine Quellenliste am Ende, keine Unsicherheits-Disclaimer pro Punkt.
- Nur wenn dir für ein brauchbares Ergebnis wirklich etwas fehlt: eine einzige Rückfrage als letzte Zeile, beginnend mit **Frage:**.`;

// Antwort/Rückfrage auf ein Claude-Ergebnis: neuer Auftrag mit dem bisherigen Verlauf
export function claudeFollowUpPrompt(t, prevResult, reply) {
  return `${claudeTaskPrompt(t)}

Deine bisherige Antwort war:
<<<
${prevResult}
>>>

Meine Antwort/Rückfrage dazu: ${reply}

Gib mir jetzt die aktualisierte Antwort (gleiche Regeln wie oben).`;
}

export const sortTasks = (list, mode) => list.sort(mode === 'time' ? (a, b) => (a.time || '99').localeCompare(b.time || '99') || prioRank(a.priority) - prioRank(b.priority) : byPrio);

// ---- Beispieldaten zum Ausprobieren ----
export function seedDemo() {
  const t0 = today();
  store.batch(() => {
    const ki = store.put('projects', { name: '1000 € mit KI verdienen', color: '#e5484d', notes: 'Ziel: erstes Remote-Einkommen bis Januar.', archived: false });
    const tennis = store.put('projects', { name: 'Tennis lernen', color: '#30a46c', notes: '', archived: false });
    const seoul = store.put('projects', { name: 'Seoul Alltag', color: '#0090ff', notes: '', archived: false });
    const add = (title, x) => addTask(title, x);
    add('Angebot für ersten KI-Kunden schreiben', { projectId: ki.id, priority: 'frog', date: t0, duration: 90 });
    add('3 Ideen für KI-Automationen recherchieren', { projectId: ki.id, priority: 'high', duration: 60, ai: true, status: 'waiting' });
    add('Portfolio-Seite skizzieren', { projectId: ki.id, priority: 'medium', duration: 120 });
    add('Tennisplatz in Gangnam suchen', { projectId: tennis.id, priority: 'low', duration: 30 });
    add('Probetraining buchen', { projectId: tennis.id, priority: 'medium', date: addDays(t0, 2), duration: 30 });
    add('Koreanisch: 20 Min Hangeul üben', { projectId: seoul.id, repeat: 'daily', date: t0, time: '08:00', duration: 20 });
    add('Visum-Optionen für Dezember prüfen', { projectId: seoul.id, priority: 'high', date: addDays(t0, 1), duration: 45 });
    add('Wochenrückblick machen', { repeat: 'weekly', date: addDays(t0, (6 - weekday(t0) + 7) % 7), time: '18:00', duration: 30 });
    store.put('blocks', { date: t0, start: '12:00', end: '13:00', label: 'Mittagessen', repeat: 'daily' });
    store.put('blocks', { date: t0, start: '17:00', end: '18:30', label: 'Gym', repeat: 'weekdays' });
    const h = 3600000, base = new Date(t0 + 'T09:00').getTime();
    const anyTask = tasks().find((t) => t.projectId === ki.id);
    [[-3, 2], [-2, 1.5], [-1, 3]].forEach(([d, hours]) => {
      const s = base + d * 24 * h;
      store.put('entries', { taskId: anyTask.id, projectId: ki.id, start: s, end: s + hours * h });
    });
  });
}

// ---- Claude über den Mac-Helfer ----
// Die App legt einen "Auftrag" (job) in Firebase ab. Der Helfer auf deinem Mac holt ihn ab,
// lässt Claude Code laufen (über dein Abo) und schreibt das Ergebnis zurück.
export const helperInfo = () => store.get('meta', 'helper');
export const helperOnline = () => { const h = helperInfo(); return !!h && Date.now() - h.lastSeen < 150000; };
export const canUseHelper = () => !!store.sync.user;
export const jobsFor = (taskId) => store.all('jobs').filter((j) => j.taskId === taskId).sort((a, b) => b.createdAt - a.createdAt);

// Claude-Status einer Aufgabe für Listen/Karten: queued | running | new (fertig, noch nicht angesehen) | seen | error | manual
export function aiState(t) {
  const job = jobsFor(t.id)[0];
  if (!job) return t.ai ? 'manual' : null;
  if (job.status === 'done') return t.aiSeen === job.id ? 'seen' : 'new';
  return job.status; // queued | running | error
}
export const aiNewCount = () => openTasks().filter((t) => aiState(t) === 'new').length;

export function sendTaskToClaude(t, prompt = claudeTaskPrompt(t)) {
  store.batch(() => {
    store.put('jobs', { type: 'task', taskId: t.id, prompt, status: 'queued', result: null, error: null, applied: false });
    store.patch('tasks', t.id, { ai: true, status: t.status === 'todo' ? 'waiting' : t.status });
  });
}
export function sendPlanToClaude(settings) {
  return store.put('jobs', { type: 'plan', prompt: claudePlanPrompt(settings), status: 'queued', result: null, error: null, applied: false });
}
// Fertige Pläne, die noch nicht übernommen wurden (nur aus der letzten Stunde)
export const unappliedPlans = () => store.all('jobs').filter((j) => j.type === 'plan' && j.status === 'done' && !j.applied && Date.now() - j.createdAt < 3600000);
