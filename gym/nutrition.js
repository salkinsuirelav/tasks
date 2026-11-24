// Ernährung: Tageslog mit Zielen, Suche + Barcode (Open Food Facts), eigene Lebensmittel,
// Foto/Text → Nährwerte über Claude (läuft über den Mac-Helfer der Task-App, also dein Claude-Abo).
//
// Daten (Firebase users/<uid>/…):
//   nut_foods  {name, brand, code, kcal, p, c, f (pro 100 g/ml), serving (g), unit, src: off|own|ai, lastUsed, uses}
//   nut_log    {date, meal, foodId, name, brand, unit, per: {kcal,p,c,f} pro 100, g, t}
//   nut_weight {id = Datum, kg}
//   jobs       {type: 'nutrition', prompt, image (dataURL, löscht der Helfer danach), status, result, meal, date}
//   Ziele in gym_meta/settings.nut

import * as S from './store.js';
import { matches } from './exercises.js';

let X; // Hilfsfunktionen aus app.js (sheet, toast, ICON, …)
export function initNutrition(ctx) { X = ctx; }

// ---------- Basis ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const r0 = (n) => Math.round(n || 0).toLocaleString('de-DE');
const r1 = (n) => (Math.round((n || 0) * 10) / 10).toLocaleString('de-DE');

export const DEFAULT_GOALS = { kcal: 2600, p: 180, c: 280, f: 80 };
export const goals = () => ({ ...DEFAULT_GOALS, ...(S.get('gym_meta', 'settings')?.nut || {}) });
export function saveGoal(key, v) {
  const s = S.get('gym_meta', 'settings') || { id: 'settings' };
  S.put('gym_meta', { ...s, id: 'settings', nut: { ...goals(), [key]: v } });
}

const MEALS = [['breakfast', 'Frühstück', '🌅'], ['lunch', 'Mittagessen', '☀️'], ['dinner', 'Abendessen', '🌙'], ['snack', 'Snacks', '🍎']];
const mealName = (m) => (MEALS.find((x) => x[0] === m) || MEALS[3])[1];
const defaultMeal = () => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 17 ? 'snack' : h < 22 ? 'dinner' : 'snack'; };

const logOf = (date) => S.all('nut_log').filter((x) => x.date === date).sort((a, b) => a.t - b.t);
const tot = (x) => { const k = (x.g || 0) / 100, p = x.per || {}; return { kcal: (p.kcal || 0) * k, p: (p.p || 0) * k, c: (p.c || 0) * k, f: (p.f || 0) * k }; };
const sum = (list) => list.map(tot).reduce((a, x) => ({ kcal: a.kcal + x.kcal, p: a.p + x.p, c: a.c + x.c, f: a.f + x.f }), { kcal: 0, p: 0, c: 0, f: 0 });
export const kcalOfDay = (date) => sum(logOf(date)).kcal;
const unitOf = (f) => f.unit || 'g';
const recentFoods = () => S.all('nut_foods').filter((f) => f.lastUsed).sort((a, b) => b.lastUsed - a.lastUsed);

