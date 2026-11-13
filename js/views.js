// Alle Ansichten. Jede Funktion gibt HTML als Text zurück, app.js setzt es in die Seite ein.
import * as store from './store.js';
import * as M from './model.js';
import { ui, isMobile } from './ui.js';
import { icon } from './icons.js';
import {
  esc, toDateStr, today, addDays, weekStart, dayLabel, longDate, shortWeekday, dayNum, rangeLabel, toMin, fromMin, nowMin,
  fmtDur, fmtHours, fmtClock, fmtMinutes, PRIOS, prioLabel, STATUS, REPEATS, COLORS, byPrio,
} from './util.js';

const HOUR = 56; // Pixel pro Stunde im Kalender (gleich wie --hour in CSS)

// ---------- Bausteine ----------
const gear = `<a href="#settings" class="icon-btn mobile-only" aria-label="Einstellungen">${icon('gear')}</a>`;
const head = (title, sub = '', actions = '') => `
  <div class="head">
    <div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
    <div class="actions">${actions}${gear}</div>
  </div>`;

const chipPrio = (p) => (p ? `<span class="chip p-${p}">${p === 'frog' ? '🐸 ' : ''}${prioLabel(p)}</span>` : '');
const chipProject = (pid) => {
  const p = M.project(pid);
  return p ? `<span class="chip"><span class="dot" style="background:${p.color}"></span>${esc(p.name)}</span>` : '';
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
  t.ai ? `<span class="chip ai">${icon('sparkle')} Claude</span>` : '',
  t.status === 'doing' ? '<span class="chip">In Arbeit</span>' : '',
  t.status === 'waiting' ? '<span class="chip">Wartet</span>' : '',
  Object.values(store.state.files).some((f) => f.taskId === t.id) ? `<span class="chip">${icon('clip')}</span>` : '',
].join('');

const checkBtn = (t) => `<button class="check ${t.status === 'done' ? 'on' : ''}" data-action="toggle" data-id="${t.id}" aria-label="Erledigt">${icon('check')}</button>`;
const playBtn = (t) => {
  const on = M.running()?.taskId === t.id;
  return t.status === 'done' ? '' : `<button class="icon-btn play ${on ? 'on' : ''}" data-action="timer" data-id="${t.id}" aria-label="Timer">${icon(on ? 'stop' : 'play')}</button>`;
};

export const taskRow = (t, showDate = true) => `
  <div class="row ${t.status === 'done' ? 'done' : ''}" data-action="open-task" data-id="${t.id}" draggable="true" data-drag="task">
    ${checkBtn(t)}
    <div class="title"><span class="t">${esc(t.title)}</span><div class="meta">${chips(t, showDate)}</div></div>
    ${playBtn(t)}
  </div>`;

export const taskCard = (t, showDate = false) => {
  const p = M.project(t.projectId);
  return `
  <div class="card ${t.status === 'done' ? 'done' : ''}" data-action="open-task" data-id="${t.id}" draggable="true" data-drag="task">
    ${p ? `<div class="bar" style="background:${p.color}"></div>` : ''}
    <div class="ttl">${checkBtn(t)}<span>${esc(t.title)}</span>${playBtn(t)}</div>
    <div class="meta">${chips(t, showDate)}</div>
  </div>`;
};

