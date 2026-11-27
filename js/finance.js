// Finanzen: Abos mit Abo-Kalender, Liste und Ausgaben (Aufbau wie HeroSpace „Subscriptions“).
// Daten liegen in der Sammlung „subs“ und synchronisieren wie Aufgaben.
// Später dazu: Portfolio und Kontoumsätze (Enable Banking). Ein Abo kann dann mit echten Abbuchungen abgeglichen werden.
import * as store from './store.js';
import * as M from './model.js';
import { ui } from './ui.js';
import { icon } from './icons.js';
import { head } from './views.js';
import { esc, today, addDays, parseDate, weekStart, longDate, COLORS } from './util.js';

// ---------- Grundlagen ----------
export const CYCLES = {
  week: { label: 'Wöchentlich', per: 'Woche', months: 0, perMonth: 52 / 12 },
  month: { label: 'Monatlich', per: 'Monat', months: 1, perMonth: 1 },
  quarter: { label: 'Vierteljährlich', per: 'Quartal', months: 3, perMonth: 1 / 3 },
  half: { label: 'Halbjährlich', per: 'Halbjahr', months: 6, perMonth: 1 / 6 },
  year: { label: 'Jährlich', per: 'Jahr', months: 12, perMonth: 1 / 12 },
};
const cyc = (s) => CYCLES[s.cycle] || CYCLES.month;
export const CURRENCIES = ['EUR', 'USD', 'KRW', 'GBP', 'CHF'];
export const baseCur = () => store.settings.baseCurrency || 'EUR';
export const subs = () => store.all('subs').sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));

