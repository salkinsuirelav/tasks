// Tastenkürzel (Mac). Einzelne Tasten, funktionieren nur, wenn du gerade nicht in einem Textfeld tippst.
// Eigene Belegung wird in den Einstellungen gespeichert (settings.keys).
export const SHORTCUTS = [
  { id: 'new', label: 'Neue Aufgabe', key: 'n' },
  { id: 'inbox', label: 'Inbox öffnen', key: '1' },
  { id: 'plan', label: 'Plan öffnen', key: '2' },
  { id: 'calendar', label: 'Kalender öffnen', key: '3' },
  { id: 'projects', label: 'Projekte öffnen', key: '4' },
  { id: 'review', label: 'Rückblick öffnen', key: '5' },
  { id: 'settings', label: 'Einstellungen', key: ',' },
  { id: 'today', label: 'Zu heute springen', key: 't' },
  { id: 'prev', label: 'Zurück (Woche/Tag)', key: 'ArrowLeft' },
  { id: 'next', label: 'Weiter (Woche/Tag)', key: 'ArrowRight' },
  { id: 'nav', label: 'Seitenleiste ein/aus', key: 'b' },
  { id: 'side', label: 'Offene Aufgaben im Kalender ein/aus', key: 'o' },
  { id: 'autoplan', label: 'Auto-Plan', key: 'a' },
  { id: 'claude', label: 'Mit Claude planen', key: 'c' },
  { id: 'theme', label: 'Hell/Dunkel wechseln', key: 'd' },
  { id: 'done', label: 'Offene Aufgabe erledigen', key: 'e' },
  { id: 'focus', label: 'Offene Aufgabe: Fokus-Modus', key: 'f' },
  { id: 'help', label: 'Kürzel anzeigen', key: '?' },
];

export const keyOf = (settings, id) => (settings.keys && id in settings.keys ? settings.keys[id] : SHORTCUTS.find((s) => s.id === id).key);

export function actionFor(settings, key) {
  const k = key.length === 1 ? key.toLowerCase() : key;
  return SHORTCUTS.find((s) => (keyOf(settings, s.id) || '').toLowerCase() === k.toLowerCase())?.id || null;
}

export const keyLabel = (k) => ({ ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', ' ': 'Leertaste', '': '–' }[k ?? ''] ?? (k.length === 1 ? k.toUpperCase() : k));
