// Finanzen → Kredite: was schon bezahlt ist, was noch offen ist, wann alles abbezahlt ist.
// Die Raten erscheinen zusätzlich im Abo-Kalender (siehe chargesOf in finance.js).
import * as store from './store.js';
import { ui } from './ui.js';
import { icon } from './icons.js';
import { head } from './views.js';
import { esc, today, addDays, parseDate } from './util.js';
import { money, logo, baseCur, toBase, ensureFx, areaTabs, CURRENCIES } from './finance.js';
import { loans, stats, calc, asSub, loanSubs, loanCharges, LOAN_CYCLES } from './loanmath.js';

const F_DAY = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
const F_MONY = new Intl.DateTimeFormat('de-DE', { month: 'short', year: 'numeric' });
const F_SHORT = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });
const day = (d) => F_DAY.format(parseDate(d));
const mony = (d) => F_MONY.format(parseDate(d));
const pctTxt = (x) => `${Math.round(x * 100)} %`;
const zins = (l) => (+l.interest ? `${String(+l.interest).replace('.', ',')} % Zinsen` : 'zinsfrei');
const cur = (l) => l.currency || baseCur();
// „noch 2 Jahre, 3 Monate“
function until(end, t = today()) {
  const [y1, m1] = t.split('-').map(Number), [y2, m2] = end.split('-').map(Number);
  const n = (y2 - y1) * 12 + (m2 - m1);
  if (n <= 0) return 'diesen Monat';
  const y = Math.floor(n / 12), m = n % 12;
  return 'noch ' + [y && `${y} ${y === 1 ? 'Jahr' : 'Jahre'}`, m && `${m} ${m === 1 ? 'Monat' : 'Monate'}`].filter(Boolean).join(', ');
}
const perMonth = (l) => (+l.rate || 0) / (LOAN_CYCLES[l.cycle] || LOAN_CYCLES.month).months;
// Summe in Hauptwährung; ohne Wechselkurs nicht raten
function sumBase(items) {
  let total = 0; const missing = new Set();
  for (const [v, c] of items) { const b = toBase(v, c); if (b == null) missing.add(c); else total += b; }
  return { total, missing };
}

