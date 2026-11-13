// Zustand der Oberfläche (was gerade offen ist). Wird nicht synchronisiert.
import { today, weekStart } from './util.js';

export const ui = {
  inboxTab: 'open',      // open | planned | done
  planStart: today(),    // erster Tag im Kanban
  calStart: weekStart(today()), // Montag der angezeigten Kalenderwoche
  calDay: today(),       // angezeigter Tag auf dem iPhone
  reviewWeek: weekStart(today()),
  openTask: null,        // id des Tasks in der Detail-Ansicht
  focusTask: null,       // id im Fokus-Modus
  modal: null,           // { type, ... }
  drag: null,            // { id, kind, offsetMin }
  select: null,          // Kalender: aufgezogener Zeitraum { date, s, e }
  aiOpen: null,          // Claude-Ergebnis ausgeklappt (job-id)
  recordKey: null,       // Einstellungen: welches Kürzel gerade neu belegt wird
};

export const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
