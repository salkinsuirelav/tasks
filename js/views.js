// Alle Ansichten. Jede Funktion gibt HTML als Text zurück, app.js setzt es in die Seite ein.
import * as store from './store.js';
import * as M from './model.js';
import { ui, isMobile } from './ui.js';
import { icon, PROJECT_ICONS } from './icons.js';
import { md, splitSources } from './md.js';
import { SHORTCUTS, keyOf, keyLabel } from './keys.js';
import {
  esc, toDateStr, today, addDays, weekStart, dayLabel, longDate, shortWeekday, dayNum, rangeLabel, toMin, fromMin, nowMin, weekday,
  fmtDur, fmtHours, fmtClock, fmtMinutes, PRIOS, prioLabel, STATUS, REPEATS, WD_SHORT, COLORS, byPrio,
} from './util.js';

const HOUR = 56; // Pixel pro Stunde im Kalender (gleich wie --hour in CSS)

// ---------- Bausteine ----------
const gear = `<a href="#settings" class="icon-btn mobile-only" aria-label="Einstellungen">${icon('gear')}</a>`;
const head = (title, sub = '', actions = '') => `
  <div class="head">
    <div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
    <div class="actions">${actions}${gear}</div>
  </div>`;

const curDesign = () => { try { return localStorage.getItem('taskapp-design') || 'glass'; } catch { return 'glass'; } };
const chipPrio = (p) => (p ? `<span class="chip p-${p}">${p === 'frog' ? '🐸 ' : ''}${prioLabel(p)}</span>` : '');
// Projekt-Symbol: gewähltes Icon in Projektfarbe, sonst ein Farbpunkt
export const projIcon = (p, size = 14) => p?.icon
  ? `<span class="picon" style="color:${p.color};width:${size}px;height:${size}px">${icon(p.icon)}</span>`
  : `<span class="dot" style="background:${p?.color || 'var(--faint)'};width:${Math.round(size * 0.7)}px;height:${Math.round(size * 0.7)}px"></span>`;
const chipProject = (pid) => {
  const p = M.project(pid);
  return p ? `<span class="chip">${projIcon(p, 12)}${esc(p.name)}</span>` : '';
};
const chipWhen = (t, showDate = true) => {
  const parts = [];
  if (showDate && t.date) parts.push(dayLabel(t.date));
  if (t.time) parts.push(t.time);
  const overdue = t.date && t.date < today() && t.status !== 'done';
  const txt = parts.join(' · ');
  return txt ? `<span class="chip mono ${overdue ? 'overdue' : ''}">${txt}</span>` : '';
};
const chips = (t, showDate = true) => [
  chipPrio(t.priority),
  chipProject(t.projectId),
  chipWhen(t, showDate),
  t.duration ? `<span class="chip mono">${fmtMinutes(t.duration)}</span>` : '',
  t.repeat ? `<span class="chip" title="Wiederholt sich">${icon('repeat')}</span>` : '',
  aiChip(t),
  t.status === 'doing' ? '<span class="chip">In Arbeit</span>' : '',
  t.status === 'waiting' && !['queued', 'running'].includes(M.aiState(t)) ? '<span class="chip">Wartet</span>' : '',
  Object.values(store.state.files).some((f) => f.taskId === t.id) ? `<span class="chip">${icon('clip')}</span>` : '',
].join('');

function aiChip(t) {
  const st = M.aiState(t);
  if (!st) return '';
  const c = {
    queued: ['ai', '⏳ Claude wartet'],
    running: ['ai running', `${icon('sparkle')} Claude arbeitet`],
    new: ['ai new', `${icon('check')} Claude fertig`],
    seen: ['ai', `${icon('sparkle')} Claude`],
    error: ['ai err', '⚠️ Claude-Fehler'],
    manual: ['ai', `${icon('sparkle')} Claude`],
  }[st];
  return `<span class="chip ${c[0]}">${c[1]}</span>`;
}

// Wochentage wählen (Mo–So), z. B. für "Bestimmte Tage" bei Wiederholungen
const wdPick = (days, action) => `<div class="wd-pick">${WD_SHORT.map((l, i) => `<button type="button" class="${days.includes(i) ? 'on' : ''}" data-action="${action}" data-d="${i}">${l}</button>`).join('')}</div>`;
const checkBtn = (t) => `<button class="check ${t.status === 'done' ? 'on' : ''}" data-action="toggle" data-id="${t.id}" aria-label="Erledigt">${icon('check')}</button>`;
// Kleiner Claude-Knopf an jeder Aufgabe (Liste + Karten)
const aiBtn = (t) => {
  if (t.status === 'done') return '';
  const st = M.aiState(t);
  if (st === 'queued' || st === 'running') return '';
  return `<button class="icon-btn ai-btn" data-action="ai-quick" data-id="${t.id}" title="An Claude geben" aria-label="An Claude geben">${icon('sparkle')}</button>`;
};
const playBtn = (t) => {
  const on = M.running()?.taskId === t.id;
  return t.status === 'done' ? '' : `<button class="icon-btn play ${on ? 'on' : ''}" data-action="timer" data-id="${t.id}" aria-label="Timer">${icon(on ? 'stop' : 'play')}</button>`;
};

export const taskRow = (t, showDate = true) => `
  <div class="row ${t.status === 'done' ? 'done' : ''}" data-action="open-task" data-id="${t.id}" draggable="true" data-drag="task">
    ${checkBtn(t)}
    <div class="title"><span class="t">${esc(t.title)}</span><div class="meta">${chips(t, showDate)}</div></div>
    ${aiBtn(t)}${playBtn(t)}
  </div>`;

// Was die Plan-Karten zeigen (Einstellungen > Planung > Karten zeigen)
export const CARD_FIELDS = [['project', 'Projekt'], ['prio', 'Priorität'], ['dur', 'Dauer'], ['status', 'Status'], ['repeat', 'Wiederholung'], ['play', 'Timer-Knopf']];
const CARD_DEFAULT = { project: true, prio: true, dur: false, status: false, repeat: true, play: true };
export const cardFields = () => ({ ...CARD_DEFAULT, ...(store.settings.cardFields || {}) });

// occ = Datum einer Wiederholungs-Vorschau, planDate = Spalte im Plan-Board (zum Umsortieren per Ziehen)
// Kompakt: Titel oben, darunter Haken + gewählte Infos in einer Zeile
export const taskCard = (t, showDate = false, { occ = null, planDate = null } = {}) => {
  const p = M.project(t.projectId), f = cardFields();
  const meta = [
    occ ? `<span class="rep-ic" title="Wiederholung">${icon('repeat')}</span>` : checkBtn(t),
    f.prio && t.priority === 'frog' ? '<span class="frog" title="Frosch">🐸</span>' : '',
    f.project && p ? `<span class="pj" title="${esc(p.name)}">${projIcon(p, 12)}<span class="pj-n">${esc(p.name)}</span></span>` : '',
    f.prio && t.priority && t.priority !== 'frog' ? chipPrio(t.priority) : '',
    chipWhen(t, showDate),
    f.dur && t.duration ? `<span class="chip mono">${fmtMinutes(t.duration)}</span>` : '',
    f.status && t.status === 'doing' ? '<span class="chip">In Arbeit</span>' : '',
    f.status && t.status === 'waiting' && !['queued', 'running'].includes(M.aiState(t)) ? '<span class="chip">Wartet</span>' : '',
    aiChip(t),
    f.repeat && t.repeat && !occ ? `<span class="rep-ic end" title="Wiederholt sich">${icon('repeat')}</span>` : '',
    aiBtn(t),
  ].join('');
  return `
  <div class="card ${t.status === 'done' ? 'done' : ''} ${occ ? 'rep' : ''}" data-action="open-task" data-id="${t.id}" draggable="true" data-drag="task"${occ ? ` data-occ="${occ}" title="Wiederholung"` : ''}${t.repeat || occ ? ' data-rep="1"' : ''}${planDate && t.status !== 'done' ? ` data-drop-plan="${t.id}" data-date="${planDate}"` : ''}>
    ${p ? `<div class="bar" style="background:${p.color}"></div>` : ''}
    <div class="ttl"><span>${esc(t.title)}</span>${occ || !f.play ? '' : playBtn(t)}</div>
    <div class="meta">${meta}</div>
  </div>`;
};

const capture = (attrs, placeholder = 'Neue Aufgabe… einfach tippen und Enter') => `
  <div class="capture">
    <input ${attrs} placeholder="${placeholder}" autocomplete="off" enterkeyhint="done">
    <span class="hint">↵ Enter</span>
  </div>`;

