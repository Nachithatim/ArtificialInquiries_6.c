(() => {
  'use strict';
  const dialog = document.querySelector('#confirm-dialog');
  window.ArtificialUI = {
    confirm(message) {
      if (dialog.open) return Promise.resolve(false);
      document.querySelector('#confirm-message').textContent = message;
      dialog.returnValue = 'cancel';
      return new Promise(resolve => {
        dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
        dialog.showModal();
      });
    },
    preview(target, values) {
      const labels = ['Identifiant de la tâche', 'Adéquation de la tâche', 'Pertinence professionnelle', 'Résultat personnel recherché', 'Performance attendue', 'Niveau de confiance', 'Résultat acceptable', 'Échec', 'Réussite idéale'];
      const list = document.createElement('dl');
      Object.values(values).forEach((value, index) => {
        const term = document.createElement('dt'), description = document.createElement('dd');
        term.textContent = labels[index]; description.textContent = value;
        list.append(term, description);
      });
      target.replaceChildren(list); target.hidden = false;
    }
  };
})();