const capture = (attrs, placeholder = 'Neue Aufgabe… einfach tippen und Enter') => `
  <div class="capture">
    <input ${attrs} placeholder="${placeholder}" autocomplete="off" enterkeyhint="done">
    <span class="hint">↵ Enter</span>
  </div>`;

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
    ${head('Inbox', `${unplanned.length} offen · ${planned.length} geplant`)}
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
    const open = M.sortTasks(list.filter((t) => t.status !== 'done'), s.sortMode);
    const done = list.filter((t) => t.status === 'done');
    const sum = open.reduce((a, t) => a + (t.duration || 0), 0);
    return `
      <div class="col ${d === t0 ? 'today' : ''}" data-drop-day="${d}">
        <div class="col-head"><span class="wd">${d === t0 ? 'Heute' : shortWeekday(d)}</span><span class="num">${dayNum(d)}</span><span class="sum">${sum ? fmtMinutes(sum) : ''}</span></div>
        <input class="col-add" data-add="day" data-date="${d}" data-key="add-${d}" placeholder="+ Aufgabe" enterkeyhint="done">
        ${open.map((t) => taskCard(t)).join('')}
        ${done.map((t) => taskCard(t)).join('')}
      </div>`;
  };

  const actions = `
    <div class="tabs">
      <button class="${s.sortMode === 'prio' ? 'on' : ''}" data-action="sort" data-mode="prio">🐸 Prio</button>
      <button class="${s.sortMode === 'time' ? 'on' : ''}" data-action="sort" data-mode="time">Zeit</button>
    </div>
    <button class="icon-btn" data-action="plan-nav" data-d="-7">${icon('left')}</button>
    <button class="btn small" data-action="plan-nav" data-d="0">Heute</button>
    <button class="icon-btn" data-action="plan-nav" data-d="7">${icon('right')}</button>
    <button class="btn" data-action="auto-plan">${icon('wand')} Auto-Plan</button>`;

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

