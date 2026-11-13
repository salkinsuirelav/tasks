// Mini-Markdown für Claude-Antworten: Absätze, Bullets (auch eingerückt), **fett**, `code`, [Link](url), Überschriften.
// Alles wird zuerst escaped, dann werden nur diese Muster wieder in HTML verwandelt (sicher gegen fremdes HTML).
import { esc } from './util.js';

const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, pre, url) => { const t = url.replace(/^https?:\/\/(www\.)?/, ''); return `${pre}<a href="${url}" target="_blank" rel="noopener">${t.length > 40 ? t.slice(0, 40) + '…' : t}</a>`; });

export function md(text) {
  const out = [];
  let depth = 0; // offene <ul>
  const close = (to) => { while (depth > to) { out.push('</ul>'); depth--; } };
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const li = line.match(/^(\s*)[-*•]\s+(.*)$/);
    if (li) {
      const level = Math.min(3, Math.floor(li[1].replace(/\t/g, '  ').length / 2) + 1);
      if (level > depth) { while (depth < level) { out.push('<ul>'); depth++; } } else close(level);
      out.push(`<li>${inline(li[2])}</li>`);
      continue;
    }
    close(0);
    if (!line.trim()) continue;
    const h = line.match(/^#{1,6}\s+(.*)$/);
    out.push(h ? `<h5>${inline(h[1])}</h5>` : `<p>${inline(line)}</p>`);
  }
  close(0);
  return out.join('');
}

// Trennt eine angehängte Quellenliste ("Sources:" / "Quellen:") vom Rest
export function splitSources(text) {
  const m = text.match(/\n\s*(?:\*\*)?(Sources|Quellen)(?:\*\*)?:?\s*\n([\s\S]*)$/i);
  if (!m) return { body: text.trim(), sources: [] };
  const sources = [...m[2].matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g)].map((x) => ({ name: x[1], url: x[2] }));
  return { body: text.slice(0, m.index).trim(), sources };
}
