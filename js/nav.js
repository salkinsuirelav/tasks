// Bereiche der App + deine eigene Reihenfolge (settings.navOrder, wird über den Sync auf alle Geräte übertragen).
// Auf dem iPhone stehen die ersten BAR Einträge unten in der Leiste, der Rest unter „Mehr“.
export const NAV = [
  { href: '#today', label: 'Heute', icon: 'sun' },
  { href: '#mail', label: 'Mail', icon: 'mail' },
  { href: '#plan', label: 'Plan', icon: 'board' },
  { href: '#calendar', label: 'Kalender', icon: 'calendar' },
  { href: '#projects', label: 'Projekte', icon: 'folder' },
  { href: '#review', label: 'Rückblick', icon: 'chart' },
  { href: '#finance', label: 'Finanzen', icon: 'wallet' },
];
export const BAR = 4;
export function navItems(settings) {
  const order = Array.isArray(settings?.navOrder) ? settings.navOrder : [];
  const pos = (h) => { const i = order.indexOf(h); return i < 0 ? 100 + NAV.findIndex((n) => n.href === h) : i; };
  return NAV.slice().sort((a, b) => pos(a.href) - pos(b.href));
}
// Eintrag `href` vor `before` setzen (null = ans Ende); gibt die neue Reihenfolge zurück
export function reorder(settings, href, before) {
  const list = navItems(settings).map((n) => n.href).filter((h) => h !== href);
  const i = before ? list.indexOf(before) : -1;
  list.splice(i < 0 ? list.length : i, 0, href);
  return list;
}
