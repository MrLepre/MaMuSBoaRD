/**
 * MaMuSBoaRD — Supabase bootstrap
 *
 * Inicializa o cliente antes dos módulos de Auth/Campanhas.
 * Mantém uma única instância global para evitar corrida de inicialização.
 */
(function (global) {
  'use strict';

  const SUPABASE_URL = 'https://rolrbrtpqbchyxmjmvzr.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_mJmJfELKk4O1HCTzoKxDdw_EWaiv4j1';

  function inicializar() {
    if (global.MAMUS_SUPABASE) return global.MAMUS_SUPABASE;
    if (!global.supabase?.createClient) {
      console.error('[MaMuS] Biblioteca Supabase não carregada.');
      return null;
    }

    try {
      global.MAMUS_SUPABASE = global.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      return global.MAMUS_SUPABASE;
    } catch (error) {
      console.error('[MaMuS] Erro ao criar cliente Supabase:', error);
      return null;
    }
  }

  global.MAMUS_SUPABASE_BOOT = Object.freeze({
    inicializar,
    url: SUPABASE_URL
  });

  inicializar();
})(window);