// ---------- Ansicht: Tab „Ernährung“ ----------
export function foodView(date) {
  const g = goals(), list = logOf(date), s = sum(list);
  const left = g.kcal - s.kcal;
  const bar = (v, goal) => `<div class="n-bar"><i style="width:${Math.min(100, goal ? (v / goal) * 100 : 0)}%" class="${v > goal * 1.05 ? 'over' : ''}"></i></div>`;
  const macro = (k, label) => `<div><span>${label}</span><b>${r0(s[k])}<small> / ${r0(g[k])} g</small></b>${bar(s[k], g[k])}</div>`;
  const today = X.today();
  return `
  <header class="top">
    <button class="icon-btn" data-act="prev" aria-label="Tag zurück">${X.ICON.left}</button>
    <div class="title"><h1>${X.dayLabel(date)}</h1><div class="sub">${r0(s.kcal)} / ${r0(g.kcal)} kcal</div></div>
    <button class="icon-btn" data-act="next" aria-label="Tag vor">${X.ICON.right}</button>
  </header>
  ${date !== today ? `<button class="link center" data-act="today">Zurück zu heute</button>` : ''}
  <section class="card n-sum">
    <div class="n-kcal"><div><b class="${left < 0 ? 'danger' : ''}">${r0(Math.abs(left))}</b><span>${left < 0 ? 'kcal drüber' : 'kcal übrig'}</span></div>
      <div class="muted">${r0(s.kcal)} gegessen</div></div>
    ${bar(s.kcal, g.kcal)}
    <div class="n-macros">${macro('p', 'Protein')}${macro('c', 'Kohlenhydrate')}${macro('f', 'Fett')}</div>
  </section>
  ${jobCards(date)}
  <div class="n-quick">
    <button class="btn" data-act="n-scan" data-meal="${defaultMeal()}">${X.ICON.scan} Scannen</button>
    <button class="btn" data-act="n-ai" data-meal="${defaultMeal()}">✨ Claude</button>
    <button class="btn" data-act="n-weight">⚖️ ${weightLabel(date)}</button>
  </div>
  ${MEALS.map(([m, label, icon]) => {
    const items = list.filter((x) => (x.meal || 'snack') === m), ms = sum(items);
    return `<section class="card n-meal">
      <div class="card-head"><b>${icon} ${label}</b><span class="muted">${items.length ? `${r0(ms.kcal)} kcal · ${r0(ms.p)} g P` : ''}</span>
        <button class="icon-btn small" data-act="n-add" data-meal="${m}" aria-label="${label} hinzufügen">${X.ICON.plus}</button></div>
      ${items.map((x) => `<button class="n-item" data-act="n-edit" data-id="${x.id}"><span>${esc(x.name)}<small class="muted"> · ${r0(x.g)} ${unitOf(x)}</small></span><span class="muted">${r0(tot(x).kcal)}</span></button>`).join('')}
    </section>`;
  }).join('')}`;
}

// ---------- Körpergewicht ----------
const weights = () => S.all('nut_weight').sort((a, b) => a.id.localeCompare(b.id));
function weightLabel(date) {
  const w = weights().filter((x) => x.id <= date).pop();
  return w ? `${r1(w.kg)} kg` : 'Gewicht';
}
function weightSheet(date) {
  const ws = weights(), cur = S.get('nut_weight', date);
  const last7 = ws.filter((x) => x.id > X.addDays(date, -7) && x.id <= date);
  const avg = last7.length ? last7.reduce((a, x) => a + x.kg, 0) / last7.length : null;
  const prev = ws.filter((x) => x.id > X.addDays(date, -14) && x.id <= X.addDays(date, -7));
  const avgPrev = prev.length ? prev.reduce((a, x) => a + x.kg, 0) / prev.length : null;
  X.sheet(`<div class="sheet-head"><h2>Gewicht · ${X.dayLabel(date)}</h2><button class="icon-btn small" data-act="close-sheet">${X.ICON.x}</button></div>
    <form id="n-weight-form" data-date="${date}" class="n-row">
      <label class="n-in"><input name="kg" inputmode="decimal" placeholder="${cur ? r1(cur.kg) : 'z. B. 92,0'}" value="${cur ? r1(cur.kg) : ''}" autocomplete="off"><span>kg</span></label>
      <button class="btn primary" type="submit">Speichern</button>
    </form>
    <p class="muted">Am besten morgens nach dem Aufstehen. Aussagekräftig ist der Wochenschnitt, nicht der einzelne Tag.</p>
    ${avg ? `<div class="stats"><div><span>Ø 7 Tage</span><b>${r1(avg)} kg</b></div><div><span>Vorwoche</span><b>${avgPrev ? r1(avgPrev) + ' kg' : '–'}</b></div><div><span>Trend</span><b>${avgPrev ? (avg - avgPrev > 0 ? '+' : '') + r1(avg - avgPrev) : '–'}</b></div></div>` : ''}
    ${ws.length > 1 ? `<div class="card chart">${X.chart(ws.slice(-60).map((x) => ({ date: x.id, v: x.kg })), 'kg')}</div>` : ''}`,
  (el) => setTimeout(() => el.querySelector('input').focus(), 50));
}

