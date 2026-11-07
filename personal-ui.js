(() => {
  'use strict';
  const panel = document.querySelector('#personal-crud');
  if (!panel) return;
  const select = panel.querySelector('#personal-item');
  const status = panel.querySelector('#personal-status');
  const preview = panel.querySelector('#personal-preview');
  const buttons = Object.fromEntries(['refresh', 'create', 'read', 'update', 'delete'].map(action =>
    [action, panel.querySelector('#personal-' + action)]));
  let api, authenticated = false, busy = false, generation = 0, listRevision = 0, loaded = null;
  function message(text) { status.textContent = text; }
  function index() { return /^#task-[1-4]$/.test(location.hash) ? Number(location.hash.slice(-1)) - 1 : 0; }
  function values(taskIndex = index()) {
    return Object.fromEntries(Object.keys(ArtificialPersonalOmeka.fields).map(key =>
      [key, document.querySelector(`#task-${taskIndex + 1}-${key}`).value]));
  }
  function controls() {
    const disabled = busy || !authenticated;
    select.disabled = disabled;
    for (const button of Object.values(buttons)) button.disabled = disabled;
    buttons.read.disabled ||= !select.value;
    buttons.delete.disabled ||= !select.value;
    buttons.update.disabled ||= !loaded || loaded.itemId !== Number(select.value) || loaded.index !== index();
  }
  function clearPreview() { preview.textContent = ''; preview.hidden = true; loaded = null; }
  function setItems(ids, selected = select.value) {
    select.replaceChildren(new Option('Choisir une réponse', ''));
    for (const id of ids) select.add(new Option('Réponse Omeka #' + id, String(id)));
    if (ids.includes(Number(selected))) select.value = String(selected);
    controls();
  }
  async function refresh(selected) {
    const epoch = generation, revision = ++listRevision;
    const ids = await api.list();
    if (epoch !== generation || revision !== listRevision) return;
    setItems(ids, selected);
    if (loaded && !ids.includes(loaded.itemId)) clearPreview();
    return ids;
  }
  async function action(fn) {
    if (busy || !authenticated) return;
    const epoch = generation;
    busy = true; controls();
    try { await fn(epoch); }
    catch (error) {
      if (epoch !== generation) return;
      if (error.status === 401) {
        authenticated = false; clearPreview(); setItems([]);
        window.dispatchEvent(new CustomEvent('artificial-session-expired'));
      }
      message(error.message + ' Les données de la grille sont conservées.');
    } finally { busy = false; controls(); }
  }
  try { api = ArtificialPersonalOmeka.client(window.ARTIFICIAL_AUTH_BASE); }
  catch (error) { message(error.message); return; }
  function authenticationChanged(state) {
    generation++; clearPreview(); setItems([]);
    authenticated = state?.authenticated === true;
    controls();
    if (!authenticated) { message('Connectez-vous avec le compte PHP fourni pour l’exercice.'); return; }
    const epoch = generation;
    refresh().then(ids => {
      if (epoch === generation && ids) message(`${ids.length} réponse(s) sur votre Omeka personnel. Renseignez la tâche affichée puis cliquez sur « Créer dans Omeka ».`);
    }).catch(error => { if (epoch === generation) message(error.message); });
  }
  window.addEventListener('artificial-auth-change', event => authenticationChanged(event.detail));
  // External scripts can finish downloading after auth.js has emitted its first event.
  api.session().then(state => { if (generation === 0) authenticationChanged(state); })
    .catch(error => { if (generation === 0) message(error.message); });
  select.addEventListener('change', () => { clearPreview(); controls(); });
  window.addEventListener('hashchange', controls);
  buttons.refresh.addEventListener('click', () => action(async epoch => {
    const ids = await refresh();
    if (epoch === generation && ids) message(`${ids.length} réponse(s). Liste actualisée.`);
  }));
  buttons.create.addEventListener('click', () => action(async epoch => {
    const taskIndex = index();
    const input = ArtificialPersonalOmeka.values(values(taskIndex));
    if (!window.confirm(`Créer une nouvelle réponse sur votre Omeka personnel à partir de la tâche ${taskIndex + 1} ?`)) return;
    const result = await api.create(input);
    if (epoch !== generation) return;
    listRevision++;
    clearPreview();
    const ids = [...select.options].map(option => Number(option.value)).filter(id => id > 1);
    setItems([...new Set([...ids, result.itemId])], result.itemId);
    message(`Réponse #${result.itemId} créée sur votre Omeka personnel. Cliquez sur « Consulter » pour la charger et la modifier.`);
  }));
  buttons.read.addEventListener('click', () => action(async epoch => {
    const id = Number(select.value), taskIndex = index();
    const result = await api.read(id);
    if (epoch !== generation) return;
    preview.textContent = JSON.stringify(result.values, null, 2); preview.hidden = false;
    // Confirm after reading so that edits made during the request are considered too.
    if (Object.values(values(taskIndex)).some(value => value !== '') &&
        !window.confirm(`Charger la réponse #${id} dans la tâche ${taskIndex + 1} et remplacer sa saisie locale ?`)) {
      message(`Réponse #${id} consultée dans l’aperçu. La grille est conservée.`); return;
    }
    window.dispatchEvent(new CustomEvent('artificial-personal-read', { detail: { index: taskIndex, values: result.values } }));
    loaded = { itemId: id, index: taskIndex };
    message(`Réponse #${id} chargée dans la tâche ${taskIndex + 1}. Modifiez les champs puis cliquez sur « Modifier dans Omeka ».`);
  }));
  buttons.update.addEventListener('click', () => action(async epoch => {
    const id = Number(select.value);
    if (!loaded || loaded.itemId !== id || loaded.index !== index()) throw Error('Consultez cette réponse dans la tâche affichée avant de la modifier.');
    const input = ArtificialPersonalOmeka.values(values());
    if (!window.confirm(`Enregistrer les modifications de la réponse #${id} sur votre Omeka personnel ?`)) return;
    await api.update(id, input);
    if (epoch !== generation) return;
    preview.textContent = JSON.stringify(input, null, 2); preview.hidden = false;
    message(`Réponse #${id} modifiée sur votre Omeka personnel.`);
  }));
  buttons.delete.addEventListener('click', () => action(async epoch => {
    const id = Number(select.value);
    if (!window.confirm(`Supprimer définitivement la réponse #${id} de votre Omeka personnel ? La grille locale sera conservée.`)) return;
    await api.delete(id);
    if (epoch !== generation) return;
    listRevision++;
    clearPreview();
    setItems([...select.options].map(option => Number(option.value)).filter(value => value > 1 && value !== id), '');
    message(`Réponse #${id} supprimée de votre Omeka personnel. La grille locale est conservée.`);
  }));
  controls();
})();
