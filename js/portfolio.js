// Finanzen › Portfolio: Positionen, Aufteilung, Wertentwicklung (Aufbau wie das HeroUI-Pro-Finanz-Template).
// Krypto-Kurse + Verlauf kommen automatisch von CoinGecko (ohne Schlüssel). Aktien/ETFs pflegst du von Hand
// (Börsen-Kurse lassen sich ohne Server nicht direkt im Browser abrufen; später ggf. über den Mac-Helfer).
// Daten: Sammlung „holdings“ { kind, name, symbol, cgId, image, qty, buy, price, currency, prices: [{ d, p }] }
import * as store from './store.js';
import { ui } from './ui.js';
import { icon } from './icons.js';
import { head } from './views.js';
import { money, baseCur, toBase, ensureFx, logo, areaTabs } from './finance.js';
import { esc, today, addDays, toDateStr } from './util.js';

export const KINDS = { crypto: 'Krypto', stock: 'Aktie / ETF', cash: 'Bargeld', other: 'Sonstiges' };
const PALETTE = ['oklch(0.55 0.2 260)', 'oklch(0.72 0.17 55)', 'oklch(0.6 0.17 285)', 'oklch(0.7 0.13 230)', 'oklch(0.45 0.18 265)', 'oklch(0.6 0.22 305)', 'oklch(0.7 0.15 160)', 'oklch(0.65 0.2 25)', 'oklch(0.75 0.12 95)'];
export const holdings = () => store.all('holdings');
const RANGES = [[7, '1W'], [30, '1M'], [90, '3M'], [365, '1J']];