// ---------- Datum ----------
const pad = (n) => String(n).padStart(2, '0');
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate(); // m: 0 = Januar
// Gleicher Tag n Monate später/früher, am Monatsende gekappt (31. Jan → 28. Feb)
export function monthShift(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(y, m - 1 + n, 1);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(Math.min(d, daysIn(t.getFullYear(), t.getMonth())))}`;
}
export const monthStart = (s) => s.slice(0, 8) + '01';
const monthsBetween = (a, b) => { const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number); return (yb - ya) * 12 + (mb - ma); };
const F_SHORT = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });
const F_WD = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
const F_MONTH = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const F_MON = new Intl.DateTimeFormat('de-DE', { month: 'short' });
const F_MONY = new Intl.DateTimeFormat('de-DE', { month: 'short', year: 'numeric' });
const shortDate = (d) => F_SHORT.format(parseDate(d));
const when = (d) => { const t = today(); return d === t ? 'Heute' : d === addDays(t, 1) ? 'Morgen' : F_WD.format(parseDate(d)); };
const monLabel = (d) => F_MON.format(parseDate(d)).replace('.', '');

// ---------- Beträge ----------
// Preis an einem Tag: Preisänderungen werden in s.prices gemerkt ({ from, amount, prev })
export function amountAt(s, d) {
  const ps = (s.prices || []).slice().sort((a, b) => a.from.localeCompare(b.from));
  let a = ps.length ? (ps[0].prev ?? s.amount) : s.amount;
  for (const p of ps) if (p.from <= d) a = p.amount;
  return +a || 0;
}
// Alle Abbuchungen eines Abos im Zeitraum [from, to)
export function chargesOf(s, from, to) {
  const anchor = s.anchor;
  if (!anchor) return [];
  const first = s.trial ? anchor : (s.since && s.since < anchor ? s.since : anchor);
  const lo = from > first ? from : first;
  const hi = s.end && s.end < to ? s.end : to;
  if (lo >= hi) return [];
  const c = cyc(s), out = [];
  if (!c.months) {
    const k0 = Math.floor((parseDate(lo) - parseDate(anchor)) / (7 * 864e5)) - 1;
    for (let k = k0, d = addDays(anchor, k * 7); d < hi; k++, d = addDays(anchor, k * 7)) if (d >= lo) out.push(d);
  } else {
    let k = Math.floor(monthsBetween(anchor, lo) / c.months) - 1;
    for (let i = 0; i < 2000; i++, k++) {
      const d = monthShift(anchor, k * c.months);
      if (d >= hi) break;
      if (d >= lo) out.push(d);
    }
  }
  return out.map((date) => ({ s, date, amount: amountAt(s, date), trialEnd: !!s.trial && date === anchor }));
}
const chargesAll = (list, from, to) => list.flatMap((s) => chargesOf(s, from, to)).sort((a, b) => a.date.localeCompare(b.date) || a.s.name.localeCompare(b.s.name));
export const nextCharge = (s, from = today()) => chargesOf(s, from, addDays(from, 800))[0] || null;
export function status(s, t = today()) {
  if (s.end && s.end <= t) return { id: 'ended', label: 'Gekündigt' };
  if (s.end) return { id: 'ending', label: `Endet ${shortDate(s.end)}` };
  if (s.trial && s.anchor > t) return { id: 'trial', label: 'Testphase' };
  return { id: 'active', label: 'Aktiv' };
}
const perMonth = (s, d = today()) => amountAt(s, d) * cyc(s).perMonth;

// ---------- Wechselkurse (EZB über frankfurter.dev, einmal am Tag, ohne Schlüssel) ----------
const FX_KEY = 'taskapp-fx';
let fx = (() => { try { return JSON.parse(localStorage.getItem(FX_KEY) || 'null'); } catch { return null; } })();
let fxBusy = false;
const fxListeners = new Set();
export const onFx = (fn) => fxListeners.add(fn);
export function toBase(v, cur) {
  const b = baseCur();
  if (!cur || cur === b) return v;
  const r = fx?.base === b && fx.rates?.[cur];
  return r ? v / r : null;
}
export function ensureFx() {
  const b = baseCur();
  const need = [...new Set([...store.all('subs'), ...store.all('holdings')].map((s) => s.currency).filter((c) => c && c !== b))];
  if (!need.length || fxBusy) return;
  const fresh = fx?.base === b && fx.day === today() && need.every((c) => fx.rates?.[c]);
  if (fresh || (fx?.failAt && Date.now() - fx.failAt < 10 * 60000)) return;
  fxBusy = true;
  fetch(`https://api.frankfurter.dev/v1/latest?base=${b}&symbols=${need.join(',')}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j) => {
      fx = { base: b, day: today(), date: j.date, rates: { ...(fx?.base === b ? fx.rates : {}), ...j.rates } };
      try { localStorage.setItem(FX_KEY, JSON.stringify(fx)); } catch {}
      fxListeners.forEach((f) => f());
    })
    .catch(() => { fx = { ...(fx || {}), failAt: Date.now() }; })
    .finally(() => { fxBusy = false; });
}
// Summe in Hauptwährung; Beträge ohne Kurs werden nicht geraten, sondern gemeldet
function sumBase(charges) {
  let total = 0;
  const missing = new Set();
  for (const c of charges) {
    const v = toBase(c.amount, c.s.currency);
    if (v == null) missing.add(c.s.currency); else total += v;
  }
  return { total, missing };
}
const NF = {};
export function money(v, cur = baseCur(), dec) {
  dec ??= cur === 'KRW' ? 0 : 2;
  const k = cur + dec;
  NF[k] ||= new Intl.NumberFormat('de-DE', { style: 'currency', currency: cur, minimumFractionDigits: dec, maximumFractionDigits: dec });
  return NF[k].format(v);
}
const missingNote = (missing) => (missing.size
  ? `<p class="fin-note">${[...missing].join(', ')}-Beträge sind nicht mitgerechnet, weil gerade kein Wechselkurs geladen werden konnte.</p>` : '');
const fxNote = () => {
  const foreign = store.all('subs').some((s) => s.currency && s.currency !== baseCur());
  return foreign && fx?.date && fx.base === baseCur() ? `<p class="fin-note">Fremdwährungen umgerechnet mit EZB-Kursen vom ${shortDate(fx.date)}</p>` : '';
};

