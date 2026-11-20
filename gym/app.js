// Gym-Tracker: Training loggen (Gewicht × Wiederholungen pro Satz), Pläne pro Wochentag, Verlauf pro Übung.
// Datenmodell:
//   gym_exercises: { id, name, archived? }
//   gym_plans:     { id, name, days: [0..6] (0 = Montag), items: [{ exId, sets, reps }] }
//   gym_days:      { id: 'YYYY-MM-DD', exIds: [...], planId? }   → welche Übungen an dem Tag in welcher Reihenfolge
//   gym_sets:      { id, exId, date: 'YYYY-MM-DD', w: kg, r: Wiederholungen, t: Zeitstempel }

import * as S from './store.js';
import { LIBRARY, GROUPS, matches, norm } from './exercises.js';

const VERSION = '0.3.0';
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Datum ----------
const pad = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => toDateStr(new Date());
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return toDateStr(d); };
const weekday = (s) => (parseDate(s).getDay() + 6) % 7; // 0 = Montag
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WD_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const fmtDay = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtShort = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'numeric' });
const dayLabel = (s) => {
  const t = today();
  if (s === t) return 'Heute';
  if (s === addDays(t, -1)) return 'Gestern';
  if (s === addDays(t, 1)) return 'Morgen';
  return fmtDay.format(parseDate(s)).replace(/\./g, '');
};

// ---------- Zahlen ----------
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const kg = (n) => (Math.round(n * 100) / 100).toLocaleString('de-DE');
const e1rm = (w, r) => (r <= 1 ? w : w * (1 + r / 30)); // Epley-Formel: geschätztes 1-Wiederholungs-Maximum

// ---------- Abfragen ----------
const exercises = () => S.all('gym_exercises').filter((e) => !e.archived).sort((a, b) => a.name.localeCompare(b.name, 'de'));
const exName = (id) => S.get('gym_exercises', id)?.name || '?';
const plans = () => S.all('gym_plans').sort((a, b) => (Math.min(7, ...(a.days || [])) - Math.min(7, ...(b.days || []))) || a.name.localeCompare(b.name, 'de'));
const planOfWeekday = (wd) => plans().find((p) => (p.days || []).includes(wd));
const setsOf = (exId, date) => S.all('gym_sets').filter((s) => s.exId === exId && (!date || s.date === date)).sort((a, b) => a.t - b.t);
const setsOfDay = (date) => S.all('gym_sets').filter((s) => s.date === date);

// Plan eines Tages: fest gewählter (gym_days.planId) oder – ab heute, solange der Tag noch leer ist – der Plan des Wochentags
function planOfDate(date) {
  const d = S.get('gym_days', date);
  if (d) return d.planId ? S.get('gym_plans', d.planId) : null;
  if (date >= today() && !setsOfDay(date).length) return planOfWeekday(weekday(date));
  return null;
}
const dayDoc = (date) => S.get('gym_days', date) || { id: date, exIds: [], planId: planOfDate(date)?.id || null };
function exIdsOfDay(date) {
  const doc = S.get('gym_days', date);
  const ids = doc ? [...doc.exIds] : (planOfDate(date)?.items || []).map((i) => i.exId);
  // Übungen mit Sätzen, die (z. B. durch Sync) fehlen, hinten anhängen
  setsOfDay(date).sort((a, b) => a.t - b.t).forEach((s) => { if (!ids.includes(s.exId)) ids.push(s.exId); });
  return ids.filter((id) => S.get('gym_exercises', id));
}
const saveDay = (date, changes) => S.put('gym_days', { ...dayDoc(date), exIds: exIdsOfDay(date), ...changes });
const targetOf = (date, exId) => planOfDate(date)?.items.find((i) => i.exId === exId);

// Alle Trainingseinheiten einer Übung: [{ date, sets }], neueste zuerst
function sessions(exId) {
  const by = {};
  setsOf(exId).forEach((s) => { (by[s.date] ||= []).push(s); });
  return Object.entries(by).map(([date, sets]) => ({ date, sets })).sort((a, b) => b.date.localeCompare(a.date));
}
const lastSession = (exId, before) => sessions(exId).find((x) => x.date < before);
const bestE1rm = (exId) => Math.max(0, ...setsOf(exId).map((s) => e1rm(s.w, s.r)));
const isPR = (set) => {
  const earlier = setsOf(set.exId).filter((s) => s.t < set.t);
  return earlier.length > 0 && e1rm(set.w, set.r) > Math.max(...earlier.map((s) => e1rm(s.w, s.r)));
};
const setsLine = (sets) => sets.map((s) => `${kg(s.w)}×${s.r}`).join(' · ');
const targetLine = (t) => (t ? `${t.sets || '?'} × ${t.reps || '?'}` : '');


