// Gym-Tracker: Training loggen (Gewicht × Wiederholungen pro Satz), Verlauf pro Übung ansehen.
// Datenmodell:
//   gym_exercises: { id, name, archived? }
//   gym_days:      { id: 'YYYY-MM-DD', exIds: [...] }   → welche Übungen an dem Tag in welcher Reihenfolge
//   gym_sets:      { id, exId, date: 'YYYY-MM-DD', w: kg, r: Wiederholungen, t: Zeitstempel }

import * as S from './store.js';

const VERSION = '0.1.0';
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Datum ----------
const pad = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => toDateStr(new Date());
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return toDateStr(d); };
const fmtDay = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtShort = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'numeric' });
const dayLabel = (s) => {
  const t = today();
  if (s === t) return 'Heute';
  if (s === addDays(t, -1)) return 'Gestern';
  return fmtDay.format(parseDate(s)).replace(/\./g, '');
};

// ---------- Zahlen ----------
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const kg = (n) => (Math.round(n * 100) / 100).toLocaleString('de-DE');
const e1rm = (w, r) => (r <= 1 ? w : w * (1 + r / 30)); // Epley-Formel: geschätztes 1-Wiederholungs-Maximum

// ---------- Abfragen ----------
const exercises = () => S.all('gym_exercises').filter((e) => !e.archived).sort((a, b) => a.name.localeCompare(b.name, 'de'));
const setsOf = (exId, date) => S.all('gym_sets').filter((s) => s.exId === exId && (!date || s.date === date)).sort((a, b) => a.t - b.t);
const dayDoc = (date) => S.get('gym_days', date) || { id: date, exIds: [] };
const exIdsOfDay = (date) => {
  // Reihenfolge aus dem Tag; Übungen mit Sätzen, die (z. B. durch Sync) fehlen, hinten anhängen
  const ids = [...dayDoc(date).exIds];
  S.all('gym_sets').filter((s) => s.date === date).sort((a, b) => a.t - b.t).forEach((s) => { if (!ids.includes(s.exId)) ids.push(s.exId); });
  return ids.filter((id) => S.get('gym_exercises', id));
};
// Alle Trainingseinheiten einer Übung: [{ date, sets }], neueste zuerst
function sessions(exId) {
  const by = {};
  setsOf(exId).forEach((s) => { (by[s.date] ||= []).push(s); });
  return Object.entries(by).map(([date, sets]) => ({ date, sets })).sort((a, b) => b.date.localeCompare(a.date));
}
const lastSession = (exId, before) => sessions(exId).find((x) => x.date < before);
const bestE1rm = (exId, exceptSetId) => Math.max(0, ...setsOf(exId).filter((s) => s.id !== exceptSetId).map((s) => e1rm(s.w, s.r)));
const isPR = (set) => {
  // Bestleistung = höchstes geschätztes 1RM bis zu diesem Satz (frühere Sätze zählen)
  const earlier = setsOf(set.exId).filter((s) => s.t < set.t);
  return earlier.length > 0 && e1rm(set.w, set.r) > Math.max(...earlier.map((s) => e1rm(s.w, s.r)));
};
const setsLine = (sets) => sets.map((s) => `${kg(s.w)}×${s.r}`).join(' · ');

const SUGGEST = ['Bankdrücken', 'Kniebeuge', 'Kreuzheben', 'Schulterdrücken', 'Langhantelrudern', 'Klimmzüge', 'Latzug', 'Dips',
  'Schrägbankdrücken', 'Beinpresse', 'Rumänisches Kreuzheben', 'Bizepscurls', 'Trizepsdrücken', 'Seitheben', 'Wadenheben', 'Beinbeuger'];

// ---------- Zustand der Oberfläche ----------
const ui = { tab: 'train', date: today(), exDetail: null, metric: 'w', histMode: 'ex' };

function go(tab) { ui.tab = tab; ui.exDetail = null; render(); window.scrollTo(0, 0); }

// ---------- Rendern ----------
function render() {
  const main = $('#main');
  const keepFocus = document.activeElement?.dataset?.keep; // Eingabe nicht verlieren, wenn Sync neu zeichnet
  const keepVal = document.activeElement?.value;
  if (ui.tab === 'train') main.innerHTML = trainView();
  else if (ui.tab === 'history') main.innerHTML = ui.exDetail ? exDetailView(ui.exDetail) : historyView();
  else main.innerHTML = settingsView();
  $('#tabbar').innerHTML = [['train', 'Training', ICON.dumbbell], ['history', 'Verlauf', ICON.chart], ['settings', 'Mehr', ICON.gear]]
    .map(([id, label, ic]) => `<button data-tab="${id}" class="${ui.tab === id ? 'on' : ''}">${ic}<span>${label}</span></button>`).join('');
  if (keepFocus) { const el = document.querySelector(`[data-keep="${keepFocus}"]`); if (el) { el.value = keepVal; el.focus(); } }
}