// ---------- Heute: eine Aufgabe nach der anderen, die Liste wird abgearbeitet ----------
const fmtTimeOf = (ts) => new Date(ts).toTimeString().slice(0, 5);
export function viewToday() {
  const t0 = today();
  const st = store.settings;
  const list = M.todayList();
  const r = M.running();
  const liveId = r?.taskId;
  const live = r && store.get('tasks', liveId);
  const projs = M.projects();
  const withProj = list.filter((t) => t.projectId && M.project(t.projectId));
  const other = list.filter((t) => !withProj.includes(t));
  const apps = M.appointmentsToday();
  const done = M.doneToday();
  const inbox = M.openTasks().filter((t) => !t.date).sort(byPrio);
  const selProj = projs.find((p) => p.id === ui.todayProj)?.id || projs[0]?.id || '';
  const sumOf = (arr) => arr.reduce((a, t) => a + M.trackedFor(t.id), 0);

  const card = (t, i) => {
    const p = M.project(t.projectId), on = t.id === liveId, ms = M.trackedFor(t.id);
    return `
    <div class="tcard ${on ? 'live' : ''}" style="--pc:${p?.color || 'var(--faint)'}" data-action="open-task" data-id="${t.id}" draggable="true" data-drag="task" data-drop-card="${t.id}" title="Ziehen: in der Liste umsortieren oder rechts in den Kalender">
      ${checkBtn(t)}
      <div class="title"><span class="t">${esc(t.title)}</span>
        <div class="meta">${chipProject(t.projectId)}${chipPrio(t.priority)}${t.date < t0 ? chipWhen(t) : ''}${t.repeat ? `<span class="chip">${icon('repeat')}</span>` : ''}${on ? `<button class="chip linkish" data-action="focus" data-id="${t.id}">Fokus</button>` : ''}</div></div>
      <span class="mono tm ${ms || on ? '' : 'faint'}" ${on ? 'data-tick="task"' : ''}>${fmtDur(ms)}</span>
      ${playBtn(t)}
    </div>`;
  };
  const projSelect = projs.length
    ? `<select id="today-proj" class="mini-select" aria-label="Projekt">${projs.map((p) => `<option value="${p.id}" ${p.id === selProj ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`
    : '';
  const section = (title, items, cap, extra = '', count = items.length) => `
    <section class="tsec">
      <div class="tsec-head"><span class="tsec-title">${title}</span><span class="mono muted">${count}</span><span class="mono muted tsec-sum">${sumOf(items) ? fmtDur(sumOf(items)) : ''}</span>${extra}</div>
      ${cap}
      ${items.length ? `<div class="tlist">${items.map(card).join('')}</div>` : ''}
    </section>`;

  const dur = ui.todayDur || 60;
  const durSeg = `<div class="seg mini dur" title="Geschätzte Dauer der neuen Aufgabe">${[[30, '30m'], [60, '1h'], [90, '1,5h']].map(([v, l]) => `<button class="${v === dur ? 'on' : ''}" data-action="today-dur" data-v="${v}">${l}</button>`).join('')}</div>`;
  const projCap = projs.length
    ? `<div class="capture tcap"><input data-add="today-proj" data-key="today-add-p" placeholder="Aufgabe für ein Projekt… Enter" autocomplete="off" enterkeyhint="done">${durSeg}${projSelect}</div>`
    : `<div class="empty small">Noch kein Projekt. <a href="#projects">Projekt anlegen</a>, dann landen hier deine Projekt-Aufgaben.</div>`;
  const otherCap = `<div class="capture tcap"><input data-add="today-other" data-key="today-add-o" placeholder="Sonstiges: Einkaufen, Mails, Haushalt… Enter" autocomplete="off" enterkeyhint="done">${durSeg}</div>`;
  const eye = `<button class="icon-btn eye" data-action="toggle-other" title="${st.hideOther ? 'Einblenden' : 'Ausblenden'}">${icon(st.hideOther ? 'eyeOff' : 'eye')}</button>`;

  const eyeDone = `<button class="icon-btn eye" data-action="toggle-done" title="${st.hideDone ? 'Erledigte einblenden' : 'Erledigte ausblenden'}">${icon(st.hideDone ? 'eyeOff' : 'eye')}</button>`;

  // Läuft ein Timer für etwas, das nicht in der Liste steht (z. B. aus der Inbox gestartet)?
  const liveExtra = live && !list.some((t) => t.id === liveId) ? `
    <div class="tlist" style="margin-bottom:14px">${card(live, 0)}</div>` : '';

  const doneRow = (t) => {
    const ms = M.trackedFor(t.id);
    return `<div class="row done" data-action="open-task" data-id="${t.id}">${checkBtn(t)}
      <div class="title"><span class="t">${esc(t.title)}</span><div class="meta">${chipProject(t.projectId)}</div></div>
      <span class="mono muted" style="font-size:12.5px">${ms ? fmtDur(ms) : ''}${t.doneAt ? ` · ${fmtTimeOf(t.doneAt)}` : ''}</span></div>`;
  };

  const ws = weekStart(t0);
  const goal = Number(st.weeklyGoal) || 20;
  const weekMs = M.trackedBetween(ws, addDays(ws, 7));
  const pct = Math.min(100, Math.round((weekMs / 3600000 / goal) * 100));
  const statsBar = `
    <div class="daystats">
      <div><b class="mono" data-tick="today">${fmtHours(M.trackedToday())}</b> <span class="muted">heute</span></div>
      <div><b class="mono">${fmtHours(weekMs)}</b> <span class="muted">/ ${goal}h diese Woche</span></div>
      <div class="progress"><div style="width:${pct}%;background:var(--accent)"></div></div>
    </div>`;

  return `
    ${head('Heute', `${longDate(t0)} · ${done.length} erledigt`)}
    ${statsBar}
    <div class="today-grid">
      <div class="today-main" data-drop-today="1">
        ${liveExtra}
        ${section('Projekt-Aufgaben', withProj, projCap)}
        ${st.hideOther
          ? section('Sonstiges', [], `<div class="empty small">${other.length ? `${other.length} ausgeblendet` : 'Ausgeblendet'}</div>`, eye, other.length)
          : section('Sonstiges', other, otherCap, eye)}
        ${apps.length ? `<div class="group-title">Termine heute</div><div class="list">${apps.map((t) => `<div class="row ${t.status === 'done' ? 'done' : ''}" data-action="open-task" data-id="${t.id}"><span class="mono" style="min-width:48px">${t.time}</span><div class="title"><span class="t">${esc(t.title)}</span></div>${playBtn(t)}</div>`).join('')}</div>` : ''}
        ${done.length ? `<div class="group-title">Erledigt heute <span class="mono">${done.length}</span>${eyeDone}</div>${st.hideDone ? '' : `<div class="list">${done.map(doneRow).join('')}</div>`}` : ''}
        ${inbox.length ? `<details class="pull" ${ui.pullOpen ? 'open' : ''}><summary class="group-title">Ohne Datum <span class="mono">${inbox.length}</span></summary>
          <div class="list">${inbox.map((t) => `<div class="row" data-action="open-task" data-id="${t.id}"><div class="title"><span class="t">${esc(t.title)}</span><div class="meta">${chips(t)}</div></div>
            <button class="btn small" data-action="pull-today" data-id="${t.id}">${icon('plus')} Heute</button></div>`).join('')}</div></details>` : ''}
      </div>
      <aside class="today-log">
        <div class="tsec-head"><span class="tsec-title">Kalender heute</span><a href="#calendar" class="muted" style="margin-left:auto;font-size:13px">Woche ›</a></div>
        <div class="cal-grid mini">
          <div class="cal-scroll" id="cal-scroll">${timeAxis()}${dayColumn(t0)}</div>
        </div>
      </aside>
    </div>`;
}

// ---------- Inbox ----------
export function viewInbox() {
  const open = M.openTasks();
  const unplanned = open.filter((t) => !t.date).sort(byPrio);
  const planned = open.filter((t) => t.date).sort((a, b) => a.date.localeCompare(b.date) || byPrio(a, b));
  const done = M.tasks().filter((t) => t.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 60);
  const tab = ui.inboxTab;
  const tabs = `<div class="tabs">
    <button class="${tab === 'open' ? 'on' : ''}" data-action="inbox-tab" data-tab="open">Offen<span class="n">${unplanned.length}</span></button>
    <button class="${tab === 'planned' ? 'on' : ''}" data-action="inbox-tab" data-tab="planned">Geplant<span class="n">${planned.length}</span></button>
    <button class="${tab === 'done' ? 'on' : ''}" data-action="inbox-tab" data-tab="done">Erledigt</button>
  </div>`;

  let body = '';
  if (tab === 'open') {
    body = unplanned.length
      ? `<div class="list">${unplanned.map((t) => taskRow(t)).join('')}</div>`
      : `<div class="list"><div class="empty">${M.tasks().length ? 'Inbox leer. Alles hat einen Tag bekommen.' : 'Noch keine Aufgaben. Tipp oben deine erste ein, oder <button class="btn small" data-action="seed-demo">Beispieldaten laden</button>'}</div></div>`;
  } else if (tab === 'planned') {
    const groups = {};
    const t0 = today();
    planned.forEach((t) => { const k = t.date < t0 ? 'overdue' : t.date; (groups[k] ||= []).push(t); });
    const keys = Object.keys(groups).sort((a, b) => (a === 'overdue' ? -1 : b === 'overdue' ? 1 : a.localeCompare(b)));
    body = keys.length
      ? keys.map((k) => `
        <div class="group-title" style="${k === 'overdue' ? 'color:var(--danger)' : ''}">${k === 'overdue' ? 'Überfällig' : `${dayLabel(k)} <span class="mono">${k === t0 || k === addDays(t0, 1) ? longDate(k) : ''}</span>`}</div>
        <div class="list">${groups[k].map((t) => taskRow(t, k === 'overdue')).join('')}</div>`).join('')
      : `<div class="list"><div class="empty">Noch nichts geplant. Zieh Tasks im Plan oder Kalender auf einen Tag.</div></div>`;
  } else {
    body = done.length ? `<div class="list">${done.map((t) => taskRow(t)).join('')}</div>` : `<div class="list"><div class="empty">Noch nichts erledigt. Los geht's 🐸</div></div>`;
  }

  return `
    ${head('Inbox', `${unplanned.length} offen · ${planned.length} geplant${M.aiNewCount() ? ` · <span style="color:var(--accent)">${M.aiNewCount()} von Claude fertig</span>` : ''}`)}
    ${capture('data-add="inbox" data-key="inbox-add"')}
    <div style="margin-bottom:14px">${tabs}</div>
    ${body}`;
}

