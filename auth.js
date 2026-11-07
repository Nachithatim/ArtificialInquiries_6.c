(() => {
  'use strict';
  const panel = document.querySelector('#auth-panel');
  if (!panel) return;
  const status = document.querySelector('#auth-status');
  const form = document.querySelector('#auth-form');
  // Never allow a native GET submission to put even local passwords in a URL.
  form.addEventListener('submit', event => event.preventDefault());
  const logout = document.querySelector('#auth-logout');
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const base = window.ARTIFICIAL_AUTH_BASE || (local ? '/artificial-auth/' : '');
  let csrf = '';
  let busy = false;
  const buttons = [...form.querySelectorAll('button'), logout];
  function show(data) {
    csrf = data.csrfToken || '';
    form.hidden = !!data.authenticated;
    // Inline display overrides hidden on the flex form.
    form.style.display = data.authenticated ? 'none' : 'flex';
    logout.hidden = !data.authenticated;
    status.textContent = data.authenticated
      ? `Compte PHP local : ${data.user}. Identité Omeka non vérifiée par cette connexion. Les opérations Omeka utilisent les droits du backend.`
      : 'Aucun compte PHP local connecté. Cette connexion est distincte d’Omeka.';
    window.dispatchEvent(new CustomEvent('artificial-auth-change', { detail: { authenticated: !!data.authenticated, user: data.user || null } }));
  }
  async function request(path, body) {
    const response = await fetch(new URL(path, new URL(base, location.href)), {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include', cache: 'no-store',
      headers: body === undefined ? {} : {'Content-Type': 'application/json', 'X-CSRF-Token': csrf},
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Erreur HTTP ${response.status}`);
    return data;
  }
  async function action(fn) {
    if (busy) return;
    busy = true; buttons.forEach(b => b.disabled = true);
    try { await fn(); }
    catch (error) { status.textContent = `Connexion indisponible : ${error.message}. Vérifiez HTTPS et les cookies du navigateur.`; }
    finally { busy = false; buttons.forEach(b => b.disabled = false); }
  }
  if (!base) {
    status.textContent = 'Le service de connexion public doit être configuré. Le CRUD local et la lecture Omeka S restent disponibles.';
    buttons.forEach(b => b.disabled = true);
    form.querySelectorAll('input').forEach(input => input.disabled = true);
    return;
  }
  const target = new URL(base, location.href);
  if (target.protocol !== 'https:' && !(local && target.origin === location.origin)) {
    status.textContent = 'Une adresse HTTPS est requise pour le service de connexion.';
    buttons.forEach(b => b.disabled = true); return;
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    action(async () => {
      show(await request('session.php'));
      const data = await request('login.php', {username: form.elements.username.value, password: form.elements.password.value});
      form.elements.password.value = '';
      // Re-read session: detect blocked cookies rather than displaying a false logged-in state.
      const session = await request('session.php');
      if (!session.authenticated) throw new Error('Le navigateur ne conserve pas le cookie de session');
      show(session);
    });
  });
  logout.addEventListener('click', () => action(async () => {
    await request('logout.php', {});
    show(await request('session.php'));
  }));
  window.addEventListener('artificial-session-expired', () => action(async () => show(await request('session.php'))));
  action(async () => show(await request('session.php')));
})();
