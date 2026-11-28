// Steuerung: welche Ansicht ist offen, was passiert bei Klicks, Tippen und Drag & Drop.
import * as store from './store.js';
import * as M from './model.js';
import * as V from './views.js';
import * as F from './finance.js';
import * as P from './portfolio.js';
import * as T from './tabs.js';
import * as Ml from './mail.js';
import * as Lo from './loans.js';
import { NAV, BAR, navItems, reorder } from './nav.js';
import { ui, isMobile } from './ui.js';
import { icon } from './icons.js';
import { esc, toDateStr, today, addDays, weekStart, toMin, fromMin, nowMin, weekday, fmtClock, fmtDur, fmtHours, fmtMinutes, COLORS } from './util.js';
import { SHORTCUTS, actionFor } from './keys.js';
import { splitSources } from './md.js';

const $ = (sel, root = document) => root.querySelector(sel);
const main = $('#main');
const HOUR = 56;

// ---------- Navigation ----------
const route = () => { const [view, param] = (location.hash.slice(1) || 'today').split('/'); return { view, param }; };

function renderNav() {
  const { view, param } = route();
  const inboxCount = M.openTasks().filter((t) => !t.date).length;
  const active = (href) => href === `#${view}` || (view === 'project' && href === '#projects');
  const sy = store.sync;
  const syncColor = { online: '#30a46c', offline: '#e2a336', error: '#e5484d', connecting: '#e2a336', 'signed-out': '#e2a336' }[sy.status] || 'var(--faint)';
  const syncText = { off: 'Nur lokal', online: 'Synchronisiert', offline: 'Offline', error: 'Sync-Fehler', connecting: 'Verbinde…', 'signed-out': 'Nicht angemeldet' }[sy.status];
  const collapsed = !!store.settings.navCollapsed;
  const projShut = !!store.settings.navProjHidden; // Projekte in der Seitenleiste zugeklappt
  $('.app').classList.toggle('nav-collapsed', collapsed);
  $('#sidebar').innerHTML = `
    <div class="brand"><img class="brand-logo" src="favicon.svg" alt=""><span class="txt">Tasks</span>
      <button class="icon-btn collapse-btn" data-action="toggle-nav" title="Seitenleiste ${collapsed ? 'ausklappen' : 'einklappen'} (B)">${icon(collapsed ? 'expand' : 'collapse')}</button></div>
    ${navItems(store.settings).map((n) => `<a class="nav-item ${active(n.href) ? 'active' : ''}" href="${n.href}" title="${n.label}" draggable="true" data-nav="${n.href}">${icon(n.icon)}<span class="lbl">${n.label}</span>${n.href === '#inbox' && M.aiNewCount() ? '<span class="ai-dot" title="Claude ist mit Aufgaben fertig"></span>' : ''}${n.href === '#inbox' && inboxCount ? `<span class="count">${inboxCount}</span>` : ''}</a>`).join('')}
    <div class="nav-label"><button class="nav-label-t ${projShut ? 'shut' : ''}" data-action="toggle-nav-proj" title="Projekte ${projShut ? 'einblenden' : 'ausblenden'}" aria-expanded="${!projShut}"><span class="txt">Projekte</span>${icon('right', 'chev')}</button> <button class="icon-btn" style="width:24px;height:24px" data-action="new-project" title="Neues Projekt">${icon('plus')}</button></div>
    ${projShut ? '' : M.projects().map((p) => `<a class="nav-item ${view === 'project' && param === p.id ? 'active' : ''}" href="#project/${p.id}" title="${esc(p.name)}">${V.projIcon(p, 16)}<span class="lbl">${esc(p.name)}</span><span class="count">${M.openTasks().filter((t) => t.projectId === p.id).length || ''}</span></a>`).join('')}
    <div class="sidebar-foot">
      <a class="nav-item ${view === 'settings' ? 'active' : ''}" href="#settings" title="Einstellungen">${icon('gear')}<span class="lbl">Einstellungen</span></a>
      <div class="sync-pill" title="${syncText}"><span class="dot" style="background:${syncColor}"></span><span class="txt">${syncText}</span></div>
    </div>`;
  // iPhone-Leiste: die ersten Bereiche deiner Reihenfolge, der Rest unter „Mehr“
  const items = navItems(store.settings), bar = items.slice(0, BAR), rest = items.slice(BAR);
  const restOn = rest.some((n) => active(n.href)) || view === 'settings';
  $('#tabbar').innerHTML = `<i class="tab-pill"></i>` + bar.map((n) => `<a class="${active(n.href) ? 'active' : ''}" href="${n.href}">${icon(n.icon)}<span>${n.label}</span></a>`).join('')
    + `<a class="${restOn ? 'active' : ''}" href="#" data-action="nav-more">${icon(restOn ? (rest.find((n) => active(n.href))?.icon || 'gear') : 'more')}<span>${restOn ? (rest.find((n) => active(n.href))?.label || 'Einstellungen') : 'Mehr'}</span></a>`;
  slidePill($('#tabbar'), 'tabbar', '.active');
  renderTabs();
}

// ---------- Tabs oben (Mac) ----------
// Titel + Symbol eines Tabs aus seiner Adresse
function tabMeta(hash) {
  const [v, prm] = (hash.slice(1) || 'today').split('/');
  if (v === 'project') { const p = store.get('projects', prm); return p ? { label: p.name, ic: V.projIcon(p, 16) } : { label: 'Projekt', ic: icon('folder') }; }
  if (v === 'finance') return prm === 'portfolio' ? { label: 'Portfolio', ic: icon('pie') } : prm === 'loans' ? { label: 'Kredite', ic: icon('coins') } : { label: 'Finanzen', ic: icon('wallet') };
  if (v === 'settings') return { label: 'Einstellungen', ic: icon('gear') };
  const n = NAV.find((x) => x.href === '#' + v) || NAV[0];
  return { label: n.label, ic: icon(n.icon) };
}
const desktop = () => !window.matchMedia('(max-width: 760px)').matches;
function renderTabs() {
  const on = T.enabled();
  document.documentElement.classList.toggle('has-tabs', on);
  const box = $('#tabstrip');
  const act = T.active();
  document.title = `${tabMeta(act.hash).label} – Tasks`;
  if (!on || !desktop()) { box.innerHTML = ''; return; }
  const tabs = T.list();
  box.innerHTML = `
    <div class="ts-nav">
      <button class="icon-btn" data-action="tab-back" title="Zurück" ${T.canBack() ? '' : 'disabled'}>${icon('left')}</button>
      <button class="icon-btn" data-action="tab-fwd" title="Vor" ${T.canFwd() ? '' : 'disabled'}>${icon('right')}</button>
    </div>
    <div class="ts-tabs" role="tablist">${tabs.map((t) => {
      const m = tabMeta(t.hash);
      return `<div class="ts-tab ${t.id === act.id ? 'on' : ''}" role="tab" aria-selected="${t.id === act.id}" data-action="tab-select" data-tab="${t.id}" draggable="true" title="${esc(m.label)}">
        ${m.ic}<span class="ts-l">${esc(m.label)}</span>${tabs.length > 1 ? `<button class="ts-x" data-action="tab-close" data-tab="${t.id}" title="Tab schließen" aria-label="Tab schließen">${icon('x')}</button>` : ''}</div>`;
    }).join('')}</div>
    <button class="icon-btn ts-add" data-action="tab-new" title="Neuer Tab" ${tabs.length >= 12 ? 'disabled' : ''}>${icon('plus')}</button>`;
}
// Scrollposition je Tab merken, damit ein Wechsel nicht nach oben springt
const tabScroll = {};
let mailScroll = { id: null, top: 0 };
let pendingScroll = null;
function tabSwitch(fn) {
  tabScroll[T.active().id] = main.scrollTop;
  const changed = fn();
  pendingScroll = tabScroll[T.active().id] ?? 0;
  if (!changed) { renderMain(); renderPill(); applyPendingScroll(); }
}
function applyPendingScroll() { if (pendingScroll != null) { main.scrollTop = pendingScroll; pendingScroll = null; } }
function openTab(hash) {
  tabSwitch(() => {
    const before = location.hash || '#today';
    if (!T.open(hash)) { toast('Höchstens 12 Tabs.'); return false; }
    return before !== hash;
  });
}

