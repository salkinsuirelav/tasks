// Koreanisch-Vokabeltrainer. Wort/Satz eintippen → Claude (über den Mac-Helfer, dein Abo) baut die Karte
// mit Übersetzung, Romanisierung, Erklärung + Beispielsatz → Abfragen mit Spaced Repetition (srs.js).
// Datenmodell (Firebase users/<ID>/…, gleicher Login wie Task-App):
//   ko_cards: { id, ko, rom, de, type, expl, ex: { ko, rom, de }, srs: {…}, source }
//   ko_days:  { id: 'YYYY-MM-DD', n: Abfragen, newN: neue Karten, again: "Nochmal" }
//   ko_meta/settings: { newPerDay, dir: 'ko-de'|'de-ko'|'mix', autoplay }
//   jobs:     { type: 'vocab', prompt, items: [...], status: queued|running|done|error, result } → Mac-Helfer

import * as S from './store.js';
import { grade, preview, newSrs, dayStart } from './srs.js';
import { HANGUL_DECK } from './hangul.js';

const VERSION = '0.2.1';
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayKey = (offset = 0) => dateStr(new Date(dayStart(offset) + 3600000)); // "Lerntag" beginnt um 4 Uhr
const HANGUL = /[가-힣ㄱ-ㆎ]/;
const MIN = 60000;

