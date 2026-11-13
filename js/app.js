// Steuerung: welche Ansicht ist offen, was passiert bei Klicks, Tippen und Drag & Drop.
import * as store from './store.js';
import * as M from './model.js';
import * as V from './views.js';
import { ui, isMobile } from './ui.js';
import { icon } from './icons.js';
import { esc, today, addDays, weekStart, toMin, fromMin, nowMin, fmtClock, fmtDur, COLORS } from './util.js';
import { SHORTCUTS, actionFor } from './keys.js';
import { splitSources } from './md.js';

const $ = (sel, root = document) => root.querySelector(sel);
const main = $('#main');
const HOUR = 56;

// ---------- Navigation ----------
const NAV = [
  { href: '#inbox', label: 'Inbox', icon: 'inbox' },
  { href: '#plan', label: 'Plan', icon: 'board' },
  { href: '#calendar', label: 'Kalender', icon: 'calendar' },
  { href: '#projects', label: 'Projekte', icon: 'folder' },
  { href: '#review', label: 'Rückblick', icon: 'chart' },
];
const route = () => { const [view, param] = (location.hash.slice(1) || 'plan').split('/'); return { view, param }; };

function renderNav() {
  const { view, param } = route();
  const inboxCount = M.openTasks().filter((t) => !t.date).length;
  const active = (href) => href === `#${view}` || (view === 'project' && href === '#projects');
  const sy = store.sync;
  const syncColor = { online: '#30a46c', offline: '#e2a336', error: '#e5484d', connecting: '#e2a336', 'signed-out': '#e2a336' }[sy.status] || 'var(--faint)';
  const syncText = { off: 'Nur lokal', online: 'Synchronisiert', offline: 'Offline', error: 'Sync-Fehler', connecting: 'Verbinde…', 'signed-out': 'Nicht angemeldet' }[sy.status];
  const collapsed = !!store.settings.navCollapsed;
  $('.app').classList.toggle('nav-collapsed', collapsed);
  $('#sidebar').innerHTML = `
    <div class="brand"><img class="brand-logo" src="favicon.svg" alt=""><span class="txt">Tasks</span>
      <button class="icon-btn collapse-btn" data-action="toggle-nav" title="Seitenleiste ${collapsed ? 'ausklappen' : 'einklappen'} (B)">${icon(collapsed ? 'expand' : 'collapse')}</button></div>
    ${NAV.map((n) => `<a class="nav-item ${active(n.href) ? 'active' : ''}" href="${n.href}" title="${n.label}">${icon(n.icon)}<span class="lbl">${n.label}</span>${n.href === '#inbox' && M.aiNewCount() ? '<span class="ai-dot" title="Claude ist mit Aufgaben fertig"></span>' : ''}${n.href === '#inbox' && inboxCount ? `<span class="count">${inboxCount}</span>` : ''}</a>`).join('')}
    <div class="nav-label"><span class="txt">Projekte</span> <button class="icon-btn" style="width:24px;height:24px" data-action="new-project" title="Neues Projekt">${icon('plus')}</button></div>
    ${M.projects().map((p) => `<a class="nav-item ${view === 'project' && param === p.id ? 'active' : ''}" href="#project/${p.id}" title="${esc(p.name)}">${V.projIcon(p, 16)}<span class="lbl">${esc(p.name)}</span><span class="count">${M.openTasks().filter((t) => t.projectId === p.id).length || ''}</span></a>`).join('')}
    <div class="sidebar-foot">
      <a class="nav-item ${view === 'settings' ? 'active' : ''}" href="#settings" title="Einstellungen">${icon('gear')}<span class="lbl">Einstellungen</span></a>
      <div class="sync-pill" title="${syncText}"><span class="dot" style="background:${syncColor}"></span><span class="txt">${syncText}</span></div>
    </div>`;
  $('#tabbar').innerHTML = NAV.map((n) => `<a class="${active(n.href) ? 'active' : ''}" href="${n.href}">${icon(n.icon)}${n.label}</a>`).join('');
}