// ---------- Zustand der Oberfläche ----------
const ui = { tab: 'train', date: today(), exDetail: null, metric: 'w', histMode: 'ex', planEdit: null };

function go(tab) { ui.tab = tab; ui.exDetail = null; ui.planEdit = null; render(); window.scrollTo(0, 0); }

// ---------- Rendern ----------
function render() {
  const main = $('#main');
  const keepFocus = document.activeElement?.dataset?.keep; // Eingabe nicht verlieren, wenn Sync neu zeichnet
  const keepVal = document.activeElement?.value;
  if (ui.tab === 'train') main.innerHTML = trainView();
  else if (ui.tab === 'plans') main.innerHTML = ui.planEdit ? planEditView(ui.planEdit) : plansView();
  else if (ui.tab === 'history') main.innerHTML = ui.exDetail ? exDetailView(ui.exDetail) : historyView();
  else main.innerHTML = settingsView();
  $('#tabbar').innerHTML = [['train', 'Training', ICON.dumbbell], ['plans', 'Pläne', ICON.list], ['history', 'Verlauf', ICON.chart], ['settings', 'Mehr', ICON.gear]]
    .map(([id, label, ic]) => `<button data-tab="${id}" class="${ui.tab === id ? 'on' : ''}">${ic}<span>${label}</span></button>`).join('');
  if (keepFocus) { const el = document.querySelector(`[data-keep="${keepFocus}"]`); if (el) { el.value = keepVal; el.focus(); } }
}

function trainView() {
  const d = ui.date, ids = exIdsOfDay(d), plan = planOfDate(d);
  const total = setsOfDay(d);
  const vol = total.reduce((a, s) => a + s.w * s.r, 0);
  const sub = total.length ? `${total.length} Sätze · ${kg(vol)} kg Volumen` : d > today() ? 'Geplant' : 'Noch nichts geloggt';
  return `
  <header class="top">
    <button class="icon-btn" data-act="prev" aria-label="Tag zurück">${ICON.left}</button>
    <div class="title"><h1>${dayLabel(d)}</h1><div class="sub">${sub}</div></div>
    <button class="icon-btn" data-act="next" aria-label="Tag vor">${ICON.right}</button>
  </header>
  ${d !== today() ? `<button class="link center" data-act="today">Zurück zu heute</button>` : ''}
  <button class="plan-chip" data-act="choose-plan">${ICON.list}<span>${plan ? `Plan: <b>${esc(plan.name)}</b>` : 'Kein Plan'}</span><span class="muted">ändern</span></button>
  <div class="list">${ids.map((id) => exCard(id, d)).join('')}</div>
  ${ids.length ? '' : `<div class="empty">${ICON.dumbbell}<p>${plans().length ? 'Wähle oben einen Plan oder füge einzelne Übungen hinzu.' : 'Füge Übungen hinzu – oder leg unter „Pläne“ eine Vorlage pro Wochentag an.'}</p></div>`}
  <button class="btn primary wide" data-act="add-ex">${ICON.plus} Übung hinzufügen</button>`;
}

function exCard(exId, date) {
  const sets = setsOf(exId, date);
  const last = lastSession(exId, date);
  const tgt = targetOf(date, exId);
  const ref = sets[sets.length - 1] || last?.sets[0];
  const done = tgt?.sets && sets.length >= tgt.sets;
  return `
  <section class="card ${done ? 'done' : ''}" data-ex="${exId}">
    <div class="card-head">
      <button class="ex-name" data-act="detail" data-id="${exId}">${esc(exName(exId))}</button>
      ${tgt ? `<span class="target">${done ? '✓ ' : ''}${tgt.sets ? `${sets.length}/${tgt.sets}` : ''} · Ziel ${esc(targetLine(tgt))}</span>` : ''}
      <button class="icon-btn small" data-act="ex-menu" data-id="${exId}" aria-label="Optionen">${ICON.dots}</button>
    </div>
    ${last ? `<div class="last">Letztes Mal (${dayLabel(last.date)}): ${setsLine(last.sets)}</div>` : '<div class="last">Erstes Mal – viel Erfolg!</div>'}
    ${sets.length ? `<ol class="sets">${sets.map((s, i) => `
      <li><span class="n">${i + 1}</span><span class="val"><b>${kg(s.w)}</b> kg × <b>${s.r}</b></span>${isPR(s) ? '<span class="pr">PR</span>' : ''}
      <button class="icon-btn small faint" data-act="del-set" data-id="${s.id}" aria-label="Satz löschen">${ICON.x}</button></li>`).join('')}</ol>` : ''}
    <form class="add-set" data-ex="${exId}">
      <label><input data-keep="w-${exId}" name="w" inputmode="decimal" autocomplete="off" placeholder="–" value="${ref ? kg(ref.w) : ''}"><span>kg</span></label>
      <label><input data-keep="r-${exId}" name="r" inputmode="numeric" autocomplete="off" placeholder="${parseInt(tgt?.reps) || '–'}" value="${ref ? ref.r : ''}"><span>Wdh</span></label>
      <button class="btn primary" type="submit">${ICON.plus} Satz</button>
    </form>
  </section>`;
}