// ---------- Logo: Anfangsbuchstabe, darüber das Website-Symbol (über DuckDuckGo) ----------
const cleanDomain = (d) => String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0].replace(/[^a-z0-9.-]/g, '');
const subColor = (s) => s.color || COLORS[[...(s.name || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
export function logo(s, size = 28) {
  const dom = cleanDomain(s.domain);
  return `<span class="sub-logo" style="--c:${subColor(s)};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.45)}px"><b>${esc(((s.name || '?').trim()[0] || '?').toUpperCase())}</b>${dom ? `<img src="https://icons.duckduckgo.com/ip3/${dom}.ico" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`;
}

// ---------- Bausteine ----------
const subRow = (s, sub, right, extra = '') => `
  <div class="fin-row" data-action="edit-sub" data-id="${s.id}">${logo(s, 28)}
    <div class="fin-row-t"><b>${esc(s.name)}</b><small>${sub}</small></div>
    <span class="fin-row-v">${right}</span>${extra}</div>`;
const badge = (n) => `<span class="fin-badge">${n}</span>`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function donut(parts, size = 112, stroke = 11) {
  // parts: [{ v, color }] – Anteile 0..1, im Uhrzeigersinn ab 12 Uhr
  const r = (size - stroke) / 2, C = 2 * Math.PI * r;
  let off = 0;
  const arcs = parts.filter((p) => p.v > 0).map((p) => {
    const len = Math.max(0, Math.min(1, p.v)) * C;
    const a = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${p.color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${Math.max(0.01, len - (p.v < 1 ? 3 : 0))} ${C}" stroke-dashoffset="${-off}" />`;
    off += len;
    return a;
  }).join('');
  return `<svg class="donut-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><g transform="rotate(-90 ${size / 2} ${size / 2})">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--fin-track)" stroke-width="${stroke}"/>${arcs}</g></svg>`;
}

// ---------- Ansicht ----------
export function viewFinance() {
  ensureFx();
  const v = ui.finView || 'calendar';
  const all = subs();
  const views = [['calendar', 'calendar', 'Kalender'], ['list', 'list', 'Liste'], ['spending', 'chart', 'Ausgaben']];
  const actions = `
    <div class="tabs fin-tabs">${views.map(([id, ic, l]) => `<button class="${v === id ? 'on' : ''}" data-action="fin-view" data-v="${id}" title="${l}">${icon(ic)}<span class="lbl-long">${l}</span></button>`).join('')}</div>
    <button class="btn primary" data-action="new-sub" title="Neues Abo">${icon('plus')}<span class="lbl-long">Abo</span></button>`;
  let body;
  if (!all.length) body = empty();
  else if (v === 'list') body = grid(listView(all), overview(all, monthStart(today())));
  else if (v === 'spending') body = grid(spendingView(all), byCategory(all));
  else {
    const m0 = ui.finMonth || monthStart(today());
    body = grid(calendarView(all, m0), overview(all, m0));
  }
  return `${head('Finanzen', '', actions, 'fin-head', areaTabs('finance'))}${body}`;
}
// Abos | Portfolio direkt neben dem Titel (wie „Subscriptions ⌄“ bei HeroSpace)
export const areaTabs = (cur) => `<div class="tabs fin-area">${[['finance', 'Abos'], ['finance/portfolio', 'Portfolio']].map(([h, l]) => `<button class="${cur === h ? 'on' : ''}" data-action="fin-area" data-v="${h}">${l}</button>`).join('')}</div>`;
const grid = (mainHTML, side) => `<div class="fin-grid"><div class="fin-main">${mainHTML}</div><aside class="fin-side panel">${side}</aside></div>`;
const empty = () => `
  <div class="panel fin-empty">
    <span class="fin-empty-ic">${icon('card')}</span>
    <h3>Noch keine Abos</h3>
    <p class="muted">Trag deine Abos ein, zum Beispiel Claude, Spotify oder das Gym. Dann siehst du im Abo-Kalender, wann was abgebucht wird und was dich alles zusammen pro Monat kostet.</p>
    <button class="btn primary" data-action="new-sub">${icon('plus')} Erstes Abo anlegen</button>
  </div>`;

// Abo-Kalender: ein Monat, Kacheln mit Betrag und Logos
function calendarView(all, m0) {
  const t = today(), m1 = monthShift(m0, 1);
  const inMonth = chargesAll(all, m0, m1);
  const sum = sumBase(inMonth);
  const gStart = weekStart(m0), gEnd = addDays(weekStart(addDays(m1, -1)), 7);
  const shown = chargesAll(all, gStart, gEnd);
  const byDay = {};
  shown.forEach((c) => (byDay[c.date] ||= []).push(c));
  const cells = [];
  for (let d = gStart; d < gEnd; d = addDays(d, 1)) {
    const cs = byDay[d] || [];
    const out = d < m0 || d >= m1;
    const amt = sumBase(cs).total;
    const tag = cs.some((c) => c.trialEnd) ? 'Testende' : cs.some((c) => cyc(c.s).months >= 12) ? 'Jährlich' : '';
    const act = cs.length === 1 ? `data-action="edit-sub" data-id="${cs[0].s.id}"` : cs.length ? 'data-action="fin-day"' : 'data-action="new-sub"';
    cells.push(`<div class="fc ${out ? 'out' : ''} ${cs.length ? 'has' : ''} ${d === t ? 'today' : ''} ${d < t ? 'past' : ''}" ${act} data-date="${d}" title="${esc(longDate(d))}">
      <div class="fc-top"><span class="fc-d">${parseDate(d).getDate()}</span>${cs.length ? `<span class="fc-amt">${money(amt)}</span>` : ''}</div>
      ${cs.length ? `<div class="fc-bot"><span class="fc-logos">${cs.slice(0, 3).map((c) => logo(c.s, 20)).join('')}${cs.length > 3 ? `<span class="fc-more">+${cs.length - 3}</span>` : ''}</span>${tag ? `<span class="fc-tag">${tag}</span>` : ''}</div>` : ''}
    </div>`);
  }
  const isCur = m0 === monthStart(t);
  return `
    <div class="panel fin-cal">
      <div class="fin-cal-head">
        <div class="fin-total"><b>${money(sum.total)}</b><span>in ${plural(inMonth.length, 'Abbuchung', 'Abbuchungen')}</span></div>
        <div class="fin-month-nav">
          <button class="icon-btn" data-action="fin-month" data-d="-1" title="Vorheriger Monat">${icon('left')}</button>
          <button class="fin-month ${isCur ? '' : 'away'}" data-action="fin-month" data-d="0" title="${isCur ? '' : 'Zurück zum aktuellen Monat'}">${F_MONTH.format(parseDate(m0))}</button>
          <button class="icon-btn" data-action="fin-month" data-d="1" title="Nächster Monat">${icon('right')}</button>
        </div>
      </div>
      <div class="fc-grid">
        ${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => `<div class="fc-wd">${w}</div>`).join('')}
        ${cells.join('')}
      </div>
      ${missingNote(sum.missing)}${fxNote()}
    </div>`;
}

// Rechte Spalte: bezahlt / offen, Demnächst, Einen Blick wert
function overview(all, m0) {
  const t = today(), cur = monthStart(t);
  const charges = chargesAll(all, m0, monthShift(m0, 1));
  const paid = charges.filter((c) => m0 < cur || (m0 === cur && c.date <= t));
  const open = charges.filter((c) => !paid.includes(c));
  const P = sumBase(paid).total, O = sumBase(open).total, T = P + O;
  const pct = T ? Math.round((P / T) * 100) : 0;
  const up = chargesAll(all, t, addDays(t, 31));
  const look = lookItems(all);
  return `
    <div class="fin-side-h">Übersicht <span class="muted">${F_MONTH.format(parseDate(m0))}</span></div>
    <div class="fin-ov">
      <div class="donut">${donut([{ v: T ? P / T : 0, color: 'var(--fin)' }])}<div class="donut-c"><b>${pct}%</b><span>bezahlt</span></div></div>
      <div class="fin-ov-nums">
        <div><span class="lg"><i style="background:var(--fin)"></i>Bezahlt</span><b>${money(P)}</b><small>${plural(paid.length, 'Abbuchung', 'Abbuchungen')}</small></div>
        <div><span class="lg"><i class="hollow"></i>Offen</span><b>${money(O)}</b><small>${open.length ? `${open.length} offen` : 'nichts mehr offen'}</small></div>
      </div>
    </div>
    ${look.length ? `<div class="fin-sec fin-look"><div class="fin-sec-h">Einen Blick wert ${badge(look.length)}</div>${look.join('')}</div>` : ''}
    <div class="fin-sec"><div class="fin-sec-h">Demnächst ${badge(up.length)}<span class="fin-sec-sum">${money(sumBase(up).total)}</span></div>
      ${up.length ? up.slice(0, 8).map((c) => subRow(c.s, `<span class="${c.date === t ? 'warn' : ''}">${when(c.date)}</span>${c.trialEnd ? ' · Testphase endet' : cyc(c.s).months >= 12 ? ' · Jährlich' : ''}`, money(c.amount, c.s.currency))).join('') : '<p class="muted fin-none">In den nächsten 30 Tagen wird nichts abgebucht.</p>'}
      ${up.length > 8 ? `<p class="muted fin-none">und ${up.length - 8} weitere</p>` : ''}
    </div>`;
}
// Hinweise, bei denen sich eine Entscheidung lohnt – jeweils als Aufgabe übernehmbar
function lookItems(all) {
  const t = today(), items = [];
  const taskBtn = (ref, title, date) => (M.tasks().some((x) => x.subRef === ref)
    ? `<span class="fin-done" title="Aufgabe ist angelegt">${icon('check')}</span>`
    : `<button class="icon-btn fin-task" data-action="fin-task" data-ref="${ref}" data-title="${esc(title)}" data-date="${date < t ? t : date}" title="Als Aufgabe anlegen">${icon('plus')}</button>`);
  for (const s of all) {
    if (status(s).id === 'ended') continue;
    if (s.trial && s.anchor >= t && s.anchor <= addDays(t, 14)) {
      items.push(subRow(s, `Testphase endet ${when(s.anchor).replace(/^(Heute|Morgen)$/, (m) => m.toLowerCase())} · danach ${money(s.amount, s.currency)} pro ${cyc(s).per}`, '',
        taskBtn(`${s.id}:trial:${s.anchor}`, `${s.name}: Testphase endet – behalten oder kündigen?`, addDays(s.anchor, -1))));
      continue;
    }
    const n = nextCharge(s);
    if (n && cyc(s).months >= 6 && n.date <= addDays(t, 30)) {
      items.push(subRow(s, `Verlängert sich ${when(n.date).replace(/^(Heute|Morgen)$/, (m) => m.toLowerCase())} für ${money(n.amount, s.currency)}`, '',
        taskBtn(`${s.id}:renew:${n.date}`, `${s.name}: verlängert sich bald – noch nötig?`, addDays(n.date, -3))));
    }
    const ch = (s.prices || []).filter((p) => p.from <= t && p.from >= addDays(t, -120) && p.amount > (p.prev ?? 0)).pop();
    if (ch) items.push(subRow(s, `Teurer seit ${shortDate(ch.from)}: ${money(ch.prev, s.currency)} → ${money(ch.amount, s.currency)}`, '',
      taskBtn(`${s.id}:price:${ch.from}`, `${s.name}: Preis gestiegen – lohnt es sich noch?`, t)));
  }
  return items;
}

// Liste: alle Abos wie eine Tabelle
function listView(all) {
  const tab = ui.finListTab || 'active';
  const active = all.filter((s) => status(s).id !== 'ended'), ended = all.filter((s) => status(s).id === 'ended');
  const list = tab === 'ended' ? ended : active;
  const t = today();
  const pm = sumBase(active.filter((s) => status(s).id !== 'trial').map((s) => ({ s, amount: perMonth(s) })));
  const rows = list.map((s) => {
    const nc = nextCharge(s), st = status(s);
    const pmB = toBase(perMonth(s), s.currency);
    const showPm = (s.cycle !== 'month' || (s.currency || baseCur()) !== baseCur()) && pmB != null;
    return `<div class="fin-tr" data-action="edit-sub" data-id="${s.id}">
      <div class="c-name">${logo(s, 32)}<div><b>${esc(s.name)}</b><small>${esc(s.category || 'Ohne Kategorie')}${s.account ? ` · ${esc(s.account)}` : ''}</small></div></div>
      <div class="c-cyc">${cyc(s).label}</div>
      <div class="c-next">${nc ? `${when(nc.date)}${nc.trialEnd ? '<small>erste Abbuchung</small>' : ''}` : '–'}</div>
      <div class="c-st"><span class="chip st-${st.id}">${st.label}</span></div>
      <div class="c-amt"><b>${money(amountAt(s, t), s.currency || baseCur())}</b>${showPm ? `<small>≈ ${money(pmB)} / Monat</small>` : ''}</div>
    </div>`;
  }).join('');
  return `
    <div class="fin-list-bar">
      <div class="tabs"><button class="${tab === 'active' ? 'on' : ''}" data-action="fin-list-tab" data-v="active">Aktiv<span class="n">${active.length}</span></button><button class="${tab === 'ended' ? 'on' : ''}" data-action="fin-list-tab" data-v="ended">Gekündigt<span class="n">${ended.length}</span></button></div>
      <span class="muted">${money(pm.total)} pro Monat</span>
    </div>
    <div class="fin-table">
      <div class="fin-th"><div>Abo</div><div class="c-cyc">Rhythmus</div><div class="c-next">Nächste Abbuchung</div><div class="c-st">Status</div><div class="c-amt">Betrag</div></div>
      <div class="fin-tbody">${rows || `<div class="empty">${tab === 'ended' ? 'Noch nichts gekündigt.' : 'Keine aktiven Abos.'}</div>`}</div>
    </div>
    ${missingNote(pm.missing)}${fxNote()}`;
}

// Ausgaben: Balken pro Monat, Kennzahlen, was sich geändert hat
function spendingView(all) {
  const t = today(), n = ui.finRange || 12, m0 = monthStart(t);
  const months = Array.from({ length: n }, (_, i) => monthShift(m0, i));
  const sums = months.map((m) => sumBase(chargesAll(all, m, monthShift(m, 1))));
  const totals = sums.map((x) => x.total);
  const next = totals.reduce((a, b) => a + b, 0);
  const lastS = sumBase(chargesAll(all, monthShift(m0, -n), m0));
  const running = all.filter((s) => !['ended', 'trial'].includes(status(s).id));
  const pm = sumBase(running.map((s) => ({ s, amount: perMonth(s) })));
  const max = Math.max(...totals, 0.01);
  const missing = new Set([...sums.flatMap((x) => [...x.missing]), ...lastS.missing, ...pm.missing]);
  const changes = changeItems(all);
  return `
    <div class="panel fin-spend">
      <div class="fin-kpis">
        <div><b>${money(next)}</b><span>Nächste ${n} Monate</span></div>
        <div><b>${money(pm.total)}</b><span>pro Monat</span></div>
        <div><b>${money(lastS.total)}</b><span>Letzte ${n} Monate</span></div>
        <div class="seg mini fin-range">${[6, 12].map((x) => `<button class="${x === n ? 'on' : ''}" data-action="fin-range" data-v="${x}">${x} Monate</button>`).join('')}</div>
      </div>
      <div class="fin-bars" style="--n:${n}">
        ${months.map((m, i) => `<div class="fb ${i === 0 ? 'cur' : ''}" title="${F_MONTH.format(parseDate(m))}: ${money(totals[i])}">
          <div class="fb-track"><div class="fb-fill" style="height:${totals[i] ? Math.max(3, (totals[i] / max) * 100) : 0}%"></div></div><span>${monLabel(m)}</span></div>`).join('')}
      </div>
      <div class="fin-bars-foot"><span>${plural(running.length, 'laufendes Abo', 'laufende Abos')} · ${money(pm.total)} pro Monat</span><span>${F_MONY.format(parseDate(months[0]))} bis ${F_MONY.format(parseDate(months[n - 1]))}</span></div>
      ${missingNote(missing)}${fxNote()}
    </div>
    <div class="panel fin-changes">
      <h4>Was sich geändert hat</h4>
      <p class="muted fin-sub">Neue Abos, Preisänderungen und Kündigungen der letzten 12 Monate.</p>
      ${changes.length ? changes.join('') : '<p class="muted fin-none">Noch keine Änderungen.</p>'}
    </div>`;
}
function changeItems(all) {
  const t = today(), from = addDays(t, -365), out = [];
  // Veränderung pro Monat, möglichst in Hauptwährung
  const delta = (v, cur) => { const b = toBase(v, cur); const [x, c] = b == null ? [v, cur] : [b, baseCur()]; return `<span class="fin-delta ${x > 0 ? 'up' : 'down'}" title="pro Monat"><i></i>${x > 0 ? '+' : '−'}${money(Math.abs(x), c)}</span>`; };
  for (const s of all) {
    const start = s.trial ? s.anchor : (s.since && s.since < s.anchor ? s.since : s.anchor);
    if (start && start >= from && start <= t) out.push({ d: start, html: subRow(s, `Neu seit ${shortDate(start)}${s.trial ? ' (nach der Testphase)' : ''}`, delta(perMonth(s), s.currency || baseCur())) });
    for (const p of s.prices || []) if (p.from >= from && p.from <= t) out.push({ d: p.from, html: subRow(s, `${money(p.prev ?? 0, s.currency)} → ${money(p.amount, s.currency)} seit ${shortDate(p.from)}`, delta((p.amount - (p.prev ?? 0)) * cyc(s).perMonth, s.currency || baseCur())) });
    if (s.end && s.end >= from && s.end <= addDays(t, 60)) out.push({ d: s.end, html: subRow(s, `Gekündigt zum ${shortDate(s.end)}`, delta(-perMonth(s, addDays(s.end, -1)), s.currency || baseCur())) });
  }
  return out.sort((a, b) => b.d.localeCompare(a.d)).slice(0, 12).map((x) => x.html);
}
// Rechte Spalte bei Ausgaben: Anteil je Kategorie (pro Monat)
function byCategory(all) {
  const running = all.filter((s) => !['ended', 'trial'].includes(status(s).id));
  const cats = {};
  for (const s of running) {
    const v = toBase(perMonth(s), s.currency);
    if (v == null) continue;
    const k = s.category?.trim() || 'Ohne Kategorie';
    (cats[k] ||= { name: k, v: 0, subs: [] }).v += v;
    cats[k].subs.push(s.name);
  }
  const list = Object.values(cats).sort((a, b) => b.v - a.v);
  const total = list.reduce((a, c) => a + c.v, 0);
  if (!list.length) return '<div class="fin-side-h">Nach Kategorie</div><p class="muted fin-none">Noch keine laufenden Abos.</p>';
  const sel = list.find((c) => c.name === ui.finCat) || list[0];
  let before = 0;
  for (const c of list) { if (c === sel) break; before += c.v; }
  const names = (c) => (c.subs.length > 2 ? `${c.subs.slice(0, 2).join(', ')} und ${c.subs.length - 2} weitere` : c.subs.join(', '));
  return `
    <div class="fin-side-h">Nach Kategorie</div>
    <div class="fin-cat-donut">
      ${donut([{ v: before / total, color: 'transparent' }, { v: sel.v / total, color: 'var(--fin)' }], 168, 14)}
      <div class="donut-c"><span>${esc(sel.name)}</span><b>${money(sel.v)}</b><small>${Math.round((sel.v / total) * 100)} % von ${money(total)}</small></div>
    </div>
    <div class="fin-cats">${list.map((c) => `
      <div class="fin-cat ${c === sel ? 'on' : ''}" data-action="fin-cat" data-c="${esc(c.name)}">
        <div class="fin-row-t"><b>${esc(c.name)}</b><small>${esc(names(c))}</small></div>
        <span class="muted">${Math.round((c.v / total) * 100)} %</span><b class="fin-row-v">${money(c.v)}</b>
      </div>`).join('')}</div>`;
}

// ---------- Dialoge ----------
export const isFinModal = (m) => m && (m.type === 'sub' || m.type === 'fin-day');
export function finModalHTML(m) {
  let inner = '';
  if (m.type === 'sub') {
    const s = m.sub;
    const cats = [...new Set(store.all('subs').map((x) => x.category).filter(Boolean))].sort();
    inner = `
      <h2>${s.id ? esc(s.name) : 'Neues Abo'}</h2>
      <div class="field"><label>Name</label><input id="s-name" value="${esc(s.name || '')}" placeholder="z. B. Claude Max" autocomplete="off" ${s.id ? '' : 'autofocus'}></div>
      <div class="fin-form-row">
        <div class="field"><label>Betrag</label><input id="s-amount" type="number" inputmode="decimal" step="0.01" min="0" value="${s.amount ?? ''}" placeholder="0,00"></div>
        <div class="field"><label>Währung</label><select id="s-cur">${CURRENCIES.map((c) => `<option ${c === (s.currency || baseCur()) ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Rhythmus</label><select id="s-cycle">${Object.entries(CYCLES).map(([k, c]) => `<option value="${k}" ${k === (s.cycle || 'month') ? 'selected' : ''}>${c.label}</option>`).join('')}</select></div>
      </div>
      <div class="fin-form-row two">
        <div class="field"><label>${s.id ? 'Abbuchung am' : 'Nächste Abbuchung'}</label><input id="s-anchor" type="date" value="${s.anchor || today()}"></div>
        <div class="field"><label>Läuft seit <span class="muted">(optional)</span></label><input id="s-since" type="date" value="${s.since || ''}"></div>
      </div>
      <label class="fin-check"><input type="checkbox" id="s-trial" ${s.trial ? 'checked' : ''}> Testphase: bis zur ersten Abbuchung kostenlos</label>
      <div class="fin-form-row two">
        <div class="field"><label>Kategorie</label><input id="s-cat" list="fin-cats" value="${esc(s.category || '')}" placeholder="z. B. KI, Trading" autocomplete="off"><datalist id="fin-cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="field"><label>Konto / Karte <span class="muted">(optional)</span></label><input id="s-acc" value="${esc(s.account || '')}" placeholder="z. B. C24" autocomplete="off"></div>
      </div>
      <div class="field"><label>Website <span class="muted">(optional, für das Logo)</span></label><input id="s-domain" value="${esc(s.domain || '')}" placeholder="z. B. claude.ai" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
      ${s.id ? `<div class="field"><label>Gekündigt zum <span class="muted">(ab diesem Tag keine Abbuchung mehr)</span></label><input id="s-end" type="date" value="${s.end || ''}"></div>` : ''}
      <div class="foot">
        ${s.id ? `<button class="btn danger" data-action="delete-sub" data-id="${s.id}" style="margin-right:auto">${icon('trash')} Löschen</button>` : ''}
        <button class="btn" data-action="close-modal">Abbrechen</button><button class="btn primary" data-action="save-sub">Speichern</button></div>`;
  } else if (m.type === 'fin-day') {
    const cs = chargesAll(subs(), m.date, addDays(m.date, 1));
    inner = `
      <h2>${esc(longDate(m.date))}</h2>
      <p>${plural(cs.length, 'Abbuchung', 'Abbuchungen')} · ${money(sumBase(cs).total)}</p>
      <div class="fin-day-list">${cs.map((c) => subRow(c.s, `${cyc(c.s).label}${c.trialEnd ? ' · Testphase endet' : ''}`, money(c.amount, c.s.currency || baseCur()))).join('')}</div>
      <div class="foot"><button class="btn" data-action="new-sub" data-date="${m.date}">${icon('plus')} Abo an diesem Tag</button><button class="btn primary" data-action="close-modal">Fertig</button></div>`;
  }
  return `<div class="overlay modal-overlay" data-action="close-modal"></div><div class="modal fin-modal" role="dialog">${inner}</div>`;
}
// Formular lesen; Preisänderung wird mit Datum gemerkt (für „Was sich geändert hat“)
export function readSubForm(prev) {
  const $ = (id) => document.getElementById(id);
  const name = $('s-name').value.trim();
  const amount = Math.round(parseFloat(String($('s-amount').value).replace(',', '.')) * 100) / 100;
  const anchor = $('s-anchor').value;
  if (!name) return { error: 'Bitte einen Namen eingeben.' };
  if (!(amount >= 0)) return { error: 'Bitte einen Betrag eingeben.' };
  if (!anchor) return { error: 'Bitte das Datum einer Abbuchung angeben.' };
  const sub = {
    ...prev, name, amount, anchor,
    currency: $('s-cur').value, cycle: $('s-cycle').value,
    since: $('s-since').value || null, trial: $('s-trial').checked,
    category: $('s-cat').value.trim(), account: $('s-acc').value.trim(),
    domain: cleanDomain($('s-domain').value) || null,
    end: $('s-end') ? $('s-end').value || null : prev.end || null,
  };
  if (prev.id && prev.amount != null && +prev.amount !== amount && !prev.trial) {
    sub.prices = [...(prev.prices || []), { from: today(), amount, prev: +prev.amount }];
  }
  return { sub };
}