export function viewCalendar() {
  const s = store.settings;
  const mobile = isMobile();
  const days = mobile ? [ui.calDay] : Array.from({ length: 7 }, (_, i) => addDays(ui.calStart, i));
  const t0 = today();
  const startMin = s.dayStart * 60, endMin = s.dayEnd * 60;
  const px = (min) => ((min - startMin) * HOUR) / 60;

  // Seitenleiste: offene Aufgaben ohne Termin
  const open = M.openTasks();
  const noDate = open.filter((t) => !t.date).sort(byPrio);
  const noTime = open.filter((t) => t.date && !t.time && t.date >= days[0] && t.date <= days[days.length - 1]).sort((a, b) => a.date.localeCompare(b.date) || byPrio(a, b));
  const side = `
    <aside class="cal-side ${(mobile ? ui.sideOpen : s.sidebar) ? '' : 'collapsed'}" data-drop-inbox="1">
      <div class="side-head"><span>Offen <span class="mono muted">${noDate.length + noTime.length}</span></span>
        <button class="icon-btn" data-action="toggle-side">${icon(mobile ? 'x' : 'sidebar')}</button></div>
      <div class="side-list">
        <input class="col-add" data-add="inbox" data-key="side-add" placeholder="+ Aufgabe in die Inbox" enterkeyhint="done">
        ${noDate.length ? '<div class="lbl-sm" style="margin:6px 2px 8px">Ohne Datum</div>' : ''}
        ${noDate.map((t) => taskCard(t)).join('')}
        ${noTime.length ? '<div class="lbl-sm" style="margin:14px 2px 8px">Datum, aber ohne Uhrzeit</div>' : ''}
        ${noTime.map((t) => taskCard(t, true)).join('')}
        ${!noDate.length && !noTime.length ? '<div class="empty">Alles eingeplant 🎉</div>' : ''}
        <p class="muted" style="font-size:12.5px;margin:14px 4px">${mobile ? 'Tipp: Task antippen und Datum + Uhrzeit setzen.' : 'Ziehe Aufgaben in den Kalender. Zurückziehen hierher entfernt den Termin.'}</p>
      </div>
    </aside>`;

  const hours = [];
  for (let h = s.dayStart; h < s.dayEnd; h++) hours.push(`<div>${String(h).padStart(2, '0')}:00</div>`);

  const dayCol = (d) => {
    const items = [
      ...M.tasks().filter((t) => t.date === d && t.time).map((t) => ({ kind: 'task', t, s: toMin(t.time), e: toMin(t.time) + (t.duration || 30) })),
      ...M.blocksOn(d).map((b) => ({ kind: 'block', b, s: toMin(b.start), e: toMin(b.end) })),
    ];
    layoutLanes(items);
    const evs = items.map((it) => {
      const top = Math.max(0, px(it.s));
      const h = Math.max(22, px(it.e) - px(it.s) - 2);
      const w = 100 / it.lanes;
      const pos = `top:${top}px;height:${h}px;left:calc(${it.lane * w}% + 3px);right:auto;width:calc(${w}% - 6px)`;
      if (it.kind === 'block') {
        return `<div class="ev block" style="${pos}" data-action="edit-block" data-id="${it.b.id}">
          <div class="tm">${it.b.start}–${it.b.end}</div>${icon('lock')} ${esc(it.b.label || 'Gesperrt')}</div>`;
      }
      const t = it.t, p = M.project(t.projectId);
      return `<div class="ev ${t.status === 'done' ? 'done' : ''} ${h < 36 ? 'short' : ''}" style="${pos};border-left-color:${p?.color || 'var(--accent)'}"
        data-action="open-task" data-id="${t.id}" draggable="true" data-drag="task">
        <div class="tm">${t.time}–${fromMin(it.e)}${t.priority === 'frog' ? ' 🐸' : ''}</div>${esc(t.title)}</div>`;
    }).join('');
    const nowLine = d === t0 && nowMin() >= startMin && nowMin() <= endMin ? `<div class="now-line" style="top:${px(nowMin())}px"></div>` : '';
    return `<div class="cal-day ${d === t0 ? 'today' : ''}" data-drop-cal="${d}" data-action="cal-slot" data-date="${d}" style="height:${(s.dayEnd - s.dayStart) * HOUR}px">${evs}${nowLine}</div>`;
  };

  const header = days.map((d) => {
    const planned = M.tasks().filter((t) => t.date === d && t.time && t.status !== 'done').reduce((a, t) => a + (t.duration || 30), 0);
    return `<div class="dh ${d === t0 ? 'today' : ''}"><b>${shortWeekday(d)}</b> <span class="n">${dayNum(d)}</span><span class="h">${planned ? fmtMinutes(planned) : '–'}</span></div>`;
  }).join('');

  const step = mobile ? 1 : 7;
  const actions = `
    <button class="icon-btn" data-action="toggle-side" title="Offene Aufgaben">${icon('sidebar')}</button>
    <button class="icon-btn" data-action="cal-nav" data-d="-${step}">${icon('left')}</button>
    <button class="btn small" data-action="cal-nav" data-d="0">Heute</button>
    <button class="icon-btn" data-action="cal-nav" data-d="${step}">${icon('right')}</button>
    <button class="btn" data-action="auto-plan">${icon('wand')} Auto-Plan</button>
    <button class="btn" data-action="claude-plan">${icon('sparkle')} Mit Claude planen</button>
    <button class="btn" data-action="new-block">${icon('lock')} Zeit sperren</button>`;

  return `
    <div class="cal-wrap">
      ${side}
      <section class="cal-main">
        ${head('Kalender', mobile ? longDate(days[0]) : rangeLabel(days[0]), actions)}
        <div class="cal-grid">
          <div class="cal-header"><div class="gutter"></div>${header}</div>
          <div class="cal-scroll" id="cal-scroll">
            <div class="cal-times">${hours.join('')}</div>
            ${days.map(dayCol).join('')}
          </div>
        </div>
      </section>
    </div>`;
}

// ---------- Projekte ----------
const weekMsForProject = (pid, from) => M.entriesBetween(from, addDays(from, 7)).filter((e) => M.entryProject(e) === pid).reduce((a, e) => a + M.entryMs(e), 0);
const totalMsForProject = (pid) => store.all('entries').filter((e) => M.entryProject(e) === pid).reduce((a, e) => a + M.entryMs(e), 0);