function trainView() {
  const d = ui.date, ids = exIdsOfDay(d);
  const total = S.all('gym_sets').filter((s) => s.date === d);
  const vol = total.reduce((a, s) => a + s.w * s.r, 0);
  return `
  <header class="top">
    <button class="icon-btn" data-act="prev" aria-label="Tag zurück">${ICON.left}</button>
    <div class="title"><h1>${dayLabel(d)}</h1><div class="sub">${total.length ? `${total.length} Sätze · ${kg(vol)} kg Volumen` : 'Noch nichts geloggt'}</div></div>
    <button class="icon-btn" data-act="next" aria-label="Tag vor" ${d >= today() ? 'disabled' : ''}>${ICON.right}</button>
  </header>
  ${d !== today() ? `<button class="link center" data-act="today">Zurück zu heute</button>` : ''}
  <div class="list">${ids.map((id) => exCard(id, d)).join('')}</div>
  ${ids.length ? '' : `<div class="empty">${ICON.dumbbell}<p>Füge deine erste Übung hinzu und logge Satz für Satz.</p></div>`}
  <button class="btn primary wide" data-act="add-ex">${ICON.plus} Übung hinzufügen</button>`;
}

function exCard(exId, date) {
  const ex = S.get('gym_exercises', exId);
  const sets = setsOf(exId, date);
  const last = lastSession(exId, date);
  const ref = sets[sets.length - 1] || last?.sets[0];
  return `
  <section class="card" data-ex="${exId}">
    <div class="card-head">
      <button class="ex-name" data-act="detail" data-id="${exId}">${esc(ex.name)}</button>
      <button class="icon-btn small" data-act="ex-menu" data-id="${exId}" aria-label="Optionen">${ICON.dots}</button>
    </div>
    ${last ? `<div class="last">Letztes Mal (${dayLabel(last.date)}): ${setsLine(last.sets)}</div>` : '<div class="last">Erstes Mal – viel Erfolg!</div>'}
    ${sets.length ? `<ol class="sets">${sets.map((s, i) => `
      <li><span class="n">${i + 1}</span><span class="val"><b>${kg(s.w)}</b> kg × <b>${s.r}</b></span>${isPR(s) ? '<span class="pr">PR</span>' : ''}
      <button class="icon-btn small faint" data-act="del-set" data-id="${s.id}" aria-label="Satz löschen">${ICON.x}</button></li>`).join('')}</ol>` : ''}
    <form class="add-set" data-ex="${exId}">
      <label><input data-keep="w-${exId}" name="w" inputmode="decimal" autocomplete="off" placeholder="kg" value="${ref ? kg(ref.w) : ''}"><span>kg</span></label>
      <label><input data-keep="r-${exId}" name="r" inputmode="numeric" autocomplete="off" placeholder="Wdh" value="${ref ? ref.r : ''}"><span>Wdh</span></label>
      <button class="btn primary" type="submit">${ICON.plus} Satz</button>
    </form>
  </section>`;
}