// ---------- Pläne ----------
function plansView() {
  const all = plans();
  return `<header class="top"><div class="title"><h1>Pläne</h1><div class="sub">Deine Woche</div></div></header>
  <div class="week">${WD.map((w, i) => {
    const p = planOfWeekday(i);
    return `<button class="week-row ${weekday(today()) === i ? 'now' : ''}" data-act="${p ? 'edit-plan' : 'new-plan'}" data-id="${p?.id || ''}" data-wd="${i}">
      <span class="wd">${w}</span>${p ? `<span><b>${esc(p.name)}</b><span class="muted"> · ${p.items.length} Übungen</span></span>` : '<span class="muted">Ruhetag</span>'}</button>`;
  }).join('')}</div>
  ${all.length ? `<div class="label">Alle Pläne</div><div class="list">${all.map((p) => `
    <button class="row" data-act="edit-plan" data-id="${p.id}"><div><b>${esc(p.name)}</b>
      <div class="muted">${(p.days || []).length ? p.days.slice().sort().map((d) => WD[d]).join(', ') : 'Kein fester Tag'} · ${p.items.map((i) => esc(exName(i.exId))).join(', ') || 'noch leer'}</div></div>${ICON.right}</button>`).join('')}</div>` : ''}
  <button class="btn primary wide" data-act="new-plan">${ICON.plus} Neuer Plan</button>`;
}

function planEditView(id) {
  const p = S.get('gym_plans', id);
  if (!p) { ui.planEdit = null; return plansView(); }
  const taken = (wd) => plans().find((o) => o.id !== p.id && (o.days || []).includes(wd));
  return `
  <header class="top">
    <button class="icon-btn" data-act="plan-back" aria-label="Zurück">${ICON.left}</button>
    <div class="title"><h1>${esc(p.name)}</h1><div class="sub">Plan bearbeiten</div></div>
    <span class="icon-btn"></span>
  </header>
  <section class="card">
    <div class="label first">Name</div>
    <input id="plan-name" data-keep="plan-name" value="${esc(p.name)}" placeholder="z. B. Push, Oberkörper, Beine">
    <div class="label">Wochentage</div>
    <div class="days">${WD.map((w, i) => `<button class="day ${(p.days || []).includes(i) ? 'on' : ''}" data-act="toggle-day" data-wd="${i}" title="${taken(i) ? `Bisher: ${esc(taken(i).name)}` : ''}">${w}</button>`).join('')}</div>
    <p class="muted small">Ein Wochentag gehört immer nur zu einem Plan.</p>
  </section>
  <div class="label">Übungen</div>
  ${p.items.length ? `<div class="list">${p.items.map((it, i) => `
    <section class="card plan-item">
      <div class="card-head"><b>${esc(exName(it.exId))}</b>
        <span class="row-btns">
          <button class="icon-btn small" data-act="item-move" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">${ICON.up}</button>
          <button class="icon-btn small" data-act="item-move" data-i="${i}" data-dir="1" ${i === p.items.length - 1 ? 'disabled' : ''} aria-label="Nach unten">${ICON.down}</button>
          <button class="icon-btn small faint" data-act="item-del" data-i="${i}" aria-label="Entfernen">${ICON.x}</button>
        </span></div>
      <div class="target-inputs">
        <label><input data-keep="s-${i}" data-item="${i}" data-field="sets" inputmode="numeric" value="${it.sets ?? ''}" placeholder="3"><span>Sätze</span></label>
        <span class="times">×</span>
        <label><input data-keep="r-${i}" data-item="${i}" data-field="reps" value="${esc(it.reps ?? '')}" placeholder="8–10"><span>Wdh</span></label>
      </div>
    </section>`).join('')}</div>` : '<p class="muted">Noch keine Übungen im Plan.</p>'}
  <button class="btn wide" data-act="plan-add-ex">${ICON.plus} Übung zum Plan hinzufügen</button>
  <button class="link center danger-link" data-act="plan-del">Plan löschen</button>`;
}