// ---------- Rendern ----------
let lastView = '';
function renderMain() {
  const { view, param } = route();
  // Fokus + Scrollpositionen merken, damit beim Neuzeichnen nichts springt
  const act = document.activeElement;
  const key = act?.dataset?.key;
  const sel = key && 'selectionStart' in act ? [act.selectionStart, act.selectionEnd] : null;
  const scroll = { board: $('.board')?.scrollLeft, cal: $('#cal-scroll')?.scrollTop, side: $('.side-list')?.scrollTop };

  const views = { inbox: V.viewInbox, plan: V.viewPlan, calendar: V.viewCalendar, projects: V.viewProjects, project: () => V.viewProject(param), review: V.viewReview, settings: V.viewSettings };
  main.classList.toggle('full', view === 'calendar');
  main.innerHTML = (views[view] || V.viewPlan)();

  if (view === lastView) {
    if ($('.board') && scroll.board != null) $('.board').scrollLeft = scroll.board;
    if ($('#cal-scroll') && scroll.cal != null) $('#cal-scroll').scrollTop = scroll.cal;
    if ($('.side-list') && scroll.side != null) $('.side-list').scrollTop = scroll.side;
  } else {
    main.scrollTop = 0;
    const cs = $('#cal-scroll');
    if (cs) cs.scrollTop = Math.max(0, (Math.max(8, new Date().getHours() - 1) - store.settings.dayStart) * HOUR);
    if (view === 'plan' && isMobile()) $('.col.today')?.scrollIntoView({ inline: 'start', block: 'nearest' });
  }
  lastView = view;
  if (key) {
    const el = main.querySelector(`[data-key="${key}"]`);
    if (el) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(...sel); } catch {} }
  }
  renderNav();
}
const renderSheet = () => {
  const t = ui.openTask && store.get('tasks', ui.openTask);
  $('#sheet-root').innerHTML = t ? V.sheetHTML(t) : '';
};
const renderModal = () => {
  if (route().view === 'calendar') renderMain(); // markierte Zeit im Kalender ein-/ausblenden
  $('#modal-root').innerHTML = ui.modal ? V.modalHTML(ui.modal) : '';
  const af = $('#modal-root [autofocus]');
  if (af) { af.focus(); if (af.value) af.setSelectionRange(af.value.length, af.value.length); }
};

// ---------- Hell/Dunkel ----------
const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
const isDark = () => (store.settings.theme || 'system') === 'system' ? darkMQ.matches : store.settings.theme === 'dark';
function applyTheme() {
  const t = store.settings.theme || 'system';
  if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color'; meta.content = isDark() ? '#121211' : '#f4f3ef';
  document.head.append(meta);
}
darkMQ.addEventListener?.('change', applyTheme);
const renderFocus = () => {
  const t = ui.focusTask && store.get('tasks', ui.focusTask);
  $('#focus-root').innerHTML = t ? V.focusHTML(t) : '';
};
const renderPill = () => { $('#pill-root').innerHTML = V.timerPill(); };
const renderAll = () => {
  renderMain(); renderPill(); renderFocus();
  // Detail-Ansicht aktualisieren (z. B. wenn Claude fertig ist), aber nicht während du darin tippst
  if (ui.openTask && !document.activeElement?.closest?.('.sheet')) renderSheet();
  applyFinishedPlans();
  notifyFinishedTasks();
};

// Aufgabe geöffnet = Claude-Ergebnis gesehen
function markAiSeen(id) {
  const t = store.get('tasks', id);
  const job = t && M.jobsFor(id)[0];
  if (job?.status === 'done' && t.aiSeen !== job.id) store.patch('tasks', id, { aiSeen: job.id });
}

// Hinweis, sobald Claude mit einer Aufgabe fertig ist (nur für Aufträge, die während die App offen ist fertig werden)
let knownDone = null;
function notifyFinishedTasks() {
  const done = store.all('jobs').filter((j) => j.type === 'task' && j.status === 'done');
  if (!knownDone) { knownDone = new Set(done.map((j) => j.id)); return; }
  for (const j of done) {
    if (knownDone.has(j.id)) continue;
    knownDone.add(j.id);
    const t = store.get('tasks', j.taskId);
    if (!t) continue;
    if (ui.openTask === t.id) { markAiSeen(t.id); continue; }
    toast(`✨ Claude ist fertig: ${t.title}`, { label: 'Öffnen', fn: () => { ui.openTask = t.id; markAiSeen(t.id); renderSheet(); } });
  }
}

