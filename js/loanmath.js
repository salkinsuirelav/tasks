// Kredite: Rechnen ohne Oberfläche (Tilgungsplan, Stand heute, Raten für den Abo-Kalender).
// Annuitätendarlehen: feste Rate, Zinsen je Rate auf die Restschuld (Sollzins / 12 bzw. / 4), die letzte Rate ist kleiner.
// Sondertilgungen senken die Restschuld an ihrem Tag. Daten liegen in der Sammlung „loans“ und synchronisieren wie Abos.
import * as store from './store.js';
import { today, addDays } from './util.js';

export const LOAN_CYCLES = { month: { label: 'pro Monat', months: 1 }, quarter: { label: 'pro Quartal', months: 3 } };
export const loans = () => store.all('loans').sort((a, b) => (a.anchor || '').localeCompare(b.anchor || '') || (a.name || '').localeCompare(b.name || '', 'de'));

const pad = (n) => String(n).padStart(2, '0');
const r2 = (x) => Math.round(x * 100) / 100;
// Gleicher Tag n Monate später, am Monatsende gekappt (31. Jan → 28. Feb)
function shift(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(y, m - 1 + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(Math.min(d, last))}`;
}

// Tilgungsplan: [{ date, amount, interest, principal, balance, n }] (n = Nummer der Rate, Sondertilgung: extra)
const cache = new WeakMap();
export function schedule(l) {
  if (cache.has(l)) return cache.get(l);
  const res = calc(l);
  cache.set(l, res);
  return res;
}
export function calc(l) {
  const P = +l.principal, R = +l.rate, months = (LOAN_CYCLES[l.cycle] || LOAN_CYCLES.month).months;
  const r = ((+l.interest || 0) / 100) * (months / 12);
  if (!l.anchor || !(P > 0) || !(R > 0)) return { list: [], error: 'input' };
  const extras = (l.extra || []).filter((x) => x.date && +x.amount > 0).slice().sort((a, b) => a.date.localeCompare(b.date));
  const list = [];
  let B = r2(P), ei = 0;
  for (let k = 0; k < 1200 && B > 0.004; k++) {
    const date = shift(l.anchor, k * months);
    while (ei < extras.length && extras[ei].date <= date && B > 0.004) {
      const a = r2(Math.min(B, +extras[ei].amount));
      B = r2(B - a);
      list.push({ date: extras[ei].date, amount: a, interest: 0, principal: a, balance: B, extra: true });
      ei++;
    }
    if (B <= 0.004) break;
    const int = r2(B * r);
    const pay = r2(Math.min(R, B + int));
    const pr = r2(pay - int);
    if (pr <= 0) return { list: [], error: 'rate', int };
    B = r2(B - pr);
    list.push({ date, amount: pay, interest: int, principal: pr, balance: B, n: list.filter((x) => !x.extra).length + 1 });
  }
  if (B > 0.004) return { list: [], error: 'long' };
  return { list, error: null };
}

// Stand an einem Tag: bezahlt, Restschuld, offene Raten, Ende
export function stats(l, t = today()) {
  const { list, error } = schedule(l);
  const P = +l.principal || 0;
  const past = list.filter((x) => x.date <= t), future = list.filter((x) => x.date > t);
  const regular = list.filter((x) => !x.extra);
  const sum = (a, k) => r2(a.reduce((s, x) => s + x[k], 0));
  const balance = past.length ? past[past.length - 1].balance : P;
  const last = regular[regular.length - 1] || null;
  return {
    error, list, P, balance,
    paid: sum(past, 'amount'), paidInterest: sum(past, 'interest'), repaid: r2(P - balance),
    left: sum(future, 'amount'), leftInterest: sum(future, 'interest'),
    interest: sum(list, 'interest'), total: sum(list, 'amount'),
    count: regular.length, done: regular.filter((x) => x.date <= t).length,
    next: future.find((x) => !x.extra) || null, end: last?.date || null, lastAmount: last?.amount ?? null,
    pct: P ? Math.max(0, Math.min(1, (P - balance) / P)) : 0,
    finished: !error && balance <= 0.004,
  };
}

// Für den Abo-Kalender: Kredit sieht dort aus wie ein Abo (Logo, Name, Betrag)
export const asSub = (l) => ({
  id: l.id, name: l.name || 'Kredit', currency: l.currency, domain: l.domain, color: l.color, loan: true,
  cycle: l.cycle === 'quarter' ? 'quarter' : 'month', amount: +l.rate || 0, anchor: l.anchor, category: 'Kredit',
});
export const loanSubs = () => loans().map(asSub);
export function loanCharges(s, from, to) {
  const l = store.get('loans', s.id);
  if (!l) return [];
  const { list } = schedule(l), regular = list.filter((x) => !x.extra);
  const lastN = regular.length;
  return list.filter((x) => x.date >= from && x.date < to).map((x) => ({ s, date: x.date, amount: x.amount, loan: x.extra ? 'extra' : x.n === lastN ? 'last' : 'rate', n: x.n, of: lastN }));
}
export const loansSoon = (days = 31) => { const t = today(); return loanSubs().flatMap((s) => loanCharges(s, t, addDays(t, days))); };
