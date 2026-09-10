/**
 * MaMuSBoaRD - Bootstrap de transição
 *
 * Este arquivo NÃO substitui o bootstrap legado ainda.
 * Ele prepara o contrato mínimo para que app.js possa ser desmontado
 * gradualmente sem alterar o comportamento da aplicação.
 */
(function (global, document) {
  'use strict';

  const state = global.MAMUS_STATE;
  const api = global.MAMUS_STATE_API;

  if (!state || !api) {
    console.error('[MaMuS] Core state não carregado.');
    return;
  }

  function markBootStarted() {
    state.app.initialized = true;
    state.app.bootedAt = new Date().toISOString();
  }

  function syncUiTab(tab) {
    if (typeof tab === 'string' && tab) {
      api.set('ui.currentTab', tab);
    }
  }

  global.MAMUS_CORE = Object.freeze({
    state,
    get: api.get,
    set: api.set,
    reset: api.reset,
    markBootStarted,
    syncUiTab
  });

  // O bootstrap legado continua sendo responsável pela inicialização real.
  // Aqui apenas registramos que o Core está disponível antes dele.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markBootStarted, { once: true });
  } else {
    markBootStarted();
  }
})(window, document);