// ---------- Hinzufügen: Suche (eigene + Open Food Facts) ----------
let addMeal = 'snack';
function addSheet(meal) {
  addMeal = meal;
  X.sheet(`<div class="sheet-head"><h2>${mealName(meal)}</h2><button class="icon-btn small" data-act="close-sheet">${X.ICON.x}</button></div>
    <div class="n-quick">
      <button class="btn" data-act="n-scan" data-meal="${meal}">${X.ICON.scan} Scannen</button>
      <button class="btn" data-act="n-ai" data-meal="${meal}">✨ Claude</button>
      <button class="btn" data-act="n-own" data-meal="${meal}">${X.ICON.plus} Eigenes</button>
    </div>
    <form id="n-search-form"><input id="n-search" type="search" enterkeyhint="search" placeholder="Lebensmittel suchen…" autocomplete="off"></form>
    <div id="n-results" class="list tight">${localResults('')}</div>
    <div id="n-off"></div>`, (el) => {
    const inp = el.querySelector('#n-search');
    inp.addEventListener('input', () => { el.querySelector('#n-results').innerHTML = localResults(inp.value); el.querySelector('#n-off').innerHTML = inp.value.trim().length > 1 ? offButton(inp.value) : ''; });
  });
}
const foodRow = (f, act = 'n-pick') => `<button class="row" data-act="${act}" data-id="${esc(f.id)}"><div><b>${esc(f.name)}</b><div class="muted">${f.brand ? esc(f.brand) + ' · ' : ''}${r0(f.kcal)} kcal · ${r0(f.p)} g P / 100 ${unitOf(f)}</div></div>${f.src === 'ai' ? '<span class="muted">✨</span>' : ''}</button>`;
function localResults(q) {
  const ql = q.trim();
  const foods = ql ? S.all('nut_foods').filter((f) => matches(ql, f.name, f.brand || '')).sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0)).slice(0, 30) : recentFoods().slice(0, 20);
  if (!foods.length) return ql ? '' : '<p class="muted">Noch nichts gegessen. Such oben, scanne einen Barcode oder lass Claude schätzen.</p>';
  return `<div class="label">${ql ? 'Deine Lebensmittel' : 'Zuletzt'}</div>${foods.map((f) => foodRow(f)).join('')}`;
}
const offButton = (q) => `<button class="row accent" data-act="n-off-search" data-q="${esc(q.trim())}">🔎 „${esc(q.trim())}“ in Open Food Facts suchen</button>`;