// ---------- Plan (Kanban pro Tag) ----------
export function viewPlan() {
  const s = store.settings;
  const start = ui.planStart;
  const t0 = today();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const overdue = start <= t0 ? M.openTasks().filter((t) => t.date && t.date < t0) : [];

  const column = (d) => {
    const list = M.tasks().filter((t) => t.date === d);
    const open = M.planOrder(list.filter((t) => t.status !== 'done'), s.sortMode);
    // Wiederholungen: Vorschau an den Folgetagen (echte Aufgabe entsteht beim Erledigen bzw. Verschieben)
    const reps = d > t0 ? M.tasks().filter((t) => t.repeat && t.date !== d && M.repeatsOn(t, d)) : [];
    const done = list.filter((t) => t.status === 'done');
    const ws = s.workStart ?? 9, we = s.workEnd ?? 17;
    const L = M.dayLoad(d, ws, we);
    const lvl = L.pct > 1 ? 'over' : L.pct >= 0.8 ? 'full' : L.pct >= 0.4 ? 'mid' : 'low';
    const loadTip = `Geplant ${fmtMinutes(L.planned)} · Frei ${fmtMinutes(L.cap)} (Arbeitszeit ${String(ws).padStart(2, '0')}–${String(we).padStart(2, '0')} Uhr minus ${fmtMinutes(L.fixed)} Termine/Sperrzeiten darin)`;
    return `
      <div class="col ${d === t0 ? 'today' : ''}" data-drop-day="${d}">
        <div class="col-head"><span class="wd">${d === t0 ? 'Heute' : shortWeekday(d)}</span><span class="num">${dayNum(d)}</span><span class="sum" title="${loadTip}">${L.planned ? fmtMinutes(L.planned) : "0h"} / ${L.cap ? fmtMinutes(L.cap) : "0h"}</span></div>
        <div class="load ${lvl}" title="${loadTip}"><div style="width:${Math.min(100, Math.round((isFinite(L.pct) ? L.pct : 1) * 100))}%"></div></div>
        <input class="col-add" data-add="day" data-date="${d}" data-key="add-${d}" placeholder="+ Aufgabe" enterkeyhint="done">
        ${reps.map((t) => taskCard(t, false, { occ: d })).join('')}
        ${open.map((t) => taskCard(t, false, { planDate: d })).join('')}
        ${done.map((t) => taskCard(t)).join('')}
      </div>`;
  };

  const actions = `
    <div class="tabs">
      <button class="${s.sortMode === 'prio' ? 'on' : ''}" data-action="sort" data-mode="prio">🐸 Prio</button>
      <button class="${s.sortMode === 'time' ? 'on' : ''}" data-action="sort" data-mode="time">Zeit</button>
      <button class="${s.sortMode === 'manual' ? 'on' : ''}" data-action="sort" data-mode="manual" title="Eigene Reihenfolge: Karten per Ziehen sortieren">Eigene</button>
    </div>
    <button class="icon-btn" data-action="plan-nav" data-d="-7">${icon('left')}</button>
    <button class="btn small" data-action="plan-nav" data-d="0">Heute</button>
    <button class="icon-btn" data-action="plan-nav" data-d="7">${icon('right')}</button>`;

  return `
    ${head('Woche planen', rangeLabel(start), actions)}
    <div class="board">
      ${overdue.length ? `
        <div class="col overdue" data-drop-day="${t0}">
          <div class="col-head"><span class="wd" style="color:var(--danger)">Überfällig</span><span class="sum">${overdue.length}</span></div>
          ${overdue.sort(byPrio).map((t) => taskCard(t, true)).join('')}
        </div>` : ''}
      ${days.map(column).join('')}
    </div>`;
}

// ---------- Kalender ----------
function layoutLanes(items) {
  // Überlappende Einträge nebeneinander statt übereinander
  items.sort((a, b) => a.s - b.s || b.e - a.e);
  let cluster = [], clusterEnd = -1;
  const finish = () => {
    const lanes = [];
    cluster.forEach((it) => {
      let l = lanes.findIndex((end) => end <= it.s);
      if (l === -1) { l = lanes.length; lanes.push(0); }
      lanes[l] = it.e; it.lane = l;
    });
    cluster.forEach((it) => { it.lanes = lanes.length; });
  };
  items.forEach((it) => {
    if (it.s >= clusterEnd && cluster.length) { finish(); cluster = []; }
    cluster.push(it); clusterEnd = Math.max(clusterEnd, it.e);
  });
  if (cluster.length) finish();
  return items;
}

// Wochenstunden gegen dein Wochenziel (Einstellungen → Wochenziel)
function weekGoalBar(ws, compact = false) {
  const goal = Number(store.settings.weeklyGoal) || 20;
  const ms = M.trackedBetween(ws, addDays(ws, 7));
  const pct = Math.min(100, Math.round((ms / 3600000 / goal) * 100));
  const isNow = ws === weekStart(today());
  return `<div class="goalbar ${compact ? 'compact' : ''}">
    <div class="goal-txt"><b class="mono">${fmtHours(ms)}</b> <span class="muted">/ ${goal}h ${isNow ? 'diese Woche' : 'in dieser Woche'}</span>${!compact && !isNow ? ` <button class="btn small ghost" data-action="cal-nav" data-d="0">Diese Woche</button>` : ''}</div>
    <div class="progress"><div style="width:${pct}%;background:var(--accent)"></div></div>
  </div>`;
}

// Stundenleiste links neben Kalender-Spalten
export function timeAxis() {
  const s = store.settings;
  const hours = [];
  for (let h = s.dayStart; h < s.dayEnd; h++) hours.push(`<div class="${h >= 24 ? 'next' : ''}">${String(h % 24).padStart(2, '0')}:00</div>`);
  return `<div class="cal-times">${hours.join('')}</div>`;
}

// Eine Tages-Spalte mit Logbuch-Einträgen, Terminen und gesperrten Zeiten (Logbuch + Heute)
export function dayColumn(d) {
  const s = store.settings, t0 = today();
  const startMin = s.dayStart * 60, endMin = s.dayEnd * 60;
  const px = (min) => ((min - startMin) * HOUR) / 60;
  const items = M.segmentsOn(d, startMin, endMin);
  layoutLanes(items);
  const evs = items.map((it) => {
    const top = Math.max(0, px(it.s));
    const h = Math.max(22, px(it.e) - px(it.s) - 2);
    const w = 100 / it.lanes;
    const pos = `top:${top}px;height:${h}px;left:calc(${it.lane * w}% + 3px);right:auto;width:calc(${w}% - 6px)`;
    if (it.kind === 'block') {
      const tm = `<span class="tm">${it.cont ? '↳ ' : ''}${it.b.start}–${it.b.end}</span>`, name = `<span class="nm">${icon('lock')} ${esc(it.b.label || 'Gesperrt')}</span>`;
      // Kurze Einträge: Name zuerst in einer Zeile, damit er immer lesbar ist
      return `<div class="ev block ${h < 36 ? 'short' : ''}" style="${pos}" data-action="edit-block" data-id="${it.b.id}" title="${esc(it.b.label || 'Gesperrt')} ${it.b.start}–${it.b.end}">
        ${h < 36 ? `${name} ${tm}` : `${tm}${name}`}</div>`;
    }
    if (it.kind === 'entry') {
      const t = it.t, p = M.project(t?.projectId ?? it.en.projectId);
      const a = fromMin(((Math.round(it.s) % 1440) + 1440) % 1440), b = it.live ? 'jetzt' : fromMin(Math.round(it.e) % 1440);
      const tm = `<span class="tm">${it.cont ? '↳ ' : ''}${a}–${b}</span>`, nm = `<span class="nm">${esc(t?.title || 'Gelöschte Aufgabe')}</span>`;
      return `<div class="ev log ${it.live ? 'live' : ''} ${h < 36 ? 'short' : ''}" style="${pos};--pc:${p?.color || 'var(--accent)'}" data-action="edit-entry" data-id="${it.en.id}" title="${esc(t?.title || '')} ${a}–${b}">${h < 36 ? `${nm} ${tm}` : `${tm}${nm}`}${it.live || it.cont ? '' : `<div class="rs" data-resize="entry" data-id="${it.en.id}" title="Ziehen: länger/kürzer"></div>`}</div>`;
    }
    const t = it.t, p = M.project(t.projectId);
    return `<div class="ev appt ${t.status === 'done' ? 'done' : ''} ${it.rep ? 'rep' : ''} ${h < 36 ? 'short' : ''}" style="${pos};--pc:${p?.color || 'var(--accent)'}"
      data-action="open-task" data-id="${t.id}" draggable="true" data-drag="task" data-occ="${it.occ}" title="${esc(t.title)}${it.rep ? ' (Wiederholung)' : ''}">
      ${(() => { const tm = `<span class="tm">${it.cont ? '↳ ' : ''}${t.time}–${fromMin((toMin(t.time) + (t.duration || 30)) % (24 * 60))}${t.priority === 'frog' ? ' 🐸' : ''}</span>`, nm = `<span class="nm">${it.rep ? icon('repeat') + ' ' : ''}${esc(t.title)}</span>`;
        return h < 36 ? `${nm} ${tm}` : `${tm}${nm}`; })()}${it.cont ? '' : `<div class="rs" data-resize="appt" data-id="${t.id}" title="Ziehen: länger/kürzer"></div>`}</div>`;
  }).join('');
  const m = ui.modal?.type === 'slot' ? ui.modal : null;
  const sel = m && (m.colDate || m.date) === d ? { s: m.colMin ?? toMin(m.time), e: (m.colMin ?? toMin(m.time)) + m.dur } : ui.select?.date === d ? ui.select : null;
  const ghost = sel ? `<div class="ev ghost ${px(sel.e) - px(sel.s) < 36 ? 'short' : ''}" style="top:${px(sel.s)}px;height:${Math.max(18, px(Math.min(sel.e, endMin)) - px(sel.s) - 2)}px;left:3px;right:3px"><div class="tm">${fromMin(sel.s % (24 * 60))}–${fromMin(sel.e % (24 * 60))}</div>${esc(ui.modal?.title || '(Neu)')}</div>` : '';
  // Jetzt-Linie: heute, oder nach Mitternacht noch in der Spalte von gestern (wenn dein Tag bis in die Nacht geht)
  const nowAt = d === t0 ? nowMin() : d === addDays(t0, -1) ? nowMin() + 24 * 60 : -1;
  const nowLine = nowAt >= startMin && nowAt <= endMin ? `<div class="now-line" style="top:${px(nowAt)}px"></div>` : '';
  return `<div class="cal-day ${d === t0 ? 'today' : ''}" data-drop-cal="${d}" data-action="cal-slot" data-date="${d}" style="height:${(s.dayEnd - s.dayStart) * HOUR}px">${endMin > 24 * 60 ? `<div class="midnight" style="top:${px(24 * 60)}px"></div>` : ''}${evs}${ghost}${nowLine}</div>`;
}

