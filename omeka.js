(function (root) {
  'use strict';
  const ids = Object.freeze([53, 55, 56, 57]);
  const fields = Object.freeze({
    taskId: 'dcterms:identifier',
    taskFit: 'artinq:adequationTache',
    professionalRelevance: 'artinq:pertinenceProfessionnelle',
    personalOutcome: 'artinq:consequencePersonnelle',
    expectedPerformance: 'artinq:performanceAttendue',
    confidence: 'artinq:confianceComplete',
    goodEnough: 'artinq:critereAcceptable',
    failure: 'artinq:critereEchec',
    success: 'artinq:critereReussite'
  });
  function decode(items) {
    if (!Array.isArray(items) || items.length !== ids.length) throw new Error('Quatre Items requis.');
    const byId = new Map(items.map(item => [item && item['o:id'], item]));
    return ids.map(id => {
      const item = byId.get(id);
      if (!item) throw new Error(`Item ${id} absent.`);
      const values = Object.fromEntries(Object.entries(fields).map(([key, term]) => {
        const entries = item[term];
        if (!Array.isArray(entries) || entries.length === 0 ||
            entries.some(entry => !entry || typeof entry['@value'] !== 'string')) {
          throw new Error(`Item ${id} : propriété textuelle ${term} absente ou invalide.`);
        }
        return [key, entries.map(entry => entry['@value']).join('\n')];
      }));
      return { editing: false, values };
    });
  }
  function isStatic(configuredBase, location) {
    return !configuredBase && !['localhost', '127.0.0.1'].includes(location.hostname);
  }
  function decodeSnapshot(snapshot) {
    if (!snapshot || snapshot.version !== 1 || snapshot.mode !== 'static-public-export' ||
        snapshot.source !== 'https://humanum-p8.fr/omk_artificialinquiries/api' ||
        typeof snapshot.exportedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.exportedAt))) {
      throw new Error('Instantané public invalide.');
    }
    // Accept only the public, minimal schema. Never import a raw authenticated API dump.
    if (Object.keys(snapshot).some(key => !['version', 'mode', 'source', 'exportedAt', 'items'].includes(key)) ||
        !Array.isArray(snapshot.items) || snapshot.items.some(item => !item ||
          Object.keys(item).some(key => key !== 'o:id' && !Object.values(fields).includes(key)) ||
          Object.values(fields).some(term => !Array.isArray(item[term]) || item[term].some(entry =>
            !entry || Object.keys(entry).length !== 1 || typeof entry['@value'] !== 'string')))) {
      throw new Error('Schéma de l’instantané public invalide.');
    }
    return decode(snapshot.items);
  }
  async function read(configuredBase, location, request = fetch) {
    if (isStatic(configuredBase, location)) {
      const target = new URL('data/omeka-public.json', location.href);
      const response = await request(target, {
        method: 'GET', credentials: 'omit', cache: 'no-store',
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error(`Instantané public HTTP ${response.status}.`);
      const snapshot = await response.json();
      return { records: decodeSnapshot(snapshot), mode: 'static', exportedAt: snapshot.exportedAt };
    }
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    const base = configuredBase || (local ? '/artificial-auth/' : '');
    const target = new URL(base, location.href);
    if (target.username || target.password || target.search || target.hash || !target.pathname.endsWith('/') ||
        (target.protocol !== 'https:' && !(local && target.origin === location.origin && target.protocol === 'http:'))) {
      throw new Error('Adresse du backend invalide (HTTPS et barre finale requis).');
    }
    const response = await request(new URL('omeka.php', target), {
      method: 'GET', credentials: 'include', cache: 'no-store',
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(45000)
    });
    if (!response.ok) throw new Error(`Proxy HTTP ${response.status}.`);
    return { records: decode(await response.json()), mode: 'dynamic', exportedAt: null };
  }
  async function load(configuredBase, location, request = fetch) {
    return (await read(configuredBase, location, request)).records;
  }
  const api = Object.freeze({ ids, fields, decode, decodeSnapshot, isStatic, read, load });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ArtificialOmeka = api;
})(globalThis);
