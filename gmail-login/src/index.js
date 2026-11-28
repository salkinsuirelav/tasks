// Tasks · Gmail-Login-Dienst (Cloudflare Worker, kostenloser Plan).
// Google gibt Web-Apps ohne eigenen Server den Zugriff nur für 1 Stunde. Dieser Dienst tauscht einmal den
// Anmelde-Code gegen einen Dauer-Schlüssel (refresh token) und holt damit später neue Stunden-Schlüssel,
// ohne Pop-up. Dafür braucht es das Client-Secret, und das darf nicht in die App (öffentliches Repo).
//
// Datenschutz: Der Dienst speichert nichts. Der Dauer-Schlüssel liegt nur auf deinen Geräten (im Browser),
// Mails laufen nie hier durch. Antworten bekommt nur die Task-App (Herkunft wird geprüft).
// Geheimnisse: GOOGLE_CLIENT_SECRET (wrangler secret), GOOGLE_CLIENT_ID (var). Einrichten: setup.command.

const ORIGINS = ['https://salkinsuirelav.github.io'];
const SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

const json = (status, body, cors) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors } });

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = [...ORIGINS, ...(env.EXTRA_ORIGIN ? [env.EXTRA_ORIGIN] : [])];
    const cors = allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin' } : {};
    if (req.method === 'OPTIONS') return new Response(null, { status: cors['Access-Control-Allow-Origin'] ? 204 : 403, headers: cors });
    if (!cors['Access-Control-Allow-Origin']) return json(403, { error: 'forbidden', message: 'Nur die Task-App darf diesen Dienst nutzen.' }, cors);
    if (req.method !== 'POST') return json(405, { error: 'method', message: 'Nur POST.' }, cors);
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return json(500, { error: 'setup', message: 'Login-Dienst ist noch nicht fertig eingerichtet (Client-ID/Secret fehlen). setup.command nochmal starten.' }, cors);

    const path = new URL(req.url).pathname;
    let j = {};
    try { j = await req.json(); } catch {}
    let form;
    // Popup-Anmeldung der App (Google Identity Services, Code-Modell): redirect_uri ist immer "postmessage"
    if (path === '/token' && typeof j.code === 'string' && j.code.length < 2048) form = { grant_type: 'authorization_code', code: j.code, redirect_uri: 'postmessage' };
    else if (path === '/refresh' && typeof j.refresh_token === 'string' && j.refresh_token.length < 2048) form = { grant_type: 'refresh_token', refresh_token: j.refresh_token };
    else return json(400, { error: 'bad', message: 'Ungültige Anfrage.' }, cors);

    let r, t = {};
    try {
      r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ...form, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET }),
      });
      t = await r.json();
    } catch { return json(502, { error: 'google', message: 'Google antwortet gerade nicht.' }, cors); }
    if (!r.ok) {
      // invalid_grant = Dauer-Schlüssel abgelaufen/widerrufen (z. B. Google-Passwort geändert): App fragt dann einmal neu
      const msg = t.error === 'invalid_grant' ? 'Die dauerhafte Anmeldung ist abgelaufen. Bitte einmal neu bei Google anmelden.'
        : t.error === 'invalid_client' ? 'Client-ID oder Client-Secret stimmt nicht. setup.command nochmal starten.'
        : `Google lehnt ab (${t.error || r.status}).`;
      return json(r.status === 400 || r.status === 401 ? 400 : 502, { error: t.error || 'google', message: msg }, cors);
    }
    if (!String(t.scope || '').split(' ').includes(SCOPE)) return json(400, { error: 'scope', message: 'Bitte beim Google-Login das Häkchen für Gmail setzen.' }, cors);
    return json(200, { access_token: t.access_token, expires_in: t.expires_in, refresh_token: t.refresh_token || null, scope: t.scope }, cors);
  },
};