// ---------- Design: Glass (Standard) oder Klassisch + Animationen ----------
// Pro Gerät gespeichert; index.html setzt es schon vor dem ersten Zeichnen. Im klassischen Design blendet CSS alles hier aus.
const design = () => { try { return localStorage.getItem('taskapp-design-v2') || 'hero'; } catch { return 'hero'; } };
const glass = () => design() !== 'classic' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
function setDesign(d) { try { localStorage.setItem('taskapp-design-v2', d); } catch {} window.applyDesign?.(d); applyTheme(); renderAll(); }
// Pille gleitet von der alten zur neuen Position (FLIP): alte Position merken, nach dem Neuzeichnen dort ansetzen und loslaufen lassen
const pillPos = {};
function slidePill(box, key, onSel = '.on', cls = 'tab-pill') {
  if (!box) return;
  let pill = box.querySelector(`:scope > .${cls}`);
  if (!pill) { pill = document.createElement('i'); pill.className = cls; box.prepend(pill); }
  const on = box.querySelector(`:scope > ${onSel}`);
  if (!on || !on.offsetWidth) { pill.style.opacity = '0'; return; }
  const to = { x: on.offsetLeft, w: on.offsetWidth }, from = pillPos[key];
  const place = (p) => { pill.style.width = p.w + 'px'; pill.style.transform = `translateX(${p.x}px)`; };
  pill.style.transition = 'none'; place(from || to); void pill.offsetWidth; pill.style.transition = '';
  if (from && (from.x !== to.x || from.w !== to.w)) requestAnimationFrame(() => requestAnimationFrame(() => place(to)));
  pillPos[key] = to;
}
// Kurz hervorheben, was gerade neu dazukam oder abgehakt wurde
function flash(id, kind = 'pop') { ui.flash = { id, kind }; clearTimeout(flash.t); flash.t = setTimeout(() => { ui.flash = null; }, 900); }
function applyFlash() {
  const f = ui.flash;
  if (!f || !glass()) return;
  ui.flash = null; // nur einmal, sonst ploppt es bei jedem Sync erneut
  if (f.kind === 'check') document.querySelectorAll(`.check[data-id="${f.id}"]`).forEach((el) => el.classList.add('pop'));
  else document.querySelectorAll(`[data-id="${f.id}"]`).forEach((el) => { const c = el.closest('.tcard, .card, .row'); if (c) c.classList.add('pop'); });
}
// Oben weich ausblenden, sobald gescrollt wird (auf dem iPhone scrollt #main, nicht die Seite)
main.addEventListener('scroll', () => document.documentElement.classList.toggle('scrolled', main.scrollTop > 4), { passive: true });

// ---------- Rendern ----------
let lastView = '';
function renderMain() {
  const { view, param } = route();
  // Fokus + Scrollpositionen merken, damit beim Neuzeichnen nichts springt
  const act = document.activeElement;
  const key = act?.dataset?.key;
  const sel = key && 'selectionStart' in act ? [act.selectionStart, act.selectionEnd] : null;
  { const rd = $('.m-reader'), fr = $('.m-frame'); if (rd && fr) mailScroll = { id: fr.dataset.id, top: rd.scrollTop }; }
  const scroll = { board: $('.board')?.scrollLeft, cal: $('#cal-scroll')?.scrollTop, side: $('.side-list')?.scrollTop };

  const views = { today: V.viewToday, inbox: V.viewToday, plan: V.viewPlan, calendar: V.viewCalendar, projects: V.viewProjects, project: () => V.viewProject(param), review: V.viewReview, finance: () => (param === 'portfolio' ? P.viewPortfolio() : param === 'loans' ? Lo.viewLoans() : F.viewFinance()), mail: Ml.viewMail, settings: V.viewSettings };
  main.classList.toggle('full', view === 'calendar');
  main.innerHTML = (views[view] || V.viewToday)();
  // Kalender-Kasten auf Heute: Höhe in ganzen Stunden, damit keine Uhrzeit halb abgeschnitten ist
  const mini = $('.cal-grid.mini');
  if (mini) {
    const k = window.matchMedia('(max-width: 1000px)').matches ? 7 : Math.max(5, Math.floor((window.innerHeight - mini.getBoundingClientRect().top - 20) / HOUR));
    mini.style.height = `${k * HOUR}px`;
  }

  if (view === lastView) {
    if ($('.board') && scroll.board != null) $('.board').scrollLeft = scroll.board;
    if ($('#cal-scroll') && scroll.cal != null) $('#cal-scroll').scrollTop = scroll.cal;
    if ($('.side-list') && scroll.side != null) $('.side-list').scrollTop = scroll.side;
  } else {
    main.scrollTop = 0;
    document.documentElement.classList.remove('scrolled');
    if (glass()) {
      main.classList.remove('enter-in'); void main.offsetWidth; main.classList.add('enter-in');
      clearTimeout(renderMain.t); renderMain.t = setTimeout(() => main.classList.remove('enter-in'), 800);
    }
    const cs = $('#cal-scroll');
    if (cs) cs.scrollTop = Math.max(0, (new Date().getHours() - 3 - store.settings.dayStart) * HOUR - 14); // Logbuch: die letzten Stunden im Blick
    if (view === 'plan' && isMobile()) $('.col.today')?.scrollIntoView({ inline: 'start', block: 'nearest' });
  }
  lastView = view;
  // Mail: Fenster so hoch wie die Mail, Leseposition beim Neuzeichnen halten
  const fr = main.querySelector('.m-frame');
  if (fr) {
    const rd = main.querySelector('.m-reader'), keep = fr.dataset.id === mailScroll.id ? mailScroll.top : 0;
    fr.addEventListener('load', () => { try { fr.style.height = fr.contentDocument.documentElement.scrollHeight + 'px'; } catch {} if (rd && keep) rd.scrollTop = keep; });
  }
  main.querySelectorAll('.tabs').forEach((tb) => slidePill(tb, 'tabs:' + [...tb.querySelectorAll('button')].map((b) => b.dataset.v || b.textContent).join('|'), '.on', 'seg-pill'));
  applyFlash();
  if (key) {
    const el = main.querySelector(`[data-key="${key}"]`);
    if (el) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(...sel); } catch {} }
  }
  renderNav();
}
let sheetShown = null, sheetCloseT;
const renderSheet = () => {
  const root = $('#sheet-root');
  const t = ui.openTask && store.get('tasks', ui.openTask);
  clearTimeout(sheetCloseT); root.classList.remove('closing');
  if (!t) {
    // Glass: Sheet gleitet raus statt einfach zu verschwinden
    if (sheetShown && glass() && root.innerHTML) { root.classList.add('closing'); sheetCloseT = setTimeout(() => { root.classList.remove('closing'); root.innerHTML = ''; }, 260); }
    else root.innerHTML = '';
    sheetShown = null; return;
  }
  const same = sheetShown === t.id, scroll = same ? $('.sheet-body', root)?.scrollTop : 0;
  root.innerHTML = V.sheetHTML(t);
  root.classList.toggle('stay', same); // gleiche Aufgabe neu gezeichnet (Sync, Änderung): nicht nochmal hereinfedern
  if (scroll) $('.sheet-body', root).scrollTop = scroll;
  dragToClose($('.sheet', root));
  sheetShown = t.id;
};
// Sheet auf dem iPhone nach unten wegziehen (wie bei iOS)
function dragToClose(el) {
  if (!el || !isMobile()) return;
  let y0 = null, dy = 0;
  el.addEventListener('touchstart', (e) => {
    if (!glass() || $('.sheet-body', el)?.scrollTop > 0 || e.target.closest('input, textarea, select, .seg, .files')) return;
    y0 = e.touches[0].clientY; dy = 0; el.style.transition = 'none';
  }, { passive: true });
  el.addEventListener('touchmove', (e) => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); if (dy > 0) el.style.transform = `translateY(${dy}px)`; }, { passive: true });
  el.addEventListener('touchend', () => {
    if (y0 === null) return; y0 = null; el.style.transition = '';
    if (dy > 110) A['close-sheet'](); else el.style.transform = '';
  });
}
// iPhone: „Mehr“ öffnet die übrigen Bereiche als Blatt von unten
function moreHTML() {
  const { view } = route();
  const on = (h) => h === `#${view}` || (view === 'project' && h === '#projects');
  const list = [...navItems(store.settings).slice(BAR), { href: '#settings', label: 'Einstellungen', icon: 'gear' }];
  return `<div class="overlay modal-overlay" data-action="close-modal"></div>
    <div class="more-sheet" role="dialog" aria-label="Mehr">
      <div class="more-grid">${list.map((n) => `<a class="more-item ${on(n.href) ? 'on' : ''}" href="${n.href}" data-action="close-modal-go"><span class="more-ic">${icon(n.icon)}</span><span>${n.label}</span></a>`).join('')}</div>
      <a class="more-edit" href="#settings" data-action="nav-edit">${icon('list')}<span>Leiste anpassen</span></a>
    </div>`;
}
const renderModal = () => {
  if (route().view === 'calendar') renderMain(); // markierte Zeit im Kalender ein-/ausblenden
  $('#modal-root').innerHTML = ui.modal ? (ui.modal.type === 'nav-more' ? moreHTML() : Ml.isCompose(ui.modal) ? Ml.composeHTML(ui.modal) : Lo.isLoanModal(ui.modal) ? Lo.loanModalHTML(ui.modal) : P.isPfModal(ui.modal) ? P.pfModalHTML(ui.modal) : F.isFinModal(ui.modal) ? F.finModalHTML(ui.modal) : V.modalHTML(ui.modal)) : '';
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
  meta.name = 'theme-color'; meta.content = design() === 'hero' ? (isDark() ? '#09090b' : '#f5f5f5') : design() === 'glass' ? (isDark() ? '#0f1112' : '#f1f1ed') : isDark() ? '#121211' : '#f4f3ef';
  document.head.append(meta);
}
darkMQ.addEventListener?.('change', applyTheme);
const renderFocus = () => {
  const t = ui.focusTask && store.get('tasks', ui.focusTask);
  $('#focus-root').innerHTML = t ? V.focusHTML(t) : '';
};
// Auf „Heute“ steht der Timer schon groß oben, dort keine zweite Anzeige
const renderPill = () => { $('#pill-root').innerHTML = route().view === 'today' ? '' : V.timerPill(); };
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