export function viewCalendar() {
  const s = store.settings;
  const mobile = isMobile();
  const days = mobile ? [ui.calDay] : Array.from({ length: s.calWeekdays ? 5 : 7 }, (_, i) => addDays(ui.calStart, i));
  const t0 = today();

  const header = days.map((d) => {
    const a = new Date(d + 'T00:00').getTime(), b = a + 864e5;
    const worked = store.all('entries').reduce((sum, e) => sum + Math.max(0, Math.min(e.end || Date.now(), b) - Math.max(e.start, a)), 0);
    return `<div class="dh ${d === t0 ? 'today' : ''}"><b>${shortWeekday(d)}</b> <span class="n">${dayNum(d)}</span><span class="h" title="Gearbeitet">${worked >= 60000 ? fmtHours(worked) : '–'}</span></div>`;
  }).join('');

  const step = mobile ? 1 : 7;
  const actions = `
    <div class="tabs desktop-only" title="Wochenende ein-/ausblenden (W)">
      <button class="${s.calWeekdays ? 'on' : ''}" data-action="cal-weekdays" data-v="1">Mo–Fr</button>
      <button class="${s.calWeekdays ? '' : 'on'}" data-action="cal-weekdays" data-v="0">7 Tage</button>
    </div>
    <button class="icon-btn" data-action="cal-nav" data-d="-${step}">${icon('left')}</button>
    <button class="btn small" data-action="cal-nav" data-d="0">Heute</button>
    <button class="icon-btn" data-action="cal-nav" data-d="${step}">${icon('right')}</button>
    <button class="btn" data-action="new-block" title="Zeit sperren">${icon('lock')}<span class="lbl-long"> Zeit sperren</span></button>`;

  return `
    <div class="cal-wrap">
      <section class="cal-main">
        ${head('Kalender', mobile ? longDate(days[0]) : rangeLabel(days[0], days.length), actions)}
        ${weekGoalBar(weekStart(days[0]))}
        <div class="cal-grid">
          <div class="cal-header"><div class="gutter"></div>${header}</div>
          <div class="cal-scroll" id="cal-scroll">
            ${timeAxis()}
            ${days.map(dayColumn).join('')}
          </div>
        </div>
      </section>
    </div>`;
}

// ---------- Projekte ----------
const weekMsForProject = (pid, from) => M.entriesBetween(from, addDays(from, 7)).filter((e) => M.entryProject(e) === pid).reduce((a, e) => a + M.entryMs(e), 0);
const totalMsForProject = (pid) => store.all('entries').filter((e) => M.entryProject(e) === pid).reduce((a, e) => a + M.entryMs(e), 0);

