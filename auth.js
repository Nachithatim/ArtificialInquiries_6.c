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
  let identity;
  const buttons = [...form.querySelectorAll('button'), logout];
  function show(data) {
    csrf = data.csrfToken || '';
    form.hidden = !!data.authenticated;
    // Inline display overrides hidden on the flex form.
    form.style.display = data.authenticated ? 'none' : 'grid';
    document.querySelector('#auth-welcome').hidden = !!data.authenticated;
    document.querySelector('#auth-account').hidden = !data.authenticated;
    document.querySelector('#auth-user').textContent = data.user || '';
    document.querySelector('#personal-crud').hidden = !data.authenticated;
    logout.hidden = !data.authenticated;
    status.textContent = '';
    const nextIdentity = data.authenticated ? data.user : null;
    if (identity !== nextIdentity) {
      identity = nextIdentity;
      window.dispatchEvent(new CustomEvent('artificial-auth-change', { detail: { authenticated: !!data.authenticated, user: data.user || null } }));
    }
  }
  async function request(path, body) {
    const response = await fetch(new URL(path, new URL(base, location.href)), {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include', cache: 'no-store',
      headers: body === undefined ? {} : {'Content-Type': 'application/json', 'X-CSRF-Token': csrf},
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(response.status === 401 ? 'Identifiant ou mot de passe incorrect.' : response.status === 429 ? 'Trop de tentatives. Veuillez réessayer dans quelques minutes.' : 'La connexion est momentanément indisponible. Veuillez réessayer.');
      error.status = response.status; throw error;
    }
    return data;
  }
  async function action(fn) {
    if (busy) return;
    busy = true; panel.setAttribute('aria-busy', 'true'); status.textContent = '';
    document.querySelector('#auth-submit-label').textContent = 'Connexion en cours…';
    buttons.forEach(b => b.disabled = true);
    try { await fn(); }
    catch (error) { status.dataset.kind = 'error'; status.textContent = error.message === 'Le navigateur ne conserve pas le cookie de session' ? 'Votre connexion ne peut pas être conservée. Autorisez les cookies pour ce site, puis réessayez.' : error.status ? error.message : 'La connexion est momentanément indisponible. Veuillez réessayer.'; }
    finally { panel.setAttribute('aria-busy', 'false'); document.querySelector('#auth-submit-label').textContent = 'Se connecter'; busy = false; buttons.forEach(b => b.disabled = false); }
  }
  if (!base) {
    status.textContent = 'La connexion est momentanément indisponible. Vous pouvez explorer les quatre tâches.';
    buttons.forEach(b => b.disabled = true);
    form.querySelectorAll('input').forEach(input => input.disabled = true);
    return;
  }
  const target = new URL(base, location.href);
  if (target.protocol !== 'https:' && !(local && target.origin === location.origin)) {
    status.textContent = 'La connexion est momentanément indisponible.';
    buttons.forEach(b => b.disabled = true); return;
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    action(async () => {
      show(await request('session.php'));
      const data = await request('login.php', {username: form.elements.username.value, password: form.elements.password.value});
      form.elements.password.value = '';
      form.elements.password.type = 'password';
      document.querySelector('#auth-toggle').setAttribute('aria-pressed', 'false');
      document.querySelector('#auth-toggle').setAttribute('aria-label', 'Afficher le mot de passe');
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
  async function checkSession(expired = false) {
    const wasAuthenticated = identity != null;
    const session = await request('session.php');
    show(session);
    if (expired && !session.authenticated && (wasAuthenticated || expired === 'forced')) status.textContent = 'Votre session a expiré. Reconnectez-vous pour gérer vos réponses. Vos brouillons sont conservés.';
  }
  window.addEventListener('artificial-session-expired', () => action(() => checkSession('forced')));
  window.addEventListener('focus', () => { if (!busy) action(() => checkSession(true)); });
  document.querySelector('#auth-toggle').addEventListener('click', () => {
    const password = form.elements.password, toggle = document.querySelector('#auth-toggle');
    const visible = password.type === 'password'; password.type = visible ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.setAttribute('aria-label', visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
  });
  action(async () => show(await request('session.php')));
})();