function newPlan(wd) {
  const used = plans().map((p) => p.name);
  let name = 'Neuer Plan', n = 2;
  while (used.includes(name)) name = `Neuer Plan ${n++}`;
  const days = wd !== undefined && wd !== '' ? [Number(wd)] : [];
  days.forEach((d) => clearDayFromOthers(d, null));
  const p = S.put('gym_plans', { name, days, items: [] });
  ui.tab = 'plans'; ui.planEdit = p.id; render(); window.scrollTo(0, 0);
  setTimeout(() => { const i = $('#plan-name'); i?.focus(); i?.select(); }, 50);
}
// Ein Wochentag gehört immer nur zu einem Plan
function clearDayFromOthers(wd, keepId) {
  plans().filter((p) => p.id !== keepId && (p.days || []).includes(wd)).forEach((p) => S.patch('gym_plans', p.id, { days: p.days.filter((x) => x !== wd) }));
}
function patchItems(fn) {
  const p = S.get('gym_plans', ui.planEdit);
  const items = p.items.map((i) => ({ ...i }));
  fn(items);
  S.patch('gym_plans', p.id, { items });
}

// ---------- Verlauf ----------
function historyView() {
  const seg = `<div class="seg"><button data-act="hist-mode" data-mode="ex" class="${ui.histMode === 'ex' ? 'on' : ''}">Übungen</button><button data-act="hist-mode" data-mode="days" class="${ui.histMode === 'days' ? 'on' : ''}">Trainingstage</button></div>`;
  if (ui.histMode === 'days') {
    const dates = [...new Set(S.all('gym_sets').map((s) => s.date))].sort().reverse();
    return `<header class="top"><div class="title"><h1>Verlauf</h1></div></header>${seg}
    ${dates.length ? `<div class="list">${dates.map((d) => {
      const ids = exIdsOfDay(d).filter((id) => setsOf(id, d).length);
      const plan = S.get('gym_days', d)?.planId && S.get('gym_plans', S.get('gym_days', d).planId);
      return `<button class="row" data-act="open-day" data-date="${d}"><div><b>${dayLabel(d)}</b>${plan ? `<span class="muted"> · ${esc(plan.name)}</span>` : ''}<div class="muted">${ids.map((id) => esc(exName(id))).join(', ')}</div></div><span class="muted">${setsOfDay(d).length} Sätze</span></button>`;
    }).join('')}</div>` : `<div class="empty"><p>Noch keine Trainingstage.</p></div>`}`;
  }
  const list = exercises().map((ex) => ({ ex, ses: sessions(ex.id) })).filter((x) => x.ses.length).sort((a, b) => b.ses[0].date.localeCompare(a.ses[0].date));
  return `<header class="top"><div class="title"><h1>Verlauf</h1></div></header>${seg}
  ${list.length ? `<div class="list">${list.map(({ ex, ses }) => {
    const pts = ses.slice(0, 12).reverse().map((x) => Math.max(...x.sets.map((s) => s.w)));
    const top = Math.max(...setsOf(ex.id).map((s) => s.w));
    return `<button class="row" data-act="detail" data-id="${ex.id}"><div><b>${esc(ex.name)}</b><div class="muted">${ses.length}× · zuletzt ${dayLabel(ses[0].date)} · max ${kg(top)} kg</div></div>${spark(pts)}</button>`;
  }).join('')}</div>` : `<div class="empty"><p>Sobald du Sätze loggst, siehst du hier deinen Fortschritt.</p></div>`}`;
}

