(function (root) {
  'use strict';
  const fields = Object.freeze({
    taskId: 'dcterms:identifier', taskFit: 'artinq:adequationTache',
    professionalRelevance: 'artinq:pertinenceProfessionnelle', personalOutcome: 'artinq:consequencePersonnelle',
    expectedPerformance: 'artinq:performanceAttendue', confidence: 'artinq:confianceComplete',
    goodEnough: 'artinq:critereAcceptable', failure: 'artinq:critereEchec', success: 'artinq:critereReussite'
  });
  const base = 'https://nachit.alwaysdata.net/artificial-api/';
  function itemId(id) {
    if (!Number.isSafeInteger(id) || id <= 1) throw Error('Réponse non autorisée : l’item 1 est protégé.');
    return id;
  }
  function values(input) {
    if (!input || Object.keys(input).length !== 9 || Object.keys(fields).some(key =>
      typeof input[key] !== 'string' || !input[key].trim() || input[key].includes('\0') ||
      new TextEncoder().encode(input[key]).length > 12000)) {
      throw Error('Renseignez les neuf champs de la tâche (12 000 octets maximum par champ).');
    }
    return Object.fromEntries(Object.keys(fields).map(key => [key, input[key]]));
  }
  function decode(item, expectedId) {
    if (!item || itemId(item['o:id']) !== expectedId) throw Error('Réponse Omeka inattendue.');
    return Object.fromEntries(Object.entries(fields).map(([key, term]) => {
      const entries = item[term];
      if (!Array.isArray(entries) || entries.length === 0 || entries.some(entry => typeof entry?.['@value'] !== 'string')) {
        throw Error('Réponse Omeka incomplète : ' + term + '. La grille est conservée.');
      }
      return [key, entries.map(entry => entry['@value']).join('\n')];
    }));
  }
  function client(configuredBase, request = fetch) {
    // This client can never address the university API or a caller-selected host.
    if (configuredBase !== base) throw Error('Le backend personnel Alwaysdata doit être configuré.');
    async function call(path, body, csrf) {
      let response;
      try {
        response = await request(new URL(path, base), {
          method: body === undefined ? 'GET' : 'POST', credentials: 'include', cache: 'no-store',
          headers: body === undefined ? { Accept: 'application/json' } :
            { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(45000)
        });
      } catch {
        throw Error(body === undefined ? 'Backend inaccessible. Vérifiez la connexion.' :
          'Résultat de l’opération incertain. Actualisez la liste et consultez la réponse avant toute nouvelle tentative.');
      }
      let data;
      try { data = await response.json(); }
      catch { throw Error('Réponse serveur invalide. Vérifiez la liste avant de répéter une opération.'); }
      if (!response.ok) {
        const error = Error(response.status === 401 ? 'Connexion PHP requise ou expirée. Reconnectez-vous.' :
          response.status === 403 ? 'Opération refusée : session, CSRF ou droits insuffisants.' :
          response.status === 404 ? 'Cette réponse n’existe plus. Actualisez la liste.' :
          `Erreur du backend (HTTP ${response.status}). Vérifiez la liste avant de réessayer.`);
        error.status = response.status;
        throw error;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Réponse serveur invalide.');
      return data;
    }
    async function session() {
      const state = await call('session.php');
      if (state.authenticated !== true || typeof state.csrfToken !== 'string' || !state.csrfToken) {
        const error = Error('Connectez-vous avec le compte PHP fourni pour l’exercice.');
        error.status = 401;
        throw error;
      }
      // dryRunLocked describes the old university simulation endpoint, not this personal CRUD.
      return state;
    }
    async function mutate(action, id, input) {
      const payload = { action };
      if (action !== 'create') payload.itemId = itemId(id);
      if (action !== 'delete') payload.values = values(input);
      const state = await session();
      const result = await call('omeka-local-crud.php', payload, state.csrfToken);
      if (action === 'delete') {
        if (result.deleted !== true || result.itemId !== id) throw Error('Suppression non confirmée. Actualisez la liste.');
      } else {
        itemId(result.itemId);
        if ((id !== null && result.itemId !== id) || result.item?.['o:id'] !== result.itemId) {
          throw Error('Résultat incertain. Consultez la liste avant toute nouvelle tentative.');
        }
      }
      return result;
    }
    return Object.freeze({
      session,
      async list() {
        await session();
        const data = await call('omeka-local-crud.php');
        if (!Array.isArray(data.items) || data.items.some(id => !Number.isSafeInteger(id) || id < 1)) {
          throw Error('Liste de réponses invalide.');
        }
        return [...new Set(data.items.filter(id => id !== 1))];
      },
      async read(id) {
        itemId(id); await session();
        const data = await call('omeka-local-crud.php?itemId=' + id);
        return { itemId: id, values: decode(data.item, id) };
      },
      create: input => mutate('create', null, input),
      update: (id, input) => mutate('update', id, input),
      delete: id => mutate('delete', id)
    });
  }
  const api = Object.freeze({ client, fields, values, decode });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ArtificialPersonalOmeka = api;
})(globalThis);
