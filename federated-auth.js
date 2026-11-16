(() => {
  'use strict';
  const form = document.querySelector('#auth-form');
  if (!form) return;
  const status = document.querySelector('#auth-status');
  const labels = { github: 'GitHub', google: 'Google', omeka: 'Omeka S', cas: 'Université' };
  const base = window.ARTIFICIAL_AUTH_BASE;
  if (base !== 'https://nachit.alwaysdata.net/artificial-api/') return;
  const group = document.createElement('div');
  group.className = 'federated-methods'; group.hidden = true;
  group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Autres méthodes de connexion');
  form.after(group);
  let authenticated = false, busy = false;
  window.addEventListener('artificial-auth-change', event => {
    authenticated = event.detail?.authenticated === true;
    group.hidden = authenticated || !group.childElementCount;
  });
  const message = text => { status.dataset.kind = 'error'; status.textContent = text; };
  async function request(path, options = {}) {
    const response = await fetch(new URL(path, base), { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(20000), ...options });
    if (!response.ok) throw new Error('Unavailable');
    return response.json();
  }
  const failure = location.hash === '#auth-failed';
  const success = location.hash === '#auth-success';
  if (failure || success) {
    history.replaceState(null, '', location.pathname + location.search);
    // Wait for the original auth script to finish its session check.
    const settle = async () => {
      try {
        const session = await request('session.php');
        if (failure) message('La connexion n’a pas abouti ou ce compte n’est pas encore autorisé. Vous pouvez utiliser votre identifiant habituel.');
        else if (!session.authenticated) message('Votre connexion n’a pas pu être conservée. Autorisez les cookies pour ce site, puis réessayez.');
      } catch { message('La connexion est momentanément indisponible. Veuillez réessayer.'); }
    };
    if (document.querySelector('#auth-panel').getAttribute('aria-busy') === 'true') {
      const observer = new MutationObserver(() => {
        if (document.querySelector('#auth-panel').getAttribute('aria-busy') === 'false') { observer.disconnect(); settle(); }
      });
      observer.observe(document.querySelector('#auth-panel'), { attributes: true, attributeFilter: ['aria-busy'] });
    } else settle();
  }
  request('auth-providers.php').then(async data => {
    const session = await request('session.php');
    authenticated = session.authenticated === true;
    if (!Array.isArray(data.providers)) return;
    for (const id of [...new Set(data.providers.map(provider => provider.id))]) {
      if (!Object.hasOwn(labels, id)) continue;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'secondary';
      button.textContent = `Continuer avec ${labels[id]}`;
      button.addEventListener('click', async () => {
        if (busy || authenticated) return;
        busy = true; group.setAttribute('aria-busy', 'true');
        for (const child of group.children) child.disabled = true;
        const original = button.textContent; button.textContent = 'Redirection en cours…';
        try {
          const state = await request('session.php');
          if (state.authenticated) throw new Error('Already authenticated');
          const result = await request('auth-start.php', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrfToken }, body: JSON.stringify({provider: id}) });
          const url = new URL(result.authorizationUrl);
          if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid URL');
          location.assign(url.href);
        } catch { message('Cette méthode de connexion est momentanément indisponible. Utilisez votre identifiant habituel.'); }
        finally { busy = false; group.setAttribute('aria-busy', 'false'); button.textContent = original; for (const child of group.children) child.disabled = false; }
      });
      group.append(button);
    }
    group.hidden = authenticated || !group.childElementCount;
  }).catch(() => { group.hidden = true; });
})();