// iPhone: kein Zoomen per Zwei-Finger-Geste (Safari ignoriert user-scalable=no)
['gesturestart', 'gesturechange'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));

store.subscribe(() => { applyTheme(); renderAll(); });
F.onFx(() => { if (route().view === 'finance') renderMain(); }); // Wechselkurse sind da
P.onPrices(() => { if (route().view === 'finance') renderMain(); }); // Krypto-Kurse sind da
Ml.onMail(() => { if (route().view === 'mail') renderMain(); }); // Mails geladen / geändert
window.addEventListener('hashchange', () => { ui.sideOpen = false; T.onNavigate(); renderMain(); renderPill(); applyPendingScroll(); });
let resizeT;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(renderMain, 200); });

// Timer-Anzeige jede Sekunde aktualisieren (ohne alles neu zu zeichnen)
setInterval(() => {
  const r = M.running();
  document.querySelectorAll('[data-tick]').forEach((el) => {
    if (!r) return;
    if (el.dataset.tick === 'task') el.textContent = fmtDur(M.trackedFor(r.taskId));
    else if (el.dataset.tick === 'today') el.textContent = fmtHours(M.trackedToday());
    else if (el.dataset.tick) el.textContent = fmtClock(Date.now() - r.start);
  });
}, 1000);
setInterval(() => { if (['calendar', 'today'].includes(route().view) && !ui.drag && !document.activeElement?.matches?.('input,textarea,select')) renderMain(); }, 60000);

// ---------- Mail senden mit „Rückgängig“ ----------
let pendingSend = null;
function openCompose(c) {
  ui.modal = c; renderModal();
  // Antworten: Schreibmarke über das Zitat, nicht ans Ende
  const b = $('#c-body');
  if (b && document.activeElement === b) { b.setSelectionRange(0, 0); b.scrollTop = 0; }
}
function queueSend(c, p) {
  const who = p.to[0].name || p.to[0].email, more = p.to.length + p.cc.length + p.bcc.length - 1;
  const t = setTimeout(async () => {
    pendingSend = null;
    try {
      const note = await Ml.send(p);
      toast(`Gesendet an ${who}${more > 0 ? ` und ${more} weitere` : ''}.${note ? ' ' + note : ''}`);
    } catch (e) {
      // Nichts geht verloren: Fenster mit allem wieder öffnen
      c.err = e.message === 'auth' ? 'Google-Anmeldung abgelaufen. Klick nochmal auf Senden.' : e.message;
      if (!ui.modal) { ui.modal = c; renderModal(); }
      toast('Nicht gesendet.');
    }
  }, 5000);
  pendingSend = t;
  toast('Wird gesendet …', { label: 'Rückgängig', fn: () => { clearTimeout(t); pendingSend = null; ui.modal = c; renderModal(); } });
}
window.addEventListener('beforeunload', (e) => {
  if (pendingSend || (Ml.isCompose(ui.modal) && (Ml.captureCompose(ui.modal), Ml.composeDirty(ui.modal)))) { e.preventDefault(); e.returnValue = ''; }
});

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

// Nur Wochentage: Sa/So auf dem iPhone überspringen
function skipWeekend(date, dir) {
  if (!store.settings.calWeekdays) return date;
  let d = date;
  while ([0, 6].includes(new Date(d + 'T12:00').getDay())) d = addDays(d, dir);
  return d;
}

