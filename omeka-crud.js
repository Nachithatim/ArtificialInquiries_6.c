(function (root) {
  'use strict';
  const protectedIds = [53, 55, 56, 57, 111];
  function client(base, location, request = fetch) {
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (!base) base = local ? '/artificial-auth/' : '';
    if (!base) throw Error('Backend HTTPS public non configuré. Le CRUD distant est indisponible.');
    const target = new URL(base, location.href);
    if (target.username || target.password || target.search || target.hash || !target.pathname.endsWith('/') ||
        (target.protocol !== 'https:' && !(local && target.origin === location.origin && target.protocol === 'http:'))) {
      throw Error('Adresse de backend invalide.');
    }
    function itemId(id) {
      if (!Number.isSafeInteger(id) || id < 1 || protectedIds.includes(id)) throw Error('ID temporaire invalide ou protégé.');
      return id;
    }
    async function call(path, body, csrf) {
      const response = await request(new URL(path, target), {
        method: body === undefined ? 'GET' : 'POST', credentials: 'include', cache: 'no-store',
        headers: body === undefined ? { Accept: 'application/json' } : {
          Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf
        }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000)
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || `Backend HTTP ${response.status}.`);
      return data;
    }
    async function session() {
      const result = await call('session.php');
      if (!result.authenticated) throw Error('Connexion PHP locale requise pour la simulation.');
      if (result.dryRunLocked !== true || typeof result.csrfToken !== 'string' || !result.csrfToken) {
        throw Error('Le backend ne garantit pas le verrou de simulation.');
      }
      return result;
    }
    return Object.freeze({
      session,
      async identity() { await session(); return call('omeka-identity.php'); },
      async read(id) { itemId(id); await session(); return call(`omeka-resource.php?itemId=${id}`); },
      async prepare(action, id, values) {
        if (!['create', 'update', 'delete'].includes(action)) throw Error('Action invalide.');
        if (action === 'create' && id !== null) throw Error('Une création ne cible aucun Item existant.');
        if (action !== 'create') itemId(id);
        const state = await session();
        return call('omeka-write.php', { phase: 'prepare', action, itemId: id, values: action === 'delete' ? null : values }, state.csrfToken);
      },
      async confirm(plan, phrase) {
        if (typeof plan?.token !== 'string' || phrase !== plan.confirmation) throw Error('Saisir la confirmation exacte.');
        const state = await session();
        const result = await call('omeka-write.php', { phase: 'confirm', token: plan.token,
          confirmation: phrase, dryRun: true }, state.csrfToken);
        if (result.dryRun !== true || result.written !== false) throw Error('Réponse incompatible avec une simulation. Vérification requise.');
        return result;
      }
    });
  }
  const api = Object.freeze({ client });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ArtificialOmekaCrud = api;
})(globalThis);