function historyView() {
  const seg = `<div class="seg"><button data-act="hist-mode" data-mode="ex" class="${ui.histMode === 'ex' ? 'on' : ''}">Übungen</button><button data-act="hist-mode" data-mode="days" class="${ui.histMode === 'days' ? 'on' : ''}">Trainingstage</button></div>`;
  if (ui.histMode === 'days') {
    const dates = [...new Set(S.all('gym_sets').map((s) => s.date))].sort().reverse();
    return `<header class="top"><div class="title"><h1>Verlauf</h1></div></header>${seg}
    ${dates.length ? `<div class="list">${dates.map((d) => {
      const ids = exIdsOfDay(d);
      const n = S.all('gym_sets').filter((s) => s.date === d).length;
      return `<button class="row" data-act="open-day" data-date="${d}"><div><b>${dayLabel(d)}</b><div class="muted">${ids.map((id) => esc(S.get('gym_exercises', id).name)).join(', ')}</div></div><span class="muted">${n} Sätze</span></button>`;
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

function addExerciseSheet() {
  const used = new Set(exIdsOfDay(ui.date));
  const recentOrder = (id) => { const s = sessions(id)[0]; return s ? s.date : ''; };
  const draw = (q = '') => {
    const ql = q.trim().toLowerCase();
    const mine = exercises().filter((e) => !used.has(e.id) && e.name.toLowerCase().includes(ql)).sort((a, b) => recentOrder(b.id).localeCompare(recentOrder(a.id)) || a.name.localeCompare(b.name, 'de'));
    const names = new Set(S.all('gym_exercises').map((e) => e.name.toLowerCase()));
    const sugg = SUGGEST.filter((n) => !names.has(n.toLowerCase()) && n.toLowerCase().includes(ql));
    const exact = ql && (names.has(ql) || SUGGEST.some((n) => n.toLowerCase() === ql));
    return `
      ${ql && !exact ? `<button class="row accent" data-act="pick-new" data-name="${esc(q.trim())}">${ICON.plus}<span>„${esc(q.trim())}“ neu anlegen</span></button>` : ''}
      ${mine.length ? `<div class="label">Deine Übungen</div>${mine.map((e) => `<button class="row" data-act="pick" data-id="${e.id}"><span>${esc(e.name)}</span><span class="muted">${recentOrder(e.id) ? dayLabel(recentOrder(e.id)) : ''}</span></button>`).join('')}` : ''}
      ${sugg.length ? `<div class="label">Vorschläge</div>${sugg.map((n) => `<button class="row" data-act="pick-new" data-name="${esc(n)}"><span>${esc(n)}</span></button>`).join('')}` : ''}`;
  };
  sheet(`<div class="sheet-head"><h2>Übung hinzufügen</h2><button class="icon-btn small" data-act="close-sheet">${ICON.x}</button></div>
    <input id="ex-search" placeholder="Suchen oder neu anlegen…" autocomplete="off"><div id="ex-results" class="list tight">${draw()}</div>`, (el) => {
    const inp = el.querySelector('#ex-search');
    inp.addEventListener('input', () => { el.querySelector('#ex-results').innerHTML = draw(inp.value); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.querySelector('#ex-results .row')?.click(); });
  });
}

function addToDay(exId) {
  const d = dayDoc(ui.date);
  if (!d.exIds.includes(exId)) S.put('gym_days', { ...d, exIds: [...exIdsOfDay(ui.date), exId] });
  closeSheet();
  setTimeout(() => document.querySelector(`[data-keep="w-${exId}"]`)?.focus(), 50);
}

function exMenu(exId) {
  const ex = S.get('gym_exercises', exId);
  const ids = exIdsOfDay(ui.date), i = ids.indexOf(exId);
  sheet(`<div class="sheet-head"><h2>${esc(ex.name)}</h2><button class="icon-btn small" data-act="close-sheet">${ICON.x}</button></div>
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

// ---------- Ereignisse ----------
document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) return go(tab.dataset.tab);
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const { act, id } = b.dataset;
  switch (act) {
    case 'prev': ui.date = addDays(ui.date, -1); render(); break;
    case 'next': if (ui.date < today()) { ui.date = addDays(ui.date, 1); render(); } break;
    case 'today': ui.date = today(); render(); break;
    case 'add-ex': addExerciseSheet(); break;
    case 'close-sheet': closeSheet(); break;
    case 'pick': addToDay(id); break;
    case 'pick-new': {
      const name = b.dataset.name;
      const existing = S.all('gym_exercises').find((x) => x.name.toLowerCase() === name.toLowerCase());
      const ex = existing ? S.patch('gym_exercises', existing.id, { archived: false }) : S.put('gym_exercises', { name });
      addToDay(ex.id); break;
    }
    case 'del-set': {
      const s = S.get('gym_sets', id); S.remove('gym_sets', id);
      toast('Satz gelöscht'); lastDeleted = s; showUndo(); break;
    }
    case 'ex-menu': exMenu(id); break;
    case 'move': {
      const ids = exIdsOfDay(ui.date), i = ids.indexOf(id), j = i + Number(b.dataset.dir);
      [ids[i], ids[j]] = [ids[j], ids[i]];
      S.put('gym_days', { ...dayDoc(ui.date), exIds: ids }); closeSheet(); break;
    }
    case 'remove-ex': {
      const sets = setsOf(id, ui.date);
      if (sets.length && !confirm(`${sets.length} Sätze von heute werden gelöscht. Sicher?`)) return;
      sets.forEach((s) => S.remove('gym_sets', s.id));
      S.put('gym_days', { ...dayDoc(ui.date), exIds: exIdsOfDay(ui.date).filter((x) => x !== id) });
      closeSheet(); break;
    }
    case 'detail': closeSheet(); ui.tab = 'history'; ui.exDetail = id; render(); window.scrollTo(0, 0); break;
    case 'back': ui.exDetail = null; render(); break;
    case 'metric': ui.metric = b.dataset.m; render(); break;
    case 'hist-mode': ui.histMode = b.dataset.mode; render(); break;
    case 'open-day': ui.date = b.dataset.date; go('train'); break;
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
    S.put('gym_sets', { exId, date: ui.date, w, r, t: Date.now() });
    if (!dayDoc(ui.date).exIds.includes(exId)) S.put('gym_days', { ...dayDoc(ui.date), exIds: exIdsOfDay(ui.date) });
    if (hadSets && e1rm(w, r) > before) toast('Neue Bestleistung! 💪');
    navigator.vibrate?.(15);
    document.activeElement?.blur();
  }
  if (f.id === 'login') {
    try { await S.signIn(f.email.value.trim(), f.pw.value); toast('Angemeldet'); }
    catch (err) { toast('Login fehlgeschlagen'); S.sync.error = err.code || err.message; render(); }
  }
});

// ---------- Icons ----------
const svg = (p) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICON = {
  dumbbell: svg('<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>'),
  chart: svg('<path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6"/>'),
  gear: svg('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  left: svg('<path d="M15 18l-6-6 6-6"/>'),
  right: svg('<path d="M9 18l6-6-6-6"/>'),
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