function exDetailView(exId) {
  const ex = S.get('gym_exercises', exId);
  if (!ex) { ui.exDetail = null; return historyView(); }
  const ses = sessions(exId);
  const metrics = { w: ['Max. Gewicht', (x) => Math.max(...x.sets.map((s) => s.w)), 'kg'], e: ['Gesch. 1RM', (x) => Math.max(...x.sets.map((s) => e1rm(s.w, s.r))), 'kg'], v: ['Volumen', (x) => x.sets.reduce((a, s) => a + s.w * s.r, 0), 'kg'] };
  const [, fn, unit] = metrics[ui.metric];
  const pts = ses.slice().reverse().map((x) => ({ date: x.date, v: fn(x) }));
  const best = setsOf(exId).reduce((b, s) => (!b || e1rm(s.w, s.r) > e1rm(b.w, b.r) ? s : b), null);
  return `
  <header class="top">
    <button class="icon-btn" data-act="back" aria-label="Zurück">${ICON.left}</button>
    <div class="title"><h1>${esc(ex.name)}</h1><div class="sub">${ses.length} Einheiten</div></div>
    <span class="icon-btn"></span>
  </header>
  ${ses.length ? `
  <div class="stats">
    <div><span>Bester Satz</span><b>${kg(best.w)} × ${best.r}</b></div>
    <div><span>Gesch. 1RM</span><b>${kg(Math.round(e1rm(best.w, best.r) * 2) / 2)} kg</b></div>
    <div><span>Einheiten</span><b>${ses.length}</b></div>
  </div>
  <div class="seg">${Object.entries(metrics).map(([k, [l]]) => `<button data-act="metric" data-m="${k}" class="${ui.metric === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div class="card chart">${chart(pts, unit)}</div>
  <div class="list">${ses.map((x) => `<button class="row" data-act="open-day" data-date="${x.date}"><div><b>${dayLabel(x.date)}</b><div class="muted">${setsLine(x.sets)}</div></div><span class="muted">${kg(fn(x))} ${unit}</span></button>`).join('')}</div>`
    : '<div class="empty"><p>Für diese Übung gibt es noch keine Sätze.</p></div>'}`;
}

function settingsView() {
  const st = { online: 'Synchronisiert', offline: 'Offline – wird später hochgeladen', connecting: 'Verbinde…', 'signed-out': 'Nicht angemeldet', error: 'Fehler', off: 'Aus' }[S.sync.status];
  return `<header class="top"><div class="title"><h1>Mehr</h1></div></header>
  <section class="card">
    <h2>Sync</h2>
    <p class="muted">${st}${S.sync.user ? ` · ${esc(S.sync.user.email)}` : ''}</p>
    ${S.sync.error ? `<p class="danger">${esc(S.sync.error)}</p>` : ''}
    ${S.sync.user ? `<button class="btn" data-act="logout">Abmelden</button>` : `
    <p class="muted">Gleicher Login wie in deiner Task-App.</p>
    <form id="login" class="stack">
      <input name="email" type="email" autocomplete="username" placeholder="E-Mail" required>
      <input name="pw" type="password" autocomplete="current-password" placeholder="Passwort" required>
      <button class="btn primary" type="submit">Anmelden</button>
    </form>`}
  </section>
  <section class="card">
    <h2>Übungen</h2>
    <div class="list tight">${exercises().map((e) => `<div class="row static"><span>${esc(e.name)}</span><span><button class="link" data-act="rename" data-id="${e.id}">Umbenennen</button></span></div>`).join('') || '<p class="muted">Noch keine.</p>'}</div>
  </section>
  <section class="card">
    <h2>Backup</h2>
    <button class="btn" data-act="export">Als JSON exportieren</button>
  </section>
  <p class="muted center mono">Gym · Version ${VERSION}</p>`;
}

// ---------- Mini-Diagramme (SVG) ----------
function spark(vals) {
  if (vals.length < 2) return '';
  const W = 72, H = 28, min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const p = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - 3 - ((v - min) / span) * (H - 6)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><polyline points="${p}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function chart(pts, unit) {
  if (pts.length < 2) return `<p class="muted center">Ab der 2. Einheit siehst du hier eine Kurve.</p>`;
  const W = 340, H = 170, L = 38, R = 10, T = 12, B = 24;
  const vals = pts.map((p) => p.v);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 5; max += 5; }
  const padV = (max - min) * 0.1; min = Math.max(0, min - padV); max += padV;
  const x = (i) => L + (i / (pts.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const ticks = [min, (min + max) / 2, max];
  const line = pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' ');
  const labelIdx = [...new Set([0, Math.floor((pts.length - 1) / 2), pts.length - 1])];
  return `<svg viewBox="0 0 ${W} ${H}" class="big-chart" role="img" aria-label="Verlauf">
    ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${Math.round(t)}</text>`).join('')}
    <polygon points="${x(0)},${H - B} ${line} ${x(pts.length - 1)},${H - B}" fill="var(--accent)" opacity=".1"/>
    <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="3.5" fill="var(--card)" stroke="var(--accent)" stroke-width="2"/>`).join('')}
    ${labelIdx.map((i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}">${fmtShort.format(parseDate(pts[i].date))}</text>`).join('')}
    <text x="${L}" y="${T - 2}" class="unit">${unit}</text>
  </svg>`;
}

// ---------- Bottom-Sheet ----------
function sheet(html, onMount) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="backdrop" data-act="close-sheet"></div><div class="sheet">${html}</div>`;
  root.classList.add('open');
  onMount?.(root.querySelector('.sheet'));
}
function closeSheet() { const r = $('#sheet-root'); r.classList.remove('open'); r.innerHTML = ''; }

// Übung auswählen (für Training oder Plan). onPick bekommt die Übungs-ID.
let pickCb = null;
function exercisePicker(title, exclude, onPick) {
  pickCb = onPick;
  const used = new Set(exclude);
  const recent = (id) => { const s = sessions(id)[0]; return s ? s.date : ''; };
  const draw = (q = '') => {
    const ql = q.trim();
    const own = S.all('gym_exercises');
    const ownNames = new Set(own.map((e) => norm(e.name)));
    const lib = (e) => LIBRARY.find((l) => norm(l.name) === norm(e.name));
    const mine = exercises().filter((e) => !used.has(e.id) && (!ql || matches(ql, e.name, lib(e)?.alias || '')))
      .sort((a, b) => recent(b.id).localeCompare(recent(a.id)) || a.name.localeCompare(b.name, 'de'));
    const sugg = LIBRARY.filter((l) => !ownNames.has(norm(l.name)) && (!ql || matches(ql, l.name, l.alias, l.group)));
    const exact = ql && (ownNames.has(norm(ql)) || LIBRARY.some((l) => norm(l.name) === norm(ql)));
    const newRow = `<button class="row accent" data-act="pick-new" data-name="${esc(ql)}">${ICON.plus}<span>„${esc(ql)}“ neu anlegen</span></button>`;
    const libRow = (l) => `<button class="row" data-act="pick-new" data-name="${esc(l.name)}"><span>${esc(l.name)}</span>${ql ? `<span class="muted">${esc(l.group)}</span>` : ''}</button>`;
    return `
      ${ql && !exact && !mine.length && !sugg.length ? newRow : ''}
      ${mine.length ? `<div class="label">Deine Übungen</div>${mine.map((e) => `<button class="row" data-act="pick" data-id="${e.id}"><span>${esc(e.name)}</span><span class="muted">${recent(e.id) ? dayLabel(recent(e.id)) : ''}</span></button>`).join('')}` : ''}
      ${ql ? (sugg.length ? `<div class="label">Bibliothek</div>${sugg.map(libRow).join('')}` : '')
        : GROUPS.map((g) => { const items = sugg.filter((l) => l.group === g); return items.length ? `<div class="label">${esc(g)}</div>${items.map(libRow).join('')}` : ''; }).join('')}
      ${ql && !exact && (mine.length || sugg.length) ? `<div class="label">Nicht dabei?</div>${newRow}` : ''}`;
  };
  sheet(`<div class="sheet-head"><h2>${title}</h2><button class="icon-btn small" data-act="close-sheet">${ICON.x}</button></div>
    <input id="ex-search" placeholder="Suchen oder neu anlegen…" autocomplete="off"><div id="ex-results" class="list tight">${draw()}</div>`, (el) => {
    const inp = el.querySelector('#ex-search');
    inp.addEventListener('input', () => { el.querySelector('#ex-results').innerHTML = draw(inp.value); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.querySelector('#ex-results .row')?.click(); });
  });
}

function addToDay(exId) {
  if (!exIdsOfDay(ui.date).includes(exId)) saveDay(ui.date, { exIds: [...exIdsOfDay(ui.date), exId] });
  closeSheet();
  setTimeout(() => document.querySelector(`[data-keep="w-${exId}"]`)?.focus(), 50);
}

function choosePlanSheet() {
  const cur = planOfDate(ui.date)?.id;
  const ps = plans();
  sheet(`<div class="sheet-head"><h2>Plan für ${dayLabel(ui.date)}</h2><button class="icon-btn small" data-act="close-sheet">${ICON.x}</button></div>
    <div class="list tight">
      ${ps.map((p) => `<button class="row" data-act="set-plan" data-id="${p.id}"><div><b>${esc(p.name)}</b>${cur === p.id ? ' ✓' : ''}<div class="muted">${p.items.map((i) => esc(exName(i.exId))).join(', ') || 'noch leer'}</div></div></button>`).join('')}
      <button class="row" data-act="set-plan" data-id=""><span>Ohne Plan${!cur ? ' ✓' : ''}</span></button>
    </div>
    ${ps.length ? '' : '<p class="muted">Noch keine Pläne. Leg unter „Pläne“ deinen ersten an.</p>'}
    <button class="btn wide" data-act="new-plan">${ICON.plus} Neuen Plan anlegen</button>`);
}
function setPlan(planId) {
  const p = planId ? S.get('gym_plans', planId) : null;
  // Übungen mit bereits geloggten Sätzen bleiben, dazu kommen die Übungen des Plans
  const logged = exIdsOfDay(ui.date).filter((id) => setsOf(id, ui.date).length);
  const ids = [...(p?.items || []).map((i) => i.exId)];
  logged.forEach((id) => { if (!ids.includes(id)) ids.push(id); });
  S.put('gym_days', { ...dayDoc(ui.date), exIds: ids, planId: p?.id || null });
  closeSheet();
}

function exMenu(exId) {
  const ids = exIdsOfDay(ui.date), i = ids.indexOf(exId);
  sheet(`<div class="sheet-head"><h2>${esc(exName(exId))}</h2><button class="icon-btn small" data-act="close-sheet">${ICON.x}</button></div>
    <div class="list tight">
      ${i > 0 ? `<button class="row" data-act="move" data-id="${exId}" data-dir="-1">Nach oben</button>` : ''}
      ${i < ids.length - 1 ? `<button class="row" data-act="move" data-id="${exId}" data-dir="1">Nach unten</button>` : ''}
      <button class="row" data-act="detail" data-id="${exId}">Verlauf ansehen</button>
      <button class="row danger" data-act="remove-ex" data-id="${exId}">Aus diesem Training entfernen</button>
    </div>`);
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('show'), 1800);
}