// Fertige Claude-Pläne automatisch übernehmen
function applyFinishedPlans() {
  for (const job of M.unappliedPlans()) {
    store.patch('jobs', job.id, { applied: true });
    try {
      const res = M.applyClaudePlan(job.result || '');
      toast(`Claude hat ${res.count} Aufgaben eingeplant.`, { label: 'Rückgängig', fn: () => M.undoPlan(res.undo) });
    } catch (e) { toast('Claudes Plan konnte nicht gelesen werden: ' + e.message); }
  }
}

store.subscribe(() => { applyTheme(); renderAll(); });
window.addEventListener('hashchange', () => { ui.sideOpen = false; renderMain(); });
let resizeT;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(renderMain, 200); });

// Timer-Anzeige jede Sekunde aktualisieren (ohne alles neu zu zeichnen)
setInterval(() => {
  const r = M.running();
  document.querySelectorAll('[data-tick]').forEach((el) => {
    if (!r) return;
    if (el.dataset.tick === 'task') el.textContent = fmtDur(M.trackedFor(r.taskId));
    else if (el.dataset.tick) el.textContent = fmtClock(Date.now() - r.start);
  });
}, 1000);
setInterval(() => { if (route().view === 'calendar' && !ui.drag) renderMain(); }, 60000);

// ---------- Toast ----------
let toastT;
function toast(msg, action) {
  clearTimeout(toastT);
  const root = $('#toast-root');
  root.innerHTML = `<div class="toast"><span>${esc(msg)}</span>${action ? `<button data-action="toast-action">${esc(action.label)}</button>` : ''}</div>`;
  root._action = action?.fn;
  toastT = setTimeout(() => { root.innerHTML = ''; }, action ? 6000 : 2600);
}

function copy(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  fallbackCopy(text);
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
}