const OFF = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_de,product_name_en,generic_name,brands,nutriments,serving_quantity';
const offCache = new Map();
async function offFetch(url) {
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 15000);
  try { const r = await fetch(url, { signal: ac.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(tm); }
}
function offFood(p) {
  const n = p.nutriments || {};
  const kcal = num(n['energy-kcal_100g']) ?? (num(n.energy_100g) != null ? num(n.energy_100g) / 4.184 : null);
  if (kcal == null || !p.code) return null;
  const name = p.product_name_de || p.product_name || p.product_name_en || p.generic_name;
  if (!name) return null;
  return { id: 'off-' + p.code, code: p.code, name: name.trim(), brand: (p.brands || '').split(',')[0].trim(), kcal, p: num(n.proteins_100g) || 0, c: num(n.carbohydrates_100g) || 0, f: num(n.fat_100g) || 0, serving: num(p.serving_quantity), src: 'off' };
}
async function offSearch(q) {
  const box = document.querySelector('#n-off');
  if (!box) return;
  box.innerHTML = '<p class="muted center">Suche in Open Food Facts …</p>';
  try {
    const url = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=30&fields=${FIELDS}`;
    const data = await offFetch(url);
    const foods = (data.products || []).map(offFood).filter(Boolean);
    foods.forEach((f) => offCache.set(f.id, f));
    if (!document.querySelector('#n-off')) return;
    box.innerHTML = foods.length ? `<div class="label">Open Food Facts</div><div class="list tight">${foods.map((f) => foodRow(f, 'n-pick-off')).join('')}</div>`
      : `<p class="muted center">Nichts gefunden. Probier es kürzer oder mit Marke, oder leg es selbst an.</p>`;
  } catch (e) {
    if (document.querySelector('#n-off')) box.innerHTML = `<p class="muted center">Open Food Facts gerade nicht erreichbar (${esc(e.name === 'AbortError' ? 'Zeitüberschreitung' : e.message)}). Kurz warten und nochmal, die Suche erlaubt nur ca. 10 Anfragen pro Minute.</p>`;
  }
}

// ---------- Menge wählen ----------
function amountSheet(food, { meal, entry } = {}) {
  const g0 = entry ? entry.g : food.serving || 100, u = unitOf(food);
  const per = entry ? entry.per : { kcal: food.kcal, p: food.p, c: food.c, f: food.f };
  const chips = [...new Set([food.serving, 50, 100, 150, 200, 250].filter(Boolean).map((x) => Math.round(x)))].slice(0, 5);
  const preview = (g) => { const t = tot({ g, per }); return `<b>${r0(t.kcal)} kcal</b> · P ${r1(t.p)} g · KH ${r1(t.c)} g · F ${r1(t.f)} g`; };
  pendingFood = food;
  X.sheet(`<div class="sheet-head"><h2>${esc(food.name)}</h2><button class="icon-btn small" data-act="close-sheet">${X.ICON.x}</button></div>
    <p class="muted">${food.brand ? esc(food.brand) + ' · ' : ''}pro 100 ${u}: ${r0(per.kcal)} kcal · P ${r1(per.p)} · KH ${r1(per.c)} · F ${r1(per.f)}</p>
    <form id="n-amount-form" data-entry="${entry?.id || ''}">
      <div class="n-row"><label class="n-in"><input name="g" inputmode="decimal" value="${r1(g0)}" autocomplete="off"><span>${u}</span></label>
        <select name="meal">${MEALS.map(([m, l]) => `<option value="${m}" ${(entry?.meal || meal) === m ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="n-chips">${chips.map((c) => `<button type="button" data-act="n-chip" data-g="${c}">${c === Math.round(food.serving || 0) ? `1 Portion (${c} ${u})` : `${c} ${u}`}</button>`).join('')}</div>
      <p class="n-preview">${preview(g0)}</p>
      <button class="btn primary wide" type="submit">${entry ? 'Speichern' : 'Eintragen'}</button>
      ${entry ? `<button class="btn wide danger" type="button" data-act="n-del" data-id="${entry.id}">Löschen</button>` : ''}
    </form>`, (el) => {
    const inp = el.querySelector('[name=g]');
    const upd = () => { el.querySelector('.n-preview').innerHTML = preview(num(inp.value) || 0); };
    inp.addEventListener('input', upd);
    el.addEventListener('click', (e) => { const c = e.target.closest('[data-act=n-chip]'); if (c) { inp.value = c.dataset.g; upd(); } });
    if (!entry) setTimeout(() => inp.select(), 60);
  });
}
let pendingFood = null;

function logFood(food, g, meal, date) {
  const saved = S.put('nut_foods', { ...(S.get('nut_foods', food.id) || {}), ...food, lastUsed: Date.now(), uses: (S.get('nut_foods', food.id)?.uses || 0) + 1 });
  S.put('nut_log', { date, meal, foodId: saved.id, name: food.name, brand: food.brand || '', unit: unitOf(food), per: { kcal: food.kcal, p: food.p, c: food.c, f: food.f }, g, t: Date.now() });
}

// ---------- Eigenes Lebensmittel ----------
function ownSheet(meal, pre = {}) {
  addMeal = meal;
  const field = (n, l, u, v = '') => `<label class="n-in"><input name="${n}" inputmode="decimal" placeholder="${l}" value="${v}" autocomplete="off"><span>${u}</span></label>`;
  X.sheet(`<div class="sheet-head"><h2>Eigenes Lebensmittel</h2><button class="icon-btn small" data-act="close-sheet">${X.ICON.x}</button></div>
    ${pre.code ? `<p class="muted">Barcode ${esc(pre.code)} ist in Open Food Facts nicht drin. Trag die Werte von der Packung ein (pro 100 g) – oder fotografier die Nährwerttabelle für Claude.</p>
      <button class="btn wide" data-act="n-ai" data-meal="${meal}">✨ Nährwerttabelle mit Claude auslesen</button>` : ''}
    <form id="n-own-form" class="stack" data-code="${esc(pre.code || '')}">
      <input name="name" placeholder="Name, z. B. Skyr Natur" value="${esc(pre.name || '')}" required autocomplete="off">
      <input name="brand" placeholder="Marke (optional)" autocomplete="off">
      <div class="label first">Pro 100 g</div>
      <div class="n-grid">${field('kcal', 'Kalorien', 'kcal')}${field('p', 'Protein', 'g')}${field('c', 'Kohlenh.', 'g')}${field('f', 'Fett', 'g')}</div>
      ${field('serving', 'Portion (optional)', 'g')}
      <button class="btn primary wide" type="submit">Weiter</button>
    </form>`, (el) => setTimeout(() => el.querySelector(pre.name ? '[name=kcal]' : '[name=name]').focus(), 60));
}

// ---------- Barcode-Scanner ----------
let scan = null;
export function stopScan() {
  if (!scan) return;
  try { scan.reader?.reset(); } catch {}
  scan.stream?.getTracks().forEach((t) => t.stop());
  cancelAnimationFrame(scan.raf);
  scan = null;
}
function loadZXing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = 'vendor/zxing.min.js'; s.onload = () => ok(window.ZXing); s.onerror = () => fail(new Error('Scanner konnte nicht geladen werden')); document.head.appendChild(s); });
}
function scanSheet(meal) {
  addMeal = meal;
  X.sheet(`<div class="sheet-head"><h2>Barcode scannen</h2><button class="icon-btn small" data-act="close-sheet">${X.ICON.x}</button></div>
    <div class="n-video"><video playsinline muted autoplay></video><i></i></div>
    <p class="muted center" id="n-scan-status">Kamera startet …</p>
    <form id="n-code-form" class="n-row"><input name="code" inputmode="numeric" placeholder="Oder Nummer eintippen" autocomplete="off"><button class="btn" type="submit">Suchen</button></form>`, startScan);
}
async function startScan(el) {
  stopScan();
  const video = el.querySelector('video'), status = el.querySelector('#n-scan-status');
  const found = (code) => { if (!scan) return; stopScan(); navigator.vibrate?.(30); lookup(code); };
  scan = {};
  const my = scan;
  try {
    if ('BarcodeDetector' in window) {
      const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
      my.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (scan !== my) return my.stream.getTracks().forEach((t) => t.stop());
      video.srcObject = my.stream; await video.play();
      const loop = async () => {
        if (scan !== my) return;
        try { const r = await det.detect(video); if (r[0]) return found(r[0].rawValue); } catch {}
        my.raf = requestAnimationFrame(loop);
      };
      loop();
    } else {
      const Z = await loadZXing();
      if (scan !== my) return;
      const hints = new Map([[Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128]]]);
      my.reader = new Z.BrowserMultiFormatReader(hints, 300);
      await my.reader.decodeFromConstraints({ video: { facingMode: 'environment' }, audio: false }, video, (res) => { if (res) found(res.getText()); });
    }
    if (scan === my) status.textContent = 'Barcode in den Rahmen halten';
  } catch (e) {
    if (scan === my) { stopScan(); status.textContent = /NotAllowed|Permission/i.test(e.name + e.message) ? 'Kein Kamerazugriff. In den iPhone-Einstellungen erlauben oder Nummer eintippen.' : `Kamera nicht verfügbar (${e.message}). Nummer unten eintippen.`; }
  }
}
async function lookup(code) {
  code = String(code).replace(/\D/g, '');
  if (!code) return;
  const local = S.all('nut_foods').find((f) => f.code === code);
  if (local) return amountSheet(local, { meal: addMeal });
  const st = document.querySelector('#n-scan-status');
  if (st) st.textContent = `Suche ${code} …`; else X.toast('Suche Produkt …');
  try {
    const data = await offFetch(`${OFF}/api/v2/product/${code}.json?fields=${FIELDS}`);
    const food = data.status === 1 && data.product ? offFood({ ...data.product, code }) : null;
    if (food) { offCache.set(food.id, food); return amountSheet(food, { meal: addMeal }); }
    ownSheet(addMeal, { code });
  } catch (e) {
    X.toast('Open Food Facts nicht erreichbar');
    ownSheet(addMeal, { code });
  }
}