// ---------- Ansicht ----------
export function viewLoans() {
  ensureFx();
  const list = loans();
  const actions = `<button class="btn primary" data-action="new-loan" title="Neuer Kredit">${icon('plus')}<span class="lbl-long">Kredit</span></button>`;
  const top = head('Finanzen', '', actions, 'fin-head pf-head', areaTabs('finance/loans'));
  if (!list.length) return `${top}
    <div class="panel fin-empty"><span class="fin-empty-ic">${icon('coins')}</span><h3>Noch keine Kredite</h3>
      <p class="muted">Trag Kredite und Ratenzahlungen ein, zum Beispiel Auto, Handy oder Möbel. Du siehst dann, wie viel schon bezahlt ist, was noch offen ist und wann alles abbezahlt ist. Die Raten erscheinen auch im Abo-Kalender.</p>
      <button class="btn primary" data-action="new-loan">${icon('plus')} Ersten Kredit eintragen</button></div>`;

  const t = today();
  const rows = list.map((l) => ({ l, s: stats(l, t) }));
  const running = rows.filter((r) => !r.s.finished && !r.s.error), done = rows.filter((r) => r.s.finished), broken = rows.filter((r) => r.s.error);
  const rest = sumBase(running.map((r) => [r.s.balance, cur(r.l)]));
  const paid = sumBase(rows.map((r) => [r.s.paid, cur(r.l)]));
  const pm = sumBase(running.map((r) => [perMonth(r.l), cur(r.l)]));
  const left = sumBase(running.map((r) => [r.s.left, cur(r.l)]));
  const repaid = sumBase(rows.filter((r) => !r.s.error).map((r) => [r.s.repaid, cur(r.l)]));
  const princ = sumBase(rows.filter((r) => !r.s.error).map((r) => [r.s.P, cur(r.l)]));
  const leftInt = sumBase(running.map((r) => [r.s.leftInterest, cur(r.l)]));
  const paidInt = sumBase(rows.map((r) => [r.s.paidInterest, cur(r.l)]));
  const free = running.map((r) => r.s.end).sort().pop();
  const missing = new Set([...rest.missing, ...paid.missing, ...pm.missing, ...left.missing]);

  const kpi = (lbl, val, sub) => `<div class="stat pf-kpi"><div class="lbl">${lbl}</div><div class="pf-kpi-v"><b>${val}</b></div>${sub ? `<small class="muted lo-kpi-sub">${sub}</small>` : ''}</div>`;
  const pct = princ.total ? repaid.total / princ.total : 0;
  const soon = loanSubs().flatMap((s) => loanCharges(s, t, addDays(t, 62))).sort((a, b) => a.date.localeCompare(b.date));
  const side = `
    <div class="fin-side-h">Übersicht</div>
    <div class="fin-ov">
      <div class="donut">${donutSvg(pct)}<div class="donut-c"><b>${pctTxt(pct)}</b><span>getilgt</span></div></div>
      <div class="fin-ov-nums">
        <div><span class="lg"><i style="background:var(--fin)"></i>Getilgt</span><b>${money(repaid.total)}</b><small>von ${money(princ.total)}</small></div>
        <div><span class="lg"><i class="hollow"></i>Restschuld</span><b>${money(rest.total)}</b><small>${running.length === 1 ? '1 Kredit läuft' : `${running.length} Kredite laufen`}</small></div>
      </div>
    </div>
    <div class="fin-sec"><div class="fin-sec-h">Zinsen</div>
      <div class="lo-int"><div><span class="muted">Schon bezahlt</span><b>${money(paidInt.total)}</b></div><div><span class="muted">Kommen noch</span><b>${money(leftInt.total)}</b></div></div>
    </div>
    <div class="fin-sec"><div class="fin-sec-h">Nächste Raten <span class="fin-badge">${soon.length}</span></div>
      ${soon.length ? soon.slice(0, 6).map((c) => `<div class="fin-row" data-action="edit-loan" data-id="${c.s.id}">${logo(c.s, 28)}<div class="fin-row-t"><b>${esc(c.s.name)}</b><small>${c.date === t ? '<span class="warn">Heute</span>' : F_SHORT.format(parseDate(c.date))} · ${c.loan === 'extra' ? 'Sondertilgung' : c.loan === 'last' ? 'letzte Rate 🎉' : `Rate ${c.n} von ${c.of}`}</small></div><span class="fin-row-v">${money(c.amount, cur(c.s))}</span></div>`).join('')
        : '<p class="muted fin-none">In den nächsten zwei Monaten ist keine Rate fällig.</p>'}
    </div>`;

  const main = `
    ${running.map(card).join('')}
    ${broken.map(card).join('')}
    ${done.length ? `<div class="tsec-head lo-done-h"><span class="tsec-title">Abbezahlt</span><span class="mono muted">${done.length}</span></div>${done.map(card).join('')}` : ''}
    ${missing.size ? `<p class="fin-note">${[...missing].join(', ')}-Beträge sind in den Summen nicht mitgerechnet, weil gerade kein Wechselkurs geladen werden konnte.</p>` : ''}`;

  return `${top}
    <div class="stats pf-kpis lo-kpis">
      ${kpi('Restschuld', money(rest.total), `${money(left.total)} mit Zinsen`)}
      ${kpi('Schon bezahlt', money(paid.total), 'Raten inkl. Zinsen')}
      ${kpi('Raten pro Monat', money(pm.total), running.length ? `${running.length} ${running.length === 1 ? 'Kredit' : 'Kredite'}` : 'nichts mehr offen')}
      ${kpi('Schuldenfrei', free ? mony(free) : '🎉', free ? until(free, t) : 'alles abbezahlt')}
    </div>
    <div class="fin-grid"><div class="fin-main lo-main">${main}</div><aside class="fin-side panel">${side}</aside></div>`;
}