export function viewProjects() {
  const ws = weekStart(today());
  const cards = M.projects().map((p) => {
    const ts = M.tasks().filter((t) => t.projectId === p.id);
    const done = ts.filter((t) => t.status === 'done').length;
    const pct = ts.length ? Math.round((done / ts.length) * 100) : 0;
    return `
      <div class="pcard" data-action="go" data-href="#project/${p.id}">
        <h3><span class="dot" style="background:${p.color};width:11px;height:11px"></span>${esc(p.name)}</h3>
        <div class="row2">
          <div><div class="big">${fmtHours(weekMsForProject(p.id, ws))}</div><div class="lbl">diese Woche</div></div>
          <div style="text-align:right"><div class="mono muted">${ts.length - done} offen · ${done} erledigt</div><div class="mono muted">${fmtHours(totalMsForProject(p.id))} gesamt</div></div>
        </div>
        <div class="progress"><div style="width:${pct}%;background:${p.color}"></div></div>
      </div>`;
  }).join('');
  return `
    ${head('Projekte', 'Gib deiner Zeit eine Richtung.', `<button class="btn primary" data-action="new-project">${icon('plus')} Neues Projekt</button>`)}
    <div class="grid">${cards}<div class="pcard add" data-action="new-project">${icon('plus')} Projekt anlegen</div></div>`;
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
        <span class="dot" style="background:${p.color};width:14px;height:14px"></span>
        <input class="title-in" style="font-size:28px;font-weight:700;border:0;background:transparent;padding:0" value="${esc(p.name)}" data-pfield="name" data-id="${p.id}">
      </div>
      <div class="actions">
        <button class="btn small" data-action="archive-project" data-id="${p.id}">Archivieren</button>
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
        <h4>Farbe</h4>
        <div class="colors" style="margin-bottom:18px">${COLORS.map((c) => `<button class="${c === p.color ? 'on' : ''}" style="background:${c}" data-action="project-color" data-id="${id}" data-color="${c}"></button>`).join('')}</div>
        <h4>Notizen &amp; Ziel</h4>
        <textarea data-pfield="notes" data-id="${id}" placeholder="Worum geht's? Was ist das Ziel? Links, Ideen…" style="min-height:180px">${esc(p.notes || '')}</textarea>
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
          return `<div class="hbar"><span class="name"><span class="dot" style="background:${p?.color || 'var(--faint)'}"></span>${esc(p?.name || 'Ohne Projekt')}</span><div class="track"><div style="width:${(ms / projMax) * 100}%;background:${p?.color || 'var(--faint)'}"></div></div><span class="val">${fmtHours(ms)}</span></div>`;
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
  const hourOpts = (from, to, sel) => Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => `<option value="${h}" ${h === sel ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');
  return `
    ${head('Einstellungen')}
    <div class="settings">
      <div class="panel"><h4>Sync · <span style="text-transform:none;letter-spacing:0">${statusText}</span></h4>${syncBody}
        ${sy.error ? `<p style="color:var(--danger);font-size:13px">${esc(sy.error)}</p>` : ''}</div>
      <div class="panel"><h4>Planung</h4>
        <div class="inline">
          <div class="field"><label>Tag beginnt</label><select data-setting="dayStart">${hourOpts(0, 12, s.dayStart)}</select></div>
          <div class="field"><label>Tag endet</label><select data-setting="dayEnd">${hourOpts(13, 24, s.dayEnd)}</select></div>
          <div class="field"><label>Wochenziel (Stunden)</label><input type="number" min="1" max="100" data-setting="weeklyGoal" value="${s.weeklyGoal}"></div>
        </div>
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
      <div class="panel"><h4>Ausprobieren</h4><p class="muted" style="margin-top:0">Legt ein paar Beispiel-Projekte, Aufgaben und Sperrzeiten an.</p><button class="btn" data-action="seed-demo">Beispieldaten laden</button></div>
      <p class="mono muted">Version 0.2 · Prototyp</p>
    </div>`;
}

// ---------- Task-Details ----------
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
          <div class="field"><label>Wiederholen</label><select data-field="repeat">${REPEATS.map((r) => `<option value="${r.id}" ${r.id === (t.repeat || '') ? 'selected' : ''}>${r.label}</option>`).join('')}</select></div>
        </div>
        ${t.date || t.time ? `<button class="btn small ghost" data-action="unschedule" style="margin:-4px 0 12px -8px">Termin entfernen (zurück in die Inbox)</button>` : ''}

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
    done: '✓ Fertig. Das Ergebnis steht in den Notizen.',
    error: `⚠️ Fehler: ${esc(job.error || 'unbekannt')}`,
  }[job.status] || '';
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
    <p style="margin:0 0 10px;font-size:14px" class="muted">${job ? jobStatusText(job) : 'Claude recherchiert oder erledigt die Aufgabe auf deinem Mac (über dein Abo) und schreibt das Ergebnis in die Notizen.'}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn small primary" data-action="ai-job" data-id="${t.id}" ${busy ? 'disabled style="opacity:.5"' : ''}>${icon('sparkle')} ${job ? 'Nochmal an Claude senden' : 'An Claude senden'}</button>
      <button class="btn small ghost" data-action="ai-task" data-id="${t.id}">Manuell kopieren</button>
    </div></div>`;
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
      <p>Gesperrte Zeiten werden beim Planen freigehalten (z. B. Gym, Essen, Termine).</p>
      <div class="field"><label>Bezeichnung</label><input id="b-label" value="${esc(b.label || '')}" placeholder="z. B. Gym"></div>
      <div class="inline">
        <div class="field"><label>Datum</label><input type="date" id="b-date" value="${b.date}"></div>
        <div class="field"><label>Von</label><input type="time" step="900" id="b-start" value="${b.start}"></div>
        <div class="field"><label>Bis</label><input type="time" step="900" id="b-end" value="${b.end}"></div>
      </div>
      <div class="field"><label>Wiederholen</label><select id="b-repeat">
        ${[['', 'Nur einmal'], ['daily', 'Täglich'], ['weekdays', 'Werktags (Mo–Fr)'], ['weekly', 'Jede Woche an diesem Wochentag']].map(([v, l]) => `<option value="${v}" ${v === (b.repeat || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="foot">
        ${b.id ? `<button class="btn danger" data-action="delete-block" data-id="${b.id}" style="margin-right:auto">${icon('trash')} Löschen</button>` : ''}
        <button class="btn" data-action="close-modal">Abbrechen</button><button class="btn primary" data-action="save-block">Speichern</button></div>`;
  } else if (m.type === 'slot') {
    inner = `
      <h2>${dayLabel(m.date)}, ${m.time}</h2>
      <p>Was soll hier passieren?</p>
      <div class="field"><input id="slot-title" placeholder="Titel (Aufgabe oder Sperrzeit)" autofocus></div>
      <div class="field"><label>Dauer</label><select id="slot-dur">${[15, 30, 45, 60, 90, 120, 180].map((d) => `<option value="${d}" ${d === 60 ? 'selected' : ''}>${fmtMinutes(d)}</option>`).join('')}</select></div>
      <div class="foot"><button class="btn" data-action="close-modal">Abbrechen</button>
        <button class="btn" data-action="slot-block">${icon('lock')} Zeit sperren</button>
        <button class="btn primary" data-action="slot-task">${icon('plus')} Aufgabe anlegen</button></div>`;
  } else if (m.type === 'project') {
    inner = `
      <h2>Neues Projekt</h2>
      <div class="field"><label>Name</label><input id="p-name" placeholder="z. B. 1000 € mit KI verdienen" autofocus></div>
      <div class="field"><label>Farbe</label><div class="colors">${COLORS.map((c, i) => `<button class="${i === m.colorIdx ? 'on' : ''}" style="background:${c}" data-action="pick-color" data-i="${i}"></button>`).join('')}</div></div>
      <div class="foot"><button class="btn" data-action="close-modal">Abbrechen</button><button class="btn primary" data-action="save-project">Anlegen</button></div>`;
  }
  return `<div class="overlay modal-overlay" data-action="close-modal"></div><div class="modal" role="dialog">${inner}</div>`;
}
