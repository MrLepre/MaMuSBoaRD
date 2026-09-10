/**
 * MaMuSBoaRD - Estado central da aplicação
 *
 * Marco 1 da refatoração arquitetural.
 *
 * IMPORTANTE:
 * - Este estado começa como uma camada de transição.
 * - O código legado de app.js continua funcionando.
 * - Não mover regras de negócio para este arquivo.
 * - A migração das variáveis legadas acontecerá por domínio, em etapas.
 */
(function (global) {
  'use strict';

  const existing = global.MAMUS_STATE;

  const state = existing || {
    app: {
      version: 'marco-1-core-state-v1',
      initialized: false,
      bootedAt: null
    },

    auth: {
      user: null,
      session: null
    },

    campaign: {
      current: null,
      available: [],
      memberIds: []
    },

    system: {
      current: null
    },

    character: {
      current: null,
      editingUserId: null,
      saveStatus: 'sem_ficha',
      lastSavedAt: null
    },

    session: {
      current: null,
      diary: null,
      campaigns: []
    },

    ui: {
      currentTab: 'inicio',
      sidebarCollapsed: false,
      immersiveMap: false
    },

    realtime: {
      connected: false,
      channel: null
    }
  };

  function set(path, value) {
    const parts = String(path).split('.');
    let target = state;

    for (let i = 0; i < parts.length - 1; i += 1) {
      if (!target[parts[i]] || typeof target[parts[i]] !== 'object') {
        target[parts[i]] = {};
      }
      target = target[parts[i]];
    }

    target[parts[parts.length - 1]] = value;
    return value;
  }

  function get(path, fallback = undefined) {
    const parts = String(path).split('.');
    let value = state;

    for (const part of parts) {
      if (value == null || !(part in value)) return fallback;
      value = value[part];
    }

    return value;
  }

  function reset() {
    state.auth.user = null;
    state.auth.session = null;
    state.campaign.current = null;
    state.campaign.available = [];
    state.campaign.memberIds = [];
    state.system.current = null;
    state.character.current = null;
    state.character.editingUserId = null;
    state.character.saveStatus = 'sem_ficha';
    state.character.lastSavedAt = null;
    state.session.current = null;
    state.session.diary = null;
    state.session.campaigns = [];
    state.realtime.connected = false;
    state.realtime.channel = null;
  }

  global.MAMUS_STATE = state;
  global.MAMUS_STATE_API = Object.freeze({
    get,
    set,
    reset
  });
})(window);