// Mini-Verlauf: Stunden der letzten Wochen als Linie
function sparkline(vals, color) {
  const w = 120, h = 32, max = Math.max(...vals, 0.0001);
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * w).toFixed(1)},${(h - 3 - (v / max) * (h - 6)).toFixed(1)}`);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="0,${h} ${pts.join(' ')} ${w},${h}" fill="${color}" fill-opacity="0.12" stroke="none"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}

export function viewProjects() {
  const ws = weekStart(today());
  const all = store.all('projects').sort((a, b) => a.createdAt - b.createdAt);
  const active = all.filter((p) => !p.archived), closed = all.filter((p) => p.archived);
  const tab = ui.projTab === 'closed' ? 'closed' : 'active';
  const shown = tab === 'closed' ? closed : active;
  const totalAll = all.reduce((a, p) => a + totalMsForProject(p.id), 0);
  const cards = shown.map((p) => {
    const ts = M.tasks().filter((t) => t.projectId === p.id);
    const done = ts.filter((t) => t.status === 'done').length;
    const weeks = Array.from({ length: 8 }, (_, i) => weekMsForProject(p.id, addDays(ws, (i - 7) * 7)) / 3600000);
    return `
      <div class="pcard ${p.archived ? 'closed' : ''}" data-action="go" data-href="#project/${p.id}" style="--pc:${p.color}">
        <h3>${projIcon(p, 18)}<span class="pname">${esc(p.name)}</span>${p.archived ? '<span class="chip">✓ Abgeschlossen</span>' : ''}</h3>
        ${p.goal ? `<div class="pgoal">🎯 ${esc(p.goal)}</div>` : ''}
        <div class="row2">
          <div><div class="big">${fmtHours(weekMsForProject(p.id, ws))}</div><div class="lbl">diese Woche</div></div>
          ${sparkline(weeks, p.color)}
        </div>
        <div class="pfoot mono muted"><span>${fmtHours(totalMsForProject(p.id))} insgesamt</span><span>${ts.length - done} offen · ${done} erledigt</span></div>
      </div>`;
  }).join('');
  return `
    ${head('Projekte', 'Gib deiner Zeit eine Richtung.')}
    <div class="stats">
      <div class="stat"><div class="lbl">Projekt-Stunden insgesamt</div><div class="big">${fmtHours(totalAll)}</div></div>
      <div class="stat"><div class="lbl">In Arbeit</div><div class="big">${active.length}</div></div>
      <div class="stat"><div class="lbl">Abgeschlossen</div><div class="big">${closed.length}</div></div>
    </div>
    <div class="tab-row">
      <div class="tabs">
        <button class="${tab === 'active' ? 'on' : ''}" data-action="proj-tab" data-tab="active">Aktiv<span class="n">${active.length}</span></button>
        <button class="${tab === 'closed' ? 'on' : ''}" data-action="proj-tab" data-tab="closed">Abgeschlossen<span class="n">${closed.length}</span></button>
      </div>
      <button class="btn primary" data-action="new-project">${icon('plus')} <span class="lbl-long">Neues </span>Projekt</button>
    </div>
    <div class="grid">${cards}${tab === 'active' ? `<div class="pcard add" data-action="new-project">${icon('plus')} Projekt anlegen</div>` : (closed.length ? '' : '<div class="empty">Noch nichts abgeschlossen. Öffne ein Projekt und tipp auf „Abschließen“, wenn es fertig ist.</div>')}</div>`;
}

export function viewProject(id) {
  const p = store.get('projects', id);
  if (!p) return `${head('Projekt nicht gefunden')}<a href="#projects" class="btn">Zurück</a>`;
  const ts = M.tasks().filter((t) => t.projectId === id);
  const open = ts.filter((t) => t.status !== 'done').sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || byPrio(a, b));
  const done = ts.filter((t) => t.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const ws = weekStart(today());
  return `
    <a href="#projects" class="btn ghost small" style="margin:0 0 10px -8px">${icon('arrowLeft')} Projekte</a>
    <div class="head">
      <div style="display:flex;gap:12px;align-items:center;flex:1;min-width:240px">
        ${projIcon(p, 26)}
        <input class="title-in" style="font-size:28px;font-weight:700;border:0;background:transparent;padding:0" value="${esc(p.name)}" data-pfield="name" data-id="${p.id}">
      </div>
      <div class="actions">
        ${p.archived
          ? `<button class="btn small" data-action="unarchive-project" data-id="${p.id}">Wieder aktivieren</button>`
          : `<button class="btn small" data-action="archive-project" data-id="${p.id}">${icon('check')} Abschließen</button>`}
        <button class="btn small danger" data-action="delete-project" data-id="${p.id}">${icon('trash')} Löschen</button>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><div class="lbl">Stunden gesamt</div><div class="big">${fmtHours(totalMsForProject(id))}</div></div>
      <div class="stat"><div class="lbl">Diese Woche</div><div class="big">${fmtHours(weekMsForProject(id, ws))}</div></div>
      <div class="stat"><div class="lbl">Aufgaben</div><div class="big">${open.length} <small>offen · ${done.length} erledigt</small></div></div>
    </div>
    <div class="panels">
      <div>
        ${capture(`data-add="project" data-project="${id}" data-key="proj-add"`, 'Aufgabe für dieses Projekt…')}
        <div class="group-title">Offen <span class="mono">${open.length}</span></div>
        <div class="list">${open.map((t) => taskRow(t)).join('') || '<div class="empty">Keine offenen Aufgaben.</div>'}</div>
        ${done.length ? `<div class="group-title">Erledigt <span class="mono">${done.length}</span></div><div class="list">${done.slice(0, 30).map((t) => taskRow(t)).join('')}</div>` : ''}
      </div>
      <div class="panel" style="align-self:start">
        <h4>Ziel</h4>
        <input data-pfield="goal" data-id="${id}" value="${esc(p.goal || '')}" placeholder="Woran merkst du, dass das Projekt fertig ist?" style="margin-bottom:18px">
        <h4>Notizen</h4>
        <textarea data-pfield="notes" data-id="${id}" placeholder="Worum geht's? Links, Ideen…" style="min-height:160px;margin-bottom:18px">${esc(p.notes || '')}</textarea>
        <h4>Symbol</h4>
        <div class="icons-pick" style="margin-bottom:18px">${iconPick(p.icon, `data-action="project-icon" data-id="${id}"`)}</div>
        <h4>Farbe</h4>
        <div class="colors">${COLORS.map((c) => `<button class="${c === p.color ? 'on' : ''}" style="background:${c}" data-action="project-color" data-id="${id}" data-color="${c}"></button>`).join('')}</div>
      </div>
    </div>`;
}

// ---------- Rückblick (Timetracking) ----------
export function viewReview() {
  const ws = ui.reviewWeek;
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const entries = M.entriesBetween(ws, addDays(ws, 7));
  const perDay = days.map((d) => M.entriesBetween(d, addDays(d, 1)).reduce((a, e) => a + M.entryMs(e), 0));
  const total = perDay.reduce((a, b) => a + b, 0);
  const goalMs = store.settings.weeklyGoal * 3600000;
  const t0 = today();
  const daysPassed = Math.max(1, days.filter((d) => d <= t0).length);
  const doneCount = M.tasks().filter((t) => t.doneAt && t.doneAt >= new Date(ws + 'T00:00').getTime() && t.doneAt < new Date(addDays(ws, 7) + 'T00:00').getTime()).length;
  const max = Math.max(...perDay, 3600000);

  const byProj = {};
  entries.forEach((e) => { const k = M.entryProject(e) || 'none'; byProj[k] = (byProj[k] || 0) + M.entryMs(e); });
  const projRows = Object.entries(byProj).sort((a, b) => b[1] - a[1]);
  const projMax = Math.max(1, ...projRows.map((r) => r[1]));

  const weeks = Array.from({ length: 8 }, (_, i) => addDays(weekStart(t0), -7 * (7 - i)));
  const weekTotals = weeks.map((w) => M.entriesBetween(w, addDays(w, 7)).reduce((a, e) => a + M.entryMs(e), 0));
  const wMax = Math.max(...weekTotals, 3600000);

  const list = entries.sort((a, b) => b.start - a.start).map((e) => {
    const t = store.get('tasks', e.taskId);
    const st = new Date(e.start), en = e.end ? new Date(e.end) : null;
    const hm = (d) => d.toTimeString().slice(0, 5);
    return `<div class="row" style="cursor:default">
      <div class="title"><span class="t">${esc(t?.title || 'Gelöschte Aufgabe')}</span>
        <div class="meta">${chipProject(M.entryProject(e))}<span class="chip mono">${dayLabel(toDateStr(st))} · ${hm(st)}–${en ? hm(en) : 'läuft'}</span></div></div>
      <span class="mono">${fmtDur(M.entryMs(e))}</span>
      <button class="icon-btn" data-action="del-entry" data-id="${e.id}" aria-label="Eintrag löschen">${icon('x')}</button>
    </div>`;
  }).join('');

  const actions = `
    <button class="icon-btn" data-action="review-nav" data-d="-7">${icon('left')}</button>
    <button class="btn small" data-action="review-nav" data-d="0">Diese Woche</button>
    <button class="icon-btn" data-action="review-nav" data-d="7">${icon('right')}</button>`;

  return `
    ${head('Rückblick', `Woche ${rangeLabel(ws)}`, actions)}
    <div class="stats">
      <div class="stat"><div class="lbl">Fokus-Stunden</div><div class="big" style="color:var(--now)">${fmtHours(total)} <small>/ ${store.settings.weeklyGoal}h Ziel</small></div>
        <div class="progress"><div style="width:${Math.min(100, (total / goalMs) * 100)}%;background:var(--now)"></div></div></div>
      <div class="stat"><div class="lbl">Tagesdurchschnitt</div><div class="big">${fmtHours(total / daysPassed)}</div></div>
      <div class="stat"><div class="lbl">Erledigte Aufgaben</div><div class="big">${doneCount}</div></div>
    </div>
    <div class="panels">
      <div class="panel"><h4>Stunden pro Tag</h4>
        <div class="bars">${perDay.map((ms, i) => `<div class="b ${days[i] === t0 ? 'today' : ''}"><span class="v">${ms ? fmtHours(ms) : ''}</span><div class="fill" style="height:${(ms / max) * 100}%"></div><span class="d">${shortWeekday(days[i])}</span></div>`).join('')}</div>
      </div>
      <div class="panel"><h4>Stunden nach Projekt</h4>
        ${projRows.length ? projRows.map(([pid, ms]) => {
          const p = M.project(pid);
          return `<div class="hbar"><span class="name">${projIcon(p, 14)}${esc(p?.name || 'Ohne Projekt')}</span><div class="track"><div style="width:${(ms / projMax) * 100}%;background:${p?.color || 'var(--faint)'}"></div></div><span class="val">${fmtHours(ms)}</span></div>`;
        }).join('') : '<div class="empty">Noch keine Zeit erfasst. Starte den Timer (▶) an einer Aufgabe.</div>'}
      </div>
    </div>
    <div class="panel" style="margin-bottom:14px"><h4>Letzte 8 Wochen</h4>
      <div class="bars" style="height:120px">${weekTotals.map((ms, i) => `<div class="b ${weeks[i] === ws ? 'today' : ''}"><span class="v">${ms ? fmtHours(ms) : ''}</span><div class="fill" style="height:${(ms / wMax) * 100}%"></div><span class="d mono">${dayNum(weeks[i])}.</span></div>`).join('')}</div>
    </div>
    ${list ? `<div class="group-title">Einträge dieser Woche</div><div class="list">${list}</div>` : ''}`;
}

// ---------- Einstellungen ----------
export function viewSettings() {
  const s = store.settings, sy = store.sync;
  const statusText = { off: 'Nicht eingerichtet', connecting: 'Verbinde…', 'signed-out': 'Nicht angemeldet', online: 'Synchronisiert', offline: 'Offline (wird später synchronisiert)', error: 'Fehler' }[sy.status];
  let syncBody;
  if (!sy.configured) {
    syncBody = `<p class="muted">Sync ist noch aus. Die App speichert alles nur auf diesem Gerät. Zum Einrichten: Anleitung <span class="mono">FIREBASE.md</span> befolgen und deinen Config-Block in <span class="mono">js/config.js</span> eintragen.</p>`;
  } else if (!sy.user) {
    syncBody = `
      <p class="muted">Melde dich mit dem Konto an, das du in der Firebase Console angelegt hast.</p>
      <div class="field"><label>E-Mail</label><input type="email" id="login-email" autocomplete="username"></div>
      <div class="field"><label>Passwort</label><input type="password" id="login-pass" autocomplete="current-password"></div>
      <button class="btn primary" data-action="sign-in">Anmelden</button>`;
  } else {
    syncBody = `
      <p>Angemeldet als <b>${esc(sy.user.email)}</b></p>
      <div class="field"><label>Deine User-ID (für die Security Rules)</label>
        <div class="inline"><input readonly value="${esc(sy.user.uid)}" class="mono"><button class="btn small" style="flex:none" data-action="copy" data-text="${esc(sy.user.uid)}">Kopieren</button></div></div>
      <button class="btn" data-action="sign-out">Abmelden</button>`;
  }
  const hourOpts = (from, to, sel) => Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => `<option value="${h}" ${h === sel ? 'selected' : ''}>${String(h % 24).padStart(2, '0')}:00${h > 24 ? ' (nächster Tag)' : ''}</option>`).join('');
  return `
    ${head('Einstellungen')}
    <div class="settings">
      <div class="panel"><h4>Sync · <span style="text-transform:none;letter-spacing:0">${statusText}</span></h4>${syncBody}
        ${sy.error ? `<p style="color:var(--danger);font-size:13px">${esc(sy.error)}</p>` : ''}</div>
      <div class="panel"><h4>Darstellung</h4>
        <div class="seg">${[['system', 'Wie System'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([v, l]) => `<button class="${(s.theme || 'system') === v ? 'on' : ''}" data-action="theme" data-v="${v}">${l}</button>`).join('')}</div>
        <p class="muted" style="font-size:13px;margin:10px 0 0">„Wie System“ folgt der Einstellung deines Macs bzw. iPhones (Hell/Dunkel/Automatisch).</p>
        <div class="theme-pick">${[['glass', 'Glass'], ['classic', 'Klassisch']].map(([d, l]) => `<button class="t-${d} ${curDesign() === d ? 'on' : ''}" data-action="design" data-v="${d}"><i></i>${l}</button>`).join('')}</div>
        <p class="muted" style="font-size:13px;margin:10px 0 0">Design gilt für dieses Gerät.</p>
      </div>
      <div class="panel"><h4>Planung</h4>
        <div class="set-grid">
          <div class="set-lbl">Kalender zeigt</div>
          <select data-setting="dayStart" aria-label="Tag beginnt">${hourOpts(0, 12, s.dayStart)}</select><span class="muted">bis</span>
          <select data-setting="dayEnd" aria-label="Tag endet">${hourOpts(13, 30, s.dayEnd)}</select>
          <div class="set-lbl">Arbeitszeit <span class="muted">(Auslastung im Plan)</span></div>
          <select data-setting="workStart" aria-label="Arbeitszeit beginnt">${hourOpts(0, 23, s.workStart ?? 9)}</select><span class="muted">bis</span>
          <select data-setting="workEnd" aria-label="Arbeitszeit endet">${hourOpts(1, 24, s.workEnd ?? 17)}</select>
          <div class="set-lbl">Wochenziel</div>
          <div class="set-num"><input type="number" min="1" max="100" data-setting="weeklyGoal" value="${s.weeklyGoal}"><span class="muted">Stunden</span></div>
          <div class="set-lbl">Plan-Karten zeigen</div>
          <div class="set-pills">${(() => { const f = cardFields(); return CARD_FIELDS.map(([k, l]) => `<button class="pill ${f[k] ? 'on' : ''}" data-action="card-field" data-k="${k}">${f[k] ? icon('check') : ''}${l}</button>`).join(''); })()}</div>
        </div>
        <div class="field" style="margin:4px 0 0"><label>Am Wochenende einplanen (Auto-Plan + Claude)</label>
          <div class="seg"><button class="${s.planWeekends !== false ? 'on' : ''}" data-action="plan-weekends" data-v="1">Ja</button><button class="${s.planWeekends === false ? 'on' : ''}" data-action="plan-weekends" data-v="0">Nein, nur Mo–Fr</button></div></div>
      </div>
      <div class="panel"><h4>Backup</h4>
        <p class="muted" style="margin-top:0">Lädt alle Daten als JSON-Datei herunter. Am besten ab und zu in iCloud Drive speichern.</p>
        <div class="inline" style="max-width:420px">
          <button class="btn" data-action="export">${icon('download')} Exportieren</button>
          <label class="btn" style="justify-content:center">${icon('upload')} Importieren<input type="file" accept="application/json" data-import hidden></label>
        </div>
      </div>
      <div class="panel"><h4>Claude (Mac-Helfer)</h4>
        ${(() => { const h = M.helperInfo(); return M.helperOnline() ? `<p style="margin-top:0">🟢 Online auf <b>${esc(h.host || 'deinem Mac')}</b></p>` : `<p style="margin-top:0" class="muted">⚪️ Offline${h ? ` · zuletzt gesehen ${new Date(h.lastSeen).toLocaleString('de-DE')}` : ' · noch nie verbunden'}. Einrichtung: Ordner <span class="mono">helper/</span> im Repo, Anleitung in <span class="mono">helper/README.md</span>.</p>`; })()}
      </div>
      <div class="panel"><h4>Erinnerungen</h4>${remindersPanel()}</div>
      <div class="panel desktop-only"><h4>Mac-Menüleiste</h4>
        <p class="muted" style="margin-top:0;font-size:13px">Zeigt oben in der Menüleiste deines Macs den laufenden Timer bzw. die nächste Aufgabe. Klick darauf öffnet die Liste für heute. Braucht den Mac-Helfer und die kostenlose App SwiftBar (Anleitung in <span class="mono">helper/README.md</span>).</p>
        ${(() => { const mb = M.menubarSettings(); const seg = (k, on) => `<div class="seg"><button class="${on ? 'on' : ''}" data-action="menubar" data-k="${k}" data-v="1">An</button><button class="${on ? '' : 'on'}" data-action="menubar" data-k="${k}" data-v="0">Aus</button></div>`;
          return `<div class="field"><label>Laufenden Timer anzeigen</label>${seg('timer', mb.timer)}</div>
          <div class="field"><label>Nächste Aufgabe mit Uhrzeit anzeigen</label>${seg('next', mb.next)}</div>`; })()}
      </div>
      <div class="panel desktop-only"><h4>Tastenkürzel</h4>
        <p class="muted" style="margin-top:0;font-size:13px">Funktionieren, wenn du nicht gerade in einem Textfeld tippst. Zum Ändern auf die Taste klicken und die neue drücken (Entf = keine Taste).</p>
        ${keysList(true)}
        <button class="btn small" data-action="keys-reset" style="margin-top:10px">Standard wiederherstellen</button>
      </div>
      <div class="panel"><h4>Neu anfangen</h4>
        <p class="muted" style="margin-top:0;font-size:13px">Löscht alle Aufgaben mit ihren Zeiteinträgen, Anhängen und Claude-Aufträgen, auf allen Geräten. Projekte und Sperrzeiten bleiben. Vorher wird automatisch ein Backup heruntergeladen.</p>
        <button class="btn danger" data-action="wipe-tasks">${icon('trash')} Alle Aufgaben löschen</button>
      </div>
      <div class="panel"><h4>Ausprobieren</h4><p class="muted" style="margin-top:0">Legt ein paar Beispiel-Projekte, Aufgaben und Sperrzeiten an.</p><button class="btn" data-action="seed-demo">Beispieldaten laden</button></div>
      <p class="mono muted">Version 0.10.4</p>
    </div>`;
}

// ---------- Task-Details ----------
// Einstellungen → Erinnerungen
function remindersPanel() {
  const pp = M.pushPrefs(), devs = M.pushDevices(), mine = devs.find((d) => d.id === ui.pushId);
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const service = M.pushServiceOnline()
    ? '<p style="margin-top:0">🟢 Erinnerungs-Dienst läuft (auch wenn dein Mac aus ist).</p>'
    : '<p style="margin-top:0" class="muted">⚪️ Erinnerungs-Dienst noch nicht eingerichtet. Anleitung: <span class="mono">push/ANLEITUNG.md</span> im Repo.</p>';
  const device = !store.sync.user ? '<p class="muted">Erst unter Sync anmelden.</p>'
    : !supported ? `<p class="muted">${/iPhone|iPad/.test(navigator.userAgent) ? 'Auf dem iPhone gehen Erinnerungen nur, wenn du die App vom Home-Bildschirm aus öffnest (nicht in Safari).' : 'Dieser Browser kann keine Mitteilungen empfangen.'}</p>`
    : mine ? `<p>✓ Dieses Gerät bekommt Erinnerungen.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn small" data-action="push-test">Test schicken</button><button class="btn small ghost" data-action="push-off">Auf diesem Gerät ausschalten</button></div>`
    : `<button class="btn primary small" data-action="push-on" ${M.pushConfig() ? '' : 'disabled title="Erst den Erinnerungs-Dienst einrichten"'}>${icon('bell')} Auf diesem Gerät aktivieren</button>`;
  return `${service}
    <div class="field"><label>Erinnerungen</label><div class="seg"><button class="${pp.enabled ? 'on' : ''}" data-action="push-enabled" data-v="1">An</button><button class="${pp.enabled ? '' : 'on'}" data-action="push-enabled" data-v="0">Aus</button></div></div>
    <div class="field"><label>Standard für Aufgaben mit Uhrzeit</label><select id="push-lead"><option value="-1" ${pp.lead === -1 ? 'selected' : ''}>Keine (nur bei Aufgaben, wo du es einstellst)</option>${M.LEADS.map(([v, l]) => `<option value="${v}" ${v === pp.lead ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label>Dieses Gerät</label>${device}</div>
    ${devs.length ? `<p class="muted" style="font-size:12.5px;margin:0">Aktiv auf: ${devs.map((d) => esc(d.device || 'Gerät')).join(', ')}</p>` : ''}`;
}

export function sheetHTML(t) {
  const files = Object.values(store.state.files).filter((f) => f.taskId === t.id);
  const tracked = M.trackedFor(t.id);
  const isRunning = M.running()?.taskId === t.id;
  const durs = [15, 30, 45, 60, 90, 120, 180, 240];
  if (t.duration && !durs.includes(t.duration)) durs.push(t.duration);
  return `
    <div class="overlay" data-action="close-sheet"></div>
    <div class="sheet" role="dialog">
      <div class="sheet-head">
        ${checkBtn(t)}
        <span class="mono muted" style="flex:1">${t.status === 'done' ? 'Erledigt' : 'Aufgabe'}</span>
        <button class="icon-btn" data-action="close-sheet" aria-label="Schließen">${icon('x')}</button>
      </div>
      <div class="sheet-body">
        <input class="title-in" data-field="title" value="${esc(t.title)}" placeholder="Titel">
        ${aiResultCard(t)}

        <div class="field" style="margin-top:14px"><label>Status</label>
          <div class="seg">${STATUS.map((x) => `<button class="${t.status === x.id ? 'on' : ''}" data-action="set" data-k="status" data-v="${x.id}">${x.label}</button>`).join('')}</div></div>

        <div class="field"><label>Priorität · Eat the Frog first</label>
          <div class="seg">${PRIOS.map((x) => `<button class="${t.priority === x.id ? 'on' : ''}" data-action="set" data-k="priority" data-v="${x.id}">${x.icon ? x.icon + ' ' : ''}${x.label}</button>`).join('')}
            <button class="${!t.priority ? 'on' : ''}" data-action="set" data-k="priority" data-v="">–</button></div></div>

        <div class="field"><label>Projekt</label>
          <select data-field="projectId"><option value="">Kein Projekt</option>${M.projects().map((p) => `<option value="${p.id}" ${p.id === t.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}<option value="__new">+ Neues Projekt…</option></select></div>

        <div class="inline">
          <div class="field"><label>Datum</label><input type="date" data-field="date" value="${t.date || ''}"></div>
          <div class="field"><label>Uhrzeit</label><input type="time" step="900" data-field="time" value="${t.time || ''}"></div>
        </div>
        <div class="inline">
          <div class="field"><label>Geschätzte Dauer</label><select data-field="duration">${durs.sort((a, b) => a - b).map((d) => `<option value="${d}" ${d === t.duration ? 'selected' : ''}>${fmtMinutes(d)}</option>`).join('')}</select></div>
          <div class="field"><label>Wiederholen</label><select data-field="repeat">${REPEATS.map((r) => `<option value="${r.id}" ${r.id === (M.repeatDays(t.repeat) ? 'days' : t.repeat || '') ? 'selected' : ''}>${r.label}</option>`).join('')}</select></div>
        </div>
        ${M.repeatDays(t.repeat) ? `<div class="field"><label>An diesen Tagen</label>${wdPick(M.repeatDays(t.repeat), 'task-repeat-day')}</div>` : ''}
        ${t.time ? (() => { const pp = M.pushPrefs(), r = t.remind ?? ''; return `<div class="field"><label>Erinnerung</label><select data-field="remind">
          <option value="" ${r === '' ? 'selected' : ''}>Standard (${pp.enabled && pp.lead >= 0 ? M.LEADS.find((l) => l[0] === pp.lead)?.[1] || pp.lead + ' Min vorher' : 'keine'})</option>
          <option value="-1" ${r === -1 ? 'selected' : ''}>Keine</option>
          ${M.LEADS.map(([v, l]) => `<option value="${v}" ${r === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`; })() : ''}
        ${t.date || t.time ? `<button class="btn small ghost" data-action="unschedule" style="margin:-4px 0 12px -8px">Datum entfernen</button>` : ''}

        <div class="field"><label>Notizen</label><textarea data-field="notes" placeholder="Details, Links, Gedanken…">${esc(t.notes || '')}</textarea></div>

        <div class="field"><label>Anhänge (Fotos werden verkleinert, Dateien bis 700 KB)</label>
          <div class="files">
            ${files.map((f) => `<div class="file" data-action="open-file" data-id="${f.id}" style="${f.type.startsWith('image/') ? `background-image:url('${f.data}')` : ''}">${f.type.startsWith('image/') ? '' : esc(f.name)}<span class="x" data-action="del-file" data-id="${f.id}">×</span></div>`).join('')}
            <label class="file add">${icon('plus')}<input type="file" data-attach hidden accept="image/*,application/pdf,.txt,.md,.csv"></label>
          </div></div>

        <div class="field"><label>Zeiterfassung</label>
          <div class="box inline" style="gap:10px">
            <span style="flex:1"><span class="mono" ${isRunning ? 'data-tick="task"' : ''}>${fmtDur(tracked)}</span> <span class="muted">erfasst</span></span>
            <button class="btn small ${isRunning ? '' : 'primary'}" style="flex:none" data-action="timer" data-id="${t.id}">${icon(isRunning ? 'stop' : 'play')} ${isRunning ? 'Stopp' : 'Start'}</button>
            <button class="btn small" style="flex:none" data-action="focus" data-id="${t.id}">Fokus</button>
          </div></div>

        <div class="field"><label>Claude</label>${claudeBox(t)}</div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:24px">
          <span class="mono muted">Erstellt ${new Date(t.createdAt).toLocaleDateString('de-DE')}</span>
          <button class="btn small danger" data-action="delete-task" data-id="${t.id}">${icon('trash')} Löschen</button>
        </div>
      </div>
    </div>`;
}

function jobStatusText(job) {
  if (!job) return '';
  const online = M.helperOnline();
  return {
    queued: online ? '⏳ Wartet auf den Mac-Helfer…' : '⏳ Wartet. Der Mac-Helfer ist gerade offline, der Auftrag startet, sobald er läuft.',
    running: '✨ Claude arbeitet gerade daran…',
    done: '✓ Fertig. Ergebnis steht oben.',
    error: `⚠️ Fehler: ${esc(job.error || 'unbekannt')}`,
  }[job.status] || '';
}

// Letztes Claude-Ergebnis als übersichtliche Karte direkt unter dem Titel
function aiResultCard(t) {
  const jobs = M.jobsFor(t.id);
  const job = jobs[0];
  if (!job) return '';
  if (job.status === 'queued' || job.status === 'running') {
    return `<div class="ai-result" style="margin:10px 0 4px"><div class="ai-head">${icon('sparkle')}<span>${jobStatusText(job)}</span></div></div>`;
  }
  const last = jobs.find((j) => j.status === 'done' && j.result);
  if (!last || t.aiHidden === last.id) return job.status === 'error' ? `<div class="ai-result" style="margin:10px 0 4px"><div class="ai-head">${jobStatusText(job)}</div></div>` : '';
  const { body, sources } = splitSources(last.result);
  const long = body.length > 600 || body.split('\n').length > 12;
  const open = ui.aiOpen === last.id;
  const when = new Date(last.finishedAt || last.updatedAt || last.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  return `<div class="ai-result" style="margin:10px 0 4px">
    <div class="ai-head">${icon('sparkle')}<span>Claude · ${when}</span><span class="sp"></span>
      <button class="icon-btn" style="width:26px;height:26px" data-action="ai-hide" data-id="${last.id}" title="Ausblenden">${icon('x')}</button></div>
    <div class="ai-body ${long && !open ? 'clamp' : ''}">${md(body)}</div>
    ${long ? `<button class="btn small ghost" style="margin:4px 0 0 -8px" data-action="ai-more" data-id="${last.id}">${open ? 'Weniger anzeigen' : 'Alles anzeigen'}</button>` : ''}
    ${sources.length ? `<details><summary>Quellen (${sources.length})</summary><ul>${sources.map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a></li>`).join('')}</ul></details>` : ''}
    ${M.canUseHelper() ? `<div class="ai-reply"><input id="ai-reply" data-key="ai-reply" placeholder="Antwort oder Rückfrage an Claude…" enterkeyhint="send"><button class="btn small primary" style="flex:none" data-action="ai-reply" data-id="${t.id}" data-job="${last.id}">${icon('send')}</button></div>` : ''}
    <div class="ai-actions"><button class="btn small" data-action="ai-to-notes" data-id="${t.id}" data-job="${last.id}">In Notizen übernehmen</button></div>
  </div>`;
}

function claudeBox(t) {
  const job = M.jobsFor(t.id)[0];
  if (!M.canUseHelper()) {
    return `<div class="box">
      <p style="margin:0 0 10px;font-size:14px" class="muted">Kopiert einen fertigen Auftrag und öffnet Claude. Automatisch geht es, wenn Sync und der Mac-Helfer laufen.</p>
      <button class="btn small" data-action="ai-task" data-id="${t.id}">${icon('sparkle')} An Claude übergeben</button></div>`;
  }
  const busy = job && (job.status === 'queued' || job.status === 'running');
  return `<div class="box">
    <p style="margin:0 0 10px;font-size:14px" class="muted">${job ? jobStatusText(job) : 'Claude recherchiert oder erledigt die Aufgabe auf deinem Mac (über dein Abo). Das Ergebnis erscheint kurz und knapp oben in der Aufgabe.'}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn small primary" data-action="ai-job" data-id="${t.id}" ${busy ? 'disabled style="opacity:.5"' : ''}>${icon('sparkle')} ${job ? 'Nochmal an Claude senden' : 'An Claude senden'}</button>
      <button class="btn small ghost" data-action="ai-task" data-id="${t.id}">Manuell kopieren</button>
    </div></div>`;
}

const iconPick = (cur, attrs) => PROJECT_ICONS.map((n) => `<button class="${n === cur ? 'on' : ''}" ${attrs} data-icon="${n}" title="${n}">${icon(n)}</button>`).join('');

export function keysList(editable) {
  const s = store.settings;
  return `<div class="keys">${SHORTCUTS.map((k) => {
    const cur = keyOf(s, k.id);
    const rec = ui.recordKey === k.id;
    return `<div class="k"><span>${k.label}</span>${editable
      ? `<button class="${rec ? 'rec' : ''}" data-action="key-record" data-id="${k.id}"><kbd>${rec ? 'Taste drücken…' : keyLabel(cur)}</kbd></button>`
      : `<kbd>${keyLabel(cur)}</kbd>`}</div>`;
  }).join('')}</div>`;
}

// ---------- Fokus-Modus ----------
export function focusHTML(t) {
  const r = M.running();
  const on = r?.taskId === t.id;
  return `
    <div class="focus">
      <button class="icon-btn back" data-action="close-focus">${icon('arrowLeft')}</button>
      ${chipProject(t.projectId) || '<span class="chip">Fokus</span>'}
      <h2>${esc(t.title)}</h2>
      <div class="clock" data-tick="${on ? 'focus' : ''}">${fmtClock(on ? Date.now() - r.start : 0)}</div>
      <div class="state">${on ? 'Läuft' : 'Pausiert'} · ${fmtDur(M.trackedFor(t.id))} gesamt</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
        <button class="btn primary" data-action="timer" data-id="${t.id}">${icon(on ? 'pause' : 'play')} ${on ? 'Pausieren' : 'Fortsetzen'}</button>
        <button class="btn" data-action="focus-done" data-id="${t.id}">${icon('check')} Abschließen</button>
      </div>
    </div>`;
}

export function timerPill() {
  const r = M.running();
  if (!r || ui.focusTask) return '';
  const t = store.get('tasks', r.taskId);
  return `<div class="timer-pill" data-action="focus" data-id="${r.taskId}">
    <span class="pulse"></span><span class="tn">${esc(t?.title || 'Timer')}</span>
    <span class="clock" data-tick="pill">${fmtClock(Date.now() - r.start)}</span>
    <button class="stop" data-action="stop-timer" aria-label="Stopp">${icon('stop')}</button></div>`;
}

// ---------- Dialoge ----------
export function modalHTML(m) {
  let inner = '';
  if (m.type === 'claude-plan') {
    inner = `
      <h2>${icon('sparkle')} Mit Claude planen</h2>
      <p>Claude plant deine offenen Aufgaben in die freien Slots der nächsten 7 Tage. Läuft über dein normales Claude-Abo, ohne API-Kosten.</p>
      ${M.canUseHelper() ? `<div class="box" style="margin-bottom:16px"><b>Automatisch über deinen Mac</b>
        <p style="margin:6px 0 10px">${M.helperOnline() ? '🟢 Mac-Helfer ist online.' : '⚪️ Mac-Helfer ist offline. Der Auftrag startet, sobald er läuft.'} Der Plan wird automatisch übernommen, du kannst ihn rückgängig machen.</p>
        <button class="btn primary small" data-action="plan-job">${icon('sparkle')} Claude planen lassen</button></div>
        <p style="margin-bottom:10px"><b>Oder manuell:</b></p>` : ''}
      <div class="step"><span class="n">1</span><div><b>Auftrag kopieren</b> und Claude öffnen. Dort einfügen und senden.<br>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn primary small" data-action="copy-plan-prompt">Kopieren &amp; Claude öffnen</button><button class="btn small" data-action="copy-plan-prompt" data-noopen="1">Nur kopieren</button></div></div></div>
      <div class="step"><span class="n">2</span><div style="flex:1"><b>Claudes Antwort</b> komplett kopieren und hier einfügen:
        <textarea id="claude-answer" placeholder='[{"id": "...", "date": "2026-11-14", "time": "09:00", "duration": 60}]' style="margin-top:8px;min-height:120px" class="mono"></textarea></div></div>
      <div class="foot"><button class="btn" data-action="close-modal">Abbrechen</button><button class="btn primary" data-action="apply-claude-plan">Plan übernehmen</button></div>`;
  } else if (m.type === 'block') {
    const b = m.block;
    inner = `
      <h2>${icon('lock')} Zeit sperren</h2>
      <p>Gesperrte Zeiten werden beim Planen freigehalten (z. B. Gym, Essen, Schlafen). Liegt „Bis“ vor „Von“, geht die Sperrzeit über Mitternacht.</p>
      <div class="field"><label>Bezeichnung</label><input id="b-label" value="${esc(b.label || '')}" placeholder="z. B. Gym"></div>
      <div class="inline">
        <div class="field"><label>Datum</label><input type="date" id="b-date" value="${b.date}"></div>
        <div class="field"><label>Von</label><input type="time" step="900" id="b-start" value="${b.start}"></div>
        <div class="field"><label>Bis</label><input type="time" step="900" id="b-end" value="${b.end}"></div>
      </div>
      <div class="field"><label>Wiederholen</label><select id="b-repeat">
        ${[['', 'Nur einmal'], ['daily', 'Täglich'], ['weekdays', 'Werktags (Mo–Fr)'], ['weekly', 'Jede Woche an diesem Wochentag'], ['days', 'Bestimmte Tage…']].map(([v, l]) => `<option value="${v}" ${v === (M.repeatDays(b.repeat) ? 'days' : b.repeat || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field" id="b-days" ${M.repeatDays(b.repeat) ? '' : 'hidden'}><label>An diesen Tagen</label>${wdPick(M.repeatDays(b.repeat) || [weekday(b.date)], 'block-repeat-day')}</div>
      <div class="foot">
        ${b.id ? `<button class="btn danger" data-action="delete-block" data-id="${b.id}" style="margin-right:auto">${icon('trash')} Löschen</button>` : ''}
        <button class="btn" data-action="close-modal">Abbrechen</button><button class="btn primary" data-action="save-block">Speichern</button></div>`;
  } else if (m.type === 'slot') {
    inner = `
      <h2>${dayLabel(m.date)}, ${m.time}–${fromMin((toMin(m.time) + m.dur) % (24 * 60))}${toMin(m.time) + m.dur > 24 * 60 ? ' <span class="muted" style="font-size:14px">(nächster Tag)</span>' : ''}</h2>
      <p>${(new Date(m.date + 'T00:00').getTime() + (toMin(m.time) + m.dur) * 60000 <= Date.now()) ? 'Was hast du hier gemacht? Wird als erledigt mit dieser Zeit eingetragen.' : 'Ein fester Termin (z. B. Arzt, Call, Trading-Session).'}</p>
      <div class="field"><input id="slot-title" data-key="slot-title" placeholder="${(new Date(m.date + 'T00:00').getTime() + (toMin(m.time) + m.dur) * 60000 <= Date.now()) ? 'Was hast du gemacht?' : 'Titel des Termins'}" value="${esc(m.title || '')}" autofocus></div>
      <div class="field"><label>Dauer</label><select id="slot-dur">${[...new Set([15, 30, 45, 60, 90, 120, 180, m.dur])].sort((a, b) => a - b).map((d) => `<option value="${d}" ${d === m.dur ? 'selected' : ''}>${fmtMinutes(d)}</option>`).join('')}</select></div>
      <div class="field"><label>Projekt</label><select id="slot-proj"><option value="">Kein Projekt</option>${M.projects().map((p) => `<option value="${p.id}" ${p.id === m.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="foot one-row"><button class="btn" data-action="close-modal">Abbrechen</button>
        <button class="btn" data-action="slot-block" title="Zeit sperren">${icon('lock')} Sperren</button>
        ${(new Date(m.date + 'T00:00').getTime() + (toMin(m.time) + m.dur) * 60000 <= Date.now()) ? `<button class="btn primary" data-action="slot-log">${icon('check')} Nachtragen</button>` : `<button class="btn primary" data-action="slot-task">${icon('plus')} Anlegen</button>`}</div>`;
  } else if (m.type === 'entry') {
    const en = store.get('entries', m.id), t = en && store.get('tasks', en.taskId);
    const hm = (ts) => new Date(ts).toTimeString().slice(0, 5);
    inner = en ? `
      <h2>${esc(t?.title || 'Eintrag')}</h2>
      <p>${dayLabel(toDateStr(new Date(en.start)))} · ${fmtDur((en.end || Date.now()) - en.start)} erfasst</p>
      <div class="inline">
        <div class="field"><label>Von</label><input type="time" id="en-start" value="${hm(en.start)}"></div>
        <div class="field"><label>Bis</label><input type="time" id="en-end" value="${en.end ? hm(en.end) : ''}" ${en.end ? '' : 'disabled placeholder="läuft"'}></div>
      </div>
      <div class="foot"><button class="btn danger" data-action="entry-del">${icon('trash')} Löschen</button>
        ${t ? `<button class="btn" data-action="close-modal-open" data-id="${t.id}">Aufgabe öffnen</button>` : ''}
        <button class="btn primary" data-action="entry-save">Speichern</button></div>` : '<p>Eintrag nicht gefunden.</p>';
  } else if (m.type === 'repeat-move') {
    const t = store.get('tasks', m.id);
    inner = `
      <h2>${icon('repeat')} Wiederkehrende Aufgabe verschieben</h2>
      <p><b>${esc(t?.title || '')}</b> wiederholt sich. Was möchtest du verschieben?</p>
      <div class="foot"><button class="btn" data-action="close-modal">Abbrechen</button>
        <button class="btn" data-action="repeat-move" data-mode="all">Alle Termine</button>
        <button class="btn primary" data-action="repeat-move" data-mode="one" autofocus>Nur diesen Termin</button></div>`;
  } else if (m.type === 'project') {
    inner = `
      <h2>Neues Projekt</h2>
      <div class="field"><label>Name</label><input id="p-name" placeholder="z. B. 1000 € mit KI verdienen" autofocus></div>
      <div class="field"><label>Ziel</label><input id="p-goal" placeholder="Woran merkst du, dass das Projekt fertig ist?"></div>
      <div class="field"><label>Notizen</label><textarea id="p-notes" placeholder="Worum geht's? Links, Ideen…" style="min-height:80px"></textarea></div>
      <div class="field"><label>Symbol</label><div class="icons-pick">${iconPick(m.icon, 'data-action="pick-icon"')}</div></div>
      <div class="field"><label>Farbe</label><div class="colors">${COLORS.map((c, i) => `<button class="${i === m.colorIdx ? 'on' : ''}" style="background:${c}" data-action="pick-color" data-i="${i}"></button>`).join('')}</div></div>
      <div class="foot"><button class="btn" data-action="close-modal">Abbrechen</button><button class="btn primary" data-action="save-project">Anlegen</button></div>`;
  } else if (m.type === 'quick') {
    inner = `
      <h2>Neue Aufgabe</h2>
      <p>Enter trägt sie für heute ein. Esc bricht ab.</p>
      <div class="field"><input id="quick-title" placeholder="Was steht an?" autofocus autocomplete="off"></div>
      <div class="field"><label>Projekt</label><select id="quick-proj"><option value="">Kein Projekt</option>${M.projects().map((p) => `<option value="${p.id}" ${p.id === m.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Dauer</label><div class="seg" id="quick-dur">${[[30, '30 Min'], [60, '1h'], [90, '1,5h']].map(([v, l]) => `<button class="${v === (m.dur || 60) ? 'on' : ''}" data-action="quick-dur" data-v="${v}">${l}</button>`).join('')}</div></div>
      <div class="foot"><button class="btn" data-action="close-modal">Abbrechen</button><button class="btn primary" data-action="quick-save">Anlegen</button></div>`;
  } else if (m.type === 'keys') {
    inner = `
      <h2>${icon('keyboard')} Tastenkürzel</h2>
      <p>Ändern kannst du sie unter Einstellungen.</p>
      ${keysList(false)}
      <div class="foot"><a class="btn" href="#settings" data-action="close-modal-go">Ändern</a><button class="btn primary" data-action="close-modal">Fertig</button></div>`;
  }
  return `<div class="overlay modal-overlay" data-action="close-modal"></div><div class="modal" role="dialog">${inner}</div>`;
}