// ---------- Klick-Aktionen ----------
const A = {
  go: (el) => { location.hash = el.dataset.href; },
  'toast-action': () => { const fn = $('#toast-root')._action; $('#toast-root').innerHTML = ''; fn?.(); },

  toggle: (el) => {
    const t = store.get('tasks', el.dataset.id);
    const wasDone = t.status === 'done';
    if (!wasDone) flash(t.id, 'check');
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
  // Heute
  finish: (el) => { const t = store.get('tasks', el.dataset.id); M.finishTask(el.dataset.id); toast('Erledigt ✓', { label: 'Rückgängig', fn: () => M.toggleDone(el.dataset.id) }); if (ui.openTask) renderSheet(); },
  'today-top': (el) => { M.moveInToday(el.dataset.id, 'top'); },
  'today-dur': (el) => { ui.todayDur = +el.dataset.v; renderMain(); },
  'toggle-other': () => store.saveSettings({ hideOther: !store.settings.hideOther }),
  'toggle-done': () => store.saveSettings({ hideDone: !store.settings.hideDone }),
  'card-field': (el) => { const f = V.cardFields(); store.saveSettings({ cardFields: { ...f, [el.dataset.k]: !f[el.dataset.k] } }); },
  'pull-today': (el) => { ui.pullOpen = true; store.patch('tasks', el.dataset.id, { date: today(), order: Date.now() }); },
  focus: (el) => { ui.focusTask = el.dataset.id; ui.openTask = null; renderSheet(); renderFocus(); renderPill(); },
  'close-focus': () => { ui.focusTask = null; renderFocus(); renderPill(); },
  'focus-done': (el) => { M.toggleDone(el.dataset.id); ui.focusTask = null; renderFocus(); renderPill(); toast('Stark. Erledigt ✓'); },

  'inbox-tab': (el) => { ui.inboxTab = el.dataset.tab; renderMain(); },
  sort: (el) => store.saveSettings({ sortMode: el.dataset.mode }),
  'plan-nav': (el) => {
    const d = +el.dataset.d;
    ui.planStart = d ? addDays(ui.planStart, d) : today();
    renderMain();
    // Board-Scroll wird beim Neuzeichnen beibehalten, deshalb hier gezielt springen: an den Anfang bzw. zur Heute-Spalte
    const board = $('.board'), col = $('.col.today');
    if (board) board.scrollTo({ left: !d && col ? col.offsetLeft - board.offsetLeft : 0, behavior: 'smooth' });
    if (!d && col) { col.classList.remove('flash'); void col.offsetWidth; col.classList.add('flash'); }
  },
  'cal-nav': (el) => {
    const d = +el.dataset.d;
    if (isMobile()) ui.calDay = skipWeekend(d ? addDays(ui.calDay, d) : today(), d < 0 ? -1 : 1);
    else ui.calStart = d ? addDays(ui.calStart, d) : weekStart(today());
    renderMain();
  },
  // ---- Erinnerungen ----
  'push-on': async () => {
    try {
      if (await Notification.requestPermission() !== 'granted') return toast('Mitteilungen sind nicht erlaubt. In den Systemeinstellungen für die App erlauben.');
      const reg = await navigator.serviceWorker.ready;
      const key = M.pushConfig()?.vapidPublic;
      if (!key) return toast('Erst den Erinnerungs-Dienst einrichten.');
      const bin = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
      let sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe().catch(() => {}); // frisch mit aktuellem Schlüssel
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bin });
      const j = sub.toJSON();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(j.endpoint)))).slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
      const id = 'push-' + hash;
      const ua = navigator.userAgent;
      const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Mac/.test(ua) ? 'Mac' : 'Browser';
      store.put('meta', { id, endpoint: j.endpoint, keys: j.keys, device, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
      ui.pushId = id; try { localStorage.setItem('push-id', id); } catch {}
      renderMain(); toast('Erinnerungen auf diesem Gerät aktiv ✓');
    } catch (e) { toast('Hat nicht geklappt: ' + e.message); }
  },
  'push-off': async () => {
    try { const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription(); await sub?.unsubscribe(); } catch {}
    if (ui.pushId) store.remove('meta', ui.pushId);
    ui.pushId = null; try { localStorage.removeItem('push-id'); } catch {}
    renderMain(); toast('Auf diesem Gerät ausgeschaltet.');
  },
  'push-test': () => { store.put('meta', { id: 'pushtest', at: Date.now() }); toast('Test kommt in ca. 1 Minute auf allen aktiven Geräten.'); },
  'push-enabled': (el) => { M.setPushPrefs({ enabled: el.dataset.v === '1' }); renderMain(); },
  'menubar': (el) => { M.setMenubar(el.dataset.k, el.dataset.v === '1'); renderMain(); },
  'plan-weekends': (el) => store.saveSettings({ planWeekends: el.dataset.v === '1' }),
  'cal-weekdays': (el) => {
    store.saveSettings({ calWeekdays: el.dataset.v === '1' });
    if (isMobile()) { ui.calDay = skipWeekend(ui.calDay, 1); renderMain(); }
  },
  'review-nav': (el) => { const d = +el.dataset.d; ui.reviewWeek = d ? addDays(ui.reviewWeek, d) : weekStart(today()); renderMain(); },
  'toggle-nav': () => store.saveSettings({ navCollapsed: !store.settings.navCollapsed }),
  theme: (el) => store.saveSettings({ theme: el.dataset.v }),
  design: (el) => setDesign(el.dataset.v),
  'toggle-nav-proj': () => store.saveSettings({ navProjHidden: !store.settings.navProjHidden }),
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
    let repeat = $('#b-repeat').value;
    if (repeat === 'days') repeat = `days:${[...document.querySelectorAll('#b-days button.on')].map((x) => x.dataset.d).join(',')}`;
    const v = { date: $('#b-date').value, start: $('#b-start').value, end: $('#b-end').value, label: $('#b-label').value.trim(), repeat };
    if (!v.date || !v.start || !v.end || v.end === v.start) return toast('Bitte Datum, Start und Ende angeben.');
    store.put('blocks', { ...b, ...v });
    ui.modal = null; renderModal();
  },
  'task-repeat-day': (el) => {
    const t = store.get('tasks', ui.openTask), d = +el.dataset.d, cur = M.repeatDays(t.repeat) || [];
    const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort();
    if (!next.length) return toast('Mindestens ein Tag muss ausgewählt sein.');
    store.patch('tasks', t.id, { repeat: `days:${next.join(',')}` });
    renderSheet();
  },
  'block-repeat-day': (el) => {
    const on = el.parentElement.querySelectorAll('button.on');
    if (on.length === 1 && el.classList.contains('on')) return toast('Mindestens ein Tag muss ausgewählt sein.');
    el.classList.toggle('on');
  },
  // ---- Finanzen: Abos ----
  'fin-view': (el) => { ui.finView = el.dataset.v; renderMain(); },
  'fin-month': (el) => { const d = +el.dataset.d; ui.finMonth = d ? F.monthShift(ui.finMonth || F.monthStart(today()), d) : F.monthStart(today()); renderMain(); },
  'fin-range': (el) => { ui.finRange = +el.dataset.v; renderMain(); },
  'fin-cat': (el) => { ui.finCat = el.dataset.c; renderMain(); },
  'fin-list-tab': (el) => { ui.finListTab = el.dataset.v; renderMain(); },
  'fin-day': (el) => { ui.modal = { type: 'fin-day', date: el.dataset.date }; renderModal(); },
  'new-sub': (el) => { ui.modal = { type: 'sub', sub: { anchor: el.dataset.date || today(), currency: F.baseCur(), cycle: 'month' } }; renderModal(); },
  'edit-sub': (el) => { const s = store.get('subs', el.dataset.id); if (s) { ui.modal = { type: 'sub', sub: { ...s } }; renderModal(); } },
  'save-sub': () => {
    const r = F.readSubForm(ui.modal.sub);
    if (r.error) return toast(r.error);
    store.put('subs', r.sub);
    ui.modal = null; renderModal();
  },
  'delete-sub': (el) => {
    if (!confirm('Abo löschen? Tipp: Mit „Gekündigt zum“ bleibt es in den Ausgaben der letzten Monate sichtbar.')) return;
    store.remove('subs', el.dataset.id); ui.modal = null; renderModal();
  },
  // ---- Finanzen: Kredite ----
  'new-loan': () => { ui.modal = { type: 'loan', l: { currency: F.baseCur(), cycle: 'month', extra: [] } }; renderModal(); },
  'edit-loan': (el) => { const l = store.get('loans', el.dataset.id); if (l) { ui.modal = { type: 'loan', l: { ...l, extra: [...(l.extra || [])] } }; renderModal(); } },
  'loan-toggle': (el) => { ui.loanOpen = ui.loanOpen === el.dataset.id ? null : el.dataset.id; renderMain(); },
  'loan-extra-add': () => { const err = Lo.addExtra(ui.modal); if (err) return toast(err); renderModal(); },
  'loan-extra-del': (el) => { Lo.delExtra(ui.modal, +el.dataset.i); renderModal(); },
  'save-loan': () => {
    const r = Lo.readLoanForm(ui.modal);
    if (r.error) return toast(r.error);
    store.put('loans', r.loan);
    ui.modal = null; renderModal();
    if (!r.loan.id && store.all('loans').length === 1) toast('Gespeichert. Die Raten stehen jetzt auch im Abo-Kalender.');
  },
  'delete-loan': (el) => {
    const l = store.get('loans', el.dataset.id);
    if (!l || !confirm(`„${l.name}“ löschen?`)) return;
    store.remove('loans', l.id); ui.modal = null; renderModal();
    toast('Kredit gelöscht.', { label: 'Rückgängig', fn: () => store.put('loans', l) });
  },
  'fin-task': (el) => {
    const t = M.addTask(el.dataset.title, { date: el.dataset.date, duration: 15, subRef: el.dataset.ref });
    if (t) toast('Aufgabe angelegt.', { label: 'Öffnen', fn: () => { ui.openTask = t.id; renderSheet(); } });
  },
  // ---- Navigation: Reihenfolge ----
  'nav-more': () => { ui.modal = { type: 'nav-more' }; renderModal(); },
  'nav-edit': () => { ui.modal = null; renderModal(); location.hash = '#settings'; setTimeout(() => $('#nav-order')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80); },
  'nav-move': (el) => {
    const items = navItems(store.settings).map((n) => n.href), i = items.indexOf(el.dataset.href), j = i + +el.dataset.d;
    if (i < 0 || j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    store.saveSettings({ navOrder: items });
  },
  'nav-reset': () => store.saveSettings({ navOrder: [] }),
  // ---- Mail (Gmail + Apple Mail) ----
  'mail-cid-save': () => {
    const v = ($('#gm-cid')?.value || '').trim();
    if (!/\.apps\.googleusercontent\.com$/.test(v)) return toast('Das sieht nicht nach einer Client-ID aus (endet auf .apps.googleusercontent.com).');
    ui.mailCidEdit = false; store.saveSettings({ gmailClientId: v });
  },
  'mail-cid-edit': () => { ui.mailCidEdit = true; renderMain(); },
  'mail-signin': async () => { try { await Ml.signIn(); } catch (e) { toast(e.message); renderMain(); } },
  'mail-signout': () => { if (confirm('Gmail auf diesem Gerät trennen? Deine Mails bleiben in Gmail.')) Ml.signOut(); },
  'mail-refresh': () => Ml.refresh(),
  'mail-accounts': () => { ui.mailSetup = true; ui.mailOpen = null; renderMain(); },
  'mail-accounts-go': () => { ui.mailSetup = true; ui.mailOpen = null; if (route().view === 'mail') renderMain(); else location.hash = '#mail'; },
  'mail-setup-done': () => { ui.mailSetup = false; renderMain(); },
  'mail-box': (el) => { ui.mailBox = el.dataset.v; renderMain(); },
  'ic-connect': () => Ml.icConnect(),
  'ic-refresh': () => Ml.icRetry(),
  'ic-disconnect': () => { if (confirm('Apple Mail auf diesem Gerät trennen? Deine Mails bleiben in iCloud. Das Passwort bleibt im Schlüsselbund deines Macs (entfernen: siehe APPLEMAIL.md).')) Ml.icDisconnect(); },
  'mail-filter': (el) => { ui.mailFilter = el.dataset.v; renderMain(); },
  'mail-open': (el) => { if (ui.mailOpen === el.dataset.id && !isMobile()) { ui.mailOpen = null; renderMain(); } else Ml.openMail(el.dataset.id); },
  'mail-close': () => { ui.mailOpen = null; renderMain(); },
  'mail-imgs': (el) => { Ml.st.imgs[el.dataset.id] = true; renderMain(); },
  'mail-unread': async (el) => { ui.mailOpen = null; try { await Ml.setUnread(el.dataset.id, true); } catch (e) { toast(e.message === 'auth' ? 'Google-Anmeldung abgelaufen.' : e.message); } },
  'mail-archive': async (el) => {
    try {
      const r = await Ml.archive(el.dataset.id);
      if (r) toast('Archiviert.', { label: 'Rückgängig', fn: () => Ml.unarchive(r).catch((e) => toast(e.message)) });
    } catch (e) { toast(e.message === 'auth' ? 'Google-Anmeldung abgelaufen.' : e.message); }
  },
  // Schreiben / Antworten / Weiterleiten (Gmail). Nach „Senden“ 5 Sekunden Zeit für „Rückgängig“.
  'mail-compose': () => openCompose(Ml.composeFor('new')),
  'mail-reply': (el) => openCompose(Ml.composeFor('reply', el.dataset.id)),
  'mail-replyall': (el) => openCompose(Ml.composeFor('all', el.dataset.id)),
  'mail-forward': (el) => openCompose(Ml.composeFor('fwd', el.dataset.id)),
  'compose-cc': () => { Ml.captureCompose(ui.modal); ui.modal.showCc = true; renderModal(); $('#c-cc')?.focus(); },
  'compose-pick': (el) => Ml.composePick(+el.dataset.i),
  'compose-close': () => {
    const c = ui.modal; if (!Ml.isCompose(c)) return;
    Ml.captureCompose(c);
    if (Ml.composeDirty(c) && !confirm('Entwurf verwerfen? Er wird nirgends gespeichert.')) return;
    ui.modal = null; renderModal();
  },
  'compose-send': async () => {
    const c = ui.modal; if (!Ml.isCompose(c)) return;
    Ml.captureCompose(c);
    let p;
    try { p = Ml.prepareSend(c); } catch (e) { c.err = e.message; renderModal(); return; }
    // Abgelaufene Google-Anmeldung direkt aus diesem Klick erneuern (Pop-up braucht einen Klick)
    if (p.src !== 'ic' && !Ml.hasToken()) { try { await Ml.signIn(); } catch (e) { c.err = e.message; if (ui.modal === c) renderModal(); return; } }
    if (!p.subject && !confirm('Ohne Betreff senden?')) return;
    c.err = null; ui.modal = null; renderModal();
    queueSend(c, p);
  },
  'mail-task': (el) => {
    const m = Ml.mailById(el.dataset.id);
    if (!m) return;
    const t = M.addTask(m.subject, { notes: `Mail von ${m.from.name} <${m.from.email}>${Ml.mailLink(m) ? '\n' + Ml.mailLink(m) : ''}`, duration: 15 });
    if (t) toast('Aufgabe angelegt (ohne Datum).', { label: 'Öffnen', fn: () => { ui.openTask = t.id; renderSheet(); } });
  },
  // ---- Tabs oben (Mac) ----
  'tab-select': (el) => { if (el.dataset.tab !== T.active().id) tabSwitch(() => T.select(el.dataset.tab)); },
  'tab-close': (el) => {
    let r = null;
    tabSwitch(() => { r = T.close(el.dataset.tab); return r ? r.changed : false; });
    if (r) toast('Tab geschlossen.', { label: 'Rückgängig', fn: () => tabSwitch(() => T.restore(r)) });
  },
  'tab-new': () => openTab('#today'),
  'tab-back': () => tabSwitch(() => T.back()),
  'tab-fwd': () => tabSwitch(() => T.forward()),
  'tabs-on': (el) => { T.setEnabled(el.dataset.v === '1'); renderMain(); },
  // ---- Finanzen: Portfolio ----
  'fin-area': (el) => { location.hash = '#' + el.dataset.v; },
  'pf-range': (el) => { ui.pfRange = +el.dataset.v; renderMain(); },
  'new-holding': () => { ui.modal = { type: 'holding', h: { kind: 'crypto' } }; renderModal(); },
  'edit-holding': (el) => { const h = store.get('holdings', el.dataset.id); if (h) { ui.modal = { type: 'holding', h: { ...h, prices: [...(h.prices || [])] } }; renderModal(); } },
  'hold-kind': (el) => {
    const m = ui.modal; P.captureHolding(m);
    if (m.h.kind === 'crypto' && el.dataset.v !== 'crypto') Object.assign(m.h, { cgId: null, image: null, name: '', symbol: '' }); // Münze passt nicht zu Aktie/Bargeld
    m.h.kind = el.dataset.v; m.err = null; m.results = null; renderModal();
  },
  'hold-search': async () => {
    P.captureHolding(ui.modal);
    const m = ui.modal, q = (m.q || '').trim();
    if (!q) return toast('Bitte einen Namen oder ein Kürzel eingeben.');
    m.err = null;
    try { m.results = await P.searchCoins(q); } catch (e) { m.results = null; m.err = e.message || 'Suche fehlgeschlagen.'; }
    if (ui.modal === m) renderModal();
  },
  'hold-pick': (el) => { P.captureHolding(ui.modal); P.pickCoin(ui.modal, +el.dataset.i); renderModal(); $('#h-qty')?.focus(); },
  'hold-unpick': () => { P.captureHolding(ui.modal); Object.assign(ui.modal.h, { cgId: null, image: null }); ui.modal.results = null; renderModal(); },
  'save-holding': () => {
    const r = P.finishHolding(ui.modal);
    if (r.error) return toast(r.error);
    store.put('holdings', r.h);
    ui.modal = null; renderModal();
  },
  'delete-holding': (el) => {
    if (!confirm('Position löschen?')) return;
    const h = store.get('holdings', el.dataset.id);
    store.remove('holdings', el.dataset.id); ui.modal = null; renderModal();
    if (h) toast('Position gelöscht.', { label: 'Rückgängig', fn: () => store.put('holdings', h) });
  },
  'delete-block': (el) => { store.remove('blocks', el.dataset.id); ui.modal = null; renderModal(); },
  'cal-slot': (el, e) => {
    if (suppressSlotClick) { suppressSlotClick = false; return; }
    const min = slotMin(el, e.clientY, Math.floor);
    const [date, m] = norm(el.dataset.date, min);
    ui.modal = { type: 'slot', date, time: fromMin(m), dur: 60, title: '', colDate: el.dataset.date, colMin: min };
    renderModal();
  },
  'slot-task': () => {
    const m = ui.modal, title = $('#slot-title').value;
    if (!title.trim()) return toast('Bitte einen Titel eingeben.');
    M.addTask(title, { date: m.date, time: m.time, duration: m.dur, projectId: $('#slot-proj')?.value || null });
    ui.modal = null; renderModal();
  },
  // Nachtragen: Was habe ich in dieser (vergangenen) Zeit gemacht? → erledigte Aufgabe + Zeiteintrag
  'slot-log': () => {
    const m = ui.modal, title = $('#slot-title').value.trim();
    if (!title) return toast('Bitte eintragen, was du gemacht hast.');
    const start = new Date(m.date + 'T00:00').getTime() + toMin(m.time) * 60000, end = start + m.dur * 60000;
    store.batch(() => {
      const pid = $('#slot-proj')?.value || null;
      const t = M.addTask(title, { date: toDateStr(new Date(start)), duration: m.dur, status: 'done', doneAt: end, projectId: pid });
      store.put('entries', { taskId: t.id, projectId: pid, start, end });
    });
    ui.modal = null; renderModal(); toast('Nachgetragen ✓');
  },
  'edit-entry': (el) => { ui.modal = { type: 'entry', id: el.dataset.id }; renderModal(); },
  'entry-save': () => {
    const en = store.get('entries', ui.modal.id);
    if (!en) return;
    const day = new Date(en.start); day.setHours(0, 0, 0, 0);
    const at = (v) => day.getTime() + toMin(v) * 60000;
    const s = $('#en-start').value, e = $('#en-end').value;
    if (!s) return toast('Bitte eine Startzeit eingeben.');
    const start = at(s);
    let end = en.end ? (e ? at(e) : en.end) : null;
    if (end !== null && end <= start) end += 864e5; // über Mitternacht
    store.patch('entries', en.id, { start, end });
    ui.modal = null; renderModal(); toast('Gespeichert ✓');
  },
  'entry-del': () => { const id = ui.modal.id; const en = store.get('entries', id); store.remove('entries', id); ui.modal = null; renderModal(); toast('Eintrag gelöscht.', { label: 'Rückgängig', fn: () => store.put('entries', en) }); },
  'close-modal-open': (el) => { ui.modal = null; renderModal(); ui.openTask = el.dataset.id; renderSheet(); },
  'slot-block': () => {
    const m = ui.modal;
    store.put('blocks', { date: m.date, start: m.time, end: fromMin((toMin(m.time) + m.dur) % (24 * 60)), label: $('#slot-title').value.trim() || 'Gesperrt', repeat: '' });
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
  'archive-project': (el) => { store.patch('projects', el.dataset.id, { archived: true }); ui.projTab = 'active'; location.hash = '#projects'; toast('Projekt abgeschlossen 🎉', { label: 'Rückgängig', fn: () => store.patch('projects', el.dataset.id, { archived: false }) }); },
  'unarchive-project': (el) => { store.patch('projects', el.dataset.id, { archived: false }); toast('Projekt ist wieder aktiv.'); },
  'proj-tab': (el) => { ui.projTab = el.dataset.tab; renderMain(); },
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
  'ai-quick': (el) => {
    const t = store.get('tasks', el.dataset.id);
    if (!M.canUseHelper()) return A['ai-task'](el); // ohne Sync: Auftrag kopieren + claude.ai öffnen
    M.sendTaskToClaude(t);
    toast(M.helperOnline() ? `An Claude: ${t.title}` : 'Gespeichert. Startet, sobald der Mac-Helfer läuft.');
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
  'wipe-tasks': () => {
    const n = M.tasks().length;
    if (!n) return toast('Es gibt keine Aufgaben.');
    if (!confirm(`Wirklich alle ${n} Aufgaben löschen? Projekte und Sperrzeiten bleiben. Vorher wird ein Backup heruntergeladen.`)) return;
    A.export();
    store.batch(() => {
      if (M.running()) M.stopTimer();
      ['tasks', 'entries', 'files', 'jobs'].forEach((c) => Object.keys(store.state[c]).forEach((id) => store.remove(c, id)));
    });
    ui.openTask = null; renderSheet();
    toast(`${n} Aufgaben gelöscht. Backup liegt in deinen Downloads.`);
  },
  'seed-demo': () => { M.seedDemo(); toast('Beispieldaten geladen.'); },
  'close-modal': () => { if (Ml.isCompose(ui.modal)) return A['compose-close'](); const m = ui.modal; ui.modal = null; renderModal(); if (m?.type === 'repeat-move') { renderMain(); renderSheet(); } },
  'repeat-move': (el) => {
    const m = ui.modal; ui.modal = null; renderModal();
    if (el.dataset.mode === 'one') { const c = M.moveOneOccurrence(m.id, m.occ, m.changes); if (ui.openTask === m.id && c) ui.openTask = c.id; toast('Nur dieser Termin wurde verschoben.'); }
    else { M.moveSeries(m.id, m.occ, m.changes); toast('Alle Termine wurden verschoben.'); }
    renderSheet();
  },
  'close-modal-go': (el) => { ui.modal = null; renderModal(); location.hash = el.getAttribute('href'); },
  // Dauer wählen, ohne neu zu zeichnen (sonst wäre der getippte Titel weg)
  'quick-dur': (el) => {
    ui.modal.dur = +el.dataset.v;
    el.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
    $('#quick-title')?.focus();
  },
  'quick-save': () => {
    const v = $('#quick-title').value;
    if (!v.trim()) return toast('Bitte einen Titel eingeben.');
    M.addToday(v, { duration: ui.modal?.dur || 60, projectId: $('#quick-proj')?.value || null }, 'bottom');
    ui.modal = null; renderModal();
    toast('Für heute eingetragen ✓');
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

// Tabs: Cmd/Strg-Klick oder Mittelklick auf einen Link in der Seitenleiste öffnet ihn in einem neuen Tab,
// Mittelklick auf einen Tab schließt ihn
const tabsActive = () => T.enabled() && desktop();
document.addEventListener('click', (e) => {
  if (!(e.metaKey || e.ctrlKey) || !tabsActive()) return;
  const a = e.target.closest('#sidebar a[href^="#"], #main a[href^="#"]');
  if (!a) return;
  e.preventDefault(); e.stopPropagation();
  openTab(a.getAttribute('href'));
}, true);
document.addEventListener('auxclick', (e) => {
  if (e.button !== 1 || !tabsActive()) return;
  const tab = e.target.closest('.ts-tab');
  if (tab) { e.preventDefault(); if (T.list().length > 1) A['tab-close']({ dataset: { tab: tab.dataset.tab } }); return; }
  const a = e.target.closest('#sidebar a[href^="#"], #main a[href^="#"]');
  if (a) { e.preventDefault(); openTab(a.getAttribute('href')); }
});
document.addEventListener('mousedown', (e) => { if (e.button === 1 && e.target.closest('.ts-tab, #sidebar a, #main a[href^="#"]')) e.preventDefault(); }); // kein Auto-Scroll beim Mittelklick
// Seitenleiste: Bereiche per Ziehen umsortieren (Mac)
let navDrag = null;
const side = $('#sidebar');
side.addEventListener('dragstart', (e) => {
  const a = e.target.closest?.('[data-nav]');
  if (!a) return;
  navDrag = a.dataset.nav;
  e.dataTransfer.setData('text/plain', navDrag);
  e.dataTransfer.effectAllowed = 'move';
  requestAnimationFrame(() => a.classList.add('dragging'));
});
side.addEventListener('dragover', (e) => {
  if (!navDrag) return;
  e.preventDefault();
  const items = [...side.querySelectorAll('[data-nav]')];
  const before = items.find((a) => { const r = a.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
  items.forEach((a) => a.classList.remove('drop-before', 'drop-after'));
  if (before) before.classList.add('drop-before'); else items[items.length - 1]?.classList.add('drop-after');
  side.dataset.before = before ? before.dataset.nav : '';
});
side.addEventListener('drop', (e) => {
  if (!navDrag) return;
  e.preventDefault();
  const before = side.dataset.before || null;
  if (before !== navDrag) store.saveSettings({ navOrder: reorder(store.settings, navDrag, before) });
});
side.addEventListener('dragend', () => {
  navDrag = null; delete side.dataset.before;
  side.querySelectorAll('.drop-before, .drop-after, .dragging').forEach((a) => a.classList.remove('drop-before', 'drop-after', 'dragging'));
});
// Tabs umsortieren per Ziehen
let tabDrag = null;
const tabStrip = $('#tabstrip');
tabStrip.addEventListener('dragstart', (e) => {
  const t = e.target.closest('.ts-tab');
  if (!t) return;
  tabDrag = t.dataset.tab;
  e.dataTransfer.setData('text/plain', 'tab');
  e.dataTransfer.effectAllowed = 'move';
  requestAnimationFrame(() => t.classList.add('dragging'));
});
tabStrip.addEventListener('dragover', (e) => {
  if (!tabDrag) return;
  e.preventDefault();
  const tabs = [...tabStrip.querySelectorAll('.ts-tab')];
  const before = tabs.find((t) => { const r = t.getBoundingClientRect(); return e.clientX < r.left + r.width / 2; });
  const id = before ? before.dataset.tab : null;
  tabs.forEach((t) => t.classList.toggle('drop-before', !!before && t === before && t.dataset.tab !== tabDrag));
  tabStrip.querySelector('.ts-tabs').classList.toggle('drop-end', !before);
  tabStrip.dataset.before = id || '';
});
tabStrip.addEventListener('drop', (e) => {
  if (!tabDrag) return;
  e.preventDefault();
  T.move(tabDrag, tabStrip.dataset.before || null);
});
tabStrip.addEventListener('dragend', () => { tabDrag = null; delete tabStrip.dataset.before; renderTabs(); });

// ---------- Tippen ----------
document.addEventListener('keydown', (e) => {
  const el = e.target;
  if (ui.recordKey) return recordKey(e);
  if (Ml.isCompose(ui.modal)) {
    if (Ml.composeKey(e)) return;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); A['compose-send'](); return; }
  }
  if (e.key === 'Escape') {
    if (ui.modal) A['close-modal'](); else if (ui.openTask) A['close-sheet'](); else if (ui.focusTask) A['close-focus']();
    return;
  }
  if (shortcut(e)) return;
  if (e.key !== 'Enter' || e.isComposing) return;
  if (el.dataset.add) {
    e.preventDefault();
    if (el.dataset.add === 'today-proj' || el.dataset.add === 'today-other') {
      const pid = el.dataset.add === 'today-proj' ? ($('#today-proj')?.value || null) : null;
      const nt = M.addToday(el.value, { projectId: pid, duration: ui.todayDur || 60 }, 'bottom');
      if (nt) { el.value = ''; flash(nt.id); renderMain(); }
      return;
    }
    const extra = el.dataset.add === 'today' ? { date: today() } : el.dataset.add === 'day' ? { date: el.dataset.date } : el.dataset.add === 'project' ? { projectId: el.dataset.project } : {};
    const nt = M.addTask(el.value, extra);
    if (nt) { el.value = ''; flash(nt.id); renderMain(); }
  } else if (el.id === 'login-pass') A['sign-in']();
  else if (el.id === 'slot-title') A['slot-task']();
  else if (el.id === 'p-name') A['save-project']();
  else if (el.id === 'quick-title') A['quick-save']();
  else if (el.id === 'gm-cid') A['mail-cid-save']();
  else if (el.id === 'h-search') A['hold-search']();
  else if (el.closest('.pf-modal') && el.tagName === 'INPUT') A['save-holding']();
  else if (el.closest('.loan-modal')) { if (/^lx-/.test(el.id)) A['loan-extra-add'](); else if (el.tagName === 'INPUT') A['save-loan'](); }
  else if (el.closest('.fin-modal') && el.tagName === 'INPUT' && el.type !== 'checkbox') A['save-sub']();
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
  const navTo = { heute: '#today', inbox: '#inbox', plan: '#plan', calendar: '#calendar', projects: '#projects', review: '#review', finance: '#finance', settings: '#settings' };
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
    weekend: () => view === 'calendar' && A['cal-weekdays']({ dataset: { v: store.settings.calWeekdays ? '0' : '1' } }),
    done: () => ui.openTask && A.toggle({ dataset: { id: ui.openTask } }),
    focus: () => ui.openTask && A.focus({ dataset: { id: ui.openTask } }),
    help: () => { ui.modal = { type: 'keys' }; renderModal(); },
    tabnew: () => T.enabled() && desktop() && A['tab-new'](),
    tabclose: () => T.enabled() && desktop() && T.list().length > 1 && A['tab-close']({ dataset: { tab: T.active().id } }),
    tabnext: () => T.enabled() && desktop() && tabSwitch(() => T.cycle(1)),
  };
  e.preventDefault();
  if (navTo[id]) { ui.openTask = null; renderSheet(); location.hash = navTo[id]; } else run[id]?.();
  return true;
}

// Minuten nach Mitternacht gehören zum nächsten Tag (Kalendertag kann z. B. bis 02:00 gehen)
const norm = (date, min) => (min >= 24 * 60 ? [addDays(date, 1), min - 24 * 60] : [date, min]);

// ---------- Kalender: Zeitraum mit der Maus aufziehen (wie Google Calendar) ----------
let suppressSlotClick = false;
const slotMin = (dayEl, y, round = Math.round) => {
  const s = store.settings;
  const min = s.dayStart * 60 + round((((y - dayEl.getBoundingClientRect().top) / HOUR) * 60) / 15) * 15;
  return Math.max(s.dayStart * 60, Math.min(min, s.dayEnd * 60));
};
// Termin / Eintrag im Kalender am unteren Rand länger oder kürzer ziehen
document.addEventListener('pointerdown', (e) => {
  const h = e.target.closest?.('[data-resize]');
  if (!h || e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const ev = h.closest('.ev'), kind = h.dataset.resize, id = h.dataset.id;
  ev.draggable = false; ev.classList.add('resizing');
  const en = kind === 'entry' ? store.get('entries', id) : null;
  const base = kind === 'entry' ? Math.round((en.end - en.start) / 60000) : (store.get('tasks', id)?.duration || 60);
  const y0 = e.clientY, h0 = ev.offsetHeight;
  let dur = base;
  const lbl = document.createElement('div'); lbl.className = 'rs-lbl'; lbl.textContent = fmtMinutes(base); ev.appendChild(lbl);
  const move = (m) => {
    dur = Math.max(15, Math.round((base + ((m.clientY - y0) / HOUR) * 60) / 15) * 15);
    ev.style.height = `${Math.max(22, h0 + ((dur - base) * HOUR) / 60)}px`;
    lbl.textContent = fmtMinutes(dur);
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    const stop = (c) => { c.stopPropagation(); c.preventDefault(); };
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 300);
    if (dur === base) return renderMain();
    if (kind === 'entry') store.patch('entries', id, { end: en.start + dur * 60000 });
    else store.patch('tasks', id, { duration: dur });
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
});
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
    const [d2, m2] = norm(date, sel.s);
    ui.modal = { type: 'slot', date: d2, time: fromMin(m2), dur: sel.e - sel.s, title: '', colDate: date, colMin: sel.s };
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
  if (el.closest?.('.compose')) Ml.composeInput(el);
  if (el.closest?.('.loan-modal') && !/^lx-/.test(el.id) && Lo.isLoanModal(ui.modal)) Lo.updatePreview(ui.modal);
  if (el.dataset.field === 'notes') saveNotes(ui.openTask, el.value);
  if (el.dataset.pfield) saveProjectField(el.dataset.id, el.dataset.pfield, el.value);
});

document.addEventListener('focusin', (e) => { if (Ml.isCompose(ui.modal)) Ml.composeBlur(e.target); });

document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.id === 'slot-proj' && ui.modal) { ui.modal.projectId = el.value; return; }
  if (el.id === 'slot-dur' && ui.modal) { ui.modal.dur = +el.value; ui.modal.projectId = $('#slot-proj')?.value || ''; renderModal(); return; }
  if (el.id === 'today-proj') { ui.todayProj = el.value; return; }
  const f = el.dataset.field;
  if (f && ui.openTask) {
    const id = ui.openTask;
    let v = el.value;
    if (f === 'title') { if (!v.trim()) return; v = v.trim(); }
    if (f === 'notes') return;
    if (f === 'projectId' && v === '__new') { el.value = store.get('tasks', id).projectId || ''; return A['new-project']({ dataset: { fromTask: id } }); }
    if (f === 'duration') v = +v;
    if (f === 'remind') v = v === '' ? null : +v;
    if (f === 'repeat') {
      const t = store.get('tasks', id);
      if (v === 'days') v = M.repeatDays(t.repeat) ? t.repeat : `days:${weekday(t.date || today())}`;
      store.patch('tasks', id, { repeat: v, ...(v && !t.date ? { date: today() } : {}) });
      return renderSheet();
    }
    if (f === 'date' || f === 'time' || f === 'projectId') v = v || null;
    const changes = { [f]: v };
    if (f === 'time' && v && !store.get('tasks', id).date) changes.date = today();
    // Wiederkehrend + Datum/Uhrzeit: erst fragen (nach dem Schließen des Pickers), ob nur dieser Termin oder alle
    if ((f === 'date' || f === 'time') && v && store.get('tasks', id).repeat) {
      const ask = () => { const val = el.value || null; if (val) scheduleChange(id, null, { ...changes, [f]: val }); else renderSheet(); };
      if (document.activeElement === el) { if (!el.dataset.pending) { el.dataset.pending = '1'; el.addEventListener('blur', ask, { once: true }); } } else ask();
      return;
    }
    store.patch('tasks', id, changes);
    // Neu zeichnen erst, wenn die Auswahl zu ist (sonst schließt iOS den Datums-/Uhrzeit-Picker sofort wieder)
    if (f === 'date' || f === 'time') { if (document.activeElement === el) el.addEventListener('blur', () => { if (ui.openTask === id) renderSheet(); }, { once: true }); else renderSheet(); }
    return;
  }
  if (el.id === 'b-repeat') { $('#b-days').hidden = el.value !== 'days'; return; }
  if (el.id === 'push-lead') { M.setPushPrefs({ lead: +el.value }); return; }
  if (el.id === 'base-cur') { store.saveSettings({ baseCurrency: el.value }); return; }
  if (el.dataset.setting) {
    const v = +el.value;
    const st = el.dataset.setting === 'dayStart' ? v : store.settings.dayStart, en = el.dataset.setting === 'dayEnd' ? v : store.settings.dayEnd;
    if ((el.dataset.setting === 'dayEnd' || el.dataset.setting === 'dayStart') && (en <= st || en - 24 > st)) { renderMain(); return toast('Der Tag darf höchstens 24 Stunden lang sein und muss nach dem Beginn enden.'); }
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

// Termin ändern. Bei wiederkehrenden Aufgaben erst fragen: nur diesen Termin oder alle?
function scheduleChange(id, occ, changes) {
  const t = store.get('tasks', id);
  if (!t) return;
  occ = occ || t.date;
  const moved = Object.keys(changes).some((k) => (k === 'date' ? changes.date !== occ : changes[k] !== t[k]));
  if (!t.repeat || !moved || !changes.date && !changes.time) return store.patch('tasks', id, changes);
  ui.modal = { type: 'repeat-move', id, occ, changes };
  renderModal();
}

// ---------- Drag & Drop (Mac) ----------
document.addEventListener('dragstart', (e) => {
  const el = e.target.closest?.('[data-drag]');
  if (!el) return;
  let offsetMin = 0;
  if (el.classList.contains('ev')) offsetMin = Math.floor((((e.clientY - el.getBoundingClientRect().top) / HOUR) * 60) / 15) * 15;
  ui.drag = { id: el.dataset.id, offsetMin, occ: el.dataset.occ || null };
  e.dataTransfer.setData('text/plain', el.dataset.id);
  e.dataTransfer.effectAllowed = 'move';
  requestAnimationFrame(() => el.classList.add('dragging'));
});
const dropTarget = (e) => e.target.closest?.('[data-drop-card],[data-drop-plan],[data-drop-day],[data-drop-cal],[data-drop-inbox],[data-drop-today]');
// Zielzeit beim Ziehen in eine Kalender-Spalte (auf 15 Min gerastert)
const dropMin = (t, e) => {
  const rect = t.getBoundingClientRect();
  const min = store.settings.dayStart * 60 + Math.round(((((e.clientY - rect.top) / HOUR) * 60) - ui.drag.offsetMin) / 15) * 15;
  return Math.max(store.settings.dayStart * 60, Math.min(min, store.settings.dayEnd * 60 - 15));
};
const clearGhost = () => document.querySelectorAll('.drop-ghost,.drop-line').forEach((g) => g.remove());
// Plan-Board: Linie zeigt, wo die Karte landet (danach gilt "Eigene", dort ist alles frei sortierbar).
function planInsert(t, e) {
  const col = t.closest('.col[data-drop-day]');
  if (!col || !ui.drag) return null;
  const d = col.dataset.dropDay, task = store.get('tasks', ui.drag.id);
  if (!task || ui.drag.occ || (task.repeat && task.date !== d)) return null; // Wiederholung an anderen Tag: fragt nach
  if (store.settings.sortMode !== 'manual' && task.date !== d) return null; // Prio/Zeit sortiert selbst: nur Spalte zeigen
  const cards = [...col.querySelectorAll('.card[data-drop-plan]')].filter((c) => c.dataset.id !== task.id);
  const before = cards.find((c) => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; }) || null;
  let line = document.querySelector('.drop-line');
  if (!line) { line = document.createElement('div'); line.className = 'drop-line'; }
  if (before) before.before(line);
  else if (cards.length) cards[cards.length - 1].after(line);
  else ([...col.querySelectorAll('.card[data-occ]')].pop() || col.querySelector('.col-add')).after(line);
  return { date: d, before: before?.dataset.id || null };
}
document.addEventListener('dragover', (e) => {
  const t = dropTarget(e);
  if (!t || !ui.drag) return;
  e.preventDefault();
  const pi = planInsert(t, e);
  ui.drag.plan = pi;
  const hl = pi ? t.closest('.col') : t;
  document.querySelectorAll('.drag-over').forEach((x) => x !== hl && x.classList.remove('drag-over'));
  if (!pi) { document.querySelector('.drop-line')?.remove(); hl.classList.add('drag-over'); } else hl.classList.remove('drag-over');
  if (t.dataset.dropCal) {
    const min = dropMin(t, e), dur = store.get('tasks', ui.drag.id)?.duration || 60;
    let g = t.querySelector('.drop-ghost');
    if (!g) { clearGhost(); g = document.createElement('div'); g.className = 'ev ghost drop-ghost'; t.appendChild(g); }
    g.style.cssText = `top:${((min - store.settings.dayStart * 60) * HOUR) / 60}px;height:${Math.max(18, (dur * HOUR) / 60 - 2)}px;left:3px;right:3px`;
    g.textContent = `${fromMin(min % 1440)}–${fromMin((min + dur) % 1440)}`;
  } else document.querySelectorAll('.drop-ghost').forEach((g) => g.remove());
});
document.addEventListener('dragleave', (e) => {
  const t = dropTarget(e);
  if (t && !t.contains(e.relatedTarget)) t.classList.remove('drag-over');
  const col = e.target.closest?.('.col'); if (col && !col.contains(e.relatedTarget)) document.querySelector('.drop-line')?.remove();
});
document.addEventListener('drop', (e) => {
  const t = dropTarget(e);
  if (!t || !ui.drag) return;
  e.preventDefault();
  const id = ui.drag.id, occ = ui.drag.occ, pi = ui.drag.plan;
  clearGhost();
  if (pi && t.closest('.col[data-drop-day]')) {
    const task = store.get('tasks', id);
    if (!task) return;
    if (task.date !== pi.date) store.patch('tasks', id, { date: pi.date });
    M.reorderDay(pi.date, id, pi.before, 'manual');
    if (store.settings.sortMode !== 'manual') { store.saveSettings({ sortMode: 'manual' }); toast('Eigene Reihenfolge aktiv. Über „Prio“ oder „Zeit“ sortierst du wieder automatisch.'); }
    return;
  }
  if (t.dataset.dropCard) {
    const task = store.get('tasks', id);
    if (task?.time) scheduleChange(id, occ, { date: today(), time: null }); // Termin aus dem Kalender zurück in die Liste
    else M.moveBefore(id, t.dataset.dropCard);
  } else if (t.dataset.dropPlan) {
    const d = t.dataset.date, task = store.get('tasks', id);
    if (!task) return;
    if (occ || (task.repeat && task.date !== d)) return scheduleChange(id, occ, { date: d }); // Wiederholung: erst fragen
    if (task.date !== d) store.patch('tasks', id, { date: d });
    M.reorderDay(d, id, t.dataset.dropPlan, store.settings.sortMode);
    if (store.settings.sortMode !== 'manual') { store.saveSettings({ sortMode: 'manual' }); toast('Eigene Reihenfolge aktiv. Über „Prio“ oder „Zeit“ sortierst du wieder automatisch.'); }
  } else if (t.dataset.dropDay) scheduleChange(id, occ, { date: t.dataset.dropDay });
  else if (t.dataset.dropCal) {
    const [date, m] = norm(t.dataset.dropCal, dropMin(t, e));
    scheduleChange(id, occ, { date, time: fromMin(m) });
    if (!store.get("tasks", id)?.repeat) toast(`Eingeplant um ${fromMin(m)} Uhr`);
  } else if (t.dataset.dropInbox) store.patch('tasks', id, { date: null, time: null });
  else if (t.dataset.dropToday && store.get('tasks', id)?.time) scheduleChange(id, occ, { date: today(), time: null }); // aus dem Kalender zurück in die Liste
});
document.addEventListener('dragend', () => {
  ui.drag = null;
  clearGhost();
  document.querySelectorAll('.drag-over,.dragging').forEach((x) => x.classList.remove('drag-over', 'dragging'));
});

// ---------- Start ----------
// Beim Start als Home-Bildschirm-App immer in der Inbox öffnen (ältere Installationen haben noch #plan als Startadresse gespeichert)
const standalone = navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
let launched = false; try { launched = !!sessionStorage.getItem('launched'); sessionStorage.setItem('launched', '1'); } catch {}
const startHash = !location.hash || location.hash === '#inbox' || (standalone && !launched) ? '#today' : location.hash;
T.init(startHash); // Tabs: passender Tab wird aktiv, sonst öffnet der aktive Tab diese Ansicht
if (T.active().hash !== location.hash) history.replaceState(null, '', T.active().hash); // ohne hashchange
applyTheme();
renderAll();
store.initSync();
// Selbstheilung: mehrere gleichzeitig laufende Timer (z. B. aus der Gym-App) auf einen reduzieren
let repairT;
store.subscribe(() => { clearTimeout(repairT); repairT = setTimeout(() => { if (store.sync.status === 'online' && M.repairOpenEntries()) toast('Ein hängengebliebener Timer wurde beendet.'); }, 1500); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if (navigator.storage?.persist) navigator.storage.persist();
window.__app = { store, M, ui }; // zum Ausprobieren in der Browser-Konsole

// ---------- Rechtsklick-Menü im Kalender ----------
// Rechtsklick auf Termin, Zeiteintrag oder Sperrzeit: kleine Auswahl an Aktionen direkt am Ereignis.
function closeCtx() { $('#ctx-menu')?.remove(); }
function ctxItems(ev) {
  const id = ev.dataset.id;
  if (ev.classList.contains('appt')) {
    const t = store.get('tasks', id);
    if (!t) return [];
    if (ev.classList.contains('rep')) {
      const occ = ev.dataset.occ;
      return [
        ['Serie öffnen', 'repeat', () => A['open-task'](ev)],
        ['Nur diesen Termin auslassen', 'x', () => { store.patch('tasks', id, { skip: [...(t.skip || []), occ] }); toast('Termin ausgelassen.', { label: 'Rückgängig', fn: () => store.patch('tasks', id, { skip: (store.get('tasks', id).skip || []).filter((d) => d !== occ) }) }); }],
        null,
        ['Ganze Serie löschen', 'trash', () => deleteTaskUndo(t), true],
      ];
    }
    const on = M.running()?.taskId === id, done = t.status === 'done';
    return [
      ['Öffnen', 'sparkle', () => A['open-task'](ev)],
      [on ? 'Timer stoppen' : 'Timer starten', on ? 'stop' : 'play', () => (on ? M.stopTimer() : M.startTimer(id))],
      [done ? 'Wieder öffnen' : 'Erledigt', 'check', () => A.toggle(ev)],
      ['Aus dem Kalender nehmen', 'left', () => { const old = t.time; store.patch('tasks', id, { time: null }); toast('Uhrzeit entfernt, steht wieder in der Liste.', { label: 'Rückgängig', fn: () => store.patch('tasks', id, { time: old }) }); }],
      null,
      ['Löschen', 'trash', () => deleteTaskUndo(t), true],
    ];
  }
  if (ev.classList.contains('log')) {
    const en = store.get('entries', id);
    if (!en) return [];
    return [
      ['Bearbeiten', 'clock', () => A['edit-entry'](ev)],
      ...(en.taskId && store.get('tasks', en.taskId) ? [['Aufgabe öffnen', 'sparkle', () => A['open-task']({ dataset: { id: en.taskId } })]] : []),
      null,
      ['Zeiteintrag löschen', 'trash', () => { store.remove('entries', id); toast('Zeiteintrag gelöscht.', { label: 'Rückgängig', fn: () => store.put('entries', en) }); }, true],
    ];
  }
  if (ev.classList.contains('block')) {
    const b = store.get('blocks', id);
    if (!b) return [];
    return [
      ['Bearbeiten', 'lock', () => A['edit-block'](ev)],
      null,
      [b.repeat ? 'Sperrzeit löschen (alle Tage)' : 'Sperrzeit löschen', 'trash', () => { store.remove('blocks', id); toast('Sperrzeit gelöscht.', { label: 'Rückgängig', fn: () => store.put('blocks', b) }); }, true],
    ];
  }
  return [];
}
function deleteTaskUndo(t) {
  store.batch(() => { if (M.running()?.taskId === t.id) M.stopTimer(); store.remove('tasks', t.id); });
  if (ui.openTask === t.id) { ui.openTask = null; renderSheet(); }
  toast('Aufgabe gelöscht.', { label: 'Rückgängig', fn: () => store.put('tasks', t) });
}
document.addEventListener('contextmenu', (e) => {
  const ev = e.target.closest('.ev[data-id]');
  if (!ev || ev.classList.contains('ghost')) return closeCtx();
  const items = ctxItems(ev);
  if (!items.length) return;
  e.preventDefault();
  closeCtx();
  const m = document.createElement('div');
  m.id = 'ctx-menu'; m.className = 'ctx-menu';
  m.innerHTML = items.map((it, i) => (it ? `<button data-i="${i}" class="${it[3] ? 'danger' : ''}">${icon(it[1])}<span>${esc(it[0])}</span></button>` : '<hr>')).join('');
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.min(e.clientX, innerWidth - r.width - 8)}px`;
  m.style.top = `${Math.min(e.clientY, innerHeight - r.height - 8)}px`;
  m.addEventListener('click', (ce) => {
    const b = ce.target.closest('button[data-i]');
    if (!b) return;
    ce.stopPropagation();
    closeCtx();
    items[b.dataset.i][2]();
  });
});
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#ctx-menu')) closeCtx(); }, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCtx(); });
window.addEventListener('scroll', closeCtx, true);
window.addEventListener('blur', closeCtx);