function pickNew(name) {
  const existing = S.all('gym_exercises').find((x) => x.name.toLowerCase() === name.toLowerCase());
  return existing ? S.patch('gym_exercises', existing.id, { archived: false }) : S.put('gym_exercises', { name });
}

// ---------- Ereignisse ----------
document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) return go(tab.dataset.tab);
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const { act, id } = b.dataset;
  switch (act) {
    case 'prev': ui.date = addDays(ui.date, -1); render(); break;
    case 'next': ui.date = addDays(ui.date, 1); render(); break;
    case 'today': ui.date = today(); render(); break;
    case 'add-ex': exercisePicker('Übung hinzufügen', exIdsOfDay(ui.date), addToDay); break;
    case 'close-sheet': closeSheet(); break;
    case 'pick': pickCb?.(id); break;
    case 'pick-new': pickCb?.(pickNew(b.dataset.name).id); break;
    case 'del-set': {
      lastDeleted = S.get('gym_sets', id); S.remove('gym_sets', id); showUndo(); break;
    }
    case 'ex-menu': exMenu(id); break;
    case 'move': {
      const ids = exIdsOfDay(ui.date), i = ids.indexOf(id), j = i + Number(b.dataset.dir);
      [ids[i], ids[j]] = [ids[j], ids[i]];
      saveDay(ui.date, { exIds: ids }); closeSheet(); break;
    }
    case 'remove-ex': {
      const sets = setsOf(id, ui.date);
      if (sets.length && !confirm(`${sets.length} Sätze dieser Übung werden gelöscht. Sicher?`)) return;
      sets.forEach((s) => S.remove('gym_sets', s.id));
      saveDay(ui.date, { exIds: exIdsOfDay(ui.date).filter((x) => x !== id) });
      closeSheet(); break;
    }
    case 'choose-plan': choosePlanSheet(); break;
    case 'set-plan': setPlan(id); break;
    // Pläne
    case 'new-plan': closeSheet(); newPlan(b.dataset.wd); break;
    case 'edit-plan': ui.planEdit = id; render(); window.scrollTo(0, 0); break;
    case 'plan-back': ui.planEdit = null; render(); break;
    case 'toggle-day': {
      const p = S.get('gym_plans', ui.planEdit), wd = Number(b.dataset.wd);
      const on = (p.days || []).includes(wd);
      if (!on) clearDayFromOthers(wd, p.id);
      S.patch('gym_plans', p.id, { days: on ? p.days.filter((x) => x !== wd) : [...(p.days || []), wd] });
      break;
    }
    case 'plan-add-ex': {
      const p = S.get('gym_plans', ui.planEdit);
      exercisePicker('Übung zum Plan', p.items.map((i) => i.exId), (exId) => {
        const last = p.items[p.items.length - 1];
        patchItems((items) => items.push({ exId, sets: last?.sets ?? 3, reps: last?.reps ?? '8–10' }));
        closeSheet();
      });
      break;
    }
    case 'item-move': patchItems((items) => { const i = Number(b.dataset.i), j = i + Number(b.dataset.dir); [items[i], items[j]] = [items[j], items[i]]; }); break;
    case 'item-del': patchItems((items) => items.splice(Number(b.dataset.i), 1)); break;
    case 'plan-del': {
      const p = S.get('gym_plans', ui.planEdit);
      if (!confirm(`Plan „${p.name}“ löschen? Deine geloggten Sätze bleiben erhalten.`)) return;
      S.remove('gym_plans', p.id); ui.planEdit = null; render(); break;
    }
    // Verlauf
    case 'detail': closeSheet(); ui.tab = 'history'; ui.exDetail = id; render(); window.scrollTo(0, 0); break;
    case 'back': ui.exDetail = null; render(); break;
    case 'metric': ui.metric = b.dataset.m; render(); break;
    case 'hist-mode': ui.histMode = b.dataset.mode; render(); break;
    case 'open-day': ui.date = b.dataset.date; go('train'); break;
    // Mehr
    case 'logout': S.signOutUser(); break;
    case 'rename': {
      const ex = S.get('gym_exercises', id);
      const n = prompt('Neuer Name', ex.name);
      if (n && n.trim()) S.patch('gym_exercises', id, { name: n.trim() });
      break;
    }
    case 'export': {
      const blob = new Blob([S.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `gym-backup-${today()}.json`; a.click();
      break;
    }
    case 'undo': if (lastDeleted) { S.put('gym_sets', lastDeleted); lastDeleted = null; $('#toast').classList.remove('show'); } break;
  }
});