// ---------- Klick-Aktionen ----------
const A = {
  go: (el) => { location.hash = el.dataset.href; },
  'toast-action': () => { const fn = $('#toast-root')._action; $('#toast-root').innerHTML = ''; fn?.(); },

  toggle: (el) => {
    const t = store.get('tasks', el.dataset.id);
    const wasDone = t.status === 'done';
    M.toggleDone(t.id);
    if (!wasDone) toast(t.repeat ? 'Erledigt ✓ Nächste Wiederholung ist angelegt.' : 'Erledigt ✓', t.repeat ? null : { label: 'Rückgängig', fn: () => M.toggleDone(t.id) });
    if (ui.openTask === t.id) renderSheet();
  },
  'open-task': (el) => { ui.openTask = el.dataset.id; markAiSeen(el.dataset.id); renderSheet(); },
  'close-sheet': () => { ui.openTask = null; renderSheet(); },
  timer: (el) => {
    const id = el.dataset.id;
    if (M.running()?.taskId === id) M.stopTimer(); else M.startTimer(id);
    if (ui.openTask) renderSheet();
  },
  'stop-timer': () => M.stopTimer(),
  focus: (el) => { ui.focusTask = el.dataset.id; ui.openTask = null; renderSheet(); renderFocus(); renderPill(); },
  'close-focus': () => { ui.focusTask = null; renderFocus(); renderPill(); },
  'focus-done': (el) => { M.toggleDone(el.dataset.id); ui.focusTask = null; renderFocus(); renderPill(); toast('Stark. Erledigt ✓'); },

  'inbox-tab': (el) => { ui.inboxTab = el.dataset.tab; renderMain(); },
  sort: (el) => store.saveSettings({ sortMode: el.dataset.mode }),
  'plan-nav': (el) => { const d = +el.dataset.d; ui.planStart = d ? addDays(ui.planStart, d) : today(); renderMain(); },
  'cal-nav': (el) => {
    const d = +el.dataset.d;
    if (isMobile()) ui.calDay = d ? addDays(ui.calDay, d) : today();
    else ui.calStart = d ? addDays(ui.calStart, d) : weekStart(today());
    renderMain();
  },
  'review-nav': (el) => { const d = +el.dataset.d; ui.reviewWeek = d ? addDays(ui.reviewWeek, d) : weekStart(today()); renderMain(); },
  'toggle-nav': () => store.saveSettings({ navCollapsed: !store.settings.navCollapsed }),
  theme: (el) => store.saveSettings({ theme: el.dataset.v }),
  'toggle-side': () => { if (isMobile()) { ui.sideOpen = !ui.sideOpen; renderMain(); } else store.saveSettings({ sidebar: !store.settings.sidebar }); },

  'auto-plan': () => {
    const res = M.autoPlan(store.settings);
    if (!res.count) return toast(res.skipped ? 'Keine freien Slots gefunden, die passen.' : 'Nichts zu planen: alle offenen Aufgaben haben schon eine Uhrzeit.');
    toast(`${res.count} Aufgabe${res.count > 1 ? 'n' : ''} eingeplant${res.skipped ? `, ${res.skipped} passten nicht rein` : ''}.`, { label: 'Rückgängig', fn: () => M.undoPlan(res.undo) });
  },
  'claude-plan': () => { ui.modal = { type: 'claude-plan' }; renderModal(); },
  'copy-plan-prompt': (el) => {
    copy(M.claudePlanPrompt(store.settings));
    if (!el.dataset.noopen) window.open('https://claude.ai/new', '_blank');
    toast('Auftrag kopiert. In Claude einfügen und senden.');
  },
  'apply-claude-plan': () => {
    try {
      const res = M.applyClaudePlan($('#claude-answer').value);
      ui.modal = null; renderModal();
      toast(`${res.count} Aufgaben von Claude eingeplant.`, { label: 'Rückgängig', fn: () => M.undoPlan(res.undo) });
    } catch (e) { toast('Konnte die Antwort nicht lesen: ' + e.message); }
  },

  'new-block': () => { ui.modal = { type: 'block', block: { date: isMobile() ? ui.calDay : today(), start: '12:00', end: '13:00', label: '', repeat: '' } }; renderModal(); },
  'edit-block': (el) => { ui.modal = { type: 'block', block: { ...store.get('blocks', el.dataset.id) } }; renderModal(); },
  'save-block': () => {
    const b = ui.modal.block;
    const v = { date: $('#b-date').value, start: $('#b-start').value, end: $('#b-end').value, label: $('#b-label').value.trim(), repeat: $('#b-repeat').value };
    if (!v.date || !v.start || !v.end || toMin(v.end) <= toMin(v.start)) return toast('Bitte Datum sowie Start vor Ende angeben.');
    store.put('blocks', { ...b, ...v });
    ui.modal = null; renderModal();
  },
  'delete-block': (el) => { store.remove('blocks', el.dataset.id); ui.modal = null; renderModal(); },
  'cal-slot': (el, e) => {
    if (suppressSlotClick) { suppressSlotClick = false; return; }
    const min = slotMin(el, e.clientY, Math.floor);
    ui.modal = { type: 'slot', date: el.dataset.date, time: fromMin(min), dur: 60, title: '' };
    renderModal();
  },
  'slot-task': () => {
    const m = ui.modal, title = $('#slot-title').value;
    if (!title.trim()) return toast('Bitte einen Titel eingeben.');
    M.addTask(title, { date: m.date, time: m.time, duration: m.dur });
    ui.modal = null; renderModal();
  },
  'slot-block': () => {
    const m = ui.modal;
    store.put('blocks', { date: m.date, start: m.time, end: fromMin(Math.min(toMin(m.time) + m.dur, 24 * 60 - 1)), label: $('#slot-title').value.trim() || 'Gesperrt', repeat: '' });
    ui.modal = null; renderModal();
  },

  'new-project': (el) => { ui.modal = { type: 'project', colorIdx: M.projects().length % COLORS.length, icon: 'folder', fromTask: el.dataset.fromTask }; renderModal(); },
  'pick-icon': (el) => {
    ui.modal.icon = ui.modal.icon === el.dataset.icon ? null : el.dataset.icon;
    el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.icon === ui.modal.icon));
  },
  'project-icon': (el) => { const p = store.get('projects', el.dataset.id); store.patch('projects', p.id, { icon: p.icon === el.dataset.icon ? null : el.dataset.icon }); },
  'pick-color': (el) => {
    ui.modal.colorIdx = +el.dataset.i;
    el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
  },
  'save-project': () => {
    const name = $('#p-name').value.trim();
    if (!name) return toast('Bitte einen Namen eingeben.');
    const p = store.put('projects', { name, color: COLORS[ui.modal.colorIdx], icon: ui.modal.icon || null, goal: $('#p-goal').value.trim(), notes: $('#p-notes').value, archived: false });
    const fromTask = ui.modal.fromTask;
    ui.modal = null; renderModal();
    if (fromTask) { store.patch('tasks', fromTask, { projectId: p.id }); renderSheet(); }
  },
  'project-color': (el) => store.patch('projects', el.dataset.id, { color: el.dataset.color }),
  'archive-project': (el) => { store.patch('projects', el.dataset.id, { archived: true }); location.hash = '#projects'; toast('Projekt archiviert.'); },
  'delete-project': (el) => {
    if (!confirm('Projekt löschen? Die Aufgaben bleiben erhalten, nur ohne Projekt.')) return;
    const id = el.dataset.id;
    store.batch(() => {
      M.tasks().filter((t) => t.projectId === id).forEach((t) => store.patch('tasks', t.id, { projectId: null }));
      store.remove('projects', id);
    });
    location.hash = '#projects';
  },

  set: (el) => {
    const id = ui.openTask, k = el.dataset.k, v = el.dataset.v;
    if (k === 'status' && v === 'done') { if (store.get('tasks', id).status !== 'done') M.toggleDone(id); }
    else store.patch('tasks', id, { [k]: v, ...(k === 'status' ? { doneAt: null } : {}) });
    renderSheet();
  },
  unschedule: () => { store.patch('tasks', ui.openTask, { date: null, time: null }); renderSheet(); },
  'delete-task': (el) => {
    const id = el.dataset.id;
    if (!confirm('Aufgabe wirklich löschen?')) return;
    store.batch(() => {
      if (M.running()?.taskId === id) M.stopTimer();
      Object.values(store.state.files).filter((f) => f.taskId === id).forEach((f) => store.remove('files', f.id));
      store.remove('tasks', id);
    });
    ui.openTask = null; renderSheet();
    toast('Aufgabe gelöscht.');
  },
  'ai-job': (el) => {
    M.sendTaskToClaude(store.get('tasks', el.dataset.id));
    renderSheet();
    toast(M.helperOnline() ? 'An Claude geschickt. Das Ergebnis erscheint oben in der Aufgabe.' : 'Auftrag gespeichert. Startet, sobald der Mac-Helfer läuft.');
  },
  'ai-hide': (el) => { store.patch('tasks', ui.openTask, { aiHidden: el.dataset.id }); renderSheet(); },
  'ai-more': (el) => { ui.aiOpen = ui.aiOpen === el.dataset.id ? null : el.dataset.id; renderSheet(); },
  'ai-to-notes': (el) => {
    const t = store.get('tasks', el.dataset.id), job = store.get('jobs', el.dataset.job);
    const { body } = splitSources(job.result || '');
    store.patch('tasks', t.id, { notes: `${t.notes ? t.notes.trimEnd() + '\n\n' : ''}Claude:\n${body}` });
    renderSheet(); toast('In die Notizen übernommen.');
  },
  'ai-reply': (el) => {
    const reply = $('#ai-reply')?.value.trim();
    if (!reply) return toast('Schreib zuerst deine Antwort oder Rückfrage.');
    const t = store.get('tasks', el.dataset.id), job = store.get('jobs', el.dataset.job);
    M.sendTaskToClaude(t, M.claudeFollowUpPrompt(t, job.result || '', reply));
    document.activeElement?.blur?.();
    renderSheet();
    toast(M.helperOnline() ? 'An Claude geschickt.' : 'Gespeichert. Startet, sobald der Mac-Helfer läuft.');
  },
  'plan-job': () => {
    M.sendPlanToClaude(store.settings);
    ui.modal = null; renderModal();
    toast(M.helperOnline() ? 'Claude plant… Der Plan erscheint gleich automatisch.' : 'Auftrag gespeichert. Startet, sobald der Mac-Helfer läuft.');
  },
  'ai-task': (el) => {
    const t = store.get('tasks', el.dataset.id);
    copy(M.claudeTaskPrompt(t));
    window.open('https://claude.ai/new', '_blank');
    store.patch('tasks', t.id, { ai: true, status: t.status === 'todo' ? 'waiting' : t.status });
    renderSheet();
    toast('Auftrag kopiert. In Claude einfügen und senden.');
  },
  'open-file': (el) => {
    const f = store.get('files', el.dataset.id);
    const w = window.open();
    if (!w) return;
    w.document.write(f.type.startsWith('image/') ? `<title>${esc(f.name)}</title><img src="${f.data}" style="max-width:100%">` : `<a href="${f.data}" download="${esc(f.name)}">${esc(f.name)} herunterladen</a>`);
  },
  'del-file': (el) => { if (confirm('Anhang löschen?')) { store.remove('files', el.dataset.id); renderSheet(); } },
  'del-entry': (el) => { if (confirm('Zeiteintrag löschen?')) store.remove('entries', el.dataset.id); },

  'sign-in': async () => {
    try { await store.signIn($('#login-email').value.trim(), $('#login-pass').value); toast('Angemeldet. Sync läuft.'); }
    catch (e) { toast('Anmeldung fehlgeschlagen: ' + (e.code || e.message)); }
  },
  'sign-out': async () => { await store.signOutUser(); toast('Abgemeldet.'); },
  copy: (el) => { copy(el.dataset.text); toast('Kopiert.'); },
  export: () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `tasks-backup-${today()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  'seed-demo': () => { M.seedDemo(); toast('Beispieldaten geladen.'); },
  'close-modal': () => { ui.modal = null; renderModal(); },
  'close-modal-go': (el) => { ui.modal = null; renderModal(); location.hash = el.getAttribute('href'); },
  'quick-save': () => {
    const v = $('#quick-title').value;
    if (!v.trim()) return toast('Bitte einen Titel eingeben.');
    M.addTask(v);
    ui.modal = null; renderModal();
    toast('In der Inbox ✓');
  },
  'key-record': (el) => { ui.recordKey = ui.recordKey === el.dataset.id ? null : el.dataset.id; renderMain(); },
  'keys-reset': () => { ui.recordKey = null; store.saveSettings({ keys: {} }); toast('Standard-Kürzel wiederhergestellt.'); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  // Klick auf ein Kind-Element mit eigener Aktion hat Vorrang (z. B. Haken in einer Zeile)
  const fn = A[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el, e); }
});

// ---------- Tippen ----------
document.addEventListener('keydown', (e) => {
  const el = e.target;
  if (ui.recordKey) return recordKey(e);
  if (e.key === 'Escape') {
    if (ui.modal) A['close-modal'](); else if (ui.openTask) A['close-sheet'](); else if (ui.focusTask) A['close-focus']();
    return;
  }
  if (shortcut(e)) return;
  if (e.key !== 'Enter' || e.isComposing) return;
  if (el.dataset.add) {
    e.preventDefault();
    const extra = el.dataset.add === 'day' ? { date: el.dataset.date } : el.dataset.add === 'project' ? { projectId: el.dataset.project } : {};
    if (M.addTask(el.value, extra)) el.value = '';
  } else if (el.id === 'login-pass') A['sign-in']();
  else if (el.id === 'slot-title') A['slot-task']();
  else if (el.id === 'p-name') A['save-project']();
  else if (el.id === 'quick-title') A['quick-save']();
  else if (el.id === 'ai-reply') A['ai-reply']($('[data-action="ai-reply"]'));
});

// ---------- Tastenkürzel ----------
const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
function recordKey(e) {
  e.preventDefault();
  if (['Shift', 'Meta', 'Alt', 'Control', 'CapsLock'].includes(e.key)) return;
  const id = ui.recordKey;
  ui.recordKey = null;
  if (e.key === 'Escape') return renderMain();
  const key = e.key === 'Backspace' || e.key === 'Delete' ? '' : e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const keys = { ...(store.settings.keys || {}) };
  // Taste war schon belegt? Dann dort entfernen, damit nichts doppelt ist
  if (key) { const other = actionFor(store.settings, key); if (other && other !== id) { keys[other] = ''; toast(`Taste war vorher für „${SHORTCUTS.find((s) => s.id === other).label}“ belegt, dort entfernt.`); } }
  keys[id] = key;
  store.saveSettings({ keys });
}
function shortcut(e) {
  if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || typing(e.target) || ui.modal || ui.focusTask) return false;
  const id = actionFor(store.settings, e.key);
  if (!id) return false;
  const { view } = route();
  const navTo = { inbox: '#inbox', plan: '#plan', calendar: '#calendar', projects: '#projects', review: '#review', settings: '#settings' };
  const step = (d) => {
    if (view === 'plan') A['plan-nav']({ dataset: { d: String(d * 7) } });
    else if (view === 'calendar') A['cal-nav']({ dataset: { d: String(d * (isMobile() ? 1 : 7)) } });
    else if (view === 'review') A['review-nav']({ dataset: { d: String(d * 7) } });
    else return false;
  };
  const run = {
    new: () => { ui.modal = { type: 'quick' }; renderModal(); },
    today: () => step(0),
    prev: () => step(-1),
    next: () => step(1),
    nav: () => A['toggle-nav'](),
    side: () => view === 'calendar' && A['toggle-side'](),
    autoplan: () => A['auto-plan'](),
    claude: () => A['claude-plan'](),
    theme: () => store.saveSettings({ theme: isDark() ? 'light' : 'dark' }),
    done: () => ui.openTask && A.toggle({ dataset: { id: ui.openTask } }),
    focus: () => ui.openTask && A.focus({ dataset: { id: ui.openTask } }),
    help: () => { ui.modal = { type: 'keys' }; renderModal(); },
  };
  e.preventDefault();
  if (navTo[id]) { ui.openTask = null; renderSheet(); location.hash = navTo[id]; } else run[id]?.();
  return true;
}

// ---------- Kalender: Zeitraum mit der Maus aufziehen (wie Google Calendar) ----------
let suppressSlotClick = false;
const slotMin = (dayEl, y, round = Math.round) => {
  const s = store.settings;
  const min = s.dayStart * 60 + round((((y - dayEl.getBoundingClientRect().top) / HOUR) * 60) / 15) * 15;
  return Math.max(s.dayStart * 60, Math.min(min, s.dayEnd * 60));
};
document.addEventListener('pointerdown', (e) => {
  const day = e.target.closest?.('.cal-day');
  if (!day || e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('.ev') || ui.modal) return;
  const date = day.dataset.date, anchor = slotMin(day, e.clientY, Math.floor);
  const y0 = e.clientY;
  let moved = false, raf = 0;
  ui.select = { date, s: anchor, e: anchor + 15 };
  const move = (ev) => {
    if (!moved && Math.abs(ev.clientY - y0) < 6) return;
    moved = true;
    const cur = slotMin($(`.cal-day[data-date="${date}"]`), ev.clientY);
    ui.select = { date, s: Math.min(anchor, cur), e: Math.max(anchor + 15, cur, Math.min(anchor, cur) + 15) };
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderMain(); $(`.cal-day[data-date="${date}"]`)?.classList.add('selecting'); });
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    cancelAnimationFrame(raf);
    const sel = ui.select; ui.select = null;
    if (!moved) return; // normaler Klick: macht 'cal-slot'
    suppressSlotClick = true; setTimeout(() => { suppressSlotClick = false; }, 300);
    ui.modal = { type: 'slot', date, time: fromMin(sel.s), dur: sel.e - sel.s, title: '' };
    renderModal();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
});

const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const saveNotes = debounce((id, v) => store.patch('tasks', id, { notes: v }), 400);
const saveProjectField = debounce((id, k, v) => store.patch('projects', id, { [k]: v }), 400);

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'slot-title' && ui.modal) ui.modal.title = el.value;
  if (el.dataset.field === 'notes') saveNotes(ui.openTask, el.value);
  if (el.dataset.pfield) saveProjectField(el.dataset.id, el.dataset.pfield, el.value);
});

document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.id === 'slot-dur' && ui.modal) { ui.modal.dur = +el.value; renderModal(); return; }
  const f = el.dataset.field;
  if (f && ui.openTask) {
    const id = ui.openTask;
    let v = el.value;
    if (f === 'title') { if (!v.trim()) return; v = v.trim(); }
    if (f === 'notes') return;
    if (f === 'projectId' && v === '__new') { el.value = store.get('tasks', id).projectId || ''; return A['new-project']({ dataset: { fromTask: id } }); }
    if (f === 'duration') v = +v;
    if (f === 'date' || f === 'time' || f === 'projectId') v = v || null;
    const changes = { [f]: v };
    if (f === 'time' && v && !store.get('tasks', id).date) changes.date = today();
    store.patch('tasks', id, changes);
    if (f === 'date' || f === 'time') renderSheet();
    return;
  }
  if (el.dataset.setting) {
    const v = +el.value;
    if (el.dataset.setting === 'dayEnd' && v <= store.settings.dayStart) return toast('Ende muss nach dem Beginn liegen.');
    store.saveSettings({ [el.dataset.setting]: v });
  }
  if (el.hasAttribute('data-import') && el.files[0]) {
    try { store.importJSON(await el.files[0].text()); toast('Backup importiert.'); } catch (err) { toast('Import fehlgeschlagen: ' + err.message); }
  }
  if (el.hasAttribute('data-attach') && el.files[0]) {
    const file = el.files[0];
    try {
      const data = file.type.startsWith('image/') ? await compressImage(file) : await readSmall(file);
      store.put('files', { taskId: ui.openTask, name: file.name, type: file.type.startsWith('image/') ? 'image/jpeg' : file.type || 'application/octet-stream', data });
      renderSheet();
    } catch (err) { toast(err.message); }
  }
});

async function compressImage(file) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Bild konnte nicht gelesen werden.')); i.src = url; });
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL('image/jpeg', 0.72);
}
function readSmall(file) {
  if (file.size > 700 * 1024) return Promise.reject(new Error('Datei ist zu groß (max. 700 KB). Größere Dateien kommen mit einem späteren Update.'));
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}

// ---------- Drag & Drop (Mac) ----------
document.addEventListener('dragstart', (e) => {
  const el = e.target.closest?.('[data-drag]');
  if (!el) return;
  let offsetMin = 0;
  if (el.classList.contains('ev')) offsetMin = Math.floor((((e.clientY - el.getBoundingClientRect().top) / HOUR) * 60) / 15) * 15;
  ui.drag = { id: el.dataset.id, offsetMin };
  e.dataTransfer.setData('text/plain', el.dataset.id);
  e.dataTransfer.effectAllowed = 'move';
  requestAnimationFrame(() => el.classList.add('dragging'));
});
const dropTarget = (e) => e.target.closest?.('[data-drop-day],[data-drop-cal],[data-drop-inbox]');
document.addEventListener('dragover', (e) => {
  const t = dropTarget(e);
  if (!t || !ui.drag) return;
  e.preventDefault();
  document.querySelectorAll('.drag-over').forEach((x) => x !== t && x.classList.remove('drag-over'));
  t.classList.add('drag-over');
});
document.addEventListener('dragleave', (e) => { const t = dropTarget(e); if (t && !t.contains(e.relatedTarget)) t.classList.remove('drag-over'); });
document.addEventListener('drop', (e) => {
  const t = dropTarget(e);
  if (!t || !ui.drag) return;
  e.preventDefault();
  const id = ui.drag.id;
  if (t.dataset.dropDay) store.patch('tasks', id, { date: t.dataset.dropDay });
  else if (t.dataset.dropCal) {
    const rect = t.getBoundingClientRect();
    let min = store.settings.dayStart * 60 + Math.round(((((e.clientY - rect.top) / HOUR) * 60) - ui.drag.offsetMin) / 15) * 15;
    min = Math.max(0, Math.min(min, 24 * 60 - 15));
    store.patch('tasks', id, { date: t.dataset.dropCal, time: fromMin(min) });
  } else if (t.dataset.dropInbox) store.patch('tasks', id, { date: null, time: null });
});
document.addEventListener('dragend', () => {
  ui.drag = null;
  document.querySelectorAll('.drag-over,.dragging').forEach((x) => x.classList.remove('drag-over', 'dragging'));
});

// ---------- Start ----------
if (!location.hash) location.replace('#plan');
applyTheme();
renderAll();
store.initSync();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if (navigator.storage?.persist) navigator.storage.persist();
window.__app = { store, M, ui }; // zum Ausprobieren in der Browser-Konsole