// ---------- Claude: Foto/Text → Nährwerte (über den Mac-Helfer) ----------
const helper = () => S.get('meta', 'helper');
const helperOnline = () => Date.now() - (helper()?.lastSeen || 0) < 3 * 60000;
const helperCanImage = () => (helper()?.features || []).includes('nutrition-image');
const nutJobs = () => S.all('jobs').filter((j) => j.type === 'nutrition').sort((a, b) => a.createdAt - b.createdAt);

let aiImage = null;
function aiSheet(meal) {
  addMeal = meal; aiImage = null;
  const on = helperOnline();
  X.sheet(`<div class="sheet-head"><h2>✨ Claude schätzen lassen</h2><button class="icon-btn small" data-act="close-sheet">${X.ICON.x}</button></div>
    <p class="muted">${on ? '🟢 Mac-Helfer online' : '⚪️ Mac-Helfer gerade offline: der Auftrag wartet, bis dein Mac wach ist.'}${on && !helperCanImage() ? ' · Für Fotos den Helfer einmal updaten (Mehr → Ernährung).' : ''}</p>
    <form id="n-ai-form" class="stack">
      <textarea name="text" rows="3" placeholder="z. B. 200 g Hähnchen, eine Schüssel Reis, Kimchi – oder leer lassen und nur ein Foto schicken"></textarea>
      <label class="btn wide n-photo"><input type="file" name="photo" accept="image/*" hidden>📷 Foto aufnehmen oder auswählen</label>
      <img class="n-thumb" alt="" hidden>
      <select name="meal">${MEALS.map(([m, l]) => `<option value="${m}" ${meal === m ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="btn primary wide" type="submit">An Claude schicken</button>
      <p class="muted">Geht über deinen Mac-Helfer und dein Claude-Abo, keine Extrakosten. Dauert meist 20–60 Sekunden, du kannst die App solange normal nutzen.</p>
    </form>`, (el) => {
    el.querySelector('[name=photo]').addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const img = el.querySelector('.n-thumb');
      try { aiImage = await compress(file); img.src = aiImage; img.hidden = false; el.querySelector('.n-photo').lastChild.textContent = '📷 Anderes Foto'; }
      catch { X.toast('Foto konnte nicht gelesen werden'); }
    });
  });
}
function compress(file) {
  return new Promise((ok, fail) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const enc = (max, q) => { const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q); };
      let d = enc(1280, 0.72);
      if (d.length > 700000) d = enc(960, 0.6);
      URL.revokeObjectURL(url); ok(d);
    };
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('Bild')); };
    img.src = url;
  });
}
function aiPrompt(text, hasImage) {
  return [
    'Du bist ein Ernährungs-Assistent in einer Kalorien-Tracking-App. Schätze die Nährwerte so genau wie möglich.',
    hasImage ? 'Sieh dir zuerst das Foto an (mit dem Read-Tool): {{IMAGE}}' : '',
    text ? `Beschreibung vom Nutzer: """${text}"""` : '',
    '',
    'Regeln:',
    '- Teile die Mahlzeit in einzelne Lebensmittel auf.',
    '- "g" = geschätzte Menge in Gramm (Getränke in ml). Nutze Angaben aus der Beschreibung, wenn vorhanden.',
    '- "kcal", "p" (Eiweiß), "c" (Kohlenhydrate), "f" (Fett) gelten für genau diese Menge, nicht pro 100 g.',
    '- Ist eine Nährwerttabelle oder Verpackung zu sehen: Werte von dort übernehmen. Menge = Portions- oder Packungsangabe, sonst 100.',
    '- Namen auf Deutsch, kurz (z. B. "Reis, gekocht").',
    '',
    'Antworte NUR mit JSON, ohne Text davor oder danach, genau in diesem Format:',
    '{"items":[{"name":"Hähnchenbrust, gebraten","g":200,"kcal":330,"p":62,"c":0,"f":7}],"note":"kurzer Hinweis, was unsicher ist"}',
  ].filter((l) => l !== null).join('\n');
}
function sendAi(f) {
  const text = f.text.value.trim();
  if (!text && !aiImage) return X.toast('Text oder Foto hinzufügen');
  if (aiImage && helperOnline() && !helperCanImage()) return X.toast('Mac-Helfer erst updaten (Mehr → Ernährung)');
  S.put('jobs', { type: 'nutrition', prompt: aiPrompt(text, !!aiImage), image: aiImage, text, status: 'queued', result: null, error: null, applied: false, meal: f.meal.value, date: X.ui.date });
  aiImage = null;
  X.closeSheet();
  X.toast('An Claude geschickt ✨');
}
function parseAi(result) {
  try {
    const s = String(result || ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
    const j = JSON.parse(s.slice(a, b + 1));
    const items = (j.items || []).map((x) => ({ name: String(x.name || 'Unbekannt'), g: num(x.g) || 0, kcal: num(x.kcal) || 0, p: num(x.p) || 0, c: num(x.c) || 0, f: num(x.f) || 0 })).filter((x) => x.kcal || x.g);
    return { items, note: j.note ? String(j.note) : '' };
  } catch { return null; }
}
function jobCards(date) {
  const jobs = nutJobs().filter((j) => j.date === date || j.status !== 'done');
  return jobs.map((j) => {
    const what = esc(j.text ? (j.text.length > 40 ? j.text.slice(0, 39) + '…' : j.text) : 'Foto');
    if (j.status === 'done') return `<button class="n-job done" data-act="n-review" data-id="${j.id}">✨ <span><b>Ergebnis da</b> · ${what}</span><span class="link">Prüfen</span></button>`;
    if (j.status === 'error') return `<div class="n-job err">⚠️ <span><b>Claude-Fehler</b> · ${esc(j.error || '')}</span><button class="icon-btn small" data-act="n-job-del" data-id="${j.id}">${X.ICON.x}</button></div>`;
    return `<div class="n-job">✨ <span><b>${j.status === 'running' ? 'Claude analysiert …' : helperOnline() ? 'Wartet auf Claude …' : 'Wartet auf deinen Mac …'}</b> · ${what}</span><button class="icon-btn small" data-act="n-job-del" data-id="${j.id}" aria-label="Abbrechen">${X.ICON.x}</button></div>`;
  }).join('');
}
let review = null;
function reviewSheet(id) {
  const job = S.get('jobs', id);
  if (!job) return;
  const parsed = parseAi(job.result);
  if (!parsed || !parsed.items.length) {
    return X.sheet(`<div class="sheet-head"><h2>Claude</h2><button class="icon-btn small" data-act="close-sheet">${X.ICON.x}</button></div>
      <p>Daraus konnte ich keine Nährwerte lesen:</p><p class="muted">${esc(String(job.result || '').slice(0, 600))}</p>
      <button class="btn wide" data-act="n-job-del" data-id="${id}">Verwerfen</button>`);
  }
  review = { id, items: parsed.items.map((x) => ({ ...x, on: true, g0: x.g || 100 })), meal: job.meal || defaultMeal(), date: job.date || X.ui.date };
  const row = (x, i) => `<div class="n-rev"><label class="n-check"><input type="checkbox" data-rev-on="${i}" checked></label>
      <div><input class="n-rev-name" data-rev-name="${i}" value="${esc(x.name)}"><div class="muted" data-rev-info="${i}">${info(x, x.g0)}</div></div>
      <label class="n-in sm"><input inputmode="decimal" data-rev-g="${i}" value="${r0(x.g0)}"><span>g</span></label></div>`;
  X.sheet(`<div class="sheet-head"><h2>✨ Prüfen &amp; eintragen</h2><button class="icon-btn small" data-act="close-sheet">${X.ICON.x}</button></div>
    ${parsed.note ? `<p class="muted">${esc(parsed.note)}</p>` : ''}
    <div class="n-revs">${review.items.map(row).join('')}</div>
    <p class="n-preview" id="n-rev-sum"></p>
    <select id="n-rev-meal">${MEALS.map(([m, l]) => `<option value="${m}" ${review.meal === m ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <button class="btn primary wide" data-act="n-review-save">Eintragen</button>
    <button class="btn wide" data-act="n-job-del" data-id="${id}">Verwerfen</button>`, (el) => {
    const upd = () => {
      review.items.forEach((x, i) => { x.on = el.querySelector(`[data-rev-on="${i}"]`).checked; x.name = el.querySelector(`[data-rev-name="${i}"]`).value.trim() || x.name; x.gNow = num(el.querySelector(`[data-rev-g="${i}"]`).value) || 0; el.querySelector(`[data-rev-info="${i}"]`).innerHTML = info(x, x.gNow); });
      const t = review.items.filter((x) => x.on).map((x) => scaled(x, x.gNow)).reduce((a, x) => ({ kcal: a.kcal + x.kcal, p: a.p + x.p }), { kcal: 0, p: 0 });
      el.querySelector('#n-rev-sum').innerHTML = `Zusammen: <b>${r0(t.kcal)} kcal</b> · ${r0(t.p)} g Protein`;
    };
    el.addEventListener('input', upd); el.addEventListener('change', upd); upd();
  });
}
const scaled = (x, g) => { const k = x.g ? g / x.g : 1; return { kcal: x.kcal * k, p: x.p * k, c: x.c * k, f: x.f * k }; };
const info = (x, g) => { const t = scaled(x, g); return `${r0(t.kcal)} kcal · P ${r0(t.p)} · KH ${r0(t.c)} · F ${r0(t.f)}`; };
function saveReview() {
  if (!review) return;
  const meal = document.querySelector('#n-rev-meal')?.value || review.meal;
  let n = 0;
  for (const x of review.items) {
    if (!x.on || !x.gNow) continue;
    const g = x.g || 100, k = 100 / g;
    const id = 'ai-' + x.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    logFood({ id, name: x.name, brand: '', kcal: x.kcal * k, p: x.p * k, c: x.c * k, f: x.f * k, serving: Math.round(x.gNow), src: 'ai' }, x.gNow, meal, review.date);
    n++;
  }
  S.remove('jobs', review.id);
  review = null;
  X.closeSheet();
  X.toast(`${n} ${n === 1 ? 'Eintrag' : 'Einträge'} gespeichert`);
}

// ---------- Ereignisse (von app.js weitergereicht) ----------
export function onClick(act, b) {
  const id = b.dataset.id, meal = b.dataset.meal || defaultMeal();
  switch (act) {
    case 'n-add': addSheet(meal); return true;
    case 'n-scan': scanSheet(meal); return true;
    case 'n-ai': aiSheet(meal); return true;
    case 'n-own': ownSheet(meal); return true;
    case 'n-weight': weightSheet(X.ui.date); return true;
    case 'n-off-search': offSearch(b.dataset.q); return true;
    case 'n-pick': amountSheet(S.get('nut_foods', id), { meal: addMeal }); return true;
    case 'n-pick-off': amountSheet(S.get('nut_foods', id) || offCache.get(id), { meal: addMeal }); return true;
    case 'n-edit': { const e = S.get('nut_log', id); if (e) amountSheet({ id: e.foodId, name: e.name, brand: e.brand, unit: e.unit, ...e.per, serving: S.get('nut_foods', e.foodId)?.serving }, { entry: e }); return true; }
    case 'n-del': S.remove('nut_log', id); X.closeSheet(); X.toast('Gelöscht'); return true;
    case 'n-review': reviewSheet(id); return true;
    case 'n-review-save': saveReview(); return true;
    case 'n-job-del': S.remove('jobs', id); X.closeSheet(); return true;
    case 'n-chip': return true; // im Sheet selbst behandelt
  }
  return false;
}
export function onSubmit(f) {
  if (f.id === 'n-search-form') { const q = f.querySelector('input').value.trim(); if (q.length > 1) { document.querySelector('#n-off').innerHTML = ''; offSearch(q); } document.activeElement?.blur(); return true; }
  if (f.id === 'n-code-form') { lookup(f.code.value); return true; }
  if (f.id === 'n-ai-form') { sendAi(f); return true; }
  if (f.id === 'n-weight-form') {
    const v = num(f.kg.value);
    if (!v || v < 20 || v > 400) { X.toast('Gewicht in kg eintragen'); return true; }
    S.put('nut_weight', { id: f.dataset.date, kg: v });
    X.closeSheet(); X.toast('Gewicht gespeichert');
    return true;
  }
  if (f.id === 'n-own-form') {
    const kcal = num(f.kcal.value);
    if (kcal == null) { f.kcal.focus(); X.toast('Kalorien pro 100 g eintragen'); return true; }
    const food = S.put('nut_foods', { name: f.name.value.trim(), brand: f.brand.value.trim(), code: f.dataset.code || '', kcal, p: num(f.p.value) || 0, c: num(f.c.value) || 0, f: num(f.f.value) || 0, serving: num(f.serving.value), src: 'own' });
    amountSheet(food, { meal: addMeal });
    return true;
  }
  if (f.id === 'n-amount-form') {
    const g = num(f.g.value);
    if (!g || g <= 0) { X.toast('Menge eintragen'); return true; }
    const entryId = f.dataset.entry;
    if (entryId) S.patch('nut_log', entryId, { g, meal: f.meal.value });
    else { logFood(pendingFood, g, f.meal.value, X.ui.date); X.toast(`${pendingFood.name} eingetragen`); }
    X.closeSheet();
    return true;
  }
  return false;
}
