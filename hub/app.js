// Daily Hub: ein Screen für den Tag. Liest Task-App + Health aus Firebase, eigene Daten nur hub_days.
//
// Daten (Firebase users/<uid>/…):
//   hub_days  {id = 'YYYY-MM-DD', wins: {body: {done, note}, mind: {…}, spirit: {…}}}
//   gelesen:  tasks, entries, projects (Task-App) · gym_sets, gym_days, gym_plans, gym_activities, gym_meta, nut_log (Health)

import * as S from './store.js';

const VERSION = '0.1.0';
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => toDateStr(new Date());
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return toDateStr(d); };
const weekday = (s) => (parseDate(s).getDay() + 6) % 7; // 0 = Montag
const r0 = (n) => Math.round(n || 0).toLocaleString('de-DE');
const fmtDate = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtH = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${pad(m % 60)}m`; };
const dayStart = (date) => parseDate(date).getTime();

const ui = { sheet: null, editing: null };

// ---------- Tasks (gleiche Regeln wie die Heute-Ansicht der Task-App) ----------
const PRIO = { high: 0, medium: 1, low: 2 };
const prio = (t) => PRIO[t.priority] ?? 3;
function repeatsOn(t, date) {
  if (!t.repeat || !t.date || t.status === 'done' || date <= t.date) return false;
  if (t.skip?.includes(date)) return false;
  if (t.repeat === 'daily') return true;
  if (t.repeat === 'weekdays') return weekday(date) < 5;
  if (t.repeat === 'weekly') return weekday(date) === weekday(t.date);
  if (t.repeat === 'monthly') return date.slice(8) === t.date.slice(8);
  return false;
}
const openToday = (d) => S.all('tasks')
  .filter((t) => t.status !== 'done' && t.status !== 'waiting' && t.date && t.date <= d && !t.time)
  .sort((a, b) => (a.order ?? 1e15) - (b.order ?? 1e15) || prio(a) - prio(b));
const appointments = (d) => S.all('tasks').filter((t) => t.time && t.status !== 'done' && (t.date === d || repeatsOn(t, d))).sort((a, b) => a.time.localeCompare(b.time));
const doneOn = (d) => { const a = dayStart(d), b = a + 864e5; return S.all('tasks').filter((t) => t.status === 'done' && t.doneAt >= a && t.doneAt < b); };
const trackedOn = (d) => { const a = dayStart(d), b = a + 864e5; return S.all('entries').reduce((s, e) => s + Math.max(0, Math.min(e.end || Date.now(), b) - Math.max(e.start, a)), 0); };

// ---------- Health ----------
const NUT_GOALS = { kcal: 2600, p: 180, c: 280, f: 80 };
const goals = () => ({ ...NUT_GOALS, ...(S.get('gym_meta', 'settings')?.nut || {}) });
const eaten = (d) => S.all('nut_log').filter((x) => x.date === d).reduce((a, x) => {
  const k = (x.g || 0) / 100, p = x.per || {};
  return { kcal: a.kcal + (p.kcal || 0) * k, p: a.p + (p.p || 0) * k, c: a.c + (p.c || 0) * k, f: a.f + (p.f || 0) * k, n: a.n + 1 };
}, { kcal: 0, p: 0, c: 0, f: 0, n: 0 });
const SPORTS = { fussball: ['⚽', 'Fußball'], laufen: ['🏃', 'Laufen'], rad: ['🚴', 'Radfahren'], schwimmen: ['🏊', 'Schwimmen'], tennis: ['🎾', 'Tennis'], basketball: ['🏀', 'Basketball'], wandern: ['🥾', 'Wandern'], spazieren: ['🚶', 'Spazieren'], yoga: ['🧘', 'Yoga'], kampfsport: ['🥊', 'Kampfsport'], sonst: ['⭐', 'Sport'] };
const planOfWeekday = (wd) => S.all('gym_plans').find((p) => (p.days || []).includes(wd));
function training(d) {
  const sets = S.all('gym_sets').filter((s) => s.date === d);
  const day = S.get('gym_days', d);
  const task = day?.taskId ? S.get('tasks', day.taskId) : null;
  const a = dayStart(d), b = a + 864e5;
  const ms = task ? S.all('entries').filter((e) => e.taskId === task.id && e.start >= a && e.start < b).reduce((s, e) => s + (e.end || Date.now()) - e.start, 0) : 0;
  const plan = day ? (day.planId ? S.get('gym_plans', day.planId) : null) : planOfWeekday(weekday(d));
  const acts = S.all('gym_activities').filter((x) => x.date === d).map((x) => ({ icon: (SPORTS[x.type] || SPORTS.sonst)[0], name: (SPORTS[x.type] || SPORTS.sonst)[1], min: x.min }));
  const gym = sets.length > 0 || ms > 0;
  return { gym, sets: sets.length, ms, plan, acts, any: gym || acts.length > 0 };
}

// ---------- 3 Wins ----------
const WINS = [
  ['body', 'Körper', '💪', 'Sport, Bewegung'],
  ['mind', 'Geist', '🧠', 'Etwas, das Spaß macht'],
  ['spirit', 'Spirit', '🧘', 'Meditation, Ruhe'],
];
const hubDay = (d) => S.get('hub_days', d) || { id: d, wins: {} };
// Körper zählt automatisch, sobald in Health ein Training oder Sport eingetragen ist
function winOf(d, key) {
  const w = hubDay(d).wins?.[key] || {};
  if (key === 'body' && !w.done) {
    const tr = training(d);
    if (tr.any) return { done: true, auto: true, note: tr.gym ? `Gym${tr.plan ? ' – ' + tr.plan.name : ''}` : tr.acts.map((x) => x.name).join(', ') };
  }
  return w;
}
const winCount = (d) => WINS.filter(([k]) => winOf(d, k).done).length;
function setWin(d, key, changes) {
  const doc = hubDay(d);
  S.put('hub_days', { ...doc, wins: { ...doc.wins, [key]: { ...(doc.wins?.[key] || {}), ...changes } } });
}
// Tage in Folge mit allen 3 Wins (heute zählt mit, sobald voll)
function streak() {
  let d = today(), n = 0;
  if (winCount(d) < 3) d = addDays(d, -1);
  while (winCount(d) === 3 && n < 999) { n++; d = addDays(d, -1); }
  return n;
}

// ---------- Ansicht ----------
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 17 ? 'Hallo' : h < 22 ? 'Guten Abend' : 'Gute Nacht';
}
const ring = (val, max, size = 56, stroke = 6) => {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, max ? val / max : 0));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
};
const bar = (val, max, cls = '') => `<div class="bar ${cls} ${val > max * 1.05 ? 'over' : ''}"><i style="width:${Math.min(100, max ? (val / max) * 100 : 0)}%"></i></div>`;

function winsCard(d) {
  const n = winCount(d), s = streak();
  return `<section class="card wins">
    <div class="card-head"><h2>3 Wins</h2><span class="muted">${n === 3 ? '🔥 Alle drei!' : `${n} / 3`}${s > 1 ? ` · ${s} Tage in Folge` : ''}</span></div>
    <div class="win-grid">${WINS.map(([k, label, icon, hint]) => {
      const w = winOf(d, k);
      return `<button class="win ${w.done ? 'on' : ''}" data-act="win" data-k="${k}">
        <span class="win-icon">${icon}</span><b>${label}</b>
        <small>${w.done ? esc(w.note || (w.auto ? 'automatisch' : 'geschafft')) : hint}</small>
        ${w.auto ? '<span class="auto">auto</span>' : ''}</button>`;
    }).join('')}</div>
  </section>`;
}

function tasksCard(d) {
  const open = openToday(d), apps = appointments(d), done = doneOn(d), ms = trackedOn(d);
  const projName = (id) => (id ? S.get('projects', id)?.name : '') || '';
  const list = open.slice(0, 6);
  return `<a class="card link-card" href="../">
    <div class="card-head"><h2>Heute</h2><span class="muted">${done.length} erledigt · ${fmtH(ms)} getrackt</span></div>
    ${apps.length ? `<div class="apps">${apps.map((t) => `<div class="app-row"><span class="time">${esc(t.time)}</span><span>${esc(t.title)}</span></div>`).join('')}</div>` : ''}
    ${list.length ? `<ul class="tasks">${list.map((t) => `<li class="${t.date < d ? 'late' : ''}"><i class="dot p-${esc(t.priority || 'none')}"></i><span>${esc(t.title)}</span>${projName(t.projectId) ? `<small>${esc(projName(t.projectId))}</small>` : ''}</li>`).join('')}</ul>`
      : `<p class="empty">${done.length ? 'Alles für heute erledigt ✓' : 'Nichts für heute geplant.'}</p>`}
    ${open.length > list.length ? `<p class="more">+ ${open.length - list.length} weitere</p>` : ''}
  </a>`;
}

function healthCard(d) {
  const g = goals(), e = eaten(d), tr = training(d);
  const left = g.kcal - e.kcal;
  let trLine;
  if (tr.gym) trLine = `🏋️ <b>${esc(tr.plan?.name || 'Gym')}</b> · ${tr.sets} Sätze${tr.ms ? ' · ' + fmtH(tr.ms) : ''}`;
  else if (tr.plan) trLine = `📋 Geplant: <b>${esc(tr.plan.name)}</b>`;
  else trLine = '<span class="muted">Kein Training geplant</span>';
  return `<a class="card link-card" href="../gym/">
    <div class="card-head"><h2>Health</h2><span class="muted">${e.n ? `${e.n} Einträge` : 'noch nichts gegessen'}</span></div>
    <div class="kcal">
      <div class="kcal-ring">${ring(e.kcal, g.kcal, 72, 8)}<div><b>${r0(Math.abs(left))}</b><small>${left < 0 ? 'drüber' : 'übrig'}</small></div></div>
      <div class="macros">
        ${[['Protein', e.p, g.p, 'p'], ['Kohlenh.', e.c, g.c, 'c'], ['Fett', e.f, g.f, 'f']].map(([l, v, m, c]) => `<div class="macro"><div class="macro-top"><span>${l}</span><span class="muted">${r0(v)} / ${r0(m)} g</span></div>${bar(v, m, c)}</div>`).join('')}
      </div>
    </div>
    <div class="training">${trLine}${tr.acts.map((x) => `<span class="chip">${x.icon} ${esc(x.name)}${x.min ? ` · ${x.min} min` : ''}</span>`).join('')}</div>
  </a>`;
}

function loginCard() {
  return `<section class="card">
    <h2>Anmelden</h2>
    <p class="muted">Gleicher Login wie in Task-App und Health. Danach siehst du hier deine Daten.</p>
    <form id="login" class="stack">
      <input name="email" type="email" autocomplete="username" placeholder="E-Mail" required>
      <input name="pw" type="password" autocomplete="current-password" placeholder="Passwort" required>
      <button class="btn primary" type="submit">Anmelden</button>
    </form>
  </section>`;
}

function render() {
  const d = today();
  const st = { online: 'ok', offline: 'off', connecting: 'wait', 'signed-out': 'off', error: 'err', off: 'off' }[S.sync.status];
  $('#main').innerHTML = `
    <header class="top">
      <div><p class="date">${fmtDate.format(new Date())}</p><h1>${greeting()}, Niklas</h1></div>
      <button class="sync s-${st}" data-act="settings" aria-label="Einstellungen">${ring(winCount(d), 3, 44, 5)}<span>${winCount(d)}</span></button>
    </header>
    ${S.sync.status === 'signed-out' ? loginCard() : ''}
    ${winsCard(d)}
    ${tasksCard(d)}
    ${healthCard(d)}
    <p class="foot">Daily Hub · Version ${VERSION}</p>`;
  renderSheet();
}

// ---------- Sheets ----------
function renderSheet() {
  const root = $('#sheet-root');
  if (!ui.sheet) { root.innerHTML = ''; return; }
  root.innerHTML = `<div class="backdrop" data-act="close"></div><div class="sheet">${ui.sheet()}</div>`;
}
function openSheet(fn) { ui.sheet = fn; renderSheet(); }
function closeSheet() { ui.sheet = null; ui.editing = null; renderSheet(); }

function winSheet(key) {
  const d = today(), [, label, icon] = WINS.find((w) => w[0] === key), w = winOf(d, key), own = hubDay(d).wins?.[key] || {};
  return () => `<div class="grab"></div>
    <h2>${icon} ${label}</h2>
    ${w.auto ? `<p class="muted">Automatisch erkannt: ${esc(w.note)}. Du kannst trotzdem eine eigene Notiz eintragen.</p>` : ''}
    <form id="win-form" class="stack" data-k="${key}">
      <input name="note" value="${esc(own.note || '')}" placeholder="Was war's? (optional)" autocomplete="off">
      <button class="btn primary" type="submit">${own.done || w.auto ? 'Speichern' : 'Geschafft ✓'}</button>
      ${own.done ? '<button class="btn" type="button" data-act="win-undo">Doch nicht</button>' : ''}
    </form>`;
}

function settingsSheet() {
  const st = { online: 'Synchronisiert', offline: 'Offline – Daten von zuletzt', connecting: 'Verbinde…', 'signed-out': 'Nicht angemeldet', error: 'Fehler', off: 'Aus' }[S.sync.status];
  return `<div class="grab"></div>
    <h2>Daily Hub</h2>
    <p class="muted">${st}${S.sync.user ? ` · ${esc(S.sync.user.email)}` : ''}</p>
    ${S.sync.error ? `<p class="danger">${esc(S.sync.error)}</p>` : ''}
    <div class="stack">
      <a class="btn" href="../">Task-App öffnen</a>
      <a class="btn" href="../gym/">Health öffnen</a>
      ${S.sync.user ? '<button class="btn" data-act="logout">Abmelden</button>' : ''}
    </div>
    <p class="muted small">Version ${VERSION}</p>`;
}

// ---------- Events ----------
document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'close') closeSheet();
  if (act === 'settings') openSheet(settingsSheet);
  if (act === 'logout') { await S.signOutUser(); closeSheet(); }
  if (act === 'win') {
    const k = el.dataset.k, own = hubDay(today()).wins?.[k] || {};
    // Erster Tipp hakt direkt ab (schnell), weitere Tipps öffnen Notiz/Rückgängig
    if (!own.done && !winOf(today(), k).auto) { setWin(today(), k, { done: true, at: Date.now() }); navigator.vibrate?.(10); flash(k); }
    else openSheet(winSheet(k));
  }
  if (act === 'win-undo') { const k = $('#win-form').dataset.k; setWin(today(), k, { done: false }); closeSheet(); }
});
document.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  if (f.id === 'login') {
    try { await S.signIn(f.email.value.trim(), f.pw.value); } catch (e) { alertInline(f, 'Anmeldung fehlgeschlagen: ' + e.code); }
  }
  if (f.id === 'win-form') {
    setWin(today(), f.dataset.k, { done: true, note: f.note.value.trim(), at: Date.now() });
    closeSheet();
  }
});
function alertInline(form, msg) {
  let p = form.querySelector('.danger');
  if (!p) { p = document.createElement('p'); p.className = 'danger'; form.append(p); }
  p.textContent = msg;
}
function flash(k) { requestAnimationFrame(() => document.querySelector(`.win[data-k="${k}"]`)?.classList.add('pop')); }

// Nicht bei jedem Sync-Ereignis neu zeichnen, während man tippt
let raf;
S.subscribe(() => {
  if (document.activeElement?.matches('input')) return;
  cancelAnimationFrame(raf); raf = requestAnimationFrame(render);
});
setInterval(() => { if (!ui.sheet) render(); }, 60000); // Tageswechsel, laufende Timer
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

render();
S.initSync();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
