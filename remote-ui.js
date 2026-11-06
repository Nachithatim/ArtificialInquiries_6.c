(() => {
  'use strict';
  const panel = document.querySelector('#remote-crud');
  if (!panel) return;
  const output = panel.querySelector('#remote-status');
  const preview = panel.querySelector('#remote-preview');
  const confirmation = panel.querySelector('#remote-confirmation');
  const confirm = panel.querySelector('#remote-confirm');
  const id = panel.querySelector('#remote-item-id');
  const controls = [...panel.querySelectorAll('button')];
  let api, pending = null, loaded = null, busy = false;
  function message(text) { output.textContent = text; }
  function invalidate() { pending = null; confirm.disabled = true; confirmation.value = ''; }
  try { api = ArtificialOmekaCrud.client(window.ARTIFICIAL_AUTH_BASE, location); }
  catch (error) { controls.forEach(button => button.disabled = true); message(error.message); return; }
  function values() {
    const index = /^#task-[1-4]$/.test(location.hash) ? location.hash.slice(-1) : '1';
    return Object.fromEntries(Object.keys(ArtificialOmeka.fields).map(key => [key,
      document.querySelector(`#task-${index}-${key}`).value]));
  }
  function targetId() { return /^[1-9][0-9]{0,8}$/.test(id.value) ? Number(id.value) : NaN; }
  async function action(fn) {
    if (busy) return;
    busy = true; controls.forEach(button => button.disabled = true);
    try { await fn(); }
    catch (error) { invalidate(); message(error.message + ' Les réponses locales restent intactes.'); }
    finally {
      busy = false; controls.forEach(button => button.disabled = false); confirm.disabled = pending === null;
    }
  }
  id.addEventListener('input', () => { invalidate(); loaded = null; preview.textContent = ''; });
  // Any login/logout invalidates both the preview and target data.
  window.addEventListener('artificial-auth-change', () => { invalidate(); loaded = null; preview.textContent = ''; });
  document.querySelector('#tasks').addEventListener('input', invalidate);
  window.addEventListener('hashchange', invalidate);
  panel.querySelector('#remote-identity').addEventListener('click', () => action(async () => {
    invalidate();
    const result = await api.identity();
    preview.textContent = JSON.stringify(result, null, 2);
    message(result.authenticatedAccessObserved
      ? 'Accès API authentifié constaté pour le profil configuré. Propriétaire de clé et permissions d’écriture non certifiés. La connexion PHP locale reste distincte.'
      : 'Accès API authentifié non confirmé. Aucune identité ou permission Omeka validée.');
  }));
  panel.querySelector('#remote-read').addEventListener('click', () => action(async () => {
    invalidate();
    loaded = await api.read(targetId());
    preview.textContent = JSON.stringify(loaded, null, 2);
    message('Ressource temporaire lue en direct via le backend. Aucun remplacement des réponses locales.');
  }));
  for (const button of panel.querySelectorAll('[data-remote-action]')) {
    button.addEventListener('click', () => action(async () => {
      invalidate();
      const action = button.dataset.remoteAction;
      const current = values();
      if (action === 'create') current.taskId = '6.c-TEST-' + crypto.randomUUID();
      if (action === 'update') {
        if (!loaded || loaded.itemId !== targetId()) throw Error('Lire d’abord la ressource temporaire autorisée.');
        current.taskId = loaded.values.taskId;
      }
      pending = await api.prepare(action, action === 'create' ? null : targetId(), current);
      preview.textContent = JSON.stringify({ operation: pending.preview, identityCheck: pending.identityCheck ?? null }, null, 2);
      message(`Aperçu de simulation uniquement. Saisir « ${pending.confirmation} » puis confirmer. Aucun Item n’est créé, modifié ou supprimé.`);
    }));
  }
  confirm.addEventListener('click', () => action(async () => {
    if (!pending) return;
    if (!window.confirm('Confirmer cette simulation ? Aucune écriture Omeka ne sera envoyée.')) return;
    await api.confirm(pending, confirmation.value);
    invalidate();
    message('Simulation validée par le backend : aucune écriture Omeka. Aucune ressource créée, modifiée ou supprimée.');
  }));
  message('Simulation uniquement avec un compte PHP local et une ressource temporaire attribuée. Authentification Omeka non intégrée.');
})();