function donutSvg(v, size = 112, stroke = 11) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r, len = Math.max(0, Math.min(1, v)) * C;
  return `<svg class="donut-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><g transform="rotate(-90 ${size / 2} ${size / 2})">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--fin-track)" stroke-width="${stroke}"/>
    ${len > 0 ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--fin)" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${Math.max(0.01, len - (v < 1 ? 3 : 0))} ${C}"/>` : ''}</g></svg>`;
}

function card({ l, s }) {
  const c = cur(l), open = ui.loanOpen === l.id, t = today();
  const sub = [l.lender && esc(l.lender), zins(l), `${money(+l.rate, c)} ${(LOAN_CYCLES[l.cycle] || LOAN_CYCLES.month).label}`].filter(Boolean).join(' · ');
  const topRow = `
    <div class="lo-top" data-action="loan-toggle" data-id="${l.id}">
      ${logo(asSub(l), 36)}
      <div class="lo-t"><b>${esc(l.name || 'Kredit')}</b><small>${sub}</small></div>
      <div class="lo-rest">${s.error ? '' : s.finished ? '<span class="chip st-active">Abbezahlt 🎉</span>' : `<small>Restschuld</small><b>${money(s.balance, c)}</b>`}</div>
      <button class="icon-btn lo-edit" data-action="edit-loan" data-id="${l.id}" title="Bearbeiten">${icon('pen')}</button>
    </div>`;
  if (s.error) return `<div class="panel lo-card bad">${topRow}<p class="fin-note m-err" style="margin:0">${s.error === 'rate' ? `Die Rate ist kleiner als die Zinsen (${money(calc(l).int || 0, c)}). So wird der Kredit nie abbezahlt. Bitte Rate oder Zins prüfen.` : 'Bitte Betrag, Rate und erste Rate prüfen.'}</p></div>`;
  const nums = s.finished ? `
    <div class="lo-nums">
      <div><span>Bezahlt</span><b>${money(s.paid, c)}</b><small>davon ${money(s.paidInterest, c)} Zinsen</small></div>
      <div><span>Raten</span><b>${s.count}</b><small>${money(s.lastAmount, c)} zuletzt</small></div>
      <div><span>Abbezahlt</span><b>${day(s.end)}</b><small>Kredit über ${money(s.P, c)}</small></div>
    </div>` : `
    <div class="lo-bar" title="${pctTxt(s.pct)} getilgt"><i style="width:${(s.pct * 100).toFixed(1)}%"></i></div>
    <div class="lo-nums">
      <div><span>Getilgt</span><b>${money(s.repaid, c)}</b><small>${pctTxt(s.pct)} von ${money(s.P, c)}</small></div>
      <div><span>Bezahlt</span><b>${money(s.paid, c)}</b><small>davon ${money(s.paidInterest, c)} Zinsen</small></div>
      <div><span>Raten</span><b>${s.done} von ${s.count}</b><small>${s.next ? `nächste ${s.next.date === t ? 'heute' : F_SHORT.format(parseDate(s.next.date))}` : ''}</small></div>
      <div><span>Abbezahlt</span><b>${mony(s.end)}</b><small>${until(s.end, t)}</small></div>
    </div>`;
  return `<div class="panel lo-card ${open ? 'open' : ''} ${s.finished ? 'fin' : ''}">
    ${topRow}${nums}
    ${open ? plan(l, s) : ''}
    <button class="lo-more" data-action="loan-toggle" data-id="${l.id}">${open ? 'Tilgungsplan ausblenden' : 'Tilgungsplan'} ${icon('right')}</button>
  </div>`;
}

// Tilgungsplan nach Jahren: Raten, Zinsen, Tilgung, Restschuld am Jahresende
function plan(l, s) {
  const c = cur(l), years = {}, y0 = today().slice(0, 4);
  for (const x of s.list) {
    const y = x.date.slice(0, 4);
    const o = (years[y] ||= { y, n: 0, pay: 0, int: 0, pr: 0, bal: 0, extra: 0 });
    if (x.extra) o.extra += x.amount; else o.n++;
    o.pay += x.amount; o.int += x.interest; o.pr += x.principal; o.bal = x.balance;
  }
  const rows = Object.values(years).map((o) => `<div class="lo-pr ${o.y === y0 ? 'cur' : ''} ${o.y < y0 ? 'past' : ''}">
    <span>${o.y}</span><span>${o.n}${o.extra ? ` <small title="Sondertilgung">+ ${money(o.extra, c)}</small>` : ''}</span><span>${money(o.int, c)}</span><span>${money(o.pr, c)}</span><span>${money(o.bal, c)}</span></div>`).join('');
  return `<div class="lo-plan">
    <div class="lo-pr lo-ph"><span>Jahr</span><span>Raten</span><span>Zinsen</span><span>Tilgung</span><span>Restschuld</span></div>
    ${rows}
    <div class="lo-pr lo-pf"><span>Gesamt</span><span>${s.count}</span><span>${money(s.interest, c)}</span><span>${money(s.P, c)}</span><span>${money(s.total, c)} <small>gezahlt</small></span></div>
  </div>`;
}

// ---------- Dialog ----------
export const isLoanModal = (m) => m?.type === 'loan';
export function loanModalHTML(m) {
  const l = m.l, b = baseCur();
  const extras = (l.extra || []).map((x, i) => `<div class="lo-x"><span>${day(x.date)}</span><b>${money(+x.amount, l.currency || b)}</b><button class="icon-btn" data-action="loan-extra-del" data-i="${i}" title="Entfernen">${icon('x')}</button></div>`).join('');
  return `<div class="overlay modal-overlay" data-action="close-modal"></div><div class="modal fin-modal loan-modal" role="dialog">
    <h2>${l.id ? esc(l.name) : 'Neuer Kredit'}</h2>
    <div class="fin-form-row two">
      <div class="field"><label>Name</label><input id="l-name" value="${esc(l.name || '')}" placeholder="z. B. Autokredit" autocomplete="off" ${l.id ? '' : 'autofocus'}></div>
      <div class="field"><label>Bank <span class="muted">(optional)</span></label><input id="l-lender" value="${esc(l.lender || '')}" placeholder="z. B. Santander" autocomplete="off"></div>
    </div>
    <div class="fin-form-row two">
      <div class="field"><label>Kreditbetrag</label><input id="l-principal" type="number" inputmode="decimal" step="0.01" min="0" value="${l.principal ?? ''}" placeholder="0,00"></div>
      <div class="field"><label>Währung</label><select id="l-cur">${CURRENCIES.map((c) => `<option ${c === (l.currency || b) ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    </div>
    <div class="fin-form-row two">
      <div class="field"><label>Rate</label><input id="l-rate" type="number" inputmode="decimal" step="0.01" min="0" value="${l.rate ?? ''}" placeholder="0,00"></div>
      <div class="field"><label>Rhythmus</label><select id="l-cycle">${Object.entries(LOAN_CYCLES).map(([k, c]) => `<option value="${k}" ${k === (l.cycle || 'month') ? 'selected' : ''}>${c.label[0].toUpperCase() + c.label.slice(1)}</option>`).join('')}</select></div>
    </div>
    <div class="fin-form-row two">
      <div class="field"><label>Sollzins % p. a.</label><input id="l-int" type="number" inputmode="decimal" step="0.01" min="0" value="${l.interest ?? ''}" placeholder="0 = zinsfrei"></div>
      <div class="field"><label>Erste Rate am</label><input id="l-anchor" type="date" value="${l.anchor || ''}"></div>
    </div>
    <div class="lo-prev" id="lo-prev">${previewHTML(l)}</div>
    <details class="lo-opt" ${l.lender || l.domain || l.account || (l.extra || []).length ? 'open' : ''}>
      <summary>Mehr: Sondertilgungen, Logo, Konto</summary>
      <div class="field"><label>Sondertilgungen <span class="muted">(Extra-Zahlungen, senken die Restschuld)</span></label>
        ${extras ? `<div class="lo-xs">${extras}</div>` : ''}
        <div class="lo-xadd"><input id="lx-date" type="date" value="${today()}"><input id="lx-amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="Betrag"><button class="btn" data-action="loan-extra-add">${icon('plus')} Hinzufügen</button></div>
      </div>
      <div class="fin-form-row two">
        <div class="field"><label>Website <span class="muted">(für das Logo)</span></label><input id="l-domain" value="${esc(l.domain || '')}" placeholder="z. B. santander.de" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <div class="field"><label>Konto <span class="muted">(optional)</span></label><input id="l-acc" value="${esc(l.account || '')}" placeholder="z. B. C24" autocomplete="off"></div>
      </div>
    </details>
    <p class="fin-note lo-hint">Läuft der Kredit schon länger und du kennst die Daten vom Anfang nicht? Dann trag die aktuelle Restschuld als Kreditbetrag ein und als erste Rate die nächste.</p>
    ${m.err ? `<p class="fin-note m-err">${esc(m.err)}</p>` : ''}
    <div class="foot">
      ${l.id ? `<button class="btn danger" data-action="delete-loan" data-id="${l.id}" style="margin-right:auto">${icon('trash')} Löschen</button>` : ''}
      <button class="btn" data-action="close-modal">Abbrechen</button><button class="btn primary" data-action="save-loan">Speichern</button>
    </div>
  </div>`;
}
// Live-Vorschau beim Tippen: Laufzeit, letzte Rate, Zinsen, Stand heute
function previewHTML(l) {
  const c = l.currency || baseCur();
  const r = calc(l);
  if (r.error === 'input') return `<span class="muted">${icon('sparkle')} Betrag, Rate und erste Rate eintragen, dann rechnet die App den Plan aus.</span>`;
  if (r.error === 'rate') return `<span class="m-err">Die Rate ist kleiner als die Zinsen pro Rate (${money(r.int, c)}). So wird der Kredit nie abbezahlt.</span>`;
  if (r.error === 'long') return '<span class="m-err">Mit dieser Rate dauert es über 100 Jahre. Stimmt die Rate?</span>';
  const s = stats({ ...l }, today());
  const now = s.done ? `<br>Stand heute: ${s.done} ${s.done === 1 ? 'Rate' : 'Raten'} bezahlt, Restschuld <b>${money(s.balance, c)}</b>.` : '';
  return `${icon('check')} <span><b>${s.count} ${s.count === 1 ? 'Rate' : 'Raten'}</b>, letzte am ${day(s.end)}${s.lastAmount !== +l.rate ? ` (${money(s.lastAmount, c)})` : ''}. Zinsen gesamt <b>${money(s.interest, c)}</b>, zusammen ${money(s.total, c)}.${now}</span>`;
}
const num = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) ? Math.round(x * 100) / 100 : null; };
// Formular in ui.modal übernehmen (vor jedem Neuzeichnen, damit nichts verloren geht)
export function captureLoan(m) {
  const $ = (id) => document.getElementById(id);
  if (!$('l-name')) return;
  Object.assign(m.l, {
    name: $('l-name').value, lender: $('l-lender').value, principal: num($('l-principal').value), currency: $('l-cur').value,
    rate: num($('l-rate').value), cycle: $('l-cycle').value, interest: num($('l-int').value) ?? 0, anchor: $('l-anchor').value,
    domain: $('l-domain').value, account: $('l-acc').value,
  });
}
export function updatePreview(m) { captureLoan(m); const el = document.getElementById('lo-prev'); if (el) el.innerHTML = previewHTML(m.l); }
export function addExtra(m) {
  captureLoan(m);
  const d = document.getElementById('lx-date')?.value, a = num(document.getElementById('lx-amount')?.value);
  if (!d || !(a > 0)) return 'Für die Sondertilgung Datum und Betrag eintragen.';
  m.l.extra = [...(m.l.extra || []), { date: d, amount: a }].sort((x, y) => x.date.localeCompare(y.date));
  return null;
}
export function delExtra(m, i) { captureLoan(m); m.l.extra = (m.l.extra || []).filter((_, k) => k !== i); }
export function readLoanForm(m) {
  captureLoan(m);
  const l = m.l;
  if (!l.name.trim()) return { error: 'Bitte einen Namen eingeben.' };
  if (!(l.principal > 0)) return { error: 'Bitte den Kreditbetrag eintragen.' };
  if (!(l.rate > 0)) return { error: 'Bitte die Rate eintragen.' };
  if (!l.anchor) return { error: 'Bitte das Datum der ersten Rate eintragen.' };
  const r = calc(l);
  if (r.error === 'rate') return { error: 'Die Rate ist kleiner als die Zinsen. Bitte Rate oder Zins prüfen.' };
  if (r.error) return { error: 'Mit dieser Rate wird der Kredit nicht abbezahlt. Bitte prüfen.' };
  const dom = String(l.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0].replace(/[^a-z0-9.-]/g, '');
  return { loan: { ...l, name: l.name.trim(), lender: l.lender.trim(), account: l.account.trim(), domain: dom || null, extra: l.extra || [] } };
}