// ---------- Icons ----------
const I = (p, w = 22) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICON = {
  learn: I('<rect x="3" y="5" width="14" height="14" rx="3"/><path d="M7 3h11a3 3 0 0 1 3 3v11"/>'),
  add: I('<path d="M12 5v14M5 12h14"/>'),
  list: I('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
  more: I('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
  speak: I('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>', 20),
  x: I('<path d="M18 6 6 18M6 6l12 12"/>', 20),
  spark: I('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>', 18),
};

// ---------- Einstellungen ----------
const DEFAULTS = { newPerDay: 10, dir: 'ko-de', autoplay: true };
const settings = () => ({ ...DEFAULTS, ...(S.get('ko_meta', 'settings') || {}) });
const setSetting = (k, v) => S.put('ko_meta', { ...(S.get('ko_meta', 'settings') || { id: 'settings' }), id: 'settings', [k]: v });

// ---------- Abfragen ----------
const cards = () => S.all('ko_cards').map((c) => (c.srs ? c : { ...c, srs: newSrs() }));
const dayDoc = (k = dayKey()) => S.get('ko_days', k) || { id: k, n: 0, newN: 0, again: 0 };
const newLeft = () => Math.max(0, settings().newPerDay - (dayDoc().newN || 0));
function counts(now = Date.now()) {
  const cs = cards();
  const learn = cs.filter((c) => c.srs.state === 'learn' && c.srs.due <= now + 20 * MIN).length;
  const review = cs.filter((c) => c.srs.state === 'review' && c.srs.due <= now).length;
  const fresh = Math.min(newLeft(), cs.filter((c) => c.srs.state === 'new').length);
  return { learn, review, fresh, total: cs.length, todo: learn + review + fresh };
}
function nextCard(skipId) {
  const now = Date.now(), cs = cards().filter((c) => c.id !== skipId);
  const due = cs.filter((c) => c.srs.state !== 'new' && c.srs.due <= now).sort((a, b) => a.srs.due - b.srs.due);
  if (due.length) return due[0];
  if (newLeft() > 0) {
    const n = cs.filter((c) => c.srs.state === 'new').sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0];
    if (n) return n;
  }
  // Lernschritte, die in den nächsten 20 Minuten fällig werden, vorziehen (wie Anki)
  const ahead = cs.filter((c) => c.srs.state === 'learn' && c.srs.due <= now + 20 * MIN).sort((a, b) => a.srs.due - b.srs.due)[0];
  if (ahead) return ahead;
  // sonst dieselbe Karte nochmal, wenn sie gleich wieder dran ist
  return (skipId && cards().find((c) => c.id === skipId && c.srs.state === 'learn' && c.srs.due <= now + 20 * MIN)) || null;
}
function streak() {
  let n = 0, i = dayDoc().n ? 0 : -1;
  while ((S.get('ko_days', dayKey(i))?.n || 0) > 0) { n++; i--; }
  return n;
}
const hash = (s) => { let h = 5381; for (const ch of s) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0; return h.toString(36); };
const normKo = (s) => String(s || '').trim().replace(/[.!?。]+$/, '').replace(/\s+/g, ' ');
const cardId = (ko) => 'k' + hash(normKo(ko));
const findCard = (ko) => S.get('ko_cards', cardId(ko));

// ---------- Aussprache (eingebaute Stimme von iOS/macOS, kostenlos) ----------
function speak(text) {
  if (!text || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR'; u.rate = 0.85;
  const v = speechSynthesis.getVoices().find((x) => /^ko/i.test(x.lang));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

// ---------- Mac-Helfer / Claude ----------
const helperOnline = () => Date.now() - (S.get('meta', 'helper')?.lastSeen || 0) < 3 * MIN;
const vocabJobs = () => S.all('jobs').filter((j) => j.type === 'vocab').sort((a, b) => a.createdAt - b.createdAt);

function vocabPrompt(items) {
  return `Du bist ein geduldiger Koreanisch-Lehrer. Dein Schüler ist Deutscher, lebt in Seoul und lernt gerade die Grundlagen.
Erstelle für JEDEN der Einträge unten eine Lernkarte. Ein Eintrag kann Deutsch, Englisch oder Koreanisch sein (Wort, Ausdruck oder ganzer Satz).
Ziel ist immer der koreanische Ausdruck, so wie man ihn im Alltag in Seoul wirklich sagt.

Regeln:
- "ko": koreanisch in Hangul. Verben/Adjektive in der Grundform (-다). Sätze in der höflichen 요-Form.
- "rom": Revised Romanization, so wie es ausgesprochen wird (Lautangleichungen beachten).
- "de": kurze deutsche Bedeutung (max. 3 Varianten, mit " · " getrennt).
- "type": eines von "Wort", "Verb", "Adjektiv", "Ausdruck", "Satz", "Grammatik".
- "expl": 1–3 kurze Sätze auf Deutsch: wann man es benutzt, Höflichkeitsstufe, bei Verben/Adjektiven die 요-Form, bei Sätzen die Bausteine (Wort für Wort), ggf. eine Merkhilfe. Einfach erklären, keine Fachbegriffe ohne Erklärung.
- "ex": ein kurzer, alltagsnaher Beispielsatz (Seoul-Alltag: Café, U-Bahn, Restaurant, Freunde) mit "ko", "rom", "de". Bei einem Satz als Eintrag: eine Variante davon.
- "input": der Eintrag genau so, wie er unten steht.
- Ist ein Eintrag mehrdeutig, nimm die häufigste Alltagsbedeutung. Ist er kein sinnvolles Vokabel, lass ihn weg.

Antworte NUR mit einem JSON-Array, ohne Text davor oder danach, ohne Markdown:
[{"ko":"…","rom":"…","de":"…","type":"…","expl":"…","ex":{"ko":"…","rom":"…","de":"…"},"input":"…"}]

Einträge:
${items.map((x, i) => `${i + 1}. ${x}`).join('\n')}`;
}

function queueItems(items) {
  for (let i = 0; i < items.length; i += 15) {
    const chunk = items.slice(i, i + 15);
    S.put('jobs', { type: 'vocab', prompt: vocabPrompt(chunk), items: chunk, status: 'queued', result: null, error: null });
  }
}

function parseCards(text) {
  const s = String(text || '').replace(/```(json)?/g, '');
  const a = s.indexOf('['), b = s.lastIndexOf(']');
  if (a < 0 || b < a) throw new Error('Antwort nicht lesbar');
  const arr = JSON.parse(s.slice(a, b + 1));
  return arr.filter((c) => c && c.ko && c.de);
}

function addCard(c, source = 'claude') {
  const ko = normKo(c.ko);
  if (!ko || findCard(ko)) return null;
  return S.put('ko_cards', {
    id: cardId(ko), ko, rom: c.rom || '', de: c.de || '', type: c.type || '', expl: c.expl || '',
    ex: c.ex && c.ex.ko ? { ko: c.ex.ko, rom: c.ex.rom || '', de: c.ex.de || '' } : null,
    srs: c.srs && c.srs.state ? c.srs : newSrs(), source,
    ...(c.say ? { say: c.say } : {}), ...(c.deck ? { deck: c.deck } : {}), ...(c.createdAt ? { createdAt: c.createdAt } : {}),
  });
}

// Hangul-Starterdeck (fest eingebaut, kein Claude nötig). createdAt hochzählend = Lernreihenfolge bleibt.
function addHangulDeck() {
  const t = Date.now();
  let n = 0;
  HANGUL_DECK.forEach((c, i) => { if (addCard({ ...c, deck: 'hangul', createdAt: t + i }, 'deck')) n++; });
  toast(n ? `${n} Hangul-Karten hinzugefügt` : 'Hangul-Deck ist schon drin');
  ui.cur = null; render();
}
const sayOf = (c) => c?.say || c?.ko;

// Fertige Claude-Aufträge in Karten umwandeln (auf jedem Gerät; feste IDs verhindern doppelte Karten)
let applying = false;
function applyJobs() {
  if (applying) return;
  const done = vocabJobs().filter((j) => j.status === 'done');
  if (!done.length) return;
  applying = true;
  let added = 0;
  for (const j of done) {
    try {
      const list = parseCards(j.result);
      list.forEach((c) => { if (addCard(c)) added++; });
      S.remove('jobs', j.id);
    } catch (e) { S.patch('jobs', j.id, { status: 'error', error: 'Claudes Antwort war nicht lesbar. Nochmal versuchen?' }); }
  }
  applying = false;
  if (added) toast(`✨ ${added} neue Karte${added === 1 ? '' : 'n'}`);
}

// ---------- UI-Zustand ----------
const ui = { tab: localStorage.getItem('ko-tab') || 'learn', cur: null, curDir: 'ko-de', shown: false, q: '', draft: '', recentFrom: Date.now() };
const TABS = [['learn', 'Lernen', ICON.learn], ['add', 'Neu', ICON.add], ['cards', 'Karten', ICON.list], ['more', 'Mehr', ICON.more]];

function render() {
  const view = { learn: viewLearn, add: viewAdd, cards: viewCards, more: viewMore }[ui.tab] || viewLearn;
  const active = document.activeElement;
  const keep = active && active.id && ['add-text', 'search'].includes(active.id) ? { id: active.id, pos: active.selectionStart } : null;
  const main = $('#main');
  // Nur neu zeichnen, wenn sich wirklich etwas geändert hat. Jeder Speichervorgang (und jede Sync-Bestätigung)
  // löst ein render() aus; ein unnötig ersetztes DOM startet die Einblend-Animation der Karte neu = Flackern.
  const html = view();
  if (html !== render.html) { main.innerHTML = html; render.html = html; }
  else if (!ui.anim) { if (keep) restoreFocus(keep); return; }
  // Spätere Neuzeichnungen (z. B. Sync) sollen die Wechsel-Animation nicht erneut abspielen
  if (!ui.anim) { clearTimeout(render.t); main.classList.remove('enter-in', 'enter-next', 'enter-flip'); }
  $('#tabbar').innerHTML = `<i class="tab-pill"></i>` + TABS.map(([id, label, icon]) => `<button class="${ui.tab === id ? 'on' : ''}" data-act="tab" data-id="${id}">${icon}<span>${label}</span>${id === 'learn' && counts().todo ? `<i class="badge">${counts().todo}</i>` : ''}</button>`).join('');
  // Animationen (nur im Glass-Design sichtbar, CSS entscheidet)
  slidePill($('#tabbar'), 'tabbar');
  main.querySelectorAll('.segs').forEach((seg) => slidePill(seg, 'seg:' + [...seg.querySelectorAll('.seg')].map((b) => b.textContent).join('|'), 'seg-pill'));
  if (ui.anim) {
    main.classList.remove('enter-in', 'enter-next', 'enter-flip'); void main.offsetWidth;
    main.classList.add('enter-' + ui.anim); ui.anim = null;
    clearTimeout(render.t); render.t = setTimeout(() => main.classList.remove('enter-in', 'enter-next', 'enter-flip'), 700);
  }
  if (keep) restoreFocus(keep);
}
function restoreFocus(keep) { const el = $('#' + keep.id); if (el && document.activeElement !== el) { el.focus(); try { el.setSelectionRange(keep.pos, keep.pos); } catch {} } }

// ---------- Animationen (Glass) ----------
// Pille gleitet von der alten zur neuen Position (FLIP): alte Position merken, nach dem Neuzeichnen dorthin setzen und loslaufen lassen.
const pillPos = {};
function slidePill(box, key, cls = 'tab-pill') {
  let pill = box.querySelector(':scope > .' + cls);
  if (!pill) { pill = document.createElement('i'); pill.className = cls; box.prepend(pill); }
  const on = box.querySelector(':scope > .on');
  if (!on) { pill.style.opacity = '0'; return; }
  const to = { x: on.offsetLeft, w: on.offsetWidth }, from = pillPos[key];
  const place = (p) => { pill.style.width = p.w + 'px'; pill.style.transform = `translateX(${p.x}px)`; };
  pill.style.transition = 'none'; place(from || to); void pill.offsetWidth; pill.style.transition = '';
  if (from && (from.x !== to.x || from.w !== to.w)) requestAnimationFrame(() => requestAnimationFrame(() => place(to)));
  pillPos[key] = to;
}
ui.anim = 'in';
// Oben weich ausblenden, sobald gescrollt wird
addEventListener('scroll', () => document.documentElement.classList.toggle('scrolled', scrollY > 4), { passive: true });

// Design: Glass (Standard) oder Klassisch, pro Gerät. index.html setzt es schon vor dem ersten Zeichnen.
const design = () => { try { return localStorage.getItem('ko-design') || 'glass'; } catch { return 'glass'; } };
function setDesign(d) { try { localStorage.setItem('ko-design', d); } catch {} window.applyDesign?.(d); render(); }

// ---------- Lernen ----------
function pickCard(skipId) {
  const c = nextCard(skipId);
  ui.cur = c?.id || null; ui.shown = false;
  const dir = settings().dir;
  ui.curDir = dir === 'mix' ? (Math.random() < 0.5 ? 'ko-de' : 'de-ko') : dir;
  return c;
}

function viewLearn() {
  let c = ui.cur && S.get('ko_cards', ui.cur);
  if (!c) c = pickCard();
  else c = cards().find((x) => x.id === c.id);
  const k = counts(), st = streak(), today = dayDoc();
  const head = `<header class="top"><h1>한국어</h1><div class="chips">
      ${k.fresh ? `<span class="chip blue">${k.fresh} neu</span>` : ''}${k.learn ? `<span class="chip red">${k.learn} lernen</span>` : ''}${k.total && (k.review || !k.todo) ? `<span class="chip green">${k.review} fällig</span>` : ''}
      ${st ? `<span class="chip">🔥 ${st}</span>` : ''}</div></header>`;
  if (!k.total) return head + `<div class="empty"><div class="big">가</div><h2>Los geht’s</h2><p class="muted">Starte mit dem Alphabet: alle ${HANGUL_DECK.length - 6} Buchstaben + 6 Leseregeln, jeweils mit Aussprache, Merkhilfe und Beispielwort.</p><button class="btn primary" data-act="hangul">한 Mit Hangul starten</button><button class="link" data-act="tab" data-id="add">oder eigene Wörter hinzufügen</button></div>`;
  if (!c) return head + `<div class="empty"><div class="big">🎉</div><h2>Für heute erledigt</h2><p class="muted">${today.n ? `${today.n} Abfragen heute. ` : ''}${cards().some((x) => x.srs.state === 'new') ? 'Neue Karten gibt’s morgen wieder.' : 'Füg neue Wörter hinzu, wenn du magst.'}</p>
    <div class="row-btns"><button class="btn" data-act="tab" data-id="add">${ICON.add} Wörter hinzufügen</button>${cards().some((x) => x.srs.state === 'new') ? `<button class="btn" data-act="extra-new">+5 neue heute</button>` : ''}</div></div>`;
  const koFront = ui.curDir === 'ko-de';
  const front = koFront
    ? `<div class="ko big-ko">${esc(c.ko)}</div><button class="speak" data-act="speak" data-text="${esc(sayOf(c))}" aria-label="Anhören">${ICON.speak}</button>`
    : `<div class="de big-de">${esc(c.de)}</div>${c.type ? '' : ''}`;
  const back = `<div class="divider"></div>
    ${koFront ? `<div class="de answer">${esc(c.de)}</div>` : `<div class="ko answer">${esc(c.ko)} <button class="speak inline" data-act="speak" data-text="${esc(sayOf(c))}">${ICON.speak}</button></div>`}
    ${c.rom ? `<div class="rom">${esc(c.rom)}</div>` : ''}
    ${c.expl ? `<p class="expl">${esc(c.expl)}</p>` : ''}
    ${c.ex ? exampleHtml(c.ex) : ''}`;
  const btns = ui.shown
    ? `<div class="grades">${[[1, 'Nochmal'], [2, 'Schwer'], [3, 'Gut'], [4, 'Leicht']].map(([g, l]) => `<button class="g g${g}" data-act="grade" data-g="${g}"><span>${l}</span><small>${preview(c.srs, g)}</small></button>`).join('')}</div>`
    : `<button class="btn primary wide show" data-act="show">Antwort zeigen</button>`;
  return head + `<article class="flash ${ui.shown ? 'open' : ''}" data-act="${ui.shown ? '' : 'show'}">
      <div class="flash-meta"><span>${esc(c.type || '')}</span><span>${c.srs.state === 'new' ? 'Neu' : c.srs.state === 'learn' ? 'Lernen' : ''}</span></div>
      ${front}${ui.shown ? back : `<p class="hint muted">${/Vokal|Konsonant/.test(c.type) ? (koFront ? 'Wie klingt das?' : 'Welcher Buchstabe ist das?') : koFront ? 'Was heißt das?' : 'Wie sagt man das auf Koreanisch?'}</p>`}
    </article>${btns}`;
}

const exampleHtml = (ex) => `<div class="example"><div class="ko">${esc(ex.ko)} <button class="speak inline" data-act="speak" data-text="${esc(ex.ko)}" aria-label="Anhören">${ICON.speak}</button></div>${ex.rom ? `<div class="rom">${esc(ex.rom)}</div>` : ''}<div class="muted">${esc(ex.de)}</div></div>`;

function reveal() {
  if (!ui.cur) return;
  ui.shown = true;
  const c = S.get('ko_cards', ui.cur);
  if (settings().autoplay && ui.curDir === 'de-ko' && c) speak(sayOf(c));
  ui.anim = 'flip';
  render();
}

function answer(g) {
  const c = cards().find((x) => x.id === ui.cur);
  if (!c) return;
  const wasNew = c.srs.state === 'new';
  S.patch('ko_cards', c.id, { srs: grade(c.srs, g) });
  const d = dayDoc();
  S.put('ko_days', { ...d, n: (d.n || 0) + 1, newN: (d.newN || 0) + (wasNew ? 1 : 0), again: (d.again || 0) + (g === 1 ? 1 : 0) });
  const next = pickCard(c.id);
  if (next && settings().autoplay && ui.curDir === 'ko-de') speak(sayOf(next));
  ui.anim = 'next';
  render();
}

// ---------- Neu ----------
function viewAdd() {
  const jobs = vocabJobs();
  const on = helperOnline();
  const recent = cards().filter((c) => (c.createdAt || 0) >= ui.recentFrom - 3600000).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
  return `<header class="top"><h1>Neue Wörter</h1></header>
    <div class="card">
      <textarea id="add-text" rows="4" placeholder="z. B. Rechnung bitte&#10;지하철&#10;how much is this?&#10;&#10;Deutsch, Englisch oder Koreanisch · eine Zeile pro Eintrag">${esc(ui.draft)}</textarea>
      <button class="btn primary wide" data-act="create">${ICON.spark} Karten erstellen</button>
      <p class="muted small">${on ? '🟢 Mac-Helfer online – Claude ist gleich fertig.' : '⚪️ Mac-Helfer offline: die Einträge warten, bis dein Mac wach ist.'} <button class="link" data-act="manual">Selbst ausfüllen</button></p>
    </div>
    ${jobs.length ? `<h2>In Arbeit</h2><div class="list">${jobs.map((j) => `<div class="job ${j.status}">
        <span class="dot"></span><div class="grow"><b>${j.status === 'running' ? 'Claude schreibt die Karten …' : j.status === 'error' ? 'Fehler' : on ? 'Wartet auf Claude …' : 'Wartet auf deinen Mac …'}</b>
        <div class="muted small">${esc((j.items || []).join(' · '))}</div>${j.status === 'error' ? `<div class="danger small">${esc(j.error)}</div>` : ''}</div>
        ${j.status === 'error' ? `<button class="link" data-act="job-retry" data-id="${j.id}">Nochmal</button>` : ''}
        <button class="icon-btn small" data-act="job-del" data-id="${j.id}" aria-label="Entfernen">${ICON.x}</button></div>`).join('')}</div>` : ''}
    ${recent.length ? `<h2>Gerade hinzugefügt</h2><div class="list">${recent.map(cardRow).join('')}</div>` : ''}`;
}

function create() {
  const ta = $('#add-text');
  const lines = [...new Set((ta?.value || '').split(/\n|;/).map((s) => s.trim()).filter(Boolean))];
  if (!lines.length) return toast('Erst etwas eintippen');
  const fresh = lines.filter((l) => !(HANGUL.test(l) && findCard(l)));
  const dup = lines.length - fresh.length;
  if (fresh.length) queueItems(fresh);
  ui.draft = '';
  toast(fresh.length ? `${fresh.length} an Claude geschickt${dup ? ` · ${dup} schon vorhanden` : ''}` : 'Alles schon vorhanden');
  render();
}

// ---------- Karten ----------
function dueLabel(c) {
  if (c.srs.state === 'new') return '<span class="chip blue">neu</span>';
  const d = Math.round((c.srs.due - dayStart(0)) / 86400000);
  if (c.srs.due <= Date.now() || d <= 0) return '<span class="chip red">fällig</span>';
  return `<span class="chip">${d < 30 ? `${d} T` : `${Math.round(d / 30)} Mo`}</span>`;
}
const cardRow = (c) => `<button class="row" data-act="open" data-id="${c.id}"><div class="grow"><div class="ko">${esc(c.ko)} <span class="rom">${esc(c.rom)}</span></div><div class="muted">${esc(c.de)}</div></div>${dueLabel(c.srs ? c : { ...c, srs: newSrs() })}</button>`;

function viewCards() {
  const q = ui.q.trim().toLowerCase();
  const list = cards().filter((c) => !q || [c.ko, c.rom, c.de].some((x) => String(x || '').toLowerCase().includes(q)))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return `<header class="top"><h1>Karten</h1><span class="muted">${cards().length}</span></header>
    <input id="search" type="search" placeholder="Suchen (Koreanisch, Deutsch, Romanisierung)" value="${esc(ui.q)}">
    <div class="list tight">${list.map(cardRow).join('') || '<p class="muted center">Keine Karten gefunden.</p>'}</div>`;
}

function openCard(id) {
  const c = cards().find((x) => x.id === id);
  if (!c) return;
  sheet(`<div class="sheet-head"><span class="muted">${esc(c.type || 'Karte')}</span><button class="icon-btn small" data-act="close">${ICON.x}</button></div>
    <div class="ko big-ko">${esc(c.ko)} <button class="speak inline" data-act="speak" data-text="${esc(sayOf(c))}">${ICON.speak}</button></div>
    <div class="rom">${esc(c.rom)}</div><div class="de answer">${esc(c.de)}</div>
    ${c.expl ? `<p class="expl">${esc(c.expl)}</p>` : ''}${c.ex ? exampleHtml(c.ex) : ''}
    <p class="muted small">${c.srs.state === 'new' ? 'Noch nicht gelernt' : `Nächste Abfrage: ${new Date(c.srs.due).toLocaleDateString('de-DE')} · ${c.srs.reps} Abfragen${c.srs.lapses ? ` · ${c.srs.lapses}× vergessen` : ''}`}</p>
    <div class="row-btns"><button class="btn" data-act="edit" data-id="${c.id}">Bearbeiten</button><button class="btn" data-act="reset" data-id="${c.id}">Neu lernen</button><button class="btn danger" data-act="delete" data-id="${c.id}">Löschen</button></div>`);
}

function editCard(id) {
  const c = id ? S.get('ko_cards', id) : { ko: '', rom: '', de: '', type: 'Wort', expl: '', ex: null };
  const f = (name, label, val, ta) => `<label>${label}${ta ? `<textarea name="${name}" rows="3">${esc(val)}</textarea>` : `<input name="${name}" value="${esc(val)}">`}</label>`;
  sheet(`<div class="sheet-head"><b>${id ? 'Karte bearbeiten' : 'Neue Karte'}</b><button class="icon-btn small" data-act="close">${ICON.x}</button></div>
    <form id="edit-form" class="form">
      ${f('ko', 'Koreanisch', c.ko)}${f('rom', 'Romanisierung', c.rom)}${f('de', 'Deutsch', c.de)}${f('type', 'Art', c.type)}
      ${f('expl', 'Erklärung', c.expl, true)}${f('exko', 'Beispiel (Koreanisch)', c.ex?.ko)}${f('exrom', 'Beispiel (Romanisierung)', c.ex?.rom)}${f('exde', 'Beispiel (Deutsch)', c.ex?.de)}
      <button class="btn primary wide" type="submit">Speichern</button></form>`);
  $('#edit-form').onsubmit = (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    if (!v.ko.trim() || !v.de.trim()) return toast('Koreanisch und Deutsch ausfüllen');
    const data = { ko: normKo(v.ko), rom: v.rom.trim(), de: v.de.trim(), type: v.type.trim(), expl: v.expl.trim(), ex: v.exko.trim() ? { ko: v.exko.trim(), rom: v.exrom.trim(), de: v.exde.trim() } : null };
    if (id) S.patch('ko_cards', id, data);
    else if (!addCard(data, 'manual')) return toast('Gibt es schon');
    closeSheet(); toast('Gespeichert'); render();
  };
}

// ---------- Mehr ----------
function viewMore() {
  const s = settings(), sy = S.sync;
  const opt = (k, v, label) => `<button class="seg ${s[k] === v ? 'on' : ''}" data-act="set" data-k="${k}" data-v="${v}">${label}</button>`;
  return `<header class="top"><h1>Mehr</h1></header>
    <div class="card"><h2>Konto</h2>${sy.user ? `<p>Angemeldet als <b>${esc(sy.user.email)}</b> · Sync ${sy.status === 'online' ? '🟢' : '⚪️'}</p><button class="link" data-act="signout">Abmelden</button>`
      : `<p class="muted">Gleiches Konto wie in der Task-App. Ohne Anmeldung gibt’s keinen Claude und keinen Sync.</p>
      <form id="login" class="form"><input name="email" type="email" placeholder="E-Mail" autocomplete="username"><input name="pw" type="password" placeholder="Passwort" autocomplete="current-password"><button class="btn primary wide">Anmelden</button></form>`}</div>
    <div class="card"><h2>Lernen</h2>
      <p class="label">Neue Karten pro Tag</p><div class="segs">${[5, 10, 15, 20, 30].map((n) => opt('newPerDay', n, n)).join('')}</div>
      <p class="label">Abfrage-Richtung</p><div class="segs">${opt('dir', 'ko-de', '한 → DE')}${opt('dir', 'de-ko', 'DE → 한')}${opt('dir', 'mix', 'Gemischt')}</div>
      <p class="label">Aussprache automatisch abspielen</p><div class="segs">${opt('autoplay', true, 'An')}${opt('autoplay', false, 'Aus')}</div></div>
    <div class="card"><h2>Design</h2>
      <div class="theme-pick">${[['glass', 'Glass'], ['classic', 'Klassisch']].map(([d, l]) => `<button class="t-${d} ${design() === d ? 'on' : ''}" data-act="design" data-v="${d}"><i></i>${l}</button>`).join('')}</div>
      <p class="muted small">Gilt für dieses Gerät.</p></div>
    <div class="card"><h2>Decks</h2><p class="muted">Hangul-Starterdeck: ${HANGUL_DECK.length} Karten (Vokale, Konsonanten, Doppelkonsonanten, Mischvokale, Leseregeln).</p>
      <button class="btn" data-act="hangul">${cards().some((c) => c.deck === 'hangul') ? 'Fehlende Hangul-Karten ergänzen' : 'Hangul-Deck hinzufügen'}</button></div>
    <div class="card"><h2>Import & Export</h2>
      <p class="muted">Anki: <i>Datei → Exportieren → „Notizen als reinen Text“</i>. Die koreanischen Wörter daraus gehen an Claude und werden zu vollständigen Karten. Oder eine Kartendatei (.json) laden.</p>
      <input type="file" id="import-file" accept=".txt,.tsv,.csv,.json" hidden>
      <div class="row-btns"><button class="btn" data-act="import">Datei importieren</button><button class="btn" data-act="export">Exportieren</button></div></div>
    <div class="card"><h2>Mac-Helfer</h2><p class="muted">${helperOnline() ? '🟢 Online' : '⚪️ Offline'} · Claude läuft über dein Abo auf deinem Mac (derselbe Helfer wie für Tasks und Health). Kein Update nötig.</p></div>
    <p class="muted center small">Koreanisch · Version ${VERSION}</p>`;
}

function importFile(file) {
  const r = new FileReader();
  r.onload = () => {
    const text = String(r.result || '');
    if (/\.json$/i.test(file.name) || /^\s*[[{]/.test(text)) {
      try {
        const j = JSON.parse(text);
        const list = Array.isArray(j) ? j : j.cards || Object.values(j.data?.ko_cards || {});
        let n = 0; list.forEach((c) => { if (addCard(c, c.source || 'import')) n++; });
        toast(`${n} Karten importiert${list.length - n ? ` · ${list.length - n} schon vorhanden` : ''}`);
        ui.tab = 'cards'; render();
      } catch (e) { toast('Datei nicht lesbar'); }
      return;
    }
    // Anki-Text: Tab-getrennte Felder, Zeilen mit # sind Kopfzeilen
    const strip = (s) => s.replace(/\[sound:[^\]]*\]/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/^"|"$/g, '').replace(/\s+/g, ' ').trim();
    const words = [];
    text.split(/\r?\n/).forEach((line) => {
      if (!line.trim() || line.startsWith('#')) return;
      const fields = line.split(/\t/).map(strip).filter(Boolean);
      const ko = fields.find((f) => HANGUL.test(f));
      if (ko && !findCard(ko) && !words.includes(ko)) words.push(ko);
    });
    if (!words.length) return toast('Keine koreanischen Wörter gefunden');
    ui.draft = words.join('\n'); ui.tab = 'add'; render();
    toast(`${words.length} Wörter übernommen – prüfen und „Karten erstellen“ tippen`);
  };
  r.readAsText(file);
}

function exportCards() {
  const blob = new Blob([JSON.stringify({ app: 'korean', version: 1, exportedAt: new Date().toISOString(), cards: cards() }, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `koreanisch-${dayKey()}.json` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- Sheet + Toast ----------
let sheetToken = 0;
function sheet(html) {
  const root = $('#sheet-root');
  const wasOpen = !!root.querySelector('.sheet') && !root.classList.contains('closing');
  sheetToken++; root.classList.remove('closing');
  root.innerHTML = `<div class="backdrop" data-act="close"></div><div class="sheet${wasOpen ? ' swap' : ''}"><div class="grab"></div>${html}</div>`;
  document.body.classList.add('sheet-open');
  dragToClose(root.querySelector('.sheet'));
}
function closeSheet() {
  const root = $('#sheet-root');
  document.body.classList.remove('sheet-open');
  if (!root.innerHTML || root.classList.contains('closing')) return;
  if (design() !== 'glass' || matchMedia('(prefers-reduced-motion: reduce)').matches) { root.innerHTML = ''; return; }
  const my = ++sheetToken;
  root.classList.add('closing');
  setTimeout(() => { if (my !== sheetToken) return; root.classList.remove('closing'); root.innerHTML = ''; }, 260);
}
// Sheet nach unten wegziehen (wie bei iOS)
function dragToClose(el) {
  let y0 = null, dy = 0;
  el.addEventListener('touchstart', (e) => { if (design() !== 'glass' || el.scrollTop > 0 || e.target.closest('input, textarea, select')) return; y0 = e.touches[0].clientY; dy = 0; el.style.transition = 'none'; }, { passive: true });
  el.addEventListener('touchmove', (e) => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); if (dy > 0) el.style.transform = `translate(-50%, ${dy}px)`; }, { passive: true });
  el.addEventListener('touchend', () => {
    if (y0 === null) return; y0 = null; el.style.transition = '';
    if (dy > 110) closeSheet(); else el.style.transform = '';
  });
}
let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button data-act="toast-action">${esc(action.label)}</button>` : ''}`;
  el._action = action?.run;
  el.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), action ? 5000 : 2600);
}

// ---------- Events ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t || !t.dataset.act) return;
  const { act, id } = t.dataset;
  switch (act) {
    case 'tab': if (ui.tab !== id) ui.anim = 'in'; ui.tab = id; localStorage.setItem('ko-tab', id); if (id === 'add') ui.recentFrom = Date.now(); closeSheet(); render(); window.scrollTo(0, 0); break;
    case 'show': reveal(); break;
    case 'grade': e.stopPropagation(); answer(+t.dataset.g); break;
    case 'speak': e.stopPropagation(); speak(t.dataset.text); break;
    case 'extra-new': { const d = dayDoc(); S.put('ko_days', { ...d, newN: (d.newN || 0) - 5 }); render(); break; }
    case 'create': create(); break;
    case 'hangul': addHangulDeck(); break;
    case 'manual': editCard(null); break;
    case 'job-del': S.remove('jobs', id); break;
    case 'job-retry': S.patch('jobs', id, { status: 'queued', error: null, result: null }); break;
    case 'open': openCard(id); break;
    case 'edit': editCard(id); break;
    case 'reset': S.patch('ko_cards', id, { srs: newSrs() }); closeSheet(); toast('Karte startet neu'); break;
    case 'delete': {
      const c = S.get('ko_cards', id); S.remove('ko_cards', id); closeSheet();
      if (ui.cur === id) ui.cur = null;
      toast('Gelöscht', { label: 'Rückgängig', run: () => S.put('ko_cards', c) }); break;
    }
    case 'close': closeSheet(); break;
    case 'set': { const v = t.dataset.v; setSetting(t.dataset.k, v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? +v : v); if (t.dataset.k === 'dir') ui.cur = null; break; }
    case 'design': setDesign(t.dataset.v); break;
    case 'signout': S.signOutUser(); break;
    case 'import': $('#import-file').click(); break;
    case 'export': exportCards(); break;
    case 'toast-action': $('#toast')._action?.(); $('#toast').classList.remove('on'); break;
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'search') { ui.q = e.target.value; render(); }
  if (e.target.id === 'add-text') ui.draft = e.target.value;
});
document.addEventListener('change', (e) => { if (e.target.id === 'import-file' && e.target.files[0]) importFile(e.target.files[0]); });
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'login') return;
  e.preventDefault();
  const f = new FormData(e.target);
  try { await S.signIn(f.get('email').trim(), f.get('pw')); toast('Angemeldet'); } catch (err) { toast('Anmeldung fehlgeschlagen'); }
});
document.addEventListener('keydown', (e) => {
  if (ui.tab !== 'learn' || /INPUT|TEXTAREA/.test(document.activeElement?.tagName) || $('#sheet-root').innerHTML) return;
  if ((e.key === ' ' || e.key === 'Enter') && !ui.shown) { e.preventDefault(); reveal(); }
  else if (ui.shown && /^[1-4]$/.test(e.key)) answer(+e.key);
  else if (e.key === 'Enter' && ui.shown) answer(3);
});
// Cmd/Ctrl+Enter im Eingabefeld = Karten erstellen
document.addEventListener('keydown', (e) => { if (e.target.id === 'add-text' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) create(); });

let renderTimer;
S.subscribe(() => { setTimeout(applyJobs, 0); clearTimeout(renderTimer); renderTimer = setTimeout(() => { if (!$('#sheet-root').innerHTML || ui.tab !== 'cards') render(); }, 30); });
// Fälligkeiten ändern sich mit der Zeit (Lernschritte von 1/10 Min)
setInterval(() => { if (ui.tab === 'learn' && !ui.shown) { if (!ui.cur) pickCard(); render(); } }, 30000);
if ('speechSynthesis' in window) speechSynthesis.getVoices();

render();
applyJobs();
S.initSync();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