// Plan-Felder (Name, Sätze, Wdh) speichern, sobald man das Feld verlässt
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'plan-name') { if (el.value.trim()) S.patch('gym_plans', ui.planEdit, { name: el.value.trim() }); }
  else if (el.dataset.item !== undefined) {
    const i = Number(el.dataset.item), f = el.dataset.field;
    const v = f === 'sets' ? (Math.round(num(el.value)) || null) : el.value.trim().replace('-', '–');
    patchItems((items) => { items[i][f] = v; });
  }
});

let lastDeleted = null;
function showUndo() {
  const t = $('#toast'); t.innerHTML = `Satz gelöscht <button data-act="undo">Rückgängig</button>`; t.classList.add('show');
  clearTimeout(toast.tm); toast.tm = setTimeout(() => { t.classList.remove('show'); lastDeleted = null; }, 4000);
}

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.classList.contains('add-set')) {
    const w = num(f.w.value), r = Math.round(num(f.r.value));
    if (w === null || w < 0) { f.w.focus(); return toast('Gewicht eintragen'); }
    if (!r || r < 1) { f.r.focus(); return toast('Wiederholungen eintragen'); }
    const exId = f.dataset.ex;
    const before = bestE1rm(exId);
    const hadSets = setsOf(exId).length > 0;
    if (!S.get('gym_days', ui.date)) saveDay(ui.date, {}); // Plan des Tages festhalten, bevor der erste Satz kommt
    S.put('gym_sets', { exId, date: ui.date, w, r, t: Date.now() });
    if (!S.get('gym_days', ui.date).exIds.includes(exId)) saveDay(ui.date, {});
    if (hadSets && e1rm(w, r) > before) toast('Neue Bestleistung! 💪');
    navigator.vibrate?.(15);
    document.activeElement?.blur();
  }
  if (f.id === 'login') {
    try { await S.signIn(f.email.value.trim(), f.pw.value); toast('Angemeldet'); }
    catch (err) { toast('Login fehlgeschlagen'); S.sync.error = err.code || err.message; render(); }
  }
});

// Zoomen sperren (iOS ignoriert user-scalable=no teilweise)
['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));

// ---------- Icons ----------
const svg = (p) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICON = {
  dumbbell: svg('<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>'),
  chart: svg('<path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6"/>'),
  gear: svg('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  left: svg('<path d="M15 18l-6-6 6-6"/>'),
  right: svg('<path d="M9 18l6-6-6-6"/>'),
  up: svg('<path d="M18 15l-6-6-6 6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  dots: svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
};

// ---------- Start ----------
S.subscribe(render);
render();
S.initSync();
// Tageswechsel: wenn die App über Nacht offen bleibt, morgens auf "Heute" springen
let lastToday = today();
document.addEventListener('visibilitychange', () => { if (!document.hidden && today() !== lastToday) { if (ui.date === lastToday) ui.date = today(); lastToday = today(); render(); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
