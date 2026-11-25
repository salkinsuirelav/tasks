// Spaced Repetition (vereinfachtes Anki/SM-2).
// card.srs = { state: 'new'|'learn'|'review', due: ms, ivl: Tage, ease, step, reps, lapses }
// Bewertung: 1 Nochmal · 2 Schwer · 3 Gut · 4 Leicht

const MIN = 60000, DAY = 86400000;
const STEPS = [1, 10];                       // Lernschritte in Minuten (neu + nach "Nochmal")
export const newSrs = () => ({ state: 'new', due: 0, ivl: 0, ease: 2.5, step: 0, reps: 0, lapses: 0 });

// Fällig "am Tag X" = ab 4 Uhr morgens (wie Anki), damit Abends-Lernen nicht den nächsten Tag verschiebt
export function dayStart(offsetDays = 0, now = Date.now()) {
  const d = new Date(now - 4 * 3600000);
  d.setHours(4, 0, 0, 0);
  return d.getTime() + offsetDays * DAY;
}
const inDays = (n, now) => dayStart(Math.max(1, Math.round(n)), now);

export function grade(srs0, g, now = Date.now()) {
  const s = { ...newSrs(), ...srs0, reps: (srs0?.reps || 0) + 1, last: now };
  if (s.state === 'review') {
    if (g === 1) { s.lapses++; s.ease = Math.max(1.3, s.ease - 0.2); s.ivl = Math.max(1, s.ivl * 0.5); s.state = 'learn'; s.step = 0; s.due = now + STEPS[0] * MIN; return s; }
    if (g === 2) { s.ivl = Math.max(s.ivl + 1, s.ivl * 1.2); s.ease = Math.max(1.3, s.ease - 0.15); }
    if (g === 3) s.ivl = Math.max(s.ivl + 1, s.ivl * s.ease);
    if (g === 4) { s.ivl = Math.max(s.ivl + 2, s.ivl * s.ease * 1.3); s.ease += 0.15; }
    s.ivl = Math.min(365, s.ivl);
    s.due = inDays(s.ivl, now);
    return s;
  }
  // neu oder in den Lernschritten
  const relearn = s.ivl > 0; // nach "Nochmal" bei einer schon gelernten Karte
  if (g === 1) { s.state = 'learn'; s.step = 0; s.due = now + STEPS[0] * MIN; return s; }
  if (g === 2) { s.state = 'learn'; s.due = now + Math.round((STEPS[s.step] + (STEPS[s.step + 1] || STEPS[s.step])) / 2) * MIN; return s; }
  if (g === 3 && s.step < STEPS.length - 1) { s.state = 'learn'; s.step++; s.due = now + STEPS[s.step] * MIN; return s; }
  s.state = 'review'; s.step = 0;
  s.ivl = g === 4 ? (relearn ? s.ivl + 1 : 4) : (relearn ? s.ivl : 1);
  s.due = inDays(s.ivl, now);
  return s;
}

// Text für die Buttons: "1 Min", "10 Min", "3 T", "2 Mo"
export function preview(srs, g, now = Date.now()) {
  const due = grade(srs, g, now).due, diff = due - now;
  if (diff < 60 * MIN) return `${Math.max(1, Math.round(diff / MIN))} Min`;
  if (diff < DAY * 0.9) return `${Math.round(diff / 3600000)} Std`;
  const d = Math.round((due - dayStart(0, now)) / DAY);
  return d < 30 ? `${d} T` : d < 365 ? `${Math.round(d / 30)} Mo` : `${(d / 365).toFixed(1)} J`;
}