// ---------- CoinGecko: Kurse, 7-Tage-Verlauf, Historie ----------
const CG = 'https://api.coingecko.com/api/v3';
const CG_KEY = 'taskapp-cg';
let cg = (() => { try { return JSON.parse(localStorage.getItem(CG_KEY) || 'null'); } catch { return null; } })() || { vs: '', at: 0, coins: {}, hist: {} };
const saveCg = () => { try { localStorage.setItem(CG_KEY, JSON.stringify(cg)); } catch {} };
const listeners = new Set();
export const onPrices = (fn) => listeners.add(fn);
const notify = () => listeners.forEach((f) => f());
let busy = false, histBusy = false;
const cryptoIds = () => [...new Set(holdings().filter((h) => h.kind === 'crypto' && h.cgId).map((h) => h.cgId))];
function ensureCg() {
  const ids = cryptoIds(), vs = baseCur().toLowerCase();
  if (!ids.length || busy) return;
  const fresh = cg.vs === vs && Date.now() - cg.at < 5 * 60000 && ids.every((id) => cg.coins[id]);
  if (fresh || (cg.failAt && Date.now() - cg.failAt < 2 * 60000)) return;
  busy = true;
  fetch(`${CG}/coins/markets?vs_currency=${vs}&ids=${ids.join(',')}&sparkline=true&price_change_percentage=24h`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((list) => {
      if (cg.vs !== vs) cg = { vs, at: 0, coins: {}, hist: {} };
      for (const c of list) {
        const sp = c.sparkline_in_7d?.price || [];
        cg.coins[c.id] = { price: c.current_price, ch24: c.price_change_percentage_24h, image: c.image, spark: sp.filter((_, i) => i % 4 === 0 || i === sp.length - 1) };
      }
      cg.at = Date.now(); cg.failAt = 0; saveCg(); notify();
    })
    .catch(() => { cg.failAt = Date.now(); })
    .finally(() => { busy = false; });
}
// Historie für den Chart: pro Münze einmal pro Stunde und Zeitraum
async function ensureHist(days) {
  const ids = cryptoIds(), vs = baseCur().toLowerCase(), key = `${vs}:${days}`;
  if (!ids.length || histBusy) return;
  const h = cg.hist?.[key];
  const missing = ids.filter((id) => !h?.[id] || Date.now() - (h.at || 0) > 3600000);
  if (!missing.length || (cg.histFail && Date.now() - cg.histFail < 2 * 60000)) return;
  histBusy = true;
  try {
    const next = { ...(h && Date.now() - (h.at || 0) <= 3600000 ? h : {}), at: Date.now() };
    for (const id of missing) {
      const r = await fetch(`${CG}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=${vs}&days=${days}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const pts = j.prices || [];
      const step = Math.max(1, Math.floor(pts.length / 120));
      next[id] = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map(([t, p]) => [Math.round(t / 60000), +p.toPrecision(7)]);
    }
    cg.hist = { ...(cg.hist || {}), [key]: next };
    saveCg(); notify();
  } catch { cg.histFail = Date.now(); } finally { histBusy = false; }
}
export async function searchCoins(q) {
  const r = await fetch(`${CG}/search?query=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error('CoinGecko antwortet gerade nicht.');
  const j = await r.json();
  return (j.coins || []).slice(0, 6).map((c) => ({ id: c.id, name: c.name, symbol: c.symbol, thumb: c.thumb }));
}

// ---------- Werte ----------
const priceOf = (h) => {
  if (h.kind === 'cash') return 1;
  if (h.kind === 'crypto') return cg.coins?.[h.cgId]?.price ?? h.price ?? null;
  return h.price ?? null;
};
const curOf = (h) => (h.kind === 'crypto' ? baseCur() : h.currency || baseCur());
const valueOf = (h) => { const p = priceOf(h); return p == null ? null : toBase((+h.qty || 0) * p, curOf(h)); };
const costOf = (h) => (h.kind === 'cash' ? toBase(+h.qty || 0, curOf(h)) : h.buy ? toBase((+h.qty || 0) * h.buy, curOf(h)) : null);
const label = (h) => (h.symbol ? h.symbol.toUpperCase() : h.name || '?');
const pct = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : null);
const fmtPct = (v, sign = true) => (v == null || !isFinite(v) ? '' : `${sign && v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`);
const trend = (v) => (v == null || !isFinite(v) ? '' : `<span class="pf-trend ${v >= 0 ? 'up' : 'down'}">${icon(v >= 0 ? 'up' : 'down')}${fmtPct(Math.abs(v), false)}</span>`);

// Wert der aktuellen Positionen über die Zeit (Krypto: echte Kurse, sonst die von dir eingetragenen Kurse)
function series(list, days) {
  const now = Date.now(), from = now - days * 864e5;
  const n = days <= 7 ? 42 : days <= 30 ? 30 : days <= 90 ? 45 : 52;
  const ts = Array.from({ length: n + 1 }, (_, i) => from + ((now - from) * i) / n);
  const key = `${baseCur().toLowerCase()}:${days}`;
  const at = (arr, t) => { let v = null; for (const [m, p] of arr) { if (m * 60000 <= t) v = p; else break; } return v ?? arr[0]?.[1] ?? null; };
  return ts.map((t, i) => {
    let sum = 0;
    for (const h of list) {
      const qty = +h.qty || 0;
      let p;
      if (h.kind === 'cash') p = 1;
      else if (h.kind === 'crypto') { const hist = cg.hist?.[key]?.[h.cgId]; p = i === n ? priceOf(h) : hist?.length ? at(hist, t) : priceOf(h); }
      else {
        const d = toDateStr(new Date(t));
        const ps = (h.prices || []).slice().sort((a, b) => a.d.localeCompare(b.d));
        p = h.price; let first = null;
        for (const x of ps) { first ??= x.p; if (x.d <= d) p = x.p; }
        if (ps.length && d < ps[0].d) p = first;
      }
      const v = p == null ? null : toBase(qty * p, curOf(h));
      if (v != null) sum += v;
    }
    return [t, sum];
  });
}
function chart(pts, days) {
  // Linien als SVG (frei skalierbar), Achsen-Beschriftung als HTML, damit die Schrift auf jedem Bildschirm scharf und gleich groß bleibt
  const vals = pts.map((p) => p[1]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < Math.max(1, hi * 0.01)) { const m = (hi + lo) / 2 || 1; lo = m * 0.98; hi = m * 1.02; }
  const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  const x = (i) => (1000 * i) / (pts.length - 1), y = (v) => 100 * (1 - (v - lo) / (hi - lo));
  const ticks = [0, 1, 2, 3].map((k) => lo + ((hi - lo) * k) / 3);
  const fmtT = new Intl.DateTimeFormat('de-DE', days <= 7 ? { weekday: 'short' } : days <= 90 ? { day: 'numeric', month: 'short' } : { month: 'short' });
  const xl = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (pts.length - 1)));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(2)}`).join('');
  const short = (v) => money(v, baseCur(), v >= 1000 ? 0 : 2);
  return `<div class="pf-chart" role="img" aria-label="Wertentwicklung">
    <div class="pf-y">${ticks.map((v) => `<span style="top:${y(v).toFixed(2)}%">${short(v)}</span>`).join('')}</div>
    <div class="pf-plot">
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="pf-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="s0"/><stop offset="1" class="s1"/></linearGradient></defs>
        ${ticks.map((v) => `<line x1="0" x2="1000" y1="${y(v).toFixed(2)}" y2="${y(v).toFixed(2)}" class="gl" vector-effect="non-scaling-stroke"/>`).join('')}
        <path d="${line}L1000,100L0,100Z" class="ar" fill="url(#pf-fill)"/>
        <path d="${line}" class="ln" vector-effect="non-scaling-stroke"/>
      </svg>
    </div>
    <div class="pf-x">${xl.map((i, k) => `<span class="${k === 0 ? 'first' : k === xl.length - 1 ? 'last' : ''}" style="left:${((100 * i) / (pts.length - 1)).toFixed(2)}%">${fmtT.format(new Date(pts[i][0])).replace('.', '')}</span>`).join('')}</div>
  </div>`;
}
const spark = (vals, up) => {
  if (!vals || vals.length < 2) return '<span class="pf-spark"></span>';
  const w = 64, h = 24, lo = Math.min(...vals), hi = Math.max(...vals), r = hi - lo || 1;
  const pts = vals.map((v, i) => `${((w * i) / (vals.length - 1)).toFixed(1)},${(h - 2 - ((v - lo) / r) * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg class="pf-spark ${up ? 'up' : 'down'}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" vector-effect="non-scaling-stroke"/></svg>`;
};
const hLogo = (h, size = 36) => {
  const img = h.kind === 'crypto' ? cg.coins?.[h.cgId]?.image || h.image : null;
  return img ? `<span class="pf-logo" style="width:${size}px;height:${size}px"><img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`
    : logo({ name: (h.symbol || h.name || '?'), color: h.color }, size).replace('sub-logo', 'sub-logo round');
};

// ---------- Ansicht ----------
export function viewPortfolio() {
  ensureFx(); ensureCg();
  const list = holdings();
  const days = ui.pfRange || 30;
  if (list.some((h) => h.kind === 'crypto')) ensureHist(days);
  const actions = `<button class="btn primary" data-action="new-holding" title="Neue Position">${icon('plus')}<span class="lbl-long">Position</span></button>`;
  const top = head('Finanzen', '', actions, 'fin-head pf-head', areaTabs('finance/portfolio'));
  if (!list.length) return `${top}
    <div class="panel fin-empty"><span class="fin-empty-ic">${icon('pie')}</span><h3>Noch keine Positionen</h3>
      <p class="muted">Trag ein, was du besitzt: Krypto (Kurse kommen automatisch), Aktien und ETFs (Kurs trägst du ein) oder Bargeld wie dein Tagesgeld. Dann siehst du Gesamtwert, Aufteilung und Entwicklung.</p>
      <button class="btn primary" data-action="new-holding">${icon('plus')} Erste Position anlegen</button></div>`;

  const rows = list.map((h, i) => ({ h, v: valueOf(h), c: costOf(h), color: PALETTE[i % PALETTE.length] }));
  const priced = rows.filter((r) => r.v != null);
  const total = priced.reduce((a, r) => a + r.v, 0);
  const withCost = priced.filter((r) => r.c != null);
  const gain = withCost.reduce((a, r) => a + r.v - r.c, 0), cost = withCost.reduce((a, r) => a + r.c, 0);
  const sorted = priced.slice().sort((a, b) => b.v - a.v);
  sorted.forEach((r, i) => { r.color = PALETTE[i % PALETTE.length]; });
  const best = withCost.filter((r) => r.h.kind !== 'cash').map((r) => ({ ...r, p: pct(r.v, r.c) })).sort((a, b) => b.p - a.p)[0];
  const pts = series(list, days);
  const chg = pct(pts[pts.length - 1][1], pts[0][1]);
  const noPrice = rows.filter((r) => r.v == null);
  // Heute: Veränderung der Krypto-Positionen in 24 h (nur dafür gibt es Tageskurse)
  const crypto = priced.filter((r) => r.h.kind === 'crypto' && cg.coins?.[r.h.cgId]?.ch24 != null);
  const cryptoVal = crypto.reduce((a, r) => a + r.v, 0);
  const day = crypto.reduce((a, r) => { const c = cg.coins[r.h.cgId].ch24; return a + r.v - r.v / (1 + c / 100); }, 0);
  // Aufteilung nach Art
  const byKind = Object.keys(KINDS).map((k) => ({ k, v: priced.filter((r) => r.h.kind === k).reduce((a, r) => a + r.v, 0) })).filter((x) => x.v > 0);

  const kpi = (lbl, val, extra = '') => `<div class="stat pf-kpi"><div class="lbl">${lbl}</div><div class="pf-kpi-v"><b>${val}</b>${extra}</div></div>`;
  return `${top}
    <div class="stats pf-kpis">
      ${kpi('Gesamtwert', money(total), trend(chg))}
      ${kpi('Gewinn / Verlust', withCost.length ? `${gain >= 0 ? '+' : '−'}${money(Math.abs(gain))}` : '–', withCost.length ? trend(pct(cost + gain, cost)) : '<span class="pf-pill">Kaufkurs fehlt</span>')}
      ${kpi(priced.some((r) => r.h.kind !== 'crypto') ? 'Heute · Krypto' : 'Heute', crypto.length ? `${day >= 0 ? '+' : '−'}${money(Math.abs(day))}` : '–', crypto.length ? trend(pct(cryptoVal, cryptoVal - day)) : '<span class="pf-pill">nur Krypto</span>')}
      ${kpi('Beste Position', best ? esc(label(best.h)) : '–', best ? trend(best.p) : '')}
    </div>
    <div class="pf-grid">
      <div class="panel pf-perf">
        <div class="pf-perf-head">
          <div><h4>Portfolio</h4><p class="muted">Wertentwicklung deiner aktuellen Positionen</p></div>
          <div class="tabs pf-range">${RANGES.map(([d, l]) => `<button class="${d === days ? 'on' : ''}" data-action="pf-range" data-v="${d}">${l}</button>`).join('')}</div>
        </div>
        <div class="pf-total"><span class="muted">Gesamtwert</span><b>${money(total)}</b>${chg != null && isFinite(chg) ? `<span class="pf-chg ${chg >= 0 ? 'up' : 'down'}">${icon(chg >= 0 ? 'up' : 'down')} ${fmtPct(chg)} <span class="muted">${RANGES.find((r) => r[0] === days)[1]}</span></span>` : ''}</div>
        ${chart(pts, days)}
        ${list.some((h) => h.kind === 'stock' || h.kind === 'other') ? '<p class="fin-note">Aktien und ETFs mit den Kursen, die du eingetragen hast. Krypto mit Kursen von CoinGecko.</p>' : ''}
      </div>
      <div class="panel pf-alloc">
        <h4>Aufteilung</h4>
        <div class="pf-bar">${sorted.map((r) => `<i style="flex:${r.v};background:${r.color}" title="${esc(r.h.symbol || r.h.name)}"></i>`).join('')}</div>
        <div class="pf-alloc-list">${sorted.map((r) => `
          <div class="pf-alloc-row" data-action="edit-holding" data-id="${r.h.id}"><span class="dot" style="background:${r.color}"></span><b>${esc(label(r.h))}</b>
            <span class="muted">${total ? ((r.v / total) * 100).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : '0'} %</span><span class="v">${money(r.v)}</span></div>`).join('')}</div>
      ${byKind.length > 1 ? `<div class="pf-kinds">${byKind.map((x) => `<div><span class="muted">${KINDS[x.k]}</span><b>${total ? Math.round((x.v / total) * 100) : 0} %</b></div>`).join('')}</div>` : ''}
      </div>
    </div>
    <div class="pf-hold">
      <div class="tsec-head"><span class="tsec-title">Positionen</span><span class="mono muted">${list.length}</span></div>
      <div class="pf-hold-list">${rows.slice().sort((a, b) => (b.v ?? -1) - (a.v ?? -1)).map(({ h, v, c }) => {
        const coin = h.kind === 'crypto' ? cg.coins?.[h.cgId] : null;
        const sp = coin?.spark || (h.prices || []).slice().sort((a, b) => a.d.localeCompare(b.d)).slice(-30).map((x) => x.p);
        const ch = c != null && h.kind !== 'cash' ? pct(v, c) : coin?.ch24 ?? null;
        const qtyTxt = h.kind === 'cash' ? (h.currency && h.currency !== baseCur() ? `${KINDS.cash} · ${h.currency}` : KINDS.cash) : `${(+h.qty || 0).toLocaleString('de-DE', { maximumFractionDigits: 8 })} ${esc((h.symbol || '').toUpperCase())}`.trim();
        return `<div class="pf-row" data-action="edit-holding" data-id="${h.id}">
          ${hLogo(h)}
          <div class="pf-row-t"><b>${esc(label(h))}</b><small>${h.symbol ? esc(h.name) + ' · ' : ''}${qtyTxt}</small></div>
          ${h.kind === 'cash' ? '<span class="pf-spark"></span>' : spark(sp, (ch ?? 0) >= 0)}
          <div class="pf-row-v"><b>${v == null ? '–' : money(v)}</b><small>${v == null ? 'Kurs fehlt' : ch != null && isFinite(ch) ? `${trend(ch)}${c != null && h.kind !== 'cash' ? '' : ' 24h'}` : ''}</small></div>
        </div>`;
      }).join('')}</div>
      ${noPrice.length ? `<p class="fin-note">Ohne Kurs nicht im Gesamtwert: ${noPrice.map((r) => esc(r.h.name)).join(', ')}.</p>` : ''}
    </div>`;
}

// ---------- Dialog ----------
export const isPfModal = (m) => m?.type === 'holding';
export function pfModalHTML(m) {
  const h = m.h, k = h.kind || 'crypto', b = baseCur();
  const curSel = (id, v) => `<select id="${id}">${['EUR', 'USD', 'KRW', 'GBP', 'CHF'].map((c) => `<option ${c === (v || b) ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
  let fields = '';
  if (k === 'crypto') {
    fields = `
      ${h.cgId ? `<div class="pf-picked">${hLogo(h, 32)}<div><b>${esc(h.name)}</b><small>${esc((h.symbol || '').toUpperCase())} · Kurs kommt automatisch von CoinGecko</small></div><button class="btn small" data-action="hold-unpick">Ändern</button></div>`
        : `<div class="field"><label>Münze suchen</label><div class="pf-search"><input id="h-search" value="${esc(m.q || '')}" placeholder="z. B. Bitcoin, SOL" autocomplete="off" autofocus><button class="btn" data-action="hold-search">Suchen</button></div></div>
          ${m.err ? `<p class="fin-note" style="color:var(--danger)">${esc(m.err)}</p>` : ''}
          ${m.results ? `<div class="pf-results">${m.results.length ? m.results.map((c, i) => `<div class="fin-row" data-action="hold-pick" data-i="${i}"><span class="pf-logo" style="width:28px;height:28px"><img src="${esc(c.thumb)}" alt=""></span><div class="fin-row-t"><b>${esc(c.name)}</b><small>${esc(c.symbol)}</small></div></div>`).join('') : '<p class="muted fin-none">Nichts gefunden.</p>'}</div>` : ''}`}
      <div class="fin-form-row two">
        <div class="field"><label>Menge</label><input id="h-qty" type="number" inputmode="decimal" step="any" min="0" value="${h.qty ?? ''}" placeholder="z. B. 0,25"></div>
        <div class="field"><label>Ø Kaufkurs in ${b} <span class="muted">(optional)</span></label><input id="h-buy" type="number" inputmode="decimal" step="any" min="0" value="${h.buy ?? ''}" placeholder="pro Stück"></div>
      </div>`;
  } else if (k === 'cash') {
    fields = `
      <div class="field"><label>Name</label><input id="h-name" value="${esc(h.name || '')}" placeholder="z. B. Tagesgeld C24" autofocus autocomplete="off"></div>
      <div class="fin-form-row two">
        <div class="field"><label>Betrag</label><input id="h-qty" type="number" inputmode="decimal" step="0.01" value="${h.qty ?? ''}" placeholder="0,00"></div>
        <div class="field"><label>Währung</label>${curSel('h-cur', h.currency)}</div>
      </div>`;
  } else {
    fields = `
      <div class="fin-form-row two">
        <div class="field"><label>Name</label><input id="h-name" value="${esc(h.name || '')}" placeholder="z. B. MSCI World" autofocus autocomplete="off"></div>
        <div class="field"><label>Kürzel <span class="muted">(optional)</span></label><input id="h-sym" value="${esc(h.symbol || '')}" placeholder="z. B. IWDA" autocomplete="off" autocapitalize="characters"></div>
      </div>
      <div class="fin-form-row">
        <div class="field"><label>Aktueller Kurs</label><input id="h-price" type="number" inputmode="decimal" step="any" min="0" value="${h.price ?? ''}" placeholder="pro Stück"></div>
        <div class="field"><label>Währung</label>${curSel('h-cur', h.currency)}</div>
        <div class="field"><label>Menge</label><input id="h-qty" type="number" inputmode="decimal" step="any" min="0" value="${h.qty ?? ''}" placeholder="Stück"></div>
      </div>
      <div class="field"><label>Ø Kaufkurs <span class="muted">(optional, in derselben Währung)</span></label><input id="h-buy" type="number" inputmode="decimal" step="any" min="0" value="${h.buy ?? ''}" placeholder="pro Stück"></div>
      ${h.id ? '<p class="fin-note" style="margin-top:0">Neuen Kurs eintragen und speichern: Er kommt mit Datum in den Verlauf.</p>' : ''}`;
  }
  const inner = `
    <h2>${h.id ? esc(h.name) : 'Neue Position'}</h2>
    ${h.id ? '' : `<div class="seg pf-kind">${Object.entries(KINDS).map(([id, l]) => `<button class="${id === k ? 'on' : ''}" data-action="hold-kind" data-v="${id}">${l}</button>`).join('')}</div>`}
    ${fields}
    <div class="foot">
      ${h.id ? `<button class="btn danger" data-action="delete-holding" data-id="${h.id}" style="margin-right:auto">${icon('trash')} Löschen</button>` : ''}
      <button class="btn" data-action="close-modal">Abbrechen</button><button class="btn primary" data-action="save-holding">Speichern</button></div>`;
  return `<div class="overlay modal-overlay" data-action="close-modal"></div><div class="modal fin-modal pf-modal" role="dialog">${inner}</div>`;
}
// Eingaben im offenen Dialog merken (bevor er neu gezeichnet wird)
export function captureHolding(m) {
  const v = (id) => document.getElementById(id)?.value;
  const num = (id) => { const x = v(id); if (x == null || x === '') return undefined; const n = parseFloat(String(x).replace(',', '.')); return isFinite(n) ? n : undefined; };
  const h = m.h;
  if (v('h-name') != null) h.name = v('h-name').trim();
  if (v('h-sym') != null) h.symbol = v('h-sym').trim();
  if (v('h-cur') != null) h.currency = v('h-cur');
  for (const [id, key] of [['h-qty', 'qty'], ['h-buy', 'buy'], ['h-price', 'price']]) if (document.getElementById(id)) h[key] = num(id) ?? null;
  if (v('h-search') != null) m.q = v('h-search');
}
export function finishHolding(m) {
  captureHolding(m);
  const h = { ...m.h, kind: m.h.kind || 'crypto' };
  if (h.kind === 'crypto' && !h.cgId) return { error: 'Bitte zuerst die Münze suchen und auswählen.' };
  if (h.kind !== 'crypto' && !h.name) return { error: 'Bitte einen Namen eingeben.' };
  if (!(h.qty > 0) && h.kind !== 'cash') return { error: 'Bitte die Menge eingeben.' };
  if (h.kind === 'cash' && h.qty == null) return { error: 'Bitte den Betrag eingeben.' };
  if (h.kind === 'crypto') { h.currency = null; h.price = null; }
  if ((h.kind === 'stock' || h.kind === 'other') && h.price != null) {
    const ps = (h.prices || []).filter((x) => x.d !== today());
    h.prices = [...ps, { d: today(), p: h.price }].slice(-400);
  }
  return { h };
}
export const pickCoin = (m, i) => { const c = m.results?.[i]; if (c) Object.assign(m.h, { cgId: c.id, name: c.name, symbol: c.symbol, image: c.thumb }); m.results = null; };
